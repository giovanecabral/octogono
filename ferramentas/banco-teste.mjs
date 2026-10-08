/* Banco de teste do JxJ: Postgres de verdade (PGlite, WebAssembly) com o
   mínimo do Supabase que as migrações usam (esquema auth, auth.uid(),
   papéis anon/authenticated/service_role). Roda supabase_schema.sql (o
   banco de hoje), depois supabase_jxj.sql e supabase_jxj_narracao.sql, na
   mesma ordem da produção.

   fetchFalso() imita a REST do Supabase pro servidor (api/jxj.js) rodar
   inteiro contra esse banco: POST /rest/v1/rpc/<função> e GET
   /auth/v1/user (token "tok:<uuid>" vira o usuário <uuid>). Nada aqui vai
   pro site (.vercelignore) e nada sai da máquina. */
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const STUB_SUPABASE = `
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text, created_at timestamptz default now(), last_sign_in_at timestamptz);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
`;
/* o Supabase dá select/insert/update/delete em tabela nova do public pros
   papéis do cliente (quem barra é a RLS); aqui igual, pra provar a RLS */
const GRANTS_SUPABASE = `
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
`;

export async function novoBanco({ jxj = true, raio = true, movimento = true } = {}) {
  const db = new PGlite();
  await db.exec(STUB_SUPABASE);
  await db.exec(fs.readFileSync(path.join(RAIZ, "supabase_schema.sql"), "utf8"));
  if (jxj) {
    await db.exec(fs.readFileSync(path.join(RAIZ, "supabase_jxj.sql"), "utf8"));
    /* migração separada da narração (reserva e teto), na ordem da produção */
    await db.exec(fs.readFileSync(path.join(RAIZ, "supabase_jxj_narracao.sql"), "utf8"));
    /* raio de rating na fila (2026-10-04); raio:false = banco de antes da migração */
    if (raio) await db.exec(fs.readFileSync(path.join(RAIZ, "supabase_jxj_raio.sql"), "utf8"));
    /* contador de quem está no Online (2026-10-08); movimento:false = banco de antes */
    if (movimento) await db.exec(fs.readFileSync(path.join(RAIZ, "supabase_jxj_movimento.sql"), "utf8"));
  }
  await db.exec(GRANTS_SUPABASE);
  return db;
}

export async function criarUsuario(db, id, { pro = false, expira = null, email = null } = {}) {
  await db.query("insert into auth.users (id, email) values ($1, $2) on conflict do nothing", [id, email || `${id.slice(0, 8)}@teste`]);
  if (pro) await db.query(
    "insert into assinaturas (user_id, pro, plano, expira_em) values ($1, true, 'mensal', $2) on conflict (user_id) do update set pro = true, expira_em = $2",
    [id, expira]);
}

/* tipo de cada argumento das funções, pra montar a chamada com nome */
async function assinaturas(db) {
  const r = await db.query(`select p.proname, p.proargnames, array(select format_type(t, null) from unnest(p.proargtypes) t) as tipos
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'jxj\\_%'`);
  const m = {};
  for (const row of r.rows) m[row.proname] = { nomes: row.proargnames || [], tipos: row.tipos || [] };
  return m;
}

export function fetchFalso(db, { SUPABASE_URL, chamadas = [] } = {}) {
  let sigs = null;
  const responder = (status, corpo) => ({
    ok: status >= 200 && status < 300, status,
    text: async () => (corpo === undefined ? "" : JSON.stringify(corpo)),
    json: async () => corpo,
  });
  return async (url, op = {}) => {
    url = String(url);
    if (url.startsWith(`${SUPABASE_URL}/auth/v1/user`)) {
      const h = (op.headers && (op.headers.Authorization || op.headers.authorization)) || "";
      const tok = String(h).replace(/^Bearer\s+/i, "");
      return tok.startsWith("tok:") ? responder(200, { id: tok.slice(4) }) : responder(401, { msg: "token inválido" });
    }
    const m = /\/rest\/v1\/rpc\/([a-z_0-9]+)$/.exec(url);
    if (m) {
      sigs = sigs || await assinaturas(db);
      const fn = m[1], sig = sigs[fn];
      /* mesmo corpo do PostgREST pra função que não existe (code PGRST202) */
      if (!sig) return responder(404, { code: "PGRST202", message: `Could not find the function public.${fn} in the schema cache` });
      const args = op.body ? JSON.parse(op.body) : {};
      const partes = [], valores = [];
      sig.nomes.forEach((nome, i) => {
        if (!(nome in args)) return;
        let v = args[nome];
        /* objeto vira JSON; booleano e número vão nativos (o PostgREST
           converte o JSON pro tipo do argumento do mesmo jeito) */
        if (v !== null && typeof v === "object") v = JSON.stringify(v);
        valores.push(v === undefined ? null : v);
        partes.push(`${nome} => $${valores.length}::${sig.tipos[i]}`);
      });
      chamadas.push(fn);
      try {
        const r = await db.query(`select to_jsonb(public.${fn}(${partes.join(", ")})) as r`, valores);
        return responder(200, r.rows[0].r);
      } catch (e) {
        return responder(400, { message: e.message, code: e.code || null });
      }
    }
    return responder(404, { message: "rota falsa não conhece " + url.slice(0, 80) });
  };
}

/* Requisição falsa pro handler da Vercel */
export async function chamar(handler, corpo) {
  let status = 200, json = null;
  const res = {
    setHeader() {}, status(s) { status = s; return this; },
    json(j) { json = j; return this; }, end() { return this; },
  };
  await handler({ method: "POST", body: corpo, headers: {} }, res);
  return { status, json };
}
