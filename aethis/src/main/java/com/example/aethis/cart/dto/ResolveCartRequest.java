package com.example.aethis.cart.dto;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import jakarta.validation.constraints.NotNull;

public record ResolveCartRequest(@NotNull Decision decision) {

    public enum Decision {
        APPROVE,
        DECLINE;

        @JsonValue
        public String wire() {
            return name().toLowerCase();
        }

        @JsonCreator
        public static Decision from(String value) {
            return valueOf(value.trim().toUpperCase());
        }
    }
}
