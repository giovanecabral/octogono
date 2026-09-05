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

**Medido (500 carreiras de bot, estratégia "parelho" fixa, candidatos()/
aplicarCamp()/simulateFight() reais) — decomposição em 3 números, como
pedido, sem tocar TUNING/WEIGHTS/TETO_TREINO:**

- **Baseline: 69,6% conquistam o título.** (a suspeita de 80% batida jogando
  pode ter vindo de uma estratégia de escolha diferente da "parelho fixo"
  usada aqui — não é a mesma medição, mas confirma a mesma ordem de grandeza)
- **Escada se autocompensar: efeito ~nulo, não é o vilão.** Trocando a banda
  de adversário por uma faixa FIXA no meio do ladder (ignorando `st.standing`
  por completo) o título saiu em 72,0% — dentro do ruído de N=500, se não
  ligeiramente PRA CIMA. A hipótese de que a escada relativa esconde o custo
  de qualquer penalidade não se sustenta nesta medição.
- **CHANCE_DISPUTA: 96,0% dos elegíveis (448/500 ficaram elegíveis alguma
  vez) acabam recebendo a disputa antes do fim da carreira.** Bate quase
  exato com a suspeita de "95% recebendo" — é um sorteio por luta enquanto
  elegível (`holdRng()<CHANCE_DISPUTA=0.65`), e a probabilidade composta ao
  longo de várias lutas elegíveis vira quase garantia rápido (2 lutas
  elegíveis já dá ~88%). Mas isso só entra em jogo DEPOIS de ficar elegível
  — o gargalo real não é "receber a disputa", é "chegar" lá.
- **Treino: de longe o fator dominante.** Congelando `st.treino` em 1.0 (sem
  o crescimento permanente do `TETO_TREINO`) o título caiu de 69,6% pra
  28,6% — uma queda de 41 pontos. É o treino permanente, não a escada nem a
  disputa, que explica a maior parte da facilidade.

**Parado aqui, sem decidir** (pedido explícito): não mexi em `TUNING`,
`WEIGHTS` nem `TETO_TREINO`. Script de medição em `/tmp/medir_cinturao.js`
(não commitado — throwaway, mas reproduzível: reimplementa `candidatos()`
com banda fixa e pula `aplicarCamp()` como contra-fatuais, sem alterar o
jogo de verdade).

---

## 4. Efeito do treino — remedir, se ainda incomodar

O `LEIA-ME.md` registra +1,9 vitórias / pico de top 11% pra top 2%, medido em
400 carreiras. Se mudanças recentes (cinturão nomeado, lesão) tiverem mexido
na trajetória de `standing` o bastante pra esse número parecer errado,
remedir — não redecidir de olho.

**Pronto quando:** remedido em ≥400 carreiras e comparado ao número antigo.

---

## 5. `node testar.js escolhas` quebrado — RESOLVIDO

Reescrito pra chamar `candidatos()`, `aplicarCamp()` e `simulateFight()` de
verdade (mesmo padrão de `testarCinturao`/`testarMomentos`), em vez de
reimplementar seleção de adversário e `camp.fx` (que nunca existiu — o jogo
usa `camp.alvos` via `aplicarCamp()`). Volta a aprovar/reprovar:
`duro.top > facil.top+30`. Medido: acessível 28% chegam ao topo, parelho
89%, perigoso 99% — 300 carreiras por faixa, `node testar.js escolhas`.

---

## 6. Lista de override para lutadores de amostra curta — CÓDIGO PRONTO, VERIFICAÇÃO BLOQUEADA

`OVERRIDE_AMOSTRA_CURTA` em `atualizar-dados.py`: Ronda Rousey (8 lutas,
24,7min — perde só por `MIN_MINUTES`, por pouco), CM Punk (2/17,2min), Ben
Askren (3/17,3min), Bas Rutten (2/20,2min — resto da carreira foi Pancrase,
fora deste dataset), Genki Sudo (3/25,1min — perde só por `MIN_FIGHTS`).
Números conferidos direto em `data/ufc_fight_results.csv`. James Toney (1
luta, 3,3min) ficou de fora de propósito — amostra de 1 luta é ruído, não dá
pra ratear com confiança nenhuma mesmo sendo nome famoso.

**Bloqueado, não decidido:** não consegui rodar `python3 atualizar-dados.py`
pra regenerar o `fighters.json` e confirmar `node testar.js divisoes` com
11/7 depois do override — falta `data/ufc_fight_stats.csv` no repositório
(nunca foi commitado; só `ufc_event_details.csv`, `ufc_fight_results.csv` e
`ufc_fighter_tott.csv` estão versionados). O `fighters.json` atual foi
gerado em outra máquina/sessão que tinha esse quarto arquivo local.
`node testar.js divisoes` no `fighters.json` atual (sem o override, porque
ele não afeta um dado que não foi regenerado) continua 11 jogáveis/7 lenda —
confirma que a MUDANÇA DE CÓDIGO não quebra nada sozinha, não confirma o
EFEITO do override.

**Pronto quando:** alguém com `data/ufc_fight_stats.csv` (ou uma nova raspagem
via `scrape_ufc_stats`) rodar `python3 atualizar-dados.py` e conferir que os 5
nomes aparecem no `fighters.json` e `node testar.js divisoes` segue 11/7.

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

