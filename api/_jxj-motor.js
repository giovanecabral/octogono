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
import { ESTRATEGIA, POSTURAS, maoCheia, cartasNaMao, temCarta, acaoPadrao, familiaNaMao } from "./_jxj-estrategia.js";

export const VERSAO_MOTOR = 4;   // 2: variantes de ação por round (2026-10-04); 3: leitura que decide, grogue e finalização encaixada (2026-10-20); 4: mão à vista (2026-10-27)
/* Formato (ajustado pela suíte jxjmotor; valores finais no LEIA-ME). O
   prazo da troca vem da configuração da estratégia: o sinal (5 s) e a ação
   (12 s), um prazo só (fase 2). */
export const FORMATO = { rounds: 3, trocasPorRound: 4, prazoMs: ESTRATEGIA.prazos.sinalMs + ESTRATEGIA.prazos.acaoMs, toleranciaMs: 3000 };
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
  vantagem: 22,               // pontos de disputa pra quem escolheu a ação que ganha do par em pé (ciclo): 86% com atributos iguais. v2: 15 (78%). Fase 3 (2026-10-21): escolhida entre 82%, 86%, 89% e 92% pela tabela do LEIA-ME (quem lê metade das trocas vence 78%; estilos mais justos que com 26)
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
  koBase: 0.72, tkoBase: 0.31, kdFator: 2.8,   // v3: menos nocaute direto, mais knockdown (o nocaute passa pelo grogue)
  subBase: 0.62,              // finalização: subBase x disputa² (v3: 0.78, menos finalização direta, mais encaixe)
  vantagemChao: 22,           // pontos de disputa pra quem escolheu a ação que ganha do par no chão (acompanha a de em pé desde a fase 3; era 26,6)
  guardaContraSub: 0.47,      // finalização contra guarda fechada: fração da vantagem do chão que a guarda tira
  controleParado: 0.5,        // os dois parados no chão: fração do ponto de controle de quem está por cima
  recuperacaoRound: 4,
  bonusQueda: 4, bonusControle: 2.4, bonusGrade: 2, bonusTentativaSub: 1.5, bonusKD: 6, bonusMomento: 0.5, bonusAusencia: 5,
  limiteEmpateRound: 0.01, limite108: 22,
  /* Momentos decisivos (v3, 2026-10-20, pedido do dono: "mais emoção"). Grogue:
     o knockdown sempre deixa grogue; golpe pesado deixa às vezes (cresce com o
     dano e cai com o queixo). Grogue vale a troca seguinte: defesas caem,
     o nocaute contra ele fica mais provável; se ele Defender, segura e
     respira (sem a queda de defesa); se trocar golpes, arrisca no desespero. */
  grogueDano: 6.5,            // dano mínimo do golpe pra poder deixar grogue
  grogueBase: 0.5,            // chance: base x (dano/10) x fator do queixo
  grogueDef: 14,              // pontos a menos nas defesas de quem está grogue
  grogueKO: 2.6,              // multiplica a chance de nocaute (e de knockdown) contra quem está grogue
  grogueDesespero: 1.3,       // quem está grogue e golpeia: nocaute dele vale isto
  danoGrade: 6,               // grogue que só cobriu e foi encurralado na grade: dano dos golpes (o juiz pode parar)
  /* Finalização encaixada: a tentativa que quase entrou fica presa uma troca.
     Quem encaixou escolhe entre apertar (a mesma família da finalização:
     Finalização por cima, Raspar por baixo) e emendar outra (a família que
     ganha da defesa no papel dele: Avançar por cima, Levantar por baixo).
     Quem está preso escolhe entre defender (Defesa) e sair na força
     (qualquer outra). Defender ganha de apertar, emendar ganha de defender,
     sair na força ganha de emendar e perde pra apertar: nenhuma resposta
     óbvia (sem a emenda, defender era sempre a certa e o encaixe não
     pedia leitura nenhuma; medido com as misturas de equilíbrio). */
  encaixeMargem: 0.36,        // tentativa que falhou por menos que isto (no sorteio) encaixa
  encaixeBonus: 22,           // bônus da finalização de quem aperta
  encaixeTroca: 12,           // bônus da finalização emendada contra quem defendeu
  encaixeEscape: 12,          // bônus da defesa na disputa pra escapar de quem aperta
};
/* Quem ganha de quem (o ciclo), por papel: [família de quem ganha, família de quem perde].
   Em pé, os dois têm os mesmos nomes; no chão, por cima x por baixo (CICLO). */
