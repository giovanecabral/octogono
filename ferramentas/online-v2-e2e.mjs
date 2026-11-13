/* Luta inteira do Online no combate v2 (cartas com velocidade, 2026-11-13), num Chrome de verdade,
   entre duas contas, sem tocar em produção: servidor local (ferramentas/servidor-local.mjs, PGlite) com
   a flag combate_v2 ligada só pras duas contas de teste. Uma aba no computador (1360 x 860, a conta A) e
   outra no celular (390 x 844, a conta B); cada uma joga uma carta quando a mão aparece. Confere: a
   luta é a v2 (classe v2 na tela), as cartas mostram velocidade e dano, a linha do tempo do porquê
   aparece depois da troca, o deck dele abre, a barra desce pela vida e a luta chega no resultado nas
   duas abas, sem erro na página. Fotos na pasta de saída.

   Sem puppeteer: um cliente mínimo do protocolo de depuração do Chrome (WebSocket do Node 24). Chrome
   do sistema com a placa de vídeo (--use-angle=metal --enable-gpu; sem ela o 3D roda a 6 quadros).
   A IA de produção e o Supabase ficam bloqueados (Fetch.failRequest).

   Uso: node ferramentas/online-v2-e2e.mjs <pasta das fotos> */
import { spawn } from "node:child_process"; import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { fileURLToPath } from "node:url";
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), PORTA = Number(process.env.PORTA || 8793), BASE = `http://127.0.0.1:${PORTA}/`;
const OUT = path.resolve(process.argv[2] || "online-v2"); fs.mkdirSync(OUT, { recursive: true });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join(RAIZ, "ferramentas", "servidor-local.mjs"), String(PORTA)], { stdio: "ignore" });
const post = async (rota, corpo) => (await fetch(BASE + rota, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })).json();
for (let i = 0; i < 150; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await esperar(200); }

/* o Chrome pelo protocolo de depuração: abas com viewport, script de início, bloqueio de URL, evaluate e foto */
async function chrome(porta = 9341) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v2-e2e-"));
  const ch = spawn(process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${porta}`, `--user-data-dir=${dir}`,
    "--hide-scrollbars", "--use-angle=metal", "--enable-gpu", "--no-first-run", "--no-default-browser-check", "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
  let ws = null;
  for (let i = 0; i < 100 && !ws; i++) { try { ws = (await (await fetch(`http://127.0.0.1:${porta}/json/version`)).json()).webSocketDebuggerUrl; } catch {} if (!ws) await esperar(200); }
  const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
  let seq = 0; const pend = new Map(), ouvintes = [];
  sock.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const { ok, erro } = pend.get(d.id); pend.delete(d.id); d.error ? erro(new Error(d.error.message)) : ok(d.result); } else ouvintes.forEach((f) => f(d)); };
  const enviar = (method, params = {}, sessionId) => new Promise((ok, erro) => { const id = ++seq; pend.set(id, { ok, erro }); sock.send(JSON.stringify({ id, method, params, sessionId })); });
  async function aba(vp, { bloquear = [], inicio = "" } = {}) {
    const { targetId } = await enviar("Target.createTarget", { url: "about:blank" });
    const { sessionId: s } = await enviar("Target.attachToTarget", { targetId, flatten: true });
    const erros = [];
    ouvintes.push((d) => {
      if (d.sessionId !== s) return;
      if (d.method === "Fetch.requestPaused") enviar("Fetch.failRequest", { requestId: d.params.requestId, errorReason: "BlockedByClient" }, s).catch(() => {});
      if (d.method === "Runtime.exceptionThrown") erros.push(String(d.params.exceptionDetails.exception ? d.params.exceptionDetails.exception.description : d.params.exceptionDetails.text).slice(0, 240));
    });
    await enviar("Page.enable", {}, s); await enviar("Runtime.enable", {}, s);
    if (bloquear.length) await enviar("Fetch.enable", { patterns: bloquear.map((u) => ({ urlPattern: u })) }, s);
    await enviar("Emulation.setDeviceMetricsOverride", { width: vp.width, height: vp.height, deviceScaleFactor: vp.deviceScaleFactor || 1, mobile: !!vp.isMobile }, s);
    if (vp.hasTouch) await enviar("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, s);
    if (inicio) await enviar("Page.addScriptToEvaluateOnNewDocument", { source: inicio }, s);
    const p = {
      erros,
      async ir(url) { await enviar("Page.navigate", { url }, s); await esperar(400); for (let i = 0; i < 100; i++) { const r = await p.avaliar(() => document.readyState).catch(() => ""); if (r === "complete") break; await esperar(150); } },
      async avaliar(fn, ...args) {
        const r = await enviar("Runtime.evaluate", { expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true }, s);
        if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
        return r.result.value;
      },
      async foto(arq) { const { data } = await enviar("Page.captureScreenshot", { format: "png" }, s); fs.writeFileSync(path.join(OUT, arq), Buffer.from(data, "base64")); },
    };
    return p;
  }
  return { aba, fechar: () => { try { sock.close(); } catch {} ch.kill(); } };
}

