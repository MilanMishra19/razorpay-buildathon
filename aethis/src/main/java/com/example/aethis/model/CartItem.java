package com.example.aethis.model;

import com.fasterxml.jackson.annotation.JsonIgnore;

import java.math.BigDecimal;

/**
 * A line in a proposed cart. {@code substitutesFor} is set when the agent is buying something other
 * than what the user queued — because the queued item was unavailable — and carries the catalog id
 * it stands in for plus the agent's stated reason.
 */
public record CartItem(
        Long catalogId,
        int quantity,
        BigDecimal unitPrice,
        Long substitutesFor,
        String rationale) {

    @JsonIgnore
    public boolean isSubstitution() {
        return substitutesFor != null;
    }

    @JsonIgnore
    public BigDecimal lineTotal() {
        return unitPrice.multiply(BigDecimal.valueOf(quantity));
    }
}
