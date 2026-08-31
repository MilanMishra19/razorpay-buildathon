package com.example.aethis.model;

import com.fasterxml.jackson.annotation.JsonValue;

public enum AuditType {
    INTENT_MANDATE,
    CART_MANDATE,
    PAYMENT_MANDATE;

    @JsonValue
    public String wire() {
        return name().toLowerCase();
    }
}
