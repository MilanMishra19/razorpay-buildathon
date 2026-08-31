package com.example.aethis.config;

import com.example.aethis.payment.RazorpayClient;
import com.example.aethis.payment.RazorpayClientFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

@Configuration
class RazorpayConfig {

    private static final Logger log = LoggerFactory.getLogger(RazorpayConfig.class);

    @Bean
    RazorpayClient razorpayClient(AethisProperties properties) {
        AethisProperties.Razorpay config = properties.razorpay();
        if (StringUtils.hasText(config.keyId())) {
            log.info("Razorpay client: live (test-mode Orders API)");
            return RazorpayClientFactory.real(config.keyId(), config.keySecret());
        }
        log.info("Razorpay client: stub (no RAZORPAY_KEY_ID set), force-failure={}", config.forceFailure());
        return RazorpayClientFactory.stub(config.forceFailure());
    }
}
