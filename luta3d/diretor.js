// Luta em 3D da carreira: o motor do jogo decide a luta (o log com os eventos)
// e este diretor mostra cada linha com os dois lutadores. Nada daqui volta pro
// jogo: não lê nem gasta nenhum dos geradores da carreira (só Math.random, pra
// variar golpe e câmera), então a luta é a mesma com ou sem o 3D.
// Corpo e cabelos: Quaternius (CC0). Animações: Mixamo (Adobe), convertidas pro
// esqueleto do corpo; o arquivo delas (mx_lutas.glb) não vai pro GitHub.
import * as THREE from "./vendor/three.module.js";
import { Palco } from "./palco.js";
import { carregarBase, Lutador } from "./lutador.js";
import { modeloCinturao } from "./aparencia.js";

/* raiz: elemento onde o palco nasce. op: { eu, ele (cores e cabelo), nomes {a, b} (telões), som(tipo, volume) }.
   Devolve { lance(linha), velocidade(v), destruir() }. */
export async function criarLuta3d(raiz, op = {}) {
const dir = new URL("./", import.meta.url).href;
raiz.classList.add("luta3d");
const elPalco = document.createElement("div"); elPalco.className = "luta3d-palco";
const elVin = document.createElement("div"); elVin.className = "luta3d-vinheta";
const elFlash = document.createElement("div"); elFlash.className = "luta3d-flash";
const elCham = document.createElement("div"); elCham.className = "luta3d-chamada"; elCham.setAttribute("aria-hidden", "true");
raiz.append(elPalco, elVin, elFlash, elCham);
const palco = new Palco(elPalco);
if (op.nomes) palco.placar({ a: op.nomes.a, b: op.nomes.b, round: 1 });
const base = await carregarBase(dir);
/* guarda de luta: o gingado de boxe (pacote 2 do Mixamo, mais vivo que a guarda parada de antes) */
const GUARDA = "Guarda_Gingando";
const A = new Lutador(base, op.eu || { pele: "#c48a64", calcao: "#b3221b", cabelo: "buzzed", corCabelo: "#2a1d14" });
const B = new Lutador(base, op.ele || { pele: "#a8704c", calcao: "#1f3f9e", cabelo: "repartido", corCabelo: "#151210" });
palco.cena.add(A.raiz, B.raiz);
/* o árbitro: só aparece no fim (anúncio do vencedor, interrupção do nocaute técnico) */
const PARADO = A.clipeFixo("Alonga", 0.02, "Parado");
const C = new Lutador(base, { pele: "#c98e62", calcao: "#121318", cabelo: "militar", corCabelo: "#2a1b12", uniforme: "arbitro" });
C.raiz.visible = false; palco.cena.add(C.raiz); C.estado(PARADO, 0);
A.raiz.position.set(-0.85, 0, 0); B.raiz.position.set(0.85, 0, 0);
A.estado(GUARDA, 0); B.estado(GUARDA, 0);   // sem fade: nunca mostra a pose de repouso (braços abertos)
B.acao(GUARDA).time = 1.4;          // os dois não gingam no mesmo compasso
const nomeDe = () => "";
/* ---------- relógio: câmera lenta e parada de impacto afetam a luta, não a câmera ---------- */
let escala = 1, pausa = 0, tempo = 0;
const tweens = [];
const animar = (dur, fn) => new Promise((ok) => tweens.push({ t: 0, dur, fn, ok }));
const esperar = (s) => animar(s, () => {});
const suave = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/* ---------- posição: um de frente pro outro ---------- */
let travado = false, ocupadoLance = false;
const plano = (v) => new THREE.Vector3(v.x, 0, v.z);
function encarar(dt) {
  if (travado) return;
  for (const [L, O] of [[A, B], [B, A]]) {
    const d = plano(O.raiz.position).sub(plano(L.raiz.position));
    const alvo = Math.atan2(d.x, d.z);
    let dif = alvo - L.raiz.rotation.y; dif = Math.atan2(Math.sin(dif), Math.cos(dif));
    L.raiz.rotation.y += dif * Math.min(1, dt * 7);
  }
}
const dist = () => plano(A.raiz.position).distanceTo(plano(B.raiz.position));
async function ajustarDist(d, dur = 0.35) {
  const a0 = A.raiz.position.clone(), b0 = B.raiz.position.clone(), m = a0.clone().add(b0).multiplyScalar(0.5);
  const u = plano(b0).sub(plano(a0)).normalize();
  const a1 = m.clone().addScaledVector(u, -d / 2), b1 = m.clone().addScaledVector(u, d / 2);
  if (!travado) { darPasso(A, a1.clone().sub(a0), dur); darPasso(B, b1.clone().sub(b0), dur); }
  await animar(dur, (k) => { const s = suave(k); A.raiz.position.lerpVectors(a0, a1, s); B.raiz.position.lerpVectors(b0, b1, s); });
}
/* quem se desloca dá o passo de luta (pra frente ou pra trás, guarda alta) em vez de deslizar */
function darPasso(L, delta, dur) {
  if (Math.hypot(delta.x, delta.z) < 0.07 || L.nomeEstado !== GUARDA || L.ocupado()) return;
  const frente = delta.x * Math.sin(L.raiz.rotation.y) + delta.z * Math.cos(L.raiz.rotation.y) > 0;
  const clip = frente ? "Short_Step_Forward" : "Passo_Tras";
  L.umaVez(clip, { fade: 0.12, vel: THREE.MathUtils.clamp(L.dur(clip) / Math.max(0.3, dur), 0.9, 2.6), volta: 0.18, mover: false });
}
/* nunca um dentro do outro em pé: os passos e golpes andam junto com a animação (root motion) e,
   somados, às vezes encostavam os dois (achado filmando a troca) */
function manterDistancia() {
  if (travado || montada) return;
  const pa = plano(A.raiz.position), pb = plano(B.raiz.position), d = pa.distanceTo(pb), MIN = 0.8;
  // parados na guarda, voltam devagar pra distância de luta
  if (!ocupadoLance && d < 1.4 && d >= MIN) {
    const u = pb.clone().sub(pa).normalize(), passo = Math.min(1.4 - d, 0.01) / 2;
    A.raiz.position.addScaledVector(u, -passo); B.raiz.position.addScaledVector(u, passo);
  }
  if (d >= MIN) return;
  const u = d > 1e-4 ? pb.clone().sub(pa).normalize() : new THREE.Vector3(1, 0, 0), falta = (MIN - d) / 2;
  A.raiz.position.addScaledVector(u, -falta); B.raiz.position.addScaledVector(u, falta);
}
function voltarAoCentro(dt) {
  if (travado) return;   // também durante os lances: sem isso a luta encosta na grade e a câmera fica sem espaço
  const m = A.raiz.position.clone().add(B.raiz.position).multiplyScalar(0.5);
  const r = Math.hypot(m.x, m.z); if (r < 0.4) return;
  const passo = m.clone().setY(0).normalize().multiplyScalar(-Math.min(r, (r > 1.6 ? 0.45 : 0.2) * dt));
  A.raiz.position.add(passo); B.raiz.position.add(passo);
}

/* ---------- câmera de transmissão ---------- */
const cam = { modo: "tv", orb: 0 };
const pelve = (L) => plano(L.posMundo("pelvis"));
function dirigir(dt) {
  cam.orb += dt * 0.05;
  const pa = pelve(A), pb = pelve(B), m = pa.clone().add(pb).multiplyScalar(0.5);
  const linha = pb.clone().sub(pa); if (linha.lengthSq() < 1e-4) linha.set(1, 0, 0); linha.normalize();
  const lado = new THREE.Vector3(-linha.z, 0, linha.x);
  if (lado.dot(plano(palco.cam.position).sub(m)) < 0) lado.negate();
  if (palco.retrato) lado.applyAxisAngle(THREE.Object3D.DEFAULT_UP, 0.8);
  lado.applyAxisAngle(THREE.Object3D.DEFAULT_UP, Math.sin(cam.orb) * (palco.retrato ? 0.18 : 0.3));
  const a = palco.camAlvo, longe = palco.retrato ? 4.2 : 4.4;
  if (cam.modo === "tv") { a.pos.copy(m).addScaledVector(lado, longe).setY(palco.retrato ? 2.2 : 1.95); a.olhar.copy(m).setY(0.95); a.fov = 40; a.rapido = false; }
  else if (cam.modo === "perto") { a.pos.copy(m).addScaledVector(lado, 3.2).setY(1.6); a.olhar.copy(m).setY(1.05); a.fov = 38; a.rapido = false; }
  else if (cam.modo === "chao") {
    const e = cam.chaoEixo.clone(); if (e.dot(plano(palco.cam.position).sub(m)) < 0) e.negate();
    a.pos.copy(m).addScaledVector(e, 3.1).setY(1.7); a.olhar.copy(m).setY(0.35); a.fov = 40; a.rapido = false;
  } else if (cam.modo === "fin") {
    const f = cam.fin, c = f.centro();
    a.pos.copy(c).addScaledVector(f.lado(), f.dist).setY(f.alt); a.olhar.copy(c); a.fov = 38; a.rapido = true;
  } else if (cam.modo === "livre") { return;
  } else if (cam.modo === "entrada") {
    // câmera de entrada: na frente de quem caminha, um pouco de lado, andando de costas com ele
    const L = cam.entradaAlvo, p = L.posMundo("spine_03"), yaw = L.raiz.rotation.y;
    const fr = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), esq = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    a.pos.copy(p).addScaledVector(fr, 2.9).addScaledVector(esq, 0.7).setY(p.y + 0.55); a.olhar.copy(p).add(new THREE.Vector3(0, 0.05, 0)); a.fov = 44; a.rapido = true;
    return;
  } else if (cam.modo === "cerimonia") {
    // de frente pros três, fechando devagar durante o suspense
    const c = cam.cerCentro;
    a.pos.set(c.x + 0.25, 1.45, c.z + 3.6); a.olhar.set(c.x, 1.25, c.z); a.fov = cam.cerFov || 40; a.rapido = true;
    return;
  } else if (cam.modo === "ko") {
    const t = cam.koAlvo.posMundo("spine_03"); t.y = Math.max(0.4, t.y * 0.85);
    a.pos.copy(cam.koPos); a.olhar.copy(t); a.fov = 36; a.rapido = true;
  }
  const raio = Math.hypot(a.pos.x, a.pos.z); if (raio > 4.25) { a.pos.x *= 4.25 / raio; a.pos.z *= 4.25 / raio; }
}

/* ---------- legenda: a narração é a do jogo, aqui não escreve nada ---------- */
function narrar() {}

/* ---------- emoção na tela: chamadas, vinheta, flash, câmera lenta e som ---------- */
let timerCham = null;
function chamada(texto, { pequena = false } = {}) {
  elCham.textContent = texto;
  elCham.className = "luta3d-chamada" + (pequena ? " pequena" : "");
  void elCham.offsetWidth; elCham.classList.add("ativa");
  clearTimeout(timerCham); timerCham = setTimeout(() => elCham.classList.remove("ativa"), pequena ? 1300 : 1900);
}
function vinheta(forca = 1) { elVin.style.setProperty("--forca", Math.min(1, forca).toFixed(2)); elVin.classList.remove("ativa"); void elVin.offsetWidth; elVin.classList.add("ativa"); }
function flashBranco() { elFlash.classList.remove("ativa"); void elFlash.offsetWidth; elFlash.classList.add("ativa"); }
function camLenta(on) { raiz.classList.toggle("lenta", on); }
function vida() {}
/* def: quem levou. O jogo baixa a vida desse lado nesta hora (aoGolpe), nunca antes do golpe encostar. */
function efeitoGolpe(forca, def) {
  if (op.aoGolpe && def) op.aoGolpe(def === B ? "B" : "A");
  som(forca > 1.15 ? "pesado" : "leve", Math.min(1, 0.55 + 0.3 * forca));
  if (forca > 1.25) { vinheta(forca - 0.6); palco.chute = Math.max(palco.chute, 2.5 * forca); }
}
/* som: quem decide (e respeita o mudo) é o jogo. A torcida da arena reage junto. */
const AGITA = { explode: 1.2, sobe: 0.6, pesado: 0.25, queda: 0.35 };
function som(tipo, vol = 1) {
  if (AGITA[tipo]) palco.agitar(AGITA[tipo] * Math.min(1, vol + 0.2));
  if (op.som) op.som(tipo, vol);
}

