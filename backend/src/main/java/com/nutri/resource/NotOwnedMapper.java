package com.nutri.resource;

import com.nutri.repository.NotOwnedException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

import java.util.Map;

@Provider
public class NotOwnedMapper implements ExceptionMapper<NotOwnedException> {

    @Override
    public Response toResponse(NotOwnedException e) {
        return Response.status(Response.Status.NOT_FOUND)
                .type(MediaType.APPLICATION_JSON)
                .entity(Map.of("error", "not_found", "message", e.getMessage()))
                .build();
    }
}
