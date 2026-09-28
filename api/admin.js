/**
 * api/admin.js — painel de admin (2026-09-28). Roda na Vercel.
 *
 * Quem pode: o DONO (e-mail em ADMIN_DONO_EMAIL, variável de ambiente da
 * Vercel, nunca no código) e quem estiver na tabela `admins`. Só o dono
 * adiciona ou remove admin. A tela (#/admin) só mostra: TODA decisão é
 * daqui, conferindo o token de quem pediu a cada chamada.
 *
 * Ações (POST {token, acao, ...}):
 *   eu                        → {admin, dono}
 *   listar {busca, pagina}    → jogadores (função admin_listar_usuarios)
 *   darPro {userId, dias}     → dias null = sem prazo
 *   tirarPro {userId}
 *   banir {userId, motivo}    → bloqueia o login (Auth do Supabase) e esconde
 *                               as carreiras dele do ranking (tabela banidos)
 *   desbanir {userId}
 *   ranking {divisao}         → carreiras do placar (inclui banidos, marcados)
 *   apagarRanking {userId, seed}
 *   admins                    → lista
 *   addAdmin {email}          → só o dono
 *   removerAdmin {userId}     → só o dono
 *   registro                  → últimas 100 ações
 * Toda ação que muda algo vai pro admin_log (quem, o quê, em quem, quando).
 *
 * Variáveis de ambiente: SUPABASE_SERVICE_ROLE_KEY, ADMIN_DONO_EMAIL.
 */
import { SUPABASE_URL, supabaseServiceRole, cabecalhoServico, chaveServico } from "./_pro.js";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImthcGRwaXB3cWt1bXpzY2hjdG5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4MzM5OTcsImV4cCI6MjEwNDQwOTk5N30.OSGFGA98NiuWdb6wzF-NJUIxSwClgG3ZA0PnHvJC6Ug";
const BAN_PRA_SEMPRE = "876000h"; // ~100 anos: o Supabase Auth não tem "pra sempre"
const POR_PAGINA = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function usuarioDoToken(token) {
  if (!token || typeof token !== "string") return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch {
    return null;
  }
}

const ehDono = (u) =>
  !!process.env.ADMIN_DONO_EMAIL && !!u.email &&
  u.email.trim().toLowerCase() === process.env.ADMIN_DONO_EMAIL.trim().toLowerCase();

async function ehAdminNaTabela(userId) {
  const r = await supabaseServiceRole(`admins?user_id=eq.${encodeURIComponent(userId)}&select=user_id`);
  if (!r.ok) return false;
  const l = await r.json();
  return Array.isArray(l) && l.length > 0;
}

async function rpc(nome, args) {
  const r = await supabaseServiceRole(`rpc/${nome}`, { method: "POST", body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`rpc ${nome} falhou (${r.status})`);
  return r.json();
}

/* Um jogador pelo id, com e-mail e se é admin (pra regras e registro). */
async function jogador(userId) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    headers: cabecalhoServico(),
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u : null;
}

async function banirNoAuth(userId, duracao) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: cabecalhoServico(),
    body: JSON.stringify({ ban_duration: duracao }),
  });
  if (!r.ok) throw new Error("Auth recusou o " + (duracao === "none" ? "desbanimento" : "banimento") + " (" + r.status + ")");
}

