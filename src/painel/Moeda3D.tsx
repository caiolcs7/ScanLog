import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { Moeda } from './api';
import { MOEDAS } from './format';
import { keyframes, ladoPara, tira, type CodMoeda } from './moeda3d';

let comEstilo = false;
function estilo() {
  if (comEstilo) return;
  comEstilo = true;
  const s = document.createElement('style');
  s.textContent = keyframes('m3d-gira');
  document.head.appendChild(s);
}

/**
 * Moedinha 3D da moeda usada (null = a definir). Fica parada; gira uma volta
 * quando aparece (com `entrada`), quando `girar` vira true e quando o dedo ou o
 * mouse passa no item em volta. Nada roda em laço.
 */
export function Moeda3D({
  moeda,
  tamanho = 20,
  entrada = false,
  girar = false,
  rotulo = false,
}: {
  moeda: Moeda | null;
  tamanho?: number;
  entrada?: boolean;
  girar?: boolean;
  /** Diz o nome da moeda para leitor de tela (quando não há texto ao lado). */
  rotulo?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const cod: CodMoeda = moeda ?? 'XXX';
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    estilo();
    tira(cod, ladoPara(tamanho)).then(
      (u) => vivo && setUrl(u),
      () => {},
    );
    return () => {
      vivo = false;
    };
  }, [cod, tamanho]);

  const gira = useCallback(() => {
    const el = ref.current;
    if (!el || !el.classList.contains('m3d-ok')) return;
    el.classList.remove('m3d-vai');
    void el.offsetWidth;
    el.classList.add('m3d-vai');
  }, []);
  // Entrada: uma volta na primeira vez que aparece na tela.
  useEffect(() => {
    const el = ref.current;
    if (!url || !entrada || !el) return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        io.disconnect();
        gira();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [url, entrada, gira]);
  useEffect(() => {
    if (girar) gira();
  }, [girar, gira]);
  useEffect(() => {
    const alvo = ref.current?.closest('button, a, li, label');
    if (!alvo) return;
    alvo.addEventListener('pointerenter', gira);
    return () => alvo.removeEventListener('pointerenter', gira);
  }, [gira]);

  return (
    <span
      ref={ref}
      className={`m3d m3d-${cod.toLowerCase()}${url ? ' m3d-ok' : ''}`}
      style={
        {
          '--m3d': `${tamanho}px`,
          backgroundImage: url ? `url(${url})` : undefined,
        } as CSSProperties
      }
      onAnimationEnd={(e) => e.currentTarget.classList.remove('m3d-vai')}
      {...(rotulo
        ? {
            role: 'img',
            'aria-label': moeda ? MOEDAS[moeda].nome : 'Moeda a definir',
          }
        : { 'aria-hidden': true })}
    />
  );
}
