/**
 * api/jxj.js — JxJ (Jogador contra Jogador), 2026-10-01. Roda na Vercel.
 * Spec: docs/superpowers/specs/2026-10-01-jxj-design.md.
 *
 * Rota única com ações: POST {token?, acao, ...}. O navegador só escolhe
 * (ação do combate, ponto da árvore, entrar na fila); resultado, dano,
 * energia, vencedor, rating, XP, fichas e progressão saem daqui e do banco.
 * O banco (supabase_jxj.sql) guarda tudo em tabelas sem policy: só esta
 * rota, com a chave de serviço, chama as funções jxj_*.
 *
 * Desligado por padrão: com JXJ_ATIVO diferente de "true" na Vercel, toda
 * ação responde 503 (menos "definicoes", que diz ativo:false pro menu
 * mostrar "em breve"). Assim o código pode ir pro ar antes da migração.
 *
 * Variáveis: SUPABASE_SERVICE_ROLE_KEY, JXJ_ATIVO, OPENROUTER_API_KEY
 * (narração, opcional), JXJ_NARRACAO_IA ("false" desliga a IA na narração).
 */
import { randomBytes } from "node:crypto";
import { SUPABASE_URL, supabaseServiceRole } from "./_pro.js";
import * as MOTOR from "./_jxj-motor.js";
import * as ARV from "./_jxj-arvores.js";
import * as RAT from "./_jxj-rating.js";
import * as REG from "./_jxj-regras.js";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImthcGRwaXB3cWt1bXpzY2hjdG5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4MzM5OTcsImV4cCI6MjEwNDQwOTk5N30.OSGFGA98NiuWdb6wzF-NJUIxSwClgG3ZA0PnHvJC6Ug";
const ID = /^[1-9]\d{0,14}$/;
const ACOES_PUBLICAS = new Set(["definicoes", "ranking", "perfil", "historico", "hall", "temporada", "torneios", "torneio", "replay"]);
const ACOES_CONTA = new Set(["estado", "criar", "build", "respec", "principal", "aposentar", "moldura", "buildPublica",
  "filaEntrar", "filaSair", "fila", "luta", "confirmar", "recusar", "acao", "revanche", "narracao",
  "torneioInscrever", "torneioSair", "torneioSala"]);
/* limite por conta: [máximo, janela em segundos] (o banco conta, atômico) */
const LIMITES = {
  criar: [20, 3600], build: [120, 3600], respec: [10, 3600], principal: [10, 3600], aposentar: [5, 3600],
  moldura: [30, 3600], buildPublica: [30, 3600], filaEntrar: [40, 600], filaSair: [60, 600], fila: [400, 600],
  luta: [600, 600], confirmar: [60, 600], recusar: [60, 600], acao: [200, 600], revanche: [40, 600],
  narracao: [40, 3600], torneioInscrever: [20, 3600], torneioSair: [20, 3600], torneioSala: [300, 600], estado: [600, 600],
};

class ErroJxJ extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

/* ---------- banco ---------- */
async function rpc(nome, args) {
  const r = await supabaseServiceRole(`rpc/${nome}`, { method: "POST", body: JSON.stringify(args) });
  const txt = await r.text();
  let j = null;
  try { j = txt ? JSON.parse(txt) : null; } catch { j = null; }
  if (!r.ok) {
    const msg = j && typeof j.message === "string" ? j.message : "";
    if (msg.startsWith("jxj: ")) throw new ErroJxJ(msg.slice(5), 400);
    console.error("jxj rpc", nome, r.status, txt.slice(0, 300));
    throw new ErroJxJ("o servidor do JxJ não respondeu, tente de novo", 502);
  }
  return j;
}
async function usuarioDoToken(token) {
  if (!token || typeof token !== "string" || token.length > 4096) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u.id : null;
  } catch {
    return null;
  }
}

