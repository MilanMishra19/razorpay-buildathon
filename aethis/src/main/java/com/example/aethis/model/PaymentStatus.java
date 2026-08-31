package com.example.aethis.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum PaymentStatus {
    CREATED,
    PAID,
    FAILED;

    @JsonValue
    public String wire() {
        return name().toLowerCase();
    }

    @JsonCreator
    public static PaymentStatus from(String value) {
        return valueOf(value.trim().toUpperCase());
    }
}
