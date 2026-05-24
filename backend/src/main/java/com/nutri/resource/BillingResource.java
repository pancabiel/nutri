package com.nutri.resource;

import com.nutri.auth.CurrentUser;
import com.nutri.billing.BillingService;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.List;
import java.util.Map;

/**
 * Three endpoints back the billing flow:
 *
 * <ul>
 *   <li>{@code POST /billing/checkout} — auth'd; body {@code {"plan":"monthly"|"yearly"}};
 *       returns {@code {"url":"https://checkout.stripe.com/..."}} for the frontend to
 *       {@code window.location.assign(url)}.</li>
 *   <li>{@code GET /billing/portal} — auth'd; returns {@code {"url":...}} for the Stripe
 *       Customer Portal (cancel, swap card, see invoices).</li>
 *   <li>{@code POST /billing/webhook} — NOT auth'd via JWT (bypassed in {@link AuthFilter});
 *       authenticates via the {@code Stripe-Signature} header. Always returns 200 to a
 *       valid signature even if we choose not to act on the event — Stripe retries 5xx
 *       for up to 3 days, which is noisy.</li>
 * </ul>
 */
@Path("/billing")
@Produces(MediaType.APPLICATION_JSON)
public class BillingResource {

    @Inject BillingService billing;
    @Inject CurrentUser user;

    public record CheckoutRequest(String plan) {}

    @POST
    @Path("checkout")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response checkout(CheckoutRequest req) {
        if (req == null || req.plan() == null) {
            return badRequest("missing 'plan'");
        }
        BillingService.Plan plan;
        try {
            plan = BillingService.Plan.valueOf(req.plan().toUpperCase());
        } catch (IllegalArgumentException e) {
            return badRequest("invalid plan: expected 'monthly' or 'yearly'");
        }
        try {
            String url = billing.startCheckout(user.userId(), user.email(), plan);
            return Response.ok(Map.of("url", url)).build();
        } catch (IllegalStateException e) {
            return Response.status(503).entity(Map.of("error", "billing_unavailable", "message", e.getMessage())).build();
        }
    }

    @GET
    @Path("portal")
    public Response portal() {
        try {
            String url = billing.startPortal(user.userId());
            return Response.ok(Map.of("url", url)).build();
        } catch (IllegalStateException e) {
            return Response.status(409).entity(Map.of("error", "no_subscription", "message", e.getMessage())).build();
        }
    }

    @POST
    @Path("webhook")
    @Consumes(MediaType.WILDCARD)
    public Response webhook(@Context HttpHeaders headers, String payload) {
        // Stripe-Signature is a comma-separated list (t=…,v1=…). Some HTTP runtimes
        // (notably API Gateway HTTP integration via quarkus-amazon-lambda-http) split
        // the header on commas into multiple values, so @HeaderParam(String) only
        // returns the first chunk. Re-join everything we got.
        List<String> sigParts = headers.getRequestHeader("Stripe-Signature");
        String signature = (sigParts == null || sigParts.isEmpty()) ? null
                : String.join(",", sigParts);
        boolean ok = billing.handleWebhook(payload, signature);
        if (!ok) {
            return Response.status(400).entity(Map.of("error", "invalid_signature")).build();
        }
        return Response.ok(Map.of("received", true)).build();
    }

    private static Response badRequest(String message) {
        return Response.status(400).entity(Map.of("error", "bad_request", "message", message)).build();
    }
}
