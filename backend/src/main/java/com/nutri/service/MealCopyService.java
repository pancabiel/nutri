package com.nutri.service;

import com.nutri.model.MealDay;
import com.nutri.repository.MealRepository;
import io.quarkus.runtime.annotations.RegisterForReflection;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.text.Normalizer;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;

/**
 * "Repeat a meal": copy logged items between days/sections, and recommend what to copy
 * into an empty section ("o de sempre"). Pure DB work, no AI call, so it costs nothing
 * and never touches the chat caps.
 */
@ApplicationScoped
// Response DTOs nested inside other records; registered explicitly so native Jackson can serialize them.
@RegisterForReflection(targets = {
    MealCopyService.CopySummary.class, MealCopyService.Recommendations.class,
    MealCopyService.SectionRecommendation.class, MealCopyService.CopyOption.class
})
public class MealCopyService {

    private static final ZoneId ZONE = ZoneId.of("America/Sao_Paulo");
    /** How far back "o de sempre" looks. */
    static final int LOOKBACK_DAYS = 28;

    @Inject MealRepository meals;

    /**
     * Copy logged items from {@code fromDate} into {@code toDate}. No source section means the
     * whole day, mirrored section-by-section; otherwise one section goes to {@code toSection}
     * (null = same name). Items are re-inserted through {@link MealRepository#addItem}, which
     * re-validates produto/comida ownership.
     */
    public CopySummary copy(UUID uid, LocalDate fromDate, String fromSection, LocalDate toDate, String toSection) {
        var day = meals.find(uid, fromDate);
        var sources = new ArrayList<MealDay.MealSection>();
        String fromName = null;
        if (day.isPresent()) {
            if (fromSection == null) {
                sources.addAll(day.get().sections());
            } else {
                var match = matchSection(day.get().sections(), fromSection);
                if (match != null) { sources.add(match); fromName = match.name(); }
            }
        }
        if (fromName == null) fromName = fromSection;
        String toName = fromSection == null ? null : toSection != null ? toSection : fromName;

        int count = 0, cal = 0;
        double prot = 0;
        for (var src : sources) {
            if (src.items().isEmpty()) continue;
            var target = toName != null ? toName : src.name();
            // Copying a meal onto itself would just duplicate it.
            if (fromDate.equals(toDate) && target.equals(src.name())) continue;
            var sectionId = meals.resolveSection(uid, toDate, target);
            for (var it : src.items()) {
                meals.addItem(uid, sectionId, new MealDay.MealItem(
                    null, it.produtoId(), it.comidaId(), it.name(), it.quantity(),
                    it.calories(), it.protein(), it.unit(), it.carbs(), it.fat()));
                count++;
                cal += it.calories();
                prot += it.protein();
            }
        }
        return new CopySummary(fromDate, fromName, toDate, toName, count, cal, round1(prot));
    }

    /**
     * For each section still empty on {@code date}, what to copy into it: the meal eaten most
     * often in that section over the last {@link #LOOKBACK_DAYS} days (same day type, weekday vs
     * weekend, when there's history for it), plus yesterday's version when it differs.
     * {@code current} is the clock-based section, only when {@code date} is today.
     */
    public Recommendations recommend(UUID uid, LocalDate date) {
        var history = meals.loggedSectionsBetween(uid, date.minusDays(LOOKBACK_DAYS), date.minusDays(1));
        var target = meals.find(uid, date);
        var logged = new HashSet<String>();
        target.ifPresent(d -> d.sections().stream()
            .filter(s -> !s.items().isEmpty())
            .forEach(s -> logged.add(normalize(s.name()))));

        // Group history by section name, in the order sections usually appear.
        var byName = history.stream()
            .sorted(Comparator.comparingInt(h -> h.section().orderIndex()))
            .collect(Collectors.groupingBy(h -> normalize(h.section().name()), LinkedHashMap::new, Collectors.toList()));

        var out = new ArrayList<SectionRecommendation>();
        for (var e : byName.entrySet()) {
            if (logged.contains(e.getKey())) continue;
            var best = pick(e.getValue(), date);
            if (best == null) continue;
            var options = new ArrayList<CopyOption>();
            options.add(option(best.occurrence(), best.times()));
            var yesterday = e.getValue().stream().filter(h -> h.date().equals(date.minusDays(1))).findFirst();
            if (yesterday.isPresent() && !signature(yesterday.get().section()).equals(signature(best.occurrence().section()))) {
                options.add(option(yesterday.get(), 1));
            }
            // Name it as the target day calls it, so the copy lands in the existing section.
            var name = target.flatMap(d -> d.sections().stream()
                    .filter(s -> normalize(s.name()).equals(e.getKey())).findFirst())
                .map(MealDay.MealSection::name)
                .orElse(best.occurrence().section().name());
            out.add(new SectionRecommendation(name, options));
        }
        var today = LocalDate.now(ZONE);
        var current = date.equals(today) ? ChatService.defaultSection(LocalTime.now(ZONE)) : null;
        return new Recommendations(current, out);
    }

