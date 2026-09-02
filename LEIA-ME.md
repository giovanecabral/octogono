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

# uma divisão específica
node testar.js draft heavyweight
node testar.js interface 7
```

---

## Os arquivos

```
index.html          O JOGO INTEIRO. Motor, draft, narração, eventos, interface.
                    É a única fonte de verdade: o testar.js lê o motor daqui.
fighters.json       1.527 lutadores com stats calculadas do ufcstats.
testar.js           A única ferramenta.
atualizar-dados.py  Regenera o fighters.json com dados novos.
api/ai.js           Proxy do OpenRouter. Só é usado depois do deploy.
```

Cinco arquivos. Para jogar você precisa de dois: `index.html` e `fighters.json`.

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

Quem abre esse link recebe a **mesma carreira**: as mesmas cartas oferecidas no
draft, os mesmos adversários na mesma ordem. Só as escolhas mudam. É isso que
transforma o compartilhamento num desafio em vez de um print.

A semente controla tudo que é sorteado. Se você mexer na ordem em que o `rng` é
consumido — sortear uma coisa a mais antes do draft, por exemplo — os links
antigos deixam de reproduzir as carreiras antigas.

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

## Progressão do lutador

O treino é **permanente**, e por isso precisa de teto. Sem ele, 22 camps de +10%
viram +700% e a calibração toda vai embora.

Cada atributo tem um multiplicador que começa em 1.00 e satura em
`TETO_TREINO` (1.26). O ganho de cada camp é proporcional ao que **falta** para
o teto, então o primeiro camp rende 7,8% e o décimo sexto rende 0,04% — evolução
de atleta, não escada infinita.

Medido em 400 carreiras: treino dá **+1,9 vitórias em 22 lutas** e leva o pico de
top 11% para top 2%. Progressão que se sente, sem quebrar o balanceamento.

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
Confirmar o gatilho na tela seria um convite a testar o limite.

**A calibração é oposta à do `RESULTADO_LUTA` de propósito.** Lá, falso
positivo custa perder uma frase boa, e a taxa foi medida pra ficar embaixo
de ~5%. Aqui, falso positivo custa um desfecho genérico a mais — barato — e
falso negativo é o risco real. `CONTEUDO_INSEGURO` mira pegar tudo que
puder, não mirar uma taxa baixa.

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

A ficha diz o que falta, em linguagem de UFC: entrar no ranking dos 15, subir,
chegar ao top 5, vencer um contender, emplacar 3 vitórias. A mensagem é vermelho
escuro porque é aviso do que falta, não alarme.

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
só se o nome repetido for literalmente `RANKING.campeao` ou `RANKING.desafiante`
desta divisão — qualquer outra repetição continua reprovando. Se alguém tentar
"consertar" isso de volta pra "22 sempre distintos" sem ler até aqui, a
revanche de título quebra nos mesmos termos de antes.

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
irrevogável ("teve o cinturão nas mãos e isso ninguém tira") — precisa
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

## Som

Quatro arquivos em `audio/`, gerados por síntese (`audio/sintetiza.py`):

| arquivo | duração | uso |
|---|---|---|
| `bgm_fight.ogg` | 1:55, loop perfeito | trilha contínua |
| `button_click.wav` | 0,14 s | clique de interface |
| `victory.wav` | 2,6 s | vitória |
| `defeat.wav` | 2,8 s | derrota |

Se algum faltar ou o navegador recusar o formato, o **som sintetizado na Web
Audio API assume** — o jogo nunca fica mudo por um 404.

### Sons de evento

Três sons curtos para o desfecho de eventos e dilemas: **bom** (terça maior
subindo), **ruim** (segunda menor descendo com o chão saindo embaixo) e
**neutro** (um toque só). Todos mais leves que vitória e derrota de propósito —
tocam logo depois delas e não podem competir.

A direção sai de duas fontes, nesta ordem:

1. **Marca explícita** (`tom: 1 / -1`), usada nos eventos raros. Eles são os mais
   dramáticos do jogo e nenhum mexe em atributo, então o método automático não
   os alcançava.
2. **Efeito medido**: aplica o `fx` num clone e compara os atributos. Serve para
   os eventos de camp e lesão sem precisar de rótulo.

Evento sem marca e sem efeito toca o neutro. Hoje: 7 bons, 7 ruins, 24 neutros.

No dilema a direção é direta, dos números que a IA devolveu (já limitados
pelo `lim()`).

### Como foram equilibrados

A primeira versão saiu com **83% da energia abaixo de 60 Hz e 0,2% de médio**:
ronco no fone e silêncio no alto-falante de celular. A correção não foi ajustar
ganho no olho, foi escrever um equalizador que mede a energia por banda e
corrige até bater o alvo (`equilibra()` no `sintetiza.py`).

Distribuição final:

| | sub 20-60 | grave 60-250 | médio 250-2k | alto 2k-6k |
|---|---|---|---|---|
| bgm_fight | 17% | 41% | 34% | 8% |
| button_click | 6% | 50% | 43% | 2% |
| victory | 22% | 42% | 37% | 0% |
| defeat | 25% | 42% | 33% | 0% |

Duas coisas que o equalizador **não** resolve, e por isso foram corrigidas na
fonte: ele não realça médio que não existe. A derrota tinha o acorde em 73-110 Hz
com filtro em 680 — subiu uma oitava. E uma nota em 36,7 Hz levava quase toda a
energia para uma frequência que celular nem reproduz.

### O loop

A emenda dava um salto de 0,095, contra 0,037 da batida mais forte — clicava.
Resolvido com 12 ms de crossfade de potência constante mais wrap-around das
caudas (`add()` soma o que passaria do fim de volta no começo). Salto final:
**0,0004**.

Para regerar:

```bash
cd audio && python3 sintetiza.py     # precisa de numpy e scipy
```



Os sons de luta (golpe, queda, nocaute, sino) continuam **sintetizados na Web
Audio API** — nenhum arquivo, nenhuma
licença de sample, nenhum download. O jogo continua sendo um HTML só.

Duas coisas que parecem detalhe e não são:

O navegador **bloqueia áudio antes do primeiro clique**, então o `AudioContext`
só nasce quando o jogador interage. Criar antes falha silenciosamente e o som
nunca mais volta.

Toda chamada de áudio está sob `try/catch`. Navegador sem `AudioContext` ou com
`localStorage` bloqueado precisa jogar normalmente. O `testar.js` roda num
ambiente sem os dois de propósito — se o som derrubar a carreira, ele quebra.

O botão de mudo fica na barra fixa e a preferência é lembrada.

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
const AI_URL="https://draft-ufc.vercel.app/api/ai";
```

