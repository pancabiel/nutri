import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import Sheet from "./Sheet.jsx";
import PostCard, { Avatar } from "./PostCard.jsx";
import SocialProfileEditor from "./SocialProfileEditor.jsx";
import FollowListSheet from "./FollowListSheet.jsx";
import { api } from "../lib/api.js";
import { useStore } from "../state/store.jsx";

/**
 * A user's public profile + their posts (visible only if I follow them or it's me).
 * Follow/unfollow lives here; for my own profile, edit identity + copy invite link.
 */
export default function ProfileScreen({ username, currentUserId, onClose, onOpenProfile, onProfileChanged }) {
  const { showToast } = useStore() ?? {};
  const [data, setData] = useState(null);   // { profile, posts }
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followSheet, setFollowSheet] = useState(null); // { mode: "followers"|"following", title } | null

  async function load() {
    setNotFound(false);
    try { setData(await api.social.getProfile(username)); }
    catch (e) { if (e.status === 404) setNotFound(true); else showToast?.(e.message || "Erro", "error"); }
  }
  useEffect(() => { load(); }, [username]);

  const profile = data?.profile;

  async function toggleFollow() {
    if (!profile) return;
    setFollowBusy(true);
    try {
      const updated = profile.isFollowing
        ? await api.social.unfollow(profile.userId)
        : await api.social.follow(profile.userId);
      // Re-load so newly-visible posts appear after a follow.
      setData((d) => ({ ...d, profile: updated }));
      load();
    } catch (e) { showToast?.(e.message || "Erro", "error"); }
    finally { setFollowBusy(false); }
  }

  function copyInvite() {
    const url = `${window.location.origin}/?u=${profile.username}`;
    navigator.clipboard?.writeText(url).then(
      () => showToast?.("Link copiado"),
      () => showToast?.(url),
    );
  }

  return (
    <Sheet fullScreen title="Perfil" onClose={onClose}>
      {notFound ? (
        <div className="py-16 text-center text-slate-400">Usuário não encontrado.</div>
      ) : !profile ? (
        <div className="py-16 text-center text-slate-400">Carregando…</div>
      ) : (
        <>
          <div className="flex flex-col items-center text-center mb-4">
            <Avatar url={profile.avatarUrl} name={profile.displayName || profile.username} size="w-20 h-20" />
            <div className="mt-2 font-bold text-lg text-slate-900">{profile.displayName || profile.username}</div>
            <div className="text-sm text-slate-400">@{profile.username}</div>
            {profile.bio && <p className="text-sm text-slate-600 mt-2 max-w-xs">{profile.bio}</p>}
            <div className="flex gap-6 mt-3 text-sm">
              <button onClick={() => setFollowSheet({ mode: "followers", title: "Seguidores" })} className="hover:opacity-70">
                <span className="font-bold text-slate-900">{profile.followers}</span> <span className="text-slate-400">seguidores</span>
              </button>
              <button onClick={() => setFollowSheet({ mode: "following", title: "Seguindo" })} className="hover:opacity-70">
                <span className="font-bold text-slate-900">{profile.following}</span> <span className="text-slate-400">seguindo</span>
              </button>
            </div>

            {profile.isSelf ? (
              <div className="flex gap-2 mt-4">
                <button onClick={() => setEditing(true)} className="px-4 py-2 rounded-full bg-slate-100 text-slate-700 font-semibold text-sm flex items-center gap-1.5"><Icon name="edit" className="w-4 h-4" /> Editar</button>
                <button onClick={copyInvite} className="px-4 py-2 rounded-full bg-slate-100 text-slate-700 font-semibold text-sm flex items-center gap-1.5"><Icon name="link" className="w-4 h-4" /> Convite</button>
              </div>
            ) : (
              <button onClick={toggleFollow} disabled={followBusy} className={`mt-4 px-6 py-2 rounded-full font-semibold text-sm disabled:opacity-60 ${profile.isFollowing ? "bg-slate-100 text-slate-700" : "bg-emerald-500 text-white"}`}>
                {profile.isFollowing ? "Seguindo" : "Seguir"}
              </button>
            )}
          </div>

          <div className="space-y-3">
            {data.posts?.length ? data.posts.map((p) => (
              <PostCard key={p.id} post={p} currentUserId={currentUserId} onOpenProfile={onOpenProfile} onDeleted={() => load()} />
            )) : (
              <div className="py-10 text-center text-slate-400 text-sm">
                {profile.isSelf || profile.isFollowing ? "Nenhum post ainda." : "Siga para ver os posts."}
              </div>
            )}
          </div>
        </>
      )}

      {editing && (
        <SocialProfileEditor
          profile={profile}
          onClose={() => setEditing(false)}
          onSaved={(updated) => { setEditing(false); onProfileChanged?.(updated); load(); }}
        />
      )}

      {followSheet && profile && (
        <FollowListSheet
          userId={profile.userId}
          mode={followSheet.mode}
          title={followSheet.title}
          onClose={() => setFollowSheet(null)}
          onOpenProfile={(u) => { setFollowSheet(null); onOpenProfile?.(u); }}
        />
      )}
    </Sheet>
  );
}
