package com.nutri.model;

/**
 * Per-user reminder configuration (1:1 with auth.users). Meal times and quiet
 * hours are carried as {@code "HH:mm"} strings on the JSON boundary to keep
 * serialization trivial; the repository / cron convert to {@link java.time.LocalTime}.
 * A null {@code *Time} or {@code quiet*} means "off". {@code weekdays} is a
 * bitmask (bit0=Sunday .. bit6=Saturday).
 */
public record NotificationPrefs(
        Boolean enabled,
        String timezone,
        Integer weekdays,
        Boolean skipIfLogged,
        String quietStart,
        String quietEnd,
        Boolean cafeEnabled,
        String cafeTime,
        Boolean almocoEnabled,
        String almocoTime,
        Boolean lancheEnabled,
        String lancheTime,
        Boolean jantarEnabled,
        String jantarTime) {
}
