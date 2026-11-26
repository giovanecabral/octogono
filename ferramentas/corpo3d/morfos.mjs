/* Alvos de forma do porte no corpo (2026-11-23, etapa b): lê portes.json (posição e delta de cada vértice no Blender,
   z pra cima, pose da escultura) e grava no lutador.glb um alvo de forma por porte na malha "corpo" (POSITION
   relativa, nomes em extras.targetNames: "porte_leve", "porte_pesado"). O vértice do GLB acha o do Blender pela
   posição (o exportador duplica vértice na costura do UV). Uso: node morfos.mjs <lutador.glb> <portes.json> */
import fs from "node:fs";
const [, , arq, arqPortes] = process.argv;
const b = fs.readFileSync(arq), nj = b.readUInt32LE(12), j = JSON.parse(b.slice(20, 20 + nj).toString());
let bin = b.slice(20 + nj + 8, 20 + nj + 8 + b.readUInt32LE(20 + nj));
const portes = JSON.parse(fs.readFileSync(arqPortes, "utf8"));
const ler = (i) => { const a = j.accessors[i], v = j.bufferViews[a.bufferView], n = { VEC3: 3 }[a.type];
  const off = (v.byteOffset || 0) + (a.byteOffset || 0); return new Float32Array(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + a.count * n * 4)); };
const no = j.nodes.find((x) => x.name === "corpo"), malha = j.meshes[no.mesh];
const lerI = (i) => { const a = j.accessors[i], v = j.bufferViews[a.bufferView], T = { 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
  const off = (v.byteOffset || 0) + (a.byteOffset || 0); return new T(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + a.count * T.BYTES_PER_ELEMENT)); };
/* dobra do alvo (rodada 2, 2026-11-26): os alvos maiores de braço e ombro viravam triângulos no braço (normal girando
   mais de 60 graus com o alvo, sem pose nenhuma; leve 4 -> 11). Alisa o deslocamento (não a posição) só nos vértices
   dos triângulos virados e em dois anéis em volta, com os vértices de mesma posição juntos (a costura do UV não abre),
   até não sobrar triângulo virado: a forma longe da dobra, e as medidas, ficam */
