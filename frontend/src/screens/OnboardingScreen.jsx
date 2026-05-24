import { useState } from "react";
import { api } from "../lib/api.js";

const ACTIVITY = [
  { value: 1.2,   label: "Sedentário",     hint: "Pouco ou nenhum exercício" },
  { value: 1.375, label: "Leve",           hint: "Exercício 1-3x por semana" },
  { value: 1.55,  label: "Moderado",       hint: "Exercício 3-5x por semana" },
  { value: 1.725, label: "Ativo",          hint: "Exercício 6-7x por semana" },
  { value: 1.9,   label: "Muito ativo",    hint: "Atleta ou trabalho físico" },
];

export default function OnboardingScreen({ onDone }) {
  const [step, setStep] = useState(0);
  const [weightKg, setWeightKg] = useState("");
  const [targetWeightKg, setTargetWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [sex, setSex] = useState("");
  const [activity, setActivity] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function next() { setStep(s => s + 1); }
  function back() { setStep(s => Math.max(0, s - 1)); }

  async function finish() {
    setError("");
    setBusy(true);
    try {
      const w = parseFloat(weightKg);
      const tw = targetWeightKg ? parseFloat(targetWeightKg) : null;
      const h = parseFloat(heightCm);
      const yob = parseInt(birthYear, 10);
      const age = new Date().getFullYear() - yob;
      // Mifflin-St Jeor
      const bmr = sex === "M"
        ? 10 * w + 6.25 * h - 5 * age + 5
        : 10 * w + 6.25 * h - 5 * age - 161;
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
    <div className="h-[100dvh] w-full flex flex-col bg-white px-6 py-8">
      <div className="flex items-center gap-2 mb-6">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-emerald-500" : "bg-slate-200"}`} />
        ))}
      </div>

      <div className="flex-1 flex flex-col">
        {step === 0 && (
          <Step title="Vamos conhecer você" subtitle="Pra calcular suas metas de calorias e proteína">
            <Field label="Idade (ano de nascimento)">
              <input
                type="number"
                inputMode="numeric"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
                placeholder="1995"
                className="input"
              />
            </Field>
            <Field label="Sexo">
              <div className="grid grid-cols-2 gap-2">
                {[["M", "Masculino"], ["F", "Feminino"]].map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setSex(v)}
                    className={`rounded-xl border py-3 text-sm font-medium ${sex === v ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-700"}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </Field>
          </Step>
        )}

        {step === 1 && (
          <Step title="Suas medidas" subtitle="">
            <Field label="Peso atual (kg)">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="72.5"
                className="input"
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
          <Step title="Sua meta" subtitle="Opcional — deixe vazio se quer só manter o peso">
            <Field label="Peso meta (kg) — opcional">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={targetWeightKg}
                onChange={(e) => setTargetWeightKg(e.target.value)}
                placeholder="68"
                className="input"
              />
            </Field>
          </Step>
        )}

        {step === 3 && (
          <Step title="Nível de atividade" subtitle="Escolha o que melhor descreve sua rotina">
            <div className="flex flex-col gap-2">
              {ACTIVITY.map(a => (
                <button
                  key={a.value}
                  onClick={() => setActivity(a.value)}
                  className={`rounded-xl border p-3 text-left ${activity === a.value ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white"}`}
                >
                  <div className="text-sm font-medium text-slate-900">{a.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{a.hint}</div>
                </button>
              ))}
            </div>
          </Step>
        )}

        {error && <div className="text-sm text-rose-600 text-center mt-3">{error}</div>}
      </div>

      <div className="flex gap-2 mt-6">
        {step > 0 && (
          <button onClick={back} className="flex-1 rounded-xl border border-slate-200 bg-white text-slate-700 py-3 font-medium">
            Voltar
          </button>
        )}
        {step < 3 && (
          <button
            onClick={next}
            disabled={!canAdvance(step, { birthYear, sex, weightKg, heightCm })}
            className="flex-[2] rounded-xl bg-emerald-600 text-white font-medium py-3 disabled:opacity-50"
          >
            Continuar
          </button>
        )}
        {step === 3 && (
          <button
            onClick={finish}
            disabled={busy || !activity}
            className="flex-[2] rounded-xl bg-emerald-600 text-white font-medium py-3 disabled:opacity-50"
          >
            {busy ? "Salvando..." : "Concluir"}
          </button>
        )}
      </div>

      <style>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid #e2e8f0;
          padding: 0.75rem 1rem;
          font-size: 1rem;
          outline: none;
        }
        .input:focus { border-color: #10b981; }
      `}</style>
    </div>
  );
}

function Step({ title, subtitle, children }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
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

function canAdvance(step, { birthYear, sex, weightKg, heightCm }) {
  if (step === 0) return birthYear && sex;
  if (step === 1) return weightKg && heightCm;
  if (step === 2) return true; // target is optional
  return true;
}
