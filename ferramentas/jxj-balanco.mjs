/* JxJ: ferramenta de balanço (simulação em massa do motor do JxJ).
   Usada pelas suítes jxjmotor e jxjarvore do testar.js e, na linha de
   comando, pra medir de novo depois de mexer no motor ou na árvore:

     node ferramentas/jxj-balanco.mjs matriz     # estilos x estilos, métodos, misturas
     node ferramentas/jxj-balanco.mjs niveis     # nível alto x nível 1, matriz no nível 30
     node ferramentas/jxj-balanco.mjs nos        # valor de cada nó da árvore no nível 3
     node ferramentas/jxj-balanco.mjs atributos  # valor de 1 ponto de cada atributo

   Como o "jogo racional" é medido: o valor de um estado é a chance de A
   vencer dali (regressão logística treinada em lutas simuladas, treinarValor).
   Pra cada par de perfis e cada posição (em pé, A por cima, B por cima) sai
   a matriz 4x4 do ganho médio de valor de cada par de ações, e a mistura de
   equilíbrio dela (fictitious play). Estratégia racional = sortear a ação
   pela mistura da posição. É uma aproximação (a mistura é a do começo da
   luta), mas pega o que importa: ação que domina vira mistura degenerada, e
   estilo forte demais aparece na matriz.

   Nada aqui roda no site (a pasta ferramentas fica fora do deploy). */
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const M = await import(pathToFileURL(path.join(RAIZ, "api", "_jxj-motor.js")).href);
const A = await import(pathToFileURL(path.join(RAIZ, "api", "_jxj-arvores.js")).href);
const F = M.FAMILIAS, ESTS = A.ESTILOS_IDS;
export { M as MOTOR, A as ARVORES };

/* gerador simples e reprodutível pra estratégia */
const lcg = (s) => () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
const amostra = (d, r) => { const s = d.reduce((a, b) => a + b, 0); let x = r() * s; for (let i = 0; i < 4; i++) { x -= d[i]; if (x <= 0) return F[i]; } return F[3]; };

/* Pesos de "jogador de estilo" (heurística): quem joga no estilo, sem conta */
export const PESOS_ESTILO = {
  striker: { pe: [5, 1, 2, 3], cima: [4, 1, 2, 1], baixo: [1, 1, 2, 5] },
  wrestler: { pe: [2, 5, 1, 3], cima: [4, 1, 3, 3], baixo: [1, 2, 2, 4] },
  grappler: { pe: [2, 4, 2, 2], cima: [2, 4, 1, 4], baixo: [1, 5, 2, 2] },
  counter: { pe: [3, 1, 4, 1], cima: [3, 1, 3, 2], baixo: [1, 1, 3, 4] },
};
export const heuristica = (est) => (e, l, p, r) => (e[l].energia <= 2 && r() < 0.6) ? "defesa" : amostra(PESOS_ESTILO[est][M.papel(e, l)], r);
export const spam = (f) => () => f;
export const aleatoria = () => (e, l, p, r) => F[Math.floor(r() * 4)];

