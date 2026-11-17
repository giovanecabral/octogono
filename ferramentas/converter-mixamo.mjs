/* Conversor do Mixamo: FBX (sem pele, 30 quadros) pro esqueleto do corpo do
   jogo, num GLB só de animações, igual ao luta3d/mx_lutas.glb (os mesmos nós,
   o mesmo formato). Refeito em 2026-11-15: o de antes ficava fora do
   repositório e se perdeu.

   Por que fora do git: a licença do Mixamo deixa usar a animação no jogo,
   mas não redistribuir o arquivo, e o GitHub é público. O FBX, os arquivos
   do three que leem FBX (FBXLoader e companhia, baixados com o sim do dono)
   e o GLB gerado ficam só na máquina; o GLB sobe pelo `vercel --prod`.

   Uso:
     MIXAMO_THREE=<pasta com loaders/FBXLoader.js, libs/, curves/ do three r169> \
     node ferramentas/converter-mixamo.mjs <lista.tsv> [saida.glb]
   A lista tem uma linha por clipe: `<arquivo.fbx>\t<NomeDoClipe>` (caminho
   relativo à pasta da lista ou absoluto). Saída padrão: luta3d/mx_cartas.glb.

   O retarget: cada osso do Mixamo tem o seu osso no corpo (MAPA). A rotação
   no mundo do osso de destino é a do Mixamo vezes uma correção fixa por osso
   (K = rotação de descanso do Mixamo invertida vezes a de descanso do
   corpo, com o Mixamo virado pra mesma frente do corpo). O quadril anda
   junto (root motion): o deslocamento do Hips, na escala da altura do
   quadril do corpo. Depois, os quadros que a interpolação recupera saem
   (0,3 grau na rotação, 1 mm no quadril), como no mx_lutas.glb. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = path.join(RAIZ, "luta3d", "vendor", "three.module.js");
export const GLB_MODELO = path.join(RAIZ, "luta3d", "mx_lutas.glb");
export const TOLERANCIA_GRAUS = 0.3;
export const TOLERANCIA_QUADRIL = 0.001;   // metros
export const QUADROS = 30;

/* osso do Mixamo (sem o "mixamorig") -> osso do corpo */
export const MAPA = (() => {
  const m = { Hips: "pelvis", Spine: "spine_01", Spine1: "spine_02", Spine2: "spine_03", Neck: "neck_01", Head: "Head" };
  for (const [lado, s] of [["Left", "l"], ["Right", "r"]]) {
    Object.assign(m, {
      [`${lado}Shoulder`]: `clavicle_${s}`, [`${lado}Arm`]: `upperarm_${s}`, [`${lado}ForeArm`]: `lowerarm_${s}`, [`${lado}Hand`]: `hand_${s}`,
      [`${lado}UpLeg`]: `thigh_${s}`, [`${lado}Leg`]: `calf_${s}`, [`${lado}Foot`]: `foot_${s}`, [`${lado}ToeBase`]: `ball_${s}`,
    });
    for (const [dedo, alvo] of [["Thumb", "thumb"], ["Index", "index"], ["Middle", "middle"], ["Ring", "ring"], ["Pinky", "pinky"]])
      for (const i of [1, 2, 3]) m[`${lado}Hand${dedo}${i}`] = `${alvo}_0${i}_${s}`;
  }
  return m;
})();

/* Correção de descanso (quaternion local, no osso do corpo): o corpo descansa em A e o Mixamo em
   T, e a ferramenta de antes alinhou braço, clavícula e dedos por uma pose em T. Calibrada com
   calibrarCorrecao a partir do Mma_Kick do mx_lutas.glb (o FBX original dele) e conferida em
   outros clipes que não entraram na calibração (suíte mixamo). Osso fora da tabela: sem correção. */
