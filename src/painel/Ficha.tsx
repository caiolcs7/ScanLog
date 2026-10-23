import { useEffect, useState } from 'react';
import { Pencil, Plus, RotateCcw } from 'lucide-react';
import {
  desfazer,
  mudancasDe,
  salvar,
  type Foto,
  type Material,
  type Moeda,
  type Mudanca,
  type Tipo,
} from './api';
import type { Contexto } from './App';
import {
  dinheiro,
  emReais,
  haQuanto,
  lerNumero,
  local,
  MOEDAS,
  ORDEM_MOEDAS,
  paraCampo,
  peso,
  quantidade,
  reais,
} from './format';
import { diferencas } from './mudanca';
import { FornecedorForm } from './Fornecedores';
import { Confirmar, Janela, Seg } from './ui';

type Campos = {
  preco: string;
  moeda: Moeda;
  fornecedor: string;
  quantidade: string;
  descricao: string;
  tipo: '' | Tipo;
  peso: string;
};
const deMaterial = (m?: Material): Campos => ({
  preco: paraCampo(m?.preco ?? null),
  moeda: m?.moeda ?? 'BRL',
  fornecedor: m?.fornecedor_id != null ? String(m.fornecedor_id) : '',
  quantidade: paraCampo(m?.quantidade ?? null),
  descricao: m?.descricao ?? '',
  tipo: m?.tipo ?? '',
  peso: paraCampo(m?.peso_g ?? null),
});
const foto = (m: Material): Foto => ({
  descricao: m.descricao,
  tipo: m.tipo,
  peso_g: m.peso_g,
  fornecedor_id: m.fornecedor_id,
  preco: m.preco,
  moeda: m.moeda,
  quantidade: m.quantidade,
});
/** Valida os campos e devolve a foto nova, ou o erro para mostrar. */
function lerCampos(c: Campos): Foto | string {
  const preco = lerNumero(c.preco),
    qtd = lerNumero(c.quantidade),
    g = lerNumero(c.peso);
  if (Number.isNaN(preco) || (preco ?? 0) > 1e10)
    return 'Preço inválido. Use só números, como 12,50.';
  if (Number.isNaN(qtd) || (qtd ?? 0) > 1e10)
    return 'Quantidade inválida. Use só números.';
  if (Number.isNaN(g) || g === 0 || (g ?? 0) > 1e8)
    return 'Peso inválido. Digite em gramas, como 235.';
  return {
    preco,
    moeda: preco == null ? null : c.moeda,
    fornecedor_id: c.fornecedor ? Number(c.fornecedor) : null,
    quantidade: qtd,
    descricao: c.descricao.trim() || null,
    tipo: c.tipo || null,
    peso_g: g,
  };
}

