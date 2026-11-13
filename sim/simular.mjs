/* Simulação do combate v2 (Fase 1 da tarefa de 2026-11-12). Joga lutas
   bot contra bot no motor de verdade (api/_jxj-combate2.js), em paralelo,
   e escreve o relatório em sim/relatorio.md.

   Uso:
     node sim/simular.mjs [lutas por confronto, padrão 10000]
   Variáveis:
     SIM_PARTES  partes, separadas por vírgula (padrão: todas):
                 matriz, categorias, pesos, habilidade, decks,
                 nivel30, evolucao, nos (a árvore, Fase 4)
     SIM_AJUSTE  números de experimento em JSON (sim/ajuste.mjs)
     SIM_DECKS   decks aleatórios por estilo (padrão 40)

   Metas (da tarefa): estilo de 45% a 55% no agregado; carta de 40% a 60%
   quando jogada; duração parecida com a de hoje (7,8 trocas; nocaute
   21,7%, finalização 7,5%, decisão 68,2%). Meta a mais (decisão 10):
   jogador atento vence o jogador ao acaso em 70% ou mais. */
import { Worker } from "node:worker_threads";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as C from "../api/_jxj-cartas.js";
import { CATEGORIAS_LANCAMENTO, CATEGORIAS, buildTipica, RAMOS, ESTILOS } from "../api/_jxj-arvores.js";
import { aplicarAjuste } from "./ajuste.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const N = Number(process.argv[2] || 10000);
const ajuste = process.env.SIM_AJUSTE ? JSON.parse(process.env.SIM_AJUSTE) : null;
aplicarAjuste(ajuste);
const PARTES = (process.env.SIM_PARTES || "matriz,categorias,pesos,habilidade,decks,nivel30,evolucao,nos").split(",");
const NDECKS = Number(process.env.SIM_DECKS || 40);
const ESTS = ["striker", "wrestler", "grappler", "counter"];
/* SIM_ESTILOS: na parte nos, mede só a árvore destes (contra os 4) */
const ESTS_NOS = process.env.SIM_ESTILOS ? process.env.SIM_ESTILOS.split(",") : ESTS;
const NOMES = { striker: "Striker", wrestler: "Wrestler", grappler: "Grappler", counter: "Counter" };
const LOTE = 200;

/* ---------- os trabalhadores ---------- */
const W = Math.max(1, os.cpus().length - 1);
const trabalhadores = Array.from({ length: W }, () => new Worker(path.join(AQUI, "trabalhador.mjs"), { workerData: { ajuste } }));
let seq = 0;
const hashPar = (t) => { let h = 2166136261; for (const ch of t) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h; };
function rodar(jobs) {
  /* cada job vira lotes; devolve a soma por job */
  const fila = [], soma = new Map();
  for (const j of jobs) {
    soma.set(j.chave, null);
    /* par: jobs com o mesmo par jogam as mesmas sementes (luta com o nó e sem ele: a diferença fica só no efeito) */
    for (let ini = 0; ini < j.n; ini += LOTE) fila.push({ ...j, n: Math.min(LOTE, j.n - ini), sal: `${j.par || j.chave}:${ini}`,
      semente0: j.par ? (hashPar(`${j.par}:${ini}`) >>> 0) : (seq++ * 104729) >>> 0, id: j.chave });
  }
  return new Promise((ok) => {
    let ativos = 0;
    const proximo = (w) => {
      if (!fila.length) { if (!ativos) ok(soma); return; }
      const job = fila.shift(); ativos++;
      w.once("message", ({ id, out }) => { ativos--; soma.set(id, juntar(soma.get(id), out)); proximo(w); });
      w.postMessage(job);
    };
    trabalhadores.forEach(proximo);
  });
}
function juntar(a, b) {
  if (!a) return structuredClone(b);
  for (const k of ["vA", "vB", "emp", "trocas", "lutas", "empatesVel", "interrupcoes", "anuladas", "encaixes", "trocasTotal"]) a[k] += b[k];
  for (const [m, v] of Object.entries(b.met)) a.met[m] = (a.met[m] || 0) + v;
  for (const [id, c] of Object.entries(b.cartas)) { const x = (a.cartas[id] ||= Object.fromEntries(Object.keys(c).map((k) => [k, 0]))); for (const k of Object.keys(c)) x[k] += c[k]; }
  return a;
}
const pct = (x, t) => (t ? (100 * x) / t : 0);
const f1 = (x) => x.toFixed(1);
const vit = (o) => pct(o.vA, o.vA + o.vB);   // vitória de A, sem os empates

