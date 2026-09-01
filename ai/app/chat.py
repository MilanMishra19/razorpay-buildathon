"""
The conversational face of the buyer agent.

One rule shapes this whole module: the model is allowed to work out what the user *meant*, and
nothing else. It never composes an answer containing a number, never touches money, and never
decides that a mandate exists. Intent extraction is a single structured call; every answer after
that is assembled from what the checkout API actually returns, so a sentence about spending cannot
disagree with the ledger.
"""

import json
import re

from .llm import DeciderUnavailable, MissingApiKey
from .models import ChatReply, MandateProposal

INTENT_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {
            "type": "string",
            "enum": [
                "create_mandate",
                "run_cycle",
                "explain_pending",
                "explain_last",
                "spend_status",
                "unknown",
            ],
        },
        "category": {"type": ["string", "null"]},
        "instruction": {"type": ["string", "null"]},
        "per_order_cap": {"type": ["number", "null"]},
        "monthly_cap": {"type": ["number", "null"]},
        "escalation_threshold_pct": {"type": ["number", "null"]},
    },
    "required": [
        "intent",
        "category",
        "instruction",
        "per_order_cap",
        "monthly_cap",
        "escalation_threshold_pct",
    ],
    "additionalProperties": False,
}

INTENT_SYSTEM = """You read one message from a person talking to their shopping agent and work out \
what they are asking for. You do not answer them, and you never invent an amount they did not say.

intent is one of:
- create_mandate: they are setting up or changing a standing instruction and its spending limits
- run_cycle: they want a shopping cycle to run now
- explain_pending: they are asking why something is waiting for their approval
- explain_last: they are asking what happened on the most recent cycle or purchase
- spend_status: they are asking how much has been spent or what is left
- unknown: anything else

category is the shopping category they named, lowercased, or null.
instruction is their standing instruction in their own words, or null.
The three limits are rupee amounts and a percentage they stated explicitly. If they did not say a \
number, it is null. Never guess one."""


def extract_intent(decider, message: str) -> dict:
    """
    Uses whichever provider the agent already runs on. A failure here is not fatal: the caller
    falls back to asking the user to rephrase, which is better than acting on a guess.
    """
    raw = decider.classify(INTENT_SYSTEM, message, INTENT_SCHEMA)
    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {"intent": "unknown"}
    return payload if isinstance(payload, dict) else {"intent": "unknown"}


DEFAULT_PER_ORDER = 500
DEFAULT_MONTHLY = 3000
DEFAULT_THRESHOLD = 90


def match_category(wanted: str | None, categories: list[str]) -> str | None:
    """
    The user says "household essentials"; the catalog says "household". Close that gap without
    guessing — and return None rather than reaching for a default, because quietly proposing a
    mandate against a category the user never named is how an agent ends up spending in the wrong
    aisle. The caller asks instead.
    """
    if not wanted or not categories:
        return None

    wanted = wanted.strip().lower()
    if wanted in categories:
        return wanted

    for category in categories:
        if category in wanted or wanted in category:
            return category

    for category in categories:
        if any(shares_root(word, other) for word in words(wanted) for other in words(category)):
            return category

    return None


def words(text: str) -> list[str]:
    return re.findall(r"[a-z]+", text.lower())


def shares_root(one: str, other: str) -> bool:
    """Enough to tie grocery to groceries, not enough to tie care to carton."""
    if min(len(one), len(other)) < 5:
        return False
    common = 0
    for left, right in zip(one, other):
        if left != right:
            break
        common += 1
    return common >= 5


def propose_mandate(
    intent: dict, category: str, fallback_instruction: str
) -> tuple[MandateProposal, list[str]]:
    """
    Returns the draft and the list of limits the user did not actually state. A default the user is
    not told about is a number they did not choose, on a document about their money.
    """
    assumed: list[str] = []

    per_order = intent.get("per_order_cap")
    if per_order is None:
        per_order, _ = DEFAULT_PER_ORDER, assumed.append("per-order cap")

    monthly = intent.get("monthly_cap")
    if monthly is None:
        monthly, _ = DEFAULT_MONTHLY, assumed.append("monthly cap")

    threshold = intent.get("escalation_threshold_pct")
    if threshold is None:
        threshold, _ = DEFAULT_THRESHOLD, assumed.append("check-in threshold")

    proposal = MandateProposal(
        category=category,
        standing_instruction=intent.get("instruction") or fallback_instruction,
        per_order_cap=per_order,
        monthly_cap=monthly,
        escalation_threshold_pct=threshold,
    )
    return proposal, assumed


