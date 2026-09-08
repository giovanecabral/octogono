# draft-ufc — o que falta

Lista completa, em ordem de prioridade. Cada item diz **o que é**, **por que
importa** e **como saber que ficou pronto**.

Contexto de cada um está no `LEIA-ME.md`. Regras de trabalho, no `CLAUDE.md`.

---

## 1. Lesão por nocaute — RESOLVIDO

Implementado com alvo explícito (0,3-0,5 vitórias/22 de custo total,
dado depois do insumo medido — 1,60 nocautes sofridos/carreira, 77,3%
sofrem ≥1). `lesaoRng` próprio, confirmado por `node testar.js desafio`.

**Achado medindo direto (simulação de carreira inteira, não álgebra):**
nem chance sozinha nem severidade sozinha bastavam. 100% de chance com
a severidade de dilema (-50%/8 lutas) só chegava a 0,25 vitórias/22;
-50% permanente pra sempre só chegava a 0,27 — o teto de 22 lutas
limita quanto UMA lesão pode custar, não dá pra empurrar só com
frequência. Severidade PRÓPRIA criada (`LESAO_NOCAUTE`, -70%/8 lutas,
não reaproveita `LESAO_TIPOS.temporaria` — mudar o valor compartilhado
mudaria o custo da lesão de dilema sem pedido) + `CHANCE_LESAO_NOCAUTE
=.70` fechou o alvo com folga: 0,32 e 0,33 vitórias/22 em duas levas de
seed (1.500 carreiras cada). `node testar.js lesaonocaute` cobre.

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

## 3. % de carreiras que terminam com o cinturão — RESOLVIDO (TETO_TREINO 1.26→1.18)

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

**Decisão tomada na leva seguinte, depois de isolar formato vs altura da
curva** (cortar o 1º camp pela metade não mudou o título em nada, 70,0%
com e sem — a alavanca é a altura do teto, não o formato): `TETO_TREINO`
baixado de 1.26 pra 1.18. Título agora sai em **60,6%** das carreiras
("parelho" fixo) — escolhido por deixar o cinturão difícil sem ficar raro
(1.12 daria 51,0%, começando a esvaziar a fantasia). Efeito em vitórias
remedido: 1.26 dava +2,0/22, 1.18 dá +1,5/22. Ver LEIA-ME.md "Progressão
do lutador" pelo relato completo com data e as duas medições lado a lado.

---

## 4. Efeito do treino — RESOLVIDO (remedido junto com o item 3, TETO_TREINO 1.18)

Remedido: 1.18 dá +1,5 vitórias em 22 (era +1,9-2,0 em 1.26). A claim de
"pico top 11%→2%" não voltou — `st.peak` satura em 1.0, não é régua
confiável (mesmo achado que já tinha trocado `topo_da_divisao` de `peak`
pra `bestBeaten`). Ver LEIA-ME.md "Progressão do lutador".

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

## 7. O meio da tabela não separa — RESOLVIDO (queixa não procedia, pra seguidores)

Fã e seguidores distinguem bem o topo — elite chega a 1,5M contra 20 mil — mas
carreiras medianas ficam parecidas entre si. Causa suspeita: a escada de
adversários se auto-compensando.

**Medido (1.000 carreiras, estratégia "parelho" fixa, candidatos()/
simulateFight()/hypeOf()/followerDelta() reais)**:

Seguidores no fim: p10=25.295 · p25=49.589 · p40=110.909 · p50=182.108 ·
p60=279.647 · p75=647.277 · p90=2.051.488 · p99=16.321.846.

Fã no fim (escala 0-10): p10=4,82 · p25=5,82 · p40=6,58 · p50=7,12 ·
p60=7,60 · p75=8,37 · p90=9,24 · p99=9,96.

**A suspeita original só se confirma pra FÃ, não pra seguidores.**
Seguidores tem separação real mesmo no meio (p40=111 mil a p60=280 mil é
quase 2,5×, nada "parecido") — o spread do miolo (p40-p60) é só 8,3% do
spread total (p10-p90) em termos absolutos, mas isso é esperado de
qualquer distribuição que cresce multiplicativamente (a maior parte do
range vem da cauda, não significa que o meio é raso). Fã, por ser escala
0-10 limitada, comprime mais de verdade: p40 a p60 é só 1 ponto de
diferença (6,58 a 7,60), contra 4,82-9,96 do p10 ao p99 — aí sim o meio
fica com pouca banda pra se diferenciar.

**Decisão: item fechado por medição.** A premissa original (o jogo não
separa carreiras medianas) não procedia pra seguidores, que é a métrica
mais visível/compartilhada — separa mesmo no meio. Só fã comprime, e é
por construção da escala (0-10), não bug nem falta de calibração. Nada
a mexer.

Não mexi em nada — número trazido, decisão de o que fazer (se algo) fica
pra depois.

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

**Atualização 2026-09-06 — não confundir com o item 14.** O rate limit
acima é real e continua existindo, mas NÃO foi a causa do bug reportado em
produção desta vez ("a IA ignora a resposta") — essa causa foi
`AI_URL` apontando pro domínio errado, 100% de falha, ver item 14. Medido
de novo depois do fix: 30 chamadas reais de `julgar`, 30 ok, 0 falhas —
o rate limit compartilhado não apareceu nesta amostra (pode voltar a
aparecer sob carga real, mas não é mais o suspeito nº1).

