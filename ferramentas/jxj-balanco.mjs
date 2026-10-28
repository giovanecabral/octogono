/* JxJ: ferramenta de balanço (simulação em massa do motor do JxJ).
   Usada pelas suítes jxjmotor e jxjarvore do testar.js e, na linha de
   comando, pra medir de novo depois de mexer no motor ou na árvore:

     node ferramentas/jxj-balanco.mjs matriz     # estilos x estilos, métodos, misturas
     node ferramentas/jxj-balanco.mjs niveis     # nível alto x nível 1, matriz no nível 30
     node ferramentas/jxj-balanco.mjs nos        # valor de cada nó da árvore no nível 3
     node ferramentas/jxj-balanco.mjs builds     # builds diferentes do nível 30 contra a típica
     node ferramentas/jxj-balanco.mjs atributos  # valor de 1 ponto de cada atributo
     node ferramentas/jxj-balanco.mjs variantes  # valor de cada variante de ação (2026-10-04)
     node ferramentas/jxj-balanco.mjs bots       # bot de cada habilidade contra jogadores-modelo (2026-10-19)
     node ferramentas/jxj-balanco.mjs leitura    # quanto vale acertar a leitura (motor v3, 2026-10-20)
     node ferramentas/jxj-balanco.mjs momentos   # grogue e encaixe: frequência, misturas e quanto valem
     node ferramentas/jxj-balanco.mjs personalidades  # bots com personalidade: quem lê o jeito vence mais?
     node ferramentas/jxj-balanco.mjs mao        # mão à vista (v4): trocas óbvias e quanto vale contar cartas
     node ferramentas/jxj-balanco.mjs sinais     # sinais e blefe (fase 2): honestidade do sinal no equilíbrio
     node ferramentas/jxj-balanco.mjs iniciativa # iniciativa (fase 3): quanto muda, quanto se finta com ela, valor dos 2 nós com sinais
     node ferramentas/jxj-balanco.mjs presos     # mão por estilo (fase 4): por baixo sem a Pressão (levantar), por estilo

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
const BOT = await import(pathToFileURL(path.join(RAIZ, "api", "_jxj-bot.js")).href);
/* v4: a mão à vista. Toda ação de estratégia passa por EST.familiaNaMao
   (família sem carta vira uma das que têm, sorteada pelo gerador dela). */
const EST = await import(pathToFileURL(path.join(RAIZ, "api", "_jxj-estrategia.js")).href);
const F = M.FAMILIAS, ESTS = A.ESTILOS_IDS;
export { M as MOTOR, A as ARVORES, BOT };

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
/* Momentos decisivos (motor v3): grogue e finalização encaixada. O jogo
   pensado (racional, adaptativa) joga a mistura de equilíbrio do momento
   (mx(chave), matriz de uma troca no estado do momento); o jogador de
   estilo faz o óbvio (BOT.OBVIO) na maior parte dessas trocas e, no resto,
   segue a base. Mesma ideia do bot (api/_jxj-bot.js). */
export const MOMENTO_OBVIO = 0.62;
export function momentos(base, { mx = null, obvio = MOMENTO_OBVIO } = {}) {
  return (e, l, p, r) => {
    const ch = M.momentoDoLado(e, l);
    if (!ch) return base(e, l, p, r);
    if (mx) return amostra(mx(ch).a, r);
    return r() < obvio ? BOT.OBVIO[ch] : base(e, l, p, r);
  };
}
const heuristicaBase = (est) => (e, l, p, r) => (e[l].energia <= 2 && r() < 0.6) ? "defesa" : amostra(PESOS_ESTILO[est][M.papel(e, l)], r);
export const heuristica = (est) => momentos(heuristicaBase(est));
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
    while (!e.fim && k++ < 100) {
      est.push(feat(e, pA, pB));
      const fa = EST.familiaNaMao(e, "a", ea(e, "a", pA, rr), rr), fb = EST.familiaNaMao(e, "b", eb(e, "b", pB, rr), rr);
      e = M.resolverTroca(e, { a: pA, b: pB }, { a: fa, b: fb }, `v${i}`).estado;
    }
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
/* mistura de equilíbrio de um momento decisivo, com pA no papel de "eu" */
export function misturaDoMomento(pA, pB, chave, n = 300) {
  const k = JSON.stringify([pA, pB, chave, n]);
  if (cacheMix.has(k)) return cacheMix.get(k);
  const base = M.novaLuta(pA, pB);
  BOT.ESTADO_MOMENTO[chave](base);
  const m = matriz(pA, pB, base, n), eq = equilibrio(m);
  const r = { a: eq.pa, b: eq.pb, m };
  cacheMix.set(k, r);
  return r;
}
/* estratégia racional de quem tem o perfil pEu contra pEle */
export function racional(pEu, pEle) {
  const mx = misturas(pEu, pEle);
  return momentos((e, l, p, r) => {
    if (e[l].energia <= 1.5 && r() < 0.5) return "defesa";
    const pos = l === "a" ? e.pos : e.pos === "cima_a" ? "cima_b" : e.pos === "cima_b" ? "cima_a" : "pe";
    return amostra(mx[pos].a, r);
  }, { mx: (ch) => misturaDoMomento(pEu, pEle, ch) });
}

/* Jogador que se adapta (o que um humano atento faz): guarda as ações do
   adversário nesta luta, por posição, e responde ao padrão dele. Crença =
   mistura de equilíbrio do adversário (peso PRIOR) + o que ele já fez; com
   chance SEGUE, escolhe pela melhor resposta (softmax do ganho esperado na
   matriz da posição); senão, sorteia o equilíbrio. Pune quem repete. */
export function adaptativa(pEu, pEle, { prior = 2, segue = 0.7, temp = 1 } = {}) {
  const mx = misturas(pEu, pEle);
  let hist = null, posAnt = null;
  return momentos((e, l, p, r) => {
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
  }, { mx: (ch) => misturaDoMomento(pEu, pEle, ch) });
}

/* Jogador que descobre o jeito do adversário durante a luta (2026-10-20,
   bots com personalidade): não sabe nada dele no começo. Guarda o que ele
   fez em cinco contextos (na posição; depois de cada ação dele; depois de
   cada ação sua; depois de ele apanhar ou não; você cansado ou não) e testa
   duas hipóteses que gente testa ("ele responde ao que eu fiz com o que
   ganha disso?", "ele repete?"). Dá peso a cada um pelo quanto acertou as
   últimas jogadas dele (média bayesiana com esquecimento), responde com a
   melhor ação contra a previsão e explora um pouco. É o "humano atento"
   que lê o padrão. */
