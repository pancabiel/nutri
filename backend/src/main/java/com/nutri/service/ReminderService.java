package com.nutri.service;

import com.nutri.model.NotificationPrefs;
import com.nutri.model.PushSubscription;
import com.nutri.push.WebPushSender;
import com.nutri.repository.MealRepository;
import com.nutri.repository.NotificationPrefsRepository;
import com.nutri.repository.PushSubscriptionRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Set;

/**
 * Decides which reminders are due "right now" and dispatches them via
 * {@link WebPushSender}. Invoked by {@code POST /cron/send-reminders} on a
 * ~15-minute EventBridge schedule.
 *
 * <p>A meal fires when the local clock is within {@code [mealTime, mealTime + slot)}.
 * Because {@code slot} equals the cron cadence, each meal fires at most once per day
 * without needing per-meal "last sent" bookkeeping. The {@code tag} on the payload
 * (per meal + date) lets the service worker collapse any rare duplicate from an
 * EventBridge retry.
 *
 * <p>All time math uses the user's {@link ZoneId} ({@code America/Sao_Paulo} default),
 * never a fixed offset, so it stays correct across DST.
 */
@ApplicationScoped
public class ReminderService {

    private static final Logger LOG = Logger.getLogger(ReminderService.class);

    @Inject NotificationPrefsRepository prefs;
    @Inject PushSubscriptionRepository subs;
    @Inject MealRepository meals;
    @Inject WebPushSender sender;

    /** Cron cadence; the firing window width. Keep equal to the EventBridge {@code rate(...)}. */
    @ConfigProperty(name = "webpush.reminder.slot-tolerance-minutes", defaultValue = "15")
    int slotMinutes;

    /** The four meals, in canonical section-name order matching ChatService.defaultSection. */
    private enum Meal {
        CAFE("Café da manhã", "Hora do café da manhã ☕", "Não esqueça de comer e registrar."),
        ALMOCO("Almoço", "Hora do almoço 🍽️", "Não esqueça de comer e registrar."),
        LANCHE("Lanche", "Hora do lanche 🍎", "Que tal um lanche? Registre aqui."),
        JANTAR("Jantar", "Hora do jantar 🌙", "Não esqueça de comer e registrar.");

        final String section, title, body;
        Meal(String section, String title, String body) { this.section = section; this.title = title; this.body = body; }
    }

    public int runDue(Instant now) {
        if (!sender.isConfigured()) {
            LOG.debug("webpush not configured — skipping reminder run");
            return 0;
        }
        int sent = 0;
        for (var userId : prefs.userIdsEnabled()) {
            try {
                sent += runForUser(userId, now);
            } catch (Exception e) {
                LOG.warnf("reminder run failed for user %s: %s", userId, e.getMessage());
            }
        }
        return sent;
    }

    private int runForUser(java.util.UUID userId, Instant now) {
        NotificationPrefs p = prefs.getOrCreate(userId);
        if (!Boolean.TRUE.equals(p.enabled())) return 0;

        ZoneId zone = resolveZone(p.timezone());
        ZonedDateTime local = now.atZone(zone);
        LocalDate today = local.toLocalDate();
        LocalTime nowTime = local.toLocalTime();

        if (!dayEnabled(p.weekdays(), today.getDayOfWeek())) return 0;
        if (inQuietHours(nowTime, p.quietStart(), p.quietEnd())) return 0;

        // Which meals are due in this slot?
        var due = new java.util.ArrayList<Meal>();
        if (mealEnabled(p, Meal.CAFE)   && inSlot(nowTime, p.cafeTime()))   due.add(Meal.CAFE);
        if (mealEnabled(p, Meal.ALMOCO) && inSlot(nowTime, p.almocoTime())) due.add(Meal.ALMOCO);
        if (mealEnabled(p, Meal.LANCHE) && inSlot(nowTime, p.lancheTime())) due.add(Meal.LANCHE);
        if (mealEnabled(p, Meal.JANTAR) && inSlot(nowTime, p.jantarTime())) due.add(Meal.JANTAR);
        if (due.isEmpty()) return 0;

        Set<String> logged = Boolean.TRUE.equals(p.skipIfLogged())
                ? meals.loggedSectionNamesOn(userId, today)
                : Set.of();

        var devices = subs.byUser(userId);
        if (devices.isEmpty()) return 0;

        int sent = 0;
        for (Meal m : due) {
            if (logged.contains(m.section)) continue;   // already ate/logged → skip
            String payload = payloadJson(m, today);
            for (PushSubscription dev : devices) {
                var result = sender.send(dev, payload);
                if (result == WebPushSender.SendResult.GONE) {
                    subs.deleteOne(dev.endpoint());
                } else if (result == WebPushSender.SendResult.OK) {
                    sent++;
                }
            }
        }
        return sent;
    }

    // ---------------- predicates ----------------

    private boolean mealEnabled(NotificationPrefs p, Meal m) {
        return switch (m) {
            case CAFE   -> Boolean.TRUE.equals(p.cafeEnabled());
            case ALMOCO -> Boolean.TRUE.equals(p.almocoEnabled());
            case LANCHE -> Boolean.TRUE.equals(p.lancheEnabled());
            case JANTAR -> Boolean.TRUE.equals(p.jantarEnabled());
        };
    }

    /** weekdays bitmask: bit0=Sunday .. bit6=Saturday. */
    static boolean dayEnabled(Integer weekdays, DayOfWeek dow) {
        int mask = weekdays == null ? 127 : weekdays;
        int bit = dow.getValue() % 7;   // MON=1..SAT=6, SUN(7)→0
        return (mask & (1 << bit)) != 0;
    }

    boolean inSlot(LocalTime now, String mealHhmm) {
        if (mealHhmm == null || mealHhmm.isBlank()) return false;
        LocalTime meal = LocalTime.parse(mealHhmm);
        int nowM = now.getHour() * 60 + now.getMinute();
        int mealM = meal.getHour() * 60 + meal.getMinute();
        return nowM >= mealM && nowM < mealM + slotMinutes;
    }

    /** Inside the (optional) quiet window, handling a window that wraps midnight. */
    static boolean inQuietHours(LocalTime now, String startHhmm, String endHhmm) {
        if (startHhmm == null || startHhmm.isBlank() || endHhmm == null || endHhmm.isBlank()) return false;
        LocalTime start = LocalTime.parse(startHhmm);
        LocalTime end = LocalTime.parse(endHhmm);
        if (start.equals(end)) return false;
        if (start.isBefore(end)) {
            return !now.isBefore(start) && now.isBefore(end);
        }
        // wraps midnight, e.g. 22:00 → 07:00
        return !now.isBefore(start) || now.isBefore(end);
    }

    private static ZoneId resolveZone(String tz) {
        try {
            return ZoneId.of(tz == null || tz.isBlank() ? "America/Sao_Paulo" : tz);
        } catch (Exception e) {
            return ZoneId.of("America/Sao_Paulo");
        }
    }

    private static String payloadJson(Meal m, LocalDate date) {
        String tag = "nutri-" + m.name().toLowerCase() + "-" + date;
        return "{\"title\":\"" + esc(m.title) + "\",\"body\":\"" + esc(m.body)
                + "\",\"url\":\"/\",\"tag\":\"" + tag + "\"}";
    }

    private static String esc(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
