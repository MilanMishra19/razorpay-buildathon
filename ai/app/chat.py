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
                "modify_mandate",
                "run_cycle",
                "explain_pending",
                "explain_last",
                "explain_omission",
                "approve_cart",
                "decline_cart",
                "spend_status",
                "list_queue",
                "control_autopilot",
                "what_can_you_buy",
                "unknown",
            ],
        },
        "category": {"type": ["string", "null"]},
        "instruction": {"type": ["string", "null"]},
        "item": {"type": ["string", "null"]},
        "turn_on": {"type": ["boolean", "null"]},
        "per_order_cap": {"type": ["number", "null"]},
        "monthly_cap": {"type": ["number", "null"]},
        "escalation_threshold_pct": {"type": ["number", "null"]},
    },
    "required": [
        "intent",
        "category",
        "instruction",
        "item",
        "turn_on",
        "per_order_cap",
        "monthly_cap",
        "escalation_threshold_pct",
    ],
    "additionalProperties": False,
}

INTENT_SYSTEM = """You read one message from a person talking to their shopping agent and work out \
what they are asking for. You do not answer them, and you never invent an amount they did not say.

You are given the conversation so far. A short message refers to whatever was being discussed, so \
read it in that light. If a mandate is being drafted and the new message only adjusts one of its \
limits — "make it 800", "cap the month at 5000", "ask me at 70 percent" — that is modify_mandate, \
and the limit they named goes in the matching field.

intent is one of:
- create_mandate: they are setting up a standing instruction and its spending limits
- modify_mandate: they want to change the limits on a mandate already being drafted or already issued
- run_cycle: they want a shopping cycle to run now
- explain_omission: they name a product and ask why it was not bought, was skipped, or was left \
out. Any "why didn't you buy X" or "why did you skip X" is this one, whatever X is
- approve_cart: they are agreeing to a cart that is waiting on them - "approve it", "yes buy it",
"go ahead", "pay for it"
- decline_cart: they are refusing a cart that is waiting on them - "decline", "no", "cancel that"
- explain_pending: they ask why a cart is waiting for their approval, naming no product
- explain_last: they ask what happened on the most recent cycle, naming no product
- spend_status: they are asking how much has been spent or what is left
- list_queue: they are asking what is on the restock list
- control_autopilot: they want the agent to start or stop shopping on its own
- what_can_you_buy: they are asking what this merchant sells or stocks
- unknown: anything else

category is the shopping category they named, lowercased, or null.
instruction is their standing instruction in their own words, or null.
item is the product they named, whenever they name one, or null.
turn_on is true if they want autopilot running, false if they want it stopped, null otherwise.
The three limits are rupee amounts and a percentage they stated explicitly. If they did not say a \
number, it is null. Never guess one."""


