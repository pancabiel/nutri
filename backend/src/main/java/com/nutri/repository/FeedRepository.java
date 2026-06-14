package com.nutri.repository;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nutri.model.FeedPost;
import io.agroal.api.AgroalDataSource;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Reads/writes feed posts. Holds the ONE sanctioned cross-tenant read in the app:
 * {@link #feed} returns posts of authors the viewer follows (plus the viewer's own).
 * Writes/deletes/likes are still scoped to the acting user, and like/visibility is
 * re-checked in SQL because the backend role bypasses RLS.
 */
@ApplicationScoped
public class FeedRepository {

    @Inject AgroalDataSource ds;
    @Inject ObjectMapper mapper;

    // Columns shared by every post-returning query (author join + like aggregate + liked flag).
    private static final String SELECT_COLS = """
        select p.id, p.user_id, p.caption, p.image_url, p.ref_type, p.snapshot, p.created_at,
               pr.username, pr.display_name, pr.avatar_url,
               (select count(*) from post_likes pl where pl.post_id = p.id) as like_count,
               exists (select 1 from post_likes pl2 where pl2.post_id = p.id and pl2.user_id = ?) as liked
          from feed_posts p
          join profiles pr on pr.user_id = p.user_id""";

    public UUID create(UUID authorId, String caption, String imageUrl, String refType, String snapshotJson) {
        var id = UUID.randomUUID();
        var sql = """
            insert into feed_posts (id, user_id, caption, image_url, ref_type, snapshot)
            values (?, ?, ?, ?, ?, cast(? as jsonb))""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, id);
            s.setObject(2, authorId);
            s.setString(3, caption);
            s.setString(4, imageUrl);
            s.setString(5, refType);
            s.setString(6, snapshotJson);
            s.executeUpdate();
        } catch (SQLException e) { throw new RuntimeException(e); }
        return id;
    }

    /**
     * The feed: posts by {@code authorIds} (caller passes followingIds + the viewer's own
     * id), newest first, keyset-paginated on the composite cursor {@code (created_at, id)}.
     * A null cursor means the first page.
     */
    public List<FeedPost> feed(UUID viewerId, List<UUID> authorIds,
                               OffsetDateTime beforeCreatedAt, UUID beforeId, int limit) {
        if (authorIds == null || authorIds.isEmpty()) return List.of();
        boolean hasCursor = beforeCreatedAt != null && beforeId != null;
        var sql = SELECT_COLS + """

             where p.user_id = any(?)"""
            + (hasCursor ? " and (p.created_at, p.id) < (?, ?)" : "")
            + " order by p.created_at desc, p.id desc limit ?";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            int i = 1;
            s.setObject(i++, viewerId);                              // liked flag
            s.setArray(i++, c.createArrayOf("uuid", authorIds.toArray()));
            if (hasCursor) {
                s.setTimestamp(i++, Timestamp.from(beforeCreatedAt.toInstant()));
                s.setObject(i++, beforeId);
            }
            s.setInt(i, limit);
            var out = new ArrayList<FeedPost>();
            try (var rs = s.executeQuery()) {
                while (rs.next()) out.add(mapPost(rs));
            }
            return out;
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /** A single post, authorized: visible iff the viewer owns it or follows the author. */
    public Optional<FeedPost> byId(UUID viewerId, UUID id) {
        var sql = SELECT_COLS + """

             where p.id = ?
               and (p.user_id = ?
                    or exists (select 1 from follows f
                                where f.followee_id = p.user_id and f.follower_id = ?))""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, viewerId);
            s.setObject(2, id);
            s.setObject(3, viewerId);
            s.setObject(4, viewerId);
            try (var rs = s.executeQuery()) {
                return rs.next() ? Optional.of(mapPost(rs)) : Optional.empty();
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public void delete(UUID authorId, UUID id) {
        try (var c = ds.getConnection();
             var s = c.prepareStatement("delete from feed_posts where id = ? and user_id = ?")) {
            s.setObject(1, id);
            s.setObject(2, authorId);
            s.executeUpdate();
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /** Like a post, but only if the viewer is allowed to see it (owner or follows author). */
    public void like(UUID viewerId, UUID postId) {
        var sql = """
            insert into post_likes (post_id, user_id)
            select ?, ?
             where exists (select 1 from feed_posts p
                            where p.id = ?
                              and (p.user_id = ?
                                   or exists (select 1 from follows f
                                               where f.followee_id = p.user_id and f.follower_id = ?)))
            on conflict do nothing""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, postId);
            s.setObject(2, viewerId);
            s.setObject(3, postId);
            s.setObject(4, viewerId);
            s.setObject(5, viewerId);
            s.executeUpdate();
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public void unlike(UUID viewerId, UUID postId) {
        try (var c = ds.getConnection();
             var s = c.prepareStatement("delete from post_likes where post_id = ? and user_id = ?")) {
            s.setObject(1, postId);
            s.setObject(2, viewerId);
            s.executeUpdate();
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    private FeedPost mapPost(ResultSet rs) throws SQLException {
        var ts = rs.getTimestamp("created_at");
        var author = new FeedPost.Author(
            (UUID) rs.getObject("user_id"),
            rs.getString("username"),
            rs.getString("display_name"),
            rs.getString("avatar_url"));
        JsonNode snapshot = null;
        var raw = rs.getString("snapshot");
        if (raw != null && !raw.isBlank()) {
            try { snapshot = mapper.readTree(raw); } catch (Exception ignore) { /* tolerate bad snapshot */ }
        }
        return new FeedPost(
            (UUID) rs.getObject("id"),
            author,
            rs.getString("caption"),
            rs.getString("image_url"),
            rs.getString("ref_type"),
            snapshot,
            rs.getLong("like_count"),
            rs.getBoolean("liked"),
            ts == null ? null : OffsetDateTime.ofInstant(ts.toInstant(), ZoneOffset.UTC)
        );
    }
}
