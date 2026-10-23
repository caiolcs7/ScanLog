/**
 * Galpão em 3D: uma estante de dois andares por rua, lado a lado, sobre piso
 * de concreto com faixa amarela. Cada estante tem 12 vagas: as caixas verdes
 * são a parte da rua que já tem preço, as de papelão ainda não têm. Tocar numa
 * estante escolhe a rua e a câmera vai até ela; tocar no piso volta à visão
 * geral. Só desenha quando algo muda (sem laço contínuo, poupa bateria).
 */
import * as T from 'three';

export type RuaResumo = { rua: string; total: number; comPreco: number };

const VAGAS = 6, // por andar
  ANDARES = [0.1, 0.62],
  PASSO = 1.05,
  FUNDO = 2.6,
  CAIXA = { w: 0.34, h: 0.3, d: FUNDO / VAGAS - 0.08 };
const BRANCO = new T.Color(1, 1, 1),
  APAGADO = new T.Color('#8f9598');

const reduzido = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const eIO = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const eOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

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
function concreto() {
  const [c, x] = tela(1024, 1024),
    r = rnd(7);
  x.fillStyle = '#c4c6c3';
  x.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 90; i++) {
    const gx = r() * 1024,
      gy = r() * 1024,
      gr = 30 + r() * 160,
      g = x.createRadialGradient(gx, gy, 0, gx, gy, gr);
    g.addColorStop(
      0,
      r() < 0.5 ? 'rgba(80,82,80,.08)' : 'rgba(255,255,255,.1)',
    );
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 1024, 1024);
  }
  // grão do concreto, pixel a pixel (rápido com ImageData)
  const img = x.getImageData(0, 0, 1024, 1024),
    d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = (r() - 0.5) * 22;
    d[i] += g;
    d[i + 1] += g;
    d[i + 2] += g;
  }
  x.putImageData(img, 0, 0);
  return textura(c);
}
/** Borda que some: o piso termina no fundo da página sem corte. */
function esmaecer() {
  const [c, x] = tela(256, 256),
    g = x.createRadialGradient(128, 128, 20, 128, 128, 128);
  g.addColorStop(0, '#fff');
  g.addColorStop(0.6, '#ccc');
  g.addColorStop(1, '#000');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  return textura(c, false);
}
function papelao() {
  const [c, x] = tela(256, 256),
    r = rnd(11);
  x.fillStyle = '#d2a774';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2200; i++) {
    x.fillStyle = r() < 0.5 ? 'rgba(255,240,215,.1)' : 'rgba(90,55,20,.09)';
    x.fillRect(r() * 256, r() * 256, 1 + r() * 18, 1);
  }
  // fita adesiva no meio da tampa e etiqueta branca na frente
  x.fillStyle = 'rgba(160,110,55,.55)';
  x.fillRect(110, 0, 36, 256);
  x.fillStyle = '#f4f2ec';
  x.fillRect(150, 150, 80, 56);
  x.fillStyle = '#2b2b2b';
  for (let i = 0, p = 158; p < 222; i++) {
    const w = 2 + ((i * 7) % 3) * 2;
    x.fillRect(p, 176, w, 22);
    p += w + 2 + ((i * 5) % 2) * 2;
  }
  return textura(c);
}
function placa(rua: string, ativa: boolean) {
  const [c, x] = tela(256, 128);
  x.fillStyle = ativa ? '#e0560f' : '#f2f2ee';
  x.fillRect(0, 0, 256, 128);
  x.fillStyle = ativa ? '#ffffff' : '#14181b';
  x.font =
    '800 96px "Big Shoulders Stencil Display", Impact, "Arial Narrow", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(rua, 128, 70);
  x.strokeStyle = 'rgba(0,0,0,.25)';
  x.lineWidth = 6;
  x.strokeRect(0, 0, 256, 128);
  return c;
}
function ambiente(rd: T.WebGLRenderer) {
  const sc = new T.Scene(),
    g = new T.BoxGeometry();
  const sala = new T.Mesh(
    g,
    new T.MeshStandardMaterial({ side: T.BackSide, color: 0x9ea3a8 }),
  );
  sala.position.set(0, 9, 0);
  sala.scale.set(30, 22, 30);
  sc.add(sala);
  const luz = new T.PointLight(0xffffff, 700, 30, 2);
  luz.position.set(0, 16, 0);
  sc.add(luz);
  for (const [v, x, y, z, sx, sy, sz] of [
    [60, -14.5, 11, 6, 0.1, 3, 5],
    [30, 14.5, 10, -2, 0.1, 4, 7],
    [90, 0, 19.8, 0, 9, 0.1, 9],
  ]) {
    const m = new T.Mesh(
      g,
      new T.MeshBasicMaterial({ color: new T.Color().setScalar(v) }),
    );
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    sc.add(m);
  }
  const pm = new T.PMREMGenerator(rd),
    tx = pm.fromScene(sc, 0.04).texture;
  pm.dispose();
  return tx;
}

