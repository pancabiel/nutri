import Icon from "./Icon.jsx";

// Renders the frozen recipe `snapshot` attached to a feed post. Pure display from the
// self-contained snapshot — no API/library reads. Shape varies by refType (see
// FeedService on the backend): produto | comida | marmita | prato.

const REF_META = {
  produto: { icon: "box",      label: "Produto" },
  comida:  { icon: "plate",    label: "Receita" },
  marmita: { icon: "layers",   label: "Marmita" },
  prato:   { icon: "drumstick", label: "Prato" },
};

export default function RecipeSnapshotCard({ refType, snapshot }) {
  if (!refType || !snapshot) return null;
  const meta = REF_META[refType] || { icon: "plate", label: "Receita" };
  const { title, subtitle, lines } = summarize(refType, snapshot);

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-white">
        <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
          <Icon name={meta.icon} className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{meta.label}</div>
          <div className="font-semibold text-slate-800 text-sm truncate">{title}</div>
        </div>
      </div>
      <div className="px-3 py-2">
        {subtitle && <div className="text-xs text-slate-500 mb-1">{subtitle}</div>}
        {lines.length > 0 && (
          <ul className="text-[12px] text-slate-600 space-y-0.5">
            {lines.slice(0, 6).map((l, i) => <li key={i} className="truncate">• {l}</li>)}
            {lines.length > 6 && <li className="text-slate-400">+{lines.length - 6} mais…</li>}
          </ul>
        )}
      </div>
    </div>
  );
}

function summarize(refType, s) {
  if (refType === "produto") {
    const per100 = (v) => v != null ? Math.round(v * 100) : null;
    const cal = per100(s.caloriesPerGram);
    const prot = s.proteinPerGram != null ? +(s.proteinPerGram * 100).toFixed(1) : null;
    return {
      title: s.name + (s.brand ? ` (${s.brand})` : ""),
      subtitle: cal != null ? `${cal} kcal · ${prot}g prot / 100g` : "",
      lines: [],
    };
  }
  if (refType === "comida") {
    const ings = s.ingredients || [];
    let cal = 0, prot = 0;
    ings.forEach((i) => { cal += (i.caloriesPerGram || 0) * (i.grams || 0); prot += (i.proteinPerGram || 0) * (i.grams || 0); });
    const sub = `${Math.round(cal)} kcal · ${prot.toFixed(0)}g prot` + (s.yieldGrams ? ` · rende ${Math.round(s.yieldGrams)}g` : "");
    return { title: s.name, subtitle: sub, lines: ings.map((i) => `${i.name} — ${Math.round(i.grams)}g`) };
  }
  if (refType === "marmita") {
    const items = s.items || [];
    return {
      title: s.name,
      subtitle: `${items.length} ${items.length === 1 ? "item" : "itens"}`,
      lines: items.map((i) => `${i.name}${i.quantity ? ` — ${Math.round(i.quantity)}${i.unit === "porcao" ? "×" : (i.unit || "g")}` : ""}`),
    };
  }
  if (refType === "prato") {
    const items = s.items || [];
    const cal = items.reduce((a, i) => a + (i.calories || 0), 0);
    return {
      title: s.section || "Prato",
      subtitle: `${Math.round(cal)} kcal · ${items.length} ${items.length === 1 ? "item" : "itens"}`,
      lines: items.map((i) => `${i.name} — ${Math.round(i.quantity)}${i.unit === "porcao" ? "×" : (i.unit || "g")}`),
    };
  }
  return { title: "Receita", subtitle: "", lines: [] };
}
