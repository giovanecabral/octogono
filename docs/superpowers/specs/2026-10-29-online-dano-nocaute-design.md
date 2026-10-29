# Online: dano que aparece, a cena do nocaute, a tabela do ciclo e o abandono contra bot

Data: 2026-10-29. Branch: `online-dano`. Status: desenho aprovado pelo dono
no protótipo do navegador (`luta-dano-v2.html`, "animações boas, use uma
linha por carta"); esta spec espera a revisão dele antes do plano.

## 1. Por que

Pedido do dono, jogando o Online em cartas (no ar desde 2026-10-28):

1. "coloque a abandonar apenas em lutas com bots";
2. "em algum lugar da tela uma tabela que fique com a sequência de qual
   movimento ganha de qual";
3. "a barra de vida mal diminui e de repente aparece vitória ou derrota":
   ele quer a barra "diminuindo com animação e som, mostrando que o soco
   entrou ou alguma outra ação que deu o dano";
4. "quando vai ser nocaute e vai diminuir tudo de uma vez, uma animação que
   dê bastante emoção". "Animações bem feitas."

## 2. O que foi medido

4.000 lutas simuladas pelo motor v4 (ações ao acaso entre as cartas da mão):

| Fim | Dano do perdedor (mediana) | p10 | p90 |
|---|---|---|---|
| Nocaute | 11 | 5 | 26 |
| Nocaute técnico | 17 | 6 | 29 |
| Decisão | 12 | 3 | 26 |

Só 32% das trocas têm dano, e o golpe que entra tira 4,8 (mediana; p90
9,6). A barra de hoje é `100 − dano`: no nocaute ela ainda está em 89%.
O nocaute é um sorteio que cresce com o dano acumulado
(`(dano/100 + 0,3)^1,6`), não o fim da barra. E a troca que encerra a luta
nem passa pela tela da luta: o status vira `encerrada` e a tela pula direto
pro resultado. Daí "de repente aparece vitória ou derrota".

## 3. Decisões do dono

| Tema | Decisão |
|---|---|
| Abandonar | Só na luta contra bot |
| Tabela do ciclo | Opção A: uma linha por carta sua ("Golpes ganha de Pressão"), muda com a posição |
| Animações | As do protótipo: golpe, golpe pesado, knockdown, nocaute, finalização |
| Barra | Escala nova, 2,5 vezes o dano (a selecionada no protótipo; o dono não pediu a de hoje) |
| IA | Nenhuma chamada nova: a cena do fim usa a narração ao vivo que já existe (IA ou molde) |

## 4. O que não muda

- Motor, números, regras, bot, rating: nada. `VERSAO_MOTOR` e
  `VERSAO_BALANCEAMENTO` ficam. A barra nova é só desenho.
- Banco: nenhum SQL. O abandono grava pela `jxj_gravar_troca` que já
  fecha o W.O. de hoje.
- O fluxo da luta (consulta numa cadeia só, a carta jogada na vaga, a
  revelação de `JXJ_REVELACAO_MS`), as regras de texto, ícone só do sprite,
  nenhum emoji, os ids que os testes usam.

## 5. Abandonar (só contra bot)

**Servidor** (`api/jxj.js`, ação nova `abandonar`, limite 20 em 10 min):

- Pede `lutaId`. Resolve o que estiver pronto (`processarLuta`) e lê a luta.
- Quem não está na luta: 404. Luta sem bot: 400 "Abandonar só existe na luta
  contra bot." Luta já encerrada: devolve a vista como está (o segundo
  clique não muda nada).
- Em andamento: `fim = {vencedor: "b", metodo: "WO", round, troca, abandono: true}`,
  eventos `[{tipo: "abandono", quem: "a"}, {tipo: "fim", quem: "b", metodo: "WO", abandono: true}]`,
  efeitos de `efeitosDoFim` (derrota por W.O.: rating como derrota, XP 0,
  fichas 0, `wos` + 1) e `jxj_gravar_troca` na troca aberta, sem ações.
  Se a troca andou no meio (`gravou: false`), lê de novo e tenta até 3
  vezes; se a luta acabou nesse meio tempo, vale o fim que gravou primeiro.
