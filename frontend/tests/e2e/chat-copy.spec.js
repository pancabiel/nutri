import { test, expect, mockAi } from "./fixtures.js";
import { apiRequest } from "./crud.js";

// "Comi o mesmo de ontem": the backend copies logged items instead of the AI listing them,
// and the chat shows a short confirmation instead of an empty "0 itens" table.

const iso = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function stubChat(page, body) {
  return mockAi(page, {
    "**/api/chat-log": (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }),
  });
}

async function send(page, text) {
  const input = page.getByPlaceholder("O que você comeu?");
  await input.fill(text);
  await input.press("Enter");
}

test.describe("chat: repetir refeição", () => {
  test("pure copy shows a confirmation, not an empty table", async ({ page }) => {
    await stubChat(page, {
      parsed: [], saved: [], section: "Café da manhã", date: iso(0),
      totals: { calories: 420, protein: 30 },
      copied: [{ fromDate: iso(-1), fromSection: "Café da manhã", toDate: iso(0), toSection: "Café da manhã", items: 3, calories: 420, protein: 30 }],
    });
    await page.goto("/");
    await send(page, "comi o mesmo café da manhã de ontem");

    await expect(page.getByText("Copiei 3 itens do café da manhã de ontem para hoje")).toBeVisible();
    await expect(page.getByText(/Identifiquei 0/)).toHaveCount(0);
  });

  test("copy with nothing logged at the source says so", async ({ page }) => {
    await stubChat(page, {
      parsed: [], saved: [], section: "Jantar", date: iso(0), totals: { calories: 0, protein: 0 },
      copied: [{ fromDate: iso(-1), fromSection: null, toDate: iso(0), toSection: null, items: 0, calories: 0, protein: 0 }],
    });
    await page.goto("/");
    await send(page, "comi as mesmas coisas de ontem");

    await expect(page.getByText("Não encontrei nada registrado ontem.")).toBeVisible();
  });

  test("nothing understood shows a hint instead of an empty table", async ({ page }) => {
    await stubChat(page, { parsed: [], saved: [], section: "Jantar", date: iso(0), totals: { calories: 0, protein: 0 }, copied: [] });
    await page.goto("/");
    await send(page, "asdf");

    await expect(page.getByText(/Não identifiquei nenhum alimento/)).toBeVisible();
    await expect(page.getByText(/Identifiquei 0/)).toHaveCount(0);
  });
});

test.describe("copiar o de sempre", () => {
  test("chat card copies the suggested breakfast in one tap", async ({ page }) => {
    let copyBody = null;
    await page.route("**/api/meal-days/*/recommendations", (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(copyBody ? { current: "Café da manhã", sections: [] } : {
        current: "Café da manhã",
        sections: [{ section: "Café da manhã", options: [
          { fromDate: iso(-3), fromSection: "Café da manhã", items: ["Pão francês", "Ovo mexido"], calories: 420, protein: 24.5, times: 4 },
        ] }],
      }),
    }));
    await page.route("**/api/meal-days/*/copy", (route) => {
      copyBody = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        fromDate: iso(-3), fromSection: "Café da manhã", toDate: iso(0), toSection: "Café da manhã", items: 2, calories: 420, protein: 24.5,
      }) });
    });
    await page.goto("/");

    await expect(page.getByText("Café da manhã: O de sempre")).toBeVisible();
    await page.getByRole("button", { name: "Copiar" }).click();

    await expect(page.getByText(/Copiei 2 itens do café da manhã/)).toBeVisible();
    expect(copyBody).toEqual({ fromDate: iso(-3), fromSection: "Café da manhã", toSection: "Café da manhã" });
    await expect(page.getByText("Café da manhã: O de sempre")).toHaveCount(0);
  });
});

test.describe("chat: repetir refeição (IA real)", () => {
  test.use({ realAi: true });
  test.setTimeout(60_000);

  test("copies yesterday's breakfast into today", async ({ page }) => {
    await page.goto("/");
    const name = `E2E copia ${Date.now()}`;

    const yesterday = (await apiRequest(page, "GET", `/meal-days/${iso(-1)}`)).body;
    const cafe = yesterday.sections.find((s) => s.name === "Café da manhã");
    const seeded = await apiRequest(page, "POST", `/meal-days/sections/${cafe.id}/items`, {
      name, quantity: 50, calories: 123, protein: 4.5, unit: "g", carbs: 20, fat: 2,
    });
    expect(seeded.status).toBeLessThan(300);

    const itemIds = (day) => day.sections.flatMap((s) => s.items.map((i) => i.id));
    const before = new Set(itemIds((await apiRequest(page, "GET", `/meal-days/${iso(0)}`)).body));

    try {
      await send(page, "comi o mesmo café da manhã de ontem");
      await expect(page.getByText(/Copiei \d+ ite(m|ns) do café da manhã de ontem para hoje/)).toBeVisible({ timeout: 45_000 });

      const today = (await apiRequest(page, "GET", `/meal-days/${iso(0)}`)).body;
      const todayCafe = today.sections.find((s) => s.name === "Café da manhã");
      expect(todayCafe.items.some((i) => i.name === name && i.calories === 123)).toBe(true);
    } finally {
      const today = (await apiRequest(page, "GET", `/meal-days/${iso(0)}`)).body;
      for (const id of itemIds(today).filter((id) => !before.has(id))) {
        await apiRequest(page, "DELETE", `/meal-days/items/${id}`);
      }
      await apiRequest(page, "DELETE", `/meal-days/items/${seeded.body.id}`);
    }
  });
});
