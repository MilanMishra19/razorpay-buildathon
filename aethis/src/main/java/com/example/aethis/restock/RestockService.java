package com.example.aethis.restock;

import com.example.aethis.model.Catalog;
import com.example.aethis.model.RestockList;
import com.example.aethis.repo.CatalogRepository;
import com.example.aethis.repo.RestockListRepository;
import com.example.aethis.restock.dto.RestockEntryResponse;
import com.example.aethis.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class RestockService {

    private final RestockListRepository restock;
    private final CatalogRepository catalog;

    public RestockService(RestockListRepository restock, CatalogRepository catalog) {
        this.restock = restock;
        this.catalog = catalog;
    }

    @Transactional
    public RestockEntryResponse add(Long userId, Long catalogId) {
        Catalog item = catalog.findById(catalogId)
                .orElseThrow(() -> ApiException.badRequest("Unknown catalog item: " + catalogId));

        RestockList entry = restock.findByUserIdAndCatalogIdAndConsumedAtIsNull(userId, catalogId)
                .orElseGet(() -> {
                    RestockList fresh = new RestockList();
                    fresh.setUserId(userId);
                    fresh.setCatalogId(catalogId);
                    return restock.save(fresh);
                });

        return toResponse(entry, item.getName());
    }

    @Transactional(readOnly = true)
    public List<RestockEntryResponse> listOpen(Long userId) {
        List<RestockList> entries = restock.findByUserIdAndConsumedAtIsNullOrderByIdAsc(userId);
        Map<Long, String> names = catalogNames(entries);
        return entries.stream()
                .map(entry -> toResponse(entry, names.get(entry.getCatalogId())))
                .toList();
    }

    @Transactional
    public void remove(Long userId, Long id) {
        RestockList entry = restock.findByIdAndUserId(id, userId)
                .orElseThrow(() -> ApiException.notFound("Restock entry not found"));
        restock.delete(entry);
    }

    @Transactional
    public List<Long> consumeOpen(Long userId) {
        List<RestockList> entries = restock.findByUserIdAndConsumedAtIsNullOrderByIdAsc(userId);
        Instant now = Instant.now();
        entries.forEach(entry -> entry.setConsumedAt(now));
        return entries.stream().map(RestockList::getCatalogId).toList();
    }

    private Map<Long, String> catalogNames(List<RestockList> entries) {
        List<Long> ids = entries.stream().map(RestockList::getCatalogId).toList();
        return catalog.findAllById(ids).stream()
                .collect(Collectors.toMap(Catalog::getId, Catalog::getName, (a, b) -> a));
    }

    private RestockEntryResponse toResponse(RestockList entry, String catalogName) {
        return new RestockEntryResponse(entry.getId(), entry.getCatalogId(), catalogName, entry.getAddedAt());
    }
}
