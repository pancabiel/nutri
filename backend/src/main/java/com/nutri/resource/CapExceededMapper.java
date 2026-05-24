package com.nutri.resource;

import com.nutri.ai.CapExceededException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Maps {@link CapExceededException} to HTTP 402 Payment Required with a JSON body
 * the frontend can use to show the right upgrade modal.
 */
@Provider
public class CapExceededMapper implements ExceptionMapper<CapExceededException> {

    @Override
    public Response toResponse(CapExceededException e) {
        var body = new LinkedHashMap<String, Object>();
        body.put("error", "cap_exceeded");
        body.put("kind", e.kind());
        body.put("tier", e.tier().name().toLowerCase());
        body.put("window", e.window().name().toLowerCase());
        body.put("limit", e.limit());
        body.put("used", e.used());
        body.put("message", message(e));
        return Response.status(402)
                .type(MediaType.APPLICATION_JSON)
                .entity(body)
                .build();
    }

    private static String message(CapExceededException e) {
        if (e.tier() == CapExceededException.Tier.FREE) {
            return switch (e.kind()) {
                case "chat"  -> "Você usou suas " + e.limit() + " mensagens grátis. Assine o Pro para continuar.";
                case "photo" -> "Sua foto grátis já foi usada. Assine o Pro para analisar mais refeições.";
                case "label" -> "Seu scan grátis de rótulo já foi usado. Assine o Pro para escanear mais.";
                default      -> "Limite gratuito atingido. Assine o Pro para continuar.";
            };
        }
        return "Você atingiu o limite diário do Pro (" + e.limit() + "). Volta amanhã ou fale com a gente.";
    }
}
