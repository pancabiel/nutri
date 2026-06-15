package com.nutri.model;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A feed post. {@code snapshot} is a self-contained, denormalized copy of the
 * attached recipe (no produto_id/comida_id of any user) so viewing or saving it
 * never reads the author's private library. {@code refType} is one of
 * {@code produto | comida | marmita | prato} (or null for a plain photo/text post).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record FeedPost(
    UUID id,
    Author author,
    String caption,
    String imageUrl,
    String refType,
    // Plain JSON tree (Maps/Lists/scalars), NOT a Jackson JsonNode: returning a raw
    // JsonNode through RESTEasy serializes fine on the JVM but its concrete node classes
    // (ObjectNode/ArrayNode/…) aren't registered for reflection in the native image, which
    // 500s every snapshot-bearing post in prod. Built via mapper.readValue(raw, Object.class).
    Object snapshot,
    long likeCount,
    boolean liked,
    OffsetDateTime createdAt
) {
    /** Minimal author identity embedded in each post card. */
    public record Author(UUID userId, String username, String displayName, String avatarUrl) {}

    /** Request body for POST /feed/posts. The backend builds {@code snapshot} from refType+refId. */
    public record CreateRequest(String caption, String imageUrl, String refType, UUID refId) {}
}
