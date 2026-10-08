import { useState } from "react";
import Icon from "./Icon.jsx";
import Sheet from "./Sheet.jsx";
import NumberInput from "./NumberInput.jsx";
import SaveButton from "./SaveButton.jsx";
import PhotoSlot from "./PhotoSlot.jsx";
import { api, CapError, photoPayload, urlPhotoPayload } from "../lib/api.js";
import { uploadImage, removeImages } from "../lib/storage.js";
import { useStore } from "../state/store.jsx";

const BUCKET = "produtos";

export default function ProdutoForm({ produto, prefill, title, hint, onClose, onSave }) {
  const { showToast } = useStore();
  const init = produto ?? {
    name: prefill?.name ?? "",
    brand: prefill?.brand ?? "",
    caloriesPerGram: prefill ? prefill.calories_per_100g / 100 : 0,
    proteinPerGram:  prefill ? prefill.protein_per_100g / 100 : 0,
    carbsPerGram:    prefill ? (prefill.carbs_per_100g ?? 0) / 100 : 0,
    fatPerGram:      prefill ? (prefill.fat_per_100g ?? 0) / 100 : 0,
    servingGrams:    prefill?.serving_grams ? prefill.serving_grams : null,
    servingLabel:    prefill?.serving_label ?? "",
  };
  const [form, setForm] = useState(init);
  // Photos: { url } (already uploaded) or { file } (picked, uploaded on save) or null.
  const [cover, setCover] = useState(produto?.coverUrl ? { url: produto.coverUrl } : prefill?.coverPhoto ?? null);
  const [labelPhoto, setLabelPhoto] = useState(produto?.labelUrl ? { url: produto.labelUrl } : prefill?.labelPhoto ?? null);
  const [reading, setReading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const per100 = (k) => +(form[k] * 100).toFixed(1);
  const setPer100 = (k, v) => set(k, (v ?? 0) / 100);

  const sheetTitle = title ?? (produto ? "Editar produto" : prefill ? "Confirmar dados escaneados" : "Novo produto");
  const showHint = hint ?? (prefill ? "Extraído da tabela nutricional. Confirme e salve." : null);

  // Re-read only the table: overwrites macros + porção, keeps name/brand (user may have edited).
  async function rereadLabel() {
    setReading(true);
    try {
      const l = labelPhoto.file ? await photoPayload(labelPhoto.file) : await urlPhotoPayload(labelPhoto.url);
      const r = await api.scanLabel(l.b64, l.mime);
      setForm(f => ({
        ...f,
        caloriesPerGram: (r.calories_per_100g ?? 0) / 100,
        proteinPerGram:  (r.protein_per_100g ?? 0) / 100,
        carbsPerGram:    (r.carbs_per_100g ?? 0) / 100,
        fatPerGram:      (r.fat_per_100g ?? 0) / 100,
        servingGrams:    r.serving_grams ? r.serving_grams : null,
        servingLabel:    r.serving_label ?? "",
      }));
      showToast("Tabela lida de novo");
    } catch (e) {
      if (!(e instanceof CapError)) showToast("Não foi possível ler a tabela. Tente de novo.", "error");
    } finally {
      setReading(false);
    }
  }

  // Upload new photos → save → drop replaced/removed ones (best-effort). A failed upload
  // aborts the save so the table photo is never lost silently.
  async function submit() {
    const uploaded = [];
    const resolve = async (photo) => {
      if (!photo) return null;
      if (photo.url) return photo.url;
      const url = await uploadImage(BUCKET, photo.file);
      uploaded.push(url);
      return url;
    };
    let coverUrl, labelUrl;
    try {
      coverUrl = await resolve(cover);
      labelUrl = await resolve(labelPhoto);
    } catch {
      await removeImages(BUCKET, uploaded);
      showToast("Não foi possível enviar a foto. Tente de novo.", "error");
      return;
    }
    try {
      await onSave({ ...form, coverUrl, labelUrl });
    } catch (e) {
      await removeImages(BUCKET, uploaded);
      throw e;
    }
    const kept = new Set([coverUrl, labelUrl]);
    removeImages(BUCKET, [produto?.coverUrl, produto?.labelUrl].filter(u => u && !kept.has(u)));
  }

  return (
    <Sheet onClose={onClose} title={sheetTitle} hideHandle tall>
      {showHint && (
        <div className="mb-3 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
          <Icon name="sparkles" className="w-4 h-4"/> {showHint}
        </div>
      )}
      <div className="flex gap-3">
        <PhotoSlot label="Capa" photo={cover} onChange={setCover} testId="produto-slot-cover"/>
        <div className="flex-1 min-w-0">
          <PhotoSlot label="Tabela" photo={labelPhoto} onChange={setLabelPhoto} testId="produto-slot-label"/>
          {labelPhoto && (
            <button
              type="button"
              onClick={rereadLabel}
              disabled={reading}
              className="mt-1 text-xs font-semibold text-emerald-700 disabled:text-slate-400 flex items-center gap-1"
            >
              <Icon name={reading ? "spinner" : "refresh"} className={`w-3.5 h-3.5 ${reading ? "animate-spin" : ""}`}/>
              {reading ? "Lendo…" : "Ler tabela"}
            </button>
          )}
        </div>
      </div>
      <Field label="Nome"><input value={form.name} onChange={e => set("name", e.target.value)} className="w-full bg-slate-100 rounded-lg px-3 py-2 outline-none"/></Field>
      <Field label="Marca (opcional)"><input value={form.brand ?? ""} onChange={e => set("brand", e.target.value)} className="w-full bg-slate-100 rounded-lg px-3 py-2 outline-none"/></Field>
      <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold pt-3">Porção</div>
      <div className="grid grid-cols-[1fr_5rem] gap-3 mt-1">
        <Field label='Descrição (ex: "2 fatias")'>
          <input
            value={form.servingLabel ?? ""}
            onChange={e => set("servingLabel", e.target.value)}
            placeholder="2 fatias, 1 colher de sopa…"
            className="w-full bg-slate-100 rounded-lg px-3 py-2 outline-none"
          />
        </Field>
        <Field label="Gramas">
          <NumberInput
            value={form.servingGrams}
            onChange={v => set("servingGrams", v)}
            placeholder="—"
            className="w-full bg-slate-100 rounded-lg px-3 py-2 outline-none"
          />
        </Field>
      </div>
      <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold pt-3">Por 100 g</div>
      <div className="grid grid-cols-2 gap-3 mt-1">
        <Field label="Calorias (kcal)"><NumberInput value={per100("caloriesPerGram")} onChange={v => setPer100("caloriesPerGram", v)} className="w-full bg-slate-100 rounded-lg px-3 py-2 outline-none"/></Field>
        <Field label="Proteína (g)"><NumberInput value={per100("proteinPerGram")} onChange={v => setPer100("proteinPerGram", v)} className="w-full bg-slate-100 rounded-lg px-3 py-2 outline-none"/></Field>
        <Field label="Carbs (g)"><NumberInput value={per100("carbsPerGram")} onChange={v => setPer100("carbsPerGram", v)} className="w-full bg-slate-100 rounded-lg px-3 py-2 outline-none"/></Field>
        <Field label="Gordura (g)"><NumberInput value={per100("fatPerGram")} onChange={v => setPer100("fatPerGram", v)} className="w-full bg-slate-100 rounded-lg px-3 py-2 outline-none"/></Field>
      </div>
      <SaveButton onClick={submit} disabled={!form.name.trim() || reading} className="w-full mt-5 bg-emerald-500 disabled:bg-slate-200 text-white font-semibold py-3 rounded-full">Salvar</SaveButton>
    </Sheet>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mt-2">
      <div className="text-xs text-slate-500 font-medium mb-1">{label}</div>
      {children}
    </label>
  );
}
