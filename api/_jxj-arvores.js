/* JxJ: estilos, categorias, árvores de habilidade e o perfil de combate
   que sai deles (spec docs/superpowers/specs/2026-10-01-jxj-design.md,
   seções 3 e 5). Dado puro: o servidor (api/jxj.js) valida build e monta
   o perfil com isto; o motor (api/_jxj-motor.js) só lê o perfil pronto.
   O "_" no nome faz a Vercel não publicar como rota.

   Nada aqui vem do motor da carreira: o JxJ tem atributos próprios
   (0 a 100, 50 é mediano) e não usa estatística de lutador real. */

/* Sobe quando muda número que mexe no combate (custo, efeito, perfil).
   Respec fica grátis uma vez por versão nova, e a fila só junta lutadores
   da mesma versão. */
export const VERSAO_BALANCEAMENTO = 1;

export const ATRIBUTOS = ["golpe", "poder", "defesa", "queda", "defQueda", "chao", "defChao", "cardio", "queixo"];
export const NOME_ATRIBUTO = {
  golpe: "Golpe", poder: "Poder", defesa: "Defesa", queda: "Queda", defQueda: "Defesa de queda",
  chao: "Chão", defChao: "Defesa no chão", cardio: "Cardio", queixo: "Queixo",
};

/* Os quatro perfis somam 450 (média 50): estilo é orientação, nunca
   vantagem de soma. */
export const ESTILOS = {
  striker: {
    nome: "Striker", resumo: "Vence em pé: volume, precisão e poder nas mãos e nos chutes.",
    base: { golpe: 57, poder: 58, defesa: 52, queda: 40, defQueda: 57, chao: 38, defChao: 46, cardio: 52, queixo: 50 },
    ramos: ["boxe", "chutes", "pressao"],
  },
  wrestler: {
    nome: "Wrestler", resumo: "Leva a luta pra onde quer: quedas, controle por cima e defesa de queda.",
    base: { golpe: 44, poder: 44, defesa: 45, queda: 61, defQueda: 58, chao: 52, defChao: 46, cardio: 50, queixo: 50 },
    ramos: ["quedas", "controle", "defQuedas"],
  },
  grappler: {
    nome: "Grappler", resumo: "Joga no chão: posição, passagem e finalização. Queda que falha pode virar puxada pra guarda.",
    base: { golpe: 40, poder: 38, defesa: 43, queda: 60, defQueda: 50, chao: 61, defChao: 62, cardio: 46, queixo: 50 },
    /* passiva do estilo: queda que falha pode virar puxada pra guarda (a
       luta vai pro chão com ele por baixo, onde ele raspa e finaliza) */
    mec: { puxarGuarda: 0.4 },
    ramos: ["finalizacoes", "posicoes", "defesaChao"],
  },
  counter: {
    nome: "Counterfighter", resumo: "Lê o adversário, defende e pune o erro com o contra-ataque.",
    base: { golpe: 58, poder: 52, defesa: 56, queda: 42, defQueda: 56, chao: 40, defChao: 46, cardio: 50, queixo: 50 },
    ramos: ["leitura", "defesaCounter", "precisao"],
  },
};
export const ESTILOS_IDS = Object.keys(ESTILOS);

/* Categoria mexe pouco no perfil e soma zero. A lista ATIVA fica no banco
   (jxj_config.categorias_ativas): liberar outra é dado, não migração. */
export const CATEGORIAS = {
  flyweight: { nome: "Peso-mosca", ajuste: { cardio: 5, poder: -4, queixo: -1 } },
  bantamweight: { nome: "Peso-galo", ajuste: { cardio: 5, poder: -3, queixo: -2 } },
  featherweight: { nome: "Peso-pena", ajuste: { cardio: 4, poder: -3, queixo: -1 } },
  lightweight: { nome: "Peso-leve", ajuste: { cardio: 4, poder: -3, queixo: -1 } },
  welterweight: { nome: "Meio-médio", ajuste: { cardio: 2, poder: -1, queixo: -1 } },
  middleweight: { nome: "Peso-médio", ajuste: {} },
  light_heavyweight: { nome: "Meio-pesado", ajuste: { poder: 2, queixo: 1, cardio: -3 } },
  heavyweight: { nome: "Peso-pesado", ajuste: { poder: 4, queixo: 2, cardio: -6 } },
};
export const CATEGORIAS_LANCAMENTO = ["lightweight", "welterweight", "middleweight", "heavyweight"];

