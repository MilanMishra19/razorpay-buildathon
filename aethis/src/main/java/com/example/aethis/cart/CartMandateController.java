package com.example.aethis.cart;

import com.example.aethis.cart.dto.CartDecisionResponse;
import com.example.aethis.cart.dto.CartMandateResponse;
import com.example.aethis.cart.dto.ProposeCartRequest;
import com.example.aethis.cart.dto.ResolveCartRequest;
import com.example.aethis.model.CartStatus;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/cart-mandates")
public class CartMandateController {

    private final CartMandateService cartMandateService;

    public CartMandateController(CartMandateService cartMandateService) {
        this.cartMandateService = cartMandateService;
    }

    @PostMapping
    public CartDecisionResponse propose(@AuthenticationPrincipal Long userId,
                                        @Valid @RequestBody ProposeCartRequest request) {
        return cartMandateService.propose(userId, request);
    }

    @GetMapping("/{id}")
    public CartMandateResponse get(@AuthenticationPrincipal Long userId, @PathVariable Long id) {
        return cartMandateService.get(userId, id);
    }

    @GetMapping
    public List<CartMandateResponse> history(@AuthenticationPrincipal Long userId,
                                             @RequestParam(required = false) CartStatus status) {
        return cartMandateService.history(userId, status);
    }

    @PostMapping("/{id}/resolve")
    public CartMandateResponse resolve(@AuthenticationPrincipal Long userId, @PathVariable Long id,
                                       @Valid @RequestBody ResolveCartRequest request) {
        return cartMandateService.resolve(userId, id, request.decision());
    }
}
