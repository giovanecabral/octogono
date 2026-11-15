# Cartas da árvore: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cada nó da árvore libera uma carta do combate v2 do Online, com raridade, estrelas, imagem própria e lance próprio no 3D, sem quebrar o equilíbrio medido.

**Architecture:** o catálogo mora em `api/_jxj-cartas.js` (dados declarativos), o motor (`api/_jxj-combate2.js`) ganha a regra da casa, as estrelas e 15 mecânicas novas, o servidor (`api/_jxj-luta2.js`, `api/jxj.js`) manda o catálogo e valida o deck, a simulação (`sim/`) dá os números, a tela (`index.html`, `estilo.css`) desenha raridade, arte, estrelas e a carta nova chegando, e o 3D (`luta3d/`) toca um lance por carta. Etapa 1 (tarefas 1 a 12) antes de tudo; depois as etapas 2 (13 a 15), 3 (16) e 4 (17 a 19) em paralelo, cada uma num worktree, com merge no `combate-v2`.

**Tech Stack:** Node 22 (ESM, `node:crypto`, worker_threads), JS puro no navegador, three.js r169 (`luta3d/vendor`), PGlite nos testes do servidor, Chrome do sistema pelo protocolo de depuração pros prints.

**Spec:** `docs/superpowers/specs/2026-11-13-cartas-colecao-design.md` (aprovada pelo dono em 2026-11-15). Leia antes de qualquer tarefa.

## Global Constraints

- Sem deploy, sem `vercel`, sem SQL fora do PGlite local, sem mexer em variável de ambiente, sem segredo, sem push na `master`. Push só do branch `combate-v2`, depois da bateria verde.
- Download só com o sim do dono, um pedido por lote, dizendo o nome do arquivo, a origem e o tamanho. Nunca digitar senha.
- `luta3d/mx_lutas.glb` e o novo `luta3d/mx_cartas.glb` nunca vão pro git (licença do Mixamo; o repositório é público).
- Texto visível em português, sem travessão, sem frase de efeito, sem emoji, sem seta ou estrela em caractere (`node testar.js texto`). Ícone só do sprite (`ICONE(nome)`).
- Nome de outro jogador sempre escapado (`jxjEsc`). Teste de classe sempre token-based (`(n.className||"").split(" ").includes("x")`), nunca `===`.
- Toda substituição de texto com `assert` de que casou uma vez. Todo teste novo com dente provado (quebrar, ver reprovar, restaurar).
- A luta v1 do Online e a carreira não mudam nada (`node testar.js jxj`, `jxjmotor`, `driverluta`).
- O nível 1 com deck padrão continua igual ao relatório aprovado (sim: `SIM_PARTES=matriz,categorias,pesos,habilidade,decks`, comparar com `git show 25716d8:sim/relatorio.md`).
- Portões da spec: carta jogada de 40% a 60%; nó de 0,5 a 6,5 pontos; nível 30 de 45% a 55% (deck padrão e melhor deck); deck aleatório até 60%; 30 contra 1 de 62% a 85%; 30 contra 20 acima de 50%.
- Comentários em português, no estilo do arquivo. Decisões novas em `docs/combat-v2-decisions.md`, numeradas a partir de 80.

## Review Focus

1. Deck salvo que deixou de valer com o catálogo novo (por exemplo, 2 cópias de uma carta que virou épica): a luta usa o padrão e o estado diz `deckMontado: false`. Teste na Tarefa 12.
2. Carta da árvore jogada fora da casa: a estrela nunca vale na carta básica que ela vira. Teste na Tarefa 2.
3. Build híbrida forjada com nó de andar 3 ou 4 de outro estilo: a épica ou lendária de outro estilo não aparece como liberada. Teste na Tarefa 1.
4. Efeito de "próxima troca" (lento, rápido, sangra) no fim do round: não atravessa pro round seguinte. Teste na Tarefa 4.
5. `mx_cartas.glb` ausente (o deploy do push sai sem ele): a luta toca o lance de reserva com os clipes de hoje e não trava. Teste na Tarefa 18.

---

## Etapa 1: catálogo e regras

### Task 1: o modelo da carta (raridade, casa, nó, cópias, liberadas, estrelas)

**Files:**
- Modify: `api/_jxj-cartas.js` (CARTAS, loop do `contexto`, `cartasLiberadas`, `ARVORE_V2`, `perfilV2`, `validarDeck`)
- Modify: `api/_jxj-combate2.js:71-74` (vida, finta e energia do perfil.v2, que somem)
- Modify: `api/_jxj-luta2.js` (`definicoes2`: `arvore` gerado das cartas e `desbloqueio` = `no`, pra tela de hoje seguir funcionando)
- Modify: `sim/ajuste.mjs` (a chave `arvore` some)
- Test: `testar.js`, suítes `combate2`, `jxj`, `jxjtelas`, `jxjv2` (testes da Fase 4 que olhavam `ARVORE_V2` ou `mods`)

**Interfaces:**
- Produces:
  - `CARTAS[id]` com `{ nome, categoria, casa, raridade, no, vel, dano, custo, duelo, efeitos, estrela3, inanulavel?, estiloExclusivo? }`; `casa` em `"pe" | "cima" | "baixo"`, `raridade` em `"comum" | "rara" | "epica" | "lendaria"`, `no` = id do nó ou `null`, `estrela3` = mod (`{ vel?, dano?, custo?, efeitos? }`).
  - `RARIDADES = ["comum", "rara", "epica", "lendaria"]`; `COPIAS = { comum: 2, rara: 2, epica: 1, lendaria: 1 }`.
  - `BASICA_PE = { golpes: "jab", queda: "queda", defesa: "bloqueio", pressao: "clinch" }`.
  - `CARTA_DO_NO = { [noId]: cartaId }`.
  - `cartasLiberadas(estilo, build = {}) -> string[]`.
  - `estrelasDe(build = {}) -> { [cartaId]: 1 | 2 | 3 }`.
  - `perfilV2(estilo, build = {}) -> { liberadas: string[], estrelas: {[cartaId]: number} }`.
  - `validarDeck(estilo, deck, liberadas)` com cópias por raridade.

- [ ] **Step 1: Write the failing test** (no fim da `testarCombate2`, no lugar dos testes "árvore v2: ..." e "carta nova da árvore: ...", que saem)

```js
  await conf("catálogo: toda carta tem casa, raridade e nó coerentes; cada nó da árvore libera exatamente uma carta, com a raridade do andar (1 e 2 rara, 3 épica, 4 lendária); as comuns não têm nó", () => {
    const porNo = {};
    for (const [id, c] of Object.entries(C.CARTAS)) {
      if (!["pe", "cima", "baixo"].includes(c.casa) || !C.RARIDADES.includes(c.raridade)) throw new Error("casa ou raridade: " + id);
      if ((c.raridade === "comum") !== (c.no == null)) throw new Error("comum com nó ou carta da árvore sem nó: " + id);
      if (c.no) { if (porNo[c.no]) throw new Error("dois nós iguais: " + c.no); porNo[c.no] = id; }
      if (c.contexto !== c.casa) throw new Error("contexto diferente da casa: " + id);
    }
    for (const r of Object.values(A.RAMOS)) r.nos.forEach((n, i) => {
      const id = porNo[n.id];
      if (!id) throw new Error("nó sem carta: " + n.id);
      const esperada = i < 2 ? "rara" : i === 2 ? "epica" : "lendaria";
      if (C.CARTAS[id].raridade !== esperada) throw new Error(`${id}: ${C.CARTAS[id].raridade}, esperava ${esperada}`);
      if (C.CARTA_DO_NO[n.id] !== id) throw new Error("CARTA_DO_NO: " + n.id);
    });
    if (Object.keys(porNo).length !== 48) throw new Error("cartas da árvore: " + Object.keys(porNo).length);
  });
  await conf("liberadas e estrelas: comuns sempre (puxar guarda só no grappler); nó no nível 1 libera a carta com 1 estrela, nível 3 dá 3; nó desconhecido ou nível 0 não dá nada; build híbrida forjada com nó de andar 3 de outro estilo não libera a épica", () => {
    const lib = C.cartasLiberadas("striker");
    for (const id of ["jab", "cruzado", "chute_alto", "bloqueio", "contra_ataque", "queda", "antiqueda", "clinch"]) if (!lib.includes(id)) throw new Error("comum faltando: " + id);
    if (lib.includes("puxar_guarda") || !C.cartasLiberadas("grappler").includes("puxar_guarda")) throw new Error("puxar guarda");
    if (lib.some((id) => C.CARTAS[id].no)) throw new Error("carta da árvore sem nó");
    const b = { precisao_maos: 1, combinacoes: 3, xyz: 3, chute_baixo: 0 };
    const l2 = C.cartasLiberadas("striker", b), est = C.estrelasDe(b);
    if (!l2.includes(C.CARTA_DO_NO.precisao_maos) || !l2.includes(C.CARTA_DO_NO.combinacoes) || l2.includes(C.CARTA_DO_NO.chute_baixo)) throw new Error("liberadas: " + l2);
    if (est[C.CARTA_DO_NO.precisao_maos] !== 1 || est[C.CARTA_DO_NO.combinacoes] !== 3 || Object.keys(est).length !== 2) throw new Error("estrelas: " + JSON.stringify(est));
    /* híbrido: rara de outro estilo sim (andar 1 e 2), épica e lendária nunca */
    const hib = C.cartasLiberadas("striker", { entradas: 1, timing_queda: 3, eficiencia_tentativas: 3 });
    if (!hib.includes(C.CARTA_DO_NO.entradas) || hib.includes(C.CARTA_DO_NO.timing_queda) || hib.includes(C.CARTA_DO_NO.eficiencia_tentativas)) throw new Error("híbrido: " + hib);
    const p = C.perfilV2("striker", b);
    if (JSON.stringify(p.liberadas) !== JSON.stringify(l2) || JSON.stringify(p.estrelas) !== JSON.stringify(est)) throw new Error("perfilV2");
  });
  await conf("deck: cópias pela raridade (comum e rara 2, épica e lendária 1), carta não liberada recusada", () => {
    const epica = C.CARTA_DO_NO.contra_maos, rara = C.CARTA_DO_NO.precisao_maos;
    const lib = C.cartasLiberadas("striker", { precisao_maos: 1, combinacoes: 1, contra_maos: 1 });
    const base = C.DECK_PADRAO.striker.slice(0, 10);
    if (!C.validarDeck("striker", [...base, rara, rara], lib).ok) throw new Error("2 raras recusadas");
    const v = C.validarDeck("striker", [...base, epica, epica], lib);
    if (v.ok || !/cópia/.test(v.erro)) throw new Error("2 épicas passaram: " + JSON.stringify(v));
    const sem = C.validarDeck("striker", [...base, rara, rara]);
    if (sem.ok || !/liberada/.test(sem.erro)) throw new Error("carta sem o nó passou");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node testar.js combate2 2>&1 | grep "falha" | head`
Expected: FAIL nos 3 testes novos ("casa ou raridade: jab" e afins).

- [ ] **Step 3: Write minimal implementation**

Em `api/_jxj-cartas.js`:

```js
export const RARIDADES = ["comum", "rara", "epica", "lendaria"];
export const COPIAS = { comum: 2, rara: 2, epica: 1, lendaria: 1 };
/* fora da casa, a carta joga como a básica da categoria ali (em pé: estas; no chão: CHAO) */
export const BASICA_PE = { golpes: "jab", queda: "queda", defesa: "bloqueio", pressao: "clinch" };
```

Nas 9 comuns de hoje, acrescente `casa: "pe", raridade: "comum", no: null, estrela3: null` (Puxar guarda mantém `estiloExclusivo: "grappler"`). As 4 cartas da Fase 4 (`combinacao`, `double_leg`, `rasteira`, `esquiva`) perdem `desbloqueio` e `estiloExclusivo` e ganham `no` (a Tarefa 8 completa o catálogo; aqui basta o modelo, então crie já as 48 entradas com os números e efeitos da Tarefa 8, ou crie as 48 com `efeitos: []` e deixe os efeitos pra Tarefa 8: o teste desta tarefa só olha casa, raridade e nó).

Troque o loop do `contexto`:

```js
for (const [id, c] of Object.entries(CARTAS)) Object.assign(c, { id, contexto: c.casa });
export const CARTA_DO_NO = Object.fromEntries(Object.values(CARTAS).filter((c) => c.no).map((c) => [c.no, c.id]));
```

Troque `cartasLiberadas`, apague `ARVORE_V2`, `ESCALA_EFEITO`, `escalarEfeitos`, `contraGolpe`, `contraQueda` (mantenha o helper `efeito`, a Tarefa 8 usa) e troque `perfilV2`:

```js
import { NOS, TIERS_HIBRIDOS } from "./_jxj-arvores.js";
/* cartas que o lutador pode pôr no deck: as comuns (a exclusiva só no estilo dela) e a do
   nó que ele tem. Híbrido (nó de outro estilo) só nos andares que a árvore deixa: a build
   forjada com andar alto de outro estilo não libera a carta */
export function cartasLiberadas(estilo, build = {}) {
  return Object.keys(CARTAS).filter((id) => {
    const c = CARTAS[id];
    if (!c.no) return !c.estiloExclusivo || c.estiloExclusivo === estilo;
    const nv = Number((build || {})[c.no]) || 0, no = NOS[c.no];
    if (nv < 1 || !no) return false;
    return no.estilo === estilo || no.tier <= TIERS_HIBRIDOS;
  });
}
/* estrelas da carta: o nível do nó (1 a 3) */
export function estrelasDe(build = {}) {
  const out = {};
  for (const [no, nv] of Object.entries(build || {})) { const n = Math.min(3, Number(nv) || 0); if (n >= 1 && CARTA_DO_NO[no]) out[CARTA_DO_NO[no]] = n; }
  return out;
}
export const perfilV2 = (estilo, build = {}) => ({ liberadas: cartasLiberadas(estilo, build), estrelas: estrelasDe(build) });
```

(Se importar `_jxj-arvores.js` criar ciclo, o `_jxj-arvores.js` não importa `_jxj-cartas.js` hoje: confira com `grep -n "import" api/_jxj-arvores.js`; `NOS` e `TIERS_HIBRIDOS` já são exportados.)

No `validarDeck`, troque a regra de cópias:

```js
    const max = COPIAS[CARTAS[id].raridade] || DECK.copias;
    if (conta[id] > max) return { ok: false, erro: `no máximo ${max} ${max === 1 ? "cópia" : "cópias"} de ${CARTAS[id].nome}` };
```

Em `api/_jxj-combate2.js`, o perfil não tem mais vida, finta nem energia da árvore:

```js
export const vidaMax = (p) => r1(K2.vidaBase + (p.atr.queixo - 50) * K2.vidaPorQueixo);
export const fintaDe = () => K2.custoFinta;
```

e em `fecharRound2` tire o `extra` (`perfis[l].v2.energiaRound`).

- [ ] **Step 4: Dependentes da Fase 4**

A tela de hoje (`index.html`: `jxjReferencia2`, a árvore em `v2Carta`/`v2Txt`, `jxjLiberadas2`, a aba Deck) lê `desbloqueio`, `estiloExclusivo` e `definicoes.combate2.arvore`. Mantenha os três no `definicoes2` até a etapa 2:

```js
    // carta(): ...
    estiloExclusivo: c.estiloExclusivo || null, desbloqueio: c.no || null,
      raridade: c.raridade, casa: c.casa, no: c.no || null, estrela3: c.estrela3 || null, inanulavel: !!c.inanulavel,
    // no lugar do arvore da Fase 4:
    arvore: Object.fromEntries(Object.values(C.CARTAS).filter((c) => c.no).map((c) => [c.no, [`Libera a carta ${c.nome} (${NOME_RARIDADE[c.raridade]}).`]])),
```

com `export const NOME_RARIDADE = { comum: "comum", rara: "rara", epica: "épica", lendaria: "lendária" }` em `_jxj-cartas.js`. Tire a chave `arvore` de `sim/ajuste.mjs`.

Testes da Fase 4 que mudam (rode cada suíte e conserte só estes):
- `combate2`: "árvore v2: ...", "carta nova da árvore: ..." e "árvore v2 no motor: ..." saem (os desta tarefa e da Tarefa 2 cobrem); "perfil da luta v2: ..." passa a conferir `p.v2.estrelas[C.CARTA_DO_NO.precisao_maos] === 3` no lugar de `modDe(p.v2, "jab")`.
- `jxj`: "árvore no combate v2 pelo servidor" confere `L.perfis[eu].v2.estrelas[CT.CARTA_DO_NO.precisao_maos] === 3` no lugar do `mods` do Jab.
- `jxjtelas`: no teste "combate v2, árvore: ...", o nó Precisão agora também libera carta (o Direto): o detalhe dele tem `com-carta` e `data-carta="direto"`.
- `jxjv2`: na "referência da v2", a lista do striker passa a ter a rara de outro estilo que ele pode comprar como híbrido (a `esquiva`), e nunca a épica ou lendária de outro estilo (confira `leitura_total` fora) nem o `puxar_guarda`; o texto esperado da `rasteira` fica como está.

- [ ] **Step 5: Run tests to verify they pass**

Run: `for s in combate2 jxj jxjtelas jxjv2 jxjbot; do node testar.js $s 2>&1 | tail -1; done`
Expected: as 5 com `ok`.

- [ ] **Step 6: Commit**

```bash
git add api/_jxj-cartas.js api/_jxj-combate2.js api/_jxj-luta2.js sim/ajuste.mjs testar.js
git commit -m "Cartas da árvore: modelo (casa, raridade, nó, cópias, liberadas, estrelas)"
```

### Task 2: a carta efetiva (casa, básica fora dela e estrelas)

**Files:**
- Modify: `api/_jxj-combate2.js` (`cartaEfetiva`, perto da linha 108)
- Test: `testar.js`, `combate2`

**Interfaces:**
- Consumes: `CARTAS`, `BASICA_PE`, `CHAO`, `perfil.v2.estrelas` (Tarefa 1).
- Produces: `cartaEfetiva(id, pp, perfil)` devolve a carta com `origem` (id da mão), `naCasa` (bool), `estrelas` (0 a 3) e os números já com passiva e estrelas.

- [ ] **Step 1: Write the failing test**

```js
  await conf("casa: na casa a carta joga como ela; fora, como a básica da categoria (em pé, BASICA_PE; no chão, CHAO); a estrela vale só na casa (estrela 2: +0,5 de dano, ou +0,5 ponto quando funciona; estrela 3: o mod da carta)", () => {
    const cima = Object.values(C.CARTAS).find((c) => c.casa === "cima" && c.categoria === "golpes");
    const pe = C.CARTA_DO_NO.precisao_maos;   // Direto: golpe em pé, com dano
    const semDano = Object.values(C.CARTAS).find((c) => c.no && c.casa === "pe" && c.dano === 0 && c.efeitos.some((ef) => ef.quando === "contra"));
    const P = (build) => ({ ...neutro("striker"), v2: C.perfilV2("striker", build) });
    if (M.cartaEfetiva(cima.id, "cima", P({})).id !== cima.id) throw new Error("na casa");
    if (M.cartaEfetiva(cima.id, "pe", P({})).id !== C.BASICA_PE.golpes) throw new Error("fora da casa, em pé");
    if (M.cartaEfetiva(cima.id, "baixo", P({})).id !== C.CHAO.baixo.golpes.id) throw new Error("fora da casa, por baixo");
    if (M.cartaEfetiva(pe, "cima", P({})).id !== C.CHAO.cima.golpes.id) throw new Error("carta em pé no chão");
    const b1 = M.cartaEfetiva(pe, "pe", P({ precisao_maos: 1 })), b2 = M.cartaEfetiva(pe, "pe", P({ precisao_maos: 2 }));
    if (Math.abs(b2.dano - b1.dano - 0.5) > 1e-9 || b2.estrelas !== 2) throw new Error("estrela 2 com dano: " + [b1.dano, b2.dano]);
    if (M.cartaEfetiva(pe, "cima", P({ precisao_maos: 3 })).dano !== C.CHAO.cima.golpes.dano) throw new Error("estrela valeu fora da casa");
    const s2 = M.cartaEfetiva(semDano.id, "pe", { ...neutro(), v2: { liberadas: [], estrelas: { [semDano.id]: 2 } } });
    if (!s2.efeitos.some((ef) => ef.quando === "contra" && ef.acao.pontos >= 0.5)) throw new Error("estrela 2 sem dano: " + JSON.stringify(s2.efeitos));
    const e3 = Object.values(C.CARTAS).find((c) => c.no && c.estrela3 && c.estrela3.custo);
    const c3 = M.cartaEfetiva(e3.id, e3.casa, { ...neutro(), v2: { liberadas: [], estrelas: { [e3.id]: 3 } } });
    if (c3.custo !== Math.max(0, e3.custo + e3.estrela3.custo)) throw new Error("estrela 3 (custo): " + c3.custo);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node testar.js combate2 2>&1 | grep "casa:"`
Expected: FAIL ("na casa" ou "fora da casa, em pé": hoje toda carta da mão vira CHAO no chão e não existe carta de casa `cima`).

- [ ] **Step 3: Write minimal implementation**

```js
/* aplica um mod (da passiva ou da estrela 3) na carta */
function aplicarMod(c, m) {
  if (m.vel) c.vel += m.vel;
  if (m.dano) c.dano += m.dano;
  if (m.custo) c.custo = Math.max(0, c.custo + m.custo);
  if (m.efeitos) c.efeitos.push(...m.efeitos);
}
/* estrela 2 na carta sem dano: +0,5 ponto quando ela funciona (reação ou carta que resolve) */
const comMeioPonto = (efs) => efs.map((ef) => (ef.quando === "contra" || ef.quando === "se_acerta") ? { ...ef, acao: { ...ef.acao, pontos: (ef.acao.pontos || 0) + 0.5 } } : ef);
export function cartaEfetiva(id, pp, perfil) {
  const origem = CARTAS[id];
  if (!origem) throw new Error("carta desconhecida: " + id);
  const naCasa = origem.casa === pp;
  const base = naCasa ? origem : pp === "pe" ? CARTAS[BASICA_PE[origem.categoria]] : CHAO[pp][origem.categoria];
  const c = { ...base, origem: id, naCasa, danoBase: base.dano, efeitos: base.efeitos.slice(), estrelas: 0 };
  const pas = perfil && PASSIVAS[perfil.estilo];
  for (const m of (pas ? pas.mods : [])) if (casaAlvo(m.alvo, c)) aplicarMod(c, m);
  /* estrelas: só a carta da árvore, só na casa */
  const nv = naCasa && origem.no && perfil && perfil.v2 && perfil.v2.estrelas ? perfil.v2.estrelas[id] || 0 : 0;
  c.estrelas = nv;
  if (nv >= 2) { if (c.dano > 0) c.dano += 0.5; else c.efeitos = comMeioPonto(c.efeitos); }
  if (nv >= 3 && origem.estrela3) aplicarMod(c, origem.estrela3);
  return c;
}
```

Importe `BASICA_PE` de `_jxj-cartas.js`. O `casaAlvo` continua olhando `c.id` (a carta efetiva).

- [ ] **Step 4: Run test to verify it passes**

Run: `node testar.js combate2 2>&1 | tail -3`
Expected: `combate2 ok` (os testes de chão de hoje continuam passando: carta em pé no chão vira CHAO como antes).

- [ ] **Step 5: Commit**

```bash
git add api/_jxj-combate2.js testar.js
git commit -m "Cartas da árvore: casa, básica fora dela e estrelas na carta efetiva"
```

### Task 3: condições novas, reação ampliada e carta inanulável

**Files:**
- Modify: `api/_jxj-combate2.js` (`casaCond`, laço das reações e da interrupção em `resolverNormal`, `aplicarAcaoPropria`)
- Test: `testar.js`, `combate2`

**Interfaces:**
- Produces (na condição): `danoMin`, `danoMax` (olham `danoBase` da carta dele). No efeito `resistente`: `condicao` passa a valer. Na carta: `inanulavel: true`. Na reação (`contra`), passam a valer `energiaOponente`, `poeEmCima`, `recua`, `tiraGrogue` (as três últimas implementadas nas Tarefas 5 e 6; aqui só a `energiaOponente`). No `se_interrompe`: `danoExtra` aplica dano a mais.

- [ ] **Step 1: Write the failing test**

Use o `luta()` da suíte com mãos montadas e uma carta de teste injetada em `C.CARTAS` (apague no fim do teste):

```js
  await conf("condições e reações novas: danoMin/danoMax na reação; resistente com condição; inanulável passa pela reação; reação que tira energia; se_interrompe com dano a mais", () => {
    const tmp = (id, c) => { C.CARTAS[id] = { id, contexto: "pe", casa: "pe", raridade: "rara", no: null, estrela3: null, duelo: null, ...c }; return id; };
    try {
      tmp("t_grande", { nome: "Grande", categoria: "defesa", vel: 5, dano: 0, custo: 0, efeitos: [{ quando: "contra", condicao: { categoria: ["golpes"], danoMin: 3 }, acao: { anula: true } }] });
      tmp("t_pequeno", { nome: "Pequeno", categoria: "defesa", vel: 5, dano: 0, custo: 0, efeitos: [{ quando: "contra", condicao: { categoria: ["golpes"], danoMax: 2 }, acao: { anula: true, energiaOponente: -1 } }] });
      tmp("t_rodado", { nome: "Rodado", categoria: "golpes", vel: 1, dano: 5, custo: 3, efeitos: [{ quando: "resistente", condicao: { categoria: ["golpes"] }, acao: { ateDano: 3 } }] });
      tmp("t_over", { nome: "Over", categoria: "golpes", vel: 2, dano: 4, custo: 3, inanulavel: true, efeitos: [] });
      tmp("t_combo", { nome: "Combo", categoria: "golpes", vel: 4, dano: 2, custo: 2, efeitos: [{ quando: "se_interrompe", acao: { danoExtra: 1 } }] });
      const M5 = ["jab", "cruzado", "bloqueio", "queda", "clinch"];
      let r = troca(luta(["t_grande", ...M5.slice(1)], M5), "t_grande", "cruzado");
      if (!tem(r, "anulou", "a")) throw new Error("danoMin 3 não anulou o Cruzado");
      r = troca(luta(["t_grande", ...M5.slice(1)], M5), "t_grande", "jab");
      if (tem(r, "anulou", "a")) throw new Error("danoMin 3 anulou o Jab");
      const x = luta(["t_pequeno", ...M5.slice(1)], M5), antes = x.e.b.energia;
      r = troca(x, "t_pequeno", "jab");
      if (!tem(r, "anulou", "a") || r.estado.b.energia !== Math.round((antes - 1 - 1) * 100) / 100) throw new Error("danoMax e energiaOponente na reação: " + r.estado.b.energia);
      r = troca(luta(["t_rodado", ...M5.slice(1)], M5), "t_rodado", "cruzado");
      if (!tem(r, "resistiu", "a") || !(r.resolucao.dano.a > 0)) throw new Error("resistente com condição (contra golpe) não segurou");
      r = troca(luta(["t_rodado", ...M5.slice(1)], ["clinch", ...M5.slice(0, 4)]), "t_rodado", "clinch");
      if (tem(r, "resistiu", "a")) throw new Error("resistente valeu contra pressão");
      r = troca(luta(["t_over", ...M5.slice(1)], M5), "t_over", "bloqueio");
      if (tem(r, "anulou", "b") || !(r.resolucao.dano.a > 0)) throw new Error("inanulável foi anulada");
      r = troca(luta(["t_combo", ...M5.slice(1)], M5), "t_combo", "cruzado");
      if (r.resolucao.dano.a !== 3) throw new Error("se_interrompe com dano a mais: " + r.resolucao.dano.a);
    } finally { for (const id of ["t_grande", "t_pequeno", "t_rodado", "t_over", "t_combo"]) delete C.CARTAS[id]; }
  });
```

