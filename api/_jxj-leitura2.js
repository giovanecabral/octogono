/* A leitura de uma troca do combate v2 (Fase 5, 2026-11-13): a tabela das
   minhas cartas contra as que ele pode ter e a mistura de equilíbrio. Veio
   de sim/politicas.mjs sem mudar a conta (o jogador "atenta" da simulação)
   pra o bot do servidor (api/_jxj-bot2.js) usar a mesma. Só o que é
   público entra: o deck dele, o que ele já jogou no round e quantas cartas
   ele tem; a mão dele, nunca (a tabela troca a mão dele por uma hipótese). */
import { resolverTroca2 } from "./_jxj-combate2.js";

const outro = (l) => (l === "a" ? "b" : "a");

/* valor de um estado pro lado l (heurística simétrica: os dois lados usam a mesma) */
export const PESOS_VALOR2 = { vida: 3, pontos: 1, cartao: 12, cima: 4, nivelPos: 2, grogue: 6, encaixe: 8, energia: 0.8, iniciativa: 0.5 };
export function valor(e, l) {
  const o = outro(l), W = PESOS_VALOR2;
  if (e.fim) return e.fim.vencedor === l ? 1000 : e.fim.vencedor === o ? -1000 : 0;
  let v = W.vida * (e[l].vida - e[o].vida);
  const pt = e.pontos[e.round - 1] || { a: 0, b: 0 };
  v += W.pontos * (pt[l] - pt[o]);
  for (const c of e.cartoes) v += W.cartao * (c[l] - c[o]);
  if (e.pos === "cima_" + l) v += W.cima + W.nivelPos * e.nivelPos;
  else if (e.pos === "cima_" + o) v -= W.cima + W.nivelPos * e.nivelPos;
  if (e[l].grogue) v -= W.grogue;
  if (e[o].grogue) v += W.grogue;
  if (e.encaixe) v += e.encaixe.quem === l ? W.encaixe : -W.encaixe;
  v += W.energia * (e[l].energia - e[o].energia);
  if (e.iniciativa === l) v += W.iniciativa; else if (e.iniciativa === o) v -= W.iniciativa;
  return v;
}

/* o que ele pode ter na mão: o deck dele menos o que já jogou neste round; a mão é um sorteio de h cartas disso */
function poolDele(e, o) {
  const pool = e.deck[o].slice();
  for (const id of e.jogadas[o]) { const i = pool.indexOf(id); if (i >= 0) pool.splice(i, 1); }
  return pool;
}
const comb = (n, k) => { if (k < 0 || k > n) return 0; let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
/* chance de ele ter pelo menos uma cópia de cada tipo (hipergeométrica) */
function chanceDeTer(pool, h) {
  const conta = {};
  for (const id of pool) conta[id] = (conta[id] || 0) + 1;
  const N = pool.length, tot = comb(N, h);
  return Object.fromEntries(Object.entries(conta).map(([id, n]) => [id, 1 - comb(N - n, h) / tot]));
}

/* o estado com a carta dj na mão dele (o resto da mão, uma hipótese do que sobra no deck) */
const comCartaDele = (e, o, pool, h, dj) => ({ ...e, mao: { ...e.mao, [o]: [dj, ...pool.filter((id) => id !== dj).slice(0, h - 1)] } });

/* a tabela: minhas cartas (linhas) contra as dele (colunas), valor do estado depois da troca */
export function tabela(e, l, perfis, semente) {
  const o = outro(l), minhas = [...new Set(e.mao[l])];
  const pool = poolDele(e, o), h = e.mao[o].length;
  const p = chanceDeTer(pool, h), dele = Object.keys(p);
  const M = minhas.map((mi) => dele.map((dj) => {
    const r = resolverTroca2(comCartaDele(e, o, pool, h, dj), perfis, { [l]: mi, [o]: dj }, semente);
    return valor(r.estado, l);
  }));
  return { minhas, dele, p, M };
}
/* a coluna de uma carta dele que pode nem estar no que sobra (a última que ele jogou, por exemplo) */
export function colunaContra(e, l, perfis, semente, minhas, dj) {
  const o = outro(l), pool = poolDele(e, o), h = e.mao[o].length;
  return minhas.map((mi) => valor(resolverTroca2(comCartaDele(e, o, pool, h, dj), perfis, { [l]: mi, [o]: dj }, semente).estado, l));
}

/* o que ele joga contra a minha mistura x: a melhor carta que tiver (pela chance de ter cada uma) */
export function respostaDele(t, x) {
  const { minhas, dele, p, M } = t;
  const contraEle = dele.map((_, j) => minhas.reduce((s, _2, i) => s + x[i] * M[i][j], 0));
  const ordem = dele.map((_, j) => j).sort((a, b) => contraEle[a] - contraEle[b]);
  const y = new Array(dele.length).fill(0);
  let nenhumaMelhor = 1;
  for (const j of ordem) { y[j] = p[dele[j]] * nenhumaMelhor; nenhumaMelhor *= 1 - p[dele[j]]; }
  const sy = y.reduce((s, v) => s + v, 0) || 1;
  return y.map((v) => v / sy);
}
/* quanto cada carta minha rende contra a distribuição y dele */
export const ganhos = (t, y) => t.M.map((linha) => linha.reduce((s, v, j) => s + v * y[j], 0));

/* mistura de equilíbrio aproximada: eu respondo à média do que ele faria;
   ele joga a melhor carta que tiver (pela chance de ter cada uma) */
export function mistura(t, iter = 40) {
  const { minhas } = t;
  const conta = new Array(minhas.length).fill(0);
  let x = new Array(minhas.length).fill(1 / minhas.length);
  for (let it = 0; it < iter; it++) {
    const g = ganhos(t, respostaDele(t, x));
    /* eu: melhor resposta a y */
    let melhor = 0, mv = -Infinity;
    for (let i = 0; i < minhas.length; i++) if (g[i] > mv) { mv = g[i]; melhor = i; }
    conta[melhor]++;
    const tot = it + 1;
    x = conta.map((c) => c / tot);
  }
  return x;
}