/* Teto do retorno decrescente: bônus bruto b vira TETO_BONUS*(1-e^(-b/TETO_BONUS)).
   Atributo final nunca passa de ATRIBUTO_MAX. */
export const TETO_BONUS = 18;
export const ATRIBUTO_MAX = 92;

/* Mecânicas do motor que a árvore liga. Cada uma tem teto próprio (a soma
   de vários nós nunca passa dele). Unidade: fração (0.10 = 10%) ou pontos
   de disputa ("pts"), como diz o motor. */
export const MECANICAS = {
  combinacao: { teto: 0.30, desc: "chance de um golpe extra quando acerta" },
  contra: { teto: 0.40, desc: "chance de contra-atacar quando defende de golpes" },
  contraDano: { teto: 0.50, desc: "dano a mais no contra-ataque" },
  timingKO: { teto: 0.45, desc: "chance a mais de nocaute no contra-ataque" },
  eficienciaGolpe: { teto: 0.9, desc: "energia a menos pra trocar golpes" },
  chuteBaixo: { teto: 0.30, desc: "chance de o golpe acertado travar a próxima queda ou pressão do adversário" },
  chuteCorpo: { teto: 0.9, desc: "energia que o golpe acertado tira do adversário" },
  antiPressao: { teto: 0.35, desc: "chance de sair da pressão na grade" },
  variedade: { teto: 0.6, desc: "corta a leitura do adversário sobre o seu padrão" },
  ritmo: { teto: 0.35, desc: "chance de ganhar momento extra quando vence a troca" },
  golpesNaPressao: { teto: 0.40, desc: "chance de acertar golpes enquanto pressiona" },
  retencaoMomento: { teto: 0.6, desc: "o momento demora mais pra cair" },
  eficienciaOfensiva: { teto: 0.9, desc: "energia a menos pra pressionar" },
  cadeia: { teto: 0.30, desc: "segunda tentativa de queda quando a primeira falha" },
  timingQueda: { teto: 12, desc: "pontos a mais na queda contra golpes e pressão" },
  eficienciaQueda: { teto: 1.2, desc: "energia a menos pra tentar a queda" },
  dominio: { teto: 0.35, desc: "corta a chance de o adversário escapar ou raspar por baixo" },
  transicao: { teto: 12, desc: "pontos a mais pra avançar a posição" },
  gnp: { teto: 0.45, desc: "dano a mais no ground and pound" },
  levantar: { teto: 12, desc: "pontos a mais pra levantar ou sair por baixo" },
  sprawlContra: { teto: 0.30, desc: "chance de contra-atacar quando defende a queda" },
  retornoDistancia: { teto: 1.5, desc: "energia de volta quando defende a queda" },
  finalizacao: { teto: 0.45, desc: "chance a mais de a finalização encaixar" },
  transicaoSub: { teto: 0.30, desc: "chance de emendar a finalização depois de avançar a posição" },
  subDeBaixo: { teto: 0.35, desc: "chance a mais de finalizar por baixo" },
  finalizacaoCansado: { teto: 0.60, desc: "chance a mais de finalizar adversário cansado" },
  passagem: { teto: 12, desc: "pontos a mais pra passar a guarda" },
  retencao: { teto: 0.35, desc: "dano a menos do ground and pound recebido por baixo" },
  raspagem: { teto: 0.30, desc: "chance a mais de raspar por baixo" },
  saida: { teto: 12, desc: "pontos a mais pra escapar por baixo" },
  sobrevivencia: { teto: 0.45, desc: "chance a menos de nocaute técnico no chão" },
  recuperarGuarda: { teto: 0.30, desc: "chance de desfazer a posição do adversário ao defender por baixo" },
  leitura: { teto: 12, desc: "pontos a mais quando o adversário repete a ação" },
  adaptacao: { teto: 10, desc: "pontos de defesa a mais depois de ser atingido" },
  bloqueio: { teto: 0.35, desc: "dano a menos de golpes em pé" },
  recuperacao: { teto: 1.5, desc: "energia a mais quando defende" },
  aproveitamento: { teto: 14, desc: "pontos a mais contra adversário cansado" },
  puxarGuarda: { teto: 0.6, desc: "chance de puxar pra guarda quando a queda falha" },
};

/* Árvores: 4 estilos x 3 ramos x 4 nós (nível 1 a 4 do ramo), cada nó com
   até 3 níveis. Efeito por nível de nó: {a: atributo, v: pontos} ou
   {m: mecânica, v: valor}. Texto concreto, sem frase de efeito. */
