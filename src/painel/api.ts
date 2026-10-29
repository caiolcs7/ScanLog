import type { RealtimeChannel } from '@supabase/supabase-js';
import { cloudError, supabase } from '../cloud/client';
import { comProtheus, type Produto } from './protheus';

export type Moeda = 'BRL' | 'USD' | 'CNY';
export type Tipo = 'MP' | 'PI' | 'PA';
export type Origem = 'nacional' | 'internacional';
export type Material = {
  codigo: string;
  descricao: string | null;
  tipo: Tipo | null;
  peso_g: number | null;
  locais: string[];
  fornecedor_id: number | null;
  preco: number | null;
  moeda: Moeda | null;
  /** Segundo fornecedor (ex.: o nacional), com o seu preço e moeda. */
  fornecedor2_id: number | null;
  preco2: number | null;
  moeda2: Moeda | null;
  quantidade: number | null;
  origem: 'ruas' | 'manual';
  criado_em: string;
  criado_por: string;
  atualizado_em: string | null;
  atualizado_por: string | null;
  /** Só no site: moeda de cada fornecedor (1 e 2) vinda da planilha do sistema. */
  moedas?: [Moeda | null, Moeda | null];
};
export type Fornecedor = {
  id: number;
  nome: string;
  origem: Origem;
  criado_em: string;
  criado_por: string;
};
/** Campos guardados antes e depois de cada mudança. */
export type Foto = Pick<
  Material,
  | 'descricao'
  | 'tipo'
  | 'peso_g'
  | 'fornecedor_id'
  | 'preco'
  | 'moeda'
  | 'fornecedor2_id'
  | 'preco2'
  | 'moeda2'
  | 'quantidade'
>;
export type Mudanca = {
  id: number;
  codigo: string;
  acao: 'cadastro' | 'edicao' | 'desfazer';
  antes: Foto | null;
  depois: Foto;
  por: string;
  em: string;
  desfeito_em: string | null;
  desfeito_por: string | null;
};
export type Cotacao = { moeda: 'USD' | 'CNY'; data: string; valor: number };
export type Dados = {
  materiais: Material[];
  fornecedores: Fornecedor[];
  cotacoes: Cotacao[];
  mudancas: Mudanca[];
};
export type Sessao = { token: string; nome: string };

/** Sessão vencida ou apagada no servidor: pede a senha de novo. */
export class SessaoExpirada extends Error {}

const SESSAO = 'painel-sessao';
export function lerSessao(): Sessao | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSAO) ?? 'null');
    return s && typeof s.token === 'string' && typeof s.nome === 'string'
      ? s
      : null;
  } catch {
    return null;
  }
}
function guardarSessao(s: Sessao | null) {
  try {
    if (s) localStorage.setItem(SESSAO, JSON.stringify(s));
    else localStorage.removeItem(SESSAO);
  } catch {
    // Sem armazenamento (aba anônima): a sessão vale só até recarregar.
  }
}

function erro(error: unknown): Error {
  const e = error as { code?: string; message?: string } | null;
  if (e?.code === '28000') return new SessaoExpirada(e.message);
  if (/violates check constraint|invalid input syntax/i.test(e?.message ?? ''))
    return new Error(
      'Algum valor está fora do formato. Confira e tente de novo.',
    );
  if (/foreign key/i.test(e?.message ?? ''))
    return new Error('Fornecedor não encontrado. Recarregue a página.');
  return cloudError(error);
}
async function rpc<T>(nome: string, args: Record<string, unknown>) {
  const { data, error } = await (await supabase()).rpc(nome, args);
  if (error) throw erro(error);
  return data as T;
}
async function tudo<T>(tabela: string, ordem: string) {
  const db = await supabase(),
    linhas: T[] = [];
  // O servidor entrega no máximo 1000 linhas por vez.
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db
      .from(tabela)
      .select('*')
      .order(ordem)
      .range(de, de + 999);
    if (error) throw erro(error);
    linhas.push(...(data as T[]));
    if (data.length < 1000) return linhas;
  }
}

