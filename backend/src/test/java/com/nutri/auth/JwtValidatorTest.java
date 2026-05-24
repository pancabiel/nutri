package com.nutri.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.math.BigInteger;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Tests {@link JwtValidator} end-to-end with a real ES256 keypair and a tiny
 * embedded HTTP server playing the role of Supabase's JWKS endpoint. No JWT
 * library is used on either side — same hand-rolled crypto path the production
 * code (and native image) takes.
 */
class JwtValidatorTest {

    private static final ObjectMapper M = new ObjectMapper();
    private static final String ISSUER = "https://test.example.com/auth/v1";
    private static final String KID = "test-kid-1";

    private static HttpServer server;
    private static String jwksUrl;
    private static PrivateKey privateKey;
    private static ECPublicKey publicKey;

    @BeforeAll
    static void setUp() throws Exception {
        var gen = KeyPairGenerator.getInstance("EC");
        gen.initialize(new ECGenParameterSpec("secp256r1"));
        var kp = gen.generateKeyPair();
        privateKey = kp.getPrivate();
        publicKey = (ECPublicKey) kp.getPublic();

        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/jwks.json", ex -> {
            byte[] body = jwksJson(publicKey, KID).getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(200, body.length);
            try (var os = ex.getResponseBody()) { os.write(body); }
        });
        server.start();
        jwksUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/jwks.json";
    }

    @AfterAll
    static void tearDown() {
        if (server != null) server.stop(0);
    }

    @Test
    void happyPath_returnsClaims() throws Exception {
        var sub = UUID.randomUUID();
        var token = signToken(KID, claims(sub, ISSUER, Instant.now().plusSeconds(60)));
        var validator = new JwtValidator(jwksUrl, ISSUER, null);

        var c = validator.validate(token);

        assertEquals(sub, c.userId());
    }

    @Test
    void expiredToken_throws() throws Exception {
        var token = signToken(KID, claims(UUID.randomUUID(), ISSUER, Instant.now().minusSeconds(60)));
        var validator = new JwtValidator(jwksUrl, ISSUER, null);

        var ex = assertThrows(JwtValidator.InvalidJwtException.class, () -> validator.validate(token));
        assertEquals("token expired", ex.getMessage());
    }

    @Test
    void wrongIssuer_throws() throws Exception {
        var token = signToken(KID,
            claims(UUID.randomUUID(), "https://attacker.example.com/auth/v1", Instant.now().plusSeconds(60)));
        var validator = new JwtValidator(jwksUrl, ISSUER, null);

        var ex = assertThrows(JwtValidator.InvalidJwtException.class, () -> validator.validate(token));
        assertNotNull(ex.getMessage());
        org.junit.jupiter.api.Assertions.assertTrue(ex.getMessage().startsWith("bad issuer"));
    }

    @Test
    void malformedSignature_throws() throws Exception {
        var token = signToken(KID, claims(UUID.randomUUID(), ISSUER, Instant.now().plusSeconds(60)));
        // Decode the signature, flip a high-entropy middle byte (not the last one — the
        // last base64 char carries only a few useful bits and the flipped value can still
        // happen to verify ~1 in N runs, making the test flaky), re-encode.
        int lastDot = token.lastIndexOf('.');
        byte[] sig = Base64.getUrlDecoder().decode(token.substring(lastDot + 1));
        sig[sig.length / 2] ^= (byte) 0xFF;
        var tampered = token.substring(0, lastDot + 1) + Base64.getUrlEncoder().withoutPadding().encodeToString(sig);
        var validator = new JwtValidator(jwksUrl, ISSUER, null);

        assertThrows(JwtValidator.InvalidJwtException.class, () -> validator.validate(tampered));
    }

    @Test
    void unknownKid_throws() throws Exception {
        var token = signToken("kid-that-does-not-exist",
            claims(UUID.randomUUID(), ISSUER, Instant.now().plusSeconds(60)));
        var validator = new JwtValidator(jwksUrl, ISSUER, null);

        var ex = assertThrows(JwtValidator.InvalidJwtException.class, () -> validator.validate(token));
        org.junit.jupiter.api.Assertions.assertTrue(ex.getMessage().startsWith("no JWKS key for kid"));
    }

    @Test
    void missingKid_throws() throws Exception {
        // Build a header with no kid field.
        var header = new LinkedHashMap<String, Object>();
        header.put("alg", "ES256");
        header.put("typ", "JWT");
        var payload = claims(UUID.randomUUID(), ISSUER, Instant.now().plusSeconds(60));
        var token = signWithExplicitHeader(header, payload);
        var validator = new JwtValidator(jwksUrl, ISSUER, null);

        var ex = assertThrows(JwtValidator.InvalidJwtException.class, () -> validator.validate(token));
        assertEquals("ES256 token missing kid", ex.getMessage());
    }

    @Test
    void subNotUuid_throws() throws Exception {
        var payload = new LinkedHashMap<String, Object>();
        payload.put("iss", ISSUER);
        payload.put("sub", "not-a-uuid");
        payload.put("exp", Instant.now().plusSeconds(60).getEpochSecond());
        var token = signToken(KID, payload);
        var validator = new JwtValidator(jwksUrl, ISSUER, null);

        var ex = assertThrows(JwtValidator.InvalidJwtException.class, () -> validator.validate(token));
        assertEquals("sub is not a UUID", ex.getMessage());
    }

    // -------- helpers --------

    private static Map<String, Object> claims(UUID sub, String iss, Instant exp) {
        var p = new LinkedHashMap<String, Object>();
        p.put("iss", iss);
        p.put("sub", sub.toString());
        p.put("exp", exp.getEpochSecond());
        return p;
    }

    private static String signToken(String kid, Map<String, Object> payload) throws Exception {
        var header = new LinkedHashMap<String, Object>();
        header.put("alg", "ES256");
        header.put("typ", "JWT");
        header.put("kid", kid);
        return signWithExplicitHeader(header, payload);
    }

    private static String signWithExplicitHeader(Map<String, Object> header, Map<String, Object> payload) throws Exception {
        var enc = Base64.getUrlEncoder().withoutPadding();
        String headerB64 = enc.encodeToString(M.writeValueAsBytes(header));
        String payloadB64 = enc.encodeToString(M.writeValueAsBytes(payload));
        byte[] signingInput = (headerB64 + "." + payloadB64).getBytes(StandardCharsets.UTF_8);

        Signature sig = Signature.getInstance("SHA256withECDSA");
        sig.initSign(privateKey);
        sig.update(signingInput);
        byte[] der = sig.sign();
        byte[] raw = derToRaw(der);
        return headerB64 + "." + payloadB64 + "." + enc.encodeToString(raw);
    }

    /** Inverse of JwtValidator.rawToDer — turn a DER ECDSA signature into raw R||S (64 bytes). */
    private static byte[] derToRaw(byte[] der) {
        int p = 0;
        if (der[p++] != 0x30) throw new IllegalStateException("bad DER");
        int len = der[p++] & 0xff;
        if ((len & 0x80) != 0) throw new IllegalStateException("long-form DER not supported in test");
        if (der[p++] != 0x02) throw new IllegalStateException("bad DER r");
        int rLen = der[p++] & 0xff;
        byte[] r = java.util.Arrays.copyOfRange(der, p, p + rLen);
        p += rLen;
        if (der[p++] != 0x02) throw new IllegalStateException("bad DER s");
        int sLen = der[p++] & 0xff;
        byte[] s = java.util.Arrays.copyOfRange(der, p, p + sLen);

        byte[] out = new byte[64];
        copyRight(r, out, 0, 32);
        copyRight(s, out, 32, 32);
        return out;
    }

    private static void copyRight(byte[] src, byte[] dst, int dstStart, int width) {
        // Strip a possible 0x00 sign byte, then right-align into a 32-byte slot.
        int srcStart = 0;
        if (src.length > width && src[0] == 0) srcStart = 1;
        int payloadLen = src.length - srcStart;
        System.arraycopy(src, srcStart, dst, dstStart + (width - payloadLen), payloadLen);
    }

    private static String jwksJson(ECPublicKey key, String kid) {
        var w = key.getW();
        var enc = Base64.getUrlEncoder().withoutPadding();
        String x = enc.encodeToString(unsigned32(w.getAffineX()));
        String y = enc.encodeToString(unsigned32(w.getAffineY()));
        var jwk = new LinkedHashMap<String, Object>();
        jwk.put("kty", "EC");
        jwk.put("alg", "ES256");
        jwk.put("crv", "P-256");
        jwk.put("kid", kid);
        jwk.put("use", "sig");
        jwk.put("x", x);
        jwk.put("y", y);
        try { return M.writeValueAsString(Map.of("keys", List.of(jwk))); }
        catch (Exception e) { throw new RuntimeException(e); }
    }

    /** Encode a BigInteger as an unsigned 32-byte big-endian array (P-256 coordinates). */
    private static byte[] unsigned32(BigInteger v) {
        byte[] bytes = v.toByteArray();
        if (bytes.length == 32) return bytes;
        if (bytes.length == 33 && bytes[0] == 0) return java.util.Arrays.copyOfRange(bytes, 1, 33);
        byte[] out = new byte[32];
        System.arraycopy(bytes, 0, out, 32 - bytes.length, bytes.length);
        return out;
    }
}
