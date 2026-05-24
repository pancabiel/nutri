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

    /** Subscription side: called from the Stripe webhook handler in Sprint 2. */
    public void updateSubscription(UUID userId, String stripeCustomerId, String stripeSubscriptionId,
                                   String status, OffsetDateTime proUntil) {
        boolean isPro = "active".equals(status);
        var sql = """
            update profiles
               set is_pro                 = ?,
                   stripe_customer_id     = coalesce(?, stripe_customer_id),
                   stripe_subscription_id = ?,
                   subscription_status    = ?,
                   pro_until              = ?
             where user_id = ?""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setBoolean(1, isPro);
            s.setString(2, stripeCustomerId);
            s.setString(3, stripeSubscriptionId);
            s.setString(4, status);
            if (proUntil == null) s.setNull(5, Types.TIMESTAMP_WITH_TIMEZONE);
            else s.setTimestamp(5, Timestamp.from(proUntil.toInstant()));
            s.setObject(6, userId);
            s.executeUpdate();
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
