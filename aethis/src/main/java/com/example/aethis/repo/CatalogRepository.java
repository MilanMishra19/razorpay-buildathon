package com.example.aethis.repo;

import com.example.aethis.model.Catalog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface CatalogRepository extends JpaRepository<Catalog, Long> {

    List<Catalog> findByCategoryOrderByNameAsc(String category);

    List<Catalog> findAllByOrderByCategoryAscNameAsc();

    @Query("select distinct c.category from Catalog c order by c.category")
    List<String> findDistinctCategories();
}
