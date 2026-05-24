import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fail loud — silent misconfig would hand-wave the entire auth flow.
  // eslint-disable-next-line no-console
  console.error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set");
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Returns the current access token, refreshing if needed. Null when signed out. */
export async function currentToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
