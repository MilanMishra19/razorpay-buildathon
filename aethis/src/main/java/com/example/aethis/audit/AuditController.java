package com.example.aethis.audit;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/audit-log")
public class AuditController {

    private final AuditService auditService;

    public AuditController(AuditService auditService) {
        this.auditService = auditService;
    }

    @GetMapping
    public List<AuditEntryResponse> history(@AuthenticationPrincipal Long userId) {
        return auditService.history(userId);
    }

    @GetMapping("/verify")
    public ChainVerification verify(@AuthenticationPrincipal Long userId) {
        return auditService.verifyChain(userId);
    }
}
