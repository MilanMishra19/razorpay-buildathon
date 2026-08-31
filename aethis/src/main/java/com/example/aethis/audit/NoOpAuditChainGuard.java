package com.example.aethis.audit;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("test")
class NoOpAuditChainGuard implements AuditChainGuard {

    @Override
    public void acquire() {
    }
}
