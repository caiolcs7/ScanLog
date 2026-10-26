/**
 * Desenho da placa da luminária (fica na página, que tem a fonte das ruas;
 * o 3D recebe a placa pronta).
 */
const rnd = (seed: number) => {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
};

/** Placa de inox escovado com a marca gravada. */
export function placa() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const x = c.getContext('2d')!,
    r = rnd(19);
  x.fillStyle = '#b4b9bd';
  x.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 2600; i++) {
    const v = 150 + r() * 90;
    x.fillStyle = `rgba(${v},${v + 3},${v + 6},0.18)`;
    x.fillRect(0, r() * 512, 1024, 1);
  }
  const fonte = '"Barlow Semi Condensed", "Arial Narrow", sans-serif';
  // gravado: sombra clara embaixo, tinta escura por cima
  const grava = (
    txt: string,
    y: number,
    px: number,
    peso: number,
    esp: number,
  ) => {
    x.font = `${peso} ${px}px ${fonte}`;
    x.letterSpacing = `${esp}px`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = 'rgba(255,255,255,0.5)';
    x.fillText(txt, 512, y + 2);
    x.fillStyle = '#1c2124';
    x.fillText(txt, 512, y);
  };
  grava('MACCOMEVAP', 220, 168, 700, 10);
  x.fillStyle = '#1c2124';
  x.fillRect(250, 318, 524, 3);
  grava('INDÚSTRIA BRASILEIRA', 372, 46, 600, 9);
  for (const [rx, ry] of [
    [52, 52],
    [972, 52],
    [52, 460],
    [972, 460],
  ]) {
    const g = x.createRadialGradient(rx - 6, ry - 6, 2, rx, ry, 22);
    g.addColorStop(0, '#f2f4f5');
    g.addColorStop(1, '#6d7377');
    x.fillStyle = g;
    x.beginPath();
    x.arc(rx, ry, 20, 0, Math.PI * 2);
    x.fill();
  }
  x.strokeStyle = 'rgba(30,34,37,0.6)';
  x.lineWidth = 6;
  x.strokeRect(3, 3, 1018, 506);
  return c;
}
