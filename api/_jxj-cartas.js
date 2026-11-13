/* Combate v2 do Online: as cartas, o deck e as passivas (só dados e a
   validação do deck). Pedido do dono, 2026-11-12: trocar a pedra, papel e
   tesoura das 4 famílias por velocidade e prioridade, e a mão por estilo
   por um deck montado pelo jogador. Regras em docs/combat-v2.md; decisões
   em docs/combat-v2-decisions.md. O motor é api/_jxj-combate2.js; este
   arquivo não importa nada.

   Uma carta: id, nome, categoria (golpes, queda, defesa, pressao: a mesma
   chave das famílias de antes, e é ela que a postura mostra), contexto
   (pe, cima, baixo), vel (1 a 5), dano, custo (energia), duelo (os dois
   atributos que mexem nela: o meu e o dele) e efeitos.

   Efeito = dado, nunca código: { quando, condicao, acao }.
   quando:
     contra        reação: se a carta dele casa com a condição, a dele é
                   anulada, em qualquer velocidade (decisão 2)
     se_oponente   quando esta resolve, se a dele casa com a condição
     se_acerta     esta resolveu (não foi anulada, interrompida nem falhou)
     se_interrompe esta interrompeu a dele
     resistente    não é interrompida por golpe de dano base até acao.ateDano
   condicao: { categoria: [...], carta: [...], nivelPos: n (mínimo), grogue: true }
   acao: energia, energiaOponente, anula, iniciativa, multDano, danoExtra,
         vaiProChao, puxaGuarda, finaliza, inverte, levanta, avanca, ateDano */

export const CATEGORIAS_CARTA = ["golpes", "queda", "defesa", "pressao"];
export const NOME_CATEGORIA = { golpes: "Golpe", queda: "Queda", defesa: "Defesa", pressao: "Pressão" };

