# Online com estratégia: Fase 2 (sinais e blefe)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Antes de escolher a ação, cada lutador mostra uma postura (o sinal); os dois sinais aparecem juntos; a ação diferente do próprio sinal é finta e custa energia; a finta aparece na revelação e no histórico dele.

**Architecture:** O sinal fica numa tabela nova (`jxj_sinais`), porque a troca aberta não grava estado antes de ser resolvida. A troca passa a ter um prazo só, de 17 s (`sinalMs` 5 s + `acaoMs` 12 s): os primeiros 5 s são a etapa do sinal, e a etapa da ação começa quando os dois sinalizaram ou quando os 5 s acabam, sem gravação extra (a etapa é calculada do prazo e dos sinais). Na resolução, o servidor passa os sinais pro motor (`acoesIn.sinais`), que cobra a finta e grava os eventos `sinais` e `finta` (a luta continua refeita pela semente). Sem a migração no banco, o servidor cai na Fase 1 (sem sinal), pelo código `PGRST202`.

**Tech Stack:** Node (ES modules) nas funções da Vercel, Postgres no Supabase (PGlite nos testes), `index.html`, `testar.js`.

**Spec:** `docs/superpowers/specs/2026-10-27-online-estrategia-design.md` (seção 7)

## Global Constraints

- Etapa do sinal: 5 s (`ESTRATEGIA.prazos.sinalMs`); etapa da ação até o fim da troca; troca inteira 17 s (`FORMATO.prazoMs` = sinal + ação).
- Posturas: "Peso na frente" (Golpes), "Base baixa" (Queda), "Guarda alta" (Defesa), "Avançando" (Pressão). Só vale postura de família com carta.
- Sinal ausente no prazo: a postura da ação padrão (`acaoPadrao`).
- Finta (ação diferente do próprio sinal): `ESTRATEGIA.custoFinta` de energia (1,5 pra começar); sem energia, o servidor recusa.
- Os dois sinais só aparecem juntos (quando os dois mandaram ou a etapa do sinal acabou); a vista nunca manda o sinal dele antes.
- A finta aparece pros dois na revelação e entra na tendência dele.
- Meta: no equilíbrio medido, o sinal acerta a ação de 60% a 75% das vezes.
- Servidor decide tudo; a luta é refeita pela semente; bots marcados; nada de pagar pra ganhar; texto sem travessão nem emoji; deploy só com "deploya", depois das 4 fases e do SQL do dono.

## Decisões de desenho (pra o dono confirmar na revisão)

1. **Um prazo só por troca (17 s).** A etapa do sinal é calculada (`prazo − acaoMs`), sem gravar "etapa" nem prazo novo no meio da troca. Se os dois sinalizam rápido, a etapa da ação fica com mais que 12 s (até 17 s).
2. **Ação mandada na etapa do sinal vira compromisso honesto.** Quem manda a ação antes da revelação grava sinal = ação (sem finta) e não reage ao sinal dele. Isso mantém os fluxos de hoje funcionando (e a pressa tem custo: não ler o outro).
3. **"Ele já escolheu" só conta ação mandada depois da revelação** (por `enviada_em`), pra o compromisso antecipado não denunciar que o sinal dele é honesto.
4. **O sinal mora numa tabela nova** (`jxj_sinais`), lida por uma função nova (`jxj_sinais_abertos`), sem refazer a `jxj_luta`.

## Review Focus

1. Sinal dele vazando antes da revelação (vista do outro durante a etapa do sinal, inclusive contra bot): só `adversarioSinalizou`. Teste na Task 5.
2. Finta sem energia mandada direto pela API: 400 sem gravar. Teste na Task 5.
3. Luta antiga (v3) e luta v4 sem a migração: sem etapa de sinal, ação aceita como na Fase 1. Teste na Task 5.
4. Prazo do sinal estourado por um lado só: a postura padrão dele aparece e a etapa da ação abre pros dois. Teste na Task 5.
5. Luta refeita pela semente com fintas: igual à gravada. Teste na Task 1 (motor) e na Task 5 (servidor).

---

### Task 1: Motor com sinais e finta

**Files:**
- Modify: `api/_jxj-estrategia.js` (`prazos.sinalMs`, `custoFinta`, `POSTURAS`)
- Modify: `api/_jxj-motor.js` (`FORMATO.prazoMs`, `resolverTroca`, `textoEvento`, `simularLuta`)
- Test: `testar.js` (`jxjmotor`)

**Interfaces:**
- Produces:
  - `ESTRATEGIA.prazos.sinalMs` (5000), `ESTRATEGIA.custoFinta` (1.5), `POSTURAS = {golpes: "Peso na frente", queda: "Base baixa", defesa: "Guarda alta", pressao: "Avançando"}`
  - `resolverTroca(estado, perfis, {a, b, sinais: {a, b}}, semente)`: com `sinais`, cobra `custoFinta` (até zerar a energia) de quem fez ação diferente do próprio sinal; grava `{tipo: "sinais", a, b}` (sem texto) e `{tipo: "finta", quem, sinal, fam}` (com texto)
  - `FORMATO.prazoMs` = `sinalMs + acaoMs`
  - `simularLuta`: estratégia pode ser função (como hoje: sinal honesto) ou `{sinal(e, l, p, r), acao(e, l, p, r, sinais)}`

- [ ] **Step 1: Write the failing tests** (`jxjmotor`, depois dos testes da mão)

```js
  await conf("sinais (v4, fase 2): com sinais, ação diferente do próprio sinal é finta (custa custoFinta de energia, evento finta com texto); igual não custa nada; os eventos guardam os dois sinais; sem sinais, nada muda; a luta refeita com os sinais gravados é a mesma", () => {
    const pA = perfil("striker"), pB = perfil("counter"), P = { a: pA, b: pB };
    const e = M.novaLuta(pA, pB);
    const sem = M.resolverTroca(e, P, { a: "golpes", b: "defesa" }, "f1");
    const hon = M.resolverTroca(e, P, { a: "golpes", b: "defesa", sinais: { a: "golpes", b: "defesa" } }, "f1");
    if (JSON.stringify(hon.estado) !== JSON.stringify(sem.estado) || hon.eventos.some((ev) => ev.tipo === "finta")) throw new Error("sinal honesto mudou a troca");
    const s = hon.eventos.find((ev) => ev.tipo === "sinais");
    if (!s || s.a !== "golpes" || s.b !== "defesa" || sem.eventos.some((ev) => ev.tipo === "sinais")) throw new Error("evento sinais: " + JSON.stringify(s));
    const fin = M.resolverTroca(e, P, { a: "golpes", b: "defesa", sinais: { a: "defesa", b: "defesa" } }, "f1");
    const ev = fin.eventos.find((x) => x.tipo === "finta");
    if (!ev || ev.quem !== "a" || ev.sinal !== "defesa" || ev.fam !== "golpes") throw new Error("finta: " + JSON.stringify(ev));
    if (Math.abs((sem.estado.a.energia - fin.estado.a.energia) - Math.min(EST.ESTRATEGIA.custoFinta, sem.estado.a.energia)) > 1e-9) throw new Error("custo da finta: " + sem.estado.a.energia + " / " + fin.estado.a.energia);
    const t = M.textoEvento(ev, { a: "Ana", b: "Bia" });
    if (!/Ana mostrou Guarda alta e fez Golpes/.test(t) || problemasDeTexto(t).length) throw new Error("texto: " + t);
    if (M.FORMATO.prazoMs !== EST.ESTRATEGIA.prazos.sinalMs + EST.ESTRATEGIA.prazos.acaoMs) throw new Error("prazo da troca " + M.FORMATO.prazoMs);
  });
```

