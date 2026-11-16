/* Lance de cada carta do combate v2 (cartas da árvore, 2026-11-15): o que o 3D
   toca quando a carta é jogada e a foto da carta (img/cartas/<id>.webp, feita
   por ferramentas/arte-cartas.mjs com o próprio diretor do 3D).

   LANCES_CARTAS[id] = { tipo, golpe?, clipe?, reserva?, bloqueio?, arte }
   - tipo: um `case` do diretor (golpe1, queda, gnp1, controle, raspou, levantou,
     sub, quedaDefendida, kd);
   - golpe: chave do GOLPES do diretor; clipe: o clipe principal; reserva: o
     clipe do mx_lutas.glb quando o clipe vier do mx_cartas.glb (que fica fora
     do git; sem ele, a reserva);
   - bloqueio: a carta é uma defesa contra golpe (o lance é o golpe dele
     defendido).
   - arte: { clipe, t, camera, passos }: os passos são lances do diretor em
     ordem, com A (quem joga a carta, o lutador em destaque) e B; o último é o
     fotografado. t: { impacto: n } (o n-ésimo contato do último passo, mais
     `depois` segundos) ou { s } (segundos depois do começo do último passo).
     camera: { tipo, lado } (tipo: lado, tres, baixo, perto, costas, chao,
     cima; lado -1 vira pro outro lado). exige: o clipe que tem que estar
     tocando em A na foto (a defesa de cabeça sorteia bloquear ou esquivar).

   Os ids são os do catálogo (api/_jxj-cartas.js): as comuns, as 48 da árvore
   e as 8 do chão. */

/* clipe de cada golpe do diretor (GOLPES em luta3d/diretor.js) */
const CLIPE_GOLPE = { jab: "Jab", direto: "Direto", umDois: "Jab_Direto", cruzadoFrente: "Cruzado_Frente", gancho: "Cruzado_Tras",
  upper: "Upper_Tras", jabCorpo: "Cruzado_Corpo", chuteBaixo: "Chute_Baixo", chuteCabeca: "Mma_Kick", chuteCorpo: "Roundhouse_Kick" };
const QUEDA = "Double_Leg_Takedown___Attacker", DEITADO = "Laying_Idle";
const cam = (tipo, lado = 1) => ({ tipo, lado });

/* golpe de quem joga a carta, foto no contato */
const golpe = (g, camera, { n = 1, depois = 0.02 } = {}) => ({
  tipo: "golpe1", golpe: g, clipe: CLIPE_GOLPE[g],
  arte: { clipe: CLIPE_GOLPE[g], t: { impacto: n, depois }, camera, passos: [["golpe", "A", g]] },
});
/* defesa contra golpe: ele bate, quem joga a carta bloqueia (Center_Block, Defesa_Corpo) ou esquiva (Esquiva_Recua) */
const defesa = (g, exige, camera, t) => ({
  tipo: "golpe1", bloqueio: true, clipe: exige,
  arte: { clipe: exige, t: t || (exige === "Esquiva_Recua" ? { s: 1.0 } : { impacto: 1, depois: 0.02 }), camera, exige, passos: [["golpe", "B", g, { bloqueio: true }]] },
});
/* contra: ele bate e é defendido, e quem joga a carta responde (foto no contato da resposta) */
const contra = (gDele, gMeu, camera) => ({
  tipo: "golpe1", golpe: gMeu, clipe: CLIPE_GOLPE[gMeu],
  arte: { clipe: CLIPE_GOLPE[gMeu], t: { impacto: 1, depois: 0.02 }, camera, exige: null,
    passos: [["golpe", "B", gDele, { bloqueio: true, exige: "Center_Block" }], ["golpe", "A", gMeu]] },
});
/* queda de quem joga a carta (foto em s segundos) */
const queda = (s, camera, passos = [["queda", "A"]]) => ({ tipo: "queda", clipe: QUEDA, arte: { clipe: QUEDA, t: { s }, camera, passos } });
/* queda dele defendida (antiqueda e afins) */
const defQueda = (s, camera) => ({ tipo: "quedaDefendida", clipe: "Passo_Tras", arte: { clipe: "Passo_Tras", t: { s }, camera, passos: [["defendida", "B"]] } });
/* no chão: quem joga a carta por cima (preparo: queda dele) ou por baixo (preparo: queda do outro) */
const cima = (tipo, ultimo, t, camera, clipe = QUEDA) => ({ tipo, clipe, arte: { clipe, t, camera, passos: [["queda", "A"], ultimo] } });
const baixo = (tipo, ultimo, t, camera, clipe = DEITADO) => ({ tipo, clipe, arte: { clipe, t, camera, passos: [["queda", "B"], ultimo] } });

