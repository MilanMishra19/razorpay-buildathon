package com.example.aethis.repo;

import com.example.aethis.model.AgentRun;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AgentRunRepository extends JpaRepository<AgentRun, Long> {

    Optional<AgentRun> findByIdAndUserId(Long id, Long userId);

    List<AgentRun> findByUserIdOrderByIdDesc(Long userId, Limit limit);

    void deleteByUserId(Long userId);
}
