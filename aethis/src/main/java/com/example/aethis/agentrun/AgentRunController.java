package com.example.aethis.agentrun;

import com.example.aethis.agentrun.dto.AgentRunResponse;
import com.example.aethis.agentrun.dto.RecordAgentRunRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/agent-runs")
public class AgentRunController {

    private final AgentRunService agentRunService;

    public AgentRunController(AgentRunService agentRunService) {
        this.agentRunService = agentRunService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AgentRunResponse record(@AuthenticationPrincipal Long userId,
                                   @Valid @RequestBody RecordAgentRunRequest request) {
        return agentRunService.record(userId, request);
    }

    @GetMapping
    public List<AgentRunResponse> recent(@AuthenticationPrincipal Long userId,
                                         @RequestParam(defaultValue = "10") int limit) {
        return agentRunService.recent(userId, limit);
    }

    @GetMapping("/{id}")
    public AgentRunResponse get(@AuthenticationPrincipal Long userId, @PathVariable Long id) {
        return agentRunService.get(userId, id);
    }
}
