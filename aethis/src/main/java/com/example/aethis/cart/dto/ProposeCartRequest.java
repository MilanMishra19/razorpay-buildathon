package com.example.aethis.cart.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;

public record ProposeCartRequest(
        @NotNull Long intentMandateId,
        @NotEmpty @Valid List<Line> cartItems,
        String idempotencyKey) {

    public record Line(
            @NotNull Long catalogId,
            @Positive int quantity,
            Long substitutesFor,
            @Size(max = 200) String rationale) {

        public Line(Long catalogId, int quantity) {
            this(catalogId, quantity, null, null);
        }
    }
}
