# Online: dano, cena do fim, tabela do ciclo e abandono contra bot

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A barra de vida desce com animação e som a cada golpe, o nocaute e a finalização ganham uma cena antes do resultado, a tela mostra quem ganha de quem, e a luta contra bot pode ser abandonada (derrota por W.O.).

**Architecture:** Servidor: as definições mandam o ciclo (`acoes.vence`) e a `frase` de cada variante; ação nova `abandonar` grava o W.O. pela `jxj_gravar_troca` (sem SQL). Tela: `jxjVida` (escala 2,5), `jxjCiclo` (tabela), `jxjAnimarDano` (a troca resolvida), `jxjCenaFim` (nocaute, finalização, decisão) e o fluxo em `jxjTelaLuta` que guarda a vista anterior pra mostrar a troca final antes do resultado.

**Tech Stack:** `api/jxj.js`, `api/_jxj-motor.js`, `index.html`, `estilo.css`, `testar.js` (`jxj`, `jxjtelas`), puppeteer local.

**Spec:** `docs/superpowers/specs/2026-10-29-online-dano-nocaute-design.md`

## Global Constraints

- Motor, números, regras, bot e rating não mudam; `VERSAO_MOTOR` e `VERSAO_BALANCEAMENTO` ficam.
- Nenhum SQL novo; o abandono usa `jxj_gravar_troca`.
- `JXJ_ESCALA_VIDA = 2.5`; piso 4 enquanto a luta não acabou em nocaute.
- Texto sem travessão nem frase de efeito; ícone só do sprite (`ICONE`); nada de emoji.
- Nome de outro jogador sempre por `jxjEsc`.
- Classes que os testes usam continuam (`jxj-acao`, `jxj-postura`, `jxj-mesa-lado`, `jxj-vaga-*`, `jxj-card-eu/ele`).
- Execução inline, sem subagentes (pedido do dono). Deploy autorizado pelo dono depois da bateria verde.

## Review Focus

1. Redesenho no meio da animação (a consulta traz a postura nova dele): a barra fica no valor final, sem animar de novo. Teste na Task 3.
2. Várias trocas novas de uma vez (a aba ficou parada): só a última anima, a barra parte do valor da penúltima. Teste na Task 3.
3. Abrir uma luta já encerrada (recarregar no fim): resultado direto, sem cena. Teste na Task 4.
4. Abandonar enquanto a troca resolve: um fim só, o segundo pedido não muda nada. Teste na Task 1.
5. Luta v3 (sem mão) e treino: a tabela e a barra nova não quebram. Teste na Task 2 e 3.

---

### Task 1: Servidor: ciclo e frase nas definições, ação `abandonar`

**Files:** `api/_jxj-motor.js` (exportar `VENCE_LISTA`, texto do evento `abandono`), `api/jxj.js` (definições, `ACOES_CONTA`, `LIMITES`, `case "abandonar"`), `testar.js` (suíte `jxj`, seção dos bots).

**Interfaces:**
- Produces: `JXJ_DEF.acoes.vence = {pe: ["golpes>pressao", ...], cima: [...], baixo: [...]}`; `JXJ_DEF.acoes.variantes[id].frase`; ação `abandonar {lutaId}` → vista; `resultado.abandono === true`; evento `{tipo: "abandono", quem: "a"}`.

- [ ] Step 1: testes na `jxj` (depois do teste "o jogador ausente 3 trocas seguidas perde por W.O. contra o bot"):

