import { useState } from "react";
import Icon from "./Icon.jsx";
import Sheet from "./Sheet.jsx";
import NumberInput from "./NumberInput.jsx";
import SaveButton from "./SaveButton.jsx";
import ProdutoThumb from "./ProdutoThumb.jsx";
import ProdutoOption from "./ProdutoOption.jsx";
import NewProdutoActions from "./NewProdutoActions.jsx";
import { api, CapError } from "../lib/api.js";
import { comidaTotals } from "../lib/macros.js";

export default function ComidaForm({ comida, produtos, onClose, onSave }) {
  const [name, setName] = useState(comida?.name ?? "");
  const [items, setItems] = useState(comida?.items ?? []);
  const [yieldGrams, setYieldGrams] = useState(comida?.yieldGrams ?? null);
  const [picker, setPicker] = useState(false);

  const t = comidaTotals({ items }, produtos);
  const totalCal = Math.round(t.cal);
  const totalProt = +t.prot.toFixed(1);
  const perGram = yieldGrams > 0 ? { cal: t.cal / yieldGrams, prot: t.prot / yieldGrams } : null;

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
              <ProdutoThumb key={p.coverUrl || "none"} url={p.coverUrl} size="sm"/>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-slate-800 truncate">{p.name}</div>
                <div className="text-[11px] text-slate-500 truncate">{p.brand ? `${p.brand} · ` : ""}{Math.round(p.caloriesPerGram * it.quantityGrams)} kcal</div>
              </div>
              <NumberInput value={it.quantityGrams} onChange={v => { const n = v ?? 0; setItems(prev => prev.map((x, xi) => xi === i ? { ...x, quantityGrams: n } : x)); }} className="w-20 bg-white rounded-lg px-2 py-1 border border-slate-200 text-sm text-right"/>
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

      <div className="mt-4">
        <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">Rendimento (peso pronto)</div>
        <div className="flex items-center gap-2">
          <NumberInput value={yieldGrams} onChange={v => setYieldGrams(v)} placeholder="ex: 1600" className="flex-1 bg-slate-100 rounded-lg px-3 py-2 outline-none"/>
          <span className="text-sm text-slate-500">gramas</span>
        </div>
        <div className="text-[11px] text-slate-500 mt-1">
          {perGram
            ? <>Permite registrar por grama: <span className="font-semibold text-amber-600">{Math.round(perGram.cal * 100)} kcal · {(perGram.prot * 100).toFixed(1)}g prot / 100g</span></>
            : "Opcional. Quanto pesou o prato pronto — habilita porcionar por grama (ex: 130g desta comida)."}
        </div>
      </div>

      <SaveButton onClick={() => onSave({ ...(comida ?? {}), name, items, yieldGrams: yieldGrams > 0 ? yieldGrams : null })} disabled={!name.trim() || items.length === 0} className="w-full mt-5 bg-emerald-500 disabled:bg-slate-200 text-white font-semibold py-3 rounded-full">Salvar</SaveButton>

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
      <div className="mb-3"><NewProdutoActions onCreated={(p) => { setQ(""); setPicked(p); }}/></div>
      <div className="max-h-[45vh] overflow-y-auto scroll-hide space-y-1 mb-3">
        {list.map(p => <ProdutoOption key={p.id} p={p} selected={picked?.id === p.id} onClick={() => setPicked(p)}/>)}
        {list.length === 0 && <div className="text-center text-slate-400 py-6 text-sm">Nenhum produto. Cadastre acima.</div>}
      </div>
      {picked && (
        <div className="flex items-center gap-2 mb-3">
          <NumberInput value={g} onChange={v => setG(v ?? 0)} className="flex-1 bg-slate-100 rounded-lg px-3 py-2 outline-none"/>
          <span className="text-sm text-slate-500">gramas</span>
        </div>
      )}
      <button disabled={!picked || !g} onClick={() => onPick(picked.id, g)} className="w-full bg-emerald-500 disabled:bg-slate-200 text-white font-semibold py-3 rounded-full">Adicionar</button>
    </Sheet>
  );
}

// Chat-style entry: describe the recipe in free text; the backend matches against the
// user's produtos (and auto-creates produtos for the rest), defaults the yield to the
// sum of ingredient grams, then hands back a draft we open in ComidaForm for review.
export function ComidaParseSheet({ onClose, onDraft }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true); setErr(null);
    try {
      const draft = await api.comidas.parse(text.trim());
      if (!draft?.items?.length) {
        setErr("Não consegui identificar ingredientes. Tente detalhar um pouco mais.");
        setBusy(false);
        return;
      }
      onDraft(draft);
    } catch (e) {
      if (e instanceof CapError) { onClose(); return; }   // global upgrade modal handles 402
      setErr("Algo deu errado ao interpretar. Tente de novo.");
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose} title="Comida por texto" fullScreen>
      <p className="text-sm text-slate-500 mb-3">
        Descreva a receita e os ingredientes que você cozinhou. O Nutri usa o que você já tem cadastrado, estima o resto e calcula o rendimento.
      </p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={6}
        placeholder="Ex: molho de carne: 1kg de carne moída, 1 lata de passata, 1 caixa de creme de leite. Rendeu 1,4kg"
        className="w-full bg-slate-100 rounded-xl px-4 py-3 outline-none resize-none"
      />
      {err && <div className="mt-3 text-sm text-red-500">{err}</div>}
      <button
        disabled={!text.trim() || busy}
        onClick={submit}
        className="w-full mt-4 bg-emerald-500 disabled:bg-slate-200 text-white font-semibold py-3 rounded-full inline-flex items-center justify-center gap-2"
      >
        <Icon name="sparkles" className="w-4 h-4"/> {busy ? "Interpretando…" : "Criar comida"}
      </button>
    </Sheet>
  );
}
