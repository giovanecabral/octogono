/* JxJ: motor de combate (spec docs/superpowers/specs/2026-10-01-jxj-design.md,
   seção 6). Independente do motor da carreira: nada aqui lê o index.html,
   o TUNING ou os 8 geradores.

   Puro e determinístico: o mesmo estado, as mesmas duas ações e a mesma
   semente dão o mesmo resultado, sempre. O sorteio de cada troca sai de
   sha256(semente:round:troca), então qualquer luta pode ser refeita do
   zero com a semente revelada no fim e as ações gravadas no banco.

   Quem chama: api/jxj.js (o servidor decide) e testar.js (simulação em
   massa). O navegador nunca roda isto pra decidir nada. */
import { createHash } from "node:crypto";

export const VERSAO_MOTOR = 2;   // 2: variantes de ação por round (2026-10-04)
/* Formato inicial (ajustado pela suíte jxjmotor; valores finais no LEIA-ME) */
export const FORMATO = { rounds: 3, trocasPorRound: 4, prazoMs: 20000, toleranciaMs: 3000 };
export const FAMILIAS = ["golpes", "queda", "defesa", "pressao"];
export const AUSENCIAS_WO = 3;

/* Constantes do combate. Mexeu aqui: rode `node testar.js jxjmotor` (as
   faixas do balanço estão no teste) e suba VERSAO_BALANCEAMENTO em
   api/_jxj-arvores.js. */
export const K = {
  esc: 12,                    // escala da disputa logística (diferença de 12 pontos = 73%)
  momentoPts: 2,              // pontos de disputa por ponto de momento
  momentoMax: 4,
  cansacoLimite: 2,           // energia <= isto pesa
  cansacoPts: 6,              // pontos a menos por unidade abaixo do limite (+1)
  danoDefesa: 0.12,           // defesa perde 0.12 ponto por ponto de dano acumulado
  escapeMult: 1.27,           // multiplica toda chance de levantar ou sair por baixo
  quedaFator: 1.17,           // multiplica toda chance de queda em pé
  vantagem: 15,               // pontos de disputa pra quem escolheu a ação que ganha do par em pé (ciclo)
  contraBase: 0.28,           // chance base de contra-atacar quem troca golpes contra a defesa
  /* Golpes contra Defesa: o golpe bate na guarda. Sem pontosGuarda, no
     espelho striker "só golpes" vencia "só defesa" em 73% e a mistura
     racional virava 100% golpes (achado da suíte jxjmotor, 2026-10-01). */
  golpeNaGuarda: 13.5,        // pontos a menos pra acertar
  danoNaGuarda: 0.6,          // fração do dano
  koNaGuarda: 0.5,            // fração do risco de nocaute (sobre o dano já reduzido)
  pontosGuarda: 2,            // pontos pra quem defendeu quando o golpe não entra
  danoGolpe: 7.3, danoGnp: 6.5, danoSujo: 4, danoContra: 8, danoPunicao: 6.5,
  koPiso: 0.3, koExpoente: 1.6,  // nocaute: (dano acumulado/100 + piso)^expoente
  koBase: 1, tkoBase: 0.31, kdFator: 2.0,
  subBase: 0.78,              // finalização: subBase x disputa²
  vantagemChao: 26.6,         // pontos de disputa pra quem escolheu a ação que ganha do par no chão
  guardaContraSub: 0.47,      // finalização contra guarda fechada: fração da vantagem do chão que a guarda tira
  controleParado: 0.5,        // os dois parados no chão: fração do ponto de controle de quem está por cima
  recuperacaoRound: 4,
  bonusQueda: 4, bonusControle: 2.4, bonusGrade: 2, bonusTentativaSub: 1.5, bonusKD: 6, bonusMomento: 0.5, bonusAusencia: 5,
  limiteEmpateRound: 0.01, limite108: 22,
};

export const ROTULOS = {
  pe: { golpes: "Trocar golpes", queda: "Tentar a queda", defesa: "Defender", pressao: "Pressionar na grade" },
  cima: { golpes: "Ground and pound", queda: "Buscar a finalização", defesa: "Segurar a posição", pressao: "Avançar a posição" },
  baixo: { golpes: "Golpes por baixo", queda: "Raspar ou finalizar por baixo", defesa: "Fechar a guarda", pressao: "Levantar" },
};
/* O que cada ação faz, pra tela (condição, risco, consequência). Texto
   concreto, sem frase de efeito. */
export const DESCRICOES = {
  pe: {
    golpes: "Dano e chance de nocaute. Ganha de quem pressiona. Contra quem defende, bate na guarda, pode levar contra-ataque e o golpe que não entra conta ponto pra ele. Perde pra queda.",
    queda: "Leva a luta pro chão por cima. Ganha de quem troca golpes. Contra quem defende, costuma ser defendida e cansa. Contra a pressão, é briga parelha no clinche.",
    defesa: "Recupera energia, segura a queda e faz o golpe dele bater na guarda. Perde pra quem pressiona na grade.",
    pressao: "Encurrala na grade, ganha momento e cansa quem defende. Come golpes na entrada. Contra a queda, é briga parelha no clinche.",
  },
  cima: {
    golpes: "Dano por cima, com chance de nocaute técnico. Abre espaço pra ele raspar ou levantar.",
    queda: "Tentativa de finalização. Cansa e, se falhar, pode dar espaço pra ele sair.",
    defesa: "Segura por cima e marca controle, sem gastar energia. Pouco dano. Dois parados seguidos e o juiz levanta a luta.",
    pressao: "Passa a guarda e melhora a posição: o próximo ground and pound e a próxima finalização ficam mais fortes.",
  },
  baixo: {
    golpes: "Pouco dano por baixo. Atrapalha o ground and pound.",
    queda: "Tenta raspar (inverter a posição) ou finalizar por baixo. Cansa.",
    defesa: "Fecha a guarda: segura a finalização e recebe menos dano, sem gastar energia.",
    pressao: "Tenta levantar. Se falhar, fica exposto ao ground and pound e à finalização.",
  },
};
export const CUSTO = {
  pe: { golpes: 2, queda: 3, defesa: -2, pressao: 2 },
  cima: { golpes: 2, queda: 3, defesa: 0, pressao: 2 },
  baixo: { golpes: 1, queda: 3, defesa: 0, pressao: 2 },
};
/* Nome curto de cada família em cada papel (o grupo da ação na tela). */
export const FAMILIA_NOME = {
  pe: { golpes: "Golpes", queda: "Queda", defesa: "Defesa", pressao: "Pressão" },
  cima: { golpes: "Ground and pound", queda: "Finalização", defesa: "Segurar", pressao: "Avançar" },
  baixo: { golpes: "Golpes por baixo", queda: "Raspar", defesa: "Guarda", pressao: "Levantar" },
};
/* O ciclo, curto, pro botão (conferido contra trocaEmPe e trocaNoChao). */
export const CICLO = {
  pe: {
    golpes: "Ganha de Pressão. Perde pra Queda.",
    queda: "Ganha de Golpes. Perde pra Defesa.",
    defesa: "Ganha de Queda. Perde pra Pressão.",
    pressao: "Ganha de Defesa. Perde pra Golpes.",
  },
  cima: {
    golpes: "Ganha de Levantar. Perde pra Raspar.",
    queda: "Ganha de Levantar e Golpes por baixo. Perde pra Guarda.",
    defesa: "Ganha de Raspar. Perde pra Levantar.",
    pressao: "Ganha de Guarda e Golpes por baixo. Perde pra Raspar e Levantar.",
  },
  baixo: {
    golpes: "Rende contra Segurar. Perde pra Finalização e Avançar.",
    queda: "Ganha de Ground and pound e Avançar. Perde pra Segurar.",
    defesa: "Ganha de Finalização. Perde pra Avançar.",
    pressao: "Ganha de Segurar e Avançar. Perde pra Ground and pound e Finalização.",
  },
};

