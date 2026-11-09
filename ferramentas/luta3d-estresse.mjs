// Estresse da luta em 3D: roda o diretor (luta3d/diretor.js) em muitas lutas
// do motor de verdade (simularRound, as mesmas linhas com evento que a
// carreira manda), em 3x, dentro da página do jogo. Reprova erro na página,
// lance que demora mais de 20 s e luta sem nenhuma finalização ou nocaute
// no lote (o lote escolhe dupla de finalizador contra quem defende mal).
//
// Uso (servidor na raiz: python3 -m http.server 8000; puppeteer-core na pasta):
//   node /caminho/ferramentas/luta3d-estresse.mjs <saida> [lutas]
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
const require = createRequire(path.join(process.cwd(), "x.js"));
const puppeteer = require("puppeteer-core");
const URL_JOGO = process.env.URL_JOGO || "http://127.0.0.1:8000/";
const [, , saida = "luta3d-estresse", lutasArg = "12"] = process.argv;
fs.mkdirSync(saida, { recursive: true });

const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--enable-gpu"] });
const page = await browser.newPage();
const erros = [];
page.on("pageerror", (e) => erros.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|supabase|ERR_/i.test(m.text())) erros.push("console: " + m.text().slice(0, 200)); });
await page.setRequestInterception(true);
page.on("request", (r) => (/octogono\.fun\/api\/|draft-ufc\.vercel\.app\/api\/|supabase\.co|\/_vercel\//.test(r.url()) ? r.abort() : r.continue()));
await page.setViewport({ width: 1000, height: 600 });
await page.goto(URL_JOGO + "#/menu", { waitUntil: "networkidle0" });
await page.evaluate(async () => { for (let i = 0; i < 100 && (typeof ROSTER === "undefined" || !ROSTER || !ROSTER.length); i++) await new Promise((r) => setTimeout(r, 100)); });

const N = Number(lutasArg);
const resumo = [];
for (let f = 0; f < N; f++) {
  const r = await page.evaluate(async (f) => {
    const m = await import("./luta3d/diretor.js");
    let div = document.getElementById("__l3d");
    if (!div) { div = document.createElement("div"); div.id = "__l3d"; div.style.cssText = "position:fixed;inset:0;z-index:99999;background:#000"; document.body.appendChild(div); }
    const l = await m.criarLuta3d(div, {});
    l.velocidade(3);
    // metade das lutas: finalizador contra quem defende mal; a outra metade: dois batedores
    const peso = ROSTER.filter((x) => x.division === "lightweight");
    const por = (k, desc) => [...peso].sort((a, b) => (desc ? b[k] - a[k] : a[k] - b[k]));
    const a = f % 2 ? por("subAvg", true)[f % 7] : por("slpm", true)[f % 9];
    const b = f % 2 ? por("tdDef", false)[(f * 3) % 11] : por("strDef", false)[(f * 5) % 11];
    const rng = mulberry32(7000 + f);
    const form = () => 1 + (rng() + rng() + rng() - 1.5) / 1.5 * TUNING.formSpread;
    const A = mkState(a, form()), B = mkState(b, form());
    A.koMult = B.koMult = fatorKoCarreira();
    const log = [];
    const push = (round, clock, kind, text, ev) => log.push(comEvento({ round, clock, kind, text }, ev));
    const fin = (w, l2, round, clock, mm) => { log.push(comEvento({ round, clock, kind: "fin", text: "" }, { tipo: "fim", quem: w === A ? "A" : "B", metodo: mm })); return { method: mm }; };
    const scores = { sa: 0, sb: 0 };
    let res = null;
    for (let round = 1; round <= 3 && !res; round++) res = simularRound(A, B, round, rng, push, fin, scores);
    if (!res) log.push(comEvento({ round: 3, clock: "0:00", kind: "fin", text: "" }, { tipo: "decisao", quem: scores.sa >= scores.sb ? "A" : "B" }));
    const lentos = [], tipos = {};
    for (const L of log) {
      if (!L.ev) continue;
      tipos[L.ev.tipo] = (tipos[L.ev.tipo] || 0) + 1;
      const t0 = performance.now();
      await Promise.race([l.lance(L), new Promise((ok) => setTimeout(ok, 20000))]);
      const dt = performance.now() - t0;
      if (dt > 19900) lentos.push(L.ev.tipo);
    }
    window.__fim = l;
    return { metodo: res ? res.method : "Decisão", linhas: log.length, tipos, lentos };
  }, f);
  await page.screenshot({ path: path.join(saida, `fim${String(f).padStart(2, "0")}.png`) });
  await page.evaluate(() => { window.__fim.destruir(); });
  resumo.push(r);
  console.log(f, r.metodo, r.linhas, "linhas", JSON.stringify(r.tipos), r.lentos.length ? "LENTOS " + r.lentos.join(",") : "");
}
await browser.close();
const lentos = resumo.flatMap((r) => r.lentos), metodos = resumo.map((r) => r.metodo);
const falhas = [];
if (erros.length) falhas.push("erros na página: " + erros.slice(0, 5).join(" | "));
if (lentos.length) falhas.push("lances presos: " + lentos.join(","));
if (!metodos.some((m) => m !== "Decisão")) falhas.push("nenhuma luta terminou antes da decisão");
console.log(falhas.length ? "FALHA\n" + falhas.join("\n") : "tudo certo");
process.exit(falhas.length ? 1 : 0);
