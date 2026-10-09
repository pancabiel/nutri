import Icon from "./Icon.jsx";
import ProdutoThumb from "./ProdutoThumb.jsx";

// Picker row: capa + nome + marca, so similar produtos (ex: 2 pães de forma) are told apart.
export default function ProdutoOption({ p, selected, onClick }) {
  return (
    <button onClick={onClick} className={`w-full text-left px-2 py-1.5 rounded-xl flex items-center gap-3 ${selected ? "bg-emerald-50 border border-emerald-300" : "hover:bg-slate-50 border border-transparent"}`}>
      <ProdutoThumb key={p.coverUrl || "none"} url={p.coverUrl}/>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-slate-800 text-sm truncate">{p.name}</div>
        <div className="text-[11px] text-slate-500 truncate">{p.brand ? `${p.brand} · ` : ""}{Math.round(p.caloriesPerGram * 100)} kcal / 100g</div>
      </div>
      {selected && <Icon name="check" className="w-4 h-4 text-emerald-600 shrink-0"/>}
    </button>
  );
}
