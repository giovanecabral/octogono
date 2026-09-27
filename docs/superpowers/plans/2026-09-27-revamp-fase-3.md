# Revamp — Fase 3 (Conta obrigatória + save + placar) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jogar exige conta (com confirmação de e-mail), a carreira em andamento fica salva em até 3 espaços (aparelho + nuvem) e sobrevive a recarregar a página sem permitir refazer luta ou dilema, e carreira encerrada entra num placar global validado no servidor.

**Architecture:** O save é DADO, não tela: `montarSave()` serializa o estado da carreira (incluindo o estado interno dos 8 geradores `mulberry32`) e `aplicarSave()` restaura; a tela da carreira é redesenhada a partir de um registro novo `st.registro` (uma entrada por luta), que a fase 5 também usa. Gravação imediata no `localStorage` + envio com atraso de 2 s pro Supabase (tabela `saves`). Luta em andamento e dilema aberto ficam em `PENDENTE` dentro do save: recarregar refaz a mesma luta (mesma semente, mesma escolha) e reabre o mesmo dilema. Portão de conta nas rotas `nova`/`continuar` e no link de desafio, com a intenção guardada pra continuar depois do login. Placar gravado só pelo servidor (`api/placar.js`, service role) depois de validar plausibilidade (`api/_placar-regras.js`, função pura testável).

**Tech Stack:** o mesmo da fase 1-2; Supabase REST + RLS; função serverless Vercel (ESM).

**Spec:** `docs/superpowers/specs/2026-09-26-revamp-ui-design.md` (seções 6, 7, 8). Correção registrada em `PENDENCIAS.md` item 37: a luta roda round a round com uma escolha depois do 1º round; o save grava a semente da luta e a escolha, não "o resultado antes da narração".

## Global Constraints

- Tudo da seção "Global Constraints" do plano das fases 1-2 continua valendo (texto sem travessão nas telas novas, ícone só SVG, classe por token nos testes, `assert` em toda substituição, commit + push, nada de `vercel --prod` nesta branch).
- **A semente controla tudo que é sorteado.** Nenhuma mudança pode alterar a ORDEM de consumo de nenhum gerador. `node testar.js desafio` e `node testar.js driverluta` têm que continuar verdes com os mesmos números.
- Save nunca derruba o jogo: toda leitura/escrita de `localStorage` e Supabase em `try/catch`; falha vira aviso no indicador, nunca exceção.
- Chaves de `localStorage` do save: `save:<userId>:<slot>` (slot 1..3). Intenção: `intencao`.
- `VERSAO_SAVE = 1`. Save com versão diferente: aviso na tela Continuar, nunca carregado às cegas.
- Pontuação do placar = `Math.round(scoreBruto*100)` onde `scoreBruto` é o `score` sem arredondar de `grade()` (0..100) → inteiro 0..10000.

---

### Task 1: SQL das tabelas `saves` e `placar`

**Files:**
- Modify: `supabase_schema.sql` (acrescentar no fim)

- [ ] **Step 1: Escrever o SQL**

```sql
-- ---------------------------------------------------------------------
-- saves (2026-09-27, revamp fase 3) — carreira EM ANDAMENTO, até 3 por
-- conta. Diferente de carreiras_usuario (histórico, imutável): save é
-- sobrescrito o tempo todo e apagado quando a carreira acaba ou o
-- jogador libera o espaço. Mesmo padrão de RLS de sempre: cada um lê,
-- grava e apaga só o que é seu (auth.uid() vem do JWT, não do client).
create table if not exists saves (
  user_id uuid not null references auth.users(id) on delete cascade,
  slot smallint not null check (slot between 1 and 3),
  versao smallint not null,
  dados jsonb not null,
  nome text not null,
  divisao text not null,
  modo text not null,
  cartel text not null,
  luta_n smallint not null,
  campeao boolean not null default false,
  rosto jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, slot)
);
alter table saves enable row level security;
create policy "usuário lê só os próprios saves" on saves for select using (auth.uid() = user_id);
create policy "usuário cria só os próprios saves" on saves for insert with check (auth.uid() = user_id);
create policy "usuário atualiza só os próprios saves" on saves for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "usuário apaga só os próprios saves" on saves for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- placar (2026-09-27, revamp fase 3) — carreiras ENCERRADAS de todos os
-- jogadores (página Ranking). Leitura pública (é um ranking); ESCRITA só
-- pelo servidor (api/placar.js com service_role, que valida
-- plausibilidade antes). Sem policy de insert/update/delete pro usuário
-- comum, de propósito, mesmo raciocínio de assinaturas: com policy de
-- insert, bastava o DevTools pra se colocar em 1º lugar.
-- user_id fica legível (é um UUID aleatório, sem e-mail); é o que deixa
-- a tela mostrar "sua melhor posição".
create table if not exists placar (
  user_id uuid not null references auth.users(id) on delete cascade,
  seed bigint not null,
  nome_lutador text not null,
  divisao text not null,
  modo text not null check (modo in ('normal','lenda')),
  pontuacao integer not null check (pontuacao between 0 and 10000),
  cartel text not null,
  nota text not null,
  cinturoes smallint not null default 0,
  rosto jsonb,
  criado_em timestamptz not null default now(),
  primary key (user_id, seed)
);
create index if not exists placar_ordem on placar (modo, pontuacao desc);
alter table placar enable row level security;
create policy "placar é público" on placar for select using (true);
```

- [ ] **Step 2: Commit + push e pedir ao dono pra rodar no painel**

```bash
git add supabase_schema.sql && git commit -q -m "Fase 3: SQL das tabelas saves e placar (RLS)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push -q
```

