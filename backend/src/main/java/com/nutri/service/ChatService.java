package com.nutri.service;

import com.nutri.ai.AiService;
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
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@ApplicationScoped
public class ChatService {

    @Inject AiService ai;
    @Inject ProdutoRepository produtos;
    @Inject ComidaRepository comidas;
    @Inject MealRepository meals;

    public ChatResult log(String message, LocalDate date, String section) {
        var prods   = produtos.all();
        var coms    = comidas.all();
        var parsed  = ai.parseChat(message, prods, coms);
        var items   = fillComidaMacros(parsed.items(), prods, coms);

        // Date: explicit > AI-inferred offset from today > today.
        LocalDate theDate;
        if (date != null) {
            theDate = date;
        } else if (parsed.dateOffsetDays() != null) {
            theDate = LocalDate.now().plusDays(parsed.dateOffsetDays());
        } else {
            theDate = LocalDate.now();
        }

        // Section: explicit > AI-inferred from text > clock-based default.
        String sec;
        if (section != null && !section.isBlank()) {
            sec = section;
        } else if (parsed.section() != null && !parsed.section().isBlank()) {
            sec = parsed.section();
        } else {
            sec = defaultSection(LocalTime.now());
        }

        return persist(items, theDate, sec);
    }

    /** Persist already-parsed items (e.g. from a meal-photo analysis) to today's meal day. */
    public ChatResult saveParsed(List<AiService.ParsedItem> items, LocalDate date, String section) {
        var theDate = date != null ? date : LocalDate.now();
        var sec = (section != null && !section.isBlank()) ? section : defaultSection(LocalTime.now());
        return persist(items, theDate, sec);
    }

    private ChatResult persist(List<AiService.ParsedItem> items, LocalDate theDate, String sec) {
        var sectionId = meals.resolveSection(theDate, sec);
        var saved = new ArrayList<MealDay.MealItem>();
        for (var p : items) {
            boolean isProduto = "produto".equalsIgnoreCase(p.type());
            double qty = isProduto ? p.estimated_grams() : p.quantity();
            saved.add(meals.addItem(sectionId, new MealDay.MealItem(
                null,
                isProduto ? parseUuid(p.matched_id()) : null,
                "comida".equalsIgnoreCase(p.type()) ? parseUuid(p.matched_id()) : null,
                p.name(),
                qty,
                p.calories(),
                p.protein()
            )));
        }
        var totalCal = items.stream().mapToInt(AiService.ParsedItem::calories).sum();
        var totalProt = items.stream().mapToDouble(AiService.ParsedItem::protein).sum();
        return new ChatResult(items, saved, sec, theDate, new Totals(totalCal, totalProt));
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
            double cal = 0, prot = 0;
            for (var ci : comida.items()) {
                var prod = prodById.get(ci.produtoId());
                if (prod == null) continue;
                cal += prod.caloriesPerGram() * ci.quantityGrams();
                prot += prod.proteinPerGram() * ci.quantityGrams();
            }
            double servings = p.quantity() > 0 ? p.quantity() : 1.0;
            out.add(new AiService.ParsedItem(
                p.type(), p.matched_id(), p.name(),
                p.quantity(), p.estimated_grams(),
                (int) Math.round(cal * servings),
                Math.round(prot * servings * 10.0) / 10.0
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
        Totals totals
    ) {}
    public record Totals(int calories, double protein) {}
}
