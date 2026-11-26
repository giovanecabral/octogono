/* Medidas do corpo por porte (rodada 2 da anatomia, 2026-11-26), direto do lutador.glb: bideltoide, cintura (corte da
   malha), razão, largura e profundidade do peito, barriga contra o peito, circunferência de braço, antebraço, coxa e
   panturrilha (casca convexa), e o tamanho da mão e da cabeça (que não podem mudar). Médio é a malha; os outros somam o
   alvo de forma "porte_<nome>". Usada pela suíte luta3d (ordem leve < médio < pesado, razões) e na mão:
   node ferramentas/corpo3d/medidas.mjs [luta3d/lutador.glb] */
import fs from "node:fs"; import url from "node:url"; import path from "node:path";
const AQUI = path.dirname(url.fileURLToPath(import.meta.url));
const THREE = await import(url.pathToFileURL(path.join(AQUI, "..", "..", "luta3d", "vendor", "three.module.js")).href);

function ler(arq) {
  const b = fs.readFileSync(arq), nj = b.readUInt32LE(12), j = JSON.parse(b.slice(20, 20 + nj).toString()), bin = b.slice(20 + nj + 8);
  const acc = (i) => { const a = j.accessors[i], v = j.bufferViews[a.bufferView], n = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
    const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType], off = (v.byteOffset || 0) + (a.byteOffset || 0);
    return new T(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + a.count * n * T.BYTES_PER_ELEMENT)); };
  const no = j.nodes.find((x) => x.name === "corpo"), me = j.meshes[no.mesh], pr = me.primitives[0], sk = j.skins[no.skin];
  const W0 = acc(pr.attributes.WEIGHTS_0);
  return { P: acc(pr.attributes.POSITION), J: acc(pr.attributes.JOINTS_0), W: W0 instanceof Float32Array ? W0 : Float32Array.from(W0, (x) => x / (W0 instanceof Uint8Array ? 255 : 65535)), I: acc(pr.indices),
    nomes: sk.joints.map((k) => j.nodes[k].name), IB: acc(sk.inverseBindMatrices), alvos: (pr.targets || []).map((t) => acc(t.POSITION)), nomesAlvo: (me.extras && me.extras.targetNames) || [] };
}

