package com.nutri.resource;

import com.nutri.model.MealDay;
import com.nutri.repository.MealRepository;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Path("/meal-days")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class MealResource {

    @Inject MealRepository repo;

    @GET @Path("recent")
    public List<MealRepository.DaySummary> recent(@QueryParam("days") @DefaultValue("30") int days) {
        return repo.recent(days);
    }

    @GET @Path("{date}")
    public MealDay day(@PathParam("date") String date) {
        return repo.getOrCreate(LocalDate.parse(date));
    }

    @POST @Path("{date}/sections")
    public MealDay.MealSection addSection(@PathParam("date") String date, NewSection req) {
        return repo.addSection(LocalDate.parse(date), req.name());
    }

    @DELETE @Path("sections/{sectionId}")
    public Response deleteSection(@PathParam("sectionId") UUID id) {
        repo.deleteSection(id);
        return Response.noContent().build();
    }

    @POST @Path("sections/{sectionId}/items")
    public MealDay.MealItem addItem(@PathParam("sectionId") UUID sectionId, MealDay.MealItem item) {
        return repo.addItem(sectionId, item);
    }

    @PUT @Path("items/{itemId}")
    public MealDay.MealItem updateItem(@PathParam("itemId") UUID id, MealDay.MealItem item) {
        return repo.updateItem(id, item);
    }

    @DELETE @Path("items/{itemId}")
    public Response deleteItem(@PathParam("itemId") UUID id) {
        repo.deleteItem(id);
        return Response.noContent().build();
    }

    public record NewSection(String name) {}
}