const n = (id, nome, desc, efeitos) => ({ id, nome, desc, efeitos });
export const RAMOS = {
  boxe: { estilo: "striker", nome: "Boxe", nos: [
    n("precisao_maos", "Precisão", "Acerta mais na troca em pé.", [{ a: "golpe", v: 1.4 }]),
    n("combinacoes", "Combinações", "Golpe que acerta pode vir com outro atrás.", [{ m: "combinacao", v: 0.082 }]),
    n("contra_maos", "Contra-ataque de mãos", "Quando defende de golpes, pode responder na hora.", [{ m: "contra", v: 0.437 }]),
    n("eficiencia_golpes", "Eficiência de golpes", "Trocar golpes gasta menos energia, e o poder sobe.", [{ m: "eficienciaGolpe", v: 0.2 }, { a: "poder", v: 1 }]),
  ]},
  chutes: { estilo: "striker", nome: "Chutes", nos: [
    n("chute_baixo", "Chutes baixos", "Golpe acertado pode travar a próxima queda ou pressão dele, e a defesa de queda melhora.", [{ m: "chuteBaixo", v: 0.192 }, { a: "defQueda", v: 1.1 }]),
    n("chute_corpo", "Chutes no corpo", "Golpe acertado tira energia do adversário e bate mais forte.", [{ m: "chuteCorpo", v: 0.68 }, { a: "poder", v: 2 }]),
    n("controle_distancia", "Controle de distância", "Defende melhor a queda e sai mais da pressão.", [{ a: "defQueda", v: 1.4 }, { m: "antiPressao", v: 0.027 }]),
    n("variedade", "Variedade de ataques", "O adversário lê menos o seu padrão.", [{ m: "variedade", v: 0.171 }, { a: "golpe", v: 1.1 }]),
  ]},
  pressao: { estilo: "striker", nome: "Pressão", nos: [
    n("controle_ritmo", "Controle de ritmo", "Vencer a troca pode render momento extra, e a defesa melhora.", [{ m: "ritmo", v: 0.219 }, { a: "defesa", v: 1.4 }]),
    n("combinacoes_pressao", "Combinações sob pressão", "Acerta golpes enquanto pressiona na grade, e acerta mais em pé.", [{ m: "golpesNaPressao", v: 0.246 }, { a: "golpe", v: 1.1 }]),
    n("iniciativa", "Manutenção de iniciativa", "O momento demora mais pra cair, e acerta mais em pé.", [{ m: "retencaoMomento", v: 0.513 }, { a: "golpe", v: 1.1 }]),
    n("eficiencia_ofensiva", "Eficiência de energia ofensiva", "Pressionar gasta menos energia, e a defesa melhora.", [{ m: "eficienciaOfensiva", v: 0.68 }, { a: "defesa", v: 1.1 }]),
  ]},
  quedas: { estilo: "wrestler", nome: "Quedas", nos: [
    n("entradas", "Entradas", "Queda mais forte.", [{ a: "queda", v: 0.2 }]),
    n("correntes", "Correntes de queda", "Queda defendida pode virar uma segunda tentativa.", [{ m: "cadeia", v: 0.025 }]),
    n("timing_queda", "Timing", "A queda entra melhor contra quem troca golpes ou pressiona.", [{ m: "timingQueda", v: 1.6 }]),
    n("eficiencia_tentativas", "Eficiência de tentativas", "Tentar a queda gasta menos energia, e o cardio sobe.", [{ m: "eficienciaQueda", v: 0.06 }, { a: "cardio", v: 0.2 }]),
  ]},
  controle: { estilo: "wrestler", nome: "Controle", nos: [
    n("controle_posicional", "Controle posicional", "Jogo por cima mais forte, com mais fôlego.", [{ a: "chao", v: 1.6 }, { a: "cardio", v: 0.1 }]),
    n("dominio", "Manutenção de domínio", "Por cima, o adversário escapa e raspa menos, e o fôlego aumenta.", [{ m: "dominio", v: 0.081 }, { a: "cardio", v: 0.8 }]),
    n("transicoes_controle", "Transições", "Avança a posição com mais facilidade, e a queda melhora.", [{ m: "transicao", v: 5.4 }, { a: "queda", v: 0.4 }]),
    n("pressao_solo", "Pressão no solo", "Ground and pound bate mais forte e acerta mais.", [{ m: "gnp", v: 0.225 }, { a: "poder", v: 2 }, { a: "golpe", v: 1 }]),
  ]},
  defQuedas: { estilo: "wrestler", nome: "Defesa de quedas", nos: [
    n("equilibrio", "Equilíbrio", "Defende melhor a queda.", [{ a: "defQueda", v: 1.1 }]),
    n("recuperacao_posicao", "Recuperação de posição", "Levanta e sai por baixo com mais facilidade, e defende melhor a queda.", [{ m: "levantar", v: 6 }, { a: "defQueda", v: 1.5 }]),
    n("defesa_entradas", "Defesa de entradas", "Queda defendida pode virar contra-ataque, e a defesa de queda melhora.", [{ m: "sprawlContra", v: 0.132 }, { a: "defQueda", v: 1.1 }]),
    n("retorno_distancia", "Retorno à distância", "Defender a queda devolve energia, e a defesa melhora.", [{ m: "retornoDistancia", v: 0.62 }, { a: "defesa", v: 1.8 }]),
  ]},
  finalizacoes: { estilo: "grappler", nome: "Finalizações", nos: [
    n("eficiencia_sub", "Eficiência de submissão", "Finalização encaixa mais, e o jogo de chão fica mais forte.", [{ m: "finalizacao", v: 0.348 }, { a: "chao", v: 2.9 }]),
    n("transicoes_sub", "Transições", "Avançar a posição pode emendar numa finalização.", [{ m: "transicaoSub", v: 0.232 }]),
    n("oportunidades", "Oportunidades de ataque", "Finaliza mais por baixo, com mais fôlego.", [{ m: "subDeBaixo", v: 0.27 }, { a: "cardio", v: 1.2 }]),
    n("especializacao", "Especialização técnica", "Finaliza muito mais adversário cansado.", [{ m: "finalizacaoCansado", v: 0.358 }, { a: "chao", v: 2.6 }]),
  ]},
  posicoes: { estilo: "grappler", nome: "Posições", nos: [
    n("controle_chao", "Controle", "Jogo de chão mais forte.", [{ a: "chao", v: 2.9 }]),
    n("passagens", "Passagens", "Passa a guarda e avança com mais facilidade, e o jogo de chão fica mais forte.", [{ m: "passagem", v: 9.2 }, { a: "chao", v: 2.9 }]),
    n("retencao", "Retenção", "Por baixo, recebe menos dano do ground and pound, e defende melhor a queda.", [{ m: "retencao", v: 0.213 }, { a: "defQueda", v: 2.1 }]),
    n("raspagem", "Recuperação", "Raspa mais por baixo, defende melhor no chão e o fôlego aumenta.", [{ m: "raspagem", v: 0.232 }, { a: "defChao", v: 2.9 }, { a: "cardio", v: 0.6 }]),
  ]},
  defesaChao: { estilo: "grappler", nome: "Defesa", nos: [
    n("defesa_sub", "Defesa de finalização", "Defende melhor no chão, com mais fôlego.", [{ a: "defChao", v: 2.9 }, { a: "cardio", v: 1.7 }]),
    n("saidas", "Saídas", "Escapa por baixo com mais facilidade, e defende melhor a queda.", [{ m: "saida", v: 9 }, { a: "defQueda", v: 2.2 }]),
    n("sobrevivencia", "Sobrevivência posicional", "Corta a chance de nocaute técnico no chão, e o fôlego aumenta.", [{ m: "sobrevivencia", v: 0.348 }, { a: "cardio", v: 2.9 }]),
    n("recuperar_guarda", "Recuperação de guarda", "Defendendo por baixo, pode desfazer a posição dele, e a queda e o queixo melhoram.", [{ m: "recuperarGuarda", v: 0.179 }, { a: "queda", v: 0.5 }, { a: "queixo", v: 1.2 }]),
  ]},
  leitura: { estilo: "counter", nome: "Leitura", nos: [
    n("padroes", "Identificação de padrões", "Pontos a mais quando o adversário repete a ação.", [{ m: "leitura", v: 1.6 }]),
    n("antecipacao", "Antecipação", "Defesa mais forte.", [{ a: "defesa", v: 1.6 }]),
    n("resposta", "Resposta a ataques", "Quando defende de golpes, pode contra-atacar.", [{ m: "contra", v: 0.145 }]),
    n("adaptacao", "Adaptação", "Defesa mais forte, e mais ainda na troca depois de ser atingido.", [{ m: "adaptacao", v: 11.6 }, { a: "defesa", v: 0.9 }]),
  ]},
  defesaCounter: { estilo: "counter", nome: "Defesa", nos: [
    n("evasao", "Evasão", "Defesa mais forte.", [{ a: "defesa", v: 1.6 }]),
    n("bloqueio", "Bloqueio", "Recebe menos dano em pé.", [{ m: "bloqueio", v: 0.116 }]),
    n("gestao_distancia", "Gestão de distância", "Sai mais da pressão na grade e defende melhor a queda.", [{ m: "antiPressao", v: 0.116 }, { a: "defQueda", v: 1.2 }]),
    n("recuperacao_defensiva", "Recuperação defensiva", "Defender devolve mais energia, e o cardio e a defesa de queda melhoram.", [{ m: "recuperacao", v: 1.02 }, { a: "defQueda", v: 1.2 }, { a: "cardio", v: 1.5 }]),
  ]},
  precisao: { estilo: "counter", nome: "Precisão", nos: [
    n("contra_ataques", "Contra-ataques", "Contra-ataque bate mais forte, e o poder sobe.", [{ m: "contraDano", v: 0.261 }, { a: "poder", v: 1.3 }]),
    n("timing", "Timing", "Contra-ataque derruba mais, e o poder sobe.", [{ m: "timingKO", v: 0.29 }, { a: "poder", v: 1.7 }]),
    n("eficiencia_counter", "Eficiência", "Acerta mais na troca em pé.", [{ a: "golpe", v: 1.3 }]),
    n("aproveitamento", "Aproveitamento de oportunidades", "Pontos a mais contra adversário cansado.", [{ m: "aproveitamento", v: 1.6 }, { a: "poder", v: 0.5 }]),
  ]},
};
export const RAMOS_IDS = Object.keys(RAMOS);

