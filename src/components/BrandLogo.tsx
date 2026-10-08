import { useEffect, useId, useRef, type CSSProperties } from 'react';

const blocks = [
  { x: 3, y: 3, w: 58, h: 28, dx: 0, dy: -1 },
  { x: 67, y: 3, w: 30, h: 58, dx: 1, dy: 0 },
  { x: 39, y: 69, w: 58, h: 28, dx: 0, dy: 1 },
  { x: 3, y: 39, w: 30, h: 58, dx: -1, dy: 0 },
];
const letters = [
  'M49.67 20.48 A22 22 0 1 0 29 50 A22 22 0 1 1 8.33 79.52',
  'M126.55 45.6 A29 29 0 1 0 126.55 84.4',
  'M212 65 A29 29 0 1 0 154 65 A29 29 0 1 0 212 65 M212 36 V94',
  'M239 94 V36 M239 61 A25 25 0 0 1 289 61 V94',
  'M318 6 V94 H356',
  'M403 34 L434 65 L403 96 L372 65 Z',
  'M514 65 A29 29 0 1 0 456 65 A29 29 0 1 0 514 65 M514 36 V104 A29 26 0 0 1 459 116',
];
const mark = 'translate(14.64 14.64) scale(0.71) rotate(45 50 50)';

/**
 * Logo animada: montagem das peças e traçado do nome na abertura, giro do
 * cata-vento no hover, brilho de varredura periódico e reação a cada leitura
 * (trava no sucesso, tremor no erro). Respeita prefers-reduced-motion.
 */
export function BrandLogo() {
  const ref = useRef<HTMLSpanElement>(null),
    id = useId().replace(/[^\w-]/g, ''),
    clip = `logo-clip-${id}`,
    shine = `logo-shine-${id}`;
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let timer = 0;
    const react = (event: Event) => {
      const kind = (event as CustomEvent<string>).detail;
      const name =
        kind === 'error' ? 'is-error' : kind === 'product' ? 'is-lock' : '';
      if (!name) return;
      root.classList.remove('is-error', 'is-lock');
      void root.offsetWidth; // reinicia a animação em leituras seguidas
      root.classList.add(name);
      clearTimeout(timer);
      timer = window.setTimeout(() => root.classList.remove(name), 700);
    };
    window.addEventListener('scanlog:feedback', react);
    return () => {
      window.removeEventListener('scanlog:feedback', react);
      clearTimeout(timer);
    };
  }, []);
  return (
    <span className="brand-logo" ref={ref} aria-hidden="true">
      <span className="brand-mark">
        <svg viewBox="0 0 100 100" className="logo-mark">
          <defs>
            <clipPath id={clip}>
              <g transform={mark}>
                {blocks.map((b) => (
                  <rect
                    key={b.x + b.y}
                    x={b.x}
                    y={b.y}
                    width={b.w}
                    height={b.h}
                    rx="7"
                  />
                ))}
                <rect x="43" y="43" width="14" height="14" rx="3" />
              </g>
            </clipPath>
            <linearGradient id={shine} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#ffd7a8" stopOpacity="0.95" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g className="logo-spin">
            <g transform={mark}>
              {blocks.map((b, i) => (
                <rect
                  key={b.x + b.y}
                  className="logo-block"
                  style={
                    {
                      '--dx': `${b.dx * 14}px`,
                      '--dy': `${b.dy * 14}px`,
                      '--i': i,
                    } as CSSProperties
                  }
                  x={b.x}
                  y={b.y}
                  width={b.w}
                  height={b.h}
                  rx="7"
                />
              ))}
              <rect
                className="logo-core"
                x="43"
                y="43"
                width="14"
                height="14"
                rx="3"
              />
            </g>
          </g>
          <g clipPath={`url(#${clip})`}>
            <rect
              className="logo-shine"
              x="-60"
              y="-20"
              width="40"
              height="140"
              fill={`url(#${shine})`}
            />
          </g>
        </svg>
      </span>
      <svg viewBox="0 0 521 142" className="brand-wordmark logo-word">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="13"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {letters.map((d, i) => (
            <path
              key={d}
              d={d}
              pathLength={1}
              className="logo-letter"
              style={{ '--i': i } as CSSProperties}
            />
          ))}
        </g>
        <rect
          className="logo-target"
          x="397.5"
          y="59.5"
          width="11"
          height="11"
          rx="2"
        />
      </svg>
    </span>
  );
}
