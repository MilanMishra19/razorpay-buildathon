import re

from .models import CatalogItem

WITHHELD = "[description withheld: failed content screening]"

SUSPICIOUS_PATTERNS = [
    re.compile(r"\b(ignore|disregard|override|bypass|forget)\b.{0,40}\b(previous|prior|your|all|any)\b", re.I),
    re.compile(r"\byour\s+(budget|mandate|constraints?|instructions?|limits?|rules?|system\s+prompt)\b", re.I),
    re.compile(r"\b(system\s+(notice|prompt|message)|directive|instruction)s?\b.{0,30}\b(ai|agent|assistant|model|llm)\b", re.I),
    re.compile(r"\b(ai|agent|assistant|model|llm)s?\b.{0,30}\b(must|should|shall|are\s+required\s+to)\b", re.I),
    re.compile(r"\bsupersedes?\b|\btakes?\s+precedence\b", re.I),
    re.compile(r"\badd\s+\d{2,}\s+(units?|items?|of)\b", re.I),
]


def is_suspicious(text: str | None) -> bool:
    if not text:
        return False
    return any(pattern.search(text) for pattern in SUSPICIOUS_PATTERNS)


def screen(items: list[CatalogItem]) -> tuple[list[CatalogItem], list[int]]:
    sanitized: list[CatalogItem] = []
    flagged: list[int] = []

    for item in items:
        if is_suspicious(item.description):
            flagged.append(item.id)
            sanitized.append(item.model_copy(update={"description": WITHHELD}))
        else:
            sanitized.append(item)

    return sanitized, flagged
