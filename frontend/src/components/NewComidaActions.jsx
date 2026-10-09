import { useState } from "react";
import Icon from "./Icon.jsx";
import ComidaForm, { ComidaParseSheet } from "./ComidaForm.jsx";
import { api } from "../lib/api.js";
import { useStore } from "../state/store.jsx";

/**
 * "Nova comida" / "Texto" buttons that register a comida without leaving the current
 * flow (ex: montando a marmita). `onCreated(comida)` gets the saved comida so the
 * caller can select it right away.
 */
export default function NewComidaActions({ onCreated }) {
  const { produtos, refreshProdutos, refreshComidas, showToast } = useStore();
  const [form, setForm] = useState(null);         // { draft? } when open
  const [parsing, setParsing] = useState(false);

  async function save(c) {
    const created = await api.comidas.create(c);
    await refreshComidas();
    showToast(`${created.name} cadastrada`);
    setForm(null);
    onCreated(created);
  }

  // Parse may auto-create produtos for unmatched ingredients; refresh so the form resolves their macros.
  async function openDraft(draft) {
    setParsing(false);
    await refreshProdutos();
    if (draft.newProdutos > 0) {
      showToast(`${draft.newProdutos} ${draft.newProdutos === 1 ? "produto novo cadastrado" : "produtos novos cadastrados"}`);
    }
    setForm({ draft: { name: draft.name ?? "", items: draft.items ?? [], yieldGrams: draft.yieldGrams ?? null } });
  }

  return (
    <>
      <div className="flex gap-2">
        <button onClick={() => setForm({})} className="flex-1 h-9 rounded-full bg-emerald-50 text-emerald-700 text-sm font-semibold inline-flex items-center justify-center gap-1.5"><Icon name="plus" className="w-4 h-4"/> Nova comida</button>
        <button onClick={() => setParsing(true)} className="flex-1 h-9 rounded-full bg-amber-100 text-amber-700 text-sm font-semibold inline-flex items-center justify-center gap-1.5"><Icon name="sparkles" className="w-4 h-4"/> Texto</button>
      </div>
      {parsing && <ComidaParseSheet onClose={() => setParsing(false)} onDraft={openDraft}/>}
      {form && <ComidaForm comida={form.draft ?? null} produtos={produtos} onClose={() => setForm(null)} onSave={save}/>}
    </>
  );
}
