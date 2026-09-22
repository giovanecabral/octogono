/**
 * api/webhook-asaas.js — recebe confirmação/estorno de pagamento da
 * Asaas e ativa/desativa o Plano Pro. Roda na Vercel.
 *
 * Variáveis de ambiente necessárias: ASAAS_WEBHOOK_TOKEN (o mesmo
 * token configurado no painel da Asaas em Integrações → Webhooks),
 * SUPABASE_SERVICE_ROLE_KEY, ASAAS_API_KEY. Nenhuma vai pro código.
 *
 * NUNCA confia no corpo do webhook sozinho — dois motivos:
 * 1) O header "asaas-access-token" prova que a origem É a Asaas (token
 *    configurado no painel deles), mas não prova que o pagamento
 *    ESPECÍFICO do corpo está confirmado agora — por isso todo evento
 *    relevante refaz um GET direto em /v3/payments/{id} antes de
 *    escrever qualquer coisa, e confere status E valor por lá, nunca
 *    pelo que veio no corpo do POST.
 * 2) A Asaas reenvia webhook que não respondeu 200 (até 5x). Por isso
 *    toda escrita passa antes por `pagamentos_processados` — chave
 *    (asaas_payment_id, evento), não só asaas_payment_id (um mesmo
 *    pagamento passa por MAIS de um evento real na vida dele:
 *    confirmação e, depois, talvez estorno — ver supabase_schema.sql).
 *    Reentrega do MESMO evento encontra a linha e não escreve de novo;
 *    um evento NOVO sobre o mesmo pagamento (ex. estorno depois de
 *    confirmado) processa normalmente.
 *
 * Nomes de evento/status/cabeçalho confirmados em docs.asaas.com
 * (payment-events, webhook-para-cobrancas, recuperar-uma-unica-cobranca)
 * em 2026-09-21 — não é suposição.
 *
 * Responde 200 pra tudo que não é falha de autenticação/config, mesmo
 * quando não faz nada com o evento — é assim que se diz "recebido,
 * não reenvie" pra Asaas, mesmo em caso de evento irrelevante ou já
 * processado.
 */

const SUPABASE_URL = "https://kapdpipwqkumzschctnj.supabase.co";
const ASAAS_URL = "https://api.asaas.com/v3";
const PRECO_PRO_MINIMO = 9.9; // trava contra cobrança de teste/valor errado (o plano custa R$9,99 fixo — floor um pouco abaixo pra não brigar com arredondamento de ponto flutuante no valor exato)

const EVENTOS_CONFIRMACAO = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const EVENTOS_ESTORNO = new Set(["PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED"]);

async function supabaseServiceRole(path, options = {}) {
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

async function jaProcessado(paymentId, evento) {
  const r = await supabaseServiceRole(
    `pagamentos_processados?asaas_payment_id=eq.${encodeURIComponent(paymentId)}&evento=eq.${encodeURIComponent(evento)}&select=asaas_payment_id`
  );
  if (!r.ok) return false; // erro de leitura: segue e tenta processar, nunca trava a fila indefinidamente
  const linhas = await r.json();
  return Array.isArray(linhas) && linhas.length > 0;
}

async function registrarProcessado(paymentId, userId, evento, status, valor) {
  await supabaseServiceRole("pagamentos_processados", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ asaas_payment_id: paymentId, user_id: userId, evento, status, valor }),
  });
}

const DIAS_POR_PAGAMENTO = 30;

/* 2026-09-22: R$9,99 não é mais "pagamento único pra sempre" — libera
   30 dias. Sem cobrança automática nenhuma (não é assinatura recorrente
   da Asaas), então cada pagamento confirmado SOMA 30 dias — a partir de
   AGORA se já tinha expirado (ou nunca teve), ou a partir do fim do
   período ainda ativo, se a pessoa renovou antes de expirar (senão
   renovar cedo desperdiçaria os dias que ainda restavam). */
async function expiraEmAtual(userId) {
  const r = await supabaseServiceRole(
    `assinaturas?user_id=eq.${encodeURIComponent(userId)}&select=expira_em`
  );
  if (!r.ok) return null;
  const linhas = await r.json();
  return Array.isArray(linhas) && linhas.length > 0 ? linhas[0].expira_em : null;
}

async function ativarPro(userId, customerId, paymentId) {
  const atual = await expiraEmAtual(userId);
  const agora = Date.now();
  const base = atual && new Date(atual).getTime() > agora ? new Date(atual).getTime() : agora;
  const novaExpiracao = new Date(base + DIAS_POR_PAGAMENTO * 24 * 3600 * 1000).toISOString();
  await supabaseServiceRole("assinaturas", {
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
}

async function desativarPro(userId) {
  // estorno revoga NA HORA, independente de quanto ainda faltava do
  // período — coerente com o direito de arrependimento dos Termos
  // (seção 6): confirmado o estorno, acesso cai imediatamente.
  await supabaseServiceRole(`assinaturas?user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ pro: false, expira_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }),
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const tokenRecebido = req.headers["asaas-access-token"];
  if (!process.env.ASAAS_WEBHOOK_TOKEN || tokenRecebido !== process.env.ASAAS_WEBHOOK_TOKEN)
    return res.status(401).end(); // única resposta != 200 do handler — se o token não bate, reenviar não ajuda em nada
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.ASAAS_API_KEY)
    return res.status(200).end(); // painel mal configurado não é problema do remetente — não fica reenviando pra sempre

  const corpo = req.body || {};
  const eventoNome = corpo.event;
  const paymentId = corpo.payment && corpo.payment.id;
  if (!paymentId) return res.status(200).end();
  if (!EVENTOS_CONFIRMACAO.has(eventoNome) && !EVENTOS_ESTORNO.has(eventoNome))
    return res.status(200).end(); // evento que não muda status Pro (ex. PAYMENT_CREATED) — ignora

  if (await jaProcessado(paymentId, eventoNome)) return res.status(200).end();

  let pagamentoReal;
  try {
    const r = await fetch(`${ASAAS_URL}/payments/${paymentId}`, {
      headers: { access_token: process.env.ASAAS_API_KEY },
    });
    if (!r.ok) return res.status(200).end();
    pagamentoReal = await r.json();
  } catch {
    return res.status(200).end();
  }

  const userId = pagamentoReal.externalReference;
  if (!userId) return res.status(200).end();

  if (EVENTOS_CONFIRMACAO.has(eventoNome)) {
    const statusConfirmado = pagamentoReal.status === "CONFIRMED" || pagamentoReal.status === "RECEIVED";
    if (statusConfirmado && Number(pagamentoReal.value) >= PRECO_PRO_MINIMO) {
      await ativarPro(userId, pagamentoReal.customer, paymentId);
      await registrarProcessado(paymentId, userId, eventoNome, pagamentoReal.status, pagamentoReal.value);
    }
  } else if (EVENTOS_ESTORNO.has(eventoNome)) {
    // reembolso PARCIAL não derruba o Pro — o plano é preço fixo, não
    // fracionado. Só um status REFUNDED de verdade (confirmado na Asaas,
    // nunca só pelo nome do evento) desativa.
    if (pagamentoReal.status === "REFUNDED") {
      await desativarPro(userId);
      await registrarProcessado(paymentId, userId, eventoNome, pagamentoReal.status, pagamentoReal.value);
    }
  }

  return res.status(200).end();
}
