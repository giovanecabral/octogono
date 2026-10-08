/**
 * api/confirmar-pagamento.js — o jogador voltou pro jogo depois de pagar:
 * confere DIRETO na Asaas se alguma cobrança dele está paga e ativa o Pro
 * na hora, sem depender do webhook chegar (2026-09-28: pagamento real de
 * teste ficou sem Pro porque o webhook não ativou, e o jogo não tinha
 * outro caminho). Roda na Vercel.
 *
 * Seguro por construção:
 * - quem chama prova quem é com o próprio token do Supabase (nunca um id
 *   no corpo); só as cobranças com externalReference = id DESSA conta
 *   entram na conta;
 * - status e valor vêm do GET na Asaas, não do cliente;
 * - um pagamento ativa uma vez só (api/_pro.js, EVENTOS_ATIVACAO), então
 *   chamar de novo, ou o webhook chegar depois, não soma dias a mais.
 *
 * Variáveis de ambiente: SUPABASE_SERVICE_ROLE_KEY, ASAAS_API_KEY.
 */
import {
  SUPABASE_URL, EVENTOS_ATIVACAO, jaProcessado, registrarProcessado,
  pagamentosDaConta, pagamentoValido, ativarPro, supabaseServiceRole,
  reservarAtivacao, liberarReserva,
} from "./_pro.js";

/* mesma anon key pública de api/ai.js e api/criar-pagamento.js */
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImthcGRwaXB3cWt1bXpzY2hjdG5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4MzM5OTcsImV4cCI6MjEwNDQwOTk5N30.OSGFGA98NiuWdb6wzF-NJUIxSwClgG3ZA0PnHvJC6Ug";
const log = (...a) => console.log("confirmar-pagamento", ...a);

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

async function assinaturaAtual(userId) {
  const r = await supabaseServiceRole(
    `assinaturas?user_id=eq.${encodeURIComponent(userId)}&select=pro,expira_em`
  );
  if (!r.ok) return null;
  const l = await r.json();
  return Array.isArray(l) && l.length ? l[0] : null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ erro: "só POST" });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.ASAAS_API_KEY)
    return res.status(503).json({ erro: "pagamento não configurado" });

  const { token } = req.body || {};
  const usuario = await usuarioDoToken(token);
  if (!usuario) return res.status(401).json({ erro: "sessão inválida, entre na conta de novo" });

  let cobrancas;
  try { cobrancas = await pagamentosDaConta(usuario.id); } catch { cobrancas = null; }
  if (!cobrancas) { log("lista na Asaas falhou", usuario.id); return res.status(502).json({ erro: "não deu pra falar com a Asaas" }); }

  let ativados = 0;
  try {
    for (const p of cobrancas) {
      if (p.externalReference !== usuario.id || !pagamentoValido(p)) continue;
      if (await jaProcessado(p.id, EVENTOS_ATIVACAO)) continue;
      if (!(await reservarAtivacao(p, usuario.id))) continue;   // outra chamada já ativou ou está ativando
      try {
        const ate = await ativarPro(usuario.id, p.customer, p.id);
        await registrarProcessado(p.id, usuario.id, "CONFIRMADO_NO_RETORNO", p.status, p.value);
        ativados++;
        log("Pro ativado no retorno", p.id, "até", ate);
      } catch (e) { await liberarReserva(p.id); throw e; }
    }
  } catch (e) {
    log("falha gravando no Supabase", usuario.id, e.message);
    return res.status(502).json({ erro: "não deu pra ativar agora, tenta de novo" });
  }

  const a = await assinaturaAtual(usuario.id);
  const pendentes = cobrancas.filter(p => p.externalReference === usuario.id && !pagamentoValido(p)
    && ["PENDING", "AWAITING_RISK_ANALYSIS", "CONFIRMATION_PENDING"].includes(p.status)).length;
  return res.status(200).json({
    ativados,
    pro: !!(a && a.pro && (!a.expira_em || new Date(a.expira_em).getTime() > Date.now())),
    expira_em: a ? a.expira_em : null,
    pendentes,
  });
}
