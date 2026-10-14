import { useState } from "react";
import Icon from "../components/Icon.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import ProdutoForm from "../components/ProdutoForm.jsx";
import ProdutoThumb from "../components/ProdutoThumb.jsx";
import ScanProdutoSheet from "../components/ScanProdutoSheet.jsx";
import { api } from "../lib/api.js";
import { removeImages } from "../lib/storage.js";
import { useStore } from "../state/store.jsx";

export default function ProdutosScreen() {
  const { produtos, refreshProdutos, showToast } = useStore();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [scanning, setScanning] = useState(false);   // capture sheet open
  const [scanResult, setScanResult] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  // Arquivados ficam no store (comidas/marmitas/dias antigos ainda resolvem por eles),
  // mas só aparecem aqui, na seção recolhida "Arquivados".
  const matches  = (p) => !q || p.name.toLowerCase().includes(q.toLowerCase());
  const active   = produtos.filter(p => !p.archived);
  const list     = active.filter(matches);
  const archived = produtos.filter(p => p.archived && matches(p));

  async function save(p) {
    if (p.id) await api.produtos.update(p.id, p); else await api.produtos.create(p);
    showToast(p.id ? "Produto atualizado" : "Produto criado");
    setEditing(null);
    refreshProdutos();
  }
  const detailOf = (p) => p.brand ? `${p.name} · ${p.brand}` : p.name;

  async function remove(p) {
    try {
      await api.produtos.remove(p.id);
      removeImages("produtos", [p.coverUrl, p.labelUrl]);
      showToast("Produto removido");
      refreshProdutos();
    } catch (e) {
      // 409 = referenciado por comida/marmita/dia. Excluir quebraria essas referências,
      // então oferece arquivar: some das listas e do chat, o resto segue funcionando.
      if (e?.status === 409) askArchive(p);
      else showToast(e?.message || "Não foi possível remover o produto.", "error");
    }
  }
  async function setArchived(p, archived) {
    try {
      await (archived ? api.produtos.archive(p.id) : api.produtos.unarchive(p.id));
      showToast(archived ? "Produto arquivado" : "Produto restaurado");
      refreshProdutos();
    } catch (e) {
      showToast(e?.message || "Não foi possível arquivar o produto.", "error");
    }
  }
  function askRemove(p) {
    setConfirm({
      title: "Excluir produto?",
      message: "Este produto será removido da sua lista.",
      detail: detailOf(p),
      onConfirm: async () => { setConfirm(null); await remove(p); },
    });
  }
  function askArchive(p) {
    setConfirm({
      title: "Produto em uso",
      message: "Ele está numa comida, marmita ou dia registrado, então não dá pra excluir. Arquivar tira ele da lista, dos seletores e do chat; o que já usa ele continua igual.",
      detail: detailOf(p),
      confirmLabel: "Arquivar",
      tone: "neutral",
      icon: "archive",
      onConfirm: async () => { setConfirm(null); await setArchived(p, true); },
    });
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="shrink-0 px-5 pt-5 pb-3 bg-white border-b border-slate-200">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-[22px] font-bold text-slate-900">Produtos</h1>
            <p className="text-sm text-slate-500">{active.length} itens</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setScanning(true)} className="h-10 px-3 rounded-full bg-slate-900 text-white text-sm font-semibold flex items-center gap-1.5 shadow"><Icon name="camera" className="w-4 h-4"/> Scan</button>
            <button onClick={() => setEditing("new")} className="h-10 w-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow"><Icon name="plus"/></button>
          </div>
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar produto" className="w-full bg-slate-100 rounded-xl px-4 py-2.5 outline-none"/>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 scroll-hide">
        {list.map(p => (
          <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-3">
            <ProdutoThumb key={p.coverUrl || "none"} url={p.coverUrl} zoomable/>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-800 truncate">{p.name}</div>
              <div className="text-[11px] text-slate-500">{p.brand ? `${p.brand} · ` : ""}{Math.round(p.caloriesPerGram * 100)} kcal · {(p.proteinPerGram * 100).toFixed(1)}g prot / 100g</div>
            </div>
            <button onClick={() => setEditing(p)} className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 flex items-center justify-center"><Icon name="edit" className="w-4 h-4"/></button>
            <button onClick={() => askRemove(p)} className="w-8 h-8 rounded-full hover:bg-red-50 text-red-500 flex items-center justify-center"><Icon name="trash" className="w-4 h-4"/></button>
          </div>
        ))}
        {list.length === 0 && <div className="text-center text-slate-400 py-8 text-sm">Nenhum produto.</div>}
        {archived.length > 0 && (
          <div className="pt-2">
            <button onClick={() => setShowArchived(v => !v)} className="w-full flex items-center gap-2 px-1 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <Icon name="archive" className="w-4 h-4"/> Arquivados ({archived.length})
              <span className="ml-auto">{showArchived ? "Ocultar" : "Mostrar"}</span>
            </button>
            {showArchived && (
              <div className="space-y-2">
                {archived.map(p => (
                  <div key={p.id} className="bg-white/60 rounded-2xl border border-dashed border-slate-200 p-3 flex items-center gap-3 opacity-70">
                    <ProdutoThumb key={p.coverUrl || "none"} url={p.coverUrl}/>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-700 truncate">{p.name}</div>
                      <div className="text-[11px] text-slate-500">{p.brand ? `${p.brand} · ` : ""}{Math.round(p.caloriesPerGram * 100)} kcal / 100g</div>
                    </div>
                    <button onClick={() => setArchived(p, false)} className="h-8 px-3 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">Restaurar</button>
                    <button onClick={() => askRemove(p)} className="w-8 h-8 rounded-full hover:bg-red-50 text-red-500 flex items-center justify-center"><Icon name="trash" className="w-4 h-4"/></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {editing && <ProdutoForm produto={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={save}/>}
      {scanning && <ScanProdutoSheet onClose={() => setScanning(false)} onResult={(r) => { setScanning(false); setScanResult(r); }}/>}
      {scanResult && <ProdutoForm produto={null} prefill={scanResult} onClose={() => setScanResult(null)} onSave={async (p) => { await save(p); setScanResult(null); }}/>}
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        detail={confirm?.detail}
        confirmLabel={confirm?.confirmLabel}
        tone={confirm?.tone}
        icon={confirm?.icon}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
