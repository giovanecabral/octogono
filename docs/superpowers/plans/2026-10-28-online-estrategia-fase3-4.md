# Online com estratégia: Fases 3 (iniciativa) e 4 (a ficha muda a luta)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fase 3: quem vence a troca fica com a iniciativa (finta pela metade do custo) e o momento sai do motor v4. Fase 4: cada estilo começa o round com uma mão própria (uma carta trocada da mão padrão), com números medidos. Depois disso, as 4 fases estão prontas pro SQL do dono e pro deploy.

**Architecture:** As duas fases mexem só no estado da luta (`jxj_lutas.estado`), sem migração nova: `estado.iniciativa` ("a", "b" ou null) e a mão cheia de cada lado tirada do estilo do perfil (`perfil.estilo`). Os números ficam em `api/_jxj-estrategia.js` (`fatorFintaIniciativa`, `maoPorEstilo`). O motor v4 ainda não foi pro ar, então muda sem subir `VERSAO_MOTOR` (nenhuma luta v4 existe em produção). O servidor passa o custo da finta já com a iniciativa (`acoes[].finta`, checagem de energia); o bot usa o mesmo custo; a tela troca o trilho do momento por uma ficha "Iniciativa".

**Tech Stack:** Node (ES modules) nas funções da Vercel, Postgres no Supabase (PGlite nos testes), `index.html`, `estilo.css`, `testar.js`, `ferramentas/jxj-balanco.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-27-online-estrategia-design.md` (seções 8, 9 e 10)

## Global Constraints

- Iniciativa: quem leva mais pontos de juiz numa troca fica com ela pra troca seguinte; troca empatada não muda nada; uma ficha só; some no fim do round.
- Efeito: finta pela metade (`fatorFintaIniciativa` 0,5).
- O momento (a barra de -4 a 4 e o ajuste de disputa dele) sai do motor v4 e da tela; luta v3 segue igual.
- Ficha: cada estilo troca uma carta da mão padrão (2 Golpes, 2 Quedas, 4 Defesas, 1 Pressão); números saem da medição.
- Metas (spec 10): estilos de 45% a 57% no nível 1 e de 40% a 60% no nível 30; nocaute, finalização, decisão e empate nas faixas da `jxjmotor`; trocas óbvias até 15%; sinal honesto de 60% a 75% no equilíbrio; bot contra o jogador de estilo nas faixas da `jxjbot`; luta até 5 minutos.
- Sem migração nova: o `supabase_jxj_estrategia.sql` das fases 1 e 2 continua sendo o único SQL do dono.
- Servidor decide tudo; a luta é refeita pela semente; o bot escolhe sem ver a ação do jogador; texto sem travessão, frase de efeito nem emoji; ícone só do sprite; deploy só com "deploya".
- Não mexer no jeito do Paciente (PENDENCIAS 47).

## Decisões de desenho (tomadas por mim, o dono mandou seguir até o SQL)

1. **Quem venceu a troca** = a diferença de pontos de juiz que a troca deu (`pontos[round]` depois menos antes), com folga de 0,01. Pontos de ausência contam (quem faltou perde a troca).
2. **A iniciativa vale na troca seguinte**: o custo da finta desta troca usa a iniciativa de antes dela.
3. **O momento sai, os pontos do lance ficam.** `moverMomento` no v4 não mexe na barra nem no ajuste de disputa, mas os juízes continuam dando `bonusMomento` pra quem ganhou o lance (sem isso, sair da grade ou levantar valeria zero e a troca empataria).
4. **Os dois nós do momento passam a falar da iniciativa e da finta** (no v4): `retencaoMomento` (nó "Manutenção de iniciativa") vira chance de ficar com a iniciativa mesmo perdendo a troca; `ritmo` (nó "Controle de ritmo") vira fração a menos no custo da finta. Luta v3 segue com o efeito antigo.
5. **O bot com a iniciativa blefa mais**: a chance de isca é dividida pelo fator do custo (com a iniciativa, dobra; até 1). O jogador modelo da ferramenta faz o mesmo.
6. **Mão por estilo, ponto de partida** (mão padrão de 9 cartas, uma carta trocada): striker 3/2/3/1 (Defesa vira Golpe), wrestler 2/3/3/1 (Defesa vira Queda), grappler 1/3/4/1 (Golpe vira Queda), counter 2/2/5/0 (Pressão vira Defesa) com bônus pequeno ao defender e ler. Medir; se o counter sem Pressão prender demais, o counter fica com a Pressão e troca outra carta (spec 9).
7. **`FORCA_BOT` e `PESOS_VALOR` medidos uma vez, no fim da Fase 4** (as duas fases vão pro ar juntas).

