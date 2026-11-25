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
// - A API é a informação mais correta (caio, 30/10): o código entra no galão
//   que ela aponta mesmo que o galão já tenha outro material (um galão guarda
//   vários itens), esteja marcado vazio (deixa de ser), passe do último galão
//   da rua (a rua cresce) ou o levantamento diga outro código (a API vale).
//   "SEM CODIGO" no galão é trocado pelo código. R12A1 não recebe parafuso,
//   porca nem arruela.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { aplicar, conhecidosDe, trKey } from './aplicar.mjs';

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
// Última leitura que gravou de verdade; se ainda está acabando (só refazendo
// páginas que falharam), vale a hora de agora.
const ultima = local
  ? { terminado_em: new Date().toISOString() }
  : get(
      'protheus_execucoes?select=*&gravados=gt.1000&order=id.desc&limit=1',
    ).map((e) => ({
      ...e,
      terminado_em: e.terminado_em ?? new Date().toISOString(),
    }))[0];
const conhecidos = conhecidosDe(state);
const linhas = local
  ? JSON.parse(fs.readFileSync(local, 'utf8'))
  : produtos(conhecidos);
const { resumo, mudou } = aplicar(state, linhas, ultima);
const px = new Set(linhas.map((r) => r.codigo));

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
