import { useEffect, useState } from "react";
import Icon from "../components/Icon.jsx";
import { api, todayISO } from "../lib/api.js";

export default function CalendarScreen({ onPickDay }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [recent, setRecent] = useState([]);

  useEffect(() => { api.meals.recent(60).then(setRecent).catch(() => setRecent([])); }, []);

  const monthName = new Date(month.y, month.m, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const firstDay = new Date(month.y, month.m, 1);
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay.getDay(); i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const today = todayISO();
  const byDate = Object.fromEntries(recent.map(r => [r.date, r]));

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-5 pt-[max(env(safe-area-inset-top),20px)] pb-4 shrink-0">
        <h1 className="text-[22px] font-bold text-slate-900">Agenda</h1>
        <p className="text-sm text-slate-500">Toque num dia para registrar refeições.</p>
      </div>
      <div className="px-4 pb-2 flex items-center justify-between shrink-0">
        <button onClick={() => setMonth(m => ({ y: m.m === 0 ? m.y - 1 : m.y, m: m.m === 0 ? 11 : m.m - 1 }))} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><Icon name="chevronL" className="w-5 h-5"/></button>
        <div className="font-semibold capitalize text-slate-800">{monthName}</div>
        <button onClick={() => setMonth(m => ({ y: m.m === 11 ? m.y + 1 : m.y, m: m.m === 11 ? 0 : m.m + 1 }))} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><Icon name="chevronR" className="w-5 h-5"/></button>
      </div>
      <div className="px-4 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400 shrink-0">
        {["D","S","T","Q","Q","S","S"].map((d,i) => <div key={i} className="py-1">{d}</div>)}
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 scroll-hide">
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const iso = `${month.y}-${String(month.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const stats = byDate[iso];
            const isToday = iso === today;
            return (
              <button key={i} onClick={() => onPickDay(iso)} className={`aspect-square rounded-xl flex flex-col items-center justify-center transition active:scale-95 ${isToday ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30" : stats ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-600"}`}>
                <span className="text-[15px] font-bold">{d}</span>
                {stats && <span className={`text-[9px] mt-0.5 ${isToday ? "text-emerald-50" : "text-emerald-600"}`}>{stats.calories}</span>}
              </button>
            );
          })}
        </div>

        {recent.length > 0 && (
          <div className="mt-6 rounded-2xl border border-slate-200 p-4">
            <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">Últimos dias</div>
            {recent.slice(0, 4).map(r => (
              <button key={r.id} onClick={() => onPickDay(r.date)} className="w-full flex items-center justify-between py-2 border-b border-slate-100 last:border-b-0">
                <div className="text-left">
                  <div className="font-semibold text-slate-800">{new Date(r.date + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short" })}</div>
                  <div className="text-xs text-slate-500">{r.items} itens</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-orange-500 font-bold">{r.calories}</span>
                  <span className="text-xs text-slate-400">kcal</span>
                  <Icon name="chevronR" className="w-4 h-4 text-slate-300" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
