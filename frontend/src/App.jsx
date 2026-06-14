import { useEffect, useState } from "react";
import Icon from "./components/Icon.jsx";
import { StoreProvider, useStore } from "./state/store.jsx";
import ChatScreen from "./screens/ChatScreen.jsx";
import CalendarScreen from "./screens/CalendarScreen.jsx";
import DayScreen from "./screens/DayScreen.jsx";
import BibliotecaScreen from "./screens/BibliotecaScreen.jsx";
import FeedScreen from "./screens/FeedScreen.jsx";
import LoginScreen from "./screens/LoginScreen.jsx";
import OnboardingScreen from "./screens/OnboardingScreen.jsx";
import SettingsScreen from "./screens/SettingsScreen.jsx";
import ProfileScreen from "./components/ProfileScreen.jsx";
import UpgradeModal from "./components/UpgradeModal.jsx";
import { todayISO, api } from "./lib/api.js";
import { supabase } from "./lib/supabase.js";

// Order is irrelevant — each screen is rendered into its own absolutely-positioned
// layer and only the active one is visible. `calendar` isn't a tab of its own; it's
// reached from the Agenda day ("Ver mês") and routes back into `day`.
const SCREENS = ["chat", "day", "calendar", "biblioteca", "feed"];

function Shell({ onOpenSettings, isPro, profile, currentUserId, onProfileChanged }) {
  const { toast, refreshProdutos, refreshComidas } = useStore();
  const [screen, setScreen] = useState("chat");
  const [date, setDate] = useState(todayISO());
  // Keep every screen we've visited mounted so in-progress forms survive navigating
  // away and back. Mount lazily on first visit so we don't fire every screen's data
  // fetch on app load.
  const [visited, setVisited] = useState(() => new Set(["chat"]));

  useEffect(() => { refreshProdutos(); refreshComidas(); }, []);
  useEffect(() => {
    setVisited((prev) => (prev.has(screen) ? prev : new Set(prev).add(screen)));
  }, [screen]);

  // The Agenda tab opens straight to today's diary; the monthly calendar is one tap away.
  function openAgenda() { setDate(todayISO()); setScreen("day"); }

  function renderScreen(name) {
    switch (name) {
      case "chat":       return <ChatScreen onOpenDay={() => { setDate(todayISO()); setScreen("day"); }} />;
      case "calendar":   return <CalendarScreen onPickDay={(d) => { setDate(d); setScreen("day"); }} />;
      case "day":        return <DayScreen date={date} onBack={() => setScreen("calendar")} onViewMonth={() => setScreen("calendar")} />;
      case "biblioteca": return <BibliotecaScreen />;
      case "feed":       return <FeedScreen profile={profile} currentUserId={currentUserId} onProfileChanged={onProfileChanged} />;
      default:           return null;
    }
  }

  // Nav items shared between the desktop sidebar and the mobile bottom bar so the two
  // can never drift out of sync.
  const navItems = [
    { key: "chat",       active: screen === "chat",                          onClick: () => setScreen("chat"),       icon: "chat",     label: "Chat" },
    { key: "agenda",     active: screen === "day" || screen === "calendar",  onClick: openAgenda,                    icon: "calendar", label: "Agenda" },
    { key: "biblioteca", active: screen === "biblioteca",                    onClick: () => setScreen("biblioteca"), icon: "box",      label: "Biblioteca" },
    { key: "feed",       active: screen === "feed",                          onClick: () => setScreen("feed"),       icon: "users",    label: "Feed" },
  ];

  return (
    // Outer rail: a sidebar (≥md) next to a centered content column. On phones the
    // sidebar is hidden and the column fills the screen with the bottom tab bar.
    <div className="h-full w-full flex bg-slate-100">
      <aside className="hidden md:flex md:flex-col w-56 shrink-0 bg-white border-r border-slate-200 px-3 py-4">
        <div className="px-2 mb-6 text-xl font-bold text-slate-800">Nutri</div>
        <nav className="flex flex-col gap-1">
          {navItems.map((it) => (
            <SideBtn key={it.key} active={it.active} onClick={it.onClick} icon={it.icon} label={it.label} />
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0 h-full flex justify-center">
        <div className="w-full max-w-[640px] h-full flex flex-col bg-white relative overflow-hidden md:border-x md:border-slate-200">
          <header className="shrink-0 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),8px)] pb-2 border-b border-slate-100">
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
            {SCREENS.map((name) =>
              visited.has(name) ? (
                <div key={name} className={screen === name ? "absolute inset-0" : "hidden"}>
                  {renderScreen(name)}
                </div>
              ) : null
            )}
          </div>

          <nav className="md:hidden shrink-0 border-t border-slate-200 bg-white px-2 pt-1.5 pb-[max(env(safe-area-inset-bottom),8px)]">
            <div className="grid grid-cols-4 gap-1 max-w-md mx-auto">
              {navItems.map((it) => (
                <NavBtn key={it.key} active={it.active} onClick={it.onClick} icon={it.icon} label={it.label} />
              ))}
            </div>
          </nav>
        </div>
      </div>

      {toast && (
        <div className="pointer-events-none fixed left-1/2 -translate-x-1/2 bottom-24 z-50 fade-in max-w-[90%]">
          <div className={`rounded-full text-white text-sm px-4 py-2 shadow-lg flex items-center gap-2 ${toast.type === "error" ? "bg-red-600" : "bg-slate-900"}`}>
            <Icon name={toast.type === "error" ? "close" : "check"} className={`w-4 h-4 shrink-0 ${toast.type === "error" ? "text-white" : "text-emerald-400"}`} />
            <span className="min-w-0">{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function NavBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 py-1.5 rounded-xl transition-colors ${active ? "text-emerald-600" : "text-slate-400"}`}>
      <Icon name={icon} className="w-6 h-6" />
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

// Sidebar nav row (desktop). Horizontal icon + label, full-width hit target.
function SideBtn({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${active ? "bg-emerald-50 text-emerald-700" : "text-slate-500 hover:bg-slate-100"}`}
    >
      <Icon name={icon} className="w-5 h-5 shrink-0" />
      <span>{label}</span>
    </button>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Username whose profile overlay is open (deep-link ?u= or "nutri:open-profile" event).
  const [viewUsername, setViewUsername] = useState(null);
  // Upgrade modal — `null` hidden, `{}` shown without context, `{cap: ...}` shown after 402.
  const [upgrade, setUpgrade] = useState(null);

  useEffect(() => {
    function onCap(e) { setUpgrade({ cap: e.detail }); }
    function onOpen(e) { setUpgrade({ cap: e.detail || null }); }
    function onProfile(e) { if (e.detail) setViewUsername(e.detail); }
    window.addEventListener("nutri:cap-exceeded", onCap);
    window.addEventListener("nutri:open-upgrade", onOpen);
    window.addEventListener("nutri:open-profile", onProfile);
    return () => {
      window.removeEventListener("nutri:cap-exceeded", onCap);
      window.removeEventListener("nutri:open-upgrade", onOpen);
      window.removeEventListener("nutri:open-profile", onProfile);
    };
  }, []);

  // Invite deep-link: ?u=<username> opens that profile (with a Follow button).
  useEffect(() => {
    if (!session) return;
    const params = new URLSearchParams(window.location.search);
    const u = params.get("u");
    if (!u) return;
    params.delete("u");
    const search = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (search ? "?" + search : ""));
    setViewUsername(u);
  }, [session]);

  // Stripe Checkout return — refresh profile so is_pro flips immediately and strip the
  // query. The webhook usually lands before the user-facing redirect, but not always;
  // on ?billing=success we poll the profile a few times until is_pro is true so the
  // Pro badge doesn't lag a page reload behind reality.
  useEffect(() => {
    if (!session) return;
    const params = new URLSearchParams(window.location.search);
    const billing = params.get("billing");
    if (!billing) return;
    params.delete("billing");
    const search = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (search ? "?" + search : ""));

    if (billing === "portal-return") {
      api.profile.get().then(setProfile).catch(() => {});
      return;
    }
    if (billing === "success") {
      let cancelled = false;
      (async () => {
        for (let i = 0; i < 4 && !cancelled; i++) {
          try {
            const p = await api.profile.get();
            if (cancelled) return;
            setProfile(p);
            if (p?.isPro) return;
          } catch {}
          await new Promise((r) => setTimeout(r, 1000));
        }
      })();
      return () => { cancelled = true; };
    }
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
        ? <SettingsScreen onClose={() => setShowSettings(false)} profile={profile} email={session?.user?.email ?? ""} onProfileChanged={setProfile} />
        : <Shell onOpenSettings={() => setShowSettings(true)} isPro={!!profile?.isPro} profile={profile} currentUserId={session?.user?.id} onProfileChanged={setProfile} />}
      {viewUsername && (
        <ProfileScreen
          username={viewUsername}
          currentUserId={session?.user?.id}
          onClose={() => setViewUsername(null)}
          onOpenProfile={setViewUsername}
          onProfileChanged={setProfile}
        />
      )}
      {upgrade && <UpgradeModal cap={upgrade.cap} onClose={() => setUpgrade(null)} />}
    </StoreProvider>
  );
}

function Splash() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-white">
      <div className="text-slate-400 text-sm">Carregando…</div>
    </div>
  );
}