const VENCE = {
  pe: new Set(["golpes>pressao", "pressao>defesa", "defesa>queda", "queda>golpes"]),
  cima: new Set(["golpes>pressao", "queda>pressao", "queda>golpes", "defesa>queda", "pressao>defesa", "pressao>golpes"]),
  baixo: new Set(["queda>golpes", "queda>pressao", "defesa>queda", "pressao>defesa", "pressao>pressao"]),
};
/* Quem leu o outro nesta troca: "a", "b" ou null (par neutro ou espelho). */
export function quemLeu(papeis, acoes) {
  const { a, b } = acoes;
  if (!a || !b) return null;
  if (VENCE[papeis.a].has(`${a}>${b}`)) return "a";
  if (VENCE[papeis.b].has(`${b}>${a}`)) return "b";
  return null;
}

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
      { id: "jab", rotulo: "Jab e direto", frase: "o jab e direto", desc: "Acerta mais e mantém a distância, então a queda dele entra menos. Dano e nocaute menores.", curto: "Acerta mais · menos dano", mod: { acerto: 5, dano: 0.85, ko: 0.7, exposto: -2 } },
      { id: "cruzado", rotulo: "Cruzado", frase: "o cruzado", desc: "Mais dano e mais chance de nocaute. Acerta menos.", curto: "Mais dano e nocaute · acerta menos", mod: { acerto: -6, dano: 1.2, ko: 1.5 } },
      { id: "chute_perna", rotulo: "Chute na perna", frase: "o chute na perna", desc: "Cansa e pode travar a perna dele (a pressão e a queda dele pioram). Nocauteia menos, e a queda dele entra mais.", curto: "Cansa e trava a perna · nocauteia menos", mod: { acerto: 3, dano: 0.95, ko: 0.8, trava: 0.5, cansa: 0.6, exposto: 3 } },
    ],
    queda: [
      { id: "double_leg", rotulo: "Double leg", frase: "o double leg", desc: "A queda pelas duas pernas. Entra um pouco mais que as outras.", curto: "Entra um pouco mais", mod: { acerto: 2 } },
      { id: "single_leg", rotulo: "Single leg", frase: "o single leg", desc: "Gasta menos energia. Marca menos ponto quando entra.", curto: "Gasta menos · marca menos ponto", mod: { custo: -1, pontos: 0.5 } },
      { id: "quadril", rotulo: "Queda de quadril", frase: "a queda de quadril", desc: "Entra menos, mas é boa contra quem pressiona e ruim contra quem golpeia. Quando entra, você já cai na meia-guarda.", curto: "Boa contra quem pressiona", mod: { acerto: -2, vsPressao: 9, vsGolpes: -7, nivel: 1 } },
    ],
    defesa: [
      { id: "guarda_alta", rotulo: "Guarda alta", frase: "a guarda alta", desc: "O golpe dele bate mais na guarda. A queda dele entra mais fácil.", curto: "Segura golpes · a queda entra mais", mod: { guarda: 4, sprawl: -3 } },
      { id: "sprawl", rotulo: "Sprawl", frase: "o sprawl", desc: "Base baixa, segura melhor a queda. O golpe dele passa mais pela guarda.", curto: "Segura a queda · o golpe passa mais", mod: { sprawl: 6, guarda: -4 } },
      { id: "esquiva", rotulo: "Esquiva e contra-ataque", frase: "a esquiva", desc: "Mais chance de contra-atacar quem golpeia. Recupera menos energia.", curto: "Mais contra-ataque · recupera menos", mod: { contra: 0.15, guarda: -1, custo: 1 } },
    ],
    pressao: [
      { id: "grade", rotulo: "Pressionar na grade", frase: "a pressão na grade", desc: "Encurrala na grade e marca ponto, a pressão padrão.", curto: "Pressão padrão, marca ponto", mod: {} },
      { id: "joelhadas", rotulo: "Clinche e joelhadas", frase: "as joelhadas no clinche", desc: "Os golpes curtos machucam mais. Entra pior contra quem golpeia e gasta mais energia.", curto: "Mais dano · gasta mais energia", mod: { dano: 1.6, acerto: -4, custo: 0.5 } },
      { id: "cortar", rotulo: "Cortar o octógono", frase: "o corte do octógono", desc: "Fecha a saída e cansa mais quem defende. Golpes curtos mais fracos.", curto: "Cansa quem defende · golpe fraco", mod: { cansa: 1, dano: 0.5 } },
    ],
  },
  cima: {
    golpes: [
      { id: "gnp", rotulo: "Socos por cima", frase: "os socos por cima", desc: "O ground and pound padrão.", curto: "Ground and pound padrão", mod: {} },
      { id: "cotoveladas", rotulo: "Cotoveladas", frase: "as cotoveladas", desc: "Mais dano e mais chance de nocaute técnico. Acerta menos.", curto: "Mais dano e nocaute · acerta menos", mod: { acerto: -5, dano: 1.3, ko: 1.4 } },
      { id: "marteladas", rotulo: "Marteladas", frase: "as marteladas", desc: "Acerta mais, com menos dano.", curto: "Acerta mais · menos dano", mod: { acerto: 5, dano: 0.8, ko: 0.7 } },
    ],
    queda: [
      { id: "kimura", rotulo: "Kimura", frase: "a kimura", desc: "Finalização que vale igual em qualquer posição.", curto: "Vale igual em qualquer posição", mod: {} },
      { id: "mata_leao", rotulo: "Mata-leão", frase: "o mata-leão", desc: "Forte com você montado, fraca na guarda dele. Melhore a posição antes.", curto: "Forte montado · fraca na guarda", mod: { porNivel: [-8, 0, 8] } },
      { id: "triangulo_braco", rotulo: "Triângulo de braço", frase: "o triângulo de braço", desc: "Melhor na meia-guarda. Na guarda dele, entra pouco.", curto: "Melhor na meia-guarda", mod: { porNivel: [-4, 6, 2] } },
    ],
    defesa: [
      { id: "segurar", rotulo: "Segurar a posição", frase: "o controle por cima", desc: "Segura por cima e marca controle, sem gastar energia.", curto: "Controle sem gastar energia", mod: {} },
      { id: "peso", rotulo: "Pressão de peso", frase: "o peso por cima", desc: "Cansa quem está por baixo. Marca menos ponto de controle.", curto: "Cansa quem está por baixo", mod: { cansa: 0.8, pontos: 0.5 } },
    ],
    pressao: [
      { id: "passar", rotulo: "Passar a guarda", frase: "a passagem de guarda", desc: "Melhora a posição um degrau.", curto: "Melhora a posição um degrau", mod: {} },
      { id: "montada", rotulo: "Ir pra montada", frase: "a montada", desc: "Quando entra, pula direto pra montada. Entra menos.", curto: "Pula pra montada · entra menos", mod: { acerto: -8, nivel: 1 } },
    ],
  },
  baixo: {
    golpes: [
      { id: "golpes_baixo", rotulo: "Golpes por baixo", frase: "os golpes por baixo", desc: "Pouco dano. Atrapalha quem está por cima.", curto: "Pouco dano · atrapalha por cima", mod: {} },
      { id: "cotoveladas_baixo", rotulo: "Cotoveladas por baixo", frase: "as cotoveladas por baixo", desc: "Mais dano, acerta menos.", curto: "Mais dano · acerta menos", mod: { acerto: -4, dano: 1.6 } },
    ],
    queda: [
      { id: "raspagem", rotulo: "Raspagem", frase: "a raspagem", desc: "Inverte a posição com mais facilidade.", curto: "Inverte a posição mais fácil", mod: { acerto: 4 } },
      { id: "triangulo", rotulo: "Triângulo", frase: "o triângulo", desc: "Raspa menos, mas pode emendar uma finalização por baixo.", curto: "Raspa menos · pode finalizar", mod: { acerto: -6, sub: 0.35, subMult: 0.9 } },
    ],
    defesa: [
      { id: "guarda_fechada", rotulo: "Fechar a guarda", frase: "a guarda fechada", desc: "Segura a finalização e recebe menos dano, sem gastar energia.", curto: "Segura finalização · sem gastar", mod: {} },
      { id: "amarrar", rotulo: "Amarrar os braços", frase: "os braços amarrados", desc: "O ground and pound dele entra menos. A passagem dele entra mais.", curto: "Trava o ground and pound dele", mod: { guarda: 6, cede: 6 } },
    ],
    pressao: [
      { id: "levantar", rotulo: "Levantar", frase: "a levantada", desc: "Tenta voltar a ficar em pé.", curto: "Tenta voltar a ficar em pé", mod: {} },
      { id: "pela_grade", rotulo: "Levantar pela grade", frase: "a levantada pela grade", desc: "Usa a grade pra levantar. Entra mais e gasta um pouco mais de energia.", curto: "Levanta mais · gasta um pouco mais", mod: { acerto: 7, custo: 0.5 } },
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
  energia: energiaMax(p), dano: 0, ausentesSeguidas: 0, ultima: null, atingido: false, travado: false, grogue: false,
  total: { golpes: 0, acertos: 0, quedas: 0, quedasTentadas: 0, finalizacoes: 0, knockdowns: 0, controle: 0, contras: 0 },
});
export function novaLuta(perfilA, perfilB) {
  return {
    v: VERSAO_MOTOR, round: 1, troca: 1, pos: "pe", nivelPos: 0, momento: 0, paradoChao: 0, encaixe: null,
    a: ladoNovo(perfilA), b: ladoNovo(perfilB), pontos: [{ a: 0, b: 0 }], cartoes: [], fim: null,
    /* v4: a mão de cada lado no round (contagem por família, pública) */
    mao: { a: maoCheia(), b: maoCheia() },
  };
}
/* Papel de cada lado na posição atual: "pe", "cima" ou "baixo". */
export function papel(estado, lado) {
  if (estado.pos === "pe") return "pe";
  const cima = estado.pos === "cima_a" ? "a" : "b";
  return lado === cima ? "cima" : "baixo";
}
/* Momento decisivo que o lado vive nesta troca, visto por ele, ou null:
   "grogue_eu"/"grogue_ele" (em pé; o grogue no chão segue valendo no motor,
   mas a escolha é a da posição), "enc_cima_eu"/"enc_baixo_eu" (ele encaixou
   a finalização, por cima ou por baixo), "enc_cima_ele"/"enc_baixo_ele" (ele
   está preso). Bot, ferramenta de balanço e tela leem daqui. */
