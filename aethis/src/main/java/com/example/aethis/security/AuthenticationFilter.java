package com.example.aethis.security;

import com.example.aethis.config.AethisProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.jspecify.annotations.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

public class AuthenticationFilter extends OncePerRequestFilter {

    private static final String SERVICE_TOKEN_HEADER = "X-Service-Token";
    private static final String ON_BEHALF_OF_HEADER = "X-On-Behalf-Of";

    private final JwtService jwtService;
    private final String serviceToken;

    public AuthenticationFilter(JwtService jwtService, AethisProperties properties) {
        this.jwtService = jwtService;
        this.serviceToken = properties.serviceToken();
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain) throws ServletException, IOException {
        Long userId;
        try {
            userId = resolveUserId(request);
        } catch (ServiceAuthException e) {
            response.sendError(e.status, e.getMessage());
            return;
        }

        if (userId != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            var authorities = List.of(new SimpleGrantedAuthority("ROLE_USER"));
            var authentication = new UsernamePasswordAuthenticationToken(userId, null, authorities);
            authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
            SecurityContextHolder.getContext().setAuthentication(authentication);
        }

        chain.doFilter(request, response);
    }

    private Long resolveUserId(HttpServletRequest request) {
        String presentedServiceToken = request.getHeader(SERVICE_TOKEN_HEADER);
        if (StringUtils.hasText(presentedServiceToken)) {
            if (!presentedServiceToken.equals(serviceToken)) {
                throw new ServiceAuthException(HttpServletResponse.SC_UNAUTHORIZED, "Invalid service token");
            }
            String onBehalfOf = request.getHeader(ON_BEHALF_OF_HEADER);
            if (!StringUtils.hasText(onBehalfOf)) {
                throw new ServiceAuthException(HttpServletResponse.SC_BAD_REQUEST, "Missing " + ON_BEHALF_OF_HEADER);
            }
            try {
                return Long.valueOf(onBehalfOf.trim());
            } catch (NumberFormatException e) {
                throw new ServiceAuthException(HttpServletResponse.SC_BAD_REQUEST, "Malformed " + ON_BEHALF_OF_HEADER);
            }
        }

        String authorization = request.getHeader("Authorization");
        if (StringUtils.hasText(authorization) && authorization.startsWith("Bearer ")) {
            try {
                return jwtService.parseUserId(authorization.substring(7).trim());
            } catch (Exception ignored) {
                return null;
            }
        }
        return null;
    }

    private static final class ServiceAuthException extends RuntimeException {
        private final int status;

        private ServiceAuthException(int status, String message) {
            super(message);
            this.status = status;
        }
    }
}
