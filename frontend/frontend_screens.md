# React Frontend — Screens & Design

Six screens, ordered left-to-right in the nav to match the demo: **Overview → AI Buyer →
Transactions → Merchant → Catalog → Audit**. Design notes live in [`README.md`](README.md).

Everything reads the checkout API except the chat panel and autopilot, which talk to the agent.
State is deliberately plain: `useResource` polls an endpoint and exposes
`{ data, loading, error, reload }`. The server is the truth; every screen re-reads it.

## 0 · Login

Email/password, register or sign in. JWT is held in memory only — a refresh signs you out, which is
the honest behaviour for a token with no refresh flow.

## 1 · Overview

The mandate you are operating under and what it has cost. Budget meter against the monthly cap with
the escalation threshold marked, per-order cap, remaining budget, expiry. Below it: where the money
went, orders awaiting Razorpay checkout, and recent audit activity.

`GET /intent-mandates/active`, `/cart-mandates`, `/payment-mandates/awaiting-checkout`, `/audit-log`

## 2 · AI Buyer

The conversational surface. You state what to keep stocked and what you will spend; the agent drafts
a mandate and hands it back with an **ISSUE THIS MANDATE** button. It cannot issue one itself — that
click is the whole point of the screen.

Beside it: the **autopilot** switch (off by default, 60s/2m/5m interval, live countdown to the next
cycle), active mandates, and the history of autonomous cycles with what each one decided.

`POST /chat`, `POST /chat/confirm`, `GET|POST /agent/autopilot`, `GET /intent-mandates/active`

## 3 · Transactions

Every proposal and what policy did with it, filtered by *Pending approval* / *All* / *Blocked*.
Expanding one reveals the signature component:

```text
┌──────── AI DECISION ────────┐    ┌──────── POLICY DECISION ────────┐
│ SWAP  All Out Refill  ×1    │ →  │ ✓ Category                      │
│ Why: Good Knight was        │    │ ✓ Stock                         │
│ unavailable — closest       │    │ ✓ Per-order cap    ₹75 / ₹600   │
│ in-stock match              │    │ ✓ Monthly cap      ₹75 / ₹2000  │
│                             │    │ ✓ Escalation threshold          │
│ PROPOSAL ONLY ·             │    │ ⚠ Substitution                  │
│ NO SPENDING AUTHORITY       │    │ PENDING APPROVAL         ₹75.00 │
└─────────────────────────────┘    └─────────────────────────────────┘
```

A blocked cart additionally shows the arithmetic — allowed, proposed, excess. Pending carts get the
budget meter with the cart's contribution and **APPROVE & PAY** / **DECLINE**. Each cart carries its
own timeline, filtered out of the same audit log the chain verifies, so a timeline can never claim
something the ledger does not.

`GET /cart-mandates`, `POST /cart-mandates/{id}/resolve`, `POST /payment-mandates`, `GET /audit-log`

## 4 · Merchant

What the AI channel is worth: GMV, orders, completed sales, revenue recovered by substitution, and
below that what policy stopped and what the agent did. Seeded history is loadable for the demo and
the page badges itself when any of the figures include it.

`GET /merchant/metrics`, `POST /demo/seed-history`, `POST /demo/clear-history`

## 5 · Catalog

The product grid the agent browses. `+ ADD` queues an item for restock. A quantity stepper and
**PROPOSE** send a cart the agent never would, which is how a rejection gets demonstrated — the
guardrail re-checks every caller.

Beside it, the prompt-injection evidence panel, in the dark register reserved for raw machine output:
the poisoned listing in full, what the model was actually shown, what it returned, and the verdict
strip **DEMANDED 50 · PURCHASED 1**.

`GET /catalog`, `POST /restock-list`, `POST /cart-mandates`, `GET /agent-runs?limit=1`

## 6 · Audit

The ledger, and the proof it has not been edited. **VERIFY CHAIN** walks it row by row, sealing each
one. **TAMPER** edits a stored row behind the application's back; verifying again stops dead and
names the row. **RESTORE** puts it back.

`GET /audit-log`, `GET /audit-log/verify`, `POST /demo/tamper`, `POST /demo/restore`

## Conventions

- Wire format is snake_case; TypeScript interfaces in `src/api/types.ts` mirror it exactly.
- A 401 anywhere clears the session and returns to login.
- Degradation is shown, never hidden: when the model was unavailable and a cycle ran on the offline
  decider, the run summary says so.
