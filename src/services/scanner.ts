import { ScanGate } from '../core/scan-gate';
import { cleanText } from '../core/parser';
import { LocalDecoder, type Decoded } from './decoder';
import { cameraRegion } from '../core/camera-region';
import type { Settings } from '../core/models';

type CameraCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
  zoom?: { min: number; max: number; step: number };
  focusMode?: string[];
};
type NativeDetector = {
  detect(
    source: HTMLCanvasElement,
  ): Promise<{ rawValue: string; format: string }[]>;
};
type DetectorConstructor = {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
};
export type CameraState = {
  running: boolean;
  message: string;
  engine: string;
  torch: boolean;
  zoom?: { min: number; max: number; step: number };
  devices: MediaDeviceInfo[];
  armed?: boolean;
  region?: ReturnType<typeof cameraRegion>;
};
export class ScannerService {
  private stream: MediaStream | null = null;
  private decoder = new LocalDecoder();
  private gate = new ScanGate();
  private capture: Settings['cameraCapture'] = 'button';
  private keepFrame = false;
  private attempt = 0;
  private until = 0;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private resizeObserver?: ResizeObserver;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private native: NativeDetector | null = null;
  private nativeErrors = 0;
  private missedFrames = 0;
  private track: MediaStreamTrack | undefined;
  private state: CameraState = {
    running: false,
    message: 'Câmera pausada',
    engine: 'ZXing-C++',
    torch: false,
    devices: [],
  };
  constructor(
    private onScan: (raw: string, frame?: HTMLCanvasElement) => Promise<void>,
    private onState: (state: CameraState) => void,
  ) {}
  setCapture(mode: Settings['cameraCapture']) {
    this.capture = mode;
    this.cancelRead();
  }
  /** When enabled, each accepted read hands over a transient frame copy for OCR. */
  setFrameCapture(enabled: boolean) {
    this.keepFrame = enabled;
  }
  private snapshot(canvas: HTMLCanvasElement) {
    if (!this.keepFrame) return undefined;
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext('2d')?.drawImage(canvas, 0, 0);
    return copy;
  }
  private deliver(raw: string, canvas: HTMLCanvasElement) {
    const frame = this.snapshot(canvas);
    return frame ? this.onScan(raw, frame) : this.onScan(raw);
  }
  requestRead() {
    if (!this.state.running || this.capture !== 'button' || this.until) return;
    this.attempt++;
    this.until = Date.now() + 5000;
    this.publish({
      armed: true,
      message: 'Buscando uma etiqueta na mira… Até 5 segundos.',
    });
    this.expiry = setTimeout(
      () =>
        this.cancelRead(
          'Tempo esgotado. Enquadre a etiqueta e toque em Ler código.',
        ),
      5000,
    );
  }
  cancelRead(message = 'Enquadre a etiqueta e toque em Ler código.') {
    this.attempt++;
    this.until = 0;
    clearTimeout(this.expiry);
    this.publish({
      armed: false,
      message:
        this.capture === 'continuous'
          ? 'Leitura contínua: enquadre apenas uma etiqueta na mira.'
          : message,
    });
  }
  async start(video: HTMLVideoElement, cameraId: string, autoTorch = false) {
    this.stop();
    const generation = this.generation;
    this.publish({ message: 'Preparando câmera…' });
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error(
          'A câmera precisa de HTTPS ou localhost. Use leitor físico ou entrada manual.',
        );
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(cameraId
            ? { deviceId: { exact: cameraId } }
            : { facingMode: { ideal: 'environment' } }),
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      this.track = stream.getVideoTracks()[0];
      video.srcObject = stream;
      await video.play();
      if (generation !== this.generation) return;
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => {
          this.publish({
            region: cameraRegion(
              video.videoWidth,
              video.videoHeight,
              video.clientWidth,
              video.clientHeight,
            ),
          });
        });
        this.resizeObserver.observe(video);
      }
      const caps: CameraCapabilities = this.track.getCapabilities?.() ?? {};
      if (caps.focusMode?.includes('continuous'))
        await this.constraint({ focusMode: 'continuous' }).catch(() => {});
      const Detector = (
        globalThis as typeof globalThis & {
          BarcodeDetector?: DetectorConstructor;
        }
      ).BarcodeDetector;
      if (Detector) {
        try {
          const formats = await Detector.getSupportedFormats();
          if (formats.includes('data_matrix'))
            this.native = new Detector({
              formats: [
                'data_matrix',
                'qr_code',
                'code_128',
                'code_39',
                'itf',
              ].filter((f) => formats.includes(f)),
            });
        } catch {
          this.native = null;
        }
      }
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === 'videoinput',
      );
      if (generation !== this.generation) return;
      if (autoTorch && caps.torch) await this.setTorch(true).catch(() => {});
      this.publish({
        running: true,
        message:
          this.capture === 'continuous'
            ? 'Leitura contínua: enquadre apenas uma etiqueta na mira.'
            : 'Enquadre a etiqueta e toque em Ler código.',
        engine: this.native ? 'Detector nativo + ZXing' : 'ZXing-C++',
        torch: !!caps.torch,
        zoom: caps.zoom,
        devices,
      });
      this.track.onended = () => {
        this.stop();
        this.publish({
          message:
            'A câmera foi desconectada. Selecione outra e inicie novamente.',
        });
      };
      void this.loop(video, generation);
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop();
      this.publish({ message: cameraError(error) });
    }
  }
  private async loop(video: HTMLVideoElement, generation: number) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const tick = async () => {
      if (generation !== this.generation || !ctx) return;
      try {
        if (video.readyState < 2 || !video.videoWidth) {
          this.timer = setTimeout(() => void tick(), 150);
          return;
        }
        const region = cameraRegion(
          video.videoWidth,
          video.videoHeight,
          video.clientWidth,
          video.clientHeight,
        );
        if (!region) {
          this.timer = setTimeout(() => void tick(), 160);
          return;
        }
        if (JSON.stringify(region) !== JSON.stringify(this.state.region))
          this.publish({ region });
        if (this.capture === 'button' && !this.until) {
          this.timer = setTimeout(() => void tick(), 160);
          return;
        }
        const attempt = this.attempt;
        const scale = Math.min(1, 1920 / region.sw);
        canvas.width = Math.round(region.sw * scale);
        canvas.height = Math.round(region.sh * scale);
        ctx.drawImage(
          video,
          region.sx,
          region.sy,
          region.sw,
          region.sh,
          0,
          0,
          canvas.width,
          canvas.height,
        );
        let values: Decoded[] = [];
        if (this.native) {
          try {
            values = (await this.native.detect(canvas)).map((v) => ({
              text: v.rawValue,
              format: v.format,
            }));
            this.nativeErrors = 0;
          } catch {
            if (++this.nativeErrors >= 3) {
              this.native = null;
              this.publish({ engine: 'ZXing-C++ · fallback' });
            }
          }
        }
        if (!values.length && (!this.native || this.missedFrames % 2 === 0))
          values = await this.decoder.decode(
            ctx.getImageData(0, 0, canvas.width, canvas.height),
          );
        if (generation !== this.generation) return;
        // A cancelled/expired attempt must never deliver its late decoder result.
        if (
          attempt !== this.attempt ||
          JSON.stringify(region) !==
            JSON.stringify(
              cameraRegion(
                video.videoWidth,
                video.videoHeight,
                video.clientWidth,
                video.clientHeight,
              ),
            ) ||
          (this.capture === 'button' && Date.now() >= this.until)
        ) {
          this.timer = setTimeout(() => void tick(), 160);
          return;
        }
        const unique = [...new Set(values.map((v) => v.text))];
        if (unique.length === 1) {
          this.missedFrames = 0;
          if (this.capture === 'button') {
            this.cancelRead(
              'Leitura concluída. Toque em Ler código para a próxima etiqueta.',
            );
            await this.deliver(unique[0], canvas);
          } else if (this.gate.accept(cleanText(unique[0]), Date.now())) {
            this.publish({
              message: 'Etiqueta lida. Aponte para a próxima dentro da mira.',
            });
            await this.deliver(unique[0], canvas);
          } else
            this.publish({
              message:
                'Etiqueta já lida. Aponte para a próxima dentro da mira.',
            });
        } else if (unique.length > 1) {
          this.publish({
            message: 'Há várias etiquetas na imagem. Enquadre apenas uma.',
          });
        } else {
          this.gate.absent(Date.now());
          if (++this.missedFrames === 25)
            this.publish({
              message:
                'Aproxime a câmera, melhore a iluminação e mantenha a etiqueta visível.',
            });
        }
      } catch (error) {
        if (generation !== this.generation) return;
        this.stop();
        this.publish({ message: cameraError(error) });
        return;
      }
      if (generation === this.generation)
        this.timer = setTimeout(() => void tick(), 160);
    };
    await tick();
  }
  private publish(change: Partial<CameraState>) {
    if (
      Object.entries(change).every(([key, value]) =>
        Object.is(this.state[key as keyof CameraState], value),
      )
    )
      return;
    this.state = { ...this.state, ...change };
    this.onState(this.state);
  }
  private constraint(values: Record<string, unknown>) {
    return (
      this.track?.applyConstraints({
        advanced: [values as MediaTrackConstraintSet],
      }) ?? Promise.resolve()
    );
  }
  setTorch(enabled: boolean) {
    return this.constraint({ torch: enabled });
  }
  setZoom(value: number) {
    return this.constraint({ zoom: value });
  }
  stop() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.cancelRead();
    this.generation++;
    clearTimeout(this.timer);
    this.decoder.stop();
    // Retain the visible-code latch across confirmation dialogs to avoid re-prompting.
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.stream = null;
    this.track = undefined;
    this.native = null;
    this.nativeErrors = 0;
    this.missedFrames = 0;
    this.publish({
      running: false,
      message: 'Câmera pausada',
      torch: false,
      zoom: undefined,
    });
  }
}
function cameraError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotSupportedError' || error.message === 'Not supported')
      return 'Câmera não suportada neste navegador. Use o leitor físico, uma imagem ou a entrada manual.';
    if (error.name === 'NotAllowedError')
      return 'Permissão de câmera negada. Libere nas configurações do navegador ou use a entrada manual.';
    if (error.name === 'NotFoundError')
      return 'Nenhuma câmera encontrada. Conecte uma câmera ou use o leitor físico.';
    if (error.name === 'NotReadableError')
      return 'Câmera ocupada. Feche outros aplicativos que estejam usando a câmera.';
    if (error.name === 'OverconstrainedError')
      return 'A câmera selecionada não está disponível. Escolha Automática e tente novamente.';
  }
  if (error instanceof Error && error.message === 'Not supported')
    return 'Câmera não suportada neste navegador. Use o leitor físico, uma imagem ou a entrada manual.';
  return error instanceof Error
    ? error.message
    : 'Não foi possível iniciar a câmera. Tente novamente.';
}
