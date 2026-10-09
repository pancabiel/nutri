import { useState } from "react";
import Icon from "./Icon.jsx";
import ProdutoForm from "./ProdutoForm.jsx";
import ScanProdutoSheet from "./ScanProdutoSheet.jsx";
import { api } from "../lib/api.js";
import { useStore } from "../state/store.jsx";

/**
 * "Novo" / "Scan" buttons that register a produto without leaving the current flow
 * (ex: montando a marmita). `onCreated(produto)` gets the saved produto so the
 * caller can select it right away.
 */
export default function NewProdutoActions({ onCreated }) {
  const { refreshProdutos, showToast } = useStore();
  const [form, setForm] = useState(null);         // { prefill } when open
  const [scanning, setScanning] = useState(false);

  async function save(p) {
    const created = await api.produtos.create(p);
    await refreshProdutos();
    showToast(`${created.name} cadastrado`);
    setForm(null);
    onCreated(created);
  }

  return (
    <>
      <div className="flex gap-2">
        <button onClick={() => setForm({})} className="flex-1 h-9 rounded-full bg-emerald-50 text-emerald-700 text-sm font-semibold inline-flex items-center justify-center gap-1.5"><Icon name="plus" className="w-4 h-4"/> Novo produto</button>
        <button onClick={() => setScanning(true)} className="flex-1 h-9 rounded-full bg-slate-900 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5"><Icon name="camera" className="w-4 h-4"/> Scan</button>
      </div>
      {scanning && <ScanProdutoSheet onClose={() => setScanning(false)} onResult={(r) => { setScanning(false); setForm({ prefill: r }); }}/>}
      {form && <ProdutoForm produto={null} prefill={form.prefill} onClose={() => setForm(null)} onSave={save}/>}
    </>
  );
}