Mensagem ao dono: colar só o trecho novo (as duas tabelas) no SQL Editor do Supabase e rodar. Enquanto não rodar, o save funciona só no aparelho (a nuvem falha em silêncio e o indicador mostra "salvo neste aparelho"), e o Ranking segue vazio.

---

### Task 2: Geradores serializáveis (TDD, suíte `save`)

**Files:**
- Modify: `index.html` (`mulberry32`)
- Modify: `testar.js` (nova `testarSave()`; dispatch `save`; lista do "tudo")

**Interfaces:**
- Produces: todo gerador de `mulberry32(seed)` tem `.estado() -> int32` e `.restaurar(int32)`; a sequência gerada NÃO muda.

- [ ] **Step 1: Teste (falha primeiro)**

Nova suíte `testarSave()` (vai crescer nas próximas tarefas), primeiro bloco:

```js
async function testarSave() {
  console.log("\n" + cinza("save: geradores serializáveis, carreira interrompida = carreira direta, pendências"));
  const M = carregarMotor();
  const falhas = [];
  const conf = async (nome, fn) => {
    try { await fn(); console.log(verde("  ok    ") + nome); }
    catch (e) { falhas.push(nome); console.log(vermelho("  falha ") + nome + "\n         " + e.message); }
  };
  await conf("mulberry32: sequência igual à de antes (primeiros valores da semente 12345)", () => {
    const g = M.mulberry32(12345);
    const v = [g(), g(), g()].map(x => x.toFixed(10)).join(",");
    // valores gravados com a versão ANTERIOR da função (antes de .estado existir)
    if (v !== ESPERADO_MULBERRY_12345) throw new Error("sequência mudou: " + v);
  });
  await conf("mulberry32: estado() + restaurar() continua exatamente de onde parou", () => {
    const a = M.mulberry32(987654321);
    for (let i = 0; i < 1000; i++) a();
    const e = a.estado();
    const esperado = [a(), a(), a(), a()];
    const b = M.mulberry32(1); b.restaurar(e);
    const obtido = [b(), b(), b(), b()];
    if (JSON.stringify(esperado) !== JSON.stringify(obtido)) throw new Error("restaurado divergiu");
  });
  const ok = !falhas.length;
  console.log("\n" + (ok ? verde("save ok") : vermelho(`${falhas.length} falha(s) no save`)));
  return ok;
}
```

`ESPERADO_MULBERRY_12345`: gerar ANTES de mexer em `mulberry32` com
`node -e` carregando o motor (`carregarMotor().mulberry32(12345)` três vezes,
`toFixed(10)`, juntar com vírgula) e colar a string como `const` no topo da
suíte. Dispatch: `else if (cmd === "save") ok = await testarSave();` e
`["save", () => testarSave()]` no "tudo" logo depois de `"rotas"`.

Run: `node testar.js save` → FAIL no 2º (`a.estado is not a function`).

- [ ] **Step 2: Implementar**

```js
function mulberry32(seed){let a=seed>>>0;const g=function(){a|=0;a=(a+0x6D2B79F5)|0;
  let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;
  return ((t^(t>>>14))>>>0)/4294967296;};
  /* save (revamp fase 3): o estado inteiro do gerador é o `a`. Ler e
     restaurar não consome nada, a sequência continua idêntica. */
  g.estado=()=>a|0; g.restaurar=v=>{a=v|0;};
  return g;}
```

- [ ] **Step 3: Rodar**

Run: `node testar.js save && node testar.js desafio && node testar.js driverluta`
Expected: as três verdes; `desafio`/`driverluta` com os mesmos números de antes.

- [ ] **Step 4: Commit + push**

---

### Task 3: `st.registro` e a linha da luta como função

**Files:**
- Modify: `index.html` (`finishFight`, eventos raro e IA, `aplicarDilema`, `aplicarEntrevista`; nova `linhaBout(reg)` e `linhaExtra(x)`)
- Modify: `testar.js` (`testarSave`)

**Interfaces:**
- Produces: `st.registro: Array<{n, adv, venceu, metodo, round, relogio, cartoes, kd:[meu,dele], renda, titulo, extras: Array<{tipo:"raro"|"evento"|"dilema"|"entrevista", texto}>}>`; `linhaBout(reg) -> elemento .bout` (markup idêntico ao de hoje); `linhaExtra(x) -> elemento .event`.

- [ ] **Step 1: Teste (falha primeiro)** — em `testarSave()`, rodar uma carreira inteira no automático (reaproveitar o `novoSandbox`/`montarCarreira`/`rodarCarreira` de `testarFrequenciaConquistas`, extraídos pra helpers de nível superior `sandboxCarreira()` e `jogarAte(sb, n)` usados pelas duas suítes) e conferir: `st.registro.length === 22`; vitórias no registro === `st.wins`; `st.registro[i].n === i+1`; adversários do registro sem repetição.

- [ ] **Step 2: Implementar**

Em `finishFight()`, trocar a montagem de `line` por:

```js
  st.registro=st.registro||[];
  const reg={n:fightNo,adv:opp.name,venceu:won,metodo:r.method,round:r.round,relogio:r.clock,
    cartoes:r.cards||null,kd:[myKd,oppKd],renda:rendaLuta,titulo:!!titleFight,extras:[]};
  st.registro.push(reg);
  const bouts=document.getElementById("bouts");
  bouts.appendChild(linhaBout(reg));
```