e, no teste "acoesDisponiveis manda quantas cartas restam ...", trocar a conferência do prazo por `M.FORMATO.prazoMs !== EST.ESTRATEGIA.prazos.sinalMs + EST.ESTRATEGIA.prazos.acaoMs`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node testar.js jxjmotor`
Expected: FAIL no teste dos sinais (`evento sinais: undefined`).

- [ ] **Step 3: Implement**

`api/_jxj-estrategia.js`:

```js
  /* custo, em energia, de fazer uma ação diferente do próprio sinal */
  custoFinta: 1.5,
  prazos: { sinalMs: 5000, acaoMs: 12000 },
```

```js
/* a postura de cada família (o sinal que o lutador mostra) */
export const POSTURAS = { golpes: "Peso na frente", queda: "Base baixa", defesa: "Guarda alta", pressao: "Avançando" };
```

`api/_jxj-motor.js`:

```js
export const FORMATO = { rounds: 3, trocasPorRound: 4, prazoMs: ESTRATEGIA.prazos.sinalMs + ESTRATEGIA.prazos.acaoMs, toleranciaMs: 3000 };
```

Em `resolverTroca`, depois do custo de energia das ações:

```js
  /* v4, fase 2: sinais. Ação diferente do próprio sinal é finta e custa
     energia (o servidor recusa a finta sem energia antes; aqui, no máximo
     zera). Os dois sinais ficam nos eventos pra a luta ser refeita. */
  if (acoesIn.sinais) {
    const sn = acoesIn.sinais;
    registrar(ctx, "sinais", null, { a: sn.a, b: sn.b });
    for (const l of ["a", "b"]) if (sn[l] && sn[l] !== ctx.acoes[l]) {
      estado[l].energia = Math.max(0, estado[l].energia - ESTRATEGIA.custoFinta);
      registrar(ctx, "finta", l, { sinal: sn[l], fam: ctx.acoes[l] });
    }
  }
```

`textoEvento`:

```js
    case "sinais": return "";
    case "finta": return `${q} mostrou ${POSTURAS[ev.sinal]} e fez ${FAMILIA_NOME.pe[ev.fam]}.`;
```

(`POSTURAS` importado de `_jxj-estrategia.js`. Conferir se `FAMILIA_NOME.pe` dá "Golpes", "Queda", "Defesa", "Pressão"; se der outro nome, usar `{golpes: "Golpes", queda: "Queda", defesa: "Defesa", pressao: "Pressão"}`.)

No teste de invariantes, `sinais` entra junto de `escolha` e `leu` como evento sem texto.

`simularLuta`: aceitar estratégia em objeto:

```js
    /* estratégia em função: como hoje (sem sinais); em objeto: sinal e depois ação */
    const sa = typeof estrA === "function" ? null : estrA.sinal(estado, "a", perfilA, rEst);
    const sb = typeof estrB === "function" ? null : estrB.sinal(estado, "b", perfilB, rEst);
    const sinais = sa || sb ? { a: sa, b: sb } : null;
    const acoes = {
      a: typeof estrA === "function" ? estrA(estado, "a", perfilA, rEst) : estrA.acao(estado, "a", perfilA, rEst, sinais),
      b: typeof estrB === "function" ? estrB(estado, "b", perfilB, rEst) : estrB.acao(estado, "b", perfilB, rEst, sinais),
    };
    for (const l of ["a", "b"]) if (acoes[l]) acoes[l] = familiaNaMao(estado, l, acoes[l], rEst);
    if (sinais) { for (const l of ["a", "b"]) if (!sinais[l]) sinais[l] = acoes[l]; acoes.sinais = sinais; }
