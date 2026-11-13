# Combate v2 do Online

Status: Fases 1, 3 e 4 (motor, servidor atrás da flag, árvore), no branch
`combate-v2`. A tela ainda não usa; o jogo no ar segue com o motor v5
(`api/_jxj-motor.js`). Decisões: `docs/combat-v2-decisions.md`.

## Arquivos

- `api/_jxj-cartas.js`: as cartas (dados), as passivas, as cartas fixas
  e os decks padrão de cada estilo, e a validação do deck.
- `api/_jxj-combate2.js`: o motor (a troca, o round, a luta). Puro: não
  lê o motor de antes, a tela nem o banco.
- `sim/`: a simulação (fora do deploy).
- `testar.js`, suíte `combate2`: um teste por regra e por efeito.

## Regras

**Luta.** 3 rounds de 3 trocas. Cada troca: postura (8 s) e ação (12 s),
como hoje. Vida = 12 + (queixo − 50) × 0,2. Energia máxima = 10 +
(cardio − 50) / 10.

**Deck.** 12 cartas, no máximo 2 cópias de cada. 4 são fixas do estilo; as
outras 8 o jogador escolhe entre as liberadas. Pelo menos 2 cartas de
defesa e pelo menos 1 de cada categoria (golpe, queda, defesa, pressão).
O servidor valida (`validarDeck`). O adversário vê o deck antes da luta,
nunca a mão.

**Mão.** Todo round o deck é embaralhado pela semente da luta e o lutador
compra 5. Joga 3. As 2 que sobram viram 1 de energia cada no fim do round,
mais 2 de recuperação.

**No chão.** O deck só tem cartas em pé. Por cima ou por baixo, a carta da
mão joga como a carta do chão da mesma categoria.

**A troca, em ordem:**
1. Cada um joga uma carta da mão. Sem carta, ou carta que não está na
   mão: a primeira Defesa da mão.
2. Paga o custo. Se a categoria for outra que a da postura, é finta: mais
   1,5 de energia (0,75 com a iniciativa). Sem energia pra pagar: a carta
   sai exausta (2 mais lenta, metade do dano, sem efeitos).
3. Reações ("contra X") anulam a carta X dele em qualquer velocidade.
4. A mais rápida resolve primeiro. Se ela tem dano e acerta, interrompe a
   mais lenta, que paga o custo e perde o efeito (menos a "resistente").
   Se a posição mudou, a carta mais lenta que não serve mais falha.
5. Velocidade igual: as duas resolvem juntas. As duas mudando a posição
   se anulam.
6. Golpe em pé de dano 4 ou mais derruba e deixa grogue na troca seguinte
   (1 mais lento, +1 de dano recebido). Golpe de dano 3 ou mais em quem
   está grogue é nocaute; vida zero também; terceiro knockdown, nocaute
   técnico.

**Atributos (sem sorte).** Cada carta tem um duelo (o meu atributo contra o
dele). Diferença de 15 ou mais: +1 de velocidade (−15: −1). Dano × (1 +
diferença / 100). Carta de dano base 3 ou mais: × (1 + (poder − 50) / 200).

**Pontos dos juízes.** Dano 1 por ponto, queda 3, controle 1,5 (por cima,
com a carta resolvida), avançar 1, raspar 2, levantar 1, anular 1,
interromper 0,5, knockdown 4. Round 10-9; mais de 12 de diferença, 10-8;
igual, 10-10. Cartões iguais no fim: vence quem fez mais pontos.

**Finalização.** Da meia-guarda ou da montada (o grappler, da guarda) a
Finalização que resolve finaliza. Abaixo disso, encaixa: na troca
seguinte, quem encaixou aperta (Queda) ou emenda (Pressão), e quem está
preso defende (Defesa) ou sai na força (outra). Defender ganha de apertar,
emendar ganha de defender, sair na força ganha de emendar e perde pra
apertar. O gongo solta.

## Cartas

Em pé:

| Carta | Categoria | Vel | Dano | Custo | Efeito |
|---|---|---|---|---|---|
| Jab | Golpe | 5 | 1 | 1 | Se interrompe, +1 de energia |
| Cruzado | Golpe | 3 | 3 | 2 | |
| Chute alto | Golpe | 2 | 4 | 3 | Resistente: o golpe de dano 1 não interrompe |
| Bloqueio | Defesa | 4 | 0 | 0 | Contra golpe: anula e recupera 2 de energia |
| Contra-ataque | Defesa | 3 | 2 | 2 | Se ele jogou golpe, dano em dobro |
| Queda | Queda | 3 | 2 | 2 | Se acerta, chão com você por cima |
| Antiqueda | Defesa | 4 | 0 | 0 | Contra Queda: anula e dá a iniciativa |
| Pressão (clinch) | Pressão | 3 | 1 | 2 | Se ele jogou defesa, ele perde 2 de energia |
| Puxar guarda (só grappler) | Pressão | 4 | 0 | 1 | Se acerta, chão com você por baixo |