/* ---------- decks aleatórios (caçar combo quebrado) ---------- */
function gerador(n) { let s = n >>> 0; return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function deckAleatorio(estilo, r) {
  const lib = C.cartasLiberadas(estilo);
  for (let tent = 0; tent < 500; tent++) {
    const d = C.FIXAS[estilo].slice();
    while (d.length < C.DECK.tamanho) { const id = lib[Math.floor(r() * lib.length)]; if (d.filter((x) => x === id).length < C.DECK.copias) d.push(id); }
    if (C.validarDeck(estilo, d).ok) return d.sort();
  }
  throw new Error("não achei deck válido pra " + estilo);
}

/* ---------- partes ---------- */
const rel = [];
const linha = (s = "") => { rel.push(s); console.log(s); };
const t0 = Date.now();
const cartasTodas = {};
const somarCartas = (out) => { for (const [id, c] of Object.entries(out.cartas)) { const x = (cartasTodas[id] ||= Object.fromEntries(Object.keys(c).map((k) => [k, 0]))); for (const k of Object.keys(c)) x[k] += c[k]; } };

linha(`# Simulação do combate v2`);
linha();
linha(`${N} lutas por confronto, ${W} trabalhadores${ajuste ? ", com SIM_AJUSTE" : ""}. Jogador atento contra jogador atento, decks padrão, nível 1, peso-médio (menos onde diz).`);
linha();

let geral = null;
const matriz = {};
if (PARTES.includes("matriz")) {
  const jobs = [];
  for (let i = 0; i < 4; i++) for (let j = i; j < 4; j++) jobs.push({ chave: `m:${ESTS[i]}:${ESTS[j]}`, sA: ESTS[i], sB: ESTS[j], catA: "middleweight", catB: "middleweight", polA: "atenta", polB: "atenta", n: N });
  const r = await rodar(jobs);
  for (const [k, o] of r) { const [, a, b] = k.split(":"); matriz[a + ":" + b] = o; geral = juntar(geral, o); somarCartas(o); }
  const m = (a, b) => (matriz[a + ":" + b] ? vit(matriz[a + ":" + b]) : 100 - vit(matriz[b + ":" + a]));
  linha("## Estilo contra estilo");
  linha();
  linha("Vitória da linha contra a coluna (sem os empates).");
  linha();
  linha("| | " + ESTS.map((s) => NOMES[s]).join(" | ") + " | Agregado |");
  linha("|---|" + ESTS.map(() => "---").join("|") + "|---|");
  const agregado = {};
  for (const a of ESTS) {
    const outros = ESTS.filter((b) => b !== a);
    agregado[a] = outros.reduce((s, b) => s + m(a, b), 0) / outros.length;
    linha(`| ${NOMES[a]} | ` + ESTS.map((b) => f1(m(a, b))).join(" | ") + ` | **${f1(agregado[a])}** |`);
  }
  const fora = ESTS.filter((s) => agregado[s] < 45 || agregado[s] > 55);
  let torto = null;
  for (const a of ESTS) for (const b of ESTS) if (a !== b && (!torto || m(a, b) > torto.v)) torto = { a, b, v: m(a, b) };
  linha();
  linha(`Meta 45% a 55% no agregado: ${fora.length ? "FORA: " + fora.map((s) => `${NOMES[s]} ${f1(agregado[s])}%`).join(", ") : "todos dentro"}. Confronto mais torto: ${NOMES[torto.a]} contra ${NOMES[torto.b]}, ${f1(torto.v)}%.`);
  linha();
  linha("## Duração e como acaba");
  linha();
  const L = geral.lutas, met = geral.met;
  linha(`| Trocas por luta | Nocaute | Nocaute técnico | Finalização | Decisão | Empate |`);
  linha(`|---|---|---|---|---|---|`);
  linha(`| ${f1(geral.trocas / L)} | ${f1(pct(met.KO || 0, L))}% | ${f1(pct(met.TKO || 0, L))}% | ${f1(pct(met.FIN || 0, L))}% | ${f1(pct(met.DEC || 0, L))}% | ${f1(pct(met.EMPATE || 0, L))}% |`);
  linha();
  linha(`Referência de hoje (motor v5): 7,8 trocas; nocaute (KO + TKO) 21,7%, finalização 7,5%, decisão 68,2%. Aqui, nocaute somado: ${f1(pct((met.KO || 0) + (met.TKO || 0), L))}%.`);
  linha();
  linha(`Trocas com velocidade empatada: ${f1(pct(geral.empatesVel, geral.trocasTotal))}%. Interrupções por troca: ${(geral.interrupcoes / geral.trocasTotal).toFixed(2)}. Anulações por troca: ${(geral.anuladas / geral.trocasTotal).toFixed(2)}. Trocas no encaixe: ${f1(pct(geral.encaixes, geral.trocasTotal))}%.`);
  linha();
  linha("## Cartas");
  linha();
  linha("Escolha = vezes jogada / vezes na mão. Troca = trocas vencidas quando jogada (sem as empatadas). Luta = lutas vencidas por quem jogou a carta pelo menos uma vez. Espelho = o mesmo, só nas lutas de deck igual contra deck igual. Relativa = Luta menos a média das cartas da mesma posição (em pé, por cima, por baixo): quem joga carta de baixo já está por baixo, e isso pesa na luta seja qual for a carta (decisão 9).");
  linha();
  linha("| Carta | Posição | Jogadas | Escolha | Troca | Luta | Espelho | Relativa |");
  linha("|---|---|---|---|---|---|---|---|");
  const dom = [], domRel = [];
  const nomeCarta = (id) => (C.CARTAS[id] || C.CARTA_DO_CHAO[id] || { nome: id }).nome;
  const posDe = (id) => (C.CARTAS[id] ? "pe" : C.CARTA_DO_CHAO[id].contexto);
  const NOME_POS = { pe: "em pé", cima: "por cima", baixo: "por baixo" };
  const media = {};
  for (const [id, c] of Object.entries(cartasTodas)) { const p = posDe(id), x = (media[p] ||= { v: 0, n: 0 }); x.v += c.lutasVencidas; x.n += c.lutas; }
  for (const [id, c] of Object.entries(cartasTodas).sort((x, y) => (posDe(x[0]) > posDe(y[0]) ? -1 : posDe(x[0]) < posDe(y[0]) ? 1 : y[1].jogadas - x[1].jogadas))) {
    const lu = pct(c.lutasVencidas, c.lutas), mp = media[posDe(id)], rel = lu - pct(mp.v, mp.n);
    if (c.jogadas > 200 && (lu < 40 || lu > 60)) dom.push(`${nomeCarta(id)} ${f1(lu)}%`);
    if (c.jogadas > 200 && Math.abs(rel) > 10) domRel.push(`${nomeCarta(id)} ${rel > 0 ? "+" : ""}${f1(rel)}`);
    linha(`| ${nomeCarta(id)} | ${NOME_POS[posDe(id)]} | ${c.jogadas} | ${f1(pct(c.jogadas, c.naMao))}% | ${f1(pct(c.trocasVencidas, c.trocasVencidas + c.trocasPerdidas))}% | ${f1(lu)}% | ${c.espelhoLutas ? f1(pct(c.espelhoVencidas, c.espelhoLutas)) + "%" : "-"} | ${rel > 0 ? "+" : ""}${f1(rel)} |`);
  }
  linha();
  linha(`Meta 40% a 60% (luta vencida quando jogada): ${dom.length ? "FORA: " + dom.join(", ") : "todas dentro"}. Relativa à posição, até 10 pontos: ${domRel.length ? "FORA: " + domRel.join(", ") : "todas dentro"}.`);
  linha();
}

if (PARTES.includes("categorias")) {
  const n = Math.round(N / 4), jobs = [];
  for (const cat of CATEGORIAS_LANCAMENTO) for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++)
    jobs.push({ chave: `c:${cat}:${ESTS[i]}:${ESTS[j]}`, sA: ESTS[i], sB: ESTS[j], catA: cat, catB: cat, polA: "atenta", polB: "atenta", n });
  const r = await rodar(jobs);
  linha("## Estilo por categoria de peso");
  linha();
  linha(`Agregado de cada estilo contra os outros três, na mesma categoria (${n} lutas por confronto).`);
  linha();
  linha("| Categoria | " + ESTS.map((s) => NOMES[s]).join(" | ") + " |");
  linha("|---|" + ESTS.map(() => "---").join("|") + "|");
  for (const cat of CATEGORIAS_LANCAMENTO) {
    const ag = Object.fromEntries(ESTS.map((s) => [s, []]));
    for (const [k, o] of r) { const [, c, a, b] = k.split(":"); if (c !== cat) continue; ag[a].push(vit(o)); ag[b].push(100 - vit(o)); }
    linha(`| ${CATEGORIAS[cat].nome} | ` + ESTS.map((s) => f1(ag[s].reduce((x, y) => x + y, 0) / ag[s].length)).join(" | ") + " |");
  }
  linha();
}

