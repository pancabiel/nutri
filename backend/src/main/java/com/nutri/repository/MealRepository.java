package com.nutri.repository;

import com.nutri.model.MealDay;
import io.agroal.api.AgroalDataSource;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.sql.*;
import java.time.LocalDate;
import java.util.*;

@ApplicationScoped
public class MealRepository {

    private static final List<String> DEFAULT_SECTIONS =
        List.of("Café da manhã", "Almoço", "Lanche", "Jantar");

    @Inject AgroalDataSource ds;

    /** Loads (and lazily creates) the meal day for a given date. */
    public MealDay getOrCreate(LocalDate date) {
        var dayId = ensureDay(date);
        return load(dayId, date);
    }

    public List<DaySummary> recent(int days) {
        var sql = """
            select d.id, d.date,
                   coalesce(sum(i.calories), 0) as calories,
                   count(i.id)                  as items
              from meal_days d
              left join meal_sections s on s.meal_day_id = d.id
              left join meal_items    i on i.meal_section_id = s.id
             group by d.id, d.date
             order by d.date desc
             limit ?""";
        var out = new ArrayList<DaySummary>();
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setInt(1, days);
            try (var rs = s.executeQuery()) {
                while (rs.next()) out.add(new DaySummary(
                    (UUID) rs.getObject("id"),
                    rs.getDate("date").toLocalDate(),
                    rs.getInt("calories"),
                    rs.getInt("items")
                ));
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
        return out;
    }

    public MealDay.MealSection addSection(LocalDate date, String name) {
        var dayId = ensureDay(date);
        var id = UUID.randomUUID();
        var sql = """
            insert into meal_sections (id, meal_day_id, name, order_index)
            values (?, ?, ?, coalesce((select max(order_index)+1 from meal_sections where meal_day_id = ?), 0))
            returning id, name, order_index""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, id);
            s.setObject(2, dayId);
            s.setString(3, name);
            s.setObject(4, dayId);
            try (var rs = s.executeQuery()) {
                rs.next();
                return new MealDay.MealSection(
                    (UUID) rs.getObject("id"),
                    rs.getString("name"),
                    rs.getInt("order_index"),
                    new ArrayList<>()
                );
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public void deleteSection(UUID sectionId) {
        try (var c = ds.getConnection();
             var s = c.prepareStatement("delete from meal_sections where id = ?")) {
            s.setObject(1, sectionId);
            s.executeUpdate();
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public MealDay.MealItem addItem(UUID sectionId, MealDay.MealItem item) {
        var id = UUID.randomUUID();
        var sql = """
            insert into meal_items
              (id, meal_section_id, produto_id, comida_id, name, quantity, calories, protein)
            values (?, ?, ?, ?, ?, ?, ?, ?)
            returning id, produto_id, comida_id, name, quantity, calories, protein""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, id);
            s.setObject(2, sectionId);
            s.setObject(3, item.produtoId());
            s.setObject(4, item.comidaId());
            s.setString(5, item.name());
            s.setDouble(6, item.quantity());
            s.setInt(7, item.calories());
            s.setDouble(8, item.protein());
            try (var rs = s.executeQuery()) {
                rs.next();
                return mapItem(rs);
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public MealDay.MealItem updateItem(UUID itemId, MealDay.MealItem item) {
        var sql = """
            update meal_items
               set produto_id = ?, comida_id = ?, name = ?, quantity = ?, calories = ?, protein = ?
             where id = ?
            returning id, produto_id, comida_id, name, quantity, calories, protein""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, item.produtoId());
            s.setObject(2, item.comidaId());
            s.setString(3, item.name());
            s.setDouble(4, item.quantity());
            s.setInt(5, item.calories());
            s.setDouble(6, item.protein());
            s.setObject(7, itemId);
            try (var rs = s.executeQuery()) {
                rs.next();
                return mapItem(rs);
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public void deleteItem(UUID itemId) {
        try (var c = ds.getConnection();
             var s = c.prepareStatement("delete from meal_items where id = ?")) {
            s.setObject(1, itemId);
            s.executeUpdate();
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /** Find a section on a given date by name; create if missing. */
    public UUID resolveSection(LocalDate date, String sectionName) {
        var dayId = ensureDay(date);
        try (var c = ds.getConnection()) {
            try (var s = c.prepareStatement(
                "select id from meal_sections where meal_day_id = ? and name = ?")) {
                s.setObject(1, dayId);
                s.setString(2, sectionName);
                try (var rs = s.executeQuery()) {
                    if (rs.next()) return (UUID) rs.getObject("id");
                }
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
        return addSection(date, sectionName).id();
    }

    private UUID ensureDay(LocalDate date) {
        try (var c = ds.getConnection()) {
            try (var s = c.prepareStatement("select id from meal_days where date = ?")) {
                s.setDate(1, java.sql.Date.valueOf(date));
                try (var rs = s.executeQuery()) {
                    if (rs.next()) return (UUID) rs.getObject("id");
                }
            }
            var id = UUID.randomUUID();
            try (var s = c.prepareStatement("insert into meal_days (id, date) values (?, ?)")) {
                s.setObject(1, id);
                s.setDate(2, java.sql.Date.valueOf(date));
                s.executeUpdate();
            }
            for (int i = 0; i < DEFAULT_SECTIONS.size(); i++) {
                try (var s = c.prepareStatement(
                    "insert into meal_sections (id, meal_day_id, name, order_index) values (?, ?, ?, ?)")) {
                    s.setObject(1, UUID.randomUUID());
                    s.setObject(2, id);
                    s.setString(3, DEFAULT_SECTIONS.get(i));
                    s.setInt(4, i);
                    s.executeUpdate();
                }
            }
            return id;
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    private MealDay load(UUID dayId, LocalDate date) {
        var sections = new LinkedHashMap<UUID, MealDay.MealSection>();
        var sql = """
            select s.id as section_id, s.name as section_name, s.order_index,
                   i.id as item_id, i.produto_id, i.comida_id, i.name as item_name,
                   i.quantity, i.calories, i.protein
              from meal_sections s
              left join meal_items i on i.meal_section_id = s.id
             where s.meal_day_id = ?
             order by s.order_index asc, i.created_at asc""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, dayId);
            try (var rs = s.executeQuery()) {
                while (rs.next()) {
                    var sid = (UUID) rs.getObject("section_id");
                    var sec = sections.computeIfAbsent(sid, k -> {
                        try {
                            return new MealDay.MealSection(
                                sid,
                                rs.getString("section_name"),
                                rs.getInt("order_index"),
                                new ArrayList<>()
                            );
                        } catch (SQLException e) { throw new RuntimeException(e); }
                    });
                    var itemId = (UUID) rs.getObject("item_id");
                    if (itemId != null) sec.items().add(mapItem(rs));
                }
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
        return new MealDay(dayId, date, new ArrayList<>(sections.values()));
    }

    private static MealDay.MealItem mapItem(ResultSet rs) throws SQLException {
        return new MealDay.MealItem(
            (UUID) rs.getObject(rs.findColumn(hasColumn(rs, "item_id") ? "item_id" : "id")),
            (UUID) rs.getObject("produto_id"),
            (UUID) rs.getObject("comida_id"),
            rs.getString(hasColumn(rs, "item_name") ? "item_name" : "name"),
            rs.getDouble("quantity"),
            rs.getInt("calories"),
            rs.getDouble("protein")
        );
    }

    private static boolean hasColumn(ResultSet rs, String col) throws SQLException {
        var md = rs.getMetaData();
        for (int i = 1; i <= md.getColumnCount(); i++) {
            if (md.getColumnLabel(i).equalsIgnoreCase(col)) return true;
        }
        return false;
    }

    public record DaySummary(UUID id, LocalDate date, int calories, int items) {}
}
