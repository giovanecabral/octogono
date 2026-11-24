// Lutador 3D: corpo realista (malha escaneada CC0 da Blender Studio, com esqueleto, pesos e pele do MakeHuman;
// ferramentas/corpo3d) no esqueleto do corpo de antes, então as animações de captura de movimento do Mixamo
// convertidas pra ele valem sem conversão nova. Cabelo e roupas vêm em luta3d/pecas, só os da luta.
// O deslocamento que a animação traz no quadril vira deslocamento da raiz do
// lutador (root motion), então os pés não escorregam e o golpe anda junto.
import * as THREE from "./vendor/three.module.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import * as SkeletonUtils from "./vendor/SkeletonUtils.js";
import { pecasDaOrelha, aplicarPorte, pintarPele, pintarCabelo, infoDoCorpo, texturaBandeira } from "./aparencia.js";

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const CIMA = new THREE.Vector3(0, 1, 0);
/* pontos do corpo que descrevem a pose (pra achar o quadro mais parecido entre dois clipes) */
const PONTOS = ["Head", "spine_03", "hand_l", "hand_r", "lowerarm_l", "lowerarm_r", "calf_l", "calf_r", "foot_l", "foot_r"];
/* cadeias de dois ossos pro IK de contato */
const CADEIA = { hand_l: ["upperarm_l", "lowerarm_l", "hand_l"], hand_r: ["upperarm_r", "lowerarm_r", "hand_r"],
  ball_l: ["thigh_l", "calf_l", "foot_l"], ball_r: ["thigh_r", "calf_r", "foot_r"] };
const suaveK = (k) => k * k * (3 - 2 * k);
/* o olhar na altura dos olhos: com o osso da cabeça nivelado, o rosto do corpo escaneado aponta pra cima;
   a frente do osso uns 17 graus abaixo do horizontal é o olhar reto (medido nas fotos: a guarda olha 24 graus abaixo) */
export const NIVEL_OLHAR = 0.3;
/* quanto a clavícula acompanha o braço (fração do ângulo até o alvo e teto, em radianos) */
export const RITMO_OMBRO = { frac: 0.5, max: 0.32 };

/* ---------- carga única ---------- */
/* clipes do Mixamo no formato do jogo: o deslocamento do quadril vira curva (root motion) e o osso fica no lugar */
function juntarClipes(animacoes, M, Mi, clips, curvas) {
  for (const c of animacoes) {
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
}
/* Os clipes das cartas (mx_cartas.glb, fora do git como o mx_lutas.glb) chegam depois que a luta abre.
   Se o arquivo faltar ou vier quebrado, nada muda: a luta usa o lance de reserva (lances-cartas.js,
   clipeDoLance). Devolve quantos clipes entraram; nunca lança. */
export async function carregarCartas(base, dir = "./", abrir = null) {
  try {
    const L = new GLTFLoader();
    const anim = abrir ? await abrir(L, "mx_cartas.glb") : await L.loadAsync(dir + "mx_cartas.glb");
    if (!anim || !Array.isArray(anim.animations)) return 0;
    const M = base.matrizPai, Mi = M.clone().invert();
    const clips = {}, curvas = {};
    juntarClipes(anim.animations, M, Mi, clips, curvas);
    Object.assign(base.clips, clips); Object.assign(base.curvas, curvas);
    return Object.keys(clips).length;
  } catch (e) { return 0; }
}

export async function carregarBase(dir = "./", abrir = null) {   // dir e abrir ficam na base (carregarPecas usa)
  const L = new GLTFLoader();
  const ler = abrir ? (f) => abrir(L, f) : (f) => L.loadAsync(dir + f);
  const [corpo, anim, corr] = await Promise.all([...["lutador.glb", "mx_lutas.glb"].map(ler),
    abrir ? Promise.resolve(null) : fetch(dir + "corretivos.json").then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
  // espaço do pai da pelve (osso "root") no modelo em repouso
  corpo.scene.updateMatrixWorld(true);
  const pelve = corpo.scene.getObjectByName("pelvis");
  const M = pelve.parent.matrixWorld.clone(), Mi = M.clone().invert();
  const clips = {}, curvas = {};
  juntarClipes(anim.animations, M, Mi, clips, curvas);
  // o corpo em repouso (pra pintar a pele e achar a orelha) e a passagem do corpo pro espaço do osso da cabeça
  let corpoPele = null; corpo.scene.traverse((o) => { if (o.isSkinnedMesh && o.material.name === "MI_Pele") corpoPele = o; });
  const { info, orelha } = infoDoCorpo(corpoPele);
  const axila = prepararAxila(corpoPele), ombro = prepararOmbro(corpoPele);
  if (corr && !CORRETIVOS.desligados) prepararCorretivos(corpoPele, corr, ombro);
  // escápula e torção nos pesos de toda malha com pele do GLB (corpo, calção, luva, punho), cada uma no bind dela
  corpo.scene.traverse((o) => { if (o.isSkinnedMesh) pesosDoOmbro(o.geometry, o.skeleton, o.bindMatrix, o === corpoPele); });
  // cabelo e roupa de cabeça vêm em coordenadas do corpo em T: vão pro espaço da cabeça pelo bind em T (o do calção;
  // o corpo tem bind próprio, na pose em que foi esculpido)
  let malhaT = null; corpo.scene.traverse((o) => { if (o.isSkinnedMesh && o.material.name === "MI_Calcao") malhaT = o; });
  malhaT = malhaT || corpoPele;
  const iH = malhaT.skeleton.bones.findIndex((b) => b.name === "Head");
  const paraCabeca = new THREE.Matrix4().multiplyMatrices(malhaT.skeleton.boneInverses[iH], malhaT.bindMatrix);
  return { corpo, clips, curvas, info, orelha, matrizPai: M, paraCabeca, pecas: {}, dir, abrir, axila, ombro };
}
/* Cabelo e roupa: um GLB por peça em pecas/ (cortes só com a geometria; roupas de corpo com pesos),
   baixados só os da luta, e as texturas de fios e de cachos uma vez. Falhou: o lutador fica com a pintura na pele
   e sem a roupa. Nunca lança. */
export async function carregarPecas(base, opcoes) {
  const L = new GLTFLoader(), nomes = new Set();
  for (const o of opcoes) {
    if (!o) continue;
    const c = MALHA_CABELO[{ buzzed: "militar", barba: "cheia" }[o.cabelo] || o.cabelo], b = MALHA_BARBA[{ barba: "cheia" }[o.barba] || o.barba];
    if (c) nomes.add(c); if (b) nomes.add(b); if (EXTRA_CABELO[c]) nomes.add(EXTRA_CABELO[c]);
    for (const r of pecasDeRoupa(o)) nomes.add(r);
  }
  nomes.add("rosto_sobrancelhas");   // todo lutador
  const ler = (f) => base.abrir ? base.abrir(L, f) : L.loadAsync(base.dir + f);
  const textura = (f) => new THREE.TextureLoader().loadAsync(base.dir + f).then((t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }).catch(() => null);
  if (!base.fios) {
    base.fios = textura("fios.webp"); base.cachos = textura("cachos.webp");
    // fio fino do volume esculpido (cor) e o relevo dele (normal: dado, não cor)
    const relevo = (f) => textura(f).then((t) => { if (t) t.colorSpace = THREE.NoColorSpace; return t; });
    base.mechaTex = Promise.all([textura("mecha.webp"), relevo("mecha_n.webp"), textura("crespo.webp"), relevo("crespo_n.webp")]);
  }
  await Promise.all([...nomes].filter((n) => !(n in base.pecas)).map(async (n) => {
    try {
      const g = await ler("pecas/" + n + ".glb"); let geo = null;
      if (n.startsWith("roupa_")) { base.pecas[n] = partesDaRoupa(base, g, n); return; }
      g.scene.updateMatrixWorld(true);
      g.scene.traverse((o) => { if (o.isMesh && !geo) geo = o.geometry.clone().applyMatrix4(o.matrixWorld); });
      if (geo && !geo.attributes.normal) geo.computeVertexNormals();   // o arquivo do cabelo vem sem normal (menor)
      base.pecas[n] = geo ? geo.applyMatrix4(base.paraCabeca) : null;
    } catch (e) { base.pecas[n] = null; }
  }));
  base.texFios = await base.fios; base.texCachos = await base.cachos;
  [base.texMecha, base.texMechaN, base.texCrespo, base.texCrespoN] = await base.mechaTex;
}
function amostrar(cv, t) {
  const T = cv.tempos, n = T.length;
  if (t <= T[0]) return [cv.xs[0], cv.zs[0]];
  if (t >= T[n - 1]) return [cv.xs[n - 1], cv.zs[n - 1]];
  let i = Math.min(n - 2, Math.floor(t / (T[1] - T[0]))); while (i < n - 2 && T[i + 1] < t) i++; while (i > 0 && T[i] > t) i--;
  const k = (t - T[i]) / (T[i + 1] - T[i]);
  return [cv.xs[i] + (cv.xs[i + 1] - cv.xs[i]) * k, cv.zs[i] + (cv.zs[i + 1] - cv.zs[i]) * k];
}

/* ---------- textura da pele: o tom do boneco e as marcas (cabelo curto, barba, cicatriz, tatuagem), em 2048 ---------- */
function tingirTextura(mapOrig, pele, marcas = null) {
  const img = mapOrig.image, w = img.width, h = img.height;
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const cx = cv.getContext("2d"); cx.drawImage(img, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h), px = d.data;
  // ref: a cor média da pele na textura (mediana da textura assada do corpo)
  const P = new THREE.Color(pele), ref = [0.85, 0.63, 0.51];
  // pele bem escura: na luz do 3D ela virava preto brilhante (achado do dono); sobe um pouco os médios
  const lum = 0.3 * P.r + 0.59 * P.g + 0.11 * P.b;
  if (lum < 0.3) P.lerp(new THREE.Color("#8d5f42"), (0.3 - lum) * 1.4);
  for (let i = 0; i < px.length; i += 4) {
    const lum = 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2];
    for (let k = 0; k < 3; k++) px[i + k] += (lum - px[i + k]) * 0.22;
    px[i] = Math.min(255, px[i] * P.r / ref[0]); px[i + 1] = Math.min(255, px[i + 1] * P.g / ref[1]); px[i + 2] = Math.min(255, px[i + 2] * P.b / ref[2]);
  }
  cx.putImageData(d, 0, 0);
  if (marcas) marcas(cx, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.flipY = mapOrig.flipY; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = mapOrig.wrapS; t.wrapT = mapOrig.wrapT; t.anisotropy = 4;
  return t;
}

/* trama de tecido (relevo procedural, repete): fios que passam por cima e por baixo, com uma irregularidade leve;
   vai no normalMap do calção e das roupas de pano (algodão, moletom), com a escala de cada tecido */
let _trama = null;
function trama() {
  if (_trama) return _trama;
  try {
    const N = 256, P = 8, cv = document.createElement("canvas"); cv.width = cv.height = N; const c = cv.getContext("2d"), im = c.createImageData(N, N), r = sorteio(9);
    const alt = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = Math.floor(x / P), j = Math.floor(y / P), fx = (x % P) / P, fy = (y % P) / P;
      const urdume = Math.sin(Math.PI * fx), trama_ = Math.sin(Math.PI * fy), cima = (i + j) % 2 === 0;
      alt[y * N + x] = (cima ? urdume * (0.6 + 0.4 * trama_) : trama_ * (0.6 + 0.4 * urdume)) + (r() - 0.5) * 0.08;
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = alt[y * N + (x + 1) % N] - alt[y * N + (x + N - 1) % N], dy = alt[((y + 1) % N) * N + x] - alt[((y + N - 1) % N) * N + x];
      const n = new THREE.Vector3(-dx, -dy, 0.6).normalize(), k = (y * N + x) * 4;
      im.data[k] = (n.x * 0.5 + 0.5) * 255; im.data[k + 1] = (n.y * 0.5 + 0.5) * 255; im.data[k + 2] = (n.z * 0.5 + 0.5) * 255; im.data[k + 3] = 255;
    }
    c.putImageData(im, 0, 0);
    _trama = new THREE.CanvasTexture(cv); _trama.wrapS = _trama.wrapT = THREE.RepeatWrapping;
  } catch (e) { _trama = null; }   // sem canvas (teste em Node)
  return _trama;
}
function comTrama(escala, forca) {
  const t = trama(); if (!t) return {};
  const tt = t.clone(); tt.repeat.set(escala, escala); tt.needsUpdate = true;
  return { normalMap: tt, normalScale: new THREE.Vector2(forca, forca) };
}
const sorteio = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);
function materialDaRoupa(peca, mat, opt, base) {
  const cor = new THREE.Color(opt.corEntrada || "#D7261E"), M = (o) => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.85, ...o });
  // cetim: brilho de tecido (sheen) e pouca aspereza, sem metal (antes parecia plástico)
  const cetim = (c) => new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, color: c, roughness: 0.38, sheen: 1, sheenRoughness: 0.35, sheenColor: c.clone().lerp(new THREE.Color("#ffffff"), 0.35) });
  if (peca === "roupa_roupao") return mat === "MI_Debrum" ? M({ color: "#d4a017", metalness: 0.7, roughness: 0.32 }) : mat === "MI_Cinta" ? cetim(cor.clone().multiplyScalar(0.72)) : cetim(cor);
  if (peca === "roupa_kimono") {
    const gi = ["f2eee6", "1f3a6e", "16181e"].includes(cor.getHexString()) ? cor.clone() : new THREE.Color("#f2eee6");
    return mat === "MI_Cinta" ? M({ color: "#15161b", roughness: 0.8, ...comTrama(90, 0.6) }) : M({ color: mat === "MI_Lapela" ? gi.clone().multiplyScalar(0.9) : gi, roughness: 0.95, ...comTrama(45, 0.9) });
  }
  if (peca === "roupa_moletom") return mat === "MI_Cordao" ? M({ color: "#c9cbd2" }) : M({ color: mat === "MI_Debrum" ? cor.clone().multiplyScalar(0.8) : cor, roughness: 1, ...comTrama(120, 0.35) });
  if (peca === "roupa_bandeira") return mat === "MI_Bandeira" ? M({ map: texturaBandeira() }) : M({ color: "#1e8c45" });
  if (peca === "roupa_arbitro") return M({ color: "#121318", roughness: 0.9, ...comTrama(110, 0.4) });
  if (peca === "roupa_mongkol") return M({ color: mat === "MI_Branco" ? "#f2eee6" : cor, roughness: 0.75 });
  if (peca === "roupa_papakha") return M({ color: cor.getHex() === 0x16181e ? "#2a2724" : "#e4ded0", map: base.texCachos, alphaTest: 0.3, vertexColors: true, roughness: 1 });
  return M({ color: cor });   // prajiad
}
function vestir(lutador, base, opt) {
  const out = { entrada: [], fixas: [] };
  for (const n of pecasDeRoupa(opt)) {
    for (const p of base.pecas[n] || []) {
      const mat = materialDaRoupa(n, p.mat, opt, base);
      let m;
      if (p.cabeca) { m = new THREE.Mesh(p.geo, mat); lutador.ossos.Head.add(m); }
      else { const T = lutador.malhaT || lutador.corpo; m = new THREE.SkinnedMesh(p.geo, mat); m.bind(T.skeleton, T.bindMatrix); lutador.corpo.parent.add(m); peleDQ(m); }   // roupa feita no corpo em T: bind em T
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      (n === "roupa_prajiad" || n === "roupa_arbitro" ? out.fixas : out.entrada).push(m);
    }
  }
  return out;
}
/* pele embaixo do moletom (2026-11-21): na guarda o cotovelo e o braço dobrados furavam a manga e as costas (o pano
   segue os mesmos ossos, mas afastado do corpo ele não acompanha a dobra). Como nos jogos, a pele que a peça cobre
   não é desenhada enquanto ela está vestida: os triângulos só do tronco, do ombro, do braço e do começo do antebraço
   (longe do punho, da barra e da gola). Geometria nova com os mesmos atributos e só o índice filtrado; o corpo de
   sempre volta quando a roupa sai. */
