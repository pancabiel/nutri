package com.nutri.resource;

import com.nutri.repository.InUseException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

import java.util.Map;

@Provider
public class InUseMapper implements ExceptionMapper<InUseException> {

    @Override
    public Response toResponse(InUseException e) {
        return Response.status(Response.Status.CONFLICT)
                .type(MediaType.APPLICATION_JSON)
                .entity(Map.of("error", "in_use", "message", e.getMessage()))
                .build();
    }
}
