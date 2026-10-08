import { useState } from "react";
import Icon from "./Icon.jsx";
import { api, todayISO } from "../lib/api.js";

/**
 * "Copiar o de sempre": one-tap copy of a past meal into an empty section.
 * `rec` is a backend SectionRecommendation: { section, options: [recommended, yesterday?] },
 * each option { fromDate, fromSection, items: [names], calories, protein, times }.
 * Calls POST /meal-days/{date}/copy and hands the CopySummary to onCopied.
 *
 * variant "card" = standalone card (chat screen); "inline" = row inside a DayScreen section.
 */
export default function CopySuggestion({ rec, date, onCopied, onDismiss, variant = "inline" }) {
  const [busy, setBusy] = useState(false);
  const [main, alt] = rec.options;

  async function copy(opt) {
    if (busy) return;
    setBusy(true);
    try {
      const summary = await api.meals.copy(date, { fromDate: opt.fromDate, fromSection: opt.fromSection, toSection: rec.section });
      onCopied?.(summary);
    } finally { setBusy(false); }
  }

  const altButton = alt && (
    <button disabled={busy} onClick={() => copy(alt)} className="text-xs text-slate-500 underline underline-offset-2 disabled:opacity-50">
      ou {sourceLabel(alt, date, true)} · {alt.calories} kcal
    </button>
  );

  if (variant === "card") {
    return (
      <div className="bg-white border border-emerald-200 rounded-2xl shadow-sm px-4 py-3">
        <div className="flex items-center gap-2 text-emerald-600 text-xs font-semibold">
          <Icon name="sparkles" className="w-4 h-4" /> {rec.section}: {sourceLabel(main, date)}
          <div className="flex-1" />
          {onDismiss && (
            <button onClick={onDismiss} aria-label="Dispensar sugestão" className="w-6 h-6 -mr-1 rounded-full text-slate-400 hover:text-slate-600 flex items-center justify-center"><Icon name="close" className="w-4 h-4" /></button>
          )}
        </div>
        <div className="mt-1 text-[14px] text-slate-800 line-clamp-2">{main.items.join(", ")}</div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="text-[12px]"><span className="text-orange-600 font-semibold">{main.calories} kcal</span> · <span className="text-violet-600 font-semibold">{main.protein}g prot</span></div>
          <button disabled={busy} onClick={() => copy(main)} className="shrink-0 h-8 px-4 rounded-full bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold">
            {busy ? "Copiando…" : "Copiar"}
          </button>
        </div>
        {altButton && <div className="mt-1.5">{altButton}</div>}
      </div>
    );
  }

  return (
    <div className="border-t border-slate-100 px-4 py-2.5">
      <div className="flex items-center gap-3">
        <Icon name="sparkles" className="w-4 h-4 text-emerald-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold text-emerald-700">{sourceLabel(main, date)} · {main.calories} kcal</div>
          <div className="text-[12px] text-slate-500 truncate">{main.items.join(", ")}</div>
        </div>
        <button disabled={busy} onClick={() => copy(main)} className="shrink-0 h-8 px-3 rounded-full bg-emerald-50 text-emerald-700 disabled:opacity-50 text-xs font-semibold">
          {busy ? "Copiando…" : "Copiar"}
        </button>
      </div>
      {altButton && <div className="pl-7 mt-1">{altButton}</div>}
    </div>
  );
}

// "O de sempre" when the meal repeats; otherwise which day it comes from.
function sourceLabel(opt, date, lower = false) {
  if (opt.times >= 2) return lower ? "o de sempre" : "O de sempre";
  const prev = new Date(date + "T00:00:00");
  prev.setDate(prev.getDate() - 1);
  const from = new Date(opt.fromDate + "T00:00:00");
  let suffix;
  if (from.getTime() !== prev.getTime()) {
    suffix = "de " + from.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
  } else {
    suffix = date === todayISO() ? "de ontem" : "do dia anterior";
  }
  return lower ? `o ${suffix}` : `Igual ao ${suffix}`;
}

/** Find the recommendation for a section name (accent/case-insensitive). */
export function findRec(recs, section) {
  if (!recs || !section) return null;
  const n = normalize(section);
  return recs.sections.find(r => normalize(r.section) === n) || null;
}

function normalize(s) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}