```js
    await conf("abandonar (2026-10-29): contra bot, derrota por W.O. na hora (rating como derrota, XP 0, fichas 0, wos + 1, resultado com abandono); o segundo pedido não muda nada; contra gente, 400; quem não está na luta, 404", async () => {
      await zerarLimites();
      const u = await novoUsuario({ pro: true }), l = (await criar(u)).id;
      const lid = await botDoPro(u, l);
      const antes = (await q("select rating, xp, derrotas, wos from jxj_lutadores where id = $1", [l]))[0];
      const outro = await novoUsuario({ pro: true });
      await erro(outro, "abandonar", { lutaId: lid }, /não encontrada/, 404);
      const v = await ok(u, "abandonar", { lutaId: lid });
      if (v.status !== "encerrada" || !v.resultado || v.resultado.metodo !== "WO" || v.resultado.vencedor !== "b" || v.resultado.abandono !== true) throw new Error("vista: " + JSON.stringify([v.status, v.resultado]));
      const ef = v.efeitos && v.efeitos.a;
      if (!ef || ef.resultado !== "derrota" || ef.xp !== 0 || ef.fichas !== 0) throw new Error("efeitos: " + JSON.stringify(ef));
      const depois = (await q("select rating, xp, derrotas, wos from jxj_lutadores where id = $1", [l]))[0];
      if (depois.derrotas !== antes.derrotas + 1 || depois.wos !== antes.wos + 1 || depois.xp !== antes.xp || !(depois.rating < antes.rating)) throw new Error("lutador: " + JSON.stringify([antes, depois]));
      const t = await q("select acao_a, acao_b, eventos from jxj_trocas where luta_id = $1 order by round desc, troca desc limit 1", [lid]);
      if (!t[0].eventos.some((e) => e.tipo === "abandono" && e.quem === "a")) throw new Error("sem o evento do abandono");
      const v2 = await ok(u, "abandonar", { lutaId: lid });
      const depois2 = (await q("select derrotas from jxj_lutadores where id = $1", [l]))[0];
      if (v2.status !== "encerrada" || depois2.derrotas !== depois.derrotas) throw new Error("o segundo pedido mudou algo");
      if (!v2.trocas.some((x) => (x.eventos || []).some((s) => /abandonou a luta/.test(s)))) throw new Error("texto do abandono no registro");
      const u1 = await novoUsuario({ pro: true }), u2 = await novoUsuario({ pro: true });
      const lg = await parear(u1, (await criar(u1)).id, u2, (await criar(u2)).id);
      await erro(u1, "abandonar", { lutaId: lg }, /só existe na luta contra bot/);
      if ((await ok(u1, "luta", { lutaId: lg })).status !== "andamento") throw new Error("a luta entre gente mudou");
    });
    await conf("definições (2026-10-29): acoes.vence igual ao ciclo do motor nos três papéis e a frase de cada variante", async () => {
      const d = await ok(null, "definicoes");
      for (const p of ["pe", "cima", "baixo"]) {
        const motor = [...MOTOR.VENCE_LISTA[p]].sort().join(","), tela = [...(d.acoes.vence[p] || [])].sort().join(",");
        if (motor !== tela || !tela) throw new Error(`vence.${p}: ${tela} x ${motor}`);
      }
      for (const [id, x] of Object.entries(d.acoes.variantes)) if (x.frase !== MOTOR.VARIANTE_POR_ID[id].frase) throw new Error("frase de " + id);
    });
```

(`ok(null, "definicoes")`: se o helper `api` exigir conta, usar `B.chamar(H, {acao: "definicoes"})`.)

- [ ] Step 2: `node testar.js jxj` com `JXJ_SO="abandonar|definições (2026-10-29)"`: reprova (ação desconhecida; `vence` ausente).
- [ ] Step 3: implementar:
  - `api/_jxj-motor.js`, depois de `VENCE`: `export const VENCE_LISTA = Object.fromEntries(Object.entries(VENCE).map(([p, s]) => [p, [...s]]));` e, em `textoEvento`, `case "abandono": return \`${q} abandonou a luta.\`;`.
  - `api/jxj.js`: `"abandonar"` em `ACOES_CONTA`; `abandonar: [20, 600]` em `LIMITES`; em `acoes` das definições `vence: MOTOR.VENCE_LISTA` e `frase: v.frase` nas variantes; o case:

```js
    case "abandonar": {
      /* 2026-10-29, pedido do dono: só contra bot. Derrota por W.O. na hora,
         gravada como o W.O. por ausência (jxj_gravar_troca, sem SQL novo).
         A troca andou no meio: lê de novo; a luta acabou: vale o fim gravado. */
      const lid = idDe(c.lutaId, "luta");
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        const d = await processarLuta(lid, uid), L = d.luta;
        if (!L.bot) throw new ErroJxJ("Abandonar só existe na luta contra bot.");
        if (L.status !== "andamento" || L.a_user !== uid) return vistaDaLuta(d, uid);
        const fim = { vencedor: "b", metodo: "WO", round: L.round, troca: L.troca, abandono: true };
        const estado = { ...L.estado, fim };
        const eventos = [{ tipo: "abandono", quem: "a" }, { tipo: "fim", quem: "b", metodo: "WO", abandono: true }];
        const r = await rpc("jxj_gravar_troca", { lid, versao_: L.versao, round_: L.round, troca_: L.troca, acao_a_: null, acao_b_: null,
          eventos_: eventos, estado_: estado, prazo_ms: MOTOR.FORMATO.prazoMs, fim_: fim, efeitos_: efeitosDoFim(d, estado, fim) });
        if (r && r.gravou) return vistaDaLuta(await processarLuta(lid, uid), uid);
      }
      throw new ErroJxJ("A luta mudou no meio. Tente de novo.", 409);
    }
```
- [ ] Step 4: os dois testes passam; `node testar.js jxj` inteiro verde.
- [ ] Step 5: commit e push na branch.