const posDoLado = (e, l) => (l === "a" ? e.pos : e.pos === "cima_a" ? "cima_b" : e.pos === "cima_b" ? "cima_a" : "pe");
export function explorador(pEu, pEle, { exploracao = 0.08, esquece = 0.85, aoPrever = null } = {}) {
  const mx = misturas(pEu, pEle);
  const TIPOS = ["m", "ele", "eu", "apanhou", "cansado", "contra", "repete"];
  const HIP = 0.7;   // quanto a hipótese aposta no que ela diz
  let mem = null;
  return (e, l, p, r) => {
    const o = l === "a" ? "b" : "a", pos = posDoLado(e, l);
    if (e.round === 1 && e.troca === 1) mem = { cont: {}, logv: Object.fromEntries(TIPOS.map((t) => [t, 0])), ctxAnt: null, predAnt: null };
    else if (mem.ctxAnt && e[o].ultima) {
      const j = F.indexOf(e[o].ultima);
      for (const t of TIPOS) mem.logv[t] = mem.logv[t] * esquece + Math.log(mem.predAnt[t][j]);
      for (const t of TIPOS) {
        if (t === "contra" || t === "repete") continue;
        const c = (mem.cont[mem.ctxAnt[t]] ||= [0, 0, 0, 0]);
        for (let i = 0; i < 4; i++) c[i] *= esquece;
        c[j] += 1;
      }
    }
    const ctx = { m: `m|${pos}`, ele: `ele|${pos}|${e[o].ultima}`, eu: `eu|${pos}|${e[l].ultima}`,
      apanhou: `ap|${pos}|${!!e[o].atingido}`, cansado: `ca|${pos}|${e[l].energia <= 3}` };
    /* prior suavizado: com zero, uma jogada inesperada zerava o peso de todo
       contexto pra sempre (log 0) e a escolha virava ação inválida */
    const prior = mx[pos].b.map((x) => 0.9 * x + 0.025), pred = {};
    for (const t of TIPOS) {
      if (t === "contra" || t === "repete") continue;
      const c = mem.cont[ctx[t]] || [0, 0, 0, 0], n = c.reduce((a, b) => a + b, 0);
      pred[t] = c.map((x, i) => (x + prior[i]) / (n + 1));
    }
    /* hipóteses: as ações dele que ganham da minha última; a última dele */
    const pap = { [l]: M.papel(e, l), [o]: M.papel(e, o) };
    const aposta = (alvos) => (alvos.length ? F.map((f) => (alvos.includes(f) ? HIP / alvos.length : 0) + (1 - HIP) * prior[F.indexOf(f)]) : prior.slice());
    pred.contra = aposta(e[l].ultima ? F.filter((f) => M.quemLeu(pap, { [o]: f, [l]: e[l].ultima }) === o) : []);
    pred.repete = aposta(e[o].ultima ? [e[o].ultima] : []);
    mem.ctxAnt = ctx; mem.predAnt = pred;
    const lv = TIPOS.map((t) => mem.logv[t]), lm = Math.max(...lv), w = lv.map((x) => Math.exp(x - lm)), tw = w.reduce((a, b) => a + b, 0);
    const crenca = [0, 0, 0, 0];
    TIPOS.forEach((t, k) => { for (let i = 0; i < 4; i++) crenca[i] += (w[k] / tw) * pred[t][i]; });
    /* medição (quantas trocas até ler o jeito): a previsão desta troca */
    if (aoPrever) aoPrever(crenca);
    const ch = M.momentoDoLado(e, l);
    if (ch) return amostra(misturaDoMomento(pEu, pEle, ch).a, r);
    if (e[l].energia <= 1.5 && r() < 0.5) return "defesa";
    if (r() < exploracao) return amostra(mx[pos].a, r);
    const ganho = mx[pos].m.map((linha) => linha.reduce((s, v, j) => s + v * crenca[j], 0));
    return F[ganho.indexOf(Math.max(...ganho))];
  };
}
/* Jogador que já sacou o jeito do bot (teto do que dá pra tirar dele): vê a
   distribuição verdadeira da próxima ação do bot (BOT.distribuicaoDoBot,
   nunca a ação sorteada) e responde com a melhor ação contra ela. Só pra
   luta contra bot com personalidade (lutaContraBot passa o contexto). */
export function conhecedor(pEu, pEle) {
  const mx = misturas(pEu, pEle);
  return (e, l, p, r, ctx) => {
    const o = l === "a" ? "b" : "a", pos = posDoLado(e, l), ch = M.momentoDoLado(e, l);
    if (e[l].energia <= 1.5 && r() < 0.5) return "defesa";
    const dist = BOT.distribuicaoDoBot(e, o, ctx.dados, BOT.historicoDasTrocas(ctx.trocas, o), BOT.acoesDoBot(ctx.trocas, o));
    const m = ch ? misturaDoMomento(pEu, pEle, ch).m : mx[pos].m;
    const ganho = m.map((linha) => linha.reduce((s, v, j) => s + v * dist[j], 0));
    return F[ganho.indexOf(Math.max(...ganho))];
  };
}

/* ---------- confronto ---------- */
/* n lutas com lados alternados (sementes pareadas por tag). Devolve vitórias
   de X em % das lutas com vencedor, e a contagem de métodos. */
export function confronto(pX, pO, eX, eO, n, tag, maoX = null) {
  const t = { vX: 0, vO: 0, KO: 0, TKO: 0, FIN: 0, DEC: 0, EMPATE: 0, WO: 0, ANULADA: 0, n, trocas: 0 };
  for (let i = 0; i < n; i++) {
    const inv = i % 2 === 1;
    /* maoX: entradas fixas da mão de X ({pe: {golpes: "cruzado"}}), pra medir variante */
    const op = maoX ? { mao: { [inv ? "b" : "a"]: maoX } } : null;
    const f = (inv ? M.simularLuta(pO, pX, eO, eX, `${tag}:${i}`, op) : M.simularLuta(pX, pO, eX, eO, `${tag}:${i}`, op)).fim;
    t[f.metodo]++;
    t.trocas += (f.round - 1) * M.FORMATO.trocasPorRound + f.troca;
    if (f.vencedor) { if ((f.vencedor === "a") !== inv) t.vX++; else t.vO++; }
  }
  t.pct = 100 * t.vX / Math.max(1, t.vX + t.vO);
  return t;
}
/* Valor de cada variante de ação (2026-10-04): lutas espelho (mesmo perfil
   dos dois lados, jogo racional) em que X SEMPRE recebe a variante v naquela
   família e o outro joga com a mão normal. Variante equilibrada fica perto
   de 50%; acima, ela vale mais que a média da família. Média dos 4 estilos. */
