import { useState } from "react";
import { auth, verifyPassword } from "../lib/api.js";

export default function LoginScreen({ onAuthed }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError("");
    try {
      const ok = await verifyPassword(password);
      if (!ok) {
        setError("Senha incorreta.");
        setBusy(false);
        return;
      }
      auth.set(password);
      onAuthed();
    } catch (err) {
      setError("Erro de conexão. Tente novamente.");
      setBusy(false);
    }
  }

  return (
    <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-white px-6">
      <div className="w-full max-w-xs">
        <h1 className="text-3xl font-semibold text-slate-900 mb-1 text-center">Nutri</h1>
        <p className="text-sm text-slate-500 mb-8 text-center">Entre com a senha para continuar</p>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base focus:outline-none focus:border-emerald-500"
          />
          {error && <div className="text-sm text-rose-600">{error}</div>}
          <button
            type="submit"
            disabled={busy || !password}
            className="w-full rounded-xl bg-emerald-600 text-white font-medium py-3 disabled:opacity-50"
          >
            {busy ? "Verificando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
