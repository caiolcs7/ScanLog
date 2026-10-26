/// <reference lib="webworker" />
/**
 * O palco 3D fora da página: montar a cena, compilar e desenhar cada quadro
 * acontece aqui, e a rolagem e os toques do painel não esperam pela GPU.
 */
import { DURACAO, Luminaria } from './luz';

export type Pedido =
  | {
      tipo: 'iniciar';
      canvas: OffscreenCanvas;
      placa: ImageBitmap;
      w: number;
      h: number;
      pr: number;
      leve: boolean;
      parado: boolean;
    }
  | { tipo: 'tamanho'; w: number; h: number }
  | { tipo: 'tocar' }
  | { tipo: 'pausar' };
export type Resposta =
  { tipo: 'pronto' } | { tipo: 'falhou' } | { tipo: 'fim'; foto: Blob | null };

const eu = self as unknown as DedicatedWorkerGlobalScope;
const responder = (r: Resposta) => eu.postMessage(r);
let cena: Luminaria | null = null;

eu.onmessage = async ({ data: p }: MessageEvent<Pedido>) => {
  if (p.tipo === 'iniciar') {
    let c: Luminaria;
    try {
      const placa = new OffscreenCanvas(p.placa.width, p.placa.height);
      placa.getContext('2d')!.drawImage(p.placa, 0, 0);
      p.placa.close();
      c = new Luminaria(p.canvas, { pr: p.pr, leve: p.leve, placa });
    } catch {
      // sem WebGL no worker: a página tenta desenhar ela mesma
      return responder({ tipo: 'falhou' });
    }
    cena = c;
    c.redimensionar(p.w, p.h);
    await c.preparar();
    c.fim = () => void terminar(c);
    if (p.parado) {
      c.quadro(DURACAO);
      responder({ tipo: 'pronto' });
      return void terminar(c);
    }
    c.quadro(0);
    responder({ tipo: 'pronto' });
  } else if (p.tipo === 'tamanho') cena?.redimensionar(p.w, p.h);
  else if (p.tipo === 'tocar') cena?.tocar(cena.t);
  else cena?.pausar();
};

async function terminar(c: Luminaria) {
  cena = null;
  const foto = await c.foto().catch(() => null);
  responder({ tipo: 'fim', foto });
}
