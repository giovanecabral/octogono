/**
 * api/_funil.js: o funil do lançamento (2026-11-19), a parte sem rede.
 * A lista fechada dos eventos, a ordem dos degraus, a sessão do "pagou" e
 * a montagem dos números que o painel de admin mostra. O "_" no nome faz
 * a Vercel não publicar como rota.
 *
 * A mesma lista está em supabase_funil.sql (check da tabela e
 * funil_registrar) e no index.html (FUNIL_EVENTOS); a suíte funil confere
 * as três.
 */
import crypto from "node:crypto";

/* Cada degrau e o degrau de onde ele vem (a conversão do painel é
   total do degrau / total do anterior). Três trilhas que saem de "abriu":
   a carreira, o Online e o Pro. */
export const FUNIL_DEGRAUS = [
  ["abriu", null],
  ["criou_conta", "abriu"],
  ["terminou_draft", "criou_conta"],
  ["terminou_luta_1", "terminou_draft"],
  ["terminou_carreira", "terminou_luta_1"],
  ["abriu_online", "abriu"],
  ["terminou_treino_online", "abriu_online"],
  ["luta_online_1", "terminou_treino_online"],
  ["viu_pro", "abriu"],
  ["iniciou_pagamento", "viu_pro"],
  ["pagou", "iniciou_pagamento"],
];
export const FUNIL_EVENTOS = FUNIL_DEGRAUS.map(([e]) => e);
export const FUNIL_DIAS = 14;

/* O servidor não conhece a sessão anônima do navegador: o "pagou" usa uma
   sessão tirada do id do pagamento na Asaas. Sempre a mesma pro mesmo
   pagamento, então o banco conta cada pagamento uma vez só, venha a
   ativação por onde vier. */
export function sessaoDoPagamento(paymentId) {
  const h = crypto.createHash("sha256").update("funil:pagou:" + String(paymentId)).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/* "YYYY-MM-DD" de São Paulo (o mesmo dia que o banco grava) */
export function diaSaoPaulo(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const pct = (n, base) => (base > 0 ? Math.round((1000 * n) / base) / 10 : null);

/* linhas = o que funil_por_dia devolve ({dia, evento, sessoes}). Devolve
   os últimos `dias` dias (o mais recente primeiro, dia sem nada com zero)
   e os degraus com o total do período e a conversão. Como cada sessão
   conta cada evento uma vez só, somar os dias dá as sessões distintas do
   período. */
export function montarFunil(linhas, hoje = diaSaoPaulo(), dias = FUNIL_DIAS) {
  const base = Date.parse(hoje + "T12:00:00Z");
  const lista = Array.from({ length: dias }, (_, i) => new Date(base - i * 864e5).toISOString().slice(0, 10));
  const porDia = Object.fromEntries(lista.map((d) => [d, Object.fromEntries(FUNIL_EVENTOS.map((e) => [e, 0]))]));
  for (const l of Array.isArray(linhas) ? linhas : []) {
    const d = String(l && l.dia || "").slice(0, 10);
    if (porDia[d] && FUNIL_EVENTOS.includes(l.evento)) porDia[d][l.evento] += Math.max(0, Math.floor(Number(l.sessoes) || 0));
  }
  const total = Object.fromEntries(FUNIL_EVENTOS.map((e) => [e, lista.reduce((s, d) => s + porDia[d][e], 0)]));
  return {
    eventos: FUNIL_EVENTOS,
    dias: lista.map((d) => ({ dia: d, n: porDia[d] })),
    degraus: FUNIL_DEGRAUS.map(([e, ant]) => ({
      evento: e, anterior: ant, total: total[e],
      doAnterior: ant ? pct(total[e], total[ant]) : null,
      deAbriu: e === "abriu" ? null : pct(total[e], total.abriu),
    })),
  };
}