export const CORRECAO = {
  clavicle_l: [-0.082262, 0.030566, 0.145525, -0.985455], upperarm_l: [0.015068, 0.001158, 6.3e-05, 0.999886], lowerarm_l: [-0.015805, 0.001414, 6.8e-05, 0.999874],
  hand_l: [-0.064999, 0.001125, 0.020255, 0.997679], thigh_l: [0.006115, 1e-06, -0.003041, 0.999977], calf_l: [-0.031821, 2.1e-05, 0.002934, 0.999489],
  foot_l: [-0.031827, -0.00277, 0.00105, 0.999489], ball_l: [0.031651, -0.002964, 0.000304, 0.999495], thumb_01_l: [0.061597, -0.022909, -0.017534, 0.997684],
  thumb_02_l: [0.061483, -0.022908, -0.017699, 0.997688], thumb_03_l: [0.061268, -0.023045, -0.017758, 0.997697], index_01_l: [-0.019239, -0.000307, 0.007058, 0.99979],
  index_02_l: [-0.019283, -0.000349, 0.007567, 0.999785], index_03_l: [-0.019337, -0.000361, 0.007757, 0.999783], middle_01_l: [-0.018536, -0.000383, 0.011808, 0.999758],
  middle_02_l: [-0.018348, -0.000413, 0.009704, 0.999784], middle_03_l: [-0.018269, -0.000467, 0.011122, 0.999771], ring_01_l: [-0.018601, -6.6e-05, -0.002723, 0.999823],
  ring_02_l: [-0.018513, -0.000163, -0.005177, 0.999815], ring_03_l: [-0.018539, -0.000255, -0.001763, 0.999827], pinky_01_l: [-0.018986, -0.000434, 0.015335, 0.999702],
  pinky_02_l: [-0.018816, -0.000576, 0.016809, 0.999681], pinky_03_l: [-0.018825, -0.000612, 0.016352, 0.999689], clavicle_r: [0.082176, 0.030525, 0.145847, 0.985416],
  upperarm_r: [0.015229, -0.001512, -5.6e-05, 0.999883], lowerarm_r: [-0.015393, -0.001292, 0.000156, 0.999881], hand_r: [-0.064768, -0.000959, -0.020071, 0.997698],
  thigh_r: [0.006137, 2.9e-05, 0.002919, 0.999977], calf_r: [-0.031734, -0.000106, -0.002972, 0.999492], foot_r: [-0.031666, 0.002742, -0.00113, 0.999494],
  ball_r: [0.031658, 0.002971, -0.000244, 0.999494], thumb_01_r: [0.061149, 0.023178, 0.017588, 0.997705], thumb_02_r: [0.061366, 0.023221, 0.017487, 0.997692],
  thumb_03_r: [0.06143, 0.023203, 0.0174, 0.99769], index_01_r: [-0.019075, 0.000248, -0.007273, 0.999792], index_02_r: [-0.019361, 7.6e-05, -0.007539, 0.999784],
  index_03_r: [-0.01896, 0.000104, -0.007591, 0.999791], middle_01_r: [-0.019296, 0.000223, -0.012176, 0.99974], middle_02_r: [-0.019555, -8e-06, -0.009711, 0.999762],
  middle_03_r: [-0.019698, 0.000102, -0.011004, 0.999745], ring_01_r: [-0.019342, -7.6e-05, 0.002393, 0.99981], ring_02_r: [-0.019622, -0.000208, 0.005232, 0.999794],
  ring_03_r: [-0.019756, -4.9e-05, 0.001958, 0.999803], pinky_01_r: [-0.019184, 0.000194, -0.015484, 0.999696], pinky_02_r: [-0.019479, 0.000279, -0.016646, 0.999672],
  pinky_03_r: [-0.019309, 0.0004, -0.016061, 0.999684],
};

/* ---------- three e FBXLoader ---------- */
let THREE = null;
export async function carregarThree(pastaThree = process.env.MIXAMO_THREE) {
  THREE = THREE || await import(pathToFileURL(VENDOR).href);
  if (!pastaThree) return { THREE, FBXLoader: null };
  /* os módulos do three importam 'three' pelo nome: copia pra uma pasta temporária apontando pro do jogo */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mixamo-three-"));
  for (const f of ["loaders/FBXLoader.js", "libs/fflate.module.js", "curves/NURBSCurve.js", "curves/NURBSUtils.js"]) {
    const orig = path.join(pastaThree, f);
    if (!fs.existsSync(orig)) throw new Error("falta " + orig + " (MIXAMO_THREE aponta pra pasta do three r169)");
    fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true });
    fs.writeFileSync(path.join(tmp, f), fs.readFileSync(orig, "utf8").replace(/from\s+['"]three['"]/g, `from '${pathToFileURL(VENDOR).href}'`));
  }
  const { FBXLoader } = await import(pathToFileURL(path.join(tmp, "loaders", "FBXLoader.js")).href);
  return { THREE, FBXLoader };
}
export function lerFBX(FBXLoader, arquivo) {
  const b = fs.readFileSync(arquivo);
  const g = new FBXLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), "");
  if (!g.animations || !g.animations.length) throw new Error("FBX sem animação: " + arquivo);
  return g;
}