/* Em pé: as 8 da spec (valores de partida, ajustados na simulação) e as exclusivas de estilo */
export const CARTAS = {
  jab: { nome: "Jab", categoria: "golpes", vel: 5, dano: 1, custo: 1, duelo: ["golpe", "defesa"],
    efeitos: [{ quando: "se_interrompe", acao: { energia: 1 } }] },
  cruzado: { nome: "Cruzado", categoria: "golpes", vel: 3, dano: 3, custo: 2, duelo: ["golpe", "defesa"], efeitos: [] },
  chute_alto: { nome: "Chute alto", categoria: "golpes", vel: 2, dano: 4, custo: 3, duelo: ["golpe", "defesa"],
    efeitos: [{ quando: "resistente", acao: { ateDano: 1 } }] },
  bloqueio: { nome: "Bloqueio", categoria: "defesa", vel: 4, dano: 0, custo: 0, duelo: null,
    efeitos: [{ quando: "contra", condicao: { categoria: ["golpes"] }, acao: { anula: true, energia: 2 } }] },
  contra_ataque: { nome: "Contra-ataque", categoria: "defesa", vel: 3, dano: 2, custo: 2, duelo: ["golpe", "defesa"],
    efeitos: [{ quando: "se_oponente", condicao: { categoria: ["golpes"] }, acao: { multDano: 2 } }] },
  queda: { nome: "Queda", categoria: "queda", vel: 3, dano: 2, custo: 2, duelo: ["queda", "defQueda"],
    efeitos: [{ quando: "se_acerta", acao: { vaiProChao: true } }] },
  antiqueda: { nome: "Antiqueda", categoria: "defesa", vel: 4, dano: 0, custo: 0, duelo: ["defQueda", "queda"],
    efeitos: [{ quando: "contra", condicao: { categoria: ["queda"] }, acao: { anula: true, iniciativa: true } }] },
  clinch: { nome: "Pressão (clinch)", categoria: "pressao", vel: 3, dano: 1, custo: 2, duelo: ["golpe", "defesa"],
    efeitos: [{ quando: "se_oponente", condicao: { categoria: ["defesa"] }, acao: { energiaOponente: -2 } }] },
  /* grappler: o caminho dele pro chão é rápido, mas por baixo (decisão 25). Categoria Pressão:
     puxar a guarda não é queda, e a Antiqueda não segura (com Queda, o wrestler vencia o grappler em 73%) */
  puxar_guarda: { nome: "Puxar guarda", categoria: "pressao", vel: 4, dano: 0, custo: 1, duelo: ["chao", "defChao"], estiloExclusivo: "grappler",
    efeitos: [{ quando: "se_acerta", acao: { puxaGuarda: true } }] },
  /* Fase 4: uma carta nova por estilo, liberada por um nó da árvore (desbloqueio = id do nó) */
  combinacao: { nome: "Combinação", categoria: "golpes", vel: 4, dano: 2, custo: 2, duelo: ["golpe", "defesa"], estiloExclusivo: "striker", desbloqueio: "combinacoes",
    efeitos: [] },
  /* lenta, mas o Jab não para. Com velocidade 3 (a terceira queda do deck, no lugar do Cruzado) valia 17,7 pontos */
  double_leg: { nome: "Double leg", categoria: "queda", vel: 2, dano: 2, custo: 3, duelo: ["queda", "defQueda"], estiloExclusivo: "wrestler", desbloqueio: "correntes",
    efeitos: [{ quando: "se_acerta", acao: { vaiProChao: true } }, { quando: "resistente", acao: { ateDano: 1 } }] },
  /* a queda barata sem dano, que só derruba quem atacou (contra Defesa, nada): a terceira e a
     quarta queda do deck. Como pressão (a Antiqueda não segurava) ou com velocidade 4, o grappler
     do nível 30 com ela ia de 59% a 65%; derrubando sempre, a 57% */
  rasteira: { nome: "Rasteira", categoria: "queda", vel: 3, dano: 0, custo: 1, duelo: ["queda", "defQueda"], estiloExclusivo: "grappler", desbloqueio: "transicoes_sub",
    efeitos: [{ quando: "se_acerta", condicao: { categoria: ["golpes", "pressao", "queda"] }, acao: { vaiProChao: true } }] },
  /* velocidade 3: com 4, o 1 de dano dela interrompia a Queda, e a Esquiva no lugar do Chute alto valia 10 pontos */
  esquiva: { nome: "Esquiva", categoria: "defesa", vel: 3, dano: 1, custo: 1, duelo: ["defesa", "golpe"], estiloExclusivo: "counter", desbloqueio: "padroes",
    efeitos: [{ quando: "contra", condicao: { categoria: ["golpes"] }, acao: { anula: true } }] },
};
for (const [id, c] of Object.entries(CARTAS)) Object.assign(c, { id, contexto: "pe" });

/* No chão a carta da mão joga pela categoria: a de cima ou a de baixo
   dessa categoria (decisão 10). Mesma lógica de velocidade, custo e efeito. */
export const CHAO = {
  cima: {
    golpes: { id: "ground_and_pound", nome: "Ground and pound", vel: 3, dano: 3, custo: 2, duelo: ["chao", "defChao"],
      efeitos: [{ quando: "se_acerta", condicao: { nivelPos: 2 }, acao: { danoExtra: 1 } }] },
    queda: { id: "finalizacao", nome: "Finalização", vel: 2, dano: 0, custo: 2, duelo: ["chao", "defChao"],
      efeitos: [{ quando: "se_acerta", acao: { finaliza: true } }] },
    /* só segura o Levantar (com ele parando Raspar e Levantar, por cima só segurava e ganhava no controle) */
    defesa: { id: "segurar", nome: "Segurar", vel: 4, dano: 0, custo: 0, duelo: null,
      efeitos: [{ quando: "contra", condicao: { categoria: ["pressao"] }, acao: { anula: true, energia: 1 } }] },
    /* passar a guarda também segura a raspagem (sem isso, o Raspar vencia 92% das trocas em que era jogado) */
    pressao: { id: "avancar", nome: "Avançar", vel: 3, dano: 0, custo: 1, duelo: ["chao", "defChao"],
      efeitos: [{ quando: "se_acerta", acao: { avanca: 1 } }, { quando: "contra", condicao: { categoria: ["queda"] }, acao: { anula: true } }] },
  },
  baixo: {
    golpes: { id: "golpes_por_baixo", nome: "Golpes por baixo", vel: 4, dano: 1, custo: 1, duelo: ["chao", "defChao"],
      efeitos: [{ quando: "se_interrompe", acao: { energia: 1 } }] },
    queda: { id: "raspar", nome: "Raspar", vel: 2, dano: 0, custo: 2, duelo: ["chao", "defChao"],
      efeitos: [{ quando: "se_acerta", acao: { inverte: true } }] },
    defesa: { id: "guarda", nome: "Guarda", vel: 4, dano: 0, custo: 0, duelo: null,
      efeitos: [{ quando: "contra", condicao: { categoria: ["golpes"] }, acao: { anula: true, energia: 1 } }] },
    pressao: { id: "levantar", nome: "Levantar", vel: 4, dano: 0, custo: 2, duelo: ["defChao", "chao"],
      efeitos: [{ quando: "se_acerta", acao: { levanta: true } }] },
  },
};
for (const [ctx, cats] of Object.entries(CHAO)) for (const [cat, c] of Object.entries(cats)) Object.assign(c, { categoria: cat, contexto: ctx });
export const CARTA_DO_CHAO = Object.fromEntries(Object.values(CHAO).flatMap((cats) => Object.values(cats).map((c) => [c.id, c])));

