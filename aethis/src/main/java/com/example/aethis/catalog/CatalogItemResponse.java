package com.example.aethis.catalog;

import com.example.aethis.model.Catalog;
import com.example.aethis.model.StockStatus;

import java.math.BigDecimal;

public record CatalogItemResponse(
        Long id,
        String name,
        String category,
        BigDecimal price,
        StockStatus stockStatus,
        String description) {

    public static CatalogItemResponse of(Catalog item) {
        return new CatalogItemResponse(
                item.getId(),
                item.getName(),
                item.getCategory(),
                item.getPrice(),
                item.getStockStatus(),
                item.getDescription());
    }
}
