/**
 * Palco da Maccomevap: uma luminária à prova de explosão (corpo de alumínio
 * fundido com aletas, prensa-cabo, junta roscada, vidro grosso e grade de
 * aço) pendurada sobre o corredor de um galpão escuro. A câmera passa pela
 * placa da marca e pelo vidro, a luminária acende, as outras do corredor
 * acendem em seguida e a luz cai sobre as estantes. Toca uma vez (~6 s) e
 * para no último quadro: sem laço contínuo, poupa bateria. Cada quadro é
 * função só do tempo (`quadro(t)`), então dá para pular para qualquer instante.
 */
import * as T from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export const DURACAO = 6.4;
const ACENDE = 3.1; // a luminária da frente acende
const PISO = -3.4; // altura do piso (a luminária fica em y = 0)
const CORREDOR = [-5.4, -10.8, -16.2, -21.6]; // outras luminárias, em z
const QUENTE = new T.Color(0.017, 0.016, 0.015); // cor do ar com as luzes acesas

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
/** chega desacelerando, sem quique */
const sai = (k: number) => 1 - Math.pow(1 - clamp(k), 4);
/** sai acelerando e chega desacelerando */
const meio = (k: number) => {
  k = clamp(k);
  return k < 0.5 ? 8 * k ** 4 : 1 - Math.pow(-2 * k + 2, 4) / 2;
};
const faixa = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

function rnd(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
function tela(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}
function textura(c: HTMLCanvasElement, srgb = true) {
  const t = new T.CanvasTexture(c);
  if (srgb) t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * Mapa de normais a partir de uma altura. Não usa bumpMap: o relevo por
 * derivadas de tela dá NaN em peças finas vistas de longe (quadro preto).
 */
function relevo(
  w: number,
  h: number,
  alt: (x: number, y: number) => number,
  forca: number,
) {
  const [c, x] = tela(w, h),
    img = x.createImageData(w, h),
    H = new Float32Array(w * h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) H[j * w + i] = alt(i, j);
  const em = (i: number, j: number) => H[((j + h) % h) * w + ((i + w) % w)];
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const dx = (em(i + 1, j) - em(i - 1, j)) * forca,
        dy = (em(i, j + 1) - em(i, j - 1)) * forca,
        l = Math.hypot(dx, dy, 1),
        k = (j * w + i) * 4;
      img.data[k] = (-dx / l) * 127.5 + 127.5;
      img.data[k + 1] = (dy / l) * 127.5 + 127.5;
      img.data[k + 2] = (1 / l) * 127.5 + 127.5;
      img.data[k + 3] = 255;
    }
  x.putImageData(img, 0, 0);
  const t = textura(c, false);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
/** Superfície de fundição: grão fino sobre ondulação suave. */
function fundido() {
  const r = rnd(3),
    g = Array.from({ length: 32 * 32 }, () => r()),
    fino = Array.from({ length: 256 * 256 }, () => r());
  const suave = (x: number, y: number) => {
    const u = (x / 256) * 32,
      v = (y / 256) * 32,
      i = Math.floor(u),
      j = Math.floor(v),
      fu = u - i,
      fv = v - j,
      a = (p: number, q: number) => g[(q % 32) * 32 + (p % 32)];
    return mix(
      mix(a(i, j), a(i + 1, j), fu),
      mix(a(i, j + 1), a(i + 1, j + 1), fu),
      fv,
    );
  };
  const t = relevo(
    256,
    256,
    (x, y) => suave(x, y) * 0.6 + fino[y * 256 + x] * 0.25,
    1.2,
  );
  t.repeat.set(6, 3);
  return t;
}
/** Filetes de rosca (junta à prova de chama e prensa-cabo). */
function rosca(voltas: number) {
  return relevo(
    8,
    128,
    (_x, y) => Math.sin((y / 128) * Math.PI * 2 * voltas),
    1.6,
  );
}
/** Placa de inox escovado com a marca gravada. */
function placa() {
  const [c, x] = tela(1024, 512),
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
  return textura(c);
}
function papelao() {
  const [c, x] = tela(256, 256),
    r = rnd(11);
  x.fillStyle = '#c29a68';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2200; i++) {
    x.fillStyle = r() < 0.5 ? 'rgba(255,240,215,.1)' : 'rgba(90,55,20,.1)';
    x.fillRect(r() * 256, r() * 256, 1 + r() * 18, 1);
  }
  x.fillStyle = 'rgba(140,95,48,.5)';
  x.fillRect(0, 116, 256, 24);
  const [c2, x2] = tela(256, 256);
  x2.drawImage(c, 0, 0);
  const topo = textura(c2);
  x.fillStyle = '#ebe8e0';
  x.fillRect(150, 160, 70, 48);
  return [textura(c), topo] as const;
}
function concreto() {
  const [c, x] = tela(512, 512),
    r = rnd(7),
    img = x.createImageData(512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 112 + (r() - 0.5) * 22;
    img.data[i] = v;
    img.data[i + 1] = v + 1;
    img.data[i + 2] = v - 1;
    img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  for (let i = 0; i < 46; i++) {
    const gx = r() * 512,
      gy = r() * 512,
      g = x.createRadialGradient(gx, gy, 0, gx, gy, 40 + r() * 120);
    g.addColorStop(
      0,
      r() < 0.6 ? 'rgba(30,30,30,.14)' : 'rgba(255,255,255,.06)',
    );
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 512, 512);
  }
  // juntas de dilatação
  x.fillStyle = 'rgba(20,20,20,.35)';
  x.fillRect(0, 0, 512, 2);
  x.fillRect(0, 0, 2, 512);
  const t = textura(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(8, 12);
  return t;
}
/** Disco suave: halo da luminária e luzes distantes fora de foco. */
function disco() {
  const [c, x] = tela(128, 128),
    g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return textura(c);
}
/** Máscara projetada pela luz: as hastes da grade riscam o piso. */
function grade() {
  const [c, x] = tela(256, 256);
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, '#fff');
  g.addColorStop(0.75, '#fff');
  g.addColorStop(1, '#000');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(0,0,0,0.55)';
  x.lineCap = 'round';
  x.filter = 'blur(3px)';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    x.lineWidth = 7;
    x.beginPath();
    x.moveTo(128 + Math.cos(a) * 16, 128 + Math.sin(a) * 16);
    x.lineTo(128 + Math.cos(a) * 128, 128 + Math.sin(a) * 128);
    x.stroke();
  }
  x.lineWidth = 6;
  x.beginPath();
  x.arc(128, 128, 82, 0, Math.PI * 2);
  x.stroke();
  return textura(c);
}

