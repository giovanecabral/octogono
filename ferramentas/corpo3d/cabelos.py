# Cabelo do corpo realista (2026-11-20; etapa 3 em 2026-11-21, a pedido do dono: "granulado", "espalhado demais",
# "muita textura e pouco desenvolvimento"). Os cortes são VOLUME esculpido: as faces do couro copiadas, subdivididas
# e levadas pra fora pela forma de cada corte (altura, topete, risca, sulcos entre as mechas, caroços do crespo); a
# borda desliza pela pele até a linha do cabelo. Mecha recortada pelo alfa granulava no WebGL e foi tirada. Tranças
# nagô, dreads e os cachos em saca-rolha são tubos fechados. Barba, bigode e sobrancelha: volume fino do mesmo jeito,
# com a borda sumindo pelo alfa do vértice. A textura (mecha.png/crespo.png, de atlas_mecha.py; fios.png nos tubos)
# só põe o fio fino; a sombra vem da cor do vértice e a cor do fio vem do jogo.
# Cada corte vira "cabelo_<id>": um GLB sem pesos, preso ao osso da cabeça no jogo. Militar, descolorido e raspado
# são só a pintura na pele (aparencia.js). Roda dentro do corpo.py (exec): usa h, R, OLHOS, cfg, TRAB.
import bpy, bmesh, math, random, os, bisect
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

bvh_cab = BVHTree.FromObject(h, bpy.context.evaluated_depsgraph_get())
# ---- referencial da cabeça: centro do crânio, s pra esquerda do lutador, u pra cima, f pra frente
olho = (OLHOS["l"][0] + OLHOS["r"][0]) / 2
cabeca_v = [h.matrix_world @ v.co for v in h.data.vertices]
alto = [p for p in cabeca_v if p.z > olho.z - 0.02 and abs(p.x - olho.x) < 0.12 and abs(p.y - olho.y) < 0.25]
CX = (min(p.x for p in alto) + max(p.x for p in alto)) / 2; CY = (min(p.y for p in alto) + max(p.y for p in alto)) / 2
CEN = Vector((CX, CY, olho.z + 0.02)); TOPO = max(p.z for p in alto) - CEN.z
S, U, F = Vector((1, 0, 0)), Vector((0, 0, 1)), Vector((0, -1, 0))
def loc(p): q = p - CEN; return q.dot(S), q.dot(U), q.dot(F)
def mundo(s, u, f): return CEN + S * s + U * u + F * f
print("CABECA centro", tuple(round(x, 3) for x in CEN), "topo", round(TOPO, 3))
# ---- linha do cabelo (altura mínima por ângulo em volta da cabeça; 0 = testa, 90 = orelha, 180 = nuca)
# acima da orelha a linha desce até onde a orelha começa (2026-11-23): com 1,8 cm sobrava uma faixa careca de 2 cm
# entre a costeleta e a nuca, e o corte parecia capacete
LINHA = [(0, 0.052), (30, 0.046), (50, 0.028), (62, 0.008), (69, -0.03), (79, -0.03), (85, -0.016), (110, -0.016), (130, -0.035), (155, -0.075), (180, -0.085)]
def linha(s, f):
    a = abs(math.degrees(math.atan2(s, f)))
    for (a0, y0), (a1, y1) in zip(LINHA, LINHA[1:]):
        if a <= a1: return y0 + (y1 - y0) * (a - a0) / (a1 - a0)
    return LINHA[-1][1]
def orelha(s, u, f): a = abs(math.degrees(math.atan2(s, f))); return abs(s) > 0.06 and -0.04 < u < -0.016 and 80 < a < 118
def no_couro(p, folga=0.0):
    s, u, f = loc(p); return u > linha(s, f) - folga and not orelha(s, u, f) and u < 0.3
def acima_da_linha(p):   # quanto o ponto está acima da linha do cabelo (0 na linha)
    s, u, f = loc(p); return u - linha(s, f)

# ---- pontos sobre a pele numa região (sorteio por área, semente fixa)
_tris = None
def amostrar(regiao, n, semente):
    global _tris
    if _tris is None:
        me = h.data; me.calc_loop_triangles(); mw = h.matrix_world; m3 = mw.to_3x3()
        _tris = [([mw @ me.vertices[i].co for i in t.vertices], (m3 @ t.normal).normalized(), t.area) for t in me.loop_triangles]
    tris = [t for t in _tris if all(regiao(p) for p in t[0])]
    acum = []; soma = 0
    for t in tris: soma += t[2]; acum.append(soma)
    rnd = random.Random(semente); out = []
    for _ in range(n):
        ps, nn, _a = tris[min(len(tris) - 1, bisect.bisect_left(acum, rnd.random() * soma))]
        r1, r2 = rnd.random(), rnd.random()
        if r1 + r2 > 1: r1, r2 = 1 - r1, 1 - r2
        out.append((ps[0] + (ps[1] - ps[0]) * r1 + (ps[2] - ps[0]) * r2, nn))
    return out
