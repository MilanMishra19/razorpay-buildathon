package com.example.aethis.cart;

import com.example.aethis.cart.dto.CartDecisionResponse;
import com.example.aethis.cart.dto.ProposeCartRequest;
import com.example.aethis.mandate.IntentMandateService;
import com.example.aethis.mandate.dto.IssueMandateRequest;
import com.example.aethis.model.Catalog;
import com.example.aethis.model.PolicyCheck;
import com.example.aethis.model.PolicyOutcome;
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
class PolicyExplanationTest {

    @Autowired
    private CartMandateService cartService;
    @Autowired
    private IntentMandateService mandateService;
    @Autowired
    private UserRepository users;
    @Autowired
    private CatalogRepository catalog;

    private Long userId;
    private long mandateId;
    private Long cheap;
    private Long dear;

    @BeforeEach
    void setUp() {
        User user = new User();
        user.setName("Explain");
        user.setEmail("explain-" + UUID.randomUUID() + "@aethis.test");
        user.setPasswordHash("x");
        userId = users.save(user).getId();

        cheap = save("Cheap Thing", "100.00");
        dear = save("Dear Thing", "900.00");

        mandateId = mandateService.issue(userId, new IssueMandateRequest(
                "household", "keep it stocked",
                new BigDecimal("500"), new BigDecimal("2000"), new BigDecimal("90"),
                Instant.now().plus(30, ChronoUnit.DAYS))).id();
    }

    @Test
    void everyGuardrailReportsItself_notJustTheOneThatFailed() {
        CartDecisionResponse decision = propose(cheap, 1);

        assertThat(decision.policyDecision().checks())
                .extracting(PolicyCheck::name)
                .containsExactly("Category", "Stock", "Per-order cap", "Monthly cap",
                        "Escalation threshold", "Substitution");
    }

    @Test
    void aRejectionCarriesTheArithmeticThatProducedIt() {
        CartDecisionResponse decision = propose(dear, 1);

        PolicyCheck perOrder = checkNamed(decision, "Per-order cap");
        assertThat(perOrder.outcome()).isEqualTo(PolicyOutcome.FAIL);
        assertThat(perOrder.limit()).isEqualByComparingTo("500");
        assertThat(perOrder.actual()).isEqualByComparingTo("900");
        assertThat(perOrder.detail()).contains("400");
    }

    @Test
    void checksThatPassedStillSayWhatTheyCompared() {
        CartDecisionResponse decision = propose(cheap, 1);

        PolicyCheck monthly = checkNamed(decision, "Monthly cap");
        assertThat(monthly.outcome()).isEqualTo(PolicyOutcome.PASS);
        assertThat(monthly.limit()).isEqualByComparingTo("2000");
        assertThat(monthly.actual()).isEqualByComparingTo("100");
    }

    @Test
    void aFailedCartStillReportsTheChecksThatCameAfterTheFailure() {
        CartDecisionResponse decision = propose(dear, 1);

        assertThat(decision.policyDecision().checks()).hasSize(6);
        assertThat(checkNamed(decision, "Escalation threshold").actual()).isNotNull();
    }

    @Test
    void theStoredReasonMatchesTheCheckThatFailed() {
        CartDecisionResponse decision = propose(dear, 1);

        assertThat(decision.policyDecision().reason()).isEqualTo("exceeds per-order cap");
        assertThat(decision.reason()).isEqualTo("exceeds per-order cap");
    }

    @Test
    void theDecisionSurvivesOnTheStoredCart() {
        CartDecisionResponse decision = propose(dear, 1);

        assertThat(cartService.get(userId, decision.cartMandateId()).policyDecision().checks())
                .hasSize(6);
    }

    @Test
    void anOutOfStockItemNamesItselfInTheCheck() {
        Long gone = save("Gone Thing", "50.00", StockStatus.OUT_OF_STOCK);

        CartDecisionResponse decision = propose(gone, 1);

        assertThat(checkNamed(decision, "Stock").outcome()).isEqualTo(PolicyOutcome.FAIL);
        assertThat(checkNamed(decision, "Stock").detail()).contains("Gone Thing");
    }

    private PolicyCheck checkNamed(CartDecisionResponse decision, String name) {
        return decision.policyDecision().checks().stream()
                .filter(check -> check.name().equals(name))
                .findFirst()
                .orElseThrow();
    }

    private CartDecisionResponse propose(Long catalogId, int quantity) {
        return cartService.propose(userId, new ProposeCartRequest(
                mandateId, List.of(new ProposeCartRequest.Line(catalogId, quantity)), null));
    }

    private Long save(String name, String price) {
        return save(name, price, StockStatus.IN_STOCK);
    }

    private Long save(String name, String price, StockStatus stock) {
        Catalog item = new Catalog();
        item.setName(name);
        item.setCategory("household");
        item.setPrice(new BigDecimal(price));
        item.setStockStatus(stock);
        return catalog.save(item).getId();
    }
}
