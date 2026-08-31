package com.example.aethis.restock.dto;

import java.time.Instant;

public record RestockEntryResponse(
        Long id,
        Long catalogId,
        String catalogName,
        Instant addedAt) {
}
