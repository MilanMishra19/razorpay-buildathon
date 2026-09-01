from .checkout_client import CheckoutClient
from .injection import is_suspicious, screen
from .llm import Decider
from .models import CartLine, CatalogItem, Mandate, RestockEntry, RunReport, RunResult

RATIONALE_LIMIT = 160
RATIONALE_WITHHELD = "[reason withheld: failed content screening]"


class NoActiveMandate(RuntimeError):
    pass


async def run_all(
    client: CheckoutClient,
    decider: Decider,
    user_id: int,
    fallback_instruction: str,
    category: str | None = None,
) -> RunReport:
    mandates = await client.active_mandates(user_id)
    if category:
        wanted = category.strip().lower()
        mandates = [mandate for mandate in mandates if mandate.category == wanted]
    if not mandates:
        raise NoActiveMandate(
            f"no active mandate covering {category}" if category else "user has no active mandate"
        )

    entries = await client.restock_list(user_id)
    runs: list[RunResult] = []
    skipped: dict[str, str] = {}

    for mandate in mandates:
        queued = [entry for entry in entries if entry.catalog_category == mandate.category]
        if not queued:
            skipped[mandate.category] = "nothing queued for this category"
            continue
        runs.append(await run_cycle(client, decider, user_id, mandate, queued, fallback_instruction))

    return RunReport(runs=runs, skipped=skipped)


async def run_cycle(
    client: CheckoutClient,
    decider: Decider,
    user_id: int,
    mandate: Mandate,
    entries: list[RestockEntry],
    fallback_instruction: str,
) -> RunResult:
    instruction = mandate.standing_instruction or fallback_instruction

    catalog = await client.catalog(user_id, mandate.category)
    sanitized, flagged = screen(catalog)

    decision = decider(mandate, entries, sanitized, instruction)

    known_ids = {item.id for item in catalog}
    kept = [line for line in decision.lines if line.catalog_id in known_ids]
    dropped = [line.catalog_id for line in decision.lines if line.catalog_id not in known_ids]
    kept, rejected_substitutions = strip_unfounded_substitutions(kept, entries, catalog)
    kept, withheld_rationales = sanitize_rationales(kept)

    run_payload = {
        "intent_mandate_id": mandate.id,
        "restock_snapshot": [entry.catalog_id for entry in entries],
        "prompt": decision.prompt,
        "raw_response": decision.raw_response or "",
        "parsed_cart": [line.model_dump() for line in kept],
        "flagged_catalog_ids": flagged,
        "cart_mandate_id": None,
    }

    if not kept:
        agent_run_id = await client.record_run(user_id, run_payload)
        return RunResult(
            category=mandate.category,
            agent_run_id=agent_run_id,
            outcome="nothing_proposed",
            reason="the model chose no eligible items",
            flagged_catalog_ids=flagged,
            dropped_catalog_ids=dropped,
            model_unavailable=decision.degraded,
            instruction_used=instruction,
            rejected_substitutions=rejected_substitutions,
            withheld_rationales=withheld_rationales,
        )

    cart = await client.propose_cart(user_id, mandate.id, kept)
    run_payload["cart_mandate_id"] = cart.cart_mandate_id
    agent_run_id = await client.record_run(user_id, run_payload)

    payment_status = None
    if cart.status == "approved":
        payment = await client.pay(user_id, cart.cart_mandate_id)
        payment_status = payment.get("payment_status")

    if cart.status in ("approved", "pending_approval"):
        await client.consume_restock(user_id, [entry.catalog_id for entry in entries])

    return RunResult(
        category=mandate.category,
        agent_run_id=agent_run_id,
        cart_mandate_id=cart.cart_mandate_id,
        outcome=cart.status,
        reason=cart.reason,
        proposed_cart=kept,
        flagged_catalog_ids=flagged,
        dropped_catalog_ids=dropped,
        payment_status=payment_status,
        model_unavailable=decision.degraded,
        instruction_used=instruction,
        rejected_substitutions=rejected_substitutions,
        withheld_rationales=withheld_rationales,
    )


def strip_unfounded_substitutions(
    lines: list[CartLine],
    entries: list[RestockEntry],
    catalog: list[CatalogItem],
) -> tuple[list[CartLine], list[int]]:
    """
    A substitution is a claim the model makes about the world, so it is checked against the world
    rather than believed. The replaced item has to be something the user actually queued and that
    is actually unavailable; anything else keeps the line but loses the claim, so a cart can never
    be routed to approval — or explained to the user — on a fabricated premise.
    """
    queued = {entry.catalog_id for entry in entries}
    out_of_stock = {item.id for item in catalog if item.stock_status != "in_stock"}

    checked: list[CartLine] = []
    rejected: list[int] = []

    for line in lines:
        if line.substitutes_for is None:
            checked.append(line)
            continue

        founded = line.substitutes_for in queued and line.substitutes_for in out_of_stock
        if founded:
            checked.append(line)
        else:
            rejected.append(line.substitutes_for)
            checked.append(line.model_copy(update={"substitutes_for": None, "rationale": None}))

    return checked, rejected


def sanitize_rationales(lines: list[CartLine]) -> tuple[list[CartLine], list[int]]:
    """
    The rationale is the one field where the model writes prose a person reads before approving, so it
    is the one place a compromised listing could address the user directly. It is held to a sentence
    and screened the same way catalog text is: the swap survives, because that was checked against the
    catalog, but the argument for it does not.
    """
    checked: list[CartLine] = []
    withheld: list[int] = []

    for line in lines:
        if line.rationale is None:
            checked.append(line)
            continue

        rationale = line.rationale.strip()[:RATIONALE_LIMIT]
        if is_suspicious(rationale):
            withheld.append(line.catalog_id)
            rationale = RATIONALE_WITHHELD

        checked.append(line.model_copy(update={"rationale": rationale}))

    return checked, withheld