/* ---------- variantes (2026-10-04) ----------
   Pedido do dono: mais ações, que vão trocando a cada round. Cada família
   continua no mesmo lugar do ciclo; a variante muda risco e retorno
   dentro dela. A cada round, cada lado recebe UMA variante de cada família
   (maoDoRound): a tela mostra sempre 4 ações, com nomes e efeitos que mudam
   de round pra round. Com 3 variantes e 3 rounds, cada uma aparece uma vez
   por luta; com 2, elas alternam. A ordem sai da semente (sha256), então a
   luta continua refazível do zero com a semente revelada no fim. Valor de
   cada variante medido na suíte jxjmotor (nenhuma domina a família).

   Ajustes (mod), todos opcionais:
     acerto    pontos na disputa da ação (golpe, queda, pressão, ground and
               pound, passagem, raspagem, levantada, finalização)
     dano, ko  multiplicam o dano e o risco de nocaute do que a ação acerta
     custo     energia a mais (ou a menos) que a ação gasta
     exposto   pontos que a queda DELE ganha contra este golpe
     guarda    (defesa) pontos a menos pro golpe dele
     sprawl    (defesa em pé) pontos a menos pra queda dele
     contra    (defesa em pé) chance a mais de contra-atacar
     cede      (guarda por baixo) pontos a mais pra passagem dele
     trava     chance de travar a perna dele quando o golpe entra
     cansa     energia que ele perde quando a ação dá certo
     nivel     degraus de posição a mais (queda que já cai na meia-guarda,
               passagem que pula pra montada)
     pontos    multiplica os pontos que a ação marca quando dá certo
     vsGolpes, vsPressao  (queda) pontos contra essa família
     porNivel  (finalização por cima) pontos na guarda, meia-guarda, montada
     sub, subMult  (raspar por baixo) chance de emendar uma finalização
               quando a raspagem falha, e a força dela */
export const VARIANTES = {
  pe: {
    golpes: [
      { id: "jab", rotulo: "Jab e direto", frase: "o jab e direto", desc: "Acerta mais e mantém a distância, então a queda dele entra menos. Dano e nocaute menores.", mod: { acerto: 5, dano: 0.85, ko: 0.7, exposto: -2 } },
      { id: "cruzado", rotulo: "Cruzado", frase: "o cruzado", desc: "Mais dano e mais chance de nocaute. Acerta menos.", mod: { acerto: -6, dano: 1.2, ko: 1.5 } },
      { id: "chute_perna", rotulo: "Chute na perna", frase: "o chute na perna", desc: "Cansa e pode travar a perna dele (a pressão e a queda dele pioram). Nocauteia menos, e a queda dele entra mais.", mod: { acerto: 3, dano: 0.95, ko: 0.8, trava: 0.5, cansa: 0.6, exposto: 3 } },
    ],
    queda: [
      { id: "double_leg", rotulo: "Double leg", frase: "o double leg", desc: "A queda pelas duas pernas. Entra um pouco mais que as outras.", mod: { acerto: 2 } },
      { id: "single_leg", rotulo: "Single leg", frase: "o single leg", desc: "Gasta menos energia. Marca menos ponto quando entra.", mod: { custo: -1, pontos: 0.5 } },
      { id: "quadril", rotulo: "Queda de quadril", frase: "a queda de quadril", desc: "Entra menos, mas é boa contra quem pressiona e ruim contra quem golpeia. Quando entra, você já cai na meia-guarda.", mod: { acerto: -2, vsPressao: 9, vsGolpes: -7, nivel: 1 } },
    ],
    defesa: [
      { id: "guarda_alta", rotulo: "Guarda alta", frase: "a guarda alta", desc: "O golpe dele bate mais na guarda. A queda dele entra mais fácil.", mod: { guarda: 4, sprawl: -3 } },
      { id: "sprawl", rotulo: "Sprawl", frase: "o sprawl", desc: "Base baixa, segura melhor a queda. O golpe dele passa mais pela guarda.", mod: { sprawl: 6, guarda: -4 } },
      { id: "esquiva", rotulo: "Esquiva e contra-ataque", frase: "a esquiva", desc: "Mais chance de contra-atacar quem golpeia. Recupera menos energia.", mod: { contra: 0.15, guarda: -1, custo: 1 } },
    ],
    pressao: [
      { id: "grade", rotulo: "Pressionar na grade", frase: "a pressão na grade", desc: "Encurrala na grade e marca ponto, a pressão padrão.", mod: {} },
      { id: "joelhadas", rotulo: "Clinche e joelhadas", frase: "as joelhadas no clinche", desc: "Os golpes curtos machucam mais. Entra pior contra quem golpeia e gasta mais energia.", mod: { dano: 1.6, acerto: -4, custo: 0.5 } },
      { id: "cortar", rotulo: "Cortar o octógono", frase: "o corte do octógono", desc: "Fecha a saída e cansa mais quem defende. Golpes curtos mais fracos.", mod: { cansa: 1, dano: 0.5 } },
    ],
  },
  cima: {
    golpes: [
      { id: "gnp", rotulo: "Socos por cima", frase: "os socos por cima", desc: "O ground and pound padrão.", mod: {} },
      { id: "cotoveladas", rotulo: "Cotoveladas", frase: "as cotoveladas", desc: "Mais dano e mais chance de nocaute técnico. Acerta menos.", mod: { acerto: -5, dano: 1.3, ko: 1.4 } },
      { id: "marteladas", rotulo: "Marteladas", frase: "as marteladas", desc: "Acerta mais, com menos dano.", mod: { acerto: 5, dano: 0.8, ko: 0.7 } },
    ],
    queda: [
      { id: "kimura", rotulo: "Kimura", frase: "a kimura", desc: "Finalização que vale igual em qualquer posição.", mod: {} },
      { id: "mata_leao", rotulo: "Mata-leão", frase: "o mata-leão", desc: "Forte com você montado, fraca na guarda dele. Melhore a posição antes.", mod: { porNivel: [-8, 0, 8] } },
      { id: "triangulo_braco", rotulo: "Triângulo de braço", frase: "o triângulo de braço", desc: "Melhor na meia-guarda. Na guarda dele, entra pouco.", mod: { porNivel: [-4, 6, 2] } },
    ],
    defesa: [
      { id: "segurar", rotulo: "Segurar a posição", frase: "o controle por cima", desc: "Segura por cima e marca controle, sem gastar energia.", mod: {} },
      { id: "peso", rotulo: "Pressão de peso", frase: "o peso por cima", desc: "Cansa quem está por baixo. Marca menos ponto de controle.", mod: { cansa: 0.8, pontos: 0.5 } },
    ],
    pressao: [
      { id: "passar", rotulo: "Passar a guarda", frase: "a passagem de guarda", desc: "Melhora a posição um degrau.", mod: {} },
      { id: "montada", rotulo: "Ir pra montada", frase: "a montada", desc: "Quando entra, pula direto pra montada. Entra menos.", mod: { acerto: -8, nivel: 1 } },
    ],
  },
  baixo: {
    golpes: [
      { id: "golpes_baixo", rotulo: "Golpes por baixo", frase: "os golpes por baixo", desc: "Pouco dano. Atrapalha quem está por cima.", mod: {} },
      { id: "cotoveladas_baixo", rotulo: "Cotoveladas por baixo", frase: "as cotoveladas por baixo", desc: "Mais dano, acerta menos.", mod: { acerto: -4, dano: 1.6 } },
    ],
    queda: [
      { id: "raspagem", rotulo: "Raspagem", frase: "a raspagem", desc: "Inverte a posição com mais facilidade.", mod: { acerto: 4 } },
      { id: "triangulo", rotulo: "Triângulo", frase: "o triângulo", desc: "Raspa menos, mas pode emendar uma finalização por baixo.", mod: { acerto: -6, sub: 0.35, subMult: 0.9 } },
    ],
    defesa: [
      { id: "guarda_fechada", rotulo: "Fechar a guarda", frase: "a guarda fechada", desc: "Segura a finalização e recebe menos dano, sem gastar energia.", mod: {} },
      { id: "amarrar", rotulo: "Amarrar os braços", frase: "os braços amarrados", desc: "O ground and pound dele entra menos. A passagem dele entra mais.", mod: { guarda: 6, cede: 6 } },
    ],
    pressao: [
      { id: "levantar", rotulo: "Levantar", frase: "a levantada", desc: "Tenta voltar a ficar em pé.", mod: {} },
      { id: "pela_grade", rotulo: "Levantar pela grade", frase: "a levantada pela grade", desc: "Usa a grade pra levantar. Entra mais e gasta um pouco mais de energia.", mod: { acerto: 7, custo: 0.5 } },
    ],
  },
};
/* id -> variante (com papel e família), pra texto e pra tela */
export const VARIANTE_POR_ID = Object.fromEntries(Object.entries(VARIANTES).flatMap(([pp, fams]) =>
  Object.entries(fams).flatMap(([f, lista]) => lista.map((v) => [v.id, { ...v, papel: pp, familia: f }]))));
