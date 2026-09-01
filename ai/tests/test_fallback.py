import pytest

from app.llm import Decision, DeciderUnavailable, FallbackDecider, MissingApiKey, OfflineDecider, build_decider
from app.models import CartLine

from .conftest import FakeDecider


class Exploding:
    def __init__(self, error: Exception):
        self._error = error
        self.calls = 0

    def __call__(self, mandate, entries, items, instruction) -> Decision:
        self.calls += 1
        raise self._error


def entries_for(catalog_id: int):
    from app.models import RestockEntry

    return [RestockEntry(id=1, catalog_id=catalog_id, catalog_name=None)]


def test_gemini_gets_an_offline_fallback_by_default():
    decider = build_decider("gemini", "key", "m", 100)
    assert isinstance(decider, FallbackDecider)

    bare = build_decider("gemini", "key", "m", 100, fallback_offline=False)
    assert not isinstance(bare, FallbackDecider)


def test_an_unavailable_model_falls_back_and_says_so(mandate, catalog):
    primary = Exploding(DeciderUnavailable("429 RESOURCE_EXHAUSTED"))
    decider = FallbackDecider(primary, OfflineDecider())

    decision = decider(mandate, entries_for(1), catalog, "restock")

    assert primary.calls == 1
    assert decision.lines == [CartLine(catalog_id=1, quantity=1)]
    assert decision.degraded == "429 RESOURCE_EXHAUSTED"


def test_a_missing_key_also_falls_back(mandate, catalog):
    decider = FallbackDecider(Exploding(MissingApiKey("no key")), OfflineDecider())

    decision = decider(mandate, entries_for(1), catalog, "restock")

    assert decision.degraded == "no key"
    assert decision.lines


def test_a_healthy_model_is_left_alone(mandate, catalog):
    primary = FakeDecider([CartLine(catalog_id=10, quantity=3)])
    decider = FallbackDecider(primary, OfflineDecider())

    decision = decider(mandate, entries_for(1), catalog, "restock")

    assert decision.lines == [CartLine(catalog_id=10, quantity=3)]
    assert decision.degraded is None


def test_an_unexpected_error_is_not_swallowed(mandate, catalog):
    decider = FallbackDecider(Exploding(RuntimeError("bug")), OfflineDecider())

    with pytest.raises(RuntimeError):
        decider(mandate, entries_for(1), catalog, "restock")
