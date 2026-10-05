# Ficha do Lutador

Jogo de carreira de MMA. Você monta um lutador draftando atributos de gente
real, e joga 22 lutas até a aposentadoria.

As **11 divisões** são jogáveis. Os 1.527 lutadores são reais, com estatísticas do ufcstats. A simulação foi
calibrada até bater a distribuição de nocaute, finalização e decisão do UFC
de verdade.

---

## Jogar

```bash
python3 -m http.server 8000
```

Abra `http://localhost:8000`. Deixe o terminal aberto, ele é o servidor.
`Ctrl+C` para parar.

Leva uns segundos em "Avaliando 1527 lutadores": ele simula 18 lutas para cada
um, para montar a escada de adversários.

---

## Testar

```bash
node testar.js
```

Um comando, 30 segundos, sem servidor e sem internet. Percorre a interface
inteira clicando nos botões de verdade (nome, 4 cartas de draft, 22 lutas
narradas, relatório final) e depois confere a calibração.

**Rode isso depois de qualquer mudança.** `node --check` só valida sintaxe: uma
função que não existe mais passa limpo e só quebra quando o jogador clica. Foi
exatamente assim que a tela de draft travou.

Partes separadas, se quiser:

```bash
node testar.js interface   # a interface quebra em algum clique?
node testar.js motor       # a calibração continua de pé?
node testar.js draft       # o orçamento está no alvo?
node testar.js divisoes    # quais divisões têm gente suficiente?
node testar.js escolhas    # escolher adversário forte muda a carreira?
node testar.js desafio     # a mesma semente dá a mesma carreira?
node testar.js pesos       # quanto cada atributo vale (gera o WEIGHTS)
node testar.js jxj         # JxJ: servidor + banco de verdade (ver a seção "JxJ")

# uma divisão específica
node testar.js draft heavyweight
node testar.js interface 7
```

---

## Os arquivos

```
index.html          O JOGO INTEIRO. Motor, draft, narração, eventos, interface.
                    É a única fonte de verdade: o testar.js lê o motor daqui.
estilo.css          Visual novo (revamp 2026-09-26). Ver "Interface nova".
legado.css          CSS das telas antigas, movido sem mudança. Temporário.
img/                Ícones (sprite SVG) e fundos (.webp) + gerar.py.
404.html            Página de erro estática.
fighters.json       1.527 lutadores com stats calculadas do ufcstats.
testar.js           A única ferramenta.
atualizar-dados.py  Regenera o fighters.json com dados novos.
api/ai.js           Proxy do OpenRouter. Só é usado depois do deploy.
api/jxj.js          JxJ (jogador contra jogador). Ver a seção "JxJ".
api/_jxj-*.js       Motor, árvores, rating e regras do JxJ.
supabase_jxj.sql    Migração do JxJ (só aditiva); depois dela, supabase_jxj_narracao.sql; _rollback desfaz as duas.
ferramentas/        Teste do banco (PGlite), servidor local, balanço e E2E do JxJ.
```

Para jogar localmente: `python3 -m http.server 8000` na pasta e abrir
`http://localhost:8000` (CSS, imagens e ícones são arquivos separados agora).

---

## A regra que evita o erro mais caro

Os pesos do draft (`WEIGHTS` no `index.html`) são **medidos** a partir do motor.
Se você mexe no `TUNING` e não remede, o draft passa a cobrar caro por atributo
que não faz mais diferença, e nada aparece na tela.

Já aconteceu aqui. Quando separei "queda" de "nocaute", o peso do poder subiu de
0.45 para 0.48 e o da envergadura caiu de 0.38 para 0.28.

```bash
node testar.js pesos
```

Faixas aceitáveis:

| medida | alvo |
|---|---|
| KO / Finalização / Decisão | 33 / 19 / 48, tolerância 4 pontos |
| quedas por luta | 0.40 a 0.70 |
| favorito em confronto conhecido | nunca acima de 92% |
| percentil do lutador draftado | 60 a 76 |
| linhas mortas na mesa | abaixo de 3% |

Se o favorito passa de 92%, o confronto virou determinístico e o draft deixa de
importar: o jogo vira "escolher o maior número".

---

## O desafio

No fim da carreira, **Compartilhar** gera uma imagem 1080x1350 e **Copiar desafio**
copia um link como `?d=lightweight&s=2n9c`.

Quem abre esse link recebe **os mesmos adversários, na mesma ordem**. É
isso que transforma o compartilhamento num desafio em vez de um print.

**A promessa mudou (2026-09-06): a semente não garante mais o draft.**
"Rolar novamente" (uma vez por criação, botão 🎲 acima da mesa) consome
`rng` sob demanda pra sortear outra rodada de cartas — se o jogador usar,
a mesma semente pode dar cartas diferentes de uma sessão pra outra. Os
eventos de vida também não são mais determinísticos (vêm da IA agora, ver
"Eventos por IA"). Só os adversários continuam garantidos, e é só isso
que o texto do convite (`screenName()`) promete.

A semente ainda controla tudo o mais que é sorteado (draft sem usar o
dado, adversários, ordem deles). Se você mexer na ordem em que o `rng` é
consumido — sortear uma coisa a mais antes do draft, por exemplo — os
links antigos deixam de reproduzir os mesmos adversários.

```bash
node testar.js desafio
```

---

## O rosto do lutador

Bustos em SVG construídos por código. Nenhuma imagem, nenhuma licença, escala em
qualquer tamanho.

### Arquitetura

A primeira versão quebrava porque cada peça tinha número fixo: olho em x=39,
boca em y=71. Mexer no formato da cabeça não movia nada disso. Três decisões
resolvem na raiz:

**Ancoragem.** A função `anatomia(porte)` devolve um objeto com linha dos olhos,
linha da sobrancelha, base do nariz, linha da boca, largura da mandíbula, topo
do crânio. Toda peça se posiciona em relação a ele. Trocar o porte move a
mandíbula, e orelha, barba, pescoço e ombro acompanham sozinhos.

**Simetria por construção.** Olho, sobrancelha e orelha são desenhados UMA vez e
espelhados por `transform`. É impossível ficarem desalinhados ou de tamanhos
diferentes — são o mesmo desenho.

**Contorno em vez de sobreposição.** O cabelo é um caminho fechado que sobe da
têmpora, passa pelo crânio e fecha por uma linha do cabelo explícita. A barba
tem borda inferior no contorno da mandíbula e borda superior que mergulha abaixo
do nariz. Nenhuma das duas consegue invadir o rosto, por construção.

Sombra e realce são calculados a partir do tom de pele (`sombrear`/`iluminar`),
então trocar a cor mantém a iluminação coerente em rosto, pescoço e orelha.

### Adicionar uma opção nova

Acrescente na lista (`CABELO_TIPOS`, `BARBAS`...), trate o caso no bloco da peça
usando as âncoras de `A`, e pronto — a interface se monta sozinha a partir de
`CATEGORIAS`.

### Só o lutador do jogador tem rosto

Os 1.527 lutadores do dataset **não têm retrato**, e é deliberado. Eles são
pessoas reais, e rosto reconhecível é direito de imagem — é o que a EA licencia
do UFC para poder fazer isso. Estatística de luta é fato público e pode ser
usada; retrato não.

A função que derivava rosto para eles foi **removida**, não deixada sem uso, para
ninguém reintroduzir sem perceber.

## Balanço (2026-09-28)

**Problema, medido antes de mexer:** quem jogava vencia quase tudo. Foram
50 carreiras por perfil de jogador (`node testar.js balanco`), todas pelo
caminho real (draft, lutas, dilemas):

- vencia 17 de 22 lutas;
- 16 a 20% das carreiras terminavam com no máximo 2 derrotas;
- o cinturão saía em 46 a 66% das carreiras.

A causa: o lutador draftado já nascia melhor que 84% da divisão
(`BUDGET_PCT` .76). Cara a cara, ele vencia 75 a 90% da escada, porque a
nota dos lutadores reais (contra o mediano) não prevê a luta contra um
lutador sem ponto fraco.

**Pedido do dono:** ~50% de vitórias pra quem joga bem (carreira típica
perto de 11-11) e cinturão raro (1 em 5 ou menos).

**O que mudou (cada alavanca medida sozinha antes):**

| alavanca | antes | agora | efeito medido sozinho |
|---|---|---|---|
| `BUDGET_PCT` | .76 | .35 | 17,2 → 13,9 vitórias; lutador do 84º pro 51º percentil |
| faixas de adversário | -16..-7%, -3..+3%, +8..+20% | -6..+3%, +7..+13%, +18..+30% | quase nada sozinho (17,2 → 17,0) |
| centro da escada | `standing` | nunca abaixo de 25% da divisão | tira a fila de vitória fácil depois de perder |
| `TETO_TREINO` | 1.18 | 1.10 | ~ -0,5 vitória |

**Resultado:** 50 carreiras por perfil, peso-leve, modo normal:

| perfil | vitórias em 22 | cinturão |
|---|---|---|
| automático | 12,0 | 6% |
| aleatório | 11,6 | 4% |
| escolhe bem | 11,3 | 6% |
| sempre o mais difícil | 11,0 | 8% |
| lê o rótulo e pega a mais fácil | 12,5 | 4% |

Também medido com quem escolhe bem: peso-pesado 11,2, mosca 10,8, modo
Lenda 11,3. `node testar.js balanco` reprova fora de 9 a 14 vitórias,
cinturão acima de 20% ou mais de 10% de carreiras quase sem derrota.

**Dificuldade e zebra pela chance real.** Com os adversários acima da
posição no ranking, a régua antiga (nota do adversário menos `standing`)
rotulava as três cartas como "Perigoso" e fazia quase toda vitória virar
zebra. `chanceContra(opp)` simula 24 lutas do jogador de agora (draft ×
treino × evento) contra aquele adversário, com semente própria (o rng da
carreira não mexe). Os rótulos seguem essa chance:

- Acessível: 64% ou mais;
- Parelho: 48 a 63%;
- Duro: 34 a 47%;
- Perigoso: menos de 34%.

Zebra (hype, feed e card de momento) é vencer com menos de 35% (feed e
hype) ou menos de 30% a partir da luta 6 (card). Ler os rótulos vale pouco
mais de uma vitória na carreira (12,5 contra 11,3), sem deixar fácil.

**Testes recalibrados, com o porquê no código:**

- `draft`: alvo do lutador draftado de ~70 pra ~48 (40 a 56).
- `escolhas`: "perigoso > acessível + 30 pontos" virou proporção (3× e
  pelo menos 15 pontos, custando vitórias). Chegar ao topo ficou raro pra
  todo mundo: 1%, 10% e 31%.
- `momentos`: zebra pela chance real.

### Orçamento é teto (reta final, 2026-09-28)

**Achado do dono jogando:** terminou o draft com -0.17 de orçamento e ainda
via cartas de 0.79. Quando nenhuma carta cabia, a mesa mostrava a mais
barata MESMO acima do saldo, então o orçamento furava.

**Regra agora (`cartasDaMesa`, perto de `rollTable`):** a mesa só mostra
carta que cabe no que sobrou. Quando nada cabe, ela oferece a **carta
mínima** de cada par que falta (`cartaMinima`): os dois atributos no piso
da divisão (percentil 0, então a própria fórmula de custo dá 0.00) e os
atributos que vão junto (precisão, golpes sofridos) na mediana, porque eles
não entram no preço. `pick()` recusa carta acima do saldo como segunda
trava. Nada disso consome `rng`: a mesa sorteada é a mesma, só muda o que
aparece, e os adversários do link de desafio continuam iguais.

**O balanço dependia do furo.** O `.35` foi medido com o bot guloso
estourando o orçamento (pegava a carta mais cara, e o que faltava vinha da
mais barata acima do saldo). Com o teto de verdade, o mesmo `.35` derrubou
o lutador draftado do 48º pro 33º percentil e as vitórias pra 6 a 7 em 22.
Medido de novo (30 carreiras por perfil, `node testar.js balanco 30`):

| `BUDGET_PCT` | vitórias em 22 (5 perfis) | cinturão |
|---|---|---|
| .35 (teto novo) | 6,1 a 7,2 | 0% |
| .50 | 9,7 a 11,1 | 0 a 3% |
| **.52** | **10,6 a 12,0** | **0 a 7%** |
| .55 | 12,0 a 13,1 | 0 a 10% |

Ficou **.52**, o mais perto do balanço aprovado (11,0 a 12,5 e 4 a 8%). O
lutador do bot guloso nasce no 49º percentil (suíte `draft`). Quem espalha
o orçamento pelos quatro pares monta melhor que o guloso: agora o draft tem
decisão de verdade, em vez de "pega a mais cara que o resto se ajeita".

### Orçamento maior, adversários mais fortes (mesmo dia)

**Pedido do dono:** "precisa aumentar o orçamento inicial, todas as vezes
o jogador está ficando zerado". Medido antes (300 montagens por divisão, 4
divisões): com `.52`, quem pega sempre a carta mais cara precisava da
carta mínima em **88%** das montagens; quem espalha o dinheiro (deixa uma
reserva pros pares que faltam), em 35%; quem escolhe ao acaso, em 27%.

| `BUDGET_PCT` | mais cara | espalha | ao acaso | lutador (mais cara) |
|---|---|---|---|---|
| .52 | 88% | 35% | 27% | 49º percentil |
| .60 | 71% | 24% | 10% | 56º |
| .65 | 48% | 14% | 5% | 61º |
| **.70** | **25%** | **6,5%** | **1%** | **65º** |
| .75 | 9% | 2,5% | 0,5% | 68º |

Ficou **.70**. Sozinho, ele quebra o balanço (14,2 a 15,9 vitórias em 22,
cinturão até 27%), então os adversários subiram junto. Medido em 30
carreiras por perfil, cada alavanca antes de combinar:

| combinação (orçamento .70) | vitórias em 22 | cinturão |
|---|---|---|
| sem compensar | 14,2 a 15,9 | 17 a 27% |
| piso da escada .45 | 14,2 a 14,9 | 17 a 33% |
| piso .40, faixas +8%, teto 1.05 | 11,9 a 14,0 | 7 a 13% |
| piso .45, faixas +12%, teto 1.05 | 11,6 a 13,3 | 0 a 13% |
| piso .45, faixas +12%, teto 1.03 | 11,9 a 12,7 | 0 a 10% |
| **piso .45, faixas +16%, teto 1.05** | **11,3 a 12,5** | **0 a 3%** |

A escolhida é a última: o balanço aprovado era 11,0 a 12,5 vitórias. Em
`candidatos()`, o centro da escada nunca fica abaixo de 45% da divisão
(era 25%) e as três faixas sobem 16% (eram -6..+3%, +7..+13%,
+18..+30%). `TETO_TREINO` 1.10 -> 1.05: cada camp rende a metade, e a
montagem pesa mais que o treino. A suíte `draft` mudou de alvo (~48 pra
~65, 58 a 72) e agora guarda que o orçamento não saia do lugar sem o
balanço ser medido junto.

**Teste:** suíte `orcamento`. 2.160 drafts (todas as divisões jogáveis,
normal e lenda, três jeitos de escolher: mais cara, aleatória, mais barata)
nunca deixam o orçamento negativo, a carta mínima só aparece quando nada
cabe, custa exatamente 0 e tem o piso da divisão; e a tela de verdade
(`renderDraft` no DOM falso, sempre clicando a carta mais cara) nunca
mostra carta acima do saldo. Dente provado três vezes: mesa antiga no
motor, tela ignorando a regra e piso errado (reprovam 1.800+, 10 e 1.400+
casos). As cópias do draft guloso dentro do `testar.js` (dez) usam a mesma
`cartasDaMesa` do jogo.

### Carreira v2: ranking do UFC, só quem está na ativa, adversário que cresce junto (2026-10-04)

**Pedido do dono, com três achados de quem conhece UFC:**

- carreira nova, 0-0, podia pegar campeão logo de cara;
- o ranking "#95 de 236" não é como o UFC funciona;
- aposentado (Khabib, GSP, Anderson Silva) aparecia no modo normal.

Ele pediu que o nível dos adversários cresça junto com o lutador, o
ranking siga o modelo do UFC real, e as lendas fiquem só no modo Lenda.

**Regras versionadas (`st.regras`, `REGRAS`).** Toda carreira nova nasce
com `regras: 2` e o link de desafio leva `&r=2`. Save gravado antes (sem
`st.regras`) e link antigo (sem `r=`) continuam na v1, com o pool com
aposentados e a escada antiga: a regra da semente vale pros dois (mesmo
link e mesmo save = mesma carreira). Nada da v1 foi apagado.

**Só quem está na ativa no modo normal.** `poolDivisao` v2 tira quem não
luta desde antes de `ANO_ATIVO` (2023): sai Khabib, GSP, Anderson Silva,
Cormier, BJ Penn, Frankie Edgar, Nate Diaz. O modo Lenda não mudou
(continua com as lendas, aposentadas ou não). Lutadores na ativa por
divisão: leve 89, pena 87, galo 83, meio-médio 82, médio 77, mosca 58,
palha feminino 54, meio-pesado 50, pesado 42, mosca feminino 39, galo
feminino 34. A divisão abre com 30 (`MIN_LUTADORES_V2`; a v1 pede 40 do
elenco inteiro), então as 11 continuam jogáveis.

**Ranking do UFC.** `buildRanking` v2: o campeão sai pelos títulos, como
antes. O #1 ao #15 são os 15 mais fortes do resto pela nota. O jogador:

- abaixo de `LIMIAR_TOP15` (standing .45): "Sem ranking";
- de .45 até `LIMIAR_DESAFIANTE` (.88): do #15 ao #1;
- com o cinturão: "Campeão".

