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
import com.example.aethis.payment.dto.ConfirmPaymentRequest;
import com.example.aethis.payment.dto.PayRequest;
import com.example.aethis.payment.dto.PaymentResponse;
import com.example.aethis.repo.CartMandateRepository;
import com.example.aethis.repo.PaymentMandateRepository;
import com.example.aethis.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.List;

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
                return respond(replay.get());
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
        return respond(payment);
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
        return respond(payment);
    }

    /**
     * Settles a payment against Razorpay's signed callback. The browser hands us an order id, a
     * payment id and a signature; only the signature decides whether this becomes {@code paid}.
     */
    @Transactional
    public PaymentResponse confirm(Long userId, Long paymentId, ConfirmPaymentRequest request) {
        PaymentMandate payment = payments.findByIdAndUserId(paymentId, userId)
                .orElseThrow(() -> ApiException.notFound("Payment mandate not found"));

        if (payment.getPaymentStatus() == PaymentStatus.PAID) {
            return respond(payment);
        }
        if (payment.getPaymentStatus() != PaymentStatus.CREATED) {
            throw ApiException.conflict("Payment is " + payment.getPaymentStatus().wire() + " and cannot be confirmed");
        }
        if (!payment.getRazorpayOrderId().equals(request.razorpayOrderId())) {
            throw ApiException.badRequest("Order id does not belong to this payment");
        }

        boolean valid = razorpay.verifySignature(
                payment.getRazorpayOrderId(), request.razorpayPaymentId(), request.razorpaySignature());

        if (!valid) {
            // Recording the rejection and then throwing would roll the record back with the
            // transaction, so the attempt is returned as failed instead — the caller reads the
            // status, and the audit trail keeps the evidence.
            payment.setPaymentStatus(PaymentStatus.FAILED);
            payment.setPaymentHash(Hashing.contentHash(Snapshots.of(payment)));
            auditService.record(userId, AuditType.PAYMENT_MANDATE, payment.getId(),
                    AuditEvent.FAILED, "Razorpay signature did not verify", Snapshots.of(payment));
            return respond(payment);
        }

        payment.setRazorpayPaymentId(request.razorpayPaymentId());
        payment.setPaymentStatus(PaymentStatus.PAID);
        payment.setPaidAt(Instant.now());
        payment.setPaymentHash(Hashing.contentHash(Snapshots.of(payment)));
        auditService.record(userId, AuditType.PAYMENT_MANDATE, payment.getId(),
                AuditEvent.PAID, null, Snapshots.of(payment));

        return respond(payment);
    }

    @Transactional(readOnly = true)
    public PaymentResponse get(Long userId, Long paymentId) {
        return payments.findByIdAndUserId(paymentId, userId)
                .map(this::respond)
                .orElseThrow(() -> ApiException.notFound("Payment mandate not found"));
    }

    @Transactional(readOnly = true)
    public List<PaymentResponse> awaitingCheckout(Long userId) {
        return payments.findByUserIdAndPaymentStatusOrderByIdDesc(userId, PaymentStatus.CREATED).stream()
                .map(this::respond)
                .toList();
    }

    private void attempt(Long userId, PaymentMandate payment, CartMandate cart) {
        try {
            RazorpayClient.Order order = razorpay.createOrder(payment.getAmount(), "cart-" + cart.getId());
            payment.setRazorpayOrderId(order.id());

            if (razorpay.supportsCheckout()) {
                payment.setPaymentStatus(PaymentStatus.CREATED);
                payment.setPaymentHash(Hashing.contentHash(Snapshots.of(payment)));
                return;
            }

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

    private PaymentResponse respond(PaymentMandate payment) {
        return PaymentResponse.of(payment, razorpay.publicKeyId());
    }
}
