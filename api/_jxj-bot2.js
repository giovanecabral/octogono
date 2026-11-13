/**
 * api/_jxj-bot2.js: o bot do combate v2 do Online (Fase 5, 2026-11-13).
 * Usado por api/jxj.js quando a luta contra bot nasce no combate novo (a
 * flag combate_v2 vale pra conta do jogador). A luta contra bot da v1
 * continua com api/_jxj-bot.js. Não lê nada da carreira.
 *
 * O bot é o mesmo de antes no que a tela vê (nome, rosto, alcunha, nível,
 * estilo e build sorteados por montarBot) e nas personalidades: o
 * Provocador golpeia e pressiona, o Paciente defende, o Observador responde
 * à última carta do jogador, o Inquieto anda numa roda das 4 categorias.
 * Muda o que ele joga: cartas do deck padrão do estilo, escolhidas
 *   - CEGO: entra o estado com a mão do jogador escondida (só quantas cartas
 *     ele tem; o deck dele e o que ele já jogou são públicos), as trocas já
 *     resolvidas e a semente. A carta que o jogador mandou nesta troca
 *     nunca entra (o servidor chama sem ela);
 *   - pela habilidade s (de 0 a 1, pelo rating do jogador, como antes): no
 *     erro, carta ao acaso; no resto, a leitura de equilíbrio da troca
 *     (api/_jxj-leitura2.js, a mesma do jogador "atenta" da simulação);
 *   - com o jeito da personalidade por cima (fora do jeito em
 *     ERRO_PERSONALIDADE das trocas, como antes), inclinado pro que rende
 *     contra a resposta do jogador quanto maior s.
 * A postura sai da semente (a categoria da carta pretendida ou, às vezes,
 * uma isca), como sinalDoBot. A força medida de cada jeito (FORCA_BOT2) é o
 * rating com que o bot entra no Glicko.
 */
import { createHash } from "node:crypto";
import * as C2 from "./_jxj-combate2.js";
import { CARTAS, CATEGORIAS_CARTA } from "./_jxj-cartas.js";
import * as V2 from "./_jxj-luta2.js";
import * as BOT from "./_jxj-bot.js";
import { tabela, mistura, respostaDele, ganhos, colunaContra } from "./_jxj-leitura2.js";

export const VERSAO_BOT2 = 3;   // 3: combate v2 (cartas)
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const outro = (l) => (l === "a" ? "b" : "a");
const cat = (id) => CARTAS[id].categoria;