const log = [], fotos = new Set();
let C = null, A = null, B = null;
try {
  const ua = (await post("teste/usuario", { pro: true })).id, ub = (await post("teste/usuario", { pro: true })).id;
  await post("teste/sql", { sql: "update jxj_config set valor = $1::jsonb where chave = 'combate_v2'", params: [JSON.stringify({ contas: [ua, ub] })] });
  C = await chrome();
  const inicio = `localStorage.setItem("tutorial:draft","1");localStorage.setItem("tutorial:luta","1");localStorage.setItem("jxj:treino","1");localStorage.setItem("luta:3d","1");`;
  const bloquear = ["*supabase.co*", "*octogono.fun/api*", "*draft-ufc.vercel.app*", "*vercel*"];
  A = await C.aba({ width: 1360, height: 860 }, { bloquear, inicio });
  B = await C.aba({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, { bloquear, inicio });
  /* cada aba entra como uma conta de teste (token "tok:<id>" do servidor local) e cria o lutador */
  const entrar = async (p, uid, nome, estilo) => {
    await p.ir(BASE + "#/menu");
    return p.avaliar(async (uid, nome, estilo) => {
      meuAccessToken = async () => "tok:" + uid;
      sessaoAtual = async () => { USUARIO_ID = uid; return { user: { id: uid, email: uid.slice(0, 6) + "@teste" }, access_token: "tok:" + uid }; };
      atualizarStatusPro = async () => { meuPro = true; }; if (typeof reconferirPro === "function") reconferirPro = async () => true; meuPro = true;
      await jxj("criar", { nome, estilo, categoria: "lightweight", rosto: { ...cfgPadrao(), cabelo: 2, barba: 3, entrada: 1 } });
      const l = (await jxj("estado")).lutadores[0];
      await jxj("filaEntrar", { lutadorId: l.id });
      return l.id;
    }, uid, nome, estilo);
  };
  await entrar(A, ua, "Kayo Brasa", "striker");
  await entrar(B, ub, "Davi Rocha", "wrestler");
  const par = await A.avaliar(async () => jxj("fila"));
  const lid = par && par.luta && par.luta.id;
  if (!lid) throw new Error("o par não se formou: " + JSON.stringify(par).slice(0, 200));
  await A.avaliar(async (lid) => jxj("confirmar", { lutaId: lid }), lid);
  await B.avaliar(async (lid) => jxj("confirmar", { lutaId: lid }), lid);
  for (const p of [A, B]) await p.avaliar((h) => { location.hash = h; }, "#/jxj/luta/" + lid);
  await esperar(5000);
  const viu = { v2: 0, linha: 0, velDano: 0, deck: false, telaCheia: 0, vidaDesceu: false, chao: false };
  const jogadas = { A: 0, B: 0 }, fim = { A: false, B: false };
  const t0 = Date.now();
  while (Date.now() - t0 < 600000 && !(fim.A && fim.B)) {
    for (const [nome, p] of [["A", A], ["B", B]]) {
      if (fim[nome]) continue;
      const st = await p.avaliar(() => {
        const cb = document.getElementById("jxj-combate"), q = (s) => document.querySelector(s);
        const vida = (l) => { const b = document.getElementById("jxj-vida-" + l); return b ? Number(b.dataset.vida) : null; };
        const mao = [...document.querySelectorAll(".jxj-na-mao .jxj-c2")];
        return { res: !!q(".jxj-resultado"), fimCena: !!q(".jxj-fim"), v2: !!(cb && cb.classList.contains("v2")), cheia: !!(cb && cb.classList.contains("tela-cheia")),
          assist: !!(cb && cb.classList.contains("assistindo")), linha: !!q(".v2-linha"), regua: !!q(".v2-regua"),
          velDano: mao.length && mao.every((c) => c.querySelector(".jxj-c2-stat.vel b") && c.querySelector(".jxj-c2-stat.dano b")),
          chao: !!q(".jxj-na-mao .jxj-c2-origem"), cartas: document.querySelectorAll(".jxj-postura:not([disabled]),.jxj-acao:not([disabled])").length,
          vida: [vida("a"), vida("b")], round: (q(".jxj-round") || {}).textContent || "" };
      });
      if (st.res) { fim[nome] = true; await p.foto(`${nome}-resultado.png`); log.push(`${nome}: resultado`); continue; }
      if (st.fimCena) { await esperar(700); await p.foto(`${nome}-cena-fim.png`); await p.avaliar(() => { const x = document.querySelector(".jxj-fim-seguir"); x && x.click(); }); await esperar(1500); continue; }
      if (st.v2) viu.v2++;
      if (st.cheia) viu.telaCheia++;
      if (st.velDano) viu.velDano++;
      if (st.vida.some((x) => x != null && x < 100)) viu.vidaDesceu = true;
      if (st.linha) { viu.linha++; if (!fotos.has(nome + "porque")) { fotos.add(nome + "porque"); await p.foto(`${nome}-porque.png`); } }
      if (st.chao && !fotos.has(nome + "chao")) { fotos.add(nome + "chao"); viu.chao = true; await p.foto(`${nome}-chao.png`); }
      if (!st.assist && st.cartas) {
        if (!fotos.has(nome + "escolha")) { fotos.add(nome + "escolha"); await p.foto(`${nome}-escolha.png`); }
        /* o deck dele, uma vez em cada aba */
        if (jogadas[nome] === 2 && !fotos.has(nome + "deck")) {
          fotos.add(nome + "deck");
          await p.avaliar(() => { const b = document.querySelector(".v2-btn-deck"); b && b.click(); }); await esperar(500);
          viu.deck = viu.deck || (await p.avaliar(() => { const d = document.getElementById("jxj-deck-dele"); return !!(d && !d.hidden && d.querySelectorAll(".jxj-c2").length >= 4); }));
          await p.foto(`${nome}-deck-dele.png`);
          await p.avaliar(() => { const b = document.querySelector(".v2-btn-deck"); b && b.click(); });
        }
        await p.avaliar((k) => { const bs = [...document.querySelectorAll(".jxj-postura:not([disabled]), .jxj-acao:not([disabled])")]; if (bs.length) bs[k % bs.length].click(); }, jogadas[nome]++);
      }
    }
    await esperar(600);
  }
  log.push(`jogadas A ${jogadas.A}, B ${jogadas.B}; consultas v2 ${viu.v2}, tela cheia ${viu.telaCheia}, linha do porquê ${viu.linha}, cartas com vel e dano ${viu.velDano}; deck dele abriu ${viu.deck}; vida desceu ${viu.vidaDesceu}; carta do chão ${viu.chao}`);
  const ok = fim.A && fim.B && viu.v2 > 0 && viu.linha > 0 && viu.velDano > 0 && viu.deck && viu.telaCheia > 0 && !A.erros.length && !B.erros.length;
  console.log(log.join("\n"));
  console.log(A.erros.length || B.erros.length ? "ERROS " + [...A.erros, ...B.erros].slice(0, 6).join(" | ") : "sem erro na página");
  console.log(ok ? "ok" : "REPROVOU");
  process.exitCode = ok ? 0 : 1;
} catch (e) { console.log(log.join("\n")); console.log("FALHA " + e.message); process.exitCode = 1; }
finally { if (C) C.fechar(); srv.kill(); setTimeout(() => process.exit(process.exitCode || 0), 300); }
