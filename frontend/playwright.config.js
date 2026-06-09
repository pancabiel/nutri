import { defineConfig, devices } from "@playwright/test";
import { loadE2EEnv } from "./tests/e2e/env.js";

// Pull E2E_* / VITE_SUPABASE_* from tests/e2e/.env.e2e (and .env.local as fallback)
// into process.env before the config is evaluated.
loadE2EEnv();

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

export default defineConfig({
  testDir: "./tests/e2e",
  // Signs the dedicated staging test user in once and writes the storageState
  // every test reuses. See tests/e2e/global-setup.js.
  globalSetup: "./tests/e2e/global-setup.js",

  // Staging-real: tests share ONE test user + the staging DB. Run serially so
  // concurrent writes don't race on the same rows. Bump only if your tests are
  // fully isolated (distinct produtos/comidas per test).
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },

  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    // Authenticated state produced by global-setup. Every test starts logged in
    // as the staging test user — no login UI to drive (the app is OTP/OAuth only).
    storageState: "tests/e2e/.auth/state.json",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    // Mobile-first PWA — emulate a phone by default, matching how the app is used.
    { name: "mobile-chrome", use: { ...devices["Pixel 5"] } },
    // Uncomment to also run desktop:
    // { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
  ],

  // Auto-starts the Vite dev server. The BACKEND is NOT started here — run it
  // yourself on :8080 against staging (mvn quarkus:dev in backend/) before E2E,
  // since staging-real tests hit real endpoints. Vite proxies /api → :8080.
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
