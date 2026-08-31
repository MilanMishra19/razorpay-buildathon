package com.example.aethis.payment;

import com.example.aethis.payment.dto.PayRequest;
import com.example.aethis.payment.dto.PaymentResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/payment-mandates")
public class PaymentController {

    private final PaymentService paymentService;

    public PaymentController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PaymentResponse pay(@AuthenticationPrincipal Long userId, @Valid @RequestBody PayRequest request) {
        return paymentService.pay(userId, request);
    }

    @GetMapping("/{id}")
    public PaymentResponse get(@AuthenticationPrincipal Long userId, @PathVariable Long id) {
        return paymentService.get(userId, id);
    }

    @PostMapping("/{id}/retry")
    public PaymentResponse retry(@AuthenticationPrincipal Long userId, @PathVariable Long id) {
        return paymentService.retry(userId, id);
    }
}
