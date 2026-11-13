# Cartas da árvore: coleção, raridade, arte e animação

Data: 2026-11-13. Branch de trabalho: `combate-v2` (o combate v2 do Online,
atrás da flag `combate_v2`). Docs do combate: `docs/combat-v2.md`;
decisões: `docs/combat-v2-decisions.md`.

## Objetivo

Avançar na árvore tem que dar a sensação de desbloquear e evoluir: cada nó
da árvore libera uma carta nova, com imagem própria, raridade e animação
própria no 3D. Hoje são 9 cartas em pé iguais na aparência (só o ícone da
categoria muda) e a árvore só melhora números.

Sucesso:

- Cada um dos 48 nós libera uma carta diferente; os níveis 2 e 3 do nó
  melhoram essa carta (estrelas).
- Toda carta tem imagem própria e um lance próprio no 3D.
- O equilíbrio continua medido: nenhum estilo, carta ou deck dominante
  (portões na seção "Equilíbrio").
- Quem já tem pontos na árvore recebe as cartas na hora, sem reset.

## Decisões aprovadas pelo dono (2026-11-13)

1. Cada nó libera uma carta (48 novas, 12 por estilo); níveis 2 e 3 do nó
   melhoram a carta.
2. Raridade pelo andar do ramo: nós 1 e 2 rara, nó 3 épica, nó 4
   lendária (por estilo: 6 raras, 3 épicas, 3 lendárias). As 9 cartas de
   hoje viram comuns.
3. Raridade é carta mais única, não só mais forte; toda carta passa pelos
   mesmos portões da simulação.
4. Cada carta tem casa (em pé, por cima ou por baixo); fora da casa joga
   como a básica da categoria ali (a regra de hoje, estendida).
5. Deck de 12, 4 fixas do estilo; comum e rara até 2 cópias, épica e
   lendária 1.
6. A carta é do nó: quem compra nó de outro estilo (a árvore deixa nos 2
   primeiros andares de cada ramo) ganha a carta, que é sempre rara.
7. As 4 cartas da Fase 4 (Combinação, Double leg, Rasteira, Esquiva)
   entram no catálogo; os efeitos v2 da árvore da Fase 4 (`ARVORE_V2`)
   deixam de existir.
8. Carta nova não entra sozinha no deck; a tela avisa que ela chegou.
9. Arte: render do nosso 3D, o lutador no quadro-chave do lance da carta,
   com fundo e luz pela raridade.
10. Animação: Mixamo para o que existir lá (baixado pelo Claude no Chrome
    do dono, em lotes, com a lista e o sim do dono antes de cada lote; o
    Claude nunca digita senha); o resto programado no diretor do 3D.
11. Bots com decks prontos por nível, com as cartas novas.

## Regras

### Casa e cartas básicas

- Toda carta tem `casa`: `pe`, `cima` ou `baixo`.
- Na casa, a carta joga como ela mesma. Fora da casa, joga como a carta
  básica da categoria dela no contexto da luta:
  - em pé: golpe vira Jab, queda vira Queda, defesa vira Bloqueio, pressão
    vira Pressão (clinch);
  - por cima e por baixo: as 8 cartas do chão de hoje (`CHAO`).
