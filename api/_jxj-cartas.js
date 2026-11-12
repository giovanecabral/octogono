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
/* cartas que o lutador pode pôr no deck (a árvore abre mais na fase 4) */
export const cartasLiberadas = (estilo) => Object.keys(CARTAS).filter((id) => !CARTAS[id].estiloExclusivo || CARTAS[id].estiloExclusivo === estilo);

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
