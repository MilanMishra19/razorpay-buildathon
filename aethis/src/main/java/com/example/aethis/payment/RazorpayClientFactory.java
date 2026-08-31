package com.example.aethis.payment;

public final class RazorpayClientFactory {

    private RazorpayClientFactory() {
    }

    public static RazorpayClient real(String keyId, String keySecret) {
        return new RealRazorpayClient(keyId, keySecret);
    }

    public static RazorpayClient stub(boolean forceFailure) {
        return new StubRazorpayClient(forceFailure);
    }
}
