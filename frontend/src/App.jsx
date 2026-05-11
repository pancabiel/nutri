import { useEffect, useState } from "react";
import Icon from "./components/Icon.jsx";
import { StoreProvider, useStore } from "./state/store.jsx";
import ChatScreen from "./screens/ChatScreen.jsx";
import CalendarScreen from "./screens/CalendarScreen.jsx";
import DayScreen from "./screens/DayScreen.jsx";
import ProdutosScreen from "./screens/ProdutosScreen.jsx";
import ComidasScreen from "./screens/ComidasScreen.jsx";
import LoginScreen from "./screens/LoginScreen.jsx";
import { todayISO, auth } from "./lib/api.js";

function Shell() {
  const { toast, refreshProdutos, refreshComidas } = useStore();
  const [screen, setScreen] = useState("chat");
  const [date, setDate] = useState(todayISO());

  useEffect(() => { refreshProdutos(); refreshComidas(); }, []);

  const screens = {
    chat: <ChatScreen onOpenDay={() => { setDate(todayISO()); setScreen("day"); }} />,
    calendar: <CalendarScreen onPickDay={(d) => { setDate(d); setScreen("day"); }} />,
    day: <DayScreen date={date} onBack={() => setScreen("calendar")} />,
    produtos: <ProdutosScreen />,
    comidas: <ComidasScreen />,
  };

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-white relative overflow-hidden">
      <div className="flex-1 overflow-hidden relative">{screens[screen]}</div>

      <nav className="shrink-0 border-t border-slate-200 bg-white/95 backdrop-blur px-2 pt-2 pb-[max(env(safe-area-inset-bottom),12px)]">
        <div className="grid grid-cols-4 gap-1 max-w-md mx-auto">
          <NavBtn active={screen === "chat"}                                onClick={() => setScreen("chat")}     icon="chat"     label="Chat"/>
          <NavBtn active={screen === "calendar" || screen === "day"}        onClick={() => setScreen("calendar")} icon="calendar" label="Agenda"/>
          <NavBtn active={screen === "produtos"}                            onClick={() => setScreen("produtos")} icon="box"      label="Produtos"/>
          <NavBtn active={screen === "comidas"}                             onClick={() => setScreen("comidas")}  icon="plate"    label="Comidas"/>
        </div>
      </nav>

      {toast && (
        <div className="pointer-events-none fixed left-1/2 -translate-x-1/2 bottom-24 z-50 fade-in">
          <div className="rounded-full bg-slate-900 text-white text-sm px-4 py-2 shadow-lg flex items-center gap-2">
            <Icon name="check" className="w-4 h-4 text-emerald-400" />
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

function NavBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 py-2 rounded-xl transition-colors ${active ? "text-emerald-600" : "text-slate-400"}`}>
      <Icon name={icon} className="w-6 h-6" />
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(() => !!auth.get());
  if (!authed) return <LoginScreen onAuthed={() => setAuthed(true)} />;
  return <StoreProvider><Shell /></StoreProvider>;
}
