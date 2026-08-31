# Spring Boot Backend — API Endpoints

Service: **Agent Checkout API**
Track: AI Growth & Agentic Commerce
Scope: single category (groceries), one active intent mandate per user

Core principle: this service is where **all guardrail enforcement happens**. The FastAPI agent can *propose* actions; only this service can *approve* them. No request from the agent should be able to reach `payment_mandates` without passing through an approved cart mandate first.

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
Propose a cart (agent sends items + quantities). **This is where guardrail logic lives.** Looks up the caller's active intent mandate and checks, in order:
1. Category compliance
2. Per-order cap
3. Cumulative monthly spend (against `monthly_cap`)
4. Escalation threshold — if the cart stays within `monthly_cap` but *(already-paid spend this period + this cart's total)* ≥ `escalation_threshold_pct`% of `monthly_cap` → `pending_approval` instead of `approved`

Steps 3–4 and the resulting status decision run under a row lock on the parent intent mandate, so concurrent proposals can't both slip past the cap.

Writes an `audit_log` entry for the outcome (`event: approved` / `rejected` / `awaiting_approval`).

**Cumulative spend calculation:** `remaining_monthly_budget` is computed as `monthly_cap` minus the sum of `amount` from all **`payment_mandates` with `payment_status: paid`**, linked (via `cart_mandate_id → cart_mandates.intent_mandate_id`) to the active intent mandate. Approved-but-unpaid or failed carts do **not** count against the budget — only successfully completed payments do.

**Request:** `intent_mandate_id`, `cart_items: [{ catalog_id, quantity }]`, optional `idempotency_key` — the agent sends only `catalog_id` + `quantity`; unit prices and the total are filled in server-side from the catalog

**Response:**
```
{
  "status": "approved" | "rejected" | "pending_approval",
  "cart_mandate_id": "...",
  "reason": null | "exceeds monthly cap" | "outside allowed category" | "near monthly cap — requires approval",
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
Execute payment for an approved cart. **Only callable if the referenced cart mandate's status is `approved`** — this is the checkpoint that guarantees no payment can happen without a validated, approved cart behind it. Calls Razorpay's test-mode Orders API. Writes an `audit_log` entry (`event: paid`).

**Request:** `cart_mandate_id`, optional `idempotency_key`

**Response:** `{ payment_mandate_id, razorpay_order_id, payment_status, amount, paid_at }`

Writes `audit_log: paid` on success, or `audit_log: failed` if the Razorpay call fails — a failed payment must be visible in the audit trail, not silently dropped. A failed payment does not count toward `monthly_cap` usage (see cumulative spend calculation above).

### `GET /payment-mandates/{id}`
Get payment status — reflects Razorpay's confirmation.

### `POST /payment-mandates/{id}/retry`
Retry a `failed` payment against the same already-approved cart mandate — no new cart proposal or re-validation needed, since the cart was already approved. Writes `audit_log: paid` on success or another `audit_log: failed` entry on repeat failure.

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

**Response:** list of `{ type, event, reason, summary, timestamp }` — `summary` is a short human-readable line about the referenced record (e.g. "Cart of ₹450 for milk, bread, eggs") so the frontend doesn't need extra calls to explain each row.

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

## Status values reference

**`cart_mandates.status`:** `pending` → `approved` | `rejected` | `pending_approval`
(`pending_approval` can only resolve to `approved` or `rejected` next — never silently expires into a payment)

**`payment_mandates.payment_status`:** `created` → `paid` | `failed` (→ retry → `paid` | `failed`)

**`intent_mandates.status`:** `active` | `expired` | `revoked`

**`audit_log.event`:** `issued` | `approved` | `rejected` | `awaiting_approval` | `approved_by_user` | `declined_by_user` | `expired` | `revoked` | `paid` | `failed`

The single source of truth for every status/event enum is `database_schema.md` → "Canonical status & event vocabulary". Keep this section in sync with it.