if (PARTES.includes("pesos")) {
  const n = Math.round(N / 8), jobs = [];
  for (let i = 0; i < CATEGORIAS_LANCAMENTO.length; i++) for (let j = i + 1; j < CATEGORIAS_LANCAMENTO.length; j++) for (const s of ESTS)
    jobs.push({ chave: `p:${CATEGORIAS_LANCAMENTO[j]}:${CATEGORIAS_LANCAMENTO[i]}:${s}`, sA: s, sB: s, catA: CATEGORIAS_LANCAMENTO[j], catB: CATEGORIAS_LANCAMENTO[i], polA: "atenta", polB: "atenta", n });
  const r = await rodar(jobs);
  linha("## Peso contra peso (a fila junta pesos diferentes)");
  linha();
  linha(`O mais pesado contra o mais leve, mesmo estilo, média dos 4 estilos (${n} lutas por estilo).`);
  linha();
  linha("| Mais pesado | Mais leve | Vitória do mais pesado |");
  linha("|---|---|---|");
  const par = {};
  for (const [k, o] of r) { const [, pes, lev] = k.split(":"); (par[pes + ":" + lev] ||= []).push(vit(o)); }
  for (const [k, v] of Object.entries(par)) { const [pes, lev] = k.split(":"); linha(`| ${CATEGORIAS[pes].nome} | ${CATEGORIAS[lev].nome} | ${f1(v.reduce((a, b) => a + b, 0) / v.length)}% |`); }
  linha();
}

