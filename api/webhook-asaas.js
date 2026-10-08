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
 *    confirmado) processa normalmente. Ativação é por PAGAMENTO, não por
 *    evento (2026-09-28): cartão manda PAYMENT_CONFIRMED e depois
 *    PAYMENT_RECEIVED, e cada um somava 30 dias.
 *
 * Nomes de evento/status/cabeçalho confirmados em docs.asaas.com
 * (payment-events, webhook-para-cobrancas, recuperar-uma-unica-cobranca)
 * em 2026-09-21 — não é suposição.
 *
 * Responde 200 pra tudo que não é falha de autenticação/config, mesmo
 * quando não faz nada com o evento — é assim que se diz "recebido,
 * não reenvie" pra Asaas, mesmo em caso de evento irrelevante ou já
 * processado. Exceção (2026-09-28): se a GRAVAÇÃO no Supabase falhar,
 * responde 500 pra Asaas tentar de novo; antes a falha era engolida e o
 * pagamento ficava marcado como processado sem o Pro ter sido ativado.
 *
 * Desde 2026-09-28 o webhook não é o único caminho: quem volta pro jogo
 * depois de pagar confere direto na Asaas (api/confirmar-pagamento.js).
 * Os dois usam api/_pro.js e um pagamento ativa uma vez só.
 *
 * Cada caminho de saída escreve uma linha no log ("webhook-asaas ..."),
 * sem segredo nenhum: `vercel logs` logo depois de um pagamento mostra
 * onde parou.
 */

import {
  EVENTOS_ATIVACAO, jaProcessado, registrarProcessado, buscarPagamento,
  pagamentoValido, ativarPro, desativarPro, reservarAtivacao, liberarReserva,
} from "./_pro.js";

const EVENTOS_CONFIRMACAO = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const EVENTOS_ESTORNO = new Set(["PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED"]);
const log = (...a) => console.log("webhook-asaas", ...a);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const tokenRecebido = req.headers["asaas-access-token"];
  if (!process.env.ASAAS_WEBHOOK_TOKEN || tokenRecebido !== process.env.ASAAS_WEBHOOK_TOKEN) {
    log("401 token", !!process.env.ASAAS_WEBHOOK_TOKEN ? "não confere" : "ASAAS_WEBHOOK_TOKEN ausente");
    return res.status(401).end(); // se o token não bate, reenviar não ajuda em nada
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.ASAAS_API_KEY) {
    log("config faltando", { supabase: !!process.env.SUPABASE_SERVICE_ROLE_KEY, asaas: !!process.env.ASAAS_API_KEY });
    return res.status(200).end(); // painel mal configurado não é problema do remetente
  }

  const corpo = req.body || {};
  const eventoNome = corpo.event;
  const paymentId = corpo.payment && corpo.payment.id;
  if (!paymentId) { log("sem payment.id", eventoNome); return res.status(200).end(); }
  if (!EVENTOS_CONFIRMACAO.has(eventoNome) && !EVENTOS_ESTORNO.has(eventoNome)) {
    log("evento ignorado", eventoNome, paymentId); // ex. PAYMENT_CREATED
    return res.status(200).end();
  }
  const ehAtivacao = EVENTOS_CONFIRMACAO.has(eventoNome);
  if (await jaProcessado(paymentId, ehAtivacao ? EVENTOS_ATIVACAO : [eventoNome])) {
    log("já processado", eventoNome, paymentId);
    return res.status(200).end();
  }

  let pagamentoReal;
  try { pagamentoReal = await buscarPagamento(paymentId); } catch { pagamentoReal = null; }
  if (!pagamentoReal) { log("GET na Asaas falhou", paymentId); return res.status(200).end(); }

  const userId = pagamentoReal.externalReference;
  if (!userId) { log("cobrança sem externalReference", paymentId); return res.status(200).end(); }

  try {
    if (ehAtivacao) {
      if (!pagamentoValido(pagamentoReal)) {
        log("não ativa", paymentId, pagamentoReal.status, pagamentoReal.value);
      } else if (!(await reservarAtivacao({ ...pagamentoReal, id: paymentId }, userId))) {
        log("ativação já feita ou em andamento em outra chamada", paymentId);
      } else {
        try {
          const ate = await ativarPro(userId, pagamentoReal.customer, paymentId);
          await registrarProcessado(paymentId, userId, eventoNome, pagamentoReal.status, pagamentoReal.value);
          log("Pro ativado", paymentId, "até", ate);
        } catch (e) { await liberarReserva(paymentId); throw e; }
      }
    } else if (pagamentoReal.status === "REFUNDED") {
      // reembolso PARCIAL não derruba o Pro (preço fixo, não fracionado);
      // só REFUNDED confirmado na Asaas desativa
      await desativarPro(userId);
      await registrarProcessado(paymentId, userId, eventoNome, pagamentoReal.status, pagamentoReal.value);
      log("Pro desativado (estorno)", paymentId);
    } else {
      log("estorno sem status REFUNDED", paymentId, pagamentoReal.status);
    }
  } catch (e) {
    log("falha gravando no Supabase", paymentId, e.message);
    return res.status(500).end(); // a Asaas reenvia; nada foi marcado como processado
  }

  return res.status(200).end();
}
