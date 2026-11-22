# Calção e luva de MMA a partir da própria malha do corpo (h) na pose de descanso: os mesmos pesos de osso.
import bpy, bmesh, math
from mathutils import Vector
def dominante(o):
    ossos = {b.name for b in R.data.bones}   # o esqueleto do corpo novo (o do jogo, importado pra medir, chama a cabeça de "Head")
    nomes = {g.index: g.name for g in o.vertex_groups if g.name in ossos}; out = []
    for v in o.data.vertices:
        gs = sorted((x for x in v.groups if x.group in nomes), key=lambda x: -x.weight); out.append(nomes[gs[0].group] if gs else None)
    return out
def peca(o, nome, escolhe, empurra, espessura, material, cortes=(), maioria=False, suave=0, solido=True, aresta_max=None):
    dom = dominante(o)
    me = o.data.copy(); p = bpy.data.objects.new(nome, me); bpy.context.scene.collection.objects.link(p)
    for g in o.vertex_groups: p.vertex_groups.new(name=g.name)   # mesmos grupos, mesma ordem (a malha copiada guarda os pesos pelo índice)
    p.matrix_world = o.matrix_world.copy()
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    # maioria: a face entra com mais da metade dos vértices dentro (sem buraco onde um vértice puxa pra outro osso)
    dentro = lambda f: (sum(escolhe(v.co, dom[v.index]) for v in f.verts) * 2 > len(f.verts)) if maioria else all(escolhe(v.co, dom[v.index]) for v in f.verts)
    # aresta_max (só a luva): fora também a face esticada, que ligava a mão a um vértice lá embaixo e virava espeto
    fora = [f for f in bm.faces if not dentro(f) or (aresta_max and max(e.calc_length() for e in f.edges) > aresta_max)]
    bmesh.ops.delete(bm, geom=fora, context="FACES")
    # corte limpo: cada plano (ponto, normal) guarda o lado da normal
    for co, no in cortes:
        geo = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geo, plane_co=co, plane_no=no, clear_inner=True)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.verts.ensure_lookup_table(); bm.normal_update()
    for v in bm.verts: v.co = v.co + v.normal * empurra(v.co, None)
    if suave:   # tecido solto: alisa a casca (some o desenho do músculo) e devolve pra fora o que entrou no corpo
        from mathutils.bvhtree import BVHTree
        bvh_o = BVHTree.FromObject(o, bpy.context.evaluated_depsgraph_get()); mw = o.matrix_world; mi = mw.inverted()
        borda = [v for v in bm.verts if v.is_boundary]
        for _ in range(suave):
            bmesh.ops.smooth_vert(bm, verts=[v for v in bm.verts if not v.is_boundary], factor=0.6, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        bm.normal_update()
        for v in bm.verts:
            w = mw @ v.co; q, nq, _, _ = bvh_o.find_nearest(w)
            if q is None: continue
            quer = empurra(v.co, None) * 0.8; dist = (w - q).dot(nq)
            if dist < quer: v.co = mi @ (w + nq * (quer - dist))
    print("PECA", nome, len(bm.faces), "faces")
    bm.to_mesh(me); bm.free()
    me.materials.clear(); me.materials.append(material)
    for poly in me.polygons: poly.material_index = 0; poly.use_smooth = True
    sem_espinho(p)
    if solido: engrossar(p, espessura); sem_espinho(p)   # a espessura também pode criar espeto em vértice de borda
    return p
def sem_espinho(p, limite=0.04):
    """vértice longe demais da média dos vizinhos (espeto: saía na luva e no calção) volta pra essa média"""
    me = p.data; viz = {}
    for e in me.edges: viz.setdefault(e.vertices[0], []).append(e.vertices[1]); viz.setdefault(e.vertices[1], []).append(e.vertices[0])
    for _ in range(3):
        n = 0
        for i, js in viz.items():
            m = sum((me.vertices[j].co for j in js), Vector()) / len(js)
            if (me.vertices[i].co - m).length > limite: me.vertices[i].co = m; n += 1
        if not n: break
def engrossar(p, espessura):
    s = p.modifiers.new("esp", "SOLIDIFY"); s.thickness = espessura; s.offset = 1; s.use_even_offset = True
    bpy.context.view_layer.objects.active = p; bpy.ops.object.modifier_apply(modifier="esp")
    for m in list(p.modifiers): p.modifiers.remove(m)
def tecido(p, pino, quadros=40, massa=0.25, tensao=12.0, dobra=0.6, colisao=0.004):
    """simulação de pano (Blender) caindo sobre o corpo em repouso: o que pino(ponto) diz fica preso; o resto cai e dobra"""
    if "colisao" not in [m.name for m in corpo_colisao.modifiers]:
        c = corpo_colisao.modifiers.new("colisao", "COLLISION"); corpo_colisao.collision.thickness_outer = colisao; corpo_colisao.collision.cloth_friction = 8
    g = p.vertex_groups.new(name="pino"); mw = p.matrix_world
    g.add([v.index for v in p.data.vertices if pino(mw @ v.co)], 1.0, "REPLACE")
    m = p.modifiers.new("pano", "CLOTH"); st = m.settings
    st.quality = 6; st.mass = massa; st.tension_stiffness = tensao; st.compression_stiffness = tensao; st.shear_stiffness = tensao * 0.5
    st.bending_stiffness = dobra; st.vertex_group_mass = "pino"; st.pin_stiffness = 1.0
    m.collision_settings.distance_min = colisao; m.collision_settings.use_self_collision = False
    sc = bpy.context.scene; sc.frame_start = 1; sc.frame_end = quadros; m.point_cache.frame_start = 1; m.point_cache.frame_end = quadros
    for f in range(1, quadros + 1): sc.frame_set(f)
    # a forma do último quadro vira a malha (mesma topologia; o modifier_apply do pano reclamava de grupo sem nome)
    ev = p.evaluated_get(bpy.context.evaluated_depsgraph_get()); final = [v.co.copy() for v in ev.data.vertices]
    p.modifiers.remove(m)
    for v, co in zip(p.data.vertices, final): v.co = co
    p.vertex_groups.remove(g); sc.frame_set(1)
def alisar(p, onde, vezes=12, folga=0.008):
    """alisa só onde onde(ponto) é verdade (o tecido não marca o corpo ali) e devolve pra fora o que entrou no corpo"""
    from mathutils.bvhtree import BVHTree
    bvh_c = BVHTree.FromObject(h, bpy.context.evaluated_depsgraph_get())
    bm = bmesh.new(); bm.from_mesh(p.data); mw = p.matrix_world; mi = mw.inverted()
    sel = [v for v in bm.verts if not v.is_boundary and onde(mw @ v.co)]
    for _ in range(vezes): bmesh.ops.smooth_vert(bm, verts=sel, factor=0.7, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    for v in sel:
        w = mw @ v.co; q, nq, _, _ = bvh_c.find_nearest(w)
        if q is not None and (w - q).dot(nq) < folga: v.co = mi @ (q + nq * folga)
    bm.to_mesh(p.data); bm.free()
def dobras(p, onde, amp):
    """dobras de tecido: ondas suaves na direção da normal, mais fortes onde onde(ponto) = 1 (perto da barra)"""
    me = p.data; me.calc_normals_split() if hasattr(me, "calc_normals_split") else None
    for v in me.vertices:
        w = p.matrix_world @ v.co; k = onde(w)
        if k <= 0: continue
        a = math.atan2(w.x - (0.11 if w.x > 0 else -0.11), w.y)   # em volta de cada perna
        v.co += v.normal * amp * k * (0.6 * math.sin(a * 7 + w.z * 40) + 0.4 * math.sin(a * 13 + 1.3))
def pesos_do_corpo(p, corpo):
    """os pesos de osso de toda a peça (inclusive bainha e cós novos) vêm do corpo, pelo ponto mais perto"""
    ossos = {b.name for b in R.data.bones}
    for g in list(p.vertex_groups): p.vertex_groups.remove(g)
    for g in corpo.vertex_groups:
        if g.name in ossos: p.vertex_groups.new(name=g.name)
    dt = p.modifiers.new("pesos", "DATA_TRANSFER"); dt.object = corpo; dt.use_vert_data = True; dt.data_types_verts = {"VGROUP_WEIGHTS"}
    dt.vert_mapping = "POLYINTERP_NEAREST"; dt.layers_vgroup_select_src = "ALL"; dt.layers_vgroup_select_dst = "NAME"
    bpy.context.view_layer.objects.active = p; bpy.ops.object.modifier_apply(modifier="pesos")
    for x in bpy.data.objects: x.select_set(x is p)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
def alisar_borda(p, vezes=8, furo=40):
    """a borda da peça (abertura cortada da malha do corpo, em degraus) vira uma curva lisa; furo pequeno (até furo
    arestas, sobra do corte) é fechado antes (a bainha nele virava espeto)"""
    bm = bmesh.new(); bm.from_mesh(p.data)
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=furo)
    borda = [v for v in bm.verts if v.is_boundary]
    for _ in range(vezes):
        novo = {}
        for v in borda:
            viz = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(viz) == 2: novo[v] = v.co * 0.4 + (viz[0].co + viz[1].co) * 0.3
        for v, c in novo.items(): v.co = c
    bm.to_mesh(p.data); bm.free()
def bainha(p, raio, material_index=0, achata=0.55, lados=6, so=None, minimo=24):
    """borda enrolada (tubo achatado) em cada abertura da peça: a barra, o punho, a gola"""
    bm = bmesh.new(); bm.from_mesh(p.data); bm.verts.ensure_lookup_table()
    livres = {e for e in bm.edges if e.is_boundary}; laços = []
    while livres:
        e = livres.pop(); laço = [e.verts[0], e.verts[1]]
        while True:
            ult = laço[-1]; prox = [x for x in ult.link_edges if x in livres]
            if not prox: break
            livres.discard(prox[0]); v = prox[0].other_vert(ult)
            if v is laço[0]: break
            laço.append(v)
        if len(laço) >= minimo: laços.append([p.matrix_world @ v.co for v in laço])   # laço curto é furo, não abertura
    bm.free()
    novo = bmesh.new()
    for pts in laços:
        if so and not so(pts): continue
        aneis = []; n = len(pts)
        for i, c in enumerate(pts):
            t = (pts[(i + 1) % n] - pts[i - 1]).normalized(); b1 = t.orthogonal().normalized() if i == 0 else (b1 - t * b1.dot(t)).normalized(); b2 = t.cross(b1)
            aneis.append([novo.verts.new(c + (b1 * math.cos(k * 6.2832 / lados) + b2 * achata * math.sin(k * 6.2832 / lados)) * raio) for k in range(lados)])
        for A, B in zip(aneis, aneis[1:] + aneis[:1]):
            for k in range(lados): f = novo.faces.new((A[k], A[(k + 1) % lados], B[(k + 1) % lados], B[k])); f.material_index = material_index; f.smooth = True
    me = bpy.data.meshes.new("bainha"); novo.to_mesh(me); novo.free(); me.transform(p.matrix_world.inverted())
    bm = bmesh.new(); bm.from_mesh(p.data); bm.from_mesh(me); bm.to_mesh(p.data); bm.free(); bpy.data.meshes.remove(me)
def material(nome, cor, rug):
    m = bpy.data.materials.new(nome); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*cor, 1); b.inputs["Roughness"].default_value = rug; return m
