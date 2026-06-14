import { useState } from "react";
import Icon from "./Icon.jsx";
import RecipeSnapshotCard from "./RecipeSnapshotCard.jsx";
import { api } from "../lib/api.js";
import { useStore } from "../state/store.jsx";

/** Avatar with an initials fallback when there's no avatar_url. */
export function Avatar({ url, name, size = "w-9 h-9" }) {
  const initials = (name || "?").trim().slice(0, 1).toUpperCase();
  if (url) return <img src={url} alt="" className={`${size} rounded-full object-cover bg-slate-100`} />;
  return (
    <div className={`${size} rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm`}>
      {initials}
    </div>
  );
}

export default function PostCard({ post, currentUserId, onOpenProfile, onDeleted }) {
  const { showToast, refreshProdutos, refreshComidas } = useStore();
  const [liked, setLiked] = useState(!!post.liked);
  const [likeCount, setLikeCount] = useState(post.likeCount || 0);
  const [saving, setSaving] = useState(false);
  const a = post.author || {};
  const isOwn = currentUserId && a.userId === currentUserId;
  const displayName = a.displayName || a.username || "Usuário";

  async function toggleLike() {
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    try {
      if (next) await api.feed.like(post.id);
      else await api.feed.unlike(post.id);
    } catch {
      setLiked(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await api.feed.save(post.id);
      showToast(`Salvo na sua conta: ${res?.name || "receita"}`);
      // The save may have created produtos/comidas — refresh the cached lists.
      refreshProdutos?.(); refreshComidas?.();
    } catch (e) {
      showToast(e.message || "Não foi possível salvar", "error");
    } finally { setSaving(false); }
  }

  async function remove() {
    try { await api.feed.remove(post.id); onDeleted?.(post.id); }
    catch (e) { showToast(e.message || "Erro ao excluir", "error"); }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button onClick={() => a.username && onOpenProfile?.(a.username)} className="flex items-center gap-2 min-w-0">
          <Avatar url={a.avatarUrl} name={displayName} />
          <div className="min-w-0 text-left">
            <div className="font-semibold text-slate-800 text-sm truncate">{displayName}</div>
            {a.username && <div className="text-[11px] text-slate-400 truncate">@{a.username}</div>}
          </div>
        </button>
        <div className="flex-1" />
        {isOwn && (
          <button onClick={remove} className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-red-500">
            <Icon name="trash" className="w-4 h-4" />
          </button>
        )}
      </div>

      {post.imageUrl && (
        <img src={post.imageUrl} alt="" className="w-full max-h-96 object-cover bg-slate-100" loading="lazy" />
      )}

      <div className="px-3 pt-2 pb-3">
        {post.caption && <p className="text-sm text-slate-700 whitespace-pre-wrap">{post.caption}</p>}
        <RecipeSnapshotCard refType={post.refType} snapshot={post.snapshot} />

        <div className="flex items-center gap-1 mt-3">
          <button onClick={toggleLike} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-sm font-semibold ${liked ? "text-red-500 bg-red-50" : "text-slate-500 hover:bg-slate-50"}`}>
            <Icon name="heart" className="w-4 h-4" />
            {likeCount > 0 && <span>{likeCount}</span>}
          </button>
          <div className="flex-1" />
          {post.refType && post.snapshot && !isOwn && (
            <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-emerald-500 text-white disabled:bg-slate-200">
              <Icon name="bookmark" className="w-4 h-4" /> {saving ? "Salvando…" : "Salvar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
