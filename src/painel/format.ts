import type { Cotacao, Fornecedor, Material, Moeda } from './api';

export const MOEDAS: Record<Moeda, { simbolo: string; nome: string }> = {
  BRL: { simbolo: 'R$', nome: 'Real' },
  USD: { simbolo: 'US$', nome: 'Dólar' },
  CNY: { simbolo: '¥', nome: 'Yuan' },
};
export const ORDEM_MOEDAS: Moeda[] = ['BRL', 'USD', 'CNY'];

const num = (min: number, max: number) =>
  new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });
const n2 = num(2, 4),
  n0 = num(0, 0),
  n3 = num(0, 3),
  pct = num(0, 0);

/** "US$ 1,25" com 2 a 4 casas, como o preço foi digitado. */
export const dinheiro = (valor: number, moeda: Moeda) =>
  `${MOEDAS[moeda].simbolo}\u00a0${n2.format(valor)}`;
/** Valores grandes em R$ com no máximo 2 casas. */
export const reais = (valor: number) => `R$\u00a0${num(2, 2).format(valor)}`;
export const inteiro = (n: number) => n0.format(n);
const compacto = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 2,
});
/** "R$ 3,44 mi" para caber no indicador; o valor exato vai na nota. */
export const reaisCurto = (v: number) =>
  v >= 1e5 ? `R$\u00a0${compacto.format(v)}` : reais(v);
export const porcento = (parte: number, total: number) =>
  `${pct.format(total ? (parte / total) * 100 : 0)}%`;
export const quantidade = (n: number) => n3.format(n);
export const peso = (g: number) =>
  g >= 1000 ? `${n3.format(g / 1000)} kg` : `${n3.format(g)} g`;

/** Aceita "1.234,56", "1234,56" ou "1234.56". */
export function lerNumero(texto: string): number | null {
  const t = texto.trim().replace(/\s|R\$|US\$|¥/g, '');
  if (!t) return null;
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  if (!/^\d+(\.\d+)?$/.test(normal)) return NaN;
  return Number(normal);
}
export const paraCampo = (n: number | null) =>
  n == null ? '' : num(0, 4).format(n).replace(/\./g, '');

/**
 * Endereços do sistema de estoque: galão/caixa ("R07A1G05") ou prateleira
 * ("R18A1C06DP02" = rua, andar, coluna, lado, prateleira ou galão, número).
 */
const GALAO = /^(R\d{2})(A\d)([A-Z])(\d+)$/;
const PRATELEIRA = /^(R\d{2})(A\d)(C\d{2}|[A-Z0-9]{3})([DEC])([PG])(\d{2})$/;
const LADO: Record<string, string> = { D: 'Dir', E: 'Esq', C: 'Centro' };
/** "R07A1G05" → "R07 · A1 · G05"; "R18A1C06DP02" → "R18 · A1 · Col 06 · Dir · Prat 02". */
export function local(l: string) {
  const m = GALAO.exec(l);
  if (m) return `${m[1]} · ${m[2]} · ${m[3]}${m[4].padStart(2, '0')}`;
  const p = PRATELEIRA.exec(l);
  return p
    ? `${p[1]} · ${p[2]} · Col ${p[3].replace(/^C(?=\d)/, '')} · ${LADO[p[4]]} · ${p[5] === 'P' ? 'Prat' : 'Galão'} ${p[6]}`
    : l;
}
/**
 * Endereços completos do material para mostrar ao lado do código: os de
 * prateleira ("R14A1C01DP01"); sem nenhum, os galões ("R07A1G05"). Com
 * `onde` (rua ou rua+andar, "R14" / "R14A1"), só os de lá.
 */
