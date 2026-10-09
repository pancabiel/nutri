package com.nutri.repository;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class MealRepositoryMatchSectionTest {

    private static final List<String> CUSTOM =
        List.of("Café da manhã", "Almoço", "Lanche da tarde", "Jantar");

    @Test
    void exactAndCaseAccentInsensitive() {
        assertEquals("Almoço", MealRepository.matchSection(CUSTOM, "Almoço"));
        assertEquals("Café da manhã", MealRepository.matchSection(CUSTOM, "cafe da manha"));
        assertEquals("Lanche da tarde", MealRepository.matchSection(CUSTOM, "lanche da tarde"));
    }

    @Test
    void genericNameLandsInUniqueSpecificSection() {
        assertEquals("Lanche da tarde", MealRepository.matchSection(CUSTOM, "Lanche"));
        assertEquals("Lanche", MealRepository.matchSection(List.of("Lanche", "Jantar"), "Lanche da tarde"));
    }

    @Test
    void ambiguousOrUnknownReturnsNull() {
        var two = List.of("Lanche da manhã", "Lanche da tarde");
        assertNull(MealRepository.matchSection(two, "Lanche"));
        assertNull(MealRepository.matchSection(CUSTOM, "Ceia"));
        assertNull(MealRepository.matchSection(CUSTOM, "Lanchinho"));
        assertNull(MealRepository.matchSection(CUSTOM, null));
    }
}
