/* Abre uma janela do Chrome (com a tela, não sem cabeça) em octogono.fun pra o dono entrar na conta com as
   próprias mãos (ninguém digita senha por ele), espera a sessão do Supabase aparecer e grava só o access_token
   num arquivo (vale cerca de 1 hora). Usado pelo gravar-carreira.mjs (TOKEN_ARQ) pra coletiva com a IA de
   verdade. Uso: node ferramentas/pegar-token.mjs <arquivo de saída>. Apague o arquivo quando acabar. */
import { spawn } from "node:child_process"; import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const saida = process.argv[2]; if (!saida) { console.log("uso: node ferramentas/pegar-token.mjs <arquivo>"); process.exit(1); }
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "token-")), porta = 9391;
const ch = spawn(process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [`--remote-debugging-port=${porta}`, `--user-data-dir=${perfil}`,
  "--no-first-run", "--no-default-browser-check", "--new-window", "https://octogono.fun/#/conta"], { stdio: "ignore" });
let alvo = null;
for (let i = 0; i < 100 && !alvo; i++) { try { alvo = (await (await fetch(`http://127.0.0.1:${porta}/json`)).json()).find((t) => t.type === "page" && /octogono\.fun/.test(t.url)); } catch {} if (!alvo) await esperar(300); }
if (!alvo) { ch.kill(); throw new Error("a janela não abriu"); }
console.log("janela aberta: entre na sua conta nela (até 10 minutos)");
const sock = new WebSocket(alvo.webSocketDebuggerUrl); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
let seq = 0; const pend = new Map();
sock.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d.result); pend.delete(d.id); } };
const avaliar = (e) => new Promise((ok) => { const id = ++seq; pend.set(id, ok); sock.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression: e, returnByValue: true } })); });
let token = null;
for (let i = 0; i < 1200 && !token; i++) {
  const r = await avaliar(`(()=>{try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(/^sb-.*-auth-token$/.test(k)){const v=JSON.parse(localStorage.getItem(k));return v&&v.access_token||null;}}}catch(e){}return null;})()`).catch(() => null);
  token = r && r.result && r.result.value; if (!token) await esperar(500);
}
if (token) { fs.writeFileSync(saida, token, { mode: 0o600 }); console.log("sessão guardada em " + saida); } else console.log("não achei a sessão em 10 minutos");
try { sock.close(); } catch {} ch.kill(); fs.rmSync(perfil, { recursive: true, force: true });
