import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react';
import { usePhotoUrls } from '../../cloud/hooks';

/**
 * Foto em tela cheia: toque na foto aproxima (e arrasta para ver os
 * detalhes), setas passam entre as fotos do item, X ou Esc fecha.
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
    [zoom, setZoom] = useState(false);
  const count = srcs.length;
  const go = (step: number) => {
    setZoom(false);
    setIndex((i) => (i + step + count) % count);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && count > 1) go(1);
      else if (e.key === 'ArrowLeft' && count > 1) go(-1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, onClose]);
  const src = srcs[index];
  return (
    <div
      className="photo-viewer"
      role="dialog"
      aria-modal="true"
      aria-label="Foto ampliada"
    >
      <div className={`photo-viewer__stage ${zoom ? 'zoomed' : ''}`}>
        {src ? (
          <img
            src={src}
            alt={`Foto ${index + 1} de ${count}`}
            onClick={() => setZoom((z) => !z)}
          />
        ) : (
          <span className="photo-slot loading" />
        )}
      </div>
      <div className="photo-viewer__bar">
        <button type="button" aria-label="Fechar foto" onClick={onClose}>
          <X />
        </button>
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
        <button
          type="button"
          aria-label={zoom ? 'Afastar' : 'Aproximar'}
          onClick={() => setZoom((z) => !z)}
        >
          {zoom ? <ZoomOut /> : <ZoomIn />}
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