/* ---------- golpes: animação, instante do impacto e distância medidos ----------
   imp: quando a mão (ou o pé) chega mais longe; dist: distância entre as pelves no começo pra
   que chegue no alvo (o golpe anda junto, root motion). Pacote 2: os golpes de boxe com passo.
   reacao: a de quem leva; mão esquerda de quem bate vira a cabeça pro outro lado. */
const GOLPES = {
  jab:          { clip: "Jab",            imp: 0.47, dist: 1.40, alvo: "cabeca", reacao: "Light_Hit_To_Head",  forca: 0.7, membro: "hand_l", nome: "jab" },
  direto:       { clip: "Direto",         imp: 0.67, dist: 1.47, alvo: "cabeca", reacao: "Reacao_Cabeca_Dir",  forca: 1.1, membro: "hand_r", nome: "direto" },
  umDois:       { clip: "Jab_Direto",     imp: 0.67, dist: 1.31, alvo: "cabeca", reacao: "Reacao_Cabeca_Dir",  forca: 1.0, membro: "hand_r", nome: "jab e direto", antes: { imp: 0.43, membro: "hand_l" } },
  cruzadoFrente:{ clip: "Cruzado_Frente", imp: 0.50, dist: 1.00, alvo: "cabeca", reacao: "Reacao_Cabeca_Esq",  forca: 1.1, membro: "hand_l", nome: "cruzado de esquerda" },
  gancho:       { clip: "Cruzado_Tras",   imp: 0.72, dist: 1.16, alvo: "cabeca", reacao: "Reacao_Cabeca_Dir",  forca: 1.4, membro: "hand_r", nome: "cruzado" },
  upper:        { clip: "Upper_Tras",     imp: 0.73, dist: 1.15, alvo: "cabeca", reacao: "Receiving_A_Big_Uppercut", forca: 1.5, membro: "hand_r", nome: "uppercut" },
  jabCorpo:     { clip: "Cruzado_Corpo",  imp: 1.00, dist: 1.38, alvo: "corpo",  reacao: "Reacao_Corpo",       forca: 0.9, membro: "hand_l", nome: "cruzado no corpo" },
  chuteBaixo:   { clip: "Chute_Baixo",    imp: 0.60, dist: 1.30, alvo: "perna",  reacao: "Reacao_Lado",        forca: 0.8, membro: "ball_r", nome: "chute baixo" },
  chuteCabeca:  { clip: "Mma_Kick",       imp: 0.71, dist: 1.30, alvo: "cabeca", reacao: "Big_Hit_To_Head",    forca: 1.7, membro: "ball_r", nome: "chute alto" },
  chuteCorpo:   { clip: "Roundhouse_Kick",imp: 0.92, dist: 1.66, alvo: "corpo",  reacao: "Rib_Hit",            forca: 1.3, membro: "ball_r", nome: "chute no corpo" },
};
/* em que instante da reação o golpe "chega" (medido na velocidade da cabeça do clipe) */
const REACAO_DE = { Reacao_Cabeca_Esq: 0.06, Reacao_Cabeca_Dir: 0.1, Reacao_Corpo: 0.13, Reacao_Lado: 0.16 };
/* onde o golpe encosta: rosto (um pouco à frente da cabeça) ou costela */
function alvoDe(atk, def, alvo) {
  return () => {
    const dir = pelve(atk).sub(pelve(def)).normalize();
    if (alvo === "cabeca") return def.posMundo("Head").add(new THREE.Vector3(0, 0.07, 0)).addScaledVector(dir, 0.1);
    if (alvo === "guarda") return def.posMundo("hand_l").lerp(def.posMundo("hand_r"), 0.5).addScaledVector(dir, 0.05);
    if (alvo === "perna") return def.posMundo("thigh_l").lerp(def.posMundo("calf_l"), 0.55).addScaledVector(dir, 0.08);
    return def.posMundo("spine_02").addScaledVector(dir, 0.15);
  };
}
function pararImpacto(forca) { pausa = Math.max(pausa, 0.035 + 0.035 * forca); }
function acertar(atk, def, membro, forca, alvo) {
  const dir = pelve(def).sub(pelve(atk)).normalize();
  const contato = atk.posMundo(membro);
  palco.impactoFx(contato, dir, forca);
  pararImpacto(forca);
  efeitoGolpe(forca, def);
  // empurrão extra na cabeça ou no tronco, no sentido do golpe (por cima da reação capturada)
  const eixo = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
  if (alvo === "cabeca") { def.impacto("Head", eixo, 0.16 * forca); def.impacto("neck_01", eixo, 0.08 * forca); }
  else def.impacto("spine_02", eixo, 0.1 * forca);
}
async function golpe(atk, def, nome, { bloqueio = false, reacao = null, segurarReacao = false, deReacao = 0, narra = true } = {}) {
  const g = GOLPES[nome];
  await ajustarDist(g.dist, 0.4);
  if (narra) narrar(`${nomeDe(atk)} acerta ${g.nome}.`);
  // defesa: na cabeça, metade bloqueia e metade esquiva (abaixa e sai pra trás); no corpo e na perna, bloqueia
  const esquiva = bloqueio && g.alvo === "cabeca" && Math.random() < 0.5;
  const ondeEstava = def.posMundo("Head").add(new THREE.Vector3(0, 0.07, 0)).addScaledVector(pelve(atk).sub(pelve(def)).normalize(), 0.1);
  atk.umaVez(g.clip, { fade: 0.14, volta: 0.35 });
  atk.contato(g.membro, esquiva ? () => ondeEstava.clone() : alvoDe(atk, def, bloqueio ? (g.alvo === "cabeca" ? "guarda" : g.alvo) : g.alvo), g.imp);
  if (g.antes && !bloqueio) atk.contato(g.antes.membro, alvoDe(atk, def, "cabeca"), g.antes.imp);
  let t = 0;
  if (g.antes && !bloqueio) { await esperar(g.antes.imp - 0.02); t = g.antes.imp - 0.02; acertar(atk, def, g.antes.membro, 0.6, "cabeca"); def.umaVez("Light_Hit_To_Head", { fade: 0.06, volta: 0.25, peso: 0.7 }); }
  if (bloqueio) {
    const antes = esquiva ? 0.28 : 0.32;
    await esperar(Math.max(0, g.imp - antes - t)); t = g.imp - antes;
    if (esquiva) def.umaVez("Esquiva_Recua", { fade: 0.08, de: 0.04, ate: 0.95, volta: 0.3 });
    else if (g.alvo === "cabeca") def.umaVez("Center_Block", { fade: 0.1, de: 0.25, ate: 1.2, volta: 0.3 });
    else def.umaVez("Defesa_Corpo", { fade: 0.1, de: 0.85, ate: 1.6, volta: 0.3, mover: false });
    if (narra) narrar(`${nomeDe(def)} ${esquiva ? "esquiva do" : "defende o"} ${g.nome}.`);
  }
  await esperar(Math.max(0, g.imp - 0.02 - t));
  if (esquiva) { /* passou no vazio: nada encosta */ }
  else if (bloqueio) { palco.impactoFx(atk.posMundo(g.membro), pelve(def).sub(pelve(atk)).normalize(), 0.3); pararImpacto(0.3); som("leve", 0.4); }
  else {
    acertar(atk, def, g.membro, g.forca, g.alvo === "perna" ? "corpo" : g.alvo);
    const r = reacao || g.reacao;
    def.umaVez(r, { fade: 0.06, volta: 0.35, segurar: segurarReacao, de: deReacao || REACAO_DE[r] || 0 });
  }
  await esperar(Math.max(0.35, atk.dur(g.clip) - g.imp - 0.45));
}

/* ---------- chão: queda em dupla, montada e ground and pound ----------
   Quem cai fica deitado de costas (Laying_Idle) com os joelhos dobrados e os pés no chão,
   cobrindo o rosto com os antebraços, e de tempos em tempos faz ponte pra tirar quem está
   em cima. Quem derrubou monta na barriga (pose do clipe da queda em 6,7 s) com a guarda
   alta: os dois antebraços em pé na frente do rosto. Cada soco sai da guarda, desce com o
   tronco e volta; a outra mão fica protegendo o rosto. Braços e pernas por IK com polo
   (o cotovelo e o joelho apontam pra onde devem). */
const UP = THREE.Object3D.DEFAULT_UP;
A.clipeFixo("Double_Leg_Takedown___Attacker", 6.7, "Montada");
let montada = null;   // { atk, def, cima, baixo }
const horiz = (v) => v.setY(0).normalize();
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const esq0 = (L) => V3(Math.cos(L.raiz.rotation.y), 0, -Math.sin(L.raiz.rotation.y));
const fr0 = (L) => V3(Math.sin(L.raiz.rotation.y), 0, Math.cos(L.raiz.rotation.y));
function eixosDeitado(L) {
  const long = horiz(L.posMundo("Head").sub(L.posMundo("pelvis")));
  const esq = horiz(L.posMundo("thigh_l").sub(L.posMundo("thigh_r")));
  return { long, esq };
}

