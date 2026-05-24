package com.nutri.ai;

import java.util.Map;

/**
 * Per-model token pricing (USD per 1M tokens). Update when Anthropic adjusts.
 * Values from Anthropic public pricing as of 2026-05.
 *
 * Cache write = 5-minute ephemeral cache (1.25x input). Cache read = 0.1x input.
 */
public final class Pricing {

    public record Rates(double inputPer1M, double cacheReadPer1M, double cacheWritePer1M, double outputPer1M) {}

    private static final Rates DEFAULT = new Rates(3.00, 0.30, 3.75, 15.00);

    private static final Map<String, Rates> BY_MODEL = Map.of(
        "claude-haiku-4-5",   new Rates(1.00, 0.10, 1.25,  5.00),
        "claude-sonnet-4-6",  new Rates(3.00, 0.30, 3.75, 15.00)
    );

    private Pricing() {}

    public static Rates forModel(String model) {
        if (model == null) return DEFAULT;
        return BY_MODEL.getOrDefault(model, DEFAULT);
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
