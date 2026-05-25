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
     * Deletes the authenticated user from auth.users. ON DELETE CASCADE on our domain
     * tables wipes meal_days (→ sections → items), profiles, and usage_events. Supabase
     * also cascades its own auth-related rows (refresh tokens, identities) automatically.
     *
     * Produtos and comidas are deleted explicitly first because:
     *   - comida_produtos.produto_id is ON DELETE RESTRICT (protects produto deletion when
     *     in use by a comida) — fires before the comidas→comida_produtos cascade can run.
     *   - meal_items.produto_id is NO ACTION (deferred to end of statement, not transaction),
     *     so a separate `delete from produtos` errors if meal_items still reference them.
     * Order: meal_days (cascades to meal_sections → meal_items) → comidas (cascades to
     * comida_produtos) → produtos → auth.users (cascades to profiles, usage_events).
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
        try (var c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                try (var s = c.prepareStatement("delete from meal_days where user_id = ?")) {
                    s.setObject(1, userId);
                    s.executeUpdate();
                }
                try (var s = c.prepareStatement("delete from comidas where user_id = ?")) {
                    s.setObject(1, userId);
                    s.executeUpdate();
                }
                try (var s = c.prepareStatement("delete from produtos where user_id = ?")) {
                    s.setObject(1, userId);
                    s.executeUpdate();
                }
                int rows;
                try (var s = c.prepareStatement("delete from auth.users where id = ?")) {
                    s.setObject(1, userId);
                    rows = s.executeUpdate();
                }
                c.commit();
                LOG.infof("LGPD delete: user_id=%s rows=%d", userId, rows);
            } catch (SQLException e) {
                c.rollback();
                throw e;
            }
        } catch (SQLException e) {
            LOG.error("failed to delete user " + userId, e);
            return Response.serverError().entity("{\"error\":\"delete_failed\"}").build();
        }
        return Response.noContent().build();
    }
}