- A carta básica que ela vira é a que entra no motor, na tela ("do
  Mata-leão") e no 3D. A passiva do estilo e as estrelas valem só na casa.

### Nó, carta e estrelas

- Nível 1 do nó: a carta fica liberada (vai pra lista de cartas que o
  lutador pode pôr no deck), com 1 estrela.
- Nível 2: 2 estrelas. Carta com dano: +0,5 de dano. Carta sem dano: +0,5
  ponto de juiz quando ela funciona (anula, avança, levanta, inverte,
  finaliza).
- Nível 3: 3 estrelas. O efeito extra da coluna "Estrela 3" do catálogo.
- Reconfigurar a árvore tira a carta: o deck salvo com ela deixa de valer e
  a luta usa o deck padrão (regra de hoje, decisão 53).

### Deck

- 12 cartas, as 4 fixas do estilo, pelo menos 2 de defesa, pelo menos 1 de
  cada categoria (como hoje).
- Cópias: comum e rara até 2; épica e lendária até 1.
- A carta exclusiva de estilo (`estiloExclusivo`) deixa de existir como
  regra de deck: quem libera é o nó. Puxar guarda continua fixa e comum do
  grappler.
- O servidor valida (`validarDeck` com as liberadas da build).

## Catálogo

Números de partida (velocidade/dano/custo); a simulação decide os finais.
"Estrela 2" segue a regra geral acima; a tabela mostra a Estrela 3.
Animação: "temos" = clipe que já está no `mx_lutas.glb`; "Mixamo" = busca
no Mixamo (termo entre parênteses); "programado" = quadros-chave no
diretor, como a montada.

### Comuns (as de hoje)

Jab, Cruzado, Chute alto, Bloqueio, Contra-ataque, Queda, Antiqueda,
Pressão (clinch) e Puxar guarda (fixa do grappler), com os números de hoje.

### Striker

| Nó | Carta | Raridade | Casa | Categoria | V/D/C | Efeito | Estrela 3 | Animação |
|---|---|---|---|---|---|---|---|---|
| Precisão | Direto | Rara | Em pé | Golpe | 4/2/1 | O soco reto: entre o Jab e o Cruzado | Se interrompe, +1 de energia | Temos (Direto) |
| Combinações | Combinação | Rara | Em pé | Golpe | 4/2/2 | Se interrompe, +1 de dano | +0,5 ponto quando acerta | Temos (Jab_Direto) |
| Contra-ataque de mãos | Contragolpe | Épica | Em pé | Defesa | 3/2/2 | Contra golpe: anula e acerta | +1 de energia quando anula | Programado (Esquiva_Recua e Direto) |
| Eficiência de golpes | Overhand | Lendária | Em pé | Golpe | 2/4/3 | Nenhuma reação anula (passa pelo Bloqueio, pela Guarda e pela Esquiva) | +1 ponto quando acerta | Mixamo (overhand, haymaker) |
| Chutes baixos | Chute na perna | Rara | Em pé | Golpe | 4/1/1 | Se acerta, ele fica 1 mais lento na próxima troca | +0,5 ponto quando acerta | Temos (Chute_Baixo) |
| Chutes no corpo | Chute no corpo | Rara | Em pé | Golpe | 3/3/2 | Se acerta, tira 2 de energia dele | Tira 3 | Temos (Mma_Kick) |
| Controle de distância | Chute frontal | Épica | Em pé | Defesa | 4/1/1 | Contra pressão e queda: anula e acerta | Dá a iniciativa | Mixamo (front kick, push kick) |
| Variedade de ataques | Chute rodado | Lendária | Em pé | Golpe | 1/5/3 | Golpe de dano 3 ou menos não interrompe | +1 ponto quando acerta | Mixamo (spinning kick, hurricane kick) |
| Controle de ritmo | Passo lateral | Rara | Em pé | Defesa | 5/0/0 | Contra golpe de dano 3 ou mais: anula | +1 de energia quando anula | Temos (Lateral_Esq, Lateral_Dir) |
| Combinações sob pressão | Joelhada no clinch | Rara | Em pé | Pressão | 3/2/2 | Se ele jogou defesa, +1 de dano | Tira 1 de energia dele | Mixamo (knee strike) |
| Manutenção de iniciativa | Cotovelada | Épica | Em pé | Golpe | 3/3/2 | Se acerta, ele sangra: seus golpes dão +0,5 de dano até o fim do round | +0,5 ponto quando acerta | Mixamo (elbow strike) |
| Eficiência de energia ofensiva | Superman punch | Lendária | Em pé | Golpe | 5/3/3 | O golpe forte mais rápido; se ele jogou defesa, você leva 2 de dano | O Jab não interrompe | Programado (salto e Direto) |

### Wrestler

| Nó | Carta | Raridade | Casa | Categoria | V/D/C | Efeito | Estrela 3 | Animação |
|---|---|---|---|---|---|---|---|---|
| Entradas | Single leg | Rara | Em pé | Queda | 3/1/1 | Se acerta, chão com você por cima | O Jab não interrompe | Programado (sobre Double_Leg_Takedown) |
| Correntes de queda | Double leg | Rara | Em pé | Queda | 2/2/3 | Se acerta, chão por cima; o Jab não interrompe | Já cai na meia-guarda | Temos (Double_Leg_Takedown) |
| Timing | Queda no contragolpe | Épica | Em pé | Queda | 3/2/2 | Se ele jogou golpe, golpe de dano 3 ou menos não interrompe | +1 ponto quando acerta | Programado |
| Eficiência de tentativas | Suplex | Lendária | Em pé | Queda | 2/3/3 | Se acerta, chão por cima e ele fica grogue | Já cai na meia-guarda | Programado |
| Controle posicional | Peso do ombro | Rara | Por cima | Defesa | 4/0/0 | Contra pressão e queda (Levantar, Raspar): anula | +0,5 ponto quando anula | Programado |
| Manutenção de domínio | Cotovelada por cima | Rara | Por cima | Golpe | 4/2/1 | O golpe rápido de cima | Na montada, +1 de dano | Programado (sobre o ground and pound) |
| Transições | Passagem de joelho | Épica | Por cima | Pressão | 4/0/1 | Sobe 2 posições | Contra Raspar: anula | Programado |
| Pressão no solo | Martelada | Lendária | Por cima | Golpe | 3/3/3 | Na montada, se acerta e ele tem metade da vida ou menos: nocaute técnico | +0,5 de dano | Programado |
| Equilíbrio | Sprawl | Rara | Em pé | Defesa | 4/0/0 | Contra queda: anula e +1 ponto | +1 de energia quando anula | Mixamo (sprawl) ou programado |
| Recuperação de posição | Levantada técnica | Rara | Por baixo | Pressão | 5/0/1 | Levanta (mais rápida que o Levantar) | +0,5 ponto quando levanta | Temos (Getting_Up) |
| Defesa de entradas | Contra-queda | Épica | Em pé | Defesa | 4/0/1 | Contra queda: anula e vocês vão pro chão com você por cima | +1 ponto quando anula | Programado |
| Retorno à distância | Bodylock | Lendária | Em pé | Pressão | 3/0/2 | Se ele jogou golpe ou pressão: chão por cima, já na meia-guarda | +1 ponto quando derruba | Programado |

### Grappler

| Nó | Carta | Raridade | Casa | Categoria | V/D/C | Efeito | Estrela 3 | Animação |
|---|---|---|---|---|---|---|---|---|
| Eficiência de submissão | Kimura | Rara | Por cima | Queda | 3/0/2 | Finaliza (como a Finalização, 1 mais rápida) | Custa 1 a menos | Programado |
| Transições | Rasteira | Rara | Em pé | Queda | 3/0/1 | Se acerta quem atacou (golpe, pressão ou queda), chão por cima | +0,5 ponto quando derruba | Mixamo (leg sweep) ou programado |
| Oportunidades de ataque | Triângulo | Épica | Por baixo | Queda | 2/0/2 | Finaliza por baixo | 1 mais rápido | Programado |
| Especialização técnica | Mata-leão | Lendária | Em pé | Queda | 3/0/3 | Pega as costas: se ele está grogue, finaliza; senão, chão por cima, já na montada | Também finaliza quem está cansado | Temos (Strangling, Being_Strangled) e programado |
| Controle | Cem quilos | Rara | Por cima | Defesa | 4/0/0 | Contra golpe e pressão (golpes por baixo, Levantar): anula | +0,5 ponto quando anula | Programado |
| Passagens | Passagem de guarda | Rara | Por cima | Pressão | 3/0/1 | Sobe 2 posições | +0,5 ponto quando sobe | Programado |
| Retenção | Guarda fechada | Épica | Por baixo | Defesa | 4/0/0 | Contra golpe e pressão (ground and pound, Avançar): anula e +1 de energia | +0,5 ponto quando anula | Programado |
| Recuperação | Raspagem de gancho | Lendária | Por baixo | Queda | 4/0/2 | Inverte e você cai na montada | +1 ponto quando inverte | Programado |
| Defesa de finalização | Defesa de finalização | Rara | Por baixo | Defesa | 4/0/0 | Contra queda (a finalização dele): anula | E ele volta pra guarda | Programado |
| Saídas | Fuga de quadril | Rara | Por baixo | Pressão | 4/0/1 | Levanta | +0,5 ponto quando levanta | Programado |
| Sobrevivência posicional | Recomposição | Épica | Por baixo | Pressão | 4/0/1 | Ele volta pra guarda e você ganha a iniciativa | +1 de energia | Programado |
| Recuperação de guarda | Berimbolo | Lendária | Por baixo | Queda | 3/0/2 | Inverte e ele fica grogue | +1 ponto quando inverte | Programado |

### Counter

| Nó | Carta | Raridade | Casa | Categoria | V/D/C | Efeito | Estrela 3 | Animação |
|---|---|---|---|---|---|---|---|---|
| Identificação de padrões | Esquiva | Rara | Em pé | Defesa | 3/1/1 | Contra golpe: anula e acerta | +0,5 ponto quando anula | Temos (Esquiva_Recua) |
| Antecipação | Leitura de queda | Rara | Em pé | Defesa | 4/0/0 | Contra queda e pressão: anula e dá a iniciativa | +0,5 ponto quando anula | Programado (sobre Center_Block) |
| Resposta a ataques | Contra de esquerda | Épica | Em pé | Defesa | 4/2/2 | Se ele jogou golpe, dano em dobro | O Jab não interrompe | Temos (Cruzado_Frente) |
| Adaptação | Leitura total | Lendária | Em pé | Defesa | 3/0/2 | Contra qualquer carta: anula | +1 de energia quando anula | Programado (sobre Center_Block) |
| Evasão | Pêndulo | Rara | Em pé | Defesa | 5/0/0 | Contra golpe de dano 2 ou menos: anula | +0,5 ponto quando anula | Mixamo (dodge) |
| Bloqueio | Guarda alta | Rara | Em pé | Defesa | 4/0/0 | Contra golpe: anula e ele perde 1 de energia | +0,5 ponto quando anula | Temos (Defesa_Corpo) |
| Gestão de distância | Saída de lado | Épica | Em pé | Defesa | 4/0/1 | Contra pressão e queda: anula; a sua próxima carta é 1 mais rápida | +0,5 ponto quando anula | Temos (Lateral_Esq) |
| Recuperação defensiva | Segundo fôlego | Lendária | Em pé | Defesa | 3/0/0 | Tira o seu grogue, anula golpe e recupera 3 de energia | +1 ponto quando anula | Programado |
| Contra-ataques | Contra no corpo | Rara | Em pé | Defesa | 3/2/2 | Se ele jogou golpe, dano em dobro e ele perde 2 de energia | +0,5 ponto quando acerta | Temos (Cruzado_Corpo) |
| Timing | Cruzado de contra | Rara | Em pé | Golpe | 3/3/2 | Se ele jogou pressão ou queda, +1 de dano | +0,5 ponto quando acerta | Temos (Cruzado_Tras) |
| Eficiência | Uppercut | Épica | Em pé | Golpe | 3/3/2 | Se ele jogou queda ou pressão (entrando), dano em dobro | +0,5 ponto quando acerta | Temos (Upper_Tras) |
| Aproveitamento de oportunidades | Golpe de misericórdia | Lendária | Em pé | Golpe | 4/2/2 | Se ele está grogue ou com 3 de vida ou menos, acertar é nocaute | +0,5 de dano | Programado (sobre Big_Hit_To_Head) |

## Mecânicas novas no motor

Todas declarativas (`{quando, condicao, acao}`), sem sorte, com teste
unitário cada uma na suíte `combate2`:

1. `lentoProxima`: ele fica 1 mais lento na próxima troca (como o grogue,
   sem o dano a mais).
2. `rapidoProxima`: a sua próxima carta é 1 mais rápida.
3. `sangra`: seus golpes dão +0,5 de dano até o fim do round.
4. `inanulavel` (na carta): nenhuma reação anula esta carta.
5. Condição pelo dano base da carta dele: `danoMin`, `danoMax`.
6. Condição no `resistente` (a resistência vale só se ele jogou X).
7. Reação que muda a posição: `poeEmCima` (anula e vocês vão pro chão com
   você por cima).
8. Nível da posição na ação: `vaiProChao` e `inverte` com `nivel`
   (meia-guarda 1, montada 2); `avanca` com 2.
9. `grogue` sem knockdown.
10. Finalizar por baixo (`finalizaPorBaixo`) e finalizar em pé quem está
    grogue ou cansado (`finalizaSe`).
11. `nocauteSe`: acertar é nocaute se ele está grogue, com a vida até um
    número ou até uma fração.
12. `recua`: a posição volta pra guarda.
13. `tiraGrogue`.
14. `danoProprioSe`: você leva dano se ele jogou X.
15. A casa (`casa`) e a carta básica fora dela; cópias por raridade no
    `validarDeck`; nível de estrela no perfil (`perfilV2` passa a dar a
    lista de cartas com o nível de cada uma).

O log de resolução e o porquê da troca (`jxjPorQue2`) ganham texto pra
cada uma; o 3D ganha lance (seção "Animação").

## Tela

- Carta: imagem da carta (`arte`) e moldura pela raridade (`raridade`,
  classe `rar-<x>` que o `jxjCarta2` já aceita); estrelas com o ícone do
  sprite (nunca caractere). Cores da raridade com os tons do jogo; a épica
  não pode ser o vermelho do golpe.
- Carta nova: ao salvar a árvore com um nó novo, a tela mostra a carta
  chegando (vira, brilha pela raridade; parada com "reduzir movimento"),
  com "Ver no deck". Nível novo de nó mostra a carta ganhando a estrela.
- Aba Deck: selo "Nova" nas cartas liberadas que ainda não entraram em
  nenhum deck salvo; a aba mostra quantas são. Filtro por raridade e por
  casa quando a lista passar de uma tela.
- Árvore: o nó mostra a carta que libera (mini, com raridade e estrelas)
  no lugar da linha "Com cartas".
- Luta: a carta fora da casa mostra a básica que ela vira, com "do
  Mata-leão" (o mesmo da carta do chão hoje).

## Arte

- `ferramentas/arte-cartas.mjs`: abre o palco 3D local no Chrome com a
  placa de vídeo (como o `online-3d-e2e.mjs`), monta um lutador neutro (o
  boneco base, calção da cor da casa), toca o lance da carta até o
  quadro-chave definido no catálogo (`arte: {clipe, t, camera}`), aplica
  fundo e luz da raridade e salva `img/cartas/<id>.webp` (512 x 640, uns
  40 KB).
- Uma imagem por carta: 48 novas, 9 comuns e as 8 básicas do chão.
- As imagens vão pro git (são renders nossos). O `mx_lutas.glb` continua
  fora do GitHub.
- Teste: a suíte confere que toda carta do catálogo tem imagem e que o
  tamanho é o esperado.

## Animação

- Cada carta tem `lance` no catálogo: o clipe de quem ataca, a reação de
  quem recebe e, no chão, a postura. O diretor (`luta3d/diretor.js`) toca o
  lance pela carta efetiva da troca (`jxjLinhas3d2` manda a carta).
- Mixamo: lotes de 10 a 15 clipes. Antes de cada lote o Claude mostra a
  lista (nome no Mixamo, origem mixamo.com, tamanho aproximado) e espera o
  sim do dono; baixa no Chrome onde o dono já está logado; nunca digita
  senha. Os clipes entram num arquivo novo, `luta3d/mx_cartas.glb`, fora do
  git e carregado quando a luta começa (o `mx_lutas.glb` de hoje tem 43
  clipes em 2,6 MB; mais uns 40 somam uns 2,5 MB).
- Programado: finalizações, raspagens, passagens, ground and pound novos,
  single leg, suplex, bodylock e o que o Mixamo não tiver, com quadros-
  chave no diretor (como `MONTADA`), comparados por print.
- Testes: a suíte `luta3d` reprova carta sem lance e lance com clipe que
  não existe; `ferramentas/luta3d-estresse.mjs` com cada lance novo em 3x.

## Equilíbrio

Portões (simulação, `sim/`, 10.000 lutas por confronto na rodada final):

- Cada carta: quem joga vence de 40% a 60%.
- Cada nó (com a carta no deck): de 0,5 a 6,5 pontos.
- Nível 30: cada estilo de 45% a 55%, com deck padrão e com o melhor deck
  que a busca da simulação achar (subida de encosta: troca uma carta por
  vez enquanto melhora).
- Deck aleatório contra o campo: até 60%.
- Evolução: 30 contra 1 de 62% a 85% no espelho; 30 contra 20 acima de 50%.
- O nível 1 (deck padrão, sem árvore) continua igual ao aprovado na Fase 1.

Bots: decks prontos por faixa de nível, tirados da busca de deck da
simulação; a força medida (`FORCA_BOT2`) é refeita com eles.

## Servidor e banco

- Sem SQL novo: o deck já mora em `jxj_lutadores.deck`; a build é a mesma.
- `definicoes.combate2` manda o catálogo inteiro (raridade, casa, nó,
  estrelas, arte, efeito em texto).
- Como o combate v2 ainda não foi pro ar, não há luta antiga com as regras
  da Fase 4 pra manter.

## Entrega

Cada etapa sai com testes, dente provado e a bateria completa verde.

1. Catálogo e regras: as 48 cartas, a casa, as mecânicas novas, cópias por
   raridade, nó libera carta, estrelas, decks dos bots; balanceado na
   simulação, com o ícone de hoje no lugar da arte. Cerca de 1 dia.
2. Tela: carta chegando, selo "Nova", estrelas, molduras, a árvore com a
   carta. Meio dia.
3. Arte: a ferramenta e as imagens. Meio dia (depois dos lances, ou com os
   clipes que já temos e refeita no fim).
4. Animação: os lotes do Mixamo e os lances programados. De 1 a 2 dias.

As etapas 2, 3 e 4 andam em paralelo depois da 1. Depois, o grupo de teste
com a flag (Fase 7 do combate v2).

## Fora do escopo

- Pacotes, sorteio de carta, loja de carta ou carta paga.
- Carta de duas faces (em pé e no chão).
- Arte pintada ou gerada por IA.
- Mudar a carreira (o modo carreira não usa cartas).

## Riscos

- 48 cartas com regras próprias podem ser muita coisa pra aprender: a
  carta mostra o efeito em uma linha, e o porquê da troca explica.
- Mecânica nova que passa do ponto na simulação volta pra bancada antes de
  ir pra tela (os portões acima).
- O Mixamo pode não ter alguns golpes em pé (overhand, superman punch,
  joelhada no clinch): esses viram programados.
- Peso do 3D no celular: o arquivo novo de clipes carrega depois da tela
  abrir, e a luta cai no texto se ele faltar (regra de hoje).
