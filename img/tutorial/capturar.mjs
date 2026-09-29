// Gera os prints anotados do tutorial "Como jogar" (img/tutorial/*.webp).
//
// Tira print do jogo de verdade (servidor local), desenha por cima um círculo
// em volta de cada parte explicada, uma seta e o número do item da lista do
// tutorial (TUTORIAIS no index.html: o número N do print é o item N da lista),
// e recorta a região das anotações. Duas versões: computador (1280 de largura)
// e celular (390, com toque, porque no toque o draft funciona em 2 passos).
//
// Uso (Chrome instalado; puppeteer-core numa pasta qualquer):
//   1. na raiz do repositório: python3 -m http.server 8000
//   2. numa pasta com puppeteer-core instalado (npm i puppeteer-core):
//      node /caminho/do/repositorio/img/tutorial/capturar.mjs
// Os prints saem em img/tutorial/ ao lado deste arquivo. A IA de produção é
// bloqueada (custa crédito do dono); a cena da coletiva usa um texto fixo.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(path.join(process.cwd(), "x.js"));
const puppeteer = require("puppeteer-core");
const PASTA = path.dirname(fileURLToPath(import.meta.url));
const URL_JOGO = process.env.URL_JOGO || "http://localhost:8000/";
const esperar = ms => new Promise(r => setTimeout(r, ms));

/* desenha as anotações dentro da página (coordenadas da página inteira) e
   devolve o retângulo que cobre todas elas, pra recortar o print. Bloco
   pequeno ganha círculo; bloco grande, retângulo arredondado (um círculo
   em volta de um painel largo cobre metade da tela). calha > 0 (celular):
   os números ficam numa faixa à esquerda, fora do conteúdo, com seta
   reta até cada parte; sem calha (computador), cada número procura um
   lugar livre em volta da sua parte. */
