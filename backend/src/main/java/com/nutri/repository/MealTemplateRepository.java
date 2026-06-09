package com.nutri.repository;

import com.nutri.model.MealTemplate;
import io.agroal.api.AgroalDataSource;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.sql.*;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.*;

@ApplicationScoped
public class MealTemplateRepository {

    @Inject AgroalDataSource ds;

    public List<MealTemplate> all(UUID userId) {
        return load(userId, null);
    }

    public Optional<MealTemplate> byId(UUID userId, UUID id) {
        return load(userId, id).stream().findFirst();
    }

    /** Loads templates (optionally a single one) with their items and any inline-group produtos. */
    private List<MealTemplate> load(UUID userId, UUID onlyId) {
        var byId = new LinkedHashMap<UUID, Builder>();
        var itemsById = new HashMap<UUID, ItemBuilder>();   // item_id -> builder, for the group pass
        var sql = """
            select t.id, t.name, t.created_at,
                   ti.id as item_id, ti.produto_id, ti.comida_id, ti.quantity, ti.unit,
                   ti.group_name, ti.group_yield_grams
              from meal_templates t
              left join meal_template_items ti on ti.template_id = t.id
             where t.user_id = ?"""
            + (onlyId != null ? " and t.id = ?" : "")
            + " order by t.name asc";
        try (var conn = ds.getConnection();
             var s = conn.prepareStatement(sql)) {
            s.setObject(1, userId);
            if (onlyId != null) s.setObject(2, onlyId);
            try (var rs = s.executeQuery()) {
                while (rs.next()) collect(rs, byId, itemsById);
            }
            if (!itemsById.isEmpty()) loadGroupProdutos(conn, userId, onlyId, itemsById);
        } catch (SQLException e) { throw new RuntimeException(e); }
        return byId.values().stream().map(Builder::build).toList();
    }

    private void loadGroupProdutos(Connection conn, UUID userId, UUID onlyId, Map<UUID, ItemBuilder> itemsById) throws SQLException {
        var sql = """
            select ip.item_id, ip.produto_id, ip.grams
              from meal_template_item_produtos ip
              join meal_template_items ti on ti.id = ip.item_id
              join meal_templates t on t.id = ti.template_id
             where t.user_id = ?"""
            + (onlyId != null ? " and t.id = ?" : "");
        try (var s = conn.prepareStatement(sql)) {
            s.setObject(1, userId);
            if (onlyId != null) s.setObject(2, onlyId);
            try (var rs = s.executeQuery()) {
                while (rs.next()) {
                    var item = itemsById.get((UUID) rs.getObject("item_id"));
                    if (item != null) {
                        item.group.add(new MealTemplate.GroupProduto((UUID) rs.getObject("produto_id"), rs.getDouble("grams")));
                    }
                }
            }
        }
    }

    public MealTemplate create(UUID userId, MealTemplate t) {
        var id = t.id() != null ? t.id() : UUID.randomUUID();
        try (var conn = ds.getConnection()) {
            conn.setAutoCommit(false);
            try (var s = conn.prepareStatement(
                "insert into meal_templates (id, user_id, name, created_at) values (?, ?, ?, now())")) {
                s.setObject(1, id);
                s.setObject(2, userId);
                s.setString(3, t.name());
                s.executeUpdate();
            }
            insertItems(conn, userId, id, t.items());
            conn.commit();
        } catch (SQLException e) { throw new RuntimeException(e); }
        return byId(userId, id).orElseThrow();
    }

    public MealTemplate update(UUID userId, UUID id, MealTemplate t) {
        try (var conn = ds.getConnection()) {
            conn.setAutoCommit(false);
            int rows;
            try (var s = conn.prepareStatement(
                "update meal_templates set name = ? where id = ? and user_id = ?")) {
                s.setString(1, t.name());
                s.setObject(2, id);
                s.setObject(3, userId);
                rows = s.executeUpdate();
            }
            if (rows == 0) throw new NotOwnedException("template not found or not owned");
            // Children (group produtos) cascade off meal_template_items on delete.
            try (var s = conn.prepareStatement(
                "delete from meal_template_items where template_id = ?")) {
                s.setObject(1, id);
                s.executeUpdate();
            }
            insertItems(conn, userId, id, t.items());
            conn.commit();
        } catch (SQLException e) { throw new RuntimeException(e); }
        return byId(userId, id).orElseThrow();
    }

