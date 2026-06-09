package com.nutri.push;

import com.nutri.model.PushSubscription;
import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPrivateKeySpec;
import java.security.spec.ECPublicKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.Optional;

/**
 * Sends a single encrypted Web Push message. Hand-rolled crypto (no web-push SDK,
 * no BouncyCastle) so it stays native-image friendly, in the same spirit as
 * {@link com.nutri.auth.JwtValidator} (EC P-256 + ECDSA) and
 * {@link com.nutri.billing.StripeClient} (HMAC + raw HTTP). Implements:
 *
 * <ul>
 *   <li>RFC 8292 — VAPID: an ES256 JWT in the {@code Authorization: vapid t=…,k=…} header.</li>
 *   <li>RFC 8291 — Message Encryption for Web Push: ECDH + HKDF to derive the input keying material.</li>
 *   <li>RFC 8188 — {@code aes128gcm} content encoding: the wire framing the push service relays verbatim.</li>
 * </ul>
 *
 * {@link #isConfigured()} mirrors {@code StripeClient}: empty VAPID keys disable
 * sending. Errors degrade (logged, never thrown out of {@link #send}) so one dead
 * subscription can't break a cron batch — same posture as the metering in AiService.
 */
@ApplicationScoped
public class WebPushSender {

    private static final Logger LOG = Logger.getLogger(WebPushSender.class);
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64D = Base64.getUrlDecoder();
    // NB: SecureRandom is created on demand inside the (runtime-only) call paths below,
    // never in a static/instance initializer. A SecureRandom captured into a static field
    // gets baked into the GraalVM image heap at build time (cached seed) and the native
    // build fails outright — so keep randomness construction lazy and local.

    /** Record size advertised in the aes128gcm header; our payloads are a single record well under this. */
    private static final int RECORD_SIZE = 4096;
    /** Reminders are time-sensitive — a short TTL avoids a stale "lunch time" push landing tomorrow. */
    private static final int TTL_SECONDS = 3600;
    /** VAPID JWT lifetime. RFC 8292 caps this at 24h; 12h is the common choice. */
    private static final Duration VAPID_JWT_TTL = Duration.ofHours(12);

    @ConfigProperty(name = "webpush.vapid.public-key")  Optional<String> vapidPublicB64;
    @ConfigProperty(name = "webpush.vapid.private-key") Optional<String> vapidPrivateB64;
    @ConfigProperty(name = "webpush.vapid.subject")     Optional<String> vapidSubject;

    private HttpClient http;
    private ECParameterSpec p256;
    private PrivateKey vapidPrivate;
    private byte[] vapidPublicRaw;   // 65-byte uncompressed point, for the `k=` header
    private String vapidPublicB64Url;
    private boolean configured;

    public enum SendResult { OK, GONE, ERROR }

    @PostConstruct
    void init() {
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
        try {
            this.p256 = p256Params();
        } catch (Exception e) {
            LOG.error("failed to init P-256 params", e);
            return;
        }
        String pub = vapidPublicB64.filter(s -> !s.isBlank()).orElse(null);
        String priv = vapidPrivateB64.filter(s -> !s.isBlank()).orElse(null);
        if (pub == null || priv == null) {
            LOG.info("webpush VAPID keys not configured — push sending disabled");
            return;
        }
        try {
            this.vapidPublicRaw = B64D.decode(pub);
            this.vapidPublicB64Url = pub;
            BigInteger d = new BigInteger(1, B64D.decode(priv));
            this.vapidPrivate = KeyFactory.getInstance("EC")
                    .generatePrivate(new ECPrivateKeySpec(d, p256));
            this.configured = true;
        } catch (Exception e) {
            LOG.error("failed to load VAPID keys — push sending disabled", e);
        }
    }

    public boolean isConfigured() {
        return configured;
    }

