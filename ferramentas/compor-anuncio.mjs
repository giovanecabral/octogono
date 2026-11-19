/* Compositor dos anúncios (2026-11-19, pedido do dono: "faça anúncios de verdade que chamam a atenção").
   Pega trechos das gravações do gravar-anuncio.mjs (completa.mp4), monta cada quadro numa página no Chrome
   (fontes do jogo, texto animado, flash, tremor, câmera lenta com mistura de quadros) e fecha no ffmpeg com
   a música e os efeitos de audio/ (só CC0: a torcida é CC BY e pediria crédito no anúncio).

   Uso: node ferramentas/compor-anuncio.mjs <roteiro.mjs> <saida.mp4>
   O roteiro exporta default { W, H, dur, musica: {arq, ini, vol}, clipes: {id: {arq, ini, fim, crop}},
   cenas: [...], textos: [...], flashes: [...], sfx: [...], capa }. Tudo em segundos do anúncio, menos
   clipes (segundos da gravação). Uma cena: {ini, fim, clipe, de (segundo do clipe no ini), vel (ou
   [[t, vel], ...] por trecho), zoom: [z0, z1], foco: [x, y] (0 a 1), tremor: [[t, força], ...]}.
   Com caixa: [x, y, l, a] (fração da tela), a cena vira uma janela com borda sobre o mesmo quadro desfocado;
   o clipe dela leva tam: [l, a] em pixels (o tamanho da janela). Um texto: {ini, fim, linhas: [{t, cor?, tam?}], anim: "slam" | "sobe", y (0 a 1), fundo?}.
   O fim do anúncio (cartaz) é {cartaz: {ini}}: logo, nome, frase e o botão. Nada vai pro deploy
   (ferramentas/ está no .vercelignore). */
import { spawn, spawnSync } from "node:child_process"; import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const FFMPEG = process.env.FFMPEG || "/opt/homebrew/bin/ffmpeg";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [, , arqRoteiro, saida] = process.argv;
if (!arqRoteiro || !saida) { console.log("uso: node ferramentas/compor-anuncio.mjs <roteiro.mjs> <saida.mp4>"); process.exit(1); }
const R = (await import(pathToFileURL(path.resolve(arqRoteiro)).href)).default;
const QPS = 30, W = R.W, H = R.H, N = Math.round(R.dur * QPS);
const TRAB = fs.mkdtempSync(path.join(os.tmpdir(), "compor-"));
const ff = (args) => { const r = spawnSync(FFMPEG, ["-y", "-loglevel", "error", ...args], { stdio: "inherit" }); if (r.status !== 0) throw new Error("ffmpeg falhou: " + args.join(" ")); };

/* 1. os quadros de cada clipe, recortados e escalados pra cobrir a tela (30 por segundo) */
for (const [id, c] of Object.entries(R.clipes)) {
  const dir = path.join(TRAB, "c_" + id); fs.mkdirSync(dir);
  const [cw, ch2] = c.tam || [W, H];
  const cobre = `scale=${cw}:${ch2}:force_original_aspect_ratio=increase,crop=${cw}:${ch2}`;
  ff(["-ss", String(c.ini), "-to", String(c.fim), "-i", c.arq, "-vf", `fps=${QPS},${c.crop ? "crop=" + c.crop + "," : ""}${cobre}`, "-q:v", "3", path.join(dir, "%05d.jpg")]);
  c.n = fs.readdirSync(dir).length;
  console.log(`clipe ${id}: ${c.n} quadros`);
}
fs.copyFileSync(path.join(RAIZ, "img", "logo", "simbolo.svg"), path.join(TRAB, "simbolo.svg"));
fs.copyFileSync(path.join(RAIZ, "img", "logo", "palavra.svg"), path.join(TRAB, "palavra.svg"));

