/**
 * api/_jxj-bot.js: bots do modo Online (2026-10-19). Usado por api/jxj.js.
 * Não lê nada da carreira (index.html, TUNING, os 8 geradores).
 *
 * O bot existe pra quem não acha adversário na fila. Cada luta monta um bot
 * novo, sempre marcado como bot na tela:
 *   - mesmo nível e categoria do jogador, estilo sorteado e uma build válida
 *     sorteada pra esse nível (build sorteada empata com a típica, medido);
 *   - a habilidade do bot (s, de 0 a 1) sai do rating do jogador, preso na
 *     faixa RATING_BOT; o rating com que o bot entra no Glicko é a força
 *     medida dele (FORCA_BOT, por jeito e habilidade), então o bot de
 *     rating R joga como alguém de rating R e ninguém faz rating de graça
 *     contra bot;
 *   - cada bot tem um jeito de lutar (personalidade, 2026-10-20) que dá pra
 *     ler e punir; ver PERSONALIDADES.
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

export const VERSAO_BOT = 2;   // 2: personalidades (2026-10-20)
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
export const PESOS_VALOR = [-0.04428163015542017, 0.4900652135317617, 0.9645936670001448, 0.35293915971269746,
  0.1114446899976331, 0.024160934449267805, 0.22711870558313213, 0.018940343020683974, 0.2848475645595773,
  0.058331072354313035, 0.2742220290886981, 0.23536890936846944, -0.06615259786665531, 0.3322988938054391, 0.12115416651842617];
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
/* Momentos decisivos (motor v3): o estado de cada momento com A no papel de
   "eu" (MOTOR.momentoDoLado), pra matriz de uma troca dele. Grogue com o
   dano de um knockdown; encaixe na meia-guarda. */
export const ESTADO_MOMENTO = {
  grogue_eu: (b) => { b.a.grogue = true; b.a.dano = 20; },
  grogue_ele: (b) => { b.b.grogue = true; b.b.dano = 20; },
  enc_cima_eu: (b) => { b.pos = "cima_a"; b.nivelPos = 1; b.encaixe = { quem: "a", v: null }; },
  enc_cima_ele: (b) => { b.pos = "cima_a"; b.nivelPos = 1; b.encaixe = { quem: "b", v: null }; },
  enc_baixo_eu: (b) => { b.pos = "cima_b"; b.nivelPos = 1; b.encaixe = { quem: "a", v: null }; },
  enc_baixo_ele: (b) => { b.pos = "cima_b"; b.nivelPos = 1; b.encaixe = { quem: "b", v: null }; },
};
/* O que quem não lê faz no momento: defende grogue, vai pro nocaute contra
   o grogue, aperta a finalização que encaixou e defende quando está preso.
   Dá pra ler (é o que a mistura de equilíbrio pune). */
export const OBVIO = { grogue_eu: "defesa", grogue_ele: "golpes", enc_cima_eu: "queda", enc_baixo_eu: "queda", enc_cima_ele: "defesa", enc_baixo_ele: "defesa" };
export function misturasDosMomentos(pA, pB, n = N_MISTURA) {
  const r = {};
  for (const [ch, montar] of Object.entries(ESTADO_MOMENTO)) {
    const base = MOTOR.novaLuta(pA, pB);
    montar(base);
    const m = matriz(pA, pB, base, n), eq = equilibrio(m);
    r[ch] = { a: eq.pa, b: eq.pb };
  }
  return r;
}

