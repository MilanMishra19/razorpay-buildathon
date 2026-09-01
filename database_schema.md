# Database Schema — Agentic Commerce Buildathon Project

Track: AI Growth & Agentic Commerce
Scenario: personal shopping agent buying groceries/essentials within a monthly budget mandate

---

## 1. `users`

The person who owns the shopping agent and issues mandates to it.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID / BIGINT | **PK** | |
| `name` | VARCHAR | NOT NULL | |
| `email` | VARCHAR | NOT NULL, UNIQUE | |
| `password_hash` | VARCHAR | NOT NULL | bcrypt (or equivalent) hash — never store plain text |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT now() | |

---

## 2. `intent_mandates`

The user-issued policy that authorizes the agent to act. One active mandate per user at a time; re-issued when it expires.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID / BIGINT | **PK** | |
| `user_id` | UUID / BIGINT | **FK → users.id**, NOT NULL | |
| `category` | VARCHAR | NOT NULL | e.g. `groceries` |
| `standing_instruction` | TEXT | NULLABLE | the user's plain-language brief ("keep milk and bread stocked, prefer the cheaper brand") — the **only** input the LLM interprets. Part of the mandate because it is half of the authorisation: what you want, alongside what you allow. Included in the hashed snapshot, so changing it is visible in the ledger. |
| `per_order_cap` | DECIMAL | NOT NULL | max spend allowed in a single order |
| `monthly_cap` | DECIMAL | NOT NULL | max cumulative spend allowed in the mandate period |
| `escalation_threshold_pct` | DECIMAL | NOT NULL, DEFAULT 90 | when *projected* cumulative spend (already-paid this period + the proposed cart total) reaches this % of `monthly_cap`, the cart is flagged for review (`pending_approval`) instead of being auto-approved |
| `issued_at` | TIMESTAMP | NOT NULL | |
| `expires_at` | TIMESTAMP | NOT NULL | |
| `status` | VARCHAR | NOT NULL | `active` \| `expired` \| `revoked` |
| `mandate_hash` | VARCHAR | NOT NULL | hash of this mandate's content, referenced by downstream cart mandates and the audit log |

**Constraint:** partial unique index on `user_id WHERE status = 'active'` — enforces "one active mandate per user" at the database level, not just in application code.

---

## 3. `catalog`

The merchant's products the agent is allowed to browse.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID / BIGINT | **PK** | |
| `name` | VARCHAR | NOT NULL | |
| `category` | VARCHAR | NOT NULL | must match `intent_mandates.category` for a valid purchase |
| `price` | DECIMAL | NOT NULL | |
| `stock_status` | VARCHAR | NOT NULL | `in_stock` \| `out_of_stock` |
| `description` | TEXT | | free-text product description — this is the field used for the prompt-injection resistance demo |

No foreign keys — the catalog is independent of any user/mandate; it's simply what exists to be browsed.

---

## 4. `cart_mandates`

A proposed purchase, checked against an intent mandate before it can proceed to payment.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID / BIGINT | **PK** | |
| `user_id` | UUID / BIGINT | **FK → users.id**, NOT NULL | denormalized from `intent_mandates.user_id` — every dashboard query is "by user"; avoids joining back through the mandate (including *expired* ones) on every read |
| `intent_mandate_id` | UUID / BIGINT | **FK → intent_mandates.id**, NOT NULL | which mandate this cart is validated against |
| `idempotency_key` | VARCHAR | UNIQUE, NULLABLE | client-supplied; a retried `POST /cart-mandates` with the same key returns the original result instead of creating a duplicate cart |
| `cart_items` | JSON | NOT NULL | list of `{ catalog_id, quantity, unit_price }` — `unit_price` is snapshotted from the catalog at proposal time, never trusted from the caller |
| `total_amount` | DECIMAL | NOT NULL | recomputed server-side from catalog prices |
| `status` | VARCHAR | NOT NULL | `pending` \| `approved` \| `rejected` \| `pending_approval` |
| `rejection_reason` | VARCHAR | NULLABLE | human-readable reason, e.g. "exceeds monthly cap", "outside allowed category", "near monthly cap — requires approval" — populated when `status = rejected` or `pending_approval` |
| `cart_hash` | VARCHAR | NOT NULL | hash of this cart's content, referenced by a resulting payment mandate and the audit log |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT now() | |

