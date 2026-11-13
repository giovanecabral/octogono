/* Combate v2 do Online (2026-11-12, pedido do dono): a troca se resolve
   por velocidade e prioridade, com o deck montado pelo jogador. Módulo
   puro e isolado: não lê o motor de antes (api/_jxj-motor.js), a carreira
   nem o banco. Regras em docs/combat-v2.md; decisões em
   docs/combat-v2-decisions.md.

   Sem sorteio na resolução (decisão 1): a mesma luta, as mesmas cartas e a
   mesma semente dão sempre o mesmo resultado, e a semente só embaralha o
   deck (a compra do round). O código da sorte é o sha256 dela, como antes.

   A troca:
   1. cada lado joga uma carta da mão (sem carta ou sem ação: a defesa da
      mão, decisão de antes); no chão a carta joga pela categoria;
   2. paga o custo e a finta (carta de outra categoria que a postura;
      metade com a iniciativa); sem energia pra pagar, a carta sai exausta;
   3. reações ("contra"): anulam a carta dele em qualquer velocidade;
   4. a mais rápida resolve primeiro; se ela acerta e tem dano, interrompe
      a mais lenta (que paga o custo e perde o efeito), salvo resistente;
   5. velocidade igual: as duas resolvem juntas;
   6. dano, posição, knockdown, grogue, encaixe, pontos e iniciativa. */
import { createHash } from "node:crypto";
import { CARTAS, CHAO, PASSIVAS, DECK, validarDeck, cartasLiberadas } from "./_jxj-cartas.js";

export const VERSAO_COMBATE = 2;
export const FORMATO2 = { rounds: 3, trocasPorRound: 3 };
/* Todos os números da luta (os das cartas estão em _jxj-cartas.js) */
export const K2 = {
  vidaBase: 12, vidaPorQueixo: 0.2,          // vida = base + (queixo - 50) x isto (30 dava 85% de decisão: o dano médio é 7 por lutador)
  energiaBase: 10, energiaPorCardio: 0.1,    // energia máxima = base + (cardio - 50) x isto
  recuperacaoRound: 2, energiaPorSobra: 1,   // no fim do round: + recuperação + 1 por carta que sobrou na mão
  custoFinta: 1.5, fatorFintaIniciativa: 0.5,
  limiarVel: 15,       // diferença no duelo de atributos que dá +1 (ou -1) de velocidade
  duelosVel: ["golpe", "defesa", "queda", "defQueda", "chao", "defChao"],   // o atributo de quem joga, nos duelos que mexem na velocidade
  escalaDano: 100,     // dano x (1 + diferença no duelo / isto)
  poderMin: 3, poderEscala: 200,  // carta de dano base >= 3: dano x (1 + (poder - 50) / isto) (com 100, o mais pesado vencia até 54,5%)
  cansado: 2,          // energia no começo da troca <= isto: -1 de velocidade
  exaustaVel: 2,       // sem energia pra pagar: -2 de velocidade e metade do dano, sem efeitos
  kdDano: 4,           // golpe em pé com dano >= isto: knockdown (fica grogue na troca seguinte)
  koGrogue: 3,         // golpe com dano >= isto em quem está grogue: nocaute
  kdsTko: 3,           // terceiro knockdown: nocaute técnico
  grogueVel: 1, grogueDano: 1,
  finalizaNivel: 1,    // a Finalização finaliza a partir desta posição (2 montada, 1 meia-guarda, 0 guarda); abaixo, encaixa (2 dava 0,1% de finalização: o round tem 3 trocas)
  pts: { dano: 1, queda: 3, controle: 1.5, avanca: 1, inverte: 2, levanta: 1, anula: 1, interrompe: 0.5, kd: 4, ausencia: 5 },
  limite108: 12, empateRound: 0.01,
  ausenciasWO: 3,
};
export const L2 = ["a", "b"];
const outro = (l) => (l === "a" ? "b" : "a");
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

