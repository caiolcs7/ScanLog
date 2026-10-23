import { useEffect, useRef, useState } from 'react';
import type { Luminaria } from './luz';

/**
 * Palco da Maccomevap: a luminária acende e ilumina o corredor do estoque.
 * three.js só baixa depois que o painel já apareceu. Toca uma vez quando o
 * palco está na tela, pausa se sair dela e para no último quadro; com
 * "reduzir movimento" mostra direto o quadro final. Sem WebGL o palco some
 * (o painel funciona igual).
 */
export function Luz({ pronto }: { pronto: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'sem3d'>(
    'carregando',
  );
  useEffect(() => {
    if (!pronto) return;
    let vivo = true,
      cena: Luminaria | null = null,
      olho: IntersectionObserver | null = null;
    const ocioso =
      window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 60));
    ocioso(() =>
      Promise.all([
        import('./luz'),
        // a placa da luminária é desenhada com a mesma fonte das ruas
        document.fonts
          .load('700 40px "Barlow Semi Condensed"')
          .catch(() => undefined),
      ]).then(
        ([{ Luminaria, temWebGL, DURACAO }]) => {
          if (!vivo || !host.current) return;
          if (!temWebGL()) return setEstado('sem3d');
          try {
            cena = new Luminaria(host.current);
          } catch {
            return setEstado('sem3d');
          }
          setEstado('pronto');
          if (matchMedia('(prefers-reduced-motion: reduce)').matches)
            return cena.quadro(DURACAO);
          cena.quadro(0);
          olho = new IntersectionObserver(
            ([e]) => {
              if (!cena || cena.t >= DURACAO) return olho?.disconnect();
              if (e.isIntersecting) cena.tocar(cena.t);
              else cena.pausar();
            },
            { threshold: 0.35 },
          );
          olho.observe(host.current);
        },
        () => vivo && setEstado('sem3d'),
      ),
    );
    return () => {
      vivo = false;
      olho?.disconnect();
      cena?.destruir();
    };
  }, [pronto]);

  if (estado === 'sem3d') return null;
  return (
    <div className={`stage ${estado === 'pronto' ? 'on' : ''}`}>
      <div className="luz" ref={host} />
    </div>
  );
}
