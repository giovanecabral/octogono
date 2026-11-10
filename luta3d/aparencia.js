// Aparência do lutador em 3D, fiel ao boneco 2D (pedido do dono): os 9 cabelos, as
// 6 barbas, a orelha couve-flor, a cicatriz, as tatuagens e o porte.
//
// O corpo do Quaternius só tem três peças de cabelo (curto, repartido e barba
// cheia). Todas são presas só ao osso da cabeça, então viram geometria parada no
// espaço dele e o resto sai delas: o moicano é a faixa do meio com espetos, o black
// power e o cacheado são a casca curta inflada, as barbas são a cheia recortada.
// Cicatriz e tatuagem são pintadas na textura da pele, nas regiões do corpo na
// pose de repouso (T), que não espelha esquerda e direita.
//
// Espaço do osso Head (metros): x pra esquerda do lutador, y pra cima, z pra frente.
import * as THREE from "./vendor/three.module.js";
import { mergeGeometries } from "./vendor/BufferGeometryUtils.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
/* a cabeça como elipsoide, medida na casca do cabelo curto */
const C = V(0, 0.12, 0), R = V(0.081, 0.096, 0.097);
const normalCabeca = (p) => V(p.x / R.x ** 2, (p.y - C.y) / R.y ** 2, (p.z - C.z) / R.z ** 2).normalize();
/* ponto da cabeça na fatia x, no ângulo phi (0 = topo, negativo = testa, positivo = nuca) */
function naCabeca(x, phi, fora = 0) {
  const s = Math.sqrt(Math.max(0, 1 - (x / R.x) ** 2));
  const p = V(x, C.y + R.y * s * Math.cos(phi), C.z - R.z * s * Math.sin(phi));
  return p.addScaledVector(normalCabeca(p), fora);
}
const suave = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/* sorteio fixo (os dreads são iguais pra todo mundo) */
const sorteio = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

/* peça com pele presa só à cabeça -> geometria no espaço do osso Head */
export function geometriaNaCabeca(malha) {
  const sk = malha.skeleton, i = sk.bones.findIndex((b) => b.name === "Head");
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", malha.geometry.attributes.position.clone());
  if (malha.geometry.index) g.setIndex(malha.geometry.index.clone());
  g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(sk.boneInverses[i], malha.bindMatrix));
  g.computeVertexNormals();
  return g;
}
/* só os triângulos cujo centro passa no teste */
function filtrar(g, ok) {
  const n = g.index ? g.toNonIndexed() : g, p = n.attributes.position, out = [];
  const a = V(), b = V(), c = V(), m = V();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    m.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    if (ok(m)) out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  const r = new THREE.BufferGeometry(); r.setAttribute("position", new THREE.Float32BufferAttribute(out, 3)); r.computeVertexNormals();
  return r;
}
/* empurra a casca pra fora (normal da cabeça); quanto(p) em metros */
function inflar(g, quanto) {
  const r = g.clone(), p = r.attributes.position, v = V();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); v.addScaledVector(normalCabeca(v), quanto(v)); p.setXYZ(i, v.x, v.y, v.z); }
  r.computeVertexNormals();
  return r;
}
const material = (cor, extra = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.88, side: THREE.DoubleSide, ...extra });

