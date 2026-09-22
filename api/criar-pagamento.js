/**
 * api/criar-pagamento.js — cria a cobrança do Plano Pro na Asaas.
 * Roda na Vercel (pasta /api = serverless), mesmo padrão de api/ai.js.
 *
 * Variáveis de ambiente necessárias: ASAAS_API_KEY, TERMOS_PUBLICADOS
 * (string "true" pra ligar — qualquer outro valor, incluindo ausente,
 * mantém o endpoint desligado). Nenhuma das duas vai pro código — as
 * duas são painel da Vercel, mesmo padrão de OPENROUTER_API_KEY.
 *
 * TERMOS_PUBLICADOS é o portão de verdade do pagamento: enquanto
 * ausente/diferente de "true", este endpoint recusa com 503, mesmo que
 * alguém chame direto por fora da interface (DevTools, curl). O cliente
 * (index.html, renderPlanoPro) não lê essa flag antes — só tenta a
 * chamada real e mostra a mensagem que o 503 devolve.
 */

const SUPABASE_URL = "https://kapdpipwqkumzschctnj.supabase.co";
/* Mesma anon key pública de api/ai.js — pública de propósito, ver
   comentário lá. Duplicada aqui porque este arquivo não importa daquele
   (cada função serverless da Vercel é isolada). */
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImthcGRwaXB3cWt1bXpzY2hjdG5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4MzM5OTcsImV4cCI6MjEwNDQwOTk5N30.OSGFGA98NiuWdb6wzF-NJUIxSwClgG3ZA0PnHvJC6Ug";
const ASAAS_URL = "https://api.asaas.com/v3";
const PRECO_PRO = 9.99;

/* Troca o JWT do usuário pelo próprio usuário — não usa service_role
   aqui, de propósito: este endpoint só cria uma cobrança em nome de
   quem provar, com o próprio token, que é dono da sessão. Quem escreve
   "pro=true" de fato é só o webhook (api/webhook-asaas.js), depois de
   confirmar o pagamento direto na Asaas — este arquivo nunca toca a
   tabela assinaturas. */
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

/* Módulo 11, o algoritmo de sempre — só recusa CPF obviamente inválido
   ANTES de gastar uma chamada na Asaas. Não é validação de posse (isso
   é problema da Asaas/do meio de pagamento escolhido pelo usuário no
   checkout, nunca deste servidor). */
function cpfValido(cpf) {
  const s = String(cpf || "").replace(/\D/g, "");
  if (s.length !== 11 || /^(\d)\1{10}$/.test(s)) return false;
  const calc = (len) => {
    let soma = 0;
    for (let i = 0; i < len; i++) soma += Number(s[i]) * (len + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(s[9]) && calc(10) === Number(s[10]);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "só POST" });

  if (process.env.TERMOS_PUBLICADOS !== "true")
    return res.status(503).json({ error: "pagamento ainda não disponível nesta versão" });
  if (!process.env.ASAAS_API_KEY)
    return res.status(500).json({ error: "ASAAS_API_KEY não configurada" });

  const { token, cpf } = req.body || {};
  const usuario = await usuarioDoToken(token);
  if (!usuario) return res.status(401).json({ error: "sessão inválida — entre na conta de novo" });
  if (!cpfValido(cpf)) return res.status(400).json({ error: "CPF inválido" });
  // sem trava de "já é Pro" — cada pagamento confirmado SOMA 30 dias
  // (ver ativarPro() em api/webhook-asaas.js), então renovar antes de
  // expirar é uso normal, não erro

  const headersAsaas = { access_token: process.env.ASAAS_API_KEY, "Content-Type": "application/json" };

  try {
    const rCliente = await fetch(`${ASAAS_URL}/customers`, {
      method: "POST",
      headers: headersAsaas,
      body: JSON.stringify({
        name: usuario.email,
        cpfCnpj: String(cpf).replace(/\D/g, ""),
        email: usuario.email,
        externalReference: usuario.id,
      }),
    });
    const cliente = await rCliente.json();
    if (!rCliente.ok || !cliente.id)
      return res.status(502).json({ error: "falha ao criar cliente na Asaas" });

    const vencimento = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    const rPagamento = await fetch(`${ASAAS_URL}/payments`, {
      method: "POST",
      headers: headersAsaas,
      body: JSON.stringify({
        customer: cliente.id,
        billingType: "UNDEFINED", // usuário escolhe Pix ou cartão na página hospedada da Asaas
        value: PRECO_PRO,
        dueDate: vencimento,
        externalReference: usuario.id, // é isto que o webhook lê pra saber de qual conta é o pagamento
        description: "Octógono — Plano Pro (30 dias)",
      }),
    });
    const pagamento = await rPagamento.json();
    if (!rPagamento.ok || !pagamento.invoiceUrl)
      return res.status(502).json({ error: "falha ao criar cobrança na Asaas" });

    return res.status(200).json({ invoiceUrl: pagamento.invoiceUrl });
  } catch {
    return res.status(502).json({ error: "falha ao falar com a Asaas" });
  }
}
