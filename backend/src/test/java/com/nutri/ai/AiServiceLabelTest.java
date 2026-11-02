package com.nutri.ai;

import com.nutri.ai.AiService.LabelRead;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Unit-tests {@link AiService#reconcileWithServing}: per-100 g macros vs the printed porção. */
class AiServiceLabelTest {

    @Test
    void preparedColumnReplacedByPorcao() {
        // Ninho em pó (02/11/2026): model read the "100 ml" prepared column (55 kcal),
        // but the porção of the powder is 25 g = 108 kcal / 7.4 g prot / 11 g carbs / 3.8 g fat.
        var r = AiService.reconcileWithServing(new LabelRead("Leite em pó", "Ninho",
            55, 3.8, 5.6, 1.9, 25, "2 colheres de sopa", 108, 7.4, 11, 3.8));
        assertEquals(432.0, r.calories_per_100g());
        assertEquals(29.6, r.protein_per_100g());
        assertEquals(44.0, r.carbs_per_100g());
        assertEquals(15.2, r.fat_per_100g());
        assertEquals(25.0, r.serving_grams());
        assertEquals("2 colheres de sopa", r.serving_label());
    }

    @Test
    void consistentLabelUntouched() {
        // Pão: porção 50 g = 125 kcal → 250/100 g; model said 248 (rounding on the label).
        var r = AiService.reconcileWithServing(new LabelRead("Pão", "", 248, 9.1, 45, 3.2,
            50, "2 fatias", 125, 4.5, 22.6, 1.6));
        assertEquals(248.0, r.calories_per_100g());
        assertEquals(9.1, r.protein_per_100g());
    }

    @Test
    void missingPorcaoValuesKeepModelOutput() {
        var r = AiService.reconcileWithServing(new LabelRead("X", "", 120, 5, 10, 2, 0, "", 0, 0, 0, 0));
        assertEquals(120.0, r.calories_per_100g());
        var r2 = AiService.reconcileWithServing(new LabelRead("X", "", 120, 5, 10, 2, 30, "", 0, 0, 0, 0));
        assertEquals(120.0, r2.calories_per_100g());
    }
}
