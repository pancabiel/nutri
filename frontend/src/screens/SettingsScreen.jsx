import { useEffect, useState } from "react";
import Icon from "../components/Icon.jsx";
import { api } from "../lib/api.js";
import { supabase } from "../lib/supabase.js";
import { getTheme, setTheme } from "../lib/theme.js";
import SocialProfileEditor from "../components/SocialProfileEditor.jsx";
import { Avatar } from "../components/PostCard.jsx";
import { useStore } from "../state/store.jsx";
import {
  isPushSupported, isStandalone, getPermission, isSubscribed,
  subscribe as pushSubscribe, unsubscribe as pushUnsubscribe, hasVapidKey,
} from "../lib/push.js";

const CANONICAL_SECTIONS = ["Café da manhã", "Almoço", "Lanche", "Jantar"];

export default function SettingsScreen({ onClose, profile: profileProp, email: emailProp = "", onProfileChanged }) {
  const [profile, setProfile] = useState(profileProp ?? null);
  const [editingSocial, setEditingSocial] = useState(false);
  const [email, setEmail] = useState(emailProp);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState("idle"); // idle | confirming | deleting
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState("");
  const [dark, setDark] = useState(getTheme() === "dark");

  const { showToast } = useStore() ?? {};

  // ----- Default meal sections (diary template) -----
  const [secList, setSecList] = useState(null);       // editable draft
  const [secBaseline, setSecBaseline] = useState(null); // last persisted (for dirty check)
  const [secBusy, setSecBusy] = useState(false);

  // ----- Reminders (push) state -----
  const [prefs, setPrefs] = useState(null);
  const [pushSupported, setPushSupported] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [permission, setPermission] = useState("default");
  const [subscribed, setSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    (async () => {
      // Fall back to fetching the user only if the parent didn't have it ready.
      if (!emailProp) {
        const { data } = await supabase.auth.getUser();
        setEmail(data.user?.email ?? "");
      }
      if (!profileProp) {
        try { setProfile(await api.profile.get()); } catch {}
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const sup = isPushSupported();
      setPushSupported(sup);
      setStandalone(isStandalone());
      setPermission(getPermission());
      if (sup) setSubscribed(await isSubscribed());
      try { setPrefs(await api.push.getPrefs()); } catch {}
    })();
  }, []);

  function setField(key, value) {
    setPrefs((p) => ({ ...(p || {}), [key]: value }));
  }

  async function enableNotifications() {
    setPushBusy(true);
    try {
      const res = await pushSubscribe();
      setPermission(res.permission || getPermission());
      if (res.ok) {
        setSubscribed(true);
        setField("enabled", true);
        showToast?.("Notificações ativadas");
      } else if (res.error === "no-vapid-key") {
        showToast?.("Push não configurado neste ambiente");
      } else if (res.permission === "denied") {
        showToast?.("Permissão negada");
      }
    } catch (e) {
      console.error("enable notifications failed", e);
      showToast?.("Não consegui ativar agora");
    } finally {
      setPushBusy(false);
    }
  }

  async function disableNotifications() {
    setPushBusy(true);
    try {
      await pushUnsubscribe();
      setSubscribed(false);
      setField("enabled", false);
      try { await api.push.setPrefs({ ...(prefs || {}), enabled: false }); } catch {}
      showToast?.("Notificações desativadas");
    } finally {
      setPushBusy(false);
    }
  }

  async function savePrefs() {
    if (!prefs) return;
    setSavingPrefs(true);
    try {
      const saved = await api.push.setPrefs(prefs);
      setPrefs(saved);
      showToast?.("Lembretes salvos");
    } catch (e) {
      console.error("save prefs failed", e);
      showToast?.("Falha ao salvar");
    } finally {
      setSavingPrefs(false);
    }
  }

  // Seed the section editor from the profile once it's available (and re-sync after saves).
  useEffect(() => {
    if (!profile) return;
    const init = profile.defaultSections?.length ? profile.defaultSections : CANONICAL_SECTIONS;
    setSecList(init);
    setSecBaseline(init);
  }, [profile]);

  const secDirty = secList && secBaseline && JSON.stringify(secList) !== JSON.stringify(secBaseline);

  function secMove(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= secList.length) return;
    const next = [...secList];
    [next[i], next[j]] = [next[j], next[i]];
    setSecList(next);
  }
  function secRemove(i) { setSecList(secList.filter((_, k) => k !== i)); }
  function secAdd(name) {
    const v = (name || "").trim();
    if (!v || secList.some((s) => s.toLowerCase() === v.toLowerCase())) return;
    setSecList([...secList, v]);
  }
  async function secSave() {
    if (!secList.length) { showToast?.("Adicione ao menos uma seção"); return; }
    setSecBusy(true);
    try {
      const updated = await api.profile.setDefaultSections(secList);
      setProfile(updated);
      onProfileChanged?.(updated);
      showToast?.("Seções padrão salvas");
    } catch {
      showToast?.("Falha ao salvar");
    } finally {
      setSecBusy(false);
    }
  }

  // Keep email in sync if it arrives after first render.
  useEffect(() => { if (emailProp) setEmail(emailProp); }, [emailProp]);

  // Keep local copy in sync if parent refreshes after Stripe return.
  useEffect(() => { if (profileProp) setProfile(profileProp); }, [profileProp]);

  function openUpgrade() {
    window.dispatchEvent(new CustomEvent("nutri:open-upgrade"));
  }

  async function openPortal() {
    setPortalBusy(true);
    setPortalError("");
    try {
      const { url } = await api.billing.portal();
      window.location.assign(url);
    } catch (e) {
      console.error("portal failed", e);
      setPortalError("Não consegui abrir o portal. Tente de novo em alguns segundos.");
      setPortalBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.reload();
  }

  async function deleteAccount() {
    if (confirm.trim().toUpperCase() !== "EXCLUIR") {
      setError("Digite EXCLUIR pra confirmar.");
      return;
    }
    setError("");
    setBusy(true);
    setStage("deleting");
    try {
      await api.account.delete();
      await supabase.auth.signOut();
      window.location.reload();
    } catch (e) {
      setError("Falha ao excluir. Tente novamente.");
      setBusy(false);
      setStage("confirming");
    }
  }

  return (
    <div className="h-full w-full flex flex-col bg-white">
      <header className="shrink-0 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 border-b border-slate-100">
        <div className="w-full max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={onClose} className="text-slate-500 text-sm">‹ Voltar</button>
          <h1 className="text-base font-semibold text-slate-900">Configurações</h1>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-[max(env(safe-area-inset-bottom),24px)]">
        <div className="w-full max-w-2xl mx-auto flex flex-col gap-6">
        <section>
          <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Conta</div>
          <div className="rounded-xl border border-slate-200 bg-white">
            <Row label="Email" value={email || "—"} />
          </div>
        </section>

        <section>
          <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Perfil público</div>
          <button
            onClick={() => setEditingSocial(true)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-3 text-left"
          >
            <Avatar url={profile?.avatarUrl} name={profile?.displayName || profile?.username || email} />
            <div className="flex-1 min-w-0">
              {profile?.username ? (
                <>
                  <div className="font-semibold text-slate-800 truncate">{profile.displayName || profile.username}</div>
                  <div className="text-[12px] text-slate-400 truncate">@{profile.username}</div>
                </>
              ) : (
                <>
                  <div className="font-semibold text-slate-800">Criar perfil público</div>
                  <div className="text-[12px] text-slate-400">Escolha um @username para usar o Feed</div>
                </>
              )}
            </div>
            <Icon name="chevronR" className="w-4 h-4 text-slate-400" />
          </button>
        </section>

        <section>
          <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Aparência</div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <Toggle
              label="Modo escuro"
              checked={dark}
              onChange={(v) => { setDark(v); setTheme(v ? "dark" : "light"); }}
            />
          </div>
        </section>

        <section>
          <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Plano</div>
          {profile?.isPro ? (
            <div className="rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-50 to-white p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon name="crown" className="w-5 h-5 text-emerald-600" />
                <span className="font-bold text-emerald-700">Nutri Pro ativo</span>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                {proSubLabel(profile)}
              </p>
              {portalError && (
                <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 mb-3">
                  {portalError}
                </div>
              )}
              <button
                onClick={openPortal}
                disabled={portalBusy}
                className="w-full rounded-xl bg-white border border-emerald-300 text-emerald-700 font-medium py-3 disabled:opacity-60"
              >
                {portalBusy ? "Abrindo…" : "Gerenciar assinatura"}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon name="lock" className="w-4 h-4 text-slate-400" />
                <span className="font-semibold text-slate-700">Plano Gratuito</span>
              </div>
              <p className="text-sm text-slate-500 mb-3">
                Você tem 3 mensagens, 1 foto e 1 scan de rótulo no total. Assine o Pro pra liberar 20 chats / 10 fotos / 10 scans por dia.
              </p>
              <button
                onClick={openUpgrade}
                className="w-full rounded-xl bg-emerald-500 text-white font-semibold py-3 inline-flex items-center justify-center gap-2"
              >
                <Icon name="sparkles" className="w-4 h-4" /> Assinar Nutri Pro
              </button>
            </div>
          )}
        </section>

        <section>
          <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Lembretes</div>
          <RemindersSection
            supported={pushSupported}
            standalone={standalone}
            permission={permission}
            subscribed={subscribed}
            busy={pushBusy}
            saving={savingPrefs}
            prefs={prefs}
            setField={setField}
            onEnable={enableNotifications}
            onDisable={disableNotifications}
            onSave={savePrefs}
            hasKey={hasVapidKey()}
          />
        </section>

        <section>
          <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Seções do diário</div>
          <DefaultSectionsSection
            list={secList}
            dirty={secDirty}
            busy={secBusy}
            onMove={secMove}
            onRemove={secRemove}
            onAdd={secAdd}
            onReset={() => setSecList(CANONICAL_SECTIONS)}
            onSave={secSave}
          />
        </section>

        {profile?.onboardingComplete && (
          <section>
            <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Metas</div>
            <div className="rounded-xl border border-slate-200 bg-white">
              <Row label="Calorias/dia" value={profile.calorieGoal ? `${profile.calorieGoal} kcal` : "—"} />
              <Row label="Proteína/dia" value={profile.proteinGoal ? `${profile.proteinGoal} g` : "—"} />
              <Row label="Peso atual" value={profile.weightKg ? `${profile.weightKg} kg` : "—"} />
              <Row label="Peso meta" value={profile.targetWeightKg ? `${profile.targetWeightKg} kg` : "—"} />
            </div>
          </section>
        )}

        <section>
          <button
            onClick={signOut}
            className="w-full rounded-xl border border-slate-200 bg-white text-slate-700 font-medium py-3"
          >
            Sair
          </button>
        </section>

        <section className="pt-2">
          <div className="text-xs uppercase tracking-wide text-rose-500 mb-2">Zona de risco</div>
          {stage === "idle" && (
            <button
              onClick={() => setStage("confirming")}
              className="w-full rounded-xl border border-rose-200 bg-white text-rose-600 font-medium py-3"
            >
              Excluir minha conta
            </button>
          )}
          {stage !== "idle" && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 flex flex-col gap-3">
              <p className="text-sm text-rose-800 leading-relaxed">
                Isso vai apagar permanentemente sua conta, suas refeições, produtos e comidas.
                Não dá pra desfazer.
              </p>
              <input
                type="text"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Digite EXCLUIR"
                className="w-full rounded-xl border border-rose-300 px-4 py-3 text-base bg-white"
              />
              {error && <div className="text-sm text-rose-700">{error}</div>}
              <div className="flex gap-2">
                <button
                  onClick={() => { setStage("idle"); setConfirm(""); setError(""); }}
                  disabled={busy}
                  className="flex-1 rounded-xl border border-slate-200 bg-white text-slate-700 py-3 font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={deleteAccount}
                  disabled={busy}
                  className="flex-1 rounded-xl bg-rose-600 text-white py-3 font-medium disabled:opacity-50"
                >
                  {busy ? "Excluindo..." : "Confirmar exclusão"}
                </button>
              </div>
            </div>
          )}
        </section>
        </div>
      </div>

      {editingSocial && (
        <SocialProfileEditor
          profile={profile}
          onClose={() => setEditingSocial(false)}
          onSaved={(updated) => { setEditingSocial(false); setProfile(updated); onProfileChanged?.(updated); }}
        />
      )}
    </div>
  );
}

