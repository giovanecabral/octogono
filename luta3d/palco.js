// Palco da luta em 3D: o octógono numa arena de verdade. Plataforma, mesas da
// beira, arquibancada em degraus com a torcida (que levanta nos momentos
// fortes), treliça de luz, telões com o round e os nomes, faixa de LED e câmera
// de transmissão. Feito pra rodar leve no celular (sem pós-processamento,
// torcida em poucos triângulos, poucas luzes): o dono achou pesado e brilhante
// demais com bloom, feixes e 3.800 torcedores.
import * as THREE from "./vendor/three.module.js";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";
import { mergeGeometries } from "./vendor/BufferGeometryUtils.js";


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

/* LED da faixa em volta da arquibancada: listras que correm (a textura desliza no quadro) */
function texturaFaixa() {
  const w = 1024, h = 64, cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const c = cv.getContext("2d");
  c.fillStyle = "#07080b"; c.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 128) {
    c.fillStyle = "#d7261e"; c.beginPath(); c.moveTo(x, h); c.lineTo(x + 40, 0); c.lineTo(x + 70, 0); c.lineTo(x + 30, h); c.fill();
    c.fillStyle = "rgba(242,238,230,.85)"; c.fillRect(x + 84, 26, 30, 12);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.x = 18;
  return t;
}
/* saia da plataforma do octógono: preta com um filete vermelho em cima */
function texturaSaia() {
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 128;
  const c = cv.getContext("2d");
  const g = c.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, "#15171d"); g.addColorStop(1, "#08090c");
  c.fillStyle = g; c.fillRect(0, 0, 256, 128);
  c.fillStyle = "#d7261e"; c.fillRect(0, 6, 256, 7);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.x = 8;
  return t;
}

/* uma pessoa sentada da plateia: corpo (pernas e tronco) e cabeça em malhas separadas,
   pra cabeça ter cor de pele e o corpo a cor da roupa */
function geometriaTorcedor() {
  const tronco = new THREE.BoxGeometry(0.42, 0.52, 0.24); tronco.translate(0, 0.72, 0);
  const pernas = new THREE.BoxGeometry(0.38, 0.16, 0.44); pernas.translate(0, 0.45, 0.16);
  const canelas = new THREE.BoxGeometry(0.34, 0.42, 0.14); canelas.translate(0, 0.21, 0.36);
  const corpo = mergeGeometries([tronco, pernas, canelas]);
  const cabeca = new THREE.IcosahedronGeometry(0.11, 0); cabeca.scale(1, 1.15, 1); cabeca.translate(0, 1.11, 0.01);
  return { corpo, cabeca };
}

