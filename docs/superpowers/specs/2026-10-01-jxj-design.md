# JxJ do Octógono: especificação (2026-10-01)

Pedido do dono: sistema competitivo completo de Jogador contra Jogador
(lutador próprio, árvore de habilidades, combate simultâneo resolvido no
servidor, fila, rating, ranking, temporadas, torneios, cinturões, Hall da
Fama), com Free e Pro, sem tocar na carreira. Este documento fecha as regras
e a arquitetura. Valores marcados como "inicial" são ajustados por
simulação (suíte `jxjmotor`) e o valor final fica registrado na seção 11.

## 0. Escopo

Entra nesta versão: tudo da lista do pedido (seções 3 a 9). Fica de fora,
de propósito:
- bots: não existem; se um dia existirem, aparecem marcados como bot;
- Realtime do Supabase: a primeira versão usa consulta periódica (polling)
  com intervalo curto na luta e longo fora dela. O servidor continua sendo a
  única fonte da verdade, então trocar por Realtime depois não muda regra;
- cron: nada roda agendado. Prazo vencido, fila velha, chave de torneio e
  virada de temporada são processados na próxima chamada de qualquer
  jogador (o mesmo jeito que o vencimento do Pro já é conferido).

## 1. Auditoria (o que existe e o que não pode mudar)

Confirmado no código e na configuração real em 2026-10-01:
- **Conta:** Supabase Auth (e-mail e Google). O servidor confere a sessão
  com `GET /auth/v1/user` e o token do jogador (`usuarioDoToken`, em
  `api/ai.js`, `api/admin.js`, `api/placar.js`).
- **Pro:** tabela `assinaturas` (`pro`, `expira_em`), escrita só pelo
  servidor. Vencimento é conferido na leitura (`proAindaValido`,
  `verificarPro`). Pagamento pela Asaas (`api/criar-pagamento.js`,
  `api/webhook-asaas.js`, `api/confirmar-pagamento.js`, `api/_pro.js`).
- **Banco:** padrão do projeto = RLS em toda tabela; o que o jogador não
  pode escrever não tem policy; o servidor escreve com a chave de serviço
  (`SUPABASE_SERVICE_ROLE_KEY`, só no ambiente Production da Vercel);
  funções `security definer` com `revoke` de `public, anon, authenticated`
  e `grant` só pra `service_role`.
- **API:** funções serverless em `api/*.js` (ESM, `export default
  handler`). Arquivo com `_` no começo não vira rota. Hoje são 6 rotas; o
  plano Hobby da Vercel aceita 12, então o JxJ é UMA rota (`api/jxj.js`)
  com ações, no molde de `api/admin.js`.
- **Vercel:** ligada ao GitHub (push na `master` publica em produção, push
  de branch gera Preview). O Preview NÃO tem a chave de serviço do
  Supabase: o servidor do JxJ no Preview não tem banco até alguém
  configurar um banco de staging pra ele.
- **Cliente:** `index.html` é o jogo inteiro. Roteador por hash
  (`registrarRota`, `irPara`, `lerRota`), molde de tela (`montarTela`),
  abas (`montarGuias`), estado vazio (`vazio`), trava Pro (`bloqueioPro`),
  ícones do sprite (`ICONE`), retrato do boneco v2 (`bonecoSVG`,
  `ARQUETIPOS`, `normalizarRosto`). Visual "Noite de Luta" em
  `estilo.css`. Regras de texto: sem travessão, sem frase de efeito, texto
  concreto (suíte `texto`).
- **Não muda:** motor da carreira, os 8 geradores, saves, placar da
  carreira, coletiva e entrevista, amostra grátis, pagamento, admin,
  autenticação. O JxJ não importa nada do motor da carreira.

Ferramentas: não há Postgres, Docker nem CLI do Supabase na máquina. A
migração é validada localmente no PGlite (Postgres compilado pra
WebAssembly), instalado só em `ferramentas/` (fora do site e fora do
`node testar.js` padrão sem ele).

## 2. Arquitetura