export function temWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export class Galpao {
  private rd: T.WebGLRenderer;
  private sc = new T.Scene();
  private cam = new T.PerspectiveCamera(30, 2, 0.1, 80);
  private papel: T.InstancedMesh; // vagas sem preço: caixa de papelão
  private verde: T.InstancedMesh; // vagas com preço: caixa plástica verde
  private alvos: T.Mesh[] = [];
  private placas: {
    rua: string;
    tx: T.CanvasTexture;
    cv: HTMLCanvasElement;
  }[] = [];
  private ruas: RuaResumo[] = [];
  private sel: string | null = null;
  private viagem: number | null = null; // início da ida da câmera
  private primeiro = true;
  private de = { alvo: new T.Vector3(), pos: new T.Vector3() };
  private para = { alvo: new T.Vector3(), pos: new T.Vector3() };
  private olhar = new T.Vector3();
  private nasceu = performance.now();
  private quadro = 0;
  private ro: ResizeObserver;
  private toque: { x: number; y: number } | null = null;

  constructor(
    private host: HTMLElement,
    ruas: RuaResumo[],
    private escolher: (rua: string | null) => void,
  ) {
    this.rd = new T.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'low-power',
    });
    const rd = this.rd;
    rd.setClearColor(0x000000, 0);
    rd.toneMapping = T.ACESFilmicToneMapping;
    // no modo escuro o galpão claro ofusca: menos exposição e piso mais escuro
    const escuro = matchMedia('(prefers-color-scheme: dark)').matches;
    if (escuro) rd.toneMappingExposure = 0.72;
    rd.shadowMap.enabled = true;
    rd.shadowMap.type = T.PCFShadowMap;
    rd.domElement.className = 'g3d-cv';
    rd.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(rd.domElement);
    this.sc.environment = ambiente(rd);
    this.ruas = ruas;

    const n = ruas.length,
      largura = n * PASSO;
    const M = {
      poste: new T.MeshStandardMaterial({
        color: 0x5d6a78,
        metalness: 0.55,
        roughness: 0.42,
      }),
      viga: new T.MeshPhysicalMaterial({
        color: 0xd9500c,
        metalness: 0.15,
        roughness: 0.42,
        clearcoat: 0.4,
      }),
      deck: new T.MeshStandardMaterial({
        color: 0xb4babe,
        metalness: 0.35,
        roughness: 0.55,
      }),
      papel: new T.MeshStandardMaterial({
        map: papelao(),
        roughness: 0.85,
        envMapIntensity: 0.5,
      }),
      verde: new T.MeshPhysicalMaterial({
        color: 0x1f8a52,
        roughness: 0.45,
        clearcoat: 0.35,
        clearcoatRoughness: 0.4,
        envMapIntensity: 0.6,
      }),
    };

    // Estantes: postes e vigas de todas as ruas viram poucas malhas.
    const postes: T.BufferGeometry[] = [],
      vigas: T.BufferGeometry[] = [],
      decks: T.BufferGeometry[] = [];
    const bloco = (
      lista: T.BufferGeometry[],
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
    ) => {
      const g = new T.BoxGeometry(w, h, d);
      g.translate(x, y, z);
      lista.push(g);
    };
    ruas.forEach((r, i) => {
      const x = (i - (n - 1) / 2) * PASSO;
      for (const sx of [-0.21, 0.21])
        for (const z of [-FUNDO / 2, 0, FUNDO / 2])
          bloco(postes, 0.04, 1.18, 0.04, x + sx, 0.59, z);
      for (const y of ANDARES) {
        for (const sx of [-0.21, 0.21])
          bloco(vigas, 0.035, 0.07, FUNDO, x + sx, y - 0.035, 0);
        bloco(decks, 0.44, 0.018, FUNDO, x, y - 0.009, 0);
      }
      // Alvo invisível do toque: a estante inteira.
      const alvo = new T.Mesh(
        new T.BoxGeometry(PASSO * 0.92, 1.3, FUNDO + 0.9),
        new T.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
      );
      alvo.position.set(x, 0.6, 0.25);
      alvo.userData.rua = r.rua;
      this.alvos.push(alvo);
      this.sc.add(alvo);
      // Placa da rua pintada no piso, na frente da estante.
      const cv = placa(r.rua, false),
        tx = textura(cv);
      const pl = new T.Mesh(
        new T.PlaneGeometry(0.62, 0.31),
        new T.MeshStandardMaterial({ map: tx, roughness: 0.7 }),
      );
      pl.rotation.x = -Math.PI / 2;
      pl.position.set(x, 0.004, FUNDO / 2 + 0.36);
      pl.receiveShadow = true;
      this.sc.add(pl);
      this.placas.push({ rua: r.rua, tx, cv });
    });
    const junta = (gs: T.BufferGeometry[], m: T.Material, sombra = true) => {
      const g = mergeGeometries(gs),
        o = new T.Mesh(g, m);
      o.castShadow = sombra;
      o.receiveShadow = true;
      this.sc.add(o);
    };
    junta(postes, M.poste);
    junta(vigas, M.viga);
    junta(decks, M.deck, false);

    // Caixas: duas malhas instanciadas (papelão e verde), uma vaga cada.
    const g = new T.BoxGeometry(CAIXA.w, CAIXA.h, CAIXA.d);
    g.translate(0, CAIXA.h / 2, 0);
    const vagas = n * VAGAS * ANDARES.length;
    [this.papel, this.verde] = [M.papel, M.verde].map((mat) => {
      const o = new T.InstancedMesh(g, mat, vagas);
      o.castShadow = true;
      o.receiveShadow = true;
      this.sc.add(o);
      return o;
    });

    // Piso e faixa amarela de corredor.
    const piso = new T.Mesh(
      new T.PlaneGeometry(largura + 6, FUNDO + 6),
      new T.MeshStandardMaterial({
        color: escuro ? 0x3c3f3f : 0x7d807c,
        map: concreto(),
        alphaMap: esmaecer(),
        transparent: true,
        roughness: 0.9,
        envMapIntensity: 0.35,
      }),
    );
    piso.rotation.x = -Math.PI / 2;
    piso.position.z = 0.4;
    piso.receiveShadow = true;
    this.sc.add(piso);
    const faixa = new T.Mesh(
      new T.PlaneGeometry(largura + 0.4, 0.06),
      new T.MeshStandardMaterial({ color: 0xf0b000, roughness: 0.7 }),
    );
    faixa.rotation.x = -Math.PI / 2;
    faixa.position.set(0, 0.003, FUNDO / 2 + 0.72);
    this.sc.add(faixa);

    // Luz: sol alto de lado (sombras), luz de frente e contraluz fria.
    this.sc.add(new T.HemisphereLight(0xf4f6ff, 0xa9a296, 0.35));
    const sol = new T.DirectionalLight(0xfff1e0, 1.6);
    sol.position.set(-6, 9, 3);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    sol.shadow.bias = -0.0004;
    sol.shadow.normalBias = 0.02;
    sol.shadow.radius = 3;
    const sh = sol.shadow.camera;
    sh.left = -largura / 2 - 1;
    sh.right = largura / 2 + 1;
    sh.top = FUNDO / 2 + 1.5;
    sh.bottom = -FUNDO / 2 - 1.5;
    sh.near = 1;
    sh.far = 30;
    this.sc.add(sol);
    const frente = new T.DirectionalLight(0xfff8ef, 0.5);
    frente.position.set(-2, 3, 8);
    this.sc.add(frente);
    const contra = new T.DirectionalLight(0xdce6ff, 0.9);
    contra.position.set(4, 4, -6);
    this.sc.add(contra);

    this.pintarCaixas();
    this.tamanho();
    this.enquadrar(false);
    document.fonts?.ready.then(() => {
      this.placas.forEach((p) => this.pintarPlaca(p));
      this.desenhar();
    });

    this.ro = new ResizeObserver(() => {
      this.tamanho();
      this.enquadrar(false);
      this.desenhar();
    });
    this.ro.observe(host);
    this.tamanho();
    const cv = rd.domElement;
    cv.addEventListener('pointerdown', this.aoApertar);
    cv.addEventListener('pointerup', this.aoSoltar);
    cv.addEventListener('pointermove', this.aoPassar);
    this.desenhar();
  }

  /** Novos números (alguém salvou um preço): repinta as caixas. */
  atualizar(ruas: RuaResumo[]) {
    const mudou = ruas.some(
      (r, i) =>
        r.comPreco !== this.ruas[i]?.comPreco ||
        r.total !== this.ruas[i]?.total,
    );
    this.ruas = ruas;
    if (mudou) {
      this.pintarCaixas();
      this.desenhar();
    }
  }

  selecionar(rua: string | null) {
    if (rua === this.sel) return;
    this.sel = rua;
    this.placas.forEach((p) => this.pintarPlaca(p));
    this.pintarCaixas();
    this.enquadrar(!reduzido());
    this.desenhar();
  }

  destruir() {
    cancelAnimationFrame(this.quadro);
    this.ro.disconnect();
    this.sc.traverse((o) => {
      const m = o as T.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        if (!mat) continue;
        for (const v of Object.values(mat))
          if (v instanceof T.Texture) v.dispose();
        mat.dispose();
      }
    });
    this.sc.environment?.dispose();
    this.rd.dispose();
    this.rd.domElement.remove();
  }

  private pintarPlaca(p: {
    rua: string;
    tx: T.CanvasTexture;
    cv: HTMLCanvasElement;
  }) {
    const novo = placa(p.rua, p.rua === this.sel);
    p.cv.getContext('2d')!.drawImage(novo, 0, 0);
    p.tx.needsUpdate = true;
  }

  private pintarCaixas() {
    const n = this.ruas.length,
      m = new T.Matrix4(),
      some = new T.Matrix4().makeScale(0, 0, 0),
      q = new T.Quaternion(),
      e = new T.Euler(),
      s = new T.Vector3(),
      p = new T.Vector3(),
      cor = new T.Color();
    const vagas = VAGAS * ANDARES.length;
    let k = 0;
    this.ruas.forEach((r, i) => {
      const x = (i - (n - 1) / 2) * PASSO,
        sorte = rnd(i * 31 + 5);
      // Vagas ocupadas na proporção dos códigos da rua; as verdes têm preço.
      const ocupadas = r.total
          ? Math.max(1, Math.round(Math.min(1, r.total / 80) * vagas))
          : 0,
        verdes = r.total ? Math.round((r.comPreco / r.total) * ocupadas) : 0;
      cor.copy(BRANCO);
      if (this.sel != null && this.sel !== r.rua) cor.lerp(APAGADO, 0.6);
      for (let v = 0; v < vagas; v++, k++) {
        const andar = v < VAGAS ? 0 : 1,
          z = -FUNDO / 2 + ((v % VAGAS) + 0.5) * (FUNDO / VAGAS);
        p.set(x + (sorte() - 0.5) * 0.04, ANDARES[andar], z);
        q.setFromEuler(e.set(0, (sorte() - 0.5) * 0.08, 0));
        m.compose(p, q, s.setScalar(0.86 + sorte() * 0.14));
        const ehVerde = v < verdes;
        this.verde.setMatrixAt(k, ehVerde ? m : some);
        this.papel.setMatrixAt(k, !ehVerde && v < ocupadas ? m : some);
        this.verde.setColorAt(k, cor);
        this.papel.setColorAt(k, cor);
      }
    });
    for (const o of [this.papel, this.verde]) {
      o.instanceMatrix.needsUpdate = true;
      if (o.instanceColor) o.instanceColor.needsUpdate = true;
    }
  }

  private tamanho() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.rd.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
    this.rd.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
  }

  /** Visão geral cabendo todas as ruas, ou perto da rua escolhida. */
  private enquadrar(animar: boolean) {
    const n = this.ruas.length,
      alvo = new T.Vector3(),
      dir = new T.Vector3(),
      caixa = new T.Box3();
    if (this.sel) {
      const x =
        (this.ruas.findIndex((r) => r.rua === this.sel) - (n - 1) / 2) * PASSO;
      caixa.set(
        new T.Vector3(x - 0.45, 0, -FUNDO / 2 - 0.1),
        new T.Vector3(x + 0.45, 1.15, FUNDO / 2 + 0.55),
      );
      dir.set(0.8, 0.62, 1);
    } else {
      // Tela estreita (celular): vista em diagonal, as ruas somem ao fundo.
      const estreita = this.cam.aspect < 2.3;
      caixa.set(
        new T.Vector3((-n * PASSO) / 2, 0, -FUNDO / 2),
        new T.Vector3((n * PASSO) / 2, 1.15, FUNDO / 2 + 0.55),
      );
      dir.set(estreita ? -1.05 : 0.12, estreita ? 0.7 : 0.6, 1);
    }
    caixa.getCenter(alvo);
    alvo.y = 0.35;
    dir.normalize();
    const pos = alvo
      .clone()
      .addScaledVector(dir, this.distancia(caixa, alvo, dir));
    this.para.alvo.copy(alvo);
    this.para.pos.copy(pos);
    if (!animar || this.primeiro) {
      this.primeiro = false;
      this.viagem = null;
      this.olhar.copy(alvo);
      this.cam.position.copy(pos);
      this.cam.lookAt(alvo);
      return;
    }
    this.de.alvo.copy(this.olhar);
    this.de.pos.copy(this.cam.position);
    this.viagem = performance.now();
  }

  /** Menor distância em que a caixa inteira cabe na tela. */
  private distancia(caixa: T.Box3, alvo: T.Vector3, dir: T.Vector3) {
    const cam = this.cam.clone(),
      cantos = [0, 1, 2, 3, 4, 5, 6, 7].map(
        (i) =>
          new T.Vector3(
            i & 1 ? caixa.max.x : caixa.min.x,
            i & 2 ? caixa.max.y : caixa.min.y,
            i & 4 ? caixa.max.z : caixa.min.z,
          ),
      ),
      p = new T.Vector3();
    const cabe = (d: number) => {
      cam.position.copy(alvo).addScaledVector(dir, d);
      cam.lookAt(alvo);
      cam.updateMatrixWorld();
      return cantos.every((c) => {
        p.copy(c).project(cam);
        return p.z < 1 && Math.abs(p.x) <= 0.96 && Math.abs(p.y) <= 0.86;
      });
    };
    let lo = 0.5,
      hi = 120;
    for (let i = 0; i < 30; i++) {
      const m = (lo + hi) / 2;
      if (cabe(m)) hi = m;
      else lo = m;
    }
    return hi;
  }

  private desenhar = () => {
    if (this.quadro) return;
    this.quadro = requestAnimationFrame(this.passo);
  };

  private passo = (agora: number) => {
    this.quadro = 0;
    let continuar = false;
    if (this.viagem != null) {
      const k = Math.min(1, (agora - this.viagem) / 900),
        e = eIO(k);
      this.olhar.lerpVectors(this.de.alvo, this.para.alvo, e);
      this.cam.position.lerpVectors(this.de.pos, this.para.pos, e);
      this.cam.lookAt(this.olhar);
      if (k < 1) continuar = true;
      else this.viagem = null;
    }
    // Abertura: as caixas sobem para as vagas uma vez, ao carregar.
    const abertura = reduzido()
      ? 1
      : eOut(Math.min(1, (agora - this.nasceu) / 1400));
    for (const o of [this.papel, this.verde]) {
      o.position.y = (1 - abertura) * 0.5;
      o.scale.y = 0.3 + 0.7 * abertura;
    }
    if (abertura < 1) continuar = true;
    this.rd.render(this.sc, this.cam);
    if (continuar) this.desenhar();
  };

  private raio(ev: PointerEvent) {
    const r = this.rd.domElement.getBoundingClientRect(),
      v = new T.Vector2(
        ((ev.clientX - r.left) / r.width) * 2 - 1,
        -((ev.clientY - r.top) / r.height) * 2 + 1,
      ),
      ray = new T.Raycaster();
    ray.setFromCamera(v, this.cam);
    const hit = ray.intersectObjects(this.alvos, false)[0];
    return hit ? (hit.object.userData.rua as string) : null;
  }
  private aoApertar = (ev: PointerEvent) => {
    this.toque = { x: ev.clientX, y: ev.clientY };
  };
  private aoSoltar = (ev: PointerEvent) => {
    const t = this.toque;
    this.toque = null;
    if (!t || Math.hypot(ev.clientX - t.x, ev.clientY - t.y) > 8) return;
    const rua = this.raio(ev);
    this.escolher(rua && rua !== this.sel ? rua : null);
  };
  private aoPassar = (ev: PointerEvent) => {
    if (ev.pointerType !== 'mouse') return;
    this.rd.domElement.style.cursor = this.raio(ev) ? 'pointer' : '';
  };
}

/** Junta várias geometrias sem índice numa só (menos chamadas de desenho). */
function mergeGeometries(gs: T.BufferGeometry[]) {
  const partes = gs.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of partes) n += g.attributes.position.array.length;
  const pos = new Float32Array(n),
    nor = new Float32Array(n);
  let o = 0;
  for (const g of partes) {
    pos.set(g.attributes.position.array as Float32Array, o);
    nor.set(g.attributes.normal.array as Float32Array, o);
    o += g.attributes.position.array.length;
    g.dispose();
  }
  const m = new T.BufferGeometry();
  m.setAttribute('position', new T.BufferAttribute(pos, 3));
  m.setAttribute('normal', new T.BufferAttribute(nor, 3));
  return m;
}