const OSSOS_TRONCO_BRACO = ["spine_01", "spine_02", "spine_03", "clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r", "axila_l", "axila_r", "lowerarm_l", "lowerarm_r"];
// roupão e quimono (2026-11-23) são abertos na frente: só as costas (atrás da pelve) e os braços somem; o corpo
// amarrado na pose da escultura furava as costas deles na guarda
const ABERTO = { ossos: OSSOS_TRONCO_BRACO, antebraco: 0.55, costas: true };
// o uniforme do árbitro (2026-11-23) é fixo e nunca sai: camisa de manga curta (até 56% do úmero) e calça até o
// tornozelo. Antes a pele dele nunca sumia, e o ombro e as costas furavam a camisa no anúncio
const ARBITRO = { ossos: OSSOS_TRONCO_BRACO.filter((n) => !n.startsWith("lowerarm")).concat(["neck_01", "thigh_l", "thigh_r", "calf_l", "calf_r"]), umero: 0.52, perna: 0.8, ombro: true };
export const COBERTO = { capuz: { ossos: OSSOS_TRONCO_BRACO, antebraco: 0.55 }, "roupão": ABERTO, kimono: ABERTO, arbitro: ARBITRO };
export function triangulosCobertos(geo, skeleton, bindMatrix, regra) {
  // os ossos auxiliares do ombro contam como o osso que eles seguem (a escápula é do tronco)
  const ossos = skeleton.bones.map((b) => b.name.replace(/^umero_giro_/, "upperarm_").replace(/^antebraco_giro_/, "lowerarm_").replace(/^escapula_[lr]$/, "spine_03"));
  const em = new Set(ossos.map((n, i) => (regra.ossos.includes(n) ? i : -1)).filter((i) => i >= 0));
  const bindPos = (n) => ossos.includes(n) ? new THREE.Vector3().setFromMatrixPosition(skeleton.boneInverses[ossos.indexOf(n)].clone().invert()) : null;
  const pelve = bindPos("pelvis"), pescoco = bindPos("neck_01");
  const braco = { l: [bindPos("lowerarm_l"), bindPos("hand_l")], r: [bindPos("lowerarm_r"), bindPos("hand_r")] };   // (osso que falta: nada daquele lado some)
  const umero = { l: [bindPos("upperarm_l"), bindPos("lowerarm_l")], r: [bindPos("upperarm_r"), bindPos("lowerarm_r")] };
  const canela = { l: [bindPos("calf_l"), bindPos("foot_l")], r: [bindPos("calf_r"), bindPos("foot_r")] };
  const fracao = ([a, b], v) => { if (!a || !b) return 9; const ab = b.clone().sub(a); return v.clone().sub(a).dot(ab) / ab.lengthSq(); };
  const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, v = new THREE.Vector3();
  const coberto = new Uint8Array(pos.count), braco_ = new Set();
  if (regra.costas) {   // vértice que é quase todo do braço (úmero, axila, antebraço) some inteiro, na frente também
    const ib = new Set(ossos.map((n, i) => (["upperarm_l", "upperarm_r", "axila_l", "axila_r", "lowerarm_l", "lowerarm_r"].includes(n) ? i : -1)).filter((i) => i >= 0));
    for (let i = 0; i < pos.count; i++) { let w = 0; for (let k = 0; k < 4; k++) if (ib.has(si.getComponent(i, k))) w += sw.getComponent(i, k); if (w > 0.6) braco_.add(i); }
  }
  for (let i = 0; i < pos.count; i++) {
    let dentro = 0, ante = null, um = null, perna = 0, can = null, presa = 0;
    for (let k = 0; k < 4; k++) {
      const o = si.getComponent(i, k), w = sw.getComponent(i, k);
      if (w > 0 && em.has(o)) {
        dentro += w; const n = ossos[o]; if (n.startsWith("lowerarm") && w > 0.05) ante = n.slice(-1);
        if ((n.startsWith("upperarm") || n.startsWith("axila")) && w > 0.05) um = n.slice(-1);
        if (n.startsWith("axila") || n.startsWith("spine") || n.startsWith("clavicle")) presa += w;
        if (n.startsWith("thigh") || n.startsWith("calf")) perna += w; if (n.startsWith("calf") && w > 0.05) can = n.slice(-1);
      }
    }
    if (dentro < 0.9) continue;   // (o corpo escaneado espalha um pouco de peso pra pelve e pescoço; as bordas ficam pela altura)
    v.fromBufferAttribute(pos, i).applyMatrix4(bindMatrix);
    // depois da manga curta; a pele da axila (presa ao tronco) fica sempre embaixo da manga: com o braço em A da
    // escultura ela cai além da fração do úmero e sobrava uma lasca furando a manga por trás
    if (regra.umero && um && presa < 0.15 && fracao(umero[um], v) > regra.umero) continue;
    if (regra.perna && can && fracao(canela[can], v) > regra.perna) continue;   // perto do tornozelo, fora da calça
    if (!(regra.perna && perna > 0.5) && v.y < pelve.y + 0.03) continue;
    // a gola: só perto do pescoço (com a altura sozinha o alto do ombro e o trapézio, acima da base do pescoço na
    // escultura, ficavam e furavam a camisa do árbitro)
    if (v.y > pescoco.y - 0.025 && (!regra.ombro || Math.hypot(v.x - pescoco.x, v.z - pescoco.z) < 0.085)) continue;
    if (regra.costas && !ante && !braco_.has(i) && v.z > pelve.z - 0.01) continue;   // aberto na frente: o peito fica
    if (ante) { const [a, b] = braco[ante]; if (!a || !b) continue; const ab = b.clone().sub(a); if (v.clone().sub(a).dot(ab) / ab.lengthSq() > regra.antebraco) continue; }
    coberto[i] = 1;
  }
  const idx = geo.index.array, fica = [];
  for (let k = 0; k < idx.length; k += 3) if (!(coberto[idx[k]] && coberto[idx[k + 1]] && coberto[idx[k + 2]])) fica.push(idx[k], idx[k + 1], idx[k + 2]);
  return fica;
}
/* a mão embaixo da luva (2026-11-23): a luva é a casca da mão até a falange do meio, e no punho fechado a pele dela
   furava o dorso da luva (dois pontos de pele em toda luva de trás). Quem luta de luva não desenha a pele que a luva
   cobre (palma e duas falanges; a ponta do dedo fica de fora, como na luva de MMA); o árbitro (semLuva) desenha tudo */