function semDobra(P, I, D) {
  const n = P.length / 3, grupo = new Int32Array(n), id = new Map();
  for (let i = 0; i < n; i++) { const k = chave(P[3 * i], P[3 * i + 1], P[3 * i + 2]); if (!id.has(k)) id.set(k, id.size); grupo[i] = id.get(k); }
  const ng = id.size, viz = Array.from({ length: ng }, () => new Set());
  for (let t = 0; t < I.length; t += 3) for (const [a, c] of [[0, 1], [1, 2], [2, 0]]) { const x = grupo[I[t + a]], y = grupo[I[t + c]]; if (x !== y) { viz[x].add(y); viz[y].add(x); } }
  const nrm = (Q, t) => { const a = I[t], b_ = I[t + 1], c = I[t + 2], u = [0, 1, 2].map((k) => Q[3 * b_ + k] - Q[3 * a + k]), w = [0, 1, 2].map((k) => Q[3 * c + k] - Q[3 * a + k]);
    return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; };
  const virados = () => { const Q = P.map((x, i) => x + D[i]), out = [];
    for (let t = 0; t < I.length; t += 3) { const a = nrm(P, t), c = nrm(Q, t), la = Math.hypot(...a), lc = Math.hypot(...c);
      if (la > 1e-12 && lc > 1e-12 && a[0] * c[0] + a[1] * c[1] + a[2] * c[2] < 0.5 * la * lc) out.push(t); }
    return out; };
  let v = virados(); const antes = v.length;
  for (let volta = 0; volta < 8 && v.length; volta++) {
    let alvo = new Set(); for (const t of v) for (let k = 0; k < 3; k++) alvo.add(grupo[I[t + k]]);
    for (let anel = 0; anel < 2; anel++) { const mais = new Set(alvo); for (const g of alvo) for (const x of viz[g]) mais.add(x); alvo = mais; }
    const Dg = new Float64Array(ng * 3), c = new Int32Array(ng);
    for (let i = 0; i < n; i++) { const g = grupo[i]; for (let k = 0; k < 3; k++) Dg[3 * g + k] += D[3 * i + k]; c[g]++; }
    for (let g = 0; g < ng; g++) for (let k = 0; k < 3; k++) Dg[3 * g + k] /= c[g] || 1;
    for (let it = 0; it < 6; it++) { const novo = Float64Array.from(Dg);
      for (const g of alvo) { if (!viz[g].size) continue; for (let k = 0; k < 3; k++) { let s = 0; for (const x of viz[g]) s += Dg[3 * x + k]; novo[3 * g + k] = 0.5 * Dg[3 * g + k] + 0.5 * s / viz[g].size; } }
      Dg.set(novo); }
    for (let i = 0; i < n; i++) if (alvo.has(grupo[i])) for (let k = 0; k < 3; k++) D[3 * i + k] = Dg[3 * grupo[i] + k];
    v = virados();
  }
  return [antes, v.length];
}
const chave = (x, y, z) => `${Math.round(x * 2e4)},${Math.round(y * 2e4)},${Math.round(z * 2e4)}`;
const nomes = Object.keys(portes);
const extra = [];
let casados = 0, total = 0;
for (const pr of malha.primitives) {
  const P = ler(pr.attributes.POSITION), n = P.length / 3; pr.targets = [];
  for (const porte of nomes) {
    const mapa = new Map();
    for (const [x, y, z, dx, dy, dz] of portes[porte]) mapa.set(chave(x, z, -y), [dx, dz, -dy]);   // Blender (z pra cima) -> glTF (y pra cima)
    const D = new Float32Array(n * 3), mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) {
      const d = mapa.get(chave(P[3 * i], P[3 * i + 1], P[3 * i + 2]));
      if (d) { D.set(d, 3 * i); if (porte === nomes[0]) casados++; }
      for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], D[3 * i + k]); mx[k] = Math.max(mx[k], D[3 * i + k]); }
    }
    const [dobrasAntes, dobrasDepois] = semDobra(P, lerI(pr.indices), D);
    mn.fill(Infinity); mx.fill(-Infinity);   // o min/max do acessório tem que ser o do alvo alisado
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], D[3 * i + k]); mx[k] = Math.max(mx[k], D[3 * i + k]); }
    console.log("morfos", porte, "triângulos virados pelo alvo:", dobrasAntes, "->", dobrasDepois);
    if (porte === nomes[0]) total += n;
    const off = bin.length + extra.reduce((s, x) => s + x.length, 0);
    extra.push(Buffer.from(D.buffer));
    j.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: D.byteLength });
    j.accessors.push({ bufferView: j.bufferViews.length - 1, componentType: 5126, count: n, type: "VEC3", min: mn, max: mx });
    pr.targets.push({ POSITION: j.accessors.length - 1 });
  }
}
malha.weights = nomes.map(() => 0); malha.extras = { ...(malha.extras || {}), targetNames: nomes.map((p) => "porte_" + p) };
const esperado = Object.values(portes)[0]?.length || 0;
bin = Buffer.concat([bin, ...extra]); while (bin.length % 4) bin = Buffer.concat([bin, Buffer.from([0])]);
j.buffers[0].byteLength = bin.length;
let js = Buffer.from(JSON.stringify(j)); while (js.length % 4) js = Buffer.concat([js, Buffer.from(" ")]);
const out = Buffer.alloc(12 + 8 + js.length + 8 + bin.length);
out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
out.writeUInt32LE(js.length, 12); out.writeUInt32LE(0x4e4f534a, 16); js.copy(out, 20);
out.writeUInt32LE(bin.length, 20 + js.length); out.writeUInt32LE(0x004e4942, 24 + js.length); bin.copy(out, 28 + js.length);
fs.writeFileSync(arq, out);
console.log("morfos", nomes.join(","), "vértices do GLB com delta", casados, "de", total, "(no Blender:", esperado + ")");