function anotar(seletores, calha) {
  const W = document.documentElement.clientWidth;
  const H = Math.max(document.documentElement.scrollHeight, innerHeight);
  const velho = document.getElementById("__anot"); if (velho) velho.remove();
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.id = "__anot";
  svg.setAttribute("width", W); svg.setAttribute("height", H);
  svg.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;z-index:2147483647`;
  const add = (tag, at) => { const n = document.createElementNS(ns, tag); for (const k in at) n.setAttribute(k, at[k]); svg.appendChild(n); return n; };
  const R = 20, M = 8;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  const cobre = (a, b, c, d) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); };
  const formas = seletores.map(sel => {
    const el = document.querySelector(sel);
    if (!el) throw new Error("não achei " + sel);
    const r = el.getBoundingClientRect();
    const f = { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
    f.cx = f.x + f.w / 2; f.cy = f.y + f.h / 2;
    f.grande = f.w > 260 || f.h > 120;
    if (f.grande) { f.a = f.x - M; f.b = f.y - M; f.c = f.x + f.w + M; f.d = f.y + f.h + M; }
    else { f.rx = f.w / 2 * 1.12 + 10; f.ry = f.h / 2 * 1.18 + 10; f.a = f.cx - f.rx; f.b = f.cy - f.ry; f.c = f.cx + f.rx; f.d = f.cy + f.ry; }
    cobre(f.a, f.b, f.c, f.d);
    return f;
  });
  // ponto da borda da forma na direção (ux, uy) a partir do centro
  const borda = (f, ux, uy) => {
    if (!f.grande) { const t = 1 / Math.sqrt((ux * ux) / (f.rx * f.rx) + (uy * uy) / (f.ry * f.ry)); return [f.cx + ux * t, f.cy + uy * t]; }
    const tx = ux ? ((ux > 0 ? f.c : f.a) - f.cx) / ux : Infinity, ty = uy ? ((uy > 0 ? f.d : f.b) - f.cy) / uy : Infinity;
    const t = Math.min(Math.abs(tx), Math.abs(ty)); return [f.cx + ux * t, f.cy + uy * t];
  };
  const dentroDeForma = (x, y, pad) => formas.some(f => x > f.a - pad && x < f.c + pad && y > f.b - pad && y < f.d + pad);
  const badges = [];
  if (calha) {
    // números na faixa da esquerda, na altura de cada parte, sem encostar um no outro
    const ordem = formas.map((f, i) => ({ i, y: Math.min(Math.max(f.cy, f.b + R), f.d - R) })).sort((a, b) => a.y - b.y);
    let ult = -Infinity;
    for (const o of ordem) { o.y = Math.max(o.y, ult + 2 * R + 10); ult = o.y; badges[o.i] = { x: calha / 2, y: o.y, ux: 1, uy: 0 }; }
    badges.forEach((b, i) => { const f = formas[i]; b.ex = f.a; b.ey = Math.min(Math.max(b.y, f.b + 6), f.d - 6); });
  } else {
    formas.forEach((f, i) => {
      let achou = null;
      for (const D of [58, 110, 170]) {
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const n = Math.hypot(dx, dy), ux = dx / n, uy = dy / n;
          const [ex, ey] = borda(f, ux, uy), bx = ex + ux * D, by = ey + uy * D;
          const ok = bx > R + 6 && bx < W - R - 6 && by > R + 6 && by < H - R - 6 &&
            !badges.some(b => Math.hypot(b.x - bx, b.y - by) < 2 * R + 16) && !dentroDeForma(bx, by, R);
          if (ok) { achou = { x: bx, y: by, ux, uy, ex, ey }; break; }
        }
        if (achou) break;
      }
      if (!achou) { const [ex, ey] = borda(f, 0, -1); achou = { x: Math.min(Math.max(f.cx, R + 6), W - R - 6), y: Math.max(ey - 58, R + 6), ux: 0, uy: -1, ex, ey }; }
      badges.push(achou);
    });
  }
  formas.forEach((f, i) => {
    const b = badges[i];
    cobre(b.x - R - 6, b.y - R - 6, b.x + R + 6, b.y + R + 6);
    // direção da seta: do número até a borda da parte
    let dx = b.ex - b.x, dy = b.ey - b.y; const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
    const sx = b.x + dx * (R + 4), sy = b.y + dy * (R + 4), hx = b.ex - dx * 6, hy = b.ey - dy * 6;
    for (const [cor, larg, op] of [["#000", 10, .55], ["#FFD60A", 5, 1]]) {
      if (f.grande) add("rect", { x: f.a, y: f.b, width: f.c - f.a, height: f.d - f.b, rx: 18, fill: "none", stroke: cor, "stroke-width": larg, opacity: op });
      else add("ellipse", { cx: f.cx, cy: f.cy, rx: f.rx, ry: f.ry, fill: "none", stroke: cor, "stroke-width": larg, opacity: op });
      add("line", { x1: sx, y1: sy, x2: hx - dx * 12, y2: hy - dy * 12, stroke: cor, "stroke-width": larg, "stroke-linecap": "round", opacity: op });
      const px = -dy, py = dx;
      add("polygon", { points: `${hx},${hy} ${hx - dx * 20 + px * 11},${hy - dy * 20 + py * 11} ${hx - dx * 20 - px * 11},${hy - dy * 20 - py * 11}`,
        fill: cor, stroke: cor, "stroke-width": larg > 6 ? 4 : 1, opacity: op });
    }
  });
  badges.forEach((b, i) => {
    add("circle", { cx: b.x, cy: b.y, r: R, fill: "#FFD60A", stroke: "#000", "stroke-width": 3 });
    const t = add("text", { x: b.x, y: b.y + 8, "text-anchor": "middle", "font-family": "Arial, sans-serif", "font-weight": 800, "font-size": 23, fill: "#111" });
    t.textContent = String(i + 1);
  });
  document.body.appendChild(svg);
  const m = 22, topo = Math.max(0, Math.floor(y0 - m));
  return { x: 0, y: topo, width: W, height: Math.min(H, Math.ceil(y1 + m)) - topo };
}

const CARREIRA = `async () => {
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 100 && (typeof ROSTER === "undefined" || !ROSTER || !ROSTER.length); i++) await esperar(100);
  atualizarStatusPro = async () => true; if (typeof reconferirPro === "function") reconferirPro = async () => true;
  TUTORIAL_NA_SESSAO.draft = true; TUTORIAL_NA_SESSAO.luta = true;   // o print não pode ter o tutorial aberto por cima
  DIVISION = "lightweight"; MODO = "normal"; SEED = 424242; RIVAL_ATIVADO = false; RIVAL_NOME_ESCOLHIDO = null; ROSTO = cfgPadrao();
  meuPro = true;
}`;

const CALHA = 72;
async function print(page, nome, seletores) {
  const vp = page.viewport(), celular = !!vp.hasTouch;
  /* celular: a tela do jogo continua com 390 de largura, e a página ganha
     uma faixa escura à esquerda só pros números */
  if (celular) {
    await page.setViewport({ ...vp, width: vp.width + CALHA });
    await page.addStyleTag({ content: `html{padding-left:${CALHA}px!important;background:#07080B!important}
      .noite{left:${CALHA}px!important} #__calha{position:fixed;left:0;top:0;bottom:0;width:${CALHA}px;background:#07080B;z-index:2147483646}` });
    await page.evaluate(() => { if (!document.getElementById("__calha")) { const d = document.createElement("div"); d.id = "__calha"; document.body.appendChild(d); } });
  }
  // a página inteira cabe na tela: a noite de luta é fixa e rola por dentro
  const alt = await page.evaluate(() => Math.max(document.documentElement.scrollHeight,
    (document.querySelector(".noite:not([hidden]) .noite-conteudo") || {}).scrollHeight || 0));
  const atual = page.viewport();
  await page.setViewport({ ...atual, height: Math.min(Math.max(alt, vp.height), 2600) });
  await esperar(500);
  const clip = await page.evaluate(anotar, seletores, celular ? CALHA : 0);
  await page.screenshot({ path: path.join(PASTA, nome + ".webp"), type: "webp", quality: 78, clip });
  await page.evaluate(() => { for (const id of ["__anot", "__calha"]) { const a = document.getElementById(id); if (a) a.remove(); } });
  if (celular) await page.evaluate(() => { document.querySelectorAll("style").forEach(s => { if (/__calha/.test(s.textContent)) s.remove(); }); });
  await page.setViewport(vp);
  await esperar(300);
  console.log(nome, `${clip.width}x${Math.round(clip.height)}`);
}

