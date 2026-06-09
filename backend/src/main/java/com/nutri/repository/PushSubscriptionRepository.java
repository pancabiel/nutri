package com.nutri.repository;

import com.nutri.model.PushSubscription;
import io.agroal.api.AgroalDataSource;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Plain JDBC store for browser push subscriptions, following the
 * {@link ProfileRepository} pattern (Agroal datasource, every method scoped by
 * {@code userId}). The one exception is {@link #deleteOne(String)}, used by the
 * sender to prune a dead subscription keyed only by its (unique) endpoint.
 */
@ApplicationScoped
public class PushSubscriptionRepository {

    @Inject AgroalDataSource ds;

    /** Insert or refresh a device subscription. Same (user, endpoint) updates the keys in place. */
    public void upsert(UUID userId, PushSubscription.SubscribeRequest r) {
        var sql = """
            insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
            values (?, ?, ?, ?, ?)
            on conflict (user_id, endpoint) do update
               set p256dh     = excluded.p256dh,
                   auth       = excluded.auth,
                   user_agent = excluded.user_agent""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, userId);
            s.setString(2, r.endpoint());
            s.setString(3, r.p256dh());
            s.setString(4, r.auth());
            s.setString(5, r.userAgent());
            s.executeUpdate();
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /** Remove a subscription the user explicitly unsubscribed from. */
    public void deleteByEndpoint(UUID userId, String endpoint) {
        try (var c = ds.getConnection();
             var s = c.prepareStatement("delete from push_subscriptions where user_id = ? and endpoint = ?")) {
            s.setObject(1, userId);
            s.setString(2, endpoint);
            s.executeUpdate();
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /**
     * Internal cleanup when the push service reports a subscription is gone
     * (HTTP 404/410). Keyed by endpoint alone — the endpoint is globally unique
     * so this is safe even without the userId.
     */
    public void deleteOne(String endpoint) {
        try (var c = ds.getConnection();
             var s = c.prepareStatement("delete from push_subscriptions where endpoint = ?")) {
            s.setString(1, endpoint);
            s.executeUpdate();
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public List<PushSubscription> byUser(UUID userId) {
        var out = new ArrayList<PushSubscription>();
        try (var c = ds.getConnection();
             var s = c.prepareStatement(
                 "select id, user_id, endpoint, p256dh, auth, user_agent from push_subscriptions where user_id = ?")) {
            s.setObject(1, userId);
            try (var rs = s.executeQuery()) {
                while (rs.next()) out.add(map(rs));
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
        return out;
    }

    private static PushSubscription map(ResultSet rs) throws SQLException {
        return new PushSubscription(
            (UUID) rs.getObject("id"),
            (UUID) rs.getObject("user_id"),
            rs.getString("endpoint"),
            rs.getString("p256dh"),
            rs.getString("auth"),
            rs.getString("user_agent")
        );
    }
}
