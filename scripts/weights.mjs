// Gera src/data/weights.json (código → gramas) a partir do localizador de materiais.
// Uso: node scripts/weights.mjs ../localizador-de-materiais
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repo = process.argv[2];
if (!repo) throw new Error('Informe o caminho do localizador-de-materiais.');
const unit =
  /([0-9]+(?:[.,][0-9]+)?)\s*(kg|quilogramas?|quilos?|gramas?|gr|g)\b/iu;
const grams = (text) => {
  const at = text.toUpperCase().indexOf('PESO');
  const m = at < 0 ? null : text.slice(at).match(unit);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.')) * (/^k|^q/i.test(m[2]) ? 1000 : 1);
  return Number.isFinite(n) && n > 0 ? Number(n.toPrecision(12)) : null;
};
const items = [];
const walk = (v) => {
  if (Array.isArray(v)) v.forEach(walk);
  else if (v && typeof v === 'object') {
    if (typeof v.codigo === 'string' && typeof v.descritivo === 'string')
      items.push(v);
    Object.values(v).forEach(walk);
  }
};
const data = join(repo, 'src/data');
for (const f of readdirSync(data).filter((f) => f.endsWith('.json')))
  walk(JSON.parse(readFileSync(join(data, f), 'utf8')));
// Substituições fixas declaradas no código do localizador.
const src = readFileSync(join(repo, 'src/features/carts/cartData.ts'), 'utf8');
for (const m of src.matchAll(/codigo: '([^']+)', descritivo: '([^']+)'/g))
  items.push({ codigo: m[1], descritivo: m[2] });

const map = new Map(),
  conflict = new Set();
for (const { codigo, descritivo } of items) {
  const code = codigo.trim().toUpperCase(),
    g = grams(descritivo);
  if (!code || g === null) continue;
  if (map.has(code) && map.get(code) !== g) conflict.add(code);
  map.set(code, g);
}
for (const c of conflict) map.delete(c);
const out = Object.fromEntries([...map].sort(([a], [b]) => a.localeCompare(b)));
writeFileSync('src/data/weights.json', JSON.stringify(out, null, 1) + '\n');
console.log(
  `${map.size} códigos com peso, ${conflict.size} conflitos ignorados.`,
);