export function momentoDoLado(estado, lado) {
  const o = lado === "a" ? "b" : "a";
  if (estado.encaixe && estado.pos !== "pe") {
    return (papel(estado, lado) === "cima" ? "enc_cima_" : "enc_baixo_") + (estado.encaixe.quem === lado ? "eu" : "ele");
  }
  if (estado.pos !== "pe") return null;
  if (estado[lado].grogue) return "grogue_eu";
  if (estado[o].grogue) return "grogue_ele";
  return null;
}
/* O que a tela mostra no momento decisivo, por família (o efeito dela
   naquela troca, curto pro botão). Conferido contra acertar, trocaEmPe e o
   bloco do encaixe em trocaNoChao. */
const SAIR_NA_FORCA = "Sair na força: escapa se ele emendar, não se apertar.";
const SOLTA = "Solta a finalização.";
const APERTAR = "Apertar: finaliza se ele não defender.", EMENDAR = "Emendar outra: pega ele se ele defender.";
const DEFENDER_PRESO = "Defender: escapa se ele apertar, não se ele emendar.";
export const MOMENTO_DICA = {
  grogue_ele: {
    golpes: "Nocaute bem mais provável se ele não cobrir.",
    queda: "Ganha se ele trocar no desespero.",
    defesa: "Segura se ele tentar a queda.",
    pressao: "Pega ele na grade se ele cobrir. Perde pro golpe.",
  },
  grogue_eu: {
    golpes: "Desespero: ganha da pressão, perde pro golpe.",
    queda: "Agarrar: ganha do golpe, perde pra defesa.",
    defesa: "Cobre e respira. Perde pra pressão na grade.",
    pressao: "Arriscado: perde pro golpe dele.",
  },
  enc_cima_eu: { golpes: SOLTA, queda: APERTAR, defesa: SOLTA, pressao: EMENDAR },
  enc_baixo_eu: { golpes: SOLTA, queda: APERTAR, defesa: SOLTA, pressao: EMENDAR },
  enc_cima_ele: { golpes: SAIR_NA_FORCA, queda: SAIR_NA_FORCA, defesa: DEFENDER_PRESO, pressao: SAIR_NA_FORCA },
  enc_baixo_ele: { golpes: SAIR_NA_FORCA, queda: SAIR_NA_FORCA, defesa: DEFENDER_PRESO, pressao: SAIR_NA_FORCA },
};
/* Duelos de atributo (v3, pra tela): de -2 (vantagem clara dele) a 2
   (vantagem clara sua), só o nível, nunca o número (a build dele é
   privada). Ataque de um contra a defesa do outro, nos dois sentidos; as
   defesas já com o dano (val). Poder: chance de nocaute de cada um
   (poder, queixo e dano, como em acertar). */
