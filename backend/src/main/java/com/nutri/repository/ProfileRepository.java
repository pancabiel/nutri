package com.nutri.repository;

import com.nutri.model.Profile;
import com.nutri.model.SocialProfile;
import io.agroal.api.AgroalDataSource;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@ApplicationScoped
public class ProfileRepository {

    @Inject AgroalDataSource ds;

    /** Returns the profile, creating an empty row if it doesn't exist yet. */
    public Profile getOrCreate(UUID userId) {
        var existing = byId(userId);
        if (existing.isPresent()) return existing.get();
        try (var c = ds.getConnection();
             var s = c.prepareStatement("insert into profiles (user_id) values (?) on conflict do nothing")) {
            s.setObject(1, userId);
            s.executeUpdate();
        } catch (SQLException e) { throw new RuntimeException(e); }
        return byId(userId).orElseThrow();
    }

    public Optional<Profile> byId(UUID userId) {
        try (var c = ds.getConnection();
             var s = c.prepareStatement("select * from profiles where user_id = ?")) {
            s.setObject(1, userId);
            try (var rs = s.executeQuery()) {
                return rs.next() ? Optional.of(map(rs)) : Optional.empty();
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /** Updates the onboarding-related fields. Other fields (subscription state) are managed elsewhere. */
    public Profile updateOnboarding(UUID userId, OnboardingUpdate u) {
        getOrCreate(userId);
        var sql = """
            update profiles
               set weight_kg            = coalesce(?, weight_kg),
                   target_weight_kg     = coalesce(?, target_weight_kg),
                   height_cm            = coalesce(?, height_cm),
                   birth_year           = coalesce(?, birth_year),
                   sex                  = coalesce(?, sex),
                   activity_multiplier  = coalesce(?, activity_multiplier),
                   calorie_goal         = coalesce(?, calorie_goal),
                   protein_goal         = coalesce(?, protein_goal),
                   onboarding_complete  = ?
             where user_id = ?
            returning *""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            setNullableDouble(s, 1, u.weightKg());
            setNullableDouble(s, 2, u.targetWeightKg());
            setNullableDouble(s, 3, u.heightCm());
            if (u.birthYear() == null) s.setNull(4, Types.INTEGER); else s.setInt(4, u.birthYear());
            s.setString(5, u.sex());
            setNullableDouble(s, 6, u.activityMultiplier());
            if (u.calorieGoal() == null) s.setNull(7, Types.INTEGER); else s.setInt(7, u.calorieGoal());
            setNullableDouble(s, 8, u.proteinGoal());
            s.setBoolean(9, u.onboardingComplete());
            s.setObject(10, userId);
            try (var rs = s.executeQuery()) {
                rs.next();
                return map(rs);
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /**
     * Sets the user's default meal-section template — the ordered list a brand-new
     * meal day is seeded with ({@link MealRepository#getOrCreate}). A null/empty list
     * stores SQL NULL, which the seeding code reads as "use the canonical four".
     */
    public Profile setDefaultSections(UUID userId, List<String> sections) {
        getOrCreate(userId);
        var clean = sections == null ? List.<String>of()
            : sections.stream().map(s -> s == null ? null : s.trim())
                      .filter(s -> s != null && !s.isEmpty()).toList();
        try (var c = ds.getConnection();
             var s = c.prepareStatement(
                 "update profiles set default_sections = ? where user_id = ? returning *")) {
            s.setArray(1, clean.isEmpty() ? null : c.createArrayOf("text", clean.toArray()));
            s.setObject(2, userId);
            try (var rs = s.executeQuery()) {
                rs.next();
                return map(rs);
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /**
     * Persists the Stripe customer id for a user right after creating it (before
     * Checkout). Only writes when the column is null so we never replace an
     * already-linked customer.
     */
    public void setStripeCustomerId(UUID userId, String customerId) {
        getOrCreate(userId);
        try (var c = ds.getConnection();
             var s = c.prepareStatement(
                 "update profiles set stripe_customer_id = ? where user_id = ? and stripe_customer_id is null")) {
            s.setString(1, customerId);
            s.setObject(2, userId);
            s.executeUpdate();
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /** Reads the stored {@code stripe_customer_id}, or empty if the user never started checkout. */
    public Optional<String> stripeCustomerId(UUID userId) {
        try (var c = ds.getConnection();
             var s = c.prepareStatement("select stripe_customer_id from profiles where user_id = ?")) {
            s.setObject(1, userId);
            try (var rs = s.executeQuery()) {
                if (!rs.next()) return Optional.empty();
                String v = rs.getString(1);
                return (v == null || v.isBlank()) ? Optional.empty() : Optional.of(v);
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /** Lookup used by the Stripe webhook to map a {@code customer} id back to our user. */
    public Optional<UUID> byStripeCustomerId(String customerId) {
        try (var c = ds.getConnection();
             var s = c.prepareStatement("select user_id from profiles where stripe_customer_id = ?")) {
            s.setString(1, customerId);
            try (var rs = s.executeQuery()) {
                return rs.next() ? Optional.of((UUID) rs.getObject(1)) : Optional.empty();
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /**
     * Applies the result of a Stripe subscription event. {@code status} maps directly
     * from Stripe ({@code active}, {@code trialing}, {@code past_due}, {@code canceled},
     * {@code unpaid}, ...). is_pro is true while the subscription grants access — i.e.
     * active or trialing.
     *
     * <p>{@code eventCreatedAt} is the event's {@code created} timestamp. Stripe does
     * not guarantee delivery order, so the UPDATE is gated on
     * {@code stripe_event_at is null or stripe_event_at <= ?} to drop stale events
     * (e.g. a late {@code subscription.updated active} arriving after a
     * {@code subscription.deleted}). Returns true if the row was actually updated.
     *
     * <p>Calls {@link #getOrCreate(UUID)} first so a webhook can land even if the
     * {@code profiles_create_on_signup} trigger silently failed (CLAUDE.md describes
     * that trigger as best-effort).
     */
    public boolean applySubscriptionEvent(UUID userId, String stripeCustomerId,
                                          String stripeSubscriptionId, String status,
                                          OffsetDateTime proUntil,
                                          OffsetDateTime eventCreatedAt) {
        getOrCreate(userId);
        boolean isPro = "active".equals(status) || "trialing".equals(status);
        var sql = """
            update profiles
               set is_pro                 = ?,
                   stripe_customer_id     = coalesce(?, stripe_customer_id),
                   stripe_subscription_id = coalesce(?, stripe_subscription_id),
                   subscription_status    = coalesce(?, subscription_status),
                   pro_until              = coalesce(?, pro_until),
                   stripe_event_at        = coalesce(?, stripe_event_at)
             where user_id = ?
               and (stripe_event_at is null or cast(? as timestamptz) is null or stripe_event_at <= cast(? as timestamptz))""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setBoolean(1, isPro);
            s.setString(2, stripeCustomerId);
            s.setString(3, stripeSubscriptionId);
            s.setString(4, status);
            if (proUntil == null) s.setNull(5, Types.TIMESTAMP_WITH_TIMEZONE);
            else s.setTimestamp(5, Timestamp.from(proUntil.toInstant()));
            if (eventCreatedAt == null) {
                s.setNull(6, Types.TIMESTAMP_WITH_TIMEZONE);
                s.setNull(8, Types.TIMESTAMP_WITH_TIMEZONE);
                s.setNull(9, Types.TIMESTAMP_WITH_TIMEZONE);
            } else {
                Timestamp ts = Timestamp.from(eventCreatedAt.toInstant());
                s.setTimestamp(6, ts);
                s.setTimestamp(8, ts);
                s.setTimestamp(9, ts);
            }
            s.setObject(7, userId);
            return s.executeUpdate() > 0;
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /**
     * Subscription terminated by Stripe (canceled, payment failure past grace period).
     * Clears Pro access and stamps the final status. Keeps the customer id around so a
     * future re-subscribe re-uses the same Stripe customer. Clears {@code pro_until}
     * since the prior period-end is no longer meaningful once the subscription is
     * fully terminated.
     *
     * <p>Same out-of-order gate as {@link #applySubscriptionEvent}: a stale
     * {@code .deleted} arriving after a fresh {@code .updated} is ignored. Returns
     * true if the row was actually updated.
     */
    public boolean clearSubscription(UUID userId, String status, OffsetDateTime eventCreatedAt) {
        getOrCreate(userId);
        var sql = """
            update profiles
               set is_pro                 = false,
                   stripe_subscription_id = null,
                   subscription_status    = ?,
                   pro_until              = null,
                   stripe_event_at        = coalesce(?, stripe_event_at)
             where user_id = ?
               and (stripe_event_at is null or cast(? as timestamptz) is null or stripe_event_at <= cast(? as timestamptz))""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setString(1, status);
            if (eventCreatedAt == null) {
                s.setNull(2, Types.TIMESTAMP_WITH_TIMEZONE);
                s.setNull(4, Types.TIMESTAMP_WITH_TIMEZONE);
                s.setNull(5, Types.TIMESTAMP_WITH_TIMEZONE);
            } else {
                Timestamp ts = Timestamp.from(eventCreatedAt.toInstant());
                s.setTimestamp(2, ts);
                s.setTimestamp(4, ts);
                s.setTimestamp(5, ts);
            }
            s.setObject(3, userId);
            return s.executeUpdate() > 0;
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /**
     * Sets the user's social identity. {@code username} is coalesced (never wiped by a
     * null), the rest are set directly so display_name/avatar/bio can be cleared. Throws
     * {@link UsernameTakenException} on the unique-index violation (23505) so the resource
     * can return 409 instead of a 500.
     */
    public Profile setSocial(UUID userId, String username, String displayName, String avatarUrl, String bio) {
        getOrCreate(userId);
        var sql = """
            update profiles
               set username     = coalesce(?, username),
                   display_name = ?,
                   avatar_url   = ?,
                   bio          = ?
             where user_id = ?
            returning *""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setString(1, username);
            s.setString(2, displayName);
            s.setString(3, avatarUrl);
            s.setString(4, bio);
            s.setObject(5, userId);
            try (var rs = s.executeQuery()) {
                rs.next();
                return map(rs);
            }
        } catch (SQLException e) {
            if ("23505".equals(e.getSQLState())) {
                throw new UsernameTakenException("Esse @username já está em uso.");
            }
            throw new RuntimeException(e);
        }
    }

    /**
     * Public social profile by username, with follower/following counts and the viewer's
     * relationship. Selects ONLY the public columns — never the private/LGPD ones. Empty
     * if no such username.
     */
    public Optional<SocialProfile> publicProfile(UUID viewerId, String username) {
        var sql = """
            select p.user_id, p.username, p.display_name, p.avatar_url, p.bio,
                   (select count(*) from follows f where f.followee_id = p.user_id) as followers,
                   (select count(*) from follows f where f.follower_id = p.user_id) as following,
                   exists (select 1 from follows f where f.followee_id = p.user_id and f.follower_id = ?) as is_following
              from profiles p
             where lower(p.username) = lower(?)""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, viewerId);
            s.setString(2, username);
            try (var rs = s.executeQuery()) {
                return rs.next() ? Optional.of(mapSocial(rs, viewerId)) : Optional.empty();
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /** Public profile by user id (for follow/unfollow responses + author resolution). */
    public Optional<SocialProfile> publicProfileById(UUID viewerId, UUID targetId) {
        var sql = """
            select p.user_id, p.username, p.display_name, p.avatar_url, p.bio,
                   (select count(*) from follows f where f.followee_id = p.user_id) as followers,
                   (select count(*) from follows f where f.follower_id = p.user_id) as following,
                   exists (select 1 from follows f where f.followee_id = p.user_id and f.follower_id = ?) as is_following
              from profiles p
             where p.user_id = ?""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, viewerId);
            s.setObject(2, targetId);
            try (var rs = s.executeQuery()) {
                return rs.next() ? Optional.of(mapSocial(rs, viewerId)) : Optional.empty();
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /** Username search (prefix/substring) — only rows that have set a username. */
    public List<SocialProfile> search(UUID viewerId, String query, int limit) {
        var out = new ArrayList<SocialProfile>();
        var sql = """
            select p.user_id, p.username, p.display_name, p.avatar_url, p.bio,
                   (select count(*) from follows f where f.followee_id = p.user_id) as followers,
                   (select count(*) from follows f where f.follower_id = p.user_id) as following,
                   exists (select 1 from follows f where f.followee_id = p.user_id and f.follower_id = ?) as is_following
              from profiles p
             where p.username is not null and lower(p.username) like ?
             order by p.username asc
             limit ?""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, viewerId);
            s.setString(2, "%" + (query == null ? "" : query.toLowerCase()) + "%");
            s.setInt(3, limit);
            try (var rs = s.executeQuery()) {
                while (rs.next()) out.add(mapSocial(rs, viewerId));
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
        return out;
    }

    /**
     * Users who follow {@code targetId} (their "seguidores"), newest-follow first.
     * Returns the public {@link SocialProfile} shape with counts and the VIEWER's
     * {@code isFollowing}/{@code isSelf} for each row, so the list can show Follow buttons.
     */
    public List<SocialProfile> followersOf(UUID viewerId, UUID targetId, int limit) {
        return followList(viewerId, targetId, limit, true);
    }

    /** Users {@code targetId} follows (their "seguindo"), newest-follow first. */
    public List<SocialProfile> followingOf(UUID viewerId, UUID targetId, int limit) {
        return followList(viewerId, targetId, limit, false);
    }

    private List<SocialProfile> followList(UUID viewerId, UUID targetId, int limit, boolean followers) {
        // followers: people whose follow row points AT target (join on fr.follower_id).
        // following: people target points at            (join on fr.followee_id).
        var joinCol  = followers ? "fr.follower_id" : "fr.followee_id";
        var whereCol = followers ? "fr.followee_id" : "fr.follower_id";
        var sql = """
            select p.user_id, p.username, p.display_name, p.avatar_url, p.bio,
                   (select count(*) from follows f where f.followee_id = p.user_id) as followers,
                   (select count(*) from follows f where f.follower_id = p.user_id) as following,
                   exists (select 1 from follows f where f.followee_id = p.user_id and f.follower_id = ?) as is_following
              from follows fr
              join profiles p on p.user_id = %s
             where %s = ?
             order by fr.created_at desc
             limit ?""".formatted(joinCol, whereCol);
        var out = new ArrayList<SocialProfile>();
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, viewerId);
            s.setObject(2, targetId);
            s.setInt(3, limit);
            try (var rs = s.executeQuery()) {
                while (rs.next()) out.add(mapSocial(rs, viewerId));
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
        return out;
    }

    private static SocialProfile mapSocial(ResultSet rs, UUID viewerId) throws SQLException {
        var uid = (UUID) rs.getObject("user_id");
        return new SocialProfile(
            uid,
            rs.getString("username"),
            rs.getString("display_name"),
            rs.getString("avatar_url"),
            rs.getString("bio"),
            rs.getLong("followers"),
            rs.getLong("following"),
            rs.getBoolean("is_following"),
            uid.equals(viewerId)
        );
    }

    private static void setNullableDouble(java.sql.PreparedStatement s, int i, Double v) throws SQLException {
        if (v == null) s.setNull(i, Types.DOUBLE); else s.setDouble(i, v);
    }

    private static Profile map(ResultSet rs) throws SQLException {
        var proUntil = rs.getTimestamp("pro_until");
        return new Profile(
            (UUID) rs.getObject("user_id"),
            rs.getBoolean("is_pro"),
            rs.getString("subscription_status"),
            proUntil == null ? null : OffsetDateTime.ofInstant(proUntil.toInstant(), ZoneOffset.UTC),
            (Double) rs.getObject("weight_kg"),
            (Double) rs.getObject("target_weight_kg"),
            (Double) rs.getObject("height_cm"),
            (Integer) rs.getObject("birth_year"),
            rs.getString("sex"),
            (Double) rs.getObject("activity_multiplier"),
            (Integer) rs.getObject("calorie_goal"),
            (Double) rs.getObject("protein_goal"),
            rs.getBoolean("onboarding_complete"),
            rs.getString("username"),
            rs.getString("display_name"),
            rs.getString("avatar_url"),
            rs.getString("bio"),
            readTextArray(rs, "default_sections")
        );
    }

    /** Reads a Postgres text[] column into a List, or null if SQL NULL. */
    private static List<String> readTextArray(ResultSet rs, String col) throws SQLException {
        var arr = rs.getArray(col);
        if (arr == null) return null;
        var vals = (String[]) arr.getArray();
        return vals == null ? null : Arrays.asList(vals);
    }

    public record OnboardingUpdate(
        Double weightKg,
        Double targetWeightKg,
        Double heightCm,
        Integer birthYear,
        String sex,
        Double activityMultiplier,
        Integer calorieGoal,
        Double proteinGoal,
        boolean onboardingComplete
    ) {}
}
