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
  g >= 1000 || g % 1 ? `${n3.format(g / 1000)} kg` : `${n0.format(g)} g`;

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

/** "R07A1G05" → "R07 · A1 · G05". */
export function local(l: string) {
  const m = /^(R\d{2})(A\d)([A-Z])(\d+)$/.exec(l);
  return m ? `${m[1]} · ${m[2]} · ${m[3]}${m[4].padStart(2, '0')}` : l;
}
export const ruaDe = (l: string) => l.slice(0, 3);

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
export const emReais = (m: Material, c: Cambio) =>
  m.preco == null || !m.moeda ? null : m.preco * c[m.moeda].valor;

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
