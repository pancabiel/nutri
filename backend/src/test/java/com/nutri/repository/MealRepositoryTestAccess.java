package com.nutri.repository;

import java.util.Collection;

/** Exposes package-private {@link MealRepository#matchSection} to tests in other packages. */
public final class MealRepositoryTestAccess {
    private MealRepositoryTestAccess() {}

    public static String match(Collection<String> names, String wanted) {
        return MealRepository.matchSection(names, wanted);
    }
}
