package com.nutri.auth;

import jakarta.enterprise.context.RequestScoped;

import java.util.UUID;

/**
 * Holds the authenticated user identity for the current HTTP request.
 * Populated by {@link com.nutri.resource.AuthFilter} from the validated JWT.
 */
@RequestScoped
public class CurrentUser {

    private UUID userId;
    private String email;

    public void set(UUID userId, String email) {
        this.userId = userId;
        this.email = email;
    }

    public UUID userId() {
        if (userId == null) throw new IllegalStateException("no authenticated user in scope");
        return userId;
    }

    public String email() { return email; }

    public boolean isAuthenticated() { return userId != null; }
}
