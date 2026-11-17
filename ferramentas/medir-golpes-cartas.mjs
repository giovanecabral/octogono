// Mede imp e dist dos golpes novos (mx_cartas.glb) com o método dos antigos: toca o clipe no próprio
// 3D (Lutador.umaVez, com o root motion), anota a distância do membro até o quadril de partida e
// escolhe o instante do alcance máximo (imp). dist = alcance + o quanto o alvo fica à frente
// (rosto 0,10, corpo 0,15, perna 0,08, como em alvoDe do diretor). Os golpes que já existem
// (Jab, Mma_Kick...) entram na lista pra conferir o método contra os números do diretor.
//
// Uso (servidor na raiz: python3 -m http.server 8000; puppeteer-core na pasta):
//   LISTA='[["Jab","hand_l","cabeca"]]' node /caminho/ferramentas/medir-golpes-cartas.mjs
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(path.join(process.cwd(), "x.js"));
const puppeteer = require(process.env.PUPPETEER_CORE || "puppeteer-core");
const URL_JOGO = process.env.URL_JOGO || "http://127.0.0.1:8000/";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--enable-gpu"] });
const page = await browser.newPage();
await page.setRequestInterception(true);
page.on("request", (r) => (/octogono\.fun\/api\/|draft-ufc\.vercel\.app\/api\/|supabase\.co|\/_vercel\//.test(r.url()) ? r.abort() : r.continue()));
await page.goto(URL_JOGO + "#/menu", { waitUntil: "networkidle0" });
const r = await page.evaluate(async (lista) => {
  const m = await import("./luta3d/diretor.js");
  const div = document.createElement("div"); div.style.cssText = "position:fixed;inset:0"; document.body.appendChild(div);
  const l = await m.criarLuta3d(div, {}), { A, B, THREE } = l._dev;
  const n = await l._dev.cartasProntas;
  const saida = { clipesDasCartas: n, medidas: {} };
  for (const [clipe, membro, alvo] of lista) {
    if (!A.base.clips[clipe]) { saida.medidas[clipe + ":" + membro] = "sem clipe"; continue; }
    A.raiz.position.set(0, 0, 0); A.raiz.rotation.set(0, 0, 0); B.raiz.visible = false;
    A.mixer.stopAllAction(); A.acoes = {}; A.movendo.clear(); A.alinhando = null;   // cada clipe parte do zero
    A.estado("Guarda_Gingando", 0); A.update(0.05);
    const p0 = A.posMundo("pelvis").setY(0), fr = new THREE.Vector3(Math.sin(A.raiz.rotation.y), 0, Math.cos(A.raiz.rotation.y));
    A.umaVez(clipe, { fade: 0.14, volta: 0.35 });
    let melhor = { d: -9, t: 0 }, t = 0;
    for (let i = 0; i < 200; i++) {
      A.update(1 / 60); t += 1 / 60;
      const d = A.posMundo(membro).setY(0).sub(p0).dot(fr);
      if (d > melhor.d && t < A.dur(clipe)) melhor = { d, t };
    }
    saida.medidas[clipe + ":" + membro] = { membro, alvo, imp: +melhor.t.toFixed(2), alcance: +melhor.d.toFixed(2), dur: +A.dur(clipe).toFixed(2) };
    A.raiz.position.set(0, 0, 0); A.raiz.rotation.set(0, 0, 0);
  }
  l.destruir(); div.remove(); return saida;
}, JSON.parse(process.env.LISTA));
console.log(JSON.stringify(r, null, 1));
await browser.close();
