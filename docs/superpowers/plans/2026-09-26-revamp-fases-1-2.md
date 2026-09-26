# Revamp — Fases 1 e 2 (Fundação + Menu e páginas) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Identidade "Noite de Luta" instalada (tokens, fontes, ícones SVG, imagens duotone, transição), roteador por hash com Voltar em toda tela e 404, e o menu novo de 5 cards com as páginas Atualizações, Ranking, Conta, Continuar, Créditos, Termos e Privacidade rodando no navegador, pronto pro checkpoint visual do dono.

**Architecture:** CSS antigo sai do `<style>` do `index.html` para `legado.css` sem nenhuma alteração (some na fase 5); visual novo mora em `estilo.css`. JS novo entra no MESMO `<script>` do `index.html`, num bloco "INTERFACE NOVA" logo antes de `boot()`. Telas novas nascem de um molde único (`montarTela`) e são abertas por um roteador de hash (`irPara`/`registrarRota`). Nomes antigos (`screenInicio`, `screenConta`, `screenHistorico`, `screenPlanoPro`) viram atalhos pro roteador, pra não quebrar chamadas e testes existentes. Fluxo de nova carreira continua o antigo (`screenName`) até a fase 4.

**Tech Stack:** HTML/CSS/JS puro sem build, Supabase JS v2 (CDN), Google Fonts, sprite SVG de ícones Lucide (ISC), Python 3 + Pillow + numpy (tratamento de imagem), OpenRouter (`google/gemini-3-pro-image`), puppeteer-core com o Chrome instalado (screenshots de verificação, fora do repositório).

**Spec:** `docs/superpowers/specs/2026-09-26-revamp-ui-design.md`

## Global Constraints

- Português brasileiro em texto e comentário de código.
- Texto novo visível: zero travessão (`—` e `–`); nada de frase de efeito ("não é X, é Y", fecho em aforismo, "de verdade" como reforço, trio de adjetivos, pergunta retórica chamando pra ação, exclamação em série).
- Ícone só do sprite SVG (`ICONE(nome)`); nenhum emoji nem caractere unicode fazendo papel de ícone.
- Paleta exata: `--fundo:#07080B` `--sup:#11131A` `--sup-2:#1A1D26` `--linha:rgba(255,255,255,.08)` `--sangue:#D7261E` `--sangue-escuro:#7A0F0B` `--ouro:#D4A017` `--osso:#F2EEE6` `--cinza:#8A8F9C` `--ganho:#2FBF71`.
- Fontes: Anton (títulos), Barlow Condensed (interface), Barlow (texto). Sem `border-radius` em CSS novo.
- Hover só dentro de `@media (hover:hover) and (pointer:fine)`; `prefers-reduced-motion: reduce` = só fade.
- Imagem: nenhum rosto reconhecível, nenhuma pessoa real, nenhuma marca UFC.
- `testar.js`: classe sempre por token (`(n.className||"").split(" ").includes("x")`), nunca `className === "x"`.
- Nenhum `<script>` sem atributo antes do motor no HTML.
- Todo `replace` de texto em script Python usa `assert trecho in s` antes.
- Branch `revamp-ui`. Todo commit seguido de `git push` no mesmo comando. **Nunca `vercel --prod` nesta branch.**
- Testes por tarefa: suítes da área (`rotas`, `interface`, `inicial`) em primeiro plano; `node testar.js` completo (~25 min) em background no fim da fase (Task 11).
- Commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: `legado.css`, `estilo.css` vazio, fontes novas e ferramenta de screenshot

**Files:**
- Create: `legado.css` (conteúdo exato do `<style>` atual)
- Create: `estilo.css` (só cabeçalho nesta tarefa)
- Modify: `index.html` (bloco `<style>…</style>` do `<head>` vira dois `<link>`; link do Google Fonts)
- Create (fora do repo): `$SCRATCH/print/print.mjs`, onde `SCRATCH=/private/tmp/claude-501/-Users-giovanecabral-draft-ufc/30368fa6-b9bb-4c63-bb45-8a8eef495444/scratchpad`

**Interfaces:**
- Produces: `legado.css` e `estilo.css` carregados nessa ordem; `print.mjs <url> <prefixo> [larguras] [script.js]` gera `<prefixo>-<largura>.png` e imprime o overflow horizontal de cada largura.

- [ ] **Step 1: Mover o CSS com verificação byte a byte**

```bash
cd /Users/giovanecabral/draft-ufc && python3 - <<'EOF'
p="index.html"
s=open(p,encoding="utf-8").read()
corpo=s.index("<body>")
a=s.index("<style>\n")
assert a<corpo, "o primeiro <style> tem que estar no <head>"
b=s.index("</style>\n",a)
assert b<corpo
css=s[a+len("<style>\n"):b]
cab=("/* legado.css: CSS da interface ANTIGA, movido do <style> do index.html\n"
     "   sem nenhuma alteração (revamp 2026-09-26). Some quando a última tela\n"
     "   antiga for trocada (fase 5). Nada novo entra aqui: visual novo mora\n"
     "   em estilo.css. */\n")
open("legado.css","w",encoding="utf-8").write(cab+css)
novo=s[:a]+'<link rel="stylesheet" href="legado.css">\n<link rel="stylesheet" href="estilo.css">\n'+s[b+len("</style>\n"):]
assert novo.count('href="legado.css"')==1
open(p,"w",encoding="utf-8").write(novo)
assert open("legado.css",encoding="utf-8").read()[len(cab):]==css
print("css movido:",len(css),"bytes")
EOF
```

- [ ] **Step 2: Criar `estilo.css` com o cabeçalho**

```css
/* estilo.css: identidade "Noite de Luta" (revamp 2026-09-26).
   Spec: docs/superpowers/specs/2026-09-26-revamp-ui-design.md
   Todo visual NOVO mora aqui. legado.css só existe até a última tela
   antiga ser trocada. Carregado DEPOIS do legado.css: em empate de
   especificidade, o novo vence. */
```

- [ ] **Step 3: Fontes novas no link do Google Fonts**

```bash
cd /Users/giovanecabral/draft-ufc && python3 - <<'EOF'
p="index.html"; s=open(p,encoding="utf-8").read()
velho='family=Oswald:wght@500;700&family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&display=swap'
novo=('family=Anton&family=Barlow+Condensed:wght@500;600;700;800'
      '&family=Barlow:ital,wght@0,400;0,500;0,600;1,400'
      '&family=Oswald:wght@500;700&family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&display=swap')
assert s.count(velho)==1
open(p,"w",encoding="utf-8").write(s.replace(velho,novo))
EOF
```

Oswald e IBM Plex Mono continuam até a fase 5 (telas antigas ainda usam).

- [ ] **Step 4: Atualizar o comentário que cita "fim do <style>"**

Run: `grep -n "fim do <style>" index.html` e troque `<style>` por `legado.css` nessa linha de comentário (é só referência de onde o CSS mora).

- [ ] **Step 5: Ferramenta de screenshot (fora do repo)**

```bash
S=/private/tmp/claude-501/-Users-giovanecabral-draft-ufc/30368fa6-b9bb-4c63-bb45-8a8eef495444/scratchpad
mkdir -p $S/print && cd $S/print && npm init -y >/dev/null && npm i puppeteer-core@24 >/dev/null && echo ok
```

`$S/print/print.mjs`:

```js
// uso: node print.mjs <url> <prefixo> [larguras=1440,820,380] [script-antes.js]
import puppeteer from "puppeteer-core";
import fs from "fs";
const [,, url, prefixo = "shot", larguras = "1440,820,380", scriptAntes] = process.argv;
const antes = scriptAntes ? fs.readFileSync(scriptAntes, "utf8") : null;
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new", args: ["--hide-scrollbars"],
});
for (const w of larguras.split(",").map(Number)) {
  const page = await browser.newPage();
  const erros = [];
  page.on("pageerror", e => erros.push(e.message));
  await page.setViewport({ width: w, height: w < 500 ? 820 : 900, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle0" });
  if (antes) await page.evaluate(antes);
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: `${prefixo}-${w}.png`, fullPage: true });
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${w}px  overflow-x=${ov}${erros.length ? "  ERROS: " + erros.join(" | ") : ""}`);
  await page.close();
}
await browser.close();
```

- [ ] **Step 6: Provar que nada mudou visualmente**

```bash
S=/private/tmp/claude-501/-Users-giovanecabral-draft-ufc/30368fa6-b9bb-4c63-bb45-8a8eef495444/scratchpad
cd /Users/giovanecabral/draft-ufc && git worktree add -f $S/master-ref master >/dev/null 2>&1
(cd $S/master-ref && python3 -m http.server 8001 >/dev/null 2>&1 &) ; (python3 -m http.server 8000 >/dev/null 2>&1 &)
sleep 1
cd $S/print && node print.mjs http://localhost:8001/ antes 1440 && node print.mjs http://localhost:8000/ depois 1440
python3 -c "
from PIL import Image, ImageChops
a=Image.open('antes-1440.png').convert('RGB'); b=Image.open('depois-1440.png').convert('RGB')
print('tamanhos',a.size,b.size); print('diferença:',ImageChops.difference(a,b).getbbox())"
```

Expected: `diferença: None` (idêntico). Se aparecer bbox, a extração do CSS perdeu algo: `git diff index.html` e compare.

- [ ] **Step 7: Suítes da área**

Run: `node testar.js interface && node testar.js inicial`
Expected: as duas `ok` (CSS não entra no teste; isto prova que o `<script>` continua sendo achado por `lerScript()`).

- [ ] **Step 8: Commit + push**

```bash
git add legado.css estilo.css index.html && git commit -q -m "Revamp fase 1: CSS antigo vai pra legado.css sem mudança, estilo.css nasce, fontes novas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push -q
```

---

### Task 2: Sprite de ícones SVG (Lucide, ISC)

**Files:**
- Create: `img/icones.svg`
- Create: `img/LICENCAS.md`
- Create (fora do repo): `$SCRATCH/icones/montar.py`

**Interfaces:**
- Produces: símbolos com estes ids, usados por `ICONE(nome)`: `seta-esq seta-dir chevron-dir cadeado engrenagem som mudo usuario trofeu medalha lixeira relogio nuvem-ok nuvem-off mais check fechar play pausa lista loja camera estrela jornal grafico coroa reenviar email sair chave luta treino painel menu raio chama lesao carteira seguidores info alerta`.

- [ ] **Step 1: Baixar o pacote e montar o sprite**

```bash
S=/private/tmp/claude-501/-Users-giovanecabral-draft-ufc/30368fa6-b9bb-4c63-bb45-8a8eef495444/scratchpad
mkdir -p $S/icones && cd $S/icones && npm pack lucide-static@latest >/dev/null && tar xzf lucide-static-*.tgz && ls package/icons | wc -l && cat package/package.json | grep '"version"'
```

`$S/icones/montar.py`:

```python
import re, sys, os
PASTA, SAIDA = sys.argv[1], sys.argv[2]
MAPA = {"seta-esq":"arrow-left","seta-dir":"arrow-right","chevron-dir":"chevron-right",
 "cadeado":"lock","engrenagem":"settings","som":"volume-2","mudo":"volume-x","usuario":"user",
 "trofeu":"trophy","medalha":"award","lixeira":"trash-2","relogio":"clock","nuvem-ok":"cloud-check",
 "nuvem-off":"cloud-off","mais":"plus","check":"check","fechar":"x","play":"play","pausa":"pause",
 "lista":"list","loja":"shopping-bag","camera":"camera","estrela":"star","jornal":"newspaper",
 "grafico":"chart-no-axes-column","coroa":"crown","reenviar":"refresh-cw","email":"mail",
 "sair":"log-out","chave":"key-round","luta":"swords","treino":"dumbbell","painel":"layout-dashboard",
 "menu":"menu","raio":"zap","chama":"flame","lesao":"heart-pulse","carteira":"wallet",
 "seguidores":"users","info":"info","alerta":"triangle-alert"}
simbolos = []
for nosso, lucide in MAPA.items():
    arq = os.path.join(PASTA, lucide + ".svg")
    assert os.path.exists(arq), f"ícone {lucide} não existe nesta versão do lucide-static"
    t = open(arq, encoding="utf-8").read()
    t = re.sub(r"<!--.*?-->", "", t, flags=re.S)
    vb = re.search(r'viewBox="([^"]+)"', t).group(1)
    miolo = re.search(r"<svg[^>]*>(.*)</svg>", t, flags=re.S).group(1).strip()
    miolo = re.sub(r"\s+", " ", miolo)
    simbolos.append(f'<symbol id="{nosso}" viewBox="{vb}">{miolo}</symbol>')
open(SAIDA, "w", encoding="utf-8").write(
  '<svg xmlns="http://www.w3.org/2000/svg">\n' + "\n".join(simbolos) + "\n</svg>\n")
print(len(simbolos), "ícones")
```

Run: `mkdir -p /Users/giovanecabral/draft-ufc/img && python3 $S/icones/montar.py $S/icones/package/icons /Users/giovanecabral/draft-ufc/img/icones.svg`
Expected: `41 ícones`. Se um nome não existir na versão baixada, o `assert` diz qual; troque pelo nome atual do Lucide (buscar em `ls package/icons | grep <parte>`).

- [ ] **Step 2: Licença**

`img/LICENCAS.md`:

```markdown
# Licenças das imagens e ícones

## Ícones (img/icones.svg)

