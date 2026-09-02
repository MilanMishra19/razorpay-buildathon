# Aethis — The Transaction Layer for AI Buyers

> **AI agents can decide what to buy. They should never decide what they are allowed to spend.**

A shopping agent proposes a cart. A deterministic policy engine decides whether it may happen, and
says exactly why. Only an approved cart reaches Razorpay, and every money-related action is appended
to a tamper-evident hash chain.

**Track:** AI Growth & Agentic Commerce · **Stack:** Spring Boot 4 · FastAPI · React 19 · PostgreSQL · Razorpay test mode

```text
AI AGENT ──proposal──▶ POLICY ENGINE ──approved──▶ RAZORPAY
                            │                          │
                       escalate/refuse                  │
                            ▼                           ▼
                     HUMAN APPROVAL ──────────▶ HASH-CHAINED AUDIT
```

The agent gets intelligence. Aethis gets authority. Razorpay executes. The chain proves what happened.

## Why it exists

Giving an LLM direct payment authority opens gaps nothing in the stack closes: the model can misread
intent, catalog data can carry prompt injection, a retry can double-charge, a substitution can change
the economics of a purchase, and a payment response can be forged. Reasoning is not authorization.

## What it does

| | |
|---|---|
| **Intent mandates** | Standing policy per category: per-order cap, monthly cap, escalation threshold, expiry |
| **Conversational buyer** | The model reads *intent only* and drafts a mandate; issuing it is a separate confirm. Answers are assembled from the ledger, so they cannot disagree with it |
| **Deterministic policy engine** | Six checks per proposal, each reporting the numbers it compared — a decision can be recomputed, not just believed |
| **Human escalation** | Crossing the threshold routes a cart to approval with the full reckoning attached |
| **Substitution** | An out-of-stock item may be swapped for a real equivalent. The claim is verified against the catalog, and any swap goes to the user even when budget allows |
| **Injection defence** | Catalog text is data, never instruction: screened before the prompt, schema-constrained output, ids and arithmetic re-validated, caps re-checked server-side |
| **Real Razorpay checkout** | HMAC-SHA256 verification with constant-time compare; a forged signature is *recorded* as failed, not dropped |
| **Idempotency** | A retried proposal replays its stored outcome instead of creating a second payment |
| **Tamper-evident audit** | Every row hashes its contents with the previous row's hash. The dashboard breaks and restores the chain live |
| **Merchant analytics** | GMV, orders, revenue recovered by substitution, spend blocked by policy — all derived from the ledger at read time |

## Measured

| | |
|---|---|
| Policy decision, end to end | **43 ms p50 / 60 ms p95** (HTTP + JPA + 6 checks + chain append, n=40) |
| Chain verification | **26 ms p50** over 61 audit rows |
| Model calls per shopping cycle | **1** |
| Prompt injection: demanded vs purchased | **50 units vs 1** |
| Automated tests | **115** (34 Java, 81 Python) |

## Running

```bash
cp ai/.env.example .env && $EDITOR .env      # GROQ_API_KEY, optionally RAZORPAY_*
docker compose --profile full up --build
```

Dashboard **:5173** · API **:8080** (`/docs`) · Agent **:8000** · PostgreSQL **:55432**

Flyway applies the schema and seeds the catalog on first boot. Then follow [`DEMO.md`](DEMO.md) —
a six-minute walkthrough built around failures handled gracefully rather than a feature tour.

Provider is pluggable: `LLM_PROVIDER=groq | gemini | offline`. The offline decider is deterministic,
so a dead key cannot kill a demo — and the UI says when it is running.

## Docs

[`DEMO.md`](DEMO.md) — six-minute walkthrough · [`HANDOUT.md`](HANDOUT.md) — what to test and explore · [`database_schema.md`](database_schema.md) ·
[`aethis/backend_api_endpoints.md`](aethis/backend_api_endpoints.md) ·
[`ai/ai_agent_design.md`](ai/ai_agent_design.md) ·
[`frontend/frontend_screens.md`](frontend/frontend_screens.md)

## Principles

LLM output is untrusted input. The agent never authorizes money movement. Policy decisions are
deterministic. Every financial action is auditable. Retries are safe. Catalog content is data, not
authority. Human approval is an escalation, not the default path.

**Scope cuts:** single merchant, email/password auth, in-memory JWT, interval-based autopilot,
polling over websockets, test-mode payments.
