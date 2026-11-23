# Roupas de entrada e acessórios do corpo realista (2026-11-20), modelados em cima do corpo na pose de descanso do jogo.
# Roupa de corpo (roupão, kimono, moletom, bandeira, prajiad, árbitro) sai com pesos de osso (passados do corpo por
# proximidade) e o jogo liga no esqueleto do lutador pelo nome do osso; peça de cabeça (mongkol, papakha) sai sem
# pesos, como o cabelo. Cada parte tem material pelo papel (MI_Tecido, MI_Debrum, MI_Cinta, MI_Corda2, MI_Pelo...):
# o jogo pinta pela cor de entrada. Roda dentro do corpo.py (exec): usa h, R, POS, peca, material, OLHOS, cfg e as
# funções do cabelos.py (loc, mundo, CEN, bvh_cab, cascas, objeto).
import bpy, bmesh, math, random
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

# a superfície de fora: o corpo e o calção (embaixo do calção o corpo foi apagado; sem o calção os raios na nádega
# não acertavam nada e a capa ia parar na frente do lutador)
def _bvh_de(objs):
    vs, fs = [], []
    for o in objs:
        base = len(vs); vs += [o.matrix_world @ v.co for v in o.data.vertices]; fs += [[base + i for i in p.vertices] for p in o.data.polygons]
    return BVHTree.FromPolygons(vs, fs)
bvh_corpo = _bvh_de([h, calcao])
Z = lambda n: POS[n].z
zq, zcin, zpeito, zpesc = Z("pelvis"), Z("spine_01"), Z("spine_03"), Z("neck_01")
zjoelho = (Z("calf_l") + Z("calf_r")) / 2
FRENTE = Vector((0, -1, 0))
MAT = {}
def mat(nome, cor, rug=0.8, metal=0.0):
    if nome not in MAT:
        MAT[nome] = material(nome, cor, rug)
        MAT[nome].node_tree.nodes["Principled BSDF"].inputs["Metallic"].default_value = metal
    return MAT[nome]
def junta_bm(destino, objs):
    """junta outros objetos (malha) no destino e apaga eles"""
    bm = bmesh.new(); bm.from_mesh(destino.data)
    for o in objs:
        me = o.data.copy(); me.transform(o.matrix_world); mapa = {}
        for m in me.materials:
            if m.name not in [x.name for x in destino.data.materials]: destino.data.materials.append(m)
        idx = {i: [x.name for x in destino.data.materials].index(m.name) for i, m in enumerate(me.materials)}
        for p in me.polygons: p.material_index = idx.get(p.material_index, 0)
        bm.from_mesh(me); bpy.data.meshes.remove(me); bpy.data.objects.remove(o, do_unlink=True)
    bm.to_mesh(destino.data); bm.free()
def obj_de_bm(nome, bm, material_):
    me = bpy.data.meshes.new(nome); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    o = bpy.data.objects.new(nome, me); bpy.context.scene.collection.objects.link(o); me.materials.append(material_)
    return o
def tubo(bm, pts, raio, lados=8, fechado=False, torcao=0.0, achata=1.0):
    aneis = []; n = len(pts)
    for i, p in enumerate(pts):
        a, b = pts[(i - 1) % n if fechado else max(i - 1, 0)], pts[(i + 1) % n if fechado else min(i + 1, n - 1)]
        t = (b - a).normalized(); b1 = t.orthogonal().normalized() if i == 0 else (b1 - t * b1.dot(t)).normalized(); b2 = t.cross(b1)
        rot = torcao * i
        aneis.append([bm.verts.new(p + (b1 * math.cos(k * 6.2832 / lados + rot) + b2 * achata * math.sin(k * 6.2832 / lados + rot)) * raio) for k in range(lados)])
    pares = list(zip(aneis, aneis[1:])) + ([(aneis[-1], aneis[0])] if fechado else [])
    for A, B in pares:
        for k in range(lados): bm.faces.new((A[k], A[(k + 1) % lados], B[(k + 1) % lados], B[k]))
def pesar(o):
    """pesos de osso do corpo, por proximidade (só os grupos de osso), normalizados; e liga na armadura"""
    ossos = {b.name for b in R.data.bones}
    for g in h.vertex_groups:
        if g.name in ossos and g.name not in o.vertex_groups: o.vertex_groups.new(name=g.name)
    dt = o.modifiers.new("pesos", "DATA_TRANSFER"); dt.object = h; dt.use_vert_data = True; dt.data_types_verts = {"VGROUP_WEIGHTS"}
    dt.vert_mapping = "POLYINTERP_NEAREST"; dt.layers_vgroup_select_src = "ALL"; dt.layers_vgroup_select_dst = "NAME"
    bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier="pesos")
    for g in list(o.vertex_groups):
        if g.name not in ossos: o.vertex_groups.remove(g)
    for x in bpy.data.objects: x.select_set(x is o)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    o.parent = R; m = o.modifiers.new("Armature", "ARMATURE"); m.object = R
    return o
def materiais_por(o, papel):
    """papel(centro, normal) -> índice do material da face"""
    for p in o.data.polygons: p.material_index = papel(o.matrix_world @ p.center, p.normal)

