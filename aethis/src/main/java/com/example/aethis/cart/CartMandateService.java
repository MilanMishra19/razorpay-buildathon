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
                return decisionFor(replay.get());
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
        cart.setCartHash("");
        carts.saveAndFlush(cart);
        cart.setCartHash(Hashing.contentHash(Snapshots.of(cart)));

        auditService.record(userId, AuditType.CART_MANDATE, cart.getId(), verdict.event(),
                verdict.reason(), Snapshots.of(cart));

        return new CartDecisionResponse(verdict.status(), cart.getId(), verdict.reason(), total,
                mandate.getMonthlyCap().subtract(alreadyPaid),
                verdict.status() == CartStatus.PENDING_APPROVAL);
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

    private Verdict evaluate(IntentMandate mandate, Map<Long, Catalog> catalogById,
                             BigDecimal total, BigDecimal alreadyPaid, boolean substituting) {
        boolean categoryMismatch = catalogById.values().stream()
                .anyMatch(item -> !item.getCategory().equalsIgnoreCase(mandate.getCategory()));
        if (categoryMismatch) {
            return Verdict.rejected(REASON_CATEGORY);
        }

        Optional<Catalog> outOfStock = catalogById.values().stream()
                .filter(item -> item.getStockStatus() == StockStatus.OUT_OF_STOCK)
                .findFirst();
        if (outOfStock.isPresent()) {
            return Verdict.rejected(REASON_OUT_OF_STOCK + ": " + outOfStock.get().getName());
        }

        if (total.compareTo(mandate.getPerOrderCap()) > 0) {
            return Verdict.rejected(REASON_PER_ORDER_CAP);
        }

        BigDecimal projectedSpend = alreadyPaid.add(total);
        if (projectedSpend.compareTo(mandate.getMonthlyCap()) > 0) {
            return Verdict.rejected(REASON_MONTHLY_CAP);
        }

        BigDecimal escalationFloor = Money.percentageOf(mandate.getMonthlyCap(),
                mandate.getEscalationThresholdPct());
        if (projectedSpend.compareTo(escalationFloor) >= 0) {
            return Verdict.pendingApproval(REASON_NEAR_CAP);
        }

        if (substituting) {
            return Verdict.pendingApproval(REASON_SUBSTITUTION);
        }

        return Verdict.approved();
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
                cart.getStatus() == CartStatus.PENDING_APPROVAL);
    }

    private record Verdict(CartStatus status, String reason, AuditEvent event) {

        static Verdict approved() {
            return new Verdict(CartStatus.APPROVED, null, AuditEvent.APPROVED);
        }

        static Verdict rejected(String reason) {
            return new Verdict(CartStatus.REJECTED, reason, AuditEvent.REJECTED);
        }

        static Verdict pendingApproval(String reason) {
            return new Verdict(CartStatus.PENDING_APPROVAL, reason, AuditEvent.AWAITING_APPROVAL);
        }
    }
}
