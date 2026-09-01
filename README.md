# Aethis — The Transaction Layer for AI Buyers

> **AI agents can decide what to buy. They should never be trusted to decide how much they are allowed to spend.**

**Track:** AI Growth & Agentic Commerce

## The problem

AI agents can already discover products, make decisions and complete purchases on someone's behalf.
Giving one direct payment authority opens a gap that nothing in the stack currently closes:

- a model can misread what the user meant
- catalog data can carry prompt injection
- an agent can exceed a spending limit
- a retry can create a duplicate transaction
- a substitution can quietly change the economics of a purchase
- a payment response can be forged
- an audit trail can be edited after the fact

So the question is not *"can an AI agent buy something?"* It is:

> **How can a merchant safely accept autonomous purchases from AI buyers?**

## What Aethis does

**Aethis is a transaction and policy layer that makes a merchant safely transactable by AI buyers.**

A user issues a standing **intent mandate** — *"Keep milk, bread and eggs stocked. Up to ₹1,000 per
order and ₹5,000 per month. Ask me before getting close to the limit."* The AI buyer interprets that
intent and proposes a cart. It has no financial authority.

Every proposal is independently re-evaluated by a deterministic checkout layer against category,
per-order cap, monthly cap, escalation threshold, inventory and substitution rules, and idempotency.
Only an approved transaction reaches Razorpay, and every money-related action is appended to a
tamper-evident hash chain.

```text
AI AGENT
    │  "I propose buying these items."
    ▼
┌──────────────────────────────┐
│       AETHIS POLICY          │
│  Category        ✓           │
│  Order cap       ✓           │
│  Monthly cap     ✓           │
│  Escalation      ✓ / ⚠       │
│  Inventory       ✓           │
│  Idempotency     ✓           │
└──────────────┬───────────────┘
        ┌──────┴──────┐
     APPROVE       ESCALATE / REJECT
        │             │
        ▼             ▼
     RAZORPAY       HUMAN APPROVAL
        └──────┬──────┘
               ▼
       HASH-CHAINED AUDIT
```

> **The agent gets intelligence. Aethis gets authority. Razorpay executes. The audit chain records what happened.**

## Why not just give the LLM the API?

Because reasoning is not authorization. The agent can be wrong, the catalog can be malicious, the
model can be manipulated, the network can retry, and a payment response can be forged.

| Responsibility | Owner |
|---|---|
| Understand user intent | AI Buyer |
| Select products | AI Buyer |
| Propose a cart | AI Buyer |
| Validate authorization | Aethis Policy Engine |
| Enforce monetary limits | Aethis Policy Engine |
| Decide whether approval is required | Aethis Policy Engine |
| Execute payment | Razorpay |
| Verify payment | Aethis Backend |
| Record transaction history | Aethis Audit Chain |

**The LLM can propose. It cannot authorize itself.**

## Core features

**1 · Intent mandates.** Standing purchasing policy: allowed category, per-order cap, monthly cap,
escalation threshold, expiry. One active mandate per category, enforced by a partial unique index.

**2 · Conversational AI buyer.** You tell the agent what to keep stocked and what you will spend. The
model reads *intent only* — a single structured extraction call. It then drafts a mandate and hands
it back for you to issue; it cannot issue one itself. Every answer it gives about money is assembled
from what the checkout API actually returned, so a sentence about spending cannot disagree with the
ledger. It carries the thread, so "make it 800" edits the draft rather than starting over, and it
answers the questions people actually ask — why a cart is waiting, why a named product was skipped,
what is queued, what the merchant sells — and asks rather than guessing when a category is unclear.

**3 · Autonomous cycles.** Autopilot is a switch, off by default. When on, the agent wakes on its own
schedule and runs the same cycle the button runs — same guardrails, same escalations, same audit
writes. Cycle history is visible.

**4 · Deterministic policy engine.** The checkout API re-validates every proposal. Every guardrail
runs and reports the numbers it compared, so a decision can be recomputed rather than believed. The
verdict belongs to the first check that failed.

**5 · Explainable decisions.** Never "transaction rejected" on its own:

```text
TRANSACTION BLOCKED · PER-ORDER CAP
Allowed  ₹500.00     Proposed ₹900.00     Excess ₹400.00
```

**6 · Human escalation.** Crossing the threshold routes a cart to an approval queue with the full
reckoning attached — what the AI chose, why, and which check it tripped.

**7 · Out-of-stock substitution.** When a queued item is unavailable the agent may propose the
nearest in-stock item in the same category and say why. The claim is checked against the catalog
before it is proposed: the replaced item must actually be one the user queued and actually be out of
stock. Any surviving swap goes to the user even when the budget has room, because buying something
they did not pick is a different decision from spending money they already approved. For the
merchant this turns `OUT OF STOCK → FAILED ORDER → ₹0` into a recoverable sale.

**8 · Prompt-injection defence.** Catalog content is data, never instruction. Instruction-shaped text
is screened out before the prompt is built; the output schema is a cart and nothing else; catalog ids
and arithmetic are validated afterwards; and the checkout API re-checks every cap regardless. The one
free-text field the model controls — the substitution rationale, which a human reads before
approving — is capped and screened the same way.

**9 · Real Razorpay test-mode checkout.** Approved carts reach Razorpay. The server verifies
`order_id|payment_id` with HMAC-SHA256 and a constant-time compare. A forged signature is *recorded*
as a failed payment rather than silently dropped.

**10 · Idempotent transactions.** A retried proposal replays the stored outcome instead of creating a
second payment, and the replay is counted.

