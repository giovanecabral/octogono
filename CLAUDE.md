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
`divisoes`, `pesos`, `cinturao`. A interface aceita divisão e modo:
`node testar.js interface 6 lenda`.

**`node --check` não basta.** Ele só valida sintaxe: uma função que não existe
mais passa limpo e só quebra quando o jogador clica. Foi assim que a tela de
draft travou uma vez.

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
  da versão anterior, não da que você acabou de escrever. **O deploy é do
  usuário, não do agente** — avise quando uma mudança em `api/ai.js` precisar
  de deploy pra ser testável, não rode `vercel --prod` sozinho.
- **A semente controla tudo que é sorteado.** Qualquer mudança que altere o
  consumo de `rng` quebra os links de desafio já compartilhados. Rode
  `node testar.js desafio` depois de mexer em draft ou seleção de adversário.

## O que falta

**Eventos de carreira do UFC.** Hoje o cinturão dispara sozinho: `standing` acima
de 0.88 com 3 vitórias e a próxima luta é de título. Não existe campeão nomeado,
convite nem espera.

O caminho real: entrar no ranking dos 15 → subir → top 5 → vencer um contender →
**receber** a disputa (que pode não vir, por lesão do campeão ou política) →
depois de campeão, defesa obrigatória contra o desafiante nº 1.

Fazer direito significa **nomear o campeão atual** e manter um ranking visível,
não só um `standing` invisível.

Há uma contradição em tela hoje, deixada de propósito para ser resolvida aqui: a
ficha mostra a posição na divisão (`#48 de 236`) e o `passoCinturao()` anuncia
"chegou ao top 5" exatamente nesse #48. As palavras são de ranking oficial
(campeão + 15) e o número é da divisão inteira do dataset. Ver a tabela no
`LEIA-ME.md`.

Outros eventos que merecem o mesmo tratamento: bônus de performance da noite ·
cinturão interino quando o campeão se machuca · luta principal em evento
numerado · queda no ranking por inatividade.