/* ---------- valor de estado ---------- */
export function feat(e, pA, pB) {
  const rd = e.round - 1, pts = e.pontos[rd] || { a: 0, b: 0 };
  const cards = e.cartoes.reduce((s, c) => s + (c.a - c.b), 0);
  const sinal = e.pos === "cima_a" ? 1 : e.pos === "cima_b" ? -1 : 0;
  const restante = (M.FORMATO.rounds - e.round) * M.FORMATO.trocasPorRound + (M.FORMATO.trocasPorRound - e.troca + 1);
  const fresco = restante / (M.FORMATO.rounds * M.FORMATO.trocasPorRound);
  const chao = sinal === 0 ? 0 : sinal > 0 ? (pA.atr.chao - pB.atr.defChao) / 10 : (pB.atr.chao - pA.atr.defChao) / 10;
  const cans = (x) => Math.max(0, 3 - x);
  return [1, (pts.a - pts.b) / 10, cards, sinal, sinal * (e.nivelPos || 0), sinal * chao,
    (e.a.energia - e.b.energia) / 3, (cans(e.b.energia) - cans(e.a.energia)) / 2, (e.b.dano - e.a.dano) / 20,
    (e.b.dano * e.b.dano - e.a.dano * e.a.dano) / 2000, e.momento / 2,
    fresco * (pA.atr.golpe + pA.atr.poder - pB.atr.golpe - pB.atr.poder) / 20,
    fresco * (pA.atr.queda - pB.atr.defQueda + pA.atr.chao - pB.atr.defChao) / 20,
    ((pts.a - pts.b) / 10) * (1 - fresco), sinal * fresco];
}
/* Regressão logística em lutas de estilo com 30% de ação ao acaso */
export function treinarValor(n = 3000) {
  const X = [], Y = [];
  const perfis = Object.fromEntries(ESTS.map((s) => [s, A.perfilDeCombate({ estilo: s, categoria: "middleweight", build: {} })]));
  const pol = (est) => (e, l, p, r) => r() < 0.3 ? F[Math.floor(r() * 4)] : heuristica(est)(e, l, p, r);
  for (let i = 0; i < n; i++) {
    const sa = ESTS[i % 4], sb = ESTS[Math.floor(i / 4) % 4], pA = perfis[sa], pB = perfis[sb];
    const ea = pol(sa), eb = pol(sb), rr = lcg(i * 7919 + 13);
    let e = M.novaLuta(pA, pB); const est = []; let k = 0;
    while (!e.fim && k++ < 100) { est.push(feat(e, pA, pB)); e = M.resolverTroca(e, { a: pA, b: pB }, { a: ea(e, "a", pA, rr), b: eb(e, "b", pB, rr) }, `v${i}`).estado; }
    const y = e.fim.vencedor === "a" ? 1 : e.fim.vencedor === "b" ? 0 : 0.5;
    for (const f of est) { X.push(f); Y.push(y); }
  }
  const d = X[0].length, w = new Array(d).fill(0);
  for (let ep = 0; ep < 60; ep++) {
    const g = new Array(d).fill(0);
    for (let j = 0; j < X.length; j++) {
      const z = X[j].reduce((s, x, k) => s + x * w[k], 0), er = 1 / (1 + Math.exp(-z)) - Y[j];
      for (let k = 0; k < d; k++) g[k] += er * X[j][k];
    }
    for (let k = 0; k < d; k++) w[k] -= 0.5 * g[k] / X.length;
  }
  return w;
}
let PESOS_V = null;
const pesos = () => (PESOS_V ||= treinarValor());
function valor(e, pA, pB) {
  if (e.fim) return e.fim.vencedor === "a" ? 100 : e.fim.vencedor === "b" ? 0 : 50;
  const z = feat(e, pA, pB).reduce((s, x, k) => s + x * pesos()[k], 0);
  return 100 / (1 + Math.exp(-z));
}

/* ---------- jogo de uma troca e equilíbrio ---------- */
export function matriz(pA, pB, base, n = 400) {
  const v0 = valor(base, pA, pB);
  return F.map((fa) => F.map((fb) => {
    let s = 0;
    for (let k = 0; k < n; k++) s += valor(M.resolverTroca(base, { a: pA, b: pB }, { a: fa, b: fb }, "mt" + k).estado, pA, pB) - v0;
    return s / n;
  }));
}
export function equilibrio(m, it = 20000) {
  const ca = [1, 1, 1, 1], cb = [1, 1, 1, 1];
  const norm = (c) => { const t = c.reduce((a, b) => a + b, 0); return c.map((x) => x / t); };
  for (let t = 0; t < it; t++) {
    const pa = norm(ca), pb = norm(cb);
    const ua = m.map((l) => l.reduce((s, v, j) => s + v * pb[j], 0));
    const ub = [0, 1, 2, 3].map((j) => m.reduce((s, l, i) => s + l[j] * pa[i], 0));
    ca[ua.indexOf(Math.max(...ua))]++; cb[ub.indexOf(Math.min(...ub))]++;
  }
  return { pa: norm(ca), pb: norm(cb) };
}
const cacheMix = new Map();
/* as misturas dependem do motor: quem muda M.K no meio (experimento) limpa */
export function limparCache() { cacheMix.clear(); PESOS_V = null; }
/* misturas de equilíbrio por posição, com pA no lado a */
export function misturas(pA, pB, n = 400) {
  const chave = JSON.stringify([pA, pB, n]);
  if (cacheMix.has(chave)) return cacheMix.get(chave);
  const base = M.novaLuta(pA, pB);
  const mPe = matriz(pA, pB, base, n), mCa = matriz(pA, pB, { ...M.novaLuta(pA, pB), pos: "cima_a" }, n), mCb = matriz(pA, pB, { ...M.novaLuta(pA, pB), pos: "cima_b" }, n);
  const pe = equilibrio(mPe), ca = equilibrio(mCa), cb = equilibrio(mCb);
  const r = { pe: { a: pe.pa, b: pe.pb, m: mPe }, cima_a: { a: ca.pa, b: ca.pb, m: mCa }, cima_b: { a: cb.pa, b: cb.pb, m: mCb } };
  cacheMix.set(chave, r);
  return r;
}
/* estratégia racional de quem tem o perfil pEu contra pEle */
export function racional(pEu, pEle) {
  const mx = misturas(pEu, pEle);
  return (e, l, p, r) => {
    if (e[l].energia <= 1.5 && r() < 0.5) return "defesa";
    const pos = l === "a" ? e.pos : e.pos === "cima_a" ? "cima_b" : e.pos === "cima_b" ? "cima_a" : "pe";
    return amostra(mx[pos].a, r);
  };
}