export function triangulosSemMao(geo, skeleton, pontas = "") {
  // a palma e as duas primeiras falanges (o que a luva cobre); a ponta do dedo fica de fora, como na luva de MMA,
  // menos na mão fechada (pontas: "l", "r" ou "lr"), onde ela furava o dorso da luva
  const mao = new Set(skeleton.bones.map((b, i) => (/^(hand_|thumb_01|(index|middle|ring|pinky)_0[12])/.test(b.name)
    || (/^(thumb|index|middle|ring|pinky)_0[23]_[lr]$/.test(b.name) && pontas.includes(b.name.slice(-1))) ? i : -1)).filter((i) => i >= 0));
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, n = si.count, naMao = new Uint8Array(n);
  for (let i = 0; i < n; i++) { let w = 0; for (let k = 0; k < 4; k++) if (mao.has(si.getComponent(i, k))) w += sw.getComponent(i, k); naMao[i] = w > 0.5 ? 1 : 0; }
  const idx = geo.index.array, fica = [];
  for (let k = 0; k < idx.length; k += 3) if (!(naMao[idx[k]] && naMao[idx[k + 1]] && naMao[idx[k + 2]])) fica.push(idx[k], idx[k + 1], idx[k + 2]);
  return fica;
}
function corpoSemMao(lutador, base, geo, pontas = "") {
  const c = lutador.corpo, chave = "mao|" + geo.uuid + "|" + pontas; base.semMao = base.semMao || {};
  if (!base.semMao[chave]) {
    const g = new THREE.BufferGeometry();
    for (const [n, a] of Object.entries(geo.attributes)) g.setAttribute(n, a);
    g.morphAttributes = geo.morphAttributes; g.morphTargetsRelative = geo.morphTargetsRelative;   // os alvos de forma do porte
    g.setIndex(triangulosSemMao(geo, c.skeleton, pontas));
    base.semMao[chave] = g;
  }
  return base.semMao[chave];
}
function corpoSemCoberto(lutador, base, entrada) {
  const regra = COBERTO[entrada]; if (!regra || !lutador.corpo) return null;
  const c = lutador.corpo, chave = "cob_" + entrada + "|" + c.geometry.uuid; base.cobertos = base.cobertos || {};   // a geometria já com o porte
  if (!base.cobertos[chave]) {
    const g = new THREE.BufferGeometry();
    for (const [n, a] of Object.entries(c.geometry.attributes)) g.setAttribute(n, a);
    g.morphAttributes = c.geometry.morphAttributes; g.morphTargetsRelative = c.geometry.morphTargetsRelative;   // os alvos de forma do porte
    g.setIndex(triangulosCobertos(c.geometry, c.skeleton, c.bindMatrix, regra));
    base.cobertos[chave] = g;
  }
  return base.cobertos[chave];
}
/* cabelo (etapa 3, 2026-11-21): um GLB por corte em pecas/, preso ao osso da cabeça. Os cortes são VOLUME esculpido
   (malha sólida com mechas, sulcos, topete, caroços do crespo; mecha.webp/crespo.webp só põem o fio fino e o relevo):
   mecha recortada pelo alfa granulava de qualquer jeito ("granulado", "espalhado demais", reprovado pelo dono).
   Tranças, dreads e os cachos em saca-rolha são tubos fechados. O raspado e a sombra embaixo de tudo são pintura
   lisa na pele (pintarCabelo). */
/* barba, bigode e sobrancelha: volume fino esculpido do mesmo jeito, com a borda sumindo pelo alfa do vértice */
const MALHA_BARBA = { cheia: "barba_cheia", "sem bigode": "barba_sembigode", cavanhaque: "barba_cavanhaque", ferradura: "barba_ferradura" };
function materialDoPelo(base, cor) {
  return new THREE.MeshStandardMaterial({ map: base.texMecha, normalMap: base.texMechaN, normalScale: new THREE.Vector2(0.5, 0.5), color: cor, vertexColors: true,
    transparent: true, depthWrite: true, roughness: 0.86, envMapIntensity: 0.1 });   // fosco: com brilho o bigode lia cinza, pintado
}
// volume do corte: opaco, fio fino e relevo da textura, brilho esticado ao longo do fio no liso, fosco no crespo
const CRESPO = new Set(["cabelo_cacheado", "cabelo_blackpower"]);
function materialDoVolume(base, cor, crespo) {
  return new THREE.MeshPhysicalMaterial({ map: crespo ? base.texCrespo : base.texMecha, normalMap: crespo ? base.texCrespoN : base.texMechaN,
    normalScale: new THREE.Vector2(0.7, 0.7), color: cor, vertexColors: true, roughness: crespo ? 0.78 : 0.5, specularIntensity: crespo ? 0.2 : 0.4,
    anisotropy: crespo ? 0 : 0.6, anisotropyRotation: Math.PI / 2, envMapIntensity: 0.3 });
}
const EXTRA_CABELO = { cabelo_cacheado: "cabelo_cacheado_cachos" };   // os cachos em saca-rolha em volta do volume
const MALHA_CABELO = { repartido: "cabelo_repartido", moicano: "cabelo_moicano", "trança nagô": "cabelo_tranca", dreads: "cabelo_dreads",
  coque: "cabelo_coque", "black power": "cabelo_blackpower", cacheado: "cabelo_cacheado" };
/* roupas (entrada e as fixas): um GLB por peça em pecas/. As de corpo vêm com pesos e entram no
   esqueleto do lutador pelo nome do osso; mongkol e papakha são da cabeça (sem pesos), como o cabelo. */
const ROUPA_ENTRADA = { "roupão": "roupa_roupao", kimono: "roupa_kimono", capuz: "roupa_moletom", bandeira: "roupa_bandeira", mongkol: "roupa_mongkol", papakha: "roupa_papakha" };
const ROUPA_CABECA = new Set(["roupa_mongkol", "roupa_papakha"]);
function pecasDeRoupa(o) {
  const out = []; if (ROUPA_ENTRADA[o.entrada]) out.push(ROUPA_ENTRADA[o.entrada]);
  if (o.prajiad === "com") out.push("roupa_prajiad"); if (o.uniforme === "arbitro") out.push("roupa_arbitro");
  return out;
}
const NOME_OSSO = { head: "Head", Root: "root" };
function partesDaRoupa(base, g, n) {
  const partes = []; g.scene.updateMatrixWorld(true);
  let corpo = null, calcao = null; base.corpo.scene.traverse((o) => { if (o.isSkinnedMesh && o.material.name === "MI_Pele") corpo = o; if (o.isSkinnedMesh && o.material.name === "MI_Calcao") calcao = o; });
  const ossos = corpo.skeleton.bones.map((b) => b.name), paraLocal = corpo.bindMatrix.clone().invert();
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld), mat = (o.material.name || "").replace(/\.\d+$/, "");
    if (ROUPA_CABECA.has(n)) { geo.applyMatrix4(base.paraCabeca); if (geo.attributes.uv && mat === "MI_Pelo") cascaPorCamada(geo); partes.push({ geo, mat, cabeca: true }); return; }
    // osso da roupa -> osso do corpo (mesmo nome; o Blender chama a cabeça de "head")
    const si = geo.attributes.skinIndex, mapa = o.skeleton.bones.map((b) => ossos.indexOf(NOME_OSSO[b.name] || b.name));
    const novo = new Uint16Array(si.count * 4);
    for (let i = 0; i < si.count; i++) for (let k = 0; k < 4; k++) novo[i * 4 + k] = Math.max(0, mapa[si.getComponent(i, k)]);
    geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(novo, 4));
    geo.applyMatrix4(paraLocal); if (calcao) pesosDoOmbro(geo, calcao.skeleton, calcao.bindMatrix);   // escápula e torção, no bind em T
    partes.push({ geo, mat });
  });
  return partes;
}
/* cascas (o pelo do papakha): o UV traz v + 10 * camada + 100 * borda (0 na borda da região, 9 longe dela); vira
   alfa no vértice: cada camada mais rala pra fora, e os fios somem perto da borda */
function cascaPorCamada(geo, rala = 1) {
  const uv = geo.attributes.uv, cor = new Float32Array(uv.count * 4);
  // o glTF guarda v invertido (1 - v do Blender): desfaz, decodifica e devolve só a parte da textura
  const borda = new Float32Array(uv.count), camada = new Int16Array(uv.count);
  let n = 1;
  for (let i = 0; i < uv.count; i++) {
    let v = 1 - uv.getY(i); const b = Math.floor(v / 100); v -= 100 * b; const k = Math.floor(v / 10); v -= 10 * k;
    borda[i] = Math.min(1, b / 9); camada[i] = k; n = Math.max(n, k + 1); uv.setY(i, 1 - v);
  }
  for (let i = 0; i < uv.count; i++) {
    const k = camada[i];
    const t = n > 1 ? k / (n - 1) : 0, l = 0.5 + 0.5 * t, d = 0.25 + 0.75 * borda[i];
    cor.set([l, l, l, (1 - 0.62 * t) * rala * d], i * 4);   // de dentro escuro (sombra) e cheio, de fora claro e ralo
  }
  geo.setAttribute("color", new THREE.BufferAttribute(cor, 4));
}
const corDoFio = (cor) => new THREE.Color(cor || "#2a1d14").multiplyScalar(1.6);   // o atlas é cinza claro e a raiz vem escura no vértice
/* material dos tubos (tranças, dreads, cachos em saca-rolha): malha fechada com a textura de fios, sombra da raiz no
   vértice e o brilho esticado ao longo do fio (anisotropia) */
function materialDoFio(base, cor) {
  return new THREE.MeshPhysicalMaterial({ map: base.texFios, color: cor, vertexColors: true, side: THREE.DoubleSide,
    roughness: 0.55, specularIntensity: 0.35, anisotropy: 0.7, anisotropyRotation: Math.PI / 2, envMapIntensity: 0.25 });
}

/* ---------- osso da axila (2026-11-23) ----------
   Braço erguido gira o úmero uns 150 graus a partir da pose da escultura; a pele entre o braço e o tronco, que mistura
   os dois, achatava numa aba (skinning linear) ou inchava em asas (quatérnio duplo). Como nos rigs de jogo, um osso
   auxiliar em cada ombro gira a metade do que o braço gira (filho da clavícula, no lugar do úmero) e fica com a faixa
   de transição: quem era metade braço e metade tronco vira todo dele, e cada mistura que sobra cobre só a metade do
   ângulo. Só no corpo e só no jogo: o esqueleto das animações não muda. */
