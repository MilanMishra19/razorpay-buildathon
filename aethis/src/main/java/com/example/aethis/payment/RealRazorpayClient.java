package com.example.aethis.payment;

import org.springframework.http.client.support.BasicAuthenticationInterceptor;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;

class RealRazorpayClient implements RazorpayClient {

    private static final String HMAC_SHA256 = "HmacSHA256";

    private final RestClient http;
    private final String keyId;
    private final String keySecret;

    RealRazorpayClient(String keyId, String keySecret) {
        this.keyId = keyId;
        this.keySecret = keySecret;
        this.http = RestClient.builder()
                .baseUrl("https://api.razorpay.com/v1")
                .requestInterceptor(new BasicAuthenticationInterceptor(keyId, keySecret))
                .build();
    }

    @Override
    public boolean supportsCheckout() {
        return true;
    }

    @Override
    public String publicKeyId() {
        return keyId;
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

    @Override
    public boolean verifySignature(String orderId, String paymentId, String signature) {
        if (orderId == null || paymentId == null || signature == null) {
            return false;
        }
        try {
            Mac mac = Mac.getInstance(HMAC_SHA256);
            mac.init(new SecretKeySpec(keySecret.getBytes(StandardCharsets.UTF_8), HMAC_SHA256));
            byte[] expected = mac.doFinal((orderId + "|" + paymentId).getBytes(StandardCharsets.UTF_8));
            return MessageDigest.isEqual(
                    HexFormat.of().formatHex(expected).getBytes(StandardCharsets.UTF_8),
                    signature.trim().toLowerCase().getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new RazorpayException("Could not verify the payment signature: " + e.getMessage());
        }
    }
}
