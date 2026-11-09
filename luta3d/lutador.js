// Lutador 3D: corpo CC0 do Quaternius com animações de captura de movimento do
// Mixamo convertidas pro esqueleto dele (ferramenta fora do repositório).
// O deslocamento que a animação traz no quadril vira deslocamento da raiz do
// lutador (root motion), então os pés não escorregam e o golpe anda junto.
import * as THREE from "./vendor/three.module.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import * as SkeletonUtils from "./vendor/SkeletonUtils.js";

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const CIMA = new THREE.Vector3(0, 1, 0);
/* pontos do corpo que descrevem a pose (pra achar o quadro mais parecido entre dois clipes) */
const PONTOS = ["Head", "spine_03", "hand_l", "hand_r", "lowerarm_l", "lowerarm_r", "calf_l", "calf_r", "foot_l", "foot_r"];
/* cadeias de dois ossos pro IK de contato */
const CADEIA = { hand_l: ["upperarm_l", "lowerarm_l", "hand_l"], hand_r: ["upperarm_r", "lowerarm_r", "hand_r"],
  ball_l: ["thigh_l", "calf_l", "foot_l"], ball_r: ["thigh_r", "calf_r", "foot_r"] };
const suaveK = (k) => k * k * (3 - 2 * k);

/* ---------- carga única ---------- */
export async function carregarBase(dir = "./", abrir = null) {
  const L = new GLTFLoader();
  const ler = abrir ? (f) => abrir(L, f) : (f) => L.loadAsync(dir + f);
  const arq = ["lutador.glb", "mx_lutas.glb", "hair_buzzed.glb", "hair_beard.glb", "hair_simpleparted.glb"];
  const [corpo, anim, ...cabelos] = await Promise.all(arq.map(ler));
  // espaço do pai da pelve (osso "root") no modelo em repouso
  corpo.scene.updateMatrixWorld(true);
  const pelve = corpo.scene.getObjectByName("pelvis");
  const M = pelve.parent.matrixWorld.clone(), Mi = M.clone().invert();
  const clips = {}, curvas = {};
  for (const c of anim.animations) {
    const t = c.tracks.find((k) => k.name === "pelvis.position");
    const tracks = c.tracks.filter((k) => k !== t).map((k) => k.clone());
    const n = t.times.length, xs = new Float32Array(n), zs = new Float32Array(n);
    const v = t.values.slice();
    const w0 = new THREE.Vector3(v[0], v[1], v[2]).applyMatrix4(M);
    for (let i = 0; i < n; i++) {
      const w = new THREE.Vector3(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]).applyMatrix4(M);
      xs[i] = w.x - w0.x; zs[i] = w.z - w0.z;
      // no lugar: o quadril fica parado no plano do chão (a raiz anda por ele)
      w.x = w0.x; w.z = w0.z; w.applyMatrix4(Mi);
      v[i * 3] = w.x; v[i * 3 + 1] = w.y; v[i * 3 + 2] = w.z;
    }
    tracks.push(new THREE.VectorKeyframeTrack("pelvis.position", t.times, v));
    clips[c.name] = new THREE.AnimationClip(c.name, c.duration, tracks);
    curvas[c.name] = { tempos: t.times, xs, zs };
  }
  return { corpo, clips, curvas, cabelos: { buzzed: cabelos[0], barba: cabelos[1], repartido: cabelos[2] } };
}
function amostrar(cv, t) {
  const T = cv.tempos, n = T.length;
  if (t <= T[0]) return [cv.xs[0], cv.zs[0]];
  if (t >= T[n - 1]) return [cv.xs[n - 1], cv.zs[n - 1]];
  let i = Math.min(n - 2, Math.floor(t / (T[1] - T[0]))); while (i < n - 2 && T[i + 1] < t) i++; while (i > 0 && T[i] > t) i--;
  const k = (t - T[i]) / (T[i + 1] - T[i]);
  return [cv.xs[i] + (cv.xs[i + 1] - cv.xs[i]) * k, cv.zs[i] + (cv.zs[i + 1] - cv.zs[i]) * k];
}

