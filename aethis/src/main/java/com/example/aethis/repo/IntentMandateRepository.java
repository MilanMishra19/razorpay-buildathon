package com.example.aethis.repo;

import com.example.aethis.model.IntentMandate;
import com.example.aethis.model.MandateStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;

public interface IntentMandateRepository extends JpaRepository<IntentMandate, Long> {

    Optional<IntentMandate> findByUserIdAndStatus(Long userId, MandateStatus status);

    Optional<IntentMandate> findByIdAndUserId(Long id, Long userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select m from IntentMandate m where m.id = :id and m.userId = :userId")
    Optional<IntentMandate> findByIdAndUserIdForUpdate(Long id, Long userId);
}
