package com.example.aethis.mandate;

import com.example.aethis.mandate.dto.IssueMandateRequest;
import com.example.aethis.mandate.dto.MandateResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/intent-mandates")
public class IntentMandateController {

    private final IntentMandateService mandateService;

    public IntentMandateController(IntentMandateService mandateService) {
        this.mandateService = mandateService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public MandateResponse issue(@AuthenticationPrincipal Long userId,
                                 @Valid @RequestBody IssueMandateRequest request) {
        return mandateService.issue(userId, request);
    }

    @GetMapping("/active")
    public List<MandateResponse> active(@AuthenticationPrincipal Long userId,
                                        @RequestParam(required = false) String category) {
        return mandateService.activeFor(userId, category);
    }

    @PostMapping("/{id}/revoke")
    public MandateResponse revoke(@AuthenticationPrincipal Long userId, @PathVariable Long id) {
        return mandateService.revoke(userId, id);
    }
}