Por cima:

| Carta | Categoria | Vel | Dano | Custo | Efeito |
|---|---|---|---|---|---|
| Ground and pound | Golpe | 3 | 3 | 2 | Na montada, +1 de dano |
| Finalização | Queda | 2 | 0 | 2 | Finaliza (meia-guarda ou montada) ou encaixa |
| Segurar | Defesa | 4 | 0 | 0 | Contra Levantar: anula e recupera 1 de energia |
| Avançar | Pressão | 3 | 0 | 1 | Sobe a posição (guarda, meia-guarda, montada); contra Raspar: anula |

Por baixo:

| Carta | Categoria | Vel | Dano | Custo | Efeito |
|---|---|---|---|---|---|
| Golpes por baixo | Golpe | 4 | 1 | 1 | Se interrompe, +1 de energia |
| Raspar | Queda | 2 | 0 | 2 | Inverte: você fica por cima |
| Guarda | Defesa | 4 | 0 | 0 | Contra golpe: anula e recupera 1 de energia |
| Levantar | Pressão | 4 | 0 | 2 | Volta em pé |

## Estilos

| Estilo | Fixas | Passiva |
|---|---|---|
| Striker | Jab, 2 Cruzados, Chute alto | Mãos pesadas: golpes em pé com +0,25 de dano |
| Wrestler | 2 Quedas, Pressão (clinch), Antiqueda | Entrada barata: a Queda custa 1 a menos |
| Grappler | 2 Puxar guarda, Queda, Antiqueda | Jogo de chão: cartas no chão custam 1 a menos; finaliza da guarda |
| Counter | 2 Contra-ataques, Bloqueio, Antiqueda | Leitura: Bloqueio e Contra-ataque recuperam 1 de energia a mais |

Decks padrão em `DECK_PADRAO` (`api/_jxj-cartas.js`).

## Árvore (Fase 4)

Os nós são os mesmos da árvore de hoje (id, custo, tiers); o `build` é o
mesmo. No combate v2 cada nó vale pelo efeito de `ARVORE_V2`
(`api/_jxj-cartas.js`), e o atributo que ele dá fica no combate de antes:
o perfil da luta v2 (`perfilLuta2`) usa os atributos do estilo e da
categoria. Quem já tem pontos gastos recebe o efeito na hora.

Tipos de efeito: carta mais forte (dano, velocidade, custo), carta que
anula mais coisa (o Bloqueio que segura a Queda), pontos de juiz a mais
quando a carta acerta, anula ou interrompe, vida a mais e carta nova. Com
"por nível", o número multiplica pelo nível do nó. Energia e finta ficaram
de fora (decisão 49).

Cartas novas (só no deck do estilo, liberadas pelo nó):

| Carta | Estilo | Nó | Categoria | Vel | Dano | Custo | Efeito |
|---|---|---|---|---|---|---|---|
| Combinação | Striker | Combinações | Golpe | 4 | 2 | 2 | |
| Double leg | Wrestler | Correntes de queda | Queda | 2 | 2 | 3 | Se acerta, chão; o Jab não interrompe |
| Rasteira | Grappler | Transições | Queda | 3 | 0 | 1 | Se acerta quem atacou (golpe, pressão ou queda), chão |
| Esquiva | Counter | Identificação de padrões | Defesa | 3 | 1 | 1 | Contra golpe: anula |

O deck montado com carta que o lutador não tem mais (reconfigurou a
árvore) fica guardado, mas a luta usa o deck padrão (`deckMontado:
false` no estado).

Resultado (2026-11-13, `sim/relatorio.md`, 10.000 lutas por confronto;
o nível 1 saiu igual ao da Fase 1, número por número):

