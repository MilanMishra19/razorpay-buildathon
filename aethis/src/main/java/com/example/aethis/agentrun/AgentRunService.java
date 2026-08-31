package com.example.aethis.agentrun;

import com.example.aethis.agentrun.dto.AgentRunResponse;
import com.example.aethis.agentrun.dto.RecordAgentRunRequest;
import com.example.aethis.model.AgentRun;
import com.example.aethis.repo.AgentRunRepository;
import com.example.aethis.web.ApiException;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class AgentRunService {

    private static final int MAX_LIMIT = 50;

    private final AgentRunRepository agentRuns;

    public AgentRunService(AgentRunRepository agentRuns) {
        this.agentRuns = agentRuns;
    }

    @Transactional
    public AgentRunResponse record(Long userId, RecordAgentRunRequest request) {
        AgentRun run = new AgentRun();
        run.setUserId(userId);
        run.setIntentMandateId(request.intentMandateId());
        run.setRestockSnapshot(request.restockSnapshot());
        run.setPrompt(request.prompt());
        run.setRawResponse(request.rawResponse());
        run.setParsedCart(request.parsedCart());
        run.setFlaggedCatalogIds(request.flaggedCatalogIds());
        run.setCartMandateId(request.cartMandateId());
        return AgentRunResponse.of(agentRuns.save(run));
    }

    @Transactional(readOnly = true)
    public List<AgentRunResponse> recent(Long userId, int limit) {
        int capped = Math.clamp(limit, 1, MAX_LIMIT);
        return agentRuns.findByUserIdOrderByIdDesc(userId, Limit.of(capped)).stream()
                .map(AgentRunResponse::of)
                .toList();
    }

    @Transactional(readOnly = true)
    public AgentRunResponse get(Long userId, Long id) {
        return agentRuns.findByIdAndUserId(id, userId)
                .map(AgentRunResponse::of)
                .orElseThrow(() -> ApiException.notFound("Agent run not found"));
    }
}
