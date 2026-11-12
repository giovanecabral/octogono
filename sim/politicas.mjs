/* Jogadores da simulação do combate v2. Todos usam o motor de verdade
   (api/_jxj-combate2.js) pra avaliar as jogadas: nada da regra é
   reimplementado aqui.

   - aleatoria: uma carta qualquer da mão.
   - atenta: monta a tabela das cartas da mão contra as cartas que ele pode
     ter (o deck dele é público; a mão não), resolve cada par no motor,
     avalia o estado e joga a mistura de equilíbrio (jogo fictício) contra
     o jeito dele de escolher: a melhor carta que ele tiver.
   - oraculo(p): com chance p sabe a carta dele e joga a melhor resposta;
     senão, joga como a atenta. Mede quanto ler o adversário vale. */
import { resolverTroca2, L2 } from "../api/_jxj-combate2.js";
import { CARTAS } from "../api/_jxj-cartas.js";

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

/* a tabela: minhas cartas (linhas) contra as dele (colunas), valor do estado depois da troca */
export function tabela(e, l, perfis, semente) {
  const o = outro(l), minhas = [...new Set(e.mao[l])];
  const pool = poolDele(e, o), h = e.mao[o].length;
  const p = chanceDeTer(pool, h), dele = Object.keys(p);
  const M = minhas.map((mi) => dele.map((dj) => {
    const x = { ...e, mao: { ...e.mao, [o]: [dj, ...pool.filter((id) => id !== dj).slice(0, h - 1)] } };
    const r = resolverTroca2(x, perfis, { [l]: mi, [o]: dj }, semente);
    return valor(r.estado, l);
  }));
  return { minhas, dele, p, M };
}

/* mistura de equilíbrio aproximada: eu respondo à média do que ele faria;
   ele joga a melhor carta que tiver (pela chance de ter cada uma) */
export function mistura(t, iter = 40) {
  const { minhas, dele, p, M } = t;
  const conta = new Array(minhas.length).fill(0);
  let x = new Array(minhas.length).fill(1 / minhas.length);
  for (let it = 0; it < iter; it++) {
    /* ele: valor de cada coluna pra ele contra a minha mistura (soma zero) */
    const contraEle = dele.map((_, j) => minhas.reduce((s, _2, i) => s + x[i] * M[i][j], 0));
    const ordem = dele.map((_, j) => j).sort((a, b) => contraEle[a] - contraEle[b]);
    const y = new Array(dele.length).fill(0);
    let nenhumaMelhor = 1;
    for (const j of ordem) { y[j] = p[dele[j]] * nenhumaMelhor; nenhumaMelhor *= 1 - p[dele[j]]; }
    const sy = y.reduce((s, v) => s + v, 0) || 1;
    /* eu: melhor resposta a y */
    let melhor = 0, mv = -Infinity;
    for (let i = 0; i < minhas.length; i++) { const v = dele.reduce((s, _, j) => s + (y[j] / sy) * M[i][j], 0); if (v > mv) { mv = v; melhor = i; } }
    conta[melhor]++;
    const tot = it + 1;
    x = conta.map((c) => c / tot);
  }
  return x;
}
const amostra = (pesos, r) => { const t = pesos.reduce((s, v) => s + v, 0); let u = r() * t; for (let i = 0; i < pesos.length; i++) { u -= pesos[i]; if (u <= 0) return i; } return pesos.length - 1; };

export const aleatoria = () => (e, l, perfis, r) => ({ carta: e.mao[l][Math.floor(r() * e.mao[l].length)] });
export const atenta = (semente) => (e, l, perfis, r) => {
  const t = tabela(e, l, perfis, semente);
  return { carta: t.minhas[amostra(mistura(t), r)], tabela: t };
};
/* oráculo: decide depois do outro (o executor passa a carta dele em cartaDele) */
export const oraculo = (semente, acerto) => (e, l, perfis, r, cartaDele) => {
  const t = tabela(e, l, perfis, semente);
  if (cartaDele && r() < acerto) {
    const j = t.dele.indexOf(cartaDele);
    if (j >= 0) { let bi = 0; for (let i = 1; i < t.minhas.length; i++) if (t.M[i][j] > t.M[bi][j]) bi = i; return { carta: t.minhas[bi], tabela: t }; }
  }
  return { carta: t.minhas[amostra(mistura(t), r)], tabela: t };
};
export const categoriaDe = (id) => CARTAS[id].categoria;
export { L2 };
