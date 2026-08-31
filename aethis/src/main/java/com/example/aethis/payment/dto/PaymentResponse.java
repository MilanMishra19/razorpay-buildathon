package com.example.aethis.payment.dto;

import com.example.aethis.model.PaymentMandate;
import com.example.aethis.model.PaymentStatus;

import java.math.BigDecimal;
import java.time.Instant;

public record PaymentResponse(
        Long paymentMandateId,
        Long cartMandateId,
        String razorpayOrderId,
        PaymentStatus paymentStatus,
        BigDecimal amount,
        Instant paidAt) {

    public static PaymentResponse of(PaymentMandate payment) {
        return new PaymentResponse(
                payment.getId(),
                payment.getCartMandateId(),
                payment.getRazorpayOrderId().isEmpty() ? null : payment.getRazorpayOrderId(),
                payment.getPaymentStatus(),
                payment.getAmount(),
                payment.getPaidAt());
    }
}
