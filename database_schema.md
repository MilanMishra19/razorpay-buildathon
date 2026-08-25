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
| `per_order_cap` | DECIMAL | NOT NULL | max spend allowed in a single order |
| `monthly_cap` | DECIMAL | NOT NULL | max cumulative spend allowed in the mandate period |
| `escalation_threshold_pct` | DECIMAL | NOT NULL, DEFAULT 90 | % of monthly_cap at which orders get flagged for review instead of silently approved |
| `issued_at` | TIMESTAMP | NOT NULL | |
| `expires_at` | TIMESTAMP | NOT NULL | |
| `status` | VARCHAR | NOT NULL | `active` \| `expired` \| `revoked` |
| `mandate_hash` | VARCHAR | NOT NULL | hash of this mandate's content, referenced by downstream cart mandates and the audit log |

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
| `intent_mandate_id` | UUID / BIGINT | **FK → intent_mandates.id**, NOT NULL | which mandate this cart is validated against |
| `cart_items` | JSON | NOT NULL | list of `{ catalog_id, quantity, unit_price }` |
| `total_amount` | DECIMAL | NOT NULL | |
| `status` | VARCHAR | NOT NULL | `pending` \| `approved` \| `rejected` \| `flagged` |
| `rejection_reason` | VARCHAR | NULLABLE | human-readable reason, e.g. "exceeds monthly cap", "outside allowed category" — populated only when `status = rejected` or `flagged` |
| `cart_hash` | VARCHAR | NOT NULL | hash of this cart's content, referenced by a resulting payment mandate and the audit log |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT now() | |

---

## 5. `payment_mandates`

The executed transaction — only created for cart mandates that passed validation.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID / BIGINT | **PK** | |
| `cart_mandate_id` | UUID / BIGINT | **FK → cart_mandates.id**, NOT NULL, UNIQUE | the approved cart that authorized this payment |
| `razorpay_order_id` | VARCHAR | NOT NULL | reference from Razorpay's test-mode Orders API |
| `amount` | DECIMAL | NOT NULL | |
| `payment_status` | VARCHAR | NOT NULL | `created` \| `paid` \| `failed` |
| `paid_at` | TIMESTAMP | NULLABLE | populated once payment confirms |
| `payment_hash` | VARCHAR | NOT NULL | hash of this payment's content, referenced by the audit log |

---

## 6. `audit_log`

Generic, append-only, hash-chained log of every event across all three mandate types — the single source of truth for "what happened and why."

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID / BIGINT | **PK** | |
| `type` | VARCHAR | NOT NULL | `intent_mandate` \| `cart_mandate` \| `payment_mandate` |
| `reference_id` | UUID / BIGINT | NOT NULL | **polymorphic reference** — the PK of the row in `intent_mandates`, `cart_mandates`, or `payment_mandates` this event concerns (no formal FK constraint, since it points to different tables depending on `type`) |
| `event` | VARCHAR | NOT NULL | `issued` \| `approved` \| `rejected` \| `flagged` \| `expired` \| `paid` |
| `reason` | VARCHAR | NULLABLE | human-readable explanation — required for `rejected`/`flagged` events |
| `data_hash` | VARCHAR | NOT NULL | hash of the relevant record's content at this moment |
| `prev_hash` | VARCHAR | NULLABLE | hash of the previous row in `audit_log` — NULL only for the very first row; this is what makes the chain tamper-evident |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT now() | |

**Tamper-evidence property:** editing any row's content changes its `data_hash`, which breaks every `prev_hash` reference in every row that follows — this can be verified by recomputing the chain end to end.

---

## Relationship summary

```
users (1) ──< intent_mandates (many, but only 1 "active" at a time)
intent_mandates (1) ──< cart_mandates (many)
cart_mandates (1) ──< payment_mandates (0 or 1 — only if approved)
audit_log ──> references any of: intent_mandates, cart_mandates, payment_mandates (via type + reference_id)
catalog ── independent; cart_mandates.cart_items references catalog.id per item (within the JSON, not a formal FK)
```
