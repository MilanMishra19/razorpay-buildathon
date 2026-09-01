package com.example.aethis.mandate.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;

public record IssueMandateRequest(
        @NotBlank String category,
        @Size(max = 2000) String standingInstruction,
        @NotNull @DecimalMin("0.01") BigDecimal perOrderCap,
        @NotNull @DecimalMin("0.01") BigDecimal monthlyCap,
        @DecimalMin("1.0") BigDecimal escalationThresholdPct,
        @NotNull @Future Instant expiresAt) {
}
