import type { Worker } from 'tesseract.js';
import { extractDescription } from '../core/description';

let worker: Promise<Worker> | null = null;
function getWorker() {
  // Loaded on demand: the OCR engine and Portuguese model are only fetched
  // when the operator enables description reading.
  worker ??= import('tesseract.js').then(({ createWorker }) =>
    createWorker('por'),
  );
  worker.catch(() => (worker = null));
  return worker;
}
export function warmUpOcr() {
  void getWorker().catch(() => {});
}
/**
 * Reads the printed description of a label from a transient camera frame.
 * The frame is wiped right after recognition; no image is stored.
 */
export async function readDescription(
  frame: HTMLCanvasElement,
  code: string,
): Promise<string> {
  try {
    const { data } = await (await getWorker()).recognize(frame);
    return extractDescription(data.text, code);
  } finally {
    discardFrame(frame);
  }
}
export function discardFrame(frame?: HTMLCanvasElement) {
  if (!frame) return;
  frame.getContext('2d')?.clearRect(0, 0, frame.width, frame.height);
  frame.width = 0;
  frame.height = 0;
}