/* ---------- GLB ---------- */
export function lerGLB(arquivo) {
  const b = fs.readFileSync(arquivo);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error("não é GLB: " + arquivo);
  const len = b.readUInt32LE(12), json = JSON.parse(b.slice(20, 20 + len).toString("utf8"));
  const o = 20 + len, blen = o < b.length ? b.readUInt32LE(o) : 0;
  return { json, bin: blen ? b.slice(o + 8, o + 8 + blen) : Buffer.alloc(0) };
}
const COMP = { SCALAR: 1, VEC3: 3, VEC4: 4 };
export function lerAcessor(glb, i) {
  const a = glb.json.accessors[i], bv = glb.json.bufferViews[a.bufferView], n = a.count * COMP[a.type];
  const ini = (bv.byteOffset || 0) + (a.byteOffset || 0);
  return new Float32Array(glb.bin.buffer.slice(glb.bin.byteOffset + ini, glb.bin.byteOffset + ini + n * 4));
}
/* os clipes de um GLB: { nome: { duracao, faixas: { "osso.rotation"|"osso.translation": { t, v, n } } } } */
export function clipesDoGLB(glb) {
  const out = {};
  for (const a of glb.json.animations || []) {
    const faixas = {};
    let dur = 0;
    for (const c of a.channels) {
      const s = a.samplers[c.sampler], t = lerAcessor(glb, s.input), v = lerAcessor(glb, s.output);
      faixas[glb.json.nodes[c.target.node].name + "." + c.target.path] = { t, v, n: c.target.path === "rotation" ? 4 : 3 };
      dur = Math.max(dur, t[t.length - 1]);
    }
    out[a.name] = { duracao: dur, faixas };
  }
  return out;
}

/* o esqueleto do corpo montado dos nós do GLB modelo (descanso) */
function esqueletoDoGLB(json) {
  const objs = json.nodes.map((n) => {
    const o = new THREE.Object3D();
    o.name = n.name || "";
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    return o;
  });
  json.nodes.forEach((n, i) => (n.children || []).forEach((c) => objs[i].add(objs[c])));
  const raiz = objs[json.scenes[json.scene || 0].nodes[0]];
  raiz.updateMatrixWorld(true);
  return { objs, raiz, porNome: Object.fromEntries(objs.filter((o) => o.name).map((o) => [o.name, o])) };
}

