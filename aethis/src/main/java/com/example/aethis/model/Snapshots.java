package com.example.aethis.model;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class Snapshots {

    private Snapshots() {
    }

    public static Map<String, Object> of(PaymentMandate payment) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("id", payment.getId());
        snapshot.put("userId", payment.getUserId());
        snapshot.put("cartMandateId", payment.getCartMandateId());
        snapshot.put("razorpayOrderId", payment.getRazorpayOrderId());
        snapshot.put("razorpayPaymentId", payment.getRazorpayPaymentId());
        snapshot.put("amount", payment.getAmount().toPlainString());
        snapshot.put("paymentStatus", payment.getPaymentStatus().name());
        snapshot.put("paidAt", payment.getPaidAt() == null ? null : payment.getPaidAt().toString());
        return snapshot;
    }

    private static List<Map<String, Object>> checksOf(CartMandate cart) {
        List<Map<String, Object>> rows = new ArrayList<>();
        if (cart.getPolicyDecision() == null) {
            return rows;
        }
        for (PolicyCheck check : cart.getPolicyDecision().checks()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("name", check.name());
            row.put("outcome", check.outcome().name());
            row.put("limit", check.limit() == null ? null : check.limit().toPlainString());
            row.put("actual", check.actual() == null ? null : check.actual().toPlainString());
            rows.add(row);
        }
        return rows;
    }

    public static Map<String, Object> of(CartMandate cart) {
        List<Map<String, Object>> items = new ArrayList<>();
        for (CartItem item : cart.getCartItems()) {
            Map<String, Object> line = new LinkedHashMap<>();
            line.put("catalogId", item.catalogId());
            line.put("quantity", item.quantity());
            line.put("unitPrice", item.unitPrice().toPlainString());
            line.put("substitutesFor", item.substitutesFor());
            line.put("rationale", item.rationale());
            items.add(line);
        }

        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("id", cart.getId());
        snapshot.put("userId", cart.getUserId());
        snapshot.put("intentMandateId", cart.getIntentMandateId());
        snapshot.put("items", items);
        snapshot.put("totalAmount", cart.getTotalAmount().toPlainString());
        snapshot.put("status", cart.getStatus().name());
        snapshot.put("rejectionReason", cart.getRejectionReason());
        snapshot.put("policyChecks", checksOf(cart));
        return snapshot;
    }

    public static Map<String, Object> of(IntentMandate mandate) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("id", mandate.getId());
        snapshot.put("userId", mandate.getUserId());
        snapshot.put("category", mandate.getCategory());
        snapshot.put("standingInstruction", mandate.getStandingInstruction());
        snapshot.put("perOrderCap", mandate.getPerOrderCap().toPlainString());
        snapshot.put("monthlyCap", mandate.getMonthlyCap().toPlainString());
        snapshot.put("escalationThresholdPct", mandate.getEscalationThresholdPct().toPlainString());
        snapshot.put("issuedAt", mandate.getIssuedAt().toString());
        snapshot.put("expiresAt", mandate.getExpiresAt().toString());
        snapshot.put("status", mandate.getStatus().name());
        return snapshot;
    }
}
