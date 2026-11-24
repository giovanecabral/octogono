/* Formas corretivas do ombro (Passo 2 da anatomia, item 6): junta as poses geradas pela ferramenta de poses
   (CORRETIVO=<pasta> node ferramentas/poses3d.mjs <saida> eleva:90:l,eleva:90:r,...) em luta3d/corretivos.json,
   que o jogo carrega e liga pela elevação do úmero (lutador.js, prepararCorretivos). Deslocamento em décimos de mm.
   Uso: node ferramentas/corpo3d/corretivos.mjs <pasta> [saida] */
import fs from "node:fs"; import path from "node:path";
const [, , pasta, saida = "luta3d/corretivos.json"] = process.argv;
const alvos = [];
for (const f of fs.readdirSync(pasta).filter((x) => /^eleva_\d+_[lr]\.json$/.test(x)).sort()) {
  const [, graus, lado] = f.match(/^eleva_(\d+)_([lr])\.json$/), o = JSON.parse(fs.readFileSync(path.join(pasta, f), "utf8"));
  if (o.lado !== lado) throw new Error(`${f}: lado ${o.lado}`);
  alvos.push({ nome: `corr_${lado}_${graus}`, lado, graus: Number(graus), idx: o.idx, d: o.d.map((x) => Math.round(x * 1e4)) });
}
// SOMAR=1: as poses foram geradas com as formas ligadas; o que veio é resíduo e soma no arquivo que já existe
if (process.env.SOMAR && fs.existsSync(saida)) {
  const velho = JSON.parse(fs.readFileSync(saida, "utf8"));
  for (const a of alvos) {
    const v = velho.alvos.find((x) => x.nome === a.nome); if (!v) continue;
    const m = new Map(v.idx.map((i, k) => [i, v.d.slice(3 * k, 3 * k + 3)]));
    a.idx.forEach((i, k) => { const o = m.get(i) || [0, 0, 0]; m.set(i, o.map((x, e) => x + a.d[3 * k + e])); });
    a.idx = [...m.keys()].sort((x, y) => x - y); a.d = a.idx.flatMap((i) => m.get(i));
  }
}
fs.writeFileSync(saida, JSON.stringify({ versao: 1, unidade: 1e-4, alvos }));
console.log(saida, alvos.map((a) => `${a.nome}:${a.idx.length}`).join(" "), (fs.statSync(saida).size / 1024).toFixed(0) + " KB");
