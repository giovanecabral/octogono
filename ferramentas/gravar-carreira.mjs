/* Gravador do anúncio da carreira (offline), 2026-11-19. Mesmo jeito do gravar-anuncio.mjs (servidor local,
   Chrome com a placa de vídeo, quadros em ritmo fixo de 30 por segundo, montados no ffmpeg no ritmo real).

   Os 1.527 lutadores são pessoas reais: no anúncio, nenhum nome real aparece. O fighters.json chega na página
   com cada nome trocado por um nome inventado (o mesmo nome sempre, pelo hash), só nesta gravação; os números
   continuam os do arquivo.

   IA de verdade na coletiva (decisão do dono, 2026-11-19): com TOKEN_ARQ (arquivo com o access_token de uma
   conta Pro, tirado do Chrome em que o dono entrou), cada pedido pra octogono.fun/api/ai sai com esse token no
   corpo. Sem TOKEN_ARQ, a IA fica bloqueada e a coletiva usa os moldes. A chave do OpenRouter continua só na
   Vercel. O Supabase fica bloqueado (o login local é o atalho de sempre).

   Uso: [TOKEN_ARQ=arquivo] [MAX=1] node ferramentas/gravar-carreira.mjs <ui|luta> <pasta>
     ui: celular (405 x 720, escala 8/3, toque): o draft com toques de verdade, o painel, a escolha do adversário,
         o camp e a coletiva (pergunta da IA, a resposta digitada e a reação).
     luta: só o 3D em tela cheia (1080 x 1920): a disputa do cinturão com a entrada, a luta e a cerimônia. Pra
         chegar nela, tituloLiberado() devolve true e a simulação é refeita até o jogador vencer por nocaute (o
         resultado continua saindo do motor, só é escolhido).
   Sai na pasta: completa.mp4 e marcas.json (o segundo de cada etapa). */
import { spawn, spawnSync } from "node:child_process"; import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { fileURLToPath } from "node:url";
const FFMPEG = process.env.FFMPEG || "/opt/homebrew/bin/ffmpeg";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const [, , MODO, pasta] = process.argv;
if (!["ui", "luta"].includes(MODO) || !pasta) { console.log("uso: node ferramentas/gravar-carreira.mjs <ui|luta> <pasta>"); process.exit(1); }
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), PORTA = Number(process.env.PORTA || 8875), BASE = `http://127.0.0.1:${PORTA}/`;
const OUT = path.resolve(pasta), QD = path.join(OUT, "quadros");
fs.mkdirSync(QD, { recursive: true }); for (const f of fs.readdirSync(QD)) fs.unlinkSync(path.join(QD, f));
const VP = MODO === "ui" ? { width: 405, height: 720, deviceScaleFactor: 8 / 3, isMobile: true, hasTouch: true } : { width: 1080, height: 1920, deviceScaleFactor: 1, isMobile: false, hasTouch: false };
const TOKEN = process.env.TOKEN_ARQ ? fs.readFileSync(process.env.TOKEN_ARQ, "utf8").trim() : null;

/* nomes inventados: um nome e um sobrenome por hash do nome real (estável entre gravações) */
const NOMES = ["Kauã", "Diego", "Rafael", "Thiago", "Bruno", "Caio", "Renan", "Igor", "Matheus", "Vitor", "Leandro", "Rodrigo", "Ícaro", "Gustavo", "Felipe", "Davi", "Henrique", "Murilo", "Otávio", "Alan",
  "Marco", "Nikolai", "Tomás", "Joaquín", "Dante", "Elias", "Viktor", "Omar", "Ruben", "Sasha", "Hugo", "Iago", "Luan", "Enzo", "Yuri", "Ramon", "Ciro", "Tales", "Abel", "Nilo"];
const SOBRENOMES = ["Vargas", "Moreira", "Tavares", "Rocha", "Cardoso", "Pires", "Bastos", "Siqueira", "Lacerda", "Amaral", "Fontes", "Barreto", "Queiroz", "Duarte", "Leme", "Sampaio", "Prado", "Teixeira", "Coutinho", "Matos",
  "Okafor", "Petrov", "Kovač", "Salgado", "Ibarra", "Novak", "Halvorsen", "Mendez", "Draven", "Kaya", "Moretti", "Valença", "Asante", "Brandt", "Castell", "Nakai", "Rivas", "Lindqvist", "Ferraz", "Haddad"];
const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
const inventado = (nome) => { const h = hash(nome); return `${NOMES[h % NOMES.length]} ${SOBRENOMES[(h >>> 8) % SOBRENOMES.length]}`; };