export const LANCES_CARTAS = {
  /* ---------- comuns (em pé) ---------- */
  jab: golpe("jab", cam("lado")),
  cruzado: golpe("cruzadoFrente", cam("tres")),
  chute_alto: golpe("chuteCabeca", cam("baixo")),
  bloqueio: defesa("direto", "Center_Block", cam("costas")),
  contra_ataque: contra("jab", "direto", cam("tres")),
  queda: queda(1.05, cam("lado")),
  antiqueda: defQueda(0.5, cam("lado")),
  clinch: golpe("jabCorpo", cam("perto")),
  puxar_guarda: { tipo: "queda", clipe: DEITADO, arte: { clipe: DEITADO, t: { s: 1.3 }, camera: cam("chao"), passos: [["queda", "B"]] } },

  /* ---------- as 8 do chão (fora da casa, a carta da mão vira uma destas) ---------- */
  ground_and_pound: cima("gnp1", ["socos", "A", 1, false], { impacto: 1, depois: 0.02 }, cam("chao")),
  finalizacao: cima("sub", ["tentativa", "cima"], { s: 1.0 }, cam("chao", -1)),
  segurar: cima("controle", ["espera", 1.0], { s: 0.6 }, cam("costas")),
  avancar: cima("controle", ["espera", 1.2], { s: 0.8 }, cam("chao", -1)),
  golpes_por_baixo: baixo("controle", ["tentativa", "baixo"], { s: 0.9 }, cam("chao")),
  raspar: baixo("raspou", ["expulsar"], { s: 1.15 }, cam("chao", -1)),
  guarda: baixo("controle", ["socos", "B", 1, false], { impacto: 1, depois: 0.02 }, cam("chao")),
  levantar: baixo("levantou", ["expulsar"], { impacto: 1, depois: 0.02 }, cam("chao")),

  /* ---------- striker ---------- */
  direto: golpe("direto", cam("lado")),
  combinacao: golpe("umDois", cam("tres"), { n: 2 }),
  contragolpe: contra("jab", "direto", cam("costas")),
  overhand: golpe("gancho", cam("baixo", -1)),
  chute_perna: golpe("chuteBaixo", cam("lado")),
  chute_corpo: golpe("chuteCorpo", cam("tres")),
  chute_frontal: golpe("chuteCorpo", cam("costas")),
  chute_rodado: golpe("chuteCabeca", cam("tres", -1)),
  passo_lateral: defesa("gancho", "Esquiva_Recua", cam("costas")),
  joelhada: golpe("jabCorpo", cam("baixo")),
  cotovelada: golpe("cruzadoFrente", cam("perto")),
  superman: golpe("direto", cam("baixo", -1)),

  /* ---------- wrestler ---------- */
  single_leg: queda(0.75, cam("tres")),
  double_leg: queda(1.05, cam("baixo")),
  queda_contragolpe: queda(0.95, cam("costas")),
  suplex: queda(1.25, cam("baixo", -1)),
  peso_ombro: cima("controle", ["expulsar"], { s: 0.3 }, cam("chao")),
  cotovelada_cima: cima("gnp1", ["socos", "A", 1, false], { impacto: 1, depois: 0.02 }, cam("cima")),
  passagem_joelho: cima("controle", ["socos", "A", 1, false], { s: 0.15 }, cam("tres", -1)),
  martelada: cima("gnp1", ["socos", "A", 2, true], { impacto: 2, depois: 0.02 }, cam("chao")),
  sprawl: defQueda(0.55, cam("tres")),
  levantada_tecnica: baixo("levantou", ["expulsar"], { s: 3.3 }, cam("tres"), "Getting_Up"),
  contra_queda: defQueda(0.8, cam("tres", -1)),
  bodylock: queda(1.25, cam("perto", -1)),

  /* ---------- grappler ---------- */
  kimura: cima("sub", ["fin", "A", "chave"], { s: 1.6 }, cam("chao")),
  rasteira: queda(0.6, cam("lado", -1)),
  triangulo: baixo("sub", ["fin", "A", "triangulo"], { s: 1.6 }, cam("chao")),
  mata_leao: { tipo: "sub", clipe: "Strangling", arte: { clipe: "Strangling", t: { s: 1.0 }, camera: cam("tres"), passos: [["fin", "A", "mataLeao"]] } },
  cem_quilos: cima("controle", ["espera", 0.8], { s: 0.6 }, cam("tres", -1)),
  passagem_guarda: cima("controle", ["espera", 1.4], { s: 1.0 }, cam("chao")),
  guarda_fechada: baixo("controle", ["socos", "B", 1, false], { impacto: 1, depois: 0.02 }, cam("chao", -1)),
  raspagem_gancho: baixo("raspou", ["expulsar"], { s: 1.0 }, cam("chao")),
  defesa_finalizacao: baixo("controle", ["tentativa", "cima"], { s: 1.0 }, cam("chao")),
  fuga_quadril: baixo("levantou", ["expulsar"], { s: 1.3 }, cam("cima")),
  recomposicao: baixo("levantou", ["expulsar"], { s: 0.8 }, cam("chao", -1)),
  berimbolo: baixo("raspou", ["tentativa", "baixo"], { s: 0.6 }, cam("cima", -1)),

  /* ---------- counter ---------- */
  esquiva: defesa("gancho", "Esquiva_Recua", cam("tres")),
  leitura_queda: defQueda(0.45, cam("baixo")),
  contra_esquerda: contra("direto", "cruzadoFrente", cam("lado", -1)),
  leitura_total: defesa("chuteCabeca", "Center_Block", cam("baixo")),
  pendulo: defesa("jab", "Esquiva_Recua", cam("costas", -1), { s: 0.85 }),
  guarda_alta: defesa("gancho", "Center_Block", cam("perto")),
  saida_lado: defQueda(0.75, cam("lado", -1)),
  segundo_folego: defesa("chuteCorpo", "Defesa_Corpo", cam("baixo", -1)),
  contra_corpo: contra("jab", "jabCorpo", cam("tres", -1)),
  cruzado_contra: contra("jab", "gancho", cam("baixo")),
  uppercut: golpe("upper", cam("perto", -1)),
  misericordia: { tipo: "kd", golpe: "gancho", clipe: "Cruzado_Tras",
    arte: { clipe: "Cruzado_Tras", t: { impacto: 1, depois: 0.3 }, camera: cam("baixo"), passos: [["kd", "A"]] } },
};

