import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Maximize,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { usePhotoUrls } from '../../cloud/hooks';

const MIN = 1,
  MAX = 8,
  STEP = 1.5;

type View = { s: number; x: number; y: number };
type Pt = { x: number; y: number };

/**
 * Foto em tela cheia: abre inteira na tela (sem cortar). Pinça, roda do
 * mouse, duplo toque ou os botões +/− aproximam e afastam livremente;
 * com zoom, arrasta para ver os detalhes. Sem zoom, deslizar para o lado
 * passa a foto. Setas passam entre as fotos do item, X ou Esc fecha.
 */
export function PhotoViewer({
  srcs,
  start = 0,
  onClose,
}: {
  srcs: string[];
  start?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(start),
    [scale, setScale] = useState(1);
  const count = srcs.length;
  const stage = useRef<HTMLDivElement>(null),
    img = useRef<HTMLImageElement>(null),
    view = useRef<View>({ s: 1, x: 0, y: 0 }),
    pointers = useRef(new Map<number, Pt>()),
    gesture = useRef<{
      view: View;
      dist: number;
      mid: Pt;
      start: Pt;
      moved: boolean;
    } | null>(null),
    lastTap = useRef(0);

  /** Limita o arraste para a foto não sair da tela. */
  const clamp = (v: View): View => {
    const st = stage.current,
      im = img.current;
    const s = Math.min(MAX, Math.max(MIN, v.s));
    if (!st || !im) return { s, x: 0, y: 0 };
    const W = st.clientWidth,
      H = st.clientHeight;
    const w = im.offsetWidth * s,
      h = im.offsetHeight * s;
    const mx = Math.max(0, (w - W) / 2),
      my = Math.max(0, (h - H) / 2);
    return {
      s,
      x: Math.min(mx, Math.max(-mx, v.x)),
      y: Math.min(my, Math.max(-my, v.y)),
    };
  };

  const apply = useCallback((v: View, animate = false) => {
    view.current = v;
    const im = img.current;
    if (im) {
      im.style.transition = animate ? 'transform 0.2s ease-out' : 'none';
      im.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.s})`;
    }
    setScale(v.s);
  }, []);

  /** Ponto da tela relativo ao centro do palco. */
  const local = (p: Pt): Pt => {
    const r = stage.current?.getBoundingClientRect();
    return r
      ? { x: p.x - r.left - r.width / 2, y: p.y - r.top - r.height / 2 }
      : { x: 0, y: 0 };
  };

  /** Zoom mantendo o ponto f (relativo ao centro) parado na tela. */
  const zoomAt = (s: number, f: Pt, from = view.current): View => {
    const ns = Math.min(MAX, Math.max(MIN, s));
    const k = ns / from.s;
    return clamp({
      s: ns,
      x: f.x - k * (f.x - from.x),
      y: f.y - k * (f.y - from.y),
    });
  };

  const reset = useCallback(
    (animate = true) => apply({ s: 1, x: 0, y: 0 }, animate),
    [apply],
  );

  const go = useCallback(
    (step: number) => {
      reset(false);
      setIndex((i) => (i + step + count) % count);
    },
    [count, reset],
  );

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && count > 1) go(1);
      else if (e.key === 'ArrowLeft' && count > 1) go(-1);
      else if (e.key === '+' || e.key === '=')
        apply(zoomAt(view.current.s * STEP, { x: 0, y: 0 }), true);
      else if (e.key === '-')
        apply(zoomAt(view.current.s / STEP, { x: 0, y: 0 }), true);
      else if (e.key === '0') reset();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, onClose, go, reset, apply]);

  // Roda do mouse (PC): aproxima no ponto do cursor. Precisa ser não passivo.
  useEffect(() => {
    const st = stage.current;
    if (!st) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002));
      apply(
        zoomAt(view.current.s * factor, local({ x: e.clientX, y: e.clientY })),
      );
    };
    st.addEventListener('wheel', wheel, { passive: false });
    return () => st.removeEventListener('wheel', wheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apply]);

  // Ao girar o celular/redimensionar, mantém a foto dentro da tela.
  useEffect(() => {
    const fit = () => apply(clamp(view.current));
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [apply]);

  const begin = () => {
    const pts = [...pointers.current.values()];
    const a = pts[0],
      b = pts[1] ?? pts[0];
    gesture.current = {
      view: { ...view.current },
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      mid: local({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
      start: { x: a.x, y: a.y },
      moved: gesture.current?.moved ?? false,
    };
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stage.current?.setPointerCapture(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    begin();
  };

  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const pts = [...pointers.current.values()];
    if (pts.length >= 2) {
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = local({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      const s = Math.min(MAX, Math.max(MIN, (g.view.s * dist) / (g.dist || 1)));
      // ponto da foto que estava sob os dedos continua sob os dedos
      const cx = (g.mid.x - g.view.x) / g.view.s,
        cy = (g.mid.y - g.view.y) / g.view.s;
      g.moved = true;
      apply(clamp({ s, x: mid.x - s * cx, y: mid.y - s * cy }));
      return;
    }
    const dx = e.clientX - g.start.x,
      dy = e.clientY - g.start.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) g.moved = true;
    if (g.view.s > 1)
      apply(clamp({ s: g.view.s, x: g.view.x + dx, y: g.view.y + dy }));
  };

  const onUp = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) {
      begin(); // continua com o dedo que ficou, sem pulo
      return;
    }
    gesture.current = null;
    if (!g) return;
    const dx = e.clientX - g.start.x,
      dy = e.clientY - g.start.y;
    // Sem zoom: deslizar para o lado passa a foto.
    if (
      count > 1 &&
      g.view.s === 1 &&
      view.current.s === 1 &&
      Math.abs(dx) > 60 &&
      Math.abs(dx) > Math.abs(dy) * 1.5
    ) {
      go(dx < 0 ? 1 : -1);
      return;
    }
    if (g.moved) return;
    // Duplo toque / duplo clique: aproxima ali, ou volta a foto inteira.
    const now = Date.now();
    if (now - lastTap.current < 320) {
      lastTap.current = 0;
      if (view.current.s > 1.05) reset();
      else apply(zoomAt(2.5, local({ x: e.clientX, y: e.clientY })), true);
    } else lastTap.current = now;
  };

  const src = srcs[index];
  const zoomed = scale > 1.01;
  return (
    <div
      className="photo-viewer"
      role="dialog"
      aria-modal="true"
      aria-label="Foto ampliada"
    >
      <div
        ref={stage}
        className={`photo-viewer__stage ${zoomed ? 'zoomed' : ''}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {src ? (
          <img
            ref={img}
            key={src}
            src={src}
            alt={`Foto ${index + 1} de ${count}`}
            draggable={false}
            onLoad={() => reset(false)}
          />
        ) : (
          <span className="photo-slot loading" />
        )}
      </div>
      <button
        type="button"
        className="photo-viewer__close"
        aria-label="Fechar foto"
        onClick={onClose}
      >
        <X />
      </button>
      <div className="photo-viewer__bar">
        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="Foto anterior"
              onClick={() => go(-1)}
            >
              <ChevronLeft />
            </button>
            <span>
              {index + 1}/{count}
            </span>
            <button
              type="button"
              aria-label="Próxima foto"
              onClick={() => go(1)}
            >
              <ChevronRight />
            </button>
          </>
        )}
        {count > 1 && <span className="photo-viewer__sep" aria-hidden="true" />}
        <button
          type="button"
          aria-label="Afastar"
          disabled={!zoomed}
          onClick={() =>
            apply(zoomAt(view.current.s / STEP, { x: 0, y: 0 }), true)
          }
        >
          <ZoomOut />
        </button>
        <output className="photo-viewer__zoom" aria-live="polite">
          {Math.round(scale * 100)}%
        </output>
        <button
          type="button"
          aria-label="Aproximar"
          disabled={scale >= MAX}
          onClick={() =>
            apply(zoomAt(view.current.s * STEP, { x: 0, y: 0 }), true)
          }
        >
          <ZoomIn />
        </button>
        <button
          type="button"
          aria-label="Foto inteira"
          disabled={!zoomed}
          onClick={() => reset()}
        >
          <Maximize />
        </button>
      </div>
    </div>
  );
}
/** Fotos guardadas na nuvem (originais ou miniatura). */
export function CloudPhotoViewer({
  paths,
  start,
  onClose,
}: {
  paths: string[];
  start?: number;
  onClose: () => void;
}) {
  const urls = usePhotoUrls(paths);
  return (
    <PhotoViewer
      srcs={paths.map((p) => urls[p] ?? '')}
      start={start}
      onClose={onClose}
    />
  );
}
