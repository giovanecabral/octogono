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

## Árvore (cartas, 2026-11-16)

Cada nó da árvore libera uma carta (`CARTA_DO_NO` em `api/_jxj-cartas.js`), com raridade pelo andar do ramo, e as estrelas da carta são o nível do nó. O nó não dá mais efeito solto: o `ARVORE_V2` acabou (decisão 81). Quem não põe a carta no deck não ganha nada com o nó além do atributo.

Valor de cada nó = vitória com o nó no nível 3 e a carta no deck padrão (no lugar de uma carta não fixa da mesma categoria, `deckDoNo` em `sim/busca-deck.mjs`) menos a vitória sem ele, média contra os 4 estilos no nível 1 (`sim/relatorio-r4-nos.md`, 1.000 lutas por confronto, 4.000 por nó). Luta = lutas vencidas por quem jogou a carta pelo menos uma vez.

| Nó | Carta | Raridade | Casa | Vel | Dano | Custo | Nó em pontos | Luta |
|---|---|---|---|---|---|---|---|---|
| precisao_maos | Direto | rara | em pé | 4 | 1 | 2 | +5.8 | 55.6% |
| combinacoes | Combinação | rara | em pé | 4 | 1 | 3 | +6.9 | 57.7% |
| contra_maos | Contragolpe | épica | em pé | 3 | 1.5 | 2 | +3.6 | 53.7% |
| eficiencia_golpes | Overhand | lendária | em pé | 2 | 4 | 3 | +2.9 | 49.3% |
| chute_baixo | Chute na perna | rara | em pé | 4 | 0.5 | 2 | +6.0 | 56.0% |
| chute_corpo | Chute no corpo | rara | em pé | 3 | 3 | 2 | +5.7 | 54.0% |
| controle_distancia | Chute frontal | épica | em pé | 4 | 1 | 1 | +2.7 | 55.1% |
| variedade | Chute rodado | lendária | em pé | 1 | 5 | 3 | +5.7 | 55.3% |
| controle_ritmo | Passo lateral | rara | em pé | 5 | 0 | 0 | -3.9 | 40.7% |
| combinacoes_pressao | Joelhada no clinch | rara | em pé | 3 | 1 | 2 | +2.9 | 52.1% |
| iniciativa | Cotovelada | épica | em pé | 3 | 2.75 | 2 | +5.3 | 53.8% |
| eficiencia_ofensiva | Superman punch | lendária | em pé | 3 | 3 | 3 | +7.0 | 59.5% |
| entradas | Single leg | rara | em pé | 3 | 1 | 1 | +2.8 | 56.8% |
| correntes | Double leg | rara | em pé | 3 | 2 | 3 | +2.9 | 57.8% |
| timing_queda | Queda no contragolpe | épica | em pé | 3 | 1.5 | 2 | +3.9 | 58.8% |
| eficiencia_tentativas | Suplex | lendária | em pé | 3 | 3 | 2 | +2.3 | 57.5% |
| controle_posicional | Peso do ombro | rara | por cima | 4 | 0 | 0 | -0.3 | 73.3% |
| dominio | Cotovelada por cima | rara | por cima | 3 | 0.5 | 2 | +9.6 | 77.5% |
| transicoes_controle | Passagem de joelho | épica | por cima | 4 | 0 | 1 | +0.7 | 70.0% |
| pressao_solo | Martelada | lendária | por cima | 3 | 1.5 | 3 | +9.5 | 77.4% |
| equilibrio | Sprawl | rara | em pé | 4 | 0 | 0 | -2.1 | 45.1% |
| recuperacao_posicao | Levantada técnica | rara | por baixo | 5 | 0 | 0 | +0.1 | 29.4% |
| defesa_entradas | Contra-queda | épica | em pé | 4 | 0 | 0 | -1.7 | 44.3% |
| retorno_distancia | Bodylock | lendária | em pé | 3 | 0 | 1 | +4.0 | 48.0% |
| eficiencia_sub | Kimura | rara | por cima | 3 | 0 | 2 | +0.6 | 92.0% |
| transicoes_sub | Rasteira | rara | em pé | 3 | 1 | 0 | -3.5 | 44.6% |
| oportunidades | Triângulo | épica | por baixo | 1 | 0 | 3 | +3.4 | 67.8% |
| especializacao | Mata-leão | lendária | em pé | 4 | 0 | 3 | +4.8 | 60.0% |
| controle_chao | Cem quilos | rara | por cima | 4 | 0 | 0 | -0.8 | 79.5% |
| passagens | Passagem de guarda | rara | por cima | 4 | 0 | 1 | +0.6 | 77.1% |
| retencao | Guarda fechada | épica | por baixo | 4 | 0 | 0 | +0.6 | 52.9% |
| raspagem | Raspagem de gancho | lendária | por baixo | 3 | 0 | 2 | +0.7 | 61.4% |
| defesa_sub | Defesa de finalização | rara | por baixo | 5 | 0 | 0 | -0.9 | 25.1% |
| saidas | Fuga de quadril | rara | por baixo | 4 | 0 | 1 | +1.3 | 40.9% |
| sobrevivencia | Recomposição | épica | por baixo | 4 | 0 | 0 | -0.8 | 29.6% |
| recuperar_guarda | Berimbolo | lendária | por baixo | 3 | 0 | 2 | +0.9 | 63.0% |
| padroes | Esquiva | rara | em pé | 3 | 0.5 | 2 | +4.8 | 56.8% |
| antecipacao | Leitura de queda | rara | em pé | 5 | 0 | 0 | +4.0 | 53.1% |
| resposta | Contra de esquerda | épica | em pé | 3 | 1 | 3 | +4.3 | 57.5% |
| adaptacao | Leitura total | lendária | em pé | 2 | 0 | 3 | +2.9 | 50.9% |
| evasao | Pêndulo | rara | em pé | 5 | 0 | 0 | -0.5 | 39.9% |
| bloqueio | Guarda alta | rara | em pé | 4 | 0 | 0 | +0.5 | 44.8% |
| gestao_distancia | Saída de lado | épica | em pé | 4 | 0 | 0 | +6.4 | 57.6% |
| recuperacao_defensiva | Segundo fôlego | lendária | em pé | 3 | 0 | 0 | +2.5 | 49.2% |
| contra_ataques | Contra no corpo | rara | em pé | 3 | 1.5 | 2 | +4.7 | 58.5% |
| timing | Cruzado de contra | rara | em pé | 3 | 3 | 2 | +2.9 | 55.0% |
| eficiencia_counter | Uppercut | épica | em pé | 3 | 3 | 2 | +3.7 | 55.0% |
| aproveitamento | Golpe de misericórdia | lendária | em pé | 4 | 1 | 3 | +5.4 | 58.1% |

