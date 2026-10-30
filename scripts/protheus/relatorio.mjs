// Aplica no Relatório dos Containers (aba Ruas) o que mudou no Protheus.
// Lê protheus_produtos do Supabase, compara com o state da página e grava uma
// página nova só se algo mudou. Uso:
//   node scripts/protheus/relatorio.mjs <pagina.html> <saida.html> [traducoes.json]
// Saída extra: <saida>.resumo.json (o que mudou) e <saida>.traduzir.json
// (descritivos novos sem tradução; quem roda traduz e passa de volta no 3º
// argumento como {chave: [inglês, chinês]}).
//
// Regras (as do /painelruas, combinadas com caio):
// - O Protheus é a fonte: descritivo, tipo, saldo, pedido, fabricantes e moeda
//   seguem ele. Nada é apagado por ausência (código bloqueado ou fora da
//   leitura fica como está).
// - Peso vem do texto "PESO ..." do descritivo; se o novo não tem peso legível,
//   fica o que estava.
// - Galão vem do "*ESTOQUE R05G49S/G50S". S = 2º andar, mas se o código tem
//   endereço de prateleira em um só andar daquela rua, vale o endereço.
//   B vira G em R13A1/R14A1.
// - Código entra no galão que o descritivo aponta. Sai de um galão só quando o
//   descritivo antigo apontava para ele e o novo aponta para outro lugar (um
//   código ocupa vários galões no físico que o texto não lista).
// - Só entra sozinho em galão existente e sem material (ou só com "SEM
//   CODIGO", que é trocado pelo código). Galão novo, ocupado,
//   marcado vazio ou com outro código no levantamento vai para conferência.
//   R12A1 não recebe parafuso, porca nem arruela.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { posicoes, pesoG } from './regras.mjs';

const SUPABASE = 'https://pygedyytlcplfweibenv.supabase.co/rest/v1';
const CHAVE = 'sb_publishable_Wo0BJpc1B3O8Feog9to3yQ_PcBZfNcQ';

const [, , entrada, saida, traducoes] = process.argv;
if (!entrada || !saida) {
  console.error(
    'uso: node scripts/protheus/relatorio.mjs <pagina.html> <saida.html> [traducoes.json]',
  );
  process.exit(1);
}

function get(caminho) {
  const out = execFileSync(
    'curl',
    [
      '-sS',
      '--fail',
      '--retry',
      '4',
      '--retry-all-errors',
      '--retry-delay',
      '5',
      '-H',
      `apikey: ${CHAVE}`,
      `${SUPABASE}/${caminho}`,
    ],
    {
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  return JSON.parse(out.toString('utf8'));
}

// A tabela tem centenas de milhares de códigos; só interessam os que já
// estão no Relatório e os que têm "ESTOQUE" (galão) no descritivo.
function paginado(filtro) {
  const todos = [];
  for (let de = 0; ; de += 1000) {
    const parte = get(
      `protheus_produtos?select=*&${filtro}&order=codigo&offset=${de}&limit=1000`,
    );
    todos.push(...parte);
    if (parte.length < 1000) return todos;
  }
}
function produtos(codigos) {
  const porCodigo = new Map();
  for (const r of paginado('descricao=ilike.*ESTOQUE*'))
    porCodigo.set(r.codigo, r);
  const faltam = [...codigos].filter((c) => !porCodigo.has(c));
  for (let i = 0; i < faltam.length; i += 150) {
    const lista = faltam
      .slice(i, i + 150)
      .map((c) => `"${c.replace(/"/g, '')}"`)
      .join(',');
    for (const r of paginado(`codigo=in.(${encodeURIComponent(lista)})`))
      porCodigo.set(r.codigo, r);
  }
  return [...porCodigo.values()];
}

const RE_STATE =
  /(<script type="application\/json" id="state">)([\s\S]*?)(<\/script>)/;
const html = fs.readFileSync(entrada, 'utf8');
const m = RE_STATE.exec(html);
if (!m) throw new Error('state não encontrado na página');
const state = JSON.parse(m[2]);

// PROTHEUS_JSON=<arquivo> usa uma lista local no lugar do Supabase (testes).
const local = process.env.PROTHEUS_JSON;
const ultima = local
  ? { terminado_em: new Date().toISOString() }
  : get(
      'protheus_execucoes?select=*&terminado_em=not.is.null&lidos=gt.1000&order=id.desc&limit=1',
    )[0];
const conhecidos = new Set([
  ...Object.keys(state.ad || {}),
  ...Object.keys(state.inf || {}),
]);
for (const r of Object.values(state.ru || {}))
  for (const gv of Object.values(r.g || {}))
    for (const it of gv.i || []) if (it.c) conhecidos.add(it.c);
const linhas = local
  ? JSON.parse(fs.readFileSync(local, 'utf8'))
  : produtos(conhecidos);
const px = new Map(linhas.map((r) => [r.codigo, r]));

// Mesma chave de tradução da página: trKey(d) = core(d) sem "*ESTOQUE".
function core(d) {
  d = String(d || '');
  d = d.replace(/\s*\*?\s*ESTOQUE\b[\s\S]*$/i, '');
  d = d.replace(
    /[\s,.-]*\bPESO\b\s*(?:IA\b)?\s*:?\s*(?:[\d.,]+\s*(?:KGS?|G)?\b)?/gi,
    ' ',
  );
  return d
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.\-:]+|[\s,.\-:;]+$/g, '')
    .trim();
}
const trKey = (d) =>
  core(d)
    .replace(/[\s,]*\*ESTOQ\w*\s*$/, '')
    .trim();