```



- [ ] **Step 4: Run tests**

Run: `node testar.js jxjmotor`
Expected: tudo `ok` (as faixas não mudam: sem sinais, nada muda).

- [ ] **Step 5: Commit**

```bash
git add api/_jxj-estrategia.js api/_jxj-motor.js testar.js
git commit -m "Online v4: sinais e finta no motor"
git push
```

---

### Task 2: Simulador do sinal e o equilíbrio do blefe

**Files:**
- Modify: `ferramentas/jxj-balanco.mjs` (estratégias em duas etapas, `medirSinais`, modo `sinais`)
- Test: `testar.js` (`jxjmotor`)

**Interfaces:**
- Consumes: Task 1 (`simularLuta` com estratégia em objeto, `acoesIn.sinais`)
- Produces:
  - `comSinal(base, {blefe, confia})`: estratégia em duas etapas. Etapa do sinal: escolhe a ação pretendida com `base`; mostra ela (honesto) ou, com chance `blefe`, outra família com carta. Etapa da ação: com chance `confia`, responde ao sinal dele com a família que ganha dele (se tiver carta); senão faz a pretendida.
  - `medirSinais(n)`: `{honestidade, tabela}`: as 9 estratégias `blefe ∈ {0, .25, .5}` × `confia ∈ {0, .5, 1}` em espelho (nível 1, 4 estilos), matriz de vitórias, equilíbrio (fictitious play, `equilibrio` da ferramenta generalizada pra n×n) e a honestidade média do sinal no equilíbrio.

- [ ] **Step 1: Write the failing test**

```js
  await conf("blefe tem equilíbrio (v4, fase 2): no equilíbrio entre as estratégias de sinal, o sinal acerta a ação de 60% a 75% das vezes; ninguém ganha sempre blefando nem sempre confiando", () => {
    const r = BAL.medirSinais(120);
    console.log(cinza(`         honestidade no equilíbrio ${f1(r.honestidade)}% | estratégias usadas: ${r.usadas.join(", ")}`));
    if (r.honestidade < 60 || r.honestidade > 75) throw new Error("honestidade fora da faixa: " + f1(r.honestidade));
    if (r.usadas.length < 2) throw new Error("equilíbrio puro: " + r.usadas.join(","));
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node testar.js jxjmotor`
Expected: FAIL (`BAL.medirSinais is not a function`).

- [ ] **Step 3: Implement** (`ferramentas/jxj-balanco.mjs`)

```js
/* Estratégia em duas etapas (fase 2). A pretendida sai de base; o sinal é
   ela (honesto) ou, com chance blefe, outra família com carta. Na etapa da
   ação, com chance confia, joga a família que ganha do sinal dele (se tem
   carta); senão a pretendida. */
export function comSinal(base, { blefe = 0, confia = 0 } = {}) {
  const pretendida = new Map();
  return {
    sinal(e, l, p, r) {
      const f = EST.familiaNaMao(e, l, base(e, l, p, r), r);
      pretendida.set(l, f);
      if (r() >= blefe) return f;
      const outras = EST.familiasComCarta(e, l).filter((x) => x !== f);
      return outras.length ? outras[Math.floor(r() * outras.length)] : f;
    },
    acao(e, l, p, r, sinais) {
      const f = pretendida.get(l), o = l === "a" ? "b" : "a";
      if (sinais && sinais[o] && r() < confia) {
        const pap = { [l]: M.papel(e, l), [o]: M.papel(e, o) };
        const ganha = F.filter((x) => EST.temCarta(e, l, x) && M.quemLeu(pap, { [l]: x, [o]: sinais[o] }) === l);
        if (ganha.length) return ganha[Math.floor(r() * ganha.length)];
      }
      return f;
    },
  };
}
/* Equilíbrio de n estratégias numa matriz de vitórias (linha contra coluna). */
function equilibrioN(m, it = 20000) {
  const k = m.length, ca = new Array(k).fill(1), cb = new Array(k).fill(1);
  const norm = (c) => { const t = c.reduce((a, b) => a + b, 0); return c.map((x) => x / t); };
  for (let t = 0; t < it; t++) {
    const pa = norm(ca), pb = norm(cb);
    const ua = m.map((l) => l.reduce((s, v, j) => s + v * pb[j], 0)), ub = m[0].map((_, j) => m.reduce((s, l, i) => s + l[j] * pa[i], 0));
    ca[ua.indexOf(Math.max(...ua))]++; cb[ub.indexOf(Math.min(...ub))]++;
  }
  return norm(ca);
}
export function medirSinais(n = 150) {
  const opcoes = [];
  for (const blefe of [0, 0.25, 0.5]) for (const confia of [0, 0.5, 1]) opcoes.push({ blefe, confia });
  const m = opcoes.map(() => opcoes.map(() => 0));
  for (const s of ESTS) {
    const p = perfilTipico(s, 1);
    opcoes.forEach((x, i) => opcoes.forEach((y, j) => {
      if (j < i) return;
      const t = confronto(p, p, comSinal(racional(p, p), x), comSinal(racional(p, p), y), n, `sn${s}${i}x${j}`);
      m[i][j] += t.pct / ESTS.length; if (i !== j) m[j][i] += (100 - t.pct) / ESTS.length;
    }));
  }
  const eq = equilibrioN(m);
  const honestidade = 100 * eq.reduce((s, w, i) => s + w * (1 - opcoes[i].blefe), 0);
  const usadas = opcoes.map((x, i) => [x, eq[i]]).filter(([, w]) => w > 0.1).map(([x, w]) => `blefe ${x.blefe} confia ${x.confia}: ${(100 * w).toFixed(0)}%`);
  return { honestidade, usadas, matriz: m, opcoes, eq };
}
```

(`confronto` passa `eX`/`eO` direto pro `simularLuta`, que já aceita estratégia em objeto pela Task 1.)

Modo de linha de comando `sinais`:

```js
  } else if (cmd === "sinais") {
    const r = medirSinais(N || 200);
    console.log(`custo da finta ${EST.ESTRATEGIA.custoFinta}: o sinal acerta a ação ${f1(r.honestidade)}% das vezes no equilíbrio`);
    for (const u of r.usadas) console.log("  " + u);
```

- [ ] **Step 4: Run test; calibrar o custo**

Run: `node testar.js jxjmotor`. Se a honestidade sair da faixa, medir com `node ferramentas/jxj-balanco.mjs sinais` mudando `custoFinta` (1, 1,5, 2, 2,5) e ficar com o primeiro valor dentro de 60% a 75%. Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add ferramentas/jxj-balanco.mjs api/_jxj-estrategia.js testar.js
git commit -m "Online v4: simulador do sinal e o equilíbrio do blefe"
git push
```

---

### Task 3: Bot com sinal

**Files:**
- Modify: `api/_jxj-bot.js` (`PERSONALIDADES[*].sinal`, `sinalDoBot`, `acaoDoBot` com `sinais`)
- Test: `testar.js` (`jxjbot`)

**Interfaces:**
- Consumes: Task 1 (`POSTURAS`, `custoFinta`)
- Produces:
  - `sinalDoBot({estado, semente, trocas, dados, lado})`: a família do sinal (só do estado, das trocas e da semente; a mesma chamada dá o mesmo sinal)
  - `acaoDoBot({..., sinais})`: com `sinais` (os dois revelados), o bot pode trocar a ação pela que ganha do sinal do jogador (chance pela personalidade e pela habilidade), pagando a finta, e nunca finta sem energia
  - `PERSONALIDADES[p].sinal = {blefe, confia}`: Provocador `{blefe: .45, confia: .2}`, Paciente `{blefe: .05, confia: .3}`, Observador `{blefe: .15, confia: .7}`, Inquieto `{blefe: .3, confia: .3}` (a habilidade multiplica `confia`)

- [ ] **Step 1: Write the failing test**

```js
  await conf("sinal do bot (fase 2): o sinal sai só do estado, das trocas e da semente (a mesma chamada dá o mesmo); é de família com carta; cada jeito blefa no seu ritmo (Provocador mais que Paciente); com sinais, o bot só finta com energia e nunca vê a ação do jogador", () => {
    const pH = T.perfilTipico("striker", 4), taxas = {};
    for (const pers of BOT.PERSONALIDADES_IDS) {
      const bot = BOT.montarBot({ nivel: 4, categoria: "middleweight", rating: 1560, semente: "sn" + pers, pers }), dados = BOT.dadosDaLuta(bot, pH);
      let blefes = 0, total = 0;
      for (let luta = 0; luta < 60; luta++) {
        let e = M.novaLuta(pH, bot.perfil); const trocas = [];
        while (!e.fim) {
          const sem = `sn${pers}${luta}`, sB = BOT.sinalDoBot({ estado: e, semente: sem, trocas, dados, lado: "b" });
          if (sB !== BOT.sinalDoBot({ estado: e, semente: sem, trocas, dados, lado: "b" }) || !EST.temCarta(e, "b", sB)) throw new Error(`${pers}: sinal ${sB}`);
          const sH = EST.familiasComCarta(e, "a")[luta % EST.familiasComCarta(e, "a").length];
          const aB = BOT.acaoDoBot({ estado: e, semente: sem, trocas, dados, lado: "b", sinais: { a: sH, b: sB } });
          if (aB !== sB && e.b.energia < EST.ESTRATEGIA.custoFinta) throw new Error(`${pers}: fintou sem energia`);
          total++; if (aB !== sB) blefes++;
          const r = M.resolverTroca(e, { a: pH, b: bot.perfil }, { a: sH, b: aB, sinais: { a: sH, b: sB } }, sem);
          trocas.push({ round: e.round, troca: e.troca, acao_a: sH, acao_b: aB, eventos: r.eventos }); e = r.estado;
        }
      }
      taxas[pers] = blefes / total;
    }
    console.log(cinza("         fintas do bot: " + Object.entries(taxas).map(([p, x]) => `${p} ${(100 * x).toFixed(0)}%`).join(" | ")));
    if (!(taxas.agressivo > taxas.defensivo + 0.1)) throw new Error("Provocador não finta mais que o Paciente");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node testar.js jxjbot`
Expected: FAIL (`BOT.sinalDoBot is not a function`).

- [ ] **Step 3: Implement** (`api/_jxj-bot.js`)

```js
/* Fase 2: o sinal do bot. A pretendida é a mesma que ele jogaria sem sinal
   (decidir, com um sorteio próprio); com a chance de blefe do jeito, mostra
   outra família com carta. Só estado, trocas e semente entram. */
export function sinalDoBot({ estado, semente, trocas, dados, lado = "b" }) {
  const r = gerador(`sinal:${semente}:${estado.round}:${estado.troca}`);
  const pretendida = decidir(estado, lado, dados, historicoDasTrocas(trocas, lado), r, acoesDoBot(trocas, lado));
  const sp = (PERSONALIDADES[dados.pers] || {}).sinal || { blefe: 0.15 };
  if (r() >= sp.blefe) return pretendida;
  const outras = FAMILIAS_MAO.filter((f) => f !== pretendida && temCarta(estado, lado, f));
  return outras.length ? outras[Math.floor(r() * outras.length)] : pretendida;
}
```

`acaoDoBot`: com `sinais`, a base é a família do próprio sinal (`sinais[lado]`); com chance `confia × s` (s = habilidade), troca pela que ganha do sinal do jogador, se tem carta e energia pra finta:

```js
export function acaoDoBot({ estado, semente, trocas, dados, lado = "b", sinais = null }) {
  const r = gerador(`acao:${semente}:${estado.round}:${estado.troca}`);
  if (!sinais) return decidir(estado, lado, dados, historicoDasTrocas(trocas, lado), r, acoesDoBot(trocas, lado));
  const o = lado === "a" ? "b" : "a", meu = sinais[lado];
  const sp = (PERSONALIDADES[dados.pers] || {}).sinal || { confia: 0.3 };
  if (r() < sp.confia * (Number(dados.s) || 0) && estado[lado].energia >= ESTRATEGIA.custoFinta) {
    const pap = { [lado]: MOTOR.papel(estado, lado), [o]: MOTOR.papel(estado, o) };
    const ganha = FAMILIAS_MAO.filter((f) => temCarta(estado, lado, f) && MOTOR.quemLeu(pap, { [lado]: f, [o]: sinais[o] }) === lado);
    if (ganha.length && !ganha.includes(meu)) return ganha[Math.floor(r() * ganha.length)];
  }
  return meu;
}
```

(Imports: `FAMILIAS_MAO`, `ESTRATEGIA` de `_jxj-estrategia.js`. Cada personalidade ganha `sinal: {blefe, confia}` com os valores do bloco Interfaces. O `dados.s` é a habilidade que `dadosDaLuta` já grava; conferir o nome do campo no arquivo e usar o que existe.)

- [ ] **Step 4: Run tests**

Run: `node testar.js jxjbot`
Expected: o teste novo `ok`; o resto como antes (sem `sinais`, `acaoDoBot` não muda).

- [ ] **Step 5: Commit**

```bash
git add api/_jxj-bot.js testar.js
git commit -m "Online v4: o bot mostra sinal, blefa pelo jeito e lê o sinal do jogador"
git push
```

---

### Task 4: Banco (tabela e funções do sinal)

**Files:**
- Modify: `supabase_jxj_estrategia.sql`
- Test: `testar.js` (`jxj`, segurança)

**Interfaces:**
- Produces:
  - tabela `jxj_sinais (luta_id, round, troca, lado, familia, enviado_em)`, chave `(luta_id, round, troca, lado)`, RLS sem policy
  - `jxj_enviar_sinal(uid uuid, lid bigint, round_ smallint, troca_ smallint, familia_ text, acao_ms integer) returns jsonb` (`{gravou: true|false}`; erro se não é participante, se a luta não está em andamento, se a troca não é a aberta, se a etapa do sinal acabou: `l.prazo - make_interval(secs => acao_ms / 1000.0) < now()`, com `acao_ms` de parâmetro)
  - `jxj_sinais_abertos(lid bigint) returns jsonb`: lista dos sinais da troca aberta (`[{lado, familia, enviado_em}]`)
  - execução só pra `service_role`

- [ ] **Step 1: Write the failing test** (suíte `jxj`)

```js
    await conf("sinais no banco (fase 2): só quem luta sinaliza, uma vez por troca, só na etapa do sinal; a leitura devolve os sinais da troca aberta; anon e authenticated não executam", async () => {
      const u1 = await novoUsuario({ pro: true }), u2 = await novoUsuario({ pro: true }), u3 = await novoUsuario({ pro: true });
      await zerarLimites();
      const lid = await parear(u1, (await criar(u1)).id, u2, (await criar(u2)).id);
      const acao = EST.ESTRATEGIA.prazos.acaoMs;
      const r1 = (await q("select public.jxj_enviar_sinal($1, $2, 1::smallint, 1::smallint, 'golpes', $3) as r", [u1, lid, acao]))[0].r;
      const r2 = (await q("select public.jxj_enviar_sinal($1, $2, 1::smallint, 1::smallint, 'defesa', $3) as r", [u1, lid, acao]))[0].r;
      if (!r1.gravou || r2.gravou) throw new Error("sinal duas vezes: " + JSON.stringify([r1, r2]));
      let deu = false; try { await q("select public.jxj_enviar_sinal($1, $2, 1::smallint, 1::smallint, 'golpes', $3)", [u3, lid, acao]); } catch { deu = true; }
      if (!deu) throw new Error("quem não luta sinalizou");
      const ab = (await q("select public.jxj_sinais_abertos($1) as r", [lid]))[0].r;
      if (ab.length !== 1 || ab[0].familia !== "golpes") throw new Error("abertos: " + JSON.stringify(ab));
      await q("update jxj_lutas set prazo = now() + interval '5 seconds' where id = $1", [lid]);   // etapa do sinal já acabou (faltam menos que acaoMs)
      deu = false; try { await q("select public.jxj_enviar_sinal($1, $2, 1::smallint, 1::smallint, 'golpes', $3)", [u2, lid, acao]); } catch { deu = true; }
      if (!deu) throw new Error("sinalizou fora da etapa");
      const exec = [];
      for (const papel of ["authenticated", "anon"]) { await db.exec(`set role ${papel};`); for (const f of [`select public.jxj_sinais_abertos(1)`, `select public.jxj_enviar_sinal(gen_random_uuid(), 1, 1::smallint, 1::smallint, 'golpes', 12000)`]) { let ok2 = true; try { await db.query(f); } catch { ok2 = false; } exec.push(ok2); } await db.exec("reset role;"); }
      if (exec.some(Boolean)) throw new Error("anon/authenticated executaram: " + JSON.stringify(exec));
    });
```

(No topo da suíte `jxj`, importar `EST` como no `jxjmotor`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node testar.js jxj`
Expected: FAIL (`function public.jxj_enviar_sinal ... does not exist`).

- [ ] **Step 3: Implement** (acrescentar ao `supabase_jxj_estrategia.sql`, depois do `update` da versão)

```sql
-- Fase 2 (sinais e blefe): o sinal de cada lado na troca aberta.
create table if not exists jxj_sinais (
  luta_id bigint not null references jxj_lutas(id) on delete cascade,
  round smallint not null,
  troca smallint not null,
  lado char(1) not null check (lado in ('a', 'b')),
  familia text not null check (familia in ('golpes', 'queda', 'defesa', 'pressao')),
  enviado_em timestamptz not null default now(),
  primary key (luta_id, round, troca, lado)
);
alter table jxj_sinais enable row level security;

/* Grava o sinal de quem luta, uma vez por troca, só na etapa do sinal (os
   primeiros segundos da troca: o prazo da troca menos o da ação). */
create or replace function public.jxj_enviar_sinal(uid uuid, lid bigint, round_ smallint, troca_ smallint, familia_ text, acao_ms integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l jxj_lutas; lado_ char(1);
begin
  select * into l from jxj_lutas where id = lid;
  if not found or (l.a_user <> uid and l.b_user <> uid) then raise exception 'jxj: luta não encontrada'; end if;
  if l.status <> 'andamento' then raise exception 'jxj: a luta não está em andamento'; end if;
  if l.round <> round_ or l.troca <> troca_ then raise exception 'jxj: essa troca já foi resolvida'; end if;
  if l.prazo - make_interval(secs => acao_ms / 1000.0) < now() then raise exception 'jxj: a etapa do sinal acabou'; end if;
  lado_ := case when l.a_user = uid then 'a' else 'b' end;
  insert into jxj_sinais (luta_id, round, troca, lado, familia) values (lid, round_, troca_, lado_, familia_)
    on conflict (luta_id, round, troca, lado) do nothing;
  return jsonb_build_object('gravou', found);
end $$;

create or replace function public.jxj_sinais_abertos(lid bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('lado', s.lado, 'familia', s.familia, 'enviado_em', s.enviado_em)), '[]'::jsonb)
    from jxj_sinais s join jxj_lutas l on l.id = s.luta_id and s.round = l.round and s.troca = l.troca
   where l.id = lid
$$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'jxj\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
```

(A assinatura de `jxj_enviar_sinal` leva `acao_ms`, igual ao jeito das outras funções que recebem `prazo_ms` do servidor; o teste do Step 1 chama com ele.)

Atualizar o cabeçalho do arquivo (o que muda na fase 2 e como desfazer: `drop table jxj_sinais; drop function ...`). O rollback (`supabase_jxj_rollback.sql`) já apaga tudo que começa com `jxj_`.

- [ ] **Step 4: Run tests**

Run: `node testar.js jxj`
Expected: o teste novo `ok`; o do rollback continua `ok`.

- [ ] **Step 5: Commit**

```bash
git add supabase_jxj_estrategia.sql testar.js
git commit -m "Online v4: tabela e funções do sinal (migração da fase 2)"
git push
```

---

### Task 5: Servidor (etapas, sinal, finta, vista)

**Files:**
- Modify: `api/jxj.js` (ação `sinal`, regra da ação nas etapas, `processarLuta` com sinais, `vistaDaLuta`, tendência com fintas, lista `ACOES_CONTA` e limites)
- Test: `testar.js` (`jxj`)

**Interfaces:**
- Consumes: Tasks 1, 3, 4
- Produces na vista (luta v4 com a migração): `etapa: "sinal" | "acao"`, `prazoSinal`, `meuSinal`, `adversarioSinalizou`, `sinais: {a, b} | null` (só na etapa da ação), `acoes[].finta` (custo de energia se a ação é finta, 0 se é o próprio sinal, `null` antes do sinal), `tendencia.fintas` e `tendencia.sinais`; `adversarioEscolheu` conta só ação mandada depois da revelação. Ação nova `sinal` (`{lutaId, round, troca, familia}`).

Regras do servidor:
- `sinaisDaTroca(L)`: lê `jxj_sinais_abertos` (sem a migração, `PGRST202`: `null` e tudo como na Fase 1); bot: o sinal do lado b é `BOT.sinalDoBot(...)`, sempre presente.
- Etapa: `acao` se os dois sinais existem ou `agora > prazo − acaoMs`; senão `sinal`. Na etapa `acao`, sinal que falta = postura da ação padrão (`EST.acaoPadrao`).
- Ação `sinal`: família válida e com carta; só na etapa do sinal (o banco confere o prazo).
- Ação `acao` na etapa do sinal: sem sinal ainda, grava o sinal igual à ação (compromisso honesto) e a ação; com sinal, só aceita a mesma família. Na etapa da ação: família diferente do próprio sinal exige energia ≥ `custoFinta` (senão 400 "Sem energia pra fintar.").
- Resolução: passa `sinais` (com os padrões) pro motor e pro bot (`BOT.acaoDoBot({..., sinais})`).
- Vista: antes da revelação, nunca o sinal dele.

- [ ] **Step 1: Write the failing tests** (suíte `jxj`)

```js
    await conf("sinais na luta (fase 2): etapa do sinal e da ação; o sinal dele só aparece quando os dois mandaram; a ação diferente do próprio sinal é finta e custa energia, sem energia é recusada; a finta aparece na troca e na tendência; ação na etapa do sinal é compromisso honesto; a luta refeita pela semente é a mesma", async () => {
      const u1 = await novoUsuario({ pro: true }), u2 = await novoUsuario({ pro: true });
      await zerarLimites();
      const lid = await parear(u1, (await criar(u1)).id, u2, (await criar(u2)).id);
      let v1 = await ok(u1, "luta", { lutaId: lid });
      if (v1.etapa !== "sinal" || v1.sinais !== null || v1.meuSinal !== null) throw new Error("começo: " + JSON.stringify([v1.etapa, v1.sinais, v1.meuSinal]));
      await ok(u1, "sinal", { lutaId: lid, round: 1, troca: 1, familia: "defesa" });
      const v2 = await ok(u2, "luta", { lutaId: lid });
      if (v2.etapa !== "sinal" || v2.sinais !== null || !v2.adversarioSinalizou || /defesa/.test(JSON.stringify({ s: v2.sinais, t: v2.tendencia }))) throw new Error("sinal dele vazou: " + JSON.stringify([v2.sinais, v2.adversarioSinalizou]));
      await erro(u1, "acao", { lutaId: lid, round: 1, troca: 1, familia: "golpes" }, /espere|postura/i);   // fintar antes da revelação não
      await ok(u2, "sinal", { lutaId: lid, round: 1, troca: 1, familia: "golpes" });
      v1 = await ok(u1, "luta", { lutaId: lid });
      if (v1.etapa !== "acao" || !v1.sinais || v1.sinais.b !== "golpes" || v1.sinais.a !== "defesa") throw new Error("revelação: " + JSON.stringify(v1.sinais));
      if (v1.acoes.find((a) => a.familia === "defesa").finta !== 0 || v1.acoes.find((a) => a.familia === "queda").finta !== EST.ESTRATEGIA.custoFinta) throw new Error("custo de finta na ação: " + JSON.stringify(v1.acoes.map((a) => [a.familia, a.finta])));
      await ok(u1, "acao", { lutaId: lid, round: 1, troca: 1, familia: "queda" });   // finta: mostrou Defesa, fez Queda
      await ok(u2, "acao", { lutaId: lid, round: 1, troca: 1, familia: "golpes" });
      const v3 = await ok(u2, "luta", { lutaId: lid });
      const t = v3.trocas.find((x) => x.round === 1 && x.troca === 1);
      if (!t.eventos.some((e) => /mostrou Guarda alta e fez Queda/.test(e))) throw new Error("finta na troca: " + t.eventos.join(" "));
      if (v3.tendencia.fintas !== 1 || v3.tendencia.sinais !== 1) throw new Error("tendência: " + JSON.stringify(v3.tendencia));
      /* sem energia: a finta é recusada */
      await q("update jxj_lutas set estado = jsonb_set(estado, '{a,energia}', '0.5'::jsonb) where id = $1", [lid]);
      const ab = await ok(u1, "luta", { lutaId: lid });
      await ok(u1, "sinal", { lutaId: lid, round: ab.round, troca: ab.troca, familia: "defesa" });
      await ok(u2, "sinal", { lutaId: lid, round: ab.round, troca: ab.troca, familia: "defesa" });
      await erro(u1, "acao", { lutaId: lid, round: ab.round, troca: ab.troca, familia: "golpes" }, /energia/);
      /* ação direto na etapa do sinal: compromisso honesto (sinal = ação) */
      await ok(u1, "acao", { lutaId: lid, round: ab.round, troca: ab.troca, familia: "defesa" });
      await ok(u2, "acao", { lutaId: lid, round: ab.round, troca: ab.troca, familia: "defesa" });
      const ab2 = await ok(u1, "luta", { lutaId: lid });
      await ok(u1, "acao", { lutaId: lid, round: ab2.round, troca: ab2.troca, familia: "defesa" });
      const s2 = (await q("select familia from jxj_sinais where luta_id = $1 and round = $2 and troca = $3 and lado = $4", [lid, ab2.round, ab2.troca, ab2.lado]))[0];
      if (!s2 || s2.familia !== "defesa") throw new Error("compromisso honesto não gravou o sinal");
      /* refeita pela semente: igual */
      await vencerPrazo(lid); await ok(u2, "luta", { lutaId: lid });
      const d = (await q("select public.jxj_luta($1::bigint) as d", [lid]))[0].d;
      let e = MOTOR.novaLuta(d.luta.perfis.a, d.luta.perfis.b);
      for (const tr of d.trocas) { const sn = tr.eventos.find((x) => x.tipo === "sinais"); e = MOTOR.resolverTroca(e, d.luta.perfis, { a: tr.acao_a, b: tr.acao_b, ...(sn ? { sinais: { a: sn.a, b: sn.b } } : {}) }, d.luta.semente).estado; }
      const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((c) => [c, v[c]])) : v));
      if (canon(e) !== canon(d.luta.estado)) throw new Error("a luta refeita pela semente ficou diferente");
    });
    await conf("sinal sem a migração da fase 2 e na luta antiga: sem etapa de sinal, ação como na fase 1", async () => {
      const db2 = await B.novoBanco({ estrategia: false });
      const fetchAntes = globalThis.fetch;
      globalThis.fetch = B.fetchFalso(db2, { SUPABASE_URL });
      try {
        const a = "00000000-0000-4000-8000-0000000009d1", b = "00000000-0000-4000-8000-0000000009d2";
        await B.criarUsuario(db2, a, { pro: true }); await B.criarUsuario(db2, b, { pro: true });
        const ca = await B.chamar(H, { token: "tok:" + a, acao: "criar", nome: "Sem Sinal Um", rosto: ROSTO, categoria: "lightweight", estilo: "striker" });
        const cb = await B.chamar(H, { token: "tok:" + b, acao: "criar", nome: "Sem Sinal Dois", rosto: ROSTO, categoria: "lightweight", estilo: "striker" });
        await B.chamar(H, { token: "tok:" + a, acao: "filaEntrar", lutadorId: ca.json.id }); await B.chamar(H, { token: "tok:" + b, acao: "filaEntrar", lutadorId: cb.json.id });
        const f = await B.chamar(H, { token: "tok:" + a, acao: "fila" });
        await B.chamar(H, { token: "tok:" + a, acao: "confirmar", lutaId: f.json.luta.id }); await B.chamar(H, { token: "tok:" + b, acao: "confirmar", lutaId: f.json.luta.id });
        const v = await B.chamar(H, { token: "tok:" + a, acao: "luta", lutaId: f.json.luta.id });
        if (v.json.etapa !== undefined && v.json.etapa !== null) throw new Error("etapa sem a migração: " + v.json.etapa);
        const r = await B.chamar(H, { token: "tok:" + a, acao: "acao", lutaId: f.json.luta.id, round: 1, troca: 1, familia: "golpes" });
        if (r.status !== 200) throw new Error("ação sem a migração: " + JSON.stringify(r.json));
      } finally { globalThis.fetch = fetchAntes; }
    });
