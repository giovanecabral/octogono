# Revamp, Fase 7 (texto): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo texto do jogo sem travessão e sem frase de efeito, concreto (número, nome, fato), com botão dizendo o que faz. Texto que vem da IA passa por um filtro no navegador que troca travessão, e os prompts ganham a mesma regra.

**Architecture:** Uma suíte nova (`texto`) varre todas as strings do `index.html` fora de comentário e reprova travessão e as frases proibidas; ela guia a reescrita e impede que voltem. `semTravessao(texto)` (função pura) roda em todo texto de IA antes de aparecer. Termos e Privacidade: só a pontuação muda, redação e versão ficam.

**Tech Stack:** o mesmo.

**Spec:** `docs/superpowers/specs/2026-09-26-revamp-ui-design.md`, seção 11 (Texto). Amostras aprovadas pelo dono em 2026-09-27 (as 10 do checkpoint da fase 6).

## Global Constraints

- Regras (viram guia no LEIA-ME): 1) zero travessão (— e –): ponto, vírgula, dois-pontos ou parênteses; fala de personagem entre aspas. 2) sem frase de efeito: "não é X, é Y"; fecho em aforismo; "sua jornada começa agora"; "de verdade" como reforço; trio de adjetivos; pergunta retórica chamando para ação; exclamação em série. 3) texto concreto: número, nome, fato; botão diz o que faz.
- Nenhuma mudança de mecânica, número ou gerador. Textos que os testes conferem continuam conferidos (a suíte que dependia do texto antigo muda junto, dizendo por quê).
- Termos e Privacidade: só pontuação; `VERSAO_TERMOS_PAGAMENTO` não muda.
- Mudou `api/ai.js`: a regra só vale em produção depois do deploy; o filtro no navegador cobre até lá.

---

### Task 1: Suíte `texto` (falha primeiro)

- [ ] Varre as strings do `index.html` (aspas, crases) fora de comentário: nenhum "—" ou "–"; nenhuma frase da lista ("de verdade", "começa agora", "sua jornada", "não é X, é Y", "!!", mais de uma exclamação na mesma string).
- [ ] Testa `semTravessao()`: fala com travessão no começo perde o travessão; travessão no meio vira vírgula; intervalo numérico vira hífen; texto sem travessão sai igual.
- [ ] Rodar: reprova (43 strings com travessão hoje).

### Task 2: Reescrita

- [ ] Todas as strings com travessão e as frases da lista, nas amostras aprovadas e no mesmo espírito: narração, escolha na luta, coletiva, entrevista, cards de momento, caminho do cinturão, legado, vitrine do Pro, loja, conta, anúncio de rival, lesão, percentis do draft, eras dos lutadores, marcadores vazios.
- [ ] Moldes sem travessão mas com frase de efeito: legados, notas, raros, frases de momento, descrições de loja e conquista, dilemas de reserva (leitura um por um).
- [ ] Os 2 emojis dos posts simulados saem.
- [ ] Rodar `texto` e as suítes que conferem texto (interface, coerencia, lesao, cinturao, pro, momentos, conquistas, aposentadoria, hub).

### Task 3: IA

- [ ] `semTravessao()` em todo texto que volta da IA (feed, evento, dilema, julgamento, coletiva, entrevista).
- [ ] Prompts do `api/ai.js` com a regra de texto (sem travessão, sem frase de efeito).

### Task 4: Fechamento

- [ ] Guia de texto no LEIA-ME; `node testar.js` completo; commit + push; checkpoint com o dono (deploy junto com a fase 8 ou antes, a critério dele).
