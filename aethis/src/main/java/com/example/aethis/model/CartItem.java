package com.example.aethis.model;

import java.math.BigDecimal;

public record CartItem(Long catalogId, int quantity, BigDecimal unitPrice) {

    public BigDecimal lineTotal() {
        return unitPrice.multiply(BigDecimal.valueOf(quantity));
    }
}