/* Regras da árvore */
export const NIVEL_MAX_NO = 3;
export const PONTOS_POR_RAMO_MAX = 10;
export const PEDIDO_POR_TIER = [0, 2, 4, 6];    // pontos já no ramo pra abrir o nó 1, 2, 3, 4
export const CUSTO_PROPRIO = 1, CUSTO_HIBRIDO = 2;
export const TIERS_HIBRIDOS = 2;                // fora do próprio estilo, só os 2 primeiros nós de cada ramo

/* Índice nó -> {ramo, tier} */
export const NOS = {};
for (const [ramoId, ramo] of Object.entries(RAMOS)) {
  ramo.nos.forEach((no, i) => { NOS[no.id] = { ...no, ramo: ramoId, tier: i + 1, estilo: ramo.estilo }; });
}

export const pontosDoNivel = (nivel) => 3 + Math.max(0, Math.min(30, nivel) - 1);

/* Confere uma build ({noId: nivel}) contra o estilo e os pontos do nível.
   Devolve {ok, erro, gasto, porRamo}. A ordem de compra não importa: a
   regra de "pontos já no ramo" vale contra os nós de tier menor do mesmo
   ramo, que é o que a árvore mostra. */
export function validarBuild(estilo, build, nivel) {
  /* só chave própria das tabelas: nome herdado de Object (constructor,
     __proto__...) não é estilo nem habilidade (auditoria de 2026-10-03) */
  if (!Object.hasOwn(ESTILOS, estilo)) return { ok: false, erro: "estilo inválido" };
  if (!build || typeof build !== "object" || Array.isArray(build)) return { ok: false, erro: "build inválida" };
  const porRamo = {};
  let gasto = 0;
  const entradas = Object.entries(build);
  if (entradas.length > 60) return { ok: false, erro: "build inválida" };
  for (const [id, nivelNo] of entradas) {
    const no = Object.hasOwn(NOS, id) ? NOS[id] : null;
    if (!no) return { ok: false, erro: `habilidade desconhecida: ${String(id).slice(0, 40)}` };
    if (!Number.isInteger(nivelNo) || nivelNo < 0 || nivelNo > NIVEL_MAX_NO) return { ok: false, erro: `nível inválido em ${no.nome}` };
    if (nivelNo === 0) continue;
    const proprio = no.estilo === estilo;
    if (!proprio && no.tier > TIERS_HIBRIDOS) return { ok: false, erro: `${no.nome} só abre pra ${ESTILOS[no.estilo].nome}` };
    const custo = (proprio ? CUSTO_PROPRIO : CUSTO_HIBRIDO) * nivelNo;
    gasto += custo;
    porRamo[no.ramo] = (porRamo[no.ramo] || 0) + custo;
  }
  for (const [id, nivelNo] of entradas) {
    if (!nivelNo) continue;
    const no = NOS[id];
    const antes = RAMOS[no.ramo].nos.slice(0, no.tier - 1)
      .reduce((s, x) => s + (build[x.id] || 0) * (x.estilo === estilo ? CUSTO_PROPRIO : CUSTO_HIBRIDO), 0);
    if (antes < PEDIDO_POR_TIER[no.tier - 1]) return { ok: false, erro: `${no.nome} pede ${PEDIDO_POR_TIER[no.tier - 1]} pontos antes no ramo ${RAMOS[no.ramo].nome}` };
  }
  for (const [ramo, p] of Object.entries(porRamo))
    if (p > PONTOS_POR_RAMO_MAX) return { ok: false, erro: `o ramo ${RAMOS[ramo].nome} aceita até ${PONTOS_POR_RAMO_MAX} pontos` };
  const disp = pontosDoNivel(nivel);
  if (gasto > disp) return { ok: false, erro: `a build usa ${gasto} pontos e o nível ${nivel} dá ${disp}` };
  return { ok: true, gasto, porRamo, sobra: disp - gasto };
}

