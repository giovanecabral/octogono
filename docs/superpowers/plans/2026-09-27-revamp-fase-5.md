# Revamp, Fase 5 (hub da carreira, noite de luta, fim de carreira): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tela da carreira deixa de ser a página antiga de texto e vira um hub com barra fixa, 7 abas com fundo próprio e uma "noite de luta" em tela cheia (oferta, camp, coletiva, entrada, luta, resultado, pós-luta). O fim de carreira e os cards em imagem ganham a identidade nova.

**Architecture:** A lógica do jogo continua achando tudo por id (`#next`, `#autob`, `#escolha`, `#stage`, `#live`, `#play`, `#rdlabel`, `#escolhaLuta`, `#bouts`, `#ficha`, `#phone`, `#painelTreinador`, `#painelMomentos`, `#painelConquistas`, `#painelAposentar`, `#controls`, `#counter`, `#speedb`, `#btnAposentar`, `#colresp/#colgo/#colpular`, `#dilresp/#dilgo`, `#entresp/#entgo/#entcontinuar`). O que muda é ONDE cada id mora: `montarTelaCarreira()` monta a casca nova e põe cada container na aba ou etapa certa. A noite de luta é uma camada (`#noite`) que só troca de etapa quando o estado do jogo já mudou (`nextFight`, `telaCamp`, `telaColetiva`, `iniciarTelaLuta`, `finishFight`); ela não decide nada. O conteúdo do pós-luta (evento, raro, dilema, entrevista) nasce num embrulho por luta dentro de `#posluta` e é arquivado em `#bouts` (Cartel) quando a noite fecha ou a próxima começa.

**Tech Stack:** o mesmo (HTML único, `estilo.css`, `testar.js` com DOM falso).

**Spec:** `docs/superpowers/specs/2026-09-26-revamp-ui-design.md`, seção 9 (Hub da carreira), seção 7 (Save: pontos de save, oferta e dilema salvos com o conteúdo) e seção 14 (Testes).

## Global Constraints

- Tudo das fases anteriores continua valendo: nenhum travessão em texto NOVO de interface, ícone só SVG do sprite, classe conferida por token nos testes, `assert` em toda substituição, commit + push juntos, nenhum `vercel --prod` a partir da branch.
- **Mecânica intocada.** Nenhuma mudança na ordem de consumo de `rng` e dos outros 7 geradores. `node testar.js desafio`, `pesos`, `interface` (4 divisões + lenda), `narracao`, `save` verdes com os mesmos números.
- **Ids da lógica continuam existindo** (lista acima). Estrutura que os testes leem continua: `#painelTreinador > box > .loja-item`, linhas `.bout` como filhos DIRETOS de `#bouts`, fragmentos da ficha que os testes procuram (`Campeão: <b>NOME</b>`, `>Interino<`, `lesao-mag">Rótulo -N%`, `style="font-weight:800">Rótulo<`, `class="g">+N%`, `class="dn">-N%`, `<h4>Lesão</h4>`, `#N</span> <span class="de">de N`).
- **Save compatível:** campos novos no registro (`seg`, `fa`, `narracao`) são opcionais; save da versão 1 sem eles continua abrindo. `VERSAO_SAVE` fica 1 (mudança só aditiva; subir a versão marcaria como incompatível todo save existente sem motivo).
- **Voltar na noite de luta só antes da luta começar.** Voltar nunca sorteia de novo: a oferta fica guardada (`ofertaAtual`) e é redesenhada, não recalculada.
- Recurso Pro travado pelo componente único `bloqueioPro()`: Coletiva (Provocar; "Pular" fica FORA do bloqueio), Entrevista.

## Mapa de fundos

Painel `arena` · Lutador `vestiario` · Cartel `tunel` · Mídia `imprensa` · Loja `academia` · Cards `fotos` · Conquistas `trofeus` · Oferta `contrato` · Camp `saco` · Coletiva `imprensa` · Entrada `entrada` · Luta `octogono-luz` · Resultado `confete` (vitória) ou `apagado` (derrota) · Fim de carreira `cinturao` (foi campeão) ou `arquibancada`.

---

### Task 1: Casca do hub (barra, abas, Loja/Cards/Conquistas viram abas)

**Files:** `index.html` (`montarTelaCarreira`, `atualizarControles`, `atualizarBadgeConquistas`, `abrirPainelMomentos/Conquistas/Treinador`, remoção de `abrirMenuCarreira`, `#maisb`, `#verFichaBtn`, `.abas-carreira`), `estilo.css`, `testar.js` (suíte nova `hub`).

**Interfaces:**
- `ABAS_HUB=[{id,rot,ic,fundo}]` (painel, lutador, cartel, midia, loja, cards, conquistas).
- `abrirAbaHub(id)`: mostra só `#aba_<id>`, marca a guia, troca o fundo `#hubFundo`, desenha o conteúdo da aba (loja, cards, conquistas, mídia, lutador, painel).
- `renderBarraHub()`: retrato, nome, "Luta N de 22", cartel, dinheiro, seguidores. Chamada por `renderFicha()` (que já roda em toda mudança de estado).
- `data-tela="hub"` no `<html>`.

