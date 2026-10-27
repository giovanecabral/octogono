# Online: estratégia por informação (mão à vista, sinais e blefe, iniciativa, ficha)

Data: 2026-10-27. Branch: `online-estrategia`. Status: design aprovado por
seções pelo dono; esta spec espera a revisão dele antes do plano.

## 1. Por que

Pedido do dono: a luta do Online tem que passar a sensação de estratégia,
combo e leitura, "e não só apertar em qualquer opção e torcer para dar
certo". A luta precisa ser um evento interessante, que faça o jogador
querer voltar.

O que faz a luta de hoje parecer sorte:

1. Cada troca é uma escolha às cegas entre 4 ações num ciclo fechado
   (Golpes vence Pressão, Pressão vence Defesa, Defesa vence Queda, Queda
   vence Golpes). Sem informação, a jogada ótima é sortear: o motor foi
   calibrado pra nenhuma ação dominar.
2. Uma troca quase nunca prepara a próxima (só o grogue e a finalização
   encaixada, em 35% e 19% das lutas).
3. A luta tem cerca de 9 trocas, e cada uma começa do zero: pouco
   material pra ler o adversário.
4. As opções são sempre os mesmos 4 botões; as variantes não têm efeito
   que se sinta (`docs/online-variantes-diagnostico.md`).

O objetivo é que a estratégia venha de informação: o que sobrou na mão do
adversário, o sinal que ele mostrou e o histórico dele (inclusive de
blefe).

## 2. Decisões do dono

| Tema | Decisão |
|---|---|
| Direção | Recursos à vista, sinais e blefe, iniciativa (sem plano de luta por enquanto) |
| Aprendizado | Fácil de entender, difícil de dominar |
| Tela | Só o necessário em cada etapa (sinal, escolha, revelação); energia e bônus discretos; dicas curtas na primeira luta |
| Ações | Manter as 4 famílias e o ciclo de hoje (não o triângulo de 3) |
| Chão | A mão vale em toda posição (a carta é da família) |
| Placar | Cartões dos juízes, como hoje; nocaute e finalização encerram antes |
| Tempo | Sinal 5 s, ação 12 s |
| Mão | 6 cartas por round: 2 Golpes, 1 Queda, 2 Defesas, 1 Pressão |
| Sem sinal no prazo | Mostra a postura da ação padrão |
| Finta | Aparece pros dois na revelação e entra no histórico dele |
| Iniciativa | Dá finta pela metade do custo na troca seguinte |
| Momento | Sai; a iniciativa substitui |
| Ficha | Cada estilo troca uma carta da mão; números saem da medição |

## 3. Como é hoje (o que não muda)

- Navegador chama `POST /api/jxj` (rota única) e consulta a luta a cada
  1,2 s. Não há WebSocket.
- O estado da luta mora no Postgres do Supabase (`jxj_lutas.estado`); a
  ação ainda escondida em `jxj_acoes`; o histórico em `jxj_trocas`.
- Só o servidor resolve a troca (`resolverTroca` em `api/_jxj-motor.js`).
  A vista nunca manda a ação aberta do adversário (só
  `adversarioEscolheu`). O bot escolhe sem ver a ação do jogador.
- Reconexão: recarregar volta pra luta (o estado está no banco).
- Semente com compromisso sha256: a luta é refeita pela semente.
- Formato: 3 rounds de 4 trocas, cartões 10-9.
- Ausência: prazo perdido vira Defesa; 2 seguidos dão a troca ao outro;
  3 dão W.O.

Requisitos técnicos do roteiro já atendidos: servidor autoritativo,
revelação simultânea, timer com ação padrão, reconexão. Esta spec mantém
todos e estende pros sinais.

## 4. Motor v4 e configuração

- `VERSAO_MOTOR` 4 só pras lutas criadas depois do deploy. O estado
  guarda `v`; `resolverTroca` aplica as regras novas quando `v >= 4` e as
  do v3 quando `v` é 3 (luta em andamento no deploy termina com as regras
  em que começou; lutas antigas continuam refazíveis pela semente).
- Número de combate novo: `VERSAO_BALANCEAMENTO` 3 no código e no banco
  (o dono roda o SQL antes do deploy; todo mundo ganha um respec grátis).
- As fases são feitas e mostradas ao dono uma por vez, cada uma
  funcionando e testada antes da próxima, mas vão pro ar juntas, num
  deploy só: uma versão de balanceamento e um respec, em vez de quatro.
  Se o dono quiser publicar uma fase antes, ela sobe a versão sozinha.
