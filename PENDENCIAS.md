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

**Implementado, as três camadas pedidas, nesta ordem (2026-09-09)**:

1. **BYOK — SEGURADO por ora (2026-09-09), decisão do usuário**: as
   camadas 2+3 sozinhas já mediram 0/12 (0%) de fallback, bem abaixo do
   alvo de <10% — BYOK exige conta separada na Alibaba Cloud, chave do
   DashScope e configuração no painel do OpenRouter, trabalho real pra
   um problema que já parece resolvido pelas outras duas camadas. Passo
   a passo abaixo, pronto pra puxar se o 429 voltar a incomodar com
   tráfego real:
   1. Criar/ter conta na Alibaba Cloud, ativar Model Studio/DashScope.
   2. Gerar uma API key do DashScope no console da Alibaba Cloud.
   3. No OpenRouter: Settings → Integrations
      (`openrouter.ai/settings/integrations`).
   4. Achar o card de provedor Alibaba/DashScope, colar a chave como
      "Prioritized key" (tentada antes do pool compartilhado).
   5. Opcional: desativar "Shared capacity fallback" se quiser garantir
      que NUNCA mais caia no pool compartilhado (troca por: uma
      instabilidade na sua própria conta Alibaba derruba a chamada sem
      fallback nenhum — deixar ligado é mais seguro).
   6. Custo: 5% do preço normal do modelo na OpenRouter, debitado do
      saldo OpenRouter; as primeiras 1M requisições/mês nesse esquema
      são isentas dessa taxa. **NÃO é a mesma coisa que adicionar saldo
      na conta OpenRouter** — sem a chave DashScope própria, mais saldo
      não muda de qual pool a chamada sai (`is_byok:false` nos logs
      confirma isso).

   **Ressalva não confirmada**: não verifiquei se "Alibaba"/"DashScope"
   já aparece HOJE como card na tela de Integrations do OpenRouter — os
   docs oficiais listam Azure/AWS/Google Vertex com detalhe, Alibaba só
   aparece genericamente ("dezenas de outras plataformas"). Confirmar
   entrando na conta antes de seguir os passos 3-5.

2. **Circuito PRÓPRIO pra dilema+julgar**, separado de feed
   (`dilemaPausadoAte`/`dilemaFalhasSeguidas`, mesmo padrão do evento).
   Regra MAIS FORTE que a do evento, pedida explícita: **julgar nunca
   respeita a própria pausa** — se a cena já apareceu na tela, o
   jogador já escreveu a resposta, pausar o julgamento é o que produz
   "você seguiu em frente e nada aconteceu". Só `dilema` (a GERAÇÃO da
   cena, antes de existir resposta) respeita a pausa e cai no fallback
   local. Os dois ainda ATUALIZAM o mesmo contador de falha (um julgar
   que falhar pausa o PRÓXIMO dilema), só nunca pausam A SI MESMOS.

3. **Retentativa única em 429**, só dilema/julgar, espera de 2s antes
   de desistir — mesmo padrão já usado no evento pra JSON malformado,
   aqui pro motivo de falha mais comum medido (429, não JSON malformado).

`node testar.js aivivo` reescrito quase por inteiro: os cenários que
testavam o circuito COMPARTILHADO usavam `kind:"julgar"` como
representante — com julgar saindo desse circuito, isso testava a
variável errada. Trocado pra `kind:"feed"` (representante do
compartilhado, que continua podendo desligar de vez) e adicionados
cenários dedicados pro circuito de dilema/julgar e pro retry. 33
asserções, todas provadas com dente (guard da pausa revertido → 2
caem; bloco de retry removido → 5 caem).

**Remedido depois do deploy confirmado** (mesmo protocolo: ritmo
realista >60s entre chamadas, 3 carreiras reais, 12 dilemas):
**0/12 (0%) de fallback em julgar** — nenhum 429 apareceu nesta rodada,
bem abaixo do alvo de <10%.

**Ressalva honesta**: 0 fallback também significa que o pool não estava
congestionado NESTA janela de medição — nenhuma chamada bateu 429, então
esta rodada não exercitou o retry nem a pausa em produção de verdade
(só confirma "quando o pool está livre, tudo funciona", o que já era
esperado). A garantia de que o MECANISMO funciona sob 429 real vem dos
testes unitários (`node testar.js aivivo`, 33 asserções com dente,
incluindo os cenários de retry-com-sucesso e retry-com-falha-dupla) —
a medição em produção é ausência de evidência contrária, não prova
positiva do retry em ação.

**Achado do usuário, correto: as duas medições (67% e 0%) foram em
horas DIFERENTES do mesmo dia, ~4h10min de intervalo** — 67% por volta
de 01:40 UTC (09:40 horário da China, `vercel logs`), 0% terminando às
05:49 UTC (13:49 horário da China). Os dois caem dentro do horário
comercial chinês, não é claramente pico-vs-vazio por ESSE fuso — mas o
pool é compartilhado globalmente, outras regiões podem dominar a
demanda em horas diferentes, e uma amostra de 12 chamadas não separa
"o conserto funcionou" de "a hora calhou de estar livre". **Não dá pra
atribuir a queda de 67%→0% só ao conserto com o que foi medido até
aqui.** Recomendado: remedir de novo num horário bem diferente deste
(não precisa ser "pico" identificado — só outro ponto no tempo) antes
de tratar como resolvido pra anúncio. Pool já mostrou variar bastante
no mesmo dia mesmo antes do conserto (100% de falha numa chamada
isolada de manhã, depois taxas menores minutos depois).

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

## 23. Contas (Supabase) ligadas em produção — RESOLVIDO, SMTP/GOOGLE CONFIGURADOS (2026-09-10)

`SUPABASE_URL`/`SUPABASE_ANON_KEY` preenchidos e deployados, schema
(`supabase_schema.sql`, com RLS) já rodado no projeto. `getSupabase()`
retorna cliente real, caixa "Salvar conquistas" aparece em produção
depois das 22 lutas. Confirmado: `grep -rn "service_role"` no projeto
não devolve nada — só a `anon` key está no cliente, como desenhado.

**Auth trocado de link mágico pra e-mail+senha, mais login Google
(2026-09-09)** — decisão explícita: plano pago vem por aí, precisa de
conta de verdade. `criarConta()`/`entrarComSenha()`/`entrarComGoogle()`
em index.html, formulário único (`montarFormularioConta()`) reusado na
tela Conta e na caixa de fim de carreira. `node testar.js inicial`
(novo): Supabase falso, prova que os 3 fluxos chamam os métodos certos
do Supabase com os argumentos certos, com dente.

