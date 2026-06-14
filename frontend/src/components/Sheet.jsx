import Icon from "./Icon.jsx";

export default function Sheet({ title, children, onClose, fullScreen = false }) {
  if (fullScreen) {
    // Mobile: edge-to-edge. Desktop (≥md): a centered, width-capped card over a
    // dimmed backdrop. `fixed` so it covers the viewport even when rendered at the
    // App level (ProfileScreen) where there's no positioned column ancestor.
    return (
      <div className="fixed inset-0 z-40 flex flex-col md:items-center md:justify-center md:bg-black/40 md:p-4">
        <div className="w-full h-full md:h-auto md:max-h-[88vh] md:max-w-2xl md:rounded-3xl md:shadow-2xl flex flex-col bg-white pop overflow-hidden">
          <div className="shrink-0 flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),20px)] md:pt-4 pb-3 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><Icon name="close" className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto scroll-hide px-5 pt-4 pb-[max(env(safe-area-inset-bottom),24px)]">
            {children}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center md:items-center">
      <div onClick={onClose} className="absolute inset-0 bg-black/40 fade-in" />
      <div className="relative w-full md:max-w-md md:mx-4 bg-white rounded-t-3xl md:rounded-3xl p-5 pb-6 max-h-[90%] md:max-h-[85%] overflow-y-auto scroll-hide pop">
        <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3" />
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><Icon name="close" className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
