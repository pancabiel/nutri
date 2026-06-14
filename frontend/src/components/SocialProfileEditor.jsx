import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import Sheet from "./Sheet.jsx";
import SaveButton from "./SaveButton.jsx";
import { Avatar } from "./PostCard.jsx";
import { api } from "../lib/api.js";
import { uploadImage } from "../lib/storage.js";
import { useStore } from "../state/store.jsx";

/**
 * Edit the public social identity (username / display name / bio / avatar). Shared by
 * the profile screen and Settings. Username is validated client-side (3–20 [a-z0-9_])
 * and the backend returns 409 if it's taken.
 */
export default function SocialProfileEditor({ profile, onClose, onSaved }) {
  const { showToast } = useStore() ?? {};
  const [username, setUsername] = useState(profile?.username || "");
  const [displayName, setDisplayName] = useState(profile?.displayName || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl || "");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const normalized = username.trim().toLowerCase();
  const usernameOk = /^[a-z0-9_]{3,20}$/.test(normalized);

  function choosePhoto() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      setFile(f);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(f));
    };
    input.click();
  }

  async function save() {
    setError("");
    if (!usernameOk) { setError("Username: 3–20 caracteres, a–z, 0–9 ou _"); return; }
    try {
      let url = avatarUrl;
      if (file) url = await uploadImage("avatars", file);
      const updated = await api.profile.updateSocial({
        username: normalized,
        displayName: displayName.trim() || null,
        avatarUrl: url || null,
        bio: bio.trim() || null,
      });
      showToast?.("Perfil atualizado");
      onSaved?.(updated);
    } catch (e) {
      if (e.status === 409) setError("Esse @username já está em uso.");
      else { setError(e.message || "Erro ao salvar"); }
    }
  }

  return (
    <Sheet onClose={onClose} title="Perfil público">
      <div className="flex flex-col items-center mb-4">
        <button onClick={choosePhoto} className="relative">
          <Avatar url={preview || avatarUrl} name={displayName || username} size="w-20 h-20" />
          <span className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center border-2 border-white"><Icon name="camera" className="w-3.5 h-3.5" /></span>
        </button>
      </div>

      <label className="block text-xs text-slate-500 mb-1">Username</label>
      <div className="flex items-center bg-slate-100 rounded-xl px-3 mb-3">
        <span className="text-slate-400">@</span>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="seu_usuario" className="flex-1 bg-transparent px-1 py-2.5 outline-none" />
      </div>

      <label className="block text-xs text-slate-500 mb-1">Nome de exibição</label>
      <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Seu nome" className="w-full bg-slate-100 rounded-xl px-4 py-2.5 outline-none mb-3" />

      <label className="block text-xs text-slate-500 mb-1">Bio</label>
      <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2} placeholder="Sobre você…" className="w-full bg-slate-100 rounded-xl px-4 py-2.5 outline-none resize-none mb-3" />

      {error && <div className="text-sm text-red-600 mb-3">{error}</div>}

      <SaveButton disabled={!usernameOk} onClick={save} className="w-full bg-emerald-500 disabled:bg-slate-200 text-white font-semibold py-3 rounded-full">
        Salvar
      </SaveButton>
    </Sheet>
  );
}