/* ---------- semente e compra ---------- */
function mulberry32(s) {
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const compromissoDaSemente = (semente) => createHash("sha256").update(String(semente)).digest("hex");
/* a mão do round: o deck embaralhado pela semente (Fisher-Yates), as primeiras DECK.compra */
export function comprar(deck, semente, round, lado) {
  const h = createHash("sha256").update(`${semente}:deck:${round}:${lado}`).digest();
  const r = mulberry32(h.readUInt32LE(0)), d = deck.slice();
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d.slice(0, DECK.compra);
}

/* ---------- lutador ---------- */
/* a árvore (Fase 4) entra pelo perfil.v2 (perfilV2 de _jxj-cartas.js): melhorias de carta, vida, finta e energia de fim de round */
export const vidaMax = (p) => r1(K2.vidaBase + (p.atr.queixo - 50) * K2.vidaPorQueixo + ((p.v2 && p.v2.vida) || 0));
export const fintaDe = (p) => Math.max(0.5, K2.custoFinta - ((p && p.v2 && p.v2.fintaMenos) || 0));
export const energiaMax2 = (p) => r2(K2.energiaBase + (p.atr.cardio - 50) * K2.energiaPorCardio);
const ladoNovo = (p) => ({
  vida: vidaMax(p), vidaMax: vidaMax(p), energia: energiaMax2(p), energiaMax: energiaMax2(p),
  grogue: false, kds: 0, ausentesSeguidas: 0, ultima: null,
  total: { jogadas: 0, acertos: 0, dano: 0, quedas: 0, interrupcoes: 0, anulacoes: 0, knockdowns: 0 },
});
/* perfil: { estilo, categoria, atr, deck } (o deck validado no servidor; aqui só se confere) */
export function novaLuta2(perfilA, perfilB, semente) {
  for (const p of [perfilA, perfilB]) {
    const v = validarDeck(p.estilo, p.deck, (p.v2 && p.v2.liberadas) || cartasLiberadas(p.estilo));
    if (!v.ok) throw new Error("deck inválido: " + v.erro);
  }
  return {
    cv: VERSAO_COMBATE, tpr: FORMATO2.trocasPorRound, round: 1, troca: 1, pos: "pe", nivelPos: 0, encaixe: null, iniciativa: null,
    a: ladoNovo(perfilA), b: ladoNovo(perfilB),
    deck: { a: perfilA.deck.slice(), b: perfilB.deck.slice() },
    mao: { a: comprar(perfilA.deck, semente, 1, "a"), b: comprar(perfilB.deck, semente, 1, "b") },
    jogadas: { a: [], b: [] },   // as deste round (públicas, saem na revelação)
    pontos: [{ a: 0, b: 0 }], cartoes: [], fim: null,
  };
}
export function papel2(e, l) {
  if (e.pos === "pe") return "pe";
  return e.pos === "cima_" + l ? "cima" : "baixo";
}

/* ---------- a carta efetiva (posição + passiva) ---------- */
const casaAlvo = (alvo, c) => {
  /* a carta efetiva (no chão, a do chão), nunca a da mão: a Queda +1 do wrestler não vale pra Finalização */
  if (alvo.carta && alvo.carta !== c.id) return false;
  if (alvo.categoria && alvo.categoria !== c.categoria) return false;
  if (alvo.contexto) { const cs = Array.isArray(alvo.contexto) ? alvo.contexto : [alvo.contexto]; if (!cs.includes(c.contexto)) return false; }
  return true;
};
export function cartaEfetiva(id, pp, perfil) {
  const origem = CARTAS[id];
  if (!origem) throw new Error("carta desconhecida: " + id);
  const base = pp === "pe" ? origem : CHAO[pp][origem.categoria];
  const c = { ...base, origem: id, danoBase: base.dano, efeitos: base.efeitos.slice() };
  const pas = perfil && PASSIVAS[perfil.estilo];
  const mods = [...(pas ? pas.mods : []), ...((perfil && perfil.v2 && perfil.v2.mods) || [])];
  for (const m of mods) {
    if (!casaAlvo(m.alvo, c)) continue;
    if (m.vel) c.vel += m.vel;
    if (m.dano) c.dano += m.dano;
    if (m.custo) c.custo = Math.max(0, c.custo + m.custo);
    if (m.efeitos) c.efeitos.push(...m.efeitos);
  }
  return c;
}
/* a carta que joga sozinha (prazo perdido ou carta que não está na mão): a defesa da mão, se houver */
export const cartaPadrao = (mao) => mao.find((id) => CARTAS[id].categoria === "defesa") || mao[0];

const casaCond = (cond, cOp, e, alvo) => {
  if (!cond) return true;
  if (cond.categoria && !cond.categoria.includes(cOp.categoria)) return false;
  if (cond.carta && !cond.carta.includes(cOp.id) && !cond.carta.includes(cOp.origem)) return false;
  if (cond.nivelPos != null && !(e.pos !== "pe" && e.nivelPos >= cond.nivelPos)) return false;
  if (cond.grogue && !e[alvo].grogue) return false;
  return true;
};
const efeitosDe = (c, quando) => c.efeitos.filter((ef) => ef.quando === quando);
/* golpe = carta com dano que não é queda (contra-ataque e clinch contam): é o que derruba, deixa grogue e nocauteia */
export const ehGolpe = (c) => c.dano > 0 && c.categoria !== "queda";

/* velocidade: a da carta, +1/-1 pelo duelo de atributos, -1 grogue, -1 cansado, -2 exausta */
export function velocidade(e, perfis, l, c, { energiaInicio = e[l].energia, exausta = false } = {}) {
  let v = c.vel;
  if (c.duelo && K2.duelosVel.includes(c.duelo[0])) {
    const d = perfis[l].atr[c.duelo[0]] - perfis[outro(l)].atr[c.duelo[1]];
    v += d >= K2.limiarVel ? 1 : d <= -K2.limiarVel ? -1 : 0;
  }
  if (e[l].grogue) v -= K2.grogueVel;
  if (energiaInicio <= K2.cansado) v -= 1;
  if (exausta) v -= K2.exaustaVel;
  return v;
}
/* dano: o da carta (vezes os efeitos), pelo duelo e pelo poder; +1 em quem está grogue; metade exausta */
export function danoDe(perfis, l, c, alvoGrogue, { mult = 1, extra = 0, exausta = false } = {}) {
  const base = c.dano * mult + extra;
  if (base <= 0) return 0;
  const A = perfis[l].atr, D = perfis[outro(l)].atr;
  let d = base;
  if (c.duelo) d *= 1 + (A[c.duelo[0]] - D[c.duelo[1]]) / K2.escalaDano;
  if (c.dano >= K2.poderMin) d *= 1 + (A.poder - 50) / K2.poderEscala;
  if (alvoGrogue && ehGolpe(c)) d += K2.grogueDano;
  if (exausta) d /= 2;
  return Math.max(0, r1(d));
}

/* ---------- a troca ---------- */
const pontuar = (e, l, p) => { const pt = e.pontos[e.round - 1]; pt[l] = r2(pt[l] + p); };
function fimDaLuta(e, ctx, vencedor, metodo) {
  if (e.fim) return;
  e.fim = { vencedor, metodo, round: e.round, troca: e.troca };
  ctx.ev.push({ tipo: "fim", quem: vencedor, metodo });
}

export function resolverTroca2(estadoIn, perfis, acoes, semente) {
  if (estadoIn.fim) throw new Error("luta encerrada");
  const e = structuredClone(estadoIn);
  const ctx = { ev: [], res: null };
  const pp = { a: papel2(e, "a"), b: papel2(e, "b") };
  const posAntes = { pos: e.pos, nivelPos: e.nivelPos };
  const energiaInicio = { a: e.a.energia, b: e.b.energia };
  const ptsAntes = { ...e.pontos[e.round - 1] };
  const sinais = acoes && acoes.sinais;
  const jog = {};
  for (const l of L2) {
    let id = acoes ? acoes[l] : null;
    const ausente = !id;
    if (id && !e.mao[l].includes(id)) { ctx.ev.push({ tipo: "semCarta", quem: l, carta: id }); id = null; }
    if (!id) id = cartaPadrao(e.mao[l]);
    e.mao[l].splice(e.mao[l].indexOf(id), 1);
    e.jogadas[l].push(id);
    e[l].ultima = CARTAS[id].categoria;
    e[l].total.jogadas++;
    if (ausente) { e[l].ausentesSeguidas++; ctx.ev.push({ tipo: "ausente", quem: l }); } else e[l].ausentesSeguidas = 0;
    const c = cartaEfetiva(id, pp[l], perfis[l]);
    const sinal = sinais && sinais[l];
    const finta = sinal && sinal !== CARTAS[id].categoria ? r2(fintaDe(perfis[l]) * (e.iniciativa === l ? K2.fatorFintaIniciativa : 1)) : 0;
    const custo = r2(c.custo + finta);
    let exausta = false;
    if (e[l].energia + 1e-9 >= custo) e[l].energia = r2(e[l].energia - custo);
    else { exausta = true; e[l].energia = 0; ctx.ev.push({ tipo: "exausta", quem: l, carta: c.id }); }
    if (finta) ctx.ev.push({ tipo: "finta", quem: l, sinal, categoria: CARTAS[id].categoria, custo: finta });
    jog[l] = { id, c, custo, finta, exausta, anulada: false, interrompida: false, falhou: false, resolveu: false, dano: 0 };
  }
  for (const l of L2) jog[l].vel = velocidade(e, perfis, l, jog[l].c, { energiaInicio: energiaInicio[l], exausta: jog[l].exausta });
  const res = ctx.res = {
    cartas: Object.fromEntries(L2.map((l) => [l, { id: jog[l].id, efetiva: jog[l].c.id, categoria: jog[l].c.categoria, vel: jog[l].vel, custo: jog[l].custo, finta: jog[l].finta, exausta: jog[l].exausta }])),
    ordem: null, reacoes: [], interrupcoes: [], dano: { a: 0, b: 0 }, energia: null, posicao: null,
  };

  /* W.O.: o terceiro prazo perdido seguido (os dois: anulada) */
  const wo = L2.filter((l) => e[l].ausentesSeguidas >= K2.ausenciasWO);
  if (wo.length === 2) fimDaLuta(e, ctx, null, "ANULADA");
  else if (wo.length === 1) fimDaLuta(e, ctx, outro(wo[0]), "WO");

  if (!e.fim) {
    if (e.encaixe) resolverEncaixe(e, perfis, jog, ctx);
    if (!e.fim && !jog.a.resolveu && !jog.b.resolveu && !jog.encaixeResolvido) resolverNormal(e, perfis, jog, ctx, pp);
  }

  /* fim da troca: ausência, controle, iniciativa, grogue */
  if (!e.fim) {
    for (const l of L2) if (e[l].ausentesSeguidas >= 2) { pontuar(e, outro(l), K2.pts.ausencia); ctx.ev.push({ tipo: "ausenciaPontos", quem: outro(l) }); }
    /* controle: só pra quem está por cima e teve a carta resolvida (Guarda que anula o ground and pound tira o controle da troca) */
    if (e.pos !== "pe") { const t = e.pos.slice(5); if (jog[t].resolveu || jog.encaixeResolvido) pontuar(e, t, K2.pts.controle); }
    const pt = e.pontos[e.round - 1], dA = (pt.a - ptsAntes.a) - (pt.b - ptsAntes.b);
    if (Math.abs(dA) > 0.01) { const v = dA > 0 ? "a" : "b"; if (e.iniciativa !== v) { e.iniciativa = v; ctx.ev.push({ tipo: "iniciativa", quem: v }); } }
  }
  /* o grogue vale uma troca: só fica quem caiu nesta */
  for (const l of L2) e[l].grogue = !!jog[outro(l)].deuKd && !e.fim;
  res.dano = { a: jog.a.dano, b: jog.b.dano };   // quanto cada um causou
  res.energia = Object.fromEntries(L2.map((l) => [l, { antes: energiaInicio[l], depois: e[l].energia }]));
  res.posicao = { antes: posAntes, depois: { pos: e.pos, nivelPos: e.nivelPos } };
  res.pontos = { a: r2(e.pontos[e.round - 1].a - ptsAntes.a), b: r2(e.pontos[e.round - 1].b - ptsAntes.b) };
  res.vencedor = res.pontos.a > res.pontos.b + 0.01 ? "a" : res.pontos.b > res.pontos.a + 0.01 ? "b" : null;

  /* o round */
  if (!e.fim) {
    if (e.troca >= e.tpr) fecharRound2(e, perfis, semente, ctx);
    else e.troca++;
  }
  return { estado: e, eventos: ctx.ev, resolucao: res };
}

/* a troca normal: reações, velocidade, interrupção, empate */
function resolverNormal(e, perfis, jog, ctx, pp) {
  const res = ctx.res;
  /* 3. reações: anulam em qualquer velocidade (a carta exausta não reage) */
  const anulou = {};
  for (const l of L2) {
    const o = outro(l);
    if (jog[l].exausta) continue;
    for (const ef of efeitosDe(jog[l].c, "contra")) {
      if (!casaCond(ef.condicao, jog[o].c, e, o)) continue;
      if (ef.acao.anula) anulou[l] = true;
      aplicarAcaoPropria(e, l, ef.acao, ctx, jog[l].c);
    }
  }
  for (const l of L2) if (anulou[l]) {
    const o = outro(l);
    jog[o].anulada = true;
    pontuar(e, l, K2.pts.anula);
    e[l].total.anulacoes++;
    res.reacoes.push({ quem: l, carta: jog[l].c.id, anulou: o, cartaAnulada: jog[o].c.id });
    ctx.ev.push({ tipo: "anulou", quem: l, carta: jog[l].c.id, alvo: jog[o].c.id });
  }
  const vivos = L2.filter((l) => !jog[l].anulada);
  if (vivos.length === 1) { res.ordem = vivos[0]; resolverCarta(e, perfis, jog, vivos[0], ctx); return; }
  if (!vivos.length) { res.ordem = "anuladas"; return; }
  /* 4. a mais rápida primeiro */
  if (jog.a.vel !== jog.b.vel) {
    const r = jog.a.vel > jog.b.vel ? "a" : "b", s = outro(r);
    res.ordem = r;
    resolverCarta(e, perfis, jog, r, ctx);
    if (e.fim) { jog[s].interrompida = true; return; }
    /* resistente olha o dano base da carta dele (sem passiva nem atributo): é o número que o jogador vê */
    const resiste = efeitosDe(jog[s].c, "resistente").some((ef) => jog[r].c.danoBase <= ef.acao.ateDano);
    if (jog[r].resolveu && jog[r].c.dano > 0 && !resiste) {
      jog[s].interrompida = true;
      pontuar(e, r, K2.pts.interrompe);
      e[r].total.interrupcoes++;
      res.interrupcoes.push({ quem: r, carta: jog[r].c.id, interrompeu: s, cartaInterrompida: jog[s].c.id });
      ctx.ev.push({ tipo: "interrompeu", quem: r, carta: jog[r].c.id, alvo: jog[s].c.id });
      for (const ef of efeitosDe(jog[r].c, "se_interrompe")) aplicarAcaoPropria(e, r, ef.acao, ctx, jog[r].c);
    } else {
      if (resiste && jog[r].resolveu && jog[r].c.dano > 0) ctx.ev.push({ tipo: "resistiu", quem: s, carta: jog[s].c.id });
      resolverCarta(e, perfis, jog, s, ctx);
    }
    return;
  }
  /* 5. empate: as duas juntas */
  res.ordem = "empate";
  ctx.ev.push({ tipo: "empateVelocidade", vel: jog.a.vel });
  resolverJuntas(e, perfis, jog, ctx);
}

/* efeitos que mexem só em quem jogou (energia, iniciativa, pontos de juiz) */
function aplicarAcaoPropria(e, l, acao, ctx, c) {
  if (acao.pontos) pontuar(e, l, acao.pontos);
  if (acao.energia) { const antes = e[l].energia; e[l].energia = r2(Math.min(e[l].energiaMax, e[l].energia + acao.energia)); if (e[l].energia !== antes) ctx.ev.push({ tipo: "energia", quem: l, carta: c.id, ganho: r2(e[l].energia - antes) }); }
  if (acao.iniciativa && e.iniciativa !== l) { e.iniciativa = l; ctx.ev.push({ tipo: "iniciativa", quem: l, carta: c.id }); }
}

/* o que a carta faz quando resolve: dano, efeitos no oponente e na posição */
function calcularCarta(e, perfis, jog, l, grogueAlvo) {
  const o = outro(l), j = jog[l], c = j.c;
  let mult = 1, extra = 0;
  const acoes = [];
  if (!j.exausta) {
    for (const ef of efeitosDe(c, "se_oponente")) if (casaCond(ef.condicao, jog[o].c, e, o)) { if (ef.acao.multDano) mult *= ef.acao.multDano; if (ef.acao.danoExtra) extra += ef.acao.danoExtra; acoes.push(ef.acao); }
    for (const ef of efeitosDe(c, "se_acerta")) if (casaCond(ef.condicao, jog[o].c, e, o)) { if (ef.acao.multDano) mult *= ef.acao.multDano; if (ef.acao.danoExtra) extra += ef.acao.danoExtra; acoes.push(ef.acao); }
  }
  const dano = danoDe(perfis, l, c, grogueAlvo, { mult, extra, exausta: j.exausta });
  return { dano, acoes };
}
const posicional = (a) => a.vaiProChao || a.puxaGuarda || a.finaliza || a.inverte || a.levanta || a.avanca;

function resolverCarta(e, perfis, jog, l, ctx) {
  const j = jog[l], o = outro(l);
  /* a posição mudou antes dela (a mais rápida levantou, raspou, derrubou): a carta não serve mais */
  if (j.c.contexto !== papel2(e, l)) { j.falhou = true; ctx.ev.push({ tipo: "falhou", quem: l, carta: j.c.id }); return; }
  const { dano, acoes } = calcularCarta(e, perfis, jog, l, e[o].grogue);
  j.resolveu = true;
  e[l].total.acertos++;
  ctx.ev.push({ tipo: "resolveu", quem: l, carta: j.c.id });
  if (dano > 0) aplicarDano(e, perfis, jog, l, dano, ctx);
  if (e.fim) return;
  for (const a of acoes) aplicarAcao(e, perfis, jog, l, a, ctx);
}

function resolverJuntas(e, perfis, jog, ctx) {
  const calc = {};
  for (const l of L2) {
    const j = jog[l];
    if (j.c.contexto !== papel2(e, l)) { j.falhou = true; ctx.ev.push({ tipo: "falhou", quem: l, carta: j.c.id }); continue; }
    calc[l] = calcularCarta(e, perfis, jog, l, e[outro(l)].grogue);
    j.resolveu = true; e[l].total.acertos++;
    ctx.ev.push({ tipo: "resolveu", quem: l, carta: j.c.id });
  }
  /* o dano dos dois entra junto; nocaute dos dois: vence quem bateu mais */
  for (const l of L2) if (calc[l] && calc[l].dano > 0) aplicarDano(e, perfis, jog, l, calc[l].dano, ctx, { adiarFim: true });
  const caidos = L2.filter((l) => jog[l].koPendente);
  if (caidos.length === 2) {
    const v = jog.a.dano > jog.b.dano ? "a" : jog.b.dano > jog.a.dano ? "b" : null;
    if (v) fimDaLuta(e, ctx, v, jog[v].koPendente); else fimDaLuta(e, ctx, null, "EMPATE");
  } else if (caidos.length === 1) fimDaLuta(e, ctx, caidos[0], jog[caidos[0]].koPendente);
  if (e.fim) return;
  /* posição: os dois mudando ao mesmo tempo se anulam (travaram) */
  const pos = L2.filter((l) => calc[l] && calc[l].acoes.some(posicional));
  if (pos.length === 2) ctx.ev.push({ tipo: "travaram" });
  for (const l of L2) {
    if (!calc[l]) continue;
    for (const a of calc[l].acoes) {
      if (pos.length === 2 && posicional(a)) continue;
      aplicarAcao(e, perfis, jog, l, a, ctx);
      if (e.fim) return;
    }
  }
}

/* dano em quem não jogou l: vida, pontos, knockdown, nocaute */
function aplicarDano(e, perfis, jog, l, dano, ctx, { adiarFim = false } = {}) {
  const o = outro(l), j = jog[l], pp = papel2(e, l);
  e[o].vida = r1(e[o].vida - dano);
  j.dano = r1(j.dano + dano);
  e[l].total.dano = r1(e[l].total.dano + dano);
  pontuar(e, l, K2.pts.dano * dano);
  ctx.ev.push({ tipo: "dano", quem: l, carta: j.c.id, alvo: o, dano });
  const golpe = ehGolpe(j.c), metodoKO = pp === "pe" && golpe ? "KO" : "TKO";
  let ko = null;
  if (e[o].vida <= 0) ko = metodoKO;
  else if (e[o].grogue && dano >= K2.koGrogue && golpe) ko = metodoKO;
  else if (pp === "pe" && golpe && dano >= K2.kdDano) {
    e[o].kds++; j.deuKd = true; e[l].total.knockdowns++;
    pontuar(e, l, K2.pts.kd);
    ctx.ev.push({ tipo: "knockdown", quem: l, alvo: o });
    if (e[o].kds >= K2.kdsTko) ko = "TKO";
  }
  if (ko) { if (adiarFim) j.koPendente = ko; else fimDaLuta(e, ctx, l, ko); }
}

/* efeitos que mexem no oponente ou na posição */
function aplicarAcao(e, perfis, jog, l, a, ctx) {
  const o = outro(l), c = jog[l].c;
  aplicarAcaoPropria(e, l, a, ctx, c);
  if (a.energiaOponente) { const antes = e[o].energia; e[o].energia = r2(Math.max(0, e[o].energia + a.energiaOponente)); if (antes !== e[o].energia) ctx.ev.push({ tipo: "energia", quem: o, carta: c.id, ganho: r2(e[o].energia - antes) }); }
  if (a.vaiProChao) { e.pos = "cima_" + l; e.nivelPos = 0; e[l].total.quedas++; pontuar(e, l, K2.pts.queda); ctx.ev.push({ tipo: "queda", quem: l, carta: c.id }); }
  if (a.puxaGuarda) { e.pos = "cima_" + o; e.nivelPos = 0; ctx.ev.push({ tipo: "puxouGuarda", quem: l }); }
  if (a.avanca) { const antes = e.nivelPos; e.nivelPos = Math.min(2, e.nivelPos + a.avanca); if (e.nivelPos !== antes) { pontuar(e, l, K2.pts.avanca); ctx.ev.push({ tipo: "avancou", quem: l, nivelPos: e.nivelPos }); } }
  if (a.inverte) { e.pos = "cima_" + l; e.nivelPos = 0; e.encaixe = null; pontuar(e, l, K2.pts.inverte); ctx.ev.push({ tipo: "raspou", quem: l }); }
  if (a.levanta) { e.pos = "pe"; e.nivelPos = 0; e.encaixe = null; pontuar(e, l, K2.pts.levanta); ctx.ev.push({ tipo: "levantou", quem: l }); }
  if (a.finaliza) {
    const pas = PASSIVAS[perfis[l].estilo], minimo = pas && pas.finalizaNivel != null ? pas.finalizaNivel : K2.finalizaNivel;
    if (e.nivelPos >= minimo || e[o].grogue) fimDaLuta(e, ctx, l, "FIN");
    else { e.encaixe = { quem: l }; ctx.ev.push({ tipo: "encaixou", quem: l, alvo: o }); }
  }
}

/* finalização encaixada (decisão 3): o 2x2 de antes, sem sorteio e sem
   velocidade. Quem encaixou: apertar (Queda, a carta da finalização) ou
   emendar (Pressão); outra carta solta e a troca segue normal. Quem está
   preso: defender (Defesa) ou sair na força (outra). Defender ganha de
   apertar, emendar ganha de defender, sair na força ganha de emendar e
   perde pra apertar. */
function resolverEncaixe(e, perfis, jog, ctx) {
  const t = e.encaixe.quem, p = outro(t), ct = jog[t].c.categoria, cp = jog[p].c.categoria;
  const res = ctx.res;
  if (jog[t].c.contexto !== "cima" || (ct !== "queda" && ct !== "pressao")) {
    e.encaixe = null; ctx.ev.push({ tipo: "soltou", quem: t }); return;
  }
  res.ordem = "encaixe";
  jog.encaixeResolvido = true;
  const defende = cp === "defesa", aperta = ct === "queda";
  if (aperta && defende) { e.encaixe = null; pontuar(e, p, K2.pts.anula); ctx.ev.push({ tipo: "escapou", quem: p, como: "defendeu" }); return; }
  if (!aperta && !defende) { e.encaixe = null; e.pos = "pe"; e.nivelPos = 0; pontuar(e, p, K2.pts.levanta); ctx.ev.push({ tipo: "escapou", quem: p, como: "saiu" }); return; }
  fimDaLuta(e, ctx, t, "FIN");
}

/* fim do round: cartão, energia, mão nova */
export function cartaoDoRound2(pt) {
  const d = pt.a - pt.b;
  if (Math.abs(d) < K2.empateRound) return { a: 10, b: 10 };
  const forte = Math.abs(d) > K2.limite108;
  return d > 0 ? { a: 10, b: forte ? 8 : 9 } : { a: forte ? 8 : 9, b: 10 };
}
function fecharRound2(e, perfis, semente, ctx) {
  const c = cartaoDoRound2(e.pontos[e.round - 1]);
  e.cartoes.push(c);
  ctx.ev.push({ tipo: "fimRound", round: e.round, cartao: c });
  if (e.round >= FORMATO2.rounds) {
    /* cartões iguais: desempata pelos pontos da luta toda (decisão 26); pontos iguais, empate */
    let ta = e.cartoes.reduce((s, x) => s + x.a, 0), tb = e.cartoes.reduce((s, x) => s + x.b, 0);
    if (ta === tb) { const p = e.pontos.reduce((s, x) => s + x.a - x.b, 0); if (Math.abs(p) > K2.empateRound) { ta += p > 0 ? 1 : 0; tb += p < 0 ? 1 : 0; } }
    e.fim = ta === tb ? { vencedor: null, metodo: "EMPATE", round: e.round, troca: e.troca } : { vencedor: ta > tb ? "a" : "b", metodo: "DEC", round: e.round, troca: e.troca };
    ctx.ev.push({ tipo: "fim", quem: e.fim.vencedor, metodo: e.fim.metodo });
    return;
  }
  for (const l of L2) {
    const sobra = e.mao[l].length;
    const extra = (perfis[l].v2 && perfis[l].v2.energiaRound) || 0;
    e[l].energia = r2(Math.min(e[l].energiaMax, e[l].energia + K2.recuperacaoRound + extra + sobra * K2.energiaPorSobra));
    e[l].grogue = false;
  }
  e.round++; e.troca = 1; e.pos = "pe"; e.nivelPos = 0; e.encaixe = null; e.iniciativa = null;
  e.mao = { a: comprar(e.deck.a, semente, e.round, "a"), b: comprar(e.deck.b, semente, e.round, "b") };
  e.jogadas = { a: [], b: [] };
  e.pontos.push({ a: 0, b: 0 });
}

/* luta inteira (simulação e testes): estrategia(estado, lado, perfis, rng) -> {carta, sinal} */
export function simularLuta2(perfilA, perfilB, estrA, estrB, semente, rng = mulberry32(1)) {
  const perfis = { a: perfilA, b: perfilB };
  let e = novaLuta2(perfilA, perfilB, semente);
  const trocas = [];
  let n = 0;
  while (!e.fim && n++ < 40) {
    const ja = estrA(e, "a", perfis, rng), jb = estrB(e, "b", perfis, rng);
    const acoes = { a: ja.carta, b: jb.carta, sinais: ja.sinal || jb.sinal ? { a: ja.sinal || null, b: jb.sinal || null } : null };
    const r = resolverTroca2(e, perfis, acoes, semente);
    trocas.push({ round: e.round, troca: e.troca, acoes, resolucao: r.resolucao, eventos: r.eventos });
    e = r.estado;
  }
  return { estado: e, trocas };
}
export { mulberry32 as gerador2 };
