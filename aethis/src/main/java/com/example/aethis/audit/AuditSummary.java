package com.example.aethis.audit;

import com.example.aethis.model.AuditLog;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

final class AuditSummary {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private AuditSummary() {
    }

    static String describe(AuditLog row) {
        JsonNode snapshot = parse(row.getRecordSnapshot());
        return switch (row.getType()) {
            case INTENT_MANDATE -> mandateSummary(row, snapshot);
            case CART_MANDATE -> cartSummary(row, snapshot);
            case PAYMENT_MANDATE -> paymentSummary(row, snapshot);
        };
    }

    private static String mandateSummary(AuditLog row, JsonNode snapshot) {
        String category = snapshot.path("category").asText("mandate");
        return switch (row.getEvent()) {
            case ISSUED -> "Mandate issued for %s: %s per order, %s per month"
                    .formatted(category, snapshot.path("perOrderCap").asText(), snapshot.path("monthlyCap").asText());
            case REVOKED -> "Mandate for %s revoked".formatted(category);
            case EXPIRED -> "Mandate for %s expired".formatted(category);
            default -> "Mandate %s".formatted(row.getEvent().wire());
        };
    }

    private static String cartSummary(AuditLog row, JsonNode snapshot) {
        String total = snapshot.path("totalAmount").asText("");
        String label = total.isEmpty() ? "Cart" : "Cart of " + total;
        return switch (row.getEvent()) {
            case APPROVED, APPROVED_BY_USER -> label + " approved";
            case REJECTED -> label + " rejected" + reasonSuffix(row);
            case AWAITING_APPROVAL -> label + " awaiting approval" + reasonSuffix(row);
            case DECLINED_BY_USER -> label + " declined by user";
            default -> label + " " + row.getEvent().wire();
        };
    }

    private static String paymentSummary(AuditLog row, JsonNode snapshot) {
        String amount = snapshot.path("amount").asText("");
        String label = amount.isEmpty() ? "Payment" : "Payment of " + amount;
        return switch (row.getEvent()) {
            case PAID -> label + " completed";
            case FAILED -> label + " failed" + reasonSuffix(row);
            default -> label + " " + row.getEvent().wire();
        };
    }

    private static String reasonSuffix(AuditLog row) {
        return row.getReason() == null ? "" : ": " + row.getReason();
    }

    private static JsonNode parse(String json) {
        try {
            return MAPPER.readTree(json);
        } catch (Exception e) {
            return MAPPER.createObjectNode();
        }
    }
}
