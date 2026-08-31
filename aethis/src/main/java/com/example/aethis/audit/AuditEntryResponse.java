package com.example.aethis.audit;

import com.example.aethis.model.AuditEvent;
import com.example.aethis.model.AuditType;

import java.time.Instant;

public record AuditEntryResponse(
        AuditType type,
        AuditEvent event,
        String reason,
        String summary,
        Instant timestamp) {
}
