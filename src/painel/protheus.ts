import type { Material, Moeda, Tipo } from './api';

/**
 * Cópia diária do Protheus (tabela protheus_produtos, gravada pelo
 * sync-protheus no PC da empresa). Completa o que ninguém editou no painel:
 * descritivo, tipo, peso (do texto "PESO ... KG"), quantidade (saldo) e preço
 * (custo na moeda do Protheus). O que alguém gravou no painel sempre vale.
 */
export type Produto = {
  codigo: string;
  descricao: string | null;
  tipo: string | null;
  saldo_estoque: number | null;
  custo: number | null;
  moeda: string | null;
};

const MOEDAS: Record<string, Moeda> = {
  REAL: 'BRL',
  DOLAR: 'USD',
  YUAN: 'CNY',
};
/** "Real", "Dólar", "Yuan"; "Estrutura", "Euro"... ficam sem moeda. */
export function moedaProtheus(m: string | null): Moeda | null {
  const t = (m ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
  return MOEDAS[t] ?? null;
}

/** Peso em gramas do "PESO: 1,3 KG" do descritivo (sem unidade = kg). */
export function pesoG(d: string | null): number | null {
  const re = /\bPESO\b\s*(?:IA\b)?\s*:?\s*([\d.,]+)\s*(KGS?|G)?\b/gi,
    vals = new Set<number>();
  let x: RegExpExecArray | null;
  while ((x = re.exec(d ?? ''))) {
    const emG = (x[2] || 'KG').toUpperCase() === 'G';
    // "1,200G" e "1.660 g": não dá para saber se é grama ou milhar.
    if (emG && /[.,]/.test(x[1])) continue;
    const num = x[1].replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    if ((num.match(/\./g) ?? []).length > 1) continue;
    const v = parseFloat(num);
    if (!Number.isFinite(v) || v <= 0) continue;
    vals.add(Math.round((emG ? v : v * 1000) * 1000) / 1000);
  }
  return vals.size === 1 ? [...vals][0] : null;
}

const TIPOS = new Set<string>(['MP', 'PI', 'PA']);

export function comProtheus(m: Material, p: Produto | undefined): Material {
  if (!p) return m;
  const site = m.atualizado_em == null,
    desc = p.descricao?.trim() || null,
    tipo = TIPOS.has(p.tipo ?? '') ? (p.tipo as Tipo) : null,
    moeda = moedaProtheus(p.moeda),
    comPreco = m.preco == null && moeda != null && (p.custo ?? 0) > 0;
  return {
    ...m,
    descricao: site ? (desc ?? m.descricao) : (m.descricao ?? desc),
    tipo: site ? (tipo ?? m.tipo) : (m.tipo ?? tipo),
    peso_g: site ? (pesoG(desc) ?? m.peso_g) : (m.peso_g ?? pesoG(desc)),
    quantidade: m.quantidade ?? p.saldo_estoque,
    preco: comPreco ? p.custo : m.preco,
    moeda: comPreco ? moeda : m.moeda,
    moedas: [m.moedas?.[0] ?? moeda, m.moedas?.[1] ?? null],
  };
}