/* ---------- textura: pele e calção ---------- */
function tingirTextura(mapOrig, pele, calcao) {
  const img = mapOrig.image, w = img.width, h = img.height;
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const cx = cv.getContext("2d"); cx.drawImage(img, 0, 0);
  const d = cx.getImageData(0, 0, w, h), px = d.data;
  const P = new THREE.Color(pele), C = new THREE.Color(calcao), ref = [0.80, 0.56, 0.42];
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx === 0 ? 0 : (mx - mn) / mx;
    if (sat < 0.16 && mx < 0.45) { const l = Math.min(1, mx / 0.32); px[i] = 255 * C.r * l; px[i + 1] = 255 * C.g * l; px[i + 2] = 255 * C.b * l; }
    else {
      const lum = 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2];
      for (let k = 0; k < 3; k++) px[i + k] += (lum - px[i + k]) * 0.22;
      px[i] = Math.min(255, px[i] * P.r / ref[0]); px[i + 1] = Math.min(255, px[i + 1] * P.g / ref[1]); px[i + 2] = Math.min(255, px[i + 2] * P.b / ref[2]);
    }
  }
  cx.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.flipY = mapOrig.flipY; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = mapOrig.wrapS; t.wrapT = mapOrig.wrapT; t.anisotropy = 4;
  return t;
}

