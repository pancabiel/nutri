package com.nutri.model;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record Comida(
    UUID id,
    String name,
    List<ComidaProduto> items,
    OffsetDateTime createdAt
) {
    public record ComidaProduto(UUID produtoId, double quantityGrams) {}
}
