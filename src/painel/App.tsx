import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Boxes, Factory, LogIn, LogOut } from 'lucide-react';
import {
  aoVivo,
  carregar,
  desfazer,
  esquecerSessao,
  lerSessao,
  mudancasRecentes,
  sair,
  SessaoExpirada,
  type Dados,
  type Fornecedor,
  type Material,
  type Sessao,
} from './api';
import { cambio, inteiro, porcento, ruaDe } from './format';
import { Luz } from './Luz';
import { Resumo } from './Resumo';
import { Lista, filtroVazio, type Filtro } from './Lista';
import { Ficha } from './Ficha';
import { Fornecedores } from './Fornecedores';
import { Entrar, Marca, Toast, type Aviso } from './ui';

type Aba = 'painel' | 'materiais' | 'fornecedores';
const ABAS: { id: Aba; nome: string; Icone: typeof BarChart3 }[] = [
  { id: 'painel', nome: 'Painel', Icone: BarChart3 },
  { id: 'materiais', nome: 'Materiais', Icone: Boxes },
  { id: 'fornecedores', nome: 'Fornecedores', Icone: Factory },
];

export type Contexto = {
  dados: Dados;
  sessao: Sessao | null;
  porId: Map<number, Fornecedor>;
  cambio: ReturnType<typeof cambio>;
  /** Roda uma escrita; se a sessão venceu, pede a senha e tenta de novo. */
  escrever: <T>(fazer: (s: Sessao) => Promise<T>) => Promise<T | undefined>;
  avisar: (texto: string, tom?: Aviso['tom'], acao?: Aviso['acao']) => void;
  abrir: (codigo: string) => void;
  aplicar: (m: Material) => void;
  aplicarFornecedor: (f: Fornecedor) => void;
  /** Garante a sessão (pede a senha se faltar); null se a pessoa desistir. */
  pedirLogin: () => Promise<Sessao | null>;
};

