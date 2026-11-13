/* Combate v2 no servidor (Fase 3, 2026-11-12): as peças que api/jxj.js
   usa nas lutas do combate novo (estado.cv === 2). O motor é
   api/_jxj-combate2.js; as cartas, api/_jxj-cartas.js. Luta da v1 nunca
   passa por aqui. Regras: docs/combat-v2.md. */
import * as C2 from "./_jxj-combate2.js";
import * as C from "./_jxj-cartas.js";
import { POSTURAS } from "./_jxj-estrategia.js";

export const ehV2 = (estado) => !!estado && estado.cv === C2.VERSAO_COMBATE;
const outro = (l) => (l === "a" ? "b" : "a");
const num = (x) => String(Math.round(x * 10) / 10).replace(".", ",");

/* o deck do lutador: o que ele montou, se ainda vale; senão o padrão do estilo */
export function deckDo(l) {
  const d = l && Array.isArray(l.deck) ? l.deck : null;
  if (d && C.validarDeck(l.estilo, d).ok) return d.slice();
  return C.DECK_PADRAO[l.estilo].slice();
}
export const comDeck = (perfil, l) => ({ ...perfil, deck: deckDo(l) });
export const novaLuta = (perfis, semente) => C2.novaLuta2(perfis.a, perfis.b, semente);
/* a postura de quem não mandou: a categoria da carta que jogaria sozinha (a defesa da mão) */
export const posturaPadrao = (estado, lado) => C.CARTAS[C2.cartaPadrao(estado.mao[lado])].categoria;
export const naMao = (estado, lado, carta) => typeof carta === "string" && Object.hasOwn(C.CARTAS, carta) && estado.mao[lado].includes(carta);
export const temCategoria = (estado, lado, cat) => estado.mao[lado].some((id) => C.CARTAS[id].categoria === cat);
/* finta na v2: o mesmo custo da v1 (metade com a iniciativa) */
export const custoFinta = (estado, lado) => Math.round(C2.K2.custoFinta * (estado.iniciativa === lado ? C2.K2.fatorFintaIniciativa : 1) * 100) / 100;

/* ---------- texto dos eventos ---------- */
/* como a carta aparece na frase (com artigo) */
const NA_FRASE = {
  jab: "o jab", cruzado: "o cruzado", chute_alto: "o chute alto", bloqueio: "o bloqueio", contra_ataque: "o contra-ataque",
  queda: "a queda", antiqueda: "a antiqueda", clinch: "o clinch", puxar_guarda: "a puxada de guarda",
  ground_and_pound: "o ground and pound", finalizacao: "a finalização", segurar: "a pegada por cima", avancar: "o avanço",
  golpes_por_baixo: "os golpes por baixo", raspar: "a raspagem", guarda: "a guarda", levantar: "a levantada",
};
export const naFrase = (id) => NA_FRASE[id] || (C.CARTAS[id] || C.CARTA_DO_CHAO[id] || { nome: id }).nome.toLowerCase();
const NOME_CAT = { golpes: "golpe", queda: "queda", defesa: "defesa", pressao: "pressão" };
const METODO = { KO: "nocaute", TKO: "nocaute técnico", FIN: "finalização", DEC: "decisão", WO: "W.O." };
export function textoEvento2(ev, nomes) {
  const N = (l) => nomes[l] || l;
  switch (ev.tipo) {
    case "dano": return `${N(ev.quem)} acertou ${naFrase(ev.carta)} (${num(ev.dano)} de dano).`;
    case "anulou": return `${N(ev.quem)} anulou ${naFrase(ev.alvo)} com ${naFrase(ev.carta)}.`;
    case "interrompeu": return `${N(ev.quem)} interrompeu ${naFrase(ev.alvo)} com ${naFrase(ev.carta)}.`;
    case "resistiu": return `${N(ev.quem)} aguentou o golpe e seguiu com ${naFrase(ev.carta)}.`;
    case "queda": return `${N(ev.quem)} levou a luta pro chão.`;
    case "puxouGuarda": return `${N(ev.quem)} puxou a guarda.`;
    case "avancou": return ev.nivelPos >= 2 ? `${N(ev.quem)} montou.` : `${N(ev.quem)} passou pra meia-guarda.`;
    case "raspou": return `${N(ev.quem)} raspou e ficou por cima.`;
    case "levantou": return `${N(ev.quem)} levantou.`;
    case "encaixou": return `${N(ev.quem)} encaixou a finalização em ${N(ev.alvo)}.`;
    case "escapou": return ev.como === "saiu" ? `${N(ev.quem)} saiu na força e levantou.` : `${N(ev.quem)} defendeu e escapou da finalização.`;
    case "soltou": return `${N(ev.quem)} soltou a finalização.`;
    case "knockdown": return `${N(ev.quem)} derrubou ${N(ev.alvo)}.`;
    case "finta": return `${N(ev.quem)} mostrou ${POSTURAS[ev.sinal]} e jogou ${NOME_CAT[ev.categoria] || ev.categoria}.`;
    case "exausta": return `${N(ev.quem)} jogou ${naFrase(ev.carta)} sem energia.`;
    case "ausente": return `${N(ev.quem)} não escolheu a tempo.`;
    case "falhou": return `A posição mudou e ${naFrase(ev.carta)} de ${N(ev.quem)} não serviu mais.`;
    case "travaram": return "Os dois tentaram mudar a posição e travaram.";
    case "fimRound": {
      const c = ev.cartao || {};
      if (c.a === c.b) return `O round ${ev.round} terminou empatado.`;
      const v = c.a > c.b ? "a" : "b";
      return `${N(v)} levou o round ${ev.round}, ${c[v]} a ${c[outro(v)]}.`;
    }
    case "fim":
      if (ev.metodo === "EMPATE") return "A luta terminou empatada.";
      if (ev.metodo === "ANULADA") return "A luta foi anulada.";
      return ev.quem ? `${N(ev.quem)} venceu por ${METODO[ev.metodo] || ev.metodo}.` : null;
    default: return null;   // resolução, energia, iniciativa, empate de velocidade: só dado
  }
}

