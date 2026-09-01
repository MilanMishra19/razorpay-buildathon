package com.example.aethis.demo;

import com.example.aethis.model.AuditLog;
import com.example.aethis.repo.AgentRunRepository;
import com.example.aethis.repo.AuditLogRepository;
import com.example.aethis.repo.CartMandateRepository;
import com.example.aethis.repo.IntentMandateRepository;
import com.example.aethis.repo.PaymentMandateRepository;
import com.example.aethis.repo.RestockListRepository;
import com.example.aethis.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class DemoService {

    static final String MARKER = " [tampered]";

    private final AuditLogRepository auditLog;
    private final AgentRunRepository agentRuns;
    private final PaymentMandateRepository payments;
    private final CartMandateRepository carts;
    private final RestockListRepository restock;
    private final IntentMandateRepository mandates;

    public DemoService(AuditLogRepository auditLog, AgentRunRepository agentRuns,
                       PaymentMandateRepository payments, CartMandateRepository carts,
                       RestockListRepository restock, IntentMandateRepository mandates) {
        this.auditLog = auditLog;
        this.agentRuns = agentRuns;
        this.payments = payments;
        this.carts = carts;
        this.restock = restock;
        this.mandates = mandates;
    }

    @Transactional
    public void reset(Long userId) {
        agentRuns.deleteByUserId(userId);
        payments.deleteByUserId(userId);
        carts.deleteByUserId(userId);
        restock.deleteByUserId(userId);
        auditLog.deleteByUserId(userId);
        mandates.deleteByUserId(userId);
    }

    @Transactional
    public Long tamper(Long userId) {
        List<AuditLog> rows = auditLog.findByUserIdOrderByIdAsc(userId);
        if (rows.size() < 2) {
            throw ApiException.conflict("Need at least two audit rows before the chain can visibly break");
        }

        AuditLog target = rows.stream()
                .filter(row -> row.getReason() == null || !row.getReason().endsWith(MARKER))
                .skip(Math.max(0, rows.size() / 2 - 1))
                .findFirst()
                .orElseThrow(() -> ApiException.conflict("Every row is already tampered with"));

        target.setReason(target.getReason() == null ? MARKER.trim() : target.getReason() + MARKER);
        return target.getId();
    }

    @Transactional
    public int restore(Long userId) {
        List<AuditLog> rows = auditLog.findByUserIdOrderByIdAsc(userId);
        int restored = 0;

        for (AuditLog row : rows) {
            String reason = row.getReason();
            if (reason == null) {
                continue;
            }
            if (reason.endsWith(MARKER)) {
                row.setReason(reason.substring(0, reason.length() - MARKER.length()));
                restored++;
            } else if (reason.equals(MARKER.trim())) {
                row.setReason(null);
                restored++;
            }
        }

        return restored;
    }
}
