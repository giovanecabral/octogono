/* Gravador dos vídeos de anúncio do Online de cartas (2026-11-19): uma luta de verdade contra o bot, em 3D,
   vista do jogador, gravada quadro a quadro pelo protocolo do Chrome (Page.captureScreenshot em ritmo fixo de
   30 por segundo, até 4 fotos em voo na mesma sessão, com o horário de cada uma) e montada no
   ffmpeg no ritmo real (cada quadro dura até o horário do seguinte; o vídeo sai em 30 quadros por segundo,
   sem câmera lenta nem acelerado). O Page.startScreencast não serve: no headless ele entrega o quadro em
   pixels de CSS (405 x 720), sem a escala do aparelho.

   Nada de produção: servidor local (ferramentas/servidor-local.mjs, PGlite), conta Pro de teste, bots
   ligados, flag combate_v2 pra todos, a IA de produção e o Supabase bloqueados (Fetch.failRequest). Chrome
   do sistema com a placa de vídeo (--use-angle=metal --enable-gpu; sem ela o 3D roda a 6 quadros).
   O lutador é "Kayo Brasa" (nome fictício), striker de nível 30 com a árvore montada e deck de cartas da
   árvore (mesma build do ARVORE=1 de ferramentas/online-v2-e2e.mjs). O bot sobe junto (nível do jogador).
   O jogador mostra a postura de golpe e joga o golpe de mais dano que tiver (no toque: toca, a carta sobe
   grande, Confirmar), com pausas de gente, pra dar mais chance de knockdown e nocaute.

   Gravar (uma luta por vez; cada uma cabe em menos de 9 minutos):
     [FORMATO=9x16|1x1] [PORTA=8871] node ferramentas/gravar-anuncio.mjs gravar <pasta da luta>
     9x16: 405 x 720 com escala 8/3 (toque: a carta tocada sobe grande e o Confirmar manda) = 1080 x 1920.
     1x1: 900 x 900 com escala 1,2 (mouse, o clique manda) = 1080 x 1080; em 540 x 540 no toque o 3D virava
     uma faixa fina. VP_W, VP_H, VP_DSF e TOQUE=1 trocam a janela.
     A luta contra o bot é sorteada: grave algumas e fique com a que tem knockdown e nocaute do jogador
     (luta.json diz o método, o vencedor e o segundo de cada knockdown; linha.json, o que a tela mostrava).
     Sai na pasta: quadros/*.jpg (apagados depois da completa.mp4; MANTER=1 guarda), quadros.txt (lista do ffmpeg com a duração de cada quadro), linha.json
     (o que a tela mostrava em cada instante, em segundos desde o primeiro quadro), luta.json (método,
     vencedor, trocas com knockdown, em segundos do vídeo) e completa.mp4 (a luta inteira, 30 qps).
   Montar o anúncio (trechos em segundos da completa.mp4; a capa é um instante do vídeo final):
     node ferramentas/gravar-anuncio.mjs montar <pasta da luta> <saida.mp4> <ini-fim,ini-fim,...> <capa em s> <LxA>
     ex.: ... montar /tmp/luta1 ~/Desktop/x.mp4 12.0-15.5,40-47.2 16.4 1080x1920
     H.264, yuv420p, 30 qps, faststart, sem som; capa em PNG ao lado (mesmo nome, .png). */
import { spawn, spawnSync } from "node:child_process"; import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { fileURLToPath } from "node:url";
const FFMPEG = process.env.FFMPEG || "/opt/homebrew/bin/ffmpeg";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const [, , MODO, ...ARGS] = process.argv;

