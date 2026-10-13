import type { FindPhoto } from '../core/models';

const MAX_SIDE = 1600;

/** Reduz a foto da câmera (até 12 MP) para JPEG leve, preservando a orientação. */
export async function compressPhoto(file: Blob): Promise<FindPhoto> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: 'from-image',
  });
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale),
      height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível processar a foto.');
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.82),
    );
    if (!blob) throw new Error('Não foi possível processar a foto.');
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}
