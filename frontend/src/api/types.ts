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
  standing_instruction: string | null;
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

export interface ProposedLine {
  catalog_id: number;
  quantity: number;
  substitutes_for: number | null;
  rationale: string | null;
}

export interface CartItem {
  catalog_id: number;
  quantity: number;
  unit_price: number;
  substitutes_for: number | null;
  rationale: string | null;
}

export interface CartMandate {
  id: number;
  intent_mandate_id: number;
  status: CartStatus;
  rejection_reason: string | null;
  cart_items: CartItem[];
  total_amount: number;
  policy_decision: PolicyDecision | null;
  cart_hash: string;
  created_at: string;
}

export interface AuditEntry {
  id: number;
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
  catalog_category: string | null;
  added_at: string;
}

export interface AgentRun {
  id: number;
  intent_mandate_id: number;
  restock_snapshot: number[];
  prompt: string;
  raw_response: string;
  parsed_cart: ProposedLine[] | null;
  flagged_catalog_ids: number[] | null;
  cart_mandate_id: number | null;
  created_at: string;
}

export interface PaymentMandate {
  payment_mandate_id: number;
  cart_mandate_id: number;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_key_id: string | null;
  payment_status: PaymentStatus;
  amount: number;
  paid_at: string | null;
}

export interface AgentRunResult {
  category: string;
  agent_run_id: number | null;
  cart_mandate_id: number | null;
  outcome: string;
  reason: string | null;
  proposed_cart: ProposedLine[];
  flagged_catalog_ids: number[];
  dropped_catalog_ids: number[];
  payment_status: string | null;
  model_unavailable: string | null;
  instruction_used: string | null;
  rejected_substitutions: number[];
  withheld_rationales: number[];
}

export interface AgentRunReport {
  runs: AgentRunResult[];
  skipped: Record<string, string>;
}

export type PolicyOutcome = 'PASS' | 'ESCALATE' | 'FAIL';

export interface PolicyCheck {
  name: string;
  outcome: PolicyOutcome;
  detail: string | null;
  limit: number | null;
  actual: number | null;
}

export interface PolicyDecision {
  reason: string | null;
  checks: PolicyCheck[];
}

export interface MerchantMetrics {
  ai_gmv: number;
  ai_orders: number;
  successful_purchases: number;
  recovered_revenue: number;
  recovered_orders: number;
  rejected_spend: number;
  policy_blocks: number;
  human_approvals: number;
  substitutions: number;
  agent_cycles: number;
  average_order_value: number;
  failed_payments: number;
  duplicates_prevented: number;
  demo_rows: number;
}

export interface MandateProposal {
  category: string;
  standing_instruction: string;
  per_order_cap: number;
  monthly_cap: number;
  escalation_threshold_pct: number;
}

export interface ChatReply {
  reply: string;
  intent: string;
  suggestions: string[];
  proposal: MandateProposal | null;
  run: AgentRunReport | null;
  cart_mandate_id: number | null;
  degraded: string | null;
}

export interface CycleRecord {
  at: number;
  category: string;
  outcome: string;
  reason: string | null;
  items: number;
}

export interface AutopilotStatus {
  enabled: boolean;
  interval_seconds: number;
  user_id: number | null;
  last_run_at: number | null;
  next_run_at: number | null;
  runs: number;
  last_error: string | null;
  history: CycleRecord[];
}
