package com.nutri.resource;

import com.nutri.repository.UsernameTakenException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

import java.util.Map;

@Provider
public class UsernameTakenMapper implements ExceptionMapper<UsernameTakenException> {

    @Override
    public Response toResponse(UsernameTakenException e) {
        return Response.status(Response.Status.CONFLICT)
                .type(MediaType.APPLICATION_JSON)
                .entity(Map.of("error", "username_taken", "message", e.getMessage()))
                .build();
    }
}
