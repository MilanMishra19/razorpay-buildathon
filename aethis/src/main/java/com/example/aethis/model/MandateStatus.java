package com.example.aethis.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum MandateStatus {
    ACTIVE,
    EXPIRED,
    REVOKED;

    @JsonValue
    public String wire() {
        return name().toLowerCase();
    }

    @JsonCreator
    public static MandateStatus from(String value) {
        return valueOf(value.trim().toUpperCase());
    }
}
