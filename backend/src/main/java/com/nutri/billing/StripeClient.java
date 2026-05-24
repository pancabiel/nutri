package com.nutri.billing;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Direct HTTP client for the handful of Stripe REST calls we need (Checkout
 * session create, Customer create, Billing Portal session create) plus webhook
 * signature verification. Avoids the Stripe Java SDK because the SDK depends on
 * GSON + heavy reflection, which is painful to make native-image friendly. The
 * surface we use is small enough that hand-rolling is the cheaper trade.
 *
 * <p>Form-encoded request bodies follow Stripe's "deep object" convention:
 * {@code line_items[0][price]=price_xxx}. Responses are JSON — parsed by the
 * caller with Jackson.
 */
@ApplicationScoped
public class StripeClient {

    private static final Logger LOG = Logger.getLogger(StripeClient.class);
    private static final String API_BASE = "https://api.stripe.com/v1";
    /** Stripe's recommended max age for webhook events (5 minutes). */
    private static final long WEBHOOK_TOLERANCE_SECONDS = 300;

    @ConfigProperty(name = "stripe.secret-key")     Optional<String> secretKey;
    @ConfigProperty(name = "stripe.webhook-secret") Optional<String> webhookSecret;

    private HttpClient http;

    @PostConstruct
    void init() {
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }

    public boolean isConfigured() {
        return secretKey.filter(s -> !s.isBlank()).isPresent();
    }

    /** Creates a Stripe Customer with the user's email and our internal user id in metadata. */
    public String createCustomer(String email, String userId) {
        var form = new LinkedHashMap<String, String>();
        if (email != null && !email.isBlank()) form.put("email", email);
        form.put("metadata[user_id]", userId);
        var body = post("/customers", form);
        return extractId(body);
    }

    /**
     * Creates a Checkout Session in subscription mode and returns the redirect URL.
     * {@code clientReferenceId} carries our user id so the webhook can map back even
     * if customer creation races.
     */
    public String createCheckoutSession(String customerId, String priceId,
                                        String successUrl, String cancelUrl,
                                        String clientReferenceId) {
        var form = new LinkedHashMap<String, String>();
        form.put("mode", "subscription");
        form.put("customer", customerId);
        form.put("line_items[0][price]", priceId);
        form.put("line_items[0][quantity]", "1");
        form.put("success_url", successUrl);
        form.put("cancel_url", cancelUrl);
        form.put("client_reference_id", clientReferenceId);
        form.put("allow_promotion_codes", "true");
        var body = post("/checkout/sessions", form);
        return extractField(body, "url");
    }

    /** Creates a Customer Portal session and returns the redirect URL. */
    public String createPortalSession(String customerId, String returnUrl) {
        var form = new LinkedHashMap<String, String>();
        form.put("customer", customerId);
        form.put("return_url", returnUrl);
        var body = post("/billing_portal/sessions", form);
        return extractField(body, "url");
    }

    /**
     * Verifies a Stripe webhook signature. Header looks like
     * {@code t=1700000000,v1=abc...,v1=def...}. We compute HMAC-SHA256 of
     * {@code "<t>.<payload>"} with the webhook secret and constant-time match
     * any of the v1 entries. Also enforces the 5-minute timestamp tolerance.
     */
    public boolean verifyWebhookSignature(String payload, String signatureHeader) {
        var secret = webhookSecret.filter(s -> !s.isBlank()).orElse(null);
        if (secret == null) {
            LOG.warn("stripe.webhook-secret is not configured — rejecting webhook");
            return false;
        }
        return verifySignature(secret, payload, signatureHeader, Instant.now().getEpochSecond());
    }

