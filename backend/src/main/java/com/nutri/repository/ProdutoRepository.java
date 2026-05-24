package com.nutri.repository;

import com.nutri.model.Produto;
import io.agroal.api.AgroalDataSource;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.sql.*;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@ApplicationScoped
public class ProdutoRepository {

    @Inject AgroalDataSource ds;

    public List<Produto> all(UUID userId) {
        var out = new ArrayList<Produto>();
        var sql = "select * from produtos where user_id = ? order by name asc";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, userId);
            try (var rs = s.executeQuery()) {
                while (rs.next()) out.add(map(rs));
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
        return out;
    }

    public List<Produto> search(UUID userId, String query, int limit) {
        var out = new ArrayList<Produto>();
        var sql = "select * from produtos where user_id = ? and lower(name) like ? order by name asc limit ?";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, userId);
            s.setString(2, "%" + (query == null ? "" : query.toLowerCase()) + "%");
            s.setInt(3, limit);
            try (var rs = s.executeQuery()) {
                while (rs.next()) out.add(map(rs));
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
        return out;
    }

    public Optional<Produto> byId(UUID userId, UUID id) {
        try (var c = ds.getConnection();
             var s = c.prepareStatement("select * from produtos where id = ? and user_id = ?")) {
            s.setObject(1, id);
            s.setObject(2, userId);
            try (var rs = s.executeQuery()) {
                return rs.next() ? Optional.of(map(rs)) : Optional.empty();
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public Produto create(UUID userId, Produto p) {
        var id = p.id() != null ? p.id() : UUID.randomUUID();
        var sql = """
            insert into produtos
              (id, user_id, name, brand, calories_per_gram, protein_per_gram,
               carbs_per_gram, fat_per_gram, serving_grams, serving_label, created_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now())
            returning *""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, id);
            s.setObject(2, userId);
            s.setString(3, p.name());
            s.setString(4, p.brand());
            s.setDouble(5, p.caloriesPerGram());
            s.setDouble(6, p.proteinPerGram());
            setNullableDouble(s, 7, p.carbsPerGram());
            setNullableDouble(s, 8, p.fatPerGram());
            setNullableDouble(s, 9, p.servingGrams());
            s.setString(10, p.servingLabel());
            try (var rs = s.executeQuery()) {
                rs.next();
                return map(rs);
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public Produto update(UUID userId, UUID id, Produto p) {
        var sql = """
            update produtos
               set name = ?, brand = ?, calories_per_gram = ?, protein_per_gram = ?,
                   carbs_per_gram = ?, fat_per_gram = ?,
                   serving_grams = ?, serving_label = ?
             where id = ? and user_id = ?
            returning *""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setString(1, p.name());
            s.setString(2, p.brand());
            s.setDouble(3, p.caloriesPerGram());
            s.setDouble(4, p.proteinPerGram());
            setNullableDouble(s, 5, p.carbsPerGram());
            setNullableDouble(s, 6, p.fatPerGram());
            setNullableDouble(s, 7, p.servingGrams());
            s.setString(8, p.servingLabel());
            s.setObject(9, id);
            s.setObject(10, userId);
            try (var rs = s.executeQuery()) {
                if (!rs.next()) throw new RuntimeException("produto not found or not owned");
                return map(rs);
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public void delete(UUID userId, UUID id) {
        try (var c = ds.getConnection();
             var s = c.prepareStatement("delete from produtos where id = ? and user_id = ?")) {
            s.setObject(1, id);
            s.setObject(2, userId);
            s.executeUpdate();
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    private static void setNullableDouble(PreparedStatement s, int i, Double v) throws SQLException {
        if (v == null) s.setNull(i, Types.DOUBLE); else s.setDouble(i, v);
    }

    private static Produto map(ResultSet rs) throws SQLException {
        var carbs   = (Double) rs.getObject("carbs_per_gram");
        var fat     = (Double) rs.getObject("fat_per_gram");
        var serving = (Double) rs.getObject("serving_grams");
        var ts      = rs.getTimestamp("created_at");
        return new Produto(
            (UUID) rs.getObject("id"),
            rs.getString("name"),
            rs.getString("brand"),
            rs.getDouble("calories_per_gram"),
            rs.getDouble("protein_per_gram"),
            carbs,
            fat,
            serving,
            rs.getString("serving_label"),
            ts == null ? null : OffsetDateTime.ofInstant(ts.toInstant(), ZoneOffset.UTC)
        );
    }
}
