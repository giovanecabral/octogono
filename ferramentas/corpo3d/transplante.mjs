/* Troca o esqueleto do corpo exportado pelo Blender pelo do corpo do jogo: mesmos nomes e orientações
   de osso (as animações do jogo valem sem conversão), nas posições das juntas do corpo novo. */
import fs from "node:fs";
const T = await import(new URL("../../luta3d/vendor/three.module.js", import.meta.url).href);
const { lerGLB } = await import(new URL("../converter-mixamo.mjs", import.meta.url).href);
const [entrada, modelo, saida, bindCorpo] = process.argv.slice(2);
// bind_corpo.json (corpo.py): o quanto cada osso andou da pose da escultura até a T, no mundo do Blender
const DELTA = bindCorpo && fs.existsSync(bindCorpo) ? JSON.parse(fs.readFileSync(bindCorpo, "utf8")) : null;
let DESLOCA = null;   // deslocamento do pivô da cabeça (espaço do osso Head), medido na primeira passada
function gerar() {
  const N = lerGLB(entrada), Q = lerGLB(modelo);
  const NOME = { head: "Head", Root: "root" };
  function mundos(g) {
    const nos = g.json.nodes, pai = new Array(nos.length).fill(-1);
    nos.forEach((n, i) => (n.children || []).forEach((c) => (pai[c] = i)));
    const loc = nos.map((n) => n.matrix ? new T.Matrix4().fromArray(n.matrix) : new T.Matrix4().compose(
      new T.Vector3(...(n.translation || [0, 0, 0])), new T.Quaternion(...(n.rotation || [0, 0, 0, 1])), new T.Vector3(...(n.scale || [1, 1, 1]))));
    const W = []; const w = (i) => W[i] || (W[i] = pai[i] < 0 ? loc[i].clone() : w(pai[i]).clone().multiply(loc[i]));
    nos.forEach((_, i) => w(i)); return { W, pai };
  }
  const mn = mundos(N), mq = mundos(Q);
  const qPorNome = Object.fromEntries(Q.json.nodes.map((n, i) => [n.name, i]));
  const skin = N.json.skins[0];
  // mundo novo de cada junta: rotação e escala do jogo, posição do corpo novo
  const Wn = {};
  for (const j of skin.joints) {
    const nome = NOME[N.json.nodes[j].name] || N.json.nodes[j].name, qi = qPorNome[nome];
    if (qi == null) { if (nome !== "neutral_bone") throw new Error("junta sem par no jogo: " + nome); Wn[j] = mn.W[j].clone(); continue; }
    const p = new T.Vector3(), r = new T.Quaternion(), s = new T.Vector3(), p2 = new T.Vector3();
    mq.W[qi].decompose(p, r, s); mn.W[j].decompose(p2, new T.Quaternion(), new T.Vector3());
    // a cabeça: o pivô vai pro mesmo lugar do crânio que no corpo do jogo (deslocamento no espaço do osso Head)
    if (nome === "Head" && DESLOCA) p2.add(new T.Vector3(...DESLOCA).applyQuaternion(r));
    Wn[j] = new T.Matrix4().compose(nome === "root" ? p : p2, r, s);
  }
  const ORIGINAL = Object.fromEntries(skin.joints.map((j) => [j, N.json.nodes[j].name]));   // nome do Blender (o delta usa)
  for (const j of skin.joints) {
    const n = N.json.nodes[j], pi = mn.pai[j], base = Wn[pi] || mn.W[pi] || new T.Matrix4();
    const L = base.clone().invert().multiply(Wn[j]), p = new T.Vector3(), r = new T.Quaternion(), s = new T.Vector3();
    L.decompose(p, r, s); delete n.matrix;
    n.translation = p.toArray(); n.rotation = r.toArray(); n.scale = s.toArray();
    n.name = NOME[n.name] || n.name;
  }
  // matrizes de bind inversas, no lugar das antigas (mesmo tamanho)
  const malhaNo = N.json.nodes.findIndex((n) => n.skin === 0);
  const Mm = mn.W[malhaNo];
  const a = N.json.accessors[skin.inverseBindMatrices], bv = N.json.bufferViews[a.bufferView];
  const off = (bv.byteOffset || 0) + (a.byteOffset || 0);
  skin.joints.forEach((j, k) => {
    const ibm = Wn[j].clone().invert().multiply(Mm);
    ibm.elements.forEach((x, e) => N.bin.writeFloatLE(x, off + (k * 16 + e) * 4));
  });
  // o corpo (2026-11-23) tem a pele própria: as mesmas juntas, com o bind na pose em que foi esculpido. As outras
  // malhas (calção, luva, olho) continuam com o bind em T. Bind da escultura = Wn^-1 · delta(T <- escultura) · malha.
  if (DELTA) {
    const C = new T.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1), Ci = C.clone().invert();   // Blender (z pra cima) -> glTF
    const no = N.json.nodes.findIndex((n) => n.skin === 0 && n.mesh != null && N.json.meshes[n.mesh].name === "corpo");
    if (no < 0) throw new Error("corpo sem nó com pele");
    const buf = Buffer.alloc(skin.joints.length * 64);
    skin.joints.forEach((j, k) => {
      const d = DELTA[ORIGINAL[j]], P = d ? C.clone().multiply(new T.Matrix4().set(...d.flat())).multiply(Ci) : new T.Matrix4();
      Wn[j].clone().invert().multiply(P).multiply(mn.W[no]).elements.forEach((x, e) => buf.writeFloatLE(x, (k * 16 + e) * 4));
    });
    const ini = Math.ceil(N.bin.length / 4) * 4;
    N.bin = Buffer.concat([N.bin, Buffer.alloc(ini - N.bin.length), buf]); N.json.buffers[0].byteLength = N.bin.length;
    N.json.bufferViews.push({ buffer: 0, byteOffset: ini, byteLength: buf.length });
    N.json.accessors.push({ bufferView: N.json.bufferViews.length - 1, componentType: 5126, count: skin.joints.length, type: "MAT4" });
    N.json.skins.push({ ...skin, name: "corpo", inverseBindMatrices: N.json.accessors.length - 1 });
    N.json.nodes[no].skin = N.json.skins.length - 1;
  }
  // as outras malhas com pele usam o mesmo esqueleto
  const js = Buffer.from(JSON.stringify(N.json)); const pad = (b, c) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, c)]);
  const J = pad(js, 0x20), B = pad(N.bin, 0);
  const h = Buffer.alloc(12); h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(12 + 8 + J.length + 8 + B.length, 8);
  const cj = Buffer.alloc(8); cj.writeUInt32LE(J.length, 0); cj.writeUInt32LE(0x4e4f534a, 4);
  const cb = Buffer.alloc(8); cb.writeUInt32LE(B.length, 0); cb.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(saida, Buffer.concat([h, cj, J, cb, B]));
  return N;
}
let N = gerar();
// cabeça: o pivô vai pro lugar do crânio onde o esqueleto de referência tem o dele (topo e centro iguais)
const { medir } = await import(new URL("./cabeca.mjs", import.meta.url).href);
const a = medir(modelo), b = medir(saida), cx = (m) => (m.x[0] + m.x[1]) / 2, cz = (m) => (m.z[0] + m.z[1]) / 2;
DESLOCA = [cx(b) - cx(a), b.topo - a.topo, cz(b) - cz(a)];
N = gerar();
const c = medir(saida);
console.log("cabeça: deslocamento", DESLOCA.map((x) => x.toFixed(4)).join(" "), "| topo", c.topo.toFixed(4), "x referência", a.topo.toFixed(4));
console.log("transplante", saida, "juntas", N.json.skins[0].joints.length, "skins", N.json.skins.length, "malhas", N.json.meshes.map((m) => m.name).join(","));
