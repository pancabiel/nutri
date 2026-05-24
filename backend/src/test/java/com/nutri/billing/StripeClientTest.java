package com.nutri.billing;

import org.junit.jupiter.api.Test;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Webhook signature verification is the only thing standing between Stripe and
 * is_pro=true, so it gets its own focused tests. We exercise the static
 * {@code verifySignature} helper directly so we can freeze {@code now} and avoid
 * any Quarkus/CDI setup.
 */
class StripeClientTest {

    private static final String SECRET = "whsec_test_super_secret_12345";

    @Test
    void validSignatureWithinToleranceIsAccepted() {
        long t = 1_700_000_000L;
        String payload = "{\"id\":\"evt_1\",\"type\":\"checkout.session.completed\"}";
        String header = "t=" + t + ",v1=" + hmacHex(SECRET, t + "." + payload);

        assertTrue(StripeClient.verifySignature(SECRET, payload, header, t + 30));
    }

    @Test
    void tamperedPayloadIsRejected() {
        long t = 1_700_000_000L;
        String payload = "{\"id\":\"evt_1\"}";
        String header = "t=" + t + ",v1=" + hmacHex(SECRET, t + "." + payload);
        // attacker mutates the body but keeps the signature
        String tampered = "{\"id\":\"evt_evil\"}";

        assertFalse(StripeClient.verifySignature(SECRET, tampered, header, t + 5));
    }

    @Test
    void wrongSecretIsRejected() {
        long t = 1_700_000_000L;
        String payload = "{\"id\":\"evt_1\"}";
        String header = "t=" + t + ",v1=" + hmacHex("whsec_other", t + "." + payload);

        assertFalse(StripeClient.verifySignature(SECRET, payload, header, t + 5));
    }

    @Test
    void replayPastToleranceIsRejected() {
        long t = 1_700_000_000L;
        String payload = "{\"id\":\"evt_1\"}";
        String header = "t=" + t + ",v1=" + hmacHex(SECRET, t + "." + payload);
        // Stripe's documented tolerance is 5 minutes; we pass 10 minutes drift.
        assertFalse(StripeClient.verifySignature(SECRET, payload, header, t + 600));
    }

    @Test
    void multipleV1SignaturesAreAllChecked() {
        long t = 1_700_000_000L;
        String payload = "{\"id\":\"evt_1\"}";
        String good = hmacHex(SECRET, t + "." + payload);
        // Stripe sends multiple v1=... entries during key rotation. Any matching one wins.
        String header = "t=" + t + ",v1=deadbeef,v1=" + good + ",v1=cafebabe";
        assertTrue(StripeClient.verifySignature(SECRET, payload, header, t));
    }

    @Test
    void malformedHeaderIsRejected() {
        assertFalse(StripeClient.verifySignature(SECRET, "{}", null, 0));
        assertFalse(StripeClient.verifySignature(SECRET, "{}", "", 0));
        assertFalse(StripeClient.verifySignature(SECRET, "{}", "garbage", 0));
        assertFalse(StripeClient.verifySignature(SECRET, "{}", "t=abc,v1=xyz", 0));   // bad timestamp
        assertFalse(StripeClient.verifySignature(SECRET, "{}", "t=1000000000", 0));   // missing v1
    }

    private static String hmacHex(String secret, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] sig = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            var sb = new StringBuilder();
            for (byte b : sig) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