def fora_da_pele(p, folga):
    q, nq, _, _ = bvh_cab.find_nearest(p)
    if q is None: return p
    dist = (p - q).dot(nq)
    return p + nq * (folga - dist) if dist < folga else p
def tangente(p, d):
    q, nq, _, _ = bvh_cab.find_nearest(p); nq = nq if nq is not None else U
    t = d - nq * d.dot(nq)
    return t.normalized() if t.length > 1e-6 else d
# ---- fio-guia: cresce do ponto, segue a direção do corte e nunca entra na cabeça (fica a uma folga da pele)
def crescer(p0, n0, direcao, comp, nseg, folga0, folga1, rigidez=0.65, ruido=0.0, rnd=None):
    pts = [p0 + n0 * folga0]; d = (n0 * 0.5 + direcao(p0, 0)).normalized(); passo = comp / nseg
    for i in range(1, nseg + 1):
        alvo = direcao(pts[-1], i / nseg)
        if ruido and rnd: alvo = alvo + Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * ruido
        d = (d * rigidez + alvo.normalized() * (1 - rigidez)).normalized()
        pts.append(fora_da_pele(pts[-1] + d * passo, folga0 + (folga1 - folga0) * (i / nseg)))
    return pts
def reamostrar(pts, n):
    """o fio com n pontos igualmente espaçados"""
    comp = [0.0]
    for a, b in zip(pts, pts[1:]): comp.append(comp[-1] + (b - a).length)
    tot = comp[-1] or 1e-6; out = []
    for k in range(n):
        alvo = tot * k / (n - 1); i = max(0, min(len(pts) - 2, bisect.bisect_right(comp, alvo) - 1))
        t = (alvo - comp[i]) / max(1e-9, comp[i + 1] - comp[i]); out.append(pts[i].lerp(pts[i + 1], t))
    return out

def objeto(nome, bm, material):
    me = bpy.data.meshes.new(nome); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    if me.color_attributes: me.color_attributes.active_color = me.color_attributes[0]
    o = bpy.data.objects.new(nome, me); bpy.context.scene.collection.objects.link(o)
    me.materials.append(material)
    return o   # sem pesos: cada corte é um arquivo à parte, preso à cabeça no jogo
def juntar(nome, objs, material):
    bm = bmesh.new()
    for o in objs: bm.from_mesh(o.data); bpy.data.objects.remove(o, do_unlink=True)
    return objeto(nome, bm, material)
# ---- materiais (só pra conferir no Blender: no GLB o jogo põe o dele, com a textura de fios)
def mat_fios(nome, alfa=True):
    m = bpy.data.materials.new(nome); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    t = m.node_tree.nodes.new("ShaderNodeTexImage"); t.image = IMG_FIOS
    m.node_tree.links.new(t.outputs["Color"], b.inputs["Base Color"])
    if alfa: m.node_tree.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
    b.inputs["Roughness"].default_value = 0.5; m.use_backface_culling = False
    return m
IMG_FIOS = bpy.data.images.load(os.path.join(TRAB, "fios.png"))
M_CORDA = mat_fios("MI_Corda", alfa=False)
CORTES = {}

# ================= cortes =================
# militar e descolorido: só a pintura na pele do jogo (os fiapos de máquina granulavam de longe)
def corda(bm, uvl, pts, raio, semente, colunas=(5, 4), lados=7, cor=None):
    rnd = random.Random(semente); col = rnd.choice(colunas); aneis = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized(); b1 = t.orthogonal().normalized(); b2 = t.cross(b1)
        r = raio * (1 - 0.35 * (i / (len(pts) - 1)) ** 2) * (0.9 + 0.2 * math.sin(i * 2.3 + semente))
        aneis.append([bm.verts.new(p + (b1 * math.cos(k * 6.283 / lados) + b2 * math.sin(k * 6.283 / lados)) * r) for k in range(lados)])
    for i, (A, B) in enumerate(zip(aneis, aneis[1:])):
        for k in range(lados):
            f = bm.faces.new((A[k], A[(k + 1) % lados], B[(k + 1) % lados], B[k]))
            u0 = col / 8 + 0.02 + (k / lados) * 0.08; u1 = col / 8 + 0.02 + ((k + 1) / lados) * 0.08; v0 = 0.1 + 0.6 * i / len(aneis); v1 = 0.1 + 0.6 * (i + 1) / len(aneis)
            for lp, uv in zip(f.loops, ((u0, v0), (u1, v0), (u1, v1), (u0, v1))):
                lp[uvl].uv = uv
                if cor is not None: s = 0.55 + 0.45 * min(1.0, i / 3); lp[cor] = (s, s, s, 1.0)