export class Palco {
  constructor(alvo) {
    this.alvo = alvo;
    const r = this.r = new THREE.WebGLRenderer({ antialias: devicePixelRatio < 1.5, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 700 ? 1.25 : 1.5));   // menos pixel, mais quadro por segundo
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.9;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    alvo.appendChild(r.domElement);

    const cena = this.cena = new THREE.Scene();
    cena.background = new THREE.Color(0x05060a);
    cena.fog = new THREE.Fog(0x0a0d17, 11, 44);
    const pm = new THREE.PMREMGenerator(r);
    cena.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    cena.environmentIntensity = 0.3;

    this.cam = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
    this.agitacao = 0; this.nivel = 0;
    this.montarOctogono();
    this.montarLuz();
    this.montarArena();
    this.montarTeloes();
    this.flashes = [];
    this.tremor = 0;
    this.chute = 0;   // soco de câmera: fecha o zoom por um instante nos golpes fortes
    this.camAlvo = { pos: new THREE.Vector3(0, 2.4, 7), olhar: new THREE.Vector3(0, 1.1, 0), fov: 38 };
    this.camOlhar = new THREE.Vector3(0, 1.1, 0);
    this.redimensionar();
    // navegador desenhando sem a placa de vídeo (aceleração de hardware desligada): começa no mais leve
    try {
      const gl = r.getContext(), ext = gl.getExtension("WEBGL_debug_renderer_info");
      this.placa = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "") : "";
    } catch (e) { this.placa = ""; }
    this.semPlaca = /swiftshader|llvmpipe|software|basic render/i.test(this.placa);
    if (this.semPlaca) for (const n of [1, 2, 3]) this.qualidade(n);
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
    // lona (o octógono fica numa plataforma 1,25 m acima do chão da arena)
    const lona = new THREE.Mesh(new THREE.CircleGeometry(RAIO + 0.2, 8), new THREE.MeshStandardMaterial({ map: texturaLona(), roughness: 0.92 }));
    lona.rotation.x = -Math.PI / 2; lona.rotation.z = Math.PI / 8; lona.receiveShadow = true; cena.add(lona);
    const aba = new THREE.Mesh(new THREE.RingGeometry(RAIO + 0.2, RAIO + 1.25, 8), new THREE.MeshStandardMaterial({ color: 0x121419, roughness: 0.6 }));
    aba.rotation.x = -Math.PI / 2; aba.rotation.z = Math.PI / 8; aba.position.y = 0.002; aba.receiveShadow = true; cena.add(aba);
    const saia = new THREE.Mesh(new THREE.CylinderGeometry(RAIO + 1.25, RAIO + 1.25, 1.25, 8, 1, true), new THREE.MeshStandardMaterial({ map: texturaSaia(), roughness: 0.7 }));
    saia.position.y = -0.625; saia.rotation.y = Math.PI / 8; cena.add(saia);
    // escada da entrada dos lutadores
    const matDegrau = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.6 });
    for (let i = 0; i < 4; i++) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.31, 0.34), matDegrau);
      d.position.set(0, -1.25 + 0.155 + i * 0.31, RAIO + 1.25 + 0.17 + (3 - i) * 0.34); cena.add(d);
    }
    // postes, grade e acolchoado; um canto vermelho e um azul, como na transmissão
    const altura = 1.75, matPoste = new THREE.MeshStandardMaterial({ color: 0x111215, roughness: 0.45, metalness: 0.2 });
    const matAcolch = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.55 });
    const matCanto = { 0: new THREE.MeshStandardMaterial({ color: 0x9c1a14, roughness: 0.5 }), 4: new THREE.MeshStandardMaterial({ color: 0x1d3a8a, roughness: 0.5 }) };
    const matGrade = new THREE.MeshStandardMaterial({ alphaMap: texturaGrade(), transparent: true, color: 0x1a1b1f, side: THREE.DoubleSide, depthWrite: false, roughness: 0.6, metalness: 0.4 });
    this.pedacos = [];
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, a2 = a + Math.PI / 4;
      const p = new THREE.Vector3(Math.cos(a) * RAIO, 0, Math.sin(a) * RAIO), p2 = new THREE.Vector3(Math.cos(a2) * RAIO, 0, Math.sin(a2) * RAIO);
      const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, altura + 0.1, 12), matCanto[k] || matAcolch);
      poste.position.copy(p).setY((altura + 0.1) / 2); cena.add(poste);
      const meio = p.clone().add(p2).multiplyScalar(0.5), larg = p.distanceTo(p2);
      const grade = new THREE.Mesh(new THREE.PlaneGeometry(larg, altura - 0.1), matGrade);
      grade.position.copy(meio).setY(altura / 2 + 0.05); grade.lookAt(0, grade.position.y, 0); cena.add(grade);
      const topo = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, larg, 10), matAcolch);
      topo.position.copy(meio).setY(altura + 0.02); topo.lookAt(p2.x, altura + 0.02, p2.z); topo.rotateX(Math.PI / 2); cena.add(topo);
      const pe = new THREE.Mesh(new THREE.BoxGeometry(larg, 0.16, 0.12), matPoste);
      pe.position.copy(meio).setY(0.08); pe.lookAt(0, 0.08, 0); cena.add(pe);
      this.pedacos.push({ objs: [grade, topo, pe], pos: meio.clone() }, { objs: [poste], pos: p.clone() });
    }
  }

  montarLuz() {
    const cena = this.cena;
    cena.add(new THREE.HemisphereLight(0x6f7a9c, 0x120d0b, 0.42));
    // luz principal de cima, branca e forte como a da transmissão; só ela faz sombra
    const chave = new THREE.SpotLight(0xfff6ea, 240, 24, Math.PI / 4.2, 0.55, 1.5);
    chave.position.set(0.6, 9.2, 1.2); chave.target.position.set(0, 0, 0);
    chave.castShadow = true; chave.shadow.mapSize.set(1024, 1024); chave.shadow.bias = -0.0004; chave.shadow.radius = 4;
    chave.shadow.camera.near = 4; chave.shadow.camera.far = 14;
    cena.add(chave, chave.target);
    // contraluz colorida (vermelho e azul de transmissão)
    const rim1 = new THREE.SpotLight(0xff3a2e, 26, 18, Math.PI / 6, 0.7, 1.5); rim1.position.set(-6, 4.5, -5); rim1.target.position.set(0, 1, 0);
    const rim2 = new THREE.SpotLight(0x4a7dff, 28, 18, Math.PI / 6, 0.7, 1.5); rim2.position.set(6, 4.5, -5); rim2.target.position.set(0, 1, 0);
    // canhão que segue o lutador na entrada (fora do octógono a arena é escura); desligado na luta
    this.seguidor = new THREE.SpotLight(0xfff2e0, 0, 16, Math.PI / 14, 0.5, 1.4); this.seguidor.position.set(0, 9, 12);
    cena.add(this.seguidor, this.seguidor.target);
    // luz de preenchimento que acompanha a câmera: o rosto não some na sombra
    this.preenche = new THREE.DirectionalLight(0xfff1e6, 0.6); cena.add(this.preenche, this.preenche.target);
    cena.add(rim1, rim1.target, rim2, rim2.target);

    // estrutura de luz em cima do octógono: treliça octogonal com refletores apontados pra lona
    const matTrelica = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.5, metalness: 0.6 });
    const matLente = new THREE.MeshBasicMaterial({ color: 0xfff3dc, toneMapped: false });
    const matCorpo = new THREE.MeshStandardMaterial({ color: 0x0d0e11, roughness: 0.5, metalness: 0.4 });
    const RT = 3.4, YT = 8.6;
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4 + Math.PI / 8, a2 = a + Math.PI / 4;
      const p = new THREE.Vector3(Math.cos(a) * RT, YT, Math.sin(a) * RT), p2 = new THREE.Vector3(Math.cos(a2) * RT, YT, Math.sin(a2) * RT);
      const viga = new THREE.Mesh(new THREE.BoxGeometry(p.distanceTo(p2), 0.28, 0.28), matTrelica);
      viga.position.copy(p).add(p2).multiplyScalar(0.5); viga.lookAt(0, YT, 0); viga.rotateY(Math.PI / 2); cena.add(viga);
      // um refletor por lado
      for (const u of [0.5]) {
        const q = p.clone().lerp(p2, u).setY(YT - 0.3);
        const alvo = q.clone().multiplyScalar(0.25).setY(0);
        const corpo = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.36, 12), matCorpo);
        corpo.position.copy(q); corpo.lookAt(alvo); corpo.rotateX(Math.PI / 2); cena.add(corpo);
        const lente = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), matLente);
        lente.position.copy(q).addScaledVector(alvo.clone().sub(q).normalize(), 0.19); lente.lookAt(q); lente.rotateY(Math.PI); cena.add(lente);
      }
    }
    // cabos subindo pro teto
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4, cabo = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 10, 4), matTrelica);
      cabo.position.set(Math.cos(a) * RT, YT + 5, Math.sin(a) * RT); cena.add(cabo);
    }
  }

  montarArena() {
    const cena = this.cena, CHAO = -1.25;
    // chão da arena: escuro e polido (as luzes riscam reflexo nele)
    const chao = new THREE.Mesh(new THREE.CircleGeometry(70, 64), new THREE.MeshStandardMaterial({ color: 0x0a0b0f, roughness: 0.32, metalness: 0.25 }));
    chao.rotation.x = -Math.PI / 2; chao.position.y = CHAO; cena.add(chao);
    // mesas da beira do octógono (comentaristas e juízes), com a tela dos computadores acesa
    const matMesa = new THREE.MeshStandardMaterial({ color: 0x101217, roughness: 0.5 });
    const matFrente = new THREE.MeshStandardMaterial({ color: 0x15171d, roughness: 0.6, emissive: 0x2a0806, emissiveIntensity: 0.6 });
    const matTela = new THREE.MeshBasicMaterial({ color: 0x9fc3ff, toneMapped: false });
    this.assentos = [];
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4 + Math.PI / 8;
      const rM = RAIO + 2.1, x = Math.cos(a) * rM, z = Math.sin(a) * rM;
      const mesa = new THREE.Group(); mesa.position.set(x, CHAO, z); mesa.lookAt(0, CHAO, 0);
      const tampo = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 0.75), matMesa); tampo.position.y = 0.76; mesa.add(tampo);
      const frente = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.72, 0.04), matFrente); frente.position.set(0, 0.38, 0.36); mesa.add(frente);
      for (const u of [-0.8, 0, 0.8]) {
        const tela = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.22), matTela); tela.position.set(u, 0.92, -0.05); tela.rotation.x = -0.25; tela.rotation.y = Math.PI; mesa.add(tela);
        const lugar = new THREE.Vector3(u, 0, -0.55).applyMatrix4(new THREE.Matrix4().makeRotationY(mesa.rotation.y)).add(mesa.position);
        this.assentos.push({ pos: lugar.setY(CHAO), olha: 0 });
      }
      cena.add(mesa);
    }
    // cadeiras no chão da arena (as primeiras fileiras) e a arquibancada em degraus
    const PASSO = 1.25, FILEIRAS = 11;
    const sobe = (r) => (r < 11.6 ? CHAO : CHAO + 1.45 + (r - 11.6) * 0.7);
    for (let rr = RAIO + 4.2; rr < 11.0; rr += 1.3) this.fileira(rr, CHAO, 0.8, 0.12);
    const perfil = [new THREE.Vector2(11.4, CHAO), new THREE.Vector2(11.4, CHAO + 1.45)];
    let r0 = 11.6;
    for (let i = 0; i < FILEIRAS; i++) {
      const y = sobe(r0);
      perfil.push(new THREE.Vector2(r0, y), new THREE.Vector2(r0 + PASSO, y), new THREE.Vector2(r0 + PASSO, sobe(r0 + PASSO)));
      this.fileira(r0 + 0.5, y, 0.82, 0.14);
      r0 += PASSO;
    }
    perfil.push(new THREE.Vector2(r0, sobe(r0) + 3), new THREE.Vector2(r0 + 6, sobe(r0) + 3));
    const degraus = new THREE.Mesh(new THREE.LatheGeometry(perfil, 48), new THREE.MeshLambertMaterial({ color: 0x0e1015, side: THREE.DoubleSide }));
    cena.add(degraus);
    // parede da primeira fileira com a faixa de LED que corre
    this.texFaixa = texturaFaixa();
    const faixa = new THREE.Mesh(new THREE.CylinderGeometry(11.38, 11.38, 0.5, 48, 1, true), new THREE.MeshBasicMaterial({ map: this.texFaixa, side: THREE.BackSide, toneMapped: false }));
    faixa.position.y = CHAO + 1.1; cena.add(faixa);
    // luzinhas dos corredores da arquibancada
    const matLuz = new THREE.MeshBasicMaterial({ color: 0x7fa0ff, toneMapped: false });
    const geoLuz = new THREE.BoxGeometry(0.06, 0.03, 0.06), luzes = new THREE.InstancedMesh(geoLuz, matLuz, 12 * FILEIRAS);
    const m = new THREE.Matrix4(); let n = 0;
    for (let s = 0; s < 12; s++) {
      const a = s * Math.PI / 6;
      for (let i = 0; i < FILEIRAS; i++) { const rr = 11.6 + i * PASSO + 0.1; m.makeTranslation(Math.cos(a) * rr, sobe(11.6 + i * PASSO) + 0.03, Math.sin(a) * rr); luzes.setMatrixAt(n++, m); }
    }
    cena.add(luzes);
    this.montarPlateia();
  }

  /* uma fileira de lugares em volta do octógono; corredores a cada 30 graus */
  fileira(raio, y, passo, falta) {
    const nAng = Math.floor((2 * Math.PI * raio) / passo);
    for (let i = 0; i < nAng; i++) {
      const a = (i + 0.5) * (2 * Math.PI / nAng), setor = (a % (Math.PI / 6)) * raio;
      if (setor < 0.7 || Math.random() < falta) continue;   // corredor e lugar vazio
      if (Math.sin(a) > 0 && Math.abs(Math.cos(a) * raio) < 1.3) continue;   // corredor da entrada (os lutadores vêm por +z)
      this.assentos.push({ pos: new THREE.Vector3(Math.cos(a) * raio, y, Math.sin(a) * raio), olha: 0 });
    }
  }

  montarPlateia() {
    const { corpo, cabeca } = geometriaTorcedor(), n = this.assentos.length;
    const matCorpo = new THREE.MeshLambertMaterial(), matCabeca = new THREE.MeshLambertMaterial({ flatShading: true });
    this.torcida = { corpo: new THREE.InstancedMesh(corpo, matCorpo, n), cabeca: new THREE.InstancedMesh(cabeca, matCabeca, n), fase: new Float32Array(n), base: [] };
    const ROUPA = [0x0e1014, 0x14171e, 0x1a1d24, 0x22252c, 0x2a0a08, 0x46110d, 0x101c3a, 0x4a4d55, 0x5e5b55, 0x14291e];
    const PELE = [0x9c7a60, 0x8a6244, 0x6e482c, 0x55361f, 0x3a2414, 0xa88a72];
    const cor = new THREE.Color(), mt = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    this.assentos.forEach((s, i) => {
      const ang = Math.atan2(-s.pos.x, -s.pos.z) + (Math.random() - 0.5) * 0.5;   // de frente pro octógono, cada um de um jeito
      const esc = 0.9 + Math.random() * 0.2;
      s.pos.x += (Math.random() - 0.5) * 0.1; s.pos.z += (Math.random() - 0.5) * 0.1;
      q.setFromAxisAngle(up, ang); e.set(esc, esc, esc);
      mt.compose(s.pos, q, e);
      this.torcida.base.push({ p: s.pos.clone(), q: q.clone(), e: esc });
      this.torcida.corpo.setMatrixAt(i, mt); this.torcida.cabeca.setMatrixAt(i, mt);
      this.torcida.corpo.setColorAt(i, cor.setHex(ROUPA[Math.floor(Math.random() * ROUPA.length)]));
      this.torcida.cabeca.setColorAt(i, cor.setHex(PELE[Math.floor(Math.random() * PELE.length)]));
      this.torcida.fase[i] = Math.random() * 100;
    });
    this.cena.add(this.torcida.corpo, this.torcida.cabeca);
    // flash de celular na mão de uma parte da plateia
    const nf = Math.min(350, n), pos = new Float32Array(nf * 3), fase = new Float32Array(nf);
    for (let i = 0; i < nf; i++) {
      const s = this.assentos[Math.floor(Math.random() * n)].pos;
      pos[i * 3] = s.x * 0.985; pos[i * 3 + 1] = s.y + 1.25; pos[i * 3 + 2] = s.z * 0.985; fase[i] = Math.random() * 100;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("fase", new THREE.BufferAttribute(fase, 1));
    this.matPlateia = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { tempo: { value: 0 }, px: { value: Math.min(devicePixelRatio, 2) }, agita: { value: 0 } },
      vertexShader: `attribute float fase; uniform float tempo; uniform float px; uniform float agita; varying float b;
        void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv;
          float pisca=step(0.985-agita*0.06,fract(sin(floor(tempo*3.+fase)*12.9898)*43758.5)); b=0.12+pisca*0.95;
          gl_PointSize=(2.0+pisca*3.2)*px*(14./-mv.z); }`,
      fragmentShader: `varying float b; void main(){ float d=length(gl_PointCoord-.5); if(d>.5) discard; gl_FragColor=vec4(vec3(1.,.95,.86)*b*(1.-d*2.),1.); }`,
    });
    this.cena.add(new THREE.Points(g, this.matPlateia));
  }

  /* telões: dois de frente um pro outro no alto da arena, com o round e os nomes */
  montarTeloes() {
    const cv = this.cvTelao = document.createElement("canvas"); cv.width = 1024; cv.height = 576;
    this.texTelao = new THREE.CanvasTexture(cv); this.texTelao.colorSpace = THREE.SRGBColorSpace; this.texTelao.anisotropy = 4;
    const matTela = new THREE.MeshBasicMaterial({ map: this.texTelao, toneMapped: false });
    const matMoldura = new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.5, metalness: 0.5 });
    for (const a of [0, Math.PI]) {
      const g = new THREE.Group(), r = 22;
      g.position.set(Math.sin(a) * r, 9.5, Math.cos(a) * r); g.lookAt(0, 5, 0);
      const moldura = new THREE.Mesh(new THREE.BoxGeometry(8.6, 5.0, 0.3), matMoldura); moldura.position.z = -0.17; g.add(moldura);
      g.add(new THREE.Mesh(new THREE.PlaneGeometry(8.2, 4.6), matTela));
      this.cena.add(g);
    }
    this.placar({});
  }

  /* o que passa nos telões: round e os dois nomes (texto desenhado no canvas, nunca HTML) */
  placar({ a = this.nomes?.a || "", b = this.nomes?.b || "", round = this.roundAtual || 1 } = {}) {
    this.nomes = { a, b }; this.roundAtual = round;
    const c = this.cvTelao.getContext("2d"), W = 1024, H = 576;
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#14161d"); g.addColorStop(1, "#07080b");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.fillStyle = "#d7261e"; c.fillRect(0, 0, W, 14); c.fillRect(0, H - 14, W, 14);
    c.textAlign = "center"; c.fillStyle = "#f2eee6";
    c.font = "700 150px 'Anton', Impact, 'Arial Narrow', sans-serif"; c.fillText(`ROUND ${round}`, W / 2, 250);
    const corta = (s) => (s.length > 22 ? s.slice(0, 21) + "." : s).toUpperCase();
    c.font = "700 56px 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif";
    c.fillStyle = "#ff6a5f"; c.fillText(corta(a), W / 2, 360);
    c.fillStyle = "#8a8f9c"; c.font = "700 40px 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif"; c.fillText("VS", W / 2, 420);
    c.fillStyle = "#7fa0ff"; c.font = "700 56px 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif"; c.fillText(corta(b), W / 2, 488);
    this.texTelao.needsUpdate = true;
  }

  /* qualidade automática (o diretor mede os quadros por segundo): 1 = menos pixel,
     2 = sem sombra, 3 = sem torcida. Só desce, pra não ficar trocando. */
  qualidade(nivel) {
    if (!(nivel > (this.nivel || 0)) || nivel > 3) return;
    this.nivel = nivel;
    if (nivel === 1) { this.r.setPixelRatio(1); this.redimensionar(); }
    if (nivel === 2) { this.r.shadowMap.enabled = false; this.cena.traverse((o) => { for (const m of [].concat(o.material || [])) m.needsUpdate = true; }); }
    if (nivel === 3 && this.torcida) { this.torcida.corpo.visible = false; this.torcida.cabeca.visible = false; }
  }

  /* a torcida levanta: knockdown, nocaute, finalização */
  agitar(forca = 1) { this.agitacao = Math.max(this.agitacao, Math.min(1.5, forca)); }

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
    this.matPlateia.uniforms.agita.value = this.agitacao;
    this.texFaixa.offset.x = (tempo * 0.04) % 1;
    this.animarTorcida(dt, tempo);
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

  /* torcida de pé pulando quando agita; parada, não gasta nada */
  animarTorcida(dt, tempo) {
    const T = this.torcida;
    if (!T || (this.agitacao < 0.01 && !T.mexeu)) return;
    this.agitacao = Math.max(0, this.agitacao - dt * 0.3);
    const mt = this._mt || (this._mt = new THREE.Matrix4()), p = this._p || (this._p = new THREE.Vector3()), e = this._e || (this._e = new THREE.Vector3());
    for (let i = 0; i < T.base.length; i++) {
      const b = T.base[i];
      p.copy(b.p); p.y += this.agitacao * (0.12 + 0.16 * Math.max(0, Math.sin(tempo * 9 + T.fase[i])));
      mt.compose(p, b.q, e.setScalar(b.e)); T.corpo.setMatrixAt(i, mt); T.cabeca.setMatrixAt(i, mt);
    }
    T.corpo.instanceMatrix.needsUpdate = true; T.cabeca.instanceMatrix.needsUpdate = true;
    T.mexeu = this.agitacao >= 0.01;
  }
}