```js
/* Linha de uma luta no histórico. Uma função só: a luta que acabou agora
   e a carreira retomada de um save desenham igual (revamp fase 3). */
function linhaBout(reg){
  const line=el("div","bout"+(reg.titulo?" title-fight":""));
  line.innerHTML=`<span class="no">${String(reg.n).padStart(2,"0")}</span>
    <span><span class="opp">${reg.adv}</span><br><span class="how">${reg.metodo} · round ${reg.round} ${reg.relogio}${reg.cartoes?" · "+reg.cartoes:""}${(reg.kd[0]||reg.kd[1])?` · quedas ${reg.kd[0]}-${reg.kd[1]}`:""} · R$${fmtNum(reg.renda)}</span></span>
    <span class="stamp${reg.venceu?"":" d"}">${reg.venceu?"Vitória":"Derrota"}</span>`;
  return line;
}
function linhaExtra(x){ return el("div","event"+(x.tipo==="raro"?" rare":""),x.texto); }
```

Nos pontos que hoje só anexam texto em `#bouts` depois da luta, também
registrar em `st.registro[st.registro.length-1].extras` (a última luta):
evento raro (`{tipo:"raro",texto:raro.t(me.name)}`), evento de IA (o texto
final que `dispararEventoIA` anexa), desfecho do dilema (o texto do
desfecho que `aplicarDilema` mostra) e reação da entrevista
(`aplicarEntrevista`). Localizar cada ponto com
`grep -n 'bouts.appendChild' index.html` e ler o trecho antes de editar.

- [ ] **Step 3: Rodar** `node testar.js save && node testar.js narracao && node testar.js interface` (a `narracao` conta `.bout`, prova que o markup não mudou).
- [ ] **Step 4: Commit + push**

---

### Task 4: `montarSave` / `aplicarSave` / retomar (carreira interrompida = carreira direta)

**Files:**
- Modify: `index.html` (bloco novo "SAVE" logo depois do bloco INTERFACE NOVA; `startCareer` dividido em `iniciarEstadoCarreira()` + `montarTelaCarreira()`)
- Modify: `testar.js` (`testarSave`)

**Interfaces:**
- Produces:
  - `SLOT_ATUAL` (1..3 | null), `USUARIO_ID` (string | null), `PENDENTE` (objeto | null)
  - `estadoGeradores() -> {rng,holdRng,fraseRng,escolhaRng,lesaoRng,eventoRng,dilemaRng,rivalRng}`; `restaurarGeradores(obj)`
  - `montarSave() -> objeto JSON-seguro` (formato abaixo)
  - `aplicarSave(save)` (só estado global, sem DOM)
  - `retomarCarreira(save)` (aplica, monta a tela da carreira, redesenha o histórico, retoma pendência)

Formato do save (versão 1):

```js
{
  versao:1, slot, fase:"carreira", atualizadoEm:"ISO",
  seed:SEED, divisao:DIVISION, modo:MODO, nome:me.name, rosto:ROSTO,
  rival:{ativado:RIVAL_ATIVADO, nome:RIVAL_NOME_ESCOLHIDO},
  picks:[{label, from}],
  me, st, fightNo, fought:[...], rareUsed:[...],
  geradores:estadoGeradores(),
  pendente:PENDENTE
}
```

- [ ] **Step 1: Teste (falha primeiro)** — "carreira interrompida = carreira direta":
  1. Sandbox A: semente 424242, joga até a luta 11 no automático (dilema respondido com texto fixo, IA offline), `JSON.parse(JSON.stringify(montarSave()))`.
  2. Sandbox B (novo, zerado): `aplicarSave(save)`, `montarTelaCarreira()`, joga até a 22.
  3. Sandbox C: mesma semente, joga direto até a 22.
  4. Comparar B e C: `st.registro` inteiro (adversário, venceu, método, round, relógio), `st.wins`, `st.losses`, `st.dinheiro`, `st.followers`, `st.title`, `st.treino`, e `rng.estado()` final. Tudo igual.

- [ ] **Step 2: Implementar**

```js
/* =========================================================================
   SAVE (revamp fase 3). O save é dado: estado da carreira + estado interno
   dos 8 geradores. A tela é redesenhada a partir de st.registro. Ver
   docs/superpowers/plans/2026-09-27-revamp-fase-3.md.
   ========================================================================= */
const VERSAO_SAVE=1;
let SLOT_ATUAL=null,USUARIO_ID=null,PENDENTE=null;
function estadoGeradores(){
  const e=g=>g&&g.estado?g.estado():null;
  return{rng:e(rng),holdRng:e(holdRng),fraseRng:e(fraseRng),escolhaRng:e(escolhaRng),
    lesaoRng:e(lesaoRng),eventoRng:e(eventoRng),dilemaRng:e(dilemaRng),rivalRng:e(rivalRng)};
}
function restaurarGeradores(g){
  const r=v=>{const x=mulberry32(0);if(v!=null)x.restaurar(v);return x;};
  rng=r(g.rng);holdRng=r(g.holdRng);fraseRng=r(g.fraseRng);escolhaRng=r(g.escolhaRng);
  lesaoRng=r(g.lesaoRng);eventoRng=r(g.eventoRng);dilemaRng=r(g.dilemaRng);rivalRng=r(g.rivalRng);
}
function montarSave(){
  return{versao:VERSAO_SAVE,slot:SLOT_ATUAL,fase:"carreira",atualizadoEm:new Date().toISOString(),
    seed:SEED,divisao:DIVISION,modo:MODO,nome:me.name,rosto:ROSTO,
    rival:{ativado:RIVAL_ATIVADO,nome:RIVAL_NOME_ESCOLHIDO},
    picks:picks.map(p=>({label:p.pair?p.pair.label:p.label,from:p.from})),
    me,st,fightNo,fought:[...fought],rareUsed:[...rareUsed],
    geradores:estadoGeradores(),pendente:PENDENTE};
}
function aplicarSave(s){
  SEED=s.seed;DIVISION=s.divisao;MODO=s.modo;ROSTO=s.rosto||null;
  RIVAL_ATIVADO=!!(s.rival&&s.rival.ativado);RIVAL_NOME_ESCOLHIDO=s.rival?s.rival.nome:null;
  POOL=poolDivisao(DIVISION);PCT=makePercentiler(POOL);
  LADDER=[...POOL].sort((a,b)=>a.rating-b.rating);RANKING=buildRanking(POOL);
  me=s.me;st=s.st;fightNo=s.fightNo;
  picks=(s.picks||[]).map(p=>({pair:{label:p.label},from:p.from}));
  fought=new Set(s.fought||[]);rareUsed=new Set(s.rareUsed||[]);
  restaurarGeradores(s.geradores||{});
  PENDENTE=s.pendente||null;SLOT_ATUAL=s.slot||SLOT_ATUAL;
  auto=false;speed=1;playing=false;dilemaAberto=false;escolhaAberta=false;entrevistaAberta=false;
}
```

