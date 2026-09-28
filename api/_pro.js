/**
 * api/_pro.js — o que o webhook da Asaas (api/webhook-asaas.js) e a
 * conferência de retorno (api/confirmar-pagamento.js) fazem igual: ler a
 * cobrança DIRETO na Asaas, ativar 30 dias de Pro e registrar que aquele
 * pagamento já ativou. O "_" no nome faz a Vercel não publicar como rota.
 *
 * Variáveis de ambiente: SUPABASE_SERVICE_ROLE_KEY, ASAAS_API_KEY.
 * Nenhuma vai pro código.
 */

export const SUPABASE_URL = "https://kapdpipwqkumzschctnj.supabase.co";
export const ASAAS_URL = "https://api.asaas.com/v3";
/* trava contra cobrança de teste/valor errado (o plano custa R$9,99 fixo;
   um pouco abaixo pra não brigar com arredondamento) */
export const PRECO_PRO_MINIMO = 9.9;
export const DIAS_POR_PAGAMENTO = 30;
export const STATUS_PAGO = new Set(["CONFIRMED", "RECEIVED"]);

/* Tudo que ATIVA 30 dias. Cartão manda os dois eventos da Asaas
   (confirmado na aprovação, recebido quando o dinheiro cai) e a
   conferência de retorno pode chegar antes ou depois deles: um pagamento
   ativa UMA vez só, venha por onde vier (achado 2026-09-28: com a chave
   por evento, o cartão ganhava 60 dias). */
export const EVENTOS_ATIVACAO = ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "CONFIRMADO_NO_RETORNO"];

export async function supabaseServiceRole(path, options = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

/* Leitura que falha segue em frente (false): nunca trava a ativação. */
export async function jaProcessado(paymentId, eventos) {
  const lista = Array.isArray(eventos) ? eventos : [eventos];
  const r = await supabaseServiceRole(
    `pagamentos_processados?asaas_payment_id=eq.${encodeURIComponent(paymentId)}` +
    `&evento=in.(${lista.map(encodeURIComponent).join(",")})&select=asaas_payment_id`
  );
  if (!r.ok) return false;
  const linhas = await r.json();
  return Array.isArray(linhas) && linhas.length > 0;
}

export async function registrarProcessado(paymentId, userId, evento, status, valor) {
  const r = await supabaseServiceRole("pagamentos_processados", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ asaas_payment_id: paymentId, user_id: userId, evento, status, valor }),
  });
  if (!r.ok) throw new Error("registro do pagamento falhou (" + r.status + ")");
}

/* A cobrança como a Asaas diz que está AGORA (nunca o corpo do webhook). */
export async function buscarPagamento(paymentId) {
  const r = await fetch(`${ASAAS_URL}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { access_token: process.env.ASAAS_API_KEY },
  });
  if (!r.ok) return null;
  return r.json();
}

/* Cobranças de uma conta (externalReference = id do usuário, gravado por
   api/criar-pagamento.js). */
export async function pagamentosDaConta(userId) {
  const r = await fetch(
    `${ASAAS_URL}/payments?externalReference=${encodeURIComponent(userId)}&limit=20`,
    { headers: { access_token: process.env.ASAAS_API_KEY } }
  );
  if (!r.ok) return null;
  const j = await r.json();
  return Array.isArray(j && j.data) ? j.data : [];
}

export const pagamentoValido = (p) =>
  !!p && STATUS_PAGO.has(p.status) && Number(p.value) >= PRECO_PRO_MINIMO;

async function expiraEmAtual(userId) {
  const r = await supabaseServiceRole(
    `assinaturas?user_id=eq.${encodeURIComponent(userId)}&select=expira_em`
  );
  if (!r.ok) return null;
  const linhas = await r.json();
  return Array.isArray(linhas) && linhas.length > 0 ? linhas[0].expira_em : null;
}

/* Cada pagamento SOMA 30 dias: a partir de agora se já expirou (ou nunca
   teve), ou do fim do período ainda ativo, se renovou antes de expirar.
   Devolve a data nova; falha de escrita vira exceção (quem chama NÃO pode
   marcar o pagamento como processado nesse caso). */
export async function ativarPro(userId, customerId, paymentId) {
  const atual = await expiraEmAtual(userId);
  const agora = Date.now();
  const base = atual && new Date(atual).getTime() > agora ? new Date(atual).getTime() : agora;
  const novaExpiracao = new Date(base + DIAS_POR_PAGAMENTO * 24 * 3600 * 1000).toISOString();
  const r = await supabaseServiceRole("assinaturas", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      pro: true,
      plano: "mensal",
      asaas_customer_id: customerId,
      asaas_payment_id: paymentId,
      expira_em: novaExpiracao,
      atualizado_em: new Date().toISOString(),
    }),
  });
  if (!r.ok) throw new Error("ativação do Pro falhou (" + r.status + ")");
  return novaExpiracao;
}

export async function desativarPro(userId) {
  // estorno revoga NA HORA, independente de quanto ainda faltava do
  // período (Termos, seção 6).
  const r = await supabaseServiceRole(`assinaturas?user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ pro: false, expira_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error("desativação do Pro falhou (" + r.status + ")");
}
