import type { Foto, Fornecedor } from './api';
import { dinheiro, peso, quantidade } from './format';

const NADA = '—';
/** O que mudou entre duas fotos do material, em texto para pessoas. */
export function diferencas(
  antes: Partial<Foto> | null,
  depois: Partial<Foto>,
  porId: Map<number, Fornecedor>,
) {
  const a = antes ?? {},
    linhas: { campo: string; de: string; para: string }[] = [];
  const preco = (f: Partial<Foto>) =>
    f.preco != null && f.moeda ? dinheiro(f.preco, f.moeda) : NADA;
  if (preco(a) !== preco(depois))
    linhas.push({ campo: 'Preço', de: preco(a), para: preco(depois) });
  const forn = (id?: number | null) =>
    id == null ? NADA : (porId.get(id)?.nome ?? `#${id}`);
  if ((a.fornecedor_id ?? null) !== (depois.fornecedor_id ?? null))
    linhas.push({
      campo: 'Fornecedor',
      de: forn(a.fornecedor_id),
      para: forn(depois.fornecedor_id),
    });
  const q = (n?: number | null) => (n == null ? NADA : quantidade(n));
  if ((a.quantidade ?? null) !== (depois.quantidade ?? null))
    linhas.push({
      campo: 'Quantidade',
      de: q(a.quantidade),
      para: q(depois.quantidade),
    });
  const p = (n?: number | null) => (n == null ? NADA : peso(n));
  if ((a.peso_g ?? null) !== (depois.peso_g ?? null))
    linhas.push({ campo: 'Peso', de: p(a.peso_g), para: p(depois.peso_g) });
  if ((a.tipo ?? null) !== (depois.tipo ?? null))
    linhas.push({
      campo: 'Tipo',
      de: a.tipo ?? NADA,
      para: depois.tipo ?? NADA,
    });
  if ((a.descricao ?? null) !== (depois.descricao ?? null))
    linhas.push({
      campo: 'Descrição',
      de: a.descricao ? 'anterior' : NADA,
      para: depois.descricao ?? NADA,
    });
  return linhas;
}
