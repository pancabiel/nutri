package com.nutri.repository;

import io.agroal.api.AgroalDataSource;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.jboss.logging.Logger;

import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Global circuit breaker. One row in {@code kill_switch} (id = 'global'). When
 * {@code tripped = true}, {@code AiService} refuses every Claude call until an
 * operator clears it.
 *
 * {@link #isTripped()} is on the hot path (every Claude call), so we cache the
 * value in-process for a few seconds. The cron only flips state hourly and a
 * manual reset is an operator action — a short stale window is fine, and beats
 * paying a DB roundtrip per call.
 */
@ApplicationScoped
public class KillSwitchRepository {

    private static final Logger LOG = Logger.getLogger(KillSwitchRepository.class);
    private static final String ID = "global";
    private static final long CACHE_TTL_MILLIS = 5_000;

    @Inject AgroalDataSource ds;

    private record CachedState(boolean tripped, long expiresAtMillis) {}
    private final AtomicReference<CachedState> cache = new AtomicReference<>();

    /** Read the current state. Fails open (returns {@code false}) on DB error so a transient
     *  blip doesn't take the product offline. The cron will re-trip on the next run if needed.
     *  Result cached in-process for {@value #CACHE_TTL_MILLIS} ms to keep this off the hot path. */
    public boolean isTripped() {
        long now = System.currentTimeMillis();
        CachedState cached = cache.get();
        if (cached != null && cached.expiresAtMillis > now) return cached.tripped;
        boolean fresh = readFromDb();
        cache.set(new CachedState(fresh, now + CACHE_TTL_MILLIS));
        return fresh;
    }

    private boolean readFromDb() {
        try (var c = ds.getConnection();
             var s = c.prepareStatement("select tripped from kill_switch where id = ?")) {
            s.setString(1, ID);
            try (var rs = s.executeQuery()) {
                return rs.next() && rs.getBoolean(1);
            }
        } catch (SQLException e) {
            LOG.error("failed to read kill switch — failing open", e);
            return false;
        }
    }

    /** Trip the switch (idempotent — overwrites prior tripped state with fresh metadata). */
    public void trip(String reason, long costMicroUsd) {
        var sql = """
            insert into kill_switch (id, tripped, tripped_at, reason, cost_micro_usd)
                 values (?, true, ?, ?, ?)
            on conflict (id) do update
               set tripped        = excluded.tripped,
                   tripped_at     = excluded.tripped_at,
                   reason         = excluded.reason,
                   cost_micro_usd = excluded.cost_micro_usd""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setString(1, ID);
            s.setTimestamp(2, Timestamp.from(Instant.now()));
            s.setString(3, reason);
            s.setLong(4, costMicroUsd);
            s.executeUpdate();
            cache.set(null);
            LOG.warnf("kill switch TRIPPED: reason=%s cost_micro_usd=%d", reason, costMicroUsd);
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /** Clear the switch (manual operator action — not called by cron). */
    public void reset() {
        try (var c = ds.getConnection();
             var s = c.prepareStatement("update kill_switch set tripped = false, reason = null where id = ?")) {
            s.setString(1, ID);
            s.executeUpdate();
            cache.set(null);
        } catch (SQLException e) { throw new RuntimeException(e); }
    }
}