## 8. Portunhol nos dilemas — RESOLVIDO, confirmado em escala maior

`VOZ` (compartilhada) ganhou instrução explícita contra troca de palavra
comum por inglês solto. Precisou de 3 rodadas de deploy+medição pra cair:
50% (3/6) → 22% (2/9) → 0/7, depois de nomear as 5 palavras que mais
escapavam (manager, coach, fight, doctor, gym) com instrução imperativa
("pare e troque antes de responder").

**Remedido com amostra maior, item explícito desta leva: 0/29 (0,0%) em 30
cenas de dilema contra produção** (1 das 30 chamadas caiu em rate limit,
não em portunhol — ver item de `ia_null`). Bem abaixo do alvo de 5%. O
prompt segura em escala maior que os 7 da rodada anterior; nada a mudar.

---

## 9. `ia_null` — rate limit do OpenRouter, alvo não batido (fora do nosso controle)

Medido (3 carreiras completas em produção, ~/tmp/medir_ia_null.js):
distribuição dos 5 motivos por carreira e por ponto (feed/dilema/julgar).
Causa raiz definitiva via `vercel logs`: pool COMPARTILHADO do OpenRouter
pra `qwen/qwen3.7-flash` via Alibaba (`is_byok:false` — a conta não usa
chave própria), não é limite da conta nem do modelo isolado.

Mitigação aplicada: `prefetchFeed()` só dispara em lutas pares ou com
finish (mesma cadência que `drawEvent()` já usa) — corta o feed pela
metade, que era a maior fatia de `ia_null` medida (50/71 = 70%). Resultado:
78,9% → ~27% de chamadas com `ia_null` numa releva de 3 carreiras — grande
melhora, mas **não bateu o alvo de <1/carreira**, porque a causa é externa
(pool compartilhado), não volume de chamada nosso.

**Pronto quando (fora do escopo desta leva):** alguém configurar uma chave
própria em openrouter.ai/settings/integrations (Alibaba/Qwen, BYOK) pra sair
do pool compartilhado — decisão de custo/conta, não de código.

## 10. MULT_TREINADOR — efeito pequeno por motivo estrutural, registrado pra revisão

Medido (par pareado, 1.200 carreiras com/sem treinador, mesmas seeds):
+0,05 vitórias/22 a 1.15x, testado até 3.0x (triplo) sem passar de +0,37/22.
O treinador acelera a MESMA curva de retorno decrescente do `TETO_TREINO`
(via `aplicarCamp()`), e essa curva já consome a maior parte do teto nos
primeiros camps — aumentar o multiplicador não resolve, a mecânica em si
tem pouco espaço pra crescer usando essa fórmula. Se o efeito precisar ser
mais sentido, o caminho é uma mecânica DIFERENTE (não acelerar
`RITMO_TREINO`), não um número maior aqui.

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

- **Escolha na luta.** `lutar()` virou driver round a round (`simularRound()`
  chamado round a round, não `simulateFight()` de uma vez), com uma pausa de
  escolha depois do primeiro round que a luta alcança sem terminar nele — 3
  opções ancoradas no scouting real do round (burst/queda/controle),
  modificador fixo em `.form` (sem rng nova). Calibrado em `MOD_ESCOLHA_LUTA
  =.04` (medido: 1.200 lutas por opção, gap de 0,55-0,70 vitórias/22 entre a
  opção mais forte e a mais fraca, dentro do alvo 0,5-0,8). `playing` sozinho
  já barra `nextFight()`/automático durante a pausa, sem flag nova — provado
  de ponta a ponta em `testarInterface()` e isolado em `testarEscolhaLuta()`.
- **Dinheiro e vida fora do octógono.** `renda_por_luta = RENDA_BASE +
  round(RENDA_BASE*standing)`, paga toda luta, `st.dinheiro` reseta por
  carreira. "Focar em fama" (5ª opção do camp) pula o treino do ciclo, dá
  `GANHO_FAMA_CAMP=.5` de fã. "Treinador melhor" — painel opcional, compra
  permanente, `MULT_TREINADOR` (ver item 10 pela limitação conhecida).
  `RENDA_BASE=6000`/`CUSTO_TREINADOR=54000` calibrados pra mediana de acesso
  na luta 7 (alvo 6-8), medido em 400 carreiras. Nada toca `me.__base`.
- **Fallback local do dilema em 3ª pessoa.** O molde que aparece quando `j`
  é null (filtro do cliente ou falha de rede) narrava em 2ª pessoa
  ("Você..."), diferente da 3ª pessoa que a IA (real ou seu próprio molde
  neutro) sempre usa — pronome sozinho delatava qual caminho gerou o texto.
  `FALLBACK_NEUTRO` agora narra em 3ª pessoa com `me.name`, mesmo estilo do
  prompt de "julgar".
- **`node testar.js coerencia`.** Auditor que audita `renderFicha()` contra
  o estado de verdade: vermelho só com perda real, `st.lesao` sempre mostra
  o bloco, nenhuma chave crua de atributo em texto visível, delta exibido
  bate com base×treino×eventoMod, nenhuma linha de efeito com valor zero.
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
