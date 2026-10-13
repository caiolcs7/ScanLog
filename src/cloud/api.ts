import { must, supabase } from './client';
import { BUCKET } from './config';
import { operatorName } from './auth';
import type { CloudItem, CloudLot } from './types';

/** Avisa as telas abertas que os dados da nuvem mudaram. */
export const cloudEvents = new EventTarget();
export function cloudChanged() {
  cloudEvents.dispatchEvent(new Event('change'));
}

export async function listLots() {
  const client = await supabase();
  return must<CloudLot[]>(
    client
      .from('lots')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(300),
  );
}
export async function getLot(id: string) {
  const client = await supabase();
  return must<CloudLot | null>(
    client.from('lots').select('*').eq('id', id).maybeSingle(),
  );
}
export async function listItems(lotId: string) {
  const client = await supabase();
  return must<CloudItem[]>(
    client.from('items').select('*').eq('lot_id', lotId).order('ord'),
  );
}
/** Itens de vários lotes, para a planilha do período. */
export async function listItemsOf(lotIds: string[]) {
  if (!lotIds.length) return [];
  const client = await supabase();
  const all: CloudItem[] = [];
  for (let i = 0; i < lotIds.length; i += 50)
    all.push(
      ...(await must<CloudItem[]>(
        client
          .from('items')
          .select('*')
          .in('lot_id', lotIds.slice(i, i + 50))
          .order('ord'),
      )),
    );
  return all;
}
export async function renameLot(id: string, name: string) {
  const clean = name.trim();
  if (!clean || clean.length > 100)
    throw new Error('Informe um nome com até 100 caracteres.');
  const client = await supabase();
  await must(client.from('lots').update({ name: clean }).eq('id', id));
  cloudChanged();
}
export async function sendLot(id: string) {
  const client = await supabase();
  await must(client.from('lots').update({ status: 'enviado' }).eq('id', id));
  cloudChanged();
}
export async function deleteLot(lot: CloudLot) {
  const client = await supabase();
  const items = await listItems(lot.id);
  await removeFiles(items.flatMap(itemPaths));
  await must(client.from('lots').delete().eq('id', lot.id));
  cloudChanged();
}
export async function deleteItem(item: CloudItem) {
  const client = await supabase();
  await must(client.from('items').delete().eq('id', item.id));
  await removeFiles(itemPaths(item));
  cloudChanged();
}
export function itemPaths(item: Pick<CloudItem, 'photos' | 'thumb_path'>) {
  return [
    ...item.photos.map((p) => p.path),
    ...(item.thumb_path ? [item.thumb_path] : []),
  ];
}
async function removeFiles(paths: string[]) {
  if (!paths.length) return;
  const client = await supabase();
  // Falha aqui não bloqueia: a limpeza diária remove o que sobrar.
  await client.storage.from(BUCKET).remove(paths);
}

/** Estrutura: grava o código do item. */
export async function setCode(item: CloudItem, code: string) {
  const client = await supabase();
  return must<CloudItem>(
    client
      .from('items')
      .update({
        status: 'codificado',
        code,
        code_note: null,
        coded_by: operatorName(),
      })
      .eq('id', item.id)
      .select()
      .single(),
  ).finally(cloudChanged);
}
/** Estrutura: item que não foi possível identificar. */
export async function setNoCode(item: CloudItem, reason: string) {
  const clean = reason.trim();
  if (!clean) throw new Error('Explique por que está sem código.');
  const client = await supabase();
  return must<CloudItem>(
    client
      .from('items')
      .update({
        status: 'sem_codigo',
        code: null,
        code_note: clean.slice(0, 500),
        coded_by: operatorName(),
      })
      .eq('id', item.id)
      .select()
      .single(),
  ).finally(cloudChanged);
}
/**
 * Almoxarifado: confirma o retorno. Os originais são apagados e fica só a
 * miniatura, que a limpeza diária remove depois de 150 dias.
 */
export async function confirmItems(items: CloudItem[]) {
  const client = await supabase();
  const ready = items.filter(
    (i) => i.status === 'codificado' || i.status === 'sem_codigo',
  );
  for (let i = 0; i < ready.length; i += 50) {
    const ids = ready.slice(i, i + 50).map((item) => item.id);
    await must(
      client
        .from('items')
        .update({ status: 'confirmado', confirmed_by: operatorName() })
        .in('id', ids),
    );
  }
  const withPhotos = ready.filter((i) => i.photos.length);
  await removeFiles(withPhotos.flatMap((i) => i.photos.map((p) => p.path)));
  for (let i = 0; i < withPhotos.length; i += 50)
    await client
      .from('items')
      .update({ photos: [] })
      .in(
        'id',
        withPhotos.slice(i, i + 50).map((item) => item.id),
      );
  cloudChanged();
  return ready.length;
}
/** Almoxarifado: devolve o item à estrutura com o motivo. */
export async function returnItem(item: CloudItem, reason: string) {
  const clean = reason.trim();
  if (!clean) throw new Error('Explique o que precisa ser revisto.');
  const client = await supabase();
  await must(
    client
      .from('items')
      .update({ status: 'pendente', code_note: clean.slice(0, 500) })
      .eq('id', item.id),
  );
  cloudChanged();
}

type Cached = { url: string; expires: number };
const urls = new Map<string, Cached>();
/** URLs assinadas por 1 h, pedidas em lote e reaproveitadas. */
export async function signedUrls(paths: string[]) {
  const now = Date.now(),
    missing = [...new Set(paths)].filter(
      (p) => (urls.get(p)?.expires ?? 0) < now + 60_000,
    );
  if (missing.length) {
    const client = await supabase();
    const { data, error } = await client.storage
      .from(BUCKET)
      .createSignedUrls(missing, 3600);
    if (error) throw error;
    for (const row of data ?? [])
      if (row.path && row.signedUrl)
        urls.set(row.path, { url: row.signedUrl, expires: now + 3600_000 });
  }
  return Object.fromEntries(
    paths.flatMap((p) => {
      const cached = urls.get(p);
      return cached ? [[p, cached.url]] : [];
    }),
  ) as Record<string, string>;
}
/** Baixa uma foto do bucket (Word). */
export async function downloadPhoto(path: string) {
  const client = await supabase();
  const { data, error } = await client.storage.from(BUCKET).download(path);
  if (error) throw error;
  return data;
}