- [ ] Teste (falha primeiro), suíte `hub`: carreira montada tem as 7 guias; clicar cada guia deixa só a seção dela visível e troca o fundo; Loja/Cards/Conquistas desenham dentro da própria seção (`#painelTreinador > box > .loja-item` continua); toda aba que não é o Painel tem "Voltar ao painel"; nenhum emoji; barra mostra nome, cartel e dinheiro do `st`.
- [ ] Implementar. Mobile (até 720 px): guias viram barra inferior fixa com Painel, Lutador, Cartel, Mídia e "Mais" (abre folha com Loja, Cards, Conquistas).
- [ ] Rodar `hub`, `interface`, `loja`, `momentos`, `conquistas`. Screenshot 3 larguras. Commit + push.

### Task 2: Painel

**Interfaces:** `renderPainel()`; `ultimoFeed` (posts da última luta, só memória).

- Bloco "Próxima luta": "Luta N de 22", `#counter`, `#next` grande, `#autob`, e `#voltarNoite` ("Voltar à escolha do adversário") quando há oferta aberta com a noite fechada.
- "Última luta" (carimbo, adversário, método, round) a partir de `st.registro`.
- "Caminho até o cinturão": `passoCinturao()` + barra de progresso do `standing` com as marcas das faixas (0,35 · 0,60 · 0,80 · 0,88).
- "Posição": `#N de N` com seta (ícone) e melhor da carreira.
- Lesão ativa. 2 posts da repercussão.
- [ ] Teste: Painel mostra a última luta certa depois de uma luta; mostra lesão quando `st.lesao`; mostra 2 posts depois de `renderPhone`.
- [ ] Rodar `hub`, `interface`. Screenshot. Commit + push.

### Task 3: Lutador (ficha em tale of the tape) e aposentadoria

- `renderFicha()` reescrita: retrato grande sob luz, nome, idade, cartel, caixa, golpe marcante; cinturão; ranking (campeão nomeado); posição; lesão; atributos com as três camadas (base, treino, evento) e o valor atual; botão Aposentar.
- Todos os fragmentos que os testes leem continuam iguais (lista nos Global Constraints).
- Confirmação de aposentadoria no estilo novo (`.painel-n`), sem fechar tocando fora.
- [ ] Rodar `interface`, `lesao`, `cinturao`, `coerencia` (as suítes que leem `#ficha`), `hub`. Screenshot. Commit + push.

### Task 4: Cartel e Mídia

- `finishFight` grava no registro: `seg` (seguidores depois da luta), `fa` (medidor de fã), `narracao` (linhas `[relogio, tipo, texto]` do `r.log`).
- Cartel: linha por luta com carimbo; clicar abre a narração daquela luta (irmão inserido logo depois da linha, `.bout` continua filho direto); extras (dilema, entrevista, evento) aparecem como subitens.
- Mídia: `#phone` redesenhado (feed, medidor de fã, seguidores) + gráfico de seguidores por luta em SVG a partir de `st.registro[].seg`.
- [ ] Teste: registro ganha `seg/fa/narracao`; save antigo sem esses campos abre e o Cartel/Mídia não quebram; clicar a linha mostra a narração.
- [ ] Rodar `hub`, `save`, `narracao`. Screenshot. Commit + push.

### Task 5: Noite de luta 1: camada, oferta, camp, coletiva

**Interfaces:** `mostrarNoite(etapa)`, `esconderNoite()`, `ofertaAtual`, `escolhidoAtual`; `telaAdversario(opts?)` (sem argumento sorteia uma vez só por luta; com argumento redesenha a oferta guardada).

- `nextFight()` manual abre a noite em "oferta". Voltar: oferta volta ao hub (oferta continua aberta, Painel oferece voltar a ela); camp volta à oferta guardada; coletiva volta ao camp.
- **PENDENTE oferta** (spec seção 7): a oferta sorteada vai pro save (`{tipo:"oferta",opts:[{nome,ganho,rival}]}`); recarregar reabre a MESMA oferta, sem sortear de novo. Hoje comprar na loja ou trocar de aba com a oferta aberta grava o `rng` já avançado e o recarregamento sorteia outra oferta.
- Coletiva: campo e "Provocar" dentro de `bloqueioPro()` sem Pro; "Pular" fora.
- [ ] Testes (falham primeiro): Voltar do camp não consome `rng`; oferta redesenhada tem os mesmos nomes; save com oferta aberta + compra na loja + recarregar = mesma oferta e mesma carreira de quem jogou direto; sem Pro, Provocar está travado e Pular segue pra luta.
- [ ] Rodar `hub`, `interface`, `pro`, `save`, `desafio`. Screenshot. Commit + push.

### Task 6: Noite de luta 2: entrada e luta

