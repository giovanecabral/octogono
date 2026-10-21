/* Online: narração ao vivo das trocas importantes (2026-10-21, fase 4 do
   plano do Online). Quem chama é api/jxj.js, na hora em que a troca é
   resolvida; a linha fica gravada nos eventos da troca (evento "narracao"),
   então os dois lutadores veem a mesma, e a luta refeita pela semente não
   muda (o motor não lê este evento).

   - destaqueDaTroca: a troca resolvida é um destaque? (nocaute,
     finalização, knockdown, finalização apertando, grogue, virada, fim de
     round). Troca comum não ganha linha: o lance já mostra os fatos.
   - moldeDoDestaque: a frase local de cada destaque (custo zero).
   - narracaoDaTroca: no destaque, tenta a IA com prazo curto e cai no molde
     se ela demorar, falhar ou inventar. A luta nunca espera mais que o prazo.
   - validarNarracaoTroca: o filtro contra invenção (golpe com nome,
     número e palavra de resultado só se estão nos fatos; round por extenso
     só o certo; só os dois nomes, inclusive no começo da frase; sem
     pergunta, exclamação ou HTML). No fim de round a IA narra só o lance:
     quem levou e o placar vêm do molde, colado depois.

   A IA só narra o que o motor já resolveu: nunca decide resultado, dano ou
   regra. Não lê nada da carreira. */
import * as MOTOR from "./_jxj-motor.js";

/* prazo da IA por destaque (a luta espera no máximo isto, uma vez por
   resolução); modelo barato e rápido, o mesmo da narração do fim */
export const PRAZO_IA_TROCA_MS = 1500;
export const MODELO_TROCA = () => process.env.JXJ_NARRACAO_TROCA_MODELO || process.env.QWEN_MODEL || "qwen/qwen3.7-flash";
/* em ordem de prioridade: uma linha por troca, a do destaque mais forte */
export const DESTAQUES = ["nocaute", "finalizacao", "knockdown", "encaixe", "grogue", "virada", "fimRound"];

const outro = (l) => (l === "a" ? "b" : "a");
const somaCartoes = (cartoes) => (cartoes || []).reduce((s, c) => ({ a: s.a + c.a, b: s.b + c.b }), { a: 0, b: 0 });

/* {tipo, quem, round} ou null. antes/depois = estado do motor antes e
   depois da troca; eventos = os da troca (resolverTroca). */
export function destaqueDaTroca(antes, depois, eventos) {
  const evs = eventos || [], tem = (t) => evs.find((ev) => ev && ev.tipo === t);
  const r = antes.round, fim = depois.fim;
  if (fim && (fim.metodo === "KO" || fim.metodo === "TKO")) return { tipo: "nocaute", quem: fim.vencedor, round: r };
  if (fim && fim.metodo === "FIN") return { tipo: "finalizacao", quem: fim.vencedor, round: r };
  if (fim && (fim.metodo === "WO" || fim.metodo === "ANULADA")) return null;
  /* luta que acabou nos pontos: o destaque é o fim do último round (com o
     resultado), mesmo que a troca tenha knockdown ou encaixe */
  if (!fim) {
    const kd = tem("knockdown");
    if (kd) return { tipo: "knockdown", quem: kd.quem, round: r };
    const enc = tem("encaixou") || tem("emendou");
    if (enc) return { tipo: "encaixe", quem: enc.quem, round: r, evento: enc.tipo };
    const gr = tem("grogue");
    if (gr) return { tipo: "grogue", quem: outro(gr.quem), round: r };
  }
  /* round fechou (ou a luta acabou nos cartões): quem levou e se virou */
  const fechou = depois.cartoes.length > antes.cartoes.length;
  if (fechou) {
    const c = depois.cartoes[depois.cartoes.length - 1];
    const quem = c.a > c.b ? "a" : c.b > c.a ? "b" : null;
    const antesT = somaCartoes(antes.cartoes), total = somaCartoes(depois.cartoes);
    /* virada = quem levou o round estava atrás e agora passou ou empatou
       (levar o round e continuar atrás é fim de round comum; achado na
       medição com a IA real, 2026-10-21: o molde dizia "virou, 18 a 19") */
    const estavaAtras = quem && antes.cartoes.length > 0 && antesT[quem] < antesT[outro(quem)];
    const virou = estavaAtras && total[quem] >= total[outro(quem)];
    return { tipo: virou ? "virada" : "fimRound", quem, round: r, cartao: c, total, acabou: !!fim };
  }
  return null;
}