# ---------------- saia (barra do roupão e do kimono): anel na altura do quadril descendo com dobras ----------------
def saia(nome, z0, z1, folga0, folga1, dobras, amp, mat_tecido, linhas=10, colunas=64, abre=0.0):
    bm = bmesh.new(); aneis = []
    centro = Vector((POS["pelvis"].x, POS["pelvis"].y, 0))
    for i in range(linhas + 1):
        t = i / linhas; z = z0 + (z1 - z0) * t; anel = []
        for k in range(colunas):
            a = k / colunas * 6.2832; d = Vector((math.sin(a), -math.cos(a), 0))   # a = 0 é a frente
            # raio: do corpo naquela altura (raio de fora pra dentro) mais a folga, com dobras que crescem pra baixo
            fora = centro + Vector((0, 0, z)) + d * 0.6
            hit = bvh_corpo.ray_cast(fora, -d)[0]
            # o raio é o maior do corpo dali até o alto do quadril (a saia passa por fora da nádega e não entra entre as pernas)
            r0 = 0.12
            for zz in [z] + [zq - 0.1 + 0.03 * j for j in range(7) if zq - 0.1 + 0.03 * j >= z - 0.001]:
                o_ = centro + Vector((0, 0, zz)); hh = bvh_corpo.ray_cast(o_ + d * 0.6, -d)[0]
                if hh: r0 = max(r0, (hh - o_).length)
            r = r0 + folga0 + (folga1 - folga0) * t + amp * t * math.sin(a * dobras + 0.7 * math.sin(a * 3))
            anel.append(bm.verts.new(centro + Vector((0, 0, z)) + d * r))
        aneis.append(anel)
    for A, B in zip(aneis, aneis[1:]):
        for k in range(colunas):
            if abre and (k < abre or k >= colunas - abre): continue   # frente aberta
            bm.faces.new((A[k], A[(k + 1) % colunas], B[(k + 1) % colunas], B[k]))
    return obj_de_bm(nome, bm, mat_tecido)

def camisa(nome, ate_braco, folga, folga_braco, mat_tecido, decote=None, z_baixo=None, gola=False, suave=8):
    """casca do tronco e dos braços (até a fração ate_braco do antebraço), com decote em V opcional"""
    z_baixo = zq - 0.02 if z_baixo is None else z_baixo
    def escolhe(co, d):
        w = h.matrix_world @ co
        if d in ("hand_l", "hand_r") or (d and d.split("_")[0] in ("index", "middle", "ring", "pinky", "thumb")): return False
        if d and d.startswith("lowerarm"):
            l = d[-1]; t = (w - POS["lowerarm_" + l]).dot((POS["hand_" + l] - POS["lowerarm_" + l]).normalized()) / (POS["hand_" + l] - POS["lowerarm_" + l]).length
            return t < ate_braco
        if d and (d.startswith("thigh") or d.startswith("calf") or d.startswith("foot") or d.startswith("ball")): return False
        if d in ("neck_01", "head"): return w.z < zpesc - 0.01 and not gola
        if decote and decote(w): return False
        return w.z > z_baixo
    def empurra(co, _):
        w = h.matrix_world @ co; braco = abs(w.x) > 0.2
        costas = max(0.0, min(1.0, (w.y - POS["spine_03"].y) / 0.05)) * max(0.0, min(1.0, (w.z - zpeito + 0.15) / 0.1))
        return (folga_braco if braco else folga) + 0.018 * costas
    p = peca(h, nome, escolhe, empurra, 0.004, mat_tecido, maioria=True, suave=suave, solido=False)
    alisar_borda(p, 10, furo=12)   # decote, punho e barra cortados da malha do corpo saíam em degraus
    engrossar(p, 0.004); sem_espinho(p)
    return p

ROUPAS = {}
def pesos_da_saia(o, z_barra, coxa_max=0.45, meio=0.1):
    """a saia (do quadril pra baixo) pela altura: a pelve e só um pouco da coxa do lado. Por proximidade a coxa da
    frente puxava o pano inteiro e a barra rasgava em cacos na guarda (kimono e roupão, 2026-11-21)"""
    gs = {n: o.vertex_groups.get(n) for n in ("pelvis", "thigh_l", "thigh_r")}; todos_ = list(o.vertex_groups)
    for v in o.data.vertices:
        w = o.matrix_world @ v.co
        if w.z > zq + 0.02: continue
        for g in todos_: g.remove([v.index])
        t = max(0.0, min(1.0, (zq + 0.02 - w.z) / max(0.05, zq + 0.02 - z_barra))); lado = max(0.0, min(1.0, (abs(w.x) - 0.02) / meio))
        coxa = coxa_max * t * lado
        gs["pelvis"].add([v.index], 1.0 - coxa, "REPLACE"); gs["thigh_l" if w.x > 0 else "thigh_r"].add([v.index], coxa, "REPLACE")
    return o
# ================= roupão (boxe): cetim, gola xale e debrum dourados, manga até o meio do antebraço, até o joelho, faixa =================
largura_v = lambda w: 0.025 + 0.11 * max(0.0, (w.z - (zpeito - 0.12)) / (zpesc - zpeito + 0.12))
dec_v = lambda w: w.y < POS["spine_03"].y - 0.02 and abs(w.x) < largura_v(w) and w.z > zpeito - 0.12
tec = mat("MI_Tecido", (.5, .05, .04), 0.32, 0.05); deb = mat("MI_Debrum", (.83, .63, .1), 0.3, 0.6); cin = mat("MI_Cinta", (.3, .03, .03), 0.4)
top = camisa("roupao", 0.55, 0.026, 0.022, tec, decote=dec_v, z_baixo=zq + 0.06)
top.data.materials.append(deb)
saia_r = saia("roupao_saia", zq + 0.1, zjoelho + 0.06, 0.056, 0.1, 9, 0.016, tec)   # folgada: o calção (solto desde 2026-11-23) não aparece quando a coxa avança
saia_r.data.materials.append(deb)
materiais_por(saia_r, lambda c, n: 1 if c.z < zjoelho + 0.11 or (c.y < POS["pelvis"].y - 0.05 and abs(c.x) < 0.035) else 0)   # barra e a frente
def papel_top(c, n):
    if abs(c.x) > 0.2:   # manga: o punho dourado
        l = "l" if c.x > 0 else "r"; fim = POS["lowerarm_" + l] + (POS["hand_" + l] - POS["lowerarm_" + l]) * 0.55
        return 1 if (c - fim).length < 0.06 else 0
    return 0
