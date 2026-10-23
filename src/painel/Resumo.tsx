import { useMemo, useState } from 'react';
import { DownloadCloud, LoaderCircle, RotateCcw } from 'lucide-react';
import { importarRuas, type Mudanca, type Moeda } from './api';
import type { Contexto } from './App';
import type { Filtro } from './Lista';
import {
  dataCurta,
  dinheiro,
  emReais,
  haQuanto,
  inteiro,
  MOEDAS,
  ORDEM_MOEDAS,
  porcento,
  reais,
  reaisCurto,
  type RuaResumo,
} from './format';
import { diferencas } from './mudanca';
import { Confirmar, useDica } from './ui';

type Props = {
  ctx: Contexto;
  ruas: RuaResumo[];
  irPara: (a: 'materiais' | 'fornecedores', f?: Partial<Filtro>) => void;
  desfazer: (id: number) => void;
  recarregar: () => void;
};

export function Resumo({ ctx, ruas, irPara, desfazer, recarregar }: Props) {
  const { dados, cambio, porId, sessao } = ctx,
    ms = dados.materiais;
  const [dica, dicaEl] = useDica();
  const n = useMemo(() => {
    const comPreco = ms.filter((m) => m.preco != null);
    const comQtd = comPreco.filter((m) => m.quantidade != null);
    const valor = comQtd.reduce(
      (s, m) => s + (emReais(m, cambio) ?? 0) * (m.quantidade ?? 0),
      0,
    );
    const usados = new Set(
      ms.map((m) => m.fornecedor_id).filter((x) => x != null),
    );
    const tipos = (['MP', 'PI', 'PA'] as const).map((t) => {
      const doTipo = ms.filter((m) => m.tipo === t);
      return {
        t,
        total: doTipo.length,
        com: doTipo.filter((m) => m.preco != null).length,
      };
    });
    const porForn = new Map<number, number>();
    for (const m of ms)
      if (m.fornecedor_id != null)
        porForn.set(m.fornecedor_id, (porForn.get(m.fornecedor_id) ?? 0) + 1);
    const fornecedores = [...porForn]
      .map(([id, qtd]) => ({ f: porId.get(id), qtd }))
      .filter((x) => x.f)
      .sort((a, b) => b.qtd - a.qtd);
    const origem = { nacional: 0, internacional: 0, sem: 0 };
    for (const m of comPreco) {
      const f =
        m.fornecedor_id != null ? porId.get(m.fornecedor_id) : undefined;
      origem[f ? f.origem : 'sem']++;
    }
    const moedas = Object.fromEntries(
      ORDEM_MOEDAS.map((k) => [
        k,
        comPreco.filter((m) => m.moeda === k).length,
      ]),
    ) as Record<Moeda, number>;
    const caros = comPreco
      .map((m) => ({ m, r: emReais(m, cambio) ?? 0 }))
      .filter((x) => Number.isFinite(x.r))
      .sort((a, b) => b.r - a.r)
      .slice(0, 10);
    return {
      comPreco: comPreco.length,
      comQtd: comQtd.length,
      valor,
      usados: usados.size,
      tipos,
      fornecedores,
      origem,
      moedas,
      caros,
    };
  }, [ms, cambio, porId]);

  if (!ms.length) return <Vazio ctx={ctx} recarregar={recarregar} />;
  const total = ms.length,
    nac = dados.fornecedores.filter((f) => f.origem === 'nacional').length;

  return (
    <div className="view">
      <div className="kpis">
        <Kpi
          rotulo="Códigos"
          valor={inteiro(total)}
          nota={`em ${ruas.filter((r) => r.total).length} ruas`}
        />
        <Kpi
          rotulo="Com preço"
          valor={porcento(n.comPreco, total)}
          nota={`${inteiro(n.comPreco)} de ${inteiro(total)}`}
          barra={n.comPreco / total}
        />
        <Kpi
          rotulo="Fornecedores"
          valor={inteiro(dados.fornecedores.length)}
          nota={`${nac} nacionais · ${dados.fornecedores.length - nac} internacionais`}
        />
        <Kpi
          rotulo="Valor em estoque"
          valor={n.comQtd ? reaisCurto(n.valor) : '—'}
          nota={
            n.comQtd
              ? `${n.valor >= 1e5 ? `${reais(n.valor)} · ` : ''}${inteiro(n.comQtd)} códigos com quantidade`
              : 'Preencha a quantidade para ver'
          }
        />
      </div>

      <div className="dash">
        <section className="panel a-and">
          <div className="p-h">
            <h2 className="h2">Andamento dos preços</h2>
            <span className="p-s">por tipo de material</span>
          </div>
          <div className="prog">
            {n.tipos.map(({ t, total: tt, com }) => (
              <button
                key={t}
                className="prog-r"
                onClick={() =>
                  irPara('materiais', { tipo: t, situacao: 'sem' })
                }
                {...dica(
                  <>
                    <b>{NOME_TIPO[t]}</b>
                    <br />
                    {inteiro(com)} com preço · {inteiro(tt - com)} sem preço
                  </>,
                )}
              >
                <span className="prog-t">
                  <b>{t}</b> {NOME_TIPO[t]}
                </span>
                <span className="bar" aria-hidden>
                  <i
                    className="b-ok"
                    style={{ width: `${tt ? (com / tt) * 100 : 0}%` }}
                  />
                </span>
                <span className="prog-n">
                  {inteiro(com)}/{inteiro(tt)}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel a-mapa">
          <div className="p-h">
            <h2 className="h2">Mapa das ruas</h2>
            <span className="p-s">% dos códigos com preço</span>
          </div>
          <Mapa ruas={ruas} ctx={ctx} irPara={irPara} dica={dica} />
        </section>

        <section className="panel a-cot">
          <div className="p-h">
            <h2 className="h2">Cotação do dia</h2>
            <span className="p-s">Banco Central, venda</span>
          </div>
          <div className="cots">
            {(['USD', 'CNY'] as const).map((m) => (
              <Cotacao key={m} moeda={m} ctx={ctx} />
            ))}
          </div>
          <p className="nota">
            Preços em Dólar e Yuan viram Real pela cotação mais recente.
          </p>
        </section>

        <section className="panel a-forn">
          <div className="p-h">
            <h2 className="h2">Materiais por fornecedor</h2>
            <span className="p-s">
              {n.usados ? `${n.usados} com materiais` : 'nenhum ainda'}
            </span>
          </div>
          {n.fornecedores.length ? (
            <>
              <ul className="legenda" aria-hidden>
                <li>
                  <i className="sw sw-1" /> Nacional
                </li>
                <li>
                  <i className="sw sw-2" /> Internacional
                </li>
              </ul>
              <ol className="barras">
                {n.fornecedores.slice(0, 8).map(({ f, qtd }) => (
                  <li key={f!.id}>
                    <button
                      onClick={() =>
                        irPara('materiais', { fornecedor: String(f!.id) })
                      }
                      {...dica(
                        <>
                          <b>{f!.nome}</b>
                          <br />
                          {f!.origem === 'nacional'
                            ? 'Nacional'
                            : 'Internacional'}{' '}
                          · {inteiro(qtd)} materiais
                        </>,
                      )}
                    >
                      <span className="bx-n">{f!.nome}</span>
                      <span className="bx-b">
                        <i
                          className={f!.origem === 'nacional' ? 'c1' : 'c2'}
                          style={{
                            width: `${(qtd / n.fornecedores[0].qtd) * 100}%`,
                          }}
                        />
                      </span>
                      <span className="bx-v">{inteiro(qtd)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="msg">
              Quando um material ganhar fornecedor, ele aparece aqui.
            </p>
          )}
        </section>

        <section className="panel a-ori">
          <div className="p-h">
            <h2 className="h2">Origem e moeda</h2>
            <span className="p-s">dos {inteiro(n.comPreco)} com preço</span>
          </div>
          <Divisao
            titulo="Fornecedor"
            partes={[
              { nome: 'Nacional', v: n.origem.nacional, c: 'c1' },
              { nome: 'Internacional', v: n.origem.internacional, c: 'c2' },
              { nome: 'Sem fornecedor', v: n.origem.sem, c: 'c0' },
            ]}
            dica={dica}
          />
          <Divisao
            titulo="Moeda"
            partes={ORDEM_MOEDAS.map((k, i) => ({
              nome: MOEDAS[k].nome,
              v: n.moedas[k],
              c: `c${i + 1}`,
              ir: () => irPara('materiais', { moeda: k }),
            }))}
            dica={dica}
          />
        </section>

        <section className="panel a-caros">
          <div className="p-h">
            <h2 className="h2">Mais caros</h2>
            <span className="p-s">preço unitário em R$</span>
          </div>
          {n.caros.length ? (
            <ol className="barras caros">
              {n.caros.map(({ m, r }) => (
                <li key={m.codigo}>
                  <button
                    onClick={() => ctx.abrir(m.codigo)}
                    {...dica(
                      <>
                        <b>{m.codigo}</b>
                        <br />
                        {dinheiro(m.preco!, m.moeda!)}
                        {m.moeda !== 'BRL' && ` ≈ ${reais(r)}`}
                      </>,
                    )}
                  >
                    <span className="bx-n mono">{m.codigo}</span>
                    <span className="bx-b">
                      <i
                        className="c1"
                        style={{ width: `${(r / n.caros[0].r) * 100}%` }}
                      />
                    </span>
                    <span className="bx-v">{reais(r)}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="msg">Ainda não há preços cadastrados.</p>
          )}
        </section>

        <section className="panel a-mud">
          <div className="p-h">
            <h2 className="h2">Últimas mudanças</h2>
            <span className="p-s">ao vivo</span>
          </div>
          <Mudancas
            ctx={ctx}
            lista={dados.mudancas.slice(0, 10)}
            desfazer={desfazer}
          />
        </section>
      </div>

      {sessao && <Sincronizar ctx={ctx} recarregar={recarregar} />}
      {dicaEl}
    </div>
  );
}

const NOME_TIPO = {
  MP: 'Matéria-prima',
  PI: 'Produto intermediário',
  PA: 'Produto acabado',
};

function Kpi({
  rotulo,
  valor,
  nota,
  barra,
}: {
  rotulo: string;
  valor: string;
  nota: string;
  barra?: number;
}) {
  return (
    <div className="kpi">
      <span className="kpi-r">{rotulo}</span>
      <b className="kpi-v">{valor}</b>
      {barra != null && (
        <span className="bar fina" aria-hidden>
          <i className="b-ok" style={{ width: `${barra * 100}%` }} />
        </span>
      )}
      <span className="kpi-n">{nota}</span>
    </div>
  );
}

type Dica = ReturnType<typeof useDica>[0];

function Mapa({
  ruas,
  irPara,
  dica,
  ctx,
}: {
  ruas: RuaResumo[];
  irPara: Props['irPara'];
  dica: Dica;
  ctx: Contexto;
}) {
  // Por andar: quantos códigos de cada rua/andar já têm preço.
  const andar = useMemo(() => {
    const r = new Map<string, { t: number; c: number }>();
    for (const m of ctx.dados.materiais)
      for (const k of new Set(m.locais.map((l) => l.slice(0, 5)))) {
        const x = r.get(k) ?? { t: 0, c: 0 };
        x.t++;
        if (m.preco != null) x.c++;
        r.set(k, x);
      }
    return r;
  }, [ctx.dados.materiais]);
  const cel = (k: string, rua: string) => {
    const x = andar.get(k);
    if (!x) return <span className="hm-c hm-0" aria-label="sem códigos" />;
    const p = x.c / x.t;
    return (
      <button
        className={`hm-c ${p > 0.55 ? 'hm-esc' : ''}`}
        style={{ '--p': `${Math.round(8 + p * 92)}%` } as React.CSSProperties}
        onClick={() =>
          irPara('materiais', { rua, andar: k.slice(3) as 'A1' | 'A2' })
        }
        {...dica(
          <>
            <b>
              Rua {rua.slice(1)} · {k.slice(3)}
            </b>
            <br />
            {inteiro(x.c)} de {inteiro(x.t)} com preço
          </>,
        )}
      >
        {porcento(x.c, x.t)}
      </button>
    );
  };
  return (
    <div
      className="hm"
      role="table"
      aria-label="Porcentagem com preço por rua e andar"
    >
      <div className="hm-r hm-cab" role="row">
        <span role="columnheader">Rua</span>
        <span role="columnheader">Andar 1</span>
        <span role="columnheader">Andar 2</span>
        <span role="columnheader">Códigos</span>
      </div>
      {ruas.map((r) => (
        <div className="hm-r" role="row" key={r.rua}>
          <span className="hm-n mono" role="rowheader">
            {r.rua}
          </span>
          <span role="cell">{cel(`${r.rua}A1`, r.rua)}</span>
          <span role="cell">{cel(`${r.rua}A2`, r.rua)}</span>
          <span className="hm-t" role="cell">
            {r.total ? inteiro(r.total) : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

function Divisao({
  titulo,
  partes,
  dica,
}: {
  titulo: string;
  partes: { nome: string; v: number; c: string; ir?: () => void }[];
  dica: Dica;
}) {
  const total = partes.reduce((s, p) => s + p.v, 0);
  return (
    <div className="dv">
      <span className="dv-t">{titulo}</span>
      <div className="dv-b" aria-hidden>
        {total ? (
          partes
            .filter((p) => p.v)
            .map((p) => (
              <i
                key={p.nome}
                className={p.c}
                style={{ flexGrow: p.v }}
                {...dica(
                  <>
                    <b>{p.nome}</b>
                    <br />
                    {inteiro(p.v)} · {porcento(p.v, total)}
                  </>,
                )}
              />
            ))
        ) : (
          <i className="c0" style={{ flexGrow: 1 }} />
        )}
      </div>
      <ul className="dv-l">
        {partes.map((p) => (
          <li key={p.nome}>
            <button onClick={p.ir} disabled={!p.ir}>
              <i className={`sw ${p.c.replace('c', 'sw-')}`} />
              {p.nome}
              <b>{inteiro(p.v)}</b>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Cotacao({ moeda, ctx }: { moeda: 'USD' | 'CNY'; ctx: Contexto }) {
  const pts = ctx.dados.cotacoes
    .filter((c) => c.moeda === moeda)
    .map((c) => ({ d: c.data, v: Number(c.valor) }));
  const [i, setI] = useState<number | null>(null);
  const ult = pts.at(-1);
  if (!ult)
    return (
      <div className="cot">
        <span className="cot-m">{MOEDAS[moeda].nome}</span>
        <b className="cot-v">—</b>
        <span className="cot-d">Aguardando o Banco Central</span>
      </div>
    );
  const W = 240,
    H = 64,
    min = Math.min(...pts.map((p) => p.v)),
    max = Math.max(...pts.map((p) => p.v)),
    pad = (max - min) * 0.12 || ult.v * 0.01;
  const x = (k: number) =>
      pts.length > 1 ? (k / (pts.length - 1)) * W : W / 2,
    y = (v: number) => H - ((v - (min - pad)) / (max - min + 2 * pad)) * H;
  const linha = pts
    .map((p, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(p.v).toFixed(1)}`)
    .join('');
  const ref = pts[Math.max(0, pts.length - 22)],
    variacao = ((ult.v - ref.v) / ref.v) * 100;
  const foco = i != null ? pts[i] : null;
  const fmt = (v: number) =>
    `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
  return (
    <div className="cot">
      <span className="cot-m">
        {MOEDAS[moeda].nome} <small>{MOEDAS[moeda].simbolo} 1</small>
      </span>
      <b className="cot-v">{fmt(foco?.v ?? ult.v)}</b>
      <span className="cot-d">
        {foco
          ? dataCurta(foco.d)
          : `${dataCurta(ult.d)} · ${variacao >= 0 ? '+' : ''}${variacao.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% no mês`}
      </span>
      <svg
        className="spark"
        viewBox={`0 -4 ${W} ${H + 8}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${MOEDAS[moeda].nome} nos últimos ${pts.length} dias úteis`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setI(Math.round(((e.clientX - r.left) / r.width) * (pts.length - 1)));
        }}
        onPointerLeave={() => setI(null)}
      >
        <path d={linha} className="spark-l" vectorEffect="non-scaling-stroke" />
        {foco && i != null && (
          <>
            <line
              x1={x(i)}
              x2={x(i)}
              y1={-4}
              y2={H + 4}
              className="spark-x"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={x(i)} cy={y(foco.v)} r={3.5} className="spark-p" />
          </>
        )}
      </svg>
    </div>
  );
}

function Mudancas({
  ctx,
  lista,
  desfazer,
}: {
  ctx: Contexto;
  lista: Mudanca[];
  desfazer: (id: number) => void;
}) {
  if (!lista.length) return <p className="msg">Nenhuma mudança ainda.</p>;
  return (
    <ul className="feed">
      {lista.map((h) => {
        const d = diferencas(h.antes, h.depois, ctx.porId);
        return (
          <li key={h.id} className={h.desfeito_em ? 'riscado' : ''}>
            <div className="feed-t">
              <b>{h.por}</b>{' '}
              {h.acao === 'cadastro'
                ? 'cadastrou'
                : h.acao === 'desfazer'
                  ? 'desfez uma mudança em'
                  : 'mudou'}{' '}
              <button className="lk mono" onClick={() => ctx.abrir(h.codigo)}>
                {h.codigo}
              </button>
              <span className="feed-q"> · {haQuanto(h.em)}</span>
            </div>
            {h.acao !== 'cadastro' && d.length > 0 && (
              <div className="feed-d">
                {d.slice(0, 2).map((x) => (
                  <span key={x.campo}>
                    {x.campo}: {x.de} → <b>{x.para}</b>
                  </span>
                ))}
              </div>
            )}
            {h.desfeito_em ? (
              <span className="feed-q">Desfeita por {h.desfeito_por}</span>
            ) : (
              ctx.sessao &&
              h.acao === 'edicao' && (
                <button className="btn-link" onClick={() => desfazer(h.id)}>
                  <RotateCcw aria-hidden /> Desfazer
                </button>
              )
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Vazio({ ctx, recarregar }: { ctx: Contexto; recarregar: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  return (
    <div className="panel vazio">
      <p className="h2">Ainda não há códigos no painel</p>
      <p className="msg">
        Os 1.393 códigos das ruas do Relatório entram com um toque, com
        descrição, peso e localização. Preço, moeda e fornecedor ficam para
        vocês preencherem.
      </p>
      <button
        className="btn"
        disabled={ocupado}
        onClick={async () => {
          setOcupado(true);
          try {
            const n = await ctx.escrever(importarRuas);
            if (n != null) {
              ctx.avisar(`${inteiro(n)} códigos carregados.`, 'ok');
              recarregar();
            }
          } catch (e) {
            ctx.avisar((e as Error).message, 'erro');
          }
          setOcupado(false);
        }}
      >
        {ocupado ? (
          <LoaderCircle className="gira" aria-hidden />
        ) : (
          <DownloadCloud aria-hidden />
        )}
        Carregar os códigos das ruas
      </button>
    </div>
  );
}

function Sincronizar({
  ctx,
  recarregar,
}: {
  ctx: Contexto;
  recarregar: () => void;
}) {
  const [perguntar, setPerguntar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  return (
    <p className="sinc">
      <button className="btn-link" onClick={() => setPerguntar(true)}>
        Atualizar localizações das ruas
      </button>
      {perguntar && (
        <Confirmar
          titulo="Atualizar localizações?"
          linhas={[
            { campo: 'Localizações', de: 'atuais', para: 'ruas do Relatório' },
            {
              campo: 'Preço, moeda e fornecedor',
              de: 'atuais',
              para: 'não mudam',
            },
          ]}
          ocupado={ocupado}
          cancelar={() => setPerguntar(false)}
          confirmar={async () => {
            setOcupado(true);
            try {
              const n = await ctx.escrever(importarRuas);
              if (n != null) {
                ctx.avisar(
                  `Localizações de ${inteiro(n)} códigos atualizadas.`,
                  'ok',
                );
                recarregar();
              }
            } catch (e) {
              ctx.avisar((e as Error).message, 'erro');
            }
            setOcupado(false);
            setPerguntar(false);
          }}
        />
      )}
    </p>
  );
}