### Task 2: Tela: a tabela do ciclo

**Files:** `index.html` (`jxjCiclo`, chamada na mesa), `estilo.css` (`.jxj-ciclo`), `testar.js` (`jxjtelas`).

**Interfaces:**
- Consumes: `JXJ_DEF.acoes.vence`, `JXJ_DEF.acoes.familias`, `v.papel`, `JXJ_ICONE_ACAO`, `JXJ_FAMILIAS`.
- Produces: `jxjCiclo(papel, destaque)` → elemento `aside.jxj-ciclo` com uma `.jxj-ciclo-linha` por família (atributo `data-f`), cada uma com o chip da carta e os chips das que ela vence (`data-vs`).

- [ ] Step 1: teste `jxjtelas`: para `pe`, `cima` e `baixo`, `vm.runInContext("jxjCiclo('cima','queda')")` dá 4 linhas; a linha de cada família tem como `data-vs` exatamente as famílias `h` com `"f>h"` em `vence[papel]`, nomes do papel dele; a linha `queda` com a classe `agora`; `JXJ_TREINO_VENCE` igual a `vence.pe`; na luta aberta (`abrir("luta/...")`), um `.jxj-ciclo` na tela; luta v3 (sem `maos`) sem tabela e sem erro; sem `undefined`/emoji/travessão.
- [ ] Step 2: ver reprovar (`jxjCiclo is not defined`).
- [ ] Step 3: implementar:

```js
/* Quem ganha de quem (2026-10-29, pedido do dono): uma linha por carta sua,
   no papel atual, com as cartas dele que ela vence (o ciclo vem das
   definições, tirado do motor). destaque: a família que você jogou. */
function jxjCiclo(papel,destaque){
  const vence=(JXJ_DEF.acoes.vence||{})[papel]||[],dele=papel==="cima"?"baixo":papel==="baixo"?"cima":"pe";
  const nomes=JXJ_DEF.acoes.familias||{};
  const chip=(f,p)=>`<span class="jxj-ciclo-chip corte-p f-${f}">${ICONE(JXJ_ICONE_ACAO[f]||"luta")}${(nomes[p]||{})[f]||f}</span>`;
  const titulo={pe:"Em pé",cima:"Você por cima",baixo:"Você por baixo"}[papel]||"";
  const a=el("aside","jxj-ciclo");
  a.innerHTML=`<p class="jxj-ciclo-titulo"><b>Quem ganha de quem</b><small>${titulo}</small></p>`+JXJ_FAMILIAS.map(f=>{
    const vs=JXJ_FAMILIAS.filter(h=>vence.includes(`${f}>${h}`));
    return `<p class="jxj-ciclo-linha${destaque===f?" agora":""}" data-f="${f}" data-vs="${vs.join(",")}">${chip(f,papel)}<span class="jxj-ciclo-vence"><i>ganha de</i>${vs.length?vs.map(h=>chip(h,dele)).join(""):"<i>ninguém</i>"}</span></p>`;
  }).join("");
  return a;
}
```
  Em `jxjDesenharCombate`, a mesa vira `section.jxj-mesa-area` com a mesa e `jxjCiclo(v.papel||"pe", destaque)` (destaque: a família que eu joguei na troca revelada, se houver `revelar`). CSS: computador, grade `1fr 250px`; até 720 px, a tabela antes da mesa e as linhas em duas colunas (as cores dos chips são as das cartas, `.f-golpes` etc.).
- [ ] Step 4: passa; `jxjtelas` inteira verde (a mesa nos testes antigos é achada por `.jxj-mesa-lado`, que não muda).
- [ ] Step 5: commit e push.

### Task 3: Tela: a barra nova e o dano de cada troca

**Files:** `index.html` (`JXJ_ESCALA_VIDA`, `jxjVida`, HUD, `jxjAnimarDano`, `jxjEfeitos`, `jxjRevelar` sem o número na carta, `jxjTelaLuta`), `estilo.css`, `testar.js`.