type ItemRua = {
  codigo: string;
  descricao: string | null;
  tipo: Tipo | null;
  peso_g: number | null;
  locais: string[];
  fornecedor?: string;
  fornecedor2?: string;
  moeda?: Moeda;
  moeda2?: Moeda;
};
// ruas.json vem junto com o site: cada publicação nova já mostra as
// localizações certas a todos, sem esperar ninguém sincronizar o banco.
let ruasJson: Promise<Map<string, ItemRua>> | null = null;
const ruas = () =>
  (ruasJson ??= import('./ruas.json').then(
    (m) => new Map((m.default as ItemRua[]).map((i) => [i.codigo, i])),
  ));
let ruasProntas: Map<string, ItemRua> | null = null;
let protheus: Map<string, Produto> | null = null;

/** Cópia do Protheus; se a tabela falhar, o painel abre sem ela. */
async function doProtheus() {
  try {
    const db = await supabase(),
      linhas: Produto[] = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await db
        .from('protheus_produtos')
        .select('codigo,descricao,tipo,saldo_estoque,custo,moeda')
        .order('codigo')
        .range(de, de + 999);
      if (error) throw error;
      linhas.push(...(data as Produto[]));
      if (data.length < 1000) break;
    }
    return new Map(linhas.map((p) => [p.codigo, p]));
  } catch (e) {
    console.warn('Protheus indisponível', e);
    return new Map<string, Produto>();
  }
}

/**
 * A planilha do sistema (ruas.json) é a fonte da localização e, enquanto
 * ninguém editou o material no painel, também da descrição, tipo e peso.
 * Depois de editado, vale o que a pessoa gravou no banco.
 */
export function comRuas(m: Material): Material {
  return comProtheus(soRuas(m), protheus?.get(m.codigo));
}
function soRuas(m: Material): Material {
  const i = ruasProntas?.get(m.codigo);
  if (!i) return m;
  const site = m.atualizado_em == null;
  return {
    ...m,
    locais: i.locais,
    descricao: site
      ? (i.descricao ?? m.descricao)
      : (m.descricao ?? i.descricao),
    tipo: site ? (i.tipo ?? m.tipo) : (m.tipo ?? i.tipo),
    peso_g: site ? (i.peso_g ?? m.peso_g) : (m.peso_g ?? i.peso_g),
    moedas: [i.moeda ?? null, i.moeda2 ?? null],
  };
}
const iguais = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, k) => x === b[k]);

export async function carregar(): Promise<Dados & { desatualizado: boolean }> {
  const db = await supabase();
  const desde = new Date(Date.now() - 95 * 864e5).toISOString().slice(0, 10);
  const [doBanco, fornecedores, cotacoes, mudancas, itens, prot] =
    await Promise.all([
      tudo<Material>('painel_materiais', 'codigo'),
      tudo<Fornecedor>('painel_fornecedores', 'nome'),
      db
        .from('painel_cotacoes')
        .select('moeda,data,valor')
        .gte('data', desde)
        .order('data'),
      db
        .from('painel_historico')
        .select('*')
        .order('em', { ascending: false })
        .limit(30),
      ruas(),
      doProtheus(),
    ]);
  if (cotacoes.error) throw erro(cotacoes.error);
  if (mudancas.error) throw erro(mudancas.error);
  ruasProntas = itens;
  protheus = prot;
  const no = new Set(doBanco.map((m) => m.codigo)),
    nome = new Map(
      fornecedores.map((f) => [f.nome.trim().toLowerCase(), f.id]),
    ),
    idDe = (n?: string) =>
      n ? (nome.get(n.trim().toLowerCase()) ?? null) : null;
  let desatualizado = false;
  const materiais = doBanco.map((m) => {
    const c = comRuas(m);
    if (!iguais(c.locais, m.locais)) desatualizado = true;
    return c;
  });
  // Código novo das ruas que o banco ainda não tem: aparece já, sem preço.
  for (const i of itens.values())
    if (!no.has(i.codigo)) {
      desatualizado = true;
      const f1 = idDe(i.fornecedor);
      materiais.push(
        comProtheus(
          {
            codigo: i.codigo,
            descricao: i.descricao,
            tipo: i.tipo,
            peso_g: i.peso_g,
            locais: i.locais,
            fornecedor_id: f1,
            preco: null,
            moeda: null,
            fornecedor2_id: f1 == null ? null : idDe(i.fornecedor2),
            preco2: null,
            moeda2: null,
            quantidade: null,
            origem: 'ruas',
            criado_em: '',
            criado_por: '',
            atualizado_em: null,
            atualizado_por: null,
            moedas: [i.moeda ?? null, i.moeda2 ?? null],
          },
          prot.get(i.codigo),
        ),
      );
    }
  materiais.sort((a, b) => (a.codigo < b.codigo ? -1 : 1));
  return {
    desatualizado,
    materiais,
    fornecedores,
    cotacoes: cotacoes.data as Cotacao[],
    mudancas: mudancas.data as Mudanca[],
  };
}