if (PARTES.includes("habilidade")) {
  const jobs = [];
  for (const s of ESTS) {
    jobs.push({ chave: `h:acaso:${s}`, sA: s, sB: s, catA: "middleweight", catB: "middleweight", polA: "atenta", polB: "aleatoria", n: Math.round(N / 5) });
    jobs.push({ chave: `h:le50:${s}`, sA: s, sB: s, catA: "middleweight", catB: "middleweight", polA: "oraculo:0.5", polB: "atenta", n: Math.round(N / 5) });
    jobs.push({ chave: `h:le100:${s}`, sA: s, sB: s, catA: "middleweight", catB: "middleweight", polA: "oraculo:1", polB: "atenta", n: Math.round(N / 10) });
  }
  const r = await rodar(jobs);
  linha("## Habilidade (quanto a escolha decide)");
  linha();
  linha("Espelho de cada estilo. Meta (decisão 10): o atento vence o jogador ao acaso em 70% ou mais.");
  linha();
  linha("| Estilo | Atento x ao acaso | Lê metade das trocas x atento | Lê todas x atento |");
  linha("|---|---|---|---|");
  for (const s of ESTS) linha(`| ${NOMES[s]} | ${f1(vit(r.get("h:acaso:" + s)))}% | ${f1(vit(r.get("h:le50:" + s)))}% | ${f1(vit(r.get("h:le100:" + s)))}% |`);
  linha();
}

