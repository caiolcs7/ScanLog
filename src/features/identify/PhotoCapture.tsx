import { useEffect, useRef, useState } from 'react';
import { Camera, Check, LoaderCircle } from 'lucide-react';
import { Modal, errorMessage } from '../../components/ui';
import { usePageVisible } from '../../hooks/useHardware';
import { captureFrame } from '../../services/photo';

type ImageCaptureLike = { takePhoto(): Promise<Blob> };
declare const ImageCapture:
  (new (track: MediaStreamTrack) => ImageCaptureLike) | undefined;

/**
 * Câmera dentro do app. A foto vai direto para a memória do ScanLog e não
 * passa pelo app de câmera do sistema, que costuma gravar na galeria.
 */
export function PhotoCapture({
  remaining,
  onPhoto,
  onClose,
  onFallback,
}: {
  remaining: number;
  onPhoto: (blob: Blob) => void;
  onClose: () => void;
  /** Sem acesso à câmera no navegador: usa a câmera do sistema. */
  onFallback: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null);
  const visible = usePageVisible();
  const [ready, setReady] = useState(false),
    [taken, setTaken] = useState(0),
    [busy, setBusy] = useState(false),
    [flash, setFlash] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const element = video.current;
    setReady(false);
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error('Câmera indisponível neste navegador.');
        const media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = media;
        if (!element) return;
        element.srcObject = media;
        await element.play().catch(() => {});
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
      // Libera a câmera ao fechar, ao sair da tela ou ao ocultar o app.
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      if (element) element.srcObject = null;
    };
  }, [visible]);
  async function shoot() {
    if (!video.current || busy) return;
    setBusy(true);
    setFlash(true);
    setTimeout(() => setFlash(false), 160);
    try {
      const track = stream.current?.getVideoTracks()[0];
      let blob: Blob | null = null;
      if (track && typeof ImageCapture !== 'undefined')
        blob = await new ImageCapture(track).takePhoto().catch(() => null);
      blob ??= await captureFrame(video.current);
      onPhoto(blob);
      const count = taken + 1;
      setTaken(count);
      if (count >= remaining) onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal wide title="Tirar foto" onClose={onClose}>
      <div className={`photo-camera ${flash ? 'flash' : ''}`}>
        <video
          ref={video}
          playsInline
          muted
          aria-label="Visualização da câmera"
        />
        {!ready && !error && (
          <span className="photo-camera__status">
            <LoaderCircle className="spin" />
            Abrindo câmera…
          </span>
        )}
      </div>
      {error ? (
        <div className="photo-camera__error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={onFallback}>
            Usar câmera do celular
          </button>
          <p className="helper">
            Neste modo o celular pode salvar a foto na galeria.
          </p>
        </div>
      ) : (
        <p className="helper photo-camera__hint">
          A foto fica só no ScanLog, não vai para a galeria.{' '}
          {taken > 0 &&
            `${taken} tirada${taken > 1 ? 's' : ''}, faltam ${remaining - taken}.`}
        </p>
      )}
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          <Check />
          {taken ? 'Concluir' : 'Cancelar'}
        </button>
        <button
          type="button"
          className="primary photo-shutter"
          disabled={!ready || busy || taken >= remaining}
          onClick={() => void shoot()}
        >
          <Camera />
          {busy ? 'Salvando…' : 'Tirar foto'}
        </button>
      </div>
    </Modal>
  );
}
