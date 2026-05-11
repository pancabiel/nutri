package com.nutri.model;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record MealDay(
    UUID id,
    LocalDate date,
    List<MealSection> sections
) {
    public record MealSection(
        UUID id,
        String name,
        int orderIndex,
        List<MealItem> items
    ) {}

    public record MealItem(
        UUID id,
        UUID produtoId,
        UUID comidaId,
        String name,
        double quantity,
        int calories,
        double protein
    ) {}
}