export function enderecos(locais: string[], onde = '') {
  const aqui = locais.filter((l) => l.startsWith(onde));
  const prat = aqui.filter((l) => PRATELEIRA.test(l));
  return prat.length ? prat : aqui;
}
/** Posição dentro da rua, para ordenar a lista: galões e caixas, depois prateleiras. */
export type Vaga = { andar: string; letra: string; n: number; rotulo: string };
export function vaga(l: string): Vaga | null {
  const g = GALAO.exec(l);
  if (g)
    return {
      andar: g[2],
      letra: g[3],
      n: Number(g[4]),
      rotulo: `${g[3]}${g[4].padStart(2, '0')}`,
    };
  const p = PRATELEIRA.exec(l);
  if (!p) return null;
  const col = /^C\d{2}$/.test(p[3]) ? Number(p[3].slice(1)) : 900;
  return {
    andar: p[2],
    letra: 'S',
    n: col * 100000 + 'EDC'.indexOf(p[4]) * 10000 + Number(p[6]),
    rotulo: `${p[3]}${p[4]}${p[5]}${p[6]}`,
  };
}
export const ruaDe = (l: string) => l.slice(0, 3);
export type RuaResumo = { rua: string; total: number; comPreco: number };

/** Cotação mais recente (R$ por 1 unidade) e a data dela. */
export type Cambio = Record<Moeda, { valor: number; data: string | null }>;
export function cambio(cotacoes: Cotacao[]): Cambio {
  const c: Cambio = {
    BRL: { valor: 1, data: null },
    USD: { valor: NaN, data: null },
    CNY: { valor: NaN, data: null },
  };
  for (const q of cotacoes)
    if (!c[q.moeda].data || q.data > c[q.moeda].data!)
      c[q.moeda] = { valor: Number(q.valor), data: q.data };
  return c;
}
/** Fornecedor 1 e 2 do material, cada um com o seu preço e moeda. */
export type Oferta = {
  n: 1 | 2;
  fornecedor_id: number | null;
  preco: number | null;
  moeda: Moeda | null;
};
export function ofertas(
  m: Pick<
    Material,
    'fornecedor_id' | 'preco' | 'moeda' | 'fornecedor2_id' | 'preco2' | 'moeda2'
  >,
): Oferta[] {
  const r: Oferta[] = [];
  if (m.fornecedor_id != null || m.preco != null)
    r.push({
      n: 1,
      fornecedor_id: m.fornecedor_id,
      preco: m.preco,
      moeda: m.moeda,
    });
  if (m.fornecedor2_id != null || m.preco2 != null)
    r.push({
      n: 2,
      fornecedor_id: m.fornecedor2_id,
      preco: m.preco2,
      moeda: m.moeda2,
    });
  return r;
}
/** Preço usado nas contas: o do fornecedor 1; se não tiver, o do 2. */
export const oferta = (m: Parameters<typeof ofertas>[0]) =>
  ofertas(m).find((o) => o.preco != null && o.moeda) ?? null;
export const temPreco = (m: Parameters<typeof ofertas>[0]) => oferta(m) != null;
/** O material tem esse fornecedor em algum dos dois lugares? */
export const temFornecedor = (m: Parameters<typeof ofertas>[0], id: number) =>
  m.fornecedor_id === id || m.fornecedor2_id === id;
export const emReais = (m: Parameters<typeof ofertas>[0], c: Cambio) => {
  const o = oferta(m);
  return o ? o.preco! * c[o.moeda!].valor : null;
};

export const dataCurta = (iso: string) =>
  new Date(`${iso.length === 10 ? `${iso}T12:00` : iso}`).toLocaleDateString(
    'pt-BR',
    { day: '2-digit', month: '2-digit' },
  );
export function haQuanto(iso: string, agora = Date.now()) {
  const s = Math.max(0, (agora - Date.parse(iso)) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}
export const nomeFornecedor = (
  id: number | null,
  porId: Map<number, Fornecedor>,
) => (id == null ? null : (porId.get(id)?.nome ?? 'Fornecedor removido'));

/** Busca sem acento e sem diferença de maiúsculas. */
export const semAcento = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