/* ---------- montar: trechos da completa.mp4 viram o anúncio ---------- */
if (MODO === "montar") {
  const [pasta, saida, cortes, capa, tam] = ARGS;
  const [W, H] = (tam || "1080x1920").split("x").map(Number);
  const trechos = cortes.split(",").map((c) => c.split("-").map(Number));
  if (trechos.some(([a, b]) => !(b > a))) throw new Error("trecho inválido: " + cortes);
  const entrada = path.join(pasta, "completa.mp4");
  /* cada trecho cortado no quadro, escala exata (o vídeo já nasce no tamanho; a escala só garante), da faixa
     cheia do JPEG (yuvj420p) pra faixa de TV (yuv420p, o que a Meta espera) e concat */
  const fil = trechos.map(([a, b], i) => `[0:v]trim=start=${a}:end=${b},setpts=PTS-STARTPTS,scale=${W}:${H}:flags=lanczos:out_range=tv,setsar=1,fps=30[v${i}]`).join(";")
    + ";" + trechos.map((_, i) => `[v${i}]`).join("") + `concat=n=${trechos.length}:v=1:a=0,format=yuv420p[v]`;
  fs.mkdirSync(path.dirname(path.resolve(saida)), { recursive: true });
  for (const crf of [20, 23, 26]) {
    const r = spawnSync(FFMPEG, ["-y", "-loglevel", "error", "-i", entrada, "-filter_complex", fil, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", String(crf),
      "-profile:v", "high", "-pix_fmt", "yuv420p", "-color_range", "tv", "-r", "30", "-movflags", "+faststart", saida], { stdio: "inherit" });
    if (r.status !== 0) throw new Error("ffmpeg falhou");
    const mb = fs.statSync(saida).size / 1e6;
    console.log(`crf ${crf}: ${mb.toFixed(1)} MB`);
    if (mb <= 15) break;
  }
  const png = saida.replace(/\.mp4$/, ".png");
  spawnSync(FFMPEG, ["-y", "-loglevel", "error", "-ss", String(capa || 0), "-i", saida, "-frames:v", "1", png], { stdio: "inherit" });
  const dur = trechos.reduce((s, [a, b]) => s + b - a, 0);
  console.log(`montado: ${saida} (${dur.toFixed(2)} s) e ${png}`);
  process.exit(0);
}
if (MODO !== "gravar") { console.log("uso: node ferramentas/gravar-anuncio.mjs gravar <pasta> | montar <pasta> <saida.mp4> <cortes> <capa s> <LxA>"); process.exit(1); }

/* ---------- gravar ---------- */
import("../api/_jxj-arvores.js").then(async (ARV) => {
const CARTAS = await import("../api/_jxj-cartas.js");
const FORMATO = process.env.FORMATO || "9x16";
const VP = FORMATO === "1x1" ? { width: 900, height: 900, deviceScaleFactor: 1.2, isMobile: false, hasTouch: false }
  : { width: 405, height: 720, deviceScaleFactor: 8 / 3, isMobile: true, hasTouch: true };
/* VP_W, VP_H, VP_DSF e TOQUE=1|0 trocam a janela (pra testar outro tamanho) */
if (process.env.VP_W) Object.assign(VP, { width: Number(process.env.VP_W), height: Number(process.env.VP_H), deviceScaleFactor: Number(process.env.VP_DSF || 1), isMobile: process.env.TOQUE === "1", hasTouch: process.env.TOQUE === "1" });
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), PORTA = Number(process.env.PORTA || 8871), BASE = `http://127.0.0.1:${PORTA}/`;
const OUT = path.resolve(ARGS[0] || "anuncio"), QD = path.join(OUT, "quadros");
fs.mkdirSync(QD, { recursive: true });
for (const f of fs.readdirSync(QD)) fs.unlinkSync(path.join(QD, f));

/* build de nível 30 e deck da árvore: as mesmas regras do ARVORE=1 de online-v2-e2e.mjs */
function buildArvore(estilo) {
  const b = {};
  for (const r of Object.values(ARV.RAMOS)) if (r.estilo === estilo) r.nos.forEach((no, i) => { b[no.id] = i < 3 ? 3 : 1; });
  const v = ARV.validarBuild(estilo, b, 30); if (!v.ok) throw new Error("build: " + v.erro);
  return b;
}
function deckArvore(estilo, build) {
  const lib = CARTAS.cartasLiberadas(estilo, build), deck = [...CARTAS.FIXAS[estilo]];
  const ordem = ["lendaria", "epica", "rara"];
  const nova = lib.filter((id) => CARTAS.CARTAS[id].no).sort((a, b) => ordem.indexOf(CARTAS.CARTAS[a].raridade) - ordem.indexOf(CARTAS.CARTAS[b].raridade));
  const cont = (id) => deck.filter((x) => x === id).length, cat = (c) => deck.filter((x) => CARTAS.CARTAS[x].categoria === c).length;
  for (const [c, id] of [["queda", "queda"], ["pressao", "clinch"], ["golpes", "jab"]]) if (!cat(c) && !deck.includes(id)) deck.push(id);
  while (cat("defesa") < 2) deck.push("bloqueio");
  for (const id of nova) { if (deck.length >= 12) break; if (cont(id) < CARTAS.copiasDe(id) && !deck.includes(id)) deck.push(id); }
  for (const id of ["bloqueio", "jab", "cruzado", "antiqueda", "queda", "clinch"]) { if (deck.length >= 12) break; if (cont(id) < CARTAS.copiasDe(id)) deck.push(id); }
  const v = CARTAS.validarDeck(estilo, deck, lib); if (!v.ok) throw new Error("deck: " + v.erro + " " + deck.join());
  return deck;
}

const srv = spawn(process.execPath, [path.join(RAIZ, "ferramentas", "servidor-local.mjs"), String(PORTA)], { stdio: "ignore" });
const post = async (rota, corpo) => (await fetch(BASE + rota, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })).json();
const sql = async (q, params = []) => { const r = await post("teste/sql", { sql: q, params }); if (!r.linhas) throw new Error("sql: " + JSON.stringify(r).slice(0, 200)); return r.linhas; };
for (let i = 0; i < 150; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await esperar(200); }

