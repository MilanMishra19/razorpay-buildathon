from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .agent import NoActiveMandate, run_all
from .checkout_client import CheckoutClient, CheckoutError
from .config import settings
from .llm import DeciderUnavailable, MissingApiKey, build_decider
from .models import RunReport, RunRequest


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
    yield
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