/* Jogador que se adapta (o que um humano atento faz): guarda as ações do
   adversário nesta luta, por posição, e responde ao padrão dele. Crença =
   mistura de equilíbrio do adversário (peso PRIOR) + o que ele já fez; com
   chance SEGUE, escolhe pela melhor resposta (softmax do ganho esperado na
   matriz da posição); senão, sorteia o equilíbrio. Pune quem repete. */
export function adaptativa(pEu, pEle, { prior = 2, segue = 0.7, temp = 1 } = {}) {
  const mx = misturas(pEu, pEle);
  let hist = null, posAnt = null;
  return (e, l, p, r) => {
    const o = l === "a" ? "b" : "a";
    const pos = l === "a" ? e.pos : e.pos === "cima_a" ? "cima_b" : e.pos === "cima_b" ? "cima_a" : "pe";
    if (e.round === 1 && e.troca === 1) hist = { pe: [0, 0, 0, 0], cima_a: [0, 0, 0, 0], cima_b: [0, 0, 0, 0] };
    else if (e[o].ultima && posAnt) hist[posAnt][F.indexOf(e[o].ultima)]++;
    posAnt = pos;
    if (e[l].energia <= 1.5 && r() < 0.5) return "defesa";
    if (r() >= segue) return amostra(mx[pos].a, r);
    const crenca = mx[pos].b.map((x, j) => prior * x + hist[pos][j]);
    const t = crenca.reduce((a, b) => a + b, 0);
    const ganho = mx[pos].m.map((linha) => linha.reduce((s, v, j) => s + v * crenca[j] / t, 0));
    const mx0 = Math.max(...ganho);
    return amostra(ganho.map((g) => Math.exp((g - mx0) / temp)), r);
  };
}

/* ---------- confronto ---------- */
/* n lutas com lados alternados (sementes pareadas por tag). Devolve vitórias
   de X em % das lutas com vencedor, e a contagem de métodos. */
export function confronto(pX, pO, eX, eO, n, tag) {
  const t = { vX: 0, vO: 0, KO: 0, TKO: 0, FIN: 0, DEC: 0, EMPATE: 0, WO: 0, ANULADA: 0, n };
  for (let i = 0; i < n; i++) {
    const inv = i % 2 === 1;
    const f = (inv ? M.simularLuta(pO, pX, eO, eX, `${tag}:${i}`) : M.simularLuta(pX, pO, eX, eO, `${tag}:${i}`)).fim;
    t[f.metodo]++;
    if (f.vencedor) { if ((f.vencedor === "a") !== inv) t.vX++; else t.vO++; }
  }
  t.pct = 100 * t.vX / Math.max(1, t.vX + t.vO);
  return t;
}
export const perfilTipico = (estilo, nivel = 1, categoria = "middleweight") =>
  A.perfilDeCombate({ estilo, categoria, build: A.buildTipica(estilo, nivel) });

/* Matriz de estilos (nível 1), métodos e misturas em pé */
export function medirMatriz(n = 600) {
  const perfis = Object.fromEntries(ESTS.map((s) => [s, perfilTipico(s, 1)]));
  const mat = {}, met = { KO: 0, TKO: 0, FIN: 0, DEC: 0, EMPATE: 0, WO: 0, ANULADA: 0, n: 0 };
  for (const s of ESTS) for (const o of ESTS) {
    const t = confronto(perfis[s], perfis[o], racional(perfis[s], perfis[o]), racional(perfis[o], perfis[s]), n, `mz${s}${o}`);
    mat[s + ":" + o] = t.pct;
    for (const k of Object.keys(met)) if (k !== "n") met[k] += t[k];
    met.n += n;
  }
  const pc = (k) => 100 * met[k] / met.n;
  const mixes = {};
  for (const s of ESTS) for (const o of ESTS) mixes[s + ":" + o] = misturas(perfis[s], perfis[o]);
  return { mat, metodos: { ko: pc("KO") + pc("TKO"), fin: pc("FIN"), dec: pc("DEC"), empate: pc("EMPATE") }, mixes };
}
/* Valor de um nó no nível 3: (vitória com o nó) - (vitória sem), média
   contra os 4 estilos no nível 1. Cada comparação usa as MESMAS
   estratégias dos dois lados (pareada); mede duas vezes, com as misturas do
   perfil sem o nó e com o nó, e tira a média. Pré-requisito do ramo pago
   com os nós de tier menor. */
