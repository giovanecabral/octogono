/* JxJ de ponta a ponta no navegador de verdade (Chrome), contra o servidor
   local (ferramentas/servidor-local.mjs: api/jxj.js + Postgres no PGlite).
   Duas contas Pro em janelas separadas: criação pela tela, árvore (somar e
   salvar), fila, par, confirmação, luta inteira clicando, resultado,
   narração, todas as telas públicas e o celular. Tira um print de cada
   passo e falha se a tela tiver erro de JavaScript.

   A sessão do Supabase é trocada por uma conta falsa (token "tok:<id>",
   que o servidor local entende). Nada sai da máquina: Supabase, a API de
   produção e a Vercel são bloqueados (regra do projeto: script de
   navegador nunca chama a IA de produção).

   Uso (Chrome instalado; puppeteer-core numa pasta qualquer, como em
   img/tutorial/capturar.mjs):
     cd <pasta com puppeteer-core>
     node <repo>/ferramentas/jxj-e2e.mjs [pasta-dos-prints]
   Precisa de `npm install --prefix <repo>/ferramentas` (PGlite) uma vez. */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.cwd(), "x.js"));
const puppeteer = require("puppeteer-core");
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORTA = Number(process.env.PORTA || 8767);
const BASE = `http://127.0.0.1:${PORTA}/`;
const OUT = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "jxj-e2e-"));
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
fs.mkdirSync(OUT, { recursive: true });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const relatorio = { erros: [], passos: [], prints: OUT };
const passo = (t) => { relatorio.passos.push(t); console.log("·", t); };
const SUF = String(Date.now() % 100000);

/* servidor local próprio (banco novo a cada execução) */
const servidor = spawn(process.execPath, [path.join(RAIZ, "ferramentas", "servidor-local.mjs"), String(PORTA)], { stdio: "ignore" });
const post = async (rota, corpo) => (await fetch(BASE + rota, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })).json();
for (let i = 0; i < 100; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* subindo */ } await esperar(200); }

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--hide-scrollbars"], protocolTimeout: 300000 });
async function abrir(uid, vp = { width: 1360, height: 900 }) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(vp);
  page.on("pageerror", (e) => relatorio.erros.push(`${uid.slice(0, 4)} ${page.url().split("#")[1] || ""}: ${e.message} | ${(e.stack || "").split("\n")[1] || ""}`));
  page.on("console", (m) => { if (m.type() === "error" && !/supabase|ERR_FAILED|ERR_ABORTED|favicon|insights|Failed to load resource/i.test(m.text())) relatorio.erros.push(`${uid.slice(0, 4)} console: ${m.text().slice(0, 160)}`); });
  await page.setRequestInterception(true);
  page.on("request", (r) => (/supabase\.co|octogono\.fun\/api|draft-ufc\.vercel\.app|vercel/.test(r.url()) ? r.abort() : r.continue()));
  await page.evaluateOnNewDocument(() => { localStorage.setItem("tutorial:draft", "1"); localStorage.setItem("tutorial:luta", "1"); });
  await page.goto(BASE + "#/menu", { waitUntil: "networkidle0" });
  await page.evaluate((uid) => {
    meuAccessToken = async () => "tok:" + uid;
    sessaoAtual = async () => { USUARIO_ID = uid; return { user: { id: uid, email: uid.slice(0, 6) + "@teste" }, access_token: "tok:" + uid }; };
    atualizarStatusPro = async () => { meuPro = true; };
    if (typeof reconferirPro === "function") reconferirPro = async () => true;
    meuPro = true;
  }, uid);
  return page;
}
const ir = (page, hash) => page.evaluate((h) => { location.hash = h; }, hash);
const clicar = async (page, sel, txt, obrigatorio = true) => {
  const ok = await page.evaluate((sel, txt) => {
    const b = [...document.querySelectorAll(sel)].find((x) => x.textContent.includes(txt) && !x.disabled);
    if (!b) return false; b.click(); return true;
  }, sel, txt);
  if (!ok && obrigatorio) throw new Error(`não achei "${txt}" (${sel})`);
  return ok;
};
const print = async (page, nome, cheia = true) => { await esperar(450); await page.screenshot({ path: path.join(OUT, `${nome}.png`), fullPage: cheia }); };

