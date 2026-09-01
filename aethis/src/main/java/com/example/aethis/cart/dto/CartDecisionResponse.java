package com.example.aethis.cart.dto;

import com.example.aethis.model.CartStatus;
import com.example.aethis.model.PolicyDecision;

import java.math.BigDecimal;

public record CartDecisionResponse(
        CartStatus status,
        Long cartMandateId,
        String reason,
        BigDecimal totalAmount,
        BigDecimal remainingMonthlyBudget,
        boolean requiresConfirmation,
        PolicyDecision policyDecision) {
}
