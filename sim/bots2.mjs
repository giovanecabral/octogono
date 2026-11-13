/* Fase 5: uma luta do jogador modelo contra o bot do combate v2, pelo caminho
   do servidor. Usada pelo trabalhador da simulação (parte bots) e pela suíte
   jxjbot. Os dois mostram postura antes: o bot pela semente (sinalDoBot2); o
   jogador modelo (atenta) mostra a categoria da carta e, ISCA_MODELO das
   vezes, outra (se tiver energia pra fintar). O bot joga cego (cartaDoBot2,
   sem a carta do jogador) e lê as trocas no formato do banco. */
import * as M from "../api/_jxj-combate2.js";
import * as C from "../api/_jxj-cartas.js";
import * as B2 from "../api/_jxj-bot2.js";
import { perfilLuta2, custoFinta } from "../api/_jxj-luta2.js";
import { atenta } from "./politicas.mjs";

export const ISCA_MODELO = 0.3;
export function gerador(n) {
  let s = n >>> 0;
  return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/* jogador: {estilo, categoria, build}; bot: {estilo, categoria, build, pers, s};
   ladoBot "a" ou "b"; semente (texto) e n (número) decidem a luta.
   Devolve o fim da luta, quem é quem e as trocas. */
export function lutaContraBot2({ jogador, bot, ladoBot = "b", semente, n }) {
  const ele = ladoBot, eu = ele === "a" ? "b" : "a", r = gerador(n * 7919 + 13);
  const perfis = { [eu]: perfilLuta2(jogador), [ele]: perfilLuta2(bot) };
  /* a roda do Inquieto: uma ordem das 4 categorias por luta */
  const rr = gerador(n * 104729 + 1), roda = [...C.CATEGORIAS_CARTA];
  for (let k = roda.length - 1; k > 0; k--) { const j = Math.floor(rr() * (k + 1)); [roda[k], roda[j]] = [roda[j], roda[k]]; }
  const dados = { v: B2.VERSAO_BOT2, s: bot.s, pers: bot.pers, estilo: bot.estilo, roda };
  const pol = atenta("aval"), trocas = [];
  let e = M.novaLuta2(perfis.a, perfis.b, semente), k = 0;
  while (!e.fim && k++ < 40) {
    const carta = pol(e, eu, perfis, r).carta, c = C.CARTAS[carta].categoria;
    const outras = [...new Set(e.mao[eu].map((id) => C.CARTAS[id].categoria))].filter((x) => x !== c);
    const isca = outras.length && e[eu].energia >= custoFinta(e, eu, perfis[eu]) + C.CARTAS[carta].custo && r() < ISCA_MODELO;
    const sinais = { [eu]: isca ? outras[Math.floor(r() * outras.length)] : c,
      [ele]: B2.sinalDoBot2({ estado: e, semente, trocas, dados, perfis, lado: ele }) };
    const cb = B2.cartaDoBot2({ estado: e, semente, trocas, dados, perfis, lado: ele, sinais });
    const res = M.resolverTroca2(e, perfis, { [eu]: carta, [ele]: cb, sinais }, semente);
    trocas.push({ round: e.round, troca: e.troca, acao_a: res.resolucao.cartas.a.id, acao_b: res.resolucao.cartas.b.id, eventos: [{ tipo: "resolucao", ...res.resolucao }, ...res.eventos] });
    e = res.estado;
  }
  return { fim: e.fim, eu, ele, trocas };
}
