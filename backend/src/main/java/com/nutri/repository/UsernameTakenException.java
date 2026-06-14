package com.nutri.repository;

/**
 * Thrown when setting a social {@code username} that another user already owns
 * (unique index violation). Mapped to HTTP 409 so the frontend can ask for a
 * different handle instead of surfacing a 500.
 */
public class UsernameTakenException extends RuntimeException {
    public UsernameTakenException(String message) { super(message); }
}
