from app.agent import run_all
from app.models import CartLine

from .conftest import FakeCheckout, FakeDecider, one


async def test_the_mandate_instruction_wins_over_the_request_default(mandate, catalog, approved):
    speaking = mandate.model_copy(update={"standing_instruction": "only ever buy milk, nothing else"})
    checkout = FakeCheckout(speaking, catalog, approved)
    decider = FakeDecider([CartLine(catalog_id=1, quantity=1)])

    result = one(await run_all(checkout, decider, user_id=1, fallback_instruction="a default nobody wrote"))

    assert "only ever buy milk, nothing else" in decider.prompt
    assert "a default nobody wrote" not in decider.prompt
    assert result.instruction_used == "only ever buy milk, nothing else"


async def test_the_caller_instruction_is_used_when_the_mandate_is_silent(mandate, catalog, approved):
    checkout = FakeCheckout(mandate, catalog, approved)
    decider = FakeDecider([CartLine(catalog_id=1, quantity=1)])

    result = one(await run_all(checkout, decider, user_id=1, fallback_instruction="keep bread stocked"))

    assert "keep bread stocked" in decider.prompt
    assert result.instruction_used == "keep bread stocked"
