package com.example.aethis.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum CartStatus {
    PENDING,
    APPROVED,
    REJECTED,
    PENDING_APPROVAL;

    @JsonValue
    public String wire() {
        return name().toLowerCase();
    }

    @JsonCreator
    public static CartStatus from(String value) {
        return valueOf(value.trim().toUpperCase());
    }
}
