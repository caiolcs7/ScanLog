// Notificações da Identificação (Web Push). Deploy com verify_jwt = false:
// o banco chama esta função sem token. Ela não confia no corpo: relê o lote ou
// o item com a service_role e avisa cada evento uma única vez (push_enviados).
//   { tipo: 'chave' }            → devolve a chave pública VAPID (gera na 1ª vez)
//   { tipo: 'lote', id }         → estrutura: chegou levantamento novo
//   { tipo: 'item', id }         → almoxarifado (só a pessoa dona do lote): código preenchido
//   { tipo: 'mensagem', id }     → o outro setor: pedido, resposta ou recado
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';

const CONTATO = 'https://caiolcs7.github.io/ScanLog/';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

let server: Promise<{ app: webpush.ApplicationServer; publica: string }> | null =
  null;
/** Chaves VAPID guardadas no banco; geradas e salvas no primeiro uso. */
function servidor() {
  server ??= (async () => {
    let { data } = await db.from('push_chaves').select('chaves').eq('id', 1).maybeSingle();
    if (!data) {
      const novas = await webpush.exportVapidKeys(
        await webpush.generateVapidKeys({ extractable: true }),
      );
      await db.from('push_chaves').upsert({ id: 1, chaves: novas }, { onConflict: 'id', ignoreDuplicates: true });
      ({ data } = await db.from('push_chaves').select('chaves').eq('id', 1).single());
    }
    const keys = await webpush.importVapidKeys(data!.chaves, { extractable: false });
    const app = await webpush.ApplicationServer.new({ contactInformation: CONTATO, vapidKeys: keys });
    const publica = await webpush.exportApplicationServerKey(keys);
    return { app, publica };
  })().catch((e) => {
    server = null;
    throw e;
  });
  return server;
}

/** Marca o evento como avisado; false se já tinha sido. */
async function primeiraVez(chave: string) {
  const { error } = await db.from('push_enviados').insert({ chave });
  if (!error) return true;
  if (error.code === '23505') return false;
  throw error;
}

/** Conta da pessoa dona do lote: no almoxarifado, só ela recebe o aviso. */
async function contaDoDono(lotId: string) {
  const { data } = await db.from('lots').select('dono').eq('id', lotId).maybeSingle();
  if (!data?.dono) return null;
  const { data: p } = await db.from('pessoas').select('user_id, ativo').eq('id', data.dono).maybeSingle();
  return p?.ativo ? (p.user_id as string | null) : null;
}

async function enviar(
  papeis: string[],
  aviso: { title: string; body: string; tag: string; url: string },
  lotId?: string,
) {
  const { app } = await servidor();
  const { data: todas, error } = await db
    .from('push_inscricoes')
    .select('endpoint, p256dh, auth, papel, user_id')
    .in('papel', papeis);
  if (error) throw error;
  // Almoxarifado: cada pessoa só recebe avisos dos lotes dela.
  const dono = lotId && papeis.includes('almoxarifado') ? await contaDoDono(lotId) : null;
  const inscricoes = (todas ?? []).filter((s) =>
    s.papel !== 'almoxarifado' || (dono !== null && s.user_id === dono)
  );
  let enviados = 0;
  await Promise.all(
    inscricoes.map(async (s) => {
      try {
        await app
          .subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
          .pushTextMessage(JSON.stringify(aviso), { ttl: 86400, urgency: webpush.Urgency.High });
        enviados++;
      } catch (e) {
        // Inscrição vencida (aparelho trocou, app desinstalado): remove.
        const status = e instanceof webpush.PushMessageError ? e.response.status : 0;
        if (status === 404 || status === 410)
          await db.from('push_inscricoes').delete().eq('endpoint', s.endpoint);
        else console.error('push falhou', status, String(e));
      }
    }),
  );
  return enviados;
}

const itens = (n: number) => `${n} ${n === 1 ? 'item' : 'itens'}`;
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

