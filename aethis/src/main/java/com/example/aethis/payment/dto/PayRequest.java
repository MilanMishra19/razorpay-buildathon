package com.example.aethis.payment.dto;

import jakarta.validation.constraints.NotNull;

public record PayRequest(
        @NotNull Long cartMandateId,
        String idempotencyKey) {
}
