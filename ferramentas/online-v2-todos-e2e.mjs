/* O Online de cartas (combate v2) ligado pra TODOS (flag combate_v2 = true, supabase_jxj_v2_todos.sql),
   num Chrome de verdade, sem tocar em produção: servidor local (ferramentas/servidor-local.mjs, PGlite,
   banco novo a cada fase) com a conta dos bots configurada. Contas NOVAS, sem nenhuma lista de contas na
   flag. Cada fase cabe em menos de 9 minutos:

   FASE=nova (padrão): conta Pro nova pela tela. Painel sem lutador, criação nos 4 passos, cai no treino de
   cartas, o treino inteiro, o deck padrão, a árvore (somar o primeiro nó, salvar, a carta chega, Ver no
   deck, pôr a carta nova, salvar: deck montado), busca com o bot oferecido, luta contra o bot até o fim
   jogando as cartas (com o deck montado, conferido no banco), resultado com rating e XP, voltar ao painel,
   o deck padrão de volta pelo botão.
   FASE=fila: duas contas novas (uma Pro, uma grátis) entram na busca pela tela, o par sai, as duas
   confirmam, a luta inteira nas duas abas até o resultado (v2 no banco), rating e XP dos dois, revanche
   (o grátis não tem; o Pro pede), depois o grátis sem a luta do dia: o painel oferece o bot com o limite
   (5 hoje), cinco lutas contra bot (abandonadas, o caminho rápido), a sexta recusada e o botão travado,
   a busca com o cadeado e o que o Pro libera; e o Pro com o bot sem contagem.
   FASE=antigo: lutador criado com a flag desligada (combate de antes), com nível 6, build antiga e uma
   luta v1 no histórico; a flag liga e ele abre na v2: painel manda pro treino de cartas, árvore com as
   cartas dos nós que ele já tem, deck padrão válido com as cartas liberadas, o replay da luta v1 abre, e
   a luta contra o bot é v2 (algumas trocas e Abandonar pela tela).

   Confere em todas: nenhum erro na página, nenhuma rolagem lateral, e os textos do Online de cartas
   (painel, busca, tela antes da luta, árvore) sem as frases do combate de antes.

   Mesmo molde de ferramentas/online-v2-e2e.mjs (cliente mínimo do protocolo de depuração do Chrome,
   Chrome do sistema, a IA de produção e o Supabase bloqueados). SEM3D=0 liga o 3D (padrão: só cartas).

   Uso: [FASE=nova|fila|antigo] [PORTA=8861] node ferramentas/online-v2-todos-e2e.mjs <pasta das fotos> */
import { spawn } from "node:child_process"; import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { fileURLToPath } from "node:url";
const FASE = process.env.FASE || "nova";
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), PORTA = Number(process.env.PORTA || 8861), BASE = `http://127.0.0.1:${PORTA}/`;
const OUT = path.resolve(process.argv[2] || "online-v2-todos"); fs.mkdirSync(OUT, { recursive: true });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join(RAIZ, "ferramentas", "servidor-local.mjs"), String(PORTA)], { stdio: "ignore" });
const post = async (rota, corpo) => (await fetch(BASE + rota, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })).json();
const sql = async (q, params = []) => { const r = await post("teste/sql", { sql: q, params }); if (!r.linhas) throw new Error("sql: " + JSON.stringify(r).slice(0, 200)); return r.linhas; };
for (let i = 0; i < 150; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await esperar(200); }

async function chrome(porta = 9361) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v2-todos-e2e-"));
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

const log = [], ruins = [];
const conferir = (ok, txt) => { log.push((ok ? "ok   " : "RUIM ") + txt); if (!ok) ruins.push(txt); };
/* frases do combate de antes que não podem aparecer pra quem joga cartas */
const VELHAS = [/escolhem a ação/i, /Defender automático/i, /Mão por round/i, /acertar a leitura vale/i, /continua só no combate de antes/i];
const velhaEm = (t) => VELHAS.filter((r) => r.test(t || "")).map(String);
let C = null;

