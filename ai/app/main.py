from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import chat as conversation
from .agent import NoActiveMandate, run_all
from .autopilot import Autopilot
from .checkout_client import CheckoutClient, CheckoutError
from .config import settings
from .llm import DeciderUnavailable, MissingApiKey, build_decider
from .models import (
    AutopilotRequest,
    ChatReply,
    ChatRequest,
    ConfirmMandateRequest,
    MandateProposal,
    ResolveCartRequest,
    RunReport,
    RunRequest,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.checkout = CheckoutClient(
        settings.checkout_api_url,
        settings.agent_service_token,
        settings.request_timeout_seconds,
    )
    app.state.decider = build_decider(
        settings.llm_provider,
        settings.active_api_key,
        settings.active_model,
        settings.max_output_tokens,
        settings.fallback_offline,
    )
    app.state.autopilot = Autopilot(
        app.state.checkout, app.state.decider, settings.default_instruction
    )
    yield
    await app.state.autopilot.stop()
    await app.state.checkout.aclose()


app = FastAPI(title="Aethis Buyer Agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "provider": settings.llm_provider, "model": settings.active_model}


@app.post("/agent/run", response_model=RunReport)
async def run(request: RunRequest) -> RunReport:
    instruction = request.instruction or settings.default_instruction
    try:
        return await run_all(
            app.state.checkout,
            app.state.decider,
            request.user_id,
            instruction,
            request.category,
        )
    except NoActiveMandate as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except MissingApiKey as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except DeciderUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except CheckoutError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/chat", response_model=ChatReply)
async def talk(request: ChatRequest) -> ChatReply:
    """
    The model reads intent. Everything after that is ordinary code talking to the checkout API, so
    a conversation can start a cycle or draft a mandate but can never authorise money on its own.
    """
    checkout = app.state.checkout
    try:
        intent = conversation.extract_intent(
            app.state.decider, request.message, [turn.model_dump() for turn in request.history]
        )
    except (MissingApiKey, DeciderUnavailable) as exc:
        return conversation.unavailable(exc)

    kind = intent.get("intent", "unknown")

    try:
        if kind in ("create_mandate", "modify_mandate"):
            categories = await checkout.categories(request.user_id)
            draft = request.pending_proposal
            category = conversation.match_category(intent.get("category"), categories)
            if category is None and draft is not None:
                category = draft.category
            if category is None and kind == "modify_mandate":
                active = await checkout.active_mandates(request.user_id)
                category = active[0].category if len(active) == 1 else None
            if category is None:
                return ChatReply(
                    reply=conversation.ask_which_category(intent.get("category"), categories),
                    intent="needs_category",
                    suggestions=conversation.suggestions_for("needs_category"),
                )

            if draft is None and kind == "modify_mandate":
                existing = next(
                    (m for m in await checkout.active_mandates(request.user_id) if m.category == category),
                    None,
                )
                if existing is not None:
                    draft = MandateProposal(
                        category=existing.category,
                        standing_instruction=existing.standing_instruction or settings.default_instruction,
                        per_order_cap=existing.per_order_cap,
                        monthly_cap=existing.monthly_cap,
                        escalation_threshold_pct=existing.escalation_threshold_pct,
                    )

            proposal, assumed = conversation.propose_mandate(
                intent, category, settings.default_instruction, draft
            )
            return ChatReply(
                reply=conversation.describe_proposal(proposal, assumed),
                intent="create_mandate",
                proposal=proposal,
                suggestions=conversation.suggestions_for("create_mandate", has_proposal=True),
            )

        if kind in ("approve_cart", "decline_cart"):
            pending = await checkout.carts(request.user_id, "pending_approval")
            if not pending:
                return ChatReply(
                    reply=conversation.nothing_awaiting(),
                    intent=kind,
                    suggestions=conversation.suggestions_for("unknown"),
                )
            cart = pending[0]
            catalog = await checkout.catalog(request.user_id)
            names = {item.id: item.name for item in catalog}
            return ChatReply(
                reply=conversation.describe_cart_for_decision(cart, names),
                intent="awaiting_decision",
                cart={**cart, "intended_decision": "approve" if kind == "approve_cart" else "decline"},
                cart_mandate_id=cart["id"],
                suggestions=conversation.suggestions_for("awaiting_decision"),
            )

        if kind == "list_queue":
            entries = await checkout.restock_list(request.user_id)
            return ChatReply(
                reply=conversation.describe_queue(entries),
                intent=kind,
                suggestions=conversation.suggestions_for(kind),
            )

        if kind == "what_can_you_buy":
            catalog = await checkout.catalog(request.user_id)
            return ChatReply(
                reply=conversation.describe_catalog(catalog),
                intent=kind,
                suggestions=conversation.suggestions_for(kind),
            )

        if kind == "control_autopilot":
            wanted_on = bool(intent.get("turn_on"))
            state = app.state.autopilot.configure(wanted_on, request.user_id)
            return ChatReply(
                reply=conversation.describe_autopilot(state, wanted_on),
                intent=kind,
                suggestions=conversation.suggestions_for(kind),
            )

        if kind == "explain_omission":
            catalog = await checkout.catalog(request.user_id)
            item = conversation.match_item(intent.get("item"), catalog)
            if item is None:
                return ChatReply(
                    reply=(
                        f'I could not find "{intent.get("item")}" in this catalog, so it was '
                        f"never something I could have bought."
                    ),
                    intent=kind,
                    suggestions=conversation.suggestions_for(kind),
                )
            entries = await checkout.restock_list(request.user_id)
            carts = await checkout.carts(request.user_id)
            bought = {
                line["catalog_id"]
                for cart in carts[:3]
                for line in cart.get("cart_items", [])
            }
            return ChatReply(
                reply=conversation.describe_omission(
                    item,
                    {entry.catalog_id for entry in entries},
                    bought,
                    await checkout.active_mandates(request.user_id),
                ),
                intent=kind,
                suggestions=conversation.suggestions_for(kind),
            )

        if kind == "run_cycle":
            report = await run_all(
                checkout,
                app.state.decider,
                request.user_id,
                settings.default_instruction,
                (intent.get("category") or None),
            )
            # An approved cart leaves a Razorpay order behind. Hand it straight back so the
            # conversation can finish the job rather than sending the user off to another screen.
            outstanding = None
            if any(run.payment_status == "created" for run in report.runs):
                queue = await checkout.awaiting_checkout(request.user_id)
                outstanding = queue[0] if queue else None

            return ChatReply(
                reply=summarise_run(report),
                intent=kind,
                run=report,
                payment=outstanding,
                suggestions=conversation.suggestions_for(kind),
            )

        if kind == "spend_status":
            mandates = await checkout.active_mandates(request.user_id)
            return ChatReply(
                reply=conversation.describe_spend(mandates),
                intent=kind,
                suggestions=conversation.suggestions_for(kind),
            )

        if kind in ("explain_pending", "explain_last"):
            wanted = "pending_approval" if kind == "explain_pending" else None
            carts = await checkout.carts(request.user_id, wanted)
            if not carts:
                return ChatReply(
                    reply="Nothing is waiting for you right now."
                    if kind == "explain_pending"
                    else "No cycle has run yet, so there is nothing to explain.",
                    intent=kind,
                )
            cart = carts[0]
            catalog = await checkout.catalog(request.user_id)
            names = {item.id: item.name for item in catalog}
            return ChatReply(
                reply=conversation.describe_policy(cart, names),
                intent=kind,
                cart_mandate_id=cart["id"],
                suggestions=conversation.suggestions_for(kind),
            )
    except NoActiveMandate as exc:
        return ChatReply(reply=str(exc), intent=kind)
    except CheckoutError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return conversation.cannot_help(request.message)


@app.post("/chat/confirm", response_model=ChatReply)
async def confirm(request: ConfirmMandateRequest) -> ChatReply:
    """The write the conversation is not allowed to perform on its own."""
    proposal = request.proposal
    try:
        # Only one mandate per category may be active, so changing the limits means retiring the old
        # one. Both events land in the ledger, which is the point: authority was replaced, not edited.
        replaced = next(
            (
                m
                for m in await app.state.checkout.active_mandates(request.user_id)
                if m.category == proposal.category
            ),
            None,
        )
        if replaced is not None:
            await app.state.checkout.revoke_mandate(request.user_id, replaced.id)

        issued = await app.state.checkout.issue_mandate(request.user_id, {
            "category": proposal.category,
            "standing_instruction": proposal.standing_instruction,
            "per_order_cap": float(proposal.per_order_cap),
            "monthly_cap": float(proposal.monthly_cap),
            "escalation_threshold_pct": float(proposal.escalation_threshold_pct),
            "expires_at": expiry(),
        })
    except CheckoutError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    note = " The previous one was revoked, and both events are in the ledger." if replaced else ""
    return ChatReply(
        reply=(
            f"Issued. I will keep {proposal.category} stocked inside ₹{proposal.per_order_cap:,.0f} "
            f"per order and ₹{proposal.monthly_cap:,.0f} a month, and the checkout API will hold me "
            f"to it whatever I propose. Mandate #{issued.get('id')}.{note}"
        ),
        intent="mandate_issued",
        suggestions=conversation.suggestions_for("mandate_issued"),
    )


def expiry() -> str:
    from datetime import datetime, timedelta, timezone

    return (datetime.now(timezone.utc) + timedelta(days=30)).isoformat().replace("+00:00", "Z")


def settled(run) -> str:
    """
    An approved cart is not a paid one. Against a live gateway the cycle raises a Razorpay order and
    stops, because money moves when a person completes checkout and the server verifies the
    signature. Saying "bought and paid for" at that point would be the one kind of lie this system
    exists to prevent.
    """
    if run.outcome != "approved":
        return {
            "pending_approval": "waiting for your approval",
            "rejected": "refused by the guardrail",
            "nothing_proposed": "nothing worth buying",
        }.get(run.outcome, run.outcome)

    return {
        "paid": "bought and paid for",
        "created": "approved — the order is raised and waiting for you to complete checkout",
        "failed": "approved, but the payment failed",
    }.get(run.payment_status or "", "approved")


def summarise_run(report: RunReport) -> str:
    if not report.runs:
        skipped = "; ".join(f"{k}: {v}" for k, v in report.skipped.items())
        return f"Nothing to do. {skipped}" if skipped else "There was nothing queued to buy."

    lines = []
    for run in report.runs:
        outcome = settled(run)
        detail = f" — {run.reason}" if run.reason else ""
        lines.append(f"{run.category}: {len(run.proposed_cart)} item(s), {outcome}{detail}")
    return "\n".join(lines)


@app.get("/agent/autopilot")
async def autopilot_status() -> dict:
    return app.state.autopilot.status()


@app.post("/agent/autopilot")
async def autopilot_set(request: AutopilotRequest) -> dict:
    return app.state.autopilot.configure(
        request.enabled, request.user_id, request.interval_seconds
    )


@app.post("/chat/resolve", response_model=ChatReply)
async def resolve(request: ResolveCartRequest) -> ChatReply:
    """
    Approving a cart moves money, so it does not happen on an intent classification. The chat surfaces
    the cart and this endpoint is reached only by a deliberate click, the same way a mandate is issued.
    """
    checkout = app.state.checkout
    decision = "APPROVE" if request.decision.lower().startswith("a") else "DECLINE"

    try:
        cart = await checkout.resolve_cart(request.user_id, request.cart_mandate_id, decision)
        if decision == "DECLINE":
            return ChatReply(
                reply=(
                    f"Declined. Cart #{request.cart_mandate_id} is closed, nothing was charged, and the "
                    f"refusal is in the ledger under your name."
                ),
                intent="cart_declined",
                suggestions=conversation.suggestions_for("cart_declined"),
            )

        payment = await checkout.raise_payment(request.user_id, request.cart_mandate_id)
    except CheckoutError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return ChatReply(
        reply=conversation.describe_settlement(payment),
        intent="awaiting_payment",
        cart=cart,
        payment=payment,
        cart_mandate_id=request.cart_mandate_id,
        suggestions=conversation.suggestions_for("awaiting_payment"),
    )