```

E ajustar os testes que já existem e dependem do comportamento antigo:
- "ação oculta": na luta com sinal, `adversarioEscolheu` fica `false` pra ação mandada antes da revelação (compromisso antecipado); conferir isso e que o resto da vista não diz "pressao" (excluindo `acoes`, `maos`, `maoCheia`).
- Os testes que mandam ação logo no começo continuam valendo (compromisso honesto).

- [ ] **Step 2: Run tests to verify they fail**

Run: `node testar.js jxj`
Expected: FAIL nos dois testes novos (`etapa` indefinida, ação `sinal` desconhecida).

- [ ] **Step 3: Implement** (`api/jxj.js`)

Funções novas, perto de `processarLuta`:

```js
/* Fase 2: os sinais da troca aberta, {a, b} (null = ainda não mandou), ou
   null se o banco não tem a migração (PGRST202) ou a luta é v3 (sem mão).
   Contra bot, o sinal do bot (lado b) sai do estado, das trocas e da semente. */
async function sinaisDaTroca(d) {
  const L = d.luta;
  if (!L.estado || !L.estado.mao || L.status !== "andamento") return null;
  let lista;
  try { lista = await rpc("jxj_sinais_abertos", { lid: L.id }); }
  catch (e) { if (e.codigo === "PGRST202") return null; throw e; }
  const s = { a: null, b: null, em: { a: null, b: null } };
  for (const x of lista || []) { s[x.lado] = x.familia; s.em[x.lado] = x.enviado_em; }
  if (L.bot) s.b = BOT.sinalDoBot({ estado: L.estado, semente: L.semente, trocas: d.trocas, dados: L.bot, lado: "b" });
  return s;
}
const ACAO_MS = EST.ESTRATEGIA.prazos.acaoMs;
/* etapa da troca aberta: "acao" quando os dois sinalizaram ou a etapa do sinal acabou */
function etapaDaTroca(L, sinais, agora) {
  if (!sinais) return null;
  return (sinais.a && sinais.b) || agora > Date.parse(L.prazo) - ACAO_MS ? "acao" : "sinal";
}
/* sinais revelados, com a postura padrão pra quem não mandou */
const sinaisRevelados = (L, s) => ({ a: s.a || EST.acaoPadrao(L.estado, "a"), b: s.b || EST.acaoPadrao(L.estado, "b") });
```

`processarLuta`, antes de `MOTOR.resolverTroca`:

```js
    const sn = await sinaisDaTroca(d);
    const sinais = sn ? sinaisRevelados(L, sn) : null;
    if (L.bot) { /* ...como hoje... */ acoes.b = BOT.acaoDoBot({ estado: L.estado, semente: L.semente, trocas: d.trocas, dados: L.bot, lado: "b", sinais }); }
    const { estado, eventos } = MOTOR.resolverTroca(L.estado, L.perfis, sinais ? { ...acoes, sinais } : acoes, L.semente);
