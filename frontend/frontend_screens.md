# React Frontend — Screens & Design

App: Merchant/user dashboard for the agentic commerce buildathon project
Auth: simple email/password login, JWT stored in React in-memory state (no localStorage/cookies for now)

---

## 0. Login / Register

Entry point. Calls `POST /auth/login` or `POST /auth/register`. On success, stores the returned JWT in memory (app-level state, not persisted across refresh — acceptable tradeoff for a demo where login timing is controlled).

All screens below are protected routes — no valid token in memory → redirect here.

---

## 1. Mandate Overview (home screen)

The first thing a viewer sees. Communicates "here's the rule the agent is bound by" at a glance.

**Shows:**
- Active intent mandate: category, per-order cap, monthly cap, escalation threshold
- Spent-so-far this cycle / remaining budget (derived from paid payment mandates only, per the cumulative spend rule)
- Days until mandate expiry
- Option to issue/renew a mandate if none active, or revoke the current one

**Data source:** `GET /intent-mandates/active`

---

## 2. Pending Approvals Inbox

The only screen with real user *actions*, not just display. This is where the escalation guardrail becomes visible and interactive in a demo.

**Shows:** list of cart mandates with `status: pending_approval` — items, total amount, reason ("near monthly cap — requires approval"), with Approve / Decline buttons.

**Behavior:** auto-refreshes via polling (~every 3–5s) against `GET /cart-mandates?user_id={id}&status=pending_approval`, so a new pending cart appears without a manual refresh.

**Actions:** `POST /cart-mandates/{id}/resolve` with `decision: approve | decline`

---

## 3. Transaction Timeline

The evidence screen — human-readable audit trail, used to demonstrate that guardrails actually fired and why.

**Shows:** chronological list of audit events, each rendered from the `summary` field (e.g. "Cart of ₹450 for milk, bread, eggs — approved" / "Cart of ₹1,200 — rejected: exceeds monthly cap").

**Data source:** `GET /audit-log?user_id={id}`

---

## 4. Chain Integrity Check

Small, focused screen — a single dramatic action for the pitch: prove the audit trail hasn't been tampered with.

**Shows:** a button that calls `GET /audit-log/verify`, then displays a clear pass/fail result (and which row broke the chain, if any).

---

## 5. Catalog View (optional but recommended)

Shows what the agent is able to browse — including the seeded poisoned entry used for the prompt-injection resistance demo. Lets a viewer visually compare the malicious description against the agent's actual (unaffected) cart proposal.

**Data source:** `GET /catalog?category=groceries`

---

## Open implementation notes (not decisions, just carried context)

- Every API call after login attaches the in-memory JWT; a 401 response should redirect to login.
- Pending Approvals polling should stop/pause if the tab isn't visible, to avoid unnecessary calls — not essential for a demo, but cheap to add.
- If time allows post-MVP: upgrade JWT storage to cookie/localStorage so sessions survive a refresh.
