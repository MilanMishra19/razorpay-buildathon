package com.example.aethis.merchant;

import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/merchant")
@Tag(name = "Merchant")
public class MerchantController {

    private final MerchantMetricsService metrics;

    public MerchantController(MerchantMetricsService metrics) {
        this.metrics = metrics;
    }

    @GetMapping("/metrics")
    public MerchantMetrics metrics() {
        return metrics.acrossAllBuyers();
    }
}