function ctrlBaixo(bot, top) {
  const st = { abre: { l: 0, r: 0 }, abreAlvo: { l: 0, r: 0 }, esmaga: 0, peso: 0, ativo: true, livre: true,
    quadril: 0, ponte: 0, ergue: 0, pe: 0, ladoPe: "r", agarra: 0, senta: 0, t: Math.random() * 6, prox: 1.2 + Math.random() * 1.5 };
  const e0 = eixosDeitado(bot), p0 = bot.posMundo("pelvis").setY(0);
  // pés plantados perto do quadril (presos à raiz, pra acompanhar a fuga de quadril)
  const plantado = {
    l: p0.clone().addScaledVector(e0.long, -0.42).addScaledVector(e0.esq, 0.2).setY(0.09).sub(bot.raiz.position),
    r: p0.clone().addScaledVector(e0.long, -0.42).addScaledVector(e0.esq, -0.2).setY(0.09).sub(bot.raiz.position),
  };
  const sl = (l) => (l === "l" ? 1 : -1);
  const quadrilDeCima = (lado) => {
    const { esq } = eixosDeitado(bot), a = top.posMundo("thigh_l"), b = top.posMundo("thigh_r");
    const q = a.clone().sub(b).dot(esq) * sl(lado) > 0 ? a : b;
    return q.addScaledVector(esq, 0.07 * sl(lado)).add(V3(0, 0.03, 0));
  };
  const guarda = (lado) => () => {
    const { long, esq } = eixosDeitado(bot), ab = st.abre[lado];
    const a = bot.posMundo("Head").add(V3(0, 0.17 - 0.06 * st.esmaga, 0)).addScaledVector(esq, 0.075 * sl(lado)).addScaledVector(long, -0.02);
    a.addScaledVector(esq, 0.2 * sl(lado) * ab).add(V3(0, -0.08 * ab, 0));        // o soco abriu a guarda desse lado
    if (st.quadril > 0) a.lerp(quadrilDeCima(lado), st.quadril);               // mãos no quadril de quem está em cima
    if (st.agarra > 0) a.lerp(top.posMundo("neck_01").addScaledVector(esq, 0.07 * sl(lado)).add(V3(0, 0.03, 0)), st.agarra);   // abraça o pescoço dele
    return a;
  };
  const poloMao = (lado) => () => {
    const { long, esq } = eixosDeitado(bot);
    return bot.posMundo("upperarm_" + lado).addScaledVector(long, -0.3).addScaledVector(esq, 0.14 * sl(lado)).add(V3(0, -0.05 + 0.3 * st.quadril, 0));
  };
  const pe = (lado) => () => {
    const base = bot.raiz.position.clone().add(plantado[lado]);
    if (lado === st.ladoPe && st.pe > 0) base.lerp(quadrilDeCima(lado), st.pe);   // pé no quadril dele, pra chutar
    return base;
  };
  const poloJoelho = (lado) => () => {
    const { long, esq } = eixosDeitado(bot);
    return bot.posMundo("thigh_" + lado).add(V3(0, 0.7, 0)).addScaledVector(long, -0.15 + 0.35 * (lado === st.ladoPe ? st.pe : 0)).addScaledVector(esq, 0.12 * sl(lado));
  };
  for (const l of ["l", "r"]) {
    bot.ikFixo["hand_" + l] = { alvo: guarda(l), polo: poloMao(l), peso: 0 };
    bot.ikFixo["ball_" + l] = { alvo: pe(l), polo: poloJoelho(l), peso: 0 };
  }
  const f = (dt) => {
    st.peso = st.ativo ? Math.min(1, st.peso + dt * 2.2) : Math.max(0, st.peso - dt * 3);
    const w = suave(st.peso);
    for (const l of ["l", "r"]) {
      bot.ikFixo["hand_" + l].peso = w;
      bot.ikFixo["ball_" + l].peso = w;
      st.abre[l] += (st.abreAlvo[l] - st.abre[l]) * Math.min(1, dt * (st.abreAlvo[l] > st.abre[l] ? 16 : 3.5));
    }
    st.esmaga = Math.max(0, st.esmaga - dt * 4);
    st.t += dt;
    const { long, esq } = eixosDeitado(bot);
    // respira e mexe a cabeça
    bot.girarMundo(bot.ossos.spine_03, esq, 0.04 * Math.sin(st.t * 2.6) * w);
    bot.girarMundo(bot.ossos.Head, long, 0.08 * Math.sin(st.t * 0.9) * w);
    // senta pra alcançar o pescoço de quem está em cima
    if (st.senta > 0.001) for (const [o, p] of [["spine_01", 0.4], ["spine_02", 0.3], ["spine_03", 0.3]]) bot.girarMundo(bot.ossos[o], esq, 0.6 * st.senta * p * w);
    // ponte: o quadril sobe e o peito fica no chão; quem está em cima sobe junto
    const h = 0.16 * st.ponte * w;
    if (h > 0.001) {
      const pel = bot.ossos.pelvis, wp = pel.getWorldPosition(V3()); wp.y += h; pel.parent.worldToLocal(wp); pel.position.copy(wp);
      bot.modelo.updateMatrixWorld(true);
      bot.girarMundo(bot.ossos.spine_01, esq, -Math.atan2(h, 0.3));
    }
    top.raiz.position.y = (0.6 * h + st.ergue) * w;
    // de tempos em tempos tenta tirar quem está em cima com uma ponte curta
    st.prox -= dt;
    if (st.prox <= 0 && st.livre && st.ativo) {
      st.prox = 1.8 + Math.random() * 2.4;
      const amp = 0.3 + Math.random() * 0.35;
      animar(0.55, (k) => { if (st.livre) st.ponte = amp * Math.sin(Math.PI * k); });
      setTimeout(() => top.impacto("spine_01", esq0(top), (Math.random() < 0.5 ? -1 : 1) * 0.07 * amp * 2), 120);
    }
  };
  bot.extras.add(f);
  return {
    st,
    maoPerto(p) { const a = bot.posMundo("hand_l"), b = bot.posMundo("hand_r"); return a.distanceTo(p) < b.distanceTo(p) ? ["l", a] : ["r", b]; },
    abrirGuarda(p) { const [l] = this.maoPerto(p); st.abreAlvo[l] = 1; setTimeout(() => { st.abreAlvo[l] = 0; }, 260); },
    bloqueio() { st.esmaga = 1; bot.impacto("Head", eixosDeitado(bot).esq, (Math.random() - 0.5) * 0.15); },
    reagir(lado, forca = 1) {
      const { long } = eixosDeitado(bot), s = lado === "r" ? 1 : -1;
      bot.impacto("Head", long, 0.5 * s * forca);            // o rosto vira pro lado do soco
      bot.impacto("neck_01", long, 0.22 * s * forca);
      bot.impacto("spine_03", long, 0.1 * s * forca);
      const coxa = Math.random() < 0.5 ? "thigh_l" : "thigh_r";  // a perna encolhe de dor
      bot.impacto(coxa, V3().crossVectors(long, UP).normalize(), 0.35 * forca);
    },
    parar() {
      st.ativo = false; st.livre = false;
      setTimeout(() => { bot.extras.delete(f); for (const k of ["hand_l", "hand_r", "ball_l", "ball_r"]) delete bot.ikFixo[k]; top.raiz.position.y = 0; }, 600);
    },
  };
}

/* postura de quem monta (medida em prints de lado, frente e três quartos) */
const MONTADA = { tronco: 0.0, cabeca: -0.45, frente: 0.26, cima: 0.0, abre: 0.09 };
function ctrlCima(top, bot, baixo) {
  const st = { socos: [], peso: 0, ativo: true, enforca: 0, recuo: 0, inclina: 0, apoio: 0, t: Math.random() * 6 };
  const sl = (l) => (l === "l" ? 1 : -1);
  const f = (dt) => {
    st.peso = st.ativo ? Math.min(1, st.peso + dt * 2) : Math.max(0, st.peso - dt * 3);
    const w0 = suave(st.peso);
    if (w0 < 0.001) return;
    st.t += dt;
    const fr = fr0(top), esq = esq0(top);
    // tronco um pouco inclinado sobre quem está embaixo (base de quem monta), respirando
    let pitch = MONTADA.tronco + 0.03 * Math.sin(st.t * 2.1) - 0.55 * st.recuo, twist = 0;
    const maos = { l: null, r: null };
    for (const s of st.socos.slice()) {
      const k = top.relogio - s.t0, sg = s.lado === "r" ? 1 : -1;
      if (k < 0) continue;
      // o quadro pode pular a janela do impacto (3x ou celular lento): o golpe conta assim que passa do instante
      if (k >= 0.13 && !s.desceu) { s.desceu = true; s.aoDescer(); }
      if (k >= 0.23 && !s.bateu) { s.bateu = true; s.aoBater(); }
      let w, de, para;
      if (k < 0.13) { w = suave(k / 0.13); twist -= 0.18 * sg * w; pitch -= 0.04 * w; de = "guarda"; para = "carrega"; }
      else if (k < 0.23) {
        w = suave((k - 0.13) / 0.1); twist += sg * (-0.18 + 0.52 * w); pitch += -0.04 + 0.42 * w; de = "carrega"; para = "alvo";
      } else if (k < 0.29) {
        w = 1; twist += 0.34 * sg; pitch += 0.38; de = para = "alvo";
      } else if (k < 0.56) { w = suave((k - 0.29) / 0.27); twist += 0.34 * sg * (1 - w); pitch += 0.38 * (1 - w); de = "alvo"; para = "guarda"; }
      else { st.socos.splice(st.socos.indexOf(s), 1); continue; }
      maos[s.lado] = { de, para, w, s };
    }
    pitch += 0.5 * st.enforca + 0.6 * st.inclina + 0.55 * st.apoio;
    for (const [o, p] of [["spine_01", 0.35], ["spine_02", 0.35], ["spine_03", 0.3]]) top.girarMundo(top.ossos[o], esq, pitch * p * w0);
    // a pose da montada (do clipe da queda) tem os ombros girados e tortos: endireita antes do soco
    top.modelo.updateMatrixWorld(true);
    const dOmb = top.posMundo("upperarm_l").sub(top.posMundo("upperarm_r"));
    const giro = Math.atan2(dOmb.dot(fr), dOmb.dot(esq)), rola = -Math.atan2(dOmb.y, Math.hypot(dOmb.dot(fr), dOmb.dot(esq)));
    top.girarMundo(top.ossos.spine_02, UP, (giro + twist) * 0.5 * w0); top.girarMundo(top.ossos.spine_03, UP, (giro + twist) * 0.5 * w0);
    // peso passando de um joelho pro outro, devagar
    top.girarMundo(top.ossos.spine_03, fr, (rola + 0.045 * Math.sin(st.t * 0.8)) * w0);
    top.girarMundo(top.ossos.Head, esq, MONTADA.cabeca * w0 * (1 - st.enforca));   // olhos no rosto de quem está embaixo
    top.modelo.updateMatrixWorld(true);
    // a guarda segue o tronco (não o mundo): punho na altura da bochecha, antebraço junto do peito, cotovelo nas costelas
    const cima = top.posMundo("neck_01").sub(top.posMundo("spine_01")).normalize();
    const frente = fr.clone().addScaledVector(cima, -fr.dot(cima)).normalize();
    const queixo = top.posMundo("neck_01").addScaledVector(cima, MONTADA.cima).addScaledVector(frente, MONTADA.frente);
    const ombro = (l) => top.posMundo("upperarm_" + l);
    const vai = (l) => (l === "l" ? 0 : 2.1);   // cada mão no seu tempo
    const P = {
      guarda: (l) => queixo.clone().addScaledVector(frente, 0.012 * Math.sin(st.t * 1.7 + vai(l))).addScaledVector(esq, MONTADA.abre * sl(l))
        .addScaledVector(cima, 0.014 * Math.sin(st.t * 2.3 + vai(l))),
      // o soco arma perto do ombro (puxa o cotovelo pra trás), não em cima da cabeça
      carrega: (l) => P.guarda(l).addScaledVector(frente, -0.08).addScaledVector(esq, 0.05 * sl(l)).addScaledVector(cima, -0.02),
      alvo: (l, s) => s.alvo(),
    };
    const POLO = {
      guarda: (l) => P.guarda(l).addScaledVector(cima, -0.55).addScaledVector(frente, 0.02).addScaledVector(esq, 0.06 * sl(l)),
      carrega: (l) => ombro(l).addScaledVector(cima, -0.3).addScaledVector(frente, -0.25).addScaledVector(esq, 0.22 * sl(l)),
      alvo: (l) => ombro(l).addScaledVector(esq, 0.35 * sl(l)).addScaledVector(frente, -0.12).addScaledVector(cima, -0.1),
    };
    for (const l of ["l", "r"]) {
      const m = maos[l];
      let alvo, polo;
      if (m) {
        alvo = P[m.de](l, m.s).lerp(P[m.para](l, m.s), m.w);
        // o punho faz um arco por cima (não atravessa o próprio corpo)
        if (m.de !== m.para) alvo.addScaledVector(cima, 0.07 * Math.sin(Math.PI * m.w));
        polo = POLO[m.de](l).lerp(POLO[m.para](l), m.w);
      } else {
        alvo = P.guarda(l); polo = POLO.guarda(l);
        if (maos[l === "l" ? "r" : "l"]) alvo.addScaledVector(frente, -0.035);   // a outra mão cola no rosto enquanto esta soca
      }
      if (st.enforca > 0) alvo.lerp(bot.posMundo("neck_01").add(V3(0, 0.08, 0)).addScaledVector(esq, 0.07 * sl(l)), st.enforca);
      // subindo na montada: as duas mãos apoiadas no peito de quem caiu, cotovelos pra fora
      if (st.apoio > 0) {
        alvo.lerp(bot.posMundo("spine_03").add(V3(0, 0.1, 0)).addScaledVector(esq, 0.16 * sl(l)), st.apoio);
        polo.lerp(ombro(l).addScaledVector(esq, 0.4 * sl(l)).addScaledVector(cima, -0.1), st.apoio);
      }
      // jogado pra trás pela ponte: os braços abrem pra se equilibrar
      if (st.recuo > 0) alvo.lerp(ombro(l).addScaledVector(esq, 0.38 * sl(l)).add(V3(0, -0.48, 0)).addScaledVector(fr, 0.2), 0.75 * st.recuo);
      top.ikDoisOssos(top.ossos["upperarm_" + l], top.ossos["lowerarm_" + l], top.ossos["hand_" + l], alvo, w0, polo);
    }
  };
  top.extras.add(f);
  return {
    st,
    /* rosto: passa pela guarda e acerta; senão bate no antebraço */
    soco(lado, atraso = 0, forca = 1, rosto = Math.random() < 0.6) {
      return new Promise((ok) => st.socos.push({ lado, t0: top.relogio + atraso, fim: ok,
        alvo: () => (rosto ? bot.posMundo("Head").add(V3(0, 0.11, 0)) : baixo.maoPerto(top.posMundo("hand_" + lado))[1].add(V3(0, 0.05, 0))),
        aoDescer: () => { if (rosto) baixo.abrirGuarda(top.posMundo("hand_" + lado)); },
        aoBater: () => {
          const mao = top.posMundo("hand_" + lado), dir = bot.posMundo("Head").sub(mao).normalize();
          if (rosto) { palco.impactoFx(mao, dir, 0.55 * forca); pararImpacto(0.35 * forca); baixo.reagir(lado, forca); efeitoGolpe(0.8 * forca, bot); }
          else { palco.impactoFx(mao, dir, 0.2); pararImpacto(0.12); baixo.bloqueio(); som("leve", 0.45); }
          top.impacto("spine_03", esq0(top), -0.08);
          ok(rosto);
        } }));
    },
    /* tira os socos que ainda não saíram; quem esperava por eles segue (sem o efeito do golpe) */
    limpar() { for (const s of st.socos) if (!s.bateu) s.fim(false); st.socos.length = 0; },
    parar() { st.ativo = false; this.limpar(); setTimeout(() => top.extras.delete(f), 600); },
  };
}

