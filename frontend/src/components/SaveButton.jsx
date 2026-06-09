import { useState, useRef, useEffect } from "react";
import Icon from "./Icon.jsx";

// Botão de salvar com feedback visual e proteção contra duplo clique.
// Enquanto o onClick (async) está em andamento: mostra spinner + savingLabel
// e fica desabilitado, então não dá pra disparar a mesma ação duas vezes.
export default function SaveButton({
  onClick,
  disabled = false,
  children,
  savingLabel = "Salvando…",
  className = "",
  type = "button",
}) {
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  async function handle() {
    if (busy.current || disabled) return;
    busy.current = true;
    setSaving(true);
    try {
      await onClick();
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <button
      type={type}
      onClick={handle}
      disabled={disabled || saving}
      className={"inline-flex items-center justify-center gap-2 " + className}
    >
      {saving && <Icon name="spinner" className="w-4 h-4 animate-spin" />}
      {saving ? savingLabel : children}
    </button>
  );
}