```

(A ação do jogador nunca entra no bot; a do bot passa a considerar os dois sinais revelados.)

Ação `sinal`:

```js
    case "sinal": {
      const lid = idDe(c.lutaId, "luta");
      if (!MOTOR.FAMILIAS.includes(c.familia)) throw new ErroJxJ("postura inválida");
      const round = Math.floor(Number(c.round)), troca = Math.floor(Number(c.troca));
      const d0 = await processarLuta(lid, uid), L0 = d0.luta, lado0 = L0.a_user === uid ? "a" : L0.b_user === uid ? "b" : null;
      if (L0.estado && lado0 && !EST.temCarta(L0.estado, lado0, c.familia)) throw new ErroJxJ("Você já usou essa ação neste round.");
      try { await rpc("jxj_enviar_sinal", { uid, lid, round_: round, troca_: troca, familia_: c.familia, acao_ms: ACAO_MS }); }
      catch (e) { if (e.codigo === "PGRST202") throw new ErroJxJ("os sinais ainda não foram ligados", 503); throw e; }
      return vistaDaLuta(await processarLuta(lid, uid), uid);
    }
```

Ação `acao` (depois da checagem da carta):

```js
      const sn0 = await sinaisDaTroca(d0), etapa0 = etapaDaTroca(L0, sn0, Date.parse(d0.agora));
      if (etapa0 === "sinal") {
        /* antes da revelação: só compromisso honesto (sem sinal ainda, a ação vira o sinal) */
        if (sn0[lado0] && sn0[lado0] !== c.familia) throw new ErroJxJ("Espere ele mostrar a postura pra fintar.");
        if (!sn0[lado0]) await rpc("jxj_enviar_sinal", { uid, lid, round_: round, troca_: troca, familia_: c.familia, acao_ms: ACAO_MS });
      } else if (etapa0 === "acao") {
        const meu = sinaisRevelados(L0, sn0)[lado0];
        if (meu !== c.familia && L0.estado[lado0].energia < EST.ESTRATEGIA.custoFinta) throw new ErroJxJ("Sem energia pra fintar.");
      }