const SEM_FAB = /^(OK|ATIVO|CODIGO ANTIGO|C[OÓ]DIGO ANTIGO|-+|—|N\/A|NA)$/i;
function fab(v) {
  v = String(v || '')
    .replace(/^_+/, '')
    .trim();
  return !v || SEM_FAB.test(v) ? '' : v;
}
const MOEDA = { REAL: 'BRL', DÓLAR: 'USD', DOLAR: 'USD', YUAN: 'CNY' };

// Onde cada código está hoje: codigo -> [{rua, g, item}]
const onde = new Map();
for (const [rua, r] of Object.entries(state.ru || {})) {
  for (const [g, gv] of Object.entries(r.g)) {
    for (const it of gv.i) {
      if (!onde.has(it.c)) onde.set(it.c, []);
      onde.get(it.c).push({ rua, g, it });
    }
  }
}

const andaresDoEndereco = (codigo, rua) =>
  new Set(
    (state.ad?.[codigo] || [])
      .map((e) => /^R(\d{2})(A[12])/.exec(e))
      .filter((x) => x && +x[1] === rua)
      .map((x) => x[2]),
  );

// Posição do texto -> chave da rua no Relatório e chave do galão.
function resolver(p, codigo) {
  const andares = andaresDoEndereco(codigo, p.rua);
  const andar = andares.size === 1 ? [...andares][0] : p.andar;
  const rua = `R${String(p.rua).padStart(2, '0')}${andar}`;
  const letra =
    p.letra === 'B' && (rua === 'R13A1' || rua === 'R14A1') ? 'G' : p.letra;
  return { rua, g: `${letra}${p.n}`, letra, n: p.n };
}

const resumo = {
  leitura: ultima ? ultima.terminado_em : null,
  descritivo: [],
  peso: [],
  entrou: [],
  saiu: [],
  conferir: [],
  inf: 0,
};

const semCodigo = (c) => /^SEM\s*C[OÓ]DIGO$/i.test(String(c || '').trim());
const tipoOk = (t) => (t && /^[A-Z]{2}$/.test(t) ? t : undefined);