/* ---------- personalidades (2026-10-20) ----------
   Pedido do dono: "ler o bot passar a valer a pena". Antes, o bot forte
   jogava a mistura de equilíbrio (de propósito impossível de ler) e o
   fraco sorteava: ler o adversário não adiantava contra bot, e quase toda
   luta é contra bot. Agora cada bot tem um jeito de lutar sorteado, com um
   viés que dá pra descobrir em poucas trocas e punir:
     agressivo (o Provocador): golpeia e pressiona; quando apanha, golpeia
       ainda mais; às vezes ignora o cansaço. Pune: a queda (ganha de
       golpes).
     defensivo (o Paciente): defende e espera; com o adversário cansado
       (energia 3 ou menos), ataca; na frente no round, se fecha mais.
       Pune: a pressão (ganha de defesa), e defender quando você cansa.
     leitor (o Observador): responde à sua última ação com a que ganha
       dela. Pune: a ação que ganha da resposta dele.
     caotico (o Inquieto): parece não ter plano, mas anda numa roda: cada
       bot tem uma ordem própria das 4 famílias e, depois de cada ação,
       vai pra seguinte (nunca repete a anterior). Pune: descobrir a roda e
       responder à próxima. (A primeira versão mudava de humor a cada round
       e nunca repetia; medido, ninguém conseguia ler: saiu.)
   Imperfeição de propósito: em ERRO_PERSONALIDADE das trocas ele sai do
   jeito (a jogada vem da habilidade, como o bot sem personalidade), e nunca
   repete a mesma ação mais de MAX_REPETE vezes seguidas. O jeito aparece em
   toda faixa de rating; o rating muda o resto: a jogada fora do jeito, o
   cansaço e os momentos decisivos. A tela só vê a alcunha, nunca o id nem a
   regra (o id fica nos dados da luta, no servidor). */
/* estilo: o jeito combina com o estilo do bot (o Provocador é striker);
   sem estilo, sorteado. Medido: Provocador de estilo sorteado perdia 64%
   pra quem joga no peso do estilo (wrestler e grappler tentam a queda o
   tempo todo, que é o que pune ele). O Paciente como counter ficou forte
   demais (o jogador de estilo vencia 41% a 45%: a defesa dele anula golpe e
   queda, e só a pressão ganha dela), então o estilo dele é sorteado. */
/* licao: a frase da tela de resultado (só depois do fim da luta: durante,
   a tela vê só a alcunha). Pedido do dono, 2026-10-20: "ensino pós-luta",
   o jeito que o bot jogou e como puni-lo, numa frase. */
export const PERSONALIDADES = {
  agressivo: { alcunha: "o Provocador", estilo: "striker",
    licao: "O Provocador golpeia e pressiona quase sempre, e mais ainda depois de apanhar: a queda pune ele." },
  defensivo: { alcunha: "o Paciente",
    licao: "O Paciente defende a maior parte das trocas e ataca quando você cansa: pressione na grade e guarde energia." },
  leitor: { alcunha: "o Observador",
    licao: "O Observador responde à sua última ação com a que ganha dela: jogue a que ganha dessa resposta." },
  caotico: { alcunha: "o Inquieto",
    licao: "O Inquieto anda numa roda fixa das 4 ações e nunca repete a anterior: descubra a ordem e responda à próxima." },
};
export const PERSONALIDADES_IDS = Object.keys(PERSONALIDADES);
export const ERRO_PERSONALIDADE = 0.2, MAX_REPETE = 3;
/* Primeira luta contra bot da conta (pedido do dono, 2026-10-20): nas
   TROCAS_PURAS primeiras trocas o bot joga o jeito sem o erro de propósito,
   pra quem ainda não conhece as alcunhas ver o jeito limpo. O servidor
   decide e grava em dados.puro; o resto da luta é igual. */
export const TROCAS_PURAS = 3;
/* Força pelo rating dentro do jeito: o bot de habilidade s inclina os pesos
   do jeito pro que rende contra o histórico do jogador (peso x
   e^(INCLINACAO x s x ganho), ganho em pontos de chance de vencer). Ação
   que o jeito nunca faz continua fora. Medido: sem isso a habilidade quase
   não mudava a força (de 52% a 50% pro jogador de estilo, na média dos
   jeitos), e o bot de 1560 jogava como um de 1500. */
/* Ajustes medidos da força dentro do jeito (objeto, como o K do motor: a
   ferramenta de balanço mexe nele em experimento; o servidor nunca muda). */
