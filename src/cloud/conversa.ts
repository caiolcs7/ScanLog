import { cloudError, must, supabase } from './client';
import { BUCKET, type Sector } from './config';
import { operatorName } from './auth';
import { cloudChanged } from './api';
import type {
  ChatFile,
  CloudItem,
  CloudMessage,
  CloudPhoto,
  RequestKind,
  Side,
  Unit,
} from './types';

/**
 * Conversa por item: a estrutura pede o que falta para identificar (medida,
 * foto de um detalhe, uma informação) e o almoxarifado responde ali mesmo.
 * As regras e o resumo no item/lote ficam no banco (migração 0011).
 */
export async function listMessages(itemId: string) {
  const client = await supabase();
  return must<CloudMessage[]>(
    client
      .from('item_mensagens')
      .select('*')
      .eq('item_id', itemId)
      .order('criado_em'),
  );
}

export type Outgoing = {
  item: Pick<CloudItem, 'id' | 'lot_id'>;
  lado: Side;
  tipo: CloudMessage['tipo'];
  pedido?: RequestKind;
  texto?: string;
  medida?: number;
  unidade?: Unit;
  foto?: CloudPhoto;
  arquivo?: ChatFile;
  respondeA?: string;
};
export async function sendMessage(m: Outgoing) {
  const client = await supabase();
  const row = await must<CloudMessage>(
    client
      .from('item_mensagens')
      .insert({
        id: crypto.randomUUID(),
        item_id: m.item.id,
        lot_id: m.item.lot_id,
        lado: m.lado,
        autor_papel: m.lado,
        autor_nome: operatorName(),
        tipo: m.tipo,
        pedido: m.tipo === 'pedido' ? m.pedido : null,
        texto: m.texto?.trim().slice(0, 500) || null,
        medida: m.medida ?? null,
        unidade: m.medida ? (m.unidade ?? 'mm') : null,
        foto: m.foto ?? null,
        ...(m.arquivo ? { arquivo: m.arquivo } : {}),
        responde_a: m.respondeA ?? null,
        situacao: m.tipo === 'pedido' ? 'aberto' : null,
      })
      .select()
      .single(),
  );
  cloudChanged();
  return row;
}
/** Foto da conversa: vai para conversa/<lote>/<item>/, apagada na confirmação. */
export async function uploadChatPhoto(
  item: Pick<CloudItem, 'id' | 'lot_id'>,
  photo: { blob: Blob; width: number; height: number },
): Promise<CloudPhoto> {
  const client = await supabase();
  const path = `conversa/${item.lot_id}/${item.id}/${crypto.randomUUID()}.jpg`;
  const { error } = await client.storage
    .from(BUCKET)
    .upload(path, photo.blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw cloudError(error);
  return { path, width: photo.width, height: photo.height };
}
/** Tipos que o bucket aceita; o resto sobe como binário genérico. */
const KNOWN_TYPES = new Set([
  'image/png',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
]);
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** Arquivo da conversa: vai inteiro, com o nome original para baixar. */
export async function uploadChatFile(
  item: Pick<CloudItem, 'id' | 'lot_id'>,
  file: File,
): Promise<ChatFile> {
  if (file.size > MAX_FILE_BYTES)
    throw new Error('Arquivo maior que 20 MB. Envie um menor.');
  const client = await supabase();
  const ext = /\.([a-z0-9]{1,8})$/i.exec(file.name)?.[1]?.toLowerCase();
  const path = `conversa/${item.lot_id}/${item.id}/${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;
  const tipo = KNOWN_TYPES.has(file.type)
    ? file.type
    : 'application/octet-stream';
  const { error } = await client.storage
    .from(BUCKET)
    .upload(path, file, { contentType: tipo, upsert: false });
  if (error) throw cloudError(error);
  return { path, nome: file.name.slice(0, 120), tamanho: file.size, tipo };
}
/** Baixa o arquivo com o nome original. */
export async function downloadChatFile(f: ChatFile) {
  const client = await supabase();
  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrl(f.path, 600, { download: f.nome });
  if (error || !data?.signedUrl)
    throw new Error(
      'Arquivo indisponível. Ele é apagado quando o item é concluído.',
    );
  const a = document.createElement('a');
  a.href = data.signedUrl;
  a.download = f.nome;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
}
export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}
export async function markRead(itemId: string) {
  const client = await supabase();
  await must(client.rpc('conversa_lida', { p_item: itemId }));
  cloudChanged();
}
export async function cancelRequest(id: string) {
  const client = await supabase();
  await must(client.rpc('pedido_cancelar', { p_id: id }));
  cloudChanged();
}
/**
 * Mensagens novas na hora, só enquanto a conversa está aberta na tela (sem
 * conexão em segundo plano). Falha silenciosa: a tela também recarrega ao
 * voltar para o app e depois de cada envio.
 */
export function watchMessages(itemId: string, onChange: () => void) {
  let stop = () => {};
  let closed = false;
  void supabase()
    .then((client) => {
      if (closed) return;
      const channel = client
        .channel(`conversa-${itemId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'item_mensagens',
            filter: `item_id=eq.${itemId}`,
          },
          onChange,
        )
        .subscribe();
      stop = () => void client.removeChannel(channel);
    })
    .catch(() => {});
  return () => {
    closed = true;
    stop();
  };
}

/** Lado de quem escreve. O administrador fala pelos dois. */
export function sidesOf(sector: Sector): Side[] {
  return sector === 'admin'
    ? ['estrutura', 'almoxarifado']
    : [sector === 'estrutura' ? 'estrutura' : 'almoxarifado'];
}
/** Conversa com novidade para o setor (o administrador não marca leitura). */
export function unreadFor(
  item: Pick<
    CloudItem,
    'ultima_msg_em' | 'ultima_msg_lado' | 'lido_almox_em' | 'lido_estrutura_em'
  >,
  sector: Sector,
) {
  if (!item.ultima_msg_em || sector === 'admin') return false;
  const mine: Side = sector === 'estrutura' ? 'estrutura' : 'almoxarifado';
  if (item.ultima_msg_lado === mine) return false;
  const read =
    mine === 'estrutura' ? item.lido_estrutura_em : item.lido_almox_em;
  return !read || Date.parse(item.ultima_msg_em) > Date.parse(read);
}

export const requestLabel: Record<RequestKind, string> = {
  medida: 'Medida',
  foto: 'Foto',
  info: 'Pergunta',
};
export const sideLabel: Record<Side, string> = {
  almoxarifado: 'Almoxarifado',
  estrutura: 'Estrutura',
};
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
export const formatMeasure = (value: number, unit: Unit) =>
  unit === 'pol'
    ? `${number.format(value)}″`
    : `${number.format(value)} ${unit}`;
/** Aceita "12,5", "12.5" e "1/2" (polegada). */
export function parseMeasure(raw: string) {
  const clean = raw.trim().replace(/\s+/g, ' ');
  const fraction = /^(?:(\d+)[- +])?(\d+)\/(\d+)$/.exec(clean);
  if (fraction) {
    const whole = Number(fraction[1] ?? 0),
      n = Number(fraction[2]),
      d = Number(fraction[3]);
    return d ? whole + n / d : NaN;
  }
  const plain = clean.replace(/ /g, '');
  if (!/^\d+([.,]\d+)?$/.test(plain)) return NaN;
  return Number(plain.replace(',', '.'));
}
