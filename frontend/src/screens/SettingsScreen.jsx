import { useEffect, useState } from "react";
import Icon from "../components/Icon.jsx";
import { api } from "../lib/api.js";
import { supabase } from "../lib/supabase.js";

export default function SettingsScreen({ onClose, profile: profileProp, onProfileRefresh }) {
  const [profile, setProfile] = useState(profileProp ?? null);
  const [email, setEmail] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState("idle"); // idle | confirming | deleting
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? "");
      if (!profileProp) {
        try { setProfile(await api.profile.get()); } catch {}
      }
    })();
  }, []);

  // Keep local copy in sync if parent refreshes after Stripe return.
  useEffect(() => { if (profileProp) setProfile(profileProp); }, [profileProp]);

  function openUpgrade() {
    window.dispatchEvent(new CustomEvent("nutri:open-upgrade"));
  }

  async function openPortal() {
    setPortalBusy(true);
    setPortalError("");
    try {
      const { url } = await api.billing.portal();
      window.location.assign(url);
    } catch (e) {
      console.error("portal failed", e);
      setPortalError("Não consegui abrir o portal. Tente de novo em alguns segundos.");
      setPortalBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.reload();
  }

  async function deleteAccount() {
    if (confirm.trim().toUpperCase() !== "EXCLUIR") {
      setError("Digite EXCLUIR pra confirmar.");
      return;
    }
    setError("");
    setBusy(true);
    setStage("deleting");
    try {
      await api.account.delete();
      await supabase.auth.signOut();
      window.location.reload();
    } catch (e) {
      setError("Falha ao excluir. Tente novamente.");
      setBusy(false);
      setStage("confirming");
    }
  }

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-white">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
        <button onClick={onClose} className="text-slate-500 text-sm">‹ Voltar</button>
        <h1 className="text-base font-semibold text-slate-900">Configurações</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-6">
        <section>
          <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Conta</div>
          <div className="rounded-xl border border-slate-200 bg-white">
            <Row label="Email" value={email || "—"} />
          </div>
        </section>

        <section>
          <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Plano</div>
          {profile?.isPro ? (
            <div className="rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-50 to-white p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon name="crown" className="w-5 h-5 text-emerald-600" />
                <span className="font-bold text-emerald-700">Nutri Pro ativo</span>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                {proSubLabel(profile)}
              </p>
              {portalError && (
                <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 mb-3">
                  {portalError}
                </div>
              )}
              <button
                onClick={openPortal}
                disabled={portalBusy}
                className="w-full rounded-xl bg-white border border-emerald-300 text-emerald-700 font-medium py-3 disabled:opacity-60"
              >
                {portalBusy ? "Abrindo…" : "Gerenciar assinatura"}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon name="lock" className="w-4 h-4 text-slate-400" />
                <span className="font-semibold text-slate-700">Plano Gratuito</span>
              </div>
              <p className="text-sm text-slate-500 mb-3">
                Você tem 3 mensagens, 1 foto e 1 scan de rótulo no total. Assine o Pro pra liberar 20 chats / 10 fotos / 10 scans por dia.
              </p>
              <button
                onClick={openUpgrade}
                className="w-full rounded-xl bg-emerald-500 text-white font-semibold py-3 inline-flex items-center justify-center gap-2"
              >
                <Icon name="sparkles" className="w-4 h-4" /> Assinar Nutri Pro
              </button>
            </div>
          )}
        </section>

        {profile?.onboardingComplete && (
          <section>
            <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Metas</div>
            <div className="rounded-xl border border-slate-200 bg-white">
              <Row label="Calorias/dia" value={profile.calorieGoal ? `${profile.calorieGoal} kcal` : "—"} />
              <Row label="Proteína/dia" value={profile.proteinGoal ? `${profile.proteinGoal} g` : "—"} />
              <Row label="Peso atual" value={profile.weightKg ? `${profile.weightKg} kg` : "—"} />
              <Row label="Peso meta" value={profile.targetWeightKg ? `${profile.targetWeightKg} kg` : "—"} />
            </div>
          </section>
        )}

        <section>
          <button
            onClick={signOut}
            className="w-full rounded-xl border border-slate-200 bg-white text-slate-700 font-medium py-3"
          >
            Sair
          </button>
        </section>

        <section className="pt-2">
          <div className="text-xs uppercase tracking-wide text-rose-500 mb-2">Zona de risco</div>
          {stage === "idle" && (
            <button
              onClick={() => setStage("confirming")}
              className="w-full rounded-xl border border-rose-200 bg-white text-rose-600 font-medium py-3"
            >
              Excluir minha conta
            </button>
          )}
          {stage !== "idle" && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 flex flex-col gap-3">
              <p className="text-sm text-rose-800 leading-relaxed">
                Isso vai apagar permanentemente sua conta, suas refeições, produtos e comidas.
                Não dá pra desfazer.
              </p>
              <input
                type="text"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Digite EXCLUIR"
                className="w-full rounded-xl border border-rose-300 px-4 py-3 text-base bg-white"
              />
              {error && <div className="text-sm text-rose-700">{error}</div>}
              <div className="flex gap-2">
                <button
                  onClick={() => { setStage("idle"); setConfirm(""); setError(""); }}
                  disabled={busy}
                  className="flex-1 rounded-xl border border-slate-200 bg-white text-slate-700 py-3 font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={deleteAccount}
                  disabled={busy}
                  className="flex-1 rounded-xl bg-rose-600 text-white py-3 font-medium disabled:opacity-50"
                >
                  {busy ? "Excluindo..." : "Confirmar exclusão"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}

function proSubLabel(profile) {
  if (!profile?.proUntil) return "Sua assinatura está ativa.";
  const d = new Date(profile.proUntil);
  if (Number.isNaN(d.getTime())) return "Sua assinatura está ativa.";
  const fmt = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  if (profile.subscriptionStatus === "canceled" || d.getTime() <= Date.now()) {
    return `Acesso até ${fmt}.`;
  }
  return `Próxima cobrança em ${fmt}.`;
}
