package com.nutri.service;

import com.nutri.ai.AiService;
import com.nutri.model.Produto;
import com.nutri.repository.ProdutoRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.util.Map;
import java.util.UUID;

/**
 * Shared "match an owned produto, or create one from the AI's per-100g estimate" step
 * used by the free-text parsers ({@link MarmitaService}, {@link ComidaService}). The
 * created produto is persisted immediately (the user opted into auto-cadastro), so the
 * returned id is real and owned.
 */
@ApplicationScoped
public class ProdutoResolver {

    @Inject ProdutoRepository produtos;

    /** Outcome of resolving one parsed ingredient: the produto id and whether it was just created. */
    public record Ref(UUID id, boolean created) {}

    /**
     * Resolve a parsed item to a produto. If it matched a produto the user owns, return that id.
     * Otherwise create a produto from the estimated per-100g macros (converted to per-gram).
     */
    public Ref resolve(UUID uid, AiService.MarmitaItem it, Map<UUID, Produto> prodById) {
        var mid = parseUuid(it.matched_id());
        if ("produto".equalsIgnoreCase(it.type()) && mid != null && prodById.containsKey(mid)) {
            return new Ref(mid, false);
        }
        double calPerGram  = (it.calories_per_100g() == null ? 0.0 : it.calories_per_100g()) / 100.0;
        double protPerGram = (it.protein_per_100g()  == null ? 0.0 : it.protein_per_100g())  / 100.0;
        var p = produtos.create(uid, new Produto(
            null, safeName(it.name()), null,
            calPerGram, protPerGram, null, null, null, null, null));
        return new Ref(p.id(), true);
    }

    public static double gramsOrDefault(double q) { return q > 0 ? q : 100; }

    public static UUID parseUuid(String s) {
        if (s == null || s.isBlank() || "null".equalsIgnoreCase(s)) return null;
        try { return UUID.fromString(s); } catch (Exception e) { return null; }
    }

    public static String safeName(String s) {
        if (s == null || s.isBlank()) return "Ingrediente";
        return s.length() > 120 ? s.substring(0, 120) : s;
    }
}