# ================= cabelo esculpido (etapa 3, 2026-11-21: "granulado", "espalhado demais", "muita textura e pouco
# desenvolvimento"). Mecha recortada por alfa granula no WebGL de qualquer jeito (sem MSAA no alfa, o fio fino pisca
# de longe), então o corte agora é VOLUME: as faces do couro copiadas, subdivididas e levadas pra fora pela forma de
# cada corte (altura, topete, risca, sulcos entre as mechas, caroços do crespo). A textura só põe o fio fino em
# baixo contraste (mecha.png / crespo.png, com relevo); a sombra da cor do vértice escurece o fundo dos sulcos e a
# raiz. Opaco: nada de alfa, nada de pontilhado.
from mathutils import noise as _ruido
def suave(x): x = min(1.0, max(0.0, x)); return x * x * (3 - 2 * x)
def sulco(w, fundo=3):
    """1 no fundo do sulco, 0 no meio da mecha (w em períodos)"""
    return (0.5 + 0.5 * math.cos(w * 6.2832)) ** fundo
def esculpir(nome, regiao, forma, cortes=4, faces_de=None, corta=None, apaga=None, alguma=False, alisa=0):
    """forma(q, nq) -> (ponto, sombra, (u, v)): q é o ponto da pele embaixo, nq a normal; uv em ladrilhos.
    corta(q): o vértice fica acima da linha? O que fica abaixo sobe pela pele até a linha (a borda do corte cai em
    cima da linha do cabelo, lisa; apagar o vértice deixava degrau) e a face toda abaixo some"""
    me = h.data; mw = h.matrix_world; bm = bmesh.new(); mapa = {}
    # alguma: a face entra com um vértice na região (faixa mais estreita que as faces da malha); apaga(q) tira depois
    # de subdividir as faces que ficaram todas fora
    for f in (faces_de or [f for f in me.polygons if (any if alguma else all)(regiao(mw @ me.vertices[i].co) for i in f.vertices)]):
        vs = []
        for i in f.vertices:
            if i not in mapa: mapa[i] = bm.verts.new(mw @ me.vertices[i].co)
            vs.append(mapa[i])
        bm.faces.new(vs)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cortes, use_grid_fill=True)
    uvl = bm.loops.layers.uv.new("UVMap"); cor = bm.loops.layers.color.new("Col"); dado = {}
    subiu = set()
    for v in bm.verts:
        q, nq, _, _ = bvh_cab.find_nearest(v.co)
        if q is None: q, nq = v.co.copy(), U
        if corta and not corta(q):
            subiu.add(v)
            for _ in range(120):
                q2, nq2, _, _ = bvh_cab.find_nearest(q + U * 0.0008)
                if q2 is None: break
                q, nq = q2, nq2
                if corta(q): break
        p, s, uv = forma(q, nq.normalized()); dado[v] = (s, uv, q); v.co = p
    if subiu: bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(v in subiu for v in f.verts)], context="FACES_ONLY")
    if apaga: bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(apaga(dado[v][2]) for v in f.verts)], context="FACES_ONLY")
    # borda lisa (2026-11-23): a face que sai inteira deixava a borda do corte em degrau (no coque, um dente careca
    # acima da orelha). Cada vértice da borda vai pra média dos dois vizinhos dela e volta pra mesma folga da pele
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    for _ in range(alisa):
        novo = {}
        for v in bm.verts:
            if not v.is_boundary: continue
            viz = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(viz) == 2: novo[v] = v.co * 0.4 + (viz[0].co + viz[1].co) * 0.3
        for v, c in novo.items():
            q, nq, _, _ = bvh_cab.find_nearest(c); folga = (v.co - dado[v][2]).length
            v.co = (q + nq * folga) if q is not None else c
    for f in bm.faces:
        f.smooth = True
        for lp in f.loops:
            s, uv, _ = dado[lp.vert]; lp[uvl].uv = uv; lp[cor] = s if isinstance(s, tuple) else (s, s, s, 1.0)
    o = objeto(nome, bm, M_CORDA)
    return o

# ---- repartido: risca do lado esquerdo, em cima 2 cm de volume com topete na frente, degradê nas laterais; as
# mechas deitam pro lado a partir da risca (o sulco corre na direção do fio)
RISCA = 0.032
na_linha = lambda q: acima_da_linha(q) > 0.0
# a face da malha do couro é grande acima da orelha: com "a face toda no couro" a borda saía em degrau. Entra a face
# com algum vértice no couro, e depois de subdividir sai só o que é da orelha (2026-11-23)
na_orelha = lambda q: orelha(*loc(q))
def forma_repartido(q, n):
    s, u, f = loc(q); borda = 0.12 + 0.88 * suave(acima_da_linha(q) / 0.014); topo = suave((u - 0.01) / 0.07)
    alt = 0.0035 + 0.013 * topo + 0.009 * suave((f - 0.02) / 0.06) * topo            # degradê, topo e topete
    risca = math.exp(-((s - RISCA) / 0.0045) ** 2) * suave((u - 0.05) / 0.03) * suave((f + 0.06) / 0.04)
    alt *= 1 - 0.8 * risca
    # mechas de largura desigual (o ruído mexe no período) e sulco raso; um sulco fino entre elas
    g = sulco(f / 0.011 + 1.3 * _ruido.noise(q * 22)) * (0.4 + 0.6 * topo); g2 = sulco(f / 0.0045 + 0.8 * _ruido.noise(q * 60), 2)
    alt = max(0.0, alt - 0.0024 * g - 0.0007 * g2 + 0.0012 * _ruido.noise(q * 80)) * borda
    lado = 1 if s > RISCA else -1                                                      # a massa deita pro lado
    p = q + n * (0.0012 + alt) + S * lado * alt * 0.25 * topo
    fio = math.atan2(s - RISCA, u + 0.1) * 0.1                                        # ao longo do fio
    return p, 0.42 + 0.58 * suave(alt / 0.008) * (1 - 0.45 * g), (f / 0.035, fio / 0.035)