async function queda(atk, def, { soco = true } = {}) {
  cam.modo = "tv";
  await ajustarDist(1.2, 0.45);
  travado = true;
  const u = pelve(def).sub(pelve(atk)).normalize();
  const yaw = Math.atan2(u.x, u.z);
  atk.raiz.rotation.y = yaw; def.raiz.rotation.y = yaw + Math.PI;
  narrar(`${nomeDe(atk)} entra nas pernas...`);
  atk.umaVez("Double_Leg_Takedown___Attacker", { fade: 0.12, segurar: true, ate: 2.6 });
  def.umaVez("Double_Leg_Takedown___Victim", { fade: 0.12, segurar: true });
  await esperar(1.15);
  chamada("QUEDA!"); som("queda", 0.9); som("sobe", 0.5);
  narrar(`Queda de ${nomeDe(atk)}. Levou pro chão.`, true);
  palco.tremor = Math.max(palco.tremor, 0.04); efeitoGolpe(1.0, def);
  cam.chaoEixo = V3(-u.z, 0, u.x); cam.modo = "chao";
  await esperar(0.7);
  // quem caiu assenta de costas (pose mais parecida do Laying_Idle, sem salto)
  def.umaVez("Laying_Idle", { casar: [0, 8], fade: 0.6, segurar: true, mover: false });
  await esperar(0.6);
  // quem derrubou monta: o quadril vai pra cima da barriga de quem está embaixo, de frente pra cabeça dele
  const long = horiz(def.posMundo("Head").sub(def.posMundo("pelvis")));
  const alvoQuadril = def.posMundo("spine_01").addScaledVector(long, 0.06).setY(0);
  const yawM = Math.atan2(long.x, long.z);
  const pq = atk.posMundo("pelvis").setY(0);
  let dy = yawM - atk.raiz.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  // sobe na montada: mãos no peito dele, um pulinho por cima do quadril, e só depois a guarda
  atk.umaVez("Montada", { fade: 0.65, segurar: true, mover: false });
  atk.alinhando = { dyaw: dy, dpos: alvoQuadril.sub(pq), pivo: pq.clone(), dur: 0.7, k: 0 };
  const baixo = ctrlBaixo(def, atk), cima = ctrlCima(atk, def, baixo);
  cima.st.apoio = 1; baixo.st.livre = false;
  montada = { atk, def, cima, baixo };
  await animar(0.7, (k) => { baixo.st.ergue = 0.08 * Math.sin(Math.PI * k); });
  baixo.st.ergue = 0;
  await esperar(0.15);
  await animar(0.4, (k) => { cima.st.apoio = 1 - suave(k); });
  baixo.st.livre = true;
  cam.chaoEixo = V3(-long.z, 0, long.x);
  if (soco) await serieSocos(6);
  else await esperar(0.6);
}
async function serieSocos(n, forte = false) {
  if (!montada) return;
  const { atk, def, cima } = montada;
  narrar(`${nomeDe(atk)} soca por cima. ${nomeDe(def)} fecha a guarda.`, true);
  let lado = Math.random() < 0.5 ? "r" : "l";
  for (let i = 0; i < n; i++) {
    const ultimo = forte && i === n - 1;
    const f = ultimo ? 1.6 : 0.8 + Math.random() * 0.5;
    await cima.soco(lado, 0, f, ultimo || forte ? true : undefined);
    await esperar(0.16 + Math.random() * 0.24);
    // às vezes repete a mesma mão (dois socos seguidos de um lado só)
    if (Math.random() < 0.75) lado = lado === "r" ? "l" : "r";
  }
  await esperar(0.35);
}
/* tentativa de finalização no chão que não entra. Por cima: desce e aperta o pescoço.
   Por baixo: senta, abraça o pescoço de quem está em cima (guilhotina) e ele tira a cabeça. */
async function tentativaChao(quem = "cima") {
  if (!montada) return;
  const { cima, baixo, def } = montada;
  chamada("TENTATIVA DE FINALIZAÇÃO", { pequena: true }); som("sobe", 0.8);
  baixo.st.livre = false; cima.limpar();
  if (quem === "baixo") {
    await animar(0.4, (k) => { const s = suave(k); cima.st.inclina = 0.8 * s; baixo.st.senta = s; baixo.st.agarra = s; });
    for (let i = 0; i < 4; i++) {
      cima.st.inclina = 0.7 + 0.25 * Math.random(); baixo.st.ponte = 0.2 + 0.3 * Math.random();
      montada.atk.impacto("spine_02", esq0(montada.atk), (Math.random() - 0.5) * 0.25);
      palco.tremor = Math.max(palco.tremor, 0.01);
      await esperar(0.35);
    }
    // ele levanta a postura e arranca a cabeça
    await animar(0.35, (k) => { const s = suave(k); cima.st.inclina = 0.8 * (1 - s) - 0.2 * Math.sin(Math.PI * s); baixo.st.agarra = 1 - s; baixo.st.senta = 1 - s; baixo.st.ponte = 0; });
    cima.st.inclina = 0;
  } else {
    await animar(0.45, (k) => { cima.st.enforca = suave(k); });
    for (let i = 0; i < 5; i++) {
      baixo.st.ponte = 0.25 + 0.4 * Math.random();
      def.impacto(Math.random() < 0.5 ? "thigh_l" : "thigh_r", esq0(def), (Math.random() < 0.5 ? -1 : 1) * 0.5);
      def.impacto("Head", horiz(def.posMundo("Head").sub(def.posMundo("pelvis"))), (Math.random() - 0.5) * 0.5);
      palco.tremor = Math.max(palco.tremor, 0.012);
      await esperar(0.35);
    }
    await animar(0.35, (k) => { cima.st.enforca = 1 - suave(k); baixo.st.ponte = (1 - suave(k)) * baixo.st.ponte; });
  }
  baixo.st.ponte = 0; baixo.st.livre = true;
  chamada("ESCAPOU!", { pequena: true });
}
/* quem está embaixo tira quem está em cima: a primeira ponte não basta (ele segura), aí as
   mãos no quadril, a ponte forte, a fuga de quadril com o pé no quadril dele e o chute que
   manda ele pra trás. O chute sai com a perna do lado da câmera, pra dar pra ver. */
async function expulsar(texto) {
  if (!montada) return;
  const { atk, def, cima, baixo } = montada;
  const { long, esq } = eixosDeitado(def);
  baixo.st.livre = false; cima.limpar(); baixo.st.ponte = 0;
  const ladoCam = esq.dot(plano(palco.cam.position).sub(pelve(def))) > 0 ? "l" : "r";
  baixo.st.ladoPe = ladoCam;
  const foge = ladoCam === "r" ? 1 : -1;   // o quadril foge pro lado contrário do pé que entra
  narrar(`${nomeDe(def)} tenta sair por baixo...`, true);
  // a primeira ponte: quem está em cima abre os braços e segura
  await animar(0.6, (k) => { const s = Math.sin(Math.PI * k); baixo.st.ponte = 1.0 * s; baixo.st.ergue = 0.03 * s; cima.st.recuo = 0.65 * s; });
  palco.tremor = Math.max(palco.tremor, 0.015);
  await esperar(0.2);
  narrar(`${nomeDe(def)} segura o quadril de ${nomeDe(atk)}...`, true);
  await animar(0.3, (k) => { baixo.st.quadril = suave(k); });
  // a ponte forte: o quadril explode pra cima e joga quem está em cima pra trás
  som("queda", 0.6); palco.tremor = Math.max(palco.tremor, 0.035);
  const a0 = atk.raiz.position.clone().setY(0);
  await animar(0.28, (k) => { const s = suave(k); baixo.st.ponte = 1.3 * s; baixo.st.ergue = 0.05 * s; cima.st.recuo = s;
    atk.raiz.position.x = a0.x - long.x * 0.25 * s; atk.raiz.position.z = a0.z - long.z * 0.25 * s; });
  // fuga de quadril e o pé entra no quadril dele
  const d0 = def.raiz.position.clone();
  await animar(0.32, (k) => { const s = suave(k); baixo.st.ponte = 1.3 - 1.1 * s; baixo.st.quadril = 1 - 0.6 * s; baixo.st.pe = s;
    def.raiz.position.copy(d0).addScaledVector(esq, 0.16 * foge * s); });
  // o chute: quem estava em cima vai pra trás, longe das pernas de quem chutou, e levanta
  montada = null;
  narrar(texto || `${nomeDe(def)} chuta e sai de baixo.`, true);
  chamada("SAIU DE BAIXO!", { pequena: true }); som("pesado", 0.8); som("sobe", 0.5);
  palco.impactoFx(def.posMundo(ladoCam === "l" ? "foot_l" : "foot_r"), long.clone().negate(), 0.7); pararImpacto(0.45);
  cima.parar();
  atk.impacto("spine_02", esq0(atk), -0.4);
  atk.umaVez("Getting_Up", { casar: [3.8, 6.4], vel: 1.3, fade: 0.3, segurar: true });
  const a1 = atk.raiz.position.clone().setY(0), fuga = long.clone().negate().addScaledVector(esq, -0.45 * foge).normalize();
  animar(1.4, (k) => { const s = 1 - Math.pow(1 - k, 2); atk.raiz.position.x = a1.x + fuga.x * 1.6 * s; atk.raiz.position.z = a1.z + fuga.z * 1.6 * s; });
  // a perna estica no chute e as duas voltam dobradas (sem esticar embaixo de quem levanta)
  await animar(0.3, (k) => { baixo.st.quadril = 0.4 * (1 - k); baixo.st.pe = 1 - k; });
  baixo.parar();
  def.umaVez("Getting_Up", { casar: [0, 3.2], vel: 1.35, fade: 0.45, segurar: true });
  cam.modo = "tv";
  await esperar(0.8);
  atk.estado(GUARDA, 0.5);
  const tDef = (8.33 - def.acao("Getting_Up").time) / 1.35;
  await esperar(Math.max(0.3, tDef - 0.5));
  def.estado(GUARDA, 0.5);
  travado = false;
  await ajustarDist(1.7, 0.9);
}
/* o sino: o árbitro manda levantar; quem está em cima sai primeiro */
async function separar({ narra = true } = {}) {
  if (!montada) return;
  const { atk, def, cima, baixo } = montada; montada = null;
  cima.parar(); baixo.parar();
  if (narra) narrar(`${nomeDe(def)} consegue levantar.`);
  await esperar(0.3);
  const recuo = pelve(atk).sub(pelve(def)).normalize();
  atk.umaVez("Getting_Up", { casar: [3.8, 6.4], vel: 1.25, fade: 0.45, segurar: true });
  const a0 = atk.raiz.position.clone().setY(0);
  animar(1.2, (k) => { atk.raiz.position.copy(a0).addScaledVector(recuo, 0.9 * suave(k)); });
  await esperar(0.5);
  def.umaVez("Getting_Up", { casar: [0, 3.2], vel: 1.3, fade: 0.5, segurar: true });
  cam.modo = "tv";
  await esperar(1.0);
  atk.estado(GUARDA, 0.5);
  const tDef = (8.33 - def.acao("Getting_Up").time) / 1.3;
  await esperar(Math.max(0.3, tDef - 0.5));
  def.estado(GUARDA, 0.5);
  travado = false;
  await ajustarDist(1.7, 0.9);
}