materiais_por(top, papel_top)
# gola xale: faixa dourada na linha do V (no corpo, com a folga do tecido), dando a volta atrás do pescoço
def na_frente(x, z, folga):
    o_ = Vector((x, POS["spine_03"].y - 0.5, z)); hit, nq, _, _ = bvh_corpo.ray_cast(o_, Vector((0, 1, 0)))
    return hit + nq * folga if hit else None
bm = bmesh.new(); lados = {}
for lado in (1, -1):
    lados[lado] = [p for p in (na_frente(lado * (largura_v(Vector((0, 0, z))) + 0.008), z, 0.034) for z in
                   [zpeito - 0.13 + k * ((zpesc - zpeito + 0.11) / 16) for k in range(17)]) if p]
atras = sorted([Vector((math.sin(a) * 0.08, POS["neck_01"].y + math.cos(a) * 0.07 + 0.012, zpesc - 0.005)) for a in [math.radians(x) for x in range(-70, 71, 14)]], key=lambda p: -p.x)
if lados[1] and lados[-1]:
    tubo(bm, list(reversed(lados[1])) + atras + lados[-1], 0.026, 8, achata=0.3)
gola_o = obj_de_bm("roupao_gola", bm, deb)
bm = bmesh.new()   # faixa na cintura e o laço
pts = []
for k in range(40):
    a = k / 40 * 6.2832; d = Vector((math.sin(a), -math.cos(a), 0)); base = Vector((POS["pelvis"].x, POS["pelvis"].y, zcin - 0.01))
    hit = bvh_corpo.ray_cast(base + d * 0.6, -d)[0]; pts.append((hit if hit else base + d * 0.15) + d * 0.04)
tubo(bm, pts, 0.016, 8, fechado=True, achata=0.45)
frente = pts[0]; tubo(bm, [frente + Vector((0.01, -0.012, 0)), frente + Vector((0.03, -0.02, -0.12)), frente + Vector((0.035, -0.022, -0.26))], 0.016, 6, achata=0.35)
tubo(bm, [frente + Vector((-0.01, -0.012, 0)), frente + Vector((-0.02, -0.02, -0.1)), frente + Vector((-0.03, -0.024, -0.22))], 0.016, 6, achata=0.35)
faixa = obj_de_bm("roupao_faixa", bm, cin)
junta_bm(top, [saia_r, faixa, gola_o])
ROUPAS["roupão"] = pesos_da_saia(pesar(top), zjoelho + 0.06, coxa_max=0.8, meio=0.05)   # aberto na frente: cada lado segue a sua coxa
print("ROUPA roupão", len(top.data.polygons))

def faixa_cintura(nome, z, folga, raio, material_, pontas=True, achata=0.45):
    bm = bmesh.new(); pts = []
    for k in range(40):
        a = k / 40 * 6.2832; d = Vector((math.sin(a), -math.cos(a), 0)); base = Vector((POS["pelvis"].x, POS["pelvis"].y, z))
        hit = bvh_corpo.ray_cast(base + d * 0.6, -d)[0]; pts.append((hit if hit else base + d * 0.15) + d * folga)
    tubo(bm, pts, raio, 8, fechado=True, achata=achata)
    if pontas:
        f0 = pts[0]
        tubo(bm, [f0 + Vector((0.01, -0.014, 0)), f0 + Vector((0.035, -0.024, -0.1)), f0 + Vector((0.04, -0.026, -0.22))], raio, 6, achata=0.35)
        tubo(bm, [f0 + Vector((-0.01, -0.014, 0)), f0 + Vector((-0.025, -0.024, -0.09)), f0 + Vector((-0.035, -0.028, -0.19))], raio, 6, achata=0.35)
        n_ = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=raio * 1.5)
        for v in n_["verts"]: v.co = Vector((v.co.x * 1.2, v.co.y * 0.7, v.co.z)) + f0 + Vector((0, -0.016, 0))
    return obj_de_bm(nome, bm, material_)
def lapela(nome, folga, larga, material_, z_ini, desce_ate=None):
    """faixa ao longo do V (e descendo pela frente até desce_ate), por cima do tecido"""
    bm = bmesh.new(); lados = {}
    for lado in (1, -1):
        zs = [z_ini + k * ((zpesc - z_ini + 0.02) / 16) for k in range(17)]
        pts = [p for p in (na_frente(lado * (largura_v(Vector((0, 0, z))) + 0.008), z, folga) for z in zs) if p]
        if desce_ate is not None:
            baixo = [na_frente(lado * 0.02, z, folga + 0.01) for z in [desce_ate + k * ((z_ini - desce_ate) / 8) for k in range(8)]]
            pts = [p for p in baixo if p] + pts
        lados[lado] = pts
    atras = sorted([Vector((math.sin(a) * 0.08, POS["neck_01"].y + math.cos(a) * 0.07 + 0.012, zpesc - 0.005)) for a in [math.radians(x) for x in range(-70, 71, 14)]], key=lambda p: -p.x)
    tubo(bm, list(reversed(lados[1])) + atras + lados[-1], larga, 8, achata=0.3)
    return obj_de_bm(nome, bm, material_)

# ================= kimono (gi): algodão grosso, lapela grossa, até o meio da coxa, faixa preta =================
gi = mat("MI_Tecido", (.5, .05, .04)); lap = mat("MI_Lapela", (.8, .78, .74), 0.95); preta = mat("MI_Cinta", (.3, .03, .03))
k_top = camisa("kimono", 0.88, 0.022, 0.024, gi, decote=lambda w: w.y < POS["spine_03"].y - 0.02 and abs(w.x) < largura_v(w) * 0.8 and w.z > zpeito - 0.16, z_baixo=zq + 0.06, suave=6)
k_saia = saia("kimono_saia", zq + 0.1, zq - 0.2, 0.05, 0.085, 5, 0.008, gi)   # por fora do calção (folgada: a coxa avança na guarda)
k_lap = lapela("kimono_lapela", 0.03, 0.03, lap, zpeito - 0.15, desce_ate=zq - 0.18)
k_fx = faixa_cintura("kimono_faixa", zcin - 0.03, 0.032, 0.019, preta)
junta_bm(k_top, [k_saia, k_lap, k_fx])
ROUPAS["kimono"] = pesos_da_saia(pesar(k_top), zq - 0.2)

