package com.nutri.ai;

import org.jboss.logging.Logger;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Per-model token pricing (USD per 1M tokens). Update when Anthropic adjusts.
 * Values from Anthropic public pricing as of 2026-05.
 *
 * Cache write = 5-minute ephemeral cache (1.25x input). Cache read = 0.1x input.
 *
 * Lookup tolerates dated variants — Anthropic may return e.g.
 * {@code claude-haiku-4-5-20251001} in {@code response.model} or operators may
 * pin a specific snapshot via env var. We match the longest known prefix so
 * dated variants land on the right rate sheet instead of silently falling back
 * to Sonnet (the previous behaviour, which inflated cost_micro_usd ~3x and
 * tripped the kill switch faster than expected).
 */
public final class Pricing {

    private static final Logger LOG = Logger.getLogger(Pricing.class);

    public record Rates(double inputPer1M, double cacheReadPer1M, double cacheWritePer1M, double outputPer1M) {}

    private static final Rates DEFAULT = new Rates(3.00, 0.30, 3.75, 15.00);

    private static final Map<String, Rates> BY_MODEL = Map.of(
        "claude-haiku-4-5",   new Rates(1.00, 0.10, 1.25,  5.00),
        "claude-sonnet-4-6",  new Rates(3.00, 0.30, 3.75, 15.00)
    );

    // Already-warned models, so log noise doesn't grow per-call. ConcurrentHashMap
    // for thread-safe add-once semantics.
    private static final Map<String, Boolean> WARNED = new ConcurrentHashMap<>();

    private Pricing() {}

    public static Rates forModel(String model) {
        if (model == null) return DEFAULT;
        Rates exact = BY_MODEL.get(model);
        if (exact != null) return exact;
        // Try longest known prefix — handles dated variants like
        // "claude-haiku-4-5-20251001" by matching "claude-haiku-4-5".
        Rates best = null;
        int bestLen = 0;
        for (var e : BY_MODEL.entrySet()) {
            if (model.startsWith(e.getKey()) && e.getKey().length() > bestLen) {
                best = e.getValue();
                bestLen = e.getKey().length();
            }
        }
        if (best != null) return best;
        if (WARNED.putIfAbsent(model, Boolean.TRUE) == null) {
            LOG.warnf("unknown model in Pricing.forModel: %s — defaulting to Sonnet rates", model);
        }
        return DEFAULT;
    }

    /**
     * Compute total cost in micro-USD (USD × 1_000_000) for a single call.
     * Sub-cent precision is necessary because a Haiku chat can cost well under
     * 1 cent and we don't want to round each row to zero.
     */
    public static long microUsd(String model, int input, int cacheRead, int cacheWrite, int output) {
        Rates r = forModel(model);
        double usd = (input     * r.inputPer1M      / 1_000_000.0)
                   + (cacheRead * r.cacheReadPer1M  / 1_000_000.0)
                   + (cacheWrite* r.cacheWritePer1M / 1_000_000.0)
                   + (output    * r.outputPer1M     / 1_000_000.0);
        return Math.round(usd * 1_000_000.0);
    }
}