```
api/jxj.js              rota única: confere sessão, Pro, limite, payload; chama o banco e o motor
api/_jxj-motor.js       motor de combate: puro, determinístico pela semente, sem dependência
api/_jxj-arvores.js     estilos, categorias, árvores, efeitos com teto e retorno decrescente
api/_jxj-rating.js      Glicko-2 (uma luta = um período), reset de temporada
api/_jxj-regras.js      XP, nível, fichas, conquistas, validação de nome e de build
supabase_jxj.sql        migração só aditiva (tabelas jxj_*, funções jxj_*)
supabase_jxj_rollback.sql  desfaz só o que é do JxJ
index.html              telas do JxJ (rota #/jxj/...), sem lógica de regra
estilo.css              seção "JxJ"
ferramentas/            PGlite e o teste do banco (fora do deploy)
```

Princípios:
- **O navegador só escolhe.** Manda a ação e os identificadores. Resultado,
  dano, energia, vencedor, rating, XP, fichas e progressão saem do servidor.
- **Regra de dado no banco, conta no motor.** Tudo que precisa ser atômico
  (criar lutador dentro do limite de slots, trocar principal com prazo,
  entrar na fila, formar par, gravar ação única, gravar rodada uma vez só,
  encerrar a luta e aplicar rating, inscrição em torneio, virada de
  temporada) é uma função `jxj_*` no Postgres, com trava de linha e
  conferência de versão. O cálculo do combate e do Glicko-2 é JS puro,
  testado em massa, e o resultado é gravado pela função do banco, que
  confere que a rodada ainda não foi gravada.
- **Sem acesso direto às tabelas.** Todas as tabelas `jxj_*` têm RLS ligada
  e nenhuma policy: o cliente não lê nem grava nada direto. Dado público
  (ranking, perfil, Hall) sai pela API, já filtrado.
- **Determinismo e auditoria.** Semente de 256 bits sorteada no servidor no
  começo da luta; o compromisso `sha256(semente)` aparece pros dois desde o
  início; a semente é revelada no resultado. Com a semente e as ações
  gravadas, qualquer um reproduz a luta com `api/_jxj-motor.js`.
- **Preguiçoso, sem cron.** Toda chamada que toca uma luta resolve as
  rodadas vencidas antes de responder. A virada de temporada e o avanço de
  torneio acontecem na primeira chamada depois do prazo, com trava de
  transação (`pg_advisory_xact_lock`).

## 3. Lutador

- **Identidade:** nome (2 a 24 caracteres, mesma lista de ofensa do placar,
  único entre lutadores ativos), retrato (boneco v2: busto, arquétipos e
  peças do jogo, nunca aleatório), categoria, estilo, nível, XP, pontos,
  build, rating próprio, cartel, histórico, conquistas, títulos, status
  (`ativo`, `inativo`, `aposentado`).
- **Estilos:** Striker, Wrestler, Grappler, Counterfighter. O estilo define
  o perfil inicial e a árvore principal, nunca vantagem absoluta. Os quatro
  perfis têm a mesma soma de atributos.
- **Atributos de combate** (0 a 100, 50 = mediano): golpe, poder, defesa,
  queda, defesa de queda, chão, defesa no chão, cardio, queixo. Não sobem
  com o nível; mudam só pela árvore, com teto.
- **Categorias:** as mesmas divisões do jogo (`peso-leve`, `meio-médio`...).
  A lista ativa fica em `jxj_config` (dado, não esquema), então liberar
  categoria nova não precisa de migração. Lançamento com quatro (inicial):
  Peso-leve, Meio-médio, Peso-médio, Peso-pesado. A categoria mexe pouco
  no perfil (pesado: mais poder e queixo, menos cardio). A fila só junta
  lutadores da mesma categoria.

## 4. Slots, Free e Pro

- **Free:** 1 slot. Primeira luta competitiva grátis (contada quando a luta
  começa de fato, depois da confirmação dos dois). Depois dela, entrar na
  fila e em torneio exige Pro. Ranking, perfis, Hall e o próprio lutador
  (árvore, histórico) ficam abertos.
- **Pro:** 3 slots, acesso completo. Cada lutador tem rating, cartel,
  histórico e progressão próprios.
- **Pro vencido:** nada é apagado. O slot 1 continua ativo; os extras
  ficam inativos (não entram na fila, no torneio nem no ranking) até o Pro
  voltar. Se o principal estava num extra, o principal efetivo vira o slot
  1 enquanto o Pro estiver vencido; o registro do principal não muda.
  Luta em andamento quando o Pro vence termina normalmente.
