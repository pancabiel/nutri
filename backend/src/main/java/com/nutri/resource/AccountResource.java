package com.nutri.resource;

import com.nutri.auth.CurrentUser;
import io.agroal.api.AgroalDataSource;
import jakarta.inject.Inject;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;

import java.sql.SQLException;

@Path("/account")
@Produces(MediaType.APPLICATION_JSON)
public class AccountResource {

    private static final Logger LOG = Logger.getLogger(AccountResource.class);

    @Inject AgroalDataSource ds;
    @Inject CurrentUser user;

    /**
     * Deletes the authenticated user from auth.users. ON DELETE CASCADE on all our domain
     * tables wipes the user's produtos, comidas, meal_days (and dependent rows). Supabase
     * also cascades its own auth-related rows (refresh tokens, identities) automatically.
     *
     * After this returns 204, the client must call supabase.auth.signOut() and forget the JWT —
     * it's still cryptographically valid until expiry but its `sub` no longer resolves.
     *
     * Required permission: the DB connection runs as the `postgres.<ref>` role (the project
     * owner) which has authority to delete from auth.users.
     */
    @DELETE
    public Response delete() {
        var userId = user.userId();
        try (var c = ds.getConnection();
             var s = c.prepareStatement("delete from auth.users where id = ?")) {
            s.setObject(1, userId);
            int rows = s.executeUpdate();
            LOG.infof("LGPD delete: user_id=%s rows=%d", userId, rows);
        } catch (SQLException e) {
            LOG.error("failed to delete user " + userId, e);
            return Response.serverError().entity("{\"error\":\"delete_failed\"}").build();
        }
        return Response.noContent().build();
    }
}