export function medirPortes(arq) {
  const G = ler(arq), n = G.P.length / 3;
  const junta = (nm) => { const k = G.nomes.indexOf(nm); return new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(G.IB, k * 16).invert()); };
  const peso = (i, re) => { let s = 0; for (let c = 0; c < 4; c++) if (re.test(G.nomes[G.J[4 * i + c]])) s += G.W[4 * i + c]; return s; };
  const v3 = (P, i) => new THREE.Vector3(P[3 * i], P[3 * i + 1], P[3 * i + 2]);
  // conjuntos, escolhidos na malha sem porte: o alto do deltoide, o tronco, a mão e a cabeça
  const ua = junta("upperarm_l"), eu = junta("lowerarm_l").sub(ua), Lu = eu.length(); eu.normalize();
  const cl = junta("clavicle_l"), pel = junta("pelvis"), s3 = junta("spine_03");
  const delt = [], tronco = [], mao = [], cab = [];
  for (let i = 0; i < n; i++) {
    const p = v3(G.P, i), q = p.clone(); q.x = Math.abs(q.x); const t = q.clone().sub(ua).dot(eu) / Lu;
    if (peso(i, /^(lowerarm|hand)/) < 0.2 && t <= 0.3 && p.y > cl.y - 0.06 && Math.abs(p.x) > 0.1) delt.push(i);
    if (peso(i, /^(spine_0[123]|pelvis)/) > 0.9) tronco.push(i);
    if (peso(i, /^(hand_l|thumb_0._l|index_0._l|middle_0._l|ring_0._l|pinky_0._l)$/) > 0.9) mao.push(i);
    if (peso(i, /^Head$/) > 0.99) cab.push(i);
  }
  const tam = (P, idx) => { const c = new THREE.Vector3(); for (const i of idx) c.add(v3(P, i)); c.multiplyScalar(1 / idx.length); let s = 0; for (const i of idx) s += v3(P, i).distanceToSquared(c); return Math.sqrt(s / idx.length); };
  const medir = (P) => {
    let bid = 0; for (const i of delt) bid = Math.max(bid, Math.abs(P[3 * i])); bid *= 2;
    // cintura: corte da malha na altura, o trecho contínuo que passa por x = 0 (o braço em A fica fora pelo vão de mais
    // de 2,5 cm); a menor largura entre o cós e o peito
    const corte = (y) => { const xs = []; const I = G.I; for (let k = 0; k < I.length; k += 3) for (const [a, b] of [[I[k], I[k + 1]], [I[k + 1], I[k + 2]], [I[k + 2], I[k]]]) {
        const ya = P[3 * a + 1], yb = P[3 * b + 1]; if ((ya - y) * (yb - y) >= 0) continue; const t = (y - ya) / (yb - ya); xs.push(P[3 * a] + (P[3 * b] - P[3 * a]) * t); }
      xs.sort((a, b) => a - b); if (xs.length < 6) return 0;
      let esq = xs[0], dir = xs[xs.length - 1];
      for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > 0.025) { if (xs[i] <= 0.08 && xs[i] > esq && xs[i - 1] < -0.1) esq = xs[i]; if (xs[i - 1] >= -0.08 && xs[i - 1] < dir && xs[i] > 0.1) dir = xs[i - 1]; }
      return dir - esq; };
    let cint = 9; for (let y = pel.y + 0.105; y <= s3.y - 0.04; y += 0.005) { const w = corte(y); if (w > 0.15) cint = Math.min(cint, w); }
    let lp = 0, pp = 0; for (let y = s3.y - 0.06; y <= s3.y + 0.06; y += 0.01) { let mn = 9, mx = -9, zn = 9, zx = -9; for (const i of tronco) if (Math.abs(P[3 * i + 1] - y) < 0.01) { mn = Math.min(mn, P[3 * i]); mx = Math.max(mx, P[3 * i]); zn = Math.min(zn, P[3 * i + 2]); zx = Math.max(zx, P[3 * i + 2]); } lp = Math.max(lp, mx - mn); pp = Math.max(pp, zx - zn); }
    let barr = -9; for (const i of tronco) if (P[3 * i + 1] > pel.y + 0.08 && P[3 * i + 1] < s3.y - 0.02) barr = Math.max(barr, P[3 * i + 2]);
    let peit = -9; for (const i of tronco) if (Math.abs(P[3 * i + 1] - s3.y) < 0.06) peit = Math.max(peit, P[3 * i + 2]);
    let prof = 0; for (let y = pel.y + 0.08; y <= s3.y - 0.02; y += 0.01) { let zn = 9, zx = -9; for (const i of tronco) if (Math.abs(P[3 * i + 1] - y) < 0.01 && Math.abs(P[3 * i]) < 0.06) { zn = Math.min(zn, P[3 * i + 2]); zx = Math.max(zx, P[3 * i + 2]); } prof = Math.max(prof, zx - zn); }
    const membro = (osso, filho, t, re) => { const a = junta(osso), b = junta(filho), e = b.clone().sub(a), L = e.length(); e.normalize(); const u = e.clone().cross(new THREE.Vector3(0, 0, 1)).normalize(), w = e.clone().cross(u);
      const pts = []; for (let i = 0; i < n; i++) { if (peso(i, re) < 0.5) continue; const q0 = v3(G.P, i).sub(a); if (Math.abs(q0.dot(e) / L - t) > 0.03) continue; const d = v3(P, i).sub(a); pts.push([d.dot(u), d.dot(w)]); }
      pts.sort((p1, p2) => p1[0] - p2[0] || p1[1] - p2[1]); const cr = (o, p1, p2) => (p1[0] - o[0]) * (p2[1] - o[1]) - (p1[1] - o[1]) * (p2[0] - o[0]); const lo = [], hi = [];
      for (const q of pts) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
      for (const q of pts.slice().reverse()) { while (hi.length > 1 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
      const h = lo.slice(0, -1).concat(hi.slice(0, -1)); let per = 0; for (let k = 0; k < h.length; k++) { const p1 = h[k], p2 = h[(k + 1) % h.length]; per += Math.hypot(p1[0] - p2[0], p1[1] - p2[1]); } return +(per * 100).toFixed(1); };
    return { bideltoide: +(bid * 100).toFixed(1), cintura: +(cint * 100).toFixed(1), razao: +(bid / cint).toFixed(2), peito_larg: +(lp * 100).toFixed(1), peito_prof: +(pp * 100).toFixed(1),
      barriga_prof: +(prof * 100).toFixed(1), barriga_menos_peito: +((barr - peit) * 100).toFixed(1),
      braco: membro("upperarm_l", "lowerarm_l", 0.55, /^(upperarm_l|axila_l)/), antebraco: membro("lowerarm_l", "hand_l", 0.25, /^lowerarm_l/), pulso: membro("lowerarm_l", "hand_l", 0.85, /^lowerarm_l/),
      coxa: membro("thigh_l", "calf_l", 0.7, /^thigh_l/), panturrilha: membro("calf_l", "foot_l", 0.3, /^calf_l/),
      mao_mm: +(tam(P, mao) * 1000).toFixed(2), cabeca_mm: +(tam(P, cab) * 1000).toFixed(2) };
  };
  const out = { médio: medir(G.P) };
  G.nomesAlvo.forEach((nm, k) => { if (!nm.startsWith("porte_")) return; const P = Float32Array.from(G.P); for (let i = 0; i < P.length; i++) P[i] += G.alvos[k][i]; out[nm.slice(6)] = medir(P); });
  return out;
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  const m = medirPortes(process.argv[2] || path.join(AQUI, "..", "..", "luta3d", "lutador.glb"));
  for (const [p, v] of Object.entries(m)) console.log(p.padEnd(8), JSON.stringify(v));
}
