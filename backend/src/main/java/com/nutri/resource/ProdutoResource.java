package com.nutri.resource;

import com.nutri.model.Produto;
import com.nutri.repository.ProdutoRepository;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.List;
import java.util.UUID;

@Path("/produtos")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class ProdutoResource {

    @Inject ProdutoRepository repo;

    @GET
    public List<Produto> list(@QueryParam("q") String query,
                              @QueryParam("limit") @DefaultValue("100") int limit) {
        return query != null && !query.isBlank() ? repo.search(query, limit) : repo.all();
    }

    @GET @Path("{id}")
    public Response byId(@PathParam("id") UUID id) {
        return repo.byId(id)
            .map(p -> Response.ok(p).build())
            .orElseGet(() -> Response.status(404).build());
    }

    @POST
    public Produto create(Produto p) { return repo.create(p); }

    @PUT @Path("{id}")
    public Produto update(@PathParam("id") UUID id, Produto p) { return repo.update(id, p); }

    @DELETE @Path("{id}")
    public Response delete(@PathParam("id") UUID id) {
        repo.delete(id);
        return Response.noContent().build();
    }
}