**Atualização 2026-09-08 — 3ª ocorrência de "IA ignora resposta", causa
raiz DIFERENTE das duas anteriores (AI_URL errado, item 14) — investigado
do zero como pedido, não presumido igual.** Checklist completo antes de
qualquer conserto:
- `CONTEUDO_INSEGURO` no texto do jogador ("Aceito, estou precisando de
  dinheiro para investir na minha carreira"): testado direto contra a
  regex, **não dispara**. Descartado com certeza, não suposição.
- Teto de US$5 na chave OpenRouter: **descartado**. `vercel logs` mostra
  o 429 vindo do PROVEDOR (`"provider_name":"Alibaba"`,`"is_byok":false`,
  "temporarily rate-limited upstream") — pool compartilhado gratuito,
  nada a ver com o gasto da conta (que estava em US$0,07).
- `ia_null` reproduzido ao vivo, motivo capturado na hora: `429` (chamada
  real que bateu no limite) seguido de `pausado` em cascata (a pausa de
  60s do `AI_PAUSA_MS` compartilhada entre feed/dilema/julgar — nenhum
  desligamento permanente, `aiVivo` continuava true).

**Medido de novo, mesma causa raiz do topo deste item, gravidade muito
maior do que a última medição sugeria.** Dois protocolos, de propósito
diferentes (lição já registrada aqui: medir com o ritmo certo importa —
ver LEIA-ME.md "Medindo a coisa certa"):
- Ritmo comprimido (chamadas a cada 4s, sem esperar a pausa de 60s
  esvaziar): 92% de fallback em dilema E julgar — inflado pelo teste
  bater na PRÓPRIA pausa que ele mesmo disparou, não é a experiência
  real do jogador.
- **Ritmo realista (>60s entre dilemas, cada tentativa é uma tentativa
  de rede FRESCA, não uma pausa reaproveitada)**: 3 carreiras reais
  contra produção, 12 dilemas. **Julgar caiu em fallback em 8 de 12
  (67%)** — carreira 1: 2/4, carreira 2: 4/4, carreira 3: 2/4. Mesmo
  espaçado direito, 8 das 12 tentativas bateram 429 direto no provedor —
  não é cascata do circuito do cliente, é o pool compartilhado mesmo,
  agora. Muito acima do "mais de 1 em 4" que preocupava — **pior bug do
  jogo agora**: o jogador escreve uma decisão de verdade e o jogo devolve
  frase neutra + zero número, sem avisar que algo falhou.

**Ainda não implementado, opções levantadas, aguardando decisão**:
1. Circuito PRÓPRIO pra dilema+julgar (como o evento já ganhou, ver
   "aiVivo compartilhado"), separado de feed — reduz contaminação
   cruzada (feed falhar não gasta a pausa de dilema), mas NÃO reduz a
   taxa de 429 em si (o 429 medido bateu direto em dilema/julgar, não
   veio de feed vazando pausa).
2. Retentativa única em 429 especificamente pra julgar (mesmo padrão já
   usado no evento pra JSON malformado) — 429 costuma ser blip momentâneo
   no pool compartilhado, uma retentativa com pequeno atraso tem chance
   real de sair fora da MESMA janela de limite.
3. BYOK (chave própria Alibaba/Qwen em openrouter.ai/settings/
   integrations) — a correção estrutural de verdade, decisão de
   custo/conta, não de código. Dado o 67% medido agora, isto deixou de
   ser "nice to have" — é o que realmente resolve, o resto é mitigação.

## 14. AI_URL apontava pra domínio morto — RESOLVIDO (hotfix 2026-09-06)

`draft-ufc.vercel.app` (valor de `AI_URL`) passou a devolver 404
`DEPLOYMENT_NOT_FOUND` em TODA chamada — não intermitente, confirmado
com `curl` direto no endpoint. Bug foi relatado como "a IA ignora a
resposta do jogador" (mesmo sintoma do item 9, mas causa totalmente
diferente): toda vez que `ai()` recebia esse 404 sem JSON de verdade,
classificava como `erro_transitorio` e nunca desligava `aiVivo` — o
jogo continuava tentando pra sempre, sempre falhando, sempre caindo no
fallback neutro local. `CONTEUDO_INSEGURO` foi conferido e NÃO disparava
em falso nos textos reportados ("mérito", "educadamente").

