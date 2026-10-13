import { db } from '../core/database';
import { cloudError, supabase } from './client';
import { BUCKET } from './config';
import { cloudChanged } from './api';
import { operatorName } from './auth';

/** Foto do cadastro: já na nuvem (path) ou nova, ainda em memória (blob). */
export type DraftPhoto = {
  path: string;
  width: number;
  height: number;
  blob?: Blob;
};
export type ItemFields = {
  address: string | null;
  bombona: string | null;
  weight_g: number | null;
  note: string | null;
};
export type OutboxEntry = {
  id: string;
  createdAt: number;
  kind: 'lot' | 'item';
  lotId: string;
  itemId?: string;
  /** Lote novo ou item novo: insere; senão, atualiza. */
  isNew: boolean;
  createdBy: string;
  lotName?: string;
  fields?: ItemFields;
  /** Lista final de fotos; as que têm blob ainda precisam ser enviadas. */
  photos?: (DraftPhoto & { uploaded?: boolean })[];
  thumb?: { path: string; blob: Blob; uploaded?: boolean };
  removePaths?: string[];
  attempts: number;
  error?: string;
};

let last = 0;
/** Ordem estrita da fila: o lote sempre sobe antes dos seus itens. */
function sequence() {
  last = Math.max(Date.now(), last + 1);
  return last;
}
export function photoPath(lotId: string, itemId: string) {
  return `originais/${lotId}/${itemId}/${crypto.randomUUID()}.jpg`;
}
export function thumbPath(lotId: string, itemId: string, blob: Blob) {
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  return `miniaturas/${lotId}/${itemId}-${Date.now().toString(36)}.${ext}`;
}

export async function queueLot(lotId: string, name: string) {
  const clean = name.trim();
  if (!clean || clean.length > 100)
    throw new Error('Informe um nome com até 100 caracteres.');
  await db.outbox.add({
    id: crypto.randomUUID(),
    createdAt: sequence(),
    kind: 'lot',
    lotId,
    isNew: true,
    createdBy: operatorName(),
    lotName: clean,
    attempts: 0,
  });
  void flushOutbox();
}
/**
 * Guarda o cadastro no aparelho e envia em seguida. Sem sinal, fica na fila
 * e sai sozinho quando a conexão voltar: nenhum cadastro se perde.
 */
export async function queueItem(entry: {
  lotId: string;
  itemId: string;
  isNew: boolean;
  fields: ItemFields;
  photos: DraftPhoto[];
  thumb?: { path: string; blob: Blob };
  removePaths: string[];
}) {
  await db.transaction('rw', db.outbox, async () => {
    // Edição de um item que ainda não subiu: substitui o pendente.
    const previous = await db.outbox
      .where('itemId')
      .equals(entry.itemId)
      .first();
    const stillLocal = new Set(
      previous?.photos?.filter((p) => !p.uploaded).map((p) => p.path),
    );
    await db.outbox.put({
      id: previous?.id ?? crypto.randomUUID(),
      createdAt: previous?.createdAt ?? sequence(),
      kind: 'item',
      lotId: entry.lotId,
      itemId: entry.itemId,
      isNew: previous?.isNew ?? entry.isNew,
      createdBy: previous?.createdBy ?? operatorName(),
      fields: entry.fields,
      photos: entry.photos.map((p) => ({
        ...p,
        uploaded:
          !p.blob ||
          (previous?.photos?.some((q) => q.path === p.path && q.uploaded) ??
            false),
      })),
      thumb: entry.thumb ?? previous?.thumb,
      removePaths: [
        ...(previous?.removePaths ?? []),
        ...entry.removePaths.filter((p) => !stillLocal.has(p)),
      ],
      attempts: 0,
    });
  });
  void flushOutbox();
}
export async function discardEntry(id: string) {
  await db.outbox.delete(id);
  cloudChanged();
}

let running: Promise<void> | null = null,
  retry: ReturnType<typeof setTimeout> | undefined;
/** Envia a fila em ordem. Uma falha para a fila e tenta de novo depois. */
export function flushOutbox() {
  running ??= run().finally(() => (running = null));
  return running;
}
async function run() {
  clearTimeout(retry);
  if (!navigator.onLine) return;
  const client = await supabase();
  const { data } = await client.auth.getSession();
  if (data.session?.user.app_metadata?.role !== 'almoxarifado') return;
  for (;;) {
    const entry = await db.outbox.orderBy('createdAt').first();
    if (!entry) return;
    try {
      await send(entry);
      await db.outbox.delete(entry.id);
      cloudChanged();
    } catch (error) {
      await db.outbox.update(entry.id, {
        attempts: entry.attempts + 1,
        error: cloudError(error).message,
      });
      cloudChanged();
      // Nova tentativa só com o app na tela, para não gastar bateria.
      if (document.visibilityState === 'visible')
        retry = setTimeout(
          () => void flushOutbox(),
          Math.min(5, entry.attempts + 1) * 20_000,
        );
      return;
    }
  }
}
async function send(entry: OutboxEntry) {
  const client = await supabase();
  if (entry.kind === 'lot') {
    const { error } = await client.from('lots').upsert({
      id: entry.lotId,
      name: entry.lotName,
      created_by: entry.createdBy,
    });
    if (error) throw error;
    return;
  }
  const storage = client.storage.from(BUCKET);
  for (const photo of entry.photos ?? []) {
    if (photo.uploaded || !photo.blob) continue;
    const { error } = await storage.upload(photo.path, photo.blob, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (error) throw error;
    photo.uploaded = true;
    await db.outbox.update(entry.id, { photos: entry.photos });
  }
  if (entry.thumb && !entry.thumb.uploaded) {
    const { error } = await storage.upload(entry.thumb.path, entry.thumb.blob, {
      contentType: entry.thumb.blob.type || 'image/jpeg',
      upsert: true,
    });
    if (error) throw error;
    entry.thumb.uploaded = true;
    await db.outbox.update(entry.id, { thumb: entry.thumb });
  }
  const row = {
    ...entry.fields,
    photos: (entry.photos ?? []).map(({ path, width, height }) => ({
      path,
      width,
      height,
    })),
    ...(entry.thumb ? { thumb_path: entry.thumb.path } : {}),
  };
  const { error } = entry.isNew
    ? await client.from('items').upsert({
        id: entry.itemId,
        lot_id: entry.lotId,
        created_by: entry.createdBy,
        ...row,
      })
    : await client.from('items').update(row).eq('id', entry.itemId!);
  if (error) throw error;
  if (entry.removePaths?.length) await storage.remove(entry.removePaths);
}
let listening = false;
/** Reenvia ao voltar a conexão ou o app para a tela. */
export function watchOutbox() {
  if (listening) return;
  listening = true;
  window.addEventListener('online', () => void flushOutbox());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flushOutbox();
    else clearTimeout(retry);
  });
  void flushOutbox();
}
