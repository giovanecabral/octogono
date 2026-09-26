# Revamp da interface do Octógono — design

Data: 2026-09-26. Branch: `revamp-ui`. Aprovado seção por seção na
conversa de 2026-09-26 (7 seções, todas confirmadas).

## 1. Objetivo

Trocar a interface inteira do jogo por uma identidade própria no nível
de jogo de console: menu de cards com imagem, páginas completas, hub de
carreira em abas, transições, movimento, fotos de fundo, música e
efeitos gravados de verdade. Não é embelezar a base de texto atual: é
construir menu e hub novos.

Junto vêm três mudanças de sistema que o revamp exige:

- conta obrigatória para jogar (com confirmação de e-mail);
- save de carreira (3 slots por conta, nuvem + aparelho);
- placar global de jogadores (página Ranking).

O motor, a calibração, os pesos do draft, a semente e a mecânica de
cada tela **não mudam**. Muda a apresentação.

## 2. Decisões tomadas (com o porquê)

| Tema | Decisão |
|---|---|
| Caminho | Arquitetural, decomposto em 8 fases (seção 13) |
| Confirmação de e-mail | **Mantida.** Só joga depois de clicar no link |
| Telas antes preservadas (draft/octógono, narração, card de momento, celular da repercussão) | **Refeitas junto**, mantendo a mecânica |
| Ranking | **Só placar de jogadores** (carreiras encerradas de todas as contas) |
| Saves | **3 slots** por conta |
| Mockups | Descrição em texto na aprovação; a primeira entrega de cada fase é a tela real rodando no navegador. Nunca ASCII/emoji no produto |
| Direção de arte | **Noite de Luta** (transmissão de PPV) |
| Música | **Hip-hop/trap de walkout**, só licença livre com uso comercial |
| Código | **CSS sai para `estilo.css`, JS fica no `<script>` do `index.html`** (testar.js e semente intactos) |

Duas decisões antigas documentadas no `LEIA-ME.md` caem com este
revamp, de propósito, e o LEIA-ME será atualizado:

- "Jogar não exige conta, regra que não muda" (seção Contas). Agora
  exige. Consequência aceita: quem abre link de desafio também cria
  conta antes de jogar.
- Identidade "documento de comissão atlética" (mono, sem gradiente, sem
  canto, vermelho raro). Substituída pela identidade da seção 4.

Continuam valendo todas as "Decisões que NÃO devem ser revertidas" do
`CLAUDE.md` (calibração, pesos, teto de treino, três camadas de
atributo, **nenhum rosto para lutador real**, IA nunca é dependência,
chave só na Vercel, semente controla tudo que é sorteado, toque vs.
mouse por capacidade).

## 3. Arquitetura

```
index.html      shell + <script> único (motor + interface), como hoje
estilo.css      TODO o visual (sai do <style> do index.html)
img/            fundos duotone em WebP (desktop 1920px + celular 960px)
img/icones.svg  sprite de ícones SVG desenhados (<symbol>), sem emoji
audio/          música e efeitos em MP3 + LICENCAS.md
404.html        página de erro estática com a mesma identidade
api/placar.js   novo endpoint serverless (grava no placar)
```

- `estilo.css` entra com `<link>` no `<head>`. Nenhum `<script>` novo
  antes do motor sem atributo (regra do `lerScript()` do CLAUDE.md).
- **Roteador**: `irPara(rota, params)` + rotas no hash (`#/menu`,
  `#/nova`, `#/continuar`, `#/conta`, `#/atualizacoes`, `#/ranking`,
  `#/creditos`, `#/termos`, `#/privacidade`, `#/carreira/<aba>`).
  `popstate` faz o botão voltar do navegador funcionar. Rota
  desconhecida abre a tela 404 interna. Rota que exige conta sem sessão
  vai para a tela de conta guardando a intenção.
- Toda tela nasce de um molde comum: fundo (imagem da tela), cabeçalho
  com **Voltar** + título, conteúdo. Nenhuma tela secundária sem saída.
- `404.html` estático: a Vercel serve sozinha para caminho inexistente.

## 4. Identidade visual "Noite de Luta"

**Paleta (tokens em `:root`)**

- fundo `#07080B`; superfícies `#11131A` e `#1A1D26`; linhas brancas 8%
- vermelho sangue `#D7261E` = cor de ação (botão principal, seleção,
  VITÓRIA/DERROTA); versão escura `#7A0F0B`