- Todos os números novos num arquivo: `api/_jxj-estrategia.js`, objeto
  `ESTRATEGIA`:
  - `mao`: a mão padrão por família (`{golpes: 2, queda: 1, defesa: 2, pressao: 1}`);
  - `maoPorEstilo`: as trocas de carta de cada estilo (fase 4);
  - `energiaPorCartaGuardada`: 0,5;
  - `custoFinta`: 1,5 (e por estilo, se a medição pedir);
  - `fatorFintaIniciativa`: 0,5;
  - `prazos`: `sinalMs` 5000, `acaoMs` 12000, tolerâncias;
  - `ordemPadrao`: `["defesa", "pressao", "golpes", "queda"]`;
  - `posturas`: nome de cada postura por família.
- Os números ficam no código com versão, não no banco: mudar um número no
  banco mudaria como as lutas antigas se refazem pela semente.

## 5. Fase 0: preparo

Sem mudança visível. Arquivo de configuração, motor v4 atrás da versão,
simulador (`ferramentas/jxj-balanco.mjs`) jogando com mão, sinal e
iniciativa (jogadores simulados: de estilo, ao acaso, contador de cartas,
quem confia no sinal, quem blefa no equilíbrio). Os números de antes
(motor v3) ficam registrados pra comparar.

## 6. Fase 1: a mão à vista

Regras:
- Cada round começa com a mão cheia (6 cartas). A mão não passa pro
  round seguinte.
- Usar uma ação gasta uma carta da família, em qualquer posição (Queda
  por cima, a finalização, gasta a mesma carta que a Queda em pé).
