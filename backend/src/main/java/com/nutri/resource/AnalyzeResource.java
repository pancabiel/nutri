package com.nutri.resource;

import com.nutri.ai.AiService;
import com.nutri.service.ChatService;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;

@Path("/")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class AnalyzeResource {

    @Inject AiService ai;
    @Inject ChatService chat;

    @POST @Path("analyze-meal-image")
    public ChatService.ChatResult analyzeMeal(ImageRequest req) {
        var items = ai.analyzeMealImage(req.imageBase64(), defaultMime(req.mediaType()));
        return chat.saveParsed(items, null, null);
    }

    @POST @Path("scan-nutrition-label")
    public AiService.NutritionLabel scanLabel(ImageRequest req) {
        return ai.scanNutritionLabel(req.imageBase64(), defaultMime(req.mediaType()));
    }

    private static String defaultMime(String m) { return m == null || m.isBlank() ? "image/jpeg" : m; }

    public record ImageRequest(String imageBase64, String mediaType) {}
}
