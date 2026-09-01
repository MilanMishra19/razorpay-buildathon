from decimal import Decimal

from pydantic import BaseModel, Field


class RunRequest(BaseModel):
    user_id: int
    category: str | None = None
    instruction: str | None = None


class CartLine(BaseModel):
    catalog_id: int
    quantity: int = Field(ge=1)
    substitutes_for: int | None = None
    rationale: str | None = None


class CatalogItem(BaseModel):
    id: int
    name: str
    category: str
    price: Decimal
    stock_status: str
    description: str | None = None


class RestockEntry(BaseModel):
    id: int
    catalog_id: int
    catalog_name: str | None = None
    catalog_category: str | None = None


class Mandate(BaseModel):
    id: int
    category: str
    standing_instruction: str | None = None
    per_order_cap: Decimal
    monthly_cap: Decimal
    escalation_threshold_pct: Decimal
    spent_this_period: Decimal
    remaining_monthly_budget: Decimal
    status: str


class CartDecision(BaseModel):
    status: str
    cart_mandate_id: int
    reason: str | None = None
    total_amount: Decimal
    remaining_monthly_budget: Decimal
    requires_confirmation: bool


class RunResult(BaseModel):
    category: str
    agent_run_id: int | None = None
    cart_mandate_id: int | None = None
    outcome: str
    reason: str | None = None
    proposed_cart: list[CartLine] = []
    flagged_catalog_ids: list[int] = []
    dropped_catalog_ids: list[int] = []
    payment_status: str | None = None
    model_unavailable: str | None = None
    instruction_used: str | None = None
    rejected_substitutions: list[int] = []
    withheld_rationales: list[int] = []


class RunReport(BaseModel):
    runs: list[RunResult] = []
    skipped: dict[str, str] = {}
