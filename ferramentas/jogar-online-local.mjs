/* Jogar o Online da pasta local, num Chrome de verdade, sem tocar em
   produção: servidor local (ferramentas/servidor-local.mjs: api/jxj.js +
   Postgres no PGlite, banco novo a cada execução), uma conta Pro de teste
   (duas com "2", pra lutar contra você mesmo em duas janelas) e a conta dos
   bots já configurada. Feito pra testar mudança no Online antes do deploy.

   A sessão do Supabase é trocada pela conta de teste (token "tok:<id>",
   que só o servidor local entende) a cada carregamento da página, então
   recarregar funciona. Supabase, a API de produção e a Vercel ficam
   bloqueados: nada sai da máquina e nenhuma IA é chamada.

   Uso (Chrome instalado; puppeteer-core numa pasta qualquer, como em
   ferramentas/jxj-e2e.mjs):
     cd <pasta com puppeteer-core>
     node <repo>/ferramentas/jogar-online-local.mjs [2]
   Fechar o Chrome encerra tudo. Precisa de `npm install --prefix
   <repo>/ferramentas` (PGlite) uma vez. */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.cwd(), "x.js"));
const puppeteer = require("puppeteer-core");
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORTA = Number(process.env.PORTA || 8780);
const BASE = `http://127.0.0.1:${PORTA}/`;
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const JANELAS = process.argv[2] === "2" ? 2 : 1;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const servidor = spawn(process.execPath, [path.join(RAIZ, "ferramentas", "servidor-local.mjs"), String(PORTA)], { stdio: "ignore" });
const encerrar = () => { try { servidor.kill(); } catch { /* já saiu */ } process.exit(0); };
process.on("SIGINT", encerrar);
process.on("SIGTERM", encerrar);
const post = async (rota, corpo) => (await fetch(BASE + rota, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })).json();
let subiu = false;
for (let i = 0; i < 150 && !subiu; i++) { try { subiu = (await fetch(BASE)).ok; } catch { /* subindo */ } if (!subiu) await esperar(200); }
if (!subiu) { console.log(`o servidor local não subiu na porta ${PORTA} (outra coisa usando a porta? PORTA=8781 node ...)`); encerrar(); }

/* conta dos bots: precisa existir pra a fila oferecer bot */
const contaBots = (await post("teste/usuario", { pro: false })).id;
await post("teste/sql", { sql: "select public.jxj_bot_configurar($1) as r", params: [contaBots.slice(0, 8) + "@teste"] });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, defaultViewport: null,
  args: ["--window-size=1280,900", "--no-first-run", "--no-default-browser-check"] });
browser.on("disconnected", encerrar);

async function janela(n) {
  const uid = (await post("teste/usuario", { pro: true })).id;
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setRequestInterception(true);
  page.on("request", (r) => (/supabase\.co|octogono\.fun\/api|draft-ufc\.vercel\.app|vercel/.test(r.url()) ? r.abort() : r.continue()));
  page.on("pageerror", (e) => console.log(`[janela ${n}] erro na página: ${e.message}`));
  /* a cada carregamento: a sessão vira a conta de teste e a rota roda de novo com ela */
  page.on("load", () => page.evaluate((uid) => {
    meuAccessToken = async () => "tok:" + uid;
    sessaoAtual = async () => { USUARIO_ID = uid; return { user: { id: uid, email: "teste" + uid.slice(0, 4) + "@teste" }, access_token: "tok:" + uid }; };
    atualizarStatusPro = async () => { meuPro = true; };
    if (typeof reconferirPro === "function") reconferirPro = async () => true;
    meuPro = true;
    const h = location.hash.startsWith("#/jxj") ? location.hash : "#/jxj";
    location.hash = "#/menu";
    setTimeout(() => { location.hash = h; }, 60);
  }, uid).catch(() => { /* página fechando */ }));
  await page.goto(BASE + "#/jxj", { waitUntil: "domcontentloaded" });
  return uid;
}
const vazias = await browser.pages();   // a aba em branco que o Chrome abre sozinho
for (let n = 1; n <= JANELAS; n++) await janela(n);
for (const p of vazias) await p.close().catch(() => { /* já fechou */ });
console.log(`Online local aberto em ${BASE} com ${JANELAS === 2 ? "duas contas Pro de teste (uma por janela)" : "uma conta Pro de teste"} e os bots ligados.`);
console.log("Crie o lutador, entre na fila e escolha \"Lutar contra bot\"" + (JANELAS === 2 ? " (ou entre na fila nas duas janelas pra lutar contra você mesmo)" : "") + ". Fechar o Chrome encerra tudo.");