    /**
     * Encrypts {@code jsonPayload} for {@code sub} and POSTs it to the push service.
     * Never throws — returns a {@link SendResult} so the caller can prune dead
     * subscriptions (GONE) and keep iterating on transient errors.
     */
    public SendResult send(PushSubscription sub, String jsonPayload) {
        if (!configured) return SendResult.ERROR;
        try {
            byte[] uaPublic = B64D.decode(sub.p256dh());
            byte[] authSecret = B64D.decode(sub.auth());
            byte[] plaintext = jsonPayload.getBytes(StandardCharsets.UTF_8);

            KeyPair ephemeral = generateEphemeral();
            byte[] salt = new byte[16];
            new SecureRandom().nextBytes(salt);
            byte[] body = encryptPayload(uaPublic, authSecret, plaintext, salt, ephemeral);

            String vapidJwt = buildVapidJwt(originOf(sub.endpoint()));

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(sub.endpoint()))
                    .timeout(Duration.ofSeconds(10))
                    .header("TTL", String.valueOf(TTL_SECONDS))
                    .header("Content-Encoding", "aes128gcm")
                    .header("Content-Type", "application/octet-stream")
                    .header("Urgency", "normal")
                    .header("Authorization", "vapid t=" + vapidJwt + ",k=" + vapidPublicB64Url)
                    .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                    .build();

            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            int code = res.statusCode();
            if (code == 200 || code == 201 || code == 202) return SendResult.OK;
            if (code == 404 || code == 410) {
                LOG.debugf("push subscription gone (HTTP %d): %s", code, sub.endpoint());
                return SendResult.GONE;
            }
            LOG.warnf("push send failed HTTP %d: %s", code, res.body());
            return SendResult.ERROR;
        } catch (Exception e) {
            LOG.warnf("push send error for %s: %s", sub.endpoint(), e.getMessage());
            return SendResult.ERROR;
        }
    }

    // ---------------- VAPID (RFC 8292) ----------------

    private String buildVapidJwt(String audience) throws Exception {
        String subject = vapidSubject.filter(s -> !s.isBlank()).orElse("mailto:admin@nutri.app");
        long exp = Instant.now().plus(VAPID_JWT_TTL).getEpochSecond();
        String header = B64.encodeToString("{\"typ\":\"JWT\",\"alg\":\"ES256\"}".getBytes(StandardCharsets.UTF_8));
        String claims = B64.encodeToString(("{\"aud\":\"" + audience + "\",\"exp\":" + exp
                + ",\"sub\":\"" + subject + "\"}").getBytes(StandardCharsets.UTF_8));
        String signingInput = header + "." + claims;

        Signature sig = Signature.getInstance("SHA256withECDSA");
        sig.initSign(vapidPrivate);
        sig.update(signingInput.getBytes(StandardCharsets.UTF_8));
        byte[] der = sig.sign();
        byte[] raw = derToRaw(der);
        return signingInput + "." + B64.encodeToString(raw);
    }

    /** {@code scheme://host[:port]} of the endpoint — the VAPID {@code aud} claim. */
    static String originOf(String endpoint) {
        URI u = URI.create(endpoint);
        StringBuilder sb = new StringBuilder().append(u.getScheme()).append("://").append(u.getHost());
        if (u.getPort() != -1) sb.append(':').append(u.getPort());
        return sb.toString();
    }

    // ---------------- Payload encryption (RFC 8291 + RFC 8188) ----------------

    /**
     * Produces the {@code aes128gcm} request body for a single record. Package-private
     * and parameterized on {@code salt} + {@code ephemeral} so tests can pin them.
     *
     * Wire format (RFC 8188 §2.1, single record):
     * {@code salt(16) || rs(uint32) || idlen(1) || keyid(as_public 65) || ciphertext}.
     */
    static byte[] encryptPayload(byte[] uaPublic, byte[] authSecret, byte[] plaintext,
                                 byte[] salt, KeyPair ephemeral) throws Exception {
        ECParameterSpec p256 = p256Params();
        byte[] asPublic = rawPoint((ECPublicKey) ephemeral.getPublic());

        // ECDH(as_private, ua_public) → shared secret
        KeyAgreement ka = KeyAgreement.getInstance("ECDH");
        ka.init(ephemeral.getPrivate());
        ka.doPhase(pubKeyFromRaw(uaPublic, p256), true);
        byte[] ecdhSecret = ka.generateSecret();

        // RFC 8291 §3.4: combine the ECDH secret with the auth secret to get the IKM.
        byte[] prkCombine = hkdfExtract(authSecret, ecdhSecret);
        byte[] keyInfo = concat(
                "WebPush: info\0".getBytes(StandardCharsets.UTF_8),
                uaPublic, asPublic);
        byte[] ikm = hkdfExpand(prkCombine, keyInfo, 32);

        // RFC 8188 §2.2: derive CEK + nonce from the random salt.
        byte[] prk = hkdfExtract(salt, ikm);
        byte[] cek = hkdfExpand(prk, "Content-Encoding: aes128gcm\0".getBytes(StandardCharsets.UTF_8), 16);
        byte[] nonce = hkdfExpand(prk, "Content-Encoding: nonce\0".getBytes(StandardCharsets.UTF_8), 12);

        // Single record: plaintext followed by the 0x02 last-record delimiter.
        byte[] padded = concat(plaintext, new byte[]{0x02});
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(cek, "AES"), new GCMParameterSpec(128, nonce));
        byte[] ciphertext = cipher.doFinal(padded);

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(salt);
        out.write(uint32(RECORD_SIZE));
        out.write(asPublic.length & 0xff);   // idlen = 65
        out.write(asPublic);
        out.write(ciphertext);
        return out.toByteArray();
    }

    // ---------------- HKDF (RFC 5869, HMAC-SHA256) ----------------

    static byte[] hkdfExtract(byte[] salt, byte[] ikm) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        byte[] key = (salt == null || salt.length == 0) ? new byte[32] : salt;
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(ikm);
    }

    static byte[] hkdfExpand(byte[] prk, byte[] info, int length) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(prk, "HmacSHA256"));
        byte[] out = new byte[length];
        byte[] t = new byte[0];
        int pos = 0;
        byte counter = 1;
        while (pos < length) {
            mac.reset();
            mac.update(t);
            mac.update(info);
            mac.update(counter);
            t = mac.doFinal();
            int n = Math.min(t.length, length - pos);
            System.arraycopy(t, 0, out, pos, n);
            pos += n;
            counter++;
        }
        return out;
    }

    // ---------------- EC helpers ----------------

    static ECParameterSpec p256Params() throws Exception {
        AlgorithmParameters params = AlgorithmParameters.getInstance("EC");
        params.init(new ECGenParameterSpec("secp256r1"));
        return params.getParameterSpec(ECParameterSpec.class);
    }

    static KeyPair generateEphemeral() throws Exception {
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("EC");
        kpg.initialize(new ECGenParameterSpec("secp256r1"), new SecureRandom());
        return kpg.generateKeyPair();
    }

    /** Serialize an EC public key to a 65-byte uncompressed point {@code 0x04 || X(32) || Y(32)}. */
    static byte[] rawPoint(ECPublicKey key) {
        ECPoint w = key.getW();
        byte[] x = toFixed(w.getAffineX(), 32);
        byte[] y = toFixed(w.getAffineY(), 32);
        byte[] out = new byte[65];
        out[0] = 0x04;
        System.arraycopy(x, 0, out, 1, 32);
        System.arraycopy(y, 0, out, 33, 32);
        return out;
    }

    static ECPublicKey pubKeyFromRaw(byte[] raw, ECParameterSpec p256) throws Exception {
        if (raw.length != 65 || raw[0] != 0x04) {
            throw new IllegalArgumentException("expected 65-byte uncompressed EC point");
        }
        BigInteger x = new BigInteger(1, Arrays.copyOfRange(raw, 1, 33));
        BigInteger y = new BigInteger(1, Arrays.copyOfRange(raw, 33, 65));
        return (ECPublicKey) KeyFactory.getInstance("EC")
                .generatePublic(new ECPublicKeySpec(new ECPoint(x, y), p256));
    }

    /** Left-pad / trim a positive BigInteger to exactly {@code len} bytes. */
    static byte[] toFixed(BigInteger v, int len) {
        byte[] b = v.toByteArray();
        if (b.length == len) return b;
        byte[] out = new byte[len];
        if (b.length > len) {
            System.arraycopy(b, b.length - len, out, 0, len);   // drop leading sign byte
        } else {
            System.arraycopy(b, 0, out, len - b.length, b.length);
        }
        return out;
    }

    /**
     * Convert an ECDSA DER signature {@code SEQUENCE { INTEGER r, INTEGER s }} to the
     * fixed 64-byte {@code R||S} JOSE form. Inverse of {@code JwtValidator.rawToDer}.
     */
    static byte[] derToRaw(byte[] der) {
        int p = 0;
        if (der[p++] != 0x30) throw new IllegalArgumentException("bad DER: no SEQUENCE");
        int seqLen = der[p++] & 0xff;
        if ((seqLen & 0x80) != 0) {                  // long-form length (unusual for P-256)
            int n = seqLen & 0x7f;
            seqLen = 0;
            for (int i = 0; i < n; i++) seqLen = (seqLen << 8) | (der[p++] & 0xff);
        }
        if (der[p++] != 0x02) throw new IllegalArgumentException("bad DER: no INTEGER r");
        int rLen = der[p++] & 0xff;
        byte[] r = Arrays.copyOfRange(der, p, p + rLen);
        p += rLen;
        if (der[p++] != 0x02) throw new IllegalArgumentException("bad DER: no INTEGER s");
        int sLen = der[p++] & 0xff;
        byte[] s = Arrays.copyOfRange(der, p, p + sLen);

        byte[] out = new byte[64];
        System.arraycopy(toFixed(new BigInteger(1, r), 32), 0, out, 0, 32);
        System.arraycopy(toFixed(new BigInteger(1, s), 32), 0, out, 32, 32);
        return out;
    }

    private static byte[] uint32(int v) {
        return new byte[]{(byte) (v >>> 24), (byte) (v >>> 16), (byte) (v >>> 8), (byte) v};
    }

    private static byte[] concat(byte[]... parts) {
        int len = 0;
        for (byte[] p : parts) len += p.length;
        byte[] out = new byte[len];
        int pos = 0;
        for (byte[] p : parts) { System.arraycopy(p, 0, out, pos, p.length); pos += p.length; }
        return out;
    }
}