/* ---------- finalizações ----------
   O mata-leão é o par capturado do Mixamo (Strangling / Being Strangled). Triângulo, chave
   de braço e guilhotina não existem lá: são montados por IK em cima de poses que já temos
   (deitado de costas e ajoelhado), como a montada. Em todas, um corte de câmera leva pra
   posição já encaixada; quem está preso aperta, tenta sair e bate. */
const VO = new THREE.Vector3(-0.11, 0, 2.54);
const NOME_FIN = { mataLeao: "MATA-LEÃO!", chave: "CHAVE DE BRAÇO!", triangulo: "TRIÂNGULO!", guilhotina: "GUILHOTINA!" };

/* pose parada de um clipe, aplicada já (sem fade) */
function poseFixa(L, nome, t = 0) {
  L.extras.clear(); L.ikFixo = {}; L.molas.length = 0; L.contatos.length = 0; L.alinhando = null;
  L.umaVez(nome, { de: t, fade: 0, segurar: true, mover: false });
  L.update(0);
}
/* gira e anda a raiz pra que a pelve fique em `pelveAlvo` e o corpo aponte pra `dirAlvo`
   (deitado: direção da cabeça; ajoelhado: pra onde olha) */
function colocar(L, pelveAlvo, dirAlvo, deitado) {
  L.raiz.rotation.y = 0; L.raiz.position.set(0, 0, 0); L.raiz.updateMatrixWorld(true);
  const p = L.posMundo("pelvis"), d = horiz(L.posMundo(deitado ? "Head" : "neck_01").sub(L.posMundo("pelvis")));
  const yaw = Math.atan2(dirAlvo.x, dirAlvo.z) - Math.atan2(d.x, d.z);
  L.raiz.rotation.y = yaw;
  L.raiz.position.copy(pelveAlvo).setY(0).sub(p.setY(0).applyAxisAngle(UP, yaw));
  L.raiz.updateMatrixWorld(true);
}
/* ajoelhado e curvado pra frente (quem ficou preso na guarda): tronco desce, ombros retos */
function curvarAjoelhado(L, st) {
  return () => {
    const fr = fr0(L), esq = esq0(L);
    const pitch = st.curva + 0.15 * st.aperto + 0.05 * Math.sin(st.t * 3);
    for (const [o, p] of [["spine_01", 0.4], ["spine_02", 0.3], ["spine_03", 0.3]]) L.girarMundo(L.ossos[o], esq, pitch * p);
    L.modelo.updateMatrixWorld(true);
    const d = L.posMundo("upperarm_l").sub(L.posMundo("upperarm_r"));
    L.girarMundo(L.ossos.spine_02, UP, Math.atan2(d.dot(fr), d.dot(esq)));
    L.girarMundo(L.ossos.spine_03, fr, -Math.atan2(d.y, Math.hypot(d.dot(fr), d.dot(esq))));
    L.modelo.updateMatrixWorld(true);
  };
}
/* deitado de costas: tronco sobe (curva > 0, sentando) e quadril sobe (ponte) */
function curvarDeitado(L, st) {
  return () => {
    const { esq } = eixosDeitado(L);
    if (st.ponte > 0.001) {
      const h = 0.12 * st.ponte, pel = L.ossos.pelvis, wp = pel.getWorldPosition(V3()); wp.y += h; pel.parent.worldToLocal(wp); pel.position.copy(wp);
      L.modelo.updateMatrixWorld(true);
    }
    const c = st.curva;
    for (const [o, p] of [["spine_01", 0.4], ["spine_02", 0.3], ["spine_03", 0.3]]) L.girarMundo(L.ossos[o], esq, c * p);
    L.modelo.updateMatrixWorld(true);
  };
}
/* centro da cena da finalização: perto de onde estavam, longe da grade */
function centroFin(S, V) {
  const c = pelve(S).add(pelve(V)).multiplyScalar(0.5), r = Math.hypot(c.x, c.z);
  if (r > 1.4) c.multiplyScalar(1.4 / r);
  return c;
}
const dirAleatoria = () => { const a = Math.random() * Math.PI * 2; return V3(Math.sin(a), 0, Math.cos(a)); };
const lado = (l) => (l === "l" ? 1 : -1);