# ================= moletom com capuz levantado (etapa 3, 2026-11-21: "deixa ele mais parecendo um moletom mesmo") =====
# O que faz um moletom ler como moletom: corpo largo e reto (cai do peito, não marca músculo), punho e barra canelados
# apertando, bolso canguru costurado por cima, capuz com volume (pico atrás, aba em volta do rosto, caindo nos ombros)
# e os cordões. Tudo modelado aqui; a trama do algodão vem do jogo.
mol = mat("MI_Tecido", (.5, .05, .04)); can = mat("MI_Debrum", (.42, .04, .03)); cord = mat("MI_Cordao", (.85, .85, .87), 0.6)
from mathutils.bvhtree import BVHTree as _BVH
FIM_MANGA = 0.8                      # fração do antebraço: o punho acaba antes da luva
CANELADO = 0.065                     # altura da barra e do punho
z_barra = zq - 0.035
def _escolhe_moletom(co, d):
    w = h.matrix_world @ co
    if d in ("hand_l", "hand_r") or (d and d.split("_")[0] in ("index", "middle", "ring", "pinky", "thumb")): return False
    if d and d.startswith("lowerarm"):
        l = d[-1]; t = (w - POS["lowerarm_" + l]).dot((POS["hand_" + l] - POS["lowerarm_" + l]).normalized()) / (POS["hand_" + l] - POS["lowerarm_" + l]).length
        return t < FIM_MANGA
    if d and (d.startswith("thigh") or d.startswith("calf") or d.startswith("foot") or d.startswith("ball")): return False
    if d in ("neck_01", "head"): return False
    return w.z > z_barra and w.z < zpesc - 0.005
def _folga_moletom(co, _):
    w = h.matrix_world @ co   # o cotovelo dobrado na guarda furava a manga: mais pano em volta dele
    cot = min((w - POS["lowerarm_" + l]).length for l in "lr")
    return 0.032 + 0.016 * max(0.0, 1 - cot / 0.09)
m_top = peca(h, "moletom", _escolhe_moletom, _folga_moletom, 0.004, mol, maioria=True, suave=18, solido=False)
alisar_borda(m_top, 10, furo=12)
# corpo: do peito pra baixo o pano cai reto (o raio em cada direção é o maior do corpo dali até o peito, mais a folga),
# e a barra canelada aperta no quadril; manga: o punho canelado aperta no antebraço
_cent = {}
def _centro(z):
    k = round(z, 2)
    if k not in _cent:
        a = bvh_corpo.ray_cast(Vector((0, -1.0, k)), Vector((0, 1, 0)))[0]; b = bvh_corpo.ray_cast(Vector((0, 1.0, k)), Vector((0, -1, 0)))[0]
        _cent[k] = Vector((0, (a.y + b.y) / 2 if a and b else POS["spine_02"].y - 0.03, k))
    return _cent[k]
def _raio(c, d, z):
    o_ = Vector((c.x, c.y, z)); hit = bvh_corpo.ray_cast(o_ + d * 0.6, -d)[0]
    return (Vector((hit.x, hit.y, z)) - o_).length if hit else 0.12
def _eixo_braco(w):
    l = "l" if w.x > 0 else "r"; a, b = POS["lowerarm_" + l], POS["hand_" + l]; t = (w - a).dot((b - a).normalized()) / (b - a).length
    return l, a, b, t
canelado_v = set()
mw = m_top.matrix_world; mi = mw.inverted()
for v in m_top.data.vertices:
    w = mw @ v.co
    if abs(w.x) < 0.2 and w.z < zpeito + 0.02:
        c = _centro(w.z); d = Vector((w.x - c.x, w.y - c.y, 0))
        if d.length < 1e-4: continue
        d.normalize(); r = d.dot(Vector((w.x - c.x, w.y - c.y, 0)))
        # na frente o pano cai do peito; atrás, um pouco mais de cima (das escápulas pra cima o braço entra no meio)
        teto = zpeito if d.y < 0 else zpeito + 0.04
        quer = max(_raio(c, d, zz) for zz in [w.z + k * 0.02 for k in range(int((teto - w.z) / 0.02) + 1)]) + 0.035
        if w.z < z_barra + CANELADO:   # barra canelada: aperta até 1,2 cm do corpo
            canelado_v.add(v.index); t = (z_barra + CANELADO - w.z) / CANELADO
            quer = quer * (1 - 0.6 * t) + (_raio(c, d, w.z) + 0.012) * 0.6 * t
        if r < quer: w = c + Vector((0, 0, w.z - c.z)) + d * quer + Vector((0, 0, 0))
        v.co = mi @ Vector((w.x, w.y, w.z))
    elif abs(w.x) >= 0.2:
        l, a, b, t = _eixo_braco(w)
        if t > FIM_MANGA - CANELADO / (b - a).length:   # punho
            canelado_v.add(v.index); eixo = a + (b - a) * max(0.0, min(1.0, t)); q, nq, _, _ = bvh_corpo.find_nearest(w)
            if q is not None: w = q + nq * 0.012
            v.co = mi @ w
# as costas: alisadas de novo (moletom não mostra escápula nem dorsal) e devolvidas pra fora do corpo
bm = bmesh.new(); bm.from_mesh(m_top.data)
costas_v = [v for v in bm.verts if v.index not in canelado_v and abs((mw @ v.co).x) < 0.17 and zpeito - 0.25 < (mw @ v.co).z < zpesc - 0.04
            and (mw @ v.co).y > _centro((mw @ v.co).z).y and not v.is_boundary]
