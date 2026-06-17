/**
 * Skeleton placeholders shown while data loads, in place of "Carregando…" text.
 * Built from neutral pulsing blocks. The bg-slate-* surfaces are auto-remapped
 * for dark mode by index.css, so these read correctly in both themes.
 */

// Base shimmer block — size/shape via className.
export function Skel({ className = "" }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} />;
}

// Avatar circle + two text lines per row. Used by follow lists / pick lists.
export function SkeletonRows({ rows = 6, avatar = true }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 px-2 py-2">
          {avatar && <div className="w-10 h-10 rounded-full bg-slate-200 animate-pulse shrink-0" />}
          <div className="flex-1 space-y-1.5">
            <Skel className="h-3 w-1/3" />
            <Skel className="h-2.5 w-1/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

// A feed/profile post-card placeholder.
export function SkeletonPost() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-full bg-slate-200 animate-pulse shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Skel className="h-3 w-1/3" />
          <Skel className="h-2.5 w-1/6" />
        </div>
      </div>
      <div className="space-y-2">
        <Skel className="h-3 w-full" />
        <Skel className="h-3 w-4/5" />
      </div>
      <Skel className="h-40 w-full rounded-xl" />
    </div>
  );
}

export function SkeletonPosts({ count = 3 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => <SkeletonPost key={i} />)}
    </div>
  );
}
