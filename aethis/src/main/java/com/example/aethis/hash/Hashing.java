package com.example.aethis.hash;

import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

public final class Hashing {

    public static final String GENESIS = "GENESIS";

    private static final ObjectMapper CANONICAL = JsonMapper.builder()
            .addModule(new JavaTimeModule())
            .configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true)
            .configure(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS, false)
            .configure(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY, true)
            .build();

    private Hashing() {
    }

    public static String canonicalJson(Object value) {
        try {
            return CANONICAL.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalArgumentException("Cannot serialize value for hashing", e);
        }
    }

    public static String sha256Hex(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public static String contentHash(Object snapshot) {
        return sha256Hex(canonicalJson(snapshot));
    }

    public static String chainedHash(String prevHash, Object payload) {
        return sha256Hex(prevHash + "\n" + canonicalJson(payload));
    }
}
