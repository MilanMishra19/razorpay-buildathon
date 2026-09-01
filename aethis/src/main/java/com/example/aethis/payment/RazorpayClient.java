package com.example.aethis.payment;

import java.math.BigDecimal;

public interface RazorpayClient {

    Order createOrder(BigDecimal amount, String receipt);

    /**
     * True when a real browser checkout can complete this payment, which means the server must not
     * mark it paid on its own — it waits for a signed callback. The stub has no checkout to open,
     * so it settles immediately.
     */
    boolean supportsCheckout();

    /** The publishable key the browser needs to open checkout; null when there is none. */
    String publicKeyId();

    /**
     * Verifies Razorpay's HMAC over {@code orderId|paymentId}. A payment is only ever marked paid
     * on the strength of this, never on the browser's say-so.
     */
    boolean verifySignature(String orderId, String paymentId, String signature);

    record Order(String id, String status) {
    }

    class RazorpayException extends RuntimeException {
        public RazorpayException(String message) {
            super(message);
        }
    }
}