/* cada uma devolve { st, cam, tapa(), debate(), fim } com os controles já ligados */
const FIN = {
  /* triângulo: quem está embaixo prende o pescoço e um braço de quem está na guarda com as pernas */
  triangulo(S, V) {
    const c = centroFin(S, V), longS = dirAleatoria();
    poseFixa(S, "Laying_Idle"); poseFixa(V, "Montada");
    colocar(S, c.clone().addScaledVector(longS, 0.2), longS, true);
    colocar(V, pelve(S).addScaledVector(longS, -0.46), longS, false);
    const st = { aperto: 0, tapa: 0, t: 0, curva: 1.4, ponte: 0.25, curvaS: 0.12 };
    const esqS = () => eixosDeitado(S).esq;
    const nuca = () => V.posMundo("neck_01").add(V3(0, 0.07, 0));
    V.extras.add((dt) => { st.t += dt; });
    V.extras.add(curvarAjoelhado(V, st));
    S.extras.add(curvarDeitado(S, { get ponte() { return st.ponte + 0.3 * st.aperto; }, get curva() { return st.curvaS + 0.1 * st.aperto; } }));
    // perna esquerda dele por cima do ombro de fora e atrás da nuca; a direita trava por cima do pé
    S.ikFixo.ball_l = { peso: 1, alvo: () => nuca().addScaledVector(esqS(), -0.2).add(V3(0, -0.02, 0)), polo: () => nuca().addScaledVector(esqS(), 0.3).add(V3(0, 0.45, 0)) };
    S.ikFixo.ball_r = { peso: 1, alvo: () => nuca().addScaledVector(esqS(), 0.02).add(V3(0, 0.1 - 0.03 * st.aperto, 0)).addScaledVector(eixosDeitado(S).long, -0.12), polo: () => S.posMundo("thigh_r").addScaledVector(esqS(), -0.5).add(V3(0, 0.35, 0)) };
    // as duas mãos puxam a cabeça pra baixo
    for (const l of ["l", "r"]) S.ikFixo["hand_" + l] = { peso: 1, alvo: () => V.posMundo("Head").add(V3(0, 0.1, 0)).addScaledVector(esqS(), 0.06 * lado(l)), polo: () => S.posMundo("upperarm_" + l).addScaledVector(esqS(), 0.3 * lado(l)).add(V3(0, -0.1, 0)) };
    // o braço de dentro fica preso contra o pescoço; o de fora bate na perna
    V.ikFixo.hand_l = { peso: 1, alvo: () => S.posMundo("spine_03").addScaledVector(esqS(), 0.12).add(V3(0, 0.12, 0)), polo: () => V.posMundo("upperarm_l").add(V3(0, -0.4, 0)) };
    V.ikFixo.hand_r = { peso: 1, alvo: () => {
      const base = S.posMundo("thigh_l").lerp(S.posMundo("calf_l"), 0.55).add(V3(0, 0.06, 0));
      return st.tapa ? base.add(V3(0, 0.07 * Math.max(0, Math.sin(st.t * 15)), 0)) : V.posMundo("thigh_r").addScaledVector(esqS(), 0.2).setY(0.08);
    }, polo: () => V.posMundo("upperarm_r").add(V3(0, -0.3, 0)).addScaledVector(esqS(), 0.3) };
    return { st, centro: () => V.posMundo("neck_01").lerp(S.posMundo("pelvis"), 0.4), lado: () => esqS(), dist: 2.3, alt: 1.25,
      debate: () => { V.impacto("spine_01", esq0(V), (Math.random() - 0.5) * 0.3); V.impacto("Head", fr0(V), (Math.random() - 0.5) * 0.4); },
      vencedorDeitado: true, perdedorDeitado: false };
  },
  /* guilhotina: quem está embaixo senta, abraça o pescoço de quem está na guarda e fecha as pernas */
  guilhotina(S, V) {
    const c = centroFin(S, V), longS = dirAleatoria();
    poseFixa(S, "Laying_Idle"); poseFixa(V, "Montada");
    colocar(S, c.clone().addScaledVector(longS, 0.2), longS, true);
    const esqS = () => eixosDeitado(S).esq;
    colocar(V, pelve(S).addScaledVector(longS, -0.42).addScaledVector(esqS(), -0.1), longS, false);
    const st = { aperto: 0, tapa: 0, t: 0, curva: 1.3, curvaS: 0.4, ponte: 0 };
    V.extras.add((dt) => { st.t += dt; });
    V.extras.add(curvarAjoelhado(V, st));
    S.extras.add(curvarDeitado(S, { get ponte() { return 0.5 * st.aperto; }, get curva() { return st.curvaS - 0.2 * st.aperto; } }));
    const garganta = () => V.posMundo("neck_01").add(V3(0, -0.08, 0)).addScaledVector(fr0(V), 0.04);
    // braço direito por cima das costas e por baixo do queixo; a esquerda segura o punho
    S.ikFixo.hand_r = { peso: 1, alvo: () => garganta().addScaledVector(esqS(), 0.07), polo: () => V.posMundo("spine_03").add(V3(0, 0.4, 0)).addScaledVector(esqS(), -0.25) };
    S.ikFixo.hand_l = { peso: 1, alvo: () => S.posMundo("hand_r").addScaledVector(esqS(), 0.06).add(V3(0, -0.03, 0)), polo: () => S.posMundo("upperarm_l").addScaledVector(esqS(), 0.4).add(V3(0, -0.2, 0)) };
    // guarda fechada: os pés cruzam atrás da cintura dele
    const atras = () => V.posMundo("pelvis").add(V3(0, 0.04, 0)).addScaledVector(fr0(V), -0.12);
    S.ikFixo.ball_l = { peso: 1, alvo: () => atras().addScaledVector(esqS(), -0.07), polo: () => S.posMundo("thigh_l").addScaledVector(esqS(), 0.6).add(V3(0, 0.3, 0)) };
    S.ikFixo.ball_r = { peso: 1, alvo: () => atras().addScaledVector(esqS(), 0.07).add(V3(0, 0.04, 0)), polo: () => S.posMundo("thigh_r").addScaledVector(esqS(), -0.6).add(V3(0, 0.3, 0)) };
    // uma mão dele apoia no chão, a outra bate na coxa
    V.ikFixo.hand_l = { peso: 1, alvo: () => S.posMundo("spine_02").addScaledVector(esqS(), -0.32).setY(0.06), polo: () => V.posMundo("upperarm_l").add(V3(0, 0.2, 0)).addScaledVector(esqS(), -0.3) };
    V.ikFixo.hand_r = { peso: 1, alvo: () => {
      const base = S.posMundo("thigh_l").lerp(S.posMundo("calf_l"), 0.5).add(V3(0, 0.07, 0));
      return st.tapa ? base.add(V3(0, 0.07 * Math.max(0, Math.sin(st.t * 15)), 0)) : base.add(V3(0, 0.04, 0));
    }, polo: () => V.posMundo("upperarm_r").add(V3(0, -0.3, 0)).addScaledVector(esqS(), 0.3) };
    return { st, centro: () => V.posMundo("Head").lerp(S.posMundo("spine_03"), 0.5), lado: () => esqS().negate(), dist: 2.2, alt: 1.15,
      debate: () => { V.impacto("spine_01", esq0(V), (Math.random() - 0.5) * 0.35); S.impacto("spine_02", esqS(), (Math.random() - 0.5) * 0.2); },
      vencedorDeitado: true, perdedorDeitado: false };
  },
  /* chave de braço: quem estava em cima cai de costas, de lado pra quem está embaixo, pernas
     cruzando o peito e o rosto dele, e estica o braço contra o quadril */
  chave(S, V) {
    const c = centroFin(S, V), longV = dirAleatoria();
    poseFixa(S, "Laying_Idle"); poseFixa(V, "Laying_Idle");
    colocar(V, c, longV, true);
    const eV = eixosDeitado(V);
    colocar(S, V.posMundo("upperarm_r").addScaledVector(eV.esq, -0.12).addScaledVector(eV.long, 0.04), eV.esq.clone().negate(), true);
    const st = { aperto: 0, tapa: 0, t: 0, curva: 0.08, ponte: 0 };
    S.extras.add((dt) => { st.t += dt; });
    S.extras.add(curvarDeitado(S, { get ponte() { return 0.9 * st.aperto; }, get curva() { return st.curva - 0.1 * st.aperto; } }));
    const eVv = () => eixosDeitado(V);
    // qual perna dele fica do lado da cabeça de quem está preso
    const pernaRosto = S.posMundo("thigh_l").dot(eV.long) > S.posMundo("thigh_r").dot(eV.long) ? "l" : "r", pernaPeito = pernaRosto === "l" ? "r" : "l";
    S.ikFixo["ball_" + pernaRosto] = { peso: 1, alvo: () => V.posMundo("Head").addScaledVector(eVv().esq, 0.3).addScaledVector(eVv().long, 0.05).setY(0.12), polo: () => S.posMundo("thigh_" + pernaRosto).add(V3(0, 0.6, 0)) };
    S.ikFixo["ball_" + pernaPeito] = { peso: 1, alvo: () => V.posMundo("spine_02").addScaledVector(eVv().esq, 0.34).setY(0.12), polo: () => S.posMundo("thigh_" + pernaPeito).add(V3(0, 0.6, 0)) };
    // o braço preso estica pra cima, entre as coxas, e as duas mãos seguram o punho no peito
    const punho = () => S.posMundo("spine_03").add(V3(0, 0.2, 0)).addScaledVector(eixosDeitado(S).long, 0.08 * st.aperto);
    V.ikFixo.hand_r = { peso: 1, alvo: punho, polo: () => V.posMundo("upperarm_r").add(V3(0, 0.3, 0)).addScaledVector(eVv().long, 0.3) };
    for (const l of ["l", "r"]) S.ikFixo["hand_" + l] = { peso: 1, alvo: () => V.posMundo("hand_r").addScaledVector(eVv().long, 0.05 * lado(l)).add(V3(0, -0.04, 0)), polo: () => S.posMundo("upperarm_" + l).add(V3(0, -0.3, 0)).addScaledVector(eixosDeitado(S).esq, 0.3 * lado(l)) };
    // a outra mão bate na perna que cruza o peito
    V.ikFixo.hand_l = { peso: 1, alvo: () => {
      const base = S.posMundo("calf_" + pernaPeito).lerp(S.posMundo("foot_" + pernaPeito), 0.4).add(V3(0, 0.08, 0));
      return st.tapa ? base.add(V3(0, 0.07 * Math.max(0, Math.sin(st.t * 15)), 0)) : V.posMundo("spine_03").addScaledVector(eVv().esq, 0.2).add(V3(0, 0.15, 0));
    }, polo: () => V.posMundo("upperarm_l").addScaledVector(eVv().esq, 0.4) };
    return { st, centro: () => V.posMundo("upperarm_r").lerp(S.posMundo("pelvis"), 0.5).add(V3(0, 0.1, 0)), lado: () => eVv().long.clone().negate().addScaledVector(eVv().esq, 0.5).normalize(), dist: 2.3, alt: 1.3,
      debate: () => { V.impacto("thigh_l", eVv().esq, (Math.random() - 0.5) * 0.6); V.impacto("Head", eVv().long, (Math.random() - 0.5) * 0.5); },
      vencedorDeitado: true, perdedorDeitado: true };
  },
};

/* sorteia qual finalização, pelo lado de quem finaliza (em cima: chave ou mata-leão; embaixo: triângulo ou guilhotina) */
function tipoDeFinalizacao(atk) {
  const deCima = !montada || montada.atk === atk;
  return deCima ? sorteia(["chave", "mataLeao"]) : sorteia(["triangulo", "guilhotina"]);
}

async function finalizacao(atk, def, texto, tipo = tipoDeFinalizacao(atk)) {
  if (montada) { const m = montada; montada = null; m.cima.parar(); m.baixo.parar(); }
  travado = true;
  flashBranco();
  if (tipo === "mataLeao") return mataLeao(atk, def, texto);
  for (const L of [atk, def]) L.raiz.position.y = 0;
  const cena = FIN[tipo](atk, def);
  cam.modo = "fin"; cam.fin = cena;
  narrar(`${nomeDe(atk)} encaixa ${tipo === "chave" ? "a chave de braço" : tipo === "triangulo" ? "o triângulo" : "a guilhotina"}!`, true);
  await esperar(0.5); chamada(NOME_FIN[tipo]); som("sobe", 1);
  await animar(1.3, (k) => { cena.st.aperto = suave(k); });
  narrar(`${nomeDe(def)} tenta sair...`, true);
  for (let i = 0; i < 4; i++) { cena.debate(); palco.tremor = Math.max(palco.tremor, 0.008); await esperar(0.32); }
  cena.st.tapa = 1;
  narrar(`${nomeDe(def)} bate!`, true);
  for (let i = 0; i < 3; i++) { await esperar(0.42); palco.tremor = Math.max(palco.tremor, 0.01); }
  cena.st.tapa = 0;
  camLenta(true); chamada("FINALIZAÇÃO!"); som("explode", 1); vinheta(1);
  escala = 0.45; await esperar(1.0); escala = 1; camLenta(false);
  // o árbitro tira: os dois soltam; quem venceu levanta, quem bateu fica no chão
  for (const L of [atk, def]) { L.extras.clear(); L.ikFixo = {}; }
  vida(def, 0);
  if (cena.perdedorDeitado) def.umaVez("Writhing_In_Pain", { fade: 0.5, segurar: true, mover: false });
  else def.umaVez("Getting_Up", { casar: [3.8, 6.4], vel: 0.8, fade: 0.6, segurar: true });
  atk.umaVez("Getting_Up", { casar: [0, 3.2], vel: 1.35, fade: 0.5, segurar: true });
  // quem venceu levanta já se afastando de quem ficou no chão
  const longe = pelve(atk).sub(pelve(def)); if (longe.lengthSq() < 1e-4) longe.set(1, 0, 0); longe.normalize();
  const s0 = atk.raiz.position.clone();
  animar(1.8, (k) => { atk.raiz.position.copy(s0).addScaledVector(longe, 1.1 * suave(k)); });
  await esperar(0.6);
  cam.modo = "tv";
  await esperar(Math.max(0.3, (8.33 - atk.acao("Getting_Up").time) / 1.35 - 0.4));
  narrar(texto || `${nomeDe(atk)} vence por finalização.`, true);
  await cerimonia(atk, def);
}

async function mataLeao(atk, def, texto) {
  const de = 8.2, yaw = Math.random() * Math.PI * 2;
  const R = (v) => v.clone().applyAxisAngle(UP, yaw);
  const cA = atk.curva("Strangling", de), cV = def.curva("Being_Strangled", de);
  const C = new THREE.Vector3().addScaledVector(R(VO), -0.5).sub(R(new THREE.Vector3(cA[0], 0, cA[1])).multiplyScalar(0.5));
  for (const L of [atk, def]) { L.extras.clear(); L.ikFixo = {}; L.raiz.position.y = 0; }
  atk.raiz.rotation.y = yaw; def.raiz.rotation.y = yaw;
  atk.raiz.position.copy(C).add(R(new THREE.Vector3(cA[0], 0, cA[1])));
  def.raiz.position.copy(C).add(R(VO.clone().add(new THREE.Vector3(cV[0], 0, cV[1]))));
  atk.umaVez("Strangling", { de, fade: 0, segurar: true });
  def.umaVez("Being_Strangled", { de, fade: 0, segurar: true });
  const lv = V3(Math.cos(yaw), 0, -Math.sin(yaw)), fv = V3(Math.sin(yaw), 0, Math.cos(yaw));
  cam.modo = "fin"; cam.fin = { centro: () => { const n = def.posMundo("neck_01"); return n.setY(Math.max(0.5, n.y - 0.15)); }, lado: () => lv.clone().multiplyScalar(1.9).addScaledVector(fv, 1.5).normalize(), dist: 2.42, alt: 1.2 };
  narrar(`${nomeDe(atk)} pega as costas e encaixa o mata-leão!`, true);
  await esperar(0.5); chamada(NOME_FIN.mataLeao); som("sobe", 1);
  await esperar(2.2);
  narrar(`${nomeDe(def)} tenta tirar o braço...`, true);
  await esperar(0.9);
  // bate três vezes no braço de quem estrangula
  const tapa = { t: 0 };
  def.ikFixo.hand_l = { alvo: () => atk.posMundo("lowerarm_r").lerp(atk.posMundo("hand_r"), 0.3).add(V3(0, 0.05 + 0.07 * Math.max(0, Math.sin(tapa.t * 15)), 0)), peso: 0 };
  const fTapa = (dt) => { tapa.t += dt; def.ikFixo.hand_l.peso = Math.min(1, tapa.t * 3); };
  def.extras.add(fTapa);
  narrar(`${nomeDe(def)} bate!`, true);
  for (let i = 0; i < 3; i++) { await esperar(0.42); palco.tremor = Math.max(palco.tremor, 0.01); }
  def.extras.delete(fTapa); delete def.ikFixo.hand_l;
  camLenta(true); chamada("FINALIZAÇÃO!"); som("explode", 1); vinheta(1);
  // o árbitro tira: quem estrangulava solta e se afasta
  atk.estado(GUARDA, 0.6);
  const a0 = atk.raiz.position.clone(), fora = R(V3(0, 0, -1));
  animar(1.2, (k) => { atk.raiz.position.copy(a0).addScaledVector(fora, 0.8 * suave(k)); });
  escala = 0.45; await esperar(1.0); escala = 1; camLenta(false);
  await esperar(1.2);
  cam.modo = "tv";
  narrar(texto || `${nomeDe(atk)} vence por finalização.`, true);
  await cerimonia(atk, def);
}