if (PARTES.includes("decks")) {
  const rr = gerador(20261112), decks = {};
  for (const s of ESTS) decks[s] = Array.from({ length: NDECKS }, () => deckAleatorio(s, rr));
  const n = 400, jobs = [];
  for (const s of ESTS) decks[s].forEach((d, k) => { for (const o of ESTS) jobs.push({ chave: `d:${s}:${k}:${o}`, sA: s, sB: o, deckA: d, catA: "middleweight", catB: "middleweight", polA: "atenta", polB: "atenta", n }); });
  const r = await rodar(jobs);
  linha("## Decks montados ao acaso (caça a combo quebrado)");
  linha();
  linha(`${NDECKS} decks válidos por estilo, cada um contra os 4 decks padrão (${n} lutas por confronto). Dominância = acima de 60% contra o campo.`);
  linha();
  const melhores = [];
  linha("| Estilo | Melhor deck aleatório | Contra o campo | Mediana | Pior |");
  linha("|---|---|---|---|---|");
  for (const s of ESTS) {
    const res = decks[s].map((d, k) => ({ d, v: ESTS.reduce((a, o) => a + vit(r.get(`d:${s}:${k}:${o}`)), 0) / 4 })).sort((x, y) => y.v - x.v);
    const conta = (d) => Object.entries(d.reduce((m, id) => ((m[id] = (m[id] || 0) + 1), m), {})).map(([id, q]) => `${q}x ${C.CARTAS[id].nome}`).join(", ");
    linha(`| ${NOMES[s]} | ${conta(res[0].d)} | ${f1(res[0].v)}% | ${f1(res[Math.floor(res.length / 2)].v)}% | ${f1(res[res.length - 1].v)}% |`);
    melhores.push({ s, d: res[0].d, v: res[0].v });
  }
  linha();
  /* o melhor de cada estilo de novo, com mais lutas (o primeiro lugar de 40 tende a ser sorte) */
  const n2 = Math.round(N / 2), jobs2 = [];
  for (const b of melhores) for (const o of ESTS) jobs2.push({ chave: `D:${b.s}:${o}`, sA: b.s, sB: o, deckA: b.d, catA: "middleweight", catB: "middleweight", polA: "atenta", polB: "atenta", n: n2 });
  const r2 = await rodar(jobs2);
  const dom = [];
  for (const b of melhores) { const v = ESTS.reduce((a, o) => a + vit(r2.get(`D:${b.s}:${o}`)), 0) / 4; if (v > 60) dom.push(`${NOMES[b.s]} ${f1(v)}%`); linha(`- Melhor deck do ${NOMES[b.s]} medido de novo (${n2} lutas por confronto): ${f1(v)}% contra o campo.`); }
  linha();
  linha(`Dominância (acima de 60%): ${dom.length ? "SIM: " + dom.join(", ") : "nenhuma"}.`);
  linha();
}

/* ---------- a árvore (Fase 4) ---------- */
const B30 = Object.fromEntries(ESTS.map((s) => [s, buildTipica(s, 30)]));
/* o deck padrão com a carta nova no lugar de uma que o estilo dispensa (nunca o Jab: sem
   ele ninguém segura a queda de velocidade 4, e o teste media a falta do Jab, não a carta) */
