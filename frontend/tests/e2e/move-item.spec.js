import { test, expect, mockAi } from "./fixtures.js";
import { apiRequest } from "./crud.js";

// Move a logged item to another refeição: from the Agenda row and from the chat result card
// ("Salvo em Almoço" → pick another section). Items are seeded on today's diary via the API
// and removed afterwards.

const PREFIX = "E2E-move ";

const iso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function seedItem(page, name) {
  const day = (await apiRequest(page, "GET", `/meal-days/${iso()}`)).body;
  const [from, to] = day.sections;
  const { status, body } = await apiRequest(page, "POST", `/meal-days/sections/${from.id}/items`, {
    produtoId: null, comidaId: null, name, quantity: 40, calories: 130, protein: 2, unit: "g",
  });
  if (status >= 300) throw new Error(`seedItem failed (${status})`);
  return { item: body, from, to };
}

async function sectionOf(page, itemId) {
  const day = (await apiRequest(page, "GET", `/meal-days/${iso()}`)).body;
  return day.sections.find(s => s.items.some(i => i.id === itemId))?.name;
}

async function cleanup(page) {
  const day = (await apiRequest(page, "GET", `/meal-days/${iso()}`)).body;
  for (const s of day?.sections || []) {
    for (const i of s.items) if (i.name.startsWith(PREFIX)) await apiRequest(page, "DELETE", `/meal-days/items/${i.id}`);
  }
}

test.describe("mover item de refeição", () => {
  test.afterEach(async ({ page }) => { await cleanup(page); });

  test("na Agenda, move o item para outra seção", async ({ page }) => {
    await page.goto("/");
    const name = PREFIX + "pão de queijo";
    const { item, to } = await seedItem(page, name);

    await page.getByRole("button", { name: "Hoje" }).click();
    const row = page.locator("div").filter({ has: page.getByText(name, { exact: true }) })
      .filter({ has: page.getByRole("button", { name: "Mover item" }) }).last();
    await row.getByRole("button", { name: "Mover item" }).click();
    await page.getByRole("button", { name: to.name, exact: true }).click();

    await expect(page.getByText(`Movido para ${to.name}`)).toBeVisible();
    expect(await sectionOf(page, item.id)).toBe(to.name);
  });

  test("no chat, 'Salvo em' permite trocar a refeição", async ({ page }) => {
    await page.goto("/");
    const name = PREFIX + "chat";
    const { item, from, to } = await seedItem(page, name);

    await mockAi(page, {
      "**/api/chat-log": (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        parsed: [{ type: "produto", matched_id: null, name, quantity: 2, estimated_grams: 40, calories: 130, protein: 2 }],
        saved: [item], section: from.name, date: iso(), totals: { calories: 130, protein: 2 }, copied: [],
      }) }),
    });
    const input = page.getByPlaceholder("O que você comeu?");
    await input.fill("2 pães de queijo");
    await input.press("Enter");

    await page.getByRole("button", { name: "Mover para outra refeição" }).click();
    await page.getByRole("button", { name: to.name, exact: true }).click();

    await expect(page.getByText(`Salvo em ${to.name}`)).toBeVisible();
    expect(await sectionOf(page, item.id)).toBe(to.name);
  });
});