`startCareer()` vira:

```js
function startCareer(){
  evento("terminou_draft");
  atualizarStatusPro();
  iniciarEstadoCarreira();   // o bloco que monta me.__base, st={...}, rareUsed, fought, flags
  montarTelaCarreira();      // o bloco que monta #controls, painéis, abas, .carreira, renderFicha()
  salvarCarreira();          // Task 6
}
```

(mover o corpo existente, sem mudar uma linha da lógica; `iniciarEstadoCarreira` termina onde hoje começa `app.innerHTML=""`.)

```js
function retomarCarreira(s){
  aplicarSave(s);
  atualizarStatusPro();
  montarTelaCarreira();
  const bouts=document.getElementById("bouts");
  (st.registro||[]).forEach(reg=>{
    bouts.appendChild(linhaBout(reg));
    (reg.extras||[]).forEach(x=>bouts.appendChild(linhaExtra(x)));
  });
  atualizarControles();renderFicha();
  retomarPendente();   // Task 5
}
```

- [ ] **Step 3: Rodar** `node testar.js save` (verde), `desafio`, `interface`.
- [ ] **Step 4: Dente** — trocar temporariamente `restaurarGeradores` pra NÃO restaurar o `escolhaRng` e ver o teste de equivalência reprovar; restaurar.
- [ ] **Step 5: Commit + push**

---

### Task 5: Pendências (luta em andamento e dilema aberto)

**Files:**
- Modify: `index.html` (`lutar` dividido em `prepararLuta` + `rodarLuta`; escolha grava; `finishFight` limpa; `abrirDilema(dPronto)`; `retomarPendente()`)
- Modify: `testar.js` (`testarSave`)

**Interfaces:**
- Produces: `PENDENTE = {tipo:"luta", adv, camp, semL, escolha:null|{mod,attr}, rival} | {tipo:"dilema", d}`; `retomarPendente()`.

- [ ] **Step 1: Testes (falham primeiro)**
  1. "recarregar no meio da luta refaz a mesma luta": sandbox A joga até a luta 7, chama `nextFight()` e para logo depois de `lutar()` gravar (antes de drenar a narração); `save=montarSave()`; sandbox B `retomarCarreira(save)`, drena; sandbox C joga direto. `st.registro[6]` de B === de C.
  2. "escolha na luta gravada é reaplicada": no sandbox A, parar DEPOIS da escolha do round 1 (forçar a escolha 2 via `abrirEscolhaLuta` falso), salvar, retomar em B: B não abre escolha de novo e o resultado bate com uma execução direta que fez a mesma escolha.
  3. "dilema aberto reabre o mesmo texto": parar com dilema aberto (luta 5), salvar, retomar: o `.dil-t` e o `.dil-c` renderizados em B são iguais aos de A, e nenhuma chamada de IA nova (`ai("dilema")`) acontece em B (contar chamadas com um `fetch` falso).

- [ ] **Step 2: Implementar**

`lutar(escolhido,camp)` → `prepararLuta` faz tudo que hoje vem antes de `const rngL=...` (fightNo++, fought.add, aplicarCamp, st.campEscolhido, etc.), consome `const semL=Math.floor(rng()*1e9)` (MESMA chamada, mesmo lugar), grava `PENDENTE={tipo:"luta",adv:opp.name,camp:camp.nome,semL,escolha:null,rival:!!escolhido.rival}`, chama `salvarCarreira()`, e chama `rodarLuta(opp,titleFight,ehRival,semL,null)`. `rodarLuta` é o resto de hoje, com `const rngL=mulberry32(semL)`; no callback da escolha: `PENDENTE.escolha={mod,attr};salvarCarreira();` antes de seguir; se `escolhaFixa` vier preenchida, não abre a escolha e aplica `A.mAttr[attr]=mod` direto. `finishFight` termina com `PENDENTE=null;salvarCarreira();` (e de novo quando o dilema/evento assíncrono resolver).

`retomarPendente()`:

