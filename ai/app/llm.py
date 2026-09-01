import json
import time
from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol

from .models import CartLine, CatalogItem, Mandate, RestockEntry
from .prompt import SYSTEM, build_user_content

CART_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "catalog_id": {"type": "integer"},
                    "quantity": {"type": "integer"},
                },
                "required": ["catalog_id", "quantity"],
            },
        }
    },
    "required": ["items"],
}

TRANSIENT_STATUSES = (429, 500, 503)


@dataclass
class Decision:
    lines: list[CartLine]
    prompt: str
    raw_response: str


class Decider(Protocol):
    def __call__(
        self,
        mandate: Mandate,
        entries: list[RestockEntry],
        items: list[CatalogItem],
        instruction: str,
    ) -> Decision: ...


class MissingApiKey(RuntimeError):
    pass


class DeciderUnavailable(RuntimeError):
    pass


class GeminiDecider:
    def __init__(self, api_key: str | None, model: str, max_output_tokens: int, attempts: int = 3) -> None:
        self._api_key = api_key
        self._model = model
        self._max_output_tokens = max_output_tokens
        self._attempts = attempts

    def __call__(self, mandate, entries, items, instruction) -> Decision:
        if not self._api_key:
            raise MissingApiKey("GOOGLE_API_KEY is not configured")

        from google import genai
        from google.genai import types

        user_content = build_user_content(instruction, mandate, entries, items)
        client = genai.Client(api_key=self._api_key)
        config = types.GenerateContentConfig(
            system_instruction=SYSTEM,
            response_mime_type="application/json",
            response_schema=CART_SCHEMA,
            max_output_tokens=self._max_output_tokens,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )

        raw = self._generate(client, user_content, config)
        return Decision(parse_cart(raw), full_prompt(user_content), raw)

    def _generate(self, client, user_content: str, config) -> str:
        last_error: Exception | None = None
        for attempt in range(self._attempts):
            try:
                response = client.models.generate_content(
                    model=self._model, contents=user_content, config=config
                )
                return response.text or ""
            except Exception as exc:
                if not is_transient(exc) or attempt == self._attempts - 1:
                    raise DeciderUnavailable(f"{self._model} call failed: {exc}") from exc
                last_error = exc
                time.sleep(2**attempt)
        raise DeciderUnavailable(str(last_error))


class OfflineDecider:
    def __call__(self, mandate, entries, items, instruction) -> Decision:
        by_id = {item.id: item for item in items}
        budget = min(mandate.per_order_cap, mandate.remaining_monthly_budget)

        lines: list[CartLine] = []
        running = Decimal("0")
        for entry in entries:
            item = by_id.get(entry.catalog_id)
            if item is None or item.stock_status != "in_stock":
                continue
            if running + item.price > budget:
                continue
            running += item.price
            lines.append(CartLine(catalog_id=item.id, quantity=1))

        raw = json.dumps({"items": [line.model_dump() for line in lines]})
        prompt = full_prompt(build_user_content(instruction, mandate, entries, items))
        return Decision(lines, f"{prompt}\n\n[offline decider: no model was called]", raw)


def is_transient(exc: Exception) -> bool:
    status = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    if status in TRANSIENT_STATUSES:
        return True
    return any(str(code) in str(exc) for code in TRANSIENT_STATUSES)


def full_prompt(user_content: str) -> str:
    return f"{SYSTEM}\n\n---\n\n{user_content}"


def build_decider(provider: str, api_key: str | None, model: str, max_output_tokens: int) -> Decider:
    if provider == "offline":
        return OfflineDecider()
    if provider == "gemini":
        return GeminiDecider(api_key, model, max_output_tokens)
    raise ValueError(f"unknown LLM_PROVIDER: {provider}")


def parse_cart(raw: str) -> list[CartLine]:
    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []

    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        return []

    lines: list[CartLine] = []
    for entry in items:
        try:
            lines.append(CartLine.model_validate(entry))
        except Exception:
            continue
    return lines