/* A frase local do destaque, só com os fatos (os textos dos eventos). */
export function moldeDoDestaque(d, eventos, nomes) {
  const txt = (tipo) => { const ev = (eventos || []).find((e) => e && e.tipo === tipo); return ev ? MOTOR.textoEvento(ev, nomes) : ""; };
  const q = d.quem ? nomes[d.quem] : "", o = d.quem ? nomes[outro(d.quem)] : "";
  switch (d.tipo) {
    case "nocaute": case "finalizacao": return txt("fim");
    case "knockdown": return `${txt("knockdown")} ${o} levantou grogue.`.trim();
    case "encaixe": return d.evento === "emendou" ? `${txt("emendou")} ${txt("fim") || txt("subFalhou") || txt("encaixou")}`.trim() : txt("encaixou");
    case "grogue": return `${q} acertou ${o}, e ${o} ficou grogue.`;
    case "virada": {
      const t = d.total, empatou = t.a === t.b;
      return `${q} levou o round ${d.round}, ${d.cartao[d.quem]} a ${d.cartao[outro(d.quem)]}, e ${empatou ? "empatou a luta" : "virou a luta"} nos cartões: ${t[d.quem]} a ${t[outro(d.quem)]} no total.${d.acabou ? " " + txt("fim") : ""}`.trim();
    }
    case "fimRound": {
      const linha = !d.quem ? `O round ${d.round} terminou empatado nos pontos dos juízes.` : `${q} levou o round ${d.round}, ${d.cartao[d.quem]} a ${d.cartao[outro(d.quem)]}.`;
      return `${linha}${d.acabou ? " " + txt("fim") : ""}`.trim();
    }
    default: return "";
  }
}

/* nome próprio que não é dos dois lutadores = invenção. Vale pra toda
   palavra com maiúscula, inclusive a do começo da frase ("Carla acertou
   Bia" passava, porque a primeira palavra da frase era pulada; achado na
   fase 4). As palavras livres são as que começam frase em português. A
   narração do fim (api/jxj.js) usa a mesma conta. */
const PALAVRAS_LIVRES = new Set(["Round", "O", "A", "Os", "As", "No", "Na", "Nos", "Nas", "Do", "Da", "Dos", "Das", "Ao", "Aos", "À", "Às",
  "Um", "Uma", "Depois", "Antes", "Após", "Durante", "Enquanto", "Com", "Sem", "Em", "Num", "Numa", "Nesse", "Nessa", "Neste", "Nesta",
  "Logo", "Então", "Assim", "Mesmo", "Ainda", "Também", "Só", "Já", "Mas", "E", "Quando", "Que", "Agora", "Até", "Por", "Pelo",
  "Pela", "Para", "Pra", "Entre", "Contra", "Sobre", "Ele", "Ela", "Ambos", "Cada", "Outra", "Outro", "Mais", "Nenhum", "Nenhuma",
  "Primeiro", "Segundo", "Terceiro", "Quarto", "Quinto", "Foi", "Tudo", "Isso", "Este", "Esta", "Esse", "Essa", "Seu", "Sua", "Dois"]);