export const AJUSTE = {
  inclinacao: 0.06,   // INCLINACAO (abaixo)
  habitoLeitor: 0.6,  // HABITO_LEITOR
  puloRoda: 0.3,      // PULO_RODA
  segueRoda: 1,       // Inquieto forte: na jogada fora do jeito, responde ao hábito do jogador (0 a 1, vezes s)
};
export const INCLINACAO = AJUSTE.inclinacao;
/* Observador e Inquieto não têm peso pra inclinar (a regra deles aponta uma
   ação só), então a habilidade entra de outro jeito, medido pra o bot forte
   ficar perto de 46% a 50% contra o jogador de estilo (antes, 53% e 55%):
   - Observador: com peso HABITO_LEITOR x s, responde ao seu hábito (a ação
     que você mais fez na posição) em vez da última;
   - Inquieto: com chance até PULO_RODA x s, pula uma casa da roda quando a
     próxima rende menos que a seguinte contra o seu histórico; e, na
     jogada fora do jeito, responde ao seu hábito (segueRoda). Com pulo de
     0,5 e sem isso, quem lê ganhava só 7 pontos do Inquieto forte. */
export const HABITO_LEITOR = AJUSTE.habitoLeitor, PULO_RODA = AJUSTE.puloRoda;
/* Força medida de cada jeito em rating (1500 = quem joga no peso do estilo),
   na habilidade 0, 0,5 e 1 (`node ferramentas/jxj-balanco.mjs
   personalidades`; de 4.800 a 5.760 lutas por casa, níveis 1, 10 e 30). É o
   rating com que o bot entra no Glicko e aparece na tela: o bot de rating R
   joga como alguém de rating R, e quem vence o bot não ganha rating de
   graça. A faixa RATING_BOT continua escolhendo a habilidade do bot pelo
   rating do jogador. Mexeu no jeito, no motor ou na INCLINACAO: medir de
   novo e copiar aqui (a suíte jxjbot confere com folga de 40 pontos). */
export const FORCA_BOT = {
  agressivo: [1470, 1503, 1507],
  defensivo: [1474, 1495, 1515],
  leitor: [1452, 1476, 1495],
  caotico: [1444, 1487, 1498],
};
export function forcaDoBot(pers, s) {
  const f = FORCA_BOT[pers];
  if (!f) return null;
  const x = clamp(Number(s) || 0, 0, 1);
  return Math.round(x <= 0.5 ? f[0] + ((f[1] - f[0]) * x) / 0.5 : f[1] + ((f[2] - f[1]) * (x - 0.5)) / 0.5);
}
/* pesos (golpes, queda, defesa, pressão) por papel do bot */
export const PESOS_PERSONALIDADE = {
  agressivo: { pe: [45, 12, 10, 33], cima: [50, 15, 10, 25], baixo: [30, 15, 10, 45] },
  agressivoApanhou: { pe: [65, 10, 5, 20], cima: [60, 15, 5, 20], baixo: [40, 15, 5, 40] },
  defensivo: { pe: [12, 12, 60, 16], cima: [10, 10, 62, 18], baixo: [8, 12, 62, 18] },
  defensivoAtaca: { pe: [40, 35, 10, 15], cima: [45, 30, 10, 15], baixo: [20, 45, 10, 25] },
  defensivoFecha: { pe: [10, 10, 65, 15], cima: [10, 10, 65, 15], baixo: [5, 10, 70, 15] },
};
const UNIFORME = [1, 1, 1, 1];
const normalizar = (p) => { const t = p.reduce((a, b) => a + b, 0); return t > 0 ? p.map((x) => x / t) : [0.25, 0.25, 0.25, 0.25]; };
/* mistura de distribuições: [[peso, distribuição], ...] (cada uma normalizada antes) */
const misturar = (partes) => {
  const out = [0, 0, 0, 0];
  for (const [w, d] of partes) { if (!(w > 0)) continue; const n = normalizar(d); for (let i = 0; i < 4; i++) out[i] += w * n[i]; }
  return normalizar(out);
};
/* A jogada da habilidade em forma de distribuição: acaso (erro), peso do
   estilo (estiloP) e, no resto, o jogo pensado (mistura de equilíbrio da
   posição, às vezes respondendo ao que o jogador mais fez). É o mesmo jogo
   do bot sem personalidade; o bot com personalidade usa quando sai do jeito. */