function DefaultSectionsSection({ list, dirty, busy, onMove, onRemove, onAdd, onReset, onSave }) {
  const [draft, setDraft] = useState("");
  if (!list) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-400">Carregando…</div>;
  }
  const isDefault = JSON.stringify(list) === JSON.stringify(CANONICAL_SECTIONS);
  function submitAdd() { onAdd(draft); setDraft(""); }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-500">
        Estas são as seções que cada novo dia começa. Reordene, renomeie ou remova — vale só para os dias criados a partir de agora.
      </p>
      <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
        {list.length === 0 && (
          <div className="px-4 py-3 text-sm text-slate-400">Nenhuma seção. Adicione abaixo.</div>
        )}
        {list.map((name, i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-2">
            <div className="flex flex-col">
              <button onClick={() => onMove(i, -1)} disabled={i === 0} className="w-6 h-5 text-slate-400 enabled:hover:text-slate-700 disabled:opacity-30 flex items-center justify-center" aria-label="Mover para cima"><Icon name="chevronUp" className="w-4 h-4" /></button>
              <button onClick={() => onMove(i, 1)} disabled={i === list.length - 1} className="w-6 h-5 text-slate-400 enabled:hover:text-slate-700 disabled:opacity-30 flex items-center justify-center" aria-label="Mover para baixo"><Icon name="chevronDown" className="w-4 h-4" /></button>
            </div>
            <span className="flex-1 min-w-0 text-sm font-medium text-slate-800 truncate">{name}</span>
            <button onClick={() => onRemove(i)} className="w-8 h-8 rounded-full hover:bg-rose-50 text-rose-500 flex items-center justify-center" aria-label="Remover"><Icon name="trash" className="w-4 h-4" /></button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitAdd(); } }}
          placeholder="Adicionar seção (ex: Ceia)"
          className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white"
        />
        <button onClick={submitAdd} disabled={!draft.trim()} className="shrink-0 rounded-xl bg-slate-100 text-slate-700 font-medium px-4 disabled:opacity-50">Adicionar</button>
      </div>

      <div className="flex items-center gap-2">
        {!isDefault && (
          <button onClick={onReset} className="text-sm text-slate-500 underline">Restaurar padrão</button>
        )}
        <div className="flex-1" />
        <button
          onClick={onSave}
          disabled={busy || !dirty || list.length === 0}
          className="rounded-xl bg-slate-900 text-white font-semibold px-5 py-2.5 disabled:opacity-40"
        >
          {busy ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}