```

Vista: calcular `sn = await sinaisDaTroca(d)` antes (tornar `vistaDaLuta` assíncrona ou passar `sn` de quem chama; preferir calcular em `processarLuta` e devolver em `d.sinais`), e:

```js
    etapa, prazoSinal: etapa ? new Date(Date.parse(L.prazo) - ACAO_MS).toISOString() : null,
    meuSinal: sn && lado ? sn[lado] : null,
    adversarioSinalizou: sn && lado ? !!sn[outroLado(lado)] : null,
    sinais: etapa === "acao" ? sinaisRevelados(L, sn) : null,
```

e, em cada item de `acoes`, `finta: etapa === "acao" ? (a.familia === sinaisRevelados(L, sn)[lado] ? 0 : EST.ESTRATEGIA.custoFinta) : null`. `adversarioEscolheu` com sinais: só se a ação dele foi enviada depois da revelação (`enviada_em` da ação ≥ o momento da revelação: o maior `enviado_em` dos dois sinais, ou `prazo − acaoMs`).

`tendenciaDoAdversario`: somar `sinais` (trocas com evento `sinais`) e `fintas` (eventos `finta` dele).

`ACOES_CONTA`: incluir `"sinal"`; limite de chamadas igual ao de `acao`.

- [ ] **Step 4: Run tests**

Run: `node testar.js jxj`
Expected: tudo `ok`.

- [ ] **Step 5: Commit**

```bash
git add api/jxj.js testar.js
git commit -m "Online v4: etapas do sinal e da ação no servidor, finta e tendência"
git push
```

---

### Task 6: Tela das etapas

**Files:**
- Modify: `index.html` (`jxjDesenharCombate`, relógio por etapa, `jxjTendencia`, lance com a finta, dicas da primeira luta)
- Modify: `estilo.css`
- Test: `testar.js` (`jxjtelas`)

**Interfaces:**
- Consumes: vista da Task 5
- Produces: `.jxj-posturas` (4 botões `.jxj-postura`, só família com carta) na etapa do sinal, com o relógio do sinal; `.jxj-sinais` (os dois sinais) na etapa da ação; botões de ação com `.jxj-finta` (custo) quando a ação é finta, desabilitados sem energia; tendência com "fintou X de Y"; dica da primeira luta "Ele mostrou Guarda alta. Pode ser verdade ou finta."

- [ ] **Step 1: Write the failing test** (`jxjtelas`)

```js
    await conf("etapas na tela (fase 2): no sinal, só as posturas (das famílias com carta) e o relógio do sinal, sem as ações; na ação, os dois sinais e o custo da finta nos botões que não são o seu sinal; sem energia, a finta apagada; a tendência conta as fintas", async () => {
      /* luta nova entre u1 e u2 (sem mexer na lid dos outros testes) */
      const u3 = "00000000-0000-4000-8000-0000000000a3", u4 = "00000000-0000-4000-8000-0000000000a4";
      await B.criarUsuario(db, u3, { pro: true }); await B.criarUsuario(db, u4, { pro: true });
      const c3 = await api(u3, "criar", { nome: "Etapa Um", rosto: ROSTO, categoria: "middleweight", estilo: "striker" }), c4 = await api(u4, "criar", { nome: "Etapa Dois", rosto: ROSTO, categoria: "middleweight", estilo: "counter" });
      await api(u3, "filaEntrar", { lutadorId: c3.id }); await api(u4, "filaEntrar", { lutadorId: c4.id });
      const f = await api(u3, "fila"); await api(u3, "confirmar", { lutaId: f.luta.id }); await api(u4, "confirmar", { lutaId: f.luta.id });
      const lid2 = f.luta.id;
      let m = await abrirComo(u3, `luta/${lid2}`), nos = desde(m);
      if (!nos.some((n) => tem(n, "jxj-posturas")) || nos.some((n) => tem(n, "jxj-acao"))) throw new Error("etapa do sinal: posturas sem ações");
      await api(u3, "sinal", { lutaId: lid2, round: 1, troca: 1, familia: "defesa" }); await api(u4, "sinal", { lutaId: lid2, round: 1, troca: 1, familia: "golpes" });
      m = await abrirComo(u3, `luta/${lid2}`); nos = desde(m);
      const sinais = nos.find((n) => tem(n, "jxj-sinais"));
      if (!sinais || !/Guarda alta/.test(String(sinais.innerHTML)) || !/Peso na frente/.test(String(sinais.innerHTML))) throw new Error("sinais: " + (sinais && sinais.innerHTML));
      const botoes = nos.filter((n) => tem(n, "jxj-acao"));
      if (botoes.filter((b) => /jxj-finta/.test(String(b.innerHTML))).length !== 3) throw new Error("finta nos 3 botões que não são o sinal");
      semLixoV3(htmlDe(nos), "etapa da ação");
    });
