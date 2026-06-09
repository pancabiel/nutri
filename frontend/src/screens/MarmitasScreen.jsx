import { useEffect, useState } from "react";
import Icon from "../components/Icon.jsx";
import Sheet from "../components/Sheet.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import NumberInput from "../components/NumberInput.jsx";
import SaveButton from "../components/SaveButton.jsx";
import { api, CapError } from "../lib/api.js";
import { useStore } from "../state/store.jsx";
import { snapshotItem, groupPerGram, comingWeekDates } from "../lib/macros.js";

const SECTIONS = ["Café da manhã", "Almoço", "Lanche", "Jantar"];
// Label + JS getDay() number (Sun=0..Sat=6).
const WEEKDAYS = [["Seg", 1], ["Ter", 2], ["Qua", 3], ["Qui", 4], ["Sex", 5], ["Sáb", 6], ["Dom", 0]];

export default function MarmitasScreen() {
  const { produtos, comidas, refreshProdutos, refreshComidas, showToast } = useStore();
  const [templates, setTemplates] = useState([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [applying, setApplying] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [parsing, setParsing] = useState(false);

  useEffect(() => {
    refresh();
    if (!produtos.length) refreshProdutos();
    if (!comidas.length) refreshComidas();
  }, []);

  async function refresh() { setTemplates(await api.mealTemplates.list()); }

  const list = templates.filter(t => !q || t.name.toLowerCase().includes(q.toLowerCase()));

  const macros = (t) => {
    let cal = 0, prot = 0;
    for (const ti of t.items || []) {
      const s = snapshotItem(ti, produtos, comidas);
      if (s) { cal += s.calories; prot += s.protein; }
    }
    return { cal: Math.round(cal), prot: +prot.toFixed(1) };
  };

  async function save(t) {
    if (t.id) await api.mealTemplates.update(t.id, t); else await api.mealTemplates.create(t);
    showToast(t.id ? "Marmita atualizada" : "Marmita criada");
    setEditing(null);
    refresh();
  }
  async function remove(id) {
    try {
      await api.mealTemplates.remove(id);
      showToast("Marmita removida");
      refresh();
    } catch (e) {
      showToast(e?.message || "Não foi possível remover a marmita.", "error");
    }
  }
  function askRemove(t) {
    setConfirm({
      detail: `${t.name} · ${t.items.length} ${t.items.length === 1 ? "item" : "itens"}`,
      onConfirm: async () => { setConfirm(null); await remove(t.id); },
    });
  }

  // The parse endpoint may have auto-created produtos for unmatched ingredients;
  // refresh the list so MarmitaForm can resolve their macros, then open the editor
  // for review before the user saves.
  async function openDraft(draft) {
    setParsing(false);
    await refreshProdutos();
    if (draft.newProdutos > 0) {
      showToast(`${draft.newProdutos} ${draft.newProdutos === 1 ? "produto novo cadastrado" : "produtos novos cadastrados"}`);
    }
    setEditing({ name: draft.name ?? "", items: draft.items ?? [] });
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="shrink-0 px-5 pt-[max(env(safe-area-inset-top),20px)] pb-3 bg-white border-b border-slate-200">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-[22px] font-bold text-slate-900">Marmitas</h1>
            <p className="text-sm text-slate-500">Monte uma vez, jogue na semana toda</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setParsing(true)} className="h-10 px-3 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center gap-1.5 text-sm font-semibold"><Icon name="sparkles" className="w-4 h-4"/> Texto</button>
            <button onClick={() => setEditing("new")} className="h-10 w-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow"><Icon name="plus"/></button>
          </div>
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar marmita" className="w-full bg-slate-100 rounded-xl px-4 py-2.5 outline-none"/>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 scroll-hide">
        {list.length === 0 && (
          <div className="text-sm text-slate-400 py-10 text-center">
            Nenhuma marmita ainda.<br/>Toque em + para montar a partir das suas comidas e produtos.
          </div>
        )}
        {list.map(t => {
          const m = macros(t);
          return (
            <div key={t.id} className="bg-white rounded-2xl border border-slate-200 p-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center text-lg shrink-0">🍱</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 truncate">{t.name}</div>
                  <div className="text-[11px] text-slate-500">{t.items.length} {t.items.length === 1 ? "item" : "itens"} · {m.cal} kcal · {m.prot}g prot</div>
                </div>
                <button onClick={() => setEditing(t)} className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 flex items-center justify-center"><Icon name="edit" className="w-4 h-4"/></button>
                <button onClick={() => askRemove(t)} className="w-8 h-8 rounded-full hover:bg-red-50 text-red-500 flex items-center justify-center"><Icon name="trash" className="w-4 h-4"/></button>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {t.items.map((ti, i) => {
                  const name = ti.groupName || (ti.produtoId ? produtos.find(x => x.id === ti.produtoId)?.name : comidas.find(x => x.id === ti.comidaId)?.name);
                  if (!name) return null;
                  return <span key={i} className="text-[11px] bg-slate-100 rounded-full px-2 py-0.5 text-slate-600">{name} · {ti.quantity}{ti.unit === "g" ? "g" : "×"}</span>;
                })}
              </div>
              <button onClick={() => setApplying(t)} className="w-full mt-3 bg-slate-900 text-white text-sm font-semibold py-2.5 rounded-full inline-flex items-center justify-center gap-2">
                <Icon name="calendar" className="w-4 h-4"/> Aplicar na semana
              </button>
            </div>
          );
        })}
      </div>
      {parsing && <ParseSheet onClose={() => setParsing(false)} onDraft={openDraft}/>}
      {editing && <MarmitaForm template={editing === "new" ? null : editing} produtos={produtos} comidas={comidas} onClose={() => setEditing(null)} onSave={save}/>}
      {applying && <ApplyWeekSheet template={applying} produtos={produtos} comidas={comidas} onClose={() => setApplying(null)} onDone={(r) => { setApplying(null); showToast(`Adicionado em ${r.inserted} ${r.inserted === 1 ? "registro" : "registros"} (${r.days} dias)`); }}/>}
      <ConfirmDialog
        open={!!confirm}
        title="Excluir marmita?"
        message="Este modelo será removido. Os registros já aplicados nos dias permanecem."
        detail={confirm?.detail}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function MarmitaForm({ template, produtos, comidas, onClose, onSave }) {
  const [name, setName] = useState(template?.name ?? "");
  const [items, setItems] = useState(template?.items ?? []);
  const [picker, setPicker] = useState(false);
  const [groupEdit, setGroupEdit] = useState(null);   // { index, item } | { index: null } for new

  let totalCal = 0, totalProt = 0;
  for (const ti of items) {
    const s = snapshotItem(ti, produtos, comidas);
    if (s) { totalCal += s.calories; totalProt += s.protein; }
  }

  function describe(ti) {
    const ref = ti.groupName ? null : (ti.produtoId ? produtos.find(x => x.id === ti.produtoId) : comidas.find(x => x.id === ti.comidaId));
    const s = snapshotItem(ti, produtos, comidas);
    return { name: ti.groupName || ref?.name || "—", kcal: s ? s.calories : 0, isGroup: !!ti.groupName };
  }

  function saveGroup(item) {
    setItems(prev => groupEdit?.index != null
      ? prev.map((x, xi) => xi === groupEdit.index ? item : x)
      : [...prev, item]);
    setGroupEdit(null);
  }

  return (
    <Sheet onClose={onClose} title={template ? "Editar marmita" : "Nova marmita"} fullScreen>
      <label className="block">
        <div className="text-xs text-slate-500 font-medium mb-1">Nome</div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Marmita frango + macarrão" className="w-full bg-slate-100 rounded-lg px-3 py-2 outline-none"/>
      </label>
      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Itens</div>
        <div className="flex items-center gap-3">
          <button onClick={() => setGroupEdit({ index: null })} className="text-xs font-semibold text-amber-600 inline-flex items-center gap-1"><Icon name="plus" className="w-3 h-3"/> grupo</button>
          <button onClick={() => setPicker(true)} className="text-xs font-semibold text-emerald-600 inline-flex items-center gap-1"><Icon name="plus" className="w-3 h-3"/> item</button>
        </div>
      </div>
      <div className="mt-2 space-y-1">
        {items.length === 0 && <div className="text-sm text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-xl">Toque em + item (produto/comida) ou + grupo (ex: molho branco).</div>}
        {items.map((ti, i) => {
          const d = describe(ti);
          return (
            <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
              {d.isGroup && <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center text-sm shrink-0">🥣</div>}
              <button onClick={() => d.isGroup && setGroupEdit({ index: i, item: ti })} className="flex-1 min-w-0 text-left">
                <div className="font-semibold text-sm text-slate-800 truncate">{d.name}{d.isGroup && <span className="text-amber-500 font-normal text-[11px]"> · editar</span>}</div>
                <div className="text-[11px] text-slate-500">{d.kcal} kcal{d.isGroup ? ` · ${ti.group?.length || 0} ingredientes` : ""}</div>
              </button>
              <NumberInput value={ti.quantity} onChange={v => { const n = v ?? 0; setItems(prev => prev.map((x, xi) => xi === i ? { ...x, quantity: n } : x)); }} className="w-20 bg-white rounded-lg px-2 py-1 border border-slate-200 text-sm text-right"/>
              <span className="text-xs text-slate-400 w-4">{ti.unit === "g" ? "g" : "×"}</span>
              <button onClick={() => setItems(prev => prev.filter((_, xi) => xi !== i))} className="text-red-500"><Icon name="close" className="w-4 h-4"/></button>
            </div>
          );
        })}
      </div>
      {items.length > 0 && (
        <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-center justify-between text-sm">
          <span className="text-emerald-700 font-semibold">Total por marmita</span>
          <span className="font-bold text-emerald-900">{Math.round(totalCal)} kcal · {totalProt.toFixed(1)}g</span>
        </div>
      )}
      <SaveButton onClick={() => onSave({ ...(template ?? {}), name, items })} disabled={!name.trim() || items.length === 0} className="w-full mt-5 bg-emerald-500 disabled:bg-slate-200 text-white font-semibold py-3 rounded-full">Salvar</SaveButton>

      {picker && <ItemPicker produtos={produtos} comidas={comidas} onClose={() => setPicker(false)} onPick={(it) => { setItems(prev => [...prev, it]); setPicker(false); }}/>}
      {groupEdit && <GroupEditor item={groupEdit.item} produtos={produtos} onClose={() => setGroupEdit(null)} onSave={saveGroup}/>}
    </Sheet>
  );
}

// Inline "grupo" (sub-receita que vive só nesta marmita, ex: molho branco): N produtos
// com as gramas do lote + rendimento estimado (você edita, porque cozinhar reduz o peso)
// + quanto vai por marmita. Macro = soma dos produtos ÷ rendimento × gramas servidas.
function GroupEditor({ item, produtos, onClose, onSave }) {
  const [name, setName] = useState(item?.groupName ?? "");
  const [batch, setBatch] = useState(item?.group ?? []);                 // [{produtoId, grams}]
  const [yieldGrams, setYieldGrams] = useState(item?.groupYieldGrams ?? null);
  const [served, setServed] = useState(item?.quantity ?? 80);
  const [picker, setPicker] = useState(false);

  const sumG = batch.reduce((a, b) => a + (b.grams || 0), 0);
  const pg = groupPerGram(batch, yieldGrams, produtos);
  const servedCal = pg ? Math.round(pg.cal * served) : 0;
  const servedProt = pg ? +(pg.prot * served).toFixed(1) : 0;

  function save() {
    onSave({
      produtoId: null, comidaId: null, quantity: served > 0 ? served : 0, unit: "g",
      groupName: name.trim(), groupYieldGrams: yieldGrams > 0 ? yieldGrams : null, group: batch,
    });
  }

  return (
    <Sheet onClose={onClose} title={item ? "Editar grupo" : "Novo grupo"} fullScreen>
      <p className="text-sm text-slate-500 mb-3">Um preparo desta marmita (ex: molho branco). Não vira uma comida salva.</p>
      <label className="block">
        <div className="text-xs text-slate-500 font-medium mb-1">Nome do grupo</div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Molho branco" className="w-full bg-slate-100 rounded-lg px-3 py-2 outline-none"/>
      </label>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Ingredientes do lote</div>
        <button onClick={() => setPicker(true)} className="text-xs font-semibold text-emerald-600 inline-flex items-center gap-1"><Icon name="plus" className="w-3 h-3"/> produto</button>
      </div>
      <div className="mt-2 space-y-1">
        {batch.length === 0 && <div className="text-sm text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-xl">Adicione os produtos que entraram no preparo.</div>}
        {batch.map((b, i) => {
          const p = produtos.find(x => x.id === b.produtoId);
          if (!p) return null;
          return (
            <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-slate-800 truncate">{p.name}</div>
                <div className="text-[11px] text-slate-500">{Math.round(p.caloriesPerGram * b.grams)} kcal</div>
              </div>
              <NumberInput value={b.grams} onChange={v => { const n = v ?? 0; setBatch(prev => prev.map((x, xi) => xi === i ? { ...x, grams: n } : x)); }} className="w-20 bg-white rounded-lg px-2 py-1 border border-slate-200 text-sm text-right"/>
              <span className="text-xs text-slate-400">g</span>
              <button onClick={() => setBatch(prev => prev.filter((_, xi) => xi !== i))} className="text-red-500"><Icon name="close" className="w-4 h-4"/></button>
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">Rendimento (peso pronto)</div>
        <div className="flex items-center gap-2">
          <NumberInput value={yieldGrams} onChange={v => setYieldGrams(v)} placeholder={sumG > 0 ? `soma = ${Math.round(sumG)}` : "ex: 800"} className="flex-1 bg-slate-100 rounded-lg px-3 py-2 outline-none"/>
          <span className="text-sm text-slate-500">gramas</span>
        </div>
        <div className="text-[11px] text-slate-500 mt-1">Quanto o preparo pesou pronto. Cozinhar reduz o peso — ajuste se for menor que a soma dos ingredientes.</div>
      </div>

      <div className="mt-4">
        <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">Quanto vai nesta marmita</div>
        <div className="flex items-center gap-2">
          <NumberInput value={served} onChange={v => setServed(v ?? 0)} placeholder="ex: 80" className="flex-1 bg-slate-100 rounded-lg px-3 py-2 outline-none"/>
          <span className="text-sm text-slate-500">gramas</span>
        </div>
      </div>

      <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-sm">
        {pg
          ? <div className="flex items-center justify-between"><span className="text-amber-700 font-semibold">{Math.round(served)}g deste grupo</span><span className="font-bold text-amber-900">{servedCal} kcal · {servedProt}g prot</span></div>
          : <span className="text-amber-700">Adicione ingredientes e o rendimento para calcular.</span>}
      </div>

      <button onClick={save} disabled={!name.trim() || batch.length === 0 || !(served > 0)} className="w-full mt-5 bg-emerald-500 disabled:bg-slate-200 text-white font-semibold py-3 rounded-full">Salvar grupo</button>

      {picker && <GroupProdutoPicker produtos={produtos} onClose={() => setPicker(false)} onPick={(id, g) => { setBatch(prev => [...prev, { produtoId: id, grams: g }]); setPicker(false); }}/>}
    </Sheet>
  );
}

function GroupProdutoPicker({ produtos, onClose, onPick }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(null);
  const [g, setG] = useState(100);
  const list = produtos.filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Sheet onClose={onClose} title="Escolher produto" fullScreen>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar..." className="w-full bg-slate-100 rounded-xl px-4 py-2.5 outline-none mb-3"/>
      <div className="max-h-60 overflow-y-auto scroll-hide space-y-1 mb-3">
        {list.map(p => (
          <button key={p.id} onClick={() => setPicked(p)} className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between ${picked?.id === p.id ? "bg-emerald-50 border border-emerald-300" : "hover:bg-slate-50 border border-transparent"}`}>
            <div className="font-semibold text-slate-800 text-sm">{p.name}</div>
            {picked?.id === p.id && <Icon name="check" className="w-4 h-4 text-emerald-600"/>}
          </button>
        ))}
        {list.length === 0 && <div className="text-center text-slate-400 py-6 text-sm">Cadastre o produto na aba Produtos primeiro.</div>}
      </div>
      {picked && (
        <div className="flex items-center gap-2 mb-3">
          <NumberInput value={g} onChange={v => setG(v ?? 0)} className="flex-1 bg-slate-100 rounded-lg px-3 py-2 outline-none"/>
          <span className="text-sm text-slate-500">gramas no lote</span>
        </div>
      )}
      <button disabled={!picked || !g} onClick={() => onPick(picked.id, g)} className="w-full bg-emerald-500 disabled:bg-slate-200 text-white font-semibold py-3 rounded-full">Adicionar</button>
    </Sheet>
  );
}

function ItemPicker({ produtos, comidas, onClose, onPick }) {
  const [tab, setTab] = useState("comidas");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(null);          // produto or comida object
  const [unit, setUnit] = useState("g");
  const [qty, setQty] = useState(130);

  const isComida = tab === "comidas";
  const list = (isComida ? comidas : produtos).filter(x => !q || x.name.toLowerCase().includes(q.toLowerCase()));
  const canGram = !isComida || (picked && picked.yieldGrams > 0);
  const effUnit = canGram ? unit : "porcao";

  function choose(x) {
    setPicked(x);
    if (isComida && !(x.yieldGrams > 0)) { setUnit("porcao"); setQty(1); }
    else { setUnit("g"); setQty(isComida ? 130 : 100); }
  }

  function add() {
    if (!picked) return;
    onPick(isComida
      ? { produtoId: null, comidaId: picked.id, quantity: qty, unit: effUnit }
      : { produtoId: picked.id, comidaId: null, quantity: qty, unit: "g" });
  }

  return (
    <Sheet onClose={onClose} title="Adicionar item" fullScreen>
      <div className="flex gap-1 bg-slate-100 rounded-full p-1 mb-3">
        {["comidas", "produtos"].map(t => (
          <button key={t} onClick={() => { setTab(t); setPicked(null); }} className={`flex-1 py-2 rounded-full text-sm font-semibold capitalize ${tab === t ? "bg-white shadow text-slate-900" : "text-slate-500"}`}>{t}</button>
        ))}
      </div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar..." className="w-full bg-slate-100 rounded-xl px-4 py-2.5 outline-none mb-3"/>
      <div className="max-h-60 overflow-y-auto scroll-hide space-y-1 mb-3">
        {list.map(x => (
          <button key={x.id} onClick={() => choose(x)} className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between ${picked?.id === x.id ? "bg-emerald-50 border border-emerald-300" : "hover:bg-slate-50 border border-transparent"}`}>
            <div className="font-semibold text-slate-800 text-sm">{x.name}{isComida && x.yieldGrams > 0 ? <span className="text-amber-500 font-normal"> · rende {Math.round(x.yieldGrams)}g</span> : null}</div>
            {picked?.id === x.id && <Icon name="check" className="w-4 h-4 text-emerald-600"/>}
          </button>
        ))}
      </div>
      {picked && (
        <>
          {isComida && picked.yieldGrams > 0 && (
            <div className="flex gap-1 bg-slate-100 rounded-full p-1 mb-3">
              {[["porcao", "porções"], ["g", "gramas"]].map(([u, label]) => (
                <button key={u} onClick={() => { setUnit(u); setQty(u === "g" ? 130 : 1); }} className={`flex-1 py-2 rounded-full text-sm font-semibold ${unit === u ? "bg-white shadow text-slate-900" : "text-slate-500"}`}>{label}</button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 mb-3">
            <NumberInput value={qty} onChange={v => setQty(v ?? 0)} className="flex-1 bg-slate-100 rounded-lg px-3 py-2 outline-none"/>
            <span className="text-sm text-slate-500">{effUnit === "g" ? "gramas" : "porções"}</span>
          </div>
        </>
      )}
      <button disabled={!picked || !qty} onClick={add} className="w-full bg-emerald-500 disabled:bg-slate-200 text-white font-semibold py-3 rounded-full">Adicionar</button>
    </Sheet>
  );
}

function ApplyWeekSheet({ template, produtos, comidas, onClose, onDone }) {
  const [section, setSection] = useState("Almoço");
  const [days, setDays] = useState(() => new Set([1, 2, 3, 4, 5]));   // seg–sex
  const [busy, setBusy] = useState(false);

  const dates = comingWeekDates(days);

  function toggle(n) {
    setDays(prev => { const s = new Set(prev); s.has(n) ? s.delete(n) : s.add(n); return s; });
  }

  async function apply() {
    const items = (template.items || []).map(ti => snapshotItem(ti, produtos, comidas)).filter(Boolean);
    if (!items.length || !dates.length) return;
    setBusy(true);
    try {
      const r = await api.meals.batch({ section, dates, items });
      onDone(r ?? { inserted: items.length * dates.length, days: dates.length });
    } finally { setBusy(false); }
  }

  return (
    <Sheet onClose={onClose} title={`Aplicar "${template.name}"`}>
      <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">Dias (próximos 7)</div>
      <div className="flex gap-1 mb-4">
        {WEEKDAYS.map(([label, n]) => (
          <button key={n} onClick={() => toggle(n)} className={`flex-1 py-2 rounded-lg text-xs font-semibold ${days.has(n) ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"}`}>{label}</button>
        ))}
      </div>

      <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">Refeição</div>
      <div className="flex gap-1 overflow-x-auto scroll-hide mb-4 -mx-1 px-1">
        {SECTIONS.map(s => (
          <button key={s} onClick={() => setSection(s)} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${section === s ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600"}`}>{s}</button>
        ))}
      </div>

      <div className="bg-slate-50 rounded-xl px-3 py-2.5 mb-4 text-sm text-slate-600">
        {dates.length === 0
          ? "Selecione ao menos um dia."
          : <>Vai adicionar <span className="font-semibold text-slate-900">{template.items.length} {template.items.length === 1 ? "item" : "itens"}</span> em <span className="font-semibold text-slate-900">{dates.length} {dates.length === 1 ? "dia" : "dias"}</span> ({dates.map(d => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })).join(", ")}).</>}
      </div>

      <button disabled={busy || !dates.length} onClick={apply} className="w-full bg-slate-900 disabled:opacity-50 text-white font-semibold py-3 rounded-full inline-flex items-center justify-center gap-2">
        <Icon name="check" className="w-4 h-4"/> {busy ? "Aplicando…" : "Aplicar"}
      </button>
    </Sheet>
  );
}

// Chat-style entry: describe the marmita in free text; the backend matches against
// the user's produtos/comidas (and auto-creates produtos for the rest), then hands
// back a draft we open in MarmitaForm for review.
function ParseSheet({ onClose, onDraft }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true); setErr(null);
    try {
      const draft = await api.mealTemplates.parse(text.trim());
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
    <Sheet onClose={onClose} title="Marmita por texto" fullScreen>
      <p className="text-sm text-slate-500 mb-3">
        Descreva como você monta a marmita e os ingredientes. O Nutri usa o que você já tem cadastrado e estima o resto.
      </p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={6}
        placeholder="Ex: 150g de arroz, 130g do molho de carne, 100g de frango grelhado e um pouco de brócolis"
        className="w-full bg-slate-100 rounded-xl px-4 py-3 outline-none resize-none"
      />
      {err && <div className="mt-3 text-sm text-red-500">{err}</div>}
      <button
        disabled={!text.trim() || busy}
        onClick={submit}
        className="w-full mt-4 bg-emerald-500 disabled:bg-slate-200 text-white font-semibold py-3 rounded-full inline-flex items-center justify-center gap-2"
      >
        <Icon name="sparkles" className="w-4 h-4"/> {busy ? "Interpretando…" : "Montar marmita"}
      </button>
    </Sheet>
  );
}
