package com.nutri.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;

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
    JsonNode snapshot,
    long likeCount,
    boolean liked,
    OffsetDateTime createdAt
) {
    /** Minimal author identity embedded in each post card. */
    public record Author(UUID userId, String username, String displayName, String avatarUrl) {}

    /** Request body for POST /feed/posts. The backend builds {@code snapshot} from refType+refId. */
    public record CreateRequest(String caption, String imageUrl, String refType, UUID refId) {}
}
