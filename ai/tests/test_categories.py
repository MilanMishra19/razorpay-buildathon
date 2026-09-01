from decimal import Decimal

import pytest

from app.agent import NoActiveMandate, run_all
from app.models import CartDecision, CartLine, CatalogItem, Mandate, RestockEntry

class BuysWhateverItIsShown:
    """Picks one of each item in the catalog slice it receives, like a compliant agent."""

    def __init__(self):
        self.seen_categories: list[str] = []

    def __call__(self, mandate, entries, items, instruction):
        from app.llm import Decision

        self.seen_categories.append(mandate.category)
        lines = [CartLine(catalog_id=item.id, quantity=1) for item in items]
        return Decision(lines, f"prompt for {mandate.category}", "{}")


def mandate_for(category: str, mandate_id: int) -> Mandate:
    return Mandate(
        id=mandate_id,
        category=category,
        standing_instruction=None,
        per_order_cap=Decimal("500.00"),
        monthly_cap=Decimal("3000.00"),
        escalation_threshold_pct=Decimal("90.00"),
        spent_this_period=Decimal("0.00"),
        remaining_monthly_budget=Decimal("3000.00"),
        status="active",
    )


def item(item_id: int, category: str) -> CatalogItem:
    return CatalogItem(
        id=item_id,
        name=f"Item {item_id}",
        category=category,
        price=Decimal("50.00"),
        stock_status="in_stock",
        description="A product.",
    )


class MultiCategoryCheckout:
    def __init__(self, mandates, catalog, entries):
        self._mandates = mandates
        self._catalog = catalog
        self._entries = entries
        self.proposals: list[tuple[int, list[CartLine]]] = []
        self.consumed: list[list[int]] = []
        self.catalog_requests: list[str] = []

    async def active_mandates(self, user_id):
        return self._mandates

    async def catalog(self, user_id, category):
        self.catalog_requests.append(category)
        return [row for row in self._catalog if row.category == category]

    async def restock_list(self, user_id):
        return self._entries

    async def consume_restock(self, user_id, catalog_ids=None):
        self.consumed.append(catalog_ids or [])
        return catalog_ids or []

    async def propose_cart(self, user_id, mandate_id, lines):
        self.proposals.append((mandate_id, lines))
        return CartDecision(
            status="approved",
            cart_mandate_id=100 + mandate_id,
            reason=None,
            total_amount=Decimal("50.00"),
            remaining_monthly_budget=Decimal("2950.00"),
            requires_confirmation=False,
        )

    async def pay(self, user_id, cart_mandate_id):
        return {"payment_status": "paid"}

    async def record_run(self, user_id, payload):
        return 1


def build(entries):
    mandates = [mandate_for("groceries", 1), mandate_for("household", 2)]
    catalog = [item(10, "groceries"), item(20, "household")]
    return MultiCategoryCheckout(mandates, catalog, entries)


async def test_each_category_gets_its_own_cycle_and_its_own_mandate():
    checkout = build(
        [
            RestockEntry(id=1, catalog_id=10, catalog_name="Milk", catalog_category="groceries"),
            RestockEntry(id=2, catalog_id=20, catalog_name="Soap", catalog_category="household"),
        ]
    )
    decider = BuysWhateverItIsShown()

    report = await run_all(checkout, decider, user_id=1, fallback_instruction="restock")

    assert [run.category for run in report.runs] == ["groceries", "household"]
    assert [mandate_id for mandate_id, _ in checkout.proposals] == [1, 2]
    assert checkout.catalog_requests == ["groceries", "household"]


async def test_a_category_with_nothing_queued_is_skipped_not_run():
    checkout = build([RestockEntry(id=1, catalog_id=10, catalog_name="Milk", catalog_category="groceries")])
    decider = BuysWhateverItIsShown()

    report = await run_all(checkout, decider, user_id=1, fallback_instruction="restock")

    assert [run.category for run in report.runs] == ["groceries"]
    assert report.skipped == {"household": "nothing queued for this category"}


async def test_consuming_the_queue_only_clears_that_category():
    checkout = build(
        [
            RestockEntry(id=1, catalog_id=10, catalog_name="Milk", catalog_category="groceries"),
            RestockEntry(id=2, catalog_id=20, catalog_name="Soap", catalog_category="household"),
        ]
    )
    decider = BuysWhateverItIsShown()

    await run_all(checkout, decider, user_id=1, fallback_instruction="restock")

    assert checkout.consumed == [[10], [20]]


async def test_a_category_filter_runs_only_that_one():
    checkout = build(
        [
            RestockEntry(id=1, catalog_id=10, catalog_name="Milk", catalog_category="groceries"),
            RestockEntry(id=2, catalog_id=20, catalog_name="Soap", catalog_category="household"),
        ]
    )
    decider = BuysWhateverItIsShown()

    report = await run_all(checkout, decider, user_id=1, fallback_instruction="restock", category="household")

    assert [run.category for run in report.runs] == ["household"]
    assert [mandate_id for mandate_id, _ in checkout.proposals] == [2]


async def test_an_unknown_category_is_an_error_not_a_silent_no_op():
    checkout = build([])
    decider = BuysWhateverItIsShown()

    with pytest.raises(NoActiveMandate):
        await run_all(checkout, decider, user_id=1, fallback_instruction="restock", category="electronics")
