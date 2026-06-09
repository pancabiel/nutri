import { useState } from "react";
import Icon from "./Icon.jsx";
import { api } from "../lib/api.js";

/**
 * Paywall modal. Two trigger paths:
 *   1) Implicit — backend returns 402 (cap_exceeded), api.js emits
 *      `nutri:cap-exceeded` and App.jsx renders this with the cap body.
 *   2) Explicit — Settings → "Assinar Nutri Pro" mounts it without cap context.
 *
 * On confirm, hits POST /billing/checkout and redirects to the Stripe-hosted
 * Checkout. We never touch card data in this app.
 */
export default function UpgradeModal({ cap, onClose }) {
  const [plan, setPlan] = useState("yearly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const { url } = await api.billing.checkout(plan);
      window.location.assign(url);
    } catch (e) {
      console.error("checkout failed", e);
      setError("Não consegui abrir o checkout. Tente de novo em alguns segundos.");
      setBusy(false);
    }
  }

  const headline = cap ? capHeadline(cap) : "Liberar tudo no Nutri Pro";
  const sub      = cap ? cap.message       : "Mais chats por dia, mais fotos, mais scans de rótulo. Cancele quando quiser.";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm fade-in">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl">
        <div className="px-5 pt-5 pb-4 border-b border-slate-100 flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
            <Icon name="sparkles" className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-slate-900 leading-tight">{headline}</h2>
            <p className="text-sm text-slate-500 mt-1">{sub}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 -mt-1 -mr-1 p-1">
            <Icon name="close" className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-4 pb-[max(env(safe-area-inset-bottom),16px)]">
          <ul className="space-y-2 mb-4">
            <Bullet>20 mensagens de chat por dia</Bullet>
            <Bullet>10 análises de foto por dia</Bullet>
            <Bullet>10 scans de rótulo por dia</Bullet>
            <Bullet>Histórico completo + suporte</Bullet>
          </ul>

          <div className="space-y-2 mb-4">
            <PlanCard
              id="yearly"
              selected={plan === "yearly"}
              onSelect={() => setPlan("yearly")}
              title="Anual"
              price="R$ 119"
              suffix="/ano"
              badge="Economize 33%"
              detail="Equivale a R$ 9,90/mês"
            />
            <PlanCard
              id="monthly"
              selected={plan === "monthly"}
              onSelect={() => setPlan("monthly")}
              title="Mensal"
              price="R$ 14,90"
              suffix="/mês"
              detail="Cancele quando quiser"
            />
          </div>

          {error && (
            <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 mb-3">
              {error}
            </div>
          )}

          <button
            onClick={confirm}
            disabled={busy}
            className="w-full bg-emerald-500 disabled:opacity-60 text-white font-semibold py-3 rounded-full"
          >
            {busy ? "Abrindo checkout…" : "Assinar agora"}
          </button>
          <p className="text-[11px] text-slate-400 text-center mt-3">
            Pagamento seguro via Stripe · Cancele a qualquer momento
          </p>
        </div>
      </div>
    </div>
  );
}

function capHeadline(cap) {
  if (cap.tier === "free") {
    switch (cap.kind) {
      case "chat":  return "Você usou suas mensagens grátis";
      case "photo": return "Sua foto grátis acabou";
      case "label": return "Seu scan grátis acabou";
      default:      return "Limite gratuito atingido";
    }
  }
  return "Limite diário do Pro atingido";
}

function Bullet({ children }) {
  return (
    <li className="flex items-start gap-2 text-sm text-slate-700">
      <Icon name="check" className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
      <span>{children}</span>
    </li>
  );
}

function PlanCard({ selected, onSelect, title, price, suffix, badge, detail }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-2xl border px-4 py-3 transition ${
        selected ? "border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/30" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-900">{title}</span>
          {badge && (
            <span className="text-[10px] uppercase tracking-wide font-bold bg-emerald-500 text-white px-1.5 py-0.5 rounded">
              {badge}
            </span>
          )}
        </div>
        <div className="text-right">
          <div className="font-bold text-slate-900">
            {price}<span className="text-xs text-slate-500 font-normal">{suffix}</span>
          </div>
        </div>
      </div>
      {detail && <div className="text-xs text-slate-500 mt-1">{detail}</div>}
    </button>
  );
}
