package com.example.aethis.cart;

import com.example.aethis.audit.AuditService;
import com.example.aethis.cart.dto.CartDecisionResponse;
import com.example.aethis.cart.dto.ProposeCartRequest;
import com.example.aethis.cart.dto.ResolveCartRequest;
import com.example.aethis.mandate.IntentMandateService;
import com.example.aethis.mandate.dto.IssueMandateRequest;
import com.example.aethis.model.Catalog;
import com.example.aethis.model.CartStatus;
import com.example.aethis.model.StockStatus;
import com.example.aethis.model.User;
import com.example.aethis.repo.CatalogRepository;
import com.example.aethis.repo.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class CartMandateGuardrailTest {

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
    private Long outOfStockId;
    private Long attaId;

    @BeforeEach
    void setUp() {
        User user = new User();
        user.setName("Test");
        user.setEmail("guardrail-" + UUID.randomUUID() + "@aethis.test");
        user.setPasswordHash("x");
        userId = users.save(user).getId();

        milkId = saveCatalog("Milk", "groceries", "62.00", StockStatus.IN_STOCK);
        outOfStockId = saveCatalog("Tea", "groceries", "140.00", StockStatus.OUT_OF_STOCK);
        attaId = saveCatalog("Atta", "groceries", "285.00", StockStatus.IN_STOCK);
    }

    @Test
    void approvesACartWithinEveryCap() {
        long mandateId = issueMandate("groceries", "500", "3000", "90");

        CartDecisionResponse decision = cartService.propose(userId, cart(mandateId, milkId, 2));

        assertThat(decision.status()).isEqualTo(CartStatus.APPROVED);
        assertThat(decision.reason()).isNull();
        assertThat(decision.totalAmount()).isEqualByComparingTo("124.00");
        assertThat(decision.requiresConfirmation()).isFalse();
    }

    @Test
    void rejectsItemsOutsideTheMandateCategory() {
        long mandateId = issueMandate("electronics", "500", "3000", "90");

        CartDecisionResponse decision = cartService.propose(userId, cart(mandateId, milkId, 1));

        assertThat(decision.status()).isEqualTo(CartStatus.REJECTED);
        assertThat(decision.reason()).isEqualTo("outside allowed category");
    }

    @Test
    void rejectsOutOfStockItems() {
        long mandateId = issueMandate("groceries", "500", "3000", "90");

        CartDecisionResponse decision = cartService.propose(userId, cart(mandateId, outOfStockId, 1));

        assertThat(decision.status()).isEqualTo(CartStatus.REJECTED);
        assertThat(decision.reason()).startsWith("item out of stock");
    }

    @Test
    void rejectsCartsOverThePerOrderCap() {
        long mandateId = issueMandate("groceries", "500", "3000", "90");

        CartDecisionResponse decision = cartService.propose(userId, cart(mandateId, attaId, 2));

        assertThat(decision.status()).isEqualTo(CartStatus.REJECTED);
        assertThat(decision.reason()).isEqualTo("exceeds per-order cap");
    }

    @Test
    void rejectsCartsOverTheMonthlyCap() {
        long mandateId = issueMandate("groceries", "500", "100", "90");

        CartDecisionResponse decision = cartService.propose(userId, cart(mandateId, attaId, 1));

        assertThat(decision.status()).isEqualTo(CartStatus.REJECTED);
        assertThat(decision.reason()).isEqualTo("exceeds monthly cap");
    }

    @Test
    void flagsCartsThatReachTheEscalationThreshold() {
        long mandateId = issueMandate("groceries", "500", "300", "90");

        CartDecisionResponse decision = cartService.propose(userId, cart(mandateId, attaId, 1));

        assertThat(decision.status()).isEqualTo(CartStatus.PENDING_APPROVAL);
        assertThat(decision.requiresConfirmation()).isTrue();

        var resolved = cartService.resolve(userId, decision.cartMandateId(), ResolveCartRequest.Decision.APPROVE);
        assertThat(resolved.status()).isEqualTo(CartStatus.APPROVED);
        assertThat(resolved.rejectionReason()).isNull();
    }

    @Test
    void replaysTheStoredOutcomeForARepeatedIdempotencyKey() {
        long mandateId = issueMandate("groceries", "500", "3000", "90");
        ProposeCartRequest request = new ProposeCartRequest(mandateId,
                List.of(new ProposeCartRequest.Line(milkId, 1)), "key-123");

        CartDecisionResponse first = cartService.propose(userId, request);
        CartDecisionResponse second = cartService.propose(userId, request);

        assertThat(second.cartMandateId()).isEqualTo(first.cartMandateId());
        assertThat(catalog.count()).isPositive();
    }

    @Test
    void keepsTheAuditChainValidAcrossEveryOutcome() {
        long mandateId = issueMandate("groceries", "500", "300", "90");
        cartService.propose(userId, cart(mandateId, milkId, 1));
        cartService.propose(userId, cart(mandateId, outOfStockId, 1));
        cartService.propose(userId, cart(mandateId, attaId, 1));

        assertThat(auditService.verifyChain(userId).valid()).isTrue();
    }

    private long issueMandate(String category, String perOrderCap, String monthlyCap, String escalationPct) {
        return mandateService.issue(userId, new IssueMandateRequest(
                category,
                "keep the basics stocked",
                new BigDecimal(perOrderCap),
                new BigDecimal(monthlyCap),
                new BigDecimal(escalationPct),
                Instant.now().plus(30, ChronoUnit.DAYS))).id();
    }

    private ProposeCartRequest cart(long mandateId, Long catalogId, int quantity) {
        return new ProposeCartRequest(mandateId, List.of(new ProposeCartRequest.Line(catalogId, quantity)), null);
    }

    private Long saveCatalog(String name, String category, String price, StockStatus stockStatus) {
        Catalog item = new Catalog();
        item.setName(name);
        item.setCategory(category);
        item.setPrice(new BigDecimal(price));
        item.setStockStatus(stockStatus);
        return catalog.save(item).getId();
    }
}