try {
  const u1 = (await post("teste/usuario", { pro: true })).id, u2 = (await post("teste/usuario", { pro: true })).id;
  const p1 = await abrir(u1), p2 = await abrir(u2);
  await print(p1, "01-menu", false); passo("menu com o card do JxJ");
  await ir(p1, "#/jxj"); await esperar(1500); await print(p1, "02-entrada"); passo("entrada sem lutador");
  await clicar(p1, "button", "Criar meu lutador"); await esperar(900);
  await p1.type("#jxj-nome", "Kayo Brasa " + SUF);
  await print(p1, "03-criar-nome"); passo("criação: nome e aparência");
  await clicar(p1, "button", "Próximo"); await esperar(800);
  await clicar(p1, ".jxj-opcao", "Peso-leve"); await esperar(800); passo("criação: categoria");
  await clicar(p1, ".jxj-estilo", "Striker"); await esperar(800); passo("criação: estilo");
  await print(p1, "04-criar-confirmar");
  await clicar(p1, "button", "Criar lutador"); await esperar(2000);
  await print(p1, "05-arvore-nova"); passo("árvore depois de criar");
  for (let k = 0; k < 3; k++) {
    await p1.evaluate(() => { const n = document.querySelector(".jxj-ramo .jxj-no"); n && n.click(); });
    await esperar(300);
    await clicar(p1, ".jxj-no-detalhe button", "Somar 1 nível"); await esperar(300);
  }
  await print(p1, "06-arvore-pendente");
  await clicar(p1, "button", "Salvar árvore"); await esperar(1500);
  const livres = await p1.evaluate(() => document.querySelector(".jxj-pontos b").textContent);
  if (livres !== "0") throw new Error("depois de salvar, pontos livres = " + livres);
  await print(p1, "07-arvore-salva"); passo("árvore: 3 níveis somados e salvos");
  await ir(p2, "#/jxj/criar"); await esperar(1000);
  await p2.type("#jxj-nome", "Tião Grade " + SUF);
  await clicar(p2, "button", "Próximo"); await esperar(700);
  await clicar(p2, ".jxj-opcao", "Peso-leve"); await esperar(700);
  await clicar(p2, ".jxj-estilo", "Wrestler"); await esperar(700);
  await clicar(p2, "button", "Criar lutador"); await esperar(1500);
  passo("segundo jogador criado");
  await ir(p1, "#/jxj"); await esperar(2500); await print(p1, "08-painel"); passo("painel");
  await ir(p1, "#/jxj/fila"); await ir(p2, "#/jxj/fila"); await esperar(1500);
  await print(p1, "09-fila-regras"); passo("fila: regras antes de entrar");
  await clicar(p1, "button", "Entrar na fila"); await esperar(800);
  await print(p1, "10-fila-buscando"); passo("fila buscando");
  await clicar(p2, "button", "Entrar na fila"); await esperar(5000);
  await print(p1, "11-confronto"); passo("confronto encontrado");
  await clicar(p1, "button", "Confirmar"); await clicar(p2, "button", "Confirmar"); await esperar(3000);
  await print(p1, "12-luta"); passo("luta começou");
  let fim = false, n = 0;
  while (!fim && n++ < 90) {
    for (const [pg, sem] of [[p1, 1], [p2, 7]])
      await pg.evaluate((k) => { const bs = [...document.querySelectorAll(".jxj-acao:not([disabled])")]; if (bs.length) bs[k % bs.length].click(); }, n * sem);
    await esperar(2600);
    fim = await p1.evaluate(() => !!document.querySelector(".jxj-resultado"));
    if (n === 4) await print(p1, "13-luta-meio");
  }
  if (!fim) throw new Error("a luta não terminou em 90 voltas");
  await esperar(1500);
  await print(p1, "14-resultado-1"); await print(p2, "15-resultado-2"); passo("resultado nos dois lados");
  await clicar(p1, "button", "Contar como foi", false); await esperar(1500); await print(p1, "16-narracao");
  for (const [rota, nome] of [["#/jxj/ranking", "17-ranking"], ["#/jxj/temporada", "18-temporada"], ["#/jxj/torneios", "19-torneios"], ["#/jxj/hall", "20-hall"], ["#/jxj/lutadores", "21-lutadores"]]) {
    await ir(p1, rota); await esperar(1800); await print(p1, nome); passo(nome.slice(3));
  }
  const lid = await p1.evaluate(async () => (await jxj("estado")).lutadores[0].id);
  for (const [rota, nome] of [[`#/jxj/perfil/${lid}`, "22-perfil-publico"], [`#/jxj/lutador/${lid}/historico`, "23-historico"], [`#/jxj/lutador/${lid}/perfil`, "24-atributos"]]) {
    await ir(p1, rota); await esperar(1800); await print(p1, nome); passo(nome.slice(3));
  }
  const m1 = await abrir(u1, { width: 390, height: 844, isMobile: true, hasTouch: true });
  for (const [rota, nome] of [["#/menu", "30-cel-menu"], ["#/jxj", "31-cel-painel"], [`#/jxj/lutador/${lid}/arvore`, "32-cel-arvore"], ["#/jxj/ranking", "33-cel-ranking"]]) {
    await ir(m1, rota); await esperar(2000); await print(m1, nome); passo(nome.slice(3));
  }
  /* luta no celular com duas contas novas: depois da primeira luta os
     ratings de u1 e u2 se afastaram mais que a tolerância inicial da fila */
  const u3 = (await post("teste/usuario", { pro: true })).id, u4 = (await post("teste/usuario", { pro: true })).id;
  const c3 = await abrir(u3, { width: 390, height: 844, isMobile: true, hasTouch: true }), c4 = await abrir(u4, { width: 390, height: 844, isMobile: true, hasTouch: true });
  const ROSTO = { pele: 3, porte: 1, cabelo: 2, corCabelo: 1, barba: 0, orelha: 0, nariz: 0, cicatriz: 0, tatuagem: 0, entrada: 0, prajiad: 0, corEntrada: 0 };
  for (const [pg, nome, estilo] of [[c3, "Rui Cel " + SUF, "grappler"], [c4, "Ivo Cel " + SUF, "counter"]])
    await pg.evaluate(async (nome, estilo, rosto) => { await jxj("criar", { nome, estilo, categoria: "lightweight", rosto }); }, nome, estilo, ROSTO);
  await ir(c3, "#/jxj/fila"); await ir(c4, "#/jxj/fila"); await esperar(1500);
  await clicar(c3, "button", "Entrar na fila"); await clicar(c4, "button", "Entrar na fila"); await esperar(5000);
  await print(c3, "34-cel-confronto");
  await clicar(c3, "button", "Confirmar"); await clicar(c4, "button", "Confirmar"); await esperar(3000);
  if (!(await c3.evaluate(() => document.querySelectorAll(".jxj-acao").length >= 4))) throw new Error("luta no celular sem as 4 ações");
  await print(c3, "35-cel-luta"); passo("luta no celular");
  relatorio.ok = relatorio.erros.length === 0;
} catch (e) {
  relatorio.ok = false; relatorio.falha = e.message;
} finally {
  await browser.close();
  servidor.kill();
  console.log(JSON.stringify({ ok: relatorio.ok, falha: relatorio.falha, erros: relatorio.erros.slice(0, 20), prints: OUT }, null, 1));
  process.exit(relatorio.ok ? 0 : 1);
}
