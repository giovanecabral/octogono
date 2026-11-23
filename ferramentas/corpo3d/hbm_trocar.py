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
# ---- ombro e quadril (2026-11-23): o peso do membro espalhado pela superfície, nunca pelo ar. A malha é esculpida
# com o braço junto do corpo e as coxas juntas (pose A), e a passagem por proximidade dava peso do braço ao flanco
# inteiro até a cintura (erguer o braço puxava uma aba de pele da axila ao quadril) e peso de uma coxa à parte de
# dentro da outra (abrir as pernas esticava uma membrana entre elas: o calção virava saia). Aqui o peso do membro é a
# solução de Laplace na malha (média dos vizinhos por aresta): 1 no membro de verdade (do meio do osso pra baixo,
# dentro do raio dele), 0 no tronco longe da junta e no outro lado; entre os dois ele cai suave pelo caminho da pele
# (pela axila, pelo deltoide, pela virilha, pelo glúteo).
import numpy as np
import os
ANEL_TRONCO = int(os.environ.get("ANEL_TRONCO", 3)); ANEL_BRACO = int(os.environ.get("ANEL_BRACO", 0))
def membros_por_difusao(B, R):
    nv = len(B.data.vertices); P = np.array([tuple(B.matrix_world @ v.co) for v in B.data.vertices])
    m3 = B.matrix_world.to_3x3(); N = np.array([tuple((m3 @ v.normal).normalized()) for v in B.data.vertices])
    ar = np.array([tuple(e.vertices) for e in B.data.edges]); vizinhos = np.zeros(nv)
    np.add.at(vizinhos, ar[:, 0], 1); np.add.at(vizinhos, ar[:, 1], 1)
    nomesB = {g.index: g.name for g in B.vertex_groups}
    pesos = [{nomesB[g.group]: g.weight for g in v.groups if g.weight > 1e-5} for v in B.data.vertices]
    junta = lambda n: np.array(tuple(R.matrix_world @ R.data.bones[n].head_local))
    membros = []
    for s in "lr":
        membros.append(("upperarm_" + s, "lowerarm_" + s, {"upperarm_" + s, "lowerarm_" + s, "hand_" + s} | {b.name for b in R.data.bones if b.name.endswith("_" + s) and b.name.split("_")[0] in ("thumb", "index", "middle", "ring", "pinky")}, "spine_03"))
        membros.append(("thigh_" + s, "calf_" + s, {"thigh_" + s, "calf_" + s, "foot_" + s, "ball_" + s}, "pelvis"))
    for raiz, ponta, braco, reserva in membros:
        s = raiz[-1]
        o, c = junta(raiz), junta(ponta); eixo = c - o; L = np.linalg.norm(eixo); eixo /= L
        rel = P - o; t = rel @ eixo / L; radial = np.linalg.norm(rel - np.outer(rel @ eixo, eixo), axis=1)
        wb = np.array([sum(w for n, w in pw.items() if n in braco) for pw in pesos])
        dom_mao = np.array([bool(pw) and max(pw, key=pw.get) in braco - {raiz} for pw in pesos])
        meio = (t > 0.5) & (t < 0.85) & (wb > 0.9)
        r_braco = np.percentile(radial[meio], 60) * 1.12
        do_lado = (P[:, 0] > 0) == (o[0] > 0)
        dir_rad = rel - np.outer(rel @ eixo, eixo); dir_rad /= np.maximum(np.linalg.norm(dir_rad, axis=1), 1e-6)[:, None]
        olha_fora = np.einsum("ij,ij->i", N, dir_rad) > 0
        no_braco = dom_mao | ((t > 0.42) & (radial < r_braco))   # o membro: do meio do osso pra baixo, dentro do raio dele
        # tronco: o outro lado, e do lado do membro o que fica a mais de 20 cm da junta e bem fora do raio dele
        # (o flanco desce junto do braço: pela altura ele parecia braço e herdava o peso até a cintura). Perto do membro
        # quem decide é a normal: a pele do braço olha pra fora do úmero, a do flanco olha pra ele (e a de dentro de
        # uma coxa olha pra outra)
        no_tronco = ~no_braco & (~do_lado | ((np.linalg.norm(rel, axis=1) > 0.2) & ((radial > 1.5 * r_braco) | ~olha_fora)))
        # faixa de transição: o tronco que encosta no membro (até 3 arestas) também fica livre; braço com peso 1
        # colado em tronco com peso 0 esticava uma lasca de pele na dobra da axila
        def aneis(m, n):
            for _ in range(n):
                novo = m.copy(); novo[ar[:, 0][m[ar[:, 1]]]] = True; novo[ar[:, 1][m[ar[:, 0]]]] = True; m = novo
            return m
        no_tronco &= ~(aneis(no_braco, ANEL_TRONCO) & do_lado)
        # e o membro que encosta no tronco também fica livre (2026-11-23): com a faixa só do lado do tronco, no fundo da
        # axila um vértice com 0,96 de braço ficava a 2 cm de um com 0,78 de tronco, e o triângulo entre eles virava
        # do avesso com o cotovelo fechado na guarda (a mancha clara no flanco)
        no_braco &= ~(aneis(no_tronco, ANEL_BRACO) & ~dom_mao)
        livre = ~no_braco & ~no_tronco & do_lado
        h = np.where(no_braco, 1.0, 0.0)
        for _ in range(3000):   # Jacobi: cada livre vira a média dos vizinhos
            soma = np.zeros(nv); np.add.at(soma, ar[:, 0], h[ar[:, 1]]); np.add.at(soma, ar[:, 1], h[ar[:, 0]])
            h = np.where(livre, soma / np.maximum(vizinhos, 1), h)
        # o núcleo do membro também é gravado (2026-11-23): antes ele só servia de borda da difusão e ficava com o peso
        # transferido do MakeHuman, que na face de dentro do braço (encostada no flanco) era de tronco: 31 arestas no
        # fundo da axila saltavam de 0,03 pra 1 de braço, e a pele virava do avesso ali com o braço fechado
        for i in np.nonzero(livre | no_tronco | no_braco)[0]:
            pw = pesos[i]; novo_b = float(h[i]) if livre[i] else 1.0 if no_braco[i] else 0.0
            fora = {n: w for n, w in pw.items() if n not in braco}; dentro = {n: w for n, w in pw.items() if n in braco}
            tf = sum(fora.values()); td = sum(dentro.values())
            novo = {n: w * (1 - novo_b) / tf for n, w in fora.items()} if tf > 1e-6 else ({reserva: 1 - novo_b} if novo_b < 1 else {})
            if novo_b > 0: novo.update({n: w * novo_b / td for n, w in dentro.items()} if td > 1e-6 else {raiz: novo_b})
            pesos[i] = novo
        print("MEMBRO", raiz, "dentro", int(no_braco.sum()), "livres", int(livre.sum()), "raio", round(float(r_braco), 3))
    for v, pw in zip(B.data.vertices, pesos):
        # os índices antes de remover (2026-11-23): o v.groups encolhe a cada remove, e percorrer ele direto pulava
        # grupos (o peso antigo do MakeHuman sobrava e se somava ao novo; o vértice do braço acabava meio tronco)
        for gi in [g.group for g in v.groups]: B.vertex_groups[gi].remove([v.index])
        tot = sum(pw.values())
        for n, w in pw.items():
            if w <= 1e-5: continue
            if n not in B.vertex_groups: B.vertex_groups.new(name=n)
            B.vertex_groups[n].add([v.index], w / tot, "REPLACE")