export function nomesInventados(texto, nomes) {
  const permitidos = new Set([...String(nomes.a).split(/\s+/), ...String(nomes.b).split(/\s+/)]);
  return (String(texto).match(/[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+/g) || []).filter((w) => !permitidos.has(w) && !PALAVRAS_LIVRES.has(w));
}
/* palavra de resultado só passa se o mesmo radical está nos fatos: a IA
   escreveu "encaixou o triângulo, vencendo por decisão" numa luta que
   continuava (medição real, 2026-10-21) */
const RESULTADO = ["venc", "vitóri", "derrot", "perdeu", "nocaut", "finaliz", "decis", "desist", "empat", "cartão", "cartões", "juiz", "juíz", "placar"];
/* no fim de round a IA narra só o lance; quem levou e o placar vêm do molde */
const QUEM_LEVOU = /\b(lev(ou|a|aram)|ganh(ou|a|aram)|dominou|domina)\b/i;
const ORDINAIS = ["primeiro", "segundo", "terceiro", "quarto", "quinto"], EXTENSO = ["um", "dois", "três", "quatro", "cinco"];
function roundPorExtensoErrado(t, round) {
  const a = /\b(primeiro|segundo|terceiro|quarto|quinto)\s+round\b/i.exec(t), b = /\bround\s+(um|dois|três|tres|quatro|cinco)\b/i.exec(t);
  if (a && ORDINAIS.indexOf(a[1].toLowerCase()) + 1 !== round) return true;
  if (b && EXTENSO.indexOf(b[1].toLowerCase().replace("tres", "três")) + 1 !== round) return true;
  return false;
}
export function validarNarracaoTroca(texto, fatos, nomes, d = null) {
  let t = String(texto || "").trim().replace(/^["“'«]+|["”'»]+$/g, "").replace(/[—–]/g, ",").replace(/\s+/g, " ");
  if (t.length < 15 || t.length > 220) return null;
  if (/[!?<>]/.test(t)) return null;
  if (MOTOR.golpesForaDosFatos(t, fatos).length) return null;
  /* o nome de um lutador não conta como número nem como palavra de resultado */
  const semNomes = t.split(nomes.a).join(" ").split(nomes.b).join(" ");
  const tl = semNomes.toLowerCase(), fl = String(fatos).toLowerCase();
  if (RESULTADO.some((r) => tl.includes(r) && !fl.includes(r))) return null;
  if (d && roundPorExtensoErrado(semNomes, d.round)) return null;
  if (d && (d.tipo === "fimRound" || d.tipo === "virada") && (/\d/.test(semNomes) || QUEM_LEVOU.test(semNomes))) return null;
  /* número que não está nos fatos é invenção (dano, round, placar) */
  const numeros = semNomes.match(/\d+(?:[.,]\d+)?/g) || [];
  if (numeros.some((n) => !fatos.includes(n))) return null;
  if (nomesInventados(t, nomes).length) return null;
  if (!t.includes(nomes.a) && !t.includes(nomes.b)) return null;
  return t;
}

const DESTAQUE_TXT = { nocaute: "nocaute", finalizacao: "finalização", knockdown: "knockdown", encaixe: "finalização apertando",
  grogue: "um lutador ficou grogue", virada: "virada nos cartões", fimRound: "fim de round" };
/* Pedido pra IA: os fatos do lance, uma frase só. */
const doRound = (d) => d.tipo === "fimRound" || d.tipo === "virada";
export function pedidoDaIA(d, eventos, nomes) {
  /* no fim de round o resultado da luta (se acabou) vem no molde, não da IA */
  const fatos = (eventos || []).filter((ev) => !(doRound(d) && ev && ev.tipo === "fim"))
    .map((ev) => MOTOR.textoEvento(ev, nomes)).filter(Boolean).join(" ");
  /* no fim de round a IA narra só o último lance; o molde (quem levou e o
     placar, exatos) vem depois, em narracaoDaTroca */
  const pedido = doRound(d) ? `Último lance do round ${d.round}: ${fatos} Narre só este lance, sem número, sem placar e sem dizer quem levou o round.`
    : `Lance (round ${d.round}, ${DESTAQUE_TXT[d.tipo]}): ${fatos}`;
  return {
    /* round ${d.round} entra nos fatos: "no round 2" é fato, "no round 3" não */
    fatos: `${fatos} round ${d.round}`,
    corpo: {
      model: MODELO_TROCA(), temperature: 0.7, max_tokens: 80, usage: { include: true },
      /* os Flash da Qwen raciocinam por padrão: com raciocínio, os 80 tokens
         acabavam antes da frase (medido em 2026-10-21: 40 de 40 chamadas
         voltaram sem texto, 1,5 s de mediana). Igual ao api/ai.js. */
      reasoning: { enabled: false },
      messages: [
        { role: "system", content: `Você narra um lance de uma luta de MMA de um jogo, em português brasileiro, numa frase só, de até 25 palavras.
Use SÓ os fatos. Não invente golpe, posição, número, fala, torcida, juiz, lesão ou emoção.
Só existem duas pessoas: ${nomes.a} e ${nomes.b}. Não cite mais ninguém.
Sem travessão, sem frase de efeito, sem pergunta, sem exclamação. Responda só com a frase, sem aspas.` },
        { role: "user", content: pedido },
      ],
    },
  };
}

/* O evento de narração da troca, ou null (troca comum). cotaIA() consome 1
   do teto diário da IA (jxj_narracao_cota_ia) e diz se pode chamar;
   comIA = esta resolução ainda pode chamar a IA (uma vez por resolução, pra
   uma resolução com várias trocas vencidas não somar prazos). */
export async function narracaoDaTroca({ antes, depois, eventos, nomes, cotaIA, comIA = true }) {
  const d = destaqueDaTroca(antes, depois, eventos);
  if (!d) return null;
  const molde = moldeDoDestaque(d, eventos, nomes);
  const ev = { tipo: "narracao", destaque: d.tipo, texto: molde, fonte: "molde" };
  if (!comIA || !process.env.OPENROUTER_API_KEY || process.env.JXJ_NARRACAO_TROCA === "false") return ev;
  let pode = false;
  try { pode = !!(await cotaIA()); } catch { pode = false; }
  if (!pode) return ev;
  const { fatos, corpo } = pedidoDaIA(d, eventos, nomes);
  const t0 = Date.now(), ctrl = new AbortController(), tm = setTimeout(() => ctrl.abort(), PRAZO_IA_TROCA_MS);
  try {
    const rr = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", signal: ctrl.signal,
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const j = rr.ok ? await rr.json() : null;
    ev.ms = Date.now() - t0;
    const u = j && j.usage ? j.usage : null;
    if (u) { ev.tokens = Number(u.total_tokens) || null; if (typeof u.cost === "number") ev.custo = u.cost; }
    const c0 = j && j.choices && j.choices[0];
    const texto = c0 && c0.message ? c0.message.content : "";
    /* frase cortada pelo limite de tokens não vale, mesmo passando no filtro */
    const ok = c0 && c0.finish_reason !== "length" ? validarNarracaoTroca(texto, fatos, nomes, d) : null;
    if (ok) { ev.texto = doRound(d) ? `${/[.]$/.test(ok) ? ok : ok + "."} ${molde}` : ok; ev.fonte = "ia"; }
  } catch {
    ev.ms = Date.now() - t0;
  } finally {
    clearTimeout(tm);
  }
  /* custo e latência no log da Vercel (sem nome nem texto) */
  console.log(JSON.stringify({ jxj: "narracao-troca", destaque: d.tipo, fonte: ev.fonte, ms: ev.ms, tokens: ev.tokens || null, custo: ev.custo ?? null }));
  return ev;
}
