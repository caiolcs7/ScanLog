import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, LoaderCircle, X } from 'lucide-react';
import { entrar, type Sessao } from './api';

export type Aviso = {
  id: number;
  texto: string;
  tom: 'ok' | 'erro' | 'info';
  acao?: { nome: string; fazer: () => void };
};

/** Marca do ScanLog (cata-vento de quatro peças). */
export function Marca() {
  return (
    <svg className="brand-mark" viewBox="0 0 100 100" aria-hidden>
      <g
        fill="currentColor"
        transform="translate(14.64 14.64) scale(0.71) rotate(45 50 50)"
      >
        <rect x="3" y="3" width="58" height="28" rx="7" />
        <rect x="67" y="3" width="30" height="58" rx="7" />
        <rect x="39" y="69" width="58" height="28" rx="7" />
        <rect x="3" y="39" width="30" height="58" rx="7" />
        <rect x="43" y="43" width="14" height="14" rx="3" />
      </g>
    </svg>
  );
}

export function Toast({ aviso, sumir }: { aviso: Aviso; sumir: () => void }) {
  useEffect(() => {
    const t = setTimeout(sumir, aviso.acao ? 9000 : 4500);
    return () => clearTimeout(t);
  }, [aviso, sumir]);
  const Icone =
    aviso.tom === 'erro'
      ? AlertCircle
      : aviso.tom === 'ok'
        ? CheckCircle2
        : Info;
  return (
    <div
      key={aviso.id}
      className={`toast t-${aviso.tom}`}
      role={aviso.tom === 'erro' ? 'alert' : 'status'}
    >
      <Icone aria-hidden />
      <span>{aviso.texto}</span>
      {aviso.acao && (
        <button
          onClick={() => {
            sumir();
            aviso.acao!.fazer();
          }}
        >
          {aviso.acao.nome}
        </button>
      )}
    </div>
  );
}

// Janelas abertas, a de cima por último: o Esc fecha só ela.
const pilha: (() => void)[] = [];
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && pilha.length) {
    e.preventDefault();
    pilha[pilha.length - 1]();
  }
});

/**
 * Janela: folha que sobe no celular, caixa central no PC. Esc e o fundo
 * fecham; o foco vai para dentro e volta para onde estava.
 */
