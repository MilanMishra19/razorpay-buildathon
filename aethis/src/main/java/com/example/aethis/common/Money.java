package com.example.aethis.common;

import java.math.BigDecimal;
import java.math.RoundingMode;

public final class Money {

    public static final int SCALE = 2;

    private Money() {
    }

    public static BigDecimal normalize(BigDecimal value) {
        return value.setScale(SCALE, RoundingMode.HALF_UP);
    }

    public static BigDecimal percentageOf(BigDecimal value, BigDecimal percent) {
        return normalize(value.multiply(percent).divide(BigDecimal.valueOf(100), SCALE + 4, RoundingMode.HALF_UP));
    }
}
