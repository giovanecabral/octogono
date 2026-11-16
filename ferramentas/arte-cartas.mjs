/* Arte das cartas do combate v2 (2026-11-15): uma foto por carta, do próprio 3D da luta.
   O diretor (luta3d/diretor.js) toca o lance da carta (luta3d/lances-cartas.js) num relógio
   virtual, quadro a quadro, e a foto sai no instante marcado, com fundo, contraluz e calção
   na cor da raridade. Salva img/cartas/<id>.webp (512 x 640, webp 80) e, no fim, uma prancha
   com todas no tamanho da carta na mão (116 px), pra conferir.

   Chrome do sistema pelo protocolo de depuração, com a placa de vídeo (--use-angle=metal
   --enable-gpu; sem ela o WebGL cai no SwiftShader e a sombra some). Servidor estático
   próprio (sem banco). Os clipes vêm do luta3d/mx_lutas.glb (fora do git) e, quando existir,
   do luta3d/mx_cartas.glb (rodar de novo no fim, com os lances novos).

   Uso: node ferramentas/arte-cartas.mjs [pasta da prancha] [id,id,...] */
import http from "node:http"; import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { spawn } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRANCHA = path.resolve(process.argv[2] || path.join(os.tmpdir(), "arte-cartas"));
const SO = process.argv[3] ? process.argv[3].split(",") : null;
const PORTA = Number(process.env.PORTA || 8871), BASE = `http://127.0.0.1:${PORTA}/`;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(PRANCHA, { recursive: true });
fs.mkdirSync(path.join(RAIZ, "img", "cartas"), { recursive: true });

/* raridade: a do catálogo (api/_jxj-cartas.js) quando a carta já tem; senão, a do plano (Tarefa 8):
   andar 1 e 2 do ramo rara, 3 épica, 4 lendária; as comuns e as do chão, comum */
const RARIDADE_PLANO = {
  direto: "rara", combinacao: "rara", contragolpe: "epica", overhand: "lendaria", chute_perna: "rara", chute_corpo: "rara", chute_frontal: "epica", chute_rodado: "lendaria",
  passo_lateral: "rara", joelhada: "rara", cotovelada: "epica", superman: "lendaria", single_leg: "rara", double_leg: "rara", queda_contragolpe: "epica", suplex: "lendaria",
  peso_ombro: "rara", cotovelada_cima: "rara", passagem_joelho: "epica", martelada: "lendaria", sprawl: "rara", levantada_tecnica: "rara", contra_queda: "epica", bodylock: "lendaria",
  kimura: "rara", rasteira: "rara", triangulo: "epica", mata_leao: "lendaria", cem_quilos: "rara", passagem_guarda: "rara", guarda_fechada: "epica", raspagem_gancho: "lendaria",
  defesa_finalizacao: "rara", fuga_quadril: "rara", recomposicao: "epica", berimbolo: "lendaria", esquiva: "rara", leitura_queda: "rara", contra_esquerda: "epica", leitura_total: "lendaria",
  pendulo: "rara", guarda_alta: "rara", saida_lado: "epica", segundo_folego: "lendaria", contra_corpo: "rara", cruzado_contra: "rara", uppercut: "epica", misericordia: "lendaria",
};
const C = await import(pathToFileURL(path.join(RAIZ, "api", "_jxj-cartas.js")).href);
const raridadeDe = (id) => (C.CARTAS[id] && C.CARTAS[id].raridade) || RARIDADE_PLANO[id] || "comum";

