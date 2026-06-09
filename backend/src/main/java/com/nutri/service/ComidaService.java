package com.nutri.service;

import com.nutri.ai.AiService;
import com.nutri.auth.CurrentUser;
import com.nutri.model.Comida;
import com.nutri.model.Produto;
import com.nutri.repository.ProdutoRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Turns a free-text recipe ("sub-receita" / cooked batch) into a draft {@link Comida} —
 * a list of produto items in grams plus a yield (peso pronto) — matching ingredients
 * against the user's produtos and lazily creating a produto for anything new (the AI
 * estimates its per-100g macros).
 *
 * It does NOT persist the comida — it returns a {@link Draft} the frontend pre-fills into
 * the comida editor for review before saving. The produtos, however, are created immediately
 * (the user opted into auto-cadastro), so the draft's items reference real, owned IDs.
 */
@ApplicationScoped
public class ComidaService {

    @Inject AiService ai;
    @Inject ProdutoRepository produtos;
    @Inject ProdutoResolver resolver;
    @Inject CurrentUser user;

    public Draft fromText(String text) {
        var uid = user.userId();
        if (text == null || text.isBlank()) return new Draft(null, List.of(), null, 0);

        var prods = produtos.all(uid);
        var prodById = prods.stream().collect(Collectors.toMap(Produto::id, Function.identity()));

        var parsed = ai.parseComida(text, prods);

        var items = new ArrayList<Comida.ComidaProduto>();
        int created = 0;
        double sumGrams = 0;
        for (var it : parsed.items()) {
            var ref = resolver.resolve(uid, it, prodById);
            if (ref.created()) created++;
            double g = ProdutoResolver.gramsOrDefault(it.quantity());
            items.add(new Comida.ComidaProduto(ref.id(), g));
            sumGrams += g;
        }

        // Yield defaults to the sum of the raw ingredient grams (per the locked plan:
        // "yield = soma dos crus") when the user didn't state a finished weight.
        Double yield = parsed.yieldGrams() != null && parsed.yieldGrams() > 0
            ? parsed.yieldGrams()
            : (sumGrams > 0 ? sumGrams : null);

        return new Draft(parsed.name(), items, yield, created);
    }

    /** A non-persisted comida the frontend opens in the editor for review before saving. */
    public record Draft(String name, List<Comida.ComidaProduto> items, Double yieldGrams, int newProdutos) {}
}