const PAPEIS = ["pe", "cima", "baixo"];
/* A mão do lado no round: {pe: {golpes: id, ...}, cima: {...}, baixo: {...}}.
   Um sha256 por (semente, lado) dá o ponto de partida de cada família; o
   round anda uma casa na lista (rodízio). */
export function maoDoRound(semente, round, lado) {
  const h = createHash("sha256").update(`mao:${semente}:${lado}`).digest();
  const mao = {};
  PAPEIS.forEach((pp, i) => {
    mao[pp] = {};
    FAMILIAS.forEach((f, j) => {
      const lista = VARIANTES[pp][f];
      mao[pp][f] = lista[(h[i * 4 + j] + round - 1) % lista.length].id;
    });
  });
  return mao;
}
export function varianteDe(semente, round, lado, pp, fam) {
  return VARIANTE_POR_ID[maoDoRound(semente, round, lado)[pp][fam]];
}

/* ---------- sorteio ---------- */
function mulberry32(s) {
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function geradorDaTroca(semente, round, troca) {
  const h = createHash("sha256").update(`${semente}:${round}:${troca}`).digest();
  return mulberry32(h.readUInt32LE(0));
}
export const compromissoDaSemente = (semente) => createHash("sha256").update(String(semente)).digest("hex");

/* ---------- estado ---------- */
export const energiaMax = (p) => 10 + (p.atr.cardio - 50) / 10;
const ladoNovo = (p) => ({
  energia: energiaMax(p), dano: 0, ausentesSeguidas: 0, ultima: null, atingido: false, travado: false,
  total: { golpes: 0, acertos: 0, quedas: 0, quedasTentadas: 0, finalizacoes: 0, knockdowns: 0, controle: 0, contras: 0 },
});
export function novaLuta(perfilA, perfilB) {
  return {
    v: VERSAO_MOTOR, round: 1, troca: 1, pos: "pe", nivelPos: 0, momento: 0, paradoChao: 0,
    a: ladoNovo(perfilA), b: ladoNovo(perfilB), pontos: [{ a: 0, b: 0 }], cartoes: [], fim: null,
  };
}
/* Papel de cada lado na posição atual: "pe", "cima" ou "baixo". */
export function papel(estado, lado) {
  if (estado.pos === "pe") return "pe";
  const cima = estado.pos === "cima_a" ? "a" : "b";
  return lado === cima ? "cima" : "baixo";
}
/* As 4 ações do lado agora. Com a semente (o servidor sempre passa), cada
   uma vem com a variante da mão do round: rótulo, efeito e custo dela. */
export function acoesDisponiveis(estado, lado, perfil, semente = null) {
  const pp = papel(estado, lado);
  const mao = semente == null ? null : maoDoRound(semente, estado.round, lado)[pp];
  return FAMILIAS.map((f) => {
    const v = mao ? VARIANTE_POR_ID[mao[f]] : null;
    return {
      familia: f, grupo: FAMILIA_NOME[pp][f], ciclo: CICLO[pp][f],
      variante: v ? v.id : null, rotulo: v ? v.rotulo : ROTULOS[pp][f], descricao: v ? v.desc : DESCRICOES[pp][f],
      custo: custoEnergia(pp, f, perfil, v),
    };
  });
}
export function custoEnergia(pp, fam, perfil, variante = null) {
  let c = CUSTO[pp][fam] + ((variante && variante.mod.custo) || 0);
  const m = (perfil && perfil.mec) || {};
  if (c > 0) {
    if (fam === "golpes" && pp === "pe") c -= m.eficienciaGolpe || 0;
    if (fam === "queda" && pp === "pe") c -= m.eficienciaQueda || 0;
    if (fam === "pressao") c -= m.eficienciaOfensiva || 0;
    c = Math.max(0.5, c);
  } else if (fam === "defesa") {
    c -= m.recuperacao || 0;   // custo negativo = recupera
  }
  return Math.round(c * 100) / 100;
}

/* ---------- disputa ---------- */
const sig = (x) => 1 / (1 + Math.exp(-x / K.esc));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const outro = (l) => (l === "a" ? "b" : "a");

/* Ajuste de disputa do lado: momento, cansaço, aproveitamento e leitura. */
function ajuste(ctx, lado) {
  const e = ctx.estado, s = e[lado], o = e[outro(lado)], m = ctx.perfis[lado].mec, mo = ctx.perfis[outro(lado)].mec;
  let v = (lado === "a" ? 1 : -1) * e.momento * K.momentoPts;
  if (s.energia <= K.cansacoLimite) v -= (K.cansacoLimite + 1 - s.energia) * K.cansacoPts;
  if (o.energia <= 3 && m.aproveitamento) v += m.aproveitamento;
  /* leitura: o adversário repetiu a ação da troca anterior */
  const repetiu = o.ultima && ctx.acoes[outro(lado)] === o.ultima;
  if (repetiu && m.leitura) v += m.leitura * (1 - (mo.variedade || 0));
  return v;
}
/* Valor de ataque/defesa de um atributo já com o ajuste do lado. Atributo
   defensivo cai com o dano acumulado. */
function val(ctx, lado, atr) {
  const s = ctx.estado[lado], p = ctx.perfis[lado];
  let v = p.atr[atr] + ctx.aj[lado];
  if (atr === "defesa" || atr === "defChao" || atr === "defQueda") v -= s.dano * K.danoDefesa;
  if (atr === "defesa" && s.atingido && p.mec.adaptacao) v += p.mec.adaptacao;
  return v;
}
const disputa = (ctx, x, y) => ctx.r() < sig(x - y);

/* ---------- dano, nocaute, finalização ---------- */
function registrar(ctx, tipo, quem, extra = {}) { ctx.eventos.push({ tipo, quem, ...extra }); }
function pontuar(ctx, lado, pts) { ctx.estado.pontos[ctx.estado.round - 1][lado] += pts; }
function moverMomento(ctx, lado, n) {
  const e = ctx.estado, sinal = lado === "a" ? 1 : -1;
  e.momento = clamp(e.momento + sinal * n, -K.momentoMax, K.momentoMax);
  ctx.momentoMexeu = true;
  pontuar(ctx, lado, K.bonusMomento * n);
  const m = ctx.perfis[lado].mec;
  if (m.ritmo && ctx.r() < m.ritmo) e.momento = clamp(e.momento + sinal, -K.momentoMax, K.momentoMax);
}
/* Golpe que entrou: dano, pontos e checagem de knockdown/nocaute.
   tipo: "golpe" (em pé), "gnp" (por cima), "contra", "sujo" (pressão), "punicao" (na entrada da queda).
   vari: a variante da ação que produziu o golpe (dano, nocaute, trava,
   cansa e o nome no texto); sem ela, o golpe é o da família. */
function acertar(ctx, atk, tipo, fatorDano = 1, fatorKO = fatorDano, vari = null) {
  const e = ctx.estado, def = outro(atk), pa = ctx.perfis[atk], pd = ctx.perfis[def];
  const mv = vari ? vari.mod : {};
  fatorDano *= mv.dano || 1; fatorKO *= mv.ko || 1;
  const base = { golpe: K.danoGolpe, gnp: K.danoGnp, contra: K.danoContra, sujo: K.danoSujo, punicao: K.danoPunicao, baixo: 1.8 }[tipo];
  let d = base * fatorDano * (pa.atr.poder / 55) * (0.75 + ctx.r() * 0.5);
  if (tipo === "gnp") d *= (1 + (pa.mec.gnp || 0)) * (1 + e.nivelPos * 0.25) * (1 - (pd.mec.retencao || 0));
  if (tipo === "contra") d *= 1 + (pa.mec.contraDano || 0);
  if (tipo !== "gnp" && tipo !== "baixo") d *= 1 - (pd.mec.bloqueio || 0);
  d = Math.round(d * 10) / 10;
  e[def].dano = Math.min(100, e[def].dano + d);
  e[def].atingido = true;
  e[atk].total.acertos++;
  pontuar(ctx, atk, d);
  registrar(ctx, tipo, atk, vari ? { dano: d, v: vari.id } : { dano: d });
  if (tipo === "golpe" && pa.mec.chuteCorpo) e[def].energia = Math.max(0, e[def].energia - pa.mec.chuteCorpo);
  if (tipo === "golpe" && pa.mec.chuteBaixo && ctx.r() < pa.mec.chuteBaixo) e[def].travado = true;
  if (tipo === "golpe" && mv.cansa) e[def].energia = Math.max(0, e[def].energia - mv.cansa);
  if (tipo === "golpe" && mv.trava && ctx.r() < mv.trava) e[def].travado = true;
  if (tipo === "baixo" || tipo === "sujo") return false;
  /* nocaute: cresce com o dano acumulado, cai com o queixo */
  const fatorAcumulado = Math.pow(e[def].dano / 100 + K.koPiso, K.koExpoente);
  const fatorQueixo = clamp(1.3 - pd.atr.queixo / 100, 0.3, 1.2);
  let p = (tipo === "gnp" ? K.tkoBase : K.koBase) * Math.pow(pa.atr.poder / 55, 1.4) * fatorAcumulado * fatorQueixo * fatorKO;
  if (tipo === "contra") p *= 1 + (pa.mec.timingKO || 0);
  if (tipo === "gnp") p *= (1 + e.nivelPos * 0.3) * (1 - (pd.mec.sobrevivencia || 0));
  const x = ctx.r();
  if (x < p) {
    finalizar(ctx, atk, tipo === "gnp" ? "TKO" : "KO", vari);
    return true;
  }
  if (tipo !== "gnp" && x < p * K.kdFator) {
    e[atk].total.knockdowns++;
    e[def].dano = Math.min(100, e[def].dano + 5);
    pontuar(ctx, atk, K.bonusKD);
    registrar(ctx, "knockdown", atk, vari ? { v: vari.id } : {});
    moverMomento(ctx, atk, 2);
  }
  return false;
}
/* vari: a finalização da mão (por cima, com pontos por posição; por baixo,
   o triângulo); sem ela, a finalização genérica. */
function tentarFinalizacao(ctx, atk, bonus, mult, vari = null) {
  const e = ctx.estado, def = outro(atk), pa = ctx.perfis[atk], pd = ctx.perfis[def];
  e[atk].total.finalizacoes++;
  pontuar(ctx, atk, K.bonusTentativaSub);
  const cima = papel(e, atk) === "cima";
  const porNivel = vari && vari.mod.porNivel ? vari.mod.porNivel[e.nivelPos] || 0 : 0;
  let x = val(ctx, atk, "chao") + bonus + porNivel + (cima ? e.nivelPos * 8 : -6) - (val(ctx, def, "defChao") + 6);
  let p = K.subBase * Math.pow(sig(x), 2) * mult * (1 + (pa.mec.finalizacao || 0));
  if (!cima) p *= 0.55 + (pa.mec.subDeBaixo || 0) * 2;
  if (e[def].energia <= 3) p *= 1.25 + (pa.mec.finalizacaoCansado || 0);
  p = Math.min(0.75, p);
  if (ctx.r() < p) { finalizar(ctx, atk, "FIN", vari); return true; }
  registrar(ctx, "subFalhou", atk, vari ? { v: vari.id } : {});
  return false;
}
function finalizar(ctx, vencedor, metodo, vari = null) {
  const e = ctx.estado;
  e.fim = { vencedor, metodo, round: e.round, troca: e.troca };
  registrar(ctx, "fim", vencedor, vari ? { metodo, v: vari.id } : { metodo });
}
/* queda que entrou: a variante decide em que posição cai e quanto marca */
function derrubar(ctx, atk, vari = null) {
  const e = ctx.estado, mv = vari ? vari.mod : {};
  e.pos = atk === "a" ? "cima_a" : "cima_b";
  e.nivelPos = Math.min(2, mv.nivel || 0);
  e[atk].total.quedas++;
  pontuar(ctx, atk, K.bonusQueda * (mv.pontos || 1));
  registrar(ctx, "queda", atk, vari ? { v: vari.id } : {});
  moverMomento(ctx, atk, 1);
}
function levantar(ctx, quem, vari = null) {
  const e = ctx.estado;
  e.pos = "pe"; e.nivelPos = 0;
  registrar(ctx, "levantou", quem, vari ? { v: vari.id } : {});
}

/* ---------- em pé ----------
   Ciclo (cada ação ganha de uma, perde de uma e empata com uma):
   Golpes > Pressão > Defesa > Queda > Golpes; Golpes x Defesa e
   Queda x Pressão são neutros. "Ganhar" é K.vantagem na disputa, nunca
   resultado garantido: atributo e árvore continuam decidindo. */
function trocaEmPe(ctx, A, B) {
  const e = ctx.estado, a = ctx.acoes[A], b = ctx.acoes[B], V = K.vantagem, vr = ctx.var, md = ctx.mod;
  /* força da pressão: só quem escolheu Pressão chama isto, então o acerto
     é o da variante de pressão dele */
  const pr = (lado) => (val(ctx, lado, "golpe") + val(ctx, lado, "queda")) / 2 + (ctx.perfis[lado].mec.golpesNaPressao || 0) * 20 + (md[lado].acerto || 0);
  const golpear = (atk, bonus = 0, fatorDano = 1, fatorKO = fatorDano) => {
    e[atk].total.golpes++;
    if (disputa(ctx, val(ctx, atk, "golpe") + bonus + (md[atk].acerto || 0), val(ctx, outro(atk), "defesa"))) {
      if (acertar(ctx, atk, "golpe", fatorDano, fatorKO, vr[atk])) return true;
      const m = ctx.perfis[atk].mec;
      if (m.combinacao && ctx.r() < m.combinacao) return acertar(ctx, atk, "golpe", fatorDano, fatorKO, vr[atk]);
    } else registrar(ctx, "errou", atk, { v: vr[atk].id });
    return false;
  };
  /* contra-ataque de quem defendeu: a esquiva aumenta a chance */
  const contra = (def, atk) => {
    const m = ctx.perfis[def].mec;
    if (ctx.r() < K.contraBase + (m.contra || 0) + (md[def].contra || 0) && disputa(ctx, val(ctx, def, "defesa") + 6, val(ctx, atk, "golpe"))) {
      e[def].total.contras++;
      return acertar(ctx, def, "contra", 1, 1, md[def].contra ? vr[def] : null);
    }
    return false;
  };
  const tentarQueda = (atk, bonus, fator) => {
    const def = outro(atk), m = ctx.perfis[atk].mec;
    e[atk].total.quedasTentadas++;
    const travado = e[atk].travado ? 10 : 0;
    const p = Math.min(0.95, sig(val(ctx, atk, "queda") + bonus + (md[atk].acerto || 0) - travado - val(ctx, def, "defQueda")) * fator * K.quedaFator);
    if (ctx.r() < p) { derrubar(ctx, atk, vr[atk]); return true; }
    if (m.cadeia && ctx.r() < m.cadeia * 2 && ctx.r() < sig(val(ctx, atk, "queda") - val(ctx, def, "defQueda")) * 0.6) {
      registrar(ctx, "cadeia", atk); derrubar(ctx, atk, vr[atk]); return true;
    }
    /* grappler: a queda que falhou pode virar puxada pra guarda */
    if (m.puxarGuarda && ctx.r() < m.puxarGuarda) {
      e.pos = def === "a" ? "cima_a" : "cima_b"; e.nivelPos = 0;
      registrar(ctx, "puxouGuarda", atk);
      return false;
    }
    registrar(ctx, "quedaDefendida", def, ctx.acoes[def] === "defesa" ? { v: vr[atk].id, vd: vr[def].id } : { v: vr[atk].id });
    return false;
  };

  /* espelhos: disputa direta de atributo */
  if (a === "golpes" && b === "golpes") {
    if (golpear(A)) return; golpear(B);
    return;
  }
  if (a === "queda" && b === "queda") {
    const x = (val(ctx, A, "queda") + val(ctx, A, "chao") / 2 + (md[A].acerto || 0)) - (val(ctx, B, "queda") + val(ctx, B, "chao") / 2 + (md[B].acerto || 0));
    e[A].energia = Math.max(0, e[A].energia - 1); e[B].energia = Math.max(0, e[B].energia - 1);
    if (ctx.r() < 0.5) { const q = ctx.r() < sig(x) ? A : B; derrubar(ctx, q, vr[q]); }
    else registrar(ctx, "embolou", A);
    return;
  }
  if (a === "defesa" && b === "defesa") { registrar(ctx, "estudo", A); return; }
  if (a === "pressao" && b === "pressao") {
    e[A].energia = Math.max(0, e[A].energia - 1); e[B].energia = Math.max(0, e[B].energia - 1);
    const venc = disputa(ctx, pr(A), pr(B)) ? A : B;
    moverMomento(ctx, venc, 1);
    if (ctx.r() < 0.6) acertar(ctx, venc, "sujo", 1, 1, vr[venc]);
    return;
  }
  /* Queda > Golpes: entra por baixo dos golpes; se falhar, come a punição */
  if (a === "golpes" && b === "queda") {
    const mt = ctx.perfis[B].mec.timingQueda || 0;
    if (tentarQueda(B, V + mt + (md[A].exposto || 0) + (md[B].vsGolpes || 0), 0.95)) {
      if (ctx.r() < 0.2 && disputa(ctx, val(ctx, A, "golpe"), val(ctx, B, "defesa"))) acertar(ctx, A, "punicao", 1, 1, vr[A]);
      return;
    }
    e[B].energia = Math.max(0, e[B].energia - 1);
    moverMomento(ctx, A, 1);
    if (disputa(ctx, val(ctx, A, "golpe") + 4, val(ctx, B, "defesa"))) acertar(ctx, A, "punicao", 1, 1, vr[A]);
    return;
  }
  /* Golpes x Defesa (neutro): bate na guarda; a defesa recupera e pode contra-atacar */
  if (a === "golpes" && b === "defesa") {
    const acertos = e[A].total.acertos;
    if (golpear(A, -K.golpeNaGuarda - (md[B].guarda || 0), K.danoNaGuarda, K.danoNaGuarda * K.koNaGuarda)) return;
    if (e[A].total.acertos === acertos) { pontuar(ctx, B, K.pontosGuarda); registrar(ctx, "bloqueou", B, { v: vr[B].id }); }
    contra(B, A);
    return;
  }
  /* Golpes > Pressão: quem pressiona anda pra dentro dos golpes */
  if (a === "golpes" && b === "pressao") {
    if (golpear(A, V / 2, 0.8)) return;
    if (!e[B].travado && disputa(ctx, pr(B), val(ctx, A, "golpe") + V)) {
      moverMomento(ctx, B, 1);
      if (disputa(ctx, val(ctx, B, "golpe"), val(ctx, A, "defesa"))) acertar(ctx, B, "sujo", 1, 1, vr[B]);
    } else moverMomento(ctx, A, 1);
    return;
  }
  /* Defesa > Queda: sprawl */
  if (a === "queda" && b === "defesa") {
    if (!tentarQueda(A, -V - (md[B].sprawl || 0), 0.85)) {
      e[A].energia = Math.max(0, e[A].energia - 1);
      const mb = ctx.perfis[B].mec;
      if (mb.retornoDistancia) e[B].energia = Math.min(energiaMax(ctx.perfis[B]), e[B].energia + mb.retornoDistancia);
      moverMomento(ctx, B, 1);
      if (ctx.r() < 0.1 + (mb.sprawlContra || 0)) acertar(ctx, B, "contra");
    }
    return;
  }
  /* Queda x Pressão (neutro): briga no clinche */
  if (a === "queda" && b === "pressao") {
    const mt = ctx.perfis[A].mec.timingQueda || 0;
    if (tentarQueda(A, mt + (md[A].vsPressao || 0), 0.7)) return;
    moverMomento(ctx, B, 1);
    if (ctx.r() < 0.5 && disputa(ctx, val(ctx, B, "golpe"), val(ctx, A, "defesa"))) acertar(ctx, B, "sujo", 1, 1, vr[B]);
    return;
  }
  /* Pressão > Defesa: encurrala na grade */
  if (a === "defesa" && b === "pressao") {
    const ma = ctx.perfis[A].mec;
    if (ma.antiPressao && ctx.r() < ma.antiPressao) { registrar(ctx, "saiuDaGrade", A); moverMomento(ctx, A, 1); return; }
    if (e[B].travado) { registrar(ctx, "pressaoTravada", B); return; }
    moverMomento(ctx, B, 1);
    ctx.recuperacaoCortada[A] = true;
    e[A].energia = Math.max(0, e[A].energia - 1 - (md[B].cansa || 0));
    pontuar(ctx, B, K.bonusGrade);
    if (disputa(ctx, val(ctx, B, "golpe") + V, val(ctx, A, "defesa"))) acertar(ctx, B, "sujo", 1, 1, vr[B]);
    if (ctx.r() < (ctx.perfis[B].mec.golpesNaPressao || 0) && disputa(ctx, val(ctx, B, "golpe"), val(ctx, A, "defesa"))) acertar(ctx, B, "golpe");
    return;
  }
}

/* ---------- no chão (T por cima, U por baixo) ----------
   Ciclo do chão (o de cima escolhe G, Q, D ou P; o de baixo também):
   - Ground and pound ganha de quem tenta levantar e perde pra raspagem;
   - Finalização ganha de quem levanta ou só golpeia, perde pra guarda fechada;
   - Segurar ganha da raspagem e perde pra quem levanta (parado, deixa ele subir na grade);
   - Avançar ganha da guarda e dos golpes por baixo, perde pra raspagem e pra quem levanta.
   Golpes por baixo só rendem contra quem fica parado segurando.
   "Ganhar" é K.vantagemChao na disputa, nunca resultado garantido. */
function trocaNoChao(ctx, T, U) {
  const e = ctx.estado, t = ctx.acoes[T], u = ctx.acoes[U], mt = ctx.perfis[T].mec, mu = ctx.perfis[U].mec, VC = K.vantagemChao;
  const vr = ctx.var, md = ctx.mod;
  /* cada ajudante só roda pra família dele (escapar: U em Levantar;
     raspar: U em Raspar; gnp: T em Ground and pound; avancar: T em
     Avançar; golpesPorBaixo: U em Golpes por baixo), então o ajuste é o da
     variante daquela família */
  const escapar = (bonus = 0, fator = 1) => {
    const ml = u === "pressao" ? md[U] : {};
    const x = val(ctx, U, "defChao") + (mu.levantar || 0) + (mu.saida || 0) + bonus + (ml.acerto || 0) - val(ctx, T, "chao") - e.nivelPos * 6;
    if (ctx.r() < Math.min(0.95, sig(x) * fator * K.escapeMult) * (1 - (mt.dominio || 0))) { levantar(ctx, U, u === "pressao" ? vr[U] : null); return true; }
    return false;
  };
  /* raspar também é a saída de quem fecha a guarda contra a finalização
     (u Defesa): aí não tem variante de raspagem. A raspagem que falha pode
     virar finalização por baixo (triângulo). */
  const raspar = (bonus = 0, fator = 1) => {
    const mq = u === "queda" ? md[U] : {};
    const x = val(ctx, U, "chao") + bonus + (mq.acerto || 0) - val(ctx, T, "chao") - e.nivelPos * 6;
    if (ctx.r() < Math.min(0.9, sig(x) * fator * (1 + (mu.raspagem || 0) * 2)) * (1 - (mt.dominio || 0))) {
      e.pos = U === "a" ? "cima_a" : "cima_b"; e.nivelPos = 0;
      registrar(ctx, "raspou", U, u === "queda" ? { v: vr[U].id } : {}); moverMomento(ctx, U, 1); return true;
    }
    if (mq.sub && ctx.r() < mq.sub) return tentarFinalizacao(ctx, U, 0, mq.subMult || 1, vr[U]);
    return false;
  };
  const gnp = (bonus = 0) => {
    e[T].total.golpes++;
    const guarda = u === "defesa" ? md[U].guarda || 0 : 0;
    const x = (val(ctx, T, "chao") + val(ctx, T, "golpe")) / 2 + e.nivelPos * 6 + bonus + (md[T].acerto || 0) - guarda - (val(ctx, U, "defChao") + 10);
    if (disputa(ctx, x, 0)) return acertar(ctx, T, "gnp", 1, 1, vr[T]);
    registrar(ctx, "errou", T, { v: vr[T].id });
    return false;
  };
  const avancar = (bonus = 0) => {
    if (e.nivelPos >= 2) { registrar(ctx, "posicaoMantida", T); pontuar(ctx, T, K.bonusControle); return false; }
    const cede = u === "defesa" ? md[U].cede || 0 : 0;
    const x = val(ctx, T, "chao") + (mt.transicao || 0) + (mt.passagem || 0) + bonus + (md[T].acerto || 0) + cede - val(ctx, U, "defChao");
    if (disputa(ctx, x, 0)) {
      e.nivelPos = Math.min(2, e.nivelPos + 1 + (md[T].nivel || 0));
      registrar(ctx, "avancou", T, { nivel: e.nivelPos, v: vr[T].id }); moverMomento(ctx, T, 1);
      if (mt.transicaoSub && ctx.r() < mt.transicaoSub) return tentarFinalizacao(ctx, T, 0, 0.8);
    } else registrar(ctx, "guardaSegurou", U);
    return false;
  };
  const golpesPorBaixo = (bonus = 0) => {
    if (disputa(ctx, val(ctx, U, "golpe") + bonus + (md[U].acerto || 0) - 8, val(ctx, T, "defesa"))) acertar(ctx, U, "baixo", 1, 1, vr[U]);
  };
  if (!(t === "defesa" && u === "defesa")) e.paradoChao = 0;
  /* ponto de controle de quem segurou por cima; a pressão de peso marca
     menos e cansa quem está embaixo */
  const controle = () => {
    if (!e.fim && e.pos !== "pe" && (e.pos === "cima_a" ? "a" : "b") === T) {
      e[T].total.controle++;
      pontuar(ctx, T, K.bonusControle * (t === "defesa" ? md[T].pontos || 1 : 1));
      if (t === "defesa" && md[T].cansa) e[U].energia = Math.max(0, e[U].energia - md[T].cansa);
    }
  };

  if (t === "golpes") {
    if (u === "golpes") { if (gnp(VC / 2)) return; golpesPorBaixo(-6); }
    else if (u === "queda") { if (raspar(VC)) return; if (gnp(0)) return; if (mu.subDeBaixo && ctx.r() < mu.subDeBaixo && tentarFinalizacao(ctx, U, 0, 0.8)) return; }
    else if (u === "defesa") { if (gnp(-4)) return; }
    else if (u === "pressao") { if (gnp(VC)) return; if (escapar(-VC / 2, 0.6)) return; }
  } else if (t === "queda") {
    e[T].energia = Math.max(0, e[T].energia - 0.5);
    if (u === "golpes") { if (tentarFinalizacao(ctx, T, VC, 1, vr[T])) return; }
    else if (u === "queda") {
      if (disputa(ctx, val(ctx, T, "chao"), val(ctx, U, "chao"))) { if (tentarFinalizacao(ctx, T, 0, 1, vr[T])) return; }
      else if (raspar(0, 0.8)) return;
    } else if (u === "defesa") {
      if (tentarFinalizacao(ctx, T, -VC * K.guardaContraSub, 1, vr[T])) return;
      if (raspar(-4, 0.4)) return;
    } else if (u === "pressao") { if (tentarFinalizacao(ctx, T, VC, 1, vr[T])) return; if (escapar(0, 0.5)) return; }
  } else if (t === "defesa") {
    if (u === "golpes") golpesPorBaixo(VC / 2);
    else if (u === "queda") { if (raspar(-VC)) return; e[U].energia = Math.max(0, e[U].energia - 1); }
    else if (u === "defesa") {
      if (mu.recuperarGuarda && e.nivelPos > 0 && ctx.r() < mu.recuperarGuarda) { e.nivelPos--; registrar(ctx, "recuperouGuarda", U); }
      /* os dois parados: na segunda seguida, o juiz levanta a luta */
      e.paradoChao = (e.paradoChao || 0) + 1;
      if (e.paradoChao >= 2) { e.paradoChao = 0; e.pos = "pe"; e.nivelPos = 0; registrar(ctx, "juizLevantou", T); return; }
      e[T].total.controle++; pontuar(ctx, T, K.bonusControle * K.controleParado * (md[T].pontos || 1));
      if (md[T].cansa) e[U].energia = Math.max(0, e[U].energia - md[T].cansa);
      return;
    } else if (u === "pressao") { if (escapar(VC)) return; }
  } else if (t === "pressao") {
    if (u === "golpes") { if (avancar(VC / 2)) return; }
    else if (u === "queda") { if (raspar(VC / 2)) return; if (avancar(-4)) return; }
    else if (u === "defesa") { if (avancar(VC)) return; }
    else if (u === "pressao") { if (escapar(VC / 2)) return; if (avancar(-4)) return; }
  }
  if (u === "defesa" && e.pos !== "pe" && mu.recuperarGuarda && t !== "defesa" && e.nivelPos > 0 && ctx.r() < mu.recuperarGuarda / 2) {
    e.nivelPos--; registrar(ctx, "recuperouGuarda", U);
  }
  if (!(t === "defesa" && u === "golpes")) controle();
}

/* ---------- fechamento de round e decisão ---------- */
function cartaoDoRound(pts) {
  const d = pts.a - pts.b;
  if (Math.abs(d) < K.limiteEmpateRound) return { a: 10, b: 10 };
  const [v, p] = d > 0 ? ["a", "b"] : ["b", "a"];
  const perdedor = Math.abs(d) >= K.limite108 && pts[p] <= pts[v] / 3 ? 8 : 9;
  /* sempre {a, b} nessa ordem: é como o banco devolve, e a auditoria compara */
  return v === "a" ? { a: 10, b: perdedor } : { a: perdedor, b: 10 };
}
function fecharRound(estado, perfis) {
  const e = estado;
  e.cartoes.push(cartaoDoRound(e.pontos[e.round - 1]));
  if (e.round >= FORMATO.rounds) {
    const ta = e.cartoes.reduce((s, c) => s + c.a, 0), tb = e.cartoes.reduce((s, c) => s + c.b, 0);
    e.fim = ta === tb ? { vencedor: null, metodo: "EMPATE", round: e.round, troca: FORMATO.trocasPorRound }
      : { vencedor: ta > tb ? "a" : "b", metodo: "DEC", round: e.round, troca: FORMATO.trocasPorRound };
    e.fim.placar = { a: ta, b: tb };
    return;
  }
  e.round++; e.troca = 1; e.pos = "pe"; e.nivelPos = 0;
  e.momento = Math.trunc(e.momento / 2);
  for (const l of ["a", "b"]) {
    e[l].energia = Math.min(energiaMax(perfis[l]), e[l].energia + K.recuperacaoRound + (perfis[l].atr.cardio - 50) / 12);
    e[l].travado = false;
  }
  e.pontos.push({ a: 0, b: 0 });
}

/* ---------- troca ---------- */
/* acoes = {a: família|null, b: família|null}; null = prazo perdido.
   Devolve {estado, eventos} sem mexer no estado recebido. A variante de
   cada lado sai da mão do round (maoDoRound); opcoes.mao troca entradas da
   mão (só simulação e teste: {a: {pe: {golpes: "cruzado"}}}). O servidor
   nunca passa opcoes. */
export function resolverTroca(estadoIn, perfis, acoesIn, semente, opcoes = null) {
  if (estadoIn.fim) throw new Error("luta já encerrada");
  const estado = JSON.parse(JSON.stringify(estadoIn));
  const ctx = { estado, perfis, eventos: [], r: geradorDaTroca(semente, estado.round, estado.troca),
    acoes: {}, aj: {}, momentoMexeu: false, recuperacaoCortada: {}, var: {}, mod: {} };
  const ausente = {};
  for (const l of ["a", "b"]) {
    const ac = acoesIn[l];
    if (ac && !FAMILIAS.includes(ac)) throw new Error("ação inválida");
    ausente[l] = !ac;
    estado[l].ausentesSeguidas = ac ? 0 : estado[l].ausentesSeguidas + 1;
    ctx.acoes[l] = ac || "defesa";
    if (!ac) registrar(ctx, "ausente", l, { seguidas: estado[l].ausentesSeguidas });
  }
  if (estado.a.ausentesSeguidas >= AUSENCIAS_WO && estado.b.ausentesSeguidas >= AUSENCIAS_WO) {
    estado.fim = { vencedor: null, metodo: "ANULADA", round: estado.round, troca: estado.troca };
    registrar(ctx, "fim", null, { metodo: "ANULADA" });
    return { estado, eventos: ctx.eventos };
  }
  for (const l of ["a", "b"]) if (estado[l].ausentesSeguidas >= AUSENCIAS_WO) {
    estado.fim = { vencedor: outro(l), metodo: "WO", round: estado.round, troca: estado.troca };
    registrar(ctx, "fim", outro(l), { metodo: "WO" });
    return { estado, eventos: ctx.eventos };
  }
  /* variante de cada lado (a de quem faltou é a Defesa da mão dele) */
  const papeis = { a: papel(estado, "a"), b: papel(estado, "b") };
  for (const l of ["a", "b"]) {
    const pp = papeis[l], f = ctx.acoes[l];
    const forcada = opcoes && opcoes.mao && opcoes.mao[l] && opcoes.mao[l][pp] && opcoes.mao[l][pp][f];
    const v = (forcada && VARIANTE_POR_ID[forcada] && VARIANTE_POR_ID[forcada].papel === pp && VARIANTE_POR_ID[forcada].familia === f)
      ? VARIANTE_POR_ID[forcada] : varianteDe(semente, estado.round, l, pp, f);
    ctx.var[l] = v; ctx.mod[l] = v.mod;
  }
  registrar(ctx, "escolha", null, { va: ctx.var.a.id, vb: ctx.var.b.id });
  /* custo de energia (ação de quem faltou não recupera) */
  for (const l of ["a", "b"]) {
    const c = custoEnergia(papeis[l], ctx.acoes[l], perfis[l], ctx.var[l]);
    if (ausente[l] && c < 0) continue;
    estado[l].energia = clamp(estado[l].energia - c, 0, energiaMax(perfis[l]));
  }
  ctx.aj = { a: ajuste(ctx, "a"), b: ajuste(ctx, "b") };
  if (estado.pos === "pe") estado.paradoChao = 0;
  const momentoAntes = estado.momento;
  for (const l of ["a", "b"]) estado[l].atingido = false;

  /* em pé, cada par de ações tem uma regra só: o lado da ação que vem
     antes em FAMILIAS faz o papel de A */
  if (estado.pos === "pe") {
    const ia = FAMILIAS.indexOf(ctx.acoes.a), ib = FAMILIAS.indexOf(ctx.acoes.b);
    if (ia <= ib) trocaEmPe(ctx, "a", "b"); else trocaEmPe(ctx, "b", "a");
  }
  else if (estado.pos === "cima_a") trocaNoChao(ctx, "a", "b");
  else trocaNoChao(ctx, "b", "a");

  /* ausência repetida: a troca vai pro adversário na pontuação */
  for (const l of ["a", "b"]) if (estado[l].ausentesSeguidas >= 2) pontuar(ctx, outro(l), K.bonusAusencia);
  for (const l of ["a", "b"]) {
    if (ctx.recuperacaoCortada[l] && ctx.acoes[l] === "defesa") estado[l].energia = Math.max(0, estado[l].energia - 1);
    estado[l].ultima = ctx.acoes[l];
    estado[l].travado = estado[l].travado && !ctx.eventos.some((ev) => ev.quem === l && /queda|pressao/.test(ev.tipo));
  }
  /* momento parado volta 1 pro centro, a não ser que a retenção segure */
  if (!ctx.momentoMexeu && estado.momento === momentoAntes && estado.momento !== 0) {
    const dono = estado.momento > 0 ? "a" : "b";
    const ret = perfis[dono].mec.retencaoMomento || 0;
    if (ctx.r() >= ret) estado.momento -= Math.sign(estado.momento);
  }
  if (!estado.fim) {
    if (estado.troca >= FORMATO.trocasPorRound) fecharRound(estado, perfis);
    else estado.troca++;
  }
  if (estado.fim && !ctx.eventos.some((ev) => ev.tipo === "fim")) registrar(ctx, "fim", estado.fim.vencedor, { metodo: estado.fim.metodo });
  return { estado, eventos: ctx.eventos };
}

/* Texto de um evento, pra tela e pra narração (fatos do motor). nomes =
   {a, b}. Sem travessão, sem frase de efeito. Evento com variante (v, vd)
   diz o nome do golpe ou da técnica; sem ela, o texto genérico. "escolha"
   é só registro das variantes da troca (a tela usa), sem texto. */
export function textoEvento(ev, nomes) {
  const q = ev.quem ? nomes[ev.quem] : "", o = ev.quem ? nomes[outro(ev.quem)] : "";
  const num = (x) => String(x).replace(".", ",");
  const V = ev.v ? VARIANTE_POR_ID[ev.v] || null : null, VD = ev.vd ? VARIANTE_POR_ID[ev.vd] || null : null;
  const fr = V ? V.frase : null, deDefesa = V && V.familia === "defesa";
  switch (ev.tipo) {
    case "escolha": return "";
    case "golpe": return fr && !deDefesa ? `${q} acertou ${fr} (${num(ev.dano)} de dano).` : `${q} acertou golpes (${num(ev.dano)} de dano).`;
    case "punicao": return fr ? `${q} acertou ${fr} na entrada da queda de ${o}.` : `${q} acertou ${o} na entrada da queda.`;
    case "contra": return deDefesa ? `${q} esquivou e acertou o contra-ataque.` : `${q} contra-atacou e acertou.`;
    case "sujo": return V && V.id === "joelhadas" ? `${q} acertou joelhadas no clinche.` : `${q} acertou golpes curtos na grade.`;
    case "gnp": return fr ? `${q} acertou ${fr} (${num(ev.dano)} de dano).` : `${q} acertou o ground and pound (${num(ev.dano)} de dano).`;
    case "baixo": return fr ? `${q} acertou ${fr}.` : `${q} acertou golpes por baixo.`;
    case "errou": return fr ? `${q} errou ${fr}.` : `${q} errou os golpes.`;
    case "bloqueou": return V && V.id === "guarda_alta" ? `${q} segurou os golpes na guarda alta e marcou ponto.` : `${q} segurou os golpes na guarda e marcou ponto.`;
    case "knockdown": return deDefesa ? `${q} derrubou ${o} no contra-ataque.` : fr ? `${q} derrubou ${o} com ${fr}.` : `${q} derrubou ${o} com um golpe.`;
    case "queda": return !fr ? `${q} levou a luta pro chão.`
      : V.mod.nivel ? `${q} derrubou ${o} com ${fr} e já caiu na meia-guarda.` : `${q} derrubou ${o} com ${fr}.`;
    case "cadeia": return `${q} emendou uma segunda tentativa de queda.`;
    case "quedaDefendida": return !fr ? `${q} defendeu a queda.`
      : VD && VD.id === "sprawl" ? `${q} defendeu ${fr} com o sprawl.` : `${q} defendeu ${fr}.`;
    case "embolou": return `Os dois tentaram a queda ao mesmo tempo e a luta seguiu em pé.`;
    case "estudo": return `Os dois se estudaram sem atacar.`;
    case "saiuDaGrade": return `${q} saiu da pressão na grade.`;
    case "pressaoTravada": return `${q} tentou pressionar com a perna travada.`;
    case "levantou": return V && V.id === "pela_grade" ? `${q} levantou pela grade.` : `${q} levantou.`;
    case "raspou": return `${q} raspou e ficou por cima.`;
    case "avancou": return V && V.mod.nivel && ev.nivel === 2 ? `${q} foi pra montada.` : `${q} passou a guarda e melhorou a posição.`;
    case "guardaSegurou": return `${q} segurou a guarda.`;
    case "posicaoMantida": return `${q} manteve a posição.`;
    case "recuperouGuarda": return `${q} recuperou a guarda.`;
    case "puxouGuarda": return `${q} puxou ${o} pra guarda e a luta foi pro chão.`;
    case "juizLevantou": return `Os dois ficaram parados no chão e o juiz levantou a luta.`;
    case "subFalhou": return fr ? `${q} tentou ${fr} e ${o} escapou.` : `${q} tentou a finalização e ${o} escapou.`;
    case "ausente": return `${nomes[ev.quem]} não escolheu a tempo (${ev.seguidas}ª seguida).`;
    case "fim": {
      const com = fr && !deDefesa ? ` com ${fr}` : "";
      return ev.metodo === "KO" ? (deDefesa ? `${q} venceu por nocaute no contra-ataque.` : `${q} venceu por nocaute${com}.`)
        : ev.metodo === "TKO" ? `${q} venceu por nocaute técnico${com}.`
        : ev.metodo === "FIN" ? `${q} venceu por finalização${com}.`
        : ev.metodo === "DEC" ? `${q} venceu por decisão.`
        : ev.metodo === "WO" ? `${q} venceu por W.O.`
        : ev.metodo === "EMPATE" ? `A luta terminou empatada.`
        : `A luta foi anulada.`;
    }
    default: return "";
  }
}

/* Nome de golpe, técnica ou posição específica numa narração (IA): só vale
   se está nos fatos do motor. Antes das variantes o motor não tinha golpe
   com nome e qualquer menção era invenção; agora "cruzado" pode estar nos
   fatos, mas "mata-leão" só se aconteceu. Devolve os termos que faltam. */
const TERMOS_GOLPE = /\b(clinch|clinche|jabs?|cruzados?|uppercuts?|ganchos?|chutes?|joelhadas?|cotoveladas?|marteladas?|mata-le[aã]o|guilhotinas?|tri[aâ]ngulos?|armlocks?|kimuras?|americanas?|chaves? de bra[çc]o|chaves? de p[eé]|guarda alta|cabeçadas?|double leg|single leg|sprawl|quadril|montad[ao])\b/gi;
const normTermo = (w) => {
  const x = w.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^chaves /, "chave ");
  return x === "clinche" ? "clinch" : x === "montado" ? "montada" : x.replace(/s$/, "");
};
export function golpesForaDosFatos(texto, fatos) {
  const termos = (x) => new Set((String(x).match(TERMOS_GOLPE) || []).map(normTermo));
  const f = termos(fatos);
  return [...termos(texto)].filter((w) => !f.has(w));
}

/* Luta inteira com duas estratégias (só simulação e teste). estrategia(
   estado, lado, perfil, r) devolve a família. */
export function simularLuta(perfilA, perfilB, estrA, estrB, semente, opcoes = null) {
  let estado = novaLuta(perfilA, perfilB);
  const perfis = { a: perfilA, b: perfilB };
  const rEst = mulberry32(createHash("sha256").update(`estr:${semente}`).digest().readUInt32LE(0));
  let n = 0;
  while (!estado.fim && n++ < 100) {
    const acoes = { a: estrA(estado, "a", perfilA, rEst), b: estrB(estado, "b", perfilB, rEst) };
    estado = resolverTroca(estado, perfis, acoes, semente, opcoes).estado;
  }
  return estado;
}