/* ---------- retarget ---------- */
const nomeMixamo = (o) => o.name.replace(/^mixamorig:?/, "");
/* a frente de um esqueleto (Y pra cima): do lado direito pro esquerdo, girado 90 graus */
function frente(coxaE, coxaD) {
  const e = new THREE.Vector3(), d = new THREE.Vector3();
  coxaE.getWorldPosition(e); coxaD.getWorldPosition(d);
  const lado = e.sub(d); lado.y = 0; lado.normalize();
  return new THREE.Vector3(0, 1, 0).cross(lado).normalize();   // olhando pra +Z, a esquerda fica em +X
}
/* converte um clipe do FBX pro esqueleto do corpo: { duracao, faixas } (mesmo formato de clipesDoGLB) */
export function converterClipe(fbx, modelo, { mapa = MAPA, quadros = QUADROS, correcao = CORRECAO } = {}) {
  const alvo = esqueletoDoGLB(modelo.json);
  const src = {};
  fbx.traverse((o) => { if (/^mixamorig/.test(o.name)) src[nomeMixamo(o)] = o; });
  for (const k of Object.keys(mapa)) if (!src[k]) throw new Error("osso do Mixamo faltando: " + k);
  for (const v of Object.values(mapa)) if (!alvo.porNome[v]) throw new Error("osso do corpo faltando: " + v);
  fbx.updateMatrixWorld(true);
  /* descanso dos dois e a correção de frente (G: gira o mundo do Mixamo pro do corpo) */
  const G = new THREE.Quaternion().setFromUnitVectors(frente(src.LeftUpLeg, src.RightUpLeg), frente(alvo.porNome.thigh_l, alvo.porNome.thigh_r));
  const restSrc = {}, restAlvo = {}, K = {};
  for (const [m, a] of Object.entries(mapa)) {
    restSrc[m] = src[m].getWorldQuaternion(new THREE.Quaternion()).premultiply(G);
    restAlvo[a] = alvo.porNome[a].getWorldQuaternion(new THREE.Quaternion());
    K[m] = restSrc[m].clone().invert().multiply(restAlvo[a]);
    if (correcao && correcao[a]) K[m].multiply(new THREE.Quaternion().fromArray(correcao[a]));
  }
  const hipsRest = src.Hips.getWorldPosition(new THREE.Vector3());
  const pelvis = alvo.porNome.pelvis, pelvisRest = pelvis.getWorldPosition(new THREE.Vector3());
  const escala = pelvisRest.y / hipsRest.y;
  /* toca o clipe e lê cada quadro */
  const clip = fbx.animations[0], mixer = new THREE.AnimationMixer(fbx);
  mixer.clipAction(clip).play();
  const n = Math.max(2, Math.round(clip.duration * quadros) + 1);
  const ordem = [];   // ossos do corpo de cima pra baixo (pai antes do filho)
  alvo.raiz.traverse((o) => { if (Object.values(mapa).includes(o.name)) ordem.push(o.name); });
  const deAlvo = Object.fromEntries(Object.entries(mapa).map(([m, a]) => [a, m]));
  const faixas = {};
  for (const a of ordem) faixas[a + ".rotation"] = { t: new Float32Array(n), v: new Float32Array(n * 4), n: 4 };
  faixas["pelvis.translation"] = { t: new Float32Array(n), v: new Float32Array(n * 3), n: 3 };
  const qw = new THREE.Quaternion(), qp = new THREE.Quaternion(), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const t = Math.min(clip.duration, i / quadros);
    mixer.setTime(t);
    fbx.updateMatrixWorld(true);
    for (const a of ordem) {
      const o = alvo.porNome[a], m = deAlvo[a];
      src[m].getWorldQuaternion(qw).premultiply(G).multiply(K[m]);       // rotação no mundo do osso do corpo
      o.parent.getWorldQuaternion(qp);
      o.quaternion.copy(qp.invert().multiply(qw));                         // local = pai invertido vezes mundo
      o.updateMatrixWorld(true);
      const f = faixas[a + ".rotation"];
      f.t[i] = t; o.quaternion.toArray(f.v, i * 4);
    }
    /* quadril: o deslocamento do Hips, girado pra frente do corpo e na escala do corpo */
    src.Hips.getWorldPosition(p).sub(hipsRest).applyQuaternion(G).multiplyScalar(escala).add(pelvisRest);
    pelvis.parent.worldToLocal(p);
    const f = faixas["pelvis.translation"];
    f.t[i] = t; p.toArray(f.v, i * 3);
    pelvis.position.copy(p); pelvis.updateMatrixWorld(true);
  }
  /* quaternions do mesmo lado (sem pulo de sinal entre quadros) */
  for (const f of Object.values(faixas)) if (f.n === 4) for (let i = 1; i < f.t.length; i++) {
    const d = f.v[i * 4] * f.v[i * 4 - 4] + f.v[i * 4 + 1] * f.v[i * 4 - 3] + f.v[i * 4 + 2] * f.v[i * 4 - 2] + f.v[i * 4 + 3] * f.v[i * 4 - 1];
    if (d < 0) for (let k = 0; k < 4; k++) f.v[i * 4 + k] *= -1;
  }
  return { duracao: clip.duration, faixas };
}

/* as rotações no mundo de cada osso do corpo num instante do clipe */
export function mundosDoClipe(clipe, modelo, t) {
  const alvo = esqueletoDoGLB(modelo.json);
  for (const [k, f] of Object.entries(clipe.faixas)) {
    const [osso, campo] = k.split(".");
    const o = alvo.porNome[osso];
    if (!o) continue;
    const v = amostrar(f, t);
    if (campo === "rotation") o.quaternion.fromArray(v); else o.position.fromArray(v);
  }
  alvo.raiz.updateMatrixWorld(true);
  return Object.fromEntries(Object.entries(alvo.porNome).map(([n, o]) => [n, o.getWorldQuaternion(new THREE.Quaternion())]));
}
/* a correção de descanso por osso: o que falta, no osso, pra conversão sem correção bater com a de
   referência (média nos quadros). Uso de manutenção: gera a tabela CORRECAO a partir de um clipe
   que já está no mx_lutas.glb e do FBX dele. */
