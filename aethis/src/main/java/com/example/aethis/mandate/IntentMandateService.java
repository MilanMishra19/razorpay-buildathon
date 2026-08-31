package com.example.aethis.mandate;

import com.example.aethis.audit.AuditService;
import com.example.aethis.hash.Hashing;
import com.example.aethis.mandate.dto.IssueMandateRequest;
import com.example.aethis.mandate.dto.MandateResponse;
import com.example.aethis.model.AuditEvent;
import com.example.aethis.model.AuditType;
import com.example.aethis.model.IntentMandate;
import com.example.aethis.model.MandateStatus;
import com.example.aethis.model.Snapshots;
import com.example.aethis.repo.IntentMandateRepository;
import com.example.aethis.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;

@Service
public class IntentMandateService {

    private static final BigDecimal DEFAULT_ESCALATION_THRESHOLD_PCT = new BigDecimal("90");

    private final IntentMandateRepository mandates;
    private final AuditService auditService;

    public IntentMandateService(IntentMandateRepository mandates, AuditService auditService) {
        this.mandates = mandates;
        this.auditService = auditService;
    }

    @Transactional
    public MandateResponse issue(Long userId, IssueMandateRequest request) {
        mandates.findByUserIdAndStatus(userId, MandateStatus.ACTIVE).ifPresent(existing -> {
            throw ApiException.conflict("User already has an active mandate; revoke it before issuing a new one");
        });

        BigDecimal escalationThresholdPct = request.escalationThresholdPct() != null
                ? request.escalationThresholdPct()
                : DEFAULT_ESCALATION_THRESHOLD_PCT;

        IntentMandate mandate = new IntentMandate();
        mandate.setUserId(userId);
        mandate.setCategory(request.category().trim().toLowerCase());
        mandate.setPerOrderCap(money(request.perOrderCap()));
        mandate.setMonthlyCap(money(request.monthlyCap()));
        mandate.setEscalationThresholdPct(money(escalationThresholdPct));
        mandate.setIssuedAt(Instant.now());
        mandate.setExpiresAt(request.expiresAt());
        mandate.setStatus(MandateStatus.ACTIVE);
        mandate.setMandateHash("");
        mandates.saveAndFlush(mandate);

        mandate.setMandateHash(Hashing.contentHash(Snapshots.of(mandate)));

        auditService.record(userId, AuditType.INTENT_MANDATE, mandate.getId(),
                AuditEvent.ISSUED, null, Snapshots.of(mandate));

        return MandateResponse.of(mandate);
    }

    private static BigDecimal money(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    @Transactional(readOnly = true)
    public MandateResponse activeFor(Long userId) {
        return mandates.findByUserIdAndStatus(userId, MandateStatus.ACTIVE)
                .map(MandateResponse::of)
                .orElseThrow(() -> ApiException.notFound("No active mandate for this user"));
    }

    @Transactional
    public MandateResponse revoke(Long userId, Long mandateId) {
        IntentMandate mandate = mandates.findByIdAndUserId(mandateId, userId)
                .orElseThrow(() -> ApiException.notFound("Mandate not found"));

        if (mandate.getStatus() != MandateStatus.ACTIVE) {
            throw ApiException.conflict("Mandate is already " + mandate.getStatus().wire());
        }

        mandate.setStatus(MandateStatus.REVOKED);

        auditService.record(userId, AuditType.INTENT_MANDATE, mandate.getId(),
                AuditEvent.REVOKED, "Revoked by user", Snapshots.of(mandate));

        return MandateResponse.of(mandate);
    }
}
