# Online com estratégia: Fase 0 (preparo) e Fase 1 (mão à vista)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada lutador tem uma mão de ações por round (2 Golpes, 1 Queda, 2 Defesas, 1 Pressão), visível pros dois, validada no servidor, com ação padrão no prazo e energia pelas cartas guardadas.

**Architecture:** O motor sobe pra v4. A mão mora no estado da luta (`estado.mao`), então não há migração de tabela; a luta do v3 (sem `mao`) segue as regras de antes. Todos os números novos ficam em `api/_jxj-estrategia.js`, que não importa o motor (o motor importa ele). O servidor recusa ação sem carta antes de gravar; o motor, por segurança, troca a ação sem carta pela padrão em vez de travar a luta.

**Tech Stack:** Node (ES modules) nas funções da Vercel (`api/`), Postgres no Supabase (PGlite nos testes), `index.html` sem framework, `testar.js` como única ferramenta de teste.

**Spec:** `docs/superpowers/specs/2026-10-27-online-estrategia-design.md`

## Global Constraints

- Mão padrão por round: `{golpes: 2, queda: 1, defesa: 2, pressao: 1}` (6 cartas, 4 trocas por round).
- A mão vale em toda posição: a carta é da família (Queda por cima gasta a mesma carta da Queda em pé).
- Ação padrão no prazo: a primeira família com carta na ordem `["defesa", "pressao", "golpes", "queda"]`.
- Energia por carta guardada no fim do round: 0,5, até o máximo de energia.
- Prazo da ação: 12 s (`ESTRATEGIA.prazos.acaoMs`); tolerância segue 3 s.
- `VERSAO_MOTOR` 4; `VERSAO_BALANCEAMENTO` 3, no código e no banco (`supabase_jxj_estrategia.sql`, roda antes do deploy, com aprovação do dono).
- O servidor decide tudo; a luta é refeita pela semente; nada de pagar pra ganhar; bots marcados como bots.
- Texto sem travessão, sem frase de efeito, sem emoji; ícone só do sprite (`ICONE`).
- Nada vai pro ar sem o dono mandar; `master` só com a bateria completa verde.
- Faixas de balanço da spec: estilos 45% a 57% (nível 1), 40% a 60% (nível 30); métodos nas faixas atuais da suíte `jxjmotor`; trocas óbvias no máximo 15%.

## Review Focus

1. Luta em andamento no deploy (estado v3, sem `mao`): tem que continuar resolvendo com as regras do v3, e a tela não pode quebrar com `maos` nulo. Teste na Task 2 (v3 sem mão) e na Task 6 (tela sem `maos`).
2. Ação sem carta mandada direto pela API (console): 400, nada gravado, a troca continua aberta. Teste na Task 5.
3. Prazo estourado com a Defesa já gasta: a ação padrão é Pressão (depois Golpes, Queda), e a ausência conta igual. Teste na Task 2 e na Task 5.
4. Virada de round: a mão volta cheia, a energia das cartas guardadas não passa do máximo, e no último round nada estranho acontece (a luta acaba). Teste na Task 2.
5. Bot nunca escolhe família sem carta, inclusive no momento decisivo (o óbvio do grogue é Defesa, que pode ter acabado). Teste na Task 4.

---

### Task 1: Configuração e regras da mão (`api/_jxj-estrategia.js`)

**Files:**
- Create: `api/_jxj-estrategia.js`
- Test: `testar.js` (suíte `jxjmotor`, começo)

**Interfaces:**
- Produces:
  - `ESTRATEGIA` (objeto de configuração): `mao`, `energiaPorCartaGuardada`, `ordemPadrao`, `prazos.acaoMs`
  - `FAMILIAS_MAO: string[]` (mesma ordem de `MOTOR.FAMILIAS`)
  - `maoCheia(): {golpes, queda, defesa, pressao}`
  - `cartasNaMao(mao): number`
  - `temCarta(estado, lado, fam): boolean` (sem `estado.mao`, sempre true)
  - `familiasComCarta(estado, lado): string[]`
  - `acaoPadrao(estado, lado): string` (sem `estado.mao`, "defesa")
  - `familiaNaMao(estado, lado, fam, r): string` (só simulação: a pedida ou uma com carta sorteada por `r`)
  - `filtrarPelaMao(dist, estado, lado): number[]` (distribuição sobre as famílias, zera as sem carta e normaliza; sem `estado.mao`, devolve `dist` igual)

- [ ] **Step 1: Write the failing test** (no começo de `testarJxJMotor`, depois de `const neutro = ...`)

```js
  const EST = await import(url.pathToFileURL(path.join(RAIZ, "api", "_jxj-estrategia.js")).href);
  await conf("configuração da estratégia (v4): famílias na ordem do motor, mão padrão 2/1/2/1, ação padrão pela ordem, filtro e sorteio só nas famílias com carta; sem mão (v3) nada muda", () => {
    if (EST.FAMILIAS_MAO.join() !== F.join()) throw new Error("ordem das famílias");
    const m = EST.maoCheia();
    if (JSON.stringify(m) !== JSON.stringify({ golpes: 2, queda: 1, defesa: 2, pressao: 1 }) || EST.cartasNaMao(m) !== 6) throw new Error("mão " + JSON.stringify(m));
    m.golpes = 0; if (EST.ESTRATEGIA.mao.golpes !== 2) throw new Error("maoCheia devolveu a configuração, não uma cópia");
    const e = { mao: { a: { golpes: 1, queda: 0, defesa: 0, pressao: 1 }, b: EST.maoCheia() } };
    if (EST.acaoPadrao(e, "a") !== "pressao" || EST.acaoPadrao(e, "b") !== "defesa" || EST.acaoPadrao({}, "a") !== "defesa") throw new Error("ação padrão");
    if (EST.familiasComCarta(e, "a").join() !== "golpes,pressao" || EST.temCarta(e, "a", "queda") || !EST.temCarta({}, "a", "queda")) throw new Error("temCarta");
    const d = EST.filtrarPelaMao([0.4, 0.3, 0.2, 0.1], e, "a");
    if (Math.abs(d[0] - 0.8) > 1e-9 || d[1] || d[2] || Math.abs(d[3] - 0.2) > 1e-9) throw new Error("filtro " + d);
    if (EST.filtrarPelaMao([0, 1, 1, 0], e, "a").join() !== "0.5,0,0,0.5") throw new Error("filtro sem peso nas que têm carta");
    const igual = [0.1, 0.2, 0.3, 0.4]; if (EST.filtrarPelaMao(igual, {}, "a") !== igual) throw new Error("sem mão o filtro mexeu");
    let x = 0; const r = () => (x = (x + 0.37) % 1);
    for (let k = 0; k < 20; k++) if (!["golpes", "pressao"].includes(EST.familiaNaMao(e, "a", "queda", r))) throw new Error("sorteio fora da mão");
    if (EST.familiaNaMao(e, "a", "golpes", () => { throw new Error("sorteou sem precisar"); }) !== "golpes") throw new Error("família com carta");
  });
```

