/* JxJ: rating Glicko-2 (spec docs/superpowers/specs/2026-10-01-jxj-design.md,
   seção 7). Por que Glicko-2 e não Elo: o lutador novo tem incerteza alta
   (RD 350) e se move rápido até o rating dele se firmar; quem fica parado
   ganha incerteza de volta; e a resposta a resultado improvável é medida,
   não um K fixo. Explicação pro jogador: "vencer alguém acima de você vale
   mais; no começo o rating anda rápido; parado, ele fica menos certo".

   Uma luta = um período de rating (o padrão de quem usa Glicko-2 em jogo
   online). Algoritmo e exemplo de referência: Mark Glickman, "Example of
   the Glicko-2 system" (a suíte jxjrating confere os números do exemplo). */

export const ESCALA = 173.7178;
export const INICIAL = { r: 1500, rd: 350, vol: 0.06 };
export const TAU = 0.5;
export const RD_MIN = 50, RD_MAX = 350;
export const PERIODO_DIAS = 7;
/* Ranking: rating "firme" pede 5 lutas com rating */
export const LUTAS_PRA_CLASSIFICAR = 5;
/* Reset parcial de temporada (inicial; a suíte jxjtemporada simula) */
export const RESET = { fator: 0.5, rdSoma: 80, rdTeto: 250 };

const g = (phi) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const E = (mu, muj, phij) => 1 / (1 + Math.exp(-g(phij) * (mu - muj)));

/* RD sobe com o tempo parado: phi* = sqrt(phi² + t·sigma²), t em períodos */
export function comInatividade({ r, rd, vol }, dias) {
  const phi = rd / ESCALA, t = Math.max(0, dias) / PERIODO_DIAS;
  return { r, rd: Math.min(RD_MAX, Math.sqrt(phi * phi + t * vol * vol) * ESCALA), vol };
}

/* jog = {r, rd, vol}; resultados = [{r, rd, s}] (s: 1 vitória, 0.5 empate, 0 derrota) */
export function atualizar(jog, resultados) {
  const mu = (jog.r - 1500) / ESCALA, phi = jog.rd / ESCALA, sigma = jog.vol;
  if (!resultados.length) return { r: jog.r, rd: Math.min(RD_MAX, Math.sqrt(phi * phi + sigma * sigma) * ESCALA), vol: sigma };
  let vinv = 0, soma = 0;
  for (const o of resultados) {
    const muj = (o.r - 1500) / ESCALA, phij = o.rd / ESCALA, gj = g(phij), ej = E(mu, muj, phij);
    vinv += gj * gj * ej * (1 - ej);
    soma += gj * (o.s - ej);
  }
  const v = 1 / vinv, delta = v * soma;
  /* volatilidade nova: algoritmo de Illinois (passo 5 do artigo) */
  const a = Math.log(sigma * sigma);
  const f = (x) => {
    const ex = Math.exp(x);
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * Math.pow(phi * phi + v + ex, 2)) - (x - a) / (TAU * TAU);
  };
  let A = a, B;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else { let k = 1; while (f(a - k * TAU) < 0 && k < 100) k++; B = a - k * TAU; }
  let fA = f(A), fB = f(B), n = 0;
  while (Math.abs(B - A) > 1e-6 && n++ < 200) {
    const C = A + ((A - B) * fA) / (fB - fA), fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2;
    B = C; fB = fC;
  }
  const sigmaNovo = Math.exp(A / 2);
  const phiEst = Math.sqrt(phi * phi + sigmaNovo * sigmaNovo);
  const phiNovo = 1 / Math.sqrt(1 / (phiEst * phiEst) + 1 / v);
  const muNovo = mu + phiNovo * phiNovo * soma;
  return {
    r: muNovo * ESCALA + 1500,
    rd: Math.max(RD_MIN, Math.min(RD_MAX, phiNovo * ESCALA)),
    vol: sigmaNovo,
  };
}

/* Uma luta entre dois lutadores: aplica a inatividade de cada um (dias
   desde a última luta com rating) e atualiza os dois. s = 1, 0.5 ou 0 pro A. */
export function luta(a, b, s, { diasA = 0, diasB = 0 } = {}) {
  const ia = comInatividade(a, diasA), ib = comInatividade(b, diasB);
  return {
    a: atualizar(ia, [{ r: ib.r, rd: ib.rd, s }]),
    b: atualizar(ib, [{ r: ia.r, rd: ia.rd, s: 1 - s }]),
  };
}

/* Chance esperada de A vencer B (pra tela de confronto e pra fila) */
export function chanceDeVencer(a, b) {
  const phi = Math.sqrt((a.rd / ESCALA) ** 2 + (b.rd / ESCALA) ** 2);
  return E((a.r - 1500) / ESCALA, (b.r - 1500) / ESCALA, phi);
}

/* Reset parcial na virada da temporada: puxa o rating pro centro e
   devolve incerteza, sem apagar a ordem. */
export function resetTemporada({ r, rd, vol }) {
  return {
    r: 1500 + (r - 1500) * RESET.fator,
    rd: Math.min(RESET.rdTeto, rd + RESET.rdSoma),
    vol,
  };
}

export const arredondar = (x) => Math.round(x);
