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

    public List<Comida> all() {
        var byId = new LinkedHashMap<UUID, ComidaBuilder>();
        var sql = """
            select c.id, c.name, c.created_at,
                   cp.produto_id, cp.quantity_grams
              from comidas c
              left join comida_produtos cp on cp.comida_id = c.id
             order by c.name asc""";
        try (var conn = ds.getConnection();
             var s = conn.prepareStatement(sql);
             var rs = s.executeQuery()) {
            while (rs.next()) collect(rs, byId);
        } catch (SQLException e) { throw new RuntimeException(e); }
        return byId.values().stream().map(ComidaBuilder::build).toList();
    }

    public List<Comida> search(String query, int limit) {
        var byId = new LinkedHashMap<UUID, ComidaBuilder>();
        var sql = """
            select c.id, c.name, c.created_at,
                   cp.produto_id, cp.quantity_grams
              from comidas c
              left join comida_produtos cp on cp.comida_id = c.id
             where c.id in (
                select id from comidas where lower(name) like ? order by name asc limit ?
             )""";
        try (var conn = ds.getConnection();
             var s = conn.prepareStatement(sql)) {
            s.setString(1, "%" + (query == null ? "" : query.toLowerCase()) + "%");
            s.setInt(2, limit);
            try (var rs = s.executeQuery()) {
                while (rs.next()) collect(rs, byId);
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
        return byId.values().stream().map(ComidaBuilder::build).toList();
    }

    public Optional<Comida> byId(UUID id) {
        var byId = new LinkedHashMap<UUID, ComidaBuilder>();
        var sql = """
            select c.id, c.name, c.created_at,
                   cp.produto_id, cp.quantity_grams
              from comidas c
              left join comida_produtos cp on cp.comida_id = c.id
             where c.id = ?""";
        try (var conn = ds.getConnection();
             var s = conn.prepareStatement(sql)) {
            s.setObject(1, id);
            try (var rs = s.executeQuery()) {
                while (rs.next()) collect(rs, byId);
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
        return byId.values().stream().map(ComidaBuilder::build).findFirst();
    }

    public Comida create(Comida c) {
        var id = c.id() != null ? c.id() : UUID.randomUUID();
        try (var conn = ds.getConnection()) {
            conn.setAutoCommit(false);
            try (var s = conn.prepareStatement(
                "insert into comidas (id, name, created_at) values (?, ?, now())")) {
                s.setObject(1, id);
                s.setString(2, c.name());
                s.executeUpdate();
            }
            insertItems(conn, id, c.items());
            conn.commit();
        } catch (SQLException e) { throw new RuntimeException(e); }
        return byId(id).orElseThrow();
    }

    public Comida update(UUID id, Comida c) {
        try (var conn = ds.getConnection()) {
            conn.setAutoCommit(false);
            try (var s = conn.prepareStatement("update comidas set name = ? where id = ?")) {
                s.setString(1, c.name());
                s.setObject(2, id);
                s.executeUpdate();
            }
            try (var s = conn.prepareStatement("delete from comida_produtos where comida_id = ?")) {
                s.setObject(1, id);
                s.executeUpdate();
            }
            insertItems(conn, id, c.items());
            conn.commit();
        } catch (SQLException e) { throw new RuntimeException(e); }
        return byId(id).orElseThrow();
    }

    public void delete(UUID id) {
        try (var conn = ds.getConnection();
             var s = conn.prepareStatement("delete from comidas where id = ?")) {
            s.setObject(1, id);
            s.executeUpdate();
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    private void insertItems(Connection conn, UUID comidaId, List<Comida.ComidaProduto> items) throws SQLException {
        if (items == null || items.isEmpty()) return;
        var sql = "insert into comida_produtos (id, comida_id, produto_id, quantity_grams) values (?, ?, ?, ?)";
        try (var s = conn.prepareStatement(sql)) {
            for (var it : items) {
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
                    ts == null ? null : OffsetDateTime.ofInstant(ts.toInstant(), ZoneOffset.UTC));
            } catch (SQLException e) { throw new RuntimeException(e); }
        });
        var produtoId = (UUID) rs.getObject("produto_id");
        if (produtoId != null) {
            b.items.add(new Comida.ComidaProduto(produtoId, rs.getDouble("quantity_grams")));
        }
    }

    private static final class ComidaBuilder {
        final UUID id; final String name; final OffsetDateTime createdAt;
        final List<Comida.ComidaProduto> items = new ArrayList<>();
        ComidaBuilder(UUID id, String name, OffsetDateTime createdAt) {
            this.id = id; this.name = name; this.createdAt = createdAt;
        }
        Comida build() { return new Comida(id, name, items, createdAt); }
    }
}