**Concurrency:** the monthly-cap check and the resulting status must be decided under a row lock on the parent `intent_mandates` row — otherwise two carts proposed at the same time can both pass the cap check and later both be paid, blowing the cap.

---

## 5. `payment_mandates`

The executed transaction — only created for cart mandates that passed validation.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID / BIGINT | **PK** | |
| `user_id` | UUID / BIGINT | **FK → users.id**, NOT NULL | denormalized — see `cart_mandates.user_id` |
| `cart_mandate_id` | UUID / BIGINT | **FK → cart_mandates.id**, NOT NULL, UNIQUE | the approved cart that authorized this payment |
| `idempotency_key` | VARCHAR | UNIQUE, NULLABLE | client-supplied on `POST /payment-mandates`; guards against a double click charging twice |
| `razorpay_order_id` | VARCHAR | NOT NULL | reference from Razorpay's test-mode Orders API |
| `amount` | DECIMAL | NOT NULL | |
| `payment_status` | VARCHAR | NOT NULL | `created` \| `paid` \| `failed` |
| `paid_at` | TIMESTAMP | NULLABLE | populated once payment confirms |
| `payment_hash` | VARCHAR | NOT NULL | hash of this payment's content, referenced by the audit log |

**Retry:** `POST /payment-mandates/{id}/retry` updates this same row in place — the `UNIQUE` constraint on `cart_mandate_id` means a retry can never insert a second payment row for one cart. Each attempt still appends its own `audit_log` row.

---

## 6. `audit_log`

Generic, append-only, hash-chained log of every event across all three mandate types — the single source of truth for "what happened and why."

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID / BIGINT | **PK** | |
| `user_id` | UUID / BIGINT | **FK → users.id**, NOT NULL | denormalized so the dashboard timeline is a single indexed lookup — `reference_id` is polymorphic and can't be joined to a user directly |
| `type` | VARCHAR | NOT NULL | `intent_mandate` \| `cart_mandate` \| `payment_mandate` |
| `reference_id` | UUID / BIGINT | NOT NULL | **polymorphic reference** — the PK of the row in `intent_mandates`, `cart_mandates`, or `payment_mandates` this event concerns (no formal FK constraint, since it points to different tables depending on `type`) |
| `event` | VARCHAR | NOT NULL | `issued` \| `approved` \| `rejected` \| `awaiting_approval` \| `approved_by_user` \| `declined_by_user` \| `expired` \| `revoked` \| `paid` \| `failed` |
| `reason` | VARCHAR | NULLABLE | human-readable explanation — required for `rejected`, `awaiting_approval`, and `failed` events |
| `record_snapshot` | TEXT | NOT NULL | canonical (sorted-key) JSON of the referenced record's content captured at write time — stored verbatim so the chain can be re-verified from `audit_log` alone, without re-reading tables that may have legitimately changed since |
| `data_hash` | VARCHAR | NOT NULL | `SHA-256` over a canonical JSON of `{ prev_hash, type, reference_id, event, reason, record_snapshot }` — folds in the previous row's hash, so it doubles as this row's link in the chain |
| `prev_hash` | VARCHAR | NULLABLE | the previous row's `data_hash` — NULL only for the very first row; a fixed `"GENESIS"` sentinel is used in the hash input for that first row |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT now() | also the chain order (rows are verified in ascending `id`) |

**Tamper-evidence property:** editing any row's content (or its `record_snapshot`) changes its recomputed `data_hash`, which no longer matches the `prev_hash` the next row stored — `GET /audit-log/verify` recomputes the chain end to end and reports the first row where it breaks.

