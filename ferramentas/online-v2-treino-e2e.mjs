/* Treino de cartas do Online (combate v2, 2026-11-18, spec docs/superpowers/specs/2026-11-18-online-v2-treino-design.md)
   num Chrome de verdade, sem tocar em produção: servidor local (ferramentas/servidor-local.mjs, PGlite) com a
   flag combate_v2 ligada só pra conta de teste. Três abas (1280 x 800 no mouse, 390 x 844 e 360 x 780 no toque),
   uma depois da outra. Em cada uma: a busca manda pro treino de cartas (sem jxj:treino2), o roteiro inteiro
   pela tela (Continuar ou a carta pedida; no toque, o toque mostra a carta grande e o Confirmar manda), uma
   foto por passo, o Como ganhar curto aberto pelo botão da luta, o fim e o link Como ganhar da tela antes da
   luta. Confere em cada passo: sem rolagem lateral, o balão inteiro na tela e fora da mão, a carta pedida
   ligada e visível, nenhuma outra ligada, sem relógio; e nenhum erro na página.

   O mesmo molde de ferramentas/online-v2-e2e.mjs: cliente mínimo do protocolo de depuração do Chrome
   (WebSocket do Node 24), Chrome do sistema com a placa de vídeo (--use-angle=metal --enable-gpu), a IA de
   produção e o Supabase bloqueados.

   Uso: [PORTA=8851] node ferramentas/online-v2-treino-e2e.mjs <pasta das fotos> */
import { spawn } from "node:child_process"; import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { fileURLToPath } from "node:url";
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), PORTA = Number(process.env.PORTA || 8851), BASE = `http://127.0.0.1:${PORTA}/`;
const OUT = path.resolve(process.argv[2] || "online-v2-treino"); fs.mkdirSync(OUT, { recursive: true });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join(RAIZ, "ferramentas", "servidor-local.mjs"), String(PORTA)], { stdio: "ignore" });
const post = async (rota, corpo) => (await fetch(BASE + rota, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })).json();
for (let i = 0; i < 150; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await esperar(200); }