let RAIO_AXILA = 0.3;   // até onde (do ombro, no bind) a pele de transição passa pro osso da axila
export function raioAxila(r) { RAIO_AXILA = r; }
export function prepararAxila(corpo) {
  const sk = corpo.skeleton, nomes = sk.bones.map((b) => b.name), nb = nomes.length, out = { nb, lados: [] };
  const g = corpo.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const Wb = (i) => sk.boneInverses[i].clone().invert();   // o osso na pose do bind do corpo
  ["l", "r"].forEach((s, k) => {
    const iU = nomes.indexOf("upperarm_" + s), iC = nomes.indexOf("clavicle_" + s);
    if (iU < 0 || iC < 0) return;
    const local = Wb(iC).invert().multiply(Wb(iU)), p = new THREE.Vector3(), q = new THREE.Quaternion(); local.decompose(p, q, new THREE.Vector3());
    const resto = new Set(nomes.map((n, i) => [n, i]).filter(([n]) => n.endsWith("_" + s) && /^(lowerarm|hand|thumb|index|middle|ring|pinky)/.test(n)).map(([, i]) => i));
    const iA = nb + k, ombro = new THREE.Vector3().setFromMatrixPosition(Wb(iU)), pos = g.attributes.position, pv = new THREE.Vector3();
    for (let v = 0; v < si.count; v++) {
      if (pv.fromBufferAttribute(pos, v).applyMatrix4(corpo.bindMatrix).distanceTo(ombro) > RAIO_AXILA) continue;   // só a região do ombro
      let u = 0, baixo = 0; const ws = [];
      for (let c = 0; c < 4; c++) { const i = si.getComponent(v, c), w = sw.getComponent(v, c); if (w <= 0) continue; if (i === iU) u += w; else { if (resto.has(i)) baixo += w; ws.push([i, w]); } }
      if (u <= 0.002 || u >= 0.998 || baixo > 0.02) continue;
      // u <= 1/2: axila 2u e o tronco o resto; u > 1/2: axila 2 - 2u e o úmero 2u - 1
      const ax = u <= 0.5 ? 2 * u : 2 - 2 * u, up = Math.max(0, 2 * u - 1), outros = Math.max(0, 1 - 2 * u), so = ws.reduce((a, [, w]) => a + w, 0);
      const novo = [[iA, ax], [iU, up], ...ws.map(([i, w]) => [i, so > 0 ? (w * outros) / so : 0])].filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const tot = novo.reduce((a, [, w]) => a + w, 0);
      for (let c = 0; c < 4; c++) { si.setComponent(v, c, novo[c] ? novo[c][0] : 0); sw.setComponent(v, c, novo[c] ? novo[c][1] / tot : 0); }
    }
    out.lados.push({ s, iU, pos: p, bindQ: q });
  });
  si.needsUpdate = sw.needsUpdate = true;
  return out;
}
/* ---------- ombro e braço: escápula, ritmo e torção (Passo 2 da anatomia, 2026-11-23) ----------
   Diagnóstico aprovado pelo dono: o calombo da escápula era a pele das costas presa à coluna (spine_03, parada)
   enquanto a borda de fora ia com a axila; o braço erguido "saía do pescoço" porque a clavícula subia só 17 graus;
   e sem osso de torção o giro do pulso ficava todo na mão (o antebraço torcia como embrulho de bala) e o do úmero
   torcia o deltoide. Como nos rigs de jogo, ossos auxiliares criados no jogo (as animações não mudam):
   - escapula_l/r: filha do tronco (spine_03), no meio da escápula; segue uma fração da clavícula em volta da junta
     do esterno (RITMO.segue: filha da clavícula, a protração da guarda marcava as costas) e roda pra cima com a
     elevação do úmero (RITMO); leva a pele das costas sobre ela (a parte da coluna que a máscara cobre);
   - umero_giro_l/r: filho do úmero, desfaz a torção dele: a pele vai de 0% da torção no ombro a 100% no cotovelo;
   - antebraco_giro_l/r: filho do antebraço, leva a torção da mão: 0% no cotovelo, 100% no pulso.
   Toda malha com pele (corpo, calção, luva, punho, roupas) ganha os mesmos ossos, no fim do esqueleto, na ordem
   de AJUDANTES; os pesos de cada geometria mudam uma vez (pesosDoOmbro), no bind dela. */
export const AJUDANTES = ["axila_l", "axila_r", "escapula_l", "escapula_r", "umero_giro_l", "umero_giro_r", "antebraco_giro_l", "antebraco_giro_r"];
/* ritmo escapuloumeral, em graus pela elevação do úmero no tronco (0 = braço caído): a clavícula sobe até
   clavicula graus entre de e ate; a escápula roda pra cima escapula grau por grau acima de escapulaDe (o 2 pra 1 do
   corpo: um terço da elevação vem dela), com teto, e a pele acompanha a fração pele (a pele desliza sobre o osso) */
export const RITMO = { clavicula: 22, de: 30, ate: 170, escapula: 0.36, escapulaDe: 15, escapulaMax: 55, pele: 0.45, segue: 0.35, golpe: 0 };
// (golpe: quanto o IK do contato sobe a clavícula pelo ritmo. 0: o encolher do ombro no soco já vem do clipe; com 1 o
// ombro subia mais 3 cm no upper e a pele do ombro dobrava mais que antes)
/* rotação externa do úmero no braço erguido pelo IK sem polo: acima de 90 graus o cotovelo (olécrano) sai de trás
   pro lado até externa graus em 180 (no corpo, 30 a 50); o polo automático entra de 70 a 110 graus. E o cotovelo
   dobra no máximo flexaoMax (145 graus no corpo; sem hiperextensão: o alcance já para antes do reto) */
/* quanto da torção os ossos de giro desfazem (úmero) e levam (antebraço): 1 = inteira */
export const TORCAO = { umero: 1, antebraco: 1, axila: 1 };
export const BRACO = { externa: 45, de: 90, ate: 180, entra: [70, 110], flexaoMax: 145 };
const suave01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/* onde a escápula fica (no bind do corpo, metros, em relação ao spine_03: x pro lado, y pra cima, z pra frente) e a
   máscara da pele que vai com ela: das costas, do meio da borda de dentro pra fora, da ponta de baixo ao alto do ombro */
// (transições largas: com 4,5 cm entre a coluna e a escápula a borda de dentro vincava em V com o braço erguido)
export const ESCAPULA = { pivo: [0.085, 0.212, -0.024], mascara: { dentro: [0.0, 0.12], baixo: [-0.05, 0.1], cima: [0.27, 0.33], costas: [0.05, -0.04] } };
const bindDe = (inv) => new THREE.Matrix4().copy(inv).invert();
/* informação do ombro no bind do corpo (pose da escultura), uma vez na carga */
export function prepararOmbro(corpo) {
  const sk = corpo.skeleton, nomes = sk.bones.map((b) => b.name), W = (n) => bindDe(sk.boneInverses[nomes.indexOf(n)]);
  const local = (n) => { const b = sk.bones[nomes.indexOf(n)], q = new THREE.Quaternion(); W(b.parent.name).invert().multiply(W(n)).decompose(new THREE.Vector3(), q, new THREE.Vector3()); return q; };
  const s3 = W("spine_03"), q3 = new THREE.Quaternion().setFromRotationMatrix(s3), q3i = q3.clone().invert(), p3 = new THREE.Vector3().setFromMatrixPosition(s3);
  const out = { lados: [], baixo: new THREE.Vector3(0, -1, 0).applyQuaternion(q3i) };   // o "pra baixo" do mundo no tronco do bind
  ["l", "r"].forEach((l) => {
    const s = l === "l" ? 1 : -1, C = W("clavicle_" + l), U = W("upperarm_" + l), Lo = W("lowerarm_" + l), H = W("hand_" + l);
    const pC = new THREE.Vector3().setFromMatrixPosition(C), pU = new THREE.Vector3().setFromMatrixPosition(U), pL = new THREE.Vector3().setFromMatrixPosition(Lo), pH = new THREE.Vector3().setFromMatrixPosition(H);
    // a escápula: pivô no tronco do bind, no espaço da clavícula; eixo da rotação pra cima, perpendicular ao plano da
    // escápula (30 graus à frente do plano das costas), no sentido que leva a ponta de baixo pra fora
    const posE = new THREE.Vector3(s * ESCAPULA.pivo[0], ESCAPULA.pivo[1], ESCAPULA.pivo[2]), eixoE = new THREE.Vector3(-s * 0.5, 0, 0.866).normalize();   // no espaço do spine_03
    // clavícula no tronco do bind (a elevação dela conta a partir daí)
    const clav = pU.clone().sub(pC).normalize().applyQuaternion(q3i);
    out.lados.push({ l, s, posE, eixoE, bindC: local("clavicle_" + l), bindU: local("upperarm_" + l), bindH: local("hand_" + l),
      eixoU: pL.clone().sub(pU).normalize().applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(U).invert()),   // o eixo do úmero no espaço dele
      eixoH: pH.clone().sub(pL).normalize().applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(H).invert()),   // o eixo do antebraço no espaço da mão
      clavElev: Math.asin(Math.max(-1, Math.min(1, clav.y))) });
  });
  return out;
}
/* pesos de uma malha com pele no bind dela (o corpo na pose da escultura, roupa e luva em T): a pele das costas sobre
   a escápula vai pro osso dela, e a do braço e do antebraço se divide com os ossos de torção ao longo do osso.
   Muda a geometria (uma vez: geo.userData.ombro). Os ossos auxiliares ficam em nb + AJUDANTES.indexOf(nome). */
/* cotovelo (só no corpo): os pesos em volta da junta passam por passadas de média com os vizinhos (a malha juntada
   pelo lugar), cheias até metade do raio e sumindo até ele: o vinco tinha arestas de 2 cm com o peso do úmero indo de
   0,73 a 0,22 (a 7 cm da junta) e virava triângulos no leve. Com 12 cm a dobra de dentro afinava demais */