Calibragem em 3 tentativas e o que ficou fora dos portões: decisões 85 a 88 em `docs/combat-v2-decisions.md`.

### Resultado das simulações finais (2026-11-16)

- Estilo contra estilo, categorias, peso contra peso, habilidade e duração no nível 1 com deck padrão: iguais ao relatório aprovado (`git show 25716d8:sim/relatorio.md`, 10.000 lutas).
- Nível 30 com deck padrão: Striker 47,8%, Wrestler 51,3%, Grappler 52,3%, Counter 48,7% (dentro de 45% a 55%). O deck padrão não leva carta da árvore, então o nível 30 só pesa com o deck montado.
- Nível 30 com o melhor deck da busca (volta 2, rodada 4): Striker 42,1% fora da faixa, Wrestler 52,8%, Grappler 53,6%, Counter 51,5%; o melhor deck contra os decks padrão vence de 67,0% a 82,8%. Fora do portão (decisão 88).
- Evolução (30 com o melhor deck): 30 contra 1 de 61,3% a 91,6%; 30 contra 20 de 62,0% a 92,0%.
- Deck aleatório no nível 30: o melhor de 40 passa de 60% nos 4 estilos (61,9% a 72,3%). Fora do portão (decisão 88).

## Bots (Fase 5)

Com a flag valendo pra conta do jogador, a luta contra bot é do combate
novo (`api/_jxj-bot2.js`). O bot é o mesmo da tela (nome, estilo, build e
jeito pela semente), com o deck padrão do estilo. Ele joga cego: enxerga o
estado com a mão do jogador escondida (só quantas cartas), as trocas já
resolvidas e a semente; a carta do jogador na troca nunca entra. A postura
dele sai da semente. A habilidade (pelo rating do jogador, como antes)
decide quanto ele erra de propósito e quanto joga a leitura de equilíbrio
da troca (`api/_jxj-leitura2.js`, a mesma do jogador "atenta" da
simulação); o jeito (Provocador, Paciente, Observador, Inquieto) puxa as
cartas pra cada lado. Decisão em cerca de 1 ms.

