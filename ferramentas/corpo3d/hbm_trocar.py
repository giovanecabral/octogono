# Troca o corpo MPFB (h) pelo corpo escaneado da Blender Studio (hbm_base.blend), no mesmo esqueleto R:
# braços do MPFB ajustados à silhueta, juntas levadas pro corpo novo, pesos e pele passados por proximidade.
# Roda dentro do corpo.py (exec), com h, R, sobr, cfg no escopo. Deixa: h (corpo novo), OLHOS_HBM, PELE_IMG, NORMAL_IMG.
import bpy, os, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
PASTA = TRAB
dg = lambda: bpy.context.evaluated_depsgraph_get()
def ativo(o):
    for x in bpy.context.view_layer.objects: x.select_set(False)
    bpy.context.view_layer.objects.active = o; o.select_set(True)
# ---- corpo novo e olhos
with bpy.data.libraries.load(os.path.join(PASTA, "hbm_base.blend"), link=False) as (src, dst):
    dst.objects = [n for n in src.objects if n.startswith("GEO-body_male_realistic")]
for o in dst.objects: bpy.context.scene.collection.objects.link(o)
bpy.context.view_layer.update()   # sem isso matrix_world ainda é a identidade
B = bpy.data.objects["GEO-body_male_realistic"]; olhosB = [o for o in dst.objects if o is not B]
for o in olhosB: mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
bpy.context.view_layer.update()
for m in list(B.modifiers): B.modifiers.remove(m)
B.data.uv_layers.remove(B.data.uv_layers["UVMap"]); B.data.uv_layers.active = B.data.uv_layers["jogo"]
# máscara do MPFB aplicada (tira os vértices de ajuda; os índices ficam estáveis daqui pra frente)
ativo(h)
for m in list(h.modifiers):
    if m.type == "MASK": bpy.ops.object.modifier_apply(modifier=m.name)
# escala e posição: mesma altura do MPFB, pé no chão, mesmo centro do tronco
def cx(o, z0, z1):
    vs = [o.matrix_world @ v.co for v in o.data.vertices]; xm = (min(v.x for v in vs) + max(v.x for v in vs)) / 2
    s = [v for v in vs if z0 < v.z < z1 and abs(v.x - xm) < 0.15]   # só o tronco (sem mão)
    return sum(s, Vector()) / len(s), min(v.z for v in vs), max(v.z for v in vs)
_, h0, h1 = cx(h, -9, 9); _, b0, b1 = cx(B, -9, 9)
k = (h1 - h0) / (b1 - b0)
T = Matrix.Scale(k, 4)
for o in [B, *olhosB]: o.matrix_world = T @ o.matrix_world
bpy.context.view_layer.update()
_, b0, b1 = cx(B, -9, 9); H = h1 - h0
ch, _, _ = cx(h, h0 + .5 * H, h0 + .62 * H); cb, _, _ = cx(B, b0 + .5 * H, b0 + .62 * H)
d = Vector((ch.x - cb.x, ch.y - cb.y, h0 - b0))
for o in [B, *olhosB]: o.matrix_world = Matrix.Translation(d) @ o.matrix_world
bpy.context.view_layer.update()
for o in [B, *olhosB]:
    ativo(o); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
print("HBM escala", round(k, 3), "altura", round(H, 3))
# ---- braços e pernas do MPFB na silhueta do corpo novo (busca de ângulo por osso)
bvh = BVHTree.FromObject(B, dg())
nomes = {g.index: g.name for g in h.vertex_groups}
def dominio(ossos):
    out = []
    for v in h.data.vertices:
        gs = sorted((x for x in v.groups if nomes[x.group] in BONES), key=lambda x: -x.weight)
        if gs and nomes[gs[0].group] in ossos: out.append(v.index)
    return out
BONES = {b.name for b in R.data.bones}
def custo(idx):
    e = h.evaluated_get(dg()); vs = e.data.vertices; s = 0
    for i in idx:
        p = h.matrix_world @ vs[i].co; r = bvh.find_nearest(p); s += (r[3] if r[0] else 1)
    return s / len(idx)
