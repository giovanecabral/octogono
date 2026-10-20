/**
 * api/_jxj-bot.js: bots do modo Online (2026-10-19). Usado por api/jxj.js.
 * Não lê nada da carreira (index.html, TUNING, os 8 geradores).
 *
 * O bot existe pra quem não acha adversário na fila. Cada luta monta um bot
 * novo, sempre marcado como bot na tela:
 *   - mesmo nível e categoria do jogador, estilo sorteado e uma build válida
 *     sorteada pra esse nível (build sorteada empata com a típica, medido);
 *   - rating do bot = o do jogador, preso na faixa RATING_BOT. A habilidade
 *     do bot (s, de 0 a 1) sai desse rating: o bot de rating R joga como
 *     alguém de rating R. Quem vence muito sobe, encontra bot mais forte e
 *     para de subir; ninguém faz rating infinito contra bot.
 *   - joga escolhendo ANTES de ver a ação do jogador: a escolha sai só do
 *     estado da luta, das trocas já resolvidas e da semente (secreta até o
 *     fim). O servidor chama acaoDoBot sem a ação do jogador.
 *
 * Política (s): uma parte das trocas no acaso (s baixo), uma parte no peso do
 * estilo, e o resto no jogo pensado: mistura de equilíbrio da posição
 * (fictitious play nas matrizes de uma troca), às vezes respondendo ao que o
 * jogador mais fez naquela posição. As matrizes são as da ferramenta de
 * balanço (ferramentas/jxj-balanco.mjs), com os pesos do valor de estado
 * fixos aqui (PESOS_VALOR; a suíte jxjbot confere que batem com o treino).
 * Números medidos no LEIA-ME, seção "Bots do Online".
 */
import { createHash } from "node:crypto";
import * as MOTOR from "./_jxj-motor.js";
import * as ARV from "./_jxj-arvores.js";

export const VERSAO_BOT = 1;
/* faixa do rating do bot (medida: o bot de habilidade 0 vale ~1453 e o de
   habilidade 1 vale ~1559 contra quem joga no peso do estilo, que é 1500) */
export const RATING_BOT = { min: 1455, max: 1560 };
export const RD_BOT = 60, VOL_BOT = 0.06;
/* lutas simuladas por casa da matriz de uma troca (~100 ms por luta nova) */
export const N_MISTURA = 200;
/* nome do bot: "Bot" + uma palavra da natureza (nunca nome nem apelido de
   lutador de verdade) */
export const NOMES_BOT = ["Aroeira", "Angico", "Baraúna", "Cedro", "Imbuia", "Ipê", "Jatobá", "Jequitibá", "Peroba", "Sucupira",
  "Basalto", "Granito", "Quartzo", "Ardósia", "Cascalho", "Seixo", "Garoa", "Mormaço", "Neblina", "Serração",
  "Estiagem", "Pampeiro", "Minuano", "Aracati", "Cerrado", "Caatinga", "Restinga", "Várzea", "Coxilha", "Chapada"];

const F = MOTOR.FAMILIAS;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* ---------- sorteio (separado do sorteio do motor) ---------- */
function mulberry32(s) {
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gerador = (txt) => mulberry32(createHash("sha256").update(String(txt)).digest().readUInt32LE(0));
const amostra = (d, r) => {
  const s = d.reduce((a, b) => a + b, 0);
  let x = r() * s;
  for (let i = 0; i < 4; i++) { x -= d[i]; if (x <= 0) return F[i]; }
  return F[3];
};
function embaralhar(lista, r) {
  const l = [...lista];
  for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; }
  return l;
}

/* ---------- habilidade ---------- */
export const ratingDoBot = (rating) => clamp(Number(rating) || 1500, RATING_BOT.min, RATING_BOT.max);
export const habilidade = (rating) => (ratingDoBot(rating) - RATING_BOT.min) / (RATING_BOT.max - RATING_BOT.min);
/* erro = troca no acaso; estiloP = troca no peso do estilo; o resto é jogo
   pensado (segue = chance de responder ao que o jogador mais fez) */
export function politica(s) {
  s = clamp(Number(s) || 0, 0, 1);
  const base = s <= 0.5 ? { erro: 1 - 2 * s, estiloP: 2 * s } : { erro: 0, estiloP: 2 * (1 - s) };
  return { ...base, segue: 0.3, temp: 1, prior: 2 };
}
/* peso de cada família por papel (golpes, queda, defesa, pressão), o mesmo
   "jogador de estilo" da ferramenta de balanço */
export const PESOS_ESTILO = {
  striker: { pe: [5, 1, 2, 3], cima: [4, 1, 2, 1], baixo: [1, 1, 2, 5] },
  wrestler: { pe: [2, 5, 1, 3], cima: [4, 1, 3, 3], baixo: [1, 2, 2, 4] },
  grappler: { pe: [2, 4, 2, 2], cima: [2, 4, 1, 4], baixo: [1, 5, 2, 2] },
  counter: { pe: [3, 1, 4, 1], cima: [3, 1, 3, 2], baixo: [1, 1, 3, 4] },
};

