/* Placar (revamp fase 3, 2026-09-27): ÚNICO jeito de gravar no ranking.
   A tabela `placar` não tem policy de escrita pro usuário (ver
   supabase_schema.sql): quem grava é este endpoint, com a service role,
   depois de conferir a sessão (JWT), as regras de _placar-regras.js e o
   limite de envios. O user_id gravado vem SEMPRE do token, nunca do corpo.

   Variáveis na Vercel: SUPABASE_SERVICE_ROLE_KEY (a mesma do webhook da
   Asaas). Nenhuma chave no código além da anon, que é pública. */
import { validarEnvio } from "./_placar-regras.js";

const SUPABASE_URL = "https://kapdpipwqkumzschctnj.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImthcGRwaXB3cWt1bXpzY2hjdG5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4MzM5OTcsImV4cCI6MjEwNDQwOTk5N30.OSGFGA98NiuWdb6wzF-NJUIxSwClgG3ZA0PnHvJC6Ug";
const LIMITE_DIA = 20;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ erro: "método não permitido" });
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service) return res.status(503).json({ erro: "placar não configurado" });

  const token = String((req.headers && (req.headers.authorization || req.headers.Authorization)) || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ erro: "sem sessão" });
  let userId = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
    if (r.ok) userId = (await r.json()).id || null;
  } catch { /* rede: trata como sessão inválida */ }
  if (!userId) return res.status(401).json({ erro: "sessão inválida" });

  const corpo = typeof req.body === "string" ? (() => { try { return JSON.parse(req.body); } catch { return null; } })() : req.body;
  const v = validarEnvio(corpo);
  if (!v.ok) return res.status(400).json({ erro: v.erro });

  const cab = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
  try {
    const desde = new Date(Date.now() - 864e5).toISOString();
    const cont = await fetch(`${SUPABASE_URL}/rest/v1/placar?select=seed&user_id=eq.${userId}&criado_em=gte.${encodeURIComponent(desde)}`, { headers: cab });
    const hoje = cont.ok ? (await cont.json()).length : 0;
    if (hoje >= LIMITE_DIA) return res.status(429).json({ erro: "limite de envios do dia" });
    const g = await fetch(`${SUPABASE_URL}/rest/v1/placar`, {
      method: "POST",
      headers: { ...cab, Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ ...v.linha, user_id: userId }),
    });
    if (!g.ok) return res.status(502).json({ erro: "falha ao gravar" });
  } catch {
    return res.status(502).json({ erro: "falha ao gravar" });
  }
  return res.status(200).json({ ok: true });
}
