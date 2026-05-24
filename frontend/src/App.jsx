import { useEffect, useState } from "react";
import Icon from "./components/Icon.jsx";
import { StoreProvider, useStore } from "./state/store.jsx";
import ChatScreen from "./screens/ChatScreen.jsx";
import CalendarScreen from "./screens/CalendarScreen.jsx";
import DayScreen from "./screens/DayScreen.jsx";
import ProdutosScreen from "./screens/ProdutosScreen.jsx";
import ComidasScreen from "./screens/ComidasScreen.jsx";
import LoginScreen from "./screens/LoginScreen.jsx";
import OnboardingScreen from "./screens/OnboardingScreen.jsx";
import SettingsScreen from "./screens/SettingsScreen.jsx";
import UpgradeModal from "./components/UpgradeModal.jsx";
import { todayISO, api } from "./lib/api.js";
import { supabase } from "./lib/supabase.js";

function Shell({ onOpenSettings, isPro }) {
  const { toast, refreshProdutos, refreshComidas } = useStore();
  const [screen, setScreen] = useState("chat");
  const [date, setDate] = useState(todayISO());

  useEffect(() => { refreshProdutos(); refreshComidas(); }, []);

  const otherScreens = {
    calendar: <CalendarScreen onPickDay={(d) => { setDate(d); setScreen("day"); }} />,
    day: <DayScreen date={date} onBack={() => setScreen("calendar")} />,
    produtos: <ProdutosScreen />,
    comidas: <ComidasScreen />,
  };

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-white relative overflow-hidden">
      <header className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-slate-100">
        <span className="text-sm font-semibold text-slate-700">Nutri</span>
        <div className="flex items-center gap-2">
          {isPro ? (
            <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full inline-flex items-center gap-1">
              <Icon name="crown" className="w-3 h-3" /> Pro
            </span>
          ) : (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("nutri:open-upgrade"))}
              className="text-[10px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-full inline-flex items-center gap-1"
            >
              <Icon name="lock" className="w-3 h-3" /> Free
            </button>
          )}
          <button onClick={onOpenSettings} className="text-slate-500 p-1">
            <Icon name="cog" className="w-5 h-5" />
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-hidden relative">
        <div className={screen === "chat" ? "absolute inset-0" : "hidden"}>
          <ChatScreen onOpenDay={() => { setDate(todayISO()); setScreen("day"); }} />
        </div>
        {screen !== "chat" && otherScreens[screen]}
      </div>

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
  const [session, setSession] = useState(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Upgrade modal — `null` hidden, `{}` shown without context, `{cap: ...}` shown after 402.
  const [upgrade, setUpgrade] = useState(null);

  useEffect(() => {
    function onCap(e) { setUpgrade({ cap: e.detail }); }
    function onOpen(e) { setUpgrade({ cap: e.detail || null }); }
    window.addEventListener("nutri:cap-exceeded", onCap);
    window.addEventListener("nutri:open-upgrade", onOpen);
    return () => {
      window.removeEventListener("nutri:cap-exceeded", onCap);
      window.removeEventListener("nutri:open-upgrade", onOpen);
    };
  }, []);

  // Stripe Checkout return — refresh profile so is_pro flips immediately (webhook
  // already fired by the time the user is redirected back) and strip the query.
  useEffect(() => {
    if (!session) return;
    const params = new URLSearchParams(window.location.search);
    const billing = params.get("billing");
    if (!billing) return;
    if (billing === "success" || billing === "portal-return") {
      api.profile.get().then(setProfile).catch(() => {});
    }
    params.delete("billing");
    const search = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (search ? "?" + search : ""));
  }, [session]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoaded(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession((prev) => {
        if (prev?.user?.id === s?.user?.id) return prev;
        setProfile(null);
        setProfileLoaded(false);
        return s;
      });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setProfileLoaded(true); return; }
    setProfileLoaded(false);
    api.profile.get()
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setProfileLoaded(true));
  }, [session]);

  if (!sessionLoaded) return <Splash />;
  if (!session) return <LoginScreen />;
  if (!profileLoaded) return <Splash />;
  if (!profile?.onboardingComplete) {
    return <OnboardingScreen onDone={() => {
      api.profile.get().then(setProfile);
    }} />;
  }

  return (
    <StoreProvider>
      {showSettings
        ? <SettingsScreen onClose={() => setShowSettings(false)} profile={profile} onProfileRefresh={() => api.profile.get().then(setProfile)} />
        : <Shell onOpenSettings={() => setShowSettings(true)} isPro={!!profile?.isPro} />}
      {upgrade && <UpgradeModal cap={upgrade.cap} onClose={() => setUpgrade(null)} />}
    </StoreProvider>
  );
}

function Splash() {
  return (
    <div className="h-[100dvh] w-full flex items-center justify-center bg-white">
      <div className="text-slate-400 text-sm">Carregando…</div>
    </div>
  );
}