/* ---------- cabelo: raspado, militar, moicano, trança nagô, dreads, coque, black power, cacheado, descolorido ---------- */
export function pecasDoCabelo(base, tipo, cor) {
  const curto = base.pecas.curto, mat = material(cor);
  const frenteBaixa = (p) => 1 - 0.75 * suave(0.045, 0.092, p.z) * (1 - suave(0.15, 0.2, p.y));   // menos volume na linha da testa
  switch (tipo) {
    case "raspado": return [];
    case "militar": return [[curto, mat]];
    case "descolorido": return [[curto, material("#d9c58c", { roughness: 0.8 })]];
    case "moicano": {
      const faixa = filtrar(curto, (m) => Math.abs(m.x) < 0.024);
      const espetos = [];
      for (let k = 0; k <= 12; k++) {
        const phi = -0.95 + k * (2.75 / 12), p = naCabeca(0, phi), n = normalCabeca(p).addScaledVector(V(0, 0, -1), 0.35).normalize();
        const h = 0.028 + 0.034 * Math.cos(Math.max(-1.4, Math.min(1.4, phi * 0.8))) ** 2;
        const cone = new THREE.ConeGeometry(0.016, h, 6); cone.translate(0, h / 2, 0);
        cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), n)); cone.translate(p.x, p.y, p.z);
        espetos.push(cone);
      }
      return [[faixa, mat], [mergeGeometries(espetos), mat]];
    }
    case "trança nagô": {
      const trancas = [];
      for (const x of [-0.054, -0.033, -0.011, 0.011, 0.033, 0.054]) {
        const pts = []; for (let k = 0; k <= 14; k++) pts.push(naCabeca(x, -0.9 + k * (2.65 / 14), 0.004));
        trancas.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.0068, 6, false));
      }
      return [[curto, material(new THREE.Color(cor).multiplyScalar(0.55))], [mergeGeometries(trancas), mat]];
    }
    case "dreads": {
      const r = sorteio(7), fios = [];
      for (let k = 0; k < 28; k++) {
        const x = (r() * 2 - 1) * 0.072, phi = -0.35 + r() * 2.2, p0 = naCabeca(x, phi, 0.002), n = normalCabeca(p0);
        const comp = 0.12 + r() * 0.09, tras = Math.min(p0.z, 0) - 0.02;
        const pts = [p0, p0.clone().addScaledVector(n, 0.022).add(V(0, -0.012, -0.01)),
          V(p0.x * 1.22 + n.x * 0.02, p0.y - comp * 0.55, tras - 0.01), V(p0.x * 1.28, p0.y - comp, tras - 0.025)];
        fios.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.0085 + r() * 0.002, 5, false));
      }
      return [[curto, mat], [mergeGeometries(fios), mat]];
    }
    case "coque": {
      const bola = new THREE.SphereGeometry(0.034, 14, 10); bola.scale(1, 0.85, 1); bola.translate(0, 0.185, -0.078);
      const elastico = new THREE.TorusGeometry(0.019, 0.005, 6, 16); elastico.rotateX(Math.PI / 2.6); elastico.translate(0, 0.171, -0.066);
      return [[curto, mat], [bola, mat], [elastico, material("#15161b")]];
    }
    case "black power": {
      // redondo: volume quase igual dos lados e em cima (antes crescia só em cima e virava cogumelo)
      const g = inflar(curto, (p) => (0.05 + 0.012 * suave(0.12, 0.2, p.y)) * suave(0.035, 0.085, p.y) * frenteBaixa(p) + 0.004 * Math.sin(p.x * 140) * Math.sin(p.y * 120) * Math.sin(p.z * 130));
      return [[g, material(cor, { roughness: 1, flatShading: true })]];
    }
    case "cacheado": {
      const g = inflar(curto, (p) => 0.024 * suave(0.05, 0.13, p.y) * frenteBaixa(p) + 0.0075 * Math.sin(p.x * 170) * Math.sin(p.y * 150) * Math.sin(p.z * 160));
      return [[g, material(cor, { roughness: 1, flatShading: true })]];
    }
    default: return [[curto, mat]];
  }
}

/* ---------- barba: nenhuma, rala, sem bigode, cheia, cavanhaque, ferradura ---------- */
export function pecasDaBarba(base, tipo, cor) {
  const g = base.pecas.barba, mat = material(cor, { roughness: 0.95 });
  const bigode = (m) => m.y > 0.016 && m.z > 0.084 && Math.abs(m.x) < 0.042;
  switch (tipo) {
    case "nenhuma": return [];
    case "rala": return [[g, material(cor, { transparent: true, opacity: 0.42, depthWrite: false, roughness: 1 })]];
    case "sem bigode": return [[filtrar(g, (m) => !bigode(m)), mat]];
    case "cavanhaque": return [[filtrar(g, (m) => bigode(m) || (Math.abs(m.x) < 0.03 && m.y < 0.012 && m.z > 0.06)), mat]];
    case "ferradura": return [[filtrar(g, (m) => bigode(m) || (Math.abs(m.x) > 0.02 && Math.abs(m.x) < 0.044 && m.y < 0.03 && m.y > -0.03 && m.z > 0.07)), mat]];
    default: return [[g, mat]];
  }
}

