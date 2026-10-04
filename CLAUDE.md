# draft-ufc — instruções do projeto

Jogo de carreira de MMA em português brasileiro, no ar em
https://draft-ufc.vercel.app. Você monta um lutador draftando atributos de
lutadores reais e joga 22 lutas até a aposentadoria.

**Leia o `LEIA-ME.md` antes de sugerir qualquer coisa.** Ele é a documentação
real: motor, calibração, draft, progressão, rosto, IA, modo lenda, e o porquê de
cada decisão. Este arquivo é só o resumo do que não pode ser esquecido.

## Arquivos

```
index.html          O JOGO INTEIRO (~7000 linhas de JS). Fonte única de verdade do código.
estilo.css          Visual NOVO (revamp 2026-09-26, identidade "Noite de Luta").
legado.css          CSS antigo movido sem mudança; some quando a última tela antiga for trocada.
img/                icones.svg (sprite Lucide), fundos .webp, gerar.py (gera e trata os fundos).
audio/              27 MP3 (música e efeitos reais, CC0/CC BY), LICENCAS.md, preparar.py (baixa, corta, normaliza).
404.html            Página de erro estática (a Vercel serve sozinha).
fighters.json       1.527 lutadores reais com stats do ufcstats.
testar.js           A única ferramenta de teste. Lê o motor de dentro do HTML.
atualizar-dados.py  Regenera o fighters.json.
api/ai.js           Proxy do OpenRouter. Roda na Vercel.
api/jxj.js          JxJ (jogador contra jogador): rota única, servidor decide tudo.
api/_jxj-*.js       Motor, árvores, rating (Glicko-2) e regras do JxJ. Não usam nada da carreira.
supabase_jxj.sql    Migração só aditiva do JxJ (tabelas e funções jxj_*). Quem roda é o dono.
supabase_jxj_narracao.sql  Segunda migração (reserva e teto da narração). Roda depois da primeira.
supabase_jxj_raio.sql  Terceira (diferença de rating na fila). Roda depois das duas.
img/logo/           Logo (o rosto do octógono): gerar.py faz os SVG, rasterizar.mjs os PNG.
supabase_jxj_rollback.sql  Desfaz só o que é do JxJ.
ferramentas/        PGlite (Postgres local), servidor local, balanço e E2E do JxJ. Fora do deploy.
LEIA-ME.md          Documentação detalhada.
docs/superpowers/   Spec e planos do revamp da interface e do JxJ.
```

## Revamp da interface (2026-09-26 a 27): concluído e no ar

Spec: `docs/superpowers/specs/2026-09-26-revamp-ui-design.md`. As 8 fases
estão no ar desde 2026-09-27 (histórico em `PENDENCIAS.md` item 37). A
branch `revamp-ui` foi toda pro `master`. Trabalho novo sai de branch e
volta pro `master` antes do deploy: **nunca `vercel --prod` a partir de
branch** (o deploy sai dos arquivos locais e publicaria trabalho pela
metade). Regras do revamp que valem daqui pra frente:

- **Roteador por hash (`irPara`/`lerRota`)**: o Supabase devolve login com
  Google, confirmação de e-mail e recuperação de senha NO HASH
  (`#access_token=...`). `lerRota()` marca isso com `auth:true` e ninguém
  mexe na URL nesse caso, senão o token some antes do Supabase ler.
  `redirectTo` sempre com `urlRetornoAuth()` (endereço sem o hash da rota).
- **Ícone é SVG do sprite (`ICONE(nome)`), nunca emoji nem caractere
  unicode.** A suíte `rotas` reprova emoji em qualquer tela nova.
- **Jogar exige conta** (revertido de propósito em 2026-09-27; ver
  LEIA-ME "Contas"). Rota que exige conta passa por `comConta()`.
- **`meuPro` é cache e precisa estar fresco antes de qualquer tela com
  `bloqueioPro()`.** Conferido ao abrir com sessão, no login e em
  `comConta()`; tela do assistente que nasce travada chama
  `reconferirPro(redesenhar)`. Sem isso um Pro de verdade vê a trava e cai
  na tela de pagamento (achado em produção, 2026-09-27; suíte `rotas`).