/* ---------- validação de payload ---------- */
const idDe = (v, campo = "id") => {
  const s = String(v ?? "");
  if (!ID.test(s)) throw new ErroJxJ(`${campo} inválido`);
  return Number(s);
};
const LIMITES_ROSTO = { pele: 6, porte: 3, cabelo: 9, corCabelo: 7, barba: 6, orelha: 2, nariz: 2, cicatriz: 4, tatuagem: 7, entrada: 7, prajiad: 2, corEntrada: 8 };
function rostoValido(r) {
  if (!r || typeof r !== "object" || Array.isArray(r) || JSON.stringify(r).length > 600) throw new ErroJxJ("aparência inválida");
  const out = { v: 2 };
  for (const [k, n] of Object.entries(LIMITES_ROSTO)) {
    const x = Number(r[k] ?? 0);
    if (!Number.isInteger(x) || x < 0 || x >= n) throw new ErroJxJ("aparência inválida");
    out[k] = x;
  }
  if (typeof r.arquetipo === "string" && /^[a-z]{3,20}$/.test(r.arquetipo)) out.arquetipo = r.arquetipo;
  return out;
}
const chaveNome = (n) => String(n).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/* ---------- luta: preparar, resolver, mostrar ---------- */
const perfilDoLutador = (l) => ARV.perfilDeCombate({ estilo: l.estilo, categoria: l.categoria, build: l.build || {} });
const novaSemente = () => randomBytes(32).toString("hex");

async function prepararSeFaltar(d) {
  const L = d.luta;
  if (L.perfis) return false;
  const perfis = { a: perfilDoLutador(d.lutadorA), b: perfilDoLutador(d.lutadorB) };
  const estado = MOTOR.novaLuta(perfis.a, perfis.b);
  return rpc("jxj_luta_preparar", { lid: L.id, perfis_: perfis, estado_: estado });
}

const outroLado = (l) => (l === "a" ? "b" : "a");
function efeitosDoFim(d, estado, fim) {
  const L = d.luta, F = { a: d.lutadorA, b: d.lutadorB };
  const resultado = (lado) => fim.metodo === "ANULADA" ? "anulada" : fim.vencedor == null ? "empate" : fim.vencedor === lado ? "vitoria" : "derrota";
  const comRating = !!L.com_rating && fim.metodo !== "ANULADA";
  let novos = null;
  if (comRating) {
    const s = fim.vencedor === "a" ? 1 : fim.vencedor === "b" ? 0 : 0.5;
    const agora = Date.parse(d.agora);
    const dias = (l) => (l.ultima_luta_rating ? (agora - Date.parse(l.ultima_luta_rating)) / 864e5 : 0);
    novos = RAT.luta({ r: F.a.rating, rd: F.a.rd, vol: F.a.vol }, { r: F.b.rating, rd: F.b.rd, vol: F.b.vol }, s,
      { diasA: dias(F.a), diasB: dias(F.b) });
  }
  const ef = {};
  for (const lado of ["a", "b"]) {
    const l = F[lado], res = resultado(lado);
    const xp = REG.xpDaLuta({ resultado: res, metodo: fim.metodo, lutasHoje: Number(d[lado === "a" ? "lutasHojeA" : "lutasHojeB"] || 0), comRating });
    const nivel = REG.nivelDoXp(l.xp + xp).nivel;
    const ja = new Set(d[lado === "a" ? "conquistasA" : "conquistasB"] || []);
    const cartoes = (estado.cartoes || []).map((c) => ({ meu: c[lado], dele: c[outroLado(lado)] }));
    const conquistas = REG.conquistasNovas({
      venceu: res === "vitoria", metodo: fim.metodo, vitorias: l.vitorias + (res === "vitoria" ? 1 : 0), nivel,
      perdeuUltimaParaEle: d.ultimoEntreEles === outroLado(lado), cartoes, ja,
    });
    ef[lado] = { resultado: res, xp, nivel, fichas: REG.fichasDaLuta({ resultado: res, metodo: fim.metodo, comRating }), conquistas };
    if (novos) { ef[lado].rating = novos[lado]; ef[lado].ratingAntes = { r: l.rating, rd: l.rd }; }
  }
  return ef;
}

/* Resolve o que estiver pronto: troca com as duas ações, troca com prazo
   vencido (ausência), confirmação vencida. Várias chamadas ao mesmo tempo
   são seguras: o banco grava cada troca uma vez só (versão).
   uid é obrigatório: conta que não lutou não provoca preparo, cancelamento
   por prazo nem gravação de troca (a conferência vem antes de qualquer
   escrita; sem uid, nada é processado). */