export function Ficha({
  ctx,
  m,
  fechar,
}: {
  ctx: Contexto;
  m: Material;
  fechar: () => void;
}) {
  const [editar, setEditar] = useState(false);
  const [hist, setHist] = useState<Mudanca[] | null>(null);
  const reler = () => mudancasDe(m.codigo).then(setHist, () => setHist([]));
  useEffect(() => {
    mudancasDe(m.codigo).then(setHist, () => setHist([]));
  }, [m.codigo, m.atualizado_em]);
  const r = emReais(m, ctx.cambio),
    f = m.fornecedor_id != null ? ctx.porId.get(m.fornecedor_id) : undefined;

  return (
    <Janela fechar={fechar} classe="gs" rotulo={`Material ${m.codigo}`}>
      <div className="gs-h">
        <div className="gs-hd">
          <p className="gs-code mono">{m.codigo}</p>
          <p className="gs-sub">
            {m.preco != null ? (
              <span className="pill" data-s="ok">
                Com preço
              </span>
            ) : (
              <span className="pill pill-sem">Sem preço</span>
            )}
            {m.tipo && <span className="pill">{m.tipo}</span>}
            {m.peso_g != null && <span>{peso(m.peso_g)}</span>}
          </p>
        </div>
        <button className="gs-x" onClick={fechar} aria-label="Fechar">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <p className="gs-desc">{m.descricao ?? 'Sem descrição'}</p>
      {m.locais.length > 0 && (
        <div className="gs-loc">
          {m.locais.map((l) => (
            <span key={l} className="tag tag-l mono">
              {local(l)}
            </span>
          ))}
        </div>
      )}

      {editar ? (
        <Edicao
          ctx={ctx}
          m={m}
          pronto={() => {
            setEditar(false);
            reler();
          }}
        />
      ) : (
        <>
          <dl className="ficha">
            <div>
              <dt>Preço unitário</dt>
              <dd className="mono">
                {m.preco != null && m.moeda ? dinheiro(m.preco, m.moeda) : '—'}
                {m.moeda &&
                  m.moeda !== 'BRL' &&
                  r != null &&
                  Number.isFinite(r) && <small>≈ {reais(r)}</small>}
              </dd>
            </div>
            <div>
              <dt>Fornecedor</dt>
              <dd>
                {f ? (
                  <>
                    {f.nome}{' '}
                    <span className="tag">
                      {f.origem === 'nacional' ? 'Nacional' : 'Internacional'}
                    </span>
                  </>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt>Quantidade</dt>
              <dd className="mono">
                {m.quantidade != null ? quantidade(m.quantidade) : '—'}
                {m.quantidade != null && r != null && Number.isFinite(r) && (
                  <small>Total {reais(r * m.quantidade)}</small>
                )}
              </dd>
            </div>
            <div>
              <dt>Atualizado</dt>
              <dd>
                {m.atualizado_em
                  ? `${haQuanto(m.atualizado_em)} por ${m.atualizado_por}`
                  : m.origem === 'ruas'
                    ? 'Veio das ruas do Relatório'
                    : `Cadastrado por ${m.criado_por}`}
              </dd>
            </div>
          </dl>
          <div className="gs-acts">
            <button className="btn-ghost" onClick={fechar}>
              Fechar
            </button>
            <button
              className="btn"
              onClick={async () => {
                if (await ctx.pedirLogin()) setEditar(true);
              }}
            >
              <Pencil aria-hidden /> Editar
            </button>
          </div>
        </>
      )}

      <section className="gs-hist">
        <h3 className="h3">Histórico</h3>
        {hist == null ? (
          <p className="msg">Carregando…</p>
        ) : hist.length ? (
          <ul className="feed">
            {hist.map((h) => {
              const d = diferencas(h.antes, h.depois, ctx.porId);
              return (
                <li key={h.id} className={h.desfeito_em ? 'riscado' : ''}>
                  <div className="feed-t">
                    <b>{h.por}</b>{' '}
                    {h.acao === 'cadastro'
                      ? 'cadastrou'
                      : h.acao === 'desfazer'
                        ? 'desfez uma mudança'
                        : 'mudou'}
                    <span className="feed-q"> · {haQuanto(h.em)}</span>
                  </div>
                  {h.acao !== 'cadastro' && (
                    <div className="feed-d">
                      {d.map((x) => (
                        <span key={x.campo}>
                          {x.campo}: {x.de} → <b>{x.para}</b>
                        </span>
                      ))}
                    </div>
                  )}
                  {h.desfeito_em ? (
                    <span className="feed-q">
                      Desfeita por {h.desfeito_por}
                    </span>
                  ) : (
                    ctx.sessao &&
                    h.acao === 'edicao' && (
                      <button
                        className="btn-link"
                        onClick={async () => {
                          try {
                            const novo = await ctx.escrever((s) =>
                              desfazer(s, h.id),
                            );
                            if (novo) {
                              ctx.aplicar(novo);
                              ctx.avisar('Mudança desfeita.', 'ok');
                              reler();
                            }
                          } catch (e) {
                            ctx.avisar((e as Error).message, 'erro');
                          }
                        }}
                      >
                        <RotateCcw aria-hidden /> Desfazer
                      </button>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="msg">
            {m.origem === 'ruas'
              ? 'Ainda sem mudanças. Veio das ruas do Relatório.'
              : 'Ainda sem mudanças.'}
          </p>
        )}
      </section>
    </Janela>
  );
}

/** Campos de preço, moeda, fornecedor e quantidade (e o resto do cadastro). */
function Formulario({
  ctx,
  c,
  setC,
}: {
  ctx: Contexto;
  c: Campos;
  setC: (c: Campos) => void;
}) {
  const [novoF, setNovoF] = useState(false);
  const preco = lerNumero(c.preco),
    r =
      preco != null && !Number.isNaN(preco)
        ? preco * ctx.cambio[c.moeda].valor
        : null;
  const muda = <K extends keyof Campos>(k: K, v: Campos[K]) =>
    setC({ ...c, [k]: v });
  return (
    <>
      <div className="fm-2">
        <label>
          Preço unitário
          <input
            inputMode="decimal"
            value={c.preco}
            onChange={(e) => muda('preco', e.target.value)}
            placeholder="0,00"
            className="mono"
          />
          <span className="hint">
            {c.moeda !== 'BRL' && r != null && Number.isFinite(r)
              ? `≈ ${reais(r)} hoje`
              : ' '}
          </span>
        </label>
        <div className="fm-g">
          <span className="fm-l">Moeda</span>
          <Seg
            rotulo="Moeda"
            valor={c.moeda}
            mudar={(v) => muda('moeda', v)}
            opcoes={ORDEM_MOEDAS.map((k) => ({
              id: k,
              nome: (
                <>
                  <b className="mono">{MOEDAS[k].simbolo}</b> {MOEDAS[k].nome}
                </>
              ),
            }))}
          />
        </div>
      </div>
      <div className="fm-g">
        <span className="fm-l">Fornecedor</span>
        <div className="fm-row">
          <select
            value={c.fornecedor}
            onChange={(e) => muda('fornecedor', e.target.value)}
            aria-label="Fornecedor"
          >
            <option value="">Sem fornecedor</option>
            {ctx.dados.fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome} ·{' '}
                {f.origem === 'nacional' ? 'Nacional' : 'Internacional'}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-ghost-s"
            onClick={() => setNovoF(true)}
          >
            <Plus aria-hidden /> Novo
          </button>
        </div>
      </div>
      <div className="fm-2">
        <label>
          <span>
            Quantidade <span className="opc">· opcional</span>
          </span>
          <input
            inputMode="decimal"
            value={c.quantidade}
            onChange={(e) => muda('quantidade', e.target.value)}
            className="mono"
          />
        </label>
        <label>
          <span>
            Peso unitário (g) <span className="opc">· opcional</span>
          </span>
          <input
            inputMode="decimal"
            value={c.peso}
            onChange={(e) => muda('peso', e.target.value)}
            className="mono"
          />
        </label>
      </div>
      <label>
        Tipo
        <select
          value={c.tipo}
          onChange={(e) => muda('tipo', e.target.value as Campos['tipo'])}
        >
          <option value="">Sem tipo</option>
          <option value="MP">MP · Matéria-prima</option>
          <option value="PI">PI · Produto intermediário</option>
          <option value="PA">PA · Produto acabado</option>
        </select>
      </label>
      <label>
        Descrição
        <textarea
          value={c.descricao}
          onChange={(e) => muda('descricao', e.target.value)}
          maxLength={300}
          rows={2}
        />
      </label>
      {novoF && (
        <FornecedorForm
          ctx={ctx}
          fechar={(f) => {
            setNovoF(false);
            if (f) setC({ ...c, fornecedor: String(f.id) });
          }}
        />
      )}
    </>
  );
}

function Edicao({
  ctx,
  m,
  pronto,
}: {
  ctx: Contexto;
  m: Material;
  pronto: () => void;
}) {
  const [c, setC] = useState(() => deMaterial(m));
  const [erro, setErro] = useState('');
  const [conf, setConf] = useState<Foto | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const antes = foto(m);
  return (
    <form
      className="fm"
      onSubmit={(e) => {
        e.preventDefault();
        const novo = lerCampos(c);
        if (typeof novo === 'string') return setErro(novo);
        if (!diferencas(antes, novo, ctx.porId).length) return pronto();
        setErro('');
        setConf(novo);
      }}
    >
      <Formulario ctx={ctx} c={c} setC={setC} />
      {erro && (
        <p className="fb-err" role="alert">
          {erro}
        </p>
      )}
      <div className="gs-acts">
        <button type="button" className="btn-ghost" onClick={pronto}>
          Cancelar
        </button>
        <button className="btn">Salvar</button>
      </div>
      {conf && (
        <Confirmar
          titulo={`Salvar ${m.codigo}?`}
          linhas={diferencas(antes, conf, ctx.porId)}
          ocupado={ocupado}
          cancelar={() => setConf(null)}
          confirmar={async () => {
            setOcupado(true);
            try {
              const salvo = await ctx.escrever((s) =>
                salvar(s, m.codigo, conf),
              );
              if (salvo) {
                ctx.aplicar(salvo);
                ctx.avisar('Salvo.', 'ok');
                pronto();
              }
            } catch (e) {
              setErro((e as Error).message);
            }
            setOcupado(false);
            setConf(null);
          }}
        />
      )}
    </form>
  );
}

export function NovoCodigo({
  ctx,
  fechar,
}: {
  ctx: Contexto;
  fechar: () => void;
}) {
  const [codigo, setCodigo] = useState('');
  const [c, setC] = useState(() => deMaterial());
  const [erro, setErro] = useState('');
  const [conf, setConf] = useState<Foto | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const cod = codigo.trim().toUpperCase();
  return (
    <Janela titulo="Novo código" fechar={fechar} classe="gs">
      <form
        className="fm"
        onSubmit={(e) => {
          e.preventDefault();
          if (!/^[A-Z0-9][A-Z0-9./_-]{0,39}$/.test(cod))
            return setErro(
              'Código inválido: use letras, números e . / _ - (até 40).',
            );
          if (ctx.dados.materiais.some((m) => m.codigo === cod))
            return setErro(`O código ${cod} já está no painel.`);
          const novo = lerCampos(c);
          if (typeof novo === 'string') return setErro(novo);
          setErro('');
          setConf(novo);
        }}
      >
        <label>
          Código
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            className="mono"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={40}
            autoFocus
          />
        </label>
        <Formulario ctx={ctx} c={c} setC={setC} />
        {erro && (
          <p className="fb-err" role="alert">
            {erro}
          </p>
        )}
        <div className="gs-acts">
          <button type="button" className="btn-ghost" onClick={fechar}>
            Cancelar
          </button>
          <button className="btn">Cadastrar</button>
        </div>
        {conf && (
          <Confirmar
            titulo={`Cadastrar ${cod}?`}
            linhas={[
              { campo: 'Código', de: 'novo', para: cod },
              ...diferencas(null, conf, ctx.porId),
            ]}
            ocupado={ocupado}
            cancelar={() => setConf(null)}
            confirmar={async () => {
              setOcupado(true);
              try {
                const salvo = await ctx.escrever((s) =>
                  salvar(s, cod, conf, true),
                );
                if (salvo) {
                  ctx.aplicar(salvo);
                  ctx.avisar(`${cod} cadastrado.`, 'ok');
                  fechar();
                  ctx.abrir(cod);
                  return;
                }
              } catch (e) {
                setErro((e as Error).message);
              }
              setOcupado(false);
              setConf(null);
            }}
          />
        )}
      </form>
    </Janela>
  );
}