/* Passiva de cada estilo: mexe em cartas pelo alvo (carta, categoria ou
   contexto). vel, dano e custo somam; efeitos entram na lista da carta.
   finalizaNivel: a partir de qual posição a Finalização finaliza (o
   padrão é a montada, 2). */
export const PASSIVAS = {
  /* 0,25: com 0,5 e o deck padrão novo, o striker ia a 57% (o Cruzado dele passava do dano do knockdown) */
  striker: { nome: "Mãos pesadas", desc: "Golpes em pé dão 0,25 de dano a mais.",
    mods: [{ alvo: { contexto: "pe", categoria: "golpes" }, dano: 0.25 }] },
  wrestler: { nome: "Entrada barata", desc: "A Queda custa 1 a menos.",
    mods: [{ alvo: { carta: "queda" }, custo: -1 }] },
  grappler: { nome: "Jogo de chão", desc: "Cartas no chão custam 1 a menos, e a Finalização finaliza da guarda.",
    mods: [{ alvo: { contexto: ["cima", "baixo"] }, custo: -1 }], finalizaNivel: 0 },
  counter: { nome: "Leitura", desc: "Bloqueio e Contra-ataque recuperam 1 de energia a mais quando funcionam.",
    mods: [{ alvo: { carta: "bloqueio" }, efeitos: [{ quando: "contra", condicao: { categoria: ["golpes"] }, acao: { energia: 1 } }] },
      { alvo: { carta: "contra_ataque" }, efeitos: [{ quando: "se_acerta", acao: { energia: 1 } }] }] },
};

/* Deck: 12 cartas, até 2 cópias, 4 fixas do estilo + 8 escolhidas */
export const DECK = { tamanho: 12, copias: 2, minDefesa: 2, compra: 5 };
export const FIXAS = {
  striker: ["jab", "cruzado", "cruzado", "chute_alto"],
  wrestler: ["queda", "queda", "clinch", "antiqueda"],
  grappler: ["puxar_guarda", "puxar_guarda", "queda", "antiqueda"],
  counter: ["contra_ataque", "contra_ataque", "bloqueio", "antiqueda"],
};
/* deck pronto de cada estilo (quem não quer montar e o treino guiado) */
export const DECK_PADRAO = {
  /* o do striker sem Antiqueda: com 2, um deck aleatório sem elas vencia o campo em 61,8% (simulação, 2026-11-12) */
  striker: [...FIXAS.striker, "jab", "chute_alto", "bloqueio", "bloqueio", "contra_ataque", "contra_ataque", "clinch", "queda"],
  wrestler: [...FIXAS.wrestler, "clinch", "antiqueda", "bloqueio", "bloqueio", "jab", "jab", "cruzado", "contra_ataque"],
  grappler: [...FIXAS.grappler, "queda", "antiqueda", "bloqueio", "bloqueio", "jab", "jab", "clinch", "contra_ataque"],
  /* com uma Antiqueda: com duas, o counter ficava em 45% depois do striker novo */
  counter: [...FIXAS.counter, "bloqueio", "jab", "jab", "cruzado", "cruzado", "chute_alto", "clinch", "queda"],
};
/* cartas que o lutador pode pôr no deck: as comuns, a exclusiva do estilo e
   as que a árvore libera (build: {noId: nível}) */
