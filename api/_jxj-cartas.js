/* Combate v2 do Online: as cartas, o deck e as passivas (só dados e a
   validação do deck). Pedido do dono, 2026-11-12: trocar a pedra, papel e
   tesoura das 4 famílias por velocidade e prioridade, e a mão por estilo
   por um deck montado pelo jogador. Regras em docs/combat-v2.md; decisões
   em docs/combat-v2-decisions.md. O motor é api/_jxj-combate2.js; este
   arquivo só importa da árvore (os nós e os andares que o híbrido compra).

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

import { NOS, TIERS_HIBRIDOS } from "./_jxj-arvores.js";

export const CATEGORIAS_CARTA = ["golpes", "queda", "defesa", "pressao"];
export const NOME_CATEGORIA = { golpes: "Golpe", queda: "Queda", defesa: "Defesa", pressao: "Pressão" };
/* Cartas da árvore (2026-11-15, spec docs/superpowers/specs/2026-11-13-cartas-colecao-design.md):
   cada nó libera uma carta. Raridade pelo andar do ramo (1 e 2 rara, 3 épica, 4 lendária); as
   cartas de antes são as comuns. Casa: onde a carta joga como ela mesma (em pé, por cima, por
   baixo); fora dela, joga como a básica da categoria ali. */
export const RARIDADES = ["comum", "rara", "epica", "lendaria"];
export const NOME_RARIDADE = { comum: "comum", rara: "rara", epica: "épica", lendaria: "lendária" };
export const COPIAS = { comum: 2, rara: 2, epica: 1, lendaria: 1 };
/* fora da casa, a carta joga como a básica da categoria ali (em pé: estas; no chão: CHAO) */
export const BASICA_PE = { golpes: "jab", queda: "queda", defesa: "bloqueio", pressao: "clinch" };
/* efeito = { quando, condicao, acao } (o helper deixa o catálogo legível) */
const efeito = (quando, acao, condicao) => (condicao ? { quando, condicao, acao } : { quando, acao });
const E = efeito;
/* estrela 3 que só dá pontos de juiz quando a carta funciona */
const ponto = (quando, v, cond) => ({ efeitos: [E(quando, { pontos: v }, cond)] });

