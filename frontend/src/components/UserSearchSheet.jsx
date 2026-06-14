import { useEffect, useState } from "react";
import Sheet from "./Sheet.jsx";
import { Avatar } from "./PostCard.jsx";
import { api } from "../lib/api.js";
import { useStore } from "../state/store.jsx";

/** Search people by @username and follow them, or open their profile. */
export default function UserSearchSheet({ onClose, onOpenProfile }) {
  const { showToast } = useStore() ?? {};
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults([]); return; }
    const t = setTimeout(async () => {
      try { setResults(await api.social.searchUsers(term)); } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function toggle(u) {
    setBusyId(u.userId);
    try {
      const updated = u.isFollowing ? await api.social.unfollow(u.userId) : await api.social.follow(u.userId);
      setResults((rs) => rs.map((r) => (r.userId === u.userId ? updated : r)));
    } catch (e) { showToast?.(e.message || "Erro", "error"); }
    finally { setBusyId(null); }
  }

  return (
    <Sheet onClose={onClose} title="Buscar pessoas">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="@username" className="w-full mb-3 bg-slate-100 rounded-xl px-4 py-2.5 outline-none" />
      <div className="max-h-80 overflow-y-auto scroll-hide space-y-1">
        {results.map((u) => (
          <div key={u.userId} className="flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-slate-50">
            <button onClick={() => onOpenProfile?.(u.username)} className="flex items-center gap-2 min-w-0 flex-1">
              <Avatar url={u.avatarUrl} name={u.displayName || u.username} />
              <div className="min-w-0 text-left">
                <div className="font-semibold text-slate-800 text-sm truncate">{u.displayName || u.username}</div>
                <div className="text-[11px] text-slate-400 truncate">@{u.username}</div>
              </div>
            </button>
            {!u.isSelf && (
              <button onClick={() => toggle(u)} disabled={busyId === u.userId} className={`px-3 py-1.5 rounded-full text-xs font-semibold disabled:opacity-60 ${u.isFollowing ? "bg-slate-100 text-slate-700" : "bg-emerald-500 text-white"}`}>
                {u.isFollowing ? "Seguindo" : "Seguir"}
              </button>
            )}
          </div>
        ))}
        {q.trim() && results.length === 0 && <div className="py-8 text-center text-slate-400 text-sm">Nenhum usuário encontrado.</div>}
      </div>
    </Sheet>
  );
}
