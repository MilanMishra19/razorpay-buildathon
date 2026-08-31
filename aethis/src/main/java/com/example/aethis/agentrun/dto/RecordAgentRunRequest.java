package com.example.aethis.agentrun.dto;

import com.example.aethis.model.AgentRun;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record RecordAgentRunRequest(
        @NotNull Long intentMandateId,
        @NotNull List<Long> restockSnapshot,
        @NotBlank String prompt,
        @NotBlank String rawResponse,
        List<AgentRun.ParsedLine> parsedCart,
        List<Long> flaggedCatalogIds,
        Long cartMandateId) {
}
