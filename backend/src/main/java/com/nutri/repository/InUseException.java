package com.nutri.repository;

/**
 * Thrown when a delete is blocked because the row is still referenced by another
 * row via a foreign key with {@code on delete restrict} / {@code no action}
 * (e.g. a produto used by a comida or marmita, a comida used by a marmita or a
 * logged day). Mapped to HTTP 409 Conflict so the frontend can show a clear
 * "still in use" message instead of a silent 500.
 */
public class InUseException extends RuntimeException {
    public InUseException(String message) { super(message); }
}
