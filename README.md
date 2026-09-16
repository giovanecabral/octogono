# Octógono

Jogo de carreira de MMA no navegador. Você monta um lutador draftando
atributos de gente real, escolhe divisão e adversários, e joga 22 lutas
até a aposentadoria — com dilemas de texto livre, narração ao vivo e um
motor calibrado contra estatística real do UFC.

**Jogue em [octogono.fun](https://octogono.fun)**

## O que tem de interessante aqui, tecnicamente

- **Sem build, sem framework.** Um `index.html` só (~6 mil linhas),
  JS puro. Sem bundler, sem dependência de runtime.
- **Motor calibrado, não inventado.** A distribuição de nocaute/
  finalização/decisão foi medida contra 6.000 lutas simuladas até
  bater o UFC real (KO 33%, finalização 19%, decisão 48%) — não é
  número escolhido no olho.
- **1.527 lutadores reais**, com estatística pública do ufcstats
  (`fighters.json`, gerado por `atualizar-dados.py` a partir dos CSVs
  em `data/`).
- **IA com rédea curta, não decorativa.** Os dilemas da carreira são
  texto livre — a pessoa escreve o que o lutador faz, um modelo julga
  o desfecho. O prompt inteiro roda no servidor (`api/ai.js`, função
  serverless), o cliente nunca vê a chave, e nenhum número que a IA
  devolve entra no jogo sem passar por trava — se a API cair, o jogo
  cai em molde local, nunca trava a carreira de ninguém.
- **Testado de verdade.** `testar.js` é um DOM falso que clica nos
  botões reais da interface — não é smoke test, é a interface inteira
  percorrida em várias divisões e nos dois modos, mais simulação em
  massa pra conferir as taxas de vitória.

Todo o processo de decisão — o que foi medido, o que foi tentado e
descartado, os números por trás de cada calibração — está documentado
em [`LEIA-ME.md`](LEIA-ME.md) (a documentação real do projeto) e
[`PENDENCIAS.md`](PENDENCIAS.md) (histórico de bugs encontrados e
como foram diagnosticados).

## Rodar local

```bash
python3 -m http.server 8000
```

Abra `http://localhost:8000`. `fighters.json` já vem pronto no repo —
não precisa gerar nada pra jogar. Primeira tela demora alguns segundos
("Avaliando 1527 lutadores"): o jogo simula 18 lutas pra cada um pra
montar a escada de adversários.

Sem `OPENROUTER_API_KEY` configurada, os dilemas e eventos caem no
molde local (texto neutro pré-escrito) em vez de gerar via IA — o
resto do jogo funciona igual.

## Testar

```bash
node testar.js
```

Um comando, ~40s, sem servidor e sem internet. Percorre a interface
inteira clicando nos botões de verdade em várias divisões e no modo
"Seja uma lenda", confere o motor de luta contra estatística real,
depois testa draft, dilema, escolhas na luta, loja, divisões e mais.
`node testar.js interface 6 lenda` roda só uma parte.

## Regenerar os dados dos lutadores

```bash
python3 atualizar-dados.py
```

Lê `data/*.csv` (ufcstats) e regenera `fighters.json`.

## Stack

HTML/CSS/JS puro no cliente · função serverless na Vercel (`api/ai.js`)
como proxy da API de IA · Supabase pra conta/histórico (opcional — o
jogo funciona sem login) · Python só pra gerar dados, não roda em
produção.