export function valorDasVariantes(n = 400, estilos = ESTS, sal = "") {
  const out = {};
  for (const [pp, fams] of Object.entries(M.VARIANTES)) for (const [f, lista] of Object.entries(fams)) for (const v of lista) {
    const porEstilo = {};
    for (const s of estilos) {
      const p = perfilTipico(s, 1);
      porEstilo[s] = confronto(p, p, racional(p, p), racional(p, p), n, `var${sal}${v.id}${s}`, { [pp]: { [f]: v.id } }).pct;
    }
    out[v.id] = { papel: pp, familia: f, porEstilo, pct: Object.values(porEstilo).reduce((x, y) => x + y, 0) / estilos.length };
  }
  return out;
}
export const perfilTipico = (estilo, nivel = 1, categoria = "middleweight") =>
  A.perfilDeCombate({ estilo, categoria, build: A.buildTipica(estilo, nivel) });

/* Matriz de estilos (nível 1), métodos e misturas em pé */
export function medirMatriz(n = 600) {
  const perfis = Object.fromEntries(ESTS.map((s) => [s, perfilTipico(s, 1)]));
  const mat = {}, met = { KO: 0, TKO: 0, FIN: 0, DEC: 0, EMPATE: 0, WO: 0, ANULADA: 0, n: 0, trocas: 0 };
  for (const s of ESTS) for (const o of ESTS) {
    const t = confronto(perfis[s], perfis[o], racional(perfis[s], perfis[o]), racional(perfis[o], perfis[s]), n, `mz${s}${o}`);
    mat[s + ":" + o] = t.pct;
    for (const k of Object.keys(met)) if (k !== "n") met[k] += t[k];
    met.n += n;
  }
  const pc = (k) => 100 * met[k] / met.n;
  const mixes = {};
  for (const s of ESTS) for (const o of ESTS) mixes[s + ":" + o] = misturas(perfis[s], perfis[o]);
  return { mat, metodos: { ko: pc("KO") + pc("TKO"), fin: pc("FIN"), dec: pc("DEC"), empate: pc("EMPATE"), trocasMedia: met.trocas / met.n }, mixes };
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
/* Builds alternativas do nível 30 pra comparar com a típica: a mesma
   prioridade invertida (outros ramos primeiro) e uma híbrida (2 níveis em
   2 nós de outro estilo, 8 pontos, e o resto pela prioridade típica). */
const HIBRIDOS = { striker: ["entradas", "equilibrio"], wrestler: ["controle_chao", "eficiencia_sub"], grappler: ["equilibrio", "entradas"], counter: ["entradas", "equilibrio"] };
export function buildsDoNivel30(estilo) {
  const pri = A.PRIORIDADE_TIPICA[estilo];
  const completar = (inicial) => {
    const b = { ...inicial };
    for (let mudou = true; mudou;) {
      mudou = false;
      for (const id of pri) {
        if ((b[id] || 0) >= A.NIVEL_MAX_NO) continue;
        const t = { ...b, [id]: (b[id] || 0) + 1 };
        if (A.validarBuild(estilo, t, 30).ok) { b[id] = t[id]; mudou = true; break; }
      }
    }
    return b;
  };
  const [h1, h2] = HIBRIDOS[estilo];
  return {
    tipica: A.buildTipica(estilo, 30),
    invertida: A.buildTipica(estilo, 30, [...pri].reverse()),
    hibrida: completar({ [h1]: 2, [h2]: 2 }),
  };
}
export function compararBuilds(estilo, n = 600) {
  const B = buildsDoNivel30(estilo), P = Object.fromEntries(Object.entries(B).map(([k, b]) => [k, A.perfilDeCombate({ estilo, categoria: "middleweight", build: b })]));
  const r = {};
  for (const alt of ["invertida", "hibrida"]) {
    const pA = P[alt], pB = P.tipica;
    r[alt] = confronto(pA, pB, racional(pA, pB), racional(pB, pA), n, `bd${estilo}${alt}`).pct;
  }
  return r;
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

/* ---------- leitura e momentos (motor v3, 2026-10-20) ---------- */
/* Teto da leitura: X vê a ação de O antes de escolher e, com chance acerto,
   escolhe uma que ganha dela no ciclo (no resto, sorteia). O joga no peso do
   estilo. Mede quanto a luta inteira depende de acertar a leitura: com
   acerto 0,5, X lê ~60% das trocas (quem sorteia lê ~25%). Espelho de
   estilo, nível 1, média dos 4. */
export function leituraOraculo(acerto, n = 300, sal = "") {
  let v = 0, d = 0;
  for (const s of ESTS) {
    const p = perfilTipico(s, 1), eO = heuristica(s);
    for (let i = 0; i < n; i++) {
      const r = lcg(i * 104729 + s.length * 7 + 1), sem = `or${sal}${s}${i}`;
      let e = M.novaLuta(p, p), k = 0;
      while (!e.fim && k++ < 100) {
        const aO = EST.familiaNaMao(e, "b", eO(e, "b", p, r), r), pap = { a: M.papel(e, "a"), b: M.papel(e, "b") };
        /* v4: quem lê só acerta com o que tem na mão */
        const ganham = F.filter((f) => EST.temCarta(e, "a", f) && M.quemLeu(pap, { a: f, b: aO }) === "a"), disp = EST.familiasComCarta(e, "a");
        const aX = ganham.length && r() < acerto ? ganham[Math.floor(r() * ganham.length)] : disp[Math.floor(r() * disp.length)];
        e = M.resolverTroca(e, { a: p, b: p }, { a: aX, b: aO }, sem).estado;
      }
      if (e.fim.vencedor === "a") v++; else if (e.fim.vencedor === "b") d++;
    }
  }
  return 100 * v / Math.max(1, v + d);
}
/* Momentos decisivos no jogo racional (todas as duplas, nível 1): em quantas
   lutas aparecem, quantos acabam a luta na troca do momento e que parte das
   vitórias antes da decisão passa por eles. */
export function medirMomentos(n = 120) {
  const c = { lutas: 0, comG: 0, comE: 0, momG: 0, fimG: 0, momE: 0, fimE: 0, fins: 0, finsMomento: 0 };
  for (const s of ESTS) for (const o of ESTS) {
    const pA = perfilTipico(s, 1), pB = perfilTipico(o, 1), eA = racional(pA, pB), eB = racional(pB, pA);
    for (let i = 0; i < n; i++) {
      const r = lcg(i * 7717 + 11);
      let e = M.novaLuta(pA, pB), g = false, en = false, k = 0;
      while (!e.fim && k++ < 100) {
        const mom = M.momentoDoLado(e, "a") || M.momentoDoLado(e, "b");
        const res = M.resolverTroca(e, { a: pA, b: pB }, { a: EST.familiaNaMao(e, "a", eA(e, "a", pA, r), r), b: EST.familiaNaMao(e, "b", eB(e, "b", pB, r), r) }, `mm${s}${o}${i}`);
        for (const ev of res.eventos) { if (ev.tipo === "grogue") g = true; if (ev.tipo === "encaixou") en = true; }
        const fin = !!res.estado.fim && ["KO", "TKO", "FIN"].includes(res.estado.fim.metodo);
        if (fin) { c.fins++; if (mom) c.finsMomento++; }
        if (mom && mom.startsWith("grogue")) { c.momG++; if (fin) c.fimG++; }
        if (mom && mom.startsWith("enc")) { c.momE++; if (fin) c.fimE++; }
        e = res.estado;
      }
      c.lutas++; if (g) c.comG++; if (en) c.comE++;
    }
  }
  const pc = (x, t) => 100 * x / Math.max(1, t);
  return { comGrogue: pc(c.comG, c.lutas), comEncaixe: pc(c.comE, c.lutas), grogueAcaba: pc(c.fimG, c.momG), encaixeAcaba: pc(c.fimE, c.momE), finsDeMomento: pc(c.finsMomento, c.fins) };
}

/* ---------- bots do Online (2026-10-19) ---------- */
/* Luta contra bot pelo caminho do servidor: o humano-modelo é o lado a; o
   bot (lado b) escolhe com BOT.acaoDoBot, que só lê o estado, as trocas
   gravadas, a semente e (fase 2) os dois sinais revelados. Devolve o
   estado final. Fase 2: o bot mostra a postura de sinalDoBot; o humano
   mostra a ação que vai fazer ou, com chance blefeH, uma isca (0,3: perto
   da honestidade do equilíbrio, 71%), nunca sem energia pra fintar, e não
   lê o sinal do bot (o que ele lê é o jeito, nos modelos que leem).
   blefeH null: luta sem sinais (fase 1). */
export function lutaContraBot(pH, estrH, bot, dados, semente, { blefeH = 0.3 } = {}) {
  const perfis = { a: pH, b: bot.perfil }, trocas = [];
  let h = 7; for (const ch of String(semente)) h = (h * 31 + ch.charCodeAt(0)) % 2147483647;
  const rEst = lcg(h);
  let e = M.novaLuta(pH, bot.perfil), n = 0;
  while (!e.fim && n++ < 100) {
    const aH = EST.familiaNaMao(e, "a", estrH(e, "a", pH, rEst, { trocas, dados }), rEst);
    let sinais = null;
    if (blefeH != null && e.mao) {
      let sH = aH;
      const custoH = EST.custoFintaDe(e, "a", pH);
      if (rEst() < Math.min(1, blefeH * EST.ESTRATEGIA.custoFinta / custoH) && e.a.energia >= custoH) { const is = iscas(e, "a", aH); if (is.length) sH = is[Math.floor(rEst() * is.length)]; }
      sinais = { a: sH, b: BOT.sinalDoBot({ estado: e, semente, trocas, dados, lado: "b" }) };
    }
    const aB = BOT.acaoDoBot({ estado: e, semente, trocas, dados, lado: "b", sinais });
    /* quem lê o jeito também lê o hábito de blefe do bot (leSinal) e
       responde à postura dele; a resposta diferente da própria postura é
       finta, só com energia */
    let aF = aH;
    if (sinais && estrH.leSinal) {
      const modo = estrH.leSinal(trocas);
      if (modo !== "ignora") {
        const alvos = modo === "confia" ? [sinais.b] : F.filter((x) => EST.temCarta(e, "b", x) && iscas(e, "b", x).includes(sinais.b));
        const op = [...new Set(alvos.flatMap((al) => respostas(e, "a", al)))];
        if (op.length && !op.includes(aH)) { const x = op[Math.floor(rEst() * op.length)]; if (x === sinais.a || e.a.energia >= EST.custoFintaDe(e, "a", pH)) aF = x; }
      }
    }
    const r = M.resolverTroca(e, perfis, sinais ? { a: aF, b: aB, sinais } : { a: aF, b: aB }, semente);
    trocas.push({ round: e.round, troca: e.troca, acao_a: aF, acao_b: aB, eventos: r.eventos });
    e = r.estado;
  }
  return e;
}
/* Quem conta as cartas (v4): fora do momento decisivo, a mistura de
   equilíbrio dele restrita às famílias que ele ainda tem é a crença, e a
   jogada é a melhor resposta entre as famílias que eu tenho. */
export function contador(pEu, pEle) {
  const base = racional(pEu, pEle);
  return (e, l, p, r) => {
    if (!e.mao || M.momentoDoLado(e, l)) return base(e, l, p, r);
    const o = l === "a" ? "b" : "a", pos = posDoLado(e, l), mx = misturas(pEu, pEle)[pos];
    const crenca = EST.filtrarPelaMao(mx.b, e, o);
    const ganho = F.map((f, i) => (EST.temCarta(e, l, f) ? mx.m[i].reduce((s, v, j) => s + v * crenca[j], 0) : -Infinity));
    return F[ganho.indexOf(Math.max(...ganho))];
  };
}
/* Quem lê o estilo dele (v4): sabe os pesos do estilo do adversário e joga
   a melhor resposta. Com contaCartas, a crença só fica com as famílias que
   ele ainda tem na mão; sem, ignora a mão dele. A diferença entre os dois é
   o quanto vale contar as cartas (a informação da mão à vista). */
export function leitorDeEstilo(pEu, pEle, estiloEle, contaCartas = true) {
  const base = racional(pEu, pEle);
  return (e, l, p, r) => {
    if (!e.mao || M.momentoDoLado(e, l)) return base(e, l, p, r);
    const o = l === "a" ? "b" : "a", pos = posDoLado(e, l), mx = misturas(pEu, pEle)[pos];
    const w = PESOS_ESTILO[estiloEle][M.papel(e, o)], t = w.reduce((x, y) => x + y, 0);
    const crenca = contaCartas ? EST.filtrarPelaMao(w.map((x) => x / t), e, o) : w.map((x) => x / t);
    const ganho = F.map((f, i) => (EST.temCarta(e, l, f) ? mx.m[i].reduce((s, v, j) => s + v * crenca[j], 0) : -Infinity));
    return F[ganho.indexOf(Math.max(...ganho))];
  };
}
/* Mão à vista (v4): quanto vale contar as cartas (quem lê o estilo e conta
   contra quem lê o estilo e ignora a mão dele, os dois contra o jogador de
   estilo, espelho no nível 1) e quantas trocas ficam óbvias (ele só tem uma
   família). */
export function medirMao(n = 200) {
  let obv = 0, tot = 0;
  const v = { conta: [0, 0], ignora: [0, 0] };
  for (const s of ESTS) {
    const p = perfilTipico(s, 1);
    for (const [nome, estr] of [["conta", leitorDeEstilo(p, p, s, true)], ["ignora", leitorDeEstilo(p, p, s, false)]]) {
      const t = confronto(p, p, estr, heuristica(s), n, `mao${s}`);
      v[nome][0] += t.vX; v[nome][1] += t.vX + t.vO;
    }
    const ra = racional(p, p);
    for (let i = 0; i < n; i++) {
      let e = M.novaLuta(p, p); const r = lcg(i * 31 + 7);
      while (!e.fim) {
        tot++; if (EST.familiasComCarta(e, "b").length === 1) obv++;
        const fa = EST.familiaNaMao(e, "a", ra(e, "a", p, r), r), fb = EST.familiaNaMao(e, "b", ra(e, "b", p, r), r);
        e = M.resolverTroca(e, { a: p, b: p }, { a: fa, b: fb }, `ob${s}${i}`).estado;
      }
    }
  }
  const conta = 100 * v.conta[0] / v.conta[1], ignora = 100 * v.ignora[0] / v.ignora[1];
  return { obvias: 100 * obv / tot, contaCartas: conta, ignoraMao: ignora, valorDaMao: conta - ignora };
}
/* Fase 2: estratégia em duas etapas, com os níveis de leitura de gente.
   A pretendida sai de base. Sinal: honesto (a pretendida) ou, com chance
   blefe, a isca: uma postura cuja resposta óbvia perde pra pretendida
   ("mostro Guarda alta, ele vem pressionar, eu acerto o golpe"). Ação:
   "ignora" faz a pretendida; "confia" joga o que ganha do sinal dele;
   "desconfia" supõe que o sinal é isca e joga o que ganha da ação que a
   isca esconde. Sem resposta possível com as cartas que tem, a pretendida. */
const quemGanha = (e, l, fl, o, fo) => M.quemLeu({ [l]: M.papel(e, l), [o]: M.papel(e, o) }, { [l]: fl, [o]: fo });
function respostas(e, l, alvo) {   // famílias minhas (com carta) que ganham da família alvo dele
  const o = l === "a" ? "b" : "a";
  return F.filter((x) => EST.temCarta(e, l, x) && quemGanha(e, l, x, o, alvo) === l);
}
function iscas(e, l, pretendida) {   // posturas minhas cuja resposta dele perde pra pretendida
  const o = l === "a" ? "b" : "a";
  return F.filter((sg) => sg !== pretendida && EST.temCarta(e, l, sg)
    && F.some((ro) => EST.temCarta(e, o, ro) && quemGanha(e, o, ro, l, sg) === o && quemGanha(e, l, pretendida, o, ro) === l));
}
export function comSinal(base, { blefe = 0, resposta = "ignora" } = {}) {
  const pretendida = new Map();
  /* conta, nas lutas desta estratégia, quantas vezes a ação foi a postura
     (a honestidade real: com a iniciativa o blefe muda, e sem isca possível
     o sinal é honesto mesmo com blefe) */
  const conta = { sinais: 0, honestos: 0 };
  const fim = (l, sinais, f) => { conta.sinais++; if (sinais && sinais[l] === f) conta.honestos++; return f; };
  return {
    conta,
    sinal(e, l, p, r) {
      const f = EST.familiaNaMao(e, l, base(e, l, p, r), r);
      pretendida.set(l, f);
      /* fase 3: finta mais barata (iniciativa, ritmo), mais isca, na proporção do custo (como o bot) */
      if (r() >= Math.min(1, blefe * EST.ESTRATEGIA.custoFinta / EST.custoFintaDe(e, l, p))) return f;
      const is = iscas(e, l, f);
      return is.length ? is[Math.floor(r() * is.length)] : f;
    },
    acao(e, l, p, r, sinais) {
      const f = pretendida.get(l), o = l === "a" ? "b" : "a";
      if (!sinais || !sinais[o] || resposta === "ignora") return fim(l, sinais, f);
      let alvos = [sinais[o]];
      if (resposta === "desconfia") alvos = F.filter((x) => EST.temCarta(e, o, x) && iscas(e, o, x).includes(sinais[o]));
      const op = [...new Set(alvos.flatMap((al) => respostas(e, l, al)))];
      return fim(l, sinais, op.length ? op[Math.floor(r() * op.length)] : f);
    },
  };
}
/* Equilíbrio de k estratégias numa matriz de vitórias da linha (fictitious play). */
function equilibrioN(m, it = 20000) {
  const k = m.length, ca = new Array(k).fill(1), cb = new Array(k).fill(1);
  const norm = (c) => { const t = c.reduce((a, b) => a + b, 0); return c.map((x) => x / t); };
  for (let t = 0; t < it; t++) {
    const pa = norm(ca), pb = norm(cb);
    const ua = m.map((l) => l.reduce((s, v, j) => s + v * pb[j], 0)), ub = m[0].map((_, j) => m.reduce((s, l, i) => s + l[j] * pa[i], 0));
    ca[ua.indexOf(Math.max(...ua))]++; cb[ub.indexOf(Math.min(...ub))]++;
  }
  return norm(ca);
}
/* O blefe no equilíbrio (fase 2): 9 estratégias (isca com chance 0, 0,3 e
   0,6; resposta ao sinal dele: ignora, confia, desconfia) no espelho dos 4
   estilos, nível 1. A
   honestidade é a chance de o sinal ser a ação, na mistura de equilíbrio. */
export function medirSinais(n = 150) {
  const opcoes = [];
  for (const blefe of [0, 0.3, 0.6]) for (const resposta of ["ignora", "confia", "desconfia"]) opcoes.push({ blefe, resposta });
  const m = opcoes.map(() => opcoes.map(() => 0)), hon = opcoes.map(() => ({ sinais: 0, honestos: 0 }));
  const somar = (i, c) => { hon[i].sinais += c.sinais; hon[i].honestos += c.honestos; };
  for (const s of ESTS) {
    const p = perfilTipico(s, 1);
    opcoes.forEach((x, i) => opcoes.forEach((y, j) => {
      if (j < i) return;
      const ex = comSinal(racional(p, p), x), eo = comSinal(racional(p, p), y);
      const t = confronto(p, p, ex, eo, n, `sn${s}${i}x${j}`);
      m[i][j] += t.pct / ESTS.length; if (i !== j) m[j][i] += (100 - t.pct) / ESTS.length;
      somar(i, ex.conta); somar(j, eo.conta);
    }));
  }
  const eq = equilibrioN(m);
  /* fase 3: a honestidade contada nas lutas de cada estratégia (antes: 1 - blefe) */
  const honestidade = 100 * eq.reduce((s, w, i) => s + w * hon[i].honestos / Math.max(1, hon[i].sinais), 0);
  const usadas = opcoes.map((x, i) => [x, eq[i]]).filter(([, w]) => w > 0.1).map(([x, w]) => `blefe ${x.blefe} ${x.resposta}: ${(100 * w).toFixed(0)}%`);
  return { honestidade, usadas, matriz: m, opcoes, eq };
}
/* Fase 3: a iniciativa na luta com sinais (espelho dos 4 estilos, nível 1,
   os dois lados no equilíbrio da fase 2: blefe 0,3 e ignora o sinal dele).
   Quantas trocas mudam a iniciativa, quanto quem tem e quem não tem finta,
   e quanto valem, jogando com sinais, os dois nós que passaram pra finta e
   pra iniciativa (a medida dos nós da jxjarvore é sem sinais e não vê). */
export function medirIniciativa(n = 300) {
  const c = { trocas: 0, mudou: 0, segurou: 0, comIni: 0, fintaComIni: 0, semIni: 0, fintaSemIni: 0 };
  const estr = (p) => comSinal(racional(p, p), { blefe: 0.3 });
  for (const s of ESTS) {
    const p = perfilTipico(s, 1), P = { a: p, b: p };
    for (let i = 0; i < n; i++) {
      const eA = estr(p), eB = estr(p), r = lcg(i * 131 + 17);
      let e = M.novaLuta(p, p), k = 0;
      while (!e.fim && k++ < 100) {
        const sinais = { a: eA.sinal(e, "a", p, r), b: eB.sinal(e, "b", p, r) };
        const ac = { a: EST.familiaNaMao(e, "a", eA.acao(e, "a", p, r, sinais), r), b: EST.familiaNaMao(e, "b", eB.acao(e, "b", p, r, sinais), r), sinais };
        const ini = e.iniciativa, res = M.resolverTroca(e, P, ac, `ini${s}${i}`);
        c.trocas++;
        for (const ev of res.eventos) if (ev.tipo === "iniciativa") { if (ev.segurou) c.segurou++; else c.mudou++; }
        for (const l of ["a", "b"]) {
          const fintou = res.eventos.some((ev) => ev.tipo === "finta" && ev.quem === l);
          if (ini === l) { c.comIni++; if (fintou) c.fintaComIni++; } else { c.semIni++; if (fintou) c.fintaSemIni++; }
        }
        e = res.estado;
      }
    }
  }
  /* os dois nós, com sinais: como valorDoNo, mas os dois lados no equilíbrio da fase 2 */
  const nos = {};
  for (const id of ["controle_ritmo", "iniciativa"]) {
    const no = A.NOS[id], ramo = A.RAMOS[no.ramo], t = no.tier - 1;
    const pre = {}; let falta = A.PEDIDO_POR_TIER[t];
    for (let k = 0; k < t && falta > 0; k++) { const q = Math.min(3, falta); pre[ramo.nos[k].id] = q; falta -= q; }
    const pCom = A.perfilDeCombate({ estilo: no.estilo, categoria: "middleweight", build: { ...pre, [id]: 3 } });
    const pSem = A.perfilDeCombate({ estilo: no.estilo, categoria: "middleweight", build: pre });
    let soma = 0;
    for (const o of ESTS) {
      const pO = perfilTipico(o, 1);
      const eX = () => comSinal(racional(pSem, pO), { blefe: 0.3 }), eO = () => comSinal(racional(pO, pSem), { blefe: 0.3 });
      soma += confronto(pCom, pO, eX(), eO(), n, `nsi${id}${o}`).pct - confronto(pSem, pO, eX(), eO(), n, `nsi${id}${o}`).pct;
    }
    nos[id] = soma / ESTS.length;
  }
  const pc = (x, t) => 100 * x / Math.max(1, t);
  return { mudou: pc(c.mudou, c.trocas), segurou: pc(c.segurou, c.trocas), fintaComIni: pc(c.fintaComIni, c.comIni), fintaSemIni: pc(c.fintaSemIni, c.semIni), comIni: pc(c.comIni, 2 * c.trocas), nos };
}
/* Fase 4: quem fica por baixo sem a carta de Pressão (levantar) no round.
   Jogo racional, todas as duplas no nível 1. Por estilo: das trocas por
   baixo, quantas sem Pressão na mão (só sai raspando) */
export function medirPresos(n = 200) {
  const c = Object.fromEntries(ESTS.map((s) => [s, { baixo: 0, semP: 0 }]));
  for (const sa of ESTS) for (const sb of ESTS) {
    const pA = perfilTipico(sa, 1), pB = perfilTipico(sb, 1), P = { a: pA, b: pB }, ra = racional(pA, pB), rb = racional(pB, pA);
    for (let i = 0; i < n; i++) {
      const r = lcg(i * 53 + 11);
      let e = M.novaLuta(pA, pB), k = 0;
      while (!e.fim && k++ < 100) {
        for (const [l, s] of [["a", sa], ["b", sb]]) if (M.papel(e, l) === "baixo") { c[s].baixo++; if (!EST.temCarta(e, l, "pressao")) c[s].semP++; }
        const fa = EST.familiaNaMao(e, "a", ra(e, "a", pA, r), r), fb = EST.familiaNaMao(e, "b", rb(e, "b", pB, r), r);
        e = M.resolverTroca(e, P, { a: fa, b: fb }, `pr${sa}${sb}${i}`).estado;
      }
    }
  }
  return Object.fromEntries(ESTS.map((s) => [s, { baixo: c[s].baixo, semPressao: 100 * c[s].semP / Math.max(1, c[s].baixo) }]));
}
/* Fase 2: o hábito de blefe do bot, contado nas trocas da luta (quantas
   vezes a ação dele não foi a postura). Quase nunca blefa: confia (joga
   contra a postura). Blefa: ignora a postura e fica com a jogada que já lê
   o jeito; desconfiar (jogar contra a ação que a isca esconde) foi medido e
   piorou quem lê: contra o Provocador, de 70,6/68,6/61,6 pra
   61,7/58,6/54,1 (troca a jogada boa por uma resposta à isca e paga a
   finta). */
function leituraDoSinal(trocas) {
  const com = trocas.filter((t) => (t.eventos || []).some((ev) => ev.tipo === "sinais"));
  if (com.length < 3) return "ignora";
  const taxa = com.filter((t) => t.eventos.some((ev) => ev.tipo === "finta" && ev.quem === "b")).length / com.length;
  return taxa <= 0.1 ? "confia" : "ignora";
}
const lendoSinal = (f) => Object.assign(f, { leSinal: leituraDoSinal });
export const HUMANOS_MODELO = {
  acaso: () => aleatoria(),
  spam: () => spam("golpes"),
  estilo: (pH, pB, est) => heuristica(est),
  racional: (pH, pB) => racional(pH, pB),
  adaptativo: (pH, pB) => adaptativa(pH, pB),
  explorador: (pH, pB) => lendoSinal(explorador(pH, pB)),
  conhecedor: (pH, pB) => lendoSinal(conhecedor(pH, pB)),
  contador: (pH, pB) => contador(pH, pB),
};
/* Vitórias (%) do humano-modelo contra o bot de habilidade s. Cada par: um
   humano de build típica (estilo em rodízio) e um bot montado como no
   servidor (estilo e build sorteados), no mesmo nível. */
/* pers: força a personalidade do bot (null = a sorteada; "nenhuma" = bot de
   antes das personalidades). A chave do resultado ganha ":pers" quando pers
   vem. */
export function medirBots({ n = 100, pares = 8, niveis = [1, 10, 30], ss = [0, 0.25, 0.5, 0.75, 1], humanos = Object.keys(HUMANOS_MODELO), sal = "", pers = null, puro = 0, blefeH = 0.3 } = {}) {
  const res = {};
  for (const nivel of niveis) for (let i = 0; i < pares; i++) {
    const sH = ESTS[i % ESTS.length], pH = perfilTipico(sH, nivel);
    for (const s of ss) {
      const rating = BOT.RATING_BOT.min + s * (BOT.RATING_BOT.max - BOT.RATING_BOT.min);
      const bot = BOT.montarBot({ nivel, categoria: "middleweight", rating, semente: `mb${sal}:${nivel}:${i}:${s}`, pers: pers && pers !== "nenhuma" ? pers : null });
      if (pers === "nenhuma") delete bot.pers;
      const dados = BOT.dadosDaLuta(bot, pH, { puro });
      for (const hu of humanos) {
        let v = 0, d = 0;
        for (let k = 0; k < n; k++) {
          const fim = lutaContraBot(pH, HUMANOS_MODELO[hu](pH, bot.perfil, sH), bot, dados, `lb${sal}:${nivel}:${i}:${s}:${hu}:${k}`, { blefeH }).fim;
          if (fim.vencedor === "a") v++; else if (fim.vencedor === "b") d++;
        }
        (res[hu + ":" + s + (pers ? ":" + pers : "")] ||= []).push(100 * v / Math.max(1, v + d));
      }
    }
  }
  const out = {};
  for (const [k, l] of Object.entries(res)) out[k] = l.reduce((a, b) => a + b, 0) / l.length;
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2], N = Number(process.argv[3]) || 0;
  const f1 = (x) => x.toFixed(1);
  if (cmd === "matriz") {
    const r = medirMatriz(N || 600);
    console.log("vitórias da linha (jogo racional, nível 1):");
    console.log("          " + ESTS.map((o) => o.padStart(9)).join(""));
    for (const s of ESTS) console.log(s.padEnd(10) + ESTS.map((o) => f1(r.mat[s + ":" + o]).padStart(9)).join(""));
    console.log("métodos:", `KO/TKO ${f1(r.metodos.ko)}%  FIN ${f1(r.metodos.fin)}%  DEC ${f1(r.metodos.dec)}%  empate ${f1(r.metodos.empate)}%  | duração média ${f1(r.metodos.trocasMedia)} trocas de 12`);
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
  } else if (cmd === "builds") {
    console.log("nível 30, build alternativa contra a típica do mesmo estilo (vitórias da alternativa):");
    for (const s of ESTS) { const r = compararBuilds(s, N || 600); console.log(" ", s.padEnd(9), `invertida ${f1(r.invertida)}%  híbrida ${f1(r.hibrida)}%`, JSON.stringify(buildsDoNivel30(s).hibrida)); }
  } else if (cmd === "atributos") {
    console.log("estilo    " + A.ATRIBUTOS.map((a) => a.padStart(9)).join(""));
    for (const s of ESTS) console.log(s.padEnd(10) + A.ATRIBUTOS.map((a) => valorDoAtributo(s, a, 3, N || 1000).toFixed(2).padStart(9)).join(""));
  } else if (cmd === "variantes") {
    console.log("variante sempre na mão de X, espelho no nível 1 (vitórias de X; 50 = igual à média da família):");
    console.log("  " + "variante".padEnd(20) + "papel".padEnd(7) + "família".padEnd(9) + "média" + ESTS.map((o) => o.slice(0, 3).padStart(7)).join(""));
    for (const [id, r] of Object.entries(valorDasVariantes(N || 400)))
      console.log("  " + id.padEnd(20) + r.papel.padEnd(7) + r.familia.padEnd(9) + f1(r.pct).padStart(5) + ESTS.map((o) => f1(r.porEstilo[o]).padStart(7)).join(""));
  } else if (cmd === "bots") {
    const SS = [0, 0.25, 0.5, 0.75, 1], r = medirBots({ n: N || 100, pares: 12, ss: SS });
    const elo = (p) => -400 * Math.log10(p / (100 - p));
    console.log("vitórias do humano-modelo (linha) contra o bot de habilidade s (coluna), níveis 1, 10 e 30:");
    console.log("            " + SS.map((s) => ("s=" + s).padStart(8)).join(""));
    for (const hu of Object.keys(HUMANOS_MODELO)) console.log(hu.padEnd(12) + SS.map((s) => f1(r[hu + ":" + s]).padStart(8)).join(""));
    console.log("rating que o bot vale (1500 = humano de estilo):     " + SS.map((s) => String(Math.round(1500 + elo(r["estilo:" + s]))).padStart(8)).join(""));
    const mediaForca = (s) => BOT.PERSONALIDADES_IDS.reduce((a, p) => a + BOT.forcaDoBot(p, s), 0) / BOT.PERSONALIDADES_IDS.length;
    console.log("rating com que o bot entra (média de FORCA_BOT):    " + SS.map((s) => String(Math.round(mediaForca(s))).padStart(8)).join(""));
  } else if (cmd === "personalidades") {
    /* bots com personalidade (2026-10-20): vitórias do humano-modelo contra cada jeito, por habilidade do bot */
    const SS = [0, 0.5, 1], HU = ["acaso", "estilo", "explorador", "conhecedor"];
    for (const pers of [...BOT.PERSONALIDADES_IDS, "nenhuma"]) {
      const r = medirBots({ n: N || 40, pares: 8, niveis: [1, 10, 30], ss: SS, humanos: HU, pers, sal: "p" });
      console.log(`${pers === "nenhuma" ? "sem personalidade (antes)" : pers + " (" + BOT.PERSONALIDADES[pers].alcunha + ")"}:`);
      console.log("              " + SS.map((s) => ("s=" + s).padStart(8)).join(""));
      for (const hu of HU) console.log("  " + hu.padEnd(12) + SS.map((s) => f1(r[`${hu}:${s}:${pers}`]).padStart(8)).join(""));
    }
  } else if (cmd === "leitura") {
    console.log(`vantagem da leitura: em pé ${M.K.vantagem}, no chão ${M.K.vantagemChao} (vitórias de quem vê a ação do outro e acerta a leitura com essa chance, contra o jogador de estilo):`);
    for (const ac of [0, 0.35, 0.5, 1]) console.log(`  acerto ${String(ac).padEnd(5)} ${f1(leituraOraculo(ac, N || 300))}%`);
  } else if (cmd === "mao") {
    const r = medirMao(N || 300);
    console.log(`trocas em que ele só tem uma família: ${f1(r.obvias)}%`);
    console.log(`quem lê o estilo dele e conta as cartas: ${f1(r.contaCartas)}% contra o jogador de estilo; lendo sem contar: ${f1(r.ignoraMao)}% (a mão vale ${f1(r.valorDaMao)} pontos)`);
  } else if (cmd === "sinais") {
    const r = medirSinais(N || 200);
    console.log(`custo da finta ${EST.ESTRATEGIA.custoFinta}: o sinal acerta a ação ${f1(r.honestidade)}% das vezes no equilíbrio`);
    for (const u of r.usadas) console.log("  " + u);
  } else if (cmd === "presos") {
    const r = medirPresos(N || 200);
    console.log("por baixo sem a carta de Pressão (levantar), em % das trocas por baixo de cada estilo:");
    for (const s of ESTS) console.log("  " + s.padEnd(9) + `${f1(r[s].semPressao)}% de ${r[s].baixo} trocas por baixo`);
  } else if (cmd === "iniciativa") {
    const r = medirIniciativa(N || 300);
    console.log(`a iniciativa muda em ${f1(r.mudou)}% das trocas (o nó da manutenção segura em ${f1(r.segurou)}%); cada lado tem a iniciativa em ${f1(r.comIni)}% das trocas`);
    console.log(`quem tem a iniciativa finta em ${f1(r.fintaComIni)}% das trocas; quem não tem, em ${f1(r.fintaSemIni)}%`);
    console.log("valor dos nós com sinais (nível 3, contra os 4 estilos):", Object.entries(r.nos).map(([k, v]) => `${k} ${f1(v)}`).join(", "));
  } else if (cmd === "momentos") {
    const r = medirMomentos(N || 120);
    console.log(`lutas com grogue ${f1(r.comGrogue)}%, com finalização encaixada ${f1(r.comEncaixe)}%`);
    console.log(`o grogue acaba a luta em ${f1(r.grogueAcaba)}% das vezes, o encaixe em ${f1(r.encaixeAcaba)}%; ${f1(r.finsDeMomento)}% dos nocautes e finalizações saem de um momento`);
    console.log("misturas de equilíbrio no espelho (golpes queda defesa pressão), nível 1:");
    for (const s of ESTS) {
      const p = perfilTipico(s, 1);
      console.log("  " + s.padEnd(9) + Object.keys(BOT.ESTADO_MOMENTO).map((ch) => `${ch} ${misturaDoMomento(p, p, ch).a.map((x) => Math.round(100 * x)).join("/")}`).join("  "));
    }
  } else {
    console.log("uso: node ferramentas/jxj-balanco.mjs [matriz|niveis|nos|builds|atributos|variantes|bots|personalidades|leitura|momentos|mao|sinais|iniciativa|presos] [n]");
  }
}
