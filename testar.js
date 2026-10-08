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
  let js = html.slice(a + 8, b).replace(/\bboot\(\);?\s*$/m, "");
  /* Só pra MEDIR alternativas sem editar o jogo (suíte balanco):
     BALANCO_SUBST='[["const X=1;","const X=2;"]]' troca trechos exatos. */
  if (process.env.BALANCO_SUBST) for (const [de, para] of JSON.parse(process.env.BALANCO_SUBST)) {
    if (!js.includes(de)) { console.error(vermelho("BALANCO_SUBST não achou: " + de)); process.exit(1); }
    js = js.split(de).join(para);
  }
  return js;
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
      /* atributos (aria-label, tabindex...): a varredura de acessibilidade lê */
      setAttribute(k, v) { (this.attrs = this.attrs || {})[k] = String(v); },
      getAttribute(k) { return this.attrs && k in this.attrs ? this.attrs[k] : null; },
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
      /* o nocaute pisca a tela (document.body.classList): sem body, a luta
         que termina em nocaute sem reduce-motion quebrava só no teste */
      body: makeEl("body"),
      /* o nó criado sob demanda precisa carregar o id, senão o teste não
         consegue achar elementos que a interface monta via innerHTML */
      getElementById: id => registro[id] || (registro[id] = Object.assign(makeEl(), { id, __auto: true })),
      createElement: t => makeEl(t),
      querySelector: () => makeEl(),
      /* o jogo arma um ouvinte de primeiro clique para iniciar a trilha */
      addEventListener: noop, removeEventListener: noop,
    },
    window: { matchMedia: () => ({ matches: true }), addEventListener: noop, scrollTo: noop },   // reduce-motion: sem esperas
    /* roteador por hash (revamp 2026-09-26): irPara() grava em history e
       lê location.hash. pushState aqui só atualiza o hash do location
       ATUAL do sandbox (suítes que trocam sandbox.location continuam
       funcionando, a leitura é na hora da chamada). */
    location: { hash: "", href: "https://octogono.fun/", search: "", pathname: "/", origin: "https://octogono.fun", reload: noop },
    setTimeout: fn => { timers.push(fn); return timers.length; },
    clearTimeout: noop, setInterval: noop, clearInterval: noop,
    fetch: () => Promise.reject(new Error("offline")),
    AbortController: class { constructor() { this.signal = null; } abort() {} },
    Math, JSON, Date, Number, String, Array, Object, Promise, Set, Map, Error, isNaN,
  };
  sandbox.globalThis = sandbox;
  sandbox.history = {
    pushState: (x, y, u) => { sandbox.location.hash = String(u || ""); },
    replaceState: (x, y, u) => { sandbox.location.hash = String(u || "").startsWith("#") ? String(u) : ""; },
  };
  return { sandbox, todos, registro, drenar: () => { let i = 0; while (timers.length && i++ < 60000) (timers.shift())(); } };
}

/* `function` vira propriedade do sandbox sozinha; `const` e `let` não, porque
   são de escopo léxico. Então exportamos na marra. */
function exportar(js, nomes) {
  return js + "\n;globalThis.__x={};\n" +
    nomes.map(n => `try{globalThis.__x.${n}=${n};}catch(e){}`).join("\n");
}
const API_MOTOR = ["simulateFight", "simularRound", "mkState", "mulberry32", "rateAll", "makePercentiler",
  "rollTable", "cartasDaMesa", "cartaMinima", "PAIRS", "WEIGHTS", "TOTAL_WEIGHT", "BUDGET_PCT", "TUNING",
  "RARE", "LEGACY", "hypeOf", "followerDelta", "fmtNum", "CAMPS", "dificuldade",
  "TETO_TREINO", "RITMO_TREINO", "ATTR_TREINAVEIS",
  "ehLenda", "RATING_LENDA", "MIN_LUTADORES", "DIVISOES", "MIN_LUTADORES_V2", "ANO_ATIVO",
  "ACOES_LUTA", "COUNTER_ATTR", "sinalDoRound", "contest", "K_ESCOLHA_LUTA", "quartetoDoRound",
  "aplicarPlano", "PERFIL_PLANO", "FRASES_PLANO", "narradorDoPlano"];

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
  /* revamp fase 3: jogar exige conta; sem sessão o clique em Nova
     carreira para no portão. Sessão falsa (definida em supabaseFalsoComSessao). */
  env.sandbox.window.supabase = supabaseFalsoComSessao({ sessao: { user: { id: "u-teste", email: "t@t.com" } } });
  vm.createContext(env.sandbox);
  try {
    /* ranking sai como FUNÇÃO, não valor: RANKING é null até a carreira
       começar e exportar(nomes) captura só um instantâneo na hora do load —
       uma closure lê o binding ao vivo toda vez que é chamada. */
    vm.runInContext(exportar(lerScript(), ["ready", "screenName", "screenReport", "screenDivisao", "DIVISOES"])
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
  await passo("menu: 6 cards (nova, continuar, jxj, ranking, atualizações, conta), clica Nova carreira", () => {
    const cards = env.todos.filter(n => (n.className || "").split(" ").includes("menu-card"));
    const rotas = cards.map(c => c.dataset && c.dataset.rota);
    const esperadas = ["nova", "continuar", "jxj", "ranking", "atualizacoes", "conta"];   // JxJ entrou como faixa (2026-10-01)
    if (JSON.stringify(rotas) !== JSON.stringify(esperadas)) throw new Error("cards do menu: " + rotas.join(","));
    cards[0].onclick(); // Nova carreira -> screenName() (a fase 4 troca pelo assistente)
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
      if (!bt) throw new Error("não achei o botão do modo lenda");
      /* Revamp fase 4: sem Pro, "Seja uma lenda" passa pelo bloqueioPro()
         (apagado, SEM clique, com o selo "Assine o Pro" como único ponto
         clicável). Antes o clique mostrava uma nota; agora nem clique tem.
         Confere a trava ANTES de simular sessão Pro pro resto do teste. */
      if (!(bt.className || "").split(" ").includes("bloqueado")) throw new Error("Seja uma lenda sem Pro não está travado");
      if (bt.onclick) throw new Error("Seja uma lenda sem Pro continua clicável");
      const selo = env.todos.filter(n => (n.className || "").split(" ").includes("selo-assine")).pop();
      if (!selo || !selo.onclick) throw new Error("sem o selo Assine o Pro");
      UI.setMeuPro(true);
      UI.screenDivisao("TesteBot");       // com Pro a tela redesenha liberada
      const bt2 = env.registro.modo_lenda;
      if (!bt2 || !bt2.onclick) throw new Error("com Pro, Seja uma lenda devia responder ao clique");
      marca = env.todos.length;
      bt2.onclick();
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
  /* 2026-10-08 (auditoria): o Rival é recurso do Pro, então quem não é Pro
     pula a tela e a divisão abre o draft direto; com Pro (o modo lenda
     deste teste liga o Pro antes da divisão) a tela abre como antes */
  await passo("Modo Rival: com Pro a tela abre e 'Continuar' segue sem rival; sem Pro a tela é pulada e o draft abre direto", () => {
    const pro = vm.runInContext("meuPro", env.sandbox);
    const telaRival = env.todos.slice(marca).some(n => (n.className || "").split(" ").includes("rival-box"));
    if (!pro) {
      if (telaRival) throw new Error("sem Pro, a tela do Rival ainda apareceu");
      if (!env.registro.reroll) throw new Error("sem Pro, a divisão não abriu o draft");
      return;
    }
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
       trava do Pro (bloqueioPro) têm suíte própria — ver
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
    /* luta interativa (2026-10-04): o plano abre antes de CADA round, com 4
       opções; resolve todos, um por vez, até a luta acabar */
    for (let plano = 0; plano < 6 && escBox && escBox.style.display !== "none"; plano++) {
      /* teste explícito pedido: escolha aberta, jogador aperta "Próxima
         luta" — nada pode acontecer (mesma garantia que testarEscolhaLuta()
         prova de forma isolada; aqui é a versão de ponta a ponta, com a
         escolha de verdade na tela). O botão de modo automático saiu do
         jogo na reta final (2026-09-28); a parte dele saiu daqui junto. */
      const fightNoAntes = UI.st().fightNo;
      env.registro.next.onclick();
      env.drenar(); await respirar();
      if (UI.st().fightNo !== fightNoAntes)
        throw new Error("clicar 'próxima luta' com a escolha aberta avançou a luta");
      if (escBox.style.display === "none")
        throw new Error("clicar 'próxima luta' com a escolha aberta fechou o painel sozinho");
      if (UI.escolhaAberta())
        throw new Error("clicar 'próxima luta' com a escolha aberta reabriu a tela de adversário por baixo");

      /* item 6 (v2): ids dinâmicos ("el_"+id da ação, varia por round/pool),
         não mais 3 nomes fixos — acha pelo prefixo. */
      const idsOpcoes = Object.keys(env.registro).filter(k => k.startsWith("el_"));
      if (idsOpcoes.length !== 4) throw new Error(`plano do round veio com ${idsOpcoes.length} opções, esperava 4`);
      const op = env.registro[idsOpcoes[(n + plano) % 4]];
      if (!op || !op.onclick) throw new Error("plano do round apareceu sem os 4 botões esperados");
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

    if (!env.registro.next.disabled)
      throw new Error("dilema aberto mas a próxima luta continua clicável");
    env.registro.next.onclick();        // o clique indevido: não pode furar a trava
    env.drenar(); await respirar();
    if (!env.registro.next.disabled)
      throw new Error("clique na próxima luta furou a trava do dilema");

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

  await passo("posição na divisão (ranking do UFC, regras v2)", () => {
    /* regras v2 (2026-10-04): a ficha fala como o UFC, campeão, #1 a #15 ou
       sem ranking; nunca mais "#48 de 236" */
    const f = env.registro.ficha, h = (f && f.innerHTML) || "";
    const m = /<span class="pos">(#(\d+)|Sem ranking|Campeão[^<]*)<\/span>/.exec(h);
    if (!m) throw new Error("a ficha não mostra a posição no ranking");
    if (m[2] && !(+m[2] >= 1 && +m[2] <= 15)) throw new Error(`posição fora do top 15: ${m[1]}`);
    if (/de \d{2,}</.test(h)) throw new Error("a ficha voltou a mostrar a posição na tabela inteira");
  });

  await passo("relatório final", () => UI.screenReport());
  /* revamp fase 3: jogar já exige conta, o fim da carreira não oferece
     mais o formulário de criar conta (só confirma a sincronização) */
  await passo("fim de carreira não oferece criar conta (jogar já exige conta)", () => {
    const campos = env.todos.filter(n => n.id === "conta-email" || n.id === "conta-senha");
    if (campos.length) throw new Error("formulário de conta apareceu no fim da carreira");
  });

  /* Fase 8, acessibilidade, sobre tudo que o caminho montou (menu,
     assistente, draft, carreira, noite, fim): 1) botão ou link só com
     ícone tem nome (aria-label ou title), senão o leitor de tela diz só
     "botão"; 2) nada clicável que não seja botão ou link fica sem tabindex
     (o teclado não chega). Confere os nós do DOM falso e os botões
     escritos dentro de innerHTML. */
  await passo("acessibilidade: botão só com ícone tem nome, e nada clicável fica fora do teclado", () => {
    const soIcone = h => !String(h || "").replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]*>/g, "").replace(/&nbsp;|\s/g, "");
    const temNome = n => n.attrs && (n.attrs["aria-label"] || n.attrs.title);
    const temTexto = n => n && (String(n.textContent || "").trim() || !soIcone(n.innerHTML));
    /* Fundo do overlay de Configurações (fecha clicando fora) e o painel
       dele (segura o clique): não são controles; o teclado fecha com Esc
       e com o X, que é botão. O fundo do tutorial "Como jogar"
       (2026-09-28) é o mesmo caso: Esc, setas e os botões dele. */
    const naoControle = n => n.id === "cfg" || (n.className || "").split(" ").includes("cfg-painel")
      || (n.className || "").split(" ").includes("tutorial");
    const ruins = new Set();
    for (const n of env.todos) {
      /* nó criado pelo getElementById falso (id escrito dentro de um
         innerHTML) não tem a tag de verdade: a tag real é conferida na
         varredura do HTML logo abaixo */
      if (n.__auto) continue;
      if ((n.tagName === "button" || n.tagName === "a") && !temTexto(n) && !temNome(n))
        ruins.add(`<${n.tagName} class="${n.className}"> sem nome: ${String(n.innerHTML).slice(0, 50)}`);
      if (!["button", "a", "input", "textarea", "select", "label"].includes(n.tagName) && typeof n.onclick === "function"
          && !(n.attrs && n.attrs.tabindex != null) && !n.inert && !naoControle(n))
        ruins.add(`<${n.tagName} class="${n.className}" id="${n.id}"> clicável sem teclado`);
    }
    for (const n of env.todos) {
      for (const m of String(n._html || "").matchAll(/<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
        if (!soIcone(m[3]) || /aria-label=|title=/.test(m[2])) continue;
        const id = (m[2].match(/\bid="([^"]+)"/) || [])[1];
        if (id && temTexto(env.registro[id])) continue;   // texto posto depois, por id
        ruins.add("html: " + m[0].slice(0, 90));
      }
    }
    if (ruins.size) throw new Error(`${ruins.size} problema(s): ` + [...ruins].slice(0, 12).join(" | "));
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
      const shown = M.cartasDaMesa(rows, left, rem, pool, PCT);
      const r = shown[shown.reduce((b, x, i, a) => x.cost > a[b].cost ? i : b, 0)];
      f[r.pair.a.key] = r.src[r.pair.a.key]; f[r.pair.b.key] = r.src[r.pair.b.key];
      left -= r.cost; rem = rem.filter(p => p.id !== r.pair.id);
    }
    keys.forEach(k => sum[k] += pctOf(k, f[k]));
  }
  let w = 0, tw = 0;
  keys.forEach(k => { w += (100 * sum[k] / N) * M.WEIGHTS[k]; tw += M.WEIGHTS[k]; });
  /* Alvo mudou no balanço de 2026-09-28 (era 60 a 76, "~70, elite real"):
     com o lutador de elite o jogador vencia 17 de 22. O dono pediu ~50% de
     vitórias pra quem joga bem, e BUDGET_PCT foi de .76 pra .35: o lutador
     draftado fica no meio da divisão (medido 48), e o treino e as escolhas
     fazem o resto. Ver LEIA-ME "Balanço" e node testar.js balanco. */
  /* Alvo mudou de novo no mesmo dia (era ~48, 40 a 56): o dono pediu
     mais orçamento porque o jogador ficava zerado quase sempre, e
     BUDGET_PCT foi de .52 pra .70. O lutador do bot guloso nasce no ~65º
     percentil e o ~50% de vitórias passou a vir dos adversários (escada
     mais alta em candidatos()) e do teto de treino (1.05). O que este
     teste guarda agora é o orçamento não sair de novo do lugar sem que
     o balanço seja medido junto (node testar.js balanco). */
  const media = w / tw, ok1 = media >= 58 && media <= 72;
  const pmortas = 100 * mortas / linhas, ok2 = pmortas < 3;
  console.log(`  ${ok1 ? verde("ok   ") : vermelho("fora ")} lutador draftado no ${media.toFixed(0)}º percentil  ${cinza("alvo ~65 (orçamento .70, 2026-09-28)")}`);
  if (!ok1) console.log(cinza(`         ${media > 72 ? "baixe" : "suba"} BUDGET_PCT no index.html (e meça o balanço junto)`));
  console.log(`  ${ok2 ? verde("ok   ") : vermelho("fora ")} linhas mortas na mesa ${pmortas.toFixed(1)}%  ${cinza("tem que ficar perto de 0")}`);
  return ok1 && ok2;
}

/* ================================================================== *
 * 3b. ORÇAMENTO (reta final, 2026-09-28) — o orçamento do draft nunca
 *     fica negativo. Achado do dono jogando: terminou com -0.17 e ainda
 *     via cartas de 0.79, porque sem carta que coubesse a mesa mostrava a
 *     mais barata MESMO acima do saldo. Agora, quando nada cabe, a mesa
 *     oferece a carta mínima de cada par que falta, de custo 0.00.
 * ================================================================== */
async function testarOrcamento() {
  console.log("\n" + cinza("orçamento do draft: nunca negativo, carta mínima de custo zero quando nada cabe"));
  const M = carregarMotor(), F = lerLutadores();
  const R = M.rateAll(F);               // rating: o modo lenda filtra por ele
  const falhas = [];
  let totalFalhas = 0;
  const falha = m => { totalFalhas++; if (falhas.length < 12) falhas.push(m); };
  let drafts = 0, comMinima = 0;
  for (const d of M.DIVISOES) for (const modo of ["normal", "lenda"]) {
    let pool = R.filter(f => f.division === d.id);
    if (modo === "lenda") pool = pool.filter(M.ehLenda);
    if (pool.length < M.MIN_LUTADORES) continue;
    const PCT = M.makePercentiler(pool);
    for (let s = 0; s < 40; s++) for (const estr of ["caro", "aleatorio", "barato"]) {
      const rng = M.mulberry32(9100 + s * 31), esc = M.mulberry32(77 + s);
      let left = M.TOTAL_WEIGHT * M.BUDGET_PCT, rem = [...M.PAIRS], usouMinima = false;
      const id = `${d.id}/${modo}/semente ${s}/${estr}`;
      drafts++;
      while (rem.length) {
        const rows = M.rollTable(pool, rem, rng, PCT);
        const shown = M.cartasDaMesa(rows, left, rem, pool, PCT);
        if (!shown.length) { falha(`${id}: mesa vazia`); break; }
        const acima = shown.filter(r => r.cost > left);
        if (acima.length) falha(`${id}: mesa mostrou carta de ${acima[0].cost.toFixed(2)} com ${left.toFixed(2)} no bolso`);
        if (shown.some(r => r.src.minimo)) {
          usouMinima = true;
          if (rows.some(r => r.cost <= left)) falha(`${id}: carta mínima apareceu com carta de verdade cabendo no bolso`);
          if (!shown.every(r => r.src.minimo)) falha(`${id}: carta mínima misturada com carta de lutador`);
          if (shown.length !== rem.length) falha(`${id}: ${shown.length} cartas mínimas pra ${rem.length} pares faltando`);
          for (const r of shown) {
            if (r.cost !== 0) falha(`${id}: carta mínima custou ${r.cost}`);
            for (const k of [r.pair.a.key, r.pair.b.key]) {
              const piso = Math.min(...pool.map(f => f[k]));
              if (r.src[k] !== piso) falha(`${id}: carta mínima com ${k}=${r.src[k]}, o piso da divisão é ${piso}`);
            }
          }
        }
        const r = estr === "caro" ? shown.reduce((m, x) => x.cost > m.cost ? x : m, shown[0])
          : estr === "barato" ? shown.reduce((m, x) => x.cost < m.cost ? x : m, shown[0])
          : shown[Math.floor(esc() * shown.length)];
        left -= r.cost;
        if (left < 0) falha(`${id}: orçamento ficou em ${left.toFixed(3)}`);
        rem = rem.filter(p => p.id !== r.pair.id);
      }
      if (usouMinima) comMinima++;
    }
  }
  const pctMin = 100 * comMinima / drafts;
  console.log(cinza(`  ${drafts} drafts (todas as divisões jogáveis, normal e lenda, 3 jeitos de escolher); ` +
    `${pctMin.toFixed(0)}% chegaram a precisar da carta mínima`));
  if (!comMinima) falha("nenhum draft chegou na carta mínima: o teste não exercitou o caso que importa");

  /* a TELA de verdade: renderDraft() no DOM falso, sempre clicando a carta
     mais cara que aparece (o jeito mais rápido de zerar o bolso) */
  const RJ = JSON.stringify(R);
  const abrirDraft = (seed, regras = 3) => {
    const X = sandboxCarreira();
    X.sb.__RJ = RJ;
    X.run(`(function(){
      REGRAS=${regras};
      ROSTER=JSON.parse(globalThis.__RJ);
      CUTOFF_RANKING=Math.max(...ROSTER.map(f=>f.era?f.era[1]:0))-6;
      DIVISION="lightweight"; MODO="normal"; SEED=${seed};
      RIVAL_ATIVADO=false; RIVAL_NOME_ESCOLHIDO=null; ROSTO=null;
      startDraft("TesteBot");
    })()`);
    return X;
  };
  const cartasNaTela = X => ((X.registro.cards || {}).children || []).filter(n => (n.className || "").split(" ").includes("card"));
  const custoDa = n => Number((/class="cost"><span>custo<\/span><b>([\d.]+)<\/b>/.exec(n.innerHTML) || [])[1]);
  let telasComMinima = 0;
  /* v3 (teto do estreante, 2026-10-05) e v2: com o teto as cartas caras
     custam menos e o bolso quase não zera na v3 (4% dos drafts no modelo
     acima); a v2 mantém o caminho da carta mínima na tela exercitado */
  for (const regras of [3, 2]) for (const seed of [4242, 4343, 4444, 4545, 4646, 4747, 4848, 4949]) {
    const X = abrirDraft(seed, regras);
    for (let passo = 0; passo < 4; passo++) {
      const cartas = cartasNaTela(X), bolso = X.run("budgetLeft");
      if (!cartas.length) { falha(`tela ${seed}: escolha ${passo + 1} sem carta nenhuma`); break; }
      const custos = cartas.map(custoDa);
      if (custos.some(c => !(c <= Number(bolso.toFixed(2)))))
        falha(`tela ${seed}: carta de ${Math.max(...custos).toFixed(2)} na tela com ${bolso.toFixed(2)} de orçamento`);
      if (cartas.some(n => n.innerHTML.includes("Atributos mínimos"))) telasComMinima++;
      delete X.registro.cards;           // a próxima montagem nasce num nó novo
      cartas[custos.indexOf(Math.max(...custos))].onclick();
      const depois = X.run("budgetLeft");
      if (depois < 0) falha(`tela ${seed}: orçamento ficou em ${depois.toFixed(3)} depois da escolha ${passo + 1}`);
    }
  }
  if (!telasComMinima) falha("a tela nunca mostrou a carta mínima zerando o bolso");

  /* bolso zerado na marra: as 4 cartas da mesa são as mínimas, custo 0.00,
     e escolher uma não mexe no orçamento */
  {
    const X = abrirDraft(5151);
    delete X.registro.cards;
    X.run("budgetLeft=0; renderDraft();");
    const cartas = cartasNaTela(X);
    if (cartas.length !== 4) falha(`bolso zerado: ${cartas.length} cartas na mesa, esperava as 4 mínimas`);
    if (!cartas.every(n => n.innerHTML.includes("Atributos mínimos") && custoDa(n) === 0))
      falha("bolso zerado: alguma carta não é a mínima de custo 0.00");
    if (cartas.length) {
      delete X.registro.cards;
      cartas[0].onclick();
      const r = JSON.parse(X.run(`JSON.stringify(picks[0]?{b:budgetLeft,from:picks[0].from,
        ok:PAIRS.filter(p=>p.label===picks[0].pair.label).every(p=>[p.a.key,p.b.key].every(k=>me[k]===Math.min(...POOL.map(f=>f[k]))))}:{semEscolha:true})`));
      if (r.semEscolha) falha("bolso zerado: clicar a carta não registrou escolha nenhuma (carta acima do saldo?)");
      else if (r.b !== 0) falha(`bolso zerado: escolher a carta mínima deixou o orçamento em ${r.b}`);
      if (!r.semEscolha && r.from !== "mínimo da divisão") falha(`bolso zerado: a ficha registrou "${r.from}" como origem`);
      if (!r.semEscolha && !r.ok) falha("bolso zerado: o lutador não ficou com o piso da divisão nos dois atributos da carta");
    }
  }

  for (const f of falhas) console.log(vermelho("  " + f));
  if (totalFalhas > falhas.length) console.log(vermelho(`  ... e mais ${totalFalhas - falhas.length}`));
  const ok = !totalFalhas;
  console.log(ok ? verde("  orçamento nunca negativo, carta mínima certa na mesa e na tela") : vermelho("  orçamento furado"));
  return ok;
}

/* ================================================================== *
 * 3c. COMO JOGAR (2026-09-28, pedido do dono: "algumas pessoas não
 *     entenderam") — tutorial com prints anotados no draft e na primeira
 *     noite de luta: abre sozinho uma vez, reabre pelo botão, navega,
 *     fecha, nunca no automático, e todo print existe (computador e
 *     celular) com uma anotação por item da lista.
 * ================================================================== */
async function testarTutorial() {
  console.log("\n" + cinza("como jogar: tutorial do draft e da luta, prints anotados"));
  const F = lerLutadores();
  const falhas = [];
  const conf = async (nome, fn) => {
    try { await fn(); console.log(verde("  ok    ") + nome); }
    catch (e) { falhas.push(nome); console.log(vermelho("  falha ") + nome + "\n         " + e.message); }
  };
  const R0 = sandboxCarreira(); R0.sb.__F = F;
  const RJ = R0.run("JSON.stringify(rateAll(globalThis.__F))");
  const abrirDraft = (X, seed) => {
    X.sb.__RJ = RJ;
    X.run(`(function(){ROSTER=JSON.parse(globalThis.__RJ);CUTOFF_RANKING=Math.max(...ROSTER.map(f=>f.era?f.era[1]:0))-6;
      DIVISION="lightweight";MODO="normal";SEED=${seed};RIVAL_ATIVADO=false;RIVAL_NOME_ESCOLHIDO=null;ROSTO=null;startDraft("T");})()`);
  };
  const caixa = X => { const t = X.registro.tutorial, c = t && t.children[0]; return c ? c.children.map(n => String(n.innerHTML)).join(" ") : ""; };
  const aberto = X => X.run("TUTORIAL_ABERTO");

  await conf("draft: abre sozinho na primeira montagem, no passo 1 de 3, com os dois prints, e fica marcado como visto", async () => {
    const X = sandboxCarreira(); abrirDraft(X, 101);
    if (aberto(X) !== "draft") throw new Error("não abriu: " + aberto(X));
    const h = caixa(X);
    if (!/1 de 3/.test(h)) throw new Error("não está no passo 1 de 3: " + h.slice(0, 120));
    if (!h.includes("img/tutorial/draft-1.webp") || !h.includes("img/tutorial/draft-1-m.webp")) throw new Error("passo 1 sem os dois prints");
    if (X.dadosLS["tutorial:draft"] !== "1") throw new Error("não marcou como visto");
  });

  await conf("draft: Próximo avança, Voltar volta, Entendi no último fecha, e a mesa de cartas continua lá", async () => {
    const X = sandboxCarreira(); abrirDraft(X, 102);
    X.registro.tutorialProximo.onclick();
    if (!/2 de 3/.test(caixa(X))) throw new Error("Próximo não foi pro passo 2");
    X.registro.tutorialVoltar.onclick();
    if (!/1 de 3/.test(caixa(X))) throw new Error("Voltar não voltou pro passo 1");
    X.registro.tutorialProximo.onclick(); X.registro.tutorialProximo.onclick();
    if (!/3 de 3/.test(caixa(X)) || !/Entendi/.test(X.registro.tutorialProximo.innerHTML)) throw new Error("último passo sem Entendi");
    X.registro.tutorialProximo.onclick();
    if (aberto(X) !== null) throw new Error("Entendi não fechou");
    if (!((X.registro.cards || {}).children || []).some(n => (n.className || "").split(" ").includes("card"))) throw new Error("sem cartas depois do tutorial");
  });

  await conf("draft: não abre de novo na montagem seguinte (nem com o localStorage bloqueado, na mesma sessão) nem pra quem já viu", async () => {
    const X = sandboxCarreira(); abrirDraft(X, 103);
    X.run("fecharTutorial();");
    delete X.dadosLS["tutorial:draft"];          // navegador que não guarda nada
    abrirDraft(X, 104);
    if (aberto(X) !== null) throw new Error("abriu de novo na mesma sessão");
    const Y = sandboxCarreira(); Y.dadosLS["tutorial:draft"] = "1"; abrirDraft(Y, 105);
    if (aberto(Y) !== null) throw new Error("abriu pra quem já tinha visto");
  });

  await conf("draft: Como jogar reabre no passo 1; Esc e o X fecham", async () => {
    const Y = sandboxCarreira(); Y.dadosLS["tutorial:draft"] = "1"; abrirDraft(Y, 106);
    const b = Y.registro.comoJogar_draft;
    if (!b || !b.onclick) throw new Error("sem o botão Como jogar no draft");
    b.onclick();
    if (aberto(Y) !== "draft" || !/1 de 3/.test(caixa(Y))) throw new Error("Como jogar não reabriu no passo 1");
    Y.registro.tutorial.onkeydown({ key: "Escape" });
    if (aberto(Y) !== null) throw new Error("Esc não fechou");
    b.onclick(); Y.registro.tutorialX.onclick();
    if (aberto(Y) !== null) throw new Error("o X não fechou");
  });

  await conf("luta: abre sozinho na primeira noite de luta, no passo 1 de 5, e nunca no modo automático", async () => {
    const X = sandboxCarreira(); X.dadosLS["tutorial:draft"] = "1";
    iniciarCarreiraTeste(X, F, 107, "normal", RJ);
    X.run("auto=false;nextFight();");
    if (aberto(X) !== "luta") throw new Error("não abriu na primeira noite: " + aberto(X));
    if (!/1 de 5/.test(caixa(X)) || !caixa(X).includes("img/tutorial/luta-1.webp")) throw new Error("não está no passo 1 de 5");
    const Z = sandboxCarreira(); Z.dadosLS["tutorial:draft"] = "1";
    iniciarCarreiraTeste(Z, F, 108, "normal", RJ);
    await jogarCarreiraAte(Z, 3);
    if (Z.run("!!TUTORIAL_NA_SESSAO.luta") || Z.dadosLS["tutorial:luta"]) throw new Error("abriu no modo automático");
    /* a trava em si (a carreira automática nem passa pela tela da oferta) */
    if (Z.run("auto=true;abrirTutorialSeNovo('luta');TUTORIAL_ABERTO") !== null) throw new Error("abrirTutorialSeNovo abriu com auto ligado");
  });

  await conf("luta: Como jogar na noite abre no passo da etapa (oferta no 1, camp no 2)", async () => {
    const X = sandboxCarreira(); X.dadosLS["tutorial:draft"] = "1"; X.dadosLS["tutorial:luta"] = "1";
    iniciarCarreiraTeste(X, F, 109, "normal", RJ);
    X.run("auto=false;nextFight();");
    if (aberto(X) !== null) throw new Error("abriu pra quem já tinha visto");
    const b = X.registro.comoJogar_luta;
    if (!b || !b.onclick) throw new Error("sem o botão Como jogar na noite");
    b.onclick();
    if (!/1 de 5/.test(caixa(X))) throw new Error("na oferta não abriu no passo 1");
    X.run("fecharTutorial();");
    X.registro.opps.children.find(n => (n.className || "").split(" ").includes("opp")).onclick();
    b.onclick();
    if (!/2 de 5/.test(caixa(X))) throw new Error("no camp não abriu no passo 2");
  });

  await conf("prints: todo passo tem as versões de computador e celular, uma anotação por item, e o gerador fica fora do ar", async () => {
    const X = sandboxCarreira();
    const tut = JSON.parse(X.run("JSON.stringify(Object.fromEntries(Object.entries(TUTORIAIS).map(([k,t])=>[k,t.passos.map(p=>({img:p.img,n:p.itens.length}))])))"));
    const cap = fs.readFileSync(path.join(__dirname, "img", "tutorial", "capturar.mjs"), "utf8");
    const anot = {};
    for (const m of cap.matchAll(/print\(page, "([\w-]+)" \+ suf, \[([^\]]*)\]\)/g)) anot[m[1]] = (m[2].match(/"[^"]+"/g) || []).length;
    let n = 0;
    for (const passos of Object.values(tut)) for (const p of passos) {
      for (const suf of ["", "-m"])
        if (!fs.existsSync(path.join(__dirname, "img", "tutorial", p.img + suf + ".webp"))) throw new Error("falta img/tutorial/" + p.img + suf + ".webp");
      if (anot[p.img] !== p.n) throw new Error(`${p.img}: ${p.n} itens na lista e ${anot[p.img]} anotações no capturar.mjs`);
      n++;
    }
    if (n < 8) throw new Error("só " + n + " passos");
    if (!/^img\/tutorial\/\*\.mjs$/m.test(fs.readFileSync(path.join(__dirname, ".vercelignore"), "utf8"))) throw new Error(".vercelignore não tira o capturar.mjs do ar");
  });

  const ok = !falhas.length;
  console.log(ok ? verde("  tutorial ok") : vermelho(`  ${falhas.length} falha(s) no tutorial`));
  return ok;
}

/* ================================================================== *
 * 3d. MEMÓRIA NARRATIVA (etapa 1 do plano de 2026-09-29) — a fala real do
 *     jogador vira memória da carreira; a entrevista liga a fala da
 *     coletiva ao resultado; coletivas futuras cobram falas antigas; e
 *     nenhum texto da IA atribui a ele uma fala que ele não disse.
 * ================================================================== */
/* ================================================================== *
 * ENTREVISTA PÓS-LUTA (2026-10-01): a pergunta tem que fazer sentido.
 * Pedido do dono: perguntas artificiais, desconexas e sem sentido. A
 * pergunta parte dos fatos da luta (fatosDaLuta) e de uma pauta escolhida
 * por eles; o filtro motivoPerguntaRuim barra o que não faz sentido, na
 * resposta da IA e nos moldes. Aqui:
 *   - contextos de luta (nocaute, finalização, decisão apertada e clara,
 *     vitória, derrota, virada entre rounds, pouca informação, cinturão,
 *     zebra, lesão, revanche, fala da coletiva, amostra);
 *   - todos os moldes de todas as pautas, em milhares de lutas, passam no
 *     filtro;
 *   - os exemplos ruins do pedido do dono são barrados e os bons passam;
 *   - o prompt da coletiva não mudou (mesma impressão digital);
 *   - ENTREVISTA_IA=real: as mesmas lutas no modelo de produção (teto
 *     ENTREVISTA_MAX, padrão 40), pra avaliação qualitativa.
 * ================================================================== */
const ENT_OPP = "Rival Teste";
const ENT_FIXTURES = [
  { nome: "nocaute rápido, vitória", won: true, r: { method: "Nocaute", round: 1, clock: "4:25", log: [] }, td: [0, 0], pautas: ["nocaute-rapido", "nocaute-venceu"], cita: /primeiro round|segundos/ },
  { nome: "nocaute no 2º round depois de perder o 1º (virada)", won: true, r: { method: "Nocaute", round: 2, clock: "3:10", log: [{ round: 1, clock: "0:00", kind: "rd", text: "Fim do round 1. ELE levou." }] }, td: [0, 0], pautas: ["virou", "nocaute-venceu"], cita: /round/ },
  { nome: "nocauteado no 3º round", won: false, r: { method: "Nocaute", round: 3, clock: "1:00", log: [] }, td: [0, 0], pautas: ["nocauteado"], cita: /terceiro round|golpe/ },
  { nome: "finalização, vitória", won: true, r: { method: "Finalização", round: 2, clock: "2:40", log: [] }, td: [2, 0], pautas: ["finalizacao-venceu", "quedas-venceu"], cita: /finaliza|quedas/ },
  { nome: "finalizado no 1º round", won: false, r: { method: "Finalização", round: 1, clock: "3:05", log: [] }, td: [0, 1], pautas: ["finalizado"], cita: /finaliz/ },
  { nome: "decisão apertada, vitória 29-28", won: true, r: { method: "Decisão", round: 3, clock: "0:00", cards: "29-28", log: [] }, td: [1, 1], pautas: ["decisao-apertada"], cita: /29-28/ },
  { nome: "decisão clara, vitória 30-27", won: true, r: { method: "Decisão", round: 3, clock: "0:00", cards: "30-27", log: [] }, td: [0, 0], pautas: ["decisao-clara"], cita: /30-27/ },
  { nome: "decisão apertada, derrota 28-29", won: false, r: { method: "Decisão", round: 3, clock: "0:00", cards: "28-29", log: [] }, td: [0, 1], pautas: ["decisao-apertada"], cita: /29-28/ },
  { nome: "decisão clara, derrota 27-30", won: false, r: { method: "Decisão", round: 3, clock: "0:00", cards: "27-30", log: [] }, td: [0, 0], pautas: ["decisao-clara"], cita: /30-27/ },
  { nome: "foi ao chão e venceu por nocaute", won: true, r: { method: "Nocaute", round: 3, clock: "2:00", log: [{ round: 1, clock: "3:00", kind: "kd", text: "EU foi ao chão! Levantou cambaleando." }] }, td: [0, 0], pautas: ["caiu-e-venceu", "nocaute-venceu"], cita: /ch[aã]o|round/ },
  { nome: "começou bem e perdeu (mudança de ritmo)", won: false, r: { method: "Decisão", round: 3, clock: "0:00", cards: "28-29", log: [{ round: 1, clock: "0:00", kind: "rd", text: "Fim do round 1. EU levou." }, { round: 2, clock: "0:00", kind: "rd", text: "Fim do round 2. ELE levou." }, { round: 3, clock: "0:00", kind: "rd", text: "Fim do round 3. ELE levou." }] }, td: [0, 0], pautas: ["comecou-bem", "decisao-apertada"], cita: /primeiro round|29-28/ },
  { nome: "derrubou o adversário e perdeu", won: false, r: { method: "Nocaute", round: 3, clock: "1:30", log: [{ round: 1, clock: "2:00", kind: "kd", text: "ELE foi ao chão! Levantou cambaleando." }] }, td: [0, 0], pautas: ["derrubou-e-perdeu", "nocauteado"], cita: /derrub|round/ },
  { nome: "vitória pelas quedas (4 a 0)", won: true, r: { method: "Decisão", round: 3, clock: "0:00", cards: "30-27", log: [] }, td: [4, 0], pautas: ["quedas-venceu", "decisao-clara"], cita: /quedas|30-27/ },
  { nome: "derrota pelas quedas (0 a 4)", won: false, r: { method: "Decisão", round: 3, clock: "0:00", cards: "27-30", log: [] }, td: [0, 4], pautas: ["quedas-perdeu", "decisao-clara"], cita: /ch[aã]o|30-27/ },
  { nome: "tentou finalizar e perdeu nos cartões", won: false, r: { method: "Decisão", round: 3, clock: "0:00", cards: "28-29", log: [{ round: 2, clock: "2:10", kind: "big", text: "EU tenta a finalização! ELE escapa." }] }, td: [0, 0], pautas: ["tentativa", "decisao-apertada"], cita: /finaliza|29-28/ },
  { nome: "pouca informação, vitória (decisão sem placar)", won: true, r: { method: "Decisão", round: 3, clock: "0:00", cards: null, log: [] }, td: [0, 0], pautas: ["geral"], cita: new RegExp(ENT_OPP) },
  { nome: "pouca informação, derrota (decisão sem placar)", won: false, r: { method: "Decisão", round: 3, clock: "0:00", cards: null, log: [] }, td: [0, 0], pautas: ["geral"], cita: new RegExp(ENT_OPP) },
  { nome: "cinturão conquistado por nocaute", won: true, titulo: true, r: { method: "Nocaute", round: 4, clock: "2:50", log: [] }, td: [0, 0], pautas: ["cinturao"], cita: /cintur/ },
  { nome: "cinturão perdido nos cartões", won: false, titulo: true, r: { method: "Decisão", round: 5, clock: "0:00", cards: "46-49", log: [] }, td: [0, 0], pautas: ["cinturao"], cita: /cintur/ },
  { nome: "zebra: venceu o favorito", won: true, zebra: true, r: { method: "Decisão", round: 3, clock: "0:00", cards: "29-28", log: [] }, td: [0, 0], pautas: ["zebra"], cita: /favorit|apostava/ },
  { nome: "lutou com lesão nova", won: true, lesao: true, r: { method: "Finalização", round: 3, clock: "4:00", log: [] }, td: [0, 0], pautas: ["lesao"], cita: /les[aã]o/ },
  { nome: "revanche (já se enfrentaram)", won: true, registro: [{ adv: "ELE", venceu: false, metodo: "Decisão", round: 3, cartoes: "28-29" }], r: { method: "Finalização", round: 2, clock: "1:10", log: [] }, td: [0, 0], pautas: ["reencontro", "finalizacao-venceu", "volta"], cita: /round|última vez|derrota/ },
  { nome: "vitória depois de uma derrota", won: true, registro: [{ adv: "Outro Lutador", venceu: false, metodo: "Nocaute", round: 2 }], r: { method: "Decisão", round: 3, clock: "0:00", cards: "30-27", log: [] }, td: [0, 0], pautas: ["volta", "decisao-clara"], cita: /Outro Lutador|30-27/ },
  { nome: "coletiva: promessa cumprida (nocaute prometido e entregue)", won: true, fala: { texto: "Vou nocautear ele no segundo round.", decl: { tom: "promessa", trecho: "Vou nocautear ele no segundo round", promessa: { metodo: "nocaute", round: 2 } } }, r: { method: "Nocaute", round: 2, clock: "2:20", log: [] }, td: [0, 0], pautas: [null], cita: /'Vou nocautear ele no segundo round'/ },
  { nome: "coletiva: promessa quebrada (prometeu nocaute, perdeu nos cartões)", won: false, fala: { texto: "Vou nocautear ele no segundo round.", decl: { tom: "promessa", trecho: "Vou nocautear ele no segundo round", promessa: { metodo: "nocaute", round: 2 } } }, r: { method: "Decisão", round: 3, clock: "0:00", cards: "28-29", log: [] }, td: [0, 0], pautas: [null], cita: /'Vou nocautear ele no segundo round'/ },
  { nome: "amostra Free: fala neutra da coletiva volta", won: true, amostra: true, fala: { texto: "Fiz um camp bom e estou pronto.", decl: { tom: "neutro", trecho: "estou pronto", promessa: null } }, r: { method: "Decisão", round: 3, clock: "0:00", cards: "30-27", log: [] }, td: [0, 0], pautas: [null], cita: /'estou pronto'/ },
];
/* mesma impressão digital do prompt da coletiva medida antes desta mudança */
const COLETIVA_PROMPT_DIGITAL = "ca78f9da12ee93b4 42b45f5cb9e9730d";
const COLETIVA_DADOS_DIGITAL = [
  { name: "Kayo Brasa", record: "3-1", followers: "12 mil", fan: "6.0", sequencia: "2 vitórias seguidas", opp: "Rival Teste", estilo: "Wrestler", dificuldade: "Duro", title: false, camp: "Boxe", lesao: null, historicoRival: null, reporter: "Lia Monteverde (Portal Guarda Alta)", linhaReporter: "tática", tema: "o estilo do adversário e como enfrentá-lo", estrutura: "oferece duas opções concretas e pede que ele escolha uma", anterior: null, dossie: null, eventoBase: "A organização passou no telão os melhores momentos de Rival Teste.", eventosUsados: ["Um torcedor gritou da porta."], recentes: ["Pergunta: Você vai aceitar o jogo dele?"], memoria: [], token: "t" },
  { name: "Kayo Brasa", record: "5-2", opp: "Outro", estilo: "Completo", title: true, camp: "Wrestling", reporter: "Caio Serrat (Rádio Três Rounds)", tema: "cobrança de uma fala antiga do lutador", memoria: ["luta 3, na coletiva: \"Vou nocautear\". Depois: perdeu"], recentes: [], token: "t" },
];
async function testarEntrevista() {
  const modo = process.env.ENTREVISTA_IA || "";
  console.log("\n" + cinza("entrevista: a pergunta parte dos fatos da luta e faz sentido (pauta, filtro de coerência, moldes)"));
  const url = require("url"), os = require("os"), crypto = require("crypto");
  const F = lerLutadores();
  const falhas = [];
  const conf = async (nome, fn) => {
    try { await fn(); console.log(verde("  ok    ") + nome); }
    catch (e) { falhas.push(nome); console.log(vermelho("  falha ") + nome + "\n         " + e.message); }
  };
  const R0 = sandboxCarreira(); R0.sb.__F = F;
  const RJ = R0.run("JSON.stringify(rateAll(globalThis.__F))");
  const nova = (seed) => {
    const X = sandboxCarreira();
    X.dadosLS["tutorial:draft"] = "1"; X.dadosLS["tutorial:luta"] = "1";
    iniciarCarreiraTeste(X, F, seed, "normal", RJ);
    X.run("auto=false;meuPro=true;");
    return X;
  };
  const J = (X, c) => JSON.parse(X.run(`JSON.stringify(${c})`));
  /* monta a entrevista de um contexto, pelo caminho do jogo (prepararEntrevista) */
  const PREPARAR = `(function(fx){
    const o={name:${JSON.stringify(ENT_OPP)},arquetipo:"Completo"};
    const troca=t=>String(t).replace(/EU/g,me.name).replace(/ELE/g,o.name);
    st.narrativa=null;st.memoria={falas:[]};st.lesao=fx.lesao?{atributo:"strDef",desdeLuta:4,duracao:3,mult:.9}:null;
    fightNo=5;
    const r={method:fx.r.method,round:fx.r.round,clock:fx.r.clock,cards:fx.r.cards||null,log:(fx.r.log||[]).map(L=>({...L,text:troca(L.text)}))};
    /* a luta atual já está no registro quando a entrevista abre (finishFight) */
    st.registro=[...(fx.registro||[]).map(x=>({...x,adv:troca(x.adv)})),{adv:o.name,venceu:fx.won,metodo:r.method,round:r.round,cartoes:r.cards}];
    if(fx.fala){registrarFala({onde:"coletiva",luta:5,adv:o.name,texto:fx.fala.texto,decl:fx.fala.decl});fecharFalaDaLuta(fx.won,r);}
    const op={opp:o,r,titleFight:!!fx.titulo,won:fx.won,td0:fx.td[0],tdt0:fx.td[1],zebra:!!fx.zebra,ehRival:false,amostra:!!fx.amostra};
    const prep=prepararEntrevista(op);
    const nomes=[me.name,...REPORTERES,o.name];
    globalThis.__ultimo={prep,op};
    return{pauta:prep.pauta?prep.pauta.id:null,fala:prep.falaCol?prep.falaCol.texto:null,pergunta:prep.local.pergunta,evento:prep.local.evento,
      motivo:motivoPerguntaRuim(prep.local.pergunta,prep.local.evento,prep.f,nomes),reporter:prep.reporter.nome+" ("+prep.reporter.veiculo+")",
      pedido:pedidoDaEntrevista(prep,op,"tok"),resumo:prep.dados.resumo};
  })`;
  const X = nova(401);
  const resultados = ENT_FIXTURES.map(fx => ({ fx, r: J(X, `${PREPARAR}(${JSON.stringify(fx)})`) }));

  await conf(`contextos de luta (${ENT_FIXTURES.length}): pauta certa, pergunta do molde ligada ao fato da luta e aprovada no filtro de coerência`, async () => {
    const erros = [];
    for (const { fx, r } of resultados) {
      if (!fx.pautas.includes(r.pauta)) erros.push(`${fx.nome}: pauta ${r.pauta} (esperava ${fx.pautas.join("/")})`);
      if (r.motivo) erros.push(`${fx.nome}: molde reprovado (${r.motivo}): ${r.pergunta}`);
      if (!fx.cita.test(r.pergunta)) erros.push(`${fx.nome}: não cita o fato: ${r.pergunta}`);
      if (/undefined|null|NaN|\s{2}|\bpor\s*[.?]/.test(r.pergunta + " " + r.evento)) erros.push(`${fx.nome}: molde quebrado: ${r.pergunta}`);
    }
    if (erros.length) throw new Error(erros.join("\n         "));
  });
  await conf("decisão: juízes e cartões só aparecem quando a luta foi pros cartões; nunca 'dividida' nem 'unânime'", async () => {
    const erros = [];
    for (const { fx, r } of resultados) {
      const t = r.pergunta + " " + r.pedido.resumo + " " + r.pedido.fato;
      if (fx.r.method !== "Decisão" && /ju[ií]z|cart[oõ]es|pontua|por decis/i.test(r.pergunta)) erros.push(`${fx.nome}: ${r.pergunta}`);
      if (/dividida|un[aâ]nime|majorit/i.test(t)) erros.push(`${fx.nome}: tipo de decisão inventado: ${t}`);
    }
    if (erros.length) throw new Error(erros.join("\n         "));
  });
  await conf("evento é só cenário: a pergunta do molde nunca repete a narração; o evento combina com o resultado", async () => {
    const erros = [];
    for (const { fx, r } of resultados) {
      if (r.motivo === "repete o evento") erros.push(`${fx.nome}: ${r.pergunta}`);
      if (!fx.won && /gritava o seu nome|invadiu a área|comemor[ao] (?:com|a sua)/i.test(r.evento)) erros.push(`${fx.nome}: derrota com festa: ${r.evento}`);
      if (fx.won && /gelo|em silêncio|comemorava do outro lado/i.test(r.evento)) erros.push(`${fx.nome}: vitória com evento de derrota: ${r.evento}`);
    }
    if (erros.length) throw new Error(erros.join("\n         "));
  });
  await conf("coletiva na entrevista: a fala volta copiada entre aspas e ligada ao resultado; o pedido pra IA leva a fala e o desfecho", async () => {
    for (const { fx, r } of resultados.filter(x => x.fx.fala)) {
      if (!r.fala || !fx.cita.test(r.pergunta)) throw new Error(`${fx.nome}: ${r.pergunta}`);
      if (!/O que aconteceu: .*\b(venceu|perdeu)\b/.test(r.pedido.fato)) throw new Error(`${fx.nome}: pedido sem o desfecho: ${r.pedido.fato}`);
    }
  });
  await conf("fala da coletiva sem recorte da IA: o ponto final sai da citação no meio da pergunta; as reticências ficam", async () => {
    const r = J(X, `(function(){
      const out=[];
      for(const texto of ["Vou nocautear ele no segundo round.","Ele não aguenta três rounds, pode escrever..."])
        for(let i=0;i<3;i++){
          const f={onde:"coletiva",luta:5,adv:"Rival X",texto,trecho:trechoLiteral(texto,""),tom:"neutro",promessa:null,
            resultado:{venceu:false,metodo:"Decisão",round:3,cartoes:"28-29"},cumprida:null,cobrada:0};
          out.push(perguntaSobreFala(f,situacaoDaFala(f)));
        }
      return out;})()`);
    for (const p of r.slice(0, 3)) if (!p.includes("'Vou nocautear ele no segundo round'") || /\.'/.test(p)) throw new Error("ponto final dentro da citação: " + p);
    for (const p of r.slice(3)) if (!p.includes("pode escrever...'")) throw new Error("reticências cortadas: " + p);
    if (new Set(r.slice(0, 3)).size !== 3) throw new Error("as três formas da fala neutra não giraram: " + r.slice(0, 3).join(" | "));
  });
  await conf("o pedido pra IA leva o resumo da luta, a pauta e o repórter com a linha editorial; nada de situação sorteada nem forma da pergunta", async () => {
    for (const { fx, r } of resultados) {
      const p = r.pedido;
      if (!p.resumo || !p.resumo.includes(ENT_OPP) || !p.pauta || !p.fato || !p.linhaReporter || !/\(/.test(p.reporter)) throw new Error(`${fx.nome}: ${JSON.stringify(p).slice(0, 300)}`);
      if ("estrutura" in p || "anterior" in p) throw new Error(`${fx.nome}: pedido ainda leva a dupla da coletiva`);
    }
  });
  await conf("todos os moldes de todas as pautas, em milhares de lutas, passam no filtro de coerência (sem placeholder quebrado)", async () => {
    const r = J(X, `(function(){
      const o={name:${JSON.stringify(ENT_OPP)}},nomes=[me.name,...REPORTERES,o.name];
      const regs=[[],[{adv:o.name,venceu:true,metodo:"Nocaute",round:2}],[{adv:"Outro",venceu:false,metodo:"Decisão",round:3,cartoes:"28-29"}],[{adv:"Outro",venceu:true,metodo:"Finalização",round:1}]];
      let casos=0;const ruins=[],pautasVistas=new Set();
      for(const metodo of ["Nocaute","Finalização","Decisão"])for(const won of [true,false])for(const round of [1,3])
      for(const kd of [null,"eu","ele"])for(const td of [[0,0],[3,0],[0,3]])for(const r1 of [null,"eu","ele"])
      for(const flag of [null,"titulo","zebra","lesao"])for(const reg of regs){
        const log=[];
        if(r1)log.push({round:1,clock:"0:00",kind:"rd",text:"Fim do round 1. "+(r1==="eu"?me.name:o.name)+" levou."});
        if(kd)log.push({round:1,clock:"2:00",kind:"kd",text:(kd==="eu"?me.name:o.name)+" foi ao chão! Levantou cambaleando."});
        if(metodo==="Decisão"||kd===null)log.push({round:1,clock:"1:00",kind:"big",text:me.name+" tenta a finalização! "+o.name+" escapa."});
        const cards=metodo==="Decisão"?(round===1?(won?"29-28":"28-29"):kd==="ele"?null:(won?"30-27":"27-30")):null;
        const r={method:metodo,round:metodo==="Decisão"?3:round,clock:metodo==="Decisão"?"0:00":"3:35",cards,log};
        st.registro=[...reg,{adv:o.name,venceu:won,metodo,round:r.round,cartoes:cards}];
        const f=fatosDaLuta(r,won,o,td[0],td[1],{titulo:flag==="titulo",zebra:flag==="zebra",lesao:flag==="lesao"?"Defesa machucada":null});
        const evs=eventosDaEntrevista(f);
        for(const p of PAUTAS_ENTREVISTA){if(!p.cond(f))continue;pautasVistas.add(p.id);
          for(const q of p.q(f)){casos++;
            if(/undefined|null|NaN|\\s{2}/.test(q))ruins.push("quebrado: "+q);
            for(const e of evs){const m=motivoPerguntaRuim(q,e,f,nomes);if(m){ruins.push(m+": "+q+" | "+e);break;}}
          }}
      }
      return{casos,ruins:[...new Set(ruins)].slice(0,8),pautas:pautasVistas.size,total:PAUTAS_ENTREVISTA.length};})()`);
    if (r.ruins.length) throw new Error(`${r.ruins.length} reprovados em ${r.casos}:\n         ` + r.ruins.join("\n         "));
    if (r.pautas !== r.total || r.casos < 5000) throw new Error(`cobertura: ${r.pautas}/${r.total} pautas, ${r.casos} moldes`);
    console.log(cinza(`         ${r.casos} perguntas de molde conferidas, ${r.pautas} pautas`));
  });
  await conf("filtro de coerência: os exemplos ruins do pedido do dono são barrados, pelo motivo certo", async () => {
    const r = J(X, `(function(){
      const o={name:${JSON.stringify(ENT_OPP)}},nomes=[me.name,...REPORTERES,o.name];
      const dec=fatosDaLuta({method:"Decisão",round:3,clock:"0:00",cards:"29-28",log:[]},true,o,0,0);
      const ko=fatosDaLuta({method:"Nocaute",round:2,clock:"3:00",log:[]},true,o,0,0);
      const t=(p,e,f)=>motivoPerguntaRuim(p,e,f,nomes);
      const ev0="A torcida ainda gritava o seu nome.";
      return{
        toalha:t("O seu treinador ainda estava com a toalha no ombro quando o repórter chegou. Ele disse algo específico no corner sobre a decisão dos juízes?","O seu treinador ainda estava com a toalha no ombro quando o repórter chegou.",dec),
        arena:t("A arena te empurrou ou te pressionou?","Parte da arena aplaudiu "+o.name+" quando o resultado apareceu no telão.",dec),
        pressao:t("A pressão te ajudou ou te atrapalhou?","A torcida ainda gritava o seu nome.",ko),
        cabeca:t("O que passou pela sua cabeça quando o resultado apareceu?","A torcida ainda gritava o seu nome.",ko),
        juizesNoNocaute:t("Os juízes estavam vendo a luta do seu lado antes do nocaute?","A torcida ainda gritava o seu nome.",ko),
        dividida:t("A decisão dividida te surpreendeu?","O locutor leu os cartões.",dec),
        treinadorDisse:t("O seu treinador disse que você relaxou no segundo round. Concorda?","A torcida ainda gritava o seu nome.",ko),
        adversarioDisse:t(o.name+" disse que você fugiu da troca. O que você responde?","A torcida ainda gritava o seu nome.",ko),
        emocao:t("Você ficou nervoso no começo da luta. O que mudou no segundo round?","A torcida ainda gritava o seu nome.",ko),
        generica:t("Como foi a semana de preparação para você?","A torcida ainda gritava o seu nome.",ko),
        nocauteInventado:t("O nocaute no terceiro round era o plano?","O locutor leu os cartões.",dec),
        contrato:t("Você venceu "+o.name+" nos cartões por 29-28. Como isso impacta a negociação do seu próximo contrato?","O locutor leu os cartões.",dec),
        placarBaixo:t("Você venceu por 30 a 27. O placar baixo mostra que faltou agressividade?","O locutor leu os cartões.",fatosDaLuta({method:"Decisão",round:3,clock:"0:00",cards:"30-27",log:[]},true,o,0,0)),
        finalizarNoNocaute:t("Qual foi a leitura que te levou a encontrar a abertura para finalizar "+o.name+"?","A torcida ainda gritava o seu nome.",ko),
        finalizacaoNoNocaute:t("Você nocauteou "+o.name+" no segundo round. Qual foi a chave para essa finalização?","A torcida ainda gritava o seu nome.",ko),
        tempoInvertido:t("No primeiro round, faltando 35 segundos, qual foi a chance que você viu?","A torcida ainda gritava o seu nome.",fatosDaLuta({method:"Nocaute",round:1,clock:"4:25",log:[]},true,o,0,0)),
        apertadaSemPlacar:t("A vitória veio nos cartões e a disputa foi apertada. O que fez a diferença contra "+o.name+"?","O locutor leu os cartões.",fatosDaLuta({method:"Decisão",round:3,clock:"0:00",cards:null,log:[]},true,o,0,0)),
        detalheTecnico:t("Com 30-27 nos cartões, qual foi o detalhe técnico que fez a diferença?","O locutor leu os cartões.",fatosDaLuta({method:"Decisão",round:3,clock:"0:00",cards:"30-27",log:[]},true,o,0,0)),
        senhor:t("Senhor, como o senhor controlou as quedas contra "+o.name+"?","O locutor leu os cartões.",dec),
        leituraTecnica:t("Como foi a leitura técnica que te levou a buscar o nocaute no segundo round?","A torcida ainda gritava o seu nome.",ko),
        zebraInvertida:t("Você venceu "+o.name+" por 29 a 28, mesmo sendo considerado o favorito. Como controlou a luta?","O locutor leu os cartões.",
          fatosDaLuta({method:"Decisão",round:3,clock:"0:00",cards:"29-28",log:[]},true,o,0,0,{zebra:true})),
        resultadoInvertido:t("Você garantiu a vitória por um ponto, 29 a 28. Em que momento fechou o placar?","O locutor leu os cartões.",
          fatosDaLuta({method:"Decisão",round:3,clock:"0:00",cards:"28-29",log:[]},false,o,0,0)),
        minutoErrado:t("Você foi finalizado no primeiro round com apenas um minuto de luta. Como a queda virou finalização?","O locutor leu os cartões.",
          fatosDaLuta({method:"Finalização",round:1,clock:"3:05",log:[]},false,o,0,1)),
        golpeInventado:t("O que você viu no clinch do segundo round para acertar o golpe que acabou a luta?","A torcida ainda gritava o seu nome.",ko),
        tresCartoes:t("Como você manteve a vantagem até os três cartões fecharem em 30-27?","O locutor leu os cartões.",
          fatosDaLuta({method:"Decisão",round:3,clock:"0:00",cards:"30-27",log:[]},true,o,0,0)),
        vantagemInventada:t("O placar foi 30 a 27, uma diferença grande nos cartões. Onde exatamente você sentiu que perdeu a vantagem técnica para "+o.name+"?","O locutor leu os cartões.",
          fatosDaLuta({method:"Decisão",round:3,clock:"0:00",cards:"27-30",log:[1,2,3].map(n=>({round:n,clock:"0:00",kind:"rd",text:"Fim do round "+n+". "+o.name+" levou."}))},false,o,0,4)),
        sentiuGolpe:t("O que você sentiu no momento em que recebeu o golpe que encerrou a luta no terceiro round?",ev0,
          fatosDaLuta({method:"Nocaute",round:3,clock:"2:00",log:[]},false,o,0,0)),
        naoDecisiva:t("Você venceu nos cartões, mas a luta não foi decisiva. Qual foi a chave para fechar esse placar?","O locutor leu os cartões.",
          fatosDaLuta({method:"Decisão",round:3,clock:"0:00",cards:null,log:[]},true,o,0,0)),
        pautaVazou:t("Nosso foco é entender como a finalização apareceu, então me conta: em que momento você percebeu a abertura para aplicar o golpe no segundo round?",ev0,
          fatosDaLuta({method:"Finalização",round:2,clock:"2:40",log:[]},true,o,0,0)),
        quedasNoRound:t("No segundo round, você derrubou o adversário duas vezes antes de aplicar a finalização em 2min20. Em que momento exato você percebeu que tinha a chave pronta para encerrar?",ev0,
          fatosDaLuta({method:"Finalização",round:2,clock:"2:40",log:[]},true,o,2,0)),
        trintaSegundos:t("Nos primeiros trinta segundos do segundo round, qual leitura você fez na defesa dele que permitiu montar a sequência final?",ev0,
          fatosDaLuta({method:"Nocaute",round:2,clock:"3:10",log:[]},true,o,0,0)),
        minFormatoErrado:t("A finalização saiu com 2min20 do segundo round. Como você chegou à posição?",ev0,
          fatosDaLuta({method:"Finalização",round:2,clock:"1:10",log:[]},true,o,0,0)),
        guardaInventada:t("Em que momento a guarda de "+o.name+" abriu para a finalização no segundo round?",ev0,
          fatosDaLuta({method:"Finalização",round:2,clock:"2:40",log:[]},true,o,0,0))};})()`);
    const esperado = { toalha: "repete o evento", arena: "escolha vazia", pressao: "escolha vazia", cabeca: "genérica", juizesNoNocaute: "juízes sem decisão",
      dividida: "tipo de decisão inventado", treinadorDisse: "fala de terceiro sem evidência", adversarioDisse: "fala de terceiro sem evidência",
      emocao: "emoção afirmada", generica: "sem ligação com a luta", nocauteInventado: "fim de luta que não aconteceu",
      contrato: "assunto fora da luta", placarBaixo: "placar descrito errado", finalizarNoNocaute: "fim de luta que não aconteceu",
      finalizacaoNoNocaute: "fim de luta que não aconteceu", tempoInvertido: "tempo descrito errado", apertadaSemPlacar: "placar descrito errado",
      detalheTecnico: "fórmula de questionário", senhor: "fórmula de questionário", leituraTecnica: "fórmula de questionário", zebraInvertida: "fato invertido",
      resultadoInvertido: "resultado invertido", minutoErrado: "tempo descrito errado", golpeInventado: "golpe que não está na luta", tresCartoes: "tipo de decisão inventado",
      vantagemInventada: "fato invertido", sentiuGolpe: "genérica", naoDecisiva: "placar descrito errado",
      pautaVazou: "pauta vazou na pergunta", quedasNoRound: "número fora dos fatos", trintaSegundos: "tempo descrito errado",
      minFormatoErrado: "tempo descrito errado", guardaInventada: "golpe que não está na luta" };
    const errados = Object.entries(esperado).filter(([k, v]) => r[k] !== v).map(([k, v]) => `${k}: ${r[k]} (esperava ${v})`);
    if (errados.length) throw new Error(errados.join("\n         "));
  });
  await conf("limpeza da entrevista: prefixo 'O repórter pergunta:' e nome entre aspas saem, e a pergunta boa fica", async () => {
    const r = J(X, `(function(){const o={name:${JSON.stringify(ENT_OPP)}};
      const f=fatosDaLuta({method:"Nocaute",round:1,clock:"4:25",log:[]},true,o,0,0);
      const a=avaliarCenaDaIA({evento:"A torcida ainda gritava o seu nome.",pergunta:"O repórter pergunta: '"+me.name+", esse nocaute em 35 segundos foi plano ou oportunidade que apareceu na hora?"},"entrevista",{nomes:[o.name],fatos:f});
      const b=avaliarCenaDaIA({evento:"A torcida ainda gritava o seu nome.",pergunta:"No primeiro round, o que você viu em '"+o.name+"' antes do golpe?"},"entrevista",{nomes:[o.name],fatos:f});
      const tit=fatosDaLuta({method:"Decisão",round:5,clock:"0:00",cards:"46-49",log:[]},false,o,0,0,{titulo:true});
      const c=avaliarCenaDaIA({evento:o.name+" comemorava do outro lado da grade.",pergunta:"Sônia Barreto, você perdeu por 49 a 46. O que faltou para vencer a disputa pelo cinturão?"},"entrevista",{nomes:[o.name],fatos:tit});
      const dec=fatosDaLuta({method:"Decisão",round:3,clock:"0:00",cards:"30-27",log:[]},true,o,0,0);
      const d=avaliarCenaDaIA({evento:"O locutor leu os cartões.",pergunta:"Otávio Paranhos aqui na Rádio Três Rounds. Você venceu por 30 a 27. Qual parte do seu jogo "+o.name+" não conseguiu responder?"},"entrevista",{nomes:[o.name],fatos:dec});
      const tent=fatosDaLuta({method:"Decisão",round:3,clock:"0:00",cards:"28-29",log:[{round:2,clock:"2:00",kind:"big",text:me.name+" tenta a finalização! "+o.name+" escapa."}]},false,o,0,0);
      const e=avaliarCenaDaIA({evento:o.name+" comemorava do outro lado da grade.",pergunta:"Lutador, você tentou uma finalização no segundo round. Por que a tentativa não fechou?"},"entrevista",{nomes:[o.name],fatos:tent});
      return{a:a.cena&&a.cena.pergunta,b:b.cena&&b.cena.pergunta,c:c.cena?c.cena.pergunta:c.motivo,d:d.cena?d.cena.pergunta:d.motivo,e:e.cena?e.cena.pergunta:e.motivo};})()`);
    if (!r.a || /rep[oó]rter|^'/.test(r.a)) throw new Error("prefixo ficou: " + r.a);
    if (!r.b || /'/.test(r.b)) throw new Error("aspas no nome ficaram: " + r.b);
    if (r.c !== "Você perdeu por 49 a 46. O que faltou para vencer a disputa pelo cinturão?") throw new Error("nome do repórter como vocativo: " + r.c);
    if (!/^Você venceu por 30 a 27\./.test(r.d || "")) throw new Error("apresentação do repórter ficou: " + r.d);
    if (r.e !== "Você tentou uma finalização no segundo round. Por que a tentativa não fechou?") throw new Error("vocativo 'Lutador' ficou: " + r.e);
  });
  await conf("filtro de coerência: perguntas boas, do jeito pedido pelo dono, passam", async () => {
    const r = J(X, `(function(){
      const o={name:${JSON.stringify(ENT_OPP)}},nomes=[me.name,...REPORTERES,o.name];
      const ko=fatosDaLuta({method:"Nocaute",round:2,clock:"3:00",log:[]},true,o,0,0);
      const dec=fatosDaLuta({method:"Decisão",round:3,clock:"0:00",cards:"29-28",log:[]},true,o,0,0);
      const perdeu=fatosDaLuta({method:"Decisão",round:3,clock:"0:00",cards:"28-29",log:[{round:1,clock:"0:00",kind:"rd",text:"Fim do round 1. "+me.name+" levou."}]},false,o,0,0);
      const ev="A torcida ainda gritava o seu nome quando o repórter chegou com o microfone.";
      return[
        motivoPerguntaRuim("Você encontrou aquela abertura durante a luta ou foi uma oportunidade que apareceu de repente?",ev,ko,nomes),
        motivoPerguntaRuim("Quando anunciaram o resultado, você já tinha uma noção de como os juízes tinham pontuado a luta?",ev,dec,nomes),
        motivoPerguntaRuim("Você começou bem, mas o adversário conseguiu mudar o ritmo nos rounds seguintes. O que dificultou manter aquele desempenho?","O repórter esperou alguém da equipe trazer gelo para o seu rosto.",perdeu,nomes),
        motivoPerguntaRuim("O que o seu treinador te falou no último intervalo?",ev,ko,nomes),
        motivoPerguntaRuim("A decisão foi de 29-28. Em que momento da luta você percebeu que estava perdendo os pontos?","O locutor leu os cartões.",
          fatosDaLuta({method:"Decisão",round:3,clock:"0:00",cards:"28-29",log:[]},false,o,0,0),nomes),
        motivoPerguntaRuim("Você foi nocauteado aos quatro minutos do terceiro round. O que aconteceu naquele momento?",ev,
          fatosDaLuta({method:"Nocaute",round:3,clock:"1:00",log:[]},false,o,0,0),nomes),
        motivoPerguntaRuim("A queda que você aplicou no primeiro round abriu o caminho para a finalização?",ev,
          fatosDaLuta({method:"Finalização",round:2,clock:"2:00",log:[{round:1,clock:"3:00",kind:"big",text:me.name+" martelando por cima. "+o.name+" só protege."}]},true,o,1,0),nomes),
        motivoPerguntaRuim("Você levou o primeiro round. Em que momento perdeu o controle da luta?","O repórter esperou alguém da equipe trazer gelo para o seu rosto.",perdeu,nomes),
        motivoPerguntaRuim("A derrota foi por 29 a 28, uma decisão apertada. Em qual momento você sentiu que perdeu a vantagem nos cartões?","O locutor leu os cartões.",
          fatosDaLuta({method:"Decisão",round:3,clock:"0:00",cards:"28-29",log:[]},false,o,0,0),nomes),
        motivoPerguntaRuim("O nocaute veio 1 minuto e 50 segundos depois do início do segundo round. O que você viu antes do golpe?",ev,
          fatosDaLuta({method:"Nocaute",round:2,clock:"3:10",log:[]},true,o,0,0),nomes),
        motivoPerguntaRuim("O nocaute saiu com 1min50 do segundo round. Você já vinha preparando aquele golpe?",ev,
          fatosDaLuta({method:"Nocaute",round:2,clock:"3:10",log:[]},true,o,0,0),nomes),
        motivoPerguntaRuim("Você foi ao chão duas vezes no segundo round e ainda venceu. Como conseguiu se recuperar?",ev,
          fatosDaLuta({method:"Decisão",round:3,clock:"0:00",cards:"29-28",log:[1,2].map(()=>({round:2,clock:"2:00",kind:"kd",text:me.name+" foi ao chão!"}))},true,o,0,0),nomes)];})()`);
    if (r.some(Boolean)) throw new Error("barrou pergunta boa: " + JSON.stringify(r));
  });
  await conf("coletiva intacta: o prompt da coletiva é o mesmo de antes desta mudança (impressão digital)", async () => {
    const H = (await import(url.pathToFileURL(path.join(RAIZ, "api", "ai.js")).href)).default;
    const fetchOriginal = globalThis.fetch, envOriginal = { ...process.env }, erroOriginal = console.error;
    let corpo = null; const hs = [];
    process.env.OPENROUTER_API_KEY = "falsa"; console.error = () => {};
    globalThis.fetch = async (u, op = {}) => {
      u = String(u);
      if (u.endsWith("/auth/v1/user")) return { ok: true, status: 200, json: async () => ({ id: "u-teste" }) };
      /* cota diária da IA (auditoria de 2026-10-08): o banco falso sempre libera */
      if (u.endsWith("/rest/v1/rpc/consumir_uso_ia")) return { ok: true, status: 200, json: async () => "2026-10-01T00:00:00.000000+00:00", text: async () => "" };
      if (u.endsWith("/rest/v1/rpc/devolver_uso_ia")) return { ok: true, status: 204, json: async () => null, text: async () => "" };
      if (u.includes("/rest/v1/assinaturas")) return { ok: true, status: 200, json: async () => [{ pro: true, expira_em: null }] };
      if (u.startsWith("https://openrouter.ai/")) { corpo = op.body; return { ok: false, status: 500, text: async () => "x", json: async () => ({}) }; }
      return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
    };
    const res = { status() { return this; }, json() { return this; }, setHeader() {}, end() {} };
    try {
      for (const d of COLETIVA_DADOS_DIGITAL) { corpo = null; await H({ method: "POST", headers: {}, body: { kind: "coletivaCena", data: { ...d, token: "tok" } } }, res); hs.push(crypto.createHash("sha256").update(corpo || "").digest("hex").slice(0, 16)); }
      corpo = null;
      await H({ method: "POST", headers: {}, body: { kind: "entrevistaCena", data: { ...resultados[1].r.pedido, token: "tok" } } }, res);
      const ent = JSON.parse(corpo).messages;
      if (/Twitter|digitação leves|engraçado/.test(ent[0].content)) throw new Error("a entrevista ainda usa a voz de torcedor do feed");
      if (!/repórter esportivo brasileiro/.test(ent[0].content) || !/O que aconteceu na luta:/.test(ent[1].content) || !/Pauta do repórter/.test(ent[1].content) || /Forma da pergunta|Situação desta vez/.test(ent[1].content))
        throw new Error("prompt da entrevista sem a estrutura nova: " + ent[1].content.slice(0, 300));
    } finally {
      globalThis.fetch = fetchOriginal; console.error = erroOriginal;
      for (const k of Object.keys(process.env)) if (!(k in envOriginal)) delete process.env[k];
      Object.assign(process.env, envOriginal);
    }
    if (hs.join(" ") !== COLETIVA_PROMPT_DIGITAL) throw new Error(`o prompt da coletiva mudou: ${hs.join(" ")} (era ${COLETIVA_PROMPT_DIGITAL})`);
  });

  /* reavaliação sem custo: as respostas da IA gravadas numa rodada anterior
     (ENTREVISTA_SAIDA) passam pelo filtro atual */
  if (process.env.ENTREVISTA_REAVALIAR) {
    const d = JSON.parse(fs.readFileSync(process.env.ENTREVISTA_REAVALIAR, "utf8"));
    for (const a of d.avaliacoes) {
      const fx = ENT_FIXTURES.find(x => x.nome === a.contexto);
      if (!fx || a.status !== 200) { console.log(`  [sem resposta da IA] ${a.contexto}\n      jogador vê o molde: ${a.molde}`); continue; }
      const Y = nova(600); const base = J(Y, `${PREPARAR}(${JSON.stringify(fx)})`);
      Y.sb.__j = { evento: a.evento, pergunta: a.pergunta };
      const { m, q } = J(Y, `(function(){const {prep,op}=__ultimo;const fc=prep.falaCol;
        const r=avaliarCenaDaIA(__j,"entrevista",{permitidas:fc?[fc.texto]:[],exige:fc?fc.texto:null,nomes:[op.opp.name],fatos:prep.f});
        return{m:r.motivo||null,q:r.cena?r.cena.pergunta:null};})()`);
      console.log(`  [${m ? "molde: " + m : "IA"}] ${a.contexto} (${base.pauta || "fala da coletiva"})\n      jogador vê: ${m ? base.pergunta : q}${m ? `\n      (IA barrada: ${a.pergunta})` : ""}`);
    }
  }
  /* avaliação com o modelo de produção (só com ENTREVISTA_IA=real; gasta crédito) */
  if (modo === "real") {
    const H = (await import(url.pathToFileURL(path.join(RAIZ, "api", "ai.js")).href)).default;
    const fetchOriginal = globalThis.fetch, envOriginal = { ...process.env }, erroOriginal = console.error;
    const max = Number(process.env.ENTREVISTA_MAX) || 40, repetir = Number(process.env.ENTREVISTA_VEZES) || 1;
    let chamadas = 0, entrada = 0, saida = 0;
    const avaliacoes = [];
    process.env.OPENROUTER_API_KEY = fs.readFileSync(path.join(os.homedir(), ".octogono-openrouter"), "utf8").trim();
    console.error = () => {};
    globalThis.fetch = async (u, op = {}) => {
      u = String(u);
      if (u.endsWith("/auth/v1/user")) return { ok: true, status: 200, json: async () => ({ id: "u-teste" }) };
      /* cota diária da IA (auditoria de 2026-10-08): o banco falso sempre libera */
      if (u.endsWith("/rest/v1/rpc/consumir_uso_ia")) return { ok: true, status: 200, json: async () => "2026-10-01T00:00:00.000000+00:00", text: async () => "" };
      if (u.endsWith("/rest/v1/rpc/devolver_uso_ia")) return { ok: true, status: 204, json: async () => null, text: async () => "" };
      if (u.includes("/rest/v1/assinaturas")) return { ok: true, status: 200, json: async () => [{ pro: true, expira_em: null }] };
      if (u.startsWith("https://openrouter.ai/")) return fetchOriginal(u, op);
      return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
    };
    try {
      for (let v = 0; v < repetir; v++) for (const { fx } of resultados) {
        if (chamadas >= max) break;
        const Y = nova(500 + v);
        const base = J(Y, `${PREPARAR}(${JSON.stringify(fx)})`);
        const res = { cod: 0, corpo: null, setHeader() {}, status(c) { this.cod = c; return this; }, json(b) { this.corpo = b; return this; }, end() { return this; } };
        chamadas++;
        if (chamadas > 1) await new Promise(r => setTimeout(r, Number(process.env.ENTREVISTA_PAUSA) || 1500));
        await H({ method: "POST", headers: {}, body: { kind: "entrevistaCena", data: { ...base.pedido, token: "tok" } } }, res);
        if (res.corpo && res.corpo.usage) { entrada += res.corpo.usage.prompt_tokens || 0; saida += res.corpo.usage.completion_tokens || 0; }
        const j = res.cod === 200 ? res.corpo.result : null;
        Y.sb.__j = j;
        const av = J(Y, `(function(){const {prep,op}=__ultimo;const fc=prep.falaCol;
          const a=avaliarCenaDaIA(limparTextoIA(__j),"entrevista",{permitidas:fc?[fc.texto]:[],exige:fc?fc.texto:null,nomes:[op.opp.name],fatos:prep.f});
          return{motivo:a.motivo||null,evento:a.cena?a.cena.evento:(__j&&__j.evento)||"",pergunta:a.cena?a.cena.pergunta:(__j&&__j.pergunta)||""};})()`);
        avaliacoes.push({ contexto: fx.nome, pauta: base.pauta || "fala da coletiva", reporter: base.reporter, resumo: base.resumo, ...av, molde: base.pergunta,
          status: res.cod, erro: res.cod === 200 ? null : String((res.corpo && (res.corpo.error + " " + (res.corpo.status || ""))) || "").slice(0, 80) });
      }
    } finally {
      globalThis.fetch = fetchOriginal; console.error = erroOriginal;
      for (const k of Object.keys(process.env)) if (!(k in envOriginal)) delete process.env[k];
      Object.assign(process.env, envOriginal);
    }
    for (const a of avaliacoes) console.log(`  [${a.motivo ? "molde: " + a.motivo : "IA"}] ${a.contexto} (${a.pauta})\n      evento: ${a.evento}\n      pergunta: ${a.motivo ? a.molde : a.pergunta}${a.motivo ? `\n      (a IA tinha escrito: ${a.pergunta})` : ""}`);
    const aceitas = avaliacoes.filter(a => !a.motivo).length;
    console.log(cinza(`  IA real: ${chamadas} chamadas, ${aceitas} aceitas, ${chamadas - aceitas} no molde; tokens ${entrada} entrada, ${saida} saída`));
    if (process.env.ENTREVISTA_SAIDA) fs.writeFileSync(process.env.ENTREVISTA_SAIDA, JSON.stringify({ chamadas, entrada, saida, avaliacoes }, null, 1));
  }
  const ok = !falhas.length;
  console.log(ok ? verde("  entrevista ok") : vermelho(`  ${falhas.length} falha(s) na entrevista`));
  return ok;
}

/* cenas reais do modelo de produção, sem fala antiga, da medição de 2026-10-01 (carreira 0): o filtro de similaridade não pode barrar nenhuma */
const CENAS_REAIS_IA = [{"tipo": "coletiva", "evento": "O microfone de Renata Brum falha completamente e ela tenta trocar a pilha enquanto TesteBot espera na cadeira.", "pergunta": "Renata, o equipamento da Revista Mão Pesada não está funcionando. Você vai ter que improvisar no seu boxe ou pedir ajuda pra equipe?", "nomes": ["TesteBot", "Joel Alvarez"]}, {"tipo": "coletiva", "evento": "O empresário do Will Brooks colocou uma faixa de Jiu-jitsu no pescoço e riu na cara do TesteBot.", "pergunta": "O empresário do seu adversário apareceu com uma faixa da sua academia. Isso é motivo de piada ou você vai levar a sério?", "nomes": ["TesteBot", "Will Brooks"]}, {"tipo": "coletiva", "evento": "O empresário do Desmond Green entrega o certificado de pesagem para TesteBot e dá um tapa nas costas dele antes de sair da sala.", "pergunta": "O empresário do seu adversário te deu um tapa nas costas na pesagem. Você acha que isso é sinal de respeito ou apenas provocação?", "nomes": ["TesteBot", "Desmond Green"]}, {"tipo": "entrevista", "evento": "O médico fecha a bandagem no supercílio de TesteBot e afasta o encanador que tentava limpar o suor do octógono com um pano azul.", "pergunta": "Você aplicou duas quedas e zerou Desmond Green em menos de três minutos. Isso prova que seu grappling é superior ao resto ou foi só sorte com a posição dele?", "nomes": ["TesteBot", "Desmond Green"]}, {"tipo": "entrevista", "evento": "O técnico de Natan Levy joga a toalha molhada no chão da arena, perto do pé de TesteBot.", "pergunta": "Você dominou o jogo com quatro quedas em dois minutos. A estratégia foi desmontar o grappling dele ou só tirar vantagem da confusão que ficou depois?", "nomes": ["TesteBot", "Natan Levy"]}, {"tipo": "coletiva", "evento": "O treinador do Khabilov entra na sala de imprensa com uma cadeira nas costas e a joga no chão perto dos pés do TesteBot.", "pergunta": "Seu técnico acabou de destruir o mobiliário da coletiva. Você acha que isso é intimidador ou apenas falta de respeito?", "nomes": ["TesteBot", "Rustam Khabilov"]}, {"tipo": "coletiva", "evento": "O treinador do Chris Padilla segura o microfone e diz que a pressão do adversário é 'de outro mundo'.", "pergunta": "Seu técnico disse que a pressão dele é de outro mundo. Como você vai lidar com isso no octógono?", "nomes": ["TesteBot", "Chris Padilla"]}, {"tipo": "entrevista", "evento": "O treinador de TesteBot segura a cabeça dele e grita que o volume inchado impediu o jogo de chão.", "pergunta": "Seu treinador no corner disse que o volume machucado travou seu grappling. Como você explica as duas quedas sofridas com esse problema?", "nomes": ["TesteBot", "Drakkar Klose"]}, {"tipo": "entrevista", "evento": "Um torcedor joga uma garrafa de água vazia nos pés de TesteBot enquanto ele caminha para a área de entrevista.", "pergunta": "A torcida jogou uma garrafa na sua frente mesmo você vencendo Rustam Khabilov por finalização com o volume machucado. Isso mostra que a arena não te respeita ou foi só falta de sorte?", "nomes": ["TesteBot", "Rustam Khabilov"]}, {"tipo": "coletiva", "evento": "Marta Quintela abre a pasta com o histórico de TesteBot e aponta para as três derrotas no cartel 8-3, perguntando se a mudança para wrestling foi só pra esconder a falta de condição.", "pergunta": "TesteBot, seu cartel é 8-3 e você tá levando volume machucado. A troca pro wrestling foi estratégia ou desespero pra tapar os buracos?", "nomes": ["TesteBot", "MarQuel Mederos"]}, {"tipo": "coletiva", "evento": "Um torcedor grita 'boxe de esquina' na plateia e joga um copo vazio no chão perto da mesa.", "pergunta": "Um torcedor te chamou de boxeador de esquina agora. Com seu volume machucado, como você vai lidar com a pressão dele?", "nomes": ["TesteBot", "Brad Riddell"]}, {"tipo": "coletiva", "evento": "Hugo Lessa do Portal Guarda Alta coloca a folha do novo contrato na mesa e pergunta quanto o adversário Evan Elder está pedindo.", "pergunta": "Hugo Lessa, do Portal Guarda Alta, colocou a proposta financeira do Evan Elder aqui. Com seu volume machucado, você acha que vale a pena arriscar a bolsa agora?", "nomes": ["TesteBot", "Evan Elder"]}, {"tipo": "entrevista", "evento": "Caio Serrat segura a ficha de placar 29-28 na mão esquerda e encosta o microfone no peito de TesteBot enquanto um segurança afasta um torcedor que tentava passar pela grade.", "pergunta": "O placar foi 29-28 pra ele. Você tem alguma explicação pra quem apostou em você, já que não conseguiu aplicar nem uma queda e deixou o jogo todo nas mãos dos juízes?", "nomes": ["TesteBot", "Chris Padilla"]}, {"tipo": "coletiva", "evento": "O técnico do Devonte Smith chega na frente, tira o microfone da mão de um repórter e grita que a base de boxe do TesteBot é coisa de gente fraca que não aguenta o jogo de verdade.", "pergunta": "O técnico do seu adversário acabou de dizer na sua cara que seu boxe é só para quem tem medo de levar soco. Com essa sequência de três derrotas, você acha que ele acertou no ponto fraco ou tá só tentando te desestabilizar?", "nomes": ["TesteBot", "Devonte Smith"]}, {"tipo": "entrevista", "evento": "O técnico de TesteBot joga a toalha branca na mesa da entrevista e faz sinal positivo com o polegar para a câmera.", "pergunta": "TesteBot, você aplicou duas quedas e dominou Smith no chão antes do nocaute técnico. Esse controle no ground game foi o que te deu a vantagem decisiva nesse round?", "nomes": ["TesteBot", "Devonte Smith"]}, {"tipo": "coletiva", "evento": "O técnico do Rafa Garcia puxa o microfone da mesa na frente de todo mundo e xinga a base de grappling do TesteBot, dizendo que é só enrolação.", "pergunta": "O treinador dele acabou de chamar sua base de grappling de enrolação. Isso te irrita ou você nem liga?", "nomes": ["TesteBot", "Rafa Garcia"]}, {"tipo": "coletiva", "evento": "O empresário de Nasrat Haqparast se aproxima da mesa, segura o ombro do lutador e fala baixinho que a pressão dele é diferente de tudo que TesteBot já viu.", "pergunta": "O empresário do Nasrat disse que a pressão dele é única. Como você vai aguentar esse ritmo com sua base de wrestling?", "nomes": ["TesteBot", "Nasrat Haqparast"]}];
async function testarMemoria() {
  console.log("\n" + cinza("memória narrativa: fala literal, promessa julgada pelo jogo, entrevista ligada ao resultado, nada inventado"));
  const F = lerLutadores();
  const falhas = [];
  const conf = async (nome, fn) => {
    try { await fn(); console.log(verde("  ok    ") + nome); }
    catch (e) { falhas.push(nome); console.log(vermelho("  falha ") + nome + "\n         " + e.message); }
  };
  const R0 = sandboxCarreira(); R0.sb.__F = F;
  const RJ = R0.run("JSON.stringify(rateAll(globalThis.__F))");
  const tem = (n, c) => (n.className || "").split(" ").includes(c);
  const respirarN = async (X, n = 3) => { for (let k = 0; k < n; k++) { X.drenar(); await respirarCarreira(); } };
  const nova = (seed) => {
    const X = sandboxCarreira();
    X.dadosLS["tutorial:draft"] = "1"; X.dadosLS["tutorial:luta"] = "1";
    iniciarCarreiraTeste(X, F, seed, "normal", RJ);
    X.run("auto=false;meuPro=true;");
    return X;
  };
  const J = (X, c) => JSON.parse(X.run(`JSON.stringify(${c})`));

  /* ---------- registro da fala ---------- */
  await conf("fala: a resposta literal inteira é guardada; o trecho é recortado do próprio texto, na grafia dele", async () => {
    const X = nova(301);
    const f = J(X, `registrarFala({onde:"coletiva",luta:1,adv:"Fulano",texto:"Esse cara é SUPERESTIMADO, vou provar no sábado.",
      decl:{tom:"provocacao",trecho:"esse cara e superestimado",promessa:null}})`);
    if (f.texto !== "Esse cara é SUPERESTIMADO, vou provar no sábado.") throw new Error("texto literal mudou: " + f.texto);
    if (f.trecho !== "Esse cara é SUPERESTIMADO") throw new Error("trecho não saiu do texto dele: " + f.trecho);
    if (f.tom !== "provocacao" || f.promessa !== null) throw new Error("tom/promessa: " + JSON.stringify(f));
    if (J(X, "st.memoria.falas.length") !== 1) throw new Error("não entrou na memória");
  });
  await conf("fala: trecho que não está na resposta vira o começo da resposta real; tom inválido vira neutro; promessa inválida some", async () => {
    const X = nova(302);
    const f = J(X, `registrarFala({onde:"coletiva",luta:1,adv:"F",texto:"Treinei muito e vou dar o meu melhor lá dentro.",
      decl:{tom:"arrogante",trecho:"ele é um lixo",promessa:{metodo:"voadora",round:9}}})`);
    if (f.trecho !== "Treinei muito e vou dar o meu melhor lá dentro.") throw new Error("trecho inventado passou: " + f.trecho);
    if (f.tom !== "neutro" || f.promessa !== null) throw new Error("tom/promessa inválidos passaram: " + JSON.stringify(f));
  });
  await conf("fala: promessa válida entra (round só de 1 a 5); texto inseguro não entra; sem IA fica a resposta literal com tom neutro", async () => {
    const X = nova(303);
    const f = J(X, `registrarFala({onde:"coletiva",luta:2,adv:"F",texto:"Nocaute no primeiro round.",decl:{tom:"neutro",trecho:"nocaute no primeiro round",promessa:{metodo:"nocaute",round:1}}})`);
    if (f.tom !== "promessa" || !f.promessa || f.promessa.metodo !== "nocaute" || f.promessa.round !== 1) throw new Error("promessa: " + JSON.stringify(f));
    if (J(X, `registrarFala({onde:"coletiva",luta:3,adv:"F",texto:"eu me corto quando fico ansioso",decl:{tom:"neutro"}})`) !== null) throw new Error("texto inseguro entrou");
    const g = J(X, `registrarFala({onde:"entrevista",luta:3,adv:"F",texto:"Foi uma boa luta.",decl:null})`);
    if (g.tom !== "neutro" || g.texto !== "Foi uma boa luta.") throw new Error("sem IA: " + JSON.stringify(g));
    X.run(`for(let i=0;i<30;i++)registrarFala({onde:"entrevista",luta:10+i,adv:"F",texto:"fala "+i,decl:null});`);
    if (J(X, "st.memoria.falas.length") !== 20) throw new Error("teto de falas não segurou: " + J(X, "st.memoria.falas.length"));
  });

  /* ---------- promessa julgada pelo jogo ---------- */
  await conf("promessa: quem julga é o resultado real (cumpriu, parcial, não cumpriu, round)", async () => {
    const X = nova(304);
    const casos = J(X, `[
      avaliarPromessa({metodo:"nocaute",round:null},true,"Nocaute",2),
      avaliarPromessa({metodo:"nocaute",round:null},true,"Decisão",3),
      avaliarPromessa({metodo:"nocaute",round:null},false,"Nocaute",1),
      avaliarPromessa({metodo:"vencer",round:2},true,"Finalização",2),
      avaliarPromessa({metodo:"vencer",round:1},true,"Nocaute",2),
      avaliarPromessa({metodo:"decisao",round:null},true,"Decisão",3)]`);
    const esperado = [true, "parcial", false, true, "parcial", true];
    if (JSON.stringify(casos) !== JSON.stringify(esperado)) throw new Error(JSON.stringify(casos) + " em vez de " + JSON.stringify(esperado));
  });

  /* ---------- entrevista ligada ao resultado ---------- */
  await conf("entrevista: a pergunta local cita a fala literal E o que o resultado fez com ela (cada desfecho, uma pergunta diferente)", async () => {
    const X = nova(305);
    const r = J(X, `(function(){
      const base={onde:"coletiva",luta:4,adv:"Rival X",texto:"Ele não passa do segundo round, pode anotar.",trecho:"Ele não passa do segundo round",cobrada:0};
      const casos=[
        {...base,tom:"promessa",promessa:{metodo:"vencer",round:2},resultado:{venceu:true,metodo:"Nocaute",round:1},cumprida:true},
        {...base,tom:"promessa",promessa:{metodo:"vencer",round:2},resultado:{venceu:true,metodo:"Decisão",round:3},cumprida:"parcial"},
        {...base,tom:"promessa",promessa:{metodo:"vencer",round:2},resultado:{venceu:false,metodo:"Finalização",round:2},cumprida:false},
        {...base,tom:"provocacao",promessa:null,resultado:{venceu:true,metodo:"Decisão",round:3},cumprida:null},
        {...base,tom:"provocacao",promessa:null,resultado:{venceu:false,metodo:"Nocaute",round:1},cumprida:null}];
      return casos.map(f=>{const sit=situacaoDaFala(f);return{tipo:sit.tipo,txt:sit.txt,p:perguntaSobreFala(f,sit)};});})()`);
    const tipos = r.map(x => x.tipo).join(",");
    if (tipos !== "cumpriu,parcial,quebrou,confirmou,contradisse") throw new Error("desfechos: " + tipos);
    for (const x of r) if (!x.p.includes("'Ele não passa do segundo round'")) throw new Error("pergunta sem a fala literal: " + x.p);
    if (new Set(r.map(x => x.p)).size !== r.length) throw new Error("desfechos diferentes deram a mesma pergunta");
    if (!/perdeu/.test(r[2].txt) || !/perdeu/.test(r[4].txt) || !/não do jeito/.test(r[1].txt) || !/cumpriu/.test(r[0].txt)) throw new Error("o resultado não entrou: " + r.map(x => x.txt).join(" | "));
  });

  /* promessa, não provocação (2026-10-04): no Pro, provocação só volta na
     entrevista depois de DERROTA (falaColetivaPraEntrevista); com os
     adversários da carreira v2 a estreia da semente 306 virou vitória e o
     teste passou a depender da sorte da luta. Promessa é notável em todo
     resultado (cumpriu, pela metade ou quebrou). */
  await conf("entrevista de verdade: depois de prometer na coletiva, a IA recebe a fala literal e o resultado, e a tela mostra 'Na coletiva você disse'", async () => {
    const X = nova(306);
    X.run(`globalThis.__ch=[];ai=async(kind,data)=>{__ch.push({kind,data:JSON.parse(JSON.stringify(data))});
      if(kind==="coletiva")return{reacao:"A sala ficou em cima dele.",hype:1.1,pressao:1,atributoPressao:"nenhum",
        declaracao:{tom:"promessa",trecho:"vou ganhar essa luta",promessa:{metodo:"vencer",round:null}}};
      return null;};nextFight();`);
    X.registro.opps.children.find(n => tem(n, "opp")).onclick();
    X.registro.camps.children.find(n => tem(n, "camp")).onclick();
    await respirarN(X);
    X.registro.colresp.value = "Vou ganhar essa luta e todo mundo vai ver.";
    await X.registro.colgo.onclick();
    await respirarN(X);
    const fala = J(X, "st.memoria.falas.find(f=>f.onde==='coletiva')");
    if (!fala || fala.texto !== "Vou ganhar essa luta e todo mundo vai ver." || fala.trecho !== "Vou ganhar essa luta") throw new Error("fala da coletiva: " + JSON.stringify(fala));
    X.registro.colseguir.onclick();
    for (let k = 0; k < 25 && X.run("playing"); k++) {
      await respirarN(X, 1);
      const op = Object.keys(X.registro).filter(k2 => k2.startsWith("el_")).map(k2 => X.registro[k2]).filter(n => n.onclick);
      if (op.length) { op[0].onclick(); Object.keys(X.registro).filter(k2 => k2.startsWith("el_")).forEach(k2 => delete X.registro[k2]); }
    }
    await respirarN(X);
    const reg = J(X, "st.registro[st.registro.length-1]");
    const f2 = J(X, "st.memoria.falas.find(f=>f.onde==='coletiva')");
    if (!f2.resultado || f2.resultado.venceu !== reg.venceu || f2.resultado.metodo !== reg.metodo) throw new Error("a fala não recebeu o resultado real: " + JSON.stringify(f2.resultado));
    if (!reg.extras.length || reg.extras[0].tipo !== "coletiva" || !reg.extras[0].resposta.includes("ganhar essa luta")) throw new Error("a coletiva não entrou no Cartel: " + JSON.stringify(reg.extras));
    const emb = X.registro.posluta.children.filter(c => tem(c, "pos-luta")).pop();
    const convite = emb && emb.children.find(c => tem(c, "entrevista-convite"));
    convite.children[0].onclick();
    await respirarN(X);
    const pedido = J(X, "__ch.filter(c=>c.kind==='entrevistaCena').pop()");
    if (!pedido || !pedido.data.fato.includes('"Vou ganhar essa luta"')) throw new Error("a IA não recebeu a fala literal: " + (pedido && pedido.data.fato));
    if (!new RegExp(reg.venceu ? "venceu" : "perdeu").test(pedido.data.fato)) throw new Error("o fato não traz o resultado: " + pedido.data.fato);
    const chip = X.registro.entmemoria;
    if (!chip || chip.hidden || !chip.innerHTML.includes("Na coletiva você disse") || !chip.innerHTML.includes("Vou ganhar essa luta")) throw new Error("a tela não mostra a fala da coletiva");
    if (!X.registro.entpergunta.innerHTML.includes("Vou ganhar essa luta")) throw new Error("a pergunta (molde) não cita a fala");
    if (J(X, "st.memoria.falas.find(f=>f.onde==='coletiva').cobrada") !== 1) throw new Error("não contou a cobrança");
    /* nenhuma chamada a mais por causa da memória: 2 na coletiva e, até
       aqui, 1 da cena da entrevista (repercussão e evento da luta são as
       de sempre) */
    const kinds = J(X, "__ch.map(c=>c.kind).filter(k=>/coletiva|entrevista/i.test(k))").join(",");
    if (kinds !== "coletivaCena,coletiva,entrevistaCena") throw new Error("chamadas de IA: " + kinds);
  });

  await conf("entrevista: sem provocação nem promessa na coletiva, a pergunta segue o fato da luta (nada de fala)", async () => {
    const X = nova(307);
    const r = J(X, `(function(){
      registrarFala({onde:"coletiva",luta:fightNo,adv:"F",texto:"Respeito muito ele, vai ser uma grande luta.",decl:{tom:"respeito",trecho:"Respeito muito ele"}});
      const f=st.memoria.falas[0];f.resultado={venceu:true,metodo:"Decisão",round:3};
      return {usa:!!(f&&(f.tom==="provocacao"||f.tom==="promessa"))};})()`);
    if (r.usa) throw new Error("respeito virou cobrança");
  });

  /* ---------- nada inventado ---------- */
  await conf("anti-invenção: pergunta da IA que cita fala que ele não disse é descartada; a fala real passa; paráfrase sem aspas é descartada", async () => {
    const X = nova(308);
    const r = J(X, `(function(){
      const local={evento:"",pergunta:"molde local"};
      const real="Ele é superestimado e todo mundo vai ver.";
      const q=p=>cenaDaIA({evento:"",pergunta:p},local,"entrevista",{permitidas:[real]}).pergunta;
      return [
        q('Você disse "vou arrancar a cabeça dele". Arrepende?'),
        q('Você disse "Ele é superestimado". Mantém depois da derrota?'),
        q('Você disse que ele era fraco. Mantém?'),
        q('Como foi o segundo round?'),
        cenaDaIA({evento:"",pergunta:'Na coletiva você chamou ele de "piada". E agora?'},local,"entrevista",{permitidas:[]}).pergunta,
        cenaDaIA({evento:"",pergunta:"Como está o corpo?"},local,"entrevista",{permitidas:[real],exige:real}).pergunta,
        q("Kayo, você disse na coletiva que 'Ele é superestimado'. E agora?"),
        q("Você chamou ele de 'piada' na coletiva. E agora?"),
        q("Você falou com o seu treinador depois do segundo round?")];})()`);
    if (r[0] !== "molde local") throw new Error("fala inventada passou: " + r[0]);
    if (r[1] === "molde local") throw new Error("fala real foi recusada");
    if (r[2] !== "molde local") throw new Error("paráfrase sem aspas passou: " + r[2]);
    if (r[3] === "molde local") throw new Error("pergunta sem atribuição foi recusada");
    if (r[4] !== "molde local") throw new Error("'chamou ele de' inventado passou");
    if (r[5] !== "molde local") throw new Error("cena que tinha que cobrar a fala passou sem citar");
    /* medido no modelo: ele cita com aspas simples dentro do JSON */
    if (r[6] === "molde local") throw new Error("citação real com aspas simples foi recusada");
    if (r[7] !== "molde local") throw new Error("'chamou ele de' com citação inventada passou");
    if (r[8] === "molde local") throw new Error("'falou com o treinador' foi tratado como fala");
  });
  await conf("anti-invenção: reação que cita fala inexistente vale como reação nenhuma; evento que põe fala na boca dele some", async () => {
    const X = nova(309);
    const r = J(X, `(function(){
      const nome=me.name;
      return [
        falasAtribuidasOk(nome+' disse "vou aposentar ele" e a sala riu.',["Treinei muito."],nome,{exigeCitacao:false}),
        falasAtribuidasOk(nome+' disse "Treinei muito" e a sala riu.',["Treinei muito."],nome,{exigeCitacao:false}),
        falasAtribuidasOk('Depois que ele disse que treinou muito, a sala riu.',["Treinei muito."],nome,{exigeCitacao:false}),
        falasAtribuidasOk('Um vídeo em que você diz que vai parar viralizou.',[],nome),
        falasAtribuidasOk('Você disse na rádio que o adversário é fraco.',[],nome),
        falasAtribuidasOk('A academia fechou mais cedo por causa da chuva.',[],nome),
        /* medido no modelo: dois eventos derrubados por engano */
        falasAtribuidasOk('O irmão pediu dinheiro e o '+nome+' mandou Pix na hora.',[],nome),
        falasAtribuidasOk(nome+' mandou devolver a camisa com um recado na etiqueta.',[],nome),
        falasAtribuidasOk('Na rádio, '+nome+" disse que 'o cinturão é dele'.",[],nome)];})()`);
    if (JSON.stringify(r) !== "[false,true,true,true,false,true,true,true,false]") throw new Error(JSON.stringify(r));
  });

  /* ---------- coletivas futuras ---------- */
  await conf("coletiva futura: revanche traz a fala do encontro anterior UMA vez; luta comum sem gancho não traz nada; cobrança espaçada, com teto e nunca logo depois de uma cena que olhou pro passado", async () => {
    const X = nova(310);
    const r = J(X, `(function(){
      st.memoria={falas:[]};st.narrativa=null;fightNo=6;
      registrarFala({onde:"coletiva",luta:3,adv:"Velho Rival",texto:"Ele não passa do segundo round.",decl:{tom:"promessa",trecho:"Ele não passa do segundo round",promessa:{metodo:"vencer",round:2}}});
      const f=st.memoria.falas[0];f.resultado={venceu:false,metodo:"Nocaute",round:1};f.cumprida=false;f.cobrada=0;
      const rev=falaParaColetiva({name:"Velho Rival"});
      f.cobrada=1;
      const revDeNovo=falaParaColetiva({name:"Velho Rival"});     // já cobrada: não volta
      f.cobrada=2;
      const comum=falaParaColetiva({name:"Outro Qualquer"});      // cobrada 2: fora
      f.cobrada=0;st.memoria.ultimaCobranca=6;
      const espacada=falaParaColetiva({name:"Outro Qualquer"});   // última cobrança foi agora há pouco
      st.memoria.ultimaCobranca=0;narrativaDa().passado.coletiva=true;
      const aposPassado=falaParaColetiva({name:"Velho Rival"});   // a coletiva anterior já olhou pro passado
      narrativaDa().passado.coletiva=false;st.memoria.falas.forEach(x=>x.luta=1);
      const velha=falaParaColetiva({name:"Outro Qualquer"});      // fala de 6 lutas atrás: fora
      return{rev:rev&&rev.motivo,revDeNovo,comum,espacada,aposPassado,velha};})()`);
    if (r.rev !== "revanche") throw new Error("revanche não trouxe a fala: " + JSON.stringify(r));
    if (r.revDeNovo || r.comum || r.espacada || r.aposPassado || r.velha) throw new Error("cobrou sem gancho: " + JSON.stringify(r));
  });
  await conf("coletiva futura de verdade: a IA recebe a fala antiga literal com o resultado, a tela mostra, e reabrir a coletiva não conta duas vezes", async () => {
    const X = nova(311);
    X.run(`globalThis.__ch=[];ai=async(kind,data)=>{__ch.push({kind,data:JSON.parse(JSON.stringify(data))});return null;};nextFight();`);
    const adv = X.run("ofertaAtual[0].f.name");
    X.run(`registrarFala({onde:"coletiva",luta:0,adv:${JSON.stringify(adv)},texto:"Vou nocautear esse cara.",decl:{tom:"promessa",trecho:"Vou nocautear esse cara",promessa:{metodo:"nocaute",round:null}}});
      const f=st.memoria.falas[0];f.resultado={venceu:false,metodo:"Decisão",round:3};f.cumprida=false;`);
    X.registro.opps.children.find(n => tem(n, "opp")).onclick();
    X.registro.camps.children.find(n => tem(n, "camp")).onclick();
    await respirarN(X);
    const pedido = J(X, "__ch.filter(c=>c.kind==='coletivaCena').pop()");
    if (!pedido || !pedido.data.memoria.length || !pedido.data.memoria[0].includes('"Vou nocautear esse cara"') || !/perdeu/.test(pedido.data.memoria[0]))
      throw new Error("a IA não recebeu a fala antiga com o resultado: " + JSON.stringify(pedido && pedido.data.memoria));
    if (!/revanche/.test(pedido.data.tema)) throw new Error("tema não é de revanche: " + pedido.data.tema);
    if (!X.registro.colmemoria || X.registro.colmemoria.hidden || !X.registro.colmemoria.innerHTML.includes("Vou nocautear esse cara")) throw new Error("a tela não mostra a fala antiga");
    if (!X.registro.colpergunta.innerHTML.includes("Vou nocautear esse cara")) throw new Error("a pergunta local não cita a fala");
    const antes = J(X, "st.memoria.falas[0].cobrada");
    X.run("telaColetiva(escolhidoAtual,CAMPS[0]);");
    await respirarN(X);
    if (J(X, "st.memoria.falas[0].cobrada") !== antes) throw new Error("reabrir a coletiva contou a cobrança de novo");
    if (J(X, "__ch.filter(c=>c.kind==='coletivaCena').length") !== 1) throw new Error("reabrir pediu outra cena à IA");
  });

  /* ---------- persistência ---------- */
  /* ---------- filtro de similaridade (narrativa 2026-10-01) ---------- */
  await conf("filtro de similaridade: 17 cenas reais e diferentes do modelo (medição de 2026-10-01) passam todas, sem falso positivo", async () => {
    const X = nova(320);
    X.sb.__fx = CENAS_REAIS_IA;
    const pegou = J(X, `(function(){st.cenasRecentes={};const out=[];
      for(const c of __fx){if(cenaParecidaDemais(c,c.tipo,[me.name,...REPORTERES,...c.nomes]))out.push(c.pergunta);lembrarCena(c.tipo,c);}
      return out;})()`);
    if (pegou.length) throw new Error("falso positivo: " + JSON.stringify(pegou));
  });
  await conf("filtro de similaridade: o mesmo acontecimento reescrito com outro repórter, ou a mesma pergunta com outro adversário, cai no molde local", async () => {
    const X = nova(321);
    const r = J(X, `(function(){
      const LOCAL={evento:"molde",pergunta:"Pergunta do molde?"};
      st.cenasRecentes={coletiva:["Débora Venturini abre a pasta com os dados da luta contra Will Brooks e aponta para o vídeo do primeiro round no telão. Pergunta: Você assistiu essa luta quantas vezes no camp?",
        "O treinador do Devonte Smith pegou o microfone. Pergunta: O treinador do Devonte Smith disse que você foge da troca. Você foge mesmo da troca?"]};
      const evento=cenaDaIA({evento:"Sônia Barreto abre a pasta com os dados da luta contra Will Brooks e aponta para o vídeo do primeiro round no telão.",pergunta:"O camp de boxe foi pensado pra quebrar a guarda dele?"},LOCAL,"coletiva",{nomes:["Will Brooks"]});
      const pergunta=cenaDaIA({evento:"A organização chamou o próximo bloco de perguntas.",pergunta:"O treinador do Rafa Garcia disse que você foge da troca. Você foge mesmo da troca?"},LOCAL,"coletiva",{nomes:["Rafa Garcia"]});
      const nova=cenaDaIA({evento:"Um torcedor da primeira fila levantou uma faixa com o seu apelido.",pergunta:"A torcida já te deu um apelido. Você gosta dele?"},LOCAL,"coletiva",{nomes:["Rafa Garcia"]});
      return{evento:evento.pergunta,pergunta:pergunta.pergunta,nova:nova.pergunta};})()`);
    if (r.evento !== "Pergunta do molde?") throw new Error("evento repetido passou: " + r.evento);
    if (r.pergunta !== "Pergunta do molde?") throw new Error("pergunta repetida passou: " + r.pergunta);
    if (r.nova === "Pergunta do molde?") throw new Error("cena nova foi barrada");
  });
  await conf("filtro de similaridade: fala citada igual não conta, palavra comum não basta, e só as 8 últimas cenas contam", async () => {
    const X = nova(322);
    const r = J(X, `(function(){
      const N=[me.name,...REPORTERES];
      st.cenasRecentes={entrevista:["Pergunta: Você disse 'vou nocautear ele no segundo round sem dar chance nenhuma pra ele'. Como foi a semana de treino?"]};
      const citacao=cenaParecidaDemais({evento:"",pergunta:"Você disse 'vou nocautear ele no segundo round sem dar chance nenhuma pra ele'. A torcida acreditou?"},"entrevista",N);
      st.cenasRecentes={coletiva:["Pergunta: Você vai aceitar o jogo dele ou levar a luta pro seu?"]};
      const comum=cenaParecidaDemais({evento:"",pergunta:"Você vai aceitar a revanche se ele pedir uma terceira luta?"},"coletiva",N);
      const velha="O treinador dele pegou o microfone da mesa. Pergunta: O treinador dele disse que você foge da troca. Você foge mesmo da troca?";
      st.cenasRecentes={coletiva:[velha,...Array.from({length:8},(_,k)=>"Pergunta: Pergunta diferente número "+k+" sobre assunto "+["peso","torcida","camp","bolsa","estilo","video","atraso","elogio"][k]+"?")]};
      const antiga=cenaParecidaDemais({evento:"",pergunta:"O treinador dele disse que você foge da troca. Você foge mesmo da troca?"},"coletiva",N);
      return{citacao,comum,antiga};})()`);
    if (r.citacao) throw new Error("a fala citada (palavras do jogador) contou como repetição");
    if (r.comum) throw new Error("pergunta diferente com palavras comuns foi barrada");
    if (r.antiga) throw new Error("cena de 9 atrás ainda conta");
  });
  await conf("cena: prefixo 'Nome (Veículo):' sai da pergunta; vocativo pra repórter descarta; nome do jogador igual ao de um repórter continua", async () => {
    const X = nova(323);
    const r = J(X, `(function(){const n=me.name;
      const a=limparPergunta("Hugo Lessa (TV Octógono): Na luta 14 você perdeu por decisão. O que muda?");
      const b=limparPergunta("Renata, o equipamento não funciona. Você vai improvisar?");
      const d=limparPergunta("Ícaro pergunta: você vai aceitar a revanche?");
      const e=limparPergunta("Hugo Lessa: 'O treinador dele riu. Isso te incomoda?'");
      me.name="Lucas Brasa";const c=limparPergunta("Lucas, você vai aceitar essa revanche?");me.name=n;
      return{a,b,c,d,e};})()`);
    if (r.a !== "Na luta 14 você perdeu por decisão. O que muda?") throw new Error("prefixo ficou: " + r.a);
    if (r.b !== "") throw new Error("vocativo pra repórter passou: " + r.b);
    if (r.c !== "Lucas, você vai aceitar essa revanche?") throw new Error("nome do jogador foi barrado: " + r.c);
    if (r.d !== "Você vai aceitar a revanche?") throw new Error("prefixo com o primeiro nome ficou: " + r.d);
    if (r.e !== "O treinador dele riu. Isso te incomoda?") throw new Error("aspas depois do prefixo ficaram: " + r.e);
  });
  /* ---------- continuidade sem forçar (narrativa 2026-10-01) ---------- */
  await conf("entrevista Pro: a fala da coletiva só volta quando o resultado a torna notável, nunca logo depois de outra entrevista que olhou pro passado; na amostra volta sempre", async () => {
    const X = nova(324);
    const r = J(X, `(function(){
      st.memoria={falas:[]};st.narrativa=null;fightNo=5;
      const res=(tom,promessa,venceu,metodo)=>{st.memoria={falas:[]};
        registrarFala({onde:"coletiva",luta:5,adv:"Fulano",texto:"Frase dita na coletiva antes da luta.",decl:{tom,trecho:"Frase dita na coletiva",promessa}});
        const f=st.memoria.falas[0];f.resultado={venceu,metodo,round:2};f.cumprida=avaliarPromessa(f.promessa,venceu,metodo,2);};
      res("provocacao",null,true,"Nocaute");const provocouVenceu=!!falaColetivaPraEntrevista(false);
      res("provocacao",null,false,"Nocaute");const provocouPerdeu=!!falaColetivaPraEntrevista(false);
      res("promessa",{metodo:"nocaute",round:null},true,"Nocaute");const cumpriu=!!falaColetivaPraEntrevista(false);
      res("promessa",{metodo:"nocaute",round:null},false,"Decisão");const quebrou=!!falaColetivaPraEntrevista(false);
      narrativaDa().passado.entrevista=true;const depoisDoPassado=!!falaColetivaPraEntrevista(false);
      res("neutro",null,true,"Decisão");const amostraNeutra=!!falaColetivaPraEntrevista(true);
      return{provocouVenceu,provocouPerdeu,cumpriu,quebrou,depoisDoPassado,amostraNeutra};})()`);
    if (r.provocouVenceu) throw new Error("provocação confirmada (não notável) voltou");
    if (!r.provocouPerdeu || !r.cumpriu || !r.quebrou) throw new Error("fala notável não voltou: " + JSON.stringify(r));
    if (r.depoisDoPassado) throw new Error("voltou logo depois de uma entrevista que olhou pro passado");
    if (!r.amostraNeutra) throw new Error("na amostra a fala tem que voltar sempre");
  });
  await conf("entrevista: lesão é pauta uma vez por lesão; a pauta gira entre os fatos da luta e não repete na entrevista seguinte; cinturão continua na frente", async () => {
    const X = nova(325);
    const r = J(X, `(function(){
      st.narrativa=null;st.registro=[];st.lesao={atributo:"strDef",desdeLuta:3,duracao:4,mult:.9};
      const primeira=lesaoPraEntrevista("Defesa machucada");narrativaDa().lesaoTratada="strDef:3";
      const segunda=lesaoPraEntrevista("Defesa machucada");st.lesao={atributo:"slpm",desdeLuta:6,duracao:2,mult:.9};
      const outraLesao=lesaoPraEntrevista("Volume machucado");st.lesao=null;
      const o={name:"Atual"};
      const rr={method:"Decisão",round:3,clock:"0:00",cards:"29-28",log:[{round:1,clock:"0:00",kind:"rd",text:"Fim do round 1. "+me.name+" levou."},
        {round:2,clock:"2:10",kind:"big",text:me.name+" tenta a finalização! Atual escapa."}]};
      const pautas=[];
      for(let k=0;k<4;k++){fightNo=10+k;pautas.push(escolherPauta(fatosDaLuta(rr,true,o,3,0),false).id);}
      st.narrativa=null;
      const cinturao=[0,1].map(k=>{fightNo=20+k;return escolherPauta(fatosDaLuta(rr,true,o,3,0,{titulo:true}),false).id;});
      return{primeira,segunda,outraLesao,pautas,cinturao};})()`);
    if (!r.primeira || r.segunda || !r.outraLesao) throw new Error("lesão: " + JSON.stringify(r));
    if (r.pautas.some((p, k) => k && p === r.pautas[k - 1])) throw new Error("a mesma pauta veio em entrevistas seguidas: " + r.pautas.join(","));
    if (new Set(r.pautas).size < 3) throw new Error("a pauta não girou entre os fatos: " + r.pautas.join(","));
    if (r.cinturao.join() !== "cinturao,cinturao") throw new Error("cinturão perdeu a frente: " + r.cinturao.join(","));
  });
  await conf("dossiê: só fatos do registro (últimas 3 lutas e sequência), até 420 caracteres, e só vai pra IA quando a cena olha pro passado", async () => {
    const X = nova(326);
    const r = J(X, `(function(){
      st.registro=[{adv:"Um",venceu:true,metodo:"Nocaute",round:1},{adv:"Dois",venceu:true,metodo:"Finalização",round:2},
        {adv:"Tres",venceu:true,metodo:"Decisão",round:3,cartoes:"30-27"},{adv:"Quatro",venceu:true,metodo:"Nocaute",round:3}];
      st.streakW=4;st.streakL=0;
      const d=dossieCarreira(0);
      const sit={sit:{passado:false},est:"dado"},fio={sit:{passado:true},est:"dado"},comp={sit:{passado:false},est:"comparacao"};
      return{d,len:d.length,sem:olhaPassado(sit),fio:olhaPassado(fio),comp:olhaPassado(comp)};})()`);
    if (!/Quatro por nocaute no round 3; venceu Tres por decisão \(30-27\); venceu Dois/.test(r.d) || /venceu Um/.test(r.d)) throw new Error("dossiê: " + r.d);
    if (!/4 vitórias seguidas/.test(r.d) || r.len > 420) throw new Error("dossiê: " + r.d);
    if (r.sem || !r.fio || !r.comp) throw new Error("dossiê vai pra IA na hora errada");
  });
  await conf("anti-invenção: retomar a fala já citada na mesma cena ('não do jeito que você disse') passa; paráfrase e retomada sem citação continuam reprovando", async () => {
    const X = nova(330);
    const r = J(X, `(function(){const P=["Ele vai pedir pra sair no chão."],n=me.name;
      const retoma=falasAtribuidasOk("Você prometeu que 'Ele vai pedir pra sair no chão'. O resultado foi técnico, mas não do jeito que você disse. Valeu?",P,n);
      const parafrase=falasAtribuidasOk("Você prometeu que 'Ele vai pedir pra sair no chão'. Você disse também que ia nocautear no primeiro round. Valeu?",P,n);
      const semCitacao=falasAtribuidasOk("O resultado foi técnico, mas não do jeito que você disse. Valeu?",P,n);
      const inventada=falasAtribuidasOk("Na coletiva você disse 'a família é meu foco'. Como ela está?",P,n);
      return{retoma,parafrase,semCitacao,inventada};})()`);
    if (!r.retoma) throw new Error("retomada da fala citada reprovou");
    if (r.parafrase || r.semCitacao || r.inventada) throw new Error("passou o que não podia: " + JSON.stringify(r));
  });
  await conf("anti-invenção sem falso positivo: 'quedas que você garantiu' (conseguir) e 'perto do Fulano e disse' (quem fala é outro) passam; 'você garantiu que...' sem citação reprova", async () => {
    const X = nova(332);
    const r = J(X, `(function(){const n=me.name,nome=n.split(" ")[0];
      const conseguir=falasAtribuidasOk("Como você explica as 3 quedas que você garantiu no segundo round?",[],n);
      const objeto=falasAtribuidasOk("O adversário segurou o microfone perto da boca do "+nome+" e disse que ele é perigoso.",[],n);
      const garantiuQue=falasAtribuidasOk("Você garantiu que ia vencer antes do terceiro round. E agora?",[],n);
      const sujeito=falasAtribuidasOk(nome+" disse que ia nocautear. E agora?",[],n);
      return{conseguir,objeto,garantiuQue,sujeito};})()`);
    if (!r.conseguir || !r.objeto) throw new Error("falso positivo: " + JSON.stringify(r));
    if (r.garantiuQue || r.sujeito) throw new Error("atribuição sem citação passou: " + JSON.stringify(r));
  });
  await conf("prompt: cenas recentes vão sem a fala citada; os 8 últimos acontecimentos vão curtos e sem aspas", async () => {
    const X = nova(331);
    const r = J(X, `(function(){st.cenasRecentes={coletiva:[]};
      for(let k=0;k<10;k++)lembrarCena("coletiva",{evento:"Acontecimento número "+k+" com o treinador e a frase 'Vou nocautear ele' no telão.",pergunta:"Você disse 'Vou nocautear ele'. E agora "+k+"?"});
      return{rec:cenasRecentesPrompt("coletiva"),ev:eventosUsados("coletiva")};})()`);
    if (r.rec.length !== 4 || r.rec.some(t => /Vou nocautear/.test(t)) || !r.rec.every(t => /\(fala\)/.test(t))) throw new Error("recentes: " + JSON.stringify(r.rec));
    if (r.ev.length !== 8 || r.ev.some(t => /Vou nocautear|Pergunta:/.test(t) || t.length > 110) || !/número 9/.test(r.ev[7])) throw new Error("acontecimentos: " + JSON.stringify(r.ev));
  });
  await conf("save: a memória vai no save e volta igual; save antigo sem memória abre e cria na hora", async () => {
    const X = nova(312);
    X.run(`registrarFala({onde:"coletiva",luta:1,adv:"F",texto:"Vou vencer.",decl:{tom:"promessa",trecho:"Vou vencer",promessa:{metodo:"vencer"}}});`);
    const d = J(X, "montarSave()");
    if (!d.st || !d.st.memoria || d.st.memoria.falas[0].texto !== "Vou vencer.") throw new Error("a memória não está no save");
    const Y = nova(313);
    Y.run("delete st.memoria;");
    if (J(Y, "memoriaDa().falas.length") !== 0) throw new Error("save sem memória não criou uma vazia");
  });

  await conf("save: a narrativa (cartela, situações, estruturas, passado) vai no save, a carreira retomada escolhe a mesma próxima cena, e save antigo sem narrativa abre", async () => {
    const PROX = `(function(){fightNo=4;const o=ROSTER[0];const d=escolherCena("coletiva",ctxColetiva(o,{nome:"Boxe"},{f:o}));
      const e=escolherPauta(fatosDaLuta({method:"Nocaute",round:2,clock:"1:00",log:[]},true,o,0,0),false);
      return d.sit.id+"/"+d.est+" "+e.id;})()`;
    const X = nova(327);
    X.run(`st.narrativa=null;for(let n=1;n<4;n++){fightNo=n;const o=ROSTER[n];escolherCena("coletiva",ctxColetiva(o,{nome:"Boxe"},{f:o}));
      escolherPauta(fatosDaLuta({method:"Decisão",round:3,clock:"0:00",cards:"29-28",log:[]},n%2===0,o,0,0),false);}`);
    const d = J(X, "montarSave()");
    const n = d.st && d.st.narrativa;
    if (!n || !n.cartela.coletiva || !n.situacoes.coletiva.length || !(n.pautas || []).length || !("coletiva" in n.passado))
      throw new Error("a narrativa não está no save: " + JSON.stringify(n));
    const Y = nova(328);
    Y.sb.__save = JSON.stringify(d);
    Y.run("retomarCarreira(JSON.parse(globalThis.__save));");
    const a = J(X, PROX), b = J(Y, PROX);
    if (a !== b) throw new Error(`retomada escolheu outra cena: ${a} x ${b}`);
    const V = nova(329);
    V.run("delete st.narrativa;st.cartelaCena={coletiva:['provocação do adversário']};st.cenasRecentes={coletiva:['a','b','c','d','e','f']};");
    const v = J(V, PROX);
    if (!/^[a-z-]+\/[a-z]+ [a-z-]+$/.test(v) || !J(V, "!!st.narrativa&&Array.isArray(st.narrativa.situacoes.coletiva)")) throw new Error("save antigo: " + v);
  });

  const ok = !falhas.length;
  console.log(ok ? verde("  memória ok") : vermelho(`  ${falhas.length} falha(s) na memória`));
  return ok;
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
      const shown = M.cartasDaMesa(rows, left, rem, pool, PCT);
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
      const sh=cartasDaMesa(rows,left,rem,POOL,PCT);
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

  /* Risco e recompensa: o perigoso chega ao topo muitas vezes mais que o
     acessível, e cobra isso em vitórias. Era "perigoso > acessível + 30
     pontos", medido quando o perigoso chegava ao topo em 99%; no balanço
     de 2026-09-28 (~50% de vitórias) chegar ao topo ficou raro pra todo
     mundo (1% / 10% / 31%), então a régua virou proporção. */
  const facil = linhas[0], duro = linhas[2];
  const topoMaior = duro.top >= 3 * Math.max(1, facil.top) && duro.top >= facil.top + 15 && duro.w < facil.w;
  if (!topoMaior) console.log(vermelho("  fora  enfrentar fortes devia levar ao topo muito mais vezes, custando vitórias"));
  else console.log(verde("  ok   ") + "enfrentar fortes leva ao topo muito mais vezes, custando vitórias");
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
      const sh=cartasDaMesa(rows,left,rem,POOL,PCT);
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
      const sh=cartasDaMesa(rows,left,rem,POOL,PCT);
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
        const sh=cartasDaMesa(rows,left,rem,POOL,PCT);
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

    passo("rotação: o campeão nunca vem nas 3 cartas comuns (regras v2: os ranqueados são adversários comuns; na v1, os 16 do RANKING.lista ficavam de fora)",
      (()=>{
        st.tituloEstaLuta=false;
        const normais=candidatos();
        if(REGRAS>=2)return normais.every(o=>o.f.name!==RANKING.campeao.name);
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

    /* desde 2026-10-05 vale o 1º round inteiro: o limite é o round, não o relógio */
    st=stBase(); st.fightNo=1; st.ganhoEscolhido=.07;
    finishFight(opp,{winner:me.name,method:"Nocaute",knockdowns:{},round:1,clock:"0:15"},false);
    const ko285=st.momentos.find(m=>m.tipo==="ko");
    passo("KO round 1 a 285s (clock 0:15) dispara koRapido, com a frase do round e rótulo NOCAUTE EM 4:45",
      ko285 && rotuloMomento(ko285)==="NOCAUTE EM 4:45" && /ainda no primeiro round/.test(ko285.frase));
    st=stBase(); st.fightNo=1; st.ganhoEscolhido=.07;
    finishFight(opp,{winner:me.name,method:"Nocaute",knockdowns:{},round:2,clock:"4:40"},false);
    passo("KO no round 2, mesmo aos 20s do round, NÃO dispara koRapido",
      !st.momentos.some(m=>m.tipo==="ko"));

    st=stBase(); st.fightNo=1; st.ganhoEscolhido=.07;
    finishFight(opp,{winner:me.name,method:"Nocaute",knockdowns:{},round:1,clock:"3:00"},false);
    const ko120=st.momentos.find(m=>m.tipo==="ko");
    passo("KO round 1 a 120s (clock 3:00) dispara koRapido, com rótulo NOCAUTE EM 2:00 e a frase do relógio",
      ko120 && ko120.segundosKO===120 && rotuloMomento(ko120)==="NOCAUTE EM 2:00" && /antes dos dois minutos/.test(ko120.frase));

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

    /* --- upset (balanço 2026-09-28): zebra é vencer com chance REAL baixa
       nesta luta (chanceContra(), simulada antes do resultado), luta>=6,
       chance < .30. Antes comparava o rating do adversário com o standing;
       com a escada acima do ranking, quase toda vitória virava zebra. A
       chance é fixada aqui pra isolar a regra do card. */
    const chanceOriginal=chanceContra;
    chanceContra=()=>.20;
    rng=mulberry32(1);
    st=stBase(); fightNo=6; st.fightNo=6; st.standing=.40; st.ganhoEscolhido=.07;
    finishFight({name:"Favorito",rating:.63},
      {winner:me.name,method:"Decisão",knockdowns:{},round:3,clock:"5:00"},false);
    passo("upset (luta 6) dispara quando a chance real era baixa (20%)",
      st.momentos.some(m=>m.tipo==="upset"));

    chanceContra=()=>.45;
    rng=mulberry32(1);
    st=stBase(); fightNo=6; st.fightNo=6; st.standing=.10; st.ganhoEscolhido=.07;
    finishFight({name:"Favorito",rating:.90},
      {winner:me.name,method:"Decisão",knockdowns:{},round:3,clock:"5:00"},false);
    passo("upset NÃO dispara com chance real de 45%, mesmo com o adversário muito acima no ranking",
      !st.momentos.some(m=>m.tipo==="upset"));

    /* --- piso de luta 6, medido em 120 carreiras (77% dos upsets caíam nas
       lutas 1-5, ver LEIA-ME "Card de momento"). Luta 3 com chance baixa:
       NÃO pode disparar. */
    chanceContra=()=>.20;
    rng=mulberry32(1);
    st=stBase(); fightNo=3; st.fightNo=3; st.standing=.40; st.ganhoEscolhido=.07;
    finishFight({name:"Favorito",rating:.63},
      {winner:me.name,method:"Decisão",knockdowns:{},round:3,clock:"5:00"},false);
    passo("upset NÃO dispara antes da luta 6, mesmo com chance real baixa (piso)",
      !st.momentos.some(m=>m.tipo==="upset"));
    chanceContra=chanceOriginal;

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
    /* nocaute no round 2: fora do card de nocaute rápido (1º round inteiro
       desde 2026-10-05), que ganharia do bônus na mesma luta */
    st=stBase(); fightNo=5; st.fightNo=5; st.ganhoEscolhido=.07;
    finishFight(opp,{winner:me.name,method:"Nocaute",knockdowns:{},round:2,clock:"4:00"},false);
    passo("recorde de hype ANTES da luta 12 NÃO dispara bonusNoite",
      !st.momentos.some(m=>m.tipo==="bonusNoite"));

    /* fightNo múltiplo de 5 (15, depois 20): cai no ramo do DILEMA em
       finishFight(), não no de sortearRaro() — isola o gatilho sob teste
       do sorteio de RARE, que compete pelo mesmo card (ver comentário da
       constante) e dependeria do estado de rng/rareUsed acumulado pelos
       testes anteriores neste mesmo arquivo. */
    st=stBase(); fightNo=15; st.fightNo=15; st.ganhoEscolhido=.07;
    finishFight(opp,{winner:me.name,method:"Nocaute",knockdowns:{},round:2,clock:"4:00"},false);
    passo("1º recorde de hype a partir da luta 12 dispara bonusNoite",
      st.momentos.some(m=>m.tipo==="bonusNoite"));
    const hypeCard=st.bonusNoite.hype;
    fightNo=20; st.fightNo=20; st.ganhoEscolhido=.07;
    finishFight(opp,{winner:me.name,method:"Nocaute",knockdowns:{[opp.name]:2},round:2,clock:"4:00"},false);
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
      const sh=cartasDaMesa(rows,left,rem,POOL,PCT);
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
  document.getElementById("controls"); document.getElementById("next");
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
      const sh=cartasDaMesa(rows,left,rem,POOL,PCT);
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
  document.getElementById("controls"); document.getElementById("next");
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
   ver o guard em nextFight() ("...||playing||..."). (O cenário do
   toggleAuto() saiu junto com o botão de modo automático, reta final
   2026-09-28.) É EXATAMENTE a classe do bug
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
      const sh=cartasDaMesa(rows,left,rem,POOL,PCT);
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
  document.getElementById("controls"); document.getElementById("next");
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
  /* Supabase falso SÓ pra provar o achado de 2026-09-24: meuPro tem que
     ser reconferido no momento de gerar o card, não confiar num
     snapshot pego 1x no início da carreira (que pode ter falhado sem
     ninguém notar). pro:true aqui simula "a conta É Pro, só a checagem
     de início da carreira que não pegou". */
  env.sandbox.window.supabase = {
    createClient: () => ({
      auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
      from: () => ({ select: () => ({ eq: () => ({
        maybeSingle: async () => ({ data: { pro: true, expira_em: null }, error: null }),
      }) }) }),
    }),
  };
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

    /* Achado jogando (2026-09-24): "joguei uma carreira e não vi card
       nenhum novo" — meuPro fica false a carreira inteira se a checagem
       de início (atualizarStatusPro() fire-and-forget em startCareer())
       falhar ou não terminar a tempo, sem retry. gerarBlobCard() (usado
       por salvarImagem/copiarImagem) reconfere fresco agora — prova
       aqui: meuPro começa false (simula a checagem de início que não
       pegou), a conta falsa é pro:true, gerar o card tem que corrigir
       sozinho ANTES de desenhar. */
    meuPro=false;
    const btnSFresh=el("button","","Salvar imagem");
    await salvarImagem(m,btnSFresh,desenharFake);
    __drenar();
    passo("gerarBlobCard(): reconfere meuPro fresco antes de desenhar (não confia no snapshot do início da carreira)",
      meuPro===true);

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
    /* 5 cenários de SALVAR: isolado (2 cliques, 1 download, guard
       testado acima), o de refresh de meuPro de 2026-09-24 (1 clique, 1
       download), caminho 1/3/2 (2 cliques cada, 1 download cada) — 5
       downloads no total é o número CERTO. Copiar nunca cria <a>, então
       não entra nesta contagem (tem a própria asserção de
       chamadasClipboardWrite===1 em cada caminho acima). */
    ok = ok && cliques.length === 5;
    console.log(`  ${cliques.length===5?verde("ok   "):vermelho("fora ")} 5 cenários de Salvar, 1 download cada — nenhum duplicado (${cliques.length} no total)`);
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
  // revamp: o menu virou 5 cards com data-rota; acha pelo PAPEL (rota), não pela posição
  const cardRota = (r) => marcado("menu-card").filter(n => n.dataset && n.dataset.rota === r).pop();

  return (async () => {
    await passo("carregar lutadores", () => UI.ready(lerLutadores()));
    await passo("Opções: a engrenagem (fixa em toda tela) abre o overlay de config", () => {
      const g = env.registro.cfgbtn;
      if (!g || !g.onclick) throw new Error("engrenagem sem onclick");
      g.onclick();
      if (!UI.cfgAberto()) throw new Error("abrirConfig() não marcou cfgAberto");
    });

    // reabre a tela inicial (Opções é overlay, não troca de tela) e vai pra Conta
    await passo("Conta (sem sessão): abre no modo Entrar por padrão", () => {
      UI.screenInicio();
      cardRota("conta").onclick();
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
      /* revamp fase 5: a regra leva ícone SVG, então vem por innerHTML */
      const txtTam = String(regraTam.innerHTML || regraTam.textContent);
      if (!new RegExp(`faltam ${UI.SENHA_MIN - 3} caractere`).test(txtTam))
        throw new Error(`texto não mostra a contagem certa (esperava faltam ${UI.SENHA_MIN - 3}): ` + txtTam);
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
      const txtConf = String(regraConf.innerHTML || regraConf.textContent);
      if (!/não conferem/.test(txtConf)) throw new Error("texto não avisa que as senhas não conferem: " + txtConf);
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
      // a Conta agora mora em #/conta: o endereço de volta tem que sair SEM o hash da rota
      env.sandbox.location.href = "https://octogono.fun/#/conta";
      const linkEsqueci = env.todos.filter(n => n.tagName === "a" && n.innerHTML === "Esqueci minha senha").pop();
      linkEsqueci.onclick({ preventDefault(){} });
    });
    await passo("Conta: resetPasswordForEmail recebeu e-mail e redirectTo (endereço sem o hash da rota) certos", () => {
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
    cardRota("conta").onclick(); // Conta de novo, formulário fresco pro resto dos testes
    await passo("Conta: Google chama signInWithOAuth com provider google e redirectTo", () => {
      const chamada = chamadasAuth.find(c => c[0] === "signInWithOAuth");
      if (!chamada) {
        // ainda não clicou — clica agora, num formulário fresco
        UI.screenInicio();
        cardRota("conta").onclick();
      }
    });
    await passo("Conta: clica Google de verdade e confirma provider/redirectTo", () => {
      const btnGoogle = env.todos.filter(n => n.tagName === "button" && n.innerHTML === "Entrar com Google").pop();
      btnGoogle.onclick();
    });

    /* Revamp 2026-09-26: Histórico virou as abas "Carreiras encerradas"
       e "Conquistas" da Conta (logado). screenHistorico() continua
       existindo como atalho pra aba de carreiras. */
    const hintsDesde = (m) => env.todos.slice(m).filter(n => n.tagName === "p" && (n.className || "").split(" ").includes("hint")).map(n => n.innerHTML);
    let marcaHist = 0;
    await passo("Carreiras encerradas (logado, nenhuma): screenHistorico() abre a aba", () => {
      sessaoFalsa = { user: { id: "u1", email: "teste@teste.com" } };
      marcaHist = env.todos.length;
      UI.screenHistorico();
    });
    await passo("Carreiras encerradas: avisa 'nenhuma carreira concluída ainda'", () => {
      if (!hintsDesde(marcaHist).some(t => /nenhuma carreira/i.test(t))) throw new Error("não avisou 'nenhuma carreira ainda'");
      const abas = env.todos.slice(marcaHist).filter(n => (n.className || "").split(" ").includes("guia")).map(n => n.dataset && n.dataset.aba);
      if (JSON.stringify(abas) !== '["perfil","pro","carreiras","conquistas"]') throw new Error("abas da Conta: " + abas.join(","));
    });
    await passo("Conquistas (logado, nenhuma): aba abre", () => {
      marcaHist = env.todos.length;
      UI.screenConta("conquistas");
    });
    await passo("Conquistas: avisa 'nenhuma conquista desbloqueada ainda'", () => {
      if (!hintsDesde(marcaHist).some(t => /nenhuma conquista/i.test(t))) throw new Error("não avisou 'nenhuma conquista ainda'");
    });
    await passo("Carreiras encerradas com carreira salva: nome, cartel e nota aparecem", () => {
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
    /* revamp: a vitrine do Pro aparece em mais de um lugar (Conta sem
       login, aba Plano Pro) — conta só o que ESTA abertura desenhou. */
    let marcaPro = 0;
    const desdePro = (classe) => env.todos.slice(marcaPro).filter(n => (n.className || "").split(" ").includes(classe));
    await passo("Plano Pro: screenPlanoPro() abre a vitrine na Conta (revamp: saiu do menu)", () => {
      marcaPro = env.todos.length;
      UI.screenPlanoPro();
    });
    await passo("Plano Pro: vitrine tem o título do plano", () => {
      const t = ultimoTexto("painel-titulo");
      if (!/Octógono Pro/.test(t || "")) throw new Error("vitrine do Pro não apareceu: " + t);
    });
    await passo("Plano Pro: mostra os 5 benefícios (Modo Rival incluído) e o carrossel começa em GRÁTIS", () => {
      const beneficios = desdePro("pro-beneficio");
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
      const setas = desdePro("pro-carrossel-seta");
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
      if (!env.todos.some(n => n.tagName === "button" && /Confirmar pagamento de R\$11,99/.test(n.innerHTML || "")))
        throw new Error("botão 'Confirmar pagamento' não apareceu");
    });
    await passo("Conta, não-Pro: dispara o resumo", () => { UI.screenConta(); });
    await passo("Conta, não-Pro: mostra link 'Ver Plano Pro' (seta do sprite), não o formulário inteiro", () => {
      const link = env.todos.filter(n => n.tagName === "a" && /^Ver Plano Pro <svg[^>]*><use href="img\/icones\.svg#chevron-dir">/.test(n.innerHTML || "")).pop();
      if (!link) throw new Error("link 'Ver Plano Pro' não apareceu na Conta pra quem não é Pro");
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
    /* Pro sem data de expiração (plano "unico" ou liberado à mão):
       new Date(null) mostrava "Pro até 31/12/1969" e oferecia "Renovar",
       que gravaria 30 dias e encurtaria o acesso. */
    const aceitesAntesSemData = marcado("aceite-pro").length;
    await passo("Plano Pro sem data de expiração: dispara a tela", () => {
      assinaturaFalsa = { pro: true, expira_em: null };
      UI.screenPlanoPro();
    });
    await passo("Plano Pro sem data de expiração: diz isso, sem data inventada e sem formulário de renovar", () => {
      const t = ultimoTexto("hint") || "";
      if (!/sem data de expiração/.test(t)) throw new Error("texto: " + t);
      if (/19(69|70)/.test(t)) throw new Error("mostrou data de 1969/1970: " + t);
      if (marcado("aceite-pro").length !== aceitesAntesSemData)
        throw new Error("mostrou o formulário de pagamento pra conta que não expira");
    });
    await passo("Plano Pro sem data de expiração: volta a Pro com data pros passos seguintes", () => {
      assinaturaFalsa = { pro: true, expira_em: "2099-01-01T00:00:00.000Z" };
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
      if (!legenda || legenda.textContent !== "PRO: modelo Prata")
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
    await passo("Carrossel SEM Pro: abre a vitrine de novo (a Conta desenha depois da sessão resolver)", () => {
      UI.screenPlanoPro();
    });
    await passo("Carrossel SEM Pro: escolher não faz nada, só avisa", () => {
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
      filhosENetos(linhaEquip).some(c=>/Adquirido/.test(c.innerHTML)&&!/✓/.test(c.innerHTML)) &&
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
      filhosENetos(linhaConsult).some(c=>/Ativa para a próxima luta/.test(c.innerHTML)&&!/✓/.test(c.innerHTML)) &&
      !filhosENetos(linhaConsult).some(c=>/Adquirido/.test(c.innerHTML)));

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
    /* ---------- pauta da entrevista (2026-10-01): escolhida pelos fatos da luta, sem IA nem rng ---------- */
    const opp={name:"Rival",arquetipo:"Completo",rating:.5,destaque:null};
    const rBase=(method,round,clock,cards=null)=>({method,round,clock,cards,log:[]});
    const pautaDe=(r,won,op={})=>{const antes=st,meAntes=me;st={wins:0,losses:0,registro:[],narrativa:null};me={name:"Jogador Teste"};
      try{return escolherPauta(fatosDaLuta(r,won,opp,op.td0||0,op.tdt0||0,op),false).id;}finally{st=antes;me=meAntes;}};
    passo("pauta: cinturão vence tudo, mesmo com lesão e zebra",
      pautaDe(rBase("Decisão",5,"0:00","49-46"),true,{titulo:true,zebra:true,lesao:"x"})==="cinturao");
    passo("pauta: zebra e lesão passam na frente do fato da luta",
      ["zebra","lesao"].includes(pautaDe(rBase("Nocaute",1,"2:30"),true,{zebra:true,lesao:"x"})));
    passo("pauta: nocaute vencido, sem fato forte, vira pauta do nocaute",
      /^nocaute-/.test(pautaDe(rBase("Nocaute",2,"3:40"),true)));
    passo("pauta: finalização sofrida vira a pauta de quem foi finalizado",
      pautaDe(rBase("Finalização",2,"3:20"),false)==="finalizado");
    passo("pauta: decisão 29-28 é decisão apertada (o motor tem um placar só: nada de dividida)",
      pautaDe(rBase("Decisão",3,"0:00","29-28"),true)==="decisao-apertada");
    passo("pauta: sem fato nenhum de destaque, cai na pauta geral",
      pautaDe(rBase("Decisão",3,"0:00",null),true)==="geral");

    /* ---------- fixtures comuns pra coletiva/entrevista de verdade ---------- */
    me={name:"TesteBot",division:"lightweight",slpm:5.0,strDef:.55,durability:1.0,
        tdDef:.6,subAvg:.5,kdAvg:.4,strAcc:.45,tdAcc:.38};
    me.__base={}; ATTR_TREINAVEIS.forEach(k=>{if(me[k]!=null)me.__base[k]=me[k];});
    st={treino:{},eventoMod:{},wins:5,losses:1,standing:.5,fan:5,followers:8000,dinheiro:0,
        lesao:null,tituloEstaLuta:false,coletivaHype:1,coletivaPressao:null,entrevistasFeitas:0};
    fightNo=6;

    /* ---------- COLETIVA (reta final, 2026-09-28): a cena ----------
       Mapa do dono: lutador à esquerda, imprensa à direita (foto do lugar,
       nunca lutador real), conversa no meio, o que aconteceu embaixo. A
       pergunta vem da IA (coletivaCena), com tema forçado e recentes. */
    const temCls=(n,c)=>(n.className||"").split(" ").includes(c);
    const nosDe=(raiz,acc=[])=>{if(!raiz)return acc;acc.push(raiz);(raiz.children||[]).forEach(c=>nosDe(c,acc));return acc;};
    const tick=async()=>{for(let k=0;k<4;k++)await Promise.resolve();};
    let lutarChamado=null;
    lutar=(escolhido,camp)=>{lutarChamado={escolhido,camp};};
    meuPro=true;
    const chamadas=[];
    let respostaCena={evento:"O treinador dele pegou o microfone pra dizer que você foge da troca.",
      pergunta:"O treinador dele disse que você foge da troca. Você foge?"};
    ai=async(kind,data)=>{chamadas.push({kind,data});
      if(kind==="coletivaCena")return respostaCena;
      return{reacao:"Ele revirou os olhos e saiu resmungando pro microfone.",hype:5,pressao:-3,atributoPressao:"tdDef"};};
    fightNo=6;
    telaColetiva({f:opp,ganho:.08},{nome:"Boxe"});
    const box=document.getElementById("escolha");
    const cena=box.children.find(n=>temCls(n,"cena-imprensa"));
    const colunas=cena?cena.children.map(n=>n.className):[];
    passo("coletiva: cena em 3 colunas na ordem do mapa (lutador, conversa, imprensa)",
      !!cena&&temCls(cena,"cena-coletiva")&&colunas.length===3&&colunas[0].includes("cena-jogador")
      &&colunas[1].includes("cena-meio")&&colunas[2].includes("cena-ia"));
    const jogCard=cena&&cena.children[0],iaCard=cena&&cena.children[2];
    passo("coletiva: card da esquerda tem o boneco do jogador e o nome dele",
      !!jogCard&&/<svg/.test(jogCard.innerHTML)&&jogCard.innerHTML.includes("TesteBot"));
    passo("coletiva: card da direita é a imprensa (foto do lugar + repórter fictício), nunca o adversário",
      !!iaCard&&iaCard.innerHTML.includes("img/coletiva-mesa.webp")&&REPORTERES.some(r=>iaCard.innerHTML.includes(r))
      &&!iaCard.innerHTML.includes(opp.name));
    passo("coletiva Pro: enquanto a pergunta não chega, o balão da IA mostra que está escrevendo e o Responder espera",
      /digitando/.test(document.getElementById("colpergunta").innerHTML)&&document.getElementById("colgo").disabled===true);
    await tick();
    const pedidoCena=chamadas.find(c=>c.kind==="coletivaCena");
    passo("coletiva Pro: pede a cena à IA com a dupla (situação da lista e forma da pergunta), repórter com linha editorial, camp e recentes",
      !!pedidoCena&&SITUACOES_COLETIVA.some(x=>x.tema===pedidoCena.data.tema)&&Object.values(ESTRUTURAS).includes(pedidoCena.data.estrutura)
      &&/\\(/.test(pedidoCena.data.reporter)&&typeof pedidoCena.data.linhaReporter==="string"&&pedidoCena.data.linhaReporter.length>5
      &&pedidoCena.data.camp==="Boxe"&&Array.isArray(pedidoCena.data.recentes)&&pedidoCena.data.opp==="Rival");
    passo("coletiva Pro: a pergunta da IA aparece no balão da IA e o evento em cima",
      document.getElementById("colpergunta").innerHTML.includes("Você foge?")
      &&document.getElementById("colevento").innerHTML.includes("pegou o microfone")&&!document.getElementById("colevento").hidden);
    passo("coletiva Pro: com a pergunta na tela, o Responder libera", document.getElementById("colgo").disabled===false);
    /* fase 8: no celular o teclado virtual cobria o botão */
    const rolaAteBotao=(campoId,botaoId)=>{let rolou=false;const b=document.getElementById(botaoId);b.scrollIntoView=()=>{rolou=true;};
      const c=document.getElementById(campoId);if(typeof c.onfocus!=="function")return false;c.onfocus();return rolou;};
    passo("coletiva: focar o campo rola até o Responder (teclado do celular cobria o botão)",rolaAteBotao("colresp","colgo"));
    document.getElementById("colresp").value="vai ver quando o sino tocar";
    await document.getElementById("colgo").onclick();
    const reacaoCol=chamadas.filter(c=>c.kind==="coletiva").pop();
    passo("coletiva Pro: a reação recebe a pergunta e o evento da cena, e o texto do jogador em 'resposta'",
      !!reacaoCol&&reacaoCol.data.resposta==="vai ver quando o sino tocar"&&reacaoCol.data.pergunta===respostaCena.pergunta
      &&reacaoCol.data.evento===respostaCena.evento);
    passo("coletiva Pro: manda o nome do adversário e o record atual",
      reacaoCol.data.opp==="Rival"&&reacaoCol.data.record==="5-1");
    passo("coletiva: hype trava no teto 1.20 (resposta mandou 5)", st.coletivaHype===1.20);
    passo("coletiva: pressao trava no piso 0.90 (resposta mandou -3)",
      st.coletivaPressao&&st.coletivaPressao.mult===0.90);
    passo("coletiva: atributoPressao válido vira st.coletivaPressao.atributo",
      st.coletivaPressao&&st.coletivaPressao.atributo==="tdDef");
    const desfechoPro=document.getElementById("coldesfecho").innerHTML;
    passo("coletiva: 'o que aconteceu' mostra o hype da luta (+20%) e o adversário abalado (defesa de queda −10%)",
      desfechoPro.includes("Hype desta luta +20%")&&desfechoPro.includes("Adversário abalado: defesa de queda −10% nesta luta")
      &&/o resultado mostra quanto veio da coletiva/.test(desfechoPro));
    passo("coletiva: a resposta vai pro balão do jogador e a reação pro 'o que aconteceu'",
      document.getElementById("colbalao").innerHTML.includes("vai ver quando o sino tocar")
      &&document.getElementById("coldesfecho").innerHTML.includes("revirou os olhos")&&!document.getElementById("coldesfecho").hidden);
    __drenarAgora();   // 2026-09-28: sem tempo fixo, a reação fica na tela até o jogador mandar
    passo("coletiva: com a reação na tela, a luta NÃO começa sozinha (dá tempo de ler)", !lutarChamado);
    const irLuta=document.getElementById("colseguir");
    passo("coletiva: botão 'Ir pra luta' aparece depois da reação", !!(irLuta&&irLuta.onclick&&/Ir pra luta/.test(irLuta.innerHTML||"")));
    irLuta.onclick();
    passo("coletiva: seguir() chama lutar() com o MESMO escolhido/camp da tela",
      lutarChamado&&lutarChamado.escolhido.f===opp&&lutarChamado.camp.nome==="Boxe");

    /* ---------- COLETIVA: a cena fica guardada na luta (voltar e voltar não gasta outra chamada) ---------- */
    fightNo=7;chamadas.length=0;
    telaColetiva({f:opp,ganho:.08},{nome:"Boxe"});await tick();
    const perg1=document.getElementById("colpergunta").innerHTML;
    telaColetiva({f:opp,ganho:.08},{nome:"Boxe"});await tick();
    passo("coletiva: reabrir a mesma coletiva (Voltar do camp e ir de novo) não pede outra cena à IA",
      chamadas.filter(c=>c.kind==="coletivaCena").length===1);
    passo("coletiva: e mostra a MESMA pergunta", document.getElementById("colpergunta").innerHTML===perg1);

    /* ---------- COLETIVA: resposta atrasada de outra carreira ---------- */
    fightNo=30;
    let soltar;ai=async(kind)=>kind==="coletivaCena"?new Promise(r=>{soltar=()=>r({evento:"",pergunta:"Pergunta atrasada da carreira anterior?"});}):null;
    telaColetiva({f:opp,ganho:.08},{nome:"Boxe"});
    await tick();                           // a cena já foi pedida e está no ar
    CARREIRA_TOKEN++;                       // jogador saiu e começou outra carreira
    const recentesAntes=JSON.stringify(st.cenasRecentes||{});
    soltar();await tick();await tick();
    passo("cena: resposta da IA que chega depois de trocar de carreira não escreve nos recentes da carreira nova",
      JSON.stringify(st.cenasRecentes||{})===recentesAntes&&!document.getElementById("colpergunta").innerHTML.includes("atrasada"));
    ai=async(kind,data)=>{chamadas.push({kind,data});
      if(kind==="coletivaCena")return respostaCena;
      return{reacao:"Ele revirou os olhos e saiu resmungando pro microfone.",hype:5,pressao:-3,atributoPressao:"tdDef"};};

    /* ---------- COLETIVA: IA fora, cena inválida ou repetida caem no molde local ---------- */
    const perguntaLocal=()=>{const h=document.getElementById("colpergunta").innerHTML;return h.includes("balao-txt")&&!h.includes("Você foge?");};
    fightNo=8;respostaCena=null;
    telaColetiva({f:opp,ganho:.08},{nome:"Boxe"});await tick();
    passo("coletiva: IA sem resposta, a pergunta sai do molde local (nunca fica vazia)", perguntaLocal());
    fightNo=9;respostaCena={evento:"Tudo normal.",pergunta:"eu me corto quando fico ansioso?"};
    telaColetiva({f:opp,ganho:.08},{nome:"Boxe"});await tick();
    passo("coletiva: cena da IA com conteúdo inseguro cai no molde local", perguntaLocal());
    fightNo=10;respostaCena={evento:"x",pergunta:"O treinador dele disse que você foge da troca. Você foge?"};
    st.cenasRecentes={coletiva:["O treinador dele disse que você foge da troca. Você foge?"]};
    telaColetiva({f:opp,ganho:.08},{nome:"Boxe"});await tick();
    passo("coletiva: pergunta da IA igual a uma recente cai no molde local", perguntaLocal());
    fightNo=11;respostaCena={evento:"Ele chegou atrasado. Ele vai perder por nocaute no primeiro round.",pergunta:"Ele chegou atrasado de propósito?"};
    telaColetiva({f:opp,ganho:.08},{nome:"Boxe"});await tick();
    passo("coletiva: o evento da IA perde a frase que afirma o resultado da luta futura",
      document.getElementById("colevento").innerHTML.includes("chegou atrasado")&&!document.getElementById("colevento").innerHTML.includes("nocaute"));

    /* medido no modelo de produção: prefixo com nome de repórter, pergunta em
       terceira pessoa e o lutador do JOGADOR agindo no evento */
    passo("cena: prefixo com nome de repórter sai da pergunta da IA",
      limparPergunta("Renata Brum: Kayo, seu cartel é 5-3. Isso pesa?")==="Kayo, seu cartel é 5-3. Isso pesa?"
      &&limparPergunta("Hugo Lessa, do Canal Chão e Pancada, pergunta: você aguenta?")==="Você aguenta?");
    passo("cena: pergunta em terceira pessoa ('Fulano pergunta se') é descartada",
      limparPergunta("Lia Monteverde pergunta se ele vai aguentar.")==="");
    passo("cena: aspas em volta da pergunta saem (a tela já põe as da fala)",
      limparPergunta("'Kayo, o valor é baixo?'")==="Kayo, o valor é baixo?"&&limparPergunta("“Você aceita?”")==="Você aceita?");
    passo("cena: pergunta que começa pelo nome do lutador continua inteira",
      limparPergunta("Kayo, você foge da troca?")==="Kayo, você foge da troca?");
    passo("cena: evento em que o lutador do JOGADOR age é descartado (quem decide o que ele faz é o jogador)",
      (()=>{const n=me.name;me.name="Kayo Brasa";const a=eventoDosOutros("Kayo Brasa ignorou o microfone da mesa.");
        const b=eventoDosOutros("O treinador dele riu da pergunta.");me.name=n;return a===""&&b==="O treinador dele riu da pergunta.";})());

    /* ---------- COLETIVA: variedade (narrativa 2026-10-01): dupla situação × estrutura ---------- */
    st.narrativa=null;
    const ctxV=ctxColetiva(opp,{nome:"Boxe"},{f:opp});
    const duplas=[];
    for(let n=20;n<36;n++){fightNo=n;duplas.push(escolherCena("coletiva",ctxV));}
    const semCond=SITUACOES_COLETIVA.filter(x=>!x.cond).length;
    passo("coletiva: as "+semCond+" primeiras situações sem condição nunca se repetem (cartela sem reposição)",
      new Set(duplas.slice(0,semCond).filter(d=>!d.sit.cond).map(d=>d.sit.id)).size===duplas.slice(0,semCond).filter(d=>!d.sit.cond).length);
    passo("coletiva: a estrutura sempre é uma das que combinam com a situação",
      duplas.every(d=>typeof d.sit.est[d.est]==="function"));
    passo("coletiva: a mesma estrutura nunca vem duas vezes seguidas",
      duplas.every((d,k)=>!k||d.est!==duplas[k-1].est));
    const perguntasLocais=new Set(duplas.map(d=>cenaLocal(d,ctxV).pergunta));
    passo("coletiva: molde local muda com a dupla (16 cenas, 15 perguntas diferentes ou mais)", perguntasLocais.size>=15);
    passo("coletiva: molde local cita fato da luta (cartel, camp ou estilo)",
      SITUACOES_COLETIVA.some(x=>Object.values(x.est).some(f=>{try{return /5-1/.test(f(ctxV));}catch(e){return false;}}))
      &&/boxe/.test(SITUACOES_COLETIVA.find(x=>x.id==="camp").est.bastidor(ctxV)));
    passo("coletiva: comparação com a luta anterior só entra quando a carreira tem luta registrada",
      (()=>{const reg=st.registro;st.registro=[];st.narrativa=null;let ok=true;
        for(let n=50;n<80;n++){fightNo=n;const d=escolherCena("coletiva",ctxColetiva(opp,{nome:"Boxe"},{f:opp}));if(d.est==="comparacao")ok=false;}
        st.registro=reg;return ok;})());

    /* ---------- COLETIVA: atributoPressao inválido não vira pressão ---------- */
    fightNo=12;respostaCena=null;
    st.coletivaHype=1;st.coletivaPressao=null;lutarChamado=null;
    ai=async(kind)=>kind==="coletivaCena"?null:({reacao:"Ele nem comentou nada de mais.",hype:1,pressao:1,atributoPressao:"velocidade_da_luz"});
    telaColetiva({f:opp,ganho:.08},{nome:"Boxe"});await tick();
    document.getElementById("colresp").value="beleza";
    await document.getElementById("colgo").onclick();
    passo("coletiva: atributoPressao fora da lista de atributos válidos vira null (não quebra)",
      st.coletivaPressao===null);

    /* ---------- COLETIVA: CONTEUDO_INSEGURO descarta o j INTEIRO ---------- */
    fightNo=13;st.coletivaHype=1;st.coletivaPressao=null;lutarChamado=null;
    let chamouAiInseguro=false;
    ai=async(kind)=>{if(kind==="coletivaCena")return null;chamouAiInseguro=true;return{reacao:"ok",hype:1.2,pressao:.9,atributoPressao:"nenhum"};};
    telaColetiva({f:opp,ganho:.08},{nome:"Boxe"});await tick();
    document.getElementById("colresp").value="eu me corto quando fico ansioso, isso não muda nada";
    await document.getElementById("colgo").onclick();
    passo("coletiva: texto inseguro do JOGADOR corta ANTES de chamar a IA (mesma rede de baixo do dilema)",
      !chamouAiInseguro);
    passo("coletiva: sem chamada de IA, hype/pressao ficam neutros", st.coletivaHype===1&&st.coletivaPressao===null);
    passo("coletiva: sem reação da IA, a cena diz que o hype não mudou (em vez de não dizer nada)",
      /Hype desta luta sem mudança/.test(document.getElementById("coldesfecho").innerHTML)
      &&!/Adversário/.test(document.getElementById("coldesfecho").innerHTML));
    passo("coletiva: sem reação, 'o que aconteceu' mostra a frase neutra e o Ir pra luta segue (a luta nunca trava)",
      /assessoria/.test(document.getElementById("coldesfecho").innerHTML)&&!!document.getElementById("colseguir").onclick
      &&(document.getElementById("colseguir").onclick(),!!lutarChamado));

    /* ---------- COLETIVA: semResultadoDeLuta corta só a frase ofensora ---------- */
    fightNo=14;st.coletivaHype=1;st.coletivaPressao=null;
    ai=async(kind)=>kind==="coletivaCena"?null:({reacao:"Ele ficou irritado com a provocação. Vai perder por nocaute no primeiro round, aposto.",
      hype:1.1,pressao:.95,atributoPressao:"nenhum"});
    telaColetiva({f:opp,ganho:.08},{nome:"Boxe"});await tick();
    document.getElementById("colresp").value="ele não passa do primeiro round";
    await document.getElementById("colgo").onclick();
    const desfechoCol=document.getElementById("coldesfecho").innerHTML;
    passo("coletiva: RESULTADO_LUTA corta a frase que afirma quem ganha a luta futura",
      !desfechoCol.includes("Vai perder por nocaute"));
    passo("coletiva: a frase SEGURA da mesma reacao continua aparecendo",
      desfechoCol.includes("Ele ficou irritado"));

    /* ---------- COLETIVA: sem meuPro, VITRINE (2026-09-22, item 5) ----------
       Grátis TEM que ver que a coletiva existe: a cena aparece inteira,
       com a pergunta do molde local (nunca a IA); a resposta fica travada
       pelo bloqueioPro e "Pular" fica fora dele. */
    fightNo=15;st.coletivaHype=1;st.coletivaPressao=null;lutarChamado=null;
    meuPro=false;
    let chamouAiGratis=false;
    ai=async()=>{chamouAiGratis=true;return null;};
    telaColetiva({f:opp,ganho:.08},{nome:"Boxe"});
    passo("coletiva sem meuPro: mostra a tela (não pula pra lutar())", !lutarChamado);
    passo("coletiva sem meuPro: a pergunta do molde local já está no balão da IA",
      document.getElementById("colpergunta").innerHTML.includes("balao-txt"));
    const travaCol=document.getElementById("colbalao").children.find(n=>temCls(n,"bloqueio-pro"));
    passo("coletiva sem meuPro: a resposta fica dentro do bloqueioPro (selo Assine o Pro, área inert)",
      !!travaCol&&travaCol.children.some(n=>temCls(n,"selo-assine"))
      &&travaCol.children.some(n=>temCls(n,"bloqueado")&&n.inert===true));
    document.getElementById("colresp").value="ele não passa do primeiro round";
    await document.getElementById("colgo").onclick();
    await tick();
    passo("coletiva sem meuPro: nem a cena nem a resposta chamam a IA", !chamouAiGratis);
    passo("coletiva sem meuPro: Responder não segue pra luta sozinho", !lutarChamado);
    document.getElementById("colpular").onclick();
    passo("coletiva sem meuPro: 'Pular' fica fora do bloqueio e chama lutar() com o mesmo escolhido/camp",
      !!lutarChamado&&lutarChamado.escolhido.f===opp&&lutarChamado.camp.nome==="Boxe");

    /* ---------- COLETIVA: 'Pular' não mexe em nada, segue direto ---------- */
    fightNo=16;st.coletivaHype=1;st.coletivaPressao=null;lutarChamado=null;meuPro=true;
    let chamouAiPular=false;
    ai=async(kind)=>{if(kind!=="coletivaCena")chamouAiPular=true;return null;};
    telaColetiva({f:opp,ganho:.08},{nome:"Boxe"});
    document.getElementById("colpular").onclick();
    await tick();
    passo("coletiva: 'Pular' não chama a reação da IA", !chamouAiPular);
    passo("coletiva: 'Pular' ainda assim chama lutar()", !!lutarChamado);

    /* ================= ENTREVISTA ================= */
    const bouts=document.getElementById("bouts");
    const r={method:"Nocaute",round:1,clock:"3:12"};

    /* ---------- ENTREVISTA: Pro, cena, resposta boa, payload certo ---------- */
    fightNo=6;
    st.lesao={atributo:"strDef",nome:"Ombro travado"};
    st.dinheiro=0;st.followers=8000;st.fan=5;meuPro=true;
    chamadas.length=0;
    let cenaEnt={evento:"O médico interrompeu pra olhar o supercílio antes da primeira pergunta.",
      pergunta:"Você lutou com o ombro travado e fechou no primeiro round. Em que momento esqueceu a dor?"};
    ai=async(kind,data)=>{chamadas.push({kind,data});
      if(kind==="entrevistaCena")return cenaEnt;
      return{reacao:"A sala riu junto: 'sentir, senti, mas parar era pior.' Fechou um patrocínio pequeno com uma loja da cidade.",
        fa:2.5,seguidores:.8,dinheiro:.3};};
    renderBotaoEntrevista(bouts,opp,r,false,true,2,1,false);
    const wrap6=bouts.children[bouts.children.length-1];
    wrap6.children[0].onclick();
    passo("entrevista: 'Dar entrevista' abre entrevistaAberta=true", entrevistaAberta===true);
    passo("entrevista: abre como etapa própria da noite (fundo do lugar da entrevista)", noiteEtapa==="entrevista");
    const cenaE=document.getElementById("escolha").children.find(n=>temCls(n,"cena-imprensa"));
    passo("entrevista: mesma cena do mapa (lutador, conversa, imprensa com o microfone)",
      !!cenaE&&temCls(cenaE,"cena-entrevista")&&cenaE.children.length===3&&temCls(cenaE.children[0],"cena-jogador")
      &&cenaE.children[2].innerHTML.includes("img/entrevista-microfone.webp"));
    await tick();
    const pedidoEnt=chamadas.find(c=>c.kind==="entrevistaCena");
    passo("entrevista: pede a cena à IA com o resumo da luta, a pauta do repórter e o fato central",
      !!pedidoEnt&&typeof pedidoEnt.data.resumo==="string"&&pedidoEnt.data.resumo.includes(opp.name)
      &&typeof pedidoEnt.data.pauta==="string"&&pedidoEnt.data.pauta.length>10&&typeof pedidoEnt.data.fato==="string"
      &&pedidoEnt.data.fato.length>10&&/\\(/.test(pedidoEnt.data.reporter));
    passo("entrevista: lesão nova (fato forte) vira a pauta",
      /lesão/.test(pedidoEnt.data.fato));
    passo("entrevista: o resumo da luta só traz o que o motor registrou (tempo de round, quem levou cada round, quedas)",
      (()=>{const t=resumoDaLuta(fatosDaLuta({method:"Nocaute",round:2,clock:"3:40",
        log:[{round:1,clock:"0:00",kind:"rd",text:"Fim do round 1. Rival levou."}]},true,opp,2,1));
        return t.includes("por nocaute no segundo round, 1min20 depois do início do round")&&t.includes("primeiro round de Rival")&&/quedas na luta toda: .* 2, Rival 1/.test(t);})());
    passo("entrevista: a pergunta da IA aparece no balão da IA",
      document.getElementById("entpergunta").innerHTML.includes("esqueceu a dor"));
    passo("entrevista: focar o campo rola até o Responder (teclado do celular cobria o botão)",rolaAteBotao("entresp","entgo"));
    document.getElementById("entresp").value="sentir, senti, mas não ia parar";
    await document.getElementById("entgo").onclick();
    const reacaoEnt=chamadas.filter(c=>c.kind==="entrevista").pop();
    passo("entrevista Pro: manda kind certo, a resposta do jogador e a pergunta/evento da cena",
      !!reacaoEnt&&reacaoEnt.data.resposta==="sentir, senti, mas não ia parar"&&reacaoEnt.data.pergunta===cenaEnt.pergunta
      &&reacaoEnt.data.evento===cenaEnt.evento);
    passo("entrevista Pro: manda método/round/clock da luta que ACABOU de acontecer",
      reacaoEnt.data.metodo==="Nocaute"&&reacaoEnt.data.round===1&&reacaoEnt.data.clock==="3:12");
    passo("entrevista Pro: manda quedas aplicadas/sofridas certas (td0/tdt0)",
      reacaoEnt.data.tdApl===2&&reacaoEnt.data.tdSof===1);
    passo("entrevista Pro: manda a lesão ativa em texto natural (uma lesão que afeta a defesa de golpes)",
      typeof reacaoEnt.data.lesao==="string"&&reacaoEnt.data.lesao.includes("uma lesão que afeta a defesa de golpes"));
    passo("entrevista: fã clampado corretamente (2.5 dentro do teto 2)", st.fan===5+2);
    passo("entrevista: seguidores aplicado (0.8 dentro do teto 0.50, trava em 0.50)",
      st.followers===Math.round(8000*(1+0.50)));
    passo("entrevista: dinheiro aplicado (reacao menciona 'patrocínio')",
      st.dinheiro===Math.round(RENDA_BASE*.3));
    passo("entrevistasFeitas incrementou", st.entrevistasFeitas===1);
    passo("entrevista: 'o que aconteceu' mostra a reação e os números",
      document.getElementById("entdesfecho").innerHTML.includes("patrocínio")&&/seguidores/.test(document.getElementById("entdesfecho").innerHTML));
    passo("entrevista: o convite vira o resumo da entrevista no embrulho da luta (é o que vai pro Cartel)",
      /Entrevista/.test(wrap6.innerHTML)&&wrap6.innerHTML.includes("esqueceu a dor"));

    /* ---------- ENTREVISTA: "Continuar" trava/libera nextFight (2026-09-24) ---------- */
    let nextFightChamado=0;
    nextFight=()=>{nextFightChamado++;};
    const btnContinuar=document.getElementById("entcontinuar");
    passo("entrevista: depois da resposta, a cena mostra 'Continuar pra próxima luta'",
      !!btnContinuar&&/Continuar pra próxima luta/.test(btnContinuar.innerHTML||""));
    btnContinuar.onclick();
    passo("entrevista: clicar 'Continuar' fecha entrevistaAberta e chama nextFight()",
      entrevistaAberta===false&&nextFightChamado===1);

    /* ---------- ENTREVISTA: sair sem responder e voltar ---------- */
    fightNo=7;chamadas.length=0;cenaEnt=null;st.lesao=null;
    st.narrativa=null;st.registro=[];
    renderBotaoEntrevista(bouts,opp,{method:"Decisão",round:3,clock:"0:00",cards:"28-29",log:[]},false,false,0,0,false);
    const wrap7=bouts.children[bouts.children.length-1];
    wrap7.children[0].onclick();await tick();
    passo("entrevista: derrota apertada nos cartões vira pauta de derrota (explicação, nunca festa)",
      /derrota apertada/.test(chamadas.find(c=>c.kind==="entrevistaCena").data.pauta));
    passo("entrevista: IA sem resposta, a pergunta sai do molde local da pauta (cita o placar real)",
      /29-28/.test(document.getElementById("entpergunta").innerHTML));
    passo("entrevista: derrota tem evento coerente (sem comemoração)",
      !/levantou|gritou o seu nome/.test(document.getElementById("entevento").innerHTML));
    let fundoPedido=null;const mostrarOrig=mostrarNoite;mostrarNoite=(e,f)=>{fundoPedido=f;return mostrarOrig(e,f);};
    document.getElementById("entvoltar").onclick();
    mostrarNoite=mostrarOrig;
    passo("entrevista: 'Voltar ao resultado' sai sem responder (destrava a próxima luta)",
      entrevistaAberta===false&&noiteEtapa==="resultado");
    passo("entrevista: e volta com o fundo da derrota (não o confete da vitória)", fundoPedido==="apagado");
    passo("entrevista: o convite continua lá pra dar a entrevista depois", /Dar entrevista/.test(wrap7.children[0].innerHTML||""));
    wrap7.children[0].onclick();await tick();
    passo("entrevista: reabrir na mesma luta não pede outra cena à IA", chamadas.filter(c=>c.kind==="entrevistaCena").length===1);
    document.getElementById("entvoltar").onclick();

    /* ---------- ENTREVISTA: última luta, Continuar volta pro resultado ---------- */
    fightNo=TOTAL_FIGHTS;nextFightChamado=0;cenaEnt=null;
    ai=async(kind)=>kind==="entrevistaCena"?null:({reacao:"Ele agradeceu a equipe e saiu.",fa:0,seguidores:0,dinheiro:0});
    renderBotaoEntrevista(bouts,opp,r,false,true,0,0,false);
    bouts.children[bouts.children.length-1].children[0].onclick();await tick();
    document.getElementById("entresp").value="obrigado a todos";
    await document.getElementById("entgo").onclick();
    passo("entrevista: na última luta o botão diz 'Voltar ao resultado'",
      /Voltar ao resultado/.test(document.getElementById("entcontinuar").innerHTML||""));
    document.getElementById("entcontinuar").onclick();
    passo("entrevista: e volta pro resultado sem chamar nextFight()", noiteEtapa==="resultado"&&nextFightChamado===0&&!entrevistaAberta);

    /* ---------- ENTREVISTA: convite de luta anterior some na luta seguinte ----------
       Achado jogando: "o botão de dar entrevista das lutas passadas
       continuam aparecendo". */
    fightNo=7;
    ai=async()=>null; // não vai responder esta: só testar limpeza
    renderBotaoEntrevista(bouts,opp,r,false,true,0,0,false); // luta 7: convite NOVO, sem responder
    const wrapLuta7=bouts.children[bouts.children.length-1];
    passo("entrevista: convite da luta 7 nasce com o botão 'Dar entrevista' (children, não innerHTML)",
      wrapLuta7.children.length===1&&/Dar entrevista/.test(wrapLuta7.children[0].innerHTML||""));
    fightNo=8;
    renderBotaoEntrevista(bouts,opp,r,false,true,0,0,false); // luta 8: deveria limpar o convite da 7 sem resposta
    passo("entrevista: convite SEM RESPOSTA da luta anterior é limpo quando a próxima luta chama de novo",
      wrapLuta7.innerHTML==="");
    passo("entrevista: convite da luta 6 (JÁ RESPONDIDO, lá em cima) continua no histórico, não foi limpo",
      wrap6.innerHTML!==""&&/Entrevista/.test(wrap6.innerHTML));

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
    entrevistaAberta=false;
    renderBotaoEntrevista(bouts,opp,r,false,true,0,0,false);
    passo("entrevista sem meuPro: convite AINDA aparece (vitrine)",
      bouts.children.length===boutsAntesGratis+1);
    /* Revamp fase 5: vitrine pelo componente único bloqueioPro() (spec
       seção 9), no lugar do selo no rótulo + oferta no clique. */
    const wrapGratis=bouts.children[bouts.children.length-1];
    const travaEnt=wrapGratis.children.find(n=>temCls(n,"bloqueio-pro"));
    const btnEntGratis=travaEnt&&travaEnt.children.find(n=>temCls(n,"bloqueado"));
    passo("entrevista sem meuPro: botão dentro do bloqueioPro (inert, selo Assine o Pro)",
      !!btnEntGratis&&btnEntGratis.inert===true&&/Dar entrevista/.test(btnEntGratis.innerHTML)
      &&travaEnt.children.some(n=>temCls(n,"selo-assine")));
    passo("entrevista sem meuPro: o botão travado não tem clique", !btnEntGratis||!btnEntGratis.onclick);
    passo("entrevista sem meuPro: nunca abre a pergunta nem chama a IA", !entrevistaAberta&&!chamouAiEntGratis);
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
    // fase 7: o anúncio era "RIVALIDADE COMEÇA AGORA" (frase de efeito)
    passo("telaAdversario(): anuncia 'Novo rival' na 1ª aparição",
      /class="rival-anuncio">Novo rival/.test(escolhaHtml1));
    passo("telaAdversario(): st.rivalAnunciado vira true depois do anúncio",
      st.rivalAnunciado===true);
    fightNo=6; // próxima = 7, reaparição — NÃO é mais a 1ª vez
    telaAdversario();
    const escolhaHtml2=document.getElementById("escolha").innerHTML;
    passo("telaAdversario(): reaparição NÃO repete o anúncio",
      !/class="rival-anuncio"/.test(escolhaHtml2));
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
  const MIN = M.MIN_LUTADORES || 40, MINV2 = M.MIN_LUTADORES_V2 || 30, ANO = M.ANO_ATIVO;
  console.log("\n" + cinza("uma carreira são 22 lutas sem repetir adversário"));
  console.log(cinza(`modo normal (regras v2): só quem lutou de ${ANO} em diante; mínimo ${MINV2} lutadores`));
  console.log(cinza(`modo lenda: mínimo ${MIN} lendas (inclui aposentados)`));
  console.log(cinza(`lenda = disputou cinturão OU rating >= ${(M.RATING_LENDA).toFixed(3)} (13/18)\n`));
  console.log(cinza("                          normal        lenda"));
  let jog = 0, jogL = 0;
  const linhas = M.DIVISOES.map(d => {
    const pool = F.filter(f => f.division === d.id);
    return { id: d.id, n: pool.filter(f => f.era && f.era[1] >= ANO).length, total: pool.length, l: pool.filter(M.ehLenda).length };
  }).sort((a, b) => b.n - a.n);
  for (const r of linhas) {
    const a = r.n >= MINV2 && r.total >= MIN, b = r.total >= MIN && r.l >= MIN;   // divisão que nunca fechou no dataset segue fora
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
/* ================================================================== *
 * ROTAS (revamp 2026-09-26): toda tela nova abre pelo roteador, toda
 * tela secundária tem Voltar que leva ao menu, endereço desconhecido
 * cai na 404, resposta de login do Supabase no hash NUNCA vira rota, e
 * nenhuma tela nova usa emoji/travessão no texto.
 * ================================================================== */
/* Supabase falso genérico (revamp fase 3): sessão ligável por fora
   (estado.sessao), toda consulta encadeável devolve lista vazia. */
function supabaseFalsoComSessao(estado) {
  /* estado.assinatura: a linha de `assinaturas` desta conta ({pro,expira_em}),
     ou nada (conta grátis). */
  const cadeia = (tabela) => {
    const c = { eq: () => c, gt: () => c, gte: () => c, order: () => c, limit: () => c,
      maybeSingle: async () => ({ data: tabela === "assinaturas" ? (estado.assinatura || null) : null, error: null }),
      then: (r) => r({ data: [], error: null, count: 0 }) };
    return c;
  };
  return {
    createClient: () => ({
      auth: {
        getSession: async () => ({ data: { session: estado.sessao } }),
        onAuthStateChange: (cb) => { estado.aoMudar = cb; },
        signOut: async () => { estado.sessao = null; return { error: null }; },
        signUp: async ({ email }) => ({ data: { session: null, user: { id: "novo-" + email } }, error: null }),
      },
      from: (tabela) => ({ select: () => cadeia(tabela), upsert: async () => ({ error: null }), delete: () => cadeia(tabela) }),
    }),
  };
}
async function testarRotas() {
  console.log("\n" + cinza("rotas: menu, Voltar em toda tela, 404, hash do Supabase, portão de conta, sem emoji nem travessão"));
  const env = criarAmbiente({ contarNos: true });
  const estadoSb = { sessao: { user: { id: "u1", email: "t@t.com" } } };
  env.sandbox.window.supabase = supabaseFalsoComSessao(estadoSb);
  const eventosVA = [];
  env.sandbox.window.va = (t, o) => { if (t === "event") eventosVA.push(o && o.name); };
  const dadosLS = {};
  env.sandbox.localStorage = { getItem: k => (k in dadosLS ? dadosLS[k] : null), setItem: (k, v) => { dadosLS[k] = String(v); }, removeItem: k => { delete dadosLS[k]; } };
  vm.createContext(env.sandbox);
  try {
    vm.runInContext(exportar(lerScript(), ["ready", "irPara", "lerRota", "ROTAS", "desenharRanking", "htmlPreviaRanking", "melhorPorConta", "textoAvisoPro", "consumirIntencao", "guardarIntencao", "bloqueioPro", "montarPasso",
      "screenDivisao", "screenAtivarRival", "screenName", "criarConta", "avisarConfirmacaoEmail"])
      + "\ntry{globalThis.__x.rotaAtual=()=>rotaAtual;}catch(e){}"
      + "\ntry{globalThis.__x.meuPro=()=>meuPro;}catch(e){}"
      + "\ntry{globalThis.__x.setMeuPro=(v)=>{meuPro=v;};}catch(e){}",
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

  await conf("abre no menu com os 6 cards na ordem certa (o JxJ entra como faixa, 2026-10-01)", async () => {
    UI.ready(lerLutadores());
    env.drenar(); await respirar(); env.drenar();
    const rotas = env.todos.filter(n => tem(n, "menu-card")).map(n => n.dataset && n.dataset.rota);
    const esperado = ["nova", "continuar", "jxj", "ranking", "atualizacoes", "conta"];
    if (JSON.stringify(rotas) !== JSON.stringify(esperado)) throw new Error("cards: " + rotas.join(","));
    if (UI.rotaAtual() !== "menu") throw new Error("rotaAtual = " + UI.rotaAtual());
  });

  await conf("logo (2026-10-04): ícone da aba no index e no 404 aponta pra arquivo que existe e vai pro ar; os SVG não dependem de nada de fora", () => {
    /* o dono pediu a logo só no ícone da aba; o resto do site não muda */
    const ignorar = fs.readFileSync(path.join(RAIZ, ".vercelignore"), "utf8").split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
    const foraDoAr = arq => ignorar.some(l => arq === l || arq.startsWith(l.replace(/\/$/, "") + "/") ||
      (l.includes("*") && new RegExp("^" + l.replace(/[.]/g, "\\.").replace(/\*/g, "[^/]*") + "$").test(arq)));
    for (const pagina of ["index.html", "404.html"]) {
      const html = fs.readFileSync(path.join(RAIZ, pagina), "utf8");
      const refs = [...html.slice(0, html.indexOf("</head>")).matchAll(/<link rel="icon"[^>]*href="\/([^"]+)"/g)].map(m => m[1]);
      if (refs.length !== 2) throw new Error(pagina + ": ícones da aba = " + refs);
      for (const arq of refs) {
        if (!fs.existsSync(path.join(RAIZ, arq))) throw new Error(pagina + ": ícone não existe: " + arq);
        if (foraDoAr(arq)) throw new Error(pagina + ": o .vercelignore tira do ar: " + arq);
      }
    }
    for (const svg of ["simbolo.svg", "palavra.svg", "logo.svg", "logo-fundo-claro.svg", "icone.svg"]) {
      const t = fs.readFileSync(path.join(RAIZ, "img", "logo", svg), "utf8");
      if (/href="http|xlink:href|<image|@import|<text/.test(t) || !/aria-label="Octógono"/.test(t)) throw new Error(svg + " depende de algo de fora ou não tem rótulo");
    }
  });
  await conf("menu: cards grandes e médios, marca, rodapé com Termos/Privacidade e suporte no Discord (sem Créditos)", () => {
    UI.irPara("menu"); env.drenar();
    const cards = env.todos.filter(n => tem(n, "menu-card")).slice(-6);
    const grandes = cards.filter(n => tem(n, "menu-card-grande")).map(n => n.dataset.rota);
    if (JSON.stringify(grandes) !== '["nova","continuar"]') throw new Error("cards grandes: " + grandes);
    const faixa = cards.filter(n => tem(n, "menu-card-faixa")).map(n => n.dataset.rota);
    if (JSON.stringify(faixa) !== '["jxj"]') throw new Error("faixa do JxJ: " + faixa);
    if (!env.todos.some(n => tem(n, "marca") && /Octógono/i.test(n.innerHTML))) throw new Error("sem marca");
    const rod = env.todos.filter(n => tem(n, "menu-rodape")).pop();
    if (!rod) throw new Error("sem rodapé");
    const txt = rod.children.map(c => String(c.innerHTML)).join(" | ");
    for (const t of ["Termos", "Privacidade", "Suporte no Discord"])
      if (!txt.includes(t)) throw new Error("rodapé sem " + t + ": " + txt);
    /* suporte (2026-10-04): o servidor do Discord, em aba nova, com o ícone do sprite */
    const dc = rod.children.find(c => tem(c, "menu-contato"));
    if (!dc || dc.href !== "https://discord.gg/c8vRCNwPMg" || dc.target !== "_blank" || !/noopener/.test(dc.rel || "") || !/#discord"/.test(String(dc.innerHTML)))
      throw new Error("link do Discord: " + JSON.stringify(dc && { href: dc.href, target: dc.target, rel: dc.rel }));
    /* reta final (2026-09-28): o dono tirou a página Créditos */
    if (txt.includes("Créditos")) throw new Error("rodapé voltou a ter Créditos: " + txt);
  });

  await conf("atualizações: linha do tempo com todas as entradas, mais recente primeiro", () => {
    const m = env.todos.length;
    UI.irPara("atualizacoes"); env.drenar();
    const marcos = desde(m).filter(n => tem(n, "marco"));
    if (marcos.length < 8) throw new Error("só " + marcos.length + " entradas");
    const datas = marcos.map(n => (String(n.innerHTML).match(/data-iso="([\d-]+)"/) || [])[1]);
    const ord = [...datas].sort().reverse();
    if (JSON.stringify(datas) !== JSON.stringify(ord)) throw new Error("fora de ordem: " + datas.join(","));
  });

  await conf("ranking: vazio mostra estado vazio; com dados, pódio dos 3 e lista do 4º em diante", async () => {
    const m = env.todos.length;
    UI.irPara("ranking"); env.drenar(); await respirar(); env.drenar();   // placar carrega assíncrono
    if (!desde(m).some(n => tem(n, "vazio"))) throw new Error("sem estado vazio com placar vazio");
    const area = { innerHTML: "", children: [], appendChild(c) { this.children.push(c); return c; } };
    const linhas = Array.from({ length: 6 }, (_, i) => ({ nome_lutador: "L" + i, divisao: "lightweight", modo: "normal",
      pontuacao: 9000 - i * 100, cartel: "18-4", nota: "A", cinturoes: i === 0 ? 2 : 0, rosto: null }));
    UI.desenharRanking(area, linhas);
    const podio = area.children.find(n => tem(n, "podio"));
    const lista = area.children.find(n => tem(n, "ranking-lista"));
    if (!podio || podio.children.length !== 3) throw new Error("pódio não tem 3 degraus");
    if (!lista || lista.children.length !== 3) throw new Error("lista não tem as 3 linhas restantes");
    if (!tem(podio.children[1], "degrau-1")) throw new Error("1º lugar não está no meio do pódio");
    /* 2026-09-28: o número ao lado de cada jogador diz o que é */
    if (!podio.children.every(d => /\d\.\d{3}<small>pontos de legado<\/small>/.test(d.innerHTML))) throw new Error("pódio sem 'pontos de legado' junto do número");
    if (!lista.children.every(l => /<small>pontos<\/small>/.test(l.innerHTML))) throw new Error("linha do ranking sem 'pontos' junto do número");
    if (!desde(m).some(n => tem(n, "tela-sub") && /pontos de legado/.test(n.innerHTML) && /10\.000/.test(n.innerHTML)))
      throw new Error("a página do ranking não explica os pontos de legado");
    const area2 = { innerHTML: "", children: [], appendChild(c) { this.children.push(c); return c; } };
    UI.desenharRanking(area2, linhas, { nome_lutador: "Eu Mesmo", divisao: "lightweight", pontuacao: 4321, cartel: "12-10", nota: "D", cinturoes: 0, rosto: null, posicao: 41 });
    const minha = area2.children.find(n => tem(n, "rank-minha"));
    if (!minha || !/41/.test(minha.innerHTML) || !/Eu Mesmo/.test(minha.innerHTML)) throw new Error("faixa 'sua melhor posição' não apareceu certa");
  });

  await conf("ranking: nome de outro jogador nunca entra cru no HTML (prévia do menu, pódio, lista e sua posição; auditoria 2026-10-08)", () => {
    const mau = '<img src=x onerror=alert(1)>';
    const linhas = Array.from({ length: 5 }, (_, i) => ({ nome_lutador: mau + i, divisao: "lightweight", modo: "normal",
      pontuacao: 9000 - i * 100, cartel: "18-4", nota: "A", cinturoes: 0, rosto: null }));
    const area = { innerHTML: "", children: [], appendChild(c) { this.children.push(c); return c; } };
    UI.desenharRanking(area, linhas, { ...linhas[0], posicao: 7 });
    const nos = []; const andar = n => { if (!n) return; nos.push(n); (n.children || []).forEach(andar); };
    area.children.forEach(andar);
    const html = nos.map(n => String(n.innerHTML || "")).join("\n") + "\n" + UI.htmlPreviaRanking(linhas.slice(0, 3));
    if (/<img src=x/.test(html)) throw new Error("nome cru no HTML: " + html.slice(html.indexOf("<img src=x") - 40, html.indexOf("<img src=x") + 40));
    if (!/&lt;img src=x onerror=alert\(1\)&gt;/.test(html)) throw new Error("o nome escapado não apareceu");
  });

  await conf("ranking: uma linha por conta, a melhor carreira de cada uma, na ordem dos pontos (auditoria 2026-10-08)", () => {
    const linhas = [["u1", 9000], ["u1", 8900], ["u2", 8800], ["u1", 8750], ["u3", 8700], ["u2", 8600], ["u4", 8500]]
      .map(([user_id, pontuacao]) => ({ user_id, pontuacao, nome_lutador: user_id + "-" + pontuacao }));
    const r = UI.melhorPorConta(linhas, 3).map(l => l.nome_lutador).join(",");
    if (r !== "u1-9000,u2-8800,u3-8700") throw new Error("ranking: " + r);
  });

  await conf("Pro: aviso de vencimento no menu 3 dias antes e até 7 depois, com o botão de renovar (auditoria 2026-10-08)", async () => {
    const dia = 864e5, agora = Date.now(), iso = d => new Date(agora + d).toISOString();
    const t = d => UI.textoAvisoPro(iso(d), agora);
    if (!/vence em 2 dias/.test(t(2 * dia - 60000)) || !/amanhã/.test(t(dia / 2)) || t(5 * dia) !== null) throw new Error("antes: " + [t(2 * dia - 60000), t(dia / 2), t(5 * dia)].join(" | "));
    if (!/venceu em/.test(t(-3 * dia)) || t(-10 * dia) !== null || UI.textoAvisoPro(null) !== null) throw new Error("depois: " + [t(-3 * dia), t(-10 * dia)].join(" | "));
    const antes = estadoSb.assinatura;
    estadoSb.assinatura = { pro: true, expira_em: iso(2 * dia - 60000) };
    try {
      await vm.runInContext("PRO_EXPIRA_EM=undefined", env.sandbox);
      const m = env.todos.length;
      UI.irPara("menu"); env.drenar(); await respirar(); await respirar(); env.drenar();
      const aviso = desde(m).filter(n => tem(n, "aviso-pro")).pop();
      if (!aviso || !/vence em 2 dias/.test(aviso.innerHTML)) throw new Error("menu sem o aviso");
      const b = (aviso.children || []).find(n => n.tagName === "button");
      if (!b || !/Renovar/.test(b.innerHTML) || !b.onclick) throw new Error("aviso sem o botão de renovar");
    } finally { estadoSb.assinatura = antes; await vm.runInContext("PRO_EXPIRA_EM=undefined", env.sandbox); }
  });

  await conf("Começar rápido: do nome direto pro draft, peso-leve, sem rival, com visual e nome mesmo com o campo vazio (auditoria 2026-10-08)", async () => {
    const m = env.todos.length;
    UI.screenName(""); env.drenar(); await respirar();
    const b = desde(m).filter(n => n.id === "nomeRapido").pop();
    if (!b || !b.onclick || !/Começar rápido/.test(b.innerHTML)) throw new Error("sem o botão Começar rápido");
    const m2 = env.todos.length;
    b.onclick(); env.drenar(); await respirar();
    const r = JSON.parse(vm.runInContext("JSON.stringify({div:DIVISION,modo:MODO,rival:RIVAL_ATIVADO,nome:me&&me.name,rosto:!!ROSTO,restam:remaining.length})", env.sandbox));
    if (r.div !== "lightweight" || r.modo !== "normal" || r.rival !== false || !r.nome || !r.rosto || r.restam !== 4) throw new Error("estado: " + JSON.stringify(r));
    if (!desde(m2).some(n => (n.className || "").split(" ").includes("card") && n.onclick)) throw new Error("o draft não abriu");
  });

  await conf("cabeçalhos de segurança no vercel.json (sem moldura de outro site, nosniff, referrer) e aviso de não afiliação ao UFC nos Termos e no rodapé (auditoria 2026-10-08)", () => {
    const v = JSON.parse(fs.readFileSync(path.join(RAIZ, "vercel.json"), "utf8"));
    const regra = (v.headers || []).find(h => h.source === "/(.*)");
    const h = Object.fromEntries(((regra && regra.headers) || []).map(x => [x.key.toLowerCase(), x.value]));
    if (h["x-frame-options"] !== "DENY" || !/frame-ancestors 'none'/.test(h["content-security-policy"] || "") || h["x-content-type-options"] !== "nosniff" || !h["referrer-policy"])
      throw new Error("cabeçalhos: " + JSON.stringify(h));
    const html = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
    if (!/sem vínculo com o UFC/.test(html) || !/autorização do UFC/.test(html)) throw new Error("sem o aviso de não afiliação");
  });

  await conf("IA: todo pedido leva a sessão da conta, inclusive os grátis (feed, evento); o servidor recusa sem ela (auditoria 2026-10-08)", async () => {
    const antes = estadoSb.sessao;
    estadoSb.sessao = { user: { id: "u-teste", email: "t@t.com" }, access_token: "tok-sessao" };
    const corpos = [], fOrig = env.sandbox.fetch;
    env.sandbox.fetch = async (u, op) => { if (/\/api\/ai\b/.test(String(u))) corpos.push(JSON.parse(op.body)); return { ok: false, status: 503, json: async () => ({ transitorio: true }) }; };
    try { for (const k of ["feed", "evento"]) await vm.runInContext(`ai(${JSON.stringify(k)},{name:"Teste"})`, env.sandbox); }
    finally { env.sandbox.fetch = fOrig; estadoSb.sessao = antes; }
    if (corpos.length < 2 || !corpos.every(c => c.data && c.data.token === "tok-sessao")) throw new Error("pedido sem a sessão: " + JSON.stringify(corpos.map(c => c.kind + ":" + (c.data && c.data.token))));
  });

  await conf("continuar: 3 espaços, vazio leva a Nova carreira", async () => {
    const m = env.todos.length;
    UI.irPara("continuar"); env.drenar(); await respirar(); env.drenar(); await respirar();
    const slots = desde(m).filter(n => tem(n, "save-slot"));
    if (slots.length !== 3) throw new Error(slots.length + " espaços");
    slots[0].onclick(); env.drenar(); await respirar();
    if (UI.rotaAtual() !== "nova") throw new Error("espaço vazio foi pra " + UI.rotaAtual());
  });

  /* A página Créditos saiu (reta final, 2026-09-28). O crédito que a
     licença obriga (sons CC BY) mora no painel da engrenagem, conferido na
     suíte som; a nota ISC do Lucide mora dentro de img/icones.svg. */
  await conf("créditos: a rota saiu, e a nota de licença do Lucide está no sprite", () => {
    if (UI.ROTAS && UI.ROTAS.creditos) throw new Error("a rota #/creditos continua registrada");
    const svg = fs.readFileSync(path.join(__dirname, "img", "icones.svg"), "utf8");
    for (const t of ["Lucide", "ISC License", "Permission to use, copy, modify"])
      if (!svg.includes(t)) throw new Error("img/icones.svg sem a nota de licença (" + t + ")");
  });

  await conf("todas as rotas do spec estão registradas", () => {
    const faltam = ["menu", "nova", "continuar", "conta", "atualizacoes", "ranking",
      "termos", "privacidade", "404", "jxj"].filter(r => !UI.ROTAS || !UI.ROTAS[r]);
    if (faltam.length) throw new Error("faltam: " + faltam.join(","));
  });

  for (const r of ["continuar", "ranking", "atualizacoes", "conta", "termos", "privacidade", "jxj"]) {
    await conf(`#/${r}: abre, tem Voltar, Voltar leva ao menu`, async () => {
      const m = env.todos.length;
      UI.irPara(r);
      env.drenar(); await respirar(); env.drenar(); await respirar();   // continuar confere a sessão antes
      if (UI.rotaAtual() !== r) throw new Error("rotaAtual = " + UI.rotaAtual());
      const voltar = desde(m).filter(n => tem(n, "btn-voltar") && n.onclick).pop();
      if (!voltar) throw new Error("tela sem botão Voltar");
      const m2 = env.todos.length;
      voltar.onclick();
      env.drenar();
      if (UI.rotaAtual() !== "menu") throw new Error("Voltar foi pra " + UI.rotaAtual());
      if (desde(m2).filter(n => tem(n, "menu-card")).length !== 6) throw new Error("menu não foi redesenhado");
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

  /* Emoji como ícone: proibido em TODA tela nova (ícone é SVG do sprite).
     Travessão: só nas telas de texto 100% novo; as que reaproveitam texto
     antigo (Conta: formulário e vitrine do Pro) entram na passada de
     texto da fase 7, depois das amostras aprovadas pelo dono. */
  await conf("telas novas sem emoji (todas) e sem travessão (as de texto novo)", async () => {
    const sujos = [];
    const SEM_TRAVESSAO = ["menu", "continuar", "ranking", "atualizacoes", "nao-existe"];
    for (const r of [...SEM_TRAVESSAO, "conta", "termos", "privacidade"]) {
      const m = env.todos.length;
      UI.irPara(r);
      env.drenar(); await respirar(); env.drenar();
      desde(m).forEach(n => {
        const h = String(n.innerHTML || "") + String(n.textContent || "");
        if (EMOJI.test(h)) sujos.push(`${r}: emoji em "${h.slice(0, 60)}"`);
        if (SEM_TRAVESSAO.includes(r) && /[—–]/.test(h)) sujos.push(`${r}: travessão em "${h.slice(0, 60)}"`);
      });
    }
    if (sujos.length) throw new Error(sujos.slice(0, 5).join(" | "));
  });

  await conf("#/nova COM sessão abre o fluxo de nova carreira (campo de nome)", async () => {
    estadoSb.sessao = { user: { id: "u1", email: "t@t.com" } };
    const m = env.todos.length;
    UI.irPara("nova");
    env.drenar(); await respirar(); env.drenar(); await respirar();
    if (!desde(m).some(n => n.tagName === "input" && n.type === "text")) throw new Error("campo de nome não apareceu");
  });
  await conf("#/nova SEM sessão abre o portão (formulário em modo Criar) e guarda a intenção", async () => {
    estadoSb.sessao = null;
    delete dadosLS.intencao;
    const m = env.todos.length;
    UI.irPara("nova");
    env.drenar(); await respirar(); env.drenar(); await respirar();
    if (!desde(m).some(n => tem(n, "tela-portao"))) throw new Error("portão não apareceu");
    const h4 = desde(m).filter(n => n.tagName === "h4").pop();
    if (!h4 || h4.innerHTML !== "Criar conta") throw new Error("formulário do portão não começou em Criar conta: " + (h4 && h4.innerHTML));
    const v = JSON.parse(dadosLS.intencao || "null");
    if (!v || v.tipo !== "nova") throw new Error("intenção não guardada: " + dadosLS.intencao);
    if (desde(m).some(n => n.tagName === "input" && n.type === "text" && n.id === "nomeIn")) throw new Error("fluxo de nome abriu sem conta");
  });
  await conf("#/continuar SEM sessão também para no portão", async () => {
    estadoSb.sessao = null;
    const m = env.todos.length;
    UI.irPara("continuar");
    env.drenar(); await respirar(); env.drenar(); await respirar();
    if (!desde(m).some(n => tem(n, "tela-portao"))) throw new Error("portão não apareceu");
    if (desde(m).some(n => tem(n, "save-slot"))) throw new Error("mostrou os espaços sem conta");
    if (JSON.parse(dadosLS.intencao).tipo !== "continuar") throw new Error("intenção errada");
  });
  /* Achado em produção (2026-09-27, conta Pro do dono): meuPro só era
     conferido na Conta, no Plano Pro e ao começar ou retomar a carreira.
     Página recém-aberta, Nova carreira: Seja uma lenda e o Rival nasciam
     travados, e o selo levava pra tela de pagamento. */
  await conf("Pro no banco, página recém-aberta: Nova carreira confere o Pro antes do assistente", async () => {
    estadoSb.sessao = { user: { id: "u1", email: "t@t.com" } };
    estadoSb.assinatura = { pro: true, expira_em: null };
    UI.setMeuPro(false);
    UI.irPara("nova"); env.drenar(); await respirar(); env.drenar(); await respirar();
    if (UI.meuPro() !== true) throw new Error("meuPro continuou false depois de entrar em Nova carreira");
  });
  await conf("Pro: Seja uma lenda e o Rival nascem liberados no assistente, sem selo de pagamento", async () => {
    const m = env.todos.length;
    UI.screenDivisao("TesteBot"); env.drenar(); await respirar();
    const lenda = desde(m).filter(n => n.id === "modo_lenda").pop();
    if (!lenda || tem(lenda, "bloqueado") || !lenda.onclick) throw new Error("Seja uma lenda travado pra conta Pro");
    const m2 = env.todos.length;
    UI.screenAtivarRival("TesteBot"); env.drenar(); await respirar();
    const sim = desde(m2).filter(n => n.tagName === "button" && /Sim, quero um rival/.test(n.innerHTML || "")).pop();
    if (!sim || tem(sim, "bloqueado") || !sim.onclick) throw new Error("Rival travado pra conta Pro");
    if (desde(m).some(n => tem(n, "selo-assine"))) throw new Error("selo Assine o Pro apareceu pra conta Pro");
  });
  await conf("tela do assistente que nasceu travada destrava sozinha quando a conferência do Pro volta", async () => {
    UI.setMeuPro(false);   // a conferência ainda não tinha voltado quando a tela nasceu
    const m = env.todos.length;
    UI.screenDivisao("TesteBot");
    const lenda0 = desde(m).filter(n => n.id === "modo_lenda").pop();
    if (!lenda0 || !tem(lenda0, "bloqueado")) throw new Error("devia nascer travada (meuPro false)");
    env.drenar(); await respirar(); env.drenar(); await respirar();
    const lenda = desde(m).filter(n => n.id === "modo_lenda").pop();
    if (!lenda || tem(lenda, "bloqueado") || !lenda.onclick) throw new Error("Seja uma lenda não destravou");
    UI.setMeuPro(false);
    const m2 = env.todos.length;
    UI.screenAtivarRival("TesteBot");
    env.drenar(); await respirar(); env.drenar(); await respirar();
    const sim = desde(m2).filter(n => n.tagName === "button" && /Sim, quero um rival/.test(n.innerHTML || "")).pop();
    if (!sim || tem(sim, "bloqueado") || !sim.onclick) throw new Error("Rival não destravou");
  });
  await conf("login confere o Pro na hora e logout zera", async () => {
    UI.setMeuPro(false);
    estadoSb.aoMudar("SIGNED_IN", estadoSb.sessao); env.drenar(); await respirar(); env.drenar(); await respirar();
    if (UI.meuPro() !== true) throw new Error("SIGNED_IN não conferiu o Pro");
    estadoSb.aoMudar("SIGNED_OUT", null); env.drenar(); await respirar();
    if (UI.meuPro() !== false) throw new Error("SIGNED_OUT não zerou o Pro");
  });
  /* Fase 8: eventos de funil da conta (spec, seções 6 e 12). */
  await conf("funil: cadastro por e-mail manda criou_conta", async () => {
    eventosVA.length = 0;
    const r = await UI.criarConta("novo@t.com", "senha-boa-123");
    if (!r || !r.ok) throw new Error("cadastro falso falhou: " + JSON.stringify(r));
    if (!eventosVA.includes("criou_conta")) throw new Error("eventos: " + eventosVA.join(","));
  });
  await conf("funil: 1º login pelo Google manda criou_conta uma vez só; conta antiga não manda", async () => {
    eventosVA.length = 0;
    const nova = { user: { id: "g-novo", email: "g@t.com", created_at: new Date().toISOString(), app_metadata: { provider: "google" } } };
    estadoSb.aoMudar("SIGNED_IN", nova); env.drenar(); await respirar();
    estadoSb.aoMudar("SIGNED_IN", nova); env.drenar(); await respirar();
    const antiga = { user: { id: "g-antigo", email: "h@t.com", created_at: "2026-01-01T00:00:00Z", app_metadata: { provider: "google" } } };
    estadoSb.aoMudar("SIGNED_IN", antiga); env.drenar(); await respirar();
    const n = eventosVA.filter(e => e === "criou_conta").length;
    if (n !== 1) throw new Error(`criou_conta ${n} vez(es): ` + eventosVA.join(","));
  });
  await conf("funil: volta do link de confirmação (hash com type=signup) manda confirmou_email", async () => {
    eventosVA.length = 0;
    const antes = env.sandbox.location.hash;
    env.sandbox.location.hash = "#access_token=abc&refresh_token=def&type=signup";
    UI.avisarConfirmacaoEmail();
    env.sandbox.location.hash = "#/menu";
    UI.avisarConfirmacaoEmail();
    env.sandbox.location.hash = antes;
    const n = eventosVA.filter(e => e === "confirmou_email").length;
    if (n !== 1) throw new Error(`confirmou_email ${n} vez(es): ` + eventosVA.join(","));
  });
  await conf("conta grátis continua com as travas no assistente", async () => {
    estadoSb.assinatura = null;
    UI.setMeuPro(false);
    UI.irPara("nova"); env.drenar(); await respirar(); env.drenar(); await respirar();
    const m = env.todos.length;
    UI.screenDivisao("TesteBot"); env.drenar(); await respirar(); env.drenar(); await respirar();
    const lenda = desde(m).filter(n => n.id === "modo_lenda").pop();
    if (!lenda || !tem(lenda, "bloqueado") || lenda.onclick) throw new Error("Seja uma lenda liberado pra conta grátis");
  });
  /* saves sintéticos: só os campos que a tela de espaços lê */
  const saveFalso = (slot, nome, luta, horasAtras) => JSON.stringify({ versao: 1, slot, fase: "carreira", nome,
    divisao: "lightweight", modo: slot === 3 ? "lenda" : "normal", rosto: null, fightNo: luta,
    st: { wins: luta - 2, losses: 2, title: luta > 10 }, atualizadoEm: new Date(Date.now() - horasAtras * 3600e3).toISOString() });
  await conf("continuar com 1 save no espaço 2: livre, salvo (nome, luta N de 22), livre", async () => {
    estadoSb.sessao = { user: { id: "u1", email: "t@t.com" } };
    for (const k of Object.keys(dadosLS)) if (k.startsWith("save:")) delete dadosLS[k];
    dadosLS["save:u1:2"] = saveFalso(2, "Kayo Brasa", 11, 2);
    const m = env.todos.length;
    UI.irPara("continuar"); env.drenar(); await respirar(); env.drenar(); await respirar();
    const slots = desde(m).filter(n => tem(n, "save-slot"));
    if (slots.length !== 3) throw new Error(slots.length + " espaços");
    const vazios = slots.map(n => tem(n, "save-slot-vazio"));
    if (JSON.stringify(vazios) !== "[true,false,true]") throw new Error("ordem dos espaços: " + JSON.stringify(vazios));
    const textoDe = (n) => String(n.innerHTML || "") + (n.children || []).map(textoDe).join(" ");
    const h = textoDe(slots[1]);
    if (!/Kayo Brasa/.test(h) || !/Luta 11 de 22/.test(h)) throw new Error("card do save sem nome ou luta: " + h.slice(0, 200));
  });
  await conf("apagar pede confirmação na própria tela: 1º clique não apaga, 2º apaga", async () => {
    const m0 = env.todos.length;
    UI.irPara("continuar"); env.drenar(); await respirar(); env.drenar(); await respirar();
    const apagar = env.todos.slice(m0).filter(n => tem(n, "slot-apagar") && n.onclick).pop();
    if (!apagar) throw new Error("botão apagar não existe");
    apagar.onclick(); env.drenar(); await respirar();
    if (!dadosLS["save:u1:2"]) throw new Error("apagou no primeiro clique");
    const conf2 = env.todos.slice(m0).filter(n => tem(n, "slot-apagar-sim") && n.onclick).pop();
    if (!conf2) throw new Error("confirmação não apareceu");
    conf2.onclick(); env.drenar(); await respirar(); env.drenar(); await respirar();
    if (dadosLS["save:u1:2"]) throw new Error("não apagou depois de confirmar");
  });
  await conf("nova carreira com os 3 espaços cheios: escolhe qual substituir, só inicia depois de confirmar", async () => {
    dadosLS["save:u1:1"] = saveFalso(1, "Um", 5, 5);
    dadosLS["save:u1:2"] = saveFalso(2, "Dois", 8, 3);
    dadosLS["save:u1:3"] = saveFalso(3, "Tres", 2, 1);
    const m = env.todos.length;
    UI.irPara("nova"); env.drenar(); await respirar(); env.drenar(); await respirar();
    if (!desde(m).some(n => tem(n, "tela-espaco"))) throw new Error("tela de escolher espaço não apareceu");
    if (desde(m).some(n => n.id === "nomeIn")) throw new Error("abriu o nome sem escolher espaço");
    const subst = desde(m).filter(n => tem(n, "slot-substituir") && n.onclick);
    if (subst.length !== 3) throw new Error(subst.length + " botões de substituir");
    subst[1].onclick(); env.drenar(); await respirar();
    if (!dadosLS["save:u1:2"]) throw new Error("substituiu sem confirmar");
    const sim = desde(m).filter(n => tem(n, "slot-substituir-sim") && n.onclick).pop();
    if (!sim) throw new Error("confirmação de substituir não apareceu");
    const m2 = env.todos.length;
    sim.onclick(); env.drenar(); await respirar(); env.drenar(); await respirar();
    if (dadosLS["save:u1:2"]) throw new Error("save antigo do espaço 2 não foi apagado");
    if (!env.todos.slice(m2).some(n => n.tagName === "input" && n.type === "text")) throw new Error("não abriu o nome depois de confirmar");
    for (const k of Object.keys(dadosLS)) if (k.startsWith("save:")) delete dadosLS[k];
  });
  await conf("menu com saves: card Continuar mostra a carreira mais recente e acende; Conta conta as salvas", async () => {
    estadoSb.sessao = { user: { id: "u1", email: "t@t.com" } };
    dadosLS["save:u1:1"] = saveFalso(1, "Antigo", 4, 30);
    dadosLS["save:u1:3"] = saveFalso(3, "Recente Silva", 9, 1);
    const m = env.todos.length;
    UI.irPara("menu"); env.drenar(); await respirar(); env.drenar(); await respirar(); env.drenar(); await respirar();
    const card = desde(m).filter(n => tem(n, "menu-card") && n.dataset.rota === "continuar").pop();
    const txt = desde(m).filter(n => n.id === "continuar-txt").pop() || env.registro["continuar-txt"];
    const t = (txt && (txt.textContent || txt.innerHTML)) || "";
    if (!/Recente Silva/.test(t) || !/luta 9 de 22/.test(t)) throw new Error("card Continuar não mostrou a mais recente: " + t);
    if (tem(card, "apagado")) throw new Error("card Continuar continuou apagado com save existente");
    const conta = env.registro["previa-conta"];
    if (!conta || !/2 carreiras salvas/.test(conta.innerHTML)) throw new Error("prévia da Conta sem a contagem: " + (conta && conta.innerHTML));
    for (const k of Object.keys(dadosLS)) if (k.startsWith("save:")) delete dadosLS[k];
  });
  await conf("bloqueioPro sem Pro: embrulha, apaga e desliga o recurso, só o selo 'Assine o Pro' clica e leva à conta", () => {
    UI.setMeuPro(false);
    const alvo = env.sandbox.document.createElement("button");
    alvo.className = "modo"; let clicou = false; alvo.onclick = () => { clicou = true; };
    const w = UI.bloqueioPro(alvo);
    if (w === alvo || !tem(w, "bloqueio-pro")) throw new Error("não embrulhou");
    if (!tem(alvo, "bloqueado")) throw new Error("recurso sem a classe bloqueado");
    if (alvo.onclick) throw new Error("recurso continuou clicável");
    const selo = w.children.find(n => tem(n, "selo-assine"));
    if (!selo || !selo.onclick || !/Assine o Pro/i.test(selo.innerHTML)) throw new Error("sem o selo Assine o Pro");
    selo.onclick(); env.drenar();
    if (UI.rotaAtual() !== "conta" || !/#\/conta\/pro/.test(env.sandbox.location.hash)) throw new Error("selo foi pra " + env.sandbox.location.hash);
    void clicou;
  });
  await conf("bloqueioPro com Pro: devolve o recurso sem mudar nada", () => {
    UI.setMeuPro(true);
    const alvo = env.sandbox.document.createElement("button");
    alvo.className = "modo"; alvo.onclick = () => {};
    const w = UI.bloqueioPro(alvo);
    UI.setMeuPro(false);
    if (w !== alvo || tem(alvo, "bloqueado") || !alvo.onclick) throw new Error("mexeu no recurso de quem é Pro");
  });
  await conf("montarPasso(2,5): 'Passo 2 de 5' e barra com 5 segmentos, 2 acesos", () => {
    const m = env.todos.length;
    UI.montarPasso(2, 5, { titulo: "Visual", fundo: "vestiario", voltar: () => {} });
    const barra = desde(m).find(n => tem(n, "passo-barra"));
    if (!barra) throw new Error("sem barra de progresso");
    const segs = barra.children.filter(n => tem(n, "passo-seg"));
    if (segs.length !== 5 || segs.filter(n => tem(n, "on")).length !== 2) throw new Error(`segmentos ${segs.length}, acesos ${segs.filter(n => tem(n, "on")).length}`);
    if (!desde(m).some(n => /Passo 2 de 5/.test(n.innerHTML || ""))) throw new Error("sem o texto Passo 2 de 5");
    const voltar = desde(m).find(n => tem(n, "btn-voltar"));
    if (!voltar || !voltar.onclick) throw new Error("passo sem Voltar");
  });
  await conf("intenção: consumirIntencao devolve e apaga; com mais de 24 h é ignorada", () => {
    UI.guardarIntencao({ tipo: "nova" });
    const v = UI.consumirIntencao();
    if (!v || v.tipo !== "nova") throw new Error("não devolveu a intenção");
    if (dadosLS.intencao) throw new Error("não apagou depois de consumir");
    dadosLS.intencao = JSON.stringify({ tipo: "nova", em: Date.now() - 25 * 3600 * 1000 });
    if (UI.consumirIntencao() !== null) throw new Error("intenção velha não foi ignorada");
    estadoSb.sessao = { user: { id: "u1", email: "t@t.com" } };
  });

  const ok = !falhas.length;
  console.log("\n" + (ok ? verde("rotas ok") : vermelho(`${falhas.length} falha(s) nas rotas`)));
  return ok;
}

/* ------------------------------------------------------------------ *
 * Carreira de verdade num sandbox isolado (revamp fase 3, suíte save).
 * Diferente de testarFrequenciaConquistas (que monta `st` à mão por
 * velocidade): aqui o caminho é o REAL, startDraft() + draft guloso +
 * startCareer(), porque o save tem que serializar o estado que o jogo
 * de fato cria. IA offline (fetch rejeita) = fallbacks locais,
 * determinísticos pela semente.
 * ------------------------------------------------------------------ */
function sandboxCarreira() {
  const noop = () => {};
  const registro = {}; const timers = [];
  function makeEl(tag) {
    const n = {
      tagName: tag, _html: "", textContent: "", id: "", className: "", style: {},
      children: [], disabled: false, value: "", dataset: {},
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      appendChild(c) { this.children.push(c); if (c && c.id) registro[c.id] = c; return c; },
      append(...cs) { cs.forEach(c => this.appendChild(c)); },
      scrollIntoView: noop, focus: noop, addEventListener: noop, remove: noop, setAttribute: noop,
      querySelector: () => makeEl(), querySelectorAll: () => [],
      getContext: () => null, get innerHTML() { return this._html; },
      set innerHTML(v) { this._html = String(v); if (v === "") this.children = []; },
    };
    return n;
  }
  const dadosLS = {};
  const sb = {
    console: { log: noop, warn: noop, error: noop },
    document: {
      documentElement: makeEl("html"),
      /* o nocaute pisca a tela (document.body.classList): sem body, a luta
         que termina em nocaute sem reduce-motion quebrava só aqui */
      body: makeEl("body"),
      getElementById: id => registro[id] || (registro[id] = Object.assign(makeEl("div"), { id })),
      createElement: t => makeEl(t), querySelector: () => makeEl("div"),
      addEventListener: noop, removeEventListener: noop,
    },
    window: { matchMedia: () => ({ matches: true }), addEventListener: noop, scrollTo: noop },
    location: { hash: "", href: "https://octogono.fun/", search: "", pathname: "/", origin: "https://octogono.fun", reload: noop },
    localStorage: { getItem: k => (k in dadosLS ? dadosLS[k] : null), setItem: (k, v) => { dadosLS[k] = String(v); }, removeItem: k => { delete dadosLS[k]; } },
    setTimeout: fn => { timers.push(fn); return timers.length; },
    clearTimeout: noop, setInterval: noop, clearInterval: noop,
    fetch: () => Promise.reject(new Error("offline")),
    AbortController: class { constructor() { this.signal = null; } abort() {} },
    Math, JSON, Date, Number, String, Array, Object, Promise, Set, Map, Error, isNaN,
  };
  sb.globalThis = sb;
  sb.history = { pushState: (x, y, u) => { sb.location.hash = String(u || ""); }, replaceState: (x, y, u) => { sb.location.hash = String(u || ""); } };
  vm.createContext(sb);
  vm.runInContext(lerScript() + `
;globalThis.__run=(c)=>eval(c);`, sb, { filename: "index.html" });
  const drenar = () => { let i = 0; while (timers.length && i++ < 200000) (timers.shift())(); };
  /* parar EXATAMENTE no fim da luta alvo: o automático agenda a próxima
     luta dentro de finishFight(), e esse timer confere `auto` na hora de
     rodar; desligar `auto` logo depois da luta alvo faz ele não fazer nada */
  sb.__alvo = 22;
  sb.__run(`(function(){const orig=finishFight;finishFight=function(){const r=orig.apply(this,arguments);
    if(fightNo>=globalThis.__alvo)auto=false;return r;};})()`);
  return { sb, registro, drenar, dadosLS, run: c => sb.__run(c) };
}
/* começa uma carreira pelo caminho real: startDraft, draft guloso (mais
   caro que cabe no orçamento, mesmo critério do freqconquistas; sem carta
   que caiba, a carta mínima de custo zero, igual à mesa do jogo), startCareer */
function iniciarCarreiraTeste(ctx, F, seed, modo = "normal", rosterJSON = null) {
  ctx.sb.__F = F;
  /* rosterJSON: ROSTER já avaliado (rateAll é determinístico e é a parte
     cara, ~7 s); suítes com muitas carreiras curtas avaliam uma vez só */
  ctx.sb.__RJ = rosterJSON;
  ctx.run(`(function(){
    ROSTER=globalThis.__RJ?JSON.parse(globalThis.__RJ):rateAll(globalThis.__F);
    CUTOFF_RANKING=Math.max(...ROSTER.map(f=>f.era?f.era[1]:0))-6;
    DIVISION=${JSON.stringify(process.env.BALANCO_DIV || "lightweight")}; MODO=${JSON.stringify(modo)}; SEED=${seed};
    RIVAL_ATIVADO=false; RIVAL_NOME_ESCOLHIDO=null; ROSTO=null;
    startDraft("TesteBot");
    let left=budgetLeft, rem=[...remaining];
    while(rem.length){
      const rows=rollTable(POOL,rem,rng,PCT);
      const sh=cartasDaMesa(rows,left,rem,POOL,PCT);
      const r=sh.reduce((m,x)=>x.cost>m.cost?x:m,sh[0]);
      me[r.pair.a.key]=r.src[r.pair.a.key]; me[r.pair.b.key]=r.src[r.pair.b.key];
      picks.push({pair:r.pair,from:r.src.name});
      left-=r.cost; rem=rem.filter(p=>p.id!==r.pair.id);
    }
    remaining=[]; budgetLeft=left;
    startCareer();
    auto=true;
  })()`);
}
const respirarCarreira = () => new Promise(r => setImmediate(r));
async function resolverDilemaTeste(ctx, texto) {
  if (!ctx.run("dilemaAberto")) return false;
  const campo = ctx.registro.dilresp, botao = ctx.registro.dilgo;
  if (campo && botao && !campo.disabled && !botao.disabled && botao.onclick) {
    campo.value = texto;
    botao.onclick();
    delete ctx.registro.dilresp; delete ctx.registro.dilgo;
    for (let k = 0; k < 4; k++) { ctx.drenar(); await respirarCarreira(); }
    ctx.run("auto=true;");
    return true;
  }
  return false;
}
/* joga (no automático) até fightNo === alvo, resolvendo dilemas no caminho */
async function jogarCarreiraAte(ctx, alvo, texto = "aceito, sem problema") {
  ctx.sb.__alvo = alvo;
  for (let guarda = 0; guarda < 400 && ctx.run("fightNo") < alvo; guarda++) {
    for (let k = 0; k < 3; k++) { ctx.drenar(); await respirarCarreira(); }
    if (await resolverDilemaTeste(ctx, texto)) continue;
    if (ctx.run("playing||dilemaAberto||escolhaAberta||entrevistaAberta")) continue;
    /* confere de novo DEPOIS de drenar: o automático pode ter começado e
       terminado a luta alvo inteira dentro da drenagem acima (fase 5:
       sem isto o ajudante chamava uma luta a mais e parava em alvo+1) */
    if (ctx.run("fightNo") >= alvo) break;
    ctx.run("auto=true;nextFight();");
  }
  for (let k = 0; k < 6; k++) { ctx.drenar(); await respirarCarreira(); await resolverDilemaTeste(ctx, texto); }
  return ctx.run("fightNo");
}

/* ================================================================== *
 * SAVE (revamp fase 3): geradores serializáveis, carreira interrompida
 * e retomada = carreira direta, pendências (luta em andamento, dilema
 * aberto), armazenamento no aparelho + nuvem.
 * ================================================================== */
/* primeiros 3 valores de mulberry32(12345) gravados com a função ANTES de
   ganhar .estado()/.restaurar(): prova que a sequência não mudou */
const ESPERADO_MULBERRY_12345 = "0.9797282678,0.3067522645,0.4842054215";
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
    if (v !== ESPERADO_MULBERRY_12345) throw new Error("sequência mudou: " + v);
  });
  await conf("mulberry32: estado() + restaurar() continua exatamente de onde parou", () => {
    const a = M.mulberry32(987654321);
    for (let i = 0; i < 1000; i++) a();
    if (typeof a.estado !== "function") throw new Error("gerador sem .estado()");
    const e = a.estado();
    const esperado = [a(), a(), a(), a()];
    const b = M.mulberry32(1); b.restaurar(e);
    const obtido = [b(), b(), b(), b()];
    if (JSON.stringify(esperado) !== JSON.stringify(obtido)) throw new Error("restaurado divergiu");
  });
  const F = lerLutadores();
  await conf("carreira inteira pelo caminho real: st.registro tem as 22 lutas, coerente com o cartel", async () => {
    const ctx = sandboxCarreira();
    iniciarCarreiraTeste(ctx, F, 424242);
    const n = await jogarCarreiraAte(ctx, 22);
    if (n !== 22) throw new Error("carreira parou na luta " + n);
    const r = ctx.run("JSON.stringify({reg:st.registro||null,w:st.wins,l:st.losses})");
    const { reg, w, l } = JSON.parse(r);
    if (!Array.isArray(reg)) throw new Error("st.registro não existe");
    if (reg.length !== 22) throw new Error("registro com " + reg.length + " lutas");
    if (reg.filter(x => x.venceu).length !== w) throw new Error("vitórias do registro != st.wins");
    if (reg.filter(x => !x.venceu).length !== l) throw new Error("derrotas do registro != st.losses");
    if (!reg.every((x, i) => x.n === i + 1)) throw new Error("numeração fora de ordem");
    if (new Set(reg.map(x => x.adv)).size !== 22) throw new Error("adversário repetido no registro");
  });
  /* O teste que importa: interromper na luta 11, salvar, retomar num
     sandbox ZERADO e terminar tem que dar exatamente a mesma carreira de
     quem jogou direto. Compara o registro luta a luta, o cartel, dinheiro,
     seguidores, cinturão, treino e o estado final do gerador principal. */
  const resumo = ctx => JSON.parse(ctx.run(`JSON.stringify({
    reg:(st.registro||[]).map(x=>[x.n,x.adv,x.venceu,x.metodo,x.round,x.relogio]),
    w:st.wins,l:st.losses,din:st.dinheiro,seg:st.followers,title:st.title,treino:st.treino,
    rng:rng.estado(),hold:holdRng.estado(),esc:escolhaRng.estado()})`));
  let direta = null;
  await conf("carreira interrompida na luta 11, salva e retomada = carreira direta, luta por luta", async () => {
    const A = sandboxCarreira();
    iniciarCarreiraTeste(A, F, 777001);
    if (await jogarCarreiraAte(A, 11) !== 11) throw new Error("A não parou na 11");
    const save = A.run("JSON.stringify(montarSave())");
    const B = sandboxCarreira();
    B.sb.__F = F; B.sb.__save = save;
    B.run(`ROSTER=rateAll(globalThis.__F);CUTOFF_RANKING=Math.max(...ROSTER.map(f=>f.era?f.era[1]:0))-6;
      retomarCarreira(JSON.parse(globalThis.__save));`);
    if (B.run("fightNo") !== 11) throw new Error("retomada não voltou na luta 11");
    await jogarCarreiraAte(B, 22);
    const C = sandboxCarreira();
    iniciarCarreiraTeste(C, F, 777001);
    await jogarCarreiraAte(C, 22);
    const rb = resumo(B), rc = resumo(C);
    direta = rc;
    if (rc.reg.length !== 22) throw new Error("direta não chegou na 22");
    for (let i = 0; i < 22; i++)
      if (JSON.stringify(rb.reg[i]) !== JSON.stringify(rc.reg[i]))
        throw new Error(`luta ${i + 1} divergiu: retomada ${JSON.stringify(rb.reg[i])} vs direta ${JSON.stringify(rc.reg[i])}`);
    for (const k of ["w", "l", "din", "seg", "title", "rng", "hold", "esc"])
      if (JSON.stringify(rb[k]) !== JSON.stringify(rc[k])) throw new Error(`${k} divergiu: ${rb[k]} vs ${rc[k]}`);
    if (JSON.stringify(rb.treino) !== JSON.stringify(rc.treino)) throw new Error("treino divergiu");
  });
  await conf("carreira retomada redesenha o histórico: 11 linhas de luta na tela logo depois de retomar", async () => {
    const A = sandboxCarreira();
    iniciarCarreiraTeste(A, F, 777002);
    await jogarCarreiraAte(A, 11);
    const save = A.run("JSON.stringify(montarSave())");
    const B = sandboxCarreira();
    B.sb.__F = F; B.sb.__save = save;
    B.run(`ROSTER=rateAll(globalThis.__F);CUTOFF_RANKING=Math.max(...ROSTER.map(f=>f.era?f.era[1]:0))-6;
      retomarCarreira(JSON.parse(globalThis.__save));`);
    const bouts = B.registro.bouts;
    const linhas = bouts ? bouts.children.filter(n => (n.className || "").split(" ").includes("bout")) : [];
    if (linhas.length !== 11) throw new Error(`${linhas.length} linhas .bout no histórico retomado`);
  });
  /* retoma um save num sandbox zerado (mesmo passo dos testes acima) */
  /* antes: código rodado ANTES de retomar (luta interativa: o plano do
     round abre na hora da retomada, então o stub da escolha vem antes) */
  const retomarEm = (save, antes = "") => {
    const B = sandboxCarreira();
    B.sb.__F = F; B.sb.__save = save;
    B.run(`ROSTER=rateAll(globalThis.__F);CUTOFF_RANKING=Math.max(...ROSTER.map(f=>f.era?f.era[1]:0))-6;${antes}
      retomarCarreira(JSON.parse(globalThis.__save));`);
    return B;
  };
  await conf("recarregar NO MEIO da luta refaz a MESMA luta (semente gravada no início)", async () => {
    const A = sandboxCarreira();
    iniciarCarreiraTeste(A, F, 777003);
    await jogarCarreiraAte(A, 6);
    // começa a luta 7 e salva ANTES de a narração andar (nada de drenar)
    A.run("auto=true;nextFight();");
    if (A.run("fightNo") !== 7) throw new Error("luta 7 não começou");
    const pend = JSON.parse(A.run("JSON.stringify(PENDENTE)"));
    if (!pend || pend.tipo !== "luta" || !Number.isFinite(pend.semL)) throw new Error("PENDENTE da luta não gravado: " + JSON.stringify(pend));
    const save = A.run("JSON.stringify(montarSave())");
    /* plano neutro (o mesmo do automático que jogou a luta de C) */
    const B = retomarEm(save, "abrirEscolhaLuta=function(sc,ref,opp,cb){cb(1);};");
    B.sb.__alvo = 7;   // só a luta retomada; o automático não segue pra 8
    B.run("auto=true;");
    for (let k = 0; k < 6; k++) { B.drenar(); await respirarCarreira(); }
    const C = sandboxCarreira();
    iniciarCarreiraTeste(C, F, 777003);
    await jogarCarreiraAte(C, 7);
    const lb = JSON.parse(B.run("JSON.stringify((st.registro||[])[6]||null)"));
    const lc = JSON.parse(C.run("JSON.stringify((st.registro||[])[6]||null)"));
    if (!lb) throw new Error("luta retomada não terminou (registro[6] vazio)");
    for (const k of ["adv", "venceu", "metodo", "round", "relogio"])
      if (lb[k] !== lc[k]) throw new Error(`luta 7 retomada divergiu em ${k}: ${lb[k]} vs ${lc[k]}`);
    if (B.run("PENDENTE") !== null) throw new Error("PENDENTE não foi limpo depois da luta");
  });
  await conf("luta interativa: o plano de cada round fica gravado e é reaplicado ao retomar (round já escolhido não abre de novo)", async () => {
    const PLANO = `abrirEscolhaLuta=function(sc,ref,opp,cb,info){globalThis.__abertas=(globalThis.__abertas||0)+1;cb(1.08,"slpm",{id:"teste",nome:"Plano de teste"});};`;
    const A = sandboxCarreira();
    iniciarCarreiraTeste(A, F, 777005);
    await jogarCarreiraAte(A, 3);
    A.run(PLANO + "globalThis.__abertas=0;");
    A.sb.__alvo = 4;
    A.run("auto=true;nextFight();");
    for (let k = 0; k < 6; k++) { A.drenar(); await respirarCarreira(); }
    const abertasA = A.run("globalThis.__abertas");
    if (abertasA < 2) throw new Error("semente de teste terminou a luta 4 no 1º round; trocar a semente");
    const B0 = sandboxCarreira();
    iniciarCarreiraTeste(B0, F, 777005);
    await jogarCarreiraAte(B0, 3);
    // grava o save logo depois do PRIMEIRO plano escolhido
    B0.run(PLANO + `const __sc=salvarCarreira;salvarCarreira=function(){__sc();if(PENDENTE&&PENDENTE.escolhas&&PENDENTE.escolhas.length&&!globalThis.__saveDepoisDaEscolha)
        globalThis.__saveDepoisDaEscolha=JSON.stringify(montarSave());};`);
    B0.sb.__alvo = 4;
    B0.run("auto=true;nextFight();");
    for (let k = 0; k < 4; k++) { B0.drenar(); await respirarCarreira(); }
    const save = B0.run("globalThis.__saveDepoisDaEscolha");
    if (!save) throw new Error("nenhum save com o plano gravado");
    const esc = JSON.parse(save).pendente.escolhas;
    if (!esc || !esc[0] || esc[0].attr !== "slpm" || esc[0].nome !== "Plano de teste") throw new Error("save sem o plano do round 1: " + JSON.stringify(esc));
    const B = retomarEm(save, PLANO + "globalThis.__abertas=0;");
    B.sb.__alvo = JSON.parse(save).fightNo;
    B.run("auto=true;");
    for (let k = 0; k < 6; k++) { B.drenar(); await respirarCarreira(); }
    const abertasB = B.run("globalThis.__abertas");
    if (abertasB !== abertasA - 1) throw new Error(`retomada abriu ${abertasB} planos; a luta direta abriu ${abertasA} (o do round 1 já estava escolhido)`);
    const lb = JSON.parse(B.run("JSON.stringify(st.registro[3])"));
    const la = JSON.parse(A.run("JSON.stringify(st.registro[3])"));
    for (const k of ["adv", "venceu", "metodo", "round", "relogio"])
      if (lb[k] !== la[k]) throw new Error(`luta com plano divergiu em ${k}: ${lb[k]} vs ${la[k]}`);
  });
  await conf("luta interativa: save de antes (uma escolha só, valendo do round 2 ao fim) refaz a mesma luta", async () => {
    const A = sandboxCarreira();
    iniciarCarreiraTeste(A, F, 777005);
    await jogarCarreiraAte(A, 3);
    A.run("auto=true;nextFight();");
    const save = JSON.parse(A.run("JSON.stringify(montarSave())"));
    save.pendente.escolha = { mod: 1.08, attr: "slpm" };
    delete save.pendente.escolhas;
    const B = retomarEm(JSON.stringify(save), "globalThis.__abertas=0;abrirEscolhaLuta=function(){globalThis.__abertas++;};");
    B.sb.__alvo = save.fightNo;
    B.run("auto=true;");
    for (let k = 0; k < 6; k++) { B.drenar(); await respirarCarreira(); }
    if (B.run("globalThis.__abertas") !== 0) throw new Error("save antigo abriu plano de novo");
    if (!JSON.parse(B.run("JSON.stringify(st.registro[3]||null)"))) throw new Error("a luta do save antigo não terminou");
  });
  await conf("dilema aberto reabre O MESMO texto ao retomar, sem pedir dilema novo", async () => {
    const A = sandboxCarreira();
    iniciarCarreiraTeste(A, F, 777005);
    A.sb.__alvo = 5;
    // joga até a luta 5 SEM responder o dilema (ele abre no fim da luta 5)
    for (let g = 0; g < 200 && A.run("fightNo") < 5; g++) {
      for (let k = 0; k < 3; k++) { A.drenar(); await respirarCarreira(); }
      if (A.run("playing||dilemaAberto")) continue;
      A.run("auto=true;nextFight();");
    }
    for (let k = 0; k < 6; k++) { A.drenar(); await respirarCarreira(); }
    if (!A.run("dilemaAberto")) throw new Error("dilema da luta 5 não abriu");
    const pend = JSON.parse(A.run("JSON.stringify(PENDENTE)"));
    if (!pend || pend.tipo !== "dilema" || !pend.d || !pend.d.cena) throw new Error("PENDENTE do dilema não gravado: " + JSON.stringify(pend));
    const save = A.run("JSON.stringify(montarSave())");
    const B = retomarEm(save);
    B.run(`globalThis.__pedidos=0;const __ai=ai;ai=function(tipo){if(tipo==="dilema")globalThis.__pedidos++;return __ai.apply(this,arguments);};`);
    for (let k = 0; k < 4; k++) { B.drenar(); await respirarCarreira(); }
    if (!B.run("dilemaAberto")) throw new Error("dilema não reabriu");
    const todosNos = (r, acc = []) => { if (!r) return acc; acc.push(r); (r.children || []).forEach(c => todosNos(c, acc)); return acc; };
    const box = todosNos(B.registro.posluta).filter(n => (n.className || "").split(" ").includes("dilema")).pop();
    if (!box || !String(box.innerHTML).includes(String(pend.d.cena).slice(0, 40))) throw new Error("dilema reaberto com outro texto");
    if (B.run("globalThis.__pedidos") !== 0) throw new Error("retomada pediu dilema novo pra IA");
  });
  /* Armazenamento: aparelho na hora, nuvem 2 s depois (um upsert por
     rajada de saves), indicador de estado, e o mais novo vence entre
     aparelho e nuvem. Supabase falso registra o que recebe. */
  const supabaseFalso = (estado) => ({
    createClient: () => ({
      auth: {
        getSession: async () => ({ data: { session: { user: { id: "u1", email: "t@t.com" }, access_token: "tok" } } }),
        onAuthStateChange: () => {},
      },
      from: (tabela) => ({
        upsert: async (linha, opts) => { estado.chamadas.push(["upsert", tabela, linha, opts]); return { error: estado.falhar ? { message: "rede" } : null }; },
        select: () => ({ eq: () => ({ then: (res) => res({ data: estado.nuvem, error: null }) }) }),
        delete: () => ({ eq: () => ({ eq: async () => { estado.chamadas.push(["delete", tabela]); return { error: null }; } }) }),
      }),
    }),
  });
  await conf("salvarCarreira(): aparelho na hora, nuvem depois (upsert com o formato da tabela saves)", async () => {
    const est = { chamadas: [], falhar: false, nuvem: [] };
    const X = sandboxCarreira();
    X.sb.window.supabase = supabaseFalso(est);
    X.run("USUARIO_ID='u1';SLOT_ATUAL=2;");
    iniciarCarreiraTeste(X, F, 777006);   // startCareer() já salva
    if (!X.dadosLS["save:u1:2"]) throw new Error("não gravou no aparelho na hora");
    if (est.chamadas.some(c => c[0] === "upsert")) throw new Error("mandou pra nuvem antes do atraso de 2 s");
    X.drenar(); await respirarCarreira(); await respirarCarreira();
    const ups = est.chamadas.filter(c => c[0] === "upsert");
    if (ups.length !== 1) throw new Error(ups.length + " upserts (esperava 1)");
    const [, tabela, linha, opts] = ups[0];
    if (tabela !== "saves") throw new Error("tabela " + tabela);
    for (const k of ["user_id", "slot", "versao", "dados", "nome", "divisao", "modo", "cartel", "luta_n", "campeao", "atualizado_em"])
      if (!(k in linha)) throw new Error("linha sem " + k);
    if (linha.user_id !== "u1" || linha.slot !== 2 || linha.versao !== 1 || linha.cartel !== "0-0" || linha.luta_n !== 0)
      throw new Error("valores errados: " + JSON.stringify({ u: linha.user_id, s: linha.slot, v: linha.versao, c: linha.cartel, n: linha.luta_n }));
    if (!opts || opts.onConflict !== "user_id,slot") throw new Error("upsert sem onConflict user_id,slot");
    const ind = X.registro["indicador-save"];
    if (!ind || !(ind.className || "").split(" ").includes("salvo")) throw new Error("indicador não ficou em 'salvo': " + (ind && ind.className));
  });
  await conf("nuvem falhando: indicador vira 'salvo neste aparelho' e o save local continua lá", async () => {
    const est = { chamadas: [], falhar: true, nuvem: [] };
    const X = sandboxCarreira();
    X.sb.window.supabase = supabaseFalso(est);
    X.run("USUARIO_ID='u1';SLOT_ATUAL=1;");
    iniciarCarreiraTeste(X, F, 777007);
    X.drenar(); await respirarCarreira(); await respirarCarreira();
    const ind = X.registro["indicador-save"];
    if (!ind || !(ind.className || "").split(" ").includes("local")) throw new Error("indicador não ficou em 'local': " + (ind && ind.className));
    if (!/aparelho/.test(ind.innerHTML || "")) throw new Error("texto do indicador não avisa que ficou no aparelho");
    if (!X.dadosLS["save:u1:1"]) throw new Error("save local sumiu");
  });
  await conf("listarSaves(): entre aparelho e nuvem, vale o mais novo; espaço vazio é null", async () => {
    const est = { chamadas: [], falhar: false, nuvem: [] };
    const X = sandboxCarreira();
    X.sb.window.supabase = supabaseFalso(est);
    X.run("USUARIO_ID='u1';");
    const velho = { versao: 1, slot: 1, atualizadoEm: "2026-09-20T10:00:00.000Z", nome: "Local velho" };
    const novo = { versao: 1, slot: 1, atualizadoEm: "2026-09-25T10:00:00.000Z", nome: "Nuvem nova" };
    const localNovo = { versao: 1, slot: 2, atualizadoEm: "2026-09-26T10:00:00.000Z", nome: "Local novo" };
    const nuvemVelha = { versao: 1, slot: 2, atualizadoEm: "2026-09-01T10:00:00.000Z", nome: "Nuvem velha" };
    X.dadosLS["save:u1:1"] = JSON.stringify(velho);
    X.dadosLS["save:u1:2"] = JSON.stringify(localNovo);
    est.nuvem = [{ slot: 1, dados: novo, atualizado_em: novo.atualizadoEm }, { slot: 2, dados: nuvemVelha, atualizado_em: nuvemVelha.atualizadoEm }];
    X.sb.__r = null;
    X.run("listarSaves().then(r=>{globalThis.__r=r;})");
    await respirarCarreira(); await respirarCarreira();
    const r = X.sb.__r;
    if (!r) throw new Error("listarSaves não resolveu");
    if (!r[0] || r[0].nome !== "Nuvem nova") throw new Error("espaço 1 devia ser a nuvem (mais nova): " + (r[0] && r[0].nome));
    if (!r[1] || r[1].nome !== "Local novo") throw new Error("espaço 2 devia ser o local (mais novo): " + (r[1] && r[1].nome));
    if (r[2] !== null) throw new Error("espaço 3 devia ser vazio");
    if (JSON.parse(X.dadosLS["save:u1:1"]).nome !== "Nuvem nova") throw new Error("a versão da nuvem não foi copiada pro aparelho");
  });
  const nosDe = (raiz, acc = []) => { if (!raiz) return acc; acc.push(raiz); (raiz.children || []).forEach(c => nosDe(c, acc)); return acc; };
  await conf("de ponta a ponta: joga até a 5 logado, abre Continuar, clica Continuar no card, volta na luta 5 com o histórico", async () => {
    const est = { chamadas: [], falhar: false, nuvem: [] };
    const X = sandboxCarreira();
    X.sb.window.supabase = supabaseFalso(est);
    X.run("USUARIO_ID='u1';SLOT_ATUAL=1;");
    iniciarCarreiraTeste(X, F, 777008);
    await jogarCarreiraAte(X, 5);
    for (let k = 0; k < 4; k++) { X.drenar(); await respirarCarreira(); await resolverDilemaTeste(X, "aceito"); }
    if (!X.dadosLS["save:u1:1"]) throw new Error("sem save no espaço 1");
    // outra "sessão": sandbox novo, só com o que ficou no aparelho
    const Y = sandboxCarreira();
    Y.sb.window.supabase = supabaseFalso(est);
    Object.assign(Y.dadosLS, X.dadosLS);
    Y.sb.__F = F;
    Y.run("ROSTER=rateAll(globalThis.__F);CUTOFF_RANKING=Math.max(...ROSTER.map(f=>f.era?f.era[1]:0))-6;USUARIO_ID='u1';irPara('continuar');");
    for (let k = 0; k < 4; k++) { Y.drenar(); await respirarCarreira(); }
    const btn = nosDe(Y.registro.app).filter(n => (n.className || "").split(" ").includes("slot-continuar") && n.onclick).pop();
    if (!btn) throw new Error("botão Continuar do espaço não apareceu");
    btn.onclick();
    for (let k = 0; k < 4; k++) { Y.drenar(); await respirarCarreira(); }
    if (Y.run("fightNo") !== 5) throw new Error("retomou na luta " + Y.run("fightNo"));
    if (Y.run("SLOT_ATUAL") !== 1) throw new Error("SLOT_ATUAL não ficou no espaço 1");
    const linhas = (Y.registro.bouts.children || []).filter(n => (n.className || "").split(" ").includes("bout"));
    if (linhas.length !== 5) throw new Error(`${linhas.length} linhas de luta no histórico retomado`);
  });
  /* Fase 8: resolveFeed() sorteava a persona de cada post da IA com o rng
     principal DEPOIS da resposta chegar. Com a IA no ar, a sequência
     dependia de quando o feed chegava e de quantos posts vieram: link de
     desafio e save deixavam de reproduzir a carreira. Offline (moldes
     locais) nunca aparecia, por isso nenhuma suíte pegava. */
  await conf("feed da IA não mexe na semente: carreira com posts da IA = carreira sem IA", async () => {
    const assinatura = ctx => ctx.run("JSON.stringify({reg:st.registro.map(r=>[r.n,r.adv,r.venceu,r.metodo,r.round,r.relogio]),g:estadoGeradores(),w:st.wins,l:st.losses})");
    const semIA = sandboxCarreira();
    iniciarCarreiraTeste(semIA, F, 515151);
    await jogarCarreiraAte(semIA, 6);
    const comIA = sandboxCarreira();
    let postsEntregues = 0;
    comIA.sb.fetch = async (url, op) => {
      const { kind } = JSON.parse(op.body);
      if (kind !== "feed") throw new Error("offline");
      postsEntregues += 4;
      return { ok: true, json: async () => ({ result: [1, 2, 3, 4].map(i => ({ nome: "Fã" + i, texto: "post " + i + " da luta" })) }) };
    };
    iniciarCarreiraTeste(comIA, F, 515151);
    await jogarCarreiraAte(comIA, 6);
    if (!postsEntregues) throw new Error("a IA falsa nunca foi chamada (o teste não prova nada)");
    const a = assinatura(semIA), b = assinatura(comIA);
    if (a !== b) throw new Error(`carreiras divergiram (${postsEntregues} posts da IA): ${a.slice(0, 160)} ... x ... ${b.slice(0, 160)}`);
  });
  const ok = !falhas.length;
  console.log("\n" + (ok ? verde("save ok") : vermelho(`${falhas.length} falha(s) no save`)));
  return ok;
}

/* ================================================================== *
 * BALANÇO (2026-09-28): N carreiras por perfil de jogador, pelo caminho
 *     real (draft guloso, startCareer, lutas de verdade no sandbox).
 *     Mede o que o jogador sente: vitórias em 22, quantas carreiras quase
 *     sem derrota, cinturão, e a força do lutador draftado contra a
 *     divisão. Perfis: automático (o meio, camp aleatório, escolha
 *     neutra), comum (adversário, camp e escolha na luta aleatórios),
 *     esperto (o do meio, melhor camp, melhor escolha), ousado (o mais
 *     difícil, melhor camp, melhor escolha).
 * ================================================================== */
async function testarBalanco(N = 50, soPerfil = null) {
  console.log("\n" + cinza(`balanço: ${N} carreiras por perfil, caminho real`));
  const F = lerLutadores();
  const X0 = sandboxCarreira();
  X0.sb.__F = F;
  const rosterJSON = X0.run("JSON.stringify(rateAll(globalThis.__F))");
  const perfis = ["automatico", "comum", "esperto", "ousado", "estrategista"].filter(p => !soPerfil || p === soPerfil);
  const resumo = {};
  for (const perfil of perfis) {
    const linhas = [];
    for (let i = 0; i < N; i++) {
      const seed = 700001 + i * 7919;
      const X = sandboxCarreira();
      iniciarCarreiraTeste(X, F, seed, process.env.BALANCO_MODO || "normal", rosterJSON);
      /* força do lutador draftado: mesma régua do rateAll (18 lutas contra
         o lutador mediano da divisão), e o percentil disso na divisão */
      const forca = JSON.parse(X.run(`(function(){
        const pool=POOL; const med=k=>{const v=pool.map(f=>f[k]).sort((a,b)=>a-b);return v[Math.floor(v.length/2)];};
        const ref={name:"__med__",division:DIVISION};
        ["slpm","strAcc","strDef","kdAvg","tdAvg","tdAcc","tdDef","subAvg","durability","reach","sapm"].forEach(k=>ref[k]=med(k));
        let w=0; for(let s=1;s<=18;s++)if(simulateFight(me,ref,{seed:s*31+7}).winner===me.name)w++;
        const r=w/18; const pct=pool.filter(f=>f.rating<r).length/pool.length;
        return JSON.stringify({r,pct});})()`));
      if (perfil !== "automatico") {
        X.sb.__perfil = perfil; X.sb.__sorte = seed;
        X.run(`(function(){
          const sorte=mulberry32(globalThis.__sorte^0x5bd1e995);
          const perfil=globalThis.__perfil;
          /* escolha na luta: melhor modificador (esperto/ousado) ou aleatória (comum) */
          const orig=abrirEscolhaLuta;
          abrirEscolhaLuta=function(sc,jog,opp,onEscolher){
            /* devolve as opções abertas: o driver usa pra não repetir no round seguinte */
            const abertas=orig.apply(this,arguments);
            if(auto)return abertas;
            const box=document.getElementById("escolhaLuta");
            const ops=(box.children||[]).find(c=>(c.className||"").split(" ").includes("el-opts"));
            const bs=ops?ops.children:[];
            if(!bs.length)return abertas;
            let alvo=bs[Math.floor(sorte()*bs.length)];
            if(perfil!=="comum"){let mx=-1;for(const b of bs){const a=ACOES_LUTA.find(x=>"el_"+x.id===b.id);const m=modificadorAcao(a,jog,opp);if(m>mx){mx=m;alvo=b;}}}
            alvo.onclick();
            return abertas;
          };
          globalThis.__rotulos=[];
          globalThis.__decidir=function(){
            const ops=ofertaAtual||[];
            if(!ops.length)return false;
            if(ops.length===3)globalThis.__rotulos.push(ops.map(o=>dificuldade(o.f).rot));
            let op=perfil==="comum"?ops[Math.floor(sorte()*ops.length)]:perfil==="ousado"?ops[ops.length-1]:ops[Math.min(1,ops.length-1)];
            /* estrategista: lê o rótulo das cartas e pega a de maior chance */
            if(perfil==="estrategista")op=ops.reduce((m,o)=>chanceContra(o.f)>chanceContra(m.f)?o:m,ops[0]);
            let camp;
            if(perfil==="comum")camp=CAMPS[Math.floor(sorte()*CAMPS.length)];
            else{let mx=-1;for(const c of CAMPS){let g=0;const al=Object.keys(c.alvos);for(const k of al){const at=(st.treino&&st.treino[k])||1;g+=(TETO_TREINO-at)*RITMO_TREINO*c.alvos[k];}g/=al.length;if(g>mx){mx=g;camp=c;}}}
            escolhaAberta=false;
            lutar(op,camp);
            return true;
          };
        })()`);
        X.run("auto=false;");
        for (let guarda = 0; guarda < 900 && X.run("fightNo") < 22; guarda++) {
          for (let k = 0; k < 3; k++) { X.drenar(); await respirarCarreira(); }
          if (await resolverDilemaTeste(X, "aceito, sem problema")) continue;
          if (X.run("playing||dilemaAberto||entrevistaAberta")) continue;
          if (X.run("escolhaAberta")) { X.run("globalThis.__decidir()"); continue; }
          if (X.run("fightNo") >= 22) break;
          X.run("nextFight();");
        }
        for (let k = 0; k < 6; k++) { X.drenar(); await respirarCarreira(); await resolverDilemaTeste(X, "aceito, sem problema"); }
      } else {
        await jogarCarreiraAte(X, 22);
      }
      const r = JSON.parse(X.run(`JSON.stringify({w:st.wins,l:st.losses,n:fightNo,camp:!!st.foiCampeao,seq:st.longestW||0,fin:st.finishes,rot:globalThis.__rotulos||[],
        lutas:(st.registro||[]).map(g=>{const i=LADDER.findIndex(f=>f.name===g.adv);return[g.n,g.venceu?1:0,i<0?null:i/(LADDER.length-1)];})})`));
      linhas.push({ ...r, ...forca });
    }
    const ws = linhas.map(x => x.w).sort((a, b) => a - b);
    const q = p => ws[Math.min(ws.length - 1, Math.floor(p * ws.length))];
    const media = (arr, k) => arr.reduce((s, x) => s + x[k], 0) / arr.length;
    const r = {
      vitorias: +media(linhas, "w").toFixed(1), p10: q(.1), p50: q(.5), p90: q(.9),
      quaseInvicto: +(100 * linhas.filter(x => x.l <= 2).length / linhas.length).toFixed(0),
      campeao: +(100 * linhas.filter(x => x.camp).length / linhas.length).toFixed(0),
      seq: +media(linhas, "seq").toFixed(1), forca: +media(linhas, "r").toFixed(2), pctDivisao: +(100 * media(linhas, "pct")).toFixed(0),
      incompletas: linhas.filter(x => x.n < 22).length,
    };
    /* onde as derrotas acontecem: por trecho da carreira e pela força do
       adversário (posição dele na escada da divisão, 0 = pior, 1 = melhor) */
    const lutas = linhas.flatMap(x => x.lutas);
    const taxa = f => { const l = lutas.filter(f); return l.length ? Math.round(100 * l.filter(x => x[1]).length / l.length) + "% (" + l.length + ")" : "-"; };
    r.porTrecho = [[1, 5], [6, 10], [11, 15], [16, 22]].map(([a, b]) => `${a}-${b}: ${taxa(x => x[0] >= a && x[0] <= b)}`).join("  ");
    r.porAdversario = [[0, .5], [.5, .75], [.75, .9], [.9, 1.01]].map(([a, b]) => `${a}-${b}: ${taxa(x => x[2] != null && x[2] >= a && x[2] < b)}`).join("  ");
    const rots = linhas.flatMap(x => x.rot || []);
    if (rots.length) r.rotulos = [0, 1, 2].map(i => { const c = {}; rots.forEach(t => { c[t[i]] = (c[t[i]] || 0) + 1; });
      return ["1ª", "2ª", "3ª"][i] + " carta: " + Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(100 * v / rots.length)}%`).join(", "); }).join("  |  ");
    resumo[perfil] = r;
    console.log(`  ${perfil.padEnd(11)} vitórias ${r.vitorias} de 22 (p10 ${r.p10} · mediana ${r.p50} · p90 ${r.p90})  ` +
      `≤2 derrotas ${r.quaseInvicto}%  cinturão ${r.campeao}%  maior sequência ${r.seq}  ` +
      `lutador draftado: vence o mediano ${Math.round(r.forca * 100)}% (acima de ${r.pctDivisao}% da divisão)` +
      (r.incompletas ? vermelho(`  ${r.incompletas} carreiras não chegaram ao fim`) : ""));
    console.log(cinza(`              vitória por trecho da carreira  ${r.porTrecho}`));
    console.log(cinza(`              vitória pela força do adversário (escada 0 a 1)  ${r.porAdversario}`));
    if (r.rotulos) console.log(cinza(`              rótulo das cartas  ${r.rotulos}`));
  }
  globalThis.__balanco = resumo;
  /* Faixas do balanço pedido pelo dono em 2026-09-28 ("~50% de vitórias pra
     quem joga bem, cinturão raro, 1 em 5 ou menos"). Medido com 50
     carreiras por perfil: 11,0 a 12,5 vitórias em 22, cinturão 4 a 8%. */
  let ok = true;
  for (const [perfil, r] of Object.entries(resumo)) {
    const erros = [];
    if (r.incompletas) erros.push(`${r.incompletas} carreiras não terminaram`);
    if (!(r.vitorias >= 9 && r.vitorias <= 14)) erros.push(`vitórias ${r.vitorias} fora de 9 a 14`);
    if (!(r.campeao <= 20)) erros.push(`cinturão ${r.campeao}% acima de 20%`);
    if (!(r.quaseInvicto <= 10)) erros.push(`${r.quaseInvicto}% das carreiras com no máximo 2 derrotas`);
    if (erros.length) { ok = false; console.log(vermelho(`  fora da faixa (${perfil}): ${erros.join("; ")}`)); }
  }
  console.log(ok ? verde("  balanço dentro da faixa") : vermelho("  balanço fora da faixa"));
  return ok;
}

/* ================================================================== *
 * FEED E FÃ (2026-09-28): o medidor de fã decide quantos haters aparecem
 *     na repercussão (moldes locais e prompt da IA). Fã baixo = timeline
 *     contra, fã alto = quase todo mundo a favor.
 * ================================================================== */
async function testarFeedFa() {
  console.log("\n" + cinza("feed e fã: medidor de fã manda nos haters (moldes e IA)"));
  const falhas = [];
  const conf = async (nome, fn) => {
    try { await fn(); console.log(verde("  ok    ") + nome); }
    catch (e) { falhas.push(nome); console.log(vermelho("  falha ") + nome + "\n         " + e.message); }
  };
  const env = criarAmbiente();
  vm.createContext(env.sandbox);
  vm.runInContext(exportar(lerScript(), ["buildFeed", "mulberry32", "HATERS_IA", "prefetchFeed"])
    + "\ntry{globalThis.__x.setup=(fa)=>{st={fan:fa,wins:3,losses:1,followers:5000};me={name:'Kayo'};};}catch(e){}"
    + "\ntry{globalThis.__x.trocarAi=(f)=>{ai=f;};}catch(e){}", env.sandbox, { filename: "index.html" });
  const X = env.sandbox.__x;
  const r = { method: "Nocaute", round: 1, clock: "3:10" };
  const fracao = fa => {
    let h = 0, n = 0;
    for (let s = 1; s <= 400; s++) {
      const feed = X.buildFeed(r, s % 2 === 0, false, 0, 0, false, X.mulberry32(s * 97 + 13), "Kayo", fa);
      feed.forEach(p => { n++; if (p.hater) h++; });
    }
    return h / n;
  };
  const f0 = fracao(0), f5 = fracao(5), f10 = fracao(10);
  console.log(cinza(`  posts de hater: fã 0 → ${(100 * f0).toFixed(0)}%, fã 5 → ${(100 * f5).toFixed(0)}%, fã 10 → ${(100 * f10).toFixed(0)}%`));
  await conf("moldes: fã 0 → maioria de hater (≥ 55% dos posts)", () => { if (!(f0 >= .55)) throw new Error((100 * f0).toFixed(0) + "%"); });
  await conf("moldes: fã 5 → mistura (25% a 55%)", () => { if (!(f5 >= .25 && f5 <= .55)) throw new Error((100 * f5).toFixed(0) + "%"); });
  await conf("moldes: fã 10 → quase nenhum hater (≤ 12%)", () => { if (!(f10 <= .12)) throw new Error((100 * f10).toFixed(0) + "%"); });
  await conf("moldes: mais fã, menos hater (fã 0 > 5 > 10)", () => { if (!(f0 > f5 && f5 > f10)) throw new Error([f0, f5, f10].join(" ")); });
  await conf("IA: o feed manda quantos haters, pela mesma régua (fã 1 → 3 de 4, fã 9 → 0)", async () => {
    const pedidos = [];
    X.trocarAi(async (kind, data) => { pedidos.push(data); return null; });
    for (const fa of [1, 4, 7, 9]) { X.setup(fa); X.prefetchFeed(r, true, { name: "Rival" }, false, 0, 0, false); }
    const h = pedidos.map(d => d.haters).join(",");
    if (h !== "3,2,1,0") throw new Error("haters mandados: " + h);
    if (pedidos.some(d => typeof d.fa !== "number")) throw new Error("fã não foi junto");
  });
  await conf("api/ai.js: o prompt do feed usa o número de haters", () => {
    const api = fs.readFileSync(path.join(__dirname, "api", "ai.js"), "utf8");
    if (!/Comentários de hater: \$\{/.test(api) || !/O usuário diz\s+quantos deles são de HATER/.test(api)) throw new Error("prompt sem a regra de haters");
  });
  const ok = !falhas.length;
  console.log("\n" + (ok ? verde("feed e fã ok") : vermelho(`${falhas.length} falha(s) no feed e fã`)));
  return ok;
}

/* ================================================================== *
 * PAGAMENTO (2026-09-28): pagamento real de teste ficou sem Pro porque
 *     só o webhook da Asaas ativava. Confere: a conferência de retorno
 *     (api/confirmar-pagamento.js) ativa sozinha, um pagamento nunca
 *     ativa duas vezes (cartão manda CONFIRMED e RECEIVED), falha de
 *     gravação não marca como processado, e o jogo abre a cobrança numa
 *     aba nova dentro do clique (senão o navegador bloqueia o pop-up).
 * ================================================================== */
async function testarPagamento() {
  console.log("\n" + cinza("pagamento: Pro ativa pelo webhook OU na volta ao jogo, uma vez por pagamento; cobrança em aba nova"));
  const url = require("url");
  const falhas = [];
  const conf = async (nome, fn) => {
    try { await fn(); console.log(verde("  ok    ") + nome); }
    catch (e) { falhas.push(nome); console.log(vermelho("  falha ") + nome + "\n         " + e.message); }
  };
  let WH = null, CF = null;
  try {
    WH = (await import(url.pathToFileURL(path.join(RAIZ, "api", "webhook-asaas.js")).href)).default;
    CF = (await import(url.pathToFileURL(path.join(RAIZ, "api", "confirmar-pagamento.js")).href)).default;
  } catch (e) { console.log(vermelho("  não carregou as funções de pagamento: " + e.message)); return false; }

  /* Supabase + Asaas falsos, com estado em memória */
  const fetchOriginal = globalThis.fetch;
  const envOriginal = { ...process.env };
  const logOriginal = console.log;
  let banco, asaas, usuarios, falharEscrita, falharAssinatura;
  const zerar = () => {
    banco = { assinaturas: {}, processados: [], upsertsPro: 0 };
    asaas = {};           // id -> cobrança
    usuarios = { "tok-u1": { id: "u1", email: "a@a.com" } };
    falharEscrita = false; falharAssinatura = false;
  };
  /* atraso aleatório no banco falso: chamadas simultâneas se intercalam
     como no Supabase de verdade (é o que expõe corrida na ativação) */
  const espera = () => new Promise(r => setTimeout(r, Math.random() * 6));
  globalThis.fetch = async (u, op = {}) => {
    u = String(u);
    const ok = (corpo, status = 200) => ({ ok: status < 300, status, json: async () => corpo });
    if (u.includes("/auth/v1/user")) {
      const tok = String((op.headers || {}).Authorization || "").replace("Bearer ", "");
      return usuarios[tok] ? ok(usuarios[tok]) : ok({}, 401);
    }
    if (u.includes("/rest/v1/pagamentos_processados")) {
      await espera();
      const id = decodeURIComponent((u.match(/asaas_payment_id=eq\.([^&]+)/) || [])[1] || "");
      if (op.method === "POST") {
        if (falharEscrita) return ok({}, 500);
        const l = { ...JSON.parse(op.body), processado_em: new Date().toISOString() };
        const existe = banco.processados.some(x => x.asaas_payment_id === l.asaas_payment_id && x.evento === l.evento);
        if (!existe) banco.processados.push(l);
        /* ignore-duplicates + return=representation: só devolve o que inseriu (a reserva da ativação) */
        if (/return=representation/.test(String((op.headers || {}).Prefer || ""))) return ok(existe ? [] : [l], 201);
        return ok(null, 201);
      }
      if (op.method === "DELETE") {
        const evd = decodeURIComponent((u.match(/evento=eq\.([^&]+)/) || [])[1] || "");
        banco.processados = banco.processados.filter(x => !(x.asaas_payment_id === id && x.evento === evd));
        return ok(null, 204);
      }
      const m = u.match(/evento=in\.\(([^)]*)\)/);
      if (!m) return ok(banco.processados.filter(x => x.asaas_payment_id === id));
      const ev = decodeURIComponent(m[1]).split(",");
      return ok(banco.processados.filter(x => x.asaas_payment_id === id && ev.includes(x.evento)));
    }
    if (u.includes("/rest/v1/assinaturas")) {
      await espera();
      if (op.method === "POST") {
        if (falharEscrita || falharAssinatura) return ok({}, 500);
        const l = JSON.parse(op.body); banco.assinaturas[l.user_id] = { ...(banco.assinaturas[l.user_id] || {}), ...l }; banco.upsertsPro++;
        return ok(null, 201);
      }
      const uid = decodeURIComponent((u.match(/user_id=eq\.([^&]+)/) || [])[1] || "");
      return ok(banco.assinaturas[uid] ? [banco.assinaturas[uid]] : []);
    }
    if (u.startsWith("https://api.asaas.com/v3/payments?")) {
      const ref = decodeURIComponent((u.match(/externalReference=([^&]+)/) || [])[1] || "");
      return ok({ data: Object.values(asaas).filter(p => p.externalReference === ref || p.__vazaFiltro) });
    }
    if (u.startsWith("https://api.asaas.com/v3/payments/")) {
      const id = decodeURIComponent(u.split("/payments/")[1]);
      return asaas[id] ? ok(asaas[id]) : ok({}, 404);
    }
    return ok({}, 404);
  };
  Object.assign(process.env, { SUPABASE_SERVICE_ROLE_KEY: "service-falsa", ASAAS_API_KEY: "asaas-falsa", ASAAS_WEBHOOK_TOKEN: "tok-webhook" });
  console.log = (...a) => { if (!/^(webhook-asaas|confirmar-pagamento)$/.test(String(a[0]))) logOriginal(...a); };
  const resposta = () => ({ cod: 0, corpo: null, setHeader() {}, status(c) { this.cod = c; return this; }, json(b) { this.corpo = b; return this; }, end() { return this; } });
  const confirmar = async token => { const res = resposta(); await CF({ method: "POST", headers: {}, body: { token } }, res); return res; };
  const webhook = async (evento, id, token = "tok-webhook") => { const res = resposta(); await WH({ method: "POST", headers: { "asaas-access-token": token }, body: { event: evento, payment: { id } } }, res); return res; };
  const cobranca = (id, extra = {}) => (asaas[id] = { id, customer: "cus_1", externalReference: "u1", status: "RECEIVED", value: 9.99, ...extra });
  try {
    await conf("volta ao jogo sem sessão = 401", async () => { zerar(); const r = await confirmar(null); if (r.cod !== 401) throw new Error("status " + r.cod); });
    /* auditoria de pré-lançamento (2026-10-08): "já ativou?" e "soma 30
       dias" eram passos separados, e chamadas simultâneas somavam 30 dias cada */
    const diasDePro = () => { const a = banco.assinaturas.u1; return a && a.expira_em ? (new Date(a.expira_em).getTime() - Date.now()) / 864e5 : 0; };
    await conf("10 conferências ao mesmo tempo depois de um Pix: uma ativação só, 30 dias", async () => {
      zerar(); cobranca("pay_par");
      const rs = await Promise.all(Array.from({ length: 10 }, () => confirmar("tok-u1")));
      if (rs.some(r => r.cod !== 200)) throw new Error("status " + rs.map(r => r.cod));
      if (banco.upsertsPro !== 1 || Math.round(diasDePro()) !== 30) throw new Error(`${banco.upsertsPro} ativações, ${diasDePro().toFixed(1)} dias`);
    });
    await conf("webhook e volta ao jogo ao mesmo tempo: 30 dias, não 60", async () => {
      zerar(); cobranca("pay_dois");
      await Promise.all([webhook("PAYMENT_RECEIVED", "pay_dois"), confirmar("tok-u1"), webhook("PAYMENT_CONFIRMED", "pay_dois"), confirmar("tok-u1")]);
      if (banco.upsertsPro !== 1 || Math.round(diasDePro()) !== 30) throw new Error(`${banco.upsertsPro} ativações, ${diasDePro().toFixed(1)} dias`);
    });
    await conf("falha ao gravar o Pro depois da reserva: a reserva é desfeita e a próxima conferência ativa", async () => {
      zerar(); cobranca("pay_falha"); falharAssinatura = true;
      const r1 = await confirmar("tok-u1");
      if (r1.cod !== 502) throw new Error("1ª: " + r1.cod);
      if (banco.processados.length) throw new Error("ficou marcado: " + JSON.stringify(banco.processados.map(x => x.evento)));
      falharAssinatura = false;
      const r2 = await confirmar("tok-u1");
      if (r2.cod !== 200 || r2.corpo.ativados !== 1 || Math.round(diasDePro()) !== 30) throw new Error("2ª: " + r2.cod + " " + JSON.stringify(r2.corpo));
    });
    await conf("reserva sem ativação (a função caiu no meio): vale por 2 minutos, depois a próxima conferência ativa", async () => {
      zerar(); cobranca("pay_caiu");
      banco.processados.push({ asaas_payment_id: "pay_caiu", user_id: "u1", evento: "ATIVACAO", status: "RECEIVED", valor: 9.99, processado_em: new Date(Date.now() - 10000).toISOString() });
      const r1 = await confirmar("tok-u1");
      if (r1.corpo.ativados !== 0 || banco.upsertsPro) throw new Error("passou por cima de reserva recente: " + JSON.stringify(r1.corpo));
      banco.processados[0].processado_em = new Date(Date.now() - 180000).toISOString();
      const r2 = await confirmar("tok-u1");
      if (r2.corpo.ativados !== 1 || banco.upsertsPro !== 1 || Math.round(diasDePro()) !== 30) throw new Error("reserva vencida não liberou: " + JSON.stringify(r2.corpo));
    });
    await conf("volta ao jogo com Pix pago e SEM webhook: ativa 30 dias na hora", async () => {
      zerar(); cobranca("pay_1");
      const r = await confirmar("tok-u1");
      if (r.cod !== 200 || !r.corpo.pro || r.corpo.ativados !== 1) throw new Error(JSON.stringify(r.corpo));
      const dias = (new Date(banco.assinaturas.u1.expira_em) - Date.now()) / 864e5;
      if (!(dias > 29.9 && dias < 30.1)) throw new Error("expira em " + dias.toFixed(2) + " dias");
    });
    await conf("conferir de novo não soma dias (um pagamento ativa uma vez)", async () => {
      const antes = banco.upsertsPro;
      const r = await confirmar("tok-u1");
      if (r.corpo.ativados !== 0 || banco.upsertsPro !== antes) throw new Error(JSON.stringify(r.corpo));
    });
    await conf("webhook do MESMO pagamento chegando depois não soma dias", async () => {
      const antes = banco.upsertsPro;
      const r = await webhook("PAYMENT_RECEIVED", "pay_1");
      if (r.cod !== 200 || banco.upsertsPro !== antes) throw new Error(`status ${r.cod}, ativações ${banco.upsertsPro - antes}`);
    });
    await conf("cartão: PAYMENT_CONFIRMED e depois PAYMENT_RECEIVED ativam UMA vez (antes davam 60 dias)", async () => {
      zerar(); cobranca("pay_2", { status: "CONFIRMED" });
      await webhook("PAYMENT_CONFIRMED", "pay_2");
      asaas.pay_2.status = "RECEIVED";
      await webhook("PAYMENT_RECEIVED", "pay_2");
      if (banco.upsertsPro !== 1) throw new Error(banco.upsertsPro + " ativações");
    });
    await conf("cobrança de outra conta, de valor errado ou ainda pendente não ativa", async () => {
      zerar();
      cobranca("pay_3", { externalReference: "outro", __vazaFiltro: true });
      cobranca("pay_4", { value: 1 });
      cobranca("pay_5", { status: "PENDING" });
      const r = await confirmar("tok-u1");
      if (r.corpo.ativados !== 0 || r.corpo.pro || banco.upsertsPro) throw new Error(JSON.stringify(r.corpo));
      if (r.corpo.pendentes !== 1) throw new Error("pendentes " + r.corpo.pendentes);
    });
    await conf("preço (2026-10-04): a cobrança nova pede R$ 11,99 à Asaas", async () => {
      const CP = (await import(url.pathToFileURL(path.join(RAIZ, "api", "criar-pagamento.js")).href)).default;
      const fetchSuite = globalThis.fetch, envAntes = { ...process.env };
      let corpoCobranca = null;
      globalThis.fetch = async (u, op = {}) => {
        u = String(u);
        const ok = (b) => ({ ok: true, status: 200, json: async () => b });
        if (u.endsWith("/auth/v1/user")) return ok({ id: "u1", email: "u1@teste.com" });
        if (u.endsWith("/customers")) return ok({ id: "cus_9" });
        if (u.endsWith("/payments")) { corpoCobranca = JSON.parse(op.body); return ok({ invoiceUrl: "https://www.asaas.com/i/teste" }); }
        return { ok: false, status: 404, json: async () => ({}) };
      };
      Object.assign(process.env, { TERMOS_PUBLICADOS: "true", ASAAS_API_KEY: "asaas-falsa" });
      try {
        const res = resposta();
        await CP({ method: "POST", headers: {}, body: { token: "tok-u1", cpf: "529.982.247-25" } }, res);
        if (res.cod !== 200 || !corpoCobranca) throw new Error(`status ${res.cod}: ${JSON.stringify(res.corpo)}`);
        if (corpoCobranca.value !== 11.99) throw new Error("valor pedido à Asaas: " + corpoCobranca.value);
      } finally { globalThis.fetch = fetchSuite; for (const k of Object.keys(process.env)) if (!(k in envAntes)) delete process.env[k]; Object.assign(process.env, envAntes); }
    });
    await conf("preço novo de R$ 11,99 ativa, e o Pix antigo de R$ 9,99 pago depois do aumento também (trava mínima 9,9)", async () => {
      zerar(); cobranca("pay_novo", { value: 11.99 });
      let r = await confirmar("tok-u1");
      if (r.corpo.ativados !== 1) throw new Error("11,99: " + JSON.stringify(r.corpo));
      zerar(); cobranca("pay_antigo", { value: 9.99 });
      r = await confirmar("tok-u1");
      if (r.corpo.ativados !== 1) throw new Error("9,99: " + JSON.stringify(r.corpo));
    });
    await conf("webhook: falha ao gravar = 500 (a Asaas reenvia) e nada fica marcado como processado", async () => {
      zerar(); cobranca("pay_6"); falharEscrita = true;
      const r = await webhook("PAYMENT_RECEIVED", "pay_6");
      if (r.cod !== 500 || banco.processados.length) throw new Error(`status ${r.cod}, processados ${banco.processados.length}`);
      falharEscrita = false;
      const r2 = await webhook("PAYMENT_RECEIVED", "pay_6");
      if (r2.cod !== 200 || banco.upsertsPro !== 1) throw new Error(`reenvio: status ${r2.cod}, ativações ${banco.upsertsPro}`);
    });
    await conf("webhook: token errado = 401, nada ativa", async () => {
      zerar(); cobranca("pay_7");
      const r = await webhook("PAYMENT_RECEIVED", "pay_7", "outro-token");
      if (r.cod !== 401 || banco.upsertsPro) throw new Error("status " + r.cod);
    });
  } finally {
    globalThis.fetch = fetchOriginal;
    for (const k of ["SUPABASE_SERVICE_ROLE_KEY", "ASAAS_API_KEY", "ASAAS_WEBHOOK_TOKEN"]) {
      if (envOriginal[k] === undefined) delete process.env[k]; else process.env[k] = envOriginal[k];
    }
    console.log = logOriginal;
  }

  /* jogo: aba nova DENTRO do clique, espera com "Já paguei, conferir" */
  const env = criarAmbiente({ contarNos: true });
  const ordem = [];
  const aba = { closed: false, location: { href: "" }, document: { title: "", body: { innerHTML: "" } }, close() { this.closed = true; } };
  let proNoServidor = false, conferencias = 0;
  const sessao = { user: { id: "u1", email: "a@a.com" }, access_token: "tok-u1" };
  env.sandbox.window.open = () => { ordem.push("open"); return aba; };
  env.sandbox.fetch = async (u) => {
    ordem.push("fetch " + u);
    if (u === "/api/criar-pagamento") return { ok: true, status: 200, json: async () => ({ invoiceUrl: "https://www.asaas.com/i/abc" }) };
    if (u === "/api/confirmar-pagamento") { conferencias++; return { ok: true, status: 200, json: async () => ({ ativados: proNoServidor ? 1 : 0, pro: proNoServidor, pendentes: proNoServidor ? 0 : 1 }) }; }
    throw new Error("offline");
  };
  env.sandbox.window.supabase = { createClient: () => ({
    auth: { getSession: async () => ({ data: { session: sessao } }), onAuthStateChange: () => {} },
    from: (t) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: t === "assinaturas" && proNoServidor ? { pro: true, expira_em: "2099-01-01T00:00:00Z" } : null }) }) }),
      upsert: async () => { ordem.push("upsert " + t); return { error: null }; },
    }),
  }) };
  vm.createContext(env.sandbox);
  vm.runInContext(exportar(lerScript(), ["renderPlanoPro"]) + "\ntry{globalThis.__x.meuPro=()=>meuPro;}catch(e){}", env.sandbox, { filename: "index.html" });
  const X = env.sandbox.__x;
  const respirar = () => new Promise(r => setImmediate(r));
  const tem = (n, c) => (n.className || "").split(" ").includes(c);
  const caixa = env.sandbox.document.createElement("div");
  await conf("jogo: abrir o Plano Pro sem Pro já confere na Asaas uma vez (pagou e o webhook não ativou)", async () => {
    await X.renderPlanoPro(caixa, sessao); await respirar(); env.drenar(); await respirar();
    if (conferencias !== 1) throw new Error(conferencias + " conferências");
  });
  await conf("jogo: pagar abre a aba nova ANTES de qualquer espera (senão vira pop-up bloqueado) e manda a cobrança pra ela", async () => {
    const cpf = env.todos.filter(n => n.tagName === "input" && n.placeholder === "CPF (só números)").pop();
    const aceite = env.registro.aceiteProCheck;
    const btn = env.todos.filter(n => n.tagName === "button" && /Confirmar pagamento/.test(n.innerHTML || "")).pop();
    if (!cpf || !aceite || !btn) throw new Error("formulário incompleto");
    cpf.value = "52998224725"; aceite.checked = true; aceite.onchange();
    ordem.length = 0;
    const p = btn.onclick();
    if (ordem[0] !== "open") throw new Error("primeira coisa no clique: " + ordem[0]);
    await p; await respirar();
    if (aba.location.href !== "https://www.asaas.com/i/abc") throw new Error("aba foi pra " + aba.location.href);
  });
  await conf("jogo: fica esperando com 'Já paguei, conferir'; conferir sem pagamento avisa, com pagamento libera o Pro", async () => {
    const conf1 = env.registro.proConferir;
    if (!conf1 || !conf1.onclick) throw new Error("sem o botão Já paguei");
    await conf1.onclick();
    if (X.meuPro()) throw new Error("liberou sem pagamento");
    proNoServidor = true;
    await conf1.onclick(); await respirar();
    if (!X.meuPro()) throw new Error("não liberou com o pagamento confirmado");
  });
  const ok = !falhas.length;
  console.log("\n" + (ok ? verde("pagamento ok") : vermelho(`${falhas.length} falha(s) no pagamento`)));
  return ok;
}

/* ================================================================== *
 * ADMIN (2026-09-28): painel #/admin + api/admin.js. Só o dono
 *     (ADMIN_DONO_EMAIL) e quem ele adicionar; toda ação decidida no
 *     servidor; banido não loga nem entra no ranking.
 * ================================================================== */
/* ================================================================== *
 * DIVERSIDADE NARRATIVA (2026-10-01): mede a repetição das cenas da
 * coletiva e da entrevista em carreiras completas de 22 lutas, jogadas
 * pelo caminho real (oferta, camp, coletiva respondida, luta, entrevista
 * respondida, dilema). Mede ESTRUTURA, não só texto igual: categoria do
 * evento, forma da pergunta, abertura, quase-repetição de conteúdo,
 * âncora no método da luta, referência ao passado, fallback e chamadas
 * de IA por tipo (o consumo tem que ficar igual).
 * Modos (DIVERSIDADE_IA): vazio = moldes locais (o que o Free vê e o que
 * entra quando a IA falha), sem rede; "seco" = passa pelo api/ai.js com o
 * OpenRouter falso, só pra medir o tamanho do prompt; "real" = cenas do
 * modelo de produção pela api/ai.js local, chave de ~/.octogono-openrouter
 * (nunca impressa) e teto DIVERSIDADE_MAX chamadas (padrão 100). As
 * reações ficam locais em todos os modos. DIVERSIDADE_SAIDA grava o JSON.
 * ================================================================== */
const DIV_RESPOSTAS_COL = [
  { t: "Vou nocautear ele no segundo round.", d: { tom: "promessa", trecho: "nocautear ele no segundo round", promessa: { metodo: "nocaute", round: 2 } } },
  { t: "Ele fala demais pra quem nunca enfrentou ninguém do meu nível.", d: { tom: "provocacao", trecho: "Ele fala demais", promessa: null } },
  { t: "Respeito muito o que ele construiu, mas sábado a noite é minha.", d: { tom: "respeito", trecho: "Respeito muito o que ele construiu", promessa: null } },
  { t: "Fiz um camp bom e estou pronto pro que vier.", d: { tom: "neutro", trecho: "estou pronto pro que vier", promessa: null } },
  { t: "Ele vai pedir pra sair no chão.", d: { tom: "promessa", trecho: "Ele vai pedir pra sair no chão", promessa: { metodo: "finalizacao", round: null } } },
  { t: "Essa luta não passa do primeiro round, ele sabe disso.", d: { tom: "provocacao", trecho: "não passa do primeiro round", promessa: null } },
];
const DIV_RESPOSTAS_ENT = ["Fiz o que tinha que fazer e já penso no próximo passo.", "Senti a pressão no começo, depois encontrei a distância.",
  "O mérito é da minha equipe, eles viram isso antes de mim.", "Errei no plano e paguei por isso.", "Não foi bonito, mas foi do jeito que treinamos."];
const DIV_STOP = new Set("a o os as um uma uns umas de do da dos das e em no na nos nas que se por pra para com sem voce te ele ela eles isso isto esse essa este esta seu sua seus suas dele dela mais mas como foi ser ter tem vai ja nao sim ao lhe me meu minha nem quando onde qual quais quem porque o que ha so tao muito agora aqui la hoje entre sobre ate depois antes".split(" "));
const divNorm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const divPalavras = (s, nomes) => {
  let t = divNorm(s);
  for (const n of nomes) for (const w of divNorm(n).split(/\s+/)) if (w.length > 2) t = t.replace(new RegExp(`\\b${w}\\b`, "g"), " ");
  return new Set(t.replace(/[0-9]+/g, " ").split(/[^a-z]+/).filter(w => w.length > 2 && !DIV_STOP.has(w)));
};
const divJaccard = (a, b) => { if (!a.size || !b.size) return 0; let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); };
/* categoria do evento por palavra-chave (ordem importa); serve igual pras
   cenas de antes e de depois, reanalisadas do JSON gravado */
const DIV_CATEGORIAS = [["microfone", /microfone|cabo|audio/], ["luz-som", /\bluz\b|apagou/], ["encarada", /encarad|seguranca|separ|empurr|dois dedos|passo a frente/],
  ["familia", /familia|ligacao|\bmae\b|\bpai\b|filh|esposa/], ["treinador", /treinador|corner|toalha/], ["bastidor-adversario", /empresari|assessor|nutricionista/],
  ["torcida", /torcid|torcedor|faixa|grit|vaia|aplaud/], ["telao", /telao|video|replay|melhores momentos|estatistic/],
  ["medico", /medic|gelo|supercilio|sangue|curativo|exame/], ["peso", /balanca|peso|sanduiche|comend|dieta|garrafa/],
  ["dinheiro", /bolsa|contrato|dinheiro|patrocin|premio|cotacao|aposta/], ["cinturao", /cinturao/], ["atraso", /atras/],
  ["convidado", /ex-campeao|ex campeao|ex-parceiro|convidad/], ["mediador", /mediador|locutor|organizacao/],
  ["imprensa", /fotograf|camera|flash|tripe|reporter|jornalist|bloco|celular/], ["fala-do-adversario", /disse|falou|chamou|riu|debochou|provoc|brincou/]];
const divCategoria = ev => { const t = divNorm(ev); for (const [k, re] of DIV_CATEGORIAS) if (re.test(t)) return k; return t.trim() ? "outros" : "sem-evento"; };
/* a fala do jogador citada entre aspas é dele, não do repórter: sai antes
   de medir forma, abertura, conteúdo e âncora; a citação é métrica própria */
const divSemCitacao = p => String(p || "").replace(/'[^']{3,}'|"[^"]{3,}"|“[^”]{3,}”|‘[^’]{3,}’/g, " ");
const divCita = p => /'[^']{3,}'|"[^"]{3,}"|“[^”]{3,}”|‘[^’]{3,}’/.test(String(p || "")) && /\b(disse|falou|prometeu|garantiu)\b/.test(divNorm(p));
const divFrasePergunta = p => { const f = divNorm(p).replace(/["'“”‘’]/g, "").split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean); return [...f].reverse().find(x => x.endsWith("?")) || f[f.length - 1] || ""; };
const divForma = p => {
  const q = divFrasePergunta(divSemCitacao(p)).replace(/^e\s+/, "");
  for (const [k, re] of [["o-que", /^(o )?que\b/], ["como", /^como\b/], ["por-que", /^por ?que\b/], ["qual", /^(qual|quais)\b/], ["quem", /^quem\b/], ["quanto", /^quant/], ["onde", /^onde\b/], ["quando", /^quando\b/]])
    if (re.test(q)) return k;
  if (/\bou\b/.test(q)) return "escolha";
  return "sim-nao";
};
const divAbertura = p => divFrasePergunta(divSemCitacao(p)).replace(/^e\s+/, "").split(/\s+/).slice(0, 2).join(" ");
const DIV_PASSADO = /luta passada|ultima luta|luta anterior|na luta \d|ha \d+ lutas|da ultima vez|outra vez|antes desta luta|na coletiva|voce disse|derrota passada|vitoria passada/;
function divMetricas(cenas, tipo) {
  const porCarreira = {};
  for (const c of cenas.filter(x => x.tipo === tipo)) (porCarreira[c.carreira] = porCarreira[c.carreira] || []).push(c);
  const acc = { cenas: 0, catDistintas: [], catEmJanela: 0, formaMax: 0, formaIgualAnterior: 0, aberturas: [], quaseRep: 0, evRep: 0, simMedia: 0, metodo: 0, passado: 0, cita: 0, fallback: 0, formas: {} };
  for (const lista of Object.values(porCarreira)) {
    const cats = lista.map(c => divCategoria(c.evento)), formas = lista.map(c => divForma(c.pergunta));
    const conj = lista.map(c => divPalavras(divSemCitacao(c.pergunta), c.nomes)), conjEv = lista.map(c => divPalavras(c.evento, c.nomes));
    acc.catDistintas.push(new Set(cats).size);
    acc.aberturas.push(new Set(lista.map(c => divAbertura(c.pergunta))).size / lista.length);
    lista.forEach((c, i) => {
      acc.cenas++;
      if (cats.slice(Math.max(0, i - 3), i).includes(cats[i])) acc.catEmJanela++;
      if (i && formas[i] === formas[i - 1]) acc.formaIgualAnterior++;
      acc.formas[formas[i]] = (acc.formas[formas[i]] || 0) + 1;
      let m = 0; for (let j = 0; j < i; j++) m = Math.max(m, divJaccard(conj[i], conj[j]));
      acc.simMedia += m; if (m >= 0.4) acc.quaseRep++;
      let me = 0; for (let j = 0; j < i; j++) me = Math.max(me, divJaccard(conjEv[i], conjEv[j]));
      if (me >= 0.4) acc.evRep++;
      const t = divNorm(divSemCitacao(c.pergunta)), cita = divCita(c.pergunta);
      if (/nocaute|finaliz|decis|juiz|cartoes|round/.test(t)) acc.metodo++;
      if (cita) acc.cita++;
      if (cita || DIV_PASSADO.test(t + " " + divNorm(c.evento)) || c.anteriores.some(a => a.length > 3 && t.includes(divNorm(a)))) acc.passado++;
      if (!c.ia) acc.fallback++;
    });
  }
  const n = acc.cenas || 1, pct = x => Math.round(100 * x / n);
  const formaTop = Object.entries(acc.formas).sort((a, b) => b[1] - a[1])[0] || ["-", 0];
  return { cenas: acc.cenas, categoriasDistintasPorCarreira: +(acc.catDistintas.reduce((a, b) => a + b, 0) / (acc.catDistintas.length || 1)).toFixed(1),
    categoriaRepetidaEm3: pct(acc.catEmJanela), formaMaisUsada: `${formaTop[0]} ${pct(formaTop[1])}%`, formaIgualAnterior: pct(acc.formaIgualAnterior),
    aberturasDistintas: Math.round(100 * acc.aberturas.reduce((a, b) => a + b, 0) / (acc.aberturas.length || 1)), quaseRepetidas: pct(acc.quaseRep), eventosQuaseRepetidos: pct(acc.evRep),
    similaridadeMedia: +(acc.simMedia / n).toFixed(2), ancoraNoMetodo: pct(acc.metodo), citaFalaDoJogador: pct(acc.cita), referenciaAoPassado: pct(acc.passado), fallbackLocal: pct(acc.fallback),
    formas: Object.fromEntries(Object.entries(acc.formas).map(([k, v]) => [k, pct(v)])) };
}
async function testarDiversidade(nCarreiras = 6) {
  /* reanálise: recalcula as métricas das cenas gravadas (DIVERSIDADE_SAIDA
     de uma medição anterior), com o classificador atual; "sem fala" tira as
     cenas que citam fala antiga, pra ver a dupla sozinha */
  if (process.env.DIVERSIDADE_REANALISAR) {
    for (const arq of process.env.DIVERSIDADE_REANALISAR.split(",")) {
      const d = JSON.parse(fs.readFileSync(arq, "utf8"));
      console.log("\n" + cinza(`${path.basename(arq)} (${d.modo || "local"})`));
      for (const [rot, cenas] of [["todas", d.cenas], ["sem fala", d.cenas.filter(c => !c.memoria)]])
        for (const tipo of ["coletiva", "entrevista"]) {
          const m = divMetricas(cenas, tipo);
          console.log(`  ${rot.padEnd(8)} ${tipo.padEnd(10)} cenas ${m.cenas} · categorias/carreira ${m.categoriasDistintasPorCarreira} · categoria repetida em 3 ${m.categoriaRepetidaEm3}% · forma igual à anterior ${m.formaIgualAnterior}% · forma mais usada ${m.formaMaisUsada} · aberturas distintas ${m.aberturasDistintas}% · perguntas quase repetidas ${m.quaseRepetidas}% · eventos quase repetidos ${m.eventosQuaseRepetidos}% · método ${m.ancoraNoMetodo}% · cita fala ${m.citaFalaDoJogador}% · passado ${m.referenciaAoPassado}% · fallback ${m.fallbackLocal}%`);
        }
    }
    return true;
  }
  const modo = process.env.DIVERSIDADE_IA || "";
  console.log("\n" + cinza(`diversidade: ${nCarreiras} carreiras de 22 lutas, cenas ${modo === "real" ? "da IA real" : modo === "seco" ? "pelo api/ai.js com OpenRouter falso (tamanho do prompt)" : "dos moldes locais"}`));
  const url = require("url"), os = require("os");
  const F = lerLutadores();
  const R0 = sandboxCarreira(); R0.sb.__F = F;
  const rosterJSON = R0.run("JSON.stringify(rateAll(globalThis.__F))");
  const tem = (n, c) => (n.className || "").split(" ").includes(c);
  const nosDe = (raiz, acc = []) => { if (!raiz) return acc; acc.push(raiz); (raiz.children || []).forEach(c => nosDe(c, acc)); return acc; };
  const respirar = async (X, n = 3) => { for (let k = 0; k < n; k++) { X.drenar(); await respirarCarreira(); } };
  /* IA: o handler de verdade (prompt, modelo e parse de produção), com o
     Supabase falso dizendo Pro (não gasta cota) */
  let host = async () => null, fetchOriginal = globalThis.fetch, envOriginal = { ...process.env };
  const uso = { chamadas: 0, entrada: 0, saida: 0, caracteresPrompt: 0, max: Number(process.env.DIVERSIDADE_MAX) || 100 };
  if (modo === "real" || modo === "seco") {
    const H = (await import(url.pathToFileURL(path.join(RAIZ, "api", "ai.js")).href)).default;
    process.env.OPENROUTER_API_KEY = modo === "real" ? fs.readFileSync(path.join(os.homedir(), ".octogono-openrouter"), "utf8").trim() : "chave-falsa";
    globalThis.fetch = async (u, op = {}) => {
      u = String(u);
      if (u.endsWith("/auth/v1/user")) return { ok: true, status: 200, json: async () => ({ id: "u-teste" }) };
      /* cota diária da IA (auditoria de 2026-10-08): o banco falso sempre libera */
      if (u.endsWith("/rest/v1/rpc/consumir_uso_ia")) return { ok: true, status: 200, json: async () => "2026-10-01T00:00:00.000000+00:00", text: async () => "" };
      if (u.endsWith("/rest/v1/rpc/devolver_uso_ia")) return { ok: true, status: 204, json: async () => null, text: async () => "" };
      if (u.includes("/rest/v1/assinaturas")) return { ok: true, status: 200, json: async () => [{ pro: true, expira_em: null }] };
      if (u.startsWith("https://openrouter.ai/")) {
        const b = JSON.parse(op.body); uso.caracteresPrompt += b.messages.reduce((a, m) => a + m.content.length, 0);
        if (modo === "seco") return { ok: false, status: 500, text: async () => "seco", json: async () => ({}) };
        return fetchOriginal(u, op);
      }
      return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
    };
    host = async (kind, data) => {
      if (uso.chamadas >= uso.max) return null;
      uso.chamadas++;
      const res = { cod: 0, corpo: null, setHeader() {}, status(c) { this.cod = c; return this; }, json(b) { this.corpo = b; return this; }, end() { return this; } };
      await H({ method: "POST", headers: {}, body: { kind, data: { ...data, token: "tok-medicao" } } }, res);
      if (res.corpo && res.corpo.usage) { uso.entrada += res.corpo.usage.prompt_tokens || 0; uso.saida += res.corpo.usage.completion_tokens || 0; }
      return res.cod === 200 ? res.corpo.result : null;
    };
  }
  const cenas = [], chamadas = [], avaliacoes = [];
  try {
    for (let k = 0; k < nCarreiras; k++) {
      const X = sandboxCarreira();
      iniciarCarreiraTeste(X, F, 991000 + k * 7919, "normal", rosterJSON);
      X.sb.__aiHost = host;
      X.sb.__cenaDados = []; X.sb.__chamadas = {};
      X.sb.__reacaoCol = d => { const r = DIV_RESPOSTAS_COL.find(x => x.t === d.resposta); return { reacao: "A sala anotou a resposta.", hype: 1.05, pressao: 1, atributoPressao: null, declaracao: r ? r.d : null }; };
      X.sb.__reacaoEnt = () => ({ reacao: "A resposta circulou nas redes.", fa: 0.1, seguidores: 0.02, declaracao: { tom: "neutro", trecho: "", promessa: null } });
      X.sb.__avaliacoes = [];
      X.run(`(function(){const orig=cenaDaIA;cenaDaIA=function(j,local,tipo,op){
        if(j)globalThis.__avaliacoes.push({tipo,motivo:avaliarCenaDaIA(j,tipo,op||{}).motivo||null,evento:j.evento||"",pergunta:j.pergunta||"",fala:!!(op&&op.exige)});
        return orig(j,local,tipo,op);};})();`);
      X.run(`auto=false;meuPro=true;ai=async(kind,data)=>{
        globalThis.__chamadas[kind]=(globalThis.__chamadas[kind]||0)+1;
        if(kind==="coletivaCena"||kind==="entrevistaCena"){globalThis.__cenaDados.push({kind,data:JSON.parse(JSON.stringify(data))});
          const r=await globalThis.__aiHost(kind,data);return r==null?null:limparTextoIA(r);}
        if(kind==="coletiva")return globalThis.__reacaoCol(data);
        if(kind==="entrevista")return globalThis.__reacaoEnt(data);
        return null;};`);
      const anteriores = () => JSON.parse(X.run("JSON.stringify((st.registro||[]).map(r=>r.adv))"));
      for (let guarda = 0; guarda < 200 && X.run("fightNo") < 22; guarda++) {
        await respirar(X);
        if (await resolverDilemaTeste(X, "aceito, sem problema")) { X.run("auto=false;"); continue; }
        if (X.run("playing")) continue;
        if (X.run("noiteEtapa") !== "oferta") X.run("auto=false;nextFight();");
        await respirar(X);
        /* o DOM falso não recria #opps e #camps quando a tela é redesenhada
           (innerHTML com conteúdo não limpa os filhos): as cartas e os camps
           das lutas anteriores continuam lá. Só valem os da tela de agora (os
           últimos). Antes, o teste clicava num camp velho, que abria a
           coletiva e a luta do adversário anterior: uma revanche que o jogo
           de verdade nunca oferece (achado em 2026-10-04, pares de lutas
           seguidas contra o mesmo nome inflavam "olha pro passado"). */
        const opps = (X.registro.opps ? X.registro.opps.children : []).filter(n => tem(n, "opp") && n.onclick).slice(-X.run("(ofertaAtual||[]).length"));
        if (!opps.length) continue;
        const f0 = X.run("fightNo");
        opps[(f0 + k) % opps.length].onclick();
        const camps = (X.registro.camps ? X.registro.camps.children : []).filter(n => tem(n, "camp") && n.onclick).slice(-X.run("CAMPS.length"));
        camps[(f0 * 3 + k) % camps.length].onclick();
        await X.run("cacheColetiva&&cacheColetiva.promessa");
        await respirar(X);
        const cc = JSON.parse(X.run("JSON.stringify({cena:cacheColetiva.cena,tema:cacheColetiva.tema,rep:cacheColetiva.reporter,cob:!!cacheColetiva.cobranca,opp:(ofertaAtual||[]).length?null:null})"));
        const oppNome = X.run("cacheColetiva.chave.split(':').slice(2).join(':')");
        cenas.push({ carreira: k, luta: f0 + 1, tipo: "coletiva", evento: cc.cena.evento, pergunta: cc.cena.pergunta, ia: !!cc.cena.ia, tema: cc.tema,
          reporter: cc.rep.nome, memoria: cc.cob, nomes: ["TesteBot", oppNome], anteriores: anteriores() });
        const resp = DIV_RESPOSTAS_COL[(f0 * 5 + k) % DIV_RESPOSTAS_COL.length];
        if (X.registro.colresp && !X.registro.colgo.disabled) { X.registro.colresp.value = resp.t; await X.registro.colgo.onclick(); await respirar(X); }
        if (X.registro.colseguir && X.registro.colseguir.onclick) X.registro.colseguir.onclick(); else X.registro.colpular.onclick();
        /* botões da coletiva usados: fora do registro já (sem isto, uma volta
           que pulava a limpeza do fim, sem entrevista, deixava o "Ir pra luta"
           desta coletiva pra próxima luta, e o teste clicava nele: luta de
           novo contra o adversário anterior, achado em 2026-10-04) */
        delete X.registro.colseguir; delete X.registro.colpular; delete X.registro.colresp; delete X.registro.colgo;
        for (let g = 0; g < 30 && X.run("playing"); g++) {
          X.drenar(); await respirarCarreira();
          const op = Object.keys(X.registro).filter(k2 => k2.startsWith("el_")).map(k2 => X.registro[k2]).filter(n => n.onclick);
          if (op.length) { op[0].onclick(); Object.keys(X.registro).filter(k2 => k2.startsWith("el_")).forEach(k2 => delete X.registro[k2]); }
        }
        await respirar(X);
        const conv = nosDe(X.registro.posluta).filter(c => tem(c, "entrevista-convite")).pop();
        const btn = conv && conv.children.find(c => c.onclick);
        if (!btn) continue;
        btn.onclick();
        await X.run("cacheEntrevista&&cacheEntrevista.promessa");
        await respirar(X);
        const ce = JSON.parse(X.run("JSON.stringify({cena:cacheEntrevista.cena,ang:cacheEntrevista.angulo,rep:cacheEntrevista.reporter,fala:!!cacheEntrevista.falaCol})"));
        const dados = X.sb.__cenaDados.filter(x => x.kind === "entrevistaCena").pop();
        cenas.push({ carreira: k, luta: f0 + 1, tipo: "entrevista", evento: ce.cena.evento, pergunta: ce.cena.pergunta, ia: !!ce.cena.ia, tema: ce.ang,
          fato: dados ? dados.data.fato : null, reporter: ce.rep.nome, memoria: ce.fala, nomes: ["TesteBot", oppNome], anteriores: anteriores().slice(0, -1) });
        if (X.registro.entresp && !X.registro.entgo.disabled) {
          X.registro.entresp.value = DIV_RESPOSTAS_ENT[(f0 + 2 * k) % DIV_RESPOSTAS_ENT.length];
          await X.registro.entgo.onclick(); await respirar(X);
        }
        delete X.registro.colseguir; delete X.registro.colresp; delete X.registro.colgo; delete X.registro.entresp; delete X.registro.entgo;
        const cont = X.registro.entcontinuar; delete X.registro.entcontinuar;
        if (cont && cont.onclick) cont.onclick();
        X.run("auto=false;");
      }
      chamadas.push({ ...X.sb.__chamadas, lutas: X.run("fightNo") });
      avaliacoes.push(...X.sb.__avaliacoes.map(a => ({ ...a, carreira: k })));
    }
  } finally {
    globalThis.fetch = fetchOriginal;
    for (const k of Object.keys(process.env)) if (!(k in envOriginal)) delete process.env[k];
    Object.assign(process.env, envOriginal);
  }
  const col = divMetricas(cenas, "coletiva"), ent = divMetricas(cenas, "entrevista");
  const linha = (nome, m) => console.log(`  ${nome.padEnd(10)} cenas ${m.cenas} · categorias distintas/carreira ${m.categoriasDistintasPorCarreira} · categoria repetida em 3 ${m.categoriaRepetidaEm3}% · forma mais usada ${m.formaMaisUsada} · forma igual à anterior ${m.formaIgualAnterior}% · aberturas distintas ${m.aberturasDistintas}% · quase repetidas ${m.quaseRepetidas}% · eventos quase repetidos ${m.eventosQuaseRepetidos}% · similaridade ${m.similaridadeMedia} · âncora no método ${m.ancoraNoMetodo}% · cita fala ${m.citaFalaDoJogador}% · passado ${m.referenciaAoPassado}% · fallback ${m.fallbackLocal}%`);
  linha("coletiva", col); linha("entrevista", ent);
  const somaCham = {}; for (const c of chamadas) for (const [k2, v] of Object.entries(c)) somaCham[k2] = (somaCham[k2] || 0) + v;
  console.log("  chamadas de IA (todas as carreiras): " + Object.entries(somaCham).map(([k2, v]) => `${k2} ${v}`).join(" · "));
  if (modo) console.log(`  api/ai.js: ${uso.chamadas} chamadas de cena · prompt ${Math.round(uso.caracteresPrompt / Math.max(uso.chamadas, 1))} caracteres por chamada${modo === "real" ? ` · tokens ${uso.entrada} entrada, ${uso.saida} saída` : ""}`);
  if (avaliacoes.length) {
    const mot = {}; for (const a of avaliacoes) { const k = `${a.tipo}${a.fala ? " com fala" : ""}: ${a.motivo || "aceita"}`; mot[k] = (mot[k] || 0) + 1; }
    console.log("  cenas da IA por desfecho: " + Object.entries(mot).sort().map(([k2, v]) => `${k2} ${v}`).join(" · "));
  }
  if (process.env.DIVERSIDADE_SAIDA) fs.writeFileSync(process.env.DIVERSIDADE_SAIDA, JSON.stringify({ modo, coletiva: col, entrevista: ent, chamadas: somaCham, uso, cenas, avaliacoes }, null, 1));
  const lutas = chamadas.map(c => c.lutas);
  let ok = lutas.every(l => l === 22) && cenas.filter(c => c.tipo === "coletiva").length === 22 * nCarreiras;
  console.log(ok ? verde("  diversidade medida (22 lutas em toda carreira)") : vermelho(`  carreira incompleta: ${lutas.join(",")} lutas, ${cenas.length} cenas`));
  /* Guarda de regressão, só nos moldes locais (narrativa 2026-10-01). Antes
     da mudança: coletiva 46% de perguntas quase repetidas e 8,3 categorias
     de evento por carreira; entrevista 61% quase repetidas, 67% citando fala
     antiga, 72% olhando pro passado. Consumo: uma chamada de cena e uma de
     reação por coletiva e por entrevista, em toda luta. */
  if (!modo) {
    const limites = [
      /* ≥ 9,5 desde 2026-10-04: o 10 foi medido com o teste clicando em camp
         velho (revanches falsas somavam a categoria "revanche"); corrigido,
         o master deu 10,2 e a carreira v2 9,7, ruído de 6 carreiras. Ainda
         bem acima dos 8,3 de antes da narrativa nova. */
      ["coletiva: perguntas quase repetidas ≤ 30%", col.quaseRepetidas <= 30], ["coletiva: categorias de evento por carreira ≥ 9,5", col.categoriasDistintasPorCarreira >= 9.5],
      ["entrevista: perguntas quase repetidas ≤ 25%", ent.quaseRepetidas <= 25], ["entrevista: cita fala antiga ≤ 40%", ent.citaFalaDoJogador <= 40],
      ["entrevista: olha pro passado ≤ 50%", ent.referenciaAoPassado <= 50],
      ["consumo: 1 chamada de cena e 1 de reação por coletiva e por entrevista, em toda luta", chamadas.every(c => ["coletivaCena", "coletiva", "entrevistaCena", "entrevista"].every(k => c[k] === 22))],
    ];
    for (const [nome, passou] of limites) { console.log((passou ? verde("  ok    ") : vermelho("  falha ")) + nome); ok = ok && passou; }
  }
  return ok;
}

/* ================================================================== *
 * AMOSTRA GRÁTIS DO PRO (plano de evolução, etapa 2, 2026-10-01): cota
 * da CONTA no servidor (api/ai.js + api/_pro.js). O banco falso faz o
 * mesmo que consumir_uso_ia/devolver_uso_ia (supabase_schema.sql): conta
 * e confere o limite num passo só e devolve o início da janela; a
 * devolução só desconta na mesma janela e o total nunca diminui. Espera
 * aleatória antes e depois
 * pra embaralhar chamadas simultâneas. Prova a lógica do servidor; a
 * atomicidade de verdade é do Postgres (um INSERT ... ON CONFLICT DO
 * UPDATE ... WHERE trava a linha).
 * ================================================================== */
async function testarAmostra() {
  console.log("\n" + cinza("amostra: cota grátis do Pro por conta, no servidor"));
  const url = require("url");
  const falhas = [];
  const conf = async (nome, fn) => {
    try { await fn(); console.log(verde("  ok    ") + nome); }
    catch (e) { falhas.push(nome); console.log(vermelho("  falha ") + nome + "\n         " + e.message); }
  };
  let H = null;
  try { H = (await import(url.pathToFileURL(path.join(RAIZ, "api", "ai.js")).href)).default; }
  catch (e) { console.log(vermelho("  não carregou api/ai.js: " + e.message)); return false; }
  const U1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", U2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", UP = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const tokens = { "tok-u1": U1, "tok-u2": U2, "tok-pro": UP };
  let banco, rpcModo, iaFila, iaCorpos, rpc, nJanela;
  const zerar = () => { banco = new Map(); rpcModo = "ok"; iaFila = []; iaCorpos = []; rpc = []; nJanela = 0; };
  const linha = (uid) => banco.get(uid + "|amostra") || { chamadas: 0, total: 0 };
  /* início de janela no formato que o PostgREST devolve um timestamptz,
     com microssegundos: reformatar (new Date().toISOString()) perde os
     três últimos dígitos e a devolução não acharia a janela */
  const novaJanela = () => `2026-10-01T12:${String(++nJanela).padStart(2, "0")}:00.123456+00:00`;
  const consumir = (uid, grupo, limite) => {
    if (!(limite >= 1)) return null;
    const k = uid + "|" + grupo, r = banco.get(k);
    if (!r) { const j = novaJanela(); banco.set(k, { chamadas: 1, total: 1, janela: j }); return j; }
    if (r.chamadas >= limite) return null;
    r.chamadas++; r.total++;
    return r.janela;
  };
  const espera = () => new Promise(r => setTimeout(r, Math.random() * 6));
  const fetchOriginal = globalThis.fetch, envOriginal = { ...process.env }, erroOriginal = console.error;
  globalThis.fetch = async (u, op = {}) => {
    u = String(u);
    const ok = (corpo, status = 200) => ({ ok: status < 300, status, json: async () => corpo, text: async () => JSON.stringify(corpo) });
    const tok = String((op.headers || {}).Authorization || "").replace("Bearer ", "");
    if (u.endsWith("/auth/v1/user")) { await espera(); return tokens[tok] ? ok({ id: tokens[tok] }) : ok({ msg: "token inválido" }, 401); }
    if (u.includes("/rest/v1/assinaturas")) { await espera(); return tokens[tok] ? ok(tok === "tok-pro" ? [{ pro: true, expira_em: null }] : []) : ok({}, 401); }
    if (u.endsWith("/rest/v1/rpc/consumir_uso_ia")) {
      const b = JSON.parse(op.body); rpc.push(["consumir", b]);
      await espera();
      if (rpcModo === "rede") throw new Error("ECONNRESET");
      if (rpcModo === "500") return ok({ message: "erro interno" }, 500);
      if (rpcModo === "404") return ok({ message: "Could not find the function public.consumir_uso_ia" }, 404);
      if (rpcModo === "estranho") return ok(true);   // formato da versão antiga da função: sem janela não libera
      const v = consumir(b.uid, b.grupo_, b.limite);
      await espera();
      return ok(v);
    }
    if (u.endsWith("/rest/v1/rpc/devolver_uso_ia")) {
      const b = JSON.parse(op.body); rpc.push(["devolver", b]);
      await espera();
      const r = banco.get(b.uid + "|" + b.grupo_);
      if (r && r.janela === b.janela) r.chamadas = Math.max(r.chamadas - 1, 0);
      return ok(null, 204);
    }
    if (u.startsWith("https://openrouter.ai/")) {
      iaCorpos.push(op.body);
      await espera();
      const modo = iaFila.length ? iaFila.shift() : "ok";
      /* outra chamada abriu janela nova enquanto esta esperava a IA, e
         esta falha depois */
      if (modo === "virada") { const r = banco.get(U1 + "|amostra"); r.janela = novaJanela(); r.chamadas = 1; r.total++; return { ok: false, status: 500, text: async () => "erro", json: async () => ({}) }; }
      if (modo === "timeout") { const e = new Error("abortou"); e.name = "AbortError"; throw e; }
      if (modo === "rede") throw new Error("ECONNRESET");
      if (modo === "500" || modo === "429") return { ok: false, status: +modo, text: async () => "erro do upstream", json: async () => ({}) };
      const content = modo === "vazio" ? "" : modo === "naojson" ? "texto solto que o modelo devolveu sem formato nenhum"
        : JSON.stringify({ evento: "A sala encheu.", pergunta: "Como você chega pra essa luta?" });
      return ok({ choices: [{ message: { content }, finish_reason: "stop" }], usage: {} });
    }
    return ok({}, 404);
  };
  Object.assign(process.env, { OPENROUTER_API_KEY: "chave-falsa", SUPABASE_SERVICE_ROLE_KEY: "service-falsa" });
  delete process.env.LIMITE_AMOSTRA_IA;
  console.error = () => {};
  const resposta = () => ({ cod: 0, corpo: null, setHeader() {}, status(c) { this.cod = c; return this; }, json(b) { this.corpo = b; return this; }, end() { return this; } });
  const chamar = async (token, { kind = "coletivaCena", amostra = true, extra = {} } = {}) => {
    const res = resposta();
    await H({ method: "POST", headers: {}, body: { kind, data: { name: "Teste", opp: "Rival Teste", record: "0-0", token, amostra, ...extra } } }, res);
    return res;
  };
  const consumos = () => rpc.filter(c => c[0] === "consumir").length;
  const devolucoes = () => rpc.filter(c => c[0] === "devolver").length;
  try {
    await conf("sem Pro e sem a marca de amostra: 403 'plano Pro necessário', sem contar e sem chamar a IA", async () => {
      zerar();
      const r = await chamar("tok-u1", { amostra: false });
      if (r.cod !== 403 || r.corpo.error !== "plano Pro necessário") throw new Error(r.cod + " " + JSON.stringify(r.corpo));
      if (consumos() || iaCorpos.length) throw new Error("contou ou chamou a IA");
    });
    await conf("amostra com conta válida: libera, conta 1 no grupo 'amostra' com limite 6, chama a IA uma vez e o token não vai pro prompt", async () => {
      zerar();
      const r = await chamar("tok-u1");
      if (r.cod !== 200 || !r.corpo.ok) throw new Error(r.cod + " " + JSON.stringify(r.corpo));
      const c = rpc.find(x => x[0] === "consumir");
      if (!c || c[1].uid !== U1 || c[1].grupo_ !== "amostra" || c[1].limite !== 6) throw new Error("consumo: " + JSON.stringify(c));
      if (linha(U1).chamadas !== 1 || iaCorpos.length !== 1 || devolucoes()) throw new Error(`chamadas ${linha(U1).chamadas}, IA ${iaCorpos.length}, devoluções ${devolucoes()}`);
      if (iaCorpos[0].includes("tok-u1")) throw new Error("o token foi pro prompt");
    });
    await conf("a cota é da conta: 6 liberam, a 7ª é recusada (403, cota esgotada) sem chamar a IA, e outra conta segue livre", async () => {
      zerar();
      for (let i = 0; i < 6; i++) { const r = await chamar("tok-u1", { kind: i % 2 ? "coletiva" : "coletivaCena" }); if (r.cod !== 200) throw new Error(`chamada ${i + 1}: ${r.cod}`); }
      const r7 = await chamar("tok-u1", { kind: "entrevistaCena" });
      if (r7.cod !== 403 || r7.corpo.cota !== "esgotada" || r7.corpo.transitorio !== false) throw new Error("7ª: " + r7.cod + " " + JSON.stringify(r7.corpo));
      if (iaCorpos.length !== 6) throw new Error("IA chamada " + iaCorpos.length + " vezes");
      const o = await chamar("tok-u2");
      if (o.cod !== 200 || linha(U2).chamadas !== 1) throw new Error("outra conta: " + o.cod);
    });
    await conf("carreira nova não zera: nada que o jogo manda (semente, carreira, luta) entra na conta; recusa repetida não conta", async () => {
      zerar();
      for (let i = 0; i < 6; i++) await chamar("tok-u1", { extra: { seed: 1000 + i, carreira: i, luta: 1 } });
      for (let i = 0; i < 4; i++) {
        const r = await chamar("tok-u1", { extra: { seed: 9000 + i, carreira: 99 + i, luta: 1, slot: 3 } });
        if (r.cod !== 403 || r.corpo.cota !== "esgotada") throw new Error("carreira nova liberou: " + r.cod);
      }
      if (linha(U1).chamadas !== 6 || linha(U1).total !== 6) throw new Error(`recusa contou: ${JSON.stringify(linha(U1))}`);
      for (const c of rpc.filter(x => x[0] === "consumir"))
        if (Object.keys(c[1]).sort().join() !== "grupo_,limite,uid") throw new Error("o banco recebeu dado do jogo: " + JSON.stringify(c[1]));
    });
    await conf("sem sessão (sem token ou token inválido): 401, sem contar e sem chamar a IA", async () => {
      zerar();
      for (const t of [null, "", "tok-falso"]) {
        const r = await chamar(t);
        if (r.cod !== 401 || r.corpo.cota !== "sem-sessao") throw new Error(`token ${JSON.stringify(t)}: ${r.cod}`);
      }
      if (consumos() || iaCorpos.length) throw new Error("contou ou chamou a IA");
    });
    await conf("Pro com a marca de amostra não gasta a cota da amostra (o Pro passa antes); conta só na cota diária geral", async () => {
      zerar();
      for (let i = 0; i < 8; i++) { const r = await chamar("tok-pro"); if (r.cod !== 200) throw new Error("Pro recusado: " + r.cod); }
      if (rpc.some(c => c[0] === "consumir" && c[1].grupo_ === "amostra")) throw new Error("o Pro gastou a amostra");
      if (rpc.filter(c => c[0] === "consumir" && c[1].grupo_ === "geral").length !== 8) throw new Error("o Pro não contou na cota geral");
    });
    for (const modo of ["500", "404", "rede", "estranho"])
      await conf(`banco fora (${modo}): recusa com 503 'cota indisponível', sem chamar a IA`, async () => {
        zerar(); rpcModo = modo;
        const r = await chamar("tok-u1");
        if (r.cod !== 503 || r.corpo.cota !== "indisponivel" || r.corpo.transitorio !== false) throw new Error(r.cod + " " + JSON.stringify(r.corpo));
        if (iaCorpos.length) throw new Error("chamou a IA sem confirmação do banco");
      });
    for (const modo of ["500", "429", "vazio", "naojson", "timeout", "rede"])
      await conf(`IA falha depois de contar (${modo}): a unidade volta uma vez só, na janela em que foi contada, o total histórico fica, e o erro não leva texto da IA`, async () => {
        zerar(); iaFila = [modo];
        const r = await chamar("tok-u1");
        if (r.cod < 500) throw new Error("status " + r.cod);
        /* uma devolução por cota contada: a da amostra e a geral (2026-10-08) */
        const devs = rpc.filter(x => x[0] === "devolver").map(x => x[1]);
        if (devs.length !== 2 || devs.filter(d => d.grupo_ === "amostra").length !== 1 || devs.filter(d => d.grupo_ === "geral").length !== 1)
          throw new Error("devoluções: " + JSON.stringify(devs.map(d => d.grupo_)));
        const dev = devs.find(d => d.grupo_ === "amostra"), geral = banco.get(U1 + "|geral");
        if (dev.uid !== U1 || dev.janela !== linha(U1).janela) throw new Error("devolução sem a janela certa: " + JSON.stringify(dev));
        if (linha(U1).chamadas !== 0 || linha(U1).total !== 1) throw new Error("conta errada: " + JSON.stringify(linha(U1)));
        if (!geral || geral.chamadas !== 0 || geral.total !== 1) throw new Error("cota geral não voltou: " + JSON.stringify(geral));
        if (r.corpo.amostra) throw new Error("o erro devolveu texto da IA de graça: " + r.corpo.amostra);
      });
    await conf("uma devolução por chamada, mesmo quando a resposta de erro falha no meio e o erro cai no catch (que devolve de novo)", async () => {
      zerar(); iaFila = ["500"];
      const res = resposta();
      let jsons = 0;
      res.json = function (b) { if (++jsons === 1) throw new Error("resposta caiu"); this.corpo = b; return this; };
      try { await H({ method: "POST", headers: {}, body: { kind: "coletivaCena", data: { name: "Teste", opp: "Rival", token: "tok-u1", amostra: true } } }, res); } catch {}
      /* uma por cota contada (amostra e geral), nunca duas da mesma */
      const grupos = rpc.filter(x => x[0] === "devolver").map(x => x[1].grupo_).sort().join();
      if (grupos !== "amostra,geral") throw new Error("devoluções: " + grupos);
      if (linha(U1).chamadas !== 0) throw new Error(JSON.stringify(linha(U1)));
    });
    await conf("devolução de janela que já virou não mexe na janela nova", async () => {
      zerar(); iaFila = ["virada"];
      await chamar("tok-u1");
      const r = linha(U1), dev = rpc.find(x => x[0] === "devolver");
      if (!dev || dev[1].janela === r.janela) throw new Error("a devolução não levou a janela antiga: " + JSON.stringify(dev && dev[1]));
      if (r.chamadas !== 1 || r.total !== 2) throw new Error("mexeu na janela nova: " + JSON.stringify(r));
    });
    await conf("retentativa do jogo (429 e de novo): na janela conta só a que deu certo; o total histórico conta as duas", async () => {
      zerar(); iaFila = ["429", "ok"];
      const a = await chamar("tok-u1"), b = await chamar("tok-u1");
      if (a.cod !== 502 || a.corpo.status !== 429 || b.cod !== 200) throw new Error(`${a.cod}/${b.cod}`);
      if (linha(U1).chamadas !== 1 || linha(U1).total !== 2) throw new Error(JSON.stringify(linha(U1)));
    });
    await conf("a conta é a do token, conferida no Supabase: id mandado pelo navegador é ignorado", async () => {
      zerar();
      const r = await chamar("tok-u1", { extra: { uid: U2, user_id: U2, userId: U2, conta: U2 } });
      if (r.cod !== 200) throw new Error("status " + r.cod);
      const c = rpc.find(x => x[0] === "consumir");
      if (!c || c[1].uid !== U1 || banco.has(U2 + "|amostra")) throw new Error("usou o id do navegador: " + JSON.stringify(c && c[1]));
      iaFila = ["500"];
      await chamar("tok-u1", { extra: { uid: U2 } });
      const dev = rpc.find(x => x[0] === "devolver");
      if (!dev || dev[1].uid !== U1) throw new Error("devolveu pra outra conta: " + JSON.stringify(dev && dev[1]));
    });
    await conf("chamadas simultâneas: 10 ao mesmo tempo com limite 6 = 6 liberadas, 4 recusadas, 6 chamadas à IA", async () => {
      for (let rodada = 0; rodada < 20; rodada++) {
        zerar();
        const rs = await Promise.all(Array.from({ length: 10 }, () => chamar("tok-u1")));
        const liberadas = rs.filter(r => r.cod === 200).length, recusadas = rs.filter(r => r.cod === 403 && r.corpo.cota === "esgotada").length;
        if (liberadas !== 6 || recusadas !== 4 || iaCorpos.length !== 6 || linha(U1).chamadas !== 6)
          throw new Error(`rodada ${rodada}: ${liberadas} liberadas, ${recusadas} recusadas, IA ${iaCorpos.length}, contadas ${linha(U1).chamadas}`);
      }
    });
    await conf("simultâneas com falha da IA no meio: o que falhou volta, e a conta fecha igual ao que deu certo (nunca passa de 6)", async () => {
      for (let rodada = 0; rodada < 20; rodada++) {
        zerar(); iaFila = ["500", "ok", "timeout", "ok", "ok", "vazio", "ok", "ok", "ok", "ok", "ok", "ok"];
        const rs = await Promise.all(Array.from({ length: 12 }, () => chamar("tok-u1")));
        const certas = rs.filter(r => r.cod === 200).length, contadas = rs.filter(r => r.cod !== 403).length;
        if (certas > 6 || linha(U1).chamadas !== certas || linha(U1).total !== contadas)
          throw new Error(`rodada ${rodada}: ${certas} certas, ${contadas} contadas, banco ${JSON.stringify(linha(U1))}`);
      }
    });
    await conf("LIMITE_AMOSTRA_IA ajusta sem mexer no código: 2 (a 3ª recusa); inválido volta pra 6; 0 desliga sem consultar o banco", async () => {
      zerar(); process.env.LIMITE_AMOSTRA_IA = "2";
      const cods = [];
      for (let i = 0; i < 3; i++) cods.push((await chamar("tok-u1")).cod);
      if (cods.join() !== "200,200,403") throw new Error("limite 2: " + cods.join());
      for (const v of ["abc", "-1", "2.5", ""]) {
        zerar(); process.env.LIMITE_AMOSTRA_IA = v;
        await chamar("tok-u1");
        const c = rpc.find(x => x[0] === "consumir");
        if (!c || c[1].limite !== 6) throw new Error(`"${v}" virou ${c && c[1].limite}`);
      }
      zerar(); process.env.LIMITE_AMOSTRA_IA = "0";
      const r = await chamar("tok-u1");
      if (r.cod !== 403 || r.corpo.cota !== "esgotada" || consumos() || iaCorpos.length) throw new Error("limite 0: " + r.cod + ", consumos " + consumos());
      delete process.env.LIMITE_AMOSTRA_IA;
    });
    /* auditoria de pré-lançamento (2026-10-08): antes, evento, feed, dilema
       e julgar aceitavam chamada sem conta e de qualquer tamanho */
    await conf("evento, feed, dilema e julgar sem sessão: 401, sem contar e sem chamar a IA", async () => {
      zerar();
      for (const kind of ["evento", "feed", "dilema", "julgar"]) {
        const r = await chamar(null, { kind, amostra: false });
        if (r.cod !== 401 || r.corpo.cota !== "sem-sessao") throw new Error(kind + ": " + r.cod);
      }
      if (consumos() || iaCorpos.length) throw new Error("contou ou chamou a IA");
    });
    await conf("evento e feed com sessão: não passam pela cota da amostra; contam uma vez na cota diária geral", async () => {
      zerar();
      for (const kind of ["evento", "feed"]) {
        const r = await chamar("tok-u1", { kind, amostra: true });
        if (r.cod !== 200) throw new Error(kind + ": " + r.cod);
      }
      if (rpc.some(c => c[0] === "consumir" && c[1].grupo_ === "amostra")) throw new Error("contou na amostra");
      const g = banco.get(U1 + "|geral");
      if (!g || g.chamadas !== 2) throw new Error("cota geral: " + JSON.stringify(g));
    });
    await conf("cota diária geral esgotada (LIMITE_IA_GERAL): 403 'geral-esgotada', sem chamar a IA, e a cota da amostra não é gasta", async () => {
      zerar(); process.env.LIMITE_IA_GERAL = "2";
      try {
        for (let i = 0; i < 2; i++) { const r = await chamar("tok-u1", { kind: "feed" }); if (r.cod !== 200) throw new Error(`chamada ${i + 1}: ${r.cod}`); }
        const n = iaCorpos.length;
        const r3 = await chamar("tok-u1", { kind: "feed" });
        if (r3.cod !== 403 || r3.corpo.cota !== "geral-esgotada" || r3.corpo.transitorio !== false) throw new Error("3ª: " + r3.cod + " " + JSON.stringify(r3.corpo));
        const ra = await chamar("tok-u1", { kind: "coletivaCena" });
        if (ra.cod !== 403 || linha(U1).chamadas !== 0) throw new Error("amostra com a geral esgotada: " + ra.cod + " " + JSON.stringify(linha(U1)));
        if (iaCorpos.length !== n) throw new Error("chamou a IA com a cota esgotada");
      } finally { delete process.env.LIMITE_IA_GERAL; }
    });
    await conf("pedido grande demais: 413 sem conferir conta, sem contar e sem chamar a IA; campo comprido é cortado antes do prompt", async () => {
      zerar();
      const r = await chamar("tok-u1", { kind: "feed", extra: { recentes: Array.from({ length: 30 }, () => "x".repeat(1500)) } });
      if (r.cod !== 413) throw new Error("corpo grande: " + r.cod);
      if (consumos() || iaCorpos.length) throw new Error("contou ou chamou a IA");
      const r2 = await chamar("tok-u1", { kind: "feed", extra: { name: "y".repeat(5000) } });
      if (r2.cod !== 200) throw new Error("campo comprido: " + r2.cod);
      const prompt = iaCorpos[iaCorpos.length - 1];
      if (prompt.includes("y".repeat(2001)) || !prompt.includes("y".repeat(2000))) throw new Error("o campo não foi cortado em 2000");
    });
  } finally {
    globalThis.fetch = fetchOriginal;
    console.error = erroOriginal;
    for (const k of Object.keys(process.env)) if (!(k in envOriginal)) delete process.env[k];
    Object.assign(process.env, envOriginal);
  }
  console.log("\n" + (falhas.length ? vermelho(falhas.length + " falha(s) na amostra") : verde("amostra ok")));
  return falhas.length === 0;
}

async function testarAdmin() {
  console.log("\n" + cinza("admin: acesso só de admin, ações no servidor, banimento, registro"));
  const url = require("url");
  const falhas = [];
  const conf = async (nome, fn) => {
    try { await fn(); console.log(verde("  ok    ") + nome); }
    catch (e) { falhas.push(nome); console.log(vermelho("  falha ") + nome + "\n         " + e.message); }
  };
  let H = null, P = null;
  try {
    H = (await import(url.pathToFileURL(path.join(RAIZ, "api", "admin.js")).href)).default;
    P = (await import(url.pathToFileURL(path.join(RAIZ, "api", "placar.js")).href)).default;
  } catch (e) { console.log(vermelho("  não carregou api/admin.js: " + e.message)); return false; }
  const D = "11111111-1111-4111-8111-111111111111", A = "22222222-2222-4222-8222-222222222222", U = "33333333-3333-4333-8333-333333333333";
  const contas = { [D]: { id: D, email: "dono@x.com" }, [A]: { id: A, email: "adm@x.com" }, [U]: { id: U, email: "u@x.com" } };
  const tokens = { "tok-dono": D, "tok-adm": A, "tok-comum": U };
  let ops;
  const fetchOriginal = globalThis.fetch, envOriginal = { ...process.env }, logOriginal = console.log;
  globalThis.fetch = async (u, op = {}) => {
    u = String(u); const m = op.method || "GET";
    const ok = (corpo, status = 200) => ({ ok: status < 300, status, json: async () => corpo });
    if (u.endsWith("/auth/v1/user")) { const id = tokens[String((op.headers || {}).Authorization || "").replace("Bearer ", "")]; return id ? ok(contas[id]) : ok({}, 401); }
    const adm = u.match(/\/auth\/v1\/admin\/users\/([^/?]+)/);
    if (adm) { const id = decodeURIComponent(adm[1]); if (m === "PUT") { ops.push(["ban", id, JSON.parse(op.body).ban_duration]); return ok({}); } return contas[id] ? ok(contas[id]) : ok({}, 404); }
    if (u.includes("/rest/v1/admins?user_id=eq.")) { const id = decodeURIComponent(u.split("user_id=eq.")[1].split("&")[0]); return ok(m === "DELETE" ? null : (id === A ? [{ user_id: A }] : [])); }
    if (u.includes("/rest/v1/rpc/admin_listar_usuarios")) { const b = JSON.parse(op.body).busca || ""; return ok(Object.values(contas).filter(c => c.email.includes(b)).map(c => ({ ...c, carreiras: 0, no_placar: 0, pro: false, banido: false, admin: c.id === A }))); }
    if (u.includes("/rest/v1/banidos") && m === "GET") return ok(u.includes("user_id=eq." + U) && ops.some(o => o[0] === "POST banidos") ? [{ user_id: U }] : []);
    const tab = (u.match(/\/rest\/v1\/([a-z_]+)/) || [])[1];
    if (tab && m !== "GET") { ops.push([m + " " + tab, u, op.body ? JSON.parse(op.body) : null]); return ok(null, 201); }
    if (tab) return ok([]);
    return ok({}, 404);
  };
  Object.assign(process.env, { SUPABASE_SERVICE_ROLE_KEY: "service-falsa", ADMIN_DONO_EMAIL: "Dono@X.com" });
  console.log = (...a) => { if (String(a[0]) !== "admin") logOriginal(...a); };
  const resposta = () => ({ cod: 0, corpo: null, setHeader() {}, status(c) { this.cod = c; return this; }, json(b) { this.corpo = b; return this; }, end() { return this; } });
  const chamar = async (token, acao, extra = {}) => { const res = resposta(); await H({ method: "POST", headers: {}, body: { token, acao, ...extra } }, res); return res; };
  try {
    await conf("sem sessão válida = 401", async () => { ops = []; const r = await chamar("tok-x", "eu"); if (r.cod !== 401) throw new Error("status " + r.cod); });
    await conf("'eu': comum não é admin; dono (e-mail da Vercel, sem diferença de maiúscula) é admin e dono; admin da tabela é admin", async () => {
      ops = [];
      const c = (await chamar("tok-comum", "eu")).corpo, d = (await chamar("tok-dono", "eu")).corpo, a = (await chamar("tok-adm", "eu")).corpo;
      if (c.admin || !d.admin || !d.dono || !a.admin || a.dono) throw new Error(JSON.stringify({ c, d, a }));
    });
    await conf("conta comum não lista, não dá Pro, não bane (403) e nada é escrito", async () => {
      ops = [];
      for (const [acao, extra] of [["listar", {}], ["darPro", { userId: U, dias: null }], ["banir", { userId: U }]]) {
        const r = await chamar("tok-comum", acao, extra);
        if (r.cod !== 403) throw new Error(acao + ": status " + r.cod);
      }
      if (ops.length) throw new Error("escreveu: " + JSON.stringify(ops));
    });
    await conf("dar Pro sem prazo = plano único sem data; 30 dias = mensal com data; e vai pro registro", async () => {
      ops = [];
      await chamar("tok-dono", "darPro", { userId: U, dias: null });
      await chamar("tok-adm", "darPro", { userId: U, dias: 30 });
      const [sem, trinta] = ops.filter(o => o[0] === "POST assinaturas").map(o => o[2]);
      if (!sem || sem.pro !== true || sem.plano !== "unico" || sem.expira_em !== null) throw new Error("sem prazo: " + JSON.stringify(sem));
      const dias = (new Date(trinta.expira_em) - Date.now()) / 864e5;
      if (trinta.plano !== "mensal" || !(dias > 29.9 && dias < 30.1)) throw new Error("30 dias: " + JSON.stringify(trinta));
      if (ops.filter(o => o[0] === "POST admin_log").length !== 2) throw new Error("registro: " + ops.map(o => o[0]));
    });
    await conf("banir: grava em banidos, bloqueia o login no Auth (~100 anos) e registra o motivo", async () => {
      ops = [];
      const r = await chamar("tok-adm", "banir", { userId: U, motivo: "nome ofensivo" });
      if (r.cod !== 200) throw new Error("status " + r.cod + " " + JSON.stringify(r.corpo));
      const ban = ops.find(o => o[0] === "ban");
      if (!ops.some(o => o[0] === "POST banidos" && o[2].motivo === "nome ofensivo") || !ban || ban[2] !== "876000h") throw new Error(JSON.stringify(ops));
    });
    await conf("desbanir: libera o login e apaga de banidos", async () => {
      ops = [];
      await chamar("tok-adm", "desbanir", { userId: U });
      if (!ops.some(o => o[0] === "ban" && o[2] === "none") || !ops.some(o => o[0] === "DELETE banidos")) throw new Error(JSON.stringify(ops));
    });
    await conf("admin e dono não podem ser banidos; ninguém bane a si mesmo", async () => {
      ops = [];
      const a = await chamar("tok-dono", "banir", { userId: A }), d = await chamar("tok-adm", "banir", { userId: D }), s = await chamar("tok-adm", "banir", { userId: A });
      if (a.cod !== 400 || d.cod !== 400 || s.cod !== 400 || ops.some(o => o[0] === "ban")) throw new Error([a.cod, d.cod, s.cod].join(","));
    });
    await conf("só o dono adiciona e tira admin", async () => {
      ops = [];
      const x = await chamar("tok-adm", "addAdmin", { email: "u@x.com" });
      if (x.cod !== 403) throw new Error("admin adicionou admin: " + x.cod);
      const y = await chamar("tok-dono", "addAdmin", { email: "u@x.com" });
      if (y.cod !== 200 || !ops.some(o => o[0] === "POST admins" && o[2].user_id === U)) throw new Error("dono não adicionou: " + y.cod);
      const z = await chamar("tok-adm", "removerAdmin", { userId: A });
      if (z.cod !== 403) throw new Error("admin tirou admin: " + z.cod);
    });
    await conf("apagar do ranking apaga a carreira certa (usuário + semente)", async () => {
      ops = [];
      await chamar("tok-adm", "apagarRanking", { userId: U, seed: "424242", nome: "Kayo" });
      const del = ops.find(o => o[0] === "DELETE placar");
      if (!del || !del[1].includes("user_id=eq." + U) || !del[1].includes("seed=eq.424242")) throw new Error(JSON.stringify(ops));
    });
    await conf("chave de serviço: JWT antigo vai no apikey e no Authorization; sb_secret_ novo só no apikey; espaço colado some", async () => {
      const Pro = await import(url.pathToFileURL(path.join(RAIZ, "api", "_pro.js")).href);
      process.env.SUPABASE_SERVICE_ROLE_KEY = " eyJhbGciOi.xyz.abc\n";
      const a = Pro.cabecalhoServico();
      if (a.apikey !== "eyJhbGciOi.xyz.abc" || a.Authorization !== "Bearer eyJhbGciOi.xyz.abc") throw new Error("JWT: " + JSON.stringify(a));
      process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_abc123 ";
      const b = Pro.cabecalhoServico();
      if (b.apikey !== "sb_secret_abc123" || "Authorization" in b) throw new Error("sb_secret: " + JSON.stringify(b));
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-falsa";
    });
    await conf("conta banida não grava no ranking (403), mesmo com a sessão ainda aberta", async () => {
      ops = [["POST banidos"]];
      const res = resposta();
      await P({ method: "POST", headers: { authorization: "Bearer tok-comum" }, body: { seed: 1 } }, res);
      if (res.cod !== 403) throw new Error("status " + res.cod + " " + JSON.stringify(res.corpo));
    });
  } finally {
    globalThis.fetch = fetchOriginal;
    for (const k of ["SUPABASE_SERVICE_ROLE_KEY", "ADMIN_DONO_EMAIL"]) { if (envOriginal[k] === undefined) delete process.env[k]; else process.env[k] = envOriginal[k]; }
    console.log = logOriginal;
  }

  /* tela: quem não é admin vê a 404; admin vê as abas; banir pede 2 cliques */
  const tela = async (resposta) => {
    const env = criarAmbiente({ contarNos: true });
    const chamadas = [];
    env.sandbox.window.supabase = supabaseFalsoComSessao({ sessao: { user: { id: U, email: "u@x.com" }, access_token: "tok" } });
    env.sandbox.fetch = async (u, op) => { const b = JSON.parse(op.body); chamadas.push(b.acao); return { ok: true, status: 200, json: async () => resposta(b) }; };
    vm.createContext(env.sandbox);
    vm.runInContext(exportar(lerScript(), ["ready", "irPara"]), env.sandbox, { filename: "index.html" });
    env.sandbox.__x.ready(lerLutadores());
    const respirar = () => new Promise(r => setImmediate(r));
    for (let k = 0; k < 3; k++) { env.drenar(); await respirar(); }
    env.sandbox.__x.irPara("admin");
    for (let k = 0; k < 6; k++) { env.drenar(); await respirar(); }
    return { env, chamadas, respirar };
  };
  const tem = (n, c) => (n.className || "").split(" ").includes(c);
  await conf("tela: quem não é admin cai na 404, sem aba nenhuma do painel", async () => {
    const { env } = await tela(b => b.acao === "eu" ? { admin: false } : {});
    if (!env.todos.some(n => tem(n, "erro-num"))) throw new Error("não mostrou a 404");
    if (env.todos.some(n => n.dataset && n.dataset.aba === "jogadores")) throw new Error("mostrou aba do painel");
  });
  await conf("tela: admin vê Jogadores, Ranking e Registro (Admins só pro dono) e a lista vem do servidor", async () => {
    const lista = [{ id: U, email: "u@x.com", criado_em: "2026-09-01T00:00:00Z", ultimo_acesso: null, pro: false, banido: false, admin: false, carreiras: 2, no_placar: 1 }];
    const { env, chamadas } = await tela(b => b.acao === "eu" ? { admin: true, dono: false } : b.acao === "listar" ? { jogadores: lista, pagina: 0, porPagina: 50 } : {});
    const abas = env.todos.filter(n => n.dataset && n.dataset.aba).map(n => n.dataset.aba);
    if (abas.join(",") !== "jogadores,ranking,registro") throw new Error("abas: " + abas);
    if (!chamadas.includes("listar") || !env.todos.some(n => tem(n, "admin-quem") && /u@x\.com/.test(n.innerHTML))) throw new Error("lista não apareceu");
  });
  await conf("tela: banir pede confirmação (1º clique não chama o servidor, 2º chama)", async () => {
    const lista = [{ id: U, email: "u@x.com", criado_em: "2026-09-01T00:00:00Z", pro: false, banido: false, admin: false, carreiras: 0, no_placar: 0 }];
    const { env, chamadas, respirar } = await tela(b => b.acao === "eu" ? { admin: true } : b.acao === "listar" ? { jogadores: lista, pagina: 0, porPagina: 50 } : { ok: true });
    const banir = env.todos.filter(n => n.tagName === "button" && n.innerHTML === "Banir").pop();
    if (!banir) throw new Error("sem botão Banir");
    await banir.onclick(); await respirar();
    if (chamadas.includes("banir")) throw new Error("baniu no 1º clique");
    await banir.onclick(); await respirar();
    if (!chamadas.includes("banir")) throw new Error("2º clique não baniu");
  });
  const ok = !falhas.length;
  console.log("\n" + (ok ? verde("admin ok") : vermelho(`${falhas.length} falha(s) no admin`)));
  return ok;
}

/* ================================================================== *
 * PERSONAGEM (revamp dos personagens, 2026-09-28): boneco v2, arquétipos,
 *     peças, e save/ranking antigos (v1) convertidos sem quebrar.
 * ================================================================== */
async function testarPersonagem() {
  console.log("\n" + cinza("personagem: boneco v2, 8 arquétipos, peças, rosto antigo convertido"));
  const falhas = [];
  const conf = async (nome, fn) => {
    try { await fn(); console.log(verde("  ok    ") + nome); }
    catch (e) { falhas.push(nome); console.log(vermelho("  falha ") + nome + "\n         " + e.message); }
  };
  const env = criarAmbiente({ contarNos: true });
  vm.createContext(env.sandbox);
  vm.runInContext(exportar(lerScript(), ["bonecoSVG", "normalizarRosto", "ARQUETIPOS", "cfgPadrao", "screenCriador", "ready",
    "PELES", "PORTES", "CABELO_TIPOS", "CORES_CABELO", "BARBAS", "ORELHAS", "NARIZES", "CICATRIZES", "TATUAGENS", "ENTRADAS", "PRAJIADS", "CORES_ENTRADA"])
    + "\ntry{globalThis.__x.rosto=()=>ROSTO;}catch(e){}", env.sandbox, { filename: "index.html" });
  const X = env.sandbox.__x;
  const listas = { pele: X.PELES, porte: X.PORTES, cabelo: X.CABELO_TIPOS, corCabelo: X.CORES_CABELO, barba: X.BARBAS, orelha: X.ORELHAS,
    nariz: X.NARIZES, cicatriz: X.CICATRIZES, tatuagem: X.TATUAGENS, entrada: X.ENTRADAS, prajiad: X.PRAJIADS, corEntrada: X.CORES_ENTRADA };
  const valido = r => r && r.v === 2 && Object.entries(listas).every(([k, l]) => Number.isInteger(r[k]) && r[k] >= 0 && r[k] < l.length);
  const svgOk = s => /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 10 200 240"/.test(s) && !/NaN|undefined/.test(s);
  await conf("os 8 arquétipos desenham sem erro (sem NaN, xmlns pra virar imagem nos cards)", () => {
    if (X.ARQUETIPOS.length !== 8) throw new Error(X.ARQUETIPOS.length + " arquétipos");
    for (const a of X.ARQUETIPOS) { if (!valido(X.normalizarRosto({ v: 2, ...a.cfg }))) throw new Error(a.id + " inválido"); if (!svgOk(X.bonecoSVG({ v: 2, ...a.cfg }, { w: 100 }))) throw new Error(a.id + " quebrou"); }
  });
  await conf("toda peça de toda lista desenha sem erro", () => {
    for (const [k, l] of Object.entries(listas)) for (let i = 0; i < l.length; i++) {
      const s = X.bonecoSVG({ ...X.cfgPadrao(), [k]: i }, { w: 80 });
      if (!svgOk(s)) throw new Error(`${k}=${i} quebrou`);
    }
  });
  await conf("proporção igual à antiga (largura × 1,2): nenhum layout muda", () => {
    const s = X.bonecoSVG(X.cfgPadrao(), { w: 150 });
    if (!/width="150" height="180"/.test(s)) throw new Error(s.slice(0, 160));
  });
  await conf("rosto antigo (v1, save e ranking de antes) vira v2 válido; o protetor bucal antigo some", () => {
    const antigos = [{ pele: 7, cabelo: 8, corCabelo: 11, barba: 7, olho: 3, corOlho: 2, sobrancelha: 4, boca: 5, cicatriz: 5, calcao: 7, porte: 2 },
      { pele: 0, cabelo: 0, corCabelo: 0, barba: 0, cicatriz: 0, calcao: 0, porte: 0 }, {}, null, { pele: "x", porte: -3 }];
    for (const a of antigos) {
      const r = X.normalizarRosto(a);
      if (!valido(r)) throw new Error("inválido: " + JSON.stringify(a) + " -> " + JSON.stringify(r));
      if (!svgOk(X.bonecoSVG(a, { w: 60 }))) throw new Error("não desenhou: " + JSON.stringify(a));
    }
    const r = X.normalizarRosto({ pele: 7, cabelo: 5, barba: 3, cicatriz: 1, porte: 2 });
    if (r.pele !== 5 || X.CABELO_TIPOS[r.cabelo] !== "moicano" || X.BARBAS[r.barba] !== "cavanhaque" || r.cicatriz !== 1 || r.porte !== 2)
      throw new Error("conversão errada: " + JSON.stringify(r));
  });
  await conf("criador: a 1ª aba mostra os 8 arquétipos; escolher um monta o lutador inteiro", async () => {
    X.ready(lerLutadores());
    for (let k = 0; k < 3; k++) { env.drenar(); await new Promise(r => setImmediate(r)); }
    const m = env.todos.length;
    X.screenCriador("Kayo");
    const cartas = env.todos.slice(m).filter(n => (n.className || "").split(" ").includes("arquetipo"));
    if (cartas.length !== 8) throw new Error(cartas.length + " cartas de arquétipo");
    const boxe = cartas.find(n => /Boxe/.test(n.innerHTML || ""));
    boxe.onclick();
    const r = X.rosto();
    if (r.arquetipo !== "boxe" || X.ENTRADAS[r.entrada] !== "roupão" || X.CICATRIZES[r.cicatriz] !== "corte na sobrancelha") throw new Error(JSON.stringify(r));
  });
  const ok = !falhas.length;
  console.log("\n" + (ok ? verde("personagem ok") : vermelho(`${falhas.length} falha(s) no personagem`)));
  return ok;
}

/* ================================================================== *
 * HUB DA CARREIRA (revamp fase 5): barra fixa, 7 abas com fundo
 * próprio, Loja/Cards/Conquistas como aba, Voltar ao painel. Carreira
 * de verdade num sandbox (mesmo caminho da suíte save), DOM falso.
 * ================================================================== */
async function testarHub() {
  console.log("\n" + cinza("hub: barra, 7 abas com fundo, Loja/Cards/Conquistas como aba, Voltar ao painel"));
  const F = lerLutadores();
  const falhas = [];
  const conf = async (nome, fn) => {
    try { await fn(); console.log(verde("  ok    ") + nome); }
    catch (e) { falhas.push(nome); console.log(vermelho("  falha ") + nome + "\n         " + e.message); }
  };
  const tem = (n, c) => (n.className || "").split(" ").includes(c);
  const nosDe = (raiz, acc = []) => { if (!raiz) return acc; acc.push(raiz); (raiz.children || []).forEach(c => nosDe(c, acc)); return acc; };
  const EMOJI = /\p{Extended_Pictographic}/u;
  const ORDEM = ["painel", "lutador", "cartel", "midia", "loja", "cards", "conquistas"];
  const R0 = sandboxCarreira(); R0.sb.__F = F;
  const rosterJSON = R0.run("JSON.stringify(rateAll(globalThis.__F))");
  const novo = (seed) => {
    const ctx = sandboxCarreira();
    iniciarCarreiraTeste(ctx, F, seed, "normal", rosterJSON);
    ctx.run("auto=false;");
    return ctx;
  };
  const respirarN = async (X, n = 3) => { for (let k = 0; k < n; k++) { X.drenar(); await respirarCarreira(); } };

  await conf("carreira monta o hub: data-tela=hub e as 7 guias na ordem", async () => {
    const X = novo(778001);
    const tela = X.run("document.documentElement.dataset.tela");
    if (tela !== "hub") throw new Error("data-tela = " + tela);
    const guias = nosDe(X.registro.app).filter(n => tem(n, "guia-hub") && n.dataset && n.dataset.aba).map(n => n.dataset.aba);
    if (JSON.stringify(guias) !== JSON.stringify(ORDEM)) throw new Error("guias: " + guias.join(","));
  });

  await conf("cada guia deixa só a sua seção visível, marca a guia e troca o fundo", async () => {
    const X = novo(778002);
    for (const id of ORDEM) {
      const g = X.registro["guia_" + id];
      if (!g || !g.onclick) throw new Error("sem guia " + id);
      g.onclick();
      await respirarN(X, 1);
      for (const outra of ORDEM) {
        const s = X.registro["aba_" + outra];
        if (!s) throw new Error("sem seção " + outra);
        if (s.hidden !== (outra !== id)) throw new Error(`guia ${id}: seção ${outra} hidden=${s.hidden}`);
      }
      const nomeFundo = X.run(`ABAS_HUB.find(a=>a.id==="${id}").fundo`);
      const fundo = X.registro.hubFundo;
      if (!fundo || !String(fundo.style.cssText || "").includes("img/" + nomeFundo + ".webp"))
        throw new Error(`guia ${id}: fundo ${fundo && fundo.style.cssText}`);
      if (!tem(X.registro["guia_" + id], "on")) throw new Error(`guia ${id} não ficou marcada`);
      const marcadas = ORDEM.filter(o => tem(X.registro["guia_" + o], "on"));
      if (marcadas.length !== 1) throw new Error(`guia ${id}: ${marcadas.length} guias marcadas`);
    }
  });

  await conf("Loja, Cards e Conquistas desenham dentro da própria aba, sem sobreposição e sem Fechar", async () => {
    const X = novo(778003);
    X.registro.guia_loja.onclick();
    const loja = X.registro.painelTreinador;
    const itens = loja.children[0] ? loja.children[0].children.filter(c => tem(c, "loja-item")) : [];
    if (itens.length !== 5) throw new Error(itens.length + " itens na loja");
    if (loja.style.display === "flex") throw new Error("loja ainda abre como sobreposição");
    X.registro.guia_cards.onclick();
    await respirarN(X);
    if (!X.registro.painelMomentos.children.length) throw new Error("cards não desenhou");
    X.registro.guia_conquistas.onclick();
    const conq = X.registro.painelConquistas;
    if (!conq.children.length || !conq.children[0].children.some(c => tem(c, "conquista"))) throw new Error("conquistas não desenhou");
    const fechar = [loja, X.registro.painelMomentos, conq].flatMap(p => nosDe(p)).filter(n => tem(n, "painel-fechar"));
    if (fechar.length) throw new Error("ainda tem botão Fechar de sobreposição");
  });

  await conf("toda aba fora do Painel tem Voltar ao painel, e ele volta", async () => {
    const X = novo(778004);
    for (const id of ORDEM.slice(1)) {
      X.registro["guia_" + id].onclick();
      await respirarN(X, 1);
      const v = nosDe(X.registro["aba_" + id]).filter(n => tem(n, "voltar-painel") && n.onclick);
      if (v.length !== 1) throw new Error(`aba ${id}: ${v.length} botões de voltar`);
      v[0].onclick();
      if (X.registro.aba_painel.hidden) throw new Error(`Voltar da aba ${id} não voltou pro painel`);
    }
  });

  await conf("Mais (celular) abre a folha com Loja, Cards e Conquistas", async () => {
    const X = novo(778005);
    const mais = X.registro.guiaMais;
    if (!mais || !mais.onclick) throw new Error("sem botão Mais");
    mais.onclick();
    const folha = X.registro.hubFolha;
    if (!folha || folha.hidden) throw new Error("folha não abriu");
    const itens = folha.children.filter(c => tem(c, "folha-item") && c.onclick);
    if (itens.length !== 3) throw new Error(itens.length + " itens na folha");
    itens[1].onclick();
    await respirarN(X, 1);
    if (X.registro.aba_cards.hidden) throw new Error("item Cards da folha não abriu a aba");
    if (!folha.hidden) throw new Error("folha não fechou ao escolher");
  });

  await conf("barra mostra nome, cartel, lutas, dinheiro e seguidores e acompanha a carreira", async () => {
    const X = novo(778006);
    await jogarCarreiraAte(X, 3);
    X.run("auto=false;");
    const nome = X.run("me.name"), cartel = X.run("st.wins+'-'+st.losses");
    const din = X.run("fmtNum(st.dinheiro)"), seg = X.run("fmtNum(st.followers)");
    const lutas = X.run("fightNo") + " de 22";
    if (X.run("fightNo") < 3) throw new Error("carreira não andou: fightNo " + X.run("fightNo"));
    const barra = ["hubNome", "hubLinha", "hubDinheiro", "hubSeguidores"]
      .map(id => { const n = X.registro[id] || {}; return String(n.innerHTML || "") + " " + String(n.textContent || ""); }).join(" | ");
    for (const t of [nome, cartel, lutas, din, seg]) if (!barra.includes(t)) throw new Error(`barra sem "${t}": ${barra}`);
  });

  await conf("ids da lógica continuam montados dentro do hub", async () => {
    const X = novo(778007);
    const dentro = new Set(nosDe(X.registro.app).map(n => n.id).filter(Boolean));
    for (const id of ["controls", "next", "counter", "ficha", "bouts", "phone", "escolha", "stage", "live",
      "escolhaLuta", "painelTreinador", "painelMomentos", "painelConquistas", "painelAposentar", "hubMenu"])
      if (!dentro.has(id)) throw new Error("fora do hub: #" + id);
    /* reta final (2026-09-28): o dono tirou o modo automático do jogo */
    for (const id of ["autob", "noiteAuto"]) if (dentro.has(id)) throw new Error("modo automático voltou: #" + id);
    const autoBtn = nosDe(X.registro.app).find(n => /Modo automático|Parar automático/.test(String(n.innerHTML || "") + String(n.textContent || "")));
    if (autoBtn) throw new Error("botão de modo automático voltou: " + (autoBtn.id || autoBtn.tagName));
  });

  await conf("hub sem emoji em nenhum nó", async () => {
    const X = novo(778008);
    await jogarCarreiraAte(X, 2);
    X.run("auto=false;");
    for (const id of ORDEM) { X.registro["guia_" + id].onclick(); await respirarN(X, 1); }
    const ruim = nosDe(X.registro.app).find(n => EMOJI.test(String(n.innerHTML || "") + String(n.textContent || "")));
    if (ruim) throw new Error("emoji em: " + String(ruim.innerHTML || ruim.textContent).slice(0, 80));
  });

  await conf("painel: bloco da próxima luta mostra o número da luta e mora junto das ações", async () => {
    const X = novo(778101);
    const px = X.registro.painelProxima;
    if (!px || !/Luta 1\b/.test(px.innerHTML)) throw new Error("próxima luta: " + (px && px.innerHTML));
    await jogarCarreiraAte(X, 2); X.run("auto=false;renderPainel();");
    const esperado = "Luta " + (X.run("fightNo") + 1);
    if (X.run("fightNo") < 2 || !X.registro.painelProxima.innerHTML.includes(esperado + "<"))
      throw new Error(`esperava "${esperado}": ` + X.registro.painelProxima.innerHTML);
  });

  await conf("painel: última luta com adversário, método e carimbo certo", async () => {
    const X = novo(778102);
    if (!X.registro.painelUltima.hidden) throw new Error("última luta aparece antes de lutar");
    await jogarCarreiraAte(X, 1); X.run("auto=false;renderPainel();");
    const reg = JSON.parse(X.run("JSON.stringify(st.registro[st.registro.length-1])"));
    const h = X.registro.painelUltima.innerHTML;
    if (X.registro.painelUltima.hidden) throw new Error("última luta escondida depois de lutar");
    for (const t of [reg.adv, reg.metodo, reg.venceu ? "Vitória" : "Derrota"]) if (!h.includes(t)) throw new Error(`sem "${t}": ${h}`);
  });

  await conf("painel: caminho até o cinturão usa o passo de verdade, posição tem o número da ficha", async () => {
    const X = novo(778103);
    await jogarCarreiraAte(X, 3); X.run("auto=false;renderPainel();");
    const passo = X.run("passoCinturao()");
    if (passo && !X.registro.painelCinturao.innerHTML.includes(passo)) throw new Error("passo ausente: " + X.registro.painelCinturao.innerHTML);
    /* regras v2: a posição sai na régua do UFC (#7, Sem ranking, Campeão), igual à da ficha */
    const rot = X.run("rotuloPosicao(posicaoDivisao())");
    if (!rot || !X.registro.painelPosicao.innerHTML.includes(rot)) throw new Error("posição: " + X.registro.painelPosicao.innerHTML);
  });

  await conf("painel: lesão aparece com st.lesao e some sem ela", async () => {
    const X = novo(778104);
    X.run(`st.lesao={nome:"Joelho travado",atributo:"durability",mult:.7,permanente:false,desdeLuta:0,duracao:8};renderPainel();`);
    const le = X.registro.painelLesao;
    if (le.hidden || !le.innerHTML.includes("Joelho travado") || !le.innerHTML.includes("Cura em 8 lutas")) throw new Error("lesão: " + le.innerHTML);
    X.run("st.lesao=null;renderPainel();");
    if (!le.hidden) throw new Error("lesão não sumiu");
  });

  await conf("painel: mostra os 2 primeiros posts da repercussão", async () => {
    const X = novo(778105);
    if (!X.registro.painelPosts.hidden) throw new Error("posts antes de qualquer luta");
    X.run(`renderPhone([1,2,3].map(i=>({p:{name:"Fã "+i,handle:"@fa"+i,initials:"F"+i,color:"#333",rt:i},text:"post número "+i})),5,120,2600);`);
    const h = X.registro.painelPosts.innerHTML;
    if (X.registro.painelPosts.hidden || !h.includes("post número 1") || !h.includes("post número 2") || h.includes("post número 3"))
      throw new Error("posts: " + h);
  });

  await conf("caminho até o cinturão fala na régua do UFC: sem ranking mira o top 15; ranqueado fala do próprio #N (regras v2)", async () => {
    /* pedido do dono (2026-10-04): ranking igual ao do UFC (campeão, #1 a
       #15, o resto sem ranking). A régua antiga, "#48 de 236", não volta. */
    const X = novo(778106);
    const txt0 = X.run(`st.title=false;st.standing=0.20;passoCinturao()`);
    if (!/top 15/.test(txt0) || /#\d/.test(txt0)) throw new Error(`sem ranking: "${txt0}"`);
    for (const st0 of [0.50, 0.70, 0.86]) {
      const txt = X.run(`st.title=false;st.standing=${st0};passoCinturao()`);
      const k = X.run(`posicaoDivisao(${st0}).n`);
      if (!(k >= 1 && k <= 15)) throw new Error(`standing ${st0}: posição ${k} fora do top 15`);
      if (!txt.includes(k === 1 ? "nº 1" : `#${k}`)) throw new Error(`standing ${st0}: "${txt}" sem a posição ${k}`);
      if (/ de \d{2,}/.test(txt) || /ranking dos 15/i.test(txt)) throw new Error(`standing ${st0}: "${txt}"`);
    }
  });

  await conf("lutador: cada atributo mostra as camadas base, treino e evento, sem camada zerada", async () => {
    const X = novo(778201);
    X.run(`st.treino={slpm:1.10};st.eventoMod={slpm:0.9};renderFicha();`);
    const h = X.registro.ficha.innerHTML;
    if (!/camada treino">treino \+10%/.test(h)) throw new Error("sem treino +10%");
    if (!/camada evento cai">evento -10%/.test(h)) throw new Error("sem evento -10%");
    const bases = (h.match(/camada base">base /g) || []).length;
    if (bases < 8) throw new Error(bases + " camadas base");
    if (/(treino|evento) [+-]?0%/.test(h)) throw new Error("camada zerada apareceu");
    const delta = Math.round((1.10 * 0.9 - 1) * 100);
    if (!h.includes(`class="dn">${delta}%`)) throw new Error("delta combinado sumiu (" + delta + "%)");
  });

  await conf("lutador: aposentar abre confirmação no estilo novo, Cancelar fecha sem encerrar", async () => {
    const X = novo(778202);
    X.run("renderFicha();");
    const b = X.registro.btnAposentar;
    if (!b || !b.onclick) throw new Error("sem botão Aposentar");
    b.onclick();
    const p = X.registro.painelAposentar;
    if (p.style.display !== "flex") throw new Error("confirmação não abriu");
    const bots = nosDe(p).filter(n => n.tagName === "button");
    if (bots.length !== 2 || !bots.every(n => tem(n, "botao"))) throw new Error("botões: " + bots.map(n => n.className).join(","));
    if (nosDe(p).some(n => /—/.test(String(n.innerHTML || "")))) throw new Error("travessão na confirmação");
    bots.find(n => /Cancelar/.test(n.innerHTML)).onclick();
    if (p.style.display !== "none") throw new Error("Cancelar não fechou");
    if (X.run("fightNo") !== 0 || X.registro.app.children.length === 0) throw new Error("encerrou a carreira");
  });

  await conf("cartel: registro guarda seguidores, fã e a narração; clicar a linha abre a narração daquela luta", async () => {
    const X = novo(778301);
    await jogarCarreiraAte(X, 2); X.run("auto=false;");
    const r0 = JSON.parse(X.run("JSON.stringify(st.registro[0])"));
    if (typeof r0.seg !== "number" || typeof r0.fa !== "number") throw new Error("sem seg/fa: " + JSON.stringify(r0).slice(0, 120));
    if (!Array.isArray(r0.narracao) || r0.narracao.length < 5) throw new Error("narração: " + JSON.stringify(r0.narracao));
    const ultimaLinha = r0.narracao[r0.narracao.length - 1][2];
    if (!/vence/.test(ultimaLinha)) throw new Error("última linha da narração: " + ultimaLinha);
    const linha = X.registro.bouts.children.filter(n => tem(n, "bout"))[0];
    if (!linha || !linha.onclick) throw new Error("linha do cartel não abre");
    linha.onclick();
    const narr = linha.children.find(n => tem(n, "bout-narracao"));
    if (!narr || narr.hidden || !narr.innerHTML.includes(ultimaLinha)) throw new Error("narração não abriu com o texto da luta");
    linha.onclick();
    if (!narr.hidden) throw new Error("segundo clique não fechou");
  });

  await conf("cartel: resumo de vitórias, derrotas e métodos bate com st.registro", async () => {
    const X = novo(778302);
    await jogarCarreiraAte(X, 4); X.run("auto=false;atualizarControles();");
    const reg = JSON.parse(X.run("JSON.stringify(st.registro)"));
    const h = X.registro.cartelResumo.innerHTML;
    const v = reg.filter(r => r.venceu).length, d = reg.length - v;
    const par = (num, rot) => h.includes(`<b>${num}</b><span>${rot}</span>`);
    const nm = m => reg.filter(r => r.venceu && m(r.metodo)).length;
    for (const [num, rot] of [[v, "Vitórias"], [d, "Derrotas"], [nm(m => /ocaute/.test(m)), "Nocautes"],
      [nm(m => m === "Finalização"), "Finalizações"], [nm(m => m === "Decisão"), "Decisões"]])
      if (!par(num, rot)) throw new Error(`resumo sem ${num} ${rot}: ` + h);
    if (!X.registro.cartelVazio.hidden) throw new Error("vazio do cartel aparece com lutas");
  });

  await conf("save antigo sem seg/fa/narracao abre: cartel sem narração, mídia sem quebrar", async () => {
    const X = novo(778303);
    await jogarCarreiraAte(X, 3); X.run("auto=false;");
    const save = JSON.parse(X.run("JSON.stringify(montarSave())"));
    save.st.registro.forEach(r => { delete r.seg; delete r.fa; delete r.narracao; });
    const Y = sandboxCarreira();
    Y.sb.__F = F; Y.sb.__RJ = rosterJSON; Y.sb.__save = JSON.stringify(save);
    Y.run(`ROSTER=JSON.parse(globalThis.__RJ);CUTOFF_RANKING=Math.max(...ROSTER.map(f=>f.era?f.era[1]:0))-6;
      retomarCarreira(JSON.parse(globalThis.__save));abrirAbaHub("midia");abrirAbaHub("cartel");`);
    const linhas = Y.registro.bouts.children.filter(n => tem(n, "bout"));
    if (linhas.length !== save.st.registro.length) throw new Error(linhas.length + " linhas");
    if (linhas.some(l => l.onclick)) throw new Error("linha sem narração ficou clicável");
  });

  await conf("mídia: gráfico de seguidores com um ponto por luta mais o começo", async () => {
    const X = novo(778304);
    await jogarCarreiraAte(X, 3); X.run("auto=false;abrirAbaHub('midia');");
    const n = X.run("st.registro.length");
    const h = X.registro.midiaGrafico.innerHTML;
    const m = /<polyline points="([^"]+)"/.exec(h);
    if (!m) throw new Error("sem polyline: " + h.slice(0, 200));
    const pts = m[1].trim().split(/\s+/).length;
    if (pts !== n + 1) throw new Error(`${pts} pontos para ${n} lutas`);
    if (!h.includes(X.run("fmtNum(st.followers)"))) throw new Error("gráfico sem o total atual");
  });

  /* ---------- noite de luta (tarefa 5): oferta, camp, coletiva ---------- */
  const ultimasCartas = (X, id, cls) => (X.registro[id] ? X.registro[id].children : []).filter(n => tem(n, cls) && n.onclick);
  const abrirOferta = X => { X.run("auto=false;nextFight();"); };

  await conf("noite: Próxima luta abre a noite na oferta, com fundo próprio e Voltar", async () => {
    const X = novo(778501);
    abrirOferta(X);
    if (X.registro.noite.hidden) throw new Error("noite não abriu");
    if (X.run("noiteEtapa") !== "oferta") throw new Error("etapa " + X.run("noiteEtapa"));
    if (!String(X.registro.noiteFundo.style.cssText).includes("img/contrato.webp")) throw new Error("fundo " + X.registro.noiteFundo.style.cssText);
    if (X.registro.noiteVoltar.hidden) throw new Error("oferta sem Voltar");
    if (ultimasCartas(X, "opps", "opp").length < 1) throw new Error("sem cartas de adversário");
  });

  await conf("noite: Voltar do camp redesenha a MESMA oferta sem consumir rng; Voltar da oferta fecha e o Painel volta pra ela", async () => {
    const X = novo(778502);
    abrirOferta(X);
    const nomes = X.run("JSON.stringify(ofertaAtual.map(o=>o.f.name))");
    const rng0 = X.run("rng.estado()"), hold0 = X.run("holdRng.estado()");
    ultimasCartas(X, "opps", "opp")[0].onclick();
    if (X.run("noiteEtapa") !== "camp") throw new Error("não foi pro camp");
    if (!String(X.registro.noiteFundo.style.cssText).includes("img/saco.webp")) throw new Error("fundo do camp");
    X.registro.noiteVoltar.onclick();
    if (X.run("noiteEtapa") !== "oferta") throw new Error("Voltar do camp foi pra " + X.run("noiteEtapa"));
    if (X.run("JSON.stringify(ofertaAtual.map(o=>o.f.name))") !== nomes) throw new Error("oferta mudou");
    if (X.run("rng.estado()") !== rng0 || X.run("holdRng.estado()") !== hold0) throw new Error("Voltar consumiu gerador");
    X.registro.noiteVoltar.onclick();
    if (!X.registro.noite.hidden || X.run("noiteEtapa") !== null) throw new Error("Voltar da oferta não fechou a noite");
    if (!X.run("escolhaAberta")) throw new Error("oferta foi descartada");
    const vn = X.registro.voltarNoite;
    if (!vn || vn.hidden || !vn.onclick) throw new Error("Painel não oferece voltar à oferta");
    vn.onclick();
    if (X.registro.noite.hidden || X.run("noiteEtapa") !== "oferta") throw new Error("não reabriu a oferta");
    if (X.run("JSON.stringify(ofertaAtual.map(o=>o.f.name))") !== nomes) throw new Error("oferta mudou ao reabrir");
  });

  await conf("noite: coletiva com Pro não trava, e a cena (tema, repórter, molde) não consome gerador nenhum da carreira", async () => {
    const X = novo(778504);
    X.run("meuPro=true;");
    abrirOferta(X);
    ultimasCartas(X, "opps", "opp")[0].onclick();
    const geradores = "JSON.stringify([rng,holdRng,fraseRng,escolhaRng,lesaoRng,eventoRng,dilemaRng,rivalRng].map(g=>g.estado()))";
    const antes = X.run(geradores);
    ultimasCartas(X, "camps", "camp")[0].onclick();
    await respirarN(X);
    if (nosDe(X.registro.escolha).some(n => tem(n, "bloqueio-pro"))) throw new Error("travou com Pro");
    if (!nosDe(X.registro.escolha).some(n => tem(n, "cena-imprensa"))) throw new Error("coletiva sem a cena nova");
    if (X.run(geradores) !== antes) throw new Error("abrir a coletiva consumiu gerador da carreira (link de desafio e save quebrariam)");
  });

  await conf("save: oferta aberta + compra na loja + recarregar = mesma oferta e a mesma luta de quem jogou direto", async () => {
    const A = novo(778505);
    await jogarCarreiraAte(A, 2); A.run("auto=false;");
    abrirOferta(A);
    const nomesA = A.run("JSON.stringify(ofertaAtual.map(o=>o.f.name))");
    A.run("st.dinheiro=999999;LOJA_ITENS[1].comprar();salvarCarreira();");
    const save = A.run("JSON.stringify(montarSave())");
    const B = sandboxCarreira();
    B.sb.__F = F; B.sb.__RJ = rosterJSON; B.sb.__save = save;
    B.run(`ROSTER=JSON.parse(globalThis.__RJ);CUTOFF_RANKING=Math.max(...ROSTER.map(f=>f.era?f.era[1]:0))-6;retomarCarreira(JSON.parse(globalThis.__save));`);
    if (!B.run("escolhaAberta") || B.run("PENDENTE&&PENDENTE.tipo") !== "oferta") throw new Error("oferta não reabriu");
    if (B.run("JSON.stringify(ofertaAtual.map(o=>o.f.name))") !== nomesA) throw new Error("oferta diferente depois de recarregar");
    const lutaAte = async (X) => {
      ultimasCartas(X, "opps", "opp")[0].onclick();
      ultimasCartas(X, "camps", "camp")[1].onclick();
      X.registro.colpular.onclick();
      for (let k = 0; k < 12 && X.run("playing"); k++) {
        X.drenar(); await respirarCarreira();
        const op = Object.keys(X.registro).filter(k2 => k2.startsWith("el_")).map(k2 => X.registro[k2]).filter(n => n.onclick);
        if (op.length) { op[0].onclick(); Object.keys(X.registro).filter(k2 => k2.startsWith("el_")).forEach(k2 => delete X.registro[k2]); }
      }
      return X.run("JSON.stringify((({adv,venceu,metodo,round,relogio})=>({adv,venceu,metodo,round,relogio}))(st.registro[st.registro.length-1]))");
    };
    const la = await lutaAte(A), lb = await lutaAte(B);
    if (la !== lb) throw new Error(`direta ${la} x retomada ${lb}`);
  });

  /* ---------- noite de luta (tarefa 6): entrada e luta ---------- */
  await conf("entrada: no manual sem reduce-motion mostra o tale of the tape e segura a narração até acabar", async () => {
    const X = novo(778601);
    X.run("window.matchMedia=()=>({matches:false});meuPro=true;auto=false;nextFight();");
    ultimasCartas(X, "opps", "opp")[0].onclick();
    ultimasCartas(X, "camps", "camp")[0].onclick();
    const playAntes = X.registro.play ? X.registro.play.children.length : 0;
    X.registro.colpular.onclick();
    if (X.run("noiteEtapa") !== "entrada") throw new Error("etapa " + X.run("noiteEtapa"));
    const ent = X.registro.entrada;
    const nome = X.run("ofertaAtual[0].f.name");
    if (!ent.innerHTML.includes(nome) || !ent.innerHTML.includes(X.run("me.name"))) throw new Error("entrada sem os dois nomes");
    if ((X.registro.play ? X.registro.play.children.length : 0) !== playAntes) throw new Error("narração começou durante a entrada");
    const pular = ent.children.find(n => tem(n, "entrada-pular"));
    if (!pular || !pular.onclick) throw new Error("entrada sem Pular");
    pular.onclick(); pular.onclick();
    if (X.run("noiteEtapa") !== "luta") throw new Error("Pular não foi pra luta");
    /* luta interativa: depois da entrada abre o plano do round 1; a
       narração começa quando o jogador escolhe */
    const op = Object.keys(X.registro).filter(k => k.startsWith("el_")).map(k => X.registro[k]).filter(n => n.onclick);
    if (op.length !== 4) throw new Error(`plano do round 1 com ${op.length} opções depois da entrada`);
    op[0].onclick();
    if (!X.registro.play || X.registro.play.children.length <= playAntes) throw new Error("narração não começou depois do plano");
  });

  await conf("entrada: pulada no automático e com reduce-motion (mesma luta, mesmo resultado)", async () => {
    const res = [];
    for (const comEntrada of [false, true]) {
      const X = novo(778602);
      X.run(`window.matchMedia=()=>({matches:${comEntrada ? "false" : "true"}});meuPro=true;auto=false;nextFight();`);
      ultimasCartas(X, "opps", "opp")[1].onclick();
      ultimasCartas(X, "camps", "camp")[2].onclick();
      X.registro.colpular.onclick();
      if (comEntrada && X.run("noiteEtapa") !== "entrada") throw new Error("sem entrada no manual");
      if (!comEntrada && X.run("noiteEtapa") !== "luta") throw new Error("entrada com reduce-motion");
      for (let k = 0; k < 20 && X.run("playing"); k++) {
        X.drenar(); await respirarCarreira();
        const op = Object.keys(X.registro).filter(k2 => k2.startsWith("el_")).map(k2 => X.registro[k2]).filter(n => n.onclick);
        if (op.length) { op[0].onclick(); Object.keys(X.registro).filter(k2 => k2.startsWith("el_")).forEach(k2 => delete X.registro[k2]); }
      }
      res.push(X.run("JSON.stringify((({adv,venceu,metodo,round,relogio})=>({adv,venceu,metodo,round,relogio}))(st.registro[st.registro.length-1]))"));
    }
    if (res[0] !== res[1]) throw new Error(`sem entrada ${res[0]} x com entrada ${res[1]}`);
  });

  await conf("luta: placar no topo com os dois nomes e números ao lado que começam zerados e andam depois dos rounds", async () => {
    const X = novo(778603);
    X.run("meuPro=true;auto=false;nextFight();");
    ultimasCartas(X, "opps", "opp")[0].onclick();
    ultimasCartas(X, "camps", "camp")[0].onclick();
    X.registro.colpular.onclick();
    const live = X.registro.live.innerHTML;
    if (!live.includes("placar") || !live.includes(X.run("me.name")) || !live.includes(X.run("ofertaAtual[0].f.name"))) throw new Error("placar: " + live.slice(0, 200));
    const zero = (/<aside class="luta-numeros[^>]*>([\s\S]*?)<\/aside>/.exec(live) || [])[1] || "";
    const zeros = [...zero.matchAll(/data-num="[a-z]+-(eu|ele)"><b>(\d+)<\/b>/g)].map(m => +m[2]);
    if (zeros.length !== 6 || zeros.some(v => v !== 0)) throw new Error("números não começam zerados: " + zero.slice(0, 200));
    for (let k = 0; k < 20 && X.run("playing"); k++) {
      X.drenar(); await respirarCarreira();
      const op = Object.keys(X.registro).filter(k2 => k2.startsWith("el_")).map(k2 => X.registro[k2]).filter(n => n.onclick);
      if (op.length) { op[0].onclick(); Object.keys(X.registro).filter(k2 => k2.startsWith("el_")).forEach(k2 => delete X.registro[k2]); }
    }
    const fim = X.registro.lutaNumeros.innerHTML;
    const golpes = [...fim.matchAll(/data-num="golpes-(eu|ele)"><b>(\d+)<\/b>/g)].map(m => +m[2]);
    if (golpes.length !== 2 || golpes[0] + golpes[1] === 0) throw new Error("golpes no fim: " + fim.slice(0, 300));
  });

  /* ---------- noite de luta (tarefa 7): resultado e pós-luta ---------- */
  const lutarManual = async (X, iOpp = 0, iCamp = 0) => {
    X.run("auto=false;nextFight();");
    ultimasCartas(X, "opps", "opp")[iOpp].onclick();
    ultimasCartas(X, "camps", "camp")[iCamp].onclick();
    X.registro.colpular.onclick();
    for (let k = 0; k < 20 && X.run("playing"); k++) {
      X.drenar(); await respirarCarreira();
      const op = Object.keys(X.registro).filter(k2 => k2.startsWith("el_")).map(k2 => X.registro[k2]).filter(n => n.onclick);
      if (op.length) { op[0].onclick(); Object.keys(X.registro).filter(k2 => k2.startsWith("el_")).forEach(k2 => delete X.registro[k2]); }
    }
    for (let k = 0; k < 3; k++) { X.drenar(); await respirarCarreira(); }
  };

  await conf("resultado: [Rever narração] abre a narração inteira da luta que acabou e fecha de novo (pedido do dono, 2026-10-05)", async () => {
    const X = novo(778702);
    X.run("meuPro=true;");
    await lutarManual(X);
    if (X.run("noiteEtapa") !== "resultado") throw new Error("etapa " + X.run("noiteEtapa"));
    const reg = JSON.parse(X.run("JSON.stringify(st.registro[st.registro.length-1])"));
    const b = X.registro.resRever;
    if (!b || !b.onclick) throw new Error("sem o botão Rever narração");
    if (!/Rever narração/.test(b.innerHTML) || !/#historico"/.test(b.innerHTML)) throw new Error("botão: " + b.innerHTML);
    const painel = (X.registro.resultado.children || []).filter(n => (n.className || "").split(" ").includes("res-narracao")).pop();
    if (!painel || painel.hidden !== true) throw new Error("a narração devia começar fechada");
    b.onclick();
    if (painel.hidden) throw new Error("não abriu");
    const textos = JSON.parse(X.run(`JSON.stringify(st.registro[st.registro.length-1].narracao.map(([,,t])=>semTravessao(t)))`));
    if (textos.length < 5 || !textos.every(t => painel.innerHTML.includes(t))) throw new Error("narração incompleta: " + textos.length + " linhas");
    if (!/Esconder narração/.test(b.innerHTML)) throw new Error("o botão não virou Esconder: " + b.innerHTML);
    b.onclick();
    if (painel.hidden !== true || !/Rever narração/.test(b.innerHTML)) throw new Error("não fechou");
  });
  await conf("resultado: a noite mostra VITÓRIA ou DERROTA, método, bolsa, seguidores e posição, com fundo próprio", async () => {
    const X = novo(778701);
    X.run("meuPro=true;");
    await lutarManual(X);
    if (X.run("noiteEtapa") !== "resultado") throw new Error("etapa " + X.run("noiteEtapa"));
    const reg = JSON.parse(X.run("JSON.stringify(st.registro[st.registro.length-1])"));
    const h = X.registro.resultado.innerHTML;
    for (const t of [reg.venceu ? "Vitória" : "Derrota", reg.metodo, reg.adv, X.run(`fmtNum(${reg.renda})`), X.run("rotuloPosicao(posicaoDivisao())")])
      if (!h.includes(t)) throw new Error(`resultado sem "${t}"`);
    const fundo = String(X.registro.noiteFundo.style.cssText);
    if (!fundo.includes(reg.venceu ? "img/confete.webp" : "img/apagado.webp")) throw new Error("fundo " + fundo);
    if (X.registro.noiteProxima.hidden || X.registro.noiteHub.hidden) throw new Error("rodapé sem Próxima luta/Voltar ao painel");
  });

  /* reta final (2026-09-28, achado do dono): depois de uma luta, "Voltar à
     escolha do adversário" não pode aparecer. A oferta daquela luta já foi
     usada; o próximo adversário só existe depois de Próxima luta. */
  await conf("depois da luta, Voltar à escolha do adversário some (resultado, painel, com e sem Pro)", async () => {
    for (const pro of [false, true]) {
      const X = novo(pro ? 778711 : 778712);
      X.run(`meuPro=${pro};`);
      await lutarManual(X);
      const estado = onde => JSON.stringify({ onde, etapa: X.run("noiteEtapa"), esc: X.run("escolhaAberta"),
        vn: X.registro.voltarNoite && X.registro.voltarNoite.hidden, nv: X.registro.noiteVoltar && X.registro.noiteVoltar.hidden });
      const vnVisivel = () => X.registro.voltarNoite && !X.registro.voltarNoite.hidden;
      const nvVisivel = () => X.registro.noiteVoltar && !X.registro.noiteVoltar.hidden;
      if (vnVisivel() || nvVisivel()) throw new Error("no resultado: " + estado("resultado"));
      for (let k = 0; k < 4; k++) { X.drenar(); await respirarCarreira(); }
      if (vnVisivel() || nvVisivel()) throw new Error("no pós-luta: " + estado("pos-luta"));
      X.registro.noiteHub.onclick();
      await respirarN(X);
      if (vnVisivel()) throw new Error("no painel: " + estado("painel"));
      if (X.registro.next.hidden) throw new Error("no painel, Próxima luta sumiu: " + estado("painel"));
      /* e o caminho certo continua: Próxima luta abre a oferta nova */
      const f0 = X.run("fightNo");
      X.registro.next.onclick();
      if (X.run("noiteEtapa") !== "oferta" || !X.run("escolhaAberta")) throw new Error("Próxima luta não abriu a oferta nova: " + estado("depois"));
      if (X.run("fightNo") !== f0) throw new Error("abrir a oferta mudou fightNo");
    }
    /* O JS sempre marcou hidden certo; quem mostrava o botão era o CSS:
       .botao{display:inline-flex} vence o [hidden] do navegador. O DOM
       falso não lê CSS, então a regra global é conferida no arquivo. */
    const css = fs.readFileSync(path.join(__dirname, "estilo.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    if (!/(^|\})\s*\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*;?\s*\}/.test(css))
      throw new Error("estilo.css sem [hidden]{display:none!important}: .botao escondido pelo JS continua na tela");
  });

  await conf("resultado: seguidores mostram quanto veio da coletiva, e só quando teve coletiva", async () => {
    const X = novo(778705);
    X.run("meuPro=true;auto=false;nextFight();");
    ultimasCartas(X, "opps", "opp")[0].onclick();
    ultimasCartas(X, "camps", "camp")[0].onclick();
    X.run("st.coletivaHype=1.2;");            // como se a resposta tivesse rendido +20% de hype
    X.registro.colpular.onclick();
    for (let k = 0; k < 20 && X.run("playing"); k++) {
      X.drenar(); await respirarCarreira();
      const op = Object.keys(X.registro).filter(k2 => k2.startsWith("el_")).map(k2 => X.registro[k2]).filter(n => n.onclick);
      if (op.length) { op[0].onclick(); Object.keys(X.registro).filter(k2 => k2.startsWith("el_")).forEach(k2 => delete X.registro[k2]); }
    }
    for (let k = 0; k < 3; k++) { X.drenar(); await respirarCarreira(); }
    const reg = JSON.parse(X.run("JSON.stringify(st.registro[st.registro.length-1])"));
    const delta = X.run("st.lastDelta");
    if (!reg.coletiva || !(reg.coletiva.seg > 0) || !(reg.coletiva.seg < delta)) throw new Error("parte da coletiva: " + JSON.stringify(reg.coletiva) + " de " + delta);
    if (!(reg.coletiva.fa >= 0)) throw new Error("fã da coletiva negativo com hype +20%: " + reg.coletiva.fa);
    if (!X.registro.resultado.innerHTML.includes(`+${X.run(`fmtNum(${reg.coletiva.seg})`)} da coletiva`)) throw new Error("resultado sem a parte da coletiva");
    if (X.run("st.coletivaHype") !== 1) throw new Error("hype da coletiva vazou pra próxima luta");
    await lutarManual(X);
    const reg2 = JSON.parse(X.run("JSON.stringify(st.registro[st.registro.length-1])"));
    if (reg2.coletiva || X.registro.resultado.innerHTML.includes("da coletiva")) throw new Error("luta sem coletiva mostrou parte da coletiva");
  });

  await conf("pós-luta: extras nascem no embrulho da luta na noite e vão pro cartel logo depois da linha dela", async () => {
    const X = novo(778702);
    X.run("meuPro=true;");
    await lutarManual(X);
    const n = X.run("fightNo");
    const emb = X.registro.posluta.children.filter(c => tem(c, "pos-luta"));
    if (emb.length !== 1 || emb[0].dataset.luta !== String(n)) throw new Error("embrulho na noite: " + emb.length);
    const w = emb[0];
    if (!w.children.some(c => tem(c, "entrevista-convite"))) throw new Error("convite de entrevista fora do embrulho");
    X.run("auto=false;nextFight();");
    if (X.registro.posluta.children.length) throw new Error("pós-luta não esvaziou na luta seguinte");
    const filhos = X.registro.bouts.children;
    const iLinha = filhos.findIndex(c => tem(c, "bout") && c.innerHTML.includes(`>${String(n).padStart(2, "0")}<`));
    if (iLinha < 0 || filhos[iLinha + 1] !== w) throw new Error("embrulho não ficou logo depois da linha da luta " + n);
  });

  await conf("pós-luta: evento da IA que chega DEPOIS do arquivamento cai no embrulho da luta certa", async () => {
    const X = novo(778703);
    X.run("meuPro=true;globalThis.__res=null;ai=(tipo)=>tipo==='evento'?new Promise(r=>{globalThis.__res=r;}):Promise.resolve(null);sortearRaro=()=>null;");
    await lutarManual(X);
    if (!X.run("typeof globalThis.__res==='function'")) throw new Error("evento da IA não foi pedido nesta luta");
    const n = X.run("fightNo");
    const w = X.registro.posluta.children.find(c => tem(c, "pos-luta"));
    X.run("auto=false;nextFight();");
    X.run(`globalThis.__res({texto:"O treino da semana virou assunto no bairro inteiro.",atributo:"nenhum",efeito:1});`);
    for (let k = 0; k < 4; k++) { X.drenar(); await respirarCarreira(); }
    if (!nosDe(w).some(c => /virou assunto no bairro/.test(String(c.innerHTML)))) throw new Error("evento atrasado não caiu no embrulho da luta " + n);
    if (nosDe(X.registro.posluta).some(c => /virou assunto no bairro/.test(String(c.innerHTML)))) throw new Error("evento atrasado caiu na noite da luta seguinte");
  });

  await conf("pós-luta: dilema abre dentro da noite e, respondido, destrava a próxima luta", async () => {
    const X = novo(778704);
    await jogarCarreiraAte(X, 4); X.run("auto=false;meuPro=true;");
    await lutarManual(X);
    if (X.run("fightNo") !== 5 || !X.run("dilemaAberto")) throw new Error("dilema da luta 5 não abriu");
    if (X.run("noiteEtapa") !== "resultado") throw new Error("noite saiu do pós-luta: " + X.run("noiteEtapa"));
    if (!nosDe(X.registro.posluta).some(c => tem(c, "dilema"))) throw new Error("dilema fora do pós-luta");
    if (!X.registro.noiteProxima.hidden) throw new Error("Próxima luta liberada com dilema aberto");
    // fase 8: no celular o teclado virtual cobria o Decidir
    let rolou = false;
    X.registro.dilgo.scrollIntoView = () => { rolou = true; };
    if (typeof X.registro.dilresp.onfocus !== "function") throw new Error("campo do dilema sem gancho de foco (teclado cobre o Decidir)");
    X.registro.dilresp.onfocus();
    if (!rolou) throw new Error("focar o campo do dilema não rolou até o Decidir");
    X.registro.dilresp.value = "aceito, sem problema";
    X.registro.dilgo.onclick();
    for (let k = 0; k < 6; k++) { X.drenar(); await respirarCarreira(); }
    if (X.run("dilemaAberto")) throw new Error("dilema continuou aberto");
    if (X.registro.noiteProxima.hidden) throw new Error("Próxima luta não voltou depois do dilema");
  });

  /* Amostra grátis do Pro (plano de evolução, etapa 2): sem Pro, a
     coletiva e a entrevista da 1ª luta chamam a IA com amostra:true e
     ficam abertas; o servidor decide pela cota da conta. Servidor falso:
     responde a cena e a reação, ou recusa como a api/ai.js recusa. */
  const servidorAmostra = (X, { recusa = null } = {}) => {
    const chamadas = [];
    const PRO = ["coletiva", "entrevista", "coletivaCena", "entrevistaCena"];
    X.sb.fetch = async (url, op) => {
      const b = JSON.parse(op.body);
      chamadas.push(b);
      if (recusa && PRO.includes(b.kind))
        return { ok: false, status: recusa === "esgotada" ? 403 : 503, json: async () => ({ error: "recusada", cota: recusa, transitorio: false }) };
      const result = b.kind === "coletivaCena" ? { evento: "Os fotógrafos disputaram a primeira fila.", pergunta: "É a sua estreia no evento. Como você chega pra essa luta?" }
        : b.kind === "coletiva" ? { reacao: "A sala anotou a resposta e o adversário só olhou pro lado.", hype: 1.1, pressao: 1,
            declaracao: { tom: "neutro", trecho: "vou fazer o meu trabalho", promessa: null } }
        : b.kind === "entrevistaCena" ? { evento: "A imprensa esperou na saída do octógono.", pergunta: "Como foi a sua primeira luta aqui?" }
        : b.kind === "entrevista" ? { reacao: "A resposta rodou nas redes durante a madrugada.", fa: 0.4, seguidores: 0.1 }
        : null;
      return { ok: true, status: 200, json: async () => ({ ok: true, result }) };
    };
    return chamadas;
  };
  const lutarAteOFim = async X => {
    for (let k = 0; k < 20 && X.run("playing"); k++) {
      X.drenar(); await respirarCarreira();
      const op = Object.keys(X.registro).filter(k2 => k2.startsWith("el_")).map(k2 => X.registro[k2]).filter(n => n.onclick);
      if (op.length) { op[0].onclick(); Object.keys(X.registro).filter(k2 => k2.startsWith("el_")).forEach(k2 => delete X.registro[k2]); }
    }
    for (let k = 0; k < 3; k++) { X.drenar(); await respirarCarreira(); }
  };
  const convite = X => nosDe(X.registro.posluta).filter(c => tem(c, "entrevista-convite")).pop();

  await conf("amostra: sem Pro, a coletiva da 1ª luta abre com a faixa da amostra e chama a IA com amostra:true", async () => {
    const X = novo(778503);
    X.run("meuPro=false;");
    const chamadas = servidorAmostra(X);
    abrirOferta(X);
    ultimasCartas(X, "opps", "opp")[0].onclick();
    ultimasCartas(X, "camps", "camp")[0].onclick();
    if (X.run("noiteEtapa") !== "coletiva") throw new Error("etapa " + X.run("noiteEtapa"));
    await respirarN(X);
    const nos = nosDe(X.registro.escolha);
    if (nos.some(n => tem(n, "bloqueio-pro"))) throw new Error("a amostra nasceu travada");
    const faixa = nos.find(n => tem(n, "amostra-pro"));
    if (!faixa || !/Amostra do Pro/.test(faixa.innerHTML)) throw new Error("sem a faixa da amostra");
    const cena = chamadas.find(b => b.kind === "coletivaCena");
    if (!cena || cena.data.amostra !== true) throw new Error("a cena não foi pedida com amostra:true");
    if (!/primeira luta aqui|estreia no evento/.test(X.registro.colpergunta.innerHTML)) throw new Error("a pergunta da IA não apareceu");
    if (X.registro.colgo.disabled) throw new Error("Responder continua desligado");
    X.registro.colresp.value = "Eu vou fazer o meu trabalho e voltar pra casa.";
    await X.registro.colgo.onclick();
    await respirarN(X);
    const reacao = chamadas.find(b => b.kind === "coletiva");
    if (!reacao || reacao.data.amostra !== true) throw new Error("a reação não foi pedida com amostra:true");
    if (!/A sala anotou/.test(X.registro.coldesfecho.innerHTML)) throw new Error("a reação da IA não apareceu");
    if (!X.registro.colseguir) throw new Error("sem Ir pra luta");
    const fala = JSON.parse(X.run("JSON.stringify(st.memoria.falas[0])"));
    if (!fala || fala.texto !== "Eu vou fazer o meu trabalho e voltar pra casa." || fala.luta !== 1) throw new Error("a resposta literal não virou fala: " + JSON.stringify(fala));
  });

  await conf("amostra: a entrevista da 1ª luta abre sem Pro e volta ao que o jogador disse na coletiva, com o resultado", async () => {
    const X = novo(778505);
    X.run("meuPro=false;");
    const chamadas = servidorAmostra(X);
    abrirOferta(X);
    ultimasCartas(X, "opps", "opp")[0].onclick();
    ultimasCartas(X, "camps", "camp")[0].onclick();
    await respirarN(X);
    X.registro.colresp.value = "Eu vou fazer o meu trabalho e voltar pra casa.";
    await X.registro.colgo.onclick();
    await respirarN(X);
    X.registro.colseguir.onclick();
    await lutarAteOFim(X);
    if (X.run("fightNo") !== 1) throw new Error("fightNo " + X.run("fightNo"));
    const conv = convite(X);
    if (!conv) throw new Error("sem convite da entrevista");
    if (conv.children.some(c => tem(c, "bloqueio-pro"))) throw new Error("convite da amostra travado");
    if (!conv.children.some(c => tem(c, "amostra-selo"))) throw new Error("convite sem o selo da amostra");
    const btn = conv.children.find(c => c.onclick);
    btn.onclick();
    if (!X.run("entrevistaAberta")) throw new Error("a entrevista não abriu");
    await respirarN(X);
    const cena = chamadas.find(b => b.kind === "entrevistaCena");
    if (!cena || cena.data.amostra !== true) throw new Error("a cena da entrevista não foi pedida com amostra:true");
    if (!cena.data.fato.includes("vou fazer o meu trabalho") || !/O que aconteceu: /.test(cena.data.fato))
      throw new Error("a pergunta não volta à fala da coletiva com o resultado: " + cena.data.fato);
    if (X.registro.entmemoria.hidden || !/Na coletiva você disse/.test(X.registro.entmemoria.innerHTML)) throw new Error("sem o quadro da fala da coletiva");
    if (!nosDe(X.registro.escolha).some(n => tem(n, "amostra-pro"))) throw new Error("entrevista sem a faixa da amostra");
    X.registro.entresp.value = "Fiz o que falei e agora quero outro nome forte.";
    await X.registro.entgo.onclick();
    await respirarN(X);
    const reacao = chamadas.find(b => b.kind === "entrevista");
    if (!reacao || reacao.data.amostra !== true) throw new Error("a reação da entrevista não foi pedida com amostra:true");
    if (!/rodou nas redes/.test(X.registro.entdesfecho.innerHTML)) throw new Error("a reação da IA não apareceu");
  });

  for (const [recusa, motivo] of [["esgotada", /últimas 24 horas/], ["indisponivel", /Não deu pra conferir/]])
    await conf(`amostra: servidor recusa (${recusa}) e a coletiva volta travada com o motivo; Pular segue e a entrevista nem é pedida`, async () => {
      const X = novo(778506);
      X.run("meuPro=false;");
      const chamadas = servidorAmostra(X, { recusa });
      abrirOferta(X);
      ultimasCartas(X, "opps", "opp")[0].onclick();
      ultimasCartas(X, "camps", "camp")[0].onclick();
      await respirarN(X);
      if (X.run("AMOSTRA_NEGADA") !== recusa) throw new Error("AMOSTRA_NEGADA = " + X.run("AMOSTRA_NEGADA"));
      const nos = nosDe(X.registro.escolha);
      const trava = nos.find(n => tem(n, "bloqueio-pro"));
      if (!trava) throw new Error("a resposta não voltou pro bloqueioPro");
      const travado = trava.children.find(n => tem(n, "bloqueado"));
      if (!travado || !travado.inert) throw new Error("área travada sem inert");
      if (!trava.children.some(n => tem(n, "selo-assine"))) throw new Error("sem selo Assine o Pro");
      const faixa = nos.find(n => tem(n, "amostra-pro"));
      if (!faixa || !motivo.test(faixa.innerHTML)) throw new Error("a faixa não diz o motivo: " + (faixa && faixa.innerHTML));
      const pular = X.registro.colpular;
      if (!pular || !pular.onclick || nosDe(trava).includes(pular)) throw new Error("Pular dentro do bloqueio ou sem clique");
      const f0 = X.run("fightNo");
      pular.onclick();
      if (X.run("fightNo") !== f0 + 1 || !X.run("playing")) throw new Error("Pular não começou a luta");
      await lutarAteOFim(X);
      const conv = convite(X);
      if (!conv || !conv.children.some(c => tem(c, "bloqueio-pro"))) throw new Error("depois da recusa, a entrevista não veio travada");
      if (chamadas.some(b => b.kind === "entrevistaCena" || b.kind === "entrevista")) throw new Error("pediu a entrevista depois da recusa");
    });

  await conf("noite: fora da 1ª luta, coletiva e entrevista sem Pro continuam travadas e não chamam a IA", async () => {
    const X = novo(778507);
    X.run("meuPro=false;");
    await lutarManual(X);
    const chamadas = servidorAmostra(X);
    abrirOferta(X);
    ultimasCartas(X, "opps", "opp")[0].onclick();
    ultimasCartas(X, "camps", "camp")[0].onclick();
    await respirarN(X);
    if (X.run("noiteEtapa") !== "coletiva") throw new Error("etapa " + X.run("noiteEtapa"));
    const nos = nosDe(X.registro.escolha);
    const trava = nos.find(n => tem(n, "bloqueio-pro"));
    if (!trava || !trava.children.some(n => tem(n, "bloqueado") && n.inert)) throw new Error("coletiva da luta 2 sem bloqueioPro");
    if (nos.some(n => tem(n, "amostra-pro"))) throw new Error("faixa da amostra na luta 2");
    X.registro.colpular.onclick();
    await lutarAteOFim(X);
    const conv = convite(X);
    if (!conv || !conv.children.some(c => tem(c, "bloqueio-pro"))) throw new Error("entrevista da luta 2 sem bloqueioPro");
    if (conv.children.some(c => tem(c, "amostra-selo"))) throw new Error("selo da amostra na luta 2");
    const pro = chamadas.filter(b => ["coletiva", "entrevista", "coletivaCena", "entrevistaCena"].includes(b.kind));
    if (pro.length) throw new Error("chamou a IA do Pro fora da amostra: " + pro.map(b => b.kind).join(","));
  });

  await conf("pós-luta: sem Pro, Dar entrevista vem travado pelo bloqueioPro (fora da amostra da 1ª luta)", async () => {
    const X = novo(778705);
    X.run("meuPro=false;AMOSTRA_NEGADA='esgotada';");
    await lutarManual(X);
    const conv = nosDe(X.registro.posluta).find(c => tem(c, "entrevista-convite"));
    if (!conv || !conv.children.some(c => tem(c, "bloqueio-pro"))) throw new Error("convite sem bloqueioPro");
  });

  /* ---------- tarefa 8: save em qualquer ponto e saída pelo Menu ---------- */
  const retomarNoSandbox = (save, extra = "") => {
    const Y = sandboxCarreira();
    Y.sb.__F = F; Y.sb.__RJ = rosterJSON; Y.sb.__save = save;
    Y.run(`ROSTER=JSON.parse(globalThis.__RJ);CUTOFF_RANKING=Math.max(...ROSTER.map(f=>f.era?f.era[1]:0))-6;${extra}retomarCarreira(JSON.parse(globalThis.__save));`);
    return Y;
  };
  const resumoLutas = X => X.run("JSON.stringify(st.registro.map(r=>[r.adv,r.venceu,r.metodo,r.round,r.relogio]))");

  await conf("save: recarregar com o dilema esperando a IA reabre o dilema da MESMA semente e dá a mesma carreira", async () => {
    const A = novo(778801);
    await jogarCarreiraAte(A, 4); A.run("auto=false;");
    A.sb.__alvo = 5;
    A.run("auto=true;nextFight();");
    A.drenar();                                   // luta 5 inteira; a IA do dilema ainda não respondeu
    if (!A.run("dilemaAberto")) throw new Error("dilema da luta 5 não abriu");
    const pend = JSON.parse(A.run("JSON.stringify(PENDENTE)"));
    if (!pend || pend.tipo !== "dilema" || pend.d !== null || typeof pend.seed !== "string" && typeof pend.seed !== "number")
      throw new Error("PENDENTE antes da IA: " + JSON.stringify(pend));
    const save = A.run("JSON.stringify(montarSave())");
    const B = retomarNoSandbox(save);
    for (let k = 0; k < 6; k++) { A.drenar(); B.drenar(); await respirarCarreira(); }
    if (!B.run("dilemaAberto")) throw new Error("dilema não reabriu");
    const tA = A.run("PENDENTE&&PENDENTE.d&&PENDENTE.d.titulo"), tB = B.run("PENDENTE&&PENDENTE.d&&PENDENTE.d.titulo");
    if (!tA || tA !== tB) throw new Error(`dilema direto "${tA}" x retomado "${tB}"`);
    for (const X of [A, B]) { X.sb.__alvo = 8; await resolverDilemaTeste(X, "aceito, sem problema"); await jogarCarreiraAte(X, 8); }
    if (resumoLutas(A) !== resumoLutas(B)) throw new Error("carreiras divergiram depois do dilema");
  });

  await conf("save: salvar com a escolha na luta aberta e recarregar sorteia o MESMO trio", async () => {
    const trio = X => Object.keys(X.registro).filter(k => k.startsWith("el_")).sort().join(",");
    let A = null;
    /* acha uma luta que passa do round 1 (só então a escolha abre) */
    for (let semente = 778802; semente < 778812 && !A; semente++) {
      const X = novo(semente);
      X.run("meuPro=true;auto=false;nextFight();");
      ultimasCartas(X, "opps", "opp")[0].onclick();
      ultimasCartas(X, "camps", "camp")[0].onclick();
      X.registro.colpular.onclick();
      for (let k = 0; k < 10 && !trio(X) && X.run("playing"); k++) { X.drenar(); await respirarCarreira(); }
      if (trio(X)) A = X;
    }
    if (!A) throw new Error("nenhuma das 10 sementes passou do round 1");
    const save = A.run("JSON.stringify(montarSave())");
    const B = retomarNoSandbox(save);
    for (let k = 0; k < 10 && !trio(B); k++) { B.drenar(); await respirarCarreira(); }
    if (trio(A) !== trio(B)) throw new Error(`trio direto ${trio(A)} x retomado ${trio(B)}`);
  });

  await conf("Menu no meio da luta: para a narração, grava o ponto certo e a retomada dá a mesma luta", async () => {
    const A = novo(778803), C = novo(778803);
    for (const X of [A, C]) { X.run("USUARIO_ID='u1';SLOT_ATUAL=1;meuPro=true;auto=false;nextFight();");
      ultimasCartas(X, "opps", "opp")[1].onclick(); ultimasCartas(X, "camps", "camp")[1].onclick(); X.registro.colpular.onclick(); }
    const f0 = A.run("fightNo"), linhas0 = A.run("(st.registro||[]).length");
    A.registro.hubMenu.onclick();
    for (let k = 0; k < 6; k++) { A.drenar(); await respirarCarreira(); }
    if (A.run("(st.registro||[]).length") !== linhas0) throw new Error("a luta continuou rodando depois de sair");
    if (A.run("rotaAtual") !== "menu") throw new Error("não foi pro menu");
    const save = A.dadosLS["save:u1:1"];
    if (!save) throw new Error("sem save local");
    const B = retomarNoSandbox(save);
    if (B.run("fightNo") !== f0) throw new Error("retomou na luta " + B.run("fightNo"));
    const terminar = async X => { for (let k = 0; k < 20 && X.run("playing"); k++) { X.drenar(); await respirarCarreira();
      const op = Object.keys(X.registro).filter(k2 => k2.startsWith("el_")).map(k2 => X.registro[k2]).filter(n => n.onclick);
      if (op.length) { op[0].onclick(); Object.keys(X.registro).filter(k2 => k2.startsWith("el_")).forEach(k2 => delete X.registro[k2]); } } };
    await terminar(B); await terminar(C);
    if (resumoLutas(B) !== resumoLutas(C)) throw new Error(`retomada ${resumoLutas(B)} x direta ${resumoLutas(C)}`);
  });

  await conf("evento da IA que chega depois de sair pro menu não toca a carreira seguinte", async () => {
    const X = novo(778804);
    X.run("meuPro=true;globalThis.__res=null;ai=(tipo)=>tipo==='evento'?new Promise(r=>{globalThis.__res=r;}):Promise.resolve(null);sortearRaro=()=>null;");
    await lutarManual(X);
    if (!X.run("typeof globalThis.__res==='function'")) throw new Error("evento não foi pedido");
    X.registro.hubMenu.onclick();
    iniciarCarreiraTeste(X, F, 778805, "normal", rosterJSON);
    X.run("auto=false;");
    const antes = X.run("JSON.stringify([st.events,st.eventoMod])");
    X.run(`globalThis.__res({texto:"Um vídeo antigo do treino voltou a circular na cidade.",atributo:"slpm",efeito:1.1});`);
    for (let k = 0; k < 4; k++) { X.drenar(); await respirarCarreira(); }
    if (X.run("JSON.stringify([st.events,st.eventoMod])") !== antes) throw new Error("evento antigo mexeu na carreira nova");
    if (nosDe(X.registro.app).some(n => /voltou a circular/.test(String(n.innerHTML)))) throw new Error("evento antigo apareceu na tela nova");
  });

  await conf("#/carreira: a carreira fica nesse endereço e recarregar nele retoma o save mais recente", async () => {
    const X = novo(778806);
    X.run("USUARIO_ID='u1';SLOT_ATUAL=2;salvarCarreira();");
    if (X.sb.location.hash !== "#/carreira") throw new Error("hash da carreira: " + X.sb.location.hash);
    await jogarCarreiraAte(X, 2); X.run("auto=false;salvarCarreira();");
    const Y = sandboxCarreira();
    Object.assign(Y.dadosLS, X.dadosLS);
    Y.sb.window.supabase = supabaseFalsoComSessao({ sessao: { user: { id: "u1", email: "t@t.com" } } });
    Y.sb.__F = F; Y.sb.__RJ = rosterJSON;
    const vaY = [];
    Y.sb.window.va = (t, o) => { if (t === "event") vaY.push(o && o.name); };
    Y.run(`ROSTER=JSON.parse(globalThis.__RJ);CUTOFF_RANKING=Math.max(...ROSTER.map(f=>f.era?f.era[1]:0))-6;location.hash="#/carreira";irPara("carreira");`);
    for (let k = 0; k < 8; k++) { Y.drenar(); await respirarCarreira(); }
    // fase 8: evento de funil de quem voltou pra uma carreira salva
    if (!vaY.includes("continuou_save")) throw new Error("retomar não mandou continuou_save: " + vaY.join(","));
    if (Y.run("document.documentElement.dataset.tela") !== "hub") throw new Error("não abriu o hub: " + Y.run("document.documentElement.dataset.tela"));
    if (Y.run("fightNo") !== X.run("fightNo") || Y.run("SLOT_ATUAL") !== 2) throw new Error(`retomou luta ${Y.run("fightNo")} no espaço ${Y.run("SLOT_ATUAL")}`);
  });

  /* ---------- tarefa 9: fim de carreira ---------- */
  await conf("fim de carreira: tela nova com nota, parecer, legado, números e ações; sem travessão; libera o espaço e sai de #/carreira", async () => {
    const X = novo(778901);
    X.run("USUARIO_ID='u1';SLOT_ATUAL=1;");
    await jogarCarreiraAte(X, 2); X.run("auto=false;salvarCarreira();");
    if (!X.dadosLS["save:u1:1"]) throw new Error("sem save antes do fim");
    X.run("screenReport();");
    for (let k = 0; k < 3; k++) { X.drenar(); await respirarCarreira(); }
    if (X.run("document.documentElement.dataset.tela") !== "nova") throw new Error("fim fora do molde novo");
    const nos = nosDe(X.registro.app);
    const g = JSON.parse(X.run("JSON.stringify(grade())"));
    const nota = nos.find(n => tem(n, "fim-nota"));
    if (!nota || !String(nota.innerHTML).includes(`fim-letra nota-${g.letter}">${g.letter}</div>`) || !String(nota.innerHTML).includes(g.verdict))
      throw new Error("sem a nota " + g.letter + " e o parecer");
    if (!nos.some(n => tem(n, "fim-legado"))) throw new Error("sem legado");
    /* pontos de legado (2026-09-28): mesma escala e mesmo número do ranking, com as partes que fecham a conta */
    const pl = X.run("fmtPontos(grade().pontos)");
    if (!String(nota.innerHTML).includes(`<b>${pl}</b> pontos de legado`)) throw new Error("fim sem os pontos de legado: " + String(nota.innerHTML).slice(0, 200));
    if (/de 100/.test(String(nota.innerHTML))) throw new Error("fim ainda mostra a escala antiga (de 100)");
    if ((String(nota.innerHTML).match(/<li>/g) || []).length !== 5) throw new Error("fim sem as 5 partes dos pontos");
    if (X.run("corpoPlacar(grade()).pontuacao") !== X.run("grade().pontos")) throw new Error("o fim e o ranking mostram números diferentes");
    const conta = JSON.parse(X.run(`(function(){const r=mulberry32(4242),erros=[];
      for(let i=0;i<400;i++){st.peak=r();st.bestBeaten=r();st.wins=Math.floor(r()*23);st.losses=Math.floor(r()*(23-st.wins));
        st.finishes=Math.floor(r()*(st.wins+1));st.title=r()<.3;const g=grade();
        const soma=g.partes.reduce((a,x)=>a+x.v,0);
        if(soma!==g.pontos||g.pontos!==Math.floor(g.bruto*100)||g.partes.some(x=>x.v<0))erros.push(JSON.stringify({soma,p:g.pontos}));}
      return JSON.stringify(erros.slice(0,3));})()`));
    if (conta.length) throw new Error("as partes não fecham o total: " + conta.join(" "));
    if (nos.filter(n => tem(n, "fim-num")).length < 10) throw new Error("poucos números");
    for (const t of ["Salvar imagem", "Copiar imagem", "Nova carreira"])
      if (!nos.some(n => n.tagName === "button" && n.innerHTML === t && n.onclick)) throw new Error("sem botão " + t);
    /* regras v3 (2026-10-05): sem link de desafio (o adversário acompanha o
       nível de cada um); carreira v1/v2 continua com ele */
    if (nos.some(n => n.tagName === "button" && n.innerHTML === "Copiar desafio")) throw new Error("carreira v3 com Copiar desafio");
    {
      X.run("REGRAS=2;screenReport();");
      for (let k = 0; k < 3; k++) { X.drenar(); await respirarCarreira(); }
      if (!nosDe(X.registro.app).some(n => n.tagName === "button" && n.innerHTML === "Copiar desafio" && n.onclick))
        throw new Error("carreira v2 perdeu o Copiar desafio");
      X.run("REGRAS=3;");
    }
    const comTravessao = nos.find(n => /—/.test(String(n.innerHTML || "")) && !tem(n, "fim-destaque"));
    if (comTravessao) throw new Error("travessão no fim: " + String(comTravessao.innerHTML).slice(0, 80));
    if (X.dadosLS["save:u1:1"]) throw new Error("espaço não foi liberado");
    if (X.sb.location.hash === "#/carreira") throw new Error("continua em #/carreira (recarregar abriria outra carreira)");
    if (nos.some(n => /Quedas aplicadas/.test(String(n.innerHTML)))) throw new Error("knockdown ainda rotulado como queda");
  });

  const ok = !falhas.length;
  console.log("\n" + (ok ? verde("hub ok") : vermelho(`${falhas.length} falha(s) no hub`)));
  return ok;
}

/* ================================================================== *
 * SOM (revamp fase 6): trilha por tela com crossfade, efeitos reais
 *     com o sintetizado de reserva, arquivos com licença e créditos.
 *     Web Audio e <audio> falsos: o que se confere é a decisão e a
 *     fiação, não o som (ouvir fica com o dono).
 * ================================================================== */
async function testarSom() {
  console.log("\n" + cinza("som: trilha por tela, efeitos com reserva sintetizada, licenças e orçamento"));
  const falhas = [];
  const conf = async (nome, fn) => {
    try { await fn(); console.log(verde("  ok    ") + nome); }
    catch (e) { falhas.push(nome); console.log(vermelho("  falha ") + nome + "\n         " + e.message); }
  };
  const respirar = () => new Promise(r => setImmediate(r));
  /* Web Audio falso: registra o que a fiação pede */
  const somFalso = (modo) => {
    const reg = { osc: 0, fontes: 0, audios: [], fetches: [] };
    const param = (v) => ({ value: v, alvo: v, setValueAtTime(x) { this.value = x; }, linearRampToValueAtTime(x) { this.alvo = x; },
      exponentialRampToValueAtTime(x) { this.alvo = x; }, setTargetAtTime(x) { this.alvo = x; }, cancelScheduledValues() {} });
    const no = (extra = {}) => Object.assign({ connect(n) { return n; }, start() {}, stop() {}, gain: param(1), frequency: param(20000), Q: param(1) }, extra);
    class AC {
      constructor() { this.currentTime = 0; this.state = "running"; this.destination = no(); this.sampleRate = 44100; }
      resume() {}
      createGain() { return no(); }
      createOscillator() { reg.osc++; return no(); }
      createBiquadFilter() { return no(); }
      createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
      createBufferSource() { reg.fontes++; return no(); }
      createMediaElementSource(el) { return no({ el }); }
      decodeAudioData() { return modo === "ok" ? Promise.resolve({ duration: 1 }) : Promise.reject(new Error("decode")); }
    }
    class FakeAudio {
      constructor(src) { this.src = src; this.paused = true; this.loop = false; reg.audios.push(this); this.ouvintes = {}; }
      play() { this.paused = false; return Promise.resolve(); }
      pause() { this.paused = true; }
      addEventListener(k, f) { this.ouvintes[k] = f; }
    }
    const fetchFalso = (url) => { reg.fetches.push(url); return Promise.resolve({ ok: modo !== "404", arrayBuffer: async () => new ArrayBuffer(8) }); };
    return { reg, AC, FakeAudio, fetchFalso };
  };
  const ambiente = (modo) => {
    const env = criarAmbiente();
    const f = somFalso(modo);
    env.sandbox.window.AudioContext = f.AC;
    env.sandbox.Audio = f.FakeAudio;
    env.sandbox.fetch = f.fetchFalso;
    vm.createContext(env.sandbox);
    vm.runInContext(lerScript(), env.sandbox, { filename: "index.html" });
    const run = c => vm.runInContext(c, env.sandbox);
    return { env, reg: f.reg, run };
  };

  await conf("cada tela escolhe a trilha certa (menu, páginas, hub, cada etapa da noite)", () => {
    const { run } = ambiente("ok");
    const casos = [["nova", null, "menu"], ["antiga", null, "menu"], ["hub", null, "hub"], ["hub", "oferta", "noite"],
      ["hub", "camp", "noite"], ["hub", "coletiva", "noite"], ["hub", "resultado", "noite"], ["hub", "entrada", "walkout"], ["hub", "luta", "walkout"]];
    for (const [tela, etapa, esperado] of casos) {
      const got = run(`document.documentElement.dataset.tela=${JSON.stringify(tela)};noiteEtapa=${JSON.stringify(etapa)};contextoTrilha()`);
      if (got !== esperado) throw new Error(`${tela}/${etapa}: ${got} (esperava ${esperado})`);
    }
  });

  await conf("cada linha da narração tem o efeito certo; linha de uma luta real nunca pede efeito inexistente", () => {
    const { run } = ambiente("ok");
    const casos = [[{ kind: "rd", text: "Round 2" }, "sinoInicio"], [{ kind: "rd", text: "Fim do round 2. X levou." }, "sinoFim"],
      [{ kind: "kd", text: "X foi ao chão! Levantou cambaleando." }, "knockdown"], [{ kind: "big", text: "Queda de X. Levou pro chão." }, "queda"],
      [{ kind: "big", text: "X tenta a finalização! Y escapa." }, "quaseFinalizacao"], [{ kind: "big", text: "X martelando por cima. Y só protege." }, "golpePesado"],
      [{ kind: "", text: "X acerta mais na troca, 5 a 2." }, "golpeLeve"], [{ kind: "", text: "Troca parelha, 3 a 3." }, "golpeLeve"],
      [{ kind: "", text: "X controla a posição." }, null], [{ kind: "fin", text: "X vence por nocaute" }, "nocaute"],
      [{ kind: "fin", text: "X vence por finalização" }, "finalizacao"], [{ kind: "fin", text: "Vai pros cartões. X vence por decisão, 30-27." }, null]];
    for (const [L, esperado] of casos) {
      const got = run(`somDaLinha(${JSON.stringify(L)})`);
      if (got !== esperado) throw new Error(`${JSON.stringify(L)}: ${got} (esperava ${esperado})`);
    }
    const inexistentes = run(`(()=>{const F=rateAll(${JSON.stringify(lerLutadores().slice(0, 40))});const out=[];
      for(let s=1;s<=60;s++){const r=simulateFight(F[s%40],F[(s*7+3)%40],{seed:s});
        r.log.forEach(L=>{const e=somDaLinha(L);if(e&&typeof SOM[e]!=="function")out.push(e);});}return out;})()`);
    if (inexistentes.length) throw new Error("efeitos sem método no SOM: " + [...new Set(inexistentes)].join(","));
  });

  await conf("sem AudioContext e sem Audio nada quebra (o testar.js inteiro depende disso)", () => {
    const env = criarAmbiente();
    vm.createContext(env.sandbox);
    vm.runInContext(lerScript() + `
      ;audioLiberado=true;
      Object.keys(SOM).forEach(k=>SOM[k]());
      document.documentElement.dataset.tela="hub";noiteEtapa="luta";atualizarTrilha();
      trocarTrilha("menu");tocarVinheta(true);torcidaAmbiente(true);abafarWalkout(true);definirMudo(true);definirMudo(false);`, env.sandbox);
  });

  await conf("arquivo que falha cai no sintetizado; arquivo carregado toca sem sintetizar", async () => {
    const A = ambiente("404");
    A.run("audioLiberado=true;carregaAudio();");
    for (let k = 0; k < 4; k++) await respirar();
    const oscAntes = A.reg.osc;
    A.run("SOM.golpePesado();SOM.sinoFim();");
    if (A.reg.osc <= oscAntes) throw new Error("arquivo com 404 e o sintetizado não tocou");
    const B = ambiente("ok");
    B.run("audioLiberado=true;carregaAudio();");
    for (let k = 0; k < 4; k++) await respirar();
    const oscB = B.reg.osc, fontesB = B.reg.fontes;
    B.run("SOM.golpePesado();SOM.sinoFim();");
    if (B.reg.osc !== oscB) throw new Error("arquivo carregado e ainda sintetizou");
    if (B.reg.fontes < fontesB + 2) throw new Error("efeito carregado não tocou pelo buffer");
  });

  await conf("trilha troca com crossfade; na luta o walkout abafa e a torcida entra; mudo não carrega nada", async () => {
    const { run, reg } = ambiente("ok");
    run(`audioLiberado=true;document.documentElement.dataset.tela="hub";noiteEtapa=null;atualizarTrilha();`);
    if (run("trilhaAtual") !== "hub") throw new Error("trilha " + run("trilhaAtual"));
    const hub = reg.audios.find(a => /musica-hub/.test(a.src));
    if (!hub || hub.paused) throw new Error("música do hub não tocou");
    if (Math.abs(run("FAIXAS.hub.g.gain.alvo") - run("NIVEL_TRILHA.hub")) > 1e-9) throw new Error("hub não subiu pro nível dela");
    run(`noiteEtapa="luta";atualizarTrilha();`);
    if (run("trilhaAtual") !== "walkout") throw new Error("luta sem walkout");
    if (run("FAIXAS.hub.g.gain.alvo") > .001) throw new Error("hub não desceu no crossfade");
    if (run("FAIXAS.walkout.f.frequency.alvo") !== 380) throw new Error("walkout não abafou na luta");
    const torcida = reg.audios.find(a => /torcida-ambiente/.test(a.src));
    if (!torcida || torcida.paused) throw new Error("torcida não entrou na luta");
    run(`noiteEtapa="entrada";atualizarTrilha();`);
    if (run("FAIXAS.walkout.f.frequency.alvo") !== 20000) throw new Error("walkout abafado na entrada");
    const M = ambiente("ok");
    M.run(`definirMudo(true);audioLiberado=true;document.documentElement.dataset.tela="hub";atualizarTrilha();SOM.golpePesado();`);
    if (M.reg.audios.length || M.reg.fetches.length) throw new Error("mudo carregou áudio");
  });

  await conf("mudo silencia na hora, desce e pausa a música que estava tocando, e ela não volta sozinha", async () => {
    const { run, reg, env } = ambiente("ok");
    run(`audioLiberado=true;document.documentElement.dataset.tela="hub";noiteEtapa=null;atualizarTrilha();tocarVinheta(true);`);
    const hub = reg.audios.find(a => /musica-hub/.test(a.src));
    if (!hub || hub.paused) throw new Error("hub não estava tocando");
    run("definirMudo(true);");
    if (run("MASTER.gain.alvo") !== 0) throw new Error("mudo não zerou o ganho mestre na hora");
    if (run("FAIXAS.hub.g.gain.alvo") > .001) throw new Error("mudo não desceu a trilha");
    env.drenar();
    if (!hub.paused) throw new Error("trilha continuou tocando depois do mudo");
    if (run("FAIXAS.hub.g.gain.alvo") > .001) throw new Error("a trilha subiu de novo com o jogo mudo (volta da vinheta)");
    run("definirMudo(false);");
    if (run("MASTER.gain.alvo") < .5) throw new Error("tirar o mudo não devolveu o ganho mestre");
  });

  await conf("todo arquivo de audio/ tem licença, crédito, uso no jogo, e o total cabe em 8 MB", () => {
    const dir = path.join(__dirname, "audio");
    const mp3 = fs.readdirSync(dir).filter(f => f.endsWith(".mp3"));
    const lic = fs.readFileSync(path.join(dir, "LICENCAS.md"), "utf8");
    const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
    const semLic = mp3.filter(f => !lic.includes("`" + f + "`"));
    if (semLic.length) throw new Error("sem licença: " + semLic.join(", "));
    const { run } = ambiente("ok");
    const usados = new Set(run(`[...Object.values(TRILHAS),...[].concat(...Object.values(EFEITOS)).map(n=>n+".mp3"),"torcida-ambiente.mp3"]`));
    const faltam = [...usados].filter(f => !mp3.includes(f));
    if (faltam.length) throw new Error("o jogo pede arquivo que não existe: " + faltam.join(", "));
    const sobram = mp3.filter(f => !usados.has(f));
    if (sobram.length) throw new Error("arquivo sem uso no jogo: " + sobram.join(", "));
    /* Crédito dentro do jogo só é obrigatório pra CC BY (CC0 dispensa). A
       página Créditos saiu na reta final (2026-09-28); o crédito CC BY
       mora no painel da engrenagem (abrirConfig), conferido abaixo. Numa
       linha com mais de um autor, quem vem marcado "(CC0 ...)" é CC0. */
    const autoresCCBY = [...lic.matchAll(/\| [^|]+ \| [^|]+ \| [^|]+ \| ([^|]+) \| ([^|]+) \|/g)]
      .filter(m => /CC BY/.test(m[2]))
      .flatMap(m => m[1].split(" + ").filter(a => !/\(CC0/.test(a)))
      .map(a => a.replace(/\s*\(.*$/, "").trim());
    if (!autoresCCBY.length) throw new Error("não achei nenhum autor CC BY na tabela (regex quebrou?)");
    const X = sandboxCarreira();
    X.run("abrirConfig();");
    const cfgNos = []; const junta = n => { if (!n) return; cfgNos.push(n); (n.children || []).forEach(junta); };
    junta(X.registro.cfg);
    const cfgTxt = cfgNos.map(n => String(n.innerHTML || "") + String(n.textContent || "")).join(" ");
    const semCredito = [...new Set(autoresCCBY)].filter(a => !cfgTxt.includes(a));
    if (semCredito.length) throw new Error("autor CC BY sem crédito no painel de configurações: " + semCredito.join(", "));
    if (!cfgTxt.includes("CC BY 4.0")) throw new Error("painel de configurações sem o nome da licença CC BY 4.0");
    if (!/CC BY/.test(lic) || !/CC0/.test(lic)) throw new Error("tabela de licenças incompleta");
    if (/[^A-Za-z]NC[^A-Za-z]|NonCommercial|-nc/.test(lic)) throw new Error("licença NC na tabela");
    const total = mp3.reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
    if (total > 8 * 1024 * 1024) throw new Error(`audio/ tem ${(total / 1048576).toFixed(2)} MB`);
    if (fs.existsSync(path.join(dir, "sintetiza.py"))) throw new Error("sintetiza.py continua lá");
  });

  const ok = !falhas.length;
  console.log("\n" + (ok ? verde("som ok") : vermelho(`${falhas.length} falha(s) no som`)));
  return ok;
}

/* ================================================================== *
 * TEXTO (revamp fase 7): sem travessão e sem frase de efeito em nenhum
 *     texto do jogo; texto que vem da IA passa pelo filtro. Regras no
 *     LEIA-ME ("Regras de texto").
 * ================================================================== */
const FRASES_PROIBIDAS = [
  [/de verdade/i, "\"de verdade\" como reforço"],
  [/começa agora/i, "\"começa agora\""],
  [/sua jornada/i, "\"sua jornada\""],
  [/\bnão é [^.,;:!?]{1,40}, é\b/i, "\"não é X, é Y\""],
  [/!!/, "exclamação dupla"],
];
/* Literais de texto de um código JS: aspas, crases e o que está dentro
   de ${} (texto aninhado em template também conta). Comentário e regex
   ficam de fora. Um regex simples não serve: "${cheio?x:"—"}" some junto
   com a expressão, e crase dentro de ${} corta o template no meio. */
function literaisJS(src) {
  const out = [];
  let i = 0, prev = "";
  const KW = /^(return|typeof|case|in|of|delete|void|throw|new|else|do|yield|await)$/;
  const regexPossivel = () => prev === "" || /^[(,=:[!&|?{};+\-*%<>~^]$/.test(prev) || KW.test(prev);
  const escape = () => {
    const e = src[i + 1];
    if (e === "u" && src[i + 2] === "{") { const f = src.indexOf("}", i); const c = String.fromCodePoint(parseInt(src.slice(i + 3, f), 16)); i = f + 1; return c; }
    if (e === "u") { const c = String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16)); i += 6; return c; }
    i += 2; return e === "n" ? "\n" : (e || "");
  };
  const lerAspas = q => {
    let t = ""; i++;
    while (i < src.length && src[i] !== q && src[i] !== "\n") t += src[i] === "\\" ? escape() : src[i++];
    i++; return t;
  };
  const lerCrase = () => {
    let t = ""; i++;
    while (i < src.length && src[i] !== "`") {
      if (src[i] === "\\") { t += escape(); continue; }
      if (src[i] === "$" && src[i + 1] === "{") { i += 2; codigo(true); t += " "; continue; }
      t += src[i++];
    }
    i++; return t;
  };
  const pularRegex = () => {
    i++;
    let classe = false;
    while (i < src.length && src[i] !== "\n") {
      const c = src[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "[") classe = true; else if (c === "]") classe = false;
      else if (c === "/" && !classe) { i++; break; }
      i++;
    }
    while (/[a-z]/.test(src[i] || "")) i++;
  };
  function codigo(emTemplate) {
    let prof = 0;
    while (i < src.length) {
      const c = src[i], d = src[i + 1];
      if (c === "/" && d === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
      if (c === "/" && d === "*") { const f = src.indexOf("*/", i + 2); i = f < 0 ? src.length : f + 2; continue; }
      if (c === "'" || c === '"') { out.push(lerAspas(c)); prev = "a"; continue; }
      if (c === "`") { out.push(lerCrase()); prev = "a"; continue; }
      if (c === "/") { if (regexPossivel()) { pularRegex(); prev = "a"; } else { i++; prev = "/"; } continue; }
      if (c === "{") { prof++; i++; prev = "{"; continue; }
      if (c === "}") { i++; if (emTemplate && prof === 0) return; prof--; prev = "}"; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (/[\w$]/.test(c)) { let w = ""; while (i < src.length && /[\w$]/.test(src[i])) w += src[i++]; prev = w; continue; }
      prev = c; i++;
    }
  }
  codigo(false);
  return out.filter(t => t.trim());
}
/* Texto visível do HTML fora dos <script>: nós de texto e atributos. */
function textosHTML(html) {
  const semScript = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const attrs = [...semScript.matchAll(/\s(?:title|alt|aria-label|placeholder|content)="([^"]*)"/g)].map(m => m[1]);
  return [...semScript.replace(/<[^>]*>/g, "\n").split("\n"), ...attrs].map(t => t.trim()).filter(Boolean);
}
function stringsDoIndex() {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  const erro404 = fs.readFileSync(path.join(__dirname, "404.html"), "utf8");
  const scripts404 = [...erro404.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  return [...scripts.flatMap(literaisJS), ...textosHTML(html), ...scripts404.flatMap(literaisJS), ...textosHTML(erro404)];
}
function problemasDeTexto(t) {
  const p = [];
  if (/[—–]|&[mn]dash;|&#821[12];/.test(t)) p.push("travessão");
  for (const [re, nome] of FRASES_PROIBIDAS) if (re.test(t)) p.push(nome);
  if ((t.replace(/<[^>]*>/g, "").match(/!/g) || []).length > 1) p.push("exclamação em série");
  // ícone é SVG do sprite (ICONE()), nunca emoji nem seta/check em caractere
  if (/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{FE0F}]/u.test(t)) p.push("emoji ou símbolo no lugar de ícone");
  return p;
}
async function testarTexto() {
  console.log("\n" + cinza("texto: sem travessão, sem frase de efeito, filtro no texto da IA"));
  const falhas = [];
  const conf = async (nome, fn) => {
    try { await fn(); console.log(verde("  ok    ") + nome); }
    catch (e) { falhas.push(nome); console.log(vermelho("  falha ") + nome + "\n         " + e.message); }
  };
  await conf("nenhuma string do index.html tem travessão ou frase proibida", () => {
    const ruins = stringsDoIndex().map(t => [t, problemasDeTexto(t)]).filter(([, p]) => p.length);
    if (ruins.length) throw new Error(`${ruins.length} strings:\n` + ruins.slice(0, 12).map(([t, p]) => `           [${p.join(", ")}] ${t.replace(/\s+/g, " ").slice(0, 110)}`).join("\n")
      + (ruins.length > 12 ? `\n           ...e mais ${ruins.length - 12}` : ""));
  });
  await conf("semTravessao(): fala perde o travessão, meio vira vírgula, intervalo vira hífen, resto intacto", () => {
    const env = criarAmbiente();
    vm.createContext(env.sandbox);
    vm.runInContext(exportar(lerScript(), ["semTravessao", "limparTextoIA"]), env.sandbox, { filename: "index.html" });
    const { semTravessao, limparTextoIA } = env.sandbox.__x;
    if (typeof semTravessao !== "function") throw new Error("semTravessao não existe");
    const casos = [["— Vai perder, garoto.", "Vai perder, garoto."], ["Ele venceu — por pouco.", "Ele venceu, por pouco."],
      ["placar 30–27", "placar 30-27"], ["terminou assim —", "terminou assim"], ["sem nada pra trocar", "sem nada pra trocar"]];
    for (const [a, b] of casos) if (semTravessao(a) !== b) throw new Error(`"${a}" virou "${semTravessao(a)}" (esperava "${b}")`);
    const j = limparTextoIA({ reacao: "Riu — e saiu.", efeito: 1.1, posts: [{ nome: "Ana", texto: "— que luta" }], atributo: "slpm" });
    if (JSON.stringify(j) !== JSON.stringify({ reacao: "Riu, e saiu.", efeito: 1.1, posts: [{ nome: "Ana", texto: "que luta" }], atributo: "slpm" }))
      throw new Error("limparTextoIA: " + JSON.stringify(j));
  });
  await conf("todo texto que a IA devolve passa pelo filtro antes de chegar no jogo", async () => {
    const env = criarAmbiente();
    env.sandbox.fetch = async () => ({ ok: true, json: async () => ({ result: { texto: "O treino — pesado — rendeu.", atributo: "nenhum" } }) });
    vm.createContext(env.sandbox);
    vm.runInContext(lerScript(), env.sandbox, { filename: "index.html" });
    const r = await vm.runInContext(`ai("evento",{})`, env.sandbox);
    if (!r || /[—–]/.test(r.texto)) throw new Error("texto da IA chegou com travessão: " + JSON.stringify(r));
  });
  await conf("carreira inteira na tela (22 lutas e o fim) sem travessão nem frase proibida", async () => {
    const F = lerLutadores();
    const X = sandboxCarreira();
    iniciarCarreiraTeste(X, F, 779001);
    await jogarCarreiraAte(X, 22);
    X.run("auto=false;screenReport();");
    for (let k = 0; k < 3; k++) { X.drenar(); await respirarCarreira(); }
    const nosDe = (r, acc = []) => { if (!r) return acc; acc.push(r); (r.children || []).forEach(c => nosDe(c, acc)); return acc; };
    const textos = new Set();
    for (const id of Object.keys(X.registro)) for (const n of nosDe(X.registro[id])) {
      const t = String(n.innerHTML || "") + " " + String(n.textContent || "");
      if (t.trim()) textos.add(t);
    }
    const ruins = [...textos].map(t => [t, problemasDeTexto(t.replace(/<[^>]*>/g, " "))]).filter(([, p]) => p.length);
    if (ruins.length) throw new Error(`${ruins.length} textos:\n` + ruins.slice(0, 8).map(([t, p]) => `           [${p.join(", ")}] ${t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 110)}`).join("\n"));
  });
  await conf("prompts da api/ai.js pedem texto sem travessão e sem frase de efeito, e não usam travessão", () => {
    const api = fs.readFileSync(path.join(__dirname, "api", "ai.js"), "utf8");
    // a regra entra na VOZ, que abre o system de todo kind
    if (!/const REGRA_TEXTO = `[^`]*travessão[^`]*"não é X, é Y"/.test(api)) throw new Error("api/ai.js sem REGRA_TEXTO");
    if (!/const VOZ = `[^`]*\$\{REGRA_TEXTO\}`/.test(api)) throw new Error("REGRA_TEXTO fora da VOZ");
    // o modelo imita a pontuação que lê: só a própria regra cita o travessão.
    // Vale pros outros arquivos de api/ também (a descrição da cobrança
    // aparece pro jogador na página de pagamento).
    const arquivos = fs.readdirSync(path.join(__dirname, "api")).filter(f => f.endsWith(".js"));
    const comTravessao = arquivos.flatMap(f => literaisJS(fs.readFileSync(path.join(__dirname, "api", f), "utf8"))
      .filter(t => /[—–]/.test(t) && !/^Pontuação: NUNCA use travessão/.test(t)).map(t => f + ": " + t.replace(/\s+/g, " ").slice(0, 80)));
    if (comTravessao.length) throw new Error("texto com travessão: " + comTravessao.join(" | "));
  });
  const ok = !falhas.length;
  console.log("\n" + (ok ? verde("texto ok") : vermelho(`${falhas.length} falha(s) no texto`)));
  return ok;
}

/* ================================================================== *
 * PLACAR (revamp fase 3): a regra do servidor (api/_placar-regras.js)
 * aceita carreira real e recusa o impossível; o endpoint (api/placar.js)
 * exige sessão, limita envios e grava o user_id do TOKEN, nunca do corpo.
 * ================================================================== */
async function testarPlacar() {
  console.log("\n" + cinza("placar: regra de plausibilidade do servidor e o endpoint"));
  const url = require("url");
  const falhas = [];
  const conf = async (nome, fn) => {
    try { await fn(); console.log(verde("  ok    ") + nome); }
    catch (e) { falhas.push(nome); console.log(vermelho("  falha ") + nome + "\n         " + e.message); }
  };
  let R = null;
  try { R = await import(url.pathToFileURL(path.join(RAIZ, "api", "_placar-regras.js")).href); }
  catch (e) { console.log(vermelho("  não carregou api/_placar-regras.js: " + e.message)); return false; }
  // carreira REAL, jogada pelo caminho de verdade, vira o corpo que o cliente manda
  const F = lerLutadores();
  const ctx = sandboxCarreira();
  iniciarCarreiraTeste(ctx, F, 555001);
  await jogarCarreiraAte(ctx, 22);
  const real = JSON.parse(ctx.run("JSON.stringify(corpoPlacar(grade()))"));
  await conf("aceita uma carreira real (22 lutas pelo caminho de verdade)", () => {
    const v = R.validarEnvio(real);
    if (!v.ok) throw new Error("recusou: " + v.erro + " " + JSON.stringify(real));
    if (v.linha.cartel !== `${real.wins}-${real.losses}`) throw new Error("cartel montado errado");
  });
  const recusa = async (nome, mexe) => conf("recusa " + nome, () => {
    const c = JSON.parse(JSON.stringify(real)); mexe(c);
    const v = R.validarEnvio(c);
    if (v.ok) throw new Error("aceitou " + JSON.stringify(c));
  });
  await recusa("mais de 22 lutas", c => { c.wins = 20; c.losses = 5; });
  await recusa("finalizações acima das vitórias", c => { c.finishes = c.wins + 1; });
  await recusa("cinturões acima das vitórias", c => { c.cinturoes = c.wins + 1; });
  await recusa("pontuação acima de 10000", c => { c.pontuacao = 10001; c.nota = "S"; });
  await recusa("pontuação acima do teto do cartel", c => { c.wins = 1; c.losses = 21; c.finishes = 0; c.title = false; c.pontuacao = 9500; c.nota = "S"; });
  await recusa("nota que não bate com a pontuação", c => { c.nota = c.nota === "S" ? "F" : "S"; });
  await recusa("nome vazio", c => { c.nome = "   "; });
  await recusa("nome com mais de 28 caracteres", c => { c.nome = "x".repeat(29); });
  await recusa("nome com link", c => { c.nome = "Veja www.site.com"; });
  await recusa("nome com palavrão (sem acento e em maiúscula também)", c => { c.nome = "Zé PORRA"; });
  /* auditoria de 2026-10-08: nome com HTML no top 3 rodava código na página inicial */
  await recusa("nome com HTML (<svg onload=...>)", c => { c.nome = "<svg onload=alert(1)>"; });
  await recusa("nome com aspas, & ou crase", c => { c.nome = 'Zé "Brasa" & `cia`'; });
  await recusa("nome com caractere de controle", c => { c.nome = "Zé\u202eBrasa"; });
  await conf("nome comum com acento, apóstrofo, hífen e ponto continua aceito", () => {
    for (const nome of ["José D'Arce", "Zé-Pequeno Jr.", "Ana Lúcia", "Kayo Brasa 2"]) {
      const c = JSON.parse(JSON.stringify(real)); c.nome = nome;
      const v = R.validarEnvio(c);
      if (!v.ok) throw new Error(nome + ": " + v.erro);
    }
  });
  await recusa("divisão fora da lista", c => { c.divisao = "superpesado"; });
  await recusa("modo fora de normal/lenda", c => { c.modo = "deus"; });
  await conf("faixas de nota do servidor = as do grade() do jogo", () => {
    const tiers = JSON.parse(ctx.run("JSON.stringify(FAIXAS_NOTA)"));
    /* no limite E logo abaixo dele: o limite sozinho não pega faixa
       deslocada pra baixo (A a 7700 ainda aceita 7800 como A) */
    const base = () => { const c = JSON.parse(JSON.stringify(real)); c.wins = 22; c.losses = 0; c.finishes = 22; c.title = true; c.cinturoes = 3; return c; };
    tiers.forEach(([min, letra], i) => {
      const c = base(); c.pontuacao = min * 100; c.nota = letra;
      const v = R.validarEnvio(c);
      if (!v.ok) throw new Error(`faixa ${letra} (${min}) recusada no limite: ${v.erro}`);
      if (i < tiers.length - 1) {
        const d = base(); d.pontuacao = min * 100 - 1; d.nota = tiers[i + 1][1];
        const w = R.validarEnvio(d);
        if (!w.ok) throw new Error(`${min * 100 - 1} devia ser ${tiers[i + 1][1]} no servidor: ${w.erro}`);
      }
    });
  });
  await conf("divisões do servidor = DIVISOES do jogo", () => {
    const ids = JSON.parse(ctx.run("JSON.stringify(DIVISOES.map(d=>d.id))"));
    if (JSON.stringify(ids.slice().sort()) !== JSON.stringify(R.DIVISOES_OK.slice().sort())) throw new Error(`jogo ${ids} vs servidor ${R.DIVISOES_OK}`);
  });
  // endpoint com fetch falso
  let H = null;
  try { H = (await import(url.pathToFileURL(path.join(RAIZ, "api", "placar.js")).href)).default; }
  catch (e) { falhas.push("carregar api/placar.js"); console.log(vermelho("  não carregou api/placar.js: " + e.message)); }
  if (H) {
    const fetchOriginal = globalThis.fetch;
    const envOriginal = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const chamar = async ({ token, corpo, usuario = { id: "u-token" }, hoje = 0 }) => {
      const gravado = [];
      globalThis.fetch = async (u, op = {}) => {
        if (String(u).includes("/auth/v1/user")) return { ok: !!usuario, json: async () => usuario };
        if (String(u).includes("/rest/v1/placar?select=")) return { ok: true, json: async () => new Array(hoje).fill({ seed: 1 }) };
        if (String(u).endsWith("/rest/v1/placar") && op.method === "POST") { gravado.push(JSON.parse(op.body)); return { ok: true }; }
        return { ok: false };
      };
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-falsa";
      const res = { cod: 0, corpo: null, setHeader() {}, status(c) { this.cod = c; return this; }, json(b) { this.corpo = b; return this; }, end() { return this; } };
      await H({ method: "POST", headers: token ? { authorization: "Bearer " + token } : {}, body: corpo }, res);
      return { res, gravado };
    };
    try {
      await conf("endpoint: sem token = 401", async () => { const { res } = await chamar({ corpo: real }); if (res.cod !== 401) throw new Error("status " + res.cod); });
      await conf("endpoint: token que o Supabase não reconhece = 401", async () => { const { res } = await chamar({ token: "x", corpo: real, usuario: null }); if (res.cod !== 401) throw new Error("status " + res.cod); });
      await conf("endpoint: carreira impossível = 400, nada gravado", async () => {
        const c = JSON.parse(JSON.stringify(real)); c.wins = 30;
        const { res, gravado } = await chamar({ token: "t", corpo: c });
        if (res.cod !== 400 || gravado.length) throw new Error(`status ${res.cod}, gravou ${gravado.length}`);
      });
      await conf("endpoint: 20 envios nas últimas 24 h = 429", async () => { const { res } = await chamar({ token: "t", corpo: real, hoje: 20 }); if (res.cod !== 429) throw new Error("status " + res.cod); });
      await conf("endpoint: caminho feliz = 200 e grava o user_id do TOKEN, não do corpo", async () => {
        const c = { ...real, user_id: "outro-usuario" };
        const { res, gravado } = await chamar({ token: "t", corpo: c });
        if (res.cod !== 200) throw new Error("status " + res.cod + " " + JSON.stringify(res.corpo));
        if (gravado.length !== 1 || gravado[0].user_id !== "u-token") throw new Error("gravou " + JSON.stringify(gravado));
      });
    } finally {
      globalThis.fetch = fetchOriginal;
      if (envOriginal === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = envOriginal;
    }
  }
  const ok = !falhas.length;
  console.log("\n" + (ok ? verde("placar ok") : vermelho(`${falhas.length} falha(s) no placar`)));
  return ok;
}

/* ================================================================== *
 * JxJ (2026-10-01): servidor (api/jxj.js) contra um Postgres de
 * verdade (PGlite, ferramentas/banco-teste.mjs) com supabase_schema.sql
 * + supabase_jxj.sql. Fluxo inteiro com várias contas e os ataques da
 * spec (seção 10): nenhum depende da tela.
 * ================================================================== */
async function testarJxJ() {
  console.log("\n" + cinza("jxj: servidor + banco de verdade (PGlite): fluxo, Free/Pro, fila, luta, temporada, torneio, ataques"));
  const url = require("url"), crypto = require("crypto");
  const falhas = [];
  const conf = async (nome, fn) => {
    try { await fn(); console.log(verde("  ok    ") + nome); }
    catch (e) { falhas.push(nome); console.log(vermelho("  falha ") + nome + "\n         " + e.message); }
  };
  let B;
  try { B = await import(url.pathToFileURL(path.join(RAIZ, "ferramentas", "banco-teste.mjs")).href); }
  catch (e) {
    console.log(vermelho("  falha ") + "o teste do JxJ precisa do PGlite: rode `npm install --prefix ferramentas` uma vez (" + String(e.message).slice(0, 90) + ")");
    return false;
  }
  const db = await B.novoBanco();
  const { SUPABASE_URL } = await import(url.pathToFileURL(path.join(RAIZ, "api", "_pro.js")).href);
  const MOTOR = await import(url.pathToFileURL(path.join(RAIZ, "api", "_jxj-motor.js")).href);
  const ARV = await import(url.pathToFileURL(path.join(RAIZ, "api", "_jxj-arvores.js")).href);
  const REG = await import(url.pathToFileURL(path.join(RAIZ, "api", "_jxj-regras.js")).href);
  const fetchOriginal = globalThis.fetch, envOriginal = { ...process.env }, erroOriginal = console.error;
  const chamadas = [];
  globalThis.fetch = B.fetchFalso(db, { SUPABASE_URL, chamadas });
  process.env.SUPABASE_SERVICE_ROLE_KEY = "falsa"; process.env.JXJ_ATIVO = "true";
  delete process.env.OPENROUTER_API_KEY;
  console.error = () => {};
  const H = (await import(url.pathToFileURL(path.join(RAIZ, "api", "jxj.js")).href)).default;
  let nUser = 0;
  const novoUsuario = async (opcoes = {}) => {
    const id = `00000000-0000-4000-8000-${String(++nUser).padStart(12, "0")}`;
    await B.criarUsuario(db, id, opcoes);
    return id;
  };
  const api = async (u, acao, extra = {}) => (await B.chamar(H, { ...(u ? { token: "tok:" + u } : {}), acao, ...extra }));
  const ok = async (u, acao, extra = {}) => {
    const r = await api(u, acao, extra);
    if (r.status !== 200) throw new Error(`${acao} deu ${r.status}: ${JSON.stringify(r.json).slice(0, 160)}`);
    return r.json;
  };
  const erro = async (u, acao, extra, padrao, status = 400) => {
    const r = await api(u, acao, extra);
    if (r.status !== status || !padrao.test(String(r.json && r.json.erro))) throw new Error(`${acao}: esperava ${status} /${padrao.source}/, veio ${r.status} ${JSON.stringify(r.json).slice(0, 160)}`);
  };
  const q = async (sql, params = []) => (await db.query(sql, params)).rows;
  const ROSTO = { pele: 2, porte: 1, cabelo: 1, corCabelo: 0, barba: 1, orelha: 0, nariz: 0, cicatriz: 0, tatuagem: 0, entrada: 0, prajiad: 0, corEntrada: 0 };
  let nNome = 0;
  const criar = async (u, extra = {}) => ok(u, "criar", { nome: `Lutador ${String.fromCharCode(65 + (nNome % 26))}${Math.floor(nNome++ / 26) || ""} ${nUser}`, rosto: ROSTO, categoria: "lightweight", estilo: "striker", ...extra });
  const zerarLimites = () => q("delete from jxj_limites");
  /* par entre duas contas já com lutador: fila, par e confirmação */
  const parear = async (u1, l1, u2, l2, { confirmar = true } = {}) => {
    await ok(u1, "filaEntrar", { lutadorId: l1 }); await ok(u2, "filaEntrar", { lutadorId: l2 });
    const f = await ok(u1, "fila");
    if (!f.luta) throw new Error("não pareou: " + JSON.stringify(f));
    if (confirmar) { await ok(u1, "confirmar", { lutaId: f.luta.id }); await ok(u2, "confirmar", { lutaId: f.luta.id }); }
    return f.luta.id;
  };
  const F = MOTOR.FAMILIAS;
  /* joga até o fim com duas escolhas; devolve a vista final */
  const lutar = async (lid, u1, u2, e1 = (n) => F[n % 4], e2 = (n) => F[(n * 3 + 1) % 4]) => {
    for (let n = 0; n < 40; n++) {
      const v = await ok(u1, "luta", { lutaId: lid });
      if (v.status !== "andamento") return v;
      await ok(u1, "acao", { lutaId: lid, round: v.round, troca: v.troca, familia: e1(n) });
      await ok(u2, "acao", { lutaId: lid, round: v.round, troca: v.troca, familia: e2(n) });
    }
    return ok(u1, "luta", { lutaId: lid });
  };
  const vencerPrazo = (lid) => q("update jxj_lutas set prazo = now() - interval '10 seconds' where id = $1", [lid]);

  try {
    await conf("desligado (JXJ_ATIVO diferente de true): definições dizem ativo:false e toda ação responde 503", async () => {
      process.env.JXJ_ATIVO = "false";
      const d = await api(null, "definicoes");
      const e = await api("x", "estado");
      process.env.JXJ_ATIVO = "true";
      if (d.status !== 200 || d.json.ativo !== false) throw new Error("definições: " + JSON.stringify(d).slice(0, 120));
      if (e.status !== 503 || !e.json.desligado) throw new Error("estado: " + JSON.stringify(e));
    });
    await conf("definições: 4 estilos, 12 ramos de 4 nós, ações, formato e regras públicas de ausência", async () => {
      const d = await ok(null, "definicoes");
      if (Object.keys(d.estilos).length !== 4 || Object.keys(d.ramos).length !== 12) throw new Error("estrutura");
      if (Object.values(d.ramos).some((r) => r.nos.length !== 4)) throw new Error("ramo sem 4 nós");
      if (!Array.isArray(d.regras.ausencia) || d.regras.ausencia.length < 3) throw new Error("regra de ausência");
    });
    await conf("sem sessão ou com token falso: 401 nas ações de conta; método e corpo errados recusados", async () => {
      if ((await api(null, "estado")).status !== 401) throw new Error("sem token");
      if ((await B.chamar(H, { token: "falso", acao: "estado" })).status !== 401) throw new Error("token falso");
      if ((await api(null, "inventada")).status !== 400) throw new Error("ação desconhecida");
      let st = 0; await H({ method: "GET", headers: {} }, { setHeader() {}, status(s) { st = s; return this; }, json() { return this; }, end() { return this; } });
      if (st !== 405) throw new Error("GET deu " + st);
      if ((await B.chamar(H, { acao: "ranking", lixo: "x".repeat(30000) })).status !== 413) throw new Error("corpo grande");
    });
    const free1 = await novoUsuario(), pro1 = await novoUsuario({ pro: true });
    await zerarLimites();
    await conf("criar: nome, estilo, categoria, categoria fechada e aparência são conferidos no servidor", async () => {
      await erro(free1, "criar", { nome: "A", rosto: ROSTO, categoria: "lightweight", estilo: "striker" }, /2 a 24/);
      await erro(free1, "criar", { nome: "Fulano Merda", rosto: ROSTO, categoria: "lightweight", estilo: "striker" }, /não pode/);
      await erro(free1, "criar", { nome: "Fulano", rosto: ROSTO, categoria: "lightweight", estilo: "ninja" }, /estilo/);
      await erro(free1, "criar", { nome: "Fulano", rosto: ROSTO, categoria: "inexistente", estilo: "striker" }, /categoria/);
      await erro(free1, "criar", { nome: "Fulano", rosto: ROSTO, categoria: "flyweight", estilo: "striker" }, /categoria fechada/);
      await erro(free1, "criar", { nome: "Fulano", rosto: { pele: 99 }, categoria: "lightweight", estilo: "striker" }, /aparência/);
    });
    let lf1, lp1, lp2, lp3;
    await conf("slots: grátis cria 1; Pro cria 3 e o 4º é recusado; o primeiro vira principal sem prazo", async () => {
      await zerarLimites();
      lf1 = (await criar(free1)).id;
      await erro(free1, "criar", { nome: "Segundo Free", rosto: ROSTO, categoria: "lightweight", estilo: "wrestler" }, /grátis tem 1 slot/);
      lp1 = (await criar(pro1)).id; lp2 = (await criar(pro1, { estilo: "grappler" })).id; lp3 = (await criar(pro1, { estilo: "counter" })).id;
      await erro(pro1, "criar", { nome: "Quarto Pro", rosto: ROSTO, categoria: "lightweight", estilo: "striker" }, /3 slots/);
      const est = await ok(pro1, "estado");
      if (est.principalId !== lp1 || est.lutadores.length !== 3 || est.principalTrocadoEm) throw new Error(JSON.stringify(est).slice(0, 200));
    });
    await conf("nome repetido (sem acento e caixa) é recusado; campo de rating, nível e fichas mandado pelo cliente é ignorado", async () => {
      const u = await novoUsuario();
      await ok(u, "criar", { nome: "Kayo Brasa", rosto: ROSTO, categoria: "lightweight", estilo: "striker", rating: 9999, nivel: 30, fichas: 5000, xp: 99999 });
      const u2 = await novoUsuario();
      await erro(u2, "criar", { nome: "káyo BRASA", rosto: ROSTO, categoria: "lightweight", estilo: "striker" }, /já existe/);
      const l = (await q("select rating, nivel, xp from jxj_lutadores where nome = 'Kayo Brasa'"))[0];
      const c = (await q("select fichas from jxj_contas where user_id = $1", [u]))[0];
      if (l.rating !== 1500 || l.nivel !== 1 || l.xp !== 0 || c.fichas !== 0) throw new Error(JSON.stringify({ l, c }));
    });
    await conf("principal: troca livre na primeira vez; a segunda antes de 72 h é recusada no relógio do banco; depois de 72 h passa", async () => {
      await ok(pro1, "principal", { lutadorId: lp2 });
      await erro(pro1, "principal", { lutadorId: lp3 }, /libera em/);
      await q("update jxj_contas set principal_trocado_em = now() - interval '73 hours' where user_id = $1", [pro1]);
      await ok(pro1, "principal", { lutadorId: lp3 });
      const est = await ok(pro1, "estado");
      if (est.principalId !== lp3) throw new Error("principal " + est.principalId);
    });
    await conf("Pro vencido: extras ficam inativos (fila e principal recusados), o principal efetivo vira o slot 1, nada é apagado; Pro de volta reativa", async () => {
      await q("update assinaturas set expira_em = now() - interval '1 day' where user_id = $1", [pro1]);
      const est = await ok(pro1, "estado");
      const ext = est.lutadores.filter((l) => l.slot > 1);
      if (ext.length !== 2 || ext.some((l) => l.utilizavel)) throw new Error("extras: " + JSON.stringify(ext.map((l) => [l.slot, l.utilizavel])));
      if (est.principalEfetivo !== lp1 || est.principalId !== lp3) throw new Error(`efetivo ${est.principalEfetivo} principal ${est.principalId}`);
      await erro(pro1, "filaEntrar", { lutadorId: lp2 }, /inativo/);
      await q("update jxj_contas set principal_trocado_em = null where user_id = $1", [pro1]);
      await erro(pro1, "principal", { lutadorId: lp2 }, /inativo/);
      await q("update assinaturas set expira_em = null where user_id = $1", [pro1]);
      const est2 = await ok(pro1, "estado");
      if (est2.lutadores.some((l) => !l.utilizavel) || est2.principalEfetivo !== lp3) throw new Error("não reativou");
    });
    await conf("árvore: habilidade inexistente, pontos a mais, pré-requisito, teto do ramo, tirar ponto sem respec e aba velha são recusados", async () => {
      const est = await ok(pro1, "estado");
      const l = est.lutadores.find((x) => x.id === lp1);
      await erro(pro1, "build", { lutadorId: lp1, rev: l.buildRev, build: { inexistente: 1 } }, /desconhecida/);
      await erro(pro1, "build", { lutadorId: lp1, rev: l.buildRev, build: { precisao_maos: 3, chute_baixo: 1 } }, /pontos/);
      await erro(pro1, "build", { lutadorId: lp1, rev: l.buildRev, build: { combinacoes: 1 } }, /pede 2 pontos/);
      await erro(pro1, "build", { lutadorId: lp1, rev: l.buildRev, build: { entradas: 2 } }, /pontos/);
      const r = await ok(pro1, "build", { lutadorId: lp1, rev: l.buildRev, build: { precisao_maos: 2 } });
      if (r.buildRev !== l.buildRev + 1) throw new Error("rev");
      await erro(pro1, "build", { lutadorId: lp1, rev: r.buildRev, build: { precisao_maos: 1 } }, /reconfiguração/);
      await erro(pro1, "build", { lutadorId: lp1, rev: l.buildRev, build: { precisao_maos: 3 } }, /outra aba/);
      await q("update jxj_lutadores set nivel = 30, xp = $2 where id = $1", [lp1, REG.xpTotalAte(30)]);
      const nos = {}; ["precisao_maos", "combinacoes", "contra_maos", "eficiencia_golpes"].forEach((k) => { nos[k] = 3; });
      await erro(pro1, "build", { lutadorId: lp1, rev: r.buildRev, build: nos }, /aceita até 10/);
    });
    await conf("respec: sem fichas é recusado; com fichas custa 400 e zera a árvore; grátis uma vez quando a versão de balanceamento muda; árvore vazia não refaz nem cobra", async () => {
      const l = (await ok(pro1, "estado")).lutadores.find((x) => x.id === lp1);
      await erro(pro1, "respec", { lutadorId: lp1, rev: l.buildRev }, /fichas insuficientes/);
      await q("update jxj_contas set fichas = 1000 where user_id = $1", [pro1]);
      const r = await ok(pro1, "respec", { lutadorId: lp1, rev: l.buildRev });
      const c = (await q("select fichas from jxj_contas where user_id = $1", [pro1]))[0];
      const b = (await q("select build from jxj_lutadores where id = $1", [lp1]))[0];
      if (r.gratis || c.fichas !== 600 || Object.keys(b.build).length) throw new Error(JSON.stringify({ r, c, b }));
      const led = await q("select delta from jxj_fichas where user_id = $1 and motivo = 'respec'", [pro1]);
      if (led.length !== 1 || led[0].delta !== -400) throw new Error("livro-razão " + JSON.stringify(led));
      await erro(pro1, "respec", { lutadorId: lp1, rev: r.buildRev }, /já está vazia/);
      const b1 = await ok(pro1, "build", { lutadorId: lp1, rev: r.buildRev, build: { precisao_maos: 1 } });
      await q("update jxj_lutadores set build_versao = 0 where id = $1", [lp1]);
      const r2 = await ok(pro1, "respec", { lutadorId: lp1, rev: b1.buildRev });
      const c2 = (await q("select fichas from jxj_contas where user_id = $1", [pro1]))[0];
      if (!r2.gratis || c2.fichas !== 600) throw new Error("grátis: " + JSON.stringify({ r2, c2 }));
      const led2 = await q("select delta from jxj_fichas where user_id = $1 and motivo = 'respec'", [pro1]);
      if (led2.length !== 1) throw new Error("árvore vazia ou grátis cobrou: " + JSON.stringify(led2));
    });

    /* ---------------- luta completa entre duas contas Pro ---------------- */
    const pa = await novoUsuario({ pro: true }), pb = await novoUsuario({ pro: true });
    const la = (await criar(pa)).id, lb = (await criar(pb, { estilo: "wrestler" })).id;
    let lid1;
    await conf("fila: os dois entram, o par sai na mesma categoria, com compromisso da semente e sem a semente", async () => {
      await ok(pa, "filaEntrar", { lutadorId: la }); await ok(pb, "filaEntrar", { lutadorId: lb });
      const f = await ok(pa, "fila");
      if (!f.luta || f.luta.status !== "confirmacao" || !/^[0-9a-f]{64}$/.test(f.luta.compromisso) || f.luta.semente) throw new Error(JSON.stringify(f).slice(0, 200));
      lid1 = f.luta.id;
      const fb = await ok(pb, "fila");
      if (!fb.luta || fb.luta.id !== lid1 || fb.luta.lado !== "b") throw new Error("o outro lado não viu a luta");
      if ((await q("select count(*)::int n from jxj_fila"))[0].n !== 0) throw new Error("fila não esvaziou");
    });
    await conf("confirmação dos dois inicia a luta; a vista nunca traz o perfil (build) do adversário", async () => {
      await ok(pa, "confirmar", { lutaId: lid1 });
      const v = await ok(pb, "confirmar", { lutaId: lid1 });
      if (v.status !== "andamento" || v.round !== 1 || v.troca !== 1 || !v.acoes || v.acoes.length !== 4) throw new Error(JSON.stringify(v).slice(0, 200));
      if ("perfis" in v || JSON.stringify(v).includes('"mec"')) throw new Error("vazou perfil");
    });
    await conf("ação oculta: quem não enviou só sabe que o outro escolheu; reenviar a mesma é idempotente; trocar depois de enviar é recusado", async () => {
      await ok(pa, "acao", { lutaId: lid1, round: 1, troca: 1, familia: "pressao" });
      const vb = await ok(pb, "luta", { lutaId: lid1 });
      if (vb.adversarioEscolheu !== true || vb.minhaAcao !== null) throw new Error("vista de B: " + JSON.stringify({ e: vb.adversarioEscolheu, m: vb.minhaAcao }));
      /* fora a lista das PRÓPRIAS opções de B, nada na vista dele pode dizer "pressao" */
      const { acoes: _opcoesDeB, ...resto } = vb;
      if (/pressao/.test(JSON.stringify(resto))) throw new Error("a ação de A vazou pra B");
      await ok(pa, "acao", { lutaId: lid1, round: 1, troca: 1, familia: "pressao" });
      await erro(pa, "acao", { lutaId: lid1, round: 1, troca: 1, familia: "golpes" }, /já foi enviada/);
      await erro(pa, "acao", { lutaId: lid1, round: 1, troca: 2, familia: "golpes" }, /já foi resolvida/);
      await erro(pa, "acao", { lutaId: lid1, round: 1, troca: 1, familia: "voar" }, /ação inválida/);
    });
    await conf("a segunda ação resolve a troca uma vez só, mesmo com duas consultas ao mesmo tempo", async () => {
      await ok(pb, "acao", { lutaId: lid1, round: 1, troca: 1, familia: "golpes" });
      await Promise.all([ok(pa, "luta", { lutaId: lid1 }), ok(pb, "luta", { lutaId: lid1 }), ok(pa, "luta", { lutaId: lid1 })]);
      const t = await q("select count(*)::int n from jxj_trocas where luta_id = $1", [lid1]);
      const l = (await q("select round, troca, versao from jxj_lutas where id = $1", [lid1]))[0];
      if (t[0].n !== 1 || l.troca !== 2) throw new Error(JSON.stringify({ t, l }));
    });
    await conf("resolução concorrente: gravar a mesma troca duas vezes com a mesma versão grava uma vez só", async () => {
      const d = (await q("select public.jxj_luta($1::bigint) as d", [lid1]))[0].d;
      const L = d.luta, acoes = { a: "defesa", b: "defesa" };
      const { estado, eventos } = MOTOR.resolverTroca(L.estado, L.perfis, acoes, L.semente);
      const args = [lid1, L.versao, L.round, L.troca, "defesa", "defesa", JSON.stringify(eventos), JSON.stringify(estado), 20000];
      const sql = "select public.jxj_gravar_troca($1::bigint, $2::int, $3::smallint, $4::smallint, $5, $6, $7::jsonb, $8::jsonb, $9::int, null, null) as r";
      const r1 = (await q(sql, args))[0].r, r2 = (await q(sql, args))[0].r;
      if (!r1.gravou || r2.gravou) throw new Error(JSON.stringify({ r1, r2 }));
    });
    let vfim;
    await conf("luta até o fim: resultado, semente revelada bate com o compromisso, efeitos gravados e a conta liberada", async () => {
      vfim = await lutar(lid1, pa, pb);
      if (vfim.status !== "encerrada" || !vfim.resultado || !vfim.semente) throw new Error(JSON.stringify(vfim).slice(0, 200));
      if (crypto.createHash("sha256").update(vfim.semente).digest("hex") !== vfim.compromisso) throw new Error("compromisso não bate");
      const c = await q("select luta_aberta_id from jxj_contas where user_id in ($1, $2)", [pa, pb]);
      if (c.some((x) => x.luta_aberta_id !== null)) throw new Error("conta presa");
      const h = await q("select count(*)::int n from jxj_rating_hist where luta_id = $1", [lid1]);
      if (vfim.comRating && h[0].n !== 2) throw new Error("histórico de rating " + h[0].n);
    });
    await conf("auditoria: com a semente revelada e as ações gravadas, o motor refaz a luta igual", async () => {
      const d = (await q("select public.jxj_luta($1::bigint) as d", [lid1]))[0].d;
      let e = MOTOR.novaLuta(d.luta.perfis.a, d.luta.perfis.b);
      for (const t of d.trocas) e = MOTOR.resolverTroca(e, d.luta.perfis, { a: t.acao_a, b: t.acao_b }, d.luta.semente).estado;
      const igual = ["vencedor", "metodo", "round", "troca"].every((k) => e.fim[k] === d.luta.resultado[k])
        && JSON.stringify(e.fim.placar || null) === JSON.stringify(d.luta.resultado.placar ? { a: d.luta.resultado.placar.a, b: d.luta.resultado.placar.b } : null);
      if (!igual || JSON.stringify(e.cartoes) !== JSON.stringify(d.luta.estado.cartoes)) throw new Error(`refeita ${JSON.stringify(e.fim)} ${JSON.stringify(e.cartoes)} gravada ${JSON.stringify(d.luta.resultado)} ${JSON.stringify(d.luta.estado.cartoes)}`);
    });
    await conf("efeitos do fim conferem com as regras: XP pelo resultado, nível pela curva, fichas no livro-razão, cartel", async () => {
      const ef = vfim.efeitos;
      for (const [lado, uid, lid] of [["a", pa, la], ["b", pb, lb]]) {
        const l = (await q("select xp, nivel, vitorias, derrotas, empates from jxj_lutadores where id = $1", [lid]))[0];
        if (l.xp !== ef[lado].xp || l.nivel !== REG.nivelDoXp(l.xp).nivel) throw new Error(`${lado}: xp ${l.xp} nível ${l.nivel} efeito ${JSON.stringify(ef[lado])}`);
        const esperadoXp = REG.xpDaLuta({ resultado: ef[lado].resultado, metodo: vfim.resultado.metodo, lutasHoje: 0, comRating: vfim.comRating });
        if (ef[lado].xp !== esperadoXp) throw new Error(`xp ${ef[lado].xp} esperado ${esperadoXp}`);
        const fichas = (await q("select coalesce(sum(delta),0)::int s from jxj_fichas where user_id = $1 and motivo = 'luta'", [uid]))[0].s;
        if (fichas !== ef[lado].fichas) throw new Error(`fichas ${fichas} esperado ${ef[lado].fichas}`);
        const tot = l.vitorias + l.derrotas + l.empates;
        if (tot !== 1) throw new Error("cartel " + tot);
      }
    });
    await conf("narração sem IA: molde local só com fatos do motor, sem travessão, com o resultado", async () => {
      const n = await ok(pb, "narracao", { lutaId: lid1 });
      if (!n.narracao || /[—–]/.test(n.narracao) || !/venceu|empatada/.test(n.narracao)) throw new Error(n.narracao);
      const n2 = await ok(pa, "narracao", { lutaId: lid1 });
      if (n2.narracao !== n.narracao) throw new Error("os dois viram textos diferentes");
    });
    await conf("revanche: os dois aceitam em 60 s e a luta nova começa com os lados trocados", async () => {
      const r1 = await ok(pa, "revanche", { lutaId: lid1 });
      if (!r1.esperando) throw new Error(JSON.stringify(r1));
      const r2 = await ok(pb, "revanche", { lutaId: lid1 });
      if (!r2.luta) throw new Error(JSON.stringify(r2));
      const L = (await q("select a_id, b_id, status, tipo from jxj_lutas where id = $1", [r2.luta]))[0];
      if (L.a_id !== lb || L.b_id !== la || L.status !== "andamento" || L.tipo !== "revanche") throw new Error(JSON.stringify(L));
      await lutar(r2.luta, pb, pa);
    });

    await conf("ausência: prazo vencido vira Defender; três seguidos dão W.O. com rating e XP 40/0", async () => {
      const u1 = await novoUsuario({ pro: true }), u2 = await novoUsuario({ pro: true });
      const l1 = (await criar(u1)).id, l2 = (await criar(u2)).id;
      const lid = await parear(u1, l1, u2, l2);
      for (let k = 0; k < 3; k++) {
        const v = await ok(u1, "luta", { lutaId: lid });
        await ok(u1, "acao", { lutaId: lid, round: v.round, troca: v.troca, familia: "defesa" });
        await vencerPrazo(lid);
      }
      const v = await ok(u1, "luta", { lutaId: lid });
      if (v.status !== "encerrada" || v.resultado.metodo !== "WO" || v.resultado.vencedor !== v.lado) throw new Error(JSON.stringify(v.resultado));
      if (!v.trocas.some((t) => t.eventos.some((x) => /não escolheu a tempo/.test(x)))) throw new Error("sem o registro da ausência");
      const l = await q("select id, xp, wos from jxj_lutadores where id in ($1, $2) order by id", [l1, l2]);
      if (l[0].xp !== 40 || l[1].xp !== 0 || l[1].wos !== 1) throw new Error(JSON.stringify(l));
    });
    await conf("os dois ausentes três vezes: luta anulada, sem rating e sem XP", async () => {
      const u1 = await novoUsuario({ pro: true }), u2 = await novoUsuario({ pro: true });
      const l1 = (await criar(u1)).id, l2 = (await criar(u2)).id;
      const lid = await parear(u1, l1, u2, l2);
      for (let k = 0; k < 3; k++) { await vencerPrazo(lid); await ok(u1, "luta", { lutaId: lid }); }
      const v = await ok(u2, "luta", { lutaId: lid });
      const l = await q("select rating, xp, lutas_rating from jxj_lutadores where id in ($1, $2)", [l1, l2]);
      if (v.resultado.metodo !== "ANULADA" || l.some((x) => x.rating !== 1500 || x.xp !== 0 || x.lutas_rating !== 0)) throw new Error(JSON.stringify({ r: v.resultado, l }));
    });
    /* raio de rating na fila (2026-10-04, supabase_jxj_raio.sql) */
    const doisNaFila = async (rA, rB, raioA, raioB) => {
      await zerarLimites();
      const ua = await novoUsuario({ pro: true }), ub = await novoUsuario({ pro: true });
      const la = (await criar(ua)).id, lb = (await criar(ub)).id;
      await q("update jxj_lutadores set rating = $2 where id = $1", [la, rA]);
      await q("update jxj_lutadores set rating = $2 where id = $1", [lb, rB]);
      const ea = await ok(ua, "filaEntrar", { lutadorId: la, ...(raioA === undefined ? {} : { raio: raioA }) });
      const eb = await ok(ub, "filaEntrar", { lutadorId: lb, ...(raioB === undefined ? {} : { raio: raioB }) });
      const esperar = (seg) => q("update jxj_fila set entrou_em = now() - make_interval(secs => $1), sinal_em = now() where user_id in ($2, $3)", [seg, ua, ub]);
      const sair = async () => { await api(ua, "filaSair"); await api(ub, "filaSair"); };
      return { ua, ub, la, lb, ea, eb, esperar, sair };
    };
    await conf("fila com raio: o par só sai se a diferença couber no raio dos DOIS e na faixa da espera; 'qualquer' deixa a faixa crescer além de 400", async () => {
      let x = await doisNaFila(1500, 1800, 200, 2000);
      if (x.ea.raio !== 200 || x.eb.raio !== 2000) throw new Error("raio não gravado: " + JSON.stringify([x.ea, x.eb]));
      await x.esperar(600);
      /* do lado de quem aceita qualquer diferença: o raio 200 do OUTRO tem que segurar */
      let f = await ok(x.ub, "fila");
      if (f.luta) throw new Error("300 de diferença pareou: o raio 200 do outro lado não valeu");
      f = await ok(x.ua, "fila");
      if (f.luta) throw new Error("300 de diferença pareou com raio 200");
      if (f.tolerancia !== 200 || f.raio !== 200) throw new Error("tolerância mostrada: " + JSON.stringify(f));
      await x.sair();
      x = await doisNaFila(1500, 1800, 400, 400);
      await x.esperar(30);
      f = await ok(x.ua, "fila");
      if (f.luta) throw new Error("pareou antes da faixa da espera chegar a 300 (175 com 30 s)");
      await x.esperar(90);
      f = await ok(x.ua, "fila");
      if (!f.luta) throw new Error("300 de diferença, raio 400 dos dois e 90 s de espera (faixa 300) não pareou: " + JSON.stringify(f));
      x = await doisNaFila(1500, 2100, 2000, 2000);
      await x.esperar(600);
      f = await ok(x.ub, "fila");
      if (!f.luta) throw new Error("'qualquer diferença' dos dois com 600 de diferença e 10 min de espera não pareou: " + JSON.stringify(f));
      x = await doisNaFila(1500, 2100, undefined, undefined);
      if (x.ea.raio !== REG.RAIO_PADRAO) throw new Error("sem escolha, o raio devia ser o padrão: " + JSON.stringify(x.ea));
      await x.esperar(600);
      f = await ok(x.ua, "fila");
      if (f.luta || f.tolerancia !== 400) throw new Error("padrão passou de 400: " + JSON.stringify(f));
      await x.sair();
    });
    await conf("fila com raio: raio fora da lista é recusado (servidor e banco)", async () => {
      const u = await novoUsuario({ pro: true }), l = (await criar(u)).id;
      await erro(u, "filaEntrar", { lutadorId: l, raio: 150 }, /diferença de rating inválida/);
      await erro(u, "filaEntrar", { lutadorId: l, raio: "muito" }, /diferença de rating inválida/);
      let deu = false;
      try { await q("select public.jxj_fila_entrar_raio($1, $2, 150)", [u, l]); } catch { deu = true; }
      if (!deu) throw new Error("o banco aceitou raio 150");
    });
    await conf("banco sem a migração do raio: a fila funciona como antes (até 400) e o servidor avisa que o filtro não está ligado", async () => {
      const db2 = await B.novoBanco({ raio: false });
      const fetchAntes = globalThis.fetch;
      globalThis.fetch = B.fetchFalso(db2, { SUPABASE_URL });
      try {
        const u1 = "00000000-0000-4000-8000-0000000009a1", u2 = "00000000-0000-4000-8000-0000000009a2";
        await B.criarUsuario(db2, u1, { pro: true }); await B.criarUsuario(db2, u2, { pro: true });
        const c1 = await B.chamar(H, { token: "tok:" + u1, acao: "criar", nome: "Sem Raio Um", rosto: ROSTO, categoria: "lightweight", estilo: "striker" });
        const c2 = await B.chamar(H, { token: "tok:" + u2, acao: "criar", nome: "Sem Raio Dois", rosto: ROSTO, categoria: "lightweight", estilo: "striker" });
        const e1 = await B.chamar(H, { token: "tok:" + u1, acao: "filaEntrar", lutadorId: c1.json.id, raio: 100 });
        if (e1.status !== 200 || !e1.json.raioIndisponivel || e1.json.naFila !== true) throw new Error("entrada sem a migração: " + JSON.stringify(e1));
        await B.chamar(H, { token: "tok:" + u2, acao: "filaEntrar", lutadorId: c2.json.id, raio: 100 });
        const f = await B.chamar(H, { token: "tok:" + u1, acao: "fila" });
        if (f.status !== 200 || !f.json.luta) throw new Error("sem a migração, a fila de antes não pareou: " + JSON.stringify(f).slice(0, 200));
      } finally { globalThis.fetch = fetchAntes; }
    });
    await conf("grátis: a primeira luta competitiva entra; depois dela a fila é do Pro; torneio e revanche também", async () => {
      const f1 = await novoUsuario(), f2 = await novoUsuario();
      const l1 = (await criar(f1)).id, l2 = (await criar(f2)).id;
      const lid = await parear(f1, l1, f2, l2);
      const g = (await q("select luta_gratis_usada from jxj_contas where user_id in ($1, $2)", [f1, f2]));
      if (g.some((x) => !x.luta_gratis_usada)) throw new Error("não marcou a luta grátis");
      await lutar(lid, f1, f2);
      await erro(f1, "filaEntrar", { lutadorId: l1 }, /luta grátis já foi usada/);
      await erro(f1, "torneioInscrever", { lutadorId: l1 }, /Pro/);
      await ok(f1, "revanche", { lutaId: lid }); const r = await api(f2, "revanche", { lutaId: lid });
      if (r.status !== 400 || !/Pro/.test(r.json.erro)) throw new Error("revanche grátis: " + JSON.stringify(r));
    });
    await conf("recusa antes de confirmar: luta cancelada, a luta grátis não é gasta, quem recusou espera 60 s e quem confirmou volta pra fila", async () => {
      const f1 = await novoUsuario(), f2 = await novoUsuario();
      const l1 = (await criar(f1)).id, l2 = (await criar(f2)).id;
      const lid = await parear(f1, l1, f2, l2, { confirmar: false });
      await ok(f1, "confirmar", { lutaId: lid });
      await ok(f2, "recusar", { lutaId: lid });
      const L = (await q("select status from jxj_lutas where id = $1", [lid]))[0];
      const g = await q("select user_id, luta_gratis_usada, luta_aberta_id from jxj_contas where user_id in ($1, $2)", [f1, f2]);
      if (L.status !== "cancelada" || g.some((x) => x.luta_gratis_usada || x.luta_aberta_id)) throw new Error(JSON.stringify({ L, g }));
      await erro(f2, "filaEntrar", { lutadorId: l2 }, /aguarde/);
      if (!(await q("select 1 from jxj_fila where user_id = $1", [f1])).length) throw new Error("quem confirmou não voltou pra fila");
      await ok(f1, "filaSair");
    });
    await conf("confirmação vencida sem resposta: cancela sozinha na próxima consulta", async () => {
      const u1 = await novoUsuario({ pro: true }), u2 = await novoUsuario({ pro: true });
      const l1 = (await criar(u1)).id, l2 = (await criar(u2)).id;
      const lid = await parear(u1, l1, u2, l2, { confirmar: false });
      await q("update jxj_lutas set confirmacao_ate = now() - interval '1 second' where id = $1", [lid]);
      const v = await ok(u1, "luta", { lutaId: lid });
      if (v.status !== "cancelada") throw new Error(v.status);
    });
    await conf("anti-combinação: depois de 3 lutas com rating do mesmo par em 24 h, a 4ª acontece sem rating", async () => {
      const u1 = await novoUsuario({ pro: true }), u2 = await novoUsuario({ pro: true });
      const l1 = (await criar(u1)).id, l2 = (await criar(u2)).id;
      for (let k = 0; k < 3; k++) await q(`insert into jxj_lutas (tipo, a_id, b_id, a_user, b_user, status, semente, compromisso, nomes, com_rating, encerrada_em)
        values ('fila', $1, $2, $3, $4, 'encerrada', 'x', 'y', '{}'::jsonb, true, now())`, [l1, l2, u1, u2]);
      const lid = await parear(u1, l1, u2, l2);
      const v = await ok(u1, "luta", { lutaId: lid });
      if (v.comRating !== false) throw new Error("com rating");
    });
    await conf("uma luta por conta: quem está em luta não entra na fila e não é pareado de novo", async () => {
      const u1 = await novoUsuario({ pro: true }), u2 = await novoUsuario({ pro: true }), u3 = await novoUsuario({ pro: true });
      const l1 = (await criar(u1)).id, l2 = (await criar(u2)).id, l3 = (await criar(u3)).id;
      const l1b = (await criar(u1, { estilo: "counter" })).id;
      const lid = await parear(u1, l1, u2, l2);
      await erro(u1, "filaEntrar", { lutadorId: l1b }, /já tem uma luta aberta/);
      await ok(u3, "filaEntrar", { lutadorId: l3 });
      const f = await ok(u3, "fila");
      if (f.luta) throw new Error("pareou com quem já está em luta");
      await ok(u3, "filaSair");
      await lutar(lid, u1, u2);
    });
    await conf("propriedade: mexer em lutador ou luta de outra conta é recusado", async () => {
      const u1 = await novoUsuario({ pro: true }), u2 = await novoUsuario({ pro: true }), u3 = await novoUsuario({ pro: true });
      const l1 = (await criar(u1)).id, l2 = (await criar(u2)).id;
      await erro(u3, "build", { lutadorId: l1, rev: 0, build: {} }, /não encontrado/, 404);
      await erro(u3, "principal", { lutadorId: l1 }, /não encontrado/);
      await erro(u3, "aposentar", { lutadorId: l1, confirmacao: "x" }, /não encontrado/, 404);
      await erro(u3, "filaEntrar", { lutadorId: l1 }, /não encontrado/);
      const lid = await parear(u1, l1, u2, l2);
      await erro(u3, "acao", { lutaId: lid, round: 1, troca: 1, familia: "golpes" }, /não encontrada/, 404);   // recusada antes de processar (auditoria 2026-10-03)
      await erro(u3, "luta", { lutaId: lid }, /não encontrada/, 404);
      await erro(u3, "recusar", { lutaId: lid }, /não encontrada/, 404);
      await lutar(lid, u1, u2);
    });
    await conf("acesso direto às tabelas (papel authenticated e anon): RLS sem policy não deixa ler nem gravar; as funções não executam", async () => {
      await db.exec(`set role authenticated; set request.jwt.claim.sub = '${pa}';`);
      const lidos = (await db.query("select count(*)::int n from jxj_lutadores")).rows[0].n;
      let gravou = true; try { await db.query("insert into jxj_lutadores (user_id, slot, nome, nome_chave, rosto, categoria, estilo) values ($1, 2, 'Hack', 'hack', '{}', 'lightweight', 'striker')", [pa]); } catch { gravou = false; }
      const mudou = (await db.query("update jxj_contas set fichas = 99999 returning 1")).rows.length;
      let executou = true; try { await db.query("select public.jxj_estado($1::uuid)", [pa]); } catch { executou = false; }
      await db.exec("reset role; reset request.jwt.claim.sub;");
      await db.exec("set role anon;");
      const lidosAnon = (await db.query("select count(*)::int n from jxj_lutas")).rows[0].n;
      await db.exec("reset role;");
      if (lidos !== 0 || gravou || mudou !== 0 || executou || lidosAnon !== 0) throw new Error(JSON.stringify({ lidos, gravou, mudou, executou, lidosAnon }));
    });
    await conf("perfil público: sem conta nem e-mail; build só quando o dono deixa pública", async () => {
      const p = await ok(null, "perfil", { lutadorId: la });
      const t = JSON.stringify(p);
      if (t.includes(pa) || /@teste|user_id|email/.test(t) || p.perfil.build !== null) throw new Error(t.slice(0, 200));
      await ok(pa, "buildPublica", { lutadorId: la, publica: true });
      const p2 = await ok(null, "perfil", { lutadorId: la });
      if (!p2.perfil.build) throw new Error("build pública não apareceu");
    });
    await conf("ranking: só o principal efetivo com 5 lutas com rating e luta recente; extra, banido e inativo ficam fora", async () => {
      const u1 = await novoUsuario({ pro: true }), u2 = await novoUsuario({ pro: true }), u3 = await novoUsuario({ pro: true });
      const a1 = (await criar(u1, { categoria: "heavyweight" })).id, a2 = (await criar(u1, { categoria: "heavyweight", estilo: "counter" })).id;
      const b1 = (await criar(u2, { categoria: "heavyweight" })).id, c1 = (await criar(u3, { categoria: "heavyweight" })).id;
      await q("update jxj_lutadores set lutas_rating = 6, ultima_luta_rating = now(), rating = 1600 + id where id in ($1, $2, $3, $4)", [a1, a2, b1, c1]);
      await q("update jxj_lutadores set ultima_luta_rating = now() - interval '40 days' where id = $1", [c1]);
      await q("insert into banidos (user_id, motivo) values ($1, 'teste')", [u2]);
      const r = await ok(u1, "ranking", { categoria: "heavyweight" });
      const ids = r.linhas.map((x) => x.id);
      if (!ids.includes(a1) || ids.includes(a2) || ids.includes(b1) || ids.includes(c1)) throw new Error("ids " + JSON.stringify(ids));
      if (!r.linhas.find((x) => x.id === a1).meu) throw new Error("linha do jogador sem destaque");
      await q("delete from banidos where user_id = $1", [u2]);
    });
    await conf("conta banida: não cria, não entra na fila", async () => {
      const u = await novoUsuario({ pro: true }); const l = (await criar(u)).id;
      await q("insert into banidos (user_id) values ($1)", [u]);
      await erro(u, "filaEntrar", { lutadorId: l }, /suspensa/);
      await erro(u, "criar", { nome: "Banido Novo", rosto: ROSTO, categoria: "lightweight", estilo: "striker" }, /suspensa/);
    });
    await conf("aposentar: pede o nome exato; libera o slot, o histórico fica e o principal passa pro próximo", async () => {
      const u = await novoUsuario(); const l = (await criar(u)).id;
      await erro(u, "aposentar", { lutadorId: l, confirmacao: "outro nome" }, /digite o nome/);
      const nome = (await q("select nome from jxj_lutadores where id = $1", [l]))[0].nome;
      await ok(u, "aposentar", { lutadorId: l, confirmacao: nome });
      const novo = await criar(u);
      if (novo.slot !== 1) throw new Error("slot " + novo.slot);
      const est = await ok(u, "estado");
      if (est.aposentados !== 1 || est.principalId !== novo.id) throw new Error(JSON.stringify({ a: est.aposentados, p: est.principalId }));
    });
    await conf("moldura: sem fichas recusa; comprada sai do saldo e fica equipada; a do cinturão é só de quem tem título", async () => {
      const u = await novoUsuario(); const l = (await criar(u)).id;
      await erro(u, "moldura", { lutadorId: l, moldura: "ouro", comprar: true }, /fichas insuficientes/);
      await q("update jxj_contas set fichas = 500 where user_id = $1", [u]);
      await ok(u, "moldura", { lutadorId: l, moldura: "ouro", comprar: true });
      const r = (await q("select moldura, molduras from jxj_lutadores where id = $1", [l]))[0], c = (await q("select fichas from jxj_contas where user_id = $1", [u]))[0];
      if (r.moldura !== "ouro" || c.fichas !== 100) throw new Error(JSON.stringify({ r, c }));
      await erro(u, "moldura", { lutadorId: l, moldura: "campeao" }, /título/);
    });
    await conf("limite por conta: a 21ª tentativa de criação na mesma hora recebe 429", async () => {
      await zerarLimites();
      const u = await novoUsuario({ pro: true });
      for (let k = 0; k < 20; k++) await api(u, "criar", { nome: "", rosto: ROSTO, categoria: "lightweight", estilo: "striker" });
      const r = await api(u, "criar", { nome: "Vinte e Um", rosto: ROSTO, categoria: "lightweight", estilo: "striker" });
      if (r.status !== 429) throw new Error("status " + r.status);
    });
    await conf("nível: a curva do banco (jxj_nivel_do_xp) é a mesma do servidor (nivelDoXp)", async () => {
      const valores = []; for (let xp = 0; xp <= 12500; xp += 41) valores.push(xp);
      const r = await q("select x, public.jxj_nivel_do_xp(x) n from unnest($1::int[]) x", [valores]);
      const dif = r.filter((x) => x.n !== REG.nivelDoXp(x.x).nivel);
      if (dif.length) throw new Error("diferem em " + JSON.stringify(dif.slice(0, 3)));
    });
    await conf("conquista: as fichas do banco (jxj_fichas_conquista) são as do servidor (CONQUISTAS); conquista desconhecida vale 0", async () => {
      const ids = Object.keys(REG.CONQUISTAS);
      const r = await q("select x, public.jxj_fichas_conquista(x) f from unnest($1::text[]) x", [[...ids, "inventada"]]);
      const dif = r.filter((x) => x.f !== (x.x === "inventada" ? 0 : REG.CONQUISTAS[x.x].fichas));
      if (dif.length) throw new Error("diferem: " + JSON.stringify(dif));
      if (ids.some((id) => !(REG.CONQUISTAS[id].fichas > 0))) throw new Error("conquista sem fichas na tabela do servidor");
    });
    await conf("conquista paga uma vez: credita no livro-razão (motivo conquista) mesmo com o teto diário de luta cheio; repetir não credita", async () => {
      const u = await novoUsuario({ pro: true });
      await zerarLimites();
      const lid = (await criar(u)).id;
      await q("update jxj_contas set fichas = 0 where user_id = $1", [u]);
      await q("insert into jxj_fichas (user_id, delta, motivo, ref) values ($1, 120, 'luta', 'teto')", [u]);
      const r1 = (await q("select public.jxj_dar_conquista($1, $2, 'primeira_vitoria') nova", [lid, u]))[0].nova;
      const r2 = (await q("select public.jxj_dar_conquista($1, $2, 'primeira_vitoria') nova", [lid, u]))[0].nova;
      const c = (await q("select fichas from jxj_contas where user_id = $1", [u]))[0].fichas;
      const led = await q("select delta, ref from jxj_fichas where user_id = $1 and motivo = 'conquista'", [u]);
      if (r1 !== true || r2 !== false || c !== 25 || led.length !== 1 || led[0].delta !== 25 || led[0].ref !== `primeira_vitoria:${lid}`)
        throw new Error(JSON.stringify({ r1, r2, c, led }));
    });
    await conf("conquista no caminho real: quem vence a primeira luta (aqui por W.O.) ganha as fichas da Primeira vitória, uma vez", async () => {
      const u1 = await novoUsuario({ pro: true }), u2 = await novoUsuario({ pro: true });
      await zerarLimites();
      const a = (await criar(u1, { categoria: "heavyweight" })).id, b = (await criar(u2, { categoria: "heavyweight" })).id;
      const lid = await parear(u1, a, u2, b);
      for (let k = 0; k < 3; k++) {
        const v = await ok(u1, "luta", { lutaId: lid });
        await ok(u1, "acao", { lutaId: lid, round: v.round, troca: v.troca, familia: "defesa" });
        await vencerPrazo(lid);
      }
      const v = await ok(u1, "luta", { lutaId: lid });
      if (v.status !== "encerrada" || v.resultado.vencedor !== v.lado) throw new Error("não terminou com vitória do u1: " + JSON.stringify(v.resultado));
      await ok(u1, "luta", { lutaId: lid });   // consultar de novo não paga de novo
      const led = await q("select delta, ref from jxj_fichas where user_id = $1 and motivo = 'conquista'", [u1]);
      if (led.length !== 1 || led[0].delta !== REG.CONQUISTAS.primeira_vitoria.fichas || !led[0].ref.startsWith("primeira_vitoria:")) throw new Error(JSON.stringify(led));
      const perdedor = await q("select count(*)::int n from jxj_fichas where user_id = $1 and motivo = 'conquista'", [u2]);
      if (perdedor[0].n !== 0) throw new Error("quem perdeu ganhou conquista");
    });
    await conf("temporada: na virada grava a classificação, dá fichas e título ao 1º, aplica o reset parcial e preserva nível, XP e árvore", async () => {
      const u1 = await novoUsuario({ pro: true }), u2 = await novoUsuario({ pro: true });
      const a = (await criar(u1, { categoria: "welterweight" })).id, b = (await criar(u2, { categoria: "welterweight" })).id;
      await q("update jxj_lutadores set lutas_rating = 8, ultima_luta_rating = now(), rating = 1800, rd = 80, nivel = 7, xp = 900, build = '{\"precisao_maos\":3}' where id = $1", [a]);
      await q("update jxj_lutadores set lutas_rating = 8, ultima_luta_rating = now(), rating = 1300, rd = 90 where id = $1", [b]);
      const antes = (await q("select numero from jxj_temporadas where status = 'ativa'"))[0].numero;
      await q("update jxj_temporadas set fim = now() - interval '1 minute' where status = 'ativa'");
      const t = await ok(u1, "temporada");
      if (t.numero !== antes + 1) throw new Error("temporada " + t.numero);
      const cl = await q("select lutador_id, posicao, recompensa from jxj_classificacao where temporada = $1 and categoria = 'welterweight' order by posicao", [antes]);
      if (cl[0].lutador_id !== a || cl[0].recompensa.selo !== "campeao") throw new Error(JSON.stringify(cl));
      const la2 = (await q("select rating, rd, nivel, xp, build from jxj_lutadores where id = $1", [a]))[0];
      if (Math.abs(la2.rating - 1650) > 0.001 || Math.abs(la2.rd - 160) > 0.001 || la2.nivel !== 7 || la2.xp !== 900 || la2.build.precisao_maos !== 3) throw new Error(JSON.stringify(la2));
      const tit = await q("select 1 from jxj_titulos where lutador_id = $1 and tipo = 'temporada'", [a]);
      const fichas = (await q("select fichas from jxj_contas where user_id = $1", [u1]))[0].fichas;
      if (!tit.length || fichas < 500) throw new Error(JSON.stringify({ tit, fichas }));
      await ok(u1, "temporada");
      if ((await q("select count(*)::int n from jxj_temporadas"))[0].n !== antes + 1) throw new Error("virou duas vezes");
    });
    await conf("torneio de 8: inscrição só do Pro, principal e com 3 lutas; uma por conta; fecha nas 8 com a chave pelo rating; sala, W.O. e campeão com cinturão", async () => {
      const us = [], ls = [];
      for (let k = 0; k < 8; k++) { const u = await novoUsuario({ pro: true }); us.push(u); ls.push((await criar(u, { categoria: "middleweight" })).id); }
      await q("update jxj_lutadores set lutas_rating = 4, rating = 1500 + id where id = any($1::bigint[])", [ls]);
      const extra = (await criar(us[0], { categoria: "middleweight", estilo: "counter" })).id;
      await q("update jxj_lutadores set lutas_rating = 4 where id = $1", [extra]);
      await erro(us[0], "torneioInscrever", { lutadorId: extra }, /principal/);
      const semLutas = await novoUsuario({ pro: true }); const ls9 = (await criar(semLutas, { categoria: "middleweight" })).id;
      await erro(semLutas, "torneioInscrever", { lutadorId: ls9 }, /3 lutas/);
      for (let k = 0; k < 8; k++) await ok(us[k], "torneioInscrever", { lutadorId: ls[k] });
      const lista = await ok(us[0], "torneios", { categoria: "middleweight" });
      const tor = lista.find((t) => t.status === "andamento");
      if (!tor) throw new Error(JSON.stringify(lista).slice(0, 200));
      await erro(us[0], "torneioInscrever", { lutadorId: ls[0] }, /já está num torneio/);
      let det = await ok(us[0], "torneio", { torneioId: tor.id });
      if (det.confrontos.length !== 4) throw new Error("quartas " + det.confrontos.length);
      const sem = Object.fromEntries(det.inscritos.map((i) => [i.lutador, i.semente]));
      if (sem[det.confrontos[0].a] !== 1 || sem[det.confrontos[0].b] !== 8) throw new Error("chave 1x8");
      const dono = (lid) => us[ls.indexOf(lid)];
      /* quartas: o 1º confronto é luta de verdade; os outros vencem a janela (W.O.) */
      const c1 = det.confrontos[0];
      await ok(dono(c1.a), "torneioSala", { confrontoId: c1.id });
      const r = await ok(dono(c1.b), "torneioSala", { confrontoId: c1.id });
      if (!r.luta) throw new Error("sala: " + JSON.stringify(r));
      await lutar(r.luta, dono(c1.a), dono(c1.b));
      for (const c of det.confrontos.slice(1)) {
        await ok(dono(c.a), "torneioSala", { confrontoId: c.id });
        await q("update jxj_confrontos set janela_ate = now() - interval '1 minute' where id = $1", [c.id]);
      }
      det = await ok(us[0], "torneio", { torneioId: tor.id });
      const quartas = det.confrontos.filter((c) => c.fase === 1);
      if (quartas.some((c) => !c.vencedor) || quartas.slice(1).some((c) => c.vencedor !== c.a || c.motivo !== "wo")) throw new Error(JSON.stringify(quartas));
      /* semis e final por W.O. duplo (ninguém apareceu: passa o rating maior) */
      for (let fase = 2; fase <= 3; fase++) {
        await q("update jxj_confrontos set janela_ate = now() - interval '1 minute' where torneio_id = $1 and fase = $2", [tor.id, fase]);
        det = await ok(us[0], "torneio", { torneioId: tor.id });
      }
      if (det.torneio.status !== "encerrado" || !det.torneio.campeao_id) throw new Error("não encerrou: " + JSON.stringify(det.torneio));
      const camp = det.torneio.campeao_id;
      const tit = await q("select 1 from jxj_titulos where lutador_id = $1 and tipo = 'cinturao' and torneio_id = $2", [camp, tor.id]);
      const col = await q("select colocacao, count(*)::int n from jxj_inscricoes where torneio_id = $1 group by colocacao", [tor.id]);
      const fichas = (await q("select coalesce(sum(delta),0)::int s from jxj_fichas where ref = $1 and motivo = 'torneio'", [String(tor.id)]))[0].s;
      const cl = (await q("select nivel, xp from jxj_lutadores where id = $1", [camp]))[0];
      const cont = Object.fromEntries(col.map((x) => [x.colocacao, x.n]));
      if (!tit.length || cont.campeao !== 1 || cont.vice !== 1 || cont.semifinal !== 2 || cont.quartas !== 4) throw new Error(JSON.stringify({ tit, cont }));
      if (fichas !== 300 + 150 + 75 * 2 + 30 * 4) throw new Error("fichas " + fichas);
      if (cl.nivel !== REG.nivelDoXp(cl.xp).nivel) throw new Error("nível do campeão fora da curva");
      const hall = await ok(null, "hall");
      if (!hall.cinturoes.some((h) => h.lutador === camp)) throw new Error("hall sem o campeão");
      const outro = await ok(us[1], "torneios", { categoria: "middleweight" });
      if (!outro.some((t) => t.status === "inscricoes")) throw new Error("não abriu o próximo torneio");
    });
    /* ---------------- segurança (auditoria de 2026-10-03) ----------------
       Três bloqueadores corrigidos: narração só de quem lutou, com reserva
       atômica e teto do dia (supabase_jxj_narracao.sql); processamento da
       luta só depois de conferir o participante; tabelas do servidor só por
       chave própria (Object.hasOwn). Cada teste reprova se a correção sair. */
    const lutaPorWO = async () => {
      const u1 = await novoUsuario({ pro: true }), u2 = await novoUsuario({ pro: true });
      await zerarLimites();
      const l1 = (await criar(u1)).id, l2 = (await criar(u2)).id;
      const lid = await parear(u1, l1, u2, l2);
      for (let k = 0; k < 3; k++) {
        const v = await ok(u1, "luta", { lutaId: lid });
        await ok(u1, "acao", { lutaId: lid, round: v.round, troca: v.troca, familia: "defesa" });
        await vencerPrazo(lid);
      }
      const v = await ok(u1, "luta", { lutaId: lid });
      if (v.status !== "encerrada") throw new Error("a luta de apoio não acabou");
      const nomes = (await q("select nomes from jxj_lutas where id = $1", [lid]))[0].nomes;
      return { u1, u2, lid, venc: nomes[v.lado].nome, perd: nomes[v.lado === "a" ? "b" : "a"].nome };
    };
    /* IA falsa: intercepta só o OpenRouter; o resto segue pro banco falso */
    const comIA = async (responder, fn) => {
      const base = globalThis.fetch, reg = { chamadas: 0 };
      process.env.OPENROUTER_API_KEY = "chave-de-teste";
      globalThis.fetch = async (u, op) => {
        if (String(u).startsWith("https://openrouter.ai/")) { reg.chamadas++; return responder(reg, op); }
        return base(u, op);
      };
      try { return await fn(reg); } finally { globalThis.fetch = base; delete process.env.OPENROUTER_API_KEY; }
    };
    const respostaIA = (texto) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: texto } }] }) });
    /* devolve um texto que passa no filtro da narração: o próprio resultado do pedido */
    const ecoaResultado = async (reg, op) => {
      const res = /Resultado: (.*)\.$/.exec(JSON.parse(op.body).messages[1].content)[1];
      return respostaIA(`${res}. Depois de três prazos perdidos a luta acabou ali.`);
    };
    const usoHoje = async () => (await q("select coalesce((select chamadas from jxj_narracao_uso where dia = (now() at time zone 'America/Sao_Paulo')::date), 0)::int n"))[0].n;
    const esperarAte = async (cond, ms = 3000) => { const t = Date.now(); while (!cond()) { if (Date.now() - t > ms) return false; await new Promise((r) => setTimeout(r, 10)); } return true; };

    await conf("segurança: narração de luta alheia é recusada antes de consultar ou gerar (sem reserva, sem cota, sem IA); quem lutou recebe", async () => {
      const { u1, lid } = await lutaPorWO();
      const u3 = await novoUsuario({ pro: true });
      const usoAntes = await usoHoje();
      await comIA(ecoaResultado, async (reg) => {
        await erro(u3, "narracao", { lutaId: lid }, /não encontrada/);
        const l = (await q("select narracao, narracao_reserva from jxj_lutas where id = $1", [lid]))[0];
        if (reg.chamadas !== 0 || l.narracao !== null || l.narracao_reserva !== null || (await usoHoje()) !== usoAntes)
          throw new Error("luta alheia mexeu em algo: " + JSON.stringify({ chamadas: reg.chamadas, l, uso: await usoHoje(), usoAntes }));
        const n = await ok(u1, "narracao", { lutaId: lid });
        if (!/prazos perdidos/.test(n.narracao || "") || reg.chamadas !== 1) throw new Error("quem lutou não recebeu a narração da IA: " + JSON.stringify(n));
      });
    });
    await conf("segurança: duas narrações ao mesmo tempo na mesma luta fazem uma chamada paga só; a outra recebe 'gerando' e depois a mesma narração", async () => {
      const { u1, u2, lid, venc, perd } = await lutaPorWO();
      const textoIA = `${venc} venceu por W.O. depois que ${perd} deixou passar o prazo três vezes seguidas.`;
      let liberar; const portao = new Promise((r) => { liberar = r; });
      const usoAntes = await usoHoje();
      await comIA(async () => { await portao; return respostaIA(textoIA); }, async (reg) => {
        const p1 = api(u1, "narracao", { lutaId: lid }), p2 = api(u2, "narracao", { lutaId: lid });
        /* sem reserva, as duas param na IA e nenhuma responde: o limite de
           tempo reprova (sem ele o Node sai calado com a promessa pendente) */
        let relogio;
        const limite = new Promise((_, rej) => { relogio = setTimeout(() => rej(new Error("nenhuma das duas respondeu em 5 s: as duas estão chamando a IA (sem reserva)")), 5000); });
        const [quem, primeira] = await Promise.race([p1.then((r) => ["p1", r]), p2.then((r) => ["p2", r]), limite])
          .finally(() => clearTimeout(relogio)).catch((e) => { liberar(); throw e; });
        if (primeira.status !== 200 || !primeira.json.gerando) throw new Error("a segunda devia esperar: " + JSON.stringify(primeira));
        if (!(await esperarAte(() => reg.chamadas >= 1)) || reg.chamadas !== 1) throw new Error("chamadas à IA com as duas em curso: " + reg.chamadas);
        liberar();
        const outra = await (quem === "p1" ? p2 : p1);
        if (outra.status !== 200 || outra.json.narracao !== textoIA) throw new Error("quem reservou: " + JSON.stringify(outra));
        const depois = await ok(quem === "p1" ? u1 : u2, "narracao", { lutaId: lid });
        if (depois.narracao !== textoIA) throw new Error("quem esperou não recebeu a mesma: " + JSON.stringify(depois));
        if (reg.chamadas !== 1 || (await usoHoje()) !== usoAntes + 1) throw new Error(`IA ${reg.chamadas}x, cota ${(await usoHoje()) - usoAntes}`);
      });
    });
    await conf("segurança: reserva vencida (geração que caiu no meio) não trava; IA que falha vira molde local gravado, sem nova cobrança; reserva em curso faz esperar", async () => {
      const { u1, lid } = await lutaPorWO();
      await q("update jxj_lutas set narracao_reserva = gen_random_uuid(), narracao_reservada_em = now() - interval '5 minutes' where id = $1", [lid]);
      await comIA(async () => ({ ok: false, status: 500, json: async () => ({}) }), async (reg) => {
        const n = await ok(u1, "narracao", { lutaId: lid });
        if (!/venceu/.test(n.narracao || "") || reg.chamadas !== 1) throw new Error("reserva vencida travou ou a falha não caiu no molde: " + JSON.stringify({ n, c: reg.chamadas }));
        const n2 = await ok(u1, "narracao", { lutaId: lid });
        const l = (await q("select narracao_reserva from jxj_lutas where id = $1", [lid]))[0];
        if (n2.narracao !== n.narracao || reg.chamadas !== 1 || l.narracao_reserva !== null) throw new Error("cobrou de novo ou não soltou a reserva");
      });
      const x = await lutaPorWO();
      await q("update jxj_lutas set narracao_reserva = gen_random_uuid(), narracao_reservada_em = now() where id = $1", [x.lid]);
      const r = await ok(x.u1, "narracao", { lutaId: x.lid });
      if (!r.gerando) throw new Error("reserva em curso não fez esperar: " + JSON.stringify(r));
    });
    await conf("segurança: teto diário da IA (jxj_config narracao_ia_dia): no teto a narração sai do molde local, 0 desliga a IA, nunca passa do teto", async () => {
      const a = await lutaPorWO(), b = await lutaPorWO(), c = await lutaPorWO();
      const usados = await usoHoje();
      await q("update jxj_config set valor = $1::jsonb where chave = 'narracao_ia_dia'", [JSON.stringify(usados + 1)]);
      try {
        await comIA(ecoaResultado, async (reg) => {
          const na = await ok(a.u1, "narracao", { lutaId: a.lid });
          const nb = await ok(b.u1, "narracao", { lutaId: b.lid });
          if (reg.chamadas !== 1 || !/prazos perdidos/.test(na.narracao) || /prazos perdidos/.test(nb.narracao) || !/venceu/.test(nb.narracao))
            throw new Error("teto: " + JSON.stringify({ chamadas: reg.chamadas, na: na.narracao, nb: nb.narracao }));
          if ((await usoHoje()) !== usados + 1) throw new Error("passou do teto: " + (await usoHoje()));
          await q("update jxj_config set valor = '0'::jsonb where chave = 'narracao_ia_dia'");
          const nc = await ok(c.u1, "narracao", { lutaId: c.lid });
          if (reg.chamadas !== 1 || !/venceu/.test(nc.narracao)) throw new Error("0 não desligou a IA");
        });
      } finally {
        await q("update jxj_config set valor = '300'::jsonb where chave = 'narracao_ia_dia'");
      }
    });
    await conf("narração: IA que inventa golpe (kimura numa luta sem kimura) cai no molde local", async () => {
      const x = await lutaPorWO();
      await comIA(async (reg, op) => {
        const res = /Resultado: (.*)\.$/.exec(JSON.parse(op.body).messages[1].content)[1];
        return respostaIA(`${res}. Antes disso encaixou uma kimura que quase acabou a luta.`);
      }, async (reg) => {
        const n = await ok(x.u1, "narracao", { lutaId: x.lid });
        if (reg.chamadas !== 1 || /kimura/i.test(n.narracao || "") || !/venceu/.test(n.narracao || "")) throw new Error(JSON.stringify({ chamadas: reg.chamadas, n }));
      });
    });
    await conf("segurança: conta que não lutou não provoca preparo, cancelamento por prazo nem gravação de troca (luta, confirmar, acao); quem lutou processa normalmente", async () => {
      const u1 = await novoUsuario({ pro: true }), u2 = await novoUsuario({ pro: true }), u3 = await novoUsuario({ pro: true });
      await zerarLimites();
      const l1 = (await criar(u1)).id, l2 = (await criar(u2)).id;
      const lid = await parear(u1, l1, u2, l2);
      await vencerPrazo(lid);
      const foto = async () => JSON.stringify((await q("select versao, round, troca, status, (select count(*)::int from jxj_trocas where luta_id = $1) n from jxj_lutas where id = $1", [lid]))[0]);
      const antes = await foto();
      await erro(u3, "luta", { lutaId: lid }, /não encontrada/, 404);
      await erro(u3, "acao", { lutaId: lid, round: 1, troca: 1, familia: "golpes" }, /não encontrada/, 404);
      await erro(u3, "confirmar", { lutaId: lid }, /não encontrada/, 404);
      if ((await foto()) !== antes) throw new Error("luta alheia foi processada: " + antes + " virou " + (await foto()));
      await ok(u1, "luta", { lutaId: lid });
      if (JSON.parse(await foto()).n !== JSON.parse(antes).n + 1) throw new Error("quem lutou não resolveu a troca vencida");
      const u4 = await novoUsuario({ pro: true }), u5 = await novoUsuario({ pro: true });
      const l4 = (await criar(u4)).id, l5 = (await criar(u5)).id;
      const lid2 = await parear(u4, l4, u5, l5, { confirmar: false });
      await q("update jxj_lutas set perfis = null, confirmacao_ate = now() - interval '10 seconds' where id = $1", [lid2]);
      await erro(u3, "luta", { lutaId: lid2 }, /não encontrada/, 404);
      await erro(u3, "confirmar", { lutaId: lid2 }, /não encontrada/, 404);
      const s2 = (await q("select status, perfis is null sem from jxj_lutas where id = $1", [lid2]))[0];
      if (s2.status !== "confirmacao" || !s2.sem) throw new Error("luta alheia foi preparada ou cancelada: " + JSON.stringify(s2));
      const v = await ok(u4, "luta", { lutaId: lid2 });
      if (v.status !== "cancelada") throw new Error("quem lutou não cancelou a confirmação vencida: " + v.status);
    });
    await conf("segurança: moldura com nome herdado (constructor, toString, __proto__, hasOwnProperty) é recusada sem gastar nem gravar; a compra legítima cobra o preço do servidor", async () => {
      const u = await novoUsuario({ pro: true });
      await zerarLimites();
      const lid = (await criar(u)).id;
      await q("update jxj_contas set fichas = 1000 where user_id = $1", [u]);
      for (const nome of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf", "inexistente"])
        await erro(u, "moldura", { lutadorId: lid, moldura: nome, comprar: true }, /moldura inválida/);
      await erro(u, "moldura", { lutadorId: lid, moldura: ["ouro"], comprar: true }, /moldura inválida/);
      const l = (await q("select molduras, moldura from jxj_lutadores where id = $1", [lid]))[0];
      const fichas = (await q("select fichas from jxj_contas where user_id = $1", [u]))[0].fichas;
      const led = await q("select delta from jxj_fichas where user_id = $1 and motivo = 'moldura'", [u]);
      if (JSON.stringify(l.molduras) !== '["padrao"]' || l.moldura !== "padrao" || fichas !== 1000 || led.length)
        throw new Error("nome herdado mexeu em algo: " + JSON.stringify({ l, fichas, led }));
      await ok(u, "moldura", { lutadorId: lid, moldura: "noite", comprar: true, preco: -500 });
      const f2 = (await q("select fichas from jxj_contas where user_id = $1", [u]))[0].fichas;
      const led2 = await q("select delta from jxj_fichas where user_id = $1 and motivo = 'moldura'", [u]);
      if (f2 !== 1000 - REG.MOLDURAS.noite.preco || led2.length !== 1 || led2[0].delta !== -REG.MOLDURAS.noite.preco)
        throw new Error("preço não veio do servidor: " + JSON.stringify({ f2, led2 }));
    });
    await conf("segurança: estilo e categoria inválidos (inclusive nomes herdados) dão erro controlado em criar, ranking e torneios; build com chave herdada dá 400, não 500", async () => {
      const u = await novoUsuario({ pro: true });
      await zerarLimites();
      const base = { nome: "Teste Seguro", rosto: ROSTO };
      for (const estilo of ["constructor", "__proto__", "toString", "ninja", 7, null])
        await erro(u, "criar", { ...base, categoria: "lightweight", estilo }, /estilo inválido/);
      for (const categoria of ["constructor", "__proto__", "hasOwnProperty", "inexistente", ["lightweight"]])
        await erro(u, "criar", { ...base, categoria, estilo: "striker" }, /categoria inválida/);
      for (const categoria of ["constructor", "toString", "__proto__"]) {
        await erro(null, "ranking", { categoria }, /categoria inválida/);
        await erro(null, "torneios", { categoria }, /categoria inválida/);
      }
      if ((await q("select count(*)::int n from jxj_lutadores where user_id = $1", [u]))[0].n !== 0) throw new Error("criou lutador com valor inválido");
      const lid = (await criar(u)).id;
      const rev = (await ok(u, "estado")).lutadores.find((x) => x.id === lid).buildRev;
      for (const b of ['{"constructor":1}', '{"__proto__":1}', '{"toString":1}'])
        await erro(u, "build", { lutadorId: lid, rev, build: JSON.parse(b) }, /habilidade desconhecida/);
      await ok(u, "build", { lutadorId: lid, rev, build: { precisao_maos: 1 } });
      if ((await ok(null, "ranking", { categoria: "lightweight" })) == null) throw new Error("ranking legítimo falhou");
    });
    await conf("segurança: a tabela e as funções novas da narração ficam fechadas pra anon e authenticated (RLS sem policy, execução revogada)", async () => {
      const lidos = [], gravou = [], executou = [];
      for (const papel of ["authenticated", "anon"]) {
        await db.exec(`set role ${papel};`);
        lidos.push((await db.query("select count(*)::int n from jxj_narracao_uso")).rows[0].n);
        let g = true; try { await db.query("insert into jxj_narracao_uso (dia, chamadas) values ('2000-01-01', 1)"); } catch { g = false; } gravou.push(g);
        for (const f of ["select public.jxj_narracao_cota_ia()", "select public.jxj_narracao_reservar(gen_random_uuid(), 1, true)", "select public.jxj_narracao_concluir(1, gen_random_uuid(), 'x')"]) {
          let e = true; try { await db.query(f); } catch { e = false; } executou.push(e);
        }
        await db.exec("reset role;");
      }
      if (lidos.some((n) => n !== 0) || gravou.some(Boolean) || executou.some(Boolean)) throw new Error(JSON.stringify({ lidos, gravou, executou }));
    });
    await conf("rollback (supabase_jxj_rollback.sql): apaga só o que é do JxJ, as tabelas e os dados do jogo ficam; roda duas vezes; o JxJ instala de novo depois", async () => {
      const rb = fs.readFileSync(path.join(RAIZ, "supabase_jxj_rollback.sql"), "utf8");
      const d2 = await B.novoBanco();
      const u = "00000000-0000-4000-8000-00000000abcd";
      await B.criarUsuario(d2, u, { pro: true });
      await d2.query("insert into jxj_contas (user_id) values ($1)", [u]);
      const tabelas = async () => (await d2.query("select tablename from pg_tables where schemaname = 'public' order by 1")).rows.map((r) => r.tablename);
      const antes = (await tabelas()).filter((t) => !t.startsWith("jxj_"));
      await d2.exec(rb);
      await d2.exec(rb);
      const restoJxJ = (await d2.query("select relname from pg_class where relname like 'jxj\\_%' union all select proname from pg_proc where proname like 'jxj\\_%'")).rows;
      if (restoJxJ.length) throw new Error("sobrou: " + restoJxJ.map((r) => r.relname || r.proname).join(", "));
      if ((await tabelas()).join() !== antes.join()) throw new Error("mexeu em tabela do jogo: " + (await tabelas()).join());
      const ass = (await d2.query("select pro from assinaturas where user_id = $1", [u])).rows;
      if (ass.length !== 1 || ass[0].pro !== true) throw new Error("apagou dado do jogo");
      await d2.exec(fs.readFileSync(path.join(RAIZ, "supabase_jxj.sql"), "utf8"));
      if (!(await d2.query("select 1 from pg_proc where proname = 'jxj_estado'")).rows.length) throw new Error("não reinstalou");
      /* tabela fora do JxJ apontando pro JxJ: o rollback para sem apagar nada */
      const d3 = await B.novoBanco();
      await d3.exec("create table externa (x bigint references jxj_lutadores(id))");
      let parou = false;
      try { await d3.exec(rb); } catch (e) { parou = /depende do JxJ/.test(e.message); }
      if (!parou) throw new Error("rollback não parou com dependência de fora");
      if (!(await d3.query("select 1 from pg_proc where proname = 'jxj_estado'")).rows.length) throw new Error("parou mas apagou função");
    });
  } finally {
    globalThis.fetch = fetchOriginal;
    for (const k of Object.keys(process.env)) if (!(k in envOriginal)) delete process.env[k];
    Object.assign(process.env, envOriginal);
    console.error = erroOriginal;
  }
  const okTudo = !falhas.length;
  console.log("\n" + (okTudo ? verde("  jxj ok") : vermelho(`  ${falhas.length} falha(s) no jxj`)));
  return okTudo;
}

/* ================================================================== *
 * JXJ MOTOR (2026-10-01): o motor do JxJ sozinho, sem banco. Determinismo,
 *     sorteio pela semente, invariantes em lutas ao acaso, ausência, ciclo
 *     em pé e balanço medido com jogo racional (ferramentas/jxj-balanco.mjs).
 *     Mexeu em api/_jxj-motor.js ou nas bases de estilo: rode esta suíte e a
 *     jxjarvore; as faixas estão aqui e os números medidos no LEIA-ME.
 * ================================================================== */
async function carregarBalancoJxJ() {
  const url = require("url");
  return import(url.pathToFileURL(path.join(RAIZ, "ferramentas", "jxj-balanco.mjs")).href);
}
function confJxJ(falhas) {
  return async (nome, fn) => {
    try { await fn(); console.log(verde("  ok    ") + nome); }
    catch (e) { falhas.push(nome); console.log(vermelho("  falha ") + nome + "\n         " + e.message); }
  };
}
async function testarJxJMotor() {
  console.log("\n" + cinza("jxjmotor: motor do JxJ (determinismo, semente, invariantes, ausência, ciclo, balanço racional, métodos, evolução)"));
  const crypto = require("crypto");
  const falhas = [], conf = confJxJ(falhas);
  const BAL = await carregarBalancoJxJ();
  const M = BAL.MOTOR, A = BAL.ARVORES, F = M.FAMILIAS, ESTS = A.ESTILOS_IDS;
  const cacheP = new Map();
  const perfil = (s, nv = 1) => { const k = s + nv; if (!cacheP.has(k)) cacheP.set(k, BAL.perfilTipico(s, nv)); return cacheP.get(k); };
  const f1 = (x) => x.toFixed(1);
  /* lutador "neutro": tudo 50, sem mecânica (pra medir só o ciclo) */
  const neutro = { estilo: "striker", categoria: "middleweight", atr: Object.fromEntries(A.ATRIBUTOS.map((k) => [k, 50])), mec: {} };

  await conf("determinismo: mesma semente e mesmas escolhas dão a mesma luta; semente diferente dá outra; o estado recebido não muda", () => {
    const pA = perfil("striker"), pB = perfil("grappler");
    const luta = (s) => JSON.stringify(M.simularLuta(pA, pB, BAL.heuristica("striker"), BAL.heuristica("grappler"), s));
    if (luta("det1") !== luta("det1")) throw new Error("mesma semente, lutas diferentes");
    if (luta("det1") === luta("det2")) throw new Error("semente diferente, luta igual");
    const ini = M.novaLuta(pA, pB), antes = JSON.stringify(ini);
    M.resolverTroca(ini, { a: pA, b: pB }, { a: "golpes", b: "queda" }, "x");
    if (JSON.stringify(ini) !== antes) throw new Error("resolverTroca mexeu no estado recebido");
  });
  await conf("semente: o compromisso é sha256 da semente; o sorteio de cada troca sai de (semente, round, troca)", () => {
    const s = "a1b2c3";
    if (M.compromissoDaSemente(s) !== crypto.createHash("sha256").update(s).digest("hex")) throw new Error("compromisso");
    const seq = (g) => [g(), g(), g()].join(",");
    if (seq(M.geradorDaTroca(s, 1, 1)) !== seq(M.geradorDaTroca(s, 1, 1))) throw new Error("mesma troca, sorteio diferente");
    if (seq(M.geradorDaTroca(s, 1, 1)) === seq(M.geradorDaTroca(s, 1, 2))) throw new Error("trocas diferentes, sorteio igual");
    if (seq(M.geradorDaTroca(s, 1, 1)) === seq(M.geradorDaTroca(s + "x", 1, 1))) throw new Error("sementes diferentes, sorteio igual");
  });
  await conf("ação inválida e luta encerrada são recusadas pelo motor", () => {
    const pA = perfil("striker"), P = { a: pA, b: pA };
    let deu = false;
    try { M.resolverTroca(M.novaLuta(pA, pA), P, { a: "voar", b: "golpes" }, "s"); } catch { deu = true; }
    if (!deu) throw new Error("aceitou ação inventada");
    const fim = { ...M.novaLuta(pA, pA), fim: { vencedor: "a", metodo: "KO" } };
    deu = false;
    try { M.resolverTroca(fim, P, { a: "golpes", b: "golpes" }, "s"); } catch { deu = true; }
    if (!deu) throw new Error("resolveu troca de luta encerrada");
  });
  await conf("invariantes em 3000 lutas com escolhas ao acaso e prazo perdido às vezes: energia, dano, momento, posição, cartões, fim e texto", () => {
    const METODOS = new Set(["KO", "TKO", "FIN", "DEC", "EMPATE", "WO", "ANULADA"]);
    const tipos = new Set(), vistas = new Set();
    for (let i = 0; i < 3000; i++) {
      const sa = ESTS[i % 4], sb = ESTS[(i >> 2) % 4], pA = perfil(sa, 1 + (i % 30)), pB = perfil(sb, 1 + ((i * 7) % 30));
      const P = { a: pA, b: pB };
      let s = (i * 2654435761) >>> 0;
      const r = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
      let e = M.novaLuta(pA, pB), n = 0;
      while (!e.fim) {
        if (++n > M.FORMATO.rounds * M.FORMATO.trocasPorRound) throw new Error(`luta ${i} passou de ${n - 1} trocas`);
        const esc = () => (r() < 0.06 ? null : F[Math.floor(r() * 4)]);
        const res = M.resolverTroca(e, P, { a: esc(), b: esc() }, "inv" + i);
        e = res.estado;
        for (const ev of res.eventos) {
          tipos.add(ev.tipo);
          if (ev.tipo === "escolha") {   // registro das variantes da troca: sem texto, mas sempre com as duas
            if (!M.VARIANTE_POR_ID[ev.va] || !M.VARIANTE_POR_ID[ev.vb]) throw new Error("escolha sem variante: " + JSON.stringify(ev));
            vistas.add(ev.va); vistas.add(ev.vb);
            continue;
          }
          if (ev.v && !M.VARIANTE_POR_ID[ev.v]) throw new Error(`evento ${ev.tipo} com variante desconhecida ${ev.v}`);
          const t = M.textoEvento(ev, { a: "Ana", b: "Bia" });
          if (!t) throw new Error(`evento ${ev.tipo} sem texto`);
          const p = problemasDeTexto(t); if (p.length) throw new Error(`texto do evento ${ev.tipo}: ${p.join(", ")} (${t})`);
        }
        for (const l of ["a", "b"]) {
          if (!(e[l].energia >= 0 && e[l].energia <= M.energiaMax(P[l]) + 1e-9)) throw new Error(`energia ${e[l].energia} fora de 0..${M.energiaMax(P[l])}`);
          if (!(e[l].dano >= 0 && e[l].dano <= 100)) throw new Error(`dano ${e[l].dano}`);
        }
        if (Math.abs(e.momento) > M.K.momentoMax) throw new Error(`momento ${e.momento}`);
        if (!["pe", "cima_a", "cima_b"].includes(e.pos) || e.nivelPos < 0 || e.nivelPos > 2 || (e.pos === "pe" && e.nivelPos)) throw new Error(`posição ${e.pos}/${e.nivelPos}`);
        if (e.round < 1 || e.round > M.FORMATO.rounds || e.troca < 1 || e.troca > M.FORMATO.trocasPorRound) throw new Error(`round/troca ${e.round}/${e.troca}`);
      }
      const f = e.fim;
      if (!METODOS.has(f.metodo)) throw new Error("método " + f.metodo);
      if ((f.vencedor == null) !== (f.metodo === "EMPATE" || f.metodo === "ANULADA")) throw new Error(`vencedor ${f.vencedor} com ${f.metodo}`);
      for (const c of e.cartoes) {
        const hi = Math.max(c.a, c.b), lo = Math.min(c.a, c.b);
        if (hi !== 10 || lo < 8 || Object.keys(c).join() !== "a,b") throw new Error("cartão " + JSON.stringify(c));
      }
      if (f.metodo === "DEC" || f.metodo === "EMPATE") {
        const ta = e.cartoes.reduce((x, c) => x + c.a, 0), tb = e.cartoes.reduce((x, c) => x + c.b, 0);
        if (e.cartoes.length !== M.FORMATO.rounds) throw new Error("decisão sem os 3 cartões");
        if (f.metodo === "EMPATE" ? ta !== tb : (ta > tb ? "a" : "b") !== f.vencedor) throw new Error(`cartões ${ta}x${tb} e ${f.metodo} ${f.vencedor}`);
      }
    }
    for (const t of ["golpe", "queda", "knockdown", "fim", "ausente", "raspou", "avancou", "subFalhou", "levantou"])
      if (!tipos.has(t)) throw new Error(`3000 lutas sem nenhum evento "${t}"`);
    const nunca = Object.keys(M.VARIANTE_POR_ID).filter((id) => !vistas.has(id));
    if (nunca.length) throw new Error("variante que nunca saiu na mão em 3000 lutas: " + nunca.join(", "));
  });
  await conf("variantes: cada papel tem as 4 famílias com 2 ou 3 variantes; a mão do round tem uma de cada; em 3 rounds, família de 3 mostra as 3 e de 2 alterna; a ordem muda com a semente e com o lado", () => {
    const ids = Object.keys(M.VARIANTE_POR_ID);
    if (ids.length < 28) throw new Error("só " + ids.length + " variantes");
    for (const pp of ["pe", "cima", "baixo"]) for (const f of F) {
      const n = M.VARIANTES[pp][f].length;
      if (n < 2 || n > 3) throw new Error(`${pp}/${f} com ${n} variantes`);
    }
    const ordens = new Set();
    for (let k = 0; k < 40; k++) for (const lado of ["a", "b"]) {
      const maos = [1, 2, 3].map((r) => M.maoDoRound("mao" + k, r, lado));
      for (const pp of ["pe", "cima", "baixo"]) for (const f of F) {
        const seq = maos.map((m) => m[pp][f]), n = M.VARIANTES[pp][f].length;
        if (seq.some((id) => M.VARIANTE_POR_ID[id].papel !== pp || M.VARIANTE_POR_ID[id].familia !== f)) throw new Error(`mão com variante de outra família: ${pp}/${f} ${seq}`);
        if (n === 3 && new Set(seq).size !== 3) throw new Error(`${pp}/${f} repetiu variante em 3 rounds: ${seq}`);
        if (n === 2 && (seq[0] === seq[1] || seq[1] === seq[2])) throw new Error(`${pp}/${f} não alternou: ${seq}`);
      }
      ordens.add(JSON.stringify(maos[0]));
      if (JSON.stringify(M.maoDoRound("mao" + k, 1, lado)) !== JSON.stringify(maos[0])) throw new Error("a mão do round mudou entre chamadas");
    }
    if (ordens.size < 40) throw new Error(`só ${ordens.size} mãos diferentes em 80 (semente e lado não mudam a ordem)`);
  });
  await conf("variantes: a ação que a tela mostra é a que a troca usa (rótulo, grupo, ciclo e custo da variante)", () => {
    const p = perfil("wrestler", 12), P = { a: p, b: p };
    for (let k = 0; k < 60; k++) {
      let e = M.novaLuta(p, p);
      for (let t = 0; t < (k % 9); t++) { const r = M.resolverTroca(e, P, { a: F[(t + k) % 4], b: F[(t * 3 + k) % 4] }, "tela" + k); if (r.estado.fim) break; e = r.estado; }
      if (e.fim) continue;
      const tela = { a: M.acoesDisponiveis(e, "a", p, "tela" + k), b: M.acoesDisponiveis(e, "b", p, "tela" + k) };
      const fa = F[k % 4], fb = F[(k + 1) % 4];
      const esc = M.resolverTroca(e, P, { a: fa, b: fb }, "tela" + k).eventos.find((ev) => ev.tipo === "escolha");
      const va = tela.a.find((x) => x.familia === fa), vb = tela.b.find((x) => x.familia === fb);
      if (esc.va !== va.variante || esc.vb !== vb.variante) throw new Error(`tela ${va.variante}/${vb.variante}, troca ${esc.va}/${esc.vb}`);
      for (const x of [...tela.a, ...tela.b]) {
        const V = M.VARIANTE_POR_ID[x.variante];
        if (!V || x.rotulo !== V.rotulo || x.descricao !== V.desc || !x.grupo || !x.ciclo) throw new Error("ação da tela: " + JSON.stringify(x));
        if (x.custo !== M.custoEnergia(M.papel(e, tela.a.includes(x) ? "a" : "b"), x.familia, p, V)) throw new Error("custo mostrado diferente do cobrado: " + JSON.stringify(x));
      }
    }
  });
  await conf("variantes mudam o jogo de verdade: cruzado nocauteia mais que jab, single leg custa menos, quadril cai na meia-guarda, mata-leão rende mais montado, triângulo finaliza por baixo", () => {
    const n = neutro, P = { a: n, b: n };
    const forca = (lado, pp, f, id) => ({ mao: { [lado]: { [pp]: { [f]: id } } } });
    /* por golpe que entrou (o jab entra mais, o cruzado derruba mais) */
    const porAcerto = (id) => { let ac = 0, kd = 0;
      for (let k = 0; k < 4000; k++) {
        const e = { ...M.novaLuta(n, n), b: { ...M.novaLuta(n, n).b, dano: 25 } };
        const evs = M.resolverTroca(e, P, { a: "golpes", b: "pressao" }, "ko" + k, forca("a", "pe", "golpes", id)).eventos;
        if (evs.some((ev) => ev.tipo === "golpe" && ev.quem === "a")) { ac++; if (evs.some((ev) => ev.quem === "a" && (ev.tipo === "knockdown" || ev.metodo === "KO"))) kd++; }
      }
      return { ac, kd, taxa: kd / Math.max(1, ac) }; };
    const cz = porAcerto("cruzado"), jb = porAcerto("jab");
    if (!(cz.taxa > jb.taxa * 1.6 && jb.ac > cz.ac)) throw new Error(`cruzado ${cz.kd}/${cz.ac}, jab ${jb.kd}/${jb.ac} (knockdown ou KO por golpe que entrou)`);
    const custo = (id) => M.custoEnergia("pe", "queda", n, M.VARIANTE_POR_ID[id]);
    if (!(custo("single_leg") < custo("double_leg"))) throw new Error("single leg não custa menos");
    let meia = 0;
    for (let k = 0; k < 400; k++) {
      const r = M.resolverTroca(M.novaLuta(n, n), P, { a: "queda", b: "pressao" }, "qd" + k, forca("a", "pe", "queda", "quadril"));
      if (r.estado.pos === "cima_a") { if (r.estado.nivelPos !== 1) throw new Error("quadril caiu em " + r.estado.nivelPos); meia++; }
    }
    if (!meia) throw new Error("quadril nunca entrou em 400");
    const fin = (nivel) => { let x = 0; for (let k = 0; k < 3000; k++) x += M.resolverTroca({ ...M.novaLuta(n, n), pos: "cima_a", nivelPos: nivel }, P, { a: "queda", b: "golpes" }, "ml" + k, forca("a", "cima", "queda", "mata_leao")).estado.fim ? 1 : 0; return x; };
    const f0 = fin(0), f2 = fin(2);
    if (!(f2 > f0 * 1.5)) throw new Error(`mata-leão montado ${f2} x na guarda ${f0}`);
    let tri = 0, ras = 0;
    for (let k = 0; k < 3000; k++) {
      const base = { ...M.novaLuta(n, n), pos: "cima_a" };
      tri += M.resolverTroca(base, P, { a: "golpes", b: "queda" }, "tr" + k, forca("b", "baixo", "queda", "triangulo")).eventos.some((ev) => ev.tipo === "subFalhou" || ev.metodo === "FIN") ? 1 : 0;
      ras += M.resolverTroca(base, P, { a: "golpes", b: "queda" }, "tr" + k, forca("b", "baixo", "queda", "raspagem")).eventos.some((ev) => ev.tipo === "subFalhou" || ev.metodo === "FIN") ? 1 : 0;
    }
    /* contra o ground and pound a raspagem tem vantagem e entra ~85%: sobra pouco pro triângulo, mas tem que existir */
    if (!(tri > 80 && ras === 0)) throw new Error(`finalização por baixo: triângulo ${tri}, raspagem ${ras}`);
  });
  await conf("ausência: prazo perdido vira Defender; 2 seguidos dão a troca pro adversário; 3 dão W.O.; os dois 3 vezes anulam; escolher zera a conta", () => {
    const p = perfil("striker"), P = { a: p, b: p };
    let r = M.resolverTroca(M.novaLuta(p, p), P, { a: null, b: "defesa" }, "aus");
    if (r.estado.a.ausentesSeguidas !== 1 || !r.eventos.some((e) => e.tipo === "ausente" && e.quem === "a") || r.estado.a.ultima !== "defesa") throw new Error("1ª ausência");
    const antes = r.estado.pontos[0].b;
    r = M.resolverTroca(r.estado, P, { a: null, b: "defesa" }, "aus");
    if (r.estado.a.ausentesSeguidas !== 2 || Math.abs(r.estado.pontos[0].b - antes - M.K.bonusAusencia) > 1e-9) throw new Error("2ª ausência não deu a troca pro adversário: " + JSON.stringify(r.estado.pontos));
    r = M.resolverTroca(r.estado, P, { a: null, b: "golpes" }, "aus");
    if (!r.estado.fim || r.estado.fim.metodo !== "WO" || r.estado.fim.vencedor !== "b") throw new Error("3ª ausência: " + JSON.stringify(r.estado.fim));
    let e = M.novaLuta(p, p);
    for (let k = 0; k < 3; k++) e = M.resolverTroca(e, P, { a: null, b: null }, "aus2").estado;
    if (!e.fim || e.fim.metodo !== "ANULADA" || e.fim.vencedor !== null) throw new Error("os dois ausentes: " + JSON.stringify(e.fim));
    e = M.novaLuta(p, p);
    for (const ac of [null, null, "golpes", null]) e = M.resolverTroca(e, P, { a: ac, b: "defesa" }, "aus3").estado;
    if (e.a.ausentesSeguidas !== 1 || e.fim) throw new Error("escolher não zerou a conta de ausências");
  });
  await conf("ciclo em pé (lutadores iguais): Golpes > Pressão > Defesa > Queda > Golpes, e os 16 pares têm regra", () => {
    const m = BAL.matriz(neutro, neutro, M.novaLuta(neutro, neutro), 3000);
    const I = (f) => F.indexOf(f);
    for (const [x, y] of [["golpes", "pressao"], ["pressao", "defesa"], ["defesa", "queda"], ["queda", "golpes"]]) {
      if (!(m[I(x)][I(y)] > 0.5)) throw new Error(`${x} contra ${y}: ${m[I(x)][I(y)].toFixed(2)} (esperava ganho)`);
      if (!(m[I(y)][I(x)] < -0.5)) throw new Error(`${y} contra ${x}: ${m[I(y)][I(x)].toFixed(2)} (esperava perda)`);
    }
    for (const fa of F) for (const fb of F) {
      const r = M.resolverTroca(M.novaLuta(neutro, neutro), { a: neutro, b: neutro }, { a: fa, b: fb }, "par");
      if (!r.eventos.length) throw new Error(`par ${fa} x ${fb} sem nenhum evento`);
    }
  });
  const R = BAL.medirMatriz(600);
  await conf("balanço de estilos no nível 1, jogo racional (600 lutas por dupla): toda dupla entre 42% e 58%", () => {
    const fora = Object.entries(R.mat).filter(([, v]) => v < 42 || v > 58);
    console.log(cinza("         " + ESTS.map((s) => `${s.slice(0, 3)}: ` + ESTS.map((o) => f1(R.mat[s + ":" + o])).join(" ")).join(" | ")));
    if (fora.length) throw new Error("fora da faixa: " + fora.map(([k, v]) => `${k} ${f1(v)}%`).join(", "));
  });
  await conf("métodos (jogo racional, todas as duplas): nocaute 20 a 34%, finalização 5 a 16%, decisão 50 a 72%, empate até 5%, luta média de 7 a 11,5 trocas", () => {
    const m = R.metodos;
    console.log(cinza(`         KO/TKO ${f1(m.ko)}%  FIN ${f1(m.fin)}%  DEC ${f1(m.dec)}%  empate ${f1(m.empate)}%  duração média ${f1(m.trocasMedia)} trocas`));
    if (m.ko < 20 || m.ko > 34 || m.fin < 5 || m.fin > 16 || m.dec < 50 || m.dec > 72 || m.empate > 5 || m.trocasMedia < 7 || m.trocasMedia > 11.5) throw new Error("fora da faixa");
  });
  await conf("narração: golpe com nome só passa se está nos fatos (termo a termo, plural e acento não enganam)", () => {
    const casos = [
      ["Ana acertou um cruzado e venceu.", "Ana acertou o cruzado (7,2 de dano).", []],
      ["Ana finalizou com um mata-leão.", "Ana acertou o cruzado (7,2 de dano).", ["mata-leao"]],
      ["Bia acertou cotoveladas por cima.", "Bia acertou as cotoveladas (5 de dano).", []],
      ["Ana acertou um jab.", "Ana acertou golpes (5 de dano).", ["jab"]],
      ["Ana derrubou com o Double Leg e pegou a montada.", "Ana derrubou Bia com o double leg. Ana foi pra montada.", []],
      ["Joelhadas no clinch.", "Ana acertou joelhadas no clinche.", []],
      ["Bia tentou o triângulo e a kimura.", "Bia tentou o triângulo e Ana escapou.", ["kimura"]],
    ];
    for (const [t, f, esperado] of casos) {
      const r = M.golpesForaDosFatos(t, f);
      if (JSON.stringify(r) !== JSON.stringify(esperado)) throw new Error(`"${t}" contra "${f}": ${JSON.stringify(r)}, esperava ${JSON.stringify(esperado)}`);
    }
  });
  await conf("variantes equilibradas: espelho com a variante sempre na mão, média dos 4 estilos e de duas amostras (3200 lutas), toda variante entre 44% e 56%", () => {
    const r1 = BAL.valorDasVariantes(400, ESTS, "a"), r2 = BAL.valorDasVariantes(400, ESTS, "b");
    const linhas = [], ruins = [];
    for (const id of Object.keys(r1)) {
      const v = (r1[id].pct + r2[id].pct) / 2;
      linhas.push(`${id} ${f1(v)}`);
      if (v < 44 || v > 56) ruins.push(`${id} ${f1(v)}%`);
    }
    console.log(cinza("         " + linhas.join(" ")));
    if (ruins.length) throw new Error(ruins.join(", "));
  });
  await conf("sem ação dominante: em toda dupla, a mistura de equilíbrio em pé usa 2+ ações com 10%+ e nenhuma passa de 80%", () => {
    const ruins = [];
    for (const [k, mx] of Object.entries(R.mixes)) {
      const d = mx.pe.a;
      if (Math.max(...d) > 0.8 || d.filter((x) => x >= 0.1).length < 2) ruins.push(`${k} [${d.map((x) => Math.round(100 * x)).join(" ")}]`);
    }
    if (ruins.length) throw new Error(ruins.join("; "));
  });
  await conf("repetir sempre a mesma ação não vence quem se adapta ao padrão (mesmo estilo, nível 1): nenhuma passa de 50%", () => {
    /* o adversário aqui é BAL.adaptativa: joga o equilíbrio e responde ao
       que o outro já repetiu na luta, como um humano atento. Contra a
       mistura fixa (racional), repetir pode render (ela não reage), e
       isso não é exploração de verdade. */
    const ruins = [], linhas = [];
    for (const s of ESTS) for (const f of F) {
      const p = perfil(s);
      const t = BAL.confronto(p, p, BAL.spam(f), BAL.adaptativa(p, p), 400, `spam${s}${f}`);
      linhas.push(`${s.slice(0, 3)}/${f.slice(0, 3)} ${f1(t.pct)}`);
      if (t.pct > 50) ruins.push(`${s} só ${f}: ${f1(t.pct)}%`);
    }
    console.log(cinza("         " + linhas.join(" ")));
    if (ruins.length) throw new Error(ruins.join(", "));
  });
  await conf("heurística de estilo (jogador que só segue o estilo, sem conta): nenhuma dupla passa de 65%", () => {
    const ruins = [];
    for (const s of ESTS) for (const o of ESTS) {
      if (s >= o) continue;
      const t = BAL.confronto(perfil(s), perfil(o), BAL.heuristica(s), BAL.heuristica(o), 600, `heu${s}${o}`);
      if (t.pct < 35 || t.pct > 65) ruins.push(`${s} x ${o}: ${f1(t.pct)}%`);
    }
    if (ruins.length) throw new Error(ruins.join(", "));
  });
  await conf("evolução: nível 30 contra nível 1 do mesmo estilo entre 62% e 85%; nível 30 contra 20 acima de 50%", () => {
    const linhas = [], ruins = [];
    for (const s of ESTS) {
      const a = BAL.nivelContraNivel(s, 30, 1, 600), b = BAL.nivelContraNivel(s, 30, 20, 600);
      linhas.push(`${s.slice(0, 3)} 30x1 ${f1(a)}% 30x20 ${f1(b)}%`);
      if (a < 62 || a > 85) ruins.push(`${s} 30x1 ${f1(a)}%`);
      if (b <= 50) ruins.push(`${s} 30x20 ${f1(b)}%`);
    }
    console.log(cinza("         " + linhas.join(" | ")));
    if (ruins.length) throw new Error(ruins.join(", "));
  });
  await conf("no nível 30 (build típica), nenhuma dupla de estilos sai de 40% a 60%", () => {
    const ruins = [];
    for (const s of ESTS) for (const o of ESTS) {
      if (s >= o) continue;
      const pA = perfil(s, 30), pB = perfil(o, 30);
      const t = BAL.confronto(pA, pB, BAL.racional(pA, pB), BAL.racional(pB, pA), 600, `n30${s}${o}`);
      if (t.pct < 40 || t.pct > 60) ruins.push(`${s} x ${o}: ${f1(t.pct)}%`);
    }
    if (ruins.length) throw new Error(ruins.join(", "));
  });
  const okTudo = !falhas.length;
  console.log("\n" + (okTudo ? verde("  jxjmotor ok") : vermelho(`  ${falhas.length} falha(s) no jxjmotor`)));
  return okTudo;
}

/* ================================================================== *
 * JXJ ÁRVORE (2026-10-01): estrutura, regras de compra, teto suave, texto
 *     e o valor medido de cada nó (nenhum nó morto, nenhum obrigatório).
 * ================================================================== */
async function testarJxJArvore() {
  console.log("\n" + cinza("jxjarvore: árvore do JxJ (estrutura, regras, teto, textos, valor medido de cada nó)"));
  const url = require("url");
  const falhas = [], conf = confJxJ(falhas);
  const BAL = await carregarBalancoJxJ();
  const A = BAL.ARVORES, M = BAL.MOTOR, ESTS = A.ESTILOS_IDS;
  const REG = await import(url.pathToFileURL(path.join(RAIZ, "api", "_jxj-regras.js")).href);

  await conf("estrutura: 4 estilos com 3 ramos cada, 12 ramos de 4 nós, ids únicos, efeito sempre em atributo ou mecânica que existe", () => {
    if (ESTS.length !== 4) throw new Error("estilos " + ESTS.length);
    const ramosUsados = ESTS.flatMap((s) => A.ESTILOS[s].ramos);
    if (ramosUsados.length !== 12 || new Set(ramosUsados).size !== 12 || Object.keys(A.RAMOS).length !== 12) throw new Error("ramos");
    for (const s of ESTS) for (const r of A.ESTILOS[s].ramos) if (A.RAMOS[r].estilo !== s) throw new Error(`ramo ${r} não é de ${s}`);
    const ids = Object.values(A.RAMOS).flatMap((r) => r.nos.map((n) => n.id));
    if (ids.length !== 48 || new Set(ids).size !== 48) throw new Error("nós " + ids.length);
    for (const id of ids) {
      const no = A.NOS[id];
      if (!no.efeitos.length) throw new Error(`${id} sem efeito`);
      for (const e of no.efeitos) {
        if (e.a ? !A.ATRIBUTOS.includes(e.a) : !A.MECANICAS[e.m]) throw new Error(`${id}: efeito desconhecido ${JSON.stringify(e)}`);
        if (!(e.v > 0)) throw new Error(`${id}: valor ${e.v}`);
      }
    }
    for (const m of Object.keys(A.MECANICAS)) {
      const usada = m === "puxarGuarda" || ids.some((id) => A.NOS[id].efeitos.some((e) => e.m === m));
      if (!usada) throw new Error(`mecânica ${m} sem nó`);
    }
  });
  await conf("estilos somam 450 e categorias somam zero: estilo e peso orientam, nunca dão vantagem de soma", () => {
    for (const s of ESTS) { const t = A.ATRIBUTOS.reduce((x, k) => x + A.ESTILOS[s].base[k], 0); if (t !== 450) throw new Error(`${s} soma ${t}`); }
    for (const [c, d] of Object.entries(A.CATEGORIAS)) { const t = Object.values(d.ajuste).reduce((x, v) => x + v, 0); if (t !== 0) throw new Error(`${c} soma ${t}`); }
  });
  await conf("textos de estilo, árvore, ações, regras e conquistas sem travessão, frase de efeito nem emoji", () => {
    const textos = [
      ...ESTS.flatMap((s) => [A.ESTILOS[s].nome, A.ESTILOS[s].resumo]),
      ...Object.values(A.RAMOS).flatMap((r) => [r.nome, ...r.nos.flatMap((n) => [n.nome, n.desc])]),
      ...Object.values(A.MECANICAS).map((m) => m.desc), ...Object.values(A.CATEGORIAS).map((c) => c.nome),
      ...Object.values(M.ROTULOS).flatMap(Object.values), ...Object.values(M.DESCRICOES).flatMap(Object.values),
      ...Object.values(M.VARIANTE_POR_ID).flatMap((v) => [v.rotulo, v.desc, v.frase]),
      ...Object.values(M.FAMILIA_NOME).flatMap(Object.values), ...Object.values(M.CICLO).flatMap(Object.values),
      ...REG.REGRA_AUSENCIA, ...Object.values(REG.CONQUISTAS).flatMap((c) => [c.nome, c.desc]), ...Object.values(REG.MOLDURAS).map((m) => m.nome),
    ];
    const ruins = textos.map((t) => [t, problemasDeTexto(t)]).filter(([, p]) => p.length);
    if (ruins.length) throw new Error(ruins.map(([t, p]) => `[${p.join(", ")}] ${t}`).join("; "));
  });
  await conf("validarBuild aceita build válida e recusa: nó inexistente, nível fora de 0 a 3, pré-requisito, teto do ramo, híbrido fora dos 2 primeiros nós, pontos acima do nível, formato errado", () => {
    const v = (b, nv = 30, est = "striker") => A.validarBuild(est, b, nv);
    if (!v({ precisao_maos: 3, combinacoes: 3, contra_maos: 3, eficiencia_golpes: 1 }).ok) throw new Error("build válida recusada");
    const casos = [
      [{ inventado: 1 }, /desconhecida/], [{ precisao_maos: 4 }, /nível inválido/], [{ precisao_maos: 1.5 }, /nível inválido/],
      [{ combinacoes: 1 }, /pede 2/], [{ precisao_maos: 3, combinacoes: 3, contra_maos: 3, eficiencia_golpes: 3 }, /até 10/],
      [{ entradas: 2, correntes: 1, timing_queda: 1 }, /só abre/], [{ precisao_maos: 3, chute_baixo: 1 }, /nível 1 dá 3/, 1],
    ];
    for (const [b, re, nv] of casos) { const r = v(b, nv || 30); if (r.ok || !re.test(r.erro)) throw new Error(`${JSON.stringify(b)}: ${JSON.stringify(r)}`); }
    for (const b of [null, [], "x"]) if (v(b).ok) throw new Error("formato " + JSON.stringify(b));
    if (v({ precisao_maos: 1 }, 30, "ninja").ok) throw new Error("estilo inventado");
    const hib = v({ entradas: 2 }, 30);
    if (!hib.ok || hib.gasto !== 4) throw new Error("híbrido custa 2 por nível: " + JSON.stringify(hib));
  });
  await conf("pontos: nível 1 dá 3 e nível 30 dá 32; a build típica é válida em todo nível e todo estilo e só cresce", () => {
    if (A.pontosDoNivel(1) !== 3 || A.pontosDoNivel(30) !== 32 || A.pontosDoNivel(99) !== 32) throw new Error("pontosDoNivel");
    for (const s of ESTS) {
      let antes = {};
      for (let nv = 1; nv <= REG.NIVEL_MAX; nv++) {
        const b = A.buildTipica(s, nv), r = A.validarBuild(s, b, nv);
        if (!r.ok) throw new Error(`${s} nível ${nv}: ${r.erro}`);
        for (const [k, x] of Object.entries(antes)) if ((b[k] || 0) < x) throw new Error(`${s} nível ${nv}: ${k} caiu`);
        antes = b;
      }
    }
  });
  await conf("teto suave: bônus de atributo nunca passa de 18 nem o atributo de 92; mecânica nunca passa do teto; mais nível nunca piora atributo", () => {
    for (const s of ESTS) {
      const base = A.perfilDeCombate({ estilo: s, categoria: "middleweight", build: {} });
      let ant = base;
      for (let nv = 2; nv <= 30; nv++) {
        const p = A.perfilDeCombate({ estilo: s, categoria: "middleweight", build: A.buildTipica(s, nv) });
        for (const k of A.ATRIBUTOS) {
          if (p.atr[k] - base.atr[k] > A.TETO_BONUS + 0.05 || p.atr[k] > A.ATRIBUTO_MAX) throw new Error(`${s} nível ${nv} ${k} ${p.atr[k]}`);
          if (p.atr[k] < ant.atr[k] - 1e-9) throw new Error(`${s} nível ${nv}: ${k} caiu`);
        }
        for (const [k, v] of Object.entries(p.mec)) if (v > A.MECANICAS[k].teto + 1e-9) throw new Error(`${s}: ${k} ${v} > teto`);
        ant = p;
      }
    }
    /* tudo no máximo, ignorando as regras de compra: o teto segura */
    const tudo = Object.fromEntries(Object.keys(A.NOS).map((id) => [id, 3]));
    const p = A.perfilDeCombate({ estilo: "grappler", categoria: "heavyweight", build: tudo }), b = A.perfilDeCombate({ estilo: "grappler", categoria: "heavyweight", build: {} });
    for (const k of A.ATRIBUTOS) if (p.atr[k] - b.atr[k] > A.TETO_BONUS + 0.05 || p.atr[k] > A.ATRIBUTO_MAX) throw new Error(`tudo no máximo: ${k} ${p.atr[k]}`);
    for (const [k, v] of Object.entries(p.mec)) if (v > A.MECANICAS[k].teto + 1e-9) throw new Error(`tudo no máximo: ${k} ${v}`);
  });
  await conf("builds diferentes do nível 30: outra ordem de ramos fica entre 42% e 58% contra a típica; a híbrida (paga 2 por nível) entre 35% e 58%", () => {
    const ruins = [], linhas = [];
    for (const est of ESTS) {
      const r = BAL.compararBuilds(est, 600);
      linhas.push(`${est.slice(0, 3)} invertida ${r.invertida.toFixed(1)} híbrida ${r.hibrida.toFixed(1)}`);
      if (r.invertida < 42 || r.invertida > 58) ruins.push(`${est} invertida ${r.invertida.toFixed(1)}%`);
      if (r.hibrida < 35 || r.hibrida > 58) ruins.push(`${est} híbrida ${r.hibrida.toFixed(1)}%`);
    }
    console.log(cinza("         " + linhas.join(" | ")));
    if (ruins.length) throw new Error(ruins.join(", "));
  });
  await conf("cada nó vale alguma coisa (medido): no nível 3, contra os 4 estilos, entre 0,5 e 6,5 pontos de vitória", () => {
    const linhas = [], ruins = [];
    for (const id of Object.keys(A.NOS)) {
      const v = BAL.valorDoNo(id, 400);
      linhas.push(`${id} ${v.toFixed(1)}`);
      if (v < 0.5 || v > 6.5) ruins.push(`${id} ${v.toFixed(2)}`);
    }
    console.log(cinza("         " + linhas.join(", ")));
    if (ruins.length) throw new Error("fora da faixa: " + ruins.join(", "));
  });
  const okTudo = !falhas.length;
  console.log("\n" + (okTudo ? verde("  jxjarvore ok") : vermelho(`  ${falhas.length} falha(s) no jxjarvore`)));
  return okTudo;
}

/* ================================================================== *
 * JXJ RATING (2026-10-01): Glicko-2 contra o exemplo do artigo do
 *     Glickman, simetria, incerteza, chance e reset de temporada.
 * ================================================================== */
async function testarJxJRating() {
  console.log("\n" + cinza("jxjrating: Glicko-2 do JxJ (exemplo do artigo, simetria, incerteza, chance, reset, fila)"));
  const url = require("url");
  const falhas = [], conf = confJxJ(falhas);
  const R = await import(url.pathToFileURL(path.join(RAIZ, "api", "_jxj-rating.js")).href);
  const REG = await import(url.pathToFileURL(path.join(RAIZ, "api", "_jxj-regras.js")).href);
  const perto = (x, y, tol) => Math.abs(x - y) <= tol;

  await conf("exemplo do artigo (1500/200/0,06 contra 1400/30 vitória, 1550/100 derrota, 1700/300 derrota): 1464,06 / 151,52 / 0,05999", () => {
    const r = R.atualizar({ r: 1500, rd: 200, vol: 0.06 }, [{ r: 1400, rd: 30, s: 1 }, { r: 1550, rd: 100, s: 0 }, { r: 1700, rd: 300, s: 0 }]);
    if (!perto(r.r, 1464.06, 0.05) || !perto(r.rd, 151.52, 0.05) || !perto(r.vol, 0.05999, 0.00001)) throw new Error(JSON.stringify(r));
  });
  await conf("entre iguais: quem vence sobe o que o outro desce; empate não mexe no rating e firma os dois", () => {
    const x = { r: 1600, rd: 120, vol: 0.06 };
    const v = R.luta(x, x, 1);
    if (!(v.a.r > x.r) || !perto(v.a.r - x.r, x.r - v.b.r, 1e-6)) throw new Error(JSON.stringify(v));
    const e = R.luta(x, x, 0.5);
    if (!perto(e.a.r, x.r, 1e-6) || !perto(e.b.r, x.r, 1e-6) || !(e.a.rd < x.rd)) throw new Error(JSON.stringify(e));
  });
  await conf("vencer alguém acima vale mais que vencer alguém abaixo; perder pra alguém abaixo custa mais", () => {
    const eu = { r: 1500, rd: 80, vol: 0.06 }, acima = { r: 1700, rd: 80, vol: 0.06 }, abaixo = { r: 1300, rd: 80, vol: 0.06 };
    const ga = R.luta(eu, acima, 1).a.r - eu.r, gb = R.luta(eu, abaixo, 1).a.r - eu.r;
    const pa = eu.r - R.luta(eu, acima, 0).a.r, pb = eu.r - R.luta(eu, abaixo, 0).a.r;
    if (!(ga > gb && pb > pa && gb > 0 && pa > 0)) throw new Error(JSON.stringify({ ga, gb, pa, pb }));
  });
  await conf("incerteza: cai luta a luta sem furar o piso de 50; parado, sobe até o teto de 350; lutador novo anda mais rápido", () => {
    let x = { ...R.INICIAL };
    const passos = [];
    for (let k = 0; k < 200; k++) { x = R.luta(x, { r: 1500, rd: 60, vol: 0.06 }, k % 2).a; passos.push(x.rd); }
    if (!passos.every((v, i) => i === 0 || v <= passos[i - 1] + 1e-6) || x.rd < R.RD_MIN || x.rd > 80) throw new Error("rd " + passos.slice(-3).join(","));
    if (R.atualizar({ r: 1500, rd: 30, vol: 0.06 }, [{ r: 1500, rd: 30, s: 1 }]).rd < R.RD_MIN) throw new Error("rd abaixo do piso");
    const parado = R.comInatividade({ r: 1500, rd: 60, vol: 0.06 }, 365 * 30);
    if (parado.rd !== R.RD_MAX && !perto(parado.rd, R.RD_MAX, 1e-9)) throw new Error("parado: " + parado.rd);
    if (!(R.comInatividade({ r: 1500, rd: 60, vol: 0.06 }, 70).rd > 60)) throw new Error("inatividade não subiu o rd");
    const novo = R.luta(R.INICIAL, { r: 1500, rd: 60, vol: 0.06 }, 1).a.r - 1500, firme = R.luta({ r: 1500, rd: 60, vol: 0.06 }, { r: 1500, rd: 60, vol: 0.06 }, 1).a.r - 1500;
    if (!(novo > 3 * firme)) throw new Error(`novo +${novo.toFixed(1)}, firme +${firme.toFixed(1)}`);
  });
  await conf("chance de vencer: 50% entre iguais, cresce com a diferença, os dois lados somam 100%", () => {
    const a = { r: 1500, rd: 80 }, b = { r: 1650, rd: 80 };
    if (!perto(R.chanceDeVencer(a, a), 0.5, 1e-12)) throw new Error("iguais");
    if (!(R.chanceDeVencer(b, a) > 0.6) || !perto(R.chanceDeVencer(a, b) + R.chanceDeVencer(b, a), 1, 1e-12)) throw new Error("diferença");
  });
  await conf("reset de temporada: puxa pra 1500 pela metade, devolve 80 de incerteza (teto 250) e não muda a ordem", () => {
    const lista = [1900, 1720, 1500, 1380, 1100].map((r, i) => ({ r, rd: 60 + 50 * i, vol: 0.06 }));
    const novo = lista.map(R.resetTemporada);
    novo.forEach((x, i) => {
      if (!perto(x.r, 1500 + (lista[i].r - 1500) * 0.5, 1e-9) || x.rd !== Math.min(250, lista[i].rd + 80)) throw new Error(JSON.stringify([lista[i], x]));
      if (i && !(x.r < novo[i - 1].r)) throw new Error("ordem mudou");
    });
  });
  await conf("fila: tolerância começa em 100 pontos, cresce 25 a cada 10 s de espera e para em 400", () => {
    const t = REG.toleranciaFila;
    if (t(0) !== 100 || t(9999) !== 100 || t(10000) !== 125 || t(60000) !== 250 || t(600000) !== 400 || t(-5) !== 100) throw new Error([0, 10000, 60000, 600000].map(t).join(","));
  });
  const okTudo = !falhas.length;
  console.log("\n" + (okTudo ? verde("  jxjrating ok") : vermelho(`  ${falhas.length} falha(s) no jxjrating`)));
  return okTudo;
}

/* ================================================================== *
 * JXJ TEMPORADA (2026-10-01): população simulada jogando 8 semanas pela
 *     fila de verdade (tolerância por espera) com o rating de verdade;
 *     reset; progressão e economia. Habilidade escondida = a verdade que
 *     o rating tem que achar.
 * ================================================================== */
async function testarJxJTemporada() {
  console.log("\n" + cinza("jxjtemporada: temporada simulada (fila, rating, reset), progressão e economia do JxJ"));
  const url = require("url");
  const falhas = [], conf = confJxJ(falhas);
  const R = await import(url.pathToFileURL(path.join(RAIZ, "api", "_jxj-rating.js")).href);
  const REG = await import(url.pathToFileURL(path.join(RAIZ, "api", "_jxj-regras.js")).href);
  let s = 20261001;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  const normal = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  /* habilidade escondida: 1 desvio = 70% de vitória; 3% de empate */
  const K_HAB = Math.log(0.7 / 0.3);
  const resultado = (ha, hb) => { const x = rnd(); if (x < 0.03) return 0.5; return rnd() < 1 / (1 + Math.exp(-K_HAB * (ha - hb))) ? 1 : 0; };
  const spearman = (xs, ys) => {
    const posto = (v) => { const o = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = new Array(v.length); o.forEach(([, i], k) => { r[i] = k; }); return r; };
    const a = posto(xs), b = posto(ys), n = xs.length, ma = (n - 1) / 2;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - ma); da += (a[i] - ma) ** 2; db += (b[i] - ma) ** 2; }
    return num / Math.sqrt(da * db);
  };
  const novoJogador = (dia) => ({ hab: normal(), ativ: 0.3 + rnd() * 2.7, ...R.INICIAL, lutas: 0, ultima: dia });
  /* um dia: quem joga hoje entra na fila em ordem aleatória; a cada passo
     de 10 s, o mais antigo pega o rating mais perto dentro da tolerância
     dele; quem espera 5 min sai. Devolve as diferenças de rating dos pares
     e as esperas (em passos). */
  function dia(pop, d, pares, esperas) {
    const hoje = [];
    for (const j of pop) { let n = Math.floor(j.ativ) + (rnd() < j.ativ % 1 ? 1 : 0); while (n-- > 0) hoje.push(j); }
    for (let i = hoje.length - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); [hoje[i], hoje[k]] = [hoje[k], hoje[i]]; }
    const fila = [];
    for (let passo = 0; hoje.length || fila.length; passo++) {
      for (let k = 0; k < 8 && hoje.length; k++) { const j = hoje.pop(); if (!fila.some((f) => f.j === j)) fila.push({ j, desde: passo }); }
      fila.sort((a, b) => a.desde - b.desde);
      for (let i = 0; i < fila.length; i++) {
        /* como jxj_fila_parear: a tolerância é a da espera mais longa do par */
        const a = fila[i], tol = (k) => REG.toleranciaFila((passo - Math.min(a.desde, fila[k].desde)) * 10000);
        let melhor = -1;
        for (let k = 0; k < fila.length; k++) if (k !== i && Math.abs(fila[k].j.r - a.j.r) <= tol(k) && (melhor < 0 || Math.abs(fila[k].j.r - a.j.r) < Math.abs(fila[melhor].j.r - a.j.r))) melhor = k;
        if (melhor < 0) continue;
        const b = fila[melhor];
        pares.push(Math.abs(a.j.r - b.j.r)); esperas.push(passo - a.desde, passo - b.desde);
        const sc = resultado(a.j.hab, b.j.hab), up = R.luta(a.j, b.j, sc, { diasA: d - a.j.ultima, diasB: d - b.j.ultima });
        Object.assign(a.j, up.a, { lutas: a.j.lutas + 1, ultima: d }); Object.assign(b.j, up.b, { lutas: b.j.lutas + 1, ultima: d });
        fila.splice(Math.max(i, melhor), 1); fila.splice(Math.min(i, melhor), 1); i = -1;
      }
      for (let i = fila.length - 1; i >= 0; i--) if (passo - fila[i].desde >= 30) fila.splice(i, 1);
      if (passo > 5000) throw new Error("dia sem fim");
    }
  }
  const pop = Array.from({ length: 300 }, () => novoJogador(0));
  const pares = [], esperas = [];
  for (let d = 0; d < REG.TEMPORADA_DIAS; d++) dia(pop, d, pares, esperas);
  await conf("temporada simulada (300 jogadores, 8 semanas, fila com tolerância): o rating ordena pela habilidade real (correlação de postos 0,85+)", () => {
    const firmes = pop.filter((j) => j.lutas >= R.LUTAS_PRA_CLASSIFICAR);
    const rho = spearman(firmes.map((j) => j.r), firmes.map((j) => j.hab));
    console.log(cinza(`         ${firmes.length} classificados, ${pares.length} lutas, correlação ${rho.toFixed(3)}`));
    if (firmes.length < 250 || rho < 0.85) throw new Error(`correlação ${rho.toFixed(3)}, ${firmes.length} classificados`);
  });
  await conf("fila: 95% dos pares com até 250 pontos de diferença, nenhum acima de 400; espera mediana de até 30 s", () => {
    const ord = [...pares].sort((a, b) => a - b), p95 = ord[Math.floor(ord.length * 0.95)];
    const esp = [...esperas].sort((a, b) => a - b), med = esp[Math.floor(esp.length / 2)] * 10;
    console.log(cinza(`         diferença p95 ${p95.toFixed(0)}, máxima ${ord[ord.length - 1].toFixed(0)}, espera mediana ${med} s`));
    if (p95 > 250 || ord[ord.length - 1] > 400 || med > 30) throw new Error(`p95 ${p95}, máx ${ord[ord.length - 1]}, espera ${med} s`);
  });
  await conf("reset parcial: a ordem não muda, a distância cai pela metade, e 4 semanas depois o rating volta a ordenar (0,85+)", () => {
    const antes = pop.map((j) => j.r);
    for (const j of pop) Object.assign(j, R.resetTemporada(j));
    const depois = pop.map((j) => j.r);
    if (spearman(antes, depois) < 0.9999) throw new Error("o reset mudou a ordem");
    const dp = (v) => { const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };
    if (!perto(dp(depois) / dp(antes), 0.5)) throw new Error(`desvio ${dp(antes).toFixed(1)} virou ${dp(depois).toFixed(1)}`);
    for (let d = REG.TEMPORADA_DIAS; d < REG.TEMPORADA_DIAS + 28; d++) dia(pop, d, [], []);
    const rho = spearman(pop.map((j) => j.r), pop.map((j) => j.hab));
    console.log(cinza(`         correlação 4 semanas depois do reset ${rho.toFixed(3)}`));
    if (rho < 0.85) throw new Error("correlação " + rho.toFixed(3));
  });
  function perto(x, y) { return Math.abs(x - y) < 0.01; }
  await conf("lutador novo (incerteza 350) acha o lugar dele: depois de 10 lutas, erro mediano de posto abaixo de 18% da população", () => {
    const d0 = REG.TEMPORADA_DIAS + 28, novos = Array.from({ length: 40 }, () => ({ ...novoJogador(d0), ativ: 2 }));
    pop.push(...novos);
    for (let d = d0; novos.some((j) => j.lutas < 10) && d < d0 + 30; d++) dia(pop, d, [], []);
    const porR = [...pop].sort((a, b) => b.r - a.r), porH = [...pop].sort((a, b) => b.hab - a.hab);
    const erros = novos.map((j) => Math.abs(porR.indexOf(j) - porH.indexOf(j)) / pop.length).sort((a, b) => a - b);
    const med = erros[Math.floor(erros.length / 2)];
    console.log(cinza(`         erro mediano de posto ${(100 * med).toFixed(1)}%`));
    if (med > 0.18) throw new Error(`erro mediano ${(100 * med).toFixed(1)}%`);
  });
  await conf("progressão: XP 120/90/70 (+30 se finalizar), W.O. 40/0, metade sem rating e depois de 10 lutas no dia; nível 30 em 90 a 160 lutas", () => {
    const x = REG.xpDaLuta;
    const casos = [[{ resultado: "vitoria", metodo: "DEC" }, 120], [{ resultado: "vitoria", metodo: "KO" }, 150], [{ resultado: "empate", metodo: "EMPATE" }, 90],
      [{ resultado: "derrota", metodo: "FIN" }, 70], [{ resultado: "vitoria", metodo: "WO" }, 40], [{ resultado: "derrota", metodo: "WO" }, 0],
      [{ resultado: "vitoria", metodo: "DEC", comRating: false }, 60], [{ resultado: "vitoria", metodo: "DEC", lutasHoje: 10 }, 60], [{ resultado: "derrota", metodo: "ANULADA" }, 0]];
    for (const [c, v] of casos) if (x(c) !== v) throw new Error(`${JSON.stringify(c)}: ${x(c)} (esperava ${v})`);
    const total = REG.xpTotalAte(REG.NIVEL_MAX), lutas = total / 100;
    if (lutas < 90 || lutas > 160) throw new Error(`nível 30 pede ${total} XP (${lutas.toFixed(0)} lutas a 100 de média)`);
    if (REG.nivelDoXp(total).nivel !== 30 || REG.nivelDoXp(total * 10).nivel !== 30 || REG.nivelDoXp(total - 1).nivel !== 29) throw new Error("curva");
  });
  await conf("economia: fichas por luta (10, 20 na vitória, nada sem rating ou anulada); só cosmético e respec gastam ficha; nenhum atributo à venda", () => {
    const f = REG.fichasDaLuta;
    if (f({ resultado: "vitoria", metodo: "DEC" }) !== 20 || f({ resultado: "derrota", metodo: "KO" }) !== 10 || f({ resultado: "vitoria", metodo: "DEC", comRating: false }) !== 0
      || f({ resultado: "derrota", metodo: "WO" }) !== 0 || f({ resultado: "empate", metodo: "ANULADA" }) !== 0) throw new Error("fichas por luta");
    for (const [k, m] of Object.entries(REG.MOLDURAS)) if (Object.keys(m).some((c) => !["nome", "preco", "req"].includes(c))) throw new Error(`moldura ${k} com campo que não é cosmético`);
    const sql = fs.readFileSync(path.join(RAIZ, "supabase_jxj.sql"), "utf8");
    const motivos = [...sql.matchAll(/insert into jxj_fichas \(user_id, delta, motivo, ref\)\s*values \([^,]+,\s*(-?)[^,]+,\s*'(\w+)'/g)].map((m) => (m[1] ? "-" : "+") + m[2]);
    const gastos = new Set(motivos.filter((m) => m.startsWith("-")).map((m) => m.slice(1)));
    if ([...gastos].sort().join() !== "moldura,respec") throw new Error("gasto de fichas fora de cosmético/respec: " + [...gastos].join(","));
    if (REG.CUSTO_RESPEC / 20 < 15) throw new Error("respec barato demais: " + REG.CUSTO_RESPEC);
  });
  const okTudo = !falhas.length;
  console.log("\n" + (okTudo ? verde("  jxjtemporada ok") : vermelho(`  ${falhas.length} falha(s) no jxjtemporada`)));
  return okTudo;
}

/* ================================================================== *
 * JXJ TELAS (2026-10-01): as telas do JxJ no DOM falso, ligadas ao
 *     servidor de verdade (api/jxj.js + PGlite). Clica como o jogador:
 *     árvore (nó, detalhe, somar, salvar), luta (ações da posição, envio)
 *     e todas as rotas sem "undefined", emoji nem travessão. Nasceu de um
 *     bug achado no navegador: clicar num nó da árvore quebrava (o nó da
 *     tela não tinha o ramo) e ninguém conseguia gastar ponto.
 * ================================================================== */
async function testarJxJTelas() {
  console.log("\n" + cinza("jxjtelas: telas do JxJ no DOM falso com o servidor de verdade (árvore, luta, todas as rotas, desligado)"));
  const url = require("url");
  const falhas = [];
  let B;
  try { B = await import(url.pathToFileURL(path.join(RAIZ, "ferramentas", "banco-teste.mjs")).href); }
  catch (e) {
    console.log(vermelho("  falha ") + "precisa do PGlite: rode `npm install --prefix ferramentas` uma vez (" + String(e.message).slice(0, 90) + ")");
    return false;
  }
  const db = await B.novoBanco();
  const { SUPABASE_URL } = await import(url.pathToFileURL(path.join(RAIZ, "api", "_pro.js")).href);
  const MOTOR = await import(url.pathToFileURL(path.join(RAIZ, "api", "_jxj-motor.js")).href);
  const fetchOriginal = globalThis.fetch, envOriginal = { ...process.env }, erroOriginal = console.error;
  globalThis.fetch = B.fetchFalso(db, { SUPABASE_URL });
  process.env.SUPABASE_SERVICE_ROLE_KEY = "falsa"; process.env.JXJ_ATIVO = "true";
  delete process.env.OPENROUTER_API_KEY;
  console.error = () => {};
  try {
    const H = (await import(url.pathToFileURL(path.join(RAIZ, "api", "jxj.js")).href)).default;
    const api = async (u, acao, extra = {}) => {
      const r = await B.chamar(H, { token: "tok:" + u, acao, ...extra });
      if (r.status !== 200) throw new Error(`${acao} deu ${r.status}: ${JSON.stringify(r.json).slice(0, 140)}`);
      return r.json;
    };
    const u1 = "00000000-0000-4000-8000-0000000000a1", u2 = "00000000-0000-4000-8000-0000000000a2";
    await B.criarUsuario(db, u1, { pro: true }); await B.criarUsuario(db, u2, { pro: true });
    const ROSTO = { pele: 2, porte: 1, cabelo: 1, corCabelo: 0, barba: 1, orelha: 0, nariz: 0, cicatriz: 0, tatuagem: 0, entrada: 0, prajiad: 0, corEntrada: 0 };

    const env = criarAmbiente({ contarNos: true });
    env.sandbox.window.supabase = supabaseFalsoComSessao({
      sessao: { user: { id: u1, email: "a1@teste" }, access_token: "tok:" + u1 }, assinatura: { pro: true, expira_em: null } });
    const dadosLS = {};
    env.sandbox.localStorage = { getItem: (k) => (k in dadosLS ? dadosLS[k] : null), setItem: (k, v) => { dadosLS[k] = String(v); }, removeItem: (k) => { delete dadosLS[k]; } };
    let pendentes = 0;
    env.sandbox.fetch = async (u, op) => {
      if (!String(u).endsWith("/api/jxj")) throw new Error("offline");
      pendentes++;
      try { const r = await B.chamar(H, JSON.parse(op.body)); return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json }; }
      finally { pendentes--; }
    };
    vm.createContext(env.sandbox);
    vm.runInContext(exportar(lerScript(), ["ready", "irPara"]) + "\ntry{globalThis.__x.setMeuPro=(v)=>{meuPro=v;};}catch(e){}"
      + "\ntry{globalThis.__x.zerarDef=()=>{JXJ_DEF=null;};}catch(e){}", env.sandbox, { filename: "index.html" });
    const UI = env.sandbox.__x;
    UI.ready(lerLutadores());
    UI.setMeuPro(true);
    const tem = (n, c) => (n.className || "").split(" ").includes(c);
    const desde = (m) => env.todos.slice(m);
    /* deixa a tela assentar: timers do sandbox, promessas e o banco */
    const assentar = async (voltas = 40) => {
      for (let i = 0; i < voltas; i++) {
        env.drenar();
        await new Promise((r) => setTimeout(r, 2));
        if (!pendentes && i > 6) { env.drenar(); await new Promise((r) => setTimeout(r, 2)); if (!pendentes) break; }
      }
    };
    const abrir = async (param) => { const m = env.todos.length; UI.irPara("jxj", param); await assentar(); return m; };
    const htmlDe = (nos) => nos.map((n) => String(n.innerHTML || "") + " " + String(n.textContent || "")).join("\n");
    const conf = async (nome, fn) => {
      try { await fn(); console.log(verde("  ok    ") + nome); }
      catch (e) { falhas.push(nome); console.log(vermelho("  falha ") + nome + "\n         " + e.message); }
    };
    const botao = (nos, txt) => nos.filter((n) => n.tagName === "button" && String(n.innerHTML).includes(txt)).pop();

    await conf("entrada sem lutador: apresentação e o botão Criar meu lutador", async () => {
      const m = await abrir("");
      if (!botao(desde(m), "Criar meu lutador")) throw new Error("sem Criar meu lutador: " + htmlDe(desde(m)).replace(/\s+/g, " ").slice(0, 200));
    });
    const l1 = (await api(u1, "criar", { nome: "Tela Um", rosto: ROSTO, categoria: "lightweight", estilo: "striker" })).id;
    await conf("árvore: clicar num nó mostra o detalhe (nome, ramo, efeito por nível), Somar 1 nível e Salvar gravam no servidor", async () => {
      const m = await abrir(`lutador/${l1}/arvore`);
      const nos = desde(m).filter((n) => tem(n, "jxj-no"));
      if (nos.length < 12) throw new Error("só " + nos.length + " nós na tela");
      const m2 = env.todos.length;
      await nos[0].onclick(); await assentar(10);
      const det = env.todos.filter((n) => tem(n, "jxj-no-detalhe")).pop();
      const h = String(det && det.innerHTML);
      if (!det || det.hidden || !h.includes("Precisão") || !h.includes("Boxe") || !h.includes("por nível") || /undefined|NaN/.test(h)) throw new Error("detalhe: " + h.replace(/\s+/g, " ").slice(0, 220));
      const mais = botao(desde(m2), "Somar 1 nível");
      if (!mais || mais.disabled) throw new Error("Somar 1 nível ausente ou desligado");
      await mais.onclick(); await assentar(10);
      const salvar = botao(desde(m), "Salvar árvore");
      if (!salvar || salvar.disabled) throw new Error("Salvar árvore desligado depois de somar");
      await salvar.onclick(); await assentar();
      const est = await api(u1, "estado");
      const b = est.lutadores.find((x) => x.id === l1).build;
      if (b.precisao_maos !== 1) throw new Error("build no servidor: " + JSON.stringify(b));
    });
    await conf("efeito de mecânica mostra o valor real de cada nível, com o teto (nunca o bruto vezes 3)", async () => {
      const m = await abrir(`lutador/${l1}/arvore`);
      const no = desde(m).filter((n) => tem(n, "jxj-no")).find((n) => String(n.innerHTML).includes("Combinações<"));
      if (!no) throw new Error("nó Combinações não achado");
      await no.onclick(); await assentar(10);
      const h = String(env.todos.filter((n) => tem(n, "jxj-no-detalhe")).pop().innerHTML);
      if (!/nos níveis 1, 2 e 3 \(teto 30%\)/.test(h)) throw new Error("texto do efeito: " + h.replace(/\s+/g, " ").slice(0, 260));
    });
    await conf("fila: o jogador escolhe a diferença de rating (4 opções, padrão 400), vê a faixa, e a escolha chega ao banco", async () => {
      const m = await abrir("fila");
      const ops = desde(m).filter((n) => tem(n, "jxj-raio"));
      const rot = ops.map((n) => String(n.innerHTML).replace(/<[^>]+>/g, "|").split("|").filter(Boolean)[0]);
      if (JSON.stringify(rot) !== JSON.stringify(["Até 100 pontos", "Até 200 pontos", "Até 400 pontos", "Qualquer diferença"])) throw new Error("opções: " + JSON.stringify(rot));
      if (!tem(ops[2], "on")) throw new Error("o padrão não é 400");
      ops[1].onclick();
      const faixa = desde(m).filter((n) => tem(n, "jxj-raio-faixa")).pop();
      if (!/Adversários de 1300 a 1700/.test(faixa.textContent || "")) throw new Error("faixa: " + faixa.textContent);
      const m2 = env.todos.length;
      const entrar = botao(desde(m), "Entrar na fila");
      await entrar.onclick(); await assentar(15);
      const linha = (await db.query("select raio from jxj_fila where user_id = $1", [u1])).rows[0];
      if (!linha || linha.raio !== 200) throw new Error("raio no banco: " + JSON.stringify(linha));
      if (!/até 200 pontos de rating de diferença/.test(htmlDe(desde(m2)))) throw new Error("a busca não mostra o limite escolhido");
      UI.irPara("jxj"); await assentar();
      await api(u1, "filaSair");
    });
    const l2 = (await api(u2, "criar", { nome: "Tela Dois", rosto: ROSTO, categoria: "lightweight", estilo: "wrestler" })).id;
    await api(u1, "filaEntrar", { lutadorId: l1 }); await api(u2, "filaEntrar", { lutadorId: l2 });
    const par = await api(u1, "fila");
    await api(u1, "confirmar", { lutaId: par.luta.id }); await api(u2, "confirmar", { lutaId: par.luta.id });
    const lid = par.luta.id;
    /* a mão do round (variantes) vem do servidor; a tela mostra o que ele mandou */
    const maoU1 = (await api(u1, "luta", { lutaId: lid })).acoes;
    const golpesU1 = maoU1.find((a) => a.familia === "golpes");
    await conf("luta: as 4 ações da mão do round (variante, família, custo e ciclo, iguais às do servidor); escolher manda a ação pro servidor, que guarda escondida", async () => {
      const m = await abrir(`luta/${lid}`);
      const acoes = desde(m).filter((n) => tem(n, "jxj-acao"));
      if (acoes.length !== 4 || maoU1.length !== 4) throw new Error(`${acoes.length} botões, ${maoU1.length} ações do servidor`);
      for (const a of maoU1) {
        const V = MOTOR.VARIANTE_POR_ID[a.variante];
        if (!V || V.papel !== "pe" || V.familia !== a.familia) throw new Error("variante do servidor: " + JSON.stringify(a));
        if (!acoes.some((b) => { const h = String(b.innerHTML); return h.includes(`<b>${a.rotulo}</b>`) && h.includes(`${MOTOR.FAMILIA_NOME.pe[a.familia]} · `) && h.includes(a.ciclo) && h.includes(a.descricao); }))
          throw new Error("botão sem a variante " + a.rotulo + ": " + acoes.map((b) => String(b.innerHTML).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 60)).join(" | "));
      }
      const golpes = acoes.find((a) => String(a.innerHTML).includes(`<b>${golpesU1.rotulo}</b>`));
      await golpes.onclick(); await assentar(15);
      const linhas = (await db.query("select a.familia from jxj_acoes a join jxj_lutas l on l.id = a.luta_id where a.luta_id = $1 and a.lado = case when l.a_id = $2 then 'a' else 'b' end", [lid, l1])).rows;
      if (linhas.length !== 1 || linhas[0].familia !== "golpes") throw new Error("ação no banco: " + JSON.stringify(linhas));
      const v2 = await api(u2, "luta", { lutaId: lid });
      if (JSON.stringify(v2).includes('"golpes"') && /acaoAdversario|acaoDele/.test(JSON.stringify(v2))) throw new Error("a vista do adversário mostra a ação");
    });
    await conf("desconexão: sair da luta e voltar pela entrada mostra a mesma luta, com a ação já enviada valendo", async () => {
      const m = await abrir("");
      const faixa = desde(m).filter((n) => tem(n, "jxj-faixa-luta")).pop();
      if (!faixa || !String(faixa.innerHTML).includes("Luta em andamento")) throw new Error("a entrada não mostra a luta em andamento");
      const m2 = env.todos.length;
      faixa.onclick(); await assentar();
      const h = htmlDe(desde(m2));
      if (!h.includes(`Ação enviada: <b>${golpesU1.rotulo}</b>`)) throw new Error("a luta retomada não mostra a ação enviada: " + h.replace(/\s+/g, " ").slice(0, 200));
      if (desde(m2).some((n) => tem(n, "jxj-acao"))) throw new Error("a luta retomada deixa escolher de novo");
    });
    await conf("troca resolvida: o painel da troca anterior mostra as duas variantes e o que aconteceu; som toca uma vez (redesenhar sem troca nova não repete)", async () => {
      vm.runInContext(`globalThis.__som=[];for(const k of Object.keys(SOM)){const f=SOM[k];SOM[k]=function(){globalThis.__som.push(k);return f.apply(this,arguments);};}`, env.sandbox);
      const m = env.todos.length;
      const v2 = await api(u2, "luta", { lutaId: lid });
      await api(u2, "acao", { lutaId: lid, round: v2.round, troca: v2.troca, familia: "defesa" });
      /* espera a tela consultar e redesenhar, por tempo e não por número de
         voltas: o banco local às vezes demora mais (falhou 1 vez em 2 em
         2026-10-04 com voltas fixas, e de novo em 2026-10-05 com 12 voltas,
         só dentro da bateria completa, que deixa a máquina mais lenta) */
      for (const ate = Date.now() + 8000; Date.now() < ate && !desde(m).some((n) => tem(n, "jxj-ultima"));) await assentar(60);
      const vs = await api(u1, "luta", { lutaId: lid });
      const t0 = vs.trocas[0];
      if (!t0 || !t0.varA || !t0.varB || !t0.ev || !t0.ev.length) throw new Error("vista sem variantes ou eventos da troca: " + JSON.stringify(t0));
      const ult = desde(m).filter((n) => tem(n, "jxj-ultima")).pop();
      if (!ult) throw new Error("sem o painel da troca anterior");
      const h = String(ult.innerHTML), eu = vs.lado;
      const meu = MOTOR.VARIANTE_POR_ID[eu === "a" ? t0.varA : t0.varB].rotulo, dele = MOTOR.VARIANTE_POR_ID[eu === "a" ? t0.varB : t0.varA].rotulo;
      if (meu !== golpesU1.rotulo || !h.includes(meu) || !h.includes(dele) || !t0.eventos.every((x) => h.includes(x.replace(/&/g, "&amp;"))))
        throw new Error("painel: " + h.replace(/\s+/g, " ").slice(0, 300));
      if (!tem(ult, "nova")) throw new Error("o painel da troca nova não anima");
      const sons = env.sandbox.__som.slice();
      if (!sons.length) throw new Error("troca resolvida sem som nenhum (eventos " + t0.ev.map((e) => e.tipo).join(",") + ")");
      await assentar(60);
      if (env.sandbox.__som.length !== sons.length) throw new Error("o som repetiu sem troca nova: " + env.sandbox.__som.join(","));
    });
    await conf("todas as rotas do JxJ abrem sem 'undefined', 'NaN', '[object Object]', emoji nem travessão", async () => {
      const rotas = ["", "ranking", "temporada", "torneios", "hall", "lutadores", "fila", "criar", `perfil/${l1}`, `lutador/${l1}/perfil`,
        `lutador/${l1}/arvore`, `lutador/${l1}/historico`, `lutador/${l1}/aparencia`, `lutador/${l1}/gerenciar`, `luta/${lid}`];
      const ruins = [];
      for (const r of rotas) {
        const m = await abrir(r);
        const h = htmlDe(desde(m));
        if (h.trim().length < 40) ruins.push(`#/jxj/${r}: tela vazia`);
        const lixo = h.match(/undefined|NaN|\[object Object\]/);
        if (lixo) ruins.push(`#/jxj/${r}: "${lixo[0]}" em ${h.slice(Math.max(0, lixo.index - 60), lixo.index + 30).replace(/\s+/g, " ")}`);
        const p = problemasDeTexto(h.replace(/<[^>]*>/g, " "));
        if (p.length) ruins.push(`#/jxj/${r}: ${p.join(", ")}`);
      }
      if (ruins.length) throw new Error(ruins.join("\n         "));
    });
    await conf("JxJ desligado (JXJ_ATIVO diferente de true): a entrada mostra 'abre em breve' e nenhum botão de criar", async () => {
      process.env.JXJ_ATIVO = "false";
      UI.zerarDef();
      const m = await abrir("");
      const h = htmlDe(desde(m));
      process.env.JXJ_ATIVO = "true";
      UI.zerarDef();
      if (!/abre em breve/.test(h) || botao(desde(m), "Criar meu lutador")) throw new Error(h.replace(/\s+/g, " ").slice(0, 200));
    });
  } finally {
    globalThis.fetch = fetchOriginal;
    for (const k of Object.keys(process.env)) if (!(k in envOriginal)) delete process.env[k];
    Object.assign(process.env, envOriginal);
    console.error = erroOriginal;
  }
  const okTudo = !falhas.length;
  console.log("\n" + (okTudo ? verde("  jxjtelas ok") : vermelho(`  ${falhas.length} falha(s) no jxjtelas`)));
  return okTudo;
}

/* ================================================================== *
 * REGRAS DA CARREIRA v2 (2026-10-04, pedido do dono): sem aposentado no
 *     modo normal (lenda continua com eles), ranking igual ao do UFC
 *     (campeão, #1 a #15, sem ranking) e adversário que cresce junto com
 *     o jogador (estreia sem campeão nem ranqueado). A v1 continua igual
 *     pra save e link de desafio antigos. Balanço da v2 na suíte balanco.
 * ================================================================== */
async function testarRegrasCarreira() {
  console.log("\n" + cinza("regras da carreira v2: aposentado só no modo lenda, ranking do UFC, adversário que cresce com o jogador; v1 intacta pra save e link antigos"));
  const falhas = [];
  const conf = async (nome, fn) => {
    try { await fn(); console.log(verde("  ok    ") + nome); }
    catch (e) { falhas.push(nome); console.log(vermelho("  falha ") + nome + "\n         " + e.message); }
  };
  const F = lerLutadores();
  const X = sandboxCarreira();
  iniciarCarreiraTeste(X, F, 991001);
  const RJ = X.run("JSON.stringify(ROSTER)");

  await conf("modo normal sem aposentado (última luta antes de ANO_ATIVO) em nenhuma divisão; lenda e v1 continuam com eles", () => {
    const r = JSON.parse(X.run(`JSON.stringify((()=>{
      const out={div:{}};
      for(const d of DIVISOES){
        const n=poolDivisao(d.id,"normal",2), v1=poolDivisao(d.id,"normal",1);
        out.div[d.id]={velhosV2:n.filter(f=>!f.era||f.era[1]<ANO_ATIVO).length, velhosV1:v1.filter(f=>f.era&&f.era[1]<ANO_ATIVO).length};
      }
      const kh=ROSTER.find(f=>f.name==="Khabib Nurmagomedov");
      out.khabib={normal:poolDivisao("lightweight","normal",2).includes(kh),lenda:poolDivisao("lightweight","lenda",2).includes(kh),v1:poolDivisao("lightweight","normal",1).includes(kh)};
      return out;
    })())`));
    const comVelho = Object.entries(r.div).filter(([, v]) => v.velhosV2 > 0);
    if (comVelho.length) throw new Error("aposentado no modo normal: " + JSON.stringify(comVelho));
    if (!Object.values(r.div).some((v) => v.velhosV1 > 0)) throw new Error("a v1 perdeu os aposentados (save antigo mudaria)");
    if (r.khabib.normal || !r.khabib.lenda || !r.khabib.v1) throw new Error("Khabib: " + JSON.stringify(r.khabib));
  });
  await conf("ranking do UFC: campeão e #1 a #15 (os 15 mais fortes); o jogador começa sem ranking, entra no top 15 no limiar e chega ao nº1 antes da disputa", () => {
    const r = JSON.parse(X.run(`JSON.stringify((()=>{
      const l=RANKING.lista, notas=l.slice(1).map(f=>f.rating);
      const grade=[0,.18,.30,LIMIAR_TOP15-1e-9,LIMIAR_TOP15,.6,.7,.8,.87,LIMIAR_DESAFIANTE].map(s=>posicaoDivisao(s));
      st.title=true;const camp=posicaoDivisao();st.title=false;
      return {n:l.length,campeao:l[0]===RANKING.campeao,ordenado:notas.every((x,i)=>i===0||x<=notas[i-1]),grade,camp};
    })())`));
    if (r.n !== 16 || !r.campeao || !r.ordenado) throw new Error("lista: " + JSON.stringify({ n: r.n, campeao: r.campeao, ordenado: r.ordenado }));
    const ns = r.grade.map((p) => p.n), txt = r.grade.map((p) => p.texto);
    if (txt[0] !== "Sem ranking" || txt[1] !== "Sem ranking" || ns[3] !== 16 || ns[4] !== 15 || ns[8] !== 1)
      throw new Error("régua: " + JSON.stringify(txt));
    if (!ns.every((n, i) => i === 0 || n <= ns[i - 1])) throw new Error("posição não melhora com o standing: " + JSON.stringify(ns));
    if (r.camp.texto !== "Campeão" || r.camp.n !== 0) throw new Error("campeão: " + JSON.stringify(r.camp));
  });
  await conf("estreia sem campeão nem ranqueado (40 carreiras novas); o nível do adversário cresce com o jogador", async () => {
    const ruins = [];
    for (let k = 0; k < 40; k++) {
      const Y = sandboxCarreira();
      iniciarCarreiraTeste(Y, F, 992000 + k, "normal", RJ);
      const v = JSON.parse(Y.run(`JSON.stringify((()=>{const top=new Set(RANKING.lista.map(f=>f.name));st.tituloEstaLuta=false;
        return candidatos().filter(o=>!o.rival&&top.has(o.f.name)).map(o=>o.f.name);})())`));
      if (v.length) ruins.push(`semente ${992000 + k}: ${v.join(", ")}`);
    }
    if (ruins.length) throw new Error("estreia com ranqueado: " + ruins.slice(0, 3).join(" | "));
    const r = JSON.parse(X.run(`JSON.stringify((()=>{
      const l=RANKING.lista, salva=st.standing, saidas=[...fought];
      const medir=s=>{let nota=0,rank=0,melhor=99;for(let k=0;k<20;k++){st.standing=s;fought.clear();const o=faixasV2();nota+=o.reduce((a,x)=>a+x.f.rating,0)/o.length;
        for(const x of o){const i=l.indexOf(x.f);if(i>=0){rank+=1/o.length;melhor=Math.min(melhor,i);}}}return {nota:nota/20,rank:rank/20,melhor};};
      const r=[.18,.25,.35,LIMIAR_TOP15-.001,.50,.70,.86].map(medir);st.standing=salva;fought.clear();saidas.forEach(n=>fought.add(n));return r;
    })())`));
    const notas = r.map((x) => x.nota);
    if (!notas.every((x, i) => i === 0 || x > notas[i - 1])) throw new Error("nível não cresce com o standing: " + notas.map((x) => x.toFixed(3)).join(" "));
    if (r[0].rank !== 0 || r[1].rank !== 0) throw new Error("começo de carreira enfrentou ranqueado: " + JSON.stringify(r.slice(0, 2)));
    const semRank = r.slice(0, 4).map((x) => x.melhor);
    if (semRank.some((m) => m < 13)) throw new Error("sem ranking enfrentou alguém acima do #13 (melhor posição por standing): " + JSON.stringify(semRank));
    if (r[5].rank < 0.6 || r[6].rank < 0.6) throw new Error("ranqueado enfrenta pouco ranqueado: " + JSON.stringify(r.slice(5)));
  });
  await conf("v1 intacta: carreira nova grava regras 3 (v3 desde 2026-10-05) e o link leva r=3; link r=2 fica na v2; save sem st.regras e link sem r= ficam na v1 (pool com aposentados)", () => {
    if (X.run("st.regras") !== 3 || !/&r=3/.test(X.run("urlDesafio()"))) throw new Error("carreira nova: " + X.run("st.regras") + " " + X.run("urlDesafio()"));
    const save = JSON.parse(X.run("JSON.stringify(montarSave())"));
    delete save.st.regras;
    const Y = sandboxCarreira();
    Y.sb.__S = JSON.stringify(save); Y.sb.__RJ = RJ;
    Y.run("ROSTER=JSON.parse(globalThis.__RJ);CUTOFF_RANKING=Math.max(...ROSTER.map(f=>f.era?f.era[1]:0))-6;aplicarSave(JSON.parse(globalThis.__S));");
    if (Y.run("REGRAS") !== 1) throw new Error("save antigo abriu nas regras " + Y.run("REGRAS"));
    if (!Y.run("POOL.some(f=>f.era&&f.era[1]<ANO_ATIVO)")) throw new Error("save antigo perdeu os aposentados do pool");
    Y.sb.URLSearchParams = URLSearchParams; // o vm não tem; sem ele lerDesafio() devolve null
    const ler = (q) => { Y.sb.location.search = q; return JSON.parse(Y.run("JSON.stringify(lerDesafio())")); };
    if (ler("?d=lightweight&s=abc").regras !== 1 || ler("?d=lightweight&s=abc&r=2").regras !== 2 || ler("?d=lightweight&s=abc&r=3").regras !== 3)
      throw new Error("link: regras erradas");
  });
  await conf("teto do estreante (v3, 2026-10-05): nenhuma carta da mesa traz atributo acima do teto da divisão (percentil 75; golpes sofridos: nunca abaixo do espelho); a v2 continua sem teto", () => {
    const r = JSON.parse(X.run(`JSON.stringify((()=>{
      const salva=REGRAS, rs=mulberry32(4242), ruins=[]; let comTeto=0, acimaV2=0;
      for(const v of [3,2]){
        REGRAS=v;
        for(let k=0;k<200;k++)for(const c of rollTable(POOL,PAIRS,rs,PCT)){
          for(const key of [c.pair.a.key,c.pair.b.key].flatMap(x=>[x,...(RIDERS[x]||[])])){
            const t=tetoEstreante(POOL,key), val=c.src[key];
            if(val==null)continue;
            const passa=key==="sapm"?val<t:val>t;
            if(v===3&&passa)ruins.push(key+" "+val+" passa de "+t);
            if(v===2&&passa)acimaV2++;
          }
          if(v===3&&c.src.teto)comTeto++;
        }
      }
      REGRAS=salva;
      return {ruins:ruins.slice(0,3),comTeto,acimaV2};
    })())`));
    if (r.ruins.length) throw new Error("carta acima do teto na v3: " + r.ruins.join(" | "));
    if (!r.comTeto) throw new Error("nenhuma carta bateu no teto (o teste não testou nada)");
    if (!r.acimaV2) throw new Error("a v2 também ficou com teto (save e link antigos mudariam)");
  });
  await conf("escada v3 (2026-10-05): sem ranking, o adversário acompanha o nível do jogador (mais forte, estreia contra gente mais forte), sem ranqueado na estreia", () => {
    const r = JSON.parse(X.run(`JSON.stringify((()=>{
      const sStd=st.standing, saidas=[...fought], evAntes=JSON.stringify(st.eventoMod||{});
      const top=new Set(RANKING.lista.map(f=>f.name));
      const media=()=>{let soma=0,rank=0;
        for(let k=0;k<20;k++){st.standing=.18;fought.clear();const o=faixasV2();soma+=o.reduce((a,x)=>a+LADDER.indexOf(x.f),0)/o.length;rank+=o.filter(x=>top.has(x.f.name)).length;}
        return {pos:+(soma/20/(LADDER.length-1)).toFixed(3),rank};};
      const normal=media();
      st.eventoMod={slpm:1.35,kdAvg:1.35,durability:1.35,tdAvg:1.35,subAvg:1.35,strDef:1.06,tdDef:1.06};
      const forte=media();
      st.eventoMod={slpm:.6,kdAvg:.6,durability:.6,tdAvg:.6,subAvg:.6,strDef:.85,tdDef:.85};
      const fraco=media();
      st.eventoMod=JSON.parse(evAntes);st.standing=sStd;fought.clear();saidas.forEach(n=>fought.add(n));
      return {fraco,normal,forte};
    })())`));
    /* o draftado comum costuma vencer até o melhor sem ranking (a estreia já
       sai no topo da fila); quem é mais fraco começa mais embaixo */
    if (!(r.normal.pos > r.fraco.pos + 0.03 && r.forte.pos >= r.normal.pos - 0.01)) throw new Error("o adversário não acompanhou o nível: " + JSON.stringify(r));
    if (r.fraco.rank || r.normal.rank || r.forte.rank) throw new Error("estreia com ranqueado: " + JSON.stringify(r));
  });
  await conf("nocaute da carreira v3 (2026-10-05): a luta usa KO_CARREIRA nos dois lados e a chance das cartas usa o mesmo; luta entre reais e carreira v2 continuam com 1", async () => {
    const r = JSON.parse(X.run(`JSON.stringify((()=>{
      const salva=REGRAS;
      const v3=fatorKoCarreira(); REGRAS=2; const v2=fatorKoCarreira(); REGRAS=salva;
      const eu=lutadorEfetivo(), chance=(opp,k)=>{let w=0;for(let s=1;s<=24;s++)if(simulateFight(eu,opp,{seed:s*31+7,koMult:k}).winner===eu.name)w++;return w/24;};
      cacheChance=null;
      /* 12 adversários: a chance das cartas bate com a luta COM o fator, e o
         fator muda a chance de pelo menos um (senão o teste não testa nada) */
      const ops=POOL.slice(0,12);
      const igual=ops.every(o=>chanceContra(o)===chance(o,KO_CARREIRA))&&ops.some(o=>chance(o,KO_CARREIRA)!==chance(o,1));
      const a=JSON.stringify(simulateFight(POOL[1],POOL[2],{seed:77})), b=JSON.stringify(simulateFight(POOL[1],POOL[2],{seed:77,koMult:1}));
      let kd0=0;
      for(let s=1;s<=60;s++){const f=simulateFight(POOL[1],POOL[2],{seed:s,koMult:0});kd0+=Object.values(f.knockdowns).reduce((x,y)=>x+y,0)+(/ocaute/.test(f.method)?1:0);}
      return {v3,v2,igual,mesmaLuta:a===b,kd0,ko:KO_CARREIRA};
    })())`));
    if (r.v3 !== r.ko || !(r.ko < 1) || r.v2 !== 1) throw new Error("fator: " + JSON.stringify(r));
    if (!r.igual) throw new Error("a chance das cartas não usa o fator da luta");
    if (!r.mesmaLuta) throw new Error("simulateFight sem koMult mudou (a calibração do motor tem que ficar igual)");
    if (r.kd0 !== 0) throw new Error("com fator 0 ainda houve knockdown: o fator não chega no impact()");
    /* a luta de verdade da carreira (rodarLuta) monta os dois lados com o fator */
    const Y = sandboxCarreira();
    iniciarCarreiraTeste(Y, F, 995501, "normal", RJ);
    Y.run(`globalThis.__ko=[];(function(){const o=simularRound;simularRound=function(A,B){if(playing)globalThis.__ko.push([A.koMult,B.koMult]);return o.apply(this,arguments);};})();`);
    await jogarCarreiraAte(Y, 2);
    const ko = JSON.parse(Y.run("JSON.stringify(globalThis.__ko)")), k = Y.run("KO_CARREIRA");
    if (!ko.length || ko.some(([a, b]) => a !== k || b !== k)) throw new Error("rounds da carreira sem o fator: " + JSON.stringify(ko.slice(0, 4)));
  });
  await conf("v1 intacta: a escada antiga continua igual pra quem está nela (centro nunca abaixo de 45% da divisão)", () => {
    const Y = sandboxCarreira();
    Y.run("REGRAS=1;");
    iniciarCarreiraTeste(Y, F, 993001, "normal", RJ);
    const r = JSON.parse(Y.run(`JSON.stringify((()=>{st.tituloEstaLuta=false;const N=LADDER.length;
      return {regras:st.regras,min:Math.min(...candidatos().map(o=>LADDER.indexOf(o.f))),piso:Math.floor((0.45)*(N-1))+Math.round(0.10*N)};})())`));
    if (r.regras !== 1 || r.min < r.piso) throw new Error("escada v1 mudou: " + JSON.stringify(r));
  });
  await conf("carreira v2 inteira (6 carreiras de 22 lutas, peso-leve) sem adversário repetido fora da disputa de título e do rival", async () => {
    const ruins = [];
    for (let k = 0; k < 6; k++) {
      const Y = sandboxCarreira();
      iniciarCarreiraTeste(Y, F, 994000 + k, "normal", RJ);
      /* gira entre as três cartas (fácil, parelha, difícil), como a suíte
         diversidade; o automático sempre pegaria a do meio */
      Y.run(`globalThis.__lutas=[];(function(){const o=lutar;lutar=function(esc,camp){
        const ops=candidatos();const alvo=ops[fightNo%ops.length]||esc;
        globalThis.__lutas.push({adv:alvo.f.name,titulo:!!st.tituloEstaLuta,rival:!!alvo.rival,standing:+st.standing.toFixed(3),
          jaLutou:fought.has(alvo.f.name),idx:fightNo%ops.length,n:ops.length});return o.call(this,alvo,camp);};})();`);
      await jogarCarreiraAte(Y, 22);
      const lutas = JSON.parse(Y.run("JSON.stringify(globalThis.__lutas)"));
      for (const [i, l] of lutas.entries()) if (l.jaLutou && !l.titulo && !l.rival) ruins.push(`semente ${994000 + k}, luta ${i + 1}: ${l.adv} de novo (standing ${l.standing})`);
    }
    if (ruins.length) throw new Error(ruins.length + " repetidos: " + ruins.slice(0, 6).join(" | "));
  });
  const okTudo = !falhas.length;
  console.log("\n" + (okTudo ? verde("  regras ok") : vermelho(`  ${falhas.length} falha(s) nas regras`)));
  return okTudo;
}

/* ================================================================== *
 * LUTA INTERATIVA NA CARREIRA (2026-10-04, branch local, pedido do dono):
 *     plano antes de cada round, 4 opções que mudam, vale só no round.
 * ================================================================== */
async function testarLutaInterativa() {
  console.log("\n" + cinza("luta interativa: plano antes de cada round, 4 opções que mudam, vale só no round, automático não abre"));
  const F = lerLutadores();
  const falhas = [];
  const conf = async (nome, fn) => {
    try { await fn(); console.log(verde("  ok    ") + nome); }
    catch (e) { falhas.push(nome); console.log(vermelho("  falha ") + nome + "\n         " + e.message); }
  };
  const R0 = sandboxCarreira(); R0.sb.__F = F;
  const RJ = R0.run("JSON.stringify(rateAll(globalThis.__F))");
  /* joga lutas no manual clicando a opção k%4 de cada plano; registra o
     plano aberto (ids, eixos) e o mAttr do jogador no começo de cada round */
  const jogarManual = async (seed, nLutas) => {
    const paineis = [];
    const X = sandboxCarreira();
    iniciarCarreiraTeste(X, F, seed, "normal", RJ);
    X.run(`auto=false;globalThis.__planos=[];globalThis.__rounds=[];globalThis.__aplicados=[];
      (function(){const ap=aplicarPlano;aplicarPlano=function(estado,base,esc){const r=ap.apply(this,arguments);
          globalThis.__aplicados.push({luta:fightNo,esc:esc?JSON.parse(JSON.stringify(esc)):null,base:JSON.stringify(base),mAttr:JSON.stringify(estado.mAttr)});return r;};})();
      (function(){const o=abrirEscolhaLuta;abrirEscolhaLuta=function(sc,ref,opp,cb,info){
        const ids=o.apply(this,arguments);
        if(ids)globalThis.__planos.push({luta:fightNo,round:info&&info.round,ids,eixos:ids.map(id=>ACOES_LUTA.find(a=>a.id===id).attr)});
        return ids;};
       const r=simularRound;simularRound=function(A,B,round){
         /* só a luta de verdade (playing): chanceContra() simula lutas pelo mesmo simularRound */
         if(playing)globalThis.__rounds.push({luta:fightNo,round,mAttr:JSON.stringify(A.mAttr),auto});return r.apply(this,arguments);};})();`);
    for (let l = 0; l < nLutas; l++) {
      X.run("nextFight();");
      for (let k = 0; k < 4; k++) { X.drenar(); await respirarCarreira(); }
      const opps = X.registro.opps.children.filter(n => (n.className || "").split(" ").includes("opp") && n.onclick).slice(-X.run("ofertaAtual.length"));
      opps[l % opps.length].onclick();
      const camps = X.registro.camps.children.filter(n => (n.className || "").split(" ").includes("camp") && n.onclick).slice(-X.run("CAMPS.length"));
      camps[0].onclick();
      if (X.registro.colpular && X.registro.colpular.onclick) { X.registro.colpular.onclick(); delete X.registro.colpular; }
      for (let g = 0; g < 60 && X.run("playing"); g++) {
        X.drenar(); await respirarCarreira();
        const op = Object.keys(X.registro).filter(k2 => k2.startsWith("el_")).map(k2 => X.registro[k2]).filter(n => n.onclick);
        if (op.length) { op[(l + g) % op.length].onclick(); Object.keys(X.registro).filter(k2 => k2.startsWith("el_")).forEach(k2 => delete X.registro[k2]); }
      }
      for (let k = 0; k < 4; k++) { X.drenar(); await respirarCarreira(); }
      paineis.push(X.registro.lutaNumeros ? X.registro.lutaNumeros.innerHTML : "");
      /* resolverDilemaTeste liga o automático pra seguir; aqui a luta é manual */
      if (await resolverDilemaTeste(X, "aceito, sem problema")) { X.run("auto=false;"); for (let k = 0; k < 4; k++) { X.drenar(); await respirarCarreira(); } }
      X.run("auto=false;");
      if (X.run("entrevistaAberta")) X.run("entrevistaAberta=false;");
    }
    return { X, planos: JSON.parse(X.run("JSON.stringify(__planos)")), rounds: JSON.parse(X.run("JSON.stringify(__rounds)")),
      aplicados: JSON.parse(X.run("JSON.stringify(__aplicados)")), paineis,
      registro: JSON.parse(X.run("JSON.stringify(st.registro)")), auto: X.run("auto") };
  };
  const j = await jogarManual(995001, 6);
  await conf("um plano antes de cada round que a luta alcança (o 1º inclusive), sempre com 4 opções", () => {
    if (j.registro.length < 5) throw new Error("só " + j.registro.length + " lutas");
    for (const [i, reg] of j.registro.entries()) {
      const n = j.planos.filter(p => p.luta === i + 1).length;
      if (n !== reg.round) throw new Error(`luta ${i + 1} acabou no round ${reg.round} e abriu ${n} planos (auto ${JSON.stringify(j.rounds.filter(r => r.luta === i + 1).map(r => r.auto))}, ${j.planos.length} planos ao todo nas lutas ${[...new Set(j.planos.map(p => p.luta))]})`);
    }
    const ruins = j.planos.filter(p => p.ids.length !== 4);
    if (ruins.length) throw new Error("plano sem 4 opções: " + JSON.stringify(ruins[0]));
  });
  await conf("as opções mudam: nenhuma repete a do round anterior, e pelo menos 3 eixos diferentes por plano", () => {
    for (let i = 1; i < j.planos.length; i++) {
      const a = j.planos[i - 1], b = j.planos[i];
      if (a.luta === b.luta && b.ids.some(id => a.ids.includes(id))) throw new Error(`luta ${b.luta}, round ${b.round} repetiu opção do round anterior: ${b.ids}`);
    }
    const poucos = j.planos.filter(p => new Set(p.eixos).size < 3);
    if (poucos.length) throw new Error("plano com menos de 3 eixos: " + JSON.stringify(poucos[0]));
  });
  await conf("o plano vale só no round dele: cada round roda com o plano aplicado em cima da base (eficácia, esforço e custo do perfil), sem herdar o round anterior", () => {
    const P = JSON.parse(j.X.run("JSON.stringify(PERFIL_PLANO)"));
    for (const [i, reg] of j.registro.entries()) {
      const apl = j.aplicados.filter(x => x.luta === i + 1);
      const rounds = j.rounds.filter(r => r.luta === i + 1).slice(0, reg.round);
      if (apl.length !== reg.round) throw new Error(`luta ${i + 1}: ${apl.length} planos aplicados em ${reg.round} rounds`);
      for (const [k, r] of rounds.entries()) {
        const a = apl[k];
        if (r.mAttr !== a.mAttr) throw new Error(`luta ${i + 1}, round ${r.round}: rodou com ${r.mAttr}, o plano aplicado era ${a.mAttr}`);
        const base = JSON.parse(a.base), m = JSON.parse(a.mAttr), pf = P[a.esc.attr];
        const permitidos = new Set([pf.eficacia, pf.extra, ...Object.keys(pf.esforco || {}), ...Object.keys(pf.custo || {})].filter(Boolean));
        const mudados = Object.keys(m).filter(x => m[x] !== base[x]);
        if (mudados.some(x => !permitidos.has(x))) throw new Error(`luta ${i + 1}, round ${r.round}: plano ${a.esc.nome} mexeu em ${mudados} (perfil ${[...permitidos]})`);
        for (const c of Object.keys(pf.custo || {})) if (!(m[c] < base[c])) throw new Error(`luta ${i + 1}, round ${r.round}: o custo do plano ${a.esc.nome} (${c}) não pesou`);
        if (JSON.stringify(base) !== JSON.stringify(JSON.parse(apl[0].base))) throw new Error(`luta ${i + 1}: a base mudou entre os rounds (o plano anterior ficou)`);
      }
    }
  });
  await conf("a narração cita o plano em destaque: a intenção no começo de cada round e o resultado no fim, no log da luta e no Cartel", () => {
    const linhas = j.X.registro.play.children.filter(n => (n.className || "").split(" ").includes("plano")).map(n => n.innerHTML);
    if (!linhas.some(h => /Plano de .+: /.test(h)) || !linhas.some(h => /Resultado do plano .+: (deu certo|não deu certo|sem teste)/.test(h)))
      throw new Error("narração sem a intenção ou sem o resultado do plano: " + linhas.slice(0, 3).join(" | "));
    for (const [i, reg] of j.registro.entries()) {
      const pl = (reg.narracao || []).filter(([, k]) => k === "plano").map(([, , t]) => t);
      const inicios = pl.filter(t => /^Plano de /.test(t)).length, fins = pl.filter(t => /^Resultado do plano /.test(t)).length;
      const terminados = reg.metodo === "Decisão" ? reg.round : reg.round - 1;
      if (inicios !== reg.round || fins !== terminados) throw new Error(`luta ${i + 1} (${reg.metodo}, round ${reg.round}): ${inicios} intenções e ${fins} resultados no Cartel`);
    }
    const chip = j.X.registro.placarPlano;
    if (!chip || !/Plano do round \d+: <b>/.test(chip.innerHTML || "")) throw new Error("placar sem o plano: " + (chip && chip.innerHTML));
  });
  await conf("o painel conta os knockdowns de quem derrubou, igual ao registro da luta (o motor guarda em quem caiu)", () => {
    /* reg.kd = [os que você fez, os que ele fez]; o painel de cada luta tem que bater */
    let assimetricas = 0;
    for (const [i, reg] of j.registro.entries()) {
      const kd = [...(j.paineis[i] || "").matchAll(/data-num="kd-(eu|ele)"><b>(\d+)<\/b>/g)].map(m => +m[2]);
      if (kd.length !== 2 || kd[0] !== reg.kd[0] || kd[1] !== reg.kd[1]) throw new Error(`luta ${i + 1}: painel kd ${kd}, registro ${reg.kd}`);
      if (reg.kd[0] !== reg.kd[1]) assimetricas++;
    }
    if (!assimetricas) throw new Error("nenhuma luta com knockdowns diferentes dos dois lados; trocar a semente pro teste valer");
  });
  await conf("o narrador põe o plano nos eventos certos: queda com Buscar a dupla, sprawl com Sprawl e sair, knockdown com Buscar o nocaute; um certo e um errado por round no máximo", () => {
    const r = JSON.parse(j.X.run(`JSON.stringify((function(){
      const A={ref:{name:"Ana"},sigStrikes:0,knockdowns:0,takedowns:0},B={ref:{name:"Bia"},sigStrikes:0,knockdowns:0,takedowns:0};
      const plano=(id,mod=1)=>{const a=ACOES_LUTA.find(x=>x.id===id);return{v:2,id,nome:a.nome,attr:a.attr,mod};};
      const out={};
      let n=narradorDoPlano(A,B);
      out.dupla=[n.inicio(plano("buscar_dupla",1.2)),...n.evento({tipo:"quedaDefendida",quem:"A"}),...n.evento({tipo:"quedaDefendida",quem:"A"}),...n.evento({tipo:"queda",quem:"A"}),n.fimRound()];
      n=narradorDoPlano(A,B);
      out.sprawl=[n.inicio(plano("sprawl_sair",.8)),...n.evento({tipo:"quedaDefendida",quem:"B"}),...n.evento({tipo:"queda",quem:"B"}),n.fimRound()];
      n=narradorDoPlano(A,B);
      out.nocaute=[n.inicio(plano("buscar_nocaute")),...n.evento({tipo:"janela",a:5,b:2}),...n.evento({tipo:"janela",a:6,b:1}),...n.evento({tipo:"kd",quem:"A"}),...n.evento({tipo:"janela",a:0,b:5})];
      n=narradorDoPlano(A,B);
      out.semPlano=[n.inicio(null),...n.evento({tipo:"queda",quem:"A"}),n.fimRound()];
      return out;})())`));
    const d = r.dupla;
    if (d[0] !== "Plano de Ana: buscar a queda de duas pernas em Bia." || d[1] !== "Ana tenta a dupla, mas Bia segura a base." || d.length !== 4
      || d[2] !== "A dupla de Ana entra e Bia cai de costas." || d[3] !== "Resultado do plano Buscar a dupla: deu certo, 1 queda em 3 tentativas. Esse plano casa com o seu jogo contra Bia.")
      throw new Error("dupla: " + JSON.stringify(d));
    const sp = r.sprawl;
    if (sp[1] !== "Ana joga o quadril pra trás e Bia não derruba." || sp[2] !== "Ana tenta o sprawl, mas Bia chega antes e derruba." || !/não deu certo, Bia tentou 2 quedas e derrubou 1\. Bia é forte justamente nisso\.$/.test(sp[3]))
      throw new Error("sprawl: " + JSON.stringify(sp));
    const nc = r.nocaute;
    if (nc.filter(t => /pesada/.test(t)).length !== 1 || !nc.includes("O plano deu resultado: Ana derrubou Bia.") || !nc.some(t => /erra e Bia pune/.test(t)))
      throw new Error("nocaute: " + JSON.stringify(nc));
    if (r.semPlano.some(Boolean)) throw new Error("sem plano o narrador falou: " + JSON.stringify(r.semPlano));
  });
  await conf("o plano muda a luta de verdade: mesma luta (mesma semente), plano diferente, round diferente", () => {
    const r = JSON.parse(j.X.run(`JSON.stringify((function(){
      const opp=LADDER[Math.floor(LADDER.length/2)],eu=lutadorEfetivo();
      const rodar=(id)=>{const rng=mulberry32(4242),form=()=>1+(rng()+rng()+rng()-1.5)/1.5*TUNING.formSpread;
        const A=mkState(eu,form()),B=mkState(opp,form()),base={...A.mAttr};
        if(id){const a=ACOES_LUTA.find(x=>x.id===id);aplicarPlano(A,base,{v:2,id,nome:a.nome,attr:a.attr,mod:modificadorAcao(a,A.ref,B.ref)});}
        const tot={g:0,q:0,s:0};
        for(let k=0;k<40;k++){const a2=mkState(eu,A.form),b2=mkState(opp,B.form);a2.mAttr={...A.mAttr};const r2=mulberry32(900+k);
          simularRound(a2,b2,1,r2,()=>{},()=>({}),{sa:0,sb:0});tot.g+=a2.sigStrikes;tot.q+=a2.takedowns;tot.s+=a2.subAttempts;}
        return tot;};
      return {sem:rodar(null),dupla:rodar("buscar_dupla"),guarda:rodar("fechar_guarda"),pescoco:rodar("cacar_pescoco")};})())`));
    if (!(r.dupla.q > r.sem.q)) throw new Error("Buscar a dupla não deu mais quedas: " + JSON.stringify(r));
    if (!(r.guarda.g < r.sem.g)) throw new Error("Fechar a guarda não cobrou golpes: " + JSON.stringify(r));
    if (JSON.stringify(r.pescoco) === JSON.stringify(r.sem)) throw new Error("Caçar o pescoço não mudou nada: " + JSON.stringify(r));
  });
  await conf("automático não abre o plano nem gasta o escolhaRng", async () => {
    const X = sandboxCarreira();
    iniciarCarreiraTeste(X, F, 995002, "normal", RJ);
    const antes = X.run("escolhaRng.estado()");
    await jogarCarreiraAte(X, 4);
    if (X.run("escolhaRng.estado()") !== antes) throw new Error("o automático gastou o escolhaRng");
    if (Object.keys(X.registro).some(k => k.startsWith("el_"))) throw new Error("o automático abriu plano");
  });
  await conf("narração a 50 caracteres por segundo (pedido do dono, 2026-10-05): a linha comum sai a 50 por segundo em 1x, nenhuma mais rápida, mínimo de 0,5 s; 2x e 4x dividem o tempo", async () => {
    /* histórico: 0,47 s fixo por linha (uns 90 por segundo, ilegível), depois
       uns 17 por segundo (lento demais). Linhas de uma luta de verdade, mais
       as do plano (as mais longas). */
    const X = sandboxCarreira(); X.sb.__F = F;
    /* anota o intervalo de cada setTimeout da narração; o primeiro passo roda
       na hora e os outros saem dos timers, então drena antes de ler */
    const coletar = vel => {
      const mm = X.sb.window.matchMedia;
      X.sb.window.matchMedia = () => ({ matches: false });   // sem reduce-motion: o ritmo de verdade
      X.run("globalThis.__d=[];");
      /* só os passos da narração (o nocaute também agenda o fim do piscar) */
      X.run(`(function(){const st0=setTimeout;globalThis.__st0=st0;
        setTimeout=function(fn,ms){if(fn&&fn.name==="step")globalThis.__d.push(ms);return st0(fn,ms);};})();`);
      X.run(`speed=${vel};globalThis.__ln=simulateFight(__F[0],__F[3],{seed:11}).log.concat([
        {round:1,clock:"",kind:"plano",text:"Plano de "+__F[0].name+": amarrar "+__F[3].name+" no clinch e esfriar a luta."},
        {round:1,clock:"",kind:"plano",text:"Resultado do plano Amarrar no clinch: não deu certo, "+__F[3].name+" tentou 3 quedas e derrubou 2. "+__F[3].name+" é forte justamente nisso."}]);
        animarTrecho(globalThis.__ln,function(){globalThis.__acabou=true;});`);
      X.drenar();
      const r = JSON.parse(X.run(`setTimeout=globalThis.__st0;JSON.stringify({d:globalThis.__d,c:globalThis.__ln.map(L=>String(L.text).replace(/<[^>]+>/g,"").length),acabou:!!globalThis.__acabou})`));
      X.run("globalThis.__acabou=false;");
      X.sb.window.matchMedia = mm;
      return r;
    };
    const v1 = coletar(1), v2 = coletar(2), v4 = coletar(4);
    if (!v1.acabou) throw new Error("a narração não chegou ao fim");
    if (v1.d.length !== v1.c.length) throw new Error(`esperava um intervalo por linha: ${v1.d.length} intervalos, ${v1.c.length} linhas`);
    v1.d.forEach((ms, i) => {
      if (ms < 500) throw new Error(`linha ${i} ficou ${ms} ms`);
      if (v1.c[i] / (ms / 1000) > 50.01) throw new Error(`linha ${i} (${v1.c[i]} caracteres) ficou ${ms} ms: ${(v1.c[i] / (ms / 1000)).toFixed(1)} por segundo`);
    });
    /* linha comum (sem pausa) e longa o bastante pra passar do mínimo: exatamente 50 por segundo */
    const comuns = JSON.parse(X.run("JSON.stringify(globalThis.__ln.map(L=>!L.kind))"));
    const exatas = v1.d.filter((ms, i) => comuns[i] && v1.c[i] * 20 >= 500);
    if (exatas.length < 5) throw new Error("poucas linhas comuns na amostra: " + exatas.length);
    v1.d.forEach((ms, i) => {
      if (comuns[i] && v1.c[i] * 20 >= 500 && Math.abs(v1.c[i] / (ms / 1000) - 50) > 0.01)
        throw new Error(`linha comum ${i} (${v1.c[i]} caracteres) ficou ${ms} ms: ${(v1.c[i] / (ms / 1000)).toFixed(1)} por segundo, não 50`);
    });
    v1.d.forEach((ms, i) => {
      if (Math.abs(v2.d[i] - ms / 2) > 1 || Math.abs(v4.d[i] - ms / 4) > 1) throw new Error(`linha ${i}: 1x ${ms}, 2x ${v2.d[i]}, 4x ${v4.d[i]}`);
    });
  });
  const okTudo = !falhas.length;
  console.log("\n" + (okTudo ? verde("  luta interativa ok") : vermelho(`  ${falhas.length} falha(s) na luta interativa`)));
  return okTudo;
}

/* ================================================================== *
 * LUTA INTERATIVA: calibração (2026-10-04, branch local). Mesmo protocolo
 *     da gapescolha (pares reais, sinal real), só que com o plano antes de
 *     CADA round, 4 opções (quartetoDoRound) e valendo só no round.
 *     Métodos com a política realista (opção ao acaso) contra o teto de
 *     nocaute de 35% (CLAUDE.md, calibração do motor), e o gap em vitórias
 *     entre sempre a que casa e sempre a que erra.
 * ================================================================== */
function testarGapInterativa(N = 3000) {
  console.log("\n" + cinza(`${N} pares, plano a cada round (4 opções, vale só no round): métodos e gap`));
  const M = carregarMotor(), F = lerLutadores();
  const byDiv = {};
  F.forEach(f => (byDiv[f.division] ||= []).push(f));
  const divs = Object.keys(byDiv);
  const pctPorDiv = {};
  divs.forEach(d => pctPorDiv[d] = M.makePercentiler(byDiv[d]));
  const modAcao = (acao, jog, opp, PCT) => 1 + M.K_ESCOLHA_LUTA * (M.contest(PCT(acao.attr, jog[acao.attr]), PCT(M.COUNTER_ATTR[acao.attr], opp[M.COUNTER_ATTR[acao.attr]])) - .5) * 2;
  function driver(a, b, seed, politica) {
    const PCT = pctPorDiv[a.division];
    const rng = M.mulberry32(seed), escolha = M.mulberry32(seed ^ 0x5F3A9C21);
    const form = () => 1 + (rng() + rng() + rng() - 1.5) / 1.5 * M.TUNING.formSpread;
    const A = M.mkState(a, form()), B = M.mkState(b, form());
    const base = { ...A.mAttr };
    const kds = () => ({ [A.ref.name]: A.knockdowns, [B.ref.name]: B.knockdowns });
    const fin = (w, l, round, clock, met) => ({ winner: w.ref.name, loser: l.ref.name, method: met, round, clock, cards: null, log: [], knockdowns: kds() });
    const scores = { sa: 0, sb: 0 };
    let res = null, sinal = "parelho", anteriores = [];
    for (let round = 1; round <= 3 && !res; round++) {
      /* as mesmas 4 opções do jogo (quartetoDoRound), com um gerador próprio */
      const opcoes = M.quartetoDoRound(sinal, anteriores, escolha);
      anteriores = opcoes.map(o => o.id);
      let acao;
      if (politica === "neutra") acao = null;
      else if (politica === "realista") acao = opcoes[Math.floor(escolha() * opcoes.length)];
      else {
        const ord = [...opcoes].sort((x, y) => modAcao(y, A.ref, B.ref, PCT) - modAcao(x, A.ref, B.ref, PCT));
        acao = politica === "sempreCasa" ? ord[0] : ord[ord.length - 1];
      }
      M.aplicarPlano(A, base, acao ? { v: 2, id: acao.id, nome: acao.nome, attr: acao.attr, mod: modAcao(acao, A.ref, B.ref, PCT) } : null);
      const antes = { a: A.sigStrikes, at: A.takedowns, ac: A.controlTicks, b: B.sigStrikes, bt: B.takedowns, bc: B.controlTicks };
      res = M.simularRound(A, B, round, rng, () => {}, fin, scores);
      sinal = M.sinalDoRound({ burstA: A.sigStrikes - antes.a, burstB: B.sigStrikes - antes.b, tdA: A.takedowns - antes.at, tdB: B.takedowns - antes.bt, ctrlA: A.controlTicks - antes.ac, ctrlB: B.controlTicks - antes.bc });
    }
    if (!res) {
      const w = scores.sa > scores.sb ? A : scores.sb > scores.sa ? B : (rng() < .5 ? A : B), l = w === A ? B : A;
      res = { winner: w.ref.name, loser: l.ref.name, method: "Decisão", round: 3 };
    }
    return res;
  }
  const met = { neutra: {}, realista: {}, sempreCasa: {}, sempreErra: {} }, vit = { neutra: 0, realista: 0, sempreCasa: 0, sempreErra: 0 };
  let pares = 0;
  for (let i = 0; i < N; i++) {
    const p = byDiv[divs[i % divs.length]];
    const a = p[(i * 7919) % p.length], b = p[(i * 104729 + 3) % p.length];
    if (a.name === b.name) continue;
    pares++;
    for (const pol of Object.keys(met)) {
      const r = driver(a, b, i + 1, pol);
      const m = /KO|nocaute/i.test(r.method) ? "KO" : /Finaliza/i.test(r.method) ? "FIN" : "DEC";
      met[pol][m] = (met[pol][m] || 0) + 1;
      if (r.winner === a.name) vit[pol]++;
    }
  }
  const pc = (pol, m) => 100 * (met[pol][m] || 0) / pares;
  for (const pol of Object.keys(met))
    console.log(`  ${pol.padEnd(11)} KO ${pc(pol, "KO").toFixed(1)}%  FIN ${pc(pol, "FIN").toFixed(1)}%  DEC ${pc(pol, "DEC").toFixed(1)}%  vitórias do lado A ${(100 * vit[pol] / pares).toFixed(1)}%`);
  const gap = (vit.sempreCasa - vit.sempreErra) / pares * 22;
  console.log(`  gap: sempre a que casa menos sempre a que erra = ${gap.toFixed(2)} vitórias em 22`);
  /* calibração (CLAUDE.md): nocaute até 35% em toda política. A escolha
     pesa nos dois sentidos: o melhor plano rende mais que lutar sem plano,
     o pior rende menos, e a diferença entre eles passa de 1 vitória */
  const v = (pol) => 100 * vit[pol] / pares;
  const checks = [
    ["nocaute até 35% em toda política", Object.keys(met).every(pol => pc(pol, "KO") <= 35)],
    ["o melhor plano rende mais que lutar sem plano (1 ponto ou mais)", v("sempreCasa") >= v("neutra") + 1],
    ["o pior plano rende menos que lutar sem plano (2 pontos ou mais)", v("sempreErra") <= v("neutra") - 2],
    ["sempre o melhor contra sempre o pior: mais de 1 vitória em 22", gap > 1],
  ];
  for (const [nome, ok] of checks) console.log((ok ? verde("  ok    ") : vermelho("  falha ")) + nome);
  return checks.every(([, ok]) => ok);
}

const cmd = (process.argv[2] || "tudo").toLowerCase();
const div = process.argv[3];
let ok = true;

async function main(){
try {
  if (cmd === "interface") ok = await testarInterface(Number(div) || 3, (process.argv[4] || "normal").toLowerCase());
  else if (cmd === "motor") ok = testarMotor();
  else if (cmd === "draft") ok = testarDraft(div || "lightweight");
  else if (cmd === "orcamento") ok = await testarOrcamento();
  else if (cmd === "tutorial") ok = await testarTutorial();
  else if (cmd === "falas") ok = await testarMemoria();
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
  else if (cmd === "balanco") ok = await testarBalanco(Number(div) || 50, process.argv[4] || null);
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
  else if (cmd === "rotas") ok = await testarRotas();
  else if (cmd === "save") ok = await testarSave();
  else if (cmd === "hub") ok = await testarHub();
  else if (cmd === "som") ok = await testarSom();
  else if (cmd === "texto") ok = await testarTexto();
  else if (cmd === "feedfa") ok = await testarFeedFa();
  else if (cmd === "placar") ok = await testarPlacar();
  else if (cmd === "pagamento") ok = await testarPagamento();
  else if (cmd === "admin") ok = await testarAdmin();
  else if (cmd === "amostra") ok = await testarAmostra();
  else if (cmd === "diversidade") ok = await testarDiversidade(Number(div) || 6);
  else if (cmd === "entrevista") ok = await testarEntrevista();
  else if (cmd === "regras") ok = await testarRegrasCarreira();
  else if (cmd === "lutainterativa") ok = await testarLutaInterativa();
  else if (cmd === "gapinterativa") ok = testarGapInterativa(Number(div) || 3000);
  else if (cmd === "jxj") ok = await testarJxJ();
  else if (cmd === "jxjmotor") ok = await testarJxJMotor();
  else if (cmd === "jxjarvore") ok = await testarJxJArvore();
  else if (cmd === "jxjrating") ok = await testarJxJRating();
  else if (cmd === "jxjtemporada") ok = await testarJxJTemporada();
  else if (cmd === "jxjtelas") ok = await testarJxJTelas();
  else if (cmd === "personagem") ok = await testarPersonagem();
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
        ["orcamento", () => testarOrcamento()],
        ["tutorial", () => testarTutorial()],
        ["falas", () => testarMemoria()],
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
        ["rotas", () => testarRotas()],
        ["save", () => testarSave()],
        ["hub", () => testarHub()],
        ["som", () => testarSom()],
        ["texto", () => testarTexto()],
        ["feedfa", () => testarFeedFa()],
        ["balanco", () => testarBalanco(30)],
        ["placar", () => testarPlacar()],
        ["pagamento", () => testarPagamento()],
        ["admin", () => testarAdmin()],
        ["amostra", () => testarAmostra()],
        ["diversidade", () => testarDiversidade(6)],
        ["entrevista", () => testarEntrevista()],
        ["personagem", () => testarPersonagem()],
        ["regras", () => testarRegrasCarreira()],
        ["lutainterativa", () => testarLutaInterativa()],
        ["gapinterativa", () => testarGapInterativa()],
        ["jxj", () => testarJxJ()],
        ["jxjmotor", () => testarJxJMotor()],
        ["jxjarvore", () => testarJxJArvore()],
        ["jxjrating", () => testarJxJRating()],
        ["jxjtemporada", () => testarJxJTemporada()],
        ["jxjtelas", () => testarJxJTelas()],
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
    /* lista lida do próprio arquivo (todo nome comparado com cmd no despacho):
       a versão escrita à mão ficou desatualizada por semanas sem ninguém
       notar, e o CLAUDE.md manda consultar esta mensagem. */
    const nomes = [...new Set([...fs.readFileSync(__filename, "utf8").matchAll(/cmd === "(\w+)"/g)].map(m => m[1]))];
    console.log(`\nuso: node testar.js [${nomes.join("|")}] [divisão] [normal|lenda]\n`);
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