/* a aba entra como a conta de teste (token "tok:<id>" do servidor local); pro = o que a tela acha do Pro */
async function entrar(p, uid, pro) {
  await p.ir(BASE + "#/menu");
  await p.avaliar((uid, pro) => {
    meuAccessToken = async () => "tok:" + uid;
    sessaoAtual = async () => { USUARIO_ID = uid; return { user: { id: uid, email: uid.slice(0, 6) + "@teste" }, access_token: "tok:" + uid }; };
    atualizarStatusPro = async () => { meuPro = pro; }; if (typeof reconferirPro === "function") reconferirPro = async () => pro; meuPro = pro;
  }, uid, pro);
}
/* o mesmo endereço não dispara a rota de novo: passa pelo menu antes */
const irHash = async (p, h, ms = 2500) => {
  if ((await p.avaliar(() => location.hash)) === h) { await p.avaliar(() => { location.hash = "#/menu"; }); await esperar(300); }
  await p.avaliar((h) => { location.hash = h; }, h); await esperar(ms);
};
const texto = (p) => p.avaliar(() => document.body.innerText);
const largura = (p) => p.avaliar(() => (document.documentElement.scrollWidth > innerWidth + 1 ? document.documentElement.scrollWidth : 0));
const clicarTexto = (p, t, sel = "button") => p.avaliar((t, sel) => { const b = [...document.querySelectorAll(sel)].find((x) => x.textContent.includes(t) && !x.disabled); if (b) b.click(); return !!b; }, t, sel);
async function esperarAte(p, fn, ms = 15000, ...args) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const r = await p.avaliar(fn, ...args).catch(() => null); if (r) return r; await esperar(250); } return null; }
async function telaLimpa(p, nome) {
  const t = await texto(p), v = velhaEm(t), w = await largura(p);
  conferir(!v.length, `${nome}: sem texto do combate de antes${v.length ? " (" + v.join(", ") + ")" : ""}`);
  conferir(!w, `${nome}: sem rolagem lateral${w ? " (" + w + " px)" : ""}`);
  await p.foto(`${FASE}-${nome.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`);
}

/* o treino de cartas pela tela: Continuar ou a carta pedida (no toque, o Confirmar) até o fim */
async function fazerTreino(p) {
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    const st = await p.avaliar(() => ({ fim: !!document.querySelector(".jxj-treino-fim"), cont: !!document.querySelector(".jxj-treino-continuar"),
      carta: !!document.querySelector(".jxj-mao-luta .jxj-na-mao:not([disabled])") }));
    if (st.fim) return true;
    if (st.cont) await p.avaliar(() => document.querySelector(".jxj-treino-continuar").click());
    else if (st.carta) {
      await p.avaliar(() => document.querySelector(".jxj-mao-luta .jxj-na-mao:not([disabled])").click()); await esperar(350);
      await p.avaliar(() => { const b = document.querySelector(".v2-foco:not([hidden]) .v2-confirmar"); b && b.click(); });
    }
    await esperar(700);
  }
  return false;
}

/* joga a luta pela tela até o resultado: a carta ligada que aparece (no toque, o Confirmar), a cena do fim, Seguir.
   paraEm: número de jogadas depois do qual para (pra abandonar). Devolve {fim, jogadas, v2, viuVida} */