def ask_which_category(wanted: str | None, categories: list[str]) -> str:
    named = f'I could not match "{wanted}" to anything this merchant sells. ' if wanted else ""
    listed = ", ".join(categories[:-1]) + f" or {categories[-1]}" if len(categories) > 1 else categories[0]
    return (
        f"{named}I can only hold a mandate against a category that exists, so tell me which one you "
        f"mean and I will draft it: {listed}."
    )


def describe_proposal(proposal: MandateProposal, assumed: list[str] | None = None) -> str:
    text = (
        f"Here is the mandate I would issue for {proposal.category}: up to "
        f"₹{proposal.per_order_cap:,.0f} per order, ₹{proposal.monthly_cap:,.0f} per month, and I "
        f"check with you once a cart would take you past {proposal.escalation_threshold_pct:.0f}% of "
        f"the monthly cap. Confirm and I will issue it — I cannot give myself spending authority."
    )
    if assumed:
        spelled = ", ".join(assumed[:-1]) + f" and {assumed[-1]}" if len(assumed) > 1 else assumed[0]
        text += f" You did not name a {spelled}, so that part is my default — change it before issuing."
    return text


def describe_spend(mandates: list) -> str:
    if not mandates:
        return "You have no active mandates, so nothing can be spent on your behalf right now."

    lines = []
    for mandate in mandates:
        lines.append(
            f"{mandate.category}: ₹{mandate.spent_this_period:,.2f} spent of "
            f"₹{mandate.monthly_cap:,.2f}, leaving ₹{mandate.remaining_monthly_budget:,.2f}."
        )
    return "\n".join(lines)


def describe_policy(cart: dict, names: dict[int, str]) -> str:
    """
    Reads the checks the policy engine recorded rather than reasoning about them again. If the
    guardrail and this sentence ever disagree, the sentence is the one that is wrong, so it is not
    allowed to have its own opinion.
    """
    decision = cart.get("policy_decision") or {}
    checks = decision.get("checks") or []
    notable = [c for c in checks if c.get("outcome") in ("FAIL", "ESCALATE")]

    swap = next((item for item in cart.get("cart_items", []) if item.get("substitutes_for")), None)
    parts = []

    if swap:
        wanted = names.get(swap["substitutes_for"], f"item #{swap['substitutes_for']}")
        got = names.get(swap["catalog_id"], f"item #{swap['catalog_id']}")
        reason = swap.get("rationale") or "it was unavailable"
        parts.append(f"{wanted} was not available, so I picked {got} instead — {reason}")

    for check in notable:
        parts.append(f"{check['name'].lower()}: {check.get('detail')}")

    if not parts:
        return "Nothing on that cart needed your attention — every check passed."

    verdict = {
        "pending_approval": "It is waiting for you rather than being paid.",
        "rejected": "It was refused and nothing was charged.",
    }.get(cart.get("status"))

    body = ". ".join(sentence(part.rstrip(" .")) for part in parts if part.strip(" .")) + "."
    return f"{body} {verdict}" if verdict else body


def sentence(text: str) -> str:
    return text[0].upper() + text[1:] if text else text


def cannot_help(message: str) -> ChatReply:
    return ChatReply(
        reply=(
            "I can set up a mandate, run a shopping cycle, tell you what has been spent, or explain "
            "why something is waiting for you. I could not tell which of those you meant."
        ),
        intent="unknown",
    )


def unavailable(error: Exception) -> ChatReply:
    kind = "no model is configured" if isinstance(error, MissingApiKey) else "the model is unreachable"
    return ChatReply(
        reply=(
            f"I could not work out what you meant because {kind}. The agent itself still runs — "
            "everything on this page keeps working without me."
        ),
        intent="unavailable",
        degraded=str(error),
    )


__all__ = [
    "DeciderUnavailable",
    "MissingApiKey",
    "ask_which_category",
    "cannot_help",
    "describe_policy",
    "describe_proposal",
    "describe_spend",
    "extract_intent",
    "match_category",
    "propose_mandate",
    "sentence",
    "unavailable",
]