for _ in range(30): bmesh.ops.smooth_vert(bm, verts=costas_v, factor=0.7, use_axis_x=True, use_axis_y=True, use_axis_z=True)
for v in costas_v:
    w = mw @ v.co; q, nq, _, _ = bvh_corpo.find_nearest(w)
    if q is not None and (w - q).dot(nq) < 0.03: v.co = mi @ (q + nq * 0.03)
bm.to_mesh(m_top.data); bm.free()
engrossar(m_top, 0.004); sem_espinho(m_top)
m_top.data.materials.append(can)
# o canelado pelo lugar (a casca grossa duplica os vértices, então decide pela posição da face)
def _papel_moletom(c, n):
    if abs(c.x) < 0.2: return 1 if c.z < z_barra + CANELADO - 0.004 else 0
    l, a, b, t = _eixo_braco(c); return 1 if t > FIM_MANGA - (CANELADO - 0.004) / (b - a).length else 0
materiais_por(m_top, _papel_moletom)
bainha(m_top, 0.0055, 1, achata=0.7)   # barra, punho e gola dobrados
bvh_mol = _BVH.FromObject(m_top, bpy.context.evaluated_depsgraph_get())
def na_frente_mol(x, z, folga):
    hit, nq, _, _ = bvh_mol.ray_cast(Vector((x, POS["spine_03"].y - 0.6, z)), Vector((0, 1, 0)))
    return hit + nq * folga if hit else None

# bolso canguru: um painel costurado na frente, mais largo embaixo, com as aberturas inclinadas dos lados
bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap"); z0, z1 = z_barra + CANELADO + 0.01, z_barra + CANELADO + 0.17; grade = []
for i in range(9):
    t = i / 8; z = z0 + (z1 - z0) * t; meia = 0.135 - 0.045 * t; linha_ = []
    for j in range(13):
        x = -meia + 2 * meia * j / 12; p = na_frente_mol(x, z, 0.003 + 0.002 * math.sin(math.pi * j / 12) * (1 - t))   # estufa um pouco
        linha_.append(bm.verts.new(p) if p else None)
    grade.append(linha_)
for i in range(8):
    for j in range(12):
        q = (grade[i][j], grade[i][j + 1], grade[i + 1][j + 1], grade[i + 1][j])
        if all(q):
            f = bm.faces.new(q)
            for lp in f.loops: lp[uvl].uv = (lp.vert.co.x / 1.5, lp.vert.co.z / 1.5)
bolso = obj_de_bm("moletom_bolso", bm, mol); engrossar(bolso, 0.003); bolso.data.materials.append(can)
bainha(bolso, 0.0035, 1, achata=0.6, minimo=8)   # a costura em volta (e a borda das aberturas)

# capuz levantado: uma casca em volta da cabeça (raio da pele + folga), com pico atrás e mais solta embaixo, caindo
# nos ombros; a abertura do rosto é uma elipse (testa ao queixo, bochecha a bochecha) que desce em V até o pescoço
HC = CEN + F * -0.012
def _dir(az, pol): return (S * math.sin(pol) * math.sin(az) + F * math.sin(pol) * math.cos(az) + U * math.cos(pol)).normalized()
def _abertura(az, pol):
    el = 90 - math.degrees(pol); a = math.degrees(az)
    return (a / 60) ** 2 + ((el + 14) / 50) ** 2 < 1 or (el < -40 and abs(a) < 34 - 0.5 * (-el - 40))
NA, NP = 72, 32; bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap"); vs = []; RR = []
for i in range(NP + 1):
    pol = math.radians(3 + 155 * i / NP); linha_ = []
    for j in range(NA):
        az = -math.pi + 2 * math.pi * j / NA; d = _dir(az, pol)
        hit = bvh_corpo.ray_cast(HC + d * 0.45, -d)[0]; base_r = min((hit - HC).length if hit else 0.12, 0.15)   # (na pose de descanso o braço está aberto: sem o teto o pé do capuz ia pousar nele)
        baixo = max(0.0, (math.degrees(pol) - 95) / 63)                      # embaixo: cai nos ombros e cobre a gola
        pico = max(0.0, d.dot((U * 0.55 - F * 0.85).normalized())) ** 4      # o pico atrás do capuz
        linha_.append(base_r + 0.026 + 0.03 * baixo + 0.035 * pico)
    RR.append(linha_)
# o pano não copia a orelha nem o queixo: o raio é alisado pela grade (o que só sobe, pra não entrar na cabeça)
for _ in range(6):
    RR = [[max(RR[i][j], (RR[i][j] * 2 + RR[i][(j + 1) % NA] + RR[i][j - 1] + RR[max(0, i - 1)][j] + RR[min(NP, i + 1)][j]) / 6) for j in range(NA)] for i in range(NP + 1)]
for i in range(NP + 1):
    pol = math.radians(3 + 155 * i / NP)
    vs.append([bm.verts.new(HC + _dir(-math.pi + 2 * math.pi * j / NA, pol) * (RR[i][j] + 0.004 * math.sin(j * 6.2832 * 5 / NA + pol * 3))) for j in range(NA)])
for i in range(NP):
    for j in range(NA):
        j2 = (j + 1) % NA; az = -math.pi + 2 * math.pi * (j + 0.5) / NA; pol = math.radians(3 + 155 * (i + 0.5) / NP)
        if _abertura(az, pol): continue
        f = bm.faces.new((vs[i][j], vs[i][j2], vs[i + 1][j2], vs[i + 1][j])); f.smooth = True
        for lp, (a_, b_) in zip(f.loops, ((j, i), (j + 1, i), (j + 1, i + 1), (j, i + 1))): lp[uvl].uv = (a_ * 0.6 / NA, b_ * 0.4 / NP)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