/* ---------- o anúncio: o árbitro levanta a mão de quem venceu ----------
   Decisão (suspense): os três de frente, o árbitro segura o punho dos dois, a câmera fecha
   devagar e só então levanta a mão de quem venceu (pedido do dono: "o jogador fica apreensivo
   esperando a resposta"). Nocaute, nocaute técnico e finalização: o árbitro vem e levanta a mão
   na hora. Disputa de cinturão que o jogador ganha: ele levanta o cinturão. */
function segurar(L, mao, alvo) { L.ikFixo["hand_" + mao] = { alvo, peso: 1 }; }
async function cerimonia(venc, perd, { suspense = false } = {}) {
  if (montada) await separar({ narra: false });
  travado = true; ocupadoLance = true;
  for (const L of [A, B]) { L.ikFixo = {}; L.contatos.length = 0; L.molas.length = 0; L.alinhando = null; }
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // sempre o mesmo quadro (pedido do dono): um lutador de cada lado, o árbitro no meio segurando o punho
  // dos dois, todos de frente pra câmera; quem caiu já está de pé pro anúncio. O lado de cada um é
  // sorteado, pra posição não entregar quem venceu.
  flashBranco();
  const esq = Math.random() < 0.5 ? A : B, dir = esq === A ? B : A;
  esq.raiz.position.set(-0.72, 0, 0); dir.raiz.position.set(0.72, 0, 0); C.raiz.position.set(0, 0, 0.1);
  // tudo que estava tocando para (o nocaute deitado, a finalização, os controles do chão): todos em pé, parados
  for (const L of [A, B, C]) {
    L.extras.clear(); L.mixer.stopAllAction(); L.atual = null; L.movendo.clear();
    L.raiz.rotation.y = 0; L.raiz.position.y = 0; L.estado(PARADO, 0);
  }
  // de frente pra câmera (+z), a esquerda de cada um fica em +x: quem está à esquerda (x negativo) dá a
  // mão esquerda e o árbitro segura com a direita; do outro lado, ao contrário. Ninguém cruza o braço.
  const maoDentro = (L) => (L.raiz.position.x < 0 ? "l" : "r");
  const maoJuiz = (L) => (L.raiz.position.x < 0 ? "r" : "l");
  const pontos = [esq, dir].map((L) => { const s = Math.sign(L.raiz.position.x); return [L, maoDentro(L), maoJuiz(L), V(s * 0.38, 1.0, 0.16), V(s * 0.5, 2.05, 0.08)]; });
  cam.cerCentro = V(0, 0, 0);
  C.raiz.visible = true; C.ikFixo = {};
  const sobe = { k: 0, quem: null };
  for (const [L, mL, mC, baixo, alto] of pontos) {
    const ponto = () => baixo.clone().lerp(alto, L === sobe.quem ? suave(sobe.k) : 0);
    segurar(L, mL, ponto); segurar(C, mC, () => ponto().add(V(0, 0.03, 0.02)));
  }
  cam.modo = "cerimonia"; cam.cerFov = 42; palco.iniciado = false;
  if (suspense) {
    chamada("DECISÃO DOS JUÍZES", { pequena: true }); som("sobe", 0.8);
    await animar(2.8, (k) => { cam.cerFov = 42 - 12 * suave(k); });
    chamada("E O VENCEDOR...", { pequena: true });
    await esperar(1.3);
  } else await esperar(0.6);
  // a mão sobe
  sobe.quem = venc;
  await animar(0.35, (k) => { sobe.k = k; });
  chamada(String((venc === A ? op.nomes && op.nomes.a : op.nomes && op.nomes.b) || "VENCEDOR").toUpperCase());
  som("explode", 1); som("vitoria", 0.9); palco.agitar(1.5);
  await esperar(1.4);
  // solta: quem venceu comemora, quem perdeu lamenta (se estiver em pé), o árbitro dá um passo
  for (const L of [A, B, C]) L.ikFixo = {};
  venc.umaVez(Math.random() < 0.5 ? "Vitoria_Boxe" : "Comemora", { fade: 0.35, segurar: true, mover: false });
  perd.umaVez("Derrota_Boxe", { fade: 0.5, segurar: true, mover: false });
  const c0 = C.raiz.position.clone(); animar(0.8, (k) => { C.raiz.position.z = c0.z - 0.7 * suave(k); });
  cam.cerFov = 44;
  await esperar(2.2);
  if (op.titulo && venc === A) await levantarCinturao(venc);
}
async function levantarCinturao(L) {
  const cinto = modeloCinturao(); cinto.scale.setScalar(0.01); palco.cena.add(cinto);
  L.estado(PARADO, 0.3);
  const ponta = (s) => () => L.posMundo("Head").add(new THREE.Vector3(s * 0.34, 0.36, 0.06));
  L.ikFixo.hand_l = { alvo: ponta(1), peso: 0 }; L.ikFixo.hand_r = { alvo: ponta(-1), peso: 0 };
  // o cinturão vai pra onde as mãos vão (o IK roda depois deste passo: as mãos ainda estão embaixo aqui)
  L.extras.add(() => {
    const w = L.ikFixo.hand_l ? L.ikFixo.hand_l.peso : 0;
    const em = L.posMundo("hand_l").lerp(L.posMundo("hand_r"), 0.5), alto = ponta(1)().lerp(ponta(-1)(), 0.5);
    cinto.position.copy(em.lerp(alto, w)).add(new THREE.Vector3(0, 0.02, 0.04));
    cinto.rotation.set(0, L.raiz.rotation.y, 0);
  });
  chamada("CAMPEÃO!"); som("explode", 1); palco.agitar(1.5);
  await animar(0.7, (k) => { const s = suave(k); cinto.scale.setScalar(Math.max(0.01, s)); L.ikFixo.hand_l.peso = L.ikFixo.hand_r.peso = s; });
  await esperar(3.2);
}
/* nocaute técnico: o árbitro entra no meio e acena que acabou */
async function interrupcao(venc, perd) {
  C.raiz.visible = true; C.ikFixo = {};
  const m = venc.raiz.position.clone().add(perd.raiz.position).multiplyScalar(0.5);
  C.raiz.position.set(m.x + 0.2, 0, m.z + 0.35); C.raiz.rotation.y = 0; C.estado(PARADO, 0);
  const t = { v: 0 }, cr = () => C.posMundo("spine_03").add(new THREE.Vector3(0, 0.12, 0.38));
  C.ikFixo.hand_l = { alvo: () => cr().add(new THREE.Vector3(0.3 * Math.cos(t.v * 9), 0.1, 0)), peso: 1 };
  C.ikFixo.hand_r = { alvo: () => cr().add(new THREE.Vector3(-0.3 * Math.cos(t.v * 9), 0.06, 0)), peso: 1 };
  chamada("NOCAUTE TÉCNICO!"); som("explode", 1); palco.agitar(1.3);
  await animar(1.5, (k) => { t.v = k * 1.5; });
  C.ikFixo = {};
}

/* ---------- knockdown e nocaute ---------- */
async function knockdown(atk, def) {
  cam.modo = "perto";
  // cai de costas (o trecho da queda do Knocked_Out) e levanta pelo Getting_Up a partir da pose mais parecida
  await golpe(atk, def, "gancho", { reacao: "Knocked_Out", segurarReacao: true, deReacao: 0.95, narra: false });
  narrar(`${nomeDe(def)} foi ao chão!`, true);
  chamada("KNOCKDOWN!"); som("explode", 0.9); vinheta(1);
  cam.modo = "tv";
  travado = true;
  await esperar(0.8);
  def.umaVez("Getting_Up", { casar: [0, 3.2], vel: 1.3, fade: 0.5, segurar: true });
  narrar(`${nomeDe(def)} levantou cambaleando.`, true);
  await esperar(Math.max(0.3, (8.33 - def.acao("Getting_Up").time) / 1.3 - 0.45));
  // de pé, ainda tonto: balança um pouco antes de levantar a guarda
  def.umaVez("Tonto", { fade: 0.45, de: 0.4, ate: 1.9, segurar: true, mover: false });
  await esperar(1.2);
  def.estado(GUARDA, 0.45);
  travado = false;
  cam.modo = "tv";
  await ajustarDist(1.7, 0.9);
}
async function nocaute(atk, def, { combinacao = true, textoFim = null } = {}) {
  cam.modo = "perto";
  if (combinacao) { narrar(`${nomeDe(atk)} pressiona com jab e direto...`); await golpe(atk, def, "umDois", { narra: false }); }
  const g = GOLPES.gancho;
  await ajustarDist(g.dist, 0.3);
  narrar(`${nomeDe(atk)} solta o cruzado...`);
  atk.umaVez(g.clip, { fade: 0.12, volta: 0.4 });
  atk.contato(g.membro, alvoDe(atk, def, "cabeca"), g.imp);
  await esperar(g.imp - 0.03);
  const u = pelve(def).sub(pelve(atk)).normalize(), perp = new THREE.Vector3(-u.z, 0, u.x);
  if (perp.dot(plano(palco.cam.position).sub(pelve(def))) < 0) perp.negate();
  cam.koPos = pelve(def).addScaledVector(perp, 2.8).addScaledVector(u, 0.9).setY(1.15); cam.koAlvo = def; cam.modo = "ko";
  acertar(atk, def, g.membro, 2.2, "cabeca");
  def.umaVez("Knocked_Out", { fade: 0.05, de: 0.95, segurar: true });
  narrar("Nocaute!", true);
  flashBranco(); chamada("NOCAUTE!"); som("explode", 1); vida(def, 0); camLenta(true);
  escala = 0.3;
  await esperar(0.9);
  await animar(0.5, (k) => { escala = 0.3 + 0.7 * k; });
  escala = 1; camLenta(false);
  await esperar(2.4);
  cam.modo = "tv";
  narrar(textoFim || `${nomeDe(atk)} vence por nocaute.`, true);
  travado = true;
  await cerimonia(atk, def);
}

/* ---------- luta simulada: o motor da carreira decide, o 3D mostra ----------
   Cada linha do log do motor vira um lance. O motor anda de 15 em 15 s; a "janela"
   resume 1 minuto de trocação com quantos golpes cada um acertou. */
