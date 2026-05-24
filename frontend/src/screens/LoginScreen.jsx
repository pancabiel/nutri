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
    <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-white px-6">
      <div className="w-full max-w-xs">
        <h1 className="text-3xl font-semibold text-slate-900 mb-1 text-center">Nutri</h1>
        <p className="text-sm text-slate-500 mb-8 text-center">
          Entre pra começar a registrar suas refeições
        </p>

        {status === "sent" ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3 mb-4">
            Pronto. Abrimos um link no seu email — clique pra entrar.
          </div>
        ) : (
          <form onSubmit={sendMagicLink} className="flex flex-col gap-3 mb-4">
            <input
              type="email"
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={status === "sending" || !email}
              className="w-full rounded-xl bg-emerald-600 text-white font-medium py-3 disabled:opacity-50"
            >
              {status === "sending" ? "Enviando..." : "Enviar link mágico"}
            </button>
          </form>
        )}

        <div className="flex items-center gap-2 my-4">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs text-slate-400">ou</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <button
          onClick={signInWithGoogle}
          className="w-full rounded-xl border border-slate-200 bg-white text-slate-800 font-medium py-3 flex items-center justify-center gap-2"
        >
          <GoogleGlyph />
          Entrar com Google
        </button>

        {error && <div className="mt-4 text-sm text-rose-600 text-center">{error}</div>}

        <p className="mt-8 text-[11px] text-slate-400 text-center leading-relaxed">
          Ao continuar você aceita os Termos de Uso e a Política de Privacidade.
        </p>
      </div>
    </div>
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