bmesh.ops.reverse_faces(bm, faces=bm.faces[:])   # normal pra fora
capuz = obj_de_bm("capuz", bm, mol)
alisar_borda(capuz, 6, furo=12)
bainha(capuz, 0.01, 0, achata=0.55, so=lambda pts: max(loc(p)[2] for p in pts) > 0.04)   # a aba dobrada em volta do rosto
engrossar(capuz, 0.004); sem_espinho(capuz)
# cordões: saem da aba embaixo do queixo, dos dois lados, e caem no peito com a ponteira
bm = bmesh.new()
for lado in (1, -1):
    ini = HC + _dir(lado * math.radians(40), math.radians(140)) * 0.135
    p1 = na_frente_mol(ini.x + lado * 0.004, ini.z - 0.06, 0.006) or ini + Vector((0, -0.01, -0.06))
    p2 = na_frente_mol(ini.x + lado * 0.006, ini.z - 0.15, 0.006) or ini + Vector((0, -0.01, -0.15))
    tubo(bm, [ini, (ini + p1) / 2 + Vector((0, -0.006, 0)), p1, p2], 0.0028, 6)
    tubo(bm, [p2, p2 + Vector((0, -0.001, -0.022))], 0.0042, 6)
cordoes = obj_de_bm("moletom_cord", bm, cord)
n0 = len(m_top.data.vertices); n1 = n0 + len(capuz.data.vertices); nc = len(cordoes.data.vertices)
junta_bm(m_top, [capuz, bolso, cordoes])
m_top = pesar(m_top)
# capuz e cordões: pesos pela altura (cabeça em cima, pescoço, tronco nos ombros). Por proximidade o pé do capuz
# pegava ombro e braço, que giram na guarda, e o pano rasgava em cacos
_g = {n: m_top.vertex_groups.get(n) for n in ("neck_01", "spine_03")}; _g["head"] = m_top.vertex_groups.get("head") or m_top.vertex_groups.get("Head")
_todos = list(m_top.vertex_groups); _nv = len(m_top.data.vertices)
for i in list(range(n0, n1)) + list(range(_nv - nc, _nv)):
    w = m_top.matrix_world @ m_top.data.vertices[i].co
    for g in _todos: g.remove([i])
    t = max(0.0, min(1.0, (w.z - (zpesc - 0.03)) / 0.1))   # 0 no ombro, 1 na altura da orelha
    if i >= _nv - nc: _g["spine_03"].add([i], 1.0, "REPLACE"); continue
    _g["head"].add([i], t * t, "REPLACE"); _g["neck_01"].add([i], max(0.0, 1 - abs(2 * t - 1)) * 0.6, "REPLACE"); _g["spine_03"].add([i], (1 - t) ** 2, "REPLACE")
# a barra: sem a coxa (por proximidade a nádega e a coxa entravam nos pesos e, na guarda, amassavam a barra de trás em cacos)
_coxa = [m_top.vertex_groups.get(n) for n in ("thigh_l", "thigh_r") if m_top.vertex_groups.get(n)]
_pel = m_top.vertex_groups.get("pelvis")
for v in m_top.data.vertices:
    if v.index >= n0: break
    if (m_top.matrix_world @ v.co).z > zq + 0.08: continue
    tira = sum(g.weight for g in v.groups if m_top.vertex_groups[g.group] in _coxa)
    if tira <= 0: continue
    for g in _coxa: g.remove([v.index])
    _pel.add([v.index], tira, "ADD")
for x in bpy.data.objects: x.select_set(x is m_top)
bpy.context.view_layer.objects.active = m_top; bpy.ops.object.vertex_group_normalize_all(lock_active=False)
ROUPAS["capuz"] = m_top

# ================= bandeira como capa (etapa 3: "deixar ela mais parecida com uma capa de verdade") =================
# A bandeira deitada (como ela é), com a borda de cima em volta do pescoço por cima dos trapézios e as duas pontas
# amarradas num nó curto embaixo do pescoço; cai pelas costas até a coxa, abrindo um pouco, com dobras verticais
# que crescem pra baixo e a barra ondulada. Segue só o tronco de cima (a pelve gira na guarda e rasgava o pano).
band = mat("MI_Bandeira", (1, 1, 1), 0.85); verde = mat("MI_Cordao", (.12, .55, .27), 0.7)
COL, LIN = 44, 26; z_bar = zq - 0.12
yc = (bvh_corpo.ray_cast(Vector((0, -1.0, zpesc)), Vector((0, 1, 0)))[0].y + bvh_corpo.ray_cast(Vector((0, 1.0, zpesc)), Vector((0, -1, 0)))[0].y) / 2
PHI0 = math.radians(128)    # as pontas de cima vão até a frente do trapézio
def _topo(u):
    """a borda de cima: em volta do pescoço (phi 0 = atrás), em cima do trapézio (raio de cima pra baixo)"""
    phi = -PHI0 + 2 * PHI0 * u; x = math.sin(phi) * (0.085 + 0.05 * abs(math.sin(phi))); y = yc + math.cos(phi) * 0.075
    hit = bvh_corpo.ray_cast(Vector((x, y, zpesc + 0.015)), Vector((0, 0, -1)))[0]   # de baixo da nuca (de mais alto, batia na cabeça)
    return Vector((x, y, (hit.z if hit else zpesc - 0.03) + 0.012)), phi
y_costas = lambda z, x: (bvh_corpo.ray_cast(Vector((x, 1.0, z)), Vector((0, -1, 0)))[0] or Vector((0, POS["spine_03"].y + 0.1, z))).y
y_atras = max(y_costas(z, x) for z in (zpeito, zcin, zq) for x in (-0.1, 0, 0.1))
bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap"); grade = []
for i in range(LIN):
    v = i / (LIN - 1); linha_ = []
    for j in range(COL):
        u = j / (COL - 1); topo, phi = _topo(u); s_ = 2 * u - 1
        # a barra: um arco atrás das coxas, as pontas fechando um pouco em volta (aberta a 44 cm, de frente parecia
        # asa saindo do quadril)
        barra = Vector((s_ * 0.33, y_atras + 0.07 - 0.06 * s_ * s_, z_bar + 0.04 * s_ * s_))
        k = v ** 0.8; p = topo.lerp(barra, k)
        # caimento: logo abaixo do topo o pano encosta nas costas e nos ombros, depois se solta
        if v < 0.6:
            hit = bvh_corpo.ray_cast(Vector((p.x, p.y + 0.6, p.z)), Vector((0, -1, 0)))[0]
            if hit and abs(p.x) < 0.22: p.y = max(p.y, hit.y + 0.02 + 0.02 * v)
        dobra = (0.003 + 0.03 * v ** 1.3) * math.sin(u * 6.2832 * 4.5 + 0.8 * math.sin(u * 13) + 1.0)
        franzido = 0.006 * (1 - v) ** 3 * math.sin(u * 6.2832 * 11)   # junto no pescoço
        p = p + Vector((0, dobra + franzido, 0)) + Vector((0, 0, 0.012 * math.sin(u * 6.2832 * 4.5 + 2.4) * v * v))
        linha_.append(bm.verts.new(p))
    grade.append(linha_)
