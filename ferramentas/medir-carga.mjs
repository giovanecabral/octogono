/* Quanto demora e quanto baixa (2026-11-19, lançamento do Online de cartas pra todos): num Chrome de
   verdade, celular (390 x 844, toque), CPU 4x mais lenta e rede 4G lenta (a "Slow 4G" do Lighthouse:
   562,5 ms de latência, 1,44 Mbit/s de descida, 675 kbit/s de subida), cache vazio. Servidor local
   (ferramentas/servidor-local.mjs, PGlite) com o combate de cartas ligado pra todos.

   Mede: (1) a primeira tela (o menu): primeira pintura, o menu desenhado e o load; (2) da luta contra
   bot aberta pelo endereço até o 3D montado (o diretor carregado, os bonecos e as animações prontos);
   (3) o total baixado em cada parte, pelo que passou na rede (encodedDataLength) e, como o servidor
   local não comprime, quanto o texto (html, js, css, json, svg) daria com gzip, perto do que a Vercel
   manda (ela usa brotli, um pouco menor).

   Supabase, a API de produção e a Vercel ficam bloqueados; a biblioteca do Supabase (jsdelivr) e as
   fontes do Google vêm da internet, como no site. Uso: [PORTA=8871] node ferramentas/medir-carga.mjs */
import { spawn } from "node:child_process"; import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import zlib from "node:zlib"; import { fileURLToPath } from "node:url";
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), PORTA = Number(process.env.PORTA || 8871), BASE = `http://127.0.0.1:${PORTA}/`;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
/* GZIP=0 mede sem compressão (o servidor local de sempre); o padrão comprime o texto, como a Vercel */
const srv = spawn(process.execPath, [path.join(RAIZ, "ferramentas", "servidor-local.mjs"), String(PORTA)], { stdio: "ignore", env: { ...process.env, GZIP: process.env.GZIP === "0" ? "0" : "1" } });
const post = async (rota, corpo) => (await fetch(BASE + rota, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })).json();
for (let i = 0; i < 150; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await esperar(200); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "medir-carga-"));
const ch = spawn(process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--remote-debugging-port=9371", `--user-data-dir=${dir}`,
  "--hide-scrollbars", "--use-angle=metal", "--enable-gpu", "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
let ws = null;
for (let i = 0; i < 100 && !ws; i++) { try { ws = (await (await fetch("http://127.0.0.1:9371/json/version")).json()).webSocketDebuggerUrl; } catch {} if (!ws) await esperar(200); }
const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
let seq = 0; const pend = new Map(), ouvintes = [];
sock.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const { ok, erro } = pend.get(d.id); pend.delete(d.id); d.error ? erro(new Error(d.error.message)) : ok(d.result); } else ouvintes.forEach((f) => f(d)); };
const enviar = (method, params = {}, sessionId) => new Promise((ok, erro) => { const id = ++seq; pend.set(id, { ok, erro }); sock.send(JSON.stringify({ id, method, params, sessionId })); });

const { targetId } = await enviar("Target.createTarget", { url: "about:blank" });
const { sessionId: s } = await enviar("Target.attachToTarget", { targetId, flatten: true });
const req = new Map(); let parte = "menu";
ouvintes.push((d) => {
  if (d.sessionId !== s) return;
  if (d.method === "Fetch.requestPaused") enviar("Fetch.failRequest", { requestId: d.params.requestId, errorReason: "BlockedByClient" }, s).catch(() => {});
  if (d.method === "Network.responseReceived") { const r = req.get(d.params.requestId) || {}; Object.assign(r, { url: d.params.response.url, tipo: d.params.response.mimeType, parte: r.parte || parte }); req.set(d.params.requestId, r); }
  if (d.method === "Network.requestWillBeSent" && !req.has(d.params.requestId)) req.set(d.params.requestId, { url: d.params.request.url, parte });
  if (d.method === "Network.loadingFinished") { const r = req.get(d.params.requestId) || { parte }; r.bytes = d.params.encodedDataLength; req.set(d.params.requestId, r); }
});
await enviar("Page.enable", {}, s); await enviar("Runtime.enable", {}, s); await enviar("Network.enable", {}, s);
await enviar("Network.setCacheDisabled", { cacheDisabled: false }, s);
await enviar("Fetch.enable", { patterns: ["*supabase.co*", "*octogono.fun/api*", "*draft-ufc.vercel.app*", "*vercel*"].map((u) => ({ urlPattern: u })) }, s);
await enviar("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, s);
await enviar("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, s);
await enviar("Emulation.setCPUThrottlingRate", { rate: 4 }, s);
await enviar("Network.emulateNetworkConditions", { offline: false, latency: 562.5, downloadThroughput: Math.round(1474.56 * 1024 / 8), uploadThroughput: Math.round(675 * 1024 / 8) }, s);
await enviar("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem("tutorial:draft","1");localStorage.setItem("tutorial:luta","1");localStorage.setItem("jxj:treino","1");localStorage.setItem("jxj:treino2","1");localStorage.setItem("luta:3d","1");` }, s);
const avaliar = async (fn, ...args) => {
  const r = await enviar("Runtime.evaluate", { expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true }, s);
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
  return r.result.value;
};
const ate = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await avaliar(fn).catch(() => false)) return Date.now() - t0; await esperar(100); } return null; };

