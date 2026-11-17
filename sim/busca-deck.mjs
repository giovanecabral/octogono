/* Busca de deck (cartas da árvore, 2026-11-15): as partes puras da subida de
   encosta que sim/simular.mjs roda (parte "busca"). Um vizinho é o deck com
   uma carta não fixa trocada por uma carta da árvore liberada, desde que o
   servidor aceite (validarDeck). */
import * as C from "../api/_jxj-cartas.js";

const chave = (d) => d.slice().sort().join(",");

/* o deck padrão com a carta do nó no lugar de uma não fixa da MESMA CASA (em pé, por cima, por baixo;
   decisão 86, resposta do dono): entre as da mesma casa, a última da mesma categoria; se não houver
   da categoria, a última com 2 cópias. Se o deck padrão não tem carta da casa da carta (o padrão só
   tem carta em pé: por cima e por baixo não têm), vale a regra de antes: a última da mesma
   categoria e, na falta, a última com 2 cópias */
export function deckDoNo(estilo, no) {
  const id = C.CARTA_DO_NO[no], d = C.DECK_PADRAO[estilo].slice(), fixas = C.FIXAS[estilo].length, c = C.CARTAS[id];
  const livre = (x, k) => k >= fixas;
  const daCasa = (x, k) => livre(x, k) && C.CARTAS[x].casa === c.casa;
  const pool = d.some(daCasa) ? daCasa : livre;
  let i = d.findLastIndex((x, k) => pool(x, k) && C.CARTAS[x].categoria === c.categoria);
  if (i < 0) i = d.findLastIndex((x, k) => pool(x, k) && d.filter((y) => y === x).length === 2);
  d[i] = id;
  return d;
}

/* os vizinhos do deck: troca uma carta não fixa (de cada tipo) por uma carta da árvore liberada */
export function vizinhos(estilo, deck, liberadas) {
  const fixas = C.FIXAS[estilo].length, vistos = new Set([chave(deck)]), out = [];
  const daArvore = liberadas.filter((id) => C.CARTAS[id].no);
  const tipos = [...new Set(deck.slice(fixas))];
  for (const x of tipos) for (const y of daArvore) {
    if (x === y) continue;
    const d = deck.slice(), i = d.lastIndexOf(x);
    if (i < fixas) continue;
    d[i] = y;
    const k = chave(d);
    if (vistos.has(k) || !C.validarDeck(estilo, d, liberadas).ok) continue;
    vistos.add(k); out.push(d);
  }
  return out;
}

/* o deck em texto curto: "2x Jab, 1x Direto, ..." */
export const deckEmTexto = (d) => Object.entries(d.reduce((m, id) => ((m[id] = (m[id] || 0) + 1), m), {}))
  .map(([id, q]) => `${q}x ${C.CARTAS[id].nome}`).join(", ");

/* Subida de encosta (Tarefa 10 do plano das cartas). Começa no deck padrão e testa cada vizinho
   contra os rivais ({s, build, deck}) com a mesma semente (par), n lutas por rival; aceita o
   melhor vizinho enquanto ele passar do deck atual em mais de minGanho pontos. O final é
   confirmado com confirmaN lutas por rival. "rodar" é o do simular.mjs (jobs -> somas por chave).
   Política: a atenta dos dois lados (a mistura de equilíbrio é o que ela joga). */
export async function buscarDeck(estilo, build, rivais, { n = 200, confirmaN = 2000, politica = "atenta", rodar, minGanho = 1, maxPassos = 8, rotulo = "" } = {}) {
  const lib = C.cartasLiberadas(estilo, build);
  const jobsDe = (deck, nn, tag) => rivais.map((r, k) => ({ chave: `${tag}:${k}`, par: `${rotulo}:${tag.split("|")[1]}:${k}`, sA: estilo, sB: r.s, buildA: build, buildB: r.build, deckA: deck, deckB: r.deck,
    catA: "middleweight", catB: "middleweight", polA: politica, polB: "atenta", n: nn }));
  const media = (r, tag) => rivais.reduce((a, _, k) => { const o = r.get(`${tag}:${k}`); return a + (100 * o.vA) / (o.vA + o.vB); }, 0) / rivais.length;
  let deck = C.DECK_PADRAO[estilo].slice(), atual = null, passos = 0;
  for (; passos <= maxPassos; passos++) {
    const viz = vizinhos(estilo, deck, lib);
    /* o deck atual e os vizinhos na mesma rodada, mesmas sementes */
    const jobs = jobsDe(deck, n, `${rotulo}|p${passos}|atual`);
    viz.forEach((d, i) => jobs.push(...jobsDe(d, n, `${rotulo}|p${passos}|v${i}`)));
    const r = await rodar(jobs);
    atual = media(r, `${rotulo}|p${passos}|atual`);
    let melhor = -1, mv = atual + minGanho;
    viz.forEach((d, i) => { const v = media(r, `${rotulo}|p${passos}|v${i}`); if (v > mv) { mv = v; melhor = i; } });
    if (melhor < 0) break;
    deck = viz[melhor];
  }
  const rc = await rodar(jobsDe(deck, confirmaN, `${rotulo}|conf`));
  return { deck, vitoria: media(rc, `${rotulo}|conf`), passos };
}
