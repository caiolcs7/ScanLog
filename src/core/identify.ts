import { db } from './database';
import { photoPath, queueItem, queueLot, thumbPath } from '../cloud/outbox';
import { makeThumbnail } from '../services/photo';

export const MAX_PHOTOS = 4;

/** Item 7 → "07"; mantém largura fixa na lista e no documento. */
export function itemLabel(order: number) {
  return String(order).padStart(2, '0');
}
/** Lotes da versão anterior, guardados só neste aparelho. */
export function countLocalLots() {
  return db.lots.count();
}
/**
 * Leva os lotes locais para a fila de envio da nuvem. Cada lote só é
 * apagado do aparelho depois que todos os seus itens estão na fila (que
 * também fica no aparelho e envia sozinha quando houver sinal).
 */
export async function migrateLocalLots() {
  const lots = await db.lots.orderBy('updatedAt').toArray();
  for (const lot of lots) {
    await queueLot(lot.id, lot.name);
    const finds = await db.finds
      .where('[lotId+order]')
      .between([lot.id, 0], [lot.id, Infinity])
      .toArray();
    for (const find of finds) {
      const thumb = find.photos[0]
        ? await makeThumbnail(find.photos[0].blob)
        : undefined;
      await queueItem({
        lotId: lot.id,
        itemId: find.id,
        isNew: true,
        fields: {
          address: find.address ?? null,
          bombona: find.bombona ?? null,
          weight_g: find.weight ?? null,
          note: find.note ?? null,
        },
        photos: find.photos.map((p) => ({
          ...p,
          path: photoPath(lot.id, find.id),
        })),
        thumb: thumb && {
          path: thumbPath(lot.id, find.id, thumb),
          blob: thumb,
        },
        removePaths: [],
      });
    }
    await db.transaction('rw', db.lots, db.finds, async () => {
      await db.finds.where('lotId').equals(lot.id).delete();
      await db.lots.delete(lot.id);
    });
  }
  return lots.length;
}
