import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon.jsx";
import { pickFile } from "../lib/api.js";

// A photo is either already uploaded ({ url }) or picked but not yet uploaded ({ file }).
// Uploads only happen on save, so a cancelled form never leaves files in Storage.

/** Preview src for a photo: the public URL, or an object URL for a local File (revoked on change). */
export function usePhotoSrc(photo) {
  const [src, setSrc] = useState(photo?.url || null);
  useEffect(() => {
    if (!photo?.file) { setSrc(photo?.url || null); return; }
    const u = URL.createObjectURL(photo.file);
    setSrc(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);
  return src;
}

/**
 * Square photo slot. Empty → tap opens the picker. Filled → tap reveals
 * Ver / Trocar / Remover. `onChange(photo | null)`.
 */
export default function PhotoSlot({ label, photo, onChange, required = false, testId }) {
  const src = usePhotoSrc(photo);
  const [menu, setMenu] = useState(false);
  const [viewing, setViewing] = useState(false);

  async function pick() {
    setMenu(false);
    const file = await pickFile();
    if (file) onChange({ file });
  }

  return (
    <div className="flex-1 min-w-0" data-testid={testId}>
      <div className="text-xs text-slate-500 font-medium mb-1">
        {label}{required ? <span className="text-red-500"> *</span> : <span className="text-slate-400"> (opcional)</span>}
      </div>
      <button
        type="button"
        onClick={() => (src ? setMenu(m => !m) : pick())}
        className="relative w-full aspect-square rounded-xl overflow-hidden bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-slate-400"
      >
        {src
          ? <img src={src} alt={label} className="absolute inset-0 w-full h-full object-cover"/>
          : <span className="flex flex-col items-center gap-1 text-xs"><Icon name="camera" className="w-6 h-6"/>Adicionar</span>}
      </button>
      {src && menu && (
        <div className="mt-1.5 flex gap-1 text-xs font-semibold">
          <button type="button" onClick={() => { setMenu(false); setViewing(true); }} className="flex-1 py-1.5 rounded-lg bg-slate-100 text-slate-700">Ver</button>
          <button type="button" onClick={pick} className="flex-1 py-1.5 rounded-lg bg-slate-100 text-slate-700">Trocar</button>
          <button type="button" onClick={() => { setMenu(false); onChange(null); }} className="flex-1 py-1.5 rounded-lg bg-red-50 text-red-600">Remover</button>
        </div>
      )}
      {viewing && src && createPortal(
        <div onClick={() => setViewing(false)} className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 fade-in">
          <img src={src} alt={label} className="max-w-full max-h-full object-contain"/>
          <button type="button" aria-label="Fechar" className="absolute top-[max(env(safe-area-inset-top),16px)] right-4 w-9 h-9 rounded-full bg-white/15 text-white flex items-center justify-center">
            <Icon name="close" className="w-5 h-5"/>
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