Força (o rating com que o bot entra no Glicko), contra o jogador "atenta"
(1500), em `FORCA_BOT2` (2026-11-13, 10.000 lutas; tabela completa em
`sim/relatorio-bots.md`):

| Jeito | Habilidade 0 | Habilidade 0,5 | Habilidade 1 |
|---|---|---|---|
| Provocador | 1363 | 1416 | 1429 |
| Paciente | 1327 | 1421 | 1462 |
| Observador | 1381 | 1462 | 1500 |
| Inquieto | 1322 | 1394 | 1423 |

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

### Ligar, acompanhar e voltar atrás

Quem roda SQL e mexe na flag é o dono. A ordem:

1. Backup do banco. Rodar `supabase_jxj_combate2.sql` e a consulta de
   conferência do começo dele (esperado: `false, true, true, 3`). Com a flag
   em `false`, nada muda pra ninguém.
2. Deploy do código. Com a flag desligada, o caminho da v1 é o de hoje (a
   suíte jxj prova: luta v1, estado sem deck, bot na v1).
3. Ligar pra um grupo pequeno (`{"contas": [...]}`, só contas de teste ou
   de quem topou). A luta só é v2 quando as duas contas estão na lista.
4. Acompanhar nas primeiras lutas: os logs da função `api/jxj` na Vercel
   (resposta 500 na ação `acao` ou `luta`), W.O. e anuladas (prazo perdido
   demais indica tela travada) e a duração (a simulação dá 8,3 trocas por
   luta). Contar as lutas v2:
   `select status, count(*) from jxj_lutas where (estado->>'cv')::int = 2 group by status;`
5. Voltar atrás, do mais leve ao mais pesado:
   - Desligar a flag (`false`). A luta v2 em andamento termina na versão em
     que nasceu; a próxima nasce v1. É o que resolve quase tudo, porque o
     código da v1 não passa pelo da v2.
   - Se a luta v2 em andamento travar (o prazo perdido 3 vezes seguidas já
     termina a luta sozinho, em W.O. ou anulada): cancelar pelo banco,
     `update jxj_lutas set status = 'cancelada' where id = <id>;` e
     `update jxj_contas set luta_aberta_id = null where luta_aberta_id = <id>;`
     (não existe botão no admin pra isso).
   - Se o problema for no caminho da v1 (não deveria: a flag desligada é o
     código de antes): promover o deploy anterior na Vercel.
   - Desfazer o banco (só com nenhuma luta v2 em andamento; os comandos
     estão no começo da migração). Os decks montados somem junto com a
     coluna `deck`.

## Tela (Fase 6, a lógica)

Funções puras no `index.html` (a tela de hoje não mudou); suíte `jxjv2`.

- `jxjPorQue2(troca, eu, nomes, defs?)`: de 1 a 3 frases (prontas pro
  HTML) de por que a troca foi assim, do ponto de vista de `eu`.
- `jxjLinhas3d2(troca, eu)`: a troca v2 nos lances do diretor do 3D (o
  equivalente de `jxjLinhas3d`); a tabela `JXJ_3D2` tem uma entrada por
  tipo de evento.
- `jxjReferencia2(defs?, estilo?)`: `{pe, cima, baixo}`, cada um uma lista
  de `{id, nome, categoria, vel, dano, custo, efeito, exclusivo,
  desbloqueio}` da carta mais rápida pra mais lenta.

`troca` é um item das trocas da vista v2 (`trocaVista`); `defs` é
`definicoes.combate2` (padrão: `JXJ_DEF.combate2`).

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
