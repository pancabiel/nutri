package com.nutri.service;

import com.nutri.model.MealDay;
import com.nutri.repository.MealRepository.DatedSection;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class MealCopyServiceTest {

    private static final UUID PAO = UUID.randomUUID();
    private static final UUID OVO = UUID.randomUUID();
    private static final UUID PANQUECA = UUID.randomUUID();

    // 2026-10-05 is a Monday.
    private static final LocalDate MON = LocalDate.of(2026, 10, 5);

    private static DatedSection cafe(LocalDate date, UUID... produtos) {
        var items = Arrays.stream(produtos)
            .map(p -> new MealDay.MealItem(UUID.randomUUID(), p, null, "x", 50, 100, 5, "g", null, null))
            .toList();
        return new DatedSection(date, new MealDay.MealSection(UUID.randomUUID(), "Café da manhã", 0, items));
    }

    @Test
    void mondayPicksMostFrequentWeekdayMealNotSunday() {
        var history = List.of(
            cafe(MON.minusDays(7), PAO, OVO),      // Mon
            cafe(MON.minusDays(6), OVO, PAO),      // Tue, same set in another order
            cafe(MON.minusDays(3), PAO),           // Fri
            cafe(MON.minusDays(2), PANQUECA),      // Sat
            cafe(MON.minusDays(1), PANQUECA));     // Sun
        var pick = MealCopyService.pick(history, MON);
        assertEquals(2, pick.times());
        assertEquals(MON.minusDays(6), pick.occurrence().date());
    }

    @Test
    void weekendPrefersWeekendHistory() {
        var sat = MON.plusDays(5);
        var history = List.of(
            cafe(MON, PAO, OVO), cafe(MON.plusDays(1), PAO, OVO),
            cafe(MON.minusDays(1), PANQUECA));
        assertEquals(MON.minusDays(1), MealCopyService.pick(history, sat).occurrence().date());
    }

    @Test
    void fallsBackToAnyDayAndTiesGoToMostRecent() {
        var sat = MON.plusDays(5);
        var history = List.of(cafe(MON, PAO), cafe(MON.plusDays(3), OVO));
        assertEquals(MON.plusDays(3), MealCopyService.pick(history, sat).occurrence().date());
        assertNull(MealCopyService.pick(List.of(), sat));
    }
}
