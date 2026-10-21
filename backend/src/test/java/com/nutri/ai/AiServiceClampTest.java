package com.nutri.ai;

import com.nutri.ai.AiService.ParsedItem;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Unit-tests {@link AiService#clamp}'s physical density check on chat-parsed items. */
class AiServiceClampTest {

    private static ParsedItem item(double grams, int cal, double prot, Double carbs, Double fat) {
        return new ParsedItem("new", null, "x", grams, grams, cal, prot, carbs, fat);
    }

    @Test
    void plausibleItemUntouched() {
        var p = AiService.clamp(item(30, 100, 2.0, 1.2, 10.0));   // real cream cheese
        assertEquals(100, p.calories());
        assertEquals(10.0, p.fat());
    }

    @Test
    void pureFatAtLimitUntouched() {
        var p = AiService.clamp(item(10, 90, 0, 0.0, 10.0));      // 10g oil
        assertEquals(90, p.calories());
        assertEquals(10.0, p.fat());
    }

    @Test
    void creamCheeseRegressionScaledDown() {
        // Haiku 4.5 logged 30g cream cheese as 297 kcal / 29.7g fat (09/10/2026).
        var p = AiService.clamp(item(30, 297, 5.1, 4.2, 29.7));
        assertTrue(p.calories() <= 270, "kcal must not exceed 9/g: " + p.calories());
        assertTrue(p.protein() + p.carbs() + p.fat() <= 30.0 * 1.05, "macros heavier than food");
    }

    @Test
    void caloriesAboveFatDensityScaled() {
        var p = AiService.clamp(item(25, 303, 7, 0.75, 10.0));
        assertEquals(225, p.calories());
    }

    @Test
    void unknownGramsSkipsCheck() {
        var p = AiService.clamp(item(0, 500, 20, 50.0, 20.0));
        assertEquals(500, p.calories());
    }
}
