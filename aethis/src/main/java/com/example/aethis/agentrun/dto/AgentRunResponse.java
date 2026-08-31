package com.example.aethis.agentrun.dto;

import com.example.aethis.model.AgentRun;

import java.time.Instant;
import java.util.List;

public record AgentRunResponse(
        Long id,
        Long intentMandateId,
        List<Long> restockSnapshot,
        String prompt,
        String rawResponse,
        List<AgentRun.ParsedLine> parsedCart,
        List<Long> flaggedCatalogIds,
        Long cartMandateId,
        Instant createdAt) {

    public static AgentRunResponse of(AgentRun run) {
        return new AgentRunResponse(
                run.getId(),
                run.getIntentMandateId(),
                run.getRestockSnapshot(),
                run.getPrompt(),
                run.getRawResponse(),
                run.getParsedCart(),
                run.getFlaggedCatalogIds(),
                run.getCartMandateId(),
                run.getCreatedAt());
    }
}
