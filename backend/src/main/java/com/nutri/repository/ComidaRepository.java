package com.nutri.repository;

import com.nutri.model.Comida;
import io.agroal.api.AgroalDataSource;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.sql.*;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.*;

@ApplicationScoped
public class ComidaRepository {

    @Inject AgroalDataSource ds;

    /** Ativas só — o que vai pra memória da IA e pros matchers. */
    public List<Comida> all(UUID userId) { return list(userId, false); }

    /**
     * Ativas + arquivadas (flag {@code archived}). Usado pelo GET /comidas: o frontend
     * precisa das arquivadas pra resolver marmitas e dias que ainda as referenciam.
     */
    public List<Comida> allWithArchived(UUID userId) { return list(userId, true); }

    private List<Comida> list(UUID userId, boolean withArchived) {
        var byId = new LinkedHashMap<UUID, ComidaBuilder>();
        var sql = """
            select c.id, c.name, c.yield_grams, c.created_at, c.archived_at,
                   cp.produto_id, cp.quantity_grams
              from comidas c
              left join comida_produtos cp on cp.comida_id = c.id
             where c.user_id = ? %s
             order by c.name asc""".formatted(withArchived ? "" : "and c.archived_at is null");
        try (var conn = ds.getConnection();
             var s = conn.prepareStatement(sql)) {
            s.setObject(1, userId);
            try (var rs = s.executeQuery()) {
                while (rs.next()) collect(rs, byId);
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
        return byId.values().stream().map(ComidaBuilder::build).toList();
    }

    public List<Comida> search(UUID userId, String query, int limit) {
        var byId = new LinkedHashMap<UUID, ComidaBuilder>();
        var sql = """
            select c.id, c.name, c.yield_grams, c.created_at, c.archived_at,
                   cp.produto_id, cp.quantity_grams
              from comidas c
              left join comida_produtos cp on cp.comida_id = c.id
             where c.id in (
                select id from comidas where user_id = ? and archived_at is null and lower(name) like ? order by name asc limit ?
             )""";
        try (var conn = ds.getConnection();
             var s = conn.prepareStatement(sql)) {
            s.setObject(1, userId);
            s.setString(2, "%" + (query == null ? "" : query.toLowerCase()) + "%");
            s.setInt(3, limit);
            try (var rs = s.executeQuery()) {
                while (rs.next()) collect(rs, byId);
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
        return byId.values().stream().map(ComidaBuilder::build).toList();
    }

    public Optional<Comida> byId(UUID userId, UUID id) {
        var byId = new LinkedHashMap<UUID, ComidaBuilder>();
        var sql = """
            select c.id, c.name, c.yield_grams, c.created_at, c.archived_at,
                   cp.produto_id, cp.quantity_grams
              from comidas c
              left join comida_produtos cp on cp.comida_id = c.id
             where c.id = ? and c.user_id = ?""";
        try (var conn = ds.getConnection();
             var s = conn.prepareStatement(sql)) {
            s.setObject(1, id);
            s.setObject(2, userId);
            try (var rs = s.executeQuery()) {
                while (rs.next()) collect(rs, byId);
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
        return byId.values().stream().map(ComidaBuilder::build).findFirst();
    }

    public Comida create(UUID userId, Comida c) {
        var id = c.id() != null ? c.id() : UUID.randomUUID();
        try (var conn = ds.getConnection()) {
            conn.setAutoCommit(false);
            try (var s = conn.prepareStatement(
                "insert into comidas (id, user_id, name, yield_grams, created_at) values (?, ?, ?, ?, now())")) {
                s.setObject(1, id);
                s.setObject(2, userId);
                s.setString(3, c.name());
                s.setObject(4, c.yieldGrams());
                s.executeUpdate();
            }
            insertItems(conn, userId, id, c.items());
            conn.commit();
        } catch (SQLException e) { throw new RuntimeException(e); }
        return byId(userId, id).orElseThrow();
    }

    public Comida update(UUID userId, UUID id, Comida c) {
        try (var conn = ds.getConnection()) {
            conn.setAutoCommit(false);
            int rows;
            try (var s = conn.prepareStatement(
                "update comidas set name = ?, yield_grams = ? where id = ? and user_id = ?")) {
                s.setString(1, c.name());
                s.setObject(2, c.yieldGrams());
                s.setObject(3, id);
                s.setObject(4, userId);
                rows = s.executeUpdate();
            }
            if (rows == 0) throw new NotOwnedException("comida not found or not owned");
            try (var s = conn.prepareStatement(
                "delete from comida_produtos where comida_id = ?")) {
                s.setObject(1, id);
                s.executeUpdate();
            }
            insertItems(conn, userId, id, c.items());
            conn.commit();
        } catch (SQLException e) { throw new RuntimeException(e); }
        return byId(userId, id).orElseThrow();
    }

    public void delete(UUID userId, UUID id) {
        try (var conn = ds.getConnection();
             var s = conn.prepareStatement("delete from comidas where id = ? and user_id = ?")) {
            s.setObject(1, id);
            s.setObject(2, userId);
            s.executeUpdate();
        } catch (SQLException e) {
            // FK from meal_template_items / meal_items (no action) — the comida is still
            // referenced by a marmita or a logged day. Surface a 409 instead of a silent 500.
            if ("23503".equals(e.getSQLState())) {
                throw new InUseException("Comida em uso em uma marmita ou dia registrado. Arquive-a pra tirá-la das listas.");
            }
            throw new RuntimeException(e);
        }
    }

    /** Arquiva (true) ou restaura (false). Arquivada continua existindo pras referências. */
    public void setArchived(UUID userId, UUID id, boolean archived) {
        try (var conn = ds.getConnection();
             var s = conn.prepareStatement(
                 "update comidas set archived_at = " + (archived ? "coalesce(archived_at, now())" : "null")
                 + " where id = ? and user_id = ?")) {
            s.setObject(1, id);
            s.setObject(2, userId);
            if (s.executeUpdate() == 0) throw new NotOwnedException("comida not found or not owned");
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    private void insertItems(Connection conn, UUID userId, UUID comidaId, List<Comida.ComidaProduto> items) throws SQLException {
        if (items == null || items.isEmpty()) return;
        // Filter to produtos the current user actually owns — defense against forged produto_ids
        // coming from a malicious client or AI output.
        var ownedSql = "select 1 from produtos where id = ? and user_id = ?";
        var insertSql = "insert into comida_produtos (id, comida_id, produto_id, quantity_grams) values (?, ?, ?, ?)";
        try (var check = conn.prepareStatement(ownedSql);
             var s = conn.prepareStatement(insertSql)) {
            for (var it : items) {
                check.setObject(1, it.produtoId());
                check.setObject(2, userId);
                try (var rs = check.executeQuery()) {
                    if (!rs.next()) throw new NotOwnedException("produto " + it.produtoId() + " not owned");
                }
                s.setObject(1, UUID.randomUUID());
                s.setObject(2, comidaId);
                s.setObject(3, it.produtoId());
                s.setDouble(4, it.quantityGrams());
                s.addBatch();
            }
            s.executeBatch();
        }
    }

    private static void collect(ResultSet rs, Map<UUID, ComidaBuilder> byId) throws SQLException {
        var id = (UUID) rs.getObject("id");
        var b = byId.computeIfAbsent(id, k -> {
            try {
                var ts = rs.getTimestamp("created_at");
                return new ComidaBuilder(id, rs.getString("name"),
                    (Double) rs.getObject("yield_grams"),
                    ts == null ? null : OffsetDateTime.ofInstant(ts.toInstant(), ZoneOffset.UTC),
                    rs.getTimestamp("archived_at") != null);
            } catch (SQLException e) { throw new RuntimeException(e); }
        });
        var produtoId = (UUID) rs.getObject("produto_id");
        if (produtoId != null) {
            b.items.add(new Comida.ComidaProduto(produtoId, rs.getDouble("quantity_grams")));
        }
    }

    private static final class ComidaBuilder {
        final UUID id; final String name; final Double yieldGrams; final OffsetDateTime createdAt;
        final boolean archived;
        final List<Comida.ComidaProduto> items = new ArrayList<>();
        ComidaBuilder(UUID id, String name, Double yieldGrams, OffsetDateTime createdAt, boolean archived) {
            this.id = id; this.name = name; this.yieldGrams = yieldGrams; this.createdAt = createdAt;
            this.archived = archived;
        }
        Comida build() { return new Comida(id, name, items, yieldGrams, createdAt, archived); }
    }
}
