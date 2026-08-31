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
import static org.mockito.BDDMockito.given;

@SpringBootTest
class PaymentFlowTest {

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
    private Long milkId;
    private Long attaId;
    private long mandateId;

    @BeforeEach
    void setUp() {
        User user = new User();
        user.setName("Pay");
        user.setEmail("pay-" + UUID.randomUUID() + "@aethis.test");
        user.setPasswordHash("x");
        userId = users.save(user).getId();

        milkId = saveCatalog("Milk", "62.00");
        attaId = saveCatalog("Atta", "285.00");
        mandateId = mandateService.issue(userId, new IssueMandateRequest("groceries",
                new BigDecimal("500"), new BigDecimal("300"), new BigDecimal("90"),
                Instant.now().plus(30, ChronoUnit.DAYS))).id();
    }

    @Test
    void paysAnApprovedCartAndMarksItPaid() {
        given(razorpay.createOrder(any(), any())).willReturn(new RazorpayClient.Order("order_test_1", "created"));
        long cartId = approvedCart(milkId, 1);

        PaymentResponse payment = paymentService.pay(userId, new PayRequest(cartId, null));

        assertThat(payment.paymentStatus()).isEqualTo(PaymentStatus.PAID);
        assertThat(payment.razorpayOrderId()).isEqualTo("order_test_1");
        assertThat(payment.paidAt()).isNotNull();
        assertThat(auditService.verifyChain().valid()).isTrue();
    }

    @Test
    void refusesToPayACartThatIsNotApproved() {
        long rejectedCartId = cartService.propose(userId, cart(attaId, 2)).cartMandateId();

        assertThatThrownBy(() -> paymentService.pay(userId, new PayRequest(rejectedCartId, null)))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("not approved");
    }

    @Test
    void refusesASecondPaymentForTheSameCart() {
        given(razorpay.createOrder(any(), any())).willReturn(new RazorpayClient.Order("order_test_2", "created"));
        long cartId = approvedCart(milkId, 1);
        paymentService.pay(userId, new PayRequest(cartId, null));

        assertThatThrownBy(() -> paymentService.pay(userId, new PayRequest(cartId, null)))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("already exists");
    }

    @Test
    void recordsAFailedPaymentAndSucceedsOnRetry() {
        given(razorpay.createOrder(any(), any()))
                .willThrow(new RazorpayClient.RazorpayException("gateway down"))
                .willReturn(new RazorpayClient.Order("order_test_3", "created"));
        long cartId = approvedCart(milkId, 1);

        PaymentResponse failed = paymentService.pay(userId, new PayRequest(cartId, null));
        assertThat(failed.paymentStatus()).isEqualTo(PaymentStatus.FAILED);

        PaymentResponse retried = paymentService.retry(userId, failed.paymentMandateId());
        assertThat(retried.paymentMandateId()).isEqualTo(failed.paymentMandateId());
        assertThat(retried.paymentStatus()).isEqualTo(PaymentStatus.PAID);
        assertThat(auditService.verifyChain().valid()).isTrue();
    }

    @Test
    void countsPaidPaymentsTowardsTheMonthlyCap() {
        given(razorpay.createOrder(any(), any())).willReturn(new RazorpayClient.Order("order_test_4", "created"));
        paymentService.pay(userId, new PayRequest(approvedCart(milkId, 1), null));

        CartDecisionResponse afterSpend = cartService.propose(userId, cart(attaId, 1));

        assertThat(afterSpend.status()).isEqualTo(CartStatus.REJECTED);
        assertThat(afterSpend.reason()).isEqualTo("exceeds monthly cap");
    }

    private long approvedCart(Long catalogId, int quantity) {
        CartDecisionResponse decision = cartService.propose(userId, cart(catalogId, quantity));
        assertThat(decision.status()).isEqualTo(CartStatus.APPROVED);
        return decision.cartMandateId();
    }

    private ProposeCartRequest cart(Long catalogId, int quantity) {
        return new ProposeCartRequest(mandateId, List.of(new ProposeCartRequest.Line(catalogId, quantity)), null);
    }

    private Long saveCatalog(String name, String price) {
        Catalog item = new Catalog();
        item.setName(name);
        item.setCategory("groceries");
        item.setPrice(new BigDecimal(price));
        item.setStockStatus(StockStatus.IN_STOCK);
        return catalog.save(item).getId();
    }
}