const suave = (bruto, teto) => teto * (1 - Math.exp(-bruto / teto));

/* Perfil que o motor usa: atributos finais (base do estilo + categoria +
   árvore com retorno decrescente, teto ATRIBUTO_MAX) e mecânicas (com
   teto). Build inválida não chega aqui: o servidor valida antes de gravar. */
export function perfilDeCombate({ estilo, categoria, build }) {
  const est = ESTILOS[estilo];
  if (!est) throw new Error("estilo inválido");
  const aj = (CATEGORIAS[categoria] || { ajuste: {} }).ajuste;
  const bonusA = {}, bonusM = { ...(est.mec || {}) };
  for (const [id, nv] of Object.entries(build || {})) {
    const no = NOS[id];
    if (!no || !nv) continue;
    for (const e of no.efeitos) {
      if (e.a) bonusA[e.a] = (bonusA[e.a] || 0) + e.v * nv;
      else bonusM[e.m] = (bonusM[e.m] || 0) + e.v * nv;
    }
  }
  const atr = {};
  for (const k of ATRIBUTOS) {
    const v = est.base[k] + (aj[k] || 0) + suave(bonusA[k] || 0, TETO_BONUS);
    atr[k] = Math.min(ATRIBUTO_MAX, Math.round(v * 10) / 10);
  }
  const mec = {};
  for (const [k, def] of Object.entries(MECANICAS)) {
    const b = bonusM[k] || 0;
    mec[k] = b ? Math.round(suave(b, def.teto) * 1000) / 1000 : 0;
  }
  return { estilo, categoria, atr, mec };
}