async function processarLuta(lid, uid) {
  let d = null;
  for (let passo = 0; passo < 6; passo++) {
    d = await rpc("jxj_luta", { lid });
    if (!d || !d.luta) throw new ErroJxJ("luta não encontrada", 404);
    if (!uid || (d.luta.a_user !== uid && d.luta.b_user !== uid)) throw new ErroJxJ("luta não encontrada", 404);
    const L = d.luta, agora = Date.parse(d.agora);
    if (L.status === "confirmacao") {
      if (!L.perfis) { await prepararSeFaltar(d); continue; }
      if (Date.parse(L.confirmacao_ate) < agora) { await rpc("jxj_luta_cancelar_confirmacao", { lid, quem: null }); continue; }
      return d;
    }
    if (L.status !== "andamento") return d;
    const acoes = { a: null, b: null };
    for (const a of d.acoes || []) acoes[a.lado] = a.familia;
    const vencido = Date.parse(L.prazo) + MOTOR.FORMATO.toleranciaMs < agora;
    if (!(acoes.a && acoes.b) && !vencido) return d;
    const { estado, eventos } = MOTOR.resolverTroca(L.estado, L.perfis, acoes, L.semente);
    const fim = estado.fim ? { ...estado.fim } : null;
    const efeitos = fim ? efeitosDoFim(d, estado, fim) : null;
    await rpc("jxj_gravar_troca", {
      lid, versao_: L.versao, round_: L.round, troca_: L.troca, acao_a_: acoes.a, acao_b_: acoes.b,
      eventos_: eventos, estado_: estado, prazo_ms: MOTOR.FORMATO.prazoMs, fim_: fim, efeitos_: efeitos,
    });
  }
  return d;
}

const nomesDaLuta = (L) => ({ a: (L.nomes.a || {}).nome || "A", b: (L.nomes.b || {}).nome || "B" });
/* O que o jogador vê da luta: nunca a ação do adversário na troca aberta,
   nunca a semente antes do fim, nunca o perfil (build) do adversário. */
function vistaDaLuta(d, uid) {
  const L = d.luta;
  const lado = L.a_user === uid ? "a" : L.b_user === uid ? "b" : null;
  const nomes = nomesDaLuta(L);
  const acoesAbertas = Object.fromEntries((d.acoes || []).map((a) => [a.lado, a.familia]));
  const estado = L.estado;
  const meuPerfil = lado && L.perfis ? L.perfis[lado] : null;
  const vista = {
    id: L.id, tipo: L.tipo, status: L.status, lado, nomes: L.nomes, compromisso: L.compromisso,
    confirmacaoAte: L.confirmacao_ate, confirmado: { a: L.confirmado_a, b: L.confirmado_b },
    round: L.round, troca: L.troca, prazo: L.prazo, agora: d.agora, comRating: L.com_rating,
    formato: MOTOR.FORMATO,
    estado: estado ? {
      pos: estado.pos, nivelPos: estado.nivelPos, momento: estado.momento,
      a: { energia: Math.round(estado.a.energia * 10) / 10, energiaMax: L.perfis ? Math.round(MOTOR.energiaMax(L.perfis.a) * 10) / 10 : 10, dano: Math.round(estado.a.dano), ausentes: estado.a.ausentesSeguidas, total: estado.a.total },
      b: { energia: Math.round(estado.b.energia * 10) / 10, energiaMax: L.perfis ? Math.round(MOTOR.energiaMax(L.perfis.b) * 10) / 10 : 10, dano: Math.round(estado.b.dano), ausentes: estado.b.ausentesSeguidas, total: estado.b.total },
      pontos: estado.pontos, cartoes: estado.cartoes,
    } : null,
    minhaAcao: lado ? acoesAbertas[lado] || null : null,
    adversarioEscolheu: lado ? !!acoesAbertas[outroLado(lado)] : null,
    /* a mão do round (variantes) sai da semente: o servidor calcula e manda
       só as 4 ações de quem pediu, nunca a semente nem a mão do outro */
    acoes: lado && estado && L.status === "andamento" ? MOTOR.acoesDisponiveis(estado, lado, meuPerfil, L.semente) : null,
    papel: lado && estado ? MOTOR.papel(estado, lado) : null,
    /* troca resolvida: o que cada um usou (variante) e os eventos em forma
       de dado (tipo, quem) pra animação e som na tela, além do texto */
    trocas: (d.trocas || []).map((t) => {
      const evs = t.eventos || [], esc = evs.find((ev) => ev.tipo === "escolha") || {};
      return { round: t.round, troca: t.troca, acaoA: t.acao_a, acaoB: t.acao_b, varA: esc.va || null, varB: esc.vb || null,
        ev: evs.filter((ev) => ev.tipo !== "escolha").map((ev) => ({ tipo: ev.tipo, quem: ev.quem || null, metodo: ev.metodo || null })),
        eventos: evs.map((ev) => MOTOR.textoEvento(ev, nomes)).filter(Boolean) };
    }),
  };
  if (L.status === "encerrada") {
    vista.resultado = L.resultado;
    vista.efeitos = L.efeitos;
    vista.semente = L.semente;
    vista.narracao = L.narracao;
    vista.revanche = { a: !!L.revanche_a, b: !!L.revanche_b, luta: L.revanche_luta_id, ate: new Date(Date.parse(L.encerrada_em) + REG.REVANCHE_MS).toISOString() };
  }
  return vista;
}

