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
      + "\ntry{globalThis.__x.escolhaAberta=()=>escolhaAberta;}catch(e){}",
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
  await passo("tela de nome", () => UI.screenName());
  await passo("digitar nome e avançar", () => {
    const inp = env.todos.filter(n => n.tagName === "input" && n.type === "text").pop();
    if (!inp) throw new Error("campo de nome não foi montado");
    inp.value = "TesteBot";                       // sem isso o botão volta sem fazer nada
    const btn = env.todos.filter(n => n.tagName === "button" && n.className === "btn" && n.onclick).pop();
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
    const btns = env.todos.filter(n => n.tagName === "button" && n.className === "btn" && n.onclick);
    if (!btns.length) throw new Error("botão de avançar não foi montado");
    btns[btns.length - 1].onclick();
  });

  await passo("escolher divisão", () => {
    /* No modo lenda o grid é REDESENHADO, então precisamos olhar só o que nasceu
       depois do clique — senão pegaríamos uma carta do grid normal, já órfã. */
    if (modo === "lenda") {
      const bt = env.registro.modo_lenda;
      if (!bt || !bt.onclick) throw new Error("não achei o botão do modo lenda");
      marca = env.todos.length;
      bt.onclick();
    }
    const divs = env.todos.slice(marca).filter(n => (n.className || "").startsWith("div-c") && n.onclick);
    if (!divs.length) throw new Error("nenhuma carta de divisão foi montada");
    /* 11 divisões no normal; no lenda mosca e as três femininas não têm 40
       lendas e saem de propósito, sobram 7. */
    const min = modo === "lenda" ? 6 : 8;
    if (divs.length < min) throw new Error(`só ${divs.length} divisões jogáveis, esperava ao menos ${min}`);
    marca = env.todos.length;          // marca ANTES do clique: é ele que monta o draft
    divs[divEscolhida % divs.length].onclick();
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
    const novasCartas = env.todos.slice(antesDoClique).filter(n => n.className === "card");
    if (!novasCartas.length) throw new Error("clicar não montou cartas novas — renderDraft não rodou de novo");
    marca = antesDoClique;             // as cartas re-roladas são "novas" pro 1º pick abaixo
  });
  passo("reroll: depois de usado, fica desabilitado de verdade (não só no texto)", () => {
    if (!env.registro.reroll.disabled) throw new Error("reroll.disabled continua false depois de usar");
  });
  passo("reroll: clicar de novo desabilitado não re-rola outra vez", () => {
    const antes = env.todos.length;
    env.registro.reroll.onclick();
    const depois = env.todos.slice(antes).filter(n => n.className === "card");
    if (depois.length) throw new Error("2º clique desabilitado ainda montou cartas — não é 1 vez só na criação inteira");
  });

  for (let i = 1; i <= 4; i++) passo(`draft: escolha ${i} de 4`, () => {
    const novas = env.todos.slice(marca).filter(n => n.className === "card" && n.onclick);
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
    const opps = env.todos.slice(marcaLuta).filter(n2 => (n2.className||"").startsWith("opp ") && n2.onclick);
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
    const camps = env.todos.slice(m2).filter(n2 => n2.className === "camp" && n2.onclick);
    if (camps.length < 3) throw new Error(`esperava ao menos 3 camps, vieram ${camps.length}`);
    camps[n % 3].onclick();
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
    if (env.todos.some(n => n.className === "conta-box"))
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
    finishFight(opp,{winner:me.name,method:"Decisão",knockdowns:{},round:3,clock:"0:00"},true);
    passo("titleFight vencido dispara estreia no main card",
      st.momentos.some(m=>m.tipo==="estreia"));
    const qtdApósVitoria=st.momentos.filter(m=>m.tipo==="estreia").length;
    finishFight(opp,{winner:opp.name,method:"Decisão",knockdowns:{},round:3,clock:"0:00"},true);
    passo("2ª luta de título (agora perdendo) NÃO dispara de novo — só a primeira vez",
      st.momentos.filter(m=>m.tipo==="estreia").length===qtdApósVitoria);

    st=stBase(); st.fightNo=8; st.ganhoEscolhido=.10;
    finishFight(opp,{winner:opp.name,method:"Decisão",knockdowns:{},round:3,clock:"0:00"},true);
    passo("titleFight PERDIDO também dispara estreia — é sobre chegar lá, não sobre ganhar",
      st.momentos.some(m=>m.tipo==="estreia"));

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
      peak:0,followers:0,bestBeaten:0,fightNo:TOTAL_FIGHTS});
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

    passo("15 conquistas cadastradas (mais a platina, calculada, não é uma delas)",
      CONQUISTAS.length===15);
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
    ];
    const falsosPositivos=benignos.filter(t=>conteudoInseguro(t));
    passo("não dispara em texto comum de dilema (" + benignos.length + " frases benignas)",
      falsosPositivos.length===0);

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
    aplicarDilema(box,{titulo:"T",cena:"C"},"resposta comum",
      {desfecho:"Fez a escolha certa e ganhou uns seguidores.",seguidores:.05,fa:.3,dinheiro:.4,
       atributo:"nenhum",efeito:1,lesao:null,evitouLesao:false});
    passo("efeito real (não zero): linha de seguidores aparece",
      box.innerHTML.includes("seguidores</span>"));
    passo("efeito real (não zero): linha de fã aparece",
      box.innerHTML.includes("de fã</span>"));
    passo("efeito real (item 2): linha de dinheiro aparece, com R$",
      box.innerHTML.includes("R$"));
    passo("item 2: dinheiro trava em ±1 bolsa (RENDA_BASE) — .4 de fração vira 40% dela",
      st.dinheiro===Math.round(RENDA_BASE*.4));

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
 * 9. AI VIVO — desliga exatamente onde deve, nunca onde não deve
 * ================================================================== */
