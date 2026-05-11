package com.nutri.ai;

import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.core.MediaType;
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient;

import java.util.List;
import java.util.Map;

@RegisterRestClient(configKey = "anthropic")
@Path("/v1/messages")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public interface AnthropicClient {

    @POST
    Response create(
        @HeaderParam("x-api-key") String apiKey,
        @HeaderParam("anthropic-version") String version,
        @HeaderParam("content-type") String contentType,
        Request body
    );

    record Request(
        String model,
        Integer max_tokens,
        String system,
        List<Message> messages
    ) {}

    record Message(String role, List<Map<String, Object>> content) {}

    record Response(String id, String model, List<ContentBlock> content, String stop_reason, Usage usage) {}

    record ContentBlock(String type, String text) {}

    record Usage(int input_tokens, int output_tokens) {}
}