/* ---------- o lutador ---------- */
export class Lutador {
  constructor(base, opt) {
    this.base = base;
    this.raiz = new THREE.Group();
    this.modelo = SkeletonUtils.clone(base.corpo.scene);
    this.raiz.add(this.modelo);
    this.ossos = {};
    this.modelo.traverse((o) => {
      if (o.isBone) this.ossos[o.name] = o;
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        o.material = o.material.clone();
        if (o.material.name === "MI_Superhero_Male" && o.material.map) { o.material.map = tingirTextura(o.material.map, opt.pele, opt.calcao); o.material.roughness = 0.7; o.material.envMapIntensity = 0.5; }
        if (o.name === "Eyebrows" && opt.corCabelo) o.material.color = new THREE.Color(opt.corCabelo);
      }
    });
    for (const nome of [opt.cabelo, opt.barba].filter(Boolean)) this.anexarCabelo(base.cabelos[nome], opt.corCabelo);
    this.mixer = new THREE.AnimationMixer(this.modelo);
    this.acoes = {}; this.atual = null; this.nomeEstado = null;
    this.movendo = new Map();   // ação -> último ponto da curva de deslocamento
    this.molas = []; this.timers = []; this.contatos = []; this.alinhando = null; this.relogio = 0;
    this.ikFixo = {};          // membro -> { alvo: () => Vector3, peso }
    this.extras = new Set();   // controladores por código (ground and pound, finalização), rodam depois do mixer
    this.interp = {};
  }
  anexarCabelo(gltf, cor) {
    let malha = null; gltf.scene.traverse((o) => { if (o.isSkinnedMesh && !malha) malha = o; });
    if (!malha) return;
    const m = malha.clone(); m.material = malha.material.clone(); if (cor) m.material.color = new THREE.Color(cor);
    m.bind(new THREE.Skeleton(malha.skeleton.bones.map((b) => this.ossos[b.name]), malha.skeleton.boneInverses), malha.bindMatrix);
    m.castShadow = true; m.frustumCulled = false; this.modelo.add(m);
  }
  acao(nome) { if (!this.acoes[nome]) this.acoes[nome] = this.mixer.clipAction(this.base.clips[nome]); return this.acoes[nome]; }
  dur(nome) { return this.base.clips[nome].duration; }

  /* estado em laço (guarda, cambaleando...): tudo que tocava sai no mesmo fade */
  estado(nome, fade = 0.3, vel = 1) {
    const a = this.acao(nome);
    for (const b of Object.values(this.acoes)) if (b !== a && b.isRunning() && b.getEffectiveWeight() > 0) b.fadeOut(fade);
    if (this.atual !== a || !a.isRunning()) { a.reset(); a.setLoop(THREE.LoopRepeat); a.timeScale = vel; a.play(); if (fade > 0) a.fadeIn(fade); else a.setEffectiveWeight(1); }
    else if (!a.enabled || a.getEffectiveWeight() < 0.999) this.religar(a, fade);
    this.atual = a; this.nomeEstado = nome;
  }
  /* uma vez só, por cima do estado; anda a raiz pelo deslocamento da animação */
  async umaVez(nome, { fade = 0.12, de = 0, ate = null, vel = 1, peso = 1, segurar = false, volta = 0.25, mover = true, casar = null } = {}) {
    if (casar) {
      const c = this.casarInicio(nome, casar[0], casar[1]);
      de = c.t;
      this.alinhando = { dyaw: c.dyaw, dpos: c.dpos, pivo: c.pivo, dur: fade, k: 0 };
    }
    const a = this.acao(nome), estado = this.atual, cheio = peso >= 0.99;
    if (cheio) for (const b of Object.values(this.acoes)) if (b !== a && b !== estado && b.isRunning() && b.getEffectiveWeight() > 0) b.fadeOut(fade);
    a.reset(); a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; a.time = de; a.timeScale = vel;
    a.setEffectiveWeight(peso); a.play();
    if (fade > 0) { a.fadeIn(fade); if (cheio && estado && estado !== a) estado.fadeOut(fade); }
    else for (const b of Object.values(this.acoes)) if (b !== a) b.stop();   // corte seco (escondido por um corte de câmera)
    if (mover) this.movendo.set(a, { nome, ultimo: amostrar(this.base.curvas[nome], de) });
    if (segurar) { this.atual = a; this.nomeEstado = nome; }
    const fim = ((ate ?? this.dur(nome)) - de) / vel;
    await this.esperar(Math.max(0, fim - (segurar ? 0 : volta)));
    if (segurar || this.atual === a) return;
    a.fadeOut(volta);
    if (cheio && this.atual === estado && estado) this.religar(estado, volta);
  }
  /* algum lance de uma vez só (golpe, reação, passo) ainda está tocando por cima do estado */
  ocupado() { for (const a of Object.values(this.acoes)) if (a !== this.atual && a.isRunning() && a.getEffectiveWeight() > 0.2) return true; return false; }
  religar(acao, fade) { acao.stopFading(); acao.enabled = true; if (!acao.isRunning()) acao.play(); acao.fadeIn(fade); }
  esperar(s) { return new Promise((ok) => this.timers.push({ t: s, ok })); }
  impacto(osso, eixo, ang) { this.molas.push({ osso, eixo: eixo.clone().normalize(), ang: 0, vel: ang * 22 }); }
  posMundo(osso) { return this.ossos[osso].getWorldPosition(new THREE.Vector3()); }

  /* IK de contato: a mão ou o pé encosta no alvo no instante do impacto (o braço do
     Mixamo tem outro tamanho, sem isso o golpe passa do rosto ou para antes) */
  contato(membro, alvo, tImp, { antes = 0.13, segura = 0.07, depois = 0.16 } = {}) {
    this.contatos.push({ membro, alvo, t0: this.relogio, tImp: this.relogio + tImp, antes, segura, depois });
  }
  ikContatos() {
    for (const c of this.contatos.slice()) {
      const t = this.relogio - c.tImp;
      let w = 0;
      if (t < -c.antes) continue;
      if (t < 0) w = suaveK(1 + t / c.antes); else if (t < c.segura) w = 1; else if (t < c.segura + c.depois) w = 1 - suaveK((t - c.segura) / c.depois);
      else { this.contatos.splice(this.contatos.indexOf(c), 1); continue; }
      const [o1, o2, o3] = CADEIA[c.membro].map((n) => this.ossos[n]);
      const ponta = this.ossos[c.membro];
      const alvo = c.alvo();
      // pé: o alvo é da bola do pé; o IK move o tornozelo
      const ajuste = ponta === o3 ? _v3.set(0, 0, 0) : o3.getWorldPosition(new THREE.Vector3()).sub(ponta.getWorldPosition(new THREE.Vector3()));
      this.ikDoisOssos(o1, o2, o3, alvo.add(ajuste), w);
    }
  }
  /* polo: ponto pra onde o cotovelo (ou o joelho) aponta; sem ele, fica no plano em que já estava */
  ikDoisOssos(o1, o2, o3, alvo, peso, polo = null) {
    const pA = o1.getWorldPosition(new THREE.Vector3()), pB = o2.getWorldPosition(new THREE.Vector3()), pC = o3.getWorldPosition(new THREE.Vector3());
    const l1 = pA.distanceTo(pB), l2 = pB.distanceTo(pC);
    const T = pC.clone().lerp(alvo, peso);
    const dir = T.clone().sub(pA); let d = dir.length(); d = Math.min(d, (l1 + l2) * 0.999); dir.normalize();
    const curva = pB.clone().sub(pA); const lado = curva.sub(dir.clone().multiplyScalar(curva.dot(dir)));
    if (polo) {
      const q = polo.clone().sub(pA); q.sub(dir.clone().multiplyScalar(q.dot(dir)));
      if (q.lengthSq() > 1e-8) { if (lado.lengthSq() > 1e-8) lado.normalize(); lado.lerp(q.normalize(), peso); }
    }
    if (lado.lengthSq() < 1e-8) lado.set(0, -1, 0); lado.normalize();
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const meio = pA.clone().addScaledVector(dir, a).addScaledVector(lado, h);
    this.mirar(o1, o2, meio); this.mirar(o2, o3, pA.clone().addScaledVector(dir, d));
  }
  mirar(osso, filho, alvo) {
    osso.updateWorldMatrix(true, true);
    const a = osso.getWorldPosition(_v1), b = filho.getWorldPosition(_v2);
    _q2.setFromUnitVectors(b.sub(a).normalize(), alvo.clone().sub(a).normalize());
    osso.parent.getWorldQuaternion(_q1); _q3.copy(_q1).invert().multiply(_q2).multiply(_q1);
    osso.quaternion.premultiply(_q3); osso.updateMatrixWorld(true);
  }

  /* deslocamento do quadril (root motion) do clipe no instante t, a partir do 1º quadro */
  curva(nome, t) { return amostrar(this.base.curvas[nome], t); }
  /* clipe parado numa pose de outro clipe (ex.: a montada tirada do clipe da queda) */
  clipeFixo(nome, t, novo) {
    if (this.base.clips[novo]) return novo;
    const c = this.base.clips[nome];
    const tracks = c.tracks.map((k) => { const v = Array.from(k.createInterpolant().evaluate(t)); return new k.constructor(k.name, [0, 1], v.concat(v)); });
    this.base.clips[novo] = new THREE.AnimationClip(novo, 1, tracks);
    this.base.curvas[novo] = { tempos: new Float32Array([0, 1]), xs: new Float32Array(2), zs: new Float32Array(2) };
    return novo;
  }
  /* pose de um clipe num instante aplicada direto nos ossos (pra comparar poses) */
  aplicarClipe(nome, t) {
    let it = this.interp[nome];
    if (!it) it = this.interp[nome] = this.base.clips[nome].tracks.map((k) => { const [o, prop] = k.name.split("."); return { osso: this.ossos[o], prop, f: k.createInterpolant() }; });
    for (const x of it) { if (!x.osso) continue; const v = x.f.evaluate(t); if (x.prop === "quaternion") x.osso.quaternion.fromArray(v); else x.osso.position.fromArray(v); }
    this.modelo.updateMatrixWorld(true);
  }
  caracteristicas() {
    this.modelo.updateMatrixWorld(true);
    const p = this.posMundo("pelvis"), hl = this.posMundo("thigh_l"), hr = this.posMundo("thigh_r");
    const yaw = Math.atan2(hl.x - hr.x, hl.z - hr.z), f = [];
    for (const n of PONTOS) { const v = this.posMundo(n).sub(p).applyAxisAngle(CIMA, -yaw); f.push(v.x, v.y, v.z); }
    f.push(p.y * 2);
    return { f, yaw, pelve: p };
  }
  /* acha o quadro do clipe (entre a e b) mais parecido com a pose de agora e quanto girar e
     andar o corpo pra que ele comece exatamente onde está (sem salto na troca de animação) */
  casarInicio(nome, a, b) {
    const salvo = this.listaOssos.map((o) => ({ q: o.quaternion.clone(), p: o.position.clone() }));
    const atual = this.caracteristicas();
    let melhor = null;
    for (let t = a; t <= Math.min(b, this.dur(nome) - 1e-3); t += 1 / 30) {
      this.aplicarClipe(nome, t);
      const c = this.caracteristicas();
      let d = 0; for (let i = 0; i < c.f.length; i++) d += (c.f[i] - atual.f[i]) ** 2;
      if (!melhor || d < melhor.d) melhor = { d, t, c };
    }
    this.listaOssos.forEach((o, i) => { o.quaternion.copy(salvo[i].q); o.position.copy(salvo[i].p); });
    this.modelo.updateMatrixWorld(true);
    let dyaw = atual.yaw - melhor.c.yaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    const dpos = atual.pelve.clone().sub(melhor.c.pelve).setY(0);
    return { t: melhor.t, dyaw, dpos, pivo: melhor.c.pelve.clone().setY(0), erro: melhor.d };
  }
  alinhar(dt) {
    const al = this.alinhando; if (!al) return;
    const k0 = al.k; al.k = Math.min(1, al.k + dt / Math.max(0.01, al.dur));
    const dk = suaveK(al.k) - suaveK(k0);
    // gira em torno do quadril do clipe novo e anda até o quadril de agora
    const r = this.raiz.position.clone().sub(al.pivo).applyAxisAngle(CIMA, al.dyaw * dk);
    this.raiz.position.copy(al.pivo).add(r).addScaledVector(al.dpos, dk);
    this.raiz.rotation.y += al.dyaw * dk;
    al.pivo.addScaledVector(al.dpos, dk);
    if (al.k >= 1) this.alinhando = null;
  }

  update(dt) {
    this.relogio += dt;
    this.listaOssos = this.listaOssos || Object.values(this.ossos);
    for (const t of this.timers.slice()) { t.t -= dt; if (t.t <= 0) { this.timers.splice(this.timers.indexOf(t), 1); t.ok(); } }
    // o mixer só reescreve o osso quando o valor muda: volta à saída limpa antes (o que contorcia no vídeo do dono)
    const ossos = this.listaOssos || (this.listaOssos = Object.values(this.ossos));
    if (this.limpo) for (let i = 0; i < ossos.length; i++) { ossos[i].quaternion.copy(this.limpo[i].q); ossos[i].position.copy(this.limpo[i].p); }
    this.mixer.update(dt);
    if (!this.limpo) this.limpo = ossos.map(() => ({ q: new THREE.Quaternion(), p: new THREE.Vector3() }));
    for (let i = 0; i < ossos.length; i++) { this.limpo[i].q.copy(ossos[i].quaternion); this.limpo[i].p.copy(ossos[i].position); }
    // deslocamento da raiz (root motion)
    for (const [a, m] of this.movendo) {
      const p = amostrar(this.base.curvas[m.nome], a.time);
      const dx = p[0] - m.ultimo[0], dz = p[1] - m.ultimo[1]; m.ultimo = p;
      const w = Math.min(1, a.getEffectiveWeight());
      if (w > 0.001) { _v1.set(dx, 0, dz).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.raiz.rotation.y).multiplyScalar(w); this.raiz.position.add(_v1); }
      if (!a.isRunning() && a.getEffectiveWeight() < 0.001) this.movendo.delete(a);
    }
    this.alinhar(dt);
    this.modelo.updateMatrixWorld(true);
    for (const f of this.extras) f(dt);
    this.ikContatos();
    for (const [membro, k] of Object.entries(this.ikFixo)) {
      if (!k || k.peso < 0.001) continue;
      const [o1, o2, o3] = CADEIA[membro].map((n) => this.ossos[n]);
      this.ikDoisOssos(o1, o2, o3, k.alvo(), Math.min(1, k.peso), k.polo ? k.polo() : null);
    }
    // molas de impacto (cabeça, tronco), por cima do clipe
    for (const m of this.molas.slice()) {
      m.vel += (-m.ang * 240 - m.vel * 15) * dt; m.ang += m.vel * dt;
      if (Math.abs(m.ang) < 0.0005 && Math.abs(m.vel) < 0.01) { this.molas.splice(this.molas.indexOf(m), 1); continue; }
      this.girarMundo(this.ossos[m.osso], m.eixo, m.ang);
    }
  }
  girarMundo(osso, eixo, ang) {
    if (!osso || !ang) return;
    osso.parent.updateWorldMatrix(true, false); osso.parent.getWorldQuaternion(_q1);
    _q2.setFromAxisAngle(eixo, ang); _q3.copy(_q1).invert().multiply(_q2).multiply(_q1);
    osso.quaternion.premultiply(_q3); osso.updateMatrixWorld(true);
  }
}