E no topo de `testarJxJMotor`, junto dos outros `require`: `const url = require("url");` (se ainda não existir na função).

- [ ] **Step 2: Run test to verify it fails**

Run: `node testar.js jxjmotor`
Expected: FAIL com `Cannot find module` em `_jxj-estrategia.js`.

- [ ] **Step 3: Write minimal implementation** (`api/_jxj-estrategia.js`)

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node testar.js jxjmotor`
Expected: o teste novo `ok` (os outros continuam como antes).

- [ ] **Step 5: Commit**

```bash
git add api/_jxj-estrategia.js testar.js
git commit -m "Online v4: configuração da estratégia e regras da mão"
git push
```

---

### Task 2: Motor v4 com a mão

**Files:**
- Modify: `api/_jxj-motor.js` (import, `VERSAO_MOTOR`, `FORMATO.prazoMs`, `novaLuta`, `acoesDisponiveis`, `fecharRound`, `resolverTroca`, `textoEvento`, `simularLuta`)
- Test: `testar.js` (suíte `jxjmotor`)

**Interfaces:**
- Consumes: Task 1 (`ESTRATEGIA`, `maoCheia`, `cartasNaMao`, `temCarta`, `acaoPadrao`, `familiaNaMao`)
- Produces:
  - `estado.mao = {a: {...}, b: {...}}` em toda luta nova (`v: 4`)
  - eventos novos: `{tipo: "semCarta", quem, fam}` e `{tipo: "guardou", quem, cartas, energia}`, ambos com texto
  - `acoesDisponiveis(...)[i].restam` (número ou `null` sem mão)
  - `FORMATO.prazoMs` = `ESTRATEGIA.prazos.acaoMs`

- [ ] **Step 1: Write the failing tests** (suíte `jxjmotor`, depois do teste da Task 1)

```js
  await conf("mão (v4): a luta nova começa com a mão cheia nos dois lados; cada ação gasta a carta da família em qualquer posição; a mão volta cheia no round seguinte; luta v3 (sem mão) resolve como antes", () => {
    const pA = perfil("striker"), pB = perfil("grappler"), P = { a: pA, b: pB };
    let e = M.novaLuta(pA, pB);
    if (e.v !== 4 || JSON.stringify(e.mao) !== JSON.stringify({ a: EST.maoCheia(), b: EST.maoCheia() })) throw new Error("mão inicial " + JSON.stringify(e.mao));
    e = M.resolverTroca(e, P, { a: "golpes", b: "defesa" }, "m1").estado;
    if (e.mao.a.golpes !== 1 || e.mao.b.defesa !== 1) throw new Error("não gastou: " + JSON.stringify(e.mao));
    /* no chão, Queda é finalização/raspar: gasta a mesma carta */
    const chao = { ...M.novaLuta(pA, pB), pos: "cima_a" };
    const r2 = M.resolverTroca(chao, P, { a: "queda", b: "pressao" }, "m2").estado;
    if (r2.mao.a.queda !== 0 || r2.mao.b.pressao !== 0) throw new Error("no chão não gastou: " + JSON.stringify(r2.mao));
    for (const ac of [{ a: "queda", b: "golpes" }, { a: "defesa", b: "pressao" }, { a: "pressao", b: "queda" }]) { if (e.fim) break; e = M.resolverTroca(e, P, ac, "m3" + e.troca).estado; }
    if (!e.fim && (e.round !== 2 || JSON.stringify(e.mao) !== JSON.stringify({ a: EST.maoCheia(), b: EST.maoCheia() }))) throw new Error("round 2 sem a mão cheia: " + JSON.stringify(e.mao));
    const v3 = M.novaLuta(pA, pB); delete v3.mao; v3.v = 3;
    const r3 = M.resolverTroca(v3, P, { a: "golpes", b: "golpes" }, "m4");
    if ("mao" in r3.estado || r3.eventos.some((ev) => ev.tipo === "semCarta" || ev.tipo === "guardou")) throw new Error("v3 ganhou mão");
  });
  await conf("ação sem carta vira a ação padrão (evento semCarta, a luta não trava); prazo perdido usa Defesa ou, sem Defesa, Pressão, Golpes, Queda; a ausência conta igual", () => {
    const pA = perfil("striker"), pB = perfil("wrestler"), P = { a: pA, b: pB };
    const e = M.novaLuta(pA, pB); e.mao.a = { golpes: 0, queda: 1, defesa: 0, pressao: 1 };
    const r = M.resolverTroca(e, P, { a: "golpes", b: "golpes" }, "s1");
    const sc = r.eventos.find((ev) => ev.tipo === "semCarta");
    if (!sc || sc.quem !== "a" || sc.fam !== "golpes" || r.estado.mao.a.pressao !== 0 || r.estado.a.ultima !== "pressao" || r.estado.a.ausentesSeguidas !== 0) throw new Error("sem carta: " + JSON.stringify({ sc, mao: r.estado.mao.a, ultima: r.estado.a.ultima }));
    const e2 = M.novaLuta(pA, pB); e2.mao.b = { golpes: 1, queda: 1, defesa: 0, pressao: 0 };
    const r2 = M.resolverTroca(e2, P, { a: "golpes", b: null }, "s2");
    if (r2.estado.b.ultima !== "golpes" || r2.estado.mao.b.golpes !== 0 || r2.estado.b.ausentesSeguidas !== 1 || !r2.eventos.some((ev) => ev.tipo === "ausente" && ev.quem === "b")) throw new Error("padrão sem Defesa nem Pressão: " + JSON.stringify(r2.estado.b));
    const r3 = M.resolverTroca(M.novaLuta(pA, pB), P, { a: null, b: "queda" }, "s3");
    if (r3.estado.a.ultima !== "defesa" || r3.estado.mao.a.defesa !== 1) throw new Error("padrão com Defesa");
  });
  await conf("carta guardada vira energia no fim do round (0,5 por carta, até o máximo), com o evento guardou; no último round não sobra nada estranho", () => {
    const pA = perfil("counter"), pB = perfil("counter"), P = { a: pA, b: pB };
    let e = M.novaLuta(pA, pB); e.troca = M.FORMATO.trocasPorRound;
    e.a.energia = 1; e.b.energia = M.energiaMax(pB);
    e.mao.a = { golpes: 1, queda: 1, defesa: 2, pressao: 0 };   // 4 cartas, gasta 1: guarda 3
    const r = M.resolverTroca(e, P, { a: "defesa", b: "defesa" }, "g1");
    const ga = r.eventos.find((ev) => ev.tipo === "guardou" && ev.quem === "a"), gb = r.eventos.find((ev) => ev.tipo === "guardou" && ev.quem === "b");
    if (r.estado.fim || !ga || ga.cartas !== 3 || Math.abs(ga.energia - 1.5) > 1e-9) throw new Error("guardou a: " + JSON.stringify(ga));
    if (!gb || gb.energia !== 0 || r.estado.b.energia > M.energiaMax(pB) + 1e-9) throw new Error("energia passou do máximo: " + JSON.stringify(gb));
    for (const ev of [ga, gb]) { const t = M.textoEvento(ev, { a: "Ana", b: "Bia" }); if (!t || problemasDeTexto(t).length) throw new Error("texto: " + t); }
    let f = M.novaLuta(pA, pB); f.round = M.FORMATO.rounds; f.troca = M.FORMATO.trocasPorRound; f.pontos = [{ a: 0, b: 0 }, { a: 0, b: 0 }, { a: 5, b: 0 }]; f.cartoes = [{ a: 10, b: 9 }, { a: 9, b: 10 }];
    const fim = M.resolverTroca(f, P, { a: "defesa", b: "defesa" }, "g2");
    if (!fim.estado.fim || fim.eventos.some((ev) => ev.tipo === "guardou")) throw new Error("último round: " + JSON.stringify(fim.estado.fim));
  });
  await conf("acoesDisponiveis manda quantas cartas restam de cada família (null sem mão); o prazo da ação vem da configuração", () => {
    const pA = perfil("striker"), e = M.novaLuta(pA, pA); e.mao.a.queda = 0;
    const ac = M.acoesDisponiveis(e, "a", pA, "sem");
    if (ac.find((x) => x.familia === "queda").restam !== 0 || ac.find((x) => x.familia === "golpes").restam !== 2) throw new Error(JSON.stringify(ac.map((x) => [x.familia, x.restam])));
    const v3 = { ...e }; delete v3.mao;
    if (M.acoesDisponiveis(v3, "a", pA, "sem").some((x) => x.restam !== null)) throw new Error("v3 com restam");
    if (M.FORMATO.prazoMs !== EST.ESTRATEGIA.prazos.acaoMs) throw new Error("prazo " + M.FORMATO.prazoMs);
  });
