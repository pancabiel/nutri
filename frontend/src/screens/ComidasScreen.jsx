import { useState } from "react";
import Icon from "../components/Icon.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import ComidaForm, { ComidaParseSheet } from "../components/ComidaForm.jsx";
import { api } from "../lib/api.js";
import { useStore } from "../state/store.jsx";
import { comidaTotals, comidaPerGram } from "../lib/macros.js";

export default function ComidasScreen() {
  const { comidas, produtos, refreshComidas, refreshProdutos, showToast } = useStore();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [parsing, setParsing] = useState(false);

  const list = comidas.filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()));

  async function save(c) {
    if (c.id) await api.comidas.update(c.id, c); else await api.comidas.create(c);
    showToast(c.id ? "Comida atualizada" : "Comida criada");
    setEditing(null);
    refreshComidas();
  }
  async function remove(id) {
    try {
      await api.comidas.remove(id);
      showToast("Comida removida");
      refreshComidas();
    } catch (e) {
      showToast(e?.message || "Não foi possível remover a comida.", "error");
    }
  }
  function askRemove(c) {
    setConfirm({
      detail: `${c.name} · ${c.items.length} ${c.items.length === 1 ? "produto" : "produtos"}`,
      onConfirm: async () => { setConfirm(null); await remove(c.id); },
    });
  }

  const macros = (c) => {
    const t = comidaTotals(c, produtos);
    return { cal: Math.round(t.cal), prot: +t.prot.toFixed(1) };
  };

  // The parse endpoint may have auto-created produtos for unmatched ingredients;
  // refresh the list so ComidaForm can resolve their macros, then open the editor.
  async function openDraft(draft) {
    setParsing(false);
    await refreshProdutos();
    if (draft.newProdutos > 0) {
      showToast(`${draft.newProdutos} ${draft.newProdutos === 1 ? "produto novo cadastrado" : "produtos novos cadastrados"}`);
    }
    setEditing({ name: draft.name ?? "", items: draft.items ?? [], yieldGrams: draft.yieldGrams ?? null });
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="shrink-0 px-5 pt-5 pb-3 bg-white border-b border-slate-200">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-[22px] font-bold text-slate-900">Comidas</h1>
            <p className="text-sm text-slate-500">Pratos compostos por produtos</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setParsing(true)} className="h-10 px-3 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center gap-1.5 text-sm font-semibold"><Icon name="sparkles" className="w-4 h-4"/> Texto</button>
            <button onClick={() => setEditing("new")} className="h-10 w-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow"><Icon name="plus"/></button>
          </div>
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
                  {c.yieldGrams > 0 && (() => { const pg = comidaPerGram(c, produtos); return (
                    <div className="text-[11px] text-amber-600">rende {Math.round(c.yieldGrams)}g · {pg ? Math.round(pg.cal * 100) : 0} kcal/100g</div>
                  ); })()}
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
      {parsing && <ComidaParseSheet onClose={() => setParsing(false)} onDraft={openDraft}/>}
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
