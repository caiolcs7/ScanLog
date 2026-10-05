import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Flashlight,
  Pause,
  Play,
  ScanLine,
  Keyboard,
  ImagePlus,
  MonitorCheck,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { Settings, Source } from '../../core/models';
import { ScannerService, type CameraState } from '../../services/scanner';
import { decodeImage } from '../../services/decoder';
import { useHid, usePageVisible, useWakeLock } from '../../hooks/useHardware';
import { errorMessage, useNotice, useTask } from '../../components/ui';
import { unlockAudio } from '../../services/feedback';
import { warmUpOcr } from '../../services/ocr';
import { db } from '../../core/database';

export function ScannerPanel({
  settings,
  blocked,
  onScan,
}: {
  settings: Settings;
  blocked: boolean;
  onScan: (
    raw: string,
    source: Source,
    frame?: HTMLCanvasElement,
  ) => Promise<void>;
}) {
  const [input, setInput] = useState(settings.input),
    [active, setActive] = useState(false),
    [torch, setTorch] = useState(false),
    [zoom, setZoom] = useState(1),
    [cameraId, setCameraId] = useState(settings.cameraId),
    [imageBusy, setImageBusy] = useState(false);
  const [camera, setCamera] = useState<CameraState>({
    running: false,
    message: 'Câmera pausada',
    engine: 'ZXing-C++',
    torch: false,
    devices: [],
  });
  const video = useRef<HTMLVideoElement>(null),
    imageInput = useRef<HTMLInputElement>(null),
    hidInput = useRef<HTMLInputElement>(null);
  const scanRef = useRef(onScan);
  scanRef.current = onScan;
  const visible = usePageVisible(),
    notice = useNotice(),
    task = useTask();
  const service = useMemo(
    () =>
      new ScannerService(
        (raw, frame) => scanRef.current(raw, 'camera', frame),
        setCamera,
      ),
    [],
  );
  const scanning = active && visible && input === 'camera' && !blocked;
  useEffect(() => {
    service.setFrameCapture(settings.readDescription);
    if (settings.readDescription) warmUpOcr();
  }, [service, settings.readDescription]);
  useEffect(() => {
    service.setCapture(settings.cameraCapture ?? 'button');
  }, [service, settings.cameraCapture]);
  useEffect(() => {
    if (scanning && video.current)
      void service.start(video.current, cameraId, settings.autoTorch);
    else service.stop();
    return () => service.stop();
  }, [service, scanning, cameraId, settings.autoTorch]);
  const locked = useWakeLock(
    visible && !blocked && (camera.running || input === 'hid'),
  );
  useHid(input === 'hid' && visible && !blocked, (raw) =>
    scanRef.current(raw, 'hid'),
  );
  async function readImage(file: File) {
    setImageBusy(true);
    setActive(false);
    unlockAudio();
    try {
      const values = await decodeImage(file);
      const unique = [...new Set(values.map((v) => v.text))];
      if (unique.length !== 1)
        throw new Error(
          unique.length
            ? 'A imagem contém várias etiquetas. Recorte para manter apenas uma.'
            : 'Nenhum Data Matrix ou código legível encontrado. Use uma foto mais próxima e nítida.',
        );
      await scanRef.current(unique[0], 'image');
    } catch (error) {
      notice(errorMessage(error), 'error');
    } finally {
      setImageBusy(false);
    }
  }
  return (
    <section className="scanner-panel">
      <div className="input-tabs tabs">
        <button
          className={input === 'camera' ? 'selected' : ''}
          onClick={() => setInput('camera')}
        >
          <Camera />
          Câmera
        </button>
        <button
          className={input === 'hid' ? 'selected' : ''}
          onClick={() => {
            setInput('hid');
            setActive(false);
            unlockAudio();
          }}
        >
          <Keyboard />
          Leitor físico
        </button>
      </div>
      {input === 'camera' ? (
        <>
          <label className="camera-capture-select">
            Captura pela câmera
            <select
              value={settings.cameraCapture ?? 'button'}
              disabled={blocked}
              onChange={(e) => {
                const cameraCapture = e.target
                  .value as Settings['cameraCapture'];
                service.setCapture(cameraCapture);
                void task(() => db.settings.update('main', { cameraCapture }));
              }}
            >
              <option value="button">Por botão · uma etiqueta por toque</option>
              <option value="continuous">Contínua · sem botão</option>
            </select>
          </label>
          <div className={`camera-view ${camera.running ? 'running' : ''}`}>
            <video
              ref={video}
              muted
              playsInline
              aria-label="Visualização da câmera"
            />
            <div className="camera-overlay">
              {!camera.running && (
                <div className="camera-idle">
                  <ScanLine size={46} />
                  <strong>
                    {blocked
                      ? 'Aguardando sua escolha'
                      : 'Pronto para ler etiquetas'}
                  </strong>
                  <span>Data Matrix, QR Code e códigos industriais</span>
                </div>
              )}
              <div
                className="scan-reticle"
                aria-hidden="true"
                style={
                  camera.running && camera.region
                    ? {
                        position: 'absolute',
                        left: camera.region.left,
                        top: camera.region.top,
                        width: camera.region.width,
                        height: camera.region.height,
                        maxHeight: 'none',
                      }
                    : undefined
                }
              >
                <i />
                <i />
                <i />
                <i />
              </div>
              {camera.running && (
                <span className="camera-live">
                  <span />
                  {settings.cameraCapture === 'continuous'
                    ? 'Leitura contínua'
                    : camera.armed
                      ? 'Buscando etiqueta'
                      : 'Aguardando seu toque'}
                </span>
              )}
            </div>
          </div>
          {camera.running && settings.cameraCapture !== 'continuous' && (
            <button
              className="accent capture-button"
              disabled={blocked}
              onClick={() => {
                unlockAudio();
                if (camera.armed) service.cancelRead();
                else service.requestRead();
              }}
            >
              {camera.armed ? <X /> : <ScanLine />}
              {camera.armed ? 'Cancelar leitura' : 'Ler código'}
            </button>
          )}
          <div className="camera-controls">
            <button
              className={camera.running ? '' : 'accent'}
              disabled={blocked}
              onClick={() => {
                unlockAudio();
                setActive(camera.running ? false : true);
                if (active && !camera.running && video.current)
                  void service.start(
                    video.current,
                    cameraId,
                    settings.autoTorch,
                  );
              }}
            >
              {camera.running ? <Pause /> : <Play />}
              {camera.running ? 'Pausar' : 'Iniciar câmera'}
            </button>
            {camera.torch && (
              <button
                aria-pressed={torch}
                onClick={() =>
                  void task(async () => {
                    await service.setTorch(!torch);
                    setTorch(!torch);
                  })
                }
              >
                <Flashlight />
                {torch ? 'Desligar lanterna' : 'Lanterna'}
              </button>
            )}
            <button
              className="icon-button"
              aria-label="Ler imagem"
              disabled={imageBusy || blocked}
              onClick={() => imageInput.current?.click()}
            >
              <ImagePlus />
            </button>
          </div>
          {camera.zoom && (
            <label className="zoom-control">
              Zoom{' '}
              <input
                aria-label="Zoom da câmera"
                type="range"
                min={camera.zoom.min}
                max={camera.zoom.max}
                step={camera.zoom.step || 0.1}
                value={zoom}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setZoom(value);
                  void task(() => service.setZoom(value));
                }}
              />
              <span>{zoom.toFixed(1)}×</span>
            </label>
          )}
          {camera.devices.length > 1 && (
            <label className="camera-select">
              Câmera
              <select
                value={cameraId}
                onChange={(e) => {
                  setCameraId(e.target.value);
                  setTorch(false);
                }}
              >
                <option value="">Automática · traseira</option>
                {camera.devices.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Câmera ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="scanner-hint" role="status">
            {imageBusy ? 'Lendo imagem localmente…' : camera.message}
          </p>
          <p className="helper">
            Somente etiquetas inteiras dentro da mira são lidas.
          </p>
        </>
      ) : (
        <div className="hid-panel">
          <Keyboard size={44} />
          <h2>Leitor físico pronto</h2>
          <p>
            Leia uma etiqueta. Enter ou Tab conclui a leitura automaticamente.
          </p>
          <label>
            Entrada do leitor
            <input
              ref={hidInput}
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="Aguardando código…"
              disabled={blocked}
              onFocus={unlockAudio}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === 'Tab') {
                  const raw = event.currentTarget.value;
                  if (raw) {
                    event.preventDefault();
                    event.currentTarget.value = '';
                    void onScan(raw, 'hid');
                  }
                }
              }}
            />
          </label>
          <p className="helper">USB, Bluetooth ou coletor em modo teclado.</p>
          <button
            disabled={blocked || imageBusy}
            onClick={() => imageInput.current?.click()}
          >
            <ImagePlus />
            {imageBusy ? 'Lendo imagem…' : 'Ler imagem'}
          </button>
        </div>
      )}
      <input
        className="sr-only"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/bmp,image/gif"
        ref={imageInput}
        aria-label="Selecionar imagem da etiqueta"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void readImage(file);
        }}
      />
      <div className="scanner-foot">
        <span>
          <ShieldCheck />
          Processamento local
        </span>
        {locked && (
          <span>
            <MonitorCheck />
            Tela ativa
          </span>
        )}
        <span>{camera.engine}</span>
      </div>
    </section>
  );
}
