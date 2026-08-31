package com.example.aethis.repo;

import com.example.aethis.model.AuditLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {

    List<AuditLog> findByUserIdOrderByIdAsc(Long userId);

    List<AuditLog> findAllByOrderByIdAsc();

    Optional<AuditLog> findFirstByOrderByIdDesc();
}
