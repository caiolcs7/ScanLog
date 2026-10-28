import { memo, useMemo, useState } from 'react';
import { LoaderCircle, Pencil, Plus } from 'lucide-react';
import {
  salvarFornecedor,
  type Fornecedor,
  type Moeda,
  type Origem,
} from './api';
import type { Contexto } from './App';
import type { Filtro } from './Lista';
import { inteiro, moedaUsada, ofertas, semAcento } from './format';
import { Moeda3D } from './Moeda3D';
import { Confirmar, Janela, Seg } from './ui';

export const Fornecedores = memo(function Fornecedores({
  ctx,
  irPara,
}: {
  ctx: Contexto;
  irPara: (a: 'materiais', f?: Partial<Filtro>) => void;
}) {
  const { dados } = ctx;
  const [editar, setEditar] = useState<Fornecedor | 'novo' | null>(null);
  const conta = useMemo(() => {
    const c = new Map<
      number,
      { total: number; com: number; moedas: Map<Moeda, number> }
    >();
    for (const m of dados.materiais)
      for (const o of ofertas(m))
        if (o.fornecedor_id != null) {
          const x = c.get(o.fornecedor_id) ?? {
            total: 0,
            com: 0,
            moedas: new Map(),
          };
          x.total++;
          if (o.preco != null) x.com++;
          const mu = moedaUsada(o, m, ctx.porId);
          if (mu) x.moedas.set(mu, (x.moedas.get(mu) ?? 0) + 1);
          c.set(o.fornecedor_id, x);
        }
    return c;
  }, [dados.materiais, ctx.porId]);
  // A moeda que o fornecedor mais usa; nacional sem nada = Real.
  const moedaDe = (f: Fornecedor): Moeda | null => {
    const ms = [...(conta.get(f.id)?.moedas ?? [])].sort((a, b) => b[1] - a[1]);
    return ms[0]?.[0] ?? (f.origem === 'nacional' ? 'BRL' : null);
  };
  const semForn = dados.materiais.filter((m) => m.fornecedor_id == null).length;
  return (
    <div className="view">
      <div className="ferr-l">
        <p className="conta">
          <span>
            <b>{inteiro(dados.fornecedores.length)}</b> fornecedores
          </span>
          <button
            className="lk"
            onClick={() => irPara('materiais', { fornecedor: 'sem' })}
          >
            {inteiro(semForn)} materiais sem fornecedor
          </button>
        </p>
        <button className="btn-s" onClick={() => setEditar('novo')}>
          <Plus aria-hidden /> Novo fornecedor
        </button>
      </div>
      {dados.fornecedores.length ? (
        <ul className="forns">
          {dados.fornecedores.map((f) => {
            const c = conta.get(f.id);
            return (
              <li key={f.id} className="forn">
                <button
                  className="forn-a"
                  onClick={() =>
                    irPara('materiais', { fornecedor: String(f.id) })
                  }
                >
                  <span className="forn-n">{f.nome}</span>
                  <span className="forn-s">
                    <Moeda3D moeda={moedaDe(f)} tamanho={16} />
                    <span className={`tag tag-${f.origem}`}>
                      {f.origem === 'nacional' ? 'Nacional' : 'Internacional'}
                    </span>
                    {c
                      ? `${inteiro(c.total)} materiais`
                      : 'Nenhum material ainda'}
                  </span>
                </button>
                <button
                  className="gs-x"
                  aria-label={`Corrigir ${f.nome}`}
                  onClick={() => setEditar(f)}
                >
                  <Pencil aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="ru-msg">
          <p className="h2">Nenhum fornecedor ainda</p>
          <p className="msg">
            Cadastre aqui ou direto na ficha de um material, ao escolher o
            fornecedor.
          </p>
        </div>
      )}
      {editar && (
        <FornecedorForm
          ctx={ctx}
          f={editar === 'novo' ? undefined : editar}
          fechar={() => setEditar(null)}
        />
      )}
    </div>
  );
});

/** Cadastro ou correção de fornecedor: nome e nacional/internacional. */
export function FornecedorForm({
  ctx,
  f,
  fechar,
}: {
  ctx: Contexto;
  f?: Fornecedor;
  fechar: (f?: Fornecedor) => void;
}) {
  const [nome, setNome] = useState(f?.nome ?? '');
  const [origem, setOrigem] = useState<Origem | null>(f?.origem ?? null);
  const [erro, setErro] = useState('');
  const [conf, setConf] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const n = nome.trim().replace(/\s+/g, ' ');
  const rotulo = (o: Origem | null) =>
    o === 'nacional'
      ? 'Nacional'
      : o === 'internacional'
        ? 'Internacional'
        : '—';
  return (
    <Janela
      titulo={f ? 'Corrigir fornecedor' : 'Novo fornecedor'}
      fechar={() => fechar()}
      classe="cf2"
    >
      <form
        className="fm"
        onSubmit={(e) => {
          e.preventDefault();
          if (!n) return setErro('Digite o nome do fornecedor.');
          if (!origem) return setErro('Escolha nacional ou internacional.');
          const igual = ctx.dados.fornecedores.find(
            (x) => x.id !== f?.id && semAcento(x.nome) === semAcento(n),
          );
          if (igual) return setErro(`Já existe o fornecedor ${igual.nome}.`);
          if (f && f.nome === n && f.origem === origem) return fechar();
          setErro('');
          setConf(true);
        }}
      >
        <label>
          Nome
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={120}
            autoFocus
          />
        </label>
        <div className="fm-g">
          <span className="fm-l">Origem</span>
          <Seg
            rotulo="Origem"
            valor={origem}
            mudar={setOrigem}
            opcoes={[
              { id: 'nacional', nome: 'Nacional' },
              { id: 'internacional', nome: 'Internacional' },
            ]}
          />
        </div>
        {erro && (
          <p className="fb-err" role="alert">
            {erro}
          </p>
        )}
        <div className="cf-a">
          <button type="button" className="btn-ghost" onClick={() => fechar()}>
            Cancelar
          </button>
          <button className="btn" disabled={ocupado}>
            {ocupado && <LoaderCircle className="gira" aria-hidden />}
            Salvar
          </button>
        </div>
      </form>
      {conf && (
        <Confirmar
          titulo={f ? `Corrigir ${f.nome}?` : 'Cadastrar fornecedor?'}
          linhas={[
            { campo: 'Nome', de: f?.nome ?? '—', para: n },
            {
              campo: 'Origem',
              de: rotulo(f?.origem ?? null),
              para: rotulo(origem),
            },
          ].filter((l) => l.de !== l.para)}
          ocupado={ocupado}
          cancelar={() => setConf(false)}
          confirmar={async () => {
            setOcupado(true);
            try {
              const novo = await ctx.escrever((s) =>
                salvarFornecedor(s, n, origem!, f?.id),
              );
              if (novo) {
                ctx.aplicarFornecedor(novo);
                ctx.avisar(
                  f ? 'Fornecedor corrigido.' : `${novo.nome} cadastrado.`,
                  'ok',
                );
                fechar(novo);
                return;
              }
            } catch (e) {
              setErro((e as Error).message);
            }
            setOcupado(false);
            setConf(false);
          }}
        />
      )}
    </Janela>
  );
}