/* ---------- orelha couve-flor: um caroço em cada orelha ---------- */
export function pecasDaOrelha(base, tipo, pele) {
  if (tipo !== "couve-flor" || !base.orelha) return [];
  const cor = new THREE.Color(pele).multiplyScalar(0.6).lerp(new THREE.Color("#5a2c2c"), 0.25), r = sorteio(3), pecas = [];
  for (const s of [1, -1]) {
    const g = new THREE.IcosahedronGeometry(0.017, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (1 + (r() - 0.5) * 0.35), p.getY(i) * (1 + (r() - 0.5) * 0.35), p.getZ(i) * (1 + (r() - 0.5) * 0.35));
    g.scale(0.5, 1.05, 0.85); g.computeVertexNormals();
    // no meio da orelha, encostado (o ponto medido é a borda de fora, em cima)
    g.translate(s * (Math.abs(base.orelha.x) - 0.006), base.orelha.y - 0.012, base.orelha.z - 0.004);
    pecas.push([g, new THREE.MeshStandardMaterial({ color: cor, roughness: 1, envMapIntensity: 0.15 })]);
  }
  return pecas;
}

/* ---------- porte: leve, médio, pesado (largura do tronco e grossura de braço e coxa) ---------- */
export function aplicarPorte(ossos, porte) {
  const k = porte === "pesado" ? 1.09 : porte === "leve" ? 0.93 : 1;
  if (k === 1) return;
  const engrossar = (nome, f) => {
    const o = ossos[nome], filho = o && o.children.find((c) => c.isBone);
    if (!o || !filho) return;
    const d = filho.position.clone().normalize();   // eixo do comprimento do osso
    o.scale.set(1 + (f - 1) * (1 - Math.abs(d.x)), 1 + (f - 1) * (1 - Math.abs(d.y)), 1 + (f - 1) * (1 - Math.abs(d.z)));
  };
  for (const n of ["spine_02", "spine_03"]) engrossar(n, k);
  for (const n of ["upperarm_l", "upperarm_r", "thigh_l", "thigh_r", "calf_l", "calf_r", "lowerarm_l", "lowerarm_r"]) engrossar(n, 1 + (k - 1) * 1.15);
}

/* ---------- pele: cicatriz e tatuagem pintadas na textura ----------
   info: vértices do corpo na pose de repouso (p, no modelo; h, no espaço da cabeça; uv)
   e os triângulos (índices). */
