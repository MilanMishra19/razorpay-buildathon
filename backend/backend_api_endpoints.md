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

---

## Intent Mandate

### `POST /intent-mandates`
Issue a new mandate (user sets up or renews their monthly budget + rules). Creates the row in `intent_mandates` and writes the first `audit_log` entry (`event: issued`).

**Request:** `user_id`, `category`, `per_order_cap`, `monthly_cap`, `escalation_threshold_pct`, `expires_at`

**Response:** the created mandate, including `id`, `status: active`, `mandate_hash`

### `GET /intent-mandates/active?user_id={id}`
Get the currently active mandate for a user. The agent calls this before proposing anything.

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

## Cart Mandate

### `POST /cart-mandates`
Propose a cart (agent sends items + quantities). **This is where guardrail logic lives.** Looks up the caller's active intent mandate and checks, in order:
1. Category compliance
2. Per-order cap
3. Cumulative monthly spend (against monthly_cap)
4. Escalation threshold (if within cap but ≥ escalation_threshold_pct of monthly_cap → `pending_approval` instead of `approved`)

Writes an `audit_log` entry for the outcome (`event: approved` / `rejected` / `awaiting_approval`).

**Cumulative spend calculation:** `remaining_monthly_budget` is computed as `monthly_cap` minus the sum of `amount` from all **`payment_mandates` with `payment_status: paid`**, linked (via `cart_mandate_id → cart_mandates.intent_mandate_id`) to the active intent mandate. Approved-but-unpaid or failed carts do **not** count against the budget — only successfully completed payments do.

**Request:** `intent_mandate_id`, `cart_items: [{ catalog_id, quantity }]`

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

### `GET /cart-mandates?user_id={id}`
Get cart mandate history for a user — powers the dashboard timeline.

### `POST /cart-mandates/{id}/resolve`
Resolve a cart sitting in `pending_approval`. The user explicitly approves or declines. Writes an `audit_log` entry (`event: approved_by_user` or `declined_by_user`).

**Request:** `decision: "approve" | "decline"`

**Response:** updated cart mandate with `status: approved` or `rejected`

---

## Payment Mandate

### `POST /payment-mandates`
Execute payment for an approved cart. **Only callable if the referenced cart mandate's status is `approved`** — this is the checkpoint that guarantees no payment can happen without a validated, approved cart behind it. Calls Razorpay's test-mode Orders API. Writes an `audit_log` entry (`event: paid`).

**Request:** `cart_mandate_id`

**Response:** `{ payment_mandate_id, razorpay_order_id, payment_status, amount, paid_at }`

Writes `audit_log: paid` on success, or `audit_log: failed` if the Razorpay call fails — a failed payment must be visible in the audit trail, not silently dropped. A failed payment does not count toward `monthly_cap` usage (see cumulative spend calculation above).

### `GET /payment-mandates/{id}`
Get payment status — reflects Razorpay's confirmation.

### `POST /payment-mandates/{id}/retry`
Retry a `failed` payment against the same already-approved cart mandate — no new cart proposal or re-validation needed, since the cart was already approved. Writes `audit_log: paid` on success or another `audit_log: failed` entry on repeat failure.

---

## Audit

### `GET /audit-log?user_id={id}`
Get the full audit trail for a user — powers the dashboard timeline.

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
