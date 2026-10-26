import { useEffect, useRef, useState } from 'react';
import { placa } from './luz-placa';
import type { Pedido, Resposta } from './painel-luz.worker';

/** O que a página pede ao palco, esteja ele num worker ou na própria página. */
type Palco = {
  tamanho: (w: number, h: number) => void;
  tocar: () => void;
  pausar: () => void;
  fechar: () => void;
};
type Avisos = {
  pronto: () => void;
  /** Fim do filme, com o último quadro como imagem (null se não deu). */
  fim: (foto: Blob | null) => void;
};
type Config = {
  w: number;
  h: number;
  pr: number;
  leve: boolean;
  parado: boolean;
};

const temWorker = () =>
  typeof Worker === 'function' &&
  typeof OffscreenCanvas === 'function' &&
  'transferControlToOffscreen' in HTMLCanvasElement.prototype;

/** O 3D num worker; null se o worker não conseguir WebGL. */
function noWorker(
  cv: HTMLCanvasElement,
  placa: HTMLCanvasElement,
  cfg: Config,
  av: Avisos,
): Promise<Palco | null> {
  return new Promise((pronto) => {
    const w = new Worker(new URL('./painel-luz.worker.ts', import.meta.url), {
      type: 'module',
    });
    const pedir = (p: Pedido, t: Transferable[] = []) => w.postMessage(p, t);
    const palco: Palco = {
      tamanho: (larg, alt) => pedir({ tipo: 'tamanho', w: larg, h: alt }),
      tocar: () => pedir({ tipo: 'tocar' }),
      pausar: () => pedir({ tipo: 'pausar' }),
      fechar: () => w.terminate(),
    };
    w.onmessage = ({ data: r }: MessageEvent<Resposta>) => {
      if (r.tipo === 'falhou') {
        w.terminate();
        pronto(null);
      } else if (r.tipo === 'pronto') {
        pronto(palco);
        av.pronto();
      } else av.fim(r.foto);
    };
    w.onerror = () => {
      w.terminate();
      pronto(null);
    };
    createImageBitmap(placa).then(
      (bmp) => {
        const off = cv.transferControlToOffscreen();
        pedir({ tipo: 'iniciar', canvas: off, placa: bmp, ...cfg }, [off, bmp]);
      },
      () => {
        w.terminate();
        pronto(null);
      },
    );
  });
}

/** O 3D na própria página (navegador sem OffscreenCanvas com WebGL). */
async function naPagina(
  cv: HTMLCanvasElement,
  placa: HTMLCanvasElement,
  cfg: Config,
  av: Avisos,
): Promise<Palco | null> {
  const { Luminaria, temWebGL, DURACAO } = await import('./luz');
  if (!temWebGL()) return null;
  let c: InstanceType<typeof Luminaria>;
  try {
    c = new Luminaria(cv, { pr: cfg.pr, leve: cfg.leve, placa });
  } catch {
    return null;
  }
  c.redimensionar(cfg.w, cfg.h);
  await c.preparar();
  c.fim = () =>
    void c.foto().then(
      (f) => av.fim(f),
      () => av.fim(null),
    );
  av.pronto();
  if (cfg.parado) {
    c.quadro(DURACAO);
    c.fim();
  } else c.quadro(0);
  return {
    tamanho: (w, h) => c.redimensionar(w, h),
    tocar: () => c.tocar(c.t),
    pausar: () => c.pausar(),
    fechar: () => c.destruir(),
  };
}

function novoCanvas(host: HTMLElement) {
  const cv = document.createElement('canvas');
  cv.className = 'luz-cv';
  cv.setAttribute('aria-hidden', 'true');
  host.appendChild(cv);
  return cv;
}

/**
 * Palco da Maccomevap: a luminária acende e ilumina o corredor do estoque.
 * three.js só baixa depois que o painel já apareceu, e roda num worker
 * quando dá (a página não trava). Toca uma vez quando o palco está na tela,
 * pausa se sair dela e no fim o último quadro vira imagem: o 3D é desligado
 * e a GPU e a memória do celular ficam livres. Com "reduzir movimento"
 * mostra direto o quadro final. Sem WebGL o palco some (o painel funciona igual).
 */
export function Luz({ pronto }: { pronto: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'sem3d'>(
    'carregando',
  );
  useEffect(() => {
    if (!pronto) return;
    let vivo = true,
      palco: Palco | null = null,
      cv: HTMLCanvasElement | null = null,
      olho: IntersectionObserver | null = null,
      ro: ResizeObserver | null = null,
      foto: HTMLImageElement | null = null,
      acabou = false,
      trocou = false;
    const fechar = () => {
      olho?.disconnect();
      ro?.disconnect();
      palco?.fechar();
      palco = null;
    };
    const avisos: Avisos = {
      pronto: () => vivo && setEstado('pronto'),
      fim: async (blob) => {
        acabou = true;
        olho?.disconnect();
        if (!blob || !vivo || !host.current) return;
        // troca o canvas pela imagem do último quadro e desliga o 3D
        const img = new Image();
        img.src = URL.createObjectURL(blob);
        img.className = 'luz-cv';
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        try {
          await img.decode();
        } catch {
          URL.revokeObjectURL(img.src);
          return;
        }
        if (!vivo || !host.current) return URL.revokeObjectURL(img.src);
        host.current.appendChild(img);
        foto = img;
        cv?.remove();
        cv = null;
        trocou = true;
        fechar();
      },
    };
    const ocioso =
      window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 60));
    ocioso(async () => {
      // a placa da luminária é desenhada com a mesma fonte das ruas
      await document.fonts
        .load('700 40px "Barlow Semi Condensed"')
        .catch(() => undefined);
      if (!vivo || !host.current) return;
      const el = host.current,
        leve = matchMedia('(pointer: coarse)').matches,
        cfg: Config = {
          w: el.clientWidth,
          h: el.clientHeight,
          // celular: menos pixels (a GPU é bem mais fraca)
          pr: Math.min(window.devicePixelRatio || 1, leve ? 1.25 : 1.75),
          leve,
          parado: matchMedia('(prefers-reduced-motion: reduce)').matches,
        },
        desenho = placa();
      cv = novoCanvas(el);
      let p = temWorker()
        ? await noWorker(cv, desenho, cfg, avisos).catch(() => null)
        : null;
      if (!p && vivo) {
        // o canvas passado ao worker não volta: começa outro
        cv.remove();
        cv = novoCanvas(el);
        p = await naPagina(cv, desenho, cfg, avisos).catch(() => null);
      }
      if (!vivo) return p?.fechar();
      if (!p) {
        cv?.remove();
        return setEstado('sem3d');
      }
      palco = p;
      // com "reduzir movimento" o fim pode chegar antes daqui
      if (trocou) return fechar();
      if (acabou) return;
      ro = new ResizeObserver(() => {
        if (el.clientWidth && el.clientHeight)
          palco?.tamanho(el.clientWidth, el.clientHeight);
      });
      ro.observe(el);
      olho = new IntersectionObserver(
        ([e]) => {
          if (acabou) return olho?.disconnect();
          if (e.isIntersecting) palco?.tocar();
          else palco?.pausar();
        },
        { threshold: 0.35 },
      );
      olho.observe(el);
    });
    return () => {
      vivo = false;
      fechar();
      cv?.remove();
      if (foto) {
        URL.revokeObjectURL(foto.src);
        foto.remove();
      }
    };
  }, [pronto]);

  if (estado === 'sem3d') return null;
  return (
    <div className={`stage ${estado === 'pronto' ? 'on' : ''}`}>
      <div className="luz" ref={host} />
    </div>
  );
}
