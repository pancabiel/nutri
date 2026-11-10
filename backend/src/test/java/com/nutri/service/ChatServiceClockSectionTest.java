package com.nutri.service;

import com.nutri.repository.MealRepositoryTestAccess;
import org.junit.jupiter.api.Test;

import java.time.LocalTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ChatServiceClockSectionTest {

    @Test
    void afternoonFallbackPicksLancheDaTarde() {
        var t = LocalTime.of(17, 0);
        assertEquals("Lanche da tarde", ChatService.clockSection(t));
        // Users with manhã + tarde snacks: lands in "Lanche da tarde", no duplicate "Lanche".
        assertEquals("Lanche da tarde", MealRepositoryTestAccess.match(
            List.of("Café da manhã", "Lanche da manhã", "Almoço", "Lanche da tarde", "Jantar", "Ceia"),
            ChatService.clockSection(t)));
        // Default names: still lands in plain "Lanche".
        assertEquals("Lanche", MealRepositoryTestAccess.match(
            List.of("Café da manhã", "Almoço", "Lanche", "Jantar"), ChatService.clockSection(t)));
    }

    @Test
    void otherBucketsUnchanged() {
        assertEquals("Café da manhã", ChatService.clockSection(LocalTime.of(8, 0)));
        assertEquals("Almoço", ChatService.clockSection(LocalTime.of(12, 0)));
        assertEquals("Jantar", ChatService.clockSection(LocalTime.of(21, 0)));
    }
}
