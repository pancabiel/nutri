package com.nutri.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.ECPoint;
import java.security.spec.ECPublicKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.jboss.logging.Logger;

/**
 * Minimal JWT verifier for Supabase access tokens. Supports:
 *   - ES256 (default, asymmetric "JWT Signing Keys" — Supabase 2025+ default)
 *   - HS256 (legacy symmetric secret — Supabase pre-2025)
 *
 * Hand-rolled to avoid pulling a JWT library into the native image build. Public
 * keys for ES256 are fetched from the project's JWKS endpoint, cached in memory,
 * and re-fetched only when a JWT references an unknown `kid` (cheap key rotation
 * handling without scheduled refresh).
 *
 * Issuer/expiry/sub checks are shared across both algorithms.
 */
public final class JwtValidator {

    private static final Logger LOG = Logger.getLogger(JwtValidator.class);
    private static final ObjectMapper M = new ObjectMapper();
    private static final Base64.Decoder URL_DECODER = Base64.getUrlDecoder();

    private final String expectedIssuer;
    private final String jwksUrl;          // null if HS256-only
    private final byte[] legacySecret;     // null if ES256-only

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    private final Map<String, PublicKey> keyCache = new ConcurrentHashMap<>();

    /** ES256 mode: keys fetched from {@code jwksUrl}. {@code legacySecret} may be null. */
    public JwtValidator(String jwksUrl, String expectedIssuer, String legacySecret) {
        if ((jwksUrl == null || jwksUrl.isBlank()) && (legacySecret == null || legacySecret.isBlank())) {
            throw new IllegalArgumentException("either jwksUrl or legacySecret is required");
        }
        this.jwksUrl = (jwksUrl == null || jwksUrl.isBlank()) ? null : jwksUrl;
        this.expectedIssuer = expectedIssuer;
        this.legacySecret = (legacySecret == null || legacySecret.isBlank())
                ? null : legacySecret.getBytes(StandardCharsets.UTF_8);
    }

    public Claims validate(String token) throws InvalidJwtException {
        if (token == null || token.isBlank()) throw new InvalidJwtException("missing token");
        String[] parts = token.split("\\.");
        if (parts.length != 3) throw new InvalidJwtException("malformed token");

        JsonNode header;
        try {
            header = M.readTree(URL_DECODER.decode(parts[0]));
        } catch (Exception e) {
            throw new InvalidJwtException("malformed header");
        }
        String alg = header.path("alg").asText("");
        String kid = header.path("kid").asText(null);

        byte[] signingInput = (parts[0] + "." + parts[1]).getBytes(StandardCharsets.UTF_8);
        byte[] signature;
        try {
            signature = URL_DECODER.decode(parts[2]);
        } catch (IllegalArgumentException e) {
            throw new InvalidJwtException("malformed signature");
        }

        switch (alg) {
            case "ES256" -> verifyEs256(kid, signingInput, signature);
            case "HS256" -> verifyHs256(signingInput, signature);
            default      -> throw new InvalidJwtException("unsupported alg: " + alg);
        }

        // payload
        JsonNode payload;
        try {
            payload = M.readTree(URL_DECODER.decode(parts[1]));
        } catch (Exception e) {
            throw new InvalidJwtException("malformed payload");
        }

        if (expectedIssuer != null && !expectedIssuer.isBlank()) {
            String iss = payload.path("iss").asText("");
            if (!expectedIssuer.equals(iss)) {
                throw new InvalidJwtException("bad issuer: " + iss);
            }
        }

        long now = Instant.now().getEpochSecond();
        long exp = payload.path("exp").asLong(0);
        if (exp <= 0 || now >= exp) throw new InvalidJwtException("token expired");

        String sub = payload.path("sub").asText("");
        UUID userId;
        try {
            userId = UUID.fromString(sub);
        } catch (IllegalArgumentException e) {
            throw new InvalidJwtException("sub is not a UUID");
        }

        String email = payload.path("email").asText(null);
        boolean emailConfirmed = payload.path("email_confirmed_at").asText("").length() > 0
                              || payload.path("user_metadata").path("email_verified").asBoolean(false);

        return new Claims(userId, email, emailConfirmed);
    }

    // ---------------- HS256 ----------------

