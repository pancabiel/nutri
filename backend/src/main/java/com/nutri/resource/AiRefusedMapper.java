package com.nutri.resource;

import com.nutri.ai.AiRefusedException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

import java.util.Map;

/** 422 + pt-BR message when the model declines the request. */
@Provider
public class AiRefusedMapper implements ExceptionMapper<AiRefusedException> {

    @Override
    public Response toResponse(AiRefusedException e) {
        var body = Map.of(
            "error", "ai_refused",
            "message", "A IA não conseguiu processar esse pedido. Tente descrever de outro jeito."
        );
        return Response.status(422)
                .type(MediaType.APPLICATION_JSON)
                .entity(body)
                .build();
    }
}
