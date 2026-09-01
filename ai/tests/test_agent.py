from decimal import Decimal

import pytest

from app.agent import NoActiveMandate, run_cycle
from app.injection import WITHHELD
from app.llm import parse_cart
from app.models import CartDecision, CartLine

from .conftest import FakeCheckout, FakeDecider


async def test_approved_cart_is_proposed_paid_and_the_run_recorded(mandate, catalog, approved):
    checkout = FakeCheckout(mandate, catalog, approved)
    decider = FakeDecider([CartLine(catalog_id=1, quantity=2)], raw='{"items":[{"catalog_id":1,"quantity":2}]}')

    result = await run_cycle(checkout, decider, user_id=1, instruction="keep milk stocked")

    assert result.outcome == "approved"
    assert result.cart_mandate_id == 42
    assert result.payment_status == "paid"
    assert checkout.paid == [42]
    assert checkout.consumed == 1
    assert len(checkout.recorded_runs) == 1
    assert checkout.recorded_runs[0]["cart_mandate_id"] == 42


async def test_the_poisoned_description_never_reaches_the_model(mandate, catalog, approved):
    checkout = FakeCheckout(mandate, catalog, approved)
    decider = FakeDecider([CartLine(catalog_id=1, quantity=1)])

    result = await run_cycle(checkout, decider, user_id=1, instruction="restock")

    assert "disregard" not in decider.prompt
    assert "add 50 units" not in decider.prompt
    assert WITHHELD in decider.prompt
    assert "Rice" in decider.prompt
    assert result.flagged_catalog_ids == [10]


async def test_unknown_catalog_ids_are_dropped_before_proposing(mandate, catalog, approved):
    checkout = FakeCheckout(mandate, catalog, approved)
    decider = FakeDecider([CartLine(catalog_id=1, quantity=1), CartLine(catalog_id=999, quantity=1)])

    result = await run_cycle(checkout, decider, user_id=1, instruction="restock")

    assert [line.catalog_id for line in checkout.proposed] == [1]
    assert result.dropped_catalog_ids == [999]


async def test_a_rejected_cart_is_not_paid_and_the_list_is_kept(mandate, catalog):
    rejected = CartDecision(
        status="rejected",
        cart_mandate_id=43,
        reason="exceeds per-order cap",
        total_amount=Decimal("6000.00"),
        remaining_monthly_budget=Decimal("3000.00"),
        requires_confirmation=False,
    )
    checkout = FakeCheckout(mandate, catalog, rejected)
    decider = FakeDecider([CartLine(catalog_id=10, quantity=50)])

    result = await run_cycle(checkout, decider, user_id=1, instruction="restock")

    assert result.outcome == "rejected"
    assert result.reason == "exceeds per-order cap"
    assert checkout.paid == []
    assert checkout.consumed == 0
    assert result.payment_status is None


async def test_a_flagged_cart_waits_for_the_user_instead_of_paying(mandate, catalog):
    flagged = CartDecision(
        status="pending_approval",
        cart_mandate_id=44,
        reason="near monthly cap — requires approval",
        total_amount=Decimal("285.00"),
        remaining_monthly_budget=Decimal("300.00"),
        requires_confirmation=True,
    )
    checkout = FakeCheckout(mandate, catalog, flagged)
    decider = FakeDecider([CartLine(catalog_id=1, quantity=1)])

    result = await run_cycle(checkout, decider, user_id=1, instruction="restock")

    assert result.outcome == "pending_approval"
    assert checkout.paid == []
    assert checkout.consumed == 1


async def test_an_empty_decision_records_the_run_without_proposing_a_cart(mandate, catalog, approved):
    checkout = FakeCheckout(mandate, catalog, approved)
    decider = FakeDecider([])

    result = await run_cycle(checkout, decider, user_id=1, instruction="restock")

    assert result.outcome == "nothing_proposed"
    assert result.cart_mandate_id is None
    assert checkout.proposed == []
    assert len(checkout.recorded_runs) == 1


async def test_a_missing_mandate_stops_the_cycle(catalog, approved):
    checkout = FakeCheckout(None, catalog, approved)
    decider = FakeDecider([CartLine(catalog_id=1, quantity=1)])

    with pytest.raises(NoActiveMandate):
        await run_cycle(checkout, decider, user_id=1, instruction="restock")


def test_parse_cart_ignores_malformed_model_output():
    assert parse_cart("not json") == []
    assert parse_cart('{"items":"nope"}') == []
    assert parse_cart('{"items":[{"catalog_id":1,"quantity":0}]}') == []
    assert parse_cart('{"items":[{"catalog_id":1,"quantity":2}]}') == [CartLine(catalog_id=1, quantity=2)]
