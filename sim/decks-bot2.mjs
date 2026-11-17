/* Gera os decks do bot v2 por faixa de nível (DECKS_BOT2 em api/_jxj-bot2.js).
   Refazer depois de mexer em número de carta (rodada de calibragem):
     node sim/decks-bot2.mjs            mostra o bloco novo
     node sim/decks-bot2.mjs --escrever troca o bloco entre as marcas DECKS_BOT2 do api/_jxj-bot2.js
   Depois: node sim/simular.mjs 10000 com SIM_PARTES=bots SIM_SAIDA=relatorio-bots.md
   e copiar a "FORCA_BOT2 medida" pra FORCA_BOT2 (o deck muda a força do bot).
   Cada faixa usa a build típica do nível NIVEL_DA_FAIXA e a busca de deck
   (sim/busca-deck.mjs, subida de encosta, política atenta): volta 1 contra os
   4 decks padrão, volta 2 contra os padrão mais os da volta 1, como a parte
   busca do sim/simular.mjs. Variáveis: SIM_NBUSCA (200), SIM_NCONF (2000) e SIM_FAIXAS (padrão baixo,medio,alto;
   com --escrever, só as faixas rodadas mudam, as outras ficam como estão no arquivo). */
import { Worker } from "node:worker_threads";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as C from "../api/_jxj-cartas.js";
import { buildTipica } from "../api/_jxj-arvores.js";
import { buscarDeck } from "./busca-deck.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ESTS = ["striker", "wrestler", "grappler", "counter"];
export const NIVEL_DA_FAIXA = { baixo: 5, medio: 15, alto: 30 };
const NB = Number(process.env.SIM_NBUSCA || 200), NC = Number(process.env.SIM_NCONF || 2000), LOTE = 200;

const W = Math.max(1, os.cpus().length - 1);
const trabalhadores = Array.from({ length: W }, () => new Worker(path.join(AQUI, "trabalhador.mjs"), { workerData: { ajuste: null } }));
const hashPar = (t) => { let h = 2166136261; for (const ch of t) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h; };
function juntar(a, b) {
  if (!a) return structuredClone(b);
  for (const k of ["vA", "vB", "emp", "trocas", "lutas", "empatesVel", "interrupcoes", "anuladas", "encaixes", "trocasTotal"]) a[k] += b[k];
  for (const [m, v] of Object.entries(b.met)) a.met[m] = (a.met[m] || 0) + v;
  for (const [id, c] of Object.entries(b.cartas)) { const x = (a.cartas[id] ||= Object.fromEntries(Object.keys(c).map((k) => [k, 0]))); for (const k of Object.keys(c)) x[k] += c[k]; }
  return a;
}
/* o mesmo rodar do simular.mjs: jobs viram lotes, devolve a soma por chave */
function rodar(jobs) {
  const fila = [], soma = new Map();
  for (const j of jobs) {
    soma.set(j.chave, null);
    for (let ini = 0; ini < j.n; ini += LOTE) fila.push({ ...j, n: Math.min(LOTE, j.n - ini), sal: `${j.par || j.chave}:${ini}`, semente0: hashPar(`${j.par || j.chave}:${ini}`) >>> 0, id: j.chave });
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

const decks = {};
const FAIXAS = process.env.SIM_FAIXAS ? process.env.SIM_FAIXAS.split(",") : Object.keys(NIVEL_DA_FAIXA);
for (const faixa of FAIXAS) {
  const nv = NIVEL_DA_FAIXA[faixa], build = Object.fromEntries(ESTS.map((s) => [s, buildTipica(s, nv)]));
  const padrao = ESTS.map((s) => ({ s, build: build[s], deck: C.DECK_PADRAO[s] }));
  const volta = async (rivais, rotulo) => {
    const out = [];
    for (const s of ESTS) out.push(await buscarDeck(s, build[s], rivais, { n: NB, confirmaN: NC, rodar, politica: "atenta", rotulo: rotulo + s }));
    return out;
  };
  const v1 = await volta(padrao, `${faixa}1:`);
  const v2 = await volta([...padrao, ...v1.map((o, i) => ({ s: ESTS[i], build: build[ESTS[i]], deck: o.deck }))], `${faixa}2:`);
  ESTS.forEach((s, i) => { (decks[s] ||= {})[faixa] = v2[i].deck; console.error(`${faixa} ${s}: ${(v2[i].vitoria).toFixed(1)}% em ${v2[i].passos} passos`); });
}
const atuais = (await import("../api/_jxj-bot2.js")).DECKS_BOT2;
const fixas = (s) => C.FIXAS[s].length;
const bloco = "export const DECKS_BOT2 = {\n" + ESTS.map((s) => `  ${s}: {\n` + Object.keys(NIVEL_DA_FAIXA).map((f) => {
  const d = (decks[s] || {})[f] || atuais[s][f], f0 = d.slice(0, fixas(s)), resto = d.slice(fixas(s)).sort();
  return `    ${f}: ${JSON.stringify([...f0, ...resto])},`;
}).join("\n") + "\n  },").join("\n") + "\n};";
if (process.argv.includes("--escrever")) {
  const arq = path.join(AQUI, "..", "api", "_jxj-bot2.js"), txt = fs.readFileSync(arq, "utf8");
  const re = /\/\* DECKS_BOT2:inicio \*\/\n[\s\S]*?\n\/\* DECKS_BOT2:fim \*\//;
  if (!re.test(txt)) throw new Error("marcas DECKS_BOT2 não achadas");
  fs.writeFileSync(arq, txt.replace(re, () => `/* DECKS_BOT2:inicio */\n${bloco}\n/* DECKS_BOT2:fim */`));
  console.error("api/_jxj-bot2.js atualizado");
} else console.log(bloco);
for (const w of trabalhadores) w.postMessage("fim");
setTimeout(() => process.exit(0), 100);
