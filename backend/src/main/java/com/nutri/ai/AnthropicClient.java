package com.nutri.ai;

import com.fasterxml.jackson.annotation.JsonProperty;
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

    /**
     * Token accounting from Anthropic. cache_* fields are optional (absent → 0)
     * and only populated when prompt caching is in use.
     */
    record Usage(
        int input_tokens,
        int output_tokens,
        @JsonProperty("cache_creation_input_tokens") Integer cache_creation_input_tokens,
        @JsonProperty("cache_read_input_tokens") Integer cache_read_input_tokens
    ) {
        public int cacheCreationOrZero() { return cache_creation_input_tokens == null ? 0 : cache_creation_input_tokens; }
        public int cacheReadOrZero()     { return cache_read_input_tokens == null ? 0 : cache_read_input_tokens; }
    }
}
