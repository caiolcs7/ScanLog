import type { RealtimeChannel } from '@supabase/supabase-js';
import { cloudError, supabase } from '../cloud/client';

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
  quantidade: number | null;
  origem: 'ruas' | 'manual';
  criado_em: string;
  criado_por: string;
  atualizado_em: string | null;
  atualizado_por: string | null;
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

export async function carregar(): Promise<Dados> {
  const db = await supabase();
  const desde = new Date(Date.now() - 95 * 864e5).toISOString().slice(0, 10);
  const [materiais, fornecedores, cotacoes, mudancas] = await Promise.all([
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
  ]);
  if (cotacoes.error) throw erro(cotacoes.error);
  if (mudancas.error) throw erro(mudancas.error);
  return {
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
  const token = await rpc<string>('painel_entrar', {
    p_senha: senha,
    p_nome: nome,
  });
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
/** Traz os códigos das ruas do Relatório (sem mexer em preço e fornecedor). */
export async function importarRuas(s: Sessao) {
  const itens = (await import('./ruas.json')).default;
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
      (p) => p.new && 'codigo' in p.new && aviso.material(p.new as Material),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'painel_fornecedores' },
      (p) => p.new && 'id' in p.new && aviso.fornecedor(p.new as Fornecedor),
    )
    .subscribe();
  return () => void db.removeChannel(canal);
}
