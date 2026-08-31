package com.example.aethis.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.List;

@Entity
@Table(name = "agent_runs")
@Getter
@Setter
public class AgentRun {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "intent_mandate_id", nullable = false)
    private Long intentMandateId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "restock_snapshot", nullable = false)
    private List<Long> restockSnapshot;

    @Column(nullable = false, columnDefinition = "text")
    private String prompt;

    @Column(name = "raw_response", nullable = false, columnDefinition = "text")
    private String rawResponse;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "parsed_cart")
    private List<ParsedLine> parsedCart;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "flagged_catalog_ids")
    private List<Long> flaggedCatalogIds;

    @Column(name = "cart_mandate_id")
    private Long cartMandateId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public record ParsedLine(Long catalogId, Integer quantity) {
    }
}
