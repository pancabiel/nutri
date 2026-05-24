package com.nutri.repository;

import io.agroal.api.AgroalDataSource;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.jboss.logging.Logger;

import java.sql.SQLException;
import java.time.Instant;
import java.util.UUID;

@ApplicationScoped
public class UsageRepository {

    private static final Logger LOG = Logger.getLogger(UsageRepository.class);

    @Inject AgroalDataSource ds;

    /**
     * Record a single Claude API call. Persistence failure does NOT throw — we don't
     * want a metering hiccup to break user-facing functionality. Logged loudly so
     * sanity-check queries vs Anthropic's invoice will catch any drift.
     */
    public void record(UUID userId, String kind, String model,
                       int inputTokens, int cachedReadTokens, int cachedWriteTokens, int outputTokens,
                       long costMicroUsd) {
        var sql = """
            insert into usage_events
              (user_id, kind, model, input_tokens, cached_read_tokens, cached_write_tokens, output_tokens, cost_micro_usd)
            values (?, ?, ?, ?, ?, ?, ?, ?)""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, userId);
            s.setString(2, kind);
            s.setString(3, model);
            s.setInt(4, inputTokens);
            s.setInt(5, cachedReadTokens);
            s.setInt(6, cachedWriteTokens);
            s.setInt(7, outputTokens);
            s.setLong(8, costMicroUsd);
            s.executeUpdate();
        } catch (SQLException e) {
            LOG.error("failed to record usage event for user " + userId, e);
        }
    }

    /** Lifetime count for a user / kind (for free-tier caps). */
    public int lifetimeCount(UUID userId, String kind) {
        var sql = "select count(*) from usage_events where user_id = ? and kind = ?";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, userId);
            s.setString(2, kind);
            try (var rs = s.executeQuery()) {
                rs.next();
                return rs.getInt(1);
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /** Count since the given instant (for Pro daily caps). */
    public int countSince(UUID userId, String kind, Instant since) {
        var sql = "select count(*) from usage_events where user_id = ? and kind = ? and created_at >= ?";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, userId);
            s.setString(2, kind);
            s.setTimestamp(3, java.sql.Timestamp.from(since));
            try (var rs = s.executeQuery()) {
                rs.next();
                return rs.getInt(1);
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /** Total cost over a window — used by the kill switch and per-user dashboards. */
    public long sumCostMicroUsdSince(UUID userId, Instant since) {
        var sql = "select coalesce(sum(cost_micro_usd), 0) from usage_events where user_id = ? and created_at >= ?";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, userId);
            s.setTimestamp(2, java.sql.Timestamp.from(since));
            try (var rs = s.executeQuery()) {
                rs.next();
                return rs.getLong(1);
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /** Global cost over a window — used by the cron kill switch (no user filter). */
    public long globalCostMicroUsdSince(Instant since) {
        var sql = "select coalesce(sum(cost_micro_usd), 0) from usage_events where created_at >= ?";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setTimestamp(1, java.sql.Timestamp.from(since));
            try (var rs = s.executeQuery()) {
                rs.next();
                return rs.getLong(1);
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }
}