/* Golpes novos do mx_cartas.glb (Mixamo, fora do git). Medidos com ferramentas/medir-golpes-cartas.mjs
   (o mesmo método dos golpes do GOLPES do diretor: jab e direto saem com 0,01 de diferença no imp):
   imp = instante do alcance máximo do membro; dist = esse alcance mais o quanto o alvo fica à frente
   (rosto 0,10, corpo 0,15, perna 0,08). ik: false = o membro não está na CADEIA do lutador.js
   (joelho e cotovelo), então o contato vale só pro efeito, sem puxar o osso. Rasteira e validação
   ainda não são lance de nenhuma carta (a rasteira é queda e a validação não existe no catálogo):
   ficam medidas pra Tarefa 19. */
export const GOLPES_MX = {
  overhand:      { membro: "hand_r",     alvo: "cabeca", imp: 0.42, dist: 0.99, ik: true },
  chute_frontal: { membro: "ball_l",     alvo: "corpo",  imp: 1.28, dist: 1.12, ik: true },
  chute_rodado:  { membro: "ball_r",     alvo: "cabeca", imp: 0.98, dist: 1.31, ik: true },
  validacao:     { membro: "ball_r",     alvo: "cabeca", imp: 0.75, dist: 1.51, ik: true },
  rasteira:      { membro: "ball_r",     alvo: "perna",  imp: 1.43, dist: 1.56, ik: true },
  joelhada:      { membro: "calf_r",     alvo: "corpo",  imp: 0.85, dist: 0.92, ik: false },
  cotovelada:    { membro: "lowerarm_l", alvo: "cabeca", imp: 0.33, dist: 0.65, ik: false },
  uppercut:      { membro: "hand_l",     alvo: "cabeca", imp: 0.47, dist: 0.87, ik: true },
  misericordia:  { membro: "hand_l",     alvo: "cabeca", imp: 0.97, dist: 1.52, ik: true },
};
/* a carta que toca o clipe novo: o lance de hoje vira a reserva (clipe e golpe seguem como estão) */
for (const [id, l] of Object.entries(LANCES_CARTAS)) {
  const g = GOLPES_MX[id];
  if (!g || l.tipo === "queda") continue;
  l.reserva = l.clipe;
  l.mx = { clipe: id, ...g };
}

/* O clipe que o lance toca: o principal quando ele existe nos clipes carregados (o mx_cartas.glb chega
   depois que a luta abre e fica fora do git), senão a reserva do mx_lutas.glb. null: nem um nem outro. */
export function clipeDoLance(lance, clips) {
  const tem = (c) => c && (clips instanceof Set ? clips.has(c) : !!clips[c]);
  const c = lance.mx ? lance.mx.clipe : lance.clipe;
  if (tem(c)) return c;
  if (tem(lance.reserva)) return lance.reserva;
  return tem(lance.clipe) ? lance.clipe : null;
}
