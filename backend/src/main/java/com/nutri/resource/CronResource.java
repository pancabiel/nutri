package com.nutri.resource;

import com.nutri.repository.KillSwitchRepository;
import com.nutri.repository.UsageRepository;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Optional;

/**
 * Endpoints invoked by EventBridge on a schedule. Not behind the Supabase JWT —
 * protected by a shared secret in the {@code X-Cron-Secret} header. If
 * {@code cron.secret} is unset the endpoint fails closed (rejects everything) so
 * a misconfigured deploy can't be probed.
 *
 * <h3>One-time EventBridge wiring</h3>
 * Set {@code CRON_SECRET} on the Lambda env (also in GitHub Secrets so the deploy
 * workflow passes it through). Generate with {@code openssl rand -hex 32}. Then:
 *
 * <pre>
 * aws scheduler create-schedule \
 *   --name nutri-kill-switch-check \
 *   --schedule-expression "rate(1 hour)" \
 *   --flexible-time-window "Mode=OFF" \
 *   --target '{
 *     "Arn": "arn:aws:scheduler:::http-invoke",
 *     "RoleArn": "arn:aws:iam::&lt;acct&gt;:role/nutri-scheduler-role",
 *     "HttpParameters": { "HeaderParameters": { "X-Cron-Secret": "&lt;secret&gt;" } },
 *     "Input": "{}",
 *     "RetryPolicy": { "MaximumRetryAttempts": 2 }
 *   }' \
 *   --target-endpoint https://&lt;api-id&gt;.execute-api.&lt;region&gt;.amazonaws.com/cron/kill-switch-check
 * </pre>
 *
 * Alternative if EventBridge Scheduler HTTP target isn't available: a tiny scheduled
 * Lambda that curls the endpoint, or a GitHub Actions cron workflow.
 *
 * <h3>Smoke test</h3>
 * <pre>curl -X POST -H "X-Cron-Secret: $SECRET" $URL/cron/kill-switch-check</pre>
 *
 * Response: {@code {window_hours,threshold_usd,spend_usd,tripped_before,action}}.
 * Manual reset of a tripped switch:
 * {@code update kill_switch set tripped = false where id = 'global';}.
 */
@Path("/cron")
@Produces(MediaType.APPLICATION_JSON)
public class CronResource {

    private static final Logger LOG = Logger.getLogger(CronResource.class);

    @Inject UsageRepository usage;
    @Inject KillSwitchRepository killSwitch;

    @ConfigProperty(name = "cron.secret")                       Optional<String> cronSecret;
    @ConfigProperty(name = "killswitch.daily-usd-threshold",
                    defaultValue = "50")                        double dailyUsdThreshold;
    @ConfigProperty(name = "killswitch.window-hours",
                    defaultValue = "24")                        int windowHours;

    /**
     * Aggregate the last {@code windowHours} of {@code usage_events}. Trip the kill
     * switch if the spend exceeds {@code dailyUsdThreshold}. Idempotent — safe to
     * call repeatedly; the switch only auto-trips, never auto-resets.
     */
    @POST
    @Path("kill-switch-check")
    public Response killSwitchCheck(@HeaderParam("X-Cron-Secret") String providedSecret) {
        if (!secretMatches(providedSecret)) {
            return Response.status(Response.Status.UNAUTHORIZED).build();
        }

        var since = Instant.now().minus(Duration.ofHours(windowHours));
        long microUsd = usage.globalCostMicroUsdSince(since);
        long thresholdMicro = (long) (dailyUsdThreshold * 1_000_000L);

        var body = new LinkedHashMap<String, Object>();
        body.put("window_hours", windowHours);
        body.put("threshold_usd", dailyUsdThreshold);
        body.put("spend_usd", microUsd / 1_000_000.0);
        body.put("tripped_before", killSwitch.isTripped());

        if (microUsd > thresholdMicro) {
            String reason = "auto-trip: 24h spend $"
                    + String.format("%.2f", microUsd / 1_000_000.0)
                    + " > threshold $" + dailyUsdThreshold;
            killSwitch.trip(reason, microUsd);
            body.put("action", "tripped");
        } else {
            body.put("action", "ok");
        }
        return Response.ok(body).build();
    }

    private boolean secretMatches(String provided) {
        var expected = cronSecret.filter(s -> !s.isBlank()).orElse(null);
        if (expected == null) {
            LOG.warn("cron.secret is not configured — rejecting cron call");
            return false;
        }
        return provided != null && constantTimeEquals(provided, expected);
    }

    private static boolean constantTimeEquals(String a, String b) {
        if (a.length() != b.length()) return false;
        int diff = 0;
        for (int i = 0; i < a.length(); i++) diff |= a.charAt(i) ^ b.charAt(i);
        return diff == 0;
    }
}
