package com.example.aethis.config;

import com.example.aethis.model.CartStatus;
import com.example.aethis.web.ApiException;
import org.springframework.core.convert.converter.Converter;
import org.springframework.stereotype.Component;

@Component
class StringToCartStatusConverter implements Converter<String, CartStatus> {

    @Override
    public CartStatus convert(String source) {
        try {
            return CartStatus.from(source);
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("Unknown cart status: " + source);
        }
    }
}
