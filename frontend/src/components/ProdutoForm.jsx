import { useState } from "react";
import Icon from "./Icon.jsx";
import Sheet from "./Sheet.jsx";
import NumberInput from "./NumberInput.jsx";

export default function ProdutoForm({ produto, prefill, title, hint, onClose, onSave }) {
  const init = produto ?? {
    name: prefill?.name ?? "",
    brand: "",
    caloriesPerGram: prefill ? prefill.calories_per_100g / 100 : 0,
    proteinPerGram:  prefill ? prefill.protein_per_100g / 100 : 0,
    carbsPerGram:    prefill ? (prefill.carbs_per_100g ?? 0) / 100 : 0,
    fatPerGram:      prefill ? (prefill.fat_per_100g ?? 0) / 100 : 0,
    servingGrams:    prefill?.serving_grams ? prefill.serving_grams : null,
    servingLabel:    prefill?.serving_label ?? "",
  };
  const [form, setForm] = useState(init);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const per100 = (k) => +(form[k] * 100).toFixed(1);
  const setPer100 = (k, v) => set(k, (v ?? 0) / 100);

  const sheetTitle = title ?? (produto ? "Editar produto" : prefill ? "Confirmar dados escaneados" : "Novo produto");
  const showHint = hint ?? (prefill ? "Extraído da tabela nutricional. Confirme e salve." : null);

  return (
    <Sheet onClose={onClose} title={sheetTitle}>
      {showHint && (
        <div className="mb-3 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
          <Icon name="sparkles" className="w-4 h-4"/> {showHint}
        </div>
      )}
      <Field label="Nome"><input value={form.name} onChange={e => set("name", e.target.value)} className="w-full bg-slate-100 rounded-lg px-3 py-2 outline-none"/></Field>
      <Field label="Marca (opcional)"><input value={form.brand ?? ""} onChange={e => set("brand", e.target.value)} className="w-full bg-slate-100 rounded-lg px-3 py-2 outline-none"/></Field>
      <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold pt-3">Porção</div>
      <div className="grid grid-cols-[1fr_5rem] gap-3 mt-1">
        <Field label='Descrição (ex: "2 fatias")'>
          <input
            value={form.servingLabel ?? ""}
            onChange={e => set("servingLabel", e.target.value)}
            placeholder="2 fatias, 1 colher de sopa…"
            className="w-full bg-slate-100 rounded-lg px-3 py-2 outline-none"
          />
        </Field>
        <Field label="Gramas">
          <NumberInput
            value={form.servingGrams}
            onChange={v => set("servingGrams", v)}
            placeholder="—"
            className="w-full bg-slate-100 rounded-lg px-3 py-2 outline-none"
          />
        </Field>
      </div>
      <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold pt-3">Por 100 g</div>
      <div className="grid grid-cols-2 gap-3 mt-1">
        <Field label="Calorias (kcal)"><NumberInput value={per100("caloriesPerGram")} onChange={v => setPer100("caloriesPerGram", v)} className="w-full bg-slate-100 rounded-lg px-3 py-2 outline-none"/></Field>
        <Field label="Proteína (g)"><NumberInput value={per100("proteinPerGram")} onChange={v => setPer100("proteinPerGram", v)} className="w-full bg-slate-100 rounded-lg px-3 py-2 outline-none"/></Field>
        <Field label="Carbs (g)"><NumberInput value={per100("carbsPerGram")} onChange={v => setPer100("carbsPerGram", v)} className="w-full bg-slate-100 rounded-lg px-3 py-2 outline-none"/></Field>
        <Field label="Gordura (g)"><NumberInput value={per100("fatPerGram")} onChange={v => setPer100("fatPerGram", v)} className="w-full bg-slate-100 rounded-lg px-3 py-2 outline-none"/></Field>
      </div>
      <button onClick={() => onSave(form)} disabled={!form.name.trim()} className="w-full mt-5 bg-emerald-500 disabled:bg-slate-200 text-white font-semibold py-3 rounded-full">Salvar</button>
    </Sheet>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mt-2">
      <div className="text-xs text-slate-500 font-medium mb-1">{label}</div>
      {children}
    </label>
  );
}