/* Chrome pelo protocolo de depuração (o mesmo cliente mínimo dos e2e), com o screencast */
const dirPerfil = fs.mkdtempSync(path.join(os.tmpdir(), "anuncio-"));
const portaCh = 9371;
const ch = spawn(process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${portaCh}`, `--user-data-dir=${dirPerfil}`,
  "--hide-scrollbars", "--use-angle=metal", "--enable-gpu", "--no-first-run", "--no-default-browser-check", "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
let wsUrl = null;
for (let i = 0; i < 100 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${portaCh}/json/version`)).json()).webSocketDebuggerUrl; } catch {} if (!wsUrl) await esperar(200); }
const sock = new WebSocket(wsUrl); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
let seq = 0; const pend = new Map(), ouvintes = [];
sock.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const { ok, erro } = pend.get(d.id); pend.delete(d.id); d.error ? erro(new Error(d.error.message)) : ok(d.result); } else ouvintes.forEach((f) => f(d)); };
const enviar = (method, params = {}, sessionId) => new Promise((ok, erro) => { const id = ++seq; pend.set(id, { ok, erro }); sock.send(JSON.stringify({ id, method, params, sessionId })); });
const fechar = () => { try { sock.close(); } catch {} ch.kill(); srv.kill(); };

const { targetId } = await enviar("Target.createTarget", { url: "about:blank" });
const { sessionId: S } = await enviar("Target.attachToTarget", { targetId, flatten: true });
const erros = [], quadros = [];
ouvintes.push((d) => {
  if (d.sessionId !== S) return;
  if (d.method === "Fetch.requestPaused") enviar("Fetch.failRequest", { requestId: d.params.requestId, errorReason: "BlockedByClient" }, S).catch(() => {});
  if (d.method === "Runtime.exceptionThrown") erros.push(String(d.params.exceptionDetails.exception ? d.params.exceptionDetails.exception.description : d.params.exceptionDetails.text).slice(0, 240));
});
/* gravação em ritmo fixo: um pedido de foto a cada 1/30 s, com até 4 em voo na mesma sessão (4 sessões, cada
   uma com a escala do aparelho, se atropelam: saía quadro com a página encolhida num canto);
   o horário do quadro é o do pedido (a foto sai do próximo quadro do compositor). Tique sem sessão livre
   fica sem quadro e o anterior dura mais: o tempo continua o real. */
