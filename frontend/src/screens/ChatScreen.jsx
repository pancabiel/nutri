import { useEffect, useRef, useState } from "react";
import Icon from "../components/Icon.jsx";
import { api, pickPhoto } from "../lib/api.js";

const SUGGESTIONS = ["2 ovos e aquele sanduíche", "arroz com feijão e frango", "café com leite e banana"];

export default function ChatScreen({ onOpenDay }) {
  const [msgs, setMsgs] = useState([
    { id: rid(), from: "ai", text: "Olá! Me conte o que você comeu, tire uma foto do prato ou escaneie uma tabela nutricional.", kind: "welcome" }
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef();

  useEffect(() => { scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }); }, [msgs, typing]);

  const send = async (text) => {
    const t = text.trim();
    if (!t) return;
    setMsgs(m => [...m, { id: rid(), from: "user", text: t }]);
    setInput("");
    setTyping(true);
    try {
      const result = await api.chat(t, null, null);
      setMsgs(m => [...m, { id: rid(), from: "ai", kind: "result", result }]);
    } catch (e) {
      setMsgs(m => [...m, { id: rid(), from: "ai", text: "Não consegui falar com o servidor. Tente novamente." }]);
    } finally { setTyping(false); }
  };

  const onCamera = async () => {
    const picked = await pickPhoto();
    if (!picked) return;
    const { b64, mime } = picked;
    setMsgs(m => [...m, { id: rid(), from: "user", kind: "photo", text: "📷 Foto do prato" }]);
    setTyping(true);
    try {
      const result = await api.analyzeMeal(b64, mime);
      if (!result.parsed || result.parsed.length === 0) {
        setMsgs(m => [...m, { id: rid(), from: "ai", text: "Não consegui identificar nenhum alimento na foto. Tente uma foto mais nítida ou com melhor iluminação." }]);
        return;
      }
      setMsgs(m => [...m, { id: rid(), from: "ai", kind: "result", result }]);
    } catch (e) {
      console.error("analyzeMeal failed", e);
      setMsgs(m => [...m, { id: rid(), from: "ai", text: `Erro ao analisar a foto: ${e.message || e}. Verifique se o servidor está rodando.` }]);
    } finally { setTyping(false); }
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-emerald-50 via-white to-white">
      <div className="px-5 pt-[max(env(safe-area-inset-top),12px)] pb-2 flex items-center justify-between shrink-0">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-emerald-600 font-semibold">Nutri AI</div>
          <h1 className="text-[22px] font-bold text-slate-900 leading-tight">Bom dia</h1>
        </div>
        <button onClick={onOpenDay} className="h-10 px-3 rounded-full bg-white border border-slate-200 text-sm font-semibold text-slate-700 shadow-sm flex items-center gap-1.5">
          <Icon name="flame" className="w-4 h-4 text-orange-500" /> Hoje
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-3 space-y-3 scroll-hide">
        {msgs.map(m => m.from === "user" ? (
          <div key={m.id} className="flex justify-end fade-in">
            <div className={`max-w-[78%] rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] shadow-sm ${m.kind === "photo" ? "bg-slate-900 text-white" : "bg-emerald-500 text-white"}`}>{m.text}</div>
          </div>
        ) : <AiMessage key={m.id} msg={m} />)}
        {typing && <Typing />}
      </div>

      {msgs.length <= 1 && (
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto scroll-hide shrink-0">
          {SUGGESTIONS.map(s => (
            <button key={s} onClick={() => send(s)} className="shrink-0 text-xs px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600 shadow-sm">{s}</button>
          ))}
        </div>
      )}

      <div className="shrink-0 px-3 pt-2 pb-2 bg-white/70 backdrop-blur border-t border-slate-200">
        <div className="flex items-center gap-2">
          <button onClick={onCamera} className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center"><Icon name="camera"/></button>
          <div className="flex-1 flex items-center bg-slate-100 rounded-full pl-4 pr-1 h-10">
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send(input)}
                   placeholder="O que você comeu?" className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-slate-400" />
            <button onClick={() => send(input)} disabled={!input.trim()} className="w-8 h-8 rounded-full bg-emerald-500 disabled:bg-slate-300 text-white flex items-center justify-center"><Icon name="send" className="w-4 h-4"/></button>
          </div>
        </div>
      </div>

    </div>
  );
}

function AiMessage({ msg }) {
  if (msg.kind === "result") {
    const { parsed, totals, section, saved } = msg.result;
    return (
      <div className="flex fade-in">
        <div className="max-w-[90%] w-full bg-white border border-slate-200 rounded-2xl rounded-bl-md shadow-sm overflow-hidden">
          <div className="px-4 pt-3 pb-2 flex items-center gap-2 text-emerald-600 text-xs font-semibold">
            <Icon name="sparkles" className="w-4 h-4" /> Identifiquei {parsed.length} {parsed.length === 1 ? "item" : "itens"}
          </div>
          <div className="px-2 pb-2 space-y-1">
            {parsed.map((it, i) => (
              <div key={i} className="flex items-start gap-3 px-2 py-2 rounded-xl">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${it.type === "comida" ? "bg-amber-100" : "bg-emerald-100"}`}>{it.type === "comida" ? "🍽️" : "🥚"}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-semibold text-slate-900 text-[15px] truncate">{it.name}</div>
                    <div className="text-xs text-slate-500 shrink-0">{it.quantity}× · {Math.round(it.estimated_grams || 0)}g</div>
                  </div>
                  <div className="flex items-center gap-3 text-[12px] mt-0.5">
                    <span className="text-orange-600 font-semibold">{it.calories} kcal</span>
                    <span className="text-violet-600 font-semibold">{it.protein}g prot</span>
                    {it.matched_id ? (
                      <span className="text-emerald-600 inline-flex items-center gap-1"><Icon name="check" className="w-3 h-3"/>reconhecido</span>
                    ) : <span className="text-slate-400">novo</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-3">
            <div className="text-[13px]"><span className="text-slate-500">Total: </span><span className="font-bold text-slate-900">{totals.calories} kcal</span><span className="text-slate-400"> · </span><span className="font-bold text-slate-900">{totals.protein}g</span></div>
            {saved && saved.length > 0
              ? <span className="text-emerald-600 font-semibold text-sm inline-flex items-center gap-1"><Icon name="check" className="w-4 h-4"/>Salvo em {section}</span>
              : <span className="text-slate-400 text-xs">{msg.fromPhoto ? "abra a Agenda para salvar" : ""}</span>}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex fade-in">
      <div className="max-w-[85%] bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-2.5 text-[15px] text-slate-700 shadow-sm">{msg.text}</div>
    </div>
  );
}

function Typing() {
  return (
    <div className="flex fade-in">
      <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm flex gap-1">
        <span className="typing-dot w-1.5 h-1.5 bg-slate-400 rounded-full"></span>
        <span className="typing-dot w-1.5 h-1.5 bg-slate-400 rounded-full"></span>
        <span className="typing-dot w-1.5 h-1.5 bg-slate-400 rounded-full"></span>
      </div>
    </div>
  );
}

function rid() { return Math.random().toString(36).slice(2, 10); }
