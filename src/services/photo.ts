import type { FindPhoto } from '../core/models';

const MAX_SIDE = 1600;
/** Lado maior da miniatura guardada depois da confirmação. */
export const THUMB_SIDE = 320;
export const THUMB_MAX_BYTES = 20 * 1024;

function draw(source: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível processar a foto.');
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}
function encode(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, quality),
  );
}
function release(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

/** Reduz a foto da câmera (até 12 MP) para JPEG leve, preservando a orientação. */
export async function compressPhoto(file: Blob): Promise<FindPhoto> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: 'from-image',
  });
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale),
      height = Math.round(bitmap.height * scale);
    const canvas = draw(bitmap, width, height);
    const blob = await encode(canvas, 'image/jpeg', 0.82);
    release(canvas);
    if (!blob) throw new Error('Não foi possível processar a foto.');
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}
/**
 * Miniatura de até ~20 KB (WebP; JPEG onde o navegador não gera WebP),
 * a única imagem que fica depois que o almoxarifado confirma o item.
 */
export async function makeThumbnail(photo: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(photo);
  try {
    let side = THUMB_SIDE,
      quality = 0.6,
      best: Blob | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const canvas = draw(
        bitmap,
        Math.max(1, Math.round(bitmap.width * scale)),
        Math.max(1, Math.round(bitmap.height * scale)),
      );
      let blob = await encode(canvas, 'image/webp', quality);
      if (!blob || blob.type !== 'image/webp')
        blob = await encode(canvas, 'image/jpeg', quality);
      release(canvas);
      if (!blob) break;
      best = blob;
      if (blob.size <= THUMB_MAX_BYTES) break;
      if (quality > 0.35) quality -= 0.12;
      else side = Math.round(side * 0.8);
    }
    if (!best) throw new Error('Não foi possível gerar a miniatura.');
    return best;
  } finally {
    bitmap.close();
  }
}
/** Foto direto da câmera aberta no app: não passa pela galeria do celular. */
export async function captureFrame(video: HTMLVideoElement) {
  const width = video.videoWidth,
    height = video.videoHeight;
  if (!width || !height) throw new Error('A câmera ainda não está pronta.');
  const canvas = draw(video, width, height);
  const blob = await encode(canvas, 'image/jpeg', 0.92);
  release(canvas);
  if (!blob) throw new Error('Não foi possível tirar a foto.');
  return blob;
}