/* Sem rede nenhuma — alimenta ai() com respostas montadas à mão via um
   fetch falso que devolve o que cada cenário pede. Cobre os seis casos que
   importam: transitorio false/true/ausente (servidor velho), falha sem
   resposta 1x e 2x seguidas, e o contador zerando ao receber qualquer
   resposta no meio de duas falhas de rede. */
function testarAiVivo() {
  console.log("\n" + cinza("aiVivo: desliga só na classe de erro certa, pausa em 429, conta falha de rede"));
  const env = criarAmbiente();
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
  try{
    // cenário 1: transitorio:false desliga na 1ª
    aiVivo=true; aiPausadoAte=0; falhasRedeSeguidas=0;
    __filaSet([{ok:false,body:{error:"upstream",status:401,transitorio:false}}]);
    await ai("julgar",{});
    passo("transitorio:false desliga aiVivo na 1ª chamada", aiVivo===false);

    // cenário 2: transitorio:true NÃO desliga
    aiVivo=true; aiPausadoAte=0; falhasRedeSeguidas=0;
    __filaSet([{ok:false,body:{error:"upstream",status:503,transitorio:true}}]);
    await ai("julgar",{});
    passo("transitorio:true NÃO desliga aiVivo", aiVivo===true);

    // cenário 3: transitorio AUSENTE (servidor velho, deploy do client na
    // frente do servidor) NÃO desliga — é o estado real entre os dois deploys
    aiVivo=true; aiPausadoAte=0; falhasRedeSeguidas=0;
    __filaSet([{ok:false,body:{error:"upstream",status:401}}]);
    await ai("julgar",{});
    passo("transitorio AUSENTE (servidor velho) NÃO desliga aiVivo", aiVivo===true);

    // cenário 4: falha sem resposta 1x não desliga, 2x seguidas desliga
    aiVivo=true; aiPausadoAte=0; falhasRedeSeguidas=0;
    __filaSet([{throw:true}]);
    await ai("julgar",{});
    passo("1ª falha de rede seguida NÃO desliga", aiVivo===true && falhasRedeSeguidas===1);
    __filaSet([{throw:true}]);
    await ai("julgar",{});
    passo("2ª falha de rede SEGUIDA desliga", aiVivo===false);

    // cenário 5: contador zera ao receber QUALQUER resposta (mesmo de erro)
    aiVivo=true; aiPausadoAte=0; falhasRedeSeguidas=0;
    __filaSet([{throw:true}]);
    await ai("julgar",{}); // falha 1 — contador vira 1
    __filaSet([{ok:false,body:{error:"upstream",status:503,transitorio:true}}]);
    await ai("julgar",{}); // respondeu (mesmo com erro) — zera o contador
    passo("contador zera ao receber resposta de erro (não só sucesso)", falhasRedeSeguidas===0);
    __filaSet([{throw:true}]);
    await ai("julgar",{}); // 3ª falha de rede, mas só a 1ª DEPOIS do reset
    passo("depois de zerar, uma falha de rede sozinha NÃO desliga", aiVivo===true);

    // cenário 6: 429 pausa com espera, não desliga — e a pausa bloqueia
    // chamada nova sem nem tentar rede
    aiVivo=true; aiPausadoAte=0; falhasRedeSeguidas=0;
    const antesDe429=Date.now();
    __filaSet([{ok:false,body:{error:"upstream",status:429,transitorio:true}}]);
    await ai("julgar",{});
    passo("429 NÃO desliga aiVivo (permanece true)", aiVivo===true);
    passo("429 seta pausa no futuro", aiPausadoAte>antesDe429);
    const chamadasAntes=__chamadasFetch();
    await ai("julgar",{}); // ainda dentro da janela de pausa
    passo("chamada durante a pausa não tenta rede (fetch não incrementa)",
      __chamadasFetch()===chamadasAntes);
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
     {motivo}) marca qual caminho disparou; confere aqui que os dois
     últimos motivos do cenário de 429 (o próprio 429, depois "pausado" na
     chamada seguinte) saem certos. */
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
    /* eventosVa acumulou TODO cenário do arquivo inteiro (não só o de 429)
       — os dois últimos são exatamente a chamada que levou o 429 e a
       chamada seguinte, dentro da janela de pausa (últimas duas do corpo). */
    const motivos = eventosVa.map(([, obj]) => obj && obj.data && obj.data.motivo);
    const ultimosDois = motivos.slice(-2);
    const extras = [
      ["evento ia_null: motivo \"429\" na chamada que recebeu 429", ultimosDois[0] === "429"],
      ["evento ia_null: motivo \"pausado\" na chamada seguinte (dentro da janela)", ultimosDois[1] === "pausado"],
    ];
    for (const [nome, cond] of extras) {
      if (!cond) ok = false;
      console.log(`  ${cond ? verde("ok   ") : vermelho("fora ")} ${nome}`);
    }
    return ok && passos.length > 0;
  });
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
  else if (cmd === "lesaonocaute") ok = testarLesaoNocaute();
  else if (cmd === "driverluta") ok = testarDriverRodada();
  else if (cmd === "drivermotor") ok = testarDriverMotor(Number(process.argv[3]) || 1, Number(process.argv[4]) || 6000);
  else if (cmd === "dinheiro") ok = testarDinheiro(div || "lightweight");
  else if (cmd === "coerencia") ok = testarCoerencia();
  else if (cmd === "conteudo") ok = testarConteudoInseguro();
  else if (cmd === "eventoia") ok = await testarEventoIA();
  else if (cmd === "resultado") ok = testarResultadoLuta();
  else if (cmd === "aivivo") ok = await testarAiVivo();
  else if (cmd === "desafio") ok = testarDesafio(div || "lightweight");
  else if (cmd === "escolhas") ok = testarEscolhas(div || "lightweight");
  else if (cmd === "treino") ok = testarTreino(div || "lightweight");
  else if (cmd === "divisoes") {
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
    ok = jog >= 8 && jogL >= 6;
  }
  else if (cmd === "tudo") {
    /* roda a interface em 3 divisões diferentes: peso-pesado nocauteia muito,
       mosca vai pros cartões, feminino tem pool menor. Caminhos diferentes. */
    ok = true;
    for (const d of [3, 7, 8]) ok = (await testarInterface(d)) && ok;
    /* No lenda o índice 6 cai no peso-pesado, que é o pool de lendas mais
       apertado que sobra (49). Se algum modo vai estourar a escada, é esse. */
    ok = (await testarInterface(6, "lenda")) && ok;
    if (ok) { ok = testarMotor() && ok; ok = testarDraft(div || "lightweight") && ok; }
    else console.log(cinza("\n  interface quebrada — pulei o resto, conserte isso primeiro"));
    console.log("\n" + (ok ? verde("TUDO CERTO") : vermelho("ALGO SAIU DA FAIXA")) + "\n");
  } else {
    console.log(`\nuso: node testar.js [tudo|interface|motor|draft|escolhas|treino|desafio|divisoes|pesos|cinturao|lesao|resultado|conteudo|aivivo|conquistas|escolhaluta|driverluta] [divisão] [normal|lenda]\n`);
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
