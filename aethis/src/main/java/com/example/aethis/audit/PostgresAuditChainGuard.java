package com.example.aethis.audit;

import jakarta.persistence.EntityManager;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("!test")
class PostgresAuditChainGuard implements AuditChainGuard {

    private static final long LOCK_KEY = 0x41455448_4C4F4721L;

    private final EntityManager entityManager;

    PostgresAuditChainGuard(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    @Override
    public void acquire() {
        entityManager.createNativeQuery("select pg_advisory_xact_lock(:key)")
                .setParameter("key", LOCK_KEY)
                .getSingleResult();
    }
}
