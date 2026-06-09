package com.nutri.model;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * A reusable "marmita" — a named set of items (produtos and/or comidas, each with
 * a quantity + unit) that gets copied into a day's section by POST /meal-days/batch.
 * Stores references only; macro snapshots are computed client-side at apply time.
 */
public record MealTemplate(
    UUID id,
    String name,
    List<TemplateItem> items,
    OffsetDateTime createdAt
) {
    /**
     * One line of a marmita. Exactly one of three shapes:
     *  - produto: {@code produtoId} set, {@code quantity} in grams.
     *  - comida:  {@code comidaId} set, {@code quantity} in grams or porções (see {@code unit}).
     *  - grupo (inline sub-receita, ex: molho branco): {@code groupName} set with
     *    {@code group} ingredients (produto + grams of the cooked batch) and
     *    {@code groupYieldGrams} (estimated finished weight); {@code quantity} is the
     *    grams served in this marmita. Lives only inside the template, never saved as a comida.
     */
    public record TemplateItem(
        UUID produtoId, UUID comidaId, double quantity, String unit,
        String groupName, Double groupYieldGrams, List<GroupProduto> group
    ) {
        /** Convenience for the non-group shapes (produto / comida). */
        public TemplateItem(UUID produtoId, UUID comidaId, double quantity, String unit) {
            this(produtoId, comidaId, quantity, unit, null, null, null);
        }
    }

    /** A batch ingredient of an inline group: a produto and how many grams went into the batch. */
    public record GroupProduto(UUID produtoId, double grams) {}
}
