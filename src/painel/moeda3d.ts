// Moeda 3D: cada moeda é desenhada uma vez como sólido de verdade (face, verso
// e borda serrilhada) girando em N quadros numa tira. A animação depois é só
// CSS trocando o quadro: nada roda em laço e nada pesa no celular.
import type { Moeda } from './api';

export type CodMoeda = Moeda | 'XXX';
/** Quadros por volta (10° cada). O quadro 0 é a pose parada. */
export const QUADROS = 36;
const TILT = (16 * Math.PI) / 180; // câmera um pouco acima: aparece a borda
const REPOUSO = (-24 * Math.PI) / 180; // parada um pouco virada, mostra a espessura

type Metal = readonly [
  sombra: string,
  meio: string,
  claro: string,
  brilho: string,
];
const OURO: Metal = ['#6b4708', '#b98424', '#ecc66a', '#fff3c8'];
const PRATA: Metal = ['#4f575d', '#9aa3aa', '#dde3e7', '#ffffff'];
const OURO_CN: Metal = ['#6e2408', '#b85a16', '#eaa53c', '#ffe4a0'];
const ACO: Metal = ['#4b5257', '#868e94', '#c3c9cd', '#f2f4f5'];
type Estilo = {
  borda: Metal;
  campo: Metal;
  /** Real bimetálico: anel dourado, miolo prateado (raio do miolo / raio). */
  anel?: Metal;
  miolo?: number;
  simbolo: string;
  verso: string;
  sub?: string;
  estrelas?: number;
  pontos?: number;
};
const ESTILO: Record<CodMoeda, Estilo> = {
  BRL: {
    borda: OURO,
    anel: OURO,
    campo: PRATA,
    miolo: 0.6,
    simbolo: 'R$',
    verso: '1',
    sub: 'REAL',
  },
  USD: { borda: PRATA, campo: PRATA, simbolo: '$', verso: 'USD', estrelas: 13 },
  CNY: { borda: OURO_CN, campo: OURO_CN, simbolo: '¥', verso: '元', pontos: 8 },
  XXX: { borda: ACO, campo: ACO, simbolo: '?', verso: '?' },
};
const SERIF = '"Georgia","Times New Roman",serif';
const CJK =
  '"Noto Serif SC","Noto Sans SC","PingFang SC","Microsoft YaHei","Songti SC",serif';

