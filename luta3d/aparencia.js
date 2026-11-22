// Aparência do lutador em 3D, fiel ao boneco 2D (pedido do dono): o cabelo curto e a
// barba pintados na pele, a orelha couve-flor, a cicatriz, as tatuagens e o porte.
// Os cortes com volume, as barbas em fios e as roupas de entrada são malhas feitas no
// Blender (ferramentas/corpo3d, arquivos em luta3d/pecas) e entram pelo lutador.js.
// Cicatriz, tatuagem, cabelo e barba são pintados na textura da pele, nas regiões do
// corpo na pose de repouso (T), que não espelha esquerda e direita.
//
// Espaço do osso Head (metros): x pra esquerda do lutador, y pra cima, z pra frente.
import * as THREE from "./vendor/three.module.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const suave = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/* sorteio fixo (a mesma orelha e a mesma tatuagem pra todo mundo) */
const sorteio = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

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
/* ---------- cabelo curto e barba pintados na pele (corpo realista, 2026-11-20) ----------
   Raspado, militar, descolorido e toda barba são só pintura (como cabelo curto de verdade em jogo); os cortes com
   volume pintam a base e põem a malha por cima. Regiões no espaço da cabeça (o mesmo do resto deste arquivo):
   a linha do cabelo sobe e desce com o ângulo em volta da cabeça (0 = testa, 90 = orelha, 180 = nuca). */
const LINHA = [[0, 0.158], [30, 0.155], [55, 0.132], [68, 0.112], [74, 0.088], [84, 0.088], [90, 0.134], [112, 0.13], [135, 0.07], [160, 0.03], [180, 0.018]];
function linhaDoCabelo(h) {
  const a = Math.abs(Math.atan2(h.x, h.z)) * 180 / Math.PI;
  for (let i = 1; i < LINHA.length; i++) if (a <= LINHA[i][0]) { const [a0, y0] = LINHA[i - 1], [a1, y1] = LINHA[i]; return y0 + (y1 - y0) * (a - a0) / (a1 - a0); }
  return LINHA[LINHA.length - 1][1];
}
// a orelha é uma elipse do lado da cabeça (era uma caixa: o recorte quadrado aparecia em volta dela); toda região
// recebe a folga em todas as bordas, senão a pintura macia (pixel a pixel) acabava em linha reta dura
const ORELHA = (f = 0) => (h) => Math.abs(h.x) > 0.062 && ((h.y - 0.078) / Math.max(0.01, 0.058 - f)) ** 2 + ((h.z + 0.008) / Math.max(0.01, 0.043 - f)) ** 2 < 1;
const COURO = (folga) => (h) => !ORELHA(folga)(h) && h.y > linhaDoCabelo(h) - folga && h.y < 0.3;
// barba: rosto de baixo, na frente da orelha, sem a boca
const BOCA = (h, f = 0) => (h.x / Math.max(0.005, 0.027 - f)) ** 2 + ((h.y - 0.037) / Math.max(0.004, 0.017 - f)) ** 2 < 1 && h.z > 0.08;
const BIGODE = (h) => Math.abs(h.x) < 0.041 && h.y >= 0.05 && h.y < 0.069 && h.z > 0.083;
// a linha de cima da barba desce da costeleta (perto da orelha) até o canto da boca (na frente)
const linhaBarba = (h) => 0.088 - 0.42 * Math.max(0, h.z - 0.02);
const ROSTO_BAIXO = (folga) => (h) => h.z > -0.005 - folga && h.y < linhaBarba(h) + folga && h.y > -0.05 - folga * 2 && !ORELHA(folga)(h) && !BOCA(h, folga) && !(Math.abs(h.x) < 0.03 - folga && h.y > 0.066 + folga);
const BARBAS = {
  rala: ROSTO_BAIXO, cheia: ROSTO_BAIXO,
  "sem bigode": (f) => (h) => ROSTO_BAIXO(f)(h) && !BIGODE(h),
  cavanhaque: (f) => (h) => (BIGODE(h) || (Math.abs(h.x) < 0.032 + f && h.y < 0.022 + f && h.y > -0.035 - f && h.z > 0.055)) && !BOCA(h, f),
  ferradura: (f) => (h) => (BIGODE(h) || (Math.abs(h.x) > 0.018 - f && Math.abs(h.x) < 0.046 + f && h.y < 0.066 + f && h.y > -0.03 - f && h.z > 0.065 - f)) && !BOCA(h, f),
};
// cada corte: base (sombra lisa do cabelo na pele), fios (densidade por pixel²), comprimento do fio (m) e direção

