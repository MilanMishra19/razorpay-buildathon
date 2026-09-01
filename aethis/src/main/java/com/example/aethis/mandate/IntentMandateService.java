package com.example.aethis.mandate;

import com.example.aethis.audit.AuditService;
import com.example.aethis.common.Money;
import com.example.aethis.hash.Hashing;
import com.example.aethis.mandate.dto.IssueMandateRequest;
import com.example.aethis.mandate.dto.MandateResponse;
import com.example.aethis.model.AuditEvent;
import com.example.aethis.model.AuditType;
import com.example.aethis.model.IntentMandate;
import com.example.aethis.model.MandateStatus;
import com.example.aethis.model.Snapshots;
import com.example.aethis.repo.IntentMandateRepository;
import com.example.aethis.repo.PaymentMandateRepository;
import com.example.aethis.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;

@Service
public class IntentMandateService {

    private static final BigDecimal DEFAULT_ESCALATION_THRESHOLD_PCT = new BigDecimal("90");

    private final IntentMandateRepository mandates;
    private final PaymentMandateRepository payments;
    private final AuditService auditService;

    public IntentMandateService(IntentMandateRepository mandates, PaymentMandateRepository payments,
                                AuditService auditService) {
        this.mandates = mandates;
        this.payments = payments;
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
        mandate.setStandingInstruction(normalise(request.standingInstruction()));
        mandate.setPerOrderCap(Money.normalize(request.perOrderCap()));
        mandate.setMonthlyCap(Money.normalize(request.monthlyCap()));
        mandate.setEscalationThresholdPct(Money.normalize(escalationThresholdPct));
        mandate.setIssuedAt(Instant.now());
        mandate.setExpiresAt(request.expiresAt());
        mandate.setStatus(MandateStatus.ACTIVE);
        mandate.setMandateHash("");
        mandates.saveAndFlush(mandate);

        mandate.setMandateHash(Hashing.contentHash(Snapshots.of(mandate)));

        auditService.record(userId, AuditType.INTENT_MANDATE, mandate.getId(),
                AuditEvent.ISSUED, null, Snapshots.of(mandate));

        return withSpend(mandate);
    }

    private static String normalise(String instruction) {
        return instruction == null || instruction.isBlank() ? null : instruction.trim();
    }

    @Transactional(readOnly = true)
    public MandateResponse activeFor(Long userId) {
        return mandates.findByUserIdAndStatus(userId, MandateStatus.ACTIVE)
                .map(this::withSpend)
                .orElseThrow(() -> ApiException.notFound("No active mandate for this user"));
    }

    private MandateResponse withSpend(IntentMandate mandate) {
        return MandateResponse.of(mandate, payments.totalPaidForMandate(mandate.getId()));
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

        return withSpend(mandate);
    }
}