const NOVA = { striker: "combinacao", wrestler: "double_leg", grappler: "rasteira", counter: "esquiva", ...JSON.parse(process.env.SIM_NOVA || "{}") };
const SAI = { striker: "contra_ataque", wrestler: "cruzado", grappler: "clinch", counter: "chute_alto" };
const deckCom = (s) => { const d = C.DECK_PADRAO[s].slice(), i = d.lastIndexOf(SAI[s]); if (i >= 0) d[i] = NOVA[s]; return d; };
if (PARTES.includes("nivel30")) {
  const jobs = [];
  for (let i = 0; i < 4; i++) for (let j = i; j < 4; j++) for (const comNova of [false, true])
    jobs.push({ chave: `n30:${comNova ? 1 : 0}:${ESTS[i]}:${ESTS[j]}`, sA: ESTS[i], sB: ESTS[j], catA: "middleweight", catB: "middleweight", polA: "atenta", polB: "atenta",
      buildA: B30[ESTS[i]], buildB: B30[ESTS[j]], deckA: comNova ? deckCom(ESTS[i]) : undefined, deckB: comNova ? deckCom(ESTS[j]) : undefined, n: Math.round(N / 2) });
  const r = await rodar(jobs);
  linha("## Nível 30 (build típica de cada estilo)");
  linha();
  for (const comNova of [false, true]) {
    const m = (a, b) => (r.get(`n30:${comNova ? 1 : 0}:${a}:${b}`) ? vit(r.get(`n30:${comNova ? 1 : 0}:${a}:${b}`)) : 100 - vit(r.get(`n30:${comNova ? 1 : 0}:${b}:${a}`)));
    linha(comNova ? "Com a carta nova no deck (no lugar de: " + ESTS.map((x) => `${NOMES[x]}, ${C.CARTAS[SAI[x]].nome}`).join("; ") + "):" : "Deck padrão:");
    linha();
    linha("| | " + ESTS.map((s) => NOMES[s]).join(" | ") + " | Agregado |");
    linha("|---|" + ESTS.map(() => "---").join("|") + "|---|");
    for (const a of ESTS) { const ag = ESTS.filter((b) => b !== a).reduce((x, b) => x + m(a, b), 0) / 3; linha(`| ${NOMES[a]} | ` + ESTS.map((b) => f1(m(a, b))).join(" | ") + ` | **${f1(ag)}** |`); }
    linha();
  }
}
if (PARTES.includes("evolucao")) {
  const jobs = [];
  for (const s of ESTS) for (const [alto, baixo] of [[30, 1], [30, 20], [10, 1]])
    jobs.push({ chave: `ev:${s}:${alto}:${baixo}`, sA: s, sB: s, catA: "middleweight", catB: "middleweight", polA: "atenta", polB: "atenta",
      buildA: buildTipica(s, alto), buildB: buildTipica(s, baixo), n: Math.round(N / 4) });
  /* e contra o campo: o 30 de cada estilo contra os 4 estilos no nível 1 */
  for (const s of ESTS) for (const o of ESTS)
    jobs.push({ chave: `evc:${s}:${o}`, sA: s, sB: o, catA: "middleweight", catB: "middleweight", polA: "atenta", polB: "atenta",
      buildA: buildTipica(s, 30), n: Math.round(N / 8) });
  const r = await rodar(jobs);
  linha("## Evolução (mesmo estilo, build típica)");
  linha();
  linha("Hoje (motor v5): 30 contra 1 entre 62% e 85%; 30 contra 20 acima de 50%.");
  linha();
  linha("| Estilo | 10 contra 1 | 30 contra 1 | 30 contra 20 | 30 contra o campo no 1 |");
  linha("|---|---|---|---|---|");
  for (const s of ESTS) linha(`| ${NOMES[s]} | ${f1(vit(r.get(`ev:${s}:10:1`)))}% | ${f1(vit(r.get(`ev:${s}:30:1`)))}% | ${f1(vit(r.get(`ev:${s}:30:20`)))}% | ${f1(ESTS.reduce((x, o) => x + vit(r.get(`evc:${s}:${o}`)), 0) / 4)}% |`);
  linha();
}
if (PARTES.includes("nos")) {
  /* cada nó no nível 3, sozinho, contra os 4 estilos (nível 1), menos a mesma luta sem o nó: pontos de vitória */
  const n = Math.round(N / 10), jobs = [];
  for (const s of ESTS_NOS) {
    for (const o of ESTS) jobs.push({ chave: `no:${s}:-:${o}`, par: `no:${s}:${o}`, sA: s, sB: o, catA: "middleweight", catB: "middleweight", polA: "atenta", polB: "atenta", n });
    for (const ramo of ESTILOS[s].ramos) for (const no of RAMOS[ramo].nos) {
      const comCarta = Object.values(C.CARTAS).find((c) => c.desbloqueio === no.id);
      for (const o of ESTS) jobs.push({ chave: `no:${s}:${no.id}:${o}`, par: `no:${s}:${o}`, sA: s, sB: o, catA: "middleweight", catB: "middleweight", polA: "atenta", polB: "atenta", n,
        buildA: { [no.id]: 3 }, deckA: comCarta ? deckCom(s) : undefined });
    }
  }
  const r = await rodar(jobs);
  linha("## Quanto vale cada nó (nível 3, sozinho)");
  linha();
  linha(`Vitória com o nó menos a vitória sem ele, média contra os 4 estilos (${n} lutas por confronto). Hoje (motor v5): de 0,5 a 6,5 pontos.`);
  linha();
  linha("| Estilo | Nó | No combate novo | Pontos |");
  linha("|---|---|---|---|");
  const fora = [];
  for (const s of ESTS_NOS) for (const ramo of ESTILOS[s].ramos) for (const no of RAMOS[ramo].nos) {
    const v = ESTS.reduce((a, o) => a + vit(r.get(`no:${s}:${no.id}:${o}`)) - vit(r.get(`no:${s}:-:${o}`)), 0) / 4;
    if (v < 0.5 || v > 6.5) fora.push(`${no.nome} ${f1(v)}`);
    linha(`| ${NOMES[s]} | ${no.nome} | ${(C.ARVORE_V2[no.id] || []).map((x) => x.desc).join(" ") || "só o atributo"} | ${v >= 0 ? "+" : ""}${f1(v)} |`);
  }
  linha();
  linha(`Fora de 0,5 a 6,5: ${fora.length ? fora.join(", ") : "nenhum"}.`);
  linha();
}

linha(`Tempo: ${((Date.now() - t0) / 1000).toFixed(0)} s.`);
fs.writeFileSync(path.join(AQUI, "relatorio.md"), rel.join("\n") + "\n");
for (const w of trabalhadores) w.postMessage("fim");
