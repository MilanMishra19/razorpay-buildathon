package com.example.aethis.cart.dto;

import com.example.aethis.model.CartStatus;

import java.math.BigDecimal;

public record CartDecisionResponse(
        CartStatus status,
        Long cartMandateId,
        String reason,
        BigDecimal totalAmount,
        BigDecimal remainingMonthlyBudget,
        boolean requiresConfirmation) {
}
