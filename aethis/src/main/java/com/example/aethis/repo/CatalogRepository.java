package com.example.aethis.repo;

import com.example.aethis.model.Catalog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CatalogRepository extends JpaRepository<Catalog, Long> {

    List<Catalog> findByCategoryOrderByNameAsc(String category);
}
