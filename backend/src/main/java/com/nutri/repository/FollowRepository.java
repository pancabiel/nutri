package com.nutri.repository;

import io.agroal.api.AgroalDataSource;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * The (assimétrico) social graph. {@code follower} follows {@code followee}; no
 * approval. Every method scopes by the acting user — a follow row is only ever
 * created/removed where {@code follower_id} is the current user, matching the RLS
 * "write own follows" policy.
 */
@ApplicationScoped
public class FollowRepository {

    @Inject AgroalDataSource ds;

    /** Idempotent follow. No-op (and not an error) if already following or self. */
    public void follow(UUID follower, UUID followee) {
        if (follower.equals(followee)) return;   // CHECK would reject; fail soft
        try (var c = ds.getConnection();
             var s = c.prepareStatement(
                 "insert into follows (follower_id, followee_id) values (?, ?) on conflict do nothing")) {
            s.setObject(1, follower);
            s.setObject(2, followee);
            s.executeUpdate();
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public void unfollow(UUID follower, UUID followee) {
        try (var c = ds.getConnection();
             var s = c.prepareStatement(
                 "delete from follows where follower_id = ? and followee_id = ?")) {
            s.setObject(1, follower);
            s.setObject(2, followee);
            s.executeUpdate();
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public boolean isFollowing(UUID follower, UUID followee) {
        try (var c = ds.getConnection();
             var s = c.prepareStatement(
                 "select 1 from follows where follower_id = ? and followee_id = ?")) {
            s.setObject(1, follower);
            s.setObject(2, followee);
            try (var rs = s.executeQuery()) { return rs.next(); }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /** Ids the user follows. The feed query adds the viewer's own id to this set in the app. */
    public List<UUID> followingIds(UUID userId) {
        var out = new ArrayList<UUID>();
        try (var c = ds.getConnection();
             var s = c.prepareStatement("select followee_id from follows where follower_id = ?")) {
            s.setObject(1, userId);
            try (var rs = s.executeQuery()) {
                while (rs.next()) out.add((UUID) rs.getObject("followee_id"));
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
        return out;
    }
}
