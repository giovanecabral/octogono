/* Jogadores da simulação do combate v2. Todos usam o motor de verdade
   (api/_jxj-combate2.js) pra avaliar as jogadas: nada da regra é
   reimplementado aqui.

   - aleatoria: uma carta qualquer da mão.
   - atenta: monta a tabela das cartas da mão contra as cartas que ele pode
     ter (o deck dele é público; a mão não), resolve cada par no motor,
     avalia o estado e joga a mistura de equilíbrio (jogo fictício) contra
     o jeito dele de escolher: a melhor carta que ele tiver.
   - oraculo(p): com chance p sabe a carta dele e joga a melhor resposta;
     senão, joga como a atenta. Mede quanto ler o adversário vale. */
import { L2 } from "../api/_jxj-combate2.js";
import { CARTAS } from "../api/_jxj-cartas.js";
/* a tabela e a mistura moram em api/_jxj-leitura2.js desde a Fase 5 (o bot do servidor usa a mesma) */
import { tabela, mistura } from "../api/_jxj-leitura2.js";
export { valor, PESOS_VALOR2, tabela, mistura } from "../api/_jxj-leitura2.js";

const amostra = (pesos, r) => { const t = pesos.reduce((s, v) => s + v, 0); let u = r() * t; for (let i = 0; i < pesos.length; i++) { u -= pesos[i]; if (u <= 0) return i; } return pesos.length - 1; };

export const aleatoria = () => (e, l, perfis, r) => ({ carta: e.mao[l][Math.floor(r() * e.mao[l].length)] });
export const atenta = (semente) => (e, l, perfis, r) => {
  const t = tabela(e, l, perfis, semente);
  return { carta: t.minhas[amostra(mistura(t), r)], tabela: t };
};
/* oráculo: decide depois do outro (o executor passa a carta dele em cartaDele) */
export const oraculo = (semente, acerto) => (e, l, perfis, r, cartaDele) => {
  const t = tabela(e, l, perfis, semente);
  if (cartaDele && r() < acerto) {
    const j = t.dele.indexOf(cartaDele);
    if (j >= 0) { let bi = 0; for (let i = 1; i < t.minhas.length; i++) if (t.M[i][j] > t.M[bi][j]) bi = i; return { carta: t.minhas[bi], tabela: t }; }
  }
  return { carta: t.minhas[amostra(mistura(t), r)], tabela: t };
};
export const categoriaDe = (id) => CARTAS[id].categoria;
export { L2 };