const MEALS = [
  { label: "Café da manhã", enabledKey: "cafeEnabled",   timeKey: "cafeTime" },
  { label: "Almoço",        enabledKey: "almocoEnabled", timeKey: "almocoTime" },
  { label: "Lanche",        enabledKey: "lancheEnabled", timeKey: "lancheTime" },
  { label: "Jantar",        enabledKey: "jantarEnabled", timeKey: "jantarTime" },
];
const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"]; // bit0=Dom .. bit6=Sáb

function RemindersSection({
  supported, standalone, permission, subscribed, busy, saving,
  prefs, setField, onEnable, onDisable, onSave, hasKey,
}) {
  if (!supported) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Seu navegador não suporta notificações.
      </div>
    );
  }

  if (!standalone && !subscribed) {
    // Most likely iOS Safari (not installed). Push only works from the home-screen app.
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon name="bell" className="w-4 h-4 text-slate-400" />
          <span className="font-semibold text-slate-700">Instale o app pra receber lembretes</span>
        </div>
        <p className="text-sm text-slate-500">
          No iPhone, toque em <span className="font-medium">Compartilhar</span> →{" "}
          <span className="font-medium">Adicionar à Tela de Início</span> e abra o Nutri pelo ícone.
          Depois volte aqui pra ativar.
        </p>
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Notificações estão bloqueadas. Ative nas configurações do seu navegador/iOS para este app.
      </div>
    );
  }

  const active = subscribed && permission === "granted";

  return (
    <div className="flex flex-col gap-3">
      {!active ? (
        <div className="rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-50 to-white p-4">
          <div className="flex items-center gap-2 mb-1">
            <Icon name="bell" className="w-5 h-5 text-emerald-600" />
            <span className="font-bold text-emerald-700">Lembretes de refeição</span>
          </div>
          <p className="text-sm text-slate-600 mb-3">
            Receba um toque na hora de comer e registrar suas refeições.
          </p>
          <button
            onClick={onEnable}
            disabled={busy || !hasKey}
            className="w-full rounded-xl bg-emerald-500 text-white font-semibold py-3 disabled:opacity-60"
          >
            {busy ? "Ativando…" : "Ativar notificações"}
          </button>
          {!hasKey && (
            <p className="text-xs text-slate-400 mt-2">Push não está configurado neste ambiente.</p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-50 to-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon name="check" className="w-5 h-5 text-emerald-600" />
              <span className="font-bold text-emerald-700">Notificações ativas</span>
            </div>
            <button
              onClick={onDisable}
              disabled={busy}
              className="text-sm text-slate-500 underline disabled:opacity-60"
            >
              {busy ? "…" : "Desativar"}
            </button>
          </div>
        </div>
      )}

      {prefs && (
        <fieldset disabled={!active} className={active ? "" : "opacity-50 pointer-events-none"}>
          <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {MEALS.map((m) => (
              <MealRow
                key={m.enabledKey}
                label={m.label}
                enabled={!!prefs[m.enabledKey]}
                time={prefs[m.timeKey] || ""}
                onToggle={(v) => setField(m.enabledKey, v)}
                onTime={(v) => setField(m.timeKey, v)}
              />
            ))}
          </div>

          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-4">
            <div>
              <div className="text-sm font-medium text-slate-700 mb-2">Dias da semana</div>
              <div className="flex gap-1.5">
                {WEEKDAY_LABELS.map((lbl, i) => {
                  const on = ((prefs.weekdays ?? 127) & (1 << i)) !== 0;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setField("weekdays", (prefs.weekdays ?? 127) ^ (1 << i))}
                      className={
                        "w-9 h-9 rounded-full text-sm font-medium " +
                        (on ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400")
                      }
                    >
                      {lbl}
                    </button>
                  );
                })}
              </div>
            </div>

            <Toggle
              label="Só lembrar se ainda não registrei"
              checked={!!prefs.skipIfLogged}
              onChange={(v) => setField("skipIfLogged", v)}
            />

            <QuietHours prefs={prefs} setField={setField} />
          </div>

          <button
            onClick={onSave}
            disabled={saving || !active}
            className="mt-3 w-full rounded-xl bg-slate-900 text-white font-semibold py-3 disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Salvar lembretes"}
          </button>
        </fieldset>
      )}
    </div>
  );
}

