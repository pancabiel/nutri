import { useState } from "react";

const SIZES = { sm: "w-8 h-8 rounded-lg text-sm", md: "w-10 h-10 rounded-xl text-lg" };

/** Capa do produto (frente da embalagem) or the 🥚 fallback when missing / broken. */
export default function ProdutoThumb({ url, size = "md" }) {
  const [broken, setBroken] = useState(false);
  const box = SIZES[size];
  if (!url || broken) {
    return <div className={`${box} bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0`}>🥚</div>;
  }
  return <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} className={`${box} object-cover bg-slate-100 shrink-0`}/>;
}
