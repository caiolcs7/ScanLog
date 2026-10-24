// Atualiza src/painel/ruas.json a partir da "Consulta de estoque" do sistema
// (arquivo .xls que na verdade é CSV com ";"). Uso:
//   node scripts/planilha-ruas.mjs <planilha.xls> [--resumo]
// Regras (pedidas por caio):
// - A1 = 1º andar, A2 = 2º andar (já vem no endereço).
// - "OK", "—", "CODIGO ANTIGO"... em fabricante = sem fornecedor.
// - Cada código pode ter 2 fornecedores: o fabricante importado (Internacional)
//   vai em "fornecedor" e o nacional em "fornecedor2". Se só há um, vai em
//   "fornecedor". Se os dois têm o mesmo nome, é um só (Nacional).
// - Todo código ganha o endereço completo da planilha (R14A1C01DP01), mesmo
//   quem já tinha o galão do Relatório (R14A1G01) naquela rua.
// - Saldo, pedidos e demais números de estoque não entram.
// - Quem já está em ruas.json mantém descrição, tipo, peso e localizações do
//   Relatório e ganha os endereços da planilha que ainda não tinha.
import fs from 'node:fs';

const [, , arquivo, ...args] = process.argv;
if (!arquivo) {
  console.error(
    'uso: node scripts/planilha-ruas.mjs <planilha.xls> [--resumo]',
  );
  process.exit(1);
}
const DESTINO = new URL('../src/painel/ruas.json', import.meta.url);

// ---- CSV com ";" e aspas ----
function linhas(texto) {
  const r = [];
  let l = [],
    c = '',
    q = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (q) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          c += '"';
          i++;
        } else q = false;
      } else c += ch;
    } else if (ch === '"') q = true;
    else if (ch === ';') {
      l.push(c);
      c = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      l.push(c);
      c = '';
      if (l.length > 1 || l[0] !== '') r.push(l);
      l = [];
    } else c += ch;
  }
  if (c || l.length) {
    l.push(c);
    r.push(l);
  }
  return r;
}
const texto = fs.readFileSync(arquivo, 'utf8').replace(/^\uFEFF/, '');
const todas = linhas(texto);
const cab = todas.findIndex((l) => l[0] === 'Código');
if (cab < 0) throw new Error('Cabeçalho "Código" não encontrado.');
const H = todas[cab];
const col = (nome) => {
  const i = H.indexOf(nome);
  if (i < 0) throw new Error(`Coluna "${nome}" não encontrada.`);
  return i;
};
const C = {
  codigo: col('Código'),
  end: col('Código do endereço'),
  desc: col('Descrição'),
  peso: col('Peso'),
  tipo: col('Tipo'),
  det: col('Detalhamento'),
  imp: col('Fabricante importado'),
  nac: col('Fabricante nacional'),
};
const dados = todas.slice(cab + 1).filter((l) => l.length === H.length);

// ---- endereços: um por "Rua R18 · Andar 1 · Coluna 6 · Lado Direito · Prateleira 02" ----
const END =
  /Rua (R\d{2}) · Andar (\d) · Coluna ([A-Z0-9]+) · Lado (Direito|Esquerdo) · (Prateleira|Galão) (\d+)/g;
function enderecos(det) {
  const r = [];
  for (const m of det.matchAll(END)) {
    const coluna = /^\d+$/.test(m[3]) ? `C${m[3].padStart(2, '0')}` : m[3];
    r.push(
      `${m[1]}A${m[2]}${coluna}${m[4][0] === 'D' ? 'D' : 'E'}${m[5] === 'Galão' ? 'G' : 'P'}${m[6].padStart(2, '0')}`,
    );
  }
  return [...new Set(r)];
}

// ---- peso: "18,00 g - IA" / "1,638 kg - IA" ----
function peso(s) {
  const m = /^([\d.,]+)\s*(kg|g)\b/i.exec(s.trim());
  if (!m) return null;
  let n = m[1];
  n = n.includes(',') ? n.replace(/\./g, '').replace(',', '.') : n;
  const v = Number(n) * (m[2].toLowerCase() === 'kg' ? 1000 : 1);
  return Number.isFinite(v) && v > 0 && v < 1e8
    ? Math.round(v * 1000) / 1000
    : null;
}

