/* JxJ: regras de progressão, economia, conquistas, nome e textos públicos
   (spec docs/superpowers/specs/2026-10-01-jxj-design.md, seções 4, 5 e 8).
   Funções puras: o servidor (api/jxj.js) aplica, o banco grava, a suíte
   jxj confere. Nenhum número aqui vem do cliente. */
import { nomeAceito } from "./_placar-regras.js";

export const NIVEL_MAX = 30;
export const SLOTS_FREE = 1, SLOTS_PRO = 3;
export const TROCA_PRINCIPAL_HORAS = 72;
export const CUSTO_RESPEC = 400;
export const LUTAS_DIA_XP_CHEIO = 10;
export const TETO_FICHAS_DIA = 120;
export const PAR_RATING_24H = 3;          // o mesmo par vale rating no máximo 3 vezes em 24 h
export const CONFIRMACAO_MS = 20000;
export const REVANCHE_MS = 60000;
export const SINAL_FILA_MS = 12000;       // fila só pareia quem deu sinal de vida há pouco
export const BLOQUEIO_RECUSA_MS = 60000;  // quem não confirmou o par fica 60 s fora da fila
export const TOLERANCIA = { base: 100, porDezSeg: 25, max: 400 };
export const TEMPORADA_DIAS = 56;
export const TORNEIO_VAGAS = 8;
export const TORNEIO_JANELA_H = 24;
export const TORNEIO_LUTAS_MIN = 3;

/* XP pra passar do nível n pro n+1 */
export const xpProximo = (n) => (n >= NIVEL_MAX ? Infinity : 80 + 20 * n);
export function nivelDoXp(xp) {
  let n = 1, resto = Math.max(0, Math.floor(xp));
  while (n < NIVEL_MAX && resto >= xpProximo(n)) { resto -= xpProximo(n); n++; }
  return { nivel: n, noNivel: resto, proximo: xpProximo(n) };
}
export const xpTotalAte = (nivel) => { let t = 0; for (let n = 1; n < nivel; n++) t += xpProximo(n); return t; };

/* XP de uma luta encerrada pra um lado. lutasHoje = lutas do lutador nas
   últimas 24 h ANTES desta. */
export function xpDaLuta({ resultado, metodo, lutasHoje = 0, comRating = true }) {
  let xp;
  if (metodo === "WO") xp = resultado === "vitoria" ? 40 : 0;
  else if (metodo === "ANULADA") xp = 0;
  else xp = resultado === "vitoria" ? 120 : resultado === "empate" ? 90 : 70;
  if (resultado === "vitoria" && ["KO", "TKO", "FIN"].includes(metodo)) xp += 30;
  if (!comRating) xp = Math.floor(xp / 2);
  if (lutasHoje >= LUTAS_DIA_XP_CHEIO) xp = Math.floor(xp / 2);
  return xp;
}
/* Fichas de uma luta (teto diário por conta conferido no banco) */
export function fichasDaLuta({ resultado, metodo, comRating = true }) {
  if (!comRating || metodo === "ANULADA" || (metodo === "WO" && resultado !== "vitoria")) return 0;
  return 10 + (resultado === "vitoria" ? 10 : 0);
}
export const FICHAS_TORNEIO = { campeao: 300, vice: 150, semifinal: 75, quartas: 30 };
export const XP_TORNEIO = { participacao: 150, campeao: 400, vice: 250, semifinal: 150, quartas: 0 };
/* Recompensa de fim de temporada por posição na categoria */
export function recompensaTemporada(posicao, total) {
  if (posicao === 1) return { fichas: 500, selo: "campeao" };
  if (posicao <= 10) return { fichas: 250, selo: "top10" };
  if (posicao <= Math.ceil(total / 2)) return { fichas: 100, selo: "top50" };
  return { fichas: 40, selo: "participou" };
}