type Ctx = CanvasRenderingContext2D;
function metal(ctx: Ctx, r: number, m: Metal, inverte = false) {
  const s = inverte ? -1 : 1,
    g = ctx.createLinearGradient(-r * s, -r * s, r * s, r * s);
  g.addColorStop(0, m[3]);
  g.addColorStop(0.22, m[2]);
  g.addColorStop(0.58, m[1]);
  g.addColorStop(1, m[0]);
  return g;
}
// Campo espelhado (mais escuro) para o relevo fosco e claro se destacar,
// como numa moeda de coleção.
function campo(ctx: Ctx, r: number, m: Metal) {
  const g = ctx.createLinearGradient(-r, -r * 1.1, r, r);
  g.addColorStop(0, m[2]);
  g.addColorStop(0.45, m[1]);
  g.addColorStop(1, m[0]);
  return g;
}
function claro(ctx: Ctx, R: number, m: Metal) {
  const g = ctx.createLinearGradient(-R * 0.5, -R * 0.6, R * 0.5, R * 0.6);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, m[3]);
  g.addColorStop(1, m[2]);
  return g;
}
const disco = (ctx: Ctx, r: number, x = 0, y = 0) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
};
/** Relevo: sombra embaixo à direita, borda escura e o metal claro por cima. */
function relevo(
  ctx: Ctx,
  R: number,
  desenha: (fill: string | CanvasGradient) => void,
  m: Metal,
  forca = 1,
) {
  const d = R * 0.03 * forca;
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.translate(d, d * 1.25);
  desenha('rgba(20,12,2,.95)');
  ctx.restore();
  ctx.save();
  ctx.translate(d * 0.45, d * 0.55);
  desenha(m[0]);
  ctx.restore();
  desenha(claro(ctx, R, m));
}
const texto =
  (ctx: Ctx, t: string, px: number, familia: string, y = 0) =>
  (fill: string | CanvasGradient) => {
    ctx.fillStyle = fill;
    ctx.font = `700 ${px}px ${familia}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const mt = ctx.measureText(t),
      a = mt.actualBoundingBoxAscent || px * 0.7,
      b = mt.actualBoundingBoxDescent || 0;
    ctx.fillText(t, 0, y + (a - b) / 2);
  };
function estrela(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI * i) / 5 - Math.PI / 2,
      q = i % 2 ? r * 0.42 : r;
    if (i) ctx.lineTo(x + q * Math.cos(a), y + q * Math.sin(a));
    else ctx.moveTo(x + q * Math.cos(a), y + q * Math.sin(a));
  }
  ctx.closePath();
}

/** Desenho de uma face, centrado em (0,0). Pequena: menos detalhe, símbolo maior. */
function face(
  ctx: Ctx,
  R: number,
  e: Estilo,
  verso: boolean,
  simples: boolean,
) {
  const m = e.campo,
    rc = R * 0.86;
  // lábio levantado com chanfro
  disco(ctx, R);
  ctx.fillStyle = metal(ctx, R, e.borda);
  ctx.fill();
  disco(ctx, R * 0.9);
  ctx.fillStyle = metal(ctx, R, e.borda, true);
  ctx.fill();
  // campo com marcas de torno e leve concavidade
  disco(ctx, rc);
  ctx.fillStyle = e.anel && !verso ? metal(ctx, rc, e.anel) : campo(ctx, rc, m);
  ctx.fill();
  ctx.save();
  disco(ctx, rc);
  ctx.clip();
  if (!simples)
    for (let k = 0; k < 26; k++) {
      disco(ctx, rc * (0.1 + (k / 26) * 0.92));
      ctx.strokeStyle = k % 2 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.05)';
      ctx.lineWidth = R * 0.012;
      ctx.stroke();
    }
  const cv = ctx.createRadialGradient(
    -rc * 0.3,
    -rc * 0.35,
    rc * 0.1,
    0,
    0,
    rc,
  );
  cv.addColorStop(0, 'rgba(255,255,255,.22)');
  cv.addColorStop(0.7, 'rgba(255,255,255,0)');
  cv.addColorStop(1, 'rgba(0,0,0,.18)');
  ctx.fillStyle = cv;
  ctx.fillRect(-rc, -rc, rc * 2, rc * 2);
  ctx.restore();

  // Real: anel dourado com raios e miolo prateado
  if (e.miolo && !verso) {
    const ri = R * e.miolo;
    if (!simples)
      for (let t = 0; t < 48; t++) {
        const a = (t / 48) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * ri * 1.08, Math.sin(a) * ri * 1.08);
        ctx.lineTo(Math.cos(a) * rc * 0.93, Math.sin(a) * rc * 0.93);
        ctx.strokeStyle = t % 2 ? 'rgba(90,58,6,.28)' : 'rgba(255,248,220,.35)';
        ctx.lineWidth = R * 0.018;
        ctx.stroke();
      }
    disco(ctx, ri * 1.02);
    ctx.fillStyle = 'rgba(70,44,4,.55)';
    ctx.fill();
    disco(ctx, ri);
    ctx.fillStyle = campo(ctx, ri, e.campo);
    ctx.fill();
  }

  if (!verso && !simples) {
    for (let t = 0; t < (e.estrelas ?? 0); t++) {
      const b = -Math.PI / 2 + ((t + 0.5) / e.estrelas!) * Math.PI * 2,
        x = Math.cos(b) * rc * 0.82,
        y = Math.sin(b) * rc * 0.82;
      relevo(
        ctx,
        R,
        (f) => {
          estrela(ctx, x, y, R * 0.055);
          ctx.fillStyle = f;
          ctx.fill();
        },
        m,
        0.5,
      );
    }
    if (e.pontos) {
      for (let t = 0; t < e.pontos; t++) {
        const c = -Math.PI / 2 + (t / e.pontos) * Math.PI * 2,
          x = Math.cos(c) * rc * 0.8,
          y = Math.sin(c) * rc * 0.8;
        relevo(
          ctx,
          R,
          (f) => {
            disco(ctx, R * 0.04, x, y);
            ctx.fillStyle = f;
            ctx.fill();
          },
          m,
          0.5,
        );
      }
      disco(ctx, rc * 0.68);
      ctx.strokeStyle = 'rgba(80,24,4,.35)';
      ctx.lineWidth = R * 0.02;
      ctx.stroke();
    }
  }

  const s = verso ? e.verso : e.simbolo,
    cjk = /[㐀-鿿]/.test(s),
    px =
      (s.length > 2
        ? R * 0.52
        : s.length === 2
          ? R * (e.miolo ? 0.66 : 0.8)
          : R * (cjk ? 0.98 : 1.12)) * (simples ? 1.12 : 1),
    sub = verso && e.sub && !simples;
  relevo(
    ctx,
    R,
    texto(ctx, s, px, cjk ? CJK : SERIF, sub ? -R * 0.1 : 0),
    m,
    simples ? 1.8 : 1.2,
  );
  if (sub) relevo(ctx, R, texto(ctx, e.sub!, R * 0.2, SERIF, R * 0.42), m, 0.5);
  disco(ctx, rc);
  ctx.strokeStyle = 'rgba(0,0,0,.22)';
  ctx.lineWidth = R * 0.016;
  ctx.stroke();
}

type V3 = [number, number, number];
type M3 = [V3, V3, V3];
/** Giro em Y e depois a câmera inclinada em X. */
function rot(th: number): M3 {
  const cy = Math.cos(th),
    sy = Math.sin(th),
    cx = Math.cos(TILT),
    sx = Math.sin(TILT);
  return [
    [cy, 0, sy],
    [sx * sy, cx, -sx * cy],
    [-cx * sy, sx, cx * cy],
  ];
}
const mul = (M: M3, v: V3): V3 => [
  M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
  M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
  M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const LUZ: V3 = (() => {
  const v: V3 = [-0.45, -0.75, 0.75],
    n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
})();
const rgb = (c: string) => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** Tom do metal de 0 (sombra) a 1 (brilho). */
function tom(m: Metal, t: number) {
  const s = m.map(rgb),
    p = Math.max(0, Math.min(0.999, t)) * 3,
    i = Math.floor(p),
    f = p - i;
  return `rgb(${[0, 1, 2].map((k) => Math.round(s[i][k] + (s[i + 1][k] - s[i][k]) * f)).join(',')})`;
}

/** Um quadro: sombra no chão, borda serrilhada e a face visível com luz e brilho. */
function quadro(
  ctx: Ctx,
  F: number,
  th: number,
  faces: [HTMLCanvasElement, HTMLCanvasElement],
  e: Estilo,
  tmp: HTMLCanvasElement,
) {
  const R = F * 0.38,
    h = R * 0.085,
    M = rot(th),
    cx = F / 2,
    cy = F / 2 - F * 0.02,
    n = mul(M, [0, 0, 1]);
  const sy = cy + R * 1.08,
    sh = ctx.createRadialGradient(cx, sy, 0, cx, sy, R * 0.95);
  sh.addColorStop(0, 'rgba(0,0,0,.26)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(cx, sy);
  ctx.scale(Math.max(0.35, Math.abs(Math.cos(th))) + 0.15, 0.16);
  ctx.translate(-cx, -sy);
  ctx.fillStyle = sh;
  ctx.fillRect(cx - R * 1.2, cy, R * 2.4, R * 2.2);
  ctx.restore();

  // borda: K faixas do cilindro, serrilha alternando o tom
  const K = 140;
  for (let k = 0; k < K; k++) {
    const a0 = (k / K) * Math.PI * 2,
      a1 = ((k + 1.15) / K) * Math.PI * 2,
      am = (a0 + a1) / 2,
      nn = mul(M, [Math.cos(am), Math.sin(am), 0]);
    if (nn[2] <= -0.02) continue;
    const p = [
      mul(M, [R * Math.cos(a0), R * Math.sin(a0), h]),
      mul(M, [R * Math.cos(a1), R * Math.sin(a1), h]),
      mul(M, [R * Math.cos(a1), R * Math.sin(a1), -h]),
      mul(M, [R * Math.cos(a0), R * Math.sin(a0), -h]),
    ];
    const dif = Math.max(0, dot(nn, LUZ)),
      amb = 0.5 - nn[1] * 0.45;
    ctx.beginPath();
    ctx.moveTo(cx + p[0][0], cy + p[0][1]);
    for (let q = 1; q < 4; q++) ctx.lineTo(cx + p[q][0], cy + p[q][1]);
    ctx.closePath();
    ctx.fillStyle = tom(
      e.borda,
      0.12 + dif * 0.55 + amb * 0.3 + (k % 2 ? 0.1 : -0.06),
    );
    ctx.fill();
  }

  // face visível: a da frente se a normal aponta para a câmera
  const frente = n[2] >= 0,
    u = mul(M, [frente ? 1 : -1, 0, 0]),
    v = mul(M, [0, 1, 0]),
    o = mul(M, [0, 0, frente ? h : -h]),
    tex = faces[frente ? 0 : 1],
    S = tex.width / 2,
    k = R / S;
  const c2 = tmp.getContext('2d')!;
  c2.setTransform(1, 0, 0, 1, 0, 0);
  c2.globalCompositeOperation = 'source-over';
  c2.clearRect(0, 0, F, F);
  c2.setTransform(u[0] * k, u[1] * k, v[0] * k, v[1] * k, cx + o[0], cy + o[1]);
  c2.drawImage(tex, -S, -S);
  // escurece quando vira para longe da luz; faixa de brilho anda com o giro
  const nz: V3 = frente ? n : [-n[0], -n[1], -n[2]],
    dif = Math.max(0, dot(nz, LUZ)),
    meio: V3 = [LUZ[0], LUZ[1], LUZ[2] + 1],
    spec = Math.pow(Math.max(0, dot(nz, meio) / Math.hypot(...meio)), 6),
    ce = 0.5 + Math.sin(th + 0.6) * 0.45;
  c2.globalCompositeOperation = 'source-atop';
  c2.setTransform(1, 0, 0, 1, 0, 0);
  c2.fillStyle = `rgba(10,8,4,${(0.42 - dif * 0.42).toFixed(3)})`;
  c2.fillRect(0, 0, F, F);
  c2.setTransform(u[0] * k, u[1] * k, v[0] * k, v[1] * k, cx + o[0], cy + o[1]);
  const g = c2.createLinearGradient(-S * 1.4, -S * 0.9, S * 1.4, S * 0.9);
  g.addColorStop(Math.max(0, ce - 0.22), 'rgba(255,255,255,0)');
  g.addColorStop(ce, `rgba(255,255,255,${(0.18 + spec * 0.5).toFixed(3)})`);
  g.addColorStop(Math.min(1, ce + 0.22), 'rgba(255,255,255,0)');
  c2.fillStyle = g;
  c2.fillRect(-S, -S, S * 2, S * 2);
  ctx.drawImage(tmp, 0, 0);
}

/** Tamanhos de quadro em pixels do aparelho: um desenho serve vários tamanhos na tela. */
const LADOS = [48, 72, 96, 144, 192];
export const ladoPara = (css: number) => {
  const alvo = css * Math.min(3, Math.max(1, globalThis.devicePixelRatio || 1));
  return LADOS.find((l) => l >= alvo) ?? LADOS.at(-1)!;
};

const pronto = new Map<string, Promise<string>>();
/** Sem pressa: desenha poucos quadros por vez quando o navegador está livre. */
const folga = (fn: () => void) =>
  'requestIdleCallback' in window
    ? requestIdleCallback(fn, { timeout: 120 })
    : setTimeout(fn, 16);

/** URL da tira da moeda (desenhada uma vez por moeda e tamanho). */
export function tira(cod: CodMoeda, F: number): Promise<string> {
  const chave = `${cod}${F}`;
  let p = pronto.get(chave);
  if (p) return p;
  p = new Promise<string>((ok, falha) => {
    const e = ESTILO[cod],
      T = 256,
      simples = F < 84;
    const faces = [false, true].map((verso) => {
      const c = document.createElement('canvas');
      c.width = c.height = T;
      const x = c.getContext('2d')!;
      x.translate(T / 2, T / 2);
      face(x, T / 2, e, verso, simples);
      return c;
    }) as [HTMLCanvasElement, HTMLCanvasElement];
    const cv = document.createElement('canvas'),
      tmp = document.createElement('canvas');
    cv.width = F * QUADROS;
    cv.height = F;
    tmp.width = tmp.height = F;
    const ctx = cv.getContext('2d')!;
    let i = 0;
    const passo = () => {
      for (const fim = Math.min(QUADROS, i + 6); i < fim; i++) {
        ctx.save();
        ctx.translate(i * F, 0);
        ctx.beginPath();
        ctx.rect(0, 0, F, F);
        ctx.clip();
        quadro(ctx, F, REPOUSO + (i / QUADROS) * Math.PI * 2, faces, e, tmp);
        ctx.restore();
      }
      if (i < QUADROS) folga(passo);
      else
        cv.toBlob((b) =>
          b ? ok(URL.createObjectURL(b)) : falha(new Error('moeda')),
        );
    };
    folga(passo);
  });
  pronto.set(chave, p);
  return p;
}

/** Uma volta com saída suave, um pulinho e um leve assentar no fim (só CSS). */
export function keyframes(nome: string) {
  const passos = 64,
    c1 = 1.1,
    c3 = c1 + 1,
    out: string[] = [];
  for (let s = 0; s <= passos; s++) {
    const t = s / passos,
      p = (1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)) * QUADROS,
      q = ((Math.round(p) % QUADROS) + QUADROS) % QUADROS,
      y = t < 0.7 ? -Math.sin((t / 0.7) * Math.PI) * 16 : 0;
    out.push(
      `${(t * 100).toFixed(2)}%{background-position:${((q / (QUADROS - 1)) * 100).toFixed(4)}% 0;transform:translateY(${y.toFixed(1)}%)}`,
    );
  }
  return `@keyframes ${nome}{${out.join('')}}`;
}