/* ---------- narração (só fatos do motor; IA opcional, molde local sempre) ---------- */
const METODO_TXT = { KO: "nocaute", TKO: "nocaute técnico", FIN: "finalização", DEC: "decisão", EMPATE: "empate", WO: "W.O.", ANULADA: "luta anulada" };
function narracaoLocal(vista) {
  const n = { a: vista.nomes.a.nome, b: vista.nomes.b.nome }, r = vista.resultado || {};
  const partes = [];
  const porRound = {};
  for (const t of vista.trocas) (porRound[t.round] = porRound[t.round] || []).push(...t.eventos);
  for (const [rd, evs] of Object.entries(porRound)) {
    const fortes = evs.filter((x) => /derrubou|levou a luta pro chão|finalização|raspou|passou a guarda|ground and pound|contra-atacou/.test(x));
    const escolhidos = (fortes.length ? fortes : evs).slice(0, 2);
    if (escolhidos.length) partes.push(`Round ${rd}: ${escolhidos.join(" ")}`);
  }
  const fim = r.vencedor ? `${n[r.vencedor]} venceu por ${METODO_TXT[r.metodo] || r.metodo} no round ${r.round}.`
    : r.metodo === "EMPATE" ? `A luta terminou empatada${r.placar ? `, ${r.placar.a} a ${r.placar.b}` : ""}.` : "A luta foi anulada por ausência dos dois.";
  partes.push(r.metodo === "DEC" && r.placar ? `${fim.slice(0, -1)}, ${Math.max(r.placar.a, r.placar.b)} a ${Math.min(r.placar.a, r.placar.b)}.` : fim);
  return partes.join(" ").replace(/[—–]/g, ",").slice(0, 900);
}
async function narracaoIA(vista) {
  if (!process.env.OPENROUTER_API_KEY || process.env.JXJ_NARRACAO_IA === "false") return null;
  const n = { a: vista.nomes.a.nome, b: vista.nomes.b.nome };
  const fatos = vista.trocas.map((t) => `R${t.round}T${t.troca}: ${t.eventos.join(" ")}`).join("\n").slice(0, 2500);
  const r = vista.resultado;
  const fim = r.vencedor ? `${n[r.vencedor]} venceu por ${METODO_TXT[r.metodo]} no round ${r.round}` : METODO_TXT[r.metodo];
  const corpo = {
    model: process.env.QWEN_MODEL || "qwen/qwen3.7-flash", temperature: 0.7, max_tokens: 260,
    messages: [
      { role: "system", content: `Você narra o resumo de uma luta de MMA de um jogo, em português brasileiro, em 3 a 5 frases curtas.
Use SÓ os fatos da lista, na ordem em que aconteceram. Não invente golpe, posição, número, fala, torcida, juiz, lesão ou emoção.
Só existem duas pessoas: ${n.a} e ${n.b}. Não cite mais ninguém.
Sem travessão, sem frase de efeito, sem pergunta, sem exclamação. Termine com o resultado exatamente como foi.
Responda só com o texto, sem aspas.` },
      { role: "user", content: `Fatos:\n${fatos}\nResultado: ${fim}.` },
    ],
  };
  try {
    const ctrl = new AbortController(), tm = setTimeout(() => ctrl.abort(), 9000);
    const rr = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", signal: ctrl.signal,
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    clearTimeout(tm);
    if (!rr.ok) return null;
    const j = await rr.json();
    let t = String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "").trim();
    t = t.replace(/^["“]|["”]$/g, "").replace(/[—–]/g, ",").replace(/\s+/g, " ");
    if (t.length < 40 || t.length > 900) return null;
    if (MOTOR.golpesForaDosFatos(t, fatos).length) return null;   // golpe com nome só se está nos fatos
    if (/[!?]/.test(t)) return null;
    if (r.vencedor && !t.includes(n[r.vencedor])) return null;
    /* nome próprio que não é dos dois lutadores = invenção */
    const permitidos = new Set([...n.a.split(/\s+/), ...n.b.split(/\s+/), "Round", "O", "A", "Os", "As", "No", "Na", "Depois", "Com", "Em", "Logo", "Então", "Mesmo", "Ele", "Ela", "Ao", "Pelo", "Pela", "Já", "Sem", "Mas", "E", "Quando", "Nos", "Nas", "Do", "Da", "Primeiro", "Segundo", "Terceiro"]);
    const nomesProprios = (t.match(/(?<![.!?]\s)(?<!^)\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+/g) || []).filter((w) => !permitidos.has(w));
    if (nomesProprios.length) return null;
    return t;
  } catch {
    return null;
  }
}