- **Principal:** só o principal efetivo de cada conta aparece no ranking
  global. Troca a cada 72 h no relógio do banco; a troca não leva rating,
  XP, cartel nem título. O primeiro lutador vira principal sem contar
  prazo.
- **Aposentadoria:** voluntária, com confirmação digitando o nome. O
  lutador fica com histórico e títulos, aparece no Hall se tiver título, e
  o slot fica livre. Não existe envelhecimento.
- **Uma luta por conta:** a conta tem no máximo uma entrada na fila ou uma
  luta aberta de cada vez (impede duas lutas simultâneas e par consigo
  mesmo).

## 5. Progressão, árvores e respec

- **Nível 1 a 30.** XP pra passar do nível n: `80 + 20n` (inicial; 11.020
  no total até o 30). XP por luta (inicial): vitória 120, derrota 70,
  empate 90, +30 por finalizar; W.O. dá 40 pra quem ficou e 0 pra quem
  saiu. Depois de 10 lutas no dia (por lutador), XP pela metade.
- **Pontos:** 3 no nível 1 e 1 por nível depois (32 no nível 30). Perder
  não tira nível nem ponto. Torneio e temporada nunca dão ponto.
- **Árvore:** cada estilo tem 3 ramos de 4 nós; cada nó tem até 3
  níveis. Nó do nível 2, 3 e 4 do ramo pede 2, 4 e 6 pontos já no ramo.
  Teto de 10 pontos por ramo. A árvore do próprio estilo custa 1 ponto por
  nível de nó; nós das outras árvores (só os dois primeiros de cada ramo)
  custam 2: build híbrida existe, mas especializar é mais eficiente.
- **Efeitos:** cada nó mexe num atributo ou numa mecânica do motor (chance
  de contra-ataque, combinação, encadear queda, transição...). Soma de
  bônus do mesmo atributo passa por retorno decrescente
  (`teto × (1 − e^(−soma/teto))`, teto inicial 18) e o atributo final
  nunca passa de 92. Mecânica tem teto próprio.
- **Respec:** custa 400 fichas (inicial), mostra o custo antes, não mexe em
  nível, XP nem histórico. Grátis uma vez a cada versão de balanceamento
  nova (`jxj_config.versao_balanceamento`).

## 6. Combate

- **Formato** (inicial; ajustado por simulação): 3 rounds de 4 trocas.
  Em cada troca os dois escolhem uma ação sem ver a do outro. Prazo de 20 s
  por troca (mais 3 s de tolerância de rede no servidor). A troca resolve
  quando as duas ações chegam ou quando o prazo vence.
- **Posição:** em pé, ou no chão com alguém por cima. Entre rounds todos
  voltam em pé.
- **Ações** (quatro famílias; o rótulo muda com a posição):

| família | em pé | por cima no chão | por baixo no chão |
|---|---|---|---|
| Striking | Trocar golpes | Ground and pound | Golpes por baixo |
| Quedas | Tentar a queda | Buscar a finalização | Raspar ou finalizar por baixo |
| Defesa | Defender | Segurar a posição | Fechar a guarda |
| Pressão | Pressionar na grade | Avançar a posição | Levantar |

- **Energia:** 0 a 10, começa em 10, +4 entre rounds. Cada ação tem custo
  (Defesa recupera). Com 2 ou menos, todas as disputas pioram; nenhuma
  ação fica proibida, só cara.
- **Interação:** cada par de ações tem regra própria. Em pé, um ciclo:
  Golpes ganha de Pressão, Pressão de Defesa, Defesa de Queda, Queda de
  Golpes; Golpes contra Defesa e Queda contra Pressão são parelhos.
  Golpes contra Defesa bate na guarda: acerta menos, dói 60%, tem metade
  do risco de nocaute, abre contra-ataque, e o golpe que não entra conta
  ponto pra quem defendeu (sem isso, no espelho striker, só trocar golpes
  vencia; medido pela suíte `jxjmotor`). No chão, o ciclo do de cima
  (ground and pound, finalização, segurar, avançar) contra o de baixo
  (golpes por baixo, raspar, fechar a guarda, levantar); a guarda fechada
  segura a finalização sem anular; os dois parados dão meio ponto de
  controle a quem está por cima e, na segunda seguida, o juiz levanta a
  luta. Disputa = probabilidade logística da diferença de atributos, com
  a semente da troca. Iniciativa (momento) acumula e pesa na próxima troca
  e na pontuação.
