package com.nutri.resource;

import com.nutri.ai.KillSwitchTrippedException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

import java.util.Map;

/** 503 + pt-BR message for the global circuit breaker. */
@Provider
public class KillSwitchTrippedMapper implements ExceptionMapper<KillSwitchTrippedException> {

    @Override
    public Response toResponse(KillSwitchTrippedException e) {
        var body = Map.of(
            "error", "kill_switch_tripped",
            "message", "A análise por IA está temporariamente pausada. Tente novamente em alguns minutos."
        );
        return Response.status(Response.Status.SERVICE_UNAVAILABLE)
                .type(MediaType.APPLICATION_JSON)
                .entity(body)
                .build();
    }
}