def roupas(h, R, pos):
    # pos: posição das juntas (mundo, z pra cima)
    zq = pos["pelvis"].z; zc = (pos["thigh_l"].z + pos["thigh_r"].z) / 2; zj = (pos["calf_l"].z + pos["calf_r"].z) / 2
    cintura = zq + 0.09; barra = zj + 0.42 * (zc - zj)
    perna = {"pelvis", "spine_01", "thigh_l", "thigh_r"}
    def no_calcao(co, d): w = h.matrix_world @ co; return d in perna and barra - 0.06 < w.z < cintura + 0.05
    cortes = [(Vector((0, 0, cintura)), Vector((0, 0, -1))), (Vector((0, 0, barra)), Vector((0, 0, 1)))]
    def folga(co, d):
        w = h.matrix_world @ co; t = max(0.0, min(1.0, (zc - w.z) / (zc - barra)))   # 0 no quadril, 1 na barra
        meio = max(0.0, 1 - abs(w.x) / 0.06) if w.z < zc + 0.03 else 0.0   # entreperna colada (a folga ali dobrava o tecido)
        cos = max(0.0, (w.z - (cintura - 0.06)) / 0.06)   # perto do elástico: mais folga (a pele furava o tecido na guarda)
        return (0.005 + 0.004 * cos + 0.016 * t * t) * (1 - 0.7 * meio)
    calcao = peca(h, "calcao", no_calcao, folga, 0.004, material("MI_Calcao", (.5, .05, .04), .92), cortes, solido=False)
    alisar(calcao, lambda w: abs(w.x) < 0.09 and zq - 0.16 < w.z < zq + 0.05 and w.y < pos["pelvis"].y)   # a frente da virilha lisa
    dobras(calcao, lambda w: max(0.0, min(1.0, (zc - w.z) / (zc - barra))), 0.006)
    # elástico: a faixa de cima com material próprio (o jogo pinta mais escuro)
    calcao.data.materials.append(material("MI_Faixa", (.08, .02, .02), .85))
    # corte reto na altura do elástico (sem apagar nada) e as faces de cima ficam com o material dele
    bm = bmesh.new(); bm.from_mesh(calcao.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=Vector((0, 0, cintura - 0.04)), plane_no=Vector((0, 0, 1)))
    for f in bm.faces: f.material_index = 1 if f.calc_center_median().z > cintura - 0.04 else 0
    bm.to_mesh(calcao.data); bm.free()
    bainha(calcao, 0.0045, material_index=0, so=lambda pts: max(p.z for p in pts) < cintura - 0.05)   # barra das pernas
    bainha(calcao, 0.006, material_index=1, so=lambda pts: min(p.z for p in pts) > cintura - 0.05)    # o cós
    engrossar(calcao, 0.003)
    sem_espinho(calcao)
    # vivo de costura na lateral de cada perna (do cós à barra), na cor do cós: a costura que o calção de luta tem
    from mathutils.bvhtree import BVHTree
    bvh_c = BVHTree.FromObject(calcao, bpy.context.evaluated_depsgraph_get()); bm = bmesh.new(); mi = calcao.matrix_world.inverted()
    for lado in (1, -1):
        pts = []
        for k in range(16):
            z = cintura - 0.05 - (cintura - 0.05 - barra - 0.012) * k / 15; o_ = Vector((lado * 0.6, pos["pelvis"].y, z))
            hit, nq, _, _ = bvh_c.ray_cast(o_, Vector((-lado, 0, 0)))
            if hit: pts.append(hit + nq * 0.0015)
        if len(pts) > 3:
            aneis = []
            for i, c in enumerate(pts):
                t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized(); b1 = t.orthogonal().normalized(); b2 = t.cross(b1)
                aneis.append([bm.verts.new(mi @ (c + (b1 * math.cos(j * 1.2566) + b2 * 0.5 * math.sin(j * 1.2566)) * 0.0025)) for j in range(5)])
            for A, B in zip(aneis, aneis[1:]):
                for j in range(5): f = bm.faces.new((A[j], A[(j + 1) % 5], B[(j + 1) % 5], B[j])); f.material_index = 1; f.smooth = True
    me = bpy.data.meshes.new("vivo"); bm.to_mesh(me); bm.free()
    bm = bmesh.new(); bm.from_mesh(calcao.data); bm.from_mesh(me); bm.to_mesh(calcao.data); bm.free(); bpy.data.meshes.remove(me)
    pesos_do_corpo(calcao, h)
    # o corpo embaixo do calção some (todo lutador usa calção): a pele não fura o pano em pose nenhuma
    bm = bmesh.new(); bm.from_mesh(h.data); mw = h.matrix_world; dom = dominante(h)
    cobre = lambda v: dom[v.index] in perna and barra + 0.035 < (mw @ v.co).z < cintura - 0.025
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(cobre(v) for v in f.verts)], context="FACES_ONLY")
    bm.to_mesh(h.data); bm.free()
    mao = {}
    for s in "lr":
        mao[s] = {"hand_" + s, "thumb_01_" + s} | {f"{d}_0{k}_{s}" for d in ("index", "middle", "ring", "pinky") for k in (1, 2)}   # até a falange do meio (a ponta furava a luva no punho fechado)
    junta = {s: [pos[f"{d}_01_{s}"] for d in ("index", "middle", "ring", "pinky")] for s in "lr"}
    def na_luva(co, d):
        w = h.matrix_world @ co
        if min((w - pos["hand_l"]).length, (w - pos["hand_r"]).length) > 0.2: return False   # nada longe da mão (o pé tinha vértice puxado pra cá)
        if d in mao["l"] or d in mao["r"]: return True
        w = h.matrix_world @ co   # o punho: o fim do antebraço, até 5,5 cm da junta da mão
        return any(d == "lowerarm_" + l and (w - pos["hand_" + l]).length < 0.055 for l in "lr")
    def acolchoa(co, d):
        w = h.matrix_world @ co; s = "l" if d and d.endswith("_l") else "r"
        perto = min((w - j).length for j in junta[s])
        return 0.008 + 0.012 * max(0.0, 1 - perto / 0.045)   # espuma grossa nos nós dos dedos
    def acolchoa(co, d, _a=acolchoa):
        w = h.matrix_world @ co; s = "l" if (w - pos["hand_l"]).length < (w - pos["hand_r"]).length else "r"
        return _a(co, "x_" + s)
    luvas = peca(h, "luvas", na_luva, acolchoa, 0.003, material("MI_Luva", (.03, .03, .035), .55), maioria=True, aresta_max=0.05)
    # tira de velcro no punho: as faces até 3,5 cm da junta da mão, do lado do antebraço, com material próprio
    luvas.data.materials.append(material("MI_Punho", (.09, .09, .1), .7))
    for poly in luvas.data.polygons:
        c = luvas.matrix_world @ poly.center
        for l in "lr":
            eixo = (pos["hand_" + l] - pos["lowerarm_" + l]).normalized(); d = (c - pos["hand_" + l]).dot(eixo)
            if (c - pos["hand_" + l]).length < 0.08 and -0.05 < d < 0.004: poly.material_index = 1
    return calcao, luvas
