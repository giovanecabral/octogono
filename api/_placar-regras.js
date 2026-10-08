/* Regras do placar (revamp fase 3, 2026-09-27). Função pura: o servidor
   (api/placar.js) e o testar.js (suíte placar) usam a mesma. O `_` no
   nome faz a Vercel NÃO expor este arquivo como rota.

   O motor roda no navegador, então isto NÃO prova que a carreira
   aconteceu: só recusa o que é impossível pelas próprias regras do jogo
   (cartel com mais de 22 lutas, pontuação acima do que o cartel permite,
   nota que não bate com a pontuação...). Carreira forjada e plausível
   passa; barrar de vez exigiria rerodar a carreira no servidor. Limite
   registrado em PENDENCIAS.md item 37. */
export const DIVISOES_OK = ["flyweight", "bantamweight", "featherweight", "lightweight", "welterweight",
  "middleweight", "light_heavyweight", "heavyweight", "w_strawweight", "w_flyweight", "w_bantamweight", "w_featherweight"];
/* mesmas faixas de grade() no index.html, em pontos (nota bruta × 100,
   arredondada pra BAIXO: 89,996 é A, não S) — a suíte placar confere */
const FAIXAS = [[9000, "S"], [7800, "A"], [6400, "B"], [4800, "C"], [3200, "D"], [0, "F"]];
/* nome do lutador aparece pra todo mundo: lista curta de ofensa comum
   em PT-BR, comparada por palavra inteira, sem acento e sem maiúscula */
const PROIBIDAS = ["porra", "caralho", "buceta", "viado", "puta", "merda", "cu", "foda", "fdp", "vsf", "pqp",
  "arrombado", "nazista", "hitler", "macaco", "estupro", "estuprador", "crioulo", "retardado"];
const semAcento = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function nomeAceito(nome) {
  const n = String(nome || "").trim();
  if (!n || n.length > 28) return false;
  /* nada de HTML nem caractere de controle (auditoria de 2026-10-08: um
     nome como <svg onload=...> no top 3 rodava código na página inicial) */
  if (/[<>"&`\\]/.test(n) || /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/.test(n)) return false;
  if (/https?:|www\.|\.com|\.br\b|@/i.test(n)) return false;
  const palavras = semAcento(n).split(/[^a-z0-9]+/).filter(Boolean);
  return !palavras.some((p) => PROIBIDAS.includes(p));
}

export function validarEnvio(c) {
  const inteiro = (v) => Number.isInteger(v) && v >= 0;
  if (!c || typeof c !== "object") return { ok: false, erro: "corpo inválido" };
  const { seed, nome, divisao, modo, wins, losses, finishes, cinturoes, title, pontuacao, nota, rosto } = c;
  if (!Number.isFinite(seed) || seed <= 0) return { ok: false, erro: "semente inválida" };
  if (!nomeAceito(nome)) return { ok: false, erro: "nome não aceito no ranking" };
  if (!DIVISOES_OK.includes(divisao)) return { ok: false, erro: "divisão inválida" };
  if (modo !== "normal" && modo !== "lenda") return { ok: false, erro: "modo inválido" };
  if (![wins, losses, finishes, cinturoes, pontuacao].every(inteiro)) return { ok: false, erro: "número inválido" };
  if (wins + losses > 22 || wins + losses < 1) return { ok: false, erro: "cartel impossível" };
  if (finishes > wins || cinturoes > wins) return { ok: false, erro: "cartel impossível" };
  const pctV = wins / (wins + losses), pctF = wins ? finishes / wins : 0;
  const teto = Math.floor((40 + 30 + pctV * 12 + pctF * 8 + (title ? 10 : 0)) * 100);
  if (pontuacao > Math.min(10000, teto)) return { ok: false, erro: "pontuação impossível pro cartel" };
  const faixa = FAIXAS.find((f) => pontuacao >= f[0])[1];
  if (nota !== faixa) return { ok: false, erro: "nota não bate com a pontuação" };
  if (rosto != null && (typeof rosto !== "object" || JSON.stringify(rosto).length > 2000)) return { ok: false, erro: "rosto inválido" };
  return { ok: true, linha: { seed: Math.round(seed), nome_lutador: String(nome).trim(), divisao, modo, pontuacao,
    cartel: `${wins}-${losses}`, nota, cinturoes, rosto: rosto || null } };
}
