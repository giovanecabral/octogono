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
  /* a mão de cada round: 9 cartas pra 4 trocas. Na prática, o ataque é
     contado (2 Golpes, 2 Quedas, 1 Pressão) e a Defesa dá pra todas as
     trocas. O ponto de partida era 6 (2/1/2/1); medido em 2026-10-27
     (ferramentas/jxj-balanco.mjs matriz e mao, 1.200 lutas por dupla): com
     1 Queda o chão some (finalização 1,3%, grappler 27,5% contra o
     striker); 2/2/2/1 deu finalização 18,6% e wrestler 43,9%; 2/2/3/1
     deixou o wrestler do nível 30 em 39% a 40%; 2/2/4/1 deixa estilos de
     45,7% a 55,7% (nível 1) e de 42,6% a 57,4% (nível 30), nocaute 26,4%,
     finalização 14,1%, decisão 57,3%, e contar as cartas dele rende 3
     pontos */
  mao: { golpes: 2, queda: 2, defesa: 4, pressao: 1 },
  /* energia por carta guardada no fim do round (até o máximo). Medido:
     0,5 deixava o wrestler do nível 30 em 39% contra o counter; 0,25 põe
     toda dupla do nível 30 entre 41% e 59% */
  energiaPorCartaGuardada: 0.25,
  /* prazo estourado: a primeira família com carta nesta ordem */
  ordemPadrao: ["defesa", "pressao", "golpes", "queda"],
  /* custo, em energia, de fazer uma ação diferente do próprio sinal (fase 2) */
  custoFinta: 1.5,
  /* com a iniciativa (quem venceu a última troca do round), a finta custa
     isto do custo (fase 3) */
  fatorFintaIniciativa: 0.5,
  /* a troca: primeiro o sinal, depois a ação (um prazo só, a soma) */
  prazos: { sinalMs: 5000, acaoMs: 12000 },
};
/* a postura de cada família: o sinal que o lutador mostra (fase 2) */
export const POSTURAS = { golpes: "Peso na frente", queda: "Base baixa", defesa: "Guarda alta", pressao: "Avançando" };
export const maoCheia = () => ({ ...ESTRATEGIA.mao });
export const cartasNaMao = (mao) => FAMILIAS_MAO.reduce((s, f) => s + (mao[f] || 0), 0);
export const temCarta = (estado, lado, fam) => !estado.mao || (estado.mao[lado][fam] || 0) > 0;
export const familiasComCarta = (estado, lado) => FAMILIAS_MAO.filter((f) => temCarta(estado, lado, f));
/* Custo da finta do lado nesta troca: metade com a iniciativa (fase 3) e,
   no v4, a fração do nó "Controle de ritmo" (mecânica ritmo) a menos. Luta
   sem mão (v3) não tem iniciativa: o custo cheio. A tela, o servidor, o
   motor e o bot usam este número. */
export function custoFintaDe(estado, lado, perfil) {
  if (!estado.mao) return ESTRATEGIA.custoFinta;
  const ini = estado.iniciativa === lado ? ESTRATEGIA.fatorFintaIniciativa : 1;
  const ritmo = (perfil && perfil.mec && perfil.mec.ritmo) || 0;
  return Math.round(ESTRATEGIA.custoFinta * ini * (1 - ritmo) * 100) / 100;
}
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