/* Build "típica" pra simulação: compra em ordem de prioridade do estilo
   até acabar os pontos do nível. Só pra teste de balanço. */
export const PRIORIDADE_TIPICA = {
  striker: ["precisao_maos", "combinacoes", "chute_baixo", "chute_corpo", "contra_maos", "controle_ritmo", "combinacoes_pressao",
    "eficiencia_golpes", "controle_distancia", "variedade", "iniciativa", "eficiencia_ofensiva"],
  wrestler: ["entradas", "correntes", "controle_posicional", "dominio", "timing_queda", "transicoes_controle", "equilibrio",
    "recuperacao_posicao", "pressao_solo", "eficiencia_tentativas", "defesa_entradas", "retorno_distancia"],
  grappler: ["eficiencia_sub", "controle_chao", "transicoes_sub", "passagens", "defesa_sub", "saidas", "oportunidades",
    "retencao", "especializacao", "raspagem", "sobrevivencia", "recuperar_guarda"],
  counter: ["padroes", "evasao", "antecipacao", "bloqueio", "resposta", "contra_ataques", "gestao_distancia", "timing",
    "adaptacao", "eficiencia_counter", "recuperacao_defensiva", "aproveitamento"],
};
export function buildTipica(estilo, nivel, prioridade = PRIORIDADE_TIPICA[estilo]) {
  const build = {};
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const id of prioridade) {
      if ((build[id] || 0) >= NIVEL_MAX_NO) continue;
      const tent = { ...build, [id]: (build[id] || 0) + 1 };
      if (validarBuild(estilo, tent, nivel).ok) { build[id] = tent[id]; mudou = true; break; }
    }
  }
  return build;
}
