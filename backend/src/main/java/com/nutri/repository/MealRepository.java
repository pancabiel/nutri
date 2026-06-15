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

    /** Loads (and lazily creates) the meal day for a given user + date. */
    public MealDay getOrCreate(UUID userId, LocalDate date) {
        var dayId = ensureDay(userId, date);
        return load(userId, dayId, date);
    }

    public List<DaySummary> recent(UUID userId, int days) {
        var sql = """
            select d.id, d.date,
                   coalesce(sum(i.calories), 0) as calories,
                   count(i.id)                  as items
              from meal_days d
              left join meal_sections s on s.meal_day_id = d.id
              left join meal_items    i on i.meal_section_id = s.id
             where d.user_id = ?
             group by d.id, d.date
             order by d.date desc
             limit ?""";
        var out = new ArrayList<DaySummary>();
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, userId);
            s.setInt(2, days);
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

    public MealDay.MealSection addSection(UUID userId, LocalDate date, String name) {
        var dayId = ensureDay(userId, date);
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

    /**
     * Persist a new section ordering for a user's meal day. {@code orderedIds} is the
     * full list of section ids in the desired top-to-bottom order; each gets its
     * {@code order_index} set to its position. Only sections on the user's own day for
     * {@code date} are touched (ids that don't belong are no-ops), so a forged id can't
     * reorder another user's diary.
     */
    public void reorderSections(UUID userId, LocalDate date, List<UUID> orderedIds) {
        if (orderedIds == null || orderedIds.isEmpty()) return;
        var dayId = ensureDay(userId, date);
        var sql = """
            update meal_sections set order_index = ?
             where id = ? and meal_day_id = ?
               and meal_day_id in (select id from meal_days where user_id = ?)""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            for (int i = 0; i < orderedIds.size(); i++) {
                s.setInt(1, i);
                s.setObject(2, orderedIds.get(i));
                s.setObject(3, dayId);
                s.setObject(4, userId);
                s.addBatch();
            }
            s.executeBatch();
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public void deleteSection(UUID userId, UUID sectionId) {
        // Only delete if the section belongs to a meal_day the user owns.
        var sql = """
            delete from meal_sections
             where id = ?
               and meal_day_id in (select id from meal_days where user_id = ?)""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, sectionId);
            s.setObject(2, userId);
            s.executeUpdate();
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public MealDay.MealItem addItem(UUID userId, UUID sectionId, MealDay.MealItem item) {
        requireSectionOwned(userId, sectionId);
        var produtoId = validateOwnedProduto(userId, item.produtoId());
        var comidaId  = validateOwnedComida(userId, item.comidaId());
        var id = UUID.randomUUID();
        var sql = """
            insert into meal_items
              (id, meal_section_id, produto_id, comida_id, name, quantity, calories, protein, unit, carbs, fat)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            returning id, produto_id, comida_id, name, quantity, calories, protein, unit, carbs, fat""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, id);
            s.setObject(2, sectionId);
            s.setObject(3, produtoId);
            s.setObject(4, comidaId);
            s.setString(5, item.name());
            s.setDouble(6, item.quantity());
            s.setInt(7, item.calories());
            s.setDouble(8, item.protein());
            s.setString(9, item.unit());
            s.setObject(10, item.carbs());
            s.setObject(11, item.fat());
            try (var rs = s.executeQuery()) {
                rs.next();
                return mapItem(rs);
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /**
     * Replicate a set of items across multiple dates in one section — the meal-prep
     * "aplicar na semana" flow. Reuses {@link #resolveSection} (lazy day+section create)
     * and {@link #addItem} (per-item ownership validation). Returns items inserted.
     */
    public int batchAdd(UUID userId, String section, List<LocalDate> dates, List<MealDay.MealItem> items) {
        if (dates == null || items == null) return 0;
        int inserted = 0;
        for (var date : dates) {
            var sectionId = resolveSection(userId, date, section);
            for (var it : items) { addItem(userId, sectionId, it); inserted++; }
        }
        return inserted;
    }

    public MealDay.MealItem updateItem(UUID userId, UUID itemId, MealDay.MealItem item) {
        requireItemOwned(userId, itemId);
        var produtoId = validateOwnedProduto(userId, item.produtoId());
        var comidaId  = validateOwnedComida(userId, item.comidaId());
        var sql = """
            update meal_items
               set produto_id = ?, comida_id = ?, name = ?, quantity = ?, calories = ?, protein = ?, unit = ?,
                   carbs = ?, fat = ?
             where id = ?
            returning id, produto_id, comida_id, name, quantity, calories, protein, unit, carbs, fat""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, produtoId);
            s.setObject(2, comidaId);
            s.setString(3, item.name());
            s.setDouble(4, item.quantity());
            s.setInt(5, item.calories());
            s.setDouble(6, item.protein());
            s.setString(7, item.unit());
            s.setObject(8, item.carbs());
            s.setObject(9, item.fat());
            s.setObject(10, itemId);
            try (var rs = s.executeQuery()) {
                rs.next();
                return mapItem(rs);
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public void deleteItem(UUID userId, UUID itemId) {
        var sql = """
            delete from meal_items
             where id = ?
               and meal_section_id in (
                 select s.id from meal_sections s
                   join meal_days d on d.id = s.meal_day_id
                  where d.user_id = ?
               )""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, itemId);
            s.setObject(2, userId);
            s.executeUpdate();
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /** Find a section on a given date by name; create if missing. */
    public UUID resolveSection(UUID userId, LocalDate date, String sectionName) {
        var dayId = ensureDay(userId, date);
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
        return addSection(userId, date, sectionName).id();
    }

    /**
     * Section names on {@code date} that already have at least one item, for the
     * reminder cron's "skip if logged" check. Compared against the canonical
     * section names ({@code "Café da manhã"}, {@code "Almoço"}, ...).
     */
    public Set<String> loggedSectionNamesOn(UUID userId, LocalDate date) {
        var sql = """
            select distinct s.name
              from meal_days d
              join meal_sections s on s.meal_day_id = d.id
              join meal_items   i on i.meal_section_id = s.id
             where d.user_id = ? and d.date = ?""";
        var out = new HashSet<String>();
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, userId);
            s.setDate(2, java.sql.Date.valueOf(date));
            try (var rs = s.executeQuery()) {
                while (rs.next()) out.add(rs.getString("name"));
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
        return out;
    }

    /**
     * A single section (name + items) owned by the user, or empty. Used by the feed
     * to snapshot a logged "prato" the author wants to share.
     */
    public Optional<MealDay.MealSection> sectionById(UUID userId, UUID sectionId) {
        var sql = """
            select s.id as section_id, s.name as section_name, s.order_index,
                   i.id as item_id, i.produto_id, i.comida_id, i.name as item_name,
                   i.quantity, i.calories, i.protein, i.unit, i.carbs, i.fat
              from meal_sections s
              join meal_days d on d.id = s.meal_day_id
              left join meal_items i on i.meal_section_id = s.id
             where s.id = ? and d.user_id = ?
             order by i.created_at asc""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, sectionId);
            s.setObject(2, userId);
            try (var rs = s.executeQuery()) {
                MealDay.MealSection sec = null;
                var items = new ArrayList<MealDay.MealItem>();
                while (rs.next()) {
                    if (sec == null) {
                        sec = new MealDay.MealSection(
                            (UUID) rs.getObject("section_id"),
                            rs.getString("section_name"),
                            rs.getInt("order_index"),
                            items);
                    }
                    if (rs.getObject("item_id") != null) items.add(mapItem(rs));
                }
                return Optional.ofNullable(sec);
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    private UUID ensureDay(UUID userId, LocalDate date) {
        try (var c = ds.getConnection()) {
            try (var s = c.prepareStatement(
                "select id from meal_days where user_id = ? and date = ?")) {
                s.setObject(1, userId);
                s.setDate(2, java.sql.Date.valueOf(date));
                try (var rs = s.executeQuery()) {
                    if (rs.next()) return (UUID) rs.getObject("id");
                }
            }
            var id = UUID.randomUUID();
            try (var s = c.prepareStatement(
                "insert into meal_days (id, user_id, date) values (?, ?, ?)")) {
                s.setObject(1, id);
                s.setObject(2, userId);
                s.setDate(3, java.sql.Date.valueOf(date));
                s.executeUpdate();
            }
            var sections = defaultSectionsFor(c, userId);
            for (int i = 0; i < sections.size(); i++) {
                try (var s = c.prepareStatement(
                    "insert into meal_sections (id, meal_day_id, name, order_index) values (?, ?, ?, ?)")) {
                    s.setObject(1, UUID.randomUUID());
                    s.setObject(2, id);
                    s.setString(3, sections.get(i));
                    s.setInt(4, i);
                    s.executeUpdate();
                }
            }
            return id;
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /**
     * The ordered section names a new day for this user should be seeded with: the
     * user's saved {@code profiles.default_sections}, falling back to the canonical
     * four when unset/empty. Reuses the caller's connection (we're mid-create).
     */
    private List<String> defaultSectionsFor(Connection c, UUID userId) {
        try (var s = c.prepareStatement("select default_sections from profiles where user_id = ?")) {
            s.setObject(1, userId);
            try (var rs = s.executeQuery()) {
                if (rs.next()) {
                    var arr = rs.getArray("default_sections");
                    if (arr != null) {
                        var out = new ArrayList<String>();
                        for (var v : (String[]) arr.getArray()) {
                            if (v != null && !v.isBlank()) out.add(v);
                        }
                        if (!out.isEmpty()) return out;
                    }
                }
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
        return DEFAULT_SECTIONS;
    }

    private MealDay load(UUID userId, UUID dayId, LocalDate date) {
        var sections = new LinkedHashMap<UUID, MealDay.MealSection>();
        var sql = """
            select s.id as section_id, s.name as section_name, s.order_index,
                   i.id as item_id, i.produto_id, i.comida_id, i.name as item_name,
                   i.quantity, i.calories, i.protein, i.unit, i.carbs, i.fat
              from meal_sections s
              join meal_days d on d.id = s.meal_day_id
              left join meal_items i on i.meal_section_id = s.id
             where s.meal_day_id = ? and d.user_id = ?
             order by s.order_index asc, i.created_at asc""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, dayId);
            s.setObject(2, userId);
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

    private void requireSectionOwned(UUID userId, UUID sectionId) {
        var sql = """
            select 1 from meal_sections s
              join meal_days d on d.id = s.meal_day_id
             where s.id = ? and d.user_id = ?""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, sectionId);
            s.setObject(2, userId);
            try (var rs = s.executeQuery()) {
                if (!rs.next()) throw new NotOwnedException("section not found or not owned");
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    private void requireItemOwned(UUID userId, UUID itemId) {
        var sql = """
            select 1 from meal_items i
              join meal_sections s on s.id = i.meal_section_id
              join meal_days     d on d.id = s.meal_day_id
             where i.id = ? and d.user_id = ?""";
        try (var c = ds.getConnection();
             var s = c.prepareStatement(sql)) {
            s.setObject(1, itemId);
            s.setObject(2, userId);
            try (var rs = s.executeQuery()) {
                if (!rs.next()) throw new NotOwnedException("item not found or not owned");
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /** Returns the produtoId if it belongs to the user, null if null was passed, or null + log otherwise. */
    private UUID validateOwnedProduto(UUID userId, UUID produtoId) {
        if (produtoId == null) return null;
        try (var c = ds.getConnection();
             var s = c.prepareStatement("select 1 from produtos where id = ? and user_id = ?")) {
            s.setObject(1, produtoId);
            s.setObject(2, userId);
            try (var rs = s.executeQuery()) {
                return rs.next() ? produtoId : null;
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    private UUID validateOwnedComida(UUID userId, UUID comidaId) {
        if (comidaId == null) return null;
        try (var c = ds.getConnection();
             var s = c.prepareStatement("select 1 from comidas where id = ? and user_id = ?")) {
            s.setObject(1, comidaId);
            s.setObject(2, userId);
            try (var rs = s.executeQuery()) {
                return rs.next() ? comidaId : null;
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    private static MealDay.MealItem mapItem(ResultSet rs) throws SQLException {
        return new MealDay.MealItem(
            (UUID) rs.getObject(rs.findColumn(hasColumn(rs, "item_id") ? "item_id" : "id")),
            (UUID) rs.getObject("produto_id"),
            (UUID) rs.getObject("comida_id"),
            rs.getString(hasColumn(rs, "item_name") ? "item_name" : "name"),
            rs.getDouble("quantity"),
            rs.getInt("calories"),
            rs.getDouble("protein"),
            rs.getString("unit"),
            (Double) rs.getObject("carbs"),
            (Double) rs.getObject("fat")
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
