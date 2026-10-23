import { useEffect, useRef, useState } from 'react';
import type { Galpao, RuaResumo } from './scene';

/**
 * Palco do galpão 3D. three.js só baixa depois da primeira pintura, e sem
 * WebGL o palco some (o painel funciona igual).
 */
export function Galpao3D({
  ruas,
  rua,
  escolher,
  pronto,
}: {
  ruas: RuaResumo[];
  rua: string | null;
  escolher: (rua: string | null) => void;
  /** Os dados chegaram: monta a cena depois que a tela já apareceu. */
  pronto: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    cena = useRef<Galpao | null>(null),
    escolha = useRef(escolher);
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'sem3d'>(
    'carregando',
  );
  useEffect(() => {
    escolha.current = escolher;
  });
  useEffect(() => {
    if (!pronto) return;
    let vivo = true;
    const ocioso =
      window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 60));
    ocioso(() =>
      import('./scene').then(
        ({ Galpao, temWebGL }) => {
          if (!vivo || !host.current) return;
          if (!temWebGL()) return setEstado('sem3d');
          try {
            cena.current = new Galpao(host.current, ruas, (r) =>
              escolha.current(r),
            );
            setEstado('pronto');
          } catch {
            setEstado('sem3d');
          }
        },
        () => vivo && setEstado('sem3d'),
      ),
    );
    return () => {
      vivo = false;
      cena.current?.destruir();
      cena.current = null;
    };
    // a cena é criada uma vez; os números entram pelo efeito abaixo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto]);
  useEffect(() => cena.current?.atualizar(ruas), [ruas, estado]);
  useEffect(() => cena.current?.selecionar(rua), [rua, estado]);

  if (estado === 'sem3d') return null;
  return (
    <div className={`stage ${estado === 'pronto' ? 'on' : ''}`}>
      <div className="g3d" ref={host} />
      <p className="g3d-leg" aria-hidden>
        <span>
          <i className="sw sw-ok" /> com preço
        </span>
        <span>
          <i className="sw sw-kraft" /> sem preço
        </span>
        <span className="g3d-dica">
          {rua
            ? `Rua ${rua.slice(1)} · toque fora para voltar`
            : 'Toque numa rua'}
        </span>
      </p>
    </div>
  );
}
