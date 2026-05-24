package com.nutri.repository;

import io.agroal.api.AgroalDataSource;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.jboss.logging.Logger;

import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;

/**
 * Global circuit breaker. One row in {@code kill_switch} (id = 'global'). When
 * {@code tripped = true}, {@code AiService} refuses every Claude call until an
 * operator clears it.
 */
@ApplicationScoped
public class KillSwitchRepository {

    private static final Logger LOG = Logger.getLogger(KillSwitchRepository.class);
    private static final String ID = "global";

    @Inject AgroalDataSource ds;

    /** Read the current state. Fails open (returns {@code false}) on DB error so a transient
     *  blip doesn't take the product offline. The cron will re-trip on the next run if needed. */
    public boolean isTripped() {
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
            LOG.warnf("kill switch TRIPPED: reason=%s cost_micro_usd=%d", reason, costMicroUsd);
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /** Clear the switch (manual operator action — not called by cron). */
    public void reset() {
        try (var c = ds.getConnection();
             var s = c.prepareStatement("update kill_switch set tripped = false, reason = null where id = ?")) {
            s.setString(1, ID);
            s.executeUpdate();
        } catch (SQLException e) { throw new RuntimeException(e); }
    }
}