const sorteia = (l) => l[Math.floor(Math.random() * l.length)];
const EM_PE = ["jab", "jab", "umDois", "direto", "gancho", "cruzadoFrente", "jabCorpo", "upper", "chuteBaixo", "chuteCorpo", "chuteCabeca"];
async function trocacao(a, b) {
  const nA = a ? Math.min(2, Math.ceil(a / 5)) : 0, nB = b ? Math.min(2, Math.ceil(b / 5)) : 0;
  if (!nA && !nB) { A.umaVez("Jab", { peso: 0.35, ate: 0.32, fade: 0.15, volta: 0.25, mover: false }); await esperar(1.6); return; }
  const fila = [];
  for (let i = 0; i < Math.max(nA, nB); i++) { if (i < nA) fila.push([A, B]); if (i < nB) fila.push([B, A]); }
  if (b > a) fila.reverse();
  for (const [atk, def] of fila) {
    const cam0 = cam.modo; const g = sorteia(EM_PE);
    if (g.startsWith("chute")) cam.modo = "perto";
    await golpe(atk, def, g, { bloqueio: Math.random() < 0.18, narra: false });
    cam.modo = cam0; await esperar(0.35);
  }
}
async function quedaDefendida(atk, def) {
  await ajustarDist(1.25, 0.4);
  atk.umaVez("Double_Leg_Takedown___Attacker", { ate: 0.75, fade: 0.12, volta: 0.35 });
  await esperar(0.25);
  def.umaVez("Passo_Tras", { fade: 0.12, volta: 0.3 });
  await esperar(0.8);
  await ajustarDist(1.7, 0.6);
}
/* ---------- estudo: fintas enquanto ninguém está num lance ---------- */
let estudo = 1.5;
function estudar(dt) {
  if (ocupadoLance || travado) return;
  estudo -= dt; if (estudo > 0) return;
  estudo = 1.4 + Math.random() * 1.8;
  const L = Math.random() < 0.5 ? A : B;
  if (L.nomeEstado !== GUARDA) return;
  // finta de jab, um passo lateral (os dois giram, porque um sempre encara o outro) ou mexe a distância
  const x = Math.random();
  if (x < 0.4) L.umaVez("Jab", { peso: 0.35, ate: 0.32, fade: 0.15, volta: 0.25, mover: false });
  else if (x < 0.75) {
    // passo lateral: a animação no lugar e o corpo anda de lado (o clipe do Mixamo anda pra frente também,
    // e os dois acabavam colados); como um sempre encara o outro, os dois giram
    const esq = Math.random() < 0.5, O = L === A ? B : A;
    const u = plano(O.raiz.position).sub(plano(L.raiz.position)).normalize(), lado = new THREE.Vector3(-u.z, 0, u.x).multiplyScalar(esq ? 1 : -1);
    L.umaVez(esq ? "Lateral_Esq" : "Lateral_Dir", { fade: 0.18, volta: 0.25, mover: false });
    const p0 = L.raiz.position.clone();
    animar(0.9, (k) => { L.raiz.position.copy(p0).addScaledVector(lado, 0.38 * suave(k)); });
  }
  else { const d0 = dist(), alvo = Math.min(1.9, Math.max(1.45, d0 + (Math.random() < 0.5 ? -0.15 : 0.15))); ajustarDist(alvo, 0.9); }
}

/* ---------- entrada (walkout): o jogador sai do corredor com a roupa escolhida, sobe a escada do
   octógono e, lá dentro, tira a roupa e encara o adversário. Uns 8 s em 1x; pular() vai direto
   pro fim. O adversário espera no octógono. */
let cortarEntrada = null;
async function entrada() {
  const CHAO = -1.25, corte = new Promise((ok) => { cortarEntrada = ok; });
  let pulou = false; corte.then(() => { pulou = true; });
  const espera = (p) => Promise.race([p, corte]);
  travado = true; ocupadoLance = true;
  B.raiz.position.set(0, 0, -1.0); B.raiz.rotation.y = 0; B.estado(GUARDA, 0);
  A.raiz.position.set(-0.32, CHAO, 11.0); A.raiz.rotation.y = Math.PI; A.estado("Caminhada_Marra", 0, 0.85);
  cam.modo = "entrada"; cam.entradaAlvo = A; palco.iniciado = false;
  palco.seguidor.intensity = 260; palco.agitar(0.9); som("sobe", 0.7);
  if (op.nomes && op.nomes.a) chamada(op.nomes.a, { pequena: true });
  // o andar: a velocidade sai do próprio clipe (quanto o quadril anda por ciclo), sem o pé deslizar
  const c = A.curva("Caminhada_Marra", A.dur("Caminhada_Marra")), vel = Math.max(0.8, Math.hypot(c[0], c[1]) / A.dur("Caminhada_Marra") * 0.85);
  const segue = () => { const p = A.posMundo("spine_03"); palco.seguidor.position.set(p.x + 1.5, 8.5, p.z + 3.5); palco.seguidor.target.position.copy(p); };
  const andar = (z0, z1, y0, y1) => animar(Math.abs(z0 - z1) / vel, (k) => { A.raiz.position.z = z0 + (z1 - z0) * k; A.raiz.position.y = y0 + (y1 - y0) * k; segue(); });
  await espera(andar(11.0, 7.3, CHAO, CHAO));
  if (!pulou) await espera(andar(7.3, 5.95, CHAO, 0));   // a escada
  // dentro do octógono: tira a roupa, levanta a torcida, os dois se encaram
  palco.seguidor.intensity = 0;
  if (!pulou) flashBranco();
  A.raiz.position.set(0, 0, 0.7); A.raiz.rotation.y = Math.PI; A.raiz.position.y = 0;
  cam.modo = "tv"; palco.iniciado = false;
  if (pulou) { A.tirarRoupa(0); A.estado(GUARDA, 0); travado = false; ocupadoLance = false; return; }
  A.umaVez("Soca_Ar", { fade: 0.3, ate: 1.9, segurar: true, mover: false }); A.tirarRoupa(0.9);
  B.umaVez("Provoca", { fade: 0.3, volta: 0.3, mover: false });
  palco.agitar(1.2); som("explode", 0.6);
  await espera(esperar(1.9));
  A.tirarRoupa(0); A.estado(GUARDA, 0.4);
  travado = false; ocupadoLance = false;
  await espera(ajustarDist(1.7, 0.5));
}

/* ---------- uma linha do log do jogo vira um lance ----------
   A linha traz o evento (ev: tipo e quem, "A" é o jogador). A promessa só resolve
   quando o lance acabou, e o jogo espera por ela antes da próxima linha. */
const de = (q) => (q === "B" ? [B, A] : [A, B]);
async function lance(L) {
  const ev = (L && L.ev) || {};
  /* sem entrada (Rever luta, 3D ligado no meio, Online): a roupa já saiu. Os
     dois lados: no Online o adversário também é um jogador com roupa de entrada */
  for (const L of [A, B]) if (L.vestido) L.tirarRoupa(0);
  const [atk, def] = de(ev.quem);
  ocupadoLance = true;
  try {
    switch (ev.tipo) {
      case "inicio":
        if (montada) await separar({ narra: false });
        chamada(`ROUND ${L.round}`); som("sinoIni", 0.8); palco.placar({ round: L.round });
        await ajustarDist(1.7, 0.6); await esperar(0.6); break;
      case "janela": await trocacao(ev.a, ev.b); break;
      case "quedaDefendida": await quedaDefendida(atk, def); break;
      case "queda": if (montada) await separar({ narra: false }); await queda(atk, def, { soco: false }); await serieSocos(2); break;
      case "controle": await serieSocos(2); break;
      case "gnp": await serieSocos(5, true); break;
      case "sub": if (montada) await tentativaChao(montada.atk === atk ? "cima" : "baixo"); else await esperar(0.8); break;
      case "levantou": await expulsar(); break;
      case "kd": if (montada) await separar({ narra: false }); await knockdown(atk, def); break;
      case "fimRound": if (montada) await separar({ narra: false }); som("sinoFim", 0.8); await esperar(0.6); break;
      case "fim":
        if (ev.metodo === "Nocaute") { if (montada) await separar({ narra: false }); await nocaute(atk, def, { combinacao: false }); }
        else if (ev.metodo === "Finalização") await finalizacao(atk, def);
        else {
          // nocaute técnico no chão: chuva de socos por cima até o árbitro parar
          if (montada) await serieSocos(6, true);
          await interrupcao(atk, def);
          await cerimonia(atk, def);
        }
        break;
      /* ---- eventos do Online (uma troca vira uns poucos lances) ---- */
      case "golpe1": {
        if (montada) await separar({ narra: false });
        const f = ev.forca || 3, lista = f >= 8 ? ["gancho", "upper", "chuteCabeca", "direto"] : f >= 4 ? ["direto", "umDois", "cruzadoFrente", "chuteBaixo", "chuteCorpo"] : ["jab", "jab", "jabCorpo", "chuteBaixo"];
        await golpe(atk, def, ev.golpe || sorteia(lista), { bloqueio: !!ev.bloqueio, narra: false }); break;
      }
      case "gnp1": if (!montada) await queda(atk, def, { soco: false }); await serieSocos(ev.forte ? 2 : 1, !!ev.forte); break;
      case "grogue": {   // quem ficou tonto é o "quem" (não quem bateu)
        const L = ev.quem === "B" ? B : A;
        if (!montada) { L.umaVez("Tonto", { fade: 0.3, de: 0.4, ate: 1.8, volta: 0.4, mover: false }); await esperar(1.0); }
        break;
      }
      case "estudo": {
        const L = Math.random() < 0.5 ? A : B;
        if (!montada) L.umaVez("Jab", { peso: 0.35, ate: 0.32, fade: 0.15, volta: 0.25, mover: false });
        await esperar(0.9); break;
      }
      case "raspou": if (montada) await separar({ narra: false }); await queda(atk, def, { soco: false }); break;
      case "separa": if (montada) await separar({ narra: false }); break;
      case "decisao": await cerimonia(atk, def, { suspense: true }); break;
      default: break;
    }
  } finally { ocupadoLance = false; }
}

/* ---------- laço ---------- */
const relogioReal = new THREE.Clock();
let vel = 1, vivo = true, quadro = 0;
function mundo(dt) {
  for (const t of tweens.slice()) { t.t += dt; const k = Math.min(1, t.t / t.dur); t.fn(k); if (k >= 1) { tweens.splice(tweens.indexOf(t), 1); t.ok(); } }
  estudar(dt); voltarAoCentro(dt); encarar(dt);
  A.update(dt); B.update(dt);
  if (C.raiz.visible) C.update(dt);
  manterDistancia();
}
/* qualidade automática: aparelho que não chega a 45 quadros por segundo perde,
   um degrau a cada 2 s, resolução, depois sombra, depois a torcida (só desce) */
let medidos = 0, somaMedida = 0, aquecendo = 2;
function medirQualidade(dtBruto) {
  if (aquecendo > 0) { aquecendo -= dtBruto; return; }
  medidos++; somaMedida += dtBruto;
  if (somaMedida < 2) return;
  if (medidos / somaMedida < 45) palco.qualidade(palco.nivel + 1);
  medidos = 0; somaMedida = 0;
}
function laco() {
  if (!vivo) return;
  // até 1/10 s por quadro: num aparelho lento a luta segue no tempo certo (só fica menos fluida);
  // com 1/20 ela andava em câmera lenta abaixo de 20 quadros por segundo (achado do dono)
  const dtBruto = relogioReal.getDelta(), dtReal = Math.min(dtBruto, 1 / 10);
  medirQualidade(Math.min(dtBruto, 0.5));
  let fator = escala; if (pausa > 0) { pausa -= dtReal; fator = 0.04; }
  tempo += dtReal;
  mundo(dtReal * fator * vel);
  dirigir(dtReal);
  palco.quadro(dtReal, tempo);
  quadro = requestAnimationFrame(laco);
}
laco();

return {
  lance,
  entrada,
  pularEntrada() { if (cortarEntrada) cortarEntrada(); },
  /* só pras ferramentas de conferência (ferramentas/): os lutadores, a câmera e o palco */
  _dev: { A, B, cam, palco, THREE, MONTADA, get montada() { return montada; } },
  velocidade(v) { vel = Math.max(0.5, Math.min(3, Number(v) || 1)); },
  destruir() {
    vivo = false; cancelAnimationFrame(quadro); clearTimeout(timerCham);
    tweens.length = 0;   // as promessas pendentes nunca resolvem: quem esperava confere o token da carreira
    palco.destruir();
    raiz.classList.remove("luta3d", "lenta");
    for (const e of [elPalco, elVin, elFlash, elCham]) e.remove();
  },
};
}
