# draft-ufc — o que falta

Lista completa, em ordem de prioridade. Cada item diz **o que é**, **por que
importa** e **como saber que ficou pronto**.

Contexto de cada um está no `LEIA-ME.md`. Regras de trabalho, no `CLAUDE.md`.

---

## 1. Lesão por nocaute

**Escopo cortado de propósito do item de lesão visível — v1 (dilema) está
feito, ver "Já feito" no fim.** Nocaute→lesão é "mais realista e mais cara",
mas junto com o resto (schema novo no `julgar`, prompt, ficha) era palpite
demais numa mudança só: a chance de acontecer (proposta inicial ~30%) nunca
foi medida, e precisa de stream de `rng` próprio (`lesaoRng`, nunca o `rng`
principal — mesmo motivo do `holdRng`, sorteia só em derrota por nocaute).

**Pronto quando:** chance medida (não chutada) em ≥400 carreiras, `lesaoRng`
separado confirmado por `node testar.js desafio`, e `node testar.js` inteiro
com KO/SUB/DEC na faixa.

---

## 2. Link de desafio não reproduz a classificação de lesão da IA

`permanente` e `atributo` da lesão vêm de `j.lesao`, decidido pela IA — a
mesma semente com as mesmas escolhas de texto pode classificar diferente em
duas aberturas do mesmo link. Isso já era verdade pra `j.atributo`/`j.efeito`
antes da lesão existir (não é regressão), mas o desvio máximo subiu de ±10%
pra -50%: antes dificilmente virava resultado de luta diferente, agora pode.

`node testar.js desafio` roda sem rede — é cego a essa classe de divergência
por construção, com ou sem lesão. Não tem como esse teste pegar isso sem
mudar o que ele é.

Conserto de verdade (cachear resposta da IA por hash de entrada, ou tirar a
classificação da IA) é escopo maior que a lesão em si. Registrado aqui pra
não se perder, não pra resolver já.

**Pronto quando:** alguém decidir se o tamanho do problema (medido: ver
`LEIA-ME.md`, seção "Lesão") justifica o custo do conserto, e por qual
caminho.

---

## 3. % de carreiras que terminam com o cinturão — hoje vs. antes do conserto do `st.title`

Antes do conserto de título nesta sessão, `st.title` nunca voltava a `false`
numa derrota — então "terminar com o cinturão" media só "chegou a ganhar
alguma vez", não "ainda é campeão no fim". Precisa medir os dois números
(antes e depois) pra saber se essa mudança moveu o placar de verdade ou só
corrigiu o texto.

**Achado jogando, depois desta medição ter sido escrita: cinturão fácil
demais.** Chegou ao título com o joelho lesionado — carreira que deveria
estar carregando uma penalidade de verdade (ver item de lesão diluída pelo
treino, "Já feito" no fim) ainda assim alcançou o topo. Suspeita: mesma causa
raiz do item 4 (efeito do treino) e do item 7 (meio da tabela não separa) —
a escada de adversários se auto-compensando pode estar apagando o custo de
qualquer penalidade, lesão incluída. Esta medição (%) é o que decide se a
suspeita procede; não redecidir de olho antes dela.

**Pronto quando:** número medido em ≥400 carreiras, comparado ao
comportamento pré-conserto, registrado aqui ou no `LEIA-ME.md`.

---

## 4. Efeito do treino — remedir, se ainda incomodar

O `LEIA-ME.md` registra +1,9 vitórias / pico de top 11% pra top 2%, medido em
400 carreiras. Se mudanças recentes (cinturão nomeado, lesão) tiverem mexido
na trajetória de `standing` o bastante pra esse número parecer errado,
remedir — não redecidir de olho.

**Pronto quando:** remedido em ≥400 carreiras e comparado ao número antigo.

---

## 5. `node testar.js escolhas` quebrado

