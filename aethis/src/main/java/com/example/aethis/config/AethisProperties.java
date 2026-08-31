package com.example.aethis.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.List;

@ConfigurationProperties(prefix = "aethis")
public record AethisProperties(
        Jwt jwt,
        String serviceToken,
        Cors cors) {

    public record Jwt(String secret, Duration ttl) {
    }

    public record Cors(List<String> allowedOrigins) {
    }
}
