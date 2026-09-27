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
     MODELO=google/gemini-3.1-flash-image python3 img/gerar.py ...   troca o modelo
"""
import base64, json, os, sys, urllib.error, urllib.request
import numpy as np
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
BRUTO = os.path.join(AQUI, "bruto")
MODELO = os.environ.get("MODELO", "google/gemini-3-pro-image")

ESTILO = ("Cinematic documentary photograph, 35mm film, high contrast, deep crushed blacks, "
          "a single hard spotlight from above, haze in the air, heavy film grain, shallow depth of field. "
          "Absolutely no text, no letters, no numbers, no logos, no watermark, no brand names. "
          "No recognizable faces: any person is seen from behind, in silhouette or cropped out of frame. ")
TEMAS = {
  "arena": "An empty professional MMA octagon cage in a dark arena before the event, spotlight on the canvas, empty seats dissolving into darkness, wide shot, eye level. The canvas and the fence padding are plain and completely unmarked, with no printing of any kind.",
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
             "image_config": {"aspect_ratio": "16:9", "image_size": "2K"},   # 2K custa o mesmo que 1K no Gemini 3 Pro
             "messages": [{"role": "user", "content": ESTILO + TEMAS[tema]}]}
    req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(corpo).encode(), headers={"Authorization": "Bearer " + chave(),
        "Content-Type": "application/json", "HTTP-Referer": "https://octogono.fun", "X-Title": "Octogono"})
    # Conexão caindo no meio da resposta já aconteceu (connection reset).
    # Espera longa (10 min) e só 1 nova tentativa: pedido que estoura o
    # tempo do nosso lado é cobrado mesmo assim se o servidor terminar a
    # imagem (medido: 3 tentativas curtas custaram imagens em dobro).
    for tentativa in range(2):
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                d = json.load(r)
            break
        except (ConnectionError, TimeoutError, urllib.error.URLError) as e:
            if tentativa == 1:
                raise
            print(tema, "falhou a conexão, tentando de novo:", e)
    imgs = d["choices"][0]["message"].get("images") or []
    assert imgs, f"{tema}: modelo não devolveu imagem ({json.dumps(d)[:300]})"
    url = imgs[0]["image_url"]["url"]
    dados = base64.b64decode(url.split(",", 1)[1])
    os.makedirs(BRUTO, exist_ok=True)
    open(os.path.join(BRUTO, tema + ".png"), "wb").write(dados)
    custo = (d.get("usage") or {}).get("cost")
    print(tema, "gerado", len(dados) // 1024, "KB", f"custo US$ {custo}" if custo is not None else "")

def aparar_bordas(t):
    """O modelo às vezes devolve a foto com margem lisa (branca ou preta)
    nas laterais pra completar o 16:9 (aconteceu no octogono-luz). Corta
    coluna/linha de borda quase uniforme antes do tratamento."""
    def corte(perfil_media, perfil_desvio, n):
        i = 0
        while i < n // 4 and perfil_desvio[i] < 0.025 and (perfil_media[i] > 0.7 or perfil_media[i] < 0.03):
            i += 1
        return i
    cm, cs, lm, ls = t.mean(0), t.std(0), t.mean(1), t.std(1)
    e = corte(cm, cs, t.shape[1]); d = corte(cm[::-1], cs[::-1], t.shape[1])
    c = corte(lm, ls, t.shape[0]); b = corte(lm[::-1], ls[::-1], t.shape[0])
    if e or d or c or b:
        print("  aparou bordas: esq", e, "dir", d, "topo", c, "base", b)
    return t[c:t.shape[0] - b, e:t.shape[1] - d]

def tratar(tema):
    im = Image.open(os.path.join(BRUTO, tema + ".png")).convert("L")
    t = aparar_bordas(np.asarray(im).astype(np.float32) / 255.0)
    t = np.clip((t - 0.05) / 0.9, 0, 1) ** 1.2             # preto mais fundo, sem estourar o branco
    preto = np.array([7, 8, 11], np.float32)
    sangue = np.array([112, 22, 19], np.float32)            # meio-tom: vermelho escuro (150 saturava a tela inteira)
    osso = np.array([242, 226, 214], np.float32)            # luz: osso quente
    t3 = t[..., None]
    cor = np.where(t3 < 0.66, preto + (sangue - preto) * (t3 / 0.66),
                   sangue + (osso - sangue) * ((t3 - 0.66) / 0.34))
    grao = np.random.default_rng(7).normal(0, 7, t.shape)[..., None]
    out = Image.fromarray(np.clip(cor + grao, 0, 255).astype(np.uint8))
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