export async function mudancasRecentes() {
  const { data, error } = await (
    await supabase()
  )
    .from('painel_historico')
    .select('*')
    .order('em', { ascending: false })
    .limit(30);
  if (error) throw erro(error);
  return data as Mudanca[];
}
export async function mudancasDe(codigo: string) {
  const { data, error } = await (
    await supabase()
  )
    .from('painel_historico')
    .select('*')
    .eq('codigo', codigo)
    .order('em', { ascending: false })
    .limit(50);
  if (error) throw erro(error);
  return data as Mudanca[];
}

export async function entrar(senha: string, nome: string): Promise<Sessao> {
  // senha errada volta null (não erro), para a tentativa ficar contada no banco
  const token = await rpc<string | null>('painel_entrar', {
    p_senha: senha,
    p_nome: nome,
  });
  if (!token) throw new Error('Senha incorreta.');
  const s = { token, nome: nome.trim() };
  guardarSessao(s);
  return s;
}
export async function sair(s: Sessao) {
  guardarSessao(null);
  await rpc('painel_sair', { p_token: s.token }).catch(() => {});
}
export function esquecerSessao() {
  guardarSessao(null);
}

export const salvar = (
  s: Sessao,
  codigo: string,
  dados: Partial<Foto>,
  novo = false,
) =>
  rpc<Material>('painel_salvar', {
    p_token: s.token,
    p_codigo: codigo,
    p_dados: dados,
    p_novo: novo,
  });
export const desfazer = (s: Sessao, id: number) =>
  rpc<Material>('painel_desfazer', { p_token: s.token, p_historico: id });
export const salvarFornecedor = (
  s: Sessao,
  nome: string,
  origem: Origem,
  id?: number,
) =>
  rpc<Fornecedor>('painel_fornecedor', {
    p_token: s.token,
    p_nome: nome,
    p_origem: origem,
    p_id: id ?? null,
  });
/** Traz os códigos das ruas (sem mexer em preço, moeda e quantidade). */
export async function importarRuas(s: Sessao) {
  const itens = [...(await ruas()).values()];
  return rpc<number>('painel_importar', { p_token: s.token, p_itens: itens });
}

/** Mudanças feitas por outras pessoas chegam ao vivo. */
export async function aoVivo(aviso: {
  material: (m: Material) => void;
  fornecedor: (f: Fornecedor) => void;
}): Promise<() => void> {
  const db = await supabase();
  const canal: RealtimeChannel = db
    .channel('painel')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'painel_materiais' },
      (p) =>
        p.new &&
        'codigo' in p.new &&
        aviso.material(comRuas(p.new as Material)),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'painel_fornecedores' },
      (p) => p.new && 'id' in p.new && aviso.fornecedor(p.new as Fornecedor),
    )
    .subscribe();
  return () => void db.removeChannel(canal);
}
