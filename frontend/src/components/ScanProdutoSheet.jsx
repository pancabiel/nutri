import { useState } from "react";
import Sheet from "./Sheet.jsx";
import PhotoSlot from "./PhotoSlot.jsx";
import SaveButton from "./SaveButton.jsx";
import { api, CapError, photoPayload } from "../lib/api.js";
import { useStore } from "../state/store.jsx";

/**
 * Two-slot capture before the label scan: tabela (required) + frente da embalagem
 * (optional, read for name + brand). One Claude call → one `label` cap use.
 * `onResult(scan)` gets the AI fields plus `labelPhoto` / `coverPhoto` ({ file }) so
 * ProdutoForm can attach them (uploaded only when the produto is saved).
 */
export default function ScanProdutoSheet({ onClose, onResult }) {
  const { showToast } = useStore();
  const [label, setLabel] = useState(null);
  const [cover, setCover] = useState(null);

  async function read() {
    try {
      const [l, c] = await Promise.all([photoPayload(label.file), cover ? photoPayload(cover.file) : null]);
      const result = await api.scanLabel(l.b64, l.mime, c);
      onResult({ ...result, labelPhoto: label, coverPhoto: cover });
    } catch (e) {
      if (!(e instanceof CapError)) showToast("Não foi possível ler a foto. Tente de novo.", "error");
    }
  }

  return (
    <Sheet onClose={onClose} title="Escanear produto" hideHandle>
      <div className="flex gap-3">
        <PhotoSlot label="Tabela nutricional" photo={label} onChange={setLabel} required testId="scan-slot-label"/>
        <PhotoSlot label="Frente da embalagem" photo={cover} onChange={setCover} testId="scan-slot-cover"/>
      </div>
      <p className="text-xs text-slate-500 mt-3">A frente é usada pra ler o nome e a marca.</p>
      <SaveButton
        onClick={read}
        disabled={!label}
        savingLabel="Lendo…"
        className="w-full mt-4 bg-emerald-500 disabled:bg-slate-200 text-white font-semibold py-3 rounded-full"
      >
        Ler com IA
      </SaveButton>
    </Sheet>
  );
}
