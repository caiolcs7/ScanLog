import catalog from '../data/weights.json';
import { db } from './database';

const table: Record<string, number> = catalog;

/** Peso unitário em gramas vindo do localizador de materiais (campo PESO). */
export function catalogWeight(code: string) {
  return table[code.trim().toUpperCase()];
}
/** Aceita "0,24", "1.5", "1.234,5"; retorna gramas ou null. */
export function parseGrams(value: string) {
  const text = value.trim().replace(/\s|g$/gi, '');
  if (!text) return null;
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  if (!/^\d*\.?\d+$/.test(normalized)) return null;
  const grams = Number(normalized);
  return Number.isFinite(grams) && grams > 0 && grams <= 1e9 ? grams : null;
}
export function formatGrams(grams: number) {
  return `${grams.toLocaleString('pt-BR', { maximumFractionDigits: 6 })} g`;
}
/** Casas decimais do valor em kg (mínimo 3): 10 g → 3, 0,24 g → 5. */
export function kgDecimals(grams: number) {
  const fraction = (grams / 1000).toFixed(12).replace(/0+$/, '').split('.')[1];
  return Math.max(3, fraction?.length ?? 0);
}
/** 10 g → "0,010 kg"; 0,24 g → "0,00024 kg". */
export function formatKg(grams: number) {
  const digits = kgDecimals(grams);
  return `${(grams / 1000).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} kg`;
}
export async function setRecordWeight(id: string, grams: number | null) {
  await db.records.update(id, { weight: grams ?? undefined });
}
