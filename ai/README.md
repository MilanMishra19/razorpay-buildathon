# Buyer Agent (FastAPI)

The agent half of Aethis. It turns a vague standing instruction into one concrete cart
proposal per cycle, using **exactly one** LLM call. Everything before and after that call is
deterministic Python, and nothing the model produces is trusted.

Design rationale lives in [`ai_agent_design.md`](ai_agent_design.md); this file is how to run it.

## Running

```bash
python -m venv .venv
./.venv/Scripts/python -m pip install -e ".[dev]"     # .venv/bin/python on macOS/Linux
cp .env.example .env                                   # then set ANTHROPIC_API_KEY
./.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

The checkout API must be running on `CHECKOUT_API_URL` (default `http://localhost:8080`).

```bash
curl -X POST localhost:8000/agent/run \
  -H 'Content-Type: application/json' \
  -d '{"user_id": 1, "instruction": "keep milk, bread and eggs stocked"}'
```

`instruction` is optional; omitting it uses `default_instruction` from `app/config.py`.

## One cycle

| Step | Who |
|---|---|
| Read the active mandate, the restock list, and the catalog slice for its category | deterministic |
| Screen every catalog description for injection patterns; withhold the ones that trip it | deterministic (`injection.py`) |
| Assemble one prompt: mandate + budget as instructions, catalog as clearly-labelled untrusted data | deterministic (`prompt.py`) |
| **Decide what to buy** | the single LLM call (`llm.py`) |
| Drop any `catalog_id` that isn't in the catalog | deterministic |
| Propose the cart to the checkout API, which enforces the real guardrails | deterministic |
| Record the run — prompt, raw response, flags, parsed cart | deterministic |
| Pay if approved; stop if flagged for approval; do nothing if rejected | deterministic |

## Prompt-injection resistance

Two independent layers, neither of which relies on the model behaving:

1. **The description never reaches the model.** `injection.py` screens catalog text for
   instruction-shaped patterns and replaces a flagged description with a placeholder before
   the prompt is built. The flagged ids are recorded on the run.
2. **The output contract cannot express an attack.** The response is constrained to a JSON
   schema of `{catalog_id, quantity}` pairs. There is no field in which a successfully
   influenced model could express an instruction, a credential, or an action.

Behind both, the checkout API re-validates category, stock, per-order cap, monthly cap and
the escalation threshold regardless of what the agent proposed.

## Tests

```bash
./.venv/Scripts/python -m pytest
```

No API key needed — the LLM call is injected, so the tests drive the whole cycle with a
scripted decider and a fake checkout client.
