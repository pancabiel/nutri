// Authenticated REST helpers that run INSIDE the page (same-origin; Vite proxies
// /api → :8080 against staging). Used to seed prerequisites (e.g. a produto a
// comida/marmita test depends on) and to clean up everything the UI tests create,
// so the shared staging DB doesn't accumulate test rows.
//
// The page must already be on the app origin (call page.goto("/") first) so the
// Supabase session in localStorage — injected by global-setup's storageState — is
// available to read the bearer token.

/** Fire an authenticated request from within the page and return {status, body}. */
export async function apiRequest(page, method, path, body) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const key = Object.keys(localStorage).find(
        (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
      );
      const token = key ? JSON.parse(localStorage.getItem(key))?.access_token : null;
      const res = await fetch("/api" + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      let json = null;
      try { json = await res.json(); } catch {}
      return { status: res.status, body: json };
    },
    { method, path, body },
  );
}

/** Create a produto via the API. Returns the created row (with its id). */
export async function seedProduto(page, name, overrides = {}) {
  const { status, body } = await apiRequest(page, "POST", "/produtos", {
    name,
    brand: "",
    caloriesPerGram: 1.5,
    proteinPerGram: 0.2,
    carbsPerGram: 0.1,
    fatPerGram: 0.05,
    servingGrams: null,
    servingLabel: "",
    ...overrides,
  });
  if (status >= 300) throw new Error(`seedProduto failed (${status})`);
  return body;
}

/** Create a comida (sub-receita) referencing already-owned produtos. */
export async function seedComida(page, name, items, yieldGrams = null) {
  const { status, body } = await apiRequest(page, "POST", "/comidas", { name, items, yieldGrams });
  if (status >= 300) throw new Error(`seedComida failed (${status})`);
  return body;
}

/** Create a marmita (meal template). */
export async function seedMarmita(page, name, items) {
  const { status, body } = await apiRequest(page, "POST", "/meal-templates", { name, items });
  if (status >= 300) throw new Error(`seedMarmita failed (${status})`);
  return body;
}

/**
 * Delete everything whose name starts with `prefix`, in FK-safe order:
 * marmitas (reference comidas/produtos) → comidas (reference produtos) → produtos
 * (comida_produtos is `on delete restrict`). Safe to call repeatedly.
 */
export async function cleanupByPrefix(page, prefix) {
  const named = (n) => typeof n === "string" && n.startsWith(prefix);

  const tpls = (await apiRequest(page, "GET", "/meal-templates")).body || [];
  for (const t of tpls) if (named(t.name)) await apiRequest(page, "DELETE", "/meal-templates/" + t.id);

  const comidas = (await apiRequest(page, "GET", "/comidas")).body || [];
  for (const c of comidas) if (named(c.name)) await apiRequest(page, "DELETE", "/comidas/" + c.id);

  const produtos = (await apiRequest(page, "GET", "/produtos")).body || [];
  for (const p of produtos) if (named(p.name)) await apiRequest(page, "DELETE", "/produtos/" + p.id);
}

/** A short, unique, prefix-tagged name so concurrent runs and cleanup don't collide. */
export function uniqueName(prefix, label) {
  return `${prefix}${label}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}`;
}

// 1×1 transparent PNG — enough for the scan flow's canvas resize/encode path.
export const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