for i in range(LIN - 1):
    for j in range(COL - 1):
        f = bm.faces.new((grade[i][j], grade[i][j + 1], grade[i + 1][j + 1], grade[i + 1][j])); f.smooth = True
        # a bandeira deitada: u ao longo da largura (de ponta a ponta), v de cima pra baixo
        for lp, (a, b) in zip(f.loops, ((j, i), (j + 1, i), (j + 1, i + 1), (j, i + 1))): lp[uvl].uv = (a / (COL - 1), 1 - b / (LIN - 1))
bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
cantos = {-1: grade[0][0].co.copy(), 1: grade[0][-1].co.copy()}
capa = obj_de_bm("bandeira", bm, band)
# nada da capa dentro do corpo (o lado da pelve e a nádega)
mwc = capa.matrix_world
for v in capa.data.vertices:
    w = mwc @ v.co; q, nq, _, _ = bvh_corpo.find_nearest(w)
    if q is not None and (w - q).dot(nq) < 0.015: v.co = mwc.inverted() @ (q + nq * 0.015)
engrossar(capa, 0.003)
bainha(capa, 0.0035, 0, achata=0.5)   # a borda costurada
# o nó: as duas pontas de cima puxadas até embaixo do pescoço, torcidas, e um nó
bm = bmesh.new(); no = na_frente(0, zpesc - 0.075, 0.014) or Vector((0, POS["neck_01"].y - 0.09, zpesc - 0.075))
for lado in (1, -1):
    canto = cantos[lado]; meio = canto.lerp(no, 0.5) + Vector((0, -0.012, 0.006))
    tubo(bm, [canto, meio, no + Vector((lado * 0.012, 0, 0.004))], 0.012, 6, torcao=0.5, achata=0.3)
tubo(bm, [no + Vector((-0.016, -0.004, 0)), no + Vector((0, -0.012, 0.002)), no + Vector((0.016, -0.004, 0))], 0.011, 8, achata=0.7)
for lado in (1, -1):   # as pontinhas que sobram do nó
    tubo(bm, [no + Vector((lado * 0.008, -0.008, -0.004)), no + Vector((lado * 0.022, -0.012, -0.045))], 0.008, 6, achata=0.3)
amarras = obj_de_bm("bandeira_amarra", bm, verde)
junta_bm(capa, [amarras])
capa = pesar(capa)
# pesos: o topo no peito; descendo, passa pra coluna de baixo, que gira menos na guarda (só no peito a barra
# acompanhava a torção do ombro e a capa pendia pra um lado vista de costas). A pelve não: ela rasgava o pano
alvo = {n: capa.vertex_groups.get(n) for n in ("neck_01", "spine_03", "spine_02", "spine_01")}
todos = list(capa.vertex_groups)
for v in capa.data.vertices:
    w = capa.matrix_world @ v.co
    for g in todos: g.remove([v.index])
    t = max(0.0, min(1.0, (zpesc - 0.02 - w.z) / (zpesc - z_bar)))
    alvo["spine_03"].add([v.index], 1.0 - 0.8 * t, "REPLACE"); alvo["spine_02"].add([v.index], 0.45 * t, "REPLACE"); alvo["spine_01"].add([v.index], 0.35 * t, "REPLACE")
ROUPAS["bandeira"] = capa

# ================= prajiad: as fitas trançadas no braço (muay thai), a luta inteira =================
pra = mat("MI_Corda2", (.5, .05, .04), 0.75)
bm = bmesh.new()
for l in "lr":
    a, b = POS["upperarm_" + l], POS["lowerarm_" + l]; c = a + (b - a) * 0.42; eixo = (b - a).normalized(); b1 = eixo.orthogonal().normalized(); b2 = eixo.cross(b1)
    anel = []
    for k in range(28):
        ang = k / 28 * 6.2832; d = b1 * math.cos(ang) + b2 * math.sin(ang); hit = bvh_corpo.ray_cast(c + d * 0.2, -d)[0]
        anel.append((hit or c + d * 0.05) + d * 0.008)
    tubo(bm, anel, 0.0075, 6, fechado=True, torcao=0.9)
    baixo = anel[7]; tubo(bm, [baixo, baixo + eixo * 0.02 + Vector((0, 0, -0.03)), baixo + eixo * 0.03 + Vector((0, 0, -0.08))], 0.005, 5)
prajiad = obj_de_bm("prajiad", bm, pra)
ROUPAS["prajiad"] = pesar(prajiad)

# ================= árbitro: camisa preta de manga curta com gola e calça social preta =================
pr = mat("MI_Tecido", (.5, .05, .04)); ci = mat("MI_Debrum", (.83, .63, .1))
def camisa_curta(co, d):
    w = h.matrix_world @ co
    if d and (d.startswith("lowerarm") or d.startswith("hand") or d.split("_")[0] in ("index", "middle", "ring", "pinky", "thumb")): return False
    if d and d.startswith("upperarm"):
        l = d[-1]; t = (w - POS["upperarm_" + l]).dot((POS["lowerarm_" + l] - POS["upperarm_" + l]).normalized()) / (POS["lowerarm_" + l] - POS["upperarm_" + l]).length
        return t < 0.55
    if d and (d.startswith("thigh") or d.startswith("calf") or d.startswith("foot") or d.startswith("ball") or d in ("neck_01", "head")): return False
    return w.z > zq - 0.02
