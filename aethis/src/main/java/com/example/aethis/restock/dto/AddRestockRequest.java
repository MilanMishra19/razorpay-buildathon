package com.example.aethis.restock.dto;

import jakarta.validation.constraints.NotNull;

public record AddRestockRequest(@NotNull Long catalogId) {
}
