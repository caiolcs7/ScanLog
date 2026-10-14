import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { navigate } from '../components/ui';

export type NavArea = 'surveys' | 'identify' | 'settings' | 'none';

const tabs = [
  { key: 'surveys', path: '/', label: 'Levantamentos', icon: <SurveysIcon /> },
  {
    key: 'identify',
    path: '/identificacao',
    label: 'Identificação',
    icon: <IdentifyIcon />,
  },
  {
    key: 'settings',
    path: '/settings',
    label: 'Configurações',
    icon: <SettingsIcon />,
  },
] as const;

const fineHover =
  typeof matchMedia === 'function' &&
  matchMedia('(hover: hover) and (pointer: fine)').matches &&
  !matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Dock tátil das três áreas. Pílula branca desliza e "estica" ao mudar de
 * aba; esfera laranja marca a ativa. O reflexo segue o mouse só
 * em computador e só enquanto o ponteiro se move: nenhum laço de animação
 * fica rodando, para não gastar bateria.
 */
export function MainNav({
  area,
  vibrate,
}: {
  area: NavArea;
  vibrate: boolean;
}) {
  const index = tabs.findIndex((t) => t.key === area);
  const dock = useRef<HTMLElement>(null);
  const frame = useRef(0);
  const [move, setMove] = useState(0);
  const [ripple, setRipple] = useState<{ key: string; n: number } | null>(null);
  const last = useRef(index);
  useEffect(() => {
    if (index >= 0 && last.current >= 0 && index !== last.current)
      setMove((m) => m + 1);
    last.current = index;
  }, [index]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const track = (x: number, y: number) => {
    if (!fineHover || frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const el = dock.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const nx = (x - rect.left) / rect.width,
        ny = (y - rect.top) / rect.height;
      el.style.setProperty('--glare-x', `${(nx * 100).toFixed(1)}%`);
      el.style.setProperty('--glare-y', `${(ny * 100).toFixed(1)}%`);
    });
  };
  const rest = () => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
  };

  return (
    <div className="nav-scene">
      <nav
        ref={dock}
        className="main-nav"
        aria-label="Navegação principal"
        data-active={area}
        data-move={move % 2 ? 'b' : 'a'}
        data-moved={move > 0 ? '' : undefined}
        style={{ '--nav-index': Math.max(0, index) } as CSSProperties}
        onPointerMove={(e) =>
          e.pointerType === 'mouse' && track(e.clientX, e.clientY)
        }
        onPointerLeave={rest}
      >
        <span className="nav-glare" aria-hidden="true" />
        <span className="nav-indicator" aria-hidden="true">
          <span className="nav-pill" />
        </span>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className="nav-tab"
            data-tab={tab.key}
            aria-label={tab.label}
            aria-current={area === tab.key ? 'page' : undefined}
            onPointerDown={() => {
              if (vibrate) navigator.vibrate?.(10);
            }}
            onClick={() => {
              setRipple((r) => ({ key: tab.key, n: (r?.n ?? 0) + 1 }));
              navigate(tab.path);
            }}
          >
            <span className="nav-orb">
              {tab.icon}
              {ripple?.key === tab.key && (
                <span
                  key={ripple.n}
                  className="nav-ripple"
                  onAnimationEnd={() => setRipple(null)}
                />
              )}
            </span>
            <span className="nav-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function SurveysIcon() {
  return (
    <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden="true">
      <g className="ico-clipboard">
        <rect x="5" y="4" width="14" height="17" rx="2.5" />
        <path d="M9 4.5v-1A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5v1" />
        <path className="ico-tick ico-tick-1" d="m8 10.6 1 1 1.8-2" />
        <path className="ico-line ico-line-1" d="M13 10.5h3" />
        <path className="ico-tick ico-tick-2" d="m8 15.1 1 1 1.8-2" />
        <path className="ico-line ico-line-2" d="M13 15h3" />
      </g>
    </svg>
  );
}
function IdentifyIcon() {
  return (
    <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden="true">
      <g className="ico-frame">
        <path d="M4 8V6a2 2 0 0 1 2-2h2" />
        <path d="M16 4h2a2 2 0 0 1 2 2v2" />
        <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
        <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
      </g>
      <g className="ico-loupe">
        <circle cx="11.5" cy="11.5" r="3" />
        <path d="m13.8 13.8 2.2 2.2" />
      </g>
      <path className="ico-beam" d="M6.5 12h11" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden="true">
      <g className="ico-gear">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </g>
    </svg>
  );
}