/* ---------- definições pra tela ---------- */
function definicoes(ativo) {
  return {
    ativo,
    versaoBalanceamento: ARV.VERSAO_BALANCEAMENTO,
    estilos: Object.fromEntries(Object.entries(ARV.ESTILOS).map(([id, e]) => [id, { nome: e.nome, resumo: e.resumo, base: e.base, mec: e.mec || {}, ramos: e.ramos }])),
    categorias: Object.fromEntries(Object.entries(ARV.CATEGORIAS).map(([id, c]) => [id, { nome: c.nome, ajuste: c.ajuste }])),
    categoriasLancamento: ARV.CATEGORIAS_LANCAMENTO,
    atributos: ARV.NOME_ATRIBUTO,
    ramos: Object.fromEntries(Object.entries(ARV.RAMOS).map(([id, r]) => [id, { estilo: r.estilo, nome: r.nome,
      nos: r.nos.map((no, i) => ({ id: no.id, nome: no.nome, desc: no.desc, tier: i + 1, efeitos: no.efeitos })) }])),
    mecanicas: Object.fromEntries(Object.entries(ARV.MECANICAS).map(([k, m]) => [k, { desc: m.desc, teto: m.teto }])),
    arvore: { nivelMaxNo: ARV.NIVEL_MAX_NO, pontosPorRamoMax: ARV.PONTOS_POR_RAMO_MAX, pedidoPorTier: ARV.PEDIDO_POR_TIER,
      custoProprio: ARV.CUSTO_PROPRIO, custoHibrido: ARV.CUSTO_HIBRIDO, tiersHibridos: ARV.TIERS_HIBRIDOS, tetoBonus: ARV.TETO_BONUS, atributoMax: ARV.ATRIBUTO_MAX },
    acoes: { rotulos: MOTOR.ROTULOS, descricoes: MOTOR.DESCRICOES, custo: MOTOR.CUSTO, familias: MOTOR.FAMILIA_NOME, ciclo: MOTOR.CICLO,
      variantes: Object.fromEntries(Object.entries(MOTOR.VARIANTE_POR_ID).map(([id, v]) => [id, { rotulo: v.rotulo, desc: v.desc, papel: v.papel, familia: v.familia }])) },
    formato: MOTOR.FORMATO,
    regras: { nivelMax: REG.NIVEL_MAX, slotsFree: REG.SLOTS_FREE, slotsPro: REG.SLOTS_PRO, trocaPrincipalHoras: REG.TROCA_PRINCIPAL_HORAS,
      custoRespec: REG.CUSTO_RESPEC, tetoFichasDia: REG.TETO_FICHAS_DIA, parRating24h: REG.PAR_RATING_24H, ausencia: REG.REGRA_AUSENCIA,
      temporadaDias: REG.TEMPORADA_DIAS, torneioVagas: REG.TORNEIO_VAGAS, torneioJanelaH: REG.TORNEIO_JANELA_H, torneioLutasMin: REG.TORNEIO_LUTAS_MIN,
      lutasPraClassificar: RAT.LUTAS_PRA_CLASSIFICAR, reset: RAT.RESET, fichasTorneio: REG.FICHAS_TORNEIO, xpTorneio: REG.XP_TORNEIO },
    xpPorNivel: Array.from({ length: REG.NIVEL_MAX }, (_, i) => REG.xpProximo(i + 1)),
    molduras: REG.MOLDURAS,
    conquistas: REG.CONQUISTAS,
  };
}