a_cam = peca(h, "arbitro", camisa_curta, lambda co, _: 0.016, 0.003, pr, maioria=True, suave=5)
z_tornozelo = (Z("foot_l") + Z("foot_r")) / 2 + 0.03
def calca(co, d):
    w = h.matrix_world @ co
    return d in ("pelvis", "thigh_l", "thigh_r", "calf_l", "calf_r", "spine_01") and z_tornozelo < w.z < zcin + 0.02
a_calca = peca(h, "arbitro_calca", calca, lambda co, _: 0.014 + 0.012 * max(0.0, min(1.0, (zq - (h.matrix_world @ co).z) / 0.5)), 0.003, pr, maioria=True, suave=4)
bm = bmesh.new(); gola_a = []
for k in range(21):
    a = math.radians(-150 + k * 15); p = Vector((math.sin(a) * 0.07, POS["neck_01"].y - math.cos(a) * 0.062, zpesc - 0.01 - 0.02 * max(0, -math.cos(a))))
    gola_a.append(p)
tubo(bm, gola_a, 0.012, 6, achata=0.35)
gola_o = obj_de_bm("arbitro_gola", bm, pr)
junta_bm(a_cam, [a_calca, gola_o])
ROUPAS["arbitro"] = pesar(a_cam)

# ================= mongkol (cabeça, sem pesos): corda trançada em volta da testa, enrolada em branco, rabo atrás =================
cor_m = mat("MI_Corda2", (.5, .05, .04), 0.7); bra = mat("MI_Branco", (.9, .88, .84), 0.8)
bm = bmesh.new(); anel = []
for k in range(48):
    a = k / 48 * 6.2832; d = S * math.sin(a) + F * math.cos(a); u_ = 0.03 - 0.02 * (1 - math.cos(a)) / 2   # alto na testa, desce atrás
    p = CEN + d * 0.3 + U * u_; hit, nq, _, _ = bvh_cab.ray_cast(p, -d)
    anel.append((hit + d * 0.011) if hit else CEN + d * 0.1 + U * u_)   # encostado na cabeça (pra fora, não pra cima)
tubo(bm, anel, 0.0105, 8, fechado=True, torcao=0.7)
tras = anel[24]; tubo(bm, [tras, tras + U * 0.015 + F * -0.025, tras + U * 0.03 + F * -0.055, tras + U * 0.036 + F * -0.085], 0.0075, 6)   # o rabo curvo pra trás
mong = obj_de_bm("mongkol", bm, cor_m); mong.data.materials.append(bra)
for p in mong.data.polygons:   # enrolado: faixas brancas a cada tanto da volta
    c = p.center - CEN; a = math.atan2(c.dot(S), c.dot(F)); p.material_index = 1 if math.sin(a * 9) > 0.55 else 0
mong["sem_pesos"] = True
ROUPAS["mongkol"] = mong

# ================= papakha (cabeça, sem pesos): chapéu alto de pelo (cascas de cachos, como o black power) =================
pelo = mat("MI_Pelo", (.85, .82, .76), 0.95)
anel_b = []
for k in range(40):
    a = k / 40 * 6.2832; d = S * math.sin(a) + F * math.cos(a); u_ = 0.062 - 0.012 * (1 - math.cos(a)) / 2
    p = CEN + d * 0.3 + U * u_; hit, nq, _, _ = bvh_cab.ray_cast(p, -d)
    anel_b.append((hit + nq * 0.01) if hit else CEN + d * 0.1 + U * u_)
bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap"); CAM = 5; ALT = 0.115
for camada in range(CAM):
    linhas_p = []
    for i in range(9):
        t = i / 8; linha_ = []
        for k, b in enumerate(anel_b):
            c0 = Vector((CEN.x, CEN.y, b.z)); r = (b - c0); r.z = 0; dirr = r.normalized()
            raio = r.length * (1 + 0.1 * t) + 0.006 * camada
            topo = 1 - (max(0.0, (t - 0.82) / 0.18)) ** 2 * 0.25
            p = c0 + dirr * raio * topo + U * (ALT * t + 0.006 * camada * t)
            linha_.append((bm.verts.new(p), k / len(anel_b) * 8, t * 4))
        linhas_p.append(linha_)
    tampa = bm.verts.new(Vector((CEN.x, CEN.y, anel_b[0].z)) + U * (ALT + 0.008 + 0.006 * camada))
    for A, B in zip(linhas_p, linhas_p[1:]):
        for k in range(len(anel_b)):
            k2 = (k + 1) % len(anel_b); f = bm.faces.new((A[k][0], A[k2][0], B[k2][0], B[k][0]))
            uvs = [(A[k][1], A[k][2]), ((k + 1) / len(anel_b) * 8, A[k2][2]), ((k + 1) / len(anel_b) * 8, B[k2][2]), (B[k][1], B[k][2])]
            for lp, (u, v) in zip(f.loops, uvs): lp[uvl].uv = (u, v + 10 * camada + 900)
    for k in range(len(anel_b)):
        k2 = (k + 1) % len(anel_b); f = bm.faces.new((linhas_p[-1][k][0], linhas_p[-1][k2][0], tampa))
        for lp, (u, v) in zip(f.loops, ((k / 5, 3), ((k + 1) / 5, 3), (k / 5 + 0.1, 3.4))): lp[uvl].uv = (u, v + 10 * camada + 900)
papa = obj_de_bm("papakha", bm, pelo); papa["sem_pesos"] = True
ROUPAS["papakha"] = papa
print("ROUPAS", {k: len(o.data.polygons) for k, o in ROUPAS.items()})
