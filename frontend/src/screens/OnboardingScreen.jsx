import { useState } from "react";
import { api } from "../lib/api.js";
import { supabase } from "../lib/supabase.js";

const ACTIVITY = [
  { value: 1.2,   label: "Sedentário",  emoji: "🛋️", hint: "Pouco ou nenhum exercício" },
  { value: 1.375, label: "Leve",        emoji: "🚶", hint: "Exercício 1-3x por semana" },
  { value: 1.55,  label: "Moderado",    emoji: "🏃", hint: "Exercício 3-5x por semana" },
  { value: 1.725, label: "Ativo",       emoji: "💪", hint: "Exercício 6-7x por semana" },
  { value: 1.9,   label: "Muito ativo", emoji: "🔥", hint: "Atleta ou trabalho físico" },
];

export default function OnboardingScreen({ onDone }) {
  const [step, setStep] = useState(0);
  const [weightKg, setWeightKg] = useState("");
  const [targetWeightKg, setTargetWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const [activity, setActivity] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function next() { setStep(s => s + 1); }
  function back() { setStep(s => Math.max(0, s - 1)); }

  async function switchAccount() {
    await supabase.auth.signOut();
    window.location.reload();
  }

  async function finish() {
    setError("");
    setBusy(true);
    try {
      const w = parseFloat(weightKg);
      const tw = targetWeightKg ? parseFloat(targetWeightKg) : null;
      const h = parseFloat(heightCm);
      const a = parseInt(age, 10);
      const yob = new Date().getFullYear() - a;
      // Mifflin-St Jeor
      const bmr = sex === "M"
        ? 10 * w + 6.25 * h - 5 * a + 5
        : 10 * w + 6.25 * h - 5 * a - 161;
      const tdee = bmr * activity;
      // If targeting weight loss, default to -500 kcal/day (≈ 0.5kg/week).
      const calorieGoal = Math.round(tw && tw < w ? tdee - 500 : tdee);
      const proteinGoal = Math.round(w * 1.8 * 10) / 10;

      await api.profile.update({
        weightKg: w,
        targetWeightKg: tw,
        heightCm: h,
        birthYear: yob,
        sex,
        activityMultiplier: activity,
        calorieGoal,
        proteinGoal,
        onboardingComplete: true,
      });
      onDone();
    } catch (e) {
      setError("Algo deu errado. Tente novamente.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full w-full flex flex-col bg-gradient-to-b from-emerald-50 via-white to-white px-6 pt-[max(env(safe-area-inset-top),24px)] pb-[max(env(safe-area-inset-bottom),24px)]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5 flex-1">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-emerald-500" : "bg-slate-200"}`}
            />
          ))}
        </div>
        <button
          onClick={switchAccount}
          className="ml-3 text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2"
        >
          Trocar de conta
        </button>
      </div>

      <div className="flex-1 flex flex-col">
        {step === 0 && (
          <Step
            badge="👋 Oi!"
            title="Vamos te conhecer"
            subtitle="Em 4 passos a gente já calcula suas metas de calorias e proteína."
          >
            <Field label="Sua idade">
              <input
                type="number"
                inputMode="numeric"
                min="13"
                max="120"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Ex: 28"
                className="input"
                autoFocus
              />
            </Field>
            <Field label="Sexo biológico">
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["M", "Masculino", "👨"],
                  ["F", "Feminino",  "👩"],
                ].map(([v, l, e]) => (
                  <button
                    key={v}
                    onClick={() => setSex(v)}
                    className={`rounded-2xl border-2 py-4 text-sm font-medium transition-all active:scale-95 flex flex-col items-center gap-1.5 ${sex === v ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-200" : "border-slate-200 bg-white text-slate-700"}`}
                  >
                    <span className="text-2xl leading-none">{e}</span>
                    {l}
                  </button>
                ))}
              </div>
            </Field>
          </Step>
        )}

        {step === 1 && (
          <Step
            badge="📏 Medidas"
            title="Suas medidas atuais"
            subtitle="Pra calcular sua taxa metabólica basal."
          >
            <Field label="Peso atual (kg)">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="72.5"
                className="input"
                autoFocus
              />
            </Field>
            <Field label="Altura (cm)">
              <input
                type="number"
                inputMode="numeric"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                placeholder="175"
                className="input"
              />
            </Field>
          </Step>
        )}

        {step === 2 && (
          <Step
            badge="🎯 Meta"
            title="Tem uma meta de peso?"
            subtitle="Opcional. Se deixar vazio, a gente calcula pra manter."
          >
            <Field label="Peso meta (kg)">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={targetWeightKg}
                onChange={(e) => setTargetWeightKg(e.target.value)}
                placeholder="68"
                className="input"
                autoFocus
              />
            </Field>
            <p className="text-xs text-slate-500 -mt-1">
              Pode pular essa etapa e ajustar depois.
            </p>
          </Step>
        )}

        {step === 3 && (
          <Step
            badge="🏃 Rotina"
            title="Como é sua rotina?"
            subtitle="Escolha o que mais combina com sua semana."
          >
            <div className="flex flex-col gap-2">
              {ACTIVITY.map(a => (
                <button
                  key={a.value}
                  onClick={() => setActivity(a.value)}
                  className={`rounded-2xl border-2 p-3 text-left transition-all active:scale-[0.98] flex items-center gap-3 ${activity === a.value ? "border-emerald-500 bg-emerald-50 shadow-sm shadow-emerald-200" : "border-slate-200 bg-white"}`}
                >
                  <span className="text-2xl leading-none">{a.emoji}</span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-900">{a.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{a.hint}</div>
                  </div>
                </button>
              ))}
            </div>
          </Step>
        )}

        {error && <div className="text-sm text-rose-600 text-center mt-3">{error}</div>}
      </div>

      <div className="flex gap-2 mt-6">
        {step > 0 && (
          <button
            onClick={back}
            className="flex-1 rounded-xl border border-slate-200 bg-white text-slate-700 py-3.5 font-medium active:scale-[0.98] transition-transform"
          >
            Voltar
          </button>
        )}
        {step < 3 && (
          <button
            onClick={next}
            disabled={!canAdvance(step, { age, sex, weightKg, heightCm })}
            className="flex-[2] rounded-xl bg-emerald-600 text-white font-semibold py-3.5 disabled:opacity-40 active:scale-[0.98] transition-transform shadow-lg shadow-emerald-500/20"
          >
            {step === 2 && !targetWeightKg ? "Pular" : "Continuar →"}
          </button>
        )}
        {step === 3 && (
          <button
            onClick={finish}
            disabled={busy || !activity}
            className="flex-[2] rounded-xl bg-emerald-600 text-white font-semibold py-3.5 disabled:opacity-40 active:scale-[0.98] transition-transform shadow-lg shadow-emerald-500/20"
          >
            {busy ? "Salvando…" : "Bora começar! 🎉"}
          </button>
        )}
      </div>

      <style>{`
        .input {
          width: 100%;
          border-radius: 0.875rem;
          border: 1.5px solid #e2e8f0;
          padding: 0.85rem 1rem;
          font-size: 1rem;
          outline: none;
          background: white;
          transition: border-color 150ms;
        }
        .input:focus { border-color: #10b981; box-shadow: 0 0 0 3px rgb(16 185 129 / 0.1); }
      `}</style>
    </div>
  );
}

function Step({ badge, title, subtitle, children }) {
  return (
    <div className="flex flex-col gap-4 fade-in" key={title}>
      <div>
        {badge && (
          <div className="inline-block text-xs font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full mb-3">
            {badge}
          </div>
        )}
        <h2 className="text-[26px] font-bold text-slate-900 leading-tight">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-1.5">{subtitle}</p>}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function canAdvance(step, { age, sex, weightKg, heightCm }) {
  if (step === 0) {
    if (!age || !sex) return false;
    const a = parseInt(age, 10);
    if (Number.isNaN(a) || a < 13 || a > 120) return false;
    return true;
  }
  if (step === 1) return weightKg && heightCm;
  if (step === 2) return true; // target is optional
  return true;
}
