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

   ARVORE=1: os dois lutadores sobem pro nível 30 com a árvore montada, a aba A salva o último nó
   do boxe pela tela (a carta nova chegando, a aba Deck) e os dois lutam com deck de cartas da árvore
   (fotos extras `arvore-*` e `A-3d-*`).

   Layout da luta v2 (2026-11-17): no celular (toque) a carta tocada sobe grande e o Confirmar manda;
   fotos da etapa da postura, da carta, da carta tocada (celular), da revelação e do chão em cada aba.
   Tamanhos: A_W x A_H (padrão 1280 x 800) e B_W x B_H (padrão 390 x 844).

   Duelo das cartas (decisão 92): foto do estado final de cada caso em cada aba (`A-duelo-meu.png`...),
   com a conferência de que as cartas não cobrem a linha de situação nem saem da tela. DUELO_MS=6000
   deixa o duelo mais tempo na tela, pra pegar mais casos. SEM3D=1: a luta só nas cartas (o duelo na mesa).

   Uso: [ARVORE=1] [B_W=360 B_H=780] [DUELO_MS=6000] [SEM3D=1] [CARTAS=bloqueio,guarda] node ferramentas/online-v2-e2e.mjs <pasta das fotos> */
import { spawn } from "node:child_process"; import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { fileURLToPath } from "node:url";
import * as ARV from "../api/_jxj-arvores.js"; import * as CARTAS from "../api/_jxj-cartas.js";
const ARVORE = process.env.ARVORE === "1";
/* build de nível 30: cada ramo do estilo em 3,3,3,1 (10 pontos); `segura` é o nó que fica de fora */
function buildArvore(estilo, segura) {
  const b = {};
  for (const r of Object.values(ARV.RAMOS)) if (r.estilo === estilo) r.nos.forEach((no, i) => { if (no.id !== segura) b[no.id] = i < 3 ? 3 : 1; });
  const v = ARV.validarBuild(estilo, b, 30); if (!v.ok) throw new Error("build: " + v.erro);
  return b;
}
/* deck: as fixas do estilo e 8 cartas da árvore (raras antes), sem passar das cópias; vale pelo validarDeck */
function deckArvore(estilo, build) {
  const lib = CARTAS.cartasLiberadas(estilo, build), deck = [...CARTAS.FIXAS[estilo]];
  const ordem = ["lendaria", "epica", "rara"];
  const nova = lib.filter((id) => CARTAS.CARTAS[id].no).sort((a, b) => ordem.indexOf(CARTAS.CARTAS[a].raridade) - ordem.indexOf(CARTAS.CARTAS[b].raridade));
  const cont = (id) => deck.filter((x) => x === id).length;
  /* a categoria que falta e as 2 defesas entram primeiro (comuns); o resto é da árvore */
  const cat = (c) => deck.filter((x) => CARTAS.CARTAS[x].categoria === c).length;
  for (const [c, id] of [["queda", "queda"], ["pressao", "clinch"], ["golpes", "jab"]]) if (!cat(c) && !deck.includes(id)) deck.push(id);
  while (cat("defesa") < 2) deck.push("bloqueio");
  for (const id of nova) { if (deck.length >= 12) break; if (cont(id) < CARTAS.copiasDe(id) && !deck.includes(id)) deck.push(id); }
  for (const id of ["bloqueio", "jab", "cruzado", "antiqueda", "queda", "clinch"]) { if (deck.length >= 12) break; if (cont(id) < CARTAS.copiasDe(id)) deck.push(id); }
  const v = CARTAS.validarDeck(estilo, deck, lib); if (!v.ok) throw new Error("deck: " + v.erro + " " + deck.join());
  return deck;
}
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
  /* CARTAS="bloqueio,guarda": as abas jogam essas cartas quando têm (força um caso do duelo, como o de nenhuma) */
  const inicio = (process.env.CARTAS ? `window.ARVORE_NOMES=${JSON.stringify(process.env.CARTAS.split(","))};` : ARVORE ? `window.ARVORE_NOMES=${JSON.stringify(["overhand", "chute rodado", "superman", "suplex", "martelada", "bodylock", "queda no contragolpe", "passagem de joelho", "contragolpe"])};` : `window.ARVORE_NOMES=[];`) + `localStorage.setItem("tutorial:draft","1");localStorage.setItem("tutorial:luta","1");localStorage.setItem("jxj:treino","1");localStorage.setItem("luta:3d",${JSON.stringify(process.env.SEM3D === "1" ? "0" : "1")});`;
  const bloquear = ["*supabase.co*", "*octogono.fun/api*", "*draft-ufc.vercel.app*", "*vercel*"];
  A = await C.aba({ width: Number(process.env.A_W || 1280), height: Number(process.env.A_H || 800) }, { bloquear, inicio });
  B = await C.aba({ width: Number(process.env.B_W || 390), height: Number(process.env.B_H || 844), isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, { bloquear, inicio });
  /* cada aba entra como uma conta de teste (token "tok:<id>" do servidor local) e cria o lutador */
  const entrar = async (p, uid, nome, estilo, fila = true) => {
    await p.ir(BASE + "#/menu");
    return p.avaliar(async (uid, nome, estilo, fila) => {
      meuAccessToken = async () => "tok:" + uid;
      sessaoAtual = async () => { USUARIO_ID = uid; return { user: { id: uid, email: uid.slice(0, 6) + "@teste" }, access_token: "tok:" + uid }; };
      atualizarStatusPro = async () => { meuPro = true; }; if (typeof reconferirPro === "function") reconferirPro = async () => true; meuPro = true;
      await jxj("criar", { nome, estilo, categoria: "lightweight", rosto: { ...cfgPadrao(), cabelo: 2, barba: 3, entrada: 1 } });
      const l = (await jxj("estado")).lutadores[0];
      if (fila) await jxj("filaEntrar", { lutadorId: l.id });
      return l.id;
    }, uid, nome, estilo, fila);
  };
  if (!ARVORE) { await entrar(A, ua, "Kayo Brasa", "striker"); await entrar(B, ub, "Davi Rocha", "wrestler"); }
  else {
    const la = await entrar(A, ua, "Kayo Brasa", "striker", false), lb = await entrar(B, ub, "Davi Rocha", "wrestler", false);
    const noCarta = ARV.RAMOS.boxe.nos[3].id, bA = buildArvore("striker", noCarta), bB = buildArvore("wrestler");
    for (const [id, b] of [[la, bA], [lb, bB]]) await post("teste/sql", { sql: "update jxj_lutadores set nivel = 30, build = $1::jsonb where id = $2", params: [JSON.stringify(b), id] });
    /* a aba A abre a árvore, soma o último nó do boxe e salva: a carta chega */
    await A.ir(BASE + "#/menu"); await A.avaliar((h) => { location.hash = h; }, `#/jxj/lutador/${la}/arvore`); await esperar(2500);
    const clicou = await A.avaliar(async (nome) => {
      const w = (ms) => new Promise((r) => setTimeout(r, ms)), bt = (t) => [...document.querySelectorAll("button")].find((b) => b.textContent.includes(t) && !b.disabled);
      const no = [...document.querySelectorAll(".jxj-no")].find((b) => b.textContent.includes(nome)); if (!no) return "sem nó";
      no.click(); await w(400); const mais = bt("Somar 1 nível"); if (!mais) return "sem botão somar"; mais.click(); await w(400);
      const sv = bt("Salvar árvore"); if (!sv) return "sem botão salvar"; sv.click(); await w(1500); return "ok";
    }, ARV.NOS[noCarta].nome);
    log.push("árvore: " + clicou);
    const chegou = await A.avaliar(() => { const c = document.querySelector(".carta-chegou"); return c ? c.innerText.replace(/\s+/g, " ").slice(0, 120) : ""; });
    log.push("camada da carta nova: " + (chegou || "NÃO APARECEU"));
    await esperar(1200); await A.foto("arvore-1-carta-chegando.png");
    await A.avaliar(() => { const v = [...document.querySelectorAll(".carta-chegou button")].find((b) => b.textContent.includes("Ver no deck")); v && v.click(); }); await esperar(1500);
    await A.foto("arvore-2-aba-deck.png");
    const bFinal = { ...bA, [noCarta]: 1 };
    const dA = deckArvore("striker", bFinal), dB = deckArvore("wrestler", bB);
    log.push("deck A: " + dA.join(",")); log.push("deck B: " + dB.join(","));
    await A.avaliar(async (lid, d) => jxj("deck", { lutadorId: lid, deck: d }), la, dA);
    await B.avaliar(async (lid, d) => jxj("deck", { lutadorId: lid, deck: d }), lb, dB);
    await A.avaliar(async (lid) => jxj("filaEntrar", { lutadorId: lid }), la); await B.avaliar(async (lid) => jxj("filaEntrar", { lutadorId: lid }), lb);
  }
  const par = await A.avaliar(async () => jxj("fila"));
  const lid = par && par.luta && par.luta.id;
  if (!lid) throw new Error("o par não se formou: " + JSON.stringify(par).slice(0, 200));
  await A.avaliar(async (lid) => jxj("confirmar", { lutaId: lid }), lid);
  await B.avaliar(async (lid) => jxj("confirmar", { lutaId: lid }), lid);
  for (const p of [A, B]) await p.avaliar((h) => { location.hash = h; }, "#/jxj/luta/" + lid);
  /* DUELO_MS: o duelo das cartas fica mais tempo na tela, pra foto pegar mais casos (o 3D ganha menos tempo) */
  if (process.env.DUELO_MS) for (const p of [A, B]) await p.avaliar((ms) => { JXJ_DUELO_MS = ms; }, Number(process.env.DUELO_MS));
  await esperar(5000);
  const viu = { v2: 0, linha: 0, velDano: 0, deck: false, telaCheia: 0, vidaDesceu: false, chao: false };
  const n3d = {}, ult3d = {}, jogadas = { A: 0, B: 0 }, fim = { A: false, B: false };
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
          chao: !!q(".jxj-na-mao .jxj-c2-origem"), revelada: !!q(".jxj-revelada"), etapa: (q(".v2-comando") || { className: "" }).className.split(" ").find((c) => c.startsWith("etapa-")) || "",
          largura: document.documentElement.scrollWidth > innerWidth + 1 ? document.documentElement.scrollWidth : 0, cartas: document.querySelectorAll(".jxj-postura:not([disabled]),.jxj-acao:not([disabled])").length,
          vida: [vida("a"), vida("b")], round: (q(".jxj-round") || {}).textContent || "",
          duelo: ((q(".jxj-mesa.v2-duelo") || { className: "" }).className.split(" ").find((c) => c.startsWith("duelo-")) || "") };
      });
      /* o duelo das cartas (decisão 92): espera a animação acabar e tira a foto do estado final, uma por caso;
         confere que as cartas não cobrem a linha de situação nem saem da tela */
      if (st.duelo && !fotos.has(nome + st.duelo)) {
        const fim = await p.avaliar(async () => {
          const w = (ms) => new Promise((r) => setTimeout(r, ms)), t0 = Date.now();
          const anims = () => document.getAnimations().filter((a) => String(a.animationName || "").startsWith("jxjDuelo"));
          while (Date.now() - t0 < 2500 && document.querySelector(".jxj-mesa.v2-duelo") && anims().some((a) => a.playState !== "finished")) await w(100);
          await w(120);
          const m = document.querySelector(".jxj-mesa.v2-duelo"); if (!m) return null;
          const cartas = [...m.querySelectorAll(".v2-duelo-carta")].map((c) => c.getBoundingClientRect()), sit = document.querySelector(".v2-situacao");
          const rs = sit ? sit.getBoundingClientRect() : null;
          const cobre = !!rs && cartas.some((r) => r.top < rs.bottom && r.bottom > rs.top && r.left < rs.right && r.right > rs.left);
          const fora = cartas.some((r) => r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight);
          /* a mão presa no pé da tela (sem o 3D) não pode ficar por cima das cartas */
          const z = document.querySelector(".jxj-combate .jxj-zona-acao"), vis = z && getComputedStyle(z).visibility !== "hidden";
          const rz = vis ? [...z.querySelectorAll(".v2-comando, .jxj-mao-luta")].map((x) => x.getBoundingClientRect()).filter((r) => r.height > 0) : [];
          const cobreMao = cartas.some((r) => rz.some((q) => r.bottom > q.top + 1 && r.top < q.bottom));
          const lados = [...m.querySelectorAll(".jxj-mesa-lado")].map((x) => x.id), estados = [...m.querySelectorAll(".v2-duelo-carta")].map((c) => c.className.replace("jxj-revelada v2-duelo-carta ", ""));
          const rmesa = m.getBoundingClientRect(), se = document.scrollingElement;
          return { rolar: [Math.round(scrollY), se ? se.scrollHeight - innerHeight : null, Math.round(rmesa.top), Math.round(rmesa.bottom), rz.map((q) => Math.round(q.top))].join(" "), cobre, cobreMao, fora, lados, estados, setas: !!m.querySelector(".jxj-mesa-vs, .v2-seta"), larg: Math.round(cartas[0] ? cartas[0].width : 0) };
        });
        if (fim) {
          fotos.add(nome + st.duelo); viu.duelo = (viu.duelo || 0) + 1;
          await p.foto(`${nome}-${st.duelo}.png`);
          log.push(`${nome} ${st.duelo}: ${JSON.stringify(fim)}`);
          if (fim.cobre || fim.cobreMao || fim.fora || fim.setas || fim.lados[0] !== "jxj-mesa-eu") viu.dueloRuim = `${nome} ${st.duelo}: ${JSON.stringify(fim)}`;
        }
      }
      if (st.res) { fim[nome] = true; await p.foto(`${nome}-resultado.png`); log.push(`${nome}: resultado`); continue; }
      if (st.fimCena) { await esperar(700); await p.foto(`${nome}-cena-fim.png`); await p.avaliar(() => { const x = document.querySelector(".jxj-fim-seguir"); x && x.click(); }); await esperar(1500); continue; }
      if (ARVORE && st.assist && !ult3d[nome] && (n3d[nome] || 0) < 5) { /* o 3D começou a trocar: 5 fotos seguidas, a cada 0,7 s */
        ult3d[nome] = true; n3d[nome] = (n3d[nome] || 0) + 1;
        for (let k = 1; k <= 5; k++) { await esperar(700); await p.foto(`${nome}-3d-r${n3d[nome]}-${k}.png`); }
      }
      if (!st.assist) ult3d[nome] = false;
      if (st.v2) viu.v2++;
      if (st.cheia) viu.telaCheia++;
      if (st.velDano) viu.velDano++;
      if (st.vida.some((x) => x != null && x < 100)) viu.vidaDesceu = true;
      if (st.largura) viu.rolagem = `${nome}: ${st.largura} px de largura`;
      if (st.revelada && !st.assist && !fotos.has(nome + "revelacao")) { fotos.add(nome + "revelacao"); await p.foto(`${nome}-revelacao.png`); }
      if (st.linha) { viu.linha++; if (!fotos.has(nome + "porque")) { fotos.add(nome + "porque"); await p.foto(`${nome}-porque.png`); } }
      if (st.chao && !st.assist && !fotos.has(nome + "chao")) { fotos.add(nome + "chao"); viu.chao = true; await p.foto(`${nome}-chao.png`); }
      if (!st.assist && st.cartas) {
        if (!fotos.has(nome + "escolha")) { fotos.add(nome + "escolha"); await p.foto(`${nome}-escolha.png`); }
        if (st.etapa && !fotos.has(nome + st.etapa)) { fotos.add(nome + st.etapa); await p.foto(`${nome}-${st.etapa === "etapa-sinal" ? "postura" : "carta"}.png`); }
        /* o deck dele, uma vez em cada aba */
        if (jogadas[nome] === 2 && !fotos.has(nome + "deck")) {
          fotos.add(nome + "deck");
          await p.avaliar(() => { const b = document.querySelector(".v2-btn-deck"); b && b.click(); }); await esperar(500);
          viu.deck = viu.deck || (await p.avaliar(() => { const d = document.getElementById("jxj-deck-dele"); return !!(d && !d.hidden && d.querySelectorAll(".jxj-c2").length >= 4); }));
          await p.foto(`${nome}-deck-dele.png`);
          await p.avaliar(() => { const b = document.querySelector(".v2-btn-deck"); b && b.click(); });
        }
        await p.avaliar((k, arv) => { const bs = [...document.querySelectorAll(".jxj-postura:not([disabled]), .jxj-acao:not([disabled])")]; const nova = ARVORE_NOMES.length ? bs.filter((b) => ARVORE_NOMES.some((n) => b.textContent.toLowerCase().includes(n))) : []; const l = nova.length ? nova : bs; if (l.length) l[k % l.length].click(); }, jogadas[nome]++);
        /* no toque, o primeiro toque só mostra a carta grande: foto (uma da postura, uma da carta) e o Confirmar */
        const focoAberto = await p.avaliar(() => { const f = document.querySelector(".v2-foco"); return !!(f && !f.hidden && f.querySelector(".v2-confirmar")); });
        if (focoAberto) {
          viu.foco = (viu.foco || 0) + 1;
          if (!fotos.has(nome + "tocada" + st.etapa)) { fotos.add(nome + "tocada" + st.etapa); await esperar(300); await p.foto(`${nome}-tocada-${st.etapa === "etapa-sinal" ? "postura" : "carta"}.png`); }
          await p.avaliar(() => { const b = document.querySelector(".v2-foco .v2-confirmar"); b && b.click(); });
        }
      }
    }
    await esperar(600);
  }
  log.push(`jogadas A ${jogadas.A}, B ${jogadas.B}; consultas v2 ${viu.v2}, tela cheia ${viu.telaCheia}, linha do porquê ${viu.linha}, cartas com vel e dano ${viu.velDano}; deck dele abriu ${viu.deck}; vida desceu ${viu.vidaDesceu}; carta do chão ${viu.chao}; carta grande no toque ${viu.foco || 0}; rolagem lateral ${viu.rolagem || "nenhuma"}; duelos fotografados ${viu.duelo || 0}${viu.dueloRuim ? "; DUELO RUIM " + viu.dueloRuim : ""}`);
  const ok = fim.A && fim.B && viu.v2 > 0 && viu.linha > 0 && viu.velDano > 0 && viu.deck && (viu.telaCheia > 0 || process.env.SEM3D === "1") && viu.foco > 0 && !viu.rolagem && viu.duelo > 0 && !viu.dueloRuim && !A.erros.length && !B.erros.length;
  console.log(log.join("\n"));
  console.log(A.erros.length || B.erros.length ? "ERROS " + [...A.erros, ...B.erros].slice(0, 6).join(" | ") : "sem erro na página");
  console.log(ok ? "ok" : "REPROVOU");
  process.exitCode = ok ? 0 : 1;
} catch (e) { console.log(log.join("\n")); console.log("FALHA " + e.message); process.exitCode = 1; }
finally { if (C) C.fechar(); srv.kill(); setTimeout(() => process.exit(process.exitCode || 0), 300); }