```js
function retomarPendente(){
  const p=PENDENTE;
  if(!p){ return; }
  if(p.tipo==="luta"){
    const opp=p.rival&&st.rival?st.rival.f:LADDER.find(f=>f.name===p.adv)||RANKING.lista.find(f=>f.name===p.adv);
    if(!opp){ PENDENTE=null; return; }   // save de outra versão do elenco: descarta a luta, nunca trava
    rodarLuta(opp,!!st.tituloEstaLuta,!!p.rival,p.semL,p.escolha);
  }else if(p.tipo==="dilema"){
    dilemaAberto=true;atualizarControles();
    abrirDilema(p.d).catch(()=>{}).then(()=>{dilemaAberto=false;PENDENTE=null;verificarConquistas();atualizarControles();renderFicha();salvarCarreira();});
  }
}
```

`abrirDilema(dPronto)`: se `dPronto`, pula `proximoDilemaSeed`/IA/`dilemaRecentes` (já aconteceram antes do save) e usa `d=dPronto`; senão, depois de decidir `d`, grava `PENDENTE={tipo:"dilema",d}` e `salvarCarreira()` antes de desenhar a caixa.

(`RANKING.lista` existe? Conferir o nome real da lista de nomeados em `buildRanking` antes de usar; o adversário de título sai de lá.)

- [ ] **Step 3: Rodar** `node testar.js save`, `desafio`, `driverluta`, `escolhaluta`, `dilema`, `interface`.
- [ ] **Step 4: Dente** — tirar `PENDENTE.escolha=...` e ver o teste 2 reprovar; restaurar.
- [ ] **Step 5: Commit + push**

---

### Task 6: Armazenamento (aparelho + nuvem) e indicador

**Files:**
- Modify: `index.html` (bloco SAVE; `<div id="indicador-save">` no `<body>`; chamadas de `salvarCarreira()` na loja e nos pontos assíncronos)
- Modify: `estilo.css` (indicador)
- Modify: `testar.js` (`testarSave`)

**Interfaces:**
- Produces: `salvarCarreira()`, `lerSaveLocal(uid,slot)`, `gravarSaveLocal(uid,slot,dados)`, `apagarSave(slot) -> Promise`, `listarSaves() -> Promise<Array<save|null>>` (índice 0..2 = slot 1..3, o mais novo entre aparelho e nuvem), `indicadorSave(estado)` com estado ∈ `salvando|salvo|local`.

- [ ] **Step 1: Testes (falham primeiro)** com Supabase falso (mesmo molde de `testarTelaInicial`): `salvarCarreira()` grava na chave `save:u1:2` na hora; depois de drenar o timer de 2 s, faz `upsert` em `saves` com `{user_id:"u1",slot:2,versao:1,dados,nome,divisao,modo,cartel,luta_n,campeao,rosto,atualizado_em}`; com `upsert` devolvendo erro, o indicador fica em `local` e o `localStorage` continua com o save; `listarSaves()` escolhe o mais novo (nuvem mais nova vence o local e vice-versa).

- [ ] **Step 2: Implementar**

```js
const chaveSave=(uid,slot)=>`save:${uid}:${slot}`;
function lerSaveLocal(uid,slot){ try{ return JSON.parse(localStorage.getItem(chaveSave(uid,slot))); }catch(e){ return null; } }
function gravarSaveLocal(uid,slot,dados){ try{ localStorage.setItem(chaveSave(uid,slot),JSON.stringify(dados)); return true; }catch(e){ return false; } }
function apagarSaveLocal(uid,slot){ try{ localStorage.removeItem(chaveSave(uid,slot)); }catch(e){} }
let timerNuvem=null;
function salvarCarreira(){
  if(!SLOT_ATUAL||!USUARIO_ID||!st||!me)return;
  const d=montarSave();
  const local=gravarSaveLocal(USUARIO_ID,SLOT_ATUAL,d);
  indicadorSave(local?"salvando":"local");
  clearTimeout(timerNuvem);
  timerNuvem=setTimeout(()=>enviarSaveNuvem(d),2000);
}
async function enviarSaveNuvem(d){
  const sb=getSupabase();
  if(!sb){ indicadorSave("local"); return; }
  try{
    const{error}=await sb.from("saves").upsert({user_id:USUARIO_ID,slot:d.slot,versao:d.versao,dados:d,
      nome:d.nome,divisao:d.divisao,modo:d.modo,cartel:`${d.st.wins}-${d.st.losses}`,luta_n:d.fightNo,
      campeao:!!d.st.title,rosto:d.rosto,atualizado_em:d.atualizadoEm},{onConflict:"user_id,slot"});
    indicadorSave(error?"local":"salvo");
  }catch(e){ indicadorSave("local"); }
}
async function listarSaves(){
  const r=[null,null,null];
  if(!USUARIO_ID)return r;
  for(let s=1;s<=3;s++)r[s-1]=lerSaveLocal(USUARIO_ID,s);
  const sb=getSupabase();
  if(sb){
    try{
      const{data}=await sb.from("saves").select("slot,dados,atualizado_em").eq("user_id",USUARIO_ID);
      (data||[]).forEach(l=>{
        const i=l.slot-1, loc=r[i];
        if(!loc||new Date(l.atualizado_em)>new Date(loc.atualizadoEm)){ r[i]=l.dados; gravarSaveLocal(USUARIO_ID,l.slot,l.dados); }
      });
    }catch(e){}
  }
  return r;
}
async function apagarSave(slot){
  apagarSaveLocal(USUARIO_ID,slot);
  const sb=getSupabase();
  if(sb){ try{ await sb.from("saves").delete().eq("user_id",USUARIO_ID).eq("slot",slot); }catch(e){} }
}
function indicadorSave(estado){
  const i=document.getElementById("indicador-save");
  if(!i)return;
  const txt={salvando:"Salvando",salvo:"Salvo",local:"Sem conexão, salvo neste aparelho"}[estado];
  const ico={salvando:"nuvem-ok",salvo:"nuvem-ok",local:"nuvem-off"}[estado];
  i.className="indicador-save on "+estado;
  i.innerHTML=`${ICONE(ico)}<span>${txt}</span>`;
  clearTimeout(i._t);
  if(estado==="salvo")i._t=setTimeout(()=>{i.className="indicador-save";},2500);
}
```