def girar(osso, eixo, graus):
    pb = R.pose.bones[osso]; bpy.context.view_layer.update()
    cab = pb.head.copy(); M = Matrix.Translation(cab) @ Matrix.Rotation(math.radians(graus), 4, eixo) @ Matrix.Translation(-cab)
    pb.matrix = M @ pb.matrix; bpy.context.view_layer.update()
ativo(R); bpy.ops.object.mode_set(mode="POSE")
for s, sg in (("l", 1), ("r", -1)):
    for osso, filhos in ((f"upperarm_{s}", {f"upperarm_{s}", f"lowerarm_{s}"}), (f"lowerarm_{s}", {f"lowerarm_{s}", f"hand_{s}"}),
                         (f"thigh_{s}", {f"thigh_{s}", f"calf_{s}"})):
        idx = dominio(filhos)
        for eixo, passo, faixa in ((Vector((0, 1, 0)), 2, 30), (Vector((1, 0, 0)), 2, 12), (Vector((0, 1, 0)), 0.5, 2), (Vector((1, 0, 0)), 0.5, 2)):
            melhor, mc = 0, custo(idx); a = -faixa
            while a <= faixa + 1e-6:
                if abs(a) > 1e-6:
                    girar(osso, eixo, a); c = custo(idx); girar(osso, eixo, -a)
                    if c < mc: mc, melhor = c, a
                a += passo
            if melhor: girar(osso, eixo, melhor)
        print("AJUSTE", osso, round(mc * 1000, 1), "mm")
bpy.ops.object.mode_set(mode="OBJECT")
# pose do MPFB vira descanso
ativo(h)
for m in list(h.modifiers):
    if m.type == "ARMATURE": bpy.ops.object.modifier_apply(modifier=m.name)
ativo(sobr)
for m in list(sobr.modifiers):
    if m.type == "ARMATURE": bpy.ops.object.modifier_apply(modifier=m.name)
ativo(R); bpy.ops.object.mode_set(mode="POSE"); bpy.ops.pose.select_all(action="SELECT"); bpy.ops.pose.armature_apply(selected=False); bpy.ops.object.mode_set(mode="OBJECT")
# ---- juntas pro corpo novo: cada junta anda o deslocamento médio dos vértices do MPFB perto dela até a superfície do novo
kd = KDTree(len(h.data.vertices))
for v in h.data.vertices: kd.insert(h.matrix_world @ v.co, v.index)
kd.balance()
def desloca(p, n=40):
    ds = []
    for co, i, dist in kd.find_n(p, n):
        r = bvh.find_nearest(co)
        if r[0]: ds.append(r[0] - co)
    return sum(ds, Vector()) / len(ds) if ds else Vector()
ativo(R); bpy.ops.object.mode_set(mode="EDIT")
eb = R.data.edit_bones; novo = {}
for b in eb: novo[b.name] = (b.head + desloca(b.head), b.tail + desloca(b.tail))
for b in eb:
    hd, tl = novo[b.name]
    if b.use_connect and b.parent: hd = b.parent.tail
    b.head = hd; b.tail = tl
for b in eb:   # pai termina onde começa o filho conectado
    for c in b.children:
        if c.use_connect: b.tail = c.head
bpy.ops.object.mode_set(mode="OBJECT")
# sobrancelha: o mesmo deslocamento do rosto
ds = desloca(sum((sobr.matrix_world @ v.co for v in sobr.data.vertices), Vector()) / len(sobr.data.vertices), 80)
sobr.data.transform(Matrix.Translation(ds))
sw = sobr.modifiers.new("cola", "SHRINKWRAP"); sw.target = B; sw.wrap_method = "NEAREST_SURFACEPOINT"; sw.offset = 0.0015; sw.wrap_mode = "OUTSIDE_SURFACE"
ativo(sobr); bpy.ops.object.modifier_apply(modifier="cola")
# ---- pesos por proximidade (só os grupos de osso), normalizados
for nome in BONES:
    if nome in h.vertex_groups and nome not in B.vertex_groups: B.vertex_groups.new(name=nome)
