package com.example.aethis.payment;

import org.springframework.http.client.support.BasicAuthenticationInterceptor;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.math.BigDecimal;
import java.util.Map;

class RealRazorpayClient implements RazorpayClient {

    private final RestClient http;

    RealRazorpayClient(String keyId, String keySecret) {
        this.http = RestClient.builder()
                .baseUrl("https://api.razorpay.com/v1")
                .requestInterceptor(new BasicAuthenticationInterceptor(keyId, keySecret))
                .build();
    }

    @Override
    public Order createOrder(BigDecimal amount, String receipt) {
        Map<String, Object> body = Map.of(
                "amount", amount.movePointRight(2).longValueExact(),
                "currency", "INR",
                "receipt", receipt);
        try {
            Map<?, ?> response = http.post()
                    .uri("/orders")
                    .body(body)
                    .retrieve()
                    .body(Map.class);
            if (response == null || response.get("id") == null) {
                throw new RazorpayException("Razorpay returned no order id");
            }
            return new Order((String) response.get("id"), String.valueOf(response.get("status")));
        } catch (RestClientException e) {
            throw new RazorpayException("Razorpay order creation failed: " + e.getMessage());
        }
    }
}
