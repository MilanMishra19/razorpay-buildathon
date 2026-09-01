package com.example.aethis.payment;

import java.math.BigDecimal;
import java.util.UUID;

class StubRazorpayClient implements RazorpayClient {

    private final boolean forceFailure;

    StubRazorpayClient(boolean forceFailure) {
        this.forceFailure = forceFailure;
    }

    @Override
    public boolean supportsCheckout() {
        return false;
    }

    @Override
    public String publicKeyId() {
        return null;
    }

    @Override
    public Order createOrder(BigDecimal amount, String receipt) {
        if (forceFailure) {
            throw new RazorpayException("Simulated payment failure (aethis.razorpay.force-failure=true)");
        }
        String orderId = "order_stub_" + UUID.randomUUID().toString().replace("-", "").substring(0, 14);
        return new Order(orderId, "created");
    }

    @Override
    public boolean verifySignature(String orderId, String paymentId, String signature) {
        return false;
    }
}
