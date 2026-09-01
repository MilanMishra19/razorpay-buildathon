package com.example.aethis.payment;

import com.example.aethis.audit.AuditService;
import com.example.aethis.cart.CartMandateService;
import com.example.aethis.cart.dto.CartDecisionResponse;
import com.example.aethis.cart.dto.ProposeCartRequest;
import com.example.aethis.mandate.IntentMandateService;
import com.example.aethis.mandate.dto.IssueMandateRequest;
import com.example.aethis.model.Catalog;
import com.example.aethis.model.CartStatus;
import com.example.aethis.model.PaymentStatus;
import com.example.aethis.model.StockStatus;
import com.example.aethis.model.User;
import com.example.aethis.payment.dto.ConfirmPaymentRequest;
import com.example.aethis.payment.dto.PayRequest;
import com.example.aethis.payment.dto.PaymentResponse;
import com.example.aethis.repo.CatalogRepository;
import com.example.aethis.repo.UserRepository;
import com.example.aethis.web.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;

@SpringBootTest
class PaymentCheckoutTest {

    private static final String ORDER = "order_live_1";
    private static final String PAYMENT = "pay_live_1";
    private static final String SIGNATURE = "a-valid-looking-signature";

    @MockitoBean
    private RazorpayClient razorpay;

    @Autowired
    private PaymentService paymentService;
    @Autowired
    private CartMandateService cartService;
    @Autowired
    private IntentMandateService mandateService;
    @Autowired
    private UserRepository users;
    @Autowired
    private CatalogRepository catalog;
    @Autowired
    private AuditService auditService;

    private Long userId;
    private long cartId;

    @BeforeEach
    void setUp() {
        User user = new User();
        user.setName("Checkout");
        user.setEmail("checkout-" + UUID.randomUUID() + "@aethis.test");
        user.setPasswordHash("x");
        userId = users.save(user).getId();

        Catalog milk = new Catalog();
        milk.setName("Milk");
        milk.setCategory("groceries");
        milk.setPrice(new BigDecimal("62.00"));
        milk.setStockStatus(StockStatus.IN_STOCK);
        Long milkId = catalog.save(milk).getId();

        long mandateId = mandateService.issue(userId, new IssueMandateRequest(
                "groceries", "keep milk stocked",
                new BigDecimal("500"), new BigDecimal("3000"), new BigDecimal("90"),
                Instant.now().plus(30, ChronoUnit.DAYS))).id();

        // a real gateway is one that can open checkout, so payments must wait for a signed callback
        given(razorpay.supportsCheckout()).willReturn(true);
        given(razorpay.publicKeyId()).willReturn("rzp_test_public");
        given(razorpay.createOrder(any(), any())).willReturn(new RazorpayClient.Order(ORDER, "created"));

        CartDecisionResponse decision = cartService.propose(userId, new ProposeCartRequest(
                mandateId, List.of(new ProposeCartRequest.Line(milkId, 1)), null));
        assertThat(decision.status()).isEqualTo(CartStatus.APPROVED);
        cartId = decision.cartMandateId();
    }

    @Test
    void anOrderAloneDoesNotMeanPaid() {
        PaymentResponse payment = paymentService.pay(userId, new PayRequest(cartId, null));

        assertThat(payment.paymentStatus()).isEqualTo(PaymentStatus.CREATED);
        assertThat(payment.paidAt()).isNull();
        assertThat(payment.razorpayOrderId()).isEqualTo(ORDER);
        assertThat(payment.razorpayKeyId()).isEqualTo("rzp_test_public");
    }

    @Test
    void aValidSignatureSettlesThePayment() {
        PaymentResponse created = paymentService.pay(userId, new PayRequest(cartId, null));
        given(razorpay.verifySignature(ORDER, PAYMENT, SIGNATURE)).willReturn(true);

        PaymentResponse paid = paymentService.confirm(userId, created.paymentMandateId(),
                new ConfirmPaymentRequest(ORDER, PAYMENT, SIGNATURE));

        assertThat(paid.paymentStatus()).isEqualTo(PaymentStatus.PAID);
        assertThat(paid.paidAt()).isNotNull();
        assertThat(paid.razorpayPaymentId()).isEqualTo(PAYMENT);
        assertThat(auditService.verifyChain(userId).valid()).isTrue();
    }

    @Test
    void aForgedSignatureIsRejectedAndTheFailureIsRecorded() {
        PaymentResponse created = paymentService.pay(userId, new PayRequest(cartId, null));
        given(razorpay.verifySignature(eq(ORDER), any(), any())).willReturn(false);

        PaymentResponse rejected = paymentService.confirm(userId, created.paymentMandateId(),
                new ConfirmPaymentRequest(ORDER, PAYMENT, "forged"));

        assertThat(rejected.paymentStatus()).isEqualTo(PaymentStatus.FAILED);
        assertThat(rejected.paidAt()).isNull();
        assertThat(paymentService.get(userId, created.paymentMandateId()).paymentStatus())
                .isEqualTo(PaymentStatus.FAILED);
        assertThat(auditService.history(userId))
                .anyMatch(entry -> "Razorpay signature did not verify".equals(entry.reason()));
    }

    @Test
    void anOrderIdFromSomeOtherPaymentIsRefusedBeforeAnySignatureCheck() {
        PaymentResponse created = paymentService.pay(userId, new PayRequest(cartId, null));

        assertThatThrownBy(() -> paymentService.confirm(userId, created.paymentMandateId(),
                new ConfirmPaymentRequest("order_someone_else", PAYMENT, SIGNATURE)))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("does not belong");

        assertThat(paymentService.get(userId, created.paymentMandateId()).paymentStatus())
                .isEqualTo(PaymentStatus.CREATED);
    }

    @Test
    void confirmingTwiceIsHarmless() {
        PaymentResponse created = paymentService.pay(userId, new PayRequest(cartId, null));
        given(razorpay.verifySignature(ORDER, PAYMENT, SIGNATURE)).willReturn(true);
        ConfirmPaymentRequest request = new ConfirmPaymentRequest(ORDER, PAYMENT, SIGNATURE);

        PaymentResponse first = paymentService.confirm(userId, created.paymentMandateId(), request);
        PaymentResponse second = paymentService.confirm(userId, created.paymentMandateId(), request);

        assertThat(first.paymentStatus()).isEqualTo(PaymentStatus.PAID);
        assertThat(second.paymentStatus()).isEqualTo(PaymentStatus.PAID);
        assertThat(second.razorpayPaymentId()).isEqualTo(first.razorpayPaymentId());
        assertThat(auditService.history(userId).stream().filter(e -> e.event().wire().equals("paid")).count())
                .isEqualTo(1);
    }

    @Test
    void anUnsettledPaymentDoesNotCountAgainstTheBudget() {
        paymentService.pay(userId, new PayRequest(cartId, null));

        assertThat(mandateService.activeFor(userId, "groceries").getFirst().spentThisPeriod())
                .isEqualByComparingTo("0.00");
    }

    @Test
    void itIsListedAsAwaitingCheckoutUntilItSettles() {
        PaymentResponse created = paymentService.pay(userId, new PayRequest(cartId, null));
        assertThat(paymentService.awaitingCheckout(userId)).hasSize(1);

        given(razorpay.verifySignature(ORDER, PAYMENT, SIGNATURE)).willReturn(true);
        paymentService.confirm(userId, created.paymentMandateId(),
                new ConfirmPaymentRequest(ORDER, PAYMENT, SIGNATURE));

        assertThat(paymentService.awaitingCheckout(userId)).isEmpty();
    }
}