/* Em pé: as 8 da spec (valores de partida, ajustados na simulação) e as exclusivas de estilo */
export const CARTAS = {
  jab: { casa: "pe", raridade: "comum", no: null, estrela3: null, nome: "Jab", categoria: "golpes", vel: 5, dano: 1, custo: 1, duelo: ["golpe", "defesa"],
    efeitos: [{ quando: "se_interrompe", acao: { energia: 1 } }] },
  cruzado: { casa: "pe", raridade: "comum", no: null, estrela3: null, nome: "Cruzado", categoria: "golpes", vel: 3, dano: 3, custo: 2, duelo: ["golpe", "defesa"], efeitos: [] },
  chute_alto: { casa: "pe", raridade: "comum", no: null, estrela3: null, nome: "Chute alto", categoria: "golpes", vel: 2, dano: 4, custo: 3, duelo: ["golpe", "defesa"],
    efeitos: [{ quando: "resistente", acao: { ateDano: 1 } }] },
  bloqueio: { casa: "pe", raridade: "comum", no: null, estrela3: null, nome: "Bloqueio", categoria: "defesa", vel: 4, dano: 0, custo: 0, duelo: null,
    efeitos: [{ quando: "contra", condicao: { categoria: ["golpes"] }, acao: { anula: true, energia: 2 } }] },
  contra_ataque: { casa: "pe", raridade: "comum", no: null, estrela3: null, nome: "Contra-ataque", categoria: "defesa", vel: 3, dano: 2, custo: 2, duelo: ["golpe", "defesa"],
    efeitos: [{ quando: "se_oponente", condicao: { categoria: ["golpes"] }, acao: { multDano: 2 } }] },
  queda: { casa: "pe", raridade: "comum", no: null, estrela3: null, nome: "Queda", categoria: "queda", vel: 3, dano: 2, custo: 2, duelo: ["queda", "defQueda"],
    efeitos: [{ quando: "se_acerta", acao: { vaiProChao: true } }] },
  antiqueda: { casa: "pe", raridade: "comum", no: null, estrela3: null, nome: "Antiqueda", categoria: "defesa", vel: 4, dano: 0, custo: 0, duelo: ["defQueda", "queda"],
    efeitos: [{ quando: "contra", condicao: { categoria: ["queda"] }, acao: { anula: true, iniciativa: true } }] },
  clinch: { casa: "pe", raridade: "comum", no: null, estrela3: null, nome: "Pressão (clinch)", categoria: "pressao", vel: 3, dano: 1, custo: 2, duelo: ["golpe", "defesa"],
    efeitos: [{ quando: "se_oponente", condicao: { categoria: ["defesa"] }, acao: { energiaOponente: -2 } }] },
  /* grappler: o caminho dele pro chão é rápido, mas por baixo (decisão 25). Categoria Pressão:
     puxar a guarda não é queda, e a Antiqueda não segura (com Queda, o wrestler vencia o grappler em 73%) */
  puxar_guarda: { casa: "pe", raridade: "comum", no: null, estrela3: null, nome: "Puxar guarda", categoria: "pressao", vel: 4, dano: 0, custo: 1, duelo: ["chao", "defChao"], estiloExclusivo: "grappler",
    efeitos: [{ quando: "se_acerta", acao: { puxaGuarda: true } }] },
  /* ---- as cartas da árvore: uma por nó (no = id do nó) ---- */
  /* striker */
  direto: { nome: "Direto", categoria: "golpes", casa: "pe", raridade: "rara", no: "precisao_maos", vel: 4, dano: 2, custo: 1, duelo: ["golpe", "defesa"], efeitos: [], estrela3: { efeitos: [E("se_interrompe", { energia: 1 })] } },
  combinacao: { nome: "Combinação", categoria: "golpes", casa: "pe", raridade: "rara", no: "combinacoes", vel: 4, dano: 2, custo: 2, duelo: ["golpe", "defesa"], efeitos: [E("se_interrompe", { danoExtra: 1 })], estrela3: ponto("se_acerta", 0.5) },
  contragolpe: { nome: "Contragolpe", categoria: "defesa", casa: "pe", raridade: "epica", no: "contra_maos", vel: 3, dano: 2, custo: 2, duelo: ["defesa", "golpe"], efeitos: [E("contra", { anula: true }, { categoria: ["golpes"] })], estrela3: { efeitos: [E("contra", { energia: 1 }, { categoria: ["golpes"] })] } },
  overhand: { nome: "Overhand", categoria: "golpes", casa: "pe", raridade: "lendaria", no: "eficiencia_golpes", vel: 2, dano: 4, custo: 3, duelo: ["golpe", "defesa"], inanulavel: true, efeitos: [], estrela3: ponto("se_acerta", 1) },
  chute_perna: { nome: "Chute na perna", categoria: "golpes", casa: "pe", raridade: "rara", no: "chute_baixo", vel: 4, dano: 1, custo: 1, duelo: ["golpe", "defesa"], efeitos: [E("se_acerta", { lentoProxima: true })], estrela3: ponto("se_acerta", 0.5) },
  chute_corpo: { nome: "Chute no corpo", categoria: "golpes", casa: "pe", raridade: "rara", no: "chute_corpo", vel: 3, dano: 3, custo: 2, duelo: ["golpe", "defesa"], efeitos: [E("se_acerta", { energiaOponente: -2 })], estrela3: { efeitos: [E("se_acerta", { energiaOponente: -1 })] } },
  chute_frontal: { nome: "Chute frontal", categoria: "defesa", casa: "pe", raridade: "epica", no: "controle_distancia", vel: 4, dano: 1, custo: 1, duelo: ["golpe", "defesa"], efeitos: [E("contra", { anula: true }, { categoria: ["pressao", "queda"] })], estrela3: { efeitos: [E("contra", { iniciativa: true }, { categoria: ["pressao", "queda"] })] } },
  chute_rodado: { nome: "Chute rodado", categoria: "golpes", casa: "pe", raridade: "lendaria", no: "variedade", vel: 1, dano: 5, custo: 3, duelo: ["golpe", "defesa"], efeitos: [E("resistente", { ateDano: 3 })], estrela3: ponto("se_acerta", 1) },
  passo_lateral: { nome: "Passo lateral", categoria: "defesa", casa: "pe", raridade: "rara", no: "controle_ritmo", vel: 5, dano: 0, custo: 0, duelo: null, efeitos: [E("contra", { anula: true }, { categoria: ["golpes"], danoMin: 3 })], estrela3: { efeitos: [E("contra", { energia: 1 }, { categoria: ["golpes"], danoMin: 3 })] } },
  joelhada: { nome: "Joelhada no clinch", categoria: "pressao", casa: "pe", raridade: "rara", no: "combinacoes_pressao", vel: 3, dano: 2, custo: 2, duelo: ["golpe", "defesa"], efeitos: [E("se_oponente", { danoExtra: 1 }, { categoria: ["defesa"] })], estrela3: { efeitos: [E("se_acerta", { energiaOponente: -1 })] } },
  cotovelada: { nome: "Cotovelada", categoria: "golpes", casa: "pe", raridade: "epica", no: "iniciativa", vel: 3, dano: 3, custo: 2, duelo: ["golpe", "defesa"], efeitos: [E("se_acerta", { sangra: true })], estrela3: ponto("se_acerta", 0.5) },
  superman: { nome: "Superman punch", categoria: "golpes", casa: "pe", raridade: "lendaria", no: "eficiencia_ofensiva", vel: 5, dano: 3, custo: 3, duelo: ["golpe", "defesa"], efeitos: [E("ao_jogar", { danoProprio: 2 }, { categoria: ["defesa"] })], estrela3: { efeitos: [E("resistente", { ateDano: 1 })] } },
  /* wrestler */
  single_leg: { nome: "Single leg", categoria: "queda", casa: "pe", raridade: "rara", no: "entradas", vel: 3, dano: 1, custo: 1, duelo: ["queda", "defQueda"], efeitos: [E("se_acerta", { vaiProChao: true })], estrela3: { efeitos: [E("resistente", { ateDano: 1 })] } },
  /* lenta, mas o Jab não para. Com velocidade 3 (a terceira queda do deck, no lugar do Cruzado) valia 17,7 pontos */
  double_leg: { nome: "Double leg", categoria: "queda", casa: "pe", raridade: "rara", no: "correntes", vel: 2, dano: 2, custo: 3, duelo: ["queda", "defQueda"], estrela3: { efeitos: [E("se_acerta", { avanca: 1 })] },
    efeitos: [{ quando: "se_acerta", acao: { vaiProChao: true } }, { quando: "resistente", acao: { ateDano: 1 } }] },
  queda_contragolpe: { nome: "Queda no contragolpe", categoria: "queda", casa: "pe", raridade: "epica", no: "timing_queda", vel: 3, dano: 2, custo: 2, duelo: ["queda", "defQueda"], efeitos: [E("se_acerta", { vaiProChao: true }), E("resistente", { ateDano: 3 }, { categoria: ["golpes"] })], estrela3: ponto("se_acerta", 1) },
  suplex: { nome: "Suplex", categoria: "queda", casa: "pe", raridade: "lendaria", no: "eficiencia_tentativas", vel: 2, dano: 3, custo: 3, duelo: ["queda", "defQueda"], efeitos: [E("se_acerta", { vaiProChao: true, grogue: true })], estrela3: { efeitos: [E("se_acerta", { avanca: 1 })] } },
  peso_ombro: { nome: "Peso do ombro", categoria: "defesa", casa: "cima", raridade: "rara", no: "controle_posicional", vel: 4, dano: 0, custo: 0, duelo: null, efeitos: [E("contra", { anula: true }, { categoria: ["pressao", "queda"] })], estrela3: ponto("contra", 0.5, { categoria: ["pressao", "queda"] }) },
  cotovelada_cima: { nome: "Cotovelada por cima", categoria: "golpes", casa: "cima", raridade: "rara", no: "dominio", vel: 4, dano: 2, custo: 1, duelo: ["chao", "defChao"], efeitos: [], estrela3: { efeitos: [E("se_acerta", { danoExtra: 1 }, { nivelPos: 2 })] } },
  passagem_joelho: { nome: "Passagem de joelho", categoria: "pressao", casa: "cima", raridade: "epica", no: "transicoes_controle", vel: 4, dano: 0, custo: 1, duelo: ["chao", "defChao"], efeitos: [E("se_acerta", { avanca: 2 })], estrela3: { efeitos: [E("contra", { anula: true }, { categoria: ["queda"] })] } },
  martelada: { nome: "Martelada", categoria: "golpes", casa: "cima", raridade: "lendaria", no: "pressao_solo", vel: 3, dano: 3, custo: 3, duelo: ["chao", "defChao"], efeitos: [E("se_acerta", { nocauteSe: { fracao: 0.5 } }, { nivelPos: 2 })], estrela3: { dano: 0.5 } },
  sprawl: { nome: "Sprawl", categoria: "defesa", casa: "pe", raridade: "rara", no: "equilibrio", vel: 4, dano: 0, custo: 0, duelo: null, efeitos: [E("contra", { anula: true, pontos: 1 }, { categoria: ["queda"] })], estrela3: { efeitos: [E("contra", { energia: 1 }, { categoria: ["queda"] })] } },
  levantada_tecnica: { nome: "Levantada técnica", categoria: "pressao", casa: "baixo", raridade: "rara", no: "recuperacao_posicao", vel: 5, dano: 0, custo: 1, duelo: ["defChao", "chao"], efeitos: [E("se_acerta", { levanta: true })], estrela3: ponto("se_acerta", 0.5) },
  contra_queda: { nome: "Contra-queda", categoria: "defesa", casa: "pe", raridade: "epica", no: "defesa_entradas", vel: 4, dano: 0, custo: 1, duelo: null, efeitos: [E("contra", { anula: true, poeEmCima: true }, { categoria: ["queda"] })], estrela3: ponto("contra", 1, { categoria: ["queda"] }) },
  bodylock: { nome: "Bodylock", categoria: "pressao", casa: "pe", raridade: "lendaria", no: "retorno_distancia", vel: 3, dano: 0, custo: 2, duelo: ["queda", "defQueda"], efeitos: [E("se_acerta", { vaiProChao: true, nivel: 1 }, { categoria: ["golpes", "pressao"] })], estrela3: ponto("se_acerta", 1, { categoria: ["golpes", "pressao"] }) },
  /* grappler */
  kimura: { nome: "Kimura", categoria: "queda", casa: "cima", raridade: "rara", no: "eficiencia_sub", vel: 3, dano: 0, custo: 2, duelo: ["chao", "defChao"], efeitos: [E("se_acerta", { finaliza: true })], estrela3: { custo: -1 } },
  /* a queda barata sem dano, que só derruba quem atacou (contra Defesa, nada): a terceira e a
     quarta queda do deck. Como pressão (a Antiqueda não segurava) ou com velocidade 4, o grappler
     do nível 30 com ela ia de 59% a 65%; derrubando sempre, a 57% */
  rasteira: { nome: "Rasteira", categoria: "queda", casa: "pe", raridade: "rara", no: "transicoes_sub", vel: 3, dano: 0, custo: 1, duelo: ["queda", "defQueda"], estrela3: ponto("se_acerta", 0.5, { categoria: ["golpes", "pressao", "queda"] }),
    efeitos: [{ quando: "se_acerta", condicao: { categoria: ["golpes", "pressao", "queda"] }, acao: { vaiProChao: true } }] },
  triangulo: { nome: "Triângulo", categoria: "queda", casa: "baixo", raridade: "epica", no: "oportunidades", vel: 2, dano: 0, custo: 2, duelo: ["chao", "defChao"], efeitos: [E("se_acerta", { finaliza: true, porBaixo: true })], estrela3: { vel: 1 } },
  mata_leao: { nome: "Mata-leão", categoria: "queda", casa: "pe", raridade: "lendaria", no: "especializacao", vel: 3, dano: 0, custo: 3, duelo: ["queda", "defQueda"], efeitos: [E("se_acerta", { finalizaSe: { grogue: true }, vaiProChao: true, nivel: 2 })], estrela3: { efeitos: [E("se_acerta", { finalizaSe: { cansado: true } })] } },
  cem_quilos: { nome: "Cem quilos", categoria: "defesa", casa: "cima", raridade: "rara", no: "controle_chao", vel: 4, dano: 0, custo: 0, duelo: null, efeitos: [E("contra", { anula: true }, { categoria: ["golpes", "pressao"] })], estrela3: ponto("contra", 0.5, { categoria: ["golpes", "pressao"] }) },
  passagem_guarda: { nome: "Passagem de guarda", categoria: "pressao", casa: "cima", raridade: "rara", no: "passagens", vel: 3, dano: 0, custo: 1, duelo: ["chao", "defChao"], efeitos: [E("se_acerta", { avanca: 2 })], estrela3: ponto("se_acerta", 0.5) },
  guarda_fechada: { nome: "Guarda fechada", categoria: "defesa", casa: "baixo", raridade: "epica", no: "retencao", vel: 4, dano: 0, custo: 0, duelo: null, efeitos: [E("contra", { anula: true, energia: 1 }, { categoria: ["golpes", "pressao"] })], estrela3: ponto("contra", 0.5, { categoria: ["golpes", "pressao"] }) },
  raspagem_gancho: { nome: "Raspagem de gancho", categoria: "queda", casa: "baixo", raridade: "lendaria", no: "raspagem", vel: 4, dano: 0, custo: 2, duelo: ["chao", "defChao"], efeitos: [E("se_acerta", { inverte: true, nivel: 2 })], estrela3: ponto("se_acerta", 1) },
  defesa_finalizacao: { nome: "Defesa de finalização", categoria: "defesa", casa: "baixo", raridade: "rara", no: "defesa_sub", vel: 4, dano: 0, custo: 0, duelo: null, efeitos: [E("contra", { anula: true }, { categoria: ["queda"] })], estrela3: { efeitos: [E("contra", { recua: true }, { categoria: ["queda"] })] } },
  fuga_quadril: { nome: "Fuga de quadril", categoria: "pressao", casa: "baixo", raridade: "rara", no: "saidas", vel: 4, dano: 0, custo: 1, duelo: ["defChao", "chao"], efeitos: [E("se_acerta", { levanta: true })], estrela3: ponto("se_acerta", 0.5) },
  recomposicao: { nome: "Recomposição", categoria: "pressao", casa: "baixo", raridade: "epica", no: "sobrevivencia", vel: 4, dano: 0, custo: 1, duelo: ["defChao", "chao"], efeitos: [E("se_acerta", { recua: true, iniciativa: true })], estrela3: { efeitos: [E("se_acerta", { energia: 1 })] } },
  berimbolo: { nome: "Berimbolo", categoria: "queda", casa: "baixo", raridade: "lendaria", no: "recuperar_guarda", vel: 3, dano: 0, custo: 2, duelo: ["chao", "defChao"], efeitos: [E("se_acerta", { inverte: true, grogue: true })], estrela3: ponto("se_acerta", 1) },
  /* counter */
  /* velocidade 3: com 4, o 1 de dano dela interrompia a Queda, e a Esquiva no lugar do Chute alto valia 10 pontos */
  esquiva: { nome: "Esquiva", categoria: "defesa", casa: "pe", raridade: "rara", no: "padroes", vel: 3, dano: 1, custo: 1, duelo: ["defesa", "golpe"], estrela3: ponto("contra", 0.5, { categoria: ["golpes"] }),
    efeitos: [{ quando: "contra", condicao: { categoria: ["golpes"] }, acao: { anula: true } }] },
  leitura_queda: { nome: "Leitura de queda", categoria: "defesa", casa: "pe", raridade: "rara", no: "antecipacao", vel: 4, dano: 0, custo: 0, duelo: null, efeitos: [E("contra", { anula: true, iniciativa: true }, { categoria: ["queda", "pressao"] })], estrela3: ponto("contra", 0.5, { categoria: ["queda", "pressao"] }) },
  contra_esquerda: { nome: "Contra de esquerda", categoria: "defesa", casa: "pe", raridade: "epica", no: "resposta", vel: 4, dano: 2, custo: 2, duelo: ["defesa", "golpe"], efeitos: [E("se_oponente", { multDano: 2 }, { categoria: ["golpes"] })], estrela3: { efeitos: [E("resistente", { ateDano: 1 })] } },
  leitura_total: { nome: "Leitura total", categoria: "defesa", casa: "pe", raridade: "lendaria", no: "adaptacao", vel: 3, dano: 0, custo: 2, duelo: null, efeitos: [E("contra", { anula: true }, { categoria: ["golpes", "queda", "defesa", "pressao"] })], estrela3: { efeitos: [E("contra", { energia: 1 }, { categoria: ["golpes", "queda", "defesa", "pressao"] })] } },
  pendulo: { nome: "Pêndulo", categoria: "defesa", casa: "pe", raridade: "rara", no: "evasao", vel: 5, dano: 0, custo: 0, duelo: null, efeitos: [E("contra", { anula: true }, { categoria: ["golpes"], danoMax: 2 })], estrela3: ponto("contra", 0.5, { categoria: ["golpes"], danoMax: 2 }) },
  guarda_alta: { nome: "Guarda alta", categoria: "defesa", casa: "pe", raridade: "rara", no: "bloqueio", vel: 4, dano: 0, custo: 0, duelo: null, efeitos: [E("contra", { anula: true, energiaOponente: -1 }, { categoria: ["golpes"] })], estrela3: ponto("contra", 0.5, { categoria: ["golpes"] }) },
  saida_lado: { nome: "Saída de lado", categoria: "defesa", casa: "pe", raridade: "epica", no: "gestao_distancia", vel: 4, dano: 0, custo: 1, duelo: null, efeitos: [E("contra", { anula: true, rapidoProxima: true }, { categoria: ["pressao", "queda"] })], estrela3: ponto("contra", 0.5, { categoria: ["pressao", "queda"] }) },
  segundo_folego: { nome: "Segundo fôlego", categoria: "defesa", casa: "pe", raridade: "lendaria", no: "recuperacao_defensiva", vel: 3, dano: 0, custo: 0, duelo: null, efeitos: [E("contra", { anula: true, energia: 3, tiraGrogue: true }, { categoria: ["golpes"] }), E("se_acerta", { tiraGrogue: true })], estrela3: ponto("contra", 1, { categoria: ["golpes"] }) },
  contra_corpo: { nome: "Contra no corpo", categoria: "defesa", casa: "pe", raridade: "rara", no: "contra_ataques", vel: 3, dano: 2, custo: 2, duelo: ["defesa", "golpe"], efeitos: [E("se_oponente", { multDano: 2, energiaOponente: -2 }, { categoria: ["golpes"] })], estrela3: ponto("se_acerta", 0.5) },
  cruzado_contra: { nome: "Cruzado de contra", categoria: "golpes", casa: "pe", raridade: "rara", no: "timing", vel: 3, dano: 3, custo: 2, duelo: ["golpe", "defesa"], efeitos: [E("se_oponente", { danoExtra: 1 }, { categoria: ["pressao", "queda"] })], estrela3: ponto("se_acerta", 0.5) },
  uppercut: { nome: "Uppercut", categoria: "golpes", casa: "pe", raridade: "epica", no: "eficiencia_counter", vel: 3, dano: 3, custo: 2, duelo: ["golpe", "defesa"], efeitos: [E("se_oponente", { multDano: 2 }, { categoria: ["queda", "pressao"] })], estrela3: ponto("se_acerta", 0.5) },
  misericordia: { nome: "Golpe de misericórdia", categoria: "golpes", casa: "pe", raridade: "lendaria", no: "aproveitamento", vel: 4, dano: 2, custo: 2, duelo: ["golpe", "defesa"], efeitos: [E("se_acerta", { nocauteSe: { grogue: true, vidaAte: 3 } })], estrela3: { dano: 0.5 } },
};
for (const [id, c] of Object.entries(CARTAS)) Object.assign(c, { id, contexto: c.casa });
/* a carta de cada nó da árvore */
export const CARTA_DO_NO = Object.fromEntries(Object.values(CARTAS).filter((c) => c.no).map((c) => [c.no, c.id]));

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
/* quantas cópias de uma carta cabem num deck: o ponto único (validação, busca de deck, bot, simulação e a tela, que
   recebe o número nas definições). Carta da árvore de chão (casa cima ou baixo) e finalização da árvore (inclusive a
   de pé, como o Mata-leão): 1, qualquer que seja a raridade (decisão 90). As outras seguem a raridade. */
