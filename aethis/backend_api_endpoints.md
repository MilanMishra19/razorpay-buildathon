# Spring Boot Backend — API Endpoints

Service: **Agent Checkout API**
Track: AI Growth & Agentic Commerce
Scope: single category (groceries), one active intent mandate per user

Core principle: this service is where **all guardrail enforcement happens**. The FastAPI agent can *propose* actions; only this service can *approve* them. No request from the agent should be able to reach `payment_mandates` without passing through an approved cart mandate first.

**Conventions:** all JSON (requests and responses) is `snake_case`. Enum values are lowercase (`active`, `pending_approval`, …). Errors are `application/problem+json` with a `detail` field. Money is a JSON number with 2 decimal places. The interactive contract is served at `/docs` (OpenAPI at `/v3/api-docs`).

---

## Auth

Simple email/password auth — no roles, no password reset, no OAuth. Every endpoint below (except register/login) requires a valid token; `user_id` is derived from the token server-side, never trusted from the request body.

### `POST /auth/register`
**Request:** `name`, `email`, `password`
**Response:** created user (no password_hash), or 409 if email already exists

### `POST /auth/login`
**Request:** `email`, `password`
**Response:** `{ token }` on success, 401 on invalid credentials

### Service-to-service auth (FastAPI agent → this API)

The agent is not a user. It calls this API with a shared secret header `X-Service-Token` **plus** `X-On-Behalf-Of: {user_id}` naming the user whose mandate it acts under. The gateway validates the secret, then treats that `user_id` exactly as if it had come from a user token. The agent never holds or replays a user JWT. Endpoints marked *(service-to-service only)* reject user tokens.

---

## Intent Mandate

### `POST /intent-mandates`
Issue a new mandate (user sets up or renews their monthly budget + rules). Creates the row in `intent_mandates` and writes the first `audit_log` entry (`event: issued`).

**Request:** `category`, `per_order_cap`, `monthly_cap`, `escalation_threshold_pct`, `expires_at` — `user_id` is taken from the caller's token, never the body

**Response:** the created mandate, including `id`, `status: active`, `mandate_hash`

### `GET /intent-mandates/active`
Get the currently active mandate for the authenticated user (or, for the agent, the user named in `X-On-Behalf-Of`). Called before proposing anything.

**Response:** the active mandate, or 404 if none is currently active

### `POST /intent-mandates/{id}/revoke`
Manually revoke/expire a mandate before its natural expiry. Writes an `audit_log` entry (`event: expired` or `revoked`).

**Response:** updated mandate with `status: revoked`

---

## Catalog

### `GET /catalog?category={category}`
Browse/list catalog items, filterable by category. This is what the FastAPI agent calls to see what's available.

**Response:** list of `{ id, name, category, price, stock_status, description }`

---

## Restock List

Backs the Catalog View's *mark as low* action and feeds the agent's shopping cycle. `user_id` is always from the token / `X-On-Behalf-Of`.

### `POST /restock-list`
Add a catalog item to the user's "needs restocking" queue. Idempotent per open item.
**Request:** `catalog_id`
**Response:** the queue entry (or the existing open one if already queued)

### `GET /restock-list`
The user's current open queue (`consumed_at IS NULL`). The agent reads this at the start of a cycle.

### `DELETE /restock-list/{id}`
Remove an item from the queue before a cycle consumes it.

---

## Cart Mandate

### `POST /cart-mandates`
Propose a cart (agent sends items + quantities). **This is where guardrail logic lives.** The `intent_mandate_id` is passed in the body and must be the caller's own **active** mandate (404 if it isn't theirs, 409 if it is expired or revoked). An unknown `catalog_id` is a `400`. Checks, in order, and the first failure wins:
1. Category compliance — every item's category matches the mandate's → else `rejected: outside allowed category`
2. Stock — no item is `out_of_stock` → else `rejected: item out of stock: <name>`
3. Per-order cap — cart total ≤ `per_order_cap` → else `rejected: exceeds per-order cap`
4. Cumulative monthly spend — *(already-paid this period + cart total)* ≤ `monthly_cap` → else `rejected: exceeds monthly cap`
5. Escalation threshold — if still within `monthly_cap` but *(already-paid + cart total)* ≥ `escalation_threshold_pct`% of `monthly_cap` → `pending_approval` (`reason: near monthly cap — requires approval`) instead of `approved`

Checks 4–5 and the resulting status decision run under a row lock on the parent intent mandate, so concurrent proposals can't both slip past the cap.

Writes an `audit_log` entry for the outcome (`event: approved` / `rejected` / `awaiting_approval`).

**Cumulative spend calculation:** `remaining_monthly_budget` is computed as `monthly_cap` minus the sum of `amount` from all **`payment_mandates` with `payment_status: paid`**, linked (via `cart_mandate_id → cart_mandates.intent_mandate_id`) to the active intent mandate. Approved-but-unpaid or failed carts do **not** count against the budget — only successfully completed payments do.

**Request:** `intent_mandate_id`, `cart_items: [{ catalog_id, quantity }]`, optional `idempotency_key` — the agent sends only `catalog_id` + `quantity`; unit prices and the total are filled in server-side from the catalog

**Response:**
```
{
  "status": "approved" | "rejected" | "pending_approval",
  "cart_mandate_id": "...",
  "reason": null | "outside allowed category" | "item out of stock: ..." | "exceeds per-order cap" | "exceeds monthly cap" | "near monthly cap — requires approval",
  "total_amount": 0.00,
  "remaining_monthly_budget": 0.00,
  "requires_confirmation": true | false
}
```

