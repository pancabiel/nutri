package com.nutri.model;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.UUID;

/**
 * Public social view of a user — the ONLY profile shape that ever crosses tenants.
 * Selected explicitly in the backend (never via a permissive RLS policy) so the
 * private/LGPD columns of {@code profiles} (is_pro, stripe ids, weight, etc.) are
 * never exposed. {@code isFollowing} / {@code isSelf} are relative to the viewer.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record SocialProfile(
    UUID userId,
    String username,
    String displayName,
    String avatarUrl,
    String bio,
    long followers,
    long following,
    boolean isFollowing,
    boolean isSelf
) {}
