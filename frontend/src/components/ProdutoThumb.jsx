import { useRef, useState } from "react";
import ImageViewer from "./ImageViewer.jsx";

const SIZES = { sm: "w-8 h-8 rounded-lg text-sm", md: "w-10 h-10 rounded-xl text-lg" };

/** Capa do produto (frente da embalagem) or the 🥚 fallback when missing / broken. `zoomable` opens it fullscreen on tap. */
export default function ProdutoThumb({ url, size = "md", zoomable = false }) {
  const [broken, setBroken] = useState(false);
  const [origin, setOrigin] = useState(null);
  const ref = useRef(null);
  const box = SIZES[size];
  if (!url || broken) {
    return <div className={`${box} bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0`}>🥚</div>;
  }
  const img = (
    <img ref={ref} src={url} alt="" loading="lazy" onError={() => setBroken(true)}
      className={`${box} object-cover bg-slate-100 shrink-0`}
      style={origin ? { visibility: "hidden" } : undefined}/>
  );
  if (!zoomable) return img;

  function open() {
    const el = ref.current;
    setOrigin({ rect: el.getBoundingClientRect(), radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0 });
  }

  return (
    <>
      <button type="button" onClick={open} aria-label="Ver foto" className="shrink-0 block">{img}</button>
      {origin && <ImageViewer url={url} origin={origin} onClose={() => setOrigin(null)}/>}
    </>
  );
}