CORTES["repartido"] = esculpir("cabelo_repartido", lambda p: no_couro(p, 0.02), forma_repartido, cortes=5, corta=na_linha, alisa=12, alguma=True, apaga=na_orelha)

# ---- coque: tudo penteado rente pra trás até o coque; o coque é uma bola de mechas torcidas em espiral
BUN = mundo(0, 0.07, -0.115); EIXO_C = (BUN - CEN).normalized(); B1_C = S; B2_C = EIXO_C.cross(B1_C).normalized()
def polar_coque(q):
    d = (q - CEN).normalized(); ang = math.acos(max(-1.0, min(1.0, d.dot(EIXO_C)))); az = math.atan2(d.dot(B2_C), d.dot(B1_C))
    return az, ang
def forma_coque(q, n):
    az, ang = polar_coque(q); borda = 0.3 + 0.7 * suave(acima_da_linha(q) / 0.012); lado = az * math.sin(ang) * 0.1
    g = sulco(lado / 0.007 + 0.5 * _ruido.noise(q * 30), 2)
    alt = max(0.0, 0.0045 - 0.0018 * g + 0.0006 * _ruido.noise(q * 90)) * borda
    return q + n * (0.0012 + alt), 0.5 + 0.5 * suave(alt / 0.004) * (1 - 0.4 * g), (lado / 0.03, ang * 0.1 / 0.03)
coque_cab = esculpir("coque_cab", lambda p: no_couro(p, 0.02), forma_coque, cortes=4, corta=na_linha, alisa=12, alguma=True, apaga=na_orelha)
# o coque assentado no couro (2026-11-23): o centro fixo (BUN + 1,2 cm) deixava a bola 2,5 cm acima do cabelo,
# solta no ar. Agora o raio do centro da cabeça acha a pele e a bola afunda um terço no cabelo penteado
_pele_bun = bvh_cab.ray_cast(CEN + EIXO_C * 0.3, -EIXO_C, 0.3)[0]
centro_bun = (_pele_bun + EIXO_C * (0.005 + 0.026 * 0.85 * 0.6)) if _pele_bun is not None else BUN + EIXO_C * 0.012; bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=32, radius=1.0)
uvl = bm.loops.layers.uv.new("UVMap"); cor = bm.loops.layers.color.new("Col"); dado = {}
for v in bm.verts:
    d = v.co.normalized(); th = math.acos(max(-1.0, min(1.0, d.z))); ph = math.atan2(d.y, d.x)
    giro = ph + 2.2 * th                                                               # mecha torcida em espiral
    g = sulco(giro * 7 / 6.2832, 2); r = 0.026 * (1 - 0.12 * g) * (1 - 0.18 * max(0.0, -d.z))
    w = d * r; v.co = centro_bun + EIXO_C * w.z * 0.85 + B1_C * w.x + B2_C * w.y
    dado[v] = (0.55 + 0.45 * (1 - g) * (0.6 + 0.4 * max(0.0, d.z)), (giro * 0.026 / 0.03, th * 0.026 / 0.03))
for f in bm.faces:
    f.smooth = True
    for lp in f.loops:
        s, uv = dado[lp.vert]; lp[uvl].uv = uv; lp[cor] = (s, s, s, 1.0)
CORTES["coque"] = juntar("cabelo_coque", [coque_cab, objeto("coque_bun", bm, M_CORDA)], M_CORDA)

# ---- moicano: uma faixa rente no couro (a base) e a crista feita de mechas chatas espetadas, cada uma uma peça
# fechada que nasce no couro, sobe e deita pra trás, mais altas no meio da cabeça e uma por cima da outra (a faixa
# levantada a 4 cm virava uma lâmina fina descolada da cabeça); as laterais raspadas são a pintura
def no_moicano(p): s, u, f = loc(p); return no_couro(p, 0.02) and abs(s) < 0.03
def forma_moicano(q, n):
    s, u, f = loc(q); perfil = max(0.0, 1 - (s / 0.026) ** 2) ** 0.6
    alt = 0.006 * perfil * suave(acima_da_linha(q) / 0.015)
    # a borda (dos lados e na testa) afunda na pele: o contorno é onde a faixa cruza a pele (liso), não a face apagada
    # (saía em serra)
    return q + n * (-0.0015 + 0.0027 * min(1.0, perfil * 3) * suave(acima_da_linha(q) / 0.008) + alt), 0.72 + 0.2 * perfil, (s / 0.03, f / 0.03)
