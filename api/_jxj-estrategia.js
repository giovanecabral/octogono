/* Online: estratégia por informação (spec
   docs/superpowers/specs/2026-10-27-online-estrategia-design.md). Todos os
   números do sistema novo num lugar só: a mão à vista (fase 1) e, depois,
   sinais, finta e iniciativa. Vale pras lutas do motor v4 (estado com
   `mao`); a luta do v3 não tem mão e segue as regras de antes.

   Os números ficam no código, com a versão do motor (não no banco): mudar
   um número aqui muda como as lutas são refeitas pela semente, então mexeu,
   sobe VERSAO_MOTOR em api/_jxj-motor.js e mede de novo
   (`node testar.js jxjmotor`, `node ferramentas/jxj-balanco.mjs mao`).
   Este arquivo não importa o motor (o motor importa ele). */
export const FAMILIAS_MAO = ["golpes", "queda", "defesa", "pressao"];
export const ESTRATEGIA = {
  /* a mão de cada round: 6 cartas pra 4 trocas */
  mao: { golpes: 2, queda: 1, defesa: 2, pressao: 1 },
  /* energia por carta guardada no fim do round (até o máximo) */
  energiaPorCartaGuardada: 0.5,
  /* prazo estourado: a primeira família com carta nesta ordem */
  ordemPadrao: ["defesa", "pressao", "golpes", "queda"],
  prazos: { acaoMs: 12000 },
};
export const maoCheia = () => ({ ...ESTRATEGIA.mao });
export const cartasNaMao = (mao) => FAMILIAS_MAO.reduce((s, f) => s + (mao[f] || 0), 0);
export const temCarta = (estado, lado, fam) => !estado.mao || (estado.mao[lado][fam] || 0) > 0;
export const familiasComCarta = (estado, lado) => FAMILIAS_MAO.filter((f) => temCarta(estado, lado, f));
export function acaoPadrao(estado, lado) {
  if (!estado.mao) return "defesa";
  return ESTRATEGIA.ordemPadrao.find((f) => temCarta(estado, lado, f)) || "defesa";
}
/* Só simulação e teste: a família pedida, se tem carta; senão uma das que
   têm, sorteada com r (r só é chamado quando precisa). */
export function familiaNaMao(estado, lado, fam, r) {
  if (temCarta(estado, lado, fam)) return fam;
  const disp = familiasComCarta(estado, lado);
  return disp.length ? disp[Math.floor(r() * disp.length)] : fam;
}
/* Distribuição sobre as famílias (ordem de FAMILIAS_MAO) restrita às que
   têm carta. Sem mão (v3), devolve a mesma distribuição. Se nenhuma com
   carta tinha peso, divide igual entre elas. */
export function filtrarPelaMao(dist, estado, lado) {
  if (!estado.mao) return dist;
  const p = dist.map((x, i) => (temCarta(estado, lado, FAMILIAS_MAO[i]) ? x : 0));
  const s = p.reduce((a, b) => a + b, 0);
  if (s > 0) return p.map((x) => x / s);
  const disp = FAMILIAS_MAO.map((f) => (temCarta(estado, lado, f) ? 1 : 0)), n = disp.reduce((a, b) => a + b, 0);
  return n ? disp.map((x) => x / n) : dist;
}
