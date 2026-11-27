/* Visual da luta em 3D (2026-11-26): fotos dos 4 momentos (guarda, impacto do jab, anúncio, nocaute) e o tempo de
   quadro de cada modo de qualidade, no Chrome com a placa de vídeo. Abre ferramentas/visual3d.html.
   Uso: node ferramentas/visual3d.mjs fotos <pasta> [modo]      (modo: auto, baixa, media, alta; padrão alta)
        node ferramentas/visual3d.mjs custo [modo ...]           (sem o limite de 60 quadros; padrão baixa media alta)
   AJUSTE='{"pos":{"bloom":{"escala":0.25}}}' muda o visual.config.js só na medida; VOLTAS (padrão 2) repete.
   W, H e DSF mudam a tela (padrão 1280 x 720, DSF 2: a resolução de um notebook com tela de retina).
   Pra comparar com o código de antes: copie os dois arquivos (visual3d.mjs e .html) pra uma cópia antiga do jogo e
   rode lá (o código antigo não lê o modo, e o resultado sai como "antes"). */
import { spawn, spawnSync } from "node:child_process"; import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { fileURLToPath } from "node:url";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [acao = "custo", ...resto] = process.argv.slice(2);
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720), DSF = Number(process.env.DSF || 2);
const PORTA = 8893, BASE = `http://127.0.0.1:${PORTA}/`;
const srv = spawn(process.execPath, [path.join(RAIZ, "ferramentas", "servidor-local.mjs"), String(PORTA)], { stdio: "ignore" });
for (let i = 0; i < 150; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await esperar(200); }

async function rodada(modo, fotos, pasta) {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "visual3d-")), portaCh = 9400 + Math.floor(Math.random() * 500);   // porta nova: o Chrome da rodada anterior ainda pode estar fechando
  const ch = spawn(process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${portaCh}`,
    `--user-data-dir=${perfil}`, "--hide-scrollbars", "--use-angle=metal", "--enable-gpu", "--no-first-run",
    ...(fotos ? [] : ["--disable-gpu-vsync", "--disable-frame-rate-limit"]), "about:blank"], { stdio: "ignore" });
  let ws = null; for (let i = 0; i < 100 && !ws; i++) { try { ws = (await (await fetch(`http://127.0.0.1:${portaCh}/json/version`)).json()).webSocketDebuggerUrl; } catch {} if (!ws) await esperar(200); }
  const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
  let seq = 0; const pend = new Map(), erros = [];
  sock.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const { ok, erro } = pend.get(d.id); pend.delete(d.id); d.error ? erro(new Error(d.error.message)) : ok(d.result); }
    else if (d.method === "Runtime.exceptionThrown") erros.push(JSON.stringify(d.params.exceptionDetails).slice(0, 300));
    else if (d.method === "Runtime.consoleAPICalled" && /warning|error/.test(d.params.type)) erros.push(d.params.args.map((a) => a.value || a.description).join(" ").slice(0, 200)); };
  const enviar = (method, params = {}, sessionId) => new Promise((ok, erro) => { const id = ++seq; pend.set(id, { ok, erro }); sock.send(JSON.stringify({ id, method, params, sessionId })); });
  try {
    const { targetId } = await enviar("Target.createTarget", { url: "about:blank" });
    const { sessionId: S } = await enviar("Target.attachToTarget", { targetId, flatten: true });
    await enviar("Runtime.enable", {}, S); await enviar("Page.enable", {}, S);
    await enviar("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DSF, mobile: W < 700 }, S);
    await enviar("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem("luta3d:qualidade",${JSON.stringify(modo)})` }, S);
    await enviar("Page.navigate", { url: BASE + "ferramentas/visual3d.html" + (fotos ? "?fotos=1" : "?custo=1") + (process.env.AJUSTE ? "&ajuste=" + encodeURIComponent(process.env.AJUSTE) : "") }, S);
    const avaliar = async (e) => (await enviar("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }, S)).result.value;
    const t0 = Date.now();
    while (!(await avaliar("!!window.__fim")) && Date.now() - t0 < 120000) {
      const nome = fotos && (await avaliar("window.__congelado && window.__foto"));
      if (nome) {
        await esperar(150);
        const { data } = await enviar("Page.captureScreenshot", { format: "jpeg", quality: 90 }, S);
        fs.writeFileSync(path.join(pasta, `${nome}.jpg`), Buffer.from(data, "base64"));
        await avaliar("window.__soltar()");
      }
      await esperar(fotos ? 20 : 300);
    }
    return { custo: await avaliar("window.__custo"), erros };
  } finally {
    // o Chrome que fica aberto segue usando a placa e deixa a rodada seguinte mais lenta (medido: +2 ms por quadro)
    try { sock.close(); } catch {}
    const saiu = new Promise((r) => ch.once("exit", r)); ch.kill(); await Promise.race([saiu, esperar(3000)]);
    if (ch.exitCode === null && ch.signalCode === null) { ch.kill("SIGKILL"); await saiu; }
    spawnSync("pkill", ["-f", perfil]); await esperar(500);
  }
}

try {
  if (acao === "fotos") {
    const pasta = path.resolve(resto[0] || "visual3d"); fs.mkdirSync(pasta, { recursive: true });
    const r = await rodada(resto[1] || "alta", true, pasta);
    console.log(`fotos em ${pasta}; modo ${r.custo && r.custo.modo}; hdri ${r.custo && r.custo.hdri}; erros: ${r.erros.length ? r.erros.join(" | ") : "nenhum"}`);
  } else {
    // duas voltas alternando os modos (a placa esquenta e o tempo muda com a ordem)
    for (let volta = 0; volta < Number(process.env.VOLTAS || 2); volta++) for (const modo of resto.length ? resto : ["baixa", "media", "alta"]) {
      const r = await rodada(modo, false);
      console.log(JSON.stringify({ pedido: modo, volta, ...r.custo, tela: `${W}x${H}@${DSF}`, erros: r.erros.length ? r.erros : undefined }));
    }
  }
} finally { srv.kill(); }
