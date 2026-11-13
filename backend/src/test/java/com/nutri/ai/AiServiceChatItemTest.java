package com.nutri.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nutri.model.Produto;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** {@link AiService#chatItem}: the AI gives grams + per-100g, the backend does the math. */
class AiServiceChatItemTest {

    private static final ObjectMapper M = new ObjectMapper();
    private static final UUID PAO = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final Map<UUID, Produto> PRODS = Map.of(PAO,
        new Produto(PAO, "Pão de forma", null, 2.5, 0.08, 0.45, 0.03, 50.0, "2 fatias",
                    null, null, null, false));

    private static AiService.ParsedItem item(String json) throws Exception {
        return AiService.chatItem(M.readTree(json), PRODS);
    }

    @Test
    void matchedProdutoUsesStoredMacrosNotAiValues() throws Exception {
        var p = item("""
            {"type":"produto","matched_id":"%s","name":"Pão","quantity":2,"estimated_grams":50,
             "calories_per_100g":999,"protein_per_100g":50,"carbs_per_100g":90,"fat_per_100g":40}
            """.formatted(PAO));
        assertEquals(125, p.calories());
        assertEquals(4.0, p.protein());
        assertEquals(22.5, p.carbs());
        assertEquals(1.5, p.fat());
        assertEquals(PAO.toString(), p.matched_id());
    }

    @Test
    void unmatchedUsesPer100gTimesGrams() throws Exception {
        var p = item("""
            {"type":"produto","matched_id":null,"name":"Guaraná mini","quantity":1,"estimated_grams":200,
             "calories_per_100g":30.5,"protein_per_100g":0,"carbs_per_100g":7.6,"fat_per_100g":0}
            """);
        assertEquals(61, p.calories());
        assertEquals(15.2, p.carbs());
        assertEquals(200, p.estimated_grams());
    }

    @Test
    void unmatchedComidaBecomesGramProduto() throws Exception {
        var p = item("""
            {"type":"comida","matched_id":null,"name":"Strogonoff","quantity":1,"estimated_grams":250,
             "calories_per_100g":150,"protein_per_100g":10,"carbs_per_100g":5,"fat_per_100g":9}
            """);
        assertEquals("produto", p.type());
        assertEquals(375, p.calories());
    }

    @Test
    void unknownMatchedIdFallsBackToAiPer100g() throws Exception {
        var p = item("""
            {"type":"produto","matched_id":"%s","name":"x","quantity":1,"estimated_grams":100,
             "calories_per_100g":80,"protein_per_100g":3}
            """.formatted(UUID.randomUUID()));
        assertEquals(80, p.calories());
        assertNull(p.carbs());
    }

    @Test
    void legacyTotalsShapeStillWorks() throws Exception {
        var p = item("""
            {"type":"produto","matched_id":null,"name":"x","quantity":1,"estimated_grams":100,
             "calories":120,"protein":4,"carbs":20,"fat":2}
            """);
        assertEquals(120, p.calories());
        assertEquals(20.0, p.carbs());
    }

    @Test
    void absurdPer100gIsCapped() throws Exception {
        var p = item("""
            {"type":"produto","matched_id":null,"name":"x","quantity":1,"estimated_grams":100,
             "calories_per_100g":99999,"protein_per_100g":0}
            """);
        assertEquals(1000, p.calories());
    }
}
