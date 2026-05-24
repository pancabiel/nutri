package com.nutri.repository;

/**
 * Thrown when a repository operation references a row that either doesn't exist
 * or belongs to a different user. Mapped to HTTP 404 so we don't leak the
 * distinction between "no such id" and "exists but not yours" — same shape an
 * attacker would see probing for valid IDs.
 */
public class NotOwnedException extends RuntimeException {
    public NotOwnedException(String message) { super(message); }
}
