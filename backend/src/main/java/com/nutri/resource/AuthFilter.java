package com.nutri.resource;

import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;
import org.eclipse.microprofile.config.ConfigProvider;

@Provider
public class AuthFilter implements ContainerRequestFilter {

    @Override
    public void filter(ContainerRequestContext ctx) {
        if ("OPTIONS".equalsIgnoreCase(ctx.getMethod())) return;

        String expected = ConfigProvider.getConfig()
                .getOptionalValue("app.password", String.class)
                .orElse(null);
        String provided = ctx.getHeaderString("X-Auth");
        if (provided == null || expected == null || expected.isBlank() || !expected.equals(provided)) {
            ctx.abortWith(Response.status(Response.Status.UNAUTHORIZED)
                    .header(HttpHeaders.WWW_AUTHENTICATE, "X-Auth")
                    .build());
        }
    }
}
