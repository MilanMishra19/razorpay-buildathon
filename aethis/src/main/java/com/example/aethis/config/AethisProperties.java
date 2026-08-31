package com.example.aethis.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.List;

@ConfigurationProperties(prefix = "aethis")
public record AethisProperties(
        Jwt jwt,
        String serviceToken,
        Cors cors,
        Razorpay razorpay) {

    public AethisProperties {
        if (cors == null) {
            cors = new Cors(List.of());
        }
        if (razorpay == null) {
            razorpay = new Razorpay(null, null, false);
        }
    }

    public record Jwt(String secret, Duration ttl) {
    }

    public record Cors(List<String> allowedOrigins) {
    }

    public record Razorpay(String keyId, String keySecret, boolean forceFailure) {
    }
}
