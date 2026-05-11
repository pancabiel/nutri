package com.nutri.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nutri.model.Comida;
import com.nutri.model.Produto;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.eclipse.microprofile.rest.client.inject.RestClient;
import org.jboss.logging.Logger;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@ApplicationScoped
public class AiService {

    private static final Logger LOG = Logger.getLogger(AiService.class);
    private static final String VERSION = "2023-06-01";
    private static final ObjectMapper M = new ObjectMapper();

    @Inject @RestClient AnthropicClient client;
    @ConfigProperty(name = "anthropic.api-key") String apiKey;
    @ConfigProperty(name = "anthropic.model") String model;
    @ConfigProperty(name = "anthropic.max-tokens", defaultValue = "2048") int maxTokens;

    /** Parse a free-text meal log into structured items, matching against memory. */
    public ParseResult parseChat(String userMessage, List<Produto> produtos, List<Comida> comidas) {
        var sys = """
            You are a Brazilian Portuguese food-tracking assistant.
            Convert a user's natural-language meal description into structured JSON.
            Match against the provided "produtos" (raw items) and "comidas" (composed dishes) when possible.
            Only invent a new item if there is no plausible match.
            Estimate grams when the user does not specify.

            Each produto may carry a "serving" hint: { "grams": <g>, "label": "<e.g. 2 fatias>" }.
            Use it to convert user-stated portions into grams. Examples:
              - serving = { grams: 50, label: "2 fatias" }, user says "2 fatias" -> 50g
              - same serving, user says "1 fatia" -> 25g (50g / 2)
              - same serving, user says "3 fatias" -> 75g
              - serving = { grams: 15, label: "1 colher de sopa" }, user says "2 colheres" -> 30g
            If the produto has no serving hint, estimate grams from common Brazilian portion sizes.

            Also infer WHEN the user ate, from the message itself:
              - section: one of "Café da manhã", "Almoço", "Lanche", "Jantar", or null if unclear.
                Examples: "no café da manhã" / "tomei café" -> "Café da manhã";
                          "no almoço" / "almocei" -> "Almoço";
                          "no lanche" / "lanchei" / "à tarde" -> "Lanche";
                          "no jantar" / "jantei" / "à noite" -> "Jantar".
                If the user does not signal a meal time, return null (do NOT guess).
              - date_offset_days: integer days from today, or null if unclear.
                "hoje" -> 0, "ontem" -> -1, "anteontem" -> -2, "amanhã" -> 1.
                If unclear, return null.

            Output ONLY a single JSON object, no prose:
            { "section": "<Café da manhã|Almoço|Lanche|Jantar|null>",
              "date_offset_days": <integer or null>,
              "items": [
                { "type": "produto" | "comida",
                  "matched_id": "<uuid or null>",
                  "name": "<string>",
                  "quantity": <number>,
                  "estimated_grams": <number>,
                  "calories": <integer>,
                  "protein": <number> }
              ] }
            """;

        var memory = M.createObjectNode();
        memory.set("produtos", M.valueToTree(produtos.stream().map(p -> {
            var entry = new LinkedHashMap<String, Object>();
            entry.put("id", p.id().toString());
            entry.put("name", p.name());
            entry.put("calories_per_100g", round(p.caloriesPerGram() * 100));
            entry.put("protein_per_100g", round(p.proteinPerGram() * 100));
            if (p.servingGrams() != null && p.servingGrams() > 0) {
                var serving = new LinkedHashMap<String, Object>();
                serving.put("grams", p.servingGrams());
                if (p.servingLabel() != null && !p.servingLabel().isBlank()) {
                    serving.put("label", p.servingLabel());
                }
                entry.put("serving", serving);
            }
            return entry;
        }).toList()));
        memory.set("comidas", M.valueToTree(comidas.stream().map(c -> Map.of(
            "id", c.id().toString(),
            "name", c.name()
        )).toList()));

        var user = "Memória de alimentos:\n" + memory.toPrettyString()
                 + "\n\nMensagem do usuário: " + userMessage;

        var text = call(sys, textBlock(user));
        return parseChatResult(text);
    }

    /** Detect foods in a meal photo. Pure estimation — no matching against saved produtos/comidas. */
    public List<ParsedItem> analyzeMealImage(String base64Image, String mediaType) {
        var sys = """
            Você analisa uma foto de uma refeição (cozinha brasileira). Identifique cada alimento visível,
            estime o peso da porção em gramas e calcule calorias e proteína aproximadas usando valores
            nutricionais típicos. Não tente combinar com nenhuma lista — apenas estime a partir da foto.

            Responda APENAS com um array JSON, sem prosa, sem markdown:
            [
              { "type": "produto",
                "matched_id": null,
                "name": "<nome em português>",
                "quantity": 1,
                "estimated_grams": <number>,
                "calories": <integer>,
                "protein": <number> }
            ]

            Se a foto não contiver comida, retorne [].
            """;
        var content = List.<Map<String, Object>>of(
            Map.of("type", "image", "source", Map.of(
                "type", "base64",
                "media_type", mediaType,
                "data", base64Image
            )),
            Map.of("type", "text", "text", "Analise a foto e retorne o JSON.")
        );
        var text = call(sys, content);
        return parseItems(text);
    }

