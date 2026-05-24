package com.nutri.billing;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nutri.model.Profile;
import com.nutri.repository.ProfileRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

/**
 * Orchestrates billing flows on top of {@link StripeClient} + {@link ProfileRepository}.
 *
 * <p>Lifecycle:
 * <ol>
 *   <li>User clicks "Assinar" → {@code startCheckout} creates (or reuses) the Stripe
 *       customer and returns the Checkout URL.</li>
 *   <li>User pays in hosted Checkout → Stripe redirects to success_url and fires
 *       webhooks ({@code checkout.session.completed}, then
 *       {@code customer.subscription.created/updated}).</li>
 *   <li>{@code handleWebhook} flips is_pro / records subscription id / sets pro_until.</li>
 *   <li>Cancellations or payment failures arrive as {@code customer.subscription.updated}
 *       or {@code .deleted} and propagate through the same path.</li>
 * </ol>
 */
@ApplicationScoped
public class BillingService {

    private static final Logger LOG = Logger.getLogger(BillingService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Inject StripeClient stripe;
    @Inject ProfileRepository profiles;

    @ConfigProperty(name = "stripe.price.monthly") Optional<String> priceMonthly;
    @ConfigProperty(name = "stripe.price.yearly")  Optional<String> priceYearly;
    @ConfigProperty(name = "app.frontend-url")     String frontendUrl;

    /** Plans we accept from the frontend — matches {@code stripe.price.*} keys. */
    public enum Plan { MONTHLY, YEARLY }

    /**
     * Returns the Stripe Checkout URL for {@code plan}. Creates a Stripe customer on
     * first call and persists the id, so subsequent checkouts and the Portal call
     * reuse it.
     */
    public String startCheckout(UUID userId, String email, Plan plan) {
        if (!stripe.isConfigured()) {
            throw new IllegalStateException("Stripe is not configured on this environment");
        }
        String priceId = switch (plan) {
            case MONTHLY -> priceMonthly.filter(s -> !s.isBlank())
                    .orElseThrow(() -> new IllegalStateException("stripe.price.monthly not set"));
            case YEARLY  -> priceYearly.filter(s -> !s.isBlank())
                    .orElseThrow(() -> new IllegalStateException("stripe.price.yearly not set"));
        };

        String customerId = ensureCustomer(userId, email);

        String base = trimTrailingSlash(frontendUrl);
        String successUrl = base + "/?billing=success";
        String cancelUrl  = base + "/?billing=cancel";

        return stripe.createCheckoutSession(customerId, priceId, successUrl, cancelUrl, userId.toString());
    }

    /** Returns the Stripe Customer Portal URL. User must already have a customer (i.e. ever subscribed). */
    public String startPortal(UUID userId) {
        if (!stripe.isConfigured()) {
            throw new IllegalStateException("Stripe is not configured on this environment");
        }
        Profile p = profiles.getOrCreate(userId);
        Optional<String> cid = currentCustomerId(p);
        if (cid.isEmpty()) {
            throw new IllegalStateException("no Stripe customer for this user — start a checkout first");
        }
        String base = trimTrailingSlash(frontendUrl);
        return stripe.createPortalSession(cid.get(), base + "/?billing=portal-return");
    }

    /**
     * Verifies the webhook signature and dispatches the event. Returns true if the
     * signature was valid (regardless of whether the event type was handled — Stripe
     * documents that 2xx ACKs everything).
     */
    public boolean handleWebhook(String payload, String signatureHeader) {
        if (!stripe.verifyWebhookSignature(payload, signatureHeader)) {
            return false;
        }
        try {
            JsonNode event = MAPPER.readTree(payload);
            String type = event.path("type").asText();
            JsonNode obj = event.path("data").path("object");
            LOG.infof("stripe webhook: type=%s id=%s", type, event.path("id").asText());

            switch (type) {
                case "checkout.session.completed" -> handleCheckoutCompleted(obj);
                case "customer.subscription.created",
                     "customer.subscription.updated" -> handleSubscriptionUpsert(obj);
                case "customer.subscription.deleted" -> handleSubscriptionDeleted(obj);
                case "invoice.payment_failed" -> LOG.infof(
                        "invoice.payment_failed for customer=%s — Stripe Smart Retries will retry",
                        obj.path("customer").asText());
                default -> LOG.debugf("ignoring stripe event type: %s", type);
            }
        } catch (Exception e) {
            // Never fail back to Stripe: a 5xx makes them retry up to 3 days. Log + ack.
            LOG.errorf(e, "error handling stripe webhook (signature was valid)");
        }
        return true;
    }

    private void handleCheckoutCompleted(JsonNode session) {
        String customerId     = session.path("customer").asText(null);
        String subscriptionId = session.path("subscription").asText(null);
        String clientRefId    = session.path("client_reference_id").asText(null);
        if (customerId == null || clientRefId == null) {
            LOG.warnf("checkout.session.completed missing customer or client_reference_id: %s", session);
            return;
        }
        UUID userId;
        try {
            userId = UUID.fromString(clientRefId);
        } catch (IllegalArgumentException e) {
            LOG.warnf("checkout.session.completed has non-UUID client_reference_id: %s", clientRefId);
            return;
        }
        // Initial activation; pro_until gets filled by the follow-up subscription event.
        profiles.applySubscriptionEvent(userId, customerId, subscriptionId, "active", null);
    }

    private void handleSubscriptionUpsert(JsonNode sub) {
        String customerId = sub.path("customer").asText(null);
        String subId      = sub.path("id").asText(null);
        String status     = sub.path("status").asText(null);
        OffsetDateTime periodEnd = epochSecondsToOffset(sub.path("current_period_end"));

        UUID userId = resolveUserId(customerId);
        if (userId == null) {
            LOG.warnf("subscription event for unknown customer=%s (sub=%s) — ignoring", customerId, subId);
            return;
        }
        profiles.applySubscriptionEvent(userId, customerId, subId, status, periodEnd);
    }

    private void handleSubscriptionDeleted(JsonNode sub) {
        String customerId = sub.path("customer").asText(null);
        UUID userId = resolveUserId(customerId);
        if (userId == null) {
            LOG.warnf("subscription.deleted for unknown customer=%s — ignoring", customerId);
            return;
        }
        profiles.clearSubscription(userId, "canceled");
    }

    private UUID resolveUserId(String customerId) {
        if (customerId == null) return null;
        return profiles.byStripeCustomerId(customerId).orElse(null);
    }

    private String ensureCustomer(UUID userId, String email) {
        Profile p = profiles.getOrCreate(userId);
        Optional<String> existing = currentCustomerId(p);
        if (existing.isPresent()) return existing.get();

        String customerId = stripe.createCustomer(email, userId.toString());
        profiles.setStripeCustomerId(userId, customerId);
        return customerId;
    }

    /** Profile doesn't expose customer_id directly today — refetch via a focused query. */
    private Optional<String> currentCustomerId(Profile p) {
        return profiles.stripeCustomerId(p.userId());
    }

    private static OffsetDateTime epochSecondsToOffset(JsonNode n) {
        if (n == null || n.isMissingNode() || n.isNull()) return null;
        long s = n.asLong(0);
        return s > 0 ? OffsetDateTime.ofInstant(Instant.ofEpochSecond(s), ZoneOffset.UTC) : null;
    }

    private static String trimTrailingSlash(String s) {
        if (s == null || s.isEmpty()) return s;
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }
}
