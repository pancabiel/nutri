package com.nutri.resource;

import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.util.Optional;

@Provider
public class AuthFilter implements ContainerRequestFilter {

    @ConfigProperty(name = "app.password")
    Optional<String> expected;

    @Override
    public void filter(ContainerRequestContext ctx) {
        if ("OPTIONS".equalsIgnoreCase(ctx.getMethod())) return;

        String provided = ctx.getHeaderString("X-Auth");
        if (provided == null || expected.isEmpty() || expected.get().isBlank() || !expected.get().equals(provided)) {
            ctx.abortWith(Response.status(Response.Status.UNAUTHORIZED)
                    .header(HttpHeaders.WWW_AUTHENTICATE, "X-Auth")
                    .build());
        }
    }
}
