import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import Sheet from "./Sheet.jsx";
import { api } from "../lib/api.js";

// Pick the refeição (section) to move item(s) into. The Agenda passes the day's `sections`
// it already has; the chat result card only knows the date, so they're fetched.
export default function MoveItemSheet({ date, sections: given, currentId, currentName, title = "Mover para", onClose, onPick }) {
  const [sections, setSections] = useState(given ?? null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (!given) api.meals.day(date).then(d => setSections(d.sections)).catch(() => setSections([]));
  }, [date]);

  const isCurrent = (s) => currentId ? s.id === currentId : s.name === currentName;

  async function pick(s) {
    setBusy(s.id);
    try { await onPick(s); } finally { setBusy(null); }
  }

  return (
    <Sheet onClose={onClose} title={title}>
      {!sections ? (
        <div className="py-6 flex justify-center text-slate-400"><Icon name="spinner" className="w-5 h-5 animate-spin"/></div>
      ) : (
        <div className="space-y-1">
          {sections.map(s => (
            <button key={s.id} disabled={isCurrent(s) || !!busy} onClick={() => pick(s)}
              className="w-full text-left px-3 py-3 rounded-xl flex items-center justify-between border border-transparent enabled:hover:bg-slate-50 disabled:opacity-60">
              <span className="font-semibold text-slate-800">{s.name}</span>
              {isCurrent(s)
                ? <span className="text-xs text-slate-400">atual</span>
                : busy === s.id && <Icon name="spinner" className="w-4 h-4 animate-spin text-slate-400"/>}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