`camp.fx is not a function` — trava antes de chegar a medir qualquer coisa.
Confirmado anterior a qualquer mudança recente: `CAMPS` nunca teve `fx`, o
jogo real usa `camp.alvos` via `aplicarCamp()`. O teste reimplementa a
seleção de adversário em vez de chamar `candidatos()` — a mesma dívida já
documentada, só que agora manifesta como erro em vez de número errado.

A correção é expor `candidatos()` e chamar a original, como já se faz com o
resto do motor.

**Pronto quando:** o teste chama a função do jogo, roda sem travar, e volta a
aprovar/reprovar.

---

## 6. Lista de override para lutadores de amostra curta

O filtro de 4 lutas e 25 minutos derruba Ronda Rousey e parecidos — gente que é
nome grande mas tem pouca amostra no ufcstats. Também afeta o modo lenda: quem
cai no filtro não existe no pool de lendas, por mais campeão que tenha sido.

Precisa de uma lista manual de exceções no `atualizar-dados.py`.

**Pronto quando:** os nomes da lista aparecem no `fighters.json` e
`node testar.js divisoes` continua com 11 divisões jogáveis.

---

## 7. O meio da tabela não separa

Fã e seguidores distinguem bem o topo — elite chega a 1,5M contra 20 mil — mas
carreiras medianas ficam parecidas entre si. Causa: a escada de adversários se
auto-compensando (mesmo mecanismo que faz o modo lenda não pesar — ver
"Opcional" abaixo). Balanceamento, não bug. Precisa de medição antes de
qualquer mudança.

**Pronto quando:** a distribuição de seguidores no fim de carreira tem spread
mensurável no meio, sem quebrar a calibração do motor.

---

## 8. Portunhol nos dilemas — baixa prioridade, fica para o fim

Achado jogando: saiu "o promoter tá gritando pro fight semana que vem" e
"escondendo do doctor" — inglês solto no meio de uma voz que é gíria de
lutador brasileiro. É o prompt do `dilema` (a cena, não o julgamento) —
`julgar` não tem esse sintoma nas medições feitas até aqui.

**Pronto quando:** amostra de desfechos/cenas reais não mostra mistura de
inglês solto (não é bug urgente, é polimento — cortar na frente de itens que
mudam o resultado da carreira seria errado).

---

## Manutenção

- **Conferir no navegador o que o teste não vê** (DOM falso não vê pixel):
  - engrenagem — canto superior direito; conferir que não sobrepõe
    `#controls` em viewport estreito (~380px) e que o hover revela
    "Configurações" sem deslocar o ícone
  - painel de configurações — abre, as duas barras arrastam, o mudo apaga as
    barras
  - seletor de modo na tela de divisão — "Seja uma lenda" some com peso-mosca
    e as três divisões femininas, com a razão escrita embaixo
  - ficha lateral — posição na divisão (`#48 de 236`, seta de movimento,
    melhor da carreira), o bloco "Ranking" com o nome do campeão, **e um
    dilema real que vire lesão** — atributo em vermelho na linha certa, barra
    com o pedaço perdido, bloco "Lesão" nomeado com a duração
- **Atualizar os dados quando quiser** — procedimento no `LEIA-ME.md`, seção
  "Atualizar os dados". Rodar `node testar.js` depois — sempre.

---

## Opcional — dificuldade real no modo "Seja uma lenda"

Medido: o modo **não** deixa o jogo mais difícil (16.3 → 15.9 vitórias em 22).
Descrição na tela é honesta (fala de quem entra no octógono, não promete
dificuldade), então isto é opcional, não bug. Se quiser mudar, o knob é
`BUDGET_PCT` menor só no modo lenda — número medido, não chutado. Definir o
alvo antes (13 vitórias em 22? 11?) e remedir `node testar.js draft` no modo
normal depois, pra confirmar que continua no ~69º percentil.

---

## Já feito, não refazer

