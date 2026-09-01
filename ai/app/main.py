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
        intent = conversation.extract_intent(app.state.decider, request.message)
    except (MissingApiKey, DeciderUnavailable) as exc:
        return conversation.unavailable(exc)

    kind = intent.get("intent", "unknown")

    try:
        if kind == "create_mandate":
            categories = await checkout.categories(request.user_id)
            category = conversation.match_category(intent.get("category"), categories)
            if category is None:
                return ChatReply(
                    reply=conversation.ask_which_category(intent.get("category"), categories),
                    intent="needs_category",
                )
            proposal, assumed = conversation.propose_mandate(
                intent, category, settings.default_instruction
            )
            return ChatReply(
                reply=conversation.describe_proposal(proposal, assumed),
                intent=kind,
                proposal=proposal,
            )

        if kind == "run_cycle":
            report = await run_all(
                checkout,
                app.state.decider,
                request.user_id,
                settings.default_instruction,
                (intent.get("category") or None),
            )
            return ChatReply(reply=summarise_run(report), intent=kind, run=report)

        if kind == "spend_status":
            mandates = await checkout.active_mandates(request.user_id)
            return ChatReply(reply=conversation.describe_spend(mandates), intent=kind)

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

    return ChatReply(
        reply=(
            f"Issued. I will keep {proposal.category} stocked inside ₹{proposal.per_order_cap:,.0f} "
            f"per order and ₹{proposal.monthly_cap:,.0f} a month, and the checkout API will hold me "
            f"to it whatever I propose. Mandate #{issued.get('id')}."
        ),
        intent="mandate_issued",
    )


def expiry() -> str:
    from datetime import datetime, timedelta, timezone

    return (datetime.now(timezone.utc) + timedelta(days=30)).isoformat().replace("+00:00", "Z")


def summarise_run(report: RunReport) -> str:
    if not report.runs:
        skipped = "; ".join(f"{k}: {v}" for k, v in report.skipped.items())
        return f"Nothing to do. {skipped}" if skipped else "There was nothing queued to buy."

    lines = []
    for run in report.runs:
        outcome = {
            "approved": "bought and paid for",
            "pending_approval": "waiting for your approval",
            "rejected": "refused by the guardrail",
            "nothing_proposed": "nothing worth buying",
        }.get(run.outcome, run.outcome)
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