**SMTP próprio (Resend) e Google Provider — RESOLVIDO (2026-09-10)**,
confirmado pelo usuário ("Google e Resend configurados, login
funcionando, conquistas gravando no banco com RLS"). Os dois
bloqueantes que impediam tráfego real estão fechados. Ver
`LEIA-ME.md` "Contas" → "Estado desta instância".

**"Esqueci minha senha" — RESOLVIDO (2026-09-09)**. Link no formulário
de login chama `resetPasswordForEmail()`; `onAuthStateChange` (dentro
de `getSupabase()`, registrado uma vez) escuta `PASSWORD_RECOVERY` e
abre `screenNovaSenha()` sozinha quando o link do e-mail volta pra
página — sem rota nem parâmetro na URL. `definirNovaSenha()` chama
`updateUser({password})`. Continua dependendo do mesmo SMTP do item 1
pra o e-mail de verdade sair com a marca certa (o template "Reset
Password" é um dos que o SMTP libera editar) — sem SMTP, o e-mail de
recuperação ainda funciona, só sai feio.

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

## 26. Tela inicial, Conta (senha+Google+recuperação), Histórico e estrutura de Termos/Privacidade — IMPLEMENTADO (2026-09-09)

`boot()`/`ready()` iam direto pra tela de nome — sem menu, sem marca,
sem link pra conta ou termos. `screenInicio()` é a nova primeira tela:
OCTÓGONO grande (vermelho, `--stamp`), frase curta, menu à esquerda
(Jogar/Opções/Conta/Histórico), rodapé (Termos/Privacidade/Contato).
Link de desafio continua pulando direto pra `screenName()` (ver
`LEIA-ME.md` "Tela inicial").

Conta trocada de link mágico pra senha+Google, mais "esqueci minha
senha" (`resetPasswordForEmail`/`updateUser`, evento `PASSWORD_RECOVERY`
abre `screenNovaSenha()` sozinho) — ver item 23.

**Histórico — aprovado e implementado** (não ficou "em construção":
"item de menu que não faz nada é pior que item que não existe", pedido
explícito). Carreiras anteriores (nome, cartel, nota, data) + conquistas
desbloqueadas. Tabela nova `carreiras_usuario` em `supabase_schema.sql`
(rodar de novo no editor SQL, mesmo RLS de `conquistas_usuario`) —
`seed` como chave, já único por carreira. `localStorage` sempre
funciona sem conta; sincroniza por cima com sessão. Ver `LEIA-ME.md`
"Histórico".

Termos/Privacidade: só estrutura (texto `[PENDENTE]`), páginas
separadas (`screenTermos()`/`screenPrivacidade()`), rodapé + nota no
formulário de conta linkando as duas. Registro de aceite formal
confirmado: registra no PAGAMENTO (não no cadastro), guardando a
VERSÃO/hash do texto aceito junto — proposta completa em `LEIA-ME.md`,
não implementado (não tem checkout pra prender ainda).

`node testar.js interface` estendido (clica "Jogar" de verdade, não
pula a tela inicial mais). `node testar.js inicial` (novo, 24
asserções): navegação dos 4 itens do menu, Supabase FALSO confirmando
os 5 métodos de auth (login/cadastro/Google/recuperação/nova senha)
com os argumentos certos, evento `PASSWORD_RECOVERY` disparado
manualmente confirmando que `screenNovaSenha()` abre sozinha, Histórico
nos dois estados (vazio e com dado), páginas de Termos/Privacidade.
Tudo provado com dente.

## 27. Formulário de conta refeito — dois modos (entrar/criar), não um formulário só — RESOLVIDO (2026-09-10)

Pedido explícito: "hoje está simples demais para uma conta que vai ter
valor" — quem já tem conta não deveria ver confirmação de senha, quem
está criando não precisa ver "esqueci minha senha". Desenho aprovado
antes de escrever (mesmo processo do card de momento): duas mensagens
do usuário corrigiram um primeiro rascunho que ainda misturava Entrar
e Criar conta no mesmo formulário.

`montarFormularioConta()` reescrita com um `modo` interno
("entrar"/"criar") e `render()` remontando o container inteiro a cada
troca, alternada por um link no rodapé ("Criar conta" ⇄ "Já tenho
conta"). O que mudou, item por item do pedido:

- **Confirmar senha com validação em tempo real** — só no modo Criar,
  `oninput` chama `atualizaRegras()` a cada tecla.
- **Regra de senha visível, o que falta aparece digitando** — checklist
  ao vivo ("faltam N caractere(s) para o mínimo de 8" em vermelho →
  "✓ mínimo de 8 caracteres" em verde), não só erro depois de errar.
- **Mostrar/ocultar senha** — botão ao lado de cada campo de senha
  (`campoSenha()`), alterna `input.type` entre `password`/`text`.
- **Erros em português, não o texto cru do Supabase** —
  `traduzErroSupabase(msg)`, mapeamento por substring ("User already
  registered" → "Este e-mail já está cadastrado.", etc.), aplicado em
  todo caminho de erro, incluindo o caso em que o client valida 8
  caracteres mas o painel do Supabase rejeita por outra política (cai
  no bucket genérico de senha, não mostra erro cru).
- **Estado de carregando no botão** ("Entrando…"/"Criando conta…"),
  travando e-mail/senha/Google antes do primeiro `await` — sem duplo
  clique.
- **Botão desabilitado nunca fica sem explicação** — nasce desabilitado
  no modo Criar, mas a regra em vermelho já está visível acima dele
  (pedido explícito do usuário, resolvido sem precisar de tooltip).

**Decisão explícita sobre política de senha**: `SENHA_MIN=8`, só
tamanho — sem exigir maiúscula/número/símbolo ("regra complexa demais
no cadastro afasta gente"). O usuário configura o MESMO mínimo (8),
sem exigir classe de caractere, em Authentication → Providers → Email
no painel — client e painel precisam concordar, e o gap dos dois
divergirem já está coberto pelo bucket genérico de erro de senha
acima.

`node testar.js inicial` reescrito (34 asserções, até 2026-09-10):
troca de modo, campos aparecendo/sumindo por modo, checklist ao vivo
(tamanho e confirmação, separado), mostrar/ocultar, botão nascendo
desabilitado e habilitando sozinho, tradução de erro (cadastro
repetido e senha errada, mais uma tabela direta de
`traduzErroSupabase()` cobrindo 8 mensagens do Supabase). Prova de
dente feita ao vivo: quebrado `formValido()` de propósito (retornando
sempre `true`), 3 testes caíram, restaurado.

Detalhe completo em `LEIA-ME.md` "Contas" → "Formulário de conta
redesenhado".

## 28. Trabalho já feito sem virar momento visível — RESOLVIDO PARCIAL (2026-09-11)

Leitura crítica pedida ("onde o jogo desperdiça trabalho já feito?")
apontou dois números que já existiam, medidos, sem aparecer como
momento: `st.bonusNoite` (recorde de hype, só no relatório final) e a
posição na tabela inteira (`posicaoDivisao()`, só texto pequeno da
ficha). Implementados como card de momento — ver `LEIA-ME.md` "Card de
momento" pro protocolo de medição (frequência de cada um ANTES de
decidir o gatilho, mesmo cuidado de upset/raro) e o resultado.

**Correção ao vivo, achado verificando antes de implementar**: a
leitura original também listava "unificar o cinturão" como sem card —
**não procede**. `finishFight()` já empurra `criarMomento("cinturao",
FRASE_UNIFICACAO(...),...)` na unificação, desde a leva do cinturão
interino (2026-09-05) — não fazia sentido reconstruir o que já existe.
Só os outros dois entraram nesta leva.

**Item recorrente da loja** (mesma leitura crítica, "faz o jogo mais
dinâmico"): "Consultoria de mídia" implementado — ver item na seção
"Loja" do `LEIA-ME.md`.

**Pronto quando:** os outros dois pontos da leitura crítica (mundo
congelado, compressão de fã) — ver itens 29 e 30 abaixo — forem
decididos. Ficam para depois do lançamento por pedido explícito.

## 29. Mundo congelado ao redor do jogador — PRIORIDADE Nº1 PÓS-LANÇAMENTO

Da leitura crítica pedida sobre o jogo como produto (2026-09-11):
`RANKING`/campeão nomeado/rotação de contender só se movem quando O
JOGADOR luta — nenhuma carreira de NPC é simulada (já documentado em
LEIA-ME.md "Campeão nomeado": "é estático"). Ninguém sobe, ninguém cai,
ninguém perde o cinturão pro lado enquanto o jogador não luta.

Maior alavanca de dinamismo identificada, e a mais cara: simular
carreira alheia a cada luta do jogador é escopo de semana+, mexe em
balanceamento (RANKING recalculado, possível feed de notícia, efeito
em standing/economia a medir do zero). Decidido explicitamente: fica
para depois do lançamento. Registrado aqui pra não se perder.

**Pronto quando:** alguém decidir atacar isso e tiver medido, antes de
escrever código, o que "carreira de NPC" significa em termos de custo
computacional (a ficha já avalia 1.527 lutadores em 18 simulações cada
no boot — rodar isso de novo, ou uma versão mais barata, a cada luta do
jogador, precisa de orçamento de performance definido antes).

## 30. Fã (escala 0-10) comprime no meio — aguardando medir se importa

Item 7 (acima) já mediu: p40 a p60 de fã é só 1 ponto de diferença
(6,58→7,60), contra 4,82-9,96 do p10 ao p99 — carreira mediana não se
distingue em fã, ao contrário de seguidores (que separa bem até no
meio). Fechado na hora como "não é bug, é a escala" — decisão que
segue de pé — mas a leitura crítica de 2026-09-11 reabriu a pergunta
por outro ângulo: vale a pena redesenhar a curva?

**Decidido explicitamente: NÃO redesenhar ainda.** Falta o dado que
decide se isso importa — quanto o jogador de fato OLHA o medidor de fã
durante a carreira (contra seguidores, que já se sabe que é a métrica
mais visível/compartilhada, ver item 7). Redesenhar uma escala que
ninguém olha não muda nada pro jogador, só gasta um dia de trabalho.

**Pronto quando:** alguém medir uso real (analytics de quanto tempo a
barra de fã fica visível, ou perguntar direto a jogadores) e decidir,
com esse número em mãos, se o redesenho (não-linear, mais banda no
miolo) vale a pena. Sem essa medição, não mexer.

## 31. Rótulo de raridade das conquistas — RESOLVIDO (2026-09-21); lista de conquistas dobrou; ícones implementados

**Atualização 2026-09-21, segunda passada — as três partes do redesign
estão implementadas.** 15 → 29 conquistas (uma caiu na medição, ver
abaixo). Ícones (parte 1, `iconeConquista()`/`GLIFO_CONQUISTA`) e rótulo
de raridade (parte 2, `raridadeConquista()`/`TAXA_MEDIDA_CONQUISTAS`)
implementados na mesma sessão, depois de fechar a leva de conquistas
novas. Ícone: moldura de octógono (o selo do jogo) + 1 glifo traçado por
CATEGORIA (9 ao todo — punho/cinturão/escudo/coração/chama/alvo/
balança/estrela/queda), não por conquista — cresce sem desenho novo.
Rótulo: badge reaproveitado (`.badge-neutral/win/danger/gold`, já
existiam pra outro fim), texto só ("Comum"/"Incomum"/"Raro"/"Lendário"),
nenhuma porcentagem visível — só o comentário no código guarda o número
medido, pra trocar por Supabase depois sem mudar a lógica.

`node testar.js conquistas` ganhou 16 asserções novas cobrindo isto:
todo `cat` tem glifo, todo ícone carrega a moldura do octógono, os 4
limites exatos de `raridadeDeTaxa()` (60/30/10, testados nos dois lados
de cada um), `prudente` sem rótulo (única exceção, de propósito),
`lenda_coroada` com rótulo (medido em modo lenda separado).

**Não verificado no navegador nesta sessão** — a extensão do Chrome
ficou desconectada na hora de checar visualmente. Validação que rodou:
`iconeConquista()` chamado pra cada uma das 9 categorias via
`vm.runInContext`, SVG com brackets balanceados e moldura presente nos
9 casos, mais a suíte de testes acima. Vale abrir o painel de
conquistas no navegador de verdade na próxima sessão pra confirmar o
tamanho/alinhamento visual — a lógica está provada, o layout não foi
visto.

**As 14 novas, medidas com `node testar.js freqconquistas` antes de
entrar** (150 carreiras modo normal, 80 modo lenda): `chegada_relampago`
(topo do ranking até a luta 15, campo que já existia sem uso — 29,3%/
26,3%), `vidro` (4+ nocautes sofridos — 4,7%/21,3%), `ex_campeao`
(perdeu o cinturão depois de tê-lo — 38,7%/26,3%), `zero_de_22` (0
vitórias — 0,0%/0,0%, ressalva de viés do bot abaixo), `sequencia_feia`
(5+ derrotas seguidas, campo novo `st.longestL` espelhando `st.longestW`
— 0,7%/1,3%), `cinturao_interino` (campo novo `st.foiCinturaoInterino`
— 7,3%/13,8%), `nocauteado_do_trono` (perdeu o cinturão por nocaute,
campo novo `st.perdeuCinturaoPorNocaute` — 16,0%/18,8%),
`nunca_precisou_do_juiz` (7+ vitórias, todas finalizadas — 6,0%/30,0%),
`chato_mas_eficaz` (7+ vitórias, nenhuma finalizada — 0,0%/0,0%, mesma
ressalva), `nunca_foi_ao_chao` (0 quedas sofridas — 21,3%/11,3%),
`grande_queda` (15+ quedas aplicadas — 49,3%/61,3%, ver abaixo),
`nunca_aplicou_queda` (0 quedas aplicadas — 0,0%/1,3%), `recusou_a_chance`
(campo novo `st.maxDisputaRecusas` — 37,3%/36,3%), `decisao_de_campeao`
(ganhou o cinturão indo aos cartões, campo novo `st.tituloPorDecisao` —
9,3%/2,5%).

**Uma caiu na medição, tirada, não forçada:** `noite_marcante`
(`st.bonusNoiteMarco`) deu 66,7% no modo normal — acima do teto de 60%
que a própria leva se propôs a respeitar. É flag booleana, sem limiar
pra apertar (não é "N vezes", é "aconteceu ou não") — a correção certa
era tirar, não regredir o critério pra caber um número redondo de 15.
Ficou 14 + as 15 originais = 29.

**Achado medindo, não corrigido ainda — três conquistas passam de 60%
só no modo lenda:** `fogo` (68,0% normal — já sinalizado antes do
redesign, ainda não corrigido), `lenda_coroada` (66,3%, mas esse é
esperado — só desbloqueia em modo lenda mesmo), e agora `grande_queda`
(49,3% normal, correto, mas 61,3% em modo lenda). Padrão maior que
`zebra` já mostrava (0% normal, 92,5% lenda): **o bot em modo lenda
produz carreiras sistematicamente mais "quentes"** — mais quedas, mais
upsets, mais tudo — não é limiar errado de UMA conquista, é a
calibração do modo lenda inteiro rodando mais extrema que o normal.
Consertar isso decente exigiria remedir e potencialmente reequilibrar
o modo lenda como um todo, escopo maior que "adicionar conquista" —
registrado aqui, não vira decisão sozinha.

**Contagem geral, medida:** 5,26/29 (18,1%) no modo normal, 7,65/29
(26,4%) no modo lenda — as duas bem abaixo de metade, dentro do pedido
("se passar de metade, estão fáceis demais"). Baseline anterior (só as
15 originais, remedido no mesmo pull): 3,06/15 (20,4%) normal — o
`LEIA-ME.md` tinha 4,17/15 (28%), desatualizado desde que `TETO_TREINO`
baixou de 1.26 pra 1.18; corrigir lá também.

---

Redesign de conquistas (pedido explícito, 2026-09-20): mostrar dificuldade
sem inventar número. Não existe jogador de verdade ainda — uma "% de quem
tem essa conquista" hoje seria decorativo fingindo estatística, e isso
destrói confiança quando descoberto (e vai ser descoberto, num jogo que
pretende cobrar).

**Decidido:** rótulo textual de raridade (Comum/Incomum/Raro/Lendário),
faixas por cima da MEDIÇÃO OFFLINE já feita com o bot (`node testar.js
freqconquistas`), não um número exibido. As faixas propostas ao usuário:
acima de 60% Comum, 30-60% Incomum, 10-30% Raro, abaixo de 10% Lendário —
aguardando confirmação antes de aplicar.

**Quando existir jogador de verdade**: trocar o rótulo estático por
porcentagem real puxada do Supabase (`conquista_id` já existe em
`conquistas_usuario`, ver LEIA-ME.md "Conquistas" — é só `count(*) group by
conquista_id` dividido pelo total de contas, cacheado, não em tempo real
por carreira). Registrado aqui pra não se perder — não é trabalho do
redesign de agora, é o passo seguinte natural quando a fase 3 do
`PLANO-LANCAMENTO.md` (alguém de fora jogando) acontecer.

**Três conquistas sem taxa medível pelo bot offline, cada uma por motivo
diferente** — não dá pra tratar as três igual:
- `prudente` — depende de `j.evitouLesao`, campo que só a IA de verdade
  preenche (julgamento do dilema); o bot offline sempre cai no fallback
  local, que nunca marca esse campo. Taxa real só existe com jogador
  respondendo dilema de verdade contra a API em produção.
- `lenda_coroada` — não é problema de IA, é de MODO: só desbloqueia com
  `modo==="lenda"`, e a medição de frequência das outras 14 sempre rodou
  em modo normal. Mede igual às outras, só precisa de uma leva separada
  com o bot em modo lenda (`node testar.js freqconquistas N lenda").
- `nao_sente` — **achado remedindo pra este item: NÃO é IA-dependente.**
  A entrada anterior no LEIA-ME.md ("lesão/prudente/lenda não têm amostra
  offline") está desatualizada — lesão tem dois caminhos, dilema (IA) e
  nocaute (`lesaoRng`, 100% local, existe desde a Fase de lesão por
  nocaute). O bot offline JÁ gera esse momento pelo caminho de nocaute.
  Corrigir o LEIA-ME.md quando o redesign for implementado.

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

## 32. Plano Pro (R$10, pagamento único) — itens 1 e 2 FEITOS (2026-09-21)

Maior mudança estrutural desde contas. Arquitetura e mock completos
(`.claude/plans/lively-waddling-scone.md`), aprovados — Coletiva
pré-luta e Entrevista pós-luta (as duas usam IA, provocação/pergunta
reage a texto livre do jogador), Modo Rival (nome fictício, stats
emprestados de lutador real — protege imagem do mesmo jeito que a
ausência de retrato pros 1.527 reais), Modo Lenda vira Pro (trava só
client-side, aceita risco — sem segredo pra proteger, `fighters.json`
já é público por inteiro), cards com acabamento Pro (opção "contorno
duplo + canto cortado", sem escrever "PRO").

**Porta fechada pros 3 itens de IA**: JWT do Supabase mandado junto
do POST, `api/ai.js` verifica com `service_role` (nunca confia num
campo `isPro` solto no corpo), status Pro vem de consulta à tabela
`assinaturas`, nunca do cliente. Modo Lenda e cards Pro ficam de fora
dessa porta (não passam por `api/ai.js`).

**Custo de IA estimado** (proxy: `julgar`, o `kind` mais caro hoje,
US$0,000045/chamada medido): 44 chamadas novas/carreira Pro (1 por
coletiva + 1 por entrevista × 22 lutas — abertura da coletiva e
pergunta da entrevista são template local, sem IA, só a REAÇÃO ao
texto do jogador chama a IA) ≈ US$0,0033/carreira Pro total. R$10
financia ~500-600 carreiras Pro no cenário normal, ~250-290 mesmo
dobrando o custo por segurança — folgado. Precisa virar medição real
assim que a feature existir.

**Pagamento**: Asaas (Pix+cartão), webhook confere status E valor
direto na API da Asaas (nunca só o corpo do webhook), tabela nova
`pagamentos_processados` garante idempotência (Asaas pode reenviar o
mesmo evento). Estorno (`PAYMENT_REFUNDED`, a confirmar contra a doc/
sandbox da Asaas antes de codar) zera `pro`.

**Correção, checado nesta sessão**: os Termos de Uso NÃO estão
`[PENDENTE]` — `screenTermos()` tem texto real, formal, Versão 2
(19/09/2026, ver commit 9a81717). Mas esse texto EXPLICITAMENTE diz
"o Serviço não processa pagamento nem cobrança na presente versão"
e "caso isso venha a mudar, estes Termos serão atualizados
previamente, com nova manifestação de aceite do usuário antes de
qualquer cobrança" (seção 5) — então o gate continua necessário, só
o motivo é mais específico: falta a seção de pagamento/Pro (preço,
reembolso/arrependimento CDC, o que "pro" dá direito) nos Termos, e
falta Asaas como processador na Política de Privacidade (que hoje só
lista Supabase/Vercel). Botão de pagar fica desligado em duas
camadas (servidor recusa sem env var `TERMOS_PUBLICADOS` no painel
da Vercel; cliente mostra desativado) até essas duas páginas
saírem de Versão 2 pra Versão 3 com o conteúdo de pagamento.

**Ordem, 1 commit+push por item**: (1) SQL — FEITO, tabelas rodadas
pelo usuário no painel, conta marcada `pro=true` na mão pra testar.
(2) Coletiva + entrevista com verificação de JWT — FEITO. (3) Medição
das duas (alvo 90% citação de fato, deve bater ~100% pelo desenho
determinístico). (4) Modo Rival. (5) Cards Pro. (6) Pagamento, botão
desligado.

**Item 2, o que ficou pronto**: `api/ai.js` ganhou os prompts
`coletiva`/`entrevista` e `verificarPro()` (lê `assinaturas` com o
JWT do PRÓPRIO usuário via REST do Supabase — RLS já restringe à
própria linha, então este gate específico não precisa de
`service_role` nenhuma; `service_role` só entra no item 6, webhook de
pagamento). `index.html`: abertura da coletiva e pergunta da
entrevista são template local determinístico (`textoColetivaAbertura()`/
`perguntaEntrevista()`, prioridade fixa cinturão>lesão>zebra>método,
sem IA, sem rng — garante citação de fato por CONSTRUÇÃO); coletiva
mexe em `st.coletivaHype`/`st.coletivaPressao` (escopados a 1 luta,
resetados em `finishFight()`, aplicados em `hype`/`B.mAttr` dentro de
`lutar()`); entrevista reaproveita os MESMOS 3 campos do julgar (fã/
seguidores/dinheiro), mesma checagem `MENCIONA_DINHEIRO` (extraída
de `aplicarDilema()` pra módulo, reusada — não duplicada); vitrine no
grátis (`meuPro`, cache client-side só de UI — quem decide de
verdade é o servidor) com `abrirOfertaPro()` (painel próprio, nunca
`alert()`, o jogo inteiro evita dialog nativo). `ai()`/
`tentarChamadaIA()` generalizados de branches hardcoded (evento/
dilema/feed) pra tabela `FAMILIA_DO_KIND`/`RESPEITA_PAUSA`/
`CIRCUITOS` — as 2 famílias novas entram sem duplicar branch.

**2 achados registrados/consertados no caminho** (não é scope creep
do Plano Pro em si, mas apareceram testando a área que o Plano Pro
toca, e ficariam quebrados/inertes se eu não mexesse):
- `lim(v,lo,hi,def)`: `Number(null)===0`, que é finito — o padrão
  `lim(j&&j.campo,...)` usado em toda a base pra cair no `def` quando
  `j` inteiro foi descartado (CONTEUDO_INSEGURO) só funcionava por
  COINCIDÊNCIA nos casos com `def=0` dentro do intervalo (seguidores/
  fã/dinheiro). Em multiplicador (`def=1`, intervalo sem o 0, tipo
  .85-1.20) virava o PISO do intervalo, não o default — inerte até
  agora (sempre emparelhado com atributo também nulo, nunca
  aplicado), real pela primeira vez em `st.coletivaHype` (aplicado
  incondicional). Corrigido na raiz (`v==null` cai em `def` antes do
  `Number()`), `node testar.js pro/conteudo/dilema/eventoia` provam.
- `node testar.js conteudo`: 4 asserções de dinheiro reprovando
  ANTES de qualquer mudança minha (confirmado revertendo — não
  coberto por "tudo", ficou quebrado em silêncio). Fixture antigo
  ("Fez a escolha certa e ganhou uns seguidores"/"Gastou tudo num
  golpe") não menciona nada financeiro — o gate `mencionaDinheiro`
  (que o próprio teste deveria provar) estava certo, o texto do
  teste que nunca foi atualizado depois desse gate existir. Corrigido
  (fixture ganhou "fechou um patrocínio pequeno"/"perdeu o pagamento
  combinado").
- **Achado, NÃO consertado, fora de escopo**: `node testar.js
  narracao` reprova (31/63 decisões narram a linha de resultado ao
  vivo, deveria ser 63/63) — confirmado pré-existente do mesmo jeito
  (revertido e testado). Não é do Plano Pro, precisa de investigação
  própria (`montarDecisao()`/timing de `animarTrecho()`, estatístico,
  63 amostras) — fica registrado aqui pra não se perder, não
  investigado nesta sessão.

`node testar.js pro` (suíte nova, 39 asserções) cobre prioridade
determinística da pergunta, clamp de número (hype/pressão/fã/
seguidores/dinheiro), `CONTEUDO_INSEGURO`/`semResultadoDeLuta`
continuam valendo, vitrine no grátis nunca chama IA. `node testar.js
aivivo` ganhou os circuitos de coletiva (respeita pausa)/entrevista
(nunca respeita, igual julgar) — 10 asserções novas. `node testar.js`
completo: `TUDO CERTO`.

Env vars novas na Vercel quando chegar a hora (nunca no código,
pedido explícito): `SUPABASE_SERVICE_ROLE_KEY`, `ASAAS_API_KEY`,
`ASAAS_WEBHOOK_TOKEN`, `TERMOS_PUBLICADOS`. Item 2 não precisou de
nenhuma.

**Atualização 2026-09-21, segunda passada — antes do deploy do item 2,
o usuário pediu 3 coisas: esconder Pro de todo mundo até o pagamento
existir, investigar `narracao` (que ele lembrava de ter mandado
consertar antes) e explicar por que `node testar.js` completo dizia
"TUDO CERTO" com `conteudo`/`narracao` reprovando.**

**`node testar.js` ("tudo") só rodava interface+motor+draft.** As
outras 33 suítes nomeadas (`conteudo`, `narracao`, `aivivo`, `pro`,
`dilema`, etc.) só rodavam se chamadas por nome — "TUDO CERTO" nunca
quis dizer "tudo", só essas 6. Reescrito: roda as 36 categorias
dispatcháveis (mesma lista do `else if` no fim de `testar.js`),
reprova se qualquer uma reprovar, lista os nomes que reprovaram no
resultado final. `CLAUDE.md` atualizado — não é mais "~40s", é
"~25min completo" (medido: 24min33s), a maioria das suítes é rápida
mas `freqconquistas` (150 carreiras inteiras), `frequencia` (30),
`gapescolha` (3000 pares) e `motor`/`drivermotor` (6000 lutas cada)
são pesadas de verdade — rodar em background, não esperar no
terminal.

**`narracao` (31/63 decisões sem linha ao vivo) — investigado com
instrumentação de verdade (console.log direto no motor, não só
leitura de código), não só teoria.** Resposta pro usuário: **nunca
foi consertado por inteiro, nunca voltou — o motor sempre esteve
certo, o TESTE contava errado.** O conserto do "vencedor" que ele
lembrava (`trechoFinal` em `lutar()`, comentário "luta que vai aos
cartões terminava sem nenhuma linha de resultado") está correto e
nunca regrediu — reproduzido isolado, `round`/`marca`/`trechoFinal`
batem exatos pra toda decisão real. O bug real: `abrirDilema()`
também anexa seu painel em `#bouts` (o mesmo container da linha de
resultado), e esse painel tem `<div class="dil-eyebrow">Decisão</div>`
como RÓTULO FIXO da seção — nada a ver com o método da luta. O teste
antigo contava QUALQUER coisa em `#bouts` com a palavra "Decisão",
somando linha de resultado real + painel de dilema. 4 dilemas/carreira
× 8 carreiras = 32 falsos positivos — 63 registrados − 32 = 31, batendo
exato com o que a narração ao vivo já mostrava certo. Corrigido:
`boutsLinhas` agora preserva `className`, e a contagem filtra por
`.split(" ").includes("bout")` antes de testar o texto (nunca
`n.className==="x"`, mesma regra de sempre) — `node testar.js
narracao` agora dá 31/31.

**`frequencia` (achado de bônus, não pedido — apareceu rodando o
exaustivo): 18/30 carreiras crashavam com "lesaoRng is not a
function".** Faltava inicializar `lesaoRng`/`eventoRng` no setup do
teste — a suíte irmã (`freqconquistas`) já tinha essas duas linhas,
`frequencia` nunca ganhou. Sem relação com Plano Pro, pré-existente,
corrigido no mesmo commit por estar bem ao lado.

**Esconde Pro de todo mundo (pedido explícito antes do deploy)**:
`telaColetiva()`/`renderBotaoEntrevista()` ganharam `if(!meuPro)` logo
no topo — sem isso, nada mais roda, nem a vitrine. Hoje só a conta do
usuário tem `pro=true` no banco, então isso já esconde de qualquer
outra pessoa em produção sem precisar de flag nova nenhuma. O código
de vitrine (`abrirOfertaPro`) continua no arquivo, só fica
inalcançável — reverter quando o item 6 (pagamento) estiver pronto e
fizer sentido oferecer o plano pra quem visita.

`node testar.js` completo: **TUDO CERTO**, 36 categorias, ~25min.
Commit `fd3ec28`, já no ar (GitHub). Deploy feito e confirmado contra
`https://octogono.fun/api/ai` (`julgar` funcionando, `coletiva` sem
token/com token forjado recusando 403 — porta fechada em produção).

**Item 3 — medição, FEITA (2026-09-21).** 20 chamadas reais de
`entrevista` + 20 de `coletiva` contra produção, com o token de sessão
da conta Pro de verdade e dados de luta genuínos (`simulateFight()`
real, seeds variando até cobrir nocaute/finalização/decisão/zebra/
cinturão/lesão — nunca inventado à mão). Script em
`medir_pro.js` (scratchpad da sessão, não commitado — reconstrua se
precisar rodar de novo, é curto).

- **Citação de fato real: 20/20 (100%) nas duas** — não é medição
  probabilística, é garantida por construção: a pergunta/abertura são
  template local determinístico (prioridade fixa cinturão>lesão>zebra
  >método), nunca a IA quem decide se cita. Não tem como dar diferente
  de 100% a menos que o template quebre.
- **Nenhuma das 40 reações vazou resultado de luta futura** (checado
  contra as 40, zero ocorrência).
- **Achado real na medição, não teoria: "ensurdecedor" apareceu em
  9/40 reações (22,5%)** — mesma classe de muleta atmosférica que o
  prompt do `julgar` já proíbe explicitamente ("silêncio pesado no
  vestiário" etc.), só que os prompts novos (`coletiva`/`entrevista`)
  nunca herdaram essa regra. Corrigido: portado o mesmo parágrafo pros
  dois prompts, deployado, reconfirmado numa chamada nova (amostra
  livre da muleta, reagindo de verdade ao texto específico do
  jogador). Sem essa correção, reatividade ficaria dentro do alvo
  (>90% claramente reagia ao texto específico, não a um molde) mas com
  qualidade de prosa comprometida por repetição.
- Reatividade em si (a IA reage ao que foi ESCRITO, não a um molde
  genérico): lida à mão nas 40 amostras, como o plano já previa
  ("sem forma 100% automática confiável") — a grande maioria cita ou
  parafraseia especificamente o que o jogador escreveu (ex.: "sentir,
  senti" citado de volta, "controlei o ritmo" contestado com o placar
  real da luta), passa do alvo de 90% claramente.

Plano Pro itens 1-3 completos, deployados, medidos.

**Item 4 — Modo Rival, FEITO (2026-09-21).** Nome fictício (pool
próprio, `RIVAL_PRIMEIRO_M/F`+`RIVAL_SOBRENOME`, escolhido por gênero
via prefixo `w_` da divisão), stats de COMBATE emprestados de um
lutador real da mesma divisão (rating + todos os atributos treináveis
— mantém a dificuldade justa no motor), bio SANITIZADA (fights
aleatório num intervalo plausível, era null, titulos zerado — nunca a
carreira real de quem emprestou os números, mesma proteção de imagem
que a ausência de retrato pros 1.527 reais).

- **rng dedicado** (`rivalRng`, seed própria `SEED^0x6A09E667`) —
  nunca toca rng/escolhaRng/holdRng. Medido diretamente: mesma seed,
  rodando 10 lutas com `meuPro=false` e com `meuPro=true` (que
  consome rivalRng nas lutas 3/7), as 3 bandas comuns saem
  IDÊNTICAS nos dois casos — um link de desafio compartilhado por
  quem tem Pro continua reproduzindo o mesmo draft/adversário comum
  pra quem abre sem ser Pro.
- **Aparece luta 3, reaparece a cada 4** (7, 11, 15, 19) até o
  jogador vencer 1x — depois disso nunca mais nessa carreira. Nunca
  durante luta de título/defesa. Só Pro (`meuPro`), mesma trava de
  visibilidade do item 2 — grátis nunca vê a 4ª carta.
- **UI**: `telaAdversario()` ganha selo "RIVAL" (moldura dourada, cor
  de raridade já existente — sem inventar cor nova) e troca a bio
  normal pelo histórico entre os dois ("2ª vez que se enfrentam · você
  venceu a última, por decisão").
- **Histórico alimenta coletiva/entrevista**: `historicoRivalTexto()`
  monta um resumo (`"2º encontro... você venceu por decisão; ele
  venceu por nocaute"`), os dois prompts em `api/ai.js` ganharam
  instrução pra usar isso sem inventar encontro/vitória/método que não
  esteja no histórico.
- `node testar.js rival` (suíte nova, 19 asserções — cobre grátis
  nunca vê, Pro vê na luta certa, nome fictício não bate com lutador
  real, stats emprestados mas bio sanitizada, nunca em luta de
  título, cadência de reaparição exata, para depois de vencer, rng
  isolado medido, `historicoRivalTexto()`, `finishFight()` grava o
  histórico) — genuína, ~70s pra rodar sozinha (várias chamadas de
  `rateAll()` com 1.527 lutadores, não é suíte rápida).

Não medido contra produção ainda (a voz do rival na coletiva/
entrevista usa o MESMO prompt já medido no item 3, só com um campo a
mais no contexto — não é um `kind` novo, não abre uma superfície nova
de risco que precise de 20 chamadas dedicadas; se quiser medir mesmo
assim, é rodar `medir_pro.js` de novo depois de uma carreira Pro que
chegue no rival).

**Item 5 — Cards Pro, FEITO (2026-09-21).** Opção A do plano (contorno
duplo + canto cortado), compartilhada entre `desenharCard()` (fim de
carreira) e `desenharCardMomento()` — um desenho só
(`fundoCard()`/`seloProCanvas()`), não dois inventados. Canto cortado
34px, régua dupla em `C.gold` (mesma cor de raridade das conquistas,
nenhuma cor nova) — externa na borda cortada, interna recuada — e selo
de octógono sólido no rodapé, canto oposto ao `octogono.fun` (que
sempre fica à direita). Sem escrever "PRO" em letra nenhuma. Card
grátis pixel a pixel igual a antes — só entra quando `meuPro===true`
no momento de gerar o card.

**Sem cobertura automatizada possível**: Canvas 2D não existe no
harness headless (`getContext` devolve `null` nos testes — é por isso
que `testarCompartilhar()` já usava `desenharFake()`, não o desenho de
verdade). Verificado visualmente no navegador, contra produção
deployada, com a conta Pro de verdade logada (não forjei `meuPro`,
`atualizarStatusPro()` resolveu `true` sozinho a partir da sessão
real): canto cortado + contorno duplo + selo aparecem certo quando
Pro, e o card grátis (mesma chamada, `meuPro=false`) sai idêntico ao
de sempre, canto reto, sem contorno.

**Item 6 — Pagamento (Asaas), código FEITO, NÃO deployado, NÃO
configurado (2026-09-21).**

- **Termos de Uso e Política de Privacidade viraram Versão 3.** Termos
  ganhou seção 6 (Plano Pro — pagamento único): preço, o que
  desbloqueia, quem processa (Asaas, Pix/cartão, sem o Octógono ver
  dado de cartão), direito de arrependimento de 7 dias corridos (art.
  49 CDC) com devolução integral, o que acontece fora do prazo. Seções
  seguintes renumeradas (7-14). Privacidade ganhou Asaas como operador
  novo na seção 4 (é instituição de pagamento brasileira — sem
  transferência internacional, diferente de Supabase/Vercel/IA), CPF e
  status Pro na lista de dados tratados (seção 2), retenção fiscal de
  pagamento (5 anos, CTN art. 173, seção 7). Sem renumeração em
  Privacidade — só bullets novos, nenhum header mudou de número.
- **`screenConta()` ganhou bloco de compra** (`renderPlanoPro()`, só
  aparece com sessão ativa): mostra status Pro se já é Pro; senão, CPF
  + checkbox de aceite (com link pros Termos/Privacidade, sem
  pré-marcado) + botão "Confirmar pagamento — R$10". Botão SEMPRE
  tenta a chamada real (não finge estado "desligado" client-side) —
  se `TERMOS_PUBLICADOS` não estiver ligado no servidor, a resposta
  503 vira a mensagem inline. Aceite grava em `aceites_termos` (upsert
  idempotente, mesmo padrão de `conquistas_usuario`) ANTES de chamar
  `/api/criar-pagamento` — se o registro do aceite falhar, o pagamento
  nem é tentado.
- **`api/criar-pagamento.js` (novo)**: verifica o JWT do usuário
  (`/auth/v1/user` na Supabase, sem service_role — só prova quem é
  quem, nunca escreve nada), confere `TERMOS_PUBLICADOS==="true"`
  (503 se não), confere CPF por módulo 11, recusa se a conta já é Pro
  (409), cria cliente na Asaas (`POST /v3/customers`,
  `externalReference=user_id`) e a cobrança (`POST /v3/payments`,
  `billingType:"UNDEFINED"` — usuário escolhe Pix ou cartão na página
  hospedada da própria Asaas, `externalReference=user_id` de novo, é
  isso que o webhook usa pra saber de qual conta é o pagamento),
  devolve `invoiceUrl` pro cliente redirecionar.
- **`api/webhook-asaas.js` (novo)**: autentica pelo header
  `asaas-access-token` contra `ASAAS_WEBHOOK_TOKEN`. Pra
  `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`: refaz `GET
  /v3/payments/{id}` direto na Asaas (nunca confia no corpo do
  webhook), só ativa `pro=true` se o status confirmado por lá for
  `CONFIRMED`/`RECEIVED` E o valor bater (≥R$9,99 — trava contra
  cobrança de teste/errada). Pra `PAYMENT_REFUNDED`/
  `PAYMENT_PARTIALLY_REFUNDED`: só desativa (`pro=false`) se o status
  real virou `REFUNDED` (parcial não derruba, plano é preço fixo).
  Grava em `assinaturas` via `SUPABASE_SERVICE_ROLE_KEY` (único lugar
  do projeto que usa a service_role pra escrever). Idempotente por
  `(asaas_payment_id, evento)` via `pagamentos_processados` — sempre
  responde 200 (menos token errado, 401), porque é assim que se diz
  "recebido, não reenvie" pra Asaas.
- **Nomes de evento/status/cabeçalho da Asaas confirmados contra
  `docs.asaas.com` nesta sessão** (`payment-events`,
  `webhook-para-cobrancas`, `recuperar-uma-unica-cobranca`,
  `criar-nova-cobranca`) — não é suposição, era um risco marcado
  explicitamente no plano original ("PAYMENT_REFUNDED — não
  confirmado, confirmar antes de escrever o handler").
- **Bug achado e corrigido ANTES de virar bug de verdade**:
  `pagamentos_processados` tinha PK de uma coluna só
  (`asaas_payment_id`). Confirmação seguida de estorno no MESMO
  pagamento faria o estorno bater em "já processado" pelo primeiro
  evento e ser ignorado — `pro` ficaria `true` pra sempre depois de um
  estorno real. Corrigido pra PK composta `(asaas_payment_id, evento)`
  em `supabase_schema.sql`, com o `alter table` de migração comentado
  no arquivo (a tabela já existe em produção com a PK antiga — @user
  precisa rodar a migração manualmente no painel, ver arquivo).

**`node testar.js interface` e `node testar.js pro`: passam** (39/39
em `pro`, sem regressão pelo texto novo de Termos/Privacidade nem pelo
bloco novo em Conta — confirmado que o fluxo de login/cadastro
testado em `testarTelaInicial()` nunca chega a renderizar
`renderPlanoPro()`, porque login bem-sucedido chama
`location.reload()`, no-op no sandbox, então a tela Conta não
re-renderiza com sessão dentro do mesmo teste). `node testar.js tudo`
completo rodando em background nesta sessão pra confirmar sem
regressão em nenhuma das ~36 categorias antes do commit.

**NÃO deployado. NÃO configurado.** Faltam, todas no painel da Vercel,
nunca no código:
- `ASAAS_API_KEY`
- `ASAAS_WEBHOOK_TOKEN` (mesmo valor configurado no painel da Asaas,
  em Integrações → Webhooks, apontando pra
  `https://octogono.fun/api/webhook-asaas`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `TERMOS_PUBLICADOS=true` (só depois das três acima estarem
  configuradas e o webhook cadastrado no painel da Asaas — é o que
  liga o endpoint de pagamento de verdade)

E a migração SQL comentada em `supabase_schema.sql` (PK composta de
`pagamentos_processados`) precisa rodar no painel do Supabase antes do
primeiro pagamento real, senão um estorno não desativa o Pro.

Sem essas variáveis, o botão em Conta segue tentando e mostrando
"Pagamento ainda não está disponível nesta versão." — nada quebra,
nada cobra, só não funciona ainda.

**Item 6 — modelo trocado pra 30 dias, R$9,99 (2026-09-22).** Testado
em produção (deploy anterior, com a conta de teste): endpoint no ar,
`TERMOS_PUBLICADOS`/`ASAAS_API_KEY` confirmados funcionando (cobrança
real criada na Asaas, `invoiceUrl` válido, RLS bloqueando o usuário
comum de escrever `pro` — só service_role escreve). Antes do usuário
completar um pagamento real de verdade, pedido dele: não é mais
pagamento único pra sempre, é **R$9,99 libera 30 dias, sem cobrança
automática — passado o prazo sem pagar de novo, a conta volta sozinha
pra grátis**.

- `api/webhook-asaas.js`: `ativarPro()` agora lê `expira_em` atual
  antes de escrever (`expiraEmAtual()`), soma 30 dias a partir de
  `max(agora, expira_em atual)` — renovar antes de expirar não
  desperdiça dias. `plano` passa a ser `'mensal'` (não mais
  `'unico'`). `desativarPro()` (estorno) também zera `expira_em` pra
  agora, não só `pro=false`.
- `api/ai.js` (`verificarPro`) e `index.html`
  (`proAindaValido()`/`atualizarStatusPro()`/`renderPlanoPro()`): como
  não existe cobrança recorrente nenhuma disparando webhook quando o
  prazo acaba, ninguém desliga `pro` ativamente — a checagem é
  **preguiçosa**, em toda leitura: `pro===true` E `expira_em` ainda no
  futuro. `verificarPro()` (o portão de verdade em `api/ai.js`) e o
  cache do cliente fazem exatamente a mesma conta, espelhada.
- `api/criar-pagamento.js`: tirado o bloqueio de "já é Pro" (409) —
  renovar antes de expirar é uso normal agora, não erro.
- `screenConta()`: mostra "Pro até DD/MM/AAAA" quando ativo, "expirou
  em DD/MM/AAAA" quando não, e o formulário de compra/renovação
  continua sempre visível (não desaparece só porque já é Pro).
- Termos de Uso vira **Versão 4** (22/09/2026): seção 6 reescrita pro
  modelo de 30 dias — nunca cobra sem ação nova do usuário, cai
  sozinho pra grátis sem aviso de cobrança (porque não há cobrança
  nenhuma acontecendo), direito de arrependimento de 7 dias continua
  igual (art. 49 CDC). `VERSAO_TERMOS_PAGAMENTO` no código bumpado
  pra `"4"` — ninguém tinha aceitado a Versão 3 pra pagamento real
  ainda (só chamada de teste direta, sem passar pelo checkbox), então
  não há aceite órfão de versão antiga a se preocupar.
- `node testar.js tudo`: **TUDO CERTO**, ~36 categorias, 13min.

Ainda não deployado no momento deste registro — commit feito, deploy é
o próximo passo, com o usuário esperando pra completar um pagamento
real de R$9,99 assim que confirmar que subiu.

**Incidente real (2026-09-22): 1º pagamento de verdade não ativou o Pro
sozinho — causa raiz e conserto.** Usuário pagou R$9,99 de verdade
(Pix, conta giovanecpiresg@gmail.com), `assinaturas.pro` não mudou.

- **Diagnóstico errado no meio do caminho, corrigido**: achei nos logs
  da Vercel (`vercel logs`) uma chamada `POST /api/webhook-asaas` →
  401, e concluí que era a Asaas tentando entregar o webhook com token
  errado. Bati o horário: era um **curl meu**, teste de alcançabilidade
  logo após o deploy (corpo vazio, sem header nenhum — 401 é
  comportamento correto ali, não bug). Confirmado depois que o próprio
  log de entregas da Asaas estava **vazio** — se fosse tentativa real
  dela, apareceria lá mesmo dando erro.
- **Causa raiz de verdade**: o webhook cadastrado no painel da Asaas
  não tinha os eventos de pagamento (confirmada/recebida/reembolsada)
  marcados. Sem inscrição no evento, a Asaas não tenta entregar nada —
  não é retry falhando, é disparo que nunca aconteceu. Usuário marcou
  os 3 eventos (bate com `EVENTOS_CONFIRMACAO`/`EVENTOS_ESTORNO` em
  `api/webhook-asaas.js`) e salvou.
- **Efeito**: conserta daqui pra frente (próxima renovação em 30 dias
  dispara sozinho). Não reprocessa o pagamento de hoje retroativamente
  — sem botão de reenvio no painel da Asaas pra esse evento específico.
- **Reconciliação manual do pagamento de hoje** (SQL rodado direto no
  Supabase, sem envolver `service_role` nem chave nenhuma no código):
  `assinaturas.pro=true`, `plano='mensal'`, `expira_em=2026-10-22`,
  `asaas_payment_id='pay_916513392'` (prefixo `pay_` inferido — o
  painel da Asaas só mostrava o número puro na URL, não achamos o ID
  completo em lugar nenhum visível; se o webhook real chegar depois
  com o ID verdadeiro, o pior caso é ganhar dias extras de bônus, não
  trava nada). Linha equivalente inserida em `pagamentos_processados`
  como registro do evento.
- **Lição pro projeto**: `vercel logs` mostra QUEM chamou o endpoint,
  não QUEM DEVERIA ter chamado — uma chamada 401 meio-própria no meio
  de uma sessão de teste é fácil de confundir com a coisa real que
  você está caçando. O log de entregas do LADO QUE ENVIA (aqui, o
  painel da Asaas) é a fonte de verdade sobre se uma tentativa
  aconteceu; o log de quem recebe só mostra o que efetivamente chegou.

## 33. Plano Pro: visibilidade pós-pagamento (2026-09-22)

Jogado depois do item 6 no ar, achado real (não teoria): o plano existia
mas ninguém via — Modo Lenda jogável de graça pela interface normal
(bug), coletiva/entrevista escondidas até o pagamento existir (trava
temporária que ficou órfã), Modo Rival 100% automático e silencioso (só
um selo pequeno na 4ª carta, sem escolha, sem nome, sem aviso). Cinco
pedidos, mock de texto aprovado antes de codar (Plano Pro + carrossel).

**Item 1 — Modo Lenda travado de verdade.** `screenDivisao()` nunca
checava `meuPro` no clique de "Seja uma lenda" — bug de interface
normal, não o risco de DevTools que o plano original aceitava. Clique
agora confere `meuPro` e recusa com nota inline ("Modo Lenda é recurso
do Plano Pro", link pra `screenPlanoPro()`) em vez de trocar `MODO`.
**Achado corrigindo isto**: o primeiro jeito que escrevi capturava
`travado` no fechamento, no momento em que o botão nasce — se `meuPro`
mudasse depois (login/pagamento sem a tela re-renderizar), o botão
ficava travado pra sempre até sair e voltar. Corrigido pra reconferir
`meuPro` DENTRO do `onclick`, não fora. Pego rodando `node testar.js
tudo` (variante "divisão 6, modo lenda" da suíte `interface`, que
simula sessão Pro — se o bug tivesse ficado, um jogador que virasse Pro
no meio da tela de criar carreira teria o mesmo problema).

**Item 2 — tela "Plano Pro" no menu principal** (`screenPlanoPro()`,
5º item do menu). 5 benefícios com ícone+descrição, carrossel de 2
cards sintéticos (grátis/Pro, `desenharPreviewCard()` — NÃO é
`desenharCard()` real, que depende de `me`/`st`/`DIVISION` de uma
carreira em andamento; reaproveita só `fundoCard()`/`seloProCanvas()`,
a diferença visual sendo vendida, com dado de exemplo fixo). Formulário
de compra/renovação (`renderPlanoPro()`) **saiu da tela Conta e mudou
pra cá** — sem sessão, mostra "Assinar exige uma conta" com link pra
Conta; com sessão, formulário de verdade.

**Item 3 — Conta mostra status, não formulário.** `screenConta()`
agora só tem `renderStatusProResumo()`: "PLANO PRO ATIVO" em negrito
verde (`--win-dim`) se Pro, link "Ver Plano Pro →" senão. O formulário
inteiro (CPF, aceite, botão) morou na tela Conta até aqui — mudou pra
`screenPlanoPro()` (item 2), sem duplicar código
(`renderPlanoPro(container,session)` é a mesma função, só quem chama
mudou).

**Item 4 — Modo Rival vira escolha explícita.** `screenAtivarRival()`
(novo, entre escolher divisão e o draft): Sim/Não + nome livre se Sim,
mesma vitrine das outras (grátis vê a tela, "Sim" abre oferta em vez
de ativar). `RIVAL_ATIVADO`/`RIVAL_NOME_ESCOLHIDO` são variáveis de
módulo (mesmo padrão de `MODO`/`DIVISION`/`SEED` — sobrevivem ao setup
até `startCareer()` copiar pra dentro de `st`). `rivalDeveAparecer()`
agora exige `st.rivalAtivado` além de `meuPro` — sem a escolha, o
rival nunca aparece, nem pra quem é Pro. `gerarRival()` usa o nome do
jogador (`st.rivalNomeEscolhido`) em vez de sortear, quando existe.
Validação do nome extraída pra função pura `validarNomeRival()`
(testável direto, sem montar a tela): recusa vazio, recusa nome que
bate (sem acento, sem maiúscula) com qualquer um dos 1.527 reais do
`fighters.json` — mesmo motivo do rival ser sempre fictício, a IA
inventaria fala na boca de gente real — e recusa `CONTEUDO_INSEGURO`.
Anúncio de 1ª aparição em `telaAdversario()` (`st.rivalAnunciado`,
uma vez só): "RIVALIDADE COMEÇA AGORA" antes da lista de adversários.

**Item 5 — coletiva/entrevista viram vitrine de verdade.** As duas
tinham `if(!meuPro){...return;}` no topo — trava temporária de antes
do item 6 existir, com nota já deixada no código dizendo pra trocar
quando o pagamento estivesse pronto. Removida: agora aparecem pra todo
mundo, só o clique de fato (Provocar/Dar entrevista) diverge pra quem
não é Pro (abre oferta em vez de chamar a IA — código que já existia,
só estava inalcançável).

**Bug de teste achado e corrigido no caminho** (não do motor):
`document.getElementById` no DOM falso do `testar.js` fabrica um nó
novo por id sob demanda — não reflete texto de um botão que nasceu
dentro de um template HTML bruto (`box.innerHTML=\`...<button
id="x">texto</button>...\``). Pra esses casos, o innerHTML do
CONTAINER pai é a fonte de verdade, não o nó filho. E `.textContent=`
funciona normal nesse DOM falso (é campo puro) — só não é o mesmo que
`.innerHTML` (que reflete `_html`), confundir os dois deu 3 falsos
negativos nesta sessão até eu entender a mecânica certa.

**Classe reaproveitada por engano**: usei `conta-box` (que um teste
antigo trata como marcador exclusivo "existe caixa de conta
configurada") nas telas novas — quebrou um teste que checava ausência
de conta-box sem Supabase configurado. Renomeado pra `tela-box` (CSS
compartilhado com `conta-box` via seletor combinado, semântica
separada).

`node testar.js tudo`: **TUDO CERTO**, ~36 categorias, 26min — 2
rodadas (a 1ª pegou o bug do fechamento capturado, corrigida, a 2ª
passou limpa).

## 34. Selo Pro padronizado + 3 modelos de card (2026-09-22)

Pedido depois de ver o item 33 no ar: selo visual único pra tudo que é
Plano Pro (em vez do sufixo "🔒 Pro" solto em cada tela), e o card Pro
ganhar 3 modelos pra escolher (não só o acabamento único de sempre).

**Selo Pro.** `seloPro()` (retorna
`<span class="selo-pro">Plano Pro</span>`) + CSS `.selo-pro` (fundo
semi-transparente `rgba(185,147,47,.16)`, contorno `var(--gold)`,
texto `var(--gold-bright)` — mesma paleta de raridade de sempre, nada
novo). Substituiu o "🔒 Pro" em texto solto nos 4 lugares que tinham:
botão "Seja uma lenda", tela "Modo Rival", botão "Provocar" (coletiva)
e botão "Dar entrevista". Qualquer recurso Pro novo reaproveita
`seloPro()`, não escreve o próprio texto.

**3 modelos de card** (Ouro/Prata/Bronze — decisão tomada quando
perguntei: cor de destaque diferente por modelo, não moldura
diferente). `fundoCard()`/`seloProCanvas()` ganharam parâmetro de cor
opcional, com fallback pro valor salvo (`corCardProEscolha`,
persistido em `localStorage`) — **card grátis dos 1.527 continua
idêntico, e quem já era Pro antes desta mudança não vê o próprio card
mudar de cor sozinho**: "Ouro" é bit-a-bit o mesmo hex que já existia
(`#B9932F`), sem isso teria sido uma mudança visual não-pedida em cima
de quem já pagou. Escolha feita no carrossel da tela Plano Pro (agora
4 posições: Grátis + 3 cores), botão "Usar modelo X" só funciona de
verdade com `meuPro` — sem Pro, mostra e deixa passear pelas 3 cores
(vitrine) mas avisa que precisa assinar pra aplicar.

`node testar.js inicial/interface/pro/rival`: todos passam, incluindo
os testes novos do carrossel (Pro escolhendo Prata grava e mostra "Em
uso"; sem Pro, botão aparece mas não muda nada, só avisa).

## 35. Pendente — registrado, não começado

- **"Muito mais opções de customização de personagem" pro Plano
  Pro.** Direção escolhida quando perguntei: mais variedade DENTRO das
  categorias que já existem (hoje: 8 peles, 9 cortes de cabelo, 8
  barbas, 5 olhos, 6 sobrancelhas, 6 bocas, 6 cicatrizes, 8 cores de
  calção, 3 portes — `PELES`/`CABELO_TIPOS`/etc. em index.html perto
  de `bonecoSVG()`). Cada opção nova é path de SVG desenhado à mão,
  seguindo o sistema de coordenadas de `anatomia()` — trabalho de
  ilustração de verdade, não é dado/config; precisa de verificação
  visual em navegador (o mesmo motivo pelo qual card/canvas não tem
  cobertura automatizada). Não é do tamanho do resto desta sessão —
  fica pra uma leva própria, categoria por categoria.
- **Modo PVP — ideia registrada, sem compromisso.** Pedido como "se
  possível" — não é recurso a mais dentro da arquitetura atual, é
  mudança de arquitetura: o jogo hoje é **single-player, motor roda
  100% no navegador do jogador**, sem servidor de partida, sem
  conceito de "outro jogador" em lugar nenhum do código (o próprio
  Termos de Uso, seção 2, diz isso explicitamente — "sem multijogador
  e sem interação entre usuários"). PVP de verdade precisaria de, no
  mínimo: motor autoritativo rodando em servidor (o cliente hoje decide
  o resultado sozinho — daria pra forjar vitória trivialmente num PVP
  client-side), matchmaking, alguma forma de sincronização/replay
  entre os dois jogadores, e reescrita da seção 2 dos Termos. Combinado
  de deixar só como ideia registrada por enquanto, sem investigação de
  escopo ainda.

## 36. Três bugs achados jogando (2026-09-24)

**1. "Não vi card nenhum novo".** Causa raiz: `meuPro` só é conferido
1x, no INÍCIO da carreira (`atualizarStatusPro()` fire-and-forget em
`startCareer()`, sem retry). Se essa chamada falhar (rede) ou não
terminar a tempo, `meuPro` fica `false` a carreira INTEIRA — inclusive
no momento mais importante: gerar o card final. `gerarBlobCard()`
(usado por `salvarImagem()`/`copiarImagem()`, os dois únicos lugares
que de fato desenham o card — `screenReport()` mostra só a tabela de
estatísticas, o card em si é gerado sob demanda) agora reconfere
`meuPro` fresco ANTES de desenhar, mesmo raciocínio do bug do
fechamento capturado do item "Seja uma lenda" (nunca confiar num valor
pego de antemão quando dá pra reconferir na hora que importa).

**2. "Botão de dar entrevista das lutas passadas continua
aparecendo".** `renderBotaoEntrevista()` só ACRESCENTAVA um convite
novo em `#bouts` a cada luta, nunca tirava o da luta anterior sem
resposta. `entrevistaWrapAtual`/`entrevistaWrapRespondida` (novos):
convite sem resposta é limpo (`innerHTML=""`) quando a luta seguinte
chama de novo; convite JÁ RESPONDIDO (via `aplicarEntrevista()`) fica
pra sempre — é histórico de carreira, não convite pendente.

**3. "Não tá dando tempo de ler".** Nem o automático (retomava em
1,1s/velocidade) nem "Próxima luta" sabiam que uma entrevista estava
aberta. `entrevistaAberta` (novo, mesmo papel de `dilemaAberto`): abre
no clique de "Dar entrevista" (só a pergunta de verdade, Pro — a
vitrine pro grátis não trava nada), trava `next.disabled`, o timer do
automático, `nextFight()` e `toggleAuto()`. Fecha só quando o jogador
clica o botão novo "Continuar pra próxima luta" (dentro de
`aplicarEntrevista()`, depois da reação da IA), que chama
`nextFight()` de propósito — pedido foi "um botão de ir pra luta", não
só "fechar o painel".

`node testar.js tudo`: TUDO CERTO, ~36 categorias, 26min. Cobertura
nova: `compartilhar` (meuPro reconferido fresco, contagem de downloads
4→5), `pro` (convite limpo/preservado certo, Continuar trava/libera
entrevistaAberta e chama nextFight()).
