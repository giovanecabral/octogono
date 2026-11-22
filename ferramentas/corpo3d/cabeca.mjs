// Medidas da cabeça (no espaço do osso Head) de um corpo GLB: pontos com peso > .5 no Head. O transplante usa pra pôr
// o pivô da cabeça nova no mesmo lugar do crânio que o do esqueleto de referência (o diretor mira o rosto a partir dele).
const T = await import(new URL("../../luta3d/vendor/three.module.js", import.meta.url).href);
const { lerGLB } = await import(new URL("../converter-mixamo.mjs", import.meta.url).href);
const TIPO = { 5121: Uint8Array, 5123: Uint16Array, 5126: Float32Array }, COMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function ler(g, i) { const a = g.json.accessors[i], bv = g.json.bufferViews[a.bufferView], C = TIPO[a.componentType], n = a.count * COMP[a.type];
  const ini = g.bin.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0), k = COMP[a.type], tam = k * C.BYTES_PER_ELEMENT, passo = bv.byteStride || tam;
  const out = new C(n), dv = new DataView(g.bin.buffer);
  for (let i = 0; i < a.count; i++) out.set(new C(g.bin.buffer.slice(ini + i * passo, ini + i * passo + tam)), i * k);
  return out; }
export function medir(arq, material = null) {   // a pele: MI_Pele (corpo novo) ou MI_Superhero_Male (referência)
  const g = lerGLB(arq), sk = g.json.skins[0], iH = sk.joints.findIndex((j) => g.json.nodes[j].name === "Head");
  const ibm = new T.Matrix4().fromArray(ler(g, sk.inverseBindMatrices).slice(iH * 16, iH * 16 + 16));
  const mi = g.json.materials.findIndex((m) => material ? m.name === material : ["MI_Pele", "MI_Superhero_Male"].includes(m.name));
  const pts = [];
  for (const me of g.json.meshes) for (const pr of me.primitives) {
    if (pr.material !== mi) continue;
    const P = ler(g, pr.attributes.POSITION), J = ler(g, pr.attributes.JOINTS_0), W = ler(g, pr.attributes.WEIGHTS_0);
    for (let v = 0; v < P.length / 3; v++) { let w = 0; for (let k = 0; k < 4; k++) if (J[v * 4 + k] === iH) w += W[v * 4 + k];
      if (w > 0.5) pts.push(new T.Vector3(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]).applyMatrix4(ibm)); }
  }
  // crânio: acima da altura dos olhos não tem orelha nem queixo; topo, testa, nuca e laterais
  const ys = pts.map((p) => p.y).sort((a, b) => a - b), topo = ys[ys.length - 1];
  const q = (arr, f) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(f * (s.length - 1))]; };
  const alto = pts.filter((p) => p.y > topo - 0.07);
  return { n: pts.length, topo, x: [q(alto.map((p) => p.x), 0.01), q(alto.map((p) => p.x), 0.99)], z: [q(alto.map((p) => p.z), 0.01), q(alto.map((p) => p.z), 0.99)],
    yQueixo: ys[0], yOrelha: null };
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) console.log(JSON.stringify(medir(process.argv[2], process.argv[3])));
