import { useEffect, useState } from "react";
import Icon from "../components/Icon.jsx";
import Sheet from "../components/Sheet.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import ProdutoForm from "../components/ProdutoForm.jsx";
import NumberInput from "../components/NumberInput.jsx";
import { api } from "../lib/api.js";
import { useStore } from "../state/store.jsx";

const SECTIONS = ["Café da manhã", "Almoço", "Lanche", "Jantar"];

export default function DayScreen({ date, onBack }) {
  const { showToast, produtos, comidas, refreshProdutos, refreshComidas } = useStore();
  const [day, setDay] = useState(null);
  const [addingTo, setAddingTo] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [registeringItem, setRegisteringItem] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [newSection, setNewSection] = useState(false);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => { reload(); }, [date]);
  useEffect(() => { if (!produtos.length) refreshProdutos(); if (!comidas.length) refreshComidas(); }, []);

  async function reload() { setDay(await api.meals.day(date)); }

  if (!day) return <div className="p-6 text-slate-400">Carregando…</div>;

  const totals = day.sections.reduce((acc, s) => {
    s.items.forEach(it => { acc.calories += it.calories; acc.protein += it.protein; });
    return acc;
  }, { calories: 0, protein: 0 });
  totals.protein = +totals.protein.toFixed(1);

  async function removeItem(id) { await api.meals.deleteItem(id); reload(); }
  async function removeSection(id) { await api.meals.deleteSection(id); reload(); }

  function askRemoveSection(section) {
    setConfirm({
      title: "Excluir seção?",
      message: section.items.length
        ? `Esta seção contém ${section.items.length} ${section.items.length === 1 ? "item" : "itens"} que também serão removidos.`
        : "A seção será removida do diário.",
      detail: section.name,
      onConfirm: async () => { setConfirm(null); await removeSection(section.id); },
    });
  }
  function askRemoveItem(item) {
    setConfirm({
      title: "Remover item?",
      message: "Este item será removido do diário.",
      detail: `${item.name} · ${item.quantity}${item.comidaId ? "×" : "g"} · ${item.calories} kcal`,
      onConfirm: async () => { setConfirm(null); await removeItem(item.id); },
    });
  }
  async function addSection(name) {
    if (!name.trim()) return;
    await api.meals.addSection(date, name.trim());
    setNewSection(false);
    reload();
  }

  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="shrink-0 bg-white border-b border-slate-200 px-3 pt-[max(env(safe-area-inset-top),12px)] pb-4">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={onBack} className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center"><Icon name="back"/></button>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-emerald-600 font-semibold">Diário</div>
            <h1 className="text-[18px] font-bold text-slate-900 capitalize leading-tight">{dateLabel}</h1>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Calorias" value={totals.calories} unit="kcal" color="orange" icon="flame"/>
          <Stat label="Proteína" value={totals.protein} unit="g"   color="violet" icon="drumstick"/>
          <Stat label="Itens"    value={day.sections.reduce((s, sec) => s + sec.items.length, 0)} unit="" color="emerald" icon="plate"/>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scroll-hide">
        {day.sections.map(section => (
          <div key={section.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-800">{section.name}</div>
                <div className="text-xs text-slate-500">{section.items.reduce((s, i) => s + i.calories, 0)} kcal · {section.items.length} itens</div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setAddingTo(section)} className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center"><Icon name="plus" className="w-4 h-4"/></button>
                <button onClick={() => askRemoveSection(section)} className="w-8 h-8 rounded-full hover:bg-red-50 text-red-500 flex items-center justify-center"><Icon name="trash" className="w-4 h-4"/></button>
              </div>
            </div>
            {section.items.length > 0 && (
              <div className="border-t border-slate-100 divide-y divide-slate-100">
                {section.items.map(it => (
                  <div key={it.id} className="px-2 py-1 flex items-center gap-1">
                    <button onClick={() => setEditingItem(it)} className="flex-1 min-w-0 flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-left">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 ${it.comidaId ? "bg-amber-100" : "bg-emerald-100"}`}>{it.comidaId ? "🍽️" : "🥚"}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-[14px] truncate">{it.name}</div>
                        <div className="text-[11px] text-slate-500">{it.quantity}{it.comidaId ? "×" : "g"} · {it.calories} kcal · {it.protein}g prot</div>
                      </div>
                    </button>
                    <button onClick={() => askRemoveItem(it)} className="w-8 h-8 flex items-center justify-center text-red-500 shrink-0"><Icon name="close" className="w-4 h-4"/></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <button onClick={() => setNewSection(true)} className="w-full bg-white border border-dashed border-slate-300 rounded-2xl py-4 text-slate-500 font-semibold flex items-center justify-center gap-2"><Icon name="plus" className="w-4 h-4"/> Nova seção</button>
      </div>

      <button onClick={() => setChatOpen(true)} className="absolute right-4 bottom-24 w-14 h-14 rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-500/40 flex items-center justify-center"><Icon name="chat" className="w-6 h-6"/></button>

      {addingTo && <AddItemSheet section={addingTo} produtos={produtos} comidas={comidas} onClose={() => setAddingTo(null)} onAdded={() => { setAddingTo(null); showToast(`Adicionado em ${addingTo.name}`); reload(); }} />}
      {editingItem && <AddItemSheet existing={editingItem} produtos={produtos} comidas={comidas} onClose={() => setEditingItem(null)} onAdded={() => { setEditingItem(null); showToast("Item atualizado"); reload(); }} onRegisterProduto={(it) => { setEditingItem(null); setRegisteringItem(it); }} />}
      {registeringItem && (
        <ProdutoForm
          prefill={prefillFromItem(registeringItem)}
          title="Registrar como produto"
          hint="Confirme os dados e salve. Esse produto poderá ser reconhecido em registros futuros."
          onClose={() => setRegisteringItem(null)}
          onSave={async (form) => {
            const created = await api.produtos.create(form);
            await api.meals.updateItem(registeringItem.id, {
              produtoId: created.id,
              comidaId: null,
              name: registeringItem.name,
              quantity: registeringItem.quantity,
              calories: registeringItem.calories,
              protein: registeringItem.protein,
            });
            setRegisteringItem(null);
            showToast(`${created.name} registrado`);
            refreshProdutos();
            reload();
          }}
        />
      )}
      {chatOpen && <DayChatSheet date={date} onClose={() => setChatOpen(false)} onDone={(s) => { showToast(`Adicionado em ${s}`); setChatOpen(false); reload(); }} />}
      {newSection && <PromptSheet title="Nova seção" placeholder="Ex: Ceia" onClose={() => setNewSection(false)} onSubmit={addSection} />}
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        detail={confirm?.detail}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function prefillFromItem(it) {
  const grams = it.quantity > 0 ? it.quantity : 100;
  return {
    name: it.name,
    calories_per_100g: +(it.calories / grams * 100).toFixed(1),
    protein_per_100g:  +(it.protein  / grams * 100).toFixed(2),
    carbs_per_100g:    0,
    fat_per_100g:      0,
    serving_grams:     grams,
    serving_label:     "",
  };
}

function Stat({ label, value, unit, color, icon }) {
  const palette = { orange: "bg-orange-50 text-orange-600", violet: "bg-violet-50 text-violet-600", emerald: "bg-emerald-50 text-emerald-600" }[color];
  return (
    <div className="rounded-xl bg-white border border-slate-200 p-3">
      <div className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${palette} mb-1`}><Icon name={icon} className="w-4 h-4"/></div>
      <div className="text-[11px] text-slate-500 font-medium">{label}</div>
      <div className="font-bold text-slate-900"><span className="text-lg">{value}</span> <span className="text-xs text-slate-400">{unit}</span></div>
    </div>
  );
}

function AddItemSheet({ section, existing, produtos, comidas, onClose, onAdded, onRegisterProduto }) {
  const isEdit = !!existing;
  const isUnregistered = isEdit && !existing.produtoId && !existing.comidaId;
  const initialKind = existing?.produtoId ? "produto" : existing?.comidaId ? "comida" : "produto";
  const [tab, setTab] = useState(initialKind === "comida" ? "comidas" : "produtos");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(
    existing && !isUnregistered
      ? { kind: initialKind, id: existing.produtoId ?? existing.comidaId }
      : null
  );
  const [qty, setQty] = useState(existing?.quantity ?? 100);

  const list = (tab === "produtos" ? produtos : comidas).filter(x => !q || x.name.toLowerCase().includes(q.toLowerCase()));

  async function confirm() {
    let item;
    if (isUnregistered) {
      const oldQty = existing.quantity > 0 ? existing.quantity : 1;
      const scale = qty / oldQty;
      item = { produtoId: null, comidaId: null, name: existing.name, quantity: qty,
               calories: Math.round(existing.calories * scale),
               protein: +(existing.protein * scale).toFixed(1) };
    } else if (picked?.kind === "produto") {
      const p = produtos.find(x => x.id === picked.id);
      item = { produtoId: p.id, comidaId: null, name: p.name, quantity: qty,
               calories: Math.round(p.caloriesPerGram * qty), protein: +(p.proteinPerGram * qty).toFixed(1) };
    } else if (picked?.kind === "comida") {
      const c = comidas.find(x => x.id === picked.id);
      const cal = c.items.reduce((s, it) => {
        const p = produtos.find(x => x.id === it.produtoId);
        return s + (p ? p.caloriesPerGram * it.quantityGrams : 0);
      }, 0);
      const prot = c.items.reduce((s, it) => {
        const p = produtos.find(x => x.id === it.produtoId);
        return s + (p ? p.proteinPerGram * it.quantityGrams : 0);
      }, 0);
      item = { produtoId: null, comidaId: c.id, name: c.name, quantity: qty,
               calories: Math.round(cal * qty), protein: +(prot * qty).toFixed(1) };
    } else return;
    if (isEdit) await api.meals.updateItem(existing.id, item);
    else await api.meals.addItem(section.id, item);
    onAdded();
  }

  const showQtyEditor = isUnregistered || !!picked;
  const qtyUnit = isUnregistered || picked?.kind === "produto" ? "gramas" : "porções";
  const qtyStep = isUnregistered || picked?.kind === "produto" ? 10 : 1;
  const canSave = isUnregistered ? qty > 0 : !!picked;

  return (
    <Sheet onClose={onClose} title={isEdit ? "Editar item" : `Adicionar em ${section.name}`}>
      {isUnregistered && (
        <>
          <div className="mb-3 bg-slate-50 rounded-xl px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Editando</div>
            <div className="font-semibold text-slate-800">{existing.name}</div>
            <div className="text-[11px] text-slate-500">original: {existing.quantity}g · {existing.calories} kcal · {existing.protein}g prot</div>
          </div>
          <button
            onClick={() => onRegisterProduto?.(existing)}
            className="w-full mb-3 flex items-center gap-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl px-3 py-2.5 text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0"><Icon name="plus" className="w-4 h-4"/></div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-emerald-800">Registrar "{existing.name}" como produto</div>
              <div className="text-[11px] text-emerald-700/80">Para que o chat reconheça nas próximas vezes</div>
            </div>
            <Icon name="chevronR" className="w-4 h-4 text-emerald-600"/>
          </button>
        </>
      )}
      {!isUnregistered && (
        <>
          <div className="flex gap-1 bg-slate-100 rounded-full p-1 mb-3">
            {["produtos","comidas"].map(t => (
              <button key={t} onClick={() => { setTab(t); setPicked(null); setQty(t === "produtos" ? 100 : 1); }} className={`flex-1 py-2 rounded-full text-sm font-semibold capitalize ${tab === t ? "bg-white shadow text-slate-900" : "text-slate-500"}`}>{t}</button>
            ))}
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar..." className="w-full mb-3 bg-slate-100 rounded-xl px-4 py-2.5 outline-none"/>
          <div className="max-h-64 overflow-y-auto scroll-hide space-y-1 mb-3">
            {list.map(x => (
              <button key={x.id} onClick={() => setPicked({ kind: tab === "produtos" ? "produto" : "comida", id: x.id })} className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between ${picked?.id === x.id ? "bg-emerald-50 border border-emerald-300" : "hover:bg-slate-50 border border-transparent"}`}>
                <div className="font-semibold text-slate-800 text-sm">{x.name}</div>
                {picked?.id === x.id && <Icon name="check" className="w-5 h-5 text-emerald-600"/>}
              </button>
            ))}
          </div>
        </>
      )}
      {showQtyEditor && (
        <div className="bg-slate-50 rounded-xl p-3 mb-3">
          <div className="text-xs text-slate-500 mb-1">Quantidade ({qtyUnit})</div>
          <div className="flex items-center gap-2">
            <button onClick={() => setQty(v => Math.max(1, (v ?? 0) - qtyStep))} className="w-9 h-9 rounded-full bg-white border border-slate-200 font-bold">−</button>
            <NumberInput value={qty} onChange={v => setQty(v ?? 0)} className="flex-1 text-center bg-white rounded-lg py-2 border border-slate-200 font-bold text-lg"/>
            <button onClick={() => setQty(v => (v ?? 0) + qtyStep)} className="w-9 h-9 rounded-full bg-white border border-slate-200 font-bold">+</button>
          </div>
        </div>
      )}
      <button disabled={!canSave} onClick={confirm} className="w-full bg-emerald-500 disabled:bg-slate-200 text-white font-semibold py-3 rounded-full">{isEdit ? "Salvar" : "Adicionar"}</button>
    </Sheet>
  );
}

function DayChatSheet({ date, onClose, onDone }) {
  const [input, setInput] = useState("");
  const [section, setSection] = useState("Café da manhã");
  const [busy, setBusy] = useState(false);

  async function go() {
    if (!input.trim()) return;
    setBusy(true);
    try {
      await api.chat(input, date, section);
      onDone(section);
    } finally { setBusy(false); }
  }

  return (
    <Sheet onClose={onClose} title={`Registrar em ${new Date(date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`}>
      <div className="flex gap-1 overflow-x-auto scroll-hide mb-3 -mx-1 px-1">
        {SECTIONS.map(s => (
          <button key={s} onClick={() => setSection(s)} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${section === s ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600"}`}>{s}</button>
        ))}
      </div>
      <textarea value={input} onChange={e => setInput(e.target.value)} placeholder="ex: 2 ovos e aquele sanduíche" rows={3} className="w-full bg-slate-100 rounded-xl px-4 py-3 outline-none resize-none"/>
      <button disabled={busy || !input.trim()} onClick={go} className="w-full mt-2 bg-slate-900 disabled:opacity-50 text-white font-semibold py-2.5 rounded-full flex items-center justify-center gap-2">
        <Icon name="sparkles" className="w-4 h-4"/> {busy ? "Analisando…" : "Analisar e salvar"}
      </button>
    </Sheet>
  );
}

function PromptSheet({ title, placeholder, onClose, onSubmit }) {
  const [v, setV] = useState("");
  return (
    <Sheet onClose={onClose} title={title}>
      <input autoFocus value={v} onChange={e => setV(e.target.value)} placeholder={placeholder} className="w-full bg-slate-100 rounded-xl px-4 py-3 outline-none mb-3"/>
      <button onClick={() => onSubmit(v)} disabled={!v.trim()} className="w-full bg-emerald-500 disabled:bg-slate-200 text-white font-semibold py-3 rounded-full">Criar</button>
    </Sheet>
  );
}
