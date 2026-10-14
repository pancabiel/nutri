package com.nutri.model;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record Comida(
    UUID id,
    String name,
    List<ComidaProduto> items,
    Double yieldGrams,
    OffsetDateTime createdAt,
    boolean archived     // arquivada: some das listas/pickers/IA, mas segue resolvível p/ marmitas e diário
) {
    public record ComidaProduto(UUID produtoId, double quantityGrams) {}
}