/** Facho de luz no ar: aditivo, some nas bordas e com a distância. */
const FACHO_VS = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying float vH;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  vH = uv.y;
  gl_Position = projectionMatrix * mv;
}`;
const FACHO_FS = /* glsl */ `
uniform float uOn; uniform vec3 uCor;
varying vec3 vN; varying vec3 vV; varying float vH;
void main() {
  float borda = pow(abs(dot(normalize(vN), normalize(vV))), 2.4);
  float queda = pow(vH, 2.2);
  gl_FragColor = vec4(uCor * borda * queda * uOn, 1.0);
}`;
const POEIRA_VS = /* glsl */ `
uniform float uT; uniform float uPx; uniform float uMax;
attribute float aFase;
varying float vA;
void main() {
  vec3 p = position;
  p.x += sin(uT * 0.35 + aFase * 6.2831) * 0.05;
  p.z += cos(uT * 0.28 + aFase * 4.0) * 0.05;
  p.y += sin(uT * 0.2 + aFase * 9.0) * 0.04;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // brilha mais perto do eixo do facho
  float h = clamp(-p.y / 3.2, 0.0, 1.0);
  float r = length(p.xz) / max(0.05, h * 2.0 + 0.08);
  vA = (1.0 - smoothstep(0.5, 1.0, r)) * (1.0 - h * 0.7)
    * smoothstep(0.5, 1.4, -mv.z);
  gl_PointSize = min(uPx * (0.8 + aFase) / -mv.z, uMax);
  gl_Position = projectionMatrix * mv;
}`;
const POEIRA_FS = /* glsl */ `
uniform float uOn;
varying float vA;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(d)) * vA * uOn;
  gl_FragColor = vec4(vec3(1.0, 0.95, 0.86) * a * 0.2, 1.0);
}`;

type Chave = { t: number; pos: T.Vector3; alvo: T.Vector3; fov: number };
type Item = [number, number, number, number, number, number, number];
/** Luminária do fundo do corredor: acende depois da principal. */
type Distante = {
  globo: T.MeshBasicMaterial;
  halo: T.SpriteMaterial;
  facho: T.ShaderMaterial;
  poca: T.MeshBasicMaterial;
  luz?: T.PointLight;
};

export class Luminaria {
  private rd: T.WebGLRenderer;
  private sc = new T.Scene();
  private cam = new T.PerspectiveCamera(30, 2, 0.02, 80);
  private comp: EffectComposer;
  private bloom: UnrealBloomPass;
  private env: T.Texture;
  private metais: T.MeshStandardMaterial[] = [];
  private spot: T.SpotLight;
  private varre: T.SpotLight;
  private leds!: T.MeshStandardMaterial;
  private vidro!: T.MeshPhysicalMaterial;
  private facho!: T.ShaderMaterial;
  private halo!: T.SpriteMaterial;
  private poeira!: T.ShaderMaterial;
  private distantes: Distante[] = [];
  private nevoa: T.FogExp2;
  private chaves: Chave[] = [];
  private ro: ResizeObserver;
  private raf = 0;
  private inicio = 0;
  private larg = 0;
  private alt = 0;
  t = 0;

  constructor(private host: HTMLElement) {
    this.rd = new T.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    const rd = this.rd;
    rd.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    rd.toneMapping = T.ACESFilmicToneMapping;
    rd.toneMappingExposure = 1.0;
    rd.shadowMap.enabled = true;
    rd.shadowMap.type = T.PCFShadowMap;
    rd.domElement.className = 'luz-cv';
    rd.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(rd.domElement);

    const sc = this.sc;
    sc.background = new T.Color(0x06080a);
    this.nevoa = new T.FogExp2(0x06080a, 0.07);
    sc.fog = this.nevoa;
    // reflexo de estúdio só nos metais e no vidro; o galpão fica no escuro
    const pm = new T.PMREMGenerator(rd);
    this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();

    this.montarLuminaria();
    this.montarGalpao();

    sc.add(new T.HemisphereLight(0x6f87a3, 0x0b0d10, 0.04));
    // luz fria das janelas altas, por trás: recorta as bordas
    const janela = new T.DirectionalLight(0x9fb8d8, 0.7);
    janela.position.set(-2.5, 3, -4);
    sc.add(janela);
    // varredura fria que corre pelas aletas no começo (uma vez)
    this.varre = new T.SpotLight(0xdbe7ff, 0, 3, 0.4, 0.9, 2);
    this.varre.target.position.set(0, 0.17, 0);
    sc.add(this.varre, this.varre.target);

    // a luz da luminária sai por baixo do globo: o vidro e a grade não ficam
    // dentro do cone (brilho especular perto demais estoura a imagem)
    this.spot = new T.SpotLight(0xfff1dd, 0, 0, 1.0, 0.6, 2);
    this.spot.position.set(0, -0.175, 0);
    this.spot.target.position.set(0, PISO, 0);
    this.spot.map = grade();
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(1024, 1024);
    this.spot.shadow.bias = -0.0005;
    this.spot.shadow.normalBias = 0.02;
    this.spot.shadow.camera.near = 0.1;
    this.spot.shadow.camera.far = 9;
    sc.add(this.spot, this.spot.target);

    this.comp = new EffectComposer(rd);
    this.comp.addPass(new RenderPass(sc, this.cam));
    // um pixel infinito (brilho especular extremo) espalharia NaN pelo bloom
    // e apagaria o quadro inteiro: limita antes
    this.comp.addPass(
      new ShaderPass({
        uniforms: { tDiffuse: { value: null } },
        vertexShader: `varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  bool ok = c.r == c.r && c.g == c.g && c.b == c.b;
  gl_FragColor = ok ? vec4(clamp(c.rgb, 0.0, 40.0), c.a) : vec4(0.0, 0.0, 0.0, 1.0);
}`,
      }),
    );
    this.bloom = new UnrealBloomPass(new T.Vector2(256, 256), 0.6, 0.6, 0.9);
    this.comp.addPass(this.bloom);
    this.comp.addPass(new OutputPass());

    this.ro = new ResizeObserver(() => {
      this.tamanho();
      if (!this.raf) this.quadro(this.t);
    });
    this.ro.observe(host);
    this.tamanho();
  }

  private metal(p: T.MeshStandardMaterialParameters) {
    const m = new T.MeshStandardMaterial({
      metalness: 1,
      envMap: this.env,
      ...p,
    });
    this.metais.push(m);
    return m;
  }

  private montarLuminaria() {
    const g = new T.Group();
    const aluminio = this.metal({
      color: 0x8f9498,
      roughness: 0.5,
      normalMap: fundido(),
      normalScale: new T.Vector2(0.45, 0.45),
    });
    const sombra = this.metal({
      color: 0x6f7478,
      roughness: 0.55,
      normalMap: aluminio.normalMap,
      normalScale: aluminio.normalScale,
    });
    const aco = this.metal({ color: 0x8b9196, roughness: 0.38 });
    const inox = this.metal({ color: 0xcfd3d6, roughness: 0.24 });
    const latao = this.metal({ color: 0xcdc6b6, roughness: 0.3 });
    const roscado = this.metal({
      color: 0xb9bdc0,
      roughness: 0.36,
      normalMap: rosca(16),
    });

    // eletroduto que sobe até o teto, luva e porca
    const tubo = new T.Mesh(new T.CylinderGeometry(0.021, 0.021, 4, 24), aco);
    tubo.position.y = 0.3 + 2;
    const luva = new T.Mesh(
      new T.CylinderGeometry(0.033, 0.033, 0.06, 32),
      aco,
    );
    luva.position.y = 0.31;
    const porca = new T.Mesh(
      new T.CylinderGeometry(0.042, 0.042, 0.026, 6),
      aco,
    );
    porca.position.y = 0.272;
    // tampa e corpo de alumínio fundido
    const tampa = new T.Mesh(
      new T.LatheGeometry(
        [
          new T.Vector2(0.04, 0.262),
          new T.Vector2(0.075, 0.256),
          new T.Vector2(0.115, 0.243),
          new T.Vector2(0.132, 0.232),
          new T.Vector2(0.135, 0.224),
          new T.Vector2(0.128, 0.22),
        ],
        72,
      ),
      aluminio,
    );
    const corpo = new T.Mesh(
      new T.CylinderGeometry(0.124, 0.124, 0.12, 72),
      sombra,
    );
    corpo.position.y = 0.166;
    g.add(tubo, luva, porca, tampa, corpo);

    // prensa-cabo na entrada lateral, com o cabo subindo
    const PC = -1.3; // ângulo da entrada
    const pc = new T.Group();
    const peca = (geo: T.BufferGeometry, mat: T.Material, z: number) => {
      const m = new T.Mesh(geo, mat);
      m.rotation.x = Math.PI / 2;
      m.position.z = z;
      pc.add(m);
    };
    peca(new T.CylinderGeometry(0.026, 0.028, 0.02, 40), aluminio, 0.128);
    peca(
      new T.CylinderGeometry(0.016, 0.016, 0.012, 32),
      this.metal({
        color: 0xc5c0b2,
        roughness: 0.32,
        normalMap: rosca(6),
      }),
      0.143,
    );
    peca(new T.CylinderGeometry(0.023, 0.023, 0.016, 6), latao, 0.157);
    peca(new T.CylinderGeometry(0.019, 0.02, 0.016, 40), latao, 0.173);
    peca(new T.CylinderGeometry(0.014, 0.019, 0.006, 40), latao, 0.184);
    const cabo = new T.Mesh(
      new T.TubeGeometry(
        new T.CatmullRomCurve3([
          new T.Vector3(0, 0, 0.18),
          new T.Vector3(0, 0.004, 0.215),
          new T.Vector3(0, 0.04, 0.245),
          new T.Vector3(0, 0.12, 0.258),
          new T.Vector3(0, 0.5, 0.262),
          new T.Vector3(0, 1.6, 0.262),
        ]),
        64,
        0.0095,
        14,
        false,
      ),
      new T.MeshStandardMaterial({ color: 0x15171a, roughness: 0.55 }),
    );
    pc.add(cabo);
    pc.rotation.y = PC;
    pc.position.y = 0.17;
    g.add(pc);

    // peças repetidas viram uma só chamada de desenho
    const repete = (
      geo: T.BufferGeometry,
      mat: T.Material,
      pecas: [number, number, number, number][], // x, y, z, giro em y
    ) => {
      const im = new T.InstancedMesh(geo, mat, pecas.length),
        o = new T.Object3D();
      pecas.forEach(([x, y, z, ry], i) => {
        o.position.set(x, y, z);
        o.rotation.set(0, ry, 0);
        o.updateMatrix();
        im.setMatrixAt(i, o.matrix);
      });
      g.add(im);
    };

    // aletas radiais de dissipação, com vãos para a placa e o prensa-cabo
    const aletas: [number, number, number, number][] = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2,
        rel = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(rel) < 0.36 || Math.abs(rel - PC) < 0.2) continue;
      aletas.push([Math.sin(a) * 0.135, 0.168, Math.cos(a) * 0.135, a]);
    }
    repete(
      new RoundedBoxGeometry(0.0034, 0.104, 0.024, 2, 0.0011),
      aluminio,
      aletas,
    );
    // placa da marca, no vão, virada para +z
    const placaM = new T.Mesh(
      new T.CylinderGeometry(0.1272, 0.1272, 0.06, 32, 1, true, -0.32, 0.64),
      this.metal({ map: placa(), metalness: 0.7, roughness: 0.3 }),
    );
    placaM.position.y = 0.17;
    g.add(placaM);

    // flange com parafusos e anel roscado da junta à prova de chama
    const flange = new T.Mesh(
      new T.CylinderGeometry(0.136, 0.136, 0.016, 72),
      sombra,
    );
    flange.position.y = 0.098;
    g.add(flange);
    repete(
      new T.CylinderGeometry(0.008, 0.008, 0.008, 6),
      inox,
      Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        return [Math.sin(a) * 0.126, 0.087, Math.cos(a) * 0.126, 0];
      }),
    );
    const anel = new T.Mesh(
      new T.CylinderGeometry(0.112, 0.112, 0.03, 72, 1, true),
      roscado,
    );
    anel.position.y = 0.075;
    g.add(anel);

    // módulo de LED: fósforo amarelo apagado, branco quente aceso
    const pcb = new T.Mesh(
      new T.CylinderGeometry(0.08, 0.08, 0.004, 48),
      this.metal({ color: 0xe6e8ea, roughness: 0.18 }),
    );
    pcb.position.y = 0.058;
    g.add(pcb);
    this.leds = new T.MeshStandardMaterial({
      color: 0xe9c95a,
      emissive: 0xfff2dc,
      emissiveIntensity: 0,
      roughness: 0.35,
      envMap: this.env,
      envMapIntensity: 0.5,
    });
    const leds: [number, number, number, number][] = [];
    for (const [raio, qtd] of [
      [0.016, 6],
      [0.033, 12],
      [0.05, 18],
      [0.067, 24],
    ] as const)
      for (let i = 0; i < qtd; i++) {
        const a = (i / qtd) * Math.PI * 2 + raio * 9;
        leds.push([Math.sin(a) * raio, 0.0552, Math.cos(a) * raio, a]);
      }
    repete(new T.BoxGeometry(0.0062, 0.002, 0.0062), this.leds, leds);

    // globo de vidro grosso (borossilicato)
    this.vidro = new T.MeshPhysicalMaterial({
      color: 0xf4f8f6,
      metalness: 0,
      roughness: 0.05,
      transmission: 1,
      thickness: 0.014,
      ior: 1.47,
      attenuationColor: new T.Color(0xcfe8dc),
      attenuationDistance: 0.5,
      specularIntensity: 1,
      envMap: this.env,
      envMapIntensity: 0.45,
      emissive: 0xfff1de,
      emissiveIntensity: 0,
    });
    const perfil = [
      new T.Vector2(0.104, 0.064),
      new T.Vector2(0.108, 0.02),
      new T.Vector2(0.106, -0.03),
      new T.Vector2(0.096, -0.08),
      new T.Vector2(0.074, -0.122),
      new T.Vector2(0.044, -0.146),
      new T.Vector2(0.014, -0.154),
      new T.Vector2(0.0, -0.155),
    ];
    g.add(new T.Mesh(new T.LatheGeometry(perfil, 72), this.vidro));

    // grade de proteção: hastes curvas que acompanham o globo, anéis
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const pts = perfil
        .slice(0, 7)
        .map(
          (p) =>
            new T.Vector3(
              Math.sin(a) * (p.x + 0.016),
              p.y - 0.004,
              Math.cos(a) * (p.x + 0.016),
            ),
        );
      pts.unshift(new T.Vector3(Math.sin(a) * 0.12, 0.072, Math.cos(a) * 0.12));
      g.add(
        new T.Mesh(
          new T.TubeGeometry(
            new T.CatmullRomCurve3(pts),
            48,
            0.0042,
            10,
            false,
          ),
          inox,
        ),
      );
    }
    const aro = (raio: number, y: number, esp: number) => {
      const m = new T.Mesh(new T.TorusGeometry(raio, esp, 10, 72), inox);
      m.rotation.x = Math.PI / 2;
      m.position.y = y;
      g.add(m);
    };
    aro(0.122, -0.012, 0.0045);
    aro(0.034, -0.158, 0.005);

    // halo no ar em volta do globo aceso
    this.halo = new T.SpriteMaterial({
      map: disco(),
      color: 0xffe9cc,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: T.AdditiveBlending,
      fog: false,
    });
    const h = new T.Sprite(this.halo);
    h.position.y = -0.06;
    h.scale.setScalar(0.7);
    g.add(h);
    this.sc.add(g);
  }

  private montarGalpao() {
    const sc = this.sc,
      r = rnd(23);
    const piso = new T.Mesh(
      new T.PlaneGeometry(40, 60),
      new T.MeshStandardMaterial({ map: concreto(), roughness: 0.62 }),
    );
    piso.rotation.x = -Math.PI / 2;
    piso.position.set(0, PISO, -14);
    piso.receiveShadow = true;
    sc.add(piso);
    // faixas amarelas do corredor
    const amarelo = new T.MeshStandardMaterial({
      color: 0xd9a400,
      roughness: 0.55,
    });
    for (const x of [-1.08, 1.08]) {
      const f = new T.Mesh(new T.PlaneGeometry(0.08, 60), amarelo);
      f.rotation.x = -Math.PI / 2;
      f.position.set(x, PISO + 0.002, -14);
      f.receiveShadow = true;
      sc.add(f);
    }

    // porta-paletes dos dois lados: colunas azuis, longarinas laranja,
    // paletes e caixas (tudo instanciado: poucas chamadas de desenho)
    const VAO = 2.7,
      FUNDO = 1.1,
      FACE = 1.25,
      Z0 = 3.2,
      VAOS = 11,
      NIVEIS = [0, 1.12, 2.2];
    const m4 = new T.Matrix4(),
      q = new T.Quaternion(),
      eixo = new T.Vector3(0, 1, 0),
      s = new T.Vector3(),
      p = new T.Vector3();
    const lote = (mat: T.Material | T.Material[], itens: Item[]) => {
      const im = new T.InstancedMesh(
        new T.BoxGeometry(1, 1, 1),
        mat,
        itens.length,
      );
      itens.forEach(([x, y, z, w, h, d, ry], i) => {
        q.setFromAxisAngle(eixo, ry);
        im.setMatrixAt(i, m4.compose(p.set(x, y, z), q, s.set(w, h, d)));
      });
      im.castShadow = im.receiveShadow = true;
      sc.add(im);
    };
    const cols: Item[] = [],
      longs: Item[] = [],
      pals: Item[] = [],
      caixas: Item[] = [],
      verdes: Item[] = [];
    for (const lado of [-1, 1]) {
      const xf = lado * FACE,
        xt = lado * (FACE + FUNDO),
        xm = (xf + xt) / 2;
      for (let i = 0; i <= VAOS; i++) {
        const z = Z0 - i * VAO;
        for (const x of [xf, xt])
          cols.push([x, PISO + 1.5, z, 0.08, 3.0, 0.08, 0]);
      }
      for (let v = 0; v < VAOS; v++) {
        const zc = Z0 - (v + 0.5) * VAO;
        for (const nv of NIVEIS) {
          const y = PISO + nv;
          if (nv > 0)
            for (const x of [xf, xt])
              longs.push([x, y - 0.06, zc, 0.05, 0.12, VAO - 0.08, 0]);
          // dois paletes por vão, com caixas empilhadas
          for (const dz of [-0.62, 0.62]) {
            if (r() < 0.12) continue;
            const zp = zc + dz;
            pals.push([xm, y + 0.07, zp, 1.0, 0.14, 1.15, 0]);
            let yy = y + 0.14;
            const camadas = 1 + Math.floor(r() * (nv < 2 ? 3 : 2));
            for (let c = 0; c < camadas && yy < y + 0.95; c++) {
              const h = 0.24 + r() * 0.2;
              for (const bx of [-0.25, 0.25])
                for (const bz of [-0.28, 0.28]) {
                  if (c > 0 && r() < 0.22) continue;
                  (r() < 0.12 ? verdes : caixas).push([
                    xm + bx + (r() - 0.5) * 0.03,
                    yy + h / 2,
                    zp + bz + (r() - 0.5) * 0.03,
                    0.46,
                    h,
                    0.52,
                    (r() - 0.5) * 0.06,
                  ]);
                }
              yy += h + 0.004;
            }
          }
        }
      }
    }
    lote(
      new T.MeshStandardMaterial({
        color: 0x1c4a86,
        metalness: 0.3,
        roughness: 0.5,
      }),
      cols,
    );
    lote(
      new T.MeshStandardMaterial({
        color: 0xd8601c,
        metalness: 0.3,
        roughness: 0.45,
      }),
      longs,
    );
    lote(new T.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.9 }), pals);
    const [lateral, tampa] = papelao(),
      kraft = new T.MeshStandardMaterial({ map: lateral, roughness: 0.85 }),
      kraftTopo = new T.MeshStandardMaterial({ map: tampa, roughness: 0.85 });
    lote([kraft, kraft, kraftTopo, kraftTopo, kraft, kraft], caixas);
    lote(
      new T.MeshStandardMaterial({ color: 0x2c6a4b, roughness: 0.6 }),
      verdes,
    );

    // as outras luminárias do corredor: corpo escuro, globo, facho e poça no piso
    const corpoGeo = new T.CylinderGeometry(0.13, 0.12, 0.2, 24),
      globoGeo = new T.SphereGeometry(0.1, 24, 16),
      corpoMat = new T.MeshStandardMaterial({
        color: 0x2b2f33,
        metalness: 0.6,
        roughness: 0.5,
      }),
      pocaGeo = new T.PlaneGeometry(1, 1),
      mapa = disco();
    CORREDOR.forEach((z, i) => {
      const corpo = new T.Mesh(corpoGeo, corpoMat);
      corpo.position.set(0, 0.17, z);
      const tubo = new T.Mesh(
        new T.CylinderGeometry(0.02, 0.02, 4, 8),
        corpoMat,
      );
      tubo.position.set(0, 2.2, z);
      const globo = new T.MeshBasicMaterial({ color: 0x000000 });
      const gm = new T.Mesh(globoGeo, globo);
      gm.position.set(0, -0.02, z);
      gm.scale.set(1, 1.3, 1);
      const halo = new T.SpriteMaterial({
        map: mapa,
        color: 0xffe6c4,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: T.AdditiveBlending,
      });
      const hs = new T.Sprite(halo);
      hs.position.set(0, -0.04, z);
      hs.scale.setScalar(1.1);
      const facho = this.cone(PISO + 0.16, 0.95);
      facho.position.z = z;
      const poca = new T.MeshBasicMaterial({
        map: mapa,
        color: 0xffe2bd,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: T.AdditiveBlending,
      });
      const pm = new T.Mesh(pocaGeo, poca);
      pm.rotation.x = -Math.PI / 2;
      pm.position.set(0, PISO + 0.004, z);
      pm.scale.setScalar(5.5);
      sc.add(corpo, tubo, gm, hs, facho, pm);
      const d: Distante = {
        globo,
        halo,
        facho: facho.material as T.ShaderMaterial,
        poca,
      };
      if (i < 2) {
        d.luz = new T.PointLight(0xffefd8, 0, 9, 2);
        d.luz.position.set(0, -0.6, z);
        sc.add(d.luz);
      }
      this.distantes.push(d);
    });

    // facho da luminária da frente e poeira suspensa
    const f = this.cone(PISO + 0.16, 1.0, 0.1);
    this.facho = f.material as T.ShaderMaterial;
    sc.add(f);

    const n = 600,
      pos = new Float32Array(n * 3),
      fase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const h = Math.pow(r(), 0.8),
        raio = Math.sqrt(r()) * (h * 2.0 + 0.1),
        a = r() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * raio;
      pos[i * 3 + 1] = -0.2 - h * 3.0;
      pos[i * 3 + 2] = Math.sin(a) * raio;
      fase[i] = r();
    }
    const gp = new T.BufferGeometry();
    gp.setAttribute('position', new T.BufferAttribute(pos, 3));
    gp.setAttribute('aFase', new T.BufferAttribute(fase, 1));
    this.poeira = new T.ShaderMaterial({
      vertexShader: POEIRA_VS,
      fragmentShader: POEIRA_FS,
      uniforms: {
        uT: { value: 0 },
        uOn: { value: 0 },
        uPx: { value: 30 },
        uMax: { value: 6 },
      },
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
    });
    sc.add(new T.Points(gp, this.poeira));
  }

  /** Cone aditivo do topo (y = -0.17) até `base`, com meia abertura `ang`. */
  private cone(base: number, ang: number, forca = 0.075) {
    const alt = -0.17 - base,
      geo = new T.ConeGeometry(Math.tan(ang * 0.62) * alt, alt, 64, 1, true);
    const m = new T.Mesh(
      geo,
      new T.ShaderMaterial({
        vertexShader: FACHO_VS,
        fragmentShader: FACHO_FS,
        uniforms: {
          uOn: { value: 0 },
          uCor: { value: new T.Color(0xffeedd).multiplyScalar(forca) },
        },
        transparent: true,
        depthWrite: false,
        side: T.DoubleSide,
        blending: T.AdditiveBlending,
      }),
    );
    m.position.y = -0.17 - alt / 2;
    return m;
  }

  /** Câmera: macro no prensa-cabo e aletas → placa → vidro → recua pelo corredor. */
  private trilha() {
    const asp = this.larg / Math.max(1, this.alt),
      // tela mais estreita: recua um pouco no plano final
      recuo = clamp(1.95 / asp, 1, 1.45),
      V = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
    this.chaves = [
      { t: 0, pos: V(-0.3, 0.24, 0.17), alvo: V(-0.07, 0.17, 0.05), fov: 30 },
      // pousa na placa e quase para: tempo de ler a marca
      { t: 1.45, pos: V(0.01, 0.205, 0.34), alvo: V(0, 0.168, 0.12), fov: 30 },
      { t: 1.9, pos: V(0.012, 0.2, 0.328), alvo: V(0, 0.166, 0.12), fov: 30 },
      { t: 2.75, pos: V(0.1, 0.0, 0.36), alvo: V(0, -0.02, 0), fov: 30 },
      { t: 3.3, pos: V(0.11, -0.012, 0.344), alvo: V(0, -0.025, 0), fov: 30 },
      {
        t: DURACAO,
        pos: V(-0.45 * recuo, -0.1, 1.5 * recuo),
        alvo: V(-0.45, -0.35, -2.5),
        fov: 42,
      },
    ];
  }

  private tamanho() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.larg = w;
    this.alt = h;
    this.rd.setSize(w, h, false);
    this.comp.setSize(w, h);
    this.comp.setPixelRatio(this.rd.getPixelRatio());
    this.bloom.resolution.set(w, h);
    this.cam.aspect = w / h;
    this.poeira.uniforms.uPx.value = 16 * this.rd.getPixelRatio() * (h / 300);
    this.poeira.uniforms.uMax.value = 3.5 * this.rd.getPixelRatio() * (h / 300);
    this.trilha();
  }

  private camera(t: number) {
    const k = this.chaves;
    let i = 0;
    while (i < k.length - 2 && t > k[i + 1].t) i++;
    const a = k[i],
      b = k[i + 1],
      p = clamp((t - a.t) / (b.t - a.t));
    // já começa andando e pousa na placa; placa e respiração quase não
    // andam; a descida desliza; o recuo final arranca rápido e chega devagar
    const e =
      i === k.length - 2
        ? sai(Math.pow(p, 1.4))
        : i === 0
          ? 1 - Math.pow(1 - p, 2.6)
          : i === 2
            ? meio(p)
            : Math.sin((p * Math.PI) / 2);
    this.cam.position.lerpVectors(a.pos, b.pos, e);
    this.cam.fov = mix(a.fov, b.fov, e);
    this.cam.updateProjectionMatrix();
    this.cam.lookAt(new T.Vector3().lerpVectors(a.alvo, b.alvo, e));
  }

  /** Desenha o instante t (segundos). */
  quadro(t: number) {
    this.t = t = clamp(t, 0, DURACAO);
    this.camera(t);

    // varredura fria sobre as aletas e a placa
    const v = faixa(t, 0.1, 1.8);
    this.varre.intensity = Math.sin(v * Math.PI) * 1.6;
    this.varre.position.set(mix(-0.55, 0.45, meio(v)), 0.34, 0.4);

    // acendimento: duas piscadas curtas do driver, depois sobe e firma
    let on = 0;
    if (t >= ACENDE) {
      const d = t - ACENDE;
      if (d < 0.05) on = 0.55;
      else if (d < 0.11) on = 0.06;
      else if (d < 0.16) on = 0.75;
      else if (d < 0.22) on = 0.25;
      else on = mix(0.25, 1, sai((d - 0.22) / 0.35));
    }
    this.leds.emissiveIntensity = on * 5;
    this.vidro.emissiveIntensity = on * 0.025;
    const longe = this.cam.position.length();
    this.halo.opacity = on * 0.24 * faixa(longe, 0.5, 1.6);
    this.spot.intensity = on * 55;
    this.facho.uniforms.uOn.value = on;
    this.poeira.uniforms.uOn.value = on;
    this.poeira.uniforms.uT.value = t;
    for (const m of this.metais) m.envMapIntensity = mix(0.28, 0.4, on);

    // as outras acendem em sequência pelo corredor
    let ar = on;
    this.distantes.forEach((d, i) => {
      const k = sai(
        faixa(t, ACENDE + 0.75 + i * 0.24, ACENDE + 1.15 + i * 0.24),
      );
      ar += k * 0.5;
      d.globo.color.setRGB(1, 0.93, 0.82).multiplyScalar(k * 3);
      d.halo.opacity = k * 0.5;
      d.facho.uniforms.uOn.value = k * 0.9;
      d.poca.opacity = k * 0.28;
      if (d.luz) d.luz.intensity = k * 9;
    });
    // o ar do galpão esquenta quando as luzes acendem
    this.nevoa.color.setRGB(0.024, 0.031, 0.039).lerp(QUENTE, clamp(ar / 2.5));
    (this.sc.background as T.Color).copy(this.nevoa.color);
    this.bloom.strength = mix(0.2, mix(0.32, 0.55, faixa(longe, 0.5, 1.4)), on);

    this.comp.render();
  }

  /** Toca do começo (ou do t dado) até o fim e para. */
  tocar(de = 0) {
    cancelAnimationFrame(this.raf);
    this.inicio = performance.now() - de * 1000;
    const passo = () => {
      const t = (performance.now() - this.inicio) / 1000;
      this.quadro(t);
      this.raf = t < DURACAO ? requestAnimationFrame(passo) : 0;
    };
    this.raf = requestAnimationFrame(passo);
  }

  /** Para onde está; `tocar(this.t)` continua dali. */
  pausar() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  destruir() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ro.disconnect();
    this.comp.dispose();
    this.sc.traverse((o) => {
      if (
        o instanceof T.Mesh ||
        o instanceof T.Points ||
        o instanceof T.Sprite
      ) {
        o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => {
          Object.values(m).forEach(
            (v) => v instanceof T.Texture && v.dispose(),
          );
          m.dispose();
        });
      }
    });
    this.spot.map?.dispose();
    this.spot.shadow.map?.dispose();
    this.env.dispose();
    this.rd.dispose();
    this.rd.domElement.remove();
  }
}

export function temWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
