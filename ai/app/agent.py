from .checkout_client import CheckoutClient
from .injection import screen
from .llm import Decider
from .models import Mandate, RestockEntry, RunReport, RunResult


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
    )
