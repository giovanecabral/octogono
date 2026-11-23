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