export const COTOVELO = { raio: 0.1, passadas: 6 };
function suavizarPesos(geo, bindMatrix, centros, raio, passadas) {
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, P = geo.attributes.position, n = si.count, idx = geo.index && geo.index.array; if (!idx) return;
  const p = Array.from({ length: n }, (_, i) => new THREE.Vector3().fromBufferAttribute(P, i).applyMatrix4(bindMatrix));
  const chave = (v) => `${Math.round(v.x * 1e4)},${Math.round(v.y * 1e4)},${Math.round(v.z * 1e4)}`, rep = new Int32Array(n), mapa = new Map();
  for (let i = 0; i < n; i++) { const k = chave(p[i]); if (!mapa.has(k)) mapa.set(k, i); rep[i] = mapa.get(k); }
  const peso = (c) => Math.max(...centros.map((x) => 1 - suave01(raio * 0.5, raio, p[c].distanceTo(x))));   // 1 perto, 0 no raio
  const viz = new Map();
  for (let k = 0; k < idx.length; k += 3) for (const [a0, b0] of [[idx[k], idx[k + 1]], [idx[k + 1], idx[k + 2]], [idx[k + 2], idx[k]]]) {
    const a = rep[a0], b = rep[b0]; if (a === b) continue;
    for (const [x, y] of [[a, b], [b, a]]) { if (!viz.has(x)) viz.set(x, new Set()); viz.get(x).add(y); }
  }
  const W = new Map(); for (const [i] of viz) { const o = new Map(); for (let c = 0; c < 4; c++) { const w = sw.getComponent(i, c); if (w > 0) o.set(si.getComponent(i, c), (o.get(si.getComponent(i, c)) || 0) + w); } W.set(i, o); }
  const zona = [...viz.keys()].filter((i) => peso(i) > 0), f = new Map(zona.map((i) => [i, peso(i)]));
  for (let it = 0; it < passadas; it++) {
    const novo = new Map();
    for (const i of zona) {
      const m = new Map(), vz = viz.get(i);
      for (const j of vz) for (const [k, w] of W.get(j)) m.set(k, (m.get(k) || 0) + w / vz.size);
      const o = new Map(), a = 0.5 * f.get(i);
      for (const [k, w] of W.get(i)) o.set(k, w * (1 - a));
      for (const [k, w] of m) o.set(k, (o.get(k) || 0) + w * a);
      novo.set(i, o);
    }
    for (const [i, o] of novo) W.set(i, o);
  }
  for (let v = 0; v < n; v++) {
    const o = W.get(rep[v]); if (!o || !f.has(rep[v])) continue;
    const lista = [...o].filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4), tot = lista.reduce((s0, [, w]) => s0 + w, 0);
    for (let c = 0; c < 4; c++) { si.setComponent(v, c, lista[c] ? lista[c][0] : 0); sw.setComponent(v, c, lista[c] ? lista[c][1] / tot : 0); }
  }
  si.needsUpdate = sw.needsUpdate = true;
}
export function pesosDoOmbro(geo, skeleton, bindMatrix, corpo = false) {
  if (!geo.attributes.skinIndex || geo.userData.ombro) return; geo.userData.ombro = true;
  const nomes = skeleton.bones.map((b) => b.name), nb = nomes.length, idx = (n) => nomes.indexOf(n), aj = (n) => nb + AJUDANTES.indexOf(n);
  const pos = (n) => idx(n) < 0 ? null : new THREE.Vector3().setFromMatrixPosition(bindDe(skeleton.boneInverses[idx(n)]));
  const s3 = idx("spine_03") < 0 ? null : bindDe(skeleton.boneInverses[idx("spine_03")]), s3i = s3 && s3.clone().invert();
  const lados = ["l", "r"].map((l) => ({ l, iU: idx("upperarm_" + l), iL: idx("lowerarm_" + l), U: pos("upperarm_" + l), L: pos("lowerarm_" + l), H: pos("hand_" + l) }));
  const fracao = (a, b, v) => { const ab = b.clone().sub(a); return Math.min(1, Math.max(0, v.clone().sub(a).dot(ab) / ab.lengthSq())); };
  const coluna = new Set(["spine_02", "spine_03"].map(idx).filter((i) => i >= 0));
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, P = geo.attributes.position, v = new THREE.Vector3(), t3 = new THREE.Vector3(), M = ESCAPULA.mascara;
  for (let i = 0; i < si.count; i++) {
    v.fromBufferAttribute(P, i).applyMatrix4(bindMatrix);
    const ws = new Map(); for (let c = 0; c < 4; c++) { const w = sw.getComponent(i, c); if (w > 0) ws.set(si.getComponent(i, c), (ws.get(si.getComponent(i, c)) || 0) + w); }
    let mudou = false;
    // escápula: só a parte da coluna, nas costas, do lado
    if (s3) {
      t3.copy(v).applyMatrix4(s3i); const ax = Math.abs(t3.x);
      const m = suave01(M.dentro[0], M.dentro[1], ax) * suave01(M.baixo[0], M.baixo[1], t3.y) * (1 - suave01(M.cima[0], M.cima[1], t3.y)) * suave01(M.costas[0], M.costas[1], t3.z);
      if (m > 1e-3) for (const k of [...ws.keys()]) if (coluna.has(k)) { const w = ws.get(k) * m; ws.set(k, ws.get(k) - w); const e = aj(t3.x >= 0 ? "escapula_l" : "escapula_r"); ws.set(e, (ws.get(e) || 0) + w); mudou = true; }
    }
    for (const L of lados) {
      if (L.iU >= 0 && L.L && ws.has(L.iU)) {   // úmero: sem torção no ombro, inteira no cotovelo
        const t = fracao(L.U, L.L, v), w = ws.get(L.iU), g = aj("umero_giro_" + L.l);
        ws.set(L.iU, w * t); ws.set(g, (ws.get(g) || 0) + w * (1 - t)); mudou = true;
      }
      if (L.iL >= 0 && L.H && ws.has(L.iL)) {   // antebraço: a torção da mão de 0 no cotovelo a inteira no pulso
        const t = fracao(L.L, L.H, v), w = ws.get(L.iL), g = aj("antebraco_giro_" + L.l);
        ws.set(L.iL, w * (1 - t)); ws.set(g, (ws.get(g) || 0) + w * t); mudou = true;
      }
    }
    if (!mudou) continue;
    const lista = [...ws].filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4), tot = lista.reduce((a, [, w]) => a + w, 0);
    for (let c = 0; c < 4; c++) { si.setComponent(i, c, lista[c] ? lista[c][0] : 0); sw.setComponent(i, c, lista[c] ? lista[c][1] / tot : 0); }
  }
  si.needsUpdate = sw.needsUpdate = true;
  if (corpo && COTOVELO.passadas > 0) suavizarPesos(geo, bindMatrix, lados.filter((L) => L.L).map((L) => L.L), COTOVELO.raio, COTOVELO.passadas);
}
/* formas corretivas do ombro (item 6; ferramentas/corpo3d/corretivos.mjs): alvos de forma do corpo, um por lado e por
   elevação do úmero (90, 135, 160, 180), ligados pela elevação no jogo (ombros). Vêm do delta mush assado na pose:
   tiram o estiramento e a dobra que o skinning deixa na axila, no deltoide e no flanco com o braço erguido.
   Sem o arquivo, nada muda. */
export const CORRETIVOS = { desligados: false, entra: 45 };
export function prepararCorretivos(corpo, dados, ombro) {
  const g = corpo.geometry, n = g.attributes.position.count, lista = g.morphAttributes.position = g.morphAttributes.position || [];
  g.morphTargetsRelative = true;
  const dic = corpo.morphTargetDictionary = corpo.morphTargetDictionary || {};
  for (const a of dados.alvos) {
    const d = new Float32Array(n * 3);
    a.idx.forEach((v, k) => { d[3 * v] = a.d[3 * k] * dados.unidade; d[3 * v + 1] = a.d[3 * k + 1] * dados.unidade; d[3 * v + 2] = a.d[3 * k + 2] * dados.unidade; });
    const attr = new THREE.Float32BufferAttribute(d, 3); attr.name = a.nome; dic[a.nome] = lista.length; lista.push(attr);
  }
  corpo.updateMorphTargets();
  for (const o of ombro.lados) o.corretivos = dados.alvos.filter((a) => a.lado === o.l).sort((x, y) => x.graus - y.graus).map((a) => [corpo.morphTargetDictionary[a.nome], a.graus]);
}
/* peso de cada forma pela elevação: entra de CORRETIVOS.entra até a primeira, entre duas vizinhas reparte, depois da
   última fica nela */
export function pesosCorretivos(lista, e, out) {
  for (let k = 0; k < lista.length; k++) {
    const g = lista[k][1], ant = k ? lista[k - 1][1] : CORRETIVOS.entra, prox = k < lista.length - 1 ? lista[k + 1][1] : null;
    let w = 0;
    if (e <= g) w = e <= ant ? 0 : (e - ant) / (g - ant); else w = prox === null ? 1 : e >= prox ? 0 : 1 - (e - g) / (prox - g);
    out[lista[k][0]] = w;
  }
}
/* torção de q em volta do eixo a (unitário), pela decomposição balanço-torção (q = balanço * torção): a projeção de
   q no eixo. Perto do balanço de 180 graus ela fica instável: some aos poucos (fica só o balanço). */
export function torcaoDe(q, a, out) {
  const d = q.x * a.x + q.y * a.y + q.z * a.z, n = Math.hypot(d, q.w);
  if (n < 1e-4) return out.identity();
  out.set(a.x * d / n, a.y * d / n, a.z * d / n, q.w / n);
  if (n < 0.25) out.slerp(_qId, 1 - n / 0.25);
  return out;
}
const _qId = new THREE.Quaternion(), _qE = new THREE.Quaternion();
/* ---------- pele por quatérnio duplo (2026-11-23) ----------
   O skinning padrão (mistura linear das matrizes dos ossos) achata a pele onde dois ossos que giram muito se
   misturam: o braço erguido puxava uma aba da axila até o peito, o peito empolava com o braço na guarda e o antebraço
   torcia feito embrulho de bala. Como nos jogos, a rotação de cada osso é misturada como quatérnio duplo (gira em
   vez de encolher). O porte é forma da malha (aplicarPorte), nenhum osso tem escala. Vale
   pro corpo e pra tudo que veste em cima dele (calção, luva, roupa), senão o pano descola da pele. */
