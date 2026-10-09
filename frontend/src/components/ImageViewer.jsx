import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon.jsx";

const DUR = 300;
const EASE = "cubic-bezier(.2,.8,.2,1)";
const DISMISS_DISTANCE = 120;  // px dragged before release closes
const DISMISS_VELOCITY = 0.6;  // px/ms flick that closes regardless of distance

/**
 * Fullscreen image viewer. Zooms out of `origin` ({rect, radius} of the thumbnail it
 * came from) and zooms back into it on close. Drag up/down to dismiss, X / Esc /
 * tap on the backdrop also close. `onClose` fires once the exit animation ends.
 * Styles that matter are inline so the dark-mode class remaps in index.css don't touch them.
 */
export default function ImageViewer({ url, origin, onClose }) {
  const imgRef = useRef(null);
  const bgRef = useRef(null);
  const btnRef = useRef(null);
  const finalRect = useRef(null);
  const drag = useRef(null);
  const done = useRef(false);
  const entered = useRef(false);

  function setTransition(on) {
    const t = on ? `transform ${DUR}ms ${EASE}, clip-path ${DUR}ms ${EASE}, opacity ${DUR}ms ${EASE}` : "none";
    imgRef.current.style.transition = t;
    bgRef.current.style.transition = on ? `opacity ${DUR}ms ${EASE}` : "none";
    btnRef.current.style.transition = on ? `opacity ${DUR}ms ${EASE}` : "none";
  }

  // Transform + clip that make the full image sit exactly over the thumbnail (object-cover crop included).
  function applyOrigin() {
    const img = imgRef.current;
    const f = finalRect.current;
    if (!origin || !f || !f.width) {
      img.style.transform = "scale(.92)";
      img.style.opacity = "0";
      return;
    }
    const o = origin.rect;
    const s = Math.max(o.width / f.width, o.height / f.height);
    const tx = o.left + o.width / 2 - (f.left + f.width / 2);
    const ty = o.top + o.height / 2 - (f.top + f.height / 2);
    const ix = Math.max(0, (f.width - o.width / s) / 2);
    const iy = Math.max(0, (f.height - o.height / s) / 2);
    img.style.opacity = "1";
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    img.style.clipPath = `inset(${iy}px ${ix}px round ${origin.radius / s}px)`;
  }

  function animateIn() {
    if (entered.current) return;
    entered.current = true;
    const img = imgRef.current;
    finalRect.current = img.getBoundingClientRect();
    setTransition(false);
    applyOrigin();
    bgRef.current.style.opacity = "0";
    btnRef.current.style.opacity = "0";
    img.getBoundingClientRect(); // flush so the start state is painted before transitioning
    requestAnimationFrame(() => {
      setTransition(true);
      img.style.transform = "none";
      img.style.clipPath = "inset(0px 0px round 0px)";
      img.style.opacity = "1";
      bgRef.current.style.opacity = "1";
      btnRef.current.style.opacity = "1";
    });
  }

  function finish() {
    setTimeout(onClose, DUR);
  }

  function close() {
    if (done.current) return;
    done.current = true;
    setTransition(true);
    applyOrigin();
    bgRef.current.style.opacity = "0";
    btnRef.current.style.opacity = "0";
    finish();
  }

  function flyAway(dir) {
    if (done.current) return;
    done.current = true;
    setTransition(true);
    const img = imgRef.current;
    img.style.transform = `translateY(${dir * window.innerHeight}px) scale(.85)`;
    img.style.opacity = "0";
    bgRef.current.style.opacity = "0";
    btnRef.current.style.opacity = "0";
    finish();
  }

  useLayoutEffect(() => {
    if (imgRef.current.complete && imgRef.current.naturalWidth) animateIn();
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onPointerDown(e) {
    if (done.current || btnRef.current.contains(e.target)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setTransition(false);
    drag.current = { startY: e.clientY, samples: [{ y: e.clientY, t: performance.now() }], dy: 0, moved: false, onImg: e.target === imgRef.current };
  }

  function onPointerMove(e) {
    const d = drag.current;
    if (!d) return;
    const now = performance.now();
    d.samples.push({ y: e.clientY, t: now });
    while (d.samples.length > 2 && now - d.samples[0].t > 100) d.samples.shift();
    d.dy = e.clientY - d.startY;
    if (Math.abs(d.dy) > 4) d.moved = true;
    if (!d.moved) return;
    const p = Math.min(Math.abs(d.dy) / window.innerHeight, 1);
    imgRef.current.style.transform = `translateY(${d.dy}px) scale(${1 - p * 0.2})`;
    bgRef.current.style.opacity = String(1 - Math.min(p * 1.6, 1));
    btnRef.current.style.opacity = String(1 - Math.min(p * 4, 1));
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      if (!d.onImg) close();
      return;
    }
    // Release velocity over the last ~100ms, so a slow drag back to center doesn't count as a flick.
    const a = d.samples[0], b = d.samples[d.samples.length - 1];
    const v = (b.y - a.y) / Math.max(b.t - a.t, 16);
    const flick = Math.abs(v) > DISMISS_VELOCITY && Math.sign(v) === Math.sign(d.dy);
    if (Math.abs(d.dy) > DISMISS_DISTANCE || flick) {
      flyAway(Math.sign(d.dy) || 1);
      return;
    }
    setTransition(true);
    imgRef.current.style.transform = "none";
    bgRef.current.style.opacity = "1";
    btnRef.current.style.opacity = "1";
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center select-none"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div ref={bgRef} className="absolute inset-0" style={{ background: "rgba(2, 6, 23, .82)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", opacity: 0 }}/>
      <img
        ref={imgRef}
        src={url}
        alt=""
        draggable={false}
        onLoad={animateIn}
        className="relative object-contain"
        style={{ maxWidth: "100vw", maxHeight: "100dvh", opacity: 0, willChange: "transform" }}
      />
      <button
        ref={btnRef}
        type="button"
        onClick={close}
        aria-label="Fechar"
        className="absolute right-3 w-10 h-10 rounded-full flex items-center justify-center"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)", background: "rgba(255,255,255,.16)", color: "#fff", opacity: 0 }}
      >
        <Icon name="close" className="w-5 h-5"/>
      </button>
    </div>,
    document.body,
  );
}
