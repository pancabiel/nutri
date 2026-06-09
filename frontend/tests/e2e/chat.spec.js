import { test, expect, mockAi } from "./fixtures.js";

// Demonstrates testing an AI-driven flow WITHOUT hitting Anthropic: the chat-log
// endpoint is stubbed by the fixture, so this is deterministic and free.

test.describe("chat logging", () => {
  test("shows the parsed result card after sending a message", async ({ page }) => {
    await page.goto("/");
    const input = page.getByPlaceholder("O que você comeu?");
    await input.fill("um ovo cozido");
    await input.press("Enter");

    // The stubbed chat-log response (see fixtures.js) renders a result card.
    await expect(page.getByText("Ovo cozido")).toBeVisible();
    await expect(page.getByText(/Salvo em/)).toBeVisible();
  });

  test("a 402 cap response surfaces the upgrade modal", async ({ page }) => {
    // Override just the chat-log route with a cap error to exercise the 402 path.
    await mockAi(page, {
      "**/api/chat-log": (route) =>
        route.fulfill({
          status: 402,
          contentType: "application/json",
          body: JSON.stringify({
            kind: "chat",
            tier: "free",
            window: "lifetime",
            limit: 3,
            used: 3,
            message: "Limite gratuito atingido.",
          }),
        }),
    });

    await page.goto("/");
    const input = page.getByPlaceholder("O que você comeu?");
    await input.fill("mais um ovo");
    await input.press("Enter");

    // App.jsx listens for nutri:cap-exceeded and pops UpgradeModal.
    await expect(page.getByText(/Pro|assinar|upgrade/i).first()).toBeVisible();
  });
});