const REGIOES = {
  ombro: (p) => p.x > 0.12 && p.x < 0.36 && p.y > 1.35,
  peito: (p) => p.z > 0.03 && p.y > 1.2 && p.y < 1.46 && Math.abs(p.x) < 0.17,
  faixaPeito: (p) => p.z > 0.04 && p.y > 1.31 && p.y < 1.41 && Math.abs(p.x) < 0.13,
  braco: (p) => p.x > 0.17 && p.x < 0.68,
  pescoco: (p) => p.y > 1.5 && p.y < 1.59 && Math.abs(p.x) < 0.062 && p.z > -0.075 && p.z < 0.06,
  costas: (p) => p.z < -0.06 && p.y > 1.15 && p.y < 1.48 && Math.abs(p.x) < 0.18,
  bracos: (p) => Math.abs(p.x) > 0.17 && Math.abs(p.x) < 0.68,
};
const TATUAGENS = {
  "tribal no ombro": [["ombro", "tribal"]],
  "escrita no peito": [["faixaPeito", "escrita"]],
  "braço fechado": [["braco", "denso"]],
  "pescoço": [["pescoco", "tribal"]],
  "peito e braço": [["peito", "tribal"], ["braco", "denso"]],
  "fechado": [["bracos", "denso"], ["peito", "denso"], ["costas", "tribal"]],
};
function padrao(tipo) {
  const s = 128, cv = document.createElement("canvas"); cv.width = cv.height = s;
  const c = cv.getContext("2d"), r = sorteio(tipo.length * 97 + 11);
  c.strokeStyle = c.fillStyle = "#16100d"; c.lineCap = "round";
  if (tipo === "escrita") {
    // letra cursiva: laços que variam, uma linha por ladrilho
    c.lineWidth = 2.6;
    for (const y of [22, 64, 106]) {
      c.beginPath(); let x = 4; c.moveTo(x, y);
      while (x < s - 8) { const a = 5 + r() * 9, l = 6 + r() * 7; c.bezierCurveTo(x + l * 0.3, y - a, x + l, y - a, x + l * 0.6, y + 2); c.bezierCurveTo(x + l * 0.3, y + a * 0.5, x + l * 1.2, y + 3, x + l * 1.3, y); x += l * 1.3; }
      c.stroke();
    }
  } else if (tipo === "tribal") {
    c.lineWidth = 7;
    for (let k = 0; k < 7; k++) {
      c.beginPath(); const x0 = r() * s - 30, y0 = r() * s;
      c.moveTo(x0, y0); c.bezierCurveTo(x0 + 30, y0 - 22, x0 + 55, y0 + 16, x0 + 78, y0 - 10); c.stroke();
      c.beginPath(); c.moveTo(x0 + 78, y0 - 10); c.lineTo(x0 + 92, y0 - 26); c.lineTo(x0 + 84, y0 - 2); c.fill();
    }
  } else {
    for (let k = 0; k < 45; k++) {
      c.lineWidth = 2 + r() * 4; c.beginPath();
      if (r() < 0.4) c.arc(r() * s, r() * s, 4 + r() * 10, 0, Math.PI * 2);
      else { const x = r() * s, y = r() * s; c.moveTo(x, y); c.quadraticCurveTo(x + r() * 36 - 18, y + r() * 36 - 18, x + r() * 40 - 20, y + r() * 40 - 20); }
      c.stroke();
    }
  }
  return cv;
}
/* ponto da pele (no espaço da cabeça) -> pixel da textura e quantos pixels por metro ali */
function noRosto(info, alvo, W, H) {
  let mel = -1, dm = 1e9;
  for (let i = 0; i < info.h.length; i++) { const h = info.h[i]; if (!h) continue; const d = h.distanceToSquared(alvo); if (d < dm) { dm = d; mel = i; } }
  if (mel < 0) return null;
  const h0 = info.h[mel], u0 = info.uv[mel];
  let soma = 0, n = 0, cima = null, dCima = 0;
  for (let i = 0; i < info.h.length; i++) {
    const h = info.h[i]; if (!h || i === mel) continue;
    const d3 = h.distanceTo(h0); if (d3 < 0.004 || d3 > 0.02) continue;
    const du = (info.uv[i].x - u0.x) * W, dv = (info.uv[i].y - u0.y) * H, d2 = Math.hypot(du, dv);
    if (d2 > 0 && d2 / d3 < W * 40) { soma += d2 / d3; n++; }
    const sobe = (h.y - h0.y) / d3; if (sobe > dCima) { dCima = sobe; cima = [du / d2, dv / d2]; }
  }
  return { x: u0.x * W, y: u0.y * H, pxm: n ? soma / n : W * 4, cima: cima || [0, -1] };
}
export function pintarPele(c, W, H, info, { cicatriz, tatuagem, nariz }) {
  info = Object.assign(Object.create(info), { nariz });
  if (tatuagem && TATUAGENS[tatuagem]) {
    for (const [reg, tipo] of TATUAGENS[tatuagem]) {
      const ok = REGIOES[reg], caminho = new Path2D(), t = info.tri;
      for (let i = 0; i < t.length; i += 3) {
        const a = t[i], b = t[i + 1], d = t[i + 2];
        if (!ok(info.p[a]) || !ok(info.p[b]) || !ok(info.p[d])) continue;
        caminho.moveTo(info.uv[a].x * W, info.uv[a].y * H); caminho.lineTo(info.uv[b].x * W, info.uv[b].y * H); caminho.lineTo(info.uv[d].x * W, info.uv[d].y * H); caminho.closePath();
      }
      c.save(); c.clip(caminho);
      c.globalCompositeOperation = "multiply"; c.globalAlpha = 0.95;
      c.fillStyle = c.createPattern(padrao(tipo), "repeat"); c.fillRect(0, 0, W, H);
      c.restore();
    }
  }
  const marca = (alvo, desenho) => { const q = noRosto(info, alvo, W, H); if (q) { c.save(); desenho(q); c.restore(); } };
  if (cicatriz === "corte na sobrancelha") marca(V(0.036, 0.121, 0.103), (q) => {
    const l = q.pxm * 0.024; c.strokeStyle = "rgba(214,160,150,.95)"; c.lineWidth = Math.max(2, q.pxm * 0.0035); c.lineCap = "round";
    c.beginPath(); c.moveTo(q.x - q.cima[0] * l / 2, q.y - q.cima[1] * l / 2); c.lineTo(q.x + q.cima[0] * l / 2, q.y + q.cima[1] * l / 2); c.stroke();
  });
  if (cicatriz === "bochecha") marca(V(-0.05, 0.066, 0.096), (q) => {
    const l = q.pxm * 0.034, ang = Math.atan2(q.cima[1], q.cima[0]) + 0.7, dx = Math.cos(ang) * l / 2, dy = Math.sin(ang) * l / 2;
    c.strokeStyle = "rgba(214,160,150,.95)"; c.lineWidth = Math.max(2, q.pxm * 0.004); c.lineCap = "round";
    c.beginPath(); c.moveTo(q.x - dx, q.y - dy); c.lineTo(q.x + dx, q.y + dy); c.stroke();
  });
  // anel em volta do olho (o centro fica embaixo do globo do olho, que é outra malha), puxado pra baixo
  if (info.nariz === "quebrado") marca(V(0.004, 0.086, 0.122), (q) => {
    // o dorso do nariz torto: uma sombra fina na diagonal e um calo claro do lado
    const l = q.pxm * 0.03, ang = Math.atan2(q.cima[1], q.cima[0]) + 0.35, dx = Math.cos(ang) * l / 2, dy = Math.sin(ang) * l / 2;
    c.lineCap = "round"; c.strokeStyle = "rgba(60,30,20,.45)"; c.lineWidth = Math.max(2, q.pxm * 0.004);
    c.beginPath(); c.moveTo(q.x - dx, q.y - dy); c.lineTo(q.x + dx, q.y + dy); c.stroke();
  });
  if (cicatriz === "olho roxo") marca(V(0.035, 0.094, 0.098), (q) => {
    const r = q.pxm * 0.034, g = c.createRadialGradient(q.x, q.y, r * 0.25, q.x, q.y, r);
    g.addColorStop(0, "rgba(50,12,48,.95)"); g.addColorStop(0.5, "rgba(58,16,55,.9)"); g.addColorStop(0.8, "rgba(75,28,66,.5)"); g.addColorStop(1, "rgba(80,30,70,0)");
    c.globalCompositeOperation = "multiply"; c.fillStyle = g; c.beginPath(); c.arc(q.x, q.y, r, 0, Math.PI * 2); c.fill();
  });
}