const srv = spawn(process.execPath, [path.join(RAIZ, "ferramentas", "servidor-local.mjs"), String(PORTA)], { stdio: "ignore" });
for (let i = 0; i < 150; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await esperar(200); }
const fighters = JSON.parse(fs.readFileSync(path.join(RAIZ, "fighters.json"), "utf8"));
const usados = new Set();
const reais = new Set(fighters.map((f) => f.name.toLowerCase()));
for (const f of fighters) { let n = inventado(f.name), k = 2; while (usados.has(n) || reais.has(n.toLowerCase())) n = inventado(f.name + k++); usados.add(n); f.name = n; }
const fightersB64 = Buffer.from(JSON.stringify(fighters)).toString("base64");

const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "carreira-")), portaCh = 9376;
const ch = spawn(process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${portaCh}`, `--user-data-dir=${perfil}`,
  "--hide-scrollbars", "--use-angle=metal", "--enable-gpu", "--no-first-run", "--no-default-browser-check", "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
let ws = null; for (let i = 0; i < 100 && !ws; i++) { try { ws = (await (await fetch(`http://127.0.0.1:${portaCh}/json/version`)).json()).webSocketDebuggerUrl; } catch {} if (!ws) await esperar(200); }
const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
let seq = 0; const pend = new Map(), ouvintes = [];
sock.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const { ok, erro } = pend.get(d.id); pend.delete(d.id); d.error ? erro(new Error(d.error.message)) : ok(d.result); } else ouvintes.forEach((f) => f(d)); };
const enviar = (method, params = {}, sessionId) => new Promise((ok, erro) => { const id = ++seq; pend.set(id, { ok, erro }); sock.send(JSON.stringify({ id, method, params, sessionId })); });
const { targetId } = await enviar("Target.createTarget", { url: "about:blank" });
const { sessionId: S } = await enviar("Target.attachToTarget", { targetId, flatten: true });
const erros = [], quadros = [], marcas = {};
let chamadasIA = 0;
ouvintes.push((d) => {
  if (d.sessionId !== S) return;
  if (d.method === "Runtime.exceptionThrown") erros.push(String(d.params.exceptionDetails.exception ? d.params.exceptionDetails.exception.description : d.params.exceptionDetails.text).slice(0, 240));
  if (d.method !== "Fetch.requestPaused") return;
  const { requestId, request } = d.params;
  if (/\/fighters\.json/.test(request.url)) return enviar("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: fightersB64 }, S).catch(() => {});
  if (TOKEN && /octogono\.fun\/api\/ai/.test(request.url) && request.method === "POST") {
    try {
      const corpo = JSON.parse(request.postData || "{}"); corpo.data = { ...(corpo.data || {}), token: TOKEN }; chamadasIA++;
      return enviar("Fetch.continueRequest", { requestId, postData: Buffer.from(JSON.stringify(corpo)).toString("base64") }, S).catch(() => {});
    } catch {}
  }
  if (TOKEN && /octogono\.fun\/api\/ai/.test(request.url) && request.method === "OPTIONS") return enviar("Fetch.continueRequest", { requestId }, S).catch(() => {});
  enviar("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }, S).catch(() => {});
});
const avaliar = async (fn, ...args) => {
  const r = await enviar("Runtime.evaluate", { expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true }, S);
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
  return r.result.value;
};
await enviar("Page.enable", {}, S); await enviar("Runtime.enable", {}, S);
await enviar("Fetch.enable", { patterns: ["*supabase.co*", "*octogono.fun/api*", "*draft-ufc.vercel.app*", "*vercel*", "*fighters.json*"].map((u) => ({ urlPattern: u })) }, S);
await enviar("Emulation.setDeviceMetricsOverride", { width: VP.width, height: VP.height, deviceScaleFactor: VP.deviceScaleFactor, mobile: VP.isMobile }, S);
if (VP.hasTouch) await enviar("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, S);
await enviar("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem("tutorial:draft","1");localStorage.setItem("tutorial:luta","1");localStorage.setItem("luta:3d","1");`
  + (process.env.MAX === "1" || MODO === "luta" ? `localStorage.setItem("luta3d:max","1");` : "")
  + (MODO === "luta" ? `document.addEventListener("DOMContentLoaded",()=>{const s=document.createElement("style");s.textContent="#luta3dCaixa{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;max-height:none!important;aspect-ratio:auto!important;z-index:2147483000!important;pointer-events:none!important}";document.head.appendChild(s);});` : "") }, S);

/* ---------- quadros em ritmo fixo (o mesmo esquema do gravar-anuncio.mjs) ---------- */
const LARG = Math.round(VP.width * VP.deviceScaleFactor), ALT = Math.round(VP.height * VP.deviceScaleFactor);
function tamJpeg(b) { for (let i = 2; i + 9 < b.length;) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; i += 2 + b.readUInt16BE(i + 2); } return [0, 0]; }
let gravando = false, t0 = 0;
const livres = [true, true, true, true];
/* com escala 1 (modo luta), o screencast: o Chrome empurra cada quadro do compositor, bem mais rápido que a foto em 1080 x 1920 */
async function gravarScreencast() {
  let n = 0;
  const ouvir = (d) => {
    if (d.sessionId !== S || d.method !== "Page.screencastFrame") return;
    const { data, sessionId: sid, metadata } = d.params, b = Buffer.from(data, "base64"), [w, h] = tamJpeg(b);
    enviar("Page.screencastFrameAck", { sessionId: sid }, S).catch(() => {});
    if (w !== LARG || h !== ALT) return;
    const arq = `${String(++n).padStart(6, "0")}.jpg`; fs.writeFileSync(path.join(QD, arq), b); quadros.push({ arq, t: metadata.timestamp });
  };
  ouvintes.push(ouvir);
  await enviar("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: LARG, maxHeight: ALT, everyNthFrame: 1 }, S);
  while (gravando) await esperar(50);
  await enviar("Page.stopScreencast", {}, S).catch(() => {});
}
async function gravar() {
  if (VP.deviceScaleFactor === 1) return gravarScreencast();
  const passo = 1000 / 30; let prox = performance.now(), n = 0;
  while (gravando) {
    const k = livres.indexOf(true);
    if (k >= 0) {
      livres[k] = false; const t = Date.now() / 1000, arq = `${String(++n).padStart(6, "0")}.jpg`;
      enviar("Page.captureScreenshot", { format: "jpeg", quality: 90, optimizeForSpeed: true }, S)
        .then((r) => { const b = Buffer.from(r.data, "base64"), [w, h] = tamJpeg(b); if (w === LARG && h === ALT) { fs.writeFileSync(path.join(QD, arq), b); quadros.push({ arq, t }); } })
        .catch(() => {}).finally(() => { livres[k] = true; });
    }
    prox += passo; const falta = prox - performance.now();
    if (falta > 0) await esperar(falta); else { prox = performance.now(); await esperar(0); }
  }
}
const marca = (nome) => { marcas[nome] = +(Date.now() / 1000 - t0).toFixed(2); console.log(`${marcas[nome]} s  ${nome}`); };
const ate = async (fn, max = 60000, passo = 200) => { const t = Date.now(); while (Date.now() - t < max) { if (await avaliar(fn).catch(() => false)) return true; await esperar(passo); } return false; };
const toque = async (seletor, i = 0) => {
  /* rola primeiro, mede depois (medir antes da rolagem acabar tocava fora do cartão) */
  const tem = await avaliar((s, i) => { const n = document.querySelectorAll(s)[i]; if (!n) return false; n.scrollIntoView({ block: "center", behavior: "instant" }); return true; }, seletor, i);
  if (!tem) throw new Error("não achei " + seletor);
  await esperar(450);
  const r = await avaliar((s, i) => { const b = document.querySelectorAll(s)[i].getBoundingClientRect(); return [b.left + b.width / 2, b.top + Math.min(b.height / 2, 60)]; }, seletor, i);
  if (VP.hasTouch) { await enviar("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: r[0], y: r[1] }] }, S); await esperar(70); await enviar("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }, S); }
  else { for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await enviar("Input.dispatchMouseEvent", { type, x: r[0], y: r[1], button: "left", clickCount: 1 }, S); }
};

let fim = null;
try {
  await enviar("Page.navigate", { url: BASE + "#/menu" }, S);
  await ate(() => typeof ROSTER !== "undefined" && ROSTER && ROSTER.length > 0, 30000);
  /* o menu termina de desenhar depois da conferência da sessão (o Supabase bloqueado demora a falhar) e apagava o draft */
  await ate(() => !!document.querySelector(".tela"), 30000); await esperar(3500);
  /* o mesmo atalho do img/tutorial/capturar.mjs: carreira sem conta, Pro, sem tutorial por cima */
  await avaliar(() => {
    atualizarStatusPro = async () => true; if (typeof reconferirPro === "function") reconferirPro = async () => true;
    TUTORIAL_NA_SESSAO.draft = true; TUTORIAL_NA_SESSAO.luta = true;
    DIVISION = "lightweight"; MODO = "normal"; SEED = 20261119; RIVAL_ATIVADO = false; RIVAL_NOME_ESCOLHIDO = null; ROSTO = Object.assign(cfgPadrao(), { corEntrada: 4, entrada: 4 }); meuPro = true;   // calção dourado e roupão (o adversário fica de azul)
  });
  gravando = true; t0 = Date.now() / 1000; const laco = gravar();
  if (MODO === "ui") {
    await avaliar(() => { startDraft("Kayo Brasa"); scrollTo(0, 0); });
    marca("draft"); await esperar(1500);
    console.log("draft:", JSON.stringify(await avaliar(() => [location.hash, document.querySelectorAll(".cards .card").length, document.querySelectorAll(".card").length, (document.querySelector(".tela-sub") || {}).textContent])));
    /* seis escolhas de verdade: toque mostra, segundo toque confirma (o modelo de toque do draft) */
    for (let k = 0; k < 4; k++) {
      if (!(await avaliar(() => !!document.querySelector(".cards .card")))) break;
      const i = await avaliar(() => { const cs = [...document.querySelectorAll(".cards .card")]; let m = 0; cs.forEach((c, j) => { const v = parseFloat((c.querySelector(".cost") || {}).textContent || "0"); if (v > parseFloat((cs[m].querySelector(".cost") || {}).textContent || "0")) m = j; }); return m; });
      /* clique pelo DOM (o toque emulado não vira clique aqui): o 1º mostra a carta, o 2º confirma */
      await avaliar((i) => { const c = document.querySelectorAll(".cards .card")[i]; c.scrollIntoView({ block: "center" }); c.click(); }, i); await esperar(1300);
      const n0 = await avaliar(() => picks.length);
      await avaliar((i) => { const c = document.querySelectorAll(".cards .card")[i]; if (c) c.click(); }, i); await esperar(400);
      if ((await avaliar(() => picks.length)) === n0) await avaliar((i) => { const c = document.querySelectorAll(".cards .card")[i]; if (c) c.click(); }, i);
      await esperar(1200); await avaliar(() => scrollTo(0, 0));
    }
    marca("draft-fim");
    /* o resto do draft na hora (o mais caro que cabe) e a carreira */
    await avaliar(() => {
      let left = budgetLeft, rem = remaining && remaining.length ? remaining : [];
      while (rem.length) {
        const rows = rollTable(POOL, rem, rng, PCT), sh = cartasDaMesa(rows, left, rem, POOL, PCT);
        const r = sh.reduce((m, x) => x.cost > m.cost ? x : m, sh[0]);
        me[r.pair.a.key] = r.src[r.pair.a.key]; me[r.pair.b.key] = r.src[r.pair.b.key];
        picks.push({ pair: r.pair, from: r.src.name }); left -= r.cost; rem = rem.filter((p) => p.id !== r.pair.id);
      }
      remaining = []; budgetLeft = left; startCareer(); auto = false; meuPro = true; speed = 1;
    });
    await esperar(600); marca("painel"); await esperar(2600);
    await avaliar(() => nextFight()); await esperar(800); marca("adversarios"); await esperar(2600);
    await toque("#opps .opp", 1); await esperar(900); marca("camp"); await esperar(2200);
    /* no toque o camp é em 2 passos (o 1º mostra, o 2º confirma), como o draft */
    await avaliar(() => document.querySelector("#camps .camp").click()); await esperar(900);
    if (await avaliar(() => !!document.querySelector("#camps .camp"))) await avaliar(() => document.querySelector("#camps .camp").click());
    await esperar(500);
    marca("coletiva");
    /* a pergunta da IA (ou do molde) aparece; a resposta é digitada letra a letra */
    await ate(() => { const p = document.getElementById("colresp"); return !!p && !p.disabled; }, 45000);
    await esperar(3500);
    const resp = process.env.RESPOSTA || "Pode falar o que quiser. Sábado ele vai descobrir por que ninguém aceitou essa luta.";
    await avaliar(() => { const p = document.getElementById("colresp"); p.focus(); p.scrollIntoView({ block: "center" }); });
    for (const c of resp) { await enviar("Input.insertText", { text: c }, S); await esperar(38); }
    await esperar(700); marca("resposta");
    await avaliar(() => document.getElementById("colgo").click()); await ate(() => { const d = document.getElementById("coldesfecho"); return !!d && d.textContent.trim().length > 20; }, 45000);
    marca("reacao"); await esperar(5000);
    fim = { ia: chamadasIA };
  } else {
    /* luta: a disputa do cinturão em 3D, com a entrada e a cerimônia */
    await avaliar(() => {
      startDraft("Kayo Brasa");
      let left = budgetLeft, rem = [...remaining];
      while (rem.length) {
        const rows = rollTable(POOL, rem, rng, PCT), sh = cartasDaMesa(rows, left, rem, POOL, PCT);
        const r = sh.reduce((m, x) => x.cost > m.cost ? x : m, sh[0]);
        me[r.pair.a.key] = r.src[r.pair.a.key]; me[r.pair.b.key] = r.src[r.pair.b.key];
        picks.push({ pair: r.pair, from: r.src.name }); left -= r.cost; rem = rem.filter((p) => p.id !== r.pair.id);
      }
      remaining = []; budgetLeft = left; startCareer(); auto = false; meuPro = true; speed = 1;
      tituloLiberado = () => true;
      /* a semente da luta escolhida até o motor dar vitória do jogador por nocaute em pé no round 2 ou 3; planos
         neutros (sem plano a luta é a do simulateFight bit a bit, suíte driverluta) */
      const origRodar = rodarLuta;
      rodarLuta = function (opp, titleFight, ehRival, semL) {
        const eu = lutadorEfetivo(), R = titleFight ? 5 : 3; let s = semL; st.coletivaPressao = null;
        for (let k = 0; k < 2000; k++) { const r = simulateFight(eu, opp, { seed: s, rounds: R, koMult: fatorKoCarreira() }); if (r.winner === eu.name && r.method === "Nocaute" && r.round >= 2 && r.round <= 3) break; s = (Math.imul(s, 1103515245) + 12345) >>> 0; }
        return origRodar.call(this, opp, titleFight, ehRival, s, Array(R).fill({ mod: 1, attr: null }));
      };
      ai = async () => null;   // a coletiva desta parte não aparece (o 3D cobre a tela)
    });
    await avaliar(() => nextFight()); await esperar(700);
    /* oferta, camp e coletiva pelo DOM (o 3D cobre a tela; pula a coletiva) */
    const clicar = async (sel) => {
      const t = Date.now(); while (!(await avaliar((sel) => !!document.querySelector(sel), sel))) { if (Date.now() - t > 20000) throw new Error("não achei " + sel); await esperar(200); }
      await avaliar((sel) => document.querySelector(sel).click(), sel); await esperar(900);
    };
    if (await avaliar(() => !!document.querySelector("#opps .opp"))) await clicar("#opps .opp");
    await clicar("#camps .camp"); if (await avaliar(() => !!document.querySelector("#camps .camp"))) await clicar("#camps .camp");
    if (await ate(() => !!document.getElementById("colpular") || !!document.getElementById("colseguir"), 20000))
      await avaliar(() => (document.getElementById("colseguir") || document.getElementById("colpular")).click());
    marca("luta");
    /* o plano de cada round: a primeira opção; até o resultado */
    for (let g = 0; g < 2400; g++) {
      const st8 = await avaliar(() => ({ esc: (() => { const e = document.getElementById("escolhaLuta"); return !!e && e.style.display !== "none" && !!e.querySelector("button"); })(), fim: !playing && noiteEtapa === "resultado" }));
      if (st8.fim) break;
      if (st8.esc) { await esperar(1200); await avaliar(() => document.querySelector("#escolhaLuta button").click()); }
      await esperar(250);
    }
    marca("resultado"); await esperar(22000);   // a cerimônia e o cinturão
    fim = await avaliar(() => ({ titulo: !!st.title, ultima: (st.history || [])[(st.history || []).length - 1] || null }));
  }
  gravando = false; await laco; await esperar(400);
} finally { try { sock.close(); } catch {} ch.kill(); srv.kill(); }

quadros.sort((a, b) => a.t - b.t);
const lista = quadros.map((q, i) => `file '${path.join(QD, q.arq)}'\nduration ${Math.max(1 / 60, ((quadros[i + 1] || { t: q.t + 1 / 30 }).t - q.t)).toFixed(4)}`).join("\n") + `\nfile '${path.join(QD, quadros[quadros.length - 1].arq)}'\n`;
fs.writeFileSync(path.join(OUT, "quadros.txt"), lista);
spawnSync(FFMPEG, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(OUT, "quadros.txt"), "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "16", "-preset", "medium", path.join(OUT, "completa.mp4")], { stdio: "inherit" });
fs.writeFileSync(path.join(OUT, "marcas.json"), JSON.stringify({ marcas, fim, erros, quadros: quadros.length }, null, 1));
console.log(`fim: ${JSON.stringify(fim)}; ${quadros.length} quadros; erros: ${erros.length ? erros.join(" | ") : "nenhum"}`);
if (process.env.MANTER !== "1") fs.rmSync(QD, { recursive: true, force: true });