- dourado `#D4A017` só para cinturão, lendário e Pro
- texto osso `#F2EEE6`; secundário `#8A8F9C`; ganho `#2FBF71`

**Tipografia (Google Fonts)**: Anton (títulos gigantes, nome, VITÓRIA,
número de ranking), Barlow Condensed (interface, rótulos em caixa alta,
números tabulares), Barlow (texto corrido). Sai IBM Plex Mono. O
cabeçalho "Ficha do Lutador / Comissão Atlética" sai.

**Forma**: card com dois cantos cortados em diagonal (`clip-path`),
assinatura visual do jogo. Sem `border-radius`.

**Textura**: granulação leve sobre a tela inteira, vinheta, luz de
refletor em gradiente radial.

**Ícones**: sprite SVG próprio (`img/icones.svg`). Nenhum emoji ou
caractere unicode fazendo papel de ícone em lugar nenhum da interface.

**Imagens**: ~20 fundos gerados via OpenRouter (modelo de imagem),
pós-processados por script local: duotone vermelho/preto, granulação,
WebP ~150 KB. Temas: arena vazia, túnel, vestiário, academia, sala de
coletiva, octógono sob luz, mãos com bandagem, cinturão, parede de
fotos, escritório de contrato. **Regras**: nenhum rosto reconhecível,
nenhuma pessoa real, nenhuma marca UFC; lutador só de costas, em
silhueta ou recortado. O script e os prompts ficam no repositório
(`img/gerar.py`, sem chave: a chave é lida de arquivo fora do repo).

**Movimento**

- troca de tela: corte diagonal vermelho varrendo em 350 ms;
- cards entram em cascata (60 ms entre um e outro);
- hover (só com `semHover()` falso): foto aproxima 4%, faixa de luz
  varre o card, borda acende;
- números contam até o valor final;
- fundo do menu com zoom lento;
- `prefers-reduced-motion`: tudo vira fade simples, sem zoom.

## 5. Menu principal e páginas

**Menu (`#/menu`)**: barra do topo com logo OCTÓGONO, conta (e-mail ou
"Entrar"), som e engrenagem (opções). Dois cards grandes lado a lado:
**Nova carreira** (foto do túnel, "Monte o lutador e jogue 22 lutas",
ação Começar) e **Continuar** (retrato, nome, divisão, cartel e luta
X de 22 do save mais recente). Abaixo, três cards: **Ranking** (prévia
top 3 + sua posição), **Atualizações** (prévia das 2 últimas),
**Conta** (e-mail, status Pro, saves). Rodapé: Termos, Privacidade,
Contato, Créditos. Continuar sem save fica esmaecido com "Nenhuma
carreira salva" e continua clicável; sem login mostra "Entre pra ver
suas carreiras". No celular tudo empilha: os dois cards grandes em
largura total, os três menores compactos com uma linha de prévia.

Histórico e Plano Pro, que eram itens do menu, passam a morar em Conta.
Opções viram a engrenagem.

**Nova carreira (`#/nova`)**: sem login, tela de conta com contexto
"Crie sua conta pra começar". Slots cheios: escolher qual carreira
apagar. Depois, assistente de 5 passos com barra de progresso e fundo
próprio por passo: Nome, Visual (criador), Divisão e modo (Lenda
travado sem Pro), Rival (travado sem Pro), Draft (octógono no estilo
novo, mecânica igual). Link de desafio passa pelo mesmo login e cai
nesse fluxo com a semente do desafio.

**Continuar (`#/continuar`)**: 3 cards de slot com retrato, nome,
divisão, selo de modo Lenda, cartel, luta X de 22, ícone de cinturão
se campeão, "jogado há N". Ações Continuar e Apagar (confirmação na
própria tela). Slot livre leva a Nova carreira. Linha de status do save
na nuvem.

**Conta (`#/conta`)**: sem login, formulários Entrar / Criar conta +
Google. Com login, abas Perfil (e-mail, trocar senha, sair), Plano Pro
(status, benefícios, assinar ou renovar; fluxo de pagamento atual
reaproveitado), Carreiras encerradas (histórico atual), Conquistas
(progresso geral).

**Atualizações (`#/atualizacoes`)**: linha do tempo; cada entrada com
data, título e 2 a 5 itens em português simples. Fonte: lista
`ATUALIZACOES` escrita à mão no código; primeiras entradas escritas a
partir do histórico real do git, sem jargão.

