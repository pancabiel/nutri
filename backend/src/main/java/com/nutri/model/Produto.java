package com.nutri.model;

import java.time.OffsetDateTime;
import java.util.UUID;

public record Produto(
    UUID id,
    String name,
    String brand,
    double caloriesPerGram,
    double proteinPerGram,
    Double carbsPerGram,
    Double fatPerGram,
    Double servingGrams,
    String servingLabel,
    OffsetDateTime createdAt
) {}