## Review Focus

1. Custo da finta com a iniciativa: a tela, a checagem do servidor e a cobrança do motor usam o mesmo número. Teste na Task 2 (servidor recusa finta sem energia pelo custo cheio e aceita pelo custo com a iniciativa).
2. Iniciativa vazando pro round seguinte ou sobrevivendo ao fim da luta. Teste na Task 1.
3. Luta v3 (sem mão) com o momento de antes, bit a bit. Teste na Task 1.
4. Mão por estilo na vista (`maoCheia` de cada lado) e na volta do round. Teste nas Tasks 5 e 6.
5. Tela de luta v3 continua com o trilho do momento; v4 mostra a iniciativa e nunca "undefined". Teste na Task 3.

---

### Task 1: Motor: iniciativa e saída do momento (v4)

**Files:** `api/_jxj-estrategia.js`, `api/_jxj-motor.js`, `api/_jxj-arvores.js` (texto dos 2 nós e das 2 mecânicas), `testar.js` (`jxjmotor`).

**Produces:**
- `ESTRATEGIA.fatorFintaIniciativa` (0.5); `custoFintaDe(estado, lado, perfil)`: `custoFinta × (iniciativa do lado ? fator : 1) × (1 − mec.ritmo no v4)`, arredondado a 2 casas.
- `estado.iniciativa` ("a" | "b" | null) em `novaLuta` (v4); evento `{tipo: "iniciativa", quem}` quando muda de dono (sem texto); `fecharRound` zera.
- v4: `ajuste` sem momento; `moverMomento` só pontua; o decaimento do momento não roda; `retencaoMomento` segura a iniciativa de quem perdeu a troca com essa chance (evento `{tipo: "iniciativa", quem, segurou: true}`).

- [ ] Step 1: testes que falham (`jxjmotor`): "iniciativa (v4, fase 3)": quem pontua mais na troca fica com ela; empate não muda; some no fim do round e na troca 1 do round seguinte é null; finta com a iniciativa custa `custoFinta × 0,5`; `ritmo` barateia a finta; `retencaoMomento` segura às vezes; luta v3 (sem mão) resolve igual a antes (momento mexe, sem `iniciativa`). "momento fora do v4": em 300 lutas v4 o momento fica 0.
- [ ] Step 2: rodar `node testar.js jxjmotor`, ver falhar.
- [ ] Step 3: implementar.
- [ ] Step 4: `node testar.js jxjmotor` verde (faixas de balanço incluídas; se sair da faixa, medir e decidir na Task 4).
- [ ] Step 5: commit.

### Task 2: Servidor e bot com a iniciativa

**Files:** `api/jxj.js`, `api/_jxj-bot.js`, `ferramentas/jxj-balanco.mjs` (`comSinal`, `lutaContraBot`), `testar.js` (`jxj`, `jxjbot`).

- `vistaDaLuta`: `estado.iniciativa`; `acoes[].finta` = `custoFintaDe(estado, lado, meuPerfil)` (0 na postura própria, null antes da revelação).
- `case "acao"`: finta sem energia pelo custo com a iniciativa.
- Bot: `planoDoSinal` divide a chance de isca pelo fator do custo (até 1); checagem de energia da finta pelo `custoFintaDe`.
- Ferramenta: `comSinal` e o jogador modelo de `lutaContraBot` fazem o mesmo.