```

E no teste de invariantes (`"invariantes em 3000 lutas ..."`): a escolha ao acaso passa a sair quase sempre das famílias com carta, às vezes uma sem carta, e o `leu` é conferido contra a ação real:

```js
        const esc = (l) => { const x = r(); if (x < 0.06) return null; const disp = EST.familiasComCarta(e, l); return x < 0.09 ? F[Math.floor(r() * 4)] : disp[Math.floor(r() * disp.length)]; };
        const ac = { a: esc("a"), b: esc("b") }, pap = { a: M.papel(e, "a"), b: M.papel(e, "b") };
        const real = Object.fromEntries(["a", "b"].map((l) => [l, ac[l] && EST.temCarta(e, l, ac[l]) ? ac[l] : EST.acaoPadrao(e, l)]));
```

trocando `ac` por `real` na conferência do `leu` (`ev.quem !== M.quemLeu(pap, real) || ev.fam !== real[ev.quem] || ev.vs !== real[...]`), e somando `"guardou", "semCarta"` à lista de eventos que têm que aparecer.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node testar.js jxjmotor`
Expected: FAIL nos quatro testes novos (`mão inicial undefined`, etc.).

- [ ] **Step 3: Implement in `api/_jxj-motor.js`**

No topo:

```js
import { ESTRATEGIA, maoCheia, cartasNaMao, temCarta, acaoPadrao, familiaNaMao } from "./_jxj-estrategia.js";

export const VERSAO_MOTOR = 4;   // 2: variantes de ação por round (2026-10-04); 3: leitura que decide, grogue e finalização encaixada (2026-10-20); 4: mão à vista (2026-10-27)
export const FORMATO = { rounds: 3, trocasPorRound: 4, prazoMs: ESTRATEGIA.prazos.acaoMs, toleranciaMs: 3000 };
```

`novaLuta`: acrescentar `mao: { a: maoCheia(), b: maoCheia() }` ao objeto devolvido.

`acoesDisponiveis`: no objeto de cada ação, `restam: estado.mao ? estado.mao[lado][f] : null,`.

`fecharRound` passa a devolver o que cada lado guardou:

```js
function fecharRound(estado, perfis) {
  const e = estado, guardou = { a: null, b: null };
  e.cartoes.push(cartaoDoRound(e.pontos[e.round - 1]));
  if (e.round >= FORMATO.rounds) {
    /* ...igual a hoje (decisão ou empate)... */
    return guardou;
  }
  e.round++; e.troca = 1; e.pos = "pe"; e.nivelPos = 0; e.encaixe = null;
  e.momento = Math.trunc(e.momento / 2);
  for (const l of ["a", "b"]) {
    const max = energiaMax(perfis[l]), base = e[l].energia + K.recuperacaoRound + (perfis[l].atr.cardio - 50) / 12;
    /* v4: cada carta guardada vira energia; a mão volta cheia logo abaixo */
    const sobra = e.mao ? cartasNaMao(e.mao[l]) : 0, semCartas = Math.min(max, base);
    e[l].energia = Math.min(max, base + sobra * ESTRATEGIA.energiaPorCartaGuardada);
    if (sobra) guardou[l] = { cartas: sobra, energia: Math.round((e[l].energia - semCartas) * 100) / 100 };
    e[l].travado = false; e[l].grogue = false;
  }
  if (e.mao) e.mao = { a: maoCheia(), b: maoCheia() };
  e.pontos.push({ a: 0, b: 0 });
  return guardou;
}
```

