package com.example.aethis.repo;

import com.example.aethis.model.PaymentMandate;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.math.BigDecimal;
import java.util.Optional;

public interface PaymentMandateRepository extends JpaRepository<PaymentMandate, Long> {

    Optional<PaymentMandate> findByCartMandateId(Long cartMandateId);

    Optional<PaymentMandate> findByIdempotencyKey(String idempotencyKey);

    @Query("""
            select coalesce(sum(p.amount), 0)
            from PaymentMandate p
            join CartMandate c on c.id = p.cartMandateId
            where c.intentMandateId = :intentMandateId
              and p.paymentStatus = com.example.aethis.model.PaymentStatus.PAID
            """)
    BigDecimal totalPaidForMandate(Long intentMandateId);
}