// (etapa 3: riscos fortes pontilhavam de longe; o tom liso faz o cabelo curto e o risco fraco só dá o sentido do fio)
const CABELOS = {
  raspado: { base: 0.12, dens: 0.06, comp: 0.0014, alfa: 0.22 },
  militar: { base: 0.5, dens: 0.1, comp: 0.0035, alfa: 0.25 }, descolorido: { base: 0.5, dens: 0.1, comp: 0.0035, alfa: 0.25 },
  moicano: { base: 0.12, dens: 0.06, comp: 0.0015, alfa: 0.22 },
};
// embaixo dos cortes esculpidos: só a sombra lisa, que acaba na borda da malha (a linha do cabelo da malha fica 2,5 cm
// acima da desta pintura: COURO(f - 0,022))
const SOB_CABELO = { base: 0.45, dens: 0, comp: 0, alfa: 0 };
const dirCouro = (h) => V(Math.sign(h.x) * 0.3, -0.5, -0.8);           // o fio deita pra trás e um pouco pro lado
const dirBarba = (h) => (BIGODE(h) ? V(Math.sign(h.x) * 0.6, -1, 0) : V(0, -1, 0.25));
// sobrancelha: o arco acima de cada olho (mais grossa no meio, afina pra fora), fios pra fora e um pouco pra cima
const SOBRANCELHA = (folga) => (h) => {
  const ax = Math.abs(h.x), meio = 0.128 + 0.005 * Math.cos(Math.min(1.5, Math.abs(ax - 0.034) / 0.026 * 1.5));   // o olho está em y 0,111
  return ax > 0.013 - folga && ax < 0.056 + folga && h.z > 0.07 && Math.abs(h.y - meio) < 0.0022 + 0.0016 * Math.max(0, 1 - Math.abs(ax - 0.024) / 0.02) + folga;
};
// a pálpebra de cima: um arco logo acima do olho (centro em x 0,034, y 0,111; raio do globo 0,0125)
const CILIOS = (folga) => (h) => {
  const dx = Math.abs(Math.abs(h.x) - 0.034), topo = 0.111 + 0.0105 * Math.sqrt(Math.max(0, 1 - (dx / 0.0145) ** 2));
  return dx < 0.0145 + folga && h.z > 0.085 && h.y > topo - 0.0012 - folga && h.y < topo + 0.0022 + folga;
};
// rala: a barba por fazer é só a pintura (tom liso e risco fraco); nas outras a pintura é a sombra lisa embaixo do volume
const BARBA_FIOS = { rala: { base: 0.24, dens: 0.05, comp: 0.0014, alfa: 0.22, rampa: 0.016 }, cheia: { base: 0.14, dens: 0, comp: 0, alfa: 0 } };
function regiao(info, ok, W, H) {
  const caminho = new Path2D(), t = info.tri, h = info.hh;
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i], b = t[i + 1], d = t[i + 2];
    if (!ok(h[a]) || !ok(h[b]) || !ok(h[d])) continue;
    caminho.moveTo(info.uv[a].x * W, info.uv[a].y * H); caminho.lineTo(info.uv[b].x * W, info.uv[b].y * H); caminho.lineTo(info.uv[d].x * W, info.uv[d].y * H); caminho.closePath();
  }
  return caminho;
}
/* Pelo pintado na pele: uma sombra lisa (base) e fios riscados na direção do pelo em cada ponto (a direção no espaço
   da cabeça vira direção no UV pelo triângulo), mais curtos e fracos perto da borda da região. */
