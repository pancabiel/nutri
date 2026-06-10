import { useState } from "react";
import { supabase } from "../lib/supabase.js";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [error, setError] = useState("");

  async function sendMagicLink(e) {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setError("Digite um email válido.");
      return;
    }
    setStatus("sending");
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setStatus("error");
      setError(error.message || "Não foi possível enviar o link.");
      return;
    }
    setStatus("sent");
  }

  async function signInWithGoogle() {
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setError(error.message || "Falha ao iniciar Google.");
  }

  return (
    <div className="min-h-full w-full flex flex-col bg-gradient-to-br from-emerald-50 via-white to-teal-50 px-6 pt-[max(env(safe-area-inset-top),24px)] pb-[max(env(safe-area-inset-bottom),24px)] relative overflow-hidden">
      {/* Decorative blobs */}
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full bg-emerald-200/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 w-80 h-80 rounded-full bg-teal-200/40 blur-3xl" />

      <div className="flex-1 flex flex-col items-center justify-center w-full relative z-10">
        <div className="w-full max-w-sm">
          {/* Brand */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30 flex items-center justify-center mb-4">
              <Leaf />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Nutri</h1>
            <p className="text-sm text-slate-500 mt-2 text-center max-w-[260px]">
              Conte o que comeu, a gente faz as contas pra você.
            </p>
          </div>

          {/* Auth card */}
          <div className="rounded-3xl bg-white/80 backdrop-blur border border-white shadow-xl shadow-emerald-900/5 p-5">
            {status === "sent" ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="text-base font-semibold text-slate-900">Link enviado!</div>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                  Abra seu email e clique no link pra entrar.
                </p>
                <button
                  onClick={() => { setStatus("idle"); setEmail(""); }}
                  className="mt-4 text-sm text-emerald-700 font-medium underline underline-offset-2"
                >
                  Usar outro email
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={signInWithGoogle}
                  className="w-full rounded-xl border border-slate-200 bg-white text-slate-800 font-medium py-3 flex items-center justify-center gap-2.5 active:scale-[0.98] transition-transform hover:bg-slate-50"
                >
                  <GoogleGlyph />
                  Entrar com Google
                </button>

                <div className="flex items-center gap-3 my-5">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">ou com email</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                <form onSubmit={sendMagicLink} className="flex flex-col gap-2.5">
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 bg-white"
                  />
                  <button
                    type="submit"
                    disabled={status === "sending" || !email}
                    className="w-full rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 text-white font-semibold py-3 disabled:opacity-50 active:scale-[0.98] transition-transform shadow-lg shadow-emerald-500/30"
                  >
                    {status === "sending" ? "Enviando…" : "Enviar link mágico"}
                  </button>
                </form>
              </>
            )}

            {error && <div className="mt-4 text-sm text-rose-600 text-center">{error}</div>}
          </div>

          <p className="mt-6 text-[11px] text-slate-400 text-center leading-relaxed px-4">
            Ao continuar você aceita os Termos de Uso e a Política de Privacidade.
          </p>
        </div>
      </div>
    </div>
  );
}

function Leaf() {
  return (
    <svg viewBox="0 0 24 24" className="w-9 h-9 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.2 2.96c1.4 9.3-4.46 17.62-13.78 17.03L4 20" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6" />
    </svg>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <path d="M21.6 12.227c0-.708-.064-1.39-.182-2.045H12v3.868h5.382c-.232 1.25-.937 2.31-1.997 3.018v2.507h3.232c1.89-1.74 2.983-4.302 2.983-7.348z" fill="#4285F4"/>
      <path d="M12 22c2.7 0 4.964-.895 6.618-2.425l-3.232-2.507c-.895.6-2.04.955-3.386.955-2.604 0-4.81-1.76-5.595-4.122H3.064v2.59A9.996 9.996 0 0012 22z" fill="#34A853"/>
      <path d="M6.405 13.9a6.005 6.005 0 010-3.8V7.51H3.064a9.996 9.996 0 000 8.98l3.341-2.59z" fill="#FBBC05"/>
      <path d="M12 5.977c1.468 0 2.786.504 3.823 1.495l2.868-2.868C16.96 2.997 14.695 2 12 2A9.996 9.996 0 003.064 7.51l3.341 2.59C7.19 7.738 9.396 5.977 12 5.977z" fill="#EA4335"/>
    </svg>
  );
}
