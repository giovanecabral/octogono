# draft-ufc — instruções do projeto

Jogo de carreira de MMA em português brasileiro, no ar em
https://draft-ufc.vercel.app. Você monta um lutador draftando atributos de
lutadores reais e joga 22 lutas até a aposentadoria.

**Leia o `LEIA-ME.md` antes de sugerir qualquer coisa.** Ele é a documentação
real: motor, calibração, draft, progressão, rosto, IA, modo lenda, e o porquê de
cada decisão. Este arquivo é só o resumo do que não pode ser esquecido.

## Arquivos

```
index.html          O JOGO INTEIRO (~2900 linhas). Fonte única de verdade.
fighters.json       1.527 lutadores reais com stats do ufcstats.
testar.js           A única ferramenta de teste. Lê o motor de dentro do HTML.
atualizar-dados.py  Regenera o fighters.json.
api/ai.js           Proxy do OpenRouter. Roda na Vercel.
LEIA-ME.md          Documentação detalhada.
```

## Como testar — SEMPRE

```bash
node testar.js
```

Um comando, ~40s, sem servidor e sem internet. Percorre a interface inteira
clicando nos botões de verdade em 3 divisões, mais uma passagem no modo lenda, e
depois confere motor, draft, escolhas e treino.

Partes: `interface`, `motor`, `draft`, `escolhas`, `treino`, `desafio`,
`divisoes`, `pesos`, `cinturao`, `lesao`, `conteudo`, `aivivo`, `momentos`,
`resultado`, `conquistas`. A interface aceita divisão e modo:
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

## O que falta

**Feito**: campeão nomeado (`RANKING`/`buildRanking()`), reconquista, rotação
de contender (`st.desafianteIdx`, cada defesa enfrenta um nome diferente do
`RANKING.lista`) e bônus de performance da noite (`st.bonusNoite`, sem
número novo — reaproveita `hype`, recorde relativo tipo `st.peak`). Ver
LEIA-ME.md "O passo para o cinturão" e "Card de momento".

**Contradição ainda de pé, deixada de propósito pra quando alguém for mexer
aqui de novo:** a ficha mostra a posição na divisão inteira (`#48 de 236`,
`posicaoDivisao()`) e o `passoCinturao()` anuncia "chegar ao top 5" nas
mesmas faixas de `standing` — "top 5" é linguagem de ranking oficial
(campeão + 15), o número é do dataset inteiro. As duas seções da ficha (a
nova "Ranking", que nomeia o campeão de verdade, e a antiga "Posição na
divisão") convivem sem se contradizer porque não citam número uma da
outra — mas o TEXTO de `passoCinturao()` ainda promete "top 5" num momento
em que a posição literal pode ser #48 de 236.

Falta ainda: cinturão interino quando o campeão se machuca · luta principal
em evento numerado · queda no ranking por inatividade.