```

(`abrirComo(u, rota)` abre a tela com a sessão da conta `u`; se o `jxjtelas` só tem `abrir` pra `u1`, criar o helper com o mesmo corpo trocando o usuário.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node testar.js jxjtelas`
Expected: FAIL ("etapa do sinal: posturas sem ações").

- [ ] **Step 3: Implement** (`index.html`)

Em `jxjDesenharCombate`, quando `v.etapa==="sinal"` e ainda não sinalizou: no lugar dos botões de ação, `.jxj-posturas` com um botão por família com carta (`JXJ_POSTURAS={golpes:"Peso na frente",queda:"Base baixa",defesa:"Guarda alta",pressao:"Avançando"}`, ícone da família, texto da postura e "mostra que vai de Golpes"); o clique chama `ciclo("sinal",{round,troca,familia})`. Já sinalizou: "Você mostrou Guarda alta. Esperando a postura dele." Na etapa `acao`: faixa `.jxj-sinais` ("Você mostrou X · Ele mostrou Y"), e nos botões o `<em class="jxj-finta">−1,5 finta</em>` quando `a.finta>0` (desabilitado se a energia for menor). O relógio usa `v.prazoSinal` na etapa do sinal e `v.prazo` na da ação. `jxjTendencia`: "fintou X de Y" quando `tendencia.sinais>0`. Dica da primeira luta na etapa da ação: "Ele mostrou Y. Pode ser verdade ou finta."

