// Luta em 3D de ponta a ponta no navegador de verdade (Chrome com placa de vídeo).
//
// Monta uma carreira sem conta (mesmo atalho do img/tutorial/capturar.mjs),
// abre a primeira luta e confere: o palco 3D aparece com o canvas, a narração
// anda junto com os lances, o botão troca pra texto e volta, a luta chega ao
// resultado e o palco é desmontado. Tira prints em <saida>/.
//
// Uso:
//   1. na raiz do repositório: python3 -m http.server 8000
//      (luta3d/mx_lutas.glb precisa estar na pasta: ele não vai pro git)
//   2. numa pasta com puppeteer-core instalado:
//      node /caminho/ferramentas/luta3d-e2e.mjs <saida> [celular]
// A IA de produção é bloqueada (custa crédito do dono).
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
const require = createRequire(path.join(process.cwd(), "x.js"));
const puppeteer = require("puppeteer-core");
const URL_JOGO = process.env.URL_JOGO || "http://127.0.0.1:8000/";
const [, , saida = "luta3d-e2e", modo] = process.argv;
const celular = modo === "celular", semPlaca = modo === "semplaca";
fs.mkdirSync(saida, { recursive: true });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const falhas = [];
const conferir = (ok, msg) => { console.log((ok ? "ok    " : "FALHA ") + msg); if (!ok) falhas.push(msg); };

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new", protocolTimeout: 600000,
  args: semPlaca ? ["--disable-gpu", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : ["--use-angle=metal", "--enable-gpu", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
const erros = [];
page.on("pageerror", (e) => erros.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|supabase|ERR_/i.test(m.text())) erros.push("console: " + m.text().slice(0, 200)); });
await page.setRequestInterception(true);
page.on("request", (r) => (/octogono\.fun\/api\/|draft-ufc\.vercel\.app\/api\/|supabase\.co|vercel-insights|\/_vercel\//.test(r.url()) ? r.abort() : r.continue()));
await page.setViewport(celular ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1280, height: 860 });
await page.evaluateOnNewDocument(() => { localStorage.setItem("tutorial:draft", "1"); localStorage.setItem("tutorial:luta", "1"); localStorage.removeItem("luta:3d"); });
await page.goto(URL_JOGO + "#/menu", { waitUntil: "networkidle0" });

await page.evaluate(async () => {
  for (let i = 0; i < 100 && (typeof ROSTER === "undefined" || !ROSTER || !ROSTER.length); i++) await new Promise((r) => setTimeout(r, 100));
  atualizarStatusPro = async () => true; if (typeof reconferirPro === "function") reconferirPro = async () => true;
  TUTORIAL_NA_SESSAO.draft = true; TUTORIAL_NA_SESSAO.luta = true;
  DIVISION = "lightweight"; MODO = "normal"; SEED = 424242; RIVAL_ATIVADO = false; RIVAL_NOME_ESCOLHIDO = null;
  ROSTO = { ...cfgPadrao(), pele: 4, cabelo: 6, barba: 3, corEntrada: 1, entrada: 4, tatuagem: 5, orelha: 1 };
  meuPro = true;
  startDraft("Kayo Brasa");
  let left = TOTAL_WEIGHT * BUDGET_PCT, rem = [...PAIRS];
  me = { name: "Kayo Brasa", division: DIVISION }; picks = [];
  while (rem.length) {
    const rows = rollTable(POOL, rem, rng, PCT), sh = cartasDaMesa(rows, left, rem, POOL, PCT);
    const r = sh.reduce((m, x) => (x.cost > m.cost ? x : m), sh[0]);
    me[r.pair.a.key] = r.src[r.pair.a.key]; me[r.pair.b.key] = r.src[r.pair.b.key];
    picks.push({ pair: r.pair, from: r.src.name }); left -= r.cost; rem = rem.filter((p) => p.id !== r.pair.id);
  }
  remaining = []; budgetLeft = left; startCareer();
  auto = false; speed = 1;
  ai = async (kind) => (kind === "coletivaCena"
    ? { evento: "O treinador dele disse que você foge da troca.", pergunta: "Você foge da troca?" }
    : kind === "coletiva" ? { reacao: "Ele saiu antes da última pergunta.", hype: 1.1, pressao: 0.95, atributoPressao: "tdDef" } : null);
  nextFight();
});
await esperar(900);
await page.evaluate(() => document.querySelector("#opps .opp").click());
await esperar(900);
await page.evaluate(() => document.querySelector("#camps .camp").click());
await esperar(900);
await page.evaluate(async () => { document.getElementById("colresp").value = "Sábado a gente vê."; await document.getElementById("colgo").onclick(); });
await esperar(900);
await page.evaluate(() => document.getElementById("colseguir").click());

// sem placa de vídeo: começa no texto e, ligando o 3D, avisa como resolver
if (semPlaca) {
  await esperar(1500);
  conferir(await page.evaluate(() => !LUTA3D && !LUTA3D_CARREGANDO && /Ver em 3D/.test(document.getElementById("modo3d").textContent)), "sem placa de vídeo a luta começa no texto");
  await page.evaluate(() => document.getElementById("modo3d").click());
  let aviso = false;
  for (let g = 0; g < 160 && !aviso; g++) { aviso = await page.evaluate(() => !!document.querySelector("#luta3dCaixa .luta3d-aviso")); if (!aviso) await esperar(250); }
  conferir(aviso, "ligando o 3D sem placa aparece o aviso da aceleração de hardware");
  await page.screenshot({ path: path.join(saida, "semplaca.png") });
  conferir(erros.length === 0, "sem erro na página" + (erros.length ? ": " + erros.slice(0, 3).join(" | ") : ""));
  await browser.close();
  console.log(falhas.length ? `\n${falhas.length} falha(s)` : "\ntudo certo");
  process.exit(falhas.length ? 1 : 0);
}
// a entrada em 3D: a ficha com Pular aparece no palco e some quando a luta começa
let ficha = false;
for (let g = 0; g < 60 && !ficha; g++) { ficha = await page.evaluate(() => !!document.getElementById("luta3dFicha")); if (!ficha) await esperar(250); }
conferir(ficha, "entrada em 3D com a ficha e o Pular");
await esperar(2200);
await page.screenshot({ path: path.join(saida, "entrada.png") });
let saiu = false;
for (let g = 0; g < 80 && !saiu; g++) {
  saiu = await page.evaluate(() => { const e = document.getElementById("escolhaLuta");
    return !document.getElementById("luta3dFicha") && (document.querySelectorAll("#play .pbp").length > 0 || (!!e && e.style.display !== "none" && !!e.querySelector("button"))); });
  if (!saiu) await esperar(250);
}
conferir(saiu, "depois da entrada vem o plano do round ou a narração");
// o palco aparece e carrega
let pronto = false;
for (let g = 0; g < 120 && !pronto; g++) { pronto = await page.evaluate(() => !!LUTA3D && !!document.querySelector("#luta3dCaixa canvas")); if (!pronto) await esperar(250); }
conferir(pronto, "palco 3D carregou com canvas");
conferir(await page.evaluate(() => document.getElementById("luta3dCaixa").hidden === false), "caixa do 3D visível");
conferir(await page.evaluate(() => /texto/.test(document.getElementById("modo3d").textContent)), "botão oferece ver só o texto");
// qualidade automática: os três degraus (menos pixel, sem sombra, sem torcida) sem quebrar o palco
const q = await page.evaluate(async () => {
  const P = LUTA3D._dev.palco; for (const n of [1, 2, 3]) P.qualidade(n);
  await new Promise((r) => setTimeout(r, 600));
  return { nivel: P.nivel, sombra: P.r.shadowMap.enabled, torcida: P.torcida.corpo.visible, px: P.r.getPixelRatio() };
});
conferir(q.nivel === 3 && !q.sombra && !q.torcida && q.px === 1, "qualidade automática desce os três degraus: " + JSON.stringify(q));

// escolha do plano do round (quando abrir) e prints durante a luta
let n = 0, linhasAntes = 0, trocou = false, voltou = false;
for (let g = 0; g < 900; g++) {
  const est = await page.evaluate(() => {
    const e = document.getElementById("escolhaLuta");
    const aberta = !!e && e.style.display !== "none" && !!e.querySelector("button");
    if (aberta) e.querySelector("button").click();
    return { aberta, fim: !playing && noiteEtapa === "resultado", linhas: document.querySelectorAll("#play .pbp").length, l3d: !!LUTA3D };
  });
  if (est.fim) break;
  if (g % 6 === 0 && n < 24) await page.screenshot({ path: path.join(saida, `l${String(n++).padStart(2, "0")}.png`) });
  // no meio da luta: troca pra texto e volta pro 3D
  if (!trocou && est.linhas >= 8) {
    linhasAntes = est.linhas; trocou = true;
    await page.evaluate(() => document.getElementById("modo3d").click());
    conferir(await page.evaluate(() => !LUTA3D && document.getElementById("luta3dCaixa").hidden && localStorage.getItem("luta:3d") === "0"), "botão desliga o 3D e lembra");
  }
  if (trocou && !voltou && est.linhas >= linhasAntes + 3) {
    voltou = true;
    conferir(true, "narração seguiu no texto depois de desligar");
    await page.evaluate(() => document.getElementById("modo3d").click());
    await esperar(1500);
    conferir(await page.evaluate(() => !!LUTA3D && localStorage.getItem("luta:3d") === "1"), "botão liga o 3D de novo");
  }
  await esperar(250);
}
const fim = await page.evaluate(() => ({ fim: !playing && noiteEtapa === "resultado", l3d: !!LUTA3D, caixa: !!document.getElementById("luta3dCaixa") && !document.getElementById("luta3dCaixa").hidden }));
conferir(fim.fim, "luta chegou ao resultado");
conferir(!fim.l3d, "palco desmontado no resultado");
await page.screenshot({ path: path.join(saida, "resultado.png") });
// Rever luta: a luta de novo em 3D, numa tela própria
conferir(await page.evaluate(() => !!document.getElementById("resReverLuta")), "resultado oferece Rever luta");
await page.evaluate(() => document.getElementById("resReverLuta").click());
let rev = false;
for (let g = 0; g < 80 && !rev; g++) { rev = await page.evaluate(() => !!document.querySelector("#reprise canvas") && !!document.querySelector("#reprise .luta3d-legenda")); if (!rev) await esperar(250); }
conferir(rev, "Rever luta monta o palco e a legenda");
await esperar(6000);
await page.screenshot({ path: path.join(saida, "rever.png") });
const legenda = await page.evaluate(() => (document.querySelector("#reprise .luta3d-legenda") || {}).textContent || "");
conferir(legenda.length > 3, "Rever luta passa a narração na legenda: " + legenda.slice(0, 60));
await page.evaluate(() => document.getElementById("repriseFechar").click());
await esperar(400);
conferir(await page.evaluate(() => !document.getElementById("reprise") && !REPRISE_TELA), "Fechar desmonta o Rever luta");
conferir(erros.length === 0, "sem erro na página" + (erros.length ? ": " + erros.slice(0, 3).join(" | ") : ""));
await browser.close();
console.log(falhas.length ? `\n${falhas.length} falha(s)` : "\ntudo certo");
process.exit(falhas.length ? 1 : 0);