**One chain per user.** `prev_hash` links a row to that **user's** previous row, not the table's. Each user's ledger is an independent chain starting at its own genesis row, and `GET /audit-log/verify` walks only the caller's rows — so it verifies exactly what the dashboard displays, and one user's activity can never invalidate another's ledger. (A single global chain would also make per-user deletion impossible: removing anyone's rows would strand every `prev_hash` after them.)

**Append serialization:** appends run under a Postgres transaction-scoped advisory lock (`pg_advisory_xact_lock`) so `prev_hash` always points at the true tail — concurrent appends would otherwise fork the chain.

---

## 7. `restock_list`

The "needs restocking" queue. The Catalog View's *mark as low* action appends here; this list — not a timer or cron — is what feeds a shopping cycle.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID / BIGINT | **PK** | |
| `user_id` | UUID / BIGINT | **FK → users.id**, NOT NULL | |
| `catalog_id` | UUID / BIGINT | **FK → catalog.id**, NOT NULL | |
| `added_at` | TIMESTAMP | NOT NULL, DEFAULT now() | |
| `consumed_at` | TIMESTAMP | NULLABLE | set when a shopping cycle picks the item up — the row is kept for history instead of being deleted |

**Constraint:** partial unique index on `(user_id, catalog_id) WHERE consumed_at IS NULL` — an item can only sit in the open queue once.

---

## 8. `agent_runs`

One row per shopping cycle — the record of what the LLM was asked and what it answered. This is the evidence surface for the prompt-injection demo.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID / BIGINT | **PK** | |
| `user_id` | UUID / BIGINT | **FK → users.id**, NOT NULL | |
| `intent_mandate_id` | UUID / BIGINT | **FK → intent_mandates.id**, NOT NULL | mandate in force for this cycle |
| `restock_snapshot` | JSON | NOT NULL | the `catalog_id` list fed into the cycle |
| `prompt` | TEXT | NOT NULL | the exact assembled prompt sent to the model |
| `raw_response` | TEXT | NOT NULL | the model's raw output, stored verbatim before any validation |
| `parsed_cart` | JSON | NULLABLE | the validated `{ catalog_id, quantity }` list after post-processing |
| `flagged_catalog_ids` | JSON | NULLABLE | catalog entries the heuristic pre-check marked as suspicious |
| `cart_mandate_id` | UUID / BIGINT | **FK → cart_mandates.id**, NULLABLE | the cart this run produced, if any |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT now() | |

---

## Relationship summary

```
users (1) ──< intent_mandates (many, but only 1 "active" at a time)
users (1) ──< restock_list (many)     — denormalized user_id also carried on cart_mandates, payment_mandates, audit_log
intent_mandates (1) ──< cart_mandates (many)
intent_mandates (1) ──< agent_runs (many)
cart_mandates (1) ──< payment_mandates (0 or 1 — only if approved)
cart_mandates (1) ──< agent_runs (0 or 1 — the run that produced it)
audit_log ──> references any of: intent_mandates, cart_mandates, payment_mandates (via type + reference_id)
catalog ── independent; cart_mandates.cart_items and restock_list.catalog_id reference catalog.id per item
```

---

## Canonical status & event vocabulary

Single source of truth — `backend_api_endpoints.md` and `ai_agent_design.md` refer back here.

| Field | Values |
|---|---|
| `intent_mandates.status` | `active` \| `expired` \| `revoked` |
| `cart_mandates.status` | `pending` → `approved` \| `rejected` \| `pending_approval`; &nbsp; `pending_approval` → `approved` \| `rejected` (never silently expires into a payment) |
| `payment_mandates.payment_status` | `created` → `paid` \| `failed`; &nbsp; `failed` → (retry) → `paid` \| `failed` |
| `audit_log.type` | `intent_mandate` \| `cart_mandate` \| `payment_mandate` |
| `audit_log.event` | `issued` \| `approved` \| `rejected` \| `awaiting_approval` \| `approved_by_user` \| `declined_by_user` \| `expired` \| `revoked` \| `paid` \| `failed` |

Note the deliberate split: a cart's *state* is `pending_approval`, but the *audit event* recorded when it enters that state is `awaiting_approval`.
