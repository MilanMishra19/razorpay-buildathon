package com.example.aethis.cart;

import com.example.aethis.audit.AuditService;
import com.example.aethis.cart.dto.CartDecisionResponse;
import com.example.aethis.cart.dto.CartMandateResponse;
import com.example.aethis.cart.dto.ProposeCartRequest;
import com.example.aethis.cart.dto.ResolveCartRequest;
import com.example.aethis.common.Money;
import com.example.aethis.hash.Hashing;
import com.example.aethis.model.AuditEvent;
import com.example.aethis.model.AuditType;
import com.example.aethis.model.Catalog;
import com.example.aethis.model.CartItem;
import com.example.aethis.model.CartMandate;
import com.example.aethis.model.CartStatus;
import com.example.aethis.model.IntentMandate;
import com.example.aethis.model.MandateStatus;
import com.example.aethis.model.PolicyCheck;
import com.example.aethis.model.PolicyDecision;
import com.example.aethis.model.PolicyOutcome;
import com.example.aethis.model.Snapshots;
import com.example.aethis.model.StockStatus;
import com.example.aethis.repo.CartMandateRepository;
import com.example.aethis.repo.CatalogRepository;
import com.example.aethis.repo.IntentMandateRepository;
import com.example.aethis.repo.PaymentMandateRepository;
import com.example.aethis.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class CartMandateService {

    private static final String REASON_CATEGORY = "outside allowed category";
    private static final String REASON_OUT_OF_STOCK = "item out of stock";
    private static final String REASON_PER_ORDER_CAP = "exceeds per-order cap";
    private static final String REASON_MONTHLY_CAP = "exceeds monthly cap";
    private static final String REASON_NEAR_CAP = "near monthly cap — requires approval";
    private static final String REASON_SUBSTITUTION = "contains a substitution — requires approval";
    private static final String REASON_DECLINED = "Declined by user";

    private static final String CHECK_CATEGORY = "Category";
    private static final String CHECK_STOCK = "Stock";
    private static final String CHECK_PER_ORDER = "Per-order cap";
    private static final String CHECK_MONTHLY = "Monthly cap";
    private static final String CHECK_ESCALATION = "Escalation threshold";
    private static final String CHECK_SUBSTITUTION = "Substitution";

    private static final Map<String, String> REASONS = Map.of(
            CHECK_CATEGORY, REASON_CATEGORY,
            CHECK_STOCK, REASON_OUT_OF_STOCK,
            CHECK_PER_ORDER, REASON_PER_ORDER_CAP,
            CHECK_MONTHLY, REASON_MONTHLY_CAP,
            CHECK_ESCALATION, REASON_NEAR_CAP,
            CHECK_SUBSTITUTION, REASON_SUBSTITUTION);

    private final CartMandateRepository carts;
    private final IntentMandateRepository mandates;
    private final CatalogRepository catalog;
    private final PaymentMandateRepository payments;
    private final AuditService auditService;

    public CartMandateService(CartMandateRepository carts, IntentMandateRepository mandates,
                              CatalogRepository catalog, PaymentMandateRepository payments,
                              AuditService auditService) {
        this.carts = carts;
        this.mandates = mandates;
        this.catalog = catalog;
        this.payments = payments;
        this.auditService = auditService;
    }

    @Transactional
    public CartDecisionResponse propose(Long userId, ProposeCartRequest request) {
        if (StringUtils.hasText(request.idempotencyKey())) {
            Optional<CartMandate> replay = carts.findByIdempotencyKey(request.idempotencyKey());
            if (replay.isPresent()) {
                CartMandate existing = replay.get();
                existing.setReplayCount(existing.getReplayCount() + 1);
                return decisionFor(existing);
            }
        }

        IntentMandate mandate = mandates.findByIdAndUserIdForUpdate(request.intentMandateId(), userId)
                .orElseThrow(() -> ApiException.notFound("Intent mandate not found"));
        if (mandate.getStatus() != MandateStatus.ACTIVE) {
            throw ApiException.conflict("Intent mandate is not active");
        }
        if (mandate.getExpiresAt().isBefore(Instant.now())) {
            throw ApiException.conflict("Intent mandate has expired");
        }

        Map<Long, Catalog> catalogById = loadCatalog(request.cartItems());
        List<CartItem> items = request.cartItems().stream()
                .map(line -> new CartItem(
                        line.catalogId(),
                        line.quantity(),
                        catalogById.get(line.catalogId()).getPrice(),
                        validSubstitution(line.substitutesFor()),
                        line.substitutesFor() == null ? null : line.rationale()))
                .toList();
        boolean substituting = items.stream().anyMatch(CartItem::isSubstitution);
        BigDecimal total = Money.normalize(items.stream()
                .map(CartItem::lineTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add));

        BigDecimal alreadyPaid = payments.totalPaidForMandate(mandate.getId());
        Verdict verdict = evaluate(mandate, catalogById, total, alreadyPaid, substituting);

        CartMandate cart = new CartMandate();
        cart.setUserId(userId);
        cart.setIntentMandateId(mandate.getId());
        cart.setIdempotencyKey(StringUtils.hasText(request.idempotencyKey()) ? request.idempotencyKey() : null);
        cart.setCartItems(items);
        cart.setTotalAmount(total);
        cart.setStatus(verdict.status());
        cart.setRejectionReason(verdict.reason());
        cart.setPolicyDecision(verdict.decision());
        cart.setCartHash("");
        carts.saveAndFlush(cart);
        cart.setCartHash(Hashing.contentHash(Snapshots.of(cart)));

        auditService.record(userId, AuditType.CART_MANDATE, cart.getId(), verdict.event(),
                verdict.reason(), Snapshots.of(cart));

        return new CartDecisionResponse(verdict.status(), cart.getId(), verdict.reason(), total,
                mandate.getMonthlyCap().subtract(alreadyPaid),
                verdict.status() == CartStatus.PENDING_APPROVAL, verdict.decision());
    }

    @Transactional
    public CartMandateResponse resolve(Long userId, Long cartId, ResolveCartRequest.Decision decision) {
        CartMandate cart = carts.findByIdAndUserId(cartId, userId)
                .orElseThrow(() -> ApiException.notFound("Cart mandate not found"));
        if (cart.getStatus() != CartStatus.PENDING_APPROVAL) {
            throw ApiException.conflict("Cart mandate is not awaiting approval");
        }

        if (decision == ResolveCartRequest.Decision.APPROVE) {
            cart.setStatus(CartStatus.APPROVED);
            cart.setRejectionReason(null);
            auditService.record(userId, AuditType.CART_MANDATE, cart.getId(),
                    AuditEvent.APPROVED_BY_USER, null, Snapshots.of(cart));
        } else {
            cart.setStatus(CartStatus.REJECTED);
            cart.setRejectionReason(REASON_DECLINED);
            auditService.record(userId, AuditType.CART_MANDATE, cart.getId(),
                    AuditEvent.DECLINED_BY_USER, REASON_DECLINED, Snapshots.of(cart));
        }

        return CartMandateResponse.of(cart);
    }

    @Transactional(readOnly = true)
    public CartMandateResponse get(Long userId, Long cartId) {
        return carts.findByIdAndUserId(cartId, userId)
                .map(CartMandateResponse::of)
                .orElseThrow(() -> ApiException.notFound("Cart mandate not found"));
    }

    @Transactional(readOnly = true)
    public List<CartMandateResponse> history(Long userId, CartStatus status) {
        List<CartMandate> rows = status == null
                ? carts.findByUserIdOrderByIdDesc(userId)
                : carts.findByUserIdAndStatusOrderByIdDesc(userId, status);
        return rows.stream().map(CartMandateResponse::of).toList();
    }

    /**
     * Runs every guardrail rather than stopping at the first failure, so the caller can be shown the
     * whole reckoning instead of one word. The verdict still belongs to the first check that failed,
     * which keeps the ordering meaningful: a cart that is both unaffordable and substituting is
     * rejected for the money, not asked about the swap.
     */
    private Verdict evaluate(IntentMandate mandate, Map<Long, Catalog> catalogById,
                             BigDecimal total, BigDecimal alreadyPaid, boolean substituting) {
        List<PolicyCheck> checks = new ArrayList<>();
        BigDecimal projectedSpend = alreadyPaid.add(total);
        BigDecimal escalationFloor = Money.percentageOf(mandate.getMonthlyCap(),
                mandate.getEscalationThresholdPct());

        Optional<Catalog> foreign = catalogById.values().stream()
                .filter(item -> !item.getCategory().equalsIgnoreCase(mandate.getCategory()))
                .findFirst();
        checks.add(foreign
                .map(item -> PolicyCheck.failed(CHECK_CATEGORY,
                        item.getName() + " is " + item.getCategory() + ", not " + mandate.getCategory(),
                        null, null))
                .orElseGet(() -> PolicyCheck.note(CHECK_CATEGORY,
                        "every item is in " + mandate.getCategory())));

        Optional<Catalog> outOfStock = catalogById.values().stream()
                .filter(item -> item.getStockStatus() == StockStatus.OUT_OF_STOCK)
                .findFirst();
        checks.add(outOfStock
                .map(item -> PolicyCheck.failed(CHECK_STOCK, item.getName() + " is out of stock", null, null))
                .orElseGet(() -> PolicyCheck.note(CHECK_STOCK, "every item is in stock")));

        boolean overPerOrder = total.compareTo(mandate.getPerOrderCap()) > 0;
        checks.add(new PolicyCheck(CHECK_PER_ORDER,
                overPerOrder ? PolicyOutcome.FAIL : PolicyOutcome.PASS,
                overPerOrder
                        ? "over by " + Money.normalize(total.subtract(mandate.getPerOrderCap()))
                        : "within the per-order cap",
                mandate.getPerOrderCap(), total));

        boolean overMonthly = projectedSpend.compareTo(mandate.getMonthlyCap()) > 0;
        checks.add(new PolicyCheck(CHECK_MONTHLY,
                overMonthly ? PolicyOutcome.FAIL : PolicyOutcome.PASS,
                Money.normalize(alreadyPaid) + " already spent + " + Money.normalize(total)
                        + " proposed = " + Money.normalize(projectedSpend),
                mandate.getMonthlyCap(), projectedSpend));

        boolean nearCap = projectedSpend.compareTo(escalationFloor) >= 0;
        checks.add(new PolicyCheck(CHECK_ESCALATION,
                nearCap ? PolicyOutcome.ESCALATE : PolicyOutcome.PASS,
                nearCap
                        ? "crosses " + mandate.getEscalationThresholdPct() + "% of the monthly cap"
                        : "below " + mandate.getEscalationThresholdPct() + "% of the monthly cap",
                escalationFloor, projectedSpend));

        checks.add(substituting
                ? PolicyCheck.flagged(CHECK_SUBSTITUTION, "the agent is buying something you did not pick",
                        null, null)
                : PolicyCheck.note(CHECK_SUBSTITUTION, "no substitutions"));

        return verdictFrom(checks, outOfStock);
    }

    private Verdict verdictFrom(List<PolicyCheck> checks, Optional<Catalog> outOfStock) {
        for (PolicyCheck check : checks) {
            if (check.outcome() == PolicyOutcome.FAIL) {
                String reason = check.name().equals(CHECK_STOCK)
                        ? REASON_OUT_OF_STOCK + ": " + outOfStock.map(Catalog::getName).orElse("")
                        : REASONS.get(check.name());
                return Verdict.rejected(reason, PolicyDecision.of(reason, checks));
            }
        }
        for (PolicyCheck check : checks) {
            if (check.outcome() == PolicyOutcome.ESCALATE) {
                String reason = REASONS.get(check.name());
                return Verdict.pendingApproval(reason, PolicyDecision.of(reason, checks));
            }
        }
        return Verdict.approved(PolicyDecision.of(null, checks));
    }

    private Long validSubstitution(Long substitutesFor) {
        if (substitutesFor == null) {
            return null;
        }
        if (!catalog.existsById(substitutesFor)) {
            throw ApiException.badRequest("Unknown catalog item to substitute for: " + substitutesFor);
        }
        return substitutesFor;
    }

    private Map<Long, Catalog> loadCatalog(List<ProposeCartRequest.Line> lines) {
        Map<Long, Catalog> byId = new LinkedHashMap<>();
        for (ProposeCartRequest.Line line : lines) {
            if (byId.containsKey(line.catalogId())) {
                continue;
            }
            Catalog item = catalog.findById(line.catalogId())
                    .orElseThrow(() -> ApiException.badRequest("Unknown catalog item: " + line.catalogId()));
            byId.put(line.catalogId(), item);
        }
        return byId;
    }

    private CartDecisionResponse decisionFor(CartMandate cart) {
        BigDecimal alreadyPaid = payments.totalPaidForMandate(cart.getIntentMandateId());
        BigDecimal monthlyCap = mandates.findById(cart.getIntentMandateId())
                .map(IntentMandate::getMonthlyCap)
                .orElse(BigDecimal.ZERO);
        return new CartDecisionResponse(cart.getStatus(), cart.getId(), cart.getRejectionReason(),
                cart.getTotalAmount(), monthlyCap.subtract(alreadyPaid),
                cart.getStatus() == CartStatus.PENDING_APPROVAL, cart.getPolicyDecision());
    }

    private record Verdict(CartStatus status, String reason, AuditEvent event, PolicyDecision decision) {

        static Verdict approved(PolicyDecision decision) {
            return new Verdict(CartStatus.APPROVED, null, AuditEvent.APPROVED, decision);
        }

        static Verdict rejected(String reason, PolicyDecision decision) {
            return new Verdict(CartStatus.REJECTED, reason, AuditEvent.REJECTED, decision);
        }

        static Verdict pendingApproval(String reason, PolicyDecision decision) {
            return new Verdict(CartStatus.PENDING_APPROVAL, reason, AuditEvent.AWAITING_APPROVAL, decision);
        }
    }
}