/* ---------- valor de estado e equilíbrio de uma troca ---------- */
/* chance de A vencer dali, regressão logística treinada pela ferramenta de
   balanço (treinarValor); motor mudou, a suíte jxjbot mostra os pesos novos */
export const PESOS_VALOR = [-0.04203615557392559, 0.49466019220818924, 0.9456903688634037, 0.31886717604694076,
  0.10962301237809013, 0.07815412818302735, 0.2438415374104045, 0.03726139104896311, 0.27814987498963945,
  0.0540641197922806, 0.33230565636860493, 0.1706789830673897, -0.0862902248629841, 0.3151045451266708, 0.10065323175996282];
function feat(e, pA, pB) {
  const rd = e.round - 1, pts = e.pontos[rd] || { a: 0, b: 0 };
  const cards = e.cartoes.reduce((s, c) => s + (c.a - c.b), 0);
  const sinal = e.pos === "cima_a" ? 1 : e.pos === "cima_b" ? -1 : 0;
  const restante = (MOTOR.FORMATO.rounds - e.round) * MOTOR.FORMATO.trocasPorRound + (MOTOR.FORMATO.trocasPorRound - e.troca + 1);
  const fresco = restante / (MOTOR.FORMATO.rounds * MOTOR.FORMATO.trocasPorRound);
  const chao = sinal === 0 ? 0 : sinal > 0 ? (pA.atr.chao - pB.atr.defChao) / 10 : (pB.atr.chao - pA.atr.defChao) / 10;
  const cans = (x) => Math.max(0, 3 - x);
  return [1, (pts.a - pts.b) / 10, cards, sinal, sinal * (e.nivelPos || 0), sinal * chao,
    (e.a.energia - e.b.energia) / 3, (cans(e.b.energia) - cans(e.a.energia)) / 2, (e.b.dano - e.a.dano) / 20,
    (e.b.dano * e.b.dano - e.a.dano * e.a.dano) / 2000, e.momento / 2,
    fresco * (pA.atr.golpe + pA.atr.poder - pB.atr.golpe - pB.atr.poder) / 20,
    fresco * (pA.atr.queda - pB.atr.defQueda + pA.atr.chao - pB.atr.defChao) / 20,
    ((pts.a - pts.b) / 10) * (1 - fresco), sinal * fresco];
}
function valor(e, pA, pB) {
  if (e.fim) return e.fim.vencedor === "a" ? 100 : e.fim.vencedor === "b" ? 0 : 50;
  const z = feat(e, pA, pB).reduce((s, x, k) => s + x * PESOS_VALOR[k], 0);
  return 100 / (1 + Math.exp(-z));
}
function matriz(pA, pB, base, n) {
  const v0 = valor(base, pA, pB);
  return F.map((fa) => F.map((fb) => {
    let s = 0;
    for (let k = 0; k < n; k++) s += valor(MOTOR.resolverTroca(base, { a: pA, b: pB }, { a: fa, b: fb }, "mt" + k).estado, pA, pB) - v0;
    return s / n;
  }));
}
function equilibrio(m, it = 20000) {
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
/* misturas de equilíbrio por posição, com pA no lado a (o mesmo cálculo de
   misturas() na ferramenta de balanço) */
export function misturas(pA, pB, n = N_MISTURA) {
  const r = {};
  for (const pos of ["pe", "cima_a", "cima_b"]) {
    const base = pos === "pe" ? MOTOR.novaLuta(pA, pB) : { ...MOTOR.novaLuta(pA, pB), pos };
    const m = matriz(pA, pB, base, n), eq = equilibrio(m);
    r[pos] = { a: eq.pa, b: eq.pb, m };
  }
  return r;
}

/* ---------- montar o bot ---------- */
/* O próprio estilo aceita até 30 pontos (3 ramos de 10); o que sobra (nível
   30 dá 32) vai pra nós de outro estilo, como um jogador faria. */
function completarHibrido(estilo, nivel, build, r) {
  const outros = embaralhar(Object.keys(ARV.NOS).filter((id) => ARV.NOS[id].estilo !== estilo && ARV.NOS[id].tier <= ARV.TIERS_HIBRIDOS), r);
  for (let mudou = true; mudou;) {
    mudou = false;
    for (const id of outros) {
      if ((build[id] || 0) >= ARV.NIVEL_MAX_NO) continue;
      const tent = { ...build, [id]: (build[id] || 0) + 1 };
      if (ARV.validarBuild(estilo, tent, nivel).ok) { build[id] = tent[id]; mudou = true; break; }
    }
  }
  return build;
}
/* Bot novo pra uma luta: tudo sai da semente (crypto, do servidor).
   limitesRosto = {peça: quantidade} do editor de aparência. */
export function montarBot({ nivel, categoria, rating, semente, limitesRosto = {} }) {
  const r = gerador(`bot:${semente}`);
  const nv = clamp(Math.floor(Number(nivel) || 1), 1, 30);
  const estilo = ARV.ESTILOS_IDS[Math.floor(r() * ARV.ESTILOS_IDS.length)];
  const build = completarHibrido(estilo, nv, ARV.buildTipica(estilo, nv, embaralhar(ARV.PRIORIDADE_TIPICA[estilo], r)), r);
  const nome = `Bot ${NOMES_BOT[Math.floor(r() * NOMES_BOT.length)]}`;
  const rosto = { v: 2 };
  for (const [k, q] of Object.entries(limitesRosto)) rosto[k] = Math.floor(r() * q);
  const perfil = ARV.perfilDeCombate({ estilo, categoria, build });
  return { nome, estilo, nivel: nv, categoria, build, perfil, rosto,
    s: habilidade(rating), rating: ratingDoBot(rating), rd: RD_BOT, vol: VOL_BOT };
}
/* O que a tela vê do bot (vai em nomes.b da luta) */
export const vitrine = (bot) => ({ nome: bot.nome, rosto: bot.rosto, estilo: bot.estilo, nivel: bot.nivel,
  rating: bot.rating, moldura: "padrao", bot: true });
/* O que a luta guarda do bot (coluna bot de jxj_lutas). Fica no servidor:
   a tela nunca recebe build, misturas nem habilidade. As misturas têm o
   bot como A (perfilBot no lado a da conta, como na ferramenta). */
export function dadosDaLuta(bot, perfilHumano) {
  const q = (x) => Math.round(x * 1e4) / 1e4;
  const mx = misturas(bot.perfil, perfilHumano);
  const out = {};
  for (const [pos, x] of Object.entries(mx)) out[pos] = { a: x.a.map(q), b: x.b.map(q), m: x.m.map((l) => l.map(q)) };
  return { v: VERSAO_BOT, s: bot.s, estilo: bot.estilo, nivel: bot.nivel, build: bot.build,
    rating: bot.rating, rd: bot.rd, vol: bot.vol, pol: politica(bot.s), mx: out };
}

/* ---------- jogar ---------- */
/* posição vista pelo bot (nas misturas o bot é A) */
const posDoBot = (pos, lado) => lado === "a" ? pos : pos === "cima_a" ? "cima_b" : pos === "cima_b" ? "cima_a" : "pe";
const histVazio = () => ({ pe: [0, 0, 0, 0], cima_a: [0, 0, 0, 0], cima_b: [0, 0, 0, 0] });
/* O que o adversário do bot fez em cada posição, das trocas já gravadas
   (acao_a, acao_b e o evento "escolha", que diz a variante e o papel de
   cada um). Troca em que ele não mandou ação não conta. */
export function historicoDasTrocas(trocas, ladoBot = "b") {
  const o = ladoBot === "a" ? "b" : "a";
  const hist = histVazio();
  for (const t of trocas || []) {
    const fam = o === "a" ? t.acao_a : t.acao_b;
    if (!F.includes(fam)) continue;
    const esc = (t.eventos || []).find((ev) => ev && ev.tipo === "escolha");
    const v = esc ? MOTOR.VARIANTE_POR_ID[o === "a" ? esc.va : esc.vb] : null;
    if (!v) continue;
    const pos = v.papel === "pe" ? "pe" : v.papel === "cima" ? "cima_b" : "cima_a";
    hist[pos][F.indexOf(fam)]++;
  }
  return hist;
}
/* Uma escolha do bot. d = dadosDaLuta; hist = historicoDasTrocas; r = sorteio */
export function decidir(e, lado, d, hist, r) {
  if (e[lado].energia <= 1.5 && r() < 0.5) return "defesa";
  const x = r();
  if (x < d.pol.erro) return F[Math.floor(r() * 4)];
  if (x < d.pol.erro + d.pol.estiloP) return amostra(PESOS_ESTILO[d.estilo][MOTOR.papel(e, lado)], r);
  const pos = posDoBot(e.pos, lado), m = d.mx[pos];
  if (r() >= d.pol.segue) return amostra(m.a, r);
  const crenca = m.b.map((p, j) => d.pol.prior * p + hist[pos][j]);
  const t = crenca.reduce((a, b) => a + b, 0);
  const ganho = m.m.map((linha) => linha.reduce((s, v, j) => s + v * crenca[j] / t, 0));
  const g0 = Math.max(...ganho);
  return amostra(ganho.map((g) => Math.exp((g - g0) / d.pol.temp)), r);
}
/* Ação do bot na troca aberta. Entra só o que já é público pros dois (estado
   e trocas resolvidas) e a semente; a ação que o jogador mandou nesta troca
   nunca entra. O sorteio é próprio de cada troca: chamar de novo dá a mesma
   ação (duas resoluções ao mesmo tempo gravam a mesma coisa). */
export function acaoDoBot({ estado, semente, trocas, dados, lado = "b" }) {
  const r = gerador(`acao:${semente}:${estado.round}:${estado.troca}`);
  return decidir(estado, lado, dados, historicoDasTrocas(trocas, lado), r);
}