moi_base = esculpir("moi_base", no_moicano, forma_moicano, cortes=5, corta=na_linha, alguma=True, apaga=lambda q: abs(loc(q)[0]) > 0.027)
def mecha_chata(bm, uvl, cor, pts, larg, esp, lados=10):
    """mecha chata e afinando até a ponta: anéis achatados (largura de lado, espessura na direção do fio pra trás)"""
    aneis = []; n = len(pts)
    for i, p in enumerate(pts):
        t = i / (n - 1); tg = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        lado = S - tg * S.dot(tg); lado.normalize(); frente = tg.cross(lado)
        a_ = larg * (1 - t) ** 0.7 + 0.0008; b_ = esp * (1 - t) ** 0.8 + 0.0006
        aneis.append([bm.verts.new(p + lado * math.cos(k * 6.2832 / lados) * a_ + frente * math.sin(k * 6.2832 / lados) * b_) for k in range(lados)])
    for i, (A, B) in enumerate(zip(aneis, aneis[1:])):
        for k in range(lados):
            f = bm.faces.new((A[k], A[(k + 1) % lados], B[(k + 1) % lados], B[k])); f.smooth = True
            for lp, (uu, vv) in zip(f.loops, ((k, i), (k + 1, i), (k + 1, i + 1), (k, i + 1))):
                lp[uvl].uv = (uu / lados * 0.5, vv / (n - 1) * 1.5); som = 0.4 + 0.6 * min(1.0, vv / (n - 1) * 2.5); lp[cor] = (som, som, som, 1.0)
rnd_m = random.Random(41); bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap"); cor = bm.loops.layers.color.new("Col")
N_MECHAS = 36
# três fileiras (meio e os dois lados) abrindo um pouco pra fora: de frente a crista tem corpo (com uma fileira só,
# de frente ela lia como uma lâmina)
for k in range(N_MECHAS):
    t = k / (N_MECHAS - 1); ang = math.radians(28 + 150 * t)                 # da testa (28 graus acima da frente) até a nuca
    fila = (0, -1, 1)[k % 3]; sl = fila * 0.0085 + rnd_m.uniform(-0.002, 0.002)
    d = (F * math.cos(ang) + U * math.sin(ang)).normalized(); raiz = bvh_cab.ray_cast(CEN + d * 0.3 + S * sl, -d)[0]
    if raiz is None or not no_couro(raiz, 0.0): continue
    _, nq, _, _ = bvh_cab.find_nearest(raiz)
    meio = math.sin(math.pi * min(1.0, t * 1.15)) ** 0.6                      # mais alta no meio, baixa na testa e na nuca
    comp = (0.03 + 0.04 * meio) * (0.85 + 0.3 * rnd_m.random()) * (1.0 if fila == 0 else 0.82)
    sobe = (nq * 0.8 - F * 0.55 + S * (fila * 0.22 + rnd_m.uniform(-0.06, 0.06))).normalized()
    pts = []
    for i in range(9):
        q_ = i / 8; dirr = (sobe * (1 - 0.45 * q_) - F * 0.6 * q_).normalized()   # sobe e deita pra trás na ponta
        pts.append(raiz - nq * 0.004 if i == 0 else pts[-1] + dirr * comp / 8)
    mecha_chata(bm, uvl, cor, pts, (0.013 if fila else 0.016) + 0.003 * rnd_m.random(), 0.008)
CORTES["moicano"] = juntar("cabelo_moicano", [moi_base, objeto("moi_crista", bm, M_CORDA)], M_CORDA)

# ---- cacheado: volume de cachos (caroços redondos, o crespo.png por cima) e cachos em saca-rolha caindo em volta
# (tubos fechados, como os dreads: nada de alfa); na testa não (pendurado no rosto parecia rabisco)
def caroco(q, escala):
    d, _ = _ruido.voronoi(q * escala, distance_metric="DISTANCE"); return max(0.0, 1 - d[0] * 1.15) ** 1.5
def forma_cacheado(q, n):
    s, u, f = loc(q); borda = 0.15 + 0.85 * suave(acima_da_linha(q) / 0.02); topo = suave((u + 0.02) / 0.08)
    c = caroco(q, 70); alt = (0.009 + 0.014 * topo + 0.009 * c + 0.002 * _ruido.noise(q * 120)) * borda
    return q + n * (0.0015 + alt), 0.42 + 0.58 * suave(alt / 0.012) * (0.6 + 0.4 * c), (loc(q)[0] / 0.025 + loc(q)[2] / 0.05, loc(q)[1] / 0.025)
CORTES["cacheado"] = esculpir("cabelo_cacheado", lambda p: no_couro(p, 0.02), forma_cacheado, cortes=5, corta=na_linha, alisa=12, alguma=True, apaga=na_orelha)
def dir_cacho(p, t):
    q, nq, _, _ = bvh_cab.find_nearest(p); nq = nq if nq is not None else U
    return (nq * (0.55 - 0.35 * t) + U * -(0.35 + 0.6 * t) + F * -0.15).normalized()   # sai da cabeça e cai com o peso