| Medida | Meta | Resultado |
|---|---|---|
| Cada nó no nível 3, sozinho (pontos de vitória) | 0,5 a 6,5 | 0,6 a 6,1 |
| Estilo no agregado, nível 30, deck padrão | 45% a 55% | 47,1% a 51,5% |
| O mesmo, com a carta nova no deck | 45% a 55% | 46,1% a 56,1% (grappler com a Rasteira) |
| 30 contra 1, mesmo estilo | 62% a 85% | 60,1% a 71,8% (grappler 60,1%) |
| 30 contra 20, mesmo estilo | acima de 50% | 53,8% a 55,2% |
| 30 contra os 4 estilos no nível 1 | (sem meta) | 68,5% a 70,5% |

Fora por pouco: o grappler com a Rasteira no nível 30 (56,1%, ganha do
striker e do counter, que têm 0 e 1 Antiqueda no deck padrão) e o grappler
30 contra 1 no espelho (60,1%: o nível 1 da build típica já tem o nó mais
forte do grappler, Eficiência de submissão; contra o campo, 70,5%).

## Servidor (Fase 3)

Atrás da flag `combate_v2` (`jxj_config`), com a migração
`supabase_jxj_combate2.sql` (o dono roda; entra desligada). Módulo
`api/_jxj-luta2.js`; rota `api/jxj.js`.

- `acao` na luta v2: `{lutaId, round, troca, carta}` (o id da carta da
  mão; carta fora da mão: 400 antes de gravar).
- `sinal`: `{familia}` = a categoria de uma carta da mão.
- `deck`: `{lutadorId, deck}` (12 ids; o servidor valida) ou `deck: null`
  (volta pro padrão).
- `estado`: `combateV2` (esta conta joga o combate novo) e, por lutador,
  `deck` e `deckMontado`.
- Vista da luta v2: `combate: 2`, `mao` (as minhas cartas com a carta do
  chão, velocidade e dano de agora, custo e finta), `maoDele` (só quantas),
  `decks` (os dois, públicos), `jogadas` (do round), `minhaCarta` e, em
  cada troca, `cartaA`/`cartaB`, `resolucao` (o log) e os textos.
- `definicoes.combate2`: cartas, chão, passivas, fixas, decks padrão,
  regras do deck e as liberadas de cada estilo.

Ligar pra um grupo pequeno, ligar pra todos e desligar: comandos no
começo da migração.

## Como rodar

```bash
node testar.js combate2                 # as regras, uma por uma
node sim/simular.mjs 10000              # relatório completo em sim/relatorio.md
SIM_PARTES=matriz node sim/simular.mjs 800       # só estilo contra estilo, rápido
SIM_AJUSTE='{"cartas":{"jab":{"vel":4}}}' sim/rodada.sh '<mesmo JSON>' 800   # experimento sem mexer no arquivo
```

`SIM_PARTES`: matriz, categorias, pesos, habilidade, decks, nivel30,
evolucao, nos (`SIM_ESTILOS=grappler` mede só a árvore desse). `SIM_AJUSTE`
mexe nos números só naquela rodada (`sim/ajuste.mjs`); o número que ficar
bom vai à mão pro arquivo da carta ou do motor.

## Resultado da simulação (2026-11-12, 10.000 lutas por confronto)

Relatório completo em `sim/relatorio.md`. Jogador atento contra atento,
decks padrão, nível 1.

| Medida | Meta | Resultado |
|---|---|---|
| Estilo no agregado | 45% a 55% | 48,4% a 51,9% |
| Confronto mais torto | (sem meta) | grappler contra striker, 58,2% |
| Carta em pé, luta vencida quando jogada | 40% a 60% | 44,5% a 51,3% |
| Carta do chão, relativa à posição | até 10 pontos | −5,5 a +9,1 |
| Deck aleatório contra o campo | até 60% | no máximo 56,1% |
| Peso contra peso | (hoje 49,7% a 51,7%) | 49,8% a 51,6% |
| Atento contra ao acaso | 70% ou mais | 71,9% a 74,6% |
| Lê metade das trocas contra atento | (hoje 71%) | 84,2% a 86,1% |
| Trocas por luta | 7,8 | 8,3 |
| Nocaute (KO + TKO) | 21,7% | 27,8% |
| Finalização | 7,5% | 2,0% |
| Decisão | 68,2% | 69,3% |
| Empate | (hoje 2,7%) | 0,9% |

Fora da referência: finalização baixa (o round tem 3 trocas e a luta volta
em pé a cada round; o encaixe quase sempre cai na última troca e o gongo
solta) e nocaute um pouco alto. As cartas do chão saem de 40% a 60% na
conta da spec porque quem joga carta de baixo já está por baixo; na conta
relativa à posição, ficam dentro.