export const cartasLiberadas = (estilo, build = {}) => Object.keys(CARTAS).filter((id) => {
  const c = CARTAS[id];
  if (c.estiloExclusivo && c.estiloExclusivo !== estilo) return false;
  return !c.desbloqueio || (build && Number(build[c.desbloqueio]) >= 1);
});

/* A árvore no combate v2 (Fase 4, 2026-11-12). Os nós são os mesmos (mesmo
   id, mesmo custo), mas no combate novo o nó vale só pelo que está aqui: o
   atributo que ele dá fica no combate de antes (decisão 48: o degrau de 15
   pontos da velocidade fazia o mesmo +6 valer 0 num estilo e 7 no outro).
   Quem já gastou pontos recebe na hora o que os nós dele dão (decisão 47).
   Efeito: { desc, apartir (nível do nó, padrão 1), porNivel (multiplica
   pelos níveis a partir de apartir), mod (como a passiva: alvo + vel, dano,
   custo, efeitos; com porNivel, os números dos efeitos também), finta
   (custo da finta a menos), vida, energiaRound (a mais no fim do round) }.
   A carta nova vem pelo desbloqueio da carta. */
const efeito = (quando, acao, condicao) => (condicao ? { quando, condicao, acao } : { quando, acao });
const contraGolpe = (acao) => efeito("contra", acao, { categoria: ["golpes"] });
const contraQueda = (acao) => efeito("contra", acao, { categoria: ["queda"] });
export const ARVORE_V2 = {
  /* striker */
  precisao_maos: [{ desc: "Jab com +0,1 de dano por nível.", porNivel: true, mod: { alvo: { carta: "jab" }, dano: 0.1 } }],
  combinacoes: [{ desc: "Libera a Combinação; +0,25 de dano nela por nível depois do 1.", apartir: 2, porNivel: true, mod: { alvo: { carta: "combinacao" }, dano: 0.25 } }],
  contra_maos: [{ desc: "Contra-ataque com +0,1 de dano por nível.", porNivel: true, mod: { alvo: { carta: "contra_ataque" }, dano: 0.1 } }],
  eficiencia_golpes: [{ desc: "O Cruzado que acerta dá 0,5 ponto a mais por nível.", porNivel: true, mod: { alvo: { carta: "cruzado" }, efeitos: [efeito("se_acerta", { pontos: 0.5 })] } }],
  chute_baixo: [{ desc: "O Chute alto que acerta dá 0,75 ponto a mais por nível.", porNivel: true, mod: { alvo: { carta: "chute_alto" }, efeitos: [efeito("se_acerta", { pontos: 0.75 })] } }],
  chute_corpo: [{ desc: "No nível 2, o Chute alto custa 1 a menos.", apartir: 2, mod: { alvo: { carta: "chute_alto" }, custo: -1 } }],
  controle_distancia: [{ desc: "No nível 2, o Bloqueio também anula a Queda.", apartir: 2, mod: { alvo: { carta: "bloqueio" }, efeitos: [contraQueda({ anula: true })] } }],
  variedade: [{ desc: "Golpe em pé que acerta dá 0,25 ponto a mais por nível.", porNivel: true, mod: { alvo: { contexto: "pe", categoria: "golpes" }, efeitos: [efeito("se_acerta", { pontos: 0.25 })] } }],
  controle_ritmo: [{ desc: "O Bloqueio que anula dá 0,5 ponto a mais por nível.", porNivel: true, mod: { alvo: { carta: "bloqueio" }, efeitos: [contraGolpe({ pontos: 0.5 })] } }],
  combinacoes_pressao: [{ desc: "No nível 2, o clinch fica 1 mais rápido.", apartir: 2, mod: { alvo: { carta: "clinch" }, vel: 1 } }],
  iniciativa: [{ desc: "O Jab que interrompe dá 0,5 ponto a mais por nível.", porNivel: true, mod: { alvo: { carta: "jab" }, efeitos: [efeito("se_interrompe", { pontos: 0.5 })] } }],
  eficiencia_ofensiva: [{ desc: "O clinch que acerta dá 1 ponto a mais por nível.", porNivel: true, mod: { alvo: { carta: "clinch" }, efeitos: [efeito("se_acerta", { pontos: 1 })] } }],
  /* wrestler */
  entradas: [{ desc: "A Queda que acerta dá 0,5 ponto a mais por nível.", porNivel: true, mod: { alvo: { carta: "queda" }, efeitos: [efeito("se_acerta", { pontos: 0.5 })] } }],
  correntes: [{ desc: "Libera o Double leg; no nível 2, ele custa 1 a menos.", apartir: 2, mod: { alvo: { carta: "double_leg" }, custo: -1 } }],
  timing_queda: [{ desc: "Queda com +0,5 de dano por nível.", porNivel: true, mod: { alvo: { carta: "queda" }, dano: 0.5 } }],
  eficiencia_tentativas: [{ desc: "Queda com +0,25 de dano por nível.", porNivel: true, mod: { alvo: { carta: "queda" }, dano: 0.25 } }],
  controle_posicional: [{ desc: "Por cima, a carta que resolve dá 0,75 ponto a mais por nível.", porNivel: true, mod: { alvo: { contexto: "cima" }, efeitos: [efeito("se_acerta", { pontos: 0.75 })] } }],
  dominio: [{ desc: "A pegada por cima (Segurar) também anula a raspagem e dá 0,5 ponto por nível quando anula.", porNivel: true, mod: { alvo: { carta: "segurar" }, efeitos: [contraQueda({ anula: true, pontos: 0.5 })] } }],
  transicoes_controle: [{ desc: "No nível 2, a Queda que acerta já passa pra meia-guarda.", apartir: 2, mod: { alvo: { carta: "queda" }, efeitos: [efeito("se_acerta", { avanca: 1 })] } }],
  pressao_solo: [{ desc: "Por cima, a carta que resolve dá 0,75 ponto a mais por nível.", porNivel: true, mod: { alvo: { contexto: "cima" }, efeitos: [efeito("se_acerta", { pontos: 0.75 })] } }],
  equilibrio: [{ desc: "A Antiqueda que anula dá 0,5 ponto a mais por nível.", porNivel: true, mod: { alvo: { carta: "antiqueda" }, efeitos: [contraQueda({ pontos: 0.5 })] } }],
  recuperacao_posicao: [{ desc: "Vida +1 por nível.", porNivel: true, vida: 1 }],
  defesa_entradas: [{ desc: "A Antiqueda também anula a pressão (clinch, puxada de guarda, rasteira) e dá 0,5 ponto por nível quando anula.", porNivel: true, mod: { alvo: { carta: "antiqueda" }, efeitos: [efeito("contra", { anula: true, pontos: 0.5 }, { categoria: ["pressao"] })] } }],
  retorno_distancia: [{ desc: "O Bloqueio que anula dá 0,5 ponto a mais por nível.", porNivel: true, mod: { alvo: { carta: "bloqueio" }, efeitos: [contraGolpe({ pontos: 0.5 })] } }],
  /* grappler */
  /* a Finalização 2 mais rápida (velocidade 4) empatava com a Guarda e o Levantar: por cima, o grappler finalizava quase sempre */
  eficiencia_sub: [{ desc: "No nível 3, a Finalização fica 1 mais rápida.", apartir: 3, mod: { alvo: { carta: "finalizacao" }, vel: 1 } },
    { desc: "A Queda que acerta dá 0,5 ponto a mais por nível.", porNivel: true, mod: { alvo: { carta: "queda" }, efeitos: [efeito("se_acerta", { pontos: 0.5 })] } }],
  transicoes_sub: [{ desc: "Libera a Rasteira.", mod: null }],
  oportunidades: [{ desc: "A puxada de guarda que acerta dá 0,25 ponto por nível.", porNivel: true, mod: { alvo: { carta: "puxar_guarda" }, efeitos: [efeito("se_acerta", { pontos: 0.25 })] } }],
  especializacao: [{ desc: "O Raspar que acerta dá 1,5 ponto a mais por nível.", porNivel: true, mod: { alvo: { carta: "raspar" }, efeitos: [efeito("se_acerta", { pontos: 1.5 })] } }],
  controle_chao: [{ desc: "Por cima, a carta que resolve dá 0,5 ponto a mais por nível.", porNivel: true, mod: { alvo: { contexto: "cima" }, efeitos: [efeito("se_acerta", { pontos: 0.5 })] } }],
  passagens: [{ desc: "O Avançar que acerta dá 1 ponto a mais por nível.", porNivel: true, mod: { alvo: { carta: "avancar" }, efeitos: [efeito("se_acerta", { pontos: 1 })] } }],
  retencao: [{ desc: "A Guarda também anula o Avançar e dá 1 ponto por nível quando anula.", porNivel: true, mod: { alvo: { carta: "guarda" }, efeitos: [efeito("contra", { anula: true, pontos: 1 }, { categoria: ["pressao"] })] } }],
  raspagem: [{ desc: "Golpes por baixo com +0,4 de dano por nível.", porNivel: true, mod: { alvo: { carta: "golpes_por_baixo" }, dano: 0.4 } }],
  defesa_sub: [{ desc: "Golpes por baixo com +0,4 de dano por nível.", porNivel: true, mod: { alvo: { carta: "golpes_por_baixo" }, dano: 0.4 } }],
  saidas: [{ desc: "O Levantar que acerta dá 1,5 ponto a mais por nível.", porNivel: true, mod: { alvo: { carta: "levantar" }, efeitos: [efeito("se_acerta", { pontos: 1.5 })] } }],
  sobrevivencia: [{ desc: "Por baixo, a carta que resolve dá 0,25 ponto a mais por nível.", porNivel: true, mod: { alvo: { contexto: "baixo" }, efeitos: [efeito("se_acerta", { pontos: 0.25 })] } }],
  recuperar_guarda: [{ desc: "A Antiqueda que anula dá 0,75 ponto a mais por nível.", porNivel: true, mod: { alvo: { carta: "antiqueda" }, efeitos: [contraQueda({ pontos: 0.75 })] } }],
  /* counter */
  padroes: [{ desc: "Libera a Esquiva.", mod: null }],
  antecipacao: [{ desc: "O Bloqueio também anula o clinch e dá 0,5 ponto por nível quando anula.", porNivel: true, mod: { alvo: { carta: "bloqueio" }, efeitos: [efeito("contra", { anula: true, pontos: 0.5 }, { categoria: ["pressao"] })] } }],
  resposta: [{ desc: "Contra-ataque com +0,15 de dano por nível.", porNivel: true, mod: { alvo: { carta: "contra_ataque" }, dano: 0.15 } }],
  adaptacao: [{ desc: "Vida +0,75 por nível.", porNivel: true, vida: 0.75 }],
  evasao: [{ desc: "O Jab que acerta dá 0,15 ponto a mais por nível.", porNivel: true, mod: { alvo: { carta: "jab" }, efeitos: [efeito("se_acerta", { pontos: 0.15 })] } }],
  bloqueio: [{ desc: "O Bloqueio que anula dá 0,5 ponto a mais por nível.", porNivel: true, mod: { alvo: { carta: "bloqueio" }, efeitos: [contraGolpe({ pontos: 0.5 })] } }],
  gestao_distancia: [{ desc: "No nível 2, o Bloqueio também anula a Queda.", apartir: 2, mod: { alvo: { carta: "bloqueio" }, efeitos: [contraQueda({ anula: true })] } }],
  recuperacao_defensiva: [{ desc: "Vida +1 por nível.", porNivel: true, vida: 1 }],
  contra_ataques: [{ desc: "O Contra-ataque que acerta dá 0,5 ponto a mais por nível.", porNivel: true, mod: { alvo: { carta: "contra_ataque" }, efeitos: [efeito("se_acerta", { pontos: 0.5 })] } }],
  timing: [{ desc: "O Cruzado que acerta dá 0,5 ponto a mais por nível.", porNivel: true, mod: { alvo: { carta: "cruzado" }, efeitos: [efeito("se_acerta", { pontos: 0.5 })] } }],
  eficiencia_counter: [{ desc: "Cruzado com +0,1 de dano por nível.", porNivel: true, mod: { alvo: { carta: "cruzado" }, dano: 0.1 } }],
  aproveitamento: [{ desc: "O Jab que interrompe dá 0,25 ponto a mais por nível.", porNivel: true, mod: { alvo: { carta: "jab" }, efeitos: [efeito("se_interrompe", { pontos: 0.25 })] } }],
};
/* com porNivel, os números do efeito multiplicam pelo nível (o ateDano e o avanca, não) */
const ESCALA_EFEITO = ["energia", "energiaOponente", "pontos", "danoExtra"];
const escalarEfeitos = (efs, k) => efs.map((ef) => ({ ...ef, acao: Object.fromEntries(Object.entries(ef.acao).map(([x, v]) => [x, ESCALA_EFEITO.includes(x) ? v * k : v])) }));
/* o que a árvore dá no combate v2 pra esta build: as cartas liberadas, as
   melhorias (mods, como a passiva), a finta a menos, a vida e a energia de
   fim de round a mais */