    /**
     * Pure verification: separated for testability. {@code nowEpochSeconds} lets
     * tests freeze time so the 5-minute tolerance check is deterministic.
     */
    static boolean verifySignature(String secret, String payload, String signatureHeader, long nowEpochSeconds) {
        if (signatureHeader == null || signatureHeader.isBlank()) return false;

        Long timestamp = null;
        var v1Signatures = new java.util.ArrayList<String>();
        for (String part : signatureHeader.split(",")) {
            int eq = part.indexOf('=');
            if (eq < 0) continue;
            String key = part.substring(0, eq).trim();
            String value = part.substring(eq + 1).trim();
            if ("t".equals(key)) {
                try { timestamp = Long.parseLong(value); } catch (NumberFormatException ignore) {}
            } else if ("v1".equals(key)) {
                v1Signatures.add(value);
            }
        }
        if (timestamp == null || v1Signatures.isEmpty()) return false;
        if (Math.abs(nowEpochSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS) return false;

        String signedPayload = timestamp + "." + payload;
        String expected = hmacSha256Hex(secret, signedPayload);
        for (String candidate : v1Signatures) {
            if (constantTimeEquals(expected, candidate)) return true;
        }
        return false;
    }

    private String post(String path, Map<String, String> form) {
        if (!isConfigured()) {
            throw new IllegalStateException("stripe.secret-key is not configured");
        }
        String formBody = encodeForm(form);
        var req = HttpRequest.newBuilder()
                .uri(URI.create(API_BASE + path))
                .header("Authorization", "Bearer " + secretKey.get())
                .header("Content-Type", "application/x-www-form-urlencoded")
                .timeout(Duration.ofSeconds(10))
                .POST(HttpRequest.BodyPublishers.ofString(formBody, StandardCharsets.UTF_8))
                .build();
        try {
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (res.statusCode() < 200 || res.statusCode() >= 300) {
                LOG.errorf("Stripe POST %s failed: %d %s", path, res.statusCode(), res.body());
                throw new RuntimeException("Stripe API error " + res.statusCode());
            }
            return res.body();
        } catch (java.io.IOException | InterruptedException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new RuntimeException("Stripe request failed: " + path, e);
        }
    }

    private static String encodeForm(Map<String, String> form) {
        var sb = new StringBuilder();
        for (var e : form.entrySet()) {
            if (sb.length() > 0) sb.append('&');
            sb.append(URLEncoder.encode(e.getKey(), StandardCharsets.UTF_8))
              .append('=')
              .append(URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8));
        }
        return sb.toString();
    }

    /** Tiny ad-hoc JSON field extractor: enough for {@code "id":"..."} / {@code "url":"..."}. */
    private static String extractId(String json) { return extractField(json, "id"); }

    private static String extractField(String json, String field) {
        String needle = "\"" + field + "\"";
        int k = json.indexOf(needle);
        if (k < 0) throw new RuntimeException("missing field '" + field + "' in Stripe response");
        int colon = json.indexOf(':', k + needle.length());
        if (colon < 0) throw new RuntimeException("malformed Stripe response near '" + field + "'");
        int i = colon + 1;
        while (i < json.length() && Character.isWhitespace(json.charAt(i))) i++;
        if (i >= json.length() || json.charAt(i) != '"') {
            throw new RuntimeException("expected string for '" + field + "' in Stripe response");
        }
        var sb = new StringBuilder();
        i++;
        while (i < json.length()) {
            char c = json.charAt(i);
            if (c == '\\' && i + 1 < json.length()) {
                char n = json.charAt(i + 1);
                switch (n) {
                    case '"', '\\', '/' -> sb.append(n);
                    case 'n' -> sb.append('\n');
                    case 't' -> sb.append('\t');
                    case 'r' -> sb.append('\r');
                    default -> sb.append(n);
                }
                i += 2;
            } else if (c == '"') {
                return sb.toString();
            } else {
                sb.append(c);
                i++;
            }
        }
        throw new RuntimeException("unterminated string for '" + field + "' in Stripe response");
    }

    private static String hmacSha256Hex(String secret, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] sig = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            var sb = new StringBuilder(sig.length * 2);
            for (byte b : sig) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new RuntimeException("HMAC failure", e);
        }
    }

    private static boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null || a.length() != b.length()) return false;
        int diff = 0;
        for (int i = 0; i < a.length(); i++) diff |= a.charAt(i) ^ b.charAt(i);
        return diff == 0;
    }

}