rnd_k = random.Random(29); bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap"); cor = bm.loops.layers.color.new("Col")
for k, (p, nn) in enumerate(amostrar(lambda q: no_couro(q, 0.002) and acima_da_linha(q) < 0.045 and abs(math.degrees(math.atan2(loc(q)[0], loc(q)[2]))) > 45, 100, 31)):
    comp = (0.03 + 0.03 * rnd_k.random()) * (0.6 + 0.4 * min(1.0, max(0.0, acima_da_linha(p) / 0.03)))
    eixo = reamostrar(crescer(p, nn, dir_cacho, comp, 8, 0.012, 0.02, 0.55, 0.12, rnd_k), 40)
    raio = 0.0045 + 0.002 * rnd_k.random(); voltas = 2.5 + 1.2 * rnd_k.random(); fase0 = rnd_k.random() * 6.283; pts = []; e1 = None
    for j, c in enumerate(eixo):
        t = j / 39; tg = (eixo[min(j + 1, 39)] - eixo[max(j - 1, 0)]).normalized()
        if e1 is None: e1 = tg.orthogonal().normalized()
        e1 = (e1 - tg * e1.dot(tg)).normalized(); e2 = tg.cross(e1); a = fase0 + t * voltas * 6.283
        pts.append(fora_da_pele(c + (e1 * math.cos(a) + e2 * math.sin(a)) * raio * min(1.0, t * 4), 0.004))
    corda(bm, uvl, pts, 0.0028, 500 + k, colunas=(4, 5), lados=6, cor=cor)
CORTES["cacheado_cachos"] = objeto("cabelo_cacheado_cachos", bm, M_CORDA)

# ---- black power: uma massa redonda irregular (esfera com caroços grandes e pequenos), colada na pele na linha
AFRO_C, AFRO_R = CEN + U * 0.03 + F * -0.012, 0.145
def afro_raio(d):
    return AFRO_R * (1 + 0.05 * math.sin(d.x * 5 + 1) * math.sin(d.y * 4) * math.sin(d.z * 5 + 2) + 0.03 * math.sin(d.x * 13 + d.z * 11) * math.sin(d.y * 12 + 1))
def forma_afro(q, n):
    borda = 0.04 + 0.96 * suave(acima_da_linha(q) / 0.045); d = (q - AFRO_C).normalized()
    c = caroco(d * AFRO_R, 45); c2 = caroco(d * AFRO_R + Vector((3, 1, 2)), 110)
    alvo = AFRO_C + d * (afro_raio(d) + 0.012 * c + 0.005 * c2 + 0.003 * _ruido.noise(d * 30))
    perto = q + n * 0.004; p = perto.lerp(alvo, borda) if (alvo - AFRO_C).length > (perto - AFRO_C).length else perto
    return p, 0.38 + 0.62 * borda * (0.55 + 0.3 * c + 0.15 * c2), (d.x * 0.15 / 0.025 + d.y * 0.15 / 0.05, d.z * 0.15 / 0.025)
CORTES["black power"] = esculpir("cabelo_blackpower", lambda p: no_couro(p, 0.02), forma_afro, cortes=6, corta=na_linha, alisa=12, alguma=True, apaga=na_orelha)

# dreads: cordas caindo da cabeça até o ombro, com textura de fio e nós ao longo
def dir_dread(p, t):
    s, u, f = loc(p)
    return (U * -1 + F * -0.35 + S * (0.25 if s > 0 else -0.25) * (1 - t)).normalized()
rnd = random.Random(11); bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap"); cor = bm.loops.layers.color.new("Col")
for k, (p, nn) in enumerate(amostrar(no_couro, 84, 21)):
    s, u, f = loc(p); comp = 0.14 + 0.1 * rnd.random() + (0.05 if f < 0 else -0.04)
    corda(bm, uvl, crescer(p, nn, dir_dread, comp, 10, 0.006, 0.012, 0.75, 0.15, rnd), 0.0056 + 0.0016 * rnd.random(), k, cor=cor)
CORTES["dreads"] = objeto("cabelo_dreads", bm, M_CORDA)
# trança nagô (etapa 2: "rígida"): fileiras da testa até a nuca (raio de fora pro centro acha a pele); cada fileira é
# uma trança de 3 mechas de verdade: cada mecha anda de um lado pro outro e passa por cima e por baixo das outras
def na_pele(s0, ang, folga=0.004):
    d = (F * math.cos(ang) + U * math.sin(ang)).normalized(); fora = CEN + S * s0 + d * 0.35
    hit, nq, _, _ = bvh_cab.ray_cast(fora, -d)
    return (hit + nq * folga) if hit is not None else None
bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap"); cor = bm.loops.layers.color.new("Col")
for j, s0 in enumerate((-0.058, -0.035, -0.012, 0.012, 0.035, 0.058)):
    caminho = []
    for k in range(60):
        p = na_pele(s0, math.radians(15 + k * (235 / 59)))
        if p is not None and no_couro(p, 0.004): caminho.append(p)
    caminho = [caminho[0]] + [p for a, p in zip(caminho, caminho[1:]) if (p - a).length > 0.002] if caminho else []
    if len(caminho) < 4: continue
    tot = sum((b - a).length for a, b in zip(caminho, caminho[1:])); eixo = reamostrar(caminho, max(8, int(tot / 0.002)))
    PERIODO, A, B = 0.016, 0.0045, 0.0011
    for k in range(3):
        pts = []; dist = 0.0
        for i, c in enumerate(eixo):
            if i: dist += (c - eixo[i - 1]).length
            t = (eixo[min(i + 1, len(eixo) - 1)] - eixo[max(i - 1, 0)]).normalized(); q, nq, _, _ = bvh_cab.find_nearest(c); lado = t.cross(nq).normalized()
            th = dist / PERIODO * 6.2832 + k * 2.0944; afina = min(1.0, dist / 0.012, (tot - dist) / 0.02 + 0.3)
            pts.append(c + lado * A * math.sin(th) * afina + nq * (B * (1 + math.sin(2 * th)) * afina))
        corda(bm, uvl, pts, 0.0026, j * 10 + k, colunas=(0, 1), lados=5, cor=cor)
CORTES["trança nagô"] = objeto("cabelo_tranca", bm, M_CORDA)

# ================= pelo facial esculpido (etapa 3, 2026-11-21: "barba, bigode, sobrancelha, cílios granulados") ====
# Barba, bigode, cavanhaque e sobrancelha: como o cabelo, VOLUME da própria pele (subdividida e empurrada pra fora,
# mais grossa no queixo, fina na bochecha, sumindo na borda), com sulcos na direção do pelo e a textura de fio fino
# por cima. A borda some pelo alfa do vértice (macia, sem contorno duro). A boca fica de fora com folga.
# medidas do rosto escaneado (2026-11-21, perfil da linha do meio; o olho fica em u -0,02): ponta do nariz -0,048,
# base do nariz -0,066, lábio de cima -0,073 a -0,083, lábio de baixo até -0,1, queixo até -0,145. (As faixas de antes
# eram da cabeça antiga e punham o bigode no meio do nariz: o zigue-zague embaixo do olho.)
# Cada região é um CAMPO: a distância (m) até a borda da forma, positiva dentro. A borda e a espessura saem dessa
# distância, não das faces da cabeça: com a região escolhida por face, o contorno seguia a malha em escada e o queixo
# do cavanhaque era uma laje cortada reta (2026-11-21, "bigode pintado", "bloco colado").
def _elipse(x, y, a, b):
    """distância aproximada à borda da elipse de semieixos a, b (positiva dentro)"""
    return (1 - math.sqrt((x / a) ** 2 + (y / b) ** 2)) * min(a, b)
def _boca(s, u, f): return _elipse(s, u + 0.083, 0.03, 0.02) if f > 0.06 else -1.0
def no_rosto(p):
    s, u, f = loc(p); a = abs(math.degrees(math.atan2(s, f)))
    orelha_ = min(0.016 - u, u + 0.04, (118 - a) * 0.0015, (a - 80) * 0.0015) if abs(s) > 0.06 else -1.0
    pescoco = u + 0.12 + 0.045 * suave(f / 0.06)          # embaixo da mandíbula: do ângulo dela (atrás) até o pomo (na frente)
    return min(f + 0.005, -0.035 - 0.5 * max(0.0, f - 0.01) - u, pescoco, -_boca(s, u, f), -orelha_)
def bigode(p):
    s, u, f = loc(p); x = abs(s)
    topo = -0.0665 - 0.012 * (x / 0.03) ** 2             # embaixo do nariz, descendo pros cantos
    fundo = -0.0775 - 0.016 * (x / 0.034) ** 2           # cobre a beira do lábio de cima e cai nos cantos da boca
    return min(topo - u, u - fundo, 0.035 - x, f - 0.07)
def queixo(p):
    s, u, f = loc(p); return min(_elipse(s, u + 0.127, 0.025 + 0.004 * max(0.0, (-u - 0.12) / 0.03), 0.024), f - 0.03)
def costeleta(p):
    s, u, f = loc(p); x = abs(s); return min(x - 0.026, 0.041 - x, u + 0.135, -0.072 - u, f - 0.06)