function pintarRegiao(c, W, H, info, regiaoDe, cor, { base, dens, comp, alfa, rampa = 0.008 }, dir, semente = 7) {
  // a sombra lisa, pixel a pixel (etapa 3): em cada pixel dos triângulos perto da região, a posição na cabeça sai
  // da interpolação dos vértices e a força vem de quantas faixas (de 8 mm pra fora até a borda) contêm o ponto: a
  // borda segue a região de verdade, macia, sem os degraus dos triângulos grandes do rosto
  if (base && typeof OffscreenCanvas === "function") {
    const FAIXAS = [[1, 0.1], [0.8, 0.22], [0.6, 0.38], [0.4, 0.55], [0.2, 0.75], [0, 1]].map(([f, a]) => [f * rampa, a]), oks = FAIXAS.map(([f]) => regiaoDe(f)), fora = oks[0];
    const lisa = new OffscreenCanvas(W, H), lc = lisa.getContext("2d"), img = lc.createImageData(W, H), px = img.data, k = new THREE.Color(cor);
    const R = Math.round(k.r * 255), G = Math.round(k.g * 255), B = Math.round(k.b * 255), t = info.tri, hh = info.hh, uv = info.uv, q = V(0, 0, 0);
    for (let i = 0; i < t.length; i += 3) {
      const A = t[i], Bv = t[i + 1], D = t[i + 2];
      if (!fora(hh[A]) && !fora(hh[Bv]) && !fora(hh[D])) continue;
      const ax = uv[A].x * W, ay = uv[A].y * H, bx = uv[Bv].x * W, by = uv[Bv].y * H, dx = uv[D].x * W, dy = uv[D].y * H;
      const det = (bx - ax) * (dy - ay) - (dx - ax) * (by - ay); if (Math.abs(det) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, dx)) - 4), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, dx)) + 4);
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, dy)) - 4), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, dy)) + 4);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const cx = x + 0.5, cy = y + 0.5, l1 = ((cx - ax) * (dy - ay) - (dx - ax) * (cy - ay)) / det, l2 = ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / det, l0 = 1 - l1 - l2;
        if (l0 < -0.12 || l1 < -0.12 || l2 < -0.12) continue;   // uns pixels além do triângulo: a ilha do UV vaza pra margem e a costura some
        q.set(0, 0, 0).addScaledVector(hh[A], l0).addScaledVector(hh[Bv], l1).addScaledVector(hh[D], l2);
        let a = 0; for (let j = FAIXAS.length - 1; j >= 0; j--) if (oks[j](q)) { a = FAIXAS[j][1]; break; }
        const o = (y * W + x) * 4; if (a * 255 > px[o + 3]) { px[o] = R; px[o + 1] = G; px[o + 2] = B; px[o + 3] = a * 255; }
      }
    }
    lc.putImageData(img, 0, 0); c.save(); c.globalAlpha = base; c.drawImage(lisa, 0, 0); c.restore();
  } else if (base) {
    for (const [folga, k] of [[0.008, 0.3], [0.003, 0.6], [0, 1]]) { const caminho = regiao(info, regiaoDe(folga), W, H); c.save(); c.clip(caminho); c.globalAlpha = base * k; c.fillStyle = cor; c.fillRect(0, 0, W, H); c.restore(); }
  }
  if (!dens) return;
  const fora = regiaoDe(0.008), meio = regiaoDe(0.003), dentro = regiaoDe(0), t = info.tri, hh = info.hh, uv = info.uv, r = sorteio(semente), k = new THREE.Color(cor);
  // risco macio (nítido demais virava granulado na pele): os fios vão pra uma camada à parte, desfocada uma vez só no
  // fim. Filtro em cada risco (milhares) travava a aba do navegador.
  const camada = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(W, H) : null, alvo = c;
  if (camada) c = camada.getContext("2d");
  c.save(); c.lineCap = "round";
  for (let i = 0; i < t.length; i += 3) {
    const A = t[i], B = t[i + 1], D = t[i + 2];
    if (!fora(hh[A]) || !fora(hh[B]) || !fora(hh[D])) continue;
    const pa = [uv[A].x * W, uv[A].y * H], pb = [uv[B].x * W, uv[B].y * H], pd = [uv[D].x * W, uv[D].y * H];
    const area = Math.abs((pb[0] - pa[0]) * (pd[1] - pa[1]) - (pd[0] - pa[0]) * (pb[1] - pa[1])) / 2;
    const e1 = hh[B].clone().sub(hh[A]), e2 = hh[D].clone().sub(hh[A]);
    const centro = hh[A].clone().add(hh[B]).add(hh[D]).multiplyScalar(1 / 3), d = dir(centro);
    // d = x e1 + y e2 (mínimos quadrados) -> no UV: x f1 + y f2
    const a11 = e1.dot(e1), a12 = e1.dot(e2), a22 = e2.dot(e2), b1 = d.dot(e1), b2 = d.dot(e2), det = a11 * a22 - a12 * a12;
    if (Math.abs(det) < 1e-14) continue;
    const x = (b1 * a22 - b2 * a12) / det, y = (b2 * a11 - b1 * a12) / det;
    const du = x * (pb[0] - pa[0]) + y * (pd[0] - pa[0]), dv = x * (pb[1] - pa[1]) + y * (pd[1] - pa[1]);
    const d3 = e1.clone().multiplyScalar(x).add(e2.clone().multiplyScalar(y)).length(), dl = Math.hypot(du, dv);
    if (dl < 1e-6 || d3 < 1e-9) continue;
    const ppm = dl / d3, ux = du / dl, uy = dv / dl, n = Math.round(area * dens + r());
    for (let s = 0; s < n; s++) {
      let r1 = r(), r2 = r(); if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
      const px = pa[0] + (pb[0] - pa[0]) * r1 + (pd[0] - pa[0]) * r2, py = pa[1] + (pb[1] - pa[1]) * r1 + (pd[1] - pa[1]) * r2;
      const hp = hh[A].clone().addScaledVector(e1, r1).addScaledVector(e2, r2);
      const forca = dentro(hp) ? 1 : meio(hp) ? 0.55 : 0.25, l = comp * ppm * (0.55 + 0.7 * r()) * (0.6 + 0.4 * forca), curva = (r() - 0.5) * l * 0.35;
      const v = 0.75 + r() * 0.5;
      c.strokeStyle = `rgb(${Math.min(255, 255 * k.r * v) | 0},${Math.min(255, 255 * k.g * v) | 0},${Math.min(255, 255 * k.b * v) | 0})`;
      c.globalAlpha = alfa * forca * (0.55 + 0.45 * r()); c.lineWidth = 0.9 + r() * 0.6;
      c.beginPath(); c.moveTo(px, py); c.quadraticCurveTo(px + ux * l / 2 - uy * curva, py + uy * l / 2 + ux * curva, px + ux * l, py + uy * l); c.stroke();
    }
  }
  c.restore();
  if (camada) { alvo.save(); alvo.filter = "blur(0.8px)"; alvo.drawImage(camada, 0, 0); alvo.restore(); }
}
export function pintarCabelo(c, W, H, info, { cabelo, barba, corCabelo }) {
  if (!info.hh) return;
  const cor = cabelo === "descolorido" ? "#d9c58c" : (corCabelo || "#2a1d14"), corPelo = corCabelo || "#2a1d14";
  if (cabelo) pintarRegiao(c, W, H, info, CABELOS[cabelo] ? COURO : (f) => COURO(f - 0.022), cor, CABELOS[cabelo] || SOB_CABELO, dirCouro, 11);
  if (cabelo === "moicano") pintarRegiao(c, W, H, info, (f) => (h) => COURO(f - 0.022)(h) && Math.abs(h.x) < 0.02 + f, cor, SOB_CABELO, dirCouro, 12);
  // cavanhaque e ferradura: só o volume (a sombra pintada é mais larga que a forma dele e deixava um contorno de caixa)
  if (barba && BARBAS[barba] && barba !== "cavanhaque" && barba !== "ferradura") {
    const semBigode = (f) => (h) => BARBAS[barba](f)(h) && !BIGODE(h);
    pintarRegiao(c, W, H, info, barba === "rala" ? BARBAS[barba] : semBigode, corPelo, barba === "rala" ? BARBA_FIOS.rala : BARBA_FIOS.cheia, dirBarba, 13);
    // (o bigode não é pintado: o volume dele tem forma própria e a região retangular da pintura aparecia como um
    // retângulo em volta da boca na pele clara)
  }
  pintarRegiao(c, W, H, info, SOBRANCELHA, corPelo, { base: 0.14, dens: 0, comp: 0, alfa: 0 }, (h) => V(Math.sign(h.x), 0.35, 0.1), 14);   // só a sombra lisa: o volume vem da malha
  // cílios: a linha escura da pálpebra de cima, fios curtos pra cima e pra fora (o olho deixa de parecer bola colada)
  pintarRegiao(c, W, H, info, CILIOS, "#1c140f", { base: 0.45, dens: 0, comp: 0.0022, alfa: 0 }, (h) => V(Math.sign(h.x) * 0.4, 1, 0.5), 15);   // linha lisa (fio riscado granulava)
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
  const info = { p: [], h: [], hh: [], uv: [], tri: g.index ? Array.from(g.index.array) : [...Array(pos.count).keys()] };
  for (let i = 0; i < pos.count; i++) {
    const p = V().fromBufferAttribute(pos, i).applyMatrix4(corpo.bindMatrix);
    let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === iH) w += sw.getComponent(i, k);
    const ph = p.clone().applyMatrix4(inv);
    info.p.push(p); info.h.push(w > 0.5 ? ph : null); info.hh.push(ph); info.uv.push(new THREE.Vector2(uv.getX(i), uv.getY(i)));
  }
  // orelha: o ponto mais pra fora (x) da cabeça na altura dos olhos
  let orelha = null;
  for (const h of info.h) if (h && h.y > 0.04 && h.y < 0.13 && h.z > -0.04 && h.z < 0.04 && (!orelha || h.x > orelha.x)) orelha = h;
  return { info, orelha };
}

