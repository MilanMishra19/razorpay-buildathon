from .checkout_client import CheckoutClient
from .injection import screen
from .llm import Decider
from .models import RunResult


class NoActiveMandate(RuntimeError):
    pass


async def run_cycle(
    client: CheckoutClient,
    decider: Decider,
    user_id: int,
    instruction: str,
) -> RunResult:
    mandate = await client.active_mandate(user_id)
    if mandate is None:
        raise NoActiveMandate("user has no active intent mandate")

    entries = await client.restock_list(user_id)
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
            agent_run_id=agent_run_id,
            outcome="nothing_proposed",
            reason="the model chose no eligible items",
            flagged_catalog_ids=flagged,
            dropped_catalog_ids=dropped,
            model_unavailable=decision.degraded,
        )

    cart = await client.propose_cart(user_id, mandate.id, kept)
    run_payload["cart_mandate_id"] = cart.cart_mandate_id
    agent_run_id = await client.record_run(user_id, run_payload)

    payment_status = None
    if cart.status == "approved":
        payment = await client.pay(user_id, cart.cart_mandate_id)
        payment_status = payment.get("payment_status")

    if cart.status in ("approved", "pending_approval"):
        await client.consume_restock(user_id)

    return RunResult(
        agent_run_id=agent_run_id,
        cart_mandate_id=cart.cart_mandate_id,
        outcome=cart.status,
        reason=cart.reason,
        proposed_cart=kept,
        flagged_catalog_ids=flagged,
        dropped_catalog_ids=dropped,
        payment_status=payment_status,
        model_unavailable=decision.degraded,
    )
