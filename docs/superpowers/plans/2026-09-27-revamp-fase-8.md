# Revamp, Fase 8 (auditoria): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o revamp: consertar o que ainda quebra a semente com a IA no ar, medir e ligar os eventos de funil que faltam, acabar com as dívidas antigas da carreira, conferir acessibilidade e peso, testar as integrações de verdade e varrer todas as telas em três larguras antes do deploy final.

**Architecture:** Sem arquitetura nova. Cada achado vira teste que reprova antes do conserto (suítes existentes: `desafio`, `save`, `rotas`, `hub`; suíte nova `acessibilidade` se o volume justificar). O que não dá pra testar no Node (teclado virtual, pagamento real, Analytics) é conferido no Chrome ou fica como tarefa do dono em `PENDENCIAS.md`.

**Tech Stack:** o mesmo; puppeteer-core no Chrome local pras varreduras (sempre abortando `/api/ai`); `curl` contra o Supabase com a chave anon (pública) pra conferir RLS.

**Spec:** `docs/superpowers/specs/2026-09-26-revamp-ui-design.md`, seção 12 (Auditoria final).

## Global Constraints

- `node testar.js` completo verde no fim; calibração igual (KO 34 / SUB 19 / DEC 46) e pesos iguais.
- Nenhuma mudança no consumo do `rng` principal fora do conserto do feed (Task 1), que só REMOVE consumo assíncrono que já quebrava a semente em produção.
- Chrome local nunca chama `/api/ai` de produção. Medição contra a API real só depois do deploy (CLAUDE.md).
- Nada de pagamento real, conta criada no Supabase de produção ou e-mail disparado pelos testes.
- Achado fora de escopo vai pro `PENDENCIAS.md`, não é consertado no embalo.

---

### Task 1: Feed da IA não consome o `rng` principal

`resolveFeed(molde, rng)` chama `persona(rng)` pra cada post que a IA devolve, DEPOIS da resposta chegar. Com a IA no ar, a sequência principal depende de quando o feed chega e de quantos posts vieram: link de desafio e save deixam de reproduzir a carreira.

- [x] Teste (falha primeiro): mesma semente, carreira com feed da IA devolvendo 4 posts em momentos diferentes (antes e depois da luta seguinte) contra carreira sem IA; os adversários, resultados e o estado dos geradores têm que ser idênticos.
- [x] Conserto: persona dos posts da IA com gerador próprio, semeado pela semente da carreira + número da luta (nunca o `rng` principal). Molde local continua igual (já é síncrono e determinístico).
- [x] `node testar.js desafio` e `save`.

### Task 2: Eventos de funil que faltam

Existem `abriu`, `terminou_draft`, `terminou_luta_1`, `terminou_luta_5`, `terminou_22`. Faltam `criou_conta`, `confirmou_email`, `continuou_save` (spec, seções 6 e 12).

- [x] Teste (falha primeiro, suíte `rotas` com `window.va` falso): cadastro por e-mail com sucesso manda `criou_conta`; volta do link de confirmação (hash com `type=signup`) manda `confirmou_email` uma vez; retomar carreira (Continuar e recarregar em `#/carreira`) manda `continuou_save`.
- [x] Implementar nos três pontos. Login novo pelo Google conta como `criou_conta` quando a conta tem menos de 2 minutos.
- [x] Chrome: conferir que `window.va` recebe os nomes certos.

### Task 3: Dívidas antigas

- [x] `html{overflow-x:hidden}` (legado.css): medir no Chrome, a 380 px, TODAS as telas sem a regra. Sem transbordo, a regra sai (ela escondia o sintoma do `#controls` antigo). Com transbordo, consertar a causa e só então tirar.
- [x] Teclado virtual cobrindo o botão do dilema (e da coletiva e da entrevista): ao focar o campo, o botão de confirmar rola pra área visível (`visualViewport` quando existir). Teste no Node confere o gancho; o dono confere no celular.

### Task 4: Acessibilidade

- [x] Varredura (teste novo): todo `<button>` ou link só com ícone tem `aria-label`; card clicável é `<button>` (ou tem `tabindex` e tecla); nenhum `onclick` em `div`/`span` sem papel de botão nas telas novas.
- [x] Foco visível: toda classe de botão/card das telas novas tem `:focus-visible` (conferir a lista no CSS; completar o que faltar).
- [x] Consertar o que a varredura achar.

### Task 5: Peso

- [x] Medir: imagens (fundos, variantes `-m`), áudio, fontes, `fighters.json`, e o que baixa ao abrir o menu (Chrome, rede). Fundo e áudio só da tela atual; música só depois do primeiro clique.
- [x] Registrar os números no LEIA-ME; consertar só o que baixar sem precisar.

### Task 6: Integrações

- [x] Supabase, RLS com a chave anon (sem login): `assinaturas`, `saves`, `aceites_termos` não devolvem linha de ninguém; escrita direta em `assinaturas` e na tabela do placar é recusada.
- [x] `api/criar-pagamento.js` e `api/webhook-asaas.js` em produção: sem token recusam (401), sem gastar nada. Ativação Pro de ponta a ponta com pagamento real fica como tarefa do dono.
- [x] Depois do deploy: poucas chamadas a `/api/ai` de produção por kind grátis (feed, dilema, julgar, evento), conferindo JSON válido e texto sem travessão com a regra nova no ar.

### Task 7: Varredura das telas

- [x] Chrome em 1440, 820 e 380 px: menu, atualizações, ranking, conta (sem login), créditos, termos, privacidade, 404, portão, os 5 passos da nova carreira, as abas do hub, cada etapa da noite, pós-luta e fim de carreira. Sem erro de página, sem transbordo horizontal; folha de contato pra olhar.
- [x] Consertar o que aparecer; o que for fora de escopo vai pro PENDENCIAS.

### Task 8: Fechamento

- [x] Atualizações: a entrada de 27/09 descreve o que vai pro ar (texto revisado, Pro reconhecido ao entrar).
- [x] Docs (LEIA-ME, PENDENCIAS item 37, CLAUDE.md), `node testar.js` completo, commit + push.
- [x] Checkpoint com o dono; deploy (merge no `master`, push, `vercel --prod`, `curl -I` nos privados) só com o ok dele.