export function Janela({
  titulo,
  fechar,
  children,
  classe = '',
  rotulo,
}: {
  titulo?: ReactNode;
  fechar: () => void;
  children: ReactNode;
  classe?: string;
  rotulo?: string;
}) {
  const caixa = useRef<HTMLDivElement>(null),
    id = useId(),
    sair = useRef(fechar);
  useEffect(() => {
    sair.current = fechar;
  });
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    const el = caixa.current;
    (
      el?.querySelector<HTMLElement>('[autofocus],input,select,textarea') ?? el
    )?.focus();
    const eu = () => sair.current();
    pilha.push(eu);
    document.body.classList.add('travado');
    return () => {
      pilha.splice(pilha.indexOf(eu), 1);
      if (!pilha.length) document.body.classList.remove('travado');
      antes?.focus?.();
    };
  }, []);
  // no body: uma janela dentro de outra (ou de uma aba animada) não fica presa nela
  return createPortal(
    <div
      className={`cf ${classe}`}
      onPointerDown={(e) => e.target === e.currentTarget && fechar()}
    >
      <div
        ref={caixa}
        className="cf-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titulo ? id : undefined}
        aria-label={titulo ? undefined : rotulo}
        tabIndex={-1}
      >
        {titulo && (
          <div className="cf-h">
            <h2 className="cf-t" id={id}>
              {titulo}
            </h2>
            <button className="gs-x" onClick={fechar} aria-label="Fechar">
              <X aria-hidden />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Confirmação antes de gravar: mostra o que muda, como no Relatório. */
export function Confirmar({
  titulo,
  linhas,
  confirmar,
  cancelar,
  ocupado,
}: {
  titulo: string;
  linhas: { campo: string; de: string; para: string }[];
  confirmar: () => void;
  cancelar: () => void;
  ocupado: boolean;
}) {
  return (
    <Janela titulo={titulo} fechar={cancelar} classe="cf2">
      <ul className="dif">
        {linhas.map((l) => (
          <li key={l.campo}>
            <span className="dif-c">{l.campo}</span>
            <span className="dif-v">
              <span className="pill">{l.de}</span>
              <span className="arr" aria-label="para">
                →
              </span>
              <span className="pill pill-novo">{l.para}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="cf-a">
        <button className="btn-ghost" onClick={cancelar} disabled={ocupado}>
          Cancelar
        </button>
        <button
          className="btn"
          onClick={confirmar}
          disabled={ocupado}
          autoFocus
        >
          {ocupado && <LoaderCircle className="gira" aria-hidden />}
          Confirmar
        </button>
      </div>
    </Janela>
  );
}

export function Seg<T extends string>({
  valor,
  opcoes,
  mudar,
  rotulo,
}: {
  valor: T | null;
  opcoes: { id: T; nome: ReactNode }[];
  mudar: (v: T) => void;
  rotulo: string;
}) {
  return (
    <div
      className="seg"
      role="radiogroup"
      aria-label={rotulo}
      style={{ gridTemplateColumns: `repeat(${opcoes.length},minmax(0,1fr))` }}
    >
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={valor === o.id}
          onClick={() => mudar(o.id)}
        >
          {o.nome}
        </button>
      ))}
    </div>
  );
}

const NOME = 'painel-nome';
export function Entrar({
  motivo,
  fechar,
  entrou,
}: {
  motivo?: string;
  fechar: () => void;
  entrou: (s: Sessao) => void;
}) {
  const [nome, setNome] = useState(() => {
    try {
      return localStorage.getItem(NOME) ?? '';
    } catch {
      return '';
    }
  });
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState(motivo ?? '');
  const [ocupado, setOcupado] = useState(false);
  return (
    <Janela titulo="Entrar para editar" fechar={fechar}>
      <form
        className="fm"
        onSubmit={async (e) => {
          e.preventDefault();
          if (nome.trim().length < 2) return setErro('Digite seu nome.');
          setOcupado(true);
          setErro('');
          try {
            const s = await entrar(senha, nome);
            try {
              localStorage.setItem(NOME, s.nome);
            } catch {
              // sem armazenamento: só não lembra o nome
            }
            entrou(s);
          } catch (er) {
            setErro((er as Error).message);
            setOcupado(false);
          }
        }}
      >
        <p className="cf-d">
          Seu nome aparece no histórico de cada mudança que você fizer.
        </p>
        <label>
          Seu nome
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={40}
            autoComplete="name"
            autoFocus={!nome}
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            autoFocus={!!nome}
          />
        </label>
        {erro && (
          <p className="fb-err" role="alert">
            {erro}
          </p>
        )}
        <div className="cf-a">
          <button type="button" className="btn-ghost" onClick={fechar}>
            Cancelar
          </button>
          <button className="btn" disabled={ocupado || !senha}>
            {ocupado && <LoaderCircle className="gira" aria-hidden />}
            Entrar
          </button>
        </div>
      </form>
    </Janela>
  );
}

type EstadoDica = { x: number; y: number; texto: ReactNode } | null;

/**
 * Dica que segue o dedo ou o mouse sobre uma marca do gráfico. Só a dica é
 * redesenhada ao mover (antes o painel inteiro era, a cada movimento).
 */
export function useDica() {
  const mostrar = useRef<(d: EstadoDica) => void>(() => {});
  const props = (texto: ReactNode) => ({
    onPointerMove: (e: React.PointerEvent) =>
      mostrar.current({ x: e.clientX, y: e.clientY, texto }),
    onPointerLeave: () => mostrar.current(null),
    onFocus: (e: React.FocusEvent<HTMLElement | SVGElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      mostrar.current({ x: r.left + r.width / 2, y: r.top, texto });
    },
    onBlur: () => mostrar.current(null),
  });
  return [props, <Dica key="dica" ligar={mostrar} />] as const;
}

function Dica({ ligar }: { ligar: React.RefObject<(d: EstadoDica) => void> }) {
  const [dica, setDica] = useState<EstadoDica>(null);
  useEffect(() => {
    // um desenho por quadro, mesmo com muitos eventos de movimento
    let quadro = 0,
      proxima: EstadoDica = null;
    ligar.current = (d) => {
      proxima = d;
      if (!quadro)
        quadro = requestAnimationFrame(() => {
          quadro = 0;
          setDica(proxima);
        });
    };
    return () => {
      cancelAnimationFrame(quadro);
      ligar.current = () => {};
    };
  }, [ligar]);
  if (!dica) return null;
  return (
    <div
      className="dica"
      role="tooltip"
      style={{
        left: Math.min(dica.x, window.innerWidth - 12),
        top: dica.y,
      }}
    >
      {dica.texto}
    </div>
  );
}
