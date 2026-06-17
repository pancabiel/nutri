import { useEffect, useState } from "react";
import Sheet from "./Sheet.jsx";
import { Avatar } from "./PostCard.jsx";
import { SkeletonRows } from "./Skeleton.jsx";
import { api } from "../lib/api.js";
import { useStore } from "../state/store.jsx";

/**
 * List of a user's followers ("seguidores") or who they follow ("seguindo").
 * Each row opens that user's profile or toggles follow. `mode` is "followers" | "following".
 */
export default function FollowListSheet({ userId, mode, title, onClose, onOpenProfile }) {
  const { showToast } = useStore() ?? {};
  const [list, setList] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = mode === "followers"
          ? await api.social.followers(userId)
          : await api.social.following(userId);
        if (alive) setList(data);
      } catch (e) {
        if (alive) { setList([]); showToast?.(e.message || "Erro", "error"); }
      }
    })();
    return () => { alive = false; };
  }, [userId, mode]);

  async function toggle(u) {
    setBusyId(u.userId);
    try {
      const updated = u.isFollowing ? await api.social.unfollow(u.userId) : await api.social.follow(u.userId);
      setList((rs) => rs.map((r) => (r.userId === u.userId ? updated : r)));
    } catch (e) { showToast?.(e.message || "Erro", "error"); }
    finally { setBusyId(null); }
  }

  return (
    <Sheet onClose={onClose} title={title}>
      <div className="max-h-[70vh] overflow-y-auto scroll-hide space-y-1">
        {list === null ? (
          <SkeletonRows rows={6} />
        ) : list.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">
            {mode === "followers" ? "Nenhum seguidor ainda." : "Ainda não está seguindo ninguém."}
          </div>
        ) : list.map((u) => (
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
      </div>
    </Sheet>
  );
}