export function calibrarCorrecao(semCorrecao, referencia, modelo, amostras = 20) {
  const soma = {};
  const dur = Math.min(semCorrecao.duracao, referencia.duracao);
  for (let i = 0; i < amostras; i++) {
    const t = dur * i / (amostras - 1), wc = mundosDoClipe(semCorrecao, modelo, t), wr = mundosDoClipe(referencia, modelo, t);
    for (const a of Object.values(MAPA)) {
      const d = wc[a].clone().invert().multiply(wr[a]);
      const s = soma[a] || (soma[a] = new THREE.Quaternion(0, 0, 0, 0));
      if (s.x * d.x + s.y * d.y + s.z * d.z + s.w * d.w < 0) d.set(-d.x, -d.y, -d.z, -d.w);
      s.set(s.x + d.x, s.y + d.y, s.z + d.z, s.w + d.w);
    }
  }
  return Object.fromEntries(Object.entries(soma).map(([a, q]) => [a, q.normalize().toArray().map((x) => Math.round(x * 1e6) / 1e6)]));
}

/* ---------- enxugar ---------- */
const angulo = (a, i, b, j) => { let d = Math.abs(a[i * 4] * b[j * 4] + a[i * 4 + 1] * b[j * 4 + 1] + a[i * 4 + 2] * b[j * 4 + 2] + a[i * 4 + 3] * b[j * 4 + 3]); return 2 * Math.acos(Math.min(1, d)) * 180 / Math.PI; };
function interpolar(f, t, saida, o = 0) {
  const { t: ts, v, n } = f;
  let k = 0;
  while (k < ts.length - 2 && ts[k + 1] < t) k++;
  const t0 = ts[k], t1 = ts[Math.min(k + 1, ts.length - 1)], u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
  if (n === 3) { for (let c = 0; c < 3; c++) saida[o + c] = v[k * 3 + c] + (v[(k + 1) * 3 + c] - v[k * 3 + c]) * u; return saida; }
  const q = new THREE.Quaternion().fromArray(v, k * 4).slerp(new THREE.Quaternion().fromArray(v, Math.min(k + 1, ts.length - 1) * 4), u);
  q.toArray(saida, o);
  return saida;
}
export const amostrar = (f, t) => interpolar(f, t, new Float32Array(f.n));
/* tira os quadros que a interpolação linear recupera dentro da tolerância (mantém o primeiro e o último) */
export function enxugar(f, { graus = TOLERANCIA_GRAUS, metros = TOLERANCIA_QUADRIL } = {}) {
  const manter = [0];
  const erro = (i, a, b) => {
    const aux = { t: [f.t[a], f.t[b]], v: new Float32Array([...f.v.slice(a * f.n, a * f.n + f.n), ...f.v.slice(b * f.n, b * f.n + f.n)]), n: f.n };
    const x = interpolar(aux, f.t[i], new Float32Array(f.n));
    if (f.n === 4) return angulo(x, 0, f.v, i) > graus;
    return Math.hypot(x[0] - f.v[i * 3], x[1] - f.v[i * 3 + 1], x[2] - f.v[i * 3 + 2]) > metros;
  };
  let ini = 0;
  for (let i = 2; i < f.t.length; i++) {
    for (let j = ini + 1; j < i; j++) if (erro(j, ini, i)) { manter.push(i - 1); ini = i - 1; break; }
  }
  if (manter[manter.length - 1] !== f.t.length - 1) manter.push(f.t.length - 1);
  return { t: Float32Array.from(manter.map((i) => f.t[i])), v: Float32Array.from(manter.flatMap((i) => Array.from(f.v.slice(i * f.n, i * f.n + f.n)))), n: f.n };
}

