package com.nutri.ai;

import com.nutri.auth.CurrentUser;
import com.nutri.model.Profile;
import com.nutri.repository.KillSwitchRepository;
import com.nutri.repository.ProfileRepository;
import com.nutri.repository.UsageRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit-tests {@link AiService}'s pre-call gates: the kill switch short-circuit
 * and the per-user caps (free lifetime / pro daily). Uses lightweight fakes for
 * the injected beans — no Quarkus boot, no DB, no real Anthropic.
 */
class AiServiceCapTest {

    private static final UUID USER = UUID.randomUUID();
    private static final int FREE_CHAT_CAP = 3;     // mirrors AiService.FREE_LIFETIME_CAP
    private static final int PRO_CHAT_CAP  = 20;    // mirrors AiService.PRO_DAILY_CAP

    private AiService svc;
    private FakeKillSwitch killSwitch;
    private FakeUsage usage;
    private FakeProfiles profiles;
    private FakeClient client;
    private CurrentUser user;

    @BeforeEach
    void setUp() throws Exception {
        svc       = new AiService();
        killSwitch = new FakeKillSwitch();
        usage      = new FakeUsage();
        profiles   = new FakeProfiles();
        client     = new FakeClient();
        user       = new CurrentUser();
        user.set(USER, "u@example.com");

        set("client",      client);
        set("usage",       usage);
        set("profiles",    profiles);
        set("killSwitch",  killSwitch);
        set("user",        user);
        set("apiKey",      "sk-test");
        set("chatModel",   "claude-haiku-4-5");
        set("visionModel", "claude-sonnet-4-6");
        set("maxTokens",   256);
    }

    // ---------- kill switch ----------

    @Test
    void killSwitchTripped_throws_andDoesNotCallAnthropic() {
        killSwitch.tripped = true;
        assertThrows(KillSwitchTrippedException.class,
            () -> svc.parseChat("comi 1 banana", List.of(), List.of()));
        assertEquals(0, client.calls.get(), "must not call Anthropic when kill switch is tripped");
        assertEquals(0, usage.recordCalls.get(), "must not record usage when call was blocked");
    }

    // ---------- FREE: lifetime cap ----------

    @Test
    void freeUser_underCap_callProceeds() {
        profiles.isPro = false;
        usage.lifetimeCount = FREE_CHAT_CAP - 1;        // one call left
        svc.parseChat("comi 1 banana", List.of(), List.of());
        assertEquals(1, client.calls.get());
        assertEquals(1, usage.recordCalls.get());
    }

    @Test
    void freeUser_atCap_throws() {
        profiles.isPro = false;
        usage.lifetimeCount = FREE_CHAT_CAP;            // exactly at cap → blocked
        var ex = assertThrows(CapExceededException.class,
            () -> svc.parseChat("x", List.of(), List.of()));
        assertEquals(CapExceededException.Tier.FREE,    ex.tier());
        assertEquals(CapExceededException.Window.LIFETIME, ex.window());
        assertEquals(AiService.KIND_CHAT, ex.kind());
        assertEquals(FREE_CHAT_CAP, ex.limit());
        assertEquals(FREE_CHAT_CAP, ex.used());
        assertEquals(0, client.calls.get());
    }

    @Test
    void freeUser_overCap_throws() {
        profiles.isPro = false;
        usage.lifetimeCount = FREE_CHAT_CAP + 5;
        assertThrows(CapExceededException.class,
            () -> svc.parseChat("x", List.of(), List.of()));
        assertEquals(0, client.calls.get());
    }

    // ---------- PRO: daily cap ----------

    @Test
    void proUser_underDailyCap_callProceeds() {
        profiles.isPro = true;
        usage.dailyCount = PRO_CHAT_CAP - 1;
        svc.parseChat("x", List.of(), List.of());
        assertEquals(1, client.calls.get());
    }

    @Test
    void proUser_atDailyCap_throws() {
        profiles.isPro = true;
        usage.dailyCount = PRO_CHAT_CAP;
        var ex = assertThrows(CapExceededException.class,
            () -> svc.parseChat("x", List.of(), List.of()));
        assertEquals(CapExceededException.Tier.PRO,    ex.tier());
        assertEquals(CapExceededException.Window.DAILY, ex.window());
        assertEquals(PRO_CHAT_CAP, ex.limit());
        assertEquals(0, client.calls.get());
    }

    @Test
    void proUser_overDailyCap_throws() {
        profiles.isPro = true;
        usage.dailyCount = PRO_CHAT_CAP * 2;
        assertThrows(CapExceededException.class,
            () -> svc.parseChat("x", List.of(), List.of()));
        assertEquals(0, client.calls.get());
    }

    // ---------- unauthenticated (background job) bypass ----------

    @Test
    void unauthenticatedUser_bypassesCap() throws Exception {
        // Replace CurrentUser with a fresh, unauthenticated one.
        var anon = new CurrentUser();
        set("user", anon);
        assertFalse(anon.isAuthenticated());
        // Even with usage piled high, no cap should apply.
        usage.lifetimeCount = 9999;
        usage.dailyCount    = 9999;
        svc.parseChat("x", List.of(), List.of());
        assertEquals(1, client.calls.get());
        // recordUsage also bails out without an authenticated user — must not throw.
        assertEquals(0, usage.recordCalls.get());
    }

    // ---------- helpers / fakes ----------

    private void set(String fieldName, Object value) throws Exception {
        Field f = AiService.class.getDeclaredField(fieldName);
        f.setAccessible(true);
        f.set(svc, value);
    }

    /** Returns the minimal valid response shape parseChatResult expects. */
    private static AnthropicClient.Response cannedResponse() {
        return new AnthropicClient.Response(
            "msg_test",
            "claude-haiku-4-5",
            List.of(new AnthropicClient.ContentBlock("text",
                "{\"section\":null,\"date_offset_days\":null,\"items\":[]}")),
            "end_turn",
            new AnthropicClient.Usage(10, 5, 0, 0)
        );
    }

    static final class FakeKillSwitch extends KillSwitchRepository {
        volatile boolean tripped = false;
        @Override public boolean isTripped() { return tripped; }
        @Override public void trip(String r, long c) { tripped = true; }
        @Override public void reset() { tripped = false; }
    }

    static final class FakeUsage extends UsageRepository {
        volatile int lifetimeCount = 0;
        volatile int dailyCount = 0;
        final AtomicInteger recordCalls = new AtomicInteger();
        @Override public void record(UUID u, String k, String m,
                                     int it, int crt, int cwt, int ot, long cost) {
            recordCalls.incrementAndGet();
        }
        @Override public int lifetimeCount(UUID u, String k) { return lifetimeCount; }
        @Override public int countSince(UUID u, String k, Instant since) { return dailyCount; }
        @Override public long sumCostMicroUsdSince(UUID u, Instant since) { return 0; }
        @Override public long globalCostMicroUsdSince(Instant since) { return 0; }
    }

    static final class FakeProfiles extends ProfileRepository {
        volatile boolean isPro = false;
        @Override public Profile getOrCreate(UUID userId) {
            return new Profile(userId, isPro, isPro ? "active" : null,
                null, null, null, null, null, null, null, null, null, true);
        }
    }

    static final class FakeClient implements AnthropicClient {
        final AtomicInteger calls = new AtomicInteger();
        @Override public Response create(String apiKey, String version, String contentType, Request body) {
            calls.incrementAndGet();
            return cannedResponse();
        }
    }
}
