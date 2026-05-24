package com.nutri.repository;

import com.nutri.model.Profile;
import io.agroal.api.AgroalDataSource;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
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
               and (stripe_event_at is null or ? is null or stripe_event_at <= ?)""";
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
               and (stripe_event_at is null or ? is null or stripe_event_at <= ?)""";
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
            rs.getBoolean("onboarding_complete")
        );
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
