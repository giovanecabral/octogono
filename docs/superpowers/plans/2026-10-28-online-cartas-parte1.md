# Online em cartas, Parte 1: a tela da luta

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tela da luta do Online (gente e bot) vira um jogo de cartas: a carta aprovada no protótipo, a mão em leque, a mão dele em cartinhas, a mesa em octógono com as vagas de postura e de ação, a revelação animada e o resultado no mesmo acabamento, sem mudar servidor nem regras.

**Architecture:** Tudo em `index.html` (as funções `jxjDesenharCombate`, `jxjTelaLuta`, `jxjDesenharResultado` e componentes novos) e num bloco novo de `estilo.css`. A vista do servidor não muda. A tela continua redesenhando a área inteira quando a assinatura da vista muda; o que precisa sobreviver ao redesenho (a revelação da troca que acabou, a queda da carta dele) fica num estado da `jxjTelaLuta` e é passado pra `jxjDesenharCombate`, que só anima na primeira vez. Classes e ids que os testes, os efeitos e o tutorial de prints já usam continuam (`jxj-acao`, `jxj-postura`, `jxj-ultima`, `jxj-mao`, `zero`, `jxj-gaveta`, `jxj-card-eu`, `jxj-card-ele`, `jxj-posicao`, `jxj-relogio`, `jxj-anel`).

**Tech Stack:** `index.html` (JS sem framework), `estilo.css`, `testar.js` (DOM falso, suíte `jxjtelas`), puppeteer local pro checklist.

**Spec:** `docs/superpowers/specs/2026-10-28-online-cartas-tutorial-design.md` (seções 3 e 4). Protótipos aprovados: `.superpowers/brainstorm/66919-1793221452/content/cartas-fusao-v2.html`, `luta-layout-v2.html`, `luta-animacao-v2.html`.

## Global Constraints

- Servidor, banco, motor, bot e regras: nada muda (nenhum arquivo de `api/` nem SQL).
- Carta: cor sólida por família (Golpes `#D7261E`, Queda `#D4A017`, Defesa `#E9E4D8`, Pressão `#1b1d24` com borda `#D7261E`), listras finas, recorte de canto, gema em octógono com o custo, nome da família, ícone do sprite grande, faixa preta com o nome e as cópias ("×3" em ouro), caixa de regra.
- Estados da carta: finta ("−1,5 finta", duas casas com a iniciativa), sem energia (apagada, cadeado, desligada), acabou no round (contorno tracejado), escolhida (sobe, brilho dourado).
- A mesa nunca mostra a ação dele antes da revelação; a postura dele só de costas antes da revelação dos sinais.
- Com "reduzir movimento": nada se move (sem voo, sem giro, sem tremida, sem número subindo).
- Celular (390 px): as 4 cartas da mão lado a lado, nada rola na horizontal.
- Ícone só do sprite (`ICONE`), nenhum emoji, texto sem travessão nem frase de efeito, nome de outro jogador por `jxjEsc`.
- Luta v3 (sem `maos`) continua funcionando: sem mesa de postura, trilho do momento.

## Review Focus

1. Vazamento da escolha dele: a mesa, as classes ou os textos mostrando a família da ação dele antes da revelação (com gente). Teste na Task 3.
2. Redesenho no meio da revelação (ele mostra a postura da troca nova enquanto as cartas da anterior viram): a revelação não pode recomeçar nem sumir antes da hora. Teste na Task 4.
3. Clique duplo na carta (ou tocar outra durante o voo): uma ação só vai pro servidor. Teste na Task 4.
4. Celular sem `getBoundingClientRect` útil (ou DOM falso): o voo não pode quebrar o envio. Teste na Task 4.
5. Luta v3 e luta encerrada abrindo a tela nova sem `undefined`. Teste na Task 5.

---

### Task 1: A carta e a mão em leque

**Files:**
- Modify: `index.html` (perto de `jxjMao`, ~linha 8578; dentro de `jxjDesenharCombate`, o bloco `else if(v.etapa==="sinal")` e o `else` das ações)
- Modify: `estilo.css` (bloco novo "Online em cartas (2026-10-28)" no fim das regras do Online)
- Test: `testar.js` (`jxjtelas`)

**Interfaces:**
- Produces:
  - `jxjCarta(a, {tam="mao", papel, postura=false, estado=""} = {})` → string HTML de `<span class="jxj-carta f-<familia> corte ...">`. `a` é uma ação da vista (`familia, rotulo, grupo, custo, restam, finta, dica, ciclo, resumo, descricao`). `tam`: `"mao"` (150 px), `"mesa"` (118 px), `"postura"` (84 px), `"celular"` (86 px, via CSS). Com `postura:true`, a faixa mostra `JXJ_POSTURAS[familia]` e a regra "Mostra que vai de {grupo}".
  - `jxjCartaDaTroca(fam, varId, papelDaTroca, tam)` → a mesma carta montada a partir da família e da variante gravadas na troca (rótulo de `JXJ_DEF.acoes.variantes[varId]`, grupo de `JXJ_DEF.acoes.familias[papel][fam]`, ciclo de `JXJ_DEF.acoes.ciclo[papel][fam]`).
  - `jxjVerso(tam)` → `<span class="jxj-verso corte">` com o octógono.
  - Os botões da mão: `<button class="jxj-acao jxj-na-mao ...">` (ação) e `<button class="jxj-postura jxj-na-mao ...">` (postura), cada um com uma `jxjCarta` dentro, num `<div class="jxj-mao-luta">` (substitui `.jxj-acoes-luta` e `.jxj-posturas`).

- [ ] **Step 1: Adaptar os testes que dependem do botão antigo e escrever o teste novo da carta**

No teste "luta (revamp de 2026-10-20)…": trocar o formato do custo e o ciclo em pé.

```js
        const custo = a.custo < 0 ? `+${String(-a.custo).replace(".", ",")}` : String(a.custo).replace(".", ",");
        if (!acoes.some((b) => { const h = String(b.innerHTML); return h.includes(`<b>${a.rotulo}</b>`) && h.includes(`<small>${a.grupo}</small>`) && h.includes(a.resumo)
          && h.includes(a.descricao) && h.includes(a.ciclo) && h.includes(`<span class="jxj-gema-num">${custo}</span>`) && h.includes("jxj-acao-bolha"); }))
```

e trocar a checagem do `jxj-ciclo-pe` (a carta diz quem ganha de quem; o ciclo dos 4 ícones sai, decisão do protótipo aprovado):

```js
      if (nos.some((n) => tem(n, "jxj-ciclo-pe"))) throw new Error("o ciclo dos 4 ícones voltou (cada carta já diz quem ganha de quem)");
      for (const b of acoes) if (!/Ganha de [^.]+\. Perde pra [^.]+\./.test(String(b.innerHTML))) throw new Error("carta sem o ciclo dela");
```

No teste "etapas na tela (fase 2)": as posturas viram cartas de postura (mesmo papel `jxj-postura`, agora dentro de `.jxj-mao-luta`):

```js
      if (!nos.some((n) => tem(n, "jxj-mao-luta")) || nos.some((n) => tem(n, "jxj-acao"))) throw new Error("etapa do sinal: cartas de postura sem ações");
```

(e a busca do container `jxj-posturas` some; o resto do teste, que procura `jxj-postura` com "Peso na frente", "Base baixa", "Guarda alta", "Avançando", continua.)

