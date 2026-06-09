import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(here, "..", "..");

/**
 * Minimal .env loader (no dotenv dependency). Reads tests/e2e/.env.e2e first,
 * then frontend/.env.local as a fallback for the VITE_SUPABASE_* values, and
 * copies any keys not already present into process.env.
 *
 * Required keys (see tests/e2e/.env.e2e.example):
 *   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY  — the STAGING project
 *   E2E_EMAIL, E2E_PASSWORD                    — the dedicated staging test user
 * Optional:
 *   E2E_BASE_URL  (default http://localhost:5173)
 */
export function loadE2EEnv() {
  for (const file of [
    path.join(here, ".env.e2e"),
    path.join(frontendDir, ".env.local"),
  ]) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

export function requireE2EEnv() {
  loadE2EEnv();
  const missing = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "E2E_EMAIL", "E2E_PASSWORD"]
    .filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `E2E env missing: ${missing.join(", ")}.\n` +
        `Copy frontend/tests/e2e/.env.e2e.example to frontend/tests/e2e/.env.e2e and fill it in.\n` +
        `These must point at the STAGING Supabase project and a dedicated test user.`,
    );
  }
  return {
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    anonKey: process.env.VITE_SUPABASE_ANON_KEY,
    email: process.env.E2E_EMAIL,
    password: process.env.E2E_PASSWORD,
    baseUrl: process.env.E2E_BASE_URL || "http://localhost:5173",
  };
}
