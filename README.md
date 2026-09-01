# Aethis — Agentic Commerce Buildathon

**Track:** AI Growth & Agentic Commerce
**Scenario:** a personal shopping agent that restocks groceries/essentials within a user-issued monthly budget mandate — bounded by hard guardrails, with every action written to a tamper-evident audit log.

## The idea in one paragraph

A user issues an **intent mandate** ("keep milk, bread, eggs stocked; ₹X per order; ₹Y per month; flag anything near the cap"). The **agent** interprets that vague standing instruction with *exactly one* LLM call per shopping cycle and proposes a cart. The **checkout API** independently re-validates every proposal against the mandate — category, per-order cap, monthly cap, escalation threshold — and only an approved cart can reach payment. Every issue / approve / reject / flag / pay event is appended to a hash-chained `audit_log` that can be verified end to end.

## Services

| Path | Stack | Responsibility |
|---|---|---|
| `aethis/` | Spring Boot 4.1, Java 21, JPA, Spring Security | **Agent Checkout API** — auth, all guardrail enforcement, hash-chained audit log, Razorpay test-mode payments. Enforcement lives *only* here; the agent can only propose. |
| `ai/` | FastAPI (Python) | **Buyer Agent** — assembles one prompt, makes one LLM call → strict JSON, deterministically validates it, forwards the cart to the checkout API, records the run. *Not yet scaffolded.* |
| `frontend/` | React 19, Vite, TypeScript | Dashboard — mandate overview, pending-approvals inbox, transaction timeline, chain-integrity check, catalog + prompt-injection demo. |

## Design docs

| Doc | Contents |
|---|---|
| [`database_schema.md`](database_schema.md) | Tables + **canonical status/event vocabulary** — the source of truth all three services follow |
| [`aethis/backend_api_endpoints.md`](aethis/backend_api_endpoints.md) | REST contract for the checkout API |
| [`ai/ai_agent_design.md`](ai/ai_agent_design.md) | The single-LLM-call design and the prompt-injection defenses |
| [`frontend/frontend_screens.md`](frontend/frontend_screens.md) | Screens and their data sources |
| [`DEMO.md`](DEMO.md) | The six-minute walkthrough, beat by beat |

## Running (target)

```bash
# infra — Postgres 17 on host port 55432 (avoids clashing with a local install on 5432)
docker compose up -d

# checkout API — :8080, OpenAPI UI at /docs
cd aethis && ./mvnw spring-boot:run

# agent
cd ai && uvicorn app.main:app --reload        # :8000

# frontend
cd frontend && npm install && npm run dev     # :5173
```

The backend defaults to `jdbc:postgresql://localhost:55432/aethis` (user/pass `aethis`/`aethis`); override with `DB_URL` / `DB_USER` / `DB_PASSWORD`. Flyway applies the schema and seeds the catalog on first boot. `./mvnw test` runs against in-memory H2 and needs no database.

Environment:

| Service | Vars |
|---|---|
| `aethis` | `DB_URL`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `AGENT_SERVICE_TOKEN`; optional `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` (a stub is used when unset), `RAZORPAY_FORCE_FAILURE` |
| `ai` | `CHECKOUT_API_URL`, `AGENT_SERVICE_TOKEN`, `LLM_PROVIDER` (`gemini` \| `offline`), `GOOGLE_API_KEY`, `GEMINI_MODEL` |
| `frontend` | `VITE_CHECKOUT_API_URL`, `VITE_AGENT_API_URL` |

## Build phases

0. **Contract lock** — reconcile enums across docs, add the missing schema tables (`restock_list`, `agent_runs`, denormalized `user_id`, partial indexes), add DB driver + JWT lib + `springdoc-openapi` + validation to `pom.xml`, decide service-to-service auth, stand up docker-compose + a seed script.
1. **Backend: auth + data layer** — entities, Flyway migrations, register/login + JWT filter, CORS, catalog endpoints + seed (including the poisoned entry), intent-mandate issue / active / revoke with the first audit write.
2. **Backend: guardrail engine + audit chain** — `POST /cart-mandates` with the 4 ordered checks, cumulative-spend calc (paid payments only), escalation → `pending_approval`, `resolve`, SHA-256 hash chain with serialized append, `GET /audit-log` + `/audit-log/verify`.
3. **Payments** — Razorpay test-mode Orders API via `RestClient`, payment gated on an approved cart, retry-in-place, idempotency keys.
4. **AI agent** — FastAPI skeleton + checkout-API client, prompt assembly (catalog data structurally separated from instructions), one LLM call → JSON schema, heuristic injection pre-check, post-processing (catalog-id + arithmetic validation), persist `agent_runs`, manual `POST /agent/run`.
5. **Frontend** — auth + protected routes + 401 interceptor, the 5 screens, mark-as-low + run-agent actions, the injection comparison view.
6. **Integration + demo polish** — full docker-compose, seed/reset endpoint, scripted walkthrough of every guardrail path, the profile-guarded "corrupt a row" tamper demo, guardrail-engine unit tests.

~6.5 days solo; ~3 days split across backend / agent / frontend once phase 0 locks the contract. Build one vertical slice end to end before widening.

## Non-goals (deliberate scope cuts)

Single merchant, single category (groceries), one active mandate per user, email/password auth only (no OAuth / refresh / reset), in-memory JWT on the frontend, manual agent trigger, polling instead of websockets.