Teste novo, logo depois de "iniciativa na tela (fase 3)":

```js
    await conf("cartas (2026-10-28): cada ação é uma carta da cor da família, com a gema do custo, o grupo, o nome, as cópias que restam e a regra; na postura, a carta diz a postura; sem carta, o contorno; sem energia, o cadeado", async () => {
      const mexer = async (fn) => { const r = (await db.query("select estado from jxj_lutas where id = $1", [lid])).rows[0]; fn(r.estado); await db.query("update jxj_lutas set estado = $2::jsonb where id = $1", [lid, JSON.stringify(r.estado)]); };
      let vs = await api(u1, "luta", { lutaId: lid });
      if (vs.status !== "andamento") throw new Error("a luta acabou antes: " + vs.status);
      const eu = vs.lado, ele = eu === "a" ? "b" : "a";
      await mexer((e) => { e.pos = "pe"; e.encaixe = null; e.a.grogue = false; e.b.grogue = false; e.iniciativa = null; e[eu].energia = 8; e.mao[eu] = { golpes: 3, queda: 2, defesa: 3, pressao: 0 }; });
      vs = await api(u1, "luta", { lutaId: lid });
      let m = await abrir(`luta/${lid}`), nos = desde(m);
      if (vs.etapa === "sinal") {
        const post = nos.filter((n) => tem(n, "jxj-postura"));
        if (post.length !== 3) throw new Error("cartas de postura (só as com carta): " + post.length);
        for (const p of post) if (!/class="jxj-carta f-(golpes|queda|defesa) /.test(String(p.innerHTML)) || !/Mostra que vai de/.test(String(p.innerHTML))) throw new Error("carta de postura: " + String(p.innerHTML).slice(0, 200));
        for (const u of [u1, u2]) { const v = await api(u, "luta", { lutaId: lid }); if (!v.meuSinal) await api(u, "sinal", { lutaId: lid, round: v.round, troca: v.troca, familia: naMao(v, "defesa") }); }
        m = await abrir(`luta/${lid}`); nos = desde(m); vs = await api(u1, "luta", { lutaId: lid });
      }
      const cartas = nos.filter((n) => tem(n, "jxj-acao"));
      if (cartas.length !== 4) throw new Error("4 cartas na mão: " + cartas.length);
      for (const a of vs.acoes) {
        const b = cartas.find((x) => String(x.innerHTML).includes(`f-${a.familia} `));
        if (!b) throw new Error("sem a carta de " + a.familia);
        const h = String(b.innerHTML);
        if (a.restam === 0) { if (!tem(b, "sem-carta") || !b.disabled || !/jxj-carta-vazia/.test(h)) throw new Error("sem carta: " + h.slice(0, 160)); continue; }
        if (!h.includes(`<span class="jxj-carta-qtd">×${a.restam}</span>`)) throw new Error(`${a.familia}: cópias ×${a.restam}`);
        if (!h.includes(`<small>${a.grupo}</small>`) || !h.includes(`<b>${a.rotulo}</b>`)) throw new Error(`${a.familia}: grupo e nome`);
      }
      await mexer((e) => { e[eu].energia = 0.5; });
      m = await abrir(`luta/${lid}`); nos = desde(m);
      const trancadas = nos.filter((n) => tem(n, "jxj-acao") && tem(n, "sem-energia"));
      if (!trancadas.length || trancadas.some((b) => !b.disabled || !/icones\.svg#cadeado/.test(String(b.innerHTML)))) throw new Error("sem energia: cadeado e desligada");
      semLixoV3(htmlDe(nos), "cartas");
      await mexer((e) => { e[eu].energia = 8; e.mao[eu] = { ...vs.maoCheia[eu] }; });
    });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `JXJ_SO="cartas (2026|luta (revamp|etapas na tela" node testar.js jxjtelas` não serve (a `jxjtelas` depende da ordem): rodar `node testar.js jxjtelas`.
Expected: FAIL em "cartas (2026-10-28)" ("4 cartas na mão" ou "carta de postura") e no teste do revamp (custo `jxj-gema-num`).

- [ ] **Step 3: Escrever a carta**

Em `index.html`, logo antes de `function jxjMao(maos,l){`:

```js
/* Carta do Online (2026-10-28, protótipo aprovado pelo dono): cor sólida da
   família, gema em octógono com o custo, ícone grande, faixa com o nome e
   as cópias, caixa de regra. Uma só pra mão, mesa e treino. */
const JXJ_TAM_CARTA={mao:150,mesa:118,postura:84};
function jxjCustoTxt(c){ return c<0?`+${jxjNum2(-c)}`:jxjNum2(c); }
function jxjNum2(x){ return String(Math.round(Number(x||0)*100)/100).replace(".",","); }
function jxjCarta(a,{tam="mao",postura=false,estado=""}={}){
  const f=a.familia,w=JXJ_TAM_CARTA[tam]||150;
  const ciclo=a.ciclo||"",efeito=a.dica||a.resumo||"";
  const nome=postura?JXJ_POSTURAS[f]:a.rotulo;
  const regra=postura?`Mostra que vai de ${a.grupo||JXJ_FAMILIA_TXT[f]}`
    :a.dica?`<span class="jxj-carta-dica">${a.dica}</span>`:`<span class="jxj-carta-ciclo">${ciclo}</span>${efeito?`<span class="jxj-carta-efeito">${efeito}</span>`:""}`;
  const qtd=a.restam!=null&&!postura?`<span class="jxj-carta-qtd">×${a.restam}</span>`:"";
  const custo=a.custo!=null?`<span class="jxj-gema oct" aria-label="${a.custo<0?`recupera ${jxjNum2(-a.custo)} de energia`:`gasta ${jxjNum2(a.custo)} de energia`}"><span class="jxj-gema-num">${jxjCustoTxt(a.custo)}</span></span>`:"";
  return `<span class="jxj-carta f-${f} corte${estado?" "+estado:""}" style="--w:${w}px">
    <span class="jxj-carta-topo">${custo}<small>${a.grupo||JXJ_FAMILIA_TXT[f]}</small></span>
    <span class="jxj-carta-arte">${ICONE(JXJ_ICONE_ACAO[f]||"luta")}</span>
    <span class="jxj-carta-fita"><b>${nome}</b>${qtd}</span>
    <span class="jxj-carta-regra">${regra}</span></span>`;
}
function jxjCartaDaTroca(fam,varId,papel,tam="mesa"){
  const x=varId&&JXJ_DEF.acoes.variantes&&JXJ_DEF.acoes.variantes[varId];
  const pp=x?x.papel:(papel||"pe");
  return jxjCarta({familia:fam,rotulo:x?x.rotulo:((JXJ_DEF.acoes.rotulos[pp]||{})[fam]||fam),grupo:(JXJ_DEF.acoes.familias[pp]||{})[fam],
    ciclo:(JXJ_DEF.acoes.ciclo[pp]||{})[fam]},{tam});
}
function jxjVerso(tam="mesa"){
  return `<span class="jxj-verso corte" style="--w:${JXJ_TAM_CARTA[tam]||118}px"><span class="jxj-verso-oct oct"><span class="oct"></span></span></span>`;
}
```

- [ ] **Step 4: A mão em leque**

No `jxjDesenharCombate`, o ramo `v.etapa==="sinal"` troca a grade `.jxj-posturas` pela mão de cartas de postura:

```js
      const g=el("div","jxj-mao-luta jxj-mao-postura");
      for(const f of JXJ_FAMILIAS){
        const a=(v.acoes||[]).find(x=>x.familia===f);
        if(!a||a.restam===0)continue;
        const b=el("button","jxj-postura jxj-na-mao",jxjCarta(a,{postura:true}));
        b.type="button"; b.title=`Mostrar ${JXJ_POSTURAS[f]}: ele vê antes de escolher`;
        b.onclick=()=>{ SOM.toque(); g.querySelectorAll(".jxj-postura").forEach(x=>{x.disabled=true;}); jxjVoarCarta(b,"jxj-vaga-postura-eu"); enviar(f,"sinal"); };
        g.appendChild(b);
      }
      zona.appendChild(g);
```

E o laço das ações (`for(const a of v.acoes)`) monta cada botão com a carta; os estados viram classes da carta e do botão:

```js
    const g=el("div","jxj-mao-luta"+(maoNova?" mao-nova":"")+(momDec?" no-momento":""));
    for(const a of v.acoes){
      const semCarta=a.restam===0;
      const finta=a.finta>0&&!semCarta,semEnergia=finta&&e[eu].energia<a.finta;
      const custoTxt=a.custo<0?`recupera ${jxjNum(-a.custo)} de energia`:a.custo===0?"não gasta energia":`gasta ${jxjNum(a.custo)} de energia`;
      const miolo=semCarta?`<span class="jxj-carta-vazia corte">${ICONE(JXJ_ICONE_ACAO[a.familia]||"luta")}<b>${a.grupo}</b><small>acabou no round</small></span>`
        :jxjCarta(a,{estado:semEnergia?"apagada":""});
      const b=el("button","jxj-acao jxj-na-mao"+(a.dica?" com-dica":"")+(semCarta?" sem-carta":"")+(finta?" finta":"")+(semEnergia?" sem-energia":""),
        `${finta?`<em class="jxj-finta" aria-label="Finta: gasta mais ${jxjNum2(a.finta)} de energia">−${jxjNum2(a.finta)} finta</em>`:""}${miolo}
        ${semEnergia?`<span class="jxj-carta-tranca">${ICONE("cadeado")}</span>`:""}
        <span class="jxj-acao-bolha">${a.dica?`<i class="dica">${a.dica}</i>`:""}${a.descricao}${a.ciclo?` <i>${a.ciclo}</i>`:""}</span>`);
      b.type="button"; b.title=`${a.dica?a.dica+" ":""}${a.descricao}${a.ciclo?" "+a.ciclo:""} (${custoTxt})`;
      if(semCarta){ b.disabled=true; b.title="Você já usou essa ação neste round."; }
      else if(semEnergia){ b.disabled=true; b.title="Sem energia pra fintar."; }
      /* toque longo: mostra a frase inteira e não manda a ação (como antes) */
      let segura=null,segurou=false;
      b.onpointerdown=ev=>{ if(ev&&ev.pointerType==="mouse")return; segurou=false; segura=setTimeout(()=>{ segurou=true; b.classList.add("segurando"); },450); };
      const soltar=()=>{ clearTimeout(segura); setTimeout(()=>b.classList.remove("segurando"),1800); };
      b.onpointerup=soltar; b.onpointercancel=soltar; b.onpointerleave=soltar;
      b.oncontextmenu=ev=>{ if(ev&&ev.preventDefault)ev.preventDefault(); };
      b.onclick=()=>{ if(segurou){ segurou=false; return; } SOM.toque(); g.querySelectorAll(".jxj-acao").forEach(x=>{x.disabled=true;}); jxjVoarCarta(b,"jxj-vaga-acao-eu"); enviar(a.familia); };
      g.appendChild(b);
    }
```

O ciclo dos 4 ícones em pé (`jxj-ciclo-pe`) e a linha `jxj-acao-ciclo` saem (a carta diz). `jxjVoarCarta` entra na Task 4; até lá, declarar o esqueleto no lugar dela:

```js
function jxjVoarCarta(origem,idDestino){}   // Task 4: o voo da carta até a vaga da mesa
```

- [ ] **Step 5: CSS da carta e da mão**

No fim do bloco do Online em `estilo.css`:

```css
/* ---------- Online em cartas (2026-10-28, protótipo aprovado) ---------- */
.corte{clip-path:polygon(10px 0,calc(100% - 10px) 0,100% 10px,100% calc(100% - 10px),calc(100% - 10px) 100%,10px 100%,0 calc(100% - 10px),0 10px)}
.oct{clip-path:polygon(30% 0,70% 0,100% 30%,100% 70%,70% 100%,30% 100%,0 70%,0 30%)}
.jxj-carta{position:relative;display:flex;flex-direction:column;width:var(--w,150px);height:calc(var(--w,150px) * 1.44);padding:calc(var(--w,150px) * .046);color:var(--tinta);text-align:left;font-family:var(--f-texto)}
.jxj-carta::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(-55deg,rgba(0,0,0,.07) 0 2px,transparent 2px 12px);pointer-events:none}
.jxj-carta.f-golpes{background:#D7261E;--tinta:#fff;--caixa:rgba(60,5,3,.55)}
.jxj-carta.f-queda{background:#D4A017;--tinta:#16120a;--caixa:rgba(60,42,4,.28)}
.jxj-carta.f-defesa{background:#E9E4D8;--tinta:#14161c;--caixa:rgba(20,22,28,.12)}
.jxj-carta.f-pressao{background:#1b1d24;--tinta:var(--osso);--caixa:rgba(215,38,30,.18);box-shadow:inset 0 0 0 2px var(--sangue)}
.jxj-carta-topo{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:4px}
.jxj-carta-topo small{font-family:var(--f-ui);font-weight:800;font-size:calc(var(--w,150px) * .075);letter-spacing:.14em;text-transform:uppercase;text-align:right;line-height:1.1}
.jxj-gema{flex:none;width:calc(var(--w,150px) * .22);height:calc(var(--w,150px) * .22);background:var(--osso);display:flex;align-items:center;justify-content:center}
.jxj-gema-num{width:82%;height:82%;background:#0b0b0d;color:var(--osso);display:flex;align-items:center;justify-content:center;font-family:var(--f-titulo);font-size:calc(var(--w,150px) * .1);clip-path:inherit}
.jxj-carta-arte{position:relative;z-index:1;flex:0 0 34%;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 45%,rgba(255,255,255,.28),transparent 62%)}
.jxj-carta-arte .ico{width:calc(var(--w,150px) * .34);height:calc(var(--w,150px) * .34)}
.jxj-carta-fita{position:relative;z-index:1;margin:2px calc(var(--w,150px) * -.046) 0;background:#0b0b0d;color:var(--osso);display:flex;align-items:center;justify-content:center;gap:6px;padding:4px 3px;white-space:nowrap;overflow:hidden}
.jxj-carta-fita b{font-family:var(--f-titulo);font-weight:400;font-size:calc(var(--w,150px) * .108);text-transform:uppercase;overflow:hidden;text-overflow:ellipsis}
.jxj-carta-qtd{font-family:var(--f-ui);font-weight:800;font-size:calc(var(--w,150px) * .085);color:var(--ouro)}
.jxj-carta-regra{position:relative;z-index:1;flex:1;margin-top:5px;padding:5px 6px;background:var(--caixa);font-size:calc(var(--w,150px) * .074);line-height:1.28;display:flex;flex-direction:column;gap:3px;overflow:hidden}
.jxj-carta-efeito{opacity:.82}
.jxj-carta.apagada{filter:grayscale(.85) brightness(.45)}
.jxj-carta-vazia{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;width:150px;height:216px;border:2px dashed rgba(255,255,255,.18);color:var(--cinza);font-family:var(--f-ui);font-size:13px;letter-spacing:.12em;text-transform:uppercase}
.jxj-carta-vazia .ico{width:30px;height:30px;opacity:.5}
.jxj-carta-tranca{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:7;color:var(--osso)}
.jxj-carta-tranca .ico{width:34px;height:34px}
.jxj-verso{display:flex;align-items:center;justify-content:center;width:var(--w,118px);height:calc(var(--w,118px) * 1.44);background:#0b0b0d;box-shadow:inset 0 0 0 2px var(--sangue);background-image:repeating-linear-gradient(-55deg,rgba(215,38,30,.35) 0 4px,transparent 4px 14px)}
.jxj-verso-oct{width:46%;aspect-ratio:1;background:var(--sangue);display:flex;align-items:center;justify-content:center}
.jxj-verso-oct span{width:82%;height:82%;background:#0b0b0d}
/* a mão em leque */
.jxj-mao-luta{display:flex;justify-content:center;align-items:flex-end;padding:22px 8px 26px;min-height:250px}
.jxj-na-mao{position:relative;margin:0 6px;padding:0;background:none;border:0;cursor:pointer;transition:transform .25s var(--ease-soco);filter:drop-shadow(0 14px 18px rgba(0,0,0,.55))}
.jxj-na-mao:nth-child(1){transform:rotate(-6deg) translateY(12px)}
.jxj-na-mao:nth-child(2){transform:rotate(-2deg) translateY(2px)}
.jxj-na-mao:nth-child(3){transform:rotate(2deg) translateY(2px)}
.jxj-na-mao:nth-child(4){transform:rotate(6deg) translateY(12px)}
.jxj-na-mao:not(:disabled):hover,.jxj-na-mao:not(:disabled):focus-visible{transform:translateY(-26px) rotate(0) scale(1.06);z-index:5}
.jxj-na-mao:disabled{cursor:not-allowed}
.jxj-na-mao .jxj-finta{position:absolute;left:50%;top:-11px;transform:translateX(-50%);z-index:6}
.jxj-na-mao .jxj-acao-bolha{display:none}
.jxj-na-mao.segurando .jxj-acao-bolha{display:block;position:absolute;left:50%;bottom:calc(100% + 10px);transform:translateX(-50%);width:220px;z-index:9;background:var(--sup-2);color:var(--osso-2);padding:8px 10px;font-size:13px;line-height:1.35;border:1px solid var(--linha-forte)}
.jxj-mao-luta.mao-nova .jxj-na-mao{animation:jxjCartaEntra .45s var(--ease-soco) both}
.jxj-mao-luta.mao-nova .jxj-na-mao:nth-child(2){animation-delay:.06s}
.jxj-mao-luta.mao-nova .jxj-na-mao:nth-child(3){animation-delay:.12s}
.jxj-mao-luta.mao-nova .jxj-na-mao:nth-child(4){animation-delay:.18s}
@keyframes jxjCartaEntra{from{opacity:0;translate:0 40px}to{opacity:1;translate:0 0}}
@media (max-width:720px){
  .jxj-mao-luta{padding:16px 2px 18px;min-height:0}
  .jxj-na-mao{margin:0 1px}
  .jxj-na-mao .jxj-carta{--w:86px!important}
  .jxj-na-mao .jxj-carta-vazia{width:86px;height:124px;font-size:10px}
  .jxj-na-mao .jxj-carta-efeito,.jxj-na-mao .jxj-carta-topo small{display:none}
  .jxj-na-mao .jxj-finta{font-size:10px;padding:0 4px}
}
@media (prefers-reduced-motion:reduce){.jxj-na-mao,.jxj-mao-luta.mao-nova .jxj-na-mao{transition:none;animation:none}}
```

Os estilos antigos de `.jxj-acoes-luta`, `.jxj-acao` (o botão retangular) e `.jxj-posturas`/`.jxj-postura` deixam de casar (a classe do container mudou); as regras velhas que miram `.jxj-acao` fora de `.jxj-acoes-luta` precisam de `:not(.jxj-na-mao)` se ainda pintarem fundo ou borda.

- [ ] **Step 6: Rodar e passar**

Run: `node testar.js jxjtelas && node testar.js texto`
Expected: `jxjtelas ok` e `ok`.

- [ ] **Step 7: Commit**

```bash
git add index.html estilo.css testar.js
git commit -m "Online em cartas: a carta e a mão em leque"
git push
```

### Task 2: O placar com a mão dele em cartinhas

**Files:** `index.html` (`jxjMao`, o `lado()` do HUD), `estilo.css`, `testar.js`.

**Interfaces:**
- Produces: `jxjMao(maos, l)` passa a devolver `<span class="jxj-mao jxj-mao-mini">` com 4 `<i class="jxj-mini corte f-<familia>[ zero]">` (ícone e número). A classe `zero` (já usada nos testes) continua na família zerada.

- [ ] **Step 1: Teste**

No teste "mão à vista na tela (v4)", depois de achar `hEle`:

```js
        const minis = (hEle.match(/<i class="jxj-mini corte f-(golpes|queda|defesa|pressao)( zero)?">/g) || []);
        if (minis.length !== 4) throw new Error("mão dele em 4 cartinhas: " + minis.length);
```

- [ ] **Step 2: Rodar e ver falhar** (`node testar.js jxjtelas`; FAIL "mão dele em 4 cartinhas: 0").

- [ ] **Step 3: Implementar**

```js
function jxjMao(maos,l){
  if(!maos||!maos[l])return "";
  const m=maos[l];
  return `<span class="jxj-mao jxj-mao-mini" role="img" aria-label="Ações que restam no round: ${JXJ_FAMILIAS.map(f=>`${JXJ_FAMILIA_TXT[f]} ${m[f]}`).join(", ")}">${JXJ_FAMILIAS.map(f=>`<i class="jxj-mini corte f-${f}${m[f]?"":" zero"}">${ICONE(JXJ_ICONE_ACAO[f]||"luta")}${m[f]}</i>`).join("")}</span>`;
}
```

CSS:

```css
.jxj-mao-mini{display:flex;gap:5px;margin-top:6px}
.jxj-hud-lado.ele .jxj-mao-mini{justify-content:flex-end}
.jxj-mini{width:40px;height:54px;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-style:normal;font-family:var(--f-titulo);font-size:15px;color:var(--tinta)}
.jxj-mini.f-golpes{background:#D7261E;--tinta:#fff}.jxj-mini.f-queda{background:#D4A017;--tinta:#16120a}
.jxj-mini.f-defesa{background:#E9E4D8;--tinta:#14161c}.jxj-mini.f-pressao{background:#1b1d24;--tinta:var(--osso);box-shadow:inset 0 0 0 2px var(--sangue)}
.jxj-mini .ico{width:16px;height:16px}
.jxj-mini.zero{opacity:.28;filter:grayscale(1)}
@media (max-width:720px){.jxj-mini{width:26px;height:36px;font-size:11px}.jxj-mini .ico{width:11px;height:11px}.jxj-mao-mini{gap:3px}}
```

A regra antiga `.jxj-mao i` (linha com `display:inline-flex;...`) e `.jxj-mao i.zero` ficam por baixo; conferir que não brigam (a nova tem mais especificidade com `.jxj-mini`).

- [ ] **Step 4: Rodar** (`node testar.js jxjtelas` → ok) **Step 5: Commit** ("Online em cartas: a mão dele em cartinhas no placar"; push).

### Task 3: A mesa

**Files:** `index.html` (`jxjDesenharCombate`: a mesa entra entre a faixa e o lance), `estilo.css`, `testar.js`.

**Interfaces:**
- Produces: `jxjMesa(v, {eu, ele}, revelar)` → elemento `<section class="jxj-mesa">` com `#jxj-vaga-postura-eu`, `#jxj-vaga-postura-ele`, `#jxj-vaga-acao-eu`, `#jxj-vaga-acao-ele`. `revelar` vem da Task 4 (`null` aqui).
- Regras do que aparece:
  - postura (só luta com `v.etapa`): na etapa do sinal, a minha de frente quando `v.meuSinal` (`jxjCarta` com `postura:true`, `tam:"postura"`), a dele de costas quando `v.adversarioSinalizou`; na etapa da ação, as duas de frente (`v.sinais`). Sem sinal ainda: vaga tracejada ("mostre uma postura" / "esperando").
  - ação: a minha de frente quando `v.minhaAcao` (a carta da `v.acoes` daquela família, `tam:"mesa"`); a dele de costas quando `v.adversarioEscolheu` e de nada antes. Sem ação: vaga.
  - luta v3 (sem `v.etapa`): só as vagas de ação.

- [ ] **Step 1: Teste**

```js
    await conf("mesa (cartas 2026-10-28): a postura dele de costas até a revelação e de frente depois; a ação dele nunca antes da revelação; a minha postura e a minha ação de frente na minha vaga", async () => {
      let vs = await api(u1, "luta", { lutaId: lid });
      if (vs.status !== "andamento") throw new Error("a luta acabou antes");
      if (vs.etapa !== "sinal" || vs.meuSinal || vs.minhaAcao) { for (const u of [u1, u2]) { const v = await api(u, "luta", { lutaId: lid }); if (!v.minhaAcao) await api(u, "acao", { lutaId: lid, round: v.round, troca: v.troca, familia: naMao(v, "defesa") }); } vs = await api(u1, "luta", { lutaId: lid }); }
      const mesaHtml = (nos) => String((nos.filter((n) => tem(n, "jxj-mesa")).pop() || {}).innerHTML || "");
      const famDele = (h) => (h.match(/id="jxj-vaga-(?:postura|acao)-ele"[\s\S]*?(f-(?:golpes|queda|defesa|pressao))/) || [])[1];
      await api(u2, "sinal", { lutaId: lid, round: vs.round, troca: vs.troca, familia: naMao(await api(u2, "luta", { lutaId: lid }), "golpes") });
      let m = await abrir(`luta/${lid}`), h = mesaHtml(desde(m));
      if (!h || !/id="jxj-vaga-postura-ele"[^>]*>\s*<span class="jxj-verso/.test(h)) throw new Error("a postura dele não está de costas: " + h.replace(/\s+/g, " ").slice(0, 300));
      if (famDele(h)) throw new Error("a mesa mostra a família dele antes da revelação: " + famDele(h));
      await api(u1, "sinal", { lutaId: lid, round: vs.round, troca: vs.troca, familia: naMao(vs, "defesa") });
      m = await abrir(`luta/${lid}`); h = mesaHtml(desde(m));
      if (!/id="jxj-vaga-postura-ele"[\s\S]*?f-golpes/.test(h) || !/id="jxj-vaga-postura-eu"[\s\S]*?f-defesa/.test(h)) throw new Error("posturas reveladas: " + h.replace(/\s+/g, " ").slice(0, 300));
      if (/id="jxj-vaga-acao-ele"[^>]*>\s*<span class="jxj-(verso|carta)/.test(h)) throw new Error("ação dele na mesa antes de ele jogar");
      await api(u1, "acao", { lutaId: lid, round: vs.round, troca: vs.troca, familia: "defesa" });
      m = await abrir(`luta/${lid}`); h = mesaHtml(desde(m));
      if (!/id="jxj-vaga-acao-eu"[^>]*>\s*<span class="jxj-carta f-defesa/.test(h)) throw new Error("a minha ação não foi pra minha vaga");
      semLixoV3(htmlDe(desde(m)), "mesa");
    });
```

- [ ] **Step 2: Rodar e ver falhar** ("a postura dele não está de costas" com `h` vazio).

- [ ] **Step 3: Implementar** (`jxjMesa`, e chamar em `jxjDesenharCombate` logo depois da faixa):

```js
/* A mesa (2026-10-28): de cada lado, a vaga da postura e a da ação. A ação
   dele só aparece de costas quando a vista diz que ele escolheu (regra da
   fase 2) e nunca de frente antes da revelação. */
function jxjMesa(v,{eu,ele},revelar){
  const mesa=el("section","jxj-mesa"+(v.etapa?" com-postura":""));
  const vaga=(id,txt,tam)=>`<span class="jxj-vaga" id="${id}" style="--w:${JXJ_TAM_CARTA[tam]}px">${txt?`<small>${txt}</small>`:""}</span>`;
  const encher=(id,txt,html)=>html?`<span class="jxj-vaga cheia" id="${id}">${html}</span>`:vaga(id,txt,id.includes("postura")?"postura":"mesa");
  const acaoDe=f=>(v.acoes||[]).find(x=>x.familia===f);
  const coluna=(l)=>{
    const souEu=l===eu;
    let rotP="",post=null;
    if(v.etapa){
      if(v.etapa==="sinal"){
        if(souEu&&v.meuSinal){ post=jxjCarta(acaoDe(v.meuSinal)||{familia:v.meuSinal},{tam:"postura",postura:true}); rotP=`você mostrou <b>${JXJ_POSTURAS[v.meuSinal]}</b>`; }
        else if(!souEu&&v.adversarioSinalizou){ post=jxjVerso("postura"); rotP="ele já mostrou"; }
        else rotP=souEu?"sua postura":"postura dele";
      }else if(v.sinais){
        const f=v.sinais[l];
        post=souEu?jxjCarta(acaoDe(f)||{familia:f},{tam:"postura",postura:true})
          :jxjCarta({familia:f,grupo:(JXJ_DEF.acoes.familias[v.papel==="cima"?"baixo":v.papel==="baixo"?"cima":"pe"]||{})[f]},{tam:"postura",postura:true});
        rotP=`${souEu?"você":"ele"} mostrou <b>${JXJ_POSTURAS[f]}</b>`;
      }
    }
    let acao=null,rotA=souEu?"sua ação":"ação dele";
    if(revelar)acao=revelar[l];
    else if(souEu&&v.minhaAcao)acao=jxjCarta(acaoDe(v.minhaAcao)||{familia:v.minhaAcao},{tam:"mesa"});
    else if(!souEu&&v.adversarioEscolheu)acao=jxjVerso("mesa");
    const c=el("div","jxj-mesa-lado "+(souEu?"eu":"ele"));
    c.innerHTML=(v.etapa?`<span class="jxj-mesa-slot postura"><span class="jxj-rotulo-mesa">${rotP}</span>${encher(souEu?"jxj-vaga-postura-eu":"jxj-vaga-postura-ele",souEu?"toque numa carta":"",post)}</span>`:"")
      +`<span class="jxj-mesa-slot acao"><span class="jxj-rotulo-mesa">${rotA}</span>${encher(souEu?"jxj-vaga-acao-eu":"jxj-vaga-acao-ele","",acao)}</span>`;
    return c;
  };
  mesa.append(coluna(eu),el("span","jxj-mesa-vs",""),coluna(ele));
  return mesa;
}
```

(O papel dele na mesa: `JXJ_DEF.acoes.familias` indexado pelo papel dele, que é o oposto do meu no chão.)

No `jxjDesenharCombate`, depois de `tela.appendChild(faixa);`: `if(v.maos)tela.appendChild(jxjMesa(v,{eu,ele},opts.revelar||null));`, com `opts` vindo do 5º parâmetro (`{nova,maoNova,revelar}`). A faixa do momento decisivo passa pra antes da mesa.

CSS:

```css
.jxj-mesa{position:relative;display:grid;grid-template-columns:1fr 40px 1fr;align-items:center;justify-items:center;padding:20px 12px;min-height:290px;background:radial-gradient(ellipse at 50% 50%,rgba(215,38,30,.14),transparent 62%)}
.jxj-mesa::before{content:"";position:absolute;left:50%;top:50%;width:min(520px,92%);height:min(280px,90%);transform:translate(-50%,-50%);border:2px solid rgba(255,255,255,.06);clip-path:polygon(25% 0,75% 0,100% 30%,100% 70%,75% 100%,25% 100%,0 70%,0 30%);background:rgba(255,255,255,.015)}
.jxj-mesa-lado{position:relative;z-index:1;display:flex;align-items:center;gap:14px}
.jxj-mesa-lado.ele{flex-direction:row-reverse}
.jxj-mesa-slot{display:flex;flex-direction:column;align-items:center;gap:8px}
.jxj-rotulo-mesa{min-height:16px;font-family:var(--f-ui);font-weight:700;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--cinza);text-align:center}
.jxj-rotulo-mesa b{color:var(--osso)}
.jxj-vaga{display:flex;align-items:center;justify-content:center;text-align:center;padding:6px;width:var(--w);height:calc(var(--w) * 1.44);border:2px dashed rgba(255,255,255,.14)}
.jxj-vaga.cheia{border:0;padding:0;width:auto;height:auto;filter:drop-shadow(0 14px 18px rgba(0,0,0,.6))}
.jxj-vaga small{font-family:var(--f-ui);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--cinza)}
@media (max-width:720px){
  .jxj-mesa{grid-template-columns:1fr 12px 1fr;padding:14px 4px;min-height:0}
  .jxj-mesa-lado{flex-direction:column-reverse;gap:8px}.jxj-mesa-lado.ele{flex-direction:column-reverse}
  .jxj-mesa .jxj-carta,.jxj-mesa .jxj-verso{--w:78px!important}
  .jxj-mesa .postura .jxj-carta,.jxj-mesa .postura .jxj-verso,.jxj-mesa .postura .jxj-vaga{--w:58px!important}
  .jxj-mesa .jxj-carta-regra,.jxj-mesa .jxj-carta-topo small{display:none}
}
```

- [ ] **Step 4: Rodar** (`node testar.js jxjtelas` → ok). **Step 5: Commit** ("Online em cartas: a mesa"; push).

### Task 4: A revelação e as animações

**Files:** `index.html` (`jxjTelaLuta`: estado da revelação; `jxjDesenharCombate`: passa `revelar`; `jxjVoarCarta`; `jxjAnimarRevelacao`), `estilo.css`, `testar.js`.

**Interfaces:**
- Produces:
  - `JXJ_REVELACAO_MS` (2600): quanto tempo a mesa mostra as cartas da troca que acabou. Os testes trocam por `vm.runInContext`.
  - Estado em `jxjTelaLuta`: `revelacao={i:<índice da troca>, desde:Date.now(), animou:false}`, criado quando `novas.length>0`; `desenhar` passa `revelar=jxjRevelar(vista,lados(),revelacao)` enquanto `Date.now()-revelacao.desde<JXJ_REVELACAO_MS` e agenda um redesenho no fim (guardado pelo token).
  - `jxjRevelar(v,{eu,ele},rev)` → `{a:html, b:html, animar:boolean, ev:[...]}` com as duas cartas da troca (`jxjCartaDaTroca(acaoA, varA, ...)`), classes `vira aberta` (`animar` true só no primeiro desenho), `venceu`/`perdeu` pelo evento `leu`, carimbo `jxj-carimbo-finta` na de quem fintou.
  - `jxjVoarCarta(botao, idDaVaga)`: clone fixo da carta voando até a vaga em 0,45 s; nada se `reduceMotion()` ou se `getBoundingClientRect` não existir; o clone some sozinho.

- [ ] **Step 1: Teste**

```js
    await conf("revelação (cartas 2026-10-28): a troca que acabou aparece na mesa com as duas cartas jogadas, a que leu com brilho e a outra apanhando, o número do dano e o carimbo FINTA; redesenhar no meio não reinicia; depois do tempo a mesa volta pra troca nova; com menos movimento, nada anima", async () => {
      vm.runInContext("JXJ_REVELACAO_MS=60000", env.sandbox);
      let vs = await api(u1, "luta", { lutaId: lid });
      if (vs.status !== "andamento") throw new Error("a luta acabou antes");
      const eu = vs.lado;
      for (const u of [u1, u2]) { const v = await api(u, "luta", { lutaId: lid }); if (v.etapa === "sinal" && !v.meuSinal) await api(u, "sinal", { lutaId: lid, round: v.round, troca: v.troca, familia: naMao(v, u === u1 ? "defesa" : "golpes") }); }
      const m = await abrir(`luta/${lid}`);
      await api(u2, "acao", { lutaId: lid, round: vs.round, troca: vs.troca, familia: naMao(await api(u2, "luta", { lutaId: lid }), "pressao") });
      await api(u1, "acao", { lutaId: lid, round: vs.round, troca: vs.troca, familia: "defesa" });
      for (const ate = Date.now() + 8000; Date.now() < ate && !desde(m).some((n) => tem(n, "jxj-mesa") && /jxj-revelada/.test(String(n.innerHTML)));) await assentar(60);
      const t = (await api(u1, "luta", { lutaId: lid })).trocas.pop();
      const mesa = desde(m).filter((n) => tem(n, "jxj-mesa")).pop(), h = String(mesa.innerHTML);
      const famEu = eu === "a" ? t.acaoA : t.acaoB, famEle = eu === "a" ? t.acaoB : t.acaoA;
      if (!new RegExp(`id="jxj-vaga-acao-eu"[\\s\\S]*?f-${famEu}`).test(h) || !new RegExp(`id="jxj-vaga-acao-ele"[\\s\\S]*?f-${famEle}`).test(h)) throw new Error("as cartas da troca na mesa: " + h.replace(/\s+/g, " ").slice(0, 300));
      const leu = (t.ev || []).find((x) => x.tipo === "leu");
      if (leu && !/class="jxj-revelada[^"]*venceu/.test(h)) throw new Error("quem leu sem brilho");
      if ((t.ev || []).some((x) => x.tipo === "finta") && !/jxj-carimbo-finta/.test(h)) throw new Error("finta sem carimbo");
      if (!/vira aberta anima/.test(h)) throw new Error("a primeira vez não anima");
      await assentar(60);   // redesenho no meio: sem animar de novo, mas ainda revelando
      const h2 = String(desde(m).filter((n) => tem(n, "jxj-mesa")).pop().innerHTML);
      if (!/jxj-revelada/.test(h2) || /vira aberta anima/.test(h2)) throw new Error("o redesenho reiniciou a revelação");
      vm.runInContext("JXJ_REVELACAO_MS=0", env.sandbox);
      const m2 = await abrir(`luta/${lid}`);
      if (/jxj-revelada/.test(htmlDe(desde(m2).filter((n) => tem(n, "jxj-mesa"))))) throw new Error("a revelação ficou depois do tempo");
      vm.runInContext("JXJ_REVELACAO_MS=2600", env.sandbox);
    });
    await conf("voo da carta (cartas 2026-10-28): tocar a carta manda uma ação só, mesmo com clique duplo; sem medida de tela (DOM falso, celular sem layout), o envio segue", async () => {
      let vs = await api(u1, "luta", { lutaId: lid });
      for (const u of [u1, u2]) { const v = await api(u, "luta", { lutaId: lid }); if (v.etapa === "sinal" && !v.meuSinal) await api(u, "sinal", { lutaId: lid, round: v.round, troca: v.troca, familia: naMao(v, "defesa") }); }
      vs = await api(u1, "luta", { lutaId: lid });
      const m = await abrir(`luta/${lid}`);
      const carta = desde(m).filter((n) => tem(n, "jxj-acao") && !n.disabled)[0];
      carta.onclick(); carta.onclick(); await assentar(20);
      const linhas = (await db.query("select count(*)::int as n from jxj_acoes where luta_id = $1 and round = $2 and troca = $3 and lado = $4", [lid, vs.round, vs.troca, vs.lado])).rows[0].n;
      if (linhas !== 1) throw new Error("ações gravadas: " + linhas);
    });
```

- [ ] **Step 2: Rodar e ver falhar** ("as cartas da troca na mesa" ou timeout procurando `jxj-revelada`).

- [ ] **Step 3: Implementar**

Em `jxjTelaLuta`, junto do estado (`let trocasVistas=null,...`): `let revelacao=null,fimRevelacao=null;`. Em `desenhar`, depois de calcular `novas`:

```js
    if(novas.length)revelacao={i:todas.length-1,desde:Date.now(),animou:false};
    const revelando=revelacao&&vista.status==="andamento"&&Date.now()-revelacao.desde<JXJ_REVELACAO_MS;
    const revelar=revelando?jxjRevelar(vista,lados(),todas[revelacao.i],!revelacao.animou):null;
    if(revelar){ revelacao.animou=true; clearTimeout(fimRevelacao);
      fimRevelacao=setTimeout(()=>{ if(tk===JXJ_TOKEN&&vista&&vista.status==="andamento")desenhar(); },Math.max(0,JXJ_REVELACAO_MS-(Date.now()-revelacao.desde))+20); }
```

(Com menos movimento a revelação aparece igual, só sem a classe `anima`.)

A queda da carta dele: `jxjTelaLuta` guarda `escolheuVisto` (o `adversarioEscolheu` do desenho anterior, zerado a cada troca nova) e passa `soltou:true` só no desenho em que ele vira `true`; `jxjMesa` põe a classe `cai` no verso da ação dele nesse desenho (`@keyframes jxjCai{from{translate:0 -60px;opacity:0}to{translate:0 0;opacity:1}}`, `.jxj-vaga.cheia .cai{animation:jxjCai .38s var(--ease-soco)}`), e redesenhar depois não repete.

E passar `revelar` no 5º argumento de `jxjDesenharCombate`: `{nova:novas.length>0,maoNova,revelar}`. Fora:

```js
let JXJ_REVELACAO_MS=2600;
function jxjRevelar(v,{eu,ele},t,animar){
  if(!t||!t.acaoA||!t.acaoB)return null;
  const leu=(t.ev||[]).find(x=>x.tipo==="leu"),fintou=l=>(t.ev||[]).some(x=>x.tipo==="finta"&&x.quem===l);
  const levou=l=>(t.ev||[]).filter(x=>x.quem&&x.quem!==l&&typeof x.dano==="number").reduce((s,x)=>s+x.dano,0);
  const anima=animar&&!reduceMotion()?" anima":"";
  const lado=l=>{
    const fam=l==="a"?t.acaoA:t.acaoB,vr=l==="a"?t.varA:t.varB;
    const res=leu?(leu.quem===l?" venceu":" perdeu"):"",d=levou(l);
    return `<span class="jxj-revelada${res}"><span class="vira aberta${anima}"><span class="gira"><span class="face verso">${jxjVerso("mesa")}</span><span class="face frente">${jxjCartaDaTroca(fam,vr,null,"mesa")}</span></span></span>`
      +(fintou(l)?`<span class="jxj-carimbo-finta${anima}">FINTA</span>`:"")
      +(d?`<span class="jxj-pop dano${anima}">−${jxjNum(d)}</span>`:"")+`</span>`;
  };
  return {a:lado("a"),b:lado("b")};
}
function jxjVoarCarta(origem,idDestino){
  try{
    if(reduceMotion()||!origem||!origem.getBoundingClientRect)return;
    const destino=document.getElementById(idDestino); if(!destino||!destino.getBoundingClientRect)return;
    const carta=origem.querySelector&&origem.querySelector(".jxj-carta"); if(!carta)return;
    const a=carta.getBoundingClientRect(),b=destino.getBoundingClientRect(); if(!a.width||!b.width)return;
    const v=document.createElement("div"); v.className="jxj-voando"; v.innerHTML=carta.outerHTML;
    Object.assign(v.style,{left:a.left+"px",top:a.top+"px",width:a.width+"px"});
    document.body.appendChild(v);
    requestAnimationFrame(()=>{ Object.assign(v.style,{left:b.left+"px",top:b.top+"px",transform:`scale(${b.width/a.width})`}); });
    setTimeout(()=>v.remove(),500);
  }catch(e){}
}
```

O clique duplo: o `onclick` já desliga os botões da mão na hora (Task 1); o `enviar` da `jxjTelaLuta` tem a trava `enviando`. O teste confere as duas.

CSS:

```css
.vira{position:relative;display:block;width:var(--w,118px);height:calc(var(--w,118px) * 1.44);perspective:900px}
.vira .gira{position:absolute;inset:0;transform-style:preserve-3d;transform:rotateY(180deg)}
.vira .face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.vira .face.frente{transform:rotateY(180deg)}
.vira.anima .gira{animation:jxjVira .55s var(--ease-soco) .35s both}
@keyframes jxjVira{from{transform:rotateY(0)}to{transform:rotateY(180deg)}}
.jxj-revelada{position:relative;display:block}
.jxj-revelada.venceu{filter:drop-shadow(0 0 18px rgba(212,160,23,.9))}
.jxj-revelada.perdeu .vira{filter:brightness(.55) grayscale(.4)}
.jxj-revelada.perdeu .vira.anima{animation:jxjApanha .5s 1s}
@keyframes jxjApanha{0%,100%{transform:none}25%{transform:translateX(-8px) rotate(-3deg)}50%{transform:translateX(6px) rotate(2deg)}75%{transform:translateX(-3px)}}
.jxj-carimbo-finta{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%) rotate(-12deg);z-index:4;background:#0b0b0d;color:var(--sangue-vivo);border:2px solid var(--sangue-vivo);font-family:var(--f-titulo);font-size:18px;letter-spacing:.06em;padding:2px 10px;pointer-events:none}
.jxj-carimbo-finta.anima{animation:jxjCarimbo .35s var(--ease-soco) 1s both}
@keyframes jxjCarimbo{from{transform:translate(-50%,-50%) rotate(-12deg) scale(2.2);opacity:0}to{transform:translate(-50%,-50%) rotate(-12deg) scale(1);opacity:1}}
.jxj-pop{position:absolute;left:50%;top:6px;transform:translateX(-50%);z-index:5;font-family:var(--f-titulo);font-size:26px;color:var(--ganho);text-shadow:0 2px 8px #000;pointer-events:none}
.jxj-pop.dano{color:var(--sangue-vivo)}
.jxj-pop.anima{animation:jxjSobe 1.4s var(--ease-soco) 1s both}
@keyframes jxjSobe{0%{translate:0 10px;opacity:0}20%{translate:0 0;opacity:1}100%{translate:0 -46px;opacity:0}}
.jxj-voando{position:fixed;z-index:100;pointer-events:none;transform-origin:top left;transition:left .45s var(--ease-soco),top .45s var(--ease-soco),transform .45s var(--ease-soco)}
.jxj-iniciativa.muda{animation:jxjPulsa .8s var(--ease-soco)}
@keyframes jxjPulsa{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.15);opacity:1}100%{transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.vira .gira,.jxj-revelada .vira,.jxj-carimbo-finta,.jxj-pop,.jxj-voando,.jxj-iniciativa{animation:none!important;transition:none!important}}
```

A ficha da iniciativa ganha a classe `muda` quando a troca nova tem o evento `iniciativa` (no `jxjDesenharCombate`, olhando `ult.ev`) e `opts.nova`.

- [ ] **Step 4: Rodar** (`node testar.js jxjtelas` → ok, incluindo o teste antigo "troca resolvida", que continua achando `jxj-ultima` com `nova`). **Step 5: Commit** ("Online em cartas: a revelação e as animações"; push).

### Task 5: Lance, espera, dicas, momento e a luta v3

**Files:** `index.html` (`jxjDesenharCombate`), `estilo.css`, `testar.js`.

- O lance (`jxj-ultima jxj-lance`) vem depois da mesa, numa faixa: "Você leu" / "Ele leu" / "Ninguém leu" (verde, vermelho, cinza), a linha `jxj-duelo` com os dois nomes e as marcas de dano e finta (as mesmas de hoje), a narração ao vivo e os eventos. Mantém `nova`.
- A espera ("Você mostrou…", "Ação enviada: <b>…</b>…") e as dicas da primeira luta ficam numa linha `jxj-zona-topo` em cima da mão.
- O momento decisivo (`jxjFaixaMomento`) fica em cima da mesa.
- A luta v3 (sem `v.maos`): sem mesa de postura, as ações em cartas, o trilho do momento na faixa (como hoje).

- [ ] **Step 1: Teste** (luta v3 e lixo):

```js
    await conf("luta v3 e luta encerrada na tela de cartas: sem mesa de postura, as ações em cartas, o trilho do momento; o resultado abre sem lixo", async () => {
      const mexer = async (fn) => { const r = (await db.query("select estado from jxj_lutas where id = $1", [lid])).rows[0]; fn(r.estado); await db.query("update jxj_lutas set estado = $2::jsonb where id = $1", [lid, JSON.stringify(r.estado)]); };
      let guardado = null;
      await mexer((e) => { guardado = { mao: e.mao, v: e.v, iniciativa: e.iniciativa }; delete e.mao; delete e.iniciativa; e.v = 3; });
      const m = await abrir(`luta/${lid}`), nos = desde(m);
      await mexer((e) => { e.mao = guardado.mao; e.v = guardado.v; e.iniciativa = guardado.iniciativa; });
      const h = htmlDe(nos);
      if (/jxj-vaga-postura/.test(h)) throw new Error("luta v3 com mesa de postura");
      if (!nos.some((n) => tem(n, "jxj-acao")) || !/class="jxj-momento"/.test(h)) throw new Error("luta v3: cartas e trilho do momento");
      semLixoV3(h, "luta v3");
    });
```

- [ ] **Step 2: Rodar e ver falhar** (se a v3 quebrar; se passar de primeira, provar o dente: tirar o `if(v.maos)` da mesa e ver falhar, depois voltar). **Step 3: Implementar.** **Step 4: Rodar** `node testar.js jxjtelas`, `node testar.js texto`, `node testar.js rotas`. **Step 5: Commit** (push).

### Task 6: O resultado em cartas

**Files:** `index.html` (`jxjDesenharResultado`), `estilo.css`, `testar.js`.

- O bloco "Cartões" vira uma fileira de cartinhas de round (`jxj-cartao-round corte`, uma por round: "R1", "10 a 9", verde quando você levou, vermelho quando ele levou, osso no empate).
- No cabeçalho, quando a luta acabou por nocaute, finalização ou W.O., a carta da última troca de quem venceu (`jxjCartaDaTroca`, `tam:"mesa"`) ao lado do título, com o brilho.
- O resto (o que mudou, narração, auditoria, revanche, troca a troca) fica como está.

- [ ] **Step 1: Teste**

```js
    await conf("resultado em cartas (2026-10-28): os cartões dos rounds em cartinhas com quem levou; nocaute e finalização mostram a carta que decidiu", async () => {
      const r = await db.query("select id from jxj_lutas where status = 'encerrada' and (a_user = $1 or b_user = $1) order by id desc limit 1", [u1]);
      if (!r.rows.length) throw new Error("sem luta encerrada pra abrir");
      const m = await abrir(`luta/${r.rows[0].id}`), nos = desde(m), h = htmlDe(nos);
      const v = await api(u1, "luta", { lutaId: r.rows[0].id });
      const rounds = (v.estado && v.estado.cartoes || []).length;
      if ((h.match(/class="jxj-cartao-round corte/g) || []).length !== rounds) throw new Error("cartinhas de round: " + rounds);
      if (["KO", "TKO", "FIN"].includes(v.resultado.metodo) && !/jxj-resultado-carta/.test(h)) throw new Error("sem a carta que decidiu");
      semLixoV3(h, "resultado");
    });
```

- [ ] **Step 2: ver falhar; Step 3: implementar; Step 4:** `node testar.js jxjtelas`; **Step 5:** commit e push.

### Task 7: Checklist em duas janelas, documentação e bateria

- Script `scratchpad/pp/cartas-check.mjs` (mesma base do `v4f34-check.mjs`): luta striker x counter (computador 1360 e celular 390) e luta contra bot até o fim. Conferir e fotografar: etapa da postura (cartas de postura, vaga), revelação das posturas, ação com finta e iniciativa, a mesa com a carta dele de costas (contra bot), a revelação (prints 300 ms e 1,6 s depois da troca), o celular sem rolagem horizontal (`document.documentElement.scrollWidth <= 390`), o resultado. Nenhum erro de página.
- LEIA-ME: seção "Online em cartas (2026-10-28)" (componentes, o que não mudou, a revelação, o voo, os testes). CLAUDE.md: um parágrafo na lista do Online. PENDENCIAS: item novo com a Parte 1 feita e a Parte 2 pendente.
- `node testar.js` completo verde (em background); commit e push da branch. Deploy só quando o dono mandar.