### `GET /cart-mandates/{id}`
Get a single cart mandate's current status.

### `GET /cart-mandates?status={status}`
Get cart mandate history for the authenticated user — powers the dashboard timeline and the Pending Approvals inbox. `user_id` comes from the token; optional `status` filter (e.g. `status=pending_approval`).

### `POST /cart-mandates/{id}/resolve`
Resolve a cart sitting in `pending_approval`. The user explicitly approves or declines. Writes an `audit_log` entry (`event: approved_by_user` or `declined_by_user`).

**Request:** `decision: "approve" | "decline"`

**Response:** updated cart mandate with `status: approved` or `rejected`

---

## Payment Mandate

### `POST /payment-mandates`
Execute payment for an approved cart. **Only callable if the referenced cart mandate's status is `approved`** (else `409`) — this is the checkpoint that guarantees no payment can happen without a validated, approved cart behind it. A cart that already has a payment row also returns `409` (use `/retry`). Creates an order via Razorpay's test-mode Orders API. Writes an `audit_log` entry (`event: paid`).

**Razorpay config:** set `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` for the real test-mode API. With no key set the service uses a **stub** that returns a synthetic `order_stub_…` id and succeeds — so the demo runs without credentials. `RAZORPAY_FORCE_FAILURE=true` makes the stub fail every attempt (for demoing the failure/retry path).

**Request:** `cart_mandate_id`, optional `idempotency_key`

**Response** (`201`): `{ payment_mandate_id, cart_mandate_id, razorpay_order_id, payment_status, amount, paid_at }` — `razorpay_order_id` and `paid_at` are `null` while `payment_status` is `failed`.

Writes `audit_log: paid` on success, or `audit_log: failed` (with the failure reason) if the order call fails — a failed payment must be visible in the audit trail, not silently dropped. The row is persisted either way so it can be retried. A failed payment does not count toward `monthly_cap` usage (see cumulative spend calculation above).

### `GET /payment-mandates/{id}`
Get payment status — reflects Razorpay's confirmation.

### `POST /payment-mandates/{id}/retry`
Retry a `failed` payment (else `409`) against the same already-approved cart mandate — no new cart proposal or re-validation, since the cart was already approved. **Updates the same payment row in place** (the `UNIQUE(cart_mandate_id)` constraint means there is never a second row); writes `audit_log: paid` on success or another `audit_log: failed` entry on repeat failure.

---

## Agent Runs

### `POST /agent-runs`  *(service-to-service only)*
The agent records a completed shopping cycle here — `intent_mandate_id`, `restock_snapshot`, `prompt`, `raw_response` (verbatim, pre-validation), `flagged_catalog_ids`, `parsed_cart`, and the `cart_mandate_id` it produced. Write-once.

### `GET /agent-runs?limit={n}`
Recent runs for the authenticated user.

### `GET /agent-runs/{id}`
One run's prompt, raw model response, heuristic flags, and resulting cart — powers the prompt-injection comparison on the Catalog View.

---

## Audit

### `GET /audit-log`
Get the full audit trail for the authenticated user — powers the dashboard timeline. `user_id` from the token.

**Response:** list of `{ id, type, event, reason, summary, timestamp }` — `summary` is a short human-readable line about the referenced record (e.g. "Cart of ₹450 for milk, bread, eggs") so the frontend doesn't need extra calls to explain each row. `id` is the audit row's own id, which is what `/audit-log/verify` reports as `broken_at_id`.

### `GET /audit-log/verify`
Recomputes the hash chain end to end and confirms nothing has been tampered with. Intended to be a real, callable, demoable action — not just internal logic.

**Response:**
```
{
  "is_valid": true | false,
  "broken_at_id": null | "..."
}
```

---

## Demo tools

Present only while `aethis.demo-tools` is `true` (the default; set `DEMO_TOOLS=false` to remove
them). These exist to make the pitch reproducible and to prove the audit chain actually detects
tampering. They can delete history and corrupt the ledger, so they do not belong outside a demo.

### `POST /demo/reset`
Wipes the authenticated user's mandates, carts, payments, restock queue, agent runs and audit rows. Leaves the account and the catalog alone.

### `POST /demo/tamper`
Edits a stored `audit_log.reason` for this user directly, without rewriting any hash — exactly what an attacker with database access would do. **Response:** `{ tampered_row_id }`. A following `GET /audit-log/verify` returns `is_valid: false` with that row as `broken_at_id`.

### `POST /demo/restore`
Undoes every tamper for this user, returning the chain to valid. **Response:** `{ restored_rows }`.

### `GET /demo/status`
`{ "enabled": true }` — the frontend uses this to decide whether to render the demo controls.

---

## Status values reference

**`cart_mandates.status`:** `pending` → `approved` | `rejected` | `pending_approval`
(`pending_approval` can only resolve to `approved` or `rejected` next — never silently expires into a payment)

**`payment_mandates.payment_status`:** `created` → `paid` | `failed` (→ retry → `paid` | `failed`)

**`intent_mandates.status`:** `active` | `expired` | `revoked`

**`audit_log.event`:** `issued` | `approved` | `rejected` | `awaiting_approval` | `approved_by_user` | `declined_by_user` | `expired` | `revoked` | `paid` | `failed`

The single source of truth for every status/event enum is `database_schema.md` → "Canonical status & event vocabulary". Keep this section in sync with it.
