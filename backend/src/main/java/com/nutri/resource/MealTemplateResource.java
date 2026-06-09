package com.nutri.resource;

import com.nutri.auth.CurrentUser;
import com.nutri.model.MealTemplate;
import com.nutri.repository.MealTemplateRepository;
import com.nutri.service.MarmitaService;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.List;
import java.util.UUID;

@Path("/meal-templates")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class MealTemplateResource {

    @Inject MealTemplateRepository repo;
    @Inject MarmitaService marmita;
    @Inject CurrentUser user;

    @GET
    public List<MealTemplate> list() { return repo.all(user.userId()); }

    /**
     * Build a draft marmita from a free-text description (chat-style). Matches ingredients
     * against the user's produtos/comidas and auto-creates a produto for anything new.
     * Returns a non-persisted draft the frontend opens in the editor for review.
     */
    @POST @Path("parse")
    public MarmitaService.Draft parse(ParseRequest req) {
        return marmita.fromText(req == null ? null : req.text());
    }

    public record ParseRequest(String text) {}

    @GET @Path("{id}")
    public Response byId(@PathParam("id") UUID id) {
        return repo.byId(user.userId(), id)
            .map(t -> Response.ok(t).build())
            .orElseGet(() -> Response.status(404).build());
    }

    @POST
    public MealTemplate create(MealTemplate t) { return repo.create(user.userId(), t); }

    @PUT @Path("{id}")
    public MealTemplate update(@PathParam("id") UUID id, MealTemplate t) { return repo.update(user.userId(), id, t); }

    @DELETE @Path("{id}")
    public Response delete(@PathParam("id") UUID id) {
        repo.delete(user.userId(), id);
        return Response.noContent().build();
    }
}