async function escrever(path, metodo, corpo, extraHeaders = {}) {
  const r = await supabaseServiceRole(path, {
    method: metodo,
    headers: { Prefer: "return=minimal", ...extraHeaders },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`${metodo} ${path.split("?")[0]} falhou (${r.status})`);
}

async function registrar(admin, acao, alvo, detalhe) {
  try {
    await escrever("admin_log", "POST", {
      admin_id: admin.id, admin_email: admin.email || null, acao,
      alvo_id: alvo && alvo.id || null, alvo_email: alvo && alvo.email || null,
      detalhe: detalhe || null,
    });
  } catch { /* o registro nunca derruba a ação que já aconteceu */ }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ erro: "só POST" });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ erro: "servidor sem configuração" });

  const corpo = req.body || {};
  const eu = await usuarioDoToken(corpo.token);
  if (!eu) return res.status(401).json({ erro: "sessão inválida, entre na conta de novo" });
  const dono = ehDono(eu);
  const admin = dono || (await ehAdminNaTabela(eu.id));
  if (corpo.acao === "eu") return res.status(200).json({ admin, dono });
  if (!admin) return res.status(403).json({ erro: "sem acesso" });

  const alvoId = corpo.userId;
  const precisaAlvo = ["darPro", "tirarPro", "banir", "desbanir", "removerAdmin"].includes(corpo.acao);
  if (precisaAlvo && !UUID.test(String(alvoId || ""))) return res.status(400).json({ erro: "jogador inválido" });

  try {
    switch (corpo.acao) {
      case "diagnostico": {
        if (!dono) return res.status(403).json({ erro: "só o dono" });
        const bruta = String(process.env.SUPABASE_SERVICE_ROLE_KEY || ""), k = chaveServico();
        const formato = !k ? "ausente" : k.startsWith("eyJ") ? "jwt" : k.startsWith("sb_secret_") ? "sb_secret" : k.startsWith("sb_publishable_") ? "sb_publishable" : "outra";
        const rRest = await supabaseServiceRole("placar?select=seed&limit=1");
        const rAuth = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1`, { headers: cabecalhoServico() });
        let papel = null;
        if (formato === "jwt") { try { papel = JSON.parse(Buffer.from(k.split(".")[1], "base64url").toString()).role || null; } catch { papel = "ilegível"; } }
        return res.status(200).json({ formato, papel, tinhaEspaco: bruta !== k, tamanho: k.length, rest: rRest.status, auth: rAuth.status });
      }
      case "listar": {
        const pagina = Math.max(0, Math.floor(Number(corpo.pagina) || 0));
        const busca = String(corpo.busca || "").trim().slice(0, 120);
        const lista = await rpc("admin_listar_usuarios", { busca, limite: POR_PAGINA, deslocamento: pagina * POR_PAGINA });
        return res.status(200).json({ jogadores: lista, pagina, porPagina: POR_PAGINA });
      }
      case "darPro": {
        const alvo = await jogador(alvoId);
        if (!alvo) return res.status(404).json({ erro: "jogador não encontrado" });
        const dias = corpo.dias == null ? null : Math.floor(Number(corpo.dias));
        if (dias != null && !(dias >= 1 && dias <= 3650)) return res.status(400).json({ erro: "dias entre 1 e 3650" });
        const expira = dias == null ? null : new Date(Date.now() + dias * 864e5).toISOString();
        await escrever("assinaturas", "POST",
          { user_id: alvoId, pro: true, plano: dias == null ? "unico" : "mensal", expira_em: expira, atualizado_em: new Date().toISOString() },
          { Prefer: "resolution=merge-duplicates,return=minimal" });
        await registrar(eu, "darPro", alvo, { dias });
        return res.status(200).json({ ok: true, expira_em: expira });
      }
      case "tirarPro": {
        const alvo = await jogador(alvoId);
        if (!alvo) return res.status(404).json({ erro: "jogador não encontrado" });
        await escrever(`assinaturas?user_id=eq.${encodeURIComponent(alvoId)}`, "PATCH",
          { pro: false, expira_em: new Date().toISOString(), atualizado_em: new Date().toISOString() });
        await registrar(eu, "tirarPro", alvo, null);
        return res.status(200).json({ ok: true });
      }
      case "banir": {
        const alvo = await jogador(alvoId);
        if (!alvo) return res.status(404).json({ erro: "jogador não encontrado" });
        if (alvoId === eu.id) return res.status(400).json({ erro: "você não pode se banir" });
        if (ehDono(alvo) || (await ehAdminNaTabela(alvoId))) return res.status(400).json({ erro: "admin não pode ser banido; tire o acesso de admin antes" });
        const motivo = String(corpo.motivo || "").trim().slice(0, 300) || null;
        await escrever("banidos", "POST", { user_id: alvoId, motivo, banido_por: eu.id },
          { Prefer: "resolution=merge-duplicates,return=minimal" });
        await banirNoAuth(alvoId, BAN_PRA_SEMPRE);
        await registrar(eu, "banir", alvo, { motivo });
        return res.status(200).json({ ok: true });
      }
      case "desbanir": {
        const alvo = await jogador(alvoId);
        if (!alvo) return res.status(404).json({ erro: "jogador não encontrado" });
        await banirNoAuth(alvoId, "none");
        await escrever(`banidos?user_id=eq.${encodeURIComponent(alvoId)}`, "DELETE");
        await registrar(eu, "desbanir", alvo, null);
        return res.status(200).json({ ok: true });
      }
      case "ranking": {
        const div = String(corpo.divisao || "").replace(/[^a-z_]/g, "");
        const filtro = div ? `&divisao=eq.${div}` : "";
        const r = await supabaseServiceRole(`placar?select=user_id,seed,nome_lutador,divisao,modo,pontuacao,cartel,nota,criado_em${filtro}&order=pontuacao.desc&limit=200`);
        if (!r.ok) throw new Error("placar falhou (" + r.status + ")");
        const linhas = await r.json();
        const rb = await supabaseServiceRole("banidos?select=user_id");
        const banidos = new Set(rb.ok ? (await rb.json()).map((b) => b.user_id) : []);
        return res.status(200).json({ carreiras: linhas.map((l) => ({ ...l, banido: banidos.has(l.user_id) })) });
      }
      case "apagarRanking": {
        if (!UUID.test(String(alvoId || "")) || !/^\d{1,19}$/.test(String(corpo.seed ?? "")))
          return res.status(400).json({ erro: "carreira inválida" });
        await escrever(`placar?user_id=eq.${encodeURIComponent(alvoId)}&seed=eq.${corpo.seed}`, "DELETE");
        const alvo = await jogador(alvoId);
        await registrar(eu, "apagarRanking", alvo || { id: alvoId }, { seed: String(corpo.seed), nome: corpo.nome || null });
        return res.status(200).json({ ok: true });
      }
      case "admins": {
        const r = await supabaseServiceRole("admins?select=user_id,criado_em&order=criado_em.asc");
        if (!r.ok) throw new Error("admins falhou (" + r.status + ")");
        const l = await r.json();
        const comEmail = await Promise.all(l.map(async (a) => ({ ...a, email: ((await jogador(a.user_id)) || {}).email || null })));
        return res.status(200).json({ admins: comEmail, donoEmail: dono ? process.env.ADMIN_DONO_EMAIL : null });
      }
      case "addAdmin": {
        if (!dono) return res.status(403).json({ erro: "só o dono adiciona admin" });
        const email = String(corpo.email || "").trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ erro: "e-mail inválido" });
        const achados = await rpc("admin_listar_usuarios", { busca: email, limite: 5, deslocamento: 0 });
        const alvo = (achados || []).find((u) => String(u.email).toLowerCase() === email);
        if (!alvo) return res.status(404).json({ erro: "nenhuma conta com esse e-mail; a pessoa precisa criar a conta antes" });
        await escrever("admins", "POST", { user_id: alvo.id, adicionado_por: eu.id },
          { Prefer: "resolution=merge-duplicates,return=minimal" });
        await registrar(eu, "addAdmin", alvo, null);
        return res.status(200).json({ ok: true });
      }
      case "removerAdmin": {
        if (!dono) return res.status(403).json({ erro: "só o dono remove admin" });
        await escrever(`admins?user_id=eq.${encodeURIComponent(alvoId)}`, "DELETE");
        const alvo = await jogador(alvoId);
        await registrar(eu, "removerAdmin", alvo || { id: alvoId }, null);
        return res.status(200).json({ ok: true });
      }
      case "registro": {
        const r = await supabaseServiceRole("admin_log?select=admin_email,acao,alvo_email,detalhe,criado_em&order=criado_em.desc&limit=100");
        if (!r.ok) throw new Error("registro falhou (" + r.status + ")");
        return res.status(200).json({ registro: await r.json() });
      }
      default:
        return res.status(400).json({ erro: "ação desconhecida" });
    }
  } catch (e) {
    console.log("admin", corpo.acao, e.message);
    return res.status(502).json({ erro: "não deu certo: " + e.message });
  }
}
