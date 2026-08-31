package com.example.aethis.cart.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.util.List;

public record ProposeCartRequest(
        @NotNull Long intentMandateId,
        @NotEmpty @Valid List<Line> cartItems,
        String idempotencyKey) {

    public record Line(
            @NotNull Long catalogId,
            @Positive int quantity) {
    }
}
