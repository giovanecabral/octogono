# Texturas do cabelo esculpido (etapa 3, 2026-11-21: "muita textura e pouco desenvolvimento"): o volume do corte é
# malha (cabelos.py); a textura só dá o fio fino por cima, em baixo contraste, opaca e repetindo nos dois sentidos.
#   mecha.png   fios lisos ao longo de v (u = de lado, v = direção do fio)
#   crespo.png  molinhas pequenas em todas as direções (black power, cacheado)
# Cada uma sai com o relevo (…_n.png, mapa normal no espaço tangente, tirado da própria luminância).
# Uso: python3 atlas_mecha.py <pasta de saída>
import sys, os, random, math
from PIL import Image, ImageDraw, ImageFilter, ImageChops

N = 512
def linha_repetida(d, pts, cor, larg):
    for (xa, ya), (xb, yb) in zip(pts, pts[1:]):
        for dx in (-N, 0, N):
            for dy in (-N, 0, N):
                d.line([(xa + dx, ya + dy), (xb + dx, yb + dy)], fill=cor, width=larg)

def mecha():
    img = Image.new("L", (N, N), 150); d = ImageDraw.Draw(img); rnd = random.Random(5)
    for _ in range(2600):
        x0, y0 = rnd.random() * N, rnd.random() * N; comp = 60 + rnd.random() * 220; amp = 0.8 + rnd.random() * 2.5
        fase = rnd.random() * 6.28; lum = int(95 + rnd.random() * 140); larg = 1 + int(rnd.random() * 2.2)
        pts = [(x0 + amp * math.sin(fase + i / 20 * 3), y0 + comp * i / 20) for i in range(21)]
        linha_repetida(d, pts, lum, larg)
    return img.filter(ImageFilter.GaussianBlur(0.6))

def crespo():
    img = Image.new("L", (N, N), 140); d = ImageDraw.Draw(img); rnd = random.Random(9)
    for _ in range(2400):
        cx, cy = rnd.random() * N, rnd.random() * N; r = 3 + rnd.random() * 6; a0 = rnd.random() * 6.28; voltas = 1.2 + rnd.random()
        lum = int(90 + rnd.random() * 150); larg = 1 + int(rnd.random() * 2)
        pts = [(cx + r * (0.6 + 0.4 * t / 30) * math.cos(a0 + t / 30 * voltas * 6.28), cy + r * (0.6 + 0.4 * t / 30) * math.sin(a0 + t / 30 * voltas * 6.28) + t * 0.25) for t in range(31)]
        linha_repetida(d, pts, lum, larg)
    return img.filter(ImageFilter.GaussianBlur(0.7))

def normal(alt, forca=2.2):
    """mapa normal (repete: a diferença dá a volta na borda)"""
    a = alt.load(); out = Image.new("RGB", (N, N)); o = out.load()
    for y in range(N):
        for x in range(N):
            dx = (a[(x + 1) % N, y] - a[(x - 1) % N, y]) / 255 * forca; dy = (a[x, (y + 1) % N] - a[x, (y - 1) % N]) / 255 * forca
            l = math.sqrt(dx * dx + dy * dy + 1); o[x, y] = (int(128 - 127 * dx / l), int(128 + 127 * dy / l), int(128 + 127 / l))
    return out

pasta = sys.argv[1]
for nome, f in (("mecha", mecha), ("crespo", crespo)):
    lum = f()
    # cor: de 0,62 a 1,0 (baixo contraste: a cor vem do material, o volume vem da malha)
    cor = lum.point(lambda v: int(158 + v * 97 / 255))
    Image.merge("RGB", (cor, cor, cor)).save(os.path.join(pasta, nome + ".png"))
    normal(lum.filter(ImageFilter.GaussianBlur(0.8))).save(os.path.join(pasta, nome + "_n.png"))
    print("ok", nome)