/* 2. a página: render(t) desenha o quadro do instante t, sem animação de CSS (tudo sai de t) */
const pagina = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Barlow+Condensed:wght@600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#07080B}
#palco{position:absolute;inset:0;overflow:hidden}
#fundo{position:absolute;inset:-6%;width:112%;height:112%;object-fit:cover;filter:blur(${Math.round(W * .03)}px) brightness(.38) saturate(1.2);opacity:0}
#janela{position:absolute;inset:0;overflow:hidden}
#janela.caixa{border:${Math.max(3, Math.round(W * .005))}px solid #D7261E;box-shadow:0 ${Math.round(W * .02)}px ${Math.round(W * .08)}px rgba(0,0,0,.8),0 0 ${Math.round(W * .05)}px rgba(215,38,30,.35)}
.cam{position:absolute;inset:0;will-change:transform}
.cam img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
#vinheta{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,transparent 45%,rgba(0,0,0,.72) 100%);pointer-events:none}
#escuro{position:absolute;inset:0;background:#07080B;opacity:0}
#flash{position:absolute;inset:0;opacity:0}
.txt{position:absolute;left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:${Math.round(W * 0.01)}px;text-align:center;padding:0 ${Math.round(W * 0.07)}px}
.lin{font-family:Anton,Impact,sans-serif;text-transform:uppercase;line-height:.95;color:#F2EEE6;letter-spacing:.01em;
  text-shadow:0 ${Math.round(W * .006)}px 0 rgba(0,0,0,.55),0 0 ${Math.round(W * .04)}px rgba(0,0,0,.65);white-space:nowrap}
