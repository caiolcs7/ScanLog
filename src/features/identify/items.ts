import type { DraftPhoto, OutboxEntry } from '../../cloud/outbox';
import type { CloudItem, CloudLot } from '../../cloud/types';

/** Item como aparece na tela: o da nuvem com o que ainda está na fila. */
export type ItemView = CloudItem & {
  draftPhotos: DraftPhoto[];
  /** Cadastro ou edição ainda no aparelho. */
  pending?: OutboxEntry;
};
export function mergeItems(
  lotId: string,
  cloud: CloudItem[],
  pending: OutboxEntry[],
): ItemView[] {
  const byId = new Map<string, ItemView>(
    cloud.map((item) => [item.id, { ...item, draftPhotos: item.photos }]),
  );
  let next = cloud.reduce((n, i) => Math.max(n, i.ord), 0);
  for (const entry of pending) {
    if (entry.kind !== 'item' || !entry.itemId || !entry.fields) continue;
    const photos = entry.photos ?? [];
    const current = byId.get(entry.itemId);
    byId.set(entry.itemId, {
      ...(current ?? {
        id: entry.itemId,
        lot_id: lotId,
        ord: ++next,
        status: 'pendente',
        thumb_path: null,
        created_at: new Date(entry.createdAt).toISOString(),
        created_by: entry.createdBy,
        code: null,
        code_note: null,
        coded_at: null,
        coded_by: null,
        confirmed_at: null,
        confirmed_by: null,
        photos_deleted_at: null,
        thumb_expires_at: null,
        updated_at: new Date(entry.createdAt).toISOString(),
      }),
      ...entry.fields,
      photos: photos.map(({ path, width, height }) => ({
        path,
        width,
        height,
      })),
      draftPhotos: photos,
      pending: entry,
    });
  }
  return [...byId.values()].sort((a, b) => a.ord - b.ord);
}
/** Lote criado no aparelho que ainda não subiu. */
export function pendingLot(entry: OutboxEntry): CloudLot {
  const at = new Date(entry.createdAt).toISOString();
  return {
    id: entry.lotId,
    name: entry.lotName ?? 'Lote',
    status: 'rascunho',
    item_count: 0,
    coded_count: 0,
    confirmed_count: 0,
    created_at: at,
    created_by: entry.createdBy,
    sent_at: null,
    coded_at: null,
    confirmed_at: null,
    updated_at: at,
  };
}
export const fullDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      })
        .format(new Date(value))
        .replace(', ', ' às ')
    : '';
