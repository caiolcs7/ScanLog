import { readFileSync } from 'node:fs';
import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Painel de Materiais com o Supabase simulado: a página abre sem login, carrega
 * os códigos das ruas e só edita depois da senha, sempre com confirmação.
 */
const base = 'http://127.0.0.1:4173/teste-subpasta/';
const HOST = 'https://pygedyytlcplfweibenv.supabase.co';
const TOTAL = (
  JSON.parse(
    readFileSync(
      new URL('../../src/painel/ruas.json', import.meta.url),
      'utf8',
    ),
  ) as unknown[]
).length;
test.use({ serviceWorkers: 'block' });

type Linha = Record<string, unknown>;
const campos = [
  'descricao',
  'tipo',
  'peso_g',
  'fornecedor_id',
  'preco',
  'moeda',
  'fornecedor2_id',
  'preco2',
  'moeda2',
  'quantidade',
] as const;
const foto = (m: Linha) =>
  Object.fromEntries(campos.map((k) => [k, m[k] ?? null]));

class PainelMock {
  materiais: Linha[] = [];
  fornecedores: Linha[] = [
    { id: 1, nome: 'WEG', origem: 'nacional', criado_por: 'Caio' },
    { id: 2, nome: 'ABB', origem: 'internacional', criado_por: 'Caio' },
  ];
  historico: Linha[] = [];
  seq = 10;
  async install(page: Page) {
    await page.route(`${HOST}/**`, (route) => this.handle(route));
  }
  private async handle(route: Route) {
    const req = route.request(),
      url = new URL(req.url()),
      json = (body: unknown, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify(body),
        });
    if (req.method() === 'OPTIONS') return json({});
    const nome = url.pathname.split('/').pop()!;
    if (url.pathname.includes('/rpc/')) {
      const a = req.postDataJSON();
      const agora = new Date().toISOString();
      if (nome === 'painel_entrar')
        return a.p_senha === 'senha-teste' ? json('token-teste') : json(null);
      if (a.p_token !== 'token-teste')
        return json({ code: '28000', message: 'Sessão expirada.' }, 401);
      if (nome === 'painel_importar') {
        for (const i of a.p_itens)
          this.materiais.push({
            ...i,
            origem: 'ruas',
            criado_em: agora,
            criado_por: 'Caio',
          });
        return json(a.p_itens.length);
      }
      if (nome === 'painel_salvar') {
        const m = this.materiais.find((x) => x.codigo === a.p_codigo)!;
        const antes = foto(m);
        Object.assign(m, a.p_dados, {
          atualizado_em: agora,
          atualizado_por: 'Ana',
        });
        this.historico.unshift({
          id: ++this.seq,
          codigo: m.codigo,
          acao: 'edicao',
          antes,
          depois: foto(m),
          por: 'Ana',
          em: agora,
        });
        return json(m);
      }
      if (nome === 'painel_desfazer') {
        const h = this.historico.find((x) => x.id === a.p_historico)!;
        const m = this.materiais.find((x) => x.codigo === h.codigo)!;
        const antes = foto(m);
        Object.assign(m, h.antes);
        Object.assign(h, { desfeito_em: agora, desfeito_por: 'Ana' });
        this.historico.unshift({
          id: ++this.seq,
          codigo: m.codigo,
          acao: 'desfazer',
          antes,
          depois: foto(m),
          por: 'Ana',
          em: agora,
        });
        return json(m);
      }
      return json(null);
    }
    const tabelas: Record<string, Linha[]> = {
      painel_materiais: this.materiais,
      painel_fornecedores: this.fornecedores,
      painel_historico: this.historico,
      painel_cotacoes: [
        { moeda: 'USD', data: '2026-10-22', valor: 5 },
        { moeda: 'CNY', data: '2026-10-22', valor: 0.7 },
      ],
    };
    let linhas = tabelas[nome] ?? [];
    const codigo = url.searchParams.get('codigo');
    if (codigo) linhas = linhas.filter((l) => `eq.${l.codigo}` === codigo);
    const de = Number(url.searchParams.get('offset') ?? 0),
      ate = Number(url.searchParams.get('limit') ?? 1000);
    return json(linhas.slice(de, de + ate));
  }
}

test('painel: carrega as ruas, pede senha, salva com confirmação e desfaz', async ({
  page,
}) => {
  const nuvem = new PainelMock();
  await nuvem.install(page);
  await page.goto(`${base}painel/`);
  await expect(page.getByText('Ainda não há códigos no painel')).toBeVisible();

  await page
    .getByRole('button', { name: 'Carregar os códigos das ruas' })
    .click();
  await page.getByLabel('Seu nome').fill('Ana');
  await page.getByLabel('Senha').fill('9999');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText('Senha incorreta.')).toBeVisible();
  await page.getByLabel('Senha').fill('senha-teste');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(
    page.getByText(`${TOTAL.toLocaleString('pt-BR')} códigos carregados.`),
  ).toBeVisible();
  expect(nuvem.materiais).toHaveLength(TOTAL);
  await expect(
    page.getByRole('button', { name: 'Editando como Ana' }),
  ).toBeVisible();

  const codigo = nuvem.materiais[0].codigo as string;
  await page.getByRole('tab', { name: 'Materiais' }).click();
  await page.getByPlaceholder('Buscar código ou descrição').fill(codigo);
  await page.locator('.mat').first().click();
  const ficha = page.getByRole('dialog', { name: `Material ${codigo}` });
  await ficha.getByRole('button', { name: 'Editar', exact: true }).click();
  await ficha.getByLabel('Preço unitário do fornecedor 1').fill('2,5');
  await ficha.getByRole('radio', { name: /Dólar/ }).first().click();
  await expect(ficha.getByText('≈ R$ 12,50 hoje')).toBeVisible();
  await ficha
    .getByLabel('Fornecedor 1', { exact: true })
    .selectOption({ label: 'WEG · Nacional' });
  await ficha
    .getByLabel('Fornecedor 2', { exact: true })
    .selectOption({ label: 'ABB · Internacional' });
  await ficha.getByLabel('Preço unitário do fornecedor 2').fill('3');
  await ficha.getByRole('button', { name: 'Salvar', exact: true }).click();

  // nada é gravado antes de confirmar
  const confirmar = page.getByRole('dialog', { name: `Salvar ${codigo}?` });
  await expect(confirmar.getByText('US$ 2,50')).toBeVisible();
  expect(nuvem.materiais[0].preco ?? null).toBeNull();
  await confirmar
    .getByRole('button', { name: 'Confirmar', exact: true })
    .click();
  await expect(page.getByText('Salvo.')).toBeVisible();
  expect(nuvem.materiais[0]).toMatchObject({
    preco: 2.5,
    moeda: 'USD',
    fornecedor_id: 1,
    fornecedor2_id: 2,
    preco2: 3,
    moeda2: 'BRL',
  });

  await ficha.getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.getByText('Mudança desfeita.')).toBeVisible();
  expect(nuvem.materiais[0].preco).toBeNull();
  expect(nuvem.materiais[0].fornecedor2_id).toBeNull();
});