.lin.sangue{color:#E8362D}.lin.ouro{color:#D4A017}
.lin.faixa{background:#D7261E;color:#F2EEE6;padding:.08em .28em .02em;text-shadow:none;transform-origin:center}
.ui{font-family:"Barlow Condensed",sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
#cartaz{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(H * .022)}px;opacity:0;
  background:radial-gradient(ellipse at 50% 40%,#2a0b09 0%,#07080B 62%)}
#cartaz .raios{position:absolute;inset:-30%;background:repeating-conic-gradient(from 0deg at 50% 50%,rgba(215,38,30,.16) 0deg 6deg,transparent 6deg 18deg)}
#cartaz img.simb{width:${Math.round(W * .34)}px;position:relative}
#cartaz img.pal{width:${Math.round(W * .7)}px;position:relative}
#cartaz .frase{position:relative;font-size:${Math.round(W * .052)}px;color:#F2EEE6}
#cartaz .frase b{color:#E8362D;font-weight:800}
#cartaz .botao{position:relative;margin-top:${Math.round(H * .012)}px;background:#D7261E;color:#F2EEE6;font-size:${Math.round(W * .068)}px;padding:.32em 1.1em .26em;
  clip-path:polygon(0 0,100% 0,100% 70%,92% 100%,0 100%);box-shadow:0 0 ${Math.round(W * .06)}px rgba(232,54,45,.55)}
#cartaz .url{position:relative;font-size:${Math.round(W * .044)}px;color:#C9CBD2;letter-spacing:.12em}
</style></head><body><div id="palco"><img id="fundo"><div id="janela"><div class="cam" id="cam"><img id="q0"><img id="q1"></div></div></div>
<div id="vinheta"></div><div id="escuro"></div><div id="textos"></div>
<div id="cartaz"><div class="raios"></div><img class="simb" src="simbolo.svg"><img class="pal" src="palavra.svg">
<p class="frase ui">${R.cartaz.frase || ""}</p><p class="botao ui">${R.cartaz.botao || "Jogue agora"}</p><p class="url ui">${R.cartaz.url || "octogono.fun"}</p></div>
<div id="flash"></div>
<script>
const R=${JSON.stringify(R)},W=${W},H=${H},QPS=${QPS};
const cl=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),ease=x=>1-Math.pow(1-cl(x),3),lerp=(a,b,x)=>a+(b-a)*x;
/* tempo do clipe: a velocidade pode mudar por trecho ([[t, vel]...], t do anúncio) */
function tempoClipe(c,t){
  const v=Array.isArray(c.vel)?c.vel:[[c.ini,c.vel||1]];
  let tc=c.de,ant=c.ini,vel=v[0][1];
  for(const [tv,vv] of v){ if(tv>t)break; tc+=(tv-ant)*vel; ant=tv; vel=vv; }
  return tc+(t-ant)*vel;
}
function tremorEm(c,t){
  let f=0; for(const [tt,forca] of (c.tremor||[])){ const d=t-tt; if(d>=0&&d<.35)f+=forca*(1-d/.35); }
  return f;
}
const textos=document.getElementById("textos");
for(const [i,x] of R.textos.entries()){
  const d=document.createElement("div"); d.className="txt"; d.id="t"+i; d.style.top=(x.y*H)+"px"; d.style.transform="translateY(-50%)";
  for(const l of x.linhas){ const s=document.createElement("p"); s.className="lin "+(l.cor||""); s.style.fontSize=((l.tam||.14)*W)+"px"; s.innerHTML=l.t; d.appendChild(s); }
  textos.appendChild(d);
}
window.render=async function(t){
  const cena=R.cenas.find(c=>t>=c.ini&&t<c.fim)||R.cenas[R.cenas.length-1];
  const c=R.clipes[cena.clipe],tc=tempoClipe(cena,t),fq=cl(tc*QPS,0,c.n-1),i0=Math.floor(fq),fr=fq-i0;
  const q0=document.getElementById("q0"),q1=document.getElementById("q1");
  const src=i=>"c_"+cena.clipe+"/"+String(Math.min(c.n,i+1)).padStart(5,"0")+".jpg";
  q0.src=src(i0); q1.src=src(Math.min(c.n-1,i0+1)); q1.style.opacity=fr.toFixed(3);
  /* janela (caixa: [x, y, l, a] em fração da tela): o trecho nítido num quadro, o mesmo desfocado no fundo */
  const jan=document.getElementById("janela"),fun=document.getElementById("fundo");
  if(cena.caixa){ const [x,y,l,a]=cena.caixa,e=ease((t-cena.ini)/.25);
    jan.className="caixa"; jan.style.cssText="left:"+x*W+"px;top:"+(y*H+lerp(H*.04,0,e))+"px;width:"+l*W+"px;height:"+a*H+"px;opacity:"+cl((t-cena.ini)/.12);
    fun.src=q0.src; fun.style.opacity=1; }
  else { jan.className=""; jan.style.cssText=""; fun.style.opacity=0; }
  const p=(t-cena.ini)/Math.max(.001,cena.fim-cena.ini),z=cena.zoom?lerp(cena.zoom[0],cena.zoom[1],p):1,f=cena.foco||[.5,.5];
  const tr=tremorEm(cena,t),sx=tr?Math.sin(t*97)*tr*W*.02:0,sy=tr?Math.cos(t*83)*tr*W*.02:0;
  const jw=cena.caixa?cena.caixa[2]*W:W,jh=cena.caixa?cena.caixa[3]*H:H;
  document.getElementById("cam").style.transform="translate("+((.5-f[0])*(z-1)*jw+sx)+"px,"+((.5-f[1])*(z-1)*jh+sy)+"px) scale("+z+")";
  /* flashes: cor e duração */
  let fo=0,fc="#fff"; for(const fl of R.flashes){ const d=t-fl.t; if(d>=0&&d<fl.dur){ const o=(fl.forca||1)*(1-d/fl.dur); if(o>fo){fo=o;fc=fl.cor||"#fff";} } }
  const fe=document.getElementById("flash"); fe.style.opacity=fo.toFixed(3); fe.style.background=fc;
  /* escurecer pro cartaz */
  const ini=R.cartaz.ini,ca=document.getElementById("cartaz");
  ca.style.opacity=cl((t-ini)/.25).toFixed(3);
  const k=t-ini;
  ca.querySelector(".simb").style.transform="scale("+lerp(1.9,1,ease(k/.35))+") rotate("+lerp(-25,0,ease(k/.45))+"deg)";
  ca.querySelector(".pal").style.cssText="opacity:"+cl((k-.25)/.2)+";transform:translateY("+lerp(40,0,ease((k-.25)/.3))+"px)";
  ca.querySelector(".frase").style.cssText="opacity:"+cl((k-.55)/.2)+";transform:translateY("+lerp(30,0,ease((k-.55)/.3))+"px)";
  const pul=k>1.1?1+.045*Math.max(0,Math.sin((k-1.1)*Math.PI*1.49)):lerp(.6,1,ease((k-.8)/.25));
  ca.querySelector(".botao").style.cssText="opacity:"+cl((k-.8)/.15)+";transform:scale("+pul+")";
  ca.querySelector(".url").style.cssText="opacity:"+cl((k-1)/.2);
  ca.querySelector(".raios").style.transform="rotate("+(k*8)+"deg)";
  /* textos */
  for(const [i,x] of R.textos.entries()){
    const d=document.getElementById("t"+i),a=t-x.ini,b=x.fim-t;
    if(a<0||b<0){ d.style.opacity=0; continue; }
    d.style.opacity=cl(b/.08);
    [...d.children].forEach((s,j)=>{
      const aj=a-j*(x.passo!=null?x.passo:.12);
      if(aj<0){ s.style.opacity=0; return; }
      s.style.opacity=1;
      if(x.anim==="slam"){ const e=ease(aj/.14),tm=aj<.3?Math.sin(aj*120)*(1-aj/.3)*W*.008:0;
        s.style.transform="translate("+tm+"px,0) scale("+lerp(2.4,1,e)+")"; s.style.opacity=cl(aj/.06); }
      else { s.style.transform="translateY("+lerp(W*.06,0,ease(aj/.22))+"px)"; s.style.opacity=cl(aj/.15); }
    });
  }
  await Promise.all([q0,q1,fun].map(im=>im.decode().catch(()=>{})));
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
};
</script></body></html>`;
fs.writeFileSync(path.join(TRAB, "index.html"), pagina);

/* 3. Chrome sem cabeça pelo protocolo de depuração (o mesmo cliente mínimo do gravador) */
const dirPerfil = fs.mkdtempSync(path.join(os.tmpdir(), "compor-perfil-"));
const portaCh = 9372;
const ch = spawn(process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${portaCh}`, `--user-data-dir=${dirPerfil}`,
  "--hide-scrollbars", "--allow-file-access-from-files", "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
let wsUrl = null;
for (let i = 0; i < 100 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${portaCh}/json/version`)).json()).webSocketDebuggerUrl; } catch {} if (!wsUrl) await esperar(200); }
const sock = new WebSocket(wsUrl); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
let seq = 0; const pend = new Map();
sock.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const { ok, erro } = pend.get(d.id); pend.delete(d.id); d.error ? erro(new Error(d.error.message)) : ok(d.result); } };
const enviar = (method, params = {}, sessionId) => new Promise((ok, erro) => { const id = ++seq; pend.set(id, { ok, erro }); sock.send(JSON.stringify({ id, method, params, sessionId })); });
try {
  const { targetId } = await enviar("Target.createTarget", { url: "about:blank" });
  const { sessionId: S } = await enviar("Target.attachToTarget", { targetId, flatten: true });
  await enviar("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false }, S);
  await enviar("Page.enable", {}, S);
  await enviar("Page.navigate", { url: pathToFileURL(path.join(TRAB, "index.html")).href }, S);
  const avaliar = async (expr) => { const r = await enviar("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, S); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
  for (let i = 0; i < 100; i++) { if (await avaliar("document.readyState").catch(() => "") === "complete") break; await esperar(150); }
  const fontes = await avaliar(`document.fonts.ready.then(()=>[...document.fonts].filter(f=>f.status==="loaded").map(f=>f.family).join(","))`);
  if (!/Anton/.test(fontes)) throw new Error("a fonte Anton não carregou (precisa de internet): " + fontes);
  /* 4. quadro a quadro */
  const QD = path.join(TRAB, "quadros"); fs.mkdirSync(QD);
  for (let i = 0; i < N; i++) {
    await avaliar(`render(${(i / QPS).toFixed(4)})`);
    const { data } = await enviar("Page.captureScreenshot", { format: "jpeg", quality: 93 }, S);
    fs.writeFileSync(path.join(QD, String(i).padStart(5, "0") + ".jpg"), Buffer.from(data, "base64"));
    if (i % 90 === 0) console.log(`quadro ${i}/${N}`);
  }
} finally { try { sock.close(); } catch {} ch.kill(); }

/* 5. o vídeo, a música e os efeitos */
const ent = ["-framerate", String(QPS), "-i", path.join(TRAB, "quadros", "%05d.jpg"),
  "-ss", String(R.musica.ini), "-t", String(R.dur), "-i", R.musica.arq];
const filtros = [`[1:a]volume=${R.musica.vol || 0.8},afade=t=out:st=${(R.dur - 0.7).toFixed(2)}:d=0.7[m]`];
R.sfx.forEach((s, i) => { ent.push("-i", s.arq); const ms = Math.round(s.t * 1000); filtros.push(`[${i + 2}:a]volume=${s.vol || 0.8},adelay=${ms}|${ms}[s${i}]`); });
filtros.push(`[m]${R.sfx.map((_, i) => `[s${i}]`).join("")}amix=inputs=${R.sfx.length + 1}:normalize=0:duration=first,alimiter=limit=0.95[a]`);
fs.mkdirSync(path.dirname(path.resolve(saida)), { recursive: true });
ff([...ent, "-filter_complex", filtros.join(";"), "-map", "0:v", "-map", "[a]", "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p",
  "-profile:v", "high", "-r", String(QPS), "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", saida]);
if (R.capa != null) ff(["-ss", String(R.capa), "-i", saida, "-frames:v", "1", saida.replace(/\.mp4$/, ".png")]);
console.log(`pronto: ${saida} (${R.dur} s, ${(fs.statSync(saida).size / 1e6).toFixed(1)} MB)`);
fs.rmSync(TRAB, { recursive: true, force: true }); fs.rmSync(dirPerfil, { recursive: true, force: true });
