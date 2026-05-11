package com.nutri.resource;

import com.nutri.service.ChatService;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

import java.time.LocalDate;

@Path("/chat-log")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class ChatResource {

    @Inject ChatService chat;

    @POST
    public ChatService.ChatResult log(ChatRequest req) {
        var date = req.date() != null && !req.date().isBlank() ? LocalDate.parse(req.date()) : null;
        return chat.log(req.message(), date, req.section());
    }

    public record ChatRequest(String message, String date, String section) {}
}
