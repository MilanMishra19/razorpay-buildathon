package com.example.aethis.model;

import java.util.LinkedHashMap;
import java.util.Map;

public final class Snapshots {

    private Snapshots() {
    }

    public static Map<String, Object> of(IntentMandate mandate) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("id", mandate.getId());
        snapshot.put("userId", mandate.getUserId());
        snapshot.put("category", mandate.getCategory());
        snapshot.put("perOrderCap", mandate.getPerOrderCap().toPlainString());
        snapshot.put("monthlyCap", mandate.getMonthlyCap().toPlainString());
        snapshot.put("escalationThresholdPct", mandate.getEscalationThresholdPct().toPlainString());
        snapshot.put("issuedAt", mandate.getIssuedAt().toString());
        snapshot.put("expiresAt", mandate.getExpiresAt().toString());
        snapshot.put("status", mandate.getStatus().name());
        return snapshot;
    }
}
