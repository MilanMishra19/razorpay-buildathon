package com.example.aethis.audit;

import com.example.aethis.hash.Hashing;
import com.example.aethis.model.AuditEvent;
import com.example.aethis.model.AuditLog;
import com.example.aethis.model.AuditType;
import com.example.aethis.repo.AuditLogRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AuditService {

    private final AuditLogRepository repository;
    private final AuditChainGuard chainGuard;

    public AuditService(AuditLogRepository repository, AuditChainGuard chainGuard) {
        this.repository = repository;
        this.chainGuard = chainGuard;
    }

    @Transactional
    public AuditLog record(Long userId, AuditType type, Long referenceId, AuditEvent event,
                           String reason, Map<String, Object> snapshot) {
        chainGuard.acquire();

        String prevHash = repository.findFirstByUserIdOrderByIdDesc(userId)
                .map(AuditLog::getDataHash)
                .orElse(Hashing.GENESIS);
        String snapshotJson = Hashing.canonicalJson(snapshot);

        AuditLog entry = new AuditLog();
        entry.setUserId(userId);
        entry.setType(type);
        entry.setReferenceId(referenceId);
        entry.setEvent(event);
        entry.setReason(reason);
        entry.setRecordSnapshot(snapshotJson);
        entry.setPrevHash(Hashing.GENESIS.equals(prevHash) ? null : prevHash);
        entry.setDataHash(dataHash(prevHash, type, referenceId, event, reason, snapshotJson));

        return repository.save(entry);
    }

    @Transactional(readOnly = true)
    public List<AuditEntryResponse> history(Long userId) {
        return repository.findByUserIdOrderByIdAsc(userId).stream()
                .map(row -> new AuditEntryResponse(
                        row.getId(),
                        row.getType(),
                        row.getEvent(),
                        row.getReason(),
                        AuditSummary.describe(row),
                        row.getCreatedAt()))
                .toList();
    }

    @Transactional(readOnly = true)
    public ChainVerification verifyChain(Long userId) {
        List<AuditLog> rows = repository.findByUserIdOrderByIdAsc(userId);
        String prevHash = Hashing.GENESIS;

        for (AuditLog row : rows) {
            String linkedPrev = row.getPrevHash() == null ? Hashing.GENESIS : row.getPrevHash();
            if (!linkedPrev.equals(prevHash)) {
                return ChainVerification.brokenAt(row.getId());
            }

            String expected = dataHash(prevHash, row.getType(), row.getReferenceId(),
                    row.getEvent(), row.getReason(), row.getRecordSnapshot());
            if (!expected.equals(row.getDataHash())) {
                return ChainVerification.brokenAt(row.getId());
            }

            prevHash = row.getDataHash();
        }

        return ChainVerification.ok();
    }

    private String dataHash(String prevHash, AuditType type, Long referenceId, AuditEvent event,
                            String reason, String snapshotJson) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("prevHash", prevHash);
        payload.put("type", type.name());
        payload.put("referenceId", referenceId);
        payload.put("event", event.name());
        payload.put("reason", reason);
        payload.put("snapshot", snapshotJson);
        return Hashing.sha256Hex(Hashing.canonicalJson(payload));
    }
}
