package com.nutri.resource;

import com.nutri.auth.CurrentUser;
import com.nutri.model.Profile;
import com.nutri.repository.ProfileRepository;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;

import java.util.regex.Pattern;

@Path("/profile")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class ProfileResource {

    // 3–20 chars, lowercase letters/digits/underscore. Validated here before hitting the
    // unique index so we return 400 for malformed handles and reserve 409 for "taken".
    private static final Pattern USERNAME = Pattern.compile("^[a-z0-9_]{3,20}$");

    @Inject ProfileRepository repo;
    @Inject CurrentUser user;

    @GET
    public Profile me() {
        return repo.getOrCreate(user.userId());
    }

    @PUT
    public Profile update(ProfileRepository.OnboardingUpdate u) {
        return repo.updateOnboarding(user.userId(), u);
    }

    /**
     * Sets the social identity (username/display name/avatar/bio). Kept separate from the
     * onboarding PUT so neither path coalesces the other's columns. A null username leaves
     * the existing one untouched (setSocial coalesces); a present one is validated + uniqued
     * (409 via {@link com.nutri.repository.UsernameTakenException}).
     */
    @PUT @Path("social")
    public Profile updateSocial(SocialUpdate s) {
        String username = s == null ? null : normalize(s.username());
        if (username != null && !USERNAME.matcher(username).matches())
            throw new BadRequestException("username must be 3–20 chars of a–z, 0–9 or _");
        return repo.setSocial(user.userId(), username,
            s == null ? null : trimOrNull(s.displayName()),
            s == null ? null : trimOrNull(s.avatarUrl()),
            s == null ? null : trimOrNull(s.bio()));
    }

    private static String normalize(String u) {
        if (u == null) return null;
        u = u.trim().toLowerCase();
        return u.isEmpty() ? null : u;
    }

    private static String trimOrNull(String v) {
        if (v == null) return null;
        v = v.trim();
        return v.isEmpty() ? null : v;
    }

    public record SocialUpdate(String username, String displayName, String avatarUrl, String bio) {}
}
