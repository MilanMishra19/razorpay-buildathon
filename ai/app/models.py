from decimal import Decimal

from pydantic import BaseModel, Field


class RunRequest(BaseModel):
    user_id: int
    instruction: str | None = None


class CartLine(BaseModel):
    catalog_id: int
    quantity: int = Field(ge=1)


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


class Mandate(BaseModel):
    id: int
    category: str
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
    agent_run_id: int | None = None
    cart_mandate_id: int | None = None
    outcome: str
    reason: str | None = None
    proposed_cart: list[CartLine] = []
    flagged_catalog_ids: list[int] = []
    dropped_catalog_ids: list[int] = []
    payment_status: str | None = None
