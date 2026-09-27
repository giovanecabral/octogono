# Revamp, Fase 6 (som): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o bordão sintetizado e os 4 arquivos gerados por música e efeitos reais com licença de uso comercial: trilha por tela com troca suave, walkout na entrada, torcida na luta, vinhetas de vitória e derrota, golpes, sino, torcida e interface. O sintetizado continua como rede quando um arquivo falha.

**Architecture:** Música por `<audio>` em streaming ligado ao barramento de música do Web Audio (`createMediaElementSource` + ganho próprio por faixa), porque decodificar faixas de minutos inteiras custaria dezenas de MB de memória no celular; troca de trilha com crossfade de 1 s. Efeitos curtos decodificados em buffer (carregados na primeira vez que tocam, ou em lote depois do primeiro clique). Uma função pura decide a trilha a partir do estado da tela (`contextoTrilha()`); `montarTela`, `montarTelaCarreira`, `mostrarNoite` e `esconderNoite` chamam `atualizarTrilha()`. Tudo passa pelos barramentos de sempre (`MUSICA`, `BUS`), então volume e mudo continuam iguais.

**Tech Stack:** Web Audio API, `<audio>`, ffmpeg (preparar os arquivos), Python com numpy (medir as faixas).

**Spec:** `docs/superpowers/specs/2026-09-26-revamp-ui-design.md`, seção 10 (Som).

## Global Constraints

- Só CC0 ou CC-BY (nenhuma NC, nenhuma ND). Prova de licença por arquivo em `audio/LICENCAS.md`; crédito na página Créditos para todo CC-BY (e, por cortesia, os CC0).
- MP3; orçamento total de `audio/` ~8 MB. Música do menu só depois do primeiro clique; o resto sob demanda.
- Volume de música, volume de efeitos e mudo continuam funcionando igual (painel da engrenagem).
- Arquivo que falha cai no som sintetizado atual; `testar.js` continua rodando sem `AudioContext` e sem `Audio`.
- Nenhum gerador da carreira (`rng` e os outros 7) é tocado por nada de som (sortear variação de golpe usa `Math.random`, som não é jogo).
- `audio/sintetiza.py` e os 4 arquivos gerados saem (continuam no histórico do git).
- Não consigo ouvir áudio: escolha por gênero declarado pelo autor, BPM e energia medidos; o dono aprova de ouvido no checkpoint.

---

### Task 1: Fontes e ferramenta

- [ ] `brew install ffmpeg`.
- [ ] Baixar candidatos em `audio/bruto/` (fora do git): faixas do HoliznaCC0 (CC0, FMA) de lo-fi, background, phonk e sad beats; "Free Crowd Cheering Sounds" (Gregor Quendel, CC-BY 4.0, OpenGameArt); Kenney Impact Sounds, Interface Sounds, UI Audio (CC0); sino e vaia CC0 (BigSoundBank ou equivalente).
- [ ] Guardar de cada arquivo: URL da página, autor, licença, data do download.

### Task 2: Seleção medida e preparo (`audio/preparar.py`)

- [ ] Script mede cada candidato (duração, loudness integrado, BPM estimado por autocorrelação de onsets, brilho espectral) e imprime a tabela.
- [ ] Escolha: menu (instrumental calmo), hub (boom-bap/lo-fi baixo), noite (trap/phonk crescendo), walkout (trecho de maior energia de um phonk, ~45 s), luta (batida grave baixa + loop de torcida), vinhetas de vitória e derrota (4 a 8 s).
- [ ] Script corta, faz fade, normaliza (música -18 LUFS, efeitos por pico), codifica MP3 (música 96 kbps) em `audio/` e confere o orçamento.

### Task 3: Motor de trilhas com crossfade (TDD, suíte `som`)

**Interfaces:** `contextoTrilha(estado) -> "menu"|"hub"|"noite"|"walkout"|"luta"`; `atualizarTrilha()`; `trocarTrilha(nome)`; `SOM.vinheta(ganhou)`.

- [ ] Teste: cada tela escolhe a trilha certa (menu, páginas, hub, cada etapa da noite, fim de carreira); sem `AudioContext`/`Audio` nada quebra; mudo não carrega nada.
- [ ] Implementar e ligar nos pontos de troca de tela.

### Task 4: Efeitos reais

- [ ] Golpe leve e pesado (variações), queda, knockdown, sino, torcida em quase-finalização e no nocaute, vaia na derrota por nocaute ou finalização, clique, hover (só mouse), troca de aba, carta entrando, caixa registradora na compra, conquista.
- [ ] Narração escolhe o efeito pelo tipo da linha E pelo texto (queda = derrubada; knockdown; golpe forte; tentativa de finalização).
- [ ] Teste: arquivo que falha cai no sintetizado; o mapeamento de linha pra efeito cobre os tipos do motor.

### Task 5: Licenças, créditos e limpeza

- [ ] `audio/LICENCAS.md` com uma linha por arquivo final (arquivo, origem, autor, licença, link).
- [ ] `CREDITOS` com todos os autores; suíte `som` confere que todo arquivo em `audio/` está no LICENCAS e nos créditos, e que o total cabe no orçamento.
- [ ] Remover `audio/sintetiza.py` e os 4 arquivos gerados.

### Task 6: Fechamento

- [ ] `node testar.js` completo em background, TUDO CERTO.
- [ ] Chrome de verdade: os arquivos carregam (rede sem 404), a trilha troca ao mudar de tela (ganho medido no nó), nenhum erro de página, e o volume/mudo agem.
- [ ] Docs (`LEIA-ME.md` "Som", `PENDENCIAS.md` item 37), commit + push, checkpoint com o dono (ouvir e aprovar as faixas).
