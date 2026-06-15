package com.nutri.resource;

import com.nutri.auth.CurrentUser;
import com.nutri.model.FeedPost;
import com.nutri.model.SocialProfile;
import com.nutri.repository.FeedRepository;
import com.nutri.repository.FollowRepository;
import com.nutri.repository.ProfileRepository;
import io.quarkus.runtime.annotations.RegisterForReflection;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.List;
import java.util.UUID;

/**
 * Social discovery + the follow graph. The ONLY way to read another user's profile —
 * each endpoint selects just the public columns (username/display/avatar/bio + counts),
 * never the private/LGPD columns of {@code profiles}. Under {@link AuthFilter} (JWT).
 */
@Path("/users")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class UserResource {

    @Inject ProfileRepository profiles;
    @Inject FollowRepository follows;
    @Inject FeedRepository feed;
    @Inject CurrentUser user;

    @GET @Path("search")
    public List<SocialProfile> search(@QueryParam("q") String q,
                                      @QueryParam("limit") @DefaultValue("20") int limit) {
        if (q == null || q.isBlank()) return List.of();
        return profiles.search(user.userId(), q.trim(), Math.max(1, Math.min(limit, 50)));
    }

    /**
     * Public profile by @username, plus their posts IF the viewer is allowed to see them
     * (is the author, or follows them). Otherwise the posts list is empty — the profile
     * card (with a Follow button) still shows. Keeps the cross-follow gate consistent
     * with the feed.
     */
    @GET @Path("{username}")
    public Response profile(@PathParam("username") String username) {
        var viewer = user.userId();
        var sp = profiles.publicProfile(viewer, username).orElse(null);
        if (sp == null) return Response.status(404).build();
        boolean canSee = sp.isSelf() || sp.isFollowing();
        List<FeedPost> posts = canSee
            ? feed.feed(viewer, List.of(sp.userId()), null, null, 30)
            : List.of();
        return Response.ok(new ProfileView(sp, posts)).build();
    }

    @POST @Path("{id}/follow")
    public SocialProfile follow(@PathParam("id") UUID id) {
        follows.follow(user.userId(), id);
        return profiles.publicProfileById(user.userId(), id)
            .orElseThrow(() -> new NotFoundException("user not found"));
    }

    @DELETE @Path("{id}/follow")
    public SocialProfile unfollow(@PathParam("id") UUID id) {
        follows.unfollow(user.userId(), id);
        return profiles.publicProfileById(user.userId(), id)
            .orElseThrow(() -> new NotFoundException("user not found"));
    }

    // Returned via Response.ok(...) rather than as the method's declared return type, so
    // Quarkus's build-time scanner can't see it and won't register its record components
    // for reflection — which makes Jackson fail to serialize it in the native image
    // ("No serializer found ... no properties discovered"). Register it explicitly.
    @RegisterForReflection
    public record ProfileView(SocialProfile profile, List<FeedPost> posts) {}
}
