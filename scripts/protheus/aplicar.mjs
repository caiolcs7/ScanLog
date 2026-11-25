// Regras que aplicam a leitura do Protheus no state do Relatório (aba Ruas).
// Usado pelo relatorio.mjs (Node) e embutido na própria página, que se
// atualiza sozinha quando o dono abre. Não toca em state.c nem em state.ct.
import { posicoes, pesoG } from './regras.mjs';

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
const MOEDA = {
  REAL: 'BRL',
  DÓLAR: 'USD',
  DOLAR: 'USD',
  YUAN: 'CNY',
  EURO: 'EUR',
};


export { core, trKey };

// Códigos que interessam: os que já estão no Relatório (mais os com
// "ESTOQUE" no descritivo, que quem busca acrescenta).
export function conhecidosDe(state) {
  const conhecidos = new Set([
  ...Object.keys(state.ad || {}),
  ...Object.keys(state.inf || {}),
]);
for (const r of Object.values(state.ru || {}))
  for (const gv of Object.values(r.g || {}))
    for (const it of gv.i || []) if (it.c) conhecidos.add(it.c);
  return conhecidos;
}

// linhas: protheus_produtos; ultima: {terminado_em}. Muda o state no lugar.
export function aplicar(state, linhas, ultima) {
const px = new Map(linhas.map((r) => [r.codigo, r]));
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
  // caio (10/11): na R08, "R08G15S" é a bombona B15 do R08A1.
  if (p.rua === 8 && p.letra === 'G' && p.andar === 'A2')
    return { rua: 'R08A1', g: `B${p.n}`, letra: 'B', n: p.n };
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
    // Já está no mesmo galão do outro andar da rua (ex. R05G46 no A1 e o
    // endereço só no A2): não duplica.
    if (
      atuais.some((a) => a.rua.slice(0, 3) === p.rua.slice(0, 3) && a.g === p.g)
    )
      continue;
    if (p.rua === 'R12A1' && /\b(PARAFUSO|PORCA|ARRUELA)\b/i.test(novo))
      continue;
    // A página mostra os galões 1..k[letra].n; os vazios nem ficam em g.
    ru.k ??= {};
    const ultimo = ru.k[p.letra]?.n || 0;
    let gal = ru.g[p.g];
    const obs = [];
    if (p.n > ultimo) {
      ru.k[p.letra] = { ...ru.k[p.letra], n: p.n };
      obs.push(`rua passou de ${ultimo} para ${p.n}`);
    }
    if (!gal) gal = ru.g[p.g] = { i: [], v: false, pc: [] };
    if (gal.v) {
      gal.v = false;
      obs.push('deixou de ser vazio');
    }
    // "SEM CODIGO" (amarelo) vira o código que o Protheus aponta.
    gal.i = gal.i.filter((x) => !semCodigo(x.c));
    const outros = gal.i.map((x) => x.c);
    if (outros.length) obs.push(`junto com ${outros.join(', ')}`);
    if ((gal.pc || []).some((x) => x.c && x.c !== codigo))
      obs.push(`levantamento dizia ${gal.pc.map((x) => x.c).join(', ')}`);
    const item = { c: codigo, d: novo, p: peso };
    const t = tipoOk(r.tipo);
    if (t) item.t = t;
    gal.i.push(item);
    // A API resolveu a dúvida do levantamento.
    if (Array.isArray(gal.pc)) gal.pc = [];
    if (obs.length)
      resumo.conferir.push({
        codigo,
        rua: p.rua,
        g: p.g,
        motivo: obs.join('; '),
      });
    resumo.entrou.push({ codigo, rua: p.rua, g: p.g });
  }

  // Saiu do galão só se o texto antigo apontava para ele, o novo aponta para
  // um galão que o antigo não tinha (troca de galão) e o código já está nesse
  // galão novo (senão some do Relatório). Galão que só sumiu do texto fica
  // como estava (caio, 28/10).
  const antigas = new Set(
    posicoes(antigo)
      .map((p) => resolver(p, codigo))
      .map((p) => `${p.rua}|${p.g}`),
  );
  const trocou = [...chaves].some((k) => {
    const [rua, g] = k.split('|');
    return (
      !antigas.has(k) && state.ru[rua]?.g[g]?.i.some((x) => x.c === codigo)
    );
  });
  if (antigo && antigo !== novo && trocou) {
    for (const { rua, g } of atuais) {
      const k = `${rua}|${g}`;
      if (antigas.has(k) && !chaves.has(k)) {
        const gal = state.ru[rua].g[g];
        gal.i = gal.i.filter((x) => x.c !== codigo);
        resumo.saiu.push({ codigo, rua, g });
      }
    }
  }

  // Saldo, unidade, pedido, fabricantes, moeda e preço (ficha do item).
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
    // Preço = custo do Protheus na moeda dele (só com moeda conhecida e > 0).
    MOEDA[String(r.moeda || '').toUpperCase()] && Number(r.custo) > 0
      ? [Number(r.custo), MOEDA[String(r.moeda).toUpperCase()]]
      : null,
  ];
  state.inf ||= {};
  if (JSON.stringify(state.inf[codigo]) !== JSON.stringify(inf)) {
    state.inf[codigo] = inf;
    resumo.inf++;
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

  return { resumo, mudou: !!mudou };
}
