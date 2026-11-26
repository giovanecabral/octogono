/* Poses do 3D (2026-11-22): abre ferramentas/poses3d.html com a placa de vídeo, roda um cenário por vez (guarda,
   golpe no contato, reação, defesa, suspense da decisão, anúncio do vencedor, comemoração), congela os lutadores
   e fotografa de vários lados. Uma folha por cenário. Uso: node ferramentas/poses3d.mjs <pasta> [cenario,...]
   Cenários: guarda, golpe:<id do GOLPES>, reacao:<id>, defesa:<id>, suspense, anuncio, vitoria. */
import { spawn, spawnSync } from "node:child_process"; import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { fileURLToPath } from "node:url";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.resolve(process.argv[2] || "poses"); fs.mkdirSync(OUT, { recursive: true });
const CENARIOS = (process.argv[3] || "guarda,golpe:jab,golpe:direto,golpe:gancho,golpe:upper,golpe:chuteCabeca,reacao:direto,defesa:gancho,suspense,anuncio,vitoria").split(",");
const W = 640, H = 760, PORTA = Number(process.env.PORTA || 8892), BASE = `http://127.0.0.1:${PORTA}/`;
// porta ocupada: o servidor que responde seria de outra pasta (já fotografou o worktree no lugar da cópia de antes)
try { await fetch(BASE); console.error(`porta ${PORTA} ocupada por outro servidor; use PORTA=<outra>`); process.exit(2); } catch {}
const srv = spawn(process.execPath, [path.join(RAIZ, "ferramentas", "servidor-local.mjs"), String(PORTA)], { stdio: "ignore" });
for (let i = 0; i < 150; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await esperar(200); }
/* lados: a luta é no eixo x (A em -x olhando +x); o anúncio é de frente pra +z */
const LADOS = {
  luta: [["lado", 0], ["lado2", 180], ["costasA", -70], ["costasB", 70]],
  anuncio: [["frente", 0], ["direita", 70], ["costas", 180], ["esquerda", -55]],
};
const PCH = Number(process.env.PORTA_CHROME || 9383);   // outra porta: duas medições ao mesmo tempo
const ch = spawn(process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${PCH}`,
  `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), "poses-"))}`, "--hide-scrollbars", "--use-angle=metal", "--enable-gpu", "--no-first-run", "about:blank"], { stdio: "ignore" });
let ws = null; for (let i = 0; i < 100 && !ws; i++) { try { ws = (await (await fetch(`http://127.0.0.1:${PCH}/json/version`)).json()).webSocketDebuggerUrl; } catch {} if (!ws) await esperar(200); }
const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
let seq = 0; const pend = new Map(), erros = [];
sock.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const { ok, erro } = pend.get(d.id); pend.delete(d.id); d.error ? erro(new Error(d.error.message)) : ok(d.result); }
  else if (d.method === "Runtime.exceptionThrown") erros.push(JSON.stringify(d.params.exceptionDetails).slice(0, 300)); };
