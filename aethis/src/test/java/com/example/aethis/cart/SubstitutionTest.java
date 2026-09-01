package com.example.aethis.cart;

import com.example.aethis.cart.dto.CartDecisionResponse;
import com.example.aethis.cart.dto.CartMandateResponse;
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
import com.example.aethis.web.ApiException;
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
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class SubstitutionTest {

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
    private Long wantedId;
    private Long standInId;

    @BeforeEach
    void setUp() {
        User user = new User();
        user.setName("Sub");
        user.setEmail("sub-" + UUID.randomUUID() + "@aethis.test");
        user.setPasswordHash("x");
        userId = users.save(user).getId();

        wantedId = save("Good Knight Refill", "79.00", StockStatus.OUT_OF_STOCK);
        standInId = save("All Out Refill", "75.00", StockStatus.IN_STOCK);

        mandateId = mandateService.issue(userId, new IssueMandateRequest(
                "household", "keep the place stocked",
                new BigDecimal("600"), new BigDecimal("2000"), new BigDecimal("90"),
                Instant.now().plus(30, ChronoUnit.DAYS))).id();
    }

    @Test
    void aSubstitutionIsHeldForApprovalEvenWhenTheBudgetIsUntouched() {
        CartDecisionResponse decision = propose(standInId, 1, wantedId, "closest price in stock");

        assertThat(decision.status()).isEqualTo(CartStatus.PENDING_APPROVAL);
        assertThat(decision.reason()).isEqualTo("contains a substitution — requires approval");
        assertThat(decision.requiresConfirmation()).isTrue();
    }

    @Test
    void theSameCartWithoutTheClaimIsSimplyApproved() {
        CartDecisionResponse decision = propose(standInId, 1, null, null);

        assertThat(decision.status()).isEqualTo(CartStatus.APPROVED);
        assertThat(decision.reason()).isNull();
    }

    @Test
    void whatItStandsInForIsKeptOnTheCartSoTheUserCanSeeTheSwap() {
        CartDecisionResponse decision = propose(standInId, 1, wantedId, "closest price in stock");

        CartMandateResponse cart = cartService.get(userId, decision.cartMandateId());
        assertThat(cart.cartItems()).singleElement().satisfies(line -> {
            assertThat(line.catalogId()).isEqualTo(standInId);
            assertThat(line.substitutesFor()).isEqualTo(wantedId);
            assertThat(line.rationale()).isEqualTo("closest price in stock");
        });
    }

    @Test
    void approvingASubstitutionClearsItForPaymentLikeAnyOtherCart() {
        CartDecisionResponse decision = propose(standInId, 1, wantedId, "closest price in stock");

        CartMandateResponse resolved = cartService.resolve(
                userId, decision.cartMandateId(), ResolveCartRequest.Decision.APPROVE);

        assertThat(resolved.status()).isEqualTo(CartStatus.APPROVED);
    }

    @Test
    void aSubstitutionCannotBuyPastTheCap() {
        Long expensive = save("Premium Refill", "900.00", StockStatus.IN_STOCK);

        CartDecisionResponse decision = propose(expensive, 1, wantedId, "only thing left");

        assertThat(decision.status()).isEqualTo(CartStatus.REJECTED);
        assertThat(decision.reason()).isEqualTo("exceeds per-order cap");
    }

    @Test
    void standingInForACatalogItemThatDoesNotExistIsRefused() {
        assertThatThrownBy(() -> propose(standInId, 1, 999_999L, "invented"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Unknown catalog item to substitute for");
    }

    private CartDecisionResponse propose(Long catalogId, int quantity, Long substitutesFor, String rationale) {
        return cartService.propose(userId, new ProposeCartRequest(
                mandateId,
                List.of(new ProposeCartRequest.Line(catalogId, quantity, substitutesFor, rationale)),
                null));
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
