package com.example.aethis.merchant;

import java.math.BigDecimal;

/**
 * What a merchant would ask about an AI sales channel: how much it moved, how much policy stopped,
 * and how much would have been lost to an empty shelf without a substitution.
 *
 * @param demoRows how many of the counted carts are seeded history rather than live activity, so the
 *                 dashboard can say so instead of quietly blending the two
 */
public record MerchantMetrics(
        BigDecimal aiGmv,
        long aiOrders,
        long successfulPurchases,
        BigDecimal recoveredRevenue,
        long recoveredOrders,
        BigDecimal rejectedSpend,
        long policyBlocks,
        long humanApprovals,
        long substitutions,
        long agentCycles,
        BigDecimal averageOrderValue,
        long failedPayments,
        long duplicatesPrevented,
        long demoRows) {
}