const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new", args: ["--hide-scrollbars"], protocolTimeout: 300000 });
for (const [suf, vp] of [["", { width: 1280, height: 800, deviceScaleFactor: 1 }],
                          ["-m", { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true }]]) {
  const page = await browser.newPage();
  page.on("pageerror", e => console.log("ERRO NA PÁGINA", e.message));
  await page.setRequestInterception(true);
  page.on("request", r => /octogono\.fun\/api\/|draft-ufc\.vercel\.app\/api\//.test(r.url()) ? r.abort() : r.continue());
  await page.setViewport(vp);   // hasTouch liga a emulação de toque: (hover:hover) deixa de valer, semHover() fica true
  await page.goto(URL_JOGO + "#/menu", { waitUntil: "networkidle0" });
  console.log(suf || "computador", "semHover:", await page.evaluate(() => semHover()));
  await page.evaluate(`(${CARREIRA})()`);

  /* ---------- draft ---------- */
  await page.evaluate(() => { startDraft("Kayo Brasa"); scrollTo(0, 0); });
  await esperar(700);
  await print(page, "draft-1" + suf, [".budget-num", ".cards .card .src", ".cards .card .pctwrap", ".cards .card .cost"]);
  await page.evaluate(() => { const c = document.querySelector(".cards .card"); if (semHover()) c.click(); else c.onmouseenter(); });
  await esperar(500);
  await print(page, "draft-2" + suf, ["#reroll", ".oct-wrap", ".dossie"]);
  /* orçamento zerado: às vezes ainda cabe uma carta real de custo 0.00
     (poder 0 e queixo no piso), e a mesa mostra essa; rola de novo até a
     mesa só ter as cartas mínimas, que é o que este passo explica */
  await page.evaluate(() => {
    budgetLeft = 0;
    for (let k = 0; k < 40; k++) { renderDraft(); if (document.querySelector(".cards .card-minima")) break; }
    scrollTo(0, 0);
  });
  await esperar(600);
  await print(page, "draft-3" + suf, [".budget-num", ".cards .card-minima"]);

  /* ---------- noite de luta ---------- */
  await page.evaluate(() => {
    let left = TOTAL_WEIGHT * BUDGET_PCT, rem = [...PAIRS];
    me = { name: "Kayo Brasa", division: DIVISION }; picks = [];
    while (rem.length) {
      const rows = rollTable(POOL, rem, rng, PCT), sh = cartasDaMesa(rows, left, rem, POOL, PCT);
      const r = sh.reduce((m, x) => x.cost > m.cost ? x : m, sh[0]);
      me[r.pair.a.key] = r.src[r.pair.a.key]; me[r.pair.b.key] = r.src[r.pair.b.key];
      picks.push({ pair: r.pair, from: r.src.name }); left -= r.cost; rem = rem.filter(p => p.id !== r.pair.id);
    }
    remaining = []; budgetLeft = left; startCareer();
    auto = false; meuPro = true; speed = 1;
    ai = async kind => kind === "coletivaCena"
      ? { evento: "O treinador dele pegou o microfone da mesa pra dizer que você foge da troca.", pergunta: "O treinador dele disse que você foge da troca. Você foge?" }
      : kind === "coletiva"
        ? { reacao: "Ele ficou vermelho e saiu antes da última pergunta. Dois repórteres foram atrás.", hype: 1.15, pressao: .92, atributoPressao: "tdDef" }
        : null;
    nextFight();
  });
  await esperar(900);
  await print(page, "luta-1" + suf, [".opp .dbanda", ".opp .opp-comp", ".opp .stake"]);
  await page.evaluate(() => document.querySelector("#opps .opp").click());
  await esperar(900);
  await print(page, "luta-2" + suf, [".camp", ".camp .pctwrap"]);
  await page.evaluate(() => document.querySelector("#camps .camp").click());
  await esperar(900);
  await page.evaluate(async () => {
    document.getElementById("colresp").value = "Sábado ele descobre por que ninguém quis essa luta.";
    await document.getElementById("colgo").onclick();
  });
  await esperar(900);
  await print(page, "luta-3" + suf, ["#colbalao", "#coldesfecho .dil-fx", "#colseguir"]);
  await page.evaluate(() => { speed = 8; document.getElementById("colseguir").click(); });
  for (let g = 0; g < 600; g++) {
    const aberta = await page.evaluate(() => { const e = document.getElementById("escolhaLuta"); return !!e && e.style.display !== "none" && !!e.querySelector("button"); });
    if (aberta) break;
    await esperar(200);
  }
  await esperar(700);
  await print(page, "luta-4" + suf, [".placar", "#play", "#lutaNumeros", "#escolhaLuta", "#speedb"]);
  await page.evaluate(() => document.querySelector("#escolhaLuta button").click());
  for (let g = 0; g < 600; g++) {
    const fim = await page.evaluate(() => !playing && noiteEtapa === "resultado");
    if (fim) break;
    await esperar(250);
  }
  await esperar(2200);
  await print(page, "luta-5" + suf, [".res-carimbo", ".res-nums", ".entrevista-convite button", ".noite-rodape"]);
  await page.close();
}
await browser.close();
