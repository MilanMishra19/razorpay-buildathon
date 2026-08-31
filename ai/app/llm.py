import json
from typing import Protocol

import anthropic

from .models import CartLine

CART_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "catalog_id": {"type": "integer"},
                    "quantity": {"type": "integer", "minimum": 1},
                },
                "required": ["catalog_id", "quantity"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["items"],
    "additionalProperties": False,
}


class Decider(Protocol):
    def __call__(self, system: str, user_content: str) -> tuple[list[CartLine], str]: ...


class MissingApiKey(RuntimeError):
    pass


class AnthropicDecider:
    def __init__(self, api_key: str | None, model: str, max_tokens: int) -> None:
        self._api_key = api_key
        self._model = model
        self._max_tokens = max_tokens

    def __call__(self, system: str, user_content: str) -> tuple[list[CartLine], str]:
        if not self._api_key:
            raise MissingApiKey("ANTHROPIC_API_KEY is not configured")

        client = anthropic.Anthropic(api_key=self._api_key)
        response = client.messages.create(
            model=self._model,
            max_tokens=self._max_tokens,
            thinking={"type": "adaptive"},
            system=system,
            messages=[{"role": "user", "content": user_content}],
            output_config={"format": {"type": "json_schema", "schema": CART_SCHEMA}},
        )

        raw = next((block.text for block in response.content if block.type == "text"), "")
        return parse_cart(raw), raw


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