- **Save = estado + estado dos 8 geradores.** A regra da semente vale
  dobrado: mudar a ordem de consumo quebra link de desafio E save já
  gravado. `node testar.js save` prova carreira interrompida = direta.
  Mudou o formato do save de um jeito que save antigo não abre: sobe
  `VERSAO_SAVE` (campo novo e opcional, como `seg`/`fa`/`narracao` no
  registro da fase 5, não precisa). Todo `PENDENTE` guarda o que JÁ foi
  sorteado (oferta, semente do dilema, gerador antes do trio da escolha):
  salvar em qualquer instante tem que dar a mesma carreira (suíte `hub`).
- **Carreira na tela tem token (`CARREIRA_TOKEN`).** Toda continuação
  assíncrona da carreira (IA, timer, narração) guarda o token de quando
  começou e desiste se ele mudou; `pararCarreira()` troca o token ao sair.
  Continuação nova sem essa conferência escreve numa carreira que não é
  mais a da tela. A carreira em andamento mora em `#/carreira`.
- **Noite de luta e hub: a lógica acha tudo por id**; a casca nova só
  decide ONDE cada id mora. Etapa da noite só muda depois que o estado do
  jogo mudou; Voltar nunca sorteia de novo (`ofertaAtual`).
- **JxJ: variantes de ação (2026-10-04).** Cada família tem 2 ou 3
  variantes por posição (`VARIANTES` em `api/_jxj-motor.js`); a mão do
  round sai da semente (`maoDoRound`, rodízio), então o banco não mudou e
  a luta continua refazível. O navegador manda só a família; o servidor
  manda só a mão de quem pediu. `VERSAO_MOTOR` 2. Variante nova ou ajuste:
  `node ferramentas/jxj-balanco.mjs variantes` e `node testar.js jxjmotor`
  (toda variante entre 44% e 56%). Nome de golpe na narração da IA passa
  por `golpesForaDosFatos` (só o que aconteceu). `VERSAO_BALANCEAMENTO`
  continua 1 enquanto nenhuma build existir em produção (subir dá respec
  grátis e mexe na fila; ela também vive em `jxj_config`).
- **Script de navegador (puppeteer) bloqueia `/api/ai`.** `AI_URL` é
  absoluta (`https://octogono.fun/api/ai`): carreira automática no Chrome
  local chama a IA de produção e gasta crédito do dono. `print.mjs` e os
  scripts de ponta a ponta já abortam essas requisições.
- **Texto sem travessão e sem frase de efeito** (fase 7; regras e amostras
  no LEIA-ME, "Regras de texto"). `node testar.js texto` reprova travessão,
  frase proibida e emoji ou seta em caractere em qualquer literal do
  `index.html` (inclusive dentro de `${}`) e travessão em `api/`. Texto da
  IA passa por `limparTextoIA()` em `tentarChamadaIA()`; resposta nova da
  IA fora desse caminho precisa passar pelo filtro também.
- **Pro não depende só do webhook da Asaas.** `api/confirmar-pagamento.js`
  confere direto na Asaas quando o jogador volta; os dois usam
  `api/_pro.js`, e um pagamento ativa uma vez só (cartão manda dois
  eventos). Mexeu em pagamento: `node testar.js pagamento`.
- **Painel de admin (`#/admin`, `api/admin.js`): a tela só mostra, o
  servidor decide.** Dono pelo e-mail em `ADMIN_DONO_EMAIL` (Vercel, nunca
  no código); admins na tabela `admins`. Toda ação nova do painel passa
  pela checagem de admin no servidor e grava em `admin_log`. Suíte `admin`.
- **`api/placar.js` só existe em produção depois do deploy**, igual ao
  `api/ai.js`. Regra do placar em `api/_placar-regras.js` (o `_` não vira
  rota); a suíte `placar` compara as faixas com o `grade()` do jogo.

## JxJ (2026-10-01): ligado em produção desde 2026-10-04; na tela se chama Online

Spec: `docs/superpowers/specs/2026-10-01-jxj-design.md`; números medidos e
passo a passo de ligar no LEIA-ME, seção "JxJ". O que não pode ser esquecido:

- **Isolado da carreira.** `api/_jxj-*.js` não lê o `index.html`, o `TUNING`
  nem os 8 geradores; a carreira não lê nada do JxJ. Mexer num nunca pode
  mudar o outro.
- **`JXJ_ATIVO` liga o modo.** Diferente de `"true"` na Vercel: toda ação
  responde 503 e a tela mostra "O JxJ abre em breve". Variável nova só vale
  em deploy novo: depois de mudar, Redeploy (sem mudar código).
- **O banco é do dono.** `supabase_jxj.sql` (e, depois dele,
  `supabase_jxj_narracao.sql`) só roda depois do backup e da
  aprovação explícita dele (regra de sempre: nenhuma migração sem
  aprovação). Validação local: PGlite (`npm install --prefix ferramentas`
  uma vez), nas suítes `jxj` e `jxjtelas`. Desfazer:
  `supabase_jxj_rollback.sql` (para sozinho se algo fora do JxJ depender
  das tabelas).
- **O navegador só escolhe.** Ação, ids e texto. Resultado, rating, XP,
  fichas, nível e Pro saem do servidor/banco; número mandado pelo cliente é
  ignorado (teste no `jxj`). A IA só narra o resultado pronto, com filtro.
- **Uma rota só** (`api/jxj.js` com `acao`): o plano Hobby aceita 12 funções.
- **Na tela o modo se chama Online** (2026-10-04); rotas, código e banco
  continuam `jxj`. Texto novo visível diz "Online"/"modo Online"; mensagem
  do banco com "JxJ" é traduzida no `rpc()`.
- **Diferença de rating na fila** (`supabase_jxj_raio.sql`): o servidor
  tem que funcionar sem a migração (código `PGRST202` = função não existe,
  cai na fila de antes). Função nova do banco que o servidor chama segue o
  mesmo padrão até o dono rodar a migração.
- **Mexeu no motor ou na árvore do JxJ:** `node testar.js jxjmotor` e
  `node testar.js jxjarvore` (faixas nos testes) e, pra ver os números,
  `node ferramentas/jxj-balanco.mjs matriz|niveis|nos|atributos`. Depois do
  lançamento, número de combate novo sobe `VERSAO_BALANCEAMENTO` (respec
  grátis e a fila só junta lutadores da mesma versão).
- **`NOS` é cópia rasa de `RAMOS`**: os arrays de efeito são os mesmos.
  Ferramenta que troca o array (em vez do valor) num lado e mede pelo outro
  mede o valor antigo (custou uma calibração inteira).

## Como testar — SEMPRE

```bash
node testar.js
```

Um comando, sem servidor e sem internet. Roda TODA suíte dispatchável
(mesma lista do `else if` no fim do arquivo) — corrigido em 2026-09-21
depois de achado jogando: a versão antiga de "tudo" só rodava
interface+motor+draft, e duas suítes (`conteudo`, `narracao`) reprovavam
em silêncio há tempo sem que "TUDO CERTO" nunca acusasse. Agora reprova
o resultado final se QUALQUER suíte reprovar — nenhuma fica de fora,
nenhuma passa despercebida. **~20 minutos** (18,5 medidos em 2026-10-02,
com as suítes do JxJ), não ~40s — a maioria das
suítes é rápida, mas `freqconquistas` (150 carreiras de ponta a ponta),
`frequencia` (30), `gapescolha` (3000 pares) e `drivermotor`/`motor`
(6000 lutas cada) são pesadas de verdade. As suítes do JxJ somam cerca
de 1,5 minuto (`jxjarvore` mede os 48 nós) e precisam do PGlite
(`npm install --prefix ferramentas`, uma vez). Rodar em background
(`run_in_background`/`&`) e aguardar a notificação, não ficar no
terminal esperando.

Pra iterar rápido numa suíte específica, chame ela sozinha:
`node testar.js <nome>` (ex.: `node testar.js conteudo`) — a lista
completa de nomes está no uso impresso por `node testar.js xyz`
(nome inválido) ou lendo o bloco de `else if (cmd === ...)` no fim de
`testar.js`. A interface aceita divisão e modo:
`node testar.js interface 6 lenda`.