**Se você renomear o projeto na Vercel, essa linha quebra** — o domínio muda
junto. É o primeiro lugar a conferir se a IA parar de responder de repente.

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

**O teste de escolhas reimplementa a seleção de adversário.** O `testar.js escolhas`
copia a lógica de `candidatos()` em vez de chamar a função do jogo, e as duas
divergem na contagem de vitórias. Medindo contra o código real (a escada de
adversários no `index.html`), a ordem é a esperada: enfrentar fracos dá 18,4
vitórias e leva ao topo em 12% das carreiras; enfrentar fortes dá 14,4 vitórias
e leva ao topo em 97%. O teste mostra o inverso, então a cópia dele está errada.

Por isso a contagem de vitórias virou só relatório, sem aprovar nem reprovar —
um teste em que não se confia é pior que teste nenhum. A correção de verdade é
expor `candidatos()` e chamar a original.

## O que falta

**Não está no ar.** O deploy da Vercel que traz a chave publica o jogo junto.

**Ícones de amostra curta ficam de fora.** O filtro de 4 lutas e 25 minutos
derruba Ronda Rousey e parecidos. Precisa de lista de override manual.

**O meio da tabela não separa.** Fã e seguidores distinguem bem o topo (elite
chega a 1,5M contra 20 mil), mas carreiras medianas ficam parecidas. É a escada
de adversários se auto-compensando.
