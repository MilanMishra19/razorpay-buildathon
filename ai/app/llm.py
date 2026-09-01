import json
import time
from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol

import httpx

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
                    "substitutes_for": {
                        "type": "integer",
                        "nullable": True,
                        "description": "catalog_id of the unavailable item this stands in for, if any",
                    },
                    "rationale": {
                        "type": "string",
                        "nullable": True,
                        "description": "one short sentence on why this substitute fits, required when substitutes_for is set",
                    },
                },
                "required": ["catalog_id", "quantity"],
            },
        }
    },
    "required": ["items"],
}

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

# Groq speaks JSON Schema rather than Gemini's OpenAPI dialect, and strict mode wants every
# property listed as required and the object closed.
GROQ_CART_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "catalog_id": {"type": "integer"},
                    "quantity": {"type": "integer"},
                    "substitutes_for": {"type": ["integer", "null"]},
                    "rationale": {"type": ["string", "null"]},
                },
                "required": ["catalog_id", "quantity", "substitutes_for", "rationale"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["items"],
    "additionalProperties": False,
}

TRANSIENT_STATUSES = (429, 500, 502, 503)


@dataclass
class Decision:
    lines: list[CartLine]
    prompt: str
    raw_response: str
    degraded: str | None = None


class Decider(Protocol):
    def __call__(
        self,
        mandate: Mandate,
        entries: list[RestockEntry],
        items: list[CatalogItem],
        instruction: str,
    ) -> Decision: ...

    def classify(
        self, system: str, message: str, schema: dict, history: list[dict] | None = None
    ) -> str: ...


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

    def classify(self, system, message, schema, history=None) -> str:
        if not self._api_key:
            raise MissingApiKey("GOOGLE_API_KEY is not configured")

        from google import genai
        from google.genai import types

        client = genai.Client(api_key=self._api_key)
        config = types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_schema=schema,
            max_output_tokens=512,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        return self._generate(client, as_transcript(history, message), config)

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


class GroqDecider:
    """
    Groq's API is OpenAI-shaped, so the cart comes back as a JSON string in the message content,
    pinned to a strict schema rather than trusted to arrive well-formed.
    """

    def __init__(
        self,
        api_key: str | None,
        model: str,
        max_output_tokens: int,
        timeout: float = 60.0,
        attempts: int = 3,
    ) -> None:
        self._api_key = api_key
        self._model = model
        self._max_output_tokens = max_output_tokens
        self._timeout = timeout
        self._attempts = attempts

    def __call__(self, mandate, entries, items, instruction) -> Decision:
        if not self._api_key:
            raise MissingApiKey("GROQ_API_KEY is not configured")

        user_content = build_user_content(instruction, mandate, entries, items)
        payload = {
            "model": self._model,
            "temperature": 0,
            "max_completion_tokens": self._max_output_tokens,
            "messages": [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": user_content},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "cart", "strict": True, "schema": GROQ_CART_SCHEMA},
            },
        }

        raw = self._generate(payload)
        return Decision(parse_cart(raw), full_prompt(user_content), raw)

    def classify(self, system, message, schema, history=None) -> str:
        if not self._api_key:
            raise MissingApiKey("GROQ_API_KEY is not configured")

        return self._generate({
            "model": self._model,
            "temperature": 0,
            "max_completion_tokens": 512,
            "messages": [
                {"role": "system", "content": system},
                *recent_turns(history),
                {"role": "user", "content": message},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "intent", "strict": True, "schema": schema},
            },
        })

    def _generate(self, payload: dict) -> str:
        last_error: str | None = None
        for attempt in range(self._attempts):
            try:
                with httpx.Client(timeout=self._timeout) as client:
                    response = client.post(
                        GROQ_URL,
                        headers={"Authorization": f"Bearer {self._api_key}"},
                        json=payload,
                    )
            except httpx.RequestError as exc:
                last_error = str(exc)
                if attempt == self._attempts - 1:
                    raise DeciderUnavailable(f"{self._model} call failed: {exc}") from exc
                time.sleep(2**attempt)
                continue

            if response.status_code in TRANSIENT_STATUSES and attempt < self._attempts - 1:
                last_error = f"{response.status_code} {response.text[:200]}"
                time.sleep(2**attempt)
                continue
            if response.status_code >= 400:
                raise DeciderUnavailable(
                    f"{self._model} call failed: {response.status_code} {response.text[:300]}"
                )
            return read_choice(response.json())

        raise DeciderUnavailable(f"{self._model} call failed: {last_error}")


