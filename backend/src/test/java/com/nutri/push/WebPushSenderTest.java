package com.nutri.push;

import org.junit.jupiter.api.Test;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPrivateKeySpec;
import java.util.Arrays;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Web Push crypto is where a silent bug means "the notification never arrives",
 * so it gets focused tests. Two angles:
 *
 * <ol>
 *   <li><b>Round-trip</b>: encrypt with {@link WebPushSender#encryptPayload} for a
 *       freshly generated "user agent" key pair, then decrypt from the receiver's
 *       side following RFC 8291/8188 independently, and assert the plaintext comes
 *       back. This exercises ECDH agreement, HKDF, and AES-GCM end to end.</li>
 *   <li><b>Wire framing</b>: the aes128gcm header (salt, record size, keyid length,
 *       embedded server public key) matches RFC 8188 §2.1 byte-for-byte.</li>
 * </ol>
 *
 * The DER→raw ECDSA conversion ({@link WebPushSender#derToRaw}) is checked against a
 * real ECDSA signature.
 */
class WebPushSenderTest {

    private static final Base64.Decoder B64D = Base64.getUrlDecoder();

    @Test
    void roundTripDecryptsToOriginalPlaintext() throws Exception {
        var p256 = WebPushSender.p256Params();

        // The "subscription": a UA key pair + a 16-byte auth secret.
        KeyPair ua = WebPushSender.generateEphemeral();
        byte[] uaPublic = WebPushSender.rawPoint((ECPublicKey) ua.getPublic());
        byte[] authSecret = new byte[16];
        new java.security.SecureRandom().nextBytes(authSecret);

        byte[] plaintext = "When I grow up, I want to be a watermelon"
                .getBytes(StandardCharsets.UTF_8);

        KeyPair ephemeral = WebPushSender.generateEphemeral();
        byte[] salt = new byte[16];
        new java.security.SecureRandom().nextBytes(salt);

        byte[] body = WebPushSender.encryptPayload(uaPublic, authSecret, plaintext, salt, ephemeral);

        byte[] decrypted = decryptAsReceiver(body, ua, uaPublic, authSecret);
        assertArrayEquals(plaintext, decrypted, "decrypted plaintext must match the original");
    }

    @Test
    void wireFramingMatchesRfc8188() throws Exception {
        KeyPair ua = WebPushSender.generateEphemeral();
        byte[] uaPublic = WebPushSender.rawPoint((ECPublicKey) ua.getPublic());
        byte[] authSecret = new byte[16];

        KeyPair ephemeral = WebPushSender.generateEphemeral();
        byte[] asPublic = WebPushSender.rawPoint((ECPublicKey) ephemeral.getPublic());
        byte[] salt = new byte[16];
        Arrays.fill(salt, (byte) 7);

        byte[] body = WebPushSender.encryptPayload(uaPublic, authSecret, "x".getBytes(), salt, ephemeral);

        // salt(16) || rs(4) || idlen(1) || keyid(65) || ciphertext
        assertArrayEquals(salt, Arrays.copyOfRange(body, 0, 16), "first 16 bytes are the salt");
        // record size = 4096 big-endian
        assertArrayEquals(new byte[]{0x00, 0x00, 0x10, 0x00}, Arrays.copyOfRange(body, 16, 20));
        assertEquals(65, body[20] & 0xff, "idlen must be 65 (uncompressed P-256 point)");
        assertArrayEquals(asPublic, Arrays.copyOfRange(body, 21, 86), "keyid is the server ephemeral public key");
        assertTrue(body.length > 86, "ciphertext must follow the header");
    }

    @Test
    void derToRawProducesA64ByteSignature() throws Exception {
        var p256 = WebPushSender.p256Params();
        // Deterministic private scalar just to get a key to sign with.
        BigInteger d = new BigInteger(1, B64D.decode("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"));
        var priv = KeyFactory.getInstance("EC").generatePrivate(new ECPrivateKeySpec(d, p256));

        Signature sig = Signature.getInstance("SHA256withECDSA");
        sig.initSign(priv);
        sig.update("header.payload".getBytes(StandardCharsets.UTF_8));
        byte[] der = sig.sign();

        byte[] raw = WebPushSender.derToRaw(der);
        assertEquals(64, raw.length, "JOSE ES256 signature is exactly 64 bytes (R||S)");
    }

    @Test
    void originOfStripsPath() {
        assertEquals("https://web.push.apple.com",
                WebPushSender.originOf("https://web.push.apple.com/abc/def?token=1"));
        assertEquals("https://fcm.googleapis.com",
                WebPushSender.originOf("https://fcm.googleapis.com/fcm/send/xyz"));
    }

    // ---- receiver-side decryption (independent RFC 8291/8188 implementation) ----

    private static byte[] decryptAsReceiver(byte[] body, KeyPair ua, byte[] uaPublic, byte[] authSecret) throws Exception {
        var p256 = WebPushSender.p256Params();
        byte[] salt = Arrays.copyOfRange(body, 0, 16);
        int idlen = body[20] & 0xff;
        byte[] asPublic = Arrays.copyOfRange(body, 21, 21 + idlen);
        byte[] ciphertext = Arrays.copyOfRange(body, 21 + idlen, body.length);

        // ECDH from the receiver side: ua_private · as_public — must equal the sender's secret.
        KeyAgreement ka = KeyAgreement.getInstance("ECDH");
        ka.init(ua.getPrivate());
        ka.doPhase(WebPushSender.pubKeyFromRaw(asPublic, p256), true);
        byte[] ecdhSecret = ka.generateSecret();

        byte[] prkCombine = WebPushSender.hkdfExtract(authSecret, ecdhSecret);
        byte[] keyInfo = concat("WebPush: info\0".getBytes(StandardCharsets.UTF_8), uaPublic, asPublic);
        byte[] ikm = WebPushSender.hkdfExpand(prkCombine, keyInfo, 32);

        byte[] prk = WebPushSender.hkdfExtract(salt, ikm);
        byte[] cek = WebPushSender.hkdfExpand(prk, "Content-Encoding: aes128gcm\0".getBytes(StandardCharsets.UTF_8), 16);
        byte[] nonce = WebPushSender.hkdfExpand(prk, "Content-Encoding: nonce\0".getBytes(StandardCharsets.UTF_8), 12);

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(cek, "AES"), new GCMParameterSpec(128, nonce));
        byte[] padded = cipher.doFinal(ciphertext);

        // strip the trailing 0x02 single-record delimiter
        int end = padded.length;
        while (end > 0 && padded[end - 1] == 0x00) end--;   // defensive: any 0x00 padding
        assertEquals(0x02, padded[end - 1], "last record delimiter must be 0x02");
        return Arrays.copyOfRange(padded, 0, end - 1);
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
