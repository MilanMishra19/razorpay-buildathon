package com.example.aethis.catalog;

import com.example.aethis.repo.CatalogRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
public class CatalogController {

    private final CatalogRepository catalog;

    public CatalogController(CatalogRepository catalog) {
        this.catalog = catalog;
    }

    @GetMapping("/catalog")
    public List<CatalogItemResponse> list(@RequestParam(required = false) String category) {
        var items = category == null || category.isBlank()
                ? catalog.findAllByOrderByCategoryAscNameAsc()
                : catalog.findByCategoryOrderByNameAsc(category.trim().toLowerCase());
        return items.stream().map(CatalogItemResponse::of).toList();
    }

    @GetMapping("/catalog/categories")
    public List<String> categories() {
        return catalog.findDistinctCategories();
    }
}
