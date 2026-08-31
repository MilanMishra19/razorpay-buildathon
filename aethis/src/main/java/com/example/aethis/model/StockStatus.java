package com.example.aethis.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum StockStatus {
    IN_STOCK,
    OUT_OF_STOCK;

    @JsonValue
    public String wire() {
        return name().toLowerCase();
    }

    @JsonCreator
    public static StockStatus from(String value) {
        return valueOf(value.trim().toUpperCase());
    }
}