Causa provável: `octogono.fun` virou o domínio principal do projeto na
Vercel (ver item de domínio no LEIA-ME) e o alias antigo
`draft-ufc.vercel.app` parou de resolver pra uma deployment válida — a
suposição registrada antes ("mesmo projeto, `/api/ai` responde nos dois
domínios") era falsa na prática. `AI_URL` corrigido pra
`https://octogono.fun/api/ai`, verificado com curl real (200, resposta
contextual de verdade) e com 30 chamadas de `julgar` (100% ok).

**Lição pra não repetir:** depois de qualquer mudança de domínio
principal na Vercel, testar `AI_URL` com curl direto, não presumir que o
alias antigo continua vivo.

## 10. MULT_TREINADOR — RESOLVIDO (trocado por REDUCAO_CURA_TREINADOR)

Efeito pequeno confirmado (+0,05 vitórias/22 a 1.15x, mal passava de
+0,37/22 mesmo a 3×) — trocado de mecânica: treinador agora corta a
duração de lesão temporária pela metade em vez de acelerar treino. Ver
LEIA-ME.md "Lesão" e o commit que trocou a mecânica.

## 11. Cinturão interino — RESOLVIDO (implementado 2026-09-05)

Disputa pelo cinturão de verdade concedida a quem ainda não é campeão de
nada tem `CHANCE_CINTURAO_INTERINO=.12` de o campeão nomeado
(`RANKING.campeao`) estar indisponível — sorteio em `holdRng`, nunca
`rng`. Indisponível vira disputa pelo interino contra `RANKING.desafiante`
(nº1 do ranking); `RANKING.campeao` nunca muda, é ausência, não derrota.

Ganhar o interino marca `st.title=true;st.cinturaoInterino=true`, mas
NÃO `st.foiCampeao`/`st.vezesCampeao` — só a unificação (próxima luta,
sempre travada contra o campeão de verdade, nunca a rotação normal de
contender) conta como aquisição de verdade. Perder a unificação também
não marca "perdeu na 1ª defesa" (nunca houve reinado indiscutido pra
perder rápido). Ficha nunca mostra dois campeões: badge "Interino"
enquanto não unifica, seção Ranking nomeia o campeão de verdade
separado; `passoCinturao()` anuncia a unificação nomeando quem falta
enfrentar.

Medido (3.000 carreiras/valor, duas divisões): `.12` dá 10,4% das
carreiras-que-chegam-a-disputa no peso-leve e 13,5% no peso-pesado (pool
menor → mais redisputa → mais chances de rolar) — o alvo pedido era ~12%
das carreiras, não por rolagem; as duas divisões testadas ficam nos dois
lados, sem precisar de valor por divisão. `node testar.js cinturao` cobre
aquisição do interino, unificação vencida e unificação perdida,
checando o HTML real de `renderFicha()`, não uma cópia da fórmula.

## 12. Queda no ranking por inatividade — DESCARTADO

Não faz sentido no jogo como existe: as 22 lutas são seguidas, sem gap de
tempo que o jogador controle ou perceba entre uma e outra — não existe
"ociosidade" pra punir. Precisaria inventar uma mecânica de tempo que não
existe em lugar nenhum do resto do jogo só pra justificar este item.
Descartado por decisão do usuário, não por medição.

## 13. Escolha na luta — assimetria (K_CIMA/K_BAIXO) — PRÓXIMO PASSO DISPONÍVEL, NÃO IMPLEMENTADO

Mecanismo v2 (por eixo, `mAttr`) mediu gap de 0,38-0,47 vitórias/22 em
K=.50 (KO seguro, ≤35%) — alvo pedido era 0,5-0,8. Decisão explícita do
usuário (2026-09-05): não fechar essa distância com K assimétrico agora.
"0,38-0,47 contra 0,5 é distância que não se sente jogando, e K_CIMA/
K_BAIXO são dois números para justificar onde um resolve."

Registrado como disponível, não descartado: se o gap pequeno incomodar
jogando de verdade, o próximo passo é separar `K_ESCOLHA_LUTA` em dois —
K_CIMA pro lado que "casa" (matchup>.5), K_BAIXO pro lado que "erra" — em
vez de subir o K simétrico (que já mediu esbarrar em 35% de KO perto de
K≈.53, sem sobra de margem). Método de medição já existe e não muda:
`node testar.js gapescolha` pro gap, `node testar.js acoesluta`/`node
testar.js motor` (6.000 lutas, política realista) pro KO/SUB/DEC. Ver
comentário em cima de `K_ESCOLHA_LUTA` em `index.html`.

## 15. Momento "lesão vencida" narrava escolha que não existia — RESOLVIDO (2026-09-06)

Achado em produção: badge "MACHUCADO", frase "entrou mancando e saiu com
a mão levantada" (narra ACEITAR lutar machucado, uma escolha) disparando
pra lesão de NOCAUTE (consequência de apanhar, sem escolha nenhuma).
`st.lesao` ganhou campo `origem` ("dilema"|"nocaute"); o gatilho em
`finishFight()` escolhe `FRASE_LESAO_VENCIDA` ou
`FRASE_LESAO_VENCIDA_NOCAUTE` conforme a origem.

## 16. Card de momento com metade vazia — RESOLVIDO (2026-09-06)

Achado em produção: com frase curta (caso comum, 1-2 frases), sobrava
até ~250px vazios entre o bloco de 3 linhas e o rodapé — `CARD_H` era
fixo pro pior caso (frase de 5 linhas). `desenharCardMomento()` agora
mede quanto a frase e o bloco de 3 linhas (que também varia — nem toda
momento tem adversário/posição) realmente ocupam, e calcula a altura do
canvas a partir disso, com piso de 1060px. Verificado com Chrome
headless em 3 casos (frase curta, longa, bloco de 3 linhas incompleto) —
sem sobra em nenhum.

## 17. "Focar em fama" no CAMPS — RESOLVIDO (2026-09-06)

Pedido "há duas levas" (nunca tinha saído, achado jogando). Removido de
`CAMPS`, `aplicarCamp()` e `telaCamp()` por completo — 4 camps de
atributo agora (Boxe/Wrestling/Jiu-jitsu/Físico), nenhum de fama.
`node testar.js treino` ganhou guarda de regressão (`nenhum .fama`).

## 18. Eventos de vida por IA, dinheiro no dilema, rolar novamente no draft, dinheiro na ficha — IMPLEMENTADO (2026-09-06)

Quatro pedidos na mesma leva:

**Eventos por IA** substitui o pool fixo de 28 frases (repetiam entre
carreiras). Novo kind `"evento"` em `api/ai.js`; `dispararEventoIA()` no
cliente, assíncrono, sem bloquear nada (mesmo padrão do feed). RARE
continua local/síncrono (fora-da-curva, texto calibrado à mão). SEM
FALLBACK, por decisão explícita: se a IA falhar ou os filtros
(`CONTEUDO_INSEGURO`+`RESULTADO_LUTA`, os MESMOS do dilema, sem exceção)
esvaziarem o texto, a luta passa sem evento. `usedEvents`/`EVENTS`/
`_drawNormal()`/`direcaoEvento()`/`somDoEvento()` removidos (dead code).

**Atualização 2026-09-06, depois de três consertos medidos contra a
API real** (ver LEIA-ME.md "Eventos por IA" pro relato completo):

1. **`RESULTADO_LUTA` removido do evento** (ficou só no desfecho do
   dilema, onde foi desenhado pra proteger — impedir a IA de afirmar o
   resultado de uma luta que AINDA vai acontecer). Evento narra uma luta
   que JÁ terminou; o filtro cortava fato verdadeiro ("o clipe do
   nocaute viralizou") como se fosse previsão. Sem ele: **40/40 chamadas
   sobreviveram** (100%, contra 82,5% antes). `CONTEUDO_INSEGURO`
   continua valendo; o desfecho do dilema continua protegido pelo
   `RESULTADO_LUTA` (regressão coberta em `node testar.js conteudo`).
2. **Retry único quando a IA devolve `ok:true` sem o campo `texto`**
   (~10% medido, JSON malformado — não é falha de rede/rate-limit, essas
   não retentam). Custo: ~1,8 chamada extra por carreira.
3. **Tema forçado, não sugerido**, pra variedade — ver abaixo.

**Variedade — três iterações medidas, honesto sobre onde parou:**
- Sem tema forçado: 42% dos 36 textos convergiam pro MESMO esqueleto
  ("vídeo/clipe viraliza, família ou empresário reage") — o prompt só
  sugeria 10 temas e dava 1 exemplo copiável, o modelo ancorava no
  exemplo.
- Tema forçado (cliente sorteia 1 de 10 temas e manda no prompt, exemplo
  removido): o colapso NUM ÚNICO esqueleto sumiu — a frase específica
  "vídeo do nocaute viralizou" caiu pra 2/40 (5%), e cada tema produz
  vocabulário genuinamente diferente (dinheiro fala de aluguel/bolsa,
  família fala de mãe/pai, etc). **Mas surgiu repetição DENTRO de cada
  tema**: com o mesmo tema voltando numa carreira de 40 chamadas
  (round-robin, espaçamento de 10), alguns temas mostraram o MESMO
  giro narrativo em 3-4 das 4 ocorrências — "rotina de treino" virou
  100% "acorda com dor e treina mesmo assim" nas 4 vezes; "patrocínio"
  deu "regra de vestimenta inesperada" em 3/4; "vida pessoal" deu
  "parceiro(a) reage mal" em 3/4. Contando qualquer cluster de 2+
  dentro do mesmo tema como repetição de estrutura: **~45% dos 40
  textos pertencem a algum cluster** — pior que o alvo de 15%.
- `st.eventosRecentes` (últimos 3 textos da carreira) + instrução
  explícita "não repita" no prompt: reduz repetição QUASE ADJACENTE
  (mesmo tema voltando a menos de 3 eventos de distância), mas não é
  garantia — testado direto, pedindo "vida pessoal" 3x seguidas com o
  1º na lista de "não repita", a 3ª chamada saiu **idêntica à 1ª,
  palavra por palavra**, mesmo com a instrução explícita. Modelo pequeno
  não segue restrição negativa de forma confiável.
- **Rede de baixo adicionada** (mesma disciplina do
  `CONTEUDO_INSEGURO`): se o texto novo bate EXATO (case-insensitive)
  com algum dos últimos 3 já mostrados, descarta — sem fallback, a luta
  passa sem evento. Isso fecha o pior caso (eco literal) mas não pega
  repetição de GIRO NARRATIVO com palavras diferentes (exigiria
  similaridade semântica, não comparação de string).

**Causa da repetição dentro do tema, pra quem for mexer aqui de novo:**
não é bug de prompt nem de contexto pobre — é que o modelo tem um número
pequeno de "respostas típicas" por tema, e repetir o tema naturalmente
resample a mesma resposta típica.

**Correção 2026-09-07: a medição de 40 chamadas lado a lado media a
coisa errada** — não é a experiência do jogador, que vê 1 evento por
luta ao longo de ~40 minutos, com narração entre eles. Duas correções
implementadas antes de medir de novo, mais baratas que similaridade
semântica:
- **Sorteio sem reposição** (`proximoTema()`, cartela embaralhada com
  `eventoRng`, consumida uma a uma): os 10 primeiros temas de qualquer
  carreira são garantidos diferentes, elimina repetição de tema por
  puro acaso de sorteio (não tinha relação com a repetição de esqueleto
  medida, mas era uma repetição evitável de graça).
- **Contexto real da carreira no prompt**: posição no ranking
  (`posicaoDivisao()`), lesão ativa, se perdeu o cinturão NESTA luta
  (`st.perdeuCinturaoNaLuta`), dinheiro em caixa — evento ancorado no
  que está acontecendo de verdade repete menos por construção.

**Medido depois dos dois consertos: 20 carreiras completas de ponta a
ponta** (não 40 chamadas isoladas — `nextFight()`/`finishFight()`/
`dispararEventoIA()` reais, só o kind `"evento"` batendo na API de
produção, dilema/julgar/feed desligados sem custo pra não afetar a
medição):
- **Distribuição de tema saudável**: dos ~176 eventos que apareceram
  nas 20 carreiras, os 10 temas saem bem distribuídos (16 a 20
  ocorrências cada) — sem tema dominante, sorteio sem reposição
  funcionando como esperado.
- **Repetição de tema em lutas próximas (consecutiva ou 1 de
  intervalo): 4 carreiras em 20 (20%)** tiveram pelo menos um par assim
  — bem abaixo do "45% olhando lado a lado" da medição anterior, mais
  perto do que o jogador realmente notaria. Inspecionado à mão: 3 dos 4
  pares realmente compartilham o giro narrativo (mesmo tema E mesma
  ideia — "mãe liga cobrando conta" duas vezes, por exemplo); 1 dos 4 é
  só o mesmo tema com desfechos opostos (patrocínio caindo vs.
  patrocínio chegando), não incomodaria do mesmo jeito. Ainda acima do
  alvo de 15%, mas a distância ficou pequena.
- ⚠️ **Confundido pelo próprio volume de medição desta sessão**: a taxa
  de sucesso GERAL das chamadas caiu pra ~54% nesta rodada de 20
  carreiras (era 90-100% em testes isolados horas antes, no mesmo dia)
  — quase certamente o pool compartilhado do OpenRouter saturando pelo
  volume alto de chamadas que a própria sessão de medição já tinha
  feito antes desta (ver item 9/14). Isso reduz quantos eventos
  aparecem por carreira, o que MECANICAMENTE reduz a chance de dois
  temas colidirem perto um do outro — **o número de 20% pode estar
  SUBESTIMADO**; com a taxa de sucesso real (~90%) e mais eventos por
  carreira, a chance de colisão tende a subir. Vale remedir num dia sem
  volume de teste acumulado antes, se a precisão importar pra decisão
  final.
- ✅ **ACEITO (2026-09-07), sem mais trabalho por ora.** Usuário aceitou
  os 20% mesmo sabendo que pode estar subestimado: a medição foi feita
  do jeito certo (carreira real, não chamadas isoladas), o número caiu
  de 45%→20% com dois consertos baratos, e 3 dos 4 pares eram repetição
  de giro narrativo em CARREIRAS DIFERENTES (não incomoda o mesmo
  jogador duas vezes). A distância pro alvo de 15% não justifica partir
  pra similaridade semântica agora. **Método pronto pra remedir em dia
  limpo** se incomodar jogando de verdade: harness de 20 carreiras
  reais documentado no LEIA-ME.md "Medindo a coisa certa".
- ✅ **RESOLVIDO (2026-09-07), não era incidental — era grave.** 3/20
  carreiras (15%) perdiam TODOS os eventos porque uma falha de rede
  comum desligava `aiVivo` PERMANENTEMENTE pro resto da carreira, e
  evento compartilhava esse circuito com dilema/julgar/feed. Antes de
  evento existir, `aiVivo=false` só afetava feed/dilema — imperceptível,
  caem em molde local sem o jogador notar. Sem fallback (decisão
  explícita do evento), o mesmo desligamento virou carreira inteira sem
  a mecânica. Consequência direta de tirar o fallback, não bug
  independente.

  Conserto: evento ganhou circuito PRÓPRIO
  (`eventoPausadoAte`/`eventoFalhasSeguidas`), separado de
  `aiVivo`/`aiPausadoAte`/`falhasRedeSeguidas`. Feed/dilema/julgar
  continuam podendo desistir de vez (seguro pra eles). Evento NUNCA
  desiste: todo motivo que desligaria o circuito compartilhado só pausa
  por `AI_PAUSA_MS` e tenta de novo depois. `node testar.js aivivo`
  cobre os dois circuitos separados e a ausência de contaminação
  cruzada, provado com dente.

  **Medido depois do conserto, 20 carreiras reais**: carreiras com
  MENOS de 10 eventos: **1/20 (5%)** (era 3/20 com ZERO antes). Carreiras
  com ZERO eventos: **0/20**. Média: 15,7 eventos/carreira. A única
  carreira degradada (4 eventos) mostra o circuito funcionando como
  desenhado — pausou e voltou a tentar, não zerou a carreira inteira.

**Dinheiro no dilema**: campo `"dinheiro"` no prompt de `julgar` (fração
de -1 a 1 de `RENDA_BASE`, mesma âncora que `"seguidores"` já usa como
fração relativa), travado com `lim()`. Escolhido ±1 bolsa cheia porque um
dilema é evento situacional, não pode valer mais que uma luta inteira.

**Rolar novamente**: botão 🎲 acima da mesa do draft, uma vez em toda a
criação (não por par), desabilita de verdade (`.disabled`, não só o
texto). Consome `rng()` sob demanda — a partir de agora **a semente só
garante os adversários**, não mais o draft. Texto do convite de desafio e
`node testar.js desafio` atualizados pra essa promessa.

**Dinheiro na ficha**: `R$ {fmtNum(st.dinheiro)}` no topo, junto do
avatar/nome; ganho da luta atual (`RENDA_BASE+round(RENDA_BASE*standing)`)
na linha de resultado do card de luta, junto com método e round.

KO/SUB/DEC final (nenhuma destas mudanças toca o motor de combate):
**KO 34% / SUB 19% / DEC 46%** — idêntico ao de sempre.

## 19. Luta em decisão terminava sem linha de resultado — RESOLVIDO (2026-09-06)

Achado jogando em produção: "FIM DO ROUND 3 — JJ LEVOU" aparecia, e
nada depois disso — sem linha de decisão, sem cartões, sem carimbo de
vitória. Causa: `montarDecisao()` empurra a linha de resultado pro
array `log` DEPOIS que o `animarTrecho()` do round final já tinha
consumido e renderizado o trecho — nada chamava a animação de novo
pra essa linha nova, ela ficava presa no array sem nunca virar DOM.
KO/finalização não tinham esse bug porque `fin()` escreve a linha
DENTRO de `simularRound()`, antes do corte que alimenta a animação.

`finishFight()` sempre rodou certo nesse caminho — cartel, ranking e o
carimbo no card da luta (`bouts`) sempre bateram. O bug era só da
narração ao vivo (`play`), estado nunca esteve errado.

Conserto: o branch de decisão em `lutar()` agora monta o resultado,
fatia só a linha nova, chama `animarTrecho()` com ela e só ENTÃO
encerra — mesma forma do branch de KO/finalização logo acima.

`node testar.js narracao`: 8 carreiras reais de ponta a ponta
(`nextFight()`/`lutar()`/`finishFight()`, não atalho), 32 decisões
reais. Antes do conserto: 0/32 narradas ao vivo. Depois: 32/32.
Controle (KO/finalização): 144/144 sempre narrou, provando que o bug
era específico de decisão.

## 20. Dilema com cena incoerente ("Balança trapaceira") — MEDIDO, ACEITO (2026-09-06)

Achado jogando: dilema de corte de peso ("Balança trapaceira") narrou
"o juiz não me deu a luta" e "devendo o peso do cara" — juiz de MMA
julga a luta, não a pesagem; a frase não faz sentido nenhum. Hipótese
inicial (contexto novo do evento — posição/lesão/cinturão/dinheiro —
confundindo o modelo) **descartada**: o prompt de `dilema` nunca
recebeu esse contexto, só `name/record/followers/fan/mood/seed`, igual
sempre foi.

**Medido, prompt original**: 30 dilemas reais (produção), 27/30
coerentes (90%). Os 3 incoerentes eram sempre PAPEL ERRADO na cena
("juiz" na pesagem — devia ser comissão/médico/fiscal; "gerente do
banco" cobrando aluguel — é o senhorio), não contexto demais.

**Tentativa de conserto**: em vez de proibir o errado ("nunca diga
juiz"), o prompt passou a listar POSITIVAMENTE quem existe em cada
tipo de cena (pesagem: comissão/médico/fiscal/matchmaker; cobrança de
aluguel: senhorio; carreira: empresário; imprensa: repórter) — pela
regra já registrada aqui (restrição negativa não é garantia), vale
tentar instrução positiva antes de desistir.

**Medido de novo, prompt com o vocabulário positivo**: 27/30 (90%) —
**taxa não subiu**. E o erro específico que a instrução mirava
(banco/aluguel) **voltou a acontecer** ("O gerente do banco ligou...
O aluguel tá atrasado"), mais dois incoerentes de outra natureza (frase
gramaticalmente quebrada; "técnico de joias" — palavra sem sentido no
contexto). Confirma a regra geral do LEIA-ME: instrução no prompt,
positiva ou negativa, reduz mas não garante.

**Decisão do usuário**: por não ter subido, prompt REVERTIDO pro
original (sem o vocabulário positivo). 10% de cena esquisita numa
carreira de 4 dilemas é raro o bastante pra aceitar sem mais trabalho.
Registrado, não é pra remedir sem incomodar de novo jogando.

**Achado incidental, separado — RESOLVIDO (2026-09-06)**: título
"Cheque atrasado" saiu IDÊNTICO duas vezes em 30 chamadas isoladas —
dilema não tinha o mecanismo de "recentes" que o evento já ganhou
(item 18), e sorteava o tipo COM reposição consumindo o rng principal.
Mesmo tratamento do evento aplicado ao dilema: `proximoDilemaSeed()`
sem reposição com stream próprio (`dilemaRng`, nunca o rng principal —
protege o link de desafio), `st.dilemaRecentes` (últimos 3 títulos) no
prompt com instrução de não repetir, rede de baixo cliente-side pro
eco (cai no `DILEMA_LOCAL`). `node testar.js dilema`: sorteio sem
reposição, isolamento do `dilemaRng` do rng principal, cap em 3 dos
recentes, descarte por eco — todos provados com dente. Detalhes em
`LEIA-ME.md` "Eventos por IA" → "Dilema: mesmo tratamento
anti-repetição". Só 4 dilemas por carreira, sem reposição já garante
os 4 tipos diferentes entre si; repetição ENTRE carreiras continua
possível (mesma limitação do evento, não pedida pra resolver).

## 21. Loja: mostrar efeito de cada item, mais itens — RESOLVIDO (2026-09-07)

Jogada uma carreira inteira, achado real: o painel de compras não dizia
o que cada item fazia em número — mesmo problema do treinador antigo
(+0,05 vitórias/22) que ninguém percebia que era inútil, porque nada
mostrava o efeito.

**Formato adotado, todo item**: descrição em negrito, linguagem de
jogador (`.item-desc`) + efeito mecânico em negrito, verde escuro
(`.item-efeito`), calculado das constantes de verdade, nunca
hardcoded. Painel generalizado de "Treinador melhor" (item único) pra
"Loja" (`LOJA_ITENS`, lista), botão da UI renomeado.

**Item novo: "Equipamento de proteção"** — reduz `CHANCE_LESAO_NOCAUTE`
(.70→`CHANCE_LESAO_NOCAUTE_EQUIP` .45) quando comprado. Não mexe em
severidade/duração (`LESAO_NOCAUTE`), não toca `me.__base`, mesma
camada (`eventoMod`) que a lesão já usa. Preço `CUSTO_EQUIPAMENTO`
42000, ancorado em `RENDA_BASE`, mesmo protocolo do `CUSTO_TREINADOR`
(`node testar.js dinheiro`-style, 400 carreiras de bot: mediana luta 6,
dentro do alvo 6-8).

**Medido (1.500 carreiras pareadas, mesma seed com/sem, candidatos()/
simulateFight()/finishFight() reais)**:
- Benefício da compra: **0,166 vitórias/22** — acima do corte de 0,1,
  entra.
- Frequência da lesão não esvaziou: com o item, ainda ocorre em
  **31,8% dos KOs sofridos** (era 42,5% sem) — a mecânica continua
  presente pra quem compra, só menos provável.

`node testar.js loja`: descrição+efeito separados por item, botão
desabilita sem dinheiro suficiente (por item, independente), comprar
desconta o valor certo/marca/não deixa comprar 2x, rede de baixo no
`onclick` (não confia só no `disabled`). `node testar.js lesaonocaute`
estendido: mesma rolagem de `lesaoRng` (.55) aplica sem o item e NÃO
aplica com ele — prova que é a CHANCE que muda, não a severidade.
Ambos provados com dente.

**Descartado: "Segundo técnico" (acelerar `RITMO_TREINO` via compra)**.
Motivo: já foi tentado e medido nesta rota antes (ver comentário de
`REDUCAO_CURA_TREINADOR`) — nunca passou de +0,37/22, teto de retorno
decrescente do próprio `TETO_TREINO` limita qualquer multiplicador de
ritmo. A alternativa (subir o `TETO_TREINO` em vez do ritmo) compraria
de volta exatamente o que a leva anterior tirou pra consertar o
cinturão fácil demais (1.26→1.18, duas rodadas de medição) — risco
maior que o item vale.

**Empresário financeiro** — reduz pela metade só o lado NEGATIVO de
`dDinheiro` no julgar do dilema (ganho não muda). `CUSTO_EMPRESARIO=
24000`, mais barato que os outros dois de propósito — não muda
vitória nenhuma, é rede de segurança de caixa. Efeito exato por
construção (metade é metade, não precisa de simulação pra confirmar
magnitude), mas card mostra "50%" em número, não só "metade" — mesmo
formato dos outros itens.

**Casa melhor** — bônus permanente em `followerDelta`, toda luta,
vitória ou derrota. `CUSTO_CASA=30000`. Achado medindo: `followerDelta`
já cresce PROPORCIONAL ao total de seguidores (composto luta a luta),
então um multiplicador pequeno por luta AMPLIFICA muito ao longo de 22
lutas — `+15%/luta` (primeiro chute) mediu **+160% de seguidores ao
fim da carreira**, longe de "casa melhor", descartado sem entrar.
Recalibrado pra **+3%/luta** (`CASA_FOLLOWER_MULT=1.03`), que mede
**+21% de seguidores ao fim da carreira** — perceptível, não quebra a
curva. 400 carreiras de bot, `candidatos()`/`simulateFight()`/
`finishFight()` reais.

Nenhum dos dois é "cosmético": dinheiro compra equipamento (que muda
vitória), seguidores é o placar que o jogador acompanha a carreira
inteira. Card de cada um diz o que faz em número, não um aviso de que
"não afeta o resultado das lutas".

`node testar.js loja` estendido: sem/com empresário (perda inteira vs.
pela metade, ganho sempre inteiro), sem/com casa (delta de seguidores
bate com `CASA_FOLLOWER_MULT`, dentro de arredondamento). Ambos
provados com dente.

**Item recorrente proposto, não implementado**: ver `LEIA-ME.md`
"Loja" → "Item recorrente (proposta, não implementada)".

## 22. Dilema/evento repetiam ENTRE carreiras — RESOLVIDO (2026-09-08)

Achado jogando: dilema "A pergunta na coletiva" saiu palavra por
palavra igual numa carreira nova, já visto numa carreira anterior.
Sorteio sem reposição e "recentes" (item 20) só valem DENTRO da
carreira — toda carreira nova reembaralha do zero, sem memória do que
o jogador já viu em partidas passadas.

**Medido antes de escrever qualquer conserto** (pedido explícito):
- `SEEDS` (temas do dilema gerado por IA): **12**, 4 usados por
  carreira.
- `EVENTO_TEMAS`: **10** (já sabido de antes).
- `DILEMA_LOCAL` (fallback local, só dispara quando a IA falha):
  **3** — e é o que explica o caso relatado. "A pergunta na coletiva" é
  `DILEMA_LOCAL[0]`, texto FIXO, sorteado sem histórico nenhum, nem
  dentro da carreira (`Math.floor(rng()*DILEMA_LOCAL.length)`, sem
  cartela, sem "recentes"). Repetir um texto fixo palavra por palavra é
  muito mais provável vindo de 3 opções cegas do que de dois textos
  gerados pela IA coincidindo por acaso — a persistência do pool
  `SEEDS`/IA sozinha NÃO teria evitado este caso específico.

**Conserto, três partes**:
1. `DILEMA_LOCAL` cresceu de 3 pra **8** — lista nova, aprovada em texto
   antes de escrever (padrão `ACOES_LUTA`). 2 dos 3 antigos removidos
   por sobrepor tema com SEEDS ("A pergunta na coletiva" ≈ entrevista/
   imprensa; "O patrocínio esquisito" ≈ proposta de patrocínio
   duvidosa) — pool de fallback parecia versão pobre do mesmo dilema,
   não situação nova. Um item proposto foi cortado ANTES de entrar
   (achado do usuário, não medição): "esconder dor no peito" premiava
   ignorar sintoma cardíaco real num atleta de combate, sem a mecânica
   de consequência que lesão física tem (`LESAO_TIPOS`/
   `CHANCE_LESAO_NOCAUTE`) — diferente de lesão de queixo/joelho, que
   têm trava; substituído por "Técnico querendo mudar seu estilo".
2. Fallback ganhou sorteio sem reposição (`proximoDilemaFallback()`),
   que não tinha NENHUM histórico antes — nem dentro da carreira.
3. **Memória entre carreiras** (`localStorage`, try/catch) pros três
   pools (`DILEMA_LOCAL`, `SEEDS`, `EVENTO_TEMAS`): guarda só
   IDENTIFICADOR (título ou tema), nunca o texto inteiro. Tamanho
   PROPORCIONAL ao pool (60%, não fixo) — pool pequeno + memória fixa
   grande travaria a cartela inteira sem opção livre pra escolher.
   Item na memória é DEPRIORIZADO (vai por último na cartela nova), não
   excluído — cartela nunca fica sem opção, mesmo se a memória um dia
   cobrisse o pool inteiro.

**Bug pego ANTES de deployar, pela própria bateria de testes nova**: a
primeira versão da função que monta a cartela colocava quem estava na
memória PRIMEIRO no array em vez de por último — como o consumo é via
`.pop()` (tira do FIM), isso fazia o oposto do pretendido: priorizava
quem tinha acabado de aparecer. `node testar.js memoria` pegou o erro
de posição na hora (prova com dente: reverter de propósito derruba 2
das 8 asserções). Um segundo bug, desta vez no PRÓPRIO teste (não no
código): a asserção de integração entre carreiras lia a memória DEPOIS
do sorteio da carreira 2, que já tinha marcado a si mesmo — mascarando
o que devia provar. Corrigido lendo o "antes" antes de agir.

`node testar.js memoria` (novo): cap da memória mantém os mais
recentes; cartela deprioriza sem excluir; integração real de 2
"carreiras" com o mesmo `localStorage` (a 2ª não repete os últimos
vistos da 1ª); sobrevive sem `localStorage` nenhum (mesma garantia de
`testarConquistas()`). Todos provados com dente.

## 23. Contas (Supabase) ligadas em produção — FALTA SMTP ANTES DE TRÁFEGO (2026-09-08)

`SUPABASE_URL`/`SUPABASE_ANON_KEY` preenchidos e deployados, schema
(`supabase_schema.sql`, com RLS) já rodado no projeto. `getSupabase()`
retorna cliente real, caixa "Salvar conquistas" aparece em produção
depois das 22 lutas. Confirmado: `grep -rn "service_role"` no projeto
não devolve nada — só a `anon` key está no cliente, como desenhado.

**Bloqueante antes de qualquer tráfego real, ainda não feito**: SMTP
próprio (painel Supabase → Authentication → Email). Sem isso, o e-mail
padrão do Supabase manda só **2 por hora** — o segundo jogador que
tentar criar conta na mesma hora não recebe link mágico, sem erro
visível pra ninguém. Não bloqueia teste solo (1 sessão de teste fica
bem abaixo do limite). Ver `LEIA-ME.md` "Contas" → "Estado desta
instância".

**Migração de chave, sem prazo de código mas com prazo real**: painel
marca a `anon key` atual como legada, formato novo é `sb_publishable_
...`. Confirmado (2026-09-08, docs oficiais): `createClient()` do
supabase-js v2 aceita as duas formas sem mudar código — RLS igual.
Decisão explícita: fica com a legada por ora. Mas Supabase desativa
anon/service_role **até o fim de 2026** — não é recomendação, é prazo.
Quando migrar: só trocar o valor de `SUPABASE_ANON_KEY` pela
`publishable key` do painel. Ver `LEIA-ME.md` "Contas".

## 24. Card de momento: selo dizia categoria interna, dois gatilhos na mesma luta mostravam o errado — RESOLVIDO (2026-09-08)

Achado jogando: ganhou o cinturão (finalização, virou #1 de 52) e o card
mostrou selo "RARO" com frase de 12 vitórias seguidas — não o cinturão.

**Investigado antes de consertar** (`node` direto contra o motor real,
`finishFight()` de verdade): os DOIS gatilhos disparam na mesma luta —
`cinturao` (correto, sempre dispara em título vencido pela 1ª vez) E
`raro`/`invicto12` (cartel bate 12-0 exato nesta luta). Cinturão nunca
deixou de disparar; os dois viravam CARDS SEPARADOS na galeria, e o
jogador só reparou no errado (empurrado por último, rótulo genérico
"RARO" não dava pista de que não era o card do título).

**8 gatilhos** (`criarMomento`), rótulos ANTES → DEPOIS:
| tipo | antes | depois |
|---|---|---|
| `cinturao` | CAMPEÃO | CINTURÃO |
| `cinturaoInterino` | INTERINO | CINTURÃO INTERINO |
| `cinturaoPerdido` | PERDEU | PERDEU O CINTURÃO |
| `estreia` | MAIN CARD | ESTREIA NO MAIN CARD |
| `upset` | ZEBRA | ZEBRA (já era fato) |
| `ko` | NOCAUTE | NOCAUTE EM Ns (tempo de verdade, calculado na hora) |
| `lesao` | MACHUCADO | VENCEU MACHUCADO |
| `raro` | RARO (fixo) | o cartel de verdade (12-0/18-0) ou frase própria (finishStreak: "NUNCA FOI AOS CARTÕES") — 3 recordes diferentes não cabem num rótulo só |

**Prioridade quando mais de um dispara na mesma luta** (`ORDEM_MOMENTO`,
maior primeiro): `cinturao > cinturaoInterino > cinturaoPerdido >
estreia > upset > ko > lesao > raro`. Só cinturão vs. o resto foi pedido
explícito ("é o momento maior"); o resto da ordem é julgamento de
importância narrativa, não medido — aberto a ajuste. Implementado no
FIM de `finishFight()`: se mais de 1 momento nasceu NESTA chamada, fica
só o de maior prioridade; os outros efeitos de cada gatilho (texto no
feed, `st.rares`, `st.events`, flags como `st.estreouMainCard`) já
rodaram antes e continuam valendo — só a disputa pelo CARD muda.

`node testar.js momentos` estendido: reproduz o caso EXATO relatado
(12-0 + cinturão por finalização na mesma luta) e confirma só 1 card
sobra, é CINTURÃO, com a frase certa; rótulos dinâmicos (nocaute em
40s, raro com cartel/frase própria); a flag de estreia continua
marcando por baixo mesmo com o card suprimido. Provado com dente
(bloco de prioridade removido → 3 asserções caem; rótulo do raro
hardcoded pra "RARO" → 2 caem).

## 25. Compartilhar/Salvar imagem gerava 2 arquivos idênticos — RESOLVIDO (2026-09-08)

Achado jogando: "colei e vieram dois arquivos idênticos, mesmo nome,
mesmo conteúdo". Suspeita do usuário: handler duplicado (padrão de
`addEventListener` dentro de função que roda mais de uma vez).

**Investigado antes de consertar**: grep no arquivo inteiro confirma
NENHUM `addEventListener` nos botões de compartilhar/salvar (só
`onclick=`, que nunca duplica sozinho — reatribuir substitui, não
soma). Causa real, diferente da suspeita: `compartilhar()` ATRIBUÍA
`btn.disabled=true` mas nunca CHECAVA o valor antes de rodar. Duas
invocações que cheguem antes do 1º `await` resolver (toque duplo
rápido — comum aqui, nada aparece na tela até "Gerando…" surgir)
rodam as duas inteiras, cada uma gerando seu próprio arquivo com o
MESMO nome determinístico (`${me.name}.png`, sem timestamp). Mesma
CLASSE de bug que a suspeita (execução dupla de algo que devia rodar
uma vez), causa mecânica diferente (guard ausente, não listener
duplicado) — vale registrar a diferença porque o conserto teria sido
outro se a suspeita original estivesse certa.

Afeta os DOIS botões que passam por `compartilhar()` — "Salvar
imagem" (galeria de cards) e "Compartilhar" (fim de carreira) — mesma
função, mesmo bug, confirmado.

Conserto: `if(btn.disabled)return;` como primeira linha da função —
guard explícito, não confia só no `<button disabled>` nativo do
navegador (mesmo raciocínio de sempre neste projeto: instrução/estado
implícito não é garantia, checa).

`node testar.js compartilhar` (novo): simula 2 chamadas seguidas sem
esperar a 1ª terminar (o "toque duplo antes do disabled surtir
efeito"), com `desenhar()` fake pra isolar só a reentrância (não
precisa mockar o canvas real). Provado com dente: sem o guard, 2
downloads disparados, ambos com o mesmo nome — com o guard, 1.

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
