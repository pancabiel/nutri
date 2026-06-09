import { test, expect } from "./fixtures.js";
import { cleanupByPrefix, uniqueName, seedProduto } from "./crud.js";

// Cadastro de marmitas (meal templates) — paths that don't need the real AI:
//   1. manual: name + item (produto) via picker
//   2. grupo inline (ex: molho branco): a sub-receita que vive só na marmita
//   3. por texto: /meal-templates/parse STUBBED with a resolved draft → review → save
//
// Marmitas reference produtos/comidas, so each test seeds a produto first and
// reloads. afterAll cleans everything by prefix (templates → comidas → produtos).

const PREFIX = "E2E-mar-";
const headerAddBtn = (page) => page.locator("button.bg-emerald-500.h-10.w-10");

async function openMarmitasWithProduto(page) {
  await page.goto("/");
  const produto = await seedProduto(page, uniqueName(PREFIX, "ing"));
  await page.reload();
  await page.getByRole("button", { name: "Marmitas" }).click();
  await expect(page.getByPlaceholder("Buscar marmita")).toBeVisible();
  return produto;
}

test.afterAll(async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: "tests/e2e/.auth/state.json" });
  const page = await ctx.newPage();
  await page.goto("/");
  await cleanupByPrefix(page, PREFIX);
  await ctx.close();
});

test.describe("cadastro de marmitas", () => {
  test("cria uma marmita com um item produto", async ({ page }) => {
    const produto = await openMarmitasWithProduto(page);
    const name = uniqueName(PREFIX, "manual");

    await headerAddBtn(page).click();
    await expect(page.getByText("Nova marmita")).toBeVisible();
    await page.getByPlaceholder("Ex: Marmita frango + macarrão").fill(name);

    await page.getByRole("button", { name: "item", exact: true }).click();
    await expect(page.getByText("Adicionar item")).toBeVisible();
    await page.getByRole("button", { name: "produtos", exact: true }).click(); // switch tab
    await page.getByRole("button", { name: produto.name }).click();
    await page.getByRole("button", { name: "Adicionar" }).click();

    await expect(page.getByText("Total por marmita")).toBeVisible();

    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Marmita criada")).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
  });

  test("cria uma marmita com grupo inline (ex: molho branco)", async ({ page }) => {
    const produto = await openMarmitasWithProduto(page);
    const name = uniqueName(PREFIX, "grupo");

    await headerAddBtn(page).click();
    await page.getByPlaceholder("Ex: Marmita frango + macarrão").fill(name);

    // Inline group editor.
    await page.getByRole("button", { name: "grupo", exact: true }).click();
    await expect(page.getByText("Novo grupo")).toBeVisible();
    await page.getByPlaceholder("Ex: Molho branco").fill("Molho de teste");

    // Add a batch produto to the group.
    await page.getByRole("button", { name: "produto", exact: true }).click();
    await expect(page.getByText("Escolher produto")).toBeVisible();
    await page.getByRole("button", { name: produto.name }).click();
    await page.getByRole("button", { name: "Adicionar" }).click();

    // Default "quanto vai" (served) = 80g; yield defaults to the sum → save the group.
    await page.getByRole("button", { name: "Salvar grupo" }).click();

    // Back in the marmita editor the group item is listed.
    await expect(page.getByText("Molho de teste")).toBeVisible();

    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Marmita criada")).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
  });

  test("cria uma marmita por texto (parse stubado)", async ({ page }) => {
    const produto = await openMarmitasWithProduto(page);
    const name = uniqueName(PREFIX, "texto");

    await page.route("**/api/meal-templates/parse", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          name,
          items: [{ produtoId: produto.id, comidaId: null, quantity: 150, unit: "g" }],
          newProdutos: 0,
        }),
      }),
    );

    await page.getByRole("button", { name: "Texto" }).click();
    await expect(page.getByText("Marmita por texto")).toBeVisible();
    await page.getByPlaceholder(/150g de arroz/).fill("qualquer texto, a IA está stubada");
    await page.getByRole("button", { name: "Montar marmita" }).click();

    // Draft opens for review, pre-filled with the produto.
    await expect(page.getByPlaceholder("Ex: Marmita frango + macarrão")).toHaveValue(name);
    await expect(page.getByText(produto.name)).toBeVisible();

    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Marmita criada")).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
  });
});
