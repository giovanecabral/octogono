"""Logo do Octógono (2026-10-04, pedido do dono: "quero uma logo profissional
do octógono"; "rosto" era a identidade do site, não um rosto desenhado).

A direção saiu de conceitos gerados no OpenRouter (gpt-5.4-image-2 e
gemini-3-pro-image chegaram, cada um, ao anel octogonal cortado por um
golpe vermelho, e o gemini às letras octogonais). Aqui ela é redesenhada em
vetor, letra por letra, sem depender de fonte:
- símbolo: o anel do octógono (a jaula vista de cima) cortado por um golpe
  vermelho que afina numa ponta; as duas metades do anel deslizam ao longo
  do corte (lê como golpe e não como o sinal de proibido) e o anel some em
  volta do golpe (máscara, fundo transparente de verdade);
- logotipo: OCTÓGONO em letras condensadas de cantos chanfrados (os O são
  octógonos), com o acento do Ó numa barra vermelha inclinada como o golpe;
- ícone: o símbolo sobre um quadrado escuro (favicon e ícone do iPhone: tem
  que aparecer em aba clara e escura).

Gera img/logo/simbolo.svg, palavra.svg, logo.svg (símbolo ao lado do
logotipo), logo-fundo-claro.svg (a mesma em cor da noite) e icone.svg. Os PNG saem de img/logo/rasterizar.mjs.
Rodar: python3 img/logo/gerar.py
"""
import math, os
AQUI = os.path.dirname(os.path.abspath(__file__))
OSSO, SANGUE, NOITE = "#F2EEE6", "#D7261E", "#0B0C10"

def pts(lista):
    return " ".join(f"{x:.1f},{y:.1f}" for x, y in lista)

# ---------- símbolo (caixa 512) ----------
def octogono(cx, cy, r):
    return [(cx + r * math.cos(math.radians(22.5 + 45 * k)), cy + r * math.sin(math.radians(22.5 + 45 * k))) for k in range(8)]
def lamina(p0, p1, larg):
    """golpe de p0 (ponta curta) a p1 (ponta longa e afiada), mais largo a um terço"""
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]; L = math.hypot(dx, dy); nx, ny = -dy / L, dx / L
    m = (p0[0] + dx * .32, p0[1] + dy * .32)
    return [p0, (m[0] + nx * larg / 2, m[1] + ny * larg / 2), p1, (m[0] - nx * larg / 2, m[1] - ny * larg / 2)]
def expande(poly, d):
    """polígono convexo aumentado em d a partir do centróide (a folga do corte)"""
    cx = sum(x for x, _ in poly) / len(poly); cy = sum(y for _, y in poly) / len(poly)
    out = []
    for x, y in poly:
        vx, vy = x - cx, y - cy; L = math.hypot(vx, vy) or 1
        out.append((x + vx / L * d, y + vy / L * d))
    return out
GOLPE = lamina((96, 470), (436, 30), 58)
DESLIZE = 16            # quanto cada metade do anel desliza ao longo do corte
def simbolo(pref, cor_anel=OSSO):
    """anel do octógono cortado pelo golpe: as duas metades deslizam em
    sentidos opostos ao longo da linha do corte (lê como golpe, não como Ø)"""
    (x0, y0), (x1, y1) = GOLPE[0], GOLPE[2]
    L = math.hypot(x1 - x0, y1 - y0); ux, uy = (x1 - x0) / L, (y1 - y0) / L; nx, ny = -uy, ux
    def lado(s):
        a, b = (x0 - ux * 900, y0 - uy * 900), (x0 + ux * 900, y0 + uy * 900)
        return [a, b, (b[0] + s * nx * 900, b[1] + s * ny * 900), (a[0] + s * nx * 900, a[1] + s * ny * 900)]
    ext, inte = octogono(256, 256, 214), octogono(256, 256, 128)
    anel = f"M{pts(ext)}Z M{pts(inte)}Z"
    out = (f'<defs><mask id="{pref}-corte" maskUnits="userSpaceOnUse" x="-64" y="-64" width="640" height="640">'
           f'<rect x="-64" y="-64" width="640" height="640" fill="#fff"/><polygon points="{pts(expande(GOLPE, 26))}" fill="#000"/></mask>'
           f'<clipPath id="{pref}-a"><polygon points="{pts(lado(1))}"/></clipPath>'
           f'<clipPath id="{pref}-b"><polygon points="{pts(lado(-1))}"/></clipPath></defs><g mask="url(#{pref}-corte)">')
    for nome, s in (("a", 1), ("b", -1)):
        out += (f'<g transform="translate({s * ux * DESLIZE:.1f} {s * uy * DESLIZE:.1f})">'
                f'<path clip-path="url(#{pref}-{nome})" fill-rule="evenodd" fill="{cor_anel}" d="{anel}"/></g>')
    return out + f'</g><polygon points="{pts(GOLPE)}" fill="{SANGUE}"/>'

