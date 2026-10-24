import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  FileSpreadsheet,
  LoaderCircle,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { Material, Moeda, Tipo } from './api';
import type { Contexto } from './App';
import { downloadBlob } from '../services/download';
import {
  dinheiro,
  emReais,
  inteiro,
  local,
  MOEDAS,
  oferta,
  ofertas,
  ORDEM_MOEDAS,
  porcento,
  reais,
  ruaDe,
  semAcento,
  temFornecedor,
  temPreco,
  type RuaResumo,
  type Vaga,
  vaga,
} from './format';
import { NovoCodigo } from './Ficha';
import { Seg } from './ui';

export type Filtro = {
  busca: string;
  situacao: '' | 'com' | 'sem';
  tipo: '' | Tipo;
  rua: string;
  andar: '' | 'A1' | 'A2';
  fornecedor: string; // id, 'sem' ou ''
  moeda: '' | Moeda;
  ordem: 'codigo' | 'preco' | 'recente';
};
export const filtroVazio: Filtro = {
  busca: '',
  situacao: '',
  tipo: '',
  rua: '',
  andar: '',
  fornecedor: '',
  moeda: '',
  ordem: 'codigo',
};

const antesNaRua = (a: Vaga, b: Vaga) =>
  a.andar.localeCompare(b.andar) || a.letra.localeCompare(b.letra) || a.n - b.n;
const NOME_ANDAR: Record<string, string> = { A1: 'Andar 1', A2: 'Andar 2' };
const nomeAndar = (a: string) => NOME_ANDAR[a] ?? `Andar ${a.slice(1)}`;

type Item = { m: Material; vagas: Vaga[] };