- **Resultados:** nocaute ou nocaute técnico (chance cresce com o dano
  acumulado e cai com o queixo), finalização (tentativa no chão contra a
  defesa no chão e o cansaço), decisão por pontos (10-9, 10-8, 10-10 por
  round), empate quando o total empata. W.O. por ausência.
- **Ausência:** prazo perdido vira Defender automático. Dois seguidos: a
  troca conta como do adversário na pontuação. Três seguidos: derrota por
  W.O. Os dois ausentes três vezes seguidas: luta anulada, sem rating e
  sem XP. A regra aparece antes de entrar na fila.
- **Desconexão:** a luta fica no banco. Quem volta vê o estado atual;
  ação já enviada vale; o que venceu enquanto estava fora já foi resolvido.
  Não existe reiniciar.
- **IA:** só narra o resultado já calculado, uma vez por luta, guardada e
  igual pros dois, com os fatos do motor e o filtro anti-invenção. Sem IA,
  narração local. A IA nunca escolhe vencedor nem mexe em número.

## 7. Fila, rating, ranking

- **Fila:** categoria igual, conta diferente, lutador ativo, acesso
  (Free com luta grátis ou Pro), mesma versão de balanceamento, sinal de
  vida nos últimos 12 s. Tolerância de rating = 100 + 25 a cada 10 s de
  espera, até 400 (inicial). Sem adversário: "a busca continua" e o botão
  de sair. Nunca um adversário falso.
- **Par encontrado:** confirmação dos dois em 20 s. Quem não confirma volta
  pra fora da fila (sem penalidade além de 60 s sem poder entrar); quem
  confirmou volta pra fila na frente. Depois da confirmação, sair é
  abandono (regra de ausência).
- **Anti-combinação:** o mesmo par vale rating no máximo 3 vezes em 24 h;
  depois disso a luta acontece, mas sem rating e sem fichas. A fila evita
  repetir o último adversário quando há outro compatível.
- **Rating:** Glicko-2 por lutador (1500, RD 350, volatilidade 0,06,
  τ = 0,5), uma luta por período. RD cresce com a inatividade (período de
  7 dias). Mostrado arredondado; "em classificação" até 5 lutas com
  rating.
- **Ranking global:** principal efetivo de cada conta, ativo, com 5 lutas
  ou mais com rating e luta nos últimos 30 dias. Ordem por rating. Filtro
  por categoria, busca por nome, paginação de 50, linha do próprio jogador
  destacada, variação dos últimos 7 dias, selo da temporada.
- **Perfil público:** nome, retrato, categoria, estilo, nível, rating,
  cartel, conquistas, títulos, temporadas, últimas lutas. Build pública só
  se o dono marcar. Nunca e-mail nem id de conta.

## 8. Temporadas, torneios, rivalidade, economia

- **Temporada:** 56 dias (configurável). Na virada: grava a classificação
  final por categoria, entrega recompensas (fichas por faixa, selo, título
  de campeão da temporada pro 1º de cada categoria), aplica o reset
  parcial `r' = 1500 + 0,5 (r − 1500)` e `RD' = min(RD + 80, 250)`
  (inicial, testado por simulação) e abre a próxima. Nível, XP, árvore,
  cartel, conquistas, títulos e Hall ficam.
- **Torneio:** sempre um aberto por categoria. 8 vagas: principal efetivo,
  ativo, Pro, 3 lutas com rating; uma inscrição por conta. Fecha nas 8 e
  sorteia a chave pelo rating (1x8, 4x5, 2x7, 3x6). Cada confronto tem
  janela de 24 h: quando os dois entram na sala, confirmam e lutam. Fim da
  janela: quem apareceu passa por W.O.; ninguém apareceu, passa o de
  rating maior. Lutas de torneio valem rating. Recompensa: XP por
  participação, fichas pela colocação, troféu e registro; o campeão leva o
  cinturão da categoria (título histórico permanente, sem defesa
  obrigatória). Nunca ponto de habilidade.
- **Rivalidade:** só fatos: confrontos diretos, sequência, último
  resultado, evolução dos dois. Revanche: depois da luta, os dois aceitam
  em 60 s e lutam de novo pelas regras normais (o limite de 3 lutas com
  rating por par em 24 h vale igual).
