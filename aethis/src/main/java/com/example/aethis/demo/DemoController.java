package com.example.aethis.demo;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/demo")
@ConditionalOnProperty(name = "aethis.demo-tools", havingValue = "true", matchIfMissing = true)
public class DemoController {

    private final DemoService demoService;
    private final MerchantHistorySeeder seeder;

    public DemoController(DemoService demoService, MerchantHistorySeeder seeder) {
        this.demoService = demoService;
        this.seeder = seeder;
    }

    @GetMapping("/status")
    public Map<String, Object> status() {
        return Map.of("enabled", true);
    }

    @PostMapping("/reset")
    public Map<String, Object> reset(@AuthenticationPrincipal Long userId) {
        demoService.reset(userId);
        return Map.of("reset", true);
    }

    @PostMapping("/tamper")
    public Map<String, Object> tamper(@AuthenticationPrincipal Long userId) {
        return Map.of("tampered_row_id", demoService.tamper(userId));
    }

    @PostMapping("/seed-history")
    public Map<String, Object> seedHistory() {
        MerchantHistorySeeder.SeedResult result = seeder.seed();
        return Map.of("carts", result.carts(), "payments", result.payments(), "gmv", result.gmv());
    }

    @PostMapping("/clear-history")
    public Map<String, Object> clearHistory() {
        return Map.of("removed", seeder.clear());
    }

    @PostMapping("/restore")
    public Map<String, Object> restore(@AuthenticationPrincipal Long userId) {
        return Map.of("restored_rows", demoService.restore(userId));
    }
}