async function jogarLuta(p, { ms = 420000, paraEm = Infinity } = {}) {
  const t0 = Date.now(); let jogadas = 0, v2 = 0, viuVida = false;
  while (Date.now() - t0 < ms) {
    const st = await p.avaliar(() => {
      const cb = document.getElementById("jxj-combate"), q = (s) => document.querySelector(s);
      const b = (l) => { const x = document.getElementById("jxj-vida-" + l); return x ? Number(x.dataset.vida) : null; };
      return { res: !!q(".jxj-resultado"), fimCena: !!q(".jxj-fim"), v2: !!(cb && cb.classList.contains("v2")), assist: !!(cb && cb.classList.contains("assistindo")),
        conf: !!q(".jxj-versus"), vida: [b("a"), b("b")],
        cartas: document.querySelectorAll(".jxj-postura:not([disabled]),.jxj-acao:not([disabled])").length };
    }).catch(() => ({}));
    if (st.res) return { fim: true, jogadas, v2, viuVida };
    if (st.v2) v2++;
    if ((st.vida || []).some((x) => x != null && x < 100)) viuVida = true;
    if (st.fimCena) { await esperar(700); await p.avaliar(() => { const x = document.querySelector(".jxj-fim-seguir"); x && x.click(); }); await esperar(1500); continue; }
    if (st.conf) { await clicarTexto(p, "Confirmar a luta"); await esperar(1000); continue; }
    if (!st.assist && st.cartas) {
      if (jogadas >= paraEm) return { fim: false, jogadas, v2, viuVida };
      await p.avaliar((k) => { const bs = [...document.querySelectorAll(".jxj-postura:not([disabled]), .jxj-acao:not([disabled])")]; if (bs.length) bs[k % bs.length].click(); }, jogadas++);
      await esperar(250);
      await p.avaliar(() => { const b = document.querySelector(".v2-foco:not([hidden]) .v2-confirmar"); b && b.click(); });
    }
    await esperar(600);
  }
  return { fim: false, jogadas, v2, viuVida };
}
/* duas abas jogando a mesma luta, alternando */
async function jogarDuas(pA, pB, ms = 420000) {
  const t0 = Date.now(), fim = { A: false, B: false }, n = { A: 0, B: 0 };
  while (Date.now() - t0 < ms && !(fim.A && fim.B)) {
    for (const [k, p] of [["A", pA], ["B", pB]]) {
      if (fim[k]) continue;
      const r = await jogarLuta(p, { ms: 1500 });
      fim[k] = r.fim; n[k] += r.jogadas;
    }
  }
  return { fim, n };
}

const inicioBase = (extra = "") => `localStorage.setItem("tutorial:draft","1");localStorage.setItem("tutorial:luta","1");localStorage.setItem("jxj:treino","1");localStorage.setItem("luta:3d",${JSON.stringify(process.env.SEM3D === "0" ? "1" : "0")});${extra}`;
const bloquear = ["*supabase.co*", "*octogono.fun/api*", "*draft-ufc.vercel.app*", "*vercel*"];
const DESK = { width: 1280, height: 800 }, CEL = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

