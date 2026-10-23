import { useDeferredValue, useMemo, useState } from 'react';
import { FileSpreadsheet, LoaderCircle, Plus, Search, X } from 'lucide-react';
import type { Material, Moeda, Tipo } from './api';
import type { Contexto } from './App';
import { downloadBlob } from '../services/download';
import {
  dinheiro,
  emReais,
  inteiro,
  local,
  MOEDAS,
  ORDEM_MOEDAS,
  reais,
  ruaDe,
  semAcento,
} from './format';
import { NovoCodigo } from './Ficha';
import type { RuaResumo } from './scene';

export type Filtro = {
  busca: string;
  situacao: '' | 'com' | 'sem';
  tipo: '' | Tipo;
  rua: string;
  fornecedor: string; // id, 'sem' ou ''
  moeda: '' | Moeda;
  ordem: 'codigo' | 'preco' | 'recente';
};
export const filtroVazio: Filtro = {
  busca: '',
  situacao: '',
  tipo: '',
  rua: '',
  fornecedor: '',
  moeda: '',
  ordem: 'codigo',
};
const PAGINA = 60;

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
  const [mostrar, setMostrar] = useState(PAGINA);
  const [novo, setNovo] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const busca = useDeferredValue(filtro.busca);
  const lista = useMemo(() => {
    const q = semAcento(busca.trim());
    const r = dados.materiais.filter(
      (m) =>
        (!q ||
          m.codigo.includes(q) ||
          semAcento(m.descricao ?? '').includes(q)) &&
        (!filtro.situacao ||
          (filtro.situacao === 'com') === (m.preco != null)) &&
        (!filtro.tipo || m.tipo === filtro.tipo) &&
        (!filtro.rua || m.locais.some((l) => ruaDe(l) === filtro.rua)) &&
        (!filtro.fornecedor ||
          (filtro.fornecedor === 'sem'
            ? m.fornecedor_id == null
            : String(m.fornecedor_id) === filtro.fornecedor)) &&
        (!filtro.moeda || m.moeda === filtro.moeda),
    );
    if (filtro.ordem === 'preco')
      r.sort(
        (a, b) =>
          (emReais(b, cambio) ?? -1) - (emReais(a, cambio) ?? -1) ||
          a.codigo.localeCompare(b.codigo),
      );
    else if (filtro.ordem === 'recente')
      r.sort((a, b) =>
        (b.atualizado_em ?? b.criado_em).localeCompare(
          a.atualizado_em ?? a.criado_em,
        ),
      );
    return r;
  }, [dados.materiais, busca, filtro, cambio]);
  const ativos = (Object.keys(filtroVazio) as (keyof Filtro)[]).filter(
    (k) => k !== 'ordem' && filtro[k] !== filtroVazio[k],
  ).length;
  const muda = <K extends keyof Filtro>(k: K, v: Filtro[K]) => {
    setMostrar(PAGINA);
    setFiltro((f) => ({ ...f, [k]: v }));
  };
  const resumoFiltro = [
    filtro.rua && `Rua ${filtro.rua.slice(1)}`,
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

  return (
    <div className="view">
      <div className="ferr">
        <label className="busca">
          <Search aria-hidden />
          <input
            type="search"
            placeholder="Buscar código ou descrição"
            value={filtro.busca}
            onChange={(e) => muda('busca', e.target.value)}
            aria-label="Buscar código ou descrição"
          />
        </label>
        <div className="filtros">
          <select
            value={filtro.rua}
            onChange={(e) => muda('rua', e.target.value)}
            aria-label="Rua"
          >
            <option value="">Todas as ruas</option>
            {ruas
              .filter((r) => r.total)
              .map((r) => (
                <option key={r.rua} value={r.rua}>
                  Rua {r.rua.slice(1)} ({r.total})
                </option>
              ))}
          </select>
          <select
            value={filtro.situacao}
            onChange={(e) =>
              muda('situacao', e.target.value as Filtro['situacao'])
            }
            aria-label="Preço"
          >
            <option value="">Com e sem preço</option>
            <option value="sem">Sem preço</option>
            <option value="com">Com preço</option>
          </select>
          <select
            value={filtro.tipo}
            onChange={(e) => muda('tipo', e.target.value as Filtro['tipo'])}
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
            onChange={(e) => muda('moeda', e.target.value as Filtro['moeda'])}
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
            onChange={(e) => muda('ordem', e.target.value as Filtro['ordem'])}
            aria-label="Ordem"
          >
            <option value="codigo">Ordem: código</option>
            <option value="preco">Ordem: mais caro</option>
            <option value="recente">Ordem: mais recente</option>
          </select>
        </div>
        <div className="ferr-l">
          <p className="conta" aria-live="polite">
            <b>{inteiro(lista.length)}</b>{' '}
            {lista.length === 1 ? 'material' : 'materiais'}
            {ativos > 0 && (
              <button
                className="btn-link"
                onClick={() => {
                  setMostrar(PAGINA);
                  setFiltro({ ...filtroVazio, ordem: filtro.ordem });
                }}
              >
                <X aria-hidden /> Limpar filtros
              </button>
            )}
          </p>
          <div className="acts">
            <button
              className="btn-ghost-s"
              disabled={baixando || !lista.length}
              onClick={async () => {
                setBaixando(true);
                try {
                  const { planilha } = await import('./planilha');
                  const blob = await planilha(
                    lista,
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
      </div>

      {lista.length ? (
        <ul className="mats">
          {lista.slice(0, mostrar).map((m) => (
            <Linha key={m.codigo} m={m} ctx={ctx} />
          ))}
        </ul>
      ) : (
        <div className="ru-msg">
          <p className="h2">Nenhum material com esses filtros</p>
          <p className="msg">Mude a busca ou limpe os filtros.</p>
        </div>
      )}
      {lista.length > mostrar && (
        <button
          className="btn-ghost mais"
          onClick={() => setMostrar((n) => n + PAGINA)}
        >
          Mostrar mais {Math.min(PAGINA, lista.length - mostrar)} de{' '}
          {inteiro(lista.length - mostrar)}
        </button>
      )}
      {novo && <NovoCodigo ctx={ctx} fechar={() => setNovo(false)} />}
    </div>
  );
}

function Linha({ m, ctx }: { m: Material; ctx: Contexto }) {
  const r = emReais(m, ctx.cambio),
    f = m.fornecedor_id != null ? ctx.porId.get(m.fornecedor_id) : undefined;
  return (
    <li>
      <button className="mat" onClick={() => ctx.abrir(m.codigo)}>
        <span className="mat-a">
          <span className="mat-c mono">{m.codigo}</span>
          <span className="mat-d">{m.descricao ?? 'Sem descrição'}</span>
          <span className="mat-l">
            {m.tipo && <span className="tag">{m.tipo}</span>}
            {m.locais.slice(0, 2).map((l) => (
              <span key={l} className="tag tag-l mono">
                {local(l)}
              </span>
            ))}
            {m.locais.length > 2 && (
              <span className="tag">+{m.locais.length - 2}</span>
            )}
          </span>
        </span>
        <span className="mat-b">
          {m.preco != null && m.moeda ? (
            <>
              <b className="mat-p mono">{dinheiro(m.preco, m.moeda)}</b>
              {m.moeda !== 'BRL' && r != null && Number.isFinite(r) && (
                <span className="mat-r mono">≈ {reais(r)}</span>
              )}
              {f && <span className="mat-f">{f.nome}</span>}
            </>
          ) : (
            <span className="pill pill-sem">Sem preço</span>
          )}
        </span>
      </button>
    </li>
  );
}
