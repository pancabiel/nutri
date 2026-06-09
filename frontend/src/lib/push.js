// Browser Push API helpers. Pure functions, no React. The subscribe() flow MUST
// be called from inside a user gesture (click) — iOS 16.4+ rejects
// Notification.requestPermission() / pushManager.subscribe() otherwise, and only
// works at all when the PWA is installed to the home screen (standalone).

import { api } from "./api.js";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

/** Convert a base64url VAPID public key into the Uint8Array applicationServerKey wants. */
export function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** base64url-encode an ArrayBuffer (for serializing p256dh / auth keys). */
export function bufToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isPushSupported() {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** True when running as an installed PWA (the iOS prerequisite for push). */
export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

export function getPermission() {
  return "Notification" in window ? Notification.permission : "denied";
}

export function hasVapidKey() {
  return VAPID_PUBLIC_KEY.length > 0;
}

/** Whether a push subscription already exists for this install. */
export async function isSubscribed() {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

/**
 * Request permission + subscribe + register with the backend. Call from a click.
 * Returns { ok, permission } so the UI can branch on denial.
 */
export async function subscribe() {
  if (!isPushSupported()) return { ok: false, permission: "denied" };
  if (!hasVapidKey()) return { ok: false, permission: getPermission(), error: "no-vapid-key" };

  const reg = await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, permission };

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  await api.push.subscribe({
    endpoint: sub.endpoint,
    p256dh: bufToBase64Url(sub.getKey("p256dh")),
    auth: bufToBase64Url(sub.getKey("auth")),
    userAgent: navigator.userAgent,
  });

  return { ok: true, permission };
}

/** Unsubscribe locally and tell the backend to drop the subscription. */
export async function unsubscribe() {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try { await sub.unsubscribe(); } catch { /* ignore */ }
  try { await api.push.unsubscribe({ endpoint }); } catch { /* ignore */ }
}
