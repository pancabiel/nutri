package com.nutri.resource;

import com.nutri.model.FeedPost;
import com.nutri.service.FeedService;
import com.nutri.service.SaveRecipeService;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * The social feed. Under {@link AuthFilter} like everything else (JWT required) — no
 * public path, no cron secret, no Claude call. The single cross-tenant read (posts of
 * people I follow) is enforced in {@link com.nutri.repository.FeedRepository}.
 */
@Path("/feed")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class FeedResource {

    @Inject FeedService feed;
    @Inject SaveRecipeService saveRecipe;

    /**
     * Reverse-chronological feed of who I follow (plus my own posts), keyset-paginated.
     * Pass {@code before} (the last post's createdAt, ISO-8601) AND {@code beforeId} (its id)
     * to fetch the next page; omit both for the first page.
     */
    @GET
    public List<FeedPost> list(@QueryParam("before") String before,
                               @QueryParam("beforeId") UUID beforeId,
                               @QueryParam("limit") @DefaultValue("20") int limit) {
        OffsetDateTime cursor = null;
        if (before != null && !before.isBlank()) {
            try { cursor = OffsetDateTime.parse(before); }
            catch (Exception e) { throw new BadRequestException("invalid 'before' timestamp"); }
        }
        int capped = Math.max(1, Math.min(limit, 50));
        return feed.feed(cursor, beforeId, capped);
    }

    @POST @Path("posts")
    public FeedPost create(FeedPost.CreateRequest req) {
        return feed.create(req);
    }

    @DELETE @Path("posts/{id}")
    public Response delete(@PathParam("id") UUID id) {
        feed.delete(id);
        return Response.noContent().build();
    }

    @POST @Path("posts/{id}/like")
    public Response like(@PathParam("id") UUID id) {
        feed.like(id);
        return Response.noContent().build();
    }

    @DELETE @Path("posts/{id}/like")
    public Response unlike(@PathParam("id") UUID id) {
        feed.unlike(id);
        return Response.noContent().build();
    }

    @POST @Path("posts/{id}/save")
    public SaveRecipeService.SaveResult save(@PathParam("id") UUID id) {
        return saveRecipe.save(id);
    }
}
