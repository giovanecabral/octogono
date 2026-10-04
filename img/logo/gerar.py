"""Logo do Octógono: o rosto do octógono (2026-10-04, pedido do dono: "o
octógono precisa ter um rosto e esse rosto vai ser a logo").

O aro vermelho é o acolchoado da grade, com os 8 postes de metal nos cantos;
dentro, a grade ao fundo e o rosto de um lutador concentrado: sobrancelhas
descendo pro centro, a direita cortada por uma cicatriz costurada, olhos
estreitos, nariz de boxeador torto e o protetor bucal vermelho num meio
sorriso. Cores da marca (estilo.css): noite, sangue, osso e ouro.

Gera img/logo/rosto.svg (completo: cabeçalho e compartilhamento) e
img/logo/icone.svg (sem grade nem cicatriz e com traço mais grosso: favicon).
Os PNG (favicon, ícone do iPhone, card de compartilhamento) saem de
img/logo/rasterizar.mjs. Rodar: python3 img/logo/gerar.py
"""
import math, os
AQUI = os.path.dirname(os.path.abspath(__file__))
C=256
def octo(R, cx=C, cy=C):
    return " ".join(f"{cx+R*math.cos(math.radians(22.5+45*k)):.1f},{cy+R*math.sin(math.radians(22.5+45*k)):.1f}" for k in range(8))
def vertices(R):
    return [(C+R*math.cos(math.radians(22.5+45*k)), C+R*math.sin(math.radians(22.5+45*k))) for k in range(8)]
INK="#0B0C10"; FACE="#15171F"; RED="#D7261E"; RED_D="#8F1712"; RED_L="#F05A4F"; BONE="#F2EEE6"; GOLD="#D4A017"; MESH="#252936"; METAL="#2B2F3A"

def rosto(icone=False, pref="o"):
    p=[]
    p.append('<defs>')
    p.append(f'<linearGradient id="{pref}-aro" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{RED_L}"/><stop offset=".45" stop-color="{RED}"/><stop offset="1" stop-color="{RED_D}"/></linearGradient>')
    p.append(f'<radialGradient id="{pref}-luz" cx=".5" cy=".38" r=".7"><stop offset="0" stop-color="#20232D"/><stop offset="1" stop-color="{FACE}"/></radialGradient>')
    p.append(f'<clipPath id="{pref}-rosto"><polygon points="{octo(196)}"/></clipPath>')
    p.append(f'<pattern id="{pref}-grade" width="32" height="32" patternUnits="userSpaceOnUse" patternTransform="rotate(45 256 256)"><path d="M0 0H32M0 0V32" stroke="{MESH}" stroke-width="3" fill="none"/></pattern>')
    p.append(f'<clipPath id="{pref}-dentes"><path d="M172 364 Q258 390 350 346 L352 368 Q260 404 170 386 Z"/></clipPath>')
    p.append('</defs>')
    # sombra no chão e aro acolchoado (luz em cima, sombra embaixo)
    p.append(f'<polygon points="{octo(242, C, C+10)}" fill="{INK}" opacity=".5"/>')
    p.append(f'<polygon points="{octo(240)}" fill="url(#{pref}-aro)"/>')
    p.append(f'<polygon points="{octo(240)}" fill="none" stroke="{RED_D}" stroke-width="5"/>')
    p.append(f'<polygon points="{octo(212)}" fill="none" stroke="{RED_D}" stroke-width="4" opacity=".8"/>')
    # rosto com a grade ao fundo
    p.append(f'<polygon points="{octo(198)}" fill="url(#{pref}-luz)"/>')
    if not icone:
        p.append(f'<rect x="0" y="0" width="512" height="512" fill="url(#{pref}-grade)" clip-path="url(#{pref}-rosto)"/>')
    p.append(f'<polygon points="{octo(198)}" fill="none" stroke="{INK}" stroke-width="6"/>')
    # postes de metal nos 8 cantos
    for (x,y) in vertices(220):
        p.append(f'<rect x="{x-15:.1f}" y="{y-15:.1f}" width="30" height="30" rx="6" fill="{METAL}" stroke="{INK}" stroke-width="4"/>')
        p.append(f'<rect x="{x-9:.1f}" y="{y-11:.1f}" width="18" height="6" rx="3" fill="#4A5060"/>')
    # sobrancelhas: afinadas, mais grossas no meio do rosto (cara de concentrado)
    p.append(f'<path d="M104 204 Q172 206 242 236 L234 266 Q170 240 108 232 Z" fill="{BONE}"/>')
    p.append(f'<path d="M408 204 Q340 206 270 236 L278 266 Q342 240 404 232 Z" fill="{BONE}"/>')
    if not icone:
        # cicatriz: corta a sobrancelha direita e leva pontos dourados
        p.append(f'<path d="M322 188 L336 274" stroke="#1B1E27" stroke-width="15" stroke-linecap="round"/>')
        p.append(f'<path d="M322 188 L336 274" stroke="{GOLD}" stroke-width="6" stroke-linecap="round"/>')
        for t in (0.22, 0.42, 0.62, 0.82):
            x=322+14*t; y=188+86*t
            p.append(f'<path d="M{x-12:.1f} {y-2:.1f} L{x+12:.1f} {y+2:.1f}" stroke="{GOLD}" stroke-width="5" stroke-linecap="round"/>')
    # olhos: fenda de osso, pupila escura com brilho
    p.append(f'<path d="M136 272 Q184 254 232 276 Q184 292 136 272 Z" fill="{BONE}"/>')
    p.append(f'<path d="M376 272 Q328 254 280 276 Q328 292 376 272 Z" fill="{BONE}"/>')
    p.append(f'<circle cx="206" cy="275" r="{14 if icone else 12}" fill="{INK}"/>')
    p.append(f'<circle cx="306" cy="275" r="{14 if icone else 12}" fill="{INK}"/>')
    if not icone:
        p.append(f'<circle cx="210" cy="271" r="3.5" fill="{BONE}"/>')
        p.append(f'<circle cx="310" cy="271" r="3.5" fill="{BONE}"/>')
    # nariz de boxeador, levemente torto
    p.append(f'<path d="M252 284 Q246 304 262 320 Q252 326 240 320" fill="none" stroke="#3A3F4D" stroke-width="{9 if icone else 7}" stroke-linecap="round" stroke-linejoin="round"/>')
    # protetor bucal: meio sorriso torto (canto direito mais alto), dentes cerrados
    boca="M160 356 Q256 384 360 336 L364 374 Q258 416 156 394 Z"
    p.append(f'<path d="{boca}" fill="{RED}" stroke="{RED_D}" stroke-width="7" stroke-linejoin="round"/>')
    p.append(f'<g clip-path="url(#{pref}-dentes)"><rect x="140" y="320" width="240" height="100" fill="{BONE}"/>')
    for x in (200, 228, 256, 284, 312):
        p.append(f'<path d="M{x} 320 L{x+4} 420" stroke="{RED_D}" stroke-width="{6 if icone else 5}"/>')
    p.append('</g>')
    return "".join(p)

def svg(conteudo, w=512, h=512, vb="0 0 512 512"):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w}" height="{h}" role="img" aria-label="Octógono">{conteudo}</svg>'
open(os.path.join(AQUI,'rosto.svg'),'w').write(svg(rosto(False,"o")))
open(os.path.join(AQUI,'icone.svg'),'w').write(svg(rosto(True,"i")))
print("ok")