- O texto do evento: "Fulano abandonou a luta." (`textoEvento`).

**Tela:**

- Botão "Abandonar" com o ícone `bandeira`, discreto, embaixo do round no
  centro do placar. Só com a luta em andamento, o jogador num dos lados e
  `nomes[ele].bot`.
- Tocar abre a confirmação na própria tela (sem `confirm()`): "Abandonar a
  luta?", "Você perde por W.O. O rating cai como numa derrota, e a luta não
  dá XP nem fichas.", botões "Abandonar" e "Voltar pra luta".
- Confirmado: manda `abandonar`; a vista volta encerrada e a tela mostra o
  resultado direto (sem a cena do fim), com "Você abandonou a luta." no
  lugar do método.

## 6. A tabela do ciclo

- O servidor manda o ciclo nas definições: `acoes.vence = {pe: [...], cima: [...], baixo: [...]}`,
  pares `"golpes>pressao"` tirados do `VENCE` do motor (fonte única). O
  treino continua com a cópia dele (`JXJ_TREINO_VENCE`), conferida contra
  esta num teste.
- Título "Quem ganha de quem" e a posição ("Em pé", "Você por cima", "Você
  por baixo"). Uma linha por carta sua, na ordem da mão: a carta (chip da
  cor da família, ícone e o nome no papel atual) e "ganha de" com as cartas
  dele que ela vence, com os nomes do papel dele. Sem nenhuma: "ninguém".
- A linha da carta que você jogou fica marcada em ouro na revelação.
- Computador: coluna à direita da mesa (250 px). Celular: antes da mesa, as
  quatro linhas em duas colunas. Sempre visível durante a luta (não na
  confirmação nem no resultado).

## 7. A barra e o dano de cada troca

**A barra:**

- `jxjVida(dano)` = `100 − dano × 2,5` (`JXJ_ESCALA_VIDA`), arredondado,
  nunca abaixo de 4 enquanto a luta não acabou em nocaute (a barra zerada
  com a luta andando mentiria). O número ao lado é o mesmo da barra.
- Mais grossa, com marcas de 10 em 10. Verde; amarela abaixo de 50;
  vermelha e pulsando abaixo de 25. A do adversário cresce da direita.
- Duas camadas: a atual e o rastro. O dano tira a atual na hora, o pedaço
  perdido pisca branco e o rastro vermelho desce depois (0,5 s), como em
  jogo de luta. O número conta pra baixo.

**A troca resolvida** (a troca nova da vista, uma vez, no primeiro desenho;
redesenho no meio mostra os valores finais sem animar de novo):

1. As cartas viram como hoje (`jxjRevelar`).
2. Depois da virada (900 ms), cada evento de dano da troca, em ordem, a
   cada 450 ms: golpe (`golpe`, `contra`, `punicao`, `grade`, `gnp`,
   `sujo`, `baixo`, que trazem `dano`):
   - a barra de quem apanhou desce o dano na escala da barra;
   - o retrato dele treme com um clarão vermelho;
   - "−24" sobe de dentro da barra;
   - uma faixa "ENTROU Cruzado −24" entra em cima da carta dele na mesa
     (o nome da variante pelo `v` do evento; sem ela, o nome do tipo:
     "Contra-ataque", "Ground and pound", "Golpes na grade" e assim por
     diante);
   - som: `SOM.golpePesado` com 6,5 de dano ou mais, `SOM.golpeLeve`
     abaixo; golpe pesado treme a tela de leve.
3. Knockdown: clarão branco, tremor forte, o retrato cai e volta, selo
   "KNOCKDOWN" no placar dele, `SOM.knockdown`; a etiqueta "grogue" que já
   existe pisca.
4. Os outros efeitos de hoje continuam (queda, encaixe, sino do round).

Os números: o lance e o registro continuam com o dano do motor ("6,1 de
dano"); o "−N" que sobe da barra e a faixa estão na escala da barra (como
no protótipo: "9,6 de dano, 24 na barra"). A carta da mesa deixa de mostrar
o número; a faixa ocupa o lugar.

Mais de uma troca nova de uma vez (a tela ficou parada): só a última anima;
as outras já entram nos valores de partida.