async function chrome(porta = 9351) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v2-treino-e2e-"));
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
let C = null;
try {
  const uid = (await post("teste/usuario", { pro: true })).id;
  await post("teste/sql", { sql: "update jxj_config set valor = $1::jsonb where chave = 'combate_v2'", params: [JSON.stringify({ contas: [uid] })] });
  C = await chrome();
  /* sem jxj:treino2 a cada carga (a aba de antes gravou a marca no mesmo navegador) */
  const inicio = `localStorage.setItem("tutorial:draft","1");localStorage.setItem("tutorial:luta","1");localStorage.setItem("jxj:treino","1");localStorage.removeItem("jxj:treino2");localStorage.setItem("luta:3d","0");`;
  const bloquear = ["*supabase.co*", "*octogono.fun/api*", "*draft-ufc.vercel.app*", "*vercel*"];
  const abas = [["1280", { width: 1280, height: 800 }], ["390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["360", { width: 360, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]];
  let lutadorId = null;
  for (const [tag, vp] of abas) {
    const p = await C.aba(vp, { bloquear, inicio });
    await p.ir(BASE + "#/menu");
    lutadorId = await p.avaliar(async (uid, criar) => {
      meuAccessToken = async () => "tok:" + uid;
      sessaoAtual = async () => { USUARIO_ID = uid; return { user: { id: uid, email: uid.slice(0, 6) + "@teste" }, access_token: "tok:" + uid }; };
      atualizarStatusPro = async () => { meuPro = true; }; if (typeof reconferirPro === "function") reconferirPro = async () => true; meuPro = true;
      if (criar) await jxj("criar", { nome: "Kayo Brasa", estilo: "striker", categoria: "lightweight", rosto: { ...cfgPadrao(), cabelo: 2, barba: 3, entrada: 1 } });
      return (await jxj("estado")).lutadores[0].id;
    }, uid, lutadorId == null);
    /* a busca manda pro treino de cartas */
    await p.avaliar(() => { location.hash = "#/jxj/fila"; }); await esperar(2500);
    const foi = await p.avaliar(() => ({ hash: location.hash, v2: !!document.querySelector(".jxj-combate.v2"), balao: !!document.querySelector(".jxj-treino-balao") }));
    log.push(`${tag}: a busca ${foi.v2 && foi.balao ? "mandou pro treino de cartas" : "NÃO mandou pro treino: " + JSON.stringify(foi)} (${foi.hash})`);
    if (!foi.v2 || !foi.balao) ruins.push(`${tag}: a busca não mandou pro treino`);
    const textos = await p.avaliar(() => JXJ_TREINO2_PASSOS.map((x, i) => ({ texto: jxjTreino2Texto(i, {}), botao: x.botao || null, etapa: x.etapa })));
    for (const [i, P] of textos.entries()) {
      /* o passo na tela: o balão com a frase dele */
      let ok = false;
      for (let k = 0; k < 40 && !ok; k++) { ok = await p.avaliar((t) => { const b = document.querySelector(".jxj-treino-balao p"); return !!b && b.textContent === t; }, P.texto); if (!ok) await esperar(100); }
      if (!ok) { ruins.push(`${tag} passo ${i + 1}: o balão não chegou (${P.texto})`); break; }
      /* a troca resolvida: espera o duelo das cartas acabar */
      await esperar(P.etapa === "depois" ? 2600 : 500);
      const st = await p.avaliar(() => {
        const r = (x) => (x ? x.getBoundingClientRect() : null), b = r(document.querySelector(".jxj-treino-balao"));
        const mao = [...document.querySelectorAll(".jxj-mao-luta .jxj-na-mao")].map(r).filter((x) => x && x.height > 0);
        const lig = [...document.querySelectorAll(".jxj-mao-luta .jxj-na-mao:not([disabled])")].map(r);
        const cobreMao = !!b && mao.some((c) => b.bottom > c.top + 1 && b.top < c.bottom - 1 && b.right > c.left && b.left < c.right);
        const fora = (x) => !x || x.left < -1 || x.right > innerWidth + 1 || x.top < -1 || x.bottom > innerHeight + 1;
        const rel = document.getElementById("jxj-relogio");
        return { largura: document.documentElement.scrollWidth > innerWidth + 1 ? document.documentElement.scrollWidth : 0, balaoFora: fora(b), cobreMao,
          ligadas: lig.length, ligadaFora: lig.some(fora), relogio: rel ? rel.textContent : "", texto: b ? Math.round(b.height) : 0 };
      });
      await p.foto(`${tag}-passo-${String(i + 1).padStart(2, "0")}.png`);
      const prob = [st.largura ? `rolagem lateral ${st.largura}` : "", st.balaoFora ? "balão fora da tela" : "", st.cobreMao ? "balão em cima da mão" : "",
        P.botao && st.ligadas ? "carta ligada num passo de Continuar" : "", !P.botao && !st.ligadas ? "nenhuma carta ligada" : "", st.ligadaFora ? "carta pedida fora da tela" : "",
        st.relogio && st.relogio !== "livre" ? "relógio " + st.relogio : ""].filter(Boolean);
      log.push(`${tag} passo ${i + 1}: ${prob.length ? prob.join(", ") : "ok"} (balão ${st.texto}px)`);
      if (prob.length) ruins.push(`${tag} passo ${i + 1}: ${prob.join(", ")}`);
      /* o Como ganhar curto pelo botão da luta (fora do relógio aqui), uma vez */
      if (i === 1) {
        await p.avaliar(() => { const b = document.getElementById("jxj-btn-regras2"); b && b.click(); }); await esperar(400);
        const cg = await p.avaliar(() => { const g = document.querySelector(".jxj-combate .v2-regras"); if (!g || g.hidden) return null; const r = g.getBoundingClientRect();
          return { blocos: g.querySelectorAll("li").length, fora: r.left < -1 || r.right > innerWidth + 1, largura: document.documentElement.scrollWidth > innerWidth + 1 }; });
        await p.foto(`${tag}-luta-como-ganhar.png`);
        log.push(`${tag} Como ganhar na luta: ${JSON.stringify(cg)}`);
        if (!cg || cg.blocos > 3 || cg.fora || cg.largura) ruins.push(`${tag}: Como ganhar da luta ${JSON.stringify(cg)}`);
        await p.avaliar(() => { const b = document.querySelector(".jxj-combate .v2-regras-fechar"); b && b.click(); }); await esperar(300);
      }
      /* o placar no topo com ele cansado (energia 1 de 5): nada passa da metade de cada lado */
      if (i === 10) {
        const pl = await p.avaliar(async () => { scrollTo(0, 0); await new Promise((r) => setTimeout(r, 300));
          return [...document.querySelectorAll(".jxj-hud .jxj-hud-lado")].map((l) => { const rl = l.getBoundingClientRect();
            return [...l.querySelectorAll(".v2-energia-rot, .v2-energia-rot em, .v2-energia-barra, .jxj-vida")].some((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && (r.right > rl.right + 1 || r.left < rl.left - 1); }); }); });
        await p.foto(`${tag}-placar-topo.png`);
        if (pl.some(Boolean)) ruins.push(`${tag}: o placar passa do lado (${JSON.stringify(pl)})`);
        log.push(`${tag} placar com ele cansado: ${pl.some(Boolean) ? "PASSA DO LADO" : "ok"}`);
      }
      if (P.botao) { await p.avaliar(() => document.querySelector(".jxj-treino-continuar").click()); continue; }
      await p.avaliar(() => document.querySelector(".jxj-mao-luta .jxj-na-mao:not([disabled])").click()); await esperar(350);
      /* no toque: a carta grande com o Confirmar */
      const foco = await p.avaliar(() => { const f = document.querySelector(".v2-foco"); return !!(f && !f.hidden && f.querySelector(".v2-confirmar")); });
      if (foco) { if (i === 1 || P.etapa === "acao" && !fs.existsSync(path.join(OUT, `${tag}-tocada.png`))) await p.foto(`${tag}-tocada${P.etapa === "acao" ? "" : "-postura"}.png`); await p.avaliar(() => document.querySelector(".v2-foco .v2-confirmar").click()); }
    }
    await esperar(800);
    const fim = await p.avaliar(() => ({ feito: !!document.querySelector(".jxj-treino-fim"), marca: localStorage.getItem("jxj:treino2"), link: !!document.getElementById("jxj-link-regras2") }));
    await p.foto(`${tag}-fim.png`);
    log.push(`${tag} fim: ${JSON.stringify(fim)}`);
    if (!fim.feito || fim.marca !== "1" || !fim.link) ruins.push(`${tag}: fim ${JSON.stringify(fim)}`);
    await p.avaliar(() => document.getElementById("jxj-link-regras2").click()); await esperar(400);
    await p.foto(`${tag}-fim-como-ganhar.png`);
    /* a tela antes da luta: o link Como ganhar abre o painel sem relógio */
    await p.avaliar(() => { location.hash = "#/jxj"; }); await esperar(2500);
    const pn = await p.avaliar(async () => { const l = document.getElementById("jxj-link-regras2"); if (!l) return null; l.click(); await new Promise((r) => setTimeout(r, 400));
      const g = document.getElementById("jxj-regras2-solta"); if (g) g.scrollIntoView({ block: "center" }); await new Promise((r) => setTimeout(r, 300));
      return { aberto: !!(g && !g.hidden), blocos: g ? g.querySelectorAll("li").length : 0, largura: document.documentElement.scrollWidth > innerWidth + 1 }; });
    await p.foto(`${tag}-painel-como-ganhar.png`);
    log.push(`${tag} painel: ${JSON.stringify(pn)}`);
    if (!pn || !pn.aberto || pn.blocos > 3 || pn.largura) ruins.push(`${tag}: painel ${JSON.stringify(pn)}`);
    if (p.erros.length) ruins.push(`${tag}: erros ${p.erros.slice(0, 3).join(" | ")}`);
  }
  console.log(log.join("\n"));
  console.log(ruins.length ? "REPROVOU\n" + ruins.join("\n") : "ok");
  process.exitCode = ruins.length ? 1 : 0;
} catch (e) { console.log(log.join("\n")); console.log("FALHA " + e.message); process.exitCode = 1; }
finally { if (C) C.fechar(); srv.kill(); setTimeout(() => process.exit(process.exitCode || 0), 300); }