**11 · Tamper-evident audit trail.** Every row hashes its own contents with the previous row's hash,
one chain per user. Change any stored row and every hash after it stops matching. The dashboard
verifies the chain live, and the demo tools can break and restore it on camera.

## Merchant value

| Metric | Meaning |
|---|---|
| AI GMV | Gross merchandise value paid through the agent |
| AI orders | Carts proposed by AI buyers |
| Completed | Proposals that became sales |
| Revenue recovered | Sales preserved by a safe substitution |
| Spend blocked | Value stopped by deterministic policy |
| Human approvals | Escalations a person resolved |
| Duplicates prevented | Retries that did not become second payments |
| Agent cycles | Autonomous shopping cycles executed |

Every figure is derived from carts, payments and agent runs at read time — there is no separate
metrics store, so the dashboard cannot drift from the ledger it summarises. Seeded demo history is
labelled as such on the page and belongs to a synthetic buyer, so it never appears in a real user's
carts, approvals or audit chain.

The point: **safety and revenue are not opposing goals.** A merchant can accept more autonomous
purchases precisely because the boundary holds.

## Architecture

```text
                    USER
                     │  intent / conversation
                     ▼
          ┌─────────────────────┐
          │     BUYER AGENT     │   LLM reasoning
          │      FastAPI        │   cart proposal
          └──────────┬──────────┘   substitution
                     │  proposal only
                     ▼
       ┌───────────────────────────┐
       │      AETHIS CHECKOUT      │   deterministic policy
       │       Spring Boot         │   spending limits
       │                           │   escalation, idempotency
       └─────────────┬─────────────┘   payment verification
              ┌──────┴──────┐
           APPROVED      ESCALATE
              │             │
              ▼             ▼
           RAZORPAY   HUMAN APPROVAL
              └──────┬──────┘
                     ▼
              AUDIT LOG CHAIN
                     │
                     ▼
             MERCHANT METRICS
```

Enforcement lives *only* in the checkout API. The agent depends on checkout; checkout never calls the
agent. The boundary does not call out to the thing it polices.

| Service | Stack | Responsibility |
|---|---|---|
| `aethis/` | Spring Boot 4.1, Java 21, JPA, Spring Security | Checkout API — auth, all policy enforcement, hash-chained audit log, Razorpay payments, merchant metrics |
| `ai/` | FastAPI, Python | Buyer agent — prompt assembly, one LLM call per cycle, deterministic validation, conversation, autopilot |
| `frontend/` | React 19, Vite, TypeScript | Shopper, approval and merchant dashboard |
| Database | PostgreSQL | Mandates, catalog, carts, payments, agent runs, audit chain |
| Payments | Razorpay test mode | Order creation and signature verification |

## Running

```bash
cp ai/.env.example .env && $EDITOR .env       # GROQ_API_KEY, optionally RAZORPAY_*
docker compose --profile full up --build
```

Dashboard on **:5173**, checkout API on **:8080** (OpenAPI at `/docs`), agent on **:8000**,
PostgreSQL on **:55432** (not 5432, to avoid clashing with a local install).

Or run each service directly:

```bash
docker compose up -d                          # just Postgres

cd aethis   && ./mvnw spring-boot:run         # :8080
cd ai       && ./.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
cd frontend && npm install && npm run dev     # :5173
```

Flyway applies the schema and seeds the catalog on first boot. `./mvnw test` and `pytest` both run
without a database or an API key.

| Service | Environment |
|---|---|
| `aethis` | `DB_URL`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `AGENT_SERVICE_TOKEN`; optional `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` (a stub is used when unset), `RAZORPAY_FORCE_FAILURE`, `DEMO_TOOLS` |
| `ai` | `CHECKOUT_API_URL`, `AGENT_SERVICE_TOKEN`, `LLM_PROVIDER` (`groq` \| `gemini` \| `offline`), `GROQ_API_KEY` / `GROQ_MODEL`, `GOOGLE_API_KEY` / `GEMINI_MODEL` |
| `frontend` | `VITE_CHECKOUT_API_URL`, `VITE_AGENT_API_URL` |

Then follow [`DEMO.md`](DEMO.md).

## Design docs

| Doc | Contents |
|---|---|
| [`database_schema.md`](database_schema.md) | Tables and the canonical status/event vocabulary all three services follow |
| [`aethis/backend_api_endpoints.md`](aethis/backend_api_endpoints.md) | REST contract for the checkout API |
| [`ai/ai_agent_design.md`](ai/ai_agent_design.md) | The single-LLM-call design and the injection defences |
| [`frontend/frontend_screens.md`](frontend/frontend_screens.md) | Screens and their data sources |
| [`DEMO.md`](DEMO.md) | The six-minute walkthrough, beat by beat |

## Engineering principles

1. LLM output is untrusted input. Validate it.
2. The agent never directly authorizes money movement.
3. Policy decisions are deterministic.
4. Every important financial action is auditable.
5. Retries must be safe.
6. Catalog content is data, not authority.
7. Human approval is an escalation mechanism, not the default workflow.

## Deliberate MVP boundaries

Single merchant, email/password auth only (no OAuth or refresh flow), in-memory JWT on the frontend,
interval-based autopilot rather than event-driven scheduling, polling instead of websockets,
test-mode payments. These are scope cuts, not oversights.

## The thesis

Traditional checkout assumes **human decides → checkout executes**. Agentic commerce changes that to
**AI decides → checkout executes**. Aethis inserts the missing layer:

> **AI proposes → policy authorizes → payment executes → audit proves what happened.**