/* ---------- escrever o GLB ---------- */
export function escreverGLB(clipes, saida, modelo) {
  const nodes = modelo.json.nodes.map((n) => ({ ...n }));
  const idx = Object.fromEntries(nodes.map((n, i) => [n.name, i]).filter(([k]) => k));
  const accessors = [], bufferViews = [], partes = [];
  let off = 0;
  const acessor = (arr, type, comMinMax) => {
    const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    bufferViews.push({ buffer: 0, byteOffset: off, byteLength: b.length });
    partes.push(b); off += b.length;
    const pad = (4 - (off % 4)) % 4; if (pad) { partes.push(Buffer.alloc(pad)); off += pad; }
    const a = { bufferView: bufferViews.length - 1, componentType: 5126, count: arr.length / COMP[type], type };
    if (comMinMax) { a.min = [arr[0]]; a.max = [arr[arr.length - 1]]; }
    accessors.push(a);
    return accessors.length - 1;
  };
  const animations = Object.entries(clipes).map(([nome, c]) => {
    const channels = [], samplers = [];
    for (const [chave, f] of Object.entries(c.faixas)) {
      const [osso, campo] = chave.split(".");
      if (idx[osso] == null) throw new Error("osso sem nó no modelo: " + osso);
      samplers.push({ input: acessor(f.t, "SCALAR", true), output: acessor(f.v, f.n === 4 ? "VEC4" : "VEC3"), interpolation: "LINEAR" });
      channels.push({ sampler: samplers.length - 1, target: { node: idx[osso], path: campo } });
    }
    return { name: nome, channels, samplers };
  });
  const bin = Buffer.concat(partes);
  const json = { asset: { version: "2.0", generator: "converter-mixamo (octogono)" }, scenes: modelo.json.scenes, scene: modelo.json.scene || 0,
    nodes, animations, bufferViews, buffers: [{ byteLength: bin.length }], accessors };
  let j = Buffer.from(JSON.stringify(json), "utf8");
  j = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 0x20)]);
  const cab = Buffer.alloc(12), cj = Buffer.alloc(8), cb = Buffer.alloc(8);
  cab.writeUInt32LE(0x46546c67, 0); cab.writeUInt32LE(2, 4); cab.writeUInt32LE(12 + 8 + j.length + 8 + bin.length, 8);
  cj.writeUInt32LE(j.length, 0); cj.writeUInt32LE(0x4e4f534a, 4);
  cb.writeUInt32LE(bin.length, 0); cb.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(saida, Buffer.concat([cab, cj, j, cb, bin]));
  return fs.statSync(saida).size;
}

/* ---------- comparar dois clipes (a prova contra o mx_lutas.glb) ---------- */
export function compararClipes(a, b, instantes = 10) {
  const ossos = [...new Set(Object.keys(a.faixas).filter((k) => k.endsWith(".rotation")))];
  const faltam = ossos.filter((k) => !b.faixas[k]).concat(Object.keys(b.faixas).filter((k) => k.endsWith(".rotation") && !a.faixas[k]));
  let soma = 0, n = 0, max = 0, pior = null;
  const dur = Math.min(a.duracao, b.duracao);
  for (const k of ossos) {
    if (!b.faixas[k]) continue;
    for (let i = 0; i < instantes; i++) {
      const t = dur * i / (instantes - 1);
      const d = angulo(amostrar(a.faixas[k], t), 0, amostrar(b.faixas[k], t), 0);
      soma += d; n++;
      if (d > max) { max = d; pior = `${k} em ${t.toFixed(2)} s`; }
    }
  }
  return { media: soma / n, max, pior, faltam, difDuracao: Math.abs(a.duracao - b.duracao) };
}

/* ---------- linha de comando ---------- */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [lista, saida = path.join(RAIZ, "luta3d", "mx_cartas.glb")] = process.argv.slice(2);
  if (!lista) { console.error("uso: MIXAMO_THREE=<pasta> node ferramentas/converter-mixamo.mjs <lista.tsv> [saida.glb]"); process.exit(1); }
  const { FBXLoader } = await carregarThree();
  if (!FBXLoader) { console.error("MIXAMO_THREE não definido"); process.exit(1); }
  const modelo = lerGLB(GLB_MODELO), clipes = {};
  for (const linha of fs.readFileSync(lista, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))) {
    const [arq, nome] = linha.split("\t");
    const fbx = lerFBX(FBXLoader, path.isAbsolute(arq) ? arq : path.join(path.dirname(lista), arq));
    const c = converterClipe(fbx, modelo);
    for (const k of Object.keys(c.faixas)) c.faixas[k] = enxugar(c.faixas[k]);
    clipes[nome] = c;
    console.log(`${nome}: ${c.duracao.toFixed(2)} s, ${Object.values(c.faixas).reduce((s, f) => s + f.t.length, 0)} quadros-chave`);
  }
  const bytes = escreverGLB(clipes, saida, modelo);
  console.log(`${Object.keys(clipes).length} clipes em ${saida} (${(bytes / 1024).toFixed(0)} KB)`);
}
