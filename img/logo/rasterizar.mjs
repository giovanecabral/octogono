/* PNG do logo do Octógono a partir dos SVG de img/logo (gerar.py):
   - icone-32.png: favicon em PNG (navegador sem SVG no favicon);
   - apple-touch-icon.png: 180x180, fundo da noite (o iPhone não usa transparência);
   - compartilhar.png: 1200x630, o card que aparece quando alguém manda o link.
   Uso (Chrome instalado; puppeteer-core numa pasta qualquer, como em
   img/tutorial/capturar.mjs):
     cd <pasta com puppeteer-core>
     node <repo>/img/logo/rasterizar.mjs */
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(path.join(process.cwd(), "x.js"));
const puppeteer = require("puppeteer-core");
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const IMG = path.dirname(AQUI);
const rosto = fs.readFileSync(path.join(AQUI, "rosto.svg"), "utf8");
const icone = fs.readFileSync(path.join(AQUI, "icone.svg"), "utf8");
const tam = (svg, n) => svg.replace(/width="512" height="512"/, `width="${n}" height="${n}"`);
const FONTES = `<link href="https://fonts.googleapis.com/css2?family=Anton&family=Barlow+Condensed:wght@700&display=block" rel="stylesheet">`;

const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const foto = async (html, w, h, arquivo, transparente = false) => {
  const p = await b.newPage();
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  /* sem o charset o Chrome lê o arquivo como Latin-1 e o "ó" vira "Ã³" */
  fs.writeFileSync(path.join(AQUI, "__tmp.html"), html.replace("<html>", '<html><meta charset="utf-8">'));
  await p.goto(pathToFileURL(path.join(AQUI, "__tmp.html")).href, { waitUntil: "networkidle0" });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(AQUI, arquivo), omitBackground: transparente, clip: { x: 0, y: 0, width: w, height: h } });
  await p.close();
  console.log(arquivo, `${w}x${h}`);
};
await foto(`<html><body style="margin:0;background:transparent">${tam(icone, 32)}</body></html>`, 32, 32, "icone-32.png", true);
await foto(`<html><body style="margin:0;background:#0B0C10;display:grid;place-items:center;height:180px">${tam(icone, 156)}</body></html>`, 180, 180, "apple-touch-icon.png");
await foto(`<html><head>${FONTES}</head><body style="margin:0;width:1200px;height:630px;overflow:hidden;position:relative;background:#0B0C10;font-family:'Barlow Condensed',sans-serif">
  <div style="position:absolute;inset:0;background:url('${pathToFileURL(path.join(IMG, "arena.webp")).href}') center/cover;opacity:.32;filter:saturate(.7)"></div>
  <div style="position:absolute;inset:0;background:linear-gradient(90deg,#0B0C10 18%,rgba(11,12,16,.55) 60%,rgba(11,12,16,.85))"></div>
  <div style="position:absolute;left:70px;top:95px">${tam(rosto, 440)}</div>
  <div style="position:absolute;left:560px;top:150px;color:#F2EEE6">
    <div style="font-family:Anton,Impact,sans-serif;font-size:132px;line-height:.95;letter-spacing:.01em;text-transform:uppercase">Octógono</div>
    <div style="font-weight:700;font-size:30px;letter-spacing:.3em;text-transform:uppercase;color:#D7261E;margin-top:18px">Carreira de MMA</div>
    <div style="font-weight:700;font-size:30px;letter-spacing:.3em;text-transform:uppercase;color:#D7261E;margin-top:6px">e modo Online</div>
    <div style="font-weight:700;font-size:28px;letter-spacing:.12em;color:#C9CBD2;margin-top:40px">octogono.fun</div>
  </div></body></html>`, 1200, 630, "compartilhar.png");
fs.rmSync(path.join(AQUI, "__tmp.html"), { force: true });
await b.close();
