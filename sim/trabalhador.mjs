/* Um trabalhador da simulação: recebe lotes de lutas, joga no motor de
   verdade e devolve as contagens. Ajuste de números pra experimento vem em
   SIM_AJUSTE (JSON), aplicado nos objetos do motor antes de jogar. */
import { parentPort, workerData } from "node:worker_threads";
import * as M from "../api/_jxj-combate2.js";
import * as C from "../api/_jxj-cartas.js";
import { perfilLuta2 } from "../api/_jxj-luta2.js";
import { aleatoria, atenta, oraculo } from "./politicas.mjs";
import { lutaContraBot2 } from "./bots2.mjs";

import { aplicarAjuste } from "./ajuste.mjs";
aplicarAjuste(workerData && workerData.ajuste);

const politica = (nome, semente) => nome === "aleatoria" ? aleatoria() : nome.startsWith("oraculo") ? oraculo(semente, Number(nome.split(":")[1])) : atenta(semente);
/* o perfil do servidor (Fase 4): build {noId: nível}; sem build, nível 1. Deck que o
   servidor não aceitaria vira o padrão lá: aqui, erro (senão mede o deck errado calado) */
function perfil(estilo, categoria, deck, build = {}) {
  const p = perfilLuta2({ estilo, categoria, build, deck: deck || null });
  if (deck && JSON.stringify(p.deck) !== JSON.stringify(deck)) throw new Error(`deck recusado (${estilo}): ${deck.join(",")}`);
  return p;
}
function gerador(n) {
  let s = n >>> 0;
  return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const novaCarta = () => ({ naMao: 0, jogadas: 0, trocasVencidas: 0, trocasPerdidas: 0, lutas: 0, lutasVencidas: 0, espelhoLutas: 0, espelhoVencidas: 0 });

/* um lote: n lutas entre (sA, catA, deckA, polA) e (sB, catB, deckB, polB), trocando os lados a cada luta */
function lote(job) {
  const out = { vA: 0, vB: 0, emp: 0, met: {}, trocas: 0, lutas: 0, empatesVel: 0, interrupcoes: 0, anuladas: 0, encaixes: 0, trocasTotal: 0, cartas: {} };
  const espelho = job.sA === job.sB && JSON.stringify(job.deckA || C.DECK_PADRAO[job.sA]) === JSON.stringify(job.deckB || C.DECK_PADRAO[job.sB]) && job.catA === job.catB;
  for (let i = 0; i < job.n; i++) {
    const inv = i % 2 === 1, semente = `${job.sal}:${i}`, r = gerador(job.semente0 + i * 7919);
    const X = { s: job.sA, cat: job.catA, deck: job.deckA, pol: job.polA, build: job.buildA }, Y = { s: job.sB, cat: job.catB, deck: job.deckB, pol: job.polB, build: job.buildB };
    const [ladoA, ladoB] = inv ? [Y, X] : [X, Y];
    const perfis = { a: perfil(ladoA.s, ladoA.cat, ladoA.deck, ladoA.build), b: perfil(ladoB.s, ladoB.cat, ladoB.deck, ladoB.build) };
    const pol = { a: politica(ladoA.pol, "aval"), b: politica(ladoB.pol, "aval") };
    let e = M.novaLuta2(perfis.a, perfis.b, semente);
    const jogou = { a: new Set(), b: new Set() };
    let n = 0;
    while (!e.fim && n++ < 40) {
      /* quem é oráculo decide depois e pode ver a carta do outro */
      const oA = ladoA.pol.startsWith("oraculo"), oB = ladoB.pol.startsWith("oraculo");
      let da, db;
      if (oA && !oB) { db = pol.b(e, "b", perfis, r); da = pol.a(e, "a", perfis, r, db.carta); }
      else { da = pol.a(e, "a", perfis, r); db = pol.b(e, "b", perfis, r, oB ? da.carta : undefined); }
      for (const l of ["a", "b"]) {
        const pp = M.papel2(e, l), vistas = new Set(e.mao[l].map((id) => M.cartaEfetiva(id, pp, perfis[l]).id));
        for (const id of vistas) (out.cartas[id] ||= novaCarta()).naMao++;
      }
      const res = M.resolverTroca2(e, perfis, { a: da.carta, b: db.carta }, semente);
      const R = res.resolucao;
      out.trocasTotal++;
      if (R.ordem === "empate") out.empatesVel++;
      if (R.ordem === "encaixe") out.encaixes++;
      out.interrupcoes += R.interrupcoes.length;
      out.anuladas += R.reacoes.length;
      for (const l of ["a", "b"]) {
        const id = R.cartas[l].efetiva, c = (out.cartas[id] ||= novaCarta());
        c.jogadas++;
        if (R.vencedor === l) c.trocasVencidas++; else if (R.vencedor) c.trocasPerdidas++;
        jogou[l].add(id);
      }
      e = res.estado;
    }
    const f = e.fim;
    out.lutas++;
    out.trocas += (f.round - 1) * 3 + f.troca;
    out.met[f.metodo] = (out.met[f.metodo] || 0) + 1;
    const venceuX = f.vencedor ? (f.vencedor === "a") !== inv : null;
    if (venceuX === true) out.vA++; else if (venceuX === false) out.vB++; else out.emp++;
    for (const l of ["a", "b"]) for (const id of jogou[l]) {
      const c = out.cartas[id];
      c.lutas++;
      if (f.vencedor === l) c.lutasVencidas++;
      if (espelho) { c.espelhoLutas++; if (f.vencedor === l) c.espelhoVencidas++; }
    }
  }
  return out;
}

/* Fase 5: o jogador modelo (lado X) contra o bot do servidor (lado Y, job.bot =
   {pers, s}), pelo caminho do servidor (sim/bots2.mjs), trocando os lados a cada luta */
function loteBot(job) {
  const out = { vA: 0, vB: 0, emp: 0, met: {}, trocas: 0, lutas: 0, empatesVel: 0, interrupcoes: 0, anuladas: 0, encaixes: 0, trocasTotal: 0, cartas: {} };
  for (let i = 0; i < job.n; i++) {
    const { fim: f, eu, ele } = lutaContraBot2({
      jogador: { estilo: job.sA, categoria: job.catA, build: job.buildA || {} },
      bot: { estilo: job.sB, categoria: job.catB, build: job.buildB || {}, pers: job.bot.pers, s: job.bot.s },
      ladoBot: i % 2 === 1 ? "a" : "b", semente: `${job.sal}:${i}`, n: job.semente0 + i });
    out.lutas++;
    out.trocas += (f.round - 1) * 3 + f.troca;
    out.met[f.metodo] = (out.met[f.metodo] || 0) + 1;
    if (f.vencedor === eu) out.vA++; else if (f.vencedor === ele) out.vB++; else out.emp++;
  }
  return out;
}

parentPort.on("message", (job) => {
  if (job === "fim") return process.exit(0);
  parentPort.postMessage({ id: job.id, out: job.bot ? loteBot(job) : lote(job) });
});