Pontos que chamam `salvarCarreira()` além dos já citados: compra na loja (depois de `st.dinheiro-=custo`), fim da aplicação do evento de IA, fim de `aplicarEntrevista`, saída pro menu (`pagehide` e `visibilitychange` quando `document.visibilityState==="hidden"`).

CSS do indicador (fixo, canto inferior direito, fora do caminho do polegar no celular):

```css
.indicador-save{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:9980;
  display:none;align-items:center;gap:8px;padding:8px 12px;background:rgba(17,19,26,.9);border:1px solid var(--linha-forte);
  font-family:var(--f-ui);font-weight:600;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--osso-2)}
.indicador-save.on{display:inline-flex}
.indicador-save.local{color:var(--ouro);border-color:rgba(212,160,23,.45)}
.indicador-save.salvando .ico{animation:pisca 1s ease-in-out infinite}
```

- [ ] **Step 3: Rodar** `node testar.js save`, `loja`, `interface`.
- [ ] **Step 4: Commit + push**

---

### Task 7: Portão de conta e intenção

**Files:**
- Modify: `index.html` (rotas `nova`/`continuar` com `comConta`; `ready()` pro desafio; `screenPortao`; `montarFormularioConta(container,{modoInicial})`; `getSupabase()` escuta `SIGNED_IN`)
- Modify: `testar.js` (`testarRotas`; `testarInterface` ganha sessão falsa)

**Interfaces:**
- Produces: `sessaoAtual() -> Promise<session|null>` (e preenche `USUARIO_ID`); `comConta(intencao, fn)`; `guardarIntencao(obj)`; `consumirIntencao() -> obj|null` (vence em 24 h); `screenPortao(intencao)`.

- [ ] **Step 1: Testes (falham primeiro)**: sem sessão, `irPara("nova")` monta `.tela-portao` com o formulário em modo Criar e grava `intencao={tipo:"nova"}`; `irPara("continuar")` idem com `{tipo:"continuar"}`; com sessão, `irPara("nova")` abre o fluxo (campo de nome); link de desafio (`location.search="?d=lightweight&s=abc"`) sem sessão abre o portão com `{tipo:"desafio",busca:"?d=..."}`; `consumirIntencao()` devolve e apaga; intenção com mais de 24 h é ignorada.

- [ ] **Step 2: Implementar**

```js
async function sessaoAtual(){
  const sb=getSupabase();
  if(!sb)return null;
  try{ const{data:{session}}=await sb.auth.getSession(); USUARIO_ID=session?session.user.id:null; return session; }
  catch(e){ return null; }
}
function guardarIntencao(obj){ try{ localStorage.setItem("intencao",JSON.stringify({...obj,em:Date.now()})); }catch(e){} }
function consumirIntencao(){
  try{
    const v=JSON.parse(localStorage.getItem("intencao")); localStorage.removeItem("intencao");
    return v&&Date.now()-v.em<864e5?v:null;
  }catch(e){ return null; }
}
async function comConta(intencao,fn){
  const s=await sessaoAtual();
  if(s){ fn(); return; }
  guardarIntencao(intencao);
  screenPortao(intencao);
}
function screenPortao(intencao){
  const c=montarTela({fundo:"tunel",titulo:"Crie sua conta",classe:"tela-portao"});
  c.appendChild(el("p","tela-sub",intencao.tipo==="desafio"
    ?"Alguém te desafiou. Crie sua conta ou entre pra aceitar: a carreira fica salva nela."
    :"Pra jogar você precisa de uma conta. Sua carreira fica salva nela e continua em qualquer aparelho."));
  const form=el("div","painel-n conta-form");
  c.appendChild(form);
  montarFormularioConta(form,{modoInicial:"criar"});
}
function seguirIntencao(v){
  if(!v)return false;
  if(v.tipo==="desafio"&&v.busca){ location.href=location.pathname+v.busca; return true; }
  irPara(v.tipo==="continuar"?"continuar":"nova",null,{substituir:true});
  return true;
}
```

Rotas: `registrarRota("nova",()=>comConta({tipo:"nova"},()=>iniciarNovaCarreira()))` (Task 8 define `iniciarNovaCarreira`; nesta tarefa ela é `screenName()`), `registrarRota("continuar",()=>comConta({tipo:"continuar"},screenContinuar))`. `ready()`: `if(lerDesafio()){ comConta({tipo:"desafio",busca:location.search},()=>screenName()); return; }` e, logo antes de `irPara(r.nome...)`, `sessaoAtual().then(s=>{ if(s)seguirIntencao(consumirIntencao()); })` só quando a rota for `menu` (entrar com senha recarrega a página e cai aqui). Em `getSupabase()`, no mesmo `onAuthStateChange`: `if(event==="SIGNED_IN"){ USUARIO_ID=... ; const v=consumirIntencao(); if(v)seguirIntencao(v); }` (é o caminho do link de confirmação e do Google). `montarFormularioConta(container,{modoInicial="entrar"}={})`: `let modo=modoInicial;`.

`testarInterface`: o sandbox ganha um `window.supabase` falso com sessão (`{user:{id:"u1",email:"t@t"}}`, `from()` que aceita select/upsert/delete sem erro), senão o clique em Nova carreira para no portão.

