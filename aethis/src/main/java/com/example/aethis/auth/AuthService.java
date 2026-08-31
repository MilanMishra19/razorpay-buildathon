package com.example.aethis.auth;

import com.example.aethis.auth.dto.AuthResponse;
import com.example.aethis.auth.dto.LoginRequest;
import com.example.aethis.auth.dto.RegisterRequest;
import com.example.aethis.auth.dto.UserResponse;
import com.example.aethis.model.User;
import com.example.aethis.repo.UserRepository;
import com.example.aethis.security.JwtService;
import com.example.aethis.web.ApiException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder, JwtService jwtService) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @Transactional
    public UserResponse register(RegisterRequest request) {
        String email = request.email().trim().toLowerCase();
        if (users.existsByEmail(email)) {
            throw ApiException.conflict("Email already registered");
        }

        User user = new User();
        user.setName(request.name().trim());
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.password()));

        return UserResponse.of(users.save(user));
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        String email = request.email().trim().toLowerCase();
        User user = users.findByEmail(email)
                .filter(candidate -> passwordEncoder.matches(request.password(), candidate.getPasswordHash()))
                .orElseThrow(() -> ApiException.unauthorized("Invalid email or password"));

        return new AuthResponse(jwtService.issue(user.getId()));
    }
}