**Interfaces:**
- Produces: `jxjVida(dano, nocaute=false)` → inteiro 0 a 100; opção `danoAntes:{a,b}` em `jxjDesenharCombate` (desenha a barra com o dano de antes); `jxjAnimarDano(troca, {eu, ele}, danoAntes, danoDepois, tk, {nocaute})` → agenda a animação (barra, retrato, número, faixa, som) e devolve quanto tempo ela dura em ms.
- Consumes: `JXJ_DEF.acoes.variantes[id].rotulo`.

- [ ] Step 1: testes `jxjtelas`:
  - `jxjVida`: `jxjVida(0)` 100, `jxjVida(10)` 75, `jxjVida(4.8)` 88, `jxjVida(60)` 4 (piso), `jxjVida(60, true)` 0, `jxjVida(11, true)` 0.
  - a barra do HUD (`.jxj-vida .atual`) com `width:75%` pra dano 10; o número 75.
  - troca nova pela tela: `danoAntes` da vista anterior; logo depois do desenho a barra de quem apanhou está no valor de antes; depois de `env.drenar()` (os timers da animação), no valor de depois; a faixa `.jxj-golpe-tag` com o rótulo da variante do evento; um redesenho depois disso (assinatura nova) desenha o valor final sem `.jxj-golpe-tag`;
  - duas trocas novas de uma vez: a barra parte do valor depois da penúltima.
- [ ] Step 2: ver reprovar.
- [ ] Step 3: implementar:
  - `const JXJ_ESCALA_VIDA=2.5; function jxjVida(dano,nocaute=false){ if(nocaute)return 0; return Math.max(4,Math.min(100,Math.round(100-(Number(dano)||0)*JXJ_ESCALA_VIDA))); }`
  - HUD: `<span class="jxj-vida" data-nivel="..."><i class="rastro"></i><i class="flash"></i><i class="atual"></i></span>` com a largura de `jxjVida(danoAntes?danoAntes[l]:st.dano)`; o número `<b class="jxj-vida-num">`.
  - `jxjAnimarDano`: depois de `JXJ_VIRA_MS` (900), cada evento com `dano` da troca, a cada 450 ms: a barra de quem apanhou (`atual` na hora, `flash` no pedaço, `rastro` 520 ms depois), o número conta, `−N` (`.jxj-pop-vida`) sobe de dentro da barra, `.jxj-golpe-tag` "entrou <rótulo> −N" em cima da carta dele na mesa, `SOM.golpePesado()` com dano ≥ 6,5 senão `SOM.golpeLeve()`, retrato `.jxj-apanhou` e, no pesado, `.jxj-tremor` na tela. Knockdown: `.jxj-clarao`, `.jxj-tremor-forte`, retrato `.jxj-caiu`, selo `KNOCKDOWN`, `SOM.knockdown()`. Cada passo confere `tk===JXJ_TOKEN` e o id do desenho (`JXJ_ANIM_ID`): redesenho no meio cancela.
  - `jxjEfeitos`: os eventos de dano e o knockdown saem dele (vão pra `jxjAnimarDano`); o resto fica (queda, encaixe, sino, grogue, escapou, bloqueou).
  - `jxjRevelar`: sai o `.jxj-pop dano` da carta (a faixa ocupa o lugar).
  - `jxjTelaLuta`: guarda `vistaAntes` (a última vista em andamento já desenhada); com troca nova, `danoAntes` = dano da vista antes da última troca nova (`vistaAntes.estado`, ou o dano depois da penúltima quando chegaram várias: soma dos `dano` dos eventos da última troca tirada do dano final, por lado); só o primeiro desenho da troca anima (`revelacao.animou`).
  - CSS: barra 14 px (12 no celular) com marcas de 10 em 10, níveis `meio` (≤ 50) e `critico` (≤ 25, pulsando), rastro, flash; faixa, número, tremores, clarão, selo. Tudo parado com `prefers-reduced-motion`.
- [ ] Step 4: passa; `jxjtelas` e `texto` verdes.
- [ ] Step 5: commit e push.

### Task 4: Tela: a cena do fim

**Files:** `index.html` (`jxjCenaFim`, `jxjTelaLuta`), `estilo.css`, `testar.js`.

