package com.example.aethis.payment;

import com.example.aethis.audit.AuditService;
import com.example.aethis.hash.Hashing;
import com.example.aethis.model.AuditEvent;
import com.example.aethis.model.AuditType;
import com.example.aethis.model.CartMandate;
import com.example.aethis.model.CartStatus;
import com.example.aethis.model.PaymentMandate;
import com.example.aethis.model.PaymentStatus;
import com.example.aethis.model.Snapshots;
import com.example.aethis.payment.dto.PayRequest;
import com.example.aethis.payment.dto.PaymentResponse;
import com.example.aethis.repo.CartMandateRepository;
import com.example.aethis.repo.PaymentMandateRepository;
import com.example.aethis.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Instant;

@Service
public class PaymentService {

    private final PaymentMandateRepository payments;
    private final CartMandateRepository carts;
    private final RazorpayClient razorpay;
    private final AuditService auditService;

    public PaymentService(PaymentMandateRepository payments, CartMandateRepository carts,
                          RazorpayClient razorpay, AuditService auditService) {
        this.payments = payments;
        this.carts = carts;
        this.razorpay = razorpay;
        this.auditService = auditService;
    }

    @Transactional
    public PaymentResponse pay(Long userId, PayRequest request) {
        if (StringUtils.hasText(request.idempotencyKey())) {
            var replay = payments.findByIdempotencyKey(request.idempotencyKey());
            if (replay.isPresent()) {
                return PaymentResponse.of(replay.get());
            }
        }

        CartMandate cart = carts.findByIdAndUserId(request.cartMandateId(), userId)
                .orElseThrow(() -> ApiException.notFound("Cart mandate not found"));
        if (cart.getStatus() != CartStatus.APPROVED) {
            throw ApiException.conflict("Cart mandate is not approved");
        }
        if (payments.findByCartMandateId(cart.getId()).isPresent()) {
            throw ApiException.conflict("A payment already exists for this cart; retry it instead");
        }

        PaymentMandate payment = new PaymentMandate();
        payment.setUserId(userId);
        payment.setCartMandateId(cart.getId());
        payment.setIdempotencyKey(StringUtils.hasText(request.idempotencyKey()) ? request.idempotencyKey() : null);
        payment.setAmount(cart.getTotalAmount());
        payment.setRazorpayOrderId("");
        payment.setPaymentStatus(PaymentStatus.CREATED);
        payment.setPaymentHash("");
        payments.saveAndFlush(payment);

        attempt(userId, payment, cart);
        return PaymentResponse.of(payment);
    }

    @Transactional
    public PaymentResponse retry(Long userId, Long paymentId) {
        PaymentMandate payment = payments.findByIdAndUserId(paymentId, userId)
                .orElseThrow(() -> ApiException.notFound("Payment mandate not found"));
        if (payment.getPaymentStatus() != PaymentStatus.FAILED) {
            throw ApiException.conflict("Only a failed payment can be retried");
        }

        CartMandate cart = carts.findById(payment.getCartMandateId())
                .orElseThrow(() -> ApiException.notFound("Cart mandate not found"));

        payment.setPaidAt(null);
        attempt(userId, payment, cart);
        return PaymentResponse.of(payment);
    }

    @Transactional(readOnly = true)
    public PaymentResponse get(Long userId, Long paymentId) {
        return payments.findByIdAndUserId(paymentId, userId)
                .map(PaymentResponse::of)
                .orElseThrow(() -> ApiException.notFound("Payment mandate not found"));
    }

    private void attempt(Long userId, PaymentMandate payment, CartMandate cart) {
        try {
            RazorpayClient.Order order = razorpay.createOrder(payment.getAmount(), "cart-" + cart.getId());
            payment.setRazorpayOrderId(order.id());
            payment.setPaymentStatus(PaymentStatus.PAID);
            payment.setPaidAt(Instant.now());
            payment.setPaymentHash(Hashing.contentHash(Snapshots.of(payment)));
            auditService.record(userId, AuditType.PAYMENT_MANDATE, payment.getId(),
                    AuditEvent.PAID, null, Snapshots.of(payment));
        } catch (RazorpayClient.RazorpayException e) {
            payment.setPaymentStatus(PaymentStatus.FAILED);
            payment.setPaymentHash(Hashing.contentHash(Snapshots.of(payment)));
            auditService.record(userId, AuditType.PAYMENT_MANDATE, payment.getId(),
                    AuditEvent.FAILED, e.getMessage(), Snapshots.of(payment));
        }
    }
}
