import { useEffect } from "react";
import Icon from "./Icon.jsx";

export default function ConfirmDialog({
  open,
  title = "Confirmar exclusão",
  message,
  detail,
  confirmLabel = "Excluir",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onCancel?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-5">
      <div onClick={onCancel} className="absolute inset-0 bg-slate-900/50 fade-in" />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl pop">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-full bg-red-50 text-red-500 flex items-center justify-center shrink-0">
            <Icon name="trash" className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-bold text-slate-900 leading-tight">{title}</h2>
            {message && <p className="mt-1 text-sm text-slate-500 leading-snug">{message}</p>}
          </div>
        </div>
        {detail && (
          <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 break-words">
            {detail}
          </div>
        )}
        <div className="mt-5 flex gap-2">
          <button
            onClick={onCancel}
            autoFocus
            className="flex-1 py-3 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-full bg-red-500 hover:bg-red-600 text-white font-semibold shadow-lg shadow-red-500/30"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
