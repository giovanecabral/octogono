// Palco da luta em 3D: octógono, luz de arena, plateia escura e câmera de transmissão.
import * as THREE from "./vendor/three.module.js";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";

const RAIO = 4.6;           // raio do octógono (até o meio da grade), em metros
export { RAIO };

function texturaLona() {
  const s = 1024, cv = document.createElement("canvas"); cv.width = cv.height = s;
  const c = cv.getContext("2d");
  const g = c.createRadialGradient(s / 2, s / 2, 40, s / 2, s / 2, s * 0.62);
  g.addColorStop(0, "#3b3f4a"); g.addColorStop(1, "#23262e");
  c.fillStyle = g; c.fillRect(0, 0, s, s);
  // textura de lona
  for (let i = 0; i < 26000; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`; c.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
  // linha vermelha do octógono, perto da grade
  const oct = (r) => { c.beginPath(); for (let k = 0; k <= 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4, x = s / 2 + Math.cos(a) * r, y = s / 2 + Math.sin(a) * r; k ? c.lineTo(x, y) : c.moveTo(x, y); } };
  oct(s * 0.455); c.strokeStyle = "rgba(215,38,30,.85)"; c.lineWidth = 7; c.stroke();
  oct(s * 0.12); c.strokeStyle = "rgba(242,238,230,.10)"; c.lineWidth = 4; c.stroke();
  // símbolo no centro: anel cortado por um golpe vermelho
  c.save(); c.translate(s / 2, s / 2); c.globalAlpha = 0.16;
  c.strokeStyle = "#f2eee6"; c.lineWidth = 26; oct(0); c.beginPath();
  for (let k = 0; k <= 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4, x = Math.cos(a) * 92, y = Math.sin(a) * 92; k ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.stroke(); c.globalAlpha = 0.32; c.strokeStyle = "#d7261e"; c.lineWidth = 18;
  c.beginPath(); c.moveTo(-70, 95); c.lineTo(70, -95); c.stroke(); c.restore();
  // escrita
  c.fillStyle = "rgba(242,238,230,.12)"; c.font = "700 54px 'Arial Narrow', Arial, sans-serif"; c.textAlign = "center";
  c.fillText("OCTÓGONO", s / 2, s * 0.78);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1;   // a geometria espelha; desespelha a escrita
  return t;
}
function texturaGrade() {
  const s = 256, cv = document.createElement("canvas"); cv.width = cv.height = s;
  const c = cv.getContext("2d"); c.clearRect(0, 0, s, s);
  c.strokeStyle = "rgba(20,20,22,1)"; c.lineWidth = 7;
  for (let i = -s; i < s * 2; i += 32) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + s, s); c.stroke(); c.beginPath(); c.moveTo(i + s, 0); c.lineTo(i, s); c.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 4); t.anisotropy = 8;
  return t;
}

export class Palco {
  constructor(alvo) {
    this.alvo = alvo;
    const r = this.r = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 700 ? 1.5 : 2));   // celular: menos pixel, mais quadro por segundo
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.95;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    alvo.appendChild(r.domElement);

    const cena = this.cena = new THREE.Scene();
    cena.background = new THREE.Color(0x07080b);
    cena.fog = new THREE.Fog(0x07080b, 9, 26);
    const pm = new THREE.PMREMGenerator(r);
    cena.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    cena.environmentIntensity = 0.35;

    this.cam = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
    this.montarOctogono();
    this.montarLuz();
    this.montarPlateia();
    this.flashes = [];
    this.tremor = 0;
    this.chute = 0;   // soco de câmera: fecha o zoom por um instante nos golpes fortes
    this.camAlvo = { pos: new THREE.Vector3(0, 2.4, 7), olhar: new THREE.Vector3(0, 1.1, 0), fov: 38 };
    this.camOlhar = new THREE.Vector3(0, 1.1, 0);
    this.redimensionar();
    // o palco mora dentro da tela da luta: muda de tamanho com ela, não só com a janela
    this.obs = typeof ResizeObserver === "function" ? new ResizeObserver(() => this.redimensionar()) : null;
    if (this.obs) this.obs.observe(alvo); else addEventListener("resize", this.aoMudar = () => this.redimensionar());
  }

  destruir() {
    if (this.obs) this.obs.disconnect(); else removeEventListener("resize", this.aoMudar);
    this.cena.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      for (const m of [].concat(o.material || [])) { for (const v of Object.values(m)) if (v && v.isTexture) v.dispose(); m.dispose(); }
    });
    this.r.dispose(); this.r.forceContextLoss();
    this.r.domElement.remove();
  }

  redimensionar() {
    const w = Math.max(1, this.alvo.clientWidth), h = Math.max(1, this.alvo.clientHeight);
    this.r.setSize(w, h, false);
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    this.retrato = h > w;
  }

  montarOctogono() {
    const cena = this.cena;
    // lona
    const lona = new THREE.Mesh(new THREE.CircleGeometry(RAIO + 0.2, 8), new THREE.MeshStandardMaterial({ map: texturaLona(), roughness: 0.92 }));
    lona.rotation.x = -Math.PI / 2; lona.rotation.z = Math.PI / 8; lona.receiveShadow = true; cena.add(lona);
    // base preta em volta
    const base = new THREE.Mesh(new THREE.CylinderGeometry(RAIO + 0.9, RAIO + 1.1, 0.9, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.8, side: THREE.DoubleSide }));
    base.position.y = -0.45; base.rotation.y = Math.PI / 8; cena.add(base);
    const aba = new THREE.Mesh(new THREE.RingGeometry(RAIO + 0.2, RAIO + 0.95, 8), new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.7 }));
    aba.rotation.x = -Math.PI / 2; aba.rotation.z = Math.PI / 8; aba.position.y = 0.002; cena.add(aba);
    // postes, grade e acolchoado
    const altura = 1.75, matPoste = new THREE.MeshStandardMaterial({ color: 0x111215, roughness: 0.45, metalness: 0.2 });
    const matAcolch = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.55 });
    const matGrade = new THREE.MeshStandardMaterial({ alphaMap: texturaGrade(), transparent: true, color: 0x1a1b1f, side: THREE.DoubleSide, depthWrite: false, roughness: 0.6, metalness: 0.4 });
    this.pedacos = [];
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, a2 = a + Math.PI / 4;
      const p = new THREE.Vector3(Math.cos(a) * RAIO, 0, Math.sin(a) * RAIO), p2 = new THREE.Vector3(Math.cos(a2) * RAIO, 0, Math.sin(a2) * RAIO);
      const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, altura + 0.1, 12), matAcolch);
      poste.position.copy(p).setY((altura + 0.1) / 2); poste.castShadow = true; cena.add(poste);
      const meio = p.clone().add(p2).multiplyScalar(0.5), larg = p.distanceTo(p2);
      const grade = new THREE.Mesh(new THREE.PlaneGeometry(larg, altura - 0.1), matGrade);
      grade.position.copy(meio).setY(altura / 2 + 0.05); grade.lookAt(0, grade.position.y, 0); cena.add(grade);
      const topo = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, larg, 10), matAcolch);
      topo.position.copy(meio).setY(altura + 0.02); topo.lookAt(p2.x, altura + 0.02, p2.z); topo.rotateX(Math.PI / 2); cena.add(topo);
      const pe = new THREE.Mesh(new THREE.BoxGeometry(larg, 0.16, 0.12), matPoste);
      pe.position.copy(meio).setY(0.08); pe.lookAt(0, 0.08, 0); cena.add(pe);
      this.pedacos.push({ objs: [grade, topo, pe], pos: meio.clone() }, { objs: [poste], pos: p.clone() });
    }
  }

  montarLuz() {
    const cena = this.cena;
    cena.add(new THREE.HemisphereLight(0x8890a8, 0x16110f, 0.55));
    const chave = new THREE.SpotLight(0xfffaf2, 250, 22, Math.PI / 5.2, 0.55, 1.6);
    chave.position.set(0.6, 9.5, 1.2); chave.target.position.set(0, 0, 0);
    chave.castShadow = true; chave.shadow.mapSize.set(1024, 1024); chave.shadow.bias = -0.0004; chave.shadow.radius = 4;
    chave.shadow.camera.near = 4; chave.shadow.camera.far = 14;
    cena.add(chave, chave.target);
    // contraluz colorida dos cantos (vermelho e azul de transmissão)
    const rim1 = new THREE.SpotLight(0xff3a2e, 22, 16, Math.PI / 6, 0.7, 1.5); rim1.position.set(-6, 4.5, -5); rim1.target.position.set(0, 1, 0);
    const rim2 = new THREE.SpotLight(0x4a7dff, 24, 16, Math.PI / 6, 0.7, 1.5); rim2.position.set(6, 4.5, -5); rim2.target.position.set(0, 1, 0);
    const frente = new THREE.DirectionalLight(0xffe8d0, 0.35); frente.position.set(0, 3, 8);
    // luz de preenchimento que acompanha a câmera (como a da transmissão): o rosto não some na sombra
    this.preenche = new THREE.DirectionalLight(0xfff1e6, 0.7); cena.add(this.preenche, this.preenche.target);
    cena.add(rim1, rim1.target, rim2, rim2.target, frente);
    // rack de luz em cima
    const rack = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.12, 5.5), new THREE.MeshStandardMaterial({ color: 0x0b0c0f, emissive: 0x000000 }));
    rack.position.y = 9.8; cena.add(rack);
    const painelMat = new THREE.MeshBasicMaterial({ color: 0xfff4e0 });
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j += 4) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), painelMat); p.rotation.x = Math.PI / 2; p.position.set(i * 1.1, 9.72, j * 1.1); cena.add(p);
    }
  }

  montarPlateia() {
    // plateia: arquibancada escura com luzinhas (flash de celular) que piscam
    const n = 900, pos = new Float32Array(n * 3), fase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = 7.5 + Math.random() * 12, y = 0.6 + (d - 7.5) * 0.42 + Math.random() * 0.6;
      pos[i * 3] = Math.cos(a) * d; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(a) * d; fase[i] = Math.random() * 100;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("fase", new THREE.BufferAttribute(fase, 1));
    this.matPlateia = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { tempo: { value: 0 }, px: { value: Math.min(devicePixelRatio, 2) } },
      vertexShader: `attribute float fase; uniform float tempo; uniform float px; varying float b;
        void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv;
          float pisca=step(0.985,fract(sin(floor(tempo*3.+fase)*12.9898)*43758.5)); b=0.18+pisca*0.9;
          gl_PointSize=(2.2+pisca*3.)*px*(14./-mv.z); }`,
      fragmentShader: `varying float b; void main(){ float d=length(gl_PointCoord-.5); if(d>.5) discard; gl_FragColor=vec4(vec3(1.,.93,.82)*b*(1.-d*2.),1.); }`,
    });
    this.cena.add(new THREE.Points(g, this.matPlateia));
    // degraus escuros
    const deg = new THREE.Mesh(new THREE.CylinderGeometry(19, 8, 7, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x0a0b0e, side: THREE.BackSide, roughness: 1 }));
    deg.position.y = 2.6; this.cena.add(deg);
  }

  /* impacto: respingo de suor saindo do ponto de contato, na direção do golpe, e tremor */
  impactoFx(pos, dir, forca = 1) {
    if (!this.texGota) {
      const cv = document.createElement("canvas"); cv.width = cv.height = 32; const c = cv.getContext("2d");
      const g = c.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, "rgba(255,255,255,.95)"); g.addColorStop(0.5, "rgba(230,236,245,.5)"); g.addColorStop(1, "rgba(230,236,245,0)");
      c.fillStyle = g; c.fillRect(0, 0, 32, 32); this.texGota = new THREE.CanvasTexture(cv);
    }
    const n = Math.round(10 + 14 * Math.min(2, forca));
    for (let i = 0; i < n; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texGota, transparent: true, depthWrite: false, opacity: 0.85 }));
      m.position.copy(pos); const t = 0.012 + Math.random() * 0.022; m.scale.setScalar(t);
      const v = dir.clone().multiplyScalar(1.2 + Math.random() * 1.6 * forca).add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 0.4 + Math.random() * 1.2, (Math.random() - 0.5) * 1.6));
      this.cena.add(m); this.flashes.push({ m, v, t: 0, vida: 0.35 + Math.random() * 0.35 });
    }
    this.tremor = Math.max(this.tremor, 0.012 * forca * forca + 0.008);
  }

  /* câmera: vai suave até o alvo; tremor nos golpes fortes */
  quadro(dt, tempo) {
    for (const f of this.flashes.slice()) {
      f.t += dt; f.v.y -= 9.8 * dt; f.m.position.addScaledVector(f.v, dt);
      f.m.material.opacity = Math.max(0, 0.85 * (1 - f.t / f.vida));
      if (f.t >= f.vida || f.m.position.y < 0.01) { this.cena.remove(f.m); f.m.material.dispose(); this.flashes.splice(this.flashes.indexOf(f), 1); }
    }
    this.matPlateia.uniforms.tempo.value = tempo;
    const a = this.camAlvo, s = 1 - Math.exp(-dt * (a.rapido ? 9 : 2.4));
    if (!this.iniciado) { this.iniciado = true; this.cam.position.copy(a.pos); this.camOlhar.copy(a.olhar); }
    this.cam.position.lerp(a.pos, s);
    this.camOlhar.lerp(a.olhar, 1 - Math.exp(-dt * (a.rapido ? 10 : 3.2)));
    this.cam.fov += ((this.retrato ? Math.min(66, a.fov * 1.55) : a.fov) - this.cam.fov) * s; if (this.chute > 0.05) { this.cam.fov -= this.chute * dt * 14; this.chute *= Math.exp(-dt * 7); }
    this.cam.updateProjectionMatrix();
    this.cam.lookAt(this.camOlhar);
    this.preenche.position.copy(this.cam.position).add(new THREE.Vector3(0, 1.2, 0)); this.preenche.target.position.copy(this.camOlhar);
    // grade entre a câmera e a luta some (como câmera de lado da grade)
    const cx = this.cam.position.x, cz = this.cam.position.z;
    for (const pd of this.pedacos) { const d = Math.hypot(pd.pos.x - cx, pd.pos.z - cz); for (const o of pd.objs) o.visible = d > 2.4; }
    if (this.tremor > 0.0005) {
      this.cam.position.x += (Math.random() - 0.5) * this.tremor; this.cam.position.y += (Math.random() - 0.5) * this.tremor;
      this.tremor *= Math.exp(-dt * 9);
    }
    this.r.render(this.cena, this.cam);
  }
}
