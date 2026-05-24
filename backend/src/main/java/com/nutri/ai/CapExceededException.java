package com.nutri.ai;

/**
 * Thrown by {@link AiService#call} when the current user has hit their per-kind
 * usage cap. Mapped to HTTP 402 by {@code com.nutri.resource.CapExceededMapper}.
 *
 * Carries enough context for the frontend to render the right upgrade message:
 * which feature (kind), which tier the user is on, whether the cap is lifetime
 * (free trial) or daily (Pro), and the limit they hit.
 */
public class CapExceededException extends RuntimeException {

    public enum Tier { FREE, PRO }
    public enum Window { LIFETIME, DAILY }

    private final String kind;
    private final Tier tier;
    private final Window window;
    private final int limit;
    private final int used;

    public CapExceededException(String kind, Tier tier, Window window, int limit, int used) {
        super("cap exceeded: kind=" + kind + " tier=" + tier + " window=" + window
                + " limit=" + limit + " used=" + used);
        this.kind = kind;
        this.tier = tier;
        this.window = window;
        this.limit = limit;
        this.used = used;
    }

    public String kind() { return kind; }
    public Tier tier() { return tier; }
    public Window window() { return window; }
    public int limit() { return limit; }
    public int used() { return used; }
}
