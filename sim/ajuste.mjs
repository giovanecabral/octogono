/* Ajuste de números pra experimento (SIM_AJUSTE, JSON): mexe nos objetos do
   motor e das cartas antes de jogar. Nada daqui vai pro jogo; o número que
   ficar bom é copiado à mão pro arquivo da carta ou do motor. */
import * as M from "../api/_jxj-combate2.js";
import * as C from "../api/_jxj-cartas.js";
export function aplicarAjuste(aj) {
  if (!aj) return;
  if (aj.K2) Object.assign(M.K2, aj.K2);
  if (aj.pts) Object.assign(M.K2.pts, aj.pts);
  for (const [id, m] of Object.entries(aj.cartas || {})) Object.assign(C.CARTAS[id], m);
  for (const [id, m] of Object.entries(aj.chao || {})) Object.assign(C.CARTA_DO_CHAO[id], m);
  for (const [est, m] of Object.entries(aj.passivas || {})) C.PASSIVAS[est] = m;
  for (const [est, d] of Object.entries(aj.decks || {})) C.DECK_PADRAO[est] = d;
  for (const [est, d] of Object.entries(aj.fixas || {})) C.FIXAS[est] = d;
}
