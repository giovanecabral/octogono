/* Luta inteira do Online contra bot, com o 3D em tela cheia, num Chrome de
   verdade (com a placa de vídeo) e sem tocar em produção: servidor local
   (ferramentas/servidor-local.mjs, PGlite), conta Pro de teste, bots ligados.
   Joga uma carta quando a mão aparece e confere o que o dono pediu em
   2026-11-10: as cartas somem enquanto a troca passa no 3D, Só as cartas
   troca de tela e volta, o histórico abre, e a cena do fim só aparece
   depois do anúncio do árbitro. Fotos na pasta de saída.

   Uso (puppeteer-core numa pasta qualquer, como em ferramentas/jxj-e2e.mjs):
     cd <pasta com puppeteer-core>
     node <repo>/ferramentas/online-3d-e2e.mjs <pasta das fotos> [cel] */
import { createRequire } from "node:module"; import { spawn } from "node:child_process"; import path from "node:path"; import fs from "node:fs"; import { fileURLToPath } from "node:url";
const require = createRequire(path.join(process.cwd(), "x.js")); const puppeteer = require("puppeteer-core");
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), PORTA = Number(process.env.PORTA || 8792), BASE = `http://127.0.0.1:${PORTA}/`;
const OUT = path.resolve(process.argv[2] || "online-3d"); fs.mkdirSync(OUT, { recursive: true });
const VP = process.argv[3] === "cel" ? { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { width: 1360, height: 860 };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join(RAIZ, "ferramentas", "servidor-local.mjs"), String(PORTA)], { stdio: "ignore" });
const post = async (rota, corpo) => (await fetch(BASE + rota, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })).json();
for (let i = 0; i < 150; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await esperar(200); }
const erros = [], log = [];
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--hide-scrollbars", "--use-angle=metal", "--enable-gpu"] });
try {
  const bots = (await post("teste/usuario", { pro: false })).id;
  await post("teste/sql", { sql: "select public.jxj_bot_configurar($1) as r", params: [bots.slice(0, 8) + "@teste"] });
  const uid = (await post("teste/usuario", { pro: true })).id;
  const p = await b.newPage(); await p.setViewport(VP);
  p.on("pageerror", (e) => erros.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/supabase|ERR_|favicon|Failed to load/i.test(m.text())) erros.push(m.text().slice(0, 200)); });
  await p.setRequestInterception(true);
  p.on("request", (r) => (/supabase\.co|octogono\.fun\/api|draft-ufc\.vercel\.app|vercel/.test(r.url()) ? r.abort() : r.continue()));
  await p.evaluateOnNewDocument(() => { localStorage.setItem("tutorial:draft", "1"); localStorage.setItem("tutorial:luta", "1"); localStorage.setItem("jxj:treino", "1"); localStorage.setItem("luta:3d", "1"); });
  await p.goto(BASE + "#/menu", { waitUntil: "networkidle0" });
  const lid = await p.evaluate(async (uid) => {
    meuAccessToken = async () => "tok:" + uid;
    sessaoAtual = async () => { USUARIO_ID = uid; return { user: { id: uid, email: uid.slice(0, 6) + "@teste" }, access_token: "tok:" + uid }; };
    atualizarStatusPro = async () => { meuPro = true; }; if (typeof reconferirPro === "function") reconferirPro = async () => true; meuPro = true;
    await jxj("criar", { nome: "Kayo Brasa", estilo: "striker", categoria: "lightweight", rosto: { ...cfgPadrao(), cabelo: 2, barba: 4, entrada: 2 } });
    const l = (await jxj("estado")).lutadores[0];
    await jxj("filaEntrar", { lutadorId: l.id });
    const bt = await jxj("bot", { lutadorId: l.id });
    return bt.luta || bt.id;
  }, uid);
  await p.evaluate((h) => { location.hash = h; }, "#/jxj/luta/" + lid);
  await esperar(5000);
  const t0 = Date.now(); let n = 0, fotos = 0, viuEscondida = 0, alternou = false, gaveta = false;
  while (Date.now() - t0 < 400000) {
    const st = await p.evaluate(() => {
      const cb = document.getElementById("jxj-combate");
      return { fim: !!document.querySelector(".jxj-fim"), res: !!document.querySelector(".jxj-resultado"), assist: !!(cb && cb.classList.contains("assistindo")), tela: !!(cb && cb.classList.contains("tela-cheia")),
        cartas: document.querySelectorAll(".jxj-postura:not([disabled]),.jxj-acao:not([disabled])").length, rodada: (document.querySelector(".jxj-round") || {}).textContent, pend: JXJ_3D ? JXJ_3D.pendentes : -1 };
    });
    if (st.res) { log.push("resultado"); break; }
    if (st.fim) { await esperar(800); await p.screenshot({ path: path.join(OUT, "fim-cena.png") }); log.push("cena do fim"); await p.evaluate(() => { const x = document.querySelector(".jxj-fim-seguir"); x && x.click(); }); await esperar(2500); await p.screenshot({ path: path.join(OUT, "fim-resultado.png") }); break; }
    if (st.assist) viuEscondida++;
    if (st.assist && st.pend > 0 && fotos < 30 && n > 14) { await p.screenshot({ path: path.join(OUT, `fim3d-${String(fotos++).padStart(2, "0")}.png`) }); }
    if (!st.assist && st.cartas) {
      if (n === 4 && !alternou) {
        alternou = true;
        await p.evaluate(() => document.getElementById("jxj3dBotao").click()); await esperar(900);
        await p.screenshot({ path: path.join(OUT, "so-cartas.png") });
        log.push("só cartas: tela-cheia=" + (await p.evaluate(() => document.getElementById("jxj-combate").classList.contains("tela-cheia"))));
        await p.evaluate(() => document.getElementById("jxj3dBotao").click()); await esperar(2500);
        log.push("3D de volta: tela-cheia=" + (await p.evaluate(() => document.getElementById("jxj-combate").classList.contains("tela-cheia"))));
      }
      if (n === 6 && !gaveta) { gaveta = true; await p.evaluate(() => { const s = document.querySelector(".jxj-tarja .jxj-gaveta summary"); s && s.click(); }); await esperar(500); await p.screenshot({ path: path.join(OUT, "gaveta.png") }); await p.evaluate(() => { const s = document.querySelector(".jxj-tarja .jxj-gaveta summary"); s && s.click(); }); }
      await p.evaluate((k) => { const bs = [...document.querySelectorAll(".jxj-postura:not([disabled]), .jxj-acao:not([disabled])")]; if (bs.length) bs[k % bs.length].click(); }, n);
      n++;
      await esperar(700);
    } else await esperar(400);
  }
  log.push(`cliques ${n}, consultas com as cartas escondidas ${viuEscondida}, fotos do 3D no fim ${fotos}`);
} catch (e) { log.push("FALHA " + e.message); }
finally {
  const ok = !erros.length && log.includes("cena do fim") && log.includes("só cartas: tela-cheia=false") && log.includes("3D de volta: tela-cheia=true") && !log.some((l) => / escondidas 0,/.test(l));
  console.log(log.join("\n")); console.log(erros.length ? "ERROS " + erros.slice(0, 6).join(" | ") : "sem erro"); console.log(ok ? "ok" : "REPROVOU");
  await b.close(); srv.kill(); process.exit(ok ? 0 : 1);
}