## 8. A cena do fim

Quando a vista passa de `andamento` pra `encerrada` com a tela aberta (os
dois lados veem), a tela da luta mostra antes a troca que acabou a luta: a
mesa com as cartas, a barra e os efeitos da seção 7, e então a cena. Quem
abre a luta já encerrada (recarregou, voltou depois) vai direto pro
resultado, como hoje.

- **Nocaute e nocaute técnico:** clarão, tremor forte, fagulhas no retrato
  de quem caiu, o retrato apaga e tomba, a barra desce **inteira** (0,95 s)
  com o "−N" grande, `SOM.nocaute`. Depois o véu escuro, os raios vermelhos
  girando, "NOCAUTE" (ou "NOCAUTE TÉCNICO") letra por letra, a faixa
  "Round 2 · troca 3", "Fulano venceu com o cruzado" (a `frase` da
  variante; as definições passam a mandar a `frase`) e a narração digitada
  (a `narracao` gravada na troca, IA ou molde; sem ela, o texto do evento
  do fim).
- **Finalização:** o retrato de quem bateu é apertado três vezes (uma
  batida em cada), "FINALIZAÇÃO" em ouro, raios dourados, o mesmo
  "Fulano venceu com o mata-leão" e a narração. A barra não cai
  (finalização não é dano).
- **Decisão e empate:** o sino, "DECISÃO" (ou "EMPATE") sem raios nem
  clarão, a faixa "Fim do round 3" e o botão.
- **W.O., abandono e anulada:** sem cena; o resultado direto.
- Em todas com cena: o botão "Ver o resultado" aparece no fim e abre o
  resultado de hoje (com a vinheta de vitória ou derrota). Nada passa
  sozinho.

## 9. Menos movimento

Com "reduzir movimento" no sistema: nada treme, vira ou cai; a barra muda
sem transição; a cena do fim aparece parada, com todo o texto. Os sons
tocam.

## 10. Testes

`jxj` (servidor, PGlite):
- abandonar contra bot: encerrada, W.O., vencedor `b`, `abandono: true`,
  derrota e `wos` + 1 no lutador, rating mudou, XP 0, fichas 0; o segundo
  pedido não muda nada; contra gente, 400 sem mudar a luta; quem não está
  na luta, 404; a troca resolvida ao mesmo tempo dá um fim só;
- definições: `acoes.vence` igual ao `VENCE` do motor nos três papéis; a
  `frase` de cada variante.

`jxjtelas` (DOM falso):
- tabela: em pé, por cima e por baixo, as linhas iguais ao `vence` das
  definições, com os nomes do papel; a carta jogada marcada;
- `JXJ_TREINO_VENCE` igual ao `vence.pe`;
- barra: `jxjVida` (escala, arredondamento, o piso de 4 sem nocaute, 0 no
  nocaute); a troca nova desenha a barra com o dano de antes e, depois dos
  timers, com o de depois; a faixa com o nome da variante; redesenho no meio
  não anima de novo;
- abandonar: o botão só contra bot; a confirmação abre e "Voltar pra luta"
  fecha sem mandar nada; "Abandonar" manda uma vez e mostra o resultado com
  "Você abandonou a luta.";
- cena do fim: andamento pra encerrada com nocaute mostra a mesa da última
  troca e a cena com "NOCAUTE", o nome de quem venceu, a narração e "Ver o
  resultado", que abre o resultado; finalização e decisão com as palavras
  delas; W.O. e luta aberta já encerrada vão direto pro resultado;
- nada de `undefined`, emoji ou travessão. `texto` e `rotas` verdes.

Checklist no Chrome local (computador e celular, contra bot e entre duas
contas): golpe, knockdown, nocaute, finalização, decisão e abandono, com
prints e sem erro de página. Depois a bateria completa.

## 11. Entrega

Uma entrega só, na branch `online-dano`, mostrada rodando ao dono antes do
deploy. Deploy só com o dono mandando.

## 12. Fora do escopo

Mudar o motor pra o nocaute depender da barra; abandonar contra gente;
abandonar o treino; animação nova no treino além da barra (ele usa a mesma
tela e ganha a barra nova junto); arte ilustrada nas cartas.
