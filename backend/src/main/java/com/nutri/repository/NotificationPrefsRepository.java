package com.nutri.repository;

import com.nutri.model.NotificationPrefs;
import io.agroal.api.AgroalDataSource;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Time;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Plain JDBC store for per-user reminder preferences (1:1 with auth.users),
 * following the {@link ProfileRepository#getOrCreate} lazy-create pattern.
 * Times are persisted as SQL {@code time} and exposed as {@code "HH:mm"} strings.
 */
@ApplicationScoped
public class NotificationPrefsRepository {

    @Inject AgroalDataSource ds;

    /** Returns the prefs, inserting a default row (every DB default) if absent. */
    public NotificationPrefs getOrCreate(UUID userId) {
        var existing = byId(userId);
        if (existing != null) return existing;
        try (var c = ds.getConnection();
             var s = c.prepareStatement("insert into notification_prefs (user_id) values (?) on conflict do nothing")) {
            s.setObject(1, userId);
            s.executeUpdate();
        } catch (SQLException e) { throw new RuntimeException(e); }
        return byId(userId);
    }

    private NotificationPrefs byId(UUID userId) {
        try (var c = ds.getConnection();
             var s = c.prepareStatement("select * from notification_prefs where user_id = ?")) {
            s.setObject(1, userId);
            try (var rs = s.executeQuery()) {
                return rs.next() ? map(rs) : null;
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /** Insert-or-update the whole prefs row. {@code updated_at} is stamped to now(). */
    public NotificationPrefs upsert(UUID userId, NotificationPrefs p) {
        var sql = """
            insert into notification_prefs
              (user_id, enabled, timezone, weekdays, skip_if_logged, quiet_start, quiet_end,
               cafe_enabled, cafe_time, almoco_enabled, almoco_time,
               lanche_enabled, lanche_time, jantar_enabled, jantar_time, updated_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now())
            on conflict (user_id) do update set
               enabled        = excluded.enabled,
               timezone       = excluded.timezone,
               weekdays       = excluded.weekdays,
               skip_if_logged = excluded.skip_if_logged,
               quiet_start    = excluded.quiet_start,
               quiet_end      = excluded.quiet_end,
               cafe_enabled   = excluded.cafe_enabled,
               cafe_time      = excluded.cafe_time,
               almoco_enabled = excluded.almoco_enabled,
               almoco_time    = excluded.almoco_time,
               lanche_enabled = excluded.lanche_enabled,
               lanche_time    = excluded.lanche_time,
               jantar_enabled = excluded.jantar_enabled,
               jantar_time    = excluded.jantar_time,
               updated_at     = now()
            returning *""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, userId);
            s.setBoolean(2, bool(p.enabled(), true));
            s.setString(3, p.timezone() == null || p.timezone().isBlank() ? "America/Sao_Paulo" : p.timezone());
            s.setShort(4, clampWeekdays(p.weekdays()));
            s.setBoolean(5, bool(p.skipIfLogged(), true));
            setTime(s, 6, p.quietStart());
            setTime(s, 7, p.quietEnd());
            s.setBoolean(8, bool(p.cafeEnabled(), true));
            setTime(s, 9, defaultTime(p.cafeTime(), "08:00"));
            s.setBoolean(10, bool(p.almocoEnabled(), true));
            setTime(s, 11, defaultTime(p.almocoTime(), "12:00"));
            s.setBoolean(12, bool(p.lancheEnabled(), false));
            setTime(s, 13, defaultTime(p.lancheTime(), "16:00"));
            s.setBoolean(14, bool(p.jantarEnabled(), true));
            setTime(s, 15, defaultTime(p.jantarTime(), "20:00"));
            try (var rs = s.executeQuery()) {
                rs.next();
                return map(rs);
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /** User ids with the master toggle on — the cron filters time/day in memory. */
    public List<UUID> userIdsEnabled() {
        var out = new ArrayList<UUID>();
        try (var c = ds.getConnection();
             var s = c.prepareStatement("select user_id from notification_prefs where enabled = true")) {
            try (var rs = s.executeQuery()) {
                while (rs.next()) out.add((UUID) rs.getObject("user_id"));
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
        return out;
    }

    // ---------------- helpers ----------------

    private static boolean bool(Boolean v, boolean dflt) { return v == null ? dflt : v; }

    private static short clampWeekdays(Integer w) {
        int v = w == null ? 127 : w;
        if (v < 0) v = 0;
        if (v > 127) v = 127;
        return (short) v;
    }

    private static String defaultTime(String t, String dflt) {
        return (t == null || t.isBlank()) ? dflt : t;
    }

    private static void setTime(java.sql.PreparedStatement s, int i, String hhmm) throws SQLException {
        if (hhmm == null || hhmm.isBlank()) { s.setNull(i, java.sql.Types.TIME); return; }
        s.setTime(i, Time.valueOf(LocalTime.parse(hhmm.trim())));
    }

    private static String fmt(Time t) {
        if (t == null) return null;
        LocalTime lt = t.toLocalTime();
        return String.format("%02d:%02d", lt.getHour(), lt.getMinute());
    }

    private static NotificationPrefs map(ResultSet rs) throws SQLException {
        return new NotificationPrefs(
            rs.getBoolean("enabled"),
            rs.getString("timezone"),
            (int) rs.getShort("weekdays"),
            rs.getBoolean("skip_if_logged"),
            fmt(rs.getTime("quiet_start")),
            fmt(rs.getTime("quiet_end")),
            rs.getBoolean("cafe_enabled"),
            fmt(rs.getTime("cafe_time")),
            rs.getBoolean("almoco_enabled"),
            fmt(rs.getTime("almoco_time")),
            rs.getBoolean("lanche_enabled"),
            fmt(rs.getTime("lanche_time")),
            rs.getBoolean("jantar_enabled"),
            fmt(rs.getTime("jantar_time"))
        );
    }
}
