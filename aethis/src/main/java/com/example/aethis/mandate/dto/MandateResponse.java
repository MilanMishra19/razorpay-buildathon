package com.example.aethis.mandate.dto;

import com.example.aethis.model.IntentMandate;
import com.example.aethis.model.MandateStatus;

import java.math.BigDecimal;
import java.time.Instant;

public record MandateResponse(
        Long id,
        String category,
        BigDecimal perOrderCap,
        BigDecimal monthlyCap,
        BigDecimal escalationThresholdPct,
        BigDecimal spentThisPeriod,
        BigDecimal remainingMonthlyBudget,
        Instant issuedAt,
        Instant expiresAt,
        MandateStatus status,
        String mandateHash) {

    public static MandateResponse of(IntentMandate mandate, BigDecimal spentThisPeriod) {
        return new MandateResponse(
                mandate.getId(),
                mandate.getCategory(),
                mandate.getPerOrderCap(),
                mandate.getMonthlyCap(),
                mandate.getEscalationThresholdPct(),
                spentThisPeriod,
                mandate.getMonthlyCap().subtract(spentThisPeriod),
                mandate.getIssuedAt(),
                mandate.getExpiresAt(),
                mandate.getStatus(),
                mandate.getMandateHash());
    }
}