try {
  /* a conta dos bots e a flag pra todos */
  const contaBots = (await post("teste/usuario", { pro: false })).id;
  await sql("select public.jxj_bot_configurar($1) as r", [contaBots.slice(0, 8) + "@teste"]);
  const ligarTodos = async () => { const r = await sql("update jxj_config set valor = 'true'::jsonb where chave = 'combate_v2' returning valor"); conferir(r.length === 1 && r[0].valor === true, "flag combate_v2 = true (pra todos)"); };
  C = await chrome();

  if (FASE === "nova") {
    await ligarTodos();
    const uid = (await post("teste/usuario", { pro: true })).id;
    const p = await C.aba(DESK, { bloquear, inicio: inicioBase(`localStorage.removeItem("jxj:treino2");`) });
    await entrar(p, uid, true);
    await irHash(p, "#/jxj");
    await telaLimpa(p, "painel sem lutador");
    conferir(await clicarTexto(p, "Criar meu lutador"), "painel sem lutador: botão Criar meu lutador");
    await esperar(1500);
    await p.avaliar(() => { const i = document.getElementById("jxj-nome"); i.value = "Kayo Brasa"; i.dispatchEvent(new Event("input")); });
    await clicarTexto(p, "Próximo: categoria"); await esperar(1200);
    await p.avaliar(() => { const b = [...document.querySelectorAll(".jxj-opcao")].find((x) => x.textContent.includes("Leve")) || document.querySelector(".jxj-opcao"); b.click(); }); await esperar(1200);
    await telaLimpa(p, "criar estilo");
    await p.avaliar(() => { const b = [...document.querySelectorAll(".jxj-estilo")].find((x) => x.textContent.includes("Striker")) || document.querySelector(".jxj-estilo"); b.click(); }); await esperar(1200);
    await telaLimpa(p, "criar confirmar");
    await clicarTexto(p, "Criar lutador");
    const noTreino = await esperarAte(p, () => location.hash.startsWith("#/jxj/treino") && !!document.querySelector(".jxj-combate.v2") && !!document.querySelector(".jxj-treino-balao"), 15000);
    conferir(!!noTreino, "depois de criar: cai no treino de cartas");
    await p.foto("nova-treino-inicio.png");
    conferir(await fazerTreino(p), "treino de cartas até o fim");
    conferir((await p.avaliar(() => localStorage.getItem("jxj:treino2"))) === "1", "treino de cartas marcado (jxj:treino2)");
    await p.foto("nova-treino-fim.png");
    let est = await p.avaliar(() => jxj("estado"));
    const l = est.lutadores[0];
    conferir(est.combateV2 === true, "estado: combateV2 true pra conta nova (sem lista)");
    const def = await p.avaliar(() => jxjDef());
    conferir(JSON.stringify(l.deck) === JSON.stringify(def.combate2.deckPadrao[l.estilo]) && l.deckMontado === false, "conta nova: deck padrão do estilo");
    conferir(est.bot && est.bot.disponivel && est.bot.restantes == null, "Pro: bot disponível sem contagem");
    /* a árvore: o primeiro nó do primeiro ramo libera a carta */
    await irHash(p, `#/jxj/lutador/${l.id}/arvore`);
    await telaLimpa(p, "arvore");
    const ramo = def.estilos[l.estilo].ramos[0], no = def.ramos[ramo].nos[0];
    const carta = Object.values(def.combate2.cartas).find((c) => c.no === no.id);
    const arv = await p.avaliar(async (nome) => {
      const w = (ms) => new Promise((r) => setTimeout(r, ms)), bt = (t) => [...document.querySelectorAll("button")].find((b) => b.textContent.includes(t) && !b.disabled);
      const n = [...document.querySelectorAll(".jxj-no")].find((b) => b.textContent.includes(nome)); if (!n) return "sem nó";
      n.click(); await w(400);
      const det = document.querySelector(".jxj-no-detalhe").innerText;
      const mais = bt("Somar 1 nível"); if (!mais) return "sem somar"; mais.click(); await w(400);
      const sv = bt("Salvar árvore"); if (!sv) return "sem salvar"; sv.click(); await w(1800);
      return { det, chegou: !!document.querySelector(".carta-chegou") };
    }, no.nome);
    conferir(arv && arv.chegou, `árvore: somar ${no.nome} e salvar traz a carta ${carta && carta.nome} (${JSON.stringify(arv).slice(0, 80)})`);
    conferir(arv && arv.det && /com cartas/i.test(arv.det) && arv.det.toLowerCase().includes(carta.nome.toLowerCase()), "árvore: o detalhe do nó diz a carta que ele libera");
    await p.foto("nova-carta-chegou.png");
    await clicarTexto(p, "Ver no deck"); await esperar(2000);
    await telaLimpa(p, "deck");
    const nova = await p.avaliar((id) => !!document.querySelector(`.jxj-deck-slot.nova[data-carta="${id}"]`), carta.id);
    conferir(nova, "deck: a carta nova aparece marcada como Nova");
    /* troca uma carta sua pela nova e salva */
    const salvo = await p.avaliar(async (id) => {
      const w = (ms) => new Promise((r) => setTimeout(r, ms));
      const tirar = document.querySelector(".jxj-deck-tirar"); if (!tirar) return "sem tirar"; tirar.click(); await w(300);
      const por = document.querySelector(`.jxj-deck-por[data-carta="${id}"]`); if (!por || por.disabled) return "sem pôr"; por.click(); await w(300);
      const sv = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Salvar deck") && !b.disabled); if (!sv) return "sem salvar"; sv.click(); await w(1800);
      return "ok";
    }, carta.id);
    est = await p.avaliar(() => jxj("estado"));
    const l2 = est.lutadores[0];
    conferir(salvo === "ok" && l2.deckMontado === true && l2.deck.includes(carta.id), `deck montado salvo com a carta nova (${salvo})`);
    /* a busca: só ele na fila, o bot aparece; luta contra o bot até o fim */
    await irHash(p, "#/jxj");
    await telaLimpa(p, "painel com lutador");
    const comoGanhar = await p.avaliar(() => !!document.getElementById("jxj-link-regras2"));
    conferir(comoGanhar, "painel: link Como ganhar do Online de cartas");
    await clicarTexto(p, "Buscar adversário"); await esperar(1500);
    conferir((await p.avaliar(() => location.hash)) === "#/jxj/fila", "Buscar adversário abre a busca (treino feito)");
    const oferta = await esperarAte(p, () => !!document.querySelector(".jxj-oferta-bot .jxj-botao-bot"), 15000);
    await telaLimpa(p, "busca");
    conferir(!!oferta, "busca: oferta do bot com só ele na fila");
    await p.avaliar(() => document.querySelector(".jxj-oferta-bot .jxj-botao-bot").click());
    const naLuta = await esperarAte(p, () => location.hash.startsWith("#/jxj/luta/") && !!document.querySelector(".jxj-combate.v2"), 15000);
    conferir(!!naLuta, "luta contra bot abre na v2");
    const lutaId = await p.avaliar(() => location.hash.split("/").pop());
    const banco = await sql("select (estado->>'cv') as cv, perfis->'a'->'deck' as deck, bot is not null as bot from jxj_lutas where id = $1", [lutaId]);
    conferir(banco[0] && banco[0].cv === "2" && banco[0].bot, "luta contra bot: estado v2 no banco");
    conferir(banco[0] && JSON.stringify(banco[0].deck) === JSON.stringify(l2.deck), `luta contra bot: o deck montado entrou na luta (${JSON.stringify(banco[0] && banco[0].deck)} x ${JSON.stringify(l2.deck)})`);
    await p.foto("nova-bot-luta.png");
    const r = await jogarLuta(p);
    conferir(r.fim, `luta contra bot até o resultado (${r.jogadas} cartas jogadas)`);
    conferir(r.viuVida, "luta contra bot: a barra de vida desceu");
    await p.foto("nova-bot-resultado.png");
    await telaLimpa(p, "resultado bot");
    const res = await p.avaliar(() => { const t = document.querySelector(".jxj-resultado").closest(".jxj-area").innerText; return { rating: /Rating\s*\n?\s*[+-]\d+/i.test(t), xp: /XP\s*\n?\s*\+\d+/i.test(t), t: t.slice(0, 300) }; });
    conferir(res.rating && res.xp, `resultado: rating e XP (${res.t.replace(/\s+/g, " ").slice(0, 120)})`);
    est = await p.avaliar(() => jxj("estado"));
    const l3 = est.lutadores[0];
    conferir(l3.xp > 0 && Math.round(l3.rating) !== 1500, `depois da luta: XP ${l3.xp}, rating ${Math.round(l3.rating)}, cartel ${l3.vitorias}-${l3.derrotas}`);
    conferir(await clicarTexto(p, "Voltar ao painel"), "resultado: Voltar ao painel");
    await esperar(3000);
    const ult = await p.avaliar(() => /Último resultado/i.test(document.body.innerText) && /Vitória|Derrota|Empate/i.test(document.body.innerText));
    conferir(ult, "painel: último resultado da luta");
    /* o deck padrão de volta pelo botão */
    await irHash(p, `#/jxj/lutador/${l.id}/deck`);
    await clicarTexto(p, "Usar o deck padrão"); await esperar(2000);
    est = await p.avaliar(() => jxj("estado"));
    conferir(est.lutadores[0].deckMontado === false, "Usar o deck padrão volta pro padrão");
    if (p.erros.length) ruins.push("erros na página: " + p.erros.slice(0, 3).join(" | "));
  }

  if (FASE === "fila") {
    await ligarTodos();
    const ua = (await post("teste/usuario", { pro: true })).id, ug = (await post("teste/usuario", { pro: false })).id;
    const inicio = inicioBase(`localStorage.setItem("jxj:treino2","1");`);
    const A = await C.aba(DESK, { bloquear, inicio }), G = await C.aba(CEL, { bloquear, inicio });
    await entrar(A, ua, true); await entrar(G, ug, false);
    for (const [p, nome, estilo] of [[A, "Kayo Brasa", "striker"], [G, "Davi Rocha", "wrestler"]])
      await p.avaliar(async (nome, estilo) => jxj("criar", { nome, estilo, categoria: "lightweight", rosto: { ...cfgPadrao(), cabelo: 2, barba: 3 } }), nome, estilo);
    let eg = await G.avaliar(() => jxj("estado"));
    conferir(eg.combateV2 === true && eg.bot && eg.bot.restantes === 5, `grátis novo: v2 e 5 lutas contra bot hoje (${eg.bot && eg.bot.restantes})`);
    await irHash(G, "#/jxj");
    await telaLimpa(G, "painel gratis");
    /* as duas na busca pela tela */
    await irHash(A, "#/jxj/fila", 500); await irHash(G, "#/jxj/fila", 500);
    const parA = await esperarAte(A, () => location.hash.startsWith("#/jxj/luta/"), 30000), parG = await esperarAte(G, () => location.hash.startsWith("#/jxj/luta/"), 30000);
    conferir(!!parA && !!parG, "fila: o par sai entre a conta Pro e a grátis");
    await esperar(1500);
    await telaLimpa(A, "antes da luta");
    const lutaId = await A.avaliar(() => location.hash.split("/").pop());
    const j = await jogarDuas(A, G);
    conferir(j.fim.A && j.fim.B, `luta entre as duas contas até o resultado nas duas abas (cartas ${j.n.A} e ${j.n.B})`);
    const banco = await sql("select (estado->>'cv') as cv, status, com_rating from jxj_lutas where id = $1", [lutaId]);
    conferir(banco[0] && banco[0].cv === "2" && banco[0].status === "encerrada", `luta entre contas: v2 e encerrada no banco (${JSON.stringify(banco[0])})`);
    await A.foto("fila-A-resultado.png"); await G.foto("fila-G-resultado.png");
    await telaLimpa(A, "resultado A"); await telaLimpa(G, "resultado G");
    const ea = await A.avaliar(() => jxj("estado")); eg = await G.avaliar(() => jxj("estado"));
    conferir(ea.lutadores[0].xp > 0 && eg.lutadores[0].xp > 0, `XP dos dois (${ea.lutadores[0].xp} e ${eg.lutadores[0].xp})`);
    conferir(Math.round(ea.lutadores[0].rating) !== 1500 && Math.round(eg.lutadores[0].rating) !== 1500 || !banco[0].com_rating, `rating dos dois (${Math.round(ea.lutadores[0].rating)} e ${Math.round(eg.lutadores[0].rating)})`);
    conferir(eg.lutaGratisUsada === true, "grátis: a luta do dia contra gente foi usada");
    /* revanche: o grátis pede e o servidor responde; o Pro pede */
    const revG = await G.avaliar(async (lid) => { try { return JSON.stringify(await jxj("revanche", { lutaId: lid })); } catch (e) { return "erro: " + e.erro; } }, lutaId);
    log.push("revanche pedida pelo grátis: " + revG);
    conferir(/erro: .*Pro/.test(revG), "revanche: o pedido do grátis é recusado na hora (é do Pro)");
    conferir(!(await G.avaliar(() => [...document.querySelectorAll("button")].some((b) => /revanche/i.test(b.textContent)))), "resultado do grátis: sem botão de revanche");
    const revA = await A.avaliar(async (lid) => { try { return JSON.stringify(await jxj("revanche", { lutaId: lid })); } catch (e) { return "erro: " + e.erro; } }, lutaId);
    conferir(/erro: .*Pro/.test(revA), `revanche: o Pro contra um grátis recebe o motivo na hora (${revA})`);
    const temRev = await A.avaliar(() => [...document.querySelectorAll("button")].some((b) => /revanche/i.test(b.textContent)));
    conferir(temRev, "resultado do Pro: botão de revanche");
    conferir(await clicarTexto(A, "Voltar ao painel"), "Pro: Voltar ao painel");
    await esperar(2500);
    /* grátis sem a luta do dia: o painel oferece o bot com o limite */
    await irHash(G, "#/jxj");
    await telaLimpa(G, "painel gratis sem luta do dia");
    const botG = await G.avaliar(() => { const b = document.querySelector(".jxj-buscar"); return b ? b.textContent : ""; });
    conferir(/Lutar contra bot \(5 hoje\)/.test(botG), `painel grátis: o botão é o bot com o limite (${botG})`);
    const lid = eg.lutadores[0].id;
    for (let k = 1; k <= 5; k++) {
      const x = await G.avaliar(async (lid) => { try { const r = await jxj("bot", { lutadorId: lid }); await jxj("abandonar", { lutaId: r.luta }); const v = await jxj("luta", { lutaId: r.luta }); return { ok: true, cv: v.combate, st: v.status }; } catch (e) { return { ok: false, erro: e.erro }; } }, lid);
      conferir(x.ok && x.cv === 2 && x.st === "encerrada", `grátis: luta ${k} contra bot (v2, ${JSON.stringify(x)})`);
    }
    const sexta = await G.avaliar(async (lid) => { try { await jxj("bot", { lutadorId: lid }); return "passou"; } catch (e) { return e.erro || "erro"; } }, lid);
    conferir(sexta !== "passou", `grátis: a sexta luta contra bot é recusada (${sexta})`);
    await irHash(G, "#/jxj");
    const trava = await G.avaliar(() => { const b = document.querySelector(".jxj-buscar"); return { off: !!(b && b.disabled), t: document.body.innerText.includes("já foram usadas") }; });
    conferir(trava.off && trava.t, "painel grátis: bot travado e o aviso do limite");
    await telaLimpa(G, "painel gratis sem bot");
    await irHash(G, "#/jxj/fila");
    const cad = await G.avaliar(() => ({ libera: !!document.querySelector(".jxj-pro-libera"), t: (document.querySelector(".jxj-pro-libera") || {}).innerText || "" }));
    conferir(cad.libera, "busca do grátis: o cadeado com o que o Pro libera");
    await telaLimpa(G, "busca gratis trava");
    /* o Pro: bot sem contagem */
    const eb = await A.avaliar(() => jxj("estado"));
    conferir(eb.bot && eb.bot.restantes == null && eb.pro, "Pro: bot sem limite");
    for (const [k, p] of [["A", A], ["G", G]]) if (p.erros.length) ruins.push(`erros na aba ${k}: ` + p.erros.slice(0, 3).join(" | "));
  }

  if (FASE === "antigo") {
    await sql("update jxj_config set valor = 'false'::jsonb where chave = 'combate_v2'");
    const uid = (await post("teste/usuario", { pro: true })).id;
    const p = await C.aba(DESK, { bloquear, inicio: inicioBase(`localStorage.removeItem("jxj:treino2");`) });
    await entrar(p, uid, true);
    const lid = await p.avaliar(async () => { const r = await jxj("criar", { nome: "Velho Lobo", estilo: "grappler", categoria: "lightweight", rosto: { ...cfgPadrao(), cabelo: 1 } }); return r.id; });
    let est = await p.avaliar(() => jxj("estado"));
    conferir(est.combateV2 === false, "flag desligada: conta no combate de antes");
    /* build antiga de nível 6: 8 pontos nos três primeiros nós do primeiro ramo do grappler */
    const def = await p.avaliar(() => jxjDef());
    const ramo = def.estilos.grappler.ramos[0], nos = def.ramos[ramo].nos;
    const build = { [nos[0].id]: 3, [nos[1].id]: 3, [nos[2].id]: 2 };
    await sql("update jxj_lutadores set nivel = 6, xp = $1, build = $2::jsonb, build_versao = 1 where id = $3", [600, JSON.stringify(build), lid]);
    /* uma luta do combate de antes no histórico (contra o bot, abandonada) */
    const v1 = await p.avaliar(async (lid) => { await jxj("filaEntrar", { lutadorId: lid }); const r = await jxj("bot", { lutadorId: lid }); await jxj("abandonar", { lutaId: r.luta }); const v = await jxj("luta", { lutaId: r.luta }); return { id: r.luta, cv: v.combate || 1, st: v.status }; }, lid);
    conferir(v1.cv !== 2 && v1.st === "encerrada", `luta do combate de antes no histórico (${JSON.stringify(v1)})`);
    await ligarTodos();
    est = await p.avaliar(() => jxj("estado"));
    const l = est.lutadores[0];
    const lib = Object.values(def.combate2.cartas).filter((c) => c.no && build[c.no]).map((c) => c.id);
    conferir(est.combateV2 === true, "flag ligada: a mesma conta agora no combate de cartas");
    conferir(lib.length > 0 && lib.every((id) => l.liberadas.includes(id)), `build antiga: as cartas dos nós dela liberadas (${lib.join(",")})`);
    conferir(l.deckMontado === false && l.deck.length === def.combate2.deck.tamanho, "build antiga: deck padrão válido");
    conferir(l.respecGratis === true, "build antiga: refazer a árvore de graça");
    await irHash(p, "#/jxj");
    await clicarTexto(p, "Buscar adversário"); await esperar(2500);
    const treino = await p.avaliar(() => location.hash.startsWith("#/jxj/treino") && !!document.querySelector(".jxj-combate.v2"));
    conferir(treino, "lutador antigo: a busca manda pro treino de cartas uma vez");
    conferir(await fazerTreino(p), "lutador antigo: treino de cartas até o fim");
    await irHash(p, `#/jxj/lutador/${lid}/arvore`);
    await telaLimpa(p, "arvore antiga");
    const cartasNaArvore = await p.avaliar(() => document.querySelectorAll(".jxj-no-v2.com-carta").length);
    conferir(cartasNaArvore >= 12, `árvore antiga: cada nó mostra a carta (${cartasNaArvore})`);
    await irHash(p, `#/jxj/lutador/${lid}/deck`);
    await telaLimpa(p, "deck antigo");
    const porLib = await p.avaliar((ids) => ids.every((id) => !!document.querySelector(`.jxj-deck-slot:not(.travada)[data-carta="${id}"]`)), lib);
    conferir(porLib, "deck antigo: as cartas da build antiga aparecem pra pôr no deck");
    await irHash(p, `#/jxj/replay/${v1.id}`, 3000);
    const rep = await p.avaliar(() => ({ ok: !!document.querySelector(".jxj-resultado"), t: document.body.innerText.slice(0, 80) }));
    conferir(rep.ok, "replay da luta do combate de antes abre");
    await p.foto("antigo-replay-v1.png");
    await irHash(p, "#/jxj/fila");
    const oferta = await esperarAte(p, () => !!document.querySelector(".jxj-oferta-bot .jxj-botao-bot"), 15000);
    conferir(!!oferta, "lutador antigo: oferta do bot");
    await p.avaliar(() => document.querySelector(".jxj-oferta-bot .jxj-botao-bot").click());
    await esperarAte(p, () => !!document.querySelector(".jxj-combate.v2"), 15000);
    const lutaId = await p.avaliar(() => location.hash.split("/").pop());
    const banco = await sql("select (estado->>'cv') as cv from jxj_lutas where id = $1", [lutaId]);
    conferir(banco[0] && banco[0].cv === "2", "lutador antigo: a luta contra o bot é v2");
    const r = await jogarLuta(p, { paraEm: 4, ms: 180000 });
    conferir(r.jogadas >= 4, `lutador antigo: ${r.jogadas} cartas jogadas`);
    await p.foto("antigo-luta-v2.png");
    await p.avaliar(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); document.querySelector(".jxj-abandonar").click(); await w(400);
      const b = [...document.querySelectorAll("button")].find((x) => /Abandonar a luta|Sim, abandonar|Abandonar$/.test(x.textContent.trim()) && !x.classList.contains("jxj-abandonar")); b && b.click(); });
    const fim = await esperarAte(p, () => !!document.querySelector(".jxj-resultado"), 20000);
    conferir(!!fim, "lutador antigo: Abandonar pela tela leva ao resultado");
    await telaLimpa(p, "resultado abandono");
    if (p.erros.length) ruins.push("erros na página: " + p.erros.slice(0, 3).join(" | "));
  }
  console.log(log.join("\n"));
  console.log(ruins.length ? "REPROVOU\n" + ruins.join("\n") : "ok");
  process.exitCode = ruins.length ? 1 : 0;
} catch (e) { console.log(log.join("\n")); console.log("FALHA " + (e && e.stack || e)); process.exitCode = 1; }
finally { if (C) C.fechar(); srv.kill(); setTimeout(() => process.exit(process.exitCode || 0), 300); }