/* informação do corpo na pose de repouso, pra pintar e achar a orelha (uma vez só) */
export function infoDoCorpo(corpo) {
  const g = corpo.geometry, pos = g.attributes.position, uv = g.attributes.uv, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const sk = corpo.skeleton, iH = sk.bones.findIndex((b) => b.name === "Head"), inv = sk.boneInverses[iH];
  const info = { p: [], h: [], uv: [], tri: g.index ? Array.from(g.index.array) : [...Array(pos.count).keys()] };
  for (let i = 0; i < pos.count; i++) {
    const p = V().fromBufferAttribute(pos, i).applyMatrix4(corpo.bindMatrix);
    let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === iH) w += sw.getComponent(i, k);
    info.p.push(p); info.h.push(w > 0.5 ? p.clone().applyMatrix4(inv) : null); info.uv.push(new THREE.Vector2(uv.getX(i), uv.getY(i)));
  }
  // orelha: o ponto mais pra fora (x) da cabeça na altura dos olhos
  let orelha = null;
  for (const h of info.h) if (h && h.y > 0.04 && h.y < 0.13 && h.z > -0.04 && h.z < 0.04 && (!orelha || h.x > orelha.x)) orelha = h;
  return { info, orelha };
}

/* ---------- roupa de entrada: mongkol, papakha, kimono, roupão, capuz, bandeira; prajiad ----------
   Kimono, roupão, capuz e bandeira são uma casca do próprio corpo (os triângulos da região, empurrados
   pra fora e presos ao mesmo esqueleto): a roupa dobra junto com o lutador na caminhada. Mongkol e
   papakha ficam na cabeça. A roupa sai no octógono (tirarRoupa); a prajiad fica a luta inteira, como
   no muay thai. Regiões na pose de repouso (T): x pra esquerda do lutador, y pra cima, z pra frente. */