`estilo.css`: `.jxj-posturas` (grade de 2 colunas no celular, 4 no computador), `.jxj-postura`, `.jxj-sinais`, `.jxj-finta`, com as variáveis de cor que existem.

- [ ] **Step 4: Run tests**

Run: `node testar.js jxjtelas` e `node testar.js texto`
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add index.html estilo.css testar.js
git commit -m "Online v4: a tela das etapas do sinal e da ação"
git push
```

---

### Task 7: Medir, calibrar e documentar

- [ ] **Step 1:** `node ferramentas/jxj-balanco.mjs sinais` (honestidade no equilíbrio entre 60% e 75%; ajustar `custoFinta` se precisar); `node testar.js jxjmotor` (faixas da fase 1 continuam).
- [ ] **Step 2:** Bots: `node testar.js jxjbot`; força medida de novo (`personalidades`, 2 sementes) com os sinais; `FORCA_BOT` e `PESOS_VALOR` se mudarem.
- [ ] **Step 3:** LEIA-ME (seção "fase 2: sinais e blefe": regras, decisões de desenho, números, testes), CLAUDE.md (item curto), PENDENCIAS (item 48), spec (as 4 decisões de desenho).
- [ ] **Step 4:** Bateria completa: `node testar.js` → `TUDO CERTO`.
- [ ] **Step 5:** Checklist com duas janelas (`node ferramentas/jogar-online-local.mjs 2`): mandar postura nos dois e ver a revelação ao mesmo tempo; deixar o sinal estourar de um lado (postura padrão); fintar e ver o custo e o lance; tentar fintar sem energia; mandar ação direto na etapa do sinal; recarregar no meio da etapa; luta contra bot (o bot sinaliza e às vezes finta).
- [ ] **Step 6:** Commit e push.
