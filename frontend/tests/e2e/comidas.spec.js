import { test, expect } from "./fixtures.js";
import { cleanupByPrefix, uniqueName, seedProduto, apiRequest } from "./crud.js";

// Cadastro de comidas (sub-receitas) — paths that don't need the real AI:
//   1. manual form: name + produto via picker + rendimento (yield)
//   2. validation (Salvar disabled until name AND at least one produto)
//   3. por texto: /comidas/parse STUBBED with a resolved draft → review → save
//
// A comida is composed of produtos, so each test seeds one produto first (via API)
// and reloads so the store picks it up. afterAll cleans everything by prefix.

const PREFIX = "E2E-com-";
const headerAddBtn = (page) => page.locator("button.bg-emerald-500.h-10.w-10");

async function openComidasWithProduto(page) {
  await page.goto("/");
  const produto = await seedProduto(page, uniqueName(PREFIX, "ing"));
  await page.reload(); // Shell re-fetches produtos on mount so the picker sees the seed
  await page.getByRole("button", { name: "Comidas" }).click();
  await expect(page.getByPlaceholder("Buscar comida")).toBeVisible();
  return produto;
}

test.afterAll(async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: "tests/e2e/.auth/state.json" });
  const page = await ctx.newPage();
  await page.goto("/");
  await cleanupByPrefix(page, PREFIX);
  await ctx.close();
});

test.describe("cadastro de comidas", () => {
  test("cria uma comida com um produto e rendimento", async ({ page }) => {
    const produto = await openComidasWithProduto(page);
    const name = uniqueName(PREFIX, "manual");

    await headerAddBtn(page).click();
    await expect(page.getByText("Nova comida")).toBeVisible();
    await page.getByPlaceholder("Ex: Sanduíche de frango").fill(name);

    // Add a produto via the picker.
    await page.getByRole("button", { name: "produto", exact: true }).click();
    await expect(page.getByText("Escolher produto")).toBeVisible();
    await page.getByRole("button", { name: produto.name }).click();
    await page.getByRole("button", { name: "Adicionar" }).click();

    // The composition + total now reflect the picked produto.
    await expect(page.getByText("Total")).toBeVisible();

    // Rendimento (peso pronto) enables per-gram portioning.
    await page.getByPlaceholder("ex: 1600").fill("180");

    await page.getByRole("button", { name: "Salvar" }).click();

    await expect(page.getByText("Comida criada")).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByText(/rende 180g/)).toBeVisible();
  });

  test("o botão Salvar exige nome e ao menos um produto", async ({ page }) => {
    const produto = await openComidasWithProduto(page);

    await headerAddBtn(page).click();
    const salvar = page.getByRole("button", { name: "Salvar" });
    await expect(salvar).toBeDisabled();

    // Name alone isn't enough.
    await page.getByPlaceholder("Ex: Sanduíche de frango").fill(uniqueName(PREFIX, "val"));
    await expect(salvar).toBeDisabled();

    // Add a produto → now valid.
    await page.getByRole("button", { name: "produto", exact: true }).click();
    await page.getByRole("button", { name: produto.name }).click();
    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(salvar).toBeEnabled();
  });

  test("cria uma comida por texto (parse stubado)", async ({ page }) => {
    const produto = await openComidasWithProduto(page);
    const name = uniqueName(PREFIX, "texto");

    // Override the parse endpoint with a RESOLVED draft (the real backend returns
    // items already mapped to owned produtoId/quantityGrams). No Anthropic call.
    await page.route("**/api/comidas/parse", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          name,
          items: [{ produtoId: produto.id, quantityGrams: 200 }],
          yieldGrams: 180,
          newProdutos: 0,
        }),
      }),
    );

    await page.getByRole("button", { name: "Texto" }).click();
    await expect(page.getByText("Comida por texto")).toBeVisible();
    await page.getByPlaceholder(/molho de carne/).fill("qualquer texto, a IA está stubada");
    await page.getByRole("button", { name: "Criar comida" }).click();

    // Draft opens in the editor for review, pre-filled with the produto.
    await expect(page.getByPlaceholder("Ex: Sanduíche de frango")).toHaveValue(name);
    await expect(page.getByText(produto.name)).toBeVisible();

    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Comida criada")).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
  });
});