**Ranking (`#/ranking`)**: filtros divisão (Todas + 8) e modo (Carreira
| Lenda). Pódio com os 3 primeiros com retrato; lista com posição,
retrato, nome do lutador, divisão, cartel, cinturões, nota, pontuação;
sua melhor posição fixa embaixo. Só carreira encerrada entra.
Pontuação = `grade().score`.

**Créditos (`#/creditos`)**: obrigatória pelas licenças CC-BY; lista
cada faixa e efeito com autor, licença e link.

**Termos e Privacidade**: visual novo; texto inalterado (só a
pontuação, seção 11).

## 6. Conta obrigatória

- Menu, Ranking, Atualizações, Termos, Privacidade e Créditos abertos
  sem conta. Nova carreira, Continuar e link de desafio exigem conta.
- Criar conta mostra "Confirme seu e-mail" com o endereço, reenviar
  link (`auth.resend`), trocar e-mail, entrar com Google.
- A intenção (nova carreira ou semente de desafio) fica guardada no
  aparelho; o link de confirmação (`emailRedirectTo`) volta para
  `octogono.fun` e a intenção continua de onde parou.
- Conquistas e histórico de quem jogou sem conta sobem no primeiro
  login (sincronização existente).
- **Risco registrado**: Resend grátis = 100 e-mails/dia; dia de anúncio
  forte pode travar cadastro. Decisão do dono antes da campanha.

## 7. Save

**Conteúdo**: `me` (com `__base`), `picks`, `st`, `SEED`, `DIVISION`,
modo, `fightNo`, `rareUsed`, `fought`, estado dos 8 geradores
(`rng`, `holdRng`, `fraseRng`, `escolhaRng`, `lesaoRng`, `eventoRng`,
`dilemaRng`, `rivalRng`; o `rngL` da escolha na luta é derivado do
`rng` na hora e não precisa de estado próprio), `ROSTO`, rival, e um
registro novo `st.registro` com o resumo de cada luta (adversário,
resultado, método, round, tempo, dinheiro, seguidores) mais a narração
completa da última luta e textos de dilema/entrevista. `POOL`,
`LADDER`, `RANKING`, `PCT` são reconstruídos de divisão + modo.

**Geradores serializáveis**: `mulberry32` ganha leitura e restauração
do estado interno sem mudar a sequência gerada (provado por teste).

**Pontos de save automático**: fim do draft; resultado da luta
decidido (**antes** da narração animar); fim de dilema/evento/coletiva;
compra na loja; saída para o menu. Oferta de adversários e dilema
aberto são salvos com o conteúdo já sorteado/gerado: recarregar reabre
os mesmos, sem sortear de novo e sem nova chamada de IA.

**Onde**: `localStorage` na hora; nuvem logo depois (debounce 2 s,
nova tentativa se falhar). Indicador: "Salvando", "Salvo", "Sem
conexão, salvo neste aparelho". Conflito entre aparelhos: vale o
`atualizado_em` mais recente, com aviso. Campo `versao`; save
incompatível mostra aviso e nunca trava.

**Supabase**: tabela `saves` (`user_id`, `slot` 1–3, `versao`,
`dados jsonb`, `nome`, `divisao`, `modo`, `cartel`, `luta_n`,
`campeao`, `rosto jsonb`, `atualizado_em`), PK (`user_id`, `slot`),
RLS: cada usuário lê/grava/apaga só as próprias linhas. Carreira
encerrada libera o slot e vai para histórico e placar. SQL em
`supabase_schema.sql`, rodado pelo dono no painel.

## 8. Placar

Tabela `placar` (`user_id`, `seed`, `nome_lutador`, `divisao`, `modo`,
`pontuacao`, `cartel`, `nota`, `cinturoes`, `rosto jsonb`, `criado_em`),
PK (`user_id`, `seed`), leitura pública, **sem** policy de escrita para
usuário. Só `api/placar.js` (service_role) grava, depois de conferir:
sessão válida, pontuação dentro do máximo possível, cartel com no
máximo 22 lutas e coerente com vitórias/derrotas, nome aprovado por
filtro de nome ofensivo, uma entrada por carreira, limite de envios.

**Limite honesto**: o motor roda no navegador, então uma carreira
plausível forjada passa. Barrar de vez exige rerodar a carreira no
servidor; fora de escopo, registrado em `PENDENCIAS.md`.

