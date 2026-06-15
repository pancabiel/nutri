import { supabase, currentToken } from "./supabase.js";

const BASE = import.meta.env.VITE_API_BASE || "/api";

/**
 * Thrown when the backend returns 402 with a CapExceededMapper body. The original
 * JSON ({kind, tier, window, limit, used, message}) is attached as `.cap` so the
 * upgrade modal can show the right copy. App.jsx also listens for the global
 * `nutri:cap-exceeded` event so it can pop the modal without each caller wiring
 * its own handler.
 */
export class CapError extends Error {
  constructor(cap) {
    super(cap?.message || "Limite atingido");
    this.name = "CapError";
    this.cap = cap;
  }
}

async function http(path, opts = {}) {
  const token = await currentToken();
  const res = await fetch(BASE + path, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
    ...opts,
  });
  if (res.status === 401) {
    // Token expired or invalid — push the user back to the login screen.
    await supabase.auth.signOut();
    window.location.reload();
    throw new Error("401 Unauthorized");
  }
  if (res.status === 402) {
    let cap = null;
    try { cap = await res.json(); } catch {}
    // Surface globally so App.jsx can pop the upgrade modal without each caller wiring it.
    try { window.dispatchEvent(new CustomEvent("nutri:cap-exceeded", { detail: cap })); } catch {}
    throw new CapError(cap);
  }
  if (!res.ok) {
    // Surface the server's message (e.g. 409 in_use) so callers can show it instead
    // of a bare status code. Keep the Error type so existing catch blocks still work.
    let body = null;
    try { body = await res.json(); } catch {}
    const err = new Error(body?.message || `${res.status} ${res.statusText}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // produtos
  produtos: {
    list:   (q = "")          => http(`/produtos${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    create: (p)               => http(`/produtos`, { method: "POST", body: JSON.stringify(p) }),
    update: (id, p)           => http(`/produtos/${id}`, { method: "PUT", body: JSON.stringify(p) }),
    remove: (id)              => http(`/produtos/${id}`, { method: "DELETE" }),
  },
  // comidas
  comidas: {
    list:   (q = "")          => http(`/comidas${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    parse:  (text)            => http(`/comidas/parse`, { method: "POST", body: JSON.stringify({ text }) }),
    create: (c)               => http(`/comidas`, { method: "POST", body: JSON.stringify(c) }),
    update: (id, c)           => http(`/comidas/${id}`, { method: "PUT", body: JSON.stringify(c) }),
    remove: (id)              => http(`/comidas/${id}`, { method: "DELETE" }),
  },
  // meal days
  meals: {
    recent: (days = 30)       => http(`/meal-days/recent?days=${days}`),
    day:    (date)            => http(`/meal-days/${date}`),
    addSection:    (date, n)  => http(`/meal-days/${date}/sections`, { method: "POST", body: JSON.stringify({ name: n }) }),
    deleteSection: (id)       => http(`/meal-days/sections/${id}`, { method: "DELETE" }),
    reorderSections: (date, ids) => http(`/meal-days/${date}/sections/order`, { method: "PUT", body: JSON.stringify({ sectionIds: ids }) }),
    addItem: (sectionId, it)  => http(`/meal-days/sections/${sectionId}/items`, { method: "POST", body: JSON.stringify(it) }),
    updateItem: (id, it)      => http(`/meal-days/items/${id}`, { method: "PUT", body: JSON.stringify(it) }),
    deleteItem: (id)          => http(`/meal-days/items/${id}`, { method: "DELETE" }),
    batch: (payload)          => http(`/meal-days/batch`, { method: "POST", body: JSON.stringify(payload) }),
  },
  // meal templates (marmitas)
  mealTemplates: {
    list:   ()                => http(`/meal-templates`),
    parse:  (text)            => http(`/meal-templates/parse`, { method: "POST", body: JSON.stringify({ text }) }),
    create: (t)               => http(`/meal-templates`, { method: "POST", body: JSON.stringify(t) }),
    update: (id, t)           => http(`/meal-templates/${id}`, { method: "PUT", body: JSON.stringify(t) }),
    remove: (id)              => http(`/meal-templates/${id}`, { method: "DELETE" }),
  },
  // profile
  profile: {
    get:    ()                => http(`/profile`),
    update: (u)               => http(`/profile`, { method: "PUT", body: JSON.stringify(u) }),
    updateSocial: (s)         => http(`/profile/social`, { method: "PUT", body: JSON.stringify(s) }),
    setDefaultSections: (sections) => http(`/profile/default-sections`, { method: "PUT", body: JSON.stringify({ sections }) }),
  },
  // social feed
  feed: {
    list:   ({ before, beforeId, limit } = {}) => {
      const p = new URLSearchParams();
      if (before)   p.set("before", before);
      if (beforeId) p.set("beforeId", beforeId);
      if (limit)    p.set("limit", limit);
      const qs = p.toString();
      return http(`/feed${qs ? `?${qs}` : ""}`);
    },
    create: (post)            => http(`/feed/posts`, { method: "POST", body: JSON.stringify(post) }),
    remove: (id)              => http(`/feed/posts/${id}`, { method: "DELETE" }),
    like:   (id)              => http(`/feed/posts/${id}/like`, { method: "POST" }),
    unlike: (id)              => http(`/feed/posts/${id}/like`, { method: "DELETE" }),
    save:   (id)              => http(`/feed/posts/${id}/save`, { method: "POST" }),
  },
  // social graph / discovery
  social: {
    searchUsers: (q)          => http(`/users/search?q=${encodeURIComponent(q)}`),
    getProfile:  (username)   => http(`/users/${encodeURIComponent(username)}`),
    followers:   (id)         => http(`/users/${id}/followers`),
    following:   (id)         => http(`/users/${id}/following`),
    follow:      (id)         => http(`/users/${id}/follow`, { method: "POST" }),
    unfollow:    (id)         => http(`/users/${id}/follow`, { method: "DELETE" }),
  },
  // account (LGPD)
  account: {
    delete: ()                => http(`/account`, { method: "DELETE" }),
  },
  // billing (Stripe)
  billing: {
    checkout: (plan)          => http(`/billing/checkout`, { method: "POST", body: JSON.stringify({ plan }) }),
    portal:   ()              => http(`/billing/portal`, { method: "POST" }),
  },
  // push notifications (reminders)
  push: {
    subscribe:   (s) => http(`/push/subscribe`,   { method: "POST", body: JSON.stringify(s) }),
    unsubscribe: (s) => http(`/push/unsubscribe`, { method: "POST", body: JSON.stringify(s) }),
    getPrefs:    ()  => http(`/push/prefs`),
    setPrefs:    (p) => http(`/push/prefs`, { method: "PUT", body: JSON.stringify(p) }),
  },
  // ai
  chat:        (msg, date, section) => http(`/chat-log`, { method: "POST", body: JSON.stringify({ message: msg, date, section }) }),
  analyzeMeal: (b64, mime)   => http(`/analyze-meal-image`, { method: "POST", body: JSON.stringify({ imageBase64: b64, mediaType: mime }) }),
  scanLabel:   (b64, mime)   => http(`/scan-nutrition-label`, { method: "POST", body: JSON.stringify({ imageBase64: b64, mediaType: mime }) }),
};

export const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const MAX_DIMENSION = 1024;       // px on longest side
const JPEG_QUALITY  = 0.85;

/**
 * Read a File into base64. For images we first downscale to MAX_DIMENSION on the
 * longest side and re-encode as JPEG, which can shrink a 12-megapixel phone photo
 * by 50-90% before it ever hits the Anthropic vision API. Token cost drops
 * proportionally and so does network latency on mobile.
 */
export async function fileToBase64(file) {
  if (file.type && file.type.startsWith("image/")) {
    try {
      return await resizeImageToBase64(file);
    } catch {
      // fall through to raw encoding if canvas isn't available for some reason
    }
  }
  return await rawToBase64(file);
}

async function rawToBase64(file) {
  const buf = await file.arrayBuffer();
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function resizeImageToBase64(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    // dataUrl looks like "data:image/jpeg;base64,XXXX" — strip the prefix.
    const comma = dataUrl.indexOf(",");
    return dataUrl.slice(comma + 1);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export function pickPhoto({ camera = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (camera) input.capture = "environment";
    input.style.display = "none";
    document.body.appendChild(input);
    input.onchange = async () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      if (!file) { resolve(null); return; }
      const b64 = await fileToBase64(file);
      // After downscaling we always send JPEG; for raw fallbacks keep the original mime.
      const mime = file.type && file.type.startsWith("image/") ? "image/jpeg" : (file.type || "image/jpeg");
      resolve({ b64, mime });
    };
    input.click();
  });
}