- [ ] **Step 3: Rodar** `rotas`, `interface`, `inicial`, `pro`, `rival`.
- [ ] **Step 4: Commit + push**

---

### Task 8: Continuar de verdade, espaço cheio, menu e conta com saves

**Files:**
- Modify: `index.html` (`screenContinuar`, `slotSalvo`, `iniciarNovaCarreira`, `screenEscolherEspaco`, prévias do menu e da conta)
- Modify: `estilo.css`
- Modify: `testar.js` (`testarRotas`, `testarSave`)

**Interfaces:**
- Produces: `slotSalvo(save,slot)`; `iniciarNovaCarreira()` (escolhe o 1º espaço livre ou abre `screenEscolherEspaco`); `fmtRelativo(iso) -> "há 2 horas"`.

- [ ] **Step 1: Testes (falham primeiro)**: com 1 save no espaço 2, `#/continuar` mostra espaço 1 livre, espaço 2 com nome/cartel/`luta X de 22`, espaço 3 livre; "Continuar" do espaço 2 chama `retomarCarreira` (a tela da carreira aparece com `st.registro.length` linhas `.bout`); "Apagar" pede confirmação na própria tela e só apaga no segundo clique; com os 3 cheios, `#/nova` abre a escolha de espaço e só inicia depois de confirmar a substituição.

- [ ] **Step 2: Implementar** (card do save: retrato `bonecoSVG(save.rosto||cfgPadrao(),{w:120})`, nome, divisão, selo LENDA se `modo==="lenda"`, cartel, `Luta N de 22`, ícone `medalha` se `st.title`, "jogado há …", botões Continuar e Apagar com `ICONE("lixeira")`; confirmação: o botão vira "Apagar de vez" + "Cancelar"; espaço cheio: mesma grade com botão "Substituir" e confirmação igual). Menu: card Continuar usa o save mais recente (tira o `apagado`, mostra retrato pequeno + "Nome · Divisão · 7-2 · luta 10 de 22"); Conta: prévia "N carreiras salvas". `SLOT_ATUAL` é definido em `iniciarNovaCarreira` e passado adiante até `startCareer`.

- [ ] **Step 3: Rodar, screenshot (com 2 saves injetados no `localStorage` via script da ferramenta), commit + push**

---

### Task 9: Placar (servidor valida, cliente envia, ranking mostra sua posição)

**Files:**
- Create: `api/_placar-regras.js` (função pura; o `_` impede a Vercel de expor como rota)
- Create: `api/placar.js`
- Modify: `index.html` (`enviarPlacar(g)` em `screenReport`; `grade()` expõe `bruto`; save apagado ao encerrar; Ranking com "sua melhor posição")
- Modify: `testar.js` (suíte `placar`)

**Interfaces:**
- Produces: `validarEnvio(corpo) -> {ok:true, linha} | {ok:false, erro}`; `POST /api/placar` com `Authorization: Bearer <jwt>` e corpo `{seed,nome,divisao,modo,wins,losses,finishes,cinturoes,title,pontuacao,nota,rosto}` → `200 {ok:true}` | `400 {erro}` | `401` | `429`.

- [ ] **Step 1: Teste da regra (falha primeiro)** — suíte `placar` com `await import("./api/_placar-regras.js")`: aceita uma carreira real (tirada de `rodarCarreira` + `grade()`); recusa `wins+losses>22`; `finishes>wins`; `cinturoes>wins`; `pontuacao>10000`; pontuação acima do teto possível pro cartel (`(40+30+winPct*12+finishPct*8+(title?10:0))*100`); nota que não bate com a faixa da pontuação; nome vazio, com mais de 28 caracteres, com link, ou com palavra da lista proibida (sem diferenciar acento/maiúscula); divisão fora da lista; modo fora de `normal|lenda`.

- [ ] **Step 2: Implementar `api/_placar-regras.js`**

```js
/* Regras do placar (revamp fase 3). Função pura: o servidor (api/placar.js)
   e o testar.js usam a mesma. O motor roda no navegador, então isto NÃO
   prova que a carreira aconteceu; só recusa o que é impossível pelas
   próprias regras do jogo. Limite registrado em PENDENCIAS.md item 37. */
export const DIVISOES_OK = ["flyweight","bantamweight","featherweight","lightweight","welterweight",
  "middleweight","light_heavyweight","heavyweight","w_strawweight","w_flyweight","w_bantamweight","w_featherweight"];
const FAIXAS = [[9000,"S"],[7800,"A"],[6400,"B"],[4800,"C"],[3200,"D"],[0,"F"]];
const PROIBIDAS = ["porra","caralho","buceta","viado","puta","merda","cu","foda","fdp","vsf","pqp","arrombado",
  "nazista","hitler","macaco","estupro","crioulo","retardado"];
const semAcento = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export function nomeAceito(nome) {
  const n = String(nome || "").trim();
  if (!n || n.length > 28) return false;
  if (/https?:|www\.|\.com|@/i.test(n)) return false;
  const palavras = semAcento(n).split(/[^a-z0-9]+/).filter(Boolean);
  return !palavras.some(p => PROIBIDAS.includes(p));
}
export function validarEnvio(c) {
  const int = v => Number.isInteger(v) && v >= 0;
  if (!c || typeof c !== "object") return { ok: false, erro: "corpo inválido" };
  const { seed, nome, divisao, modo, wins, losses, finishes, cinturoes, title, pontuacao, nota, rosto } = c;
  if (!Number.isFinite(seed) || seed <= 0) return { ok: false, erro: "semente inválida" };
  if (!nomeAceito(nome)) return { ok: false, erro: "nome não aceito no ranking" };
  if (!DIVISOES_OK.includes(divisao)) return { ok: false, erro: "divisão inválida" };
  if (modo !== "normal" && modo !== "lenda") return { ok: false, erro: "modo inválido" };
  if (![wins, losses, finishes, cinturoes, pontuacao].every(int)) return { ok: false, erro: "número inválido" };
  if (wins + losses > 22 || wins + losses < 1) return { ok: false, erro: "cartel impossível" };
  if (finishes > wins || cinturoes > wins) return { ok: false, erro: "cartel impossível" };
  const winPct = wins / (wins + losses), finPct = wins ? finishes / wins : 0;
  const teto = Math.ceil((40 + 30 + winPct * 12 + finPct * 8 + (title ? 10 : 0)) * 100);
  if (pontuacao > Math.min(10000, teto)) return { ok: false, erro: "pontuação impossível pro cartel" };
  const faixa = FAIXAS.find(f => pontuacao >= f[0])[1];
  if (nota !== faixa) return { ok: false, erro: "nota não bate com a pontuação" };
  if (rosto != null && (typeof rosto !== "object" || JSON.stringify(rosto).length > 2000)) return { ok: false, erro: "rosto inválido" };
  return { ok: true, linha: { seed, nome_lutador: String(nome).trim(), divisao, modo, pontuacao,
    cartel: `${wins}-${losses}`, nota, cinturoes, rosto: rosto || null } };
}
```