/* Cosmético: moldura do retrato. Só aparência. */
export const MOLDURAS = {
  padrao: { nome: "Padrão", preco: 0 },
  ouro: { nome: "Ouro", preco: 400 },
  sangue: { nome: "Sangue", preco: 300 },
  noite: { nome: "Noite", preco: 250 },
  campeao: { nome: "Cinturão", preco: null, req: "titulo" },   // só pra quem tem título
};

/* Conquistas JxJ: id -> {nome, desc}. Quem confere é o servidor, com os
   números do banco. */
export const CONQUISTAS = {
  primeira_vitoria: { nome: "Primeira vitória", desc: "Venceu a primeira luta no JxJ." },
  primeiro_nocaute: { nome: "Primeiro nocaute", desc: "Venceu por nocaute ou nocaute técnico." },
  primeira_finalizacao: { nome: "Primeira finalização", desc: "Venceu por finalização." },
  vitorias_10: { nome: "10 vitórias", desc: "Chegou a 10 vitórias com este lutador." },
  vitorias_50: { nome: "50 vitórias", desc: "Chegou a 50 vitórias com este lutador." },
  nivel_30: { nome: "Nível 30", desc: "Chegou ao nível máximo." },
  revanche: { nome: "Revanche vencida", desc: "Venceu quem tinha vencido ele na luta anterior entre os dois." },
  virada: { nome: "Virada", desc: "Venceu depois de perder os dois primeiros rounds nos cartões." },
  campeao_torneio: { nome: "Campeão de torneio", desc: "Venceu um torneio de 8." },
  top10_temporada: { nome: "Top 10 da temporada", desc: "Terminou uma temporada entre os 10 primeiros da categoria." },
};
/* Conquistas novas depois de uma luta. ctx: {vitorias, nivel, venceu, metodo,
   perdeuUltimaParaEle, cartoes (lista {meu, dele}), ja: Set de ids} */
export function conquistasNovas(ctx) {
  const novas = [];
  const add = (id) => { if (!ctx.ja.has(id)) novas.push(id); };
  if (ctx.venceu) {
    add("primeira_vitoria");
    if (ctx.metodo === "KO" || ctx.metodo === "TKO") add("primeiro_nocaute");
    if (ctx.metodo === "FIN") add("primeira_finalizacao");
    if (ctx.perdeuUltimaParaEle) add("revanche");
    const c = ctx.cartoes || [];
    if (c.length >= 3 && c[0].meu < c[0].dele && c[1].meu < c[1].dele) add("virada");
  }
  if (ctx.vitorias >= 10) add("vitorias_10");
  if (ctx.vitorias >= 50) add("vitorias_50");
  if (ctx.nivel >= NIVEL_MAX) add("nivel_30");
  return novas;
}

/* Nome do lutador: 2 a 24 caracteres, letras/números/espaço/hífen/apóstrofo,
   e a mesma lista de ofensa do placar. */
export function nomeLutadorValido(nome) {
  const n = String(nome || "").trim().replace(/\s+/g, " ");
  if (n.length < 2 || n.length > 24) return { ok: false, erro: "o nome precisa ter de 2 a 24 caracteres" };
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '\-.]*$/u.test(n)) return { ok: false, erro: "use só letras, números, espaço, hífen e apóstrofo" };
  if (!nomeAceito(n)) return { ok: false, erro: "esse nome não pode ser usado" };
  return { ok: true, nome: n };
}

/* Tolerância de rating da fila pelo tempo de espera (ms) */
export const toleranciaFila = (esperaMs) =>
  Math.min(TOLERANCIA.max, TOLERANCIA.base + TOLERANCIA.porDezSeg * Math.floor(Math.max(0, esperaMs) / 10000));

/* Regra pública de ausência (aparece antes de entrar na fila) */
export const REGRA_AUSENCIA = [
  "Cada troca tem 20 segundos pra escolher a ação.",
  "Prazo perdido vira Defender automático.",
  "Dois prazos perdidos seguidos: a troca conta pro adversário.",
  "Três seguidos: derrota por W.O., com rating e histórico.",
  "Sair da página não cancela a luta: ela continua e você pode voltar.",
];