const enviar = (method, params = {}, sessionId) => new Promise((ok, erro) => { const id = ++seq; pend.set(id, { ok, erro }); sock.send(JSON.stringify({ id, method, params, sessionId })); });
try {
  for (const cen of CENARIOS) {
    // uma página por cenário: cada um começa do zero, com a mesma semente
    const { targetId } = await enviar("Target.createTarget", { url: "about:blank" });
    const { sessionId: S } = await enviar("Target.attachToTarget", { targetId, flatten: true });
    await enviar("Runtime.enable", {}, S);
    await enviar("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1.5, mobile: false }, S);
    await enviar("Page.navigate", { url: BASE + "ferramentas/poses3d.html" + (process.env.Q ? "?" + process.env.Q : "") }, S);
    const avaliar = async (e) => (await enviar("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }, S)).result.value;
    for (let i = 0; i < 300 && !(await avaliar("!!window.__pronto")); i++) await esperar(100);
    await avaliar(`window.__cenario(${JSON.stringify(cen)})`);
    await avaliar("window.__congelar(true)");
    if (process.env.MEDIR) console.log(cen, JSON.stringify(await avaliar("window.__medir()")));
    if (process.env.DOBRAS) console.log(cen, "dobras", JSON.stringify(await avaliar("window.__dobras()")), "tronco", await avaliar("window.__dobrasPesos().length"));
    // REGIAO=A,B,C: triângulos virados no ombro e no braço por grupo (e os saltos de peso com REGIAO_SALTOS=1)
    if (process.env.REGIAO) for (const q of process.env.REGIAO.split(",")) console.log(cen, "regiao", q, JSON.stringify(await avaliar(`window.__regiao(${JSON.stringify(q)})`)));
    if (process.env.DEFORM) for (const q of process.env.DEFORM.split(",")) console.log(cen, "deform", q, JSON.stringify(await avaliar(`window.__deform(${JSON.stringify(q)})`)));
    // CORRETIVO=<pasta>: grava a forma corretiva da pose (lado do cenário eleva:<g>:<l|r>) em <pasta>/<cenario>.json
    if (process.env.CORRETIVO) { const lado = cen.split(":")[2] || "l", c = await avaliar(`JSON.stringify(window.__corretivo(${JSON.stringify(lado)}, ${process.env.CORRETIVO_OPC || "{}"}))`);
      fs.mkdirSync(process.env.CORRETIVO, { recursive: true }); fs.writeFileSync(path.join(process.env.CORRETIVO, cen.replace(/[:]/g, "_") + ".json"), c);
      const o = JSON.parse(c); console.log(cen, "corretivo", o.idx.length, "vértices, máx", (o.max * 1000).toFixed(1), "mm"); }
    if (process.env.REGIAO_SALTOS) console.log(cen, "saltos", JSON.stringify(await avaliar("window.__saltos('A')")));
    if (process.env.ESPINHOS) for (const l of await avaliar(`window.__espinhos(${JSON.stringify(process.env.ESPINHOS)})`)) console.log(cen, JSON.stringify(l));
    if (process.env.AVAL) console.log(cen, "aval", JSON.stringify(await avaliar(process.env.AVAL)));
    if (process.env.DOBRAS === "pesos") for (const l of await avaliar("window.__dobrasPesos()")) console.log(JSON.stringify(l));
    if (process.env.RELEVO) { await avaliar(`window.__pintarRelevo(${JSON.stringify(process.env.RELEVO)})`); for (let i = 0; i < 3; i++) await avaliar("new Promise(r => requestAnimationFrame(r))"); }   // RELEVO=A: pele pintada pelo relevo
    if (process.env.DOBRAS === "ver") { await avaliar("window.__marcarDobras()"); for (let i = 0; i < 3; i++) await avaliar("new Promise(r => requestAnimationFrame(r))"); }
    const anuncio = ["suspense", "anuncio", "vitoria"].includes(cen) || cen.startsWith("pose:") || cen.startsWith("ergue:") || cen.startsWith("eleva:") || cen === "rest";
    // FOCO=A e DIST=1.6: close de um lutador só (ombro, axila, cotovelo no golpe)
    const centro = await avaliar(`window.__centro(${JSON.stringify(process.env.FOCO || (cen.startsWith("pose:") || cen.startsWith("ergue:") || cen.startsWith("eleva:") || cen === "rest" ? "A" : anuncio ? "ABC" : "AB"))})`);
    if (process.env.CY) centro[1] += Number(process.env.CY);   // CY=0.45: sobe o centro (close da cabeça)
    const nome = cen.replace(/[:]/g, "_");
    if (process.env.MEDIR === "so" || process.env.SEMFOTO) { await enviar("Target.closeTarget", { targetId }); continue; }
    for (const [lado, ang] of LADOS[anuncio ? "anuncio" : "luta"]) {
      await avaliar(`window.__camera(${JSON.stringify({ centro, ang, dist: process.env.DIST ? Number(process.env.DIST) : cen.startsWith("ergue:") || cen === "rest" ? 1.5 : cen.startsWith("pose:") ? 2.6 : anuncio ? 4.2 : 3.4, alt: process.env.ALT ? Number(process.env.ALT) : anuncio ? 1.4 : 1.3 })})`);
      const { data } = await enviar("Page.captureScreenshot", { format: "jpeg", quality: 90 }, S);
      fs.writeFileSync(path.join(OUT, `${nome}__${lado}.jpg`), Buffer.from(data, "base64"));
    }
    await enviar("Target.closeTarget", { targetId });
    spawnSync("/opt/homebrew/bin/ffmpeg", ["-y", "-loglevel", "error", "-pattern_type", "glob", "-i", path.join(OUT, `${nome}__*.jpg`), "-vf", "scale=480:-1,tile=4x1", "-frames:v", "1", path.join(OUT, `folha_${nome}.jpg`)]);
    console.log(cen, "ok");
  }
  console.log("erros:", erros.length ? erros.join(" | ") : "nenhum");
} finally { try { sock.close(); } catch {} ch.kill(); srv.kill(); }