(Conferir `DIVISOES_OK` contra `DIVISOES` do `index.html` e as faixas contra `grade()` antes do commit; o teste da regra compara com os valores reais do motor.)

- [ ] **Step 3: Implementar `api/placar.js`**

```js
/* Placar (revamp fase 3): único jeito de gravar no ranking. Confere a
   sessão (JWT), aplica as regras de _placar-regras.js, limita envios e
   grava com a service role (a tabela não tem policy de escrita). */
import { validarEnvio } from "./_placar-regras.js";
const SUPABASE_URL = "https://kapdpipwqkumzschctnj.supabase.co";
const SUPABASE_ANON_KEY = "<a mesma anon key pública de api/criar-pagamento.js>";
const LIMITE_DIA = 20;
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ erro: "método" });
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service) return res.status(503).json({ erro: "placar não configurado" });
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ erro: "sem sessão" });
  let userId = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
    if (r.ok) userId = (await r.json()).id;
  } catch {}
  if (!userId) return res.status(401).json({ erro: "sessão inválida" });
  const v = validarEnvio(req.body);
  if (!v.ok) return res.status(400).json({ erro: v.erro });
  const cab = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
  const desde = new Date(Date.now() - 864e5).toISOString();
  const cont = await fetch(`${SUPABASE_URL}/rest/v1/placar?select=seed&user_id=eq.${userId}&criado_em=gte.${desde}`, { headers: cab });
  const hoje = cont.ok ? (await cont.json()).length : 0;
  if (hoje >= LIMITE_DIA) return res.status(429).json({ erro: "limite de envios do dia" });
  const g = await fetch(`${SUPABASE_URL}/rest/v1/placar`, {
    method: "POST", headers: { ...cab, Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ ...v.linha, user_id: userId }),
  });
  if (!g.ok) return res.status(502).json({ erro: "falha ao gravar" });
  return res.status(200).json({ ok: true });
}
```

Teste do handler (na suíte `placar`): importar o handler com `fetch` global falso (usuário válido, contagem 0, gravação 201) e `req/res` falsos; conferir 401 sem token, 400 com corpo impossível, 429 com contagem 20, 200 no caminho feliz, e que o corpo gravado tem `user_id` do token (nunca do corpo).

- [ ] **Step 4: Cliente**: `grade()` passa a devolver também `bruto:score`; em `screenReport`, depois de `salvarCarreiraLocal`: `enviarPlacar(g)` (fire-and-forget com `Authorization` da sessão; mostra uma linha "Carreira enviada ao ranking." ou o erro traduzido) e `apagarSave(SLOT_ATUAL)`. Ranking: se houver sessão, busca a melhor linha do usuário (`eq("user_id",USUARIO_ID).order(...).limit(1)`) e conta quantas têm pontuação maior (`select("seed",{count:"exact",head:true}).gt("pontuacao",p)`) → faixa fixa "Sua melhor posição: N".

- [ ] **Step 5: Rodar** `node testar.js placar`, `rotas`, `aposentadoria`, `compartilhar`.
- [ ] **Step 6: Commit + push** (o endpoint só roda de verdade depois do merge + deploy; registrar em PENDENCIAS)

---

### Task 10: Fechamento da fase 3

- [ ] `node testar.js` completo em background → TUDO CERTO.
- [ ] Manual no navegador (localhost): portão sem sessão; entrar com a conta do dono; nova carreira até a luta 3; recarregar no meio da luta 3 (volta na mesma luta); recarregar com dilema aberto na luta 5 (mesmo texto); Continuar mostra o espaço; apagar; 3 larguras nas telas novas (portão, continuar, escolha de espaço).
- [ ] Docs: `LEIA-ME.md` seção "Contas" (regra nova: jogar exige conta; por quê; o que acontece com o link de desafio), seção nova "Save", "Placar"; `CLAUDE.md` (regra da semente vale também pro save: nunca mudar ordem de consumo; `VERSAO_SAVE` sobe se o formato mudar); `PENDENCIAS.md` item 37 (fase 3 feita, endpoint depende de deploy, SQL rodado ou não).
- [ ] Checkpoint com o dono antes da fase 4.