const DQ_FUNCOES = `
void dqOsso(mat4 m, float w, vec4 r0, inout vec4 r, inout vec4 d, inout mat3 k) {
  vec3 a0 = m[0].xyz, a1 = m[1].xyz, a2 = m[2].xyz;
  vec3 c0 = normalize(a0), c1 = normalize(a1 - dot(a1, c0) * c0), c2 = cross(c0, c1);
  mat3 R = mat3(c0, c1, c2);
  k += w * (transpose(R) * mat3(a0, a1, a2));
  float tr = R[0][0] + R[1][1] + R[2][2]; vec4 q;
  if (tr > 0.0) { float s = sqrt(tr + 1.0) * 2.0; q = vec4((R[1][2] - R[2][1]) / s, (R[2][0] - R[0][2]) / s, (R[0][1] - R[1][0]) / s, 0.25 * s); }
  else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) { float s = sqrt(1.0 + R[0][0] - R[1][1] - R[2][2]) * 2.0; q = vec4(0.25 * s, (R[1][0] + R[0][1]) / s, (R[2][0] + R[0][2]) / s, (R[1][2] - R[2][1]) / s); }
  else if (R[1][1] > R[2][2]) { float s = sqrt(1.0 + R[1][1] - R[0][0] - R[2][2]) * 2.0; q = vec4((R[1][0] + R[0][1]) / s, 0.25 * s, (R[2][1] + R[1][2]) / s, (R[2][0] - R[0][2]) / s); }
  else { float s = sqrt(1.0 + R[2][2] - R[0][0] - R[1][1]) * 2.0; q = vec4((R[2][0] + R[0][2]) / s, (R[2][1] + R[1][2]) / s, 0.25 * s, (R[0][1] - R[1][0]) / s); }
  if (dot(q, r0) < 0.0) q = -q;   // mesmo hemisfério do primeiro osso (senão a mistura dá a volta longa)
  vec3 t = m[3].xyz;
  vec4 dq = 0.5 * vec4(q.w * t + cross(t, q.xyz), -dot(t, q.xyz));
  r += w * q; d += w * dq;
}
vec3 dqGirar(vec4 r, vec3 v) { return v + 2.0 * cross(r.xyz, cross(r.xyz, v) + r.w * v); }
`;
let DQ_MISTURA = 0.5;   // 1 = só quatérnio duplo (incha o dorsal com o braço em cima), 0 = só linear (achata)
export function misturaDQ(k) { DQ_MISTURA = k; }
function comDQ(mat) {
  const k = DQ_MISTURA.toFixed(3);
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <skinning_pars_vertex>", "#include <skinning_pars_vertex>\n#ifdef USE_SKINNING\n" + DQ_FUNCOES + "#endif")
      .replace("#include <skinbase_vertex>", `#include <skinbase_vertex>
#ifdef USE_SKINNING
  vec4 dqR = vec4(0.0), dqD = vec4(0.0); mat3 dqK = mat3(0.0);
  vec4 dqR0 = vec4(0.0); { vec4 rr = vec4(0.0), dd = vec4(0.0); mat3 kk = mat3(0.0); dqOsso(boneMatX, 1.0, vec4(0.0, 0.0, 0.0, 1.0), rr, dd, kk); dqR0 = rr; }
  dqOsso(boneMatX, skinWeight.x, dqR0, dqR, dqD, dqK); dqOsso(boneMatY, skinWeight.y, dqR0, dqR, dqD, dqK);
  dqOsso(boneMatZ, skinWeight.z, dqR0, dqR, dqD, dqK); dqOsso(boneMatW, skinWeight.w, dqR0, dqR, dqD, dqK);
  float dqN = length(dqR); dqR /= dqN; dqD /= dqN;
  vec3 dqT = 2.0 * (dqR.w * dqD.xyz - dqD.w * dqR.xyz + cross(dqR.xyz, dqD.xyz));
#endif`)
      .replace("#include <skinnormal_vertex>", `#ifdef USE_SKINNING
  mat4 dqLin = bindMatrixInverse * (skinWeight.x * boneMatX + skinWeight.y * boneMatY + skinWeight.z * boneMatZ + skinWeight.w * boneMatW) * bindMatrix;
  objectNormal = mix((dqLin * vec4(objectNormal, 0.0)).xyz, mat3(bindMatrixInverse) * dqGirar(dqR, mat3(bindMatrix) * objectNormal), ${k});
  #ifdef USE_TANGENT
  objectTangent = mix((dqLin * vec4(objectTangent, 0.0)).xyz, mat3(bindMatrixInverse) * dqGirar(dqR, mat3(bindMatrix) * objectTangent), ${k});
  #endif
#endif`)
      .replace("#include <skinning_vertex>", `#ifdef USE_SKINNING
  vec3 dqP = (bindMatrixInverse * vec4(dqGirar(dqR, dqK * (bindMatrix * vec4(transformed, 1.0)).xyz) + dqT, 1.0)).xyz;
  vec3 linP = (bindMatrixInverse * (skinWeight.x * boneMatX + skinWeight.y * boneMatY + skinWeight.z * boneMatZ + skinWeight.w * boneMatW) * bindMatrix * vec4(transformed, 1.0)).xyz;
  transformed = mix(linP, dqP, ${k});
#endif`);
  };
  mat.customProgramCacheKey = () => "dq" + k;
  return mat;
}
export function peleDQ(m) {   // a malha e a sombra dela
  if (!m.isSkinnedMesh) return;
  comDQ(m.material);
  m.customDepthMaterial = comDQ(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
}
/* ---------- o lutador ---------- */
export class Lutador {
  constructor(base, opt) {
    this.base = base;
    this.raiz = new THREE.Group();
    this.modelo = SkeletonUtils.clone(base.corpo.scene);
    this.raiz.add(this.modelo);
    this.ossos = {};
    // nomes antigos do boneco (buzzed, barba) continuam valendo
    const cabelo = { buzzed: "militar", barba: "cheia" }[opt.cabelo] || opt.cabelo;
    const barba = { barba: "cheia" }[opt.barba] || opt.barba;
    this.modelo.traverse((o) => {
      if (o.isBone) this.ossos[o.name] = o;
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        o.material = o.material.clone();
        if (o.material.name === "MI_Pele" && o.material.map) {
          this.corpo = o;
          const temMarca = (opt.tatuagem && opt.tatuagem !== "nenhuma") || (opt.cicatriz && opt.cicatriz !== "nenhuma") || opt.nariz === "quebrado";
          // couro, cabelo curto, barba e sobrancelha são fios pintados na pele (pintarCabelo), então sempre pinta
          const marcas = (c, w, h) => { pintarCabelo(c, w, h, base.info, { cabelo, barba, corCabelo: opt.corCabelo }); if (temMarca) pintarPele(c, w, h, base.info, opt); };
          // pele (etapa 2): sheen avermelhado (luz que espalha na pele) e menos reflexo do ambiente, sem cara de plástico; o suor fica no verniz leve
          const m0 = o.material;
          o.material = new THREE.MeshPhysicalMaterial({ name: "MI_Pele", map: tingirTextura(m0.map, opt.pele, marcas), normalMap: m0.normalMap, normalScale: m0.normalScale,
            roughness: 0.58, envMapIntensity: 0.4, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color("#c86a50"), clearcoat: 0.12, clearcoatRoughness: 0.55 });
        }
        // calção e luva são peças com material próprio
        // olho úmido: verniz forte e quase sem aspereza (a bola fosca parecia de boneco)
        if (o.material.name === "MI_Eyes") o.material = new THREE.MeshPhysicalMaterial({ name: "MI_Eyes", map: o.material.map, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 0.6 });
        // calção de poliéster (trama fina), elástico canelado, luva de couro (verniz leve) e o velcro áspero
        if (o.material.name === "MI_Calcao") this.malhaT = o;   // bind em T (o das roupas)
        if (o.material.name === "MI_Calcao") Object.assign(o.material, { color: new THREE.Color(opt.calcao || "#b3221b"), roughness: 0.7 }, comTrama(90, 0.35));
        if (o.material.name === "MI_Faixa") Object.assign(o.material, { color: new THREE.Color(opt.calcao || "#b3221b").multiplyScalar(0.25), roughness: 0.85 }, comTrama(160, 0.8));
        if (o.material.name === "MI_Luva") o.material = new THREE.MeshPhysicalMaterial({ name: "MI_Luva", color: new THREE.Color(opt.luva || "#141416"), roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.45 });
        // o árbitro não usa luva (semLuva): a mão do corpo aparece (2026-11-21, print do dono: o árbitro de luva de MMA)
        if (opt.semLuva && (o.material.name === "MI_Luva" || o.material.name === "MI_Punho")) o.visible = false;
        if (o.material.name === "MI_Punho") Object.assign(o.material, { color: new THREE.Color(opt.luva || "#141416").lerp(new THREE.Color("#4a4b52"), 0.35), roughness: 0.92 }, comTrama(200, 0.5));   // velcro um tom mais claro
        if (!opt.linear) peleDQ(o);
      }
    });
    // cabelo e orelha presos ao osso da cabeça
    for (const [g, mat] of pecasDaOrelha(base, opt.orelha, opt.pele || "#c48a64")) { const m = new THREE.Mesh(g, mat); m.castShadow = true; this.ossos.Head.add(m); }
    const nc = MALHA_CABELO[cabelo]; this.cabeloMalhas = [];
    for (const n of [nc, EXTRA_CABELO[nc], MALHA_BARBA[barba], "rosto_sobrancelhas"]) {
      const geo = n && base.pecas[n]; if (!geo) continue;
      const cor = cabelo === "descolorido" && n.startsWith("cabelo") ? new THREE.Color("#d9c58c") : corDoFio(opt.corCabelo);
      const pelo = n.startsWith("barba") || n === "rosto_sobrancelhas", tubo = n === "cabelo_tranca" || n === "cabelo_dreads" || n === EXTRA_CABELO[nc];
      const m = new THREE.Mesh(geo, pelo ? materialDoPelo(base, cor) : tubo ? materialDoFio(base, cor) : materialDoVolume(base, cor, CRESPO.has(n)));
      m.castShadow = true; m.receiveShadow = true; this.ossos.Head.add(m);
      if (!pelo) this.cabeloMalhas.push(m);
    }
    // ossos auxiliares do ombro (AJUDANTES): a axila (prepararAxila: filha da clavícula, gira metade do úmero, sem a
    // torção), a escápula e as torções do úmero e do antebraço (prepararOmbro). Toda malha com pele ganha um esqueleto
    // com eles no fim, na mesma ordem; o inverso do bind de cada um sai do bind daquela malha
    this.ombro = [];
    if (this.corpo && base.ombro && base.axila && base.axila.lados.length === 2) {
      const aj = {};
      for (const o of base.ombro.lados) {
        const l = o.l, ax = base.axila.lados.find((x) => x.s === l);
        const novo = (n, pai, p) => { const b = new THREE.Bone(); b.name = n + "_" + l; if (p) b.position.copy(p); (this.ossos[pai + "_" + l] || this.ossos[pai]).add(b); aj[b.name] = this.ossos[b.name] = b; return b; };
        const axila = novo("axila", "clavicle", ax.pos); axila.quaternion.copy(ax.bindQ);
        this.ombro.push({ ...o, axila, escapula: novo("escapula", "spine_03", o.posE), giroU: novo("umero_giro", "upperarm"), giroA: novo("antebraco_giro", "lowerarm"),
          bindAxila: ax.bindQ });
      }
      const posE = Object.fromEntries(base.ombro.lados.map((o) => [o.l, o.posE]));
      this.modelo.traverse((m) => {
        if (!m.isSkinnedMesh) return;
        const sk = m.skeleton, nomes = sk.bones.map((b) => b.name), inv = (n) => sk.boneInverses[nomes.indexOf(n)];
        const extra = AJUDANTES.map((n) => { const l = n.slice(-1), tipo = n.slice(0, -2);
          if (tipo === "escapula") return bindDe(inv("spine_03")).multiply(new THREE.Matrix4().makeTranslation(posE[l].x, posE[l].y, posE[l].z)).invert();
          return inv((tipo === "antebraco_giro" ? "lowerarm_" : "upperarm_") + l).clone(); });
        m.bind(new THREE.Skeleton(sk.bones.concat(AJUDANTES.map((n) => aj[n])), sk.boneInverses.concat(extra)), m.bindMatrix);
      });
    }
    if (location.search.includes("cinza")) { const m = comDQ(new THREE.MeshStandardMaterial({ color: "#8a817a", roughness: 0.6 })); this.corpo.material = m; }
    this.roupa = vestir(this, base, opt);
    aplicarPorte(this, opt.porte, base);   // depois da roupa: o porte vale pra toda malha com pele
    if (this.corpo && !opt.semLuva) { this.geoLuva = this.corpo.geometry; this.corpo.geometry = corpoSemMao(this, base, this.geoLuva); this.pontas = ""; }
    this.vestido = this.roupa.entrada.length > 0;
    this.geoCorpo = this.corpo && this.corpo.geometry;
    const semPele = this.vestido ? corpoSemCoberto(this, base, opt.entrada) : opt.uniforme === "arbitro" ? corpoSemCoberto(this, base, "arbitro") : null;
    if (semPele) this.corpo.geometry = semPele;
    // capuz e papakha cobrem a cabeça: o cabelo esculpido fica guardado embaixo até a peça sair (senão atravessava)
    this.cobreCabeca = ["capuz", "papakha"].includes(opt.entrada) && this.vestido;
    if (this.cobreCabeca) for (const m of this.cabeloMalhas) m.visible = false;
    this.mixer = new THREE.AnimationMixer(this.modelo);
    this.acoes = {}; this.atual = null; this.nomeEstado = null;
    this.movendo = new Map();   // ação -> último ponto da curva de deslocamento
    this.molas = []; this.timers = []; this.contatos = []; this.alinhando = null; this.relogio = 0;
    this.ikFixo = {};          // membro -> { alvo: () => Vector3, peso }
    this.extras = new Set();   // controladores por código (ground and pound, finalização), rodam depois do mixer
    this.interp = {};
  }
  /* tira a roupa de entrada (some em dur segundos); com dur 0, na hora */
  tirarRoupa(dur = 0.6) {
    if (!this.vestido) return;
    this.vestido = false;
    const pecas = this.roupa.entrada, t0 = this.relogio;
    if (this.geoCorpo) { this.corpo.geometry = this.geoCorpo; this.pontas = ""; }   // a pele de baixo volta antes do pano começar a sumir (com as pontas dos dedos; o update tira as da mão fechada)
    if (dur <= 0) { for (const m of pecas) m.visible = false; if (this.cobreCabeca) for (const m of this.cabeloMalhas) m.visible = true; return; }
    for (const m of pecas) m.material.transparent = true;   // a roupa nasce opaca (sem briga de ordem com o cabelo); só some com transparência
    const f = () => {
      const k = Math.min(1, (this.relogio - t0) / dur);
      for (const m of pecas) { m.material.opacity = 1 - k; m.visible = k < 1; }
      if (this.cobreCabeca && k >= 0.5) for (const m of this.cabeloMalhas) m.visible = true;
      if (k >= 1) this.extras.delete(f);
    };
    this.extras.add(f);
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
  /* parado vivo (2026-11-22, auditoria de postura: a pose parada era um quadro congelado, rígido como boneco):
     respiração no tronco e nas clavículas, o peso que passeia de um pé pro outro e a cabeça que olha na altura
     dos olhos (o quadro do clipe olhava pro teto). folego 1 é calmo, 2 é quem acabou de lutar; olhar é quanto a
     cabeça desce além do nível (radianos, quem perdeu olha pra baixo) e pode mudar depois (o objeto devolvido).
     Roda depois do mixer e antes do IK (extras). Devolve { olhar, desligar }. */
  vivo({ folego = 1, olhar = 0 } = {}) {
    const fase = Math.random() * 6.28, ctl = { olhar, peso: 0 };
    const lateral = new THREE.Vector3(), frente = new THREE.Vector3(), qr = new THREE.Quaternion();
    const f = (dt) => {
      ctl.peso = Math.min(1, ctl.peso + dt / 0.4);   // entra aos poucos, sem salto
      const w = ctl.peso, t = this.relogio + fase;
      this.raiz.getWorldQuaternion(qr);
      lateral.set(1, 0, 0).applyQuaternion(qr); frente.set(0, 0, 1).applyQuaternion(qr);
      // fôlego: calmo 15 por minuto, cansado 25; o peito abre e as clavículas sobem ao puxar o ar
      const resp = (Math.sin(t * Math.PI * 2 * (folego > 1 ? 0.42 : 0.25)) + 1) / 2, amp = folego > 1 ? 1.8 : 1;
      this.girarMundo(this.ossos.spine_03, lateral, -0.022 * amp * resp * w);
      this.girarMundo(this.ossos.clavicle_l, frente, 0.03 * amp * resp * w);
      this.girarMundo(this.ossos.clavicle_r, frente, -0.03 * amp * resp * w);
      // o peso passeia devagar de um pé pro outro: a pelve inclina e a coluna devolve (a cabeça fica no lugar)
      const peso = Math.sin(t * Math.PI * 2 * 0.09) * 0.014 * w;
      this.girarMundo(this.ossos.pelvis, frente, peso);
      this.girarMundo(this.ossos.spine_01, frente, -peso * 0.9);
      // o olhar: a frente da cabeça (z do osso) desce até o nível visível (NIVEL_OLHAR) mais o olhar pedido
      const cab = this.ossos.Head; cab.updateWorldMatrix(true, false);
      const cur = new THREE.Vector3(0, 0, 1).applyQuaternion(cab.getWorldQuaternion(new THREE.Quaternion()));
      const des = frente.clone().applyAxisAngle(lateral, NIVEL_OLHAR + ctl.olhar + 0.012 * Math.sin(t * 0.7));
      const ang = cur.angleTo(des) * w, eixo = cur.cross(des);
      if (ang > 1e-4 && eixo.lengthSq() > 1e-10) {
        eixo.normalize();
        this.girarMundo(this.ossos.neck_01, eixo, ang * 0.4);
        this.girarMundo(cab, eixo, ang * 0.6);
      }
    };
    this.extras.add(f);
    ctl.desligar = () => this.extras.delete(f);
    return ctl;
  }
  /* algum lance de uma vez só (golpe, reação, passo) ainda está tocando por cima do estado */
  ocupado() { for (const a of Object.values(this.acoes)) if (a !== this.atual && a.isRunning() && a.getEffectiveWeight() > 0.2) return true; return false; }
  religar(acao, fade) { acao.stopFading(); acao.enabled = true; if (!acao.isRunning()) acao.play(); acao.fadeIn(fade); }
  esperar(s) { return new Promise((ok) => this.timers.push({ t: s, ok })); }
  impacto(osso, eixo, ang) { this.molas.push({ osso, eixo: eixo.clone().normalize(), ang: 0, vel: ang * 22 }); }
  posMundo(osso) { return this.ossos[osso].getWorldPosition(new THREE.Vector3()); }

  /* IK de contato: a mão ou o pé encosta no alvo no instante do impacto (o braço do
     Mixamo tem outro tamanho, sem isso o golpe passa do rosto ou para antes).
     Com o clipe (clipe, tClipe: o instante do impacto no clipe), a trajetória do clipe inteira é deslocada
     pelo erro previsto no impacto (2026-11-22, auditoria de postura): antes a mão ficava presa no alvo de
     0,13 s antes a 0,23 s depois, o braço travava reto enquanto o clipe já recolhia. Agora o braço sai e
     volta no ritmo do clipe e só o desvio entra, e o tronco e a clavícula levam parte dele (ikCadeia). */
  contato(membro, alvo, tImp, { antes = 0.13, segura = 0.07, depois = 0.16, clipe = null, tClipe = tImp } = {}) {
    const c = { membro, alvo, t0: this.relogio, tImp: this.relogio + tImp, antes, segura, depois };
    if (clipe && this.base.clips[clipe]) {
      // onde a ponta do membro estaria no impacto, só pelo clipe (em relação à raiz, sem o deslocamento dela)
      const salvo = this.listaOssos.map((o) => [o.quaternion.clone(), o.position.clone()]);
      this.aplicarClipe(clipe, tClipe);
      c.previsto = this.raiz.worldToLocal(this.posMundo(membro));
      this.listaOssos.forEach((o, i) => { o.quaternion.copy(salvo[i][0]); o.position.copy(salvo[i][1]); });
      this.modelo.updateMatrixWorld(true);
      c.clipe = clipe; c.tClipe = tClipe;
    }
    this.contatos.push(c);
  }
  /* a ponta prevista no impacto, no mundo de agora: a pose do clipe no impacto mais o que a raiz ainda vai andar */
  previstoNoMundo(c) {
    const a = this.acoes[c.clipe], t = a ? a.time : c.tClipe;
    const ate = this.curva(c.clipe, c.tClipe), agora = this.curva(c.clipe, t);
    return this.raiz.localToWorld(c.previsto.clone().add(_v3.set(ate[0] - agora[0], 0, ate[1] - agora[1])));
  }
  /* peso de um contato agora: entra em antes s, segura e sai em depois s; null quando já acabou */
  pesoContato(c) {
    const t = this.relogio - c.tImp;
    if (t < -c.antes) return 0;
    if (t < 0) return suaveK(1 + t / c.antes); if (t < c.segura) return 1; if (t < c.segura + c.depois) return 1 - suaveK((t - c.segura) / c.depois);
    return null;
  }
  ikContatos() {
    for (const c of this.contatos.slice()) {
      const t = this.relogio - c.tImp, w = this.pesoContato(c);
      if (w === null) { this.contatos.splice(this.contatos.indexOf(c), 1); continue; }
      if (w === 0) continue;
      const [o1, o2, o3] = CADEIA[c.membro].map((n) => this.ossos[n]);
      const ponta = this.ossos[c.membro];
      const previsto = c.previsto ? this.previstoNoMundo(c) : null;
      const alvo = c.alvo(previsto);   // o alvo pode depender de onde o clipe põe a ponta (o lado de onde ela vem)
      // pé: o alvo é da bola do pé; o IK move o tornozelo
      const ajuste = ponta === o3 ? _v3.set(0, 0, 0) : o3.getWorldPosition(new THREE.Vector3()).sub(ponta.getWorldPosition(new THREE.Vector3()));
      if (!c.previsto) { this.ikDoisOssos(o1, o2, o3, alvo.add(ajuste), w); continue; }
      // trajetória deslocada: a ponta de agora mais o erro previsto no impacto, na medida do peso
      // depois do impacto o desvio fica o do impacto: o braço volta com o clipe, não persegue a cabeça que recua
      if (t >= 0 && !c.desvio) c.desvio = alvo.clone().sub(previsto);
      const desvio = c.desvio || alvo.sub(previsto);
      const T = ponta.getWorldPosition(new THREE.Vector3()).addScaledVector(desvio, w);
      c.T = T.clone();   // o alvo da ponta neste quadro (as ferramentas de conferência medem por ele)
      if (ponta === o3) this.ikCadeia(c.membro.slice(-1), T, 1, { ext: 0.995 });
      else this.ikDoisOssos(o1, o2, o3, T.add(ajuste), 1);
    }
  }
  /* braço inteiro até o alvo, de dentro pra fora (2026-11-22, auditoria de postura: só o braço mexia, o
     cotovelo travava reto e o ombro ficava parado com o braço erguido):
     - o tronco (spine_02, spine_03) leva uma parte da mira, com limite (no golpe, opcional);
     - a clavícula acompanha: sobe com o braço acima da linha do ombro (no braço erguido, cerca de um terço
       da elevação vem da escápula) e vai pra frente quando o alvo está longe;
     - braço e antebraço por dois ossos, com extensão máxima (ext) e polo opcional. */
  ikCadeia(l, alvo, peso = 1, { tronco = true, polo = null, ext = 0.999, externa = false } = {}) {
    let kPolo = 1;
    const mao = this.ossos["hand_" + l], braco = this.ossos["upperarm_" + l], clav = this.ossos["clavicle_" + l];
    if (tronco) for (const n of ["spine_02", "spine_03"]) this.girarRumo(this.ossos[n], mao, alvo, 0.3 * peso, 0.12 * peso);
    if (clav) {
      const pO = braco.getWorldPosition(new THREE.Vector3()), pC = this.ossos["lowerarm_" + l].getWorldPosition(new THREE.Vector3());
      const lb = pO.distanceTo(pC) + pC.distanceTo(mao.getWorldPosition(new THREE.Vector3()));
      const dir = alvo.clone().sub(pO), d = dir.length();
      // elevação do alvo acima da horizontal do ombro (0 a 1) e quanto falta de alcance (0 a 1)
      const sobe = Math.max(0, Math.min(1, dir.y / Math.max(1e-4, d))), longe = Math.max(0, Math.min(1, (d - lb * 0.85) / (lb * 0.3)));
      // com os ossos do ombro: a clavícula sobe pelo ritmo (a elevação do alvo no tronco) e vai pra frente pelo alcance
      const o = this.ombro && this.ombro.find((x) => x.l === l);
      if (o) this.subirClavicula(o, this.elevacao(o, dir), peso * (externa ? 1 : RITMO.golpe));
      this.girarRumo(clav, braco, alvo, RITMO_OMBRO.frac * peso * (o ? longe * 0.6 : Math.max(sobe, longe * 0.6)), RITMO_OMBRO.max * peso);
      // sem polo, com o braço erguido: o cotovelo pelo giro externo do úmero (de trás pro lado, no tronco)
      if (!polo && o && externa) {
        const e = this.elevacao(o, dir), k = suave01(BRACO.entra[0], BRACO.entra[1], e);
        if (k > 0) {
          const t = this.ossos.spine_03.getWorldQuaternion(new THREE.Quaternion()), psi = THREE.MathUtils.degToRad(BRACO.externa * suave01(BRACO.de, BRACO.ate, e));
          const rumo = new THREE.Vector3(o.s * Math.sin(psi), 0, -Math.cos(psi)).applyQuaternion(t);
          polo = braco.getWorldPosition(new THREE.Vector3()).add(rumo); kPolo = k;
        }
      }
    }
    this.ikDoisOssos(braco, this.ossos["lowerarm_" + l], mao, alvo, peso, polo, ext, kPolo, BRACO.flexaoMax);
  }
  /* elevação (graus) de uma direção do braço no tronco: 0 = caído ao lado do corpo, 180 = reto pra cima. Sem dir, a
     do úmero de agora */
  elevacao(o, dir = null) {
    const d = dir ? _v1.copy(dir) : this.ossos["lowerarm_" + o.l].getWorldPosition(_v1).sub(this.ossos["upperarm_" + o.l].getWorldPosition(_v2));
    const baixo = _v2.copy(this.base.ombro.baixo).applyQuaternion(this.ossos.spine_03.getWorldQuaternion(_q1));
    return THREE.MathUtils.radToDeg(d.angleTo(baixo));
  }
  /* ritmo escapuloumeral na clavícula: sobe até RITMO pela elevação e (só sobe: o que o clipe já subiu fica); com
     manter, o úmero não muda de direção no mundo (o ombro sobe e o braço continua apontando pro mesmo lugar) */
  subirClavicula(o, e, peso = 1, manter = false) {
    const C = this.ossos["clavicle_" + o.l], U = this.ossos["upperarm_" + o.l];
    const alvo = THREE.MathUtils.degToRad(RITMO.clavicula * suave01(RITMO.de, RITMO.ate, e)) * peso;
    const t = this.ossos.spine_03.getWorldQuaternion(_q1), ti = _q2.copy(t).invert();
    const dir = U.getWorldPosition(_v1).sub(C.getWorldPosition(_v2)).normalize().applyQuaternion(ti);
    const falta = alvo - (Math.asin(Math.max(-1, Math.min(1, dir.y))) - o.clavElev); if (falta <= 1e-3) return;
    const qU = manter ? U.getWorldQuaternion(new THREE.Quaternion()) : null;
    // em volta do eixo perpendicular à clavícula e ao alto do tronco: muda a elevação dela exatamente (o eixo da frente
    // do tronco subia menos quando a clavícula aponta um pouco pra trás)
    const eixo = _v3.copy(dir).cross(_v2.set(0, 1, 0)); if (eixo.lengthSq() < 1e-8) return;
    this.girarMundo(C, eixo.normalize().applyQuaternion(t), falta);
    if (qU) { U.quaternion.copy(C.getWorldQuaternion(_q3).invert().multiply(qU)); U.updateMatrixWorld(true); }
  }
  /* no clipe; o braço com contato de golpe sai na medida do contato (a mão prevista do contato é a do clipe puro: com
     o ombro já subido o soco chegava acima do rosto), e o IK do contato sobe a clavícula pelo alvo */
  ritmo() {
    for (const o of this.ombro) {
      let w = 0; for (const c of this.contatos || []) if (c.membro === "hand_" + o.l) w = Math.max(w, this.pesoContato(c));
      if (w < 1) this.subirClavicula(o, this.elevacao(o), 1 - w, true);
    }
  }
  /* os ossos auxiliares do ombro na pose de agora (prepararOmbro) */
  ombros() {
    for (const o of this.ombro) {
      const U = this.ossos["upperarm_" + o.l], H = this.ossos["hand_" + o.l];
      // o úmero sem a torção dele (a partir do bind do corpo): o giro desfaz, a pele perto do ombro não torce
      torcaoDe(_q1.copy(o.bindU).invert().multiply(U.quaternion), o.eixoU, _q2);
      o.giroU.quaternion.copy(_q2.slerp(_qId, 1 - TORCAO.umero)).invert();
      // a axila: metade do úmero sem a torção
      o.axila.quaternion.copy(o.bindAxila).slerp(_q3.copy(U.quaternion).multiply(_q2.copy(o.giroU.quaternion).slerp(_qId, 1 - TORCAO.axila)), 0.5); o.axila.position.copy(U.position);
      // a torção da mão vai pro antebraço (no espaço dele, em volta do eixo do antebraço)
      torcaoDe(_q1.copy(o.bindH).invert().multiply(H.quaternion), o.eixoH, _q2); _q2.slerp(_qId, 1 - TORCAO.antebraco);
      o.giroA.quaternion.copy(o.bindH).multiply(_q2).multiply(_q3.copy(o.bindH).invert());
      // a escápula: uma fração do giro da clavícula (no tronco, a partir do bind) em volta da junta do esterno, e a
      // rotação pra cima com o braço (a pele acompanha uma fração)
      // (elevacao usa os temporários _q1/_v1/_v2: vem antes do giro da clavícula, que mora em _qE)
      const u = Math.min(RITMO.escapulaMax, Math.max(0, RITMO.escapula * (this.elevacao(o) - RITMO.escapulaDe))) * RITMO.pele;
      const C = this.ossos["clavicle_" + o.l], g = _qE.copy(C.quaternion).multiply(_q2.copy(o.bindC).invert());
      g.slerp(_qId, 1 - RITMO.segue);
      o.escapula.position.copy(o.posE).sub(C.position).applyQuaternion(g).add(C.position);
      o.escapula.quaternion.setFromAxisAngle(o.eixoE, o.s * THREE.MathUtils.degToRad(u)).premultiply(g);
      // as formas corretivas do lado, pela elevação do úmero
      if (o.corretivos && this.corpo && this.corpo.morphTargetInfluences) pesosCorretivos(o.corretivos, this.elevacao(o), this.corpo.morphTargetInfluences);
    }
  }
  /* a mão no mundo: palma virada pra normal e dedos na direção dedos (os dois no mundo, ortogonais).
     A palma e os dedos de agora saem dos ossos (dedo médio, indicador e mínimo), sem supor eixo do osso. */
  orientarMao(l, normal, dedos, peso = 1) {
    const mao = this.ossos["hand_" + l], o = (n) => this.ossos[`${n}_01_${l}`].getWorldPosition(new THREE.Vector3());
    mao.updateWorldMatrix(true, true);
    const p = mao.getWorldPosition(new THREE.Vector3()), f = o("middle").sub(p).normalize(), atr = o("index").sub(o("pinky")).normalize();
    const n = (l === "l" ? f.clone().cross(atr) : atr.clone().cross(f)).normalize();
    const fA = f.clone().sub(n.clone().multiplyScalar(f.dot(n))).normalize();
    const mA = new THREE.Matrix4().makeBasis(fA, n, fA.clone().cross(n));
    const nD = normal.clone().normalize(), fD = dedos.clone().sub(nD.clone().multiplyScalar(dedos.dot(nD))).normalize();
    const mD = new THREE.Matrix4().makeBasis(fD, nD, fD.clone().cross(nD));
    _q2.setFromRotationMatrix(mD.multiply(mA.transpose()));
    if (peso < 1) _q2.slerp(_q1.identity(), 1 - peso);
    mao.parent.getWorldQuaternion(_q1); _q3.copy(_q1).invert().multiply(_q2).multiply(_q1);
    mao.quaternion.premultiply(_q3); mao.updateMatrixWorld(true);
  }
  /* gira o osso pra que a ponta vá na direção do alvo: uma fração do ângulo, com teto (radianos) */
  girarRumo(osso, ponta, alvo, frac, max) {
    if (!osso || frac <= 0) return;
    osso.updateWorldMatrix(true, true);
    const o = osso.getWorldPosition(new THREE.Vector3()), a = ponta.getWorldPosition(new THREE.Vector3()).sub(o).normalize(), b = alvo.clone().sub(o).normalize();
    const ang = Math.min(max, a.angleTo(b) * frac); if (ang < 1e-4) return;
    const eixo = a.cross(b); if (eixo.lengthSq() < 1e-10) return;
    _q2.setFromAxisAngle(eixo.normalize(), ang);
    osso.parent.getWorldQuaternion(_q1); _q3.copy(_q1).invert().multiply(_q2).multiply(_q1);
    osso.quaternion.premultiply(_q3); osso.updateMatrixWorld(true);
  }
  /* polo: ponto pra onde o cotovelo (ou o joelho) aponta; sem ele, fica no plano em que já estava.
     ext: fração do comprimento do braço até onde ele estica (abaixo de 1, o cotovelo nunca trava reto) */
  ikDoisOssos(o1, o2, o3, alvo, peso, polo = null, ext = 0.999, kPolo = 1, flexaoMax = null) {
    const pA = o1.getWorldPosition(new THREE.Vector3()), pB = o2.getWorldPosition(new THREE.Vector3()), pC = o3.getWorldPosition(new THREE.Vector3());
    const l1 = pA.distanceTo(pB), l2 = pB.distanceTo(pC);
    const T = pC.clone().lerp(alvo, peso);
    // alcance entre a dobra máxima (flexaoMax: o braço pela cadeia, 145 graus) e ext (abaixo de 1: nunca trava reto nem hiperestende)
    const dMin = flexaoMax ? Math.sqrt(l1 * l1 + l2 * l2 - 2 * l1 * l2 * Math.cos(THREE.MathUtils.degToRad(180 - flexaoMax))) : 0;
    const dir = T.clone().sub(pA); let d = dir.length(); d = Math.max(dMin, Math.min(d, (l1 + l2) * ext)); dir.normalize();
    const curva = pB.clone().sub(pA); const lado = curva.sub(dir.clone().multiplyScalar(curva.dot(dir)));
    if (polo) {
      const q = polo.clone().sub(pA); q.sub(dir.clone().multiplyScalar(q.dot(dir)));
      if (q.lengthSq() > 1e-8) { if (lado.lengthSq() > 1e-8) lado.normalize(); lado.lerp(q.normalize(), peso * kPolo); }
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
    this.ritmo();   // a clavícula acompanha a elevação do braço que o clipe trouxe (antes do IK, que corrige a mão)
    this.ikContatos();
    for (const [membro, k] of Object.entries(this.ikFixo)) {
      if (!k || k.peso < 0.001) continue;
      // cadeia: o braço com a clavícula (ikCadeia, sem o tronco); senão só os dois ossos, como sempre
      if (k.cadeia) { this.ikCadeia(membro.slice(-1), k.alvo(), Math.min(1, k.peso), { tronco: false, polo: k.polo ? k.polo() : null, ext: k.ext || 0.999, externa: true }); if (k.depois) k.depois(); continue; }
      const [o1, o2, o3] = CADEIA[membro].map((n) => this.ossos[n]);
      this.ikDoisOssos(o1, o2, o3, k.alvo(), Math.min(1, k.peso), k.polo ? k.polo() : null);
    }
    // molas de impacto (cabeça, tronco), por cima do clipe
    // em passos de no máximo 1/120 s: com o passo do quadro (2x, 4x ou celular lento) a mola explodia
    // e a cabeça girava solta (achado do dono)
    const nPassos = Math.max(1, Math.ceil(dt * 120)), h = dt / nPassos;
    for (const m of this.molas.slice()) {
      for (let i = 0; i < nPassos; i++) { m.vel += (-m.ang * 240 - m.vel * 15) * h; m.ang += m.vel * h; }
      m.ang = Math.max(-0.9, Math.min(0.9, m.ang));
      if (Math.abs(m.ang) < 0.0005 && Math.abs(m.vel) < 0.01) { this.molas.splice(this.molas.indexOf(m), 1); continue; }
      this.girarMundo(this.ossos[m.osso], m.eixo, m.ang);
    }
    // axila, escápula e torções acompanham o braço (depois do clipe, do IK e das molas)
    this.ombros();
    // mão fechada (o primeiro nó do dedo do meio dobrado, com folga pra não piscar): a ponta do dedo some dela
    if (this.geoLuva && !this.vestido) {
      let k = "";
      for (const l of ["l", "r"]) { const q = this.ossos["middle_01_" + l]; if (!q) continue; const a = 2 * Math.acos(Math.min(1, Math.abs(q.quaternion.w)));
        if (a > (this.pontas.includes(l) ? 1.95 : 2.05)) k += l; }
      if (k !== this.pontas) { this.pontas = k; this.corpo.geometry = corpoSemMao(this, this.base, this.geoLuva, k); }
    }
  }
  girarMundo(osso, eixo, ang) {
    if (!osso || !ang) return;
    osso.parent.updateWorldMatrix(true, false); osso.parent.getWorldQuaternion(_q1);
    _q2.setFromAxisAngle(eixo, ang); _q3.copy(_q1).invert().multiply(_q2).multiply(_q1);
    osso.quaternion.premultiply(_q3); osso.updateMatrixWorld(true);
  }
}
