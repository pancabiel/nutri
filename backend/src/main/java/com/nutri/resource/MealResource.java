package com.nutri.resource;

import com.nutri.auth.CurrentUser;
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
    @Inject CurrentUser user;

    @GET @Path("recent")
    public List<MealRepository.DaySummary> recent(@QueryParam("days") @DefaultValue("30") int days) {
        return repo.recent(user.userId(), days);
    }

    @GET @Path("{date}")
    public MealDay day(@PathParam("date") String date) {
        return repo.getOrCreate(user.userId(), LocalDate.parse(date));
    }

    @POST @Path("{date}/sections")
    public MealDay.MealSection addSection(@PathParam("date") String date, NewSection req) {
        return repo.addSection(user.userId(), LocalDate.parse(date), req.name());
    }

    @PUT @Path("{date}/sections/order")
    public Response reorderSections(@PathParam("date") String date, ReorderSections req) {
        repo.reorderSections(user.userId(), LocalDate.parse(date), req.sectionIds());
        return Response.noContent().build();
    }

    @DELETE @Path("sections/{sectionId}")
    public Response deleteSection(@PathParam("sectionId") UUID id) {
        repo.deleteSection(user.userId(), id);
        return Response.noContent().build();
    }

    @POST @Path("sections/{sectionId}/items")
    public MealDay.MealItem addItem(@PathParam("sectionId") UUID sectionId, MealDay.MealItem item) {
        return repo.addItem(user.userId(), sectionId, item);
    }

    @PUT @Path("items/{itemId}")
    public MealDay.MealItem updateItem(@PathParam("itemId") UUID id, MealDay.MealItem item) {
        return repo.updateItem(user.userId(), id, item);
    }

    @DELETE @Path("items/{itemId}")
    public Response deleteItem(@PathParam("itemId") UUID id) {
        repo.deleteItem(user.userId(), id);
        return Response.noContent().build();
    }

    /**
     * Meal-prep "aplicar na semana": replicate a set of (already snapshotted) items into
     * one section across many dates. The frontend resolves absolute dates and computes the
     * macro snapshots from the template; the backend just validates ownership and inserts.
     */
    @POST @Path("batch")
    public BatchResult batch(BatchRequest req) {
        var dates = req.dates().stream().map(LocalDate::parse).toList();
        int inserted = repo.batchAdd(user.userId(), req.section(), dates, req.items());
        return new BatchResult(inserted, dates.size());
    }

    public record NewSection(String name) {}
    public record ReorderSections(List<UUID> sectionIds) {}
    public record BatchRequest(String section, List<String> dates, List<MealDay.MealItem> items) {}
    public record BatchResult(int inserted, int days) {}
}
