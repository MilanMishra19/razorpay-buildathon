from decimal import Decimal

import pytest

from app.llm import (
    DeciderUnavailable,
    GeminiDecider,
    MissingApiKey,
    OfflineDecider,
    build_decider,
    is_transient,
    parse_cart,
)
from app.models import CartLine, CatalogItem, RestockEntry


def entries(*catalog_ids: int) -> list[RestockEntry]:
    return [RestockEntry(id=i, catalog_id=cid, catalog_name=None) for i, cid in enumerate(catalog_ids, 1)]


def test_build_decider_selects_by_provider():
    assert isinstance(build_decider("offline", None, "m", 100), OfflineDecider)
    assert isinstance(build_decider("gemini", "key", "m", 100), GeminiDecider)
    with pytest.raises(ValueError):
        build_decider("nope", None, "m", 100)


def test_gemini_decider_refuses_to_run_without_a_key(mandate, catalog):
    decider = build_decider("gemini", None, "gemini-3.5-flash", 100)
    with pytest.raises(MissingApiKey):
        decider(mandate, entries(1), catalog, "restock")


def test_offline_decider_buys_one_of_each_listed_item(mandate, catalog):
    decision = OfflineDecider()(mandate, entries(1, 10), catalog, "restock")

    assert decision.lines == [CartLine(catalog_id=1, quantity=1), CartLine(catalog_id=10, quantity=1)]
    assert "[offline decider: no model was called]" in decision.prompt
    assert parse_cart(decision.raw_response) == decision.lines


def test_offline_decider_skips_out_of_stock_items(mandate):
    out_of_stock = CatalogItem(
        id=8,
        name="Tea",
        category="groceries",
        price=Decimal("140.00"),
        stock_status="out_of_stock",
        description="Black tea leaves.",
    )

    decision = OfflineDecider()(mandate, entries(8), [out_of_stock], "restock")

    assert decision.lines == []


def test_offline_decider_stops_at_the_tighter_of_the_two_caps(mandate, catalog):
    tight = mandate.model_copy(update={"per_order_cap": Decimal("100.00")})

    decision = OfflineDecider()(tight, entries(1, 10), catalog, "restock")

    assert decision.lines == [CartLine(catalog_id=1, quantity=1)]


def test_transient_errors_are_recognised():
    assert is_transient(Exception("503 UNAVAILABLE"))
    assert is_transient(Exception("429 RESOURCE_EXHAUSTED"))
    assert not is_transient(Exception("404 NOT_FOUND"))


class FailingClient:
    def __init__(self, error: Exception):
        self._error = error
        self.calls = 0
        self.models = self

    def generate_content(self, **kwargs):
        self.calls += 1
        raise self._error


def test_a_hard_failure_is_wrapped_and_not_retried():
    decider = GeminiDecider("key", "gemini-3.5-flash", 100, attempts=3)
    client = FailingClient(RuntimeError("404 NOT_FOUND"))

    with pytest.raises(DeciderUnavailable):
        decider._generate(client, "content", None)

    assert client.calls == 1


def test_a_transient_failure_is_retried_then_wrapped():
    decider = GeminiDecider("key", "gemini-3.5-flash", 100, attempts=2)
    client = FailingClient(RuntimeError("503 UNAVAILABLE"))

    with pytest.raises(DeciderUnavailable):
        decider._generate(client, "content", None)

    assert client.calls == 2
