package com.example.aethis.repo;

import com.example.aethis.model.RestockList;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RestockListRepository extends JpaRepository<RestockList, Long> {

    List<RestockList> findByUserIdAndConsumedAtIsNullOrderByIdAsc(Long userId);

    Optional<RestockList> findByUserIdAndCatalogIdAndConsumedAtIsNull(Long userId, Long catalogId);

    Optional<RestockList> findByIdAndUserId(Long id, Long userId);

    void deleteByUserId(Long userId);
}
