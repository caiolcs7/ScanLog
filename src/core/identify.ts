import { db } from './database';
import type { FindItem, FindLot } from './models';

export const MAX_PHOTOS = 4;
export type FindDraft = Omit<FindItem, 'id' | 'lotId' | 'order' | 'createdAt'>;

export async function createLot(name: string) {
  const clean = name.trim();
  if (!clean || clean.length > 100)
    throw new Error('Informe um nome com até 100 caracteres.');
  const now = Date.now();
  const lot: FindLot = {
    id: crypto.randomUUID(),
    name: clean,
    createdAt: now,
    updatedAt: now,
    count: 0,
    nextOrder: 1,
  };
  await db.lots.add(lot);
  return lot;
}
export async function renameLot(id: string, name: string) {
  const clean = name.trim();
  if (!clean || clean.length > 100)
    throw new Error('Informe um nome com até 100 caracteres.');
  await db.lots.update(id, { name: clean, updatedAt: Date.now() });
}
export async function deleteLot(id: string) {
  await db.transaction('rw', db.lots, db.finds, async () => {
    await db.finds.where('lotId').equals(id).delete();
    await db.lots.delete(id);
  });
}
function check(draft: FindDraft) {
  if (!draft.photos.length) throw new Error('Tire ao menos uma foto.');
  if (draft.photos.length > MAX_PHOTOS)
    throw new Error(`Até ${MAX_PHOTOS} fotos por produto.`);
}
export async function addFind(lotId: string, draft: FindDraft) {
  check(draft);
  return db.transaction('rw', db.lots, db.finds, async () => {
    const lot = await db.lots.get(lotId);
    if (!lot) throw new Error('Lote não encontrado.');
    const item: FindItem = {
      ...draft,
      id: crypto.randomUUID(),
      lotId,
      order: lot.nextOrder,
      createdAt: Date.now(),
    };
    await db.finds.add(item);
    await db.lots.update(lotId, {
      count: lot.count + 1,
      nextOrder: lot.nextOrder + 1,
      updatedAt: Date.now(),
    });
    return item;
  });
}
export async function updateFind(item: FindItem, draft: FindDraft) {
  check(draft);
  await db.transaction('rw', db.lots, db.finds, async () => {
    await db.finds.put({ ...item, ...draft });
    await db.lots.update(item.lotId, { updatedAt: Date.now() });
  });
}
export async function removeFind(item: FindItem) {
  await db.transaction('rw', db.lots, db.finds, async () => {
    await db.finds.delete(item.id);
    await db.lots.update(item.lotId, {
      count: await db.finds.where('lotId').equals(item.lotId).count(),
      updatedAt: Date.now(),
    });
  });
}
/** Item 7 → "07"; mantém largura fixa na lista e no documento. */
export function itemLabel(order: number) {
  return String(order).padStart(2, '0');
}
