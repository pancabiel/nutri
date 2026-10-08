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
    String coverUrl,     // capa (frente da embalagem) — URL pública do bucket `produtos`
    String labelUrl,     // foto da tabela nutricional, só referência pessoal
    OffsetDateTime createdAt
) {}
