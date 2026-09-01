package com.example.aethis.repo;

import com.example.aethis.model.CartMandate;
import com.example.aethis.model.CartStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CartMandateRepository extends JpaRepository<CartMandate, Long> {

    Optional<CartMandate> findByIdAndUserId(Long id, Long userId);

    Optional<CartMandate> findByIdempotencyKey(String idempotencyKey);

    List<CartMandate> findByUserIdOrderByIdDesc(Long userId);

    List<CartMandate> findByUserIdAndStatusOrderByIdDesc(Long userId, CartStatus status);

    void deleteByUserId(Long userId);
}
