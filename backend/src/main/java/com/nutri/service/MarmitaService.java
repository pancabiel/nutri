package com.nutri.service;

import com.nutri.ai.AiService;
import com.nutri.auth.CurrentUser;
import com.nutri.model.Comida;
import com.nutri.model.MealTemplate;
import com.nutri.model.Produto;
import com.nutri.repository.ComidaRepository;
import com.nutri.repository.ProdutoRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Turns a free-text marmita description into a draft set of {@link MealTemplate.TemplateItem}s,
 * matching ingredients against the user's produtos/comidas and lazily creating a produto for
 * any ingredient the chat parser couldn't match (the AI estimates its per-100g macros).
 *
 * It does NOT persist the template — it returns a {@link Draft} that the frontend pre-fills
 * into the marmita editor so the user can review quantities/name before saving. The produtos,
 * however, are created immediately (the user opted into auto-cadastro), so the draft's items
 * reference real, owned IDs that {@code MealTemplateRepository} will accept.
 */
@ApplicationScoped
public class MarmitaService {

    @Inject AiService ai;
    @Inject ProdutoRepository produtos;
    @Inject ComidaRepository comidas;
    @Inject ProdutoResolver resolver;
    @Inject CurrentUser user;

    public Draft fromText(String text) {
        var uid = user.userId();
        if (text == null || text.isBlank()) return new Draft(null, List.of(), 0);

        var prods = produtos.all(uid);
        var coms  = comidas.all(uid);
        var prodById = prods.stream().collect(Collectors.toMap(Produto::id, Function.identity()));
        var comById  = coms.stream().collect(Collectors.toMap(Comida::id, Function.identity()));

        var parsed = ai.parseMarmita(text, prods, coms);

        var items = new ArrayList<MealTemplate.TemplateItem>();
        int created = 0;
        for (var it : parsed.items()) {
            var mid = ProdutoResolver.parseUuid(it.matched_id());

            // Matched comida the user owns → reference it. Grams only if it has a yield;
            // otherwise fall back to porções (matches snapshotItem's client-side rule).
            if ("comida".equalsIgnoreCase(it.type()) && mid != null && comById.containsKey(mid)) {
                var comida = comById.get(mid);
                boolean canGram = "g".equalsIgnoreCase(it.unit())
                    && comida.yieldGrams() != null && comida.yieldGrams() > 0;
                if (canGram) {
                    items.add(new MealTemplate.TemplateItem(null, mid, ProdutoResolver.gramsOrDefault(it.quantity()), "g"));
                } else {
                    items.add(new MealTemplate.TemplateItem(null, mid, portionsOrDefault(it.quantity()), "porcao"));
                }
                continue;
            }

            // produto match or new → resolve to an owned produto (always grams).
            var ref = resolver.resolve(uid, it, prodById);
            if (ref.created()) created++;
            items.add(new MealTemplate.TemplateItem(ref.id(), null, ProdutoResolver.gramsOrDefault(it.quantity()), "g"));
        }

        return new Draft(parsed.name(), items, created);
    }

    private static double portionsOrDefault(double q) { return q > 0 ? q : 1; }

    /** A non-persisted marmita the frontend opens in the editor for review before saving. */
    public record Draft(String name, List<MealTemplate.TemplateItem> items, int newProdutos) {}
}
