package com.nutri.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nutri.auth.CurrentUser;
import com.nutri.model.Comida;
import com.nutri.model.FeedPost;
import com.nutri.model.MealTemplate;
import com.nutri.model.Produto;
import com.nutri.repository.ComidaRepository;
import com.nutri.repository.FeedRepository;
import com.nutri.repository.MealTemplateRepository;
import com.nutri.repository.ProdutoRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.NotFoundException;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * "Salvar na minha conta": materializes a post's frozen {@code snapshot} into the
 * viewer's OWN library, reusing the existing {@code create} paths (which enforce
 * ownership). Because it works only from the self-contained snapshot, it never reads
 * the author's private rows. Produtos are deduped by case-insensitive name so saving
 * twice (or saving a comida whose ingredients you already own) doesn't pile up copies.
 */
@ApplicationScoped
public class SaveRecipeService {

    @Inject CurrentUser user;
    @Inject FeedRepository feed;
    @Inject ProdutoRepository produtos;
    @Inject ComidaRepository comidas;
    @Inject MealTemplateRepository templates;
    @Inject ObjectMapper mapper;

    public SaveResult save(UUID postId) {
        var viewer = user.userId();
        // byId is authorized: viewer must own the post or follow the author.
        var post = feed.byId(viewer, postId)
            .orElseThrow(() -> new NotFoundException("post not found or not visible"));
        var refType = post.refType();
        // FeedPost.snapshot is a plain Object (Maps/Lists) for native-safe serialization;
        // convert back to a JsonNode here for the navigation helpers below.
        JsonNode snap = post.snapshot() == null ? null : mapper.valueToTree(post.snapshot());
        if (refType == null || snap == null)
            throw new BadRequestException("post has no recipe to save");

        return switch (refType) {
            case "produto" -> saveProduto(viewer, snap);
            case "comida"  -> saveComida(viewer, snap);
            case "marmita" -> saveMarmita(viewer, snap);
            case "prato"   -> savePrato(viewer, snap);
            default -> throw new BadRequestException("unknown refType: " + refType);
        };
    }

    private SaveResult saveProduto(UUID viewer, JsonNode n) {
        var p = produtoFromNode(viewer, n);
        return new SaveResult("produto", p.name());
    }

    private SaveResult saveComida(UUID viewer, JsonNode n) {
        var name = str(n, "name", "Receita");
        var items = new ArrayList<Comida.ComidaProduto>();
        for (var ing : n.path("ingredients")) {
            var p = produtoFromNode(viewer, ing);
            items.add(new Comida.ComidaProduto(p.id(), dbl(ing, "grams", 0)));
        }
        var created = comidas.create(viewer, new Comida(null, name, items, dblOrNull(n, "yieldGrams"), null));
        return new SaveResult("comida", created.name());
    }

    private SaveResult saveMarmita(UUID viewer, JsonNode n) {
        var name = str(n, "name", "Marmita");
        var items = new ArrayList<MealTemplate.TemplateItem>();
        for (var it : n.path("items")) {
            var kind = str(it, "kind", "");
            double qty = dbl(it, "quantity", 0);
            String unit = str(it, "unit", "g");
            switch (kind) {
                case "produto" -> {
                    var p = produtoFromNode(viewer, it);
                    items.add(new MealTemplate.TemplateItem(p.id(), null, qty, unit));
                }
                case "comida" -> {
                    var comidaNode = it.path("comida");
                    var cItems = new ArrayList<Comida.ComidaProduto>();
                    for (var ing : comidaNode.path("ingredients")) {
                        var p = produtoFromNode(viewer, ing);
                        cItems.add(new Comida.ComidaProduto(p.id(), dbl(ing, "grams", 0)));
                    }
                    var c = comidas.create(viewer, new Comida(null, str(comidaNode, "name", "Receita"),
                        cItems, dblOrNull(comidaNode, "yieldGrams"), null));
                    items.add(new MealTemplate.TemplateItem(null, c.id(), qty, unit));
                }
                case "grupo" -> {
                    var group = new ArrayList<MealTemplate.GroupProduto>();
                    for (var ing : it.path("ingredients")) {
                        var p = produtoFromNode(viewer, ing);
                        group.add(new MealTemplate.GroupProduto(p.id(), dbl(ing, "grams", 0)));
                    }
                    items.add(new MealTemplate.TemplateItem(null, null, qty, unit,
                        str(it, "name", "Grupo"), dblOrNull(it, "groupYieldGrams"),
                        group.isEmpty() ? null : group));
                }
                default -> { /* unknown item kind — skip */ }
            }
        }
        var created = templates.create(viewer, new MealTemplate(null, name, items, null));
        return new SaveResult("marmita", created.name());
    }

    /**
     * A logged "prato" only carries per-item totals, not per-gram macros. Best-effort:
     * materialize each item as a produto with per-gram macros derived from totals/quantity
     * (treating the quantity as grams). Logging it straight into a day is a follow-up.
     */
    private SaveResult savePrato(UUID viewer, JsonNode n) {
        int saved = 0;
        for (var it : n.path("items")) {
            double qty = dbl(it, "quantity", 0);
            if (qty <= 0) continue;
            int calories = (int) Math.round(dbl(it, "calories", 0));
            double protein = dbl(it, "protein", 0);
            Double carbs = dblOrNull(it, "carbs");
            Double fat = dblOrNull(it, "fat");
            getOrCreateProduto(viewer, str(it, "name", "Item"), null,
                calories / qty, protein / qty,
                carbs == null ? null : carbs / qty,
                fat == null ? null : fat / qty,
                null, null);
            saved++;
        }
        return new SaveResult("prato", str(n, "section", "Prato") + " (" + saved + " itens)");
    }

    /** Materializes a produto node (name + perGram macros), reusing an existing same-name produto. */
    private Produto produtoFromNode(UUID viewer, JsonNode n) {
        return getOrCreateProduto(viewer,
            str(n, "name", "Item"),
            str(n, "brand", null),
            dbl(n, "caloriesPerGram", 0),
            dbl(n, "proteinPerGram", 0),
            dblOrNull(n, "carbsPerGram"),
            dblOrNull(n, "fatPerGram"),
            dblOrNull(n, "servingGrams"),
            str(n, "servingLabel", null));
    }

    private Produto getOrCreateProduto(UUID viewer, String name, String brand,
                                       double calPerGram, double protPerGram,
                                       Double carbsPerGram, Double fatPerGram,
                                       Double servingGrams, String servingLabel) {
        var existing = produtos.byName(viewer, name);
        if (existing.isPresent()) return existing.get();
        return produtos.create(viewer, new Produto(null, name, brand,
            calPerGram, protPerGram, carbsPerGram, fatPerGram, servingGrams, servingLabel, null));
    }

    private static String str(JsonNode n, String field, String dflt) {
        return n.hasNonNull(field) ? n.get(field).asText() : dflt;
    }

    private static double dbl(JsonNode n, String field, double dflt) {
        return n.hasNonNull(field) ? n.get(field).asDouble() : dflt;
    }

    private static Double dblOrNull(JsonNode n, String field) {
        return n.hasNonNull(field) ? n.get(field).asDouble() : null;
    }

    /** Returned to the frontend so it can toast "Salvo: <name>". */
    public record SaveResult(String type, String name) {}
}