Lucide (https://lucide.dev), versão <colar a versão do package.json>, licença ISC:

<colar aqui o texto do arquivo package/LICENSE do lucide-static>

## Fundos (img/*.webp)

Gerados com google/gemini-3-pro-image via OpenRouter a partir dos prompts em
img/gerar.py, e tratados (duotone + granulação) pelo mesmo script. Sem pessoa
real, sem rosto reconhecível, sem marca de terceiros.
```

(Os dois `<colar…>` são preenchidos com o conteúdo real dos arquivos baixados no Step 1, na execução; não sobra marcador no commit.)

- [ ] **Step 3: Commit + push**

```bash
git add img/icones.svg img/LICENCAS.md && git commit -q -m "Revamp fase 1: sprite de ícones SVG (Lucide, ISC)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push -q
```

---

### Task 3: Roteador, molde de tela, transição e 404 interna (TDD, suíte `rotas`)

**Files:**
- Modify: `testar.js` (`criarAmbiente()`: `location`, `history`, `window.addEventListener`, `window.scrollTo`; nova função `testarRotas()`; dispatch `rotas`; inclusão no "tudo"; texto de uso)
- Modify: `index.html` (bloco INTERFACE NOVA antes de `async function boot()`; `ready()`; `tituloDoc()`; `<div id="corte">` no `<body>`; `redirectTo` do Google e da recuperação de senha)
- Modify: `estilo.css` (base inteira)

**Interfaces:**
- Produces:
  - `ICONE(nome, cls?) -> string` (SVG `<use>` do sprite)
  - `registrarRota(nome, tela)`; `ROTAS` (objeto nome -> `{tela}`)
  - `lerRota() -> {nome, param, auth}`; `auth=true` quando o hash é resposta do Supabase
  - `irPara(nome, param=null, {substituir=false}={})`; `mostrarRota(nome, param)`; `rotaAtual` (string)
  - `transicao(trocar)`; `montarTela({fundo, vivo, titulo, voltar="menu", classe}) -> elemento corpo`
  - `fundoTela(nome, {vivo}) -> elemento`; `montarGuias(abas, atual, aoTrocar) -> nav`; `vazio(icone, titulo, texto) -> elemento`
  - `urlRetornoAuth() -> string` (origin + pathname + search, sem hash)
  - `screen404()`

- [ ] **Step 1: Estender o DOM falso**

Em `criarAmbiente()`, dentro de `sandbox` (junto de `window`), trocar a linha do `window` e acrescentar `location`/`history`:

```js
    window: { matchMedia: () => ({ matches: true }), addEventListener: noop, scrollTo: noop },   // reduce-motion: sem esperas
    /* roteador por hash (revamp 2026-09-26): irPara() grava em history e
       lê location.hash. pushState aqui só atualiza o hash do location
       ATUAL do sandbox (suítes que trocam sandbox.location continuam
       funcionando, a leitura é na hora da chamada). */
    location: { hash: "", href: "https://octogono.fun/", search: "", pathname: "/", origin: "https://octogono.fun", reload: noop },
```

e, logo depois de `sandbox.globalThis = sandbox;`:

```js
  sandbox.history = {
    pushState: (a, b, u) => { sandbox.location.hash = String(u || ""); },
    replaceState: (a, b, u) => { sandbox.location.hash = String(u || "").startsWith("#") ? String(u) : ""; },
  };
```

- [ ] **Step 2: Escrever a suíte `rotas` (falha primeiro)**

Antes de `const cmd = ...` no fim do `testar.js`:

```js
/* ================================================================== *
 * ROTAS (revamp 2026-09-26): toda tela nova abre pelo roteador, toda
 * tela secundária tem Voltar que leva ao menu, endereço desconhecido
 * cai na 404, resposta de login do Supabase no hash NUNCA vira rota, e
 * nenhuma tela nova usa emoji/travessão no texto.
 * ================================================================== */
async function testarRotas() {
  console.log("\n" + cinza("rotas: menu, Voltar em toda tela, 404, hash do Supabase, sem emoji nem travessão"));
  const env = criarAmbiente({ contarNos: true });
  vm.createContext(env.sandbox);
  try {
    vm.runInContext(exportar(lerScript(), ["ready", "irPara", "lerRota", "ROTAS"])
      + "\ntry{globalThis.__x.rotaAtual=()=>rotaAtual;}catch(e){}",
      env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("\n  o script nem carregou: " + e.message) + "\n");
    return false;
  }
  const UI = env.sandbox.__x;
  const tem = (n, c) => (n.className || "").split(" ").includes(c);
  const desde = m => env.todos.slice(m);
  const respirar = () => new Promise(r => setImmediate(r));
  const falhas = [];
  const conf = async (nome, fn) => {
    try { await fn(); env.drenar(); await respirar(); env.drenar(); console.log(verde("  ok    ") + nome); }
    catch (e) { falhas.push(nome); console.log(vermelho("  falha ") + nome + "\n         " + e.message); }
  };
  const EMOJI = /\p{Extended_Pictographic}/u;

  await conf("abre no menu com os 5 cards na ordem certa", async () => {
    UI.ready(lerLutadores());
    env.drenar(); await respirar(); env.drenar();
    const rotas = env.todos.filter(n => tem(n, "menu-card")).map(n => n.dataset && n.dataset.rota);
    const esperado = ["nova", "continuar", "ranking", "atualizacoes", "conta"];
    if (JSON.stringify(rotas) !== JSON.stringify(esperado)) throw new Error("cards: " + rotas.join(","));
    if (UI.rotaAtual() !== "menu") throw new Error("rotaAtual = " + UI.rotaAtual());
  });

  await conf("todas as rotas do spec estão registradas", () => {
    const faltam = ["menu", "nova", "continuar", "conta", "atualizacoes", "ranking", "creditos",
      "termos", "privacidade", "404"].filter(r => !UI.ROTAS[r]);
    if (faltam.length) throw new Error("faltam: " + faltam.join(","));
  });

  for (const r of ["continuar", "ranking", "atualizacoes", "conta", "creditos", "termos", "privacidade"]) {
    await conf(`#/${r}: abre, tem Voltar, Voltar leva ao menu`, () => {
      const m = env.todos.length;
      UI.irPara(r);
      env.drenar();
      if (UI.rotaAtual() !== r) throw new Error("rotaAtual = " + UI.rotaAtual());
      const voltar = desde(m).filter(n => tem(n, "btn-voltar") && n.onclick).pop();
      if (!voltar) throw new Error("tela sem botão Voltar");
      const m2 = env.todos.length;
      voltar.onclick();
      env.drenar();
      if (UI.rotaAtual() !== "menu") throw new Error("Voltar foi pra " + UI.rotaAtual());
      if (desde(m2).filter(n => tem(n, "menu-card")).length !== 5) throw new Error("menu não foi redesenhado");
    });
  }

  await conf("rota desconhecida cai na 404, que tem Voltar", () => {
    const m = env.todos.length;
    UI.irPara("nao-existe-mesmo");
    env.drenar();
    if (UI.rotaAtual() !== "404") throw new Error("rotaAtual = " + UI.rotaAtual());
    if (!desde(m).some(n => tem(n, "tela-404"))) throw new Error("tela-404 não montada");
    if (!desde(m).some(n => tem(n, "btn-voltar") && n.onclick)) throw new Error("404 sem Voltar");
  });

  await conf("hash de resposta do Supabase (login/confirmação/recuperação) não vira rota", () => {
    for (const h of ["#access_token=abc&refresh_token=def&type=signup", "#error=access_denied&error_description=x",
      "#access_token=abc&type=recovery"]) {
      env.sandbox.location.hash = h;
      const r = UI.lerRota();
      if (r.nome !== "menu" || !r.auth) throw new Error(`${h} virou ${JSON.stringify(r)}`);
    }
    env.sandbox.location.hash = "#/ranking";
    const r = UI.lerRota();
    if (r.nome !== "ranking" || r.auth) throw new Error("hash normal lido errado: " + JSON.stringify(r));
  });

  await conf("telas novas sem emoji e sem travessão no texto", () => {
    const sujos = [];
    for (const r of ["menu", "continuar", "ranking", "atualizacoes", "creditos", "nao-existe"]) {
      const m = env.todos.length;
      UI.irPara(r);
      env.drenar();
      desde(m).forEach(n => {
        const h = String(n.innerHTML || "") + String(n.textContent || "");
        if (EMOJI.test(h)) sujos.push(`${r}: emoji em "${h.slice(0, 60)}"`);
        if (/[—–]/.test(h)) sujos.push(`${r}: travessão em "${h.slice(0, 60)}"`);
      });
    }
    if (sujos.length) throw new Error(sujos.slice(0, 5).join(" | "));
  });

  await conf("#/nova abre o fluxo de nova carreira (campo de nome)", () => {
    const m = env.todos.length;
    UI.irPara("nova");
    env.drenar();
    if (!desde(m).some(n => n.tagName === "input" && n.type === "text")) throw new Error("campo de nome não apareceu");
  });

  const ok = !falhas.length;
  console.log("\n" + (ok ? verde("rotas ok") : vermelho(`${falhas.length} falha(s) nas rotas`)));
  return ok;
}
```

Dispatch: no bloco de `else if (cmd === ...)`, acrescentar

```js
  else if (cmd === "rotas") ok = await testarRotas();
```

(seguindo o formato exato das linhas vizinhas desse bloco; conferir com `grep -n 'cmd === "inicial"' testar.js`), incluir `"rotas"` na lista que o "tudo" percorre (mesmo formato dos outros nomes, conferir com `grep -n '"narracao"' testar.js`) e no texto de uso.

- [ ] **Step 3: Rodar e ver falhar**

Run: `node testar.js rotas`
Expected: FAIL em "abre no menu com os 5 cards" (não existe `menu-card`) e "rotas registradas" (`ROTAS` não existe).

- [ ] **Step 4: Bloco INTERFACE NOVA no `index.html`**

Inserir imediatamente antes de `async function boot(){` (conferir com `grep -n "^async function boot" index.html`):

```js
/* =========================================================================
   INTERFACE NOVA (revamp 2026-09-26): roteador por hash, molde de tela,
   ícones, transição. Visual em estilo.css. Spec em
   docs/superpowers/specs/2026-09-26-revamp-ui-design.md.
   ========================================================================= */
const ICONE=(nome,cls="")=>
  `<svg class="ico${cls?" "+cls:""}" aria-hidden="true" focusable="false"><use href="img/icones.svg#${nome}"></use></svg>`;

const ROTAS={};
let rotaAtual=null;
function registrarRota(nome,tela){ ROTAS[nome]={tela}; }
/* O Supabase devolve login com Google, confirmação de e-mail e link de
   recuperação de senha no HASH (#access_token=...&type=...). Se isso
   virasse nome de rota, o jogo abria a 404 e, pior, reescrevia o hash
   antes do Supabase ler o token: login perdido. auth:true avisa quem
   chama pra NÃO mexer na URL. */
function lerRota(){
  let h="";
  try{ h=String(location.hash||""); }catch(e){}
  if(/access_token=|refresh_token=|error_description=|type=recovery|type=signup/.test(h))
    return{nome:"menu",param:null,auth:true};
  const partes=h.replace(/^#\/?/,"").split("/").filter(Boolean);
  return{nome:partes[0]||"menu",param:partes.slice(1).join("/")||null,auth:false};
}
function irPara(nome,param=null,{substituir=false}={}){
  const alvo="#/"+nome+(param?"/"+param:"");
  try{
    if(location.hash!==alvo){
      if(substituir)history.replaceState(null,"",alvo);
      else history.pushState(null,"",alvo);
    }
  }catch(e){/* sem history: navega igual, só não entra no histórico */}
  mostrarRota(nome,param);
}
function mostrarRota(nome,param){
  const r=ROTAS[nome]?nome:"404";
  rotaAtual=r;
  transicao(()=>ROTAS[r].tela(param));
}
/* Corte diagonal vermelho: cobre a tela em ~170ms, troca o conteúdo
   coberto, descobre. Sem animação (reduce-motion ou sem o elemento),
   troca direto. */
function transicao(trocar){
  const c=document.getElementById("corte");
  if(reduceMotion()||!c||!c.classList){ trocar(); rolarTopo(); return; }
  c.classList.remove("corte-on"); void c.offsetWidth; c.classList.add("corte-on");
  setTimeout(()=>{ trocar(); rolarTopo(); },170);
}
function rolarTopo(){ try{ window.scrollTo(0,0); }catch(e){} }
function armarRotas(){
  try{
    window.addEventListener("popstate",()=>{
      const r=lerRota(); if(!r.auth)mostrarRota(r.nome,r.param);
    });
  }catch(e){}
}
/* Endereço de volta pro Supabase (Google, recuperação de senha): sem o
   hash da rota, senão o token chega como "#/conta#access_token=..." e o
   Supabase não acha. */
function urlRetornoAuth(){
  try{ return location.origin+location.pathname+location.search; }
  catch(e){ return "https://octogono.fun/"; }
}

function fundoTela(nome,{vivo=false}={}){
  const f=el("div","tela-fundo"+(vivo?" vivo":""));
  f.style.cssText=`--img:url(img/${nome}.webp);--img-m:url(img/${nome}-m.webp)`;
  return f;
}
/* Molde único das telas novas: fundo, cabeçalho com Voltar e título,
   corpo. Devolve o corpo. voltar=null só no menu (é a raiz). */
function montarTela({fundo=null,vivo=false,titulo=null,voltar="menu",classe=""}={}){
  if(typeof cfgAberto!=="undefined"&&cfgAberto)fecharConfig();
  document.documentElement.dataset.tela="nova";
  app.innerHTML="";
  const tela=el("div","tela"+(classe?" "+classe:""));
  if(fundo)tela.appendChild(fundoTela(fundo,{vivo}));
  if(titulo||voltar){
    const cab=el("header","tela-cab");
    if(voltar){
      const b=el("button","btn-voltar",ICONE("seta-esq")+"<span>Voltar</span>");
      b.type="button";
      b.onclick=()=>{ SOM.toque(); irPara(voltar); };
      cab.appendChild(b);
    }
    if(titulo)cab.appendChild(el("h1","tela-titulo",titulo));
    tela.appendChild(cab);
  }
  const corpo=el("div","tela-corpo");
  tela.appendChild(corpo);
  app.appendChild(tela);
  return corpo;
}
/* Abas das telas novas (Conta agora; hub da carreira na fase 5). Troca
   o conteúdo sem refazer a tela inteira. abas=[[id,rótulo,ícone?],...] */
function montarGuias(abas,atual,aoTrocar){
  const nav=el("nav","guias");
  abas.forEach(([id,rot,ico])=>{
    const b=el("button","guia"+(id===atual?" on":""),(ico?ICONE(ico):"")+`<span>${rot}</span>`);
    b.type="button"; b.dataset.aba=id;
    b.onclick=()=>{
      SOM.toque();
      nav.querySelectorAll(".guia").forEach(x=>x.classList.toggle("on",x===b));
      aoTrocar(id);
    };
    nav.appendChild(b);
  });
  return nav;
}
function vazio(icone,titulo,texto){
  return el("div","vazio",`${ICONE(icone,"vazio-ico")}<b>${titulo}</b>${texto?`<span>${texto}</span>`:""}`);
}

function screen404(){
  const c=montarTela({fundo:"apagado",titulo:null,voltar:"menu",classe:"tela-404"});
  c.appendChild(el("div","erro-num","404"));
  c.appendChild(el("h2","erro-titulo","Página não encontrada"));
  c.appendChild(el("p","tela-sub","O endereço não existe ou mudou de lugar."));
  const b=el("button","botao",`${ICONE("seta-esq")}<span>Voltar ao menu</span>`);
  b.type="button"; b.onclick=()=>irPara("menu");
  c.appendChild(b);
}

registrarRota("menu",screenMenu);
registrarRota("nova",()=>screenName());   // mesmo caminho do antigo "Jogar"; a fase 4 troca pelo assistente
registrarRota("continuar",screenContinuar);
registrarRota("conta",p=>screenConta(p));
registrarRota("atualizacoes",screenAtualizacoes);
registrarRota("ranking",screenRanking);
registrarRota("creditos",screenCreditos);
registrarRota("termos",screenTermos);
registrarRota("privacidade",screenPrivacidade);
registrarRota("404",screen404);
```

Até as Tasks 5–10 entregarem as telas de verdade, criar logo abaixo stubs mínimos que usam o molde (cada Task seguinte SUBSTITUI o seu stub):

```js
function screenMenu(){
  const c=montarTela({fundo:"arena",vivo:true,voltar:null,classe:"tela-menu"});
  const grade=el("div","menu-grade"); c.appendChild(grade);
  ["nova","continuar","ranking","atualizacoes","conta"].forEach(r=>{
    const b=el("button","cartao menu-card",r); b.type="button"; b.dataset.rota=r;
    b.onclick=()=>irPara(r); grade.appendChild(b);
  });
}
function screenContinuar(){ montarTela({fundo:"vestiario",titulo:"Continuar"}); }
function screenAtualizacoes(){ montarTela({fundo:"imprensa",titulo:"Atualizações"}); }
function screenRanking(){ montarTela({fundo:"cinturao",titulo:"Ranking"}); }
function screenCreditos(){ montarTela({fundo:"arquibancada",titulo:"Créditos"}); }
```

- [ ] **Step 5: Ligar o roteador ao resto**

1. `screenInicio` (definida perto da linha 2315) vira atalho; apagar o corpo antigo inteiro dela e deixar:

```js
function screenInicio(){ irPara("menu"); }
```

(`voltarInicio()` já chama `screenInicio()`; fica como está.)

2. `screenConta` antiga passa a aceitar a aba (implementação real na Task 8; nesta tarefa só a assinatura) e o molde: trocar as 3 primeiras linhas do corpo

```js
function screenConta(){
  tituloDoc(true);
  app.innerHTML="";
  app.appendChild(el("div","eyebrow","Conta"));
```

por

```js
function screenConta(aba){
  const corpoTela=montarTela({fundo:"contrato",titulo:"Conta",classe:"tela-conta"});
```

e nas linhas seguintes da função trocar `app.appendChild(box)` por `corpoTela.appendChild(box)` e remover as 3 linhas do botão `voltar` do fim (o molde já tem Voltar).

3. Mesmo tratamento nas páginas legais: `screenPaginaLegal(titulo,corpo)` vira

```js
function screenPaginaLegal(titulo,corpo){
  const c=montarTela({fundo:"arquibancada",titulo,classe:"tela-legal"});
  c.appendChild(el("div","pagina-legal",corpo));
}
```

4. `tituloDoc(mostrar)` marca que a tela é antiga (o cabeçalho "Ficha do Lutador" some só nas novas):

```js
function tituloDoc(mostrar){
  document.documentElement.dataset.tela="antiga";
  const h=document.getElementById("dochead-h1");
  if(h)h.style.display=mostrar?"":"none";
}
```

5. `ready()`: trocar `lerDesafio()?screenName():screenInicio();` por

```js
    if(lerDesafio()){ screenName(); return; }
    const r=lerRota();
    if(r.auth){ getSupabase(); rotaAtual="menu"; ROTAS.menu.tela(null); return; }
    irPara(r.nome,r.param,{substituir:true});
```

`getSupabase()` antes de desenhar: o client nasce e lê o token do hash antes de qualquer outra coisa mexer na URL.

6. `redirectTo` sem hash: nas linhas `signInWithOAuth({provider:"google",options:{redirectTo:location.href}})` e `resetPasswordForEmail(email,{redirectTo:location.href})` trocar `location.href` por `urlRetornoAuth()`. Conferir com `grep -n "redirectTo:location.href" index.html` (esperado: 0 depois da troca).

7. No fim do script, antes de `boot();`, acrescentar `armarRotas();`.

8. No `<body>`, logo depois de `<div id="cfg" class="cfg-overlay" style="display:none"></div>`: `<div id="corte" aria-hidden="true"></div>`.

- [ ] **Step 6: Base do `estilo.css`**

Acrescentar ao `estilo.css`:

```css
:root{
  --fundo:#07080B; --sup:#11131A; --sup-2:#1A1D26;
  --linha:rgba(255,255,255,.08); --linha-forte:rgba(255,255,255,.16);
  --sangue:#D7261E; --sangue-vivo:#E8362D; --sangue-escuro:#7A0F0B;
  --ouro:#D4A017; --osso:#F2EEE6; --osso-2:#C9CBD2; --cinza:#8A8F9C; --ganho:#2FBF71;
  --f-titulo:"Anton",Impact,"Arial Narrow",sans-serif;
  --f-ui:"Barlow Condensed","Arial Narrow",sans-serif;
  --f-texto:"Barlow",system-ui,-apple-system,"Segoe UI",sans-serif;
  --corte:18px;
  --ease-soco:cubic-bezier(.2,.8,.2,1);
}

/* telas novas: fundo e largura próprios; "Ficha do Lutador" some */
html[data-tela="nova"] body{background:var(--fundo)}
html[data-tela="nova"] .doc-head{display:none}
html[data-tela="nova"] .wrap{max-width:1320px;padding:28px 24px 64px}
@media (max-width:600px){html[data-tela="nova"] .wrap{padding:18px 16px 48px}}

/* granulação sobre tudo (filme), sem pegar clique */
body::after{content:"";position:fixed;inset:0;z-index:9990;pointer-events:none;opacity:.07;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23g)'/></svg>")}

.ico{width:1.1em;height:1.1em;flex:none;fill:none;stroke:currentColor;stroke-width:2;
  stroke-linecap:round;stroke-linejoin:round;vertical-align:-.18em}

/* ---------- molde de tela ---------- */
.tela{position:relative;min-height:calc(100vh - 92px);font-family:var(--f-texto);color:var(--osso);font-size:16px;line-height:1.5}
.tela-fundo{position:fixed;inset:0;z-index:-1;background:var(--fundo) center/cover no-repeat;background-image:var(--img)}
@media (max-width:700px){.tela-fundo{background-image:var(--img-m,var(--img))}}
.tela-fundo::after{content:"";position:absolute;inset:0;background:
  radial-gradient(120% 90% at 50% 10%,rgba(7,8,11,.25) 0%,rgba(7,8,11,.78) 58%,rgba(7,8,11,.96) 100%),
  linear-gradient(180deg,rgba(7,8,11,.2) 0%,rgba(7,8,11,.85) 100%)}
.tela-fundo.vivo{animation:kenburns 28s ease-in-out infinite alternate}
@keyframes kenburns{from{transform:scale(1.03)}to{transform:scale(1.12) translate3d(-1.5%,-1%,0)}}
.tela-cab{display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin:0 0 28px;padding-right:64px}
.tela-titulo{font-family:var(--f-titulo);font-weight:400;font-size:clamp(38px,5.4vw,72px);line-height:.95;
  text-transform:uppercase;letter-spacing:.005em;margin:0}
.tela-sub{color:var(--osso-2);font-size:17px;max-width:62ch;margin:0 0 24px}
.btn-voltar{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 16px 0 12px;cursor:pointer;
  background:rgba(17,19,26,.72);color:var(--osso);border:1px solid var(--linha-forte);
  font-family:var(--f-ui);font-weight:600;font-size:15px;letter-spacing:.14em;text-transform:uppercase;
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:border-color .2s,background .2s}
.btn-voltar:focus-visible{outline:2px solid var(--sangue);outline-offset:2px}
.carregando{font-family:var(--f-ui);letter-spacing:.14em;text-transform:uppercase;color:var(--cinza);animation:pisca 1.2s ease-in-out infinite}
@keyframes pisca{50%{opacity:.35}}
.vazio{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:28px;background:rgba(17,19,26,.7);border:1px dashed var(--linha-forte)}
.vazio b{font-family:var(--f-ui);font-size:20px;letter-spacing:.06em;text-transform:uppercase}
.vazio span{color:var(--cinza)}
.vazio-ico{width:30px;height:30px;color:var(--sangue)}

/* ---------- card com canto cortado (assinatura) ---------- */
.cartao{position:relative;isolation:isolate;display:flex;width:100%;padding:0;border:0;cursor:pointer;
  text-align:left;font:inherit;color:var(--osso);background:var(--linha-forte);
  clip-path:polygon(var(--corte) 0,100% 0,100% calc(100% - var(--corte)),calc(100% - var(--corte)) 100%,0 100%,0 var(--corte));
  transition:background .25s,transform .35s var(--ease-soco)}
.cartao-miolo{position:relative;flex:1;display:flex;flex-direction:column;margin:1px;overflow:hidden;background:var(--sup);
  clip-path:polygon(var(--corte) 0,100% 0,100% calc(100% - var(--corte)),calc(100% - var(--corte)) 100%,0 100%,0 var(--corte))}
.cartao-foto{position:absolute;inset:0;background:center/cover no-repeat;background-image:var(--img);
  transition:transform .8s var(--ease-soco);opacity:.95}
.cartao-foto::after{content:"";position:absolute;inset:0;
  background:linear-gradient(180deg,rgba(7,8,11,.05) 0%,rgba(7,8,11,.55) 50%,rgba(7,8,11,.96) 100%)}
.cartao-conteudo{position:relative;z-index:1;margin-top:auto;padding:24px;display:flex;flex-direction:column;gap:6px}
.cartao-rotulo{font-family:var(--f-ui);font-weight:700;font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:var(--sangue)}
.cartao-titulo{font-family:var(--f-titulo);font-weight:400;font-size:clamp(30px,3.3vw,48px);line-height:.95;text-transform:uppercase}
.cartao-texto{color:var(--osso-2);font-size:15px;line-height:1.45}
.cartao-acao{display:inline-flex;align-items:center;gap:10px;margin-top:12px;font-family:var(--f-ui);font-weight:700;
  font-size:15px;letter-spacing:.16em;text-transform:uppercase}
.cartao-acao .ico{transition:transform .3s var(--ease-soco)}
.cartao.apagado .cartao-foto{filter:grayscale(1) brightness(.55)}
.cartao.apagado .cartao-rotulo{color:var(--cinza)}
.cartao:focus-visible{outline:none;background:var(--sangue)}
@media (hover:hover) and (pointer:fine){
  .cartao:hover{background:var(--sangue);transform:translateY(-3px)}
  .cartao:hover .cartao-foto{transform:scale(1.045)}
  .cartao:hover .cartao-acao .ico{transform:translateX(5px)}
  .cartao::after{content:"";position:absolute;inset:0;z-index:3;pointer-events:none;transform:translateX(-120%);
    background:linear-gradient(100deg,transparent 35%,rgba(255,255,255,.10) 50%,transparent 65%)}
  .cartao:hover::after{transform:translateX(120%);transition:transform .8s var(--ease-soco)}
  .btn-voltar:hover{border-color:var(--sangue);background:rgba(215,38,30,.14)}
  .botao:hover{background:var(--sangue-vivo)}
  .botao-sec:hover{box-shadow:inset 0 0 0 1px var(--osso)}
}

/* ---------- botões e abas ---------- */
.botao{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:50px;padding:0 28px;cursor:pointer;
  font-family:var(--f-ui);font-weight:700;font-size:17px;letter-spacing:.14em;text-transform:uppercase;color:#fff;
  background:var(--sangue);border:0;transition:background .2s,transform .2s var(--ease-soco);
  clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px)}
.botao:active{transform:translateY(1px)}
.botao:disabled{opacity:.4;cursor:not-allowed}
.botao:focus-visible{outline:2px solid var(--osso);outline-offset:3px}
.botao-sec{background:transparent;color:var(--osso);box-shadow:inset 0 0 0 1px var(--linha-forte)}
.guias{display:flex;gap:4px;overflow-x:auto;margin:0 0 24px;border-bottom:1px solid var(--linha-forte);scrollbar-width:none}
.guia{display:inline-flex;align-items:center;gap:8px;padding:12px 18px;background:none;border:0;cursor:pointer;white-space:nowrap;
  color:var(--cinza);font-family:var(--f-ui);font-weight:700;font-size:15px;letter-spacing:.14em;text-transform:uppercase;
  box-shadow:inset 0 -3px 0 transparent;transition:color .2s,box-shadow .2s}
.guia.on{color:var(--osso);box-shadow:inset 0 -3px 0 var(--sangue)}
@media (hover:hover) and (pointer:fine){.guia:hover{color:var(--osso)}}

/* ---------- entrada em cascata ---------- */
.entra{animation:entra .6s var(--ease-soco) both}
@keyframes entra{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}

/* ---------- troca de tela: corte diagonal ---------- */
#corte{position:fixed;inset:0;z-index:9995;pointer-events:none;visibility:hidden;background:var(--sangue);
  clip-path:polygon(0 0,0 0,-30% 100%,-30% 100%)}
#corte.corte-on{visibility:visible;animation:corte .36s cubic-bezier(.7,0,.3,1) both}
@keyframes corte{
  0%{clip-path:polygon(0 0,0 0,-30% 100%,-30% 100%)}
  48%,52%{clip-path:polygon(0 0,130% 0,100% 100%,-30% 100%)}
  100%{clip-path:polygon(130% 0,130% 0,100% 100%,100% 100%)}}

/* ---------- 404 ---------- */
.tela-404 .tela-corpo{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding-top:6vh}
.erro-num{font-family:var(--f-titulo);font-size:clamp(120px,24vw,280px);line-height:.8;color:var(--sangue)}
.erro-titulo{font-family:var(--f-titulo);font-weight:400;font-size:clamp(30px,4vw,52px);text-transform:uppercase;margin:0}

/* ---------- engrenagem global no visual novo ---------- */
html[data-tela="nova"] .cfg-btn{background:rgba(17,19,26,.72);border:1px solid var(--linha-forte);color:var(--osso);
  border-radius:0;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}

@media (prefers-reduced-motion:reduce){
  .entra{animation:fade .25s both}
  .tela-fundo.vivo{animation:none}
  #corte{display:none}
  .cartao,.cartao-foto,.botao{transition:none}
}
@keyframes fade{from{opacity:0}}
```

- [ ] **Step 7: Rodar e ver passar**

Run: `node testar.js rotas`
Expected: todos `ok` menos "telas novas sem emoji" se algum stub escrever travessão (não deve). Os stubs mostram o nome da rota como texto do card: isso é trocado na Task 5.

- [ ] **Step 8: Provar que o teste tem dente**

Apagar temporariamente o `voltar` do molde (`montarTela`: trocar `voltar="menu"` por `voltar=null` no default), rodar `node testar.js rotas`, ver as falhas "tela sem botão Voltar", restaurar e rodar de novo verde. Depois, temporariamente fazer `lerRota()` ignorar o teste do Supabase (comentar o `if(/access_token=...`), ver a falha "hash de resposta do Supabase", restaurar.

- [ ] **Step 9: Regressão das suítes antigas afetadas**

Run: `node testar.js interface` e `node testar.js inicial`
Expected: `interface` falha no passo "tela inicial: 5 itens de menu" (o menu mudou) e `inicial` falha nos passos que usam `inicio-item`. **Consertar agora** (não deixar vermelho entre tarefas):

Em `testarInterface()`, trocar o passo `"tela inicial: 5 itens de menu, clica Jogar ..."` inteiro por:

```js
  await passo("menu: 5 cards (nova, continuar, ranking, atualizações, conta), clica Nova carreira", () => {
    const cards = env.todos.filter(n => (n.className || "").split(" ").includes("menu-card"));
    const rotas = cards.map(c => c.dataset && c.dataset.rota);
    const esperadas = ["nova", "continuar", "ranking", "atualizacoes", "conta"];
    if (JSON.stringify(rotas) !== JSON.stringify(esperadas)) throw new Error("cards do menu: " + rotas.join(","));
    cards[0].onclick(); // Nova carreira -> screenName() (a fase 4 troca pelo assistente)
  });
```

Em `testarTelaInicial()`: acrescentar depois de `const ultimoTexto = ...`:

```js
  const cardRota = (r) => marcado("menu-card").filter(n => n.dataset && n.dataset.rota === r).pop();
```

e trocar: o passo "Opções: clica no item do menu, abre o overlay de config" pelo equivalente com a engrenagem (`const g = env.registro.cfgbtn; if (!g || !g.onclick) throw new Error("engrenagem sem onclick"); g.onclick(); if (!UI.cfgAberto()) throw new Error("abrirConfig() não marcou cfgAberto");`), e cada `marcado("inicio-item")[2].onclick()` por `cardRota("conta").onclick()`. Os passos de Histórico e Plano Pro são reescritos na Task 8 (eles dependem da Conta nova); se falharem agora, anotar e seguir, a Task 8 fecha.

Run de novo: `node testar.js interface` (verde) e `node testar.js inicial` (verde exceto passos de Histórico/Plano Pro, listados).

- [ ] **Step 10: Commit + push**

```bash
git add index.html estilo.css testar.js && git commit -q -m "Revamp fase 1: roteador por hash, molde de tela com Voltar, transição em corte diagonal, 404 interna, suíte rotas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push -q
```

---

### Task 4: Imagens duotone (OpenRouter + tratamento local)

**Pré-requisito do dono:** arquivo `~/.octogono-openrouter` com só a chave do OpenRouter, `chmod 600`. A chave nunca é impressa nem entra no repositório.

**Files:**
- Create: `img/gerar.py`
- Create: `img/*.webp` (2 por tema: `<tema>.webp` 1920px e `<tema>-m.webp` retrato para celular)
- Modify: `.gitignore` (`img/bruto/`)

**Interfaces:**
- Produces temas: `arena tunel vestiario contrato imprensa cinturao arquibancada apagado arena-alto cartazes academia saco fotos octogono-luz confete lona entrada trofeus`. Fases 1-2 usam `arena tunel vestiario contrato imprensa cinturao arquibancada apagado`; os demais já nascem pra fase 5 (coerência avaliada junto no checkpoint).

- [ ] **Step 1: Script**

`img/gerar.py`:

```python
#!/usr/bin/env python3
"""Gera os fundos do jogo pelo OpenRouter e aplica o tratamento da
identidade Noite de Luta (tritom preto / vermelho / osso + granulação),
salvando WebP em duas versões: <tema>.webp (1920px, paisagem) e
<tema>-m.webp (recorte retrato pro celular).

A chave NUNCA fica no repositório: é lida de ~/.octogono-openrouter
(arquivo com só a chave, chmod 600).

uso: python3 img/gerar.py              gera os temas que ainda não têm bruto
     python3 img/gerar.py arena tunel  (re)gera só esses
     python3 img/gerar.py --tratar     só refaz o tratamento a partir dos brutos
"""
import base64, json, os, sys, urllib.request
import numpy as np
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
BRUTO = os.path.join(AQUI, "bruto")
MODELO = "google/gemini-3-pro-image"

ESTILO = ("Cinematic documentary photograph, 35mm film, high contrast, deep crushed blacks, "
          "a single hard spotlight from above, haze in the air, heavy film grain, shallow depth of field. "
          "Absolutely no text, no letters, no numbers, no logos, no watermark, no brand names. "
          "No recognizable faces: any person is seen from behind, in silhouette or cropped out of frame. ")
TEMAS = {
  "arena": "An empty professional MMA octagon cage in a dark arena before the event, spotlight on the canvas, empty seats dissolving into darkness, wide shot, eye level.",
  "tunel": "A fighter seen from behind walking down a dark concrete arena tunnel toward a bright white light at the end, hood up, hands wrapped, pure silhouette.",
  "vestiario": "An empty locker room of a fight venue, wooden bench with hand wraps and a pair of MMA gloves, a robe hanging on a hook, harsh overhead fluorescent light.",
  "contrato": "Close-up of a fight contract on a dark wooden desk with a fountain pen and a pair of MMA gloves beside it, low key light, blank paper with no readable text.",
  "imprensa": "An empty press conference room for a fight event, long table with several microphones, a blank dark backdrop, bursts of camera flash light in the haze.",
  "cinturao": "A generic championship belt with a large blank metal plate and no engraving, resting on a black pedestal under a single spotlight, dark background.",
  "arquibancada": "Empty arena seats in near darkness with a few beams of light cutting through thick haze, wide shot.",
  "apagado": "An empty MMA cage in a completely dark arena with the main lights off, only a faint red emergency light, abandoned feeling.",
  "arena-alto": "High angle view from the rafters of an MMA octagon under bright lights, crowd as dark silhouettes around it, haze.",
  "cartazes": "A dim concrete corridor wall covered with torn old fight posters, all text blurred and unreadable, a single bulb.",
  "academia": "A gritty MMA gym wall with hanging gloves, focus mitts, jump ropes and shin guards on hooks, morning light through a dirty window.",
  "saco": "A fighter in silhouette hitting a heavy bag in a dark gym, sweat drops caught in a beam of light, motion blur on the bag.",
  "fotos": "A wall covered with pinned photographs of fight moments, all photos blurred and abstract, warm desk lamp light, shallow depth of field.",
  "octogono-luz": "Top-down view of an empty octagon canvas under blinding stage lights, the fence casting long shadows, blank canvas with no logos.",
  "confete": "Confetti falling through a spotlight inside an MMA cage, the fence in soft focus, celebratory atmosphere, no people.",
  "lona": "Extreme close-up of the canvas floor of a fight cage with drops of water and sweat, dark and moody, the fence out of focus.",
  "entrada": "Smoke and moving spotlights over an arena entrance ramp before a fighter walks out, silhouettes of crowd at the edges.",
  "trofeus": "A shelf in a dim gym office with generic trophies and medals without any text, a single warm light, dust in the air.",
}

def chave():
    p = os.path.expanduser("~/.octogono-openrouter")
    if not os.path.exists(p):
        sys.exit("falta ~/.octogono-openrouter (arquivo com só a chave, chmod 600)")
    return open(p).read().strip()

def gerar(tema):
    corpo = {"model": MODELO, "modalities": ["image", "text"],
             "image_config": {"aspect_ratio": "16:9"},
             "messages": [{"role": "user", "content": ESTILO + TEMAS[tema]}]}
    req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(corpo).encode(), headers={"Authorization": "Bearer " + chave(),
        "Content-Type": "application/json", "HTTP-Referer": "https://octogono.fun", "X-Title": "Octogono"})
    with urllib.request.urlopen(req, timeout=180) as r:
        d = json.load(r)
    imgs = d["choices"][0]["message"].get("images") or []
    assert imgs, f"{tema}: modelo não devolveu imagem ({json.dumps(d)[:300]})"
    url = imgs[0]["image_url"]["url"]
    dados = base64.b64decode(url.split(",", 1)[1])
    os.makedirs(BRUTO, exist_ok=True)
    open(os.path.join(BRUTO, tema + ".png"), "wb").write(dados)
    print(tema, "gerado", len(dados) // 1024, "KB")

def tratar(tema):
    im = Image.open(os.path.join(BRUTO, tema + ".png")).convert("L")
    t = np.asarray(im).astype(np.float32) / 255.0
    t = np.clip((t - 0.05) / 0.9, 0, 1) ** 1.2             # preto mais fundo, sem estourar o branco
    preto = np.array([7, 8, 11], np.float32)
    sangue = np.array([150, 24, 20], np.float32)            # meio-tom: vermelho escuro
    osso = np.array([242, 226, 214], np.float32)            # luz: osso quente
    t3 = t[..., None]
    cor = np.where(t3 < 0.62, preto + (sangue - preto) * (t3 / 0.62),
                   sangue + (osso - sangue) * ((t3 - 0.62) / 0.38))
    grao = np.random.default_rng(7).normal(0, 7, t.shape)[..., None]
    out = Image.fromarray(np.clip(cor + grao, 0, 255).astype(np.uint8), "RGB")
    w, h = out.size
    out.resize((1920, round(h * 1920 / w)), Image.LANCZOS).save(
        os.path.join(AQUI, tema + ".webp"), "WEBP", quality=70, method=6)
    rw = round(h * 0.6)                                     # recorte retrato central (3:5)
    x0 = (w - rw) // 2
    ret = out.crop((x0, 0, x0 + rw, h))
    alvo_h = min(h, 1300)
    ret.resize((round(rw * alvo_h / h), alvo_h), Image.LANCZOS).save(
        os.path.join(AQUI, tema + "-m.webp"), "WEBP", quality=68, method=6)
    print(tema, "tratado:", os.path.getsize(os.path.join(AQUI, tema + ".webp")) // 1024, "KB +",
          os.path.getsize(os.path.join(AQUI, tema + "-m.webp")) // 1024, "KB")

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    so_tratar = "--tratar" in sys.argv
    alvos = args or list(TEMAS)
    for tema in alvos:
        assert tema in TEMAS, f"tema desconhecido: {tema}"
        if not so_tratar and (args or not os.path.exists(os.path.join(BRUTO, tema + ".png"))):
            gerar(tema)
        tratar(tema)
```

- [ ] **Step 2: Gerar 1 tema e conferir o visual antes de gastar nos outros**

Run: `echo "img/bruto/" >> .gitignore && python3 img/gerar.py arena`
Olhar `img/arena.webp` e `img/arena-m.webp` (Read). Critério: sem texto, sem rosto, sem logo, legível como arena, contraste suficiente pro texto branco por cima. Ajustar `ESTILO` ou a curva do `tratar()` se precisar (regerar só `arena`).

- [ ] **Step 3: Gerar o resto**

Run: `python3 img/gerar.py`
Conferir cada imagem (Read em todas). Tema que sair com texto/rosto/logo: `python3 img/gerar.py <tema>` de novo. Orçamento: 18 temas × ~US$0,15 ≈ US$3 + regerações.

- [ ] **Step 4: Peso**

Run: `du -ch img/*.webp | tail -1`
Expected: ≤ 6 MB no total (cada `.webp` ~150–300 KB).

- [ ] **Step 5: Commit + push**

```bash
git add img/gerar.py img/*.webp .gitignore && git commit -q -m "Revamp fase 1: 18 fundos duotone gerados (OpenRouter) e tratados localmente

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push -q
```

---

### Task 5: Menu principal

**Files:**
- Modify: `index.html` (substituir o stub `screenMenu`; helpers `cartaoMenu`, `preencherPreviaRanking`, `preencherPreviaConta`, `buscarPlacar`, `fmtData`)
- Modify: `estilo.css` (menu)

**Interfaces:**
- Consumes: `montarTela`, `ICONE`, `irPara`, `ATUALIZACOES` (Task 6; até lá, `ultimasAtualizacoes` devolve `[]` se a constante não existir), `getSupabase`, `proAindaValido`.
- Produces: `buscarPlacar({divisao=null,modo="normal",limite=50}={}) -> Promise<Array<{nome_lutador,divisao,modo,pontuacao,cartel,nota,cinturoes,rosto}>>` (nunca rejeita; erro = `[]`); `fmtData(iso) -> "26 SET"`; `cartaoMenu(opts) -> button.cartao.menu-card`.

- [ ] **Step 1: Teste do menu (falha primeiro)**

Em `testarRotas()`, depois do primeiro `conf`, acrescentar:

```js
  await conf("menu: cards grandes e médios, marca, rodapé com Termos/Privacidade/Créditos e contato em texto", () => {
    UI.irPara("menu"); env.drenar();
    const cards = env.todos.filter(n => tem(n, "menu-card")).slice(-5);
    const grandes = cards.filter(n => tem(n, "menu-card-grande")).map(n => n.dataset.rota);
    if (JSON.stringify(grandes) !== '["nova","continuar"]') throw new Error("cards grandes: " + grandes);
    if (!env.todos.some(n => tem(n, "marca-nome") && /Octógono/i.test(n.innerHTML))) throw new Error("sem marca");
    const rod = env.todos.filter(n => tem(n, "menu-rodape")).pop();
    if (!rod) throw new Error("sem rodapé");
    for (const t of ["Termos", "Privacidade", "Créditos", "contato@octogono.fun"])
      if (!JSON.stringify(rod.children.map(c => c.innerHTML)).includes(t) && !String(rod.innerHTML).includes(t))
        throw new Error("rodapé sem " + t);
  });
```

Run: `node testar.js rotas` → FAIL ("cards grandes").

- [ ] **Step 2: Implementar**

Substituir o stub `screenMenu` por:

```js
/* Mês em 3 letras, maiúsculo, sem depender de Intl (o teste roda sem). */
const MESES=["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];
function fmtData(iso){
  const d=new Date(iso+(String(iso).length===10?"T12:00:00":""));
  return isNaN(d)?String(iso):`${String(d.getDate()).padStart(2,"0")} ${MESES[d.getMonth()]}`;
}
const fmtPontos=n=>String(Math.round(n||0)).replace(/\B(?=(\d{3})+(?!\d))/g,".");

/* Placar (fase 3 cria a tabela). Nunca rejeita: sem Supabase, sem
   tabela, sem rede ou erro de RLS, devolve lista vazia e a tela mostra
   o estado vazio. */
async function buscarPlacar({divisao=null,modo="normal",limite=50}={}){
  const sb=getSupabase();
  if(!sb)return[];
  try{
    let q=sb.from("placar").select("nome_lutador,divisao,modo,pontuacao,cartel,nota,cinturoes,rosto").eq("modo",modo);
    if(divisao)q=q.eq("divisao",divisao);
    const{data,error}=await q.order("pontuacao",{ascending:false}).limit(limite);
    return error||!Array.isArray(data)?[]:data;
  }catch(e){ return[]; }
}

function cartaoMenu({rota,tamanho,foto,rotulo,titulo,texto="",acao,extra="",i=0,apagado=false}){
  const b=el("button",`cartao menu-card menu-card-${tamanho} entra${apagado?" apagado":""}`,
    `<span class="cartao-miolo">
       ${foto?`<span class="cartao-foto" style="--img:url(img/${foto}.webp)"></span>`:""}
       <span class="cartao-conteudo">
         <span class="cartao-rotulo">${rotulo}</span>
         <span class="cartao-titulo">${titulo}</span>
         ${texto?`<span class="cartao-texto">${texto}</span>`:""}
         ${extra}
         <span class="cartao-acao">${acao}${ICONE("seta-dir")}</span>
       </span>
     </span>`);
  b.type="button";
  b.dataset.rota=rota;
  b.style.animationDelay=(i*70)+"ms";
  b.onclick=()=>{ SOM.toque(); irPara(rota); };
  return b;
}
const ultimasAtualizacoes=n=>typeof ATUALIZACOES!=="undefined"?ATUALIZACOES.slice(0,n):[];

function screenMenu(){
  const c=montarTela({fundo:"arena",vivo:true,voltar:null,classe:"tela-menu"});

  const topo=el("div","menu-topo");
  topo.appendChild(el("div","marca",
    `<span class="marca-nome">Octógono</span><span class="marca-sub">Carreira de MMA</span>`));
  const chip=el("button","chip-conta",`${ICONE("usuario")}<span class="chip-rot">Entrar</span>`);
  chip.type="button"; chip.onclick=()=>{ SOM.toque(); irPara("conta"); };
  topo.appendChild(chip);
  c.appendChild(topo);

  const grade=el("div","menu-grade");
  grade.append(
    cartaoMenu({rota:"nova",tamanho:"grande",foto:"tunel",rotulo:"Modo carreira",titulo:"Nova carreira",
      texto:"Monte o lutador com atributos de lutadores reais e jogue 22 lutas até a aposentadoria.",
      acao:"Começar",i:0}),
    cartaoMenu({rota:"continuar",tamanho:"grande",foto:"vestiario",rotulo:"Carreira salva",titulo:"Continuar",
      texto:`<span id="continuar-txt">Entre para ver suas carreiras.</span>`,acao:"Ver carreiras",i:1,apagado:true}),
    cartaoMenu({rota:"ranking",tamanho:"medio",foto:"cinturao",rotulo:"Placar",titulo:"Ranking",
      extra:`<span class="previa" id="previa-ranking"><span class="carregando">Carregando</span></span>`,
      acao:"Ver ranking",i:2}),
    cartaoMenu({rota:"atualizacoes",tamanho:"medio",foto:"imprensa",rotulo:"Novidades",titulo:"Atualizações",
      extra:`<span class="previa">${ultimasAtualizacoes(2).map(a=>
        `<span class="previa-linha"><span class="previa-data">${fmtData(a.data)}</span><span class="previa-txt">${a.titulo}</span></span>`).join("")}</span>`,
      acao:"Ver tudo",i:3}),
    cartaoMenu({rota:"conta",tamanho:"medio",foto:"contrato",rotulo:"Perfil",titulo:"Conta",
      extra:`<span class="previa" id="previa-conta"><span class="previa-linha"><span class="previa-txt">Entre ou crie sua conta.</span></span></span>`,
      acao:"Abrir conta",i:4}),
  );
  c.appendChild(grade);

  const rod=el("footer","menu-rodape");
  const lk=(txt,rota)=>{ const a=el("a","",txt); a.href="#/"+rota;
    a.onclick=e=>{ e.preventDefault(); irPara(rota); }; return a; };
  rod.append(lk("Termos de Uso","termos"),lk("Privacidade","privacidade"),lk("Créditos","creditos"),
    el("span","menu-contato",`Contato: contato@octogono.fun`));
  c.appendChild(rod);

  preencherPreviaRanking();
  preencherPreviaConta(chip);
}
async function preencherPreviaRanking(){
  const linhas=await buscarPlacar({limite:3});
  const alvo=document.getElementById("previa-ranking");
  if(!alvo)return;
  alvo.innerHTML=linhas.length
    ? linhas.map((l,i)=>`<span class="previa-linha"><span class="previa-pos">${i+1}</span>`+
        `<span class="previa-txt">${l.nome_lutador}</span><span class="previa-num">${fmtPontos(l.pontuacao)}</span></span>`).join("")
    : `<span class="previa-linha"><span class="previa-txt">Nenhuma carreira no placar ainda.</span></span>`;
}
async function preencherPreviaConta(chip){
  const sb=getSupabase();
  if(!sb)return;
  let session=null;
  try{ ({data:{session}}=await sb.auth.getSession()); }catch(e){ return; }
  if(!session)return;
  const email=session.user.email||"";
  const ct=document.getElementById("continuar-txt");
  if(ct)ct.textContent="Nenhuma carreira salva.";   // a fase 3 troca pelo save mais recente
  const rot=chip.querySelector?chip.querySelector(".chip-rot"):null;
  if(rot&&rot.textContent!==undefined)rot.textContent=email;
  let pro=null;
  try{ ({data:pro}=await sb.from("assinaturas").select("pro,expira_em").eq("user_id",session.user.id).maybeSingle()); }catch(e){}
  const alvo=document.getElementById("previa-conta");
  if(!alvo)return;
  const ativo=proAindaValido(pro);
  const ate=ativo&&pro.expira_em?new Date(pro.expira_em).toLocaleDateString("pt-BR"):null;
  alvo.innerHTML=`<span class="previa-linha"><span class="previa-txt">${email}</span></span>`+
    `<span class="previa-linha"><span class="previa-txt">${ativo?`<b class="txt-ouro">Plano Pro</b> até ${ate}`:"Plano grátis"}</span></span>`;
}
```

Observação sobre `chip.querySelector(".chip-rot")`: no navegador acha o `<span>`; no DOM falso devolve um nó vazio sem efeito (e o teste não passa por sessão aqui).

- [ ] **Step 3: CSS do menu**

```css
/* ---------- menu ---------- */
.menu-topo{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:0 64px 34px 0}
.marca{display:flex;flex-direction:column;line-height:1}
.marca-nome{font-family:var(--f-titulo);font-size:clamp(46px,7vw,92px);text-transform:uppercase;letter-spacing:.01em}
.marca-sub{font-family:var(--f-ui);font-weight:700;font-size:15px;letter-spacing:.34em;text-transform:uppercase;color:var(--sangue);margin-top:8px}
.chip-conta{display:inline-flex;align-items:center;gap:10px;max-width:280px;height:44px;padding:0 16px;cursor:pointer;
  background:rgba(17,19,26,.72);border:1px solid var(--linha-forte);color:var(--osso);
  font-family:var(--f-ui);font-weight:600;font-size:15px;letter-spacing:.08em;
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.chip-conta .chip-rot{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.menu-grade{display:grid;grid-template-columns:repeat(6,1fr);gap:18px}
.menu-card-grande{grid-column:span 3;min-height:min(46vh,420px)}
.menu-card-medio{grid-column:span 2;min-height:260px}
.menu-card-medio .cartao-titulo{font-size:clamp(28px,2.6vw,38px)}
.previa{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.previa-linha{display:flex;align-items:baseline;gap:10px;font-size:15px;color:var(--osso-2)}
.previa-pos{font-family:var(--f-titulo);font-size:18px;color:var(--sangue);min-width:14px}
.previa-data{font-family:var(--f-ui);font-weight:700;font-size:13px;letter-spacing:.1em;color:var(--sangue);white-space:nowrap}
.previa-txt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.previa-num{font-family:var(--f-ui);font-weight:700;font-variant-numeric:tabular-nums;color:var(--osso)}
.txt-ouro{color:var(--ouro)}
.menu-rodape{display:flex;flex-wrap:wrap;gap:8px 24px;align-items:center;margin-top:38px;padding-top:18px;
  border-top:1px solid var(--linha);font-family:var(--f-ui);font-size:14px;letter-spacing:.1em;text-transform:uppercase;color:var(--cinza)}
.menu-rodape a{color:var(--osso-2);text-decoration:none}
.menu-contato{text-transform:none;letter-spacing:.02em;margin-left:auto}
@media (hover:hover) and (pointer:fine){.menu-rodape a:hover{color:var(--sangue)} .chip-conta:hover{border-color:var(--sangue)}}
@media (max-width:980px){
  .menu-card-grande{grid-column:span 6;min-height:300px}
  .menu-card-medio{grid-column:span 2;min-height:250px}
}
@media (max-width:720px){
  .menu-topo{margin-right:56px}
  .menu-card-grande{min-height:250px}
  .menu-card-medio{grid-column:span 6;min-height:0}
  .menu-card-medio .cartao-foto{opacity:.45}
  .menu-contato{margin-left:0}
}
```

- [ ] **Step 4: Rodar**

Run: `node testar.js rotas && node testar.js interface`
Expected: verde.

- [ ] **Step 5: Screenshot nas 3 larguras**

Run (servidor da Task 1 no ar): `cd $S/print && node print.mjs "http://localhost:8000/#/menu" menu`
Olhar `menu-1440.png`, `menu-820.png`, `menu-380.png` (Read). Critérios: overflow-x=0 nas três; texto branco legível sobre as fotos; nenhum card cortado; marca não colide com a engrenagem; cards grandes lado a lado só em 1440. Corrigir CSS e repetir até passar.

- [ ] **Step 6: Commit + push**

```bash
git add index.html estilo.css testar.js && git commit -q -m "Revamp fase 2: menu principal com 5 cards, prévias de ranking/atualizações/conta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push -q
```

---

### Task 6: Atualizações

**Files:**
- Modify: `index.html` (constante `ATUALIZACOES` no bloco INTERFACE NOVA; substituir stub `screenAtualizacoes`)
- Modify: `estilo.css`

**Interfaces:**
- Produces: `ATUALIZACOES: Array<{data:"AAAA-MM-DD", titulo:string, itens:string[]}>`, mais recente primeiro.

- [ ] **Step 1: Teste (falha primeiro)**

Em `testarRotas()`:

```js
  await conf("atualizações: linha do tempo com todas as entradas, mais recente primeiro", () => {
    const m = env.todos.length;
    UI.irPara("atualizacoes"); env.drenar();
    const marcos = desde(m).filter(n => tem(n, "marco"));
    if (marcos.length < 8) throw new Error("só " + marcos.length + " entradas");
    const datas = marcos.map(n => (String(n.innerHTML).match(/data-iso="([\d-]+)"/) || [])[1]);
    const ord = [...datas].sort().reverse();
    if (JSON.stringify(datas) !== JSON.stringify(ord)) throw new Error("fora de ordem: " + datas.join(","));
  });
```

Run: `node testar.js rotas` → FAIL.

- [ ] **Step 2: Conteúdo e tela**

```js
/* Atualizações (página própria + prévia no menu). Escritas à mão, em
   português direto, a partir do histórico real do git. Mais recente
   primeiro. A entrada de 26/09 descreve o revamp e é revisada na fase 8
   pra bater com o que saiu de fato. */
const ATUALIZACOES=[
  {data:"2026-09-26",titulo:"Visual novo",itens:[
    "Menu com cards e páginas próprias para ranking, atualizações e conta.",
    "Carreira salva na conta, em até 3 espaços. Recarregar a página não perde mais o progresso.",
    "Ranking com as carreiras encerradas de todos os jogadores.",
    "Música e efeitos sonoros novos."]},
  {data:"2026-09-22",titulo:"Plano Pro",itens:[
    "R$ 9,99 liberam 30 dias, sem cobrança automática.",
    "O Pro libera o modo Lenda, a coletiva de imprensa, a entrevista depois da luta, o modo Rival e três modelos de card: Ouro, Prata e Bronze."]},
  {data:"2026-09-20",titulo:"Conquistas com ícone e raridade",itens:[
    "Cada conquista mostra um ícone próprio e a raridade: comum, incomum, rara ou lendária."]},
  {data:"2026-09-19",titulo:"Carreira no celular",itens:[
    "Ficha e histórico em abas, barra de controles fixa e menu com loja, cards e conquistas.",
    "No computador, a narração da luta ganhou mais espaço."]},
  {data:"2026-09-17",titulo:"Dilemas e escolhas na luta",itens:[
    "Os dilemas fora do octógono e as escolhas no meio do round ganharam visual próprio.",
    "Resposta do dilema em caixa de texto maior, que cresce enquanto você escreve."]},
  {data:"2026-09-11",titulo:"Mais cards de momento",itens:[
    "Bônus da noite e chegada ao topo da divisão agora viram card.",
    "Os desfechos dos dilemas ficaram mais concretos, com nome e diálogo."]},
  {data:"2026-09-10",titulo:"Contas",itens:[
    "Crie conta com e-mail e senha ou entre com o Google.",
    "Conquistas e carreiras encerradas ficam guardadas na conta.",
    "Recuperação de senha por e-mail."]},
  {data:"2026-09-07",titulo:"Loja nova",itens:[
    "Empresário financeiro e casa melhor entraram na loja, cada um com efeito medido na carreira."]},
  {data:"2026-09-05",titulo:"Escolhas no meio da luta",itens:[
    "31 ações diferentes para escolher durante o round, cada uma decidida pelos atributos dos dois lutadores.",
    "Nocaute sofrido pode virar lesão."]},
  {data:"2026-09-04",titulo:"Conquistas",itens:[
    "15 conquistas e a platina, guardadas neste aparelho."]},
  {data:"2026-09-03",titulo:"Card de momento",itens:[
    "Vitórias marcantes viram um card para salvar ou compartilhar."]},
];

function screenAtualizacoes(){
  const c=montarTela({fundo:"imprensa",titulo:"Atualizações",classe:"tela-atualizacoes"});
  c.appendChild(el("p","tela-sub","O que mudou no jogo, da mais recente para a mais antiga."));
  const linha=el("ol","linha-tempo");
  ATUALIZACOES.forEach((a,i)=>{
    const item=el("li","marco entra",
      `<span class="marco-data" data-iso="${a.data}">${fmtData(a.data)} <small>${a.data.slice(0,4)}</small></span>
       <div class="marco-corpo">
         <h2 class="marco-titulo">${a.titulo}</h2>
         <ul class="marco-itens">${a.itens.map(t=>`<li>${t}</li>`).join("")}</ul>
       </div>`);
    item.style.animationDelay=(Math.min(i,8)*60)+"ms";
    linha.appendChild(item);
  });
  c.appendChild(linha);
}
```

(Conferir as datas/afirmações de cada entrada contra `git log --format='%ad %s' --date=short` antes do commit; afirmação que não bater com commit real sai.)

- [ ] **Step 3: CSS**

```css
/* ---------- atualizações ---------- */
.linha-tempo{list-style:none;margin:0;padding:0 0 0 28px;position:relative;max-width:860px}
.linha-tempo::before{content:"";position:absolute;left:6px;top:6px;bottom:6px;width:2px;background:linear-gradient(var(--sangue),rgba(215,38,30,.1))}
.marco{position:relative;display:grid;grid-template-columns:120px 1fr;gap:18px;padding:0 0 30px}
.marco::before{content:"";position:absolute;left:-28px;top:6px;width:14px;height:14px;background:var(--sangue);
  clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)}
.marco-data{font-family:var(--f-ui);font-weight:700;font-size:18px;letter-spacing:.1em;color:var(--sangue)}
.marco-data small{display:block;font-size:13px;color:var(--cinza)}
.marco-corpo{background:rgba(17,19,26,.78);border:1px solid var(--linha);padding:18px 22px;
  backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.marco-titulo{font-family:var(--f-titulo);font-weight:400;font-size:28px;text-transform:uppercase;margin:0 0 8px;line-height:1}
.marco-itens{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;color:var(--osso-2)}
.marco-itens li{position:relative;padding-left:18px}
.marco-itens li::before{content:"";position:absolute;left:0;top:.62em;width:7px;height:7px;background:var(--sangue)}
@media (max-width:640px){.marco{grid-template-columns:1fr;gap:8px}}
```

- [ ] **Step 4: Rodar, screenshot, commit**

Run: `node testar.js rotas` (verde) e `node print.mjs "http://localhost:8000/#/atualizacoes" atual` (conferir 3 larguras).

```bash
git add index.html estilo.css testar.js && git commit -q -m "Revamp fase 2: página Atualizações com linha do tempo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push -q
```

---

### Task 7: Ranking

**Files:**
- Modify: `index.html` (substituir stub `screenRanking`; `desenharRanking`, `degrauPodio`, `linhaRanking`)
- Modify: `estilo.css`

**Interfaces:**
- Consumes: `buscarPlacar`, `fmtPontos`, `bonecoSVG(cfg,{w})`, `cfgPadrao()`, `DIVISOES` (`{id,nome}`).
- Produces: `filtroRanking={divisao:null,modo:"normal"}`; `desenharRanking(area, linhas)`.

- [ ] **Step 1: Teste (falha primeiro)**

Em `testarRotas()`, exportar também `desenharRanking` (acrescentar ao array do `exportar` da suíte) e:

```js
  await conf("ranking: vazio mostra estado vazio; com dados, pódio dos 3 e lista do 4º em diante", () => {
    const m = env.todos.length;
    UI.irPara("ranking"); env.drenar();
    if (!desde(m).some(n => tem(n, "vazio"))) throw new Error("sem estado vazio com placar vazio");
    const area = { innerHTML: "", children: [], appendChild(c) { this.children.push(c); return c; } };
    const linhas = Array.from({ length: 6 }, (_, i) => ({ nome_lutador: "L" + i, divisao: "lightweight", modo: "normal",
      pontuacao: 9000 - i * 100, cartel: "18-4", nota: "A", cinturoes: i === 0 ? 2 : 0, rosto: null }));
    UI.desenharRanking(area, linhas);
    const podio = area.children.find(n => tem(n, "podio"));
    const lista = area.children.find(n => tem(n, "ranking-lista"));
    if (!podio || podio.children.length !== 3) throw new Error("pódio não tem 3 degraus");
    if (!lista || lista.children.length !== 3) throw new Error("lista não tem as 3 linhas restantes");
    if (!/1º|>1</.test(podio.children[1].innerHTML)) throw new Error("1º lugar não está no meio do pódio");
  });
```

Run: `node testar.js rotas` → FAIL.

- [ ] **Step 2: Implementar**

```js
let filtroRanking={divisao:null,modo:"normal"};
function screenRanking(){
  const c=montarTela({fundo:"cinturao",titulo:"Ranking",classe:"tela-ranking"});
  c.appendChild(el("p","tela-sub","Carreiras encerradas de todos os jogadores, pela pontuação final."));
  const filtros=el("div","filtros");
  const sel=el("select","campo-select",
    `<option value="">Todas as divisões</option>`+DIVISOES.map(d=>`<option value="${d.id}">${d.nome}</option>`).join(""));
  sel.value=filtroRanking.divisao||"";
  sel.setAttribute&&sel.setAttribute("aria-label","Divisão");
  const seg=el("div","segmento");
  [["normal","Carreira"],["lenda","Lenda"]].forEach(([m,rot])=>{
    const b=el("button","segmento-op"+(filtroRanking.modo===m?" on":""),rot);
    b.type="button";
    b.onclick=()=>{ filtroRanking.modo=m;
      seg.querySelectorAll(".segmento-op").forEach(x=>x.classList.toggle("on",x===b)); carregar(); };
    seg.appendChild(b);
  });
  filtros.append(sel,seg);
  c.appendChild(filtros);
  const area=el("div","ranking-area");
  c.appendChild(area);
  const carregar=async()=>{
    area.innerHTML=""; area.appendChild(el("p","carregando","Carregando placar"));
    desenharRanking(area,await buscarPlacar(filtroRanking));
  };
  sel.onchange=()=>{ filtroRanking.divisao=sel.value||null; carregar(); };
  carregar();
}
function nomeDivisao(id){ const d=DIVISOES.find(x=>x.id===id); return d?d.nome:""; }
function desenharRanking(area,linhas){
  area.innerHTML="";
  if(!linhas.length){
    area.appendChild(vazio("trofeu","Nenhuma carreira no placar ainda.","Termine uma carreira para aparecer aqui."));
    return;
  }
  const podio=el("div","podio");
  [1,0,2].forEach(i=>{ if(linhas[i])podio.appendChild(degrauPodio(linhas[i],i+1)); });
  area.appendChild(podio);
  const lista=el("ol","ranking-lista");
  linhas.slice(3).forEach((l,i)=>lista.appendChild(linhaRanking(l,i+4)));
  area.appendChild(lista);
}
function degrauPodio(l,pos){
  return el("div",`degrau degrau-${pos} entra`,
    `<span class="degrau-retrato">${bonecoSVG(l.rosto||cfgPadrao(),{w:pos===1?120:96})}</span>
     <span class="degrau-pos">${pos}º</span>
     <span class="degrau-nome">${l.nome_lutador}</span>
     <span class="degrau-meta">${nomeDivisao(l.divisao)} · ${l.cartel}${l.cinturoes?` · ${ICONE("medalha")} ${l.cinturoes}`:""}</span>
     <span class="degrau-pontos">${fmtPontos(l.pontuacao)}</span>`);
}
function linhaRanking(l,pos){
  return el("li","rank-linha",
    `<span class="rank-pos">${pos}</span>
     <span class="rank-retrato">${bonecoSVG(l.rosto||cfgPadrao(),{w:44})}</span>
     <span class="rank-nome">${l.nome_lutador}<small>${nomeDivisao(l.divisao)}</small></span>
     <span class="rank-meta">${l.cartel}</span>
     <span class="rank-meta">${l.cinturoes?`${ICONE("medalha")} ${l.cinturoes}`:""}</span>
     <span class="rank-nota">${l.nota}</span>
     <span class="rank-pontos">${fmtPontos(l.pontuacao)}</span>`);
}
```

- [ ] **Step 3: CSS**

```css
/* ---------- ranking ---------- */
.filtros{display:flex;flex-wrap:wrap;gap:12px;margin:0 0 26px}
.campo-select{height:46px;padding:0 40px 0 14px;background:var(--sup) url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8'><path d='M1 1l5 5 5-5' stroke='%23F2EEE6' stroke-width='2' fill='none'/></svg>") no-repeat right 14px center;
  color:var(--osso);border:1px solid var(--linha-forte);border-radius:0;appearance:none;-webkit-appearance:none;
  font-family:var(--f-ui);font-weight:600;font-size:16px;letter-spacing:.06em}
.segmento{display:inline-flex;border:1px solid var(--linha-forte)}
.segmento-op{height:44px;padding:0 20px;background:transparent;border:0;cursor:pointer;color:var(--cinza);
  font-family:var(--f-ui);font-weight:700;font-size:15px;letter-spacing:.14em;text-transform:uppercase}
.segmento-op.on{background:var(--sangue);color:#fff}
.podio{display:grid;grid-template-columns:1fr 1.15fr 1fr;align-items:end;gap:14px;margin:0 0 26px}
.degrau{display:flex;flex-direction:column;align-items:center;text-align:center;gap:4px;padding:18px 12px 20px;
  background:rgba(17,19,26,.82);border-top:3px solid var(--linha-forte);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.degrau-1{border-top-color:var(--ouro);padding-top:26px}
.degrau-2{border-top-color:#B8BCC6}
.degrau-3{border-top-color:#A0643A}
.degrau-pos{font-family:var(--f-titulo);font-size:40px;line-height:1}
.degrau-1 .degrau-pos{color:var(--ouro);font-size:52px}
.degrau-nome{font-family:var(--f-ui);font-weight:700;font-size:20px;letter-spacing:.04em;text-transform:uppercase}
.degrau-meta{color:var(--cinza);font-size:14px}
.degrau-pontos{font-family:var(--f-titulo);font-size:26px;color:var(--osso)}
.ranking-lista{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.rank-linha{display:grid;grid-template-columns:44px 52px 1fr 80px 60px 40px 90px;align-items:center;gap:10px;
  padding:8px 16px 8px 10px;background:rgba(17,19,26,.78);border-left:3px solid transparent}
.rank-pos{font-family:var(--f-titulo);font-size:24px;text-align:center;color:var(--cinza)}
.rank-nome{font-family:var(--f-ui);font-weight:700;font-size:18px;text-transform:uppercase;letter-spacing:.03em;min-width:0}
.rank-nome small{display:block;font-family:var(--f-texto);font-weight:400;font-size:13px;text-transform:none;letter-spacing:0;color:var(--cinza)}
.rank-meta{color:var(--osso-2);font-variant-numeric:tabular-nums}
.rank-nota{font-family:var(--f-titulo);font-size:20px;color:var(--sangue)}
.rank-pontos{font-family:var(--f-ui);font-weight:700;font-size:18px;text-align:right;font-variant-numeric:tabular-nums}
@media (max-width:700px){
  .podio{grid-template-columns:1fr;align-items:stretch}
  .degrau-1{order:-1}
  .rank-linha{grid-template-columns:34px 44px 1fr 70px}
  .rank-linha .rank-meta,.rank-linha .rank-nota{display:none}
}
```

- [ ] **Step 4: Rodar, screenshot com dados injetados, commit**

Run: `node testar.js rotas` (verde).

Screenshot com dados de exemplo SÓ na ferramenta (nada de dado falso no produto): `$S/print/demo-ranking.js`:

```js
(() => {
  const nomes = ["Kayo Brasa","Duda Martelo","Mano Serra","Rafa Tigre","Zé Bigorna","Lia Cometa","Tonho Muralha","Bia Relâmpago"];
  const linhas = nomes.map((n, i) => ({ nome_lutador: n, divisao: "lightweight", modo: "normal",
    pontuacao: 9820 - i * 211, cartel: `${19 - i}-${3 + i}`, nota: "ABBCCCDD"[i], cinturoes: i < 2 ? 2 - i : 0, rosto: null }));
  const area = document.querySelector(".ranking-area");
  if (area) desenharRanking(area, linhas);
})();
```

Run: `node print.mjs "http://localhost:8000/#/ranking" ranking 1440,820,380 demo-ranking.js` e conferir.

```bash
git add index.html estilo.css testar.js && git commit -q -m "Revamp fase 2: página Ranking (pódio, lista, filtros, estado vazio)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push -q
```

---

### Task 8: Conta com abas (Perfil, Plano Pro, Carreiras encerradas, Conquistas)

**Files:**
- Modify: `index.html` (`screenConta(aba)` completa; `montarPerfil`, `montarAbaPro`, `montarVitrinePro`, `montarCarreirasEncerradas`, `montarConquistasConta`; `screenHistorico` e `screenPlanoPro` viram atalhos)
- Modify: `estilo.css` (conta + formulários antigos restilizados dentro de `.tela`)
- Modify: `testar.js` (passos de Histórico e Plano Pro de `testarTelaInicial`)

**Interfaces:**
- Consumes: `montarFormularioConta(container)`, `renderStatusProResumo(container,session)`, `montarBeneficiosPro(container)`, `montarCarrosselPro(container)`, `renderPlanoPro(container,session)`, `sincronizarConquistasNaNuvem()`, `sincronizarCarreirasNaNuvem()`, `lerCarreirasLocais()`, `CONQUISTAS`, `CONQUISTAS_DESBLOQUEADAS`, `definirNovaSenha(s)`, `sairDaConta()`, `montarGuias`.
- Produces: `screenConta(aba)` com `aba ∈ {perfil,pro,carreiras,conquistas}`; `screenHistorico()` = `irPara("conta","carreiras")`; `screenPlanoPro()` = `irPara("conta","pro")`. Classes preservadas porque os testes dependem delas: `carreira-item`, `pro-beneficio`, `pro-carrossel-*`, `aceite-pro`, `pro-ativo-linha`.

- [ ] **Step 1: Reescrever os passos de `testarTelaInicial` que dependem da Conta nova (falham primeiro)**

Ler o bloco atual dos passos "Histórico vazio", "Histórico com carreira salva", "Plano Pro: menu ganhou o 5º item" e "Plano Pro sem sessão" (`grep -n 'Histórico vazio\|Plano Pro: menu ganhou\|Plano Pro sem sessão' testar.js`) e trocar por:

```js
    await passo("Carreiras encerradas (logado, sem carreira): aba abre e avisa 'nenhuma ainda'", () => {
      sessaoFalsa = { user: { id: "u1", email: "teste@teste.com" } };
      UI.screenConta("carreiras");
    });
    await passo("Carreiras encerradas: mensagem de 'nenhuma carreira concluída'", () => {
      const linhas = env.todos.filter(n => (n.className || "").split(" ").includes("hint")).map(n => n.innerHTML);
      if (!linhas.some(t => /nenhuma carreira/i.test(t))) throw new Error("não avisou 'nenhuma carreira concluída ainda'");
    });
    await passo("Conquistas (logado, nenhuma): aba avisa 'nenhuma conquista'", () => {
      UI.screenConta("conquistas");
    });
    await passo("Conquistas: mensagem de 'nenhuma conquista desbloqueada'", () => {
      const linhas = env.todos.filter(n => (n.className || "").split(" ").includes("hint")).map(n => n.innerHTML);
      if (!linhas.some(t => /nenhuma conquista/i.test(t))) throw new Error("não avisou 'nenhuma conquista ainda'");
    });
    await passo("Carreiras encerradas com carreira salva: nome, cartel e nota aparecem", () => {
      UI.salvarCarreiraLocal({ seed: 99, nome: "TesteBot", cartel: "15-7", nota: "B", data: "2026-09-10T12:00:00Z" });
      UI.screenHistorico();
    });
```

(o passo seguinte que já existe, "Histórico com carreira salva: item aparece na tela com os dados certos", continua igual, procurando `carreira-item` com `TesteBot`). Depois dele, `sessaoFalsa = null;` antes do passo de Termos.

E o passo do menu do Plano Pro vira:

```js
    await passo("Plano Pro: mora na Conta; screenPlanoPro() abre a aba Pro com a vitrine", () => {
      UI.screenPlanoPro();
    });
```

(os passos seguintes, de benefícios/carrossel/sem sessão/logado, continuam iguais: a vitrine mantém as mesmas classes e textos.)

Run: `node testar.js inicial` → FAIL nos passos novos.

- [ ] **Step 2: Implementar a Conta**

Substituir o corpo inteiro de `screenConta` por:

```js
/* Conta (revamp): sem sessão, formulário de entrar/criar conta ao lado
   da vitrine do Plano Pro (quem ainda não tem conta também vê o que o
   Pro libera). Com sessão, abas Perfil / Plano Pro / Carreiras /
   Conquistas. A aba vai no endereço (#/conta/pro) via replaceState:
   trocar de aba não empilha histórico. */
function screenConta(aba){
  const c=montarTela({fundo:"contrato",titulo:"Conta",classe:"tela-conta"});
  const area=el("div","conta-area");
  c.appendChild(area);
  area.appendChild(el("p","carregando","Verificando sessão"));
  sincronizarConquistasNaNuvem().then(async email=>{
    area.innerHTML="";
    if(!email){
      const grade=el("div","conta-grade");
      const form=el("div","painel-n conta-form");
      const vitrine=el("div","painel-n conta-vitrine");
      grade.append(form,vitrine);
      area.appendChild(grade);
      montarFormularioConta(form);
      montarVitrinePro(vitrine,null);
      return;
    }
    let session=null;
    try{ ({data:{session}}=await getSupabase().auth.getSession()); }catch(e){}
    const abas=[["perfil","Perfil","usuario"],["pro","Plano Pro","estrela"],
                ["carreiras","Carreiras encerradas","lista"],["conquistas","Conquistas","trofeu"]];
    const atual=abas.some(a=>a[0]===aba)?aba:"perfil";
    const corpo=el("div","guia-corpo");
    const abrir=id=>{
      corpo.innerHTML="";
      ({perfil:()=>montarPerfil(corpo,email,session),
        pro:()=>montarVitrinePro(corpo,session),
        carreiras:()=>montarCarreirasEncerradas(corpo),
        conquistas:()=>montarConquistasConta(corpo)})[id]();
    };
    area.append(montarGuias(abas,atual,id=>{
      try{ history.replaceState(null,"","#/conta/"+id); }catch(e){}
      abrir(id);
    }),corpo);
    abrir(atual);
  });
}
function screenHistorico(){ irPara("conta","carreiras"); }
function screenPlanoPro(){ irPara("conta","pro"); }

function montarPerfil(corpo,email,session){
  const p=el("div","painel-n perfil");
  p.appendChild(el("div","perfil-rot","E-mail"));
  p.appendChild(el("div","perfil-email",email));
  const statusPro=el("div","","");
  p.appendChild(statusPro);
  if(session)renderStatusProResumo(statusPro,session);
  p.appendChild(el("p","hint","Suas conquistas e carreiras ficam sincronizadas com esta conta."));
  const acoes=el("div","perfil-acoes");
  const trocar=el("button","botao botao-sec",`${ICONE("chave")}<span>Trocar senha</span>`);
  trocar.type="button";
  const formSenha=el("div","perfil-senha");
  formSenha.style.display="none";
  trocar.onclick=()=>{
    formSenha.style.display=formSenha.style.display==="none"?"":"none";
    if(formSenha.innerHTML)return;
    const inp=el("input");inp.type="password";inp.placeholder="Nova senha";inp.id="perfil-nova-senha";
    const ok=el("button","botao","Salvar senha");ok.type="button";
    const msg=el("p","hint","");
    ok.onclick=async()=>{
      if(!inp.value||inp.value.length<SENHA_MIN){ msg.textContent=`A senha precisa de pelo menos ${SENHA_MIN} caracteres.`; return; }
      ok.disabled=true; msg.textContent="Salvando";
      const r=await definirNovaSenha(inp.value);
      ok.disabled=false;
      msg.textContent=r&&r.ok?"Senha trocada.":"Não deu pra trocar a senha agora. Tente de novo.";
    };
    formSenha.append(inp,ok,msg);
  };
  const sair=el("button","botao botao-sec",`${ICONE("sair")}<span>Sair</span>`);
  sair.type="button";
  sair.onclick=async()=>{ await sairDaConta(); location.reload(); };
  acoes.append(trocar,sair);
  p.append(acoes,formSenha);
  corpo.appendChild(p);
}
/* Vitrine do Pro: benefícios + carrossel dos modelos de card + (com
   sessão) o formulário de pagamento de sempre; sem sessão, avisa que
   assinar exige conta. Mesmo conteúdo da antiga screenPlanoPro(). */
function montarVitrinePro(container,session){
  container.appendChild(el("h2","painel-titulo",`Octógono Pro`));
  container.appendChild(el("p","dil-c","R$ 9,99 liberam 30 dias. Sem cobrança automática."));
  montarBeneficiosPro(container);
  montarCarrosselPro(container);
  const formArea=el("div","");
  container.appendChild(formArea);
  if(session){ renderPlanoPro(formArea,session); }
  else formArea.appendChild(el("p","hint","Assinar exige uma conta (é lá que o Plano Pro fica guardado)."));
}
function montarCarreirasEncerradas(corpo){
  const box=el("div","painel-n");
  corpo.appendChild(box);
  box.appendChild(el("p","carregando","Carregando"));
  const desenhar=()=>{
    box.innerHTML="";
    const carreiras=lerCarreirasLocais().sort((a,b)=>new Date(b.data)-new Date(a.data));
    if(!carreiras.length){ box.appendChild(el("p","hint","Nenhuma carreira concluída ainda.")); return; }
    carreiras.forEach(cr=>{
      const d=new Date(cr.data);
      const dataFmt=isNaN(d)?cr.data:d.toLocaleDateString("pt-BR");
      box.appendChild(el("div","carreira-item",
        `<div class="carreira-linha">
           <span class="carreira-nome">${cr.nome}</span>
           <span class="carreira-stats"><b>${cr.cartel}</b><span class="carreira-nota">nota ${cr.nota}</span></span>
         </div>
         <div class="carreira-data">${dataFmt}</div>`));
    });
  };
  if(getSupabase())sincronizarCarreirasNaNuvem().then(desenhar).catch(desenhar);
  else desenhar();
}
function montarConquistasConta(corpo){
  const box=el("div","painel-n");
  const n=CONQUISTAS_DESBLOQUEADAS.size,total=CONQUISTAS.length;
  box.appendChild(el("div","conq-progresso",
    `<span class="conq-num">${n}<small>/${total}</small></span>
     <span class="conq-barra"><i style="width:${Math.round(n/total*100)}%"></i></span>`));
  const desbloqueadas=CONQUISTAS.filter(c=>CONQUISTAS_DESBLOQUEADAS.has(c.id));
  if(!desbloqueadas.length)box.appendChild(el("p","hint","Nenhuma conquista desbloqueada ainda."));
  else desbloqueadas.forEach(c=>box.appendChild(el("div","conquista ok",
    `<div class="conquista-nome">${ICONE("check")} ${c.nome}</div><div class="conquista-desc">${c.desc}</div>`)));
  corpo.appendChild(box);
}
```

Apagar o corpo antigo de `screenPlanoPro` e de `screenHistorico` (as funções agora são os atalhos acima; conferir com `grep -n "^function screenPlanoPro\|^function screenHistorico" index.html` que sobra UMA definição de cada). `definirNovaSenha` devolve hoje `{ok}`? Conferir a assinatura com `grep -n "async function definirNovaSenha" -A 12 index.html` e ajustar o `r&&r.ok` ao formato real.

- [ ] **Step 3: CSS da conta e dos formulários antigos dentro das telas novas**

```css
/* ---------- conta ---------- */
.painel-n{background:rgba(17,19,26,.84);border:1px solid var(--linha);padding:26px;
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.painel-titulo{font-family:var(--f-titulo);font-weight:400;font-size:34px;text-transform:uppercase;margin:0 0 6px;line-height:1}
.conta-grade{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:18px;align-items:start}
@media (max-width:900px){.conta-grade{grid-template-columns:1fr}}
.perfil-rot{font-family:var(--f-ui);font-weight:700;font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:var(--cinza)}
.perfil-email{font-family:var(--f-ui);font-weight:700;font-size:26px;letter-spacing:.02em;margin:2px 0 12px;overflow-wrap:anywhere}
.perfil-acoes{display:flex;flex-wrap:wrap;gap:12px;margin-top:18px}
.perfil-senha{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:16px}
.conq-progresso{display:flex;align-items:center;gap:18px;margin-bottom:18px}
.conq-num{font-family:var(--f-titulo);font-size:54px;line-height:1}
.conq-num small{font-size:24px;color:var(--cinza)}
.conq-barra{flex:1;height:8px;background:var(--sup-2)}
.conq-barra i{display:block;height:100%;background:var(--sangue)}

/* formulários e botões ANTIGOS reaproveitados dentro das telas novas
   (montarFormularioConta, renderPlanoPro): mesmo visual do resto, sem
   reescrever a lógica (a fase 3 refaz o fluxo de conta). */
.tela input[type=text],.tela input[type=email],.tela input[type=password]{width:100%;max-width:420px;height:48px;padding:0 14px;
  background:var(--sup-2);color:var(--osso);border:1px solid var(--linha-forte);border-radius:0;
  font-family:var(--f-texto);font-size:16px}
.tela input:focus{outline:none;border-color:var(--sangue);box-shadow:0 0 0 1px var(--sangue)}
.tela .btn{min-height:46px;padding:0 22px;border-radius:0;border:0;background:var(--sangue);color:#fff;
  font-family:var(--f-ui);font-weight:700;font-size:16px;letter-spacing:.12em;text-transform:uppercase}
.tela .btn.btn-ghost{background:transparent;color:var(--osso);box-shadow:inset 0 0 0 1px var(--linha-forte)}
.tela .hint{color:var(--osso-2);font-family:var(--f-texto)}
.tela h4{font-family:var(--f-ui);font-weight:700;font-size:22px;letter-spacing:.06em;text-transform:uppercase;margin:0 0 12px}
.tela a{color:var(--osso)}
```

- [ ] **Step 4: Rodar**

Run: `node testar.js inicial && node testar.js rotas && node testar.js pro`
Expected: verde. (`pro` também usa `screenConta`/`screenPlanoPro`; se algum passo dele depender do layout antigo, ajustar o teste pelo PAPEL do elemento, nunca pela string exata da classe.)

- [ ] **Step 5: Screenshot (sem sessão) e commit**

Run: `node print.mjs "http://localhost:8000/#/conta" conta` e conferir. (Com sessão, conferir manualmente no checkpoint, logado na conta do dono.)

```bash
git add index.html estilo.css testar.js && git commit -q -m "Revamp fase 2: Conta com abas (Perfil, Plano Pro, Carreiras, Conquistas); Histórico e Plano Pro moram nela

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push -q
```

---

### Task 9: Continuar (espaços vazios até a fase 3)

**Files:**
- Modify: `index.html` (substituir stub `screenContinuar`; `slotVazio(n)`)
- Modify: `estilo.css`

**Interfaces:**
- Produces: `screenContinuar()` monta `.slots` com 3 `.save-slot`; nesta fase todos vazios (`.save-slot-vazio`, clique leva a `#/nova`). A fase 3 troca `slotVazio` por `slotSalvo(save)` onde houver save.

- [ ] **Step 1: Teste (falha primeiro)**

```js
  await conf("continuar: 3 espaços, vazio leva a Nova carreira", () => {
    const m = env.todos.length;
    UI.irPara("continuar"); env.drenar();
    const slots = desde(m).filter(n => tem(n, "save-slot"));
    if (slots.length !== 3) throw new Error(slots.length + " espaços");
    slots[0].onclick(); env.drenar();
    if (UI.rotaAtual() !== "nova") throw new Error("espaço vazio foi pra " + UI.rotaAtual());
  });
```

Run: `node testar.js rotas` → FAIL.

- [ ] **Step 2: Implementar**

```js
function screenContinuar(){
  const c=montarTela({fundo:"vestiario",titulo:"Continuar",classe:"tela-continuar"});
  c.appendChild(el("p","tela-sub","Cada conta guarda até 3 carreiras em andamento."));
  const grade=el("div","slots");
  for(let n=1;n<=3;n++)grade.appendChild(slotVazio(n));
  c.appendChild(grade);
}
function slotVazio(n){
  const b=el("button","cartao save-slot save-slot-vazio entra",
    `<span class="cartao-miolo"><span class="cartao-conteudo">
       <span class="cartao-rotulo">Espaço ${n}</span>
       <span class="slot-vazio-ico">${ICONE("mais")}</span>
       <span class="cartao-titulo">Livre</span>
       <span class="cartao-acao">Nova carreira${ICONE("seta-dir")}</span>
     </span></span>`);
  b.type="button";
  b.style.animationDelay=((n-1)*80)+"ms";
  b.onclick=()=>{ SOM.toque(); irPara("nova"); };
  return b;
}
```

- [ ] **Step 3: CSS**

```css
/* ---------- continuar ---------- */
.slots{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.save-slot{min-height:360px}
.save-slot-vazio .cartao-miolo{background:rgba(17,19,26,.6)}
.save-slot-vazio .cartao-conteudo{margin:auto 0;align-items:flex-start}
.slot-vazio-ico{display:flex;width:56px;height:56px;align-items:center;justify-content:center;border:1px dashed var(--linha-forte);margin:10px 0}
.slot-vazio-ico .ico{width:26px;height:26px;color:var(--sangue)}
@media (max-width:900px){.slots{grid-template-columns:1fr}.save-slot{min-height:200px}}
```

- [ ] **Step 4: Rodar, screenshot, commit**

Run: `node testar.js rotas`; `node print.mjs "http://localhost:8000/#/continuar" continuar`.

```bash
git add index.html estilo.css testar.js && git commit -q -m "Revamp fase 2: tela Continuar com 3 espaços (vazios até o save da fase 3)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push -q
```

---

### Task 10: Créditos, Termos/Privacidade no visual novo e `404.html`

**Files:**
- Modify: `index.html` (substituir stub `screenCreditos`; constante `CREDITOS`)
- Create: `404.html`
- Modify: `estilo.css` (créditos, página legal)

**Interfaces:**
- Produces: `CREDITOS: Array<{grupo, itens: Array<{nome, autor, licenca, link}>}>`; a fase 6 acrescenta o grupo de música e efeitos.

- [ ] **Step 1: Teste (falha primeiro)**

```js
  await conf("créditos: lista dados, imagens, ícones e fontes, cada item com licença", () => {
    const m = env.todos.length;
    UI.irPara("creditos"); env.drenar();
    const itens = desde(m).filter(n => tem(n, "credito"));
    if (itens.length < 4) throw new Error("só " + itens.length + " créditos");
    for (const t of ["Lucide", "ISC", "SIL Open Font License"])
      if (!itens.some(n => String(n.innerHTML).includes(t))) throw new Error("créditos sem " + t);
  });
```

Run: `node testar.js rotas` → FAIL.

- [ ] **Step 2: Implementar**

Antes, conferir a origem real dos dados: `grep -n "http" atualizar-dados.py | head` (usar a URL que o script realmente baixa no item "Estatísticas de luta").

```js
const CREDITOS=[
  {grupo:"Dados",itens:[
    {nome:"Estatísticas de luta e cartel dos lutadores",autor:"UFCStats",licenca:"Dados públicos",link:"http://ufcstats.com"}]},
  {grupo:"Imagens",itens:[
    {nome:"Fundos do jogo",autor:"Gerados com Gemini 3 Pro Image (Google) via OpenRouter, tratados pelo Octógono",licenca:"Uso próprio",link:""}]},
  {grupo:"Ícones",itens:[
    {nome:"Lucide",autor:"Lucide Contributors",licenca:"ISC",link:"https://lucide.dev"}]},
  {grupo:"Fontes",itens:[
    {nome:"Anton",autor:"Vernon Adams",licenca:"SIL Open Font License 1.1",link:"https://fonts.google.com/specimen/Anton"},
    {nome:"Barlow e Barlow Condensed",autor:"Jeremy Tribby",licenca:"SIL Open Font License 1.1",link:"https://fonts.google.com/specimen/Barlow"}]},
];
function screenCreditos(){
  const c=montarTela({fundo:"arquibancada",titulo:"Créditos",classe:"tela-creditos"});
  c.appendChild(el("p","tela-sub","Quem fez o que o jogo usa, e sob qual licença."));
  CREDITOS.forEach(g=>{
    const sec=el("section","creditos-grupo",`<h2 class="creditos-titulo">${g.grupo}</h2>`);
    g.itens.forEach(it=>sec.appendChild(el("div","credito",
      `<b>${it.nome}</b><span>${it.autor}</span><span class="credito-lic">${it.licenca}</span>`+
      (it.link?`<a href="${it.link}" target="_blank" rel="noopener">${it.link.replace(/^https?:\/\//,"")}</a>`:""))));
    c.appendChild(sec);
  });
}
```

- [ ] **Step 3: `404.html` estático**

```html
<!DOCTYPE html>
<html lang="pt-BR" data-tela="nova">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Página não encontrada · Octógono</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/estilo.css">
<style>
  body{margin:0;background:#07080B;color:#F2EEE6}
  .wrap{max-width:1320px;margin:0 auto;padding:28px 24px 64px}
</style>
</head>
<body>
<div class="wrap">
  <div class="tela tela-404">
    <div class="tela-fundo" style="--img:url(/img/apagado.webp);--img-m:url(/img/apagado-m.webp)"></div>
    <div class="tela-corpo">
      <div class="erro-num">404</div>
      <h1 class="erro-titulo">Página não encontrada</h1>
      <p class="tela-sub">O endereço não existe ou mudou de lugar.</p>
      <a class="botao" href="/">
        <svg class="ico" aria-hidden="true"><use href="/img/icones.svg#seta-esq"></use></svg><span>Voltar ao menu</span>
      </a>
    </div>
  </div>
</div>
</body>
</html>
```

- [ ] **Step 4: CSS**

```css
/* ---------- créditos e páginas legais ---------- */
.creditos-grupo{margin:0 0 26px;max-width:900px}
.creditos-titulo{font-family:var(--f-ui);font-weight:700;font-size:15px;letter-spacing:.24em;text-transform:uppercase;color:var(--sangue);margin:0 0 10px}
.credito{display:grid;grid-template-columns:1.2fr 1.4fr .9fr 1fr;gap:4px 14px;align-items:baseline;padding:12px 16px;
  background:rgba(17,19,26,.8);border-left:3px solid var(--linha-forte);margin-bottom:6px}
.credito b{font-family:var(--f-ui);font-size:18px;letter-spacing:.03em}
.credito span{color:var(--osso-2)}
.credito-lic{font-family:var(--f-ui);font-weight:700;letter-spacing:.06em;color:var(--osso)}
.credito a{color:var(--osso-2);overflow-wrap:anywhere}
@media (max-width:760px){.credito{grid-template-columns:1fr}}
.tela-legal .pagina-legal{max-width:78ch;background:rgba(17,19,26,.86);border:1px solid var(--linha);padding:28px 32px;
  font-family:var(--f-texto);font-size:16px;line-height:1.7;color:var(--osso-2)}
.tela-legal .pagina-legal h3{font-family:var(--f-ui);font-weight:700;font-size:20px;letter-spacing:.06em;text-transform:uppercase;color:var(--osso);margin:26px 0 8px}
@media (max-width:600px){.tela-legal .pagina-legal{padding:20px 18px}}
```

- [ ] **Step 5: Rodar, screenshots, commit**

Run: `node testar.js rotas && node testar.js inicial` (os passos de Termos/Privacidade continuam passando: o texto não mudou).
Screenshots: `#/creditos`, `#/termos`, `http://localhost:8000/404.html` nas 3 larguras.

```bash
git add index.html 404.html estilo.css testar.js && git commit -q -m "Revamp fase 2: Créditos, Termos e Privacidade no visual novo, 404.html estático

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push -q
```

---

### Task 11: Fechamento das fases 1–2 e checkpoint

**Files:**
- Modify: `CLAUDE.md` (seção Arquivos: `legado.css`, `estilo.css`, `img/`, `404.html`; nota sobre roteador e hash do Supabase)
- Modify: `LEIA-ME.md` (seção nova "Interface nova (revamp 2026-09-26)": arquivos, roteador, molde, identidade, pipeline de imagem; seção "Tela inicial" marcada como substituída)
- Modify: `PENDENCIAS.md` (item novo do revamp com o estado das fases e o que ficou pra fase 3)

- [ ] **Step 1: Suíte completa em background**

Run (background): `node testar.js > $S/tudo-fase2.txt 2>&1; echo "saida=$?" >> $S/tudo-fase2.txt`
Expected no fim: `TUDO CERTO` e `saida=0`. Qualquer suíte vermelha: consertar antes do checkpoint (as que mais tocam a interface: `interface`, `inicial`, `pro`, `rival`, `conteudo`, `compartilhar`).

- [ ] **Step 2: Rodada de screenshots de todas as rotas**

```bash
cd $S/print && for r in menu continuar ranking atualizacoes conta creditos termos privacidade nao-existe; do node print.mjs "http://localhost:8000/#/$r" "fim-$r"; done && node print.mjs http://localhost:8000/404.html fim-404html
```

Conferir cada PNG (Read). Critérios de aceite de cada tela: overflow-x=0 nas 3 larguras; sem erro de página (`ERROS:` vazio); texto legível sobre imagem; Voltar visível; nada cortado em 380 px.

- [ ] **Step 3: Documentação**

Escrever as seções do Step "Files" acima (texto normal, sem travessão nos trechos novos). Em `PENDENCIAS.md`, registrar: Resend 100/dia, placar forjável (seção 8 do spec), `#/nova` ainda no fluxo antigo até a fase 4, hub antigo até a fase 5.

- [ ] **Step 4: Commit + push**

```bash
git add CLAUDE.md LEIA-ME.md PENDENCIAS.md && git commit -q -m "Revamp fases 1-2: documentação (arquivos novos, roteador, identidade, pendências)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push -q
```

- [ ] **Step 5: Checkpoint com o dono**

Mandar os screenshots do menu (1440 e 380), ranking com dados de exemplo, conta, atualizações, 404, e 4 fundos da fase 5 lado a lado. Pedir aprovação explícita antes do plano da fase 3. Não começar a fase 3 sem o sim.