dt = B.modifiers.new("pesos", "DATA_TRANSFER"); dt.object = h; dt.use_vert_data = True; dt.data_types_verts = {"VGROUP_WEIGHTS"}
dt.vert_mapping = "POLYINTERP_NEAREST"; dt.layers_vgroup_select_src = "ALL"; dt.layers_vgroup_select_dst = "NAME"
ativo(B); bpy.ops.object.modifier_apply(modifier="pesos")
for g in list(B.vertex_groups):
    if g.name not in BONES: B.vertex_groups.remove(g)
bpy.ops.object.vertex_group_normalize_all(lock_active=False)
# ---- pele: a textura do MakeHuman assada nos UVs do corpo novo (luz própria, sem sombra)
pele_png = textura_do_mhmat(pele_mhmat, "diffuseTexture")
me_ = bpy.data.materials.new("emite"); me_.use_nodes = True; nt = me_.node_tree; nt.nodes.clear()
tx = nt.nodes.new("ShaderNodeTexImage"); tx.image = bpy.data.images.load(pele_png); em = nt.nodes.new("ShaderNodeEmission"); out = nt.nodes.new("ShaderNodeOutputMaterial")
nt.links.new(tx.outputs[0], em.inputs[0]); nt.links.new(em.outputs[0], out.inputs[0])
h.data.materials.clear(); h.data.materials.append(me_)
for p in h.data.polygons: p.material_index = 0
PELE_IMG = bpy.data.images.new("pele_jogo", 2048, 2048, alpha=False)
mb = bpy.data.materials.new("alvo"); mb.use_nodes = True; t2 = mb.node_tree.nodes.new("ShaderNodeTexImage"); t2.image = PELE_IMG; mb.node_tree.nodes.active = t2
B.data.materials.clear(); B.data.materials.append(mb)
sc = bpy.context.scene; motor = sc.render.engine; sc.render.engine = "CYCLES"; sc.cycles.samples = 4
sc.render.bake.use_selected_to_active = True; sc.render.bake.cage_extrusion = 0.04; sc.render.bake.max_ray_distance = 0.12; sc.render.bake.margin = 16
for x in bpy.context.view_layer.objects: x.select_set(False)
h.select_set(True); B.select_set(True); bpy.context.view_layer.objects.active = B
bpy.ops.object.bake(type="EMIT")
sc.render.bake.use_selected_to_active = False; sc.render.engine = motor
# onde o raio não achou o corpo MakeHuman (axila, dedo do pé) ficou preto: vira a cor média da pele
import numpy as np
px = np.array(PELE_IMG.pixels[:], dtype=np.float32).reshape(-1, 4); soma = px[:, :3].sum(1)
pele_media = px[soma > 0.3, :3].mean(0); px[soma < 0.06, :3] = pele_media
PELE_IMG.pixels = px.ravel()
PELE_IMG.filepath_raw = os.path.join(PASTA, "hbm_pele.png"); PELE_IMG.file_format = "PNG"; PELE_IMG.save()
NORMAL_IMG = bpy.data.images.load(os.path.join(PASTA, "hbm_normal.png")); NORMAL_IMG.colorspace_settings.name = "Non-Color"
# olhos do corpo novo: centro e raio
OLHOS_HBM = {}
for o in olhosB:
    vs = [o.matrix_world @ v.co for v in o.data.vertices]; c = sum(vs, Vector()) / len(vs)
    OLHOS_HBM["l" if c.x > 0 else "r"] = (c, max((v - c).length for v in vs))
    bpy.data.objects.remove(o, do_unlink=True)
# o corpo novo assume o lugar do MPFB
bpy.data.objects.remove(h, do_unlink=True)
h = B; h.name = "corpo"
m = h.modifiers.new("Armature", "ARMATURE"); m.object = R
m = sobr.modifiers.new("Armature", "ARMATURE"); m.object = R
print("HBM pronto", len(h.data.vertices), "olhos", {k: (tuple(round(x, 3) for x in c), round(r, 4)) for k, (c, r) in OLHOS_HBM.items()})
