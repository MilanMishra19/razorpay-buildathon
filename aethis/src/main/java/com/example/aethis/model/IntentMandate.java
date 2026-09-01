package com.example.aethis.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "intent_mandates")
@Getter
@Setter
public class IntentMandate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private String category;

    @Column(name = "standing_instruction", columnDefinition = "text")
    private String standingInstruction;

    @Column(name = "per_order_cap", nullable = false)
    private BigDecimal perOrderCap;

    @Column(name = "monthly_cap", nullable = false)
    private BigDecimal monthlyCap;

    @Column(name = "escalation_threshold_pct", nullable = false)
    private BigDecimal escalationThresholdPct;

    @Column(name = "issued_at", nullable = false)
    private Instant issuedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MandateStatus status;

    @Column(name = "mandate_hash", nullable = false)
    private String mandateHash;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
