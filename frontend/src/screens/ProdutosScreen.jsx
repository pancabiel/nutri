import { useState } from "react";
import Icon from "../components/Icon.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import ProdutoForm from "../components/ProdutoForm.jsx";
import { api, pickPhoto } from "../lib/api.js";
import { useStore } from "../state/store.jsx";

export default function ProdutosScreen() {
  const { produtos, refreshProdutos, showToast } = useStore();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const list = produtos.filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()));

  async function save(p) {
    if (p.id) await api.produtos.update(p.id, p); else await api.produtos.create(p);
    showToast(p.id ? "Produto atualizado" : "Produto criado");
    setEditing(null);
    refreshProdutos();
  }
  async function remove(id) { await api.produtos.remove(id); showToast("Produto removido"); refreshProdutos(); }
  function askRemove(p) {
    setConfirm({
      detail: p.brand ? `${p.name} · ${p.brand}` : p.name,
      onConfirm: async () => { setConfirm(null); await remove(p.id); },
    });
  }

  async function onScan() {
    const picked = await pickPhoto();
    if (!picked) return;
    setScanning(true);
    try {
      const result = await api.scanLabel(picked.b64, picked.mime);
      setScanResult(result);
    } finally { setScanning(false); }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="shrink-0 px-5 pt-[max(env(safe-area-inset-top),20px)] pb-3 bg-white border-b border-slate-200">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-[22px] font-bold text-slate-900">Produtos</h1>
            <p className="text-sm text-slate-500">{produtos.length} itens</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onScan} disabled={scanning} className="h-10 px-3 rounded-full bg-slate-900 disabled:opacity-60 text-white text-sm font-semibold flex items-center gap-1.5 shadow"><Icon name="camera" className="w-4 h-4"/> {scanning ? "Lendo…" : "Scan"}</button>
            <button onClick={() => setEditing("new")} className="h-10 w-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow"><Icon name="plus"/></button>
          </div>
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar produto" className="w-full bg-slate-100 rounded-xl px-4 py-2.5 outline-none"/>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 scroll-hide">
        {list.map(p => (
          <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-lg shrink-0">🥚</div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-800 truncate">{p.name}</div>
              <div className="text-[11px] text-slate-500">{p.brand ? `${p.brand} · ` : ""}{Math.round(p.caloriesPerGram * 100)} kcal · {(p.proteinPerGram * 100).toFixed(1)}g prot / 100g</div>
            </div>
            <button onClick={() => setEditing(p)} className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 flex items-center justify-center"><Icon name="edit" className="w-4 h-4"/></button>
            <button onClick={() => askRemove(p)} className="w-8 h-8 rounded-full hover:bg-red-50 text-red-500 flex items-center justify-center"><Icon name="trash" className="w-4 h-4"/></button>
          </div>
        ))}
        {list.length === 0 && <div className="text-center text-slate-400 py-8 text-sm">Nenhum produto.</div>}
      </div>

      {editing && <ProdutoForm produto={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={save}/>}
      {scanResult && <ProdutoForm produto={null} prefill={scanResult} onClose={() => setScanResult(null)} onSave={(p) => { save(p); setScanResult(null); }}/>}
      <ConfirmDialog
        open={!!confirm}
        title="Excluir produto?"
        message="Este produto será removido da sua lista."
        detail={confirm?.detail}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