export function copiasDe(id) {
  const c = CARTAS[id];
  if (!c) return 0;
  if (c.no && (c.casa === "cima" || c.casa === "baixo" || (c.efeitos || []).some((e) => e.acao && e.acao.finaliza))) return 1;
  return COPIAS[c.raridade] || DECK.copias;
}
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
/* cartas que o lutador pode pôr no deck: as comuns (a exclusiva só no estilo dela) e a do
   nó que ele tem. Híbrido (nó de outro estilo) só nos andares que a árvore deixa: a build
   forjada com andar alto de outro estilo não libera a carta */
export function cartasLiberadas(estilo, build = {}) {
  return Object.keys(CARTAS).filter((id) => {
    const c = CARTAS[id];
    if (!c.no) return !c.estiloExclusivo || c.estiloExclusivo === estilo;
    const nv = Number((build || {})[c.no]) || 0, no = NOS[c.no];
    if (nv < 1 || !no) return false;
    return no.estilo === estilo || no.tier <= TIERS_HIBRIDOS;
  });
}
/* estrelas da carta da árvore: o nível do nó (1 a 3) */
export function estrelasDe(build = {}) {
  const out = {};
  for (const [no, nv] of Object.entries(build || {})) {
    const n = Math.min(3, Number(nv) || 0);
    if (n >= 1 && CARTA_DO_NO[no]) out[CARTA_DO_NO[no]] = n;
  }
  return out;
}
/* o que a árvore dá no combate v2: as cartas liberadas e as estrelas de cada uma */
export const perfilV2 = (estilo, build = {}) => ({ liberadas: cartasLiberadas(estilo, build), estrelas: estrelasDe(build) });

/* Validação do deck (o servidor usa esta; o cliente só mostra). Devolve {ok} ou {ok:false, erro}. */
export function validarDeck(estilo, deck, liberadas = cartasLiberadas(estilo)) {
  if (!FIXAS[estilo]) return { ok: false, erro: "estilo inválido" };
  if (!Array.isArray(deck) || deck.length !== DECK.tamanho) return { ok: false, erro: `o deck precisa ter ${DECK.tamanho} cartas` };
  const conta = {};
  for (const id of deck) {
    if (typeof id !== "string" || !Object.hasOwn(CARTAS, id)) return { ok: false, erro: "carta desconhecida" };
    if (!liberadas.includes(id)) return { ok: false, erro: `a carta ${CARTAS[id].nome} não está liberada` };
    conta[id] = (conta[id] || 0) + 1;
    const max = copiasDe(id);
    if (conta[id] > max) return { ok: false, erro: `no máximo ${max} ${max === 1 ? "cópia" : "cópias"} de ${CARTAS[id].nome}` };
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