    /**
     * The most frequent meal (same set of items, quantities ignored) among {@code occurrences},
     * preferring the target's day type; ties go to the most recent. Returns its latest occurrence.
     */
    static Pick pick(List<MealRepository.DatedSection> occurrences, LocalDate target) {
        if (occurrences.isEmpty()) return null;
        boolean weekend = isWeekend(target);
        var pool = occurrences.stream().filter(o -> isWeekend(o.date()) == weekend).toList();
        if (pool.isEmpty()) pool = occurrences;
        var bySig = new HashMap<String, List<MealRepository.DatedSection>>();
        for (var o : pool) bySig.computeIfAbsent(signature(o.section()), k -> new ArrayList<>()).add(o);
        Pick best = null;
        for (var group : bySig.values()) {
            var latest = group.stream().max(Comparator.comparing(MealRepository.DatedSection::date)).orElseThrow();
            if (best == null || group.size() > best.times()
                || (group.size() == best.times() && latest.date().isAfter(best.occurrence().date()))) {
                best = new Pick(latest, group.size());
            }
        }
        return best;
    }

    static String signature(MealDay.MealSection s) {
        return s.items().stream()
            .map(i -> i.produtoId() != null ? "p:" + i.produtoId()
                : i.comidaId() != null ? "c:" + i.comidaId()
                : "n:" + normalize(i.name()))
            .sorted()
            .collect(Collectors.joining("|"));
    }

    private static CopyOption option(MealRepository.DatedSection h, int times) {
        var items = h.section().items();
        return new CopyOption(
            h.date(),
            h.section().name(),
            items.stream().map(MealDay.MealItem::name).toList(),
            items.stream().mapToInt(MealDay.MealItem::calories).sum(),
            round1(items.stream().mapToDouble(MealDay.MealItem::protein).sum()),
            times);
    }

    private static boolean isWeekend(LocalDate d) {
        return d.getDayOfWeek() == DayOfWeek.SATURDAY || d.getDayOfWeek() == DayOfWeek.SUNDAY;
    }

    /** Accent/case-insensitive: exact name first, then either containing the other ("café" ~ "Café da manhã"). */
    static MealDay.MealSection matchSection(List<MealDay.MealSection> sections, String wanted) {
        var w = normalize(wanted);
        for (var s : sections) if (normalize(s.name()).equals(w)) return s;
        for (var s : sections) {
            var n = normalize(s.name());
            if (n.contains(w) || w.contains(n)) return s;
        }
        return null;
    }

    static String normalize(String s) {
        return Normalizer.normalize(s == null ? "" : s, Normalizer.Form.NFD)
            .replaceAll("\\p{M}", "")
            .toLowerCase(Locale.ROOT)
            .trim();
    }

    private static double round1(double v) { return Math.round(v * 10.0) / 10.0; }

    record Pick(MealRepository.DatedSection occurrence, int times) {}

    /** One "repeat" block. fromSection/toSection null = whole day (mirrored). items = 0 when nothing was found. */
    public record CopySummary(
        LocalDate fromDate,
        String fromSection,
        LocalDate toDate,
        String toSection,
        int items,
        int calories,
        double protein
    ) {}

    public record Recommendations(String current, List<SectionRecommendation> sections) {}

    /** options[0] is the recommended one; options[1], when present, is yesterday's (different) version. */
    public record SectionRecommendation(String section, List<CopyOption> options) {}

    /** times = how often this exact meal appeared in the lookback window (same day type). */
    public record CopyOption(
        LocalDate fromDate,
        String fromSection,
        List<String> items,
        int calories,
        double protein,
        int times
    ) {}
}