export function Lista({
  ctx,
  filtro,
  setFiltro,
  ruas,
}: {
  ctx: Contexto;
  filtro: Filtro;
  setFiltro: (f: Filtro | ((f: Filtro) => Filtro)) => void;
  ruas: RuaResumo[];
}) {
  const { dados, porId, cambio } = ctx;
  const [todos, setTodos] = useState(false);
  const [novo, setNovo] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [maisFiltros, setMaisFiltros] = useState(
    () =>
      !!(filtro.tipo || filtro.fornecedor || filtro.moeda) ||
      filtro.ordem !== 'codigo',
  );
  const topo = useRef<HTMLDivElement>(null);
  const busca = useDeferredValue(filtro.busca);
  const rua = filtro.rua;

  // Andares que a rua escolhida tem (A1, A2).
  const andares = useMemo(() => {
    if (!rua) return [];
    const s = new Set<string>();
    for (const m of dados.materiais)
      for (const l of m.locais) if (ruaDe(l) === rua) s.add(l.slice(3, 5));
    return [...s].sort();
  }, [dados.materiais, rua]);

  const lista = useMemo(() => {
    const q = semAcento(busca.trim());
    const r: Item[] = [];
    for (const m of dados.materiais) {
      if (
        (q &&
          !m.codigo.includes(q) &&
          !semAcento(m.descricao ?? '').includes(q)) ||
        (filtro.situacao && (filtro.situacao === 'com') !== temPreco(m)) ||
        (filtro.tipo && m.tipo !== filtro.tipo) ||
        (filtro.fornecedor &&
          (filtro.fornecedor === 'sem'
            ? ofertas(m).some((o) => o.fornecedor_id != null)
            : !temFornecedor(m, Number(filtro.fornecedor)))) ||
        (filtro.moeda && !ofertas(m).some((o) => o.moeda === filtro.moeda))
      )
        continue;
      if (!rua) {
        r.push({ m, vagas: [] });
        continue;
      }
      const vagas = m.locais
        .filter(
          (l) =>
            ruaDe(l) === rua &&
            (!filtro.andar || l.slice(3, 5) === filtro.andar),
        )
        .map(vaga)
        .filter((v): v is Vaga => !!v)
        .sort(antesNaRua);
      if (vagas.length) r.push({ m, vagas });
      else if (m.locais.some((l) => ruaDe(l) === rua && !vaga(l)))
        r.push({ m, vagas: [] });
    }
    if (filtro.ordem === 'preco')
      r.sort(
        (a, b) =>
          (emReais(b.m, cambio) ?? -1) - (emReais(a.m, cambio) ?? -1) ||
          a.m.codigo.localeCompare(b.m.codigo),
      );
    else if (filtro.ordem === 'recente')
      r.sort((a, b) =>
        (b.m.atualizado_em ?? b.m.criado_em).localeCompare(
          a.m.atualizado_em ?? a.m.criado_em,
        ),
      );
    else if (rua)
      // Na rua, a ordem é a do caminho: andar, depois posição.
      r.sort((a, b) =>
        a.vagas[0] && b.vagas[0]
          ? antesNaRua(a.vagas[0], b.vagas[0])
          : a.vagas[0]
            ? -1
            : b.vagas[0]
              ? 1
              : a.m.codigo.localeCompare(b.m.codigo),
      );
    return r;
  }, [dados.materiais, busca, filtro, rua, cambio]);

  // Separado por andar quando a rua tem dois e nenhum foi escolhido.
  const grupos = useMemo(() => {
    if (!rua || filtro.andar || andares.length < 2 || filtro.ordem !== 'codigo')
      return [{ titulo: '', itens: lista }];
    const g = new Map<string, Item[]>();
    for (const it of lista) {
      const a = it.vagas[0]?.andar ?? '';
      g.set(a, [...(g.get(a) ?? []), it]);
    }
    return [...g].map(([a, itens]) => ({
      titulo: a ? nomeAndar(a) : 'Sem posição',
      itens,
    }));
  }, [lista, rua, filtro.andar, filtro.ordem, andares.length]);

  // Filtros além da rua e do andar (que já aparecem no título).
  const ativos = (
    ['busca', 'situacao', 'tipo', 'fornecedor', 'moeda'] as const
  ).filter((k) => filtro[k] !== filtroVazio[k]).length;
  const escolhendo = !rua && !ativos && !todos;

  const muda = <K extends keyof Filtro>(k: K, v: Filtro[K]) =>
    setFiltro((f) => ({ ...f, [k]: v }));
  const irRua = (r: string) => {
    setFiltro({ ...filtroVazio, rua: r });
    setTodos(false);
  };
  const voltar = () => {
    setFiltro({ ...filtroVazio });
    setTodos(false);
  };

  // Ao entrar numa rua (ou voltar), a tela começa do topo da lista.
  const antes = useRef(rua);
  useEffect(() => {
    if (antes.current === rua) return;
    antes.current = rua;
    topo.current?.scrollIntoView({ block: 'start' });
  }, [rua]);

  const resumoFiltro = [
    rua && `Rua ${rua.slice(1)}`,
    filtro.andar && nomeAndar(filtro.andar),
    filtro.tipo,
    filtro.situacao === 'com'
      ? 'com preço'
      : filtro.situacao === 'sem'
        ? 'sem preço'
        : '',
    filtro.fornecedor &&
      (filtro.fornecedor === 'sem'
        ? 'sem fornecedor'
        : porId.get(Number(filtro.fornecedor))?.nome),
    filtro.moeda && MOEDAS[filtro.moeda].nome,
    filtro.busca && `“${filtro.busca}”`,
  ]
    .filter(Boolean)
    .join(' · ');
  const daRua = ruas.find((r) => r.rua === rua);

  return (
    <div className="view" ref={topo}>
      <div className="ferr-top">
        {!escolhendo && (
          <div className="rua-h">
            <button className="voltar" onClick={voltar}>
              <ArrowLeft aria-hidden />
              Ruas
            </button>
            <h2 className="rua-ttl">
              {rua ? (
                <>
                  Rua <b>{rua.slice(1)}</b>
                </>
              ) : (
                'Todos os materiais'
              )}
            </h2>
          </div>
        )}
        <label className="busca">
          <Search aria-hidden />
          <input
            type="search"
            placeholder={
              rua
                ? `Buscar na rua ${rua.slice(1)}`
                : 'Buscar código ou descrição'
            }
            value={filtro.busca}
            onChange={(e) => muda('busca', e.target.value)}
            aria-label="Buscar código ou descrição"
            enterKeyHint="search"
          />
          {filtro.busca && (
            <button
              className="busca-x"
              onClick={() => muda('busca', '')}
              aria-label="Apagar a busca"
            >
              <X aria-hidden />
            </button>
          )}
        </label>
      </div>

      {escolhendo ? (
        <EscolherRua
          ruas={ruas}
          total={dados.materiais.length}
          irRua={irRua}
          verTodos={() => setTodos(true)}
        />
      ) : (
        <>
          <div className="ferr">
            {rua && andares.length > 1 && (
              <Seg
                rotulo="Andar"
                valor={filtro.andar}
                mudar={(v) => muda('andar', v)}
                opcoes={[
                  { id: '', nome: 'Ambos' },
                  ...andares.map((a) => ({
                    id: a as Filtro['andar'],
                    nome: nomeAndar(a),
                  })),
                ]}
              />
            )}
            <Seg
              rotulo="Preço"
              valor={filtro.situacao}
              mudar={(v) => muda('situacao', v)}
              opcoes={[
                { id: '', nome: 'Todos' },
                { id: 'sem', nome: 'Sem preço' },
                { id: 'com', nome: 'Com preço' },
              ]}
            />
            <div className="ferr-l">
              <p className="conta" aria-live="polite">
                <span>
                  <b>{inteiro(lista.length)}</b>{' '}
                  {lista.length === 1 ? 'material' : 'materiais'}
                  {daRua && !ativos && !filtro.andar && (
                    <> · {porcento(daRua.comPreco, daRua.total)} com preço</>
                  )}
                </span>
                {ativos > 0 && (
                  <button
                    className="btn-link"
                    onClick={() =>
                      setFiltro((f) => ({
                        ...filtroVazio,
                        rua: f.rua,
                        andar: f.andar,
                        ordem: f.ordem,
                      }))
                    }
                  >
                    <X aria-hidden /> Limpar filtros
                  </button>
                )}
              </p>
              <button
                className="btn-link mf"
                aria-expanded={maisFiltros}
                onClick={() => setMaisFiltros((v) => !v)}
              >
                <SlidersHorizontal aria-hidden />
                {maisFiltros ? 'Menos filtros' : 'Mais filtros'}
              </button>
            </div>
            {maisFiltros && (
              <div className="filtros">
                <select
                  value={filtro.tipo}
                  onChange={(e) =>
                    muda('tipo', e.target.value as Filtro['tipo'])
                  }
                  aria-label="Tipo"
                >
                  <option value="">Todos os tipos</option>
                  <option value="MP">MP · Matéria-prima</option>
                  <option value="PI">PI · Intermediário</option>
                  <option value="PA">PA · Acabado</option>
                </select>
                <select
                  value={filtro.fornecedor}
                  onChange={(e) => muda('fornecedor', e.target.value)}
                  aria-label="Fornecedor"
                >
                  <option value="">Todos os fornecedores</option>
                  <option value="sem">Sem fornecedor</option>
                  {dados.fornecedores.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
                <select
                  value={filtro.moeda}
                  onChange={(e) =>
                    muda('moeda', e.target.value as Filtro['moeda'])
                  }
                  aria-label="Moeda"
                >
                  <option value="">Todas as moedas</option>
                  {ORDEM_MOEDAS.map((k) => (
                    <option key={k} value={k}>
                      {MOEDAS[k].nome}
                    </option>
                  ))}
                </select>
                <select
                  value={filtro.ordem}
                  onChange={(e) =>
                    muda('ordem', e.target.value as Filtro['ordem'])
                  }
                  aria-label="Ordem"
                >
                  <option value="codigo">
                    {rua ? 'Ordem: posição na rua' : 'Ordem: código'}
                  </option>
                  <option value="preco">Ordem: mais caro</option>
                  <option value="recente">Ordem: mais recente</option>
                </select>
              </div>
            )}
            <div className="acts">
              <button
                className="btn-ghost-s"
                disabled={baixando || !lista.length}
                onClick={async () => {
                  setBaixando(true);
                  try {
                    const { planilha } = await import('./planilha');
                    const blob = await planilha(
                      lista.map((x) => x.m),
                      dados.fornecedores,
                      cambio,
                      resumoFiltro || 'Todos os materiais',
                    );
                    const d = new Date();
                    downloadBlob(
                      blob,
                      `Painel_de_Materiais_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.xlsx`,
                    );
                  } catch (e) {
                    ctx.avisar((e as Error).message, 'erro');
                  }
                  setBaixando(false);
                }}
              >
                {baixando ? (
                  <LoaderCircle className="gira" aria-hidden />
                ) : (
                  <FileSpreadsheet aria-hidden />
                )}
                Excel
              </button>
              <button className="btn-s" onClick={() => setNovo(true)}>
                <Plus aria-hidden /> Novo código
              </button>
            </div>
          </div>

          {lista.length ? (
            grupos.map((g) => (
              <section key={g.titulo || 'todos'} className="grupo">
                {g.titulo && (
                  <h3 className="grupo-t">
                    {g.titulo}
                    <span>
                      {inteiro(g.itens.length)}{' '}
                      {g.itens.length === 1 ? 'material' : 'materiais'}
                    </span>
                  </h3>
                )}
                <ul className="mats">
                  {g.itens.map((it) => (
                    <Linha
                      key={it.m.codigo}
                      m={it.m}
                      vagas={rua ? it.vagas : null}
                      ctx={ctx}
                    />
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <div className="ru-msg">
              <p className="h2">Nenhum material encontrado</p>
              <p className="msg">
                {ativos
                  ? 'Apague a busca ou toque em “Limpar filtros”.'
                  : 'Esta rua ainda não tem materiais.'}
              </p>
            </div>
          )}
        </>
      )}
      {novo && <NovoCodigo ctx={ctx} fechar={() => setNovo(false)} />}
    </div>
  );
}

/** Primeira tela: uma placa por rua, como as pintadas no piso. */
function EscolherRua({
  ruas,
  total,
  irRua,
  verTodos,
}: {
  ruas: RuaResumo[];
  total: number;
  irRua: (rua: string) => void;
  verTodos: () => void;
}) {
  const comCodigos = ruas.filter((r) => r.total);
  return (
    <section className="esc" aria-labelledby="esc-t">
      <div className="p-h">
        <h2 className="h2" id="esc-t">
          Escolha a rua
        </h2>
        <span className="p-s">ou busque o código acima</span>
      </div>
      <ul className="ruas">
        {comCodigos.map((r) => {
          const sem = r.total - r.comPreco;
          return (
            <li key={r.rua}>
              <button
                className="rua"
                data-rua={r.rua}
                onClick={() => irRua(r.rua)}
                aria-label={`Rua ${r.rua.slice(1)}: ${r.total} materiais, ${sem} sem preço`}
              >
                <span className="rua-n">
                  <small>Rua</small>
                  <span>{r.rua.slice(1)}</span>
                </span>
                <span className="rua-i">
                  <b>{inteiro(r.total)} materiais</b>
                  <span className={`rua-s ${sem ? '' : 'feito'}`}>
                    {sem ? `${inteiro(sem)} sem preço` : 'Todos com preço'}
                  </span>
                </span>
                <span className="bar fina" aria-hidden>
                  <i
                    className="b-ok"
                    style={{ width: `${(r.comPreco / r.total) * 100}%` }}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <button className="btn-ghost todos" onClick={verTodos}>
        Ver todos os {inteiro(total)} materiais
        <ChevronRight aria-hidden />
      </button>
    </section>
  );
}

function Linha({
  m,
  vagas,
  ctx,
}: {
  m: Material;
  /** Na rua: as posições do material nela, a primeira em destaque. */
  vagas: Vaga[] | null;
  ctx: Contexto;
}) {
  const r = emReais(m, ctx.cambio),
    o = oferta(m),
    nomes = ofertas(m)
      .map((x) =>
        x.fornecedor_id != null ? ctx.porId.get(x.fornecedor_id)?.nome : null,
      )
      .filter((x): x is string => !!x);
  const v = vagas?.[0];
  const outras =
    vagas
      ?.slice(1)
      .map((x) =>
        x.andar === v?.andar ? x.rotulo : `${x.andar} ${x.rotulo}`,
      ) ?? [];
  return (
    <li>
      <button
        className={`mat ${vagas ? 'na-rua' : ''}`}
        onClick={() => ctx.abrir(m.codigo)}
      >
        {vagas && (
          <span
            className={`vaga mono ${v && v.rotulo.length > 4 ? 'longa' : ''}`}
            aria-label={v ? `Posição ${v.rotulo}` : undefined}
          >
            {v ? v.rotulo : '—'}
          </span>
        )}
        <span className="mat-a">
          <span className="mat-c mono">{m.codigo}</span>
          <span className="mat-d">{m.descricao ?? 'Sem descrição'}</span>
          <span className="mat-l">
            {m.tipo && <span className="tag">{m.tipo}</span>}
            {vagas ? (
              <>
                {outras.length > 0 && (
                  <span className="tag tag-l">
                    também em{' '}
                    <span className="mono">
                      {outras.slice(0, 4).join(', ')}
                      {outras.length > 4 && ` +${outras.length - 4}`}
                    </span>
                  </span>
                )}
              </>
            ) : (
              <>
                {m.locais.slice(0, 2).map((l) => (
                  <span key={l} className="tag tag-l mono">
                    {local(l)}
                  </span>
                ))}
                {m.locais.length > 2 && (
                  <span className="tag">+{m.locais.length - 2}</span>
                )}
              </>
            )}
          </span>
        </span>
        <span className="mat-b">
          {o ? (
            <>
              <b className="mat-p mono">{dinheiro(o.preco!, o.moeda!)}</b>
              {o.moeda !== 'BRL' && r != null && Number.isFinite(r) && (
                <span className="mat-r mono">≈ {reais(r)}</span>
              )}
            </>
          ) : (
            <span className="pill pill-sem">Sem preço</span>
          )}
          {nomes.map((n) => (
            <span key={n} className="mat-f">
              {n}
            </span>
          ))}
        </span>
        <ChevronRight className="mat-ir" aria-hidden />
      </button>
    </li>
  );
}
