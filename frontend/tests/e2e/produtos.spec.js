import { test, expect } from "./fixtures.js";
import { cleanupByPrefix, uniqueName, apiRequest, TINY_PNG_BASE64 } from "./crud.js";

// Cadastro de produtos — every creation path that doesn't need the real AI:
//   1. manual form (name + brand + serving + macros)
//   2. validation (Salvar disabled until a name is typed)
//   3. scan da tabela nutricional (vision endpoint STUBBED → no Anthropic call)
//
// CRUD hits the real staging backend, so each test uses a unique prefixed name and
// afterAll deletes anything left behind.

const PREFIX = "E2E-prod-";
const headerAddBtn = (page) => page.locator("button.bg-emerald-500.h-10.w-10");

async function openProdutos(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Produtos" }).click();
  await expect(page.getByPlaceholder("Buscar produto")).toBeVisible();
}

test.afterAll(async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: "tests/e2e/.auth/state.json" });
  const page = await ctx.newPage();
  await page.goto("/");
  await cleanupByPrefix(page, PREFIX);
  await ctx.close();
});

test.describe("cadastro de produtos", () => {
  test("cria um produto manualmente com porção e macros", async ({ page }) => {
    const name = uniqueName(PREFIX, "manual");
    await openProdutos(page);

    await headerAddBtn(page).click();
    await expect(page.getByText("Novo produto")).toBeVisible();

    await page.locator('label:has-text("Nome") input').fill(name);
    await page.locator('label:has-text("Marca") input').fill("Marca Teste");
    await page.getByPlaceholder("2 fatias, 1 colher de sopa…").fill("1 fatia");
    await page.locator('label:has-text("Gramas") input').fill("25");
    await page.locator('label:has-text("Calorias (kcal)") input').fill("250");
    await page.locator('label:has-text("Proteína (g)") input').fill("12");
    await page.locator('label:has-text("Carbs (g)") input').fill("30");
    await page.locator('label:has-text("Gordura (g)") input').fill("8");

    await page.getByRole("button", { name: "Salvar" }).click();

    await expect(page.getByText("Produto criado")).toBeVisible();
    // Appears in the list with the macro line derived from the per-100g values.
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByText(/250 kcal · 12\.0g prot \/ 100g/)).toBeVisible();
  });

  test("o botão Salvar fica desabilitado sem nome", async ({ page }) => {
    await openProdutos(page);
    await headerAddBtn(page).click();

    const salvar = page.getByRole("button", { name: "Salvar" });
    await expect(salvar).toBeDisabled();

    await page.locator('label:has-text("Nome") input').fill(uniqueName(PREFIX, "val"));
    await expect(salvar).toBeEnabled();
  });

  test("scan da tabela nutricional (IA stubada) pré-preenche e salva", async ({ page }) => {
    const name = uniqueName(PREFIX, "scan");
    await openProdutos(page);

    // pickPhoto() builds a hidden <input type=file> and clicks it → filechooser.
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Scan" }).click(),
    ]);
    await chooser.setFiles({
      name: "rotulo.png",
      mimeType: "image/png",
      buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
    });

    // labelStub (fixtures.js) returns "Produto escaneado" + macros → form opens prefilled.
    await expect(page.getByText("Confirmar dados escaneados")).toBeVisible();
    const nome = page.locator('label:has-text("Nome") input');
    await expect(nome).toHaveValue("Produto escaneado");
    // Rename to a unique prefixed name so cleanup can find it, then save.
    await nome.fill(name);
    await page.getByRole("button", { name: "Salvar" }).click();

    await expect(page.getByText("Produto criado")).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();

    // The stubbed macros (250 kcal/100g, 8g prot) round-tripped through create.
    const list = (await apiRequest(page, "GET", "/produtos")).body || [];
    const saved = list.find((p) => p.name === name);
    expect(saved).toBeTruthy();
    expect(Math.round(saved.caloriesPerGram * 100)).toBe(250);
  });
});