/* ganho esperado de cada ação do bot contra o que o jogador costuma fazer
   na posição (mistura de equilíbrio dele como ponto de partida, mais o
   histórico da luta) */
function ganhoContraHistorico(e, lado, d, hist) {
  const pos = posDoBot(e.pos, lado), m = d.mx[pos];
  const crenca = m.b.map((p, j) => d.pol.prior * p + hist[pos][j]);
  const t = crenca.reduce((a, b) => a + b, 0);
  return m.m.map((linha) => linha.reduce((s, v, j) => s + v * crenca[j] / t, 0));
}
function distribuicaoDaHabilidade(e, lado, d, hist) {
  const pol = d.pol, pos = posDoBot(e.pos, lado), m = d.mx[pos];
  const ganho = ganhoContraHistorico(e, lado, d, hist);
  const g0 = Math.max(...ganho);
  const pensado = misturar([[1 - pol.segue, m.a], [pol.segue, ganho.map((g) => Math.exp((g - g0) / pol.temp))]]);
  return misturar([[pol.erro, UNIFORME], [pol.estiloP, PESOS_ESTILO[d.estilo][MOTOR.papel(e, lado)]],
    [Math.max(0, 1 - pol.erro - pol.estiloP), pensado]]);
}
/* O jeito da personalidade agora, antes do erro e da regra de não repetir */
export function pesosDaPersonalidade(e, lado, d, hist = null) {
  const o = lado === "a" ? "b" : "a", pp = MOTOR.papel(e, lado), po = MOTOR.papel(e, o), P = PESOS_PERSONALIDADE;
  if (d.pers === "agressivo") return (e[lado].atingido ? P.agressivoApanhou : P.agressivo)[pp];
  if (d.pers === "defensivo") {
    if (e[o].energia <= 3) return P.defensivoAtaca[pp];
    const pts = e.pontos[e.round - 1] || { a: 0, b: 0 };
    return (pts[lado] - pts[o] >= 6 ? P.defensivoFecha : P.defensivo)[pp];
  }
  const s = clamp(Number(d.s) || 0, 0, 1);
  if (d.pers === "leitor") {
    /* as ações que ganham da última dele (e, no bot forte, do hábito dele), no papel de cada um agora */
    const ganhamDe = (alvo) => (alvo ? F.map((f) => (MOTOR.quemLeu({ [lado]: pp, [o]: po }, { [lado]: f, [o]: alvo }) === lado ? 1 : 0)) : [0, 0, 0, 0]);
    const ultima = ganhamDe(e[o].ultima);
    const h = hist ? hist[posDoBot(e.pos, lado)] : null, nh = h ? h.reduce((a, b) => a + b, 0) : 0;
    const habito = nh >= 2 ? ganhamDe(F[h.indexOf(Math.max(...h))]) : [0, 0, 0, 0];
    const w = habito.some(Boolean) ? AJUSTE.habitoLeitor * s : 0;
    const p = F.map((_, i) => (1 - w) * (ultima[i] / Math.max(1, ultima.reduce((a, b) => a + b, 0))) + w * (habito[i] / Math.max(1, habito.reduce((a, b) => a + b, 0))));
    return p.some((x) => x > 0) ? p : PESOS_ESTILO[d.estilo][pp];
  }
  if (d.pers === "caotico") {
    const roda = Array.isArray(d.roda) && d.roda.length === 4 ? d.roda : F, ult = e[lado].ultima;
    const i = ult && roda.includes(ult) ? (roda.indexOf(ult) + 1) % 4 : 0;
    const prox = roda[i], depois = roda[(i + 1) % 4];
    let pulo = 0;
    if (hist && s > 0) {
      const g = ganhoContraHistorico(e, lado, d, hist);
      if (g[F.indexOf(depois)] > g[F.indexOf(prox)]) pulo = AJUSTE.puloRoda * s;
    }
    return F.map((f) => (f === prox ? 1 - pulo : f === depois ? pulo : 0));
  }
  return PESOS_ESTILO[d.estilo][pp];
}
/* Distribuição da próxima ação do bot com personalidade (soma 1): cansaço,
   momento decisivo (pela habilidade, como antes), o jeito com o erro de
   propósito e a regra de não repetir. decidir sorteia daqui; a ferramenta
   de balanço usa a mesma conta pro jogador que já sacou o jeito dele.
   recentes = as ações do bot nas trocas anteriores, em ordem. */
