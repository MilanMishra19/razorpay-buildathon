package com.example.aethis.payment;

import java.math.BigDecimal;

public interface RazorpayClient {

    Order createOrder(BigDecimal amount, String receipt);

    record Order(String id, String status) {
    }

    class RazorpayException extends RuntimeException {
        public RazorpayException(String message) {
            super(message);
        }
    }
}