def extract_intent(decider, message: str, history: list[dict] | None = None) -> dict:
    """
    Uses whichever provider the agent already runs on. A failure here is not fatal: the caller
    falls back to asking the user to rephrase, which is better than acting on a guess.
    """
    raw = decider.classify(INTENT_SYSTEM, message, INTENT_SCHEMA, history)
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
    intent: dict,
    category: str,
    fallback_instruction: str,
    base: MandateProposal | None = None,
) -> tuple[MandateProposal, list[str]]:
    """
    Returns the draft and the list of limits the user never actually stated. A default the user is
    not told about is a number they did not choose, on a document about their money.

    `base` is a draft already on the table, so "make it 800" edits that one limit and leaves the
    rest of the conversation intact rather than starting the whole mandate over.
    """
    assumed: list[str] = []

    def settle(stated, carried, default, label):
        if stated is not None:
            return stated
        if carried is not None:
            return carried
        assumed.append(label)
        return default

    per_order = settle(
        intent.get("per_order_cap"), base.per_order_cap if base else None, DEFAULT_PER_ORDER, "per-order cap"
    )
    monthly = settle(
        intent.get("monthly_cap"), base.monthly_cap if base else None, DEFAULT_MONTHLY, "monthly cap"
    )
    threshold = settle(
        intent.get("escalation_threshold_pct"),
        base.escalation_threshold_pct if base else None,
        DEFAULT_THRESHOLD,
        "check-in threshold",
    )

    proposal = MandateProposal(
        category=category,
        standing_instruction=(
            intent.get("instruction") or (base.standing_instruction if base else None) or fallback_instruction
        ),
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


def match_item(wanted: str | None, items: list) -> object | None:
    """Same tolerance as categories: people say "the tea", the catalog says "Brooke Bond Red Label"."""
    if not wanted:
        return None
    wanted = wanted.strip().lower()
    for item in items:
        if item.name.lower() == wanted:
            return item
    for item in items:
        if wanted in item.name.lower():
            return item
    asked = [word for word in words(wanted) if len(word) > 2]
    for item in items:
        named = words(item.name)
        if any(shares_root(word, other) or word == other for word in asked for other in named):
            return item
    return None


def describe_omission(item, queued_ids: set[int], bought_ids: set[int], mandates: list) -> str:
    """
    Answers "why didn't you buy the tea?" from the state that decided it, in the order the cycle
    actually applies: was it asked for, could it be had, was it covered, could it be afforded.
    """
    if item.id in bought_ids:
        return f"{item.name} was bought on the last cycle."

    covering = next((m for m in mandates if m.category == item.category), None)

    if item.id not in queued_ids:
        return (
            f"{item.name} is not on your restock list, and I only shop for what you have marked as "
            f"low. Add it in the catalog and it will be in the next cycle."
        )
    if item.stock_status != "in_stock":
        return (
            f"{item.name} is out of stock. I can stand in a similar item from {item.category} if one "
            f"genuinely does the same job, but I will not buy a placeholder just to fill the slot."
        )
    if covering is None:
        return (
            f"{item.name} is in {item.category}, and you have no active mandate covering that "
            f"category, so I have no authority to buy it."
        )
    if item.price > covering.per_order_cap:
        return (
            f"{item.name} costs ₹{item.price:,.2f}, which is over your ₹{covering.per_order_cap:,.2f} "
            f"per-order cap for {item.category}. Buying it would have been refused, so I left it."
        )
    if item.price > covering.remaining_monthly_budget:
        return (
            f"{item.name} costs ₹{item.price:,.2f} and only ₹{covering.remaining_monthly_budget:,.2f} "
            f"is left in this month's {item.category} budget."
        )
    return (
        f"{item.name} was available and within budget — I judged it was not needed under your "
        f"standing instruction for {item.category}. Say the word and I will queue it."
    )


def describe_queue(entries: list) -> str:
    if not entries:
        return "Your restock list is empty, so there is nothing for me to shop for."

    by_category: dict[str, list[str]] = {}
    for entry in entries:
        name = entry.catalog_name or f"item #{entry.catalog_id}"
        by_category.setdefault(entry.catalog_category or "uncategorised", []).append(name)

    lines = [f"{category}: {', '.join(names)}" for category, names in by_category.items()]
    return "On your restock list:\n" + "\n".join(lines)


def describe_catalog(items: list) -> str:
    by_category: dict[str, list] = {}
    for item in items:
        by_category.setdefault(item.category, []).append(item)

    lines = []
    for category, group in by_category.items():
        cheapest = min(group, key=lambda i: i.price)
        dearest = max(group, key=lambda i: i.price)
        available = sum(1 for i in group if i.stock_status == "in_stock")
        lines.append(
            f"{category}: {len(group)} products, {available} in stock, "
            f"₹{cheapest.price:,.0f} to ₹{dearest.price:,.0f}"
        )
    return "This merchant sells:\n" + "\n".join(lines)


def describe_autopilot(state: dict, wanted_on: bool) -> str:
    if wanted_on:
        return (
            f"Autopilot is on. I will run a cycle every {state['interval_seconds']} seconds against "
            f"your existing mandates — same guardrails, same escalations, same ledger. Ask me to stop "
            f"and I stop."
        )
    return "Autopilot is off. I will not shop again until you ask me to."


def suggestions_for(intent: str, has_proposal: bool = False) -> list[str]:
    """
    What a person would plausibly say next. Derived from the intent we just handled, not generated,
    so it costs nothing and cannot wander.
    """
    if has_proposal:
        return ["Make it 800 per order", "What does this merchant sell?"]
    return {
        "mandate_issued": ["Run my next cycle", "What's on my restock list?"],
        "run_cycle": ["Why is that waiting for approval?", "How much have I spent?"],
        "explain_pending": ["How much have I spent?", "Run my next cycle"],
        "explain_last": ["What's on my restock list?", "How much have I spent?"],
        "explain_omission": ["What's on my restock list?", "Run my next cycle"],
        "awaiting_decision": ["Why does it need my approval?"],
        "cart_declined": ["Run my next cycle", "How much have I spent?"],
        "awaiting_payment": ["How much have I spent?"],
        "spend_status": ["Run my next cycle", "What's on my restock list?"],
        "list_queue": ["Run my next cycle", "How much have I spent?"],
        "control_autopilot": ["How much have I spent?", "What's on my restock list?"],
        "what_can_you_buy": ["Keep household essentials stocked, 600 per order"],
        "needs_category": ["Keep household essentials stocked, 600 per order"],
        "unknown": ["How much have I spent?", "Run my next cycle"],
    }.get(intent, ["Run my next cycle", "How much have I spent?"])


def describe_cart_for_decision(cart: dict, names: dict[int, str]) -> str:
    """
    What you are about to agree to, before you agree to it. Saying "approve" into a chat box should
    never move money on its own - the words start the decision, the button makes it.
    """
    lines = []
    for item in cart.get("cart_items", []):
        name = names.get(item["catalog_id"], f"item #{item['catalog_id']}")
        lines.append(f"{name} ×{item['quantity']}")

    reason = cart.get("rejection_reason") or "it needs your approval"
    return (
        f"Cart #{cart['id']} is waiting on you: {', '.join(lines)}, ₹{float(cart['total_amount']):,.2f} "
        f"in total, held because {reason}. Confirm below and I will approve it and raise the payment — "
        f"I cannot do that on the strength of a sentence alone."
    )


def describe_settlement(payment: dict) -> str:
    if payment.get("razorpay_order_id"):
        return (
            f"Approved, and Razorpay order {payment['razorpay_order_id']} is raised for "
            f"₹{float(payment['amount']):,.2f}. It is an order, not a payment — complete the checkout "
            f"below and the spend counts only once the server has verified the signature."
        )
    return (
        f"Approved and settled for ₹{float(payment['amount']):,.2f}. No live gateway is configured, so "
        f"the stub client completed it."
    )


def nothing_awaiting() -> str:
    return "Nothing is waiting on your decision right now."


def cannot_help(message: str) -> ChatReply:
    return ChatReply(
        reply=(
            "I could not tell what you meant. I can set up or change a mandate, run a shopping "
            "cycle, turn autopilot on or off, tell you what has been spent, show what is on your "
            "restock list, say what this merchant sells, or explain why something is waiting for "
            "you or why I skipped an item."
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
    "describe_autopilot",
    "describe_catalog",
    "describe_omission",
    "describe_policy",
    "describe_proposal",
    "describe_spend",
    "extract_intent",
    "match_category",
    "match_item",
    "suggestions_for",
    "propose_mandate",
    "sentence",
    "unavailable",
]
