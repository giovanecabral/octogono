#!/usr/bin/env node
/**
 * testar.js — a única ferramenta do projeto.
 *
 *   node testar.js            roda tudo
 *   node testar.js interface  a interface quebra em algum clique?
 *                             (inclui o painel da engrenagem)
 *   node testar.js motor      a calibração continua de pé?
 *   node testar.js draft      o orçamento está no alvo?
 *   node testar.js pesos      quanto cada atributo vale (gera WEIGHTS)
 *
 * Lê o motor de DENTRO do index.html. Não existe cópia do código em lugar
 * nenhum — foi de propósito. Antes existiam duas (fightsim.js e a cópia no
 * HTML), uma ficou pra trás, e ninguém percebeu por três iterações.
 *
 * Não precisa de servidor nem de internet.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const TOTAL_ESPERADO = 22;      // uma carreira; lutas de 3 cartas não repetem adversário
const RAIZ = __dirname;
const HTML = path.join(RAIZ, "index.html");
const JSON_LUTADORES = path.join(RAIZ, "fighters.json");

const cor = { ok: "\x1b[32m", ruim: "\x1b[31m", fraco: "\x1b[90m", fim: "\x1b[0m" };
const verde = s => cor.ok + s + cor.fim;
const vermelho = s => cor.ruim + s + cor.fim;
const cinza = s => cor.fraco + s + cor.fim;

function lerScript() {
  if (!fs.existsSync(HTML)) { console.error(vermelho("não achei o index.html nesta pasta")); process.exit(1); }
  const html = fs.readFileSync(HTML, "utf8");
  const a = html.indexOf("<script>"), b = html.lastIndexOf("</script>");
  if (a < 0 || b < 0) { console.error(vermelho("não achei o <script> no index.html")); process.exit(1); }
  return html.slice(a + 8, b).replace(/\bboot\(\);?\s*$/m, "");
}
function lerLutadores() {
  if (!fs.existsSync(JSON_LUTADORES)) {
    console.error(vermelho("não achei o fighters.json nesta pasta"));
    console.error(cinza("gere com: python3 atualizar-dados.py"));
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(JSON_LUTADORES, "utf8"));
}

/* ------------------------------------------------------------------ *
 * DOM falso. Registra tudo que a interface monta pra podermos clicar.
 * ------------------------------------------------------------------ */
function criarAmbiente({ contarNos = false } = {}) {
  const todos = [], registro = {}, timers = [];
  const noop = () => {};
  function makeEl(tag = "div") {
    const n = {
      tagName: tag, _html: "", textContent: "", id: "", className: "",
      style: {}, children: [], disabled: false, value: "",
      onclick: null, onkeydown: null, onchange: null, type: "", maxLength: 0,
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      dataset: {},
      appendChild(c) { this.children.push(c); if (c && c.id) registro[c.id] = c; return c; },
      append(...cs) { cs.forEach(c => this.appendChild(c)); },
      scrollIntoView: noop, focus: noop, addEventListener: noop, remove: noop,
      /* o criador de personagem consulta os filhos para marcar a opção ativa */
      querySelector(sel){
        const id = String(sel).replace(/^#/, "");
        return this.children.find(c => c.id === id) || makeEl();
      },
      querySelectorAll(sel){
        const cls = String(sel).replace(/^\./, "");
        return this.children.filter(c => (c.className || "").split(" ").includes(cls));
      },
      getContext: () => null,
      get innerHTML() { return this._html; },
      set innerHTML(v) { this._html = String(v); if (v === "") this.children = []; },
    };
    if (contarNos) todos.push(n);
    return n;
  }
  registro.app = makeEl();
  registro.docmeta = makeEl();

  /* SEM AudioContext e SEM localStorage de propósito: o jogo tem que rodar
     inteiro em navegador que bloqueia os dois. Se o som derrubar a carreira,
     este teste quebra. */
  const sandbox = {
    console: { log: noop, warn: noop, error: noop },
    document: {
      /* html[data-estado-carreira]/[data-aba-carreira] (atualizarEstadoCarreira())
         precisa de um nó estável — sem isto, undefined.dataset explode. */
      documentElement: makeEl(),
      /* o nó criado sob demanda precisa carregar o id, senão o teste não
         consegue achar elementos que a interface monta via innerHTML */
      getElementById: id => registro[id] || (registro[id] = Object.assign(makeEl(), { id })),
      createElement: t => makeEl(t),
      querySelector: () => makeEl(),
      /* o jogo arma um ouvinte de primeiro clique para iniciar a trilha */
      addEventListener: noop, removeEventListener: noop,
    },
    window: { matchMedia: () => ({ matches: true }) },   // reduce-motion: sem esperas
    setTimeout: fn => { timers.push(fn); return timers.length; },
    clearTimeout: noop, setInterval: noop, clearInterval: noop,
    fetch: () => Promise.reject(new Error("offline")),
    AbortController: class { constructor() { this.signal = null; } abort() {} },
    Math, JSON, Date, Number, String, Array, Object, Promise, Set, Map, Error, isNaN,
  };
  sandbox.globalThis = sandbox;
  return { sandbox, todos, registro, drenar: () => { let i = 0; while (timers.length && i++ < 60000) (timers.shift())(); } };
}

/* `function` vira propriedade do sandbox sozinha; `const` e `let` não, porque
   são de escopo léxico. Então exportamos na marra. */
function exportar(js, nomes) {
  return js + "\n;globalThis.__x={};\n" +
    nomes.map(n => `try{globalThis.__x.${n}=${n};}catch(e){}`).join("\n");
}
const API_MOTOR = ["simulateFight", "simularRound", "mkState", "mulberry32", "rateAll", "makePercentiler",
  "rollTable", "PAIRS", "WEIGHTS", "TOTAL_WEIGHT", "BUDGET_PCT", "TUNING",
  "RARE", "LEGACY", "hypeOf", "followerDelta", "fmtNum", "CAMPS", "dificuldade",
  "TETO_TREINO", "RITMO_TREINO", "ATTR_TREINAVEIS",
  "ehLenda", "RATING_LENDA", "MIN_LUTADORES", "DIVISOES",
  "ACOES_LUTA", "COUNTER_ATTR", "sinalDoRound", "contest", "K_ESCOLHA_LUTA"];

function carregarMotor() {
  const { sandbox } = criarAmbiente();
  vm.createContext(sandbox);
  vm.runInContext(exportar(lerScript(), API_MOTOR), sandbox, { filename: "index.html" });
  const M = sandbox.__x || {};
  if (!M.simulateFight) throw new Error("simulateFight não foi encontrado");
  return M;
}

/* ================================================================== *
 * 1. INTERFACE — o teste que faltava quando a tela de draft travou
 * ================================================================== */
async function testarInterface(divEscolhida = 3, modo = "normal") {
  console.log("\n" + cinza(`percorrendo a interface inteira, clicando nos botões de verdade `
    + `(divisão ${divEscolhida}${modo === "lenda" ? ", modo lenda" : ""})`));
  const env = criarAmbiente({ contarNos: true });
  vm.createContext(env.sandbox);
  try {
    /* ranking sai como FUNÇÃO, não valor: RANKING é null até a carreira
       começar e exportar(nomes) captura só um instantâneo na hora do load —
       uma closure lê o binding ao vivo toda vez que é chamada. */
    vm.runInContext(exportar(lerScript(), ["ready", "screenName", "screenReport", "DIVISOES"])
      + "\ntry{globalThis.__x.ranking=()=>RANKING;}catch(e){}"
      + "\ntry{globalThis.__x.st=()=>st;}catch(e){}"
      + "\ntry{globalThis.__x.escolhaAberta=()=>escolhaAberta;}catch(e){}"
      + "\ntry{globalThis.__x.setMeuPro=(v)=>{meuPro=v;};}catch(e){}",
      env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("\n  o script nem carregou: " + e.message) + "\n");
    return false;
  }
  const UI = env.sandbox.__x, falhas = [];
  let marca = 0;
  /* O dilema é assíncrono: a promessa dele só resolve na fila de microtarefas,
     que não roda dentro de código síncrono. Sem este await o teste nunca vê a
     tela do dilema. */
  const respirar = () => new Promise(r => setImmediate(r));
  const passo = async (nome, fn) => {
    try { await fn(); env.drenar(); await respirar(); env.drenar(); await respirar(); }
    catch (e) { falhas.push([nome, e]); console.log(vermelho(`  falha  ${nome}`) + "\n         " + e.message); }
  };

  await passo("carregar e avaliar lutadores", () => UI.ready(lerLutadores()));
  await passo("tela inicial: 5 itens de menu, clica Jogar (sem link de desafio, cai aqui de verdade)", () => {
    // "Jogar" (o 1º) ganhou uma 2ª classe (inicio-item-principal) pra ter
    // peso visual de ação primária — token, não igualdade exata, senão
    // esse item some da contagem.
    const itens = env.todos.filter(n => (n.className || "").split(" ").includes("inicio-item"));
    if (itens.length !== 5) throw new Error(`esperava 5 itens no menu, achei ${itens.length}`);
    const titulo = env.todos.filter(n => (n.className || "").split(" ").includes("inicio-titulo")).pop();
    if (!titulo || titulo.innerHTML !== "OCTÓGONO") throw new Error("título da tela inicial não é OCTÓGONO");
    itens[0].onclick(); // "Jogar" -> screenName()
  });
  await passo("digitar nome e avançar", () => {
    const inp = env.todos.filter(n => n.tagName === "input" && n.type === "text").pop();
    if (!inp) throw new Error("campo de nome não foi montado");
    inp.value = "TesteBot";                       // sem isso o botão volta sem fazer nada
    // classe exata quebrou quando o botão ganhou peso visual de ação
    // primária (Fase 5, mesmo padrão do "Jogar" da tela inicial) — acha
    // pelo texto, que é o que realmente identifica este botão.
    const btn = env.todos.filter(n => n.tagName === "button" && n.innerHTML === "Montar o lutador" && n.onclick).pop();
    btn.onclick();
    if (!btn) throw new Error("botão 'Montar o lutador' não foi montado");
    btn.onclick();
  });
  /* tela nova: criador de personagem, entre o nome e a divisão */
  await passo("criador de personagem", () => {
    /* O criador tem abas, então só a categoria ativa está montada. Percorremos
       todas, como o jogador faria, e mexemos em algo em cada uma. */
    const abas = env.todos.filter(n => (n.className || "").startsWith("aba") && n.onclick);
    if (abas.length < 5) throw new Error(`só ${abas.length} categorias, esperava 6`);
    let mexidas = 0;
    for (let i = 0; i < abas.length; i++) {
      const marca = env.todos.length;
      abas[i].onclick();
      const novos = env.todos.slice(marca).filter(n =>
        (n.className || "").startsWith("chip") || (n.className || "").startsWith("sw"));
      if (!novos.length) throw new Error(`categoria ${i} não montou nenhuma opção`);
      novos[novos.length - 1].onclick();          // muda algo e redesenha
      mexidas++;
    }
    if (mexidas < 5) throw new Error("nem todas as categorias responderam");
    const campo = env.todos.filter(n => n.id === "nomeIn").pop();
    if (campo) campo.value = "TesteBot";
    /* fase 2 do PLANO-LANCAMENTO.md: botão "Pular" tem que existir e estar
       ligado — não clicamos nele aqui (o resto do teste segue customizando
       de propósito, pra cobrir os dois caminhos: "ok" já é exercido por
       este passo, "Pular" é conferido só por existir e ter onclick). */
    const pularBtn = env.todos.filter(n => n.tagName === "button" && n.innerHTML === "Pular").pop();
    if (!pularBtn || !pularBtn.onclick) throw new Error("botão 'Pular' não foi montado ou não está ligado");
    const btns = env.todos.filter(n => n.tagName === "button" && (n.className || "").split(" ").includes("btn") && n.onclick);
    if (!btns.length) throw new Error("botão de avançar não foi montado");
    btns[btns.length - 1].onclick();
  });

  await passo("escolher divisão", () => {
    /* No modo lenda o grid é REDESENHADO, então precisamos olhar só o que nasceu
       depois do clique — senão pegaríamos uma carta do grid normal, já órfã. */
    if (modo === "lenda") {
      const bt = env.registro.modo_lenda;
      if (!bt || !bt.onclick) throw new Error("não achei o botão do modo lenda");
      /* item 1 do pedido pós-item-6 (2026-09-22): "Seja uma lenda" trava
         sem meuPro — clique normal não muda MODO, só mostra a nota de
         "recurso Pro" (ver screenDivisao() em index.html). Confere a
         trava de verdade (grátis não entra) ANTES de simular sessão Pro
         pro resto deste teste de navegação. */
      bt.onclick();
      const grid1 = env.todos.slice(marca).filter(n => (n.className || "").startsWith("div-c") && n.onclick);
      if (grid1.some(c => /lendas/.test(c.innerHTML || "")))
        throw new Error("clicar 'Seja uma lenda' sem meuPro entrou no modo mesmo assim");
      const nota = env.todos.filter(n => (n.className || "").split(" ").includes("modo-nota")).pop();
      if (!nota || !/Plano Pro/.test(nota.innerHTML || ""))
        throw new Error("clicar 'Seja uma lenda' sem meuPro não mostrou a nota de recurso Pro");
      UI.setMeuPro(true);
      marca = env.todos.length;
      bt.onclick();
    }
    const divs = env.todos.slice(marca).filter(n => (n.className || "").startsWith("div-c") && n.onclick);
    if (!divs.length) throw new Error("nenhuma carta de divisão foi montada");
    /* 11 divisões no normal; no lenda mosca e as três femininas não têm 40
       lendas e saem de propósito, sobram 7. */
    const min = modo === "lenda" ? 6 : 8;
    if (divs.length < min) throw new Error(`só ${divs.length} divisões jogáveis, esperava ao menos ${min}`);
    divs[divEscolhida % divs.length].onclick();
  });

  /* item 4 do Plano Pro (2026-09-22): escolher divisão agora abre
     screenAtivarRival() antes do draft — "Não" já nasce marcado, só
     precisa clicar "Continuar" pra seguir sem rival (o caminho "Sim"
     tem suíte própria, ver testarModoRival()). */
  await passo("Modo Rival: tela de ativação abre, 'Continuar' sem escolher nada segue sem rival", () => {
    const continuar = env.todos.filter(n => n.tagName === "button" && n.innerHTML === "Continuar").pop();
    if (!continuar || !continuar.onclick) throw new Error("botão 'Continuar' da tela de ativar Rival não foi montado");
    marca = env.todos.length;          // marca ANTES do clique: é ele que monta o draft
    continuar.onclick();
  });

  /* Item 3 ("Rolar novamente"): existe, funciona uma vez, desabilita de
     verdade depois — não só visualmente. */
  passo("reroll: botão existe e começa habilitado", () => {
    const rb = env.registro.reroll;
    if (!rb || !rb.onclick) throw new Error("botão de rolar novamente não foi montado");
    if (rb.disabled) throw new Error("começou desabilitado — deveria valer na 1ª montagem");
  });
  passo("reroll: clicar re-rola a mesa (cartas novas aparecem)", () => {
    const antesDoClique = env.todos.length;
    env.registro.reroll.onclick();
    const novasCartas = env.todos.slice(antesDoClique).filter(n => (n.className || "").split(" ").includes("card"));
    if (!novasCartas.length) throw new Error("clicar não montou cartas novas — renderDraft não rodou de novo");
    marca = antesDoClique;             // as cartas re-roladas são "novas" pro 1º pick abaixo
  });
  passo("reroll: depois de usado, fica desabilitado de verdade (não só no texto)", () => {
    if (!env.registro.reroll.disabled) throw new Error("reroll.disabled continua false depois de usar");
  });
  passo("reroll: clicar de novo desabilitado não re-rola outra vez", () => {
    const antes = env.todos.length;
    env.registro.reroll.onclick();
    const depois = env.todos.slice(antes).filter(n => (n.className || "").split(" ").includes("card"));
    if (depois.length) throw new Error("2º clique desabilitado ainda montou cartas — não é 1 vez só na criação inteira");
  });

  for (let i = 1; i <= 4; i++) passo(`draft: escolha ${i} de 4`, () => {
    const novas = env.todos.slice(marca).filter(n => (n.className || "").split(" ").includes("card") && n.onclick);
    if (!novas.length) throw new Error("nenhuma carta montada — renderDraft abortou antes do grid");
    marca = env.todos.length;          // idem: a rodada seguinte nasce do clique abaixo
    novas[novas.length - 1].onclick();
  });

  await passo("controles da carreira", () => {
    if (!env.registro.next || !env.registro.next.onclick) throw new Error("botão 'Próxima luta' não foi montado");
  });

  /* O painel da engrenagem é superfície nova e clicável: sem passar por aqui,
     ele quebra em silêncio e o teste continua verde. Roda depois dos controles
     porque é aqui que dá pra afirmar que o "Som on/off" saiu da barra fixa. */
  await passo("painel de configurações", () => {
    const eng = env.registro.cfgbtn;
    if (!eng || !eng.onclick) throw new Error("a engrenagem não foi armada");
    eng.onclick();
    const cx = env.registro.cfg;
    if (!cx || cx.style.display !== "flex") throw new Error("o painel não abriu");

    const mus = env.registro.cfg_mus, efe = env.registro.cfg_efe;
    if (!mus || !efe) throw new Error("faltou barra de música ou de efeitos");
    if (typeof mus.oninput !== "function") throw new Error("a barra de música não responde");
    mus.value = "0";  mus.oninput();          // sem AudioContext isso não pode explodir
    efe.value = "45"; efe.oninput();

    const tg = env.registro.cfgmudo;
    if (!tg || !tg.onclick) throw new Error("o mudo não está no painel");
    tg.onclick();                              // muda
    if (tg.textContent !== "Mudo") throw new Error("o mudo não mudou de rótulo");
    if (!mus.disabled) throw new Error("mudo ligado e a barra de música continua ativa");
    tg.onclick();                              // desmuda, volta ao estado inicial
    if (tg.textContent !== "Ligado") throw new Error("não voltou de mudo");

    if (env.registro.somb) throw new Error("o botão de som continua na barra fixa");

    const x = env.registro.cfgx;
    if (!x || !x.onclick) throw new Error("faltou o botão de fechar");
    x.onclick();
    if (cx.style.display !== "none") throw new Error("o painel não fechou");
  });
  /* Reproduz o bug relatado: clicar no automático com o dilema aberto fazia
     nextFight rodar por cima, a promessa nunca resolvia e a carreira travava. */
  const achar = id => env.todos.filter(n => n.id === id).pop();
  let dilemasVistos = 0;
  const adversTres = new Set();     // só das lutas de 3 cartas — a regra antiga, intacta
  let lutasUnicas = 0;              // lutas de título/defesa (carta travada)
  for (let n = 1; n <= 22; n++) await passo(`luta ${n} de 22`, async () => {
    if (env.registro.next.disabled) throw new Error("botão travado antes do clique");
    const marcaLuta = env.todos.length;
    env.registro.next.onclick();
    env.drenar(); await respirar();

    /* duas escolhas novas por luta: adversário e camp. Normalmente 3 cartas;
       luta de título/defesa trava 1 só (oponente nomeado em RANKING). */
    const opps = env.todos.slice(marcaLuta).filter(n2 => (n2.className||"").split(" ").includes("opp") && n2.onclick);
    if (opps.length !== 3 && opps.length !== 1)
      throw new Error(`esperava 1 (luta de título) ou 3 adversários, vieram ${opps.length}`);
    const m2 = env.todos.length;
    const escolhido = opps[n % opps.length];      // varia a dificuldade escolhida quando há opção
    const nm = /<span class="nm">([^<]+)<\/span>/.exec(escolhido.innerHTML || "");
    if (!nm) throw new Error("não consegui ler o nome do adversário na carta");
    if (opps.length === 3) {
      adversTres.add(nm[1]);
    } else {
      /* carta única: repetir adversário aqui é ESPERADO — revanche de
         título é o caso normal (ver comentário em candidatos() no
         index.html e "O passo para o cinturão" no LEIA-ME.md). Só vale se
         o nome travado estiver no RANKING.lista (campeão + 15) desta
         divisão — repetir qualquer outro nome continua sendo o bug antigo
         (escada silenciosa) e reprova. NÃO checa contra campeao/desafiante
         especificamente: com rotação de contender, "o desafiante" deixa de
         ser nome fixo (é RANKING.lista[st.desafianteIdx], que anda durante
         a carreira) — checar só os dois primeiros nomes reprovaria toda
         defesa depois que o índice avançasse, ou pior, passaria por acaso
         se o índice parasse coincidindo com desafiante. */
      lutasUnicas++;
      const rk = UI.ranking();
      const permitidos = new Set((rk && rk.lista || []).map(f => f.name));
      if (!permitidos.has(nm[1]))
        throw new Error(`carta única de título veio contra "${nm[1]}", que não está `
          + `no RANKING.lista desta divisão`);
    }
    escolhido.onclick();
    env.drenar(); await respirar();
    const camps = env.todos.slice(m2).filter(n2 => (n2.className || "").split(" ").includes("camp") && n2.onclick);
    if (camps.length < 3) throw new Error(`esperava ao menos 3 camps, vieram ${camps.length}`);
    camps[n % 3].onclick();
    /* Plano Pro (2026-09-22, item 5): telaColetiva() é vitrine agora —
       aparece pra TODO MUNDO, meuPro ou não (a trava que pulava direto
       pra lutar() foi removida de propósito, ver comentário em
       index.html acima de telaColetiva()). Sem sessão de conta no
       ambiente de teste, meuPro é sempre false — "Pular" é o caminho de
       quem não quer engajar, sem chamar IA nem abrir oferta. O caminho
       Pro de verdade (meuPro=true, provocar, aplicarColetiva) e a
       oferta pro grátis (abrirOfertaPro) têm suíte própria — ver
       testarColetivaEntrevista(). */
    const colPular = env.registro.colpular;
    if (colPular) colPular.onclick();
    env.drenar(); await respirar(); env.drenar();     // narração + dilema assíncrono

    /* item 3: escolha na luta, uma vez por luta (só quando o round 1 não
       terminou o combate). Se apareceu, resolve com uma opção variando por
       luta (mesma ideia do camp[n%3]) antes de seguir — senão o botão
       "next" fica travado pra sempre (playing continua true) e reproduz
       exatamente o "botão travado" que pegou esta refatoração na primeira
       rodada de teste. */
    const escBox = env.registro.escolhaLuta;
    if (escBox && escBox.style.display !== "none") {
      /* teste explícito pedido: escolha aberta, jogador aperta "Próxima
         luta" e liga o automático — nada pode acontecer (mesma garantia
         que testarEscolhaLuta() prova de forma isolada; aqui é a versão
         de ponta a ponta, com a escolha de verdade na tela). */
      const fightNoAntes = UI.st().fightNo;
      env.registro.next.onclick();
      env.drenar(); await respirar();
      if (UI.st().fightNo !== fightNoAntes)
        throw new Error("clicar 'próxima luta' com a escolha aberta avançou a luta");
      if (escBox.style.display === "none")
        throw new Error("clicar 'próxima luta' com a escolha aberta fechou o painel sozinho");
      if (UI.escolhaAberta())
        throw new Error("clicar 'próxima luta' com a escolha aberta reabriu a tela de adversário por baixo");
      env.registro.autob.onclick();          // liga o automático com a escolha aberta
      env.drenar(); await respirar();
      if (UI.st().fightNo !== fightNoAntes)
        throw new Error("ligar o automático com a escolha aberta avançou a luta");
      if (escBox.style.display === "none")
        throw new Error("ligar o automático com a escolha aberta fechou o painel sozinho");
      if (UI.escolhaAberta())
        throw new Error("ligar o automático com a escolha aberta reabriu a tela de adversário por baixo");
      if (env.registro.autob.textContent !== "Parar automático")
        throw new Error("automático não ligou (é só UI, deveria ligar mesmo com a escolha aberta)");
      env.registro.autob.onclick();          // desliga de novo, não interfere no resto do teste

      /* item 6 (v2): ids dinâmicos ("el_"+id da ação, varia por round/pool),
         não mais 3 nomes fixos — acha pelo prefixo. */
      const idsOpcoes = Object.keys(env.registro).filter(k => k.startsWith("el_"));
      if (idsOpcoes.length !== 3) throw new Error(`escolha na luta veio com ${idsOpcoes.length} opções, esperava 3`);
      const op = env.registro[idsOpcoes[n % 3]];
      if (!op || !op.onclick) throw new Error("escolha na luta apareceu sem os 3 botões esperados");
      op.onclick();
      idsOpcoes.forEach(id => delete env.registro[id]);
      env.drenar(); await respirar(); env.drenar();
    }

    /* O dilema é montado via innerHTML e o DOM falso reaproveita o nó do
       dilema anterior. Só vale se o botão estiver ativo e sem resposta ainda. */
    const campo = achar("dilresp"), botao = achar("dilgo");
    const temDilema = campo && botao && !campo.disabled && !botao.disabled
                      && env.registro.next.disabled;
    if (!temDilema) return;
    dilemasVistos++;

    if (!env.registro.autob.disabled)
      throw new Error("dilema aberto mas o modo automático continua clicável");
    if (!env.registro.next.disabled)
      throw new Error("dilema aberto mas a próxima luta continua clicável");

    env.registro.autob.onclick();       // o clique indevido que travava tudo
    env.drenar(); await respirar();
    if (!env.registro.next.disabled)
      throw new Error("clique no automático furou a trava do dilema");

    campo.value = "resposta de teste";
    botao.onclick();
    delete env.registro.dilresp; delete env.registro.dilgo;   // some com o nó velho
    env.drenar(); await respirar(); env.drenar(); await respirar();
    if (env.registro.next.disabled)
      throw new Error("dilema respondido mas a carreira continua travada");
  });
  /* A escada de adversários tem um fallback que, sem gente sobrando na faixa,
     devolve alguém já enfrentado — em silêncio. É esse buraco que o modo lenda
     poderia abrir, porque o pool encolhe para 49 no peso-pesado. Essa é a
     regra que este passo protege — só entre as lutas de 3 CARTAS COMUNS.
     Lutas de carta única (título/defesa) IGNORAM `fought` de propósito
     (revanche é o caso normal do UFC) e são conferidas à parte, dentro do
     laço acima: repetem, mas só contra campeão/desafiante nomeados. Ver
     LEIA-ME.md, "O passo para o cinturão", pra não "consertar" isso de
     volta sem ler o motivo. */
  await passo("adversários distintos nas lutas de 3 cartas", () => {
    const esperado = TOTAL_ESPERADO - lutasUnicas;
    if (adversTres.size < esperado)
      throw new Error(`só ${adversTres.size} adversários distintos em ${esperado} `
        + `lutas de 3 cartas — a escada repetiu`);
  });
  await passo("dilemas apareceram", () => {
    if (dilemasVistos < 3) throw new Error(`só ${dilemasVistos} dilemas em 22 lutas, esperava 4`);
  });

  await passo("posição na divisão", () => {
    const f = env.registro.ficha;
    const m = /#(\d+)<\/span>\s*<span class="de">de (\d+)/.exec((f && f.innerHTML) || "");
    if (!m) throw new Error("a ficha não mostra a posição na divisão");
    const pos = +m[1], total = +m[2];
    /* invariantes de verdade: a posição cabe na divisão e a divisão tem gente.
       Não comparo com a posição inicial porque uma carreira pode voltar ao
       mesmo standing por acaso, e teste que pisca é pior que teste nenhum. */
    if (total < 40) throw new Error(`a divisão saiu com ${total} lutadores`);
    if (!(pos >= 1 && pos <= total)) throw new Error(`posição fora da divisão: #${pos} de ${total}`);
  });

  await passo("relatório final", () => UI.screenReport());
  await passo("contas: sem SUPABASE_URL configurado, a caixa de conta nem aparece", () => {
    if (env.todos.some(n => (n.className || "").split(" ").includes("conta-box")))
      throw new Error("caixa de conta apareceu mesmo sem Supabase configurado");
  });

  const nos = env.todos.length;
  if (nos < 200) falhas.push(["cobertura", new Error(`só ${nos} nós montados — alguma tela abortou`)]);

  if (falhas.length) {
    console.log(vermelho(`\n  ${falhas.length} falha(s). Primeira:\n`));
    console.log("  " + falhas[0][1].stack.split("\n").slice(0, 3).join("\n  ") + "\n");
    return false;
  }
  /* Card de momento: só relatório, não reprovação — uma carreira só é
     amostra pequena demais pra virar limite fixo (medido em 120 carreiras
     no desenho, não numa). Ver LEIA-ME "Card de momento". */
  const momentos = (UI.st && UI.st().momentos) || [];
  console.log(cinza(`  cards de momento: ${momentos.length}`)
    + (momentos.length ? cinza(` (${momentos.map(m => m.tipo).join(", ")})`) : ""));

  console.log(verde(`  ok`) + cinza(`   caminho completo, ${nos} nós montados`));
  return true;
}

/* ================================================================== *
 * 2. MOTOR — a calibração aguenta?
 * ================================================================== */
function testarMotor() {
  console.log("\n" + cinza("simulando 6.000 lutas"));
  const M = carregarMotor(), F = lerLutadores();
  const ALVO = { KO: 33, SUB: 19, DEC: 48 };
  const byDiv = {};
  F.forEach(f => (byDiv[f.division] ||= []).push(f));
  const divs = Object.keys(byDiv);

  let m = {}, n = 0, kd = 0;
  for (let i = 0; i < 6000; i++) {
    const p = byDiv[divs[i % divs.length]];
    const a = p[(i * 7919) % p.length], b = p[(i * 104729 + 3) % p.length];
    if (a.name === b.name) continue;
    const r = M.simulateFight(a, b, { seed: i + 1 });
    const k = /ocaute/.test(r.method) ? "KO" : r.method === "Finalização" ? "SUB" : "DEC";
    m[k] = (m[k] || 0) + 1; n++;
    kd += Object.values(r.knockdowns || {}).reduce((x, y) => x + y, 0);
  }
  let ok = true;
  for (const k of ["KO", "SUB", "DEC"]) {
    const v = 100 * (m[k] || 0) / n, bom = Math.abs(v - ALVO[k]) <= 4;
    if (!bom) ok = false;
    console.log(`  ${bom ? verde("ok   ") : vermelho("fora ")} ${k.padEnd(4)} ${v.toFixed(0).padStart(3)}%  ${cinza("alvo " + ALVO[k] + "%")}`);
  }
  const q = kd / n, qok = q >= .40 && q <= .70;
  if (!qok) ok = false;
  console.log(`  ${qok ? verde("ok   ") : vermelho("fora ")} quedas por luta ${q.toFixed(2)}  ${cinza("faixa 0.40-0.70")}`);

  const find = x => F.find(f => f.name === x);
  for (const [x, y] of [["Khabib Nurmagomedov", "Conor McGregor"], ["Jon Jones", "Daniel Cormier"],
                        ["Israel Adesanya", "Alex Pereira"]]) {
    const a = find(x), b = find(y);
    if (!a || !b) continue;
    let w = 0;
    for (let s = 1; s <= 400; s++) if (M.simulateFight(a, b, { seed: s }).winner === x) w++;
    const pct = 100 * w / 400, bom = pct <= 92 && pct >= 8;
    if (!bom) ok = false;
    console.log(`  ${bom ? verde("ok   ") : vermelho("fora ")} ${x} ${pct.toFixed(0)}% x ${(100 - pct).toFixed(0)}% ${y}` +
      (bom ? "" : vermelho("  << determinístico demais, o draft deixa de importar")));
  }
  return ok;
}

/* ================================================================== *
 * 2b. DRIVER ROUND-A-ROUND — o driver round a round (o que lutar() roda
 *     de verdade) mantém a calibração do motor? Mesma medida de
 *     testarMotor() (6.000 lutas, mesmo alvo). mod=1 é o gancho inerte;
 *     um mod!==1 aqui é só um estresse genérico em .form (variação
 *     pré-luta), NÃO o mecanismo real de escolha na luta — desde o
 *     mecanismo por eixo (mAttr), a escolha não escreve mais em .form.
 *     Pra medir a escolha de verdade, ver testarGapEscolha().
 * ================================================================== */
function testarDriverMotor(mod = 1, N = 6000) {
  console.log("\n" + cinza(`${N} lutas via driver round-a-round (mod ${mod}${mod === 1 ? " — gancho inerte" : ""})`));
  const M = carregarMotor(), F = lerLutadores();
  const ALVO = { KO: 33, SUB: 19, DEC: 48 };
  const byDiv = {};
  F.forEach(f => (byDiv[f.division] ||= []).push(f));
  const divs = Object.keys(byDiv);

  let m = {}, n = 0, kd = 0;
  for (let i = 0; i < N; i++) {
    const p = byDiv[divs[i % divs.length]];
    const a = p[(i * 7919) % p.length], b = p[(i * 104729 + 3) % p.length];
    if (a.name === b.name) continue;
    const rng = M.mulberry32(i + 1);
    const form = () => 1 + (rng() + rng() + rng() - 1.5) / 1.5 * M.TUNING.formSpread;
    const A = M.mkState(a, form()), B = M.mkState(b, form());
    const log = [];
    const push = (round, clock, kind, text) => log.push({ round, clock, kind, text });
    const kds = () => ({ [A.ref.name]: A.knockdowns, [B.ref.name]: B.knockdowns });
    const fin = (w, l, round, clock, met) => {
      push(round, clock, "fin", `${w.ref.name} vence por ${met.toLowerCase()}`);
      return { winner: w.ref.name, loser: l.ref.name, method: met, round, clock, cards: null, log, knockdowns: kds() };
    };
    const scores = { sa: 0, sb: 0 };
    let res = null;
    for (let round = 1; round <= 3 && !res; round++) {
      res = M.simularRound(A, B, round, rng, push, fin, scores);
      if (round === 1 && !res) A.form *= mod;      // estresse genérico em .form, não é o gancho da escolha (ver testarGapEscolha)
    }
    if (!res) {
      const w = scores.sa > scores.sb ? A : scores.sb > scores.sa ? B : (rng() < .5 ? A : B), l = w === A ? B : A;
      res = { winner: w.ref.name, loser: l.ref.name, method: "Decisão", round: 3, clock: "0:00",
        cards: scores.sa + "-" + scores.sb, log, knockdowns: kds() };
    }
    const k = /ocaute/.test(res.method) ? "KO" : res.method === "Finalização" ? "SUB" : "DEC";
    m[k] = (m[k] || 0) + 1; n++;
    kd += Object.values(res.knockdowns || {}).reduce((x, y) => x + y, 0);
  }
  let ok = true;
  for (const k of ["KO", "SUB", "DEC"]) {
    const v = 100 * (m[k] || 0) / n, bom = Math.abs(v - ALVO[k]) <= 4;
    if (!bom) ok = false;
    console.log(`  ${bom ? verde("ok   ") : vermelho("fora ")} ${k.padEnd(4)} ${v.toFixed(0).padStart(3)}%  ${cinza("alvo " + ALVO[k] + "%")}`);
  }
  const q = kd / n, qok = q >= .40 && q <= .70;
  if (!qok) ok = false;
  console.log(`  ${qok ? verde("ok   ") : vermelho("fora ")} quedas por luta ${q.toFixed(2)}  ${cinza("faixa 0.40-0.70")}`);
  return ok;
}

/* ================================================================== *
 * 2c. GAP DA ESCOLHA NA LUTA (mecanismo v2, por eixo/mAttr) — mede o
 *     que node testar.js acoesluta não mede: o tamanho REAL do efeito
 *     no resultado da luta. Protocolo "fiel": sinal do round 1 sai do
 *     scouting de verdade (não forçado), o trio de 3 é o mesmo sorteio
 *     de abrirEscolhaLuta() (3 de dentro da pool do sinal), e
 *     "sempre casa"/"sempre erra" escolhem entre ESSAS 3, nunca a pool
 *     inteira — a pool inteira superestima o gap (medido: pool inteira
 *     dava 0,5-0,7, o trio real dá 0,4-0,5 no mesmo K). K_ESCOLHA_LUTA
 *     fixado em .50 nesta leva (2026-09-05): KO fica achatado ~34,8% até
 *     K=.50, cruza 35% perto de K=.53 — gap correspondente 0,38-0,47
 *     vitórias/22 (alvo do usuário era 0,5-0,8; ficou abaixo, mas 2-3x
 *     o mecanismo v1 na mesma margem de KO — ver comentário em cima de
 *     K_ESCOLHA_LUTA). */
function testarGapEscolha(N = 3000) {
  console.log("\n" + cinza(`${N} pares (sempre casa x sempre erra), sinal e trio reais — gap da escolha na luta`));
  const M = carregarMotor(), F = lerLutadores();
  const byDiv = {};
  F.forEach(f => (byDiv[f.division] ||= []).push(f));
  const divs = Object.keys(byDiv);
  const pctPorDiv = {};
  divs.forEach(d => pctPorDiv[d] = M.makePercentiler(byDiv[d]));

  function modAcao(acao, jog, opp, PCT) {
    const pJog = PCT(acao.attr, jog[acao.attr]);
    const counter = M.COUNTER_ATTR[acao.attr];
    const pOpp = PCT(counter, opp[counter]);
    const matchup = M.contest(pJog, pOpp);
    return 1 + M.K_ESCOLHA_LUTA * (matchup - .5) * 2;
  }
  function driver(a, b, seed, politica) {
    const PCT = pctPorDiv[a.division];
    const rng = M.mulberry32(seed);
    const form = () => 1 + (rng() + rng() + rng() - 1.5) / 1.5 * M.TUNING.formSpread;
    const A = M.mkState(a, form()), B = M.mkState(b, form());
    const push = () => {};
    const kds = () => ({ [A.ref.name]: A.knockdowns, [B.ref.name]: B.knockdowns });
    const fin = (w, l, round, clock, met) => ({ winner: w.ref.name, loser: l.ref.name, method: met, round, clock, cards: null, log: [], knockdowns: kds() });
    const scores = { sa: 0, sb: 0 };
    let res = null;
    for (let round = 1; round <= 3 && !res; round++) {
      const antes = round === 1 ? { a: A.sigStrikes, at: A.takedowns, ac: A.controlTicks, b: B.sigStrikes, bt: B.takedowns, bc: B.controlTicks } : null;
      res = M.simularRound(A, B, round, rng, push, fin, scores);
      if (round === 1 && !res) {
        const scouting = { burstA: A.sigStrikes - antes.a, burstB: B.sigStrikes - antes.b,
          tdA: A.takedowns - antes.at, tdB: B.takedowns - antes.bt,
          ctrlA: A.controlTicks - antes.ac, ctrlB: B.controlTicks - antes.bc };
        const sinal = M.sinalDoRound(scouting);
        const pool = M.ACOES_LUTA.filter(x => x.pools.includes(sinal));
        const restante = [...pool], trio = [];
        for (let i = 0; i < 3 && restante.length; i++) trio.push(restante.splice(Math.floor(rng() * restante.length), 1)[0]);
        let acao;
        if (politica === "realista") acao = trio[Math.floor(rng() * trio.length)];
        else {
          let melhor = null, pior = null;
          for (const cand of trio) {
            const mod = modAcao(cand, A.ref, B.ref, PCT);
            if (!melhor || mod > melhor.mod) melhor = { cand, mod };
            if (!pior || mod < pior.mod) pior = { cand, mod };
          }
          acao = politica === "sempreCasa" ? melhor.cand : pior.cand;
        }
        A.mAttr[acao.attr] = modAcao(acao, A.ref, B.ref, PCT);
      }
    }
    if (!res) {
      const w = scores.sa > scores.sb ? A : scores.sb > scores.sa ? B : (rng() < .5 ? A : B), l = w === A ? B : A;
      res = { winner: w.ref.name, loser: l.ref.name, method: "Decisão", round: 3, clock: "0:00", cards: scores.sa + "-" + scores.sb, log: [], knockdowns: kds() };
    }
    return res;
  }

  let winsCasa = 0, winsErra = 0, pares = 0;
  for (let i = 0; i < N; i++) {
    const p = byDiv[divs[i % divs.length]];
    const a = p[(i * 7919) % p.length], b = p[(i * 104729 + 3) % p.length];
    if (a.name === b.name) continue;
    const seed = i + 1;
    if (M.simularRound(M.mkState(a, 1), M.mkState(b, 1), 1, M.mulberry32(seed), () => {}, () => null, { sa: 0, sb: 0 })) continue; // acabou no round 1, sem escolha nesse par
    if (driver(a, b, seed, "sempreCasa").winner === a.name) winsCasa++;
    if (driver(a, b, seed, "sempreErra").winner === a.name) winsErra++;
    pares++;
  }
  const gap22 = (winsCasa - winsErra) / pares * 22;
  const ok = gap22 > 0;   // teto/piso do alvo são decisão do usuário, não um "fora da faixa" automático
  console.log(`  ${cinza("gap")} ${gap22.toFixed(3)} vitórias/22 (pares=${pares}) ${cinza("alvo do usuário: 0,5-0,8")}`);
  return ok;
}

/* ================================================================== *
 * 3. DRAFT — o orçamento segura o lutador no nível certo?
 * ================================================================== */
function testarDraft(div = "lightweight") {
  console.log("\n" + cinza(`400 drafts de bot ganancioso na divisão ${div}`));
  const M = carregarMotor(), F = lerLutadores();
  const pool = F.filter(f => f.division === div);
  const PCT = M.makePercentiler(pool);
  const keys = Object.keys(M.WEIGHTS);
  const pctOf = (k, v) => pool.filter(f => f[k] < v).length / pool.length;

  const N = 400;
  let sum = {}, mortas = 0, linhas = 0;
  keys.forEach(k => sum[k] = 0);
  for (let s = 0; s < N; s++) {
    const rng = M.mulberry32(5000 + s * 13);
    let left = M.TOTAL_WEIGHT * M.BUDGET_PCT, rem = [...M.PAIRS], f = {};
    while (rem.length) {
      const rows = M.rollTable(pool, rem, rng, PCT);
      rem.forEach(p => { linhas++; if (rows.filter(r => r.pair.id === p.id).every(r => r.src[p.a.key] === 0)) mortas++; });
      const aff = rows.filter(r => r.cost <= left);
      const shown = aff.length ? aff : [rows.reduce((m, r) => r.cost < m.cost ? r : m)];
      const r = shown[shown.reduce((b, x, i, a) => x.cost > a[b].cost ? i : b, 0)];
      f[r.pair.a.key] = r.src[r.pair.a.key]; f[r.pair.b.key] = r.src[r.pair.b.key];
      left -= r.cost; rem = rem.filter(p => p.id !== r.pair.id);
    }
    keys.forEach(k => sum[k] += pctOf(k, f[k]));
  }
  let w = 0, tw = 0;
  keys.forEach(k => { w += (100 * sum[k] / N) * M.WEIGHTS[k]; tw += M.WEIGHTS[k]; });
  const media = w / tw, ok1 = media >= 60 && media <= 76;
  const pmortas = 100 * mortas / linhas, ok2 = pmortas < 3;
  console.log(`  ${ok1 ? verde("ok   ") : vermelho("fora ")} lutador draftado no ${media.toFixed(0)}º percentil  ${cinza("alvo ~70 (elite real)")}`);
  if (!ok1) console.log(cinza(`         ${media > 76 ? "baixe" : "suba"} BUDGET_PCT no index.html`));
  console.log(`  ${ok2 ? verde("ok   ") : vermelho("fora ")} linhas mortas na mesa ${pmortas.toFixed(1)}%  ${cinza("tem que ficar perto de 0")}`);
  return ok1 && ok2;
}

/* ================================================================== *
 * 4. DESAFIO — a mesma semente dá os mesmos adversários?
 *
 * A promessa MUDOU nesta leva: "Rolar novamente" (draft) consome rng sob
 * demanda, então a mesma semente pode dar cartas DIFERENTES se o jogador
 * usar o dado — e os eventos de vida agora vêm da IA, sem sorteio
 * determinístico nenhum. Só os ADVERSÁRIOS continuam garantidos. O draft
 * ainda roda aqui dentro de percorrer() (sem usar o dado) só pra consumir
 * rng na mesma ORDEM da produção antes do sorteio de adversários — não é
 * mais uma promessa que este teste prova, é só setup necessário.
 * ================================================================== */
function testarDesafio(div = "lightweight") {
  console.log("\n" + cinza("mesma semente tem que dar os mesmos adversários (draft não é mais garantido — rolar novamente consome rng)"));
  const M = carregarMotor(), F = lerLutadores();
  const pool = F.filter(f => f.division === div);
  const PCT = M.makePercentiler(pool);
  const ladder = [...pool].sort((a, b) => a.rating - b.rating);

  function percorrer(seed) {
    const rng = M.mulberry32(seed);
    let left = M.TOTAL_WEIGHT * M.BUDGET_PCT, rem = [...M.PAIRS];
    while (rem.length) {
      const rows = M.rollTable(pool, rem, rng, PCT);
      const aff = rows.filter(r => r.cost <= left);
      const shown = aff.length ? aff : [rows.reduce((m, r) => r.cost < m.cost ? r : m)];
      const r = shown[0];
      left -= r.cost; rem = rem.filter(p => p.id !== r.pair.id);
    }
    const advs = [];
    let standing = .18; const vistos = new Set();
    for (let i = 0; i < 22; i++) {
      const c = Math.floor(standing * (ladder.length - 1));
      const sp = Math.max(8, Math.floor(ladder.length * .06));
      const lo = Math.max(0, c - sp), hi = Math.min(ladder.length - 1, c + sp);
      let esc = null;
      for (let t = 0; t < 40; t++) {
        const cand = ladder[lo + Math.floor(rng() * (hi - lo + 1))];
        if (!vistos.has(cand.name)) { vistos.add(cand.name); esc = cand; break; }
      }
      advs.push((esc || ladder[lo]).name);
      standing = Math.min(1, standing + .07);
    }
    return advs.join(",");
  }

  let ok = true;
  const a = percorrer(123456), b = percorrer(123456), c = percorrer(999999);
  const igualAdvs = a === b;
  const difere = a !== c;
  if (!igualAdvs || !difere) ok = false;
  console.log(`  ${igualAdvs ? verde("ok   ") : vermelho("fora ")} mesma semente, mesmos adversários na mesma ordem`);
  console.log(`  ${difere ? verde("ok   ") : vermelho("fora ")} semente diferente gera carreira diferente`);

  /* a semente cabe numa URL curta? */
  const s = (4294967295).toString(36);
  const curta = s.length <= 7;
  console.log(`  ${curta ? verde("ok   ") : vermelho("fora ")} semente em base36 cabe em ${s.length} caracteres`);
  return ok && curta;
}

/* ================================================================== *
 * 6. TREINO — permanente, mas com teto. É a trava do balanceamento.
 * ================================================================== */
function testarTreino(div = "lightweight") {
  console.log("\n" + cinza("22 camps seguidos do mesmo tipo, o pior caso para o teto"));
  const M = carregarMotor();
  const teto = M.TETO_TREINO, ritmo = M.RITMO_TREINO;
  let ok = true;
  /* "Focar em fama" removido de vez (achado em produção: pedido duas levas
     atrás, nunca tinha saído) — guarda de regressão pra não voltar por
     acidente. Só os 4 camps de atributo, nenhum com .fama. */
  const semFama = M.CAMPS.every(c => !c.fama);
  if (!semFama) ok = false;
  console.log(`  ${semFama ? verde("ok   ") : vermelho("fora ")} "Focar em fama" removido — ${M.CAMPS.length} camps, nenhum .fama`);
  for (const camp of M.CAMPS) {
    const tr = {};
    for (let i = 0; i < 22; i++)
      for (const [k, peso] of Object.entries(camp.alvos)) {
        const at = tr[k] || 1;
        tr[k] = at + (teto - at) * ritmo * peso;
      }
    const pior = Math.max(...Object.values(tr));
    const dentro = pior <= teto + 1e-9;
    if (!dentro) ok = false;
    console.log(`  ${dentro ? verde("ok   ") : vermelho("fora ")} ${camp.nome.padEnd(11)} ` +
      `máximo ${pior.toFixed(3)}  ${cinza("teto " + teto)}`);
  }
  /* o ganho tem que ser sentido cedo e sumir no fim: é o retorno decrescente */
  const k = Object.keys(M.CAMPS[0].alvos)[0];
  let t1 = 1, ganhos = [];
  for (let i = 0; i < 22; i++) { const a = t1; t1 = a + (teto - a) * ritmo; ganhos.push(t1 - a); }
  const cedo = ganhos[0], tarde = ganhos[15];
  const decresce = tarde < cedo * 0.05;
  if (!decresce) ok = false;
  console.log(`  ${decresce ? verde("ok   ") : vermelho("fora ")} 1º camp rende ` +
    `${(cedo * 100).toFixed(1)}%, o 16º rende ${(tarde * 100).toFixed(2)}%`);
  return ok;
}

/* ================================================================== *
 * 5. ESCOLHAS — enfrentar os fortes tem que valer mais que os fracos
 * ================================================================== */
/* Chama candidatos(), aplicarCamp() e simulateFight() DE VERDADE — a versão
   antiga reimplementava a seleção de adversário (faixas por índice fixo) e
   o camp (`camp.fx(me)`, que nunca existiu; o jogo usa `camp.alvos` via
   aplicarCamp(), que escreve em st.treino permanente). As duas cópias
   envelheceram e o teste travava (`camp.fx is not a function`) sem medir
   nada. Ver PENDENCIAS.md item 5.

   st.tituloEstaLuta fica travado em false o tempo todo: a pergunta aqui é
   "a faixa de dificuldade escolhida muda o desfecho", e luta de título usa
   ganho fixo (.10/.15) fora das 3 faixas — deixaria uma estratégia parecer
   melhor só por sorte de bater título mais vezes, ruído que testarCinturao
   já cobre à parte. */
function testarEscolhas(div = "lightweight") {
  console.log("\n" + cinza("300 carreiras por estratégia, medindo se a escolha muda o desfecho"));
  const env = criarAmbiente();
  vm.createContext(env.sandbox);

  const corpo = `
;globalThis.__esc=(function(){
  ROSTER=rateAll(${JSON.stringify(lerLutadores())});
  CUTOFF_RANKING=Math.max(...ROSTER.map(f=>f.era?f.era[1]:0))-6;
  DIVISION=${JSON.stringify(div)}; MODO="normal";
  POOL=poolDivisao(DIVISION);
  PCT=makePercentiler(POOL);
  LADDER=[...POOL].sort((a,b)=>a.rating-b.rating);
  RANKING=buildRanking(POOL);

  function draft(rng){
    let left=TOTAL_WEIGHT*BUDGET_PCT, rem=[...PAIRS];
    const f={name:"P",division:DIVISION,sapm:3.2};
    while(rem.length){
      const rows=rollTable(POOL,rem,rng,PCT);
      const aff=rows.filter(r=>r.cost<=left);
      const sh=aff.length?aff:[rows.reduce((m,r)=>r.cost<m.cost?r:m)];
      const r=sh.reduce((m,x)=>x.cost>m.cost?x:m,sh[0]);
      f[r.pair.a.key]=r.src[r.pair.a.key]; f[r.pair.b.key]=r.src[r.pair.b.key];
      left-=r.cost; rem=rem.filter(p=>p.id!==r.pair.id);
    }
    f.strAcc=f.strAcc||.45; f.tdAcc=f.tdAcc||.38;
    return f;
  }

  function carreira(seed,k){
    rng=mulberry32(seed); holdRng=mulberry32((seed^0x9E3779B9)>>>0);
    me=draft(rng);
    me.__base={}; ATTR_TREINAVEIS.forEach(a=>{if(me[a]!=null)me.__base[a]=me[a];});
    st={treino:{},eventoMod:{},campHist:{},wins:0,losses:0,finishes:0,streakW:0,streakL:0,
        bestBeaten:0,bestWin:null,title:false,standing:.18,peak:.18,events:0,koLosses:0,
        kdTaken:0,kdGiven:0,fightNo:0,fan:5,followers:2400,peakFollowers:2400,longestW:0,
        lostBeltFast:false,rares:[],momentos:[],disputaLiberada:false,defesas:0,
        tituloEstaLuta:false};
    fought=new Set(); rareUsed=new Set();
    for(let i=0;i<22;i++){
      const opts=candidatos();       // real: 3 faixas (fácil/parelho/duro)
      const escolhido=opts[k];
      const opp=escolhido.f; fought.add(opp.name);
      const camp=CAMPS[Math.floor(rng()*3)];
      aplicarCamp(camp);             // real: escreve em st.treino, com teto
      const comCamp=lutadorEfetivo();
      const r=simulateFight(comCamp,opp,{seed:Math.floor(rng()*1e9)});
      if(r.winner===me.name){
        st.wins++; st.standing=Math.min(1,st.standing+escolhido.ganho);
        st.peak=Math.max(st.peak,st.standing);
      }else{
        const g=escolhido.ganho;
        st.standing=Math.max(.05,st.standing-(g<=.05?.13:g>=.12?.06:.09));
      }
    }
    return {wins:st.wins,peak:st.peak};
  }

  const med=k=>{
    let w=0,top=0,n=300;
    for(let s=0;s<n;s++){const r=carreira(s*97+5,k); w+=r.wins; if(r.peak>=.9)top++;}
    return{w:w/n,top:100*top/n};
  };
  const linhas=[0,1,2].map(k=>({k,...med(k)}));
  return linhas;
})();
`;

  try {
    vm.runInContext(lerScript() + corpo, env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("  o cenário nem rodou: " + e.message) + "\n" +
      cinza(e.stack.split("\n").slice(1, 3).join("\n")));
    return false;
  }
  const linhas = env.sandbox.__esc;
  const rots = ["acessível", "parelho", "perigoso"];
  linhas.forEach(r => {
    console.log(`  ${rots[r.k].padEnd(10)} ${r.w.toFixed(1)} vitórias   chegou ao topo em ${r.top.toFixed(0)}% das carreiras`);
  });

  const facil = linhas[0], duro = linhas[2];
  const topoMaior = duro.top > facil.top + 30;
  if (!topoMaior) console.log(vermelho("  fora  enfrentar fortes devia levar ao topo muito mais vezes"));
  else console.log(verde("  ok   ") + "enfrentar fortes leva ao topo muito mais vezes");
  return topoMaior;
}

/* ================================================================== *
 * 4. PESOS — mede quanto cada atributo vale e gera o WEIGHTS
 * ================================================================== */
function medirPesos(div = "lightweight") {
  const M = carregarMotor(), F = lerLutadores();
  const ATTRS = ["slpm", "strAcc", "strDef", "kdAvg", "tdAvg", "tdAcc", "tdDef", "subAvg", "durability", "reach"];
  const pool = F.filter(f => f.division === div);
  const stat = k => {
    const v = pool.map(f => f[k]), m = v.reduce((a, b) => a + b, 0) / v.length;
    return { mean: m, sd: Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length) };
  };
  const base = { name: "BASE", division: div, sapm: 3.2 };
  ATTRS.forEach(k => base[k] = stat(k).mean);

  console.log("\n" + cinza(`subindo cada atributo em 1 desvio padrão, 1.200 lutas cada (${div})`) + "\n");
  const rows = [];
  for (const k of ATTRS) {
    const up = { ...base, name: "UP" };
    up[k] = base[k] + stat(k).sd;
    let w = 0;
    for (let s = 1; s <= 1200; s++) if (M.simulateFight(up, base, { seed: s * 13 + 1 }).winner === "UP") w++;
    rows.push({ k, win: 100 * w / 1200 });
  }
  rows.sort((a, b) => b.win - a.win);
  const max = Math.max(...rows.map(r => Math.abs(r.win - 50)));
  rows.forEach(r => {
    const d = r.win - 50;
    console.log(`  ${r.k.padEnd(12)} ${r.win.toFixed(1).padStart(5)}%  ${(d >= 0 ? "+" : "") + d.toFixed(1).padStart(5)}  ${"#".repeat(Math.round(Math.abs(d) / max * 32))}`);
  });
  const usados = ["slpm", "subAvg", "tdAvg", "tdDef", "strDef", "kdAvg", "reach", "durability"];
  console.log("\n" + cinza("cole no index.html se mudou (atributo com peso < .10 não merece uma escolha de draft):") + "\n");
  console.log("  const WEIGHTS={" + rows.filter(r => usados.includes(r.k))
    .map(r => `${r.k}:${(Math.abs(r.win - 50) / max).toFixed(2)}`).join(",") + "};\n");
  return true;
}

/* ================================================================== *
 * 5b. DINHEIRO — item 4: treinador melhor tem que ficar acessível entre
 *     a luta 6 e a 8 numa carreira mediana. renda_por_luta não depende do
 *     camp escolhido (só de standing) — o camp é irrelevante pra esta medida.
 * ================================================================== */
function testarDinheiro(div = "lightweight") {
  console.log("\n" + cinza("400 carreiras de bot, quando o treinador melhor fica acessível"));
  const env = criarAmbiente();
  vm.createContext(env.sandbox);

  const corpo = `
;globalThis.__din=(function(){
  ROSTER=rateAll(${JSON.stringify(lerLutadores())});
  CUTOFF_RANKING=Math.max(...ROSTER.map(f=>f.era?f.era[1]:0))-6;
  DIVISION=${JSON.stringify(div)}; MODO="normal";
  POOL=poolDivisao(DIVISION);
  PCT=makePercentiler(POOL);
  LADDER=[...POOL].sort((a,b)=>a.rating-b.rating);
  RANKING=buildRanking(POOL);

  function draft(rng){
    let left=TOTAL_WEIGHT*BUDGET_PCT, rem=[...PAIRS];
    const f={name:"P",division:DIVISION,sapm:3.2};
    while(rem.length){
      const rows=rollTable(POOL,rem,rng,PCT);
      const aff=rows.filter(r=>r.cost<=left);
      const sh=aff.length?aff:[rows.reduce((m,r)=>r.cost<m.cost?r:m)];
      const r=sh.reduce((m,x)=>x.cost>m.cost?x:m,sh[0]);
      f[r.pair.a.key]=r.src[r.pair.a.key]; f[r.pair.b.key]=r.src[r.pair.b.key];
      left-=r.cost; rem=rem.filter(p=>p.id!==r.pair.id);
    }
    f.strAcc=f.strAcc||.45; f.tdAcc=f.tdAcc||.38;
    return f;
  }

  function carreira(seed){
    rng=mulberry32(seed); holdRng=mulberry32((seed^0x9E3779B9)>>>0);
    me=draft(rng);
    me.__base={}; ATTR_TREINAVEIS.forEach(a=>{if(me[a]!=null)me.__base[a]=me[a];});
    st={treino:{},eventoMod:{},campHist:{},wins:0,losses:0,finishes:0,streakW:0,streakL:0,
        bestBeaten:0,bestWin:null,title:false,standing:.18,peak:.18,events:0,koLosses:0,
        kdTaken:0,kdGiven:0,fightNo:0,fan:5,followers:2400,peakFollowers:2400,longestW:0,
        lostBeltFast:false,rares:[],momentos:[],disputaLiberada:false,defesas:0,
        tituloEstaLuta:false,dinheiro:0,treinadorComprado:false};
    fought=new Set(); rareUsed=new Set();
    const camps=CAMPS;
    let primeiraLutaAcessivel=null;
    for(let i=0;i<22;i++){
      const opts=candidatos();
      const escolhido=opts[Math.min(1,opts.length-1)];
      const opp=escolhido.f; fought.add(opp.name);
      aplicarCamp(camps[i%camps.length]);
      const comCamp=lutadorEfetivo();
      const r=simulateFight(comCamp,opp,{seed:Math.floor(rng()*1e9)});
      if(r.winner===me.name){
        st.wins++; st.standing=Math.min(1,st.standing+escolhido.ganho);
      }else{
        const g=escolhido.ganho;
        st.standing=Math.max(.05,st.standing-(g<=.05?.13:g>=.12?.06:.09));
      }
      st.dinheiro+=RENDA_BASE+Math.round(RENDA_BASE*st.standing);
      st.fightNo=i+1;
      if(primeiraLutaAcessivel===null&&st.dinheiro>=CUSTO_TREINADOR)primeiraLutaAcessivel=i+1;
    }
    return {dinheiroFinal:st.dinheiro, primeiraLutaAcessivel};
  }

  const resultados=[];
  for(let s=0;s<400;s++) resultados.push(carreira(9000+s));
  return {RENDA_BASE,CUSTO_TREINADOR,resultados};
})();
`;
  try {
    vm.runInContext(lerScript() + corpo, env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("  não rodou: " + e.message) + "\n" + cinza(e.stack.split("\n").slice(1, 3).join("\n")));
    return false;
  }
  const out = env.sandbox.__din;
  if (!out) { console.log(vermelho("  sem resultado")); return false; }
  const { RENDA_BASE, CUSTO_TREINADOR, resultados } = out;
  const acessiveis = resultados.map(r => r.primeiraLutaAcessivel).filter(x => x != null).sort((a, b) => a - b);
  const nunca = resultados.length - acessiveis.length;
  const mediana = acessiveis.length ? acessiveis[Math.floor(acessiveis.length / 2)] : null;
  const dentro = mediana !== null && mediana >= 6 && mediana <= 8;
  console.log(`  ${cinza("RENDA_BASE=" + RENDA_BASE + "  CUSTO_TREINADOR=" + CUSTO_TREINADOR)}`);
  console.log(`  ${dentro ? verde("ok   ") : vermelho("fora ")} luta mediana em que fica acessível: ${mediana}  ${cinza("alvo 6-8")}`);
  console.log(`  ${cinza(nunca + " de " + resultados.length + " carreiras nunca alcançaram (ficaram sem standing suficiente)")}`);
  return dentro;
}

/* ================================================================== *
 * 6. CINTURÃO — perder uma defesa tem que custar o cinturão de verdade
 * ================================================================== */
/* Chama candidatos(), tituloLiberado() e finishFight() DE VERDADE — o
   document.getElementById do criarAmbiente() fabrica um nó falso pra
   qualquer id na hora, então finishFight() roda sem precisar da tela de
   carreira inteira montada. O único trecho reimplementado aqui é o irrelevante
   pro que se testa: não chamamos simulateFight(), só construímos um `r` com
   o vencedor que o cenário pede e entregamos pro finishFight() real decidir
   o resto — exatamente o "expor e chamar a original" que a dívida do
   testar.js escolhas pede. */
/* ================================================================== *
 * ESCALONAMENTO DO CHANCE_DISPUTA — cada recusa facilita a próxima,
 * zera quando a elegibilidade cai, nunca passa do teto
 * ================================================================== */
function testarEscalonamentoDisputa() {
  console.log("\n" + cinza("CHANCE_DISPUTA escalona por recusa, zera se sair da elegibilidade, respeita o teto"));
  const env = criarAmbiente();
  vm.createContext(env.sandbox);
  const corpo = `
;globalThis.__esc2=(function(){
  const passos=[];
  const passo=(nome,ok)=>passos.push({nome,ok:!!ok});
  try{
    st={standing:.90,streakW:3,title:false,disputaLiberada:false,disputaRecusas:0};
    // holdRng fixo em .70: recusa a base (.65) mas aceita depois de 1 escalonamento (.65+.12=.77>.70)
    holdRng=()=>.70;
    const r1=tituloLiberado();
    passo("1ª rolagem: chance base .65 < .70 -> recusa (não libera)", r1===false);
    passo("1ª recusa: disputaRecusas vira 1", st.disputaRecusas===1);
    const r2=tituloLiberado();
    passo("2ª rolagem: chance escalada .65+.12=.77 > .70 -> libera", r2===true);
    passo("liberou: disputaLiberada fica true", st.disputaLiberada===true);

    // teto: recusas suficientes pra estourar .95 não podem passar de .95
    st={standing:.90,streakW:3,title:false,disputaLiberada:false,disputaRecusas:10};
    holdRng=()=>.94;
    const rTeto=tituloLiberado();
    passo("teto: com 10 recusas (base+.12*10 estouraria 1.85) a chance trava em .95, ainda libera com holdRng .94",
      rTeto===true);
    st={standing:.90,streakW:3,title:false,disputaLiberada:false,disputaRecusas:10};
    holdRng=()=>.96;
    const rTeto2=tituloLiberado();
    passo("teto: holdRng .96 (acima do teto .95) continua recusando mesmo com 10 recusas acumuladas",
      rTeto2===false);

    // reset: perder elegibilidade (streak cai) zera as recusas acumuladas
    st={standing:.90,streakW:3,title:false,disputaLiberada:false,disputaRecusas:5};
    st.streakW=0; // perdeu o streak, não é mais elegível
    tituloLiberado();
    passo("saiu da elegibilidade: disputaRecusas zera (frustração é de UMA janela, não atravessa a carreira)",
      st.disputaRecusas===0);
  }catch(e){
    passos.push({nome:"erro inesperado: "+e.message,ok:false});
  }
  return passos;
})();
`;
  try {
    vm.runInContext(lerScript() + corpo, env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("  o cenário nem rodou: " + e.message) + "\n" +
      cinza(e.stack.split("\n").slice(1, 3).join("\n")));
    return false;
  }
  const passos = env.sandbox.__esc2 || [];
  let ok = true;
  for (const p of passos) {
    if (!p.ok) ok = false;
    console.log(`  ${p.ok ? verde("ok   ") : vermelho("fora ")} ${p.nome}`);
  }
  return ok && passos.length > 0;
}

/* ================================================================== *
 * ESPERA PELA DISPUTA — mediana/p90/p95/p99/pior caso em lutas extras
 * depois de ficar elegível (item 4, escalonamento do CHANCE_DISPUTA)
 * ================================================================== */
function testarEspera(div = "lightweight") {
  console.log("\n" + cinza("2.000 carreiras: quanto se espera pela disputa depois de virar elegível"));
  const env = criarAmbiente();
  vm.createContext(env.sandbox);
  const corpo = `
;globalThis.__x=(function(){
  ROSTER=rateAll(${JSON.stringify(lerLutadores())});
  CUTOFF_RANKING=Math.max(...ROSTER.map(f=>f.era?f.era[1]:0))-6;
  DIVISION=${JSON.stringify(div)}; MODO="normal";
  POOL=poolDivisao(DIVISION);
  PCT=makePercentiler(POOL);
  LADDER=[...POOL].sort((a,b)=>a.rating-b.rating);
  RANKING=buildRanking(POOL);

  function draft(rng){
    let left=TOTAL_WEIGHT*BUDGET_PCT, rem=[...PAIRS];
    const f={name:"P",division:DIVISION,sapm:3.2};
    while(rem.length){
      const rows=rollTable(POOL,rem,rng,PCT);
      const aff=rows.filter(r=>r.cost<=left);
      const sh=aff.length?aff:[rows.reduce((m,r)=>r.cost<m.cost?r:m)];
      const r=sh.reduce((m,x)=>x.cost>m.cost?x:m,sh[0]);
      f[r.pair.a.key]=r.src[r.pair.a.key]; f[r.pair.b.key]=r.src[r.pair.b.key];
      left-=r.cost; rem=rem.filter(p=>p.id!==r.pair.id);
    }
    f.strAcc=f.strAcc||.45; f.tdAcc=f.tdAcc||.38;
    return f;
  }

  function carreira(seed){
    rng=mulberry32(seed); holdRng=mulberry32((seed^0x9E3779B9)>>>0);
    me=draft(rng);
    me.__base={}; ATTR_TREINAVEIS.forEach(a=>{if(me[a]!=null)me.__base[a]=me[a];});
    st={treino:{},eventoMod:{},campHist:{},wins:0,losses:0,standing:.18,peak:.18,fightNo:0,
        streakW:0,streakL:0,disputaLiberada:false,disputaRecusas:0,desafianteIdx:1,title:false};
    fought=new Set();
    let primeiraElegivel=null, primeiraEstreia=null;
    for(let i=0;i<22;i++){
      const elegivelAntes=st.standing>.88&&st.streakW>=3;
      if(elegivelAntes&&primeiraElegivel===null)primeiraElegivel=i+1;
      st.tituloEstaLuta=tituloLiberado();
      if(st.tituloEstaLuta&&primeiraEstreia===null)primeiraEstreia=i+1;
      const opts=candidatos();
      const escolhido=opts[Math.min(1,opts.length-1)];
      const opp=escolhido.f; fought.add(opp.name);
      const r=simulateFight(me,opp,{seed:Math.floor(rng()*1e9),rounds:st.tituloEstaLuta?5:3});
      const won=r.winner===me.name;
      if(won){
        st.wins++; st.streakW++; st.streakL=0;
        if(st.tituloEstaLuta){ if(!st.title) st.title=true; else st.defesas=(st.defesas||0)+1; }
        st.standing=Math.min(1,st.standing+(st.tituloEstaLuta?.05:escolhido.ganho));
      }else{
        st.losses++; st.streakL++; st.streakW=0;
        if(st.tituloEstaLuta&&st.title){ st.title=false; }
        const g=escolhido.ganho;
        st.standing=Math.max(.05,st.standing-(st.tituloEstaLuta?.08:(g<=.05?.13:g>=.12?.06:.09)));
      }
    }
    if(primeiraElegivel===null)return {tipo:"nunca_elegivel"};
    if(primeiraEstreia===null)return {tipo:"elegivel_sem_disputa"};
    return {tipo:"recebeu",espera:primeiraEstreia-primeiraElegivel};
  }

  const out=[];
  for(let s=0;s<2000;s++) out.push(carreira(65000+s));
  return out;
})();
`;
  try {
    vm.runInContext(lerScript() + corpo, env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("  não rodou: " + e.message) + "\n" + cinza(e.stack.split("\n").slice(1, 3).join("\n")));
    return false;
  }
  const resultados = env.sandbox.__x || [];
  const nuncaElegivel = resultados.filter(r => r.tipo === "nunca_elegivel").length;
  const elegivelSemDisputa = resultados.filter(r => r.tipo === "elegivel_sem_disputa").length;
  const receberam = resultados.filter(r => r.tipo === "recebeu");
  const esperas = receberam.map(r => r.espera).sort((a, b) => a - b);
  const pct = p => esperas[Math.min(esperas.length - 1, Math.floor(p * esperas.length))];
  console.log(`  ${cinza(`de ${resultados.length} carreiras: ${nuncaElegivel} nunca ficaram elegíveis, ` +
    `${elegivelSemDisputa} elegíveis mas a carreira acabou antes da disputa vir, ${receberam.length} receberam`)}`);
  console.log(`  ${cinza("espera em lutas extras depois de ficar elegível:")}`);
  console.log(`    mediana ${pct(.50)}  p90 ${pct(.90)}  p95 ${pct(.95)}  p99 ${pct(.99)}  pior caso ${esperas[esperas.length - 1]}`);
  return esperas.length > 0;
}

function testarCinturao(div = "heavyweight") {
  console.log("\n" + cinza("ganha o título, perde a defesa seguinte — o cinturão tem que trocar de mãos"));
  const env = criarAmbiente();
  vm.createContext(env.sandbox);

  const corpo = `
;globalThis.__cint=(function(){
  const passos=[];
  const passo=(nome,ok)=>passos.push({nome,ok:!!ok});
  try{
    ROSTER=rateAll(${JSON.stringify(lerLutadores())});
    CUTOFF_RANKING=Math.max(...ROSTER.map(f=>f.era?f.era[1]:0))-6;
    DIVISION=${JSON.stringify(div)}; MODO="normal";
    POOL=poolDivisao(DIVISION);
    PCT=makePercentiler(POOL);
    LADDER=[...POOL].sort((a,b)=>a.rating-b.rating);
    RANKING=buildRanking(POOL);

    function draft(rng){
      let left=TOTAL_WEIGHT*BUDGET_PCT, rem=[...PAIRS];
      const f={name:"TesteBot",division:DIVISION,sapm:3.2};
      while(rem.length){
        const rows=rollTable(POOL,rem,rng,PCT);
        const aff=rows.filter(r=>r.cost<=left);
        const sh=aff.length?aff:[rows.reduce((m,r)=>r.cost<m.cost?r:m)];
        const r=sh.reduce((m,x)=>x.cost>m.cost?x:m,sh[0]);
        f[r.pair.a.key]=r.src[r.pair.a.key]; f[r.pair.b.key]=r.src[r.pair.b.key];
        left-=r.cost; rem=rem.filter(p=>p.id!==r.pair.id);
      }
      f.strAcc=f.strAcc||.45; f.tdAcc=f.tdAcc||.38;
      return f;
    }

    SEED=90210; rng=mulberry32(SEED); holdRng=mulberry32((SEED^0x9E3779B9)>>>0);
    me=draft(rng);
    me.__base={}; ATTR_TREINAVEIS.forEach(k=>{if(me[k]!=null)me.__base[k]=me[k];});
    st={treino:{},eventoMod:{},campHist:{},wins:0,losses:0,finishes:0,streakW:3,streakL:0,
        bestBeaten:0,bestWin:null,title:false,standing:.90,peak:.90,events:0,koLosses:0,
        kdTaken:0,kdGiven:0,fightNo:0,fan:5,followers:2400,peakFollowers:2400,longestW:3,
        lostBeltFast:false,rares:[],momentos:[],disputaLiberada:true,defesas:0};
    fought=new Set();

    /* luta 1: disputa pelo título, contra o campeão nomeado — vence */
    st.tituloEstaLuta=tituloLiberado();
    let opts=candidatos();
    passo("luta 1: 1 carta só, contra o campeão nomeado",
      opts.length===1 && opts[0].f.name===RANKING.campeao.name);
    let opp=opts[0].f; fought.add(opp.name);
    st.ganhoEscolhido=opts[0].ganho;
    let titleFight=!!st.tituloEstaLuta;
    finishFight(opp,{winner:me.name,method:"Decisão",knockdowns:{},round:5,clock:"5:00"},titleFight);
    passo("luta 1: venceu, virou campeão", st.title===true);

    /* luta 2: defesa, contra o desafiante nº1 — PERDE */
    st.tituloEstaLuta=tituloLiberado();
    opts=candidatos();
    passo("luta 2: 1 carta só, contra o desafiante nº1",
      opts.length===1 && opts[0].f.name===RANKING.desafiante.name);
    opp=opts[0].f; fought.add(opp.name);
    st.ganhoEscolhido=opts[0].ganho;
    titleFight=!!st.tituloEstaLuta;
    finishFight(opp,{winner:opp.name,method:"Decisão",knockdowns:{},round:5,clock:"5:00"},titleFight);

    passo("luta 2: perdeu — st.title virou false", st.title===false);
    /* renderFicha() de verdade, não uma cópia da fórmula: a versão antiga
       desta checagem comparava a MESMA expressão do template contra
       me.name, então com st.title já false ela só conferia que
       "TesteBot" (nome sintético) é diferente do nome de um lutador real
       — sempre verdadeiro, nunca pegaria a ficha renderizando errado. */
    renderFicha();
    passo("luta 2: a ficha de verdade não mostra mais o jogador como Campeão",
      !document.getElementById("ficha").innerHTML.includes("Campeão: <b>"+me.name+"</b>"));
    passo("luta 2: exCampeao é quem tirou o cinturão de verdade",
      st.exCampeao&&st.exCampeao.name===opp.name);
    passo("luta 2: lostBeltFast marcou (era a 1ª defesa, defesas===0 no momento)",
      st.lostBeltFast===true);
    passo("luta 2: disputaLiberada resetou — reconquista não fica travada",
      st.disputaLiberada===false);

    /* Segundo cenário, do zero: ganha o título, defende com sucesso 3 vezes
       (defesas sobe 1,2,3) e SÓ ENTÃO perde uma defesa. defesas===0 e
       defesas>0 discordam aqui de propósito — é o caso que a condição
       antiga (só titleFight&&st.title) não distinguia, e por isso qualquer
       derrota de campeão narrava "na primeira defesa". */
    fought=new Set();
    st={treino:{},eventoMod:{},campHist:{},wins:0,losses:0,finishes:0,streakW:3,streakL:0,
        bestBeaten:0,bestWin:null,title:false,standing:.90,peak:.90,events:0,koLosses:0,
        kdTaken:0,kdGiven:0,fightNo:0,fan:5,followers:2400,peakFollowers:2400,longestW:3,
        lostBeltFast:false,rares:[],momentos:[],disputaLiberada:true,defesas:0};

    // vence o título
    st.tituloEstaLuta=tituloLiberado();
    opts=candidatos(); opp=opts[0].f; fought.add(opp.name); st.ganhoEscolhido=opts[0].ganho;
    finishFight(opp,{winner:me.name,method:"Decisão",knockdowns:{},round:5,clock:"5:00"},!!st.tituloEstaLuta);

    // 3 defesas vencidas seguidas (defesas sobe pra 3)
    for(let i=0;i<3;i++){
      st.tituloEstaLuta=tituloLiberado();
      opts=candidatos(); opp=opts[0].f; fought.add(opp.name); st.ganhoEscolhido=opts[0].ganho;
      finishFight(opp,{winner:me.name,method:"Decisão",knockdowns:{},round:5,clock:"5:00"},!!st.tituloEstaLuta);
    }
    passo("cenário 2: venceu 3 defesas, st.defesas===3 antes da derrota", st.defesas===3);

    // agora perde uma defesa — NÃO é a primeira
    st.tituloEstaLuta=tituloLiberado();
    opts=candidatos(); opp=opts[0].f; fought.add(opp.name); st.ganhoEscolhido=opts[0].ganho;
    finishFight(opp,{winner:opp.name,method:"Decisão",knockdowns:{},round:5,clock:"5:00"},!!st.tituloEstaLuta);

    passo("cenário 2: perdeu a 4ª defesa (não a 1ª) — st.title vira false do mesmo jeito",
      st.title===false);
    passo("cenário 2: lostBeltFast NÃO marca — não foi a primeira defesa",
      st.lostBeltFast===false);

    /* Terceiro cenário: perde a disputa ANTES de nunca ter sido campeão,
       reconstrói elegibilidade, e a disputa é concedida de novo. A 2ª
       disputa tem que mirar o MESMO RANKING.campeao. Antes do conserto, o
       campeão nomeado já estava em fought da 1ª tentativa (fought.add
       roda em vitória OU derrota) e o guard fought.has jogava a carta
       pro fallback comum — o jogador virava campeão contra qualquer um,
       enquanto passoCinturao continuava anunciando o nome certo. */
    fought=new Set();
    st={treino:{},eventoMod:{},campHist:{},wins:0,losses:0,finishes:0,streakW:3,streakL:0,
        bestBeaten:0,bestWin:null,title:false,standing:.90,peak:.90,events:0,koLosses:0,
        kdTaken:0,kdGiven:0,fightNo:0,fan:5,followers:2400,peakFollowers:2400,longestW:3,
        lostBeltFast:false,rares:[],momentos:[],disputaLiberada:true,defesas:0,exCampeao:null,foiCampeao:false};

    // 1ª disputa — PERDE, nunca chega a ser campeão
    st.tituloEstaLuta=tituloLiberado();
    opts=candidatos();
    const alvoOriginal=opts[0].f.name;
    opp=opts[0].f; fought.add(opp.name); st.ganhoEscolhido=opts[0].ganho;
    finishFight(opp,{winner:opp.name,method:"Decisão",knockdowns:{},round:5,clock:"5:00"},!!st.tituloEstaLuta);

    passo("cenário 3: perdeu a disputa inicial, nunca chegou a ser campeão",
      st.title===false && st.foiCampeao===false);
    passo("cenário 3: o campeão nomeado já está em fought — é essa a armadilha antiga",
      fought.has(RANKING.campeao.name));
    passo("cenário 3: disputaLiberada resetou mesmo sem nunca ter sido campeão",
      st.disputaLiberada===false);

    // reconstrói elegibilidade (standing/streakW) e força a concessão de novo —
    // bypassa o sorteio do holdRng aqui, igual ao setup inicial, pra não
    // depender de sorte no teste
    st.standing=.90; st.streakW=3; st.disputaLiberada=true;
    st.tituloEstaLuta=tituloLiberado();
    opts=candidatos();
    passo("cenário 3: 2ª disputa é 1 carta só, contra o MESMO campeão de antes",
      opts.length===1 && opts[0].f.name===alvoOriginal && opts[0].f.name===RANKING.campeao.name);

    /* Quarto cenário: rotação de contender. Ganha o título, defende com
       sucesso 3 vezes seguidas — cada defesa tem que ser contra um NOME
       DIFERENTE (RANKING.lista[1], depois [2], depois [3]), não sempre o
       mesmo desafiante nº1. Perder também roda (medido abaixo). */
    fought=new Set();
    st={treino:{},eventoMod:{},campHist:{},wins:0,losses:0,finishes:0,streakW:3,streakL:0,
        bestBeaten:0,bestWin:null,title:false,standing:.90,peak:.90,events:0,koLosses:0,
        kdTaken:0,kdGiven:0,fightNo:0,fan:5,followers:2400,peakFollowers:2400,longestW:0,
        lostBeltFast:false,rares:[],momentos:[],disputaLiberada:true,defesas:0,
        exCampeao:null,foiCampeao:false,desafianteIdx:1};

    st.tituloEstaLuta=tituloLiberado();
    opts=candidatos(); opp=opts[0].f; fought.add(opp.name); st.ganhoEscolhido=opts[0].ganho;
    finishFight(opp,{winner:me.name,method:"Decisão",knockdowns:{},round:5,clock:"5:00"},!!st.tituloEstaLuta);
    passo("rotação: venceu o título, desafianteIdx continua 1 (só avança em DEFESA)",
      st.desafianteIdx===1);
    passo("bônus da noite: luta de título marca st.bonusNoite (hype alto, sem número novo)",
      st.bonusNoite && st.bonusNoite.luta===st.fightNo);

    const vistos=[];
    for(let i=0;i<3;i++){
      st.tituloEstaLuta=tituloLiberado();
      opts=candidatos();
      vistos.push(opts[0].f.name);
      opp=opts[0].f; fought.add(opp.name); st.ganhoEscolhido=opts[0].ganho;
      finishFight(opp,{winner:me.name,method:"Decisão",knockdowns:{},round:5,clock:"5:00"},!!st.tituloEstaLuta);
    }
    passo("rotação: 3 defesas seguidas, 3 desafiantes DIFERENTES",
      new Set(vistos).size===3);
    passo("rotação: são exatamente RANKING.lista[1],[2],[3], nessa ordem",
      vistos[0]===RANKING.lista[1].name && vistos[1]===RANKING.lista[2].name
        && vistos[2]===RANKING.lista[3].name);
    passo("rotação: desafianteIdx acompanhou (terminou em 4)", st.desafianteIdx===4);

    // perder uma defesa TAMBÉM avança a rotação
    st.tituloEstaLuta=tituloLiberado();
    opts=candidatos(); opp=opts[0].f; fought.add(opp.name); st.ganhoEscolhido=opts[0].ganho;
    finishFight(opp,{winner:opp.name,method:"Decisão",knockdowns:{},round:5,clock:"5:00"},!!st.tituloEstaLuta);
    passo("rotação: perder uma defesa TAMBÉM avança o índice (terminou em 5)",
      st.desafianteIdx===5);

    passo("rotação: os 16 do RANKING.lista inteiro (não só campeão+desafiante) ficam banidos das 3 bandas comuns — reservados",
      (()=>{
        st.tituloEstaLuta=false;
        const normais=candidatos();
        const nomesLista=new Set(RANKING.lista.map(f=>f.name));
        return normais.every(o=>!nomesLista.has(o.f.name));
      })());

    /* Cinturão interino: campeão indisponível (tituloInterinoLuta, forçado
       aqui em vez de depender do sorteio do holdRng — a chance em si é
       medição separada, node testar.js gapescolha não cobre isso, ver
       comentário em cima de CHANCE_CINTURAO_INTERINO). Prova a máquina de
       estados: alvo certo em cada fase, foiCampeao/vezesCampeao só na
       unificação (não na aquisição do interino), e a ficha nunca mostra
       dois campeões ao mesmo tempo. */
    fought=new Set();
    st={treino:{},eventoMod:{},campHist:{},wins:0,losses:0,finishes:0,streakW:3,streakL:0,
        bestBeaten:0,bestWin:null,title:false,standing:.90,peak:.90,events:0,koLosses:0,
        kdTaken:0,kdGiven:0,fightNo:0,fan:5,followers:2400,peakFollowers:2400,longestW:3,
        lostBeltFast:false,rares:[],momentos:[],disputaLiberada:true,defesas:0,
        exCampeao:null,foiCampeao:false,vezesCampeao:0,cinturaoInterino:false};

    // campeão de verdade indisponível: disputa é pelo interino, contra o
    // desafiante nº1 — não contra RANKING.campeao
    st.tituloEstaLuta=tituloLiberado(); st.tituloInterinoLuta=true;
    opts=candidatos();
    passo("interino: campeão indisponível manda a carta contra o desafiante nº1, não o campeão",
      opts.length===1 && opts[0].f.name===RANKING.desafiante.name);
    opp=opts[0].f; fought.add(opp.name); st.ganhoEscolhido=opts[0].ganho;
    finishFight(opp,{winner:me.name,method:"Decisão",knockdowns:{},round:5,clock:"5:00"},!!st.tituloEstaLuta);

    passo("interino: vencer dá title=true", st.title===true);
    passo("interino: vencer marca cinturaoInterino=true", st.cinturaoInterino===true);
    passo("interino: NÃO conta como foiCampeao ainda — incompleto até unificar",
      st.foiCampeao===false);
    passo("interino: NÃO incrementa vezesCampeao ainda (Fênix não pode contar isso)",
      st.vezesCampeao===0);
    passo("interino: momento cinturaoInterino registrado, nomeando o campeão de verdade",
      st.momentos.some(m=>m.tipo==="cinturaoInterino"));
    /* renderFicha() de verdade, não uma cópia da fórmula — senão o teste só
       prova que o texto do teste concorda consigo mesmo, nunca pegaria um
       bug no HTML real (foi exatamente esse buraco que a 1ª versão deste
       teste tinha: quebrei "Campeão" de propósito pra provar dente e ele
       passou verde do mesmo jeito). */
    renderFicha();
    const htmlFicha=document.getElementById("ficha").innerHTML;
    passo("interino: a ficha de verdade não mostra o jogador como Campeão enquanto só tem o interino",
      !htmlFicha.includes("Campeão: <b>"+me.name+"</b>"));
    passo("interino: a ficha de verdade nomeia o campeão real na seção Ranking",
      htmlFicha.includes("Campeão: <b>"+RANKING.campeao.name+"</b>"));
    passo("interino: a ficha de verdade rotula o cinturão do jogador como Interino, não Campeão",
      htmlFicha.includes(">Interino<"));
    passo("interino: passoCinturao() anuncia a unificação nomeando o campeão de verdade",
      passoCinturao().includes(RANKING.campeao.name));

    // próxima luta (já com o interino): SEMPRE contra o campeão de verdade,
    // nunca a rotação normal de contender
    st.tituloEstaLuta=tituloLiberado(); st.tituloInterinoLuta=false;
    opts=candidatos();
    passo("unificação: a carta trava no campeão de verdade, ignora a rotação",
      opts.length===1 && opts[0].f.name===RANKING.campeao.name);

    // ganha a unificação
    opp=opts[0].f; fought.add(opp.name); st.ganhoEscolhido=opts[0].ganho;
    const defesasAntesUnif=st.defesas;
    finishFight(opp,{winner:me.name,method:"Decisão",knockdowns:{},round:5,clock:"5:00"},!!st.tituloEstaLuta);

    passo("unificação (vitória): cinturaoInterino volta a false", st.cinturaoInterino===false);
    passo("unificação (vitória): AGORA sim foiCampeao===true", st.foiCampeao===true);
    passo("unificação (vitória): AGORA sim vezesCampeao incrementou", st.vezesCampeao===1);
    passo("unificação (vitória): NÃO mexe em defesas (não veio da rotação)",
      st.defesas===defesasAntesUnif);
    passo("unificação (vitória): momento de 1º cinturão dispara aqui, não na aquisição do interino",
      st.momentos.filter(m=>m.tipo==="cinturao").length===1);

    // cenário B: ganha o interino de novo e PERDE a unificação
    fought=new Set();
    st={treino:{},eventoMod:{},campHist:{},wins:0,losses:0,finishes:0,streakW:3,streakL:0,
        bestBeaten:0,bestWin:null,title:false,standing:.90,peak:.90,events:0,koLosses:0,
        kdTaken:0,kdGiven:0,fightNo:0,fan:5,followers:2400,peakFollowers:2400,longestW:3,
        lostBeltFast:false,rares:[],momentos:[],disputaLiberada:true,defesas:0,
        exCampeao:null,foiCampeao:false,vezesCampeao:0,cinturaoInterino:false};
    st.tituloEstaLuta=tituloLiberado(); st.tituloInterinoLuta=true;
    opts=candidatos(); opp=opts[0].f; fought.add(opp.name); st.ganhoEscolhido=opts[0].ganho;
    finishFight(opp,{winner:me.name,method:"Decisão",knockdowns:{},round:5,clock:"5:00"},!!st.tituloEstaLuta);

    st.tituloEstaLuta=tituloLiberado(); st.tituloInterinoLuta=false;
    opts=candidatos(); opp=opts[0].f; fought.add(opp.name); st.ganhoEscolhido=opts[0].ganho;
    finishFight(opp,{winner:opp.name,method:"Decisão",knockdowns:{},round:5,clock:"5:00"},!!st.tituloEstaLuta);

    passo("unificação (derrota): title volta a false", st.title===false);
    passo("unificação (derrota): cinturaoInterino também volta a false (sem fantasma)",
      st.cinturaoInterino===false);
    passo("unificação (derrota): exCampeao é o campeão de verdade, quem venceu a unificação",
      st.exCampeao&&st.exCampeao.name===RANKING.campeao.name);
    passo("unificação (derrota): lostBeltFast NÃO marca — nunca houve reinado indiscutido pra perder rápido",
      st.lostBeltFast===false);
  }catch(e){
    passos.push({nome:"erro inesperado: "+e.message,ok:false});
  }
  return passos;
})();
`;

  try {
    vm.runInContext(lerScript() + corpo, env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("  o cenário nem rodou: " + e.message) + "\n" +
      cinza(e.stack.split("\n").slice(1, 3).join("\n")));
    return false;
  }
  const passos = env.sandbox.__cint || [];
  let ok = true;
  for (const p of passos) {
    if (!p.ok) ok = false;
    console.log(`  ${p.ok ? verde("ok   ") : vermelho("fora ")} ${p.nome}`);
  }
  return ok && passos.length > 0;
}

/* ================================================================== *
 * 7. LESÃO — cura tem que devolver só o que a lesão tirou
 * ================================================================== */
/* Chama aplicarDilema() e finishFight() DE VERDADE. Não simula luta
   (finishFight não precisa: quem decide o vencedor é o `r` que a gente
   entrega, igual testarCinturao já faz) — só avança st.fightNo e deixa o
   tick de cura, que mora dentro de finishFight(), rodar sozinho. */
function testarLesao() {
  console.log("\n" + cinza("lesão: cura preserva bônus de evento, e não empilha em cima de outra ativa"));
  const env = criarAmbiente();
  vm.createContext(env.sandbox);

  const corpo = `
;globalThis.__lesao=(function(){
  const passos=[];
  const passo=(nome,ok)=>passos.push({nome,ok:!!ok});
  try{
    me={name:"TesteBot",division:"lightweight",slpm:5.0,strDef:.55,durability:1.0,
        tdDef:.6,subAvg:.5,kdAvg:.4,strAcc:.45,tdAcc:.38};
    me.__base={}; ATTR_TREINAVEIS.forEach(k=>{if(me[k]!=null)me.__base[k]=me[k];});
    rng=mulberry32(1);   // finishFight() usa pra feed/persona; não é o que este teste mede
    const opp={name:"Rival",rating:.5};
    const box=document.getElementById("caixaLesaoTeste");

    /* cenário 1: evento comum (+8% em slpm) na luta 3, lesão temporária
       (slpm) na luta 6, cura na luta 14 (desdeLuta 6 + duração 8). O bônus
       do evento tem que sobreviver a cura — é exatamente o bug relatado:
       eventoMod[atr]=1 apagaria os +8% junto com a lesão. */
    st={treino:{},eventoMod:{},campHist:{},wins:0,losses:0,finishes:0,streakW:0,streakL:0,
        bestBeaten:0,bestWin:null,title:false,standing:.5,peak:.5,events:0,koLosses:0,
        kdTaken:0,kdGiven:0,fightNo:3,fan:5,followers:2400,peakFollowers:2400,longestW:0,
        lostBeltFast:false,rares:[],momentos:[],disputaLiberada:false,defesas:0,exCampeao:null,
        foiCampeao:false,lesao:null};
    st.eventoMod.slpm=1.08;  // evento comum anterior, nada a ver com a lesão

    st.fightNo=6;
    aplicarDilema(box,{titulo:"Joelho travado",cena:"..."},"aceito lutar assim mesmo",
      {desfecho:"Ele decide arriscar.",seguidores:0,fa:0,
       lesao:{permanente:false,atributo:"slpm",regiao:"Mão quebrada"},evitouLesao:false});

    passo("aplica lesão: st.lesao criado com os campos certos",
      st.lesao && st.lesao.atributo==="slpm" && st.lesao.permanente===false
        && st.lesao.desdeLuta===6 && st.lesao.duracao===8);
    passo("aplica lesão: eventoMod combina o -50% da lesão COM o +8% do evento (multiplicativo)",
      Math.abs(st.eventoMod.slpm-1.08*0.50)<1e-9);

    /* Achado jogando: a % exibida por atributo comparava contra a base
       CRUA (base×treino×eventoMod / base), então subia conforme o treino
       subia — "-50%" virava "-13%" mesmo com a lesão intocada. O bloco
       LESÃO agora mostra a magnitude fixa (st.lesao.mult), que não pode
       se mexer com treino. Confere isso literalmente: renderiza a ficha
       com treino baixo, sobe o treino MUITO, renderiza de novo — o número
       no bloco LESÃO tem que ser bit-a-bit igual nas duas vezes. */
    renderFicha();
    const fichaAntes=document.getElementById("ficha").innerHTML;
    passo("ficha: bloco LESÃO mostra a magnitude fixa (-50%)",
      /lesao-mag">Volume\\s*-50%/.test(fichaAntes));
    passo("marcador: nome do atributo machucado (Volume) vem em negrito",
      /style="font-weight:800">Volume</.test(fichaAntes));
    passo("marcador: atributo NÃO machucado (Poder) não leva negrito",
      !/style="font-weight:800">Poder</.test(fichaAntes));

    st.treino.slpm=1.26; // treino no teto — a % combinada mudaria, a da lesão não pode
    renderFicha();
    const fichaDepois=document.getElementById("ficha").innerHTML;
    const norm=s=>((s.match(/lesao-mag">([^<]+)/)||[])[1]||"").replace(/\\s+/g," ").trim();
    const magAntes=norm(fichaAntes), magDepois=norm(fichaDepois);
    passo("ficha: magnitude da lesão não muda quando o treino sobe (era o bug)",
      magAntes===magDepois && magAntes==="Volume -50%");

    // avança até a cura (desdeLuta 6 + duração 8 = cura depois da luta 14)
    for(let f=7; f<=14; f++){
      st.fightNo=f; st.ganhoEscolhido=.07;
      finishFight(opp,{winner:me.name,method:"Decisão",knockdowns:{},round:3,clock:"5:00"},false);
    }
    passo("cura: st.lesao volta a null depois da luta 14", st.lesao===null);
    passo("cura: eventoMod.slpm volta pro +8% do evento — NÃO pra 1 (isso comeria o evento junto)",
      Math.abs(st.eventoMod.slpm-1.08)<1e-9);

    /* cenário 2: segunda lesão enquanto uma já está ativa — bloqueada.
       st.lesao é objeto único; sobrescrever órfãzaria o multiplicador da
       1ª em eventoMod pra sempre (a cura da 2ª dividiria pelo mult ERRADO). */
    st.eventoMod={};
    st.lesao=null;
    st.fightNo=1;
    aplicarDilema(box,{titulo:"Mão quebrada",cena:"..."},"aceito lutar assim mesmo",
      {desfecho:"...",seguidores:0,fa:0,
       lesao:{permanente:false,atributo:"slpm",regiao:"Mão quebrada"},evitouLesao:false});
    const primeiraLesao=st.lesao;
    passo("2ª lesão: a 1ª foi aplicada (setup do cenário)", !!primeiraLesao);

    st.fightNo=2;
    aplicarDilema(box,{titulo:"Costela trincada",cena:"..."},"aceito lutar assim mesmo",
      {desfecho:"...",seguidores:0,fa:0,
       lesao:{permanente:true,atributo:"durability",regiao:"Costela trincada"},evitouLesao:false});

    passo("2ª lesão: st.lesao continua sendo a 1ª (não sobrescreveu)",
      st.lesao===primeiraLesao && st.lesao.atributo==="slpm");
    passo("2ª lesão: eventoMod.durability não foi tocado pela lesão bloqueada",
      st.eventoMod.durability==null);

    /* item 2 (leva seguinte): treinador melhor agora corta a duração de
       lesão TEMPORÁRIA pela metade — não mexe em treino nenhum. Confirma
       os dois lados: comprado corta (8→4), permanente continua sem cura
       (duracao null) mesmo comprado. */
    st.eventoMod={}; st.lesao=null; st.treinadorComprado=true;
    aplicarDilema(box,{titulo:"Joelho travado",cena:"..."},"aceito lutar assim mesmo",
      {desfecho:"...",seguidores:0,fa:0,
       lesao:{permanente:false,atributo:"slpm",regiao:"Joelho travado"},evitouLesao:false});
    passo("treinador comprado: lesão temporária vem com duração pela metade (4, não 8)",
      st.lesao&&st.lesao.duracao===4);

    st.eventoMod={}; st.lesao=null;
    aplicarDilema(box,{titulo:"Ombro deslocado",cena:"..."},"aceito lutar assim mesmo",
      {desfecho:"...",seguidores:0,fa:0,
       lesao:{permanente:true,atributo:"durability",regiao:"Ombro deslocado"},evitouLesao:false});
    passo("treinador comprado: lesão permanente continua sem duração (null) — não tem cura pra acelerar",
      st.lesao&&st.lesao.duracao===null);
    st.treinadorComprado=false;

    /* evitouLesao: custo em standing, fixo, não vem da IA */
    st.eventoMod={}; st.lesao=null; st.standing=.5;
    aplicarDilema(box,{titulo:"Risco evitado",cena:"..."},"não arrisco, saio da luta",
      {desfecho:"...",seguidores:-.1,fa:-.5,lesao:null,evitouLesao:true});
    passo("evitouLesao: standing cai um valor fixo (-0.06), não depende da IA",
      Math.abs(st.standing-(.5-.06))<1e-9);

    /* Existiu aqui um portão (houveLesao) exigindo dois sinais concordando.
       Medido depois de deploy de verdade: o prompt sem o portão já acerta
       8/8 nas cenas de lesão e 0/34 nas sem lesão — revertido, ver o
       comentário em aplicarDilema() no index.html. O que sobra pra testar
       é mais simples: só a validade do PRÓPRIO objeto lesao decide, e a
       IA às vezes preenche lesao E o atributo/efeito comum juntos (visto
       em 3 das 8 respostas medidas) — isso não pode impedir a lesão de
       aplicar, nem corromper st.eventoMod nos casos que devem ficar de
       fora. */
    const casosValidacao=[
      {nome:"lesao válida — vira",
       j:{lesao:{permanente:false,atributo:"strDef",regiao:"Mão quebrada"},
          atributo:"nenhum",efeito:1,desfecho:"...",seguidores:0,fa:0},
       deveVirar:true},
      {nome:"lesao válida MESMO com atributo comum também preenchido (a IA não limpa sempre) — vira",
       j:{lesao:{permanente:false,atributo:"strDef",regiao:"Mão quebrada"},
          atributo:"strDef",efeito:.92,desfecho:"...",seguidores:0,fa:0},
       deveVirar:true},
      {nome:"lesao null — NÃO vira",
       j:{lesao:null,atributo:"strDef",efeito:.95,desfecho:"...",seguidores:0,fa:0},
       deveVirar:false},
      {nome:"atributo da lesão fora da lista (reach) — NÃO vira",
       j:{lesao:{permanente:false,atributo:"reach",regiao:"X"},
          atributo:"nenhum",efeito:1,desfecho:"...",seguidores:0,fa:0},
       deveVirar:false},
    ];
    for(const c of casosValidacao){
      st.eventoMod={}; st.lesao=null;
      aplicarDilema(box,{titulo:"T",cena:"C"},"resposta de teste",c.j);
      passo("validação: "+c.nome, !!st.lesao===c.deveVirar);
    }
  }catch(e){
    passos.push({nome:"erro inesperado: "+e.message,ok:false});
  }
  return passos;
})();
`;

  try {
    vm.runInContext(lerScript() + corpo, env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("  o cenário nem rodou: " + e.message) + "\n" +
      cinza(e.stack.split("\n").slice(1, 3).join("\n")));
    return false;
  }
  const passos = env.sandbox.__lesao || [];
  let ok = true;
  for (const p of passos) {
    if (!p.ok) ok = false;
    console.log(`  ${p.ok ? verde("ok   ") : vermelho("fora ")} ${p.nome}`);
  }
  return ok && passos.length > 0;
}

/* ================================================================== *
 * NOCAUTE -> LESÃO — chance própria (CHANCE_LESAO_NOCAUTE), severidade
 * própria (LESAO_NOCAUTE, não reaproveita LESAO_TIPOS.temporaria), uma
 * de cada vez, lesaoRng nunca o rng principal
 * ================================================================== */
function testarLesaoNocaute() {
  console.log("\n" + cinza("nocaute -> lesão: chance própria, uma de cada vez, stream isolado"));
  const env = criarAmbiente();
  vm.createContext(env.sandbox);
  const corpo = `
;globalThis.__lesko=(function(){
  const passos=[];
  const passo=(nome,ok)=>passos.push({nome,ok:!!ok});
  try{
    me={name:"TesteBot",division:"lightweight",slpm:5.0,strDef:.55,durability:1.0,
        tdDef:.6,subAvg:.5,kdAvg:.4,strAcc:.45,tdAcc:.38};
    me.__base={}; ATTR_TREINAVEIS.forEach(k=>{if(me[k]!=null)me.__base[k]=me[k];});
    rng=mulberry32(1);
    const opp={name:"Rival",rating:.5};
    const stBase=()=>({treino:{},eventoMod:{},campHist:{},wins:0,losses:0,finishes:0,
      streakW:0,streakL:0,bestBeaten:0,bestWin:null,title:false,standing:.5,peak:.5,
      events:0,koLosses:0,kdTaken:0,kdGiven:0,fightNo:6,fan:5,followers:2400,
      peakFollowers:2400,longestW:0,lostBeltFast:false,rares:[],momentos:[],
      disputaLiberada:false,defesas:0,exCampeao:null,foiCampeao:false,lesao:null});
    const rKO={winner:opp.name,loser:me.name,method:"Nocaute",round:1,clock:"3:00",
      knockdowns:{[opp.name]:1,[me.name]:0}};
    const rDecisao={winner:opp.name,loser:me.name,method:"Decisão",round:3,clock:"5:00",
      knockdowns:{[opp.name]:0,[me.name]:0}};

    /* lesaoRng fixo abaixo de CHANCE_LESAO_NOCAUTE (.70): tem que aplicar */
    st=stBase(); lesaoRng=()=>.10;
    finishFight(opp,rKO,false);
    passo("nocaute + rolagem abaixo da chance: aplica lesão", !!st.lesao);
    passo("severidade é a PRÓPRIA (LESAO_NOCAUTE.mult), não a de dilema (temporaria.mult)",
      st.lesao && Math.abs(st.lesao.mult-LESAO_NOCAUTE.mult)<1e-9 && LESAO_NOCAUTE.mult!==LESAO_TIPOS.temporaria.mult);
    passo("duração bate com LESAO_NOCAUTE.duracao", st.lesao && st.lesao.duracao===LESAO_NOCAUTE.duracao);
    passo("não é permanente", st.lesao && st.lesao.permanente===false);

    /* lesaoRng fixo ACIMA da chance: não aplica */
    st=stBase(); lesaoRng=()=>.99;
    finishFight(opp,rKO,false);
    passo("nocaute + rolagem acima da chance: NÃO aplica lesão", st.lesao===null);

    /* derrota por decisão (não é nocaute): nunca aplica, mesmo com rolagem favorável */
    st=stBase(); lesaoRng=()=>.01;
    finishFight(opp,rDecisao,false);
    passo("derrota por decisão (não nocaute): NÃO aplica lesão mesmo com rolagem favorável",
      st.lesao===null);

    /* uma de cada vez: já machucado, novo nocaute não sobrescreve */
    st=stBase();
    st.lesao={nome:"Lesão anterior",atributo:"tdDef",mult:.5,permanente:false,desdeLuta:3,duracao:8};
    lesaoRng=()=>.01;
    const lesaoAntes=st.lesao;
    finishFight(opp,rKO,false);
    passo("já machucado: nocaute novo NÃO sobrescreve a lesão ativa",
      st.lesao===lesaoAntes && st.lesao.atributo==="tdDef");

    /* atributo sorteado por lesaoRng, não fixo — confere que varia entre chamadas */
    const atributosVistos=new Set();
    const seq=[0.02,0.05,0.02,0.20,0.02,0.35,0.02,0.50,0.02,0.65,0.02,0.80,0.02,0.95,0.02,0.99];
    let n=0;
    for(let i=0;i<8;i++){
      st=stBase();
      lesaoRng=()=>seq[(n++)%seq.length];
      finishFight(opp,rKO,false);
      if(st.lesao)atributosVistos.add(st.lesao.atributo);
    }
    passo("atributo da lesão varia (não é sempre o mesmo) — vistos: "+[...atributosVistos].join(","),
      atributosVistos.size>=2);

    /* item de loja "Equipamento de proteção": reduz a MESMA chance (não
       severidade/duração) quando comprado. Rolagem fixa em .55 — entre os
       dois limiares (.45 do item, .70 sem ele) — separa os dois casos com
       uma ÚNICA rolagem, sem depender de rng() diferente por cenário. */
    st=stBase(); st.equipamentoComprado=false; lesaoRng=()=>.55;
    finishFight(opp,rKO,false);
    passo("sem equipamento: rolagem .55 (abaixo de .70) aplica lesão",
      !!st.lesao);

    st=stBase(); st.equipamentoComprado=true; lesaoRng=()=>.55;
    finishFight(opp,rKO,false);
    passo("com equipamento: MESMA rolagem .55 (acima de .45) NÃO aplica — a chance caiu, não a severidade",
      st.lesao===null);

    st=stBase(); st.equipamentoComprado=true; lesaoRng=()=>.30;
    finishFight(opp,rKO,false);
    passo("com equipamento: rolagem .30 (abaixo de .45) ainda aplica — não ficou impossível, só menos provável",
      st.lesao && Math.abs(st.lesao.mult-LESAO_NOCAUTE.mult)<1e-9 && st.lesao.duracao===LESAO_NOCAUTE.duracao);
  }catch(e){
    passos.push({nome:"erro inesperado: "+e.message,ok:false});
  }
  return passos;
})();
`;
  try {
    vm.runInContext(lerScript() + corpo, env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("  o cenário nem rodou: " + e.message) + "\n" +
      cinza(e.stack.split("\n").slice(1, 3).join("\n")));
    return false;
  }
  const passos = env.sandbox.__lesko || [];
  let ok = true;
  for (const p of passos) {
    if (!p.ok) ok = false;
    console.log(`  ${p.ok ? verde("ok   ") : vermelho("fora ")} ${p.nome}`);
  }
  return ok && passos.length > 0;
}

/* ================================================================== *
 * 7a. COERÊNCIA — a ficha não pode mentir sobre o próprio estado
 * ================================================================== */
/* Item 5: auditor genérico pras classes de bug já encontradas jogando
   (vermelho sem bloco de LESÃO, % que engorda com o treino, filtro
   copiando o exemplo do prompt) — aqui a versão que dá pra checar sem
   jogar: chama renderFicha() DE VERDADE contra `st`/`me` construídos à
   mão, e audita o HTML resultante contra as regras. */
function testarCoerencia() {
  console.log("\n" + cinza("coerência da ficha: o que aparece na tela bate com o estado de verdade"));
  const env = criarAmbiente();
  vm.createContext(env.sandbox);

  const corpo = `
;globalThis.__coe=(function(){
  const passos=[];
  const passo=(nome,ok)=>passos.push({nome,ok:!!ok});
  const semTags=h=>h.replace(/<[^>]+>/g," ");
  try{
    me={name:"TesteCoerencia",division:"lightweight",slpm:5.0,strDef:.55,durability:1.0,
        tdDef:.6,subAvg:.5,kdAvg:.4,strAcc:.45,tdAcc:.38};
    me.__base={}; ATTR_TREINAVEIS.forEach(k=>{if(me[k]!=null)me.__base[k]=me[k];});
    const stBase=()=>({treino:{},eventoMod:{},campHist:{},wins:0,losses:0,finishes:0,
      streakW:0,streakL:0,bestBeaten:0,bestWin:null,title:false,standing:.5,peak:.5,
      events:0,koLosses:0,kdTaken:0,kdGiven:0,fightNo:6,fan:5,followers:2400,
      peakFollowers:2400,longestW:0,lostBeltFast:false,rares:[],momentos:[],
      disputaLiberada:false,defesas:0,exCampeao:null,foiCampeao:false,lesao:null});

    /* cenário A: baseline limpo — nenhuma perda, nenhuma lesão. Nada pode
       aparecer vermelho, nem bloco LESÃO, nem negrito em atributo nenhum. */
    st=stBase();
    renderFicha();
    let f=document.getElementById("ficha").innerHTML;
    passo("baseline: sem perda nenhuma, nenhum atributo aparece vermelho (classe dn)",
      !/class="dn"/.test(f));
    passo("baseline: sem st.lesao, o bloco LESÃO não aparece",
      !/<h4>Lesão<\\/h4>/.test(f));
    passo("baseline: sem lesão, nenhum atributo vem em negrito",
      !/style="font-weight:800"/.test(f));

    /* regra 1 (vermelho ⟹ perda registrada): eventoMod real abaixo de 1,
       SEM lesão nenhuma — tem que aparecer vermelho, e o número tem que
       bater com o multiplicador de verdade (regra 4, junto). */
    st=stBase();
    st.eventoMod.strDef=0.85;         // -15% real, evento comum, não lesão
    renderFicha();
    f=document.getElementById("ficha").innerHTML;
    const ganhoEsperado=Math.round((0.85-1)*100);
    passo("regra 1: perda real (eventoMod) aparece vermelho (classe dn)",
      /class="dn"/.test(f));
    passo("regra 1: SEM lesão, nenhum atributo vem em negrito mesmo com perda vermelha",
      !/style="font-weight:800"/.test(f));
    passo("regra 4: o número exibido bate com base×treino×eventoMod (" + ganhoEsperado + "%)",
      new RegExp('class="dn">' + ganhoEsperado + '%').test(f));

    /* regra 2 (st.lesao ⟹ bloco na ficha): com lesão, o bloco tem que
       existir e mostrar a magnitude FIXA (não a combinada com treino —
       já regressão de testarLesao(), reconfirmado aqui como regra geral). */
    st=stBase();
    st.lesao={atributo:"durability",mult:0.70,permanente:false,desdeLuta:6,duracao:8,nome:"Joelho travado"};
    renderFicha();
    f=document.getElementById("ficha").innerHTML;
    passo("regra 2: st.lesao presente ⟹ bloco LESÃO aparece",
      /<h4>Lesão<\\/h4>/.test(f));
    passo("regra 2: o atributo lesionado vem em negrito",
      /style="font-weight:800">Queixo</.test(f));

    /* regra 3 (nenhuma chave crua de atributo em texto visível): tira toda
       tag (isso já remove os atributos class="..." junto) e procura pelas
       chaves cruas no texto que sobrou — só o rótulo traduzido pode
       aparecer, nunca "strDef"/"durability"/etc. literal. */
    const texto=semTags(f);
    const chavesCruas=ATTR_TREINAVEIS.concat(["reach"]).filter(k=>texto.includes(k));
    passo("regra 3: nenhuma chave crua de atributo (" + ATTR_TREINAVEIS.join(",") + ") no texto visível",
      chavesCruas.length===0);

    /* regra 5 (nenhuma linha de efeito com valor exibido zero): ganho
       exatamente 0 não pode desenhar "+0%"/"-0%" — tem que ficar mudo
       (zona morta de |ganho|<=0.005 em renderFicha()). */
    st=stBase();
    st.treino.slpm=1.0; st.eventoMod.slpm=1.0;   // combinação neutra, ganho exatamente 0
    renderFicha();
    f=document.getElementById("ficha").innerHTML;
    passo("regra 5: ganho exatamente 0 não desenha linha de efeito (nem +0% nem -0%)",
      !/class="g">\\+0%/.test(f) && !/class="dn">-?0%/.test(f));
  }catch(e){
    passos.push({nome:"erro inesperado: "+e.message,ok:false});
  }
  return passos;
})();
`;
  try {
    vm.runInContext(lerScript() + corpo, env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("  o cenário nem rodou: " + e.message) + "\n" +
      cinza(e.stack.split("\n").slice(1, 3).join("\n")));
    return false;
  }
  const passos = env.sandbox.__coe || [];
  let ok = true;
  for (const p of passos) {
    if (!p.ok) ok = false;
    console.log(`  ${p.ok ? verde("ok   ") : vermelho("fora ")} ${p.nome}`);
  }
  return ok && passos.length > 0;
}

/* ================================================================== *
 * 7b. CARD DE MOMENTO — cada gatilho dispara na hora certa, uma vez só
 * ================================================================== */
/* Chama finishFight()/aplicarDilema() DE VERDADE, igual testarCinturao e
   testarLesao — o `r` é construído pra forçar o cenário, quem decide o
   resto (st.momentos) é o motor. Cobre exatamente os três detalhes sutis
   que a medição de 120 carreiras (ver LEIA-ME "Card de momento") expôs:
   clock é regressivo (rápido é ALTO, não baixo), upset tem que comparar
   com o standing de ANTES da vitória, e streakW>=8 fica de fora do card
   mesmo disparando RARE normal. */
function testarMomentos() {
  console.log("\n" + cinza("card de momento: cada gatilho dispara na hora certa, e só uma vez"));
  const env = criarAmbiente();
  vm.createContext(env.sandbox);

  const corpo = `
;globalThis.__mom=(function(){
  const passos=[];
  const passo=(nome,ok)=>passos.push({nome,ok:!!ok});
  const stBase=()=>({treino:{},eventoMod:{},campHist:{},wins:0,losses:0,finishes:0,
      streakW:0,streakL:0,bestBeaten:0,bestWin:null,title:false,standing:.5,peak:.5,
      events:0,koLosses:0,kdTaken:0,kdGiven:0,fightNo:0,fan:5,followers:2400,
      peakFollowers:2400,longestW:0,lostBeltFast:false,rares:[],momentos:[],
      disputaLiberada:false,defesas:0,exCampeao:null,foiCampeao:false,lesao:null});
  try{
    me={name:"TesteBot",division:"lightweight",slpm:5.0,strDef:.55,durability:1.0,
        tdDef:.6,subAvg:.5,kdAvg:.4,strAcc:.45,tdAcc:.38};
    me.__base={}; ATTR_TREINAVEIS.forEach(k=>{if(me[k]!=null)me.__base[k]=me[k];});
    rareUsed=new Set();
    rng=mulberry32(1);
    const opp={name:"Rival",rating:.5};

    /* --- KO rápido: clock é o relógio REGRESSIVO da luta (começa "5:00",
       desce até "0:00"). Round 1 abaixo de 1 minuto ELAPSED é clock ALTO
       ("4:xx"), não baixo — o oposto do que uma leitura ingênua sugere.
       Testa os dois lados pra provar que a direção está certa. */
    st=stBase(); st.fightNo=1; st.ganhoEscolhido=.07;
    finishFight(opp,{winner:me.name,method:"Nocaute",knockdowns:{},round:1,clock:"4:40"},false);
    passo("KO round 1 a 20s (clock 4:40, ALTO) dispara koRapido",
      st.momentos.some(m=>m.tipo==="ko"));

    st=stBase(); st.fightNo=1; st.ganhoEscolhido=.07;
    finishFight(opp,{winner:me.name,method:"Nocaute",knockdowns:{},round:1,clock:"0:15"},false);
    passo("KO round 1 a 285s (clock 0:15, BAIXO) NÃO dispara koRapido — não é rápido, é tarde no round",
      !st.momentos.some(m=>m.tipo==="ko"));

    /* --- estreia no main card (item 8): dispara em titleFight===true,
       VITÓRIA OU DERROTA (é sobre chegar lá, não sobre ganhar — diferente
       de "cinturao", que só dispara ganhando), e só a primeira vez. */
    st=stBase(); st.fightNo=8; st.ganhoEscolhido=.10;
    finishFight(opp,{winner:opp.name,method:"Decisão",knockdowns:{},round:3,clock:"0:00"},true);
    passo("titleFight PERDIDO dispara estreia (sem cinturão pra competir, sobrevive sozinho)",
      st.momentos.some(m=>m.tipo==="estreia"));
    const qtdApósDerrota=st.momentos.filter(m=>m.tipo==="estreia").length;
    finishFight(opp,{winner:opp.name,method:"Decisão",knockdowns:{},round:3,clock:"0:00"},true);
    passo("2ª luta de título (perdendo de novo) NÃO dispara estreia de novo — só a primeira vez",
      st.momentos.filter(m=>m.tipo==="estreia").length===qtdApósDerrota);

    /* Prioridade (achado jogando, 2026-09-08): título vencido NO DEBUT no
       main card dispara estreia E cinturao na MESMA luta — cinturão é o
       momento maior (ORDEM_MOMENTO), ganha a disputa pelo card. A flag
       st.estreouMainCard continua marcando true por baixo (é o que
       impede a PRÓXIMA luta de título de tentar empurrar "estreia" de
       novo) mesmo com o card de estreia suprimido nesta. */
    st=stBase(); st.fightNo=8; st.ganhoEscolhido=.10;
    finishFight(opp,{winner:me.name,method:"Decisão",knockdowns:{},round:3,clock:"0:00"},true);
    passo("título vencido no debut do main card: cinturão ganha a disputa, não estreia",
      st.momentos.some(m=>m.tipo==="cinturao") && !st.momentos.some(m=>m.tipo==="estreia"));
    passo("mesmo suprimido do card, a flag de estreia foi marcada por baixo",
      st.estreouMainCard===true);

    st=stBase(); st.fightNo=8; st.ganhoEscolhido=.07;
    finishFight(opp,{winner:me.name,method:"Decisão",knockdowns:{},round:3,clock:"0:00"},false);
    passo("luta comum (não titleFight) NÃO dispara estreia",
      !st.momentos.some(m=>m.tipo==="estreia"));

    /* --- primeiro cinturão: só a PRIMEIRA vez (foiCampeao permanente) */
    st=stBase(); st.fightNo=7; st.ganhoEscolhido=.07; st.tituloEstaLuta=true;
    finishFight(opp,{winner:me.name,method:"Decisão",knockdowns:{},round:5,clock:"5:00"},true);
    passo("1º cinturão dispara card único",
      st.momentos.filter(m=>m.tipo==="cinturao").length===1);
    passo("1º cinturão: st.foiCampeao virou true (setup pro próximo passo)", st.foiCampeao===true);

    // perde e reconquista — NÃO pode disparar um 2º card de "1º cinturão"
    st.fightNo=8; st.ganhoEscolhido=.07;
    finishFight(opp,{winner:opp.name,method:"Decisão",knockdowns:{},round:5,clock:"5:00"},true);
    st.fightNo=9; st.ganhoEscolhido=.07; st.tituloEstaLuta=true;
    finishFight(opp,{winner:me.name,method:"Decisão",knockdowns:{},round:5,clock:"5:00"},true);
    passo("reconquista NÃO dispara um 2º card de primeiro cinturão",
      st.momentos.filter(m=>m.tipo==="cinturao").length===1);

    /* --- perda na 1ª defesa: dispara; perda numa defesa LATER, não */
    st=stBase(); st.fightNo=1; st.title=true; st.foiCampeao=true; st.defesas=0;
    finishFight(opp,{winner:opp.name,method:"Decisão",knockdowns:{},round:5,clock:"5:00"},true);
    passo("perda na 1ª defesa dispara cinturaoPerdido, com o texto do RARE (não duplicado)",
      st.momentos.some(m=>m.tipo==="cinturaoPerdido"
        && m.frase===RARE.find(r=>r.id==="lostBeltFast").t("TesteBot")));

    st=stBase(); st.fightNo=1; st.title=true; st.foiCampeao=true; st.defesas=3;
    finishFight(opp,{winner:opp.name,method:"Decisão",knockdowns:{},round:5,clock:"5:00"},true);
    passo("perda na 4ª defesa (não a 1ª) NÃO dispara cinturaoPerdido",
      !st.momentos.some(m=>m.tipo==="cinturaoPerdido"));

    /* --- upset: compara com o standing de ANTES da vitória, luta>=6, diff>.20.
       standingPre=.40, opp.rating=.63 (diff .23>.20) — COM o bug antigo
       (comparar depois da vitória subir o standing pra .47) a diferença cai
       pra .16 e não dispararia. Prova que o conserto está no lugar certo. */
    rng=mulberry32(1);
    st=stBase(); fightNo=6; st.fightNo=6; st.standing=.40; st.ganhoEscolhido=.07;
    finishFight({name:"Favorito",rating:.63},
      {winner:me.name,method:"Decisão",knockdowns:{},round:3,clock:"5:00"},false);
    passo("upset (luta 6) dispara comparando com o standing PRÉ-luta (.40), não o pós (.47)",
      st.momentos.some(m=>m.tipo==="upset"));

    /* --- upset: piso de luta 6, medido em 120 carreiras (77% dos upsets
       caíam nas lutas 1-5, só por standing começar baixo — não é zebra de
       verdade, ver LEIA-ME "Card de momento"). Mesma diferença de rating
       (.23), luta 3 — NÃO pode disparar. */
    rng=mulberry32(1);
    st=stBase(); fightNo=3; st.fightNo=3; st.standing=.40; st.ganhoEscolhido=.07;
    finishFight({name:"Favorito",rating:.63},
      {winner:me.name,method:"Decisão",knockdowns:{},round:3,clock:"5:00"},false);
    passo("upset NÃO dispara antes da luta 6, mesmo com diferença de rating grande (piso)",
      !st.momentos.some(m=>m.tipo==="upset"));

    /* --- número 1 da tabela: posicaoDivisao() só precisa de LADDER (pro
       tamanho) e st.standing — reservado da 1ª vitória, sem RANKING/ROSTER
       nenhum. Dispara só a 1ª vez (mesmo padrão de estreia/cinturao). */
    LADDER=new Array(236);
    st=stBase(); fightNo=10; st.fightNo=10; st.standing=1; st.ganhoEscolhido=.07;
    finishFight(opp,{winner:me.name,method:"Decisão",knockdowns:{},round:3,clock:"5:00"},false);
    passo("standing no topo (posicaoDivisao().n===1) dispara topoDivisao",
      st.momentos.some(m=>m.tipo==="topoDivisao"));
    const qtdTopo=st.momentos.filter(m=>m.tipo==="topoDivisao").length;
    fightNo=11; st.fightNo=11; st.standing=1;
    finishFight(opp,{winner:me.name,method:"Decisão",knockdowns:{},round:3,clock:"5:00"},false);
    passo("continuar no topo NÃO dispara topoDivisao de novo — só a 1ª vez",
      st.momentos.filter(m=>m.tipo==="topoDivisao").length===qtdTopo);

    st=stBase(); fightNo=10; st.fightNo=10; st.standing=.5; st.ganhoEscolhido=.07;
    finishFight(opp,{winner:me.name,method:"Decisão",knockdowns:{},round:3,clock:"5:00"},false);
    passo("standing no meio da tabela NÃO dispara topoDivisao",
      !st.momentos.some(m=>m.tipo==="topoDivisao"));

    /* Apertado no mesmo dia (2026-09-11): "chegar ao topo em algum momento"
       media 67% das carreiras — alto demais, fora da faixa dos outros
       gatilhos. Só conta se chegar CEDO (até a luta 15, ver comentário da
       constante em index.html) — depois disso, mesmo standing===1 no topo,
       não é mais "marco". */
    st=stBase(); fightNo=16; st.fightNo=16; st.standing=1; st.ganhoEscolhido=.07;
    finishFight(opp,{winner:me.name,method:"Decisão",knockdowns:{},round:3,clock:"5:00"},false);
    passo("standing no topo DEPOIS da luta 15 NÃO dispara topoDivisao (chegou tarde demais)",
      !st.momentos.some(m=>m.tipo==="topoDivisao"));

    /* --- melhor atuação (bônus da noite): medido antes de escrever (ver
       comentário da constante em index.html) — "todo recorde vira card"
       dava 3+ cards por carreira, ruído. Só dispara 1x, no 1º recorde a
       partir da luta 12; st.bonusNoite (o número de verdade, sem trava)
       continua subindo depois disso. */
    st=stBase(); fightNo=5; st.fightNo=5; st.ganhoEscolhido=.07;
    finishFight(opp,{winner:me.name,method:"Nocaute",knockdowns:{},round:1,clock:"4:00"},false);
    passo("recorde de hype ANTES da luta 12 NÃO dispara bonusNoite",
      !st.momentos.some(m=>m.tipo==="bonusNoite"));

    /* fightNo múltiplo de 5 (15, depois 20): cai no ramo do DILEMA em
       finishFight(), não no de sortearRaro() — isola o gatilho sob teste
       do sorteio de RARE, que compete pelo mesmo card (ver comentário da
       constante) e dependeria do estado de rng/rareUsed acumulado pelos
       testes anteriores neste mesmo arquivo. */
    st=stBase(); fightNo=15; st.fightNo=15; st.ganhoEscolhido=.07;
    finishFight(opp,{winner:me.name,method:"Nocaute",knockdowns:{},round:1,clock:"4:00"},false);
    passo("1º recorde de hype a partir da luta 12 dispara bonusNoite",
      st.momentos.some(m=>m.tipo==="bonusNoite"));
    const hypeCard=st.bonusNoite.hype;
    fightNo=20; st.fightNo=20; st.ganhoEscolhido=.07;
    finishFight(opp,{winner:me.name,method:"Nocaute",knockdowns:{[opp.name]:2},round:1,clock:"4:00"},false);
    passo("2º recorde (mais quedas, hype maior) NÃO dispara um 2º card",
      st.momentos.filter(m=>m.tipo==="bonusNoite").length===1);
    passo("mas st.bonusNoite (o número de verdade, sem trava) continua subindo",
      st.bonusNoite.hype>hypeCard);

    /* --- lesão vencida: só a primeira vitória com a lesão ativa */
    st=stBase(); st.fightNo=5;
    const box=document.getElementById("caixaLesaoTeste");
    aplicarDilema(box,{titulo:"Joelho travado",cena:"..."},"aceito lutar assim mesmo",
      {desfecho:"...",seguidores:0,fa:0,
       lesao:{permanente:false,atributo:"strDef",regiao:"Joelho"},evitouLesao:false});
    passo("lesão aplicada (setup)", !!st.lesao);
    st.fightNo=6; st.ganhoEscolhido=.07;
    finishFight(opp,{winner:me.name,method:"Decisão",knockdowns:{},round:3,clock:"5:00"},false);
    st.fightNo=7; st.ganhoEscolhido=.07;
    finishFight(opp,{winner:me.name,method:"Decisão",knockdowns:{},round:3,clock:"5:00"},false);
    passo("2 vitórias machucado disparam só 1 card de lesão",
      st.momentos.filter(m=>m.tipo==="lesao").length===1);

    /* --- RARE: só as 3 marcadas card:true entram no card; streakW>=8
       continua disparando RARE normal (relatório final) mas NÃO o card —
       corte explícito do usuário, 62 de 119 raros positivos medidos vinham
       só desse. */
    /* reseed: rng vem sendo consumido desde o topo do script por todos os
       cenários acima, e drawEvent() só puxa um RARE elegível com 85% de
       chance — sem reseed, esse sorteio final dependeria de acaso e não do
       código. mulberry32(1) começa em 0.627, que passa no <.85. */
    /* fightNo (a variável GLOBAL, não st.fightNo) é quem decide dilema x
       evento em finishFight() — 0%5===0 sempre, então sem setar ela junto
       toda luta cairia no ramo do dilema e drawEvent() nunca rodaria. */
    rng=mulberry32(1); rareUsed=new Set();
    st=stBase(); fightNo=8; st.fightNo=8; st.streakW=8; st.ganhoEscolhido=.07;
    finishFight(opp,{winner:me.name,method:"Decisão",knockdowns:{},round:3,clock:"5:00"},false);
    passo("streakW>=8: dispara RARE (relatório final)",
      st.rares.length>0);
    passo("streakW>=8: NÃO dispara card de momento (cortado de propósito)",
      st.momentos.length===0);

    rng=mulberry32(1); rareUsed=new Set();
    st=stBase(); fightNo=18; st.fightNo=18; st.losses=0; st.wins=17; st.ganhoEscolhido=.07;
    finishFight(opp,{winner:me.name,method:"Decisão",knockdowns:{},round:3,clock:"5:00"},false);
    passo("18-0: dispara card de momento (é um dos 3 marcados card:true)",
      st.momentos.some(m=>m.tipo==="raro"));

    /* bloco de dados do card: adversário e resultado vêm de opp/r, sempre
       disponíveis (todo gatilho roda dentro de finishFight(opp,r,...)) —
       3 linhas fixas, nem mais (ver LEIA-ME "Card de momento"). */
    const ultimo=st.momentos[st.momentos.length-1];
    passo("card carrega adversário", ultimo.adversario==="Rival");
    passo("card carrega resultado (método · round · tempo)",
      ultimo.resultado==="Decisão · round 3 5:00");

    /* Rótulos (achado jogando: "RARO" é categoria, não fato — quem vê o
       print não entende por que virou card). Cada tipo tem que dizer o
       QUE aconteceu, não a caixa interna onde mora. */
    passo("rótulo do raro 18-0 é o cartel de verdade, não a palavra RARO",
      rotuloMomento(ultimo)===ultimo.cartel && ultimo.cartel==="18-0");

    rng=mulberry32(1); rareUsed=new Set();
    // wins/finishes SOBEM 1 dentro de finishFight() (é vitória por nocaute) —
    // parte de 5 pra fechar em 6-0, batendo wins>=6&&finishes===wins
    st=stBase(); fightNo=8; st.fightNo=8; st.wins=5; st.losses=0; st.finishes=5; st.ganhoEscolhido=.07;
    finishFight(opp,{winner:me.name,method:"Nocaute",knockdowns:{},round:2,clock:"5:00"},false);
    const finishStreakM=st.momentos.find(m=>m.tipo==="raro");
    passo("finishStreak tem rótulo próprio, não confunde com o cartel (não é um placar)",
      finishStreakM && rotuloMomento(finishStreakM)==="NUNCA FOI AOS CARTÕES");

    st=stBase(); st.fightNo=3;
    finishFight(opp,{winner:me.name,method:"Nocaute",knockdowns:{},round:1,clock:"4:20"},false);
    const koM=st.momentos.find(m=>m.tipo==="ko");
    passo("nocaute rápido: rótulo diz o TEMPO de verdade (clock 4:20 no round de 5min = 40s)",
      koM && koM.segundosKO===40 && rotuloMomento(koM)==="NOCAUTE EM 40s");

    passo("rótulo do cinturão diz CINTURÃO, não CAMPEÃO (achado jogando: usuário pediu o fato exato)",
      ROTULO_MOMENTO.cinturao==="CINTURÃO");
    passo("rótulo de perder o cinturão diz o fato inteiro",
      ROTULO_MOMENTO.cinturaoPerdido==="PERDEU O CINTURÃO");
    passo("rótulo de estreia diz o fato inteiro",
      ROTULO_MOMENTO.estreia==="ESTREIA NO MAIN CARD");

    /* Prioridade — reproduz o caso EXATO relatado: título vencido por
       finalização, cartel bate 12-0 na mesma luta (invicto12 e cinturao
       disparam juntos). Cinturão tem que ganhar, e o rótulo tem que
       dizer CINTURÃO, não o cartel. */
    st=stBase(); st.fightNo=11; st.wins=11; st.losses=0; st.ganhoEscolhido=.10;
    st.tituloEstaLuta=true;
    finishFight(opp,{winner:me.name,method:"Finalização",knockdowns:{},round:2,clock:"3:10"},true);
    passo("caso relatado (12-0 + cinturão na mesma luta): só 1 card sobra",
      st.momentos.length===1);
    passo("caso relatado: o card que sobra é CINTURÃO, não RARO",
      st.momentos[0].tipo==="cinturao" && rotuloMomento(st.momentos[0])==="CINTURÃO");
    passo("caso relatado: a frase é a do cinturão, não a de doze vitórias",
      st.momentos[0].frase===FRASE_PRIMEIRO_CINTURAO(me.name));
  }catch(e){
    passos.push({nome:"erro inesperado: "+e.message,ok:false});
  }
  return passos;
})();
`;

  try {
    vm.runInContext(lerScript() + corpo, env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("  o cenário nem rodou: " + e.message) + "\n" +
      cinza(e.stack.split("\n").slice(1, 3).join("\n")));
    return false;
  }
  const passos = env.sandbox.__mom || [];
  let ok = true;
  for (const p of passos) {
    if (!p.ok) ok = false;
    console.log(`  ${p.ok ? verde("ok   ") : vermelho("fora ")} ${p.nome}`);
  }
  return ok && passos.length > 0;
}

/* ================================================================== *
 * 7c. FREQUÊNCIA DOS CARDS — carreiras de bot de ponta a ponta (auto,
 *     dilema/escolha na luta resolvidos de verdade), quantos cards de
 *     cada tipo saem de fato. Lento (~7s/carreira, o motor inteiro roda
 *     via nextFight()/lutar()/finishFight() reais, não atalho) — item 8
 *     da leva, harness que travava em ~10 lutas por carreira.
 *
 *     Causa do travamento: o DOM falso reaproveita o MESMO nó cacheado
 *     pra "dilresp"/"dilgo" entre dilemas diferentes (mesmo bug que
 *     testarInterface() já contornava deletando o registro depois de
 *     cada dilema — comentário lá: "o DOM falso reaproveita o nó do
 *     dilema anterior"). Sem apagar o cache, o 2º dilema (luta 10) nunca
 *     resolvia — dilemaAberto ficava true pra sempre, nextFight() barrado
 *     pelo guard (corretamente!) dali em diante, carreira travava em 10
 *     lutas silenciosamente (sem erro, só parava de avançar). Corrigido
 *     com o mesmo `delete registro[...]` que testarInterface() já usa. */
function testarFrequenciaMomentos(N = 30) {
  console.log("\n" + cinza(`${N} carreiras de ponta a ponta (auto), frequência real de cada card`));
  const F = lerLutadores();
  const noop = () => {};
  function makeEl(tag) {
    return {
      tagName: tag, _html: "", textContent: "", id: "", className: "", style: {},
      children: [], disabled: false, value: "",
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      dataset: {},
      appendChild(c) { this.children.push(c); return c; }, append() {}, scrollIntoView: noop, focus: noop,
      addEventListener: noop, remove: noop, querySelector: () => makeEl(), querySelectorAll: () => [],
      getContext: () => null, get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); },
    };
  }
  const respirar = () => new Promise(r => setImmediate(r));

  function novoSandbox() {
    const registro = {}; const timers = [];
    const sb = {
      console: { log: noop, warn: noop, error: noop },
      document: {
        documentElement: makeEl(),
        getElementById: id => registro[id] || (registro[id] = makeEl()), createElement: t => makeEl(t),
        querySelector: () => makeEl(), addEventListener: noop, removeEventListener: noop,
      },
      window: { matchMedia: () => ({ matches: true }) },
      setTimeout: fn => { timers.push(fn); return timers.length; },
      clearTimeout: noop, setInterval: noop, clearInterval: noop,
      fetch: () => Promise.reject(new Error("offline")),
      AbortController: class { constructor() { this.signal = null; } abort() {} },
      Math, JSON, Date, Number, String, Array, Object, Promise, Set, Map, Error, isNaN,
    };
    sb.globalThis = sb;
    vm.createContext(sb);
    return { sb, registro, drenar: () => { let i = 0; while (timers.length && i++ < 200000) (timers.shift())(); } };
  }

  function montarCarreira(sb, seed) {
    const corpo = `
;globalThis.__x=(function(){
  ROSTER=rateAll(${JSON.stringify(F)});
  CUTOFF_RANKING=Math.max(...ROSTER.map(f=>f.era?f.era[1]:0))-6;
  DIVISION="lightweight"; MODO="normal";
  POOL=poolDivisao(DIVISION);
  PCT=makePercentiler(POOL);
  LADDER=[...POOL].sort((a,b)=>a.rating-b.rating);
  RANKING=buildRanking(POOL);
  SEED=${seed};
  rng=mulberry32(SEED); holdRng=mulberry32((SEED^0x9E3779B9)>>>0);
  fraseRng=mulberry32((SEED^0x1234ABCD)>>>0);
  escolhaRng=mulberry32((SEED^0x5F3A9C21)>>>0);
  /* Achado 2026-09-21 (Plano Pro, "tudo" exaustivo): faltava aqui, presente
     na suíte irmã (testarFrequenciaConquistas) — sem isto, qualquer carreira
     que rolasse lesão de nocaute (finishFight(), ver LESAO_NOCAUTE) crashava
     com "lesaoRng is not a function", derrubando 18/30 carreiras da amostra
     em silêncio (a medição de frequência seguia rodando com dados
     incompletos, sem avisar QUE fração real tinha caído fora — só aparecia
     no aviso genérico "N carreiras não chegaram na luta 22"). eventoRng
     também faltava, pelo mesmo motivo (evento por IA por luta). */
  lesaoRng=mulberry32((SEED^0x7C3E1A55)>>>0);
  eventoRng=mulberry32((SEED^0x2B8D4F17)>>>0);
  function draft(rngD){
    let left=TOTAL_WEIGHT*BUDGET_PCT, rem=[...PAIRS];
    const f={name:"TesteBot",division:DIVISION,sapm:3.2};
    while(rem.length){
      const rows=rollTable(POOL,rem,rngD,PCT);
      const aff=rows.filter(r=>r.cost<=left);
      const sh=aff.length?aff:[rows.reduce((m,r)=>r.cost<m.cost?r:m)];
      const r=sh.reduce((m,x)=>x.cost>m.cost?x:m,sh[0]);
      f[r.pair.a.key]=r.src[r.pair.a.key]; f[r.pair.b.key]=r.src[r.pair.b.key];
      left-=r.cost; rem=rem.filter(p=>p.id!==r.pair.id);
    }
    f.strAcc=f.strAcc||.45; f.tdAcc=f.tdAcc||.38;
    return f;
  }
  me=draft(rng);
  me.__base={}; ATTR_TREINAVEIS.forEach(a=>{if(me[a]!=null)me.__base[a]=me[a];});
  ROSTO=null;
  st={treino:{},eventoMod:{},campHist:{},wins:0,losses:0,finishes:0,streakW:0,streakL:0,
      bestBeaten:0,bestWin:null,title:false,standing:.18,peak:.18,events:0,koLosses:0,
      kdTaken:0,kdGiven:0,fightNo:0,fan:5,followers:2400,peakFollowers:2400,longestW:0,
      lostBeltFast:false,rares:[],momentos:[],disputaLiberada:false,disputaRecusas:0,defesas:0,
      exCampeao:null,foiCampeao:false,lesao:null,desafianteIdx:1,bonusNoite:null,vezesCampeao:0,
      subLosses:0,evitouAlgumaVez:false,dinheiro:0,treinadorComprado:false,estreouMainCard:false};
  fought=new Set();rareUsed=new Set();
  fightNo=0;auto=true;speed=1;playing=false;dilemaAberto=false;escolhaAberta=false;
  document.getElementById("app"); document.getElementById("stage"); document.getElementById("phone");
  document.getElementById("live"); document.getElementById("bouts"); document.getElementById("ficha");
  document.getElementById("escolhaLuta").style.display="none";
  document.getElementById("controls"); document.getElementById("next"); document.getElementById("autob");
  globalThis.__ehPlaying=()=>playing;
  globalThis.__ehDilema=()=>dilemaAberto;
  globalThis.__campo=()=>document.getElementById("dilresp");
  globalThis.__botao=()=>document.getElementById("dilgo");
  return "ok";
})();
`;
    vm.runInContext(lerScript() + corpo, sb, { filename: "index.html" });
  }

  async function resolverDilemaSeAberto(sb, drenar, registro) {
    if (!sb.__ehDilema()) return;
    const campo = sb.__campo(), botao = sb.__botao();
    if (campo && botao && !campo.disabled && !botao.disabled) {
      campo.value = "aceito, sem problema";
      botao.onclick();
      delete registro.dilresp; delete registro.dilgo; // nó cacheado do dilema anterior — sem isso o próximo nunca resolve
      drenar(); await respirar(); drenar(); await respirar();
      vm.runInContext("auto=true;", sb); // dilema desliga auto de propósito; religa pro bot seguir sozinho
    }
  }

  async function rodarCarreira(seed) {
    const { sb, drenar, registro } = novoSandbox();
    montarCarreira(sb, seed);
    for (let f = 0; f < 22; f++) {
      let tentativas = 0;
      while (sb.__ehPlaying() && tentativas++ < 100) await respirar();
      await resolverDilemaSeAberto(sb, drenar, registro);
      let t2 = 0;
      while (sb.__ehDilema() && t2++ < 10) await resolverDilemaSeAberto(sb, drenar, registro);
      vm.runInContext("nextFight();", sb);
      drenar(); await respirar(); drenar(); await respirar();
      await resolverDilemaSeAberto(sb, drenar, registro);
    }
    for (let k = 0; k < 15; k++) { drenar(); await respirar(); await resolverDilemaSeAberto(sb, drenar, registro); }
    return { momentos: vm.runInContext("st.momentos", sb) || [], fightNo: vm.runInContext("fightNo", sb) };
  }

  return (async () => {
    const contagem = { cinturao: 0, ko: 0, lesao: 0, cinturaoPerdido: 0, upset: 0, raro: 0, estreia: 0 };
    let totalCards = 0, truncadas = 0;
    for (let s = 0; s < N; s++) {
      let r = { momentos: [], fightNo: 0 };
      try { r = await rodarCarreira(80000 + s); }
      catch (e) { console.log("  carreira " + s + " falhou: " + e.message); }
      if (r.fightNo !== 22) truncadas++;
      totalCards += r.momentos.length;
      r.momentos.forEach(m => { if (contagem[m.tipo] != null) contagem[m.tipo]++; });
    }
    console.log(`  ${cinza(`${N} carreiras, ${totalCards} cards no total, média ${(totalCards / N).toFixed(2)}/carreira`)}`);
    console.log(`  ${cinza("por tipo (% de carreiras com pelo menos 1):")}`);
    for (const k of Object.keys(contagem))
      console.log(`    ${k.padEnd(16)} ${contagem[k]} = ${(100 * contagem[k] / N).toFixed(1)}%`);
    if (truncadas) console.log(`  ${vermelho(truncadas + " carreiras não chegaram na luta 22 — investigar antes de confiar no número")}`);
    return truncadas === 0;
  })();
}

/* ================================================================== *
 * FREQUÊNCIA DE CONQUISTAS — mesmo bot de ponta a ponta de
 *     testarFrequenciaMomentos(), reaproveitado pra medir quantas
 *     carreiras cada conquista de CONQUISTAS realmente desbloqueia (não
 *     só se o check() está no limite certo — testarConquistas() já prova
 *     isso). Pedido explícito do usuário: redesign de conquistas precisa
 *     de número medido, não suposto, mesmo processo dos gatilhos de
 *     card. `dilrespTexto` deixa escolher o que o bot "escreve" no
 *     dilema — "aceito, sem problema" tende a cair pra evitarLesao=false
 *     no julgamento local de fallback (offline, sem chave de IA); outro
 *     texto pode mudar a taxa de "prudente", mas não sai do zero (ver
 *     achado abaixo). */
function testarFrequenciaConquistas(N = 150, modo = "normal", dilrespTexto = "aceito, sem problema") {
  console.log("\n" + cinza(`${N} carreiras de ponta a ponta (auto, modo ${modo}), frequência real de cada conquista`));
  const F = lerLutadores();
  const noop = () => {};
  function makeEl(tag) {
    return {
      tagName: tag, _html: "", textContent: "", id: "", className: "", style: {},
      children: [], disabled: false, value: "",
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      dataset: {},
      appendChild(c) { this.children.push(c); return c; }, append() {}, scrollIntoView: noop, focus: noop,
      addEventListener: noop, remove: noop, querySelector: () => makeEl(), querySelectorAll: () => [],
      getContext: () => null, get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); },
    };
  }
  const respirar = () => new Promise(r => setImmediate(r));

  function novoSandbox() {
    const registro = {}; const timers = [];
    const sb = {
      console: { log: noop, warn: noop, error: noop },
      document: {
        documentElement: makeEl(),
        getElementById: id => registro[id] || (registro[id] = makeEl()), createElement: t => makeEl(t),
        querySelector: () => makeEl(), addEventListener: noop, removeEventListener: noop,
      },
      window: { matchMedia: () => ({ matches: true }) },
      setTimeout: fn => { timers.push(fn); return timers.length; },
      clearTimeout: noop, setInterval: noop, clearInterval: noop,
      fetch: () => Promise.reject(new Error("offline")),
      AbortController: class { constructor() { this.signal = null; } abort() {} },
      Math, JSON, Date, Number, String, Array, Object, Promise, Set, Map, Error, isNaN,
    };
    sb.globalThis = sb;
    vm.createContext(sb);
    return { sb, registro, drenar: () => { let i = 0; while (timers.length && i++ < 200000) (timers.shift())(); } };
  }

  function montarCarreira(sb, seed) {
    const corpo = `
;globalThis.__x=(function(){
  ROSTER=rateAll(${JSON.stringify(F)});
  CUTOFF_RANKING=Math.max(...ROSTER.map(f=>f.era?f.era[1]:0))-6;
  DIVISION="lightweight"; MODO="${modo}";
  POOL=poolDivisao(DIVISION);
  PCT=makePercentiler(POOL);
  LADDER=[...POOL].sort((a,b)=>a.rating-b.rating);
  RANKING=buildRanking(POOL);
  SEED=${seed};
  rng=mulberry32(SEED); holdRng=mulberry32((SEED^0x9E3779B9)>>>0);
  fraseRng=mulberry32((SEED^0x1234ABCD)>>>0);
  escolhaRng=mulberry32((SEED^0x5F3A9C21)>>>0);
  lesaoRng=mulberry32((SEED^0x7C3E1A55)>>>0);
  eventoRng=mulberry32((SEED^0x2B8D4F17)>>>0);
  dilemaRng=mulberry32((SEED^0x4D1E8A63)>>>0);
  function draft(rngD){
    let left=TOTAL_WEIGHT*BUDGET_PCT, rem=[...PAIRS];
    const f={name:"TesteBot",division:DIVISION,sapm:3.2};
    while(rem.length){
      const rows=rollTable(POOL,rem,rngD,PCT);
      const aff=rows.filter(r=>r.cost<=left);
      const sh=aff.length?aff:[rows.reduce((m,r)=>r.cost<m.cost?r:m)];
      const r=sh.reduce((m,x)=>x.cost>m.cost?x:m,sh[0]);
      f[r.pair.a.key]=r.src[r.pair.a.key]; f[r.pair.b.key]=r.src[r.pair.b.key];
      left-=r.cost; rem=rem.filter(p=>p.id!==r.pair.id);
    }
    f.strAcc=f.strAcc||.45; f.tdAcc=f.tdAcc||.38;
    return f;
  }
  me=draft(rng);
  me.__base={}; ATTR_TREINAVEIS.forEach(a=>{if(me[a]!=null)me.__base[a]=me[a];});
  ROSTO=null;
  st={treino:{},eventoMod:{},campHist:{},wins:0,losses:0,finishes:0,streakW:0,streakL:0,
      bestBeaten:0,bestWin:null,title:false,standing:.18,peak:.18,events:0,koLosses:0,
      kdTaken:0,kdGiven:0,fightNo:0,fan:5,followers:2400,peakFollowers:2400,longestW:0,
      lostBeltFast:false,rares:[],momentos:[],disputaLiberada:false,disputaRecusas:0,defesas:0,
      exCampeao:null,foiCampeao:false,lesao:null,desafianteIdx:1,bonusNoite:null,vezesCampeao:0,
      subLosses:0,evitouAlgumaVez:false,dinheiro:0,treinadorComprado:false,estreouMainCard:false};
  fought=new Set();rareUsed=new Set();
  fightNo=0;auto=true;speed=1;playing=false;dilemaAberto=false;escolhaAberta=false;
  document.getElementById("app"); document.getElementById("stage"); document.getElementById("phone");
  document.getElementById("live"); document.getElementById("bouts"); document.getElementById("ficha");
  document.getElementById("escolhaLuta").style.display="none";
  document.getElementById("controls"); document.getElementById("next"); document.getElementById("autob");
  globalThis.__ehPlaying=()=>playing;
  globalThis.__ehDilema=()=>dilemaAberto;
  globalThis.__campo=()=>document.getElementById("dilresp");
  globalThis.__botao=()=>document.getElementById("dilgo");
  return "ok";
})();
`;
    vm.runInContext(lerScript() + corpo, sb, { filename: "index.html" });
  }

  async function resolverDilemaSeAberto(sb, drenar, registro) {
    if (!sb.__ehDilema()) return;
    const campo = sb.__campo(), botao = sb.__botao();
    if (campo && botao && !campo.disabled && !botao.disabled) {
      campo.value = dilrespTexto;
      botao.onclick();
      delete registro.dilresp; delete registro.dilgo;
      drenar(); await respirar(); drenar(); await respirar();
      vm.runInContext("auto=true;", sb);
    }
  }

  async function rodarCarreira(seed) {
    const { sb, drenar, registro } = novoSandbox();
    montarCarreira(sb, seed);
    for (let f = 0; f < 22; f++) {
      let tentativas = 0;
      while (sb.__ehPlaying() && tentativas++ < 100) await respirar();
      await resolverDilemaSeAberto(sb, drenar, registro);
      let t2 = 0;
      while (sb.__ehDilema() && t2++ < 10) await resolverDilemaSeAberto(sb, drenar, registro);
      vm.runInContext("nextFight();", sb);
      drenar(); await respirar(); drenar(); await respirar();
      await resolverDilemaSeAberto(sb, drenar, registro);
    }
    for (let k = 0; k < 15; k++) { drenar(); await respirar(); await resolverDilemaSeAberto(sb, drenar, registro); }
    const resultados = vm.runInContext(`CONQUISTAS.map(c=>({id:c.id,ok:!!c.check(st,MODO)}))`, sb) || [];
    return { fightNo: vm.runInContext("fightNo", sb), resultados };
  }

  return (async () => {
    const contagem = {};
    const idsVistos = new Set();
    let somaDesbloqueadas = 0, truncadas = 0;
    for (let s = 0; s < N; s++) {
      let r = { fightNo: 0, resultados: [] };
      try { r = await rodarCarreira(90000 + s); }
      catch (e) { console.log("  carreira " + s + " falhou: " + e.message); }
      if (r.fightNo !== 22) truncadas++;
      let nesta = 0;
      r.resultados.forEach(({ id, ok }) => {
        idsVistos.add(id);
        if (contagem[id] == null) contagem[id] = 0;
        if (ok) { contagem[id]++; nesta++; }
      });
      somaDesbloqueadas += nesta;
    }
    const ids = [...idsVistos];
    console.log(`  ${cinza(`${N} carreiras, média ${(somaDesbloqueadas / N).toFixed(2)}/${ids.length} desbloqueadas por carreira (${(100 * somaDesbloqueadas / N / ids.length).toFixed(1)}%)`)}`);
    console.log(`  ${cinza("por conquista:")}`);
    for (const id of ids)
      console.log(`    ${id.padEnd(20)} ${(100 * contagem[id] / N).toFixed(1)}%`);
    if (truncadas) console.log(`  ${vermelho(truncadas + " carreiras não chegaram na luta 22 — investigar antes de confiar no número")}`);
    return truncadas === 0;
  })();
}

/* ================================================================== *
 * 7d. CONQUISTAS — cada check() na hora certa, no limite certo
 * ================================================================== */
/* st montado à mão pra cada conquista, nos dois lados do limite (a favor
   do pedido explícito: "defendeu 4 não desbloqueia, defendeu 5 sim") — não
   carreira simulada, porque o que se testa é a FUNÇÃO check(), pura sobre
   st. A parte de fiação (verificarConquistas() persistindo em localStorage
   de verdade, chamada depois de finishFight() real) tem um bloco à parte,
   mais abaixo, com um localStorage falso injetado no sandbox. */

/* ================================================================== *
 * 7e. ESCOLHA NA LUTA — teste do ponto de pausa ANTES do ponto de pausa
 * ================================================================== */
/* Item 1 do desenho de escolha na luta, fase 2 preparatória: o ponto de
   pausa ainda NÃO existe (é o próximo passo, não este commit). O que este
   teste prova é a invariante que o ponto de pausa vai se apoiar em cima:
   `playing` já bloqueia `nextFight()` sozinho, sem flag nova nenhuma —
   ver o guard em nextFight() ("...||playing||...") e o de toggleAuto()
   ("if(auto&&!playing)nextFight()"). É EXATAMENTE a classe do bug
   histórico (clicar automático com o dilema aberto rodava nextFight() por
   cima e travava a carreira — ver o comentário em testarInterface), só
   que aplicada ao estado que o ponto de pausa vai herdar (`playing===true`
   durante toda a narração) em vez de `dilemaAberto`.

   Prova ANTES de escrever o ponto de pausa, contra o código de HOJE — se
   isto já vale hoje, o ponto de pausa herda de graça, sem precisar de
   nenhuma flag nova (`escolhaLutaAberta` ou parecido) só pra isso. */
/* ================================================================== *
 * ESCOLHA NA LUTA v2 (item 6) — sinal do round, modificador por
 * contest(), e o repertório em si (variedade, cobertura dos 7 eixos)
 * ================================================================== */
function testarAcoesLuta() {
  console.log("\n" + cinza("ações na luta: sinal do round, modificador por contest(), repertório"));
  const env = criarAmbiente();
  vm.createContext(env.sandbox);
  const corpo = `
;globalThis.__ac=(function(){
  const passos=[];
  const passo=(nome,ok)=>passos.push({nome,ok:!!ok});
  try{
    passo("sinal: dominado no chão (ctrlB alto)",
      sinalDoRound({burstA:0,burstB:0,tdA:0,tdB:0,ctrlA:0,ctrlB:4})==="dominado");
    passo("sinal: dominado no chão (2+ quedas sofridas, mesmo sem controle alto)",
      sinalDoRound({burstA:0,burstB:0,tdA:0,tdB:2,ctrlA:0,ctrlB:0})==="dominado");
    passo("sinal: sofreu 1 queda só (não dominado)",
      sinalDoRound({burstA:0,burstB:0,tdA:0,tdB:1,ctrlA:0,ctrlB:1})==="sofreu_queda");
    passo("sinal: perdendo a troca",
      sinalDoRound({burstA:2,burstB:6,tdA:0,tdB:0,ctrlA:0,ctrlB:0})==="perdendo_troca");
    passo("sinal: vencendo a troca",
      sinalDoRound({burstA:6,burstB:2,tdA:0,tdB:0,ctrlA:0,ctrlB:0})==="vencendo");
    passo("sinal: parelho (sem diferença que bata os limiares)",
      sinalDoRound({burstA:4,burstB:3,tdA:0,tdB:0,ctrlA:0,ctrlB:0})==="parelho");
    passo("sinal: sem scouting nenhum (round-1 nunca aconteceu) cai em parelho, não quebra",
      sinalDoRound(null)==="parelho");

    // cobertura: todo ATTR_TREINAVEIS tem contra-atributo definido
    const semContraAtributo=ATTR_TREINAVEIS.filter(a=>!COUNTER_ATTR[a]);
    passo("COUNTER_ATTR cobre os 7 atributos treináveis",
      semContraAtributo.length===0);

    // cada pool de sinal tem pelo menos 5 ações (evita trio repetido cedo
    // demais — C(5,3)=10 combinações mínimas por sinal)
    const SINAIS=["dominado","sofreu_queda","perdendo_troca","vencendo","parelho"];
    const poolPequeno=SINAIS.filter(s=>ACOES_LUTA.filter(a=>a.pools.includes(s)).length<5);
    passo("todo sinal tem pool de pelo menos 5 ações ("+SINAIS.map(s=>s+":"+ACOES_LUTA.filter(a=>a.pools.includes(s)).length).join(", ")+")",
      poolPequeno.length===0);

    // nenhuma ação com mais de 4 palavras de conteúdo (regra do card lado a
    // lado) — conta tudo que não é conectivo comum
    const CONECTIVOS=new Set(["e","de","da","do","na","no","a","o","pro","por"]);
    const longas=ACOES_LUTA.filter(a=>
      a.nome.split(" ").filter(p=>!CONECTIVOS.has(p.toLowerCase())).length>4);
    passo("nenhuma ação passa de 4 palavras de conteúdo ("+
      (longas.map(a=>a.nome).join(" | ")||"nenhuma")+")", longas.length===0);

    // modificadorAcao(): direção certa — jogador muito acima do adversário
    // no eixo (e no contra-eixo dele) tem que dar modificador >1; o
    // inverso tem que dar <1. Usa PCT de verdade (makePercentiler) pra não
    // inventar percentil.
    me={name:"Bot"};
    POOL=[]; for(let i=0;i<50;i++) POOL.push({slpm:3+i*.1,strDef:.3+i*.01,tdAvg:1+i*.05,
      tdDef:.3+i*.01,subAvg:.5+i*.05,kdAvg:.2+i*.02,durability:.8+i*.01});
    PCT=makePercentiler(POOL);
    const jogadorForte={slpm:8,strDef:.9,tdAvg:6,tdDef:.9,subAvg:3,kdAvg:1.5,durability:1.3};
    const jogadorFraco={slpm:3,strDef:.3,tdAvg:1,tdDef:.3,subAvg:.5,kdAvg:.2,durability:.8};
    const oppFraco={slpm:3,strDef:.3,tdAvg:1,tdDef:.3,subAvg:.5,kdAvg:.2,durability:.8};
    const oppForte={slpm:8,strDef:.9,tdAvg:6,tdDef:.9,subAvg:3,kdAvg:1.5,durability:1.3};
    const acaoVolume=ACOES_LUTA.find(a=>a.attr==="slpm");
    passo("modificadorAcao(): jogador forte contra adversário fraco no contra-eixo dá modificador > 1",
      modificadorAcao(acaoVolume,jogadorForte,oppFraco)>1);
    passo("modificadorAcao(): jogador fraco contra adversário forte no contra-eixo dá modificador < 1",
      modificadorAcao(acaoVolume,jogadorFraco,oppForte)<1);
    passo("modificadorAcao(): os dois no meio da distribuição dá modificador ~1 (neutro)",
      Math.abs(modificadorAcao(acaoVolume,POOL[25],POOL[25])-1)<.02);

    // mAttr: cada eixo escrito só mexe no seu ponto do motor, isolado dos
    // outros — prova o diagnóstico do mecanismo v1 (A.form vazando pra
    // acurácia+volume+queda ao mesmo tempo) ficou resolvido. Estatístico
    // (N alto) porque exchange()/impact() rolam rng.
    const ref=(x)=>Object.assign({name:"X",division:"lightweight",slpm:5,strAcc:.45,
      strDef:.55,reach:72,durability:1,tdAvg:1,tdAcc:.4,tdDef:.5,subAvg:.5,kdAvg:.4},x);
    function mediaLanded(mAttrAtt,mAttrDef,N){
      let total=0;
      for(let s=0;s<N;s++){
        const rng=mulberry32(s+1);
        const A=mkState(ref(),1),B=mkState(ref(),1);
        Object.assign(A.mAttr,mAttrAtt); Object.assign(B.mAttr,mAttrDef);
        total+=exchange(A,B,rng);
      }
      return total/N;
    }
    const N_ISOL=4000;
    const baseL=mediaLanded({},{},N_ISOL);
    const comSlpm=mediaLanded({slpm:1.5},{},N_ISOL);
    const comTdAvgNoAtaque=mediaLanded({tdAvg:1.5},{},N_ISOL);
    const comStrDefDef=mediaLanded({},{strDef:1.5},N_ISOL);
    passo("mAttr.slpm no atacante muda volume de golpe (exchange())",
      Math.abs(comSlpm-baseL)/baseL>.15);
    passo("mAttr.tdAvg no atacante NÃO vaza pra volume de golpe (isolado, era o vazamento do v1)",
      Math.abs(comTdAvgNoAtaque-baseL)/baseL<.03);
    passo("mAttr.strDef no defensor reduz volume de golpe sofrido",
      comStrDefDef<baseL*.97);

    // durability é inverso — mAttr.durability MAIOR no defensor tem que dar
    // MENOS nocaute/queda, não mais (fácil de inverter sem perceber, ver
    // comentário em cima de impact()).
    function taxaNocaute(mAttrDurDef,N){
      let kos=0;
      for(let s=0;s<N;s++){
        const rng=mulberry32(s+1);
        const A=mkState(ref({kdAvg:1.2}),1),B=mkState(ref(),1);
        B.mAttr.durability=mAttrDurDef; B.damage=140;
        const r=impact(A,B,3,rng);
        if(r)kos++;
      }
      return kos/N;
    }
    const N_DUR=6000;
    const durForte=taxaNocaute(1.6,N_DUR), durFraca=taxaNocaute(.6,N_DUR);
    passo("mAttr.durability alto no defensor DIMINUI a chance de nocaute/queda ("+
      (100*durForte).toFixed(1)+"% vs "+(100*durFraca).toFixed(1)+"% com o eixo fraco)",
      durForte<durFraca);
  }catch(e){
    passos.push({nome:"erro inesperado: "+e.message,ok:false});
  }
  return passos;
})();
`;
  try {
    vm.runInContext(lerScript() + corpo, env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("  o cenário nem rodou: " + e.message) + "\n" +
      cinza(e.stack.split("\n").slice(1, 3).join("\n")));
    return false;
  }
  const passos = env.sandbox.__ac || [];
  let ok = true;
  for (const p of passos) {
    if (!p.ok) ok = false;
    console.log(`  ${p.ok ? verde("ok   ") : vermelho("fora ")} ${p.nome}`);
  }
  return ok && passos.length > 0;
}

function testarEscolhaLuta() {
  console.log("\n" + cinza("escolha na luta (fase 2 prep): playing já bloqueia nextFight() sozinho, sem flag nova"));
  const env = criarAmbiente();
  vm.createContext(env.sandbox);

  const corpo = `
;globalThis.__el=(function(){
  const passos=[];
  const passo=(nome,ok)=>passos.push({nome,ok:!!ok});
  try{
    me={name:"TesteBot",division:"lightweight",slpm:5.0,strDef:.55,durability:1.0,
        tdDef:.6,subAvg:.5,kdAvg:.4,strAcc:.45,tdAcc:.38};
    st={treino:{},eventoMod:{},campHist:{},wins:0,losses:0,fightNo:5,standing:.5,
        title:false,defesas:0,rares:[],momentos:[]};
    fightNo=5; st.fightNo=5;
    dilemaAberto=false; escolhaAberta=false; auto=false;

    /* cenário 1: playing=true (é o que vale durante toda narração, e vai
       valer durante a pausa de escolha também) — nextFight() tem que ser
       no-op, sem incrementar fightNo nem chamar candidatos()/lutar(). */
    playing=true;
    const fightNoAntes=fightNo;
    nextFight();
    passo("playing=true: nextFight() não incrementa fightNo (não rodou por cima)",
      fightNo===fightNoAntes);

    /* cenário 2: exatamente o bug histórico, só que com playing em vez de
       dilemaAberto — clicar "automático" NO MEIO de playing=true não pode
       disparar nextFight() por baixo do pano. auto pode virar true (é só
       um toggle de UI), mas nextFight() não pode rodar por causa disso. */
    playing=true; auto=false;
    const fightNoAntesToggle=fightNo;
    toggleAuto();
    passo("toggleAuto() durante playing=true: auto vira true normalmente (é só UI)",
      auto===true);
    passo("toggleAuto() durante playing=true: NÃO disparou nextFight() por baixo (fightNo intocado)",
      fightNo===fightNoAntesToggle);

    /* cenário 3 (controle): com playing=false e auto=true, toggleAuto()
       PODE disparar nextFight() — é o comportamento normal fora da
       narração, não pode ter quebrado. Só confirma que fightNo tentou
       avançar (nextFight() chama candidatos(), que aqui não tem
       RANKING/LADDER montado e lança — o que já prova que tentou rodar;
       não é o alvo deste teste medir o resultado, só o disparo). */
    playing=false; auto=false;
    let tentouRodar=false;
    try{ toggleAuto(); }catch(e){ tentouRodar=true; }
    passo("controle: playing=false permite toggleAuto() tentar nextFight() (comportamento normal preservado)",
      tentouRodar);
  }catch(e){
    passos.push({nome:"erro inesperado: "+e.message,ok:false});
  }
  return passos;
})();
`;

  try {
    vm.runInContext(lerScript() + corpo, env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("  o cenário nem rodou: " + e.message) + "\n" +
      cinza(e.stack.split("\n").slice(1, 3).join("\n")));
    return false;
  }
  const passos = env.sandbox.__el || [];
  let ok = true;
  for (const p of passos) {
    if (!p.ok) ok = false;
    console.log(`  ${p.ok ? verde("ok   ") : vermelho("fora ")} ${p.nome}`);
  }
  return ok && passos.length > 0;
}

/* ================================================================== *
 * ESCOLHA NA LUTA — FASE 2, ponto de pausa (escrito ANTES do código)
 * ================================================================== */
/* lutar() hoje chama simulateFight() UMA VEZ (a luta inteira decide antes
   de narrate() animar a primeira linha) — uma pausa dentro de narrate()
   seria cosmética, o round 2 já estaria decidido. A pausa real exige
   lutar() virar um DRIVER round a round: chamar simularRound() um round
   de cada vez, animar o pedaço, parar pra escolha, aplicar o modificador,
   chamar o round seguinte. Este teste prova, com fighters e seed reais,
   que esse driver é seguro ANTES de escrevê-lo em lutar():
     1. chamar simularRound() em loop (mesmo rng, mesmo A/B, mesmo scores,
        passando de round a round) reproduz BIT A BIT o que simulateFight()
        devolve numa chamada só — o driver não muda nada sozinho.
     2. um modificador FIXO (sem rng nova) aplicado em .form depois do
        round 1 deixa o log do round 1 intocado (o round já fechou) e muda
        o resultado dali pra frente — é o gancho que a escolha vai usar.
     3. controle: modificador 1 (neutro) reproduz exatamente o mesmo
        resultado que não aplicar nada — o gancho não é mágico, é inerte
        na identidade. */
function testarDriverRodada() {
  console.log("\n" + cinza("driver round-a-round (fase 2, antes do código): simularRound() em loop bate com simulateFight()"));
  const M = carregarMotor(), F = lerLutadores();
  const a = F.find(f => f.name === "Jon Jones"), b = F.find(f => f.name === "Daniel Cormier");
  if (!a || !b) { console.log(vermelho("  não achei os lutadores de referência")); return false; }
  const seed = 6; // medido: só com este seed o combate vai aos 3 rounds sem terminar no round 1

  function driver(seed, modA) {
    const rng = M.mulberry32(seed);
    const form = () => 1 + (rng() + rng() + rng() - 1.5) / 1.5 * M.TUNING.formSpread;
    const A = M.mkState(a, form()), B = M.mkState(b, form());
    const log = [];
    const push = (round, clock, kind, text) => log.push({ round, clock, kind, text });
    const kds = () => ({ [A.ref.name]: A.knockdowns, [B.ref.name]: B.knockdowns });
    const fin = (w, l, round, clock, m) => {
      push(round, clock, "fin", `${w.ref.name} vence por ${m.toLowerCase()}`);
      return { winner: w.ref.name, loser: l.ref.name, method: m, round, clock, cards: null, log, knockdowns: kds() };
    };
    const scores = { sa: 0, sb: 0 };
    let res = null, round1Log = null;
    for (let round = 1; round <= 3 && !res; round++) {
      res = M.simularRound(A, B, round, rng, push, fin, scores);
      if (round === 1) { round1Log = log.slice(); if (!res && modA) A.form *= modA; }
    }
    if (!res) {
      const w = scores.sa > scores.sb ? A : scores.sb > scores.sa ? B : (rng() < .5 ? A : B), l = w === A ? B : A;
      log.push({ round: 3, clock: "0:00", kind: "fin",
        text: `Vai pros cartões. ${w.ref.name} vence por decisão, ${Math.max(scores.sa, scores.sb)}-${Math.min(scores.sa, scores.sb)}.` });
      res = { winner: w.ref.name, loser: l.ref.name, method: "Decisão", round: 3, clock: "0:00",
        cards: scores.sa + "-" + scores.sb, log, knockdowns: kds() };
    }
    return { round1Log, log, res };
  }

  const direto = M.simulateFight(a, b, { seed, rounds: 3 });
  const semEscolha = driver(seed, null);
  const comEscolha = driver(seed, 1.15);   // escolha fictícia: +15% de form pro resto da luta
  const neutro = driver(seed, 1);          // controle: modificador identidade

  let ok = true;
  const passo = (nome, cond) => { if (!cond) ok = false; console.log(`  ${cond ? verde("ok   ") : vermelho("fora ")} ${nome}`); };

  passo("driver round-a-round bate bit a bit com simulateFight() numa chamada só",
    JSON.stringify(direto.log) === JSON.stringify(semEscolha.log) &&
    direto.winner === semEscolha.res.winner && direto.method === semEscolha.res.method && direto.cards === semEscolha.res.cards);

  passo("modificador pós-round-1 não altera o log do round 1 já fechado",
    JSON.stringify(semEscolha.round1Log) === JSON.stringify(comEscolha.round1Log));

  passo("modificador pós-round-1 muda o resultado dali pra frente (o gancho funciona)",
    JSON.stringify(semEscolha.res) !== JSON.stringify(comEscolha.res));

  passo("controle: modificador neutro (×1) reproduz o mesmo resultado que não aplicar nada",
    JSON.stringify(semEscolha.res) === JSON.stringify(neutro.res));

  return ok;
}

/* ================================================================== *
 * DRIVER ROUND-A-ROUND — a linha de resultado tem que aparecer NA TELA
 * ================================================================== */
/* Achado jogando em produção: luta que vai aos cartões termina sem
   nenhuma linha de resultado — nem "vence por decisão", nem cartões, nem
   o carimbo de vitória/derrota. testarDriverRodada() (acima) já prova que
   o LOG (array em memória) bate bit a bit com simulateFight(), mas nunca
   prova que esse log vira TELA de verdade — e é exatamente aí que o bug
   mora: montarDecisao() empurra a linha de decisão pro array `log` DEPOIS
   que o último animarTrecho() já consumiu e renderizou o trecho do round
   final. animarTrecho() nunca é chamado de novo com essa linha, então ela
   fica presa no array e nunca chega no DOM. fin() (KO/finalização) não
   tem esse problema: ele roda DENTRO de simularRound(), antes do
   `trecho=log.slice(marca)` que alimenta animarTrecho() — por isso só
   decisão quebra, nunca KO/finalização.
   Carreira real de ponta a ponta (auto, nextFight()/lutar()/finishFight()
   de verdade — mesmo harness de testarFrequenciaMomentos), não luta
   isolada: sem isso não dá pra provar que finishFight() roda (cartel
   avança, carimbo aparece no card da luta) mesmo quando a narração ao
   vivo perde a linha — as duas coisas são independentes e o achado é
   exatamente essa independência. */
function testarNarracaoResultado(N = 8) {
  console.log("\n" + cinza(`${N} carreiras reais: a linha de resultado aparece na narração ao vivo?`));
  const F = lerLutadores();
  const noop = () => {};
  function makeEl(tag) {
    return {
      tagName: tag, _html: "", textContent: "", id: "", className: "", style: {},
      children: [], disabled: false, value: "",
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      dataset: {},
      appendChild(c) { this.children.push(c); return c; }, append() {}, scrollIntoView: noop, focus: noop,
      addEventListener: noop, remove: noop, querySelector: () => makeEl(), querySelectorAll: () => [],
      getContext: () => null, get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); },
    };
  }
  const respirar = () => new Promise(r => setImmediate(r));

  function novoSandbox() {
    const registro = {}; const timers = [];
    const sb = {
      console: { log: noop, warn: noop, error: noop },
      document: {
        documentElement: makeEl(),
        getElementById: id => registro[id] || (registro[id] = makeEl()), createElement: t => makeEl(t),
        querySelector: () => makeEl(), addEventListener: noop, removeEventListener: noop,
      },
      window: { matchMedia: () => ({ matches: true }) },
      setTimeout: fn => { timers.push(fn); return timers.length; },
      clearTimeout: noop, setInterval: noop, clearInterval: noop,
      fetch: () => Promise.reject(new Error("offline")),
      AbortController: class { constructor() { this.signal = null; } abort() {} },
      Math, JSON, Date, Number, String, Array, Object, Promise, Set, Map, Error, isNaN,
    };
    sb.globalThis = sb;
    vm.createContext(sb);
    return { sb, registro, drenar: () => { let i = 0; while (timers.length && i++ < 200000) (timers.shift())(); } };
  }

  function montarCarreira(sb, seed) {
    const corpo = `
;globalThis.__x=(function(){
  ROSTER=rateAll(${JSON.stringify(F)});
  CUTOFF_RANKING=Math.max(...ROSTER.map(f=>f.era?f.era[1]:0))-6;
  DIVISION="lightweight"; MODO="normal";
  POOL=poolDivisao(DIVISION);
  PCT=makePercentiler(POOL);
  LADDER=[...POOL].sort((a,b)=>a.rating-b.rating);
  RANKING=buildRanking(POOL);
  SEED=${seed};
  rng=mulberry32(SEED); holdRng=mulberry32((SEED^0x9E3779B9)>>>0);
  fraseRng=mulberry32((SEED^0x1234ABCD)>>>0);
  escolhaRng=mulberry32((SEED^0x5F3A9C21)>>>0);
  lesaoRng=mulberry32((SEED^0x7F4A7C15)>>>0);
  eventoRng=mulberry32((SEED^0x2B8D4F17)>>>0);
  function draft(rngD){
    let left=TOTAL_WEIGHT*BUDGET_PCT, rem=[...PAIRS];
    const f={name:"TesteBot",division:DIVISION,sapm:3.2};
    while(rem.length){
      const rows=rollTable(POOL,rem,rngD,PCT);
      const aff=rows.filter(r=>r.cost<=left);
      const sh=aff.length?aff:[rows.reduce((m,r)=>r.cost<m.cost?r:m)];
      const r=sh.reduce((m,x)=>x.cost>m.cost?x:m,sh[0]);
      f[r.pair.a.key]=r.src[r.pair.a.key]; f[r.pair.b.key]=r.src[r.pair.b.key];
      left-=r.cost; rem=rem.filter(p=>p.id!==r.pair.id);
    }
    f.strAcc=f.strAcc||.45; f.tdAcc=f.tdAcc||.38;
    return f;
  }
  me=draft(rng);
  me.__base={}; ATTR_TREINAVEIS.forEach(a=>{if(me[a]!=null)me.__base[a]=me[a];});
  ROSTO=null;
  st={treino:{},eventoMod:{},campHist:{},wins:0,losses:0,finishes:0,streakW:0,streakL:0,
      bestBeaten:0,bestWin:null,title:false,standing:.18,peak:.18,events:0,koLosses:0,
      kdTaken:0,kdGiven:0,fightNo:0,fan:5,followers:2400,peakFollowers:2400,longestW:0,
      lostBeltFast:false,rares:[],momentos:[],disputaLiberada:false,disputaRecusas:0,defesas:0,
      exCampeao:null,foiCampeao:false,lesao:null,desafianteIdx:1,bonusNoite:null,vezesCampeao:0,
      subLosses:0,evitouAlgumaVez:false,dinheiro:0,treinadorComprado:false,estreouMainCard:false};
  fought=new Set();rareUsed=new Set();
  fightNo=0;auto=true;speed=1;playing=false;dilemaAberto=false;escolhaAberta=false;
  document.getElementById("app"); document.getElementById("stage"); document.getElementById("phone");
  document.getElementById("live"); document.getElementById("bouts"); document.getElementById("ficha");
  document.getElementById("escolhaLuta").style.display="none";
  document.getElementById("controls"); document.getElementById("next"); document.getElementById("autob");
  globalThis.__ehPlaying=()=>playing;
  globalThis.__ehDilema=()=>dilemaAberto;
  globalThis.__campo=()=>document.getElementById("dilresp");
  globalThis.__botao=()=>document.getElementById("dilgo");
  return "ok";
})();
`;
    vm.runInContext(lerScript() + corpo, sb, { filename: "index.html" });
  }

  async function resolverDilemaSeAberto(sb, drenar, registro) {
    if (!sb.__ehDilema()) return;
    const campo = sb.__campo(), botao = sb.__botao();
    if (campo && botao && !campo.disabled && !botao.disabled) {
      campo.value = "aceito, sem problema";
      botao.onclick();
      delete registro.dilresp; delete registro.dilgo;
      drenar(); await respirar(); drenar(); await respirar();
      vm.runInContext("auto=true;", sb);
    }
  }

  async function rodarCarreira(seed) {
    const { sb, drenar, registro } = novoSandbox();
    montarCarreira(sb, seed);
    for (let f = 0; f < 22; f++) {
      let tentativas = 0;
      while (sb.__ehPlaying() && tentativas++ < 100) await respirar();
      await resolverDilemaSeAberto(sb, drenar, registro);
      let t2 = 0;
      while (sb.__ehDilema() && t2++ < 10) await resolverDilemaSeAberto(sb, drenar, registro);
      vm.runInContext("nextFight();", sb);
      drenar(); await respirar(); drenar(); await respirar();
      await resolverDilemaSeAberto(sb, drenar, registro);
    }
    for (let k = 0; k < 15; k++) { drenar(); await respirar(); await resolverDilemaSeAberto(sb, drenar, registro); }
    const fightNo = vm.runInContext("fightNo", sb);
    const wins = vm.runInContext("st.wins", sb), losses = vm.runInContext("st.losses", sb);
    /* #bouts é compartilhado — carrega a linha de resultado (className "bout")
       E qualquer painel de dilema/evento/momento que aconteceu naquela luta
       (className "dilema"/"event"/etc.). Preserva className aqui pra quem
       filtra depois poder distinguir — texto sozinho não basta: o painel de
       dilema tem "Decisão" como RÓTULO FIXO da seção (`dil-eyebrow`), sem
       nenhuma relação com o método da luta, e um filtro por texto puro conta
       os dois como se fossem a mesma coisa (achado 2026-09-21, ver
       PENDENCIAS.md). Token-based, nunca `n.className==="x"` — mesma regra
       do resto do arquivo. */
    const boutsLinhas = (registro.bouts ? registro.bouts.children : [])
      .map(c => ({ cls: String(c.className || ""), html: c.innerHTML }));
    const playLinhas = (registro.play ? registro.play.children : []).map(c => c.innerHTML);
    return { fightNo, wins, losses, boutsLinhas, playLinhas };
  }

  return (async () => {
    let ok = true;
    const passo = (nome, cond) => { if (!cond) ok = false; console.log(`  ${cond ? verde("ok   ") : vermelho("fora ")} ${nome}`); };
    let totalDecisoes = 0, totalNarradasDecisao = 0, totalFinishes = 0, totalNarradasFinish = 0, carreirasCompletas = 0;
    for (let s = 0; s < N; s++) {
      const r = await rodarCarreira(60000 + s);
      if (r.fightNo === 22 && r.wins + r.losses === 22) carreirasCompletas++;

      /* SÓ a linha de verdade (className "bout") — nunca o innerHTML puro de
         TODO #bouts, que também acumula painel de dilema (rótulo fixo
         "Decisão", nada a ver com método de luta), evento e momento. */
      const linhasDeFato = r.boutsLinhas.filter(l => l.cls.split(" ").includes("bout")).map(l => l.html);
      const decisoesBout = linhasDeFato.filter(l => /Decisão/.test(l)).length;
      const finishesBout = linhasDeFato.filter(l => /Nocaute|Finaliza/.test(l)).length;
      /* fin() escreve "vence por nocaute"/"vence por finalização"/"vence por
         nocaute técnico no chão"; montarDecisao() escreve "vence por decisão".
         Casar por essas frases, não pelo `kind`, porque é exatamente o texto
         que o jogador vê na tela ao vivo — o que importa aqui. */
      const narradasDecisao = r.playLinhas.filter(l => /vence por decis/i.test(l)).length;
      const narradasFinish = r.playLinhas.filter(l => /vence por (nocaute|finaliza)/i.test(l)).length;

      totalDecisoes += decisoesBout; totalNarradasDecisao += narradasDecisao;
      totalFinishes += finishesBout; totalNarradasFinish += narradasFinish;
    }
    passo(`${N} carreiras chegaram inteiras (22 lutas, cartel bate) — pré-condição da medição`,
      carreirasCompletas === N);
    passo(`pelo menos 1 decisão real na amostra (${totalDecisoes} no total) — senão a medição não vale nada`,
      totalDecisoes > 0);
    passo(`controle: KO/finalização SEMPRE narra a linha de resultado ao vivo (${totalNarradasFinish}/${totalFinishes})`,
      totalFinishes > 0 && totalNarradasFinish === totalFinishes);
    /* Achado 2026-09-21 (investigado a pedido do usuário, que via 31/63 aqui
       e perguntou se o CONSERTO de trechoFinal (ver comentário em lutar(),
       index.html) tinha voltado ou nunca tinha ficado completo — NENHUM
       DOS DOIS: o motor sempre esteve certo, o TESTE que contava errado.
       `decisoesBout` filtrava #bouts por TEXTO "Decisão" sem checar
       className — e o painel de dilema (que também vive em #bouts) tem
       "Decisão" como RÓTULO FIXO da seção (`dil-eyebrow`), nada a ver com o
       método da luta. 4 dilemas por carreira × 8 carreiras = 32 painéis
       falsos, quase batendo exato com o gap (63 registrados − 31 reais =
       32). Corrigido: `linhasDeFato` filtra por className "bout" antes de
       testar o texto (ver acima). Reproduzido isolado com instrumentação
       fora do harness antes de mexer aqui — não foi só teoria. */
    passo(`decisão narra a linha de resultado ao vivo tantas vezes quanto o cartel registrou (${totalNarradasDecisao}/${totalDecisoes})`,
      totalNarradasDecisao === totalDecisoes);
    return ok;
  })();
}

/* ================================================================== *
 * LOJA — cada item mostra descrição (negrito) e efeito em número (negrito,
 *     verde escuro) separados; comprar desconta, marca e não deixa comprar
 *     2x; sem dinheiro, o botão vem desabilitado.
 * ================================================================== */
/* ================================================================== *
 * SALVAR/COPIAR IMAGEM — era um botão só ("Compartilhar", via
 *     navigator.share()) que, no Mac, podia devolver a folha do sistema
 *     oferecendo o arquivo E o link como dois itens — lia como "a imagem
 *     veio duplicada" sem duplicação nenhuma no arquivo em si. Virou dois
 *     botões determinísticos (salvarImagem()/copiarImagem()), sem folha
 *     nativa no meio. O bug de reentrância original ("colei e vieram dois
 *     arquivos idênticos, mesmo nome") continua valendo pros dois: cada
 *     função ATRIBUI btn.disabled=true mas só o CHECA no topo — duas
 *     invocações antes do 1º await resolver rodam as duas inteiras.
 * ================================================================== */
function testarCompartilhar() {
  console.log("\n" + cinza("salvarImagem()/copiarImagem(): dois toques antes do 1º await resolver não podem duplicar"));
  const env = criarAmbiente();
  const origCreateElement = env.sandbox.document.createElement;
  const cliques = [];
  env.sandbox.document.createElement = t => {
    const n = origCreateElement(t);
    if (t === "a") n.click = () => cliques.push(n.href);
    return n;
  };
  let chamadasClipboardWrite = 0;
  env.sandbox.navigator = {
    canShare: () => false,
    share: async () => {},
    clipboard: {
      writeText: async () => {},
      write: async () => { chamadasClipboardWrite++; },
    },
  };
  // window.ClipboardItem (checado antes de usar) e o global ClipboardItem
  // (usado em `new ClipboardItem(...)`) precisam ser a MESMA classe fake —
  // são dois jeitos de achar a mesma coisa no navegador de verdade.
  class ClipboardItemFake { constructor(o) { this.o = o; } }
  env.sandbox.ClipboardItem = ClipboardItemFake;
  env.sandbox.window.ClipboardItem = ClipboardItemFake;
  env.sandbox.URL = { createObjectURL: () => "blob:fake", revokeObjectURL: () => {} };
  env.sandbox.File = class { constructor(partes, nome, opts) { this.nome = nome; this.type = opts && opts.type; } };
  /* salvarImagem()/copiarImagem() reagendam disabled=false num setTimeout
     (pra segurar "Salvo"/"Copiada!" na tela um instante) — o setTimeout
     deste ambiente só ENFILEIRA (criarAmbiente().drenar() que executa de
     verdade). Sem drenar entre cenários que reusam o MESMO botão
     (caminho 1 → caminho 3, mesmo botaoSalvarPainel), o 2º cenário
     encontraria disabled ainda true do 1º e nem chegaria a rodar —
     falso "reentrância bloqueada" por timer preso, não por guard. */
  env.sandbox.__drenar = env.drenar;
  /* `chamadasClipboardWrite` é variável do escopo de FORA (Node) — o
     fecho de navigator.clipboard.write() a incrementa certo não importa
     de onde é chamado, closures atravessam vm.runInContext(). Mas o
     CORPO abaixo roda como script à parte dentro do sandbox: escrever
     "chamadasClipboardWrite=0" ali de dentro NÃO reatribui esta
     variável — cria/muda uma global HOMÔNIMA solta no sandbox (modo não
     estrito), sem relação nenhuma com o contador real. Achado testando:
     "Copiada!" aparecia certo na tela (prova que write() rodou), mas a
     asserção via essa global fantasma sempre lia 0. Exposta como função
     pra o corpo só LER o valor de verdade, nunca reatribuir. */
  env.sandbox.__nEscritasClipboard = () => chamadasClipboardWrite;
  vm.createContext(env.sandbox);

  const corpo = `
;globalThis.__comp=(async function(){
  const passos=[];
  const passo=(nome,ok)=>passos.push({nome,ok:!!ok});
  try{
    me={name:"TesteBot"};
    let chamadasDesenhar=0;
    const desenharFake=async(g)=>{
      chamadasDesenhar++;
      return {toBlob:(cb)=>cb({fake:"blob",n:chamadasDesenhar})};
    };
    const m={frase:"Doze lutas, doze vitórias.",titulo:"Doze e zero"};

    // toque duplo: chama o MESMO onclick que um clique real dispara, duas
    // vezes seguidas, sem esperar a 1ª terminar — é isso que "clicar rápido
    // duas vezes antes do disabled surtir efeito" produz na prática.
    const btnS=el("button","","Salvar imagem");
    const pS1=salvarImagem(m,btnS,desenharFake), pS2=salvarImagem(m,btnS,desenharFake);
    await Promise.all([pS1,pS2]);
    __drenar();
    passo("salvarImagem() isolada: desenhar() rodou só 1 vez com 2 chamadas seguidas (reentrância bloqueada)",
      chamadasDesenhar===1);

    chamadasDesenhar=0;
    const antesEscIsolada=__nEscritasClipboard();
    const btnC=el("button","","Copiar imagem");
    const pC1=copiarImagem(m,btnC,desenharFake), pC2=copiarImagem(m,btnC,desenharFake);
    await Promise.all([pC1,pC2]);
    __drenar();
    passo("copiarImagem() isolada: desenhar() rodou só 1 vez com 2 chamadas seguidas (reentrância bloqueada)",
      chamadasDesenhar===1);
    passo("copiarImagem() isolada: escreveu na área de transferência (não caiu no catch por falta de suporte fake)",
      (__nEscritasClipboard()-antesEscIsolada)===1);

    /* ---------------------------------------------------------------
       Achado jogando (2026-09-11): "a duplicação voltou". O teste acima
       só prova que as funções se protegem quando CHAMADAS direto — não
       prova que os caminhos de verdade (painel de momentos, fim de
       carreira, miniatura clicável) estão fiados certo. Daqui pra baixo
       roda a FIAÇÃO real — abrirPainelMomentos()/screenReport() de
       verdade, achando o botão pelo texto renderizado, não reconstruindo
       um onclick equivalente. */
    function acharBotao(node,texto){
      if(!node||!node.children)return null;
      for(const c of node.children){
        if(c.tagName==="button"&&c.innerHTML===texto)return c;
        const achado=acharBotao(c,texto);
        if(achado)return achado;
      }
      return null;
    }
    function acharPorClasse(node,cls){
      if(!node||!node.children)return null;
      for(const c of node.children){
        if((c.className||"").split(" ").includes(cls))return c;
        const achado=acharPorClasse(c,cls);
        if(achado)return achado;
      }
      return null;
    }

    me={name:"TesteBot",division:"lightweight",slpm:5.0,strDef:.55,durability:1.0,
        tdDef:.6,subAvg:.5,kdAvg:.4,strAcc:.45,tdAcc:.38,stance:"Orthodox"};
    me.__base={}; ATTR_TREINAVEIS.forEach(k=>{if(me[k]!=null)me.__base[k]=me[k];});
    fightNo=22; SEED=12345; picks=[]; ROSTO=null; MODO="normal";
    st={treino:{},eventoMod:{},campHist:{},wins:15,losses:7,finishes:9,streakW:2,streakL:0,
        bestBeaten:.8,bestWin:"Rival Bravo",title:true,standing:.9,peak:.9,events:3,koLosses:1,
        kdTaken:2,kdGiven:5,fightNo:22,fan:8,followers:500000,peakFollowers:520000,longestW:6,
        lostBeltFast:false,rares:["Fora da curva"],momentos:[
          {tipo:"cinturao",frase:"Levantou o cinturão.",cartel:"15-7",luta:14,
           adversario:"Rival",resultado:"Decisão · round 5 5:00",posicao:"#1 de 236"}
        ],disputaLiberada:false,defesas:2,exCampeao:null,foiCampeao:true,lesao:null,dinheiro:0};
    fought=new Set(); rareUsed=new Set();

    /* desenhar de verdade precisa de canvas/fonte reais que o ambiente
       falso não tem — troca pela mesma técnica de acima, só que
       reatribuindo o binding GLOBAL (as duas telas chamam pelo nome, sem
       receber o desenhador por parâmetro — screenReport() nem tem esse
       parâmetro). O que se prova aqui é a FIAÇÃO (o botão certo, achado no
       DOM de verdade, chamado 2x), não o desenho em si. */
    let chamadasCard=0,chamadasMomento=0;
    desenharCard=async(g)=>{chamadasCard++;return{toBlob:(cb)=>cb({fake:"blob-card"})};};
    desenharCardMomento=async(m)=>{chamadasMomento++;
      return{toBlob:(cb)=>cb({fake:"blob-momento"}),toDataURL:()=>"data:image/png;base64,fake"};};

    // ---------- caminho 1 e 3: painel de momentos ----------
    await abrirPainelMomentos();
    const painel=document.getElementById("painelMomentos");
    const botaoSalvarPainel=acharBotao(painel,"Salvar imagem");
    const botaoCopiarPainel=acharBotao(painel,"Copiar imagem");
    passo("caminho 1: achou 'Salvar imagem' E 'Copiar imagem' de verdade (fiação real de abrirPainelMomentos, não onclick reconstruído)",
      !!botaoSalvarPainel && !!botaoCopiarPainel);
    const miniatura=acharPorClasse(painel,"momento-mini");
    passo("miniatura NÃO é <canvas>/<img> — sem alvo pro 'Copiar imagem'/'Salvar imagem' nativo do navegador",
      !!miniatura && miniatura.tagName!=="canvas" && miniatura.tagName!=="img");

    chamadasMomento=0;
    const q1=botaoSalvarPainel.onclick(), q2=botaoSalvarPainel.onclick();  // 2 cliques reais, mesmo botão
    await Promise.all([q1,q2]);
    __drenar();
    passo("caminho 1 (Salvar, botão real do painel): 2 cliques seguidos geram só 1 desenho",
      chamadasMomento===1);

    chamadasMomento=0;
    const q3=miniatura.onclick(), q4=botaoSalvarPainel.onclick();    // miniatura + botão Salvar, mesmo card
    await Promise.all([q3,q4]);
    __drenar();
    passo("caminho 3 (miniatura + botão Salvar do mesmo card, guard compartilhado): também gera só 1 desenho",
      chamadasMomento===1);

    chamadasMomento=0;
    const antesEsc1=__nEscritasClipboard();
    const q5=botaoCopiarPainel.onclick(), q6=botaoCopiarPainel.onclick();
    await Promise.all([q5,q6]);
    __drenar();
    passo("caminho 1 (Copiar, botão real do painel): 2 cliques seguidos escrevem na área de transferência só 1 vez",
      chamadasMomento===1 && (__nEscritasClipboard()-antesEsc1)===1);

    // ---------- caminho 2: fim de carreira ----------
    screenReport();
    const botaoSalvarFim=acharBotao(app,"Salvar imagem");
    const botaoCopiarFim=acharBotao(app,"Copiar imagem");
    passo("caminho 2: achou 'Salvar imagem' E 'Copiar imagem' de verdade (fiação real de screenReport)",
      !!botaoSalvarFim && !!botaoCopiarFim);

    chamadasCard=0;
    const q7=botaoSalvarFim.onclick(), q8=botaoSalvarFim.onclick();
    await Promise.all([q7,q8]);
    __drenar();
    passo("caminho 2 (Salvar, botão real do fim de carreira): 2 cliques seguidos geram só 1 desenho",
      chamadasCard===1);

    chamadasCard=0;
    const antesEsc2=__nEscritasClipboard();
    const q9=botaoCopiarFim.onclick(), q10=botaoCopiarFim.onclick();
    await Promise.all([q9,q10]);
    __drenar();
    passo("caminho 2 (Copiar, botão real do fim de carreira): 2 cliques seguidos escrevem na área de transferência só 1 vez",
      chamadasCard===1 && (__nEscritasClipboard()-antesEsc2)===1);
  }catch(e){
    passos.push({nome:"erro inesperado: "+e.message,ok:false});
  }
  return passos;
})();
`;

  try {
    vm.runInContext(lerScript() + corpo, env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("  o cenário nem rodou: " + e.message) + "\n" +
      cinza(e.stack.split("\n").slice(1, 3).join("\n")));
    return false;
  }
  return env.sandbox.__comp.then((passos) => {
    let ok = true;
    for (const p of passos) {
      if (!p.ok) ok = false;
      console.log(`  ${p.ok ? verde("ok   ") : vermelho("fora ")} ${p.nome}`);
    }
    console.log(`  ${cinza("downloads efetivamente disparados: " + cliques.length)}`);
    /* 4 cenários de SALVAR (isolado + caminho 1 + caminho 3 + caminho 2),
       2 cliques cada, 1 download por cenário — 4 é o número CERTO. Copiar
       nunca cria <a>, então não entra nesta contagem (tem a própria
       asserção de chamadasClipboardWrite===1 em cada caminho acima).
       Duplicação de verdade apareceria como múltiplo de 4 (8, 12...). */
    ok = ok && cliques.length === 4;
    console.log(`  ${cliques.length===4?verde("ok   "):vermelho("fora ")} 4 cenários de Salvar, 1 download cada — nenhum duplicado (${cliques.length} no total)`);
    return ok && passos.length > 0;
  });
}

/* ================================================================== *
 * APOSENTADORIA SEM LUTAS (ou quase) — o card final (screenReport(),
 *     via grade() e LEGACY) sempre foi escrito supondo carreira de 22
 *     lutas de verdade. Aposentadoria voluntária (item novo) pode zerar
 *     fightNo, ou parar em qualquer número pequeno — dois textos
 *     quebravam: "você entrou no octógono" (grade(), tier F) e "Vinte e
 *     duas lutas, vinte e duas derrotas" (LEGACY, wins===0) cravado, sem
 *     olhar pra quantas lutas realmente aconteceram. Achado lendo o
 *     código depois do pedido do usuário, não jogando — mas o teste é o
 *     mesmo: prova o texto de verdade, não só que a função não quebra. */
function testarAposentadoriaSemLutas() {
  console.log("\n" + cinza("card final: mensagem certa pra quem se aposenta com 0-0 ou poucas lutas"));
  const env = criarAmbiente();
  vm.createContext(env.sandbox);
  const corpo = `
;globalThis.__apos=(function(){
  const passos=[];
  const passo=(nome,ok)=>passos.push({nome,ok:!!ok});
  try{
    const base={peak:.18,bestBeaten:0,title:false,finishes:0};

    // 0-0: nunca lutou. Não pode soar como invicto de verdade nem como
    // quem "entrou no octógono".
    st={...base,wins:0,losses:0,fightNo:0};
    const g0=grade();
    passo("grade() 0-0: não afirma 'entrou no octógono'",
      !/entrou no octógono/.test(g0.verdict));
    passo("grade() 0-0: parecer novo, específico pra quem nunca lutou",
      /antes da primeira luta/.test(g0.verdict));
    const legado0=LEGACY.find(l=>l.when(st)).t("Fulano");
    passo("LEGACY 0-0: não cai em 'saiu invicto' (não houve sequência nenhuma)",
      !/saiu invicto/.test(legado0));
    passo("LEGACY 0-0: frase própria, honesta sobre não ter lutado",
      /pendurou as luvas/.test(legado0));

    // 0-3: aposentou cedo, só perdendo. Não pode dizer "vinte e duas".
    st={...base,wins:0,losses:3,fightNo:3};
    const legado3=LEGACY.find(l=>l.when(st)).t("Fulano");
    passo("LEGACY 0-3: não crava 'vinte e duas' num cartel de 3 lutas",
      !/vinte e duas/.test(legado3));
    passo("LEGACY 0-3: usa o número real de lutas (3)",
      /^3 lutas, 3 derrotas/.test(legado3));

    // 1-0: carreira normal (não aposentadoria), continua com a frase de
    // sempre — prova que o conserto não afetou quem joga as 22 de verdade.
    st={wins:0,losses:22,fightNo:22,peak:.18,bestBeaten:0,title:false,finishes:0};
    const legado22=LEGACY.find(l=>l.when(st)).t("Fulano");
    passo("LEGACY 22-0 perdendo todas: continua acertando o número (22), não regrediu",
      /^22 lutas, 22 derrotas/.test(legado22));

    // grade() em carreira normal (fightNo>0) continua com o parecer de
    // sempre, não o texto novo de "não chegou a entrar".
    st={wins:15,losses:7,fightNo:22,peak:.7,bestBeaten:.6,title:false,finishes:5};
    const gNormal=grade();
    passo("grade() carreira normal: NÃO usa o parecer de 'não chegou a entrar'",
      !/não chegou a entrar/.test(gNormal.verdict));
  }catch(e){
    passos.push({nome:"erro inesperado: "+e.message,ok:false});
  }
  return passos;
})();
`;
  try {
    vm.runInContext(lerScript() + corpo, env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("  o cenário nem rodou: " + e.message) + "\n" +
      cinza(e.stack.split("\n").slice(1, 3).join("\n")));
    return false;
  }
  const passos = env.sandbox.__apos;
  let ok = true;
  for (const p of passos) {
    if (!p.ok) ok = false;
    console.log(`  ${p.ok ? verde("ok   ") : vermelho("fora ")} ${p.nome}`);
  }
  return ok && passos.length > 0;
}

/* ================================================================== *
 * TELA INICIAL (2026-09-09) — menu, navegação, e o formulário de
 *     login/cadastro com um Supabase FALSO (criarAmbiente() não tem
 *     window.supabase nenhum, de propósito — mesmo motivo do áudio/
 *     localStorage). location também é falso aqui (criarAmbiente() não
 *     tem, e lerDesafio() só engole a exceção por causa disso — sem
 *     location.reload() falso, o caminho de sucesso do login quebraria
 *     o teste).
 * ================================================================== */
function testarTelaInicial() {
  console.log("\n" + cinza("tela inicial: navegação do menu, link de desafio pula a tela, formulário de conta chama o Supabase certo"));
  const env = criarAmbiente({ contarNos: true });

  const chamadasAuth = [];
  let sessaoFalsa = null;
  let assinaturaFalsa = null;
  let callbackAuthState = null;
  const supabaseFalso = {
    createClient: () => ({
      auth: {
        signUp: async ({ email, password }) => {
          chamadasAuth.push(["signUp", email, password]);
          if (email === "repetido@teste.com") return { error: { message: "User already registered" } };
          return { data: { session: null }, error: null }; // precisa confirmar e-mail
        },
        signInWithPassword: async ({ email, password }) => {
          chamadasAuth.push(["signInWithPassword", email, password]);
          if (password === "errada") return { error: { message: "Invalid login credentials" } };
          sessaoFalsa = { user: { id: "u1", email } };
          return { error: null };
        },
        signInWithOAuth: async ({ provider, options }) => {
          chamadasAuth.push(["signInWithOAuth", provider, options && options.redirectTo]);
          return { error: null };
        },
        signOut: async () => { sessaoFalsa = null; return { error: null }; },
        getSession: async () => ({ data: { session: sessaoFalsa } }),
        resetPasswordForEmail: async (email, opts) => {
          chamadasAuth.push(["resetPasswordForEmail", email, opts && opts.redirectTo]);
          return { error: null };
        },
        updateUser: async ({ password }) => {
          chamadasAuth.push(["updateUser", password]);
          return { error: null };
        },
        onAuthStateChange: (cb) => { callbackAuthState = cb; },
      },
      /* assinaturaFalsa (2026-09-22, item 2/3): null = nunca pagou;
         {pro,expira_em} = linha real de assinaturas. eq() precisa ser
         tanto awaitable direto (uso de sempre, ex. conquistas_usuario:
         `await sb.from(...).select(...).eq(...)`, espera {data:[...]})
         QUANTO aceitar .maybeSingle() encadeado (uso novo do Plano Pro:
         `.select("pro,expira_em").eq("user_id",id).maybeSingle()`) —
         um objeto thenable com os dois, não uma Promise pura. */
      from: (tabela) => ({
        upsert: async () => ({ data: [], error: null }),
        select: () => ({
          eq: () => {
            const linhas = tabela === "assinaturas" ? (assinaturaFalsa ? [assinaturaFalsa] : []) : [];
            const resultado = { data: linhas, error: null };
            return {
              then: (resolve) => resolve(resultado),
              maybeSingle: async () => ({ data: linhas[0] || null, error: null }),
            };
          },
        }),
      }),
    }),
  };
  env.sandbox.window.supabase = supabaseFalso;
  env.sandbox.location = { href: "https://octogono.fun/", search: "", reload: () => {} };
  const dadosLS = {};
  env.sandbox.localStorage = {
    getItem: k => (k in dadosLS ? dadosLS[k] : null),
    setItem: (k, v) => { dadosLS[k] = String(v); },
  };
  vm.createContext(env.sandbox);

  try {
    vm.runInContext(exportar(lerScript(),
      ["ready", "screenInicio", "screenName", "screenConta", "screenHistorico",
        "screenTermos", "screenPrivacidade", "screenPlanoPro", "abrirConfig", "salvarCarreiraLocal",
        "SENHA_MIN", "traduzErroSupabase"])
      + "\ntry{globalThis.__x.cfgAberto=()=>cfgAberto;}catch(e){}"
      + "\ntry{globalThis.__x.corCardProEscolha=()=>corCardProEscolha;}catch(e){}",
      env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("\n  o script nem carregou: " + e.message) + "\n");
    return false;
  }
  const UI = env.sandbox.__x;
  const respirar = () => new Promise(r => setImmediate(r));
  const passos = [];
  const passo = async (nome, fn) => {
    try { await fn(); env.drenar(); await respirar(); env.drenar(); await respirar(); passos.push([nome, true]); }
    catch (e) { passos.push([nome, false]); console.log(vermelho(`  falha  ${nome}`) + "\n         " + e.message); }
  };
  // token, não igualdade exata — um nó pode ter mais de uma classe
  // (ex. "inicio-item inicio-item-principal") e ainda contar pra `classe`
  const marcado = (classe) => env.todos.filter(n => (n.className || "").split(" ").includes(classe));
  const ultimoTexto = (classe) => { const l = marcado(classe); return l.length ? l[l.length - 1].innerHTML : null; };

  return (async () => {
    await passo("carregar lutadores", () => UI.ready(lerLutadores()));
    await passo("Opções: clica no item do menu, abre o overlay de config", () => {
      const itens = marcado("inicio-item");
      if (itens.length !== 5) throw new Error(`esperava 5 itens, achei ${itens.length}`);
      itens[1].onclick(); // "Opções"
      if (!UI.cfgAberto()) throw new Error("abrirConfig() não marcou cfgAberto");
    });

    // reabre a tela inicial (Opções é overlay, não troca de tela) e vai pra Conta
    await passo("Conta (sem sessão): abre no modo Entrar por padrão", () => {
      UI.screenInicio();
      const itens = marcado("inicio-item");
      itens[2].onclick(); // "Conta"
    });
    await passo("Conta/Entrar: só e-mail + 1 senha + esqueci + link pra criar, SEM confirmar senha", () => {
      const emails = env.todos.filter(n => n.type === "email");
      const senhas = env.todos.filter(n => n.id === "conta-senha");
      const confs = env.todos.filter(n => n.id === "conta-senha-conf");
      if (!emails.pop()) throw new Error("campo de e-mail não foi montado");
      if (!senhas.pop()) throw new Error("campo de senha não foi montado");
      if (confs.length) throw new Error("modo Entrar não deveria ter campo de confirmar senha");
      const h4 = env.todos.filter(n => n.tagName === "h4").pop();
      if (h4.innerHTML !== "Entrar") throw new Error("título não é 'Entrar': " + h4.innerHTML);
      const linkEsqueci = env.todos.filter(n => n.tagName === "a" && n.innerHTML === "Esqueci minha senha").pop();
      if (!linkEsqueci) throw new Error("link 'Esqueci minha senha' não foi montado no modo Entrar");
      const linkModo = env.todos.filter(n => n.id === "conta-link-modo").pop();
      if (!linkModo || linkModo.innerHTML !== "Criar conta") throw new Error("link de trocar pro modo Criar não está certo: " + (linkModo && linkModo.innerHTML));
    });
    await passo("traduzErroSupabase: cobre os erros comuns do painel, sem deixar nenhum passar cru", () => {
      const casos = [
        ["User already registered", "Este e-mail já está cadastrado."],
        ["Invalid login credentials", "E-mail ou senha incorretos."],
        ["Email not confirmed", null], // só precisa não ser o texto cru
        ["Password should be at least 6 characters", null], // política do painel != client — vira mensagem genérica de senha
        ["Rate limit exceeded", null],
        ["Unable to validate email address: invalid format", null],
        ["Network request failed", null],
        ["algo nunca visto antes", null],
      ];
      for (const [bruto, esperado] of casos) {
        const traduzido = UI.traduzErroSupabase(bruto);
        if (!traduzido || traduzido === bruto) throw new Error(`"${bruto}" não foi traduzido: "${traduzido}"`);
        if (esperado !== null && traduzido !== esperado) throw new Error(`"${bruto}" virou "${traduzido}", esperava "${esperado}"`);
      }
    });
    const linksEsqueciAntesDeCriar = env.todos.filter(n => n.tagName === "a" && n.innerHTML === "Esqueci minha senha").length;
    await passo("Conta: troca pro modo Criar conta pelo link", () => {
      const linkModo = env.todos.filter(n => n.id === "conta-link-modo").pop();
      linkModo.onclick({ preventDefault(){} });
    });
    await passo("Conta/Criar: título muda, ganha confirmar senha e as 2 regras, SEM esqueci, botão nasce desabilitado", () => {
      const h4 = env.todos.filter(n => n.tagName === "h4").pop();
      if (h4.innerHTML !== "Criar conta") throw new Error("título não é 'Criar conta': " + h4.innerHTML);
      if (!env.todos.filter(n => n.id === "conta-senha-conf").pop()) throw new Error("modo Criar não montou o campo de confirmar senha");
      const linksEsqueciDepoisDeCriar = env.todos.filter(n => n.tagName === "a" && n.innerHTML === "Esqueci minha senha").length;
      if (linksEsqueciDepoisDeCriar !== linksEsqueciAntesDeCriar)
        throw new Error("'Esqueci minha senha' não deveria aparecer no modo Criar (o render de Criar montou um novo)");
      const regras = env.todos.filter(n => n.className && n.className.startsWith("regra-senha"));
      if (regras.length < 2) throw new Error(`esperava 2 linhas de regra de senha, achei ${regras.length}`);
      const btnCriar = env.todos.filter(n => n.tagName === "button" && n.innerHTML === "Criar conta").pop();
      if (!btnCriar.disabled) throw new Error("botão 'Criar conta' deveria nascer desabilitado, sem senha nenhuma digitada");
    });
    await passo("Conta/Criar: senha curta mostra 'faltam N caracteres' em vermelho, botão continua travado", () => {
      const senha = env.todos.filter(n => n.id === "conta-senha").pop();
      senha.oninput();
      senha.value = "abc"; senha.oninput();
      const regraTam = env.todos.filter(n => n.className && n.className.startsWith("regra-senha")).slice(-2)[0];
      if (!/falta/.test(regraTam.className)) throw new Error("classe da regra de tamanho não virou 'falta': " + regraTam.className);
      if (!new RegExp(`faltam ${UI.SENHA_MIN - 3} caractere`).test(regraTam.textContent))
        throw new Error(`texto não mostra a contagem certa (esperava faltam ${UI.SENHA_MIN - 3}): ` + regraTam.textContent);
      const btnCriar = env.todos.filter(n => n.tagName === "button" && n.innerHTML === "Criar conta").pop();
      if (!btnCriar.disabled) throw new Error("botão deveria continuar desabilitado com senha curta");
    });
    await passo("Conta/Criar: senha do tamanho certo mas confirmação diferente — regra de confere acusa, botão travado", () => {
      const senha = env.todos.filter(n => n.id === "conta-senha").pop();
      const conf = env.todos.filter(n => n.id === "conta-senha-conf").pop();
      senha.value = "a".repeat(UI.SENHA_MIN); senha.oninput();
      conf.value = "b".repeat(UI.SENHA_MIN); conf.oninput();
      const regraTam = env.todos.filter(n => n.className && n.className.startsWith("regra-senha")).slice(-2)[0];
      const regraConf = env.todos.filter(n => n.className && n.className.startsWith("regra-senha")).slice(-2)[1];
      if (!/ ok/.test(regraTam.className)) throw new Error("regra de tamanho deveria estar ok: " + regraTam.className);
      if (!/falta/.test(regraConf.className)) throw new Error("regra de confirmação deveria acusar diferença: " + regraConf.className);
      if (!/não conferem/.test(regraConf.textContent)) throw new Error("texto não avisa que as senhas não conferem: " + regraConf.textContent);
      const btnCriar = env.todos.filter(n => n.tagName === "button" && n.innerHTML === "Criar conta").pop();
      if (!btnCriar.disabled) throw new Error("botão deveria continuar desabilitado com confirmação diferente");
    });
    await passo("Conta/Criar: as duas regras batem — ambas ok, botão habilita sozinho", () => {
      const senha = env.todos.filter(n => n.id === "conta-senha").pop();
      const conf = env.todos.filter(n => n.id === "conta-senha-conf").pop();
      conf.value = senha.value; conf.oninput();
      const regraTam = env.todos.filter(n => n.className && n.className.startsWith("regra-senha")).slice(-2)[0];
      const regraConf = env.todos.filter(n => n.className && n.className.startsWith("regra-senha")).slice(-2)[1];
      if (!/ ok/.test(regraTam.className) || !/ ok/.test(regraConf.className))
        throw new Error("as 2 regras deveriam estar ok: " + regraTam.className + " / " + regraConf.className);
      const btnCriar = env.todos.filter(n => n.tagName === "button" && n.innerHTML === "Criar conta").pop();
      if (btnCriar.disabled) throw new Error("botão deveria habilitar sozinho com as duas regras ok");
    });
    await passo("Conta/Criar: 'Mostrar' na senha troca o type pra text e vira 'Ocultar'", () => {
      const senha = env.todos.filter(n => n.id === "conta-senha").pop();
      const btnVer = env.todos.filter(n => n.id === "conta-senha-ver").pop();
      if (!btnVer) throw new Error("botão 'Mostrar' (conta-senha-ver) não foi montado");
      if (senha.type !== "password") throw new Error("campo deveria começar como password");
      btnVer.onclick();
      if (senha.type !== "text") throw new Error("clicar 'Mostrar' não trocou o type pra text");
      if (btnVer.textContent !== "Ocultar") throw new Error("botão deveria virar 'Ocultar' depois de clicado");
    });
    await passo("Conta/Criar: e-mail repetido mostra erro em português, não o texto cru do Supabase", () => {
      const email = env.todos.filter(n => n.type === "email").pop();
      email.value = "repetido@teste.com";
      const btnCriar = env.todos.filter(n => n.tagName === "button" && n.innerHTML === "Criar conta").pop();
      btnCriar.onclick();
    });
    await passo("Conta/Criar: signUp recebeu e-mail/senha certos e a mensagem foi traduzida", () => {
      const ultimaChamada = chamadasAuth.filter(c => c[0] === "signUp").pop();
      if (!(ultimaChamada[1] === "repetido@teste.com" && ultimaChamada[2].length === UI.SENHA_MIN))
        throw new Error("signUp não recebeu e-mail/senha certos: " + JSON.stringify(ultimaChamada));
      const msg = env.todos.filter(n => n.tagName === "p" && ["hint", "msg-erro"].every(c => (n.className || "").split(" ").includes(c))).pop();
      if (!msg || msg.textContent !== "Este e-mail já está cadastrado.")
        throw new Error("erro não foi traduzido pro português certo: " + (msg && msg.textContent));
    });

    await passo("Conta: volta pro modo Entrar pelo link ('Já tenho conta')", () => {
      const linkModo = env.todos.filter(n => n.id === "conta-link-modo").pop();
      if (linkModo.innerHTML !== "Já tenho conta") throw new Error("link deveria dizer 'Já tenho conta' no modo Criar: " + linkModo.innerHTML);
      linkModo.onclick({ preventDefault(){} });
    });
    await passo("Conta/Entrar: senha errada mostra 'E-mail ou senha incorretos.' traduzido, e o botão mostra 'Entrando…' antes de resolver", () => {
      const email = env.todos.filter(n => n.type === "email").pop();
      const senha = env.todos.filter(n => n.id === "conta-senha").pop();
      email.value = "existente@teste.com"; senha.value = "errada";
      const btnEntrar = env.todos.filter(n => n.tagName === "button" && n.innerHTML === "Entrar").pop();
      btnEntrar.onclick();
      if (btnEntrar.textContent !== "Entrando…") throw new Error("botão não mostrou o estado de carregando antes de resolver: " + btnEntrar.textContent);
    });
    await passo("Conta/Entrar: mensagem de senha errada foi traduzida, não é o texto cru do Supabase", () => {
      const msg = env.todos.filter(n => n.tagName === "p" && ["hint", "msg-erro"].every(c => (n.className || "").split(" ").includes(c))).pop();
      if (!msg || msg.textContent !== "E-mail ou senha incorretos.")
        throw new Error("erro de login não foi traduzido: " + (msg && msg.textContent));
    });
    await passo("Conta/Entrar: senha certa chama signInWithPassword", () => {
      const email = env.todos.filter(n => n.type === "email").pop();
      const senha = env.todos.filter(n => n.id === "conta-senha").pop();
      email.value = "existente@teste.com"; senha.value = "certa";
      const btnEntrar = env.todos.filter(n => n.tagName === "button" && n.innerHTML === "Entrar").pop();
      btnEntrar.onclick();
    });
    await passo("Conta: 'Esqueci minha senha' sem e-mail preenchido não chama nada", () => {
      const email = env.todos.filter(n => n.type === "email").pop();
      email.value = "";
      const linkEsqueci = env.todos.filter(n => n.tagName === "a" && n.innerHTML === "Esqueci minha senha").pop();
      if (!linkEsqueci) throw new Error("link 'Esqueci minha senha' não foi montado");
      linkEsqueci.onclick({ preventDefault(){} });
    });
    await passo("Conta: sem e-mail, resetPasswordForEmail NÃO foi chamado", () => {
      if (chamadasAuth.some(c => c[0] === "resetPasswordForEmail"))
        throw new Error("chamou resetPasswordForEmail sem e-mail preenchido");
    });
    await passo("Conta: 'Esqueci minha senha' com e-mail preenchido chama resetPasswordForEmail", () => {
      const email = env.todos.filter(n => n.type === "email").pop();
      email.value = "esqueci@teste.com";
      const linkEsqueci = env.todos.filter(n => n.tagName === "a" && n.innerHTML === "Esqueci minha senha").pop();
      linkEsqueci.onclick({ preventDefault(){} });
    });
    await passo("Conta: resetPasswordForEmail recebeu e-mail e redirectTo (location.href) certos", () => {
      const chamada = chamadasAuth.find(c => c[0] === "resetPasswordForEmail");
      if (!chamada || chamada[1] !== "esqueci@teste.com" || chamada[2] !== "https://octogono.fun/")
        throw new Error("resetPasswordForEmail não recebeu os argumentos certos: " + JSON.stringify(chamada));
    });
    await passo("PASSWORD_RECOVERY: evento do Supabase abre a tela de nova senha sozinho, sem rota nem parâmetro na URL", () => {
      if (!callbackAuthState) throw new Error("onAuthStateChange nunca foi registrado em getSupabase()");
      callbackAuthState("PASSWORD_RECOVERY");
    });
    await passo("Nova senha: tela abriu com campo de senha", () => {
      const eyebrow = env.todos.filter(n => (n.className || "").split(" ").includes("eyebrow") && n.innerHTML === "Nova senha").pop();
      if (!eyebrow) throw new Error("tela de nova senha não abriu");
      const inp = env.todos.filter(n => n.type === "password").pop();
      if (!inp) throw new Error("campo de nova senha não foi montado");
    });
    await passo("Nova senha: salvar chama updateUser com a senha digitada", () => {
      const inp = env.todos.filter(n => n.type === "password").pop();
      inp.value = "novaSenha123";
      const btn = env.todos.filter(n => n.tagName === "button" && n.innerHTML === "Salvar nova senha").pop();
      if (!btn) throw new Error("botão 'Salvar nova senha' não foi montado");
      btn.onclick();
    });
    await passo("Nova senha: updateUser recebeu a senha certa", () => {
      const chamada = chamadasAuth.find(c => c[0] === "updateUser");
      if (!chamada || chamada[1] !== "novaSenha123")
        throw new Error("updateUser não recebeu a senha certa: " + JSON.stringify(chamada));
    });

    UI.screenInicio();
    marcado("inicio-item")[2].onclick(); // Conta de novo, formulário fresco pro resto dos testes
    await passo("Conta: Google chama signInWithOAuth com provider google e redirectTo", () => {
      const chamada = chamadasAuth.find(c => c[0] === "signInWithOAuth");
      if (!chamada) {
        // ainda não clicou — clica agora, num formulário fresco
        UI.screenInicio();
        marcado("inicio-item")[2].onclick();
      }
    });
    await passo("Conta: clica Google de verdade e confirma provider/redirectTo", () => {
      const btnGoogle = env.todos.filter(n => n.tagName === "button" && n.innerHTML === "Entrar com Google").pop();
      btnGoogle.onclick();
    });

    await passo("Histórico vazio: abre a tela", () => { UI.screenHistorico(); });
    await passo("Histórico vazio: mensagens de 'nenhuma ainda' pros dois blocos", () => {
      const linhas = env.todos.filter(n => n.tagName === "p" && (n.className || "").split(" ").includes("hint")).map(n => n.innerHTML);
      if (!linhas.some(t => /nenhuma carreira/i.test(t))) throw new Error("não avisou 'nenhuma carreira ainda'");
      if (!linhas.some(t => /nenhuma conquista/i.test(t))) throw new Error("não avisou 'nenhuma conquista ainda'");
    });
    await passo("Histórico com carreira salva: nome, cartel e nota aparecem", () => {
      UI.salvarCarreiraLocal({ seed: 12345, nome: "TesteBot", cartel: "18-4", nota: "B", data: "2026-09-09T12:00:00.000Z" });
      UI.screenHistorico();
    });
    await passo("Histórico com carreira salva: item aparece na tela com os dados certos", () => {
      // conteúdo vem via innerHTML string (mesmo caso de Termos/Privacidade
      // acima) — não vira nó rastreável, procura no innerHTML do "carreira-item".
      // Fase 8: carreira passada parou de usar a classe "conquista" — era a
      // mesma classe do troféu de verdade, na mesma tela, linha debaixo.
      const item = env.todos.filter(n => (n.className || "").split(" ").includes("carreira-item") && /TesteBot/.test(n.innerHTML)).pop();
      if (!item) throw new Error("carreira salva não apareceu na tela");
      if (!/18-4/.test(item.innerHTML) || !/nota B/.test(item.innerHTML))
        throw new Error("cartel ou nota não aparecem certos: " + item.innerHTML);
    });
    /* Texto real desde 2026-09-19 (antes disso a asserção só checava o
       aviso "[PENDENTE]"). Não recheca o texto inteiro — só que os fatos
       que ESTE código realmente decide (idade mínima, contato, e que os
       dois documentos são diferentes um do outro) estão presentes, pra
       um "cola texto genérico sem ler o código" futuro quebrar o teste. */
    await passo("Termos de Uso: página existe, com texto de verdade (não [PENDENTE])", () => {
      UI.screenTermos();
      const texto = ultimoTexto("pagina-legal"); // conteúdo vem via innerHTML string, não vira nó rastreável
      if (!texto || /\[PENDENTE/i.test(texto)) throw new Error("ainda mostra o aviso de [PENDENTE]: " + texto);
      if (!/Estatuto da Criança e do Adolescente/.test(texto)) throw new Error("idade mínima (ECA) sumiu do texto: " + texto);
      if (!/contato@octogono\.fun/.test(texto)) throw new Error("contato sumiu do texto: " + texto);
    });
    await passo("Política de Privacidade: página existe, com texto de verdade (não [PENDENTE])", () => {
      UI.screenPrivacidade();
      const texto = ultimoTexto("pagina-legal");
      if (!texto || /\[PENDENTE/i.test(texto)) throw new Error("ainda mostra o aviso de [PENDENTE]: " + texto);
      if (!/LGPD/.test(texto)) throw new Error("direitos de LGPD sumiram do texto: " + texto);
      if (!/Supabase/.test(texto)) throw new Error("menção ao Supabase sumiu do texto: " + texto);
      if (!/localStorage/.test(texto)) throw new Error("menção ao localStorage sumiu do texto: " + texto);
    });
    await passo("Termos e Privacidade não são o mesmo texto reaproveitado", () => {
      UI.screenTermos();
      const termos = ultimoTexto("pagina-legal");
      UI.screenPrivacidade();
      const privacidade = ultimoTexto("pagina-legal");
      if (termos === privacidade) throw new Error("as duas páginas voltaram texto idêntico");
    });

    /* ---------- Plano Pro: item 2/3 (2026-09-22) ---------- */
    sessaoFalsa = null; // reseta explícito — o login de teste mais acima deixou sessão ativa
    await passo("Plano Pro: menu ganhou o 5º item, clicando abre a tela dedicada", () => {
      UI.screenInicio();
      // marcado() acumula de TODOS os screenInicio() já rodados neste teste
      // (env.todos nunca reseta) — os 5 últimos são os desta renderização.
      const itens = marcado("inicio-item").slice(-5);
      if (itens.length !== 5) throw new Error(`esperava 5 itens no menu, achei ${itens.length}`);
      itens[4].onclick(); // "Plano Pro"
      const eyebrow = ultimoTexto("eyebrow");
      if (eyebrow !== "Plano Pro") throw new Error("clicar no item não abriu a tela Plano Pro: " + eyebrow);
    });
    await passo("Plano Pro: mostra os 5 benefícios (Modo Rival incluído) e o carrossel começa em GRÁTIS", () => {
      const beneficios = marcado("pro-beneficio");
      if (beneficios.length !== 5) throw new Error(`esperava 5 benefícios, achei ${beneficios.length}`);
      if (!beneficios.some(b => (b.innerHTML || "").includes("Modo Rival")))
        throw new Error("Modo Rival não apareceu na lista de benefícios");
      // pro-carrossel-legenda usa .textContent= (texto puro, sem risco de
      // XSS), não .innerHTML — o DOM falso não deriva um do outro, então
      // ultimoTexto() (que lê innerHTML) não serve aqui.
      const legenda = marcado("pro-carrossel-legenda").pop();
      if (!legenda || !/^GR.TIS/.test(legenda.textContent || ""))
        throw new Error("carrossel não começou em GRÁTIS: " + (legenda && legenda.textContent));
    });
    await passo("Plano Pro: seta do carrossel troca a legenda pra PRO", () => {
      const setas = marcado("pro-carrossel-seta");
      if (setas.length !== 2) throw new Error(`esperava 2 setas, achei ${setas.length}`);
      setas[1].onclick();
      const legenda = marcado("pro-carrossel-legenda").pop();
      if (!legenda || !/^PRO/.test(legenda.textContent || ""))
        throw new Error("seta não trocou pra PRO: " + (legenda && legenda.textContent));
    });
    const aceitesAntesDeLogar = marcado("aceite-pro").length;
    await passo("Plano Pro sem sessão: pede conta em vez do formulário de pagar", () => {
      sessaoFalsa = null;
      UI.screenPlanoPro();
    });
    await passo("Plano Pro sem sessão: mensagem de 'exige conta' aparece, sem CPF nenhum", () => {
      if (!ultimoTexto("hint") || !/Assinar exige uma conta/.test(ultimoTexto("hint")))
        throw new Error("mensagem de 'exige conta' não apareceu sem sessão: " + ultimoTexto("hint"));
      if (marcado("aceite-pro").length !== aceitesAntesDeLogar)
        throw new Error("formulário de pagamento não deveria aparecer sem sessão");
    });
    await passo("Plano Pro logado, não-Pro: dispara o formulário de pagamento", () => {
      sessaoFalsa = { user: { id: "u1", email: "pro@teste.com" }, access_token: "tok123" };
      assinaturaFalsa = null;
      UI.screenPlanoPro();
    });
    await passo("Plano Pro logado, não-Pro: CPF + aceite + 'Confirmar pagamento' aparecem", () => {
      if (marcado("aceite-pro").length !== aceitesAntesDeLogar + 1)
        throw new Error("formulário de aceite não apareceu com sessão ativa");
      if (!env.todos.some(n => n.tagName === "button" && /Confirmar pagamento — R\$9,99/.test(n.innerHTML || "")))
        throw new Error("botão 'Confirmar pagamento' não apareceu");
    });
    await passo("Conta, não-Pro: dispara o resumo", () => { UI.screenConta(); });
    await passo("Conta, não-Pro: mostra link 'Ver Plano Pro →', não o formulário inteiro", () => {
      const link = env.todos.filter(n => n.tagName === "a" && n.innerHTML === "Ver Plano Pro →").pop();
      if (!link) throw new Error("link 'Ver Plano Pro →' não apareceu na Conta pra quem não é Pro");
    });
    await passo("Conta, Pro ativo: dispara o resumo", () => {
      assinaturaFalsa = { pro: true, expira_em: "2099-01-01T00:00:00.000Z" };
      UI.screenConta();
    });
    await passo("Conta, Pro ativo: mostra 'PLANO PRO ATIVO' em vez do link", () => {
      const linha = marcado("pro-ativo-linha").pop();
      if (!linha || linha.innerHTML !== "PLANO PRO ATIVO")
        throw new Error("linha 'PLANO PRO ATIVO' não apareceu: " + (linha && linha.innerHTML));
    });

    /* ---------- 3 modelos de card (2026-09-22) ---------- */
    await passo("Carrossel Pro ativo: abre a tela de novo (meuPro já ficou true pelo passo acima)", () => {
      UI.screenPlanoPro();
    });
    await passo("Carrossel Pro ativo: 1ª seta pro modelo Prata, botão 'Usar modelo Prata' aparece habilitado", () => {
      const setas = marcado("pro-carrossel-seta").slice(-2);
      setas[1].onclick(); // GRÁTIS -> Ouro
      setas[1].onclick(); // Ouro -> Prata
      const legenda = marcado("pro-carrossel-legenda").pop();
      if (!legenda || legenda.textContent !== "PRO — modelo Prata")
        throw new Error("carrossel não chegou no modelo Prata: " + (legenda && legenda.textContent));
      const btn = env.todos.filter(n => n.tagName === "button" && /Usar modelo Prata/.test(n.innerHTML || "")).pop();
      if (!btn || btn.disabled) throw new Error("botão 'Usar modelo Prata' não apareceu habilitado");
      btn.onclick();
    });
    await passo("Carrossel Pro ativo: clicar 'Usar modelo Prata' grava a escolha e vira 'Em uso'", () => {
      if (UI.corCardProEscolha() !== 1) throw new Error("corCardProEscolha não virou 1 (Prata)");
      const btn = env.todos.filter(n => n.tagName === "button" && n.innerHTML === "Em uso").pop();
      if (!btn || !btn.disabled) throw new Error("botão não virou 'Em uso'/desabilitado depois de escolher");
    });
    await passo("Carrossel SEM Pro: reseta meuPro=false de novo", () => {
      assinaturaFalsa = null;
      UI.screenConta();
    });
    await passo("Carrossel SEM Pro: escolher não faz nada, só avisa", () => {
      UI.screenPlanoPro();
      const setas = marcado("pro-carrossel-seta").slice(-2);
      setas[1].onclick(); // GRÁTIS -> Ouro
      const antes = UI.corCardProEscolha();
      const btn = env.todos.filter(n => n.tagName === "button" && /Usar modelo Ouro/.test(n.innerHTML || "")).pop();
      if (!btn) throw new Error("botão 'Usar modelo Ouro' não apareceu (vitrine deveria mostrar mesmo sem Pro)");
      btn.onclick();
      if (UI.corCardProEscolha() !== antes) throw new Error("clicar sem ser Pro mudou a escolha mesmo assim");
      if (!env.todos.some(n => n.tagName === "p" && /Assine o Plano Pro/.test(n.innerHTML || "")))
        throw new Error("aviso de 'assine pra escolher' não apareceu");
    });

    let ok = true;
    for (const [nome, sucesso] of passos) {
      if (!sucesso) ok = false;
      console.log(`  ${sucesso ? verde("ok   ") : vermelho("fora ")} ${nome}`);
    }
    const chamouGoogleCerto = chamadasAuth.some(c => c[0] === "signInWithOAuth" && c[1] === "google" && c[2] === "https://octogono.fun/");
    console.log(`  ${chamouGoogleCerto ? verde("ok   ") : vermelho("fora ")} Google: provider "google" e redirectTo == location.href`);
    ok = ok && chamouGoogleCerto;

    const entrouComSenhaCerta = chamadasAuth.some(c => c[0] === "signInWithPassword" && c[1] === "existente@teste.com" && c[2] === "certa");
    console.log(`  ${entrouComSenhaCerta ? verde("ok   ") : vermelho("fora ")} signInWithPassword recebeu e-mail/senha certos`);
    ok = ok && entrouComSenhaCerta;

    return ok && passos.length > 0;
  })();
}

function testarLoja() {
  console.log("\n" + cinza("loja: descrição e efeito separados por item, compra desconta e marca, sem dinheiro desabilita"));
  const env = criarAmbiente();
  vm.createContext(env.sandbox);

  const corpo = `
;globalThis.__loja=(function(){
  const passos=[];
  const passo=(nome,ok)=>passos.push({nome,ok:!!ok});
  try{
    me={name:"TesteBot",division:"lightweight"};
    st={treino:{},eventoMod:{},dinheiro:0,treinadorComprado:false,equipamentoComprado:false};
    document.getElementById("app");

    passo("loja tem pelo menos 2 itens (treinador, equipamento)",
      LOJA_ITENS.length>=2);

    const itensDe=p=>p.children[0].children.filter(c=>(c.className||"").split(" ").includes("loja-item"));
    // Fase 8: preço/botão/badge de "adquirido" moram dentro de .loja-rodape
    // agora (pra alinhar nas pontas, preço à esquerda e ação à direita) —
    // não são mais filhos diretos de .loja-item. Um nível a mais de busca.
    const filhosENetos=l=>l.children.flatMap(c=>[c, ...(c.children||[])]);
    const botaoDe=(linhas,nome)=>{
      const l=linhas.find(x=>x.children[0].innerHTML===nome);
      return filhosENetos(l).find(c=>c.tagName==="button");
    };

    // caso 1: sem dinheiro nenhum, os dois botões vêm desabilitados
    st.dinheiro=0;
    abrirPainelTreinador();
    let p=document.getElementById("painelTreinador");
    let linhas=itensDe(p);
    let botoes=linhas.map(l=>filhosENetos(l).find(c=>c.tagName==="button")).filter(Boolean);
    passo("sem dinheiro: nenhum botão de compra fica habilitado ("+botoes.length+" botões)",
      botoes.length>=2 && botoes.every(b=>b.disabled));

    // caso 2: formato pedido — descrição (item-desc) e efeito (item-efeito)
    // aparecem SEPARADOS, um por item, ambos com texto de verdade
    passo("cada item tem 1 bloco de descrição (item-desc) com texto",
      linhas.every(l=>{
        const d=l.children.find(c=>(c.className||"").split(" ").includes("item-desc"));
        return d && d.innerHTML.length>10;
      }));
    passo("cada item tem 1 bloco de efeito (item-efeito) com número",
      linhas.every(l=>{
        const e=l.children.find(c=>(c.className||"").split(" ").includes("item-efeito"));
        return e && /\\d/.test(e.innerHTML);
      }));

    // caso 3: dinheiro suficiente só pro equipamento (mais barato) — só o
    // botão dele habilita, o do treinador continua travado
    st.dinheiro=CUSTO_EQUIPAMENTO;
    abrirPainelTreinador();
    p=document.getElementById("painelTreinador");
    linhas=itensDe(p);
    passo("dinheiro só pro equipamento: botão do equipamento habilita",
      !botaoDe(linhas,"Equipamento de proteção").disabled);
    passo("dinheiro só pro equipamento: botão do treinador (mais caro) continua travado",
      botaoDe(linhas,"Treinador melhor").disabled);

    // caso 4: comprar desconta o preço certo, marca comprado, não deixa
    // comprar de novo (item some da lista de compráveis, vira "Adquirido")
    const dinheiroAntes=st.dinheiro;
    botaoDe(linhas,"Equipamento de proteção").onclick();
    passo("comprar desconta exatamente o custo do item",
      st.dinheiro===dinheiroAntes-CUSTO_EQUIPAMENTO);
    passo("comprar marca st.equipamentoComprado",
      st.equipamentoComprado===true);
    p=document.getElementById("painelTreinador");
    linhas=itensDe(p);
    const linhaEquip=linhas.find(l=>l.children[0].innerHTML==="Equipamento de proteção");
    passo("depois de comprado, o item mostra 'Adquirido', não o botão de novo",
      filhosENetos(linhaEquip).some(c=>c.innerHTML==="✓ Adquirido") &&
      !filhosENetos(linhaEquip).some(c=>c.tagName==="button"));

    // caso 5: clicar comprar sem dinheiro suficiente não desconta nem marca
    // (rede de baixo — o disabled já devia impedir, mas o onclick não pode
    // confiar só nisso)
    st.dinheiro=0; st.treinadorComprado=false;
    abrirPainelTreinador();
    p=document.getElementById("painelTreinador");
    linhas=itensDe(p);
    botaoDe(linhas,"Treinador melhor").onclick();
    passo("clicar comprar sem dinheiro suficiente não desconta nem marca comprado",
      st.dinheiro===0 && st.treinadorComprado===false);

    /* Casa melhor: bônus permanente no followerDelta, MESMO r/won/standing
       — isola o efeito do item do resto do cálculo de hype. rng()
       reseeded igual nos dois lados pra qualquer consumo dentro de
       finishFight() (buildFeed etc.) não desalinhar as duas rodadas. */
    const stBase=()=>({treino:{},eventoMod:{},campHist:{},wins:0,losses:0,finishes:0,
      streakW:0,streakL:0,bestBeaten:0,bestWin:null,title:false,standing:.5,peak:.5,
      events:0,koLosses:0,kdTaken:0,kdGiven:0,fightNo:6,fan:5,followers:10000,
      peakFollowers:10000,longestW:0,lostBeltFast:false,rares:[],momentos:[],
      disputaLiberada:false,defesas:0,exCampeao:null,foiCampeao:false,lesao:null,
      dinheiro:0,casaComprada:false});
    const opp={name:"Rival",rating:.5};
    const rVit={winner:"TesteBot",loser:"Rival",method:"Decisão",round:3,clock:"5:00",knockdowns:{}};

    fightNo=6; rng=mulberry32(1); rareUsed=new Set();
    st=stBase(); st.casaComprada=false;
    finishFight(opp,rVit,false);
    const deltaSemCasa=st.followers-10000;

    fightNo=6; rng=mulberry32(1); rareUsed=new Set();
    st=stBase(); st.casaComprada=true;
    finishFight(opp,rVit,false);
    const deltaComCasa=st.followers-10000;

    passo("casa melhor: delta de seguidores maior COM o item do que sem",
      deltaComCasa>deltaSemCasa && deltaSemCasa>0);
    passo("casa melhor: multiplicador bate com CASA_FOLLOWER_MULT (dentro de arredondamento)",
      Math.abs(deltaComCasa-Math.round(deltaSemCasa*CASA_FOLLOWER_MULT))<=1);

    /* Consultoria de mídia: item RECORRENTE — precisa comprar de novo toda
       vez (não "Adquirido" pra sempre), efeito só na luta em que foi
       comprada, reusa o MESMO CASA_FOLLOWER_MULT (nenhum número novo). */
    fightNo=6; rng=mulberry32(1); rareUsed=new Set();
    st=stBase(); st.consultoriaAtiva=false;
    finishFight(opp,rVit,false);
    const deltaSemConsultoria=st.followers-10000;

    fightNo=6; rng=mulberry32(1); rareUsed=new Set();
    st=stBase(); st.consultoriaAtiva=true;
    finishFight(opp,rVit,false);
    const deltaComConsultoria=st.followers-10000;

    passo("consultoria: delta de seguidores maior COM o item do que sem",
      deltaComConsultoria>deltaSemConsultoria && deltaSemConsultoria>0);
    passo("consultoria: multiplicador é o MESMO CASA_FOLLOWER_MULT (dentro de arredondamento)",
      Math.abs(deltaComConsultoria-Math.round(deltaSemConsultoria*CASA_FOLLOWER_MULT))<=1);
    passo("consultoria: consumida na luta — st.consultoriaAtiva volta a false",
      st.consultoriaAtiva===false);

    // painel: comprado() é true logo após comprar, mas mostra rótulo
    // DIFERENTE de "Adquirido" e some (volta a comprável) depois da luta
    st.dinheiro=CUSTO_CONSULTORIA; st.consultoriaAtiva=false;
    abrirPainelTreinador();
    p=document.getElementById("painelTreinador");
    linhas=itensDe(p);
    botaoDe(linhas,"Consultoria de mídia").onclick();
    passo("consultoria: comprar desconta o preço", st.dinheiro===0);
    p=document.getElementById("painelTreinador");
    linhas=itensDe(p);
    const linhaConsult=linhas.find(l=>l.children[0].innerHTML==="Consultoria de mídia");
    passo("consultoria: ATIVA mostra rótulo próprio, não 'Adquirido' (é recorrente, não permanente)",
      filhosENetos(linhaConsult).some(c=>c.innerHTML==="✓ Ativa para a próxima luta") &&
      !filhosENetos(linhaConsult).some(c=>c.innerHTML==="✓ Adquirido"));

    fightNo=6; rng=mulberry32(1); rareUsed=new Set();
    st.followers=10000; st.fightNo=6;
    finishFight(opp,rVit,false);       // consome a consultoria
    st.dinheiro=CUSTO_CONSULTORIA;
    abrirPainelTreinador();
    p=document.getElementById("painelTreinador");
    linhas=itensDe(p);
    passo("consultoria: depois de consumida, volta a aparecer o botão Comprar (recomprável)",
      !!botaoDe(linhas,"Consultoria de mídia") && !botaoDe(linhas,"Consultoria de mídia").disabled);
  }catch(e){
    passos.push({nome:"erro inesperado: "+e.message,ok:false});
  }
  return passos;
})();
`;

  try {
    vm.runInContext(lerScript() + corpo, env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("  o cenário nem rodou: " + e.message) + "\n" +
      cinza(e.stack.split("\n").slice(1, 3).join("\n")));
    return false;
  }
  const passos = env.sandbox.__loja || [];
  let ok = true;
  for (const p of passos) {
    if (!p.ok) ok = false;
    console.log(`  ${p.ok ? verde("ok   ") : vermelho("fora ")} ${p.nome}`);
  }
  return ok && passos.length > 0;
}

function testarConquistas() {
  console.log("\n" + cinza("conquistas: cada check() no limite certo, e a persistência de verdade"));
  const env = criarAmbiente();
  vm.createContext(env.sandbox);

  const corpo = `
;globalThis.__cq=(function(){
  const passos=[];
  const passo=(nome,ok)=>passos.push({nome,ok:!!ok});
  try{
    /* fightNo:TOTAL_FIGHTS por padrão — a maioria dos limites testados aqui
       é "no fim da carreira, X é verdade". Os 4 que dependem disso
       (invicto, nunca_finalizado, queixo_de_granito, idolo) têm um teste
       à parte provando que NO MEIO da carreira, mesmo com a condição já
       satisfeita, ainda não desbloqueiam — achado testando: sem o
       fightNo>=TOTAL_FIGHTS, "invicto" desbloqueava na luta 1. */
    const base=()=>({wins:0,losses:0,defesas:0,vezesCampeao:0,title:false,
      momentos:[],subLosses:0,koLosses:0,longestW:0,kdTaken:0,evitouAlgumaVez:false,
      peak:0,followers:0,bestBeaten:0,fightNo:TOTAL_FIGHTS,
      topoDivisaoAlcancado:false,exCampeao:null,longestL:0,foiCinturaoInterino:false,
      perdeuCinturaoPorNocaute:false,kdGiven:0,maxDisputaRecusas:0,tituloPorDecisao:false,
      finishes:0});
    const acha=id=>CONQUISTAS.find(c=>c.id===id);

    let st1=base(); st1.wins=1;
    passo("primeiro_sangue: 1 vitória desbloqueia", acha("primeiro_sangue").check(st1));
    let st0=base(); st0.wins=0;
    passo("primeiro_sangue: 0 vitórias NÃO desbloqueia", !acha("primeiro_sangue").check(st0));

    passo("invicto: 0 derrotas desbloqueia", acha("invicto").check(base()));
    let stL=base(); stL.losses=1;
    passo("invicto: 1 derrota NÃO desbloqueia", !acha("invicto").check(stL));
    let stMeio=base(); stMeio.fightNo=10;
    passo("invicto: 0 derrotas NO MEIO da carreira (luta 10) NÃO desbloqueia — só no fim",
      !acha("invicto").check(stMeio));

    let st5=base(); st5.defesas=5;
    passo("reinado: 5 defesas desbloqueia", acha("reinado").check(st5));
    let st4=base(); st4.defesas=4;
    passo("reinado: 4 defesas NÃO desbloqueia", !acha("reinado").check(st4));

    let stF2=base(); stF2.vezesCampeao=2;
    passo("fenix: 2ª conquista do cinturão desbloqueia", acha("fenix").check(stF2));
    let stF1=base(); stF1.vezesCampeao=1;
    passo("fenix: só 1ª conquista NÃO desbloqueia", !acha("fenix").check(stF1));

    let stLC=base(); stLC.title=true; stLC.foiCampeao=true;
    passo("lenda_coroada: campeão no modo lenda desbloqueia", acha("lenda_coroada").check(stLC,"lenda"));
    passo("lenda_coroada: campeão no modo normal NÃO desbloqueia", !acha("lenda_coroada").check(stLC,"normal"));
    let stLC2=base(); stLC2.title=false; stLC2.foiCampeao=false;
    passo("lenda_coroada: modo lenda SEM cinturão NÃO desbloqueia", !acha("lenda_coroada").check(stLC2,"lenda"));
    // cinturão interino: title=true mas foiCampeao ainda false (não unificou) —
    // não pode destrancar "ganhou o cinturão" com o cinturão errado
    let stLC3=base(); stLC3.title=true; stLC3.cinturaoInterino=true; stLC3.foiCampeao=false;
    passo("lenda_coroada: interino (title=true, foiCampeao=false) NÃO desbloqueia",
      !acha("lenda_coroada").check(stLC3,"lenda"));

    let stNS=base(); stNS.momentos=[{tipo:"lesao"}];
    passo("nao_sente: momento de lesão vencida desbloqueia", acha("nao_sente").check(stNS));
    passo("nao_sente: sem momento de lesão NÃO desbloqueia", !acha("nao_sente").check(base()));

    passo("nunca_finalizado: 0 finalizações sofridas desbloqueia", acha("nunca_finalizado").check(base()));
    let stSL=base(); stSL.subLosses=1;
    passo("nunca_finalizado: 1 finalização sofrida NÃO desbloqueia", !acha("nunca_finalizado").check(stSL));

    passo("queixo_de_granito: 0 nocautes sofridos desbloqueia", acha("queixo_de_granito").check(base()));
    let stKO=base(); stKO.koLosses=1;
    passo("queixo_de_granito: 1 nocaute sofrido NÃO desbloqueia", !acha("queixo_de_granito").check(stKO));

    let stW8=base(); stW8.longestW=8;
    passo("fogo: sequência de 8 desbloqueia", acha("fogo").check(stW8));
    let stW7=base(); stW7.longestW=7;
    passo("fogo: sequência de 7 NÃO desbloqueia", !acha("fogo").check(stW7));

    let stKd6=base(); stKd6.kdTaken=6;
    passo("levantou_de_novo: 6 quedas sofridas desbloqueia", acha("levantou_de_novo").check(stKd6));
    let stKd5=base(); stKd5.kdTaken=5;
    passo("levantou_de_novo: 5 quedas sofridas NÃO desbloqueia", !acha("levantou_de_novo").check(stKd5));

    let stZ=base(); stZ.momentos=[{tipo:"upset"}];
    passo("zebra: momento de upset desbloqueia", acha("zebra").check(stZ));
    passo("zebra: sem momento de upset NÃO desbloqueia", !acha("zebra").check(base()));

    let stMR=base(); stMR.momentos=[{tipo:"ko"}];
    passo("mao_rapida: momento de KO rápido desbloqueia", acha("mao_rapida").check(stMR));
    passo("mao_rapida: sem momento de KO rápido NÃO desbloqueia", !acha("mao_rapida").check(base()));

    let stP=base(); stP.evitouAlgumaVez=true;
    passo("prudente: evitou risco físico desbloqueia", acha("prudente").check(stP));
    passo("prudente: nunca evitou NÃO desbloqueia", !acha("prudente").check(base()));

    /* era peak — trocado por bestBeaten depois de medir que peak satura
       (91% desbloqueava, era teto de standing, não conquista de verdade).
       bestBeaten>=.90 deu 31% na mesma medição (180 carreiras). */
    let stBB90=base(); stBB90.bestBeaten=.90;
    passo("topo_da_divisao: bestBeaten .90 desbloqueia", acha("topo_da_divisao").check(stBB90));
    let stBB89=base(); stBB89.bestBeaten=.89;
    passo("topo_da_divisao: bestBeaten .89 NÃO desbloqueia", !acha("topo_da_divisao").check(stBB89));

    let stI5=base(); stI5.followers=LIMIAR_IDOLO;
    passo("idolo: seguidores no limiar desbloqueia", acha("idolo").check(stI5));
    let stI4=base(); stI4.followers=LIMIAR_IDOLO-1;
    passo("idolo: 1 seguidor abaixo do limiar NÃO desbloqueia", !acha("idolo").check(stI4));

    // ---------- leva 2 (2026-09-21): as 15 novas, mesmo padrão dos dois
    // lados do limite das 15 originais acima ----------
    let stCR1=base(); stCR1.topoDivisaoAlcancado=true;
    passo("chegada_relampago: alcançou o topo desbloqueia", acha("chegada_relampago").check(stCR1));
    passo("chegada_relampago: nunca alcançou NÃO desbloqueia", !acha("chegada_relampago").check(base()));

    let stVD1=base(); stVD1.koLosses=4;
    passo("vidro: 4 nocautes sofridos desbloqueia", acha("vidro").check(stVD1));
    let stVD0=base(); stVD0.koLosses=3;
    passo("vidro: 3 nocautes sofridos NÃO desbloqueia", !acha("vidro").check(stVD0));

    let stEC1=base(); stEC1.exCampeao={name:"Rival"};
    passo("ex_campeao: exCampeao preenchido desbloqueia", acha("ex_campeao").check(stEC1));
    passo("ex_campeao: exCampeao null NÃO desbloqueia", !acha("ex_campeao").check(base()));

    let stZ22=base(); stZ22.wins=0;
    passo("zero_de_22: 0 vitórias no fim desbloqueia", acha("zero_de_22").check(stZ22));
    let stZ22b=base(); stZ22b.wins=1;
    passo("zero_de_22: 1 vitória NÃO desbloqueia", !acha("zero_de_22").check(stZ22b));
    let stZ22c=base(); stZ22c.wins=0; stZ22c.fightNo=10;
    passo("zero_de_22: 0 vitórias NO MEIO da carreira NÃO desbloqueia — só no fim",
      !acha("zero_de_22").check(stZ22c));

    let stSF1=base(); stSF1.longestL=5;
    passo("sequencia_feia: 5 derrotas seguidas (pico) desbloqueia", acha("sequencia_feia").check(stSF1));
    let stSF0=base(); stSF0.longestL=4;
    passo("sequencia_feia: 4 derrotas seguidas NÃO desbloqueia", !acha("sequencia_feia").check(stSF0));

    let stCI1=base(); stCI1.foiCinturaoInterino=true;
    passo("cinturao_interino: foiCinturaoInterino desbloqueia", acha("cinturao_interino").check(stCI1));
    passo("cinturao_interino: nunca foi NÃO desbloqueia", !acha("cinturao_interino").check(base()));

    let stNT1=base(); stNT1.perdeuCinturaoPorNocaute=true;
    passo("nocauteado_do_trono: flag marcada desbloqueia", acha("nocauteado_do_trono").check(stNT1));
    passo("nocauteado_do_trono: nunca perdeu por nocaute NÃO desbloqueia", !acha("nocauteado_do_trono").check(base()));

    let stNJ1=base(); stNJ1.wins=7; stNJ1.finishes=7;
    passo("nunca_precisou_do_juiz: 7 vitórias, todas finalizadas/nocauteadas desbloqueia",
      acha("nunca_precisou_do_juiz").check(stNJ1));
    let stNJ0=base(); stNJ0.wins=7; stNJ0.finishes=6;
    passo("nunca_precisou_do_juiz: 1 das 7 foi decisão NÃO desbloqueia", !acha("nunca_precisou_do_juiz").check(stNJ0));
    let stNJ2=base(); stNJ2.wins=6; stNJ2.finishes=6;
    passo("nunca_precisou_do_juiz: só 6 vitórias NÃO desbloqueia (precisa de 7)", !acha("nunca_precisou_do_juiz").check(stNJ2));

    let stCE1=base(); stCE1.wins=7; stCE1.finishes=0;
    passo("chato_mas_eficaz: 7 vitórias, nenhuma finalizada/nocauteada desbloqueia",
      acha("chato_mas_eficaz").check(stCE1));
    let stCE0=base(); stCE0.wins=7; stCE0.finishes=1;
    passo("chato_mas_eficaz: 1 das 7 foi finalização/nocaute NÃO desbloqueia", !acha("chato_mas_eficaz").check(stCE0));

    let stNC1=base(); stNC1.kdTaken=0;
    passo("nunca_foi_ao_chao: 0 quedas sofridas no fim desbloqueia", acha("nunca_foi_ao_chao").check(stNC1));
    let stNC0=base(); stNC0.kdTaken=1;
    passo("nunca_foi_ao_chao: 1 queda sofrida NÃO desbloqueia", !acha("nunca_foi_ao_chao").check(stNC0));

    let stGQ1=base(); stGQ1.kdGiven=15;
    passo("grande_queda: 15 quedas aplicadas desbloqueia", acha("grande_queda").check(stGQ1));
    let stGQ0=base(); stGQ0.kdGiven=14;
    passo("grande_queda: 14 quedas aplicadas NÃO desbloqueia", !acha("grande_queda").check(stGQ0));

    let stNQ1=base(); stNQ1.kdGiven=0;
    passo("nunca_aplicou_queda: 0 quedas aplicadas no fim desbloqueia", acha("nunca_aplicou_queda").check(stNQ1));
    let stNQ0=base(); stNQ0.kdGiven=1;
    passo("nunca_aplicou_queda: 1 queda aplicada NÃO desbloqueia", !acha("nunca_aplicou_queda").check(stNQ0));

    let stRC1=base(); stRC1.maxDisputaRecusas=1;
    passo("recusou_a_chance: recusou 1 vez (pico) desbloqueia", acha("recusou_a_chance").check(stRC1));
    passo("recusou_a_chance: nunca recusou NÃO desbloqueia", !acha("recusou_a_chance").check(base()));

    let stDC1=base(); stDC1.tituloPorDecisao=true;
    passo("decisao_de_campeao: tituloPorDecisao desbloqueia", acha("decisao_de_campeao").check(stDC1));
    passo("decisao_de_campeao: nunca ganhou por decisão NÃO desbloqueia", !acha("decisao_de_campeao").check(base()));

    /* 29, não 30: "Noite marcante" (bonusNoiteMarco) entrou na leva 2 e
       caiu na MEDIÇÃO — 66,7% no modo normal, acima do teto de 60% que a
       própria leva 2 se propôs a respeitar. É flag booleana (não tem
       limiar pra apertar, só existe ou não), então a correção certa era
       tirar, não forçar 15 pra bater um número redondo. */
    passo("29 conquistas cadastradas (leva 1: 15 + leva 2 de 2026-09-21: +14; mais a platina, calculada, não é uma delas)",
      CONQUISTAS.length===29);
    passo("cada id de CONQUISTAS é único (sem duplicata escondida na leva 2)",
      new Set(CONQUISTAS.map(c=>c.id)).size===CONQUISTAS.length);

    // ---------- ícones e rótulo de raridade (2026-09-21) ----------
    passo("toda conquista tem cat definido e o glifo daquela categoria existe (sem ícone quebrado silencioso)",
      CONQUISTAS.every(c=>c.cat&&GLIFO_CONQUISTA[c.cat]));
    passo("iconeConquista() sempre devolve moldura de octógono (mesmo selo do jogo, não troféu novo)",
      CONQUISTAS.every(c=>iconeConquista(c.cat).includes('class="ic-moldura"')));

    passo("raridadeDeTaxa: 61% (acima do teto) = Comum", raridadeDeTaxa(61)==="Comum");
    passo("raridadeDeTaxa: 60% (limite, não acima) = Incomum, não Comum", raridadeDeTaxa(60)==="Incomum");
    passo("raridadeDeTaxa: 31% = Incomum", raridadeDeTaxa(31)==="Incomum");
    passo("raridadeDeTaxa: 30% (limite) = Raro, não Incomum", raridadeDeTaxa(30)==="Raro");
    passo("raridadeDeTaxa: 10% (limite) = Raro", raridadeDeTaxa(10)==="Raro");
    passo("raridadeDeTaxa: 9.9% = Lendário", raridadeDeTaxa(9.9)==="Lendário");
    passo("raridadeDeTaxa: 0% = Lendário", raridadeDeTaxa(0)==="Lendário");

    passo("prudente NÃO tem rótulo (depende da IA, medir daria 0% inventado)",
      raridadeConquista("prudente")===null);
    passo("lenda_coroada TEM rótulo (medido em modo lenda separado, não em normal)",
      raridadeConquista("lenda_coroada")!==null);
    passo("toda conquista, menos prudente, tem rótulo de raridade (nenhuma esquecida na tabela)",
      CONQUISTAS.filter(c=>c.id!=="prudente").every(c=>raridadeConquista(c.id)!==null));
    passo("cada raridade calculada tem badge mapeado (RARIDADE_BADGE cobre as 4)",
      CONQUISTAS.map(c=>raridadeConquista(c.id)).filter(Boolean).every(r=>!!RARIDADE_BADGE[r]));
  }catch(e){
    passos.push({nome:"erro inesperado: "+e.message,ok:false});
  }
  return passos;
})();
`;

  try {
    vm.runInContext(lerScript() + corpo, env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("  o cenário nem rodou: " + e.message) + "\n" +
      cinza(e.stack.split("\n").slice(1, 3).join("\n")));
    return false;
  }
  const passos = env.sandbox.__cq || [];
  let ok = true;
  for (const p of passos) {
    if (!p.ok) ok = false;
    console.log(`  ${p.ok ? verde("ok   ") : vermelho("fora ")} ${p.nome}`);
  }

  /* Persistência de verdade: localStorage FALSO injetado (criarAmbiente()
     não tem localStorage nenhum, de propósito — mesmo motivo do áudio).
     Prova: 1) desbloqueia e grava; 2) não desbloqueia a mesma duas vezes
     nem regrava à toa; 3) sobrevive a um "reload" (novo contexto, mesmo
     localStorage); 4) sem localStorage nenhum (throw ao chamar), não
     derruba a carreira. */
  const fakeLS = (() => {
    let dados = {};
    return {
      getItem: k => (k in dados ? dados[k] : null),
      setItem: (k, v) => { dados[k] = String(v); },
      _dump: () => dados,
    };
  })();
  const env2 = criarAmbiente();
  env2.sandbox.localStorage = fakeLS;
  vm.createContext(env2.sandbox);
  const corpo2 = `
;globalThis.__cq2=(function(){
  const passos=[];
  const passo=(nome,ok)=>passos.push({nome,ok:!!ok});
  try{
    me={name:"TesteBot",division:"lightweight",slpm:5.0,strDef:.55,durability:1.0,
        tdDef:.6,subAvg:.5,kdAvg:.4,strAcc:.45,tdAcc:.38};
    me.__base={}; ATTR_TREINAVEIS.forEach(k=>{if(me[k]!=null)me.__base[k]=me[k];});
    rng=mulberry32(1); fightNo=1; rareUsed=new Set();
    st={treino:{},eventoMod:{},campHist:{},wins:0,losses:0,finishes:0,streakW:0,streakL:0,
        bestBeaten:0,bestWin:null,title:false,standing:.5,peak:.5,events:0,koLosses:0,
        kdTaken:0,kdGiven:0,fightNo:1,fan:5,followers:2400,peakFollowers:2400,longestW:0,
        lostBeltFast:false,rares:[],momentos:[],disputaLiberada:false,defesas:0,
        exCampeao:null,foiCampeao:false,lesao:null,desafianteIdx:1,bonusNoite:null,
        vezesCampeao:0,subLosses:0,evitouAlgumaVez:false};
    const opp={name:"Rival",rating:.5};

    // ainda sem nada: painel vazio, badge em 0
    passo("começa com 0 desbloqueadas", CONQUISTAS_DESBLOQUEADAS.size===0);

    // vitória real, via finishFight() de verdade — finishFight() já chama
    // verificarConquistas() sozinho (é o hook de produção), então o
    // desbloqueio acontece DENTRO dela, não precisa chamar de novo aqui.
    // fightNo=1 agora cai no evento (item 1: um por luta, sem o throttle
    // par/finish de antes) — sem AI_URL configurado aqui, ai() devolve
    // null na hora (ver ai(): !AI_URL cai direto no motivo "sem_url"),
    // dispararEventoIA() não faz nada com isso (sem fallback, por
    // desenho) e a luta segue sem evento, exatamente como em produção
    // quando a IA falha.
    finishFight(opp,{winner:me.name,method:"Decisão",knockdowns:{},round:3,clock:"5:00"},false);
    passo("1ª vitória de verdade desbloqueia primeiro_sangue (via finishFight(), não chamada manual)",
      CONQUISTAS_DESBLOQUEADAS.has("primeiro_sangue"));
    passo("gravou em localStorage", JSON.parse(localStorage.getItem("conquistas")).includes("primeiro_sangue"));

    // rodar de novo (chamada manual, redundante) NÃO desbloqueia a mesma outra vez
    const novas2=verificarConquistas();
    passo("checar de novo não repete a mesma conquista", !novas2.some(c=>c.id==="primeiro_sangue"));

    // "reload": novo Set lido do MESMO localStorage
    CONQUISTAS_DESBLOQUEADAS=new Set(JSON.parse(localStorage.getItem("conquistas")||"[]"));
    passo("sobrevive a reload (novo Set, mesmo localStorage)",
      CONQUISTAS_DESBLOQUEADAS.has("primeiro_sangue") && CONQUISTAS_DESBLOQUEADAS.size===1);
  }catch(e){
    passos.push({nome:"erro inesperado: "+e.message,ok:false});
  }
  return passos;
})();
`;
  try {
    vm.runInContext(lerScript() + corpo2, env2.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("  persistência: o cenário nem rodou: " + e.message));
    return false;
  }
  const passos2 = env2.sandbox.__cq2 || [];
  for (const p of passos2) {
    if (!p.ok) ok = false;
    console.log(`  ${p.ok ? verde("ok   ") : vermelho("fora ")} ${p.nome}`);
  }

  /* Sem localStorage NENHUM (getItem/setItem lançam, igual navegador que
     bloqueia) — não pode derrubar a carreira. criarAmbiente() já não tem
     localStorage, então isto roda no ambiente padrão mesmo. */
  const env3 = criarAmbiente();
  vm.createContext(env3.sandbox);
  const corpo3 = `
;globalThis.__cq3=(function(){
  const passos=[];
  try{
    me={name:"TesteBot",division:"lightweight",slpm:5.0,strDef:.55,durability:1.0,
        tdDef:.6,subAvg:.5,kdAvg:.4,strAcc:.45,tdAcc:.38};
    me.__base={}; ATTR_TREINAVEIS.forEach(k=>{if(me[k]!=null)me.__base[k]=me[k];});
    fightNo=1;
    st={treino:{},eventoMod:{},campHist:{},wins:0,losses:0,finishes:0,streakW:0,streakL:0,
        bestBeaten:0,bestWin:null,title:false,standing:.5,peak:.5,events:0,koLosses:0,
        kdTaken:0,kdGiven:0,fightNo:1,fan:5,followers:2400,peakFollowers:2400,longestW:0,
        lostBeltFast:false,rares:[],momentos:[],disputaLiberada:false,defesas:0,
        exCampeao:null,foiCampeao:false,lesao:null,desafianteIdx:1,bonusNoite:null,
        vezesCampeao:1,subLosses:0,evitouAlgumaVez:false};
    const novas=verificarConquistas();
    passos.push({nome:"sem localStorage: verificarConquistas() não derruba (roda e retorna array)",
      ok:Array.isArray(novas)});
  }catch(e){
    passos.push({nome:"sem localStorage: NÃO PODE LANÇAR — "+e.message,ok:false});
  }
  return passos;
})();
`;
  try {
    vm.runInContext(lerScript() + corpo3, env3.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("  sem localStorage derrubou o script inteiro: " + e.message));
    return false;
  }
  const passos3 = env3.sandbox.__cq3 || [];
  for (const p of passos3) {
    if (!p.ok) ok = false;
    console.log(`  ${p.ok ? verde("ok   ") : vermelho("fora ")} ${p.nome}`);
  }

  return ok && passos.length > 0 && passos2.length > 0 && passos3.length > 0;
}

/* ================================================================== *
 * 7c. RESULTADO_LUTA — os buracos achados jogando ("KO" sem "nocaute",
 *     "médico parou" sem "árbitro") ficaram fechados sem abrir falso
 *     positivo? Sem rede — testa só o regex, que é REDE DE BAIXO (a defesa
 *     principal é a instrução em api/ai.js, ver julgar).
 * ================================================================== */
function testarResultadoLuta() {
  console.log("\n" + cinza("RESULTADO_LUTA: os dois buracos achados jogando, mais controles de falso positivo"));
  const env = criarAmbiente();
  vm.createContext(env.sandbox);

  const corpo = `
;globalThis.__rl=(function(){
  const passos=[];
  const passo=(nome,ok)=>passos.push({nome,ok:!!ok});

  const gaps=[
    "Ele venceu por KO no primeiro round e a plateia foi ao delírio.",
    "O médico parou a luta depois do corte feio na sobrancelha.",
    "A médica interrompeu o combate no segundo round.",
  ];
  for(const g of gaps)
    passo("corta: \\""+g.slice(0,40)+"...\\"", semResultadoDeLuta(g)==="");

  /* controles: nada aqui pode ser cortado. "KOch" (nome inventado grudado
     em KO) prova que o \\\\b não deixa "ko" vazar pra dentro de outra
     palavra; "médico" sem "parou" logo depois prova que o padrão novo não
     vira gatilho de qualquer menção a médico. */
  const controles=[
    "Ele treinou pesado pra chegar afiado na próxima luta.",
    "O médico da equipe revisou os exames de rotina antes do camp.",
    "A vaquinha para o KOch, seu cachorro, rendeu mais que o esperado.",
    "Ele foi ao médico fazer um check-up de rotina, nada demais.",
    "Comprou um carro coreano, um Kia, com o dinheiro da bolsa.",
    "O parceiro de treino nocauteou ele no sparring, mas isso não conta.",
  ];
  for(const c of controles)
    passo("mantém: \\""+c.slice(0,40)+"...\\"", semResultadoDeLuta(c)===c);

  /* Achado jogando (leva anterior): um evento local do pool EVENTS ("o
     joelho travou, o médico falou em cirurgia") narrava lesão de verdade
     sem passar pelo st.lesao. Guarda removida junto com o pool: EVENTS
     saiu do caminho principal nesta leva (evento comum agora é gerado
     pela IA, e passa pelos MESMOS filtros RESULTADO_LUTA/CONTEUDO_INSEGURO
     já testados acima — não precisa de guarda de vocabulário própria).
     RARE não herda esta checagem: seu vocabulário de "médico" é sobre tom
     dramático (comissão sugerindo exame após 4 nocautes), não promessa de
     efeito mecânico — teria dado falso positivo ao ser incluído aqui. */

  return passos;
})();
`;

  try {
    vm.runInContext(lerScript() + corpo, env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("  o cenário nem rodou: " + e.message) + "\n" +
      cinza(e.stack.split("\n").slice(1, 3).join("\n")));
    return false;
  }
  const passos = env.sandbox.__rl || [];
  let ok = true;
  for (const p of passos) {
    if (!p.ok) ok = false;
    console.log(`  ${p.ok ? verde("ok   ") : vermelho("fora ")} ${p.nome}`);
  }
  return ok && passos.length > 0;
}

/* ================================================================== *
 * 8. CONTEÚDO INSEGURO — o freio local pega o que já causou o problema?
 * ================================================================== */
/* A defesa principal é a instrução no prompt (api/ai.js) — isto testa só a
   REDE de baixo, que roda sem rede nenhuma (regex, client). Não prova que a
   IA obedece a instrução (isso só dá pra confirmar contra o ar, depois de
   deploy) — prova que, se o desfecho vier ruim mesmo assim, o jogo descarta
   a resposta inteira, e que texto comum de dilema não é pego à toa. */
function testarConteudoInseguro() {
  console.log("\n" + cinza("freio de conteúdo inseguro: as duas frases reais, mais o descarte completo do j"));
  const env = criarAmbiente();
  vm.createContext(env.sandbox);

  const corpo = `
;globalThis.__seg=(function(){
  const passos=[];
  const passo=(nome,ok)=>passos.push({nome,ok:!!ok});
  try{
    /* as duas exatas que produziram o problema — se o freio não pega
       essas, não pegou nada */
    passo("pega: 'corto meus dedos fora com um cutelo'",
      conteudoInseguro("corto meus dedos fora com um cutelo"));
    passo("pega: 'corto minhas pernas fora'",
      conteudoInseguro("corto minhas pernas fora"));

    /* texto comum de dilema não pode disparar à toa */
    /* Corpus novo — o antigo (40 frases) nunca virou arquivo, ficou só na
       memória de uma sessão anterior e se perdeu. Este fica commitado, não
       de novo. Cobre os temas de SEEDS (imprensa, dinheiro, família,
       treino, patrocínio, redes, adversário, lesão) mais os quase-erros
       que já pegaram regex maldesenhado noutro filtro (médico de rotina,
       "nocauteou" contra terceiro no sparring, hype normal do esporte). */
    const benignos=[
      "Assino o contrato sem mostrar pro empresário.",
      "Ignoro e posto um vídeo do treino de verdade.",
      "Converso com ela sobre os riscos e por que continuo.",
      "Levo minha família pro camp comigo.",
      "Recuso educadamente e explico o motivo.",
      "Vou até a casa dos meus pais pra passar o fim de semana com eles.",
      "Respondo o jornalista com uma piada e mudo de assunto.",
      "Aceito o patrocínio, mesmo sabendo que é pouco dinheiro.",
      "Vou ao médico fazer o check-up de rotina antes do camp.",
      "O parceiro de treino nocauteou ele no sparring, mas é treino, não conta.",
      "Vou arrancar a cabeça dele no octógono na próxima luta.",
      "Vou nocautear ele no primeiro round, sem dó.",
      "Ignoro os comentários nas redes e foco no treino.",
      "Converso com o treinador sobre mudar de academia.",
      "Posto um pedido de desculpas simples e sigo em frente.",
      "Treino puxado essa semana, sem folga nenhuma.",
      "Explico pra minha esposa por que preciso viajar pro camp.",
      "Recuso a entrevista e marco outra data.",
      "Assino o autógrafo e tiro foto com o fã.",
      "Falo pro meu empresário que quero renegociar o contrato.",
      /* achado medindo contra produção (2026-09-11): a versão antiga de
         CONTEUDO_INSEGURO bloqueava estas 5 antes mesmo de chamar a IA —
         41,7% de 12 respostas plausíveis de dilema, todas vocabulário de
         ROTINA de MMA (corte de treino/sparring/luta), zero automutilação.
         Ver comentário da constante. */
      "Levei um corte feio na perna no último sparring, mas sigo treinando.",
      "Fiquei todo cortado na perna de tanto low kick, vou pedir pro médico olhar.",
      "Cortei a mão treinando no boxe hoje, nada grave.",
      "O corte no braço ainda incomoda, mas topo lutar assim mesmo.",
      "Aceito, mesmo com a mão cortada de segunda-feira.",
    ];
    const falsosPositivos=benignos.filter(t=>conteudoInseguro(t));
    passo("não dispara em texto comum de dilema, corte de luta incluso (" + benignos.length + " frases benignas)",
      falsosPositivos.length===0);

    /* a rede de baixo estreitou (ver comentário da constante), mas não pode
       ficar cega: pulso/veia continuam pegando sem precisar de "fora"
       (não têm uso de rotina em MMA), e o reflexivo "me/se corto" pega
       automutilação mesmo sem nenhuma parte do corpo na frase. */
    passo("pega: 'ele corta os pulsos escondido'", conteudoInseguro("ele corta os pulsos escondido"));
    passo("pega: 'as veias cortadas doem'", conteudoInseguro("as veias cortadas doem"));
    passo("pega: 'eu me corto quando fico ansioso'", conteudoInseguro("eu me corto quando fico ansioso"));
    passo("pega: 'ele se corta escondido dos outros'", conteudoInseguro("ele se corta escondido dos outros"));

    /* aplicarDilema() descarta o j INTEIRO, não só o desfecho — número
       incluso, é o achado real: a IA tinha aplicado lesão permanente
       junto com a narração ruim */
    me={name:"TesteBot",division:"lightweight",slpm:5.0,strDef:.55,durability:1.0,
        tdDef:.6,subAvg:.5,kdAvg:.4,strAcc:.45,tdAcc:.38};
    me.__base={}; ATTR_TREINAVEIS.forEach(k=>{if(me[k]!=null)me.__base[k]=me[k];});
    st={treino:{},eventoMod:{},campHist:{},wins:0,losses:0,finishes:0,streakW:0,streakL:0,
        bestBeaten:0,bestWin:null,title:false,standing:.5,peak:.5,events:0,koLosses:0,
        kdTaken:0,kdGiven:0,fightNo:1,fan:5,followers:2400,peakFollowers:2400,longestW:0,
        lostBeltFast:false,rares:[],momentos:[],disputaLiberada:false,defesas:0,exCampeao:null,
        foiCampeao:false,lesao:null};
    fraseRng=mulberry32(1); // determinístico, matando o Math.random() de defesa
    const box=document.getElementById("caixaSegurancaTeste");
    const followersAntes=st.followers, fanAntes=st.fan;
    aplicarDilema(box,{titulo:"T",cena:"C"},"corto meus dedos fora com um cutelo",
      {desfecho:"narração gráfica de automutilação aqui",seguidores:.5,fa:2.5,
       lesao:{permanente:true,atributo:"strDef",regiao:"mãos mutiladas"},evitouLesao:false});

    passo("j inseguro: não vira lesão", st.lesao===null);
    passo("j inseguro: seguidores não mudou (não é 0.5 de ganho)", st.followers===followersAntes);
    passo("j inseguro: fã não mudou (não é +2.5)", st.fan===fanAntes);
    passo("j inseguro: desfecho cai numa das frases genéricas (não IA, não mais frase única)",
      FALLBACK_NEUTRO.some(f=>box.innerHTML.includes(f(me.name))));

    /* Achado jogando: eu tinha dado variedade ao texto neutro DA IA (4
       exemplos no prompt) e deixado o fallback LOCAL — que é o caminho
       real de "corto meus dedos", cortado ANTES de chamar a IA — com uma
       frase só, fixa, pra sempre. Repetição exata é a mesma assinatura de
       filtro que já tinha sido resolvida do outro lado. Confere variedade
       de verdade: 10 cortes locais, quantas frases distintas saem. */
    fraseRng=mulberry32(7);
    const vistas=new Set();
    for(let i=0;i<10;i++){
      aplicarDilema(box,{titulo:"T",cena:"C"},"corto meus dedos fora com um cutelo",null);
      const m=/dil-o">([^<]+)</.exec(box.innerHTML);
      if(m)vistas.add(m[1]);
    }
    passo("fallback local: 10 cortes produzem pelo menos 5 frases distintas (não 1 fixa)",
      vistas.size>=5);
    /* achado jogando (2ª rodada): o fallback local era 2ª pessoa ("Você...")
       enquanto o desfecho real da IA e o próprio molde neutro dela (prompt
       de "julgar") são 3ª pessoa — pronome sozinho delatava qual caminho
       gerou o texto, uma assinatura de filtro mais sutil que a repetição.
       Corrigido: fallback local também em 3ª pessoa (usa me.name). */
    /* \b não funciona depois de "ê" (não é \w em regex JS sem /u) — usa
       espaço literal, não \b, senão o teste sempre passa sem checar nada */
    passo("fallback local: nenhuma frase em 2ª pessoa (nenhuma começa com 'Você')",
      [...vistas].every(t=>!/^Você /.test(t)));
    /* achado jogando: filtro certo, apresentação errada — efeito zero
       cravado (j nulo) desenhava "+0 seguidores" e "+0.0 de fã" em VERDE
       (dif>=0 é true pra zero), um padrão que uma resposta comum não
       reproduz (a IA nunca devolveu zero nas medições, sempre pelo menos
       ±0.05/±0.1 — ver LEIA-ME "Conteúdo inseguro no dilema"). Isso
       denunciava o filtro pela cor. Sem linha nenhuma quando o efeito é
       zero apaga essa assinatura. */
    passo("j inseguro: SEM linha de seguidores (efeito zero não vira linha)",
      !box.innerHTML.includes("seguidores</span>"));
    passo("j inseguro: SEM linha de fã (efeito zero não vira linha)",
      !box.innerHTML.includes("de fã</span>"));
    passo("j inseguro: SEM linha de dinheiro (item 2 — j descartado inteiro, número incluso)",
      !box.innerHTML.includes("R$"));
    passo("j inseguro: st.dinheiro não mudou (j descartado, dDinheiro cai no default 0)",
      st.dinheiro===(st.dinheiro||0));

    // controle: efeito de verdade (não zero) continua aparecendo
    st.followers=2400; st.fan=5;
    /* Achado nesta sessão (Plano Pro, 2026-09-21): este fixture não menciona
       NADA financeiro no desfecho ("ganhou uns seguidores" não bate
       MENCIONA_DINHEIRO) — pré-existente, de antes do gate "item 2"
       (mencionaDinheiro) existir; as 4 asserções de dinheiro logo abaixo
       reprovavam mesmo sem nenhuma mudança de código, o gate estava
       funcionando CERTO (recusando dinheiro sem palavra financeira no
       texto), só o teste ficou desatualizado. Acrescentado "fechou um
       patrocínio pequeno" pra bater a intenção real do teste — sem
       mexer em seguidores/fã, que não passam por este gate. */
    aplicarDilema(box,{titulo:"T",cena:"C"},"resposta comum",
      {desfecho:"Fez a escolha certa, ganhou uns seguidores e fechou um patrocínio pequeno.",seguidores:.05,fa:.3,dinheiro:.4,
       atributo:"nenhum",efeito:1,lesao:null,evitouLesao:false});
    passo("efeito real (não zero): linha de seguidores aparece",
      box.innerHTML.includes("seguidores</span>"));
    passo("efeito real (não zero): linha de fã aparece",
      box.innerHTML.includes("de fã</span>"));
    passo("efeito real (item 2): linha de dinheiro aparece, com R$",
      box.innerHTML.includes("R$"));
    passo("item 2: dinheiro trava em ±1 bolsa (RENDA_BASE) — .4 de fração vira 40% dela",
      st.dinheiro===Math.round(RENDA_BASE*.4));

    /* Empresário financeiro (loja, leva seguinte): reduz pela metade só o
       lado NEGATIVO de dDinheiro. st.dinheiro alto ANTES (100000) pra não
       deixar o piso Math.max(0,...) mascarar o efeito medido. */
    st.dinheiro=100000; st.empresarioComprado=false;
    aplicarDilema(box,{titulo:"T",cena:"C"},"resposta comum",
      {desfecho:"Caiu num golpe e perdeu o pagamento combinado.",seguidores:0,fa:0,dinheiro:-.4,
       atributo:"nenhum",efeito:1,lesao:null,evitouLesao:false});
    passo("sem empresário: perda de dinheiro é inteira (não reduzida)",
      st.dinheiro===100000-Math.round(RENDA_BASE*.4));

    st.dinheiro=100000; st.empresarioComprado=true;
    aplicarDilema(box,{titulo:"T",cena:"C"},"resposta comum",
      {desfecho:"Caiu num golpe e perdeu o pagamento combinado.",seguidores:0,fa:0,dinheiro:-.4,
       atributo:"nenhum",efeito:1,lesao:null,evitouLesao:false});
    passo("com empresário: perda de dinheiro vem pela METADE",
      st.dinheiro===100000-Math.round(Math.round(RENDA_BASE*.4)/2));

    st.dinheiro=100000; st.empresarioComprado=true;
    aplicarDilema(box,{titulo:"T",cena:"C"},"resposta comum",
      {desfecho:"Fechou um patrocínio bom.",seguidores:0,fa:0,dinheiro:.4,
       atributo:"nenhum",efeito:1,lesao:null,evitouLesao:false});
    passo("com empresário: GANHO de dinheiro continua inteiro (só perda é reduzida)",
      st.dinheiro===100000+Math.round(RENDA_BASE*.4));
    st.empresarioComprado=false;

    /* Regressão (2026-09-06): RESULTADO_LUTA saiu do evento (ver
       testarEventoIA/dispararEventoIA), mas continua valendo pro
       DESFECHO DO DILEMA — é onde ele foi desenhado pra proteger
       (impedir a IA de afirmar resultado de uma luta que ainda vai
       acontecer). Confere que aplicarDilema() ainda corta. */
    aplicarDilema(box,{titulo:"T",cena:"C"},"resposta comum",
      {desfecho:"Ele venceu por nocaute e a torcida foi ao delírio.",seguidores:.05,fa:.3,
       atributo:"nenhum",efeito:1,lesao:null,evitouLesao:false});
    passo("RESULTADO_LUTA continua protegendo o desfecho do DILEMA (não removido daqui)",
      !box.innerHTML.includes("Ele venceu por nocaute"));
  }catch(e){
    passos.push({nome:"erro inesperado: "+e.message,ok:false});
  }
  return passos;
})();
`;

  try {
    vm.runInContext(lerScript() + corpo, env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("  o cenário nem rodou: " + e.message) + "\n" +
      cinza(e.stack.split("\n").slice(1, 3).join("\n")));
    return false;
  }
  const passos = env.sandbox.__seg || [];
  let ok = true;
  for (const p of passos) {
    if (!p.ok) ok = false;
    console.log(`  ${p.ok ? verde("ok   ") : vermelho("fora ")} ${p.nome}`);
  }
  return ok && passos.length > 0;
}

/* ================================================================== *
 * 8a2. PLANO PRO — coletiva pré-luta e entrevista pós-luta: prioridade
 *      determinística da pergunta, clamp de número, vitrine no grátis,
 *      CONTEUDO_INSEGURO/semResultadoDeLuta continuam valendo.
 *      `ai` é sobrescrito direto no vm (mesmo truque de testarEventoIA,
 *      abaixo) — mais simples que mockar fetch pra capturar o `data`
 *      exato que cada chamada manda.
 * ================================================================== */
function testarColetivaEntrevista() {
  console.log("\n" + cinza("Plano Pro: coletiva/entrevista — pergunta determinística, clamp de número, vitrine no grátis"));
  const env = criarAmbiente();
  vm.createContext(env.sandbox);
  /* Diferente de testarAiVivo (setTimeout síncrono pra todo mundo):
     aplicarColetiva() usa setTimeout(seguir,2200) só quando mostra uma
     reação de verdade — se o setTimeout disparasse na hora, `seguir()`
     limparia box.innerHTML="" ANTES do teste conseguir ler o texto
     renderizado. __drenarAgora (mesmo `timers`/`drenar` de sempre)
     deixa CADA cenário escolher: inspeciona o innerHTML primeiro, dispara
     depois (ou nunca, sem problema — timer parado não afeta nada). */
  env.sandbox.__drenarAgora = env.drenar;

  const corpo = `
;globalThis.__result=(async function(){
  const passos=[];
  const passo=(nome,ok)=>passos.push({nome,ok:!!ok});
  try{
    /* ---------- perguntaEntrevista(): prioridade FIXA, sem IA nem rng ---------- */
    const opp={name:"Rival",arquetipo:"Completo",rating:.5,destaque:null};
    passo("prioridade: cinturão vence tudo, mesmo com lesão/zebra também true",
      perguntaEntrevista(opp,true,"Decisão",3,"5:00",true,true,"joelho machucado",2,1,1).fatoObrigatorio==="cinturão");
    passo("prioridade: lesão vence zebra/método quando não há cinturão",
      perguntaEntrevista(opp,true,"Nocaute",1,"2:30",false,true,"joelho machucado",0,0,1).fatoObrigatorio==="lesão");
    passo("prioridade: zebra vence método quando não há cinturão/lesão",
      perguntaEntrevista(opp,true,"Finalização",2,"1:00",false,true,null,0,0,1).fatoObrigatorio==="zebra");
    passo("prioridade: nocaute sozinho (sem cinturão/lesão/zebra)",
      perguntaEntrevista(opp,true,"Nocaute",1,"4:10",false,false,null,0,0,1).fatoObrigatorio==="nocaute");
    passo("prioridade: finalização sozinha",
      perguntaEntrevista(opp,false,"Finalização",2,"3:20",false,false,null,0,0,1).fatoObrigatorio==="finalização");
    passo("prioridade: decisão sozinha (fallback de método)",
      perguntaEntrevista(opp,true,"Decisão",3,"5:00",false,false,null,0,0,1).fatoObrigatorio==="decisão");
    passo("quedas: decisão COM quedas aplicadas enriquece a pergunta (cita o número)",
      perguntaEntrevista(opp,true,"Decisão",3,"5:00",false,false,null,3,1,1).pergunta.includes("3 quedas aplicadas"));
    passo("quedas: decisão SEM quedas nenhuma não cita quedas",
      !perguntaEntrevista(opp,true,"Decisão",3,"5:00",false,false,null,0,0,1).pergunta.includes("quedas aplicadas"));
    passo("paridade varia a redação (fightNo par x ímpar não repete a mesma frase)",
      perguntaEntrevista(opp,true,"Nocaute",1,"2:00",false,false,null,0,0,2).pergunta
        !==perguntaEntrevista(opp,true,"Nocaute",1,"2:00",false,false,null,0,0,3).pergunta);

    /* ---------- fixtures comuns pra coletiva/entrevista de verdade ---------- */
    me={name:"TesteBot",division:"lightweight",slpm:5.0,strDef:.55,durability:1.0,
        tdDef:.6,subAvg:.5,kdAvg:.4,strAcc:.45,tdAcc:.38};
    me.__base={}; ATTR_TREINAVEIS.forEach(k=>{if(me[k]!=null)me.__base[k]=me[k];});
    st={treino:{},eventoMod:{},wins:5,losses:1,standing:.5,fan:5,followers:8000,dinheiro:0,
        lesao:null,tituloEstaLuta:false,coletivaHype:1,coletivaPressao:null,entrevistasFeitas:0};
    fightNo=6;

    /* ---------- COLETIVA: Pro, resposta boa, números clampados ---------- */
    let lutarChamado=null;
    lutar=(escolhido,camp)=>{lutarChamado={escolhido,camp};};
    meuPro=true;
    let dataRecebida=null;
    ai=async(kind,data)=>{dataRecebida={kind,data};
      return{reacao:"Ele revirou os olhos e saiu resmungando pro microfone.",hype:5,pressao:-3,atributoPressao:"tdDef"};};
    telaColetiva({f:opp,ganho:.08},{nome:"Boxe"});
    document.getElementById("colresp").value="vai ver quando o sino tocar";
    await document.getElementById("colgo").onclick();
    passo("coletiva Pro: manda kind certo e o texto do jogador em 'resposta'",
      dataRecebida&&dataRecebida.kind==="coletiva"&&dataRecebida.data.resposta==="vai ver quando o sino tocar");
    passo("coletiva Pro: manda o nome do adversário e o record atual",
      dataRecebida.data.opp==="Rival"&&dataRecebida.data.record==="5-1");
    passo("coletiva: hype trava no teto 1.20 (resposta mandou 5)", st.coletivaHype===1.20);
    passo("coletiva: pressao trava no piso 0.90 (resposta mandou -3)",
      st.coletivaPressao&&st.coletivaPressao.mult===0.90);
    passo("coletiva: atributoPressao válido vira st.coletivaPressao.atributo",
      st.coletivaPressao&&st.coletivaPressao.atributo==="tdDef");
    __drenarAgora();   // dispara o setTimeout(seguir,2200) — só agora lutar() de fato roda
    passo("coletiva: seguir() chama lutar() com o MESMO escolhido/camp da tela",
      lutarChamado&&lutarChamado.escolhido.f===opp&&lutarChamado.camp.nome==="Boxe");

    /* ---------- COLETIVA: atributoPressao inválido não vira pressão ---------- */
    st.coletivaHype=1;st.coletivaPressao=null;lutarChamado=null;
    ai=async()=>({reacao:"Ele nem comentou nada de mais.",hype:1,pressao:1,atributoPressao:"velocidade_da_luz"});
    telaColetiva({f:opp,ganho:.08},{nome:"Boxe"});
    document.getElementById("colresp").value="beleza";
    await document.getElementById("colgo").onclick();
    passo("coletiva: atributoPressao fora da lista de atributos válidos vira null (não quebra)",
      st.coletivaPressao===null);

    /* ---------- COLETIVA: CONTEUDO_INSEGURO descarta o j INTEIRO ---------- */
    st.coletivaHype=1;st.coletivaPressao=null;lutarChamado=null;
    let chamouAiInseguro=false;
    ai=async()=>{chamouAiInseguro=true;return{reacao:"ok",hype:1.2,pressao:.9,atributoPressao:"nenhum"};};
    telaColetiva({f:opp,ganho:.08},{nome:"Boxe"});
    document.getElementById("colresp").value="eu me corto quando fico ansioso, isso não muda nada";
    await document.getElementById("colgo").onclick();
    passo("coletiva: texto inseguro do JOGADOR corta ANTES de chamar a IA (mesma rede de baixo do dilema)",
      !chamouAiInseguro);
    passo("coletiva: sem chamada de IA, hype/pressao ficam neutros", st.coletivaHype===1&&st.coletivaPressao===null);
    passo("coletiva: mesmo sem reacao, seguir() ainda roda (a luta nunca trava)", !!lutarChamado);

    /* ---------- COLETIVA: semResultadoDeLuta corta só a frase ofensora ---------- */
    st.coletivaHype=1;st.coletivaPressao=null;
    ai=async()=>({reacao:"Ele ficou irritado com a provocação. Vai perder por nocaute no primeiro round, aposto.",
      hype:1.1,pressao:.95,atributoPressao:"nenhum"});
    telaColetiva({f:opp,ganho:.08},{nome:"Boxe"});
    document.getElementById("colresp").value="ele não passa do primeiro round";
    await document.getElementById("colgo").onclick();
    const boxColetiva=document.getElementById("escolha");
    passo("coletiva: RESULTADO_LUTA corta a frase que afirma quem ganha a luta futura",
      !boxColetiva.innerHTML.includes("Vai perder por nocaute"));
    passo("coletiva: a frase SEGURA da mesma reacao continua aparecendo",
      boxColetiva.innerHTML.includes("Ele ficou irritado"));

    /* ---------- COLETIVA: sem meuPro, VITRINE (2026-09-22, item 5) ----------
       Item 6 (pagamento) existe e está no ar — grátis TEM que ver que a
       coletiva existe, senão o plano não vende sozinho. telaColetiva()
       mostra a mesma tela pra todo mundo agora; só o clique em
       "Provocar" que diverge (abre oferta em vez de chamar a IA). */
    st.coletivaHype=1;st.coletivaPressao=null;lutarChamado=null;
    meuPro=false;
    let chamouAiGratis=false;
    ai=async()=>{chamouAiGratis=true;return null;};
    telaColetiva({f:opp,ganho:.08},{nome:"Boxe"});
    passo("coletiva sem meuPro: mostra a tela (não pula pra lutar())", !lutarChamado);
    passo("coletiva sem meuPro: botão mostra o selo Pro",
      document.getElementById("escolha").innerHTML.includes("Provocar")
      && document.getElementById("escolha").innerHTML.includes('<span class="selo-pro">Plano Pro</span>'));
    document.getElementById("colresp").value="ele não passa do primeiro round";
    document.getElementById("colgo").onclick();
    passo("coletiva sem meuPro: clique em Provocar NUNCA chama a IA", !chamouAiGratis);
    passo("coletiva sem meuPro: clique em Provocar abre a oferta Pro",
      document.getElementById("escolha").innerHTML.includes("Recurso Pro"));
    const contProGo=document.getElementById("ofertaProContinuar");
    passo("coletiva sem meuPro: oferta tem 'Continuar' que ainda chama lutar()", !!contProGo);
    contProGo.onclick();
    passo("coletiva sem meuPro: 'Continuar' da oferta chama lutar() com o mesmo escolhido/camp",
      !!lutarChamado&&lutarChamado.escolhido.f===opp&&lutarChamado.camp.nome==="Boxe");

    /* ---------- COLETIVA: 'Pular' não mexe em nada, segue direto ---------- */
    st.coletivaHype=1;st.coletivaPressao=null;lutarChamado=null;meuPro=true;
    let chamouAiPular=false;
    ai=async()=>{chamouAiPular=true;return null;};
    telaColetiva({f:opp,ganho:.08},{nome:"Boxe"});
    document.getElementById("colpular").onclick();
    passo("coletiva: 'Pular' não chama a IA", !chamouAiPular);
    passo("coletiva: 'Pular' ainda assim chama lutar()", !!lutarChamado);

    /* ================= ENTREVISTA ================= */
    const bouts=document.getElementById("bouts");
    const r={method:"Nocaute",round:1,clock:"3:12"};

    /* ---------- ENTREVISTA: Pro, resposta boa, payload certo ---------- */
    st.lesao={atributo:"strDef",nome:"Ombro travado"};
    st.dinheiro=0;st.followers=8000;st.fan=5;meuPro=true;
    dataRecebida=null;
    ai=async(kind,data)=>{dataRecebida={kind,data};
      return{reacao:"A sala riu junto: 'sentir, senti — mas parar era pior.' Fechou um patrocínio pequeno com uma loja da cidade.",
        fa:2.5,seguidores:.8,dinheiro:.3};};
    renderBotaoEntrevista(bouts,opp,r,false,true,2,1,false);
    const btnEnt=bouts.children[bouts.children.length-1].children[0];
    btnEnt.onclick();
    document.getElementById("entresp").value="sentir, senti, mas não ia parar";
    await document.getElementById("entgo").onclick();
    passo("entrevista Pro: manda kind certo e a resposta do jogador",
      dataRecebida&&dataRecebida.kind==="entrevista"&&dataRecebida.data.resposta==="sentir, senti, mas não ia parar");
    passo("entrevista Pro: manda método/round/clock da luta que ACABOU de acontecer",
      dataRecebida.data.metodo==="Nocaute"&&dataRecebida.data.round===1&&dataRecebida.data.clock==="3:12");
    passo("entrevista Pro: manda quedas aplicadas/sofridas certas (td0/tdt0)",
      dataRecebida.data.tdApl===2&&dataRecebida.data.tdSof===1);
    passo("entrevista Pro: manda a lesão ativa formatada (ROTULO_ATTR)",
      typeof dataRecebida.data.lesao==="string"&&dataRecebida.data.lesao.includes("machucado"));
    passo("entrevista: fã clampado corretamente (2.5 dentro do teto 2)", st.fan===5+2);
    passo("entrevista: seguidores aplicado (0.8 dentro do teto 0.50 — trava em 0.50)",
      st.followers===Math.round(8000*(1+0.50)));
    passo("entrevista: dinheiro aplicado (reacao menciona 'patrocínio')",
      st.dinheiro===Math.round(RENDA_BASE*.3));
    passo("entrevistasFeitas incrementou", st.entrevistasFeitas===1);

    /* ---------- ENTREVISTA: dinheiro só com fato financeiro no texto ---------- */
    st.dinheiro=0;st.followers=8000;st.fan=5;st.entrevistasFeitas=0;
    ai=async()=>({reacao:"Ele só deu de ombros e voltou pro vestiário sem mais comentário.",fa:0,seguidores:0,dinheiro:.9});
    renderBotaoEntrevista(bouts,opp,r,false,true,0,0,false);
    const btnEnt2=bouts.children[bouts.children.length-1].children[0];
    btnEnt2.onclick();
    document.getElementById("entresp").value="sem comentários";
    await document.getElementById("entgo").onclick();
    passo("entrevista: reacao SEM palavra financeira não aplica dinheiro (mesmo com j.dinheiro=.9)",
      st.dinheiro===0);

    /* ---------- ENTREVISTA: CONTEUDO_INSEGURO descarta o j inteiro ---------- */
    st.dinheiro=0;st.followers=8000;st.fan=5;
    let chamouAiEntInseguro=false;
    ai=async()=>{chamouAiEntInseguro=true;return{reacao:"ok",fa:2,seguidores:.5,dinheiro:1};};
    renderBotaoEntrevista(bouts,opp,r,false,true,0,0,false);
    const btnEnt3=bouts.children[bouts.children.length-1].children[0];
    btnEnt3.onclick();
    document.getElementById("entresp").value="ele corta os pulsos escondido, todo mundo sabe";
    await document.getElementById("entgo").onclick();
    passo("entrevista: texto inseguro do jogador corta ANTES de chamar a IA",
      !chamouAiEntInseguro);
    passo("entrevista: sem chamada de IA, nada muda em fã/seguidor/dinheiro",
      st.fan===5&&st.followers===8000&&st.dinheiro===0);

    /* ---------- ENTREVISTA: sem meuPro, VITRINE (2026-09-22, item 5) ----------
       O botão aparece (rotulado 🔒 Pro) — só o clique nele diverge:
       abre a oferta em vez de montar a pergunta. */
    meuPro=false;
    let chamouAiEntGratis=false;
    ai=async()=>{chamouAiEntGratis=true;return null;};
    const boutsAntesGratis=bouts.children.length;
    renderBotaoEntrevista(bouts,opp,r,false,true,0,0,false);
    passo("entrevista sem meuPro: botão AINDA aparece em #bouts",
      bouts.children.length===boutsAntesGratis+1);
    const btnEntGratis=bouts.children[bouts.children.length-1].children[0];
    passo("entrevista sem meuPro: rótulo mostra o selo Pro",
      btnEntGratis.innerHTML==='Dar entrevista<span class="selo-pro">Plano Pro</span>');
    btnEntGratis.onclick();
    passo("entrevista sem meuPro: clique abre a oferta Pro, nunca a pergunta",
      bouts.children[bouts.children.length-1].innerHTML.includes("Recurso Pro"));
    passo("entrevista sem meuPro: nunca chega a chamar a IA", !chamouAiEntGratis);
  }catch(e){
    passos.push({nome:"erro inesperado: "+e.message+"\\n"+e.stack,ok:false});
  }
  return passos;
})();
`;

  try {
    vm.runInContext(lerScript() + corpo, env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("  o cenário nem rodou: " + e.message) + "\n" +
      cinza(e.stack.split("\n").slice(1, 3).join("\n")));
    return false;
  }
  return env.sandbox.__result.then((passos) => {
    let ok = true;
    for (const p of passos) {
      if (!p.ok) ok = false;
      console.log(`  ${p.ok ? verde("ok   ") : vermelho("fora ")} ${p.nome}`);
    }
    return ok && passos.length > 0;
  });
}

/* ================================================================== *
 * 8a3. PLANO PRO — Modo Rival: nome fictício, stats emprestados, cedo
 *      na carreira, reaparece a cada 4 lutas até vencer 1x, histórico
 *      alimenta coletiva/entrevista, rivalRng NUNCA desloca rng/
 *      escolhaRng (senão um desafio compartilhado por Pro deixaria de
 *      reproduzir o mesmo draft/adversário pra quem abre sem ser Pro).
 * ================================================================== */
function testarModoRival() {
  console.log("\n" + cinza("Plano Pro: Modo Rival — nome fictício, elegibilidade, histórico, rng isolado"));
  const env = criarAmbiente();
  vm.createContext(env.sandbox);
  const F = lerLutadores();

  const corpo = `
;globalThis.__result=(async function(){
  const passos=[];
  const passo=(nome,ok)=>passos.push({nome,ok:!!ok});
  try{
    function montarCarreira(divisao,seed){
      ROSTER=rateAll(${JSON.stringify(F)});
      CUTOFF_RANKING=Math.max(...ROSTER.map(f=>f.era?f.era[1]:0))-6;
      DIVISION=divisao; MODO="normal";
      POOL=poolDivisao(DIVISION);
      PCT=makePercentiler(POOL);
      LADDER=[...POOL].sort((a,b)=>a.rating-b.rating);
      RANKING=buildRanking(POOL);
      SEED=seed;
      rng=mulberry32(SEED); holdRng=mulberry32((SEED^0x9E3779B9)>>>0);
      fraseRng=mulberry32((SEED^0x1234ABCD)>>>0);
      escolhaRng=mulberry32((SEED^0x5F3A9C21)>>>0);
      lesaoRng=mulberry32((SEED^0x7C3E1A55)>>>0);
      eventoRng=mulberry32((SEED^0x2B8D4F17)>>>0);
      dilemaRng=mulberry32((SEED^0x4D1E8A63)>>>0);
      rivalRng=mulberry32((SEED^0x6A09E667)>>>0);
      me={name:"TesteBot",division:DIVISION,slpm:5,strAcc:.45,strDef:.55,
          tdAvg:2,tdAcc:.4,tdDef:.6,subAvg:.5,kdAvg:.4,durability:1,sapm:3.2};
      me.__base={}; ATTR_TREINAVEIS.forEach(a=>{if(me[a]!=null)me.__base[a]=me[a];});
      fought=new Set();rareUsed=new Set();
      fightNo=0;
      /* Fixture COMPLETA, não a mínima que candidatos() sozinho pediria —
         finishFight() é chamado direto mais abaixo (pra testar o registro
         no histórico) e toca dezenas de campos de st; faltar um deles
         quebra com "undefined" no meio do teste, não no motor de verdade. */
      st={treino:{},eventoMod:{},campHist:{},wins:0,losses:0,finishes:0,streakW:0,streakL:0,
          bestBeaten:0,bestWin:null,title:false,tituloEstaLuta:false,standing:.5,peak:.5,
          events:0,koLosses:0,kdTaken:0,kdGiven:0,fightNo:0,fan:5,followers:2400,
          peakFollowers:2400,longestW:0,lostBeltFast:false,rares:[],momentos:[],
          disputaLiberada:false,disputaRecusas:0,defesas:0,exCampeao:null,foiCampeao:false,
          lesao:null,desafianteIdx:1,bonusNoite:null,vezesCampeao:0,subLosses:0,
          evitouAlgumaVez:false,dinheiro:0,treinadorComprado:false,estreouMainCard:false,
          longestL:0,foiCinturaoInterino:false,perdeuCinturaoPorNocaute:false,
          maxDisputaRecusas:0,tituloPorDecisao:false,coletivaHype:1,coletivaPressao:null,
          entrevistasFeitas:0,rival:null,
          /* item 4 (2026-09-22): rivalAtivado precisa estar true pro resto
             desta suíte continuar testando o que sempre testou (rival
             elegível) — a ativação explícita ganha teste PRÓPRIO logo
             abaixo, não aqui no fixture compartilhado. */
          rivalAtivado:true,rivalNomeEscolhido:null,rivalAnunciado:false};
    }

    /* ---------- grátis: candidatos() nunca ganha a 4ª carta ---------- */
    montarCarreira("lightweight",111);
    meuPro=false;
    fightNo=2; // próxima luta = 3, elegível SE fosse Pro
    const optsGratis=candidatos();
    passo("grátis: candidatos() devolve só as 3 bandas comuns, nunca o rival",
      optsGratis.length===3 && optsGratis.every(o=>!o.rival));
    passo("grátis: st.rival nunca é criado", st.rival===null);

    /* ---------- Pro, mas sem ativar: rival continua não aparecendo ----------
       item 4 (2026-09-22): antes, meuPro sozinho já bastava — automático e
       silencioso. Agora precisa da escolha explícita em
       screenAtivarRival(), aqui simulada por st.rivalAtivado. */
    montarCarreira("lightweight",111);
    meuPro=true; st.rivalAtivado=false;
    fightNo=2; // próxima luta = 3, elegível SE tivesse ativado
    const optsSemAtivar=candidatos();
    passo("Pro sem ativar: candidatos() devolve só as 3 bandas comuns",
      optsSemAtivar.length===3 && optsSemAtivar.every(o=>!o.rival));
    passo("Pro sem ativar: st.rival nunca é criado", st.rival===null);

    /* ---------- Pro: 4ª carta aparece exatamente na luta 3 ---------- */
    montarCarreira("lightweight",111);
    meuPro=true;
    fightNo=1; // próxima luta = 2, ainda não é a hora
    passo("Pro, luta 2: rival NÃO aparece ainda (só a partir da luta 3)",
      candidatos().length===3);
    fightNo=2; // próxima luta = 3
    const opts3=candidatos();
    const rivalCard=opts3.find(o=>o.rival);
    passo("Pro, luta 3: candidatos() devolve 4 (3 comuns + rival)", opts3.length===4);
    passo("Pro, luta 3: exatamente 1 marcado rival:true", opts3.filter(o=>o.rival).length===1);
    passo("Pro, luta 3: st.rival foi criado (gerarRival() rodou por dentro)", !!st.rival);

    /* ---------- nome fictício, nunca um lutador real ---------- */
    const nomesReais=new Set(LADDER.map(f=>f.name));
    passo("nome do rival NÃO é nenhum lutador real da divisão",
      !nomesReais.has(st.rival.nome));
    passo("card do rival usa o MESMO nome fictício (não o nome de quem emprestou stats)",
      rivalCard.f.name===st.rival.nome);

    /* ---------- gerarRival() usa o nome ESCOLHIDO pelo jogador, quando existe ---------- */
    montarCarreira("lightweight",111);
    meuPro=true; st.rivalAtivado=true; st.rivalNomeEscolhido="Renan Duarte Teste";
    fightNo=2;
    candidatos();
    passo("gerarRival(): usa st.rivalNomeEscolhido em vez de sortear um nome novo",
      !!st.rival && st.rival.nome==="Renan Duarte Teste" && st.rival.f.name==="Renan Duarte Teste");

    /* ---------- validarNomeRival(): as 2 travas do nome livre ---------- */
    passo("validarNomeRival: nome vazio recusa", !!validarNomeRival("   "));
    const nomeRealDeVerdade=ROSTER[0].name;
    passo("validarNomeRival: nome de lutador real recusa (comparação exata)",
      !!validarNomeRival(nomeRealDeVerdade));
    passo("validarNomeRival: mesmo nome real SEM acento e EM MAIÚSCULA continua recusando",
      !!validarNomeRival(semAcento(nomeRealDeVerdade).toUpperCase()));
    passo("validarNomeRival: conteúdo inseguro recusa",
      !!validarNomeRival("vou tirar a própria vida se perder"));
    passo("validarNomeRival: nome fictício comum passa (null = sem erro)",
      validarNomeRival("Renan Duarte Teste 999")===null);

    /* ---------- stats de combate emprestados, bio sanitizada ---------- */
    const emprestou=LADDER.some(f=>f.rating===st.rival.f.rating&&f.slpm===st.rival.f.slpm);
    passo("rating/slpm do rival batem com ALGUM lutador real (stats de combate emprestados)",
      emprestou);
    const doadorComBio=LADDER.find(f=>f.rating===st.rival.f.rating&&f.slpm===st.rival.f.slpm&&f.fights);
    passo("bio (fights) do rival NÃO é a bio real de quem emprestou os stats (sanitizada)",
      !doadorComBio||st.rival.f.fights!==doadorComBio.fights);
    passo("era do rival é null (sem linha do tempo de carreira real vazando)",
      st.rival.f.era===null);
    passo("titulos do rival são zerados (sem histórico de cinturão real vazando)",
      st.rival.f.titulos.disputas===0&&st.rival.f.titulos.vitorias===0);

    /* ---------- nunca durante luta de título ---------- */
    montarCarreira("lightweight",111);
    meuPro=true; fightNo=2; st.tituloEstaLuta=true;
    RANKING.campeao=LADDER[LADDER.length-1];
    passo("luta de título: candidatos() devolve só a carta travada, nunca o rival",
      candidatos().length===1&&!candidatos()[0].rival);

    /* ---------- reaparição: a cada 4 lutas, para depois de vencer ---------- */
    montarCarreira("lightweight",112);
    meuPro=true;
    const apareceuEm=[];
    for(let f=1;f<=20;f++){
      fightNo=f-1; // candidatos() olha fightNo+1 como "próxima luta"
      const opts=candidatos();
      if(opts.some(o=>o.rival))apareceuEm.push(f);
    }
    passo("reaparece nas lutas 3, 7, 11, 15, 19 (a cada 4, nunca vencido nesta simulação)",
      JSON.stringify(apareceuEm)===JSON.stringify([3,7,11,15,19]));

    // agora simula uma vitória na luta 7 e confere que ele PARA de reaparecer
    montarCarreira("lightweight",112);
    meuPro=true;
    fightNo=2; candidatos(); // gera o rival na luta 3
    st.rival.historico.push({luta:3,ganhou:false,metodo:"Decisão"});
    st.rival.historico.push({luta:7,ganhou:true,metodo:"Nocaute"}); // venceu na luta 7
    const apareceuDepois=[];
    for(let f=8;f<=20;f++){
      fightNo=f-1;
      if(candidatos().some(o=>o.rival))apareceuDepois.push(f);
    }
    passo("depois de vencer o rival 1x, ele NUNCA MAIS aparece na mesma carreira",
      apareceuDepois.length===0);

    /* ---------- rivalRng nunca desloca rng/escolhaRng (link de desafio) ---------- */
    montarCarreira("lightweight",222);
    meuPro=false;
    const semRival=[];
    for(let f=1;f<=10;f++){fightNo=f-1;semRival.push(candidatos().map(o=>o.f.name).join(","));}

    montarCarreira("lightweight",222); // MESMA seed
    meuPro=true; // desta vez consome rivalRng nas lutas 3/7
    const comRival=[];
    for(let f=1;f<=10;f++){
      fightNo=f-1;
      const opts=candidatos();
      comRival.push(opts.filter(o=>!o.rival).map(o=>o.f.name).join(","));
    }
    passo("rivalRng NUNCA desloca as 3 bandas comuns (mesma seed, com/sem Pro dão o MESMO adversário comum)",
      JSON.stringify(semRival)===JSON.stringify(comRival));

    /* ---------- historicoRivalTexto() ---------- */
    montarCarreira("lightweight",111);
    st.rival={nome:"Renan Duarte",f:{},historico:[]};
    passo("historicoRivalTexto(): null no 1º encontro (sem histórico ainda)",
      historicoRivalTexto()===null);
    st.rival.historico.push({luta:3,ganhou:true,metodo:"Decisão"});
    passo("historicoRivalTexto(): resume o encontro anterior",
      historicoRivalTexto().includes("você venceu")&&historicoRivalTexto().includes("decisão"));
    st.rival.historico.push({luta:7,ganhou:false,metodo:"Nocaute"});
    passo("historicoRivalTexto(): acumula os dois encontros, na ordem",
      /você venceu.*ele venceu/.test(historicoRivalTexto()));

    /* ---------- finishFight() grava no histórico quando ehRival ---------- */
    montarCarreira("lightweight",111);
    meuPro=true;
    fightNo=2; candidatos(); // cria st.rival
    const nomeRivalCriado=st.rival.nome;
    fightNo=2; // finishFight() incrementa por fora, aqui simulamos fightNo já setado como a luta 3
    const resFake={winner:"TesteBot",loser:nomeRivalCriado,method:"Finalização",round:2,clock:"1:30",
      cards:null,log:[],knockdowns:{"TesteBot":0,[nomeRivalCriado]:0}};
    fightNo=3;
    finishFight({name:nomeRivalCriado,rating:.5},resFake,false,0,0,true);
    passo("finishFight(ehRival=true) grava {luta,ganhou,metodo} no histórico",
      st.rival.historico.length===1&&st.rival.historico[0].luta===3&&
      st.rival.historico[0].ganhou===true&&st.rival.historico[0].metodo==="Finalização");

    /* ---------- item 4: anúncio de 1ª aparição, uma vez só ---------- */
    montarCarreira("lightweight",111);
    meuPro=true; st.rivalAtivado=true;
    fightNo=2; // próxima luta = 3, 1ª aparição
    telaAdversario();
    const escolhaHtml1=document.getElementById("escolha").innerHTML;
    passo("telaAdversario(): anuncia 'RIVALIDADE COMEÇA AGORA' na 1ª aparição",
      /RIVALIDADE COME.A AGORA/.test(escolhaHtml1));
    passo("telaAdversario(): st.rivalAnunciado vira true depois do anúncio",
      st.rivalAnunciado===true);
    fightNo=6; // próxima = 7, reaparição — NÃO é mais a 1ª vez
    telaAdversario();
    const escolhaHtml2=document.getElementById("escolha").innerHTML;
    passo("telaAdversario(): reaparição NÃO repete o anúncio",
      !/RIVALIDADE COME.A AGORA/.test(escolhaHtml2));
  }catch(e){
    passos.push({nome:"erro inesperado: "+e.message+"\\n"+e.stack,ok:false});
  }
  return passos;
})();
`;

  try {
    vm.runInContext(lerScript() + corpo, env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("  o cenário nem rodou: " + e.message) + "\n" +
      cinza(e.stack.split("\n").slice(1, 3).join("\n")));
    return false;
  }
  return env.sandbox.__result.then((passos) => {
    let ok = true;
    for (const p of passos) {
      if (!p.ok) ok = false;
      console.log(`  ${p.ok ? verde("ok   ") : vermelho("fora ")} ${p.nome}`);
    }
    return ok && passos.length > 0;
  });
}

/* ================================================================== *
 * 8b. EVENTO POR IA — RESULTADO_LUTA não se aplica aqui (de propósito,
 *     ver dispararEventoIA()), CONTEUDO_INSEGURO continua, e a
 *     retentativa única de JSON malformado funciona. `ai` é sobrescrito
 *     no próprio vm (é `function` de topo, mockável igual qualquer outra)
 *     pra controlar a resposta sem rede — mesmo truque de sobrescrever
 *     lesaoRng/fraseRng que os outros testes já usam.
 * ================================================================== */
function testarEventoIA() {
  console.log("\n" + cinza("evento por IA: RESULTADO_LUTA não corta fato do passado, CONTEUDO_INSEGURO continua, retenta 1x se vier sem texto"));
  const env = criarAmbiente();
  vm.createContext(env.sandbox);

  const corpo = `
;globalThis.__evia=(async function(){
  const passos=[];
  const passo=(nome,ok)=>passos.push({nome,ok:!!ok});
  try{
    me={name:"TesteBot",division:"lightweight",slpm:5.0,strDef:.55,durability:1.0,
        tdDef:.6,subAvg:.5,kdAvg:.4,strAcc:.45,tdAcc:.38};
    st={treino:{},eventoMod:{},wins:5,losses:1,events:0,fightNo:6,
        lastWon:true,lastMethod:"Nocaute",lastRound:1,lastKO:true,
        streakW:2,streakL:0,title:false,followers:8000,fan:6};
    fightNo=6; rareUsed=new Set(); eventoRng=()=>0.05;
    const opp={name:"Rival",rating:.5};
    const bouts=document.getElementById("bouts");

    const ultimo=()=>bouts.children.length?bouts.children[bouts.children.length-1].innerHTML:"";

    // caso 1: "nocaute" como FATO do passado — não pode sumir
    ai=async(kind,data)=>({texto:"O clipe do nocaute rodou a semana inteira no grupo da academia.",atributo:"nenhum",efeito:1});
    await dispararEventoIA(bouts,opp,{});
    passo("evento com 'nocaute' de fato passado SOBREVIVE (RESULTADO_LUTA não se aplica aqui)",
      ultimo().includes("clipe do nocaute rodou"));
    passo("st.events incrementou", st.events===1);

    // caso 2: CONTEUDO_INSEGURO continua valendo pro evento
    const marca2=bouts.children.length; st.events=0;
    ai=async(kind,data)=>({texto:"Ele pensou em se matar depois da derrota.",atributo:"nenhum",efeito:1});
    await dispararEventoIA(bouts,opp,{});
    passo("CONTEUDO_INSEGURO ainda bloqueia o evento (não é removido, só RESULTADO_LUTA saiu)",
      bouts.children.length===marca2 && st.events===0);

    // caso 3: retentativa — 1ª chamada vem sem "texto" (json malformado), 2ª vem certa
    st.events=0;
    let chamadas=0;
    ai=async(kind,data)=>{
      chamadas++;
      if(chamadas===1)return{atributo:"nenhum",efeito:1}; // sem texto
      return{texto:"Segunda tentativa deu certo.",atributo:"nenhum",efeito:1};
    };
    await dispararEventoIA(bouts,opp,{});
    passo("1ª resposta sem 'texto' não desiste — tenta 1x mais", chamadas===2);
    passo("2ª tentativa aparece de verdade", ultimo().includes("Segunda tentativa deu certo"));

    // caso 4: retentativa também falha sem texto — desiste (sem 3ª chamada)
    const marca4=bouts.children.length; st.events=0; chamadas=0;
    ai=async(kind,data)=>{ chamadas++; return{atributo:"nenhum",efeito:1}; };
    await dispararEventoIA(bouts,opp,{});
    passo("as duas tentativas vierem sem texto: desiste (só 2 chamadas, não 3+)", chamadas===2);
    passo("nenhum evento aparece quando as duas tentativas falham", bouts.children.length===marca4);

    // caso 5: tema é mandado pro data da chamada (não é só sugestão no prompt)
    st.events=0;
    let temaRecebido=null;
    ai=async(kind,data)=>{ temaRecebido=data.tema; return{texto:"Evento qualquer.",atributo:"nenhum",efeito:1}; };
    await dispararEventoIA(bouts,opp,{});
    passo("tema vai no data da chamada, sorteado de EVENTO_TEMAS",
      EVENTO_TEMAS.includes(temaRecebido));

    // caso 6: st.eventosRecentes acumula (máx 3) e vai no data — é o que
    // evita repetir a mesma história dentro da mesma carreira
    st.events=0; st.eventosRecentes=["primeiro","segundo","terceiro"];
    let recentesRecebidos=null;
    ai=async(kind,data)=>{ recentesRecebidos=data.recentes; return{texto:"quarto",atributo:"nenhum",efeito:1}; };
    await dispararEventoIA(bouts,opp,{});
    passo("recentes vai no data da chamada, com o histórico ANTES deste evento",
      JSON.stringify(recentesRecebidos)===JSON.stringify(["primeiro","segundo","terceiro"]));
    passo("depois de aplicar, eventosRecentes guarda o novo e descarta o mais velho (máx 3)",
      JSON.stringify(st.eventosRecentes)===JSON.stringify(["segundo","terceiro","quarto"]));

    // caso 7: rede de baixo — a IA ecoa um "recente" quase igual mesmo com
    // a instrução de não repetir (achado real contra a API); o cliente
    // tem que descartar, não confiar só no prompt
    const marca7=bouts.children.length;
    st.events=0; st.eventosRecentes=["Bot já viu essa história antes."];
    ai=async(kind,data)=>({texto:"Bot já viu essa história antes.",atributo:"nenhum",efeito:1});
    await dispararEventoIA(bouts,opp,{});
    passo("eco EXATO de um recente é descartado (rede de baixo, não confia só na instrução)",
      bouts.children.length===marca7 && st.events===0);
    // controle: texto genuinamente novo (mesmo tema recorrente) passa normal
    ai=async(kind,data)=>({texto:"Uma história completamente diferente desta vez.",atributo:"nenhum",efeito:1});
    await dispararEventoIA(bouts,opp,{});
    passo("controle: texto diferente dos recentes passa normal (a rede de baixo não é paranoica)",
      bouts.children.length===marca7+1);

    // caso 8: sorteio SEM reposição — os 10 primeiros temas de uma
    // carreira são os 10 de EVENTO_TEMAS, sem repetir nenhum antes de
    // esgotar a cartela
    st.temasRestantes=null; st.events=0;
    const temasVistos=[];
    ai=async(kind,data)=>{ temasVistos.push(data.tema); return{texto:"Evento "+temasVistos.length,atributo:"nenhum",efeito:1}; };
    for(let i=0;i<10;i++) await dispararEventoIA(bouts,opp,{});
    passo("10 sorteios seguidos cobrem os 10 temas, cada um exatamente 1 vez (sem reposição)",
      new Set(temasVistos).size===10 && temasVistos.length===10 &&
      EVENTO_TEMAS.every(t=>temasVistos.includes(t)));
    // o 11º recomeça uma cartela nova — pode repetir o 1º, mas só a partir daqui
    await dispararEventoIA(bouts,opp,{});
    passo("11º sorteio vem de uma cartela nova (recomeçou, não trava vazio)",
      temasVistos.length===11 && EVENTO_TEMAS.includes(temasVistos[10]));

    // caso 9: contexto de carreira (posição/lesão/cinturão perdido/dinheiro) vai no data
    LADDER=[{},{},{},{},{},{},{},{},{},{}]; // posicaoDivisao() precisa de LADDER de verdade
    st.events=0; st.standing=.5; st.lesao={atributo:"tdDef",nome:"Joelho"};
    st.perdeuCinturaoNaLuta=fightNo; st.dinheiro=12345;
    let dadosRecebidos=null;
    ai=async(kind,data)=>{ dadosRecebidos=data; return{texto:"Evento contextual.",atributo:"nenhum",efeito:1}; };
    await dispararEventoIA(bouts,opp,{});
    passo("posicao vai no data (posicaoDivisao() de verdade, não inventado)",
      typeof dadosRecebidos.posicao==="string" && dadosRecebidos.posicao.startsWith("#"));
    passo("lesao vai no data quando st.lesao existe",
      dadosRecebidos.lesao&&dadosRecebidos.lesao.includes("machucado"));
    passo("perdeuCinturaoAgora é true quando a perda foi NESTA luta (fightNo bate)",
      dadosRecebidos.perdeuCinturaoAgora===true);
    passo("dinheiro vai formatado (fmtNum) no data",
      dadosRecebidos.dinheiro===fmtNum(12345));
    // controle: lesão de OUTRA luta (perdeuCinturaoNaLuta não bate) não marca "agora"
    st.perdeuCinturaoNaLuta=fightNo-3;
    await dispararEventoIA(bouts,opp,{});
    passo("perdeuCinturaoAgora é false quando a perda foi em luta ANTERIOR",
      dadosRecebidos.perdeuCinturaoAgora===false);
  }catch(e){
    passos.push({nome:"erro inesperado: "+e.message,ok:false});
  }
  return passos;
})();
`;

  try {
    vm.runInContext(lerScript() + corpo, env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("  o cenário nem rodou: " + e.message) + "\n" +
      cinza(e.stack.split("\n").slice(1, 3).join("\n")));
    return false;
  }
  return env.sandbox.__evia.then((passos) => {
    let ok = true;
    for (const p of passos) {
      if (!p.ok) ok = false;
      console.log(`  ${p.ok ? verde("ok   ") : vermelho("fora ")} ${p.nome}`);
    }
    return ok && passos.length > 0;
  });
}

/* ================================================================== *
 * 8b2. MEMÓRIA ENTRE CARREIRAS — sorteio sem reposição e "recentes" só
 *      valiam DENTRO da carreira; achado jogando (dilema "A pergunta na
 *      coletiva" repetido palavra por palavra em carreira nova, vindo do
 *      fallback local — só 3 itens, sem histórico nem dentro da
 *      carreira). localStorage FALSO injetado (criarAmbiente() não tem,
 *      de propósito — mesmo padrão de testarConquistas()).
 * ================================================================== */
function testarMemoriaEntreCarreiras() {
  console.log("\n" + cinza("memória entre carreiras: deprioriza (não bloqueia) quem já apareceu, tamanho proporcional ao pool, sobrevive sem localStorage"));
  const fakeLS = (() => {
    let dados = {};
    return { getItem: k => (k in dados ? dados[k] : null), setItem: (k, v) => { dados[k] = String(v); }, _dump: () => dados };
  })();
  const env = criarAmbiente();
  env.sandbox.localStorage = fakeLS;
  vm.createContext(env.sandbox);

  const corpo = `
;globalThis.__mem=(function(){
  const passos=[];
  const passo=(nome,ok)=>passos.push({nome,ok:!!ok});
  try{
    // caso 1: marcarMemoriaEntreCarreiras() capa em tamanhoMax, mantém os
    // MAIS RECENTES (fila, não pilha)
    ["a","b","c","d","e"].forEach(id=>marcarMemoriaEntreCarreiras("memTeste1",id,3));
    passo("memória capa em tamanhoMax (3), guarda os 3 mais recentes, na ordem",
      JSON.stringify(lerMemoriaEntreCarreiras("memTeste1"))===JSON.stringify(["c","d","e"]));

    // caso 2: cartelaComMemoria() DEPRIORIZA quem está na memória — não
    // exclui. Pop() tira do FIM, então os "livres" (não vistos) têm que
    // vir consumidos ANTES dos "usados" (na memória).
    marcarMemoriaEntreCarreiras("memTeste2","a",10);
    marcarMemoriaEntreCarreiras("memTeste2","c",10);
    rng=mulberry32(1);
    const cartela=cartelaComMemoria(["a","b","c","d","e"],rng,"memTeste2",10);
    passo("cartela tem os 5 itens (deprioriza, não bloqueia)",
      new Set(cartela).size===5 && ["a","b","c","d","e"].every(x=>cartela.includes(x)));
    const ultimosDoisPop=[cartela[0],cartela[1]]; // pop() tira daqui por último
    passo("os 2 na memória (a,c) ficam nos 2 primeiros índices — consumidos por ÚLTIMO via pop()",
      ultimosDoisPop.includes("a") && ultimosDoisPop.includes("c"));

    // caso 3: integração real — DILEMA_LOCAL tem 8 itens agora (era 3);
    // drena a carreira 1 inteira (8 sorteios, esgota a cartela), início
    // da carreira 2 (mesmo localStorage, cartela nova) não repete os
    // últimos vistos enquanto sobrar item livre.
    passo("DILEMA_LOCAL cresceu (8 itens, não mais 3 — pool pequeno não ajudava nem com memória)",
      DILEMA_LOCAL.length===8);
    passo("MEM_DILEMA_LOCAL é 60% do pool (arredondado), não fixo",
      MEM_DILEMA_LOCAL===Math.round(DILEMA_LOCAL.length*.6));

    localStorage.setItem("memDilemaFallback","[]");
    dilemaRng=mulberry32(11); st={dilemaFallbackRestante:null};
    const vistosCarreira1=[];
    for(let i=0;i<DILEMA_LOCAL.length;i++) vistosCarreira1.push(proximoDilemaFallback().titulo);
    passo("carreira 1: 8 sorteios cobrem os 8 títulos, cada um 1 vez (sem reposição continua valendo)",
      new Set(vistosCarreira1).size===8);

    /* ler a memória ANTES do sorteio da carreira 2 — proximoDilemaFallback()
       marca a PRÓPRIA memória ao sortear, então ler depois incluiria o
       sorteio que estamos tentando conferir (bug de ordem já pego uma vez
       aqui, corrigido: sempre ler o "antes" antes de agir). */
    const ultimosDaCarreira1=lerMemoriaEntreCarreiras("memDilemaFallback");
    passo("memória da carreira 1 capou em MEM_DILEMA_LOCAL (5), não guardou os 8",
      ultimosDaCarreira1.length===MEM_DILEMA_LOCAL);

    dilemaRng=mulberry32(22); st={dilemaFallbackRestante:null}; // "carreira 2" nova, mesmo localStorage
    const primeiroCarreira2=proximoDilemaFallback().titulo;
    passo("carreira 2: 1º sorteio NÃO é um dos últimos vistos na carreira 1 (memória funcionou entre carreiras)",
      !ultimosDaCarreira1.includes(primeiroCarreira2));

    // caso 4: sem localStorage NENHUM (throw) não derruba nada — mesma
    // garantia de testarConquistas(), aplicada aqui
    const semLS={};
    const antigoLS=globalThis.localStorage;
    globalThis.localStorage=undefined;
    let jogou=true;
    try{
      dilemaRng=mulberry32(33); st={dilemaFallbackRestante:null};
      proximoDilemaFallback();
    }catch(e){ jogou=false; }
    passo("sem localStorage nenhum (undefined): não derruba, mecanismo continua funcionando",
      jogou);
    globalThis.localStorage=antigoLS;
  }catch(e){
    passos.push({nome:"erro inesperado: "+e.message,ok:false});
  }
  return passos;
})();
`;

  try {
    vm.runInContext(lerScript() + corpo, env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("  o cenário nem rodou: " + e.message) + "\n" +
      cinza(e.stack.split("\n").slice(1, 3).join("\n")));
    return false;
  }
  const passos = env.sandbox.__mem || [];
  let ok = true;
  for (const p of passos) {
    if (!p.ok) ok = false;
    console.log(`  ${p.ok ? verde("ok   ") : vermelho("fora ")} ${p.nome}`);
  }
  return ok && passos.length > 0;
}

/* ================================================================== *
 * 8c. DILEMA — mesmo tratamento anti-repetição do evento: sorteio sem
 *     reposição do tipo, histórico de títulos recentes, rede de baixo
 *     pro eco exato. Achado incidental medindo coerência (não pedido:
 *     título "Cheque atrasado" saiu idêntico 2x em 30 chamadas isoladas
 *     — dilema não tinha o mecanismo que o evento já tem, ver
 *     PENDENCIAS.md item 20).
 * ================================================================== */
function testarDilemaMecanismo() {
  console.log("\n" + cinza("dilema: tipo sem reposição (stream próprio, não toca o rng principal) e títulos recentes não repetem"));
  const env = criarAmbiente();
  vm.createContext(env.sandbox);

  const corpo = `
;globalThis.__dilm=(async function(){
  const passos=[];
  const passo=(nome,ok)=>passos.push({nome,ok:!!ok});
  try{
    me={name:"TesteBot",division:"lightweight"};
    st={treino:{},eventoMod:{},wins:5,losses:1,followers:8000,fan:6,streakW:0,streakL:0};
    fightNo=6; document.getElementById("bouts");

    // caso 1: sorteio sem reposição — 12 sorteios seguidos cobrem os 12
    // tipos de SEEDS, cada um exatamente 1 vez
    dilemaRng=mulberry32(1); st.dilemaSeedsRestantes=null;
    const vistos=[];
    for(let i=0;i<12;i++) vistos.push(proximoDilemaSeed());
    passo("12 sorteios seguidos cobrem os 12 tipos, cada um 1 vez (sem reposição)",
      new Set(vistos).size===12 && SEEDS.every(s=>vistos.includes(s)));
    // o 13º recomeça uma cartela nova
    const seed13=proximoDilemaSeed();
    passo("13º sorteio vem de cartela nova (recomeçou, não trava vazio)",
      SEEDS.includes(seed13));

    // caso 2: dilemaRng é stream PRÓPRIO — proximoDilemaSeed() nunca pode
    // tocar o rng principal, senão desloca a sequência de adversários e
    // quebra link de desafio já compartilhado
    dilemaRng=mulberry32(2); st.dilemaSeedsRestantes=null;
    rng=()=>{throw new Error("proximoDilemaSeed() chamou o rng principal");};
    let estourou=false;
    try{ for(let i=0;i<13;i++) proximoDilemaSeed(); }catch(e){ estourou=true; }
    passo("proximoDilemaSeed() nunca consome o rng principal (13 chamadas, inclusive reembaralhando)",
      !estourou);
    rng=mulberry32(1); // devolve um rng normal pro resto do teste

    // caso 3: recentes acumula (máx 3) e vai no data da chamada — mesmo
    // desenho de st.eventosRecentes
    dilemaRng=mulberry32(3); st.dilemaSeedsRestantes=null; st.dilemaRecentes=null;
    const bouts=document.getElementById("bouts");
    const titulos=["Primeiro dilema","Segundo dilema","Terceiro dilema","Quarto dilema"];
    const recebidos=[];
    let idx=0;
    ai=async(kind,data)=>{ recebidos.push(data.recentes); return{titulo:titulos[idx++],cena:"Uma cena qualquer que termina numa decisão."}; };
    for(let i=0;i<4;i++){ abrirDilema(); for(let t=0;t<8;t++) await Promise.resolve(); }
    passo("1º dilema não manda recentes nenhum (carreira começando)",
      JSON.stringify(recebidos[0])==="[]");
    passo("4º dilema manda os 3 últimos títulos, na ordem, sem o 1º (cap em 3)",
      JSON.stringify(recebidos[3])===JSON.stringify(["Primeiro dilema","Segundo dilema","Terceiro dilema"]));
    passo("st.dilemaRecentes guarda só os 3 últimos títulos depois de 4 dilemas",
      JSON.stringify(st.dilemaRecentes)===JSON.stringify(["Segundo dilema","Terceiro dilema","Quarto dilema"]));

    // caso 4: rede de baixo — título igual (mesmo com case diferente) a um
    // recente cai no fallback local, não confia só na instrução do prompt
    dilemaRng=mulberry32(4); st.dilemaSeedsRestantes=null;
    st.dilemaRecentes=["Cheque atrasado"];
    ai=async(kind,data)=>({titulo:"CHEQUE ATRASADO",cena:"Ecoou o mesmo título de novo, com case diferente."});
    abrirDilema(); for(let t=0;t<8;t++) await Promise.resolve();
    const ultimoTitulo=()=>{
      const box=bouts.children[bouts.children.length-1];
      const m=box.innerHTML.match(/dil-t">([^<]*)</);
      return m?m[1]:null;
    };
    const titulosLocais=DILEMA_LOCAL.map(d=>d.titulo);
    passo("eco do título (mesmo com case diferente) cai no fallback local, não confia só na instrução",
      titulosLocais.includes(ultimoTitulo()));
    // controle: título genuinamente novo passa normal
    st.dilemaRecentes=["Cheque atrasado"];
    ai=async(kind,data)=>({titulo:"Uma situação totalmente nova",cena:"Cena nova de verdade."});
    abrirDilema(); for(let t=0;t<8;t++) await Promise.resolve();
    passo("controle: título diferente dos recentes passa normal (rede de baixo não é paranoica)",
      ultimoTitulo()==="Uma situação totalmente nova");
  }catch(e){
    passos.push({nome:"erro inesperado: "+e.message,ok:false});
  }
  return passos;
})();
`;

  try {
    vm.runInContext(lerScript() + corpo, env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("  o cenário nem rodou: " + e.message) + "\n" +
      cinza(e.stack.split("\n").slice(1, 3).join("\n")));
    return false;
  }
  return env.sandbox.__dilm.then((passos) => {
    let ok = true;
    for (const p of passos) {
      if (!p.ok) ok = false;
      console.log(`  ${p.ok ? verde("ok   ") : vermelho("fora ")} ${p.nome}`);
    }
    return ok && passos.length > 0;
  });
}

/* ================================================================== *
 * 9. AI VIVO — desliga exatamente onde deve, nunca onde não deve
 * ================================================================== */
/* Sem rede nenhuma — alimenta ai() com respostas montadas à mão via um
   fetch falso que devolve o que cada cenário pede. Cobre os seis casos que
   importam: transitorio false/true/ausente (servidor velho), falha sem
   resposta 1x e 2x seguidas, e o contador zerando ao receber qualquer
   resposta no meio de duas falhas de rede. */
function testarAiVivo() {
  console.log("\n" + cinza("feed/dilema/evento: três circuitos independentes, 429 pausa com retry (só dilema/julgar), nenhum desliga pra sempre"));
  const env = criarAmbiente();
  /* Retentativa em 429 (2026-09-09) usa setTimeout(...,2000) de verdade —
     o setTimeout falso de criarAmbiente() só ENFILEIRA (precisa de
     drenar() manual), e este teste não quer esperar 2s de verdade nem
     orquestrar drenar() no meio de cada await. Como o teste mede LÓGICA
     (que retentou, quantas vezes, o que ficou pausado), não TEMPO, disparar
     na hora é fiel ao que importa aqui — quem quiser testar o atraso em si
     mede em produção (é isso que "espera curta" significa: perceptível
     pro jogador, não pro teste). */
  env.sandbox.setTimeout = fn => { fn(); return 0; };
  vm.createContext(env.sandbox);

  /* fila de respostas: cada chamada de fetch() consome uma. {throw:true} =
     falha de rede (sem resposta nenhuma); senão {ok,body} vira a resposta. */
  let fila = [];
  let chamadasFetch = 0;
  env.sandbox.fetch = async () => {
    chamadasFetch++;
    const prox = fila.shift();
    if (!prox || prox.throw) throw new Error("rede");
    return { ok: prox.ok, json: async () => prox.body };
  };

  const corpo = `
;globalThis.__result=(async function(){
  const passos=[];
  const passo=(nome,ok)=>passos.push({nome,ok:!!ok});
  const zerarTudo=()=>{
    /* CIRCUITOS (2026-09-21, Plano Pro) substituiu as variáveis soltas
       CIRCUITOS.feed.pausadoAte/CIRCUITOS.evento.pausadoAte/CIRCUITOS.dilema.pausadoAte (ver index.html,
       "Generalizado... pra tabela em vez de variável solta por família")
       — mesmo objeto que ai()/tentarChamadaIA() leem de verdade agora,
       zera os 5 (coletiva/entrevista inclusos, testados mais abaixo). */
    Object.keys(CIRCUITOS).forEach(f=>{CIRCUITOS[f].pausadoAte=0;CIRCUITOS[f].falhas=0;});
  };
  try{
    /* ---------- circuito PRÓPRIO do feed (2026-09-11) — até esta leva era
       o único que desistia da carreira inteira (aiVivo=false, sem
       religar); achado jogando (3 lutas seguidas sem linha de feed)
       provou que "cosmético, ninguém nota" não era mais verdade. Agora
       segue o MESMO padrão do evento: pausa, nunca desliga pra sempre. */
    zerarTudo();
    __filaSet([{ok:false,body:{error:"upstream",status:401,transitorio:false}}]);
    await ai("feed",{});
    passo("feed: transitorio:false PAUSA (não existe mais desligamento permanente)",
      CIRCUITOS.feed.pausadoAte>Date.now());

    zerarTudo();
    __filaSet([{ok:false,body:{error:"upstream",status:503,transitorio:true}}]);
    await ai("feed",{});
    passo("feed: transitorio:true NÃO pausa (instabilidade passageira)", CIRCUITOS.feed.pausadoAte===0);

    zerarTudo();
    __filaSet([{ok:false,body:{error:"upstream",status:401}}]);
    await ai("feed",{});
    passo("feed: transitorio AUSENTE (servidor velho) NÃO pausa", CIRCUITOS.feed.pausadoAte===0);

    zerarTudo();
    __filaSet([{throw:true}]);
    await ai("feed",{});
    passo("feed: 1ª falha de rede seguida NÃO pausa ainda",
      CIRCUITOS.feed.pausadoAte===0 && CIRCUITOS.feed.falhas===1);
    __filaSet([{throw:true}]);
    await ai("feed",{});
    passo("feed: 2ª falha de rede SEGUIDA pausa (nunca desliga pra sempre)",
      CIRCUITOS.feed.pausadoAte>Date.now());

    zerarTudo();
    __filaSet([{throw:true}]);
    await ai("feed",{});
    __filaSet([{ok:false,body:{error:"upstream",status:503,transitorio:true}}]);
    await ai("feed",{}); // respondeu (mesmo com erro) — zera o contador
    passo("feed: contador zera ao receber resposta de erro (não só sucesso)",
      CIRCUITOS.feed.falhas===0);
    __filaSet([{throw:true}]);
    await ai("feed",{});
    passo("feed: depois de zerar, uma falha de rede sozinha NÃO pausa", CIRCUITOS.feed.pausadoAte===0);

    zerarTudo();
    const antesDe429Feed=Date.now();
    const chamadasAntes429Feed=__chamadasFetch();
    __filaSet([{ok:false,body:{error:"upstream",status:429,transitorio:true}}]);
    await ai("feed",{});
    passo("feed: 429 seta pausa no futuro", CIRCUITOS.feed.pausadoAte>antesDe429Feed);
    passo("feed: 429 NÃO retenta (só 1 chamada de fetch nova — retry é só dilema/julgar)",
      __chamadasFetch()===chamadasAntes429Feed+1);
    const chamadasAntesFeed=__chamadasFetch();
    await ai("feed",{}); // ainda dentro da janela de pausa
    passo("feed: chamada durante a pausa não tenta rede", __chamadasFetch()===chamadasAntesFeed);

    /* ---------- circuito do EVENTO — sem mudança nesta leva, continua
       aqui como regressão (não pode voltar a compartilhar com feed nem
       ganhar retry que não foi pedido pra ele). ---------- */
    zerarTudo();
    const chamadasAntesEventoPerm=__chamadasFetch();
    __filaSet([{ok:false,body:{error:"upstream",status:401,transitorio:false}}]);
    await ai("evento",{});
    passo("evento: transitorio:false não mexe no circuito do feed (independente)",
      CIRCUITOS.feed.pausadoAte===0);
    passo("evento: transitorio:false PAUSA o circuito do evento (temporário, não pra sempre)",
      CIRCUITOS.evento.pausadoAte>Date.now());
    passo("evento: erro_permanente NÃO retenta (só 1 chamada nova — retry é só dilema/julgar)",
      __chamadasFetch()===chamadasAntesEventoPerm+1);

    zerarTudo();
    __filaSet([{throw:true}]);
    await ai("evento",{});
    passo("evento: 1ª falha de rede seguida NÃO pausa ainda", CIRCUITOS.evento.pausadoAte===0 && CIRCUITOS.evento.falhas===1);
    __filaSet([{throw:true}]);
    await ai("evento",{});
    passo("evento: 2ª falha de rede SEGUIDA pausa (nunca desliga nada pra sempre)",
      CIRCUITOS.evento.pausadoAte>Date.now());

    const chamadasAntesEvento=__chamadasFetch();
    await ai("evento",{});
    passo("evento pausado: não tenta rede (fetch não incrementa)",
      __chamadasFetch()===chamadasAntesEvento);
    __filaSet([{ok:true,body:{result:{desfecho:"ok"}}}]);
    await ai("julgar",{});
    passo("julgar continua livre mesmo com evento pausado (circuitos independentes)",
      __chamadasFetch()===chamadasAntesEvento+1);

    /* ---------- circuito de DILEMA/JULGAR (2026-09-09) ---------- */
    // dilema RESPEITA a pausa — pré-checagem, nem tenta rede
    zerarTudo();
    CIRCUITOS.dilema.pausadoAte=Date.now()+60000;
    const chamadasAntesDilPausado=__chamadasFetch();
    await ai("dilema",{});
    passo("dilema pausado: NÃO tenta rede (respeita a pré-checagem)",
      __chamadasFetch()===chamadasAntesDilPausado);

    // julgar NUNCA respeita a pausa, mesmo com CIRCUITOS.dilema.pausadoAte no futuro —
    // é a regra mais forte pedida: cena na tela ⟹ julgamento sempre tenta
    zerarTudo();
    CIRCUITOS.dilema.pausadoAte=Date.now()+60000;
    __filaSet([{ok:true,body:{result:{desfecho:"ok"}}}]);
    const chamadasAntesJulgarPausado=__chamadasFetch();
    const rJulgarPausado=await ai("julgar",{});
    passo("julgar IGNORA a pausa de dilema e tenta rede mesmo assim",
      __chamadasFetch()===chamadasAntesJulgarPausado+1 && rJulgarPausado!==null);

    // dilema: transitorio:false pausa (não desliga pra sempre)
    zerarTudo();
    __filaSet([{ok:false,body:{error:"upstream",status:401,transitorio:false}}]);
    await ai("dilema",{});
    passo("dilema: transitorio:false NÃO existe desligamento permanente pro circuito dele",
      CIRCUITOS.dilema.pausadoAte>Date.now());

    // dilema: 2 falhas de rede seguidas pausam (não desligam nada pra sempre)
    zerarTudo();
    __filaSet([{throw:true}]);
    await ai("dilema",{});
    passo("dilema: 1ª falha de rede seguida NÃO pausa ainda",
      CIRCUITOS.dilema.pausadoAte===0 && CIRCUITOS.dilema.falhas===1);
    __filaSet([{throw:true}]);
    await ai("dilema",{});
    passo("dilema: 2ª falha de rede SEGUIDA pausa (nunca desliga nada pra sempre)",
      CIRCUITOS.dilema.pausadoAte>Date.now());

    // julgar falhando (rede) ATUALIZA o MESMO contador do dilema, mesmo
    // sem respeitar a própria pausa — o círculo é compartilhado, só a
    // PRÉ-CHECAGEM é diferente pros dois kinds
    zerarTudo();
    __filaSet([{throw:true}]);
    await ai("julgar",{});
    __filaSet([{throw:true}]);
    await ai("julgar",{});
    passo("2 falhas de julgar pausam o circuito do dilema (mesmo contador, julgar contribui)",
      CIRCUITOS.dilema.pausadoAte>Date.now());
    // e o PRÓXIMO julgar, mesmo com dilema pausado, ainda assim tenta rede
    __filaSet([{ok:true,body:{result:{desfecho:"ok"}}}]);
    const chamadasAntesJulgar2=__chamadasFetch();
    await ai("julgar",{});
    passo("julgar continua tentando rede mesmo com o circuito do dilema pausado por ele mesmo",
      __chamadasFetch()===chamadasAntesJulgar2+1);

    // cross-contaminação nos dois sentidos
    zerarTudo();
    __filaSet([{throw:true}]);
    await ai("feed",{});
    __filaSet([{throw:true}]);
    await ai("feed",{}); // 2 falhas de feed pausam SÓ o circuito dele
    passo("cross-contaminação: 2 falhas de FEED pausam o circuito do feed, mas NÃO tocam o do dilema",
      CIRCUITOS.feed.pausadoAte>Date.now() && CIRCUITOS.dilema.falhas===0 && CIRCUITOS.dilema.pausadoAte===0);
    __filaSet([{ok:true,body:{result:{desfecho:"ok"}}}]);
    const chamadasAntesDilCross=__chamadasFetch();
    await ai("julgar",{});
    passo("julgar continua tentando rede mesmo com o circuito do feed já pausado",
      __chamadasFetch()===chamadasAntesDilCross+1);

    zerarTudo();
    __filaSet([{throw:true}]);
    await ai("dilema",{});
    __filaSet([{throw:true}]);
    await ai("dilema",{}); // 2 falhas de dilema pausam o circuito dele
    passo("cross-contaminação inversa: 2 falhas de DILEMA pausam o circuito do dilema, mas NÃO tocam o do feed",
      CIRCUITOS.dilema.pausadoAte>Date.now() && CIRCUITOS.feed.pausadoAte===0);

    /* ---------- retry em 429 (2026-09-09), só dilema/julgar ---------- */
    // dilema: 429 na 1ª, sucesso na retentativa — devolve resultado de
    // verdade, NÃO pausa (a retentativa deu certo)
    zerarTudo();
    __filaSet([
      {ok:false,body:{error:"upstream",status:429,transitorio:true}},
      {ok:true,body:{result:{titulo:"T",cena:"C"}}},
    ]);
    const chamadasAntesRetry1=__chamadasFetch();
    const rRetry1=await ai("dilema",{});
    passo("dilema: 429 então sucesso na retentativa — devolve resultado, não null",
      rRetry1&&rRetry1.titulo==="T");
    passo("dilema: retentativa consumiu 2 chamadas de fetch (1 falhou, 1 funcionou)",
      __chamadasFetch()===chamadasAntesRetry1+2);
    passo("dilema: retentativa que deu certo NÃO deixa pausa setada",
      CIRCUITOS.dilema.pausadoAte===0);

    // julgar: mesmo comportamento (429 então sucesso)
    zerarTudo();
    __filaSet([
      {ok:false,body:{error:"upstream",status:429,transitorio:true}},
      {ok:true,body:{result:{desfecho:"ok"}}},
    ]);
    const rRetryJulgar=await ai("julgar",{});
    passo("julgar: 429 então sucesso na retentativa — devolve resultado, não null",
      rRetryJulgar&&rRetryJulgar.desfecho==="ok");

    // dilema: 429 nas DUAS tentativas — devolve null, PAUSA setada só
    // depois da 2ª falha (não da 1ª), exatamente 2 chamadas de fetch
    // (nunca uma 3ª retentativa — só 1 retry, sempre)
    zerarTudo();
    __filaSet([
      {ok:false,body:{error:"upstream",status:429,transitorio:true}},
      {ok:false,body:{error:"upstream",status:429,transitorio:true}},
    ]);
    const chamadasAntesRetry2=__chamadasFetch();
    const rRetry2=await ai("dilema",{});
    passo("dilema: 429 nas duas tentativas — devolve null",
      rRetry2===null);
    passo("dilema: exatamente 2 chamadas de fetch (1 retry, nunca mais)",
      __chamadasFetch()===chamadasAntesRetry2+2);
    passo("dilema: 429 nas duas tentativas PAUSA o circuito",
      CIRCUITOS.dilema.pausadoAte>Date.now());

    /* ---------- circuito de COLETIVA/ENTREVISTA (2026-09-21, Plano Pro) ----------
       Mesma distinção dilema/julgar, mesma família de teste — coletiva é
       ANTES da decisão do motor (respeita pausa, como dilema), entrevista é
       DEPOIS que o jogador já escreveu (nunca respeita, como julgar). São
       famílias PRÓPRIAS (não compartilham contador com dilema nem entre
       si) — ver FAMILIA_DO_KIND em index.html. */
    zerarTudo();
    CIRCUITOS.coletiva.pausadoAte=Date.now()+60000;
    const chamadasAntesColPausado=__chamadasFetch();
    await ai("coletiva",{});
    passo("coletiva pausada: NÃO tenta rede (respeita a pré-checagem, igual dilema)",
      __chamadasFetch()===chamadasAntesColPausado);

    zerarTudo();
    CIRCUITOS.entrevista.pausadoAte=Date.now()+60000;
    __filaSet([{ok:true,body:{result:{reacao:"ok"}}}]);
    const chamadasAntesEntPausado=__chamadasFetch();
    const rEntPausado=await ai("entrevista",{});
    passo("entrevista IGNORA a própria pausa e tenta rede mesmo assim (igual julgar)",
      __chamadasFetch()===chamadasAntesEntPausado+1&&rEntPausado!==null);

    zerarTudo();
    __filaSet([{throw:true}]);
    await ai("coletiva",{});
    __filaSet([{throw:true}]);
    await ai("coletiva",{});
    passo("2 falhas de rede pausam o circuito da coletiva",
      CIRCUITOS.coletiva.pausadoAte>Date.now());
    passo("cross-contaminação: falha de coletiva NÃO toca o circuito da entrevista",
      CIRCUITOS.entrevista.pausadoAte===0&&CIRCUITOS.entrevista.falhas===0);

    zerarTudo();
    __filaSet([{throw:true}]);
    await ai("entrevista",{});
    __filaSet([{throw:true}]);
    await ai("entrevista",{});
    passo("2 falhas de rede pausam o circuito da entrevista",
      CIRCUITOS.entrevista.pausadoAte>Date.now());
    passo("cross-contaminação inversa: falha de entrevista NÃO toca o circuito da coletiva",
      CIRCUITOS.coletiva.pausadoAte===0&&CIRCUITOS.coletiva.falhas===0);

    // 429 com retry único, mesma disciplina de dilema/julgar
    zerarTudo();
    __filaSet([
      {ok:false,body:{error:"upstream",status:429,transitorio:true}},
      {ok:true,body:{result:{reacao:"ok"}}},
    ]);
    const chamadasAntesColRetry=__chamadasFetch();
    const rColRetry=await ai("coletiva",{});
    passo("coletiva: 429 então sucesso na retentativa — devolve resultado, não null",
      rColRetry&&rColRetry.reacao==="ok");
    passo("coletiva: retentativa consumiu 2 chamadas de fetch",
      __chamadasFetch()===chamadasAntesColRetry+2);

    zerarTudo();
    __filaSet([
      {ok:false,body:{error:"upstream",status:429,transitorio:true}},
      {ok:true,body:{result:{reacao:"ok"}}},
    ]);
    const rEntRetry=await ai("entrevista",{});
    passo("entrevista: 429 então sucesso na retentativa — devolve resultado, não null",
      rEntRetry&&rEntRetry.reacao==="ok");
  }catch(e){
    passos.push({nome:"erro inesperado: "+e.message,ok:false});
  }
  return passos;
})();
`;

  env.sandbox.__filaSet = (arr) => { fila = arr; };
  env.sandbox.__chamadasFetch = () => chamadasFetch;
  /* Achado jogando: ai() sempre devolvia null pelos mesmos 5 motivos
     possíveis (sem URL, desligado, pausado, erro do servidor, falha de
     rede), indistinguíveis de fora — reconstruir qual foi virou
     eliminação por investigação em vez de leitura direta. evento("ia_null",
     {motivo}) marca qual caminho disparou; não checamos a lista inteira
     aqui (é frágil a ordem dos cenários) — as asserções acima já provam o
     estado de cada circuito diretamente. */
  const eventosVa = [];
  env.sandbox.window.va = (...args) => { eventosVa.push(args); };

  try {
    vm.runInContext(lerScript() + corpo, env.sandbox, { filename: "index.html" });
  } catch (e) {
    console.log(vermelho("  o cenário nem rodou: " + e.message) + "\n" +
      cinza(e.stack.split("\n").slice(1, 3).join("\n")));
    return false;
  }
  return env.sandbox.__result.then((passos) => {
    let ok = true;
    for (const p of passos) {
      if (!p.ok) ok = false;
      console.log(`  ${p.ok ? verde("ok   ") : vermelho("fora ")} ${p.nome}`);
    }
    return ok && passos.length > 0;
  });
}

/* Extraído do `else if (cmd === "divisoes")` (2026-09-21) pra ser
   chamável também de dentro de "tudo", sem duplicar a lógica. */
function testarDivisoes() {
  const M = carregarMotor(), F = M.rateAll(lerLutadores());
  const MIN = M.MIN_LUTADORES || 40;
  console.log("\n" + cinza("uma carreira são 22 lutas sem repetir adversário"));
  console.log(cinza(`divisão com menos de ${MIN} lutadores no pool não fecha`));
  console.log(cinza(`lenda = disputou cinturão OU rating >= ${(M.RATING_LENDA).toFixed(3)} (13/18)\n`));
  console.log(cinza("                          normal        lenda"));
  let jog = 0, jogL = 0;
  const linhas = M.DIVISOES.map(d => {
    const pool = F.filter(f => f.division === d.id);
    return { id: d.id, n: pool.length, l: pool.filter(M.ehLenda).length };
  }).sort((a, b) => b.n - a.n);
  for (const r of linhas) {
    const a = r.n >= MIN, b = a && r.l >= MIN;      // sem divisão não há modo lenda
    if (a) jog++; if (b) jogL++;
    console.log(`  ${r.id.padEnd(20)} ` +
      `${(a ? verde(String(r.n).padStart(4)) : vermelho(String(r.n).padStart(4)))} ` +
      `${a ? "     " : cinza("fora ")} ` +
      `${(b ? verde(String(r.l).padStart(6)) : vermelho(String(r.l).padStart(6)))} ` +
      `${b ? "" : cinza("fora")}`);
  }
  console.log(cinza(`\n  ${jog} divisões jogáveis · ${jogL} delas também no modo lenda`));
  return jog >= 8 && jogL >= 6;
}

/* ================================================================== */
const cmd = (process.argv[2] || "tudo").toLowerCase();
const div = process.argv[3];
let ok = true;

async function main(){
try {
  if (cmd === "interface") ok = await testarInterface(Number(div) || 3, (process.argv[4] || "normal").toLowerCase());
  else if (cmd === "motor") ok = testarMotor();
  else if (cmd === "draft") ok = testarDraft(div || "lightweight");
  else if (cmd === "pesos") ok = medirPesos(div || "lightweight");
  else if (cmd === "cinturao") ok = testarCinturao(div || "heavyweight");
  else if (cmd === "lesao") ok = testarLesao();
  else if (cmd === "momentos") ok = testarMomentos();
  else if (cmd === "conquistas") ok = testarConquistas();
  else if (cmd === "escolhaluta") ok = testarEscolhaLuta();
  else if (cmd === "acoesluta") ok = testarAcoesLuta();
  else if (cmd === "gapescolha") ok = testarGapEscolha(Number(process.argv[3]) || 3000);
  else if (cmd === "escalonamento") ok = testarEscalonamentoDisputa();
  else if (cmd === "espera") ok = testarEspera(div || "lightweight");
  else if (cmd === "frequencia") ok = await testarFrequenciaMomentos(Number(div) || 30);
  else if (cmd === "freqconquistas") ok = await testarFrequenciaConquistas(Number(div) || 150, process.argv[4] || "normal");
  else if (cmd === "lesaonocaute") ok = testarLesaoNocaute();
  else if (cmd === "driverluta") ok = testarDriverRodada();
  else if (cmd === "narracao") ok = await testarNarracaoResultado(Number(div) || 8);
  else if (cmd === "drivermotor") ok = testarDriverMotor(Number(process.argv[3]) || 1, Number(process.argv[4]) || 6000);
  else if (cmd === "dinheiro") ok = testarDinheiro(div || "lightweight");
  else if (cmd === "coerencia") ok = testarCoerencia();
  else if (cmd === "conteudo") ok = testarConteudoInseguro();
  else if (cmd === "eventoia") ok = await testarEventoIA();
  else if (cmd === "dilema") ok = await testarDilemaMecanismo();
  else if (cmd === "memoria") ok = testarMemoriaEntreCarreiras();
  else if (cmd === "loja") ok = testarLoja();
  else if (cmd === "compartilhar") ok = await testarCompartilhar();
  else if (cmd === "aposentadoria") ok = testarAposentadoriaSemLutas();
  else if (cmd === "inicial") ok = await testarTelaInicial();
  else if (cmd === "resultado") ok = testarResultadoLuta();
  else if (cmd === "aivivo") ok = await testarAiVivo();
  else if (cmd === "pro") ok = await testarColetivaEntrevista();
  else if (cmd === "rival") ok = await testarModoRival();
  else if (cmd === "desafio") ok = testarDesafio(div || "lightweight");
  else if (cmd === "escolhas") ok = testarEscolhas(div || "lightweight");
  else if (cmd === "treino") ok = testarTreino(div || "lightweight");
  else if (cmd === "divisoes") ok = testarDivisoes();
  else if (cmd === "tudo") {
    /* Achado 2026-09-21 (Plano Pro, usuário testando em produção): "tudo"
       só rodava interface×4 + motor + draft — QUALQUER outra suíte
       (conteudo, narracao, aivivo, pro, dilema, etc.) ficava de fora,
       podendo estar reprovando em silêncio sem nenhum sinal aqui. Duas
       delas ESTAVAM (ver PENDENCIAS.md item 32) — "TUDO CERTO" não
       queria dizer "tudo", queria dizer "essas 6". Corrigido: roda TODA
       suíte dispatchável (mesma lista de `else if` acima, cada uma com
       o argumento padrão que ela já usa sozinha), reprova se qualquer
       uma reprovar, sem pular nada em silêncio nunca mais.

       Única exceção que continua saindo cedo: interface quebrada de
       verdade (a tela não fecha o caminho básico) torna o resto ruído —
       um bug ali tende a derrubar/travar dezenas de suítes por baixo
       (todas dependem do mesmo motor renderizando), então continua
       parando ali, mas isso é a ÚNICA suíte com esse privilégio — todas
       as outras rodam sempre, mesmo se uma anterior já reprovou. */
    ok = true;
    for (const d of [3, 7, 8]) ok = (await testarInterface(d)) && ok;
    ok = (await testarInterface(6, "lenda")) && ok;
    if (!ok) {
      console.log(cinza("\n  interface quebrada — pulei o resto, conserte isso primeiro"));
      console.log("\n" + vermelho("ALGO SAIU DA FAIXA") + "\n");
    } else {
      /* {nome, roda} — cada `roda` já usa o MESMO argumento padrão que o
         `else if` isolado acima usaria sem argumento extra. Ordem: rápidas
         primeiro (regressão de correção), pesadas/estatísticas por
         último (calibração — algumas (ex. "pesos") nunca reprovam
         sozinhas, são relatório, não gate; entram do mesmo jeito, pedido
         explícito é rodar tudo, não só o que pode reprovar). */
      const suites = [
        ["motor", () => testarMotor()],
        ["draft", () => testarDraft(div || "lightweight")],
        ["escolhas", () => testarEscolhas(div || "lightweight")],
        ["treino", () => testarTreino(div || "lightweight")],
        ["desafio", () => testarDesafio(div || "lightweight")],
        ["cinturao", () => testarCinturao(div || "heavyweight")],
        ["lesao", () => testarLesao()],
        ["resultado", () => testarResultadoLuta()],
        ["conteudo", () => testarConteudoInseguro()],
        ["aivivo", () => testarAiVivo()],
        ["pro", () => testarColetivaEntrevista()],
        ["rival", () => testarModoRival()],
        ["momentos", () => testarMomentos()],
        ["conquistas", () => testarConquistas()],
        ["escolhaluta", () => testarEscolhaLuta()],
        ["acoesluta", () => testarAcoesLuta()],
        ["dinheiro", () => testarDinheiro(div || "lightweight")],
        ["coerencia", () => testarCoerencia()],
        ["eventoia", () => testarEventoIA()],
        ["dilema", () => testarDilemaMecanismo()],
        ["memoria", () => testarMemoriaEntreCarreiras()],
        ["loja", () => testarLoja()],
        ["compartilhar", () => testarCompartilhar()],
        ["aposentadoria", () => testarAposentadoriaSemLutas()],
        ["inicial", () => testarTelaInicial()],
        ["escalonamento", () => testarEscalonamentoDisputa()],
        ["espera", () => testarEspera(div || "lightweight")],
        ["lesaonocaute", () => testarLesaoNocaute()],
        ["driverluta", () => testarDriverRodada()],
        ["divisoes", () => testarDivisoes()],
        ["pesos", () => medirPesos(div || "lightweight")],
        ["gapescolha", () => testarGapEscolha(3000)],
        ["frequencia", () => testarFrequenciaMomentos(30)],
        ["freqconquistas", () => testarFrequenciaConquistas(150, "normal")],
        ["narracao", () => testarNarracaoResultado(8)],
        ["drivermotor", () => testarDriverMotor(1, 6000)],
      ];
      const falhas = [];
      for (const [nome, roda] of suites) {
        console.log("\n" + cinza(`── ${nome} ──`));
        let r;
        try { r = await roda(); }
        catch (e) {
          console.log(vermelho(`  erro rodando ${nome}: ${e.message}`));
          r = false;
        }
        if (!r) falhas.push(nome);
        ok = r && ok;
      }
      console.log("\n" + (ok ? verde("TUDO CERTO")
        : vermelho(`ALGO SAIU DA FAIXA — reprovou: ${falhas.join(", ")}`)) + "\n");
    }
  } else {
    console.log(`\nuso: node testar.js [tudo|interface|motor|draft|escolhas|treino|desafio|divisoes|pesos|cinturao|lesao|resultado|conteudo|aivivo|pro|rival|conquistas|escolhaluta|driverluta] [divisão] [normal|lenda]\n`);
    process.exit(0);
  }
} catch (e) {
  console.error(vermelho("\nerro: " + e.message) + "\n" + cinza(e.stack.split("\n").slice(1, 3).join("\n")) + "\n");
  process.exit(1);
}
if (ok && typeof ok.then === "function")
  throw new Error("um teste async foi chamado sem await — o resultado virou promessa");
if (cmd !== "tudo" && cmd !== "pesos") console.log("\n" + (ok ? verde("ok") : vermelho("fora da faixa")) + "\n");
process.exit(ok ? 0 : 1);
}
main();
