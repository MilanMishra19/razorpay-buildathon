package com.example.aethis.repo;

import com.example.aethis.model.IntentMandate;
import com.example.aethis.model.MandateStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface IntentMandateRepository extends JpaRepository<IntentMandate, Long> {

    Optional<IntentMandate> findByUserIdAndStatus(Long userId, MandateStatus status);

    Optional<IntentMandate> findByIdAndUserId(Long id, Long userId);
}
