package com.nutri.ai;

/**
 * Thrown by {@link AiService#call} when the global kill switch is on. Mapped
 * to HTTP 503 by {@code com.nutri.resource.KillSwitchTrippedMapper}.
 */
public class KillSwitchTrippedException extends RuntimeException {
    public KillSwitchTrippedException() {
        super("global kill switch is tripped — all Claude calls paused");
    }
}
