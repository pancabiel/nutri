import { useState } from "react";
import Icon from "../components/Icon.jsx";
import Sheet from "../components/Sheet.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { api } from "../lib/api.js";
import { useStore } from "../state/store.jsx";

export default function ComidasScreen() {
  const { comidas, produtos, refreshComidas, showToast } = useStore();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const list = comidas.filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()));

  async function save(c) {
    if (c.id) await api.comidas.update(c.id, c); else await api.comidas.create(c);
    showToast(c.id ? "Comida atualizada" : "Comida criada");
    setEditing(null);
    refreshComidas();
  }
  async function remove(id) { await api.comidas.remove(id); showToast("Comida removida"); refreshComidas(); }
  function askRemove(c) {
    setConfirm({
      detail: `${c.name} · ${c.items.length} ${c.items.length === 1 ? "produto" : "produtos"}`,
      onConfirm: async () => { setConfirm(null); await remove(c.id); },
    });
  }

  const macros = (c) => {
    const cal = c.items.reduce((s, it) => {
      const p = produtos.find(x => x.id === it.produtoId);
      return s + (p ? p.caloriesPerGram * it.quantityGrams : 0);
    }, 0);
    const prot = c.items.reduce((s, it) => {
      const p = produtos.find(x => x.id === it.produtoId);
      return s + (p ? p.proteinPerGram * it.quantityGrams : 0);
    }, 0);
    return { cal: Math.round(cal), prot: +prot.toFixed(1) };
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="shrink-0 px-5 pt-[max(env(safe-area-inset-top),20px)] pb-3 bg-white border-b border-slate-200">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-[22px] font-bold text-slate-900">Comidas</h1>
            <p className="text-sm text-slate-500">Pratos compostos por produtos</p>
          </div>
          <button onClick={() => setEditing("new")} className="h-10 w-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow"><Icon name="plus"/></button>
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar comida" className="w-full bg-slate-100 rounded-xl px-4 py-2.5 outline-none"/>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 scroll-hide">
        {list.map(c => {
          const m = macros(c);
          return (
            <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center text-lg shrink-0">🍽️</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 truncate">{c.name}</div>
                  <div className="text-[11px] text-slate-500">{c.items.length} produtos · {m.cal} kcal · {m.prot}g prot</div>
                </div>
                <button onClick={() => setEditing(c)} className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 flex items-center justify-center"><Icon name="edit" className="w-4 h-4"/></button>
                <button onClick={() => askRemove(c)} className="w-8 h-8 rounded-full hover:bg-red-50 text-red-500 flex items-center justify-center"><Icon name="trash" className="w-4 h-4"/></button>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {c.items.map((it, i) => {
                  const p = produtos.find(x => x.id === it.produtoId);
                  if (!p) return null;
                  return <span key={i} className="text-[11px] bg-slate-100 rounded-full px-2 py-0.5 text-slate-600">{p.name} · {it.quantityGrams}g</span>;
                })}
              </div>
            </div>
          );
        })}
      </div>
      {editing && <ComidaForm comida={editing === "new" ? null : editing} produtos={produtos} onClose={() => setEditing(null)} onSave={save}/>}
      <ConfirmDialog
        open={!!confirm}
        title="Excluir comida?"
        message="Esta comida será removida da sua lista."
        detail={confirm?.detail}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function ComidaForm({ comida, produtos, onClose, onSave }) {
  const [name, setName] = useState(comida?.name ?? "");
  const [items, setItems] = useState(comida?.items ?? []);
  const [picker, setPicker] = useState(false);

  const totalCal = Math.round(items.reduce((s, it) => {
    const p = produtos.find(x => x.id === it.produtoId);
    return s + (p ? p.caloriesPerGram * it.quantityGrams : 0);
  }, 0));
  const totalProt = +items.reduce((s, it) => {
    const p = produtos.find(x => x.id === it.produtoId);
    return s + (p ? p.proteinPerGram * it.quantityGrams : 0);
  }, 0).toFixed(1);

  return (
    <Sheet onClose={onClose} title={comida ? "Editar comida" : "Nova comida"} fullScreen>
      <label className="block">
        <div className="text-xs text-slate-500 font-medium mb-1">Nome</div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Sanduíche de frango" className="w-full bg-slate-100 rounded-lg px-3 py-2 outline-none"/>
      </label>
      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Composição</div>
        <button onClick={() => setPicker(true)} className="text-xs font-semibold text-emerald-600 inline-flex items-center gap-1"><Icon name="plus" className="w-3 h-3"/> produto</button>
      </div>
      <div className="mt-2 space-y-1">
        {items.length === 0 && <div className="text-sm text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-xl">Toque em + produto.</div>}
        {items.map((it, i) => {
          const p = produtos.find(x => x.id === it.produtoId);
          if (!p) return null;
          return (
            <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-slate-800 truncate">{p.name}</div>
                <div className="text-[11px] text-slate-500">{Math.round(p.caloriesPerGram * it.quantityGrams)} kcal</div>
              </div>
              <input type="number" value={it.quantityGrams} onChange={e => { const v = parseFloat(e.target.value) || 0; setItems(prev => prev.map((x, xi) => xi === i ? { ...x, quantityGrams: v } : x)); }} className="w-20 bg-white rounded-lg px-2 py-1 border border-slate-200 text-sm text-right"/>
              <span className="text-xs text-slate-400">g</span>
              <button onClick={() => setItems(prev => prev.filter((_, xi) => xi !== i))} className="text-red-500"><Icon name="close" className="w-4 h-4"/></button>
            </div>
          );
        })}
      </div>
      {items.length > 0 && (
        <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-center justify-between text-sm">
          <span className="text-emerald-700 font-semibold">Total</span>
          <span className="font-bold text-emerald-900">{totalCal} kcal · {totalProt}g</span>
        </div>
      )}
      <button onClick={() => onSave({ ...(comida ?? {}), name, items })} disabled={!name.trim() || items.length === 0} className="w-full mt-5 bg-emerald-500 disabled:bg-slate-200 text-white font-semibold py-3 rounded-full">Salvar</button>

      {picker && <ProdutoPicker produtos={produtos} onClose={() => setPicker(false)} onPick={(id, g) => { setItems(prev => [...prev, { produtoId: id, quantityGrams: g }]); setPicker(false); }}/>}
    </Sheet>
  );
}

function ProdutoPicker({ produtos, onClose, onPick }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(null);
  const [g, setG] = useState(100);
  const list = produtos.filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Sheet onClose={onClose} title="Escolher produto" fullScreen>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar..." className="w-full bg-slate-100 rounded-xl px-4 py-2.5 outline-none mb-3"/>
      <div className="overflow-y-auto scroll-hide space-y-1 mb-3">
        {list.map(p => (
          <button key={p.id} onClick={() => setPicked(p)} className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between ${picked?.id === p.id ? "bg-emerald-50 border border-emerald-300" : "hover:bg-slate-50 border border-transparent"}`}>
            <div className="font-semibold text-slate-800 text-sm">{p.name}</div>
            {picked?.id === p.id && <Icon name="check" className="w-4 h-4 text-emerald-600"/>}
          </button>
        ))}
      </div>
      {picked && (
        <div className="flex items-center gap-2 mb-3">
          <input type="number" value={g} onChange={e => setG(parseFloat(e.target.value) || 0)} className="flex-1 bg-slate-100 rounded-lg px-3 py-2 outline-none"/>
          <span className="text-sm text-slate-500">gramas</span>
        </div>
      )}
      <button disabled={!picked || !g} onClick={() => onPick(picked.id, g)} className="w-full bg-emerald-500 disabled:bg-slate-200 text-white font-semibold py-3 rounded-full">Adicionar</button>
    </Sheet>
  );
}