- **Conteúdo inseguro no dilema.** Texto do jogador filtrado (`conteudoInseguro()`)
  antes de sequer chamar `julgar` — mais barato, não depende da IA obedecer.
  Desfecho da IA filtrado de novo do outro lado, como rede. Se disparar em
  qualquer ponto, o `j` inteiro é descartado, não só o texto (achado real: a
  IA tinha aplicado lesão permanente junto com narração de automutilação).
  Prompt (`api/ai.js`) é o freio principal — regex local é rede, deliberadamente
  magra, porque ameaça vaga não dá pra distinguir de hype de MMA sem contexto
  ("vou fazer ele sofrer" muda de sentido conforme o alvo). Duas rodadas de
  medição contra a API real: 1ª achou ameaça vaga virando lesão de verdade e
  um vazamento de "existe filtro" no desfecho; 2ª (depois do reforço) fechou
  os dois — 7/7 inseguras neutras, 4/4 controles de trash talk esportivo
  continuam passando, 40/40 benignas nas duas rodadas. `node testar.js
  conteudo` cobre offline. Ver `LEIA-ME.md`, seção "Conteúdo inseguro no
  dilema", pelo relato completo.
- **Lesão visível, v1 (dilema).** `st.eventoMod` combina multiplicativo com
  qualquer outro efeito no mesmo atributo; severidade/duração vêm de tabela
  medida no jogo (temporária -50%/8 lutas ~0,7-0,9 vitórias; permanente
  -25%/carreira toda ~1,0 vitória), não da IA — a IA só classifica tipo e
  atributo. Cura divide pelo `mult` da lesão, não zera (preserva efeito de
  outro evento no mesmo atributo). Uma lesão de cada vez — segunda é
  ignorada enquanto a primeira está ativa. Recusar custa `standing` fixo
  (-0.06), não vem da IA. Ficha mostra perda em vermelho com o pedaço da
  barra que sumiu, e bloco nomeado com a duração real (não promete cura que
  a carreira não alcança). `node testar.js lesao` cobre os dois bugs achados
  em revisão antes de implementar (cura zerando bônus de evento; segunda
  lesão sobrescrevendo a primeira). Classificação (IA reconhecer cena de
  lesão) medida **contra a API depois de deploy de verdade**: 8/8 nas cenas
  de lesão, 0/34 nas sem lesão — sem portão nenhum. Um portão (`houveLesao`)
  chegou a ser desenhado e revertido no meio do processo, porque a medição
  que o motivou tinha testado uma versão de `api/ai.js` de ~17h atrás, nunca
  deployada — ver `LEIA-ME.md`, seção "Lesão", pelo relato completo antes de
  reintroduzir isso.
- Campeão nomeado por divisão, ranking visível na ficha, disputa recebida via
  `holdRng` (stream separado do `rng` principal) em vez de automática
- Perder uma defesa custa o cinturão de verdade (`st.title` zera, `exCampeao`
  guarda quem tirou, `disputaLiberada` reseta nas duas entradas de derrota)
- Carta travada do título ignora `fought` de propósito (revanche é o caso
  normal do UFC); `node testar.js interface` distingue repetição legítima
  (campeão/desafiante nomeados) de repetição-bug (qualquer outro nome)
- Dilema: prompt proíbe afirmar resultado de luta, filtro local corta só a
  frase ofensora (medido: 5% de disparo em 40 desfechos reais, sem falso
  positivo)
- `LEIA-ME.md` não diz mais "Não está no ar" (jogo está em
  https://draft-ufc.vercel.app)
- Configurações: engrenagem (canto superior direito, com rótulo no hover),
  mudo, volume separado de música e efeitos
- Posição na divisão na ficha, com movimento da última luta
- Modo "Seja uma lenda", com as 4 divisões que não fecham fora do grid
- Conserto do fallback de `candidatos()` que repetia adversário em silêncio
- Modo no link de desafio (`&m=lenda`), com link antigo caindo em normal
