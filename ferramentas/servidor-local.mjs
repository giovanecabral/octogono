/* Servidor local do JxJ pra teste de navegador (puppeteer): serve o site
   desta pasta e responde POST /api/jxj com o servidor de verdade
   (api/jxj.js) ligado a um Postgres local (PGlite, banco-teste.mjs) com
   supabase_schema.sql + supabase_jxj.sql. Só escuta em 127.0.0.1.

   Rotas de apoio ao teste (só aqui, nunca no site):
     POST /teste/usuario {pro}  -> cria uma conta falsa e devolve {id}
     POST /teste/sql {sql, params} -> roda SQL no banco local (preparar cenário)
   O token de uma conta falsa é "tok:<id>".

   Uso: node ferramentas/servidor-local.mjs [porta]  (padrão 8766) */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { novoBanco, criarUsuario, fetchFalso, chamar } from "./banco-teste.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORTA = Number(process.argv[2] || 8766);
const db = await novoBanco();
const { SUPABASE_URL } = await import(pathToFileURL(path.join(RAIZ, "api", "_pro.js")).href);
globalThis.fetch = fetchFalso(db, { SUPABASE_URL });
process.env.SUPABASE_SERVICE_ROLE_KEY = "falsa";
process.env.JXJ_ATIVO = process.env.JXJ_ATIVO || "true";
delete process.env.OPENROUTER_API_KEY;
const H = (await import(pathToFileURL(path.join(RAIZ, "api", "jxj.js")).href)).default;

const TIPOS = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".mp3": "audio/mpeg", ".ico": "image/x-icon" };
const corpo = (req) => new Promise((ok) => { let b = ""; req.on("data", (c) => { b += c; }); req.on("end", () => { try { ok(b ? JSON.parse(b) : {}); } catch { ok(null); } }); });
const json = (res, st, j) => { res.writeHead(st, { "Content-Type": "application/json" }); res.end(JSON.stringify(j)); };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  try {
    if (req.method === "POST" && url.pathname === "/api/jxj") {
      const r = await chamar(H, await corpo(req));
      return json(res, r.status, r.json);
    }
    if (req.method === "POST" && url.pathname === "/teste/usuario") {
      const c = await corpo(req); const id = randomUUID();
      await criarUsuario(db, id, { pro: !!(c && c.pro) });
      return json(res, 200, { id });
    }
    if (req.method === "POST" && url.pathname === "/teste/sql") {
      const c = await corpo(req);
      const r = await db.query(c.sql, c.params || []);
      return json(res, 200, { linhas: r.rows });
    }
    let arq = path.normalize(path.join(RAIZ, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)));
    if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end("404"); }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(arq)] || "application/octet-stream" });
    fs.createReadStream(arq).pipe(res);
  } catch (e) {
    json(res, 500, { erro: String(e.message).slice(0, 200) });
  }
}).listen(PORTA, "127.0.0.1", () => console.log(`JxJ local em http://127.0.0.1:${PORTA}/`));