// ---- fornecedor ----
const VAZIO = new Set([
  'OK',
  '—',
  '',
  '?',
  '-',
  'N/A',
  'IMPORTADO',
  'CODIGO ANTIGO',
  'COD ANTIGO',
  'MOLDE PERDIDO',
  'NAO USA MAIS',
  'SAIU DE LINHA',
  'SEM HIST COMP',
  'LEAD FREE',
]);
const MACC = /^(MACCOMEVAP|MACOMEVAP|MACC?)$/i;
const limpo = (s) => {
  s = s.replace(/\s+/g, ' ').trim();
  if (VAZIO.has(s.toUpperCase())) return null;
  if (MACC.test(s)) return 'MACCOMEVAP';
  if (/^WEIDMUELLER$/i.test(s)) return 'WEIDMULLER';
  // observação digitada junto do nome ("... ( NÃO T...")
  if (/^Leifeng Silicon products Factory/i.test(s))
    return 'Leifeng Silicon products Factory';
  return s;
};
// Até 2 fornecedores: [importado (internacional), nacional]. Só um: vai no 1º.
function fornecedores(imp, nac) {
  const i = limpo(imp),
    n = limpo(nac);
  if (!i && !n) return [];
  if (i && !n) return [{ nome: i, origem: 'internacional' }];
  if (n && !i) return [{ nome: n, origem: 'nacional' }];
  if (i.toUpperCase() === n.toUpperCase())
    return [{ nome: n, origem: 'nacional' }];
  return [
    { nome: i, origem: 'internacional' },
    { nome: n, origem: 'nacional' },
  ];
}

// ---- junta com o que já existe ----
const base = new Map(
  JSON.parse(fs.readFileSync(DESTINO, 'utf8')).map((m) => [m.codigo, m]),
);
const grafia = new Map(); // maiúsculas → grafia mais comum
const contagem = new Map();
for (const l of dados)
  for (const c of [C.imp, C.nac]) {
    const n = limpo(l[c]);
    if (!n) continue;
    const k = n.toUpperCase(),
      m = contagem.get(k) ?? new Map();
    m.set(n, (m.get(n) ?? 0) + 1);
    contagem.set(k, m);
  }
for (const [k, m] of contagem)
  grafia.set(k, [...m].sort((a, b) => b[1] - a[1])[0][0]);

const saida = [];
const vistos = new Set();
const r = {
  novos: 0,
  ja: 0,
  locais_extra: 0,
  sem_endereco: 0,
  forn: 0,
  sem_forn: 0,
  dois: 0,
};
for (const l of dados) {
  const codigo = l[C.codigo].trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9./_-]{0,39}$/.test(codigo)) {
    console.error('código fora do padrão, ignorado:', codigo);
    continue;
  }
  if (vistos.has(codigo)) {
    console.error('código repetido, ignorado:', codigo);
    continue;
  }
  vistos.add(codigo);
  const antigo = base.get(codigo);
  let ends = enderecos(l[C.det]);
  // sem o detalhamento por extenso: usa o código do endereço como está
  if (!ends.length)
    ends = [
      ...new Set(
        l[C.end]
          .split(/(?=R\d{2}A\d)/)
          .filter((t) => /^R\d{2}A\d[A-Z0-9]+$/.test(t)),
      ),
    ];
  const tipo = ['MP', 'PI', 'PA'].includes(l[C.tipo]) ? l[C.tipo] : null;
  const item = antigo
    ? { ...antigo, locais: [...antigo.locais] }
    : {
        codigo,
        descricao:
          l[C.desc]
            .replace(/\s*\*\s*estoque\s+R\d{2}G\d+S?\s*$/i, '')
            .trim()
            .slice(0, 300) || null,
        tipo,
        peso_g: peso(l[C.peso]),
        locais: [],
      };
  if (antigo) {
    r.ja++;
    const tem = new Set(item.locais);
    for (const e of ends)
      if (!tem.has(e)) {
        item.locais.push(e);
        r.locais_extra++;
      }
    item.tipo ??= tipo;
    item.peso_g ??= peso(l[C.peso]);
  } else {
    r.novos++;
    item.locais = ends;
  }
  // "Coluna 0 · Prateleira 00" é posição não informada: some se há outra.
  const real = item.locais.filter((e) => !/C00[DEC]P00$/.test(e));
  if (real.length) item.locais = real;
  if (!item.locais.length) r.sem_endereco++;
  const fs_ = fornecedores(l[C.imp], l[C.nac]);
  for (const k of ['fornecedor', 'forn_origem', 'fornecedor2', 'forn2_origem'])
    delete item[k];
  fs_.forEach((f, i) => {
    const suf = i ? '2' : '';
    item[`fornecedor${suf}`] = grafia.get(f.nome.toUpperCase()) ?? f.nome;
    item[`forn${suf}_origem`] = f.origem;
  });
  if (fs_.length) r.forn++;
  else r.sem_forn++;
  if (fs_.length === 2) r.dois++;
  saida.push(item);
}
// os 3 que só existiam no Relatório continuam (nada se apaga)
for (const [codigo, m] of base)
  if (!vistos.has(codigo)) {
    saida.push(m);
    r.so_painel = (r.so_painel ?? 0) + 1;
  }
saida.sort((x, y) => (x.codigo < y.codigo ? -1 : 1));
console.log(JSON.stringify({ total: saida.length, ...r }, null, 1));
if (!args.includes('--resumo')) {
  fs.writeFileSync(DESTINO, JSON.stringify(saida));
  console.log('gravado', DESTINO.pathname);
}
