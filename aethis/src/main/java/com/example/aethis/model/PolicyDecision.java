package com.example.aethis.model;

import java.util.List;

/**
 * The full record of how the guardrail reached its verdict: every check it ran, in order, with the
 * numbers each one compared. Stored on the cart so the reason survives long after the request that
 * produced it.
 */
public record PolicyDecision(String reason, List<PolicyCheck> checks) {

    public static PolicyDecision of(String reason, List<PolicyCheck> checks) {
        return new PolicyDecision(reason, checks);
    }

    public boolean anyFailed() {
        return checks.stream().anyMatch(check -> check.outcome() == PolicyOutcome.FAIL);
    }
}
