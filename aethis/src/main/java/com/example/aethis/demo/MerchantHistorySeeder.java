package com.example.aethis.demo;

import com.example.aethis.model.Catalog;
import com.example.aethis.repo.CatalogRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Random;

/**
 * Seeds a month of merchant-analytics history so the dashboard has a shape to show.
 *
 * Two rules make this honest. The rows belong to a synthetic buyer, so they never appear in a real
 * user's carts, approvals or audit chain. And every row carries is_demo, so the dashboard reports
 * how much of what it is showing was seeded rather than earned.
 *
 * Written through JDBC rather than JPA because the whole point is back-dated rows, and the entities
 * stamp their own creation time.
 */
@Service
public class MerchantHistorySeeder {

    private static final String DEMO_EMAIL = "seeded-buyers@aethis.local";
    private static final int DAYS = 30;

    private final JdbcTemplate jdbc;
    private final CatalogRepository catalog;

    public MerchantHistorySeeder(JdbcTemplate jdbc, CatalogRepository catalog) {
        this.jdbc = jdbc;
        this.catalog = catalog;
    }

    @Transactional
    public SeedResult seed() {
        clear();

        Long userId = demoUser();
        List<Catalog> items = catalog.findAll().stream()
                .filter(item -> item.getPrice().compareTo(BigDecimal.ZERO) > 0)
                .toList();
        if (items.isEmpty()) {
            return new SeedResult(0, 0, BigDecimal.ZERO);
        }

        Long mandateId = demoMandate(userId);
        Random random = new Random(20260901L);
        int carts = 0;
        int paidCount = 0;
        BigDecimal gmv = BigDecimal.ZERO;

        for (int day = DAYS; day >= 1; day--) {
            int ordersToday = 1 + random.nextInt(3);
            for (int order = 0; order < ordersToday; order++) {
                Instant at = Instant.now()
                        .minus(day, ChronoUnit.DAYS)
                        .plus(9L + random.nextInt(10), ChronoUnit.HOURS)
                        .plus(random.nextInt(60), ChronoUnit.MINUTES);

                Catalog bought = items.get(random.nextInt(items.size()));
                boolean substituted = random.nextInt(100) < 22;
                boolean rejected = random.nextInt(100) < 12;
                Catalog replaced = substituted ? items.get(random.nextInt(items.size())) : null;

                int quantity = 1 + random.nextInt(2);
                BigDecimal total = bought.getPrice().multiply(BigDecimal.valueOf(quantity))
                        .setScale(2, RoundingMode.HALF_UP);

                Long cartId = insertCart(userId, mandateId, bought, replaced, quantity, total, rejected, at);
                carts++;

                if (!rejected) {
                    insertPayment(userId, cartId, total, at);
                    paidCount++;
                    gmv = gmv.add(total);
                }
            }
        }

        return new SeedResult(carts, paidCount, gmv.setScale(2, RoundingMode.HALF_UP));
    }

    @Transactional
    public int clear() {
        Integer count = jdbc.queryForObject(
                "SELECT count(*) FROM cart_mandates WHERE is_demo = true", Integer.class);
        jdbc.update("DELETE FROM payment_mandates WHERE is_demo = true");
        jdbc.update("DELETE FROM cart_mandates WHERE is_demo = true");
        return count == null ? 0 : count;
    }

    private Long demoUser() {
        List<Long> existing = jdbc.queryForList(
                "SELECT id FROM users WHERE email = ?", Long.class, DEMO_EMAIL);
        if (!existing.isEmpty()) {
            return existing.get(0);
        }
        return jdbc.queryForObject(
                "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?) RETURNING id",
                Long.class, "Seeded AI buyers", DEMO_EMAIL, "not-a-login");
    }

    private Long demoMandate(Long userId) {
        List<Long> existing = jdbc.queryForList(
                "SELECT id FROM intent_mandates WHERE user_id = ? ORDER BY id LIMIT 1", Long.class, userId);
        if (!existing.isEmpty()) {
            return existing.get(0);
        }
        return jdbc.queryForObject("""
                INSERT INTO intent_mandates
                    (user_id, category, per_order_cap, monthly_cap, escalation_threshold_pct,
                     expires_at, status, mandate_hash)
                VALUES (?, 'groceries', 1000, 25000, 90, now() + interval '365 days', 'ACTIVE', 'seeded')
                RETURNING id
                """, Long.class, userId);
    }

    private Long insertCart(Long userId, Long mandateId, Catalog bought, Catalog replaced,
                            int quantity, BigDecimal total, boolean rejected, Instant at) {
        String items = """
                [{"catalogId":%d,"quantity":%d,"unitPrice":"%s","substitutesFor":%s,"rationale":%s}]
                """.formatted(
                bought.getId(), quantity, bought.getPrice().toPlainString(),
                replaced == null ? "null" : replaced.getId(),
                replaced == null ? "null" : "\"seeded substitution\"");

        return jdbc.queryForObject("""
                INSERT INTO cart_mandates
                    (user_id, intent_mandate_id, cart_items, total_amount, status, rejection_reason,
                     cart_hash, is_demo, created_at)
                VALUES (?, ?, ?::jsonb, ?, ?, ?, 'seeded', true, ?)
                RETURNING id
                """, Long.class,
                userId, mandateId, items, total,
                rejected ? "REJECTED" : "APPROVED",
                rejected ? "exceeds per-order cap" : null,
                java.sql.Timestamp.from(at));
    }

    private void insertPayment(Long userId, Long cartId, BigDecimal total, Instant at) {
        jdbc.update("""
                INSERT INTO payment_mandates
                    (user_id, cart_mandate_id, razorpay_order_id, amount, payment_status, paid_at,
                     payment_hash, is_demo, created_at)
                VALUES (?, ?, ?, ?, 'PAID', ?, 'seeded', true, ?)
                """,
                userId, cartId, "order_seeded_" + cartId, total,
                java.sql.Timestamp.from(at), java.sql.Timestamp.from(at));
    }

    public record SeedResult(int carts, int payments, BigDecimal gmv) {
    }
}
