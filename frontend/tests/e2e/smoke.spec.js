import { test, expect } from "./fixtures.js";

// Smoke tests: confirm the injected staging session lands us in the authenticated
// Shell and the main navigation works. No AI calls here.

test.describe("authenticated shell", () => {
  test("loads into the chat screen", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByPlaceholder("O que você comeu?")).toBeVisible();
  });

  test("bottom nav switches screens", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Produtos" }).click();
    await expect(page.getByPlaceholder("Buscar produto")).toBeVisible();

    await page.getByRole("button", { name: "Comidas" }).click();
    await expect(page.getByPlaceholder("Buscar comida")).toBeVisible();

    await page.getByRole("button", { name: "Marmitas" }).click();
    await expect(page.getByPlaceholder("Buscar marmita")).toBeVisible();

    await page.getByRole("button", { name: "Chat" }).click();
    await expect(page.getByPlaceholder("O que você comeu?")).toBeVisible();
  });
});
