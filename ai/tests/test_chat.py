import json
from decimal import Decimal

from app.chat import (
    describe_policy,
    describe_proposal,
    describe_spend,
    extract_intent,
    propose_mandate,
)
from app.models import Mandate


class ScriptedDecider:
    def __init__(self, raw: str) -> None:
        self.raw = raw
        self.seen: list[str] = []

    def classify(self, system: str, message: str, schema: dict) -> str:
        self.seen.append(message)
        return self.raw


def mandate(category: str = "groceries", spent: str = "250.00") -> Mandate:
    return Mandate(
        id=1,
        category=category,
        standing_instruction=None,
        per_order_cap=Decimal("500.00"),
        monthly_cap=Decimal("3000.00"),
        escalation_threshold_pct=Decimal("90.00"),
        spent_this_period=Decimal(spent),
        remaining_monthly_budget=Decimal("3000.00") - Decimal(spent),
        status="active",
    )


class TestIntentExtraction:
    def test_it_reads_a_structured_intent(self):
        decider = ScriptedDecider(json.dumps({"intent": "run_cycle", "category": "household"}))

        intent = extract_intent(decider, "run my household cycle")

        assert intent["intent"] == "run_cycle"
        assert intent["category"] == "household"

    def test_garbage_is_unknown_rather_than_a_guess(self):
        assert extract_intent(ScriptedDecider("not json at all"), "hi")["intent"] == "unknown"

    def test_a_json_array_is_not_mistaken_for_an_intent(self):
        assert extract_intent(ScriptedDecider("[1, 2, 3]"), "hi")["intent"] == "unknown"


class TestMandateProposal:
    def test_it_carries_the_limits_the_user_actually_stated(self):
        intent = {
            "intent": "create_mandate",
            "category": "household",
            "instruction": "keep the cleaning stuff stocked",
            "per_order_cap": 600,
            "monthly_cap": 4000,
            "escalation_threshold_pct": 80,
        }

        proposal = propose_mandate(intent, ["groceries", "household"], "fallback")

        assert proposal.category == "household"
        assert proposal.per_order_cap == 600
        assert proposal.monthly_cap == 4000
        assert proposal.escalation_threshold_pct == 80
        assert proposal.standing_instruction == "keep the cleaning stuff stocked"

    def test_an_unknown_category_falls_back_to_a_real_one(self):
        intent = {"intent": "create_mandate", "category": "spaceships"}

        proposal = propose_mandate(intent, ["groceries", "household"], "fallback")

        assert proposal.category in ("groceries", "household")

    def test_the_proposal_says_plainly_that_it_is_not_yet_authority(self):
        proposal = propose_mandate({"category": "groceries"}, ["groceries"], "fallback")

        text = describe_proposal(proposal)

        assert "Confirm" in text
        assert "cannot give myself spending authority" in text


class TestAnswersComeFromData:
    def test_spend_is_read_off_the_mandates(self):
        text = describe_spend([mandate(spent="250.00")])

        assert "250.00" in text
        assert "3,000.00" in text
        assert "2,750.00" in text

    def test_no_mandate_means_nothing_can_be_spent(self):
        assert "no active mandates" in describe_spend([])

    def test_it_reports_the_checks_the_engine_recorded(self):
        cart = {
            "status": "rejected",
            "cart_items": [{"catalog_id": 4, "quantity": 1, "substitutes_for": None}],
            "policy_decision": {
                "reason": "exceeds per-order cap",
                "checks": [
                    {"name": "Category", "outcome": "PASS", "detail": "every item is in household"},
                    {"name": "Per-order cap", "outcome": "FAIL", "detail": "over by 400.00"},
                ],
            },
        }

        text = describe_policy(cart, {4: "Surf Excel"})

        assert "over by 400.00" in text
        assert "refused" in text
        assert "every item is in household" not in text

    def test_a_substitution_is_explained_in_terms_of_what_was_swapped(self):
        cart = {
            "status": "pending_approval",
            "cart_items": [
                {"catalog_id": 18, "quantity": 1, "substitutes_for": 21, "rationale": "similar moisturiser"}
            ],
            "policy_decision": {
                "reason": "contains a substitution",
                "checks": [
                    {"name": "Substitution", "outcome": "ESCALATE", "detail": "you did not pick this"}
                ],
            },
        }

        text = describe_policy(cart, {18: "Dove Bar", 21: "Nivea Cream"})

        assert "Nivea Cream" in text
        assert "Dove Bar" in text
        assert "similar moisturiser" in text
        assert "waiting for you" in text

    def test_a_clean_cart_says_so_instead_of_inventing_a_concern(self):
        cart = {
            "status": "approved",
            "cart_items": [{"catalog_id": 4, "quantity": 1, "substitutes_for": None}],
            "policy_decision": {"reason": None, "checks": [{"name": "Category", "outcome": "PASS", "detail": "ok"}]},
        }

        assert "every check passed" in describe_policy(cart, {4: "Milk"})

    def test_a_cart_with_no_recorded_decision_does_not_crash(self):
        cart = {"status": "approved", "cart_items": [], "policy_decision": None}

        assert describe_policy(cart, {}) != ""