`resolverTroca`, no laço das ações:

```js
  for (const l of ["a", "b"]) {
    const ac = acoesIn[l];
    if (ac && !FAMILIAS.includes(ac)) throw new Error("ação inválida");
    ausente[l] = !ac;
    estado[l].ausentesSeguidas = ac ? 0 : estado[l].ausentesSeguidas + 1;
    /* v4: só vale ação com carta; a sem carta (o servidor recusa antes)
       vira a ação padrão, pra luta nunca travar */
    let fam = ac || acaoPadrao(estado, l);
    if (ac && !temCarta(estado, l, ac)) { registrar(ctx, "semCarta", l, { fam: ac }); fam = acaoPadrao(estado, l); }
    ctx.acoes[l] = fam;
    if (!ac) registrar(ctx, "ausente", l, { seguidas: estado[l].ausentesSeguidas });
  }
```

Logo depois dos dois `return` de W.O. e luta anulada:

```js
  /* v4: a ação gasta a carta da família (em qualquer posição) */
  if (estado.mao) for (const l of ["a", "b"]) estado.mao[l][ctx.acoes[l]]--;
```

No fechamento do round:

```js
  if (!estado.fim) {
    if (estado.troca >= FORMATO.trocasPorRound) {
      const guardou = fecharRound(estado, perfis);
      for (const l of ["a", "b"]) if (guardou[l]) registrar(ctx, "guardou", l, guardou[l]);
    }
    else estado.troca++;
  }
```

`textoEvento`, dois casos novos:

```js
    case "semCarta": return `${q} já tinha usado essa ação no round e fez a ação padrão.`;
    case "guardou": return ev.energia > 0
      ? `${q} guardou ${ev.cartas} ${ev.cartas === 1 ? "ação" : "ações"} e recuperou ${num(ev.energia)} de energia.`
      : `${q} guardou ${ev.cartas} ${ev.cartas === 1 ? "ação" : "ações"}, com a energia cheia.`;
```

`simularLuta` (só simulação): a estratégia que pedir família sem carta joga uma das que têm:

```js
    const acoes = { a: estrA(estado, "a", perfilA, rEst), b: estrB(estado, "b", perfilB, rEst) };
    for (const l of ["a", "b"]) if (acoes[l]) acoes[l] = familiaNaMao(estado, l, acoes[l], rEst);
```

- [ ] **Step 4: Run tests**

Run: `node testar.js jxjmotor`
Expected: os testes novos e o de invariantes `ok`. Testes de faixa (estilos, métodos, níveis) podem reprovar: anotar os números e seguir; a calibração é a Task 7.

- [ ] **Step 5: Commit**

```bash
git add api/_jxj-motor.js testar.js
git commit -m "Online v4: a mão no motor (gasta carta, ação padrão, energia por carta guardada)"
git push
```

---

### Task 3: Simulador com a mão e o jogador que conta cartas

**Files:**
- Modify: `ferramentas/jxj-balanco.mjs` (laços que chamam `resolverTroca` direto, `HUMANOS_MODELO`, modo novo `mao`)
- Test: `testar.js` (suíte `jxjmotor`)

**Interfaces:**
- Consumes: Task 1 e 2
- Produces:
  - `contador(pEu, pEle)`: estratégia que joga a melhor resposta à mistura dele restrita às famílias que ele ainda tem
  - `medirMao(n)`: `{obvias, contadorContraEstilo, racionalContraEstilo}` (porcentagens)
  - `HUMANOS_MODELO.contador`
  - linha de comando: `node ferramentas/jxj-balanco.mjs mao`

- [ ] **Step 1: Write the failing test** (suíte `jxjmotor`)

```js
  await conf("informação vale (v4): quem conta as cartas dele vence o jogador de estilo mais do que quem joga só a mistura; trocas em que ele só tem uma família: no máximo 15%", () => {
    const r = BAL.medirMao(150);
    console.log(cinza(`         óbvias ${f1(r.obvias)}% | contador x estilo ${f1(r.contadorContraEstilo)}% | racional x estilo ${f1(r.racionalContraEstilo)}%`));
    if (r.obvias > 15) throw new Error("trocas óbvias demais: " + f1(r.obvias));
    if (!(r.contadorContraEstilo > r.racionalContraEstilo)) throw new Error("contar cartas não ajudou");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node testar.js jxjmotor`
Expected: FAIL com `BAL.medirMao is not a function`.

- [ ] **Step 3: Implement in `ferramentas/jxj-balanco.mjs`**

Import da configuração junto dos outros:

```js
const EST = await import(pathToFileURL(path.join(RAIZ, "api", "_jxj-estrategia.js")).href);
```

Em todo laço que chama `M.resolverTroca` com ação de estratégia (`treinarValor`, `leituraOraculo`, `medirMomentos`, `lutaContraBot`), passar cada ação por `EST.familiaNaMao(e, lado, fam, r)` com o gerador da própria estratégia. Exemplo em `treinarValor`:

```js
    while (!e.fim && k++ < 100) {
      est.push(feat(e, pA, pB));
      const fa = EST.familiaNaMao(e, "a", ea(e, "a", pA, rr), rr), fb = EST.familiaNaMao(e, "b", eb(e, "b", pB, rr), rr);
      e = M.resolverTroca(e, { a: pA, b: pB }, { a: fa, b: fb }, `v${i}`).estado;
    }
```

O jogador que conta cartas:

```js
/* Quem conta as cartas (v4): fora do momento decisivo, a mistura de
   equilíbrio dele restrita às famílias que ele ainda tem é a crença, e a
   jogada é a melhor resposta entre as famílias que eu tenho. */
export function contador(pEu, pEle) {
  const base = racional(pEu, pEle);
  return (e, l, p, r) => {
    if (!e.mao || M.momentoDoLado(e, l)) return base(e, l, p, r);
    const o = l === "a" ? "b" : "a", pos = posDoLado(e, l), mx = misturas(pEu, pEle)[pos];
    const crenca = EST.filtrarPelaMao(mx.b, e, o);
    const ganho = F.map((f, i) => (EST.temCarta(e, l, f) ? mx.m[i].reduce((s, v, j) => s + v * crenca[j], 0) : -Infinity));
    return F[ganho.indexOf(Math.max(...ganho))];
  };
}
```

(`posDoLado` já existe no arquivo; `contador` vem depois dela.)

A medição:

```js
/* Mão à vista (v4): quantas trocas ficam óbvias (ele só tem uma família) e
   quanto vale contar as cartas, contra o jogador de estilo, no espelho de
   cada estilo no nível 1. */
export function medirMao(n = 200) {
  let obv = 0, tot = 0;
  const v = { contador: [0, 0], racional: [0, 0] };
  for (const s of ESTS) {
    const p = perfilTipico(s, 1);
    for (const [nome, estr] of [["contador", contador(p, p)], ["racional", racional(p, p)]]) {
      const t = confronto(p, p, estr, heuristica(s), n, `mao${nome}${s}`);
      v[nome][0] += t.vX; v[nome][1] += t.vX + t.vO;
    }
    const ra = racional(p, p);
    for (let i = 0; i < n; i++) {
      let e = M.novaLuta(p, p); const r = lcg(i * 31 + 7);
      while (!e.fim) {
        tot++; if (EST.familiasComCarta(e, "b").length === 1) obv++;
        const fa = EST.familiaNaMao(e, "a", ra(e, "a", p, r), r), fb = EST.familiaNaMao(e, "b", ra(e, "b", p, r), r);
        e = M.resolverTroca(e, { a: p, b: p }, { a: fa, b: fb }, `ob${s}${i}`).estado;
      }
    }
  }
  return { obvias: 100 * obv / tot, contadorContraEstilo: 100 * v.contador[0] / v.contador[1], racionalContraEstilo: 100 * v.racional[0] / v.racional[1] };
}
```

`HUMANOS_MODELO`: acrescentar `contador: (pH, pB) => contador(pH, pB),` seguindo o formato das entradas que já existem.

Linha de comando, junto dos outros modos:

```js
  } else if (cmd === "mao") {
    const r = medirMao(N || 300);
    console.log(`trocas em que ele só tem uma família: ${f1(r.obvias)}%`);
    console.log(`contador de cartas contra o jogador de estilo: ${f1(r.contadorContraEstilo)}% (só a mistura: ${f1(r.racionalContraEstilo)}%)`);
```

e `mao` na lista do uso e no comentário do topo.

- [ ] **Step 4: Run test**

Run: `node testar.js jxjmotor`
Expected: o teste da informação `ok`.

- [ ] **Step 5: Commit**

```bash
git add ferramentas/jxj-balanco.mjs testar.js
git commit -m "Online v4: simulador com a mão e o jogador que conta cartas"
git push
```

---

### Task 4: Bot só joga carta que tem

**Files:**
- Modify: `api/_jxj-bot.js` (`distribuicaoDoBot`, `decidir`)
- Test: `testar.js` (suíte `jxjbot`)

**Interfaces:**
- Consumes: Task 1 (`filtrarPelaMao`, `temCarta`, `acaoPadrao`)
- Produces: `distribuicaoDoBot` com zero nas famílias sem carta; `decidir` nunca devolve família sem carta

- [ ] **Step 1: Write the failing test** (suíte `jxjbot`)

```js
  await conf("mão (v4): o bot nunca escolhe família sem carta, em toda personalidade e habilidade, inclusive no momento decisivo (o óbvio pode ter acabado)", () => {
    const pH = T.perfilTipico("striker", 4), ruins = [];
    for (const pers of BOT.PERSONALIDADES_IDS) for (const s of [0, 0.5, 1]) {
      const rating = BOT.RATING_BOT.min + s * (BOT.RATING_BOT.max - BOT.RATING_BOT.min);
      const bot = BOT.montarBot({ nivel: 4, categoria: "middleweight", rating, semente: `mao${pers}${s}`, pers });
      const dados = BOT.dadosDaLuta(bot, pH);
      for (let luta = 0; luta < 40; luta++) {
        let e = M.novaLuta(pH, bot.perfil), h = 17 + luta; const trocas = [];
        while (!e.fim) {
          if (luta % 4 === 0) { e = JSON.parse(JSON.stringify(e)); e.b.grogue = false; e.a.grogue = true; e.mao.b.golpes = 0; }   // força o óbvio sem carta
          h = (h * 1103515245 + 12345) % 2147483648;
          const aH = EST.familiaNaMao(e, "a", F[h % 4], () => (h % 97) / 97);
          const aB = BOT.acaoDoBot({ estado: e, semente: `mao${pers}${s}${luta}`, trocas, dados, lado: "b" });
          if (!EST.temCarta(e, "b", aB)) { ruins.push(`${pers} s=${s}: ${aB} sem carta (${JSON.stringify(e.mao.b)})`); break; }
          const dist = BOT.distribuicaoDoBot(e, "b", dados, BOT.historicoDasTrocas(trocas, "b"), []);
          if (F.some((f, i) => dist[i] > 0 && !EST.temCarta(e, "b", f))) { ruins.push(`${pers} s=${s}: distribuição com peso sem carta`); break; }
          const r = M.resolverTroca(e, { a: pH, b: bot.perfil }, { a: aH, b: aB }, `mao${pers}${s}${luta}`);
          trocas.push({ round: e.round, troca: e.troca, acao_a: aH, acao_b: aB, eventos: r.eventos });
          e = r.estado;
        }
      }
    }
    if (ruins.length) throw new Error(ruins.slice(0, 4).join(" | "));
  });
```

No topo de `testarJxJBot`: `const EST = await import(url.pathToFileURL(path.join(RAIZ, "api", "_jxj-estrategia.js")).href);` (e `const url = require("url");` se faltar).

