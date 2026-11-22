# Textura de cachos pras cascas (512, repete nos dois sentidos): alfa = ruído de cachinhos (0 a 1), cinza com variação.
import sys, random, math
from PIL import Image, ImageDraw, ImageFilter, ImageChops
N = 512; rnd = random.Random(5)
a = Image.new("L", (N, N), 0); d = ImageDraw.Draw(a)
for _ in range(5200):
    x, y, r = rnd.random() * N, rnd.random() * N, 3 + rnd.random() * 6; w = 1 + int(rnd.random() * 2); v = int(120 + rnd.random() * 135)
    a0 = rnd.random() * 360
    for dx in (-N, 0, N):
        for dy in (-N, 0, N):
            d.arc([x + dx - r, y + dy - r, x + dx + r, y + dy + r], a0, a0 + 200 + rnd.random() * 140, fill=v, width=w)
a = a.filter(ImageFilter.GaussianBlur(0.8))
c = Image.new("L", (N, N), 0); dc = ImageDraw.Draw(c)
for _ in range(9000):
    x, y = rnd.random() * N, rnd.random() * N; v = int(120 + rnd.random() * 120); dc.point((x, y), fill=v)
c = c.filter(ImageFilter.GaussianBlur(1.2)); cor = ImageChops.lighter(c, a.point(lambda p: int(p * 0.9)))
# alfa equalizado: cobertura de 0 a 1 por igual (o jogo multiplica pela camada e recorta num limiar fixo)
from PIL import ImageOps
a = ImageOps.equalize(Image.blend(a, c, 0.35).filter(ImageFilter.GaussianBlur(0.6)))
img = Image.merge("RGBA", (cor, cor, cor, a)); img.save(sys.argv[1], quality=92, method=6); print("ok")