for (const [codigo, r] of px) {
  const novo = String(r.descricao || '').trim();
  if (!novo) continue;
  const atuais = onde.get(codigo) || [];
  const antigo = atuais[0]?.it.d || '';
  const posNovas = posicoes(novo).map((p) => resolver(p, codigo));
  const noRelatorio =
    atuais.length > 0 || posNovas.some((p) => state.ru[p.rua]);
  if (!noRelatorio) continue;
  const peso = pesoG(novo);

  // Descritivo, tipo e peso de cada item que já existe.
  for (const { rua, g, it } of atuais) {
    if (it.d !== novo) {
      resumo.descritivo.push({ codigo, rua, g, antes: it.d, depois: novo });
      it.d = novo;
    }
    const t = tipoOk(r.tipo);
    if (t && it.t !== t) it.t = t;
    if (peso != null && it.p !== peso) {
      resumo.peso.push({ codigo, rua, g, antes: it.p, depois: peso });
      it.p = peso;
    }
  }

  // Galões que o descritivo aponta.
  const chaves = new Set();
  for (const p of posNovas) {
    const k = `${p.rua}|${p.g}`;
    if (chaves.has(k)) continue;
    chaves.add(k);
    const ru = state.ru[p.rua];
    if (!ru) continue;
    if (atuais.some((a) => a.rua === p.rua && a.g === p.g)) continue;
    // A página mostra os galões 1..k[letra].n; os vazios nem ficam em g.
    const existe = p.n <= (ru.k?.[p.letra]?.n || 0);
    let gal = ru.g[p.g] || (existe ? { i: [], v: false, pc: [] } : null);
    // Só preenche galão que existe e está sem material. Galão novo, ocupado
    // por outro código, marcado vazio ou com outro código no levantamento vai
    // para a lista de conferência (o texto do Protheus às vezes tem erro de
    // digitação: G41 no lugar de G241).
    const motivo = !gal
      ? 'galão além do último da rua'
      : gal.v
        ? 'galão marcado vazio'
        : gal.i.some((x) => !semCodigo(x.c))
          ? `galão já tem ${gal.i.map((x) => x.c).join(', ')}`
          : (gal.pc || []).some((x) => x.c && x.c !== codigo)
            ? `levantamento diz ${gal.pc.map((x) => x.c).join(', ')}`
            : null;
    if (motivo) {
      resumo.conferir.push({ codigo, rua: p.rua, g: p.g, motivo });
      continue;
    }
    if (p.rua === 'R12A1' && /\b(PARAFUSO|PORCA|ARRUELA)\b/i.test(novo))
      continue;
    ru.g[p.g] = gal;
    // "SEM CODIGO" (amarelo) vira o código que o Protheus aponta.
    gal.i = gal.i.filter((x) => !semCodigo(x.c));
    const item = { c: codigo, d: novo, p: peso };
    const t = tipoOk(r.tipo);
    if (t) item.t = t;
    gal.i.push(item);
    if (Array.isArray(gal.pc)) gal.pc = gal.pc.filter((x) => x.c !== codigo);
    resumo.entrou.push({ codigo, rua: p.rua, g: p.g });
  }

  // Saiu do galão só se o texto antigo apontava para ele, o novo aponta para
  // outro lugar e o código já está nesse outro lugar (senão some do Relatório).
  const colocado = [...chaves].some((k) => {
    const [rua, g] = k.split('|');
    return state.ru[rua]?.g[g]?.i.some((x) => x.c === codigo);
  });
  if (antigo && antigo !== novo && colocado) {
    const antigas = new Set(
      posicoes(antigo)
        .map((p) => resolver(p, codigo))
        .map((p) => `${p.rua}|${p.g}`),
    );
    for (const { rua, g } of atuais) {
      const k = `${rua}|${g}`;
      if (antigas.has(k) && !chaves.has(k)) {
        const gal = state.ru[rua].g[g];
        gal.i = gal.i.filter((x) => x.c !== codigo);
        resumo.saiu.push({ codigo, rua, g });
      }
    }
  }

  // Saldo, unidade, pedido, fabricantes e moeda (ficha do item).
  const ant = state.inf?.[codigo] || [0, 'UN', 0, 0, '', [], []];
  const nac = fab(r.fab_nacional);
  const imp = fab(r.fab_importado);
  const fabs = [];
  const moedas = [];
  if (nac) {
    fabs.push(nac);
    moedas.push('BRL');
  }
  if (imp && imp.toUpperCase() !== nac.toUpperCase()) {
    fabs.push(imp);
    moedas.push(MOEDA[String(r.moeda || '').toUpperCase()] ?? null);
  }
  const inf = [
    Number(r.saldo_estoque ?? ant[0]) || 0,
    r.unidade || ant[1] || 'UN',
    Number(r.saldo_compra ?? ant[2]) || 0,
    ant[3] || 0,
    fabs.join(' / '),
    fabs,
    moedas,
  ];
  state.inf ||= {};
  if (JSON.stringify(state.inf[codigo]) !== JSON.stringify(inf)) {
    state.inf[codigo] = inf;
    resumo.inf++;
  }
}

// Traduções: as que vieram de fora entram; as que faltam vão para a lista.
state.tr ||= {};
if (traducoes) {
  for (const [k, v] of Object.entries(
    JSON.parse(fs.readFileSync(traducoes, 'utf8')),
  )) {
    if (Array.isArray(v) && v.length === 2 && !state.tr[k]) state.tr[k] = v;
  }
}
const faltam = new Set();
for (const r of Object.values(state.ru)) {
  for (const g of Object.values(r.g)) {
    for (const it of g.i) {
      const k = trKey(it.d);
      if (k && !state.tr[k]) faltam.add(k);
    }
  }
}

const mudou =
  resumo.descritivo.length ||
  resumo.peso.length ||
  resumo.entrou.length ||
  resumo.saiu.length ||
  resumo.inf;
if (mudou && ultima) {
  const d = new Date(ultima.terminado_em);
  state.infT = d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const json = JSON.stringify(state).replace(/</g, '\\u003c');
fs.writeFileSync(
  saida,
  html.replace(RE_STATE, (_, a, __, c) => a + json + c),
);
fs.writeFileSync(`${saida}.resumo.json`, JSON.stringify(resumo, null, 1));
fs.writeFileSync(
  `${saida}.traduzir.json`,
  JSON.stringify([...faltam], null, 1),
);
console.log(
  JSON.stringify({
    produtos: px.size,
    descritivo: resumo.descritivo.length,
    peso: resumo.peso.length,
    entrou: resumo.entrou.length,
    saiu: resumo.saiu.length,
    conferir: resumo.conferir.length,
    inf: resumo.inf,
    traduzir: faltam.size,
    mudou: !!mudou,
  }),
);
