package com.example.aethis.restock;

import com.example.aethis.restock.dto.AddRestockRequest;
import com.example.aethis.restock.dto.RestockEntryResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/restock-list")
public class RestockController {

    private final RestockService restockService;

    public RestockController(RestockService restockService) {
        this.restockService = restockService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public RestockEntryResponse add(@AuthenticationPrincipal Long userId,
                                    @Valid @RequestBody AddRestockRequest request) {
        return restockService.add(userId, request.catalogId());
    }

    @GetMapping
    public List<RestockEntryResponse> list(@AuthenticationPrincipal Long userId) {
        return restockService.listOpen(userId);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(@AuthenticationPrincipal Long userId, @PathVariable Long id) {
        restockService.remove(userId, id);
    }

    @PostMapping("/consume")
    public List<Long> consume(@AuthenticationPrincipal Long userId,
                              @RequestBody(required = false) ConsumeRequest request) {
        return restockService.consumeOpen(userId, request == null ? null : request.catalogIds());
    }

    public record ConsumeRequest(List<Long> catalogIds) {
    }
}
