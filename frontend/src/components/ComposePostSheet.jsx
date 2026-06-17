import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import Sheet from "./Sheet.jsx";
import SaveButton from "./SaveButton.jsx";
import { SkeletonRows } from "./Skeleton.jsx";
import { api } from "../lib/api.js";
import { uploadImage } from "../lib/storage.js";
import { useStore } from "../state/store.jsx";

const REF_TYPES = [
  { key: "produto", label: "Produto", icon: "box" },
  { key: "comida",  label: "Receita", icon: "plate" },
  { key: "marmita", label: "Marmita", icon: "layers" },
  { key: "prato",   label: "Prato",   icon: "drumstick" },
];

/** Compose a new feed post: optional photo, caption, and an optional attached recipe. */
export default function ComposePostSheet({ onClose, onCreated }) {
  const { produtos, comidas, showToast } = useStore();
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [ref, setRef] = useState(null);     // { type, id, name }
  const [attachType, setAttachType] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function choosePhoto() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      setFile(f);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(f));
    };
    input.click();
  }

  const canPost = !busy && (caption.trim() || file || ref);

  async function submit() {
    setBusy(true);
    try {
      let imageUrl = null;
      if (file) imageUrl = await uploadImage("posts", file);
      const created = await api.feed.create({
        caption: caption.trim() || null,
        imageUrl,
        refType: ref?.type || null,
        refId: ref?.id || null,
      });
      onCreated?.(created);
    } catch (e) {
      showToast(e.message || "Não foi possível publicar", "error");
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose} title="Novo post">
      <button onClick={choosePhoto} className="w-full mb-3 rounded-xl border border-dashed border-slate-300 overflow-hidden">
        {preview ? (
          <img src={preview} alt="" className="w-full max-h-60 object-cover" />
        ) : (
          <div className="py-8 flex flex-col items-center gap-1 text-slate-400">
            <Icon name="camera" className="w-6 h-6" />
            <span className="text-sm font-medium">Adicionar foto</span>
          </div>
        )}
      </button>

      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Escreva uma legenda…"
        rows={3}
        className="w-full bg-slate-100 rounded-xl px-4 py-3 outline-none resize-none mb-3"
      />

      {ref ? (
        <div className="mb-3 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
          <Icon name={REF_TYPES.find((t) => t.key === ref.type)?.icon || "plate"} className="w-4 h-4 text-emerald-600" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-emerald-600 font-semibold">{REF_TYPES.find((t) => t.key === ref.type)?.label}</div>
            <div className="text-sm font-semibold text-emerald-800 truncate">{ref.name}</div>
          </div>
          <button onClick={() => setRef(null)} className="w-7 h-7 rounded-full bg-white flex items-center justify-center"><Icon name="close" className="w-4 h-4" /></button>
        </div>
      ) : (
        <div className="mb-3">
          <div className="text-xs text-slate-500 mb-1.5">Anexar receita (opcional)</div>
          <div className="grid grid-cols-4 gap-1.5">
            {REF_TYPES.map((t) => (
              <button key={t.key} onClick={() => setAttachType(t.key)} className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200">
                <Icon name={t.icon} className="w-5 h-5" />
                <span className="text-[11px] font-medium">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <SaveButton disabled={!canPost} onClick={submit} savingLabel="Publicando…" className="w-full bg-emerald-500 disabled:bg-slate-200 text-white font-semibold py-3 rounded-full">
        Publicar
      </SaveButton>

      {attachType && (
        <AttachPicker
          type={attachType}
          produtos={produtos}
          comidas={comidas}
          onClose={() => setAttachType(null)}
          onPick={(r) => { setRef(r); setAttachType(null); }}
        />
      )}
    </Sheet>
  );
}

/** Picks an entity of the given type. produto/comida come from the store; marmita and
 *  prato are fetched on demand (prato = a logged section, refId is the section id). */
function AttachPicker({ type, produtos, comidas, onClose, onPick }) {
  const [q, setQ] = useState("");
  const [marmitas, setMarmitas] = useState(null);
  const [days, setDays] = useState(null);
  const [openDay, setOpenDay] = useState(null);   // { date, sections }

  useEffect(() => {
    if (type === "marmita") api.mealTemplates.list().then(setMarmitas).catch(() => setMarmitas([]));
    if (type === "prato") api.meals.recent(30).then(setDays).catch(() => setDays([]));
  }, [type]);

  const label = REF_TYPES.find((t) => t.key === type)?.label || "";

  let body;
  if (type === "produto" || type === "comida") {
    const list = (type === "produto" ? produtos : comidas).filter((x) => !q || x.name.toLowerCase().includes(q.toLowerCase()));
    body = <PickList items={list.map((x) => ({ id: x.id, name: x.name, sub: x.brand }))} onPick={(it) => onPick({ type, id: it.id, name: it.name })} />;
  } else if (type === "marmita") {
    if (!marmitas) body = <Loading />;
    else {
      const list = marmitas.filter((x) => !q || x.name.toLowerCase().includes(q.toLowerCase()));
      body = <PickList items={list.map((x) => ({ id: x.id, name: x.name, sub: `${x.items?.length || 0} itens` }))} onPick={(it) => onPick({ type, id: it.id, name: it.name })} />;
    }
  } else if (type === "prato") {
    if (openDay) {
      const withItems = openDay.sections.filter((s) => s.items.length > 0);
      body = (
        <>
          <button onClick={() => setOpenDay(null)} className="text-sm text-emerald-600 mb-2 flex items-center gap-1"><Icon name="back" className="w-4 h-4" /> Dias</button>
          {withItems.length === 0 ? <Empty text="Nenhuma seção com itens nesse dia." /> :
            <PickList items={withItems.map((s) => ({ id: s.id, name: s.name, sub: `${s.items.length} itens · ${s.items.reduce((a, i) => a + i.calories, 0)} kcal` }))} onPick={(it) => onPick({ type, id: it.id, name: `${it.name} (${dayLabel(openDay.date)})` })} />}
        </>
      );
    } else if (!days) body = <Loading />;
    else if (days.length === 0) body = <Empty text="Nenhum dia registrado ainda." />;
    else body = (
      <div className="space-y-1">
        {days.filter((d) => d.items > 0).map((d) => (
          <button key={d.id} onClick={async () => setOpenDay(await api.meals.day(d.date))} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-50 border border-transparent flex items-center justify-between">
            <span className="font-semibold text-slate-800 text-sm capitalize">{dayLabel(d.date)}</span>
            <span className="text-xs text-slate-400">{d.calories} kcal</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <Sheet onClose={onClose} title={`Anexar ${label.toLowerCase()}`}>
      {(type === "produto" || type === "comida" || type === "marmita") && (
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="w-full mb-3 bg-slate-100 rounded-xl px-4 py-2.5 outline-none" />
      )}
      <div className="max-h-72 overflow-y-auto scroll-hide">{body}</div>
    </Sheet>
  );
}

function PickList({ items, onPick }) {
  if (!items.length) return <Empty text="Nada encontrado." />;
  return (
    <div className="space-y-1">
      {items.map((it) => (
        <button key={it.id} onClick={() => onPick(it)} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-50 border border-transparent">
          <div className="font-semibold text-slate-800 text-sm">{it.name}</div>
          {it.sub && <div className="text-[11px] text-slate-400">{it.sub}</div>}
        </button>
      ))}
    </div>
  );
}

const Loading = () => <SkeletonRows rows={5} avatar={false} />;
const Empty = ({ text }) => <div className="py-8 text-center text-slate-400 text-sm">{text}</div>;

function dayLabel(date) {
  return new Date(date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