**`node --check` não basta.** Ele só valida sintaxe: uma função que não existe
mais passa limpo e só quebra quando o jogador clica. Foi assim que a tela de
draft travou uma vez.

**Um segundo `<script>` no `<head>` sem `id` quebra `testar.js` inteiro.**
`lerScript()` acha o motor com `indexOf("<script>")` — string literal, sem
atributo. Se algum outro `<script>` (analytics, um widget, o que for) for
inserido ANTES do motor no HTML e escrito como `<script>` puro, ele vira o
primeiro match e `lerScript()` extrai a coisa errada — a interface inteira
reprova com "Unexpected token '<'", sem dizer o motivo. Já aconteceu (o
script do Vercel Analytics). Qualquer `<script>` novo no `<head>` — ou em
qualquer lugar antes do motor — precisa de um atributo (`id`, `defer` com
`src`, o que for) pra não casar com essa busca literal.

## Como trabalhar aqui

- **Verifique antes de afirmar.** Se disser "só o index.html mudou", confira.
- **Use `assert` em toda substituição de texto.** Patch que não casa e falha em
  silêncio já causou três bugs aqui, incluindo um em que o teste passou verde
  testando o arquivo antigo.
- **Rode `node testar.js` depois de cada mudança** e diga o resultado real.
- **Prove que o teste novo tem dente.** Quebre de propósito o que ele deveria
  pegar, mostre a reprovação, restaure.
- **Meça em vez de supor**, principalmente balanceamento. Se mexer no motor,
  rode `node testar.js pesos` e diga se os pesos mudaram.