def pelo_facial(nome, partes, borda_m=0.005, rampa=0.01, cortes=3, irregular=0.0006):
    """partes: [(campo, espessura(q) em metros, (u, v) do fio em metros a partir de q)]: uma malha; o alfa e a
    espessura sobem da borda pra dentro pela distância do campo (contorno liso e o volume em domo, sem parede)"""
    me = h.data; mw = h.matrix_world; bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap"); cor = bm.loops.layers.color.new("Col")
    for campo, espessura, fio in partes:
        # um pouco além da borda: o alfa já chega a zero dentro da malha
        dist = lambda q: campo(q) + irregular * _ruido.noise(q * 140)   # contorno um pouco irregular, como pelo de verdade
        faces = [f for f in me.polygons if max(campo(mw @ me.vertices[i].co) for i in f.vertices) > -0.006]
        if not faces: continue
        sub = bmesh.new(); mapa = {}
        for f in faces:
            vs = []
            for i in f.vertices:
                if i not in mapa: mapa[i] = sub.verts.new(mw @ me.vertices[i].co)
                vs.append(mapa[i])
            sub.faces.new(vs)
        bmesh.ops.subdivide_edges(sub, edges=sub.edges[:], cuts=cortes, use_grid_fill=True)
        novo = {}
        for v in sub.verts:
            q, nq, _, _ = bvh_cab.find_nearest(v.co); q = q if q is not None else v.co.copy(); nq = (nq or U).normalized()
            d = dist(q); fade = suave(d / borda_m); uu, vv = fio(q)
            g = sulco(uu / 0.0035 + 1.4 * _ruido.noise(q * 70), 2)
            alt = espessura(q) * suave(d / rampa) * (1 - 0.1 * g) + 0.0004 * _ruido.noise(q * 150)
            novo[v] = (q + nq * (0.0005 + max(0.0, alt)), (uu / 0.02, vv / 0.02), 0.62 + 0.38 * (1 - 0.15 * g), fade, d)
        for f in sub.faces:
            if max(novo[v][4] for v in f.verts) <= 0: continue   # toda fora da borda: some
            nf = bm.faces.new([bm.verts.new(novo[v][0]) for v in f.verts]); nf.smooth = True
            for lp, v in zip(nf.loops, f.verts):
                _, uv, s, fade, _d = novo[v]; lp[uvl].uv = uv; lp[cor] = (s, s, s, fade)
        sub.free()
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)   # as faces vizinhas voltam a dividir o vértice (sombra lisa)
    return objeto(nome, bm, M_CORDA)
def fio_barba(q): s, u, f = loc(q); return s + 0.15 * u, -u          # o pelo desce (um pouco pra frente no queixo)
def fio_bigode(q):
    s, u, f = loc(q); a = 0.55 * (1 if s > 0 else -1)
    return s * math.cos(a) + u * math.sin(a), -u * math.cos(a) + s * math.sin(a)       # pra baixo e pra fora
def grossura_barba(q):
    s, u, f = loc(q); return 0.0032 + 0.0055 * suave((-u - 0.1) / 0.04) * suave((0.05 - abs(s)) / 0.03)   # o queixo é mais cheio
PELO = {}
fina = lambda e: (lambda q: e)
PELO["cheia"] = pelo_facial("barba_cheia", [(no_rosto, grossura_barba, fio_barba), (bigode, fina(0.0032), fio_bigode)], borda_m=0.008, rampa=0.012)
PELO["sem bigode"] = pelo_facial("barba_sembigode", [(no_rosto, grossura_barba, fio_barba)], borda_m=0.008, rampa=0.012)
PELO["cavanhaque"] = pelo_facial("barba_cavanhaque", [(queixo, lambda q: 0.0045, fio_barba), (bigode, fina(0.003), fio_bigode)], borda_m=0.004, rampa=0.009)
PELO["ferradura"] = pelo_facial("barba_ferradura", [(bigode, fina(0.003), fio_bigode), (costeleta, fina(0.003), fio_barba)], borda_m=0.004, rampa=0.006)
# sobrancelha: faixa curva acima do olho, mais grossa no começo (perto do nariz) e afinando até uma ponta fina pra
# fora; o pelo deita pra fora e um pouco pra cima. Campo como a barba (antes, escolhida por face, a ponta de fora saía
# serrilhada e a faixa tinha borda dura em cima e embaixo)
def campo_sobr(p):
    melhor = -1.0
    for l, sg in (("l", 1), ("r", -1)):
        c, _ = OLHOS[l]; dx = (p.x - c.x) * sg
        if p.y > c.y + 0.02 or not -0.03 < dx < 0.046: continue
        meio = c.z + 0.018 + 0.004 * math.cos(min(1.5, max(-1.5, (dx - 0.004) / 0.02)))
        meia = (0.0056 - 0.0018 * max(0.0, dx / 0.028)) * (0.35 + 0.65 * suave((0.035 - dx) / 0.018))
        melhor = max(melhor, min(meia - abs(p.z - meio), dx + 0.019, 0.035 - dx))
    return melhor
def fio_sobr(q):
    for l, sg in (("l", 1), ("r", -1)):
        c, _ = OLHOS[l]
        if (q.x - c.x) * sg > -0.03: dx = (q.x - c.x) * sg; return q.z - c.z - 0.25 * dx, dx
    return q.z, q.x
PELO["sobrancelha"] = pelo_facial("rosto_sobrancelhas", [(campo_sobr, lambda q: 0.0013, fio_sobr)], borda_m=0.0032, rampa=0.003, cortes=4, irregular=0.0005)
CABELOS_OBJ = list(CORTES.values()) + list(PELO.values())
