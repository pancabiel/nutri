package com.nutri.service;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class ProdutoImageUrlsTest {

    static final UUID USER  = UUID.fromString("11111111-1111-1111-1111-111111111111");
    static final UUID OTHER = UUID.fromString("22222222-2222-2222-2222-222222222222");
    static final String BASE = ProdutoImageUrls.storageBase("https://abc.supabase.co/auth/v1");
    static final String OK = "https://abc.supabase.co/storage/v1/object/public/produtos/" + USER + "/3f2a-9c.jpg";

    @Test void derivesStorageBaseFromIssuer() {
        assertEquals("https://abc.supabase.co/storage/v1/object/public/produtos/", BASE);
        assertEquals(BASE, ProdutoImageUrls.storageBase("https://abc.supabase.co/auth/v1/"));
        assertNull(ProdutoImageUrls.storageBase(null));
        assertNull(ProdutoImageUrls.storageBase(""));
        assertNull(ProdutoImageUrls.storageBase("http://abc.supabase.co/auth/v1"));
    }

    @Test void keepsUrlInOwnFolder() {
        assertEquals(OK, ProdutoImageUrls.sanitize(OK, BASE, USER));
    }

    @Test void dropsOtherUsersFolder() {
        assertNull(ProdutoImageUrls.sanitize(OK, BASE, OTHER));
    }

    @Test void dropsOtherBucket() {
        var url = "https://abc.supabase.co/storage/v1/object/public/avatars/" + USER + "/x.jpg";
        assertNull(ProdutoImageUrls.sanitize(url, BASE, USER));
    }

    @Test void dropsExternalAndLookalikeHosts() {
        assertNull(ProdutoImageUrls.sanitize("https://evil.example/pixel.gif", BASE, USER));
        assertNull(ProdutoImageUrls.sanitize("https://abc.supabase.co.evil.example/storage/v1/object/public/produtos/" + USER + "/x.jpg", BASE, USER));
    }

    @Test void dropsTraversalQueryAndNestedPaths() {
        var folder = BASE + USER + "/";
        assertNull(ProdutoImageUrls.sanitize(folder + "../" + OTHER + "/x.jpg", BASE, USER));
        assertNull(ProdutoImageUrls.sanitize(folder + "x.jpg?track=1", BASE, USER));
        assertNull(ProdutoImageUrls.sanitize(folder + "a/x.jpg", BASE, USER));
        assertNull(ProdutoImageUrls.sanitize(folder + "x.svg", BASE, USER));
    }

    @Test void nullsAndMissingConfigFailClosed() {
        assertNull(ProdutoImageUrls.sanitize(null, BASE, USER));
        assertNull(ProdutoImageUrls.sanitize("", BASE, USER));
        assertNull(ProdutoImageUrls.sanitize(OK, null, USER));
    }
}