(O dano exato depende de `neutro("wrestler")`, com atributos 50 e sem passiva de golpe: Combo 2 mais 1 = 3.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node testar.js combate2 2>&1 | grep "condições e reações"`
Expected: FAIL ("danoMin 3 anulou o Jab" ou "danoMax e energiaOponente na reação").

- [ ] **Step 3: Write minimal implementation**

```js
// casaCond, depois do teste de categoria:
  if (cond.danoMin != null && !(cOp.danoBase >= cond.danoMin)) return false;
  if (cond.danoMax != null && !(cOp.danoBase <= cond.danoMax)) return false;

// laço das reações em resolverNormal: a carta inanulável não dispara a reação dele
    for (const ef of efeitosDe(jog[l].c, "contra")) {
      if (jog[o].c.inanulavel) break;
      if (!casaCond(ef.condicao, jog[o].c, e, o)) continue;
      ...

// resistente com condição
    const resiste = efeitosDe(jog[s].c, "resistente").some((ef) => casaCond(ef.condicao, jog[r].c, e, r) && jog[r].c.danoBase <= ef.acao.ateDano);

// interrupção: o se_interrompe com danoExtra bate de novo (depois do evento interrompeu)
      for (const ef of efeitosDe(jog[r].c, "se_interrompe")) {
        aplicarAcaoPropria(e, r, ef.acao, ctx, jog[r].c);
        if (ef.acao.danoExtra) { aplicarDano(e, perfis, jog, r, ef.acao.danoExtra, ctx); if (e.fim) return; }
      }

// aplicarAcaoPropria: energia do outro também na reação
  if (acao.energiaOponente) { const o = outro(l), antes = e[o].energia; e[o].energia = r2(Math.max(0, e[o].energia + acao.energiaOponente)); if (antes !== e[o].energia) ctx.ev.push({ tipo: "energia", quem: o, carta: c.id, ganho: r2(e[o].energia - antes) }); }
```

Tire a linha da `energiaOponente` de `aplicarAcao` (ela passa a vir pela `aplicarAcaoPropria`, que `aplicarAcao` já chama), pra não tirar energia duas vezes.

- [ ] **Step 4: Run test to verify it passes**

Run: `node testar.js combate2 2>&1 | tail -3`
Expected: `combate2 ok`.

- [ ] **Step 5: Commit**

```bash
git add api/_jxj-combate2.js testar.js
git commit -m "Combate v2: condição por dano, resistente com condição, inanulável, reação que tira energia, dano a mais ao interromper"
```

### Task 4: efeitos da próxima troca e do round (lento, rápido, sangra)

**Files:**
- Modify: `api/_jxj-combate2.js` (`ladoNovo`, `velocidade`, `danoDe`, `calcularCarta`, fim da troca em `resolverTroca2`, `fecharRound2`, `aplicarAcaoPropria`)
- Test: `testar.js`, `combate2`

**Interfaces:**
- Produces: ações `lentoProxima`, `rapidoProxima`, `sangra`; campos do lado `lento`, `lentoProx`, `rapido`, `rapidoProx` (números) e `sangra` (bool); eventos `lento`, `rapido`, `sangrou`.

- [ ] **Step 1: Write the failing test**

```js
  await conf("próxima troca e round: lentoProxima deixa ele 1 mais lento só na troca seguinte; rapidoProxima deixa você 1 mais rápido só na seguinte; sangra dá +0,5 nos seus golpes até o fim do round; nada disso atravessa o round", () => {
    const tmp = (id, c) => { C.CARTAS[id] = { id, contexto: "pe", casa: "pe", raridade: "rara", no: null, estrela3: null, duelo: null, ...c }; return id; };
    try {
      tmp("t_perna", { nome: "Perna", categoria: "golpes", vel: 4, dano: 1, custo: 1, efeitos: [{ quando: "se_acerta", acao: { lentoProxima: true, sangra: true } }] });
      tmp("t_lado", { nome: "Lado", categoria: "defesa", vel: 4, dano: 0, custo: 0, efeitos: [{ quando: "contra", condicao: { categoria: ["golpes"] }, acao: { anula: true, rapidoProxima: true } }] });
      const M5 = ["jab", "cruzado", "bloqueio", "queda", "clinch"];
      let x = luta(["t_perna", "jab", "cruzado", "bloqueio", "queda"], M5);
      let r = troca(x, "t_perna", "clinch");
      if (!tem(r, "lento", "b") || !tem(r, "sangrou", "b")) throw new Error("eventos: " + r.eventos.map((ev) => ev.tipo));
      x = { e: r.estado, P: x.P };
      r = troca(x, "jab", "cruzado");
      if (r.resolucao.cartas.b.vel !== C.CARTAS.cruzado.vel - 1) throw new Error("não ficou lento: " + r.resolucao.cartas.b.vel);
      if (r.resolucao.dano.a !== 1.5) throw new Error("sangra: " + r.resolucao.dano.a);
      x = { e: r.estado, P: x.P };
      r = troca(x, "cruzado", "bloqueio");   // última troca do round: o lento já passou, o sangra ainda vale
      if (r.resolucao.cartas.b.vel !== C.CARTAS.bloqueio.vel) throw new Error("lento durou duas trocas");
      if (r.estado.round !== 2 || r.estado.b.sangra || r.estado.b.lento || r.estado.b.lentoProx) throw new Error("atravessou o round: " + JSON.stringify(r.estado.b));
      x = luta(["t_lado", "jab", "cruzado", "bloqueio", "queda"], M5);
      r = troca(x, "t_lado", "jab");
      x = { e: r.estado, P: x.P };
      r = troca(x, "cruzado", "bloqueio");
      if (r.resolucao.cartas.a.vel !== C.CARTAS.cruzado.vel + 1) throw new Error("rapidoProxima: " + r.resolucao.cartas.a.vel);
    } finally { delete C.CARTAS.t_perna; delete C.CARTAS.t_lado; }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node testar.js combate2 2>&1 | grep "próxima troca"`
Expected: FAIL ("eventos: ...", sem `lento`).

- [ ] **Step 3: Write minimal implementation**

```js
// ladoNovo: lento: 0, lentoProx: 0, rapido: 0, rapidoProx: 0, sangra: false
// velocidade(), antes do grogue:
  v -= e[l].lento || 0;
  v += e[l].rapido || 0;
// danoDe: novo parâmetro de opções { ..., sangra = false }; depois do grogue:
  if (sangra && ehGolpe(c)) d += K2.sangraDano;
// calcularCarta: passe sangra: !!e[o].sangra
// K2: sangraDano: 0.5
// aplicarAcaoPropria (vale na reação e no se_acerta):
  if (acao.rapidoProxima) { e[l].rapidoProx = 1; ctx.ev.push({ tipo: "rapido", quem: l, carta: c.id }); }
// aplicarAcao (efeito no outro):
  if (a.lentoProxima) { e[o].lentoProx = 1; ctx.ev.push({ tipo: "lento", quem: o, carta: c.id }); }
  if (a.sangra && !e[o].sangra) { e[o].sangra = true; ctx.ev.push({ tipo: "sangrou", quem: o, carta: c.id }); }
// fim da troca (junto do grogue):
  for (const l of L2) { e[l].lento = e[l].lentoProx || 0; e[l].lentoProx = 0; e[l].rapido = e[l].rapidoProx || 0; e[l].rapidoProx = 0; }
// fecharRound2, no laço dos lados:
  Object.assign(e[l], { lento: 0, lentoProx: 0, rapido: 0, rapidoProx: 0, sangra: false });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node testar.js combate2 2>&1 | tail -3`
Expected: `combate2 ok`.

- [ ] **Step 5: Commit**

```bash
git add api/_jxj-combate2.js testar.js
git commit -m "Combate v2: lento e rápido na próxima troca, sangra até o fim do round"
```

### Task 5: posição (reação que derruba, nível na queda e na raspagem, recuar)

**Files:**
- Modify: `api/_jxj-combate2.js` (`aplicarAcaoPropria`, `aplicarAcao`, laço das reações em `resolverNormal`, `posicional`)
- Test: `testar.js`, `combate2`

**Interfaces:**
- Produces: na reação, `poeEmCima` (vai pro chão com quem reagiu por cima, pontos de queda, evento `queda`) e `recua` (posição volta pra guarda, evento `recuou`); `vaiProChao` e `inverte` aceitam `nivel` (0 a 2); `avanca` aceita 2; `recua` também no `se_acerta`.

- [ ] **Step 1: Write the failing test**

```js
  await conf("posição: reação que derruba (poeEmCima: anula a queda e quem reagiu fica por cima, sem 'falhou'); queda e raspagem com nível; avançar 2; recuar volta pra guarda", () => {
    const tmp = (id, c) => { C.CARTAS[id] = { id, raridade: "rara", no: null, estrela3: null, duelo: null, ...c, contexto: c.casa }; return id; };
    try {
      tmp("t_cq", { nome: "CQ", casa: "pe", categoria: "defesa", vel: 4, dano: 0, custo: 0, efeitos: [{ quando: "contra", condicao: { categoria: ["queda"] }, acao: { anula: true, poeEmCima: true } }] });
      tmp("t_bl", { nome: "BL", casa: "pe", categoria: "pressao", vel: 3, dano: 0, custo: 0, efeitos: [{ quando: "se_acerta", acao: { vaiProChao: true, nivel: 1 } }] });
      tmp("t_rg", { nome: "RG", casa: "baixo", categoria: "queda", vel: 4, dano: 0, custo: 0, efeitos: [{ quando: "se_acerta", acao: { inverte: true, nivel: 2 } }] });
      tmp("t_pj", { nome: "PJ", casa: "cima", categoria: "pressao", vel: 4, dano: 0, custo: 0, efeitos: [{ quando: "se_acerta", acao: { avanca: 2 } }] });
      tmp("t_rc", { nome: "RC", casa: "baixo", categoria: "pressao", vel: 4, dano: 0, custo: 0, efeitos: [{ quando: "se_acerta", acao: { recua: true } }] });
      const M5 = ["jab", "cruzado", "bloqueio", "queda", "clinch"];
      let r = troca(luta(["t_cq", ...M5.slice(1)], M5), "t_cq", "queda");
      if (r.estado.pos !== "cima_a" || !tem(r, "queda", "a") || tem(r, "falhou")) throw new Error("poeEmCima: " + r.estado.pos + " " + r.eventos.map((ev) => ev.tipo));
      r = troca(luta(["t_bl", ...M5.slice(1)], M5), "t_bl", "jab");
      if (r.estado.pos === "cima_a") throw new Error("o Jab mais rápido devia interromper");
      r = troca(luta(["t_bl", ...M5.slice(1)], M5), "t_bl", "bloqueio");
      if (r.estado.pos !== "cima_a" || r.estado.nivelPos !== 1) throw new Error("vaiProChao nível 1: " + r.estado.nivelPos);
      r = troca(luta(["t_rg", ...M5.slice(1)], M5, { pos: "cima_b", nivelPos: 0 }), "t_rg", "bloqueio");
      if (r.estado.pos !== "cima_a" || r.estado.nivelPos !== 2) throw new Error("inverte nível 2: " + r.estado.pos + r.estado.nivelPos);
      r = troca(luta(["t_pj", ...M5.slice(1)], M5, { pos: "cima_a", nivelPos: 0 }), "t_pj", "bloqueio");
      if (r.estado.nivelPos !== 2) throw new Error("avança 2: " + r.estado.nivelPos);
      r = troca(luta(["t_rc", ...M5.slice(1)], M5, { pos: "cima_b", nivelPos: 2 }), "t_rc", "bloqueio");
      if (r.estado.pos !== "cima_b" || r.estado.nivelPos !== 0 || !tem(r, "recuou", "a")) throw new Error("recua: " + r.estado.nivelPos);
    } finally { for (const id of ["t_cq", "t_bl", "t_rg", "t_pj", "t_rc"]) delete C.CARTAS[id]; }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node testar.js combate2 2>&1 | grep "posição: reação"`
Expected: FAIL ("poeEmCima: pe ...").

- [ ] **Step 3: Write minimal implementation**

```js
// aplicarAcaoPropria (reação ou se_acerta de quem jogou):
  if (acao.poeEmCima) { e.pos = "cima_" + l; e.nivelPos = acao.nivel || 0; e[l].total.quedas++; pontuar(e, l, K2.pts.queda); ctx.ev.push({ tipo: "queda", quem: l, carta: c.id }); }
  if (acao.recua && e.pos !== "pe" && e.nivelPos > 0) { e.nivelPos = 0; ctx.ev.push({ tipo: "recuou", quem: l, carta: c.id }); }
// aplicarAcao: nível na queda e na raspagem
  if (a.vaiProChao) { e.pos = "cima_" + l; e.nivelPos = a.nivel || 0; ... }
  if (a.inverte) { e.pos = "cima_" + l; e.nivelPos = a.nivel || 0; e.encaixe = null; ... }
// posicional: inclua a.recua
// resolverNormal: a reação que mudou a posição não resolve de novo (senão sai "falhou")
    for (const ef of efeitosDe(jog[l].c, "contra")) { ...; if (ef.acao.poeEmCima) jog[l].posPropria = true; ... }
  ...
  if (vivos.length === 1) { res.ordem = vivos[0]; if (jog[vivos[0]].posPropria) { jog[vivos[0]].resolveu = true; return; } resolverCarta(e, perfis, jog, vivos[0], ctx); return; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node testar.js combate2 2>&1 | tail -3`
Expected: `combate2 ok`.

- [ ] **Step 5: Commit**

```bash
git add api/_jxj-combate2.js testar.js
git commit -m "Combate v2: reação que derruba, nível na queda e na raspagem, avançar 2, recuar"
```

### Task 6: grogue sem knockdown, nocaute condicional, tirar o grogue, punição ao jogar

**Files:**
- Modify: `api/_jxj-combate2.js` (`aplicarAcao`, `aplicarAcaoPropria`, fim da troca, `resolverTroca2` antes de `resolverNormal`)
- Test: `testar.js`, `combate2`

**Interfaces:**
- Produces: ação `grogue` (ele fica grogue na troca seguinte, evento `grogue`); `nocauteSe: { grogue?, vidaAte?, fracao? }` (acertar é nocaute se qualquer condição vale; KO em pé, TKO no chão); `tiraGrogue` (evento `tirouGrogue`); efeito `ao_jogar` com `danoProprio` (avaliado logo depois do pagamento, antes das reações, valendo mesmo se a carta for anulada; evento `dano` com `quem` = o outro).

- [ ] **Step 1: Write the failing test**

```js
  await conf("estado de luta: grogue sem knockdown; nocauteSe (grogue, vida até 3, metade da vida); tirar o grogue; ao_jogar com danoProprio vale mesmo anulada", () => {
    const tmp = (id, c) => { C.CARTAS[id] = { id, raridade: "rara", no: null, estrela3: null, duelo: null, casa: "pe", ...c, contexto: c.casa || "pe" }; return id; };
    try {
      tmp("t_sp", { nome: "SP", categoria: "queda", vel: 3, dano: 1, custo: 0, efeitos: [{ quando: "se_acerta", acao: { vaiProChao: true, grogue: true } }] });
      tmp("t_mi", { nome: "MI", categoria: "golpes", vel: 4, dano: 2, custo: 0, efeitos: [{ quando: "se_acerta", acao: { nocauteSe: { grogue: true, vidaAte: 3 } } }] });
      tmp("t_mt", { nome: "MT", casa: "cima", categoria: "golpes", vel: 3, dano: 1, custo: 0, efeitos: [{ quando: "se_acerta", acao: { nocauteSe: { fracao: 0.5 } } }] });
      tmp("t_sf", { nome: "SF", categoria: "defesa", vel: 3, dano: 0, custo: 0, efeitos: [{ quando: "contra", condicao: { categoria: ["golpes"] }, acao: { anula: true, tiraGrogue: true } }] });
      tmp("t_su", { nome: "SU", categoria: "golpes", vel: 5, dano: 3, custo: 0, efeitos: [{ quando: "ao_jogar", condicao: { categoria: ["defesa"] }, acao: { danoProprio: 2 } }] });
      const M5 = ["jab", "cruzado", "bloqueio", "queda", "clinch"];
      let x = luta(["t_sp", ...M5.slice(1)], M5), r = troca(x, "t_sp", "bloqueio");
      if (!r.estado.b.grogue || !tem(r, "grogue", "b") || tem(r, "knockdown")) throw new Error("grogue sem knockdown");
      r = troca(luta(["t_mi", ...M5.slice(1)], M5, { b: { ...x.e.b, grogue: true } }), "t_mi", "clinch");
      if (!r.estado.fim || r.estado.fim.metodo !== "KO") throw new Error("nocauteSe grogue: " + JSON.stringify(r.estado.fim));
      r = troca(luta(["t_mi", ...M5.slice(1)], M5, { b: { ...x.e.b, grogue: false, vida: 4 } }), "t_mi", "clinch");
      if (!r.estado.fim) throw new Error("nocauteSe vida até 3");
      r = troca(luta(["t_mi", ...M5.slice(1)], M5), "t_mi", "clinch");
      if (r.estado.fim) throw new Error("nocauteSe sem condição");
      r = troca(luta(["t_mt", ...M5.slice(1)], M5, { pos: "cima_a", nivelPos: 2, b: { ...x.e.b, grogue: false, vida: x.e.b.vidaMax / 2 } }), "t_mt", "bloqueio");
      if (!r.estado.fim || r.estado.fim.metodo !== "TKO") throw new Error("nocauteSe metade no chão: " + JSON.stringify(r.estado.fim));
      r = troca(luta(["t_sf", ...M5.slice(1)], M5, { a: { ...x.e.a, grogue: true } }), "t_sf", "jab");
      if (r.estado.a.grogue || !tem(r, "tirouGrogue", "a")) throw new Error("tirar grogue");
      const y = luta(["t_su", ...M5.slice(1)], M5), vida = y.e.a.vida;
      r = troca(y, "t_su", "bloqueio");
      if (r.estado.a.vida !== vida - 2 || !tem(r, "anulou", "b")) throw new Error("danoProprio: " + r.estado.a.vida);
    } finally { for (const id of ["t_sp", "t_mi", "t_mt", "t_sf", "t_su"]) delete C.CARTAS[id]; }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node testar.js combate2 2>&1 | grep "estado de luta"`
Expected: FAIL ("grogue sem knockdown").

- [ ] **Step 3: Write minimal implementation**

```js
// aplicarAcao:
  if (a.grogue) { jog[l].deuGrogue = true; ctx.ev.push({ tipo: "grogue", quem: o, carta: c.id }); }
  if (a.nocauteSe && jog[l].dano > 0) {
    const n = a.nocauteSe, alvo = e[o];
    if ((n.grogue && alvo.grogue) || (n.vidaAte != null && alvo.vida <= n.vidaAte) || (n.fracao != null && alvo.vida <= alvo.vidaMax * n.fracao))
      fimDaLuta(e, ctx, l, papel2(e, l) === "pe" ? "KO" : "TKO");
  }
// aplicarAcaoPropria:
  if (acao.tiraGrogue && e[l].grogue) { e[l].grogue = false; ctx.ev.push({ tipo: "tirouGrogue", quem: l, carta: c.id }); }
// fim da troca:
  for (const l of L2) e[l].grogue = (!!jog[outro(l)].deuKd || !!jog[outro(l)].deuGrogue) && !e.fim;
// resolverTroca2, logo antes de "if (!e.fim) { if (e.encaixe) ...":
  for (const l of L2) {
    if (jog[l].exausta || e.fim) continue;
    for (const ef of efeitosDe(jog[l].c, "ao_jogar")) {
      if (!casaCond(ef.condicao, jog[outro(l)].c, e, outro(l))) continue;
      if (ef.acao.danoProprio) {
        const o = outro(l);
        e[l].vida = r1(e[l].vida - ef.acao.danoProprio); pontuar(e, o, K2.pts.dano * ef.acao.danoProprio);
        ctx.ev.push({ tipo: "dano", quem: o, carta: jog[o].c.id, alvo: l, dano: ef.acao.danoProprio, punicao: true });
        if (e[l].vida <= 0) fimDaLuta(e, ctx, o, "TKO");
      }
    }
  }
```

(O `nocauteSe` olha `jog[l].dano`, o dano que a carta já causou nesta troca: "acertar".)

- [ ] **Step 4: Run test to verify it passes**

Run: `node testar.js combate2 2>&1 | tail -3`
Expected: `combate2 ok`.

- [ ] **Step 5: Commit**

```bash
git add api/_jxj-combate2.js testar.js
git commit -m "Combate v2: grogue sem knockdown, nocaute condicional, tirar o grogue, punição ao jogar"
```

### Task 7: finalizações novas (por baixo e em pé)

**Files:**
- Modify: `api/_jxj-combate2.js` (`aplicarAcao`, bloco do `finaliza`)
- Test: `testar.js`, `combate2`

**Interfaces:**
- Produces: `finaliza` com `porBaixo: true` (quem está por baixo finaliza ao resolver); `finalizaSe: { grogue?, cansado? }` (avaliada antes das outras ações da mesma carta; se valer, FIN e o resto não roda).

- [ ] **Step 1: Write the failing test**

```js
  await conf("finalizações novas: por baixo finaliza ao resolver; em pé finaliza quem está grogue (ou cansado, se a carta pedir) e senão derruba pra montada; o Avançar dele (contra queda) segura a de baixo", () => {
    const tmp = (id, c) => { C.CARTAS[id] = { id, raridade: "rara", no: null, estrela3: null, duelo: null, ...c, contexto: c.casa }; return id; };
    try {
      tmp("t_tri", { nome: "TRI", casa: "baixo", categoria: "queda", vel: 2, dano: 0, custo: 0, efeitos: [{ quando: "se_acerta", acao: { finaliza: true, porBaixo: true } }] });
      tmp("t_ml", { nome: "ML", casa: "pe", categoria: "queda", vel: 3, dano: 0, custo: 0, efeitos: [{ quando: "se_acerta", acao: { finalizaSe: { grogue: true }, vaiProChao: true, nivel: 2 } }] });
      const M5 = ["jab", "cruzado", "bloqueio", "queda", "clinch"];
      let r = troca(luta(["t_tri", ...M5.slice(1)], M5, { pos: "cima_b", nivelPos: 0 }), "t_tri", "bloqueio");
      if (!r.estado.fim || r.estado.fim.metodo !== "FIN" || r.estado.fim.vencedor !== "a") throw new Error("por baixo: " + JSON.stringify(r.estado.fim));
      r = troca(luta(["t_tri", ...M5.slice(1)], ["clinch", ...M5.slice(0, 4)], { pos: "cima_b", nivelPos: 0 }), "t_tri", "clinch");
      if (r.estado.fim) throw new Error("o Avançar (contra queda) não segurou o triângulo");
      const x = luta(M5, M5);
      r = troca(luta(["t_ml", ...M5.slice(1)], M5, { b: { ...x.e.b, grogue: true } }), "t_ml", "clinch");
      if (!r.estado.fim || r.estado.fim.metodo !== "FIN") throw new Error("em pé com ele grogue");
      r = troca(luta(["t_ml", ...M5.slice(1)], M5), "t_ml", "clinch");
      if (r.estado.fim || r.estado.pos !== "cima_a" || r.estado.nivelPos !== 2) throw new Error("em pé sem grogue: " + r.estado.pos + r.estado.nivelPos);
    } finally { delete C.CARTAS.t_tri; delete C.CARTAS.t_ml; }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node testar.js combate2 2>&1 | grep "finalizações novas"`
Expected: FAIL ("por baixo: null").

- [ ] **Step 3: Write minimal implementation**

No começo de `aplicarAcao` (antes de qualquer outra ação da mesma carta):

```js
  if (a.finalizaSe) {
    const fs = a.finalizaSe, alvo = e[o];
    if ((fs.grogue && alvo.grogue) || (fs.cansado && alvo.energia <= K2.cansado)) { fimDaLuta(e, ctx, l, "FIN"); return; }
  }
```

No bloco do `finaliza`:

```js
  if (a.finaliza) {
    const pas = PASSIVAS[perfis[l].estilo], minimo = pas && pas.finalizaNivel != null ? pas.finalizaNivel : K2.finalizaNivel;
    if (a.porBaixo || e.nivelPos >= minimo || e[o].grogue) fimDaLuta(e, ctx, l, "FIN");
    else { e.encaixe = { quem: l }; ctx.ev.push({ tipo: "encaixou", quem: l, alvo: o }); }
  }
```

Confira que a carta por baixo passa pelo teste de contexto em `resolverCarta` (a casa `baixo` bate com `papel2` de quem está por baixo).

- [ ] **Step 4: Run test to verify it passes**

Run: `node testar.js combate2 2>&1 | tail -3`
Expected: `combate2 ok`.

- [ ] **Step 5: Commit**

```bash
git add api/_jxj-combate2.js testar.js
git commit -m "Combate v2: finalização por baixo e em pé"
```

### Task 8: o catálogo das 48 cartas

**Files:**
- Modify: `api/_jxj-cartas.js` (`CARTAS`)
- Test: `testar.js`, `combate2`

**Interfaces:**
- Consumes: as mecânicas das Tarefas 3 a 7.
- Produces: as 48 cartas, com os ids abaixo (a tela, a arte e o 3D usam esses ids).

- [ ] **Step 1: Write the failing test**

```js
  await conf("catálogo: as 48 cartas da spec com os ids, nós e casas combinados; toda carta resolve sem erro numa troca contra cada comum, na casa e fora dela", () => {
    const esperado = {
      direto: ["precisao_maos", "pe"], combinacao: ["combinacoes", "pe"], contragolpe: ["contra_maos", "pe"], overhand: ["eficiencia_golpes", "pe"],
      chute_perna: ["chute_baixo", "pe"], chute_corpo: ["chute_corpo", "pe"], chute_frontal: ["controle_distancia", "pe"], chute_rodado: ["variedade", "pe"],
      passo_lateral: ["controle_ritmo", "pe"], joelhada: ["combinacoes_pressao", "pe"], cotovelada: ["iniciativa", "pe"], superman: ["eficiencia_ofensiva", "pe"],
      single_leg: ["entradas", "pe"], double_leg: ["correntes", "pe"], queda_contragolpe: ["timing_queda", "pe"], suplex: ["eficiencia_tentativas", "pe"],
      peso_ombro: ["controle_posicional", "cima"], cotovelada_cima: ["dominio", "cima"], passagem_joelho: ["transicoes_controle", "cima"], martelada: ["pressao_solo", "cima"],
      sprawl: ["equilibrio", "pe"], levantada_tecnica: ["recuperacao_posicao", "baixo"], contra_queda: ["defesa_entradas", "pe"], bodylock: ["retorno_distancia", "pe"],
      kimura: ["eficiencia_sub", "cima"], rasteira: ["transicoes_sub", "pe"], triangulo: ["oportunidades", "baixo"], mata_leao: ["especializacao", "pe"],
      cem_quilos: ["controle_chao", "cima"], passagem_guarda: ["passagens", "cima"], guarda_fechada: ["retencao", "baixo"], raspagem_gancho: ["raspagem", "baixo"],
      defesa_finalizacao: ["defesa_sub", "baixo"], fuga_quadril: ["saidas", "baixo"], recomposicao: ["sobrevivencia", "baixo"], berimbolo: ["recuperar_guarda", "baixo"],
      esquiva: ["padroes", "pe"], leitura_queda: ["antecipacao", "pe"], contra_esquerda: ["resposta", "pe"], leitura_total: ["adaptacao", "pe"],
      pendulo: ["evasao", "pe"], guarda_alta: ["bloqueio", "pe"], saida_lado: ["gestao_distancia", "pe"], segundo_folego: ["recuperacao_defensiva", "pe"],
      contra_corpo: ["contra_ataques", "pe"], cruzado_contra: ["timing", "pe"], uppercut: ["eficiencia_counter", "pe"], misericordia: ["aproveitamento", "pe"],
    };
    for (const [id, [no, casa]] of Object.entries(esperado)) {
      const c = C.CARTAS[id];
      if (!c || c.no !== no || c.casa !== casa || !c.estrela3 || !c.nome) throw new Error("carta: " + id + " " + JSON.stringify(c && { no: c.no, casa: c.casa }));
    }
    const comuns = ["jab", "cruzado", "chute_alto", "bloqueio", "contra_ataque", "queda", "antiqueda", "clinch"];
    for (const id of Object.keys(esperado)) for (const pos of [{ pos: "pe", nivelPos: 0 }, { pos: "cima_a", nivelPos: 1 }, { pos: "cima_b", nivelPos: 1 }]) for (const ele of comuns) {
      const P = { a: { ...neutro("grappler"), v2: { liberadas: [], estrelas: { [id]: 3 } } }, b: neutro("wrestler") };
      const x = luta([id, "jab", "bloqueio", "queda", "clinch"], [ele, "jab", "bloqueio", "queda", "clinch"], pos, P);
      troca(x, id, ele);   // não pode lançar erro
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node testar.js combate2 2>&1 | grep "as 48 cartas"`
Expected: FAIL ("carta: direto undefined").

- [ ] **Step 3: Write the catalog**

Acrescente em `CARTAS` (os números e efeitos são os da spec; `E = efeito`; `duelo` segue o padrão de hoje: golpe `["golpe", "defesa"]`, queda `["queda", "defQueda"]`, chão `["chao", "defChao"]`, defesa pura `null`):

```js
const E = efeito;
const PE_G = ["golpe", "defesa"], PE_Q = ["queda", "defQueda"], CH = ["chao", "defChao"], CH_B = ["defChao", "chao"];
const ponto = (q, v, cond) => ({ efeitos: [E(q, { pontos: v }, cond)] });
/* striker */
direto: { nome: "Direto", categoria: "golpes", casa: "pe", raridade: "rara", no: "precisao_maos", vel: 4, dano: 2, custo: 1, duelo: PE_G, efeitos: [], estrela3: { efeitos: [E("se_interrompe", { energia: 1 })] } },
combinacao: { nome: "Combinação", categoria: "golpes", casa: "pe", raridade: "rara", no: "combinacoes", vel: 4, dano: 2, custo: 2, duelo: PE_G, efeitos: [E("se_interrompe", { danoExtra: 1 })], estrela3: ponto("se_acerta", 0.5) },
contragolpe: { nome: "Contragolpe", categoria: "defesa", casa: "pe", raridade: "epica", no: "contra_maos", vel: 3, dano: 2, custo: 2, duelo: ["defesa", "golpe"], efeitos: [E("contra", { anula: true }, { categoria: ["golpes"] })], estrela3: { efeitos: [E("contra", { energia: 1 }, { categoria: ["golpes"] })] } },
overhand: { nome: "Overhand", categoria: "golpes", casa: "pe", raridade: "lendaria", no: "eficiencia_golpes", vel: 2, dano: 4, custo: 3, duelo: PE_G, inanulavel: true, efeitos: [], estrela3: ponto("se_acerta", 1) },
chute_perna: { nome: "Chute na perna", categoria: "golpes", casa: "pe", raridade: "rara", no: "chute_baixo", vel: 4, dano: 1, custo: 1, duelo: PE_G, efeitos: [E("se_acerta", { lentoProxima: true })], estrela3: ponto("se_acerta", 0.5) },
chute_corpo: { nome: "Chute no corpo", categoria: "golpes", casa: "pe", raridade: "rara", no: "chute_corpo", vel: 3, dano: 3, custo: 2, duelo: PE_G, efeitos: [E("se_acerta", { energiaOponente: -2 })], estrela3: { efeitos: [E("se_acerta", { energiaOponente: -1 })] } },
chute_frontal: { nome: "Chute frontal", categoria: "defesa", casa: "pe", raridade: "epica", no: "controle_distancia", vel: 4, dano: 1, custo: 1, duelo: PE_G, efeitos: [E("contra", { anula: true }, { categoria: ["pressao", "queda"] })], estrela3: { efeitos: [E("contra", { iniciativa: true }, { categoria: ["pressao", "queda"] })] } },
chute_rodado: { nome: "Chute rodado", categoria: "golpes", casa: "pe", raridade: "lendaria", no: "variedade", vel: 1, dano: 5, custo: 3, duelo: PE_G, efeitos: [E("resistente", { ateDano: 3 })], estrela3: ponto("se_acerta", 1) },
passo_lateral: { nome: "Passo lateral", categoria: "defesa", casa: "pe", raridade: "rara", no: "controle_ritmo", vel: 5, dano: 0, custo: 0, duelo: null, efeitos: [E("contra", { anula: true }, { categoria: ["golpes"], danoMin: 3 })], estrela3: { efeitos: [E("contra", { energia: 1 }, { categoria: ["golpes"], danoMin: 3 })] } },
joelhada: { nome: "Joelhada no clinch", categoria: "pressao", casa: "pe", raridade: "rara", no: "combinacoes_pressao", vel: 3, dano: 2, custo: 2, duelo: PE_G, efeitos: [E("se_oponente", { danoExtra: 1 }, { categoria: ["defesa"] })], estrela3: { efeitos: [E("se_acerta", { energiaOponente: -1 })] } },
cotovelada: { nome: "Cotovelada", categoria: "golpes", casa: "pe", raridade: "epica", no: "iniciativa", vel: 3, dano: 3, custo: 2, duelo: PE_G, efeitos: [E("se_acerta", { sangra: true })], estrela3: ponto("se_acerta", 0.5) },
superman: { nome: "Superman punch", categoria: "golpes", casa: "pe", raridade: "lendaria", no: "eficiencia_ofensiva", vel: 5, dano: 3, custo: 3, duelo: PE_G, efeitos: [E("ao_jogar", { danoProprio: 2 }, { categoria: ["defesa"] })], estrela3: { efeitos: [E("resistente", { ateDano: 1 })] } },
/* wrestler */
single_leg: { nome: "Single leg", categoria: "queda", casa: "pe", raridade: "rara", no: "entradas", vel: 3, dano: 1, custo: 1, duelo: PE_Q, efeitos: [E("se_acerta", { vaiProChao: true })], estrela3: { efeitos: [E("resistente", { ateDano: 1 })] } },
double_leg: { nome: "Double leg", categoria: "queda", casa: "pe", raridade: "rara", no: "correntes", vel: 2, dano: 2, custo: 3, duelo: PE_Q, efeitos: [E("se_acerta", { vaiProChao: true }), E("resistente", { ateDano: 1 })], estrela3: { efeitos: [E("se_acerta", { avanca: 1 })] } },
queda_contragolpe: { nome: "Queda no contragolpe", categoria: "queda", casa: "pe", raridade: "epica", no: "timing_queda", vel: 3, dano: 2, custo: 2, duelo: PE_Q, efeitos: [E("se_acerta", { vaiProChao: true }), E("resistente", { ateDano: 3 }, { categoria: ["golpes"] })], estrela3: ponto("se_acerta", 1) },
suplex: { nome: "Suplex", categoria: "queda", casa: "pe", raridade: "lendaria", no: "eficiencia_tentativas", vel: 2, dano: 3, custo: 3, duelo: PE_Q, efeitos: [E("se_acerta", { vaiProChao: true, grogue: true })], estrela3: { efeitos: [E("se_acerta", { avanca: 1 })] } },
peso_ombro: { nome: "Peso do ombro", categoria: "defesa", casa: "cima", raridade: "rara", no: "controle_posicional", vel: 4, dano: 0, custo: 0, duelo: null, efeitos: [E("contra", { anula: true }, { categoria: ["pressao", "queda"] })], estrela3: ponto("contra", 0.5, { categoria: ["pressao", "queda"] }) },
cotovelada_cima: { nome: "Cotovelada por cima", categoria: "golpes", casa: "cima", raridade: "rara", no: "dominio", vel: 4, dano: 2, custo: 1, duelo: CH, efeitos: [], estrela3: { efeitos: [E("se_acerta", { danoExtra: 1 }, { nivelPos: 2 })] } },
passagem_joelho: { nome: "Passagem de joelho", categoria: "pressao", casa: "cima", raridade: "epica", no: "transicoes_controle", vel: 4, dano: 0, custo: 1, duelo: CH, efeitos: [E("se_acerta", { avanca: 2 })], estrela3: { efeitos: [E("contra", { anula: true }, { categoria: ["queda"] })] } },
martelada: { nome: "Martelada", categoria: "golpes", casa: "cima", raridade: "lendaria", no: "pressao_solo", vel: 3, dano: 3, custo: 3, duelo: CH, efeitos: [E("se_acerta", { nocauteSe: { fracao: 0.5 } }, { nivelPos: 2 })], estrela3: { dano: 0.5 } },
sprawl: { nome: "Sprawl", categoria: "defesa", casa: "pe", raridade: "rara", no: "equilibrio", vel: 4, dano: 0, custo: 0, duelo: null, efeitos: [E("contra", { anula: true, pontos: 1 }, { categoria: ["queda"] })], estrela3: { efeitos: [E("contra", { energia: 1 }, { categoria: ["queda"] })] } },
levantada_tecnica: { nome: "Levantada técnica", categoria: "pressao", casa: "baixo", raridade: "rara", no: "recuperacao_posicao", vel: 5, dano: 0, custo: 1, duelo: CH_B, efeitos: [E("se_acerta", { levanta: true })], estrela3: ponto("se_acerta", 0.5) },
contra_queda: { nome: "Contra-queda", categoria: "defesa", casa: "pe", raridade: "epica", no: "defesa_entradas", vel: 4, dano: 0, custo: 1, duelo: null, efeitos: [E("contra", { anula: true, poeEmCima: true }, { categoria: ["queda"] })], estrela3: ponto("contra", 1, { categoria: ["queda"] }) },
bodylock: { nome: "Bodylock", categoria: "pressao", casa: "pe", raridade: "lendaria", no: "retorno_distancia", vel: 3, dano: 0, custo: 2, duelo: PE_Q, efeitos: [E("se_acerta", { vaiProChao: true, nivel: 1 }, { categoria: ["golpes", "pressao"] })], estrela3: ponto("se_acerta", 1, { categoria: ["golpes", "pressao"] }) },
/* grappler */
kimura: { nome: "Kimura", categoria: "queda", casa: "cima", raridade: "rara", no: "eficiencia_sub", vel: 3, dano: 0, custo: 2, duelo: CH, efeitos: [E("se_acerta", { finaliza: true })], estrela3: { custo: -1 } },
rasteira: { nome: "Rasteira", categoria: "queda", casa: "pe", raridade: "rara", no: "transicoes_sub", vel: 3, dano: 0, custo: 1, duelo: PE_Q, efeitos: [E("se_acerta", { vaiProChao: true }, { categoria: ["golpes", "pressao", "queda"] })], estrela3: ponto("se_acerta", 0.5, { categoria: ["golpes", "pressao", "queda"] }) },
triangulo: { nome: "Triângulo", categoria: "queda", casa: "baixo", raridade: "epica", no: "oportunidades", vel: 2, dano: 0, custo: 2, duelo: CH, efeitos: [E("se_acerta", { finaliza: true, porBaixo: true })], estrela3: { vel: 1 } },
mata_leao: { nome: "Mata-leão", categoria: "queda", casa: "pe", raridade: "lendaria", no: "especializacao", vel: 3, dano: 0, custo: 3, duelo: PE_Q, efeitos: [E("se_acerta", { finalizaSe: { grogue: true }, vaiProChao: true, nivel: 2 })], estrela3: { efeitos: [E("se_acerta", { finalizaSe: { cansado: true } })] } },
cem_quilos: { nome: "Cem quilos", categoria: "defesa", casa: "cima", raridade: "rara", no: "controle_chao", vel: 4, dano: 0, custo: 0, duelo: null, efeitos: [E("contra", { anula: true }, { categoria: ["golpes", "pressao"] })], estrela3: ponto("contra", 0.5, { categoria: ["golpes", "pressao"] }) },
passagem_guarda: { nome: "Passagem de guarda", categoria: "pressao", casa: "cima", raridade: "rara", no: "passagens", vel: 3, dano: 0, custo: 1, duelo: CH, efeitos: [E("se_acerta", { avanca: 2 })], estrela3: ponto("se_acerta", 0.5) },
guarda_fechada: { nome: "Guarda fechada", categoria: "defesa", casa: "baixo", raridade: "epica", no: "retencao", vel: 4, dano: 0, custo: 0, duelo: null, efeitos: [E("contra", { anula: true, energia: 1 }, { categoria: ["golpes", "pressao"] })], estrela3: ponto("contra", 0.5, { categoria: ["golpes", "pressao"] }) },
raspagem_gancho: { nome: "Raspagem de gancho", categoria: "queda", casa: "baixo", raridade: "lendaria", no: "raspagem", vel: 4, dano: 0, custo: 2, duelo: CH, efeitos: [E("se_acerta", { inverte: true, nivel: 2 })], estrela3: ponto("se_acerta", 1) },
defesa_finalizacao: { nome: "Defesa de finalização", categoria: "defesa", casa: "baixo", raridade: "rara", no: "defesa_sub", vel: 4, dano: 0, custo: 0, duelo: null, efeitos: [E("contra", { anula: true }, { categoria: ["queda"] })], estrela3: { efeitos: [E("contra", { recua: true }, { categoria: ["queda"] })] } },
fuga_quadril: { nome: "Fuga de quadril", categoria: "pressao", casa: "baixo", raridade: "rara", no: "saidas", vel: 4, dano: 0, custo: 1, duelo: CH_B, efeitos: [E("se_acerta", { levanta: true })], estrela3: ponto("se_acerta", 0.5) },
recomposicao: { nome: "Recomposição", categoria: "pressao", casa: "baixo", raridade: "epica", no: "sobrevivencia", vel: 4, dano: 0, custo: 1, duelo: CH_B, efeitos: [E("se_acerta", { recua: true, iniciativa: true })], estrela3: { efeitos: [E("se_acerta", { energia: 1 })] } },
berimbolo: { nome: "Berimbolo", categoria: "queda", casa: "baixo", raridade: "lendaria", no: "recuperar_guarda", vel: 3, dano: 0, custo: 2, duelo: CH, efeitos: [E("se_acerta", { inverte: true, grogue: true })], estrela3: ponto("se_acerta", 1) },
/* counter */
esquiva: { nome: "Esquiva", categoria: "defesa", casa: "pe", raridade: "rara", no: "padroes", vel: 3, dano: 1, custo: 1, duelo: ["defesa", "golpe"], efeitos: [E("contra", { anula: true }, { categoria: ["golpes"] })], estrela3: ponto("contra", 0.5, { categoria: ["golpes"] }) },
leitura_queda: { nome: "Leitura de queda", categoria: "defesa", casa: "pe", raridade: "rara", no: "antecipacao", vel: 4, dano: 0, custo: 0, duelo: null, efeitos: [E("contra", { anula: true, iniciativa: true }, { categoria: ["queda", "pressao"] })], estrela3: ponto("contra", 0.5, { categoria: ["queda", "pressao"] }) },
contra_esquerda: { nome: "Contra de esquerda", categoria: "defesa", casa: "pe", raridade: "epica", no: "resposta", vel: 4, dano: 2, custo: 2, duelo: ["defesa", "golpe"], efeitos: [E("se_oponente", { multDano: 2 }, { categoria: ["golpes"] })], estrela3: { efeitos: [E("resistente", { ateDano: 1 })] } },
leitura_total: { nome: "Leitura total", categoria: "defesa", casa: "pe", raridade: "lendaria", no: "adaptacao", vel: 3, dano: 0, custo: 2, duelo: null, efeitos: [E("contra", { anula: true }, { categoria: ["golpes", "queda", "defesa", "pressao"] })], estrela3: { efeitos: [E("contra", { energia: 1 }, { categoria: ["golpes", "queda", "defesa", "pressao"] })] } },
pendulo: { nome: "Pêndulo", categoria: "defesa", casa: "pe", raridade: "rara", no: "evasao", vel: 5, dano: 0, custo: 0, duelo: null, efeitos: [E("contra", { anula: true }, { categoria: ["golpes"], danoMax: 2 })], estrela3: ponto("contra", 0.5, { categoria: ["golpes"], danoMax: 2 }) },
guarda_alta: { nome: "Guarda alta", categoria: "defesa", casa: "pe", raridade: "rara", no: "bloqueio", vel: 4, dano: 0, custo: 0, duelo: null, efeitos: [E("contra", { anula: true, energiaOponente: -1 }, { categoria: ["golpes"] })], estrela3: ponto("contra", 0.5, { categoria: ["golpes"] }) },
saida_lado: { nome: "Saída de lado", categoria: "defesa", casa: "pe", raridade: "epica", no: "gestao_distancia", vel: 4, dano: 0, custo: 1, duelo: null, efeitos: [E("contra", { anula: true, rapidoProxima: true }, { categoria: ["pressao", "queda"] })], estrela3: ponto("contra", 0.5, { categoria: ["pressao", "queda"] }) },
segundo_folego: { nome: "Segundo fôlego", categoria: "defesa", casa: "pe", raridade: "lendaria", no: "recuperacao_defensiva", vel: 3, dano: 0, custo: 0, duelo: null, efeitos: [E("contra", { anula: true, energia: 3, tiraGrogue: true }, { categoria: ["golpes"] }), E("se_acerta", { tiraGrogue: true })], estrela3: ponto("contra", 1, { categoria: ["golpes"] }) },
contra_corpo: { nome: "Contra no corpo", categoria: "defesa", casa: "pe", raridade: "rara", no: "contra_ataques", vel: 3, dano: 2, custo: 2, duelo: ["defesa", "golpe"], efeitos: [E("se_oponente", { multDano: 2, energiaOponente: -2 }, { categoria: ["golpes"] })], estrela3: ponto("se_acerta", 0.5) },
cruzado_contra: { nome: "Cruzado de contra", categoria: "golpes", casa: "pe", raridade: "rara", no: "timing", vel: 3, dano: 3, custo: 2, duelo: PE_G, efeitos: [E("se_oponente", { danoExtra: 1 }, { categoria: ["pressao", "queda"] })], estrela3: ponto("se_acerta", 0.5) },
uppercut: { nome: "Uppercut", categoria: "golpes", casa: "pe", raridade: "epica", no: "eficiencia_counter", vel: 3, dano: 3, custo: 2, duelo: PE_G, efeitos: [E("se_oponente", { multDano: 2 }, { categoria: ["queda", "pressao"] })], estrela3: ponto("se_acerta", 0.5) },
misericordia: { nome: "Golpe de misericórdia", categoria: "golpes", casa: "pe", raridade: "lendaria", no: "aproveitamento", vel: 4, dano: 2, custo: 2, duelo: PE_G, efeitos: [E("se_acerta", { nocauteSe: { grogue: true, vidaAte: 3 } })], estrela3: { dano: 0.5 } },
```

O `efeito` e as constantes `E`, `PE_G`, `PE_Q`, `CH`, `CH_B` e `ponto` precisam estar declarados antes de `CARTAS`.

Os comentários de calibragem da Fase 4 (velocidade da Esquiva, condição da Rasteira, Double leg lento) ficam como estão nas três.

- [ ] **Step 4: Run test to verify it passes**

Run: `node testar.js combate2 2>&1 | tail -3`
Expected: `combate2 ok`.

- [ ] **Step 5: Commit**

```bash
git add api/_jxj-cartas.js testar.js
git commit -m "Cartas da árvore: as 48 cartas"
```

### Task 9: texto e 3D de reserva pros eventos novos

**Files:**
- Modify: `api/_jxj-luta2.js` (`NA_FRASE`, `textoEvento2`, `definicoes2`, `trocaVista` manda `punicao`)
- Modify: `index.html` (`jxjPorQue2`, `JXJ_3D2`, `JXJ_3D2_GOLPE`, `JXJ_3D2_QUEDA`, `JXJ_3D2_CHAO`, `jxjEfeitoTexto2`)
- Test: `testar.js`, suítes `jxjv2` e `texto`

**Interfaces:**
- Produces: texto pra `lento`, `rapido`, `sangrou`, `grogue`, `tirouGrogue`, `recuou` e o dano de punição (a `definicoes2()` já manda raridade, casa e nó desde a Tarefa 1); `JXJ_3D2` com entrada pra todo evento novo; `JXJ_3D2_GOLPE` e as listas de queda e de chão com as cartas novas (lances de hoje até a Tarefa 17).

- [ ] **Step 1: Write the failing test** (na `jxjv2`, depois do teste da referência)

```js
  await conf("cartas da árvore no texto e no 3D: todo evento novo tem frase e entrada no 3D; toda carta tem frase com artigo e lance; o efeito de cada carta vira texto", () => {
    const novos = ["lento", "rapido", "sangrou", "grogue", "tirouGrogue", "recuou"];
    const tabela = new Set(JSON.parse(X.run("JSON.stringify(Object.keys(JXJ_3D2))")));
    for (const t of novos) {
      if (!tabela.has(t)) throw new Error("evento sem entrada no 3D: " + t);
      const f = V2.textoEvento2({ tipo: t, quem: "a", carta: "chute_perna" }, { a: "Ana", b: "Bia" });
      if (!f || /undefined/.test(f)) throw new Error("evento sem frase: " + t);
    }
    const golpes = new Set(JSON.parse(X.run("JSON.stringify([...Object.keys(JXJ_3D2_GOLPE), ...JXJ_3D2_QUEDA, ...JXJ_3D2_CHAO])")));
    const todas = noJogo("jxjReferencia2", defs, null), ref = [...todas.pe, ...todas.cima, ...todas.baixo];
    for (const c of Object.values(defs.cartas)) {
      if (c.no == null) continue;
      if (!/^(o|a|os|as) /.test(V2.naFrase(c.id))) throw new Error("sem artigo: " + c.id);
      if (c.categoria === "golpes" && c.casa === "pe" && !golpes.has(c.id)) throw new Error("golpe sem lance: " + c.id);
      if (!ref.find((x) => x.id === c.id).efeito && c.efeitos.length) throw new Error("efeito sem texto: " + c.id);
      if (!c.raridade || !c.casa) throw new Error("definições sem raridade ou casa: " + c.id);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node testar.js jxjv2 2>&1 | grep "cartas da árvore no texto"`
Expected: FAIL ("evento sem entrada no 3D: lento").

- [ ] **Step 3: Write minimal implementation**

`api/_jxj-luta2.js`:

```js
// NA_FRASE: uma entrada por carta nova, com artigo (o direto, a combinação, o contragolpe, o overhand,
// o chute na perna, o chute no corpo, o chute frontal, o chute rodado, o passo lateral, a joelhada,
// a cotovelada, o superman punch, o single leg, o double leg, a queda no contragolpe, o suplex,
// o peso do ombro, a cotovelada por cima, a passagem de joelho, a martelada, o sprawl,
// a levantada técnica, a contra-queda, o bodylock, a kimura, a rasteira, o triângulo, o mata-leão,
// o cem quilos, a passagem de guarda, a guarda fechada, a raspagem de gancho, a defesa de finalização,
// a fuga de quadril, a recomposição, o berimbolo, a esquiva, a leitura de queda, o contra de esquerda,
// a leitura total, o pêndulo, a guarda alta, a saída de lado, o segundo fôlego, o contra no corpo,
// o cruzado de contra, o uppercut, o golpe de misericórdia)
// textoEvento2:
    case "lento": return `${N(ev.quem)} ficou mais lento pra próxima troca.`;
    case "rapido": return `${N(ev.quem)} sai na frente na próxima troca.`;
    case "sangrou": return `${N(ev.quem)} está sangrando: os golpes nele entram mais até o fim do round.`;
    case "grogue": return `${N(ev.quem)} ficou grogue.`;
    case "tirouGrogue": return `${N(ev.quem)} se recuperou e não está mais grogue.`;
    case "recuou": return `${N(ev.quem)} recompôs a guarda.`;
// dano de punição (ev.punicao): `${N(ev.alvo)} entrou no contra e levou ${num(ev.dano)} de dano.`
// trocaVista: ev ganha punicao: !!ev.punicao
```

`index.html`: no `JXJ_3D2`, `lento`, `rapido`, `sangrou`, `tirouGrogue`, `recuou` = `null`, `grogue` = `(e,c)=>({tipo:"grogue",quem:c.Q(e.quem)})`. No `JXJ_3D2_GOLPE`, cada golpe em pé com um lance de hoje do `GOLPES` do diretor (direto: "direto", combinacao: "umDois", overhand: "gancho", chute_perna: "chuteBaixo", chute_corpo: "chuteCorpo", chute_rodado: "chuteCabeca", joelhada: "jabCorpo", cotovelada: "cruzadoFrente", superman: "direto", cruzado_contra: "gancho", uppercut: "upper", misericordia: "gancho", contragolpe: "direto", contra_esquerda: "cruzadoFrente", contra_corpo: "jabCorpo", esquiva: "jab", chute_frontal: "jab"). `JXJ_3D2_QUEDA` ganha single_leg, double_leg, queda_contragolpe, suplex, rasteira, mata_leao, bodylock. `JXJ_3D2_CHAO` ganha cotovelada_cima e martelada. No `jxjPorQue2`, uma frase pra punição ("Você entrou no contra..."), pra `lento` e pra `grogue` sem knockdown, no mesmo tom das que já existem. No `jxjEfeitoTexto2`, texto pra cada ação nova (lentoProxima "ele fica 1 mais lento na próxima troca", rapidoProxima, sangra, inanulavel na carta "nenhuma reação anula", danoMin e danoMax "de dano 3 ou mais", "de dano 2 ou menos", poeEmCima, nivel, avanca 2, recua, grogue, nocauteSe, tiraGrogue, ao_jogar com danoProprio, finaliza porBaixo, finalizaSe). Sem travessão.

- [ ] **Step 4: Run test to verify it passes**

Run: `node testar.js jxjv2 2>&1 | tail -2 && node testar.js texto 2>&1 | tail -2`
Expected: `jxjv2 ok` e `texto ok`.

- [ ] **Step 5: Commit**

```bash
git add api/_jxj-luta2.js index.html testar.js
git commit -m "Cartas da árvore: texto, porquê e lance de reserva pros eventos e cartas novos"
```

### Task 10: simulação (portões e busca de deck) e calibragem

**Files:**
- Modify: `sim/simular.mjs` (deck do nó, parte `buscaDeck`, relatório), `sim/politicas.mjs` (se a política precisar das ações novas no valor da troca)
- Create: `sim/busca-deck.mjs`
- Modify: `api/_jxj-cartas.js` (os números finais)
- Modify: `docs/combat-v2.md`, `docs/combat-v2-decisions.md` (80 em diante)

**Interfaces:**
- Consumes: catálogo (Tarefa 8), `buildTipica` de `_jxj-arvores.js`, `perfilLuta2`.
- Produces: `buscarDeck(estilo, build, rivais, { n, politica }) -> { deck, vitoria }` em `sim/busca-deck.mjs`; `sim/relatorio.md` com as partes de hoje mais "melhor deck no nível 30" e "cada carta da árvore".

- [ ] **Step 1: Deck do nó na parte `nos`.** Troque o `deckCom(s)` (carta nova no lugar do `SAI`) por "a carta do nó no lugar de uma carta não fixa da mesma categoria do deck padrão; se não houver, no lugar da última não fixa com 2 cópias":

```js
const deckDoNo = (s, no) => {
  const id = C.CARTA_DO_NO[no], d = C.DECK_PADRAO[s].slice(), fixas = C.FIXAS[s].length, cat = C.CARTAS[id].categoria;
  let i = d.findLastIndex((x, k) => k >= fixas && C.CARTAS[x].categoria === cat);
  if (i < 0) i = d.findLastIndex((x, k) => k >= fixas && d.filter((y) => y === x).length === 2);
  d[i] = id;
  return d;
};
```

E todo job da parte `nos` passa `deckA: deckDoNo(s, no.id)` com `buildA: { [no.id]: 3 }`.

- [ ] **Step 2: Busca de deck.** `sim/busca-deck.mjs`, subida de encosta: começa no deck padrão, testa trocar cada carta não fixa por cada liberada (respeitando `validarDeck`), com política `mistura` e 200 lutas por rival (triagem), aceita a melhor troca enquanto melhora mais de 1 ponto, e confirma o final com política `atenta` e 2.000 lutas por rival. Usa o `rodar()` do `simular.mjs` (exporte ou copie pro módulo). Rivais: os 4 estilos no nível 30 com o deck padrão; depois uma segunda volta contra os melhores decks da primeira.

- [ ] **Step 3: Rodar e calibrar.**

Run: `node sim/simular.mjs 4000` (triagem) e, no fim, `node sim/simular.mjs 10000`
Expected (portões da spec): todo nó de 0,5 a 6,5; toda carta jogada de 40% a 60%; nível 30 de 45% a 55% com deck padrão e com o melhor deck; deck aleatório até 60%; 30 contra 1 de 62% a 85%; 30 contra 20 acima de 50%; nível 1 igual ao `git show 25716d8:sim/relatorio.md` nas partes matriz, categorias, pesos, habilidade e decks.

Carta ou nó fora: ajuste o número da carta (velocidade, dano, custo ou o número do efeito) em `_jxj-cartas.js`, com um comentário de uma linha dizendo o número de antes e o resultado medido (como os comentários da Fase 4), e rode de novo. Mecânica que não fecha em 3 tentativas: pare e registre a dúvida pro dono numa decisão.

- [ ] **Step 4: Docs.** Em `docs/combat-v2.md`, troque a seção "Árvore (Fase 4)" pela tabela das 48 cartas (números finais) e a tabela de resultados. Decisões 80 em diante: a casa, as estrelas, o fim do `ARVORE_V2`, as cópias por raridade, cada número que a calibragem mudou e por quê.

- [ ] **Step 5: Commit**

```bash
git add sim api/_jxj-cartas.js docs/combat-v2.md docs/combat-v2-decisions.md
git commit -m "Cartas da árvore: busca de deck, portões e calibragem na simulação"
```

### Task 11: decks dos bots por faixa de nível

**Files:**
- Modify: `api/_jxj-bot2.js` (deck do bot), `api/jxj.js` (onde o perfil do bot v2 é montado), `sim/bots2.mjs`
- Test: `testar.js`, `jxjbot` e `jxj`

**Interfaces:**
- Consumes: `buscarDeck` (Tarefa 10).
- Produces: `DECKS_BOT2[estilo][faixa]` com faixa `"baixo" | "medio" | "alto"` (níveis 1 a 9, 10 a 19, 20 a 30) e `deckDoBot2(estilo, nivel) -> string[]`; `FORCA_BOT2` refeita.

- [ ] **Step 1: Write the failing test** (na `jxjbot`)

```js
  await conf("deck do bot v2 por nível: válido pra build típica do nível; o nível alto usa carta da árvore; a força medida bate com FORCA_BOT2", async () => {
    for (const s of ARV.ESTILOS_IDS) for (const nv of [1, 15, 30]) {
      const d = BOT2.deckDoBot2(s, nv), lib = CT.cartasLiberadas(s, ARV.buildTipica(s, nv));
      const v = CT.validarDeck(s, d, lib);
      if (!v.ok) throw new Error(`${s} ${nv}: ${v.erro}`);
    }
    for (const s of ARV.ESTILOS_IDS) if (!BOT2.deckDoBot2(s, 30).some((id) => CT.CARTAS[id].no)) throw new Error("bot do 30 sem carta da árvore: " + s);
  });
```

(`BOT2`, `CT` e `ARV` com os imports que a suíte já usa; confira os nomes com `grep -n "await import" testar.js | grep -i bot`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node testar.js jxjbot 2>&1 | grep "deck do bot v2"`
Expected: FAIL ("deckDoBot2 is not a function").

- [ ] **Step 3: Implement.** `DECKS_BOT2` com os decks da busca (Tarefa 10) pra build típica do meio de cada faixa; `deckDoBot2` escolhe a faixa e devolve o deck (cai no `DECK_PADRAO` se o deck não validar com as liberadas da build do bot). O servidor usa `deckDoBot2(estilo, nivelDoBot)` no perfil do bot v2. Rode `node sim/bots2.mjs` e grave a força nova em `FORCA_BOT2`.

- [ ] **Step 4: Run tests**

Run: `node testar.js jxjbot 2>&1 | tail -2 && node testar.js jxj 2>&1 | tail -2`
Expected: `jxjbot ok`, `jxj ok`.

- [ ] **Step 5: Commit**

```bash
git add api/_jxj-bot2.js api/jxj.js sim/bots2.mjs testar.js
git commit -m "Bots v2: deck por faixa de nível com as cartas da árvore"
```

### Task 12: servidor (deck salvo que deixou de valer, definições)

**Files:**
- Modify: `api/_jxj-luta2.js` (`deckDo`), `api/jxj.js` (ação `deck`, estado)
- Test: `testar.js`, `jxj`

**Interfaces:**
- Consumes: `cartasLiberadas`, `validarDeck` com cópias por raridade.
- Produces: estado com `deck`, `deckMontado` e `liberadas` por lutador (a tela da Tarefa 14 usa `liberadas` pra saber o que é novo).

- [ ] **Step 1: Write the failing test** (na `jxj`, depois de "árvore no combate v2 pelo servidor")

```js
    await conf("cartas da árvore pelo servidor: o deck com a épica em 1 cópia passa; com 2, recusado; deck salvo antes que deixou de valer (2 cópias da épica) volta pro padrão com deckMontado false; o estado manda as liberadas", async () => {
      await zerarLimites();
      const u1 = await novoUsuario({ pro: true }), l1 = (await criar(u1)).id;
      const epica = CT.CARTA_DO_NO.contra_maos;
      await q("update jxj_lutadores set build = $1::jsonb where id = $2", [JSON.stringify({ precisao_maos: 2, combinacoes: 2, contra_maos: 1 }), l1]);
      await flagV2({ contas: [u1] });
      try {
        const base = CT.DECK_PADRAO.striker.slice(0, 11);
        await ok(u1, "deck", { lutadorId: l1, deck: [...base, epica] });
        await erro(u1, "deck", { lutadorId: l1, deck: [...base.slice(0, 10), epica, epica] }, /cópia/);
        await q("update jxj_lutadores set deck = $1::jsonb where id = $2", [JSON.stringify([...base.slice(0, 10), epica, epica]), l1]);
        const L1 = (await ok(u1, "estado")).lutadores.find((l) => l.id === l1);
        if (JSON.stringify(L1.deck) !== JSON.stringify(CT.DECK_PADRAO.striker) || L1.deckMontado) throw new Error("deck inválido não voltou pro padrão");
        if (!Array.isArray(L1.liberadas) || !L1.liberadas.includes(epica)) throw new Error("estado sem liberadas");
      } finally { await flagV2(false); }
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node testar.js jxj 2>&1 | grep "cartas da árvore pelo servidor"`
Expected: FAIL ("estado sem liberadas").

- [ ] **Step 3: Implement.** No estado (bloco `combateV2` de `api/jxj.js`), `l.liberadas = CARTAS.cartasLiberadas(l.estilo, l.build || {})`. O `deckDo` já cai no padrão quando o deck não valida (a regra de cópias vem do `validarDeck`).

- [ ] **Step 4: Run tests**

Run: `node testar.js jxj 2>&1 | tail -2`
Expected: `jxj ok`.

- [ ] **Step 5: Bateria e push da etapa**

Run: `node testar.js > /tmp/bateria-etapa1.log 2>&1; tail -3 /tmp/bateria-etapa1.log`
Expected: `TUDO CERTO`.

```bash
git add api testar.js
git commit -m "Cartas da árvore: servidor manda as liberadas; deck salvo inválido volta pro padrão"
git push origin combate-v2
```

---

## Etapa 2: tela (depois da etapa 1; worktree próprio)

### Task 13: carta com raridade, arte e estrelas

**Files:**
- Modify: `index.html` (`jxjCarta2`, perto da linha 9110), `estilo.css` (bloco da carta v2), `img/icones.svg` (ícone `star` do Lucide, se faltar)
- Test: `testar.js`, `jxjtelas`

**Interfaces:**
- Consumes: `definicoes.combate2.cartas[id].raridade` e `arte` (`img/cartas/<id>.webp`, Tarefa 16; sem o arquivo, sem imagem).
- Produces: `jxjCarta2(c, {..., raridade, arte, estrelas})`: classe `rar-<raridade>`, `<img class="carta2-arte" src="(escapado)" alt="" loading="lazy">` quando houver `arte`, e `estrelas` vezes `ICONE("star")` dentro de `.carta2-estrelas`.

- [ ] **Step 1: Write the failing test**

```js
    await conf("carta v2 com raridade, arte e estrelas: classe rar-x, imagem com caminho escapado, n ícones de estrela do sprite e nenhum caractere de estrela", () => {
      const html = X.run(`jxjCarta2(JXJ_DEF.combate2.cartas.overhand,{raridade:"lendaria",arte:"img/cartas/overhand.webp\\" onerror=\\"x",estrelas:3})`);
      if (!/rar-lendaria/.test(html) || !/carta2-arte/.test(html) || /onerror="x/.test(html)) throw new Error("raridade ou arte: " + html.slice(0, 300));
      if ((html.match(/#star/g) || []).length !== 3 || /[★☆]/.test(html)) throw new Error("estrelas: " + html.slice(0, 300));
    });
```

- [ ] **Step 2: Run, ver FAIL** (`node testar.js jxjtelas 2>&1 | grep "raridade, arte"`).
- [ ] **Step 3: Implement.** Molduras pela raridade com tokens novos no `estilo.css` (comum osso, rara aço azulado, épica vinho, lendária ouro; a épica não usa o vermelho do golpe); a lendária com brilho em `@keyframes jxjCartaLendaria`, parado em `prefers-reduced-motion`. A arte ocupa a área do ícone da categoria (o ícone fica como reserva sem arte).
- [ ] **Step 4: Run, ver PASS** (`node testar.js jxjtelas`, `node testar.js rotas`).
- [ ] **Step 5: Commit** (`git commit -m "Tela: carta com raridade, arte e estrelas"`).

### Task 14: aba Deck com as cartas da árvore (Nova, filtros, cópias)

**Files:**
- Modify: `index.html` (`jxjAbaDeck`, perto da linha 8662), `estilo.css`
- Test: `testar.js`, `jxjtelas`

**Interfaces:**
- Consumes: `estado.lutadores[].liberadas` (Tarefa 12), `definicoes.combate2.cartas`.
- Produces: `jxjNovas2(lutador) -> string[]` (liberadas da árvore fora do deck salvo e fora de `localStorage["jxj:vistas:" + id]`); `jxjMarcarVista2(lutadorId, cartaId)`; cada slot da grade de liberadas com `data-carta` e, na nova, um filho com a classe `selo-nova`; a guia Deck com o número de novas; o filtro com a classe `deck2-filtro`.

- [ ] **Step 1: Write the failing test** (na `jxjtelas`, depois dos testes da aba Deck; usa os helpers que já estão lá: `flagV2T`, `abrir`, `desde`, `grades`, `botaoCarta`, `assentar`, `env`, `tem`, `CT2`, `db`, `l1`)

```js
    await conf("aba Deck com as cartas da árvore: selo Nova nas liberadas da árvore fora do deck e não vistas, contador na guia; pôr no deck marca como vista; localStorage quebrado não derruba a aba; filtro com mais de 16 liberadas; épica com 'até 1'", async () => {
      await flagV2T({ contas: [u1] });
      const ls = env.sandbox.localStorage;
      try {
        const b = { precisao_maos: 3, combinacoes: 3, contra_maos: 3, eficiencia_golpes: 3, chute_baixo: 3, chute_corpo: 3, controle_distancia: 3, variedade: 3, controle_ritmo: 3, combinacoes_pressao: 3 };
        await db.query("update jxj_lutadores set deck = null, build = $2::jsonb where id = $1", [l1, JSON.stringify(b)]);
        let m = await abrir(`lutador/${l1}/deck`);
        const novas = () => grades().lib.children.filter((s) => (s.children || []).some((x) => tem(x, "selo-nova"))).map((s) => s.dataset.carta);
        const daArvore = Object.keys(b).map((no) => CT2.CARTA_DO_NO[no]);
        if (JSON.stringify(novas().sort()) !== JSON.stringify(daArvore.slice().sort())) throw new Error("novas: " + novas());
        const guia = desde(m).filter((n) => tem(n, "guia") && n.dataset.aba === "deck").pop();
        if (!String(guia.innerHTML).includes(">" + daArvore.length + "<")) throw new Error("contador na guia: " + guia.innerHTML);
        if (!desde(m).some((n) => tem(n, "deck2-filtro"))) throw new Error("sem filtro com " + (8 + daArvore.length) + " liberadas");
        const epica = CT2.CARTA_DO_NO.contra_maos;
        if (!String(grades().lib.children.find((s) => s.dataset.carta === epica).innerHTML).includes("até 1")) throw new Error("épica sem 'até 1'");
        await botaoCarta(grades().meu, "jxj-deck-tirar", "bloqueio").onclick(); await assentar(5);
        await botaoCarta(grades().lib, "jxj-deck-por", CT2.CARTA_DO_NO.precisao_maos).onclick(); await assentar(5);
        if (novas().includes(CT2.CARTA_DO_NO.precisao_maos)) throw new Error("pôr no deck não marcou como vista");
        env.sandbox.localStorage = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("bloqueado"); }, removeItem: () => {} };
        m = await abrir(`lutador/${l1}/deck`);
        if (!grades().lib || novas().length !== daArvore.length) throw new Error("com o localStorage quebrado: " + novas().length);
      } finally { env.sandbox.localStorage = ls; await flagV2T(false); await db.query("update jxj_lutadores set deck = null, build = '{}'::jsonb where id = $1", [l1]); }
    });
```

- [ ] **Step 2: Run, ver FAIL.**
- [ ] **Step 3: Implement** os 4 pontos (try/catch em todo acesso ao `localStorage`).
- [ ] **Step 4: Run, ver PASS** (`jxjtelas`, `rotas`, `texto`).
- [ ] **Step 5: Commit** (`git commit -m "Tela: aba Deck com as cartas da árvore"`).

### Task 15: a carta nova chegando e a árvore com a carta

**Files:**
- Modify: `index.html` (salvar da árvore, `jxjNoV2` e o detalhe do nó perto da linha 8637), `estilo.css`
- Test: `testar.js`, `jxjtelas`

**Interfaces:**
- Consumes: `CARTA_DO_NO` via `definicoes.combate2.cartas[].no`; liberadas antes e depois de salvar a build.
- Produces: `jxjCartaChegou2(cartas, {estrela})` (camada `.carta-chegou` sobre a tela, com "Ver no deck" e "Continuar"; a classe `anima` só entra sem "reduzir movimento"); o nó da árvore desenha `jxjCarta2` da carta dele (com `data-carta`) no lugar da linha "Com cartas".

- [ ] **Step 1: Write the failing test** (na `jxjtelas`, com os helpers da suíte: `flagV2T`, `abrir`, `desde`, `botao`, `assentar`, `env`, `tem`, `grades`, `db`, `l1`; o DOM falso já tem "reduzir movimento" ligado)

```js
    await conf("carta nova chegando e árvore com a carta: Somar e Salvar no nó Precisão mostra o Direto chegando (rara, 1 estrela); de novo, a 2ª estrela; sem animação com reduzir movimento; 'Ver no deck' abre a aba Deck; o nó desenha a carta", async () => {
      await flagV2T({ contas: [u1] });
      try {
        await db.query("update jxj_lutadores set deck = null, build = '{}'::jsonb where id = $1", [l1]);
        const somarESalvar = async () => {
          const m = await abrir(`lutador/${l1}/arvore`);
          const no = desde(m).filter((n) => tem(n, "jxj-no") && String(n.innerHTML).includes("<b>Precisão</b>")).pop();
          const m2 = env.todos.length;
          await no.onclick(); await assentar(10);
          await botao(desde(m2), "Somar 1 nível").onclick(); await assentar(10);
          const m3 = env.todos.length;
          await botao(desde(m), "Salvar árvore").onclick(); await assentar();
          return { c: env.todos.filter((n) => tem(n, "carta-chegou")).pop(), m3 };
        };
        let { c, m3 } = await somarESalvar();
        const h = String(c && c.innerHTML);
        if (!c || !h.includes('data-carta="direto"') || !h.includes("rar-rara") || (h.match(/#star/g) || []).length !== 1) throw new Error("carta chegando: " + h.slice(0, 300));
        if (tem(c, "anima")) throw new Error("animação com reduzir movimento");
        ({ c, m3 } = await somarESalvar());
        if ((String(c.innerHTML).match(/#star/g) || []).length !== 2) throw new Error("segunda estrela");
        await botao(desde(m3), "Ver no deck").onclick(); await assentar();
        if (!grades().lib) throw new Error("Ver no deck não abriu a aba Deck");
        const m = await abrir(`lutador/${l1}/arvore`);
        if (!desde(m).some((n) => tem(n, "jxj-no") && String(n.innerHTML).includes('data-carta="direto"'))) throw new Error("o nó não desenhou a carta");
      } finally { await flagV2T(false); await db.query("update jxj_lutadores set deck = null, build = '{}'::jsonb where id = $1", [l1]); }
    });
```

- [ ] **Step 2: Run, ver FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, ver PASS** (`jxjtelas`, `rotas`, `texto`) e prints de computador e celular (método de `ferramentas/online-v2-e2e.mjs`) em `<scratchpad>/cartas-tela/`.
- [ ] **Step 5: Commit** (`git commit -m "Tela: carta nova chegando e árvore com a carta"`).

---

## Etapa 3: arte (depois da etapa 1; worktree próprio)

### Task 16: ferramenta de arte e as imagens

**Files:**
- Create: `luta3d/lances-cartas.js` (por carta: `{ golpe | queda | chao, arte: { clipe, t, camera } }`, usado pela arte e pelo 3D)
- Create: `ferramentas/arte-cartas.mjs`, `ferramentas/arte-cartas.html`
- Create: `img/cartas/<id>.webp` (uma por carta: as 48, as 9 comuns e as 8 do chão)
- Test: `testar.js`, suíte nova `cartasarte` (no dispatch e na lista de "tudo")

**Interfaces:**
- Produces: `LANCES_CARTAS[id] = { tipo, golpe?, clipe?, reserva?, arte: { clipe, t, camera } }` (exportado de `luta3d/lances-cartas.js`): `tipo` é um `case` do diretor (`golpe1`, `queda`, `gnp1`, `controle`, `raspou`, `levantou`, `sub`, `quedaDefendida`), `golpe` é uma chave do `GOLPES` do diretor, `clipe` é o nome do clipe e `reserva` o clipe do `mx_lutas.glb` usado quando o `clipe` está no `mx_cartas.glb`; `img/cartas/<id>.webp`, 512 x 640.

- [ ] **Step 1: Write the failing test**

```js
async function testarCartasArte() {
  console.log("\n" + cinza("cartasarte: toda carta tem lance e imagem"));
  const falhas = [], conf = confJxJ(falhas), url = require("url");
  const C = await import(url.pathToFileURL(path.join(RAIZ, "api", "_jxj-cartas.js")).href);
  const L = await import(url.pathToFileURL(path.join(RAIZ, "luta3d", "lances-cartas.js")).href);
  await conf("toda carta (as 57 da mão e as 8 do chão) tem lance com arte e imagem webp de 512 x 640 com até 80 KB", () => {
    const ids = [...Object.keys(C.CARTAS), ...Object.values(C.CARTA_DO_CHAO).map((c) => c.id)];
    for (const id of ids) {
      if (!L.LANCES_CARTAS[id] || !L.LANCES_CARTAS[id].arte) throw new Error("sem lance ou arte: " + id);
      const f = path.join(RAIZ, "img", "cartas", id + ".webp");
      if (!fs.existsSync(f)) throw new Error("sem imagem: " + id);
      const b = fs.readFileSync(f);
      if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP" || b.length > 80 * 1024) throw new Error("imagem: " + id);
    }
  });
  const okTudo = !falhas.length;
  console.log("\n" + (okTudo ? verde("  cartasarte ok") : vermelho(`  ${falhas.length} falha(s) no cartasarte`)));
  return okTudo;
}
```

- [ ] **Step 2: Run, ver FAIL** (`node testar.js cartasarte`: "Cannot find module ... lances-cartas.js").
- [ ] **Step 3: Implement.** `luta3d/lances-cartas.js` com um lance por carta usando os clipes de hoje (os mesmos da Tarefa 9). `ferramentas/arte-cartas.html` monta o palco (`luta3d/palco.js`) sem plateia e um lutador neutro (`luta3d/lutador.js`), com calção na cor da casa; `arte-cartas.mjs` sobe o `ferramentas/servidor-local.mjs`, abre o Chrome do sistema com a placa de vídeo (`--use-angle=metal --enable-gpu`) pelo protocolo de depuração, e pra cada carta posa no `arte.t` do clipe, ajusta luz e fundo pela raridade, captura 512 x 640 e salva em webp (qualidade 80). Confira o `.vercelignore`: `ferramentas` fica fora do deploy; `img/cartas` vai pro ar.
- [ ] **Step 4: Run, ver PASS** (`node testar.js cartasarte`) e olhe 4 imagens (uma de cada raridade).
- [ ] **Step 5: Commit** (`git add luta3d/lances-cartas.js ferramentas/arte-cartas.* img/cartas testar.js; git commit -m "Cartas: ferramenta de arte e as imagens"`). A Tarefa 19 roda a ferramenta de novo com os lances finais.

---

## Etapa 4: animação (depois da etapa 1; worktree próprio)

### Task 17: o 3D toca o lance da carta

**Files:**
- Modify: `luta3d/diretor.js` (`GOLPES` e os `case` do Online), `index.html` (`jxjLinhas3d2` manda `carta` no lance)
- Test: `testar.js`, `luta3d` e `jxjv2`

**Interfaces:**
- Consumes: `LANCES_CARTAS` (Tarefa 16).
- Produces: todo lance do Online v2 leva `carta`; o diretor usa `LANCES_CARTAS[carta]` quando existir e o lance genérico de hoje quando não.

- [ ] **Step 1: Write the failing test** (na `luta3d`)

```js
  await conf("toda carta tem lance que o diretor conhece; o golpe existe no GOLPES; o clipe existe no mx_lutas.glb ou, se for do mx_cartas.glb, tem reserva no mx_lutas.glb; o lance do Online v2 leva a carta", async () => {
    const L = await import(require("url").pathToFileURL(path.join(__dirname, "luta3d", "lances-cartas.js")).href);
    const diretor = fs.readFileSync(path.join(__dirname, "luta3d", "diretor.js"), "utf8");
    const casos = new Set([...diretor.matchAll(/case "(\w+)"/g)].map((m) => m[1]));
    const golpes = new Set([...diretor.matchAll(/^\s{2}(\w+):\s*\{ clip:/gm)].map((m) => m[1]));
    const b = fs.readFileSync(path.join(__dirname, "luta3d", "mx_lutas.glb"));
    const clipes = new Set((JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)).toString()).animations || []).map((a) => a.name));
    for (const [id, l] of Object.entries(L.LANCES_CARTAS)) {
      if (!casos.has(l.tipo)) throw new Error(`${id}: lance ${l.tipo} sem case no diretor`);
      if (l.golpe && !golpes.has(l.golpe)) throw new Error(`${id}: golpe ${l.golpe} fora do GOLPES`);
      if (l.clipe && !clipes.has(l.clipe) && !(l.reserva && clipes.has(l.reserva))) throw new Error(`${id}: clipe ${l.clipe} sem reserva`);
    }
    const X2 = sandboxCarreira();
    const t = { round: 1, troca: 1, cartaA: "overhand", cartaB: "jab", resolucao: { posicao: { antes: { pos: "pe" }, depois: { pos: "pe" } } },
      ev: [{ tipo: "dano", quem: "a", alvo: "b", carta: "overhand", dano: 4 }] };
    X2.sb.__args = JSON.stringify([t, "a"]);
    const ls = JSON.parse(X2.run("JSON.stringify(jxjLinhas3d2(...JSON.parse(globalThis.__args)).map(L=>L.ev))"));
    if (!ls.some((ev) => ev.carta === "overhand")) throw new Error("o lance não leva a carta: " + JSON.stringify(ls));
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node testar.js luta3d 2>&1 | grep "toda carta tem lance"`
Expected: FAIL ("o lance não leva a carta").

- [ ] **Step 3: Implement.** `jxjLinhas3d2` põe `carta` em todo lance que nasce de uma carta. No diretor, o `case` do Online olha `LANCES_CARTAS[ev.carta]` primeiro (golpe, clipe ou reserva) e cai no lance genérico de hoje quando não há entrada.

- [ ] **Step 4: Run tests**

Run: `node testar.js luta3d 2>&1 | tail -2 && node testar.js jxjv2 2>&1 | tail -2`, e `ferramentas/luta3d-estresse.mjs` com os lances novos em 3x (nenhum preso).
Expected: `luta3d ok`, `jxjv2 ok`.

- [ ] **Step 5: Commit**

```bash
git add luta3d/diretor.js index.html testar.js
git commit -m "3D: lance por carta"
```

### Task 18: animações do Mixamo (lotes com o sim do dono)

**Files:**
- Create: `ferramentas/converter-mixamo.html` e `ferramentas/converter-mixamo.mjs` (FBX do Mixamo pro esqueleto do corpo, em GLB, enxugado como o `mx_lutas.glb`)
- Create: `luta3d/mx_cartas.glb` (no `.gitignore`)
- Modify: `.gitignore`, `luta3d/lutador.js` ou `luta3d/diretor.js` (carregar o `mx_cartas.glb` depois que a luta abre; sem ele, a reserva)
- Test: `testar.js`, `luta3d`

- [ ] **Step 1: Pedir o primeiro download ao dono.** O conversor de antes não existe mais (ficava fora do repositório). Pra refazer, o `FBXLoader.js` do three r169 (`examples/jsm/loaders/FBXLoader.js`, uns 110 KB, e a dependência `fflate`, uns 30 KB) vem do pacote `three@0.169.0` no npm. Mostre nome, origem e tamanho e espere o sim. Baixe numa pasta vazia do scratchpad.
- [ ] **Step 2: Listas dos lotes.** Lote 1 (golpes em pé que o Mixamo tem): overhand ou haymaker, front kick, spinning kick (hurricane kick), knee strike, elbow strike, dodge, sprawl, leg sweep. Lote 2 (o resto do que o Mixamo tiver, depois do lote 1 testado). Pra cada lote: nome de cada animação no Mixamo, origem mixamo.com, tamanho aproximado; o sim do dono; download no Chrome onde ele está logado (Claude in Chrome), FBX sem pele, 30 quadros. Nunca digitar senha: se pedir login, o dono entra.
- [ ] **Step 3: Converter e montar** o `luta3d/mx_cartas.glb` (os clipes renomeados pelo id do lance), com `luta3d/mx_cartas.glb` no `.gitignore` antes de criar o arquivo (`git check-ignore luta3d/mx_cartas.glb` tem que responder o caminho).
- [ ] **Step 4: Teste da reserva** (Review Focus 5): na `luta3d`, sem o `mx_cartas.glb`, toda carta toca o clipe de reserva e a luta termina (o mesmo método do teste de hoje sem o `mx_lutas.glb`). Ver FAIL antes de implementar o carregamento com reserva; PASS depois.
- [ ] **Step 5: Commit** (sem o GLB): `git commit -m "3D: clipes das cartas (Mixamo), com reserva sem o arquivo"`.

### Task 19: lances programados e a arte final

**Files:**
- Modify: `luta3d/diretor.js` (quadros-chave das finalizações, raspagens, passagens, single leg, suplex, bodylock, martelada, como a `MONTADA`)
- Modify: `img/cartas/*.webp` (a ferramenta da Tarefa 16 de novo, com os lances finais)
- Test: `testar.js`, `luta3d`, `cartasarte`; `ferramentas/luta3d-estresse.mjs`, `ferramentas/luta3d-e2e.mjs` com a placa de vídeo

- [ ] **Step 1:** um lance programado por vez, comparado por print (computador e celular), com o teste da `luta3d` dizendo que o lance existe.
- [ ] **Step 2:** `ferramentas/luta3d-estresse.mjs` com cada lance em 3x: nenhum preso.
- [ ] **Step 3:** rodar `ferramentas/arte-cartas.mjs` de novo; `node testar.js cartasarte`.
- [ ] **Step 4:** commit (`"3D: lances programados das cartas e arte final"`).

---

## Fechamento

- [ ] Merge das etapas 2, 3 e 4 no `combate-v2` (as três mexem em `index.html` e `testar.js` em lugares diferentes; resolva conflito mantendo os dois lados).
- [ ] `node testar.js` inteira: `TUDO CERTO`.
- [ ] Ponta a ponta: `PORTA=8851 node ferramentas/online-v2-e2e.mjs <pasta>` com um deck de cartas da árvore; prints da carta nova chegando, da aba Deck e de uma luta com lance novo.
- [ ] `docs/combat-v2.md` com o catálogo final; LEIA-ME com uma seção "Cartas da árvore" (o que é, onde mora, como rodar a arte e a conversão do Mixamo).
- [ ] Push do `combate-v2`. Nada de deploy.
