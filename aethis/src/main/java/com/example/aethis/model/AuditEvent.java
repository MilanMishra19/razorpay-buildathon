package com.example.aethis.model;

import com.fasterxml.jackson.annotation.JsonValue;

public enum AuditEvent {
    ISSUED,
    APPROVED,
    REJECTED,
    AWAITING_APPROVAL,
    APPROVED_BY_USER,
    DECLINED_BY_USER,
    EXPIRED,
    REVOKED,
    PAID,
    FAILED;

    @JsonValue
    public String wire() {
        return name().toLowerCase();
    }
}