membros_por_difusao(B, R)
def cranio_rigido(B, R):
    """o crânio é da cabeça (2026-11-23): o peso do pescoço subia 4 cm pela lateral da cabeça, a pele ali mexia uns
    milímetros com a cabeça virada e cobria o cabelo esculpido (que é rígido, preso ao osso da cabeça): uma faixa
    careca acima da orelha em todo corte. Nas laterais, de 0 a 3 cm acima da junta da cabeça do jogo o peso passa
    todo pra ela. Embaixo da mandíbula, na frente da garganta, também (a pele do pescoço cobria a barba rígida com a
    cabeça baixa na guarda), com rampa mais longa"""
    z0 = (R.matrix_world @ R.data.bones["head"].head_local).z
    yp = (R.matrix_world @ R.data.bones["neck_01"].head_local).y if "neck_01" in R.data.bones else (R.matrix_world @ R.data.bones["head"].head_local).y
    ih = B.vertex_groups["head"].index if "head" in B.vertex_groups else None
    if ih is None: return
    n = 0
    for v in B.data.vertices:
        w_ = B.matrix_world @ v.co; lim = lambda x: max(0.0, min(1.0, x))
        # laterais (a junta "head" do MakeHuman fica uns 5 cm acima da Head do jogo) e embaixo da mandíbula, na frente
        # da garganta (onde a barba cobre); as duas regiões entram por rampa (com corte seco o vértice de um lado
        # ficava rígido e o vizinho não, e a pele dobrava ali com o queixo baixo). A nuca segue dobrando com o pescoço
        lado = lim((abs(w_.x) - 0.03) / 0.025) * lim((w_.z - (z0 - 0.045)) / 0.03)
        frente = lim((yp - 0.015 - w_.y) / 0.025) * lim((w_.z - (z0 - 0.11)) / 0.045)
        t = max(lado, frente)
        if t <= 0: continue
        pw = {B.vertex_groups[g.group].name: g.weight for g in v.groups}
        if not pw or pw.get("head", 0) >= 0.999: continue
        novo = {k: w * (1 - t) for k, w in pw.items()}; novo["head"] = novo.get("head", 0) + t
        for gi in [g.group for g in v.groups]: B.vertex_groups[gi].remove([v.index])
        tot = sum(novo.values())
        for k, w in novo.items():
            if w > 1e-5: B.vertex_groups[k].add([v.index], w / tot, "REPLACE")
        n += 1
    print("CRANIO", n, "vértices com peso do pescoço passaram pra cabeça; junta", round(z0, 3), [b.name for b in R.data.bones if "neck" in b.name or "head" in b.name])
