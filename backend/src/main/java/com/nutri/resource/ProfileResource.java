package com.nutri.resource;

import com.nutri.auth.CurrentUser;
import com.nutri.model.Profile;
import com.nutri.repository.ProfileRepository;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;

@Path("/profile")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class ProfileResource {

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
}