const out = {};
try {
  await post("teste/sql", { sql: "update jxj_config set valor = 'true'::jsonb where chave = 'combate_v2'" });
  const contaBots = (await post("teste/usuario", { pro: false })).id;
  await post("teste/sql", { sql: "select public.jxj_bot_configurar($1) as r", params: [contaBots.slice(0, 8) + "@teste"] });
  /* (1) a primeira tela */
  const t0 = Date.now();
  await enviar("Page.navigate", { url: BASE + "#/menu" }, s);
  const menu = await ate(() => !!document.querySelector(".menu-card"), 120000);
  out.menuDesenhadoMs = menu == null ? null : Date.now() - t0;
  await ate(() => document.readyState === "complete", 120000);
  await esperar(1500);
  Object.assign(out, await avaliar(() => { const n = performance.getEntriesByType("navigation")[0], p = performance.getEntriesByName("first-contentful-paint")[0];
    return { primeiraPinturaMs: p ? Math.round(p.startTime) : null, domProntoMs: Math.round(n.domContentLoadedEventEnd), loadMs: Math.round(n.loadEventEnd) }; }));
  /* (2) a luta contra bot aberta pelo endereço até o 3D montado */
  parte = "luta3d";
  const uid = (await post("teste/usuario", { pro: true })).id;
  const lutaId = await avaliar(async (uid) => {
    meuAccessToken = async () => "tok:" + uid;
    sessaoAtual = async () => { USUARIO_ID = uid; return { user: { id: uid, email: uid.slice(0, 6) + "@teste" }, access_token: "tok:" + uid }; };
    atualizarStatusPro = async () => { meuPro = true; }; if (typeof reconferirPro === "function") reconferirPro = async () => true; meuPro = true;
    const r = await jxj("criar", { nome: "Kayo Brasa", estilo: "striker", categoria: "lightweight", rosto: { ...cfgPadrao(), cabelo: 2, barba: 3 } });
    await jxj("filaEntrar", { lutadorId: r.id });
    return (await jxj("bot", { lutadorId: r.id })).luta;
  }, uid);
  const t1 = Date.now();
  await avaliar((id) => { location.hash = "#/jxj/luta/" + id; }, lutaId);
  const cartas = await ate(() => !!document.querySelector(".jxj-combate.v2 .jxj-na-mao"), 120000);
  out.lutaCartasMs = cartas;
  const pronto = await ate(() => typeof JXJ_3D !== "undefined" && !!JXJ_3D && !!JXJ_3D.inst && !document.querySelector(".luta3d-carregando"), 180000);
  out.luta3dProntoMs = pronto == null ? null : Date.now() - t1;
  /* o que o 3D ainda baixa depois de montado (as animações das cartas chegam na primeira troca) */
  await esperar(8000);
  /* (3) o total baixado, por parte */
  const TEXTO = /html|javascript|css|json|svg|text\//;
  const soma = {};
  for (const r of req.values()) {
    if (!r.url || r.bytes == null) continue;
    const p = soma[r.parte] || (soma[r.parte] = { arquivos: 0, bytes: 0, gzip: 0, maiores: [] });
    p.arquivos++; p.bytes += r.bytes;
    let gz = r.bytes;
    if (r.url.startsWith(BASE) && TEXTO.test(r.tipo || "")) {
      const arq = path.join(RAIZ, decodeURIComponent(new URL(r.url).pathname === "/" ? "/index.html" : new URL(r.url).pathname));
      if (fs.existsSync(arq) && fs.statSync(arq).isFile()) gz = zlib.gzipSync(fs.readFileSync(arq), { level: 9 }).length;
    }
    p.gzip += gz; p.maiores.push([Math.round(r.bytes / 1024), Math.round(gz / 1024), r.url.replace(BASE, "").slice(0, 70)]);
  }
  for (const p of Object.values(soma)) { p.kb = Math.round(p.bytes / 1024); p.kbGzip = Math.round(p.gzip / 1024); p.maiores = p.maiores.sort((a, b) => b[0] - a[0]).slice(0, 10).map(([k, g, u]) => `${u}: ${k} KB${g !== k ? ` (gzip ${g})` : ""}`); delete p.bytes; delete p.gzip; }
  out.baixado = soma;
  console.log(JSON.stringify(out, null, 1));
} catch (e) { console.log(JSON.stringify(out)); console.log("FALHA " + (e && e.stack || e)); process.exitCode = 1; }
finally { try { sock.close(); } catch {} ch.kill(); srv.kill(); setTimeout(() => process.exit(process.exitCode || 0), 300); }
