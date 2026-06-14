import { useState } from "react";
import ProdutosScreen from "./ProdutosScreen.jsx";
import ComidasScreen from "./ComidasScreen.jsx";
import MarmitasScreen from "./MarmitasScreen.jsx";

const SEGMENTS = [
  { key: "produtos", label: "Produtos" },
  { key: "comidas",  label: "Comidas" },
  { key: "marmitas", label: "Marmitas" },
];

/**
 * Single "Biblioteca" tab that hosts the existing Produtos / Comidas / Marmitas screens
 * behind a segment selector. Each segment is mounted lazily on first visit and kept
 * mounted afterwards so in-progress edits survive switching segments.
 */
export default function BibliotecaScreen() {
  const [seg, setSeg] = useState("produtos");
  const [visited, setVisited] = useState(() => new Set(["produtos"]));

  function pick(key) {
    setSeg(key);
    setVisited((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="shrink-0 bg-white border-b border-slate-200 px-3 pt-3 pb-2">
        <div className="flex gap-1 bg-slate-100 rounded-full p-1 max-w-md mx-auto">
          {SEGMENTS.map((s) => (
            <button key={s.key} onClick={() => pick(s.key)} className={`flex-1 py-2 rounded-full text-sm font-semibold ${seg === s.key ? "bg-white shadow text-slate-900" : "text-slate-500"}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-hidden relative">
        {visited.has("produtos") && <div className={seg === "produtos" ? "absolute inset-0" : "hidden"}><ProdutosScreen /></div>}
        {visited.has("comidas")  && <div className={seg === "comidas"  ? "absolute inset-0" : "hidden"}><ComidasScreen /></div>}
        {visited.has("marmitas") && <div className={seg === "marmitas" ? "absolute inset-0" : "hidden"}><MarmitasScreen /></div>}
      </div>
    </div>
  );
}