- [ ] **Step 2: Run test to verify it fails**

Run: `node testar.js jxjbot`
Expected: FAIL com "sem carta" ou "distribuição com peso sem carta".

- [ ] **Step 3: Implement in `api/_jxj-bot.js`**

Import: `import { filtrarPelaMao, temCarta, acaoPadrao } from "./_jxj-estrategia.js";`

No fim de `distribuicaoDoBot`, trocar `return p;` por:

```js
  /* v4: só as famílias com carta na mão (sem mão, a mesma distribuição) */
  return filtrarPelaMao(p, e, lado);
```

`decidir`: o caminho sem personalidade (lutas antigas) passa a respeitar a mão sem gastar sorteio a mais quando a família tem carta:

```js
export function decidir(e, lado, d, hist, r, recentes = []) {
  if (d.pers && PERSONALIDADES[d.pers]) return amostra(distribuicaoDoBot(e, lado, d, hist, recentes), r);
  const f = decidirSemJeito(e, lado, d, hist, r);
  return temCarta(e, lado, f) ? f : acaoPadrao(e, lado);
}
function decidirSemJeito(e, lado, d, hist, r) {
  /* ...o corpo de hoje do decidir, a partir de `if (e[lado].energia <= 1.5 ...`... */
}
```

- [ ] **Step 4: Run tests**

Run: `node testar.js jxjbot`
Expected: o teste novo `ok`. A calibração (`FORCA_BOT`, `PESOS_VALOR`) pode reprovar: fica pra Task 7.

- [ ] **Step 5: Commit**

```bash
git add api/_jxj-bot.js testar.js
git commit -m "Online v4: bot só escolhe família com carta"
git push
```

---

### Task 5: Servidor e banco (validação, vista, versão de balanceamento 3)

**Files:**
- Modify: `api/jxj.js` (ação `acao`, `vistaDaLuta`)
- Modify: `api/_jxj-arvores.js` (`VERSAO_BALANCEAMENTO = 3`)
- Modify: `api/_jxj-regras.js` (texto do prazo vindo da configuração)
- Create: `supabase_jxj_estrategia.sql`
- Modify: `ferramentas/banco-teste.mjs` (carrega a migração nova), `.vercelignore`
- Test: `testar.js` (suíte `jxj`)

**Interfaces:**
- Consumes: Task 1 e 2
- Produces: vista com `maos: {a, b} | null` e `acoes[].restam`; erro 400 "Você já usou essa ação neste round."

- [ ] **Step 1: Write the failing tests** (suíte `jxj`)

O helper `lutaNaUltimaTroca` (já existe) manda 3 Defesas de cada lado; com a mão, a 3ª é recusada. Trocar o laço dele por ações com carta:

```js
      for (const fam of ["defesa", "defesa", "pressao"]) {
        const v = await ok(u1, "luta", { lutaId: lid });
        await ok(u1, "acao", { lutaId: lid, round: v.round, troca: v.troca, familia: fam });
        await ok(u2, "acao", { lutaId: lid, round: v.round, troca: v.troca, familia: fam });
      }
```

Os testes da narração que usam esse helper e o `fecharRound` com "defesa" na 4ª troca passam a mandar "golpes" (Defesa e Pressão já gastas). Teste novo:

```js
    await conf("mão à vista (v4): a vista manda as duas mãos; ação sem carta é recusada (400) sem gravar nada, inclusive chamada direta; prazo vencido sem Defesa nem Pressão usa Golpes", async () => {
      const x = await lutaNaUltimaTroca();   // gastou 2 Defesas e a Pressão dos dois lados
      const va = await ok(x.u1, "luta", { lutaId: x.lid }), vb = await ok(x.u2, "luta", { lutaId: x.lid });
      if (!va.maos || JSON.stringify(va.maos) !== JSON.stringify(vb.maos) || va.maos.a.defesa !== 0 || va.maos.b.pressao !== 0) throw new Error("maos: " + JSON.stringify(va.maos));
      if (va.acoes.find((a) => a.familia === "defesa").restam !== 0) throw new Error("restam na ação");
      await erro(x.u1, "acao", { lutaId: x.lid, round: x.v.round, troca: x.v.troca, familia: "defesa" }, /já usou essa ação/);
      if ((await q("select count(*)::int n from jxj_acoes where luta_id = $1 and round = 1 and troca = 4", [x.lid]))[0].n !== 0) throw new Error("gravou a ação sem carta");
      await vencerPrazo(x.lid);
      await ok(x.u2, "luta", { lutaId: x.lid });
      const t4 = (await q("select eventos from jxj_trocas where luta_id = $1 and round = 1 and troca = 4", [x.lid]))[0];
      const esc = t4 && t4.eventos.find((ev) => ev.tipo === "escolha");
      if (!esc || M.VARIANTE_POR_ID[esc.va].familia !== "golpes" || M.VARIANTE_POR_ID[esc.vb].familia !== "golpes") throw new Error("padrão sem Defesa nem Pressão: " + JSON.stringify(esc));
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node testar.js jxj`
Expected: FAIL (`maos: undefined`).

- [ ] **Step 3: Implement**

`api/jxj.js`, import: `import * as EST from "./_jxj-estrategia.js";`

Ação `acao`, trocando o primeiro `await processarLuta(lid, uid);`:

```js
      const d0 = await processarLuta(lid, uid);
      const L0 = d0.luta, lado0 = L0.a_user === uid ? "a" : L0.b_user === uid ? "b" : null;
      /* v4: só ação com carta na mão; recusa antes de gravar (o console não passa daqui) */
      if (L0.status === "andamento" && lado0 && L0.estado && L0.round === round && L0.troca === troca && !EST.temCarta(L0.estado, lado0, c.familia))
        throw new ErroJxJ("Você já usou essa ação neste round.");
```

`vistaDaLuta`, no objeto `vista` (depois de `papel`):

```js
    /* v4: as duas mãos são públicas (contagem por família); luta v3, null */
    maos: estado && estado.mao ? estado.mao : null,
```

`api/_jxj-arvores.js`: `export const VERSAO_BALANCEAMENTO = 3;` e no comentário: `3: mão à vista, motor v4 (2026-10-27, supabase_jxj_estrategia.sql).`

`api/_jxj-regras.js`: importar `ESTRATEGIA` de `./_jxj-estrategia.js` e trocar o "20 segundos" de `REGRA_AUSENCIA` por `${ESTRATEGIA.prazos.acaoMs / 1000} segundos`.

`supabase_jxj_estrategia.sql`:

```sql
-- supabase_jxj_estrategia.sql — modo Online: estratégia por informação (2026-10-27).
--
-- Rodar DEPOIS de supabase_jxj_fase5.sql, com a aprovação do dono, antes
-- do deploy. Fase 1 (mão à vista): só sobe a versão de balanceamento pra 3
-- (motor v4). A mão mora no estado da luta; nenhuma tabela nova. As fases
-- seguintes (sinais) entram neste mesmo arquivo antes do deploy.
--
-- O código e o banco precisam dizer o mesmo número: com o banco em 2 e o
-- código em 3, a tela promete o respec grátis e o banco cobra as fichas.
-- Desfazer (só junto com a volta do código pra versão 2):
--   update jxj_config set valor = '2'::jsonb, atualizado_em = now() where chave = 'versao_balanceamento';
update jxj_config set valor = '3'::jsonb, atualizado_em = now() where chave = 'versao_balanceamento';
select chave, valor from jxj_config where chave = 'versao_balanceamento';
```

`ferramentas/banco-teste.mjs`: opção `estrategia = true` e, depois da fase 5,
`if (estrategia && fase5 && bot && raio && movimento) await db.exec(fs.readFileSync(path.join(RAIZ, "supabase_jxj_estrategia.sql"), "utf8"));`, e o arquivo na lista do comentário.

`.vercelignore`: `supabase_jxj_estrategia.sql` depois de `supabase_jxj_fase5.sql`.

- [ ] **Step 4: Run tests**

Run: `node testar.js jxj`
Expected: tudo `ok` (inclusive "versão do código igual à do banco").

- [ ] **Step 5: Commit**

```bash
git add api/jxj.js api/_jxj-arvores.js api/_jxj-regras.js supabase_jxj_estrategia.sql ferramentas/banco-teste.mjs .vercelignore testar.js
git commit -m "Online v4: servidor recusa ação sem carta, vista com as mãos, versão de balanceamento 3"
git push
```

---

### Task 6: Tela (mão no placar e nos botões, dicas da primeira luta)

**Files:**
- Modify: `index.html` (`jxjDesenharCombate`; função nova `jxjMao`; dica da primeira luta)
- Modify: `estilo.css` (bloco da mão)
- Test: `testar.js` (suíte `jxjtelas`)

**Interfaces:**
- Consumes: vista da Task 5 (`maos`, `acoes[].restam`, `nomes[lado].cartel`)
- Produces: `.jxj-mao` em cada lado do placar; botão `.jxj-acao.sem-carta` desabilitado; `.jxj-restam` com a contagem; `.jxj-dica-mao` na primeira luta

- [ ] **Step 1: Write the failing test** (suíte `jxjtelas`, depois do teste do placar do round)

```js
    await conf("mão à vista na tela (v4): os dois lados do placar mostram a mão; o botão sem carta fica apagado e desabilitado com a contagem; a primeira luta dá a dica; luta sem mão (v3) não quebra", async () => {
      const mexer = async (fn) => { const r = (await db.query("select estado from jxj_lutas where id = $1", [lid])).rows[0]; fn(r.estado); await db.query("update jxj_lutas set estado = $2::jsonb where id = $1", [lid, JSON.stringify(r.estado)]); };
      const vs = await api(u1, "luta", { lutaId: lid }), eu = vs.lado, ele = eu === "a" ? "b" : "a";
      await mexer((e) => { e.pos = "pe"; e.nivelPos = 0; e.encaixe = null; e.a.grogue = false; e.b.grogue = false; e.mao[eu] = { golpes: 1, queda: 0, defesa: 2, pressao: 1 }; e.mao[ele] = { golpes: 0, queda: 0, defesa: 1, pressao: 1 }; });
      let m = await abrir(`luta/${lid}`), nos = desde(m);
      const hEu = String(nos.find((n) => n.id === "jxj-card-eu").innerHTML), hEle = String(nos.find((n) => n.id === "jxj-card-ele").innerHTML);
      if (!/jxj-mao/.test(hEu) || !/jxj-mao/.test(hEle) || !/class="vazio"[^>]*>.*?0</.test(hEle)) throw new Error("mão no placar: " + hEle.replace(/\s+/g, " ").slice(0, 300));
      const bq = nos.filter((n) => tem(n, "jxj-acao")).find((b) => /Queda|queda/.test(String(b.innerHTML)));
      if (!bq || !tem(bq, "sem-carta") || !bq.disabled) throw new Error("botão da Queda sem carta");
      const dica = nos.find((n) => tem(n, "jxj-dica-mao"));
      if (!dica || !/só tem Defesa e Pressão/.test(String(dica.innerHTML))) throw new Error("dica da primeira luta: " + (dica && dica.innerHTML));
      semLixoV3(htmlDe(nos), "mão à vista");
      await mexer((e) => { delete e.mao; });
      m = await abrir(`luta/${lid}`); nos = desde(m);
      if (nos.some((n) => tem(n, "sem-carta")) || /jxj-mao"/.test(htmlDe(nos))) throw new Error("luta sem mão mostrou mão");
      semLixoV3(htmlDe(nos), "luta sem mão");
      await mexer((e) => { e.mao = { a: { golpes: 2, queda: 1, defesa: 2, pressao: 1 }, b: { golpes: 2, queda: 1, defesa: 2, pressao: 1 } }; });
    });
```

(A luta `lid` do `jxjtelas` é a primeira luta dos dois lutadores: `cartel` [0, 0, 0] no `nomes`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node testar.js jxjtelas`
Expected: FAIL ("mão no placar").

- [ ] **Step 3: Implement**

`index.html`, junto das outras funções `jxj*` da luta:

```js
/* mão à vista (v4): quantas ações de cada família restam no round */
const JXJ_FAMILIA_TXT={golpes:"Golpes",queda:"Queda",defesa:"Defesa",pressao:"Pressão"};
function jxjMao(maos,l){
  if(!maos||!maos[l])return "";
  const m=maos[l],F=["golpes","queda","defesa","pressao"];
  return `<span class="jxj-mao" role="img" aria-label="Ações que restam no round: ${F.map(f=>`${JXJ_FAMILIA_TXT[f]} ${m[f]}`).join(", ")}">${F.map(f=>`<i${m[f]?"":` class="vazio"`}>${ICONE(JXJ_ICONE_ACAO[f]||"luta")}${m[f]}</i>`).join("")}</span>`;
}
/* dica da primeira luta (cartel vazio no começo da luta) */
function jxjDicaMao(v,eu,ele){
  const c=v.nomes[eu]&&v.nomes[eu].cartel;
  if(!v.maos||!Array.isArray(c)||c.some(x=>x>0))return "";
  const tem=["golpes","queda","defesa","pressao"].filter(f=>v.maos[ele][f]>0).map(f=>JXJ_FAMILIA_TXT[f]);
  if(v.round===1&&v.troca===1)return "Cada round você tem 6 ações. A que você usar sai da mão; a mão dele aparece no placar.";
  if(tem.length&&tem.length<=2)return `Ele só tem ${tem.join(" e ")} neste round.`;
  return "";
}
```

No `lado(l,souEu)` do placar, depois de `${jxjEtiquetas(e,l)}</span>`: `${jxjMao(v.maos,l)}`.

Antes de montar os botões (logo antes de `const g=el("div","jxj-acoes-luta"...`):

```js
    const dicaMao=jxjDicaMao(v,eu,ele);
    if(dicaMao)zona.appendChild(el("p","jxj-dica-mao",`${ICONE("info")}<span>${dicaMao}</span>`));
```

No laço dos botões: `const semCarta=a.restam===0;`, a classe `"jxj-acao"+(a.dica?" com-dica":"")+(semCarta?" sem-carta":"")`, um `<em class="jxj-restam" aria-label="Restam ${a.restam}">${a.restam}</em>` dentro de `.jxj-acao-topo` quando `a.restam!=null`, e depois de criar o botão: `if(semCarta){ b.disabled=true; b.title="Você já usou essa ação neste round."; }`.

`estilo.css`, bloco novo:

```css
/* Online: mão à vista (v4, 2026-10-27) */
.jxj-mao{display:flex;gap:6px;flex-wrap:wrap;font-size:12px;color:var(--osso-2)}
.jxj-mao i{display:inline-flex;align-items:center;gap:2px;font-style:normal}
.jxj-mao i .icone{width:12px;height:12px}
.jxj-mao i.vazio{opacity:.35}
.jxj-restam{font-style:normal;font-weight:700;min-width:18px;text-align:center;border-radius:9px;background:var(--fundo-3);padding:0 5px}
.jxj-acao.sem-carta{opacity:.4;filter:grayscale(1);cursor:not-allowed}
.jxj-dica-mao{display:flex;gap:6px;align-items:center;font-size:13px;color:var(--osso-2);margin:4px 0}
```

(Antes de escrever, conferir no `estilo.css` os nomes das variáveis de cor que existem, como `--osso`, e o nome do ícone `info` no sprite; usar os que existem.)

- [ ] **Step 4: Run tests**

Run: `node testar.js jxjtelas` e `node testar.js texto`
Expected: tudo `ok`.

- [ ] **Step 5: Commit**

```bash
git add index.html estilo.css testar.js
git commit -m "Online v4: a mão no placar e nos botões, dica da primeira luta"
git push
```

---

### Task 7: Medir, calibrar e documentar

**Files:**
- Modify (se a medição pedir): `api/_jxj-estrategia.js`, `api/_jxj-bot.js` (`PESOS_VALOR`, `FORCA_BOT`)
- Modify: `testar.js` (só se uma faixa da spec mudar, com o motivo), `LEIA-ME.md`, `CLAUDE.md`, `PENDENCIAS.md`

- [ ] **Step 1: Medir antes e depois**

Run (no `master`, motor v3, pra registrar o antes): `node ferramentas/jxj-balanco.mjs matriz` e `leitura`.
Run (na branch): `node testar.js jxjmotor`, `node ferramentas/jxj-balanco.mjs matriz`, `leitura`, `momentos`, `mao`.
Expected: estilos 45% a 57%, métodos nas faixas, trocas óbvias até 15%, contador acima do racional contra o estilo. Se algo sair da faixa, ajustar só números de `ESTRATEGIA` (mão, energia por carta) ou, se for o motor, com medição e anotação.

- [ ] **Step 2: Bots**

Run: `node testar.js jxjbot`. Se `PESOS_VALOR` não bater, copiar os pesos novos que o teste imprime. Medir a força (`node ferramentas/jxj-balanco.mjs personalidades`, 2 sementes) e copiar em `FORCA_BOT`. Meta: bot forte perto de 46% a 50% contra o jogador de estilo.

- [ ] **Step 3: Documentar**

LEIA-ME: seção "Online: estratégia por informação, fase 1 (mão à vista)" com regras, números antes e depois, testes e o SQL. CLAUDE.md: um item curto (motor v4, `api/_jxj-estrategia.js`, versão de balanceamento 3 e o SQL antes do deploy). PENDENCIAS: item novo com o que falta (fases 2 a 4, SQL, deploy).

- [ ] **Step 4: Bateria completa**

Run: `node testar.js` (em background, cerca de 45 min). Expected: `TUDO CERTO`.

- [ ] **Step 5: Checklist manual com duas janelas**

Run: `node ferramentas/jogar-online-local.mjs 2` (de uma pasta com `puppeteer-core`). Conferir: as duas mãos no placar; usar as 2 Defesas e ver o botão apagar; deixar o prazo de 12 s estourar sem Defesa (sai Pressão); fechar uma janela no meio do round e voltar (mão igual); fim do round com cartas guardadas (energia sobe); tentar a ação gasta pelo console (`jxj("acao", {...})`) e ver o erro; luta contra bot até o fim.

- [ ] **Step 6: Commit**

```bash
git add -A api testar.js LEIA-ME.md CLAUDE.md PENDENCIAS.md ferramentas
git commit -m "Online v4: fase 1 medida e documentada"
git push
```
