from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from .agent import NoActiveMandate, run_cycle
from .checkout_client import CheckoutClient, CheckoutError
from .config import settings
from .llm import DeciderUnavailable, MissingApiKey, build_decider
from .models import RunRequest, RunResult


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.checkout = CheckoutClient(
        settings.checkout_api_url,
        settings.agent_service_token,
        settings.request_timeout_seconds,
    )
    app.state.decider = build_decider(
        settings.llm_provider,
        settings.google_api_key,
        settings.gemini_model,
        settings.max_output_tokens,
    )
    yield
    await app.state.checkout.aclose()


app = FastAPI(title="Aethis Buyer Agent", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, str]:
    model = settings.gemini_model if settings.llm_provider == "gemini" else "none"
    return {"status": "ok", "provider": settings.llm_provider, "model": model}


@app.post("/agent/run", response_model=RunResult)
async def run(request: RunRequest) -> RunResult:
    instruction = request.instruction or settings.default_instruction
    try:
        return await run_cycle(app.state.checkout, app.state.decider, request.user_id, instruction)
    except NoActiveMandate as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except MissingApiKey as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except DeciderUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except CheckoutError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