/* servidor estático só pra esta ferramenta */
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".glb": "model/gltf-binary", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".css": "text/css" };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, BASE);
  const arq = path.normalize(path.join(RAIZ, decodeURIComponent(u.pathname)));
  if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end("404"); }
  res.writeHead(200, { "Content-Type": TIPOS[path.extname(arq)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(arq).pipe(res);
}).listen(PORTA, "127.0.0.1");

/* o Chrome pelo protocolo de depuração (como ferramentas/online-v2-e2e.mjs) */
async function chrome(porta = 9361) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arte-cartas-"));
  const ch = spawn(process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${porta}`, `--user-data-dir=${dir}`,
    "--hide-scrollbars", "--use-angle=metal", "--enable-gpu", "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
  let ws = null;
  for (let i = 0; i < 100 && !ws; i++) { try { ws = (await (await fetch(`http://127.0.0.1:${porta}/json/version`)).json()).webSocketDebuggerUrl; } catch {} if (!ws) await esperar(200); }
  const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
  let seq = 0; const pend = new Map(), erros = [];
  sock.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { const { ok, erro } = pend.get(d.id); pend.delete(d.id); d.error ? erro(new Error(d.error.message)) : ok(d.result); }
    else if (d.method === "Runtime.exceptionThrown") erros.push(String(d.params.exceptionDetails.exception ? d.params.exceptionDetails.exception.description : d.params.exceptionDetails.text).slice(0, 300));
  };
  const enviar = (method, params = {}, sessionId) => new Promise((ok, erro) => { const id = ++seq; pend.set(id, { ok, erro }); sock.send(JSON.stringify({ id, method, params, sessionId })); });
  const { targetId } = await enviar("Target.createTarget", { url: "about:blank" });
  const { sessionId: s } = await enviar("Target.attachToTarget", { targetId, flatten: true });
  await enviar("Page.enable", {}, s); await enviar("Runtime.enable", {}, s);
  await enviar("Emulation.setDeviceMetricsOverride", { width: 1024, height: 1280, deviceScaleFactor: 1, mobile: false }, s);
  const avaliar = async (expr) => {
    const r = await enviar("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, s);
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
    return r.result.value;
  };
  return { enviar, avaliar, erros, s, fechar: () => { try { sock.close(); } catch {} ch.kill(); } };
}

let B = null;
try {
  B = await chrome();
  await B.enviar("Page.navigate", { url: BASE + "ferramentas/arte-cartas.html" }, B.s);
  for (let i = 0; i < 150; i++) { if (await B.avaliar("!!window.ARTE_PRONTA").catch(() => false)) break; await esperar(200); }
  if (!(await B.avaliar("!!window.ARTE_PRONTA"))) throw new Error("a página não abriu: " + B.erros.join(" | "));
  const ids = (await B.avaliar("ARTE.ids")).filter((id) => !SO || SO.includes(id));
  let total = 0, placa = "";
  for (const id of ids) {
    const r = await B.avaliar(`ARTE.foto(${JSON.stringify(id)}, ${JSON.stringify(raridadeDe(id))}, 7)`);
    const b = Buffer.from(r.url.split(",")[1], "base64");
    fs.writeFileSync(path.join(RAIZ, "img", "cartas", id + ".webp"), b);
    total += b.length; placa = r.placa;
    console.log(`${id.padEnd(20)} ${raridadeDe(id).padEnd(9)} ${String(Math.round(b.length / 1024)).padStart(3)} KB  semente ${r.semente}`);
  }
  console.log(`${ids.length} cartas, ${Math.round(total / 1024)} KB. Placa: ${placa}`);
  if (/swiftshader|llvmpipe|software/i.test(placa)) console.log("AVISO: sem a placa de vídeo (sombra e qualidade menores)");
  const todas = await B.avaliar("ARTE.ids");
  const png = await B.avaliar(`ARTE.prancha(${JSON.stringify(todas.filter((id) => fs.existsSync(path.join(RAIZ, "img", "cartas", id + ".webp"))))}, ${JSON.stringify(BASE)})`);
  fs.writeFileSync(path.join(PRANCHA, "prancha.png"), Buffer.from(png.split(",")[1], "base64"));
  console.log("prancha: " + path.join(PRANCHA, "prancha.png"));
  if (B.erros.length) console.log("erros na página: " + B.erros.slice(0, 5).join(" | "));
} finally {
  if (B) B.fechar();
  srv.close();
}
