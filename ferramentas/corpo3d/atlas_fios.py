# Atlas de mechas (2048 x 1024, 8 colunas de 256): cada coluna é uma mecha vista de frente, raiz embaixo (v = 0) e
# ponta em cima, com os fios convergindo pro meio (a mecha agrupa) e afinando na ponta. Cinza claro com variação de
# fio a fio; a cor vem do material e a sombra da raiz vem do vértice. O alfa recorta o fio (o jogo usa alphaTest).
#   0 liso fino   1 liso grosso   2 ondulado   3 ondulado aberto   4 cacheado   5 crespo   6 barba   7 barba densa
# Uso: python3 atlas_fios.py <saida.png>
import sys, random, math
from PIL import Image, ImageDraw, ImageFilter

W, H, C = 2048, 1024, 8
L = W // C
TIPOS = [
    # fios, amplitude (px), voltas ao longo, convergência (0 = paralelo, 1 = tudo no meio na ponta), largura (px), comprimento mínimo
    dict(n=170, amp=1.2, voltas=0.6, conv=0.55, larg=(1.0, 1.8), comp=0.7),
    dict(n=120, amp=1.5, voltas=0.5, conv=0.45, larg=(1.6, 2.6), comp=0.7),
    dict(n=150, amp=7, voltas=1.6, conv=0.5, larg=(1.1, 2.0), comp=0.65),
    dict(n=130, amp=12, voltas=1.1, conv=0.35, larg=(1.2, 2.2), comp=0.6),
    dict(n=150, amp=16, voltas=3.2, conv=0.4, larg=(1.2, 2.2), comp=0.55),
    dict(n=220, amp=9, voltas=9, conv=0.2, larg=(1.0, 1.8), comp=0.5),
    dict(n=200, amp=5, voltas=2.5, conv=0.3, larg=(1.2, 2.0), comp=0.45),
    dict(n=520, amp=3, voltas=2.0, conv=0.25, larg=(1.4, 2.4), comp=0.6),   # densa: quase opaca no meio (barba sem pontilhado)
]
img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
rnd = random.Random(11)
for col, t in enumerate(TIPOS):
    camada = Image.new("RGBA", (L, H), (0, 0, 0, 0)); d = ImageDraw.Draw(camada, "RGBA")
    for k in range(t["n"]):
        x0 = 14 + rnd.random() * (L - 28); comp = t["comp"] + (1 - t["comp"]) * rnd.random()
        fase = rnd.random() * 6.283; voltas = t["voltas"] * (0.8 + 0.4 * rnd.random()); lum = int(150 + rnd.random() * 105)
        larg = t["larg"][0] + (t["larg"][1] - t["larg"][0]) * rnd.random(); pts = []
        for i in range(90):
            s = i / 89; y = H - 2 - s * comp * (H - 6)
            meio = L / 2 + (x0 - L / 2) * (1 - t["conv"] * s)               # converge pro meio da mecha
            x = meio + t["amp"] * math.sin(fase + s * voltas * 6.283) * (0.5 + 0.5 * s) + (rnd.random() - 0.5) * 0.3
            pts.append((x, y, s))
        for (xa, ya, sa), (xb, yb, sb) in zip(pts, pts[1:]):
            a = int(255 * (1 - sa ** 3) * (0.78 + 0.22 * rnd.random()))
            d.line([(xa, ya), (xb, yb)], fill=(lum, lum, lum, a), width=max(1, round(larg * (1 - 0.55 * sa))))
    camada = camada.filter(ImageFilter.GaussianBlur(0.45))
    # bordas da coluna somem (a mecha não tem corte reto do lado)
    px = camada.load()
    for y in range(H):
        for x in range(L):
            r, g, b, a = px[x, y]
            borda = min(1.0, min(x, L - 1 - x) / 10)
            px[x, y] = (r, g, b, int(a * borda))
    img.alpha_composite(camada, (col * L, 0))
# onde não tem fio: a cor média (o mipmap não escurece a borda)
px = img.load()
for y in range(H):
    for x in range(W):
        r, g, b, a = px[x, y]
        if a < 6: px[x, y] = (180, 180, 180, a)
img.save(sys.argv[1]); print("ok", sys.argv[1])