cranio_rigido(B, R)
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
sc.render.bake.use_selected_to_active = False
# cobertura do UV (2026-11-23): o próprio corpo emitindo branco, sem margem: 1 dentro das ilhas, 0 fora
COBRE_IMG = bpy.data.images.new("cobre", 2048, 2048, alpha=False)
mc = bpy.data.materials.new("cobre"); mc.use_nodes = True; nt = mc.node_tree; nt.nodes.clear()
em = nt.nodes.new("ShaderNodeEmission"); em.inputs[0].default_value = (1, 1, 1, 1); out = nt.nodes.new("ShaderNodeOutputMaterial"); nt.links.new(em.outputs[0], out.inputs[0])
t3 = nt.nodes.new("ShaderNodeTexImage"); t3.image = COBRE_IMG; nt.nodes.active = t3
B.data.materials.clear(); B.data.materials.append(mc); sc.render.bake.margin = 0
for x in bpy.context.view_layer.objects: x.select_set(False)
B.select_set(True); bpy.context.view_layer.objects.active = B
bpy.ops.object.bake(type="EMIT")
sc.render.bake.margin = 16; B.data.materials.clear(); B.data.materials.append(mb); sc.render.engine = motor
# onde o raio não achou o corpo MakeHuman (axila, dedo do pé) ficou preto: vira a cor média da pele
import numpy as np
px = np.array(PELE_IMG.pixels[:], dtype=np.float32).reshape(-1, 4); soma = px[:, :3].sum(1)
pele_media = px[soma > 0.3, :3].mean(0)
# o buraco vira a pele em volta (2026-11-23): a cor média era mais clara que a pele da axila (mancha clara esticada
# quando o braço subia). O buraco e a borda escura dele (2 px) viram a solução de Laplace a partir da pele em volta,
# só dentro da ilha do UV (o que fica fora dela não entra na média: puxava a cor de fundo pra dentro da axila). Fora
# das ilhas, a borda delas se repete uns pixels (a margem que o mipmap lê).
lado = int(round(len(px) ** 0.5)); img = px[:, :3].reshape(lado, lado, 3).copy()
cobre = (np.array(COBRE_IMG.pixels[:], dtype=np.float32).reshape(lado, lado, 4)[..., 0] > 0.5)
falta = (soma < 0.25).reshape(lado, lado)
for _ in range(2):
    falta = falta | np.roll(falta, 1, 0) | np.roll(falta, -1, 0) | np.roll(falta, 1, 1) | np.roll(falta, -1, 1)
buraco = falta & cobre; img[buraco] = pele_media; img[~cobre] = 0
viz = sum(np.roll(cobre, d, a).astype(np.float32) for d in (1, -1) for a in (0, 1))
for _ in range(500):
    soma_v = sum(np.roll(img * cobre[..., None], d, a) for d in (1, -1) for a in (0, 1))
    media = soma_v / np.maximum(viz, 1)[..., None]
    img[buraco] = media[buraco]
feito = cobre.copy()
for _ in range(24):
    s_ = sum(np.roll(img * feito[..., None], d, a) for d in (1, -1) for a in (0, 1)); n_ = sum(np.roll(feito, d, a).astype(np.float32) for d in (1, -1) for a in (0, 1))
    novo = ~feito & (n_ > 0); img[novo] = s_[novo] / n_[novo][:, None]; feito |= novo
img[~feito] = pele_media
px[:, :3] = img.reshape(-1, 3)
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