    private void verifyHs256(byte[] signingInput, byte[] provided) throws InvalidJwtException {
        if (legacySecret == null) throw new InvalidJwtException("HS256 token but no legacy secret configured");
        byte[] expected;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(legacySecret, "HmacSHA256"));
            expected = mac.doFinal(signingInput);
        } catch (Exception e) {
            throw new InvalidJwtException("hmac error: " + e.getMessage());
        }
        if (!MessageDigest.isEqual(expected, provided)) {
            throw new InvalidJwtException("signature mismatch");
        }
    }

    // ---------------- ES256 ----------------

    private void verifyEs256(String kid, byte[] signingInput, byte[] rawSig) throws InvalidJwtException {
        if (jwksUrl == null) throw new InvalidJwtException("ES256 token but no JWKS configured");
        if (rawSig.length != 64) throw new InvalidJwtException("ES256 signature must be 64 bytes, got " + rawSig.length);

        PublicKey key = resolveKey(kid);
        try {
            Signature sig = Signature.getInstance("SHA256withECDSA");
            sig.initVerify(key);
            sig.update(signingInput);
            if (!sig.verify(rawToDer(rawSig))) {
                throw new InvalidJwtException("signature mismatch");
            }
        } catch (InvalidJwtException e) {
            throw e;
        } catch (Exception e) {
            throw new InvalidJwtException("ecdsa error: " + e.getMessage());
        }
    }

    private PublicKey resolveKey(String kid) throws InvalidJwtException {
        if (kid == null) throw new InvalidJwtException("ES256 token missing kid");
        PublicKey k = keyCache.get(kid);
        if (k != null) return k;
        refreshJwks();
        k = keyCache.get(kid);
        if (k == null) throw new InvalidJwtException("no JWKS key for kid " + kid);
        return k;
    }

    private synchronized void refreshJwks() throws InvalidJwtException {
        try {
            HttpResponse<String> resp = http.send(
                HttpRequest.newBuilder(URI.create(jwksUrl))
                        .timeout(Duration.ofSeconds(5))
                        .GET()
                        .build(),
                HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() / 100 != 2) {
                throw new InvalidJwtException("JWKS fetch failed: HTTP " + resp.statusCode());
            }
            JsonNode keys = M.readTree(resp.body()).path("keys");
            if (!keys.isArray()) throw new InvalidJwtException("JWKS response has no keys");
            Map<String, PublicKey> fresh = new HashMap<>();
            for (JsonNode key : keys) {
                String kty = key.path("kty").asText("");
                String alg = key.path("alg").asText("");
                String kid = key.path("kid").asText(null);
                if (kid == null || !"EC".equals(kty) || !"ES256".equals(alg)) continue;
                fresh.put(kid, parseEcKey(key));
            }
            keyCache.clear();
            keyCache.putAll(fresh);
            LOG.infof("loaded %d JWKS key(s)", fresh.size());
        } catch (InvalidJwtException e) {
            throw e;
        } catch (Exception e) {
            throw new InvalidJwtException("JWKS fetch failed: " + e.getMessage());
        }
    }

    /** Build an ECPublicKey for P-256 from JWK {x, y} (base64url unsigned big-endian). */
    private static PublicKey parseEcKey(JsonNode jwk) throws Exception {
        byte[] xBytes = URL_DECODER.decode(jwk.path("x").asText(""));
        byte[] yBytes = URL_DECODER.decode(jwk.path("y").asText(""));
        ECPoint point = new ECPoint(new BigInteger(1, xBytes), new BigInteger(1, yBytes));

        // P-256 parameters: derived once via AlgorithmParameters("EC")
        var params = java.security.AlgorithmParameters.getInstance("EC");
        params.init(new java.security.spec.ECGenParameterSpec("secp256r1"));
        var ecSpec = params.getParameterSpec(java.security.spec.ECParameterSpec.class);

        return KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(point, ecSpec));
    }

    /**
     * JWT ES256 signatures are raw R||S (64 bytes). Java's Signature.verify wants DER:
     *   SEQUENCE { INTEGER r, INTEGER s }
     * with each INTEGER stripped of leading zeros and re-prefixed with 0x00 if the
     * high bit would otherwise make it look negative.
     */
    private static byte[] rawToDer(byte[] raw) {
        byte[] r = trim(java.util.Arrays.copyOfRange(raw, 0, 32));
        byte[] s = trim(java.util.Arrays.copyOfRange(raw, 32, 64));
        int len = 2 + r.length + 2 + s.length;
        byte[] out = new byte[2 + len];
        int p = 0;
        out[p++] = 0x30;
        out[p++] = (byte) len;
        out[p++] = 0x02;
        out[p++] = (byte) r.length;
        System.arraycopy(r, 0, out, p, r.length); p += r.length;
        out[p++] = 0x02;
        out[p++] = (byte) s.length;
        System.arraycopy(s, 0, out, p, s.length);
        return out;
    }

    private static byte[] trim(byte[] in) {
        int start = 0;
        while (start < in.length - 1 && in[start] == 0) start++;
        boolean needsPad = (in[start] & 0x80) != 0;
        byte[] out = new byte[in.length - start + (needsPad ? 1 : 0)];
        if (needsPad) System.arraycopy(in, start, out, 1, in.length - start);
        else System.arraycopy(in, start, out, 0, in.length - start);
        return out;
    }

    public record Claims(UUID userId, String email, boolean emailConfirmed) {}

    public static final class InvalidJwtException extends Exception {
        public InvalidJwtException(String message) { super(message); }
    }
}
