/* A queda (double leg) da luta em 3D (2026-11-27, pedido do dono: "a queda ainda parece horrível").
   Antes: o par do Mixamo inteiro (16 quadros por segundo) e o defensor estalava de 0,54 m pra 0,22 m de quadril
   entre dois quadros; as mãos de quem entra não tocavam a perna; no chão a pose ficava parada.
   Agora, em fases (tempos e alturas em visual.config.js, queda):
     entrada   o par do Mixamo até o contato (quem entra baixa e leva o ombro na cintura)
     levanta   o quadril de quem cai acompanha o ombro de quem entra e sobe um pouco; mãos de quem entra nas coxas
     cai       solta no pico: quem cai vai da pose do contato à pose deitada numa curva suave, e a raiz anda o que
               o clipe andaria nesse trecho (sem o estalo entre quadros)
     quique    um quique curto no chão
   As contas ficam aqui (sem three.js) pra suíte luta3d medir sem WebGL: o deslocamento da raiz por quadro e a
   distância entre a cabeça de um e o tronco do outro no chão. */

export const senoide = (k) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, k)));   // 0..1, derivada máx. pi/2
const dentro = (k) => Math.min(1, Math.max(0, k));

/* início e fim de cada fase (s, desde o começo da entrada) */
export function fasesDaQueda(Q) {
  const levanta = Q.contato, cai = levanta + Q.levanta, quique = cai + Q.cai, fim = quique + Q.quique.dur;
  return { levanta, cai, quique, fim };
}

/* deslocamento da raiz de quem cai em relação a onde ela estava no contato, no referencial da queda
   (frente = de quem entra pra quem cai; cima = y). recuo = o que o clipe andaria do instante do contato até
   deitado (m, medido no clipe); segue = quanto o quadril acompanha o ombro de quem entra na fase levanta */
export function raizDaQueda(t, Q, { recuo = 0, segue = 0 } = {}) {
  const F = fasesDaQueda(Q);
  if (t < F.levanta) return { frente: 0, cima: 0 };
  const kL = dentro((t - F.levanta) / Q.levanta), subida = senoide(kL);
  // levanta: sobe até o pico e anda junto com o ombro de quem entra
  let frente = segue * subida, cima = Q.ergue * subida;
  if (t >= F.cai) {
    // cai: do pico ao chão, a raiz anda o resto do clipe (senoide: começa e termina devagar, sem estalo)
    const kC = senoide((t - F.cai) / Q.cai);
    frente = segue + recuo * kC; cima = Q.ergue * (1 - kC);
  }
  if (t >= F.quique) {
    const kQ = dentro((t - F.quique) / Q.quique.dur);
    cima = Q.quique.altura * Math.sin(Math.PI * kQ) * (1 - kQ);
  }
  return { frente, cima };
}

/* maior deslocamento da raiz entre dois quadros seguidos (m), na queda inteira */
export function maiorPassoDaRaiz(Q, ctx, dt = 1 / 60) {
  const F = fasesDaQueda(Q); let ant = raizDaQueda(0, Q, ctx), max = 0;
  for (let t = dt; t <= F.fim + dt; t += dt) {
    const p = raizDaQueda(t, Q, ctx); max = Math.max(max, Math.hypot(p.frente - ant.frente, p.cima - ant.cima)); ant = p;
  }
  return max;
}

/* distância da pele da cabeça (esfera em c, raio rc) ao tronco do outro (cápsula de a até b, raio rt) */
export function folgaCabecaTronco(c, a, b, rc, rt) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-9, k = dentro((ac[0] * ab[0] + ac[1] * ab[1] + ac[2] * ab[2]) / L2);
  const p = [a[0] + ab[0] * k, a[1] + ab[1] * k, a[2] + ab[2] * k], d = [c[0] - p[0], c[1] - p[1], c[2] - p[2]];
  const dist = Math.hypot(d[0], d[1], d[2]);
  return { folga: dist - rc - rt, dir: dist > 1e-6 ? d.map((x) => x / dist) : [0, 1, 0] };
}

/* quanto empurrar (no chão, só na horizontal) quem está por cima pra cabeça de um não entrar no tronco do outro:
   devolve [x, z] em m (zero quando a folga já basta). Q.chao: raioCabeca, raioTronco, folga (a mínima, pele a pele) */
export function empurraoNoChao(cabeca, troncoA, troncoB, Q) {
  const { folga, dir } = folgaCabecaTronco(cabeca, troncoA, troncoB, Q.chao.raioCabeca, Q.chao.raioTronco);
  const falta = Q.chao.folga - folga; if (falta <= 0) return [0, 0];
  const h = Math.hypot(dir[0], dir[2]) || 1;
  return [dir[0] / h * falta, dir[2] / h * falta];
}
