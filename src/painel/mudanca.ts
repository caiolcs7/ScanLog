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
  const forn = (id?: number | null) =>
    id == null ? NADA : (porId.get(id)?.nome ?? `#${id}`);
  for (const k of ['', '2'] as const) {
    const rotulo = k ? ' 2' : '';
    const preco = (f: Partial<Foto>) => {
      const p = f[`preco${k}`],
        m = f[`moeda${k}`];
      return p != null && m ? dinheiro(p, m) : NADA;
    };
    if (preco(a) !== preco(depois))
      linhas.push({
        campo: `Preço${rotulo}`,
        de: preco(a),
        para: preco(depois),
      });
    const id = `fornecedor${k}_id` as const;
    if ((a[id] ?? null) !== (depois[id] ?? null))
      linhas.push({
        campo: `Fornecedor${rotulo}`,
        de: forn(a[id]),
        para: forn(depois[id]),
      });
  }
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
