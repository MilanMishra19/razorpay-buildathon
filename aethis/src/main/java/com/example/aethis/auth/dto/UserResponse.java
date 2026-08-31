package com.example.aethis.auth.dto;

import com.example.aethis.model.User;

import java.time.Instant;

public record UserResponse(Long id, String name, String email, Instant createdAt) {

    public static UserResponse of(User user) {
        return new UserResponse(user.getId(), user.getName(), user.getEmail(), user.getCreatedAt());
    }
}
