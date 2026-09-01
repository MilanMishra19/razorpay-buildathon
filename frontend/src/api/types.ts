export type MandateStatus = 'active' | 'expired' | 'revoked';
export type CartStatus = 'pending' | 'approved' | 'rejected' | 'pending_approval';
export type PaymentStatus = 'created' | 'paid' | 'failed';
export type StockStatus = 'in_stock' | 'out_of_stock';

export type AuditType = 'intent_mandate' | 'cart_mandate' | 'payment_mandate';
export type AuditEvent =
  | 'issued'
  | 'approved'
  | 'rejected'
  | 'awaiting_approval'
  | 'approved_by_user'
  | 'declined_by_user'
  | 'expired'
  | 'revoked'
  | 'paid'
  | 'failed';

export interface Mandate {
  id: number;
  category: string;
  per_order_cap: number;
  monthly_cap: number;
  escalation_threshold_pct: number;
  spent_this_period: number;
  remaining_monthly_budget: number;
  issued_at: string;
  expires_at: string;
  status: MandateStatus;
  mandate_hash: string;
}

export interface CatalogItem {
  id: number;
  name: string;
  category: string;
  price: number;
  stock_status: StockStatus;
  description: string | null;
}

export interface CartItem {
  catalog_id: number;
  quantity: number;
  unit_price: number;
}

export interface CartMandate {
  id: number;
  intent_mandate_id: number;
  status: CartStatus;
  rejection_reason: string | null;
  cart_items: CartItem[];
  total_amount: number;
  cart_hash: string;
  created_at: string;
}

export interface AuditEntry {
  type: AuditType;
  event: AuditEvent;
  reason: string | null;
  summary: string;
  timestamp: string;
}

export interface ChainVerification {
  is_valid: boolean;
  broken_at_id: number | null;
}

export interface RestockEntry {
  id: number;
  catalog_id: number;
  catalog_name: string | null;
  added_at: string;
}

export interface AgentRun {
  id: number;
  intent_mandate_id: number;
  restock_snapshot: number[];
  prompt: string;
  raw_response: string;
  parsed_cart: { catalog_id: number; quantity: number }[] | null;
  flagged_catalog_ids: number[] | null;
  cart_mandate_id: number | null;
  created_at: string;
}

export interface PaymentMandate {
  payment_mandate_id: number;
  cart_mandate_id: number;
  razorpay_order_id: string | null;
  payment_status: PaymentStatus;
  amount: number;
  paid_at: string | null;
}

export interface AgentRunResult {
  agent_run_id: number | null;
  cart_mandate_id: number | null;
  outcome: string;
  reason: string | null;
  proposed_cart: { catalog_id: number; quantity: number }[];
  flagged_catalog_ids: number[];
  dropped_catalog_ids: number[];
  payment_status: string | null;
}
