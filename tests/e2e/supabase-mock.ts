import type { Page, Route } from '@playwright/test';

/**
 * Supabase falso em memória para os testes de ponta a ponta: autenticação por
 * setor, tabelas lots/items com as mesmas regras dos gatilhos e o Storage.
 */
type Row = Record<string, unknown> & { id: string };
type Table = 'lots' | 'items' | 'messages';
const HOST = 'https://pygedyytlcplfweibenv.supabase.co';
function jwt(payload: object) {
  const part = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part(payload)}.assinatura`;
}
export const passwords = {
  almoxarifado: 'senha-almox',
  estrutura: 'senha-estr',
  /** Conta antiga, compartilhada pelo almoxarifado inteiro. */
  compartilhada: 'senha-setor',
};
/** Pessoas do almoxarifado (usuário → conta própria). */
export const people: Record<
  string,
  { id: string; userId: string; nome: string; password: string }
> = {
  caio: {
    id: 'pessoa-caio',
    userId: '00000000-0000-4000-8000-000000000001',
    nome: 'Caio',
    password: passwords.almoxarifado,
  },
  ilidio: {
    id: 'pessoa-ilidio',
    userId: '00000000-0000-4000-8000-000000000003',
    nome: 'Ilídio Nascimento Alves',
    password: 'senha-ilidio',
  },
};
const SHARED_ID = '00000000-0000-4000-8000-000000000009';
const key = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

/** Sessão de uma conta (o que o Supabase devolve ao entrar). */
export function sessionFor(local: string) {
  const person = people[local];
  const role = person ? 'almoxarifado' : local;
  const id = person
    ? person.userId
    : local === 'almoxarifado'
      ? SHARED_ID
      : '00000000-0000-4000-8000-000000000002';
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const app_metadata = {
    provider: 'email',
    role,
    ...(person ? { nome: person.nome } : {}),
  };
  const user = {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: `${local}@scanlog.app`,
    app_metadata,
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  return {
    access_token: jwt({ sub: id, exp, role: 'authenticated', app_metadata }),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: 'refresh-' + local,
    user,
  };
}

export class SupabaseMock {
  lots: Row[] = [];
  items: Row[] = [];
  messages: Row[] = [];
  files = new Map<string, Buffer>();
  removed: string[] = [];
  /** Pessoas que trocaram da conta compartilhada para a própria. */
  migrated: string[] = [];
  /** Último número de lote dado (sequência do servidor). */
  lastNumber = 0;
  async install(page: Page) {
    await page.route(`${HOST}/**`, (route) => this.handle(route));
  }
  /** Pessoa da conta que chamou (nula na conta compartilhada e na estrutura). */
  private person(route: Route) {
    const auth = route.request().headers()['authorization'] ?? '';
    try {
      const sub = JSON.parse(
        Buffer.from(
          auth.replace('Bearer ', '').split('.')[1],
          'base64url',
        ).toString(),
      ).sub as string;
      return Object.values(people).find((p) => p.userId === sub) ?? null;
    } catch {
      return null;
    }
  }
  private sector(route: Route) {
    const auth = route.request().headers()['authorization'] ?? '';
    const token = auth.replace('Bearer ', '');
    try {
      return JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString(),
      ).app_metadata?.role as string | undefined;
    } catch {
      return undefined;
    }
  }
  private async handle(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
        headers: { 'access-control-allow-origin': '*' },
      });
    if (request.method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': '*',
        },
      });
    if (path === '/auth/v1/token') {
      const { email, password } = request.postDataJSON();
      const local = String(email).split('@')[0];
      const expected =
        people[local]?.password ??
        (local === 'almoxarifado'
          ? passwords.compartilhada
          : local === 'estrutura'
            ? passwords.estrutura
            : undefined);
      if (!expected || expected !== password)
        return json(
          {
            error: 'invalid_grant',
            error_description: 'Invalid login credentials',
            code: 'invalid_credentials',
            msg: 'Invalid login credentials',
          },
          400,
        );
      return json(sessionFor(local));
    }
    // Troca automática: a conta compartilhada recebe o token da pessoa.
    if (path === '/functions/v1/pessoas') {
      const body = request.postDataJSON() as { tipo: string; nome?: string };
      if (body.tipo !== 'migrar' || this.sector(route) !== 'almoxarifado')
        return json({ erro: 'tipo inválido' }, 400);
      const login = Object.entries(people).find(
        ([, p]) => key(p.nome) === key(body.nome ?? ''),
      )?.[0];
      if (!login) return json({ erro: 'sem_pessoa' }, 409);
      this.migrated.push(login);
      return json({ token_hash: 'otp-' + login });
    }
    if (path === '/auth/v1/verify') {
      const { token_hash } = request.postDataJSON() as { token_hash: string };
      const login = String(token_hash).replace(/^otp-/, '');
      if (!people[login]) return json({ msg: 'Token has expired' }, 403);
      return json(sessionFor(login));
    }
    if (path.startsWith('/auth/v1/logout'))
      return route.fulfill({ status: 204 });
    if (path.startsWith('/rest/v1/'))
      return this.rest(route, path.slice(9), url, json);
    if (path.startsWith('/storage/v1/'))
      return this.storage(route, path.slice(12), url, json);
    return json({ message: 'não simulado: ' + path }, 404);
  }
  private filter(rows: Row[], url: URL) {
    let result = rows;
    for (const [key, value] of url.searchParams) {
      if (['select', 'order', 'limit', 'columns', 'on_conflict'].includes(key))
        continue;
      const [op, ...rest] = value.split('.');
      const arg = rest.join('.');
      if (op === 'eq') result = result.filter((r) => String(r[key]) === arg);
      if (op === 'in') {
        const list = arg
          .replace(/^\(|\)$/g, '')
          .split(',')
          .map((v) => v.replace(/"/g, ''));
        result = result.filter((r) => list.includes(String(r[key])));
      }
    }
    const order = url.searchParams.get('order');
    if (order) {
      const [col, dir] = order.split('.');
      result = [...result].sort(
        (a, b) =>
          String(a[col]).localeCompare(String(b[col]), 'en', {
            numeric: true,
          }) * (dir === 'desc' ? -1 : 1),
      );
    }
    return result;
  }
  private refresh(lotId: string) {
    const lot = this.lots.find((l) => l.id === lotId);
    if (!lot) return;
    const items = this.items.filter((i) => i.lot_id === lotId);
    const coded = items.filter((i) => i.status !== 'pendente').length,
      confirmed = items.filter((i) => i.status === 'confirmado').length;
    const unread = (i: Row, side: string) =>
      !!i.ultima_msg_em &&
      i.ultima_msg_lado !== side &&
      String(i.ultima_msg_em) >
        String(
          (side === 'estrutura' ? i.lido_estrutura_em : i.lido_almox_em) ?? '',
        );
    Object.assign(lot, {
      pedidos_abertos: items.filter((i) => Number(i.pedidos_abertos) > 0)
        .length,
      novas_almox: items.filter((i) => unread(i, 'almoxarifado')).length,
      novas_estrutura: items.filter((i) => unread(i, 'estrutura')).length,
      item_count: items.length,
      coded_count: coded,
      confirmed_count: confirmed,
      updated_at: new Date().toISOString(),
      status:
        lot.status === 'rascunho'
          ? 'rascunho'
          : items.length && confirmed === items.length
            ? 'confirmado'
            : items.length && coded === items.length
              ? 'codificado'
              : 'enviado',
    });
  }
  private visible(table: Table, sector?: string, me?: { id: string } | null) {
    if (sector !== 'almoxarifado' && sector !== 'estrutura') return [];
    if (sector === 'almoxarifado') {
      // Cada pessoa só vê os lotes dela (migração 0013).
      const mine = new Set(
        this.lots.filter((l) => me && l.dono === me.id).map((l) => l.id),
      );
      return table === 'lots'
        ? this.lots.filter((l) => mine.has(l.id))
        : this[table].filter((i) => mine.has(String(i.lot_id)));
    }
    const sent = new Set(
      this.lots.filter((l) => l.status !== 'rascunho').map((l) => l.id),
    );
    return table === 'lots'
      ? this.lots.filter((l) => sent.has(l.id))
      : this[table].filter((i) => sent.has(String(i.lot_id)));
  }
  /** Conversa: mesmas regras e resumo da migração 0011. */
  private chatSummary(itemId: string) {
    const item = this.items.find((i) => i.id === itemId);
    if (!item) return;
    const list = this.messages.filter((m) => m.item_id === itemId);
    const last = list.at(-1);
    Object.assign(item, {
      msg_count: list.length,
      pedidos_abertos: list.filter((m) => m.situacao === 'aberto').length,
    });
    if (last)
      Object.assign(item, {
        ultima_msg: [
          last.pedido
            ? { medida: 'Medida', foto: 'Foto', info: 'Pergunta' }[
                String(last.pedido)
              ]
            : '',
          last.medida != null
            ? `${String(last.medida).replace('.', ',')} ${last.unidade}`
            : '',
          last.foto && last.tipo !== 'pedido' ? 'Foto' : '',
          last.arquivo
            ? `Arquivo ${(last.arquivo as { nome: string }).nome}`
            : '',
          last.texto ?? '',
        ]
          .filter(Boolean)
          .join(' · '),
        ultima_msg_em: last.criado_em,
        ultima_msg_lado: last.lado,
      });
    this.refresh(String(item.lot_id));
  }
  private addMessage(body: Row, sector?: string, me?: { id: string } | null) {
    const item = this.visible('items', sector, me).find(
      (i) => i.id === body.item_id,
    );
    const lot = this.lots.find((l) => l.id === item?.lot_id);
    if (!item || !lot) throw new Error('Item não encontrado.');
    if (lot.status === 'rascunho')
      throw new Error('Envie o lote para a estrutura antes de conversar.');
    if (item.status === 'confirmado') throw new Error('Item já confirmado.');
    if (body.lado !== sector) throw new Error('Lado inválido.');
    if (body.tipo === 'pedido' && sector !== 'estrutura')
      throw new Error('Só a estrutura faz pedidos.');
    if (body.tipo === 'resposta') {
      const target = this.messages.find((m) => m.id === body.responde_a);
      if (!target || target.situacao !== 'aberto')
        throw new Error('Este pedido já foi fechado.');
      Object.assign(target, {
        situacao: 'respondido',
        fechado_em: new Date().toISOString(),
      });
    }
    const now = new Date(Date.now() + this.messages.length).toISOString();
    const row = {
      ...body,
      id: body.id ?? crypto.randomUUID(),
      lot_id: item.lot_id,
      autor_papel: sector,
      situacao: body.tipo === 'pedido' ? 'aberto' : null,
      fechado_em: null,
      criado_em: now,
    } as Row;
    this.messages.push(row);
    Object.assign(
      item,
      sector === 'estrutura'
        ? { lido_estrutura_em: now }
        : { lido_almox_em: now },
    );
    this.chatSummary(String(item.id));
    return row;
  }
  private rpc(
    name: string,
    args: Row,
    sector?: string,
    me?: { id: string } | null,
  ) {
    if (name === 'conversa_lida') {
      const item = this.visible('items', sector, me).find(
        (i) => i.id === args.p_item,
      );
      if (item)
        Object.assign(
          item,
          sector === 'estrutura'
            ? { lido_estrutura_em: new Date().toISOString() }
            : { lido_almox_em: new Date().toISOString() },
        );
      if (item) this.refresh(String(item.lot_id));
      return null;
    }
    if (name === 'pedido_cancelar') {
      const m = this.messages.find(
        (x) => x.id === args.p_id && x.situacao === 'aberto',
      );
      if (!m) throw new Error('Este pedido já foi fechado.');
      m.situacao = 'cancelado';
      this.chatSummary(String(m.item_id));
      return null;
    }
    throw new Error('rpc ' + name);
  }
  private insert(table: 'lots' | 'items', body: Row) {
    const now = new Date().toISOString();
    if (table === 'lots')
      return {
        id: body.id ?? crypto.randomUUID(),
        numero: ++this.lastNumber,
        name: `Lote ${String(this.lastNumber).padStart(3, '0')}`,
        obs: body.obs || null,
        created_by: body.created_by,
        status: 'rascunho',
        item_count: 0,
        coded_count: 0,
        confirmed_count: 0,
        pedidos_abertos: 0,
        novas_almox: 0,
        novas_estrutura: 0,
        created_at: now,
        updated_at: now,
        sent_at: null,
        coded_at: null,
        confirmed_at: null,
      } as Row;
    const ord =
      this.items
        .filter((i) => i.lot_id === body.lot_id)
        .reduce((n, i) => Math.max(n, Number(i.ord)), 0) + 1;
    return {
      address: null,
      bombona: null,
      weight_g: null,
      note: null,
      photos: [],
      thumb_path: null,
      ...body,
      msg_count: 0,
      pedidos_abertos: 0,
      ultima_msg: null,
      ultima_msg_em: null,
      ultima_msg_lado: null,
      lido_almox_em: null,
      lido_estrutura_em: null,
      ord,
      status: 'pendente',
      code: null,
      code_note: null,
      coded_at: null,
      coded_by: null,
      confirmed_at: null,
      confirmed_by: null,
      photos_deleted_at: null,
      thumb_expires_at: null,
      created_at: now,
      updated_at: now,
    } as Row;
  }
  private update(table: 'lots' | 'items', row: Row, patch: Row) {
    const now = new Date();
    if (table === 'lots') {
      if (patch.status === 'enviado' && row.status === 'rascunho') {
        row.status = 'enviado';
        row.sent_at = now.toISOString();
        this.refresh(row.id);
      }
      // Nome e número são do servidor (migração 0014); só a observação muda.
      if ('obs' in patch) row.obs = patch.obs || null;
      return;
    }
    if (
      row.status === 'confirmado' &&
      !(Object.keys(patch).length === 1 && 'photos' in patch)
    )
      throw new Error('Item já confirmado.');
    const wasPending = row.status === 'pendente';
    Object.assign(row, patch, { updated_at: now.toISOString() });
    // Código preenchido: pedidos abertos deixam de ser necessários.
    if (wasPending && row.status !== 'pendente') {
      for (const m of this.messages)
        if (m.item_id === row.id && m.situacao === 'aberto')
          m.situacao = 'dispensado';
      row.pedidos_abertos = 0;
    }
    if (patch.status === 'codificado' || patch.status === 'sem_codigo')
      row.coded_at = now.toISOString();
    if (patch.status === 'pendente')
      Object.assign(row, { code: null, coded_at: null, coded_by: null });
    if (patch.status === 'confirmado')
      Object.assign(row, {
        confirmed_at: now.toISOString(),
        thumb_expires_at: new Date(now.getTime() + 150 * 864e5).toISOString(),
      });
    if (
      'photos' in patch &&
      (patch.photos as unknown[]).length === 0 &&
      row.status === 'confirmado'
    )
      row.photos_deleted_at = now.toISOString();
    this.refresh(String(row.lot_id));
  }
  private async rest(
    route: Route,
    table: string,
    url: URL,
    json: (b: unknown, s?: number) => Promise<void>,
  ) {
    const request = route.request();
    const sector = this.sector(route);
    const me = this.person(route);
    if (table.startsWith('rpc/'))
      try {
        return json(
          this.rpc(table.slice(4), request.postDataJSON() ?? {}, sector, me),
        );
      } catch (e) {
        return json({ message: (e as Error).message }, 400);
      }
    if (table === 'item_mensagens') {
      const single = (request.headers()['accept'] ?? '').includes(
        'vnd.pgrst.object',
      );
      try {
        if (request.method() === 'GET')
          return json(this.filter(this.visible('messages', sector, me), url));
        if (request.method() === 'POST') {
          const row = this.addMessage(
            request.postDataJSON() as Row,
            sector,
            me,
          );
          return json(single ? row : [row], 201);
        }
      } catch (e) {
        return json({ message: (e as Error).message }, 400);
      }
      return json({ message: 'método' }, 405);
    }
    if (table !== 'lots' && table !== 'items')
      return json({ message: 'tabela' }, 404);
    const single = (request.headers()['accept'] ?? '').includes(
      'vnd.pgrst.object',
    );
    const prefer = request.headers()['prefer'] ?? '';
    const respond = (rows: Row[], status = 200) =>
      prefer.includes('return=minimal') && request.method() !== 'GET'
        ? route.fulfill({ status: 201, body: '' })
        : json(single ? (rows[0] ?? null) : rows, status);
    try {
      if (request.method() === 'GET')
        return respond(this.filter(this.visible(table, sector, me), url));
      if (sector !== 'almoxarifado' && request.method() !== 'PATCH')
        return json({ message: 'Sem permissão.' }, 403);
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        const rows = (Array.isArray(body) ? body : [body]) as Row[];
        const out: Row[] = [];
        for (const row of rows) {
          const existing = this[table].find((r) => r.id === row.id);
          if (existing && prefer.includes('merge-duplicates')) {
            const patch = { ...row };
            delete patch.ord;
            delete patch.created_at;
            this.update(table, existing, patch);
            out.push(existing);
          } else {
            if (table === 'lots' && !me)
              return json(
                { message: 'Entre com o seu usuário para cadastrar.' },
                400,
              );
            const created = this.insert(table, row);
            if (table === 'lots' && me)
              Object.assign(created, { dono: me.id, created_by: me.nome });
            this[table].push(created);
            if (table === 'items') this.refresh(String(created.lot_id));
            out.push(created);
          }
        }
        return respond(out, 201);
      }
      const rows = this.filter(this.visible(table, sector, me), url);
      if (request.method() === 'PATCH') {
        const patch = request.postDataJSON() as Row;
        if (
          sector === 'estrutura' &&
          Object.keys(patch).some(
            (k) => !['status', 'code', 'code_note', 'coded_by'].includes(k),
          )
        )
          return json({ message: 'A estrutura só altera o código.' }, 400);
        for (const row of rows) this.update(table, row, patch);
        return respond(rows);
      }
      if (request.method() === 'DELETE') {
        const ids = new Set(rows.map((r) => r.id));
        if (table === 'lots')
          this.items = this.items.filter((i) => !ids.has(String(i.lot_id)));
        this[table] = this[table].filter((r) => !ids.has(r.id)) as Row[];
        for (const r of rows)
          if (table === 'items') this.refresh(String(r.lot_id));
        return respond(rows);
      }
    } catch (e) {
      return json({ message: (e as Error).message }, 400);
    }
    return json({ message: 'método' }, 405);
  }
  private async storage(
    route: Route,
    rest: string,
    url: URL,
    json: (b: unknown, s?: number) => Promise<void>,
  ) {
    const request = route.request();
    if (
      rest.startsWith('object/sign/identificacao') &&
      request.method() === 'POST'
    ) {
      const { paths } = request.postDataJSON() as { paths?: string[] };
      if (!paths) {
        const p = decodeURIComponent(
          rest.replace(/^object\/sign\/identificacao\//, ''),
        );
        return this.files.has(p)
          ? json({ signedURL: `/object/sign/identificacao/${p}?token=t` })
          : json({ message: 'not found' }, 404);
      }
      return json(
        paths.map((p) => ({
          path: p,
          error: this.files.has(p) ? null : 'not found',
          signedURL: this.files.has(p)
            ? `/object/sign/identificacao/${p}?token=t`
            : null,
        })),
      );
    }
    if (
      rest.startsWith('object/sign/identificacao/') ||
      rest.startsWith('object/authenticated/identificacao/') ||
      (rest.startsWith('object/identificacao/') && request.method() === 'GET')
    ) {
      const p = decodeURIComponent(
        rest.replace(/^object\/((sign|authenticated)\/)?identificacao\//, ''),
      );
      const file = this.files.get(p);
      if (!file) return json({ message: 'not found' }, 404);
      return route.fulfill({
        status: 200,
        body: file,
        contentType: p.endsWith('.webp')
          ? 'image/webp'
          : p.endsWith('.pdf')
            ? 'application/pdf'
            : 'image/jpeg',
        headers: {
          'access-control-allow-origin': '*',
          // Igual ao Storage: ?download=nome força o download com o nome.
          ...(url.searchParams.has('download')
            ? {
                'content-disposition': `attachment; filename="${url.searchParams.get('download') || p.split('/').pop()}"`,
              }
            : {}),
        },
      });
    }
    if (rest === 'object/identificacao' && request.method() === 'DELETE') {
      const { prefixes } = request.postDataJSON() as { prefixes: string[] };
      for (const p of prefixes) {
        this.files.delete(p);
        this.removed.push(p);
      }
      return json(prefixes.map((name) => ({ name })));
    }
    if (
      rest.startsWith('object/identificacao/') &&
      request.method() === 'POST'
    ) {
      const p = decodeURIComponent(rest.slice('object/identificacao/'.length));
      if (
        this.sector(route) !== 'almoxarifado' &&
        !(this.sector(route) === 'estrutura' && p.startsWith('conversa/'))
      )
        return json({ message: 'Sem permissão' }, 403);
      this.files.set(
        p,
        fileFrom(
          request.postDataBuffer() ?? Buffer.alloc(0),
          request.headers()['content-type'] ?? '',
        ),
      );
      return json({ Key: `identificacao/${p}`, Id: p });
    }
    return json(
      { message: 'storage não simulado: ' + rest + ' ' + url.search },
      404,
    );
  }
}

/** Extrai o arquivo do envio multipart do supabase-js (ou devolve o corpo cru). */
function fileFrom(body: Buffer, type: string) {
  const boundary = /boundary=(.+)$/.exec(type)?.[1];
  if (!boundary) return body;
  const marker = Buffer.from(`--${boundary}`);
  let start = 0;
  const parts: Buffer[] = [];
  for (;;) {
    const at = body.indexOf(marker, start);
    if (at < 0) break;
    if (start) parts.push(body.subarray(start, at - 2));
    start = at + marker.length + 2;
  }
  for (const part of parts) {
    const split = part.indexOf('\r\n\r\n');
    const head = part.subarray(0, split).toString();
    if (/filename=|content-type: image/i.test(head))
      return part.subarray(split + 4);
  }
  return body;
}