export function valorDoNo(noId, n = 1000) {
  const no = A.NOS[noId], ramo = A.RAMOS[no.ramo], t = no.tier - 1;
  const pre = {}; let falta = A.PEDIDO_POR_TIER[t];
  for (let k = 0; k < t && falta > 0; k++) { const q = Math.min(3, falta); pre[ramo.nos[k].id] = q; falta -= q; }
  const pCom = A.perfilDeCombate({ estilo: no.estilo, categoria: "middleweight", build: { ...pre, [noId]: 3 } });
  const pSem = A.perfilDeCombate({ estilo: no.estilo, categoria: "middleweight", build: pre });
  let soma = 0;
  for (const o of ESTS) {
    const pO = perfilTipico(o, 1);
    for (const ref of [pSem, pCom]) {
      const eX = racional(ref, pO), eO = racional(pO, ref);
      soma += confronto(pCom, pO, eX, eO, n, `no${noId}${o}`).pct - confronto(pSem, pO, eX, eO, n, `no${noId}${o}`).pct;
    }
  }
  return soma / ESTS.length / 2;
}
/* Nível alto x nível baixo, mesmo estilo, build típica, jogo racional */
export function nivelContraNivel(estilo, alto, baixo, n = 600) {
  const pA = perfilTipico(estilo, alto), pB = perfilTipico(estilo, baixo);
  return confronto(pA, pB, racional(pA, pB), racional(pB, pA), n, `nv${estilo}${alto}x${baixo}`).pct;
}
/* Valor de pts pontos brutos num atributo (por ponto), média contra os 4 */
export function valorDoAtributo(estilo, atr, pts = 3, n = 1000) {
  const p0 = perfilTipico(estilo, 1), p1 = JSON.parse(JSON.stringify(p0));
  p1.atr[atr] += pts;
  let soma = 0;
  for (const o of ESTS) {
    const pO = perfilTipico(o, 1), eX = racional(p0, pO), eO = racional(pO, p0);
    soma += confronto(p1, pO, eX, eO, n, `at${estilo}${atr}${o}`).pct - confronto(p0, pO, eX, eO, n, `at${estilo}${atr}${o}`).pct;
  }
  return soma / ESTS.length / pts;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2], N = Number(process.argv[3]) || 0;
  const f1 = (x) => x.toFixed(1);
  if (cmd === "matriz") {
    const r = medirMatriz(N || 600);
    console.log("vitórias da linha (jogo racional, nível 1):");
    console.log("          " + ESTS.map((o) => o.padStart(9)).join(""));
    for (const s of ESTS) console.log(s.padEnd(10) + ESTS.map((o) => f1(r.mat[s + ":" + o]).padStart(9)).join(""));
    console.log("métodos:", `KO/TKO ${f1(r.metodos.ko)}%  FIN ${f1(r.metodos.fin)}%  DEC ${f1(r.metodos.dec)}%  empate ${f1(r.metodos.empate)}%`);
    console.log("misturas em pé (golpes queda defesa pressão):");
    for (const s of ESTS) for (const o of ESTS) console.log(" ", (s + " x " + o).padEnd(22), r.mixes[s + ":" + o].pe.a.map((x) => (100 * x).toFixed(0).padStart(4)).join(""));
  } else if (cmd === "niveis") {
    for (const s of ESTS) console.log(s.padEnd(9), [10, 20, 30].map((nv) => `${nv}x1: ${f1(nivelContraNivel(s, nv, 1, N || 600))}%`).join("  "), ` 30x20: ${f1(nivelContraNivel(s, 30, 20, N || 600))}%`);
    console.log("matriz no nível 30:");
    for (const s of ESTS) console.log(" ", s.padEnd(9), ESTS.map((o) => {
      const pA = perfilTipico(s, 30), pB = perfilTipico(o, 30);
      return f1(confronto(pA, pB, racional(pA, pB), racional(pB, pA), N || 600, `n30${s}${o}`).pct).padStart(7);
    }).join(""));
  } else if (cmd === "nos") {
    for (const id of Object.keys(A.NOS)) console.log(A.NOS[id].estilo.padEnd(9), id.padEnd(24), f1(valorDoNo(id, N || 1000)).padStart(6), JSON.stringify(A.NOS[id].efeitos));
  } else if (cmd === "atributos") {
    console.log("estilo    " + A.ATRIBUTOS.map((a) => a.padStart(9)).join(""));
    for (const s of ESTS) console.log(s.padEnd(10) + A.ATRIBUTOS.map((a) => valorDoAtributo(s, a, 3, N || 1000).toFixed(2).padStart(9)).join(""));
  } else {
    console.log("uso: node ferramentas/jxj-balanco.mjs [matriz|niveis|nos|atributos] [n]");
  }
}