export const DUELOS = ["trocacao", "poder", "queda", "chao"];
export const DUELO_DA_ACAO = {
  pe: { golpes: "trocacao", queda: "queda", defesa: null, pressao: "trocacao" },
  cima: { golpes: "chao", queda: "chao", defesa: null, pressao: "chao" },
  baixo: { golpes: "trocacao", queda: "chao", defesa: null, pressao: "chao" },
};
export function duelos(estado, perfis, lado) {
  const o = lado === "a" ? "b" : "a", eu = perfis[lado].atr, ele = perfis[o].atr;
  const def = (atr, l) => perfis[l].atr[atr] - estado[l].dano * K.danoDefesa;
  const nivel = (x, d1, d2) => (x >= d2 ? 2 : x >= d1 ? 1 : x > -d1 ? 0 : x > -d2 ? -1 : -2);
  const ko = (atk, dfs) => Math.pow(perfis[atk].atr.poder / 55, 1.4) * clamp(1.3 - perfis[dfs].atr.queixo / 100, 0.3, 1.2) * Math.pow(estado[dfs].dano / 100 + K.koPiso, K.koExpoente);
  return {
    trocacao: nivel((eu.golpe - def("defesa", o)) - (ele.golpe - def("defesa", lado)), 5, 15),
    poder: nivel(Math.log2(ko(lado, o) / ko(o, lado)), 0.15, 0.5),
    queda: nivel((eu.queda - def("defQueda", o)) - (ele.queda - def("defQueda", lado)), 5, 15),
    chao: nivel((eu.chao - def("defChao", o)) - (ele.chao - def("defChao", lado)), 5, 15),
  };
}
/* As 4 ações do lado agora. Com a semente (o servidor sempre passa), cada
   uma vem com a variante da mão do round: rótulo, efeito e custo dela. */
