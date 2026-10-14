package com.nutri.ai;

/**
 * Thrown by {@link AiService#call} when the model declines the request
 * ({@code stop_reason: "refusal"}, safety classifiers on Haiku 5.5+). Mapped to
 * HTTP 422 by {@code com.nutri.resource.AiRefusedMapper}. The call is still metered.
 */
public class AiRefusedException extends RuntimeException {
    public AiRefusedException(String kind) {
        super("model refused the request: kind=" + kind);
    }
}
