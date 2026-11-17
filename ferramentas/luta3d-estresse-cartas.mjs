// Estresse dos lances por carta (Tarefa 17): toca em 3x, pelo diretor, o lance de toda carta que tem
// clipe novo (mx_cartas.glb), pros dois lados, com golpe que acerta e golpe defendido. Roda duas vezes:
// com o arquivo (tem que tocar o clipe novo) e sem ele (a requisição é abortada: tem que tocar a
// reserva e terminar). Reprova erro na página, lance acima de 20 s e clipe errado.
//
// Uso (servidor na raiz: python3 -m http.server 8000; puppeteer-core na pasta):
//   node /caminho/ferramentas/luta3d-estresse-cartas.mjs <saida>
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
const require = createRequire(path.join(process.cwd(), "x.js"));
const puppeteer = require(process.env.PUPPETEER_CORE || "puppeteer-core");
const URL_JOGO = process.env.URL_JOGO || "http://127.0.0.1:8000/";
const saida = process.argv[2] || "luta3d-estresse-cartas";
fs.mkdirSync(saida, { recursive: true });
const falhas = [];
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--enable-gpu"] });
for (const comArquivo of [true, false]) {
  const page = await browser.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|supabase|ERR_/i.test(m.text())) erros.push("console: " + m.text().slice(0, 200)); });
  await page.setRequestInterception(true);
  page.on("request", (r) => (/octogono\.fun\/api\/|draft-ufc\.vercel\.app\/api\/|supabase\.co|\/_vercel\//.test(r.url()) || (!comArquivo && /mx_cartas\.glb/.test(r.url())) ? r.abort() : r.continue()));
  await page.setViewport({ width: 900, height: 560 });
  await page.goto(URL_JOGO + "#/menu", { waitUntil: "networkidle0" });
  const r = await page.evaluate(async () => {
    const m = await import("./luta3d/diretor.js");
    const L = await import("./luta3d/lances-cartas.js");
    const div = document.createElement("div"); div.style.cssText = "position:fixed;inset:0;z-index:99999;background:#000"; document.body.appendChild(div);
    const l = await m.criarLuta3d(div, {}); l.velocidade(3);
    const n = await l._dev.cartasProntas;
    const out = { clipes: n, lances: [] };
    for (const [id, lc] of Object.entries(L.LANCES_CARTAS)) {
      if (!lc.mx) continue;
      for (const quem of ["A", "B"]) for (const bloqueio of [false, true]) {
        const t0 = performance.now();
        const lado = quem === "A" ? l._dev.A : l._dev.B;
        await l.lance({ ev: { tipo: "golpe1", quem, carta: id, golpe: lc.golpe, forca: 4, bloqueio } });
        const tocou = Object.keys(lado.acoes).includes(lc.mx.clipe), tocouReserva = Object.keys(lado.acoes).includes(lc.reserva);
        out.lances.push({ id, quem, bloqueio, s: +((performance.now() - t0) / 1000).toFixed(1), tocou, tocouReserva });
      }
    }
    /* lances programados (Tarefa 19): cada um dos dois lados, no estado em que a carta aparece (em pé, por cima, por baixo);
       depois de cada um a luta tem que seguir (um golpe e a separação) sem NaN nos corpos */
    out.prog = [];
    const preparo = { martelada: (q) => [{ tipo: "queda", quem: q }], passagem: (q) => [{ tipo: "queda", quem: q }], raspagem: (q) => [{ tipo: "queda", quem: q === "A" ? "B" : "A" }] };
    const EV = { sprawl: "quedaDefendida", single_leg: "queda", suplex: "queda", bodylock: "queda", superman: "golpe1", martelada: "gnp1", raspagem: "raspou", passagem: "controle" };
    for (const [prog, tipo] of Object.entries(EV)) for (const quem of ["A", "B"]) {
      const t0 = performance.now();
      for (const ev of (preparo[prog] ? preparo[prog](quem) : [])) await l.lance({ ev });
      const carta = Object.entries(L.LANCES_CARTAS).find(([, x]) => x.prog === prog)[0];
      await l.lance({ ev: { tipo, quem, prog, carta, forca: 4, forte: true } });
      await l.lance({ ev: { tipo: "separa", quem } });
      await l.lance({ ev: { tipo: "golpe1", quem, golpe: "jab", forca: 2 } });
      const ok = [l._dev.A, l._dev.B].every((L2) => ["x", "y", "z"].every((e) => Number.isFinite(L2.raiz.position[e])) && Math.abs(L2.raiz.rotation.x) < 0.01 && Math.abs(L2.raiz.rotation.z) < 0.01);
      out.prog.push({ id: prog, quem, s: +((performance.now() - t0) / 1000).toFixed(1), ok });
    }
    for (const quem of ["A", "B"]) {
      const t0 = performance.now();
      await l.lance({ ev: { tipo: "inicio", quem, round: 1 } });
      await l._dev.lances.finalizacao(quem === "A" ? l._dev.A : l._dev.B, quem === "A" ? l._dev.B : l._dev.A, "", "kimura");
      out.prog.push({ id: "kimura", quem, s: +((performance.now() - t0) / 1000).toFixed(1), ok: true });
    }
    l.destruir(); div.remove(); return out;
  });
  const rot = comArquivo ? "com o arquivo" : "sem o arquivo";
  const lentosProg = r.prog.filter((x) => x.s > 25 || !x.ok);
  console.log(`  lances programados: ${r.prog.length} (mais lento ${Math.max(...r.prog.map((x) => x.s))} s)`);
  if (lentosProg.length) falhas.push(rot + " lance programado preso ou torto: " + JSON.stringify(lentosProg));
  const lentos = r.lances.filter((x) => x.s > 20);
  const errados = r.lances.filter((x) => (comArquivo ? !x.tocou : x.tocou || !x.tocouReserva));
  console.log(`${rot}: ${r.clipes} clipes carregados, ${r.lances.length} lances, mais lento ${Math.max(...r.lances.map((x) => x.s))} s, erros ${erros.length}`);
  if (comArquivo && r.clipes < 20) falhas.push("poucos clipes: " + r.clipes);
  if (!comArquivo && r.clipes !== 0) falhas.push("carregou sem o arquivo");
  if (lentos.length) falhas.push(rot + " lentos: " + JSON.stringify(lentos));
  if (errados.length) falhas.push(rot + " clipe errado: " + JSON.stringify(errados.slice(0, 3)));
  if (erros.length) falhas.push(rot + " erros: " + erros.slice(0, 3).join(" | "));
  await page.close();
}
await browser.close();
console.log(falhas.length ? "FALHA\n" + falhas.join("\n") : "tudo certo");
process.exit(falhas.length ? 1 : 0);
