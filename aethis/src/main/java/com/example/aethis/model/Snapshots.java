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
        snapshot.put("amount", payment.getAmount().toPlainString());
        snapshot.put("paymentStatus", payment.getPaymentStatus().name());
        snapshot.put("paidAt", payment.getPaidAt() == null ? null : payment.getPaidAt().toString());
        return snapshot;
    }

    public static Map<String, Object> of(CartMandate cart) {
        List<Map<String, Object>> items = new ArrayList<>();
        for (CartItem item : cart.getCartItems()) {
            Map<String, Object> line = new LinkedHashMap<>();
            line.put("catalogId", item.catalogId());
            line.put("quantity", item.quantity());
            line.put("unitPrice", item.unitPrice().toPlainString());
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
        return snapshot;
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