function MealRow({ label, enabled, time, onToggle, onTime }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <Toggle checked={enabled} onChange={onToggle} />
        <span className="text-sm font-medium text-slate-800 truncate">{label}</span>
      </div>
      <input
        type="time"
        value={time}
        onChange={(e) => onTime(e.target.value)}
        disabled={!enabled}
        className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white disabled:opacity-40"
      />
    </div>
  );
}

function QuietHours({ prefs, setField }) {
  const on = !!(prefs.quietStart && prefs.quietEnd);
  return (
    <div>
      <Toggle
        label="Horário silencioso"
        checked={on}
        onChange={(v) => {
          if (v) { setField("quietStart", "22:00"); setField("quietEnd", "07:00"); }
          else { setField("quietStart", null); setField("quietEnd", null); }
        }}
      />
      {on && (
        <div className="flex items-center gap-2 mt-2 pl-1">
          <input
            type="time"
            value={prefs.quietStart || ""}
            onChange={(e) => setField("quietStart", e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white"
          />
          <span className="text-sm text-slate-400">até</span>
          <input
            type="time"
            value={prefs.quietEnd || ""}
            onChange={(e) => setField("quietEnd", e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white"
          />
        </div>
      )}
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  const btn = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors " +
        (checked ? "bg-emerald-500" : "bg-slate-300")
      }
    >
      <span
        className={
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform " +
          (checked ? "translate-x-5" : "translate-x-0.5")
        }
      />
    </button>
  );
  if (!label) return btn;
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm text-slate-700">{label}</span>
      {btn}
    </label>
  );
}

function proSubLabel(profile) {
  if (!profile?.proUntil) return "Sua assinatura está ativa.";
  const d = new Date(profile.proUntil);
  if (Number.isNaN(d.getTime())) return "Sua assinatura está ativa.";
  const fmt = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  if (profile.subscriptionStatus === "canceled" || d.getTime() <= Date.now()) {
    return `Acesso até ${fmt}.`;
  }
  return `Próxima cobrança em ${fmt}.`;
}