- Entrada (1,5 s, pulável, só no modo manual e sem `prefers-reduced-motion`): tale of the tape dos dois lados (nome, cartel ou lutas, alcance, base, estilo/golpe marcante, 4 barras de percentil comparadas). A narração só começa quando a entrada termina; nenhum gerador é consumido a mais (o round é simulado no mesmo ponto).
- Luta: placar no topo (retratos, nomes, round, selo de cinturão), narração no centro, golpes significativos e quedas dos dois ao lado (atualizados no fim de cada round, nunca antes da narração mostrar), escolha na luta por cima, velocidade (`#speedb`) e automático aqui.
- [ ] Teste: a entrada não muda nada da luta (mesmo resultado com e sem entrada, mesma semente); os números ao lado só mudam depois do round narrado.
- [ ] Rodar `interface`, `narracao`, `driverluta`, `escolhaluta`, `hub`. Screenshot. Commit + push.

### Task 7: Noite de luta 3: resultado e pós-luta

- Resultado: VITÓRIA/DERROTA gigante, método, e três números contando (dinheiro, seguidores, posição com seta). Fundo `confete` ou `apagado`.
- Pós-luta: embrulho por luta dentro de `#posluta` recebe raro, evento da IA, dilema e o convite de entrevista (dentro de `bloqueioPro()` sem Pro). O embrulho é movido pra `#bouts` quando a noite fecha ou a próxima começa, então evento que chega atrasado cai na luta certa.
- Rodapé: "Próxima luta" e "Voltar ao painel" (travados enquanto luta, dilema ou entrevista estão abertos). Depois da luta 22: "Encerrar a carreira".
- Automático: a noite fica aberta de luta em luta, igual hoje.
- [ ] Testes: dilema abre dentro da noite e, respondido, destrava; o embrulho arquivado fica depois da linha `.bout` da sua luta; evento resolvido depois do arquivamento ainda cai no embrulho certo; sem Pro, Dar entrevista está travado.
- [ ] Rodar `interface`, `dilema`, `pro`, `eventoia`, `save`, `hub`. Screenshot. Commit + push.

### Task 8: Save e saída

- Botão Menu da barra: salva (quando o estado é ponto de save consistente) e vai ao menu. `pararCarreira()` limpa `playTimer`, `autoTimer`, timer da entrada, desliga o automático e troca `CARREIRA_TOKEN`; toda continuação assíncrona (feed, evento IA, dilema, julgar, coletiva, entrevista) confere o token e desiste se a carreira mudou.
- Rota `#/carreira`: a carreira em andamento fica nesse endereço; recarregar a página volta pra carreira (save mais recente do usuário), em vez de cair no assistente de nova carreira.
- Dilema: `PENDENTE={tipo:"dilema",d:null,seed}` gravado no instante do sorteio, antes da IA; recarregar nesse intervalo reabre o dilema com a mesma semente (hoje o dilema some).
- Escolha na luta: `PENDENTE.escolhaRngAntes` guarda o estado de `escolhaRng` antes de sortear o trio; save no meio da escolha grava esse estado, então recarregar sorteia o MESMO trio.
- [ ] Testes (falham primeiro): recarregar no meio do dilema (antes da IA voltar) dá a mesma carreira; save no meio da escolha dá o mesmo trio; sair pro menu no meio da luta e voltar dá a mesma carreira; callback de evento IA depois de sair não toca a carreira nova; `#/carreira` retoma.
- [ ] Rodar `save`, `rotas`, `hub`, `desafio`. Commit + push.

### Task 9: Fim de carreira

- `screenReport()` no molde novo: fundo `cinturao` ou `arquibancada`; retrato; nota gigante com parecer; cartel e números principais em grade; legado; destaques (bônus da noite, raros); feito de; ações (Salvar imagem, Copiar imagem, Copiar desafio, Nova carreira, Menu); status do envio ao placar.
- [ ] Rodar `interface`, `compartilhar`, `aposentadoria`, `placar`. Screenshot. Commit + push.

### Task 10: Cards em imagem com a identidade nova

- `desenharCard` (fim de carreira) e `desenharCardMomento`: paleta nova, Anton/Barlow Condensed, cantos cortados, granulação; esperar `document.fonts.ready` antes de desenhar. Continua `<div>` com `background-image` na miniatura.
- [ ] Rodar `compartilhar`, `momentos`. PNG gerado no Chrome de verdade conferido a olho. Commit + push.

### Task 11: Fechamento

- Os 6 "✓" restantes viram ícone SVG `check`.
- `node testar.js` completo em background, TUDO CERTO.
- Chrome de verdade: carreira inteira no manual e no automático, recarregar na oferta, na luta, no dilema; 3 larguras.
- Docs: `LEIA-ME.md` seção "Hub da carreira (revamp fase 5)", `PENDENCIAS.md` item 37, `CLAUDE.md` se surgir regra nova. Commit + push. Checkpoint com o dono antes da fase 6.
