import { test as base, expect } from "@playwright/test";

/**
 * The AI/metered endpoints. In staging-real mode these hit Anthropic for real,
 * which costs money and burns per-user caps (free = 3 chat / 1 photo / 1 label,
 * LIFETIME). So by default we STUB them — tests assert the UI wiring, not the
 * model output. Opt a test into the real model with `test.use({ realAi: true })`
 * (do that sparingly, and only with a Pro test user).
 */
export const AI_ROUTES = {
  "**/api/chat-log": chatLogStub,
  "**/api/comidas/parse": comidaParseStub,
  "**/api/meal-templates/parse": marmitaParseStub,
  "**/api/analyze-meal-image": analyzeStub,
  "**/api/scan-nutrition-label": labelStub,
};

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function chatLogStub(route) {
  return json(route, {
    parsed: [
      { name: "Ovo cozido", type: "produto", grams: 100, calories: 155, protein: 13, matched: true },
    ],
    totals: { calories: 155, protein: 13, carbs: 1, fat: 11 },
    section: "café",
    saved: ["Ovo cozido"],
  });
}
function comidaParseStub(route) {
  return json(route, {
    name: "Molho de carne",
    items: [{ type: "produto", matched_id: null, name: "Carne moída", quantity: 1000, unit: "g", calories_per_100g: 200, protein_per_100g: 26 }],
    yield_grams: 1400,
  });
}
function marmitaParseStub(route) {
  return json(route, {
    name: "Marmita frango + arroz",
    items: [{ type: "produto", matched_id: null, name: "Arroz", quantity: 150, unit: "g", calories_per_100g: 130, protein_per_100g: 2.7 }],
  });
}
function analyzeStub(route) {
  return json(route, {
    parsed: [{ name: "Prato de arroz e frango", type: "comida", grams: 300, calories: 520, protein: 38, matched: false }],
    totals: { calories: 520, protein: 38 },
    section: "almoço",
    saved: [],
  });
}
function labelStub(route) {
  return json(route, { name: "Produto escaneado", calories_per_100g: 250, protein_per_100g: 8, carbs_per_100g: 30, fat_per_100g: 10, serving_grams: 30 });
}

/**
 * Stub the AI endpoints on a page. Pass overrides keyed by route glob to change
 * a specific response (e.g. simulate a 402 cap error):
 *   await mockAi(page, { "**\/api/chat-log": r => r.fulfill({ status: 402, body: ... }) });
 */
export async function mockAi(page, overrides = {}) {
  const routes = { ...AI_ROUTES, ...overrides };
  for (const [glob, handler] of Object.entries(routes)) {
    await page.route(glob, handler);
  }
}

/**
 * Extended test: AI endpoints are stubbed automatically unless `realAi: true`.
 * Everything else (auth, CRUD on produtos/comidas/meal-days) hits the real
 * staging backend.
 */
export const test = base.extend({
  realAi: [false, { option: true }],
  page: async ({ page, realAi }, use) => {
    if (!realAi) await mockAi(page);
    await use(page);
  },
});

export { expect };
