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

export const VERSAO_MOTOR = 1;
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
export function acoesDisponiveis(estado, lado, perfil) {
  const pp = papel(estado, lado);
  return FAMILIAS.map((f) => ({
    familia: f, rotulo: ROTULOS[pp][f], descricao: DESCRICOES[pp][f], custo: custoEnergia(pp, f, perfil),
  }));
}
export function custoEnergia(pp, fam, perfil) {
  let c = CUSTO[pp][fam];
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
   tipo: "golpe" (em pé), "gnp" (por cima), "contra", "sujo" (pressão), "punicao" (na entrada da queda). */
function acertar(ctx, atk, tipo, fatorDano = 1, fatorKO = fatorDano) {
  const e = ctx.estado, def = outro(atk), pa = ctx.perfis[atk], pd = ctx.perfis[def];
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
  registrar(ctx, tipo, atk, { dano: d });
  if (tipo === "golpe" && pa.mec.chuteCorpo) e[def].energia = Math.max(0, e[def].energia - pa.mec.chuteCorpo);
  if (tipo === "golpe" && pa.mec.chuteBaixo && ctx.r() < pa.mec.chuteBaixo) e[def].travado = true;
  if (tipo === "baixo" || tipo === "sujo") return false;
  /* nocaute: cresce com o dano acumulado, cai com o queixo */
  const fatorAcumulado = Math.pow(e[def].dano / 100 + K.koPiso, K.koExpoente);
  const fatorQueixo = clamp(1.3 - pd.atr.queixo / 100, 0.3, 1.2);
  let p = (tipo === "gnp" ? K.tkoBase : K.koBase) * Math.pow(pa.atr.poder / 55, 1.4) * fatorAcumulado * fatorQueixo * fatorKO;
  if (tipo === "contra") p *= 1 + (pa.mec.timingKO || 0);
  if (tipo === "gnp") p *= (1 + e.nivelPos * 0.3) * (1 - (pd.mec.sobrevivencia || 0));
  const x = ctx.r();
  if (x < p) {
    finalizar(ctx, atk, tipo === "gnp" ? "TKO" : "KO");
    return true;
  }
  if (tipo !== "gnp" && x < p * K.kdFator) {
    e[atk].total.knockdowns++;
    e[def].dano = Math.min(100, e[def].dano + 5);
    pontuar(ctx, atk, K.bonusKD);
    registrar(ctx, "knockdown", atk);
    moverMomento(ctx, atk, 2);
  }
  return false;
}
function tentarFinalizacao(ctx, atk, bonus, mult) {
  const e = ctx.estado, def = outro(atk), pa = ctx.perfis[atk], pd = ctx.perfis[def];
  e[atk].total.finalizacoes++;
  pontuar(ctx, atk, K.bonusTentativaSub);
  const cima = papel(e, atk) === "cima";
  let x = val(ctx, atk, "chao") + bonus + (cima ? e.nivelPos * 8 : -6) - (val(ctx, def, "defChao") + 6);
  let p = K.subBase * Math.pow(sig(x), 2) * mult * (1 + (pa.mec.finalizacao || 0));
  if (!cima) p *= 0.55 + (pa.mec.subDeBaixo || 0) * 2;
  if (e[def].energia <= 3) p *= 1.25 + (pa.mec.finalizacaoCansado || 0);
  p = Math.min(0.75, p);
  if (ctx.r() < p) { finalizar(ctx, atk, "FIN"); return true; }
  registrar(ctx, "subFalhou", atk);
  return false;
}
function finalizar(ctx, vencedor, metodo) {
  const e = ctx.estado;
  e.fim = { vencedor, metodo, round: e.round, troca: e.troca };
  registrar(ctx, "fim", vencedor, { metodo });
}
function derrubar(ctx, atk) {
  const e = ctx.estado;
  e.pos = atk === "a" ? "cima_a" : "cima_b";
  e.nivelPos = 0;
  e[atk].total.quedas++;
  pontuar(ctx, atk, K.bonusQueda);
  registrar(ctx, "queda", atk);
  moverMomento(ctx, atk, 1);
}
function levantar(ctx, quem) {
  const e = ctx.estado;
  e.pos = "pe"; e.nivelPos = 0;
  registrar(ctx, "levantou", quem);
}

/* ---------- em pé ----------
   Ciclo (cada ação ganha de uma, perde de uma e empata com uma):
   Golpes > Pressão > Defesa > Queda > Golpes; Golpes x Defesa e
   Queda x Pressão são neutros. "Ganhar" é K.vantagem na disputa, nunca
   resultado garantido: atributo e árvore continuam decidindo. */
function trocaEmPe(ctx, A, B) {
  const e = ctx.estado, a = ctx.acoes[A], b = ctx.acoes[B], V = K.vantagem;
  const pr = (lado) => (val(ctx, lado, "golpe") + val(ctx, lado, "queda")) / 2 + (ctx.perfis[lado].mec.golpesNaPressao || 0) * 20;
  const golpear = (atk, bonus = 0, fatorDano = 1, fatorKO = fatorDano) => {
    e[atk].total.golpes++;
    if (disputa(ctx, val(ctx, atk, "golpe") + bonus, val(ctx, outro(atk), "defesa"))) {
      if (acertar(ctx, atk, "golpe", fatorDano, fatorKO)) return true;
      const m = ctx.perfis[atk].mec;
      if (m.combinacao && ctx.r() < m.combinacao) return acertar(ctx, atk, "golpe", fatorDano, fatorKO);
    } else registrar(ctx, "errou", atk);
    return false;
  };
  const contra = (def, atk) => {
    const m = ctx.perfis[def].mec;
    if (ctx.r() < K.contraBase + (m.contra || 0) && disputa(ctx, val(ctx, def, "defesa") + 6, val(ctx, atk, "golpe"))) {
      e[def].total.contras++;
      return acertar(ctx, def, "contra");
    }
    return false;
  };
  const tentarQueda = (atk, bonus, fator) => {
    const def = outro(atk), m = ctx.perfis[atk].mec;
    e[atk].total.quedasTentadas++;
    const travado = e[atk].travado ? 10 : 0;
    const p = Math.min(0.95, sig(val(ctx, atk, "queda") + bonus - travado - val(ctx, def, "defQueda")) * fator * K.quedaFator);
    if (ctx.r() < p) { derrubar(ctx, atk); return true; }
    if (m.cadeia && ctx.r() < m.cadeia * 2 && ctx.r() < sig(val(ctx, atk, "queda") - val(ctx, def, "defQueda")) * 0.6) {
      registrar(ctx, "cadeia", atk); derrubar(ctx, atk); return true;
    }
    /* grappler: a queda que falhou pode virar puxada pra guarda */
    if (m.puxarGuarda && ctx.r() < m.puxarGuarda) {
      e.pos = def === "a" ? "cima_a" : "cima_b"; e.nivelPos = 0;
      registrar(ctx, "puxouGuarda", atk);
      return false;
    }
    registrar(ctx, "quedaDefendida", def);
    return false;
  };

  /* espelhos: disputa direta de atributo */
  if (a === "golpes" && b === "golpes") {
    if (golpear(A)) return; golpear(B);
    return;
  }
  if (a === "queda" && b === "queda") {
    const x = (val(ctx, A, "queda") + val(ctx, A, "chao") / 2) - (val(ctx, B, "queda") + val(ctx, B, "chao") / 2);
    e[A].energia = Math.max(0, e[A].energia - 1); e[B].energia = Math.max(0, e[B].energia - 1);
    if (ctx.r() < 0.5) derrubar(ctx, ctx.r() < sig(x) ? A : B);
    else registrar(ctx, "embolou", A);
    return;
  }
  if (a === "defesa" && b === "defesa") { registrar(ctx, "estudo", A); return; }
  if (a === "pressao" && b === "pressao") {
    e[A].energia = Math.max(0, e[A].energia - 1); e[B].energia = Math.max(0, e[B].energia - 1);
    const venc = disputa(ctx, pr(A), pr(B)) ? A : B;
    moverMomento(ctx, venc, 1);
    if (ctx.r() < 0.6) acertar(ctx, venc, "sujo");
    return;
  }
  /* Queda > Golpes: entra por baixo dos golpes; se falhar, come a punição */
  if (a === "golpes" && b === "queda") {
    const mt = ctx.perfis[B].mec.timingQueda || 0;
    if (tentarQueda(B, V + mt, 0.95)) {
      if (ctx.r() < 0.2 && disputa(ctx, val(ctx, A, "golpe"), val(ctx, B, "defesa"))) acertar(ctx, A, "punicao");
      return;
    }
    e[B].energia = Math.max(0, e[B].energia - 1);
    moverMomento(ctx, A, 1);
    if (disputa(ctx, val(ctx, A, "golpe") + 4, val(ctx, B, "defesa"))) acertar(ctx, A, "punicao");
    return;
  }
  /* Golpes x Defesa (neutro): bate na guarda; a defesa recupera e pode contra-atacar */
  if (a === "golpes" && b === "defesa") {
    const acertos = e[A].total.acertos;
    if (golpear(A, -K.golpeNaGuarda, K.danoNaGuarda, K.danoNaGuarda * K.koNaGuarda)) return;
    if (e[A].total.acertos === acertos) { pontuar(ctx, B, K.pontosGuarda); registrar(ctx, "bloqueou", B); }
    contra(B, A);
    return;
  }
  /* Golpes > Pressão: quem pressiona anda pra dentro dos golpes */
  if (a === "golpes" && b === "pressao") {
    if (golpear(A, V / 2, 0.8)) return;
    if (!e[B].travado && disputa(ctx, pr(B), val(ctx, A, "golpe") + V)) {
      moverMomento(ctx, B, 1);
      if (disputa(ctx, val(ctx, B, "golpe"), val(ctx, A, "defesa"))) acertar(ctx, B, "sujo");
    } else moverMomento(ctx, A, 1);
    return;
  }
  /* Defesa > Queda: sprawl */
  if (a === "queda" && b === "defesa") {
    if (!tentarQueda(A, -V, 0.85)) {
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
    if (tentarQueda(A, mt, 0.7)) return;
    moverMomento(ctx, B, 1);
    if (ctx.r() < 0.5 && disputa(ctx, val(ctx, B, "golpe"), val(ctx, A, "defesa"))) acertar(ctx, B, "sujo");
    return;
  }
  /* Pressão > Defesa: encurrala na grade */
  if (a === "defesa" && b === "pressao") {
    const ma = ctx.perfis[A].mec;
    if (ma.antiPressao && ctx.r() < ma.antiPressao) { registrar(ctx, "saiuDaGrade", A); moverMomento(ctx, A, 1); return; }
    if (e[B].travado) { registrar(ctx, "pressaoTravada", B); return; }
    moverMomento(ctx, B, 1);
    ctx.recuperacaoCortada[A] = true;
    e[A].energia = Math.max(0, e[A].energia - 1);
    pontuar(ctx, B, K.bonusGrade);
    if (disputa(ctx, val(ctx, B, "golpe") + V, val(ctx, A, "defesa"))) acertar(ctx, B, "sujo");
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
  const escapar = (bonus = 0, fator = 1) => {
    const x = val(ctx, U, "defChao") + (mu.levantar || 0) + (mu.saida || 0) + bonus - val(ctx, T, "chao") - e.nivelPos * 6;
    if (ctx.r() < Math.min(0.95, sig(x) * fator * K.escapeMult) * (1 - (mt.dominio || 0))) { levantar(ctx, U); return true; }
    return false;
  };
  const raspar = (bonus = 0, fator = 1) => {
    const x = val(ctx, U, "chao") + bonus - val(ctx, T, "chao") - e.nivelPos * 6;
    if (ctx.r() < Math.min(0.9, sig(x) * fator * (1 + (mu.raspagem || 0) * 2)) * (1 - (mt.dominio || 0))) {
      e.pos = U === "a" ? "cima_a" : "cima_b"; e.nivelPos = 0;
      registrar(ctx, "raspou", U); moverMomento(ctx, U, 1); return true;
    }
    return false;
  };
  const gnp = (bonus = 0) => {
    e[T].total.golpes++;
    const x = (val(ctx, T, "chao") + val(ctx, T, "golpe")) / 2 + e.nivelPos * 6 + bonus - (val(ctx, U, "defChao") + 10);
    if (disputa(ctx, x, 0)) return acertar(ctx, T, "gnp");
    registrar(ctx, "errou", T);
    return false;
  };
  const avancar = (bonus = 0) => {
    if (e.nivelPos >= 2) { registrar(ctx, "posicaoMantida", T); pontuar(ctx, T, K.bonusControle); return false; }
    const x = val(ctx, T, "chao") + (mt.transicao || 0) + (mt.passagem || 0) + bonus - val(ctx, U, "defChao");
    if (disputa(ctx, x, 0)) {
      e.nivelPos++; registrar(ctx, "avancou", T, { nivel: e.nivelPos }); moverMomento(ctx, T, 1);
      if (mt.transicaoSub && ctx.r() < mt.transicaoSub) return tentarFinalizacao(ctx, T, 0, 0.8);
    } else registrar(ctx, "guardaSegurou", U);
    return false;
  };
  const golpesPorBaixo = (bonus = 0) => {
    if (disputa(ctx, val(ctx, U, "golpe") + bonus - 8, val(ctx, T, "defesa"))) acertar(ctx, U, "baixo");
  };
  if (!(t === "defesa" && u === "defesa")) e.paradoChao = 0;
  const controle = () => {
    if (!e.fim && e.pos !== "pe" && (e.pos === "cima_a" ? "a" : "b") === T) { e[T].total.controle++; pontuar(ctx, T, K.bonusControle); }
  };

  if (t === "golpes") {
    if (u === "golpes") { if (gnp(VC / 2)) return; golpesPorBaixo(-6); }
    else if (u === "queda") { if (raspar(VC)) return; if (gnp(0)) return; if (mu.subDeBaixo && ctx.r() < mu.subDeBaixo && tentarFinalizacao(ctx, U, 0, 0.8)) return; }
    else if (u === "defesa") { if (gnp(-4)) return; }
    else if (u === "pressao") { if (gnp(VC)) return; if (escapar(-VC / 2, 0.6)) return; }
  } else if (t === "queda") {
    e[T].energia = Math.max(0, e[T].energia - 0.5);
    if (u === "golpes") { if (tentarFinalizacao(ctx, T, VC, 1)) return; }
    else if (u === "queda") {
      if (disputa(ctx, val(ctx, T, "chao"), val(ctx, U, "chao"))) { if (tentarFinalizacao(ctx, T, 0, 1)) return; }
      else if (raspar(0, 0.8)) return;
    } else if (u === "defesa") {
      if (tentarFinalizacao(ctx, T, -VC * K.guardaContraSub, 1)) return;
      if (raspar(-4, 0.4)) return;
    } else if (u === "pressao") { if (tentarFinalizacao(ctx, T, VC, 1)) return; if (escapar(0, 0.5)) return; }
  } else if (t === "defesa") {
    if (u === "golpes") golpesPorBaixo(VC / 2);
    else if (u === "queda") { if (raspar(-VC)) return; e[U].energia = Math.max(0, e[U].energia - 1); }
    else if (u === "defesa") {
      if (mu.recuperarGuarda && e.nivelPos > 0 && ctx.r() < mu.recuperarGuarda) { e.nivelPos--; registrar(ctx, "recuperouGuarda", U); }
      /* os dois parados: na segunda seguida, o juiz levanta a luta */
      e.paradoChao = (e.paradoChao || 0) + 1;
      if (e.paradoChao >= 2) { e.paradoChao = 0; e.pos = "pe"; e.nivelPos = 0; registrar(ctx, "juizLevantou", T); return; }
      e[T].total.controle++; pontuar(ctx, T, K.bonusControle * K.controleParado);
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
   Devolve {estado, eventos} sem mexer no estado recebido. */
export function resolverTroca(estadoIn, perfis, acoesIn, semente) {
  if (estadoIn.fim) throw new Error("luta já encerrada");
  const estado = JSON.parse(JSON.stringify(estadoIn));
  const ctx = { estado, perfis, eventos: [], r: geradorDaTroca(semente, estado.round, estado.troca),
    acoes: {}, aj: {}, momentoMexeu: false, recuperacaoCortada: {} };
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
  /* custo de energia (ação de quem faltou não recupera) */
  const papeis = { a: papel(estado, "a"), b: papel(estado, "b") };
  for (const l of ["a", "b"]) {
    const c = custoEnergia(papeis[l], ctx.acoes[l], perfis[l]);
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
   {a, b}. Sem travessão, sem frase de efeito. */
export function textoEvento(ev, nomes) {
  const q = ev.quem ? nomes[ev.quem] : "", o = ev.quem ? nomes[outro(ev.quem)] : "";
  const num = (x) => String(x).replace(".", ",");
  switch (ev.tipo) {
    case "golpe": return `${q} acertou golpes (${num(ev.dano)} de dano).`;
    case "punicao": return `${q} acertou ${o} na entrada da queda.`;
    case "contra": return `${q} contra-atacou e acertou.`;
    case "sujo": return `${q} acertou golpes curtos na grade.`;
    case "gnp": return `${q} acertou o ground and pound (${num(ev.dano)} de dano).`;
    case "baixo": return `${q} acertou golpes por baixo.`;
    case "errou": return `${q} errou os golpes.`;
    case "bloqueou": return `${q} segurou os golpes na guarda e marcou ponto.`;
    case "knockdown": return `${q} derrubou ${o} com um golpe.`;
    case "queda": return `${q} levou a luta pro chão.`;
    case "cadeia": return `${q} emendou uma segunda tentativa de queda.`;
    case "quedaDefendida": return `${q} defendeu a queda.`;
    case "embolou": return `Os dois tentaram a queda ao mesmo tempo e a luta seguiu em pé.`;
    case "estudo": return `Os dois se estudaram sem atacar.`;
    case "saiuDaGrade": return `${q} saiu da pressão na grade.`;
    case "pressaoTravada": return `${q} tentou pressionar com a perna travada.`;
    case "levantou": return `${q} levantou.`;
    case "raspou": return `${q} raspou e ficou por cima.`;
    case "avancou": return `${q} passou a guarda e melhorou a posição.`;
    case "guardaSegurou": return `${q} segurou a guarda.`;
    case "posicaoMantida": return `${q} manteve a posição.`;
    case "recuperouGuarda": return `${q} recuperou a guarda.`;
    case "puxouGuarda": return `${q} puxou ${o} pra guarda e a luta foi pro chão.`;
    case "juizLevantou": return `Os dois ficaram parados no chão e o juiz levantou a luta.`;
    case "subFalhou": return `${q} tentou a finalização e ${o} escapou.`;
    case "ausente": return `${nomes[ev.quem]} não escolheu a tempo (${ev.seguidas}ª seguida).`;
    case "fim": return ev.metodo === "KO" ? `${q} venceu por nocaute.`
      : ev.metodo === "TKO" ? `${q} venceu por nocaute técnico.`
      : ev.metodo === "FIN" ? `${q} venceu por finalização.`
      : ev.metodo === "DEC" ? `${q} venceu por decisão.`
      : ev.metodo === "WO" ? `${q} venceu por W.O.`
      : ev.metodo === "EMPATE" ? `A luta terminou empatada.`
      : `A luta foi anulada.`;
    default: return "";
  }
}

/* Luta inteira com duas estratégias (só simulação e teste). estrategia(
   estado, lado, perfil, r) devolve a família. */
export function simularLuta(perfilA, perfilB, estrA, estrB, semente) {
  let estado = novaLuta(perfilA, perfilB);
  const perfis = { a: perfilA, b: perfilB };
  const rEst = mulberry32(createHash("sha256").update(`estr:${semente}`).digest().readUInt32LE(0));
  let n = 0;
  while (!estado.fim && n++ < 100) {
    const acoes = { a: estrA(estado, "a", perfilA, rEst), b: estrB(estado, "b", perfilB, rEst) };
    estado = resolverTroca(estado, perfis, acoes, semente).estado;
  }
  return estado;
}