function casca(corpo, info, ok, espessura, corDe) {
  const g = corpo.geometry, pos = g.attributes.position, nor = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const idx = g.index ? g.index.array : [...Array(pos.count).keys()], mapa = new Map(), P = [], N = [], I = [], W = [], Cr = [], T = [];
  const cor = new THREE.Color();
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (!ok(info.p[a]) || !ok(info.p[b]) || !ok(info.p[c])) continue;
    for (const v of [a, b, c]) {
      if (!mapa.has(v)) {
        mapa.set(v, P.length / 3);
        const n = V(nor.getX(v), nor.getY(v), nor.getZ(v)).normalize();
        P.push(pos.getX(v) + n.x * espessura, pos.getY(v) + n.y * espessura, pos.getZ(v) + n.z * espessura);
        N.push(n.x, n.y, n.z);
        for (let k = 0; k < 4; k++) { I.push(si.getComponent(v, k)); W.push(sw.getComponent(v, k)); }
        corDe(info.p[v], cor); Cr.push(cor.r, cor.g, cor.b);
      }
      T.push(mapa.get(v));
    }
  }
  const r = new THREE.BufferGeometry();
  r.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  r.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  r.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(I, 4));
  r.setAttribute("skinWeight", new THREE.Float32BufferAttribute(W, 4));
  r.setAttribute("color", new THREE.Float32BufferAttribute(Cr, 3));
  r.setIndex(T);
  return r;
}
const TRONCO = (p) => p.y > 0.86 && p.y < 1.54 && Math.abs(p.x) < 0.24;
const BRACO = (ate) => (p) => Math.abs(p.x) >= 0.17 && Math.abs(p.x) < ate && p.y > 1.3;
const COXA = (ate) => (p) => p.y > ate && p.y <= 0.9 && Math.abs(p.x) < 0.3;
/* V do decote na frente: a pele aparece dentro, a borda é a lapela */
const decote = (p, abre) => p.z > 0.02 && p.y > 1.12 && Math.abs(p.x) < 0.012 + (1.52 - p.y) * abre;
const naBorda = (p, abre, larg) => p.z > 0.02 && p.y > 1.0 && Math.abs(Math.abs(p.x) - (0.012 + (1.52 - p.y) * abre)) < larg;