type Mensagem = {
  id: string;
  item_id: string;
  lot_id: string;
  lado: 'almoxarifado' | 'estrutura';
  autor_papel: string;
  autor_nome: string;
  tipo: 'pedido' | 'resposta' | 'texto';
  pedido: 'medida' | 'foto' | 'info' | null;
  texto: string | null;
  medida: number | null;
  unidade: string | null;
  foto: unknown;
  arquivo: { nome?: string } | null;
};
/** Título e texto do aviso de uma mensagem da conversa. */
function avisoMensagem(m: Mensagem) {
  const quem = m.lado === 'estrutura' ? 'Estrutura' : 'Almoxarifado';
  const medida = m.medida != null
    ? m.unidade === 'pol' ? `${numero.format(m.medida)}″` : `${numero.format(m.medida)} ${m.unidade}`
    : '';
  const partes = [
    medida,
    m.foto && m.tipo !== 'pedido' ? 'Foto' : '',
    m.arquivo ? `Arquivo ${m.arquivo.nome ?? ''}` : '',
    m.texto ?? '',
  ]
    .filter(Boolean)
    .join(' · ');
  const titulo = m.tipo === 'pedido'
    ? m.pedido === 'medida'
      ? 'Estrutura pediu uma medida'
      : m.pedido === 'foto'
      ? 'Estrutura pediu uma foto'
      : 'Estrutura tem uma pergunta'
    : m.tipo === 'resposta'
    ? 'Almoxarifado respondeu'
    : `${quem}: nova mensagem`;
  return { titulo, texto: partes.slice(0, 160) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ erro: 'Use POST' }, 405);
  let pedido: { tipo?: string; id?: string };
  try {
    pedido = await req.json();
  } catch {
    return json({ erro: 'JSON inválido' }, 400);
  }
  try {
    if (pedido.tipo === 'chave') return json({ chave: (await servidor()).publica });
    if (!pedido.id || !UUID.test(pedido.id)) return json({ erro: 'id inválido' }, 400);

    if (pedido.tipo === 'lote') {
      const { data: lote } = await db
        .from('lots')
        .select('id, name, status, item_count, created_by')
        .eq('id', pedido.id)
        .maybeSingle();
      if (!lote || lote.status === 'rascunho') return json({ enviados: 0 });
      if (!(await primeiraVez(`lote:${lote.id}`))) return json({ enviados: 0 });
      const enviados = await enviar(['estrutura', 'admin'], {
        title: 'Novo levantamento para identificar',
        body: `${lote.name} · ${itens(lote.item_count)} · enviado por ${lote.created_by}`,
        tag: `lote-${lote.id}`,
        url: `#/identificacao/${lote.id}`,
      });
      return json({ enviados });
    }

    if (pedido.tipo === 'item') {
      const { data: item } = await db
        .from('items')
        .select('id, lot_id, ord, status, code, code_note, coded_at, coded_by')
        .eq('id', pedido.id)
        .maybeSingle();
      if (!item || !['codificado', 'sem_codigo'].includes(item.status) || !item.coded_at)
        return json({ enviados: 0 });
      if (!(await primeiraVez(`item:${item.id}:${item.coded_at}`))) return json({ enviados: 0 });
      const { data: lote } = await db
        .from('lots')
        .select('name, item_count, coded_count')
        .eq('id', item.lot_id)
        .maybeSingle();
      const numero = String(item.ord).padStart(2, '0');
      const feito = item.status === 'codificado'
        ? `código ${item.code}`
        : `sem código (${item.code_note ?? ''})`;
      const enviados = await enviar(['almoxarifado', 'admin'], {
        title: lote && lote.coded_count >= lote.item_count
          ? `Lote pronto para conferir: ${lote.name}`
          : `Código preenchido: ${lote?.name ?? 'lote'}`,
        body: `Item ${numero}: ${feito} · por ${item.coded_by ?? 'Estrutura'}` +
          (lote ? ` · ${lote.coded_count}/${lote.item_count}` : ''),
        // Mesmo lote: o aviso novo substitui o anterior, sem encher a tela.
        tag: `codigos-${item.lot_id}`,
        url: `#/identificacao/${item.lot_id}`,
      }, item.lot_id);
      return json({ enviados });
    }
    if (pedido.tipo === 'mensagem') {
      const { data: m } = await db
        .from('item_mensagens')
        .select('id, item_id, lot_id, lado, autor_papel, autor_nome, tipo, pedido, texto, medida, unidade, foto, arquivo')
        .eq('id', pedido.id)
        .maybeSingle<Mensagem>();
      if (!m) return json({ enviados: 0 });
      if (!(await primeiraVez(`msg:${m.id}`))) return json({ enviados: 0 });
      const [{ data: item }, { data: lote }] = await Promise.all([
        db.from('items').select('ord').eq('id', m.item_id).maybeSingle(),
        db.from('lots').select('name').eq('id', m.lot_id).maybeSingle(),
      ]);
      const destino = m.lado === 'estrutura' ? ['almoxarifado'] : ['estrutura'];
      // O administrador recebe tudo, menos o que ele mesmo escreveu.
      if (m.autor_papel !== 'admin') destino.push('admin');
      const { titulo, texto } = avisoMensagem(m);
      const enviados = await enviar(destino, {
        title: titulo,
        body: `Item ${String(item?.ord ?? '').padStart(2, '0')} · ${lote?.name ?? 'lote'}` +
          (texto ? `: ${texto}` : '') + ` · ${m.autor_nome}`,
        // Mesmo item: o aviso novo substitui o anterior.
        tag: `conversa-${m.item_id}`,
        url: `#/identificacao/${m.lot_id}?conversa=${m.item_id}`,
      }, m.lot_id);
      return json({ enviados });
    }
    return json({ erro: 'tipo inválido' }, 400);
  } catch (e) {
    console.error(e);
    return json({ erro: 'falha interna' }, 500);
  }
});