    public void delete(UUID userId, UUID id) {
        try (var conn = ds.getConnection();
             var s = conn.prepareStatement("delete from meal_templates where id = ? and user_id = ?")) {
            s.setObject(1, id);
            s.setObject(2, userId);
            s.executeUpdate();
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    private void insertItems(Connection conn, UUID userId, UUID templateId, List<MealTemplate.TemplateItem> items) throws SQLException {
        if (items == null || items.isEmpty()) return;
        var ownedProduto = "select 1 from produtos where id = ? and user_id = ?";
        var ownedComida  = "select 1 from comidas  where id = ? and user_id = ?";
        var insertItem = "insert into meal_template_items (id, template_id, produto_id, comida_id, quantity, unit, group_name, group_yield_grams) values (?, ?, ?, ?, ?, ?, ?, ?)";
        var insertGP   = "insert into meal_template_item_produtos (id, item_id, produto_id, grams) values (?, ?, ?, ?)";
        try (var checkP = conn.prepareStatement(ownedProduto);
             var checkC = conn.prepareStatement(ownedComida);
             var s  = conn.prepareStatement(insertItem);
             var gp = conn.prepareStatement(insertGP)) {
            for (var it : items) {
                boolean isGroup = it.groupName() != null && !it.groupName().isBlank();
                if (!isGroup && it.produtoId() == null && it.comidaId() == null)
                    throw new NotOwnedException("template item needs a produto, comida or group");
                if (it.produtoId() != null) requireOwned(checkP, it.produtoId(), userId, "produto " + it.produtoId());
                if (it.comidaId() != null)  requireOwned(checkC, it.comidaId(), userId, "comida " + it.comidaId());

                var itemId = UUID.randomUUID();
                s.setObject(1, itemId);
                s.setObject(2, templateId);
                s.setObject(3, isGroup ? null : it.produtoId());
                s.setObject(4, isGroup ? null : it.comidaId());
                s.setDouble(5, it.quantity());
                s.setString(6, it.unit() == null ? "g" : it.unit());
                s.setString(7, isGroup ? it.groupName() : null);
                if (isGroup && it.groupYieldGrams() != null) s.setDouble(8, it.groupYieldGrams());
                else s.setNull(8, Types.DOUBLE);
                s.executeUpdate();

                if (isGroup) {
                    var group = it.group();
                    if (group == null || group.isEmpty())
                        throw new NotOwnedException("group '" + it.groupName() + "' needs at least one produto");
                    for (var g : group) {
                        if (g.produtoId() == null) throw new NotOwnedException("group ingredient missing produto");
                        requireOwned(checkP, g.produtoId(), userId, "group produto " + g.produtoId());
                        gp.setObject(1, UUID.randomUUID());
                        gp.setObject(2, itemId);
                        gp.setObject(3, g.produtoId());
                        gp.setDouble(4, g.grams());
                        gp.addBatch();
                    }
                    gp.executeBatch();
                }
            }
        }
    }

    private static void requireOwned(PreparedStatement check, UUID id, UUID userId, String what) throws SQLException {
        check.setObject(1, id);
        check.setObject(2, userId);
        try (var rs = check.executeQuery()) {
            if (!rs.next()) throw new NotOwnedException(what + " not owned");
        }
    }

    private static void collect(ResultSet rs, Map<UUID, Builder> byId, Map<UUID, ItemBuilder> itemsById) throws SQLException {
        var id = (UUID) rs.getObject("id");
        var b = byId.computeIfAbsent(id, k -> {
            try {
                var ts = rs.getTimestamp("created_at");
                return new Builder(id, rs.getString("name"),
                    ts == null ? null : OffsetDateTime.ofInstant(ts.toInstant(), ZoneOffset.UTC));
            } catch (SQLException e) { throw new RuntimeException(e); }
        });
        var itemId   = (UUID) rs.getObject("item_id");
        if (itemId == null) return;   // template with no items (left join null row)
        var produtoId = (UUID) rs.getObject("produto_id");
        var comidaId  = (UUID) rs.getObject("comida_id");
        var groupName = rs.getString("group_name");

        var ib = new ItemBuilder();
        ib.produtoId = produtoId;
        ib.comidaId = comidaId;
        ib.quantity = rs.getDouble("quantity");
        ib.unit = rs.getString("unit");
        ib.groupName = groupName;
        double yield = rs.getDouble("group_yield_grams");
        ib.groupYieldGrams = rs.wasNull() ? null : yield;
        b.items.add(ib);
        itemsById.put(itemId, ib);
    }

    private static final class ItemBuilder {
        UUID produtoId, comidaId;
        double quantity;
        String unit;
        String groupName;
        Double groupYieldGrams;
        final List<MealTemplate.GroupProduto> group = new ArrayList<>();
        MealTemplate.TemplateItem build() {
            return new MealTemplate.TemplateItem(produtoId, comidaId, quantity, unit,
                groupName, groupYieldGrams, group.isEmpty() ? null : group);
        }
    }

    private static final class Builder {
        final UUID id; final String name; final OffsetDateTime createdAt;
        final List<ItemBuilder> items = new ArrayList<>();
        Builder(UUID id, String name, OffsetDateTime createdAt) {
            this.id = id; this.name = name; this.createdAt = createdAt;
        }
        MealTemplate build() {
            return new MealTemplate(id, name, items.stream().map(ItemBuilder::build).toList(), createdAt);
        }
    }
}