## 9. Hub da carreira

**Barra fixa**: retrato pequeno, nome, cartel, dinheiro, seguidores,
indicador de save, botão Menu (salva e sai).

**Abas** (topo no desktop; no celular barra inferior com 4 ícones +
"Mais"), cada uma com fundo próprio:

1. **Painel** (arena): bloco "Próxima luta" com a ação principal e o
   automático; resultado da última luta; caminho até o cinturão com
   progresso; posição no ranking com seta; lesão ativa; 2 posts da
   repercussão.
2. **Lutador** (vestiário): retrato grande; atributos em formato tale
   of the tape (base / treino / evento); idade; lesões; Aposentar com
   confirmação.
3. **Cartel** (túnel): uma linha por luta com carimbo; abre narração,
   dilema e entrevista daquela luta.
4. **Mídia** (sala de imprensa): feed de repercussão; medidor de fã;
   gráfico de seguidores.
5. **Loja** (academia): produtos em card com imagem, efeito medido,
   preço, estado adquirido.
6. **Cards** (parede de fotos): galeria dos cards de momento.
7. **Conquistas** (troféus): grade travadas/desbloqueadas.

**Noite de luta** (sequência em tela cheia, volta ao Painel no fim):
Oferta de luta (adversários com faixa de dificuldade, "se vencer +N no
ranking", comparação) → Camp (foco em cards com ganho %) → Coletiva
(Pro) → Entrada (1,5 s, tale of the tape, pulável) → Luta (placar no
topo com nomes/round/relógio, narração no centro, golpes/quedas ao
lado, escolha na luta por cima, velocidade e automático aqui) →
Resultado (VITÓRIA/DERROTA gigante, método, dinheiro, seguidores e
ranking contando) → dilema/evento se houver → entrevista (Pro).

**Recursos Pro travados** (Rival, Lenda, Coletiva, Entrevista, cor do
card): componente único `bloqueioPro()`. O recurso aparece a 35% de
opacidade e não responde a clique; por cima, selo com cadeado e
**ASSINE O PRO**, único ponto clicável, leva à aba Plano Pro. Na
Coletiva, **Pular** fica fora do bloqueio.

**Voltar**: Loja, Cards e Conquistas viram abas (hoje são sobreposições
sem saída). Toda tela secundária tem Voltar. Na noite de luta, voltar
só existe antes da luta começar.

**Fim da carreira**: tela de aposentadoria nova (cartel, nota, legado,
card de compartilhar, envio automático ao placar).

**Card de momento** (canvas): refeito com a identidade nova; fontes
carregadas (`document.fonts.ready`) antes de desenhar. Continua sendo
`<div>` com `background-image` para "Copiar imagem" funcionar.

## 10. Som

- Só licença com uso comercial (plano pago): CC0 ou CC-BY; nenhuma NC.
  Fontes: HoliznaCC0 (FMA), ccMixter/FMA CC-BY, Kenney CC0, Freesound
  CC0. Prova de licença por arquivo em `audio/LICENCAS.md`; créditos na
  página Créditos.
- Trilhas em loop: menu (instrumental calmo), hub (boom-bap/lo-fi
  baixo), noite de luta (trap crescendo + faixa de walkout na
  Entrada), luta (torcida ambiente + batida grave baixa), vinhetas de
  vitória e derrota. Crossfade de 1 s entre telas.
- Efeitos: clique, hover (só mouse), troca de aba, carta entrando,
  caixa registradora, conquista, flashes; golpe leve/pesado, queda,
  knockdown, sino, torcida em quase-finalização, vaia.
- MP3; orçamento ~8 MB; música do menu carrega após o primeiro clique;
  resto sob demanda. Volume/mudo atuais continuam. Arquivo que falha
  cai no som sintetizado atual; `testar.js` segue rodando sem áudio.
- `audio/sintetiza.py` e os 4 arquivos gerados saem (ficam no git).

## 11. Texto

**Regras** (viram guia no LEIA-ME):

1. Zero travessão (— e –): ponto, vírgula, dois-pontos ou parênteses.
   Fala de personagem entre aspas.
2. Sem frase de efeito: "não é X, é Y"; fecho em aforismo; "sua
   jornada começa agora"; "de verdade" como reforço; trio de
   adjetivos; pergunta retórica chamando para ação; exclamação em
   série.
3. Texto concreto: número, nome, fato. Botão diz o que faz.

**Escopo**: toda a interface; moldes locais (narração, repercussão,
eventos, dilemas de reserva, legado, conquistas, loja, perguntas de
coletiva/entrevista); Termos e Privacidade só na pontuação (sem mudar
redação, sem mudar versão); prompts do `api/ai.js` + filtro no
navegador que troca travessão em todo texto vindo da IA. Mudou
`api/ai.js`: deploy antes de medir.

**Processo**: 10 textos antes/depois aprovados pelo dono antes de
aplicar ao resto.

## 12. Auditoria final (fase 8)

- `node testar.js` completo verde.
- Teste manual em desktop, 820 px e 380 px de todas as telas novas.
- Integrações: Supabase (auth, saves, placar, RLS com usuário comum),
  Asaas (ativação Pro de ponta a ponta), OpenRouter via `api/ai.js`,
  eventos de funil (`abriu`, `terminou_draft`, `terminou_luta_1`,
  `terminou_luta_5`, `terminou_22`) + novos (`criou_conta`,
  `confirmou_email`, `continuou_save`).
- Peso das imagens e do áudio; acessibilidade (foco visível, teclado
  nos cards, `aria-label` nos ícones).
- Dívidas antigas revisitadas: `html{overflow-x:hidden}` do `#controls`
  (some com o hub novo), teclado virtual cobrindo o Decidir do dilema.
- Achados fora de escopo vão para `PENDENCIAS.md`.

## 13. Fases de implementação (ordem do funil)

1. **Fundação**: `estilo.css`, tokens, fontes, ícones, componentes base
   (card cortado, botão, abas, cabeçalho com voltar, `bloqueioPro`,
   indicador de save), roteador + transições, pipeline de imagens,
   `404.html`.
2. **Menu e páginas**: menu, Atualizações, Ranking (dados de exemplo
   até a fase 3), Conta, Créditos, Termos/Privacidade.
   **Checkpoint: menu rodando no navegador aprovado pelo dono antes da
   fase 3.**
3. **Conta obrigatória + save + placar**: tabelas, `api/placar.js`,
   geradores serializáveis, suíte `save`.
4. **Nova carreira**: assistente de 5 passos + draft.
5. **Hub + noite de luta + fim de carreira**.
6. **Som**.
7. **Texto** (com as 10 amostras aprovadas antes).
8. **Auditoria**.

Cada fase: `node testar.js` completo, suíte da área, teste manual nas
3 larguras, commit + push na branch `revamp-ui`. **Nenhum `vercel
--prod` a partir da branch** até o merge em `master` (o deploy sai dos
arquivos locais e publicaria meio revamp).

## 14. Testes

- Novas suítes: `save` (meia carreira + salvar + restaurar + terminar =
  mesmas lutas de uma carreira direta), `texto` (varre texto visível
  por travessão e frases proibidas), `rotas` (toda rota abre, toda tela
  secundária tem Voltar, rota desconhecida cai na 404), `pro`
  ampliada (recurso travado não responde a clique, selo leva ao Plano
  Pro).
- Suítes de interface reescritas para o DOM novo, sempre com classe
  por token (`split(" ").includes`), nunca `className ===`.
- Suítes de interface ganham sessão falsa (jogar agora exige conta).
- Todo teste novo prova que tem dente: quebrar de propósito, mostrar
  reprovação, restaurar.
- `desafio` e `pesos` continuam verdes e com os mesmos números.

## 15. Riscos e fora de escopo

- Placar forjável com carreira plausível (seção 8).
- Resend grátis 100 e-mails/dia (seção 6).
- Imagem gerada pode ter cara de IA: o duotone + granulação unifica; o
  dono aprova as imagens no checkpoint da fase 2.
- Reescrita das suítes de interface é o maior custo escondido.
- Fora de escopo: cinturão interino por lesão do campeão, luta
  principal em evento numerado, queda no ranking por inatividade
  (continuam em "O que falta" do CLAUDE.md), verificação de carreira
  no servidor, exclusão de conta.

## 16. Documentação a atualizar ao longo das fases

`CLAUDE.md` (arquivos, regra de conta, estilo.css, rotas, saves),
`LEIA-ME.md` (Contas, Som, identidade, guia de texto, Save, Placar),
`PENDENCIAS.md` (achados e riscos), `supabase_schema.sql` (saves,
placar).