export function acoesDisponiveis(estado, lado, perfil, semente = null) {
  const pp = papel(estado, lado);
  const mao = semente == null ? null : maoDoRound(semente, estado.round, lado)[pp];
  const mom = momentoDoLado(estado, lado);
  return FAMILIAS.map((f) => {
    const v = mao ? VARIANTE_POR_ID[mao[f]] : null;
    return {
      familia: f, grupo: FAMILIA_NOME[pp][f], ciclo: CICLO[pp][f],
      variante: v ? v.id : null, rotulo: v ? v.rotulo : ROTULOS[pp][f], descricao: v ? v.desc : DESCRICOES[pp][f],
      resumo: v ? (v.curto || v.desc) : DESCRICOES[pp][f],
      custo: custoEnergia(pp, f, perfil, v),
      /* v4: cartas dessa família que ainda restam no round (null sem mão) */
      restam: estado.mao ? estado.mao[lado][f] : null,
      /* v3: o duelo de atributo de que a ação depende e, no momento decisivo, o efeito dela agora */
      duelo: DUELO_DA_ACAO[pp][f], dica: mom ? MOMENTO_DICA[mom][f] : null,
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
  if (atr === "defesa" || atr === "defChao" || atr === "defQueda") {
    v -= s.dano * K.danoDefesa;
    if (ctx.grogue && ctx.grogue[lado] && ctx.acoes[lado] !== "defesa") v -= K.grogueDef;
  }
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
  const base = { golpe: K.danoGolpe, gnp: K.danoGnp, contra: K.danoContra, sujo: K.danoSujo, punicao: K.danoPunicao, baixo: 1.8, grade: K.danoGrade }[tipo];
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
  /* momentos decisivos (v3): contra quem está grogue, o nocaute fica mais
     provável (cobrir segura o golpe, mas não a pressão na grade); quem está
     grogue e golpeia, golpeia no desespero */
  if (ctx.grogue && ctx.grogue[def] && (ctx.acoes[def] !== "defesa" || tipo === "grade")) p *= K.grogueKO;
  if (ctx.grogue && ctx.grogue[atk] && tipo !== "gnp") p *= K.grogueDesespero;
  const x = ctx.r();
  if (x < p) {
    finalizar(ctx, atk, tipo === "gnp" || tipo === "grade" ? "TKO" : "KO", vari);
    return true;
  }
  if (tipo !== "gnp" && tipo !== "grade" && x < p * K.kdFator) {
    e[atk].total.knockdowns++;
    e[def].dano = Math.min(100, e[def].dano + 5);
    pontuar(ctx, atk, K.bonusKD);
    registrar(ctx, "knockdown", atk, vari ? { v: vari.id } : {});
    moverMomento(ctx, atk, 2);
    if (!e[def].grogue) { e[def].grogue = true; registrar(ctx, "grogue", def); }
    return false;
  }
  if (d >= K.grogueDano && !e[def].grogue && (tipo === "golpe" || tipo === "contra" || tipo === "punicao")
    && ctx.r() < K.grogueBase * (d / 10) * fatorQueixo) {
    e[def].grogue = true; registrar(ctx, "grogue", def);
  }
  return false;
}
/* vari: a finalização da mão (por cima, com pontos por posição; por baixo,
   o triângulo); sem ela, a finalização genérica. teto: chance máxima (a
   finalização encaixada aperta mais que a comum). */
function tentarFinalizacao(ctx, atk, bonus, mult, vari = null, teto = 0.75) {
  const e = ctx.estado, def = outro(atk), pa = ctx.perfis[atk], pd = ctx.perfis[def];
  e[atk].total.finalizacoes++;
  pontuar(ctx, atk, K.bonusTentativaSub);
  const cima = papel(e, atk) === "cima";
  const porNivel = vari && vari.mod.porNivel ? vari.mod.porNivel[e.nivelPos] || 0 : 0;
  let x = val(ctx, atk, "chao") + bonus + porNivel + (cima ? e.nivelPos * 8 : -6) - (val(ctx, def, "defChao") + 6);
  let p = K.subBase * Math.pow(sig(x), 2) * mult * (1 + (pa.mec.finalizacao || 0));
  if (!cima) p *= 0.55 + (pa.mec.subDeBaixo || 0) * 2;
  if (e[def].energia <= 3) p *= 1.25 + (pa.mec.finalizacaoCansado || 0);
  p = Math.min(teto, p);
  const sorte = ctx.r();
  if (sorte < p) { finalizar(ctx, atk, "FIN", vari); return true; }
  /* quase: fica encaixada pra troca seguinte (não encaixa duas vezes seguidas) */
  if (!ctx.encaixe && sorte < p + K.encaixeMargem && e.pos !== "pe") {
    e.encaixe = { quem: atk, v: vari ? vari.id : null };
    registrar(ctx, "encaixou", atk, vari ? { v: vari.id } : {});
    return false;
  }
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
  e.pos = "pe"; e.nivelPos = 0; e.encaixe = null;   // a finalização que encaixou nesta troca se desfaz
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
    /* momento decisivo (v3): grogue que só cobriu, encurralado na grade, apanha
       sem responder e o juiz pode parar (cobrir segura o golpe, não a pressão) */
    if (ctx.grogue && ctx.grogue[A]) {
      if (disputa(ctx, val(ctx, B, "golpe") + V, val(ctx, A, "defesa"))) acertar(ctx, B, "grade", 1, 1, vr[B]);
      return;
    }
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
      e.pos = U === "a" ? "cima_a" : "cima_b"; e.nivelPos = 0; e.encaixe = null;
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
  /* ponto de controle de quem segurou por cima; a pressão de peso marca
     menos e cansa quem está embaixo */
  const controle = () => {
    if (!e.fim && e.pos !== "pe" && (e.pos === "cima_a" ? "a" : "b") === T) {
      e[T].total.controle++;
      pontuar(ctx, T, K.bonusControle * (t === "defesa" ? md[T].pontos || 1 : 1));
      if (t === "defesa" && md[T].cansa) e[U].energia = Math.max(0, e[U].energia - md[T].cansa);
    }
  };
  if (!(t === "defesa" && u === "defesa")) e.paradoChao = 0;
  /* finalização encaixada (v3): a troca é a briga pela finalização (ver
     K.encaixeBonus). Apertar e emendar resolvem a troca inteira; soltar
     (Golpes ou Defesa de quem encaixou) desfaz o encaixe e a troca segue
     normal. A finalização apertada é a da mão (vari da troca anterior);
     a emendada é outra, genérica. */
  if (ctx.encaixe) {
    const ea = ctx.encaixe.quem, ed = outro(ea), fa = ctx.acoes[ea], defende = ctx.acoes[ed] === "defesa";
    const vEnc = ctx.encaixe.v ? VARIANTE_POR_ID[ctx.encaixe.v] || null : null;
    if (fa === "queda") {
      if (defende) {
        if (disputa(ctx, val(ctx, ed, "defChao") + K.encaixeEscape, val(ctx, ea, "chao"))) {
          registrar(ctx, "escapou", ed); moverMomento(ctx, ed, 1); return;
        }
        tentarFinalizacao(ctx, ea, K.encaixeBonus - VC * K.guardaContraSub, 1, vEnc, 0.85);
        return;
      }
      const ciclo = VENCE[papel(e, ea)].has(`queda>${ctx.acoes[ed]}`) ? VC : 0;
      tentarFinalizacao(ctx, ea, K.encaixeBonus + ciclo, 1, vEnc, 0.85);
      return;
    }
    if (fa === "pressao") {
      if (defende) {
        registrar(ctx, "emendou", ea);
        if (!tentarFinalizacao(ctx, ea, K.encaixeTroca, 1, null, 0.85)) controle();
        return;
      }
      registrar(ctx, "escapou", ed);   // saiu na força enquanto ele trocava de finalização
    } else registrar(ctx, "soltou", ea);
  }

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
      if (e.paradoChao >= 2) { e.paradoChao = 0; e.pos = "pe"; e.nivelPos = 0; e.encaixe = null; registrar(ctx, "juizLevantou", T); return; }
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
/* O cartão dos juízes pros pontos de um round. Exportada (2026-10-20, placar
   do round ao vivo): a tela mostra o cartão que sairia se o round acabasse
   agora, com esta mesma conta. */
export function cartaoDoRound(pts) {
  const d = pts.a - pts.b;
  if (Math.abs(d) < K.limiteEmpateRound) return { a: 10, b: 10 };
  const [v, p] = d > 0 ? ["a", "b"] : ["b", "a"];
  const perdedor = Math.abs(d) >= K.limite108 && pts[p] <= pts[v] / 3 ? 8 : 9;
  /* sempre {a, b} nessa ordem: é como o banco devolve, e a auditoria compara */
  return v === "a" ? { a: 10, b: perdedor } : { a: perdedor, b: 10 };
}
/* Fecha o round. Devolve o que cada lado guardou de carta (v4) e quanto
   isso rendeu de energia ({a, b}, null pra quem não guardou). */
function fecharRound(estado, perfis) {
  const e = estado, guardou = { a: null, b: null };
  e.cartoes.push(cartaoDoRound(e.pontos[e.round - 1]));
  if (e.round >= FORMATO.rounds) {
    const ta = e.cartoes.reduce((s, c) => s + c.a, 0), tb = e.cartoes.reduce((s, c) => s + c.b, 0);
    e.fim = ta === tb ? { vencedor: null, metodo: "EMPATE", round: e.round, troca: FORMATO.trocasPorRound }
      : { vencedor: ta > tb ? "a" : "b", metodo: "DEC", round: e.round, troca: FORMATO.trocasPorRound };
    e.fim.placar = { a: ta, b: tb };
    return guardou;
  }
  e.round++; e.troca = 1; e.pos = "pe"; e.nivelPos = 0; e.encaixe = null;
  e.momento = Math.trunc(e.momento / 2);
  for (const l of ["a", "b"]) {
    const max = energiaMax(perfis[l]), base = e[l].energia + K.recuperacaoRound + (perfis[l].atr.cardio - 50) / 12;
    /* v4: cada carta guardada vira energia (até o máximo); a mão volta cheia logo abaixo */
    const sobra = e.mao ? cartasNaMao(e.mao[l]) : 0, semCartas = Math.min(max, base);
    e[l].energia = Math.min(max, base + sobra * ESTRATEGIA.energiaPorCartaGuardada);
    if (sobra) guardou[l] = { cartas: sobra, energia: Math.round((e[l].energia - semCartas) * 100) / 100 };
    e[l].travado = false; e[l].grogue = false;
  }
  if (e.mao) e.mao = { a: maoCheia(), b: maoCheia() };
  e.pontos.push({ a: 0, b: 0 });
  return guardou;
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
    /* v4: só vale ação com carta; a sem carta (o servidor recusa antes)
       vira a ação padrão, pra luta nunca travar. Fase 2: quem mostrou a
       postura e perdeu o prazo faz a família do próprio sinal (sem finta) */
    const sinalDele = acoesIn.sinais && acoesIn.sinais[l];
    let fam = ac || (sinalDele && FAMILIAS.includes(sinalDele) && temCarta(estado, l, sinalDele) ? sinalDele : acaoPadrao(estado, l));
    if (ac && !temCarta(estado, l, ac)) { registrar(ctx, "semCarta", l, { fam: ac }); fam = acaoPadrao(estado, l); }
    ctx.acoes[l] = fam;
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
  /* v4: a ação gasta a carta da família (em qualquer posição) */
  if (estado.mao) for (const l of ["a", "b"]) if (estado.mao[l][ctx.acoes[l]] > 0) estado.mao[l][ctx.acoes[l]]--;
  /* variante de cada lado (a de quem faltou é a da ação padrão dele) */
  const papeis = { a: papel(estado, "a"), b: papel(estado, "b") };
  for (const l of ["a", "b"]) {
    const pp = papeis[l], f = ctx.acoes[l];
    const forcada = opcoes && opcoes.mao && opcoes.mao[l] && opcoes.mao[l][pp] && opcoes.mao[l][pp][f];
    const v = (forcada && VARIANTE_POR_ID[forcada] && VARIANTE_POR_ID[forcada].papel === pp && VARIANTE_POR_ID[forcada].familia === f)
      ? VARIANTE_POR_ID[forcada] : varianteDe(semente, estado.round, l, pp, f);
    ctx.var[l] = v; ctx.mod[l] = v.mod;
  }
  registrar(ctx, "escolha", null, { va: ctx.var.a.id, vb: ctx.var.b.id });
  /* momentos decisivos (v3): o grogue e a finalização encaixada da troca
     anterior valem só nesta troca; o que acontecer agora marca a próxima */
  ctx.grogue = { a: !!estado.a.grogue, b: !!estado.b.grogue };
  estado.a.grogue = false; estado.b.grogue = false;
  ctx.encaixe = estado.encaixe && estado.pos !== "pe" ? { ...estado.encaixe } : null;
  estado.encaixe = null;
  for (const l of ["a", "b"]) if (ctx.grogue[l] && ctx.acoes[l] === "defesa") registrar(ctx, "respirou", l);
  /* custo de energia (ação de quem faltou não recupera) */
  for (const l of ["a", "b"]) {
    const c = custoEnergia(papeis[l], ctx.acoes[l], perfis[l], ctx.var[l]);
    if (ausente[l] && c < 0) continue;
    estado[l].energia = clamp(estado[l].energia - c, 0, energiaMax(perfis[l]));
  }
  /* v4, fase 2: sinais. Ação diferente do próprio sinal é finta e custa
     energia (o servidor recusa a finta sem energia antes; aqui, no máximo
     zera). Os dois sinais ficam nos eventos pra a luta ser refeita. */
  if (acoesIn.sinais) {
    const sn = acoesIn.sinais;
    registrar(ctx, "sinais", null, { a: sn.a, b: sn.b });
    for (const l of ["a", "b"]) if (sn[l] && sn[l] !== ctx.acoes[l]) {
      estado[l].energia = Math.max(0, estado[l].energia - ESTRATEGIA.custoFinta);
      registrar(ctx, "finta", l, { sinal: sn[l], fam: ctx.acoes[l], pp: papeis[l] });
    }
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

  /* leitura (v3): quem escolheu a ação que ganha da do outro. Só registro,
     pra tela dizer por que a troca saiu assim; o efeito é K.vantagem e
     K.vantagemChao nas disputas. Pontos e momento a mais por leitura e uma
     sequência de leituras que deixava o outro grogue foram medidos e não
     mudaram nada (ferramentas/jxj-balanco.mjs leitura) */
  if (!estado.fim && !ausente.a && !ausente.b) {
    const leu = quemLeu(papeis, ctx.acoes);
    if (leu) registrar(ctx, "leu", leu, { fam: ctx.acoes[leu], vs: ctx.acoes[outro(leu)] });
  }
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
    if (estado.troca >= FORMATO.trocasPorRound) {
      const guardou = fecharRound(estado, perfis);
      for (const l of ["a", "b"]) if (guardou[l]) registrar(ctx, "guardou", l, guardou[l]);
    }
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
    case "sinais": return "";
    case "finta": return `${q} mostrou ${POSTURAS[ev.sinal]} e fez ${(FAMILIA_NOME[ev.pp] || FAMILIA_NOME.pe)[ev.fam]}.`;
    case "semCarta": return `${q} já tinha usado essa ação no round e fez a ação padrão.`;
    case "guardou": return ev.energia > 0
      ? `${q} guardou ${ev.cartas} ${ev.cartas === 1 ? "ação" : "ações"} e recuperou ${num(ev.energia)} de energia.`
      : `${q} guardou ${ev.cartas} ${ev.cartas === 1 ? "ação" : "ações"}, com a energia cheia.`;
    case "golpe": return fr && !deDefesa ? `${q} acertou ${fr} (${num(ev.dano)} de dano).` : `${q} acertou golpes (${num(ev.dano)} de dano).`;
    case "punicao": return fr ? `${q} acertou ${fr} na entrada da queda de ${o}.` : `${q} acertou ${o} na entrada da queda.`;
    case "contra": return deDefesa ? `${q} esquivou e acertou o contra-ataque.` : `${q} contra-atacou e acertou.`;
    case "sujo": return V && V.id === "joelhadas" ? `${q} acertou joelhadas no clinche.` : `${q} acertou golpes curtos na grade.`;
    case "grade": return V && V.id === "joelhadas" ? `${q} encurralou ${o} na grade e acertou joelhadas sem resposta (${num(ev.dano)} de dano).` : `${q} encurralou ${o} na grade e acertou golpes sem resposta (${num(ev.dano)} de dano).`;
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
    case "grogue": return `${q} ficou grogue.`;
    case "respirou": return `${q} segurou e respirou.`;
    case "encaixou": return V ? `${q} encaixou ${V.frase}. ${o} está preso.` : `${q} encaixou a finalização. ${o} está preso.`;
    case "escapou": return `${q} escapou da finalização.`;
    case "emendou": return `${q} emendou outra finalização.`;
    case "soltou": return `${q} soltou a finalização.`;
    case "leu": return "";
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
    /* estratégia em função: como antes (sem sinais); em objeto (fase 2): sinal e depois ação */
    const sa = typeof estrA === "function" ? null : estrA.sinal(estado, "a", perfilA, rEst);
    const sb = typeof estrB === "function" ? null : estrB.sinal(estado, "b", perfilB, rEst);
    const sinais = sa || sb ? { a: sa, b: sb } : null;
    const acoes = {
      a: typeof estrA === "function" ? estrA(estado, "a", perfilA, rEst) : estrA.acao(estado, "a", perfilA, rEst, sinais),
      b: typeof estrB === "function" ? estrB(estado, "b", perfilB, rEst) : estrB.acao(estado, "b", perfilB, rEst, sinais),
    };
    /* v4 (só simulação): estratégia que pede família sem carta joga uma das que têm */
    for (const l of ["a", "b"]) if (acoes[l]) acoes[l] = familiaNaMao(estado, l, acoes[l], rEst);
    if (sinais) { for (const l of ["a", "b"]) if (!sinais[l]) sinais[l] = acoes[l]; acoes.sinais = sinais; }
    estado = resolverTroca(estado, perfis, acoes, semente, opcoes).estado;
  }
  return estado;
}
