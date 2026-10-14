import { useEffect, useState } from "react";
import NumberInput from "./NumberInput.jsx";
import { api } from "../lib/api.js";
import { useStore } from "../state/store.jsx";

// Quantity entry for a picked produto. Logs by grams, or by portion when the produto has
// a serving hint ("1 fatia = 25g"). No serving yet → the user can define one inline; it's
// saved to the produto so every picker (and the chat parser) reuses it.
// Starts empty on purpose (no pre-filled grams). Reports grams (or null) via onChange.
// Parent should key this by produto id so state resets on a new pick.
export default function ProdutoQty({ produto, initialGrams = null, gramsLabel = "gramas", onChange }) {
  const { setProdutos, showToast } = useStore();
  const [serving, setServing] = useState({ grams: produto.servingGrams, label: produto.servingLabel });
  const hasServing = serving.grams > 0;
  const [unit, setUnit] = useState(hasServing && initialGrams == null ? "porcao" : "g");
  const [qty, setQty] = useState(initialGrams);
  const [defining, setDefining] = useState(false);

  const servingName = serving.label?.trim() || "porção";
  const grams = !(qty > 0) ? null : unit === "porcao" ? +(qty * serving.grams).toFixed(1) : qty;

  useEffect(() => { onChange(grams); }, [grams]); // eslint-disable-line react-hooks/exhaustive-deps

  function switchUnit(u) {
    if (u === unit) return;
    setUnit(u);
    setQty(null);
  }

  async function saveServing(label, g) {
    const updated = await api.produtos.update(produto.id, { ...produto, servingGrams: g, servingLabel: label || null });
    setProdutos(prev => prev.map(p => p.id === produto.id ? { ...p, servingGrams: g, servingLabel: label || null } : p));
    setServing({ grams: updated?.servingGrams ?? g, label: updated?.servingLabel ?? label });
    setDefining(false);
    setUnit("porcao");
    setQty(null);
    showToast("Unidade salva no produto");
  }

  return (
    <div className="mb-3">
      {hasServing && (
        <div className="flex gap-1 bg-slate-100 rounded-full p-1 mb-2">
          {[["porcao", servingName], ["g", "gramas"]].map(([u, label]) => (
            <button key={u} onClick={() => switchUnit(u)} className={`flex-1 py-2 rounded-full text-sm font-semibold ${unit === u ? "bg-white shadow text-slate-900" : "text-slate-500"}`}>{label}</button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <NumberInput value={qty} onChange={v => setQty(v)} placeholder={unit === "porcao" ? "ex: 2" : "ex: 100"} className="flex-1 bg-slate-100 rounded-lg px-3 py-2 outline-none"/>
        <span className="text-sm text-slate-500">{unit === "porcao" ? servingName : gramsLabel}</span>
      </div>
      <div className="text-[11px] text-slate-500 mt-1 px-1 flex items-center justify-between gap-2">
        <span>
          {grams != null && <>{unit === "porcao" ? `= ${grams}g · ` : ""}{Math.round(produto.caloriesPerGram * grams)} kcal</>}
        </span>
        {!defining && (
          <button onClick={() => setDefining(true)} className="text-emerald-600 font-semibold shrink-0">
            {hasServing ? `1 ${servingName} = ${serving.grams}g · editar` : "+ Definir unidade"}
          </button>
        )}
      </div>
      {defining && <ServingEditor initial={serving} onCancel={() => setDefining(false)} onSave={saveServing}/>}
    </div>
  );
}

function ServingEditor({ initial, onCancel, onSave }) {
  const [label, setLabel] = useState(initial.label ?? "");
  const [g, setG] = useState(initial.grams > 0 ? initial.grams : null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try { await onSave(label.trim(), g); } finally { setBusy(false); }
  }

  return (
    <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-500">1</span>
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="fatia, unidade, pote…" className="flex-1 min-w-0 bg-white rounded-lg px-3 py-2 border border-slate-200 outline-none text-sm"/>
        <span className="text-sm text-slate-500">=</span>
        <NumberInput value={g} onChange={setG} placeholder="g" className="w-20 bg-white rounded-lg px-3 py-2 border border-slate-200 outline-none text-sm text-right"/>
        <span className="text-sm text-slate-500">g</span>
      </div>
      <div className="text-[11px] text-slate-500 mt-2">Veja na embalagem (ex: "Porção 30g, 1 fatia") ou pese uma unidade uma vez.</div>
      <div className="flex gap-2 mt-2">
        <button onClick={onCancel} className="flex-1 py-2 rounded-full text-sm font-semibold bg-slate-100 text-slate-600">Cancelar</button>
        <button onClick={save} disabled={busy || !(g > 0)} className="flex-1 py-2 rounded-full text-sm font-semibold bg-emerald-500 disabled:bg-slate-200 text-white">{busy ? "Salvando…" : "Salvar"}</button>
      </div>
    </div>
  );
}