def read_choice(body: dict) -> str:
    try:
        return body["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, TypeError) as exc:
        raise DeciderUnavailable(f"unexpected response shape: {str(body)[:200]}") from exc


class OfflineDecider:
    """
    Stands in for the model when none is reachable. Buys one of each in-stock listed item, and for
    anything out of stock reaches for the nearest in-stock item by price in the same category — the
    same shape of answer the model gives, arrived at by rule instead of judgement.
    """

    def __call__(self, mandate, entries, items, instruction) -> Decision:
        by_id = {item.id: item for item in items}
        budget = min(mandate.per_order_cap, mandate.remaining_monthly_budget)
        queued = {entry.catalog_id for entry in entries}

        lines: list[CartLine] = []
        running = Decimal("0")
        for entry in entries:
            item = by_id.get(entry.catalog_id)
            if item is None:
                continue

            substitutes_for = None
            rationale = None
            if item.stock_status != "in_stock":
                chosen = [line.catalog_id for line in lines]
                item = self._nearest_in_stock(item, items, queued, chosen)
                if item is None:
                    continue
                substitutes_for = entry.catalog_id
                rationale = f"closest in-stock price to the unavailable item, at {item.price}"

            if running + item.price > budget:
                continue
            running += item.price
            lines.append(
                CartLine(
                    catalog_id=item.id,
                    quantity=1,
                    substitutes_for=substitutes_for,
                    rationale=rationale,
                )
            )

        raw = json.dumps({"items": [line.model_dump() for line in lines]})
        prompt = full_prompt(build_user_content(instruction, mandate, entries, items))
        return Decision(lines, f"{prompt}\n\n[offline decider: no model was called]", raw)

    def classify(self, system, message, schema, history=None) -> str:
        """
        Keyword matching, so the chat panel still understands the common asks when no model is
        reachable. It reads intent only — it never fills in an amount the user did not say.
        """
        text = message.lower()
        if any(word in text for word in ("run", "shop now", "cycle now", "go buy")):
            intent = "run_cycle"
        elif any(word in text for word in ("approval", "pending", "waiting", "why do you need")):
            intent = "explain_pending"
        elif any(word in text for word in ("spent", "budget", "left", "remaining", "how much")):
            intent = "spend_status"
        elif any(word in text for word in ("last", "happened", "latest", "recent")):
            intent = "explain_last"
        elif any(word in text for word in ("keep", "stock", "mandate", "limit", "per order")):
            intent = "create_mandate"
        else:
            intent = "unknown"

        return json.dumps({
            "intent": intent,
            "category": None,
            "instruction": None,
            "per_order_cap": None,
            "monthly_cap": None,
            "escalation_threshold_pct": None,
        })

    @staticmethod
    def _nearest_in_stock(missing, items, queued, chosen):
        candidates = [
            item
            for item in items
            if item.stock_status == "in_stock"
            and item.category == missing.category
            and item.id not in queued
            and item.id not in chosen
        ]
        return min(candidates, key=lambda item: abs(item.price - missing.price), default=None)


TURN_MEMORY = 6


def recent_turns(history: list[dict] | None) -> list[dict]:
    """
    Enough thread for "make it 800" to have an antecedent, not so much that an old message keeps
    steering a new question.
    """
    if not history:
        return []
    turns = [
        {"role": "assistant" if turn.get("role") == "assistant" else "user", "content": turn.get("content", "")}
        for turn in history[-TURN_MEMORY:]
        if turn.get("content")
    ]
    return turns


def as_transcript(history: list[dict] | None, message: str) -> str:
    lines = [f"{turn['role']}: {turn['content']}" for turn in recent_turns(history)]
    lines.append(f"user: {message}")
    return "\n".join(lines)


def is_transient(exc: Exception) -> bool:
    status = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    if status in TRANSIENT_STATUSES:
        return True
    return any(str(code) in str(exc) for code in TRANSIENT_STATUSES)


def full_prompt(user_content: str) -> str:
    return f"{SYSTEM}\n\n---\n\n{user_content}"


class FallbackDecider:
    def __init__(self, primary: Decider, backup: Decider) -> None:
        self._primary = primary
        self._backup = backup

    def __call__(self, mandate, entries, items, instruction) -> Decision:
        try:
            return self._primary(mandate, entries, items, instruction)
        except (DeciderUnavailable, MissingApiKey) as exc:
            decision = self._backup(mandate, entries, items, instruction)
            decision.degraded = str(exc)
            return decision

    def classify(self, system, message, schema, history=None) -> str:
        try:
            return self._primary.classify(system, message, schema, history)
        except (DeciderUnavailable, MissingApiKey):
            return self._backup.classify(system, message, schema, history)


PRIMARY_DECIDERS = {"gemini": GeminiDecider, "groq": GroqDecider}


def build_decider(
    provider: str,
    api_key: str | None,
    model: str,
    max_output_tokens: int,
    fallback_offline: bool = True,
) -> Decider:
    if provider == "offline":
        return OfflineDecider()
    if provider in PRIMARY_DECIDERS:
        primary = PRIMARY_DECIDERS[provider](api_key, model, max_output_tokens)
        return FallbackDecider(primary, OfflineDecider()) if fallback_offline else primary
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
