package com.nutri.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.nutri.auth.CurrentUser;
import com.nutri.model.Comida;
import com.nutri.model.FeedPost;
import com.nutri.model.MealDay;
import com.nutri.model.MealTemplate;
import com.nutri.model.Produto;
import com.nutri.repository.ComidaRepository;
import com.nutri.repository.FeedRepository;
import com.nutri.repository.FollowRepository;
import com.nutri.repository.MealRepository;
import com.nutri.repository.MealTemplateRepository;
import com.nutri.repository.ProdutoRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.BadRequestException;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Orchestrates the feed. The key invariant lives here: when a post references an
 * entity (produto/comida/marmita/prato), the backend reads that entity <b>from the
 * author's own library</b> (inside normal per-user isolation) and <b>denormalizes</b>
 * it into a self-contained {@code snapshot} JSON — names + grams + macros, with no
 * {@code produto_id}/{@code comida_id} of anyone. Viewing or saving the post then
 * reads only the snapshot, so it never touches another user's private library.
 *
 * <p>The one sanctioned cross-tenant read (a follower reading an author's posts)
 * lives in {@link FeedRepository#feed}; everything else is owner-scoped.
 */
@ApplicationScoped
public class FeedService {

    static final int PAGE_SIZE = 20;

    @Inject ObjectMapper mapper;
    @Inject CurrentUser user;
    @Inject FeedRepository feed;
    @Inject FollowRepository follows;
    @Inject ProdutoRepository produtos;
    @Inject ComidaRepository comidas;
    @Inject MealTemplateRepository templates;
    @Inject MealRepository meals;

    /** Author's followees + the author themselves (added in-app, not via OR, for index use). */
    public List<FeedPost> feed(java.time.OffsetDateTime beforeCreatedAt, UUID beforeId, int limit) {
        var uid = user.userId();
        var authors = new ArrayList<>(follows.followingIds(uid));
        authors.add(uid);
        return feed.feed(uid, authors, beforeCreatedAt, beforeId, limit);
    }

    public Optional<FeedPost> byId(UUID id) {
        return feed.byId(user.userId(), id);
    }

    /**
     * Creates a post. If {@code refType}/{@code refId} are set, reads the entity from the
     * author's library and freezes a denormalized snapshot. Returns the created post.
     */
    public FeedPost create(FeedPost.CreateRequest req) {
        var uid = user.userId();
        String refType = req == null ? null : normalizeRefType(req.refType());
        String snapshotJson = null;
        if (refType != null) {
            if (req.refId() == null) throw new BadRequestException("refId required for refType " + refType);
            JsonNode snap = buildSnapshot(uid, refType, req.refId());
            try { snapshotJson = mapper.writeValueAsString(snap); }
            catch (Exception e) { throw new RuntimeException(e); }
        }
        String caption = req == null ? null : req.caption();
        String imageUrl = req == null ? null : req.imageUrl();
        if ((caption == null || caption.isBlank()) && (imageUrl == null || imageUrl.isBlank()) && refType == null)
            throw new BadRequestException("post needs a caption, image or attached recipe");
        UUID id = feed.create(uid, caption, imageUrl, refType, snapshotJson);
        return feed.byId(uid, id).orElseThrow();
    }

    public void delete(UUID id) {
        feed.delete(user.userId(), id);
    }

    public void like(UUID id)   { feed.like(user.userId(), id); }
    public void unlike(UUID id) { feed.unlike(user.userId(), id); }

    private static String normalizeRefType(String t) {
        if (t == null || t.isBlank()) return null;
        t = t.trim().toLowerCase();
        return switch (t) {
            case "produto", "comida", "marmita", "prato" -> t;
            default -> throw new BadRequestException("unknown refType: " + t);
        };
    }

    // ---- snapshot construction (reads ONLY the author's own entities) ----

    JsonNode buildSnapshot(UUID authorId, String refType, UUID refId) {
        return switch (refType) {
            case "produto" -> produtoSnapshot(authorId, refId);
            case "comida"  -> comidaSnapshot(authorId, refId);
            case "marmita" -> marmitaSnapshot(authorId, refId);
            case "prato"   -> pratoSnapshot(authorId, refId);
            default -> throw new BadRequestException("unknown refType: " + refType);
        };
    }

    private ObjectNode produtoSnapshot(UUID authorId, UUID id) {
        var p = produtos.byId(authorId, id)
            .orElseThrow(() -> new BadRequestException("produto not found"));
        return produtoNode(p);
    }

    private ObjectNode produtoNode(Produto p) {
        var n = mapper.createObjectNode();
        n.put("name", p.name());
        if (p.brand() != null) n.put("brand", p.brand());
        n.put("caloriesPerGram", p.caloriesPerGram());
        n.put("proteinPerGram", p.proteinPerGram());
        putNullable(n, "carbsPerGram", p.carbsPerGram());
        putNullable(n, "fatPerGram", p.fatPerGram());
        putNullable(n, "servingGrams", p.servingGrams());
        if (p.servingLabel() != null) n.put("servingLabel", p.servingLabel());
        return n;
    }

    private ObjectNode comidaSnapshot(UUID authorId, UUID id) {
        var c = comidas.byId(authorId, id)
            .orElseThrow(() -> new BadRequestException("comida not found"));
        return comidaNode(authorId, c);
    }

    /** Builds a comida snapshot, resolving each ingredient produto's macros from the author's library. */
    private ObjectNode comidaNode(UUID authorId, Comida c) {
        var n = mapper.createObjectNode();
        n.put("name", c.name());
        putNullable(n, "yieldGrams", c.yieldGrams());
        ArrayNode ings = n.putArray("ingredients");
        for (var it : c.items()) {
            var p = produtos.byId(authorId, it.produtoId()).orElse(null);
            if (p == null) continue;   // produto deleted/not owned — skip, snapshot stays self-contained
            var ing = ings.addObject();
            ing.put("name", p.name());
            ing.put("grams", it.quantityGrams());
            ing.put("caloriesPerGram", p.caloriesPerGram());
            ing.put("proteinPerGram", p.proteinPerGram());
            putNullable(ing, "carbsPerGram", p.carbsPerGram());
            putNullable(ing, "fatPerGram", p.fatPerGram());
        }
        return n;
    }

    private ObjectNode marmitaSnapshot(UUID authorId, UUID id) {
        var t = templates.byId(authorId, id)
            .orElseThrow(() -> new BadRequestException("marmita not found"));
        var n = mapper.createObjectNode();
        n.put("name", t.name());
        ArrayNode items = n.putArray("items");
        for (var it : t.items()) {
            boolean isGroup = it.groupName() != null && !it.groupName().isBlank();
            if (isGroup) {
                var node = items.addObject();
                node.put("kind", "grupo");
                node.put("name", it.groupName());
                node.put("quantity", it.quantity());
                node.put("unit", it.unit() == null ? "g" : it.unit());
                putNullable(node, "groupYieldGrams", it.groupYieldGrams());
                ArrayNode ings = node.putArray("ingredients");
                if (it.group() != null) for (var g : it.group()) {
                    var p = produtos.byId(authorId, g.produtoId()).orElse(null);
                    if (p == null) continue;
                    var ing = ings.addObject();
                    ing.put("name", p.name());
                    ing.put("grams", g.grams());
                    ing.put("caloriesPerGram", p.caloriesPerGram());
                    ing.put("proteinPerGram", p.proteinPerGram());
                    putNullable(ing, "carbsPerGram", p.carbsPerGram());
                    putNullable(ing, "fatPerGram", p.fatPerGram());
                }
            } else if (it.produtoId() != null) {
                var p = produtos.byId(authorId, it.produtoId()).orElse(null);
                if (p == null) continue;
                var node = items.addObject();
                node.put("kind", "produto");
                node.put("name", p.name());
                node.put("quantity", it.quantity());
                node.put("unit", it.unit() == null ? "g" : it.unit());
                node.put("caloriesPerGram", p.caloriesPerGram());
                node.put("proteinPerGram", p.proteinPerGram());
                putNullable(node, "carbsPerGram", p.carbsPerGram());
                putNullable(node, "fatPerGram", p.fatPerGram());
            } else if (it.comidaId() != null) {
                var c = comidas.byId(authorId, it.comidaId()).orElse(null);
                if (c == null) continue;
                var node = items.addObject();
                node.put("kind", "comida");
                node.put("name", c.name());
                node.put("quantity", it.quantity());
                node.put("unit", it.unit() == null ? "g" : it.unit());
                node.set("comida", comidaNode(authorId, c));
            }
        }
        return n;
    }

    private ObjectNode pratoSnapshot(UUID authorId, UUID sectionId) {
        var sec = meals.sectionById(authorId, sectionId)
            .orElseThrow(() -> new BadRequestException("prato (section) not found"));
        var n = mapper.createObjectNode();
        n.put("section", sec.name());
        ArrayNode items = n.putArray("items");
        for (MealDay.MealItem it : sec.items()) {
            var node = items.addObject();
            node.put("name", it.name());
            node.put("quantity", it.quantity());
            node.put("unit", it.unit() == null ? "g" : it.unit());
            node.put("calories", it.calories());
            node.put("protein", it.protein());
            putNullable(node, "carbs", it.carbs());
            putNullable(node, "fat", it.fat());
        }
        return n;
    }

    private static void putNullable(ObjectNode n, String field, Double v) {
        if (v != null) n.put(field, v);
    }
}