export function App() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [sessao, setSessao] = useState<Sessao | null>(lerSessao);
  const [aba, setAba] = useState<Aba>('painel');
  const [filtro, setFiltro] = useState<Filtro>(filtroVazio);
  const [aberto, setAberto] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [login, setLogin] = useState<{
    motivo?: string;
    depois: (s: Sessao | null) => void;
  } | null>(null);
  const topo = useRef<HTMLDivElement>(null);

  const avisar = useCallback<Contexto['avisar']>(
    (texto, tom = 'info', acao) =>
      setAviso({ texto, tom, acao, id: Date.now() }),
    [],
  );
  const recarregar = useCallback(() => {
    setFalha(null);
    carregar().then(setDados, (e: Error) => setFalha(e.message));
  }, []);
  useEffect(recarregar, [recarregar]);

  // Mudanças de outras pessoas chegam ao vivo; o histórico é relido em seguida.
  const historico = useRef(0);
  const aplicar = useCallback((m: Material) => {
    setDados((d) => {
      if (!d) return d;
      const i = d.materiais.findIndex((x) => x.codigo === m.codigo),
        materiais = [...d.materiais];
      if (i >= 0) materiais[i] = m;
      else materiais.push(m);
      return { ...d, materiais };
    });
    clearTimeout(historico.current);
    historico.current = window.setTimeout(
      () =>
        mudancasRecentes().then(
          (mudancas) => setDados((d) => d && { ...d, mudancas }),
          () => {},
        ),
      800,
    );
  }, []);
  const aplicarFornecedor = useCallback((f: Fornecedor) => {
    setDados((d) => {
      if (!d) return d;
      const fornecedores = d.fornecedores.filter((x) => x.id !== f.id);
      fornecedores.push(f);
      fornecedores.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      return { ...d, fornecedores };
    });
  }, []);
  useEffect(() => {
    if (!dados) return;
    let parar: (() => void) | undefined,
      vivo = true;
    aoVivo({ material: aplicar, fornecedor: aplicarFornecedor }).then(
      (p) => (vivo ? (parar = p) : p()),
      () => {},
    );
    return () => {
      vivo = false;
      parar?.();
    };
    // conecta uma vez, depois da primeira carga
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!dados, aplicar, aplicarFornecedor]);
  // Ao voltar para a aba do navegador, relê tudo (o celular pode ter dormido).
  useEffect(() => {
    let saiu = 0;
    const ver = () => {
      if (document.hidden) saiu = Date.now();
      else if (saiu && Date.now() - saiu > 60000)
        carregar().then(setDados, () => {});
    };
    document.addEventListener('visibilitychange', ver);
    return () => document.removeEventListener('visibilitychange', ver);
  }, []);

  // Pede a senha e devolve a sessão nova (null se a pessoa fechar).
  const pedirSenha = useCallback(
    (motivo?: string) =>
      new Promise<Sessao | null>((depois) => setLogin({ motivo, depois })),
    [],
  );
  const pedirLogin = useCallback(
    () => (sessao ? Promise.resolve(sessao) : pedirSenha()),
    [sessao, pedirSenha],
  );
  const escrever = useCallback(
    async function <T>(fazer: (s: Sessao) => Promise<T>) {
      let s = sessao ?? (await pedirSenha());
      if (!s) return undefined;
      try {
        return await fazer(s);
      } catch (e) {
        if (!(e instanceof SessaoExpirada)) throw e;
        esquecerSessao();
        setSessao(null);
        s = await pedirSenha(e.message);
        return s ? fazer(s) : undefined;
      }
    },
    [sessao, pedirSenha],
  );

  const porId = useMemo(
    () => new Map((dados?.fornecedores ?? []).map((f) => [f.id, f])),
    [dados?.fornecedores],
  );
  const cot = useMemo(() => cambio(dados?.cotacoes ?? []), [dados?.cotacoes]);
  const ruas = useMemo(() => {
    const r = new Map<string, { total: number; comPreco: number }>();
    for (let n = 1; n <= 17; n++)
      r.set(`R${String(n).padStart(2, '0')}`, { total: 0, comPreco: 0 });
    for (const m of dados?.materiais ?? [])
      for (const rua of new Set(m.locais.map(ruaDe))) {
        const x = r.get(rua) ?? { total: 0, comPreco: 0 };
        x.total++;
        if (m.preco != null) x.comPreco++;
        r.set(rua, x);
      }
    return [...r]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([rua, v]) => ({ rua, ...v }));
  }, [dados?.materiais]);

  const ctx: Contexto | null = dados && {
    dados,
    sessao,
    porId,
    cambio: cot,
    escrever,
    avisar,
    abrir: setAberto,
    aplicar,
    aplicarFornecedor,
    pedirLogin,
  };

  const irPara = (a: Aba, f?: Partial<Filtro>) => {
    if (f) setFiltro({ ...filtroVazio, ...f });
    setAba(a);
    topo.current
      ?.querySelector('.tabs')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const total = dados?.materiais.length ?? 0,
    comPreco = dados?.materiais.filter((m) => m.preco != null).length ?? 0;
  const material = aberto
    ? dados?.materiais.find((m) => m.codigo === aberto)
    : undefined;

  return (
    <div className="page">
      <header className="top" ref={topo}>
        <div className="top-bar">
          <a className="brand" href="../" aria-label="Abrir o ScanLog">
            <Marca />
            <span className="brand-word">ScanLog</span>
          </a>
          {sessao ? (
            <button
              className="who on"
              onClick={async () => {
                await sair(sessao);
                setSessao(null);
                avisar('Você saiu. O painel continua aberto para leitura.');
              }}
            >
              <i />
              <span>Editando como {sessao.nome}</span>
              <LogOut aria-hidden />
            </button>
          ) : (
            <button className="who" onClick={() => void pedirLogin()}>
              <LogIn aria-hidden />
              <span>Entrar para editar</span>
            </button>
          )}
        </div>
        <h1 className="ttl">
          <span className="ttl-a">Painel de</span>
          <span className="ttl-b">Materiais</span>
        </h1>
        <p className="meta">
          {dados
            ? `${inteiro(total)} códigos · ${porcento(comPreco, total)} com preço · ${inteiro(dados.fornecedores.length)} fornecedores`
            : falha
              ? 'Sem conexão com o servidor'
              : 'Carregando…'}
        </p>
        <Luz pronto={!!dados || !!falha} />
        <nav className="tabs" role="tablist" aria-label="Seções">
          {ABAS.map(({ id, nome, Icone }) => (
            <button
              key={id}
              role="tab"
              aria-selected={aba === id}
              onClick={() => setAba(id)}
            >
              <Icone aria-hidden />
              {nome}
            </button>
          ))}
        </nav>
      </header>

      {falha && (
        <div className="panel vazio" role="alert">
          <p className="h2">Não foi possível carregar o painel</p>
          <p className="msg">{falha}</p>
          <button className="btn" onClick={recarregar}>
            Tentar de novo
          </button>
        </div>
      )}
      {!dados && !falha && <Esqueleto />}
      {ctx && aba === 'painel' && (
        <Resumo
          ctx={ctx}
          ruas={ruas}
          irPara={irPara}
          desfazer={(id) =>
            escrever((s) => desfazer(s, id)).then(
              (m) => {
                if (m) {
                  aplicar(m);
                  avisar('Mudança desfeita.', 'ok');
                }
              },
              (e: Error) => avisar(e.message, 'erro'),
            )
          }
          recarregar={recarregar}
        />
      )}
      {ctx && aba === 'materiais' && (
        <Lista ctx={ctx} filtro={filtro} setFiltro={setFiltro} ruas={ruas} />
      )}
      {ctx && aba === 'fornecedores' && (
        <Fornecedores ctx={ctx} irPara={irPara} />
      )}

      {ctx && material && (
        <Ficha ctx={ctx} m={material} fechar={() => setAberto(null)} />
      )}
      {login && (
        <Entrar
          motivo={login.motivo}
          fechar={() => {
            setLogin(null);
            login.depois(null);
          }}
          entrou={(s) => {
            setSessao(s);
            setLogin(null);
            avisar(`Pronto, ${s.nome}. Agora você pode editar.`, 'ok');
            login.depois(s);
          }}
        />
      )}
      {aviso && <Toast aviso={aviso} sumir={() => setAviso(null)} />}
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="view" aria-hidden>
      <div className="kpis">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="kpi sk" />
        ))}
      </div>
      <div className="panel sk" style={{ height: 220 }} />
    </div>
  );
}