- As duas mãos (contagem por família) são públicas o tempo todo.
- O servidor recusa ação sem carta ("Você já usou essa ação neste
  round"), antes de gravar. O motor também recusa (defesa em dobro).
- Prazo estourado: a ação padrão é a primeira família com carta na
  `ordemPadrao` (Defesa, Pressão, Golpes, Queda). A contagem de ausência
  continua igual.
- No fim do round, cada carta guardada vira energia
  (`energiaPorCartaGuardada`), até o máximo de energia.
- Com 6 cartas e 4 trocas a mão nunca acaba dentro do round.

Banco: nenhuma migração (a mão mora em `jxj_lutas.estado`).

Servidor: a vista leva `maos: {a, b}` e, em cada ação disponível,
`restam`. A ação do bot só sai entre as famílias com carta.

Tela: a sua mão nos próprios botões (contador em cada um; botão sem carta
apagado); a mão dele numa linha discreta no placar. Primeira luta da
conta: dicas curtas ("Ele só tem Defesa e Pressão neste round").

## 7. Fase 2: sinais e blefe

A troca tem três etapas, cada uma com seu prazo:

1. **Sinal (5 s).** Cada um escolhe uma postura, uma por família:
   "Peso na frente" (Golpes), "Base baixa" (Queda), "Guarda alta"
   (Defesa), "Avançando" (Pressão). Só vale postura de família com carta.
   Sem escolha no prazo: a postura da ação padrão. Os dois sinais são
   revelados juntos, quando os dois mandaram ou o prazo venceu; antes
   disso a vista só diz se o adversário já sinalizou.
2. **Ação (12 s).** Com os dois sinais na tela, cada um escolhe. Ação
   igual ao próprio sinal: sem custo. Outra ação: finta, custa
   `custoFinta` de energia (metade com a iniciativa). Sem energia
   suficiente, o servidor recusa e o botão aparece apagado com o custo.
   A finta é cobrada na resolução.
3. **Revelação.** O lance mostra as duas ações e quem fintou ("Ele
   mostrou Guarda alta e fez Queda"). O histórico/tendência dele passa a
   contar as fintas ("fintou 2 de 6").

Ausência conta só na etapa da ação, como hoje.

Banco (migração `supabase_jxj_estrategia.sql`, a mesma da Fase 1, que já
sobe a versão de balanceamento; só aditiva, com aprovação do dono):
- tabela `jxj_sinais (luta_id, round, troca, lado, familia, criado_em)`,
  chave primária `(luta_id, round, troca, lado)`, RLS sem policy;
- `jxj_enviar_sinal(uid, lid, round_, troca_, familia_)`: confere
  participante, etapa e prazo, grava uma vez;
- passagem de etapa: função que grava a etapa da ação e o novo prazo com
  a mesma trava de versão de `jxj_gravar_troca` (dois pedidos juntos
  passam uma vez só);
- `jxj_luta` passa a devolver os sinais da troca aberta;
- a versão de balanceamento 3 em `jxj_config`;
- execução só pra `service_role`, como as outras.

Servidor: `processarLuta` passa da etapa do sinal pra da ação quando os
dois sinalizaram ou o prazo venceu (sinal padrão pra quem faltou), do
mesmo jeito que já resolve a troca. A vista leva `etapa`, `meuSinal`,
`adversarioSinalizou` e, só depois da revelação, `sinais: {a, b}`. Sem a
migração no banco, o servidor cai na Fase 1 (sem sinal), pelo código
`PGRST202`.

Bot: sinaliza às cegas e, na etapa da ação, vê o sinal do jogador (o
jogador vê o dele). Cada personalidade tem um ritmo de blefe: o
Provocador finta muito, o Paciente quase nunca, o Observador lê sinal e
histórico, o Inquieto roda as posturas.

Meta do custo da finta: o sinal acerta a ação de 60% a 75% das vezes no
equilíbrio medido.

## 8. Fase 3: iniciativa

- Quem leva mais pontos numa troca ganha a iniciativa pra troca seguinte.
- Ela fica com quem tem enquanto ele não perder uma troca; troca
  empatada não muda nada. Não acumula (é uma ficha só). Some no fim do
  round.
- Efeito: finta pela metade do custo (`fatorFintaIniciativa`).
- O momento sai do motor v4 (e da tela).
- Tela: uma ficha discreta "Iniciativa: você" ou "Iniciativa: ele".

## 9. Fase 4: a ficha muda a luta

Cada estilo troca uma carta da mão padrão (total 6), ponto de partida da
medição:

| Estilo | Mão |
|---|---|
| Striker | 3 Golpes, 1 Queda, 1 Defesa, 1 Pressão |
| Wrestler | 2 Golpes, 2 Quedas, 1 Defesa, 1 Pressão |
| Grappler | 1 Golpe, 2 Quedas, 2 Defesas, 1 Pressão |
| Counter | 2 Golpes, 1 Queda, 3 Defesas, 0 Pressão, bônus pequeno ao defender e acertar a leitura |

O custo da finta pode mudar por estilo se a medição pedir. Meta: matriz de
estilos de 45% a 57% no nível 1 e de 40% a 60% no nível 30.

Risco a medir: por baixo, Pressão é levantar. Quem gastou a Pressão do
round (e o counter, que não tem) só sai de baixo raspando (Queda) até o
round acabar. Isso é estratégia (guardar a Pressão), mas pode prender
demais; se a medição mostrar, a saída é uma carta de Pressão a mais por
baixo ou o counter manter 1 Pressão.

## 10. Medição (cada fase, contra o motor v3)

- Matriz de estilos (45% a 57%), nível 30 (40% a 60%), nível 30 contra 1.
- Nocaute, finalização, decisão e empate dentro das faixas de hoje.
- Valor da informação: o jogador que conta cartas e lê sinais contra o
  que joga no peso do estilo (tem que subir em relação ao v3).
- Trocas óbvias (o adversário só tem uma família na mão): no máximo 15%
  das trocas.
- Sinal honesto de 60% a 75% no equilíbrio (Fase 2).
- Bot forte contra o jogador de estilo perto de 46% a 50%; `FORCA_BOT` e
  `PESOS_VALOR` medidos de novo.
- Duração da luta até 5 minutos.

## 11. Testes e entrega (cada fase)

Automáticos: `jxjmotor` (mão, recusa de carta gasta, padrão no prazo,
energia por carta, finta, iniciativa, faixas novas), `jxjbot` (bot só com
carta, blefe por personalidade, calibração), `jxj` (servidor recusa carta
gasta e finta sem energia, sinal escondido até os dois, etapa passa uma
vez só, reconexão no meio da etapa, banco sem a migração), `jxjtelas`
(mão, etapas, dicas da primeira luta, nada de undefined), `texto`. Dente
provado em cópia da pasta. Bateria completa verde antes do `master`.

Manual, com duas janelas (`node ferramentas/jogar-online-local.mjs 2`):
estourar o prazo do sinal e da ação; fechar uma janela no meio do round e
voltar; tentar ação já gasta (botão e chamada direta); fintar sem energia;
fintar com iniciativa; fim do round com cartas guardadas; luta contra bot.

Entrega de cada fase: resumo, arquivos tocados, números antes e depois,
checklist. Deploy só quando o dono mandar; o SQL da Fase 2 roda antes do
deploy dela.

## 12. Fora do escopo

Combos complexos, plano de luta por round, escolha da mão antes da luta,
mudança nas variantes (seguem como hoje até o dono decidir a fase 6),
WebSocket.
