import json
from decimal import Decimal

from app.chat import (
    ask_which_category,
    describe_policy,
    describe_proposal,
    describe_spend,
    extract_intent,
    match_category,
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


class TestCategoryMatching:
    CATEGORIES = ["groceries", "household", "personal care"]

    def test_the_words_people_actually_use_reach_the_right_shelf(self):
        assert match_category("household essentials", self.CATEGORIES) == "household"
        assert match_category("personal care items", self.CATEGORIES) == "personal care"
        assert match_category("grocery shopping", self.CATEGORIES) == "groceries"

    def test_an_exact_name_is_taken_as_given(self):
        assert match_category("household", self.CATEGORIES) == "household"

    def test_a_category_the_merchant_does_not_sell_is_not_forced_into_one(self):
        assert match_category("pet food", self.CATEGORIES) is None
        assert match_category("kitchen stuff", self.CATEGORIES) is None

    def test_nothing_said_matches_nothing(self):
        assert match_category(None, self.CATEGORIES) is None
        assert match_category("", self.CATEGORIES) is None

    def test_a_near_miss_does_not_become_a_false_match(self):
        assert match_category("carton of milk", self.CATEGORIES) is None

    def test_the_question_names_the_real_categories(self):
        text = ask_which_category("pet food", self.CATEGORIES)

        assert "pet food" in text
        assert "groceries" in text and "household" in text and "personal care" in text


class TestMandateProposal:
    def test_it_carries_the_limits_the_user_actually_stated(self):
        intent = {
            "intent": "create_mandate",
            "instruction": "keep the cleaning stuff stocked",
            "per_order_cap": 600,
            "monthly_cap": 4000,
            "escalation_threshold_pct": 80,
        }

        proposal, assumed = propose_mandate(intent, "household", "fallback")

        assert proposal.category == "household"
        assert proposal.per_order_cap == 600
        assert proposal.monthly_cap == 4000
        assert proposal.escalation_threshold_pct == 80
        assert assumed == []

    def test_limits_the_user_never_gave_are_reported_as_assumptions(self):
        proposal, assumed = propose_mandate({"per_order_cap": 600}, "household", "fallback")

        assert proposal.per_order_cap == 600
        assert assumed == ["monthly cap", "check-in threshold"]

    def test_the_reply_admits_which_numbers_it_chose_itself(self):
        proposal, assumed = propose_mandate({"per_order_cap": 600}, "household", "fallback")

        text = describe_proposal(proposal, assumed)

        assert "my default" in text
        assert "monthly cap" in text

    def test_the_proposal_says_plainly_that_it_is_not_yet_authority(self):
        proposal, assumed = propose_mandate({}, "groceries", "fallback")

        text = describe_proposal(proposal, assumed)

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
