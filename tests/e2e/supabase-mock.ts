import type { Page, Route } from '@playwright/test';

/**
 * Supabase falso em memória para os testes de ponta a ponta: autenticação por
 * setor, tabelas lots/items com as mesmas regras dos gatilhos e o Storage.
 */
type Row = Record<string, unknown> & { id: string };
const HOST = 'https://pygedyytlcplfweibenv.supabase.co';
export const passwords = {
  almoxarifado: 'senha-almox',
  estrutura: 'senha-estr',
};

function jwt(payload: object) {
  const part = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part(payload)}.assinatura`;
}
export class SupabaseMock {
  lots: Row[] = [];
  items: Row[] = [];
  files = new Map<string, Buffer>();
  removed: string[] = [];
  async install(page: Page) {
    await page.route(`${HOST}/**`, (route) => this.handle(route));
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
      const sector = String(email).split('@')[0] as keyof typeof passwords;
      if (passwords[sector] !== password)
        return json(
          {
            error: 'invalid_grant',
            error_description: 'Invalid login credentials',
            code: 'invalid_credentials',
            msg: 'Invalid login credentials',
          },
          400,
        );
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const user = {
        id:
          sector === 'almoxarifado'
            ? '00000000-0000-4000-8000-000000000001'
            : '00000000-0000-4000-8000-000000000002',
        aud: 'authenticated',
        role: 'authenticated',
        email,
        app_metadata: { provider: 'email', role: sector },
        user_metadata: {},
        created_at: new Date().toISOString(),
      };
      return json({
        access_token: jwt({
          sub: user.id,
          exp,
          role: 'authenticated',
          app_metadata: user.app_metadata,
        }),
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: exp,
        refresh_token: 'refresh-' + sector,
        user,
      });
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
    Object.assign(lot, {
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
  private visible(table: 'lots' | 'items', sector?: string) {
    if (sector !== 'almoxarifado' && sector !== 'estrutura') return [];
    if (sector === 'almoxarifado') return this[table];
    const sent = new Set(
      this.lots.filter((l) => l.status !== 'rascunho').map((l) => l.id),
    );
    return table === 'lots'
      ? this.lots.filter((l) => sent.has(l.id))
      : this.items.filter((i) => sent.has(String(i.lot_id)));
  }
  private insert(table: 'lots' | 'items', body: Row) {
    const now = new Date().toISOString();
    if (table === 'lots')
      return {
        id: body.id ?? crypto.randomUUID(),
        name: body.name,
        created_by: body.created_by,
        status: 'rascunho',
        item_count: 0,
        coded_count: 0,
        confirmed_count: 0,
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
      if (patch.name) row.name = patch.name;
      return;
    }
    if (
      row.status === 'confirmado' &&
      !(Object.keys(patch).length === 1 && 'photos' in patch)
    )
      throw new Error('Item já confirmado.');
    Object.assign(row, patch, { updated_at: now.toISOString() });
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
    if (table !== 'lots' && table !== 'items')
      return json({ message: 'tabela' }, 404);
    const request = route.request();
    const sector = this.sector(route);
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
        return respond(this.filter(this.visible(table, sector), url));
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
            const created = this.insert(table, row);
            this[table].push(created);
            if (table === 'items') this.refresh(String(created.lot_id));
            out.push(created);
          }
        }
        return respond(out, 201);
      }
      const rows = this.filter(this.visible(table, sector), url);
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
      const { paths } = request.postDataJSON() as { paths: string[] };
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
        contentType: p.endsWith('.webp') ? 'image/webp' : 'image/jpeg',
        headers: { 'access-control-allow-origin': '*' },
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
      if (this.sector(route) !== 'almoxarifado')
        return json({ message: 'Sem permissão' }, 403);
      const p = decodeURIComponent(rest.slice('object/identificacao/'.length));
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