const fotoSess = [];
for (let k = 0; k < 4; k++) fotoSess.push({ s: S, livre: true });
let gravando = false, pulados = 0, emVoo = 0, foraDoTamanho = 0;
/* largura x altura de um JPEG (o marcador SOF) */
function tamJpeg(b) {
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  return [0, 0];
}
const LARG = Math.round(VP.width * VP.deviceScaleFactor), ALT = Math.round(VP.height * VP.deviceScaleFactor);
async function gravar() {
  const passo = 1000 / 30; let prox = performance.now(), n = 0;
  while (gravando) {
    const fs1 = fotoSess.find((x) => x.livre);
    if (!fs1) pulados++;
    else {
      fs1.livre = false; emVoo++;
      const t = Date.now() / 1000, arq = `${String(++n).padStart(6, "0")}.jpg`;
      enviar("Page.captureScreenshot", { format: "jpeg", quality: 90, optimizeForSpeed: true }, fs1.s)
        .then((r) => {
          /* de vez em quando uma foto volta em pixels de CSS: fica de fora (o quadro anterior dura mais) */
          const b = Buffer.from(r.data, "base64"), [w, h] = tamJpeg(b);
          if (w !== LARG || h !== ALT) { foraDoTamanho++; return; }
          fs.writeFileSync(path.join(QD, arq), b); quadros.push({ arq, t });
        })
        .catch(() => {}).finally(() => { fs1.livre = true; emVoo--; });
    }
    prox += passo; const falta = prox - performance.now();
    if (falta > 0) await esperar(falta); else { prox = performance.now(); await esperar(0); }
  }
  while (emVoo > 0) await esperar(20);
}
const avaliar = async (fn, ...args) => {
  const r = await enviar("Runtime.evaluate", { expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true }, S);
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
  return r.result.value;
};
await enviar("Page.enable", {}, S); await enviar("Runtime.enable", {}, S);
await enviar("Fetch.enable", { patterns: ["*supabase.co*", "*octogono.fun/api*", "*draft-ufc.vercel.app*", "*vercel*"].map((u) => ({ urlPattern: u })) }, S);
await enviar("Emulation.setDeviceMetricsOverride", { width: VP.width, height: VP.height, deviceScaleFactor: VP.deviceScaleFactor, mobile: VP.isMobile }, S);
if (VP.hasTouch) await enviar("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, S);
await enviar("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem("tutorial:draft","1");localStorage.setItem("tutorial:luta","1");localStorage.setItem("jxj:treino","1");localStorage.setItem("jxj:treino2","1");localStorage.setItem("luta:3d","1");` }, S);
const ir = async (url) => { await enviar("Page.navigate", { url }, S); await esperar(400); for (let i = 0; i < 100; i++) { const r = await avaliar(() => document.readyState).catch(() => ""); if (r === "complete") break; await esperar(150); } };

const linha = [], log = [];
let lutaId = null;
try {
  const contaBots = (await post("teste/usuario", { pro: false })).id;
  await sql("select public.jxj_bot_configurar($1) as r", [contaBots.slice(0, 8) + "@teste"]);
  await sql("update jxj_config set valor = 'true'::jsonb where chave = 'combate_v2'");
  const uid = (await post("teste/usuario", { pro: true })).id;
  await ir(BASE + "#/menu");
  const lid = await avaliar(async (uid) => {
    meuAccessToken = async () => "tok:" + uid;
    sessaoAtual = async () => { USUARIO_ID = uid; return { user: { id: uid, email: uid.slice(0, 6) + "@teste" }, access_token: "tok:" + uid }; };
    atualizarStatusPro = async () => { meuPro = true; }; if (typeof reconferirPro === "function") reconferirPro = async () => true; meuPro = true;
    await jxj("criar", { nome: "Kayo Brasa", estilo: "striker", categoria: "lightweight", rosto: { ...cfgPadrao(), cabelo: 2, barba: 3, entrada: 1 } });
    return (await jxj("estado")).lutadores[0].id;
  }, uid);
  const build = buildArvore("striker"), deck = deckArvore("striker", build);
  await sql("update jxj_lutadores set nivel = 30, build = $1::jsonb where id = $2", [JSON.stringify(build), lid]);
  await avaliar(async (lid, d) => jxj("deck", { lutadorId: lid, deck: d }), lid, deck);
  log.push("deck: " + deck.join(","));
  lutaId = await avaliar(async (lid) => { await jxj("filaEntrar", { lutadorId: lid }); const bt = await jxj("bot", { lutadorId: lid }); return bt.luta || bt.id; }, lid);
  if (!lutaId) throw new Error("sem luta contra o bot");
  /* começa a gravar e entra na luta */
  gravando = true; const gravacao = gravar();
  await avaliar((h) => { location.hash = h; }, "#/jxj/luta/" + lutaId);
  /* depois da carta jogada, espera o duelo e o 3D da troca passarem antes da próxima (como gente faria):
     a mão volta já no duelo (2,5 s), antes do 3D começar */
  const t0 = Date.now(); let jogadas = 0, fim = false, ultimo = "", aguardando = 0, viuAssist = false;
  while (Date.now() - t0 < 480000) {
    const st = await avaliar(() => {
      const cb = document.getElementById("jxj-combate"), q = (s) => document.querySelector(s);
      const vida = (l) => { const b = document.getElementById("jxj-vida-" + l); return b ? Number(b.dataset.vida) : null; };
      return { res: !!q(".jxj-resultado"), fimCena: !!q(".jxj-fim"), conf: !!q(".jxj-versus"), assist: !!(cb && cb.classList.contains("assistindo")),
        etapa: (q(".v2-comando") || { className: "" }).className.split(" ").find((c) => c.startsWith("etapa-")) || "",
        duelo: ((q(".jxj-mesa.v2-duelo") || { className: "" }).className.split(" ").find((c) => c.startsWith("duelo-")) || ""),
        foco: !!(q(".v2-foco") && !q(".v2-foco").hidden), round: ((q(".jxj-round") || {}).textContent || "").replace(/\s+/g, " "),
        cartas: document.querySelectorAll(".jxj-postura:not([disabled]),.jxj-acao:not([disabled])").length, vida: [vida("a"), vida("b")] };
    }).catch(() => ({}));
    const chave = JSON.stringify(st);
    if (chave !== ultimo) { linha.push({ t: Date.now() / 1000, ...st }); ultimo = chave; }
    if (st.res) { await esperar(2500); fim = true; break; }
    if (st.fimCena) { await esperar(4000); await avaliar(() => { const x = document.querySelector(".jxj-fim-seguir"); x && x.click(); }); await esperar(1500); continue; }
    if (st.conf) { await avaliar(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Confirmar a luta")); b && b.click(); }); await esperar(1000); continue; }
    if (st.foco && !st.assist) { await avaliar(() => { const b = document.querySelector(".v2-foco:not([hidden]) .v2-confirmar"); b && b.click(); }); await esperar(300); continue; }
    if (aguardando) {
      if (st.assist) viuAssist = true;
      if ((viuAssist && !st.assist) || Date.now() - aguardando > 14000) { aguardando = 0; viuAssist = false; }
    }
    if (!aguardando && !st.assist && st.cartas && !st.foco) {
      /* pausa de gente: a mão entra, os selos aparecem; aí toca a carta, ela sobe grande, e confirma */
      await esperar(st.etapa === "etapa-sinal" ? 900 : 1500);
      const tocou = await avaliar(() => {
        const bs = [...document.querySelectorAll(".jxj-postura:not([disabled]), .jxj-acao:not([disabled])")];
        if (!bs.length) return "";
        const dano = (b) => { const x = b.querySelector(".jxj-c2-stat.dano b"); return x ? parseFloat(x.textContent.replace(",", ".")) || 0 : 0; };
        const golpe = (b) => !!b.querySelector(".jxj-carta.f-golpes");
        const postura = bs[0].classList.contains("jxj-postura");
        let alvo;
        if (postura) alvo = bs.find(golpe) || bs[0];
        else {
          const boas = bs.filter((b) => !b.classList.contains("exausta") && !b.classList.contains("finta"));
          const l = (boas.length ? boas : bs).slice().sort((a, b) => (golpe(b) - golpe(a)) || (dano(b) - dano(a)));
          alvo = l[0];
        }
        alvo.click();
        const c = alvo.querySelector("[data-carta]"); return (postura ? "postura " : "carta ") + (c ? c.dataset.carta : "?");
      });
      if (tocou) {
        jogadas++; linha.push({ t: Date.now() / 1000, tocou });
        await esperar(tocou.startsWith("postura") ? 800 : 1200);
        await avaliar(() => { const b = document.querySelector(".v2-foco:not([hidden]) .v2-confirmar"); b && b.click(); });
        linha.push({ t: Date.now() / 1000, confirmou: true });
        if (tocou.startsWith("carta")) aguardando = Date.now();
      }
    }
    await esperar(120);
  }
  gravando = false; await gravacao;
  quadros.sort((a, b) => a.t - b.t);
  if (!quadros.length) throw new Error("nenhum quadro gravado");
  const T0 = quadros[0].t;
  /* a lista do ffmpeg: cada quadro dura até o próximo (o último, 1/30 s) */
  let txt = "ffconcat version 1.0\n";
  quadros.forEach((q, i) => { const d = i + 1 < quadros.length ? quadros[i + 1].t - q.t : 1 / 30; txt += `file 'quadros/${q.arq}'\nduration ${Math.max(d, 0.001).toFixed(4)}\n`; });
  txt += `file 'quadros/${quadros[quadros.length - 1].arq}'\n`;
  fs.writeFileSync(path.join(OUT, "quadros.txt"), txt);
  fs.writeFileSync(path.join(OUT, "linha.json"), JSON.stringify(linha.map((x) => ({ ...x, t: +(x.t - T0).toFixed(2) })), null, 1));
  const L = (await sql("select estado->'fim' as fim from jxj_lutas where id = $1", [lutaId]))[0] || {};
  const tr = await sql("select round, troca, eventos, extract(epoch from resolvida_em) as em from jxj_trocas where luta_id = $1 order by round, troca", [lutaId]);
  const trocas = tr.map((x) => ({ round: x.round, troca: x.troca, t: +(Number(x.em) - T0).toFixed(2), kd: (x.eventos || []).filter((e) => e.tipo === "knockdown").map((e) => e.quem), fim: (x.eventos || []).filter((e) => e.tipo === "fim").map((e) => e.quem + " " + e.metodo) }));
  const total = quadros[quadros.length - 1].t - T0, qps = quadros.length / Math.max(total, 0.001);
  const intervalos = quadros.slice(1).map((q, i) => q.t - quadros[i].t).sort((a, b) => a - b);
  const p95 = intervalos.length ? intervalos[Math.floor(intervalos.length * 0.95)] : 0;
  fs.writeFileSync(path.join(OUT, "luta.json"), JSON.stringify({ formato: FORMATO, fim: L.fim, jogadas, quadros: quadros.length, segundos: +total.toFixed(1), qps: +qps.toFixed(1), p95: +p95.toFixed(3), pulados, foraDoTamanho, trocas, erros }, null, 1));
  log.push(`fim ${JSON.stringify(L.fim)}; jogadas ${jogadas}; ${quadros.length} quadros em ${total.toFixed(1)} s (${qps.toFixed(1)} qps médios, intervalo p95 ${(p95 * 1000).toFixed(0)} ms, ${pulados} tiques sem sessão livre, ${foraDoTamanho} fotos fora do tamanho); terminou ${fim}`);
  log.push("knockdowns: " + JSON.stringify(trocas.filter((x) => x.kd.length).map((x) => `${x.round}.${x.troca} ${x.kd.join("")} @${x.t}s`)));
  /* a luta inteira no ritmo real, 30 qps, pra escolher os trechos */
  const r = spawnSync(FFMPEG, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(OUT, "quadros.txt"), "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-an", path.join(OUT, "completa.mp4")], { stdio: "inherit" });
  log.push(r.status === 0 ? "completa.mp4 pronta" : "ffmpeg falhou");
  /* os quadros soltos pesam ~1 GB por luta: saem depois da completa.mp4 (MANTER=1 guarda) */
  if (r.status === 0 && process.env.MANTER !== "1") fs.rmSync(QD, { recursive: true, force: true });
} catch (e) { log.push("FALHA " + e.message); process.exitCode = 1; }
finally {
  console.log(log.join("\n"));
  console.log(erros.length ? "ERROS " + erros.slice(0, 6).join(" | ") : "sem erro na página");
  fechar(); setTimeout(() => process.exit(process.exitCode || 0), 300);
}
});