- [ ] Step 1: testes que falham: `jxj` "finta com a iniciativa custa metade (vista e recusa pelo custo certo)"; `jxjbot` "com a iniciativa o bot blefa mais e só finta com energia pelo custo dele".
- [ ] Step 2: ver falhar. Step 3: implementar. Step 4: `node testar.js jxj` e `node testar.js jxjbot` (a calibração pode sair da faixa: fica pra Task 8). Step 5: commit.

### Task 3: Tela da iniciativa

**Files:** `index.html` (`jxjDesenharCombate`), `estilo.css`, `testar.js` (`jxjtelas`).

- Luta v4: sai o trilho do momento; entra `<span class="jxj-iniciativa eu|ele">Iniciativa: você|ele</span>` (com `title` "Quem venceu a última troca. Com ela, a finta custa metade."); sem dono, nada.
- Primeira luta da conta: na etapa da ação, com a iniciativa, dica curta "Com a iniciativa, a finta custa metade.".
- Luta v3: trilho do momento como antes.

- [ ] Step 1: teste que falha (`jxjtelas`): "iniciativa na tela (fase 3)". Step 2: ver falhar. Step 3: implementar. Step 4: `node testar.js jxjtelas`, `node testar.js texto`, `node testar.js rotas`. Step 5: commit.

### Task 4: Medição e documentação da Fase 3

- `node ferramentas/jxj-balanco.mjs matriz|niveis|sinais|mao` e um comando novo `iniciativa` (quantas trocas mudam a iniciativa, a taxa de finta de quem tem e de quem não tem, e o valor dos 2 nós com sinais).
- Faixas da `jxjmotor` e `jxjarvore` verdes; o que sair, decidir e anotar.
- LEIA-ME (seção da fase 3), CLAUDE.md, PENDENCIAS 48, spec (decisões da fase 3). Commit.

### Task 5: Mão por estilo (motor, servidor, definições)

**Files:** `api/_jxj-estrategia.js` (`maoPorEstilo`, `maoCheia(estilo)`), `api/_jxj-motor.js` (`novaLuta`, `fecharRound`, bônus do counter), `api/jxj.js` (vista `maoCheia` por lado, `definicoes` com `estilos[id].mao`), `testar.js`.

- [ ] Step 1: testes que falham (`jxjmotor`): "mão por estilo (fase 4)": `maoCheia(estilo)` de cada estilo soma a mão padrão com uma carta trocada; `novaLuta` e a volta do round usam a do estilo de cada lado; estilo desconhecido ou ausente fica com a padrão. `jxj`: a vista manda `maoCheia` do estilo de cada lado; `definicoes` manda a mão de cada estilo.
- [ ] Step 2 a 5 como sempre.

### Task 6: Medição da Fase 4 e ajuste dos números

- `matriz`, `niveis`, `mao` (trocas óbvias, valor de contar), métodos, e um comando novo `presos` (trocas por baixo sem Pressão, por estilo).
- Ajustar `maoPorEstilo` (e o bônus do counter) até as faixas; anotar cada medição.
- Commit com os números.

### Task 7: Tela da ficha

**Files:** `index.html` (passo do estilo na criação e a ficha do lutador), `estilo.css`, `testar.js` (`jxjtelas`).

- No cartão de cada estilo: "Mão por round: 3 Golpes, 2 Quedas, 3 Defesas, 1 Pressão" (dos `definicoes`).
- [ ] teste que falha, implementar, `jxjtelas`, `texto`, commit.

### Task 8: Bots, documentação e bateria

- `PESOS_VALOR` (copiar do treino), `FORCA_BOT` (`personalidades`, caminho do servidor com sinais), calibração da `jxjbot`.
- LEIA-ME, CLAUDE.md, PENDENCIAS 48 (as 4 fases prontas, passo do dono), spec (decisões da fase 4), memória.
- `node testar.js` completo verde; checklist de duas janelas (iniciativa na tela, finta com a iniciativa, mão do estilo).
- Commit e push na branch (nunca no `master`).
