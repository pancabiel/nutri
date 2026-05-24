package com.nutri.resource;

import com.nutri.auth.CurrentUser;
import com.nutri.auth.JwtValidator;
import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.util.Optional;
import java.util.Set;

/**
 * Validates the Supabase access token on the Authorization header and populates
 * {@link CurrentUser} for downstream beans. The {@code /q/health} probe and CORS
 * preflight are bypassed.
 */
@Provider
@ApplicationScoped
public class AuthFilter implements ContainerRequestFilter {

    private static final Logger LOG = Logger.getLogger(AuthFilter.class);
    private static final Set<String> PUBLIC_PATHS = Set.of(
            "q/health", "q/health/ready", "q/health/live",
            // Stripe webhook authenticates via signed payload (Stripe-Signature header), not a Supabase JWT.
            "billing/webhook");
    // Cron endpoints authenticate via X-Cron-Secret inside the handler, not via Supabase JWT.
    private static final String CRON_PREFIX = "cron/";

    @Inject CurrentUser currentUser;

    @ConfigProperty(name = "supabase.jwt-secret") Optional<String> jwtSecret;
    @ConfigProperty(name = "supabase.jwt-issuer") Optional<String> jwtIssuer;
    @ConfigProperty(name = "supabase.jwks-url")   Optional<String> jwksUrl;

    private JwtValidator validator;

    @PostConstruct
    void init() {
        String issuer = jwtIssuer.filter(s -> !s.isBlank()).orElse(null);
        String secret = jwtSecret.filter(s -> !s.isBlank()).orElse(null);
        // Derive JWKS URL from issuer if not set explicitly (issuer + /.well-known/jwks.json).
        String effectiveJwks = jwksUrl.filter(s -> !s.isBlank())
                .orElseGet(() -> issuer != null ? issuer + "/.well-known/jwks.json" : null);
        if (effectiveJwks == null && secret == null) {
            LOG.warn("neither supabase.jwks-url/issuer nor supabase.jwt-secret is set — all requests will be rejected");
            return;
        }
        this.validator = new JwtValidator(effectiveJwks, issuer, secret);
    }

    @Override
    public void filter(ContainerRequestContext ctx) {
        if ("OPTIONS".equalsIgnoreCase(ctx.getMethod())) return;
        // Normalize: strip leading slash so matches are stable across runtimes
        // (quarkus-amazon-lambda-http in dev mode hands back a path with leading slash).
        String path = ctx.getUriInfo().getPath();
        if (path.startsWith("/")) path = path.substring(1);
        if (PUBLIC_PATHS.contains(path)) return;
        if (path.startsWith(CRON_PREFIX)) return;

        if (validator == null) {
            abort(ctx, "auth not configured");
            return;
        }

        String header = ctx.getHeaderString(HttpHeaders.AUTHORIZATION);
        if (header == null || !header.startsWith("Bearer ")) {
            abort(ctx, "missing bearer token");
            return;
        }
        String token = header.substring("Bearer ".length()).trim();

        try {
            JwtValidator.Claims claims = validator.validate(token);
            currentUser.set(claims.userId(), claims.email());
        } catch (JwtValidator.InvalidJwtException e) {
            LOG.debugf("rejecting request: %s", e.getMessage());
            abort(ctx, e.getMessage());
        }
    }

    private static void abort(ContainerRequestContext ctx, String reason) {
        ctx.abortWith(Response.status(Response.Status.UNAUTHORIZED)
                .header(HttpHeaders.WWW_AUTHENTICATE, "Bearer error=\"invalid_token\"")
                .entity("{\"error\":\"unauthorized\",\"reason\":\"" + reason + "\"}")
                .type("application/json")
                .build());
    }
}
