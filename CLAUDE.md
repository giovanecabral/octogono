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
LEIA-ME.md          Documentação detalhada.
docs/superpowers/   Spec e planos do revamp da interface.
```

## Revamp da interface em andamento (branch `revamp-ui`)

Spec: `docs/superpowers/specs/2026-09-26-revamp-ui-design.md`. Estado das
fases em `PENDENCIAS.md` item 37. **Fases 1 a 6 foram pro ar em
2026-09-27** (merge no `master` + deploy, a pedido do dono). Fases 7
(texto) e 8 (auditoria) continuam na branch `revamp-ui`; a regra vale
igual: **nunca `vercel --prod` a partir da branch** (o deploy sai dos
arquivos locais e publicaria trabalho pela metade). Merge no `master`
primeiro, deploy do `master`. Regras novas que valem daqui
pra frente:

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
- **Script de navegador (puppeteer) bloqueia `/api/ai`.** `AI_URL` é
  absoluta (`https://octogono.fun/api/ai`): carreira automática no Chrome
  local chama a IA de produção e gasta crédito do dono. `print.mjs` e os
  scripts de ponta a ponta já abortam essas requisições.
- **`api/placar.js` só existe em produção depois do deploy**, igual ao
  `api/ai.js`. Regra do placar em `api/_placar-regras.js` (o `_` não vira
  rota); a suíte `placar` compara as faixas com o `grade()` do jogo.

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
nenhuma passa despercebida. **~25 minutos**, não ~40s — a maioria das
suítes é rápida, mas `freqconquistas` (150 carreiras de ponta a ponta),
`frequencia` (30), `gapescolha` (3000 pares) e `drivermotor`/`motor`
(6000 lutas cada) são pesadas de verdade. Rodar em background
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
- **Treino permanente com teto.** `TETO_TREINO = 1.26`, ganho proporcional ao que
  falta. Sem teto, 22 camps de +10% viram +700%.
- **Três camadas de atributo:** `me.__base` (draft, nunca muda) × `st.treino`
  (permanente, com teto) × `st.eventoMod` (eventos). Evento escrevendo direto no
  atributo apagaria a base.
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
- **Commit não é push, e push não é deploy — os três são passos separados,
  nenhum substitui o outro.** `git commit` só grava local. `git push` sobe
  pro GitHub (`octogono`, repositório público de portfólio — ver
  PENDENCIAS.md/README.md). `vercel --prod --scope
  giovanecpiresg-4823s-projects` publica o jogo em produção a partir dos
  arquivos locais, sem tocar o git remoto nenhuma vez — os dois nunca
  estiveram conectados (confirmado direto no painel da Vercel). Rodar
  deploy não sobe commit nenhum pro GitHub, e dar push não publica nada em
  produção. **Todo `git commit` termina em `git push` no mesmo fôlego** —
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

**Contradição do "top 5" resolvida (revamp fase 5):** `passoCinturao()`
fala na mesma régua da posição que o Painel e a ficha mostram ("Chegar ao
#48 da divisão", o número que o limiar da faixa dá na tabela), em vez de
"top 5"/"ranking dos 15" ao lado de um #95 de 236. Limiares intocados; a
suíte `hub` reprova se o texto antigo voltar.

Falta ainda: cinturão interino quando o campeão se machuca · luta principal
em evento numerado · queda no ranking por inatividade.
