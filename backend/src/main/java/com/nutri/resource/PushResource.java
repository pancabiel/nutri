package com.nutri.resource;

import com.nutri.auth.CurrentUser;
import com.nutri.model.NotificationPrefs;
import com.nutri.model.PushSubscription;
import com.nutri.repository.NotificationPrefsRepository;
import com.nutri.repository.PushSubscriptionRepository;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

/**
 * Push subscription + reminder preference endpoints. Behind {@link AuthFilter}
 * (not in PUBLIC_PATHS, not under {@code cron/}) so every call requires a valid
 * Supabase JWT and is scoped to the authenticated user.
 */
@Path("/push")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class PushResource {

    @Inject CurrentUser user;
    @Inject PushSubscriptionRepository subs;
    @Inject NotificationPrefsRepository prefs;

    @POST
    @Path("subscribe")
    public Response subscribe(PushSubscription.SubscribeRequest r) {
        if (r == null || r.endpoint() == null || r.endpoint().isBlank()
                || r.p256dh() == null || r.auth() == null) {
            return Response.status(Response.Status.BAD_REQUEST).build();
        }
        subs.upsert(user.userId(), r);
        return Response.noContent().build();
    }

    @POST
    @Path("unsubscribe")
    public Response unsubscribe(PushSubscription.UnsubscribeRequest r) {
        if (r == null || r.endpoint() == null || r.endpoint().isBlank()) {
            return Response.status(Response.Status.BAD_REQUEST).build();
        }
        subs.deleteByEndpoint(user.userId(), r.endpoint());
        return Response.noContent().build();
    }

    @GET
    @Path("prefs")
    public NotificationPrefs getPrefs() {
        return prefs.getOrCreate(user.userId());
    }

    @PUT
    @Path("prefs")
    public NotificationPrefs setPrefs(NotificationPrefs p) {
        return prefs.upsert(user.userId(), p);
    }
}
