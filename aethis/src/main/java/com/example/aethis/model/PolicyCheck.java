package com.example.aethis.model;

import java.math.BigDecimal;

/**
 * One guardrail's verdict, carrying the numbers it compared rather than only the word it reached.
 * A rejection the user cannot recompute is a rejection they have to take on faith, which is the
 * opposite of what this system is for.
 */
public record PolicyCheck(
        String name,
        PolicyOutcome outcome,
        String detail,
        BigDecimal limit,
        BigDecimal actual) {

    public static PolicyCheck passed(String name, String detail, BigDecimal limit, BigDecimal actual) {
        return new PolicyCheck(name, PolicyOutcome.PASS, detail, limit, actual);
    }

    public static PolicyCheck failed(String name, String detail, BigDecimal limit, BigDecimal actual) {
        return new PolicyCheck(name, PolicyOutcome.FAIL, detail, limit, actual);
    }

    public static PolicyCheck flagged(String name, String detail, BigDecimal limit, BigDecimal actual) {
        return new PolicyCheck(name, PolicyOutcome.ESCALATE, detail, limit, actual);
    }

    public static PolicyCheck note(String name, String detail) {
        return new PolicyCheck(name, PolicyOutcome.PASS, detail, null, null);
    }
}