    /** Extract macros from a Brazilian nutrition-label photo. */
    public NutritionLabel scanNutritionLabel(String base64Image, String mediaType) {
        var sys = """
            You read a Brazilian nutrition label ("Informação Nutricional"). Extract macros normalized
            to PER 100 g (or per 100 ml for liquids). Convert from "porção" if needed.
            Also capture the serving size shown on the label:
              - serving_grams: numeric grams (or ml) of one porção, if shown
              - serving_label: the descriptive part, e.g. "2 fatias", "1 colher de sopa", "1 unidade",
                "1 copo (200 ml)". Use what is printed; leave empty string if there is none.
            Output ONLY a single JSON object:
            { "name": "<best guess product name or empty>",
              "calories_per_100g": <number>,
              "protein_per_100g": <number>,
              "carbs_per_100g": <number>,
              "fat_per_100g": <number>,
              "serving_grams": <number or 0 if unknown>,
              "serving_label": "<string or empty>" }
            """;
        var content = List.<Map<String, Object>>of(
            Map.of("type", "image", "source", Map.of(
                "type", "base64",
                "media_type", mediaType,
                "data", base64Image
            )),
            Map.of("type", "text", "text", "Extraia os macros da tabela nutricional acima.")
        );
        var text = call(sys, content);
        try {
            var json = extractJson(text);
            return M.treeToValue(M.readTree(json), NutritionLabel.class);
        } catch (Exception e) {
            LOG.warn("Failed to parse nutrition label", e);
            return new NutritionLabel("", 0, 0, 0, 0, 0, "");
        }
    }

    // --------- internals ---------

    private String call(String system, List<Map<String, Object>> content) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("ANTHROPIC_API_KEY is not configured");
        }
        var req = new AnthropicClient.Request(
            model, maxTokens, system,
            List.of(new AnthropicClient.Message("user", content))
        );
        var resp = client.create(apiKey, VERSION, "application/json", req);
        if (resp.content() == null || resp.content().isEmpty()) return "[]";
        return resp.content().stream()
            .filter(b -> "text".equals(b.type()))
            .map(AnthropicClient.ContentBlock::text)
            .findFirst().orElse("[]");
    }

    private static List<Map<String, Object>> textBlock(String text) {
        return List.of(Map.of("type", "text", "text", text));
    }

    private List<ParsedItem> parseItems(String text) {
        try {
            var json = extractJson(text);
            JsonNode node = M.readTree(json);
            JsonNode arr = node.isArray() ? node
                         : node.has("items") && node.get("items").isArray() ? node.get("items")
                         : null;
            if (arr == null) { LOG.warn("AI returned non-array shape: " + text); return List.of(); }
            var out = new ArrayList<ParsedItem>(arr.size());
            for (var n : arr) out.add(M.treeToValue(n, ParsedItem.class));
            return out;
        } catch (Exception e) {
            LOG.warn("AI returned non-JSON: " + text, e);
            return List.of();
        }
    }

    private ParseResult parseChatResult(String text) {
        try {
            var json = extractJson(text);
            var node = M.readTree(json);
            // Tolerate the AI returning a bare array (legacy shape).
            if (node.isArray()) {
                var items = new ArrayList<ParsedItem>(node.size());
                for (var n : node) items.add(M.treeToValue(n, ParsedItem.class));
                return new ParseResult(null, null, items);
            }
            String section = node.hasNonNull("section") ? node.get("section").asText() : null;
            Integer offset = node.hasNonNull("date_offset_days") ? node.get("date_offset_days").asInt() : null;
            var items = new ArrayList<ParsedItem>();
            var arr = node.get("items");
            if (arr != null && arr.isArray()) {
                for (var n : arr) items.add(M.treeToValue(n, ParsedItem.class));
            }
            return new ParseResult(section, offset, items);
        } catch (Exception e) {
            LOG.warn("AI returned non-JSON: " + text, e);
            return new ParseResult(null, null, List.of());
        }
    }

    /**
     * Locate a JSON value inside whatever the model returned. The model often wraps
     * its answer in ```json fences and may add prose before/after. Naïve regex matching
     * would happily grab a snippet like { grams: 50 } from the prose, so we:
     *   1. Prefer content inside a ```json (or ```) fence.
     *   2. Otherwise scan for balanced { … } / [ … ] occurrences and return the longest.
     */
    private static String extractJson(String s) {
        if (s == null) return "[]";
        var t = s.trim();

        var fence = Pattern.compile("(?s)```(?:json)?\\s*([\\[{].*?[\\]}])\\s*```").matcher(t);
        if (fence.find()) return fence.group(1).trim();

        String best = null;
        for (int i = 0; i < t.length(); i++) {
            char c = t.charAt(i);
            if (c != '{' && c != '[') continue;
            var span = balancedSpan(t, i);
            if (span != null && (best == null || span.length() > best.length())) {
                best = span;
            }
        }
        return best != null ? best : t;
    }

    /** Return the substring starting at {@code start} that closes a balanced JSON bracket, or null. */
    private static String balancedSpan(String s, int start) {
        int depth = 0;
        boolean inString = false;
        boolean escape = false;
        char open = s.charAt(start);
        char close = open == '{' ? '}' : ']';
        for (int i = start; i < s.length(); i++) {
            char c = s.charAt(i);
            if (escape) { escape = false; continue; }
            if (c == '\\') { escape = true; continue; }
            if (c == '"') { inString = !inString; continue; }
            if (inString) continue;
            if (c == '{' || c == '[') depth++;
            else if (c == '}' || c == ']') {
                depth--;
                if (depth == 0) return c == close ? s.substring(start, i + 1) : null;
            }
        }
        return null;
    }

    private static double round(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    public record ParsedItem(
        String type,
        String matched_id,
        String name,
        double quantity,
        double estimated_grams,
        int calories,
        double protein
    ) {}

    public record ParseResult(
        String section,
        Integer dateOffsetDays,
        List<ParsedItem> items
    ) {}

    public record NutritionLabel(
        String name,
        double calories_per_100g,
        double protein_per_100g,
        double carbs_per_100g,
        double fat_per_100g,
        double serving_grams,
        String serving_label
    ) {}
}