export function montarRoupa(lutador, base, opt) {
  const corpo = lutador.corpo, info = base.info, cor = new THREE.Color(opt.corEntrada || "#D7261E"), out = { entrada: [], fixas: [] };
  const vestir = (geo, mat, lista) => {
    const m = new THREE.SkinnedMesh(geo, mat); m.bind(corpo.skeleton, corpo.bindMatrix);
    m.castShadow = true; m.frustumCulled = false; corpo.parent.add(m); lista.push(m);
  };
  const mat = (extra = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide, transparent: true, ...extra });
  const tipo = opt.entrada;
  if (tipo === "kimono") {
    const gi = ["#f2eee6", "#1f3a6e", "#16181e"].includes(cor.getHexString && "#" + cor.getHexString()) ? cor.clone() : new THREE.Color("#f2eee6");
    const lap = gi.clone().multiplyScalar(0.82), faixa = new THREE.Color("#15161b");
    vestir(casca(corpo, info, (p) => (TRONCO(p) || BRACO(0.66)(p) || COXA(0.72)(p)) && !decote(p, 0.32), 0.016, (p, c) =>
      c.copy(p.y > 0.93 && p.y < 0.99 ? faixa : naBorda(p, 0.32, 0.03) ? lap : gi)), mat({ roughness: 0.95 }), out.entrada);
  } else if (tipo === "roupão") {
    const ouro = new THREE.Color("#d4a017");
    vestir(casca(corpo, info, (p) => (TRONCO(p) || BRACO(0.6)(p) || COXA(0.5)(p)) && !decote(p, 0.4), 0.022, (p, c) =>
      c.copy(naBorda(p, 0.4, 0.028) || (Math.abs(p.x) > 0.56) || p.y < 0.54 ? ouro : cor)), mat({ roughness: 0.55, metalness: 0.05 }), out.entrada);
  } else if (tipo === "capuz") {
    vestir(casca(corpo, info, (p) => TRONCO(p) && p.y < 1.53 || BRACO(0.68)(p) || COXA(0.8)(p), 0.02, (p, c) => c.copy(cor).multiplyScalar(p.z > 0.06 && Math.abs(p.x) < 0.1 && p.y < 1.12 && p.y > 0.96 ? 0.8 : 1)),
      mat({ roughness: 1 }), out.entrada);
    // o capuz na cabeça: casca de elipsoide atrás e em cima do rosto
    const g = new THREE.SphereGeometry(1, 28, 18); g.scale(R.x * 1.38, R.y * 1.32, R.z * 1.36); g.translate(0, C.y + 0.01, C.z - 0.012);
    const capuz = filtrar(g, (m) => m.z < 0.062 - (m.y - 0.08) * 0.25 && m.y > -0.07);
    const h = new THREE.Mesh(capuz, new THREE.MeshStandardMaterial({ color: cor, roughness: 1, side: THREE.DoubleSide, transparent: true }));
    lutador.ossos.Head.add(h); out.entrada.push(h);
  } else if (tipo === "bandeira") {
    // a bandeira do Brasil nos ombros, como no boneco 2D: verde, losango amarelo e o círculo azul nas costas
    const verde = new THREE.Color("#1e8c45"), amarelo = new THREE.Color("#f2c619"), azul = new THREE.Color("#1f3a93");
    vestir(casca(corpo, info, (p) => ((p.z < -0.005 && p.y > 0.85 && p.y < 1.49 && Math.abs(p.x) < 0.25) || (p.y > 1.38 && p.y < 1.49 && Math.abs(p.x) < 0.27 && Math.abs(p.x) > 0.1)), 0.026, (p, c) => {
      const d = Math.abs(p.x) / 0.17 + Math.abs(p.y - 1.2) / 0.24, cc = Math.hypot(p.x, p.y - 1.2);
      c.copy(cc < 0.065 ? azul : d < 1 ? amarelo : verde);
    }), mat({ roughness: 0.9 }), out.entrada);
  } else if (tipo === "mongkol") {
    const g = new THREE.TorusGeometry(1, 0.11, 8, 40); g.rotateX(Math.PI / 2); g.scale(R.x * 1.1, R.x * 1.1, R.z * 1.16);
    g.rotateX(0.16); g.translate(0, C.y + 0.012, C.z - 0.006);
    const cores = [], p = g.attributes.position; for (let i = 0; i < p.count; i++) { const ang = Math.atan2(p.getZ(i), p.getX(i)); const c = Math.sin(ang * 14) > 0.3 ? new THREE.Color("#f2eee6") : cor; cores.push(c.r, c.g, c.b); }
    g.setAttribute("color", new THREE.Float32BufferAttribute(cores, 3));
    const rabo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, C.y + 0.03, C.z - R.z * 1.12), V(0, C.y + 0.06, C.z - R.z * 1.3), V(0, C.y + 0.1, C.z - R.z * 1.32)]), 10, 0.008, 6, false);
    const cr = []; for (let i = 0; i < rabo.attributes.position.count; i++) cr.push(cor.r, cor.g, cor.b); rabo.setAttribute("color", new THREE.Float32BufferAttribute(cr, 3));
    const m = new THREE.Mesh(mergeGeometries([g, rabo]), mat({ side: THREE.FrontSide }));
    lutador.ossos.Head.add(m); out.entrada.push(m);
  } else if (tipo === "papakha") {
    const la = cor.getHex() === 0x16181e ? new THREE.Color("#2a2724") : new THREE.Color("#e4ded0");
    const g = new THREE.CylinderGeometry(0.108, 0.097, 0.11, 22, 5, false); const p = g.attributes.position, r = sorteio(5);
    for (let i = 0; i < p.count; i++) { const k = 1 + (r() - 0.5) * 0.12, topo = p.getY(i) > 0.05 ? 0.85 + 0.15 * Math.hypot(p.getX(i), p.getZ(i)) / 0.108 : 1; p.setXYZ(i, p.getX(i) * k, p.getY(i) * topo + (r() - 0.5) * 0.008, p.getZ(i) * k); }
    g.computeVertexNormals(); g.rotateX(0.12); g.translate(0, C.y + 0.062, C.z - 0.006);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: la, roughness: 1, flatShading: true, transparent: true }));
    lutador.ossos.Head.add(m); out.entrada.push(m);
  }
  if (opt.prajiad === "com") {
    vestir(casca(corpo, info, (p) => Math.abs(p.x) > 0.29 && Math.abs(p.x) < 0.335 && p.y > 1.35, 0.014, (p, c) => c.copy(cor)), mat({ transparent: false }), out.fixas);
  }
  return out;
}
