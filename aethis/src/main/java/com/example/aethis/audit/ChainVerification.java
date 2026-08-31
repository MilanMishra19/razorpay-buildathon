package com.example.aethis.audit;

import com.fasterxml.jackson.annotation.JsonProperty;

public record ChainVerification(
        @JsonProperty("is_valid") boolean valid,
        @JsonProperty("broken_at_id") Long brokenAtId) {

    public static ChainVerification ok() {
        return new ChainVerification(true, null);
    }

    public static ChainVerification brokenAt(Long id) {
        return new ChainVerification(false, id);
    }
}
