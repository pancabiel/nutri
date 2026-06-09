package com.nutri.model;

import java.util.UUID;

/**
 * A browser Push API subscription for one installed device. {@code p256dh} and
 * {@code auth} are the per-subscription keys (base64url) the server needs to
 * encrypt the push payload (RFC 8291). {@code endpoint} is the push service URL
 * we POST the encrypted body to.
 */
public record PushSubscription(
        UUID id,
        UUID userId,
        String endpoint,
        String p256dh,
        String auth,
        String userAgent) {

    /** Inbound body for {@code POST /push/subscribe}. */
    public record SubscribeRequest(
            String endpoint,
            String p256dh,
            String auth,
            String userAgent) {}

    /** Inbound body for {@code POST /push/unsubscribe}. */
    public record UnsubscribeRequest(String endpoint) {}
}