**Interfaces:**
- Consumes: `jxjAnimarDano`, `jxjVida`, a vista final (`resultado`, `trocas`, `estado`), a última vista em andamento.
- Produces: `jxjCenaFim(area, vista, {eu, ele}, aoSeguir, {espera})` → `div.jxj-fim` com `.jxj-fim-palavra`, `.jxj-fim-faixa`, `.jxj-fim-quem`, `.jxj-fim-narra` e o botão "Ver o resultado".

- [ ] Step 1: testes `jxjtelas`: luta contra bot levada até a troca final com a tela aberta (forçar o nocaute: `update jxj_lutas set estado = jsonb_set(estado, '{b,dano}', '95')` e jogar golpes até acabar, ou montar a vista final pelo banco); depois do fim, a tela tem `.jxj-mesa` (a troca final) e `.jxj-fim` com "NOCAUTE" (ou "FINALIZAÇÃO"/"DECISÃO", conforme o método), o nome de quem venceu, a narração e "Ver o resultado"; clicar abre `.jxj-resultado`; luta já encerrada aberta de novo: `.jxj-resultado` direto, sem `.jxj-fim`; W.O.: direto pro resultado. Função pura: `jxjCenaFim` com vistas montadas à mão pra KO, TKO, FIN, DEC e EMPATE (palavra, faixa, frase da variante "venceu com o cruzado", narração da troca ou o texto do evento do fim).
- [ ] Step 2: ver reprovar.
- [ ] Step 3: implementar `jxjCenaFim` (véu, raios, palavra letra por letra, faixa "Round 2 · troca 3", "Fulano venceu com o cruzado" pela `frase`, a narração digitada; KO/TKO: clarão, tremor forte, fagulhas no retrato de quem caiu, retrato `.jxj-apagou`, a barra até 0 em 0,95 s, `SOM.nocaute()`; FIN: retrato `.jxj-apertado` 3 vezes com `SOM.golpeLeve()` em cada, depois `SOM.finalizacao()`; DEC/EMPATE: `SOM.sinoFim()`, sem raios nem clarão), e o fluxo: em `desenhar`, `acabouAgora && vistaAntes && !["WO","ANULADA"].includes(metodo)` desenha o combate com a vista de antes, o estado final, `revelar` da troca final e sem a mão, anima o dano (`nocaute` pra KO/TKO), e depois de `jxjAnimarDano` mostra a cena; "Ver o resultado" desenha `jxjDesenharResultado` com a vinheta. Com menos movimento, tudo parado e o texto inteiro.
- [ ] Step 4: passa; `jxjtelas`, `texto` e `rotas` verdes.
- [ ] Step 5: commit e push.

### Task 5: Tela: abandonar contra bot

**Files:** `index.html` (botão no centro do placar, confirmação, resultado), `estilo.css`, `testar.js`.

- [ ] Step 1: testes `jxjtelas`: na luta contra bot, botão "Abandonar" (`.jxj-abandonar`); entre duas contas, nenhum; tocar abre `.jxj-confirma` sem chamar o servidor (fetch contado); "Voltar pra luta" fecha; "Abandonar" chama `abandonar` uma vez (clique duplo também), a tela mostra `.jxj-resultado` com "Você abandonou a luta." e sem `.jxj-fim`.
- [ ] Step 2: ver reprovar.
- [ ] Step 3: implementar: `jxjDesenharCombate` recebe `abandonar` nas opções (só `jxjTelaLuta` passa, só quando `nomes[ele].bot` e `v.lado`); o botão embaixo do round; a confirmação dentro de `.jxj-combate` ("Abandonar a luta?", "Você perde por W.O. O rating cai como numa derrota, e a luta não dá XP nem fichas.", "Abandonar", "Voltar pra luta"); confirmado, `ciclo("abandonar")`; no resultado, `r.abandono` troca o método por "Você abandonou a luta." (ou "Ele abandonou a luta." pro outro lado, que contra bot não existe, mas o texto fica certo).
- [ ] Step 4: passa.
- [ ] Step 5: commit e push.

### Task 6: Checklist, documentação, bateria e deploy

- Checklist no Chrome local (computador e celular, contra bot): golpe, knockdown, nocaute, finalização, decisão, abandono, a tabela no chão; prints; sem erro de página.
- LEIA-ME (seção nova), CLAUDE.md (parágrafo), PENDENCIAS.
- `node testar.js` completo em segundo plano.
- Verde: merge `--ff-only` na `master`, push, `vercel --prod --scope giovanecpiresg-4823s-projects --yes`, conferir o `index.html` servido contra o git, `definicoes` com `vence`, e 404 nos arquivos fora do deploy.