/* ---------- a vista ---------- */
/* a carta pra tela: a da mão e, no chão, a que ela vira; velocidade e dano já com o duelo de agora */
function cartaVista(estado, perfis, lado, id, finta) {
  const pp = C2.papel2(estado, lado), c = C2.cartaEfetiva(id, pp, perfis[lado]), o = outro(lado);
  return {
    id, nome: C.CARTAS[id].nome, categoria: c.categoria,
    efetiva: { id: c.id, nome: c.nome, contexto: c.contexto },
    vel: C2.velocidade(estado, perfis, lado, c), velBase: c.vel, dano: C2.danoDe(perfis, lado, c, estado[o].grogue), danoBase: c.danoBase,
    custo: c.custo, finta, efeitos: c.efeitos,
  };
}
const ladoVisto = (x) => ({
  vida: Math.round(x.vida * 10) / 10, vidaMax: x.vidaMax, energia: Math.round(x.energia * 100) / 100, energiaMax: x.energiaMax,
  grogue: !!x.grogue, kds: x.kds, ausentes: x.ausentesSeguidas, cansado: x.energia <= C2.K2.cansado, total: x.total,
});
/* as peças da vista que só a v2 tem. Nunca a mão do outro: dele, só quantas cartas ele tem */
export function vistaV2(L, lado, { sinais = null, etapa = null } = {}) {
  const e = L.estado, andando = !!(lado && L.status === "andamento");
  const meuSinal = sinais && lado ? sinais[lado] : null;
  const p = e.pontos && e.pontos[e.round - 1];
  return {
    combate: C2.VERSAO_COMBATE,
    estado: {
      pos: e.pos, nivelPos: e.nivelPos, iniciativa: e.iniciativa || null,
      encaixe: e.encaixe && e.pos !== "pe" ? { quem: e.encaixe.quem } : null,
      a: ladoVisto(e.a), b: ladoVisto(e.b), pontos: e.pontos, cartoes: e.cartoes,
    },
    placarRound: andando && p ? { round: e.round, pts: { a: Math.round(p.a * 10) / 10, b: Math.round(p.b * 10) / 10 }, cartao: C2.cartaoDoRound2(p) } : null,
    papel: lado ? C2.papel2(e, lado) : null,
    decks: { a: e.deck.a.slice(), b: e.deck.b.slice() },
    jogadas: { a: e.jogadas.a.slice(), b: e.jogadas.b.slice() },
    mao: andando ? e.mao[lado].map((id) => cartaVista(e, L.perfis, lado, id,
      etapa === "acao" && meuSinal ? (C.CARTAS[id].categoria === meuSinal ? 0 : custoFinta(e, lado)) : null)) : null,
    maoDele: andando ? e.mao[outro(lado)].length : null,
  };
}
/* uma troca resolvida pra tela: as cartas, o log de resolução e o texto */
export function trocaVista(t, nomes) {
  const evs = t.eventos || [], res = evs.find((ev) => ev.tipo === "resolucao") || null;
  const cat = (id) => (id && C.CARTAS[id] ? C.CARTAS[id].categoria : null);
  return {
    round: t.round, troca: t.troca, cartaA: t.acao_a, cartaB: t.acao_b, acaoA: cat(t.acao_a), acaoB: cat(t.acao_b),
    resolucao: res ? { ...res, tipo: undefined } : null,
    ev: evs.filter((ev) => ev.tipo !== "resolucao").map((ev) => ({ tipo: ev.tipo, quem: ev.quem || null, alvo: ev.alvo || null, carta: ev.carta || null,
      metodo: ev.metodo || null, dano: typeof ev.dano === "number" ? Math.round(ev.dano * 10) / 10 : null })),
    eventos: evs.map((ev) => textoEvento2(ev, nomes)).filter(Boolean),
  };
}

/* ---------- definições ---------- */
export function definicoes2() {
  const carta = (c) => ({ id: c.id, nome: c.nome, categoria: c.categoria, contexto: c.contexto, vel: c.vel, dano: c.dano, custo: c.custo,
    efeitos: c.efeitos, estiloExclusivo: c.estiloExclusivo || null });
  return {
    versao: C2.VERSAO_COMBATE,
    cartas: Object.fromEntries(Object.values(C.CARTAS).map((c) => [c.id, carta(c)])),
    chao: Object.fromEntries(Object.entries(C.CHAO).map(([ctx, cats]) => [ctx, Object.fromEntries(Object.entries(cats).map(([cat, c]) => [cat, carta(c)]))])),
    passivas: Object.fromEntries(Object.entries(C.PASSIVAS).map(([id, p]) => [id, { nome: p.nome, desc: p.desc }])),
    fixas: C.FIXAS, deckPadrao: C.DECK_PADRAO, deck: C.DECK,
    liberadas: Object.fromEntries(Object.keys(C.FIXAS).map((s) => [s, C.cartasLiberadas(s)])),
    regras: { vidaBase: C2.K2.vidaBase, custoFinta: C2.K2.custoFinta, fatorFintaIniciativa: C2.K2.fatorFintaIniciativa,
      kdDano: C2.K2.kdDano, koGrogue: C2.K2.koGrogue, limiarVel: C2.K2.limiarVel, finalizaNivel: C2.K2.finalizaNivel },
  };
}
