# Aethis Web (React + Vite)

The control surface for the shopping agent: issue mandates, watch cycles run, approve what the
guardrail escalates, and verify the ledger. Screen-by-screen intent lives in
[`frontend_screens.md`](frontend_screens.md).

## Running

```bash
npm install
npm run dev          # http://localhost:5173
```

| Var | Default | What it points at |
|---|---|---|
| `VITE_CHECKOUT_API_URL` | `http://localhost:8080` | Spring Boot checkout API |
| `VITE_AGENT_API_URL` | `http://localhost:8000` | FastAPI agent |

The whole stack (Postgres + both services + this app behind nginx) comes up with
`docker compose --profile full up --build` from the repo root.

## Design

Two visual registers, because there are two audiences.

**The storefront** — Catalog, Mandate, Approvals, Login — is quick-commerce: warm paper ground,
white cards on a soft lift, rounded corners, pill controls, and a tangerine accent. Prices and
headings are set in Bricolage Grotesque; body copy in Plus Jakarta Sans. The Catalog is a product
grid, and each tile's glyph is derived from the item's own name and category, so a new catalog row
renders without a code change.

**The evidence** — the injection panel's prompt slice, the model's raw JSON, the demanded-vs-purchased
cells — is dark and monospaced. Raw machine output looks like raw machine output, and nothing else
in the app does.

Timeline and Chain sit in the storefront register deliberately: their rows are human-readable
summaries of what happened, not machine output, so they stay dense rather than dark.

Everything is driven by tokens in [`src/styles/tokens.css`](src/styles/tokens.css) — colours,
radii, lift, and the three type families. Components read the tokens, so re-theming is a matter of
changing values there rather than touching screens.

## Shape

```
src/
  api/         typed client, snake_case wire format, polling hook
  auth/        in-memory JWT, protected routes, 401 interceptor
  components/  Panel / Button / Chip primitives, budget meter, product glyphs
  screens/     the six screens
  styles/      the token file
```

State is deliberately plain: `useResource` polls an endpoint on an interval and exposes
`{ data, loading, error, reload }`. No store, no cache layer — the server is the truth, and every
screen re-reads it.

## Checks

```bash
npx tsc --noEmit -p tsconfig.app.json
npm run build
```