/* ---------- ações ---------- */
async function executar(acao, c, uid) {
  switch (acao) {
    /* públicas */
    case "ranking": {
      const cat = c.categoria == null || c.categoria === "" ? null : String(c.categoria);
      if (cat && !Object.hasOwn(ARV.CATEGORIAS, cat)) throw new ErroJxJ("categoria inválida");
      const busca = String(c.busca || "").trim().slice(0, 30).replace(/[%_\\]/g, "");
      const pagina = Math.max(0, Math.min(200, Math.floor(Number(c.pagina) || 0)));
      return rpc("jxj_ranking", { categoria_: cat, busca, pagina, uid });
    }
    case "perfil": {
      const lid = idDe(c.lutadorId, "lutador");
      const p = await rpc("jxj_perfil", { lid });
      if (!p) throw new ErroJxJ("lutador não encontrado", 404);
      const historico = await rpc("jxj_historico", { lid, pagina: 0 });
      let direto = null;
      if (c.contraId && ID.test(String(c.contraId))) direto = await rpc("jxj_confronto_direto", { x: lid, y: Number(c.contraId) });
      return { perfil: p, historico, direto };
    }
    case "historico": return rpc("jxj_historico", { lid: idDe(c.lutadorId, "lutador"), pagina: Math.max(0, Math.floor(Number(c.pagina) || 0)) });
    case "hall": return rpc("jxj_hall", {});
    case "temporada": return rpc("jxj_temporada_info", { uid });
    case "torneios": {
      const cat = c.categoria ? String(c.categoria) : null;
      if (cat && !Object.hasOwn(ARV.CATEGORIAS, cat)) throw new ErroJxJ("categoria inválida");
      return rpc("jxj_torneios", { categoria_: cat, uid });
    }
    case "torneio": return rpc("jxj_torneio", { tid: idDe(c.torneioId, "torneio"), uid });
    case "replay": {
      const d = await rpc("jxj_luta", { lid: idDe(c.lutaId, "luta") });
      if (!d || !d.luta || d.luta.status !== "encerrada") throw new ErroJxJ("luta não encontrada", 404);
      return vistaDaLuta(d, uid);
    }

    /* conta */
    case "estado": {
      const est = await rpc("jxj_estado", { uid });
      if (est.luta && est.luta.id) {
        const d = await processarLuta(est.luta.id, uid);
        est.luta = { id: d.luta.id, status: d.luta.status, tipo: d.luta.tipo };
      }
      for (const l of est.lutadores || []) {
        l.perfil = perfilDoLutador(l);
        l.nivelInfo = REG.nivelDoXp(l.xp);
        l.pontos = ARV.pontosDoNivel(l.nivel);
        const v = ARV.validarBuild(l.estilo, l.build || {}, l.nivel);
        l.pontosLivres = v.ok ? v.sobra : 0;
        l.respecGratis = l.buildVersao < ARV.VERSAO_BALANCEAMENTO;
      }
      return est;
    }
    case "criar": {
      const v = REG.nomeLutadorValido(c.nome);
      if (!v.ok) throw new ErroJxJ(v.erro);
      if (typeof c.estilo !== "string" || !Object.hasOwn(ARV.ESTILOS, c.estilo)) throw new ErroJxJ("estilo inválido");
      if (typeof c.categoria !== "string" || !Object.hasOwn(ARV.CATEGORIAS, c.categoria)) throw new ErroJxJ("categoria inválida");
      return rpc("jxj_criar_lutador", { uid, nome_: v.nome, chave_: chaveNome(v.nome), rosto_: rostoValido(c.rosto), categoria_: c.categoria, estilo_: c.estilo });
    }
    case "build": {
      const lid = idDe(c.lutadorId, "lutador");
      const est = await rpc("jxj_estado", { uid });
      const l = (est.lutadores || []).find((x) => x.id === lid);
      if (!l) throw new ErroJxJ("lutador não encontrado", 404);
      const nova = c.build && typeof c.build === "object" && !Array.isArray(c.build) ? c.build : null;
      if (!nova) throw new ErroJxJ("árvore inválida");
      /* sem protótipo: "__proto__" vira chave comum e cai na validação (num {} ele sumia em silêncio) */
      const limpa = Object.create(null);
      for (const [k, v] of Object.entries(nova)) if (v) limpa[k] = v;
      const val = ARV.validarBuild(l.estilo, limpa, l.nivel);
      if (!val.ok) throw new ErroJxJ(val.erro);
      /* sem respec, ponto gasto não volta: cada nó fica igual ou maior */
      for (const [k, v] of Object.entries(l.build || {})) if ((limpa[k] || 0) < v) throw new ErroJxJ("pra tirar ponto de uma habilidade, use a reconfiguração");
      return rpc("jxj_salvar_build", { uid, lid, rev: Math.floor(Number(c.rev)), build_: limpa });
    }
    case "respec": return rpc("jxj_respec", { uid, lid: idDe(c.lutadorId, "lutador"), rev: Math.floor(Number(c.rev)), custo: REG.CUSTO_RESPEC });
    case "principal": return rpc("jxj_trocar_principal", { uid, lid: idDe(c.lutadorId, "lutador") });
    case "aposentar": {
      const lid = idDe(c.lutadorId, "lutador");
      const est = await rpc("jxj_estado", { uid });
      const l = (est.lutadores || []).find((x) => x.id === lid);
      if (!l) throw new ErroJxJ("lutador não encontrado", 404);
      if (String(c.confirmacao || "").trim() !== l.nome) throw new ErroJxJ("digite o nome do lutador pra confirmar");
      return rpc("jxj_aposentar", { uid, lid });
    }
    case "moldura": {
      /* nome tem que ser chave própria da tabela (constructor, toString,
         __proto__... não são molduras); o preço sai só da tabela do servidor */
      const nome = typeof c.moldura === "string" ? c.moldura : "";
      if (!Object.hasOwn(REG.MOLDURAS, nome)) throw new ErroJxJ("moldura inválida");
      const m = REG.MOLDURAS[nome];
      const lid = idDe(c.lutadorId, "lutador");
      if (m.req === "titulo") {
        const p = await rpc("jxj_perfil", { lid });
        if (!p || !(p.titulos || []).length) throw new ErroJxJ("essa moldura é de quem tem título");
        return rpc("jxj_moldura", { uid, lid, moldura_: nome, preco: 0, comprar: false }).catch(async (e) => {
          if (/compre/.test(e.message)) return rpc("jxj_moldura", { uid, lid, moldura_: nome, preco: 0, comprar: true });
          throw e;
        });
      }
      return rpc("jxj_moldura", { uid, lid, moldura_: nome, preco: m.preco || 0, comprar: !!c.comprar });
    }
    case "buildPublica": return rpc("jxj_build_publica", { uid, lid: idDe(c.lutadorId, "lutador"), publica: !!c.publica });
    case "filaEntrar": return rpc("jxj_fila_entrar", { uid, lid: idDe(c.lutadorId, "lutador") });
    case "filaSair": return rpc("jxj_fila_sair", { uid });
    case "fila": {
      const r = await rpc("jxj_fila_parear", { uid, semente_: novaSemente(), tol_base: REG.TOLERANCIA.base, tol_seg: REG.TOLERANCIA.porDezSeg, tol_max: REG.TOLERANCIA.max });
      if (r && r.luta) { const d = await processarLuta(r.luta, uid); return { luta: vistaDaLuta(d, uid) }; }
      return r;
    }
    case "luta": {
      const d = await processarLuta(idDe(c.lutaId, "luta"), uid);
      return vistaDaLuta(d, uid);
    }
    case "confirmar": {
      const lid = idDe(c.lutaId, "luta");
      await processarLuta(lid, uid);
      await rpc("jxj_luta_confirmar", { uid, lid, prazo_ms: MOTOR.FORMATO.prazoMs });
      return vistaDaLuta(await processarLuta(lid, uid), uid);
    }
    case "recusar": {
      const lid = idDe(c.lutaId, "luta");
      const d = await rpc("jxj_luta", { lid });
      if (!d || !d.luta || (d.luta.a_user !== uid && d.luta.b_user !== uid)) throw new ErroJxJ("luta não encontrada", 404);
      return rpc("jxj_luta_cancelar_confirmacao", { lid, quem: uid });
    }
    case "acao": {
      const lid = idDe(c.lutaId, "luta");
      if (!MOTOR.FAMILIAS.includes(c.familia)) throw new ErroJxJ("ação inválida");
      const round = Math.floor(Number(c.round)), troca = Math.floor(Number(c.troca));
      if (!(round >= 1 && round <= 9 && troca >= 1 && troca <= 9)) throw new ErroJxJ("troca inválida");
      await processarLuta(lid, uid);
      await rpc("jxj_enviar_acao", { uid, lid, round_: round, troca_: troca, familia_: c.familia });
      return vistaDaLuta(await processarLuta(lid, uid), uid);
    }
    case "revanche": {
      const lid = idDe(c.lutaId, "luta");
      const r = await rpc("jxj_revanche_pedir", { uid, lid });
      if (r.luta) return { luta: r.luta };
      if (!r.pronta) return { esperando: true };
      const d = await rpc("jxj_luta", { lid });
      /* na revanche os lados trocam: quem era B vira A */
      const perfis = { a: perfilDoLutador(d.lutadorB), b: perfilDoLutador(d.lutadorA) };
      return rpc("jxj_revanche_criar", { lid, semente_: novaSemente(), perfis_: perfis, estado_: MOTOR.novaLuta(perfis.a, perfis.b), prazo_ms: MOTOR.FORMATO.prazoMs });
    }
    case "narracao": {
      /* Só quem lutou (o banco confere o uid antes de devolver ou gerar).
         Uma geração por vez: a reserva é atômica no banco e vence em 30 s;
         quem chega com outra em curso recebe "gerando" e tenta de novo.
         A IA só é chamada se o teto do dia contou esta chamada
         (supabase_jxj_narracao.sql); senão, ou se ela falhar, vale o molde
         local. Assim nada trava a narração pra sempre. */
      const lid = idDe(c.lutaId, "luta");
      const iaLigada = !!process.env.OPENROUTER_API_KEY && process.env.JXJ_NARRACAO_IA !== "false";
      const r = await rpc("jxj_narracao_reservar", { uid, lid, quer_ia: iaLigada });
      if (r.narracao) return { narracao: r.narracao };
      if (r.gerando || !r.reserva) return { gerando: true };
      const vista = vistaDaLuta(await rpc("jxj_luta", { lid }), uid);
      const texto = (r.ia ? await narracaoIA(vista) : null) || narracaoLocal(vista);
      const g = await rpc("jxj_narracao_concluir", { lid, reserva_: r.reserva, texto });
      return g && g.narracao ? { narracao: g.narracao } : { gerando: true };
    }
    case "torneioInscrever": return rpc("jxj_torneio_inscrever", { uid, lid: idDe(c.lutadorId, "lutador") });
    case "torneioSair": return rpc("jxj_torneio_sair", { uid });
    case "torneioSala": {
      const cid = idDe(c.confrontoId, "confronto");
      const r = await rpc("jxj_torneio_sala", { uid, cid });
      if (!r.pronto) return r;
      const t = await rpc("jxj_torneio_lutadores", { cid });
      const perfis = { a: perfilDoLutador(t.a), b: perfilDoLutador(t.b) };
      return rpc("jxj_torneio_criar_luta", { cid, semente_: novaSemente(), perfis_: perfis, estado_: MOTOR.novaLuta(perfis.a, perfis.b), prazo_ms: MOTOR.FORMATO.prazoMs });
    }
    default: throw new ErroJxJ("ação desconhecida");
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ erro: "só POST" });
  let c = req.body;
  if (typeof c === "string") { try { c = JSON.parse(c); } catch { c = null; } }
  if (!c || typeof c !== "object" || Array.isArray(c)) return res.status(400).json({ erro: "corpo inválido" });
  if (JSON.stringify(c).length > 20000) return res.status(413).json({ erro: "corpo grande demais" });
  const acao = String(c.acao || "");
  const ativo = process.env.JXJ_ATIVO === "true";
  if (acao === "definicoes") return res.status(200).json(definicoes(ativo));
  if (!ACOES_PUBLICAS.has(acao) && !ACOES_CONTA.has(acao)) return res.status(400).json({ erro: "ação desconhecida" });
  if (!ativo) return res.status(503).json({ erro: "o JxJ ainda não foi liberado", desligado: true });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ erro: "servidor sem configuração" });
  try {
    const uid = c.token ? await usuarioDoToken(c.token) : null;
    if (ACOES_CONTA.has(acao)) {
      if (!uid) return res.status(401).json({ erro: "entre na sua conta pra jogar o JxJ" });
      const lim = LIMITES[acao];
      if (lim && !(await rpc("jxj_limite", { uid, acao_: acao, maximo: lim[0], segundos: lim[1] })))
        return res.status(429).json({ erro: "muitas tentativas seguidas; espere um pouco" });
    }
    const r = await executar(acao, c, uid);
    return res.status(200).json(r ?? {});
  } catch (e) {
    if (e instanceof ErroJxJ) return res.status(e.status).json({ erro: e.message });
    console.error("jxj", acao, e && e.message);
    return res.status(500).json({ erro: "falha no servidor do JxJ" });
  }
}