Painel, ficha, resultado, card de momento e `passoCinturao()` falam nessa
régua ("Vencer até entrar no top 15 da divisão", "Você é o #7. Subir no
top 15 vencendo quem está acima"). O cartão do adversário mostra a posição
dele ("#4 do ranking", "Sem ranking") e a aposta diz o que a vitória faz
("entra no top 15 (#14)", "sobe pro #6").

**Escada v2 (`faixasV2`).** Uma fila só: os sem ranking em ordem de nota,
depois do #15 ao #1. O campeão fica fora da escada; ele só aparece pelo
caminho do título (`st.tituloEstaLuta`, igual à v1).

- Sem ranking: o centro anda de 15% a 100% da parte sem ranking enquanto o
  standing vai de 0 a .45. Faixas: de 7% a 1% abaixo, até 8% acima e de
  10% a 24% acima (em fração da parte sem ranking). Teto: quem não tem
  ranking pega no máximo o #13 (achado da suíte `regras`: perto do limiar,
  a faixa de cima alcançava o #1).
- Ranqueado no #k: até 2 posições abaixo, até 2 acima, e de 2 a 5 acima.
- Ganho no standing: .045, .075 e .125 sem ranking; .05, .08 e .10 no top
  15. Derrota no top 15 tira 60% da punição: no UFC uma derrota não joga
  um ranqueado pra fora.
- A carta mais difícil no top 15 rendia .13: quem sempre pegava a mais
  difícil ganhava o cinturão em 18% a 23% das carreiras (teto 20%), porque
  o campeão dos leves na v2 (Islam Makhachev, pelos títulos) tem a nota de
  estatística no 32º percentil do elenco na ativa (51% na v1, com Khabib
  na tabela). Com .11, 12%, sem mudar as vitórias de ninguém. Com o plano
  de luta a cada round, o melhor plano rende mais e o ousado foi a 22%:
  .10, 16%.

**Balanço medido** (50 carreiras por perfil, `node testar.js balanco`):

| perfil | vitórias em 22 | cinturão |
|---|---|---|
| automático | 12,8 | 12% |
| comum | 12,6 | 8% |
| esperto | 12,6 | 2% |
| ousado | 11,9 | 12% |
| estrategista | 12,8 | 8% |

Com 30 carreiras (a bateria completa): 11,9 a 12,6 vitórias, cinturão 3% a
13%. Lutas 1 a 5: 55% a 71% de vitória.

Com o plano de luta a cada round (os perfis manuais escolhem o plano: o
comum ao acaso, os outros o que mais casa) e a carta difícil do top 15 em
.10: 11,9 a 12,8 vitórias e cinturão 6% a 16% (50 carreiras); 11,7 a 12,7
e 7% a 13% (30). Dentro das faixas do teste (9 a 14
vitórias, cinturão até 20%); um pouco acima do 11 a 12,5 aprovado em
2026-09-28, porque a estreia agora é contra gente do mesmo nível.

**Testes:** suíte `regras`:

- nenhum aposentado no modo normal, e o Khabib só no Lenda;
- campeão e top 15 montados certo, e a régua da posição;
- 40 estreias sem campeão nem ranqueado;
- o nível cresce com o standing;
- sem ranking nunca passa do #13;
- save e link antigos na v1, com os aposentados;
- a escada v1 intacta.

Dente provado com 5 mutações (cada uma reprova o teste dela). `hub`,
`cinturao`, `interface`, `divisoes` e `save` foram atualizadas pra régua
nova (semente do `save` 777004 virou 777005: a carreira de teste acabava
no round 1 com os adversários novos).

### Carreira v3: teto do estreante, adversário do nível do jogador e nocaute de UFC (2026-10-05)

**Pedido do dono, jogando em produção, em duas rodadas:**
1. "Lutas muito fáceis, joguei 4 vezes seguidas e foram 4 nocautes no
   primeiro round." Ele sugeriu que o jogador "nunca poderá começar a
   carreira com alguma estatística masterizada" e que o nível dos
   adversários subisse, se a medição mostrasse que precisava.
2. "Resolva o nocaute para ser mais raro, 33%, e também não deixe o mesmo
   adversário para todos; caso isso realmente impacte no link do desafio,
   podemos retirar essa opção."

**Medido antes, na v2** (harness de carreira com o caminho real, peso-leve,
60 carreiras por estilo; draft guloso ou com a Pancada primeiro; jogador
esperto ou estrategista):
- lutas 1 a 5: de 72% a 80% de vitórias;
- 60% a 70% das lutas acabavam em nocaute (no UFC real, 33%).

Quem mais nocauteava era o jogador, pelo volume de golpes: ele vencia por
nocaute de 38% a 45% das 10 primeiras lutas.

O excesso de nocaute não vinha só do adversário fraco. O lutador draftado
contra a divisão inteira acabava em nocaute 57% a 64% das vezes mesmo nas
lutas parelhas, com chance de 35% a 65%. Ele junta atributos de lutadores
diferentes (muito volume, queixo mediano), combinação que lutador real não
tem, e o motor foi calibrado com lutador real.

**O que mudou (só em carreira nova, `st.regras: 3`).** Save e link antigos
continuam na v1 ou na v2, pela regra da semente.
- **Nocaute da carreira** (`KO_CARREIRA` .24, `koMult` no estado da luta,
  lido em `impact()`). É o fator de knockdown e nocaute da luta da
  carreira, igual nos dois lados, e `chanceContra` simula com o mesmo
  fator, então o rótulo das cartas bate com a luta. `simulateFight` sem
  `koMult` continua bit a bit igual, e a calibração do motor (`motor`,
  `drivermotor`) e as notas dos lutadores reais não mudam.
  - Medido na carreira: 33% a 35% de nocaute, 18% a 21% de finalização e
    44% a 50% de decisão (UFC: 33/19/48).
  - Fator .30 deu 36%, .45 deu 44% e .60 deu 50%.
- **Adversário do nível do jogador** (sem ranking; `posicaoParelha`,
  `DESVIO_ESTREIA_V3` .05). A fila parte da posição onde o jogador vence
  metade das lutas (busca binária com `chanceContra`, semente fixa, sem
  rng). Na estreia ela fica 5% da fila abaixo disso e sobe até o melhor
  sem ranking no limiar do top 15. Sem ranking, nada de ranqueado até 80%
  do caminho (a carta difícil de um draft forte já nasce no topo da fila).
  Ranqueado continua igual à v2: a posição é a do ranking.
- **Teto do estreante** (`TETO_ESTREANTE` .75, `cartaComTeto` em
  `rollTable`). Cada atributo da carta, e os que vão junto (precisão,
  golpes sofridos), entra no máximo no percentil 75 da divisão. Golpes
  sofridos é ao contrário, menos é melhor, então o limite é o espelho. A
  carta continua sendo do lutador real, com a marca "teto" no atributo
  cortado, e o preço sai do valor com teto. A legenda da primeira
  montagem explica. Não consome rng.
- **Sem link de desafio na carreira v3.** Com adversário do nível de cada
  um, a mesma semente não dá mais os mesmos adversários a quem draftou
  diferente, e o dono preferiu tirar a opção. O botão "Copiar desafio"
  só aparece em carreira v1 ou v2, e link antigo continua abrindo nas
  regras dele.

**Por que .75 no teto e não .85.** Com menos nocaute, mais lutas vão aos
juízes, e lá o volume de golpes do draftado pesa. Medido no `balanco`, com
fator .24 e desvio .05:
- teto .85: 12,3 a 13,4 vitórias em 22, e o cinturão do ousado chegou a 22%,
  acima do teto de 20%;
- teto .80: 12,1 a 13,3 vitórias, cinturão até 20%;
- teto .75: 11,5 a 12,3 vitórias, cinturão de 0% a 14%.

**O limite da adaptação.** Diagnóstico de 24 estreias com os valores
finais: em 21 delas o draftado vence até o melhor sem ranking (59% de
chance, em média), então a estreia já sai no topo da fila, com as três
cartas entre 50% e 60% de chance. Deixar mais difícil que isso pediria
ranqueado na estreia, o que a regra não deixa. As lutas 1 a 5 ficam em 57%
a 70% de vitórias, conforme o jeito de jogar (eram 72% a 80%). Vitória por
nocaute no 1º round caiu de 15% a 22% pra perto de 5% por luta.

**Testes (suíte `regras`):**
- nenhuma carta da v3 passa do teto, alguma bate nele, e a v2 continua sem
  teto;
- sem ranking, o adversário acompanha o nível (um jogador mais fraco
  começa mais embaixo), sem ranqueado na estreia;
- a luta da carreira roda com `KO_CARREIRA` nos dois lados;
- a chance das cartas usa o mesmo fator (comparado em 12 adversários,
  com pelo menos um em que o fator muda a chance);
- `simulateFight` sem o fator não muda;
- com fator 0 não sai knockdown nenhum;
- a v2 usa 1;
- carreira nova grava `regras: 3`, e link `r=2` continua na v2.

A suíte `hub` confere que o fim da carreira v3 não tem "Copiar desafio" e
que a v2 continua com ele. Dente provado quebrando cada peça (a luta sem
o fator, a escada sem `posicaoParelha`, a chance das cartas sem o fator).

**Efeitos colaterais medidos:**
- com o teto, a carta cara custa menos, e o bolso zera bem menos: no teste
  de orçamento (2.160 drafts, três jeitos de escolher), 4% precisaram da
  carta mínima. O teste de tela do orçamento roda na v3 e na v2, pra
  continuar passando pela carta mínima;
- cards de momento por carreira (automático, 30 carreiras): 2,0, contra
  3,0 em produção na v2;
- a tabela de raridade das conquistas (`TAXA_MEDIDA_CONQUISTAS`) foi
  medida de novo (150 carreiras, normal; lenda à parte). A anterior era
  de antes das regras v2 e já estava errada em produção: Vidro aparecia
  lendária com 4,7% e saía em 80%. Na v3 sai em 43%, e Lenda coroada, que
  aparecia com 66,3%, sai em 1,3% no modo lenda.

**Card e conquista de nocaute rápido: o 1º round inteiro (2026-10-05).** O
dono deu 6 nocautes no 1º round sem ver o card. Medido em 19.890 lutas: o
motor anda de 15 em 15 segundos e acumula dano, e só 6% dos nocautes do
1º round saem antes de 1 minuto (o limite antigo).
- Primeiro o limite foi pra 2 minutos (27% dos nocautes do 1º round).
- Com o nocaute da carreira v3 em 33%, o card quase sumiu: 1 em 30
  carreiras do automático, e a conquista "Mão rápida" em 9%.
- `KO_RAPIDO_SEG` virou 300, o 1º round inteiro, que agora é raro de
  verdade (perto de 5% das lutas).

A frase muda com o tempo:
- até 1 minuto, a do locutor;
- até 2 minutos, a do relógio;
- depois, "ainda no primeiro round".

O rótulo mostra o tempo ("NOCAUTE EM 40s", "NOCAUTE EM 4:45"), e a
conquista diz "Vença por nocaute no primeiro round". Não mexe em sorteio,
então vale pra toda versão. O teste do bônus da noite usava nocaute no
1º round e passou pro 2º, porque só um card sai por luta e o nocaute
rápido ganha do bônus.

**Rever narração (2026-10-05).** Na tela de vitória ou derrota, o botão
"Rever narração" abre a narração inteira da luta, com o mesmo desenho e a
mesma fonte do Cartel (`reg.narracao`, `htmlNarracao`). Ela começa
fechada, e o botão vira "Esconder narração". Funciona também na carreira
retomada no resultado. Suíte `hub`.

### Plano de luta a cada round (2026-10-04)

**Pedido do dono, em dois tempos.** Primeiro: as lutas da carreira tão
interativas quanto as do JxJ (testado no localhost). Depois de jogar: "as
ações escolhidas têm que aparecer no que acontece na luta, em negrito, e
alterar a luta pra melhor ou pra pior; mais didático e intuitivo". Foi pro
ar junto com a segunda parte.

**Escolha.** Antes de cada round (o 1º inclusive, depois da entrada), o
plano abre com 4 opções de `ACOES_LUTA`, escolhidas por `quartetoDoRound`:
- a situação do round anterior decide a pool (`sinalDoRound`);
- o `escolhaRng` sorteia;
- um eixo diferente por opção sempre que dá;
- nada se repete do round anterior.

Cada carta mostra o que o plano faz, quanto ele custa e o seu número no
eixo. Uma linha explica a regra. O automático não abre o plano e não gasta
o gerador.

**O que o plano faz** (`PERFIL_PLANO`, aplicado por `aplicarPlano` só
naquele round, em cima da base):

| eixo da ação | eficácia (× mod) | esforço | custo |
|---|---|---|---|
| volume (`slpm`) | volume de golpes | | defesa de golpe × 0,965 |
| poder (`kdAvg`) | chance de derrubar | | volume × 0,95 |
| defesa (`strDef`) | defesa de golpe | | volume × 0,925 |
| queixo (`durability`) | resistência | | volume × 0,95 |
| queda (`tdAvg`) | acerto da queda (`tdAcc`) | tentativas × 1,35 | volume × 0,95 |
| defesa de queda (`tdDef`) | defesa de queda e levantar do chão | | tentativas de queda × 0,8 |
| finalização (`subAvg`) | acerto da finalização (`subAcc`) | tentativas × 1,35 | volume × 0,96 |

O mod (`modificadorAcao`) vem do confronto escondido: o seu número no eixo
contra o contra-atributo dele. Rende mais se ele é fraco nisso e menos se é
forte, até abaixo do normal. `K_ESCOLHA_LUTA` subiu de .50 pra .70.

Três eixos novos no motor (`tdAcc`, `subAcc`, `levantar`) ficam em 1 fora
do plano. Sem plano, a luta é a mesma bit a bit (`driverluta`, `desafio`).

**Na narração:** linhas de tipo `plano`, em negrito, com faixa dourada e o
ícone de alvo no lugar do relógio. Saem do `narradorDoPlano`, com as frases
de `FRASES_PLANO`:
- no começo do round: "Plano de Kayo Brasa: castigar a perna de Jared
  Gordon.";
- nos eventos do motor que são do plano: "Kayo Brasa castiga a perna de
  Jared Gordon, que já pisa torto." ou "Kayo Brasa tenta castigar a perna,
  mas Jared Gordon tira a perna e acerta antes.";
- no máximo um certo e um errado por round. Knockdown, queda e finalização
  do plano sempre aparecem;
- no fim do round, o resultado em números e o que ele ensinou: "Resultado
  do plano Buscar a dupla: não deu certo, 0 quedas em 2 tentativas. Jared
  Gordon é forte justamente nisso.";
- se a luta acaba pelo plano: "O plano Buscar o nocaute decidiu a luta.".

O motor manda o evento em dado (6º argumento do `push` em `simularRound`),
sem consumir rng. As linhas ficam no log e no Cartel. Quem lê o log filtra
pelo tipo (`rd`, `kd`, `big`, `fin`), então elas não contam como knockdown,
queda nem round. O texto delas entra no `textoDoLog`: a entrevista pode
citar o chute na perna que a narração contou.

**Calibração** (`node testar.js gapinterativa`, 3000 pares; vitórias do
lado que escolhe):

| política | KO | FIN | DEC | vitórias |
|---|---|---|---|---|
| sem plano | 34,0 | 19,4 | 46,6 | 51,7% |
| plano ao acaso | 33,6 | 20,2 | 46,3 | 50,9% |
| sempre o melhor | 34,6 | 20,4 | 45,0 | 54,4% |
| sempre o pior | 34,6 | 19,4 | 46,1 | 46,2% |

Sempre o melhor contra sempre o pior: 1,79 vitória em 22. A suíte reprova
se:
- o nocaute passar de 35% em qualquer política;
- o melhor plano não render 1 ponto acima de lutar sem plano;
- o pior não ficar 2 pontos abaixo;
- a diferença entre eles não passar de 1 vitória.

Com K .50 e o custo inteiro, ficava assimétrico (melhor +0,5, pior −6,7).

**Painel "Na luta":** os knockdowns estavam trocados desde a fase 5. O
motor conta em quem caiu, e o painel mostrava isso do lado de quem caiu;
agora mostra quem derrubou, igual ao Cartel.

**Save:**
- `PENDENTE.escolhas` guarda o plano de cada round, com `v: 2`;
- entrada sem `v` (save de antes) aplica só o mod no eixo, como era;
- save com a escolha única antiga refaz a luta antiga: round 1 neutro e a
  escolha do round 2 ao fim.

**Testes:**
- `lutainterativa`:
  - plano por round, rodízio, perfil aplicado sem herdar o round anterior;
  - narração e Cartel com intenção e resultado;
  - painel de knockdown;
  - narrador nos eventos certos;
  - o plano muda a luta;
  - automático intacto.
- `gapinterativa`: a calibração acima.
- Adaptadas: `interface`, `save`, `hub` e `balanco` (escolhe o plano nos
  perfis manuais).

## Progressão do lutador

O treino é **permanente**, e por isso precisa de teto. Sem ele, 22 camps de +10%
viram +700% e a calibração toda vai embora.

Cada atributo tem um multiplicador que começa em 1.00 e satura em
`TETO_TREINO`. O ganho de cada camp é proporcional ao que **falta** para
o teto, então o primeiro camp rende a maior parte do ganho e os últimos quase
nada — evolução de atleta, não escada infinita.

**`TETO_TREINO` é 1.10 desde o balanço de 2026-09-28 (ver "Balanço").** Histórico: **era 1.26, baixado para 1.18 em 2026-09-06.** Motivo:
investigando por que 69,6% das carreiras conquistavam o cinturão (medido em
500 carreiras, sem tocar TUNING/WEIGHTS), a decomposição mostrou que nem a
escada de adversários se autocompensando (efeito ~nulo, banda fixa deu
72,0%) nem `CHANCE_DISPUTA` (96% dos elegíveis recebem a disputa, mas só
depois de já estar elegível) explicavam a facilidade — era o treino:
congelado em 1.0, o título caía pra 28,6%.

Isso levantou a pergunta certa antes de decidir o conserto: a vantagem está
no FORMATO da curva (retorno decrescente entrega quase tudo nos primeiros
camps) ou na ALTURA do teto? Medido separando os dois — teto em 1.26/1.18/
1.12 contra o primeiro camp cortado pela metade com o teto intacto — a
resposta foi clara: cortar só o primeiro camp não mudou o título em nada
(70,0% com e sem o corte, idêntico), enquanto baixar o teto teve efeito
real e monotônico (1.26→70,0%, 1.18→60,6%, 1.12→51,0%). **A alavanca é a
altura do teto, não o formato da curva.**

Escolhido 1.18 (não 1.12): título continua acontecendo pra maioria das
carreiras (60,6%), sem esvaziar a fantasia de progressão — 51% começaria a
tornar o cinturão raro, não só difícil.

Efeito em vitórias remedido no teto novo (400 carreiras, mesmo protocolo
com/sem treino): **1.26 → +2,0 vitórias em 22** (reproduz o +1,9 já
documentado, dentro da variação de amostra) · **1.18 → +1,5 vitórias em
22**. `node testar.js pesos` confirmado sem mudança — `TETO_TREINO` não
entra em `WEIGHTS`.

A claim antiga "leva o pico de top 11% para top 2%" não foi remedida nem
recolocada aqui: tentei, e `st.peak` satura em 1.0 pra boa parte das
carreiras (mesmo achado que já tinha derrubado `topo_da_divisao` de
`peak>=.98` pra `bestBeaten>=.90` — ver "Conquistas"), então percentil de
`peak` não é régua confiável. Se precisar de novo, medir por `bestBeaten`
ou standing médio, não por pico.

```bash
node testar.js treino     # o teto segura no pior caso?
```

### Três camadas separadas

`base` (o draft, nunca muda) × `treino` (permanente, com teto) × `eventoMod`
(efeitos de evento e dilema). Se o evento escrevesse direto no atributo, ele
apagaria a base e o treino perderia a referência.

A ficha lateral mostra as três: barra clara é a base, barra verde é o ganho.

### Lesão

Vive na camada `eventoMod`, não numa quarta camada — a lesão é só mais um
multiplicador nesse mesmo lugar, escrito e lido do jeito de sempre. O que é
novo é `st.lesao`: metadado (nome, atributo, duração) pra mostrar na ficha o
que os outros multiplicadores de `eventoMod` nunca precisaram mostrar.

**A magnitude é do jogo, não da IA.** `st.eventoMod` já entrava em
`statAtual()` → `lutadorEfetivo()` → `simulateFight()` antes disso — um
efeito de dilema já mudava a luta. O problema era que `lim(j.efeito,.90,1.10,1)`
travava o dilema em ±10%, enquanto `lim(j.seguidores,-.35,.60,0)` deixava a
fama cair até 35%: o jogo punia muito mais fama do que capacidade, e a ficha
só tinha ramo positivo (`ganho>0.005`), então mesmo esse ±10% ficava invisível
quando negativo.

Medido (400 carreiras, peso-leve, `candidatos()`/`simulateFight()` reais, do
jeito que o `TETO_TREINO` foi medido): mesmo ±10% aplicado à carreira inteira
custa só ~0,25-0,28 vitórias em 22 — imperceptível se for temporário (3-8
lutas). A tabela usada:

| tipo | severidade | duração | custo medido |
|---|---|---|---|
| temporária | -50% | 8 lutas | ~0,7-0,9 vitórias |
| permanente | -25% | carreira toda | ~1,0 vitória |

**Remedido com treino SOLTO (não congelado), achado jogando: o jogador viu a
% cair sozinha e suspeitou de diluição.** 300 carreiras, camp fixo mirando o
MESMO atributo da lesão (o cenário onde a suspeita seria mais provável de
se confirmar): custo ficou em **1,06 vitórias em 22** — bate com a medição
original, não diluiu. O multiplicador (`eventoMod`) nunca muda; o que
mudava era só a EXIBIÇÃO — `ganho` comparava `statAtual()` (base×treino×
eventoMod) contra a base CRUA, então conforme o treino sobe rumo ao teto
(`TETO_TREINO`), esse número combinado sobe junto e enterra visualmente o
efeito fixo da lesão. O bloco LESÃO na ficha agora mostra a magnitude
travada (`st.lesao.mult`, nunca recalculada), separada do badge por
atributo (que continua mostrando o combinado — informação legítima
diferente, não substituição).

**Vermelho não é exclusivo de lesão, de propósito — e o jogador achou isso
ambíguo jogando.** Um evento comum negativo (dilema, evento aleatório)
pinta o mesmo `.dn` vermelho que uma lesão pintaria, porque os dois são só
`ganho<-0.5%`. Decisão: continua assim — esconder perda comum seria
esconder informação real. O que faltava era uma SEGUNDA pista que não
dependesse de cor: o nome do atributo (`.atr .r`) fica em negrito quando
`st.lesao.atributo===k`, funciona pra quem não distingue vermelho de outra
cor.

Por isso a IA (`julgar`, em `api/ai.js`) só **classifica** — `permanente` (sim
ou não) e qual `atributo` — e o jogo aplica o número da tabela acima. Deixar a
magnitude com a IA não funcionava: em 40 desfechos reais medidos pro filtro de
resultado de luta (ver "Como foram equilibrados" mais abaixo), o `efeito` que
ela devolvia ficava quase sempre perto de 1.0, mesmo em cena dramática — não
dava pra confiar nela pra fazer a lesão custar de verdade. `lim()` continua
travando `efeito`/`seguidores`/`fa` no dilema comum; a tabela de lesão não
passa por `lim()` porque não é número que vem da IA.

**Uma lesão de cada vez.** `st.lesao` é objeto único, não lista. Uma segunda
lesão enquanto a primeira está ativa é ignorada — sobrescrever órfãzaria o
multiplicador da primeira em `eventoMod` pra sempre, e a cura (que divide pelo
`mult` guardado em `st.lesao`) dividiria pelo número errado.

**A cura divide, não zera.** `st.eventoMod[atr]` já acumula multiplicativo —
um evento comum pode ter mexido no MESMO atributo antes ou depois da lesão.
`st.eventoMod[atr]=1` na cura apagaria esse outro efeito junto; a cura de
verdade é `st.eventoMod[atr]/=st.lesao.mult`, que desfaz só o que a lesão
escreveu. `node testar.js lesao` prova os dois lados: bônus de evento
sobrevive à cura, e segunda lesão não pisa na primeira.

**Recusar tem custo em ranking, fixo — não vem da IA.** `st.standing` nunca
tinha sido tocado por dilema antes disso. Quando o jogador evita o risco
(`evitouLesao`), `standing` cai 0.06 sempre — não dá pra confiar num número
livre da IA pra uma mecânica nova que a stakes real do jogo depende. A fama
(`seguidores`/`fa`) continua saindo da IA como sempre, só que o prompt agora
avisa: recusar é prudente, não "decisão burra" — mas não é neutro, custa fama
de verdade (fã de MMA valoriza quem arrisca o corpo).

**A ficha respeita quantas lutas realmente sobram.** Uma lesão de 8 lutas que
começa na luta 18 (numa carreira de 22) não cabe — o texto mostra "dura até o
fim da carreira" em vez de prometer uma cura que a carreira não alcança.

**Dois eventos locais (`EVENTS`) narravam lesão de verdade sem passar por
`st.lesao`.** Achado jogando: "o joelho de X travou no meio do camp, o
médico falou em cirurgia" e "X machucou a mão e escondeu da comissão" —
escritos antes do sistema de lesão existir, nunca migrados. Tinham efeito
mecânico real (`fx`, um `eventoMod` comum), só que a narrativa prometia
cirurgia/ocultação e o jogo nunca aplicava lesão nenhuma — mesma classe do
`RESULTADO_LUTA`: texto afirmando o que o motor não produziu. Reescritos
pra descrever fadiga/semana ruim de camp, sem palavra de lesão, mantendo o
mesmo `fx`. `node testar.js resultado` ganhou uma checagem varrendo
`EVENTS` inteiro contra um vocabulário de lesão (médico/cirurgia/escondeu
da comissão) — não é a regra geral (isso seria o `node testar.js
coerencia` proposto), só os dois casos concretos, pra não voltar por
acidente. **`EVENTS` foi removido inteiro em 2026-09-06** (substituído
por eventos gerados pela IA, ver "Eventos por IA" mais abaixo) — a
checagem específica saiu junto, o filtro que importa agora é o mesmo
`CONTEUDO_INSEGURO`/`RESULTADO_LUTA` do dilema, aplicado à saída da IA.

**Não existe portão `houveLesao` — e o motivo de ter sido tentado e revertido
é o registro mais importante deste bloco.** Um jogador jogou uma carreira de
verdade, chegou numa cena claramente de lesão ("Costela tá solta"), aceitou
lutar machucado, e nada aconteceu: sem bloco na ficha, atributo em verde. A
suspeita — os dois pares do JSON (`lesao` e `atributo`/`efeito`) competem, e o
par antigo ganha por ter mais peso implícito no prompt — parecia certa e tinha
um mecanismo plausível (ordem de geração do JSON, autoregressiva). Um portão
foi desenhado: `houveLesao` na frente do schema, decisão obrigatória antes do
resto.

Só que a medição que "confirmou" o problema nunca tinha saído do arquivo
local. `api/ai.js` é função serverless da Vercel — editar o arquivo não muda
nada em produção até alguém rodar o deploy, e nesta sessão ninguém tinha
rodado. Toda chamada a `julgar` durante a investigação bateu numa versão de
~17h atrás, sem `lesao` nem `evitouLesao` nenhum. O "0/7 não virou lesão" não
media a IA escolhendo o caminho antigo — media um campo que não existia no
servidor. Confirmado direto (`curl` no endpoint): a resposta real não tinha
os campos novos.

Depois do deploy de verdade, medido o prompt SEM portão, direto: **8/8** nas
cenas de lesão, **0/34** válidas nas sem lesão. O prompt já funcionava —
`houveLesao` foi revertido, do client e do prompt. O que ficou: a IA
ocasionalmente preenche `lesao` E o par `atributo`/`efeito` antigo ao mesmo
tempo (visto em 3 das 8 respostas medidas, apesar do prompt pedir pra não
fazer isso) — o jogo ignora isso de propósito, só a validade do objeto
`lesao` decide (`node testar.js lesao` cobre esse caso e o inverso).

A lição que fica, registrada também no `CLAUDE.md`: medição contra a API real
só vale depois de deploy confirmado. `api/ai.js` é o arquivo mais frágil do
projeto — sem teste, fora do `node testar.js`, só verificável contra a API
depois de subir. O deploy é do dono do projeto, não de quem edita o arquivo.

**O que ainda falta (não implementado nesta rodada):**

- **Lesão por nocaute.** Escopo cortado de propósito — nocaute→lesão precisa
  de uma chance nova (proposta inicial: ~30%, chute não medido) e um stream
  de `rng` próprio (`lesaoRng`, nunca o `rng` principal, mesmo motivo do
  `holdRng`). Fazer os dois de uma vez — chute de chance não medido + schema
  novo do `julgar` + prompt + ficha — era palpite demais numa mudança só. Ver
  `PENDENCIAS.md`.
- **Classificação da lesão não é reproduzível pelo link de desafio.** `permanente`
  e `atributo` vêm da IA (`j.lesao`), então a mesma semente com as mesmas
  escolhas de texto pode classificar diferente em duas aberturas do mesmo
  link — isso já era verdade pra `j.atributo`/`j.efeito` antes (não é
  regressão), mas o desvio máximo subiu de ±10% pra -50%: antes dificilmente
  virava resultado de luta diferente, agora pode. `node testar.js desafio`
  roda sem rede, então não vê nada disso — é cego a essa classe de
  divergência por construção, com ou sem lesão. Ver `PENDENCIAS.md`.

### Desfecho mais longo (2026-09-11)

Pedido explícito: a consequência da escolha do jogador (`desfecho`, campo
do `julgar`) é a parte mais interessante do jogo e estava curta demais —
2 a 4 frases, limite herdado de quando precisava caber no card
compartilhável. `j.desfecho` NUNCA aparece em nenhum card de imagem (só
inline, na caixa `.dil-o` da narração — conferido antes de mexer, os
cards de momento usam frases template próprias, não o texto da IA) —
o limite de tamanho não tinha mais motivo pra existir.

Prompt (`api/ai.js`, `julgar`) mudou de "2 a 4 frases" pra "6 a 10
frases", com duas travas escritas explicitamente contra os dois jeitos
de estragar espaço extra: proibido abrir resumindo/repetindo a decisão
que o jogador já escreveu (a cena começa direto na consequência) e
proibido "encher linguiça" — cada frase nova tem que adiantar a cena
(reação de alguém, detalhe, complicação, virada), nunca repetir o mesmo
fato com outras palavras. O ramo de conteúdo inseguro fica de fora da
regra nova, de propósito (documentado no próprio prompt): esticar um
desfecho vazio até 10 frases chamaria mais atenção que um curto, não
menos — contradiria a razão de ser desse ramo.

Cliente: `.dil-o` nunca teve `max-height` (cresce com o texto,
container de narração já rola — `box.scrollIntoView()` já existia).
Só o cap de exibição em JS precisou subir, de 500 pra 2000 caracteres
— 500 cortava no meio da 3ª/4ª frase de um desfecho normal agora; 2000
é rede de segurança contra resposta fugindo do tamanho pedido, não um
teto que o uso normal deveria tocar.

**`usage` ecoado em toda resposta de sucesso do `api/ai.js` — ficou
como diagnóstico permanente, não só desta medição.** Motivo de existir:
é a única forma de acompanhar custo real por carreira sem abrir o
painel do OpenRouter. Como ler: qualquer resposta `{ok:true,...}` do
proxy vem com `usage:{prompt_tokens, completion_tokens, total_tokens,
cost, ...}` — `cost` já vem em dólar, direto do OpenRouter, não precisa
calcular a partir da tabela de preço do modelo (que muda se o `MODEL`
mudar). Pra medir um `kind` específico: chamar `https://octogono.fun/api/ai`
direto (`curl`/`fetch`, sem passar pelo jogo) com o `kind`/`data` de
interesse e ler `j.usage.cost` da resposta — foi assim que a tabela
abaixo saiu, sem tocar em `vercel logs` nem no painel do OpenRouter.
Só diagnóstico: nada no client nem no proxy DECIDE nada a partir deste
campo, é só o que sai ecoado de volta.

**Custo em token, medido contra produção, antes e depois do deploy**
(mesmo protocolo, chamadas reais de `julgar`):

| | antes (2-4 frases) | depois (6-10 frases) | delta |
|---|---|---|---|
| `prompt_tokens` médio | 1882 (n=10) | 2113 (n=20) | +231 (+12%) — a instrução ficou maior |
| `completion_tokens` médio | 98 | 196 | +98 (+100%) |
| custo médio/chamada | $0,000036 | $0,000045 | +$0,000009 |

**Por carreira, o número certo não é o "~25 chamadas" que apareceu no
pedido** — esse total inclui `dilema` (gera a cena), `evento` (1-2
frases, sem escolha) e `feed`, nenhum dos três mudou de tamanho.
Só `julgar` ficou mais longo, e `julgar` roda **4 vezes por carreira**
(uma por dilema — fightNo 5/10/15/20, `TOTAL_FIGHTS=22`, não 25).
Custo adicional real: **4 × $0,000009 ≈ $0,000036 por carreira** — em
cima de um total de carreira já medido em ~$0,0013 (`PLANO-LANCAMENTO.md`),
é ~3% a mais, irrelevante pro teto de gasto.

**Qualidade, não só tamanho — 20 desfechos reais julgados um a um**
(critério: quantas frases NOVAS a resposta introduz — reação de
terceiro, detalhe concreto, complicação, virada — contra quantas só
repetem o mesmo fato já contado):

- **17 de 20 (85%) usam o espaço de verdade** — múltiplos beats
  distintos, sem repetir fato. Exemplo (cena: companheiro se machuca no
  sparring): ambulância chega → jogador acompanha na maca → médico
  examina → diagnóstico (fratura leve) → jogador paga a conta → volta
  ao treino mais cuidadoso → torcida comenta a atitude. Sete fatos
  diferentes, nenhum repetido.
- **1 de 20 (5%) é enrolação de verdade** — cena "ignora a queda de
  seguidores e segue postando normal": 8 frases dizendo a MESMA coisa
  sete vezes com sinônimos diferentes ("não voltaram" / "ficou parada"
  / "ninguém comentou" / "nem ligou" / "seguiu igual" / "se manteve
  estática" / "nada novo aconteceu"). Isso é exatamente o risco que a
  trava do prompt tentou evitar, e vazou numa decisão sem nada de
  concreto pra narrar — hipótese: decisão "neutra" (sem consequência
  real) é o cenário onde o modelo mais recorre a padding, porque não
  tem fato novo genuíno disponível. Amostra de 1 é pouco pra confirmar,
  registrado pra quem remedir com N maior.
- **1 de 20 (5%) reabre a decisão antes de narrar** (a trava contra
  isso não é absoluta) — cena da entrevista coletiva, a 2ª frase
  basicamente reafirma a resposta que o jogador já tinha escrito antes
  de seguir adiante. Único caso claro nos 20; o resto começa direto na
  consequência.

**Achado que importa mais que os dois acima, fora do que foi pedido
medir, mas achado medindo isto: `RESULTADO_LUTA` vazou uma vez.** Cena
de aceitar uma luta de última hora, desfecho de 9 frases — as duas
últimas: *"No terceiro round, um soco limpo que ecoou na arena inteira.
Ele despencou no tapete e não levantou no tempo certo."* Isso afirma o
resultado de uma luta — exatamente o que `RESULTADO_LUTA` existe pra
impedir — mas não bate na lista fechada de palavras do regex (nenhum
"nocaute", "ko", "finalizou", "parou a luta" ali). Espaço extra deu
espaço pra IA "mostrar, não contar" o nocaute com vocabulário novo, sem
passar pela palavra que o filtro conhece. Achado com N pequeno (1 caso
em 20), mas é o tipo de furo que a filosofia do próprio filtro já avisa
que pode existir ("vocabulário fechado" é aposta, não garantia) —
registrado aqui, **não corrigido nesta leva**: mexer em `RESULTADO_LUTA`
é decisão sobre um filtro que já protege outra coisa (o próprio dilema
antes desta mudança), fica pra quem decidir se corrige direto ou
remedir com N maior primeiro.

```bash
node testar.js conteudo   # RESULTADO_LUTA continua cobrindo o dilema (regressão futura pegaria aqui)
```

**Remedido com N maior, mesmo dia — o vazamento de `RESULTADO_LUTA` era
ruído baixo, não tendência.** Pedido explícito: 1 em 20 podia ser
ruído, e ampliar o léxico do regex tem custo medido nesta sessão
(`CONTEUDO_INSEGURO` largo bloqueou 41,7% de respostas normais — ver
seção abaixo). Alvo: ≤5% deixa como está e registra; >15% force
conversa, provavelmente resolvida no prompt, não no regex.

**51 chamadas reais de `julgar` (rede caiu em 9 das 60 tentadas — falha
de rede pura, contabilizada fora, não é motivo de fallback pra medir
aqui), cenas variadas cobrindo os 8 temas de seed do dilema:**

| medida | resultado | decisão |
|---|---|---|
| `RESULTADO_LUTA` vaza (narra resultado de luta fora da lista fechada) | 1/51 (≈2%) | dentro do alvo ≤5% — **deixa como está, registrado** |
| muleta de atmosfera banida aparece (mesmo com a proibição explícita) | 2/51 (≈4%) | baixo, ambos isolados (1 frase de 7-8 no desfecho, resto concreto) — sem ação |
| reabre a decisão do jogador antes de narrar | 0/51 (0%) | trava funcionando — melhor que o 1/20 da rodada anterior |

Único novo caso de vazamento de `RESULTADO_LUTA` nesta leva (cena:
sparring puxado, contexto de treino — `CONTEXTO_TREINO` já isenta essa
frase de propósito, não é vazamento de verdade). O caso de fato contado
na rodada anterior (aceitar luta de última hora, "despencou no tapete
e não levantou no tempo certo") não se repetiu nesta amostra — 1/20 → 1/51
no total combinado (72 chamadas), a taxa cai pra ≈1,4%, ainda visivelmente
sob o alvo. **Decisão: `RESULTADO_LUTA` fica como está.** Ampliar a
lista de palavras pra fechar 1 caso em 70+ chamadas custaria mais falso
positivo (mesma lição do `CONTEUDO_INSEGURO`) do que vale o ganho.

Único caso de muleta banida citado por inteiro, pra referência de quem
remedir depois: *"Ninguém tentou conversar com ele no estacionamento,
o clima estava pesado demais pra isso."* — frase de fechamento solta
num desfecho de 7 frases, as outras 6 inteiramente concretas (repórter
nomeado, pergunta citada, manchete, reação dividida da torcida).

### Detalhe concreto, diálogo real, e nomear as coisas (2026-09-11, mesmo dia)

Pedido seguinte, mesma leva: desfecho tava vago — "atmosfera" em vez de
fato ("o clima ficou pesado", "olhar que dizia tudo") no lugar de quem
disse o quê e o que mudou de verdade. Prompt ganhou três regras
novas, nesta ordem de força:

1. **Concreto, não atmosfera** — proibidas as 4 muletas nomeadas
   explicitamente (silêncio pesado, olhar que diz tudo, clima que
   muda, ar denso); pede consequência PRÁTICA (patrocínio perdido,
   matéria publicada, reunião marcada) em vez de estado de humor.
2. **Nomear as coisas** — repórter tem veículo (nome inventado vale),
   treinador tem nome ou apelido, o que viraliza tem formato (vídeo,
   print, áudio de zap) e lugar. Medido nos 51: a maioria nomeia bem —
   `Zé da Luta` (treinador), `Combate Total`, `MMA Fight Zone`, `MMA
   Fight Club`, `ESPN Brasil`, `UOL Esporte` aparecem como veículo
   nomeado em boa parte das cenas com repórter.
3. **Referência que a IA não reconhece = piada que não pegou**, nunca
   drama inventado sobre o que ela não entende — pedido explícito do
   usuário, sem medir (não tem como forçar o modelo a "não reconhecer"
   algo de propósito num teste; fica pra confirmar jogando).

**Achado testando ao vivo, não coberto pelo pedido original: diálogo
sem fala nenhuma, e troca de pessoa gramatical no meio.** Cena com
repórter saía como narração pura ("o jornalista ficou mudo"), nunca uma
fala dele; e o desfecho as vezes ecoava a pessoa gramatical da cena/
resposta (1ª pessoa) em vez de manter 3ª pessoa sempre. Dois conserto
novos: exemplo completo de diálogo com fala entre aspas + trava
explícita de 3ª pessoa sempre, **e depois** — porque a 1ª tentativa não
bastou — regra reescrita de sugestão pra OBRIGATÓRIA.

**Medido, duas rodadas — mostra que "dar exemplo" sozinho não bastou,
precisou virar regra obrigatória:**

| versão do prompt | fala citada quando a cena tem outra pessoa |
|---|---|
| regra condicional + 1 exemplo ("se ela reage, fala de verdade") | 13/51 (25%) |
| regra OBRIGATÓRIA + contraste certo/errado explícito | 8/13 (62%), N pequeno, remedição rápida |

Confirma o padrão já registrado em "Eventos por IA" e no `CLAUDE.md`:
descrever o formato desejado (mesmo com exemplo) rende menos do que
proibir com "NÃO BASTA" explícito e um par certo/errado lado a lado.
62% é melhoria real (2,5x), não é 100% — resíduo esperado, mesma lição
de sempre: instrução nunca é garantia, só reduz. `node testar.js
dilema`/jogar de verdade é o que confirma se ficou bom o bastante na
prática.

### A luta em si não pode ser narrada — nem sem a palavra do RESULTADO_LUTA (2026-09-11)

Achado revisando o desfecho 1 da leva anterior (a que vazou do
`RESULTADO_LUTA`): não era só a PALAVRA que faltava no regex — o
desfecho narrava a luta inteira (rounds, domínio no grappling, o chute
que fechou a conta, a derrota). `RESULTADO_LUTA` foi desenhado pra
pegar palavra de um vocabulário fechado (ver "Conteúdo inseguro no
dilema" abaixo); o problema de verdade era maior: a IA escrevendo uma
luta que o motor ainda vai simular depois — se o jogador ganhar de
verdade, o desfecho já tinha mentido sobre o próprio jogo dele.

Prompt reescrito, escopo bem mais largo que "não afirme quem venceu":
proibido narrar QUALQUER PARTE da luta seguinte — round, golpe
decisivo, domínio de um lado, resultado — mesmo sem afirmar nada
explicitamente, mesmo "mostrando em vez de contando" com vocabulário
novo. O desfecho para ANTES da luta acontecer, mesmo em cenas que são
literalmente sobre aceitar lutar (luta de última hora, revanche, lutar
cansado) — narra o acordo, o preparo, a reação de quem tá em volta,
nunca o que rola dentro do octógono. Sparring/treino continua liberado
(não é a luta oficial, o motor não decide isso).

**Medido: 40 chamadas reais (37 completaram, 3 caíram em 429 de
verdade — rate limit real do pool compartilhado, não fallback
silencioso, contabilizado fora). Triagem automática por palavra-chave
(round, golpe, octógono, etc.) marcou 10 dos 37 pra revisão manual —
nenhum dos 10, lido um por um, narrava a luta seguinte de verdade.**
Todos os "achados" eram: sparring/treino (exemplo explícito da regra),
referência a uma luta PASSADA já resolvida pelo motor (a cena
perguntava sobre ela), ou menção abstrata/retórica a "o octógono" sem
narrar ação nenhuma. **0/37 (0%) — bem abaixo do alvo de 5%.** Furo
fechado.

**A trava de 3ª pessoa, reforçada pra "vale a resposta inteira", ainda
falha mais do que o esperado — achado só por ter lido os 37 por
inteiro, não pela triagem automática.** A primeira tentativa de medir
isso com regex (`\bvocê\b`) tinha um bug técnico que vale registrar:
`\b` em JavaScript (sem a flag `/u`) usa a definição ASCII de "palavra"
— `ê` não conta como `\w`, então `\bvocê\b` **nunca bate**, mesmo com
"você" escrito líteral no texto (a checagem de fronteira depois do "ê"
falha, porque nem "ê" nem o espaço seguinte contam como letra pro
motor de regex). "vocês" (termina em "s", uma letra ASCII) não tinha
esse problema — só "você" sozinho ficava invisível pra essa regex.
Achado só porque a leitura manual dos 37 (pedida também pelo usuário)
não depende de regex nenhuma.

Contando à mão, separando fala citada (onde 1ª/2ª pessoa é CORRETA —
é o personagem falando) de narração (onde só 3ª pessoa vale):
**4 de 37 (≈11%) têm narração de verdade em 2ª pessoa**, fora de
qualquer aspas — dois casos são graves, o desfecho INTEIRO troca pra
"você"/"te" da primeira frase até a última, não só uma cláusula solta
como no achado da rodada anterior. Exemplo grave (cena: acompanhar
companheiro de treino machucado):

> O carro parou na emergência e **você** saiu correndo, deixando o
> empresário reclamando no banco de trás sobre os custos do Uber. O
> médico **te** olhou de cima a baixo, anotou algo no prontuário e
> disse que **seu** companheiro tinha fratura exposta [...] **Você**
> pagou a taxa de atendimento à vista [...] mas **você** ignorou o
> celular.

**Não corrigido nesta leva — usuário pediu pra parar de medir depois
destes dois itens.** Registrado pra quem for atacar isso depois: a
mesma lição já provada nesta sessão pro diálogo (regra descrita não
bastou, precisou de contraste certo/errado explícito) provavelmente se
aplica aqui também — a trava atual só DESCREVE a regra ("sempre 3ª
pessoa"), nunca mostra um exemplo ERRADO lado a lado pra comparar.

```bash
node testar.js conteudo   # ainda cobre o RESULTADO_LUTA/CONTEUDO_INSEGURO do dilema
```

### Conteúdo inseguro no dilema

O texto do jogador (`resposta`, no dilema) vai direto pro prompt do `julgar`
— é a única superfície do jogo onde texto livre do jogador chega numa IA.
Achado jogando de propósito: escrever automutilação gráfica fez a IA narrar
de volta em detalhe e ainda aplicar lesão permanente. O `lim()` trava número;
não existia nada travando conteúdo.

**A defesa principal é a instrução no prompt, não o regex local.** Isso
importa registrar com todas as letras porque é fácil de inverter com o
tempo: o `RESULTADO_LUTA` (ver acima) funciona bem por regex porque o
vocabulário de "quem venceu a luta" é fechado — meia dúzia de palavras
(nocaute, decisão, finalização). Automutilação, violência gráfica e
conteúdo sexual não têm vocabulário fechado: a IA narra a mesma coisa com
outra palavra, eufemismo, ou outra língua, e regex nenhum pega tudo. Por
isso a ordem de confiança é essa, não o contrário — `api/ai.js` (`VOZ`
compartilhada + instrução específica no `julgar`) é quem carrega o peso; o
regex do client (`CONTEUDO_INSEGURO`) é rede de baixo, não o freio. Se
algum dia o prompt for enfraquecido "porque o regex já resolve", essa frase
está errada — o regex nunca resolveu sozinho, só pega o que passar da
instrução.

**Dois pontos de checagem, um deles antes de gastar a chamada.** O texto do
jogador passa por `conteudoInseguro()` ANTES de chamar `ai("julgar",...)` —
mais barato (a chamada nem sai) e não depende de a IA ter obedecido a
instrução, já que o texto nunca sai do navegador. O `desfecho` que a IA
devolve passa pela mesma função depois, como rede pro que passar da
instrução do prompt. Nos dois casos o `j` inteiro é descartado, não só o
texto — foi assim que a lesão permanente saiu junto da narração ruim no
achado original: um "j" que produziu isso não é confiável em nenhum campo,
número incluso.

**Sem recusa explicada.** O desfecho vira neutro e curto, do mesmo jeito que
uma resposta morna qualquer vira — nunca uma tela dizendo "isso é proibido".
Confirmar o gatilho na tela seria um convite a testar o limite. Isso já foi
medido falhando uma vez — ver "duas rodadas de medição" abaixo — antes de
virar regra explícita no prompt.

**O texto neutro não bastava — o NÚMERO denunciava o filtro.** Achado
jogando de novo: o desfecho genérico funcionava (nada narrado, nenhuma
pista de filtro no texto), mas a linha de efeito mostrava "+0 seguidores
+0.0 de fã" em **verde** — `j` nulo faz `dSeg`/`dFan` cair no `def=0` do
`lim()`, e `dif>=0` (zero incluso) pinta a classe `up`. Dois problemas
juntos: verde é cor de ganho e zero não é ganho (sinal errado em qualquer
caso, filtro ou não); e um padrão de "as duas métricas zeradas ao mesmo
tempo, sempre" é uma segunda assinatura do filtro, silenciosa mas
reconhecível — o mesmo problema que "sem recusa explicada" já tentava
evitar, só que pelo número em vez do texto.

Antes de decidir o conserto, medido se desfecho comum já produz efeito
zero — se produzisse, esconder a linha só mudaria a FORMA da assinatura,
não a removeria. Nove chamadas reais ao `julgar` (produção, deployada) com
respostas deliberadamente mornas/sem-graça ("não faço nada de especial",
"ignoro e sigo o dia", "aceito sem entusiasmo"): a IA nunca devolveu 0.0 —
o menor módulo visto foi 0,05 em `seguidores` e 0,10 em `fa`, sempre em
passos desses tamanhos. Em qualquer contagem de seguidores realista do
jogo, 0,05 já vira dezenas ou centenas de seguidores de diferença — nunca
arredonda pra "+0" na tela. Conclusão: o "+0/+0,0 simultâneo" não acontece
em resposta comum, então esconder a linha nesse caso é seguro — não troca
uma assinatura por outra, remove a única que existia.

Conserto: cada linha de efeito (`seguidores`, `fã`) só aparece se o valor
EXIBIDO for diferente de zero — não `dSeg`/`dFan` brutos, o que a
tela mostra depois do arredondamento (`dif!==0` pros seguidores, que já é
inteiro; `Math.abs(dFan)>=0.05` pra fã, o limiar onde `toFixed(1)` deixa de
mostrar "0.0"). Vale pra qualquer desfecho com efeito nulo, não só os
filtrados — é o que faz o caso filtrado se misturar com os comuns.
`node testar.js conteudo` cobre os dois lados: o `j` inseguro não deixa
nenhuma das duas linhas aparecer, e um efeito de verdade (não zero)
continua aparecendo normal.

**O texto também denunciava — em dois lugares, resolvidos em dois
commits diferentes.** O exemplo único no prompt do `julgar` ("Ele não
soube o que responder...") saía copiado LITERAL sempre que a IA decidia
neutralizar — medido: 3 de 5 provocações voltaram com a string idêntica,
char por char. Resolvido dando 4 exemplos de tom em vez de 1 frase pra
copiar, com instrução explícita pra nunca repetir literalmente.

Isso resolveu só a METADE que passa pela IA. O fallback LOCAL
(`aplicarDilema()`, quando `j` vem nulo — filtro pré-chamada, pós-chamada,
ou falha de rede pura, as três indistinguíveis de propósito) continuava
com uma frase fixa única, `"Você seguiu em frente..."`, sempre a mesma —
achado jogando, mesmo depois do conserto do lado da IA. `FALLBACK_NEUTRO`
(8 frases, segunda pessoa, sorteadas por `fraseRng` — stream próprio,
mesmo motivo do `holdRng`, pra não deslocar o link de desafio) resolve o
outro lado. `node testar.js conteudo` mede 10 cortes locais e exige pelo
menos 5 frases distintas.

Residual conhecido, não resolvido: o fallback local sai em SEGUNDA pessoa
("Você..."), o texto neutro da IA sai em TERCEIRA ("Ele..."). Um jogador
atento pode notar a troca de pessoa gramatical entre os dois caminhos —
sinal mais fraco que "frase idêntica sempre" (aqui são 3 causas reais
diferentes competindo pelo mesmo texto, não 1), mas ainda é sinal.

**A calibração é oposta à do `RESULTADO_LUTA` de propósito.** Lá, falso
positivo custa perder uma frase boa, e a taxa foi medida pra ficar embaixo
de ~5%. Aqui, falso positivo custa um desfecho genérico a mais — barato — e
falso negativo é o risco real. `CONTEUDO_INSEGURO` mira pegar tudo que
puder, não mirar uma taxa baixa.

**`CONTEUDO_INSEGURO` fica magro de propósito — não é "incompleto", é a
decisão certa.** A tentação óbvia depois de medir "o regex só pegou 1 de 8"
é ampliar o léxico. Não vale a pena, e o motivo é estrutural, não preguiça:
a categoria que mais importava cobrir — ameaça de violência vaga ou
implícita contra uma pessoa real — não tem como ser pega por regex sem
colidir com hype normal de MMA. "Vou fazer ele sofrer" contra o treinador e
"vou fazer ele sofrer os cinco rounds" contra o adversário na luta têm a
MESMA sintaxe e significam coisas opostas — um é ameaça de verdade fora do
octógono, o outro é provocação esportiva de sempre. Regex não vê a `cena`
junto da resposta pra saber qual é qual; o prompt vê. Contexto é exatamente
o que falta pro regex e sobra pro prompt — por isso essa categoria (e as
próximas parecidas) são só da instrução em `api/ai.js`, nunca do regex
local. Se alguém achar essa lista curta demais daqui a uns meses, o
problema não é a lista — é medir de novo com o prompt antes de mexer aqui.

**Duas rodadas de medição — a primeira achou dois buracos que a segunda
fechou.** Rodada 1 (prompt original de conteúdo inseguro): 8 provocações
(automutilação explícita ×2, eufemismo sem palavra-gatilho, violência a
terceiro com verbo fora do léxico do regex, ameaça vaga, sexual explícito,
autolesão em inglês, 1 controle de trash talk) + as 40 benignas de sempre.
Resultado: 5 de 8 casos inseguros passaram batido em algum grau — o pior,
a ameaça vaga, virou narrativa completa com **lesão real aplicada**; o
eufemismo **vazou que existia filtro** ("interpretado como conteúdo
proibido"). O regex local só pegou 1 dos 5 (o que tinha "cutelo" no
desfecho, palavra de vocabulário fechado). Reforço no prompt: categoria de
ameaça vaga/implícita nomeada explicitamente, com distinção clara do hype
esportivo; proibição direta de mencionar filtro/moderação/bloqueio no
desfecho. Rodada 2, mesmas 8 provocações + 3 controles de trash talk
novos (incluindo "vou fazer ele sofrer os cinco rounds", a mesma sintaxe do
exemplo que foi pro prompt, de propósito, pra testar se a distinção
aguentava a própria fonte do risco): **7 de 7 inseguras voltaram neutras,
sem lesão, sem vazar filtro; 4 de 4 controles de hype continuaram passando
normal.** As 40 benignas: 40/40 nas duas rodadas, 0 lesão indevida, 0
desfecho caindo no texto genérico à toa — o reforço não ficou arisco com
conteúdo comum.

```bash
node testar.js conteudo     # as duas frases que produziram o achado, mais o descarte completo do j
```

### Idade e assinatura

A idade começa em 24 e anda com a carreira — 22 lutas em ~9 anos é o ritmo real
de um cartel de UFC.

A assinatura ("Queda dupla", "Mata-leão", "Cruzado de direita") sai do eixo mais
forte do lutador. É **rótulo, não golpe simulado**: o motor não tem tipos de
golpe, e inventar um seria mentir para o jogador.

### O passo para o cinturão

**Regras v2 (2026-10-04):** carreira nova fala na régua do UFC ("Vencer até
entrar no top 15 da divisão", "Você é o #7. Subir no top 15 vencendo quem
está acima", "Você é o nº 1. Mais uma vitória te põe na fila do
cinturão"); o resto desta seção descreve a v1, que continua valendo pra
save e link antigos. Ver "Carreira v2" na seção Balanço.

A ficha diz o que falta, em linguagem de UFC: sair do card preliminar, subir
vencendo quem está acima, chegar ao topo, vencer um contender, emplacar 3
vitórias. Revamp fase 5: as três primeiras faixas falam na MESMA régua da
posição que o Painel e a ficha mostram ("Chegar ao #48 da divisão", com o
número que o limiar da faixa dá na tabela daquela divisão). Antes diziam "top
5" e "ranking dos 15" numa hora em que a posição ao lado podia ser #95 de 236;
a suíte `hub` reprova se "top 5" ou "ranking dos 15" voltarem.

Os limiares de `standing` (0.35 / 0.60 / 0.80 / 0.88 + 3 vitórias seguidas)
continuam sendo o motor de verdade — são os mesmos que passam no `testar.js` e
não foram remedidos. O que mudou é que, nas duas faixas finais, o texto nomeia
gente de verdade: `RANKING.desafiante` no "vencer um contender" e
`RANKING.campeao` na disputa. Entre 0.35 e 0.80 continua sem nome, de propósito
— com 26 lutadores empatados no peso-leve nesse trecho da escada, nomear ali
fingiria uma precisão que a escala não tem.

**Campeão nomeado.** `RANKING` (`buildRanking()`) ordena o pool da divisão —
mesmo pool do `LADDER`, então respeita divisão *e* modo lenda — por
`titulos.vitorias` → `titulos.disputas` → `fights`, com quem lutou nos últimos 6
anos (`CUTOFF_RANKING = maxEra-6`) na frente de quem não luta há mais tempo.
Sem esse corte, o peso-pesado "atual" seria o Randy Couture. Medido nas 11
divisões × 2 modos: nenhum campeão sai com zero título nesse corte, e o modo
lenda nomeia os mesmos campeões do normal (`ehLenda` nunca derruba quem já é
campeão) — por isso não existe fallback pra pool pequeno, o caso não acontece.
É estático: nenhuma carreira de NPC é simulada, o cinturão só troca de mãos com
o jogador. Campeão trocando de mãos entre NPCs fica pro item 1b da lista
(cinturão interino).

**A disputa pode não vir.** Ficar elegível (`standing>.88` + 3 vitórias) não
concede a disputa na hora — cada luta elegível sorteia em `CHANCE_DISPUTA`
(hoje 0.65, chute inicial, não medido como `WEIGHTS`/`TETO_TREINO`; medido à
parte foi só a *espera*, ver abaixo). O sorteio mora num stream próprio,
`holdRng`, derivado da mesma semente mas nunca compartilhado com o `rng`
principal — se dividisse índice com ele, esse sorteio novo deslocaria toda
sequência depois dele e link de desafio antigo pararia de reproduzir a mesma
carreira. O sorteio acontece **uma vez por luta**, em `nextFight()`, antes de
existir tela ou pick automático, e fica gravado em `st.tituloEstaLuta` — tanto
`candidatos()` (o que aparece na tela) quanto `lutar()` (o que é simulado) só
leem esse valor depois. Se o sorteio morasse dentro de `candidatos()`, uma
segunda chamada por engano sortearia de novo e a chance efetiva deixaria de
ser 0.65 por luta.

Medido em 2.000 carreiras simuladas (peso-leve, escolha sempre pelo adversário
"parelho"): 87% chegam a ficar elegíveis; dessas, 95% recebem a disputa antes
do fim da carreira. Espera até a disputa vir, contada em lutas desde que ficou
elegível: mediana 0 (a maioria recebe na primeira luta elegível), p90 = 2,
p95 = 4, p99 = 7, pior caso observado = 11 lutas — metade de uma carreira de
22. E 2,8% de quem chegou a ficar elegível nunca recebe a disputa, mesmo tendo
lutas sobrando. Se esse número piorar depois de outras mudanças no motor,
vale considerar chance crescente a cada recusa em vez de só subir o valor
fixo — 0.65 por luta já garante a maioria na primeira chance; o problema é a
cauda, não a média.

**A carta travada do título ignora `fought` — de propósito.** Primeira versão
excluía o alvo (`RANKING.campeao`/`desafiante`) se ele já estivesse em
`fought`. Parecia certo — "não repete adversário" é uma regra real do jogo —
mas quebrou na prática: `lutar()` marca `fought.add(opp.name)` em vitória OU
derrota, então depois da 1ª disputa (vencida ou perdida) o campeão nomeado já
está em `fought` pra sempre. Um jogador jogou a carreira de verdade e provou o
buraco: `passoCinturao()` anunciava a disputa contra o campeão nomeado, mas a
luta 22 (marcada ★, luta de título) saiu contra outro nome qualquer — o
jogador tinha perdido uma disputa anterior contra o campeão real, e a segunda
vez que ficou elegível, o guard achou o nome em `fought` e caiu no fallback
comum. Revanche de título é o caso NORMAL do UFC, não exceção — perder pro
campeão e voltar pra reconquistar, ou defender contra o mesmo desafiante nº1
mais de uma vez, é a história. Por isso a carta travada em `candidatos()` não
tem guard de `fought`: `RANKING.campeao`/`desafiante` continuam banidos das 3
bandas comuns pra sempre (isso protege), só o caminho travado do título passa
por cima.

**Isso quebra "22 adversários diferentes" — de propósito, e o conserto foi no
teste.** O `node testar.js` protege duas coisas diferentes com o mesmo nome
antigo: a escada de matchmaking não pode repetir adversário em silêncio (bug
real, já mordeu o modo lenda uma vez — ver acima), e revanche de título não é
esse bug. `testarInterface()` agora conta distintos só entre as lutas de 3
CARTAS COMUNS; uma luta de carta única (título/defesa) pode repetir nome, mas
só se o nome repetido estiver no `RANKING.lista` (campeão + 15) desta
divisão — qualquer outra repetição continua reprovando. Se alguém tentar
"consertar" isso de volta pra "22 sempre distintos" sem ler até aqui, a
revanche de título quebra nos mesmos termos de antes.

A checagem NÃO compara contra `RANKING.campeao`/`desafiante` especificamente
— compara contra `RANKING.lista` inteiro. Motivo: rotação de contender (ver
"Rotação de contender" mais abaixo) faz "o desafiante" deixar de ser um nome
fixo — vira `RANKING.lista[st.desafianteIdx]`, que anda durante a carreira.
Checar só os dois primeiros nomes reprovaria toda defesa depois que o índice
avançasse, ou pior, passaria por coincidência se o índice parasse batendo com
`desafiante`. Checar a lista inteira é a versão que sobrevive à rotação sem
precisar ser reescrita nela.

**Perder uma defesa custa o cinturão de verdade.** Achado depois de um jogador
terminar campeão com o evento raro "Perdeu o cinturão na primeira defesa" na
tela — o evento estava certo, o estado é que não tirava o cinturão: `st.title`
nunca era zerado numa derrota, então `finishFight()` marcava a flag narrativa
mas a ficha seguia mostrando "Campeão: Sim" até o fim. Hoje uma derrota de
título (`titleFight&&st.title`) zera `st.title`, guarda quem tirou em
`st.exCampeao` (só pra texto — ficha e `passoCinturao()` nomeiam essa pessoa),
zera `st.defesas` (reinado novo começa do zero) e reseta `st.disputaLiberada`.
O reset do `disputaLiberada` precisa acontecer nas DUAS entradas de derrota —
perder a defesa (`st.title` já true) e perder a disputa antes de nunca ter
sido campeão (`st.title` ainda false) — senão a reconquista aproveita a
concessão antiga do `holdRng` e nunca sorteia de novo. `st.foiCampeao` é um
flag separado, permanente, só pra frase do `LEGACY` que fala em fato histórico
irrevogável ("${n} foi campeão da divisão", reescrita na fase 7) — precisa
continuar valendo mesmo depois de perder.

**`passoCinturao()` agora concorda com o mecanismo.** Ele nomeia o alvo nas
duas últimas faixas (texto inalterado nisso), mas só diz "vem na próxima luta"
(certeza) quando `st.disputaLiberada` ou `st.tituloEstaLuta` já garantem que
`candidatos()` vai entregar esse nome; senão diz "pode vir, ou não" — honesto
sobre a incerteza do `holdRng`. Antes ele calculava direto de `standing`/
`streakW`, sem olhar pro estado da disputa, e por isso podia prometer um nome
que o mecanismo não ia entregar.

```bash
node testar.js cinturao     # ganha o título, perde a defesa seguinte, reconquista?
```

**Rotação de contender.** Antes, toda defesa (venha quando vier) travava
sempre no mesmo `RANKING.desafiante` (`lista[1]`) — repetir era esperado,
mas repetir PRA SEMPRE não é rotação, é o mesmo furo do campeão fixo antes
do `RANKING` existir. `st.desafianteIdx` (começa em 1) avança uma posição
em `RANKING.lista` a cada defesa CONCLUÍDA, ganha ou perde — perder também
"usa" o desafiante da vez, não só ganhar. Cap em `lista.length-1`: não dá
pra rodar mais do que os 16 nomes que existem. Desafiar o campeão (jogador
sem o cinturão) nunca mexe no índice — só existe um campeão de verdade,
não rotaciona.

Consequência que precisou de correção junto: `reservados`, em
`candidatos()`, bania só campeão+desafiante das 3 bandas comuns. Com
rotação, qualquer um dos 16 do `RANKING.lista` pode vir a ser o próximo
travado — os 16 inteiros ficam de fora agora. Medido ANTES de escrever
(`node testar.js divisoes`): pior caso é peso-pesado modo lenda, pool de
49 menos 16 banidos = 33 sobrando pras 22 lutas da carreira, margem de 11
— o mesmo cenário que já quebrou a escada silenciosamente uma vez (ver "A
escada continua funcionando" acima).

**Bônus de performance da noite.** Rótulo só, nenhum número novo —
reaproveita `hype` (`hypeOf()`), que já decide fã/seguidor. `st.bonusNoite`
guarda a luta de MAIOR hype da carreira até agora, tipo `st.peak`/
`st.bestWin`: não precisa de limiar calibrado porque não é corte absoluto,
é recorde relativo — sempre existe uma "melhor luta até agora" a partir da
primeira. Aparece no relatório final (`screenReport()`) e no card
compartilhável (`desenharCard()`).

## Loja

Compras permanentes até a aposentadoria, uma vez cada por carreira,
pagas com `st.dinheiro` (que existe desde a leva do dinheiro por luta).
`LOJA_ITENS` é a lista; `abrirPainelTreinador()` (nome antigo, o painel
generalizou) renderiza uma acima da outra.

**Regra que não muda**: nenhum item toca `me.__base`. Cada um escreve
numa camada derivada que já existe — a mesma que a lesão usa
(`eventoMod`) ou, no caso do equipamento, uma chance de probabilidade
que já era constante do jogo. Item novo sem essa propriedade não entra.

**Formato de exibição, todo item** (achado jogando: o treinador antigo
não dizia o benefício, e por isso ninguém percebia que +0,05 vitórias
era pouco — ver `PENDENCIAS.md` item 21): descrição em negrito,
linguagem de jogador (classe `.item-desc`, "o que é") separada do
efeito mecânico em negrito, verde escuro (`.item-efeito`, "o que muda e
quanto", calculado das constantes de verdade — nunca um número escrito
à mão que pode dessincronizar do código).

**Regra de entrada**: todo item precisa de efeito MEDIDO (nunca
chutado) de pelo menos 0,1 vitória em 22 numa simulação de carreira
real (`candidatos()`/`simulateFight()`/`finishFight()`, não álgebra
sobre o custo isolado — o teto de 22 lutas distorce estimativa
algébrica, ver o comentário de `CHANCE_LESAO_NOCAUTE`). Preço ancorado
em `RENDA_BASE`, calibrado pelo mesmo protocolo do `CUSTO_TREINADOR`
(400 carreiras de bot ganancioso, luta em que o caixa acumulado
alcança o preço — alvo mediana luta 6-8).

### Treinador melhor

`CUSTO_TREINADOR=54000`. Corta pela metade (`REDUCAO_CURA_TREINADOR`) a
duração da lesão TEMPORÁRIA de dilema — não mexe em treino, não mexe em
lesão permanente (não tem "cura" pra acelerar ali). Medido: baseline
(duração 8) custa 1,07 vitórias/22; duração pela metade (4) recupera
0,37. Escolhido no lugar de acelerar `RITMO_TREINO` (testado antes,
nunca passou de +0,37/22 — teto de retorno decrescente do próprio
`TETO_TREINO` limitava qualquer multiplicador) e no lugar de reduzir a
CHANCE da lesão de dilema acontecer (50% de chance de evitar recuperava
0,55/22, mesma ordem — mas invisível quando "quase aconteceu"; acelerar
cura é um número que o jogador vê contar mais rápido).

### Equipamento de proteção (2026-09-07)

`CUSTO_EQUIPAMENTO=42000` (mediana luta 6, dentro do alvo). Reduz
`CHANCE_LESAO_NOCAUTE` (a chance de lesão quando um NOCAUTE te derruba
— não confundir com a lesão de dilema acima, severidade própria,
`LESAO_NOCAUTE`) de .70 pra `CHANCE_LESAO_NOCAUTE_EQUIP` .45. Item
separado de propósito: mexe na CHANCE, não na severidade/duração —
essa combinação já foi calibrada pra fechar o alvo de custo (0,3-0,5
vitórias/22 de custo TOTAL desta fonte, ver comentário da constante) e
mexer nela mudaria o balanceamento medido sem pedido pra isso.

**Medido (1.500 carreiras pareadas, mesma seed com/sem o item)**:
benefício de **0,166 vitórias/22** — acima do corte de 0,1, entra na
loja. Frequência não esvaziou: com o item, a lesão ainda ocorre em
**31,8% dos KOs sofridos** (era 42,5% sem) — a mecânica continua
presente pra quem compra.

`node testar.js loja` cobre o formato de exibição (descrição+efeito
separados, número de verdade) e o fluxo de compra (desconta, marca,
desabilita sem dinheiro suficiente, rede de baixo no `onclick` — não
confia só no `disabled`). `node testar.js lesaonocaute` estendido prova
que é a CHANCE que muda: mesma rolagem de `lesaoRng` (.55) aplica sem o
item e não aplica com ele. Ambos provados com dente.

**Descartado: "Segundo técnico"** (acelerar `RITMO_TREINO` OU subir
`TETO_TREINO` via compra) — a primeira rota já foi medida e descartada
pro treinador (acima); a segunda compraria de volta exatamente o que a
leva do cinturão fácil demais tirou (`TETO_TREINO` 1.26→1.18, duas
rodadas de medição). Ver `PENDENCIAS.md` item 21.

### Empresário financeiro e Casa melhor (2026-09-07)

Nenhum dos dois muda vitória — e por pedido explícito, nenhum dos dois
é tratado como "cosmético" no card: dinheiro compra equipamento (que
muda vitória), seguidores é o placar que o jogador acompanha a
carreira inteira. O card diz o que o item faz em número, nunca um
aviso de que "não afeta o resultado das lutas" (isso soaria como a
compra ser inútil).

**Empresário financeiro** (`CUSTO_EMPRESARIO=24000`, o mais barato dos
quatro — coerente com não mudar combate): reduz pela metade só o lado
NEGATIVO de `dDinheiro` no julgar do dilema (`aplicarDilema()`); ganho
não muda. Efeito exato por construção (metade é metade), não precisou
de simulação pra confirmar magnitude — só o card precisa dizer "50%",
não só "metade", pro mesmo formato de número dos outros itens.

**Casa melhor** (`CUSTO_CASA=30000`): bônus permanente em
`followerDelta`, toda luta, vitória ou derrota. **Achado medindo**:
`followerDelta()` já cresce PROPORCIONAL ao total de seguidores
(crescimento composto luta a luta) — um multiplicador por luta parece
pequeno isolado mas AMPLIFICA ao longo de 22 lutas. Primeiro chute,
`+15%/luta`, mediu **+160% de seguidores ao fim da carreira** (400
carreiras de bot, `candidatos()`/`simulateFight()`/`finishFight()`
reais) — longe de "casa melhor", descartado antes de entrar em
produção. Recalibrado pra `CASA_FOLLOWER_MULT=1.03` (+3%/luta), que
mede **+21% ao fim da carreira** — perceptível, não quebra a curva.
Lição: item que mexe numa grandeza que já cresce composta precisa
medir o efeito ACUMULADO, não só o multiplicador isolado — a mesma
armadilha que compostas de juros sempre escondem.

`node testar.js loja` estendido cobre os dois: empresário (perda
inteira sem o item, pela metade com ele, ganho sempre inteiro nos dois
casos) e casa (delta de seguidores de uma luta batendo com
`CASA_FOLLOWER_MULT`, mesmo `r`/mesmo `rng` reseedado nos dois lados
pra isolar só o efeito do item). Ambos provados com dente.

### Item recorrente — RESOLVIDO (2026-09-11)

Achado jogando: os quatro itens acima são compra única — depois da
luta 10 (aproximadamente, com os quatro compráveis) o jogador já tem
tudo e o dinheiro perde função pro resto da carreira.

**"Consultoria de mídia"**, `CUSTO_CONSULTORIA=24000`, recorrente —
comprável de novo a cada luta em que o jogador tiver o preço em caixa
(`recorrente:true` em `LOJA_ITENS`, painel mostra "Ativa para a
próxima luta" em vez de "Adquirido" enquanto ativa, e volta a mostrar
o botão Comprar depois que a luta consome o efeito). Efeito: boost
PONTUAL em `followerDelta`, só NAQUELA luta — reaproveita o MESMO
`CASA_FOLLOWER_MULT` de "Casa melhor" (nenhum multiplicador novo pra
calibrar), só que consumido em vez de permanente.

Não pisa no território já descartado ("Segundo técnico", que mexia em
treino/vitória) — é economia/fama, mesma família de "casa melhor" e
"empresário", só que recorrente em vez de permanente.

**Preço medido, mesmo protocolo de "Casa melhor"** (400 carreiras/
preço, bot guloso comprando toda vez que tem caixa, `candidatos()`/
`simulateFight()`/`finishFight()` reais, cuidado de medir o efeito
ACUMULADO em seguidores no fim, não o multiplicador isolado — mesma
armadilha de composição já documentada acima): 10000 rende 18,3
compras/carreira e +21,5% de seguidores — empata com o efeito
PERMANENTE de "Casa melhor", preço baixo demais, o item ficaria
redundante. 24000 (mesmo preço do "Empresário", o mais barato dos 4
originais) rende 7,8 compras/carreira e +9,5% — menos da metade do
+21% de "Casa melhor", não compete com ele, e ainda dá pra comprar
bastante ao longo da carreira mesmo depois dos outros 4 itens
levados, resolvendo o "dinheiro perde função depois da luta 10".
Escolhido 24000. `node testar.js loja` cobre o consumo (1 luta só,
precisa comprar de novo) e o multiplicador (é o mesmo `CASA_FOLLOWER_MULT`,
não um número novo).

**Não mudou a curva de renda calibrada** — `RENDA_BASE` e o ganho por
`standing` continuam os mesmos; isto só abriu mais um DESTINO pro
dinheiro que já existe, não uma fonte nova.

## Regra geral: restrição negativa no prompt não é garantia

Achado testando o evento por IA (2026-09-06), mas vale pra QUALQUER
prompt deste projeto, presente ou futuro: pedir pro modelo "não faça X"
— não repita, não afirme, não mencione — reduz X, mas não impede X.
Testado direto: mandado explicitamente "não repita a situação de
nenhum destes 3 eventos recentes", com o texto exato do 1º na lista, a
IA devolveu na 3ª chamada seguinte **o mesmo texto do 1º, palavra por
palavra**, mesmo com a instrução ali na cara.

Isso não é surpresa nova, é a mesma razão por trás de toda trava que já
existe neste código: `CONTEUDO_INSEGURO` e `RESULTADO_LUTA` nunca
dependeram só de pedir pro prompt pra não fazer algo — os dois SEMPRE
vieram acompanhados de uma checagem no texto que a IA devolveu,
descartando quando a instrução falha (ver "Conteúdo inseguro no
dilema" e "Eventos por IA" abaixo). A diferença é que agora está
escrito como regra, não só como padrão implícito repetido em cada
filtro: **toda vez que o prompt disser "não faça X", o código do
cliente também precisa verificar e descartar quando X acontecer mesmo
assim — nunca só confiar na instrução.** Restrição POSITIVA ("responda
neste formato", "escreva sobre este tema") é mais confiável — o "tema
forçado" abaixo funcionou bem melhor que o "não repita" — mas mesmo
essa vale conferir quando o custo de falhar for alto.

## Eventos por IA

O pool fixo de 28 frases (`EVENTS`) repetia entre carreiras — sempre as
mesmas 28 possibilidades, cedo ou tarde toda carreira via as mesmas
piadas. Substituído (2026-09-06) por um evento gerado pela IA a cada
luta que não cai em dilema: novo kind `"evento"` em `api/ai.js`,
`dispararEventoIA()` no cliente.

**Assíncrono, sem bloquear nada** — mesmo padrão do `feed`: dispara,
não espera, aparece no log quando fica pronto. Diferente do `feed`
(que dá pra prefetch no início da luta, antes do resultado existir), o
evento só pode ser gerado DEPOIS do resultado (precisa saber se ganhou,
como, sequência) — então dispara já em `finishFight()`, sem prefetch, e
o jogador pode já ter clicado pra próxima luta antes dele resolver. Sem
problema: o efeito em `st.eventoMod`, se chegar atrasado, só vale a
partir da luta seguinte — a luta que já começou usa o estado que tinha
no início dela.

**Sem fallback local, decisão explícita.** Se a chamada falhar (qualquer
um dos motivos de `ia_null`) ou os filtros esvaziarem o texto, a luta
passa sem evento — nenhuma frase de reserva, nenhum número inventado.
RARE continua exatamente como era: local, síncrono, checado primeiro —
só o evento COMUM virou dependente de IA.

**`CONTEUDO_INSEGURO` continua valendo — `RESULTADO_LUTA` NÃO (corrigido
2026-09-06).** A primeira versão aplicava os dois filtros do dilema, sem
exceção. Medido: `RESULTADO_LUTA` cortava ~8% dos eventos por engano.
Motivo do engano: esse filtro foi desenhado pra impedir o DESFECHO DO
DILEMA de afirmar o resultado de uma luta que AINDA vai acontecer
(contradizer o motor). Evento narra uma luta que JÁ terminou — "o clipe
do nocaute viralizou" é FATO conhecido, não previsão — e o filtro não
distinguia isso, cortava a frase inteira do mesmo jeito. Aplicar o
filtro em todo lugar que a IA escreve confundia "onde ele foi desenhado
pra proteger" com "todo texto gerado" — problemas diferentes, merecem
tratamento diferente. `RESULTADO_LUTA` continua protegendo o desfecho do
DILEMA normalmente (regressão coberta em `node testar.js conteudo`).

**Retry único quando a IA devolve `ok:true` sem o campo `texto`.**
Medido: ~10% das respostas vêm assim (JSON malformado, o modelo não
obedeceu o formato — mesma classe do "array solto" que o `feed` já
tratava). Não é falha de rede/429/erro do servidor — essas NÃO retentam
aqui, `ai()` já tem sua própria disciplina de pausa/desligamento pra
elas, insistir por cima seria gastar chamada fadada a repetir o mesmo
erro. Custo do retry: ~1,8 chamada extra por carreira (10% de ~18
lutas elegíveis).

**Resultado dos dois consertos acima, medido junto**: 40/40 chamadas
reais sobreviveram (100%, contra 82,5% da primeira versão).

**Variedade — três iterações, medidas uma a uma, honesto sobre onde
ficou:**

1. *Sem tema forçado*: 42% dos eventos convergiam pro MESMO esqueleto
   ("vídeo/clipe viraliza, família ou empresário reage"). Causa: o
   prompt só SUGERIA 10 temas (imprensa, dinheiro, família, rotina de
   treino, patrocínio, redes sociais, saúde leve, vida pessoal, reação
   do público, bastidor da academia) e dava UM exemplo de frase
   copiável ("o clipe viralizou") — o modelo ancorou no exemplo em vez
   de usar o menu inteiro.
2. *Tema forçado*: o cliente sorteia 1 dos 10 temas (`EVENTO_TEMAS`,
   `eventoRng` próprio) e MANDA no prompt — não é mais sugestão, é o
   assunto central exigido. O exemplo copiável saiu do prompt. Medido:
   o colapso NUM ÚNICO esqueleto sumiu (a frase específica "vídeo do
   nocaute viralizou" caiu de dominante pra 2/40 = 5%), cada tema
   produz vocabulário genuinamente diferente. **Mas surgiu repetição
   DENTRO de cada tema**: numa simulação de carreira (40 chamadas,
   temas alternando, histórico real acumulando), alguns temas saíram
   com o MESMO giro narrativo em 3 ou 4 das 4 vezes que apareceram —
   "rotina de treino" deu "acorda com dor e treina mesmo assim" nas 4
   vezes; "patrocínio" deu "regra de vestimenta inesperada" em 3/4;
   "vida pessoal" deu "parceiro(a) reage mal" em 3/4. Contando qualquer
   cluster de 2+ dentro do mesmo tema como repetição: **~45% dos 40
   textos pertencem a algum cluster** — pior que o alvo de 15% pedido.
3. *Recentes + instrução de não repetir*: `st.eventosRecentes` guarda
   os últimos 3 textos da carreira, vão no prompt com "não repita a
   situação de nenhum destes". Reduz repetição QUASE ADJACENTE, mas não
   é garantia — testado direto (mesmo tema 3x seguidas, o 1º na lista
   de "não repita"), a 3ª chamada saiu **idêntica à 1ª, palavra por
   palavra**, apesar da instrução explícita. Modelo pequeno e rápido
   não segue restrição negativa de forma confiável — sempre foi assim
   com o modelo desta VOZ (ver Qwen3.7-flash acima), consistente com
   por que os outros filtros (CONTEUDO_INSEGURO/RESULTADO_LUTA) nunca
   confiaram só em pedir por prompt.
4. *Rede de baixo* (mesma disciplina dos outros dois filtros): se o
   texto novo bate EXATO (case-insensitive) com algum dos últimos 3,
   descarta — sem fallback, a luta passa sem evento. Fecha o pior caso
   (eco literal) mas não pega giro narrativo repetido com palavras
   diferentes — isso exigiria similaridade semântica, não comparação de
   string, e não foi construído.

**Causa raiz da repetição dentro do tema, registrada pra quem for
mexer aqui de novo**: não é prompt malfeito nem contexto pobre — é que
o modelo tem um número pequeno de "respostas típicas" por tema, e pedir
o mesmo tema de novo naturalmente resample a mesma resposta típica.
Com 10 temas e ~18 eventos elegíveis por carreira, cada tema sai em
média 1,8x — a maioria das carreiras nem chega a repetir um tema duas
vezes, e mesmo quando repete, o jogador vive isso ao longo de várias
sessões, uma luta de cada vez, não 40 textos lado a lado numa planilha
fácil de comparar (que é como esta medição foi feita) — o número de
45% provavelmente EXAGERA quão perceptível isso é jogando de verdade.
Registrado como possível próximo passo, não implementado: detecção de
similaridade semântica (não só eco exato), ou `EVENTO_TEMAS` mais
granular (sub-temas, reduz quantas vezes o mesmo balde é sorteado).

Nenhuma medição acima tem alvo numérico oficial além do que o usuário
já definiu (≤15% de repetição de estrutura) — ficam registradas pra
decisão dele (ver `PENDENCIAS.md` item 18).

### Medindo a coisa certa: 20 carreiras reais, não 40 chamadas isoladas

A medição de 42%/45% acima tinha um problema de método, não só de
resultado: 40 chamadas de `kind:"evento"` lado a lado, fácil de comparar
uma com a outra, não é como o jogador experimenta a mecânica. Ele vê UM
evento por luta, ao longo de umas 22 lutas e provavelmente várias
sessões — duas frases parecidas na luta 3 e na luta 17 não chamam
atenção nenhuma; duas parecidas na luta 8 e na luta 9 (ou 8 e 10) sim.
O número que decide se incomoda é esse, não o de comparar tudo junto.

**Dois consertos baratos antes de medir de novo** (mais baratos que
detecção de similaridade semântica, que ficou reservada como último
recurso):
- **Sorteio de tema sem reposição**: `proximoTema()` embaralha uma
  cartela com os 10 temas (`eventoRng`) e consome um a um, só
  reembaralhando quando esgota. Antes, cada sorteio era independente e
  podia repetir tema cedo por puro acaso — sem relação com a repetição
  de esqueleto medida, mas uma repetição evitável de graça.
- **Contexto real da carreira no prompt**: posição no ranking
  (`posicaoDivisao()` de verdade), lesão ativa, se perdeu o cinturão
  NESTA luta, dinheiro em caixa. A ideia: um evento ancorado no que
  está acontecendo de verdade tem menos espaço de sobra pra cair na
  resposta "padrão" genérica do tema — repete menos por construção.

**Medido com um harness que roda a carreira de ponta a ponta de
verdade** (`nextFight()`/`finishFight()`/`dispararEventoIA()` reais,
`auto=true`, dilema resolvido com uma resposta fixa via fallback local
— só `kind:"evento"` bate na API de produção; dilema/julgar/feed ficam
desligados de propósito, sem custo, sem afetar a medição do que
interessa aqui). Achado no caminho, dois problemas de MEDIÇÃO (não do
código do jogo) que valem registrar caso alguém monte um harness
parecido de novo:
1. **Pacing**: `dispararEventoIA()` é fire-and-forget de propósito na
   produção (não bloqueia a tela). Um harness automatizado que não
   espera essa promessa de verdade antes de avançar pra próxima luta
   dispara VÁRIOS eventos em rajada concorrente contra a API — isso
   sim gera taxa de falha muito maior que o normal, sem ser culpa do
   código do jogo. Precisa esperar `playing` voltar a `false` de
   verdade (não um número fixo de ciclos) e, se um evento disparou
   nessa luta, esperar a promessa dele terminar antes da próxima.
2. **Circuito de falha compartilhado**: desligar dilema/julgar/feed
   fazendo o `fetch` REJEITAR (throw) em vez de devolver uma resposta
   não-ok incrementa `falhasRedeSeguidas` do lado do jogo — 2 rejeições
   seguidas (dilema+julgar sempre andam juntos) desligam `aiVivo` PRA
   CARREIRA INTEIRA, e daí em diante todo evento (inclusive os reais)
   falha local sem nem tentar rede. Resolver com `ok:false,
   transitorio:true` em vez de rejeitar evita isso.

**Resultado, 20 carreiras completas:**
- Distribuição de tema saudável: ~176 eventos apareceram nas 20
  carreiras, os 10 temas saem bem distribuídos (16 a 20 ocorrências
  cada) — sorteio sem reposição funcionando.
- **Repetição de tema em lutas próximas (consecutiva ou 1 de
  intervalo): 4 carreiras em 20 (20%)** — bem abaixo do 45% que a
  medição isolada sugeria, mais perto do que o jogador notaria de
  verdade. Inspecionado à mão: 3 dos 4 pares realmente compartilham o
  giro narrativo (ex. "mãe liga cobrando conta" duas vezes); o 4º é só
  o mesmo tema com desfechos opostos (patrocínio caindo vs. chegando),
  que não incomodaria do mesmo jeito. Ainda acima do alvo de 15%, mas a
  distância ficou pequena. ✅ **ACEITO (2026-09-06)** — a distância pro
  alvo não justificou similaridade semântica agora; método pronto pra
  remedir num dia sem volume de teste acumulado, se voltar a incomodar
  jogando. Ver `PENDENCIAS.md` item 18.
- ⚠️ **Confundido pelo volume da própria sessão de medição**: a taxa de
  sucesso geral das chamadas caiu pra ~54% nesta rodada (era 90-100% em
  testes isolados horas antes) — quase certamente o pool compartilhado
  do OpenRouter saturando pelo volume alto de chamadas que a sessão já
  tinha feito antes desta medição (mesma causa do item "ia_null" nas
  Dívidas Conhecidas). Menos eventos por carreira reduz mecanicamente a
  chance de dois temas colidirem perto um do outro — **o 20% pode
  estar subestimado**. Vale remedir num dia sem volume de teste
  acumulado se a precisão final importar.
- **Achado incidental, fora do escopo desta pergunta** (mas o mais
  grave dos dois — consequência direta de tirar o fallback local do
  evento): um erro de rede real (não 429 — esse só pausa 60s — duas
  falhas de CONEXÃO seguidas) desligava `aiVivo` permanentemente pro
  resto daquela carreira, e evento compartilhava esse circuito com
  dilema/julgar/feed. 3 das 20 carreiras desta medição perderam TODOS
  os eventos por isso — 15% dos jogadores com carreira vazia por duas
  falhas de rede boba. ✅ **RESOLVIDO (2026-09-07)** — evento ganhou
  circuito próprio, nunca mais desliga pra sempre. Detalhes e números
  finais (0/20 carreiras zeradas, 1/20 com menos de 10 eventos) em
  "Quando a IA falha", logo abaixo.

### Dilema: mesmo tratamento anti-repetição, achado medindo coerência

Medindo coerência de cena (não repetição — ver "Regra geral: restrição
negativa..." acima pro achado de coerência em si, `PENDENCIAS.md` item
20), apareceu de graça: título **"Cheque atrasado" saiu idêntico 2
vezes em 30 chamadas isoladas**. Dilema nunca tinha o mecanismo que o
evento já tem — sorteava o tipo com reposição (`SEEDS[Math.floor(rng()
*SEEDS.length)]`, consumindo o rng PRINCIPAL a cada dilema) e não
guardava histórico de títulos.

**Mesmo tratamento do evento, aplicado ao dilema (2026-09-06)**:
`proximoDilemaSeed()` sorteia sem reposição, cartela própria
(`st.dilemaSeedsRestantes`) embaralhada com `dilemaRng` — stream PRÓPRIO,
nunca o `rng` principal (mesmo motivo do `holdRng`/`eventoRng`: sortear
aqui deslocaria a sequência e o link de desafio antigo pararia de
reproduzir os mesmos adversários). `st.dilemaRecentes` guarda os
últimos 3 títulos da carreira, vão no prompt com instrução de não
repetir, e o cliente tem a mesma rede de baixo do evento: se o título
vier igual a um recente (a instrução reduz, não garante — mesma regra
de sempre), descarta e cai no fallback local (`DILEMA_LOCAL`), não
segue com o eco. `node testar.js dilema` cobre sorteio sem reposição
(12 tipos, 12 sorteios, nenhum repetido), isolamento do `dilemaRng` (o
teste força o `rng` principal a lançar exceção se for chamado — prova
que `proximoDilemaSeed()` nunca toca nele), acúmulo/corte em 3 dos
recentes, e o descarte por eco (com controle: título novo passa
normal). Só 4 dilemas por carreira — sem reposição já garante os 4
tipos de uma carreira sempre diferentes entre si. Repetição ENTRE
carreiras (RNG diferente a cada partida nova) era possível — resolvido
abaixo, "Memória entre carreiras".

### Memória entre carreiras (2026-09-08)

Achado jogando: dilema **"A pergunta na coletiva" saiu palavra por
palavra igual numa carreira nova**, já visto numa partida anterior.
Sorteio sem reposição e "recentes" (acima) só valem DENTRO da
carreira — cada carreira nova reembaralha do zero, sem memória do que
o jogador já viu em partidas passadas.

**Medido antes de escrever o conserto** (nunca chutar tamanho de
pool): `SEEDS` (temas do dilema-IA) tem **12**, `EVENTO_TEMAS` tem
**10** — mas o caso relatado não veio de nenhum dos dois. Veio do
**fallback local** (`DILEMA_LOCAL`), que tinha só **3** itens e
NENHUM histórico, nem dentro da mesma carreira
(`Math.floor(rng()*DILEMA_LOCAL.length)`, sorteio cego). "A pergunta
na coletiva" é `DILEMA_LOCAL[0]`, texto FIXO — repetir um texto fixo
palavra por palavra é muito mais provável de 3 opções cegas do que de
dois textos GERADOS pela IA coincidindo por acaso. Diagnóstico
importa: persistir só o pool `SEEDS`/IA não teria resolvido este caso.

**`DILEMA_LOCAL` cresceu de 3 pra 8** (lista aprovada em texto antes de
escrever, mesmo padrão de `ACOES_LUTA`). 2 dos 3 antigos saíram por
sobrepor tema com `SEEDS` ("A pergunta na coletiva" ≈ entrevista/
imprensa; "O patrocínio esquisito" ≈ proposta de patrocínio duvidosa)
— fallback parecia versão pobre do mesmo dilema, não situação nova. Um
item proposto foi cortado ANTES de entrar, achado pelo usuário: uma
cena sobre esconder dor no peito premiava ignorar sintoma cardíaco
real num atleta de combate, sem a trava que lesão física tem
(`LESAO_TIPOS`/`CHANCE_LESAO_NOCAUTE`) — diferente de lesão de queixo
ou joelho, que têm mecânica de consequência; substituído por "Técnico
querendo mudar seu estilo".

**Mecanismo, os três pools** (`DILEMA_LOCAL`, `SEEDS`, `EVENTO_TEMAS`):
`cartelaComMemoria()` monta a cartela da carreira com quem está na
memória entre carreiras DEPRIORIZADO (vai por último), não excluído —
a cartela nunca fica sem opção, mesmo se a memória um dia cobrisse o
pool inteiro. `localStorage` (try/catch, como qualquer leitura/escrita
no jogo) guarda só IDENTIFICADOR — tema ou título, nunca o texto
inteiro, por pedido explícito (pouco espaço, não precisa do conteúdo
pra evitar repetir). Tamanho da memória é **60% do pool, calculado**
(`Math.round(pool.length*.6)`), não um número fixo — pool pequeno com
memória fixa grande travaria a cartela inteira sem sobra livre pra
escolher; 60% garante pelo menos 40% do pool sempre livre.

**Bug pego pela própria bateria de testes nova, antes de deployar**: a
primeira versão de `cartelaComMemoria()` colocava quem estava na
memória PRIMEIRO no array — como o consumo é via `.pop()` (tira do
FIM), isso fazia o oposto do pretendido, priorizando quem tinha
acabado de aparecer. `node testar.js memoria` pegou na hora. Um
segundo bug, no PRÓPRIO teste desta vez: a asserção de integração lia
a memória DEPOIS do sorteio que estava tentando conferir — o sorteio
já tinha marcado a si mesmo, mascarando o resultado. Corrigido lendo o
"antes" antes de agir — lição geral pra qualquer teste que meça efeito
de uma função que também muta o estado que o teste lê.

## Som

**Revamp fase 6 (2026-09-27): música e efeitos reais, com licença de uso
comercial.** O sintetizado virou rede de segurança. Plano:
`docs/superpowers/plans/2026-09-27-revamp-fase-6.md`.

**Fontes (todas CC0 ou CC BY; nenhuma NC).** Música do HoliznaCC0 (CC0, Free
Music Archive): "Nine To Death" no menu, "Busted Jazz" no hub, "Re
Adusjtment" (phonk) na noite de luta, "Pantheon" (phonk) no walkout, um trecho
de "Chills" na vinheta de derrota. Torcida de Gregor Quendel (CC BY 4.0).
Golpes, queda, interface, fichas e o acento da vinheta de vitória da Kenney
(CC0). Sino e flashes de paparazzi do BigSoundBank (CC0). Vaia da Free Sounds
Library (CC BY 4.0). Tabela arquivo por arquivo em `audio/LICENCAS.md`. A
página Créditos saiu em 2026-09-28 (pedido do dono); o crédito que a
licença obriga (os dois CC BY) fica no painel da engrenagem, junto do som,
e a suíte `som` reprova se algum autor CC BY da tabela sumir de lá. Eu (Claude) não ouço áudio: as faixas
foram escolhidas pelo gênero declarado pelo autor, BPM, loudness e curva de
energia medidos (`audio/preparar.py` imprime a tabela). **Pendente: o dono
ouvir e aprovar.**

**Como os arquivos nascem.** `python3 audio/preparar.py` (precisa de ffmpeg)
baixa as fontes pra `audio/bruto/` (fora do git) conferindo a licença na
página de cada uma, corta, faz fade, normaliza (música em -18 LUFS, efeito
por pico) e codifica 27 MP3 (7,7 MB, orçamento de 8 MB). Rodar de novo refaz
tudo igual e reescreve o `LICENCAS.md`.

**Trilha por tela.** `contextoTrilha()` é pura: menu e páginas tocam o menu;
hub toca o hub; oferta, camp, coletiva e resultado tocam a noite; entrada e
luta tocam o walkout. Na entrada o walkout vem cheio; quando a luta começa
ele continua por baixo com passa-baixa em 380 Hz e a torcida entra por cima.
Troca é crossfade de 1 s. Música vem por `<audio>` em streaming ligado ao
barramento de música (decodificar faixas de minutos custaria dezenas de MB
no celular); efeitos curtos são decodificados em buffer depois do primeiro
clique. Vinheta de vitória ou derrota abaixa a trilha e a próxima só sobe
depois dela.

**Efeitos.** A narração escolhe o efeito pelo tipo da linha e pelo texto
(`somDaLinha()`): sino de começo e de fim de round, soco leve na troca, soco
pesado no chão, baque na derrubada, knockdown com a torcida levantando,
torcida subindo na tentativa de finalização e explodindo no nocaute ou na
finalização. Vaia na derrota por decisão. Na interface: clique, hover (só
mouse), troca de aba, carta entrando na oferta e no camp, fichas na compra
da loja, som de conquista, flashes na coletiva. Variação entre golpes usa
`Math.random`: som não é jogo e nunca toca um dos 8 geradores da carreira.

**Rede de segurança.** Cada efeito tenta o arquivo e, se ele ainda não
carregou ou falhou, toca o sintetizado de sempre (Web Audio); trilha que
falha cai no bordão sintetizado. Volume de música, volume de efeitos e mudo
continuam no painel da engrenagem; o mudo zera o ganho mestre na hora e para
a música. Suíte `node testar.js som` (Web Audio e `<audio>` falsos): escolha
de trilha, efeito por linha (inclusive de luta real), sem áudio nada quebra,
arquivo que falha sintetiza, crossfade e walkout abafado, mudo, e todo
arquivo com licença, crédito e uso, dentro do orçamento.

### Sons de evento

Três sons curtos para o desfecho de eventos e dilemas: **bom** (terça maior
subindo), **ruim** (segunda menor descendo com o chão saindo embaixo) e
**neutro** (um toque só). Continuam sintetizados. A direção sai de duas
fontes, nesta ordem:

1. **Marca explícita** (`tom: 1 / -1`), usada nos eventos raros.
2. **Efeito medido**: aplica o `fx` num clone e compara os atributos.

Evento sem marca e sem efeito toca o neutro. No dilema a direção é direta,
dos números que a IA devolveu (já limitados pelo `lim()`).

### Duas regras que parecem detalhe e não são

O navegador **bloqueia áudio antes do primeiro clique**, então o `AudioContext`
só nasce quando o jogador interage (`armarTrilha()`), e a música do menu só
começa ali. Criar antes falha silenciosamente e o som nunca mais volta.

Toda chamada de áudio está sob `try/catch`. Navegador sem `AudioContext` ou com
`localStorage` bloqueado precisa jogar normalmente. O `testar.js` roda num
ambiente sem os dois de propósito: se o som derrubar a carreira, ele quebra.

(Até a fase 6 havia `audio/sintetiza.py` gerando 4 arquivos por síntese com
equalizador por banda; saíram do repositório e continuam no histórico do git.)

## Ligar a IA (opcional)

O jogo funciona inteiro sem IA. Com `AI_URL` vazio, comentários e eventos saem
dos moldes locais. A IA melhora, não sustenta.

**1. Conta e crédito no OpenRouter.** Uma conta só dá acesso a todos os modelos,
aceita cartão brasileiro, e não exige abrir conta na Alibaba Cloud.

**2. Coloque um limite de gasto na chave.** No painel do OpenRouter, ao criar a
chave. É a proteção que mais importa: se alguém descobrir seu endpoint e ficar
chamando, o limite é o que impede a conta de sangrar. Vale mais que qualquer
código do proxy.

**3. Deploy.**

```bash
npm i -g vercel
vercel
vercel env add OPENROUTER_API_KEY
vercel --prod
```

**4.** O `index.html` já vem com a URL preenchida:

```js
const AI_URL="https://octogono.fun/api/ai";
```

**Regra geral, não só pra renomear projeto: qualquer mudança de domínio
principal na Vercel pode quebrar `AI_URL` se ele continuar apontando pro
domínio antigo.** Renomear o projeto é um jeito de isso acontecer;
**adicionar um domínio customizado e promover ele a principal é outro** —
foi o que aconteceu de verdade aqui (2026-09-06): `octogono.fun` virou o
domínio principal do projeto, e o alias antigo (`draft-ufc.vercel.app`)
parou de resolver pra uma deployment válida, sem aviso nenhum. **O
sintoma é traiçoeiro: o jogo inteiro continua "funcionando" — sem
crash, sem erro visível pro jogador — porque `ai()` já foi desenhado
pra cair em molde local quando a IA falha.** A IA fica morta em 100%
das chamadas e ninguém percebe até alguém reparar que toda resposta de
dilema saiu genérica. Não existe aviso automático pra isso; o único
jeito de saber é testar. Depois de QUALQUER mudança de domínio (renomear
projeto, adicionar domínio customizado, trocar qual é o principal),
rodar:

```bash
curl -s -X POST https://SEUDOMINIO/api/ai -H "Content-Type: application/json" \
  -d '{"kind":"julgar","data":{"name":"T","cena":"c","resposta":"r","record":"1-0","followers":"1mil","fan":"5"}}'
```

Resposta esperada: `{"ok":true,"result":{...}}`. Qualquer coisa diferente
(404, HTML de erro, timeout) é este bug de novo — trocar `AI_URL` pro
domínio que está de fato resolvendo, redeploy, testar de novo.

O mesmo deploy publica o jogo e a API juntos.

### Quanto custa

O padrão é `qwen/qwen3.7-flash`, a $0,03 por milhão de tokens de entrada e $0,13
na saída. Cinco vezes mais barato que o 3.8 Flash e suficiente de sobra para
comentário curto e julgamento de dilema.

São ~30 chamadas por carreira (22 feeds mais 4 dilemas de 2 chamadas cada), a uns
400 tokens de entrada e 250 de saída cada uma. Dá cerca de **US$ 0,0013 por
carreira**, ou aproximadamente **3.800 carreiras com 5 dólares**.

Para trocar de modelo, use a variável `QWEN_MODEL` — sem mexer no código.

### Três coisas já resolvidas que é bom não desfazer

**A chave nunca vai pro navegador.** Se for, alguém abre o DevTools, copia, e
gasta na sua conta.

**Os prompts ficam no servidor.** Se o proxy aceitasse prompt livre do cliente,
viraria um ChatGPT grátis pago por você.

**Nenhum número da IA é aceito sem trava.** O jogador digita texto livre que vai
para o prompt, então alguém vai tentar pedir um milhão de seguidores. A defesa é
o `lim()` no cliente, não o prompt.

### Quando a IA falha

Confirmado rodando `api/ai.js` local com uma chave inválida de propósito
(nunca a de produção): os três pontos que chamam IA (`feed`, `dilema`,
`julgar`) já tinham fallback antes de qualquer coisa nesta seção existir —
`resolveFeed()` cai no molde local que `buildFeed()` já monta antes de
perguntar pra IA, `dilema` cai em `DILEMA_LOCAL`, `julgar` devolvendo `null`
zera os números do dilema e cai no texto genérico. O jogador não vê nada
quebrado em nenhum dos três.

**O que precisou de conserto foi a eficiência, não a corretude.** `ai()`
decide se desiste de chamar a IA pelo resto da carreira (`aiVivo=false`) ou
se cada chamada é independente — a versão antiga só desligava em `429` ou
`500` do STATUS EXTERNO do proxy, e o proxy devolve `502` pra seis situações
bem diferentes (chave errada, sem crédito, permissão, instabilidade
temporária do upstream, modelo respondeu vazio, modelo respondeu algo que
não é JSON). Chave inválida vira `502`, não `500` — o `aiVivo` antigo nunca
desligava nesse caso, e o jogo pagava um round-trip fadado a falhar em
**toda** chamada de IA da carreira inteira.

O conserto: `api/ai.js` manda `"transitorio":true|false` em todo corpo de
erro — o servidor já sabe exatamente o que aconteceu, não devia ser o client
adivinhando por número. `false` (chave, crédito, permissão, `kind`/`data`
inválido) desliga na 1ª — não se resolve tentando de novo na mesma sessão.
`true` (instabilidade do upstream, timeout do proxy, modelo com soluço numa
chamada específica) nunca desliga por essa via.

**429 é caso à parte, não `true` nem `false`.** Rate limit é justamente o que
tende a passar sozinho — e com tráfego de anúncio (`PLANO-LANCAMENTO.md`) é o
caso ESPERADO, não a exceção. Desligar a IA pro resto da carreira por causa
de 60 segundos de pico seria caro demais. `aiPausadoAte` (timestamp) pausa
sem desligar; a chamada durante a pausa nem tenta rede, mas resume sozinha
quando o relógio passar. `AI_PAUSA_MS=60000` é chute inicial, não medido —
se 429 continuar aparecendo mesmo com a pausa, é isso que precisa remedir.

**Confirmado que continua aparecendo, e pior do que se sabia (2026-09-08).**
Achado jogando: dilema aceito ("Aceito, estou precisando de dinheiro para
investir na minha carreira") devolveu frase neutra de fallback e R$0 —
igual a IA nunca tivesse sido chamada. Investigado do zero (3ª ocorrência
de "IA ignora resposta", causa raiz diferente das duas anteriores — ver
LEIA-ME "AI_URL apontava..." e `PENDENCIAS.md` item 14): `CONTEUDO_INSEGURO`
descartado (testado direto contra a regex, não bate), teto de gasto
descartado (`vercel logs` mostra 429 vindo do PROVEDOR, `is_byok:false`,
nada a ver com a conta). Medido com ritmo REALISTA (>60s entre chamadas,
cada tentativa é rede fresca, não reaproveita a pausa de uma anterior —
mesma disciplina de "Medindo a coisa certa" abaixo): **julgar caiu em
fallback em 8 de 12 dilemas (67%) em 3 carreiras reais contra
produção.** Não é o circuito do cliente cascateando — é o pool
compartilhado do OpenRouter mesmo, agora, pior do que a medição de
2026-09-06 sugeria (~27%).

**As três camadas pedidas, implementadas nesta ordem (2026-09-09)**:
1. BYOK (fora do código — passo a passo de conta dado ao usuário, ataca
   a causa raiz de verdade).
2. Circuito PRÓPRIO de dilema+julgar (`dilemaPausadoAte`/
   `dilemaFalhasSeguidas`), nunca o de feed — mesma ideia do evento,
   com uma regra MAIS FORTE: **julgar nunca respeita a própria pausa**.
   Se a cena já apareceu na tela, o jogador já escreveu — pausar o
   julgamento no meio É o "você seguiu em frente e nada aconteceu" que
   motivou tudo isso. Só `dilema` (a geração da cena, ANTES de existir
   resposta) respeita a pausa; os dois ainda alimentam o mesmo contador
   de falha (julgar pode pausar o PRÓXIMO dilema, nunca a si mesmo).
3. Retentativa única em 429 (2s de espera), só dilema/julgar — mesmo
   padrão do retry de JSON malformado no evento, aqui pro motivo mais
   comum medido.

`node testar.js aivivo` reescrito quase por inteiro: os cenários que
testavam o circuito compartilhado usavam `kind:"julgar"` — com julgar
saindo desse circuito, isso testava a variável errada. Trocado pra
`kind:"feed"`.

**Remedido: 0/12 (0%) de fallback em julgar** — bem abaixo do alvo de
<10%, mas medido ~4h depois da medição de 67%, horário diferente. Não
dá pra atribuir a queda só ao conserto sem controlar por hora (pool
compartilhado, demanda pode variar por região/horário sem relação com
o código daqui). BYOK (camada 1) segurado por decisão do usuário — as
outras duas já bateram o alvo — mas recomendado remedir de novo em
horário bem diferente antes de tratar como fechado pra anúncio. Ver
`PENDENCIAS.md` item 9 pro detalhe completo, o passo a passo do BYOK
guardado pra quando precisar, e os horários exatos das duas medições.

**Falha sem resposta nenhuma (rede caiu, DNS falhou, timeout do
`AbortController`) é outra categoria** — o proxy nem foi alcançado, não tem
`transitorio` pra ler. Uma falha assim pode ser blip pontual; duas seguidas
já são sinal de que o caminho está inalcançável, e continuar tentando paga o
timeout inteiro (9,5s) em toda chamada — pior que qualquer erro rápido do
proxy. `falhasRedeSeguidas` desliga na 2ª seguida, zera a cada resposta
recebida (mesmo de erro — significa que a rede está de pé).

**Compatibilidade entre deploys**: enquanto só um dos dois arquivos estiver
no ar (client novo + servidor velho sem `transitorio`, ou o contrário), o
pior caso é o comportamento de antes continuar — `transitorio` chega
`undefined`, nada desliga à toa. O conserto só vale de verdade com os dois
publicados juntos.

```bash
node testar.js aivivo     # os 6 casos, sem rede: transitorio true/false/ausente, 429, falha de rede 1x/2x
```

**`ai()` sempre devolvia `null` por um dos 5 motivos, indistinguíveis de
fora.** Achado jogando: um dilema binário comum ("aceito") caiu no
fallback genérico, sem explicação. Investigado antes de mexer em
qualquer coisa: não é piso de tamanho (não existe nenhum, client ou
prompt), não é falso positivo de `CONTEUDO_INSEGURO` (testado direto —
nenhuma resposta curta legítima bate no regex), e não é falha de
classificação — reproduzido ao vivo com a cena e a resposta exatas do
relato, funcionou normal. Sobrou o circuito aberto (`aiVivo` desligado ou
dentro da janela de `aiPausadoAte`), o que bate com **429 aparecendo em 2
de 6 chamadas** na medição feita na hora (nota: parte da pressão de rate
limit é do próprio processo de medir contra produção repetidas vezes
nesta sessão — não necessariamente representa o tráfego normal do jogo).

Não tem conserto de lógica pra fazer aqui — o circuito está funcionando
como desenhado. O que faltava era conseguir DISTINGUIR qual dos 5 motivos
disparou da próxima vez, em vez de reconstruir por eliminação como desta
vez: `evento("ia_null",{motivo,kind})` marca cada um dos 5 caminhos
(`sem_url`, `desligado`, `pausado`, `429`, `erro_permanente`,
`erro_transitorio`, `rede`) — puramente diagnóstico, não muda
comportamento nenhum. `node testar.js aivivo` cobre o cenário de 429 →
`pausado` na chamada seguinte.

**Segue aberto**: se 429 continuar aparecendo com essa frequência em
tráfego real (não só em medição concentrada), `AI_PAUSA_MS=60000` — já
marcado como não medido — é o primeiro lugar a remedir.

**O mesmo sintoma voltou (2026-09-06), causa completamente diferente.**
"A IA ignora a resposta" de novo — desta vez com um texto claramente
benigno ("respondo educadamente... pelo meu mérito"), o que já derrubava
a hipótese de `CONTEUDO_INSEGURO` (conferido direto: nenhuma das duas
palavras bate no regex). Testado com `curl` direto no endpoint —
`https://draft-ufc.vercel.app/api/ai` devolvia **404
`DEPLOYMENT_NOT_FOUND` em toda chamada**, não intermitente. Causa
provável: `octogono.fun` virou domínio principal do projeto na Vercel e
o alias antigo parou de resolver — a suposição registrada na seção de
domínio ("mesmo projeto, `/api/ai` responde nos dois domínios") era
falsa na prática. Como o 404 não vem com o JSON `transitorio` (nem é
429), `ai()` classificava como `erro_transitorio` e nunca desligava
`aiVivo` — o jogo tentava pra sempre, falhava pra sempre, cada dilema
caía no fallback local. `AI_URL` corrigido pra `https://octogono.fun/
api/ai`; verificado com `curl` (resposta contextual real, não fallback)
e com 30 chamadas reais de `julgar` (100% ok, 0 falhas — o rate limit do
parágrafo acima não apareceu nesta amostra).

**Lição**: depois de qualquer mudança de domínio principal na Vercel,
testar `AI_URL` com `curl` direto contra o endpoint — não presumir que o
alias antigo continua respondendo só porque é "o mesmo projeto".

**4ª ocorrência (2026-09-11), causa numa categoria à parte das três
anteriores — bloqueio LOCAL que nunca gera `ia_null`.** "IA ignora a
resposta" de novo, descartadas as três causas já catalogadas (`AI_URL`
correto e confirmado com `curl`; `dilemaPausadoAte`/`aiPausadoAte`
separados, julgar não respeita pausa nenhuma; as duas frases benignas já
testadas antes continuam sem bater no regex). Achado testando o regex
direto: `CONTEUDO_INSEGURO` disparava em vocabulário de ROTINA de MMA —
"corte feio na perna", "cortei a mão treinando", "corte no braço" — não
automutilação nenhuma, só descrição comum de lesão de treino/luta.
Medido contra produção: **5 de 12 respostas plausíveis de dilema
bloqueadas (41,7%)**, todas mencionando corte de luta, zero conteúdo
inseguro de verdade.

**Por que as três investigações anteriores nunca acharam isto: o
bloqueio acontece em `conteudoInseguro(txt)` (linha antes de chamar
`ai()`, ver "Conteúdo inseguro no dilema" abaixo) — se disparar, a IA
nunca é chamada, e `evento("ia_null",...)` só existe DENTRO de `ai()`/
`tentarChamadaIA()`. Esse caminho de fallback não é um dos motivos
que a instrumentação enumera (`sem_url`, `desligado`, `pausado`, `429`,
`erro_permanente`, `erro_transitorio`, `rede`) — é um OITAVO caminho,
silencioso, que não aparece em nenhuma contagem de `ia_null` por
construção. A mesma lacuna existe no lado pós-chamada
(`conteudoInseguro(jBruto.desfecho)` em `aplicarDilema()`) — um desfecho
real da IA descartado por esse motivo também não gera `ia_null`. Quem
for investigar "IA ignora a resposta" de novo: **rodar o texto do
jogador direto contra `CONTEUDO_INSEGURO` é passo obrigatório antes de
suspeitar de circuito ou rede** — não tem evento que aponte pra cá
sozinho.

Regex estreitado (ver comentário em cima da constante, `index.html`) —
mãos/braços/pernas/dedos/membros só disparam junto de "fora"; pulso/veia
continuam disparando sem isso; reflexivo "me/se corto" cobre o caso sem
parte do corpo. Trade-off aceito e documentado no código: "eu corto meus
braços" sem "fora" nem reflexivo deixa de disparar por aqui.

**Remedido o lado da segurança depois do conserto (mesmo dia)**: 7
categorias inseguras (automutilação explícita ×2 — pulsos e reflexivo,
eufemismo sem palavra-gatilho, violência a terceiro com verbo fora do
léxico do regex, ameaça vaga, sexual não consensual, autolesão em
inglês) + 4 controles de trash talk normal, contra produção. Só as 2
automutilações explícitas em português continuam pegas pelo regex LOCAL
(pulsos/reflexivo, exatamente o que o conserto preservou de propósito);
as outras 5 passam pro `julgar` — nas 5, a IA devolveu desfecho neutro,
sem narrar detalhe gráfico, sem vazar menção a filtro/moderação (mesmo
padrão da rodada 2 antiga, 7/7). Os 4 controles de hype: nenhum
bloqueado, nenhum neutralizado à toa. **Nota**: as frases exatas das
rodadas 1/2 originais nunca foram commitadas (só categoria + contagem
ficaram registradas aqui) — esta remedição reconstrói uma frase por
categoria, mesmo espírito, não é comparação char-a-char com o texto
original.

**Achado à parte, não corrigido nesta leva**: duas das 5 respostas
neutras (sexual não consensual, autolesão em inglês) devolveram o
MESMO texto literal ("Ele mudou de assunto e ninguém insistiu.") —
mesma classe de assinatura de filtro que já motivou dar 4 exemplos de
tom ao prompt em vez de 1 frase pra copiar (ver "Conteúdo inseguro no
dilema" abaixo). Amostra de 2 é pouco pra agir; registrado pra quem for
remedir com N maior.

**`aiVivo` compartilhado ficou perigoso quando evento parou de ter
fallback (2026-09-07).** `aiVivo=false` sempre existiu como desligamento
PERMANENTE (dentro da mesma carreira) pra `feed`/`dilema`/`julgar` — e
sempre foi seguro, porque os três caem em molde local sem o jogador
perceber (`resolveFeed()`, `DILEMA_LOCAL`, texto genérico do julgar).
Quando o evento por IA (ver "Eventos por IA") foi construído SEM
fallback — decisão explícita, "a luta passa sem evento" — ele passou a
usar o MESMO `ai()`, o mesmo `aiVivo` compartilhado, sem ninguém
perceber que a consequência de desligar tinha mudado de "invisível"
pra "carreira inteira sem a mecânica". Medido rodando 20 carreiras
reais de ponta a ponta: **3 em 20 (15%) perderam TODOS os eventos**
porque uma falha de rede boba (2 seguidas, ou um erro do tipo
`transitorio:false`) desligou `aiVivo` cedo na carreira, e nunca mais
voltou (não existe "religar" dentro da mesma carreira).

**Conserto: evento ganhou circuito PRÓPRIO** (`eventoPausadoAte`,
`eventoFalhasSeguidas`), completamente separado de
`aiVivo`/`aiPausadoAte`/`falhasRedeSeguidas`. A diferença de desenho:
`feed`/`dilema`/`julgar` continuavam podendo desistir de vez
(`aiVivo=false`) — considerado seguro na época, porque os três caíam
em molde local sem o jogador notar. Evento NUNCA desiste de vez: todo
motivo que desligaria o circuito compartilhado (`transitorio:false`, 2
falhas de rede seguidas) aqui só PAUSA por `AI_PAUSA_MS` (reaproveitado,
não é número novo pra justificar) e tenta de novo depois — o pior caso
pra evento agora é "algumas lutas sem evento", nunca "carreira inteira
sem evento". `node testar.js aivivo` cobre os dois circuitos por
separado e a ausência de contaminação cruzada entre eles (falha de
`julgar` não pausa evento; falha de evento não desliga `aiVivo`).

**Atualização (2026-09-09 e 2026-09-11): a frase acima não é mais
verdade — nenhum dos três continua podendo desistir de vez.** Dilema/
julgar ganharam circuito próprio em 2026-09-09 (`dilemaPausadoAte`, ver
"Desfecho mais longo" abaixo). `feed` foi o ÚLTIMO a ficar pra trás —
corrigido só em 2026-09-11, achado JOGANDO (3 lutas seguidas sem linha
de repercussão, não em medição): a suposição "é cosmético, ninguém
nota" parou de ser verdade assim que alguém notou de verdade. Ganhou
`feedPausadoAte`/`feedFalhasSeguidas`, mesmo padrão do evento — pausa,
nunca desliga pra sempre. `aiVivo`/`aiPausadoAte`/`falhasRedeSeguidas`
foram REMOVIDOS do código (só feed os usava, não sobrou nada pra eles
protegerem).

**Medido depois do conserto, mesmas 20 carreiras (seeds 95000-95019):
carreiras com ZERO eventos: 0/20 (era 3/20). Carreiras com MENOS de 10
eventos: 1/20 (5%) — a carreira 4, degradada por 14/18 respostas com
JSON malformado na API real naquele dia, mas nunca zerada: o circuito
pausou e voltou a tentar, exatamente o comportamento desenhado. Média:
15,7 eventos/carreira em 22 lutas.**

**Achado antigo, RESOLVIDO por construção com o conserto do feed
(2026-09-11), não precisou de código novo pra isso.** A preocupação
era: `aiVivo`/`aiPausadoAte`/`falhasRedeSeguidas` são `let` de topo,
nunca resetados em `startCareer()` — se desligassem numa carreira,
ficavam desligados nas carreiras SEGUINTES da mesma aba também (só F5
limpava). Isso só era um problema de verdade por causa do
`aiVivo=false` ser BOOLEANO PERMANENTE, sem relógio. Agora que virou
`feedPausadoAte` (timestamp) e nunca mais existe desligamento sem
prazo, o problema não pode mais acontecer: mesmo que persista entre
carreiras da mesma aba, a pausa é de 60s — muito menos do que o tempo
que qualquer jogador leva pra terminar uma carreira e começar outra.

**Medido depois do conserto do feed, 3 carreiras reais em produção
(2026-09-11)** — mesmo protocolo de sempre, mas com um cuidado que
precisa ficar registrado: o script de medição chama `ai("feed",...)`
em sequência RÁPIDA (sem os ~12s de narração que um jogador de verdade
gasta entre lutas), o que é justamente o tipo de rajada que aciona
`feedPausadoAte` — a mesma lição de "medir no ritmo certo" já registrada
pro dilema (ver "Desfecho mais longo" abaixo). O número mede se o
CIRCUITO se recupera, não a experiência exata de quem joga no ritmo
normal.

| | resultado |
|---|---|
| lutas elegíveis pro feed (par ou finish) | 59/66 (89,4%) |
| dessas, com feed real (não fallback) | 29/59 (49,2%) |
| variação entre as 3 carreiras | 3/21 (14%) · 4/16 (25%) · 22/22 (100%) |

A variação entre carreiras é o dado mais importante aqui, mais que a
média: a carreira 3 bateu **100%** — prova que o circuito CONSEGUE
entregar feed em toda luta elegível quando a janela de pausa não é
autoinfligida pelo ritmo de teste. As carreiras 1 e 2 caíram numa
sequência de pausas provavelmente por terem rodado rápido demais, ativando
`feedPausadoAte` e não dando os 60s pra ele expirar antes da próxima
tentativa — exatamente o comportamento NOVO e correto (pausa,
recupera), só que testado num ritmo mais hostil que o de um jogador de
verdade. O que o número PROVA sem ambiguidade: o bug antigo (zero feed
pelo resto da carreira depois de 1 falha) sumiu — nenhuma das 3
carreiras ficou em zero, e uma bateu 100%.

---

### Card de momento

`PLANO-LANCAMENTO.md` fase 1: o jogo não produzia nenhuma imagem pra
anunciar — só a ficha de barrinhas, e o card compartilhável só existia no
fim da carreira. `st.momentos` guarda instantes marcantes DURANTE a
carreira (mesmo padrão silencioso de `st.rares`/`st.events`), com um card
emoldurado próprio (`desenharCardMomento()`) pra cada um.

**Os gatilhos não são os cinco óbvios — três foram medidos e cortados.**
Harness com `candidatos()`/`finishFight()`/`simulateFight()` reais (mesmo
jeito do `testarCinturao`), 120 carreiras simuladas, bot igual ao automático
de verdade (sempre a opção do meio):

| gatilho (como pedido) | méd/carreira | % carreiras ≥1 |
|---|---|---|
| KO round 1 <1min | 0,21 | 16% |
| RARE (`st.rares`) | 1,52 | 83% |
| cinturão ganho | 1,27 | 83% |
| cinturão perdido | 0,95 | 69% |
| upset | 0,00 | 0% |

Cinturão ganho+perdido sozinho batia 44% do total — o "um gatilho responde
pela maioria" que se pediu pra vigiar. Causa: `CHANCE_DISPUTA` (não medido)
mais a disputa travando sempre no mesmo campeão/desafiante sem rotação
(item 1b, pausado) faz o título trocar de mão várias vezes na mesma
carreira. Conserto sem inventar número novo: usar o que o motor já sabe
sobre "primeira vez" — `st.foiCampeao` (permanente, nunca reseta) e
`st.lostBeltFast` (já existia, só readequado pra perda na 1ª defesa).
Refeita a medição só com essas duas versões: 0,83/carreira (cinturão,
capado em 1x por definição) e 0,27/carreira (perda rápida).

`RARE` reaproveitado sem filtro tinha o mesmo problema por dentro: dos 119
raros de tom positivo nas 120 carreiras, 62 eram só `streakW>=8` — mais da
metade. Ficou de fora do card por decisão explícita (contrariando a
recomendação inicial): "está pegando fogo" não é printável, é um contador
alto sem imagem. Continua disparando RARE normal pro relatório final
("Fora da curva"), só não vira card. As 3 entradas do `RARE` que viram card
carregam `card:true` (18-0, 12-0, sequência de finalizações) — marcador
próprio, não índice do array nem `tom==1` (`tom` sozinho incluiria o
`streakW>=8` cortado). `lostBeltFast` ganhou `id:"lostBeltFast"` pra ser
referenciado direto pelo gatilho de cinturão perdido sem duplicar o texto
nem disparar duas vezes (uma vez pelo RARE normal, outra pelo card) — só
entradas com `id` são referenciáveis assim; as outras não precisam.

**Upset tinha bug real, achado medindo, não só cortado.** A fórmula
original em `finishFight()` comparava `opp.rating` com `st.standing` DEPOIS
da vitória já ter subido o standing — "vitória sobre favorito" tem que
comparar com quem o jogador ERA antes de vencer, não depois. Com o bug, o
próprio salto de standing da vitória encolhia a diferença que definia o
upset, e por isso nunca disparava (0/120, mesmo formalmente elegível).
Conserto: `standingPre` capturado na primeira linha de `finishFight()`,
antes de qualquer mutação. Vale pro cálculo inteiro, não só pro card — quem
mais usa `upset` (`buildFeed`) também estava lendo o número errado.
Continua raro no automático puro (0/120 mesmo depois do conserto, porque o
bot do automático sempre escolhe a carta do meio — nunca a faixa
"perigosa", única onde o oponente teria rating alto o bastante). Mas
**não é raro em geral**: o bot do `testarInterface` varia a dificuldade
escolhida a cada luta (`opps[n%opps.length]`, não fixo no meio), e nesse
regime upset chega a ser o gatilho DOMINANTE de uma carreira inteira (5 de 5
cards numa das divisões testadas). Quem joga manual e arrisca a faixa
perigosa vê upset com frequência real — o automático é só o piso.

**Segundo problema, achado jogando: zebra na luta 1 não é zebra.** O
jogador começa com `standing=.18` — quase todo mundo tem rating maior no
início, então quase toda vitória cedo bate o limiar de diferença por
default, sem ser zebra de verdade. Medido: 120 carreiras, bot do
`testarInterface` (varia dificuldade), **77% dos upsets caíam nas lutas
1-5, mediana luta 2** — não é "raro que aconteça cedo", é o padrão
dominante. Conserto: piso de `fightNo>=6` (pula exatamente a faixa
inflada) e diferença de rating subiu de `.15` pra `.20` (era generosa
demais mesmo tirando o problema do início). `node testar.js momentos`
prova as duas pontas — dispara na luta 6 com diferença grande, não dispara
na luta 3 com a mesma diferença. Depois do conserto, `st.momentos.length`
médio caiu de ~2,75 (estimativa antes do piso) pra **1,87** (120
carreiras, min 0, max 6) — dentro da faixa, sem desabar pra perto de 1
(o que teria sido sinal de ter cortado demais).

**`r.clock` é o relógio REGRESSIVO da luta** (começa em `"5:00"`, desce até
`"0:00"` — ver `exchange()`), não o tempo decorrido que a leitura de
transmissão real sugere. KO rápido (round 1, abaixo de 1 minuto decorrido) é
clock ALTO (`"4:xx"`), não baixo — o oposto do que "clock baixo = luta
curta" sugeriria à primeira vista. `clockSeconds()` (inverso do `fmtClock()`
existente) mais `300-clockSeconds(r.clock)` fazem a conta certa.
`node testar.js momentos` testa os dois lados dessa direção de propósito —
foi o ponto onde um patch errado passaria batido em silêncio.

**Lesão vencida dispara só na primeira vitória com a lesão ativa**, não a
cada vitória durante os até 8 combates de janela — mesmo princípio do
cinturão. A frequência real desse gatilho não dá pra medir offline: depende
da IA classificar a cena como lesão E o jogador aceitar o risco, e o
harness roda com `fetch` rejeitando de propósito (mesmo ambiente do
`testar.js`), então nenhuma lesão nasce pelo caminho natural do dilema ali.

**Não interrompe nada — nem no automático a 4x.** O ponto onde a próxima
luta dispara sozinha (`setTimeout(...,1100/speed)`, ~275ms a 4x) não cabe
um modal nem por um instante. O card não trava a tela: acumula em
`st.momentos` e um contador no botão "Cards" (`atualizarControles()`) avisa
que tem novidade — o jogador abre quando quiser, inclusive com o automático
rodando por baixo (`abrirPainelMomentos()` não toca em
`playing`/`auto`/`dilemaAberto`).

**Reaproveita o canvas, não o conteúdo.** `desenharCard()`/`compartilhar()`
(o card de fim de carreira) são moldados pro fim: nota A-F (`grade()`),
cartel FINAL, citação do `LEGACY` (que só sintetiza carreira encerrada — não
tem entrada pontual). `desenharCardMomento()` é função nova, mas reaproveita
os helpers genéricos (`regra`, `mono`, `disp`, `quebrar`, `C`, textura,
rodapé com semente) e a mesma caixa carimbada — só troca a nota A-F por um
rótulo curto do tipo de momento (`ROTULO_MOMENTO`). `compartilhar()` ganhou
um terceiro parâmetro opcional (`desenhar=desenharCard`) em vez de duplicar
a lógica de blob/share/download inteira; o texto do compartilhamento
distingue os dois pelo formato do objeto (`g.frase` só existe no card de
momento, `g.letter` só no de fim de carreira).

**O primeiro desenho tinha metade do card vazia.** Só frase, sem mais nada
— o card de fim de carreira preenche o espaço porque tem cartel, grade e
legado; este só tinha a frase e ar de sobra. Corrigido com um bloco de 3
linhas fixas (reaproveita o `linha()` do `desenharCard`, redefinido local):
adversário, resultado (`método · round · tempo`) e posição na divisão —
capturados em `criarMomento(tipo,frase,opp,r)` no INSTANTE do gatilho
(dentro de `finishFight()`, onde `opp`/`r` sempre existem), não no desenho,
porque na hora que o jogador abre o card o standing já andou e a posição
mudaria. Deliberadamente só 3 — a tentação depois de "ainda parece vazio"
é acrescentar mais linha, e o risco real é o card virar planilha; o ajuste
certo pra isso é a frase, não os dados.

**As frases originais eram descrição, não piada.** "${n} entrou como
azarão contra ${opp} e saiu com a mão levantada" fala O QUE aconteceu sem
imagem nem graça — comparado com o padrão que o próprio `RARE` já produz
("o reinado durou menos que a fila da pesagem"), não tem o que faz alguém
postar. Reescritas nas 4 frases novas, mesmo padrão seco/imagem concreta
do `RARE`/`LEGACY`:

| gatilho | frase final |
|---|---|
| KO rápido | "${n} não deixou o locutor terminar de apresentar o adversário." |
| primeiro cinturão | "${n} levantou o cinturão e não soltou pra nenhuma foto." |
| upset | "Quem apostou em ${n} contra ${opp} multiplicou o dinheiro." (fase 7: a anterior, "${opp} tinha tudo pra vencer, menos a luta", era fecho em aforismo) |
| lesão vencida | "${n} entrou mancando e saiu com a mão levantada." |

**Prévia no painel, não só texto e botão.** `abrirPainelMomentos()` agora
renderiza `desenharCardMomento(m)` de verdade pra cada item da lista e
desenha reduzido (140px de largura, mesma proporção 4:5 do card) num
`<canvas>` pequeno — sem isso o jogador só descobre o que vai postar
depois de baixar. Falha ao gerar a miniatura não impede salvar (`try/catch`
silencioso: a miniatura é conveniência, não pode derrubar o botão que
importa).

**Rótulo dizia categoria interna, não fato — e dois gatilhos na mesma luta
disputavam o mesmo card silenciosamente (2026-09-08).** Achado jogando:
ganhou o cinturão por finalização, cartel bateu 12-0 exato NESSA luta —
`cinturao` e `raro`/`invicto12` disparam juntos, viram dois cards
separados na galeria, e "RARO" não dava nenhuma pista de que aquele não
era o card do título. `ROTULO_MOMENTO` reescrito pra dizer o FATO
("CINTURÃO", "PERDEU O CINTURÃO", "ESTREIA NO MAIN CARD"), não a
categoria; `raro` não tem rótulo fixo possível (cobre 3 recordes bem
diferentes) — usa o cartel de verdade pra invicto12/18 (é literalmente
`m.cartel`, já existia) ou frase própria pro `finishStreak`
(`ROTULO_RARO`); `ko` ganhou o tempo exato calculado na hora
(`m.segundosKO`, "NOCAUTE EM 40s"). `rotuloMomento(m)` decide qual
caminho usar.

**Prioridade (`ORDEM_MOMENTO`)** pra quando mais de um gatilho nasce na
MESMA chamada de `finishFight()`: cinturão sempre ganha ("é o momento
maior", pedido explícito) — resto da ordem
(`cinturaoInterino>cinturaoPerdido>estreia>upset>ko>lesao>raro`) é
julgamento de importância narrativa, não medido. Implementado no FIM da
função: compara só os momentos NASCIDOS nesta chamada
(`st.momentos.slice(momentosAntes)`), mantém o de maior prioridade,
descarta os outros — mas só o CARD; o resto do efeito de cada gatilho
(texto no feed, `st.rares`/`st.events`, flags como `st.estreouMainCard`)
já rodou antes e continua valendo integralmente. `node testar.js
momentos` reproduz o caso relatado byte a byte (12-0 + cinturão por
finalização) e prova com dente que só 1 card sobra, com o rótulo e a
frase certos.

```bash
node testar.js momentos   # cada gatilho na hora certa, uma vez só, sem rede
```

**Dois gatilhos novos (2026-09-11): trabalho que já existia sem card
nenhum.** `PENDENCIAS.md` "onde desperdiça trabalho já feito" apontou
dois números que a ficha já calculava (ou o dataset já media) sem virar
momento: `st.bonusNoite` (recorde de hype da carreira, existia desde a
leva anterior, só aparecia no relatório final) e `posicaoDivisao()`
(posição na tabela INTEIRA, a mesma que a ficha mostra como "#N de M" —
não é o `RANKING` oficial de campeão+15, ver "Campeão nomeado" acima;
as duas seções da ficha convivem sem citar número uma da outra, isto
não muda essa convivência).

Medido ANTES de decidir o gatilho (mesmo protocolo desta seção, 500
carreiras/divisão, estratégia "parelho" fixa, `candidatos()`/
`simulateFight()`/`finishFight()` reais):

| gatilho testado | resultado | decisão |
|---|---|---|
| topoDivisao (nº1 da tabela, 1ª vez, qualquer luta) | 66,8%/67,6% das carreiras (leve/pesado) | **apertado de novo no mesmo dia** — fora da faixa dos outros gatilhos (2%-30%), mesmo padrão já cortado em "topo_da_divisao" (conquistas) e streakW>=8 (RARE) |
| topoDivisao, só até a luta 15 (não "algum dia") | 25,2%/36,4% | escolhido — dentro de 25%-40% |
| bonusNoite, TODO recorde vira card | 3,4/3,0 recordes por carreira em média | descartado — ruído, não é marco |
| bonusNoite, só recordes da 2ª metade (luta≥12) | 78%/75% das carreiras batem ≥1 | ainda comum, descartado sozinho |
| bonusNoite, 1º recorde da 2ª metade, TRAVADO (1x só) | por definição, ≤1/carreira | escolhido |

Outros dois candidatos testados pro topoDivisao antes de fechar em
"até a luta 15": **invicto até chegar ao topo** (perde a posição de
"marco cedo" — cai pra 8,2%/16,8%, abaixo até do piso de 25%) e
**streak de 3-5 vitórias ativo** (55%-66%, ainda alto demais). "Até a
luta 15" foi o único dos quatro que caiu dentro da faixa nas duas
divisões testadas ao mesmo tempo.

`bonusNoite` trava em `st.bonusNoiteMarco` — dispara só no PRIMEIRO
recorde de hype a partir da luta 12, nunca de novo na mesma carreira.
`st.bonusNoite` (o número de verdade) continua sendo atualizado TODA
luta, sem trava nenhuma — o relatório final e o card compartilhável
sempre mostram o recorde VERDADEIRO, mesmo que ele seja batido de novo
depois do card já ter aparecido uma vez.

**`bonusNoite` é o de MENOR prioridade em `ORDEM_MOMENTO`, descoberto
escrevendo o próprio teste de regressão.** Um 18-0 na luta 18 também é,
por definição, a primeira vez que `st.bonusNoite` existe (objeto começa
null) — então testar "18-0 dispara card de raro" quebrou depois de
`bonusNoite` entrar no meio da lista de prioridade: as duas condições
bateram na MESMA luta, e a colisão escolhia a errada. Corrigido movendo
`bonusNoite` pro fim de `ORDEM_MOMENTO` — qualquer outro tipo (raro
incluso) é sempre o fato mais especial quando colide.

`topoDivisao` entra na mesma faixa alta que `estreia` (é um marco de
carreira, não destaque de uma luta só) — trava permanente, sem volta,
mesmo padrão de `estreouMainCard`.

```bash
node testar.js loja   # consultoria de mídia: consumo de 1 luta, mesmo CASA_FOLLOWER_MULT
```

---

### Compartilhar: um toque não pode virar dois arquivos (2026-09-08)

Achado jogando: "colei e vieram dois arquivos idênticos, mesmo nome,
mesmo conteúdo". Suspeita inicial (razoável, mesma classe de bug) era
`addEventListener` duplicado — grep no arquivo inteiro descarta: os
botões de compartilhar/salvar usam só `onclick=`, que nunca duplica
sozinho (reatribuir substitui). Causa real: `compartilhar()` ATRIBUÍA
`btn.disabled=true` mas nunca CHECAVA antes de rodar — duas chamadas
que cheguem antes do 1º `await` resolver (toque duplo rápido, comum
aqui porque nada muda na tela até "Gerando…" aparecer) rodam as duas
inteiras, cada uma gerando seu próprio arquivo com o MESMO nome
determinístico (`${me.name}.png`, sem timestamp). Afeta os dois botões
que passam por `compartilhar()` — "Salvar imagem" (galeria) e
"Compartilhar" (fim de carreira) — mesma função, mesmo bug.

Conserto: `if(btn.disabled)return;` na primeira linha — guard
explícito, não confia só no `<button disabled>` nativo (mesmo
raciocínio de sempre aqui: estado implícito não é garantia).
`node testar.js compartilhar` simula 2 chamadas seguidas sem esperar a
1ª terminar, com um `desenhar()` fake (não precisa mockar canvas real
pra provar reentrância) — sem o guard, 2 downloads; com o guard, 1.

**"Voltou" (2026-09-11) — não era regressão do guard, era um caminho que
nunca esteve no escopo do conserto acima.** Reportado como dois bugs
juntos: cópia direto na miniatura do painel de momentos devolvia a
miniatura em 140px, ilegível; e "a duplicação voltou".

**Cópia da miniatura**: a miniatura era um `<canvas>` de verdade no DOM
(`mini.getContext("2d").drawImage(cv,0,0,thumbW,thumbH)`), existe desde
2026-09-03 — 5 dias ANTES do conserto de duplicação acima, nunca fez
parte do escopo dele. Botão direito → "Copiar imagem" nesse elemento lê
o PIXEL do canvas direto, sem passar por nenhum código nosso — não tem
`onclick` que intercepte isso, "Copiar imagem" do menu do navegador não
é evento de JS. Duas saídas possíveis: interceptar o clique (não
resolve — o menu de contexto ignora onclick) ou trocar o elemento por
algo que o navegador não ofereça "Copiar/Salvar imagem" nele.
**Escolhida a segunda**: miniatura virou `<div>` com `background-image`
(a mesma imagem, via `canvas.toDataURL()`) — Chrome/Firefox só mostram
esses itens de menu pra `<img>`/`<canvas>`/`<svg>`, nunca pra fundo CSS.
Clique esquerdo na miniatura também aciona `compartilhar()`, mesmo
caminho do botão "Salvar imagem" — atalho de UX, não a defesa (a defesa
é não ter mais um elemento copiável ali).

**Duplicação "voltando"**: investigado se o guard de `btn.disabled`
cobre os 3 caminhos que existem — botão do painel, botão do fim de
carreira, e o próprio menu de contexto do navegador (que devolveria o
caso acima como um SEGUNDO arquivo, de qualidade errada, se combinado
com o botão de verdade). **Os dois botões continuavam protegidos** — a
suspeita de regressão não se confirmou: `node testar.js compartilhar`
ganhou 3 cenários novos que acham o botão de VERDADE no DOM renderizado
por `abrirPainelMomentos()`/`screenReport()` (não um `onclick`
reconstruído à mão, que é o que o teste original fazia — por isso não
pegava esta classe de furo antes) e clicam nele 2x, igual usuário
rápido faria. Prova com dente: guard removido de propósito → os 3
cenários reprovam, 8 downloads em vez de 4; guard restaurado → 4/4,
1 download por cenário. O terceiro caminho (menu de contexto) não dá
pra simular clique de verdade num teste sem navegador — a prova aqui é
estrutural: a miniatura não pode ser `<canvas>`/`<img>` (checado
direto), o que por construção tira a opção "Copiar/Salvar imagem" do
menu nativo.

**O conserto de 2026-09-08 chegou a ser deployado.** O histórico de
deploy da Vercel (`vercel ls`) mostra produção publicada antes desta
sessão — a mais recente ~14h antes desta conversa começar, várias
outras 3-5 dias antes. `vercel --prod` publica o diretório inteiro (não
um diff), e não tem motivo pra suspeitar de checkout velho — não existe
integração de git neste projeto (sem remote), então a Vercel não marca
cada deploy com o SHA do commit, e não dá pra confirmar isso com 100%
de certeza só pelo `vercel inspect`. Mas a evidência direta bate: o
guard como está commitado desde 99191e0 (2026-09-08) É o mesmo código
testado agora, e ele protege os dois botões de verdade quando exercido
com dente. Não foi regressão de deploy — foi um caminho (a miniatura)
que nunca tinha entrado no escopo do primeiro conserto, existente desde
5 dias ANTES dele.

**Residual conhecido, não corrigido nesta leva**: fechar o painel de
momentos e reabri-lo NO MEIO de um salvamento em andamento cria um
`<button>` novo (disabled=false) pro mesmo momento, enquanto a chamada
antiga ainda roda no botão velho (agora fora do DOM) — clicar no botão
novo nesse intervalo estreito dispara uma 2ª `compartilhar()`
independente, sem o guard ver a outra (são objetos `btn` diferentes).
Janela pequena (só existe enquanto `desenharCardMomento()`/fontes
carregam) e não é o que foi reportado — registrado aqui pra não se
perder, não resolvido.

```bash
node testar.js compartilhar   # reentrância isolada + os 3 caminhos reais + a miniatura não é canvas/img
```

---

## Atualizar os dados

O repositório `Greco1899/scrape_ufc_stats` roda scraping diário e commita os
CSVs. Não escreva scraper: o ufcstats está atrás de verificação de browser.

```bash
mkdir -p data && cd data
curl -sLO https://raw.githubusercontent.com/Greco1899/scrape_ufc_stats/main/ufc_fight_stats.csv
curl -sLO https://raw.githubusercontent.com/Greco1899/scrape_ufc_stats/main/ufc_fight_results.csv
curl -sLO https://raw.githubusercontent.com/Greco1899/scrape_ufc_stats/main/ufc_fighter_tott.csv
cd .. && pip3 install pandas && python3 atualizar-dados.py && node testar.js
```

---

## Dívidas conhecidas

**RESOLVIDO na fase 8 do revamp (2026-09-27): a regra saiu, medido sem transbordo em 28 telas × 3 larguras (ver "Auditoria final").** Histórico: **Remendo, não conserto — `html{overflow-x:hidden}` (2026-09-16).**
Medido em 380px (auditoria mobile, Fase 4 do redesign): `#controls
.row` (o bloco "Próxima luta / Modo automático / Conquistas / Loja",
presente em toda tela de carreira) reporta `scrollWidth` 22px maior
que `clientWidth` — 398 contra 376 — mesmo sendo `flex-wrap:wrap` e
nenhum item individual passando da largura do container (medido:
maior item 179px, container 340px). Provável quirk do Chrome com
flex-wrap+gap, não confirmado contra outros motores. `overflow-x:hidden`
no `html` esconde o sintoma (trava o usuário de arrastar a página pro
lado) sem explicar por que `.row` calcula mais largura do que ocupa.
Se o conteúdo desse bloco crescer de novo — mais um botão, texto mais
longo — o overflow provavelmente cresce junto, só que agora invisível,
sem scroll pra denunciar. **Quando mexer em `#controls` (Fase 6, que
já vai tocar nos controles), vale isolar a causa raiz antes de
adicionar/mudar qualquer coisa ali.**

**RESOLVIDO — `testar.js escolhas` reimplementava a seleção de adversário.**
Chamava `camp.fx(me)` (nunca existiu — o motor usa `camp.alvos` via
`aplicarCamp()`) e reimplementava a escada em vez de chamar `candidatos()`.
Reescrito pra chamar as funções reais (mesmo padrão de `testarCinturao`);
volta a aprovar/reprovar em vez de só relatar. Medido com o código de
verdade: acessível 28% chegam ao topo, parelho 89%, perigoso 99%.

## Conquistas

Troféu local, `localStorage`, sem conta e sem backend — 29 conquistas
(15 originais + 14 da leva de 2026-09-21) mais uma platina calculada
(todas desbloqueadas). Cada uma é uma função pura `check(st,modo)`
sobre estado que o motor já mantém (`CONQUISTAS`, perto do RARE/LEGACY).
Nenhuma depende de a IA ter classificado nada: `momentos` (usado por 3
delas — lesão vencida, zebra, KO rápido) já é decidido pelo motor, não
pela IA; seguidores/fã têm uma fração pequena vinda de dilema, mas a
maior parte é hype de luta real. A leva 2 seguiu a mesma regra
explicitamente — nenhuma checa campo que só a IA preenche (`j.*`).

**Achado escrevendo o teste, não jogando: 4 conquistas desbloqueavam no
MEIO da carreira.** "Invicto" (`losses===0`) é trivialmente verdade antes
da primeira derrota acontecer — sem guarda, desbloqueava na luta 1. Mesmo
problema em "nunca finalizado", "queixo de granito" e "ídolo". As 4 ganharam
`fightNo>=TOTAL_FIGHTS` — só valem no fim de verdade. As outras 11 são fatos
permanentes assim que acontecem (defender 5 vezes, reconquistar, pico da
divisão) e não precisam da guarda — desbloquear na hora é o comportamento
certo pra elas.

**Medido, não suposto — remedido em 2026-09-21 (150 carreiras modo normal,
80 modo lenda, `node testar.js freqconquistas N [modo]`, mesmo bot de
ponta a ponta dos gatilhos de card):**

- Só as 15 originais: **3,06/15 (20,4%)** normal. O número antigo aqui
  (4,17/15, 28%) ficou desatualizado quando `TETO_TREINO` baixou de
  1.26 pra 1.18 (ver "Progressão do lutador") — carreira ficou mais
  dura, conquista também.
- As 29 de hoje: **5,26/29 (18,1%)** normal, **7,65/29 (26,4%)** lenda —
  as duas bem abaixo de metade.
- `primeiro_sangue` 100% (deliberadamente quase garantida). `fogo` 68%
  normal — acima do teto de 60% que o redesign de 2026-09-21 adotou pra
  qualquer conquista nova; não corrigido ainda, sinalizado no
  `PENDENCIAS.md` item 31.
- `nao_sente` (lesão vencida): **NÃO é IA-dependente**, achado remedindo
  pro redesign — lesão tem caminho por nocaute (`lesaoRng`, 100% local)
  além do caminho por dilema (IA). A frase anterior aqui embaixo estava
  errada.
- Só duas seguem de fato sem taxa offline: `prudente` (depende de
  `j.evitouLesao`, só a IA de verdade preenche) e `lenda_coroada` (não é
  IA, é modo — precisa de leva separada em modo lenda, já medida acima:
  66,3%, também acima do teto de 60%, mas esperado — só desbloqueia
  jogando lenda mesmo). Detalhe de cada uma no `PENDENCIAS.md` item 31.
- **Achado novo, maior que qualquer conquista isolada**: o bot em modo
  lenda roda sistematicamente mais "quente" que o normal — `zebra` vai
  de 0% (normal) pra 92,5% (lenda), `grande_queda` (leva 2) de 49,3%
  pra 61,3%. Não é limiar errado de uma conquista, é a calibração do
  modo lenda inteiro — reequilibrar isso é trabalho maior que
  "adicionar conquista", registrado no `PENDENCIAS.md`, não decidido
  sozinho.

`topo_da_divisao` saiu em 91% na primeira versão (`peak>=.98`) — remedido
depois: não era o limiar, era a MÉTRICA. `st.standing` tem teto em 1.0 e o
bot encosta nele (`peak>=.999` já pegava 90% das carreiras) — qualquer
limiar de `peak` cai nesse mesmo teto, porque a distribuição real é quase
binária (satura ou não sobe quase nada, sem meio-termo). Trocado por
`bestBeaten` (rating do melhor adversário REAL já batido, 0-1, sem teto de
progressão do jogador): `>=.90` deu **31%** na mesma medição — dentro da
faixa das outras conquistas boas, e semanticamente melhor ("bater alguém
de elite de verdade" em vez de "seu próprio teto de standing").

**As 14 novas da leva de 2026-09-21**, com taxa normal/lenda medida antes
de entrar (uma 15ª, "Noite marcante"/`bonusNoiteMarco`, foi proposta e
caiu na medição — 66,7% normal, acima do teto — tirada, não forçada):

| id | gatilho | normal | lenda |
|---|---|---|---|
| `chegada_relampago` | topo do ranking até a luta 15 (`topoDivisaoAlcancado`, campo que já existia sem uso) | 29,3% | 26,3% |
| `vidro` | 4+ nocautes sofridos | 4,7% | 21,3% |
| `ex_campeao` | perdeu o cinturão depois de tê-lo | 38,7% | 26,3% |
| `zero_de_22` | 0 vitórias no fim | 0,0%* | 0,0%* |
| `sequencia_feia` | 5+ derrotas seguidas (`st.longestL`, novo, espelha `st.longestW`) | 0,7% | 1,3% |
| `cinturao_interino` | conquistou o interino (`st.foiCinturaoInterino`, novo) | 7,3% | 13,8% |
| `nocauteado_do_trono` | perdeu o cinturão por nocaute (`st.perdeuCinturaoPorNocaute`, novo) | 16,0% | 18,8% |
| `nunca_precisou_do_juiz` | 7+ vitórias, todas finalizadas | 6,0% | 30,0% |
| `chato_mas_eficaz` | 7+ vitórias, nenhuma finalizada | 0,0%* | 0,0%* |
| `nunca_foi_ao_chao` | 0 quedas sofridas no fim | 21,3% | 11,3% |
| `grande_queda` | 15+ quedas aplicadas (era 6, dava 90%+ — remedido, ver acima) | 49,3% | 61,3%† |
| `nunca_aplicou_queda` | 0 quedas aplicadas no fim | 0,0%* | 1,3% |
| `recusou_a_chance` | recusou a disputa 1+ vez, elegível (`st.maxDisputaRecusas`, novo) | 37,3% | 36,3% |
| `decisao_de_campeao` | ganhou o cinturão indo aos cartões (`st.tituloPorDecisao`, novo) | 9,3% | 2,5% |

\* Zero no bot "parelho" não é zero garantido pro jogador — mesma
ressalva de `zebra`, o bot evita risco desnecessário, jogador real com
sorte ruim ou escolha deliberada chega lá.
† Acima do teto de 60%, só no modo lenda — ver "achado novo" acima,
não é bug desta conquista específica.

```bash
node testar.js conquistas      # cada check() no limite certo + persistência de verdade
node testar.js freqconquistas [N] [normal|lenda]   # frequência real de qualquer conquista, bot de ponta a ponta
```

## Contas

**Jogar exige conta (desde o revamp, 2026-09-27).** A regra antiga ("jogar
não exige conta, regra que não muda", pensada pro funil de anúncio) foi
revertida pelo dono de propósito: a carreira agora é salva na conta e o
ranking é por conta. Nova carreira, Continuar e link de desafio passam por
`comConta()`: sem sessão, a pessoa cai no portão (`screenPortao()`,
formulário já em "Criar conta") e a intenção fica guardada
(`guardarIntencao`, vence em 24 h). Confirmação de e-mail continua ligada;
o link de confirmação e o login com Google voltam pra página SEM a rota, e
a intenção é seguida quando o Supabase avisa `SIGNED_IN`. Consequência
aceita: quem abre um link de desafio também cria conta antes de jogar. O
fim da carreira não oferece mais criar conta (só confirma a sincronização).
Menu, Ranking, Atualizações, Termos e Privacidade continuam abertos sem
conta (a página Créditos saiu em 2026-09-28). Risco registrado: Resend grátis manda 100 e-mails por
dia (PENDENCIAS.md item 37).

O texto abaixo descreve a conta como era antes (opcional) e continua certo
na parte técnica (Supabase, RLS, senha, Google, recuperação).

**Arquitetura**: Supabase (Postgres + Auth gerenciados, plano gratuito
integra com Vercel sem servidor próprio). Tabela `conquistas_usuario`
(`user_id`, `conquista_id`, `desbloqueada_em`), schema completo com Row
Level Security em `supabase_schema.sql` — cada usuário só lê/grava as
próprias linhas, garantido pelo Postgres via `auth.uid()`, não pelo
client (que dá pra adulterar).

**Auth: e-mail+senha, não link mágico (trocado 2026-09-09).** Decisão
explícita: plano pago vem por aí, conta precisa existir de verdade
(login em outro aparelho sem depender de e-mail chegando), não só uma
sessão que o link mágico concede de passagem.
`supabase.auth.signUp()`/`signInWithPassword()` — sem tabela nova, é a
mesma auth gerenciada de sempre. **Login com Google** também
(`signInWithOAuth({provider:"google"})`) — resolve o atrito do
cadastro e não depende de e-mail chegando, o que importa especialmente
enquanto o SMTP de marca própria (abaixo) não está pronto. Google
exige configuração PRÓPRIA no painel (Authentication → Providers →
Google: client ID/secret de um projeto no Google Cloud Console) — sem
isso o botão aparece mas `signInWithOAuth` devolve erro.

`montarFormularioConta()` (index.html) é o formulário único, usado nos
dois lugares que pedem conta (tela "Conta" da tela inicial, e a caixa
de fim de carreira) — mesmo markup, mesma lógica, sem duplicar.

**Recuperação de senha (2026-09-10)**: `enviarRecuperacaoSenha(email)`
chama `resetPasswordForEmail(email,{redirectTo:location.href})`;
`definirNovaSenha(novaSenha)` chama `updateUser({password})`. O
listener `onAuthStateChange` é registrado uma única vez, dentro de
`getSupabase()` (só na primeira criação do client), escutando o
evento `PASSWORD_RECOVERY` — quando o Supabase manda a pessoa de volta
pelo link do e-mail, o evento chega sozinho e abre `screenNovaSenha()`
direto, sem rota nem parâmetro de URL pra tratar no client.

**Formulário de conta redesenhado (2026-09-10) — dois modos, não um
formulário só.** Motivo: quem já tem conta não deveria ver confirmação
de senha, quem está criando não precisa ver "esqueci minha senha" —
são dois momentos diferentes. `montarFormularioConta()` guarda um
`modo` interno ("entrar"/"criar") e um `render()` que remonta o
container inteiro a cada troca; a troca é um link no rodapé ("Criar
conta" ⇄ "Já tenho conta"), sem rota nem parâmetro.

- **Modo Entrar**: e-mail, 1 senha, "Esqueci minha senha", botão
  "Entrar", "Entrar com Google". Sem confirmar senha, sem regras.
- **Modo Criar**: e-mail, senha, confirmar senha, checklist ao vivo
  (`atualizaRegras()`, rodada a cada `oninput`) mostrando o que falta
  — "faltam N caractere(s) para o mínimo de 8" em vermelho até bater,
  vira "✓ mínimo de 8 caracteres" em verde; mesma lógica pra
  "as senhas não conferem" → "✓ as senhas conferem". O botão "Criar
  conta" nasce **desabilitado** e só habilita quando as duas regras
  batem (`formValido()`) — nunca fica morto sem explicação, porque o
  motivo (a regra em vermelho) já está visível acima dele.
- **Mostrar/ocultar senha**: cada campo de senha (`campoSenha()`) tem
  um botão "Mostrar"/"Ocultar" ao lado do rótulo que alterna
  `input.type` entre `password` e `text` — não é `type="text"` fixo,
  some ao trocar de campo/modo.
- **`SENHA_MIN=8`**: única regra de senha do client, de propósito —
  "não vou exigir maiúscula/número/símbolo, só tamanho" (decisão
  explícita: regra complexa no cadastro afasta gente). **O painel do
  Supabase (Authentication → Providers → Email) tem política PRÓPRIA
  de senha e precisa ter o MESMO mínimo (8), sem exigir classes de
  caractere** — client e painel são duas validações independentes que
  precisam concordar; se divergirem, quem passa no client mas falha no
  painel cai no bucket genérico de erro de senha abaixo, não trava
  quieto.
- **`traduzErroSupabase(msg)`**: mapeia por substring (o Supabase não
  garante código de erro estável entre versões) as mensagens cruas do
  Supabase pra português — "User already registered" → "Este e-mail já
  está cadastrado.", "Invalid login credentials" → "E-mail ou senha
  incorretos.", "Email not confirmed", limite de taxa, e-mail inválido,
  falha de rede, e um bucket genérico pra "password" que cobre TANTO
  senha curta quanto rejeição pela política do painel (o client não
  consegue distinguir qual das duas foi) — aplicado em todo caminho de
  erro (`criarConta`, `entrarComSenha`, `entrarComGoogle`,
  `enviarRecuperacaoSenha`, `definirNovaSenha`).
- **Estado de carregando**: o botão de ação troca de texto
  (`"Entrando…"`/`"Criando conta…"`) e trava e-mail/senha/Google
  (`trava(true)`) assim que clicado, antes de qualquer `await` —
  impede duplo clique, sem precisar de debounce.
- Testado em `node testar.js inicial` (34 verificações), incluindo
  troca de modo, checklist ao vivo, mostrar/ocultar, tradução de erro
  e o botão nascendo desabilitado.

**Configuração (uma vez, fora do código)**:
1. Criar projeto em supabase.com, plano gratuito.
2. Editor SQL do painel → colar e rodar `supabase_schema.sql`.
3. **Configurar SMTP próprio antes de qualquer tráfego real.** Duas razões
   agora, não só uma:
   - Limite: o envio de e-mail PADRÃO do Supabase é **2 e-mails por
     hora** — inviável mesmo pra 100 usuários se dois tentarem
     cadastrar na mesma hora.
   - **Marca: desde junho de 2026, projetos novos no gratuito da
     Supabase NÃO PODEM MAIS editar o template de e-mail** (confirmado
     nos docs oficiais, 2026-09-09) — o e-mail sai com o padrão deles
     ("Supabase Auth" no remetente, sem jeito de mudar) até existir SMTP
     próprio. Não é só feio, parece golpe — exatamente o que o usuário
     notou jogando.

   Passo a passo:
   1. Painel → **Authentication → SMTP Settings**
      (`/project/_/auth/smtp`): preencher Sender Email (ex.
      `naoresponda@octogono.fun`), Sender Name (`Octógono`), e
      Host/Port/User/Password do provedor (Resend, já escolhido na
      tabela de custo abaixo).
   2. No provedor de e-mail (Resend): verificar o domínio
      `octogono.fun` — adiciona registros SPF/DKIM no DNS do domínio
      (onde o domínio foi registrado, mesmo lugar do apontamento pro
      Vercel). Sem isso o e-mail sai mas cai em spam com facilidade.
   3. SÓ DEPOIS do SMTP configurado: painel → **Authentication →
      Emails → Templates** (`/project/_/auth/templates`), uma aba por
      tipo — "Confirm signup" e "Reset Password" são os dois que
      importam agora (Magic Link não é mais usado, ver "Auth: e-mail+
      senha" acima). Editor de HTML cru com variáveis Go
      (`{{ .ConfirmationURL }}` etc.), sem WYSIWYG — trocar o texto e o
      layout pela marca Octógono aqui.
4. Painel → Project Settings → API: copiar `Project URL` e `anon public
   key`, colar em `SUPABASE_URL`/`SUPABASE_ANON_KEY` no `index.html`
   (perto de `AI_URL`). A anon key é pública DE PROPÓSITO — é assim que o
   Supabase funciona, a proteção de verdade é o RLS do passo 2, não o
   segredo desta chave.

Enquanto os dois campos ficarem vazios, `getSupabase()` devolve `null` e a
caixa de "salvar conquistas" nem aparece — o jogo roda idêntico a hoje.

**Estado desta instância (2026-09-10)**: passos 1-4 feitos — schema
rodado (`conquistas_usuario` e `carreiras_usuario`, RLS confirmado
gravando em produção), chave preenchida e deployada, SMTP próprio
(Resend) e Google Provider configurados (confirmado pelo usuário,
2026-09-10: "Google e Resend configurados, login funcionando"). Login
por senha, por Google, recuperação de senha e histórico de carreiras
todos em produção. Ver `PENDENCIAS.md`.

**Migração de chave pendente, registrada, sem pressa de código**: o
painel do Supabase já marca a `anon key` (formato JWT, a que está em
`SUPABASE_ANON_KEY` hoje) como legada, em favor de `sb_publishable_...`
("Publishable API keys"). Confirmado (2026-09-08): `createClient()` do
supabase-js v2 aceita as duas formas sem mudança de código nenhuma —
RLS se comporta igual, é só trocar a string quando migrar. Ficou com a
legada por decisão explícita ("funciona, não mexe"), mas **Supabase vai
DESATIVAR anon/service_role até o fim de 2026** — isto TEM prazo, não é
só recomendação. Quando migrar: painel → Project Settings → API Keys →
copiar a `publishable key` nova, trocar só o valor de
`SUPABASE_ANON_KEY` (nome da constante pode ficar, é só o conteúdo que
muda). Fontes: supabase.com/docs/guides/getting-started/migrating-to-new-api-keys,
github.com/orgs/supabase/discussions/29260.

**Custo estimado** (Supabase Free cobre as três faixas em MAU/banco — a
tabela é minúscula, ~15 linhas por usuário no máximo; o que muda é o
volume de e-mail, que sempre exige SMTP próprio):

| usuários | Supabase | SMTP (Resend) | total/mês |
|---|---|---|---|
| 100 | Free — $0 | Free (3.000 e-mails/mês) — $0 | **$0** |
| 1.000 | Free — $0 | Free, no limite (~1-2 mil e-mails/mês estimado) — $0, ou Pro $20 se picos concentrados | **$0-20** |
| 10.000 | Free — $0 (ainda longe do teto de 50 mil MAU), ou Pro $25 quando envolver pagamento | Pro (50 mil e-mails/mês) — $20 | **$20-45** |

Estimativa assume ~1-2 links mágicos por usuário/mês (cadastro + login
ocasional — sessão persiste, não manda e-mail toda vez). Confirmado nos
sites oficiais (supabase.com/pricing, resend.com/pricing,
supabase.com/docs/guides/platform/going-into-prod) em 2026-09-06 — preço
muda, conferir antes de decidir se já faz tempo.

**Limitação conhecida, aceita por ora**: conquista é calculada no client
(`verificarConquistas()`) e só depois enviada pro Supabase — dá pra abrir
o DevTools e forjar um id de conquista direto no `localStorage` ou até
inserir direto na tabela via `supabase.auth`/REST se a pessoa souber o
próprio token. Validar de verdade exigiria rodar o motor no servidor, que
não existe (o jogo é `index.html` estático, sem backend próprio além do
proxy de IA). Vale resolver quando existir pagamento ou ranking global de
verdade — hoje o custo de forjar (abrir DevTools, entender a estrutura)
já filtra a imensa maioria, e não há prêmio nenhum em jogo.

## Tela inicial (2026-09-09), SUBSTITUÍDA pelo menu do revamp (2026-09-26)

O que está abaixo descreve a tela antiga; ficou como histórico. O menu atual
está em "Interface nova (revamp 2026-09-26)". O que continua valendo daqui:
link de desafio pula o menu, e o fluxo de recuperação de senha.


Antes, `boot()`/`ready()` iam direto pra tela de nome — sem menu, sem
marca, sem link pra conta ou pra termos. `screenInicio()` é a nova
primeira tela: `OCTÓGONO` grande (`--stamp`, o vermelho de sempre),
frase curta embaixo, menu à esquerda (Jogar/Opções/Conta/Histórico,
letras grandes brancas, hover desliza + muda pra vermelho — sem cor
nova, dentro da paleta), rodapé com Termos/Privacidade/Contato. Mono,
sem canto arredondado, sem gradiente — mesma linguagem visual do resto.

**Link de desafio PULA a tela inicial de propósito** — `ready()` chama
`lerDesafio()` antes de decidir a tela: se veio de um link de amigo
(`?d=...&s=...`), vai direto pra `screenName()` como sempre foi; senão,
`screenInicio()`. Quem clicou num link específico já sabe o que veio
fazer aqui — forçar passar pelo menu primeiro seria atrito de graça.

Menu: "Jogar" → `screenName()` (fluxo de sempre). "Opções" → mesmo
`abrirConfig()` do ícone de engrenagem (que continua existindo, é
overlay global, não muda). "Conta" → `screenConta()` (login/cadastro,
ver "Contas" acima). "Histórico" → `screenHistorico()` real (ver
"Histórico" abaixo) — aprovado pelo usuário, não é mais placeholder
("item de menu que não faz nada é pior que item que não existe").

**Esqueci minha senha (2026-09-09)**: `resetPasswordForEmail()` manda
o e-mail; o link volta pra ESTA página, o Supabase dispara o evento
`PASSWORD_RECOVERY` sozinho (via `onAuthStateChange`, registrado uma
vez dentro de `getSupabase()` na primeira chamada) e `screenNovaSenha()`
abre — sem rota nem parâmetro na URL pra gerenciar. `definirNovaSenha()`
chama `updateUser({password})`.

`node testar.js interface` estendido pra clicar "Jogar" de verdade
(era `UI.screenName()` chamado direto, contornando a tela inicial —
com ela existindo agora, isso testaria o caminho errado).
`node testar.js inicial` (novo, 24 asserções): navegação dos 4 itens do
menu, formulário de conta com um Supabase FALSO
(`window.supabase.createClient` mockado — `criarAmbiente()` não tem de
propósito, mesmo motivo do áudio/localStorage) confirmando que
`criarConta()`/`entrarComSenha()`/`entrarComGoogle()`/
`enviarRecuperacaoSenha()`/`definirNovaSenha()` chamam os métodos
certos do Supabase com os argumentos certos, incluindo o evento
`PASSWORD_RECOVERY` disparado manualmente no teste (captura o callback
que `onAuthStateChange` registrou, chama com `"PASSWORD_RECOVERY"`) e
confirma que `screenNovaSenha()` abre sozinha. Provado com dente.

## Interface nova (revamp 2026-09-26)

Spec completo em `docs/superpowers/specs/2026-09-26-revamp-ui-design.md`;
planos por fase em `docs/superpowers/plans/`. Pedido do dono: sair do visual
"texto cru" e construir menu e hub novos com identidade própria, no nível de
jogo de console. Decisões medidas/combinadas antes de codar, uma por vez.

**Identidade "Noite de Luta"** (transmissão de PPV). Tokens no topo do
`estilo.css`: fundo `#07080B`, superfícies `#11131A`/`#1A1D26`, vermelho
`#D7261E` como cor de ação, dourado `#D4A017` só pra cinturão/lendário/Pro,
texto osso `#F2EEE6`. Fontes Anton (títulos), Barlow Condensed (interface),
Barlow (texto). Card com dois cantos cortados em diagonal (`.cartao`, a
assinatura visual), granulação sobre a tela, fundo com foto duotone. As regras
antigas de "sem gradiente, sem canto, vermelho raro" caíram de propósito junto
com a identidade antiga.

**Arquivos.** O `<style>` inteiro saiu pro `legado.css` sem nenhuma mudança
(provado com screenshot idêntico pixel a pixel antes/depois); visual novo mora
no `estilo.css`, carregado depois. O JS continua no `<script>` único do
`index.html` (o `testar.js` e a semente dependem disso): bloco "INTERFACE NOVA"
logo antes de `boot()`.

**Roteador.** `irPara(rota, param)` + endereço no hash (`#/menu`,
`#/ranking`, `#/conta/pro`...). Botão voltar do navegador funciona
(`popstate`), rota desconhecida abre a 404 interna, caminho desconhecido no
site cai no `404.html`. `screenInicio()`, `screenHistorico()` e
`screenPlanoPro()` continuam existindo como atalhos pro roteador porque
código antigo e testes chamam esses nomes. **Cuidado que já foi pego antes de
dar problema**: o Supabase devolve o token de login no hash; `lerRota()`
reconhece (`auth:true`) e ninguém reescreve a URL nesse caso, e o
`redirectTo` do Google e da recuperação de senha usa `urlRetornoAuth()`
(endereço sem o hash da rota), senão o token chegaria como
`#/conta#access_token=...`.

**Molde de tela.** `montarTela({fundo, titulo, voltar})` monta fundo,
cabeçalho com **Voltar** e corpo; toda tela nova usa. Transição: corte
diagonal vermelho (`#corte`) cobrindo a troca; com `prefers-reduced-motion`,
troca direto.

**Menu** (`screenMenu`): Nova carreira e Continuar grandes, Ranking,
Atualizações e Conta médios com prévia (top 3 do placar, 2 últimas
atualizações, e-mail e status Pro). Opções viraram só a engrenagem;
Histórico e Plano Pro moram na Conta.

**Páginas**: Atualizações (lista `ATUALIZACOES` escrita à mão, cada item
conferido contra o `git log`), Ranking (placar global; lê a tabela `placar`
que a fase 3 cria; sem tabela, mostra estado vazio), Conta (sem login:
formulário + vitrine do Pro; com login: abas Perfil, Plano Pro, Carreiras
encerradas, Conquistas), Continuar (3 espaços; a fase 3 liga o save),
Termos e Privacidade. (Créditos existiu até 2026-09-28; saiu a pedido do
dono. O crédito dos sons CC BY foi pro painel da engrenagem e a nota ISC
do Lucide pra dentro do próprio `img/icones.svg`.)

**Ícones**: sprite `img/icones.svg` com símbolos do Lucide (ISC, nota de
licença num comentário no topo do próprio sprite); `ICONE(nome)` devolve o `<svg><use>`. Nenhum emoji ou
caractere fazendo papel de ícone: a vitrine do Pro tinha 5 emojis e as setas
do carrossel eram `‹ ›`, trocados. A suíte `rotas` reprova emoji em tela nova.

**Imagens**: `img/gerar.py` gera os fundos pelo OpenRouter
(`google/gemini-3-pro-image`) e aplica o tritom preto/vermelho/osso com
granulação, em WebP desktop (1920px) e recorte retrato pro celular. A chave
nunca fica no repositório: o script lê `~/.octogono-openrouter`. Regras dos
prompts: sem pessoa real, sem rosto reconhecível, sem marca.

**Teste**: `node testar.js rotas` (menu, Voltar em toda tela, 404, hash do
Supabase, a rota Créditos fora e a nota do Lucide no sprite, ranking com
pódio, sem emoji/travessão). Dente provado:
tirar o Voltar do molde reprova 7 telas; tirar a proteção do hash reprova com
o token virando nome de rota. Verificação visual com screenshots em 1440, 820
e 380 px (puppeteer-core com o Chrome instalado, ferramenta fora do repo).

## Save (revamp fase 3, 2026-09-27)

Até 3 carreiras em andamento por conta. Recarregar a página não perde nada.

**O save é dado, não tela.** `montarSave()` guarda `me`, `st`, a semente,
divisão, modo, rosto, rival, adversários já enfrentados, raros já usados e
o **estado interno dos 8 geradores** (`mulberry32` ganhou `.estado()` e
`.restaurar()`; a sequência não mudou, provado contra valores gravados
antes). `POOL`/`LADDER`/`RANKING` saem de divisão + modo e não vão no save.
A tela é redesenhada a partir de `st.registro` (uma entrada por luta, com
evento, raro, dilema e entrevista em `extras`), que antes só existia no
DOM. `linhaBout()`/`linhaExtra()` desenham igual na hora e ao retomar.

**Prova:** `node testar.js save` joga uma carreira pelo caminho real,
interrompe na luta 11, salva, retoma num sandbox zerado e termina: sai
exatamente a mesma carreira de quem jogou direto, luta por luta. Dente
provado: sem restaurar o gerador principal diverge na luta 12; sem os
adversários já enfrentados, na 14.

**Anti-trapaça no reload.** A luta roda round a round com uma escolha do
jogador depois do 1º round, então não dá pra "gravar o resultado antes".
`lutar()` grava a semente da luta (o mesmo `rng()` de sempre) em
`PENDENTE` antes da narração; a escolha do round 1 é gravada assim que
feita. Recarregar no meio refaz a MESMA luta com a MESMA escolha
(`retomarPendente()` → `rodarLuta()`). Dilema aberto grava o texto já
gerado (`abrirDilema(dPronto)`): recarregar reabre o mesmo, sem pedir outro
à IA. Brecha conhecida e pequena: recarregar nos ~3 s entre enviar a
resposta do dilema e o julgamento voltar deixa responder de novo.

**Save coerente em qualquer instante (revamp fase 5).** Três buracos
fechados, cada um com teste na suíte `hub` que reprovava antes:
- **Oferta aberta** vai pro save (`PENDENTE` tipo `oferta`, os nomes e o
  ganho de cada carta). Antes, comprar na loja ou trocar de aba com a oferta
  aberta gravava o `rng` já avançado e recarregar sorteava OUTRA oferta.
- **Dilema esperando a IA**: a semente vai pro `PENDENTE` no instante do
  sorteio, antes da resposta. Antes, recarregar nesse intervalo perdia o
  dilema (a carreira seguia sem ele e divergia da direta).
- **Escolha na luta aberta**: `PENDENTE.escolhaRngAntes` guarda o estado do
  `escolhaRng` de antes do trio e o save usa esse estado enquanto a escolha
  não foi feita. Antes, recarregar com a escolha aberta sorteava outro trio.

**A carreira mora em `#/carreira`.** Recarregar a página nela abre o save
mais recente do usuário (`retomarMaisRecente()`); antes o endereço ficava
em `#/nova` e recarregar caía no assistente de nova carreira. O fim de
carreira tira o endereço de lá (o save da carreira acabada é apagado).

**Onde grava.** `localStorage` na hora (chave `save:<userId>:<espaço>`) e
tabela `saves` do Supabase 2 s depois (um upsert por rajada). Entre
aparelho e nuvem vale o mais novo (`listarSaves()`). Indicador: "Salvando",
"Salvo", "Sem conexão, salvo neste aparelho" (fixo no canto nas telas do
menu; na carreira, na barra do hub). Também
grava na compra da loja, no evento de IA (chega depois da luta), na
entrevista e ao sair da aba. Carreira encerrada apaga o save (o histórico
vai pra `carreiras_usuario` e o placar). `VERSAO_SAVE` sobe se o formato
mudar; save de outra versão aparece com aviso e não carrega.

## Placar (revamp fase 3, 2026-09-27)

Página Ranking: carreiras encerradas de todos os jogadores. Tabela
`placar` com leitura pública e **sem policy de escrita**: só
`api/placar.js` grava, com a service role, depois de conferir a sessão
(JWT), as regras de `api/_placar-regras.js` e o limite de 20 envios por
24 h. O `user_id` gravado vem do token, nunca do corpo. Pontuação = nota
bruta do `grade()` × 100, arredondada pra baixo (0 a 10.000; 89,996 é A,
igual à letra). As regras recusam o que é impossível pelo jogo; carreira
forjada e plausível passa (o motor roda no navegador). `node testar.js
placar` testa a regra com uma carreira real e o endpoint com `fetch` falso.
**O endpoint só roda depois do merge + deploy** (função serverless).

**Pontos de legado (nome dado em 2026-09-28).** O dono achou o número ao
lado de cada jogador sem nome ("suponho que sejam pontos"). Também havia
duas escalas pro mesmo número: o fim de carreira mostrava "78 de 100" e o
ranking "7.823". Agora é um número só, com nome, nos dois lugares:

- `grade()` devolve `pontos` (a nota × 100, pra baixo, o mesmo que vai
  pro placar em `corpoPlacar`) e `partes`, as cinco parcelas da nota:
  pico no ranking (até 4.000), melhor vitória (até 3.000), aproveitamento
  (até 1.200), vitórias antes do fim (até 800) e cinturão (1.000). Cada
  parte arredonda pra baixo e o que sobra vai pras de maior fração (maior
  resto), então a conta mostrada sempre fecha o total;
- fim de carreira: "3.320 pontos de legado" embaixo da letra, com as
  cinco partes; a linha de envio diz com quantos pontos entrou;
- ranking: a página explica o que conta; o pódio mostra "pontos de
  legado" e cada linha "pontos" embaixo do número; a prévia do menu, "pts".

A soma de sempre ficou na mesma ordem (a faixa da letra no servidor
depende do mesmo número). Testes: `rotas` (nome no pódio, nas linhas e na
explicação) e `hub` (fim com o nome, sem "de 100", 5 partes, o mesmo número
do placar, e 400 carreiras sorteadas com as partes fechando o total). Dente
provado: pódio sem o nome, fim na escala antiga e partes sem o maior resto
reprovam.

## Nova carreira em 5 passos (revamp fase 4, 2026-09-27)

A criação do lutador virou um assistente: Nome, Visual, Divisão e modo,
Rival, Draft (link de desafio: Nome, Visual, Draft, "de 3"). Cada passo é
a MESMA função de antes (`screenName`, `screenCriador`, `screenDivisao`,
`screenAtivarRival`, `renderDraft`), com a mesma lógica; muda a moldura
(`montarPasso()`: "Passo n de 5", barra de progresso, fundo próprio,
Voltar pro passo anterior) e o visual (CSS escopado em `.tela-criacao`).
No draft, Voltar só existe antes da 1ª carta (depois ela já gastou
orçamento e sorteio).

**Truque que evitou reescrever o CSS do draft:** dentro de `.tela-criacao`
as variáveis ANTIGAS (`--panel`, `--line`, `--ink`, `--stamp`, `--mira`...)
são redefinidas com a paleta nova. O `legado.css` e o SVG do octógono
continuam usando os nomes de sempre e já saem na identidade nova.

**`bloqueioPro(elemento)`**, componente único de recurso Pro travado (spec
seção 9): sem Pro, o recurso fica a 35% de opacidade, sem clique, e o único
ponto clicável é o selo "Assine o Pro" (leva a `#/conta/pro`); com Pro,
devolve o elemento intacto. Estreou em "Seja uma lenda" (antes o clique
mostrava uma nota) e em "Sim, quero um rival" (antes abria a oferta do Pro
no meio da criação). A trava de verdade continua no servidor.

**`meuPro` fresco antes da tela travada (achado em produção, 2026-09-27).**
`bloqueioPro()` decide pela variável `meuPro`, que é só cache do cliente.
Ela era conferida na Conta, no Plano Pro e ao começar ou retomar a
carreira, nunca ao abrir o jogo: um Pro que entrava e ia direto pra Nova
carreira via Seja uma lenda e o Rival travados, e o selo levava pra tela
de pagamento. Agora ela é conferida em quatro pontos:

- em `INITIAL_SESSION`, quando o jogo abre com sessão salva;
- em `SIGNED_IN`, a cada login (e zera em `SIGNED_OUT`);
- em `comConta()`, antes de abrir o assistente ou o Continuar (espera no
  máximo 2,5 s);
- nas telas do assistente que nasceram travadas: elas conferem de novo e
  redesenham quando a resposta disser Pro (`reconferirPro()`).

Tela nova com `bloqueioPro()` fora da carreira precisa do mesmo cuidado.
Suíte `rotas`. No mesmo conserto: conta Pro sem data de expiração
(`expira_em` nulo, plano "unico" ou liberada à mão) aparecia como "Pro até
31/12/1969" com o formulário de renovar. Agora diz "sem data de
expiração" e não oferece pagamento, porque um pagamento novo gravaria 30
dias e encurtaria o acesso.

## Hub da carreira e noite de luta (revamp fase 5, 2026-09-27)

A tela da carreira virou um hub: barra fixa (retrato, nome, cartel, luta N
de 22, dinheiro, seguidores, save, Menu) e 7 abas com fundo próprio:
Painel (arena), Lutador (vestiário), Cartel (túnel), Mídia (sala de
imprensa), Loja (academia), Cards (parede de fotos) e Conquistas (troféus).
No celular as abas viram barra inferior com 4 ícones e "Mais" (folha com
Loja, Cards e Conquistas). Loja, Cards e Conquistas deixaram de ser
sobreposição sem saída; toda aba tem "Voltar ao painel". Plano:
`docs/superpowers/plans/2026-09-27-revamp-fase-5.md`.

**A lógica não mudou de lugar, só o container.** O jogo continua achando
tudo por id (`#next`, `#escolha`, `#stage`, `#live`, `#play`, `#bouts`,
`#ficha`, `#phone`, `#painelTreinador`...). `montarTelaCarreira()` monta a
casca nova e põe cada id na aba ou na etapa certa. Por isso as suítes que
dirigem a carreira (interface, narracao, save, pro) passaram quase sem
mudança.

- **Painel**: bloco da próxima luta (com as ações), última luta carimbada,
  caminho até o cinturão com barra, posição com seta, lesão, 2 posts da
  repercussão.
- **Lutador**: ficha em tale of the tape. Cada atributo mostra o valor
  atual (com o delta combinado de sempre) e as três camadas que formam ele:
  base do draft, treino, eventos e lesão. Camada zerada não aparece.
- **Cartel**: resumo (vitórias, derrotas, métodos, lutas de cinturão) e uma
  linha por luta. A linha reabre a narração inteira daquela luta:
  `st.registro` guarda agora `seg` (seguidores depois), `fa` (medidor de fã)
  e `narracao` (as linhas `[relógio, tipo, texto]`). Campos opcionais: save
  antigo abre sem narração e sem gráfico. `VERSAO_SAVE` continua 1 (mudança
  só aditiva).
- **Mídia**: feed, medidores e gráfico de seguidores por luta (SVG).

**Noite de luta** é uma camada em tela cheia (`#noite`) com etapas Oferta,
Camp, Coletiva, Entrada, Luta, Resultado. Ela só troca de etapa DEPOIS que o
estado do jogo mudou (`nextFight`, `telaCamp`, `telaColetiva`,
`iniciarTelaLuta`, `finishFight`); não decide nada.
- Voltar só antes da luta e nunca sorteia de novo: a oferta fica em
  `ofertaAtual` e é redesenhada (`telaAdversario(guardadas)`). Voltar da
  oferta fecha a noite com a oferta de pé; o Painel oferece voltar a ela.
- Carta da oferta compara alcance, base e lutas: só dado público de ficha.
  Atributo de luta do adversário continua escondido (ver `COUNTER_ATTR`).
- Entrada: 1,5 s de tale of the tape, pulável, só no manual e sem
  `prefers-reduced-motion`. Só atrasa o começo da narração; o round é
  simulado no mesmo ponto da sequência (mesma luta com e sem entrada).
- Luta: placar no topo, narração, e golpes/quedas/knockdowns ao lado,
  atualizados no FIM de cada round narrado (mostrar antes seria contar o
  resultado). Escolha na luta por cima da narração.
- Resultado: VITÓRIA ou DERROTA gigante sobre fundo de confete ou luz
  apagada, bolsa, seguidores e posição contando. No automático a noite
  segue na etapa da luta.
- **Pós-luta**: raro, evento da IA, dilema e convite de entrevista nascem
  num embrulho por luta (`novoPosLuta()`), e o embrulho inteiro vai pro
  Cartel logo depois da linha da luta quando a noite fecha ou a próxima
  começa (`arquivarPosLuta()`). Evento da IA que chega atrasado cai no
  embrulho certo e é registrado na luta dona dele (`registrarExtra(x, luta)`).

**Pro**: coletiva e entrevista usam o `bloqueioPro()` (a vitrine com selo
no rótulo e oferta no clique saiu, com `seloPro()` e `abrirOfertaPro()`).
O componente agora também põe `inert` no elemento: o miolo sai do teclado,
não só do mouse. Na coletiva, "Pular" fica fora do bloqueio.

**Sair da carreira.** O Menu da barra salva e sai. `pararCarreira()` limpa
os timers (narração, automático, entrada) e troca `CARREIRA_TOKEN`; toda
continuação assíncrona (feed, evento da IA, dilema, julgamento, coletiva,
entrevista, timers) guarda o token de quando começou e desiste se ele
mudou. Antes, uma resposta atrasada da IA escrevia na carreira que
estivesse na tela, inclusive uma carreira nova.

**Fim de carreira e cards em imagem.** O fim de carreira usa o molde novo
(nota gigante com parecer, legado, números, ações). Os cards em canvas
(fim de carreira, momento, prévia do Pro) usam a paleta e as fontes da
interface, esperam `document.fonts` antes de medir texto e desenham por
trás a foto da série de fundos do jogo (no momento, a cena que combina com
o que aconteceu). Sai o cabeçalho "Ficha do Lutador". Knockdown deixou de
ser chamado de "queda" no Cartel e no fim (queda é takedown, como na
narração e na entrevista).

**Testes**: suíte nova `node testar.js hub` (casca, Painel, Lutador,
Cartel, Mídia, noite, save em qualquer instante, saída, `#/carreira`, fim
de carreira), toda checagem com dente provado. Conserto no ajudante
`jogarCarreiraAte`: ele parava UMA luta depois do alvo quando o automático
começava e terminava a luta alvo dentro da mesma drenagem.

## Regras de texto (revamp fase 7, 2026-09-27)

Todo texto do jogo segue três regras (spec, seção 11; amostras aprovadas
pelo dono antes de aplicar ao resto):

1. **Zero travessão** (— e –). No lugar: ponto, vírgula, dois-pontos ou
   parênteses. Fala de personagem vai entre aspas. Intervalo de anos usa
   hífen (2005-2014). Marcador de vazio também não é travessão: some (bio
   sem era não mostra a era) ou vira "?" (vértice do octógono ainda vazio).
2. **Sem frase de efeito**: nada de "não é X, é Y", fecho em aforismo,
   "sua jornada começa agora", "de verdade" como reforço, trio de
   adjetivos, pergunta retórica chamando pra ação, exclamação em série.
3. **Texto concreto**: número, nome, fato. Botão diz o que faz.

As 10 amostras aprovadas:

| antes | depois |
|---|---|
| Fim do round 2 — Kayo levou. | Fim do round 2. Kayo levou. |
| …na troca — 18 a 0. | …na troca: 18 a 0. |
| …só respondeu "quem?" — a sala riu. | …só respondeu "quem?". A sala riu. |
| Poucos apostavam em você contra Alex — o que mudou? | Poucos apostavam em você contra Alex. O que mudou? |
| Islam segue como campeão de verdade — a unificação vem por aí. | Islam continua campeão, e a próxima luta é a unificação. |
| …a disputa contra Islam pode vir, ou não — lesão do campeão, política… | Você é o desafiante. A disputa contra Islam pode vir ou não: depende de lesão do campeão, política e prioridade da organização. |
| Não tem cartel pra julgar — só a decisão de não ter um. | Não há cartel pra julgar. |
| …Às vezes em primeiro, às vezes em quinto, mas sempre citado. | Kayo entra em toda lista dos melhores da história da divisão. |
| Provoca o adversário de verdade — a reação dele muda o hype… | Provoque o adversário na coletiva. A reação dele muda o hype e a pressão da luta seguinte. |
| Onde você mora agora combina com quem você virou… | Casa nova e mais visível: mais gente acompanha sua carreira. |

**Imagem concreta não é frase de efeito.** Os cards de momento foram
escritos de propósito com imagem pra dar vontade de postar (ver "Card de
momento"). Ficaram as imagens: "levantou o cinturão e não soltou pra
nenhuma foto", "não deixou o locutor terminar de apresentar o adversário",
"o reinado durou menos que a fila da pesagem". Saiu o fecho que explica ou
moraliza: "tinha tudo pra vencer, menos a luta", "O corpo lembrava, a mão
levantou do mesmo jeito", "Isso vira lenda ou vira alerta, depende de quem
conta", o "chamam de chato, chama de eficiente". O legado do fim de
carreira (`LEGACY`) e o parecer da nota (`TIERS_NOTA`) viraram fato com
número (cartel, finalizações, cinturão), no molde da amostra 8.

**Texto da IA.** Os prompts (`api/ai.js`) ganharam `REGRA_TEXTO` dentro
da `VOZ` (abre o system de todo kind) e pararam de usar travessão, porque o
modelo imita a pontuação que lê. Pela regra geral (restrição no prompt não
é garantia), o navegador filtra também: `tentarChamadaIA()` passa todo
resultado por `limparTextoIA()`, que aplica `semTravessao()` em cada texto
(fala que começa com travessão perde o travessão; intervalo entre números
vira hífen; depois de pontuação o travessão só some; no meio da frase vira
vírgula). Save gravado antes disso mostra narração, evento e texto de IA
limpos: `linhaExtra()` e a narração do Cartel passam pelo filtro na hora
de mostrar. A resposta digitada pelo jogador fica como ele escreveu.

Medido em 2026-09-27, direto no OpenRouter com o mesmo corpo do handler
(qwen3.7-flash, 6 chamadas por kind, 36 por versão do prompt): JSON válido
36/36 antes e depois; travessão em 0 de 36 respostas antes e depois (o
modelo atual quase não usa, então regra e filtro são garantia pra troca de
modelo); frase proibida em 2/36 antes e 0/36 depois; custo de ~130 tokens
de entrada a mais por chamada. A regra só vale em produção depois do deploy
do `api/ai.js`; até lá, o filtro no navegador cobre.

**Termos e Privacidade**: só a pontuação mudou. Redação e
`VERSAO_TERMOS_PAGAMENTO` ficaram iguais.

**Testes**: `node testar.js texto`. Varre todo literal de texto do
`index.html` (aspas, crases e o que está dentro de `${}`; um tokenizador
pula comentário e regex, porque um regex simples perdia o "—" aninhado em
`${cheio?x:"—"}`), o texto visível do HTML e do `404.html`, e reprova
travessão, as frases proibidas e emoji ou seta em caractere no lugar de
ícone. Joga uma carreira inteira e confere o texto que chega na tela.
Confere `semTravessao()`, o filtro no resultado da IA e que nenhum arquivo
de `api/` usa travessão fora da própria regra (a descrição da cobrança
aparece pro jogador na página de pagamento da Asaas).

## Auditoria final (revamp fase 8, 2026-09-27)

**Feed da IA não mexe mais na semente.** `resolveFeed()` sorteava a
persona de cada post da IA com o `rng` principal, DEPOIS da resposta
chegar. Com a IA no ar, a sequência da carreira dependia de quando o feed
chegava e de quantos posts vieram: link de desafio e save deixavam de
reproduzir a carreira. Offline (moldes locais) nunca aparecia, por isso
nenhuma suíte pegava. Agora a persona sai de um gerador próprio, semeado
pela semente da carreira e pelo número da luta, sorteado antes do `await`.
Teste na suíte `save`: carreira com posts da IA = carreira sem IA (antes
divergia).

**Eventos de funil novos** (spec, seções 6 e 12), além de `abriu`,
`terminou_draft`, `terminou_luta_1`, `terminou_luta_5` e `terminou_22`:

- `criou_conta`: cadastro por e-mail com sucesso (`criarConta()`,
  `via:"email"`); 1º login pelo Google de uma conta criada há menos de
  2 minutos (`via:"google"`, uma vez por conta neste aparelho, porque o
  `SIGNED_IN` se repete).
- `confirmou_email`: a página abriu com `type=signup` no hash (volta do
  link de confirmação), conferido no `boot()` antes do Supabase limpar.
- `continuou_save`: `retomarCarreira()` (Continuar e recarregar em
  `#/carreira`), com o número da luta.

Testes nas suítes `rotas` e `hub`.

**`html{overflow-x:hidden}` saiu.** Era o remendo do `#controls` antigo
(ver "Dívidas conhecidas"). Medido no Chrome sem a regra, em 1440, 820 e
380 px, 28 telas cada (menu, páginas, portão, os 5 passos da nova
carreira, as 7 abas do hub, cada etapa da noite e o fim): nenhum
transbordo horizontal e nenhum erro de página.

**Teclado virtual.** No celular o teclado cobria o botão de confirmar do
dilema (Decidir), da coletiva (Provocar) e da entrevista (Responder).
`manterBotaoVisivel(campo, botao)`: ao focar o campo, rola até o botão
agora e de novo depois do teclado abrir; com `visualViewport`, rola
também quando a área visível muda. Testes nas suítes `hub` e `pro`;
conferir num celular de verdade continua valendo (o Chrome de mesa não
abre teclado virtual).

**Acessibilidade.** A suíte `interface` ganhou uma varredura sobre tudo
que o caminho completo monta (menu, assistente, draft, carreira, noite,
fim): botão ou link só com ícone precisa de nome (`aria-label` ou
`title`), e nada clicável que não seja botão ou link pode ficar fora do
teclado. Achou e consertou:

- as amostras de cor do criador (pele, cabelo...) não tinham nome; agora
  têm `aria-label` ("Pele 3") e `aria-pressed`;
- as linhas do Cartel, que abrem a narração da luta, não chegavam pelo
  teclado; agora têm `tabindex`, `role="button"`, `aria-expanded`, e
  Enter ou Espaço abrem.

O foco visível global (`:focus-visible`) mudou do `legado.css` pro
`estilo.css`, com a cor nova, pra sobreviver quando o legado sair. Toda
regra que tira o `outline` troca por outro destaque (borda ou fundo).

**Peso, medido em produção (comprimido, 2026-09-27).** Ao abrir o menu:

| arquivo | peso |
|---|---|
| `index.html` | 165 KB |
| `fighters.json` | 101 KB |
| CSS (os dois) | 38 KB |
| fundos | ~100 KB cada (menu: fundo + 5 cards ≈ 450 KB) |
| fontes | ~100 KB |

Depois do 1º clique:

- a música do menu (2 MB, em streaming: toca antes de terminar de baixar);
- o lote de efeitos (~0,5 MB).

No celular os fundos usam as variantes `-m`. Nada mudou: o que pesa é
imagem e música, e as duas já baixam só quando aparecem.

**Integrações conferidas sem gastar nada:**

- Supabase com a chave anon, sem login:
  - `assinaturas`, `saves`, `aceites_termos`, `carreiras_usuario`,
    `conquistas_usuario` e `pagamentos_processados` não devolvem linha
    nenhuma;
  - inserir em qualquer uma delas, e no `placar`, é recusado pela RLS
    (401, código 42501);
  - o `placar` é de leitura pública.
- `api/criar-pagamento`, `api/webhook-asaas` e `api/placar` recusam
  chamada sem token (401).
- Ativação do Pro de ponta a ponta com pagamento de verdade fica com o
  dono (PENDENCIAS item 37).

## Painel de admin (2026-09-28)

`#/admin`, pedido do dono pra controlar Pro, banimento e ranking. Quem
entra:

- o **dono**, pelo e-mail na variável `ADMIN_DONO_EMAIL` da Vercel (fora
  do código, que é público no GitHub);
- quem estiver na tabela `admins`. Só o dono adiciona ou tira admin.

**A tela só mostra; quem decide é `api/admin.js`.** Cada chamada confere o
token de quem pediu e se ele é admin, com a service role. Quem não é admin
e abre `#/admin` vê a mesma 404 de endereço inexistente. O link "Painel de
admin" só aparece no Perfil de quem o servidor confirma como admin.

**Abas:**

- **Jogadores:** busca por e-mail, com cadastro, último acesso, Pro (até
  quando), banido e quantas carreiras. Ações:
  - dar Pro sem prazo (plano "unico", sem data) ou por 30 dias;
  - tirar Pro;
  - banir, com motivo, e desbanir.
- **Ranking:** apagar uma carreira do placar.
- **Admins:** só o dono vê.
- **Registro:** as últimas 100 ações (quem, o quê, em quem, quando), da
  tabela `admin_log`. Toda ação que muda algo grava ali.

Ação que tira ou apaga pede confirmação na própria tela: o 1º clique troca
o rótulo, o 2º executa.

**Banir faz três coisas:**

1. bloqueia o login no Supabase Auth (`ban_duration` de ~100 anos);
2. esconde as carreiras da conta no ranking (a política de leitura do
   `placar` passa por `esta_banido()`);
3. faz `api/placar.js` recusar envio (403), o que cobre a sessão que
   ainda estava aberta.

Desbanir desfaz o 1 e o 2. Admin e dono não podem ser banidos, e ninguém
bane a si mesmo.

**Banco:** tabelas `admins`, `banidos` e `admin_log` e as funções
`esta_banido()` e `admin_listar_usuarios()`, no fim do
`supabase_schema.sql`. É preciso rodar o SQL uma vez no painel do Supabase.
A lista de jogadores vem de `admin_listar_usuarios()`, que só a service
role executa.

**Testes:** `node testar.js admin`. Cobre:

- o acesso: comum, admin e dono;
- que nada é escrito sem permissão;
- Pro com e sem prazo;
- banir e desbanir, e as proteções;
- que só o dono mexe em admin;
- apagar do ranking;
- o placar recusando banido;
- a tela: 404 pra quem não é admin, as abas e a confirmação em 2 cliques.

## Personagens (revamp de 2026-09-28)

Pedido do dono: os personagens estavam "sem graça e sem personalidade", e
nada podia ser inventado sem base. Proposta com amostras aprovada antes de
codar; saiu só o protetor bucal, que o dono não gostou.

**Traço novo (`bonecoSVG`, boneco v2):**

- meio-corpo, pra caber braçadeira, tatuagem e kimono;
- traço grosso, sombra em bloco do lado direito e luz de palco vermelha na
  borda esquerda (identidade "Noite de Luta");
- rosto sempre na encarada;
- a mesma proporção do antigo (largura × 1,2), então nenhum layout mudou;
- continua auto-contido (xmlns, sem imagem externa), e os cards em canvas
  usam o mesmo SVG.

**Arquétipos (`ARQUETIPOS`)**, cada um tirado de um estilo real e da
tradição dele:

| arquétipo | o que tem | base |
|---|---|---|
| Muay Thai | mongkol na cabeça, prajiad nos braços | faixa trançada da academia, tirada pelo mestre antes do gongo; braçadeira da bênção da família ([YOKKAO](https://yokkao.com/pages/muay-thai-mongkhon-and-pra-jiad)) |
| Jiu-jitsu | orelha de couve-flor, kimono | hematoma de anos de pegada na cabeça ([Hayabusa](https://www.hayabusafight.com/blogs/community/what-is-cauliflower-ear-causes-prevention-and-protection)) |
| Wrestling | porte pesado, orelhas estouradas, nariz quebrado | luta olímpica |
| Sambo do Cáucaso | barba sem bigode, papakha | chapéu de lã do Daguestão usado na entrada ([papakha](https://en.wikipedia.org/wiki/Papakha)) |
| Boxe | roupão com friso, trança nagô, corte na sobrancelha com fita | |
| Brigão | moicano, bigode ferradura, tatuagens | |
| Kickboxing | capuz na caminhada, dreads | |
| Veterano | bandeira nos ombros, barba grisalha, cicatriz, olho roxo | |

O arquétipo só dá o ponto de partida. Toda peça pode ser trocada nas
outras abas do criador:

- corpo;
- cabelo (9 cortes);
- barba (6 estilos);
- marcas (orelha, nariz, cicatriz);
- tatuagem;
- entrada (roupa, prajiad e cor).

"Sortear" e "Pular" sorteiam um arquétipo e variam a pele e a cor do
cabelo.

**Config v2:** `{v:2, pele, porte, cabelo, corCabelo, barba, orelha, nariz,
cicatriz, tatuagem, entrada, prajiad, corEntrada, arquetipo}`, cada campo
um índice da lista de mesmo nome. Save e ranking antigos (v1) guardam
índices das listas do boneco antigo. `normalizarRosto()` converte na hora
de desenhar:

- cabelo, barba, cicatriz e cor viram a peça mais próxima;
- olho, sobrancelha e boca saem;
- a cor do calção vira a cor de entrada.

Nada é regravado: o ranking continua com o rosto antigo e desenha no traço
novo.

**Só o seu lutador tem rosto.** Os lutadores reais continuam sem retrato
(direito de imagem, ver o topo deste arquivo).

**Testes:** `node testar.js personagem` confere:

- os 8 arquétipos e todas as peças desenhando sem erro;
- a proporção;
- a conversão de rosto antigo (inclusive lixo e `null`);
- a aba de arquétipos do criador.

## Coletiva e entrevista (reta final, 2026-09-28)

**Pedido do dono:** "coletiva e entrevistas estão sem graça, não ocorre nada
demais e sempre estão surgindo perguntas genéricas demais; a IA precisa
sempre inovar nas perguntas e nos eventos". Antes, a abertura da coletiva
saía de 6 frases fixas escolhidas pelo nome do adversário (o mesmo
adversário repetia a mesma frase) e a pergunta da entrevista de 2 moldes
por tipo de fato.

**Layout (mapa desenhado pelo dono, `Mapa.png`, só local):** o lutador do
jogador à esquerda (boneco + nome), a imprensa à direita (foto do lugar +
repórter), a conversa no meio (a fala do repórter aponta pra direita, a
resposta do jogador aponta pra esquerda) e "O que aconteceu" embaixo. No
celular os dois cards ficam lado a lado em cima e a conversa desce. O card
da direita nunca é o adversário: lutador real não tem retrato (direito de
imagem). Componentes: `montarCena`, `pecasDaConversa`; CSS `.cena-*` e
`.balao-*` no `estilo.css`.

**Imagens novas** (`img/gerar.py`, US$ 0,14 cada): fundos `coletiva` (sala
de coletiva cheia de fotógrafos de costas) e `entrevista` (área de
entrevista com câmera e grade ao fundo), e os retratos 2:3 dos cards
`coletiva-mesa` (mesa com microfones) e `entrevista-microfone` (mão com
microfone de TV). `gerar.py` ganhou `RETRATOS` (2:3, um arquivo de 720px).

**A cena é da IA** (kinds novos no `api/ai.js`, só Pro): `coletivaCena` e
`entrevistaCena` devolvem `{evento, pergunta}`: algo que acontece na sala
antes da pergunta e a pergunta do repórter. Sem número nenhum: quem mexe no
jogo continua sendo a reação à resposta (`coletiva`, `entrevista`), que
agora recebe o evento e a pergunta da cena. Anti-repetição, mesmas lições
do evento de vida:

- **tema forçado** por chamada, de uma cartela por carreira sem reposição
  (`proximoTemaCena`): 10 temas na coletiva (provocação, encarada, cartel,
  camp, algo dá errado na sala, equipe do adversário, torcida, bolsa,
  pesagem, estilo) e 10 ângulos na entrevista, cada um com a versão da
  derrota (`ANGULO_NA_DERROTA`: medido, com um ângulo só o modelo perguntou
  "a quem você dedica essa derrota?");
- **fato obrigatório** na entrevista: a mesma prioridade fixa de antes
  (cinturão > lesão > zebra > método), escrita por extenso
  (`fatoDaEntrevista`), que a pergunta TEM que tratar;
- **cenas recentes** da carreira no prompt (`st.cenasRecentes`) e pergunta
  igual a uma recente descartada.

**Repórter fictício, escolhido no cliente** (`REPORTERES`, `VEICULOS`, por
hash da semente e da luta): a IA recebe o nome pronto e nunca escolhe
jornalista. **Nada disso consome gerador da carreira**: hash e um gerador
local descartável pra embaralhar a cartela (a suíte `hub` confere os 8
geradores antes e depois de abrir a coletiva).

**Medido no modelo de produção antes do deploy** (Qwen 3.7 Flash, prompt do
`api/ai.js` local, 3 rodadas, 50 cenas): pergunta em 49 de 50, nenhum
travessão, 1 pergunta genérica na 1ª rodada e nenhuma depois do ajuste. O que o prompt sozinho não
segurou e o cliente conserta (`limparPergunta`, `eventoDosOutros`):
pergunta aberta com o nome do repórter ("Renata Brum: ...") perde o
prefixo; pergunta em terceira pessoa ("Fulano pergunta se") e evento que
começa pelo lutador do jogador (quem decide o que ele faz é o jogador) caem
fora; aspas em volta saem. Na coletiva, o evento perde a frase que afirma
resultado da luta futura (`semResultadoDeLuta`). Qualquer falha cai no
molde local.

**Sem IA** (grátis, falha, pausa): moldes locais por tema
(`cenaColetivaLocal`, 1 ou 2 por tema, com cartel, camp, estilo, sequência,
rival, cinturão e estreia) e, na entrevista, `perguntaEntrevista` com um
evento local coerente com o resultado. Grátis vê a cena inteira com o molde
local e a resposta travada pelo `bloqueioPro`.

**Fluxo:** a coletiva fica em `#escolha` (etapa "coletiva"); a entrevista
virou etapa própria da noite (`entrevista`, fundo do lugar, conta como
Resultado no cabeçalho). Enquanto a pergunta não chega, o balão mostra que
o repórter está escrevendo e Responder espera. A cena fica guardada por
luta (`cacheColetiva`/`cacheEntrevista`): voltar do camp e ir de novo, ou
sair da entrevista e voltar, mostra a mesma cena sem outra chamada.
Entrevista: "Voltar ao resultado" sai sem responder (o convite continua);
respondida, o convite vira o resumo (é o que vai pro Cartel) e "Continuar
pra próxima luta" segue, ou volta pro resultado na última luta e com
dilema aberto. Na coletiva, sem reação da IA a tela mostra uma frase
neutra e o Ir pra luta, em vez de pular pra luta sem mostrar nada.

**O que a coletiva muda, agora na tela (2026-09-28).** O dono perguntou se
era bug a coletiva não mexer em fã e seguidores. Não é: ela mexe na LUTA.
O hype (×0,85 a ×1,20) multiplica o hype daquela luta, e os seguidores e o
fã saem dele depois do resultado; a pressão, quando a reação narra o
adversário perdendo o foco, muda um atributo dele só naquela luta (até
10%). O problema era ser invisível. Agora "O que aconteceu" mostra "Hype
desta luta +17%" e "Adversário abalado: defesa de queda −8% nesta luta"
(`efeitoColetivaHTML`), ou "sem mudança"; e o resultado mostra, embaixo
dos seguidores, quanto veio da coletiva ("+77 da coletiva"). A parte da
coletiva é a mesma conta de `finishFight()` sem o multiplicador dela, só
pra exibir (nada muda no que a luta rende); fica também no registro da
luta (`reg.coletiva`, campo opcional). Testes: `pro` (a cena mostra o
hype e o adversário abalado, e "sem mudança" sem reação) e `hub` (luta
com hype +20% mostra a parte, luta sem coletiva não mostra).

**Custo:** uma chamada a mais por coletiva e por entrevista respondidas,
só pra quem é Pro (a cena gasta ~1.300 a 1.400 tokens de entrada e ~85 de
saída; no preço do Qwen 3.7 Flash, menos de US$ 0,0001 por cena).

**Teste:** suíte `pro` reescrita pra cena (ordem das colunas, card da
direita sem o adversário, pergunta da IA e fallback, cache, saneamento,
variedade do molde, cartela sem repetição, etapa da entrevista, voltar,
última luta). Dente provado: colunas trocadas, cena sem IA, tema com
reposição e molde fixo reprovam.

## Memória narrativa (etapa 1 do plano de evolução, 2026-09-29)

**Pedido do dono:** coletiva, resultado e entrevista formam uma história
contínua, e a imprensa recupera declarações REAIS do jogador, nunca
inventadas. **Achado da auditoria:** até aqui a entrevista NÃO sabia nada
da coletiva (a resposta da coletiva não era gravada em lugar nenhum); a
referência que o dono viu jogando foi a IA inventando.

**O que é guardado** (`st.memoria.falas`, vai no save; sem tabela nova):
cada resposta do jogador na coletiva e na entrevista vira uma fala com o
texto literal inteiro, um trecho literal, o tom (provocação, promessa,
respeito, neutro) e, se houver, a promessa verificável (vencer, nocaute,
finalização, decisão, até o round N). No máximo 20 falas por carreira.

- **Nenhuma chamada nova de IA.** A reação que já existia (`coletiva`,
  `entrevista`) devolve também o campo `declaracao`. Medido no modelo real
  (30 respostas variadas): estrutura válida 30/30, trecho literal 28/30,
  tom certo 27/30, promessa certa 25/30.
- **O trecho é sempre palavra do jogador.** A IA só aponta qual parte é a
  mais forte; o jogo recorta essa parte do texto dele, na grafia dele
  (`trechoLiteral`, comparação sem acento e sem pontuação). Se o que a IA
  apontou não está no texto, fica o começo da resposta.
- **Quem julga a promessa é o jogo**, pelo resultado real
  (`avaliarPromessa`): cumpriu, "parcial" (venceu, mas não do jeito que
  prometeu) ou não cumpriu. Na decisão entra o placar real dos juízes
  (medido: sem ele, a IA inventava um).

**Onde a memória aparece:**

- **Entrevista da mesma luta:** se na coletiva ele provocou ou prometeu, a
  pergunta TEM que tratar disso, ligada ao resultado
  (`situacaoDaFala`: cumpriu, parcial, quebrou, confirmou a provocação ou
  perdeu depois de provocar). A IA recebe a fala literal e o desfecho; a
  tela mostra "Na coletiva você disse: '...'" com o resultado. O molde
  local (sem IA) faz o mesmo, uma pergunta diferente por desfecho.
  Medido: 14 de 20 perguntas da IA citaram a fala literal e passaram no
  filtro; as outras 6 caíram no molde local.
- **Coletivas futuras** (`falaParaColetiva`): revanche sempre traz a fala
  do encontro anterior; fora isso, só às vezes (no máximo uma coletiva a
  cada três, e nem toda chance vira cobrança), só fala recente e marcante,
  e cada fala é cobrada no máximo duas vezes. Nada disso consome gerador.
- **Cartel:** a coletiva entra como extra da luta (`reg.extras`).

**Ninguém põe fala na boca dele** (`falasAtribuidasOk`). Regra mecânica:
toda frase que atribui fala ao jogador ("você disse", "você prometeu",
"você chamou ... de", "suas palavras", o nome dele com verbo de fala)
precisa trazer uma citação entre aspas (duplas ou simples) que esteja
numa fala real dele. Nas perguntas e cenas da coletiva e da entrevista, e
no evento de vida e na cena do dilema, atribuição sem citação reprova o
texto (entra o molde local; o evento some). Na reação e no desfecho do
dilema, paráfrase da resposta de agora é normal e passa; citação é
conferida. Limite conhecido: forma indireta rara ("mandou avisar que...")
não é pega pela regra; o prompt proíbe. Medido: 24 de 24 eventos passam
(a primeira versão derrubava "mandou Pix" por engano).

**Teste:** suíte nova `falas` (fala literal, trecho inventado, tom e
promessa inválidos, texto inseguro, teto de falas, promessa julgada pelo
resultado, uma pergunta por desfecho citando a fala, fluxo real coletiva,
luta e entrevista com a fala e o resultado indo pra IA e pra tela, zero
chamada nova, anti-invenção em pergunta, reação e evento, revanche e
cobrança espaçada, reabrir a coletiva sem contar duas vezes, save). Dente
provado: sem fechar a fala no fim da luta, sem a trava anti-invenção, com
o trecho da IA sem conferir, sem o cache da cena, sem aspas simples e com
"mandou" solto, reprova.

## Entrevista pós-luta com pauta: perguntas que fazem sentido (2026-10-01)

**Pedido do dono:** a entrevista fazia perguntas artificiais, desconexas e
sem sentido. Exemplos dele: depois de "O treinador ainda estava com a
toalha no ombro quando o repórter chegou", a pergunta "O seu treinador ainda
estava com a toalha no ombro quando o repórter chegou. Ele disse algo
específico no corner sobre a decisão dos juízes?"; e "A arena te empurrou
ou te pressionou?". A coletiva estava boa e ficou como está.

**Causa (achada no código e no modelo):**
- a pergunta juntava quatro peças sem relação: uma situação sorteada da
  cartela ("o que o treinador disse no corner"), uma forma que mandava
  partir do evento ("parte do que outra pessoa fez ou disse no evento"), o
  evento da chegada do repórter e um fato obrigatório (o método);
- o prompt começava com a voz do feed ("torcedor no Twitter... erros de
  digitação são bem-vindos") e o formato dizia que a pergunta "nasce do
  evento";
- a IA recebia pouco da luta (método, round, quedas) e nada do que o
  motor registra round a round;
- os moldes locais tinham escolha vazia (o "empurrou ou pressionou" era um
  molde nosso) e pergunta genérica;
- nenhum filtro barrava pergunta incoerente: só segurança, fala atribuída
  e repetição.

**O que mudou** (`index.html`, `api/ai.js`; a coletiva usa o mesmo código
de antes):
- **Fatos da luta** (`fatosDaLuta`): método, round e tempo desde o início
  do round, quem levou cada round ("Fim do round N. Fulano levou." no log),
  knockdowns, tentativas de finalização, quedas da luta toda e o placar. O
  motor tem UM placar, não três juízes: decisão é "apertada" (um ponto) ou
  "clara", nunca dividida nem unânime. `resumoDaLuta` escreve isso pra IA,
  sem ambiguidade de tempo.
- **Pauta** (`PAUTAS_ENTREVISTA`, 21 pautas): o que o repórter quer
  descobrir, escolhida pelos fatos. Nível 3 é fato forte (cinturão, lesão
  nova, zebra), nível 2 é fato desta luta (nocaute, nocaute rápido,
  finalização, nocauteado, finalizado, caiu e venceu, derrubou e perdeu,
  virou depois de perder o 1º round, começou bem e perdeu, decisão apertada
  ou clara, quedas, tentativa de finalização) ou continuidade (revanche,
  volta depois de derrota, tropeço depois de vitória, com alternância);
  nível 1 é a pauta geral, pra luta com pouca informação, ainda presa a
  ela. A mesma pauta não volta na entrevista seguinte se houver outra, e a
  variação de cada pauta gira na carreira (vai no save). Repórter por pauta
  num mapa só da entrevista (`REPORTERES_DA_PAUTA`), com os mesmos 12
  repórteres, veículos e linhas editoriais.
- **Moldes locais por pauta**, com o fato real na pergunta. A fala da
  coletiva (memória) continua com as regras de antes e ganhou perguntas
  mais naturais (sem sim ou não solto, sem presumir que o plano deu
  errado); o ponto final da fala sai da citação quando ela fica no meio da
  frase ("Você disse 'Vou nocautear ele no segundo round' antes da luta").
- **Evento é só cenário** da chegada do repórter, coerente com o resultado;
  a pergunta nunca parte dele.
- **Prompt da entrevista** com voz de repórter (`VOZ_REPORTER`) e formato
  próprio (`ENTREVISTA_FORMATO`): a pergunta parte do que aconteceu na luta
  e segue a pauta; a linha editorial muda o jeito de perguntar, nunca o
  assunto.
- **Filtro de coerência** (`motivoPerguntaRuim`), na resposta da IA e nos
  moldes. Barra: repetir o evento; juízes, cartões ou decisão numa luta que
  não foi pros cartões; fim de luta que não aconteceu (inclusive
  "finalizar" num nocaute); decisão dividida, unânime ou "três cartões";
  fala de treinador, adversário, torcida ou juiz sem evidência; escolha
  vazia ("te ajudou ou te atrapalhou"); pergunta genérica ou sem ligação
  com a luta; emoção afirmada; placar descrito errado; tempo invertido
  ("faltando 35 segundos" num nocaute aos 35 segundos); minutos que não
  batem com o relógio; resultado invertido; golpe ou posição que não está
  no log; assunto fora da luta (contrato, bolsa, próxima luta); fórmula de
  questionário ("qual foi o detalhe técnico", "senhor"); zebra invertida;
  vantagem que ele nunca teve ("onde você perdeu a vantagem" numa derrota
  sem round, queda ou knockdown a favor dele; round vencido conta pelo log
  ou pelo placar); pergunta de sentimento ("o que você sentiu"); margem da
  decisão inventada sem placar ("a luta não foi decisiva", "equilibrada");
  a pauta vazando no texto ("Nosso foco é entender..."); o total de quedas
  posto num round só (o motor só tem o total; knockdown tem round no log e
  vale); segundos e "1min50" conferidos com o relógio, como os minutos ("1
  minuto e 50 segundos" agora passa: antes a conferência só via "1 minuto"
  e barrava a pergunta certa); "guarda" (o log nunca registra guarda).
  Frase sobre luta passada ("da última vez") não entra nas regras do
  método de hoje. Limpeza, só na entrevista: "O repórter pergunta:", nome
  entre aspas, o nome inteiro do repórter abrindo a pergunta como vocativo
  ou apresentação ("Sônia Barreto, você perdeu...", "Otávio Paranhos aqui
  na Rádio Três Rounds.") e o vocativo "Lutador,". A `limparPergunta`, que
  a coletiva também usa, não mudou.

**Antes e depois, medido nos mesmos contextos:** os moldes antigos
(código da `master` antes desta mudança), nos 26 contextos com 4 sementes,
dão 43 perguntas de 104 (41%) que o filtro novo barra: 31 sem ligação com
a luta ("Como a sua família passa a semana de luta?"), 7 escolhas vazias
("Faltou plano ou faltou execução?", "Você perdeu a luta em pé ou no
chão?"), 3 genéricas, 2 com juiz num nocaute (essas duas falam do árbitro
levantando o braço e seriam aceitáveis). Os moldes novos: 0 de 104, e 0 na
varredura de mais de 60 mil.

**Avaliação qualitativa** (suíte `entrevista` com `ENTREVISTA_IA=real`): 26
contextos de luta, sete rodadas no modelo de produção (182 chamadas, cerca
de US$ 0,008 no total). As rodadas 1 a 6 serviram pra achar erros e
desenhar regras; a 7 foi feita depois de todas as regras, sem ajuste
nenhum em cima dela. Na 7: 14 perguntas da IA aceitas e 12 com o molde da
mesma pauta. Das 26 que o jogador vê, 24 estão no padrão pedido (fato da
luta, intenção clara, português falado), uma é desajeitada ("Como foi essa
vitória por 30 a 27 para confirmar essas palavras?") e uma tem um trecho
sem sentido ("com uma queda no placar final"). Nenhuma repete a narração,
atribui fala a alguém ou inventa fato que os dados permitam conferir. O
que a IA errou e o filtro barrou: nocaute chamado de "finalizou",
"senhor", fala do jogador parafraseada ou inventada ("Você disse que
controlou o segundo round"), vantagem que ele nunca teve, "guarda",
segundos errados, nome do repórter como vocativo. 429 do provedor em
rodada seguida também cai no molde (no jogo é uma chamada por luta, com
uma retentativa em 429).

**Fallback:** nas rodadas 6 e 7, 12 de 26 respostas da IA (46%) caíram no
molde, contra 20 a 25% na narrativa anterior. É o filtro mais rigoroso
funcionando: o molde é da mesma pauta e passa no mesmo filtro. "Senhor"
aparece em 8 de 121 respostas (6,6%), quase tudo do repórter de rádio; a
linha editorial dele não mudou porque a coletiva usa a mesma.

**Consumo:** a mesma chamada de cena e a mesma de reação por entrevista. O
prompt da entrevista ficou menor: cerca de 1.300 tokens de entrada por
cena (1.326 medidos na rodada 7), contra 1.800 a 2.000 por cena antes.

**Teste:** suíte nova `entrevista` (em `tudo`): 26 contextos (pauta, molde
com o fato, juízes só em decisão, evento coerente, fala da coletiva, pedido
pra IA), varredura de todos os moldes de todas as pautas em milhares de
lutas (mais de 60 mil perguntas, todas aprovadas no filtro), os exemplos
ruins do dono barrados pelo motivo certo, perguntas boas aprovadas, limpeza
de prefixo e aspas, e o prompt da coletiva igual ao de antes (impressão
digital). Modos: `ENTREVISTA_IA=real` (gasta crédito; teto
`ENTREVISTA_MAX`) e `ENTREVISTA_REAVALIAR` (refaz o filtro nas respostas
gravadas, sem custo). Dente provado com 22 quebras (cada regra e cada
limpeza removida em memória com `BALANCO_SUBST` reprova o teste dela).

## Narrativa das cenas: menos repetição, mais continuidade (2026-10-01)

**Pedido do dono:** coletivas e entrevistas repetitivas. Reduzir a
repetição, criar continuidade e diversidade real, sem chamada nova de IA,
sem banco, sem mexer no motor nem nos 8 geradores, com save antigo abrindo.

**Medido antes** (suíte `diversidade`: carreiras de 22 lutas pelo caminho
real, respondendo coletiva e entrevista; mede estrutura, não só texto
igual): 10 temas e 10 ângulos girando; a pergunta da entrevista ancorada
no método da luta em 75% das cenas da IA; a fala da coletiva citada em
67% das entrevistas; revanche citando fala antiga toda vez; exemplo fixo
do prompt virando cópia; repórteres sem personalidade; moldes locais com
46% (coletiva) e 61% (entrevista) de perguntas quase repetidas.

**O que mudou** (`index.html`, `api/ai.js`):
- **Dupla situação × estrutura** (`escolherCena`): 23 situações de
  coletiva e 18 de entrevista, 8 formas de pergunta (dado, comparação,
  escolha, hipótese, terceiro, pessoa, bastidor, direta); cada situação
  só aceita as formas que combinam com ela. Situação sai de cartela sem
  reposição; a forma usada há mais tempo vem primeiro. Situação com fato
  importante (cinturão, rival, lesão, sequência, estreia, revanche, volta
  depois de derrota, reencontro, virada, tropeço) tem prioridade quando
  vale. Gerador local e descartável: nenhum dos 8 do save. A memória
  entre carreiras (localStorage, `memSituacoes*`) só reordena, nunca é
  histórico da conta. O molde local usa a mesma dupla (`cenaLocal`).
- **Prompt sem exemplo fixo**: saíram o JSON de exemplo, as listas de
  eventos e o "assim: 'as palavras dele, copiadas'" (medido: a IA copiava
  o texto). Entram a situação, a forma, o evento de base da situação, os
  8 últimos acontecimentos (curtos) e as recentes **sem a fala citada**
  (medido: a IA reaproveitava fala antiga em cena que não podia citar).
  O repórter não é assunto do evento; gente de fora do card não tem nome.
- **Repórter com linha editorial e veículo fixo** (`LINHA_EDITORIAL`),
  escalado pelas situações que combinam com ele, nunca o mesmo duas cenas
  seguidas do mesmo tipo.
- **Passado só quando escolhido, e alternado**: o dossiê (`dossieCarreira`:
  últimas 3 lutas e sequência, só do registro) vai pra IA só quando a cena
  olha pro passado (fio, forma comparação, fato "luta anterior"); depois
  de uma cena que olhou pro passado, a seguinte do mesmo tipo não olha. A
  revanche cita a fala do encontro anterior uma vez só. Na entrevista do
  Pro, a fala da coletiva volta só quando o resultado a torna notável
  (promessa cumprida, quebrada ou pela metade; provocação seguida de
  derrota); na amostra grátis volta sempre. Lesão é fato obrigatório uma
  vez por lesão. O fato da entrevista gira entre método, momento que mais
  pesou (do log da luta), quedas e luta anterior; cinturão e zebra
  continuam obrigatórios.
- **Filtro de similaridade** (`cenaParecidaDemais`): cena da IA com
  metade das palavras de conteúdo da pergunta (ou 0,55 do evento) em comum
  com uma das 8 últimas cai no molde local. Sem nomes, números nem a fala
  citada. Medido nas 76 cenas reais de antes: nenhum falso positivo em
  cena diferente; tudo que passou do limiar era o mesmo acontecimento
  reescrito. O descarte tem motivo (`avaliarCenaDaIA`).
- **Anti-invenção sem falso positivo**: retomar a fala já citada na mesma
  cena ("não do jeito que você disse") passa; "garantiu" só conta como fala
  com "que", dois-pontos ou aspas; nome do lutador depois de preposição é
  objeto. Prefixo "Nome (Veículo):", só o primeiro nome do repórter e
  vocativo pra repórter saem da pergunta.

**Resultados** (mesmas carreiras e respostas, antes e depois):

| | moldes locais antes | depois | IA real antes | depois |
|---|---|---|---|---|
| coletiva: perguntas quase repetidas | 46% | 24% | 9% | 11% |
| coletiva: eventos quase repetidos | 45% | 29% | 14% | 7% |
| coletiva: categorias de evento por carreira | 8,3 | 11,3 | 8 | 13 |
| entrevista: perguntas quase repetidas | 61% | 16% | 5% | 0% |
| entrevista: âncora no método | 69% | 36% | 75% | 73% |
| entrevista: cita fala antiga | 67% | 27% | 68% | 32% |
| entrevista: olha pro passado | 72% | 40% | 77% | 45% |
| entrevista: categoria repetida em 3 cenas | 47% | 33% | 55% | 36% |

**Consumo**: as mesmas chamadas (uma de cena e uma de reação por coletiva
e por entrevista, a suíte confere). O prompt de cena cresceu de 6.426
para 7.435 caracteres (cerca de 250 tokens, menos de US$ 0,00001 por
chamada). As medições com a IA real foram autorizadas pelo dono: 4
rodadas, cerca de US$ 0,02.

**Fallback da IA** (cena descartada que vira molde local): 14% antes; 20%
(coletiva) e 25% (entrevista) na confirmação; com os três ajustes finais
de falso positivo, a reavaliação das respostas gravadas dá cerca de 19%.
O que sobra é descarte por regra: paráfrase de fala em cena de cobrança
(a regra anti-invenção não aceita fala sem citação), invenção e
repetição real do modelo.

**Banco**: nada. Save: `st.narrativa` é campo novo e opcional (cartela,
situações, formas, passado, fatos); save antigo abre e cria na hora, e a
`cartelaCena` antiga é ignorada.

**Teste**: suíte `diversidade` (em `tudo`, só moldes locais, com limites:
coletiva ≤ 30% de perguntas quase repetidas e ≥ 10 categorias por
carreira; entrevista ≤ 25%, ≤ 40% citando fala, ≤ 50% olhando pro
passado; consumo igual). Modos: `DIVERSIDADE_IA=seco` (tamanho do prompt,
sem rede), `DIVERSIDADE_IA=real` (só com autorização do dono, teto
`DIVERSIDADE_MAX`), `DIVERSIDADE_REANALISAR` (recalcula das cenas
gravadas). Na `falas` e na `pro`: dupla, filtro (com 17 cenas reais sem
falso positivo), continuidade sem forçar, rodízio do fato, dossiê, save
novo e antigo, anti-invenção. Dente provado com 19 quebras.

## Amostra grátis do Pro (etapa 2 do plano de evolução, 2026-10-01)

**Pedido do dono:** quem não tem o Pro precisa experimentar a coletiva e a
entrevista completas, com IA, e ver a continuidade entre as duas. A cota
fica no servidor, presa à conta autenticada, e criar carreira nova não
renova nada. Os eventos com IA e a progressão do grátis continuam como
estavam.

**No jogo** (`amostraLiberada`): sem o Pro, a coletiva da 1ª luta
(`fightNo` 0) e a entrevista da 1ª luta (`fightNo` 1) chamam a IA com
`amostra:true`, a resposta fica aberta e uma faixa "Amostra do Pro" diz o
que está acontecendo. O convite da entrevista vem aberto, com o selo da
amostra. Os efeitos são os mesmos do Pro (hype e pressão da coletiva; fã,
seguidores e dinheiro da entrevista). Na entrevista da amostra, qualquer
fala da coletiva volta, ligada ao resultado (no Pro, só provocação e
promessa voltam): é a continuidade que a amostra mostra. Da 2ª luta em
diante, tudo como antes (vitrine travada pelo `bloqueioPro`, sem chamar a
IA).

**No servidor** (`api/ai.js`, `api/_pro.js`): o Pro é conferido primeiro
e nunca gasta cota. Sem o Pro, só passa com `amostra:true`, login válido
(`/auth/v1/user`) e `consumir_uso_ia(conta, 'amostra', limite)` dizendo
sim. A função conta e confere o limite num comando só (`INSERT ... ON
CONFLICT DO UPDATE ... WHERE`): chamadas simultâneas disputam a mesma
linha, o Postgres trava a linha e a segunda já vê a primeira contada. A
janela é de 24 h a partir da 1ª chamada. A conta é a única chave: nada que
o jogo manda (semente, carreira, luta) entra nela.

| situação | resposta | o jogo mostra |
|---|---|---|
| sem login válido | 401, `cota: "sem-sessao"` | cena travada, "Não deu pra conferir a amostra" |
| cota da conta usada | 403, `cota: "esgotada"` | cena travada, "já foi usada nas últimas 24 horas" |
| banco fora, função ainda não criada, resposta estranha | 503, `cota: "indisponivel"` | igual ao sem login |
| IA falhou depois de contar (OpenRouter 500/429, timeout, rede, vazio, não JSON, dado inválido) | 5xx | a unidade volta (`devolver_uso_ia`), uma vez só, e só se a janela em que foi contada ainda for a atual |

Recusa não conta nada. Sem a confirmação do banco, nunca libera.
`consumir_uso_ia` devolve o início da janela em que contou a chamada; o
servidor guarda e manda de volta na devolução, e o banco só desconta se
essa ainda for a janela atual (se outra chamada abriu janela nova no
meio, a devolução não mexe nela). A conta da conta é só a do token,
conferida no Supabase (`/auth/v1/user`): id mandado pelo navegador é
ignorado. Cada pedido conta no máximo uma vez e devolve no máximo uma vez
(a trava `devolvida` no `api/ai.js` vale até quando o erro cai no
`catch`, que tenta devolver de novo). `chamadas` é a conta da janela
atual, já com as devoluções; `total` é histórico, toda chamada que já foi
contada, e nunca diminui. Erro de
chamada da amostra não devolve texto da IA no eco de diagnóstico (senão o
erro, que devolve a unidade, virava IA de graça). No cliente, a recusa
fica em `AMOSTRA_NEGADA` pelo resto da sessão (o logout limpa), só pra
não oferecer de novo; quem trava é o servidor.

**Custo da amostra:** 4 chamadas (cena e reação da coletiva, cena e
reação da entrevista). O limite começa em 6 por conta a cada 24 h: sobra
folga pra recarregar a página no meio e pra retentativa. Uma segunda
carreira no mesmo dia pega o que sobrou (em geral, a coletiva) e recebe a
recusa no resto.

**Ajustar o limite:** variável `LIMITE_AMOSTRA_IA` na Vercel (Production),
número inteiro. `0` desliga a amostra sem consultar o banco; vazia ou
inválida vale 6. Variável nova ou mudada só vale depois de um deploy novo
(a Vercel congela as variáveis em cada deploy).

**Monitorar o consumo** (SQL Editor do Supabase, só leitura):

```sql
-- contas que usaram a amostra nas últimas 24 h, e quantas bateram o limite
select count(*) as contas, count(*) filter (where chamadas >= 6) as no_limite
from uso_ia where grupo = 'amostra' and janela_inicio > now() - interval '24 hours';
-- chamadas contadas desde sempre (inclui as devolvidas porque a IA falhou)
select sum(total) from uso_ia where grupo = 'amostra';
```

Erro do banco aparece nos logs da função na Vercel (`consumir_uso_ia` ou
`devolver_uso_ia` seguido do status). No jogo, cada recusa dispara o
evento `ia_null` com motivo `amostra_esgotada`, `amostra_indisponivel` ou
`amostra_sem-sessao` (Vercel Analytics, se ligado; a etapa 5 confere).

**Limites conhecidos:** conta nova é de graça, então quem criar várias
contas ganha 6 chamadas por conta a cada 24 h; o controle de abuso por
conta e por origem é da etapa 6. O servidor não sabe em que luta a
chamada acontece (o cliente manda o que quiser); não importa, porque o
teto é da conta.

**SQL:** fim do `supabase_schema.sql` (tabela `uso_ia`, funções
`consumir_uso_ia` e `devolver_uso_ia`, só criação). Executado pelo dono em
2026-10-01, antes do deploy (master `98dbdc9`). Conferido de fora com a
chave pública: tabela vazia pra anon, funções com "permission denied".
Validado em produção pelo dono: amostra completa na 1ª luta, 2ª carreira
com a coletiva liberada e a entrevista bloqueada, 3ª carreira bloqueada,
Pro fora da cota, banco com `chamadas = 6` e `total = 6`.

**Teste:** suíte nova `amostra` (servidor, com banco e OpenRouter falsos:
libera e conta, 7ª recusada, carreira nova não zera, recusa não conta,
sem sessão, Pro não gasta, banco fora em 4 formas (inclusive a resposta
da versão antiga da função), IA falha em 6 formas e devolve uma vez na
janela certa com o total intacto, devolução dupla barrada, janela virada
no meio, id do navegador ignorado, retentativa, 10 simultâneas com limite
6 em 20 rodadas,
simultâneas com falha no meio, `LIMITE_AMOSTRA_IA`, evento e feed fora da
cota) e 5 testes novos na `hub` (coletiva e entrevista da amostra abertas
com `amostra:true`, continuidade com o resultado, recusa esgotada e
indisponível travando com o motivo, luta 2 travada sem chamar a IA). Dente
provado nos dois lados: sem devolver a unidade, banco fora liberando,
amostra pulando o Pro, sem conferir a sessão, erro com texto da IA,
devolução sem a janela, id da conta vindo do navegador, resposta antiga
aceita, sem a trava de devolução dupla, sem
`amostra:true` na cena, amostra em qualquer luta, cliente ignorando a
recusa, entrevista só com provocação e promessa, cena só do molde local:
reprova. O teste achou um bug na hora: `LIMITE_AMOSTRA_IA` vazia virava 0
(`Number("")`) e desligava a amostra.

## JxJ: jogador contra jogador (2026-10-01)

**Pedido do dono:** um modo competitivo completo. Cada conta cria o
próprio lutador (estilo, categoria, aparência), evolui por uma árvore de
habilidades e luta contra os lutadores das outras contas. Cada troca é
uma escolha simultânea e escondida, resolvida no servidor. Fila com
tolerância, rating Glicko-2, ranking, temporadas de 8 semanas, torneios
de 8 com cinturão, rivalidade pelos fatos, fichas que nunca compram
vantagem. Free com 1 lutador e 1 luta grátis; Pro com 3 lutadores. Sem
tocar na carreira. Spec completa:
`docs/superpowers/specs/2026-10-01-jxj-design.md`.

### Estado e como ligar

**Desde 2026-10-04 o modo está ligado em produção** (a API responde
`ativo: true`) e se chama **Online** na tela: menu, títulos e mensagens.
Rotas (`#/jxj`), código e banco continuam `jxj`. As mensagens do banco que
ainda dizem "JxJ" são traduzidas no `rpc()` de `api/jxj.js`. O texto
abaixo é o passo a passo de quando ele foi publicado desligado.

O código está pronto e publicado **desligado**. Sem `JXJ_ATIVO=true` na
Vercel, toda ação responde 503 e a entrada do JxJ mostra "O JxJ abre em
breve" (o card do menu leva até ela). O banco de produção ainda não tem
as tabelas: rodar a migração é do dono, depois do backup.

1. Backup do banco (Supabase > Database > Backups).
2. SQL Editor: colar e rodar `supabase_jxj.sql` e, depois dele,
   `supabase_jxj_narracao.sql` (reserva e teto da narração por IA,
   auditoria de 2026-10-03). Os dois só criam tabelas, colunas e funções
   `jxj_*` (19 tabelas, 51 funções no total); não alteram nenhuma tabela
   que já existe e podem rodar de novo sem erro. Conferir com
   `select count(*) from pg_proc where proname like 'jxj\_%'` (51).
   Depois, `supabase_jxj_raio.sql` (2026-10-04, diferença de rating na
   fila; seção "Passos finais do lançamento"): 52 funções. O dono rodou as
   três em produção (a do raio em 2026-10-04).
3. Vercel > Settings > Environment Variables: `JXJ_ATIVO` = `true` em
   Production, e Redeploy do deploy atual (variável nova só vale em
   deploy novo; não precisa mudar código).
4. Jogar uma luta com duas contas de verdade antes de anunciar, e só
   então escrever a entrada em Atualizações.

Desligar: `JXJ_ATIVO` diferente de `true` + Redeploy (o banco fica como
está). Apagar tudo do JxJ: `supabase_jxj_rollback.sql`, depois de
desligar e do backup; ele confere antes que nada fora do JxJ depende das
tabelas e, se depender, para sem apagar nada.

### Arquitetura

```
api/jxj.js             rota única (POST {token, acao, ...}): sessão, Pro, limite por ação, payload
api/_jxj-motor.js      combate: puro e determinístico pela semente
api/_jxj-arvores.js    estilos, categorias, árvores, perfil de combate com teto
api/_jxj-rating.js     Glicko-2 (uma luta = um período) e reset de temporada
api/_jxj-regras.js     XP, nível, fichas, conquistas, nome, tolerância da fila
supabase_jxj.sql       tabelas e funções jxj_* (RLS sem policy; só a service_role executa)
index.html             telas em #/jxj/... (o navegador só escolhe)
ferramentas/           PGlite, servidor local, balanço (jxj-balanco.mjs) e E2E (jxj-e2e.mjs)
```

- **O navegador só escolhe.** Manda a ação e os ids. Dano, energia,
  vencedor, rating, XP, nível, fichas e Pro saem do servidor e do banco;
  número mandado pelo cliente é ignorado.
- **Regra de dado no banco, conta no motor.** Slot, principal (72 h no
  relógio do banco), fila, par, ação única por troca, gravação da troca
  uma vez só (versão), fim da luta, temporada e torneio são funções
  `jxj_*` com trava de linha ou de transação. O combate e o Glicko-2 são
  JS, testados em massa; o banco grava o resultado uma vez.
- **Semente com compromisso.** 32 bytes do `crypto` do Node no começo da
  luta; `sha256(semente)` aparece pros dois desde o início; a semente é
  revelada no fim, e a tela de resultado refaz a luta e confere.
- **Sem cron, sem Realtime.** Prazo vencido, temporada e torneio andam na
  próxima chamada de qualquer jogador. A tela consulta o servidor (1,2 s
  na luta, 1,5 s na confirmação, 3 s na fila) e mostra o relógio pelo
  `agora` do servidor.
- **A IA só narra**, uma vez por luta, com os fatos do motor, o filtro de
  texto e a trava anti-invenção; sem IA, molde local.

### Combate

3 rounds de 4 trocas, 20 s por troca (mais 3 s de tolerância de rede).
Quatro famílias de ação, com rótulo pela posição (em pé, por cima, por
baixo). Em pé: Golpes ganha de Pressão, Pressão de Defesa, Defesa de
Queda e Queda de Golpes; Golpes contra Defesa e Queda contra Pressão são
parelhos. "Ganhar" é vantagem na disputa (15 pontos), nunca resultado
garantido: atributo e árvore continuam pesando.

Golpes contra Defesa bate na guarda: 13,5 pontos a menos pra acertar,
60% do dano, metade do risco de nocaute, e o golpe que não entra conta 2
pontos pra quem defendeu. Sem isso, achado pela suíte `jxjmotor`: no
espelho striker, "só golpes" vencia "só defesa" em 73% e a mistura
racional virava 100% golpes.

No chão, a guarda fechada segura a finalização sem anular (tira 47% da
vantagem), e os dois parados dão meio ponto de controle a quem está por
cima; na segunda vez seguida o juiz levanta a luta. Ausência: prazo
perdido vira Defender; dois seguidos dão a troca pro adversário; três,
W.O.; os dois três vezes, luta anulada.

### Variantes de ação (2026-10-04)

**Pedido do dono:** mais opções de ação, que vão trocando, "cada round
você poderá fazer 4 opções de ações apenas, mas vá alterando", com
animação e som.

**Como ficou.** As quatro famílias e o ciclo não mudaram; cada família
ganhou 2 ou 3 variantes por posição (30 no total, `VARIANTES` em
`api/_jxj-motor.js`):

- em pé: Jab e direto, Cruzado, Chute na perna; Double leg, Single leg,
  Queda de quadril; Guarda alta, Sprawl, Esquiva e contra-ataque;
  Pressionar na grade, Clinche e joelhadas, Cortar o octógono;
- por cima: Socos por cima, Cotoveladas, Marteladas; Kimura, Mata-leão,
  Triângulo de braço; Segurar a posição, Pressão de peso; Passar a guarda,
  Ir pra montada;
- por baixo: Golpes por baixo, Cotoveladas por baixo; Raspagem,
  Triângulo; Fechar a guarda, Amarrar os braços; Levantar, Levantar pela
  grade.

A cada round, cada lado recebe uma variante de cada família
(`maoDoRound`): a tela mostra sempre 4 ações, com nome, efeito e custo que
mudam de round pra round. A ordem sai de `sha256(mao:semente:lado)` com
rodízio: família de 3 variantes mostra as 3 numa luta (uma por round), a
de 2 alterna. Como sai da semente, a luta continua refazível do zero e o
banco não mudou (nenhuma coluna nova). O navegador continua mandando só a
família; o servidor calcula a variante e manda só a mão de quem pediu.

A variante muda risco e retorno dentro da família (`mod`): acerto, dano,
nocaute, custo, o quanto expõe à queda, guarda, sprawl, contra-ataque,
travar a perna, cansar, cair já na meia-guarda, pontos por posição na
finalização (o mata-leão é fraco na guarda e forte montado), finalização
por baixo depois da raspagem que falhou (triângulo). Cada troca grava um
evento `escolha` com as duas variantes; os textos dizem o golpe ("Ana
derrubou Bia com o double leg", "Bia defendeu o double leg com o
sprawl"). `VERSAO_MOTOR` 2.

**Tela.** Botão com a variante, a família, o custo, o efeito e o ciclo
("Ganha de Pressão. Perde pra Queda."). Painel da troca anterior: o que
cada um usou, lado a lado, e o que aconteceu. Round novo: as quatro cartas
viram e o rótulo avisa "ações novas na mão". Som e animação saem dos
eventos em forma de dado da vista (`ev`: tipo e quem): golpe treme o card
de quem apanhou, knockdown treme forte, queda mexe na posição,
finalização apertando, sino no fim e no começo do round, nocaute pisca a
tela (a mesma classe `ko` da carreira), vinheta de vitória ou derrota.
Cada efeito toca uma vez (a tela guarda quantas trocas já mostrou); sem
movimento quando o sistema pede menos movimento.

**Narração.** O filtro antigo reprovava qualquer nome de golpe, porque o
motor não tinha nenhum. Agora `golpesForaDosFatos` confere termo a termo:
"cruzado" passa se aconteceu, "kimura" numa luta sem kimura cai no molde
local.

**Balanço das variantes.** `node ferramentas/jxj-balanco.mjs variantes`:
espelho no nível 1, X sempre com a variante, o outro com a mão normal.
Todas entre 48,6% e 52,2% (média dos 4 estilos e de duas amostras; o
teste reprova fora de 44 a 56). Os primeiros números mostraram o Cruzado
forte demais (55,6%, 60,7% no espelho striker) e o Chute na perna fraco
(45,2%): a média de dano e de nocaute dos golpes ficou 1. A Queda de
quadril (cai na meia-guarda) puxava o grappler contra o striker pra
55,9%; com acerto -2 e o Double leg +2, os estilos no nível 1 ficaram
mais justos que antes (47% a 51%, era 44% a 53%). Sem nenhum ajuste, o
motor reproduz exatamente os números da v1 (conferido).

### Balanço medido

Como mede: `ferramentas/jxj-balanco.mjs`. "Jogo racional" = cada lado
sorteia a ação pela mistura de equilíbrio da troca (matriz 4x4 do ganho
de chance de vencer, valor aprendido por regressão logística em lutas
simuladas). "Quem se adapta" = joga o equilíbrio e responde ao que o
outro já repetiu na luta. Os números abaixo são os da suíte (sementes
fixas); as faixas estão nos testes.

| medida | resultado | faixa no teste |
|---|---|---|
| estilos no nível 1 (600 lutas por dupla) | 47% a 51% (era 44 a 53 antes das variantes) | 42 a 58 |
| nocaute / finalização / decisão / empate | 29,7 / 13,9 / 54,7 / 1,7% (finalização era 12,4) | 20-34 / 5-16 / 50-72 / até 5 |
| nível 30 contra nível 1 (mesmo estilo) | striker 74, wrestler 69, grappler 69, counter 79% | 62 a 85 |
| nível 30 contra nível 20 | 53% a 60% | acima de 50 |
| estilos no nível 30 (build típica) | 45% a 57% | 40 a 60 |
| repetir uma ação contra quem se adapta | no máximo 46% (striker só golpes); o resto 37% ou menos | até 50 |
| mistura em pé | nenhuma ação passa de 65% | até 80, 2+ ações com 10%+ |
| valor de cada variante de ação (espelho, sempre na mão) | 48,6% a 52,2% | 44 a 56 |
| valor de cada nó no nível 3 | 0,8 (Entradas) a 5,2 (Eficiência na finalização) | 0,5 a 6,5 |
| duração média da luta | 9,3 trocas de 12 | 7 a 11,5 |
| outra ordem de ramos no nível 30, contra a típica | 48% a 51% | 42 a 58 |
| build híbrida no nível 30 (8 pontos em nós de outro estilo) | 41% a 55% | 35 a 58 |

Rating (`jxjrating`, `jxjtemporada`): o Glicko-2 bate o exemplo do artigo
do Glickman (1464,06 / 151,52 / 0,05999). Temporada simulada com 300
jogadores e a fila de verdade, 8 semanas (13.199 lutas): correlação de
postos entre rating e habilidade escondida 0,92; 95% dos pares com até
115 pontos de diferença (máximo 383); espera mediana 0 s. Depois do
reset, 4 semanas e a correlação volta a 0,95. Lutador novo: erro mediano
de posto de 13% depois de 10 lutas.

**Como a árvore foi calibrada:** cada nó medido no nível 3 contra os 4
estilos. Na primeira versão, 22 dos 48 nós não mudavam nada (menos de 1
ponto): as mecânicas de ponto no chão (transição, passagem, levantar,
saída) mexem numa disputa que já está decidida pela escolha certa no
ciclo. Esses nós ganharam um atributo acompanhante com valor medido
(tabela abaixo). Depois, a build de nível 30 do wrestler ganhava 62 a 65%
dos outros: tirando um nó por vez, o culpado era Entradas (queda), seguido
de Equilíbrio e Controle posicional; eles foram cortados e um fator por
estilo acertou o resto (níveis 20 e 30, pior dupla a 2,3 pontos de 50%).
O nó vale mais ou menos dependendo do estilo porque o mesmo atributo vale
diferente pra cada estilo:

| pontos de vitória por ponto de atributo | golpe | poder | defesa | queda | def. queda | chão | def. chão | cardio | queixo |
|---|---|---|---|---|---|---|---|---|---|
| striker | 0,88 | 0,66 | 0,58 | 0,04 | 0,71 | 0,09 | 0,23 | 0,01 | 0,13 |
| wrestler | 0,11 | 0,08 | 0,22 | 1,30 | 0,40 | 0,30 | 0,11 | 0,80 | 0,07 |
| grappler | 0,15 | 0,11 | 0,15 | 1,33 | 0,34 | 0,74 | 0,06 | 0,42 | 0,09 |
| counter | 0,84 | 0,67 | 0,80 | 0,02 | 0,73 | 0,02 | 0,12 | 0,20 | 0,04 |

(`node ferramentas/jxj-balanco.mjs atributos`: 3 pontos a mais no
atributo, build de nível 1, contra os 4 estilos, 1.000 lutas cada.)
Defesa no chão, queixo e, fora do wrestler e do grappler, cardio valem
pouco; por isso nenhum nó vive só deles.

Limites conhecidos:
- Finalização em 14% das lutas, contra 19% no UFC (era 4% antes do
  ajuste do chão e 12% antes das variantes).
- O "jogo racional" é a mistura de uma troca no começo da luta. No chão
  ele subestima avançar a posição, então as misturas do chão tendem a
  segurar e fechar a guarda. As faixas valem pra esse modelo; jogador de
  verdade vai achar coisa que ele não acha.
- No espelho striker, trocar golpes sempre é a jogada mais segura (46%
  contra quem se adapta): não vence, mas não perde muito.
- O "jogo racional" não olha a mão: escolhe a família pela mistura média
  das variantes. Jogador que lê a mão (usa o mata-leão quando está
  montado, o cruzado quando o outro já está machucado) tira mais do que o
  modelo mede.
- O nó Pressão no solo ganhou +1 de chão em 2026-10-04 (caiu pra 0,44
  com as variantes). `VERSAO_BALANCEAMENTO` continua 1: ela também vive no
  banco (`jxj_config`) e dá respec grátis quando sobe, e nenhuma build
  existe em produção ainda (o JxJ está desligado).
- Custo: uma luta de 12 trocas custa da ordem de 100 a 200 chamadas da
  função por jogador (consulta a cada 1,2 s).

### Economia

Fichas nunca são vendidas e nunca compram atributo. Entram por luta com
rating (10, ou 20 na vitória, até 120 por dia por conta), torneio (30 a
300 pela colocação), fim de temporada (40 a 500 pela posição) e conquista
(25 a 150, uma vez por lutador, fora do teto diário; quem credita é o
banco, em `jxj_dar_conquista`, só quando a conquista é nova). Saem em
respec (400) e molduras (250 a 400; a do cinturão é só de quem tem
título). Todo movimento fica no livro-razão `jxj_fichas`, com motivo.

### Custo e escala

- **Combate sem IA.** A narração é um botão depois da luta, uma chamada
  por luta, guardada e igual pros dois; sem a chave, molde local. Desde a
  auditoria de 2026-10-03 (`supabase_jxj_narracao.sql`): só quem lutou
  pede; uma geração paga por vez (reserva atômica na linha da luta, vence
  em 30 s, então uma chamada que caiu não trava nada); teto diário global
  em `jxj_config` `narracao_ia_dia` (padrão 300, 0 desliga a IA; no teto,
  molde local). Mudar sem deploy: `update jxj_config set valor = '500'::jsonb
  where chave = 'narracao_ia_dia'`.
- **Consulta periódica:** 1,2 s na luta, 1,5 s na confirmação, 3 s na
  fila e na sala do torneio, e para ao sair da tela (token de tela). Cada
  consulta da luta é uma chamada da função e cerca de 3 chamadas ao
  Supabase (sessão, limite, `jxj_luta`). A luta média tem 9,4 trocas; com
  os dois escolhendo rápido ela dura uns 2 minutos e custa da ordem de 100
  consultas por jogador; esperando o prazo inteiro, perto de 200.
- **Limites por conta e por ação** em `jxj_limites` (ex.: 600 consultas
  da luta a cada 10 min, 40 entradas na fila a cada 10 min, 20 criações
  por hora); corpo do pedido até 20 KB; ranking e histórico paginados (50
  por página); índices em ranking por categoria, lutas por lutador, fila
  por categoria e versão, livro-razão por conta.
- **Onde aperta primeiro:** o número de chamadas da função na Vercel
  (a consulta periódica) e, bem depois, a CPU do banco. Primeiro ajuste:
  subir o intervalo da luta quando o jogador já escolheu (só falta o
  outro). Segundo: Realtime do Supabase no lugar da consulta, sem mudar
  regra nenhuma (o servidor continua sendo a fonte da verdade).
- **Monitorar:** erro do servidor sai no log da Vercel como `jxj <ação>
  <mensagem>`; ações de conta (criar, respec, principal, aposentar...)
  ficam em `jxj_log`; o volume sai do próprio banco, por exemplo
  `select date_trunc('day', criada_em) dia, count(*) from jxj_lutas group
  by 1 order by 1 desc`.

### Testes

```bash
node testar.js jxj           # servidor + banco de verdade (PGlite): fluxo, Free/Pro, fila, luta, temporada, torneio, ataques, rollback
node testar.js jxjmotor      # determinismo, invariantes, variantes (mão, tela = troca, efeito, equilíbrio), narração, ciclo, balanço, métodos, evolução
node testar.js jxjarvore     # estrutura, regras de compra, teto, textos, valor de cada nó
node testar.js jxjrating     # Glicko-2 contra o artigo, incerteza, reset, tolerância da fila
node testar.js jxjtemporada  # temporada simulada, reset, lutador novo, progressão, economia
node testar.js jxjtelas      # telas no DOM falso ligadas ao servidor de verdade (mão do round, troca anterior, som uma vez)
```

PGlite (Postgres em WebAssembly) uma vez: `npm install --prefix
ferramentas`. Navegador de verdade: `node ferramentas/jxj-e2e.mjs`
rodado de uma pasta com `puppeteer-core` (sobe o servidor local sozinho,
duas contas, a luta inteira clicando, prints de computador e celular; a
API de produção fica bloqueada). O E2E achou o bug que nenhuma suíte
pegava: clicar num nó da árvore quebrava (o nó da tela não tinha o
ramo), então ninguém conseguia gastar ponto; a `jxjtelas` nasceu dele e
reprova com o mesmo erro se a correção sair.

---

## Passos finais do lançamento (2026-10-04)

Pedido do dono: cinco itens antes do lançamento.

### Logo

Pedido do dono: "quero uma logo profissional do octógono". "Rosto" era a
identidade do site, não um rosto desenhado: a primeira versão (um lutador
dentro do octógono) foi recusada.

**De onde veio.** Conceitos gerados no OpenRouter (gpt-5.4-image-2 e
gemini-3-pro-image). Os dois modelos chegaram, cada um, ao anel octogonal
cortado por um golpe vermelho, e o gemini às letras de cantos chanfrados.
A logo é o redesenho disso em vetor, letra por letra, sem fonte e sem
imagem dentro do arquivo.

**As peças** (todas saem de `img/logo/gerar.py`):
- `simbolo.svg`: o anel do octógono (a jaula vista de cima) cortado por um
  golpe vermelho que afina numa ponta. As duas metades do anel deslizam ao
  longo do corte, pra ler como golpe, e não como o sinal de proibido ou um
  "Ø" (a versão sem o deslize lia assim);
- `palavra.svg`: OCTÓGONO em letras condensadas desenhadas uma a uma, os O
  em octógono e o acento do Ó numa barra vermelha inclinada como o golpe;
- `logo.svg`: o símbolo ao lado da palavra, e `logo-fundo-claro.svg`, a
  mesma em cor da noite pra fundo claro (o vermelho fica);
- `icone.svg`: o símbolo sobre um quadrado escuro, pra aparecer em aba clara
  e escura.

Cores: osso `#F2EEE6`, sangue `#D7261E`, noite `#0B0C10`.

`img/logo/rasterizar.mjs` (puppeteer-core e o Chrome) gera os PNG:
- `icone-32.png`, favicon pra navegador sem SVG;
- `apple-touch-icon.png`, 180×180, o símbolo sobre a noite;
- `compartilhar.png`, o card de 1200×630 do link;
- `discord.png`, 512×512, o ícone do servidor do Discord (o Discord recorta
  em círculo, e o golpe inteiro cabe dentro).

**Onde aparece:** só no ícone da aba do navegador, no `index.html` e no
`404.html`. O dono aprovou a logo e pediu que nada mais no jogo mudasse:
menu, card do link e ícone do iPhone ficam prontos em `img/logo` pra quando
ele pedir. O PNG de 32 px vem antes do SVG e com `sizes`: quem lê SVG fica
com o SVG, e quem não lê usa o PNG.

**Teste:** a suíte `rotas` confere que o ícone da aba, nas duas páginas,
aponta pra arquivo que existe e que o `.vercelignore` não tira do ar, e que
os SVG não dependem de nada de fora (vão por `<img>` ou `<link>`, que não
carregam nada externo). Os scripts do logo ficam fora do deploy.

### Pro a R$ 11,99

`api/criar-pagamento.js` pede R$ 11,99 à Asaas (era R$ 9,99); a tela do
Pro, o botão, os Termos e a Privacidade mudaram junto.

A trava `PRECO_PRO_MINIMO` (`api/_pro.js`) **continua 9,9 de propósito**.
Um Pix de R$ 9,99 gerado antes do deploy e pago depois é pagamento de
verdade e tem que ativar o Pro de quem pagou. Ela continua barrando
cobrança de teste e de valor errado.

Testes na suíte `pagamento`:
- a cobrança nova pede 11,99;
- 11,99 e 9,99 ativam.

### Suporte no Discord

O rodapé do menu troca o e-mail pelo link do servidor do Discord do
Octógono (`URL_DISCORD`, aba nova, ícone da marca do Simple Icons, CC0, no
sprite). Os Termos (seção 14) citam o Discord pra suporte. O e-mail
continua nos Termos e na Privacidade como canal formal, inclusive pra
pedido de dados (LGPD).

### JxJ vira Online

Nome visível em todo lugar: cartão do menu ("Online", com uma descrição
curta e "Jogar online"), título e subtítulo da entrada, ranking, avisos e
erros. O resto (rotas, código, banco) continua `jxj`, pra não quebrar link
salvo nem save.

### Diferença de rating na fila

**Antes de buscar adversário, o jogador escolhe até quanto de diferença
aceita:** 100, 200 ou 400 pontos, ou qualquer diferença. O padrão é 400,
o teto de antes, e a escolha é lembrada no aparelho.

**O par só sai se:**
- a diferença couber no raio dos **dois**;
- e couber na faixa da espera (100 pontos, mais 25 a cada 10 s).

Com "qualquer diferença" dos dois lados, a faixa continua crescendo além de
400. A tela mostra a faixa ("Adversários de 1100 a 1900, se o raio dele
também aceitar você") e, na busca, o limite escolhido e a faixa da hora.

**Banco:** `supabase_jxj_raio.sql` é só aditiva:
- coluna `raio` em `jxj_fila`, com trava dos valores aceitos;
- função nova `jxj_fila_entrar_raio`, que entra na fila pela de sempre e
  grava o raio, numa transação;
- `jxj_fila_parear` refeita com a mesma assinatura. Sem raio, ela se
  comporta igual a antes.

**No banco desde 2026-10-04** (o dono rodou no SQL Editor). O servidor
continua funcionando sem a migração: o `rpc()` reconhece o código
`PGRST202`, de "função não existe", e cai na fila de antes, e a tela avisa
que o filtro ainda não está ligado. Se esse aviso aparecer em produção, a
migração não está lá.

**Testes:**
- `jxj` (Postgres local):
  - o raio de um dos dois segura o par, buscando dos dois lados;
  - a faixa cresce com a espera;
  - "qualquer" passa de 400;
  - o padrão para em 400;
  - raio fora da lista é recusado no servidor e no banco;
  - o banco sem a migração funciona como antes e avisa;
  - dente provado: a função que só olha o raio de quem busca reprova.
- `jxjtelas`: as quatro opções, a faixa e a escolha chegando ao banco.

## Ritmo da narração da luta (2026-10-04 e 2026-10-05)

Duas rodadas com o dono, jogando em produção:

1. Antes, cada linha comum ficava 0,47 s, uns 90 caracteres por segundo, e
   uma luta sem plano passava em 12 s (média de 596 lutas, 21 linhas
   cada). Pedido: "os textos estão aparecendo muito rápidos e não consigo
   ler a tempo".
2. Em 2026-10-04 o tempo virou ritmo de legenda, uns 17 caracteres por
   segundo (luta sem plano em 51 s). Pedido seguinte: "está muito lenta
   agora, deixe 50 letras por segundo".

**Agora** (`tempoDeLeitura` em `animarTrecho`): cada linha fica 20 ms por
caractere, no mínimo 0,5 s, mais uma pausa nas linhas fortes (nocaute ou
finalização 0,9 s, knockdown e lance grande 0,35 s, plano 0,3 s, round
0,25 s), na velocidade 1x. A linha comum sai a exatamente 50 caracteres
por segundo. A luta sem plano dura uns 20 s em 1x, 10 s em 2x e 5 s em 4x.

A ficha antes da luta (nomes, cartel, alcance, base e estilo) fica 3,5 s
(era 1,5 s), e o Pular continua lá. O botão de velocidade mostra a
velocidade em uso quando a tela da noite é montada.

**Teste:** a suíte `lutainterativa` roda a narração de uma luta de verdade,
mais as duas linhas de plano mais longas, sem reduce-motion. Ela confere:
- linha comum a 50 por segundo em 1x;
- nenhuma linha mais rápida que isso, nem abaixo de 0,5 s;
- 2x e 4x dividem o tempo.

Com o ritmo antigo (470 ms fixo) ou com o de legenda, o teste reprova.

## Como jogar: tutorial com prints anotados (2026-09-28)

**Pedido do dono:** "tutorial básico de como jogar ao chegar na parte de
draft e depois em uma luta, prints com setas e círculos totalmente
explicativos (algumas pessoas não entenderam)".

**Como funciona:** dois tutoriais (`TUTORIAIS` no `index.html`): "Como
montar o lutador" (3 passos) abre sozinho na primeira montagem, e "Como
funciona uma luta" (5 passos: adversário, camp, coletiva, luta,
resultado) na primeira noite de luta. Cada passo é um print do próprio
jogo com cada parte circulada, uma seta e um número; embaixo, a lista
explica cada número. Cada tutorial abre uma vez por aparelho
(`localStorage` `tutorial:draft`/`tutorial:luta`, e uma vez por sessão se
o navegador não guarda nada) e nunca no modo automático dos testes. O
botão "Como jogar" (draft e cabeçalho da noite) reabre; na noite ele abre
no passo da etapa em que o jogador está. Teclado: Esc fecha, setas
navegam. O texto do passo que fala de passar o mouse muda no toque
(`semHover()`).

**Os prints** (`img/tutorial/`, 16 WebP, ~660 KB, carregados só quando o
tutorial abre) saem de `img/tutorial/capturar.mjs`: ele abre o jogo local
no Chrome (puppeteer-core), leva cada tela ao estado certo, desenha as
anotações por cima e recorta a região anotada. Duas versões: computador
(1280 de largura; círculo nos blocos pequenos, retângulo arredondado nos
grandes, número onde tiver espaço livre) e celular (390 com toque; os
números numa faixa escura à esquerda, com seta reta, pra nunca cobrir o
conteúdo). O número N do print é o item N da lista: **mexeu na ordem ou na
quantidade de itens, rode o `capturar.mjs` de novo** (a suíte `tutorial`
reprova se a lista e as anotações do script tiverem tamanhos diferentes).
Mudou a tela que aparece no print, também vale rodar de novo. O script
não vai pro ar (`.vercelignore`) e bloqueia a IA de produção.

**Teste:** suíte `tutorial` (abre sozinho uma vez, navega, fecha pelo
Entendi, pelo X e pelo Esc, não reabre na mesma sessão nem pra quem já
viu, nunca no automático, "Como jogar" abre no passo da etapa, todo print
existe nas duas versões). Dente provado: sem abrir no draft, abrindo no
automático e com um item a mais na lista, reprova. O fundo escuro do
tutorial (clique fora fecha) entrou na exceção do teste de
acessibilidade, igual ao das Configurações.

**Achado no caminho:** o DOM falso dos testes não tinha `document.body`,
e o piscar de tela do nocaute (`document.body.classList`) quebrava a luta
de teste que terminava em nocaute sem reduce-motion. O balanço novo mudou
os lutadores e uma luta da suíte `hub` passou a terminar assim. No
navegador nunca quebrou; o DOM falso ganhou `body`.

## Reta final para o lançamento (2026-09-28)

- **Modo automático saiu** (os dois botões, painel e noite). A flag `auto`
  continua só como gancho dos testes (`jogarCarreiraAte` roda carreiras
  inteiras com ela); nada no jogo liga ela. `toggleAuto` foi removida. A
  suíte `hub` reprova se `#autob`/`#noiteAuto` ou um botão "Modo
  automático" voltar.
- **Página Créditos saiu** (rota, link do rodapé, tela, CSS). O que a
  licença obriga: crédito dos sons CC BY no painel da engrenagem; nota ISC
  do Lucide dentro de `img/icones.svg`. O resto não exige crédito na tela:
  áudio CC0, fontes servidas pelo Google Fonts, estatística pública. O
  `README.md` do repositório continua citando o ufcstats.
- **"Voltar à escolha do adversário" aparecia depois da luta.** O JS sempre
  marcou `hidden` certo; a causa era CSS: `.botao{display:inline-flex}`
  vence o `[hidden]` do navegador, então o botão ficava na tela e levava a
  uma noite com a oferta velha. Regra global
  `[hidden]{display:none!important}` no `estilo.css` (vale pra todo botão
  escondido pelo JS; "Próxima luta" do painel tinha o mesmo problema ao
  contrário). A suíte `hub` confere o estado depois da luta e a regra no
  arquivo; conferido também no Chrome (`display:none` no painel).
- **Orçamento é teto:** ver "Balanço".
- **Coletiva e entrevista:** ver a seção acima.

## Histórico (2026-09-09) — aprovado, implementado

Carreiras anteriores (nome, cartel, nota, data) e conquistas
desbloqueadas. Mesmo padrão de conquistas: `localStorage` sempre
(`lerCarreirasLocais()`/`salvarCarreiraLocal()`, chave `"carreiras"`),
conta sincroniza por cima (`sincronizarCarreirasNaNuvem()`, mesmo
upsert-local-sobe + baixa-o-que-só-existe-na-nuvem de
`sincronizarConquistasNaNuvem()`). Funciona sem conta — carreiras
concluídas neste aparelho aparecem mesmo offline.

`seed` (o mesmo número usado nos links de desafio, sorteado uma vez no
início da carreira) é a chave — já é único por carreira, sem precisar
de id substituto novo. Tabela nova, `carreiras_usuario`
(`supabase_schema.sql`, seção separada), mesmo padrão de RLS de
`conquistas_usuario` (usuário só lê/grava as próprias linhas, sem
policy de update/delete — carreira concluída é história, não se edita).

`screenReport()` salva local a cada carreira concluída (`SEED`, nome,
cartel, `grade().letter`, data); a caixa de fim de carreira sincroniza
com a nuvem no mesmo instante que já sincroniza conquistas, se tiver
sessão.

`node testar.js inicial` cobre os dois estados (vazio: "nenhuma
carreira/conquista ainda"; com dado: nome/cartel/nota aparecem certos
na tela), provado com dente.

## Termos de Uso e Política de Privacidade — estrutura pronta, texto pendente

Só a estrutura, por pedido explícito — texto jurídico fica de fora até
o usuário adaptar de um modelo de provedor de pagamento.

**Onde o texto fica**: página separada (`screenTermos()`/
`screenPrivacidade()` em index.html, mesmo padrão de tela que o resto
do jogo — SPA de arquivo único, não modal). Motivo de ser página e não
modal: são páginas que fazem sentido linkar/compartilhar sozinhas, e
modal empilhado sobre a tela inicial ficaria apertado pra texto longo.
Hoje mostram só `[PENDENTE — texto ainda não inserido aqui]` — colar o
texto final dentro de `screenPaginaLegal()`, uma função só pras duas
(recebe o título, o corpo seria o próximo parâmetro quando existir).

**Como chegar lá**: rodapé da tela inicial (Termos de Uso · Política de
Privacidade · Contato) e uma nota abaixo do formulário de conta ("Ao
criar conta, você concorda com os Termos de Uso e a Política de
Privacidade") — ambos já linkados, sem depender do texto existir pra
funcionar.

**Aceite formal, quando existir pagamento — NÃO implementado ainda,
proposta pra quando chegar lá**: nota de rodapé no cadastro é o padrão
comum pré-pagamento (o que está aqui agora), mas não é registro
jurídico de aceite. Quando existir checkout de verdade:
- Tabela nova (`aceites_termos`: `user_id`, `versao_termos` ou hash do
  texto, `aceito_em`), RLS igual às outras (usuário só lê o próprio).
- Checkbox EXPLÍCITO (não pré-marcado) antes do botão de pagar,
  bloqueando o checkout até marcado — a nota passiva de hoje não basta
  mais nesse momento.
- Gravar a VERSÃO/hash do texto aceito, não só um booleano — se os
  termos mudarem depois, dá pra saber quem aceitou qual versão, e
  reabrir o aceite pra quem está numa versão antiga (comum exigir
  reaceite quando os termos mudam de forma relevante).
- Momento do registro: no clique de "Confirmar pagamento", não no
  cadastro da conta — cadastro e pagamento podem estar bem separados
  no tempo, e o aceite que importa juridicamente é o de quando dinheiro
  troca de mão.

### Domínio próprio — octogono.fun, registrado E apontado (2026-09-06)

`octogono.fun` está no ar, servindo o jogo. `DOMINIO_JOGO` e `AI_URL`
apontam pra ele. Passo a passo que foi seguido (documentado pra quando
precisar mexer de novo, ex. trocar de domínio outra vez):

1. Vercel → o projeto → **Settings → Domains → Add** → digitar o domínio.
2. A Vercel devolve os registros de DNS pra criar no PAINEL DO
   REGISTRADOR (onde o domínio foi comprado, não na Vercel): registro
   **A** apontando pro IP da Vercel pro domínio raiz, **CNAME** pra
   `cname.vercel-dns.com` pro `www`. A Vercel mostra o valor exato na
   hora do Add — copiar de lá, o IP pode mudar.
3. Esperar propagar (minutos a algumas horas). A Vercel emite HTTPS
   sozinha (Let's Encrypt) assim que o DNS resolver.
4. No mesmo painel, escolher o sentido do redirecionamento (`www` →
   raiz, ou o contrário).
5. **Depois que resolver, testar `AI_URL` com `curl` direto — não
   presumir.** `draft-ufc.vercel.app` (o alias antigo) parou de resolver
   pra uma deployment válida assim que `octogono.fun` virou o domínio
   principal — 404 `DEPLOYMENT_NOT_FOUND` em toda chamada, sem aviso
   nenhum, e o jogo continuou "funcionando" (a IA só caía em fallback
   local sempre, sem erro visível pro jogador). A suposição antiga
   ("mesmo projeto, `/api/ai` responde nos dois domínios") era falsa na
   prática. Trocar `AI_URL` pro domínio novo é OBRIGATÓRIO, não opcional
   — ver "Quando a IA falha" pro caso real. Testar assim:
   ```bash
   curl -s -X POST https://SEUDOMINIO/api/ai -H "Content-Type: application/json" \
     -d '{"kind":"julgar","data":{"name":"T","cena":"c","resposta":"r","record":"1-0","followers":"1mil","fan":"5"}}'
   ```
   Deve devolver `{"ok":true,"result":{...}}` — qualquer coisa diferente
   (404, HTML de erro, timeout) é o mesmo bug de novo.

## O que falta

**Ícones de amostra curta ficam de fora.** O filtro de 4 lutas e 25 minutos
derruba Ronda Rousey e parecidos. Precisa de lista de override manual.

**O meio da tabela não separa.** Fã e seguidores distinguem bem o topo (elite
chega a 1,5M contra 20 mil), mas carreiras medianas ficam parecidas. É a escada
de adversários se auto-compensando.
