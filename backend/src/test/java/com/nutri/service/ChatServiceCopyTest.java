package com.nutri.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ChatServiceCopyTest {

    @Test
    void detectsRepeatMessages() {
        assertTrue(ChatService.wantsCopy("comi as mesmas coisas de ontem"));
        assertTrue(ChatService.wantsCopy("Mesmo café da manhã de ontem"));
        assertTrue(ChatService.wantsCopy("jantei igual ao almoço"));
        assertTrue(ChatService.wantsCopy("repeti o almoço de segunda"));
        assertTrue(ChatService.wantsCopy("comi de novo aquilo"));
    }

    @Test
    void ignoresOrdinaryLogs() {
        assertFalse(ChatService.wantsCopy("2 ovos e uma banana"));
        assertFalse(ChatService.wantsCopy("um copo de leite"));
        assertFalse(ChatService.wantsCopy(null));
    }
}