# ---------- logotipo (caixa alta com 100 de altura) ----------
H, S = 100, 22          # altura e espessura do traço
LARG = {"O": 62, "Ó": 62, "C": 60, "T": 56, "G": 62, "N": 60}
def caixa_oct(x, y, w, h, c):
    return [(x + c, y), (x + w - c, y), (x + w, y + c), (x + w, y + h - c), (x + w - c, y + h), (x + c, y + h), (x, y + h - c), (x, y + c)]
def letra_O(x, w=62, c=18, k=6):
    return f'<path fill-rule="evenodd" d="M{pts(caixa_oct(x, 0, w, H, c))}Z M{pts(caixa_oct(x + S, S, w - 2 * S, H - 2 * S, k))}Z"/>'
def letra_C(x, w=60, c=18, k=6, abre=(34, 66)):
    a, b = abre
    xd, xi = x + w, x + w - S
    contorno = [(xd, a), (xd, c), (xd - c, 0), (x + c, 0), (x, c), (x, H - c), (x + c, H), (xd - c, H), (xd, H - c), (xd, b),
                (xi, b), (xi, H - S - k), (xi - k, H - S), (x + S + k, H - S), (x + S, H - S - k), (x + S, S + k), (x + S + k, S), (xi - k, S), (xi, S + k), (xi, a)]
    return f'<polygon points="{pts(contorno)}"/>'
def letra_G(x, w=62):
    """um C com a abertura menor e a espora entrando no meio, do lado direito"""
    return letra_C(x, w, abre=(34, 48)) + f'<rect x="{x + w - S - 12}" y="48" width="{S + 12}" height="16"/>'
def letra_T(x, w=56):
    return f'<rect x="{x}" y="0" width="{w}" height="{S}"/><rect x="{x + (w - S) / 2}" y="0" width="{S}" height="{H}"/>'
def letra_N(x, w=60):
    return (f'<rect x="{x}" y="0" width="{S}" height="{H}"/><rect x="{x + w - S}" y="0" width="{S}" height="{H}"/>'
            f'<polygon points="{pts([(x, 0), (x + S + 2, 0), (x + w, H), (x + w - S - 2, H)])}"/>')
def acento(x):
    """barra vermelha inclinada como o golpe do símbolo, acima do Ó"""
    return f'<polygon fill="{SANGUE}" points="{pts([(x + 22, -8), (x + 36, -8), (x + 50, -30), (x + 36, -30)])}"/>'
def palavra(cor=OSSO):
    partes, x, vao = [], 0, 9
    for ch in "OCTÓGONO":
        partes.append({"O": letra_O, "Ó": letra_O, "C": letra_C, "T": letra_T, "G": letra_G, "N": letra_N}[ch](x))
        if ch == "Ó": partes.append(acento(x))
        x += LARG[ch] + vao
    return f'<g fill="{cor}">{"".join(partes)}</g>', x - vao

def svg(corpo, vb, w, h):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w:g}" height="{h:g}" role="img" aria-label="Octógono">{corpo}</svg>'

if __name__ == "__main__":
    corpo, larg = palavra()
    escreve = lambda nome, txt: open(os.path.join(AQUI, nome), "w").write(txt)
    escreve("simbolo.svg", svg(simbolo("s"), "0 0 512 512", 512, 512))
    escreve("palavra.svg", svg(corpo, f"-4 -36 {larg + 8} 140", larg + 8, 140))
    # símbolo com 150 de altura ao lado da palavra (caixa alta 100), centrados na vertical
    lock = f'<g transform="scale({150 / 512:.5f})">{simbolo("l")}</g><g transform="translate(176 25)">{corpo}</g>'
    escreve("logo.svg", svg(lock, f"0 -12 {176 + larg + 4} 174", 176 + larg + 4, 174))
    # a mesma logo pra fundo claro: anel e letras na cor da noite, o vermelho fica
    corpo_e, _ = palavra(NOITE)
    lock_e = f'<g transform="scale({150 / 512:.5f})">{simbolo("e", NOITE)}</g><g transform="translate(176 25)">{corpo_e}</g>'
    escreve("logo-fundo-claro.svg", svg(lock_e, f"0 -12 {176 + larg + 4} 174", 176 + larg + 4, 174))
    # ícone: símbolo sobre quadrado escuro de cantos levemente arredondados
    escreve("icone.svg", svg(f'<rect width="512" height="512" rx="96" fill="{NOITE}"/>'
                             f'<g transform="translate(51 51) scale(.8)">{simbolo("i")}</g>', "0 0 512 512", 512, 512))
    print("ok", larg)
