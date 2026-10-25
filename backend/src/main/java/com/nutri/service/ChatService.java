package com.nutri.service;

import com.nutri.ai.AiService;
import com.nutri.auth.CurrentUser;
import com.nutri.model.Comida;
import com.nutri.model.MealDay;
import com.nutri.model.Produto;
import com.nutri.repository.ComidaRepository;
import com.nutri.repository.MealRepository;
import com.nutri.repository.ProdutoRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@ApplicationScoped
public class ChatService {

    // Lambda runs in UTC; the app is Brazil-only. "Hoje" / time-of-day defaults
    // must be resolved in the user's wall-clock zone or 22h local becomes "tomorrow".
    private static final ZoneId ZONE = ZoneId.of("America/Sao_Paulo");

    @Inject AiService ai;
    @Inject ProdutoRepository produtos;
    @Inject ComidaRepository comidas;
    @Inject MealRepository meals;
    @Inject CurrentUser user;
    @Inject MealCopyService copier;

    // Window for the "uses" count that tells the AI which produto is the user's default
    // (matches the "last 60 days" wording in AiService's chat prompt).
    private static final int USAGE_WINDOW_DAYS = 60;

    // "comi o MESMO de ontem", "REPETI o almoço", "IGUAL a ontem"... Matched on the
    // accent-stripped, lowercased message. Only gates whether the copy hint is sent to
    // the AI, so a false positive costs a few tokens, never a wrong copy.
    private static final Pattern COPY_KEYWORDS = Pattern.compile(
        "\\b(mesm[oa]s?|igua(l|is)|repet\\w*|copi\\w*|de novo|novamente|outra vez)\\b");

    public ChatResult log(String message, LocalDate date, String section) {
        var uid     = user.userId();
        var today   = LocalDate.now(ZONE);
        var prods   = produtos.all(uid);
        var coms    = comidas.all(uid);
        var hint    = wantsCopy(message) ? AiService.copyHint(today) : null;
        var usage   = meals.usageCountsSince(uid, today.minusDays(USAGE_WINDOW_DAYS));
        var parsed  = ai.parseChat(message, prods, coms, hint, meals.defaultSectionNames(uid), usage);
        var items   = fillComidaMacros(parsed.items(), prods, coms);

        var theDate = resolveDate(date, parsed, today);
        var sec     = resolveSection(section, parsed);

        var explicitSection = section != null && !section.isBlank() ? section : null;
        var copies = new ArrayList<MealCopyService.CopySummary>();
        for (var cr : parsed.copies()) {
            // Single-section copy target: explicit section (HTTP body) > AI's to_section > same as source.
            var to = cr.fromSection() == null ? null
                : explicitSection != null ? explicitSection
                : cr.toSection();
            copies.add(copier.copy(uid, today.plusDays(cr.fromDateOffsetDays()), cr.fromSection(), theDate, to));
        }

        // Pure copy ("comi o mesmo de ontem"): don't lazily create a day/section for zero items.
        var base = items.isEmpty()
            ? new ChatResult(items, List.of(), sec, theDate, new Totals(0, 0), List.of())
            : persist(uid, items, theDate, sec);
        int cal = base.totals().calories() + copies.stream().mapToInt(MealCopyService.CopySummary::calories).sum();
        double prot = base.totals().protein() + copies.stream().mapToDouble(MealCopyService.CopySummary::protein).sum();
        return new ChatResult(base.parsed(), base.saved(), base.section(), theDate,
            new Totals(cal, Math.round(prot * 10.0) / 10.0), copies);
    }

    static boolean wantsCopy(String message) {
        return message != null && COPY_KEYWORDS.matcher(MealCopyService.normalize(message)).find();
    }

    /**
     * Analyze a meal photo and persist the items. "Ontem à noite" in the note lands on
     * yesterday's Jantar, same priority as {@link #log}; no note → today, clock-based section.
     */
    public ChatResult logPhoto(String base64Image, String mediaType, String note) {
        var uid    = user.userId();
        var parsed = ai.analyzeMealImage(base64Image, mediaType, note, meals.defaultSectionNames(uid));
        var theDate = resolveDate(null, parsed, LocalDate.now(ZONE));
        var sec     = resolveSection(null, parsed);
        if (parsed.items().isEmpty()) {
            return new ChatResult(List.of(), List.of(), sec, theDate, new Totals(0, 0), List.of());
        }
        return persist(uid, parsed.items(), theDate, sec);
    }