export function distribuicaoDoBot(e, lado, d, hist, recentes = []) {
  const ch = MOTOR.momentoDoLado(e, lado);
  let jogo;
  if (ch && d.mm && d.mm[ch]) {
    const ob = [0, 0, 0, 0]; ob[F.indexOf(OBVIO[ch])] = 1;
    jogo = misturar([[d.pol.erro, UNIFORME], [d.pol.estiloP, ob], [Math.max(0, 1 - d.pol.erro - d.pol.estiloP), d.mm[ch].a]]);
  } else {
    const base = normalizar(pesosDaPersonalidade(e, lado, d, hist)), k = AJUSTE.inclinacao * (Number(d.s) || 0);
    let jeito = base;
    if (k > 0) {
      const g = ganhoContraHistorico(e, lado, d, hist), g0 = Math.max(...g);
      jeito = base.map((w, i) => w * Math.exp(k * (g[i] - g0)));
    }
    const dh = d.pers === "caotico" && AJUSTE.segueRoda > 0
      ? { ...d, pol: { ...d.pol, segue: Math.max(d.pol.segue, AJUSTE.segueRoda * (Number(d.s) || 0)) } } : d;
    const nTroca = (e.round - 1) * MOTOR.FORMATO.trocasPorRound + e.troca;
    const erro = Number(d.puro) > 0 && nTroca <= Number(d.puro) ? 0 : ERRO_PERSONALIDADE;
    jogo = misturar([[erro, distribuicaoDaHabilidade(e, lado, dh, hist)], [1 - erro, jeito]]);
  }
  /* cansado: descansa (o Provocador às vezes ignora) */
  const descanso = d.pers === "agressivo" ? 0.25 : 0.5;
  let p = e[lado].energia <= 1.5 ? misturar([[descanso, [0, 0, 1, 0]], [1 - descanso, jogo]]) : jogo;
  const ult = recentes.slice(-MAX_REPETE);
  if (ult.length === MAX_REPETE && ult.every((f) => f === ult[0]) && F.includes(ult[0])) {
    /* a 4ª igual nunca sai; se ela era a única possível (o óbvio de um
       momento, por exemplo), o resto fica com as outras 3 */
    const i = F.indexOf(ult[0]);
    p = p.slice(); p[i] = 0;
    p = p.some((x) => x > 0) ? normalizar(p) : F.map((_, j) => (j === i ? 0 : 1 / 3));
  }
  return p;
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
export function montarBot({ nivel, categoria, rating, semente, limitesRosto = {}, pers: persForcada = null }) {
  const r = gerador(`bot:${semente}`);
  const nv = clamp(Math.floor(Number(nivel) || 1), 1, 30);
  /* o jeito sai primeiro: ele decide o estilo de quem tem estilo próprio.
     persForcada: só ferramenta e teste (o servidor nunca passa) */
  const sorteada = PERSONALIDADES_IDS[Math.floor(r() * PERSONALIDADES_IDS.length)];
  const pers = PERSONALIDADES[persForcada] ? persForcada : sorteada;
  const estiloSorteado = ARV.ESTILOS_IDS[Math.floor(r() * ARV.ESTILOS_IDS.length)];
  const estilo = PERSONALIDADES[pers].estilo || estiloSorteado;
  const build = completarHibrido(estilo, nv, ARV.buildTipica(estilo, nv, embaralhar(ARV.PRIORIDADE_TIPICA[estilo], r)), r);
  const nome = `Bot ${NOMES_BOT[Math.floor(r() * NOMES_BOT.length)]}`;
  const rosto = { v: 2 };
  for (const [k, q] of Object.entries(limitesRosto)) rosto[k] = Math.floor(r() * q);
  const perfil = ARV.perfilDeCombate({ estilo, categoria, build });
  const roda = embaralhar(F, r);
  const s = habilidade(rating);
  return { nome, estilo, nivel: nv, categoria, build, perfil, rosto, pers, roda,
    s, rating: forcaDoBot(pers, s) ?? ratingDoBot(rating), rd: RD_BOT, vol: VOL_BOT };
}
/* O que a tela vê do bot (vai em nomes.b da luta) */
export const vitrine = (bot) => ({ nome: bot.nome, rosto: bot.rosto, estilo: bot.estilo, nivel: bot.nivel,
  rating: bot.rating, moldura: "padrao", bot: true,
  ...(PERSONALIDADES[bot.pers] ? { alcunha: PERSONALIDADES[bot.pers].alcunha } : {}) });
/* O que a luta guarda do bot (coluna bot de jxj_lutas). Fica no servidor:
   a tela nunca recebe build, misturas nem habilidade. As misturas têm o
   bot como A (perfilBot no lado a da conta, como na ferramenta). */
export function dadosDaLuta(bot, perfilHumano, { puro = 0 } = {}) {
  const q = (x) => Math.round(x * 1e4) / 1e4;
  const mx = misturas(bot.perfil, perfilHumano), mm = misturasDosMomentos(bot.perfil, perfilHumano);
  const out = {}, mom = {};
  for (const [pos, x] of Object.entries(mx)) out[pos] = { a: x.a.map(q), b: x.b.map(q), m: x.m.map((l) => l.map(q)) };
  for (const [ch, x] of Object.entries(mm)) mom[ch] = { a: x.a.map(q) };
  return { v: VERSAO_BOT, s: bot.s, estilo: bot.estilo, nivel: bot.nivel, build: bot.build,
    rating: bot.rating, rd: bot.rd, vol: bot.vol, pol: politica(bot.s), mx: out, mm: mom,
    ...(PERSONALIDADES[bot.pers] ? { pers: bot.pers, roda: bot.roda } : {}),
    ...(PERSONALIDADES[bot.pers] && puro > 0 ? { puro: Math.min(TROCAS_PURAS, Math.floor(puro)) } : {}) };
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
/* Uma escolha do bot. d = dadosDaLuta; hist = historicoDasTrocas; r =
   sorteio; recentes = as ações do bot nas trocas anteriores. Bot com
   personalidade sorteia da distribuição dele; luta criada antes das
   personalidades (sem d.pers) segue o jogo de antes, sorteio a sorteio. */
export function decidir(e, lado, d, hist, r, recentes = []) {
  if (d.pers && PERSONALIDADES[d.pers]) return amostra(distribuicaoDoBot(e, lado, d, hist, recentes), r);
  if (e[lado].energia <= 1.5 && r() < 0.5) return "defesa";
  const x = r();
  if (x < d.pol.erro) return F[Math.floor(r() * 4)];
  /* momento decisivo: o bot fraco faz o óbvio, o forte joga a mistura do
     momento (luta criada antes do motor v3 não tem mm: segue a posição) */
  const ch = MOTOR.momentoDoLado(e, lado);
  if (ch && d.mm && d.mm[ch]) return x < d.pol.erro + d.pol.estiloP ? OBVIO[ch] : amostra(d.mm[ch].a, r);
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
export const acoesDoBot = (trocas, lado = "b") => (trocas || []).map((t) => (lado === "a" ? t.acao_a : t.acao_b)).filter((f) => F.includes(f));
export function acaoDoBot({ estado, semente, trocas, dados, lado = "b" }) {
  const r = gerador(`acao:${semente}:${estado.round}:${estado.troca}`);
  return decidir(estado, lado, dados, historicoDasTrocas(trocas, lado), r, acoesDoBot(trocas, lado));
}
