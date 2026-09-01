ALTER TABLE cart_mandates
    ADD COLUMN policy_decision jsonb;

COMMENT ON COLUMN cart_mandates.policy_decision IS
    'Every guardrail check that ran, with the numbers it compared, so a decision stays explainable after the fact.';
