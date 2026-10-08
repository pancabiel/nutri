package com.nutri.service;

import com.nutri.model.Produto;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Guards {@code produtos.cover_url} / {@code label_url}. Only URLs inside the caller's own
 * folder of the public {@code produtos} bucket survive; anything else is silently dropped to
 * null (same policy as an un-owned {@code matched_id}). The cover goes into feed snapshots
 * that other users render, so an arbitrary external URL would be a tracking pixel.
 *
 * <p>The Supabase host is derived from {@code supabase.jwt-issuer}
 * ({@code https://<ref>.supabase.co/auth/v1}) — no extra env var. Issuer unset → every URL is
 * dropped (fail closed).
 */
@ApplicationScoped
public class ProdutoImageUrls {

    static final String BUCKET = "produtos";
    private static final Pattern FILE = Pattern.compile("[A-Za-z0-9_-]+\\.(jpg|jpeg|png|webp)");

    @ConfigProperty(name = "supabase.jwt-issuer") Optional<String> jwtIssuer;

    /** Returns {@code p} with cover/label URLs outside the user's folder replaced by null. */
    public Produto sanitize(UUID userId, Produto p) {
        if (p == null) return null;
        var base = storageBase(jwtIssuer.orElse(null));
        var cover = sanitize(p.coverUrl(), base, userId);
        var label = sanitize(p.labelUrl(), base, userId);
        if (eq(cover, p.coverUrl()) && eq(label, p.labelUrl())) return p;
        return new Produto(p.id(), p.name(), p.brand(), p.caloriesPerGram(), p.proteinPerGram(),
            p.carbsPerGram(), p.fatPerGram(), p.servingGrams(), p.servingLabel(),
            cover, label, p.createdAt());
    }

    /** {@code https://<ref>.supabase.co/auth/v1} → {@code https://<ref>.supabase.co/storage/v1/object/public/produtos/}. */
    static String storageBase(String issuer) {
        if (issuer == null || issuer.isBlank()) return null;
        var host = issuer.strip().replaceAll("/+$", "");
        if (host.endsWith("/auth/v1")) host = host.substring(0, host.length() - "/auth/v1".length());
        if (!host.startsWith("https://")) return null;
        return host + "/storage/v1/object/public/" + BUCKET + "/";
    }

    static String sanitize(String url, String storageBase, UUID userId) {
        if (url == null || url.isBlank() || storageBase == null || userId == null) return null;
        var prefix = storageBase + userId + "/";
        if (!url.startsWith(prefix)) return null;
        return FILE.matcher(url.substring(prefix.length())).matches() ? url : null;
    }

    private static boolean eq(String a, String b) { return a == null ? b == null : a.equals(b); }
}