- **Fichas:** moeda interna, nunca vendida. Fontes (inicial): luta
  completa 10, vitória +10 (teto de 120 por dia por conta), torneio 30 a
  300 pela colocação, temporada por faixa, conquista (25 a 150, uma vez
  por lutador, fora do teto diário). Usos: respec e
  cosmético (molduras do retrato). Nada que aumente atributo.
- **Conquistas JxJ:** primeira vitória, primeiro nocaute, primeira
  finalização, 10 e 50 vitórias, campeão de torneio, top 10 da temporada,
  nível 30, revanche vencida, virada (vencer depois de perder dois rounds).

## 9. Banco, API e telas

- **Tabelas:** `jxj_config`, `jxj_contas`, `jxj_lutadores`, `jxj_fila`,
  `jxj_lutas`, `jxj_acoes`, `jxj_rating_hist`, `jxj_temporadas`,
  `jxj_classificacao`, `jxj_torneios`, `jxj_inscricoes`,
  `jxj_confrontos`, `jxj_titulos`, `jxj_conquistas`, `jxj_fichas`
  (livro-razão), `jxj_limites`, `jxj_log`. Chaves estrangeiras, índices,
  `check`, unicidade parcial (um principal por conta, uma luta aberta por
  lutador, uma inscrição por conta por torneio, uma ação por lutador por
  troca).
- **API** `POST /api/jxj {token, acao, ...}`. Sem token só leitura pública
  (`definicoes`, `ranking`, `perfil`, `hall`, `temporada`, `torneios`).
  Toda resposta leva `agora` (relógio do servidor); o cliente mostra
  contagem pelo `restaMs` e nunca decide prazo. Limite por conta e por
  ação no banco (`jxj_limites`). Payload validado campo a campo.
- **Telas** (rota `#/jxj/...`): entrada, painel, criação (nome e
  aparência, categoria, estilo, confirmação), lutador (perfil, árvore,
  histórico), fila, apresentação do confronto, luta, resultado, ranking,
  perfil público, temporada, torneios (lista e chave), histórico, gestão
  de slots, Hall da Fama. Estados de carregando, erro, vazio, sucesso e
  reconexão em todas. Mesmo design system (Noite de Luta), ícones do
  sprite, sem emoji, sem hover obrigatório, foco visível, contraste,
  `prefers-reduced-motion`.

## 10. Segurança, testes e publicação

- **Ataques cobertos por teste no servidor** (nunca só na tela): lutador de
  outra conta, rating/XP/fichas mandados pelo cliente, ação dupla ou
  trocada depois de enviada, requisição repetida, duas resoluções da mesma
  troca, prazo forjado, slot inativo, Free sem luta grátis, troca de
  principal antes de 72 h, duas lutas ao mesmo tempo, resultado forjado,
  acesso direto às tabelas (RLS sem policy), dado privado no perfil.
- **Suítes novas:** `jxjmotor` (determinismo, invariantes e simulação em
  massa: estilos, estratégias, níveis, métodos, empate, energia, repetição
  contra quem se adapta), `jxjarvore` (estrutura, regras, teto e o valor
  medido de cada nó), `jxjrating` (valores de referência do artigo do
  Glicko-2), `jxjtemporada` (temporada simulada com a fila e o reset),
  `jxj` (servidor contra um banco de verdade no PGlite, com duas contas
  lutando de ponta a ponta, os ataques acima e o rollback) e `jxjtelas`
  (as telas no DOM falso ligadas ao servidor de verdade). No navegador:
  `ferramentas/jxj-e2e.mjs`. A bateria inteira continua passando.
- **Publicação:** branch `jxj`, Preview só valida a interface até existir
  banco de staging. Produção depende de três passos do dono: backup,
  rodar `supabase_jxj.sql` (só aditivo) e conferir. O código vai pra
  `master` com o JxJ desligado (`JXJ_ATIVO` diferente de `true` na Vercel:
  a rota responde 503 e a entrada mostra "O JxJ abre em breve"); depois
  da migração, a variável liga o modo com um Redeploy (na Vercel,
  variável nova só vale em deploy novo; não precisa mudar código).
  Rollback: desligar a variável (com Redeploy) e, se preciso,
  `supabase_jxj_rollback.sql`.

## 11. Valores finais (preenchido depois das simulações)

Ver LEIA-ME, seção "JxJ", com a tabela de números medidos.
