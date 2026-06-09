import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { requireE2EEnv } from "./env.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(here, ".auth");
const STATE_PATH = path.join(AUTH_DIR, "state.json");

/**
 * Signs the dedicated staging test user in via the Supabase Auth REST API
 * (password grant), then writes a Playwright storageState containing the
 * Supabase session under the key the app's supabase-js client reads on load.
 *
 * The app's LoginScreen only offers magic-link (OTP) and Google OAuth — neither
 * is automatable — so we inject the session directly instead of driving a login
 * form. The dedicated test user must therefore have a PASSWORD set in staging
 * (Supabase dashboard → Authentication → Users → the user → set password, or via
 * the admin API). It should also already have onboarding_complete = true so tests
 * land in the main Shell, and ideally be is_pro = true so AI caps don't bite.
 */
export default async function globalSetup() {
  const { supabaseUrl, anonKey, email, password, baseUrl } = requireE2EEnv();

  // 1. Password-grant token exchange.
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `E2E login failed (${res.status}) for ${email} against ${supabaseUrl}.\n${body}\n` +
        `Confirm the test user exists in STAGING and has a password set.`,
    );
  }
  const session = await res.json();
  if (!session.access_token) throw new Error("Login returned no access_token.");
  if (!session.expires_at && session.expires_in) {
    session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in;
  }

  // 2. Build the localStorage entry supabase-js expects: key `sb-<ref>-auth-token`.
  const ref = new URL(supabaseUrl).hostname.split(".")[0];
  const storageKey = `sb-${ref}-auth-token`;
  const state = {
    cookies: [],
    origins: [
      {
        origin: new URL(baseUrl).origin,
        localStorage: [{ name: storageKey, value: JSON.stringify(session) }],
      },
    ],
  };

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));

  // 3. Self-check: load the app with this state and confirm we are NOT on the
  //    login screen. Catches supabase-js storage-format drift early with a clear
  //    message instead of every test mysteriously seeing the LoginScreen.
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ storageState: STATE_PATH });
    const page = await ctx.newPage();
    await page.goto(baseUrl);
    const loggedIn = page.getByPlaceholder("O que você comeu?"); // chat input in the Shell
    const stillLogin = page.getByText("Enviar link mágico");
    const ok = await Promise.race([
      loggedIn.waitFor({ timeout: 12_000 }).then(() => true).catch(() => false),
      stillLogin.waitFor({ timeout: 12_000 }).then(() => false).catch(() => true),
    ]);
    if (!ok) {
      throw new Error(
        "Injected session did not authenticate the app (still on LoginScreen, or onboarding not complete).\n" +
          "Check: (a) the test user's onboarding_complete is true in staging, and (b) your @playwright/test " +
          "+ @supabase/supabase-js versions still use the `sb-<ref>-auth-token` JSON storage format.",
      );
    }
  } finally {
    await browser.close();
  }
}