- **Diga quando algo não deve ser feito** e por quê, em vez de fazer mal feito.
- **Em `testar.js`, nunca `n.className === "x"`.** Quebra assim que o
  elemento ganha uma segunda classe — já aconteceu duas vezes (o botão
  "Jogar" virou `inicio-item inicio-item-principal`; o botão "Montar o
  lutador" ganhou peso visual na Fase 5) e as duas vezes o teste falhou
  em silêncio até alguém notar. Use
  `(n.className||"").split(" ").includes("x")` (ou `classList.contains`
  num DOM de verdade) — confere o PAPEL do elemento, não a string exata
  da classe. Vale pra classe nova em elemento redesenhado E pra classe
  já existente que ainda não ganhou uma segunda: se o elemento é
  candidato a redesign (qualquer coisa em `.painel`, `.card`, `.camp`,
  `.btn`), escreva o teste token-based desde o início, não espere
  quebrar pela terceira vez.
- Português brasileiro, comentários no código em português.

## Decisões que NÃO devem ser revertidas

Cada uma foi tomada depois de medir. O `LEIA-ME.md` tem os números.

- **Calibração do motor.** KO 34 / Finalização 19 / Decisão 46, contra o UFC real
  (33/19/48), medido em 6.000 lutas. O `contestTemp: 0.55` achata cada disputa —
  sem ele Jon Jones vencia Cormier em 98% e o draft perdia o sentido.
- **Pesos do draft medidos, não inventados.** `WEIGHTS` vem de análise de
  sensibilidade. Mexeu no `TUNING`, os pesos ficam errados sem nenhum erro
  aparecer na tela.
- **Orçamento do draft é teto (2026-09-28).** A mesa só mostra carta que
  cabe (`cartasDaMesa`); sem nenhuma, oferece a carta mínima de custo 0.00
  de cada par (`cartaMinima`). `BUDGET_PCT` .70 (pedido do dono: o
  jogador ficava zerado quase sempre com .52), medido COM o teto e com a
  escada de adversários mais alta pra compensar. Mexeu em qualquer um
  dos dois: `node testar.js orcamento` e `node testar.js balanco`.
- **`[hidden]{display:none!important}` global no `estilo.css`.** Sem ela,
  classe com `display` (`.botao` é inline-flex) vence o `hidden` e o botão
  escondido pelo JS continua na tela (foi assim que "Voltar à escolha do
  adversário" aparecia depois da luta). O DOM falso não lê CSS: a suíte
  `hub` confere a regra no arquivo.
- **Tutorial "Como jogar": o número do print é o item da lista.** Prints
  em `img/tutorial/`, gerados por `img/tutorial/capturar.mjs`. Mudou a
  ordem ou a quantidade de itens em `TUTORIAIS`, ou a tela do print: rode
  o script de novo (a suíte `tutorial` confere os tamanhos).
- **Memória narrativa: fala do jogador é literal e ninguém inventa fala
  dele.** `st.memoria.falas` guarda o texto que ele escreveu; o trecho é
  recortado do texto dele (`trechoLiteral`), nunca o que a IA reescreveu;
  promessa é julgada pelo resultado real (`avaliarPromessa`). Todo texto
  de IA novo que possa falar do jogador passa por `falasAtribuidasOk`
  (suíte `falas`). A memória vem na MESMA chamada da reação: não criar
  chamada nova de IA pra isso.
- **Amostra grátis do Pro: a cota é do servidor e da conta.** Sem Pro, a
  coletiva e a entrevista da 1ª luta chamam a IA com `amostra:true`;
  `api/ai.js` só libera com login válido e `consumir_uso_ia` (tabela
  `uso_ia`, conta e limite num comando só, janela de 24 h,
  `LIMITE_AMOSTRA_IA`, padrão 6). Banco fora = recusa; IA falhou depois
  de contar = `devolver_uso_ia`. `AMOSTRA_NEGADA` no cliente é só
  interface. Nada da carreira entra na cota. Suítes `amostra` e `hub`.
- **Entrevista pós-luta com pauta (2026-10-01).** A pergunta parte dos
  fatos da luta (`fatosDaLuta`, só do log e do resultado; um placar, nunca
  "dividida") e de uma pauta escolhida por eles (`PAUTAS_ENTREVISTA`). O
  filtro `motivoPerguntaRuim` vale pra IA e pros moldes; molde novo passa
  na varredura da suíte `entrevista`. O prompt da entrevista tem voz e
  formato próprios; a coletiva continua com `VOZ`/`CENA_FORMATO` (a suíte
  confere a impressão digital do prompt da coletiva). Limpeza nova da
  pergunta da entrevista vai no bloco da entrevista em `avaliarCenaDaIA`,
  nunca em `limparPergunta` (a coletiva usa a mesma).
- **Narrativa das cenas (2026-10-01).** Na coletiva, a cena é uma dupla
  situação × forma de pergunta escolhida no cliente (`escolherCena`, sem os
  8 geradores; memória entre carreiras só reordena). O prompt não leva
  exemplo fixo (a IA copia). Passado só quando a cena foi escolhida pra
  olhar pro passado, com alternância; o filtro de similaridade
  (`cenaParecidaDemais`) e a anti-invenção (`falasAtribuidasOk`) ficam.
  Suíte `diversidade` tem limites; medir com a IA real só com
  autorização do dono (gasta crédito).
- **Coletiva e entrevista: a imprensa é fictícia e escolhida no cliente.**
  Card da direita é foto do lugar + repórter de `REPORTERES` (nunca o
  adversário, nunca jornalista real). A IA só escreve a cena
  (`coletivaCena`/`entrevistaCena`) com o nome pronto; tema, cartela e
  repórter saem de hash/gerador local, nunca de um dos 8 geradores.
- **Treino permanente com teto.** `TETO_TREINO = 1.05` (balanço de
  2026-09-28, junto com o orçamento .70), ganho proporcional ao que falta.
  Sem teto, 22 camps de +10% viram +700%.
- **Balanço pedido pelo dono em 2026-09-28: ~50% de vitórias pra quem joga
  bem, cinturão raro.** `BUDGET_PCT` .70 (ver o item acima), faixas de
  adversário +16% acima do ranking com piso de 45% da divisão (escada da
  v1; carreira nova usa a escada v2, item abaixo, medida com o plano por
  round em 11,7 a 12,8 vitórias e cinturão 6% a 16%), teto de treino 1.05, rótulo de dificuldade e zebra pela
  chance real (`chanceContra()`). Mexeu em draft, treino, escada ou
  motor: `node testar.js balanco` (50 carreiras por perfil, faixas no
  teste). Números no LEIA-ME "Balanço".
- **Regras da carreira v2 (2026-10-04, pedido do dono).** Carreira nova
  grava `st.regras: 2` e o link leva `&r=2`; save sem `st.regras` e link
  sem `r=` continuam na v1 (pool com aposentados, escada antiga), pela
  regra da semente. v2: modo normal só com quem lutou de `ANO_ATIVO`
  (2023) pra cá (lendas só no modo Lenda), ranking do UFC (campeão pelos
  títulos, #1 a #15 pela nota, jogador "Sem ranking" abaixo de standing
  .45 e do #15 ao #1 até .88) e escada `faixasV2` (fila única sem ranking
  e depois #15 ao #1, campeão só pelo caminho do título, sem ranking nunca
  passa do #13). Mexeu em pool, ranking ou escada: `node testar.js regras`
  e `node testar.js balanco`. Nunca mudar a v1 sem subir a versão.
- **Plano de luta a cada round (2026-10-04, pedido do dono).** O plano só
  mexe na luta por `aplicarPlano` (eixos de `mAttr`, só naquele round, em
  cima da base); sem plano a luta é a mesma bit a bit (`driverluta`).
  `K_ESCOLHA_LUTA` .70 e `PERFIL_PLANO` medidos juntos: mexeu em qualquer
  um, `node testar.js gapinterativa` (nocaute até 35% em toda política,
  melhor plano acima e pior abaixo de lutar sem plano) e `balanco`. A
  narração do plano é linha de tipo `plano` no log: leitor novo do log
  filtra pelo tipo, nunca pelo texto. Plano gravado com `v: 2`; entrada
  sem `v` é save antigo e aplica só o mod no eixo.
- **Preço do Pro: R$ 11,99 (2026-10-04).** `PRECO_PRO_MINIMO` continua
  9,9 de propósito: Pix de R$ 9,99 gerado antes da mudança e pago depois
  tem que ativar. Mexeu em preço: `node testar.js pagamento`.
- **Logo (2026-10-04).** O rosto do octógono: `img/logo/gerar.py` (SVG) e
  `img/logo/rasterizar.mjs` (PNG). Mudou o desenho, rode os dois. A suíte
  `rotas` confere que o que o `<head>` cita existe e não cai no
  `.vercelignore`. Suporte é o Discord (`URL_DISCORD`); o e-mail fica nos
  Termos e na Privacidade (LGPD).
- **Três camadas de atributo:** `me.__base` (draft, nunca muda) × `st.treino`
  (permanente, com teto) × `st.eventoMod` (eventos). Evento escrevendo direto no
  atributo apagaria a base.
- **Boneco v2 (personagens, 2026-09-28).** Config versionada (`v:2`); rosto
  antigo de save e ranking passa por `normalizarRosto()` na hora de
  desenhar, nunca é regravado. Peça nova entra na lista E no teste
  `personagem`. Proporção do SVG fixa (largura × 1,2).
- **Nada de rosto para os lutadores reais.** Só o lutador do jogador tem retrato.
  Os 1.527 são pessoas reais e semelhança facial é direito de imagem.
  Estatística de luta é fato público; retrato não. A função que derivava rosto
  deles foi **removida**, não deixada sem uso.
- **A IA nunca é dependência.** Se a API cair, o jogo cai em moldes locais.
  Nenhum número que a IA devolve é aceito sem trava (`lim()`).
- **A chave do OpenRouter mora só na Vercel.** Nunca no arquivo.
- **`api/ai.js` local não é o que está no ar.** É função serverless da Vercel
  — editar o arquivo local não muda nada em produção até alguém rodar o
  deploy. Medição contra a API real (`https://draft-ufc.vercel.app/api/ai`)
  só vale depois de confirmar que o deploy aconteceu — antes disso é medição
  da versão anterior, não da que você acabou de escrever (isso já invalidou
  uma sessão inteira de medição, ver LEIA-ME "Lesão"). **Deploy: comando
  exato `vercel --prod --scope giovanecpiresg-4823s-projects`** — sem o
  `--scope` dá "Not authorized", o projeto está sob um time. Commit antes de
  todo deploy. Deploy obrigatório sempre que `api/ai.js` mudar, antes de
  qualquer medição contra a API real.
- **O deploy sobe a PASTA, não o git: `.vercelignore` decide o que vira
  público.** Sem ele, os deploys até 2026-09-27 publicaram
  `PLANO-LANCAMENTO.md` e `ESTADO-ATUAL.md` (tirados do GitHub de
  propósito) em octogono.fun. Arquivo novo que não é do jogo (bruto,
  ferramenta, doc, privado) entra no `.vercelignore` antes do próximo
  deploy; depois do deploy, conferir com `curl -I` que ele dá 404.
- **Commit não é push, e `vercel --prod` não é push. Mas push na `master`
  é deploy.** `git commit` só grava local. `git push` sobe pro GitHub
  (`octogono`, repositório público de portfólio — ver
  PENDENCIAS.md/README.md). `vercel --prod --scope
  giovanecpiresg-4823s-projects` publica o jogo em produção a partir dos
  arquivos locais e não sobe commit nenhum pro GitHub. **O projeto da
  Vercel está ligado ao repositório** (conferido em 2026-10-01 na API de
  deployments, `source: git`, desde pelo menos 2026-09-28; o texto antigo
  daqui dizia que não): push na `master` gera sozinho um deploy de
  produção do commit, e push de branch gera um Preview. Por isso a
  `master` só recebe push com a bateria completa verde. O `vercel --prod`
  do fluxo continua depois do push: o último deploy é o que fica no ar, e
  o do CLI dá pra conferir arquivo por arquivo (`/v6/deployments/<id>/files`
  pelo `vercel api`, sha1 de cada arquivo contra o git). **Todo `git
  commit` termina em `git push` no mesmo fôlego** —
  9 commits (Fases 6 a 9 + o ajuste de tamanho do dilema) ficaram só
  locais numa sessão inteira porque o hábito de empurrar pro GitHub não
  sobreviveu ao `git filter-repo` que reescreveu o histórico (rewrite
  quebra o rastreamento de upstream da branch às vezes) — o site em
  produção seguia atualizado o tempo todo (deploy é independente), mas o
  portfólio público no GitHub ficou desatualizado sem ninguém perceber.
- **A semente controla tudo que é sorteado.** Qualquer mudança que altere o
  consumo de `rng` quebra os links de desafio já compartilhados. Rode
  `node testar.js desafio` depois de mexer em draft ou seleção de adversário.
- **Toque vs. mouse se distingue por capacidade, nunca por largura de
  tela.** `semHover()` (perto de `reduceMotion()`) usa
  `matchMedia("(hover:hover) and (pointer:fine)")` — não `'ontouchstart' in
  window` (falso positivo em híbrido) nem breakpoint de CSS (existe tablet
  com mouse, notebook com tela de toque). Um resultado, dois usos: o texto
  muda ("toque" vs "passe o mouse") e, onde o gesto de mouse depende de
  hover pra pré-visualizar de graça antes de comitar (cards do draft,
  `renderDraft()`), o MODELO de interação também muda — sem hover, o toque
  vira 2 passos (1º mostra, 2º confirma) em vez de comitar direto no
  primeiro toque. Vai reaparecer em qualquer tela nova que hoje usa
  `onmouseenter` como preview antes do `onclick` comitar.

## O que falta

**Feito**: campeão nomeado (`RANKING`/`buildRanking()`), reconquista, rotação
de contender (`st.desafianteIdx`, cada defesa enfrenta um nome diferente do
`RANKING.lista`) e bônus de performance da noite (`st.bonusNoite`, sem
número novo — reaproveita `hype`, recorde relativo tipo `st.peak`). Ver
LEIA-ME.md "O passo para o cinturão" e "Card de momento".

**Ranking do UFC (regras v2, 2026-10-04):** a posição agora é "Sem
ranking", "#15" a "#1" ou "Campeão" (`posicaoDivisao` v2, `rotuloPosicao`),
e `passoCinturao()` fala nessa régua ("Vencer até entrar no top 15 da
divisão"). Carreira na v1 (save ou link antigo) continua com "#48 de 236"
e os textos da fase 5; a suíte `hub` confere as duas.

Falta ainda: cinturão interino quando o campeão se machuca · luta principal
em evento numerado · queda no ranking por inatividade.
