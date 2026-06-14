import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../components/Icon.jsx";
import PostCard, { Avatar } from "../components/PostCard.jsx";
import ComposePostSheet from "../components/ComposePostSheet.jsx";
import UserSearchSheet from "../components/UserSearchSheet.jsx";
import SocialProfileEditor from "../components/SocialProfileEditor.jsx";
import { api } from "../lib/api.js";
import { useStore } from "../state/store.jsx";

const PAGE = 20;

/** The social feed: reverse-chronological posts of people I follow (+ my own). */
export default function FeedScreen({ profile, currentUserId, onProfileChanged }) {
  const { showToast } = useStore() ?? {};
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [composing, setComposing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [needUsername, setNeedUsername] = useState(false);
  const scrollRef = useRef(null);
  const loadingRef = useRef(false);

  const openProfile = (u) => window.dispatchEvent(new CustomEvent("nutri:open-profile", { detail: u }));

  const loadMore = useCallback(async (reset = false) => {
    if (loadingRef.current) return;
    if (!reset && done) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const last = reset ? null : posts[posts.length - 1];
      const page = await api.feed.list({
        before: last?.createdAt,
        beforeId: last?.id,
        limit: PAGE,
      });
      setPosts((prev) => (reset ? page : [...prev, ...page]));
      if (page.length < PAGE) setDone(true);
    } catch (e) {
      showToast?.(e.message || "Erro ao carregar o feed", "error");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [posts, done, showToast]);

  useEffect(() => { loadMore(true); /* first page */ }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  function onScroll() {
    const el = scrollRef.current;
    if (!el || loadingRef.current || done) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) loadMore();
  }

  function compose() {
    if (!profile?.username) { setNeedUsername(true); return; }
    setComposing(true);
  }

  function onCreated(post) {
    setComposing(false);
    setPosts((prev) => [post, ...prev]);
    showToast?.("Post publicado");
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="shrink-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900">Feed</h1>
        <div className="flex items-center gap-1">
          <button onClick={() => setSearching(true)} className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-600"><Icon name="search" className="w-5 h-5" /></button>
          {profile?.username && (
            <button onClick={() => openProfile(profile.username)} className="ml-1"><Avatar url={profile.avatarUrl} name={profile.displayName || profile.username} size="w-8 h-8" /></button>
          )}
        </div>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto scroll-hide px-3 py-3 space-y-3">
        {posts.map((p) => (
          <PostCard key={p.id} post={p} currentUserId={currentUserId} onOpenProfile={openProfile} onDeleted={(id) => setPosts((ps) => ps.filter((x) => x.id !== id))} />
        ))}
        {loading && <div className="py-6 text-center text-slate-400 text-sm">Carregando…</div>}
        {!loading && posts.length === 0 && (
          <div className="py-16 text-center text-slate-400 text-sm px-6">
            Seu feed está vazio. Busque <button onClick={() => setSearching(true)} className="text-emerald-600 font-semibold">pessoas para seguir</button> ou publique algo.
          </div>
        )}
      </div>

      <button onClick={compose} className="absolute right-4 bottom-24 w-14 h-14 rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-500/40 flex items-center justify-center"><Icon name="plus" className="w-6 h-6" /></button>

      {composing && <ComposePostSheet onClose={() => setComposing(false)} onCreated={onCreated} />}
      {searching && <UserSearchSheet onClose={() => setSearching(false)} onOpenProfile={(u) => { setSearching(false); openProfile(u); }} />}
      {needUsername && (
        <SocialProfileEditor
          profile={profile}
          onClose={() => setNeedUsername(false)}
          onSaved={(updated) => { setNeedUsername(false); onProfileChanged?.(updated); setComposing(true); }}
        />
      )}
    </div>
  );
}
