import { test, expect } from "./fixtures.js";
import { cleanupByPrefix, uniqueName, seedProduto, seedComida, seedMarmita } from "./crud.js";

// Regression for the silent-failure bug: deleting a produto/comida that is still
// referenced by another row (FK `on delete restrict` / `no action`) used to 500 on
// the backend and be swallowed by the frontend (no toast, nothing happened). Now the
// backend maps it to 409 in_use and the UI shows an error toast; the row stays.

const PREFIX = "E2E-del-";
const rowFor = (page, name) => page.locator("div.bg-white.rounded-2xl", { hasText: name });

test.afterAll(async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: "tests/e2e/.auth/state.json" });
  const page = await ctx.newPage();
  await page.goto("/");
  await cleanupByPrefix(page, PREFIX);
  await ctx.close();
});

test.describe("exclusão bloqueada por uso (regressão)", () => {
  test("produto usado em uma comida não some em silêncio — mostra erro", async ({ page }) => {
    await page.goto("/");
    const produto = await seedProduto(page, uniqueName(PREFIX, "ing"));
    await seedComida(page, uniqueName(PREFIX, "receita"), [{ produtoId: produto.id, quantityGrams: 100 }], 100);
    await page.reload();

    await page.getByRole("button", { name: "Produtos" }).click();
    await page.getByPlaceholder("Buscar produto").fill(produto.name);

    const row = rowFor(page, produto.name);
    await expect(row).toBeVisible();
    await row.getByRole("button").last().click(); // trash (last button in the row)

    await page.getByRole("button", { name: "Excluir" }).click();

    // The fix: a clear error toast instead of nothing.
    await expect(page.getByText(/em uso/i)).toBeVisible();
    // And the produto is still there.
    await expect(row).toBeVisible();
  });

  test("comida usada em uma marmita não some em silêncio — mostra erro", async ({ page }) => {
    await page.goto("/");
    const produto = await seedProduto(page, uniqueName(PREFIX, "ing2"));
    const comida = await seedComida(page, uniqueName(PREFIX, "receita2"), [{ produtoId: produto.id, quantityGrams: 100 }], 100);
    await seedMarmita(page, uniqueName(PREFIX, "marmita"), [
      { produtoId: null, comidaId: comida.id, quantity: 1, unit: "porcao" },
    ]);
    await page.reload();

    await page.getByRole("button", { name: "Comidas" }).click();
    await page.getByPlaceholder("Buscar comida").fill(comida.name);

    const row = rowFor(page, comida.name);
    await expect(row).toBeVisible();
    await row.getByRole("button").last().click();

    await page.getByRole("button", { name: "Excluir" }).click();

    await expect(page.getByText(/em uso/i)).toBeVisible();
    await expect(row).toBeVisible();
  });
});