export function perfilV2(estilo, build = {}) {
  const out = { liberadas: cartasLiberadas(estilo, build), mods: [], fintaMenos: 0, vida: 0, energiaRound: 0 };
  for (const [no, nv] of Object.entries(build || {})) {
    const nivel = Number(nv) || 0;
    for (const ef of ARVORE_V2[no] || []) {
      const ini = ef.apartir || 1;
      if (nivel < ini) continue;
      const k = ef.porNivel ? nivel - ini + 1 : 1;
      if (ef.mod) {
        const m = { ...ef.mod };
        if (m.dano) m.dano *= k;
        if (m.vel) m.vel *= k;
        if (m.custo) m.custo *= k;
        if (m.efeitos && ef.porNivel) m.efeitos = escalarEfeitos(m.efeitos, k);
        out.mods.push(m);
      }
      if (ef.finta) out.fintaMenos += ef.finta * k;
      if (ef.vida) out.vida += ef.vida * k;
      if (ef.energiaRound) out.energiaRound += ef.energiaRound * k;
    }
  }
  return out;
}

/* Validação do deck (o servidor usa esta; o cliente só mostra). Devolve {ok} ou {ok:false, erro}. */
export function validarDeck(estilo, deck, liberadas = cartasLiberadas(estilo)) {
  if (!FIXAS[estilo]) return { ok: false, erro: "estilo inválido" };
  if (!Array.isArray(deck) || deck.length !== DECK.tamanho) return { ok: false, erro: `o deck precisa ter ${DECK.tamanho} cartas` };
  const conta = {};
  for (const id of deck) {
    if (typeof id !== "string" || !Object.hasOwn(CARTAS, id)) return { ok: false, erro: "carta desconhecida" };
    if (!liberadas.includes(id)) return { ok: false, erro: `a carta ${CARTAS[id].nome} não está liberada` };
    conta[id] = (conta[id] || 0) + 1;
    if (conta[id] > DECK.copias) return { ok: false, erro: `no máximo ${DECK.copias} cópias de ${CARTAS[id].nome}` };
  }
  const fixas = {};
  for (const id of FIXAS[estilo]) fixas[id] = (fixas[id] || 0) + 1;
  for (const [id, n] of Object.entries(fixas)) if ((conta[id] || 0) < n) return { ok: false, erro: `faltam as cartas fixas do estilo (${CARTAS[id].nome})` };
  const porCat = {};
  for (const id of deck) porCat[CARTAS[id].categoria] = (porCat[CARTAS[id].categoria] || 0) + 1;
  if ((porCat.defesa || 0) < DECK.minDefesa) return { ok: false, erro: `o deck precisa de ${DECK.minDefesa} cartas de defesa` };
  for (const cat of CATEGORIAS_CARTA) if (!porCat[cat]) return { ok: false, erro: `o deck precisa de uma carta de ${NOME_CATEGORIA[cat]}` };
  return { ok: true };
}