/* ---------- sorteio (separado do sorteio do motor e do bot de antes) ---------- */
function mulberry32(s) {
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gerador = (txt) => mulberry32(createHash("sha256").update(String(txt)).digest().readUInt32LE(0));
const amostra = (p, r) => { let u = r() * p.reduce((a, b) => a + b, 0); for (let i = 0; i < p.length; i++) { u -= p[i]; if (u <= 0) return i; } return p.length - 1; };
const normalizar = (p) => { const t = p.reduce((a, b) => a + b, 0); return t > 0 ? p.map((x) => x / t) : p.map(() => 1 / p.length); };
const misturar = (partes) => {
  const n = partes[0][1].length, out = new Array(n).fill(0);
  for (const [w, d] of partes) { if (!(w > 0)) continue; const x = normalizar(d); for (let i = 0; i < n; i++) out[i] += w * x[i]; }
  return normalizar(out);
};

/* ---------- força ---------- */
/* erro (carta ao acaso) pela habilidade; o resto é a leitura de equilíbrio */
export const AJUSTE2 = {
  erroS0: 0.6,        // erro do bot de habilidade 0 (cai em linha até 0 na habilidade 1)
  inclinacao: 0.08,   // o jeito inclina pro que rende: peso x e^(inclinacao x s x ganho), ganho no valor da leitura
  habitoLeitor: 0.6,  // Observador forte: responde ao hábito do jogador em vez da última carta (vezes s)
  puloRoda: 0.3,      // Inquieto forte: pula uma casa da roda quando a seguinte rende mais (vezes s)
};
export const politica2 = (s) => ({ erro: AJUSTE2.erroS0 * (1 - clamp(Number(s) || 0, 0, 1)) });

/* Força medida de cada jeito em rating, na habilidade 0, 0,5 e 1, contra o
   jogador "atenta" da simulação (1500), pelo caminho do servidor (posturas,
   o jogador com 30% de isca, o bot cego): `SIM_PARTES=bots
   SIM_SAIDA=relatorio-bots.md node sim/simular.mjs 10000` (2026-11-13; 2.400
   lutas por casa no Provocador, 9.600 nos outros; níveis 1, 10 e 30). O bot
   de rating R joga como alguém de rating R; quem vence o bot não ganha
   rating de graça. Mexeu no jeito, na leitura, no motor ou no AJUSTE2:
   medir de novo e copiar aqui. O Provocador quase não cresce da metade pra
   cima (a inclinação pouco mexe em quem golpeia quase sempre). */
export const FORCA_BOT2 = {
  agressivo: [1373, 1421, 1417],
  defensivo: [1322, 1422, 1458],
  leitor: [1372, 1458, 1502],
  caotico: [1329, 1399, 1421],
};
export function forcaDoBot2(pers, s) {
  const f = FORCA_BOT2[pers];
  if (!f) return null;
  const x = clamp(Number(s) || 0, 0, 1);
  return Math.round(x <= 0.5 ? f[0] + ((f[1] - f[0]) * x) / 0.5 : f[1] + ((f[2] - f[1]) * (x - 0.5)) / 0.5);
}

/* lição do fim (como a do bot de antes, com as cartas do combate novo) */
export const LICAO2 = {
  agressivo: "O Provocador golpeia e pressiona quase sempre, e mais ainda depois de apanhar: o Bloqueio e o Contra-ataque punem ele.",
  defensivo: "O Paciente defende a maior parte das trocas e ataca quando você cansa: o clinch passa pela defesa dele e tira energia.",
  leitor: "O Observador joga a carta que ganha da sua última: jogue a que ganha dessa resposta.",
  caotico: "O Inquieto anda numa roda fixa das 4 categorias de carta e nunca repete a anterior: descubra a ordem e responda à próxima.",
};

/* ---------- montar ---------- */
/* o bot de antes (mesma semente, mesmo bot na tela), com o perfil da luta v2
   (deck padrão do estilo, a árvore pelo efeito v2) e a força do combate novo */
export function montarBot2(arg) {
  const b = BOT.montarBot(arg);
  return { ...b, perfil: V2.perfilLuta2({ estilo: b.estilo, categoria: b.categoria, build: b.build }), rating: forcaDoBot2(b.pers, b.s) ?? b.rating };
}
/* o que a luta guarda do bot (coluna bot de jxj_lutas); a tela nunca recebe */
export const dadosDaLuta2 = (bot, { puro = 0 } = {}) => ({
  v: VERSAO_BOT2, s: bot.s, estilo: bot.estilo, nivel: bot.nivel, build: bot.build,
  rating: bot.rating, rd: bot.rd, vol: bot.vol, pers: bot.pers, roda: bot.roda,
  ...(puro > 0 ? { puro: Math.min(BOT.TROCAS_PURAS, Math.floor(puro)) } : {}),
});

/* ---------- jogar ---------- */
/* o estado que o bot enxerga: a mão do jogador vira só a quantidade */
export const vistaDoBot = (e, lado) => { const o = outro(lado); return { ...e, mao: { ...e.mao, [o]: e.mao[o].map(() => null) } }; };
/* o que as trocas resolvidas dizem: as cartas de cada um (id da mão) e o dano da última */
function historico(trocas, lado) {
  const o = outro(lado), dele = [], meus = [];
  let ultimaRes = null;
  for (const t of trocas || []) {
    const cd = o === "a" ? t.acao_a : t.acao_b, cm = lado === "a" ? t.acao_a : t.acao_b;
    if (cd && CARTAS[cd]) dele.push(cd);
    if (cm && CARTAS[cm]) meus.push(cm);
    ultimaRes = (t.eventos || []).find((ev) => ev && ev.tipo === "resolucao") || ultimaRes;
  }
  return { dele, meus, apanhou: !!(ultimaRes && ultimaRes.dano && ultimaRes.dano[o] > 0) };
}
/* peso de cada carta da mão pela categoria (o peso da categoria dividido entre as cartas dela) */
const porCategoria = (minhas, pesosCat) => {
  const n = {};
  for (const id of minhas) n[cat(id)] = (n[cat(id)] || 0) + 1;
  return minhas.map((id) => pesosCat[CATEGORIAS_CARTA.indexOf(cat(id))] / n[cat(id)]);
};
/* as cartas que mais rendem contra uma carta dele (as empatadas dividem) */
const melhoresContra = (col) => { const m = Math.max(...col); return col.map((v) => (v >= m - 1e-9 ? 1 : 0)); };

/* o jeito agora, antes do erro de propósito e da regra de não repetir */
function jeito(e, lado, dados, perfis, semente, t, g, h) {
  const o = outro(lado), pp = C2.papel2(e, lado), P = BOT.PESOS_PERSONALIDADE, s = clamp(Number(dados.s) || 0, 0, 1);
  const estilo = () => porCategoria(t.minhas, BOT.PESOS_ESTILO[dados.estilo][pp]);
  if (dados.pers === "agressivo") return porCategoria(t.minhas, (h.apanhou ? P.agressivoApanhou : P.agressivo)[pp]);
  if (dados.pers === "defensivo") {
    if (e[o].energia <= 3) return porCategoria(t.minhas, P.defensivoAtaca[pp]);
    const pts = e.pontos[e.round - 1] || { a: 0, b: 0 };
    return porCategoria(t.minhas, (pts[lado] - pts[o] >= 6 ? P.defensivoFecha : P.defensivo)[pp]);
  }
  if (dados.pers === "leitor") {
    const ultima = h.dele[h.dele.length - 1];
    if (!ultima) return estilo();
    const contra = melhoresContra(colunaContra(e, lado, perfis, semente, t.minhas, ultima));
    /* o forte responde ao hábito (a carta que ele mais jogou, 2 vezes ou mais) */
    const conta = {};
    for (const id of h.dele) conta[id] = (conta[id] || 0) + 1;
    const [habito, nh] = Object.entries(conta).sort((a, b) => b[1] - a[1])[0];
    if (nh < 2 || habito === ultima) return contra;
    const w = AJUSTE2.habitoLeitor * s, cH = melhoresContra(colunaContra(e, lado, perfis, semente, t.minhas, habito));
    return misturar([[1 - w, contra], [w, cH]]);
  }
  if (dados.pers === "caotico") {
    const roda = Array.isArray(dados.roda) && dados.roda.length === 4 ? dados.roda : CATEGORIAS_CARTA;
    const tem = new Set(t.minhas.map(cat)), ult = h.meus.length ? cat(h.meus[h.meus.length - 1]) : null;
    /* a próxima da roda que ele tem na mão (e a seguinte, pro pulo) */
    const ini = ult && roda.includes(ult) ? (roda.indexOf(ult) + 1) % 4 : 0, seq = [];
    for (let k = 0; k < 4 && seq.length < 2; k++) { const c = roda[(ini + k) % 4]; if (tem.has(c) && c !== ult) seq.push(c); }
    if (!seq.length) return estilo();
    const melhor = (c) => Math.max(...t.minhas.map((id, i) => (cat(id) === c ? g[i] : -Infinity)));
    const pulo = seq[1] && melhor(seq[1]) > melhor(seq[0]) ? AJUSTE2.puloRoda * s : 0;
    return t.minhas.map((id) => (cat(id) === seq[0] ? 1 - pulo : cat(id) === seq[1] ? pulo : 0));
  }
  return estilo();
}

/* a distribuição da carta do bot (sobre t.minhas) */
function distribuicao(e, lado, dados, perfis, semente, trocas) {
  const t = tabela(e, lado, perfis, semente), n = t.minhas.length;
  const x = mistura(t), g = ganhos(t, respostaDele(t, x)), g0 = Math.max(...g);
  const s = clamp(Number(dados.s) || 0, 0, 1), pol = politica2(s), h = historico(trocas, lado);
  const habilidade = misturar([[pol.erro, new Array(n).fill(1)], [1 - pol.erro, x]]);
  let jogo;
  if (e.encaixe || e.a.grogue || e.b.grogue || !BOT.PERSONALIDADES[dados.pers]) jogo = habilidade;   // momento decisivo: a leitura
  else {
    const base = normalizar(jeito(e, lado, dados, perfis, semente, t, g, h));
    const k = AJUSTE2.inclinacao * s, inclinado = k > 0 ? base.map((w, i) => w * Math.exp(k * (g[i] - g0))) : base;
    const nTroca = (e.round - 1) * e.tpr + e.troca;
    const erro = Number(dados.puro) > 0 && nTroca <= Number(dados.puro) ? 0 : BOT.ERRO_PERSONALIDADE;
    jogo = misturar([[erro, habilidade], [1 - erro, inclinado.some((w) => w > 0) ? inclinado : habilidade]]);
  }
  /* cansado: descansa na defesa (o Provocador às vezes ignora) */
  let p = jogo;
  if (e[lado].energia <= C2.K2.cansado && t.minhas.some((id) => cat(id) === "defesa")) {
    const d = dados.pers === "agressivo" ? 0.25 : 0.5;
    p = misturar([[d, t.minhas.map((id) => (cat(id) === "defesa" ? 1 : 0))], [1 - d, jogo]]);
  }
  /* nunca a mesma categoria uma 4ª vez seguida, se a mão tiver outra */
  const ult = h.meus.slice(-BOT.MAX_REPETE).map(cat);
  if (ult.length === BOT.MAX_REPETE && ult.every((c) => c === ult[0]) && t.minhas.some((id) => cat(id) !== ult[0])) {
    p = p.map((w, i) => (cat(t.minhas[i]) === ult[0] ? 0 : w));
    p = p.some((w) => w > 0) ? normalizar(p) : t.minhas.map((id) => (cat(id) === ult[0] ? 0 : 1));
  }
  return { t, p: normalizar(p), g };
}
/* uma escolha (o sorteio r é de quem chama) */
export function decidir2(e, lado, dados, perfis, semente, trocas, r) {
  const v = vistaDoBot(e, lado), { t, p } = distribuicao(v, lado, dados, perfis, semente, trocas);
  return t.minhas[amostra(p, r)];
}

/* o plano da postura: a pretendida e a postura (a categoria dela ou, com a
   chance de isca do jeito vezes a habilidade, outra categoria da mão).
   Sem energia pra fintar, nunca isca. Só estado, trocas e semente. */
function planoDoSinal2({ estado, semente, trocas, dados, perfis, lado = "b" }) {
  const r = gerador(`sinal2:${semente}:${estado.round}:${estado.troca}`);
  const pretendida = decidir2(estado, lado, dados, perfis, semente, trocas, r);
  const sp = (BOT.PERSONALIDADES[dados.pers] || {}).sinal || { isca: 0.15 }, s = clamp(Number(dados.s) || 0, 0, 1);
  const custo = V2.custoFinta(estado, lado, perfis[lado]);
  const barata = C2.K2.custoFinta / Math.max(0.01, custo);
  const outras = [...new Set(estado.mao[lado].map(cat))].filter((c) => c !== cat(pretendida));
  if (!outras.length || estado[lado].energia < custo || r() >= Math.min(1, sp.isca * s * barata)) return { pretendida, sinal: cat(pretendida) };
  return { pretendida, sinal: outras[Math.floor(r() * outras.length)] };
}
export const sinalDoBot2 = (arg) => planoDoSinal2(arg).sinal;

/* A carta do bot na troca aberta. Sem sinais: a escolha. Com os dois sinais
   revelados: a pretendida ou, com a chance do jeito (vezes a habilidade), a
   resposta ao sinal do jogador como verdade (contra as cartas dele dessa
   categoria) ou como isca (contra as outras). Sem energia pra fintar, a
   carta da própria postura. A carta do jogador nesta troca nunca entra. */
export function cartaDoBot2({ estado, semente, trocas, dados, perfis, lado = "b", sinais = null }) {
  const r = gerador(`acao2:${semente}:${estado.round}:${estado.troca}`);
  if (!sinais) return decidir2(estado, lado, dados, perfis, semente, trocas, r);
  const o = outro(lado), plano = planoDoSinal2({ estado, semente, trocas, dados, perfis, lado });
  const sp = (BOT.PERSONALIDADES[dados.pers] || {}).sinal || { confia: 0.3, desconfia: 0.1 }, s = clamp(Number(dados.s) || 0, 0, 1);
  let carta = plano.pretendida;
  const x = r();
  const responder = (verdade) => {
    const t = tabela(vistaDoBot(estado, lado), lado, perfis, semente);
    const cols = t.dele.map((id, j) => ((cat(id) === sinais[o]) === verdade ? j : -1)).filter((j) => j >= 0);
    if (!cols.length) return null;
    const tot = cols.reduce((a, j) => a + t.p[t.dele[j]], 0) || 1;
    const g = t.M.map((linha) => cols.reduce((a, j) => a + linha[j] * t.p[t.dele[j]] / tot, 0));
    return t.minhas[g.indexOf(Math.max(...g))];
  };
  if (sinais[o] && x < sp.confia * s) carta = responder(true) || carta;
  else if (sinais[o] && x < (sp.confia + sp.desconfia) * s) carta = responder(false) || carta;
  const minha = sinais[lado] || plano.sinal;
  if (cat(carta) !== minha && estado[lado].energia < V2.custoFinta(estado, lado, perfis[lado])) {
    carta = cat(plano.pretendida) === minha ? plano.pretendida : estado.mao[lado].find((id) => cat(id) === minha) || carta;
  }
  return carta;
}
