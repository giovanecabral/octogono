/* Bancada do 3D (2026-11-19): abre ferramentas/bancada3d.html no Chrome com a placa de vídeo, deixa a sequência
   de lances rodar e tira uma foto a cada PASSO segundos (e a folha com todas). Pra comparar luz, material e
   câmera antes e depois. Uso: [W=1080 H=1920 DSF=1 PASSO=0.6 MAX=1] node ferramentas/bancada3d.mjs <pasta>
   SEMTETO=1 tira o limite de 60 quadros (pra medir o custo). MAX=1 liga luta3d:max (resolução cheia e antialias, o modo da gravação dos anúncios). */
import { spawn, spawnSync } from "node:child_process"; import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { fileURLToPath } from "node:url";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.resolve(process.argv[2] || "bancada"); fs.mkdirSync(OUT, { recursive: true });
const W = Number(process.env.W || 540), H = Number(process.env.H || 960), DSF = Number(process.env.DSF || 2), PASSO = Number(process.env.PASSO || 0.6);
const PORTA = 8891, BASE = `http://127.0.0.1:${PORTA}/`;
const srv = spawn(process.execPath, [path.join(RAIZ, "ferramentas", "servidor-local.mjs"), String(PORTA)], { stdio: "ignore" });
for (let i = 0; i < 150; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await esperar(200); }
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "bancada-")), portaCh = 9381;
const ch = spawn(process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${portaCh}`, `--user-data-dir=${perfil}`,
  "--hide-scrollbars", "--use-angle=metal", "--enable-gpu", "--no-first-run", ...(process.env.SEMTETO === "1" ? ["--disable-gpu-vsync", "--disable-frame-rate-limit"] : []), "about:blank"], { stdio: "ignore" });
let ws = null; for (let i = 0; i < 100 && !ws; i++) { try { ws = (await (await fetch(`http://127.0.0.1:${portaCh}/json/version`)).json()).webSocketDebuggerUrl; } catch {} if (!ws) await esperar(200); }
const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
let seq = 0; const pend = new Map(), erros = [];
sock.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const { ok, erro } = pend.get(d.id); pend.delete(d.id); d.error ? erro(new Error(d.error.message)) : ok(d.result); }
  else if (d.method === "Runtime.exceptionThrown") erros.push(JSON.stringify(d.params.exceptionDetails).slice(0, 300)); };
const enviar = (method, params = {}, sessionId) => new Promise((ok, erro) => { const id = ++seq; pend.set(id, { ok, erro }); sock.send(JSON.stringify({ id, method, params, sessionId })); });
try {
  const { targetId } = await enviar("Target.createTarget", { url: "about:blank" });
  const { sessionId: S } = await enviar("Target.attachToTarget", { targetId, flatten: true });
  await enviar("Runtime.enable", {}, S);
  await enviar("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DSF, mobile: W < 700 }, S);
  if (process.env.MAX === "1") await enviar("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem("luta3d:max","1")` }, S);
  await enviar("Page.navigate", { url: BASE + "ferramentas/bancada3d.html" }, S);
  const avaliar = async (e) => (await enviar("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }, S)).result.value;
  for (let i = 0; i < 300 && !(await avaliar("!!window.__pronto")); i++) await esperar(100);
  let n = 0; const t0 = Date.now();
  while (!(await avaliar("!!window.__fim")) && Date.now() - t0 < 60000) {
    const { data } = await enviar("Page.captureScreenshot", { format: "jpeg", quality: 92 }, S);
    fs.writeFileSync(path.join(OUT, `f${String(n++).padStart(3, "0")}.jpg`), Buffer.from(data, "base64"));
    await esperar(PASSO * 1000);
  }
  const fps = await avaliar(`(()=>new Promise(r=>{let n=0;const t=performance.now();const f=()=>{n++;if(performance.now()-t<2000)requestAnimationFrame(f);else r(n/2)};requestAnimationFrame(f)}))()`);
  console.log(`${fps} quadros/s no fim; ${n} fotos em ${OUT}; erros: ${erros.length ? erros.join(" | ") : "nenhum"}`);
} finally { try { sock.close(); } catch {} ch.kill(); srv.kill(); }
spawnSync("/opt/homebrew/bin/ffmpeg", ["-y", "-loglevel", "error", "-pattern_type", "glob", "-i", path.join(OUT, "f*.jpg"), "-vf", "scale=270:-1,tile=8x3", "-frames:v", "1", path.join(OUT, "folha.jpg")]);
