package com.nutri.resource;

import com.nutri.model.Comida;
import com.nutri.repository.ComidaRepository;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.List;
import java.util.UUID;

@Path("/comidas")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class ComidaResource {

    @Inject ComidaRepository repo;

    @GET
    public List<Comida> list(@QueryParam("q") String query,
                             @QueryParam("limit") @DefaultValue("100") int limit) {
        return query != null && !query.isBlank() ? repo.search(query, limit) : repo.all();
    }

    @GET @Path("{id}")
    public Response byId(@PathParam("id") UUID id) {
        return repo.byId(id)
            .map(c -> Response.ok(c).build())
            .orElseGet(() -> Response.status(404).build());
    }

    @POST
    public Comida create(Comida c) { return repo.create(c); }

    @PUT @Path("{id}")
    public Comida update(@PathParam("id") UUID id, Comida c) { return repo.update(id, c); }

    @DELETE @Path("{id}")
    public Response delete(@PathParam("id") UUID id) {
        repo.delete(id);
        return Response.noContent().build();
    }
}
