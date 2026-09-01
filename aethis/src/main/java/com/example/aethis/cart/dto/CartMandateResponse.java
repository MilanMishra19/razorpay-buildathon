package com.example.aethis.cart.dto;

import com.example.aethis.model.CartItem;
import com.example.aethis.model.CartMandate;
import com.example.aethis.model.CartStatus;
import com.example.aethis.model.PolicyDecision;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record CartMandateResponse(
        Long id,
        Long intentMandateId,
        CartStatus status,
        String rejectionReason,
        List<CartItem> cartItems,
        BigDecimal totalAmount,
        String cartHash,
        PolicyDecision policyDecision,
        Instant createdAt) {

    public static CartMandateResponse of(CartMandate cart) {
        return new CartMandateResponse(
                cart.getId(),
                cart.getIntentMandateId(),
                cart.getStatus(),
                cart.getRejectionReason(),
                cart.getCartItems(),
                cart.getTotalAmount(),
                cart.getCartHash(),
                cart.getPolicyDecision(),
                cart.getCreatedAt());
    }
}