    /** Date: explicit > AI-inferred offset from today > today. */
    private static LocalDate resolveDate(LocalDate date, AiService.ParseResult parsed, LocalDate today) {
        if (date != null) return date;
        if (parsed.dateOffsetDays() != null) return today.plusDays(parsed.dateOffsetDays());
        return today;
    }

    /** Section: explicit > AI-inferred from text > clock-based default. */
    private static String resolveSection(String section, AiService.ParseResult parsed) {
        if (section != null && !section.isBlank()) return section;
        if (parsed.section() != null && !parsed.section().isBlank()) return parsed.section();
        return defaultSection(LocalTime.now(ZONE));
    }

    private ChatResult persist(UUID uid, List<AiService.ParsedItem> items, LocalDate theDate, String sec) {
        var resolved = meals.resolveSectionNamed(uid, theDate, sec);
        var sectionId = resolved.id();
        sec = resolved.name();
        var saved = new ArrayList<MealDay.MealItem>();
        for (var p : items) {
            boolean isProduto = "produto".equalsIgnoreCase(p.type());
            double qty = isProduto ? p.estimated_grams() : p.quantity();
            saved.add(meals.addItem(uid, sectionId, new MealDay.MealItem(
                null,
                isProduto ? parseUuid(p.matched_id()) : null,
                "comida".equalsIgnoreCase(p.type()) ? parseUuid(p.matched_id()) : null,
                p.name(),
                qty,
                p.calories(),
                p.protein(),
                isProduto ? "g" : "porcao",
                p.carbs(),
                p.fat()
            )));
        }
        var totalCal = items.stream().mapToInt(AiService.ParsedItem::calories).sum();
        var totalProt = items.stream().mapToDouble(AiService.ParsedItem::protein).sum();
        return new ChatResult(items, saved, sec, theDate, new Totals(totalCal, totalProt), List.of());
    }

    /**
     * The AI sees comidas only as {id, name}, so it can't fill calories/protein for a matched
     * comida. Recompute from the comida's composition × the underlying produtos' per-gram macros,
     * scaled by the parsed quantity (defaulting to 1 serving).
     */
    private static List<AiService.ParsedItem> fillComidaMacros(
            List<AiService.ParsedItem> items, List<Produto> prods, List<Comida> coms) {
        Map<UUID, Produto> prodById = prods.stream().collect(Collectors.toMap(Produto::id, Function.identity()));
        Map<UUID, Comida> comById = coms.stream().collect(Collectors.toMap(Comida::id, Function.identity()));
        var out = new ArrayList<AiService.ParsedItem>(items.size());
        for (var p : items) {
            if (!"comida".equalsIgnoreCase(p.type())) { out.add(p); continue; }
            var cid = parseUuid(p.matched_id());
            var comida = cid == null ? null : comById.get(cid);
            if (comida == null) { out.add(p); continue; }
            double cal = 0, prot = 0, carbs = 0, fat = 0;
            for (var ci : comida.items()) {
                var prod = prodById.get(ci.produtoId());
                if (prod == null) continue;
                cal += prod.caloriesPerGram() * ci.quantityGrams();
                prot += prod.proteinPerGram() * ci.quantityGrams();
                if (prod.carbsPerGram() != null) carbs += prod.carbsPerGram() * ci.quantityGrams();
                if (prod.fatPerGram()   != null) fat   += prod.fatPerGram()   * ci.quantityGrams();
            }
            double servings = p.quantity() > 0 ? p.quantity() : 1.0;
            out.add(new AiService.ParsedItem(
                p.type(), p.matched_id(), p.name(),
                p.quantity(), p.estimated_grams(),
                (int) Math.round(cal * servings),
                Math.round(prot * servings * 10.0) / 10.0,
                Math.round(carbs * servings * 10.0) / 10.0,
                Math.round(fat * servings * 10.0) / 10.0
            ));
        }
        return out;
    }

    public static String defaultSection(LocalTime t) {
        if (t.getHour() < 10) return "Café da manhã";
        if (t.getHour() < 15) return "Almoço";
        if (t.getHour() < 19) return "Lanche";
        return "Jantar";
    }

    private static UUID parseUuid(String s) {
        if (s == null || s.isBlank() || "null".equalsIgnoreCase(s)) return null;
        try { return UUID.fromString(s); } catch (Exception e) { return null; }
    }

    public record ChatResult(
        List<AiService.ParsedItem> parsed,
        List<MealDay.MealItem> saved,
        String section,
        LocalDate date,
        Totals totals,
        List<MealCopyService.CopySummary> copied
    ) {}
    public record Totals(int calories, double protein) {}
}
