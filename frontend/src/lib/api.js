const BASE = import.meta.env.VITE_API_BASE || "/api";
const AUTH_KEY = "nutri_auth";

export const auth = {
  get:   ()  => localStorage.getItem(AUTH_KEY) || "",
  set:   (p) => localStorage.setItem(AUTH_KEY, p),
  clear: ()  => localStorage.removeItem(AUTH_KEY),
};

async function http(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: {
      "Content-Type": "application/json",
      "X-Auth": auth.get(),
      ...(opts.headers || {}),
    },
    ...opts,
  });
  if (res.status === 401) {
    auth.clear();
    window.location.reload();
    throw new Error("401 Unauthorized");
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  if (res.status === 204) return null;
  return res.json();
}

export async function verifyPassword(password) {
  const res = await fetch(BASE + "/produtos?q=__ping__", {
    headers: { "X-Auth": password },
  });
  return res.status !== 401;
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
    addItem: (sectionId, it)  => http(`/meal-days/sections/${sectionId}/items`, { method: "POST", body: JSON.stringify(it) }),
    updateItem: (id, it)      => http(`/meal-days/items/${id}`, { method: "PUT", body: JSON.stringify(it) }),
    deleteItem: (id)          => http(`/meal-days/items/${id}`, { method: "DELETE" }),
  },
  // ai
  chat:        (msg, date, section) => http(`/chat-log`, { method: "POST", body: JSON.stringify({ message: msg, date, section }) }),
  analyzeMeal: (b64, mime)   => http(`/analyze-meal-image`, { method: "POST", body: JSON.stringify({ imageBase64: b64, mediaType: mime }) }),
  scanLabel:   (b64, mime)   => http(`/scan-nutrition-label`, { method: "POST", body: JSON.stringify({ imageBase64: b64, mediaType: mime }) }),
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

export async function fileToBase64(file) {
  const buf = await file.arrayBuffer();
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
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
      resolve({ b64, mime: file.type || "image/jpeg" });
    };
    input.click();
  });
}