/* a bandeira do Brasil desenhada (a capa da entrada, roupa_bandeira) */
export function texturaBandeira() {
  const cv = document.createElement("canvas"); cv.width = 512; cv.height = 360; const c = cv.getContext("2d");
  c.fillStyle = "#1e8c45"; c.fillRect(0, 0, 512, 360);
  c.fillStyle = "#f2c619"; c.beginPath(); c.moveTo(256, 30); c.lineTo(486, 180); c.lineTo(256, 330); c.lineTo(26, 180); c.closePath(); c.fill();
  c.fillStyle = "#1f3a93"; c.beginPath(); c.arc(256, 180, 92, 0, Math.PI * 2); c.fill();
  c.strokeStyle = "#f2eee6"; c.lineWidth = 14; c.beginPath(); c.arc(256, 330, 190, Math.PI * 1.32, Math.PI * 1.68); c.stroke();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/* ---------- cinturão: tira de couro preta, a placa grande dourada no meio e as laterais ---------- */
export function modeloCinturao() {
  const g = new THREE.Group(), ouro = new THREE.MeshStandardMaterial({ color: 0xd9a92b, metalness: 0.85, roughness: 0.3 });
  const couro = new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 0.7 }), vermelho = new THREE.MeshStandardMaterial({ color: 0xb3141a, metalness: 0.3, roughness: 0.25 });
  // tira curvada (arco), 0,9 m de ponta a ponta
  const tira = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.075, 40, 1, true, -1.15, 2.3), couro); tira.rotation.x = Math.PI / 2; tira.rotation.z = Math.PI / 2; tira.position.z = -0.4;
  tira.material.side = THREE.DoubleSide; g.add(tira);
  const placa = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.016, 28), ouro); placa.rotation.x = Math.PI / 2; placa.position.z = 0.025; g.add(placa);
  const aro = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.009, 8, 32), ouro); aro.position.z = 0.035; g.add(aro);
  const pedra = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.012, 20), vermelho); pedra.rotation.x = Math.PI / 2; pedra.position.z = 0.036; g.add(pedra);
  for (const s of [-1, 1]) {
    const lat = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.012), ouro); lat.position.set(s * 0.17, 0, -0.012); lat.rotation.y = s * 0.42; g.add(lat);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
