package com.example.aethis.merchant;

import com.example.aethis.common.Money;
import com.example.aethis.model.CartItem;
import com.example.aethis.model.CartMandate;
import com.example.aethis.model.CartStatus;
import com.example.aethis.model.PaymentMandate;
import com.example.aethis.model.PaymentStatus;
import com.example.aethis.repo.AgentRunRepository;
import com.example.aethis.repo.CartMandateRepository;
import com.example.aethis.repo.PaymentMandateRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Every number here is derived from carts, payments and agent runs at read time. Nothing about
 * merchant performance is stored separately, so the dashboard cannot drift away from the ledger it
 * claims to summarise.
 */
@Service
public class MerchantMetricsService {

    private final CartMandateRepository carts;
    private final PaymentMandateRepository payments;
    private final AgentRunRepository agentRuns;

    public MerchantMetricsService(CartMandateRepository carts, PaymentMandateRepository payments,
                                  AgentRunRepository agentRuns) {
        this.carts = carts;
        this.payments = payments;
        this.agentRuns = agentRuns;
    }

    @Transactional(readOnly = true)
    public MerchantMetrics acrossAllBuyers() {
        List<CartMandate> allCarts = carts.findAll();
        List<PaymentMandate> allPayments = payments.findAll();
        Map<Long, CartMandate> cartById = allCarts.stream()
                .collect(Collectors.toMap(CartMandate::getId, Function.identity(), (a, b) -> a));

        List<PaymentMandate> paid = allPayments.stream()
                .filter(payment -> payment.getPaymentStatus() == PaymentStatus.PAID)
                .toList();

        BigDecimal gmv = sum(paid.stream().map(PaymentMandate::getAmount).toList());
        BigDecimal rejectedSpend = sum(allCarts.stream()
                .filter(cart -> cart.getStatus() == CartStatus.REJECTED)
                .map(CartMandate::getTotalAmount)
                .toList());

        List<CartMandate> substituting = allCarts.stream()
                .filter(cart -> cart.getCartItems().stream().anyMatch(CartItem::isSubstitution))
                .toList();

        List<CartMandate> recovered = paid.stream()
                .map(payment -> cartById.get(payment.getCartMandateId()))
                .filter(cart -> cart != null)
                .filter(cart -> cart.getCartItems().stream().anyMatch(CartItem::isSubstitution))
                .toList();

        BigDecimal recoveredRevenue = sum(recovered.stream()
                .flatMap(cart -> cart.getCartItems().stream())
                .filter(CartItem::isSubstitution)
                .map(CartItem::lineTotal)
                .toList());

        long approvals = allCarts.stream()
                .filter(cart -> cart.getStatus() == CartStatus.APPROVED)
                .filter(cart -> cart.getPolicyDecision() != null)
                .filter(cart -> cart.getPolicyDecision().reason() != null)
                .count();

        return new MerchantMetrics(
                gmv,
                allCarts.size(),
                paid.size(),
                recoveredRevenue,
                recovered.size(),
                rejectedSpend,
                allCarts.stream().filter(cart -> cart.getStatus() == CartStatus.REJECTED).count(),
                approvals,
                substituting.size(),
                agentRuns.count(),
                paid.isEmpty() ? BigDecimal.ZERO : gmv.divide(BigDecimal.valueOf(paid.size()), 2, RoundingMode.HALF_UP),
                allPayments.stream().filter(p -> p.getPaymentStatus() == PaymentStatus.FAILED).count(),
                allCarts.stream().mapToLong(CartMandate::getReplayCount).sum(),
                allCarts.stream().filter(CartMandate::isDemo).count());
    }

    private BigDecimal sum(List<BigDecimal> values) {
        return Money.normalize(values.stream().reduce(BigDecimal.ZERO, BigDecimal::add));
    }
}
