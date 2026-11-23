# Corpo realista do 3D (2026-11-20), rodado pelo gerar.sh dentro do Blender com o MPFB2 instalado.
# Monta o corpo do MakeHuman (MPFB2) pra ter esqueleto, pesos e a pele; com base "hbm" troca a malha pela escaneada da
# Blender Studio (hbm_trocar.py), põe tudo na pose de descanso do esqueleto do jogo (esqueleto_referencia.glb), corta
# calção e luva da própria malha (roupas.py), gera cabelo e barba (cabelos.py) e as roupas de entrada (acessorios.py)
# e exporta: o corpo (cfg["saida"]) e uma peça por arquivo em <trabalho>/pecas. cfg: corpo.json + saida + modelo.
import bpy, sys, os, math, glob, json
import numpy as np
from mathutils import Vector, Matrix, Quaternion
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService
cfg = json.loads(sys.argv[sys.argv.index("--")+1])
AQUI = os.path.dirname(os.path.abspath(__file__))   # os outros scripts do corpo3d
TRAB = os.path.dirname(os.path.abspath(cfg["saida"]))   # pasta de trabalho (hbm_base.blend, texturas, peças)
U = os.path.expanduser("~/Library/Application Support/Blender/4.5/extensions/.user/user_default/mpfb/data")
bpy.ops.wm.read_factory_settings(use_empty=True)
macro = TargetService.get_default_macro_info_dict()
macro.update({"gender":1.0,"age":0.45,"muscle":1.0,"weight":cfg.get("peso",.35),"proportions":1.0,"height":cfg.get("altura",.55)})
macro["race"]=cfg.get("raca",{"asian":0.05,"caucasian":0.9,"african":0.05})
h = HumanService.create_human(macro_detail_dict=macro)
for nome,v in cfg["alvos"]:
    TargetService.load_target(h, TargetService.target_full_path(nome), weight=v)
def textura_do_mhmat(p, chave):
    for l in open(p):
        if l.startswith(chave+" "): return os.path.join(os.path.dirname(p), os.path.basename(l.split(None,1)[1].strip()))
pele_mhmat = glob.glob(U+"/skins/"+cfg["pele"]+"/*.mhmat")[0]
HumanService.add_mhclo_asset(glob.glob(U+"/eyebrows/"+cfg.get("sobr","mindfront_eyebrows_04")+"/*.mhclo")[0], h, asset_type="Eyebrows", material_type="MAKESKIN")
HumanService.add_builtin_rig(h, "game_engine")
R = [o for o in bpy.data.objects if o.type=="ARMATURE"][0]
# forma do corpo escaneado por alvos do MakeHuman (2026-11-23, etapa b): o efeito de cada grupo de alvos na malha do
# MakeHuman, medido aqui (antes de assar as formas dele) e passado pro corpo escaneado no hbm_trocar.py pela superfície.
# Alvos de sistema do MPFB2 (CC0 desde 2020). FORMA_MH[porte] = [(deltas por vértice do MakeHuman, regex dos ossos)]
FORMA_MH = {}
def efeito_mh(alvos, rot):
    kb = h.data.shape_keys.key_blocks; antes = {k.name for k in kb}
    for nome, v in alvos: TargetService.load_target(h, TargetService.target_full_path(nome), weight=v, name=rot + "_" + nome)
    n = len(h.data.vertices); d = np.zeros(n * 3); a = np.empty(n * 3); b = np.empty(n * 3)
    for k in [k for k in h.data.shape_keys.key_blocks if k.name not in antes]:
        k.data.foreach_get("co", a); k.relative_key.data.foreach_get("co", b); d += (a - b) * k.value
        bpy.context.view_layer.objects.active = h; h.active_shape_key_index = list(h.data.shape_keys.key_blocks).index(k); bpy.ops.object.shape_key_remove()
    return d.reshape(n, 3)
for porte, grupos in [("base", cfg.get("forma", {}).get("base", []))] + list(cfg.get("forma", {}).get("portes", {}).items()):
    FORMA_MH[porte] = [(efeito_mh(g["alvos"], f"forma_{porte}_{i}"), g["ossos"]) for i, g in enumerate(grupos)]
    print("FORMA_MH", porte, [round(float(np.abs(d).max()), 4) for d, _ in FORMA_MH[porte]])
# formas (músculo, pescoço...) assadas na malha antes de medir qualquer coisa
for o in [x for x in bpy.data.objects if x.type=="MESH"]:
    bpy.context.view_layer.objects.active = o
    if o.data.shape_keys:
        o.shape_key_add(name="mix", from_mix=True)
        for k in list(o.data.shape_keys.key_blocks):
            if k.name!="mix": o.shape_key_remove(k)
        o.shape_key_remove(o.data.shape_keys.key_blocks["mix"])
sobr = [o for o in bpy.data.objects if o.type=="MESH" and o is not h][0]

# sobrancelha presa só à cabeça desde antes da pose (os pesos que vinham com ela puxavam um lado pra fora)
for m in list(sobr.modifiers): sobr.modifiers.remove(m)
sobr.vertex_groups.clear(); sobr.vertex_groups.new(name="head").add(range(len(sobr.data.vertices)),1.0,"REPLACE")
m = sobr.modifiers.new("Armature","ARMATURE"); m.object = R
if cfg.get("base")=="hbm":
    exec(open(os.path.join(AQUI,"hbm_trocar.py")).read())
# ---- corpo do jogo: posições das juntas em repouso
antes = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=cfg["modelo"])
Q = [o for o in set(bpy.data.objects)-antes if o.type=="ARMATURE"][0]
qpos = {b.name: Q.matrix_world @ b.head_local for b in Q.data.bones}
for o in set(bpy.data.objects)-antes: o.hide_render=True; o.hide_viewport=True
nomeQ = lambda n: {"head":"Head","Root":"root"}.get(n,n)
# direção de cada osso: da junta dele até a junta do filho que segue a cadeia
FILHO = {"pelvis":"spine_01","spine_01":"spine_02","spine_02":"spine_03","spine_03":"neck_01","neck_01":"head"}
for s in "lr":
    FILHO.update({"clavicle_"+s:"upperarm_"+s,"upperarm_"+s:"lowerarm_"+s,"lowerarm_"+s:"hand_"+s,"hand_"+s:"middle_01_"+s,
      "thigh_"+s:"calf_"+s,"calf_"+s:"foot_"+s,"foot_"+s:"ball_"+s})
    for d in ("index","middle","ring","pinky","thumb"):
        FILHO[d+"_01_"+s]=d+"_02_"+s; FILHO[d+"_02_"+s]=d+"_03_"+s
# lado (pra torção): vetor de esquerda pra direita de quem tem
LADO = {"pelvis":("thigh_l","thigh_r")}
for b in ("spine_01","spine_02","spine_03","neck_01"): LADO[b]=("clavicle_l","clavicle_r")
for s in "lr": LADO["hand_"+s]=("index_01_"+s,"pinky_01_"+s)
rpos = {b.name: R.matrix_world @ b.head_local for b in R.data.bones}
def rot_alvo(n):
    if n not in FILHO: return None
    a = (rpos[FILHO[n]]-rpos[n]).normalized(); b = (qpos[nomeQ(FILHO[n])]-qpos[nomeQ(n)]).normalized()
    D = a.rotation_difference(b)
    if n in LADO:
        x,y = LADO[n]; la = D @ (rpos[x]-rpos[y]); lb = qpos[nomeQ(x)]-qpos[nomeQ(y)]
        la -= b*la.dot(b); lb -= b*lb.dot(b)
        if la.length>1e-6 and lb.length>1e-6: D = la.normalized().rotation_difference(lb.normalized()) @ D
    return D
def centro(g):
    gi = h.vertex_groups[g].index
    vs=[h.matrix_world@v.co for v in h.data.vertices if any(x.group==gi and x.weight>.5 for x in v.groups)]
    c=sum(vs,Vector())/len(vs); return c, max((v-c).length for v in vs)
OLHOS=dict(OLHOS_HBM) if cfg.get("base")=="hbm" else {s: centro("helper-%s-eye"%s) for s in "lr"}
cab_rest=R.matrix_world @ R.data.bones["head"].matrix_local
# corpo amarrado na pose em que foi esculpido (2026-11-23): a malha vai pro GLB na pose dela (braço em A) e o
# transplante dá a ela matrizes de bind dessa pose. Assim o jogo deforma uma vez só, da escultura direto pra pose da
# luta; antes ela era dobrada pra pose T aqui e dobrada de novo no jogo, e o peito subia, a axila esticava em aba e o
# braço torcia. Tudo o mais (calção, luva, cabelo, roupas) continua feito em cima do corpo em T, como antes.
CO_A = [v.co.copy() for v in h.data.vertices]
A_MUNDO = {b.name: R.matrix_world @ b.matrix_local for b in R.data.bones}
bpy.context.view_layer.objects.active = R; bpy.ops.object.mode_set(mode="POSE")
def visitar(b):
    D = rot_alvo(b.name)
    if D is not None:
        pb = R.pose.bones[b.name]; bpy.context.view_layer.update()
        rest = b.matrix_local.to_quaternion()
        pb.matrix = Matrix.LocRotScale(pb.head, D @ rest, None)
        bpy.context.view_layer.update()
    for c in b.children: visitar(c)
for b in R.data.bones:
    if b.parent is None: visitar(b)
bpy.context.view_layer.update()
cab_pose=R.matrix_world @ R.pose.bones["head"].matrix
# o quanto cada osso andou da pose da escultura até a T (no mundo): o transplante põe o bind do corpo nessa pose
DELTA_T = {pb.name: (R.matrix_world @ pb.matrix) @ A_MUNDO[pb.name].inverted() for pb in R.pose.bones}
OLHOS={k:(cab_pose @ cab_rest.inverted() @ c, r) for k,(c,r) in OLHOS.items()}
bpy.ops.object.mode_set(mode="OBJECT")
# ---- aplica: alvos, máscara e armadura na malha; pose vira descanso
for o in (h, sobr):
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        if m.type in ("MASK","ARMATURE"): bpy.ops.object.modifier_apply(modifier=m.name)
        else: o.modifiers.remove(m)
bpy.context.view_layer.objects.active = R; bpy.ops.object.mode_set(mode="POSE")
bpy.ops.pose.select_all(action="SELECT"); bpy.ops.pose.armature_apply(selected=False); bpy.ops.object.mode_set(mode="OBJECT")
exec(open(os.path.join(AQUI,"roupas.py")).read())
POS = {b.name: R.matrix_world @ b.head_local for b in R.data.bones}
corpo_colisao = h   # o pano (calção e roupas) colide com o corpo
calcao, luvas = roupas(h, R, POS)
for o in (calcao, luvas):
    m = o.modifiers.new("Armature","ARMATURE"); m.object = R; o.parent = R
for o in (h, sobr):
    m = o.modifiers.new("Armature","ARMATURE"); m.object = R; o.parent = R
# tira os vértices de ajuda que a máscara já escondeu (a máscara aplicada já tirou)
# ---- olhos: esferas presas no osso da cabeça (textura gerada aqui)
N=256; yy,xx=np.mgrid[0:N,0:N]/(N-1); v=yy   # v do UV da esfera: 1 no polo
img=np.zeros((N,N,4),np.float32); img[...,3]=1
esc=np.clip((v-0.80)/0.02,0,1)
cor_iris=np.array(cfg.get("iris",[.16,.09,.045])); sclera=np.array([.86,.83,.8])
ang=np.arctan2(np.sin(xx*2*np.pi),np.cos(xx*2*np.pi)); var=0.75+0.25*np.sin(ang*23)*np.cos(ang*7)
iris=cor_iris[None,None,:]*var[...,None]*(0.6+0.4*np.clip((0.97-v)/0.12,0,1))[...,None]
rgb=sclera[None,None,:]*(1-esc[...,None])+iris*esc[...,None]
pup=np.clip((v-0.935)/0.01,0,1)[...,None]; rgb=rgb*(1-pup)+np.array([.01,.01,.01])*pup
img[...,:3]=rgb; im=bpy.data.images.new("olho",N,N); im.pixels=img.ravel(); im.file_format="PNG"
mo=bpy.data.materials.new("MI_Eyes"); mo.use_nodes=True; bs=mo.node_tree.nodes["Principled BSDF"]
tx=mo.node_tree.nodes.new("ShaderNodeTexImage"); tx.image=im; mo.node_tree.links.new(tx.outputs[0],bs.inputs["Base Color"]); bs.inputs["Roughness"].default_value=.08
olhos=[]
for s in "lr":
    c,raio=OLHOS[s]
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=raio*.97, location=c, rotation=(math.radians(90),0,0))
    o=bpy.context.active_object; o.name="olho_"+s; o.data.materials.append(mo); bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    g=o.vertex_groups.new(name="head"); g.add(range(len(o.data.vertices)),1.0,"REPLACE")
    o.parent=R; o.matrix_parent_inverse=R.matrix_world.inverted(); m=o.modifiers.new("Armature","ARMATURE"); m.object=R; olhos.append(o)
CABELOS_OBJ = []
if cfg.get("base")=="hbm":
    exec(open(os.path.join(AQUI,"cabelos.py")).read())
ROUPAS = {}
if cfg.get("base")=="hbm" and cfg.get("acessorios", True):
    exec(open(os.path.join(AQUI,"acessorios.py")).read())
# ---- materiais simples que o glTF leva: pele com a textura difusa, sobrancelha com alfa
mp=bpy.data.materials.new("MI_Pele"); mp.use_nodes=True; bs=mp.node_tree.nodes["Principled BSDF"]
tx=mp.node_tree.nodes.new("ShaderNodeTexImage"); tx.image=PELE_IMG if cfg.get("base")=="hbm" else bpy.data.images.load(textura_do_mhmat(pele_mhmat,"diffuseTexture")); mp.node_tree.links.new(tx.outputs[0],bs.inputs["Base Color"])
if cfg.get("base")=="hbm":   # relevo da escultura (mapa normal) no corpo realista
    tn=mp.node_tree.nodes.new("ShaderNodeTexImage"); tn.image=NORMAL_IMG; nm=mp.node_tree.nodes.new("ShaderNodeNormalMap"); nm.uv_map="jogo"
    mp.node_tree.links.new(tn.outputs[0],nm.inputs["Color"]); mp.node_tree.links.new(nm.outputs[0],bs.inputs["Normal"])
bs.inputs["Roughness"].default_value=.55
h.data.materials.clear(); h.data.materials.append(mp)
for p in h.data.polygons: p.material_index=0
ms=bpy.data.materials.new("MI_Brows"); ms.use_nodes=True; bs=ms.node_tree.nodes["Principled BSDF"]
bs.inputs["Base Color"].default_value=(.035,.025,.02,1); bs.inputs["Roughness"].default_value=.8
sobr.data.materials.clear(); sobr.data.materials.append(ms)
h.name="corpo"; sobr.name="sobrancelha"; R.name="Armature"
for o in list(bpy.data.objects):
    if o not in (h,sobr,R,calcao,luvas,*olhos,*CABELOS_OBJ,*ROUPAS.values()): bpy.data.objects.remove(o, do_unlink=True)
for m in list(bpy.data.materials):
    if m not in (mp,mo,ms) and not m.name.startswith(("MI_Calcao","MI_Luva","MI_Faixa","MI_Fios","MI_Corda","MI_Punho","MI_Tecido","MI_Debrum","MI_Cinta","MI_Pelo","MI_Lapela","MI_Bandeira","MI_Cordao","MI_Branco")): bpy.data.materials.remove(m)
mp.name="MI_Pele"; mo.name="MI_Eyes"; ms.name="MI_Brows"
for o in (h, calcao, luvas, *olhos): o.data.name = o.name   # o nome da malha no GLB (o da Blender Studio era "female_v006lowresUV")
for m in [m for m in h.modifiers if m.type == "COLLISION"]: h.modifiers.remove(m)   # a colisão só servia pro pano
for pb in R.pose.bones: pb.custom_shape = None   # o desenho dos ossos do rig (Icosphere) não vai pro GLB
for o in [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("Icosphere")]: bpy.data.objects.remove(o, do_unlink=True)
# o corpo volta pra pose da escultura (os mesmos vértices: o calção só apagou faces) e o delta de cada osso vai pro transplante
assert len(h.data.vertices) == len(CO_A), (len(h.data.vertices), len(CO_A))
for v, co in zip(h.data.vertices, CO_A): v.co = co
h.data.update()
json.dump({n: [list(r) for r in M] for n, M in DELTA_T.items()}, open(os.path.join(TRAB, "bind_corpo.json"), "w"))
for x in bpy.data.objects: x.select_set(x in (h,R,calcao,luvas,*olhos))   # a sobrancelha agora é peça (rosto_sobrancelhas)
bpy.ops.export_scene.gltf(filepath=cfg["saida"], export_format="GLB", use_selection=True, export_skins=True, export_animations=False, export_morph=False,
    export_image_format="JPEG", export_jpeg_quality=88, export_yup=True, export_apply=False)
print("EXPORTADO", cfg["saida"], len(h.data.vertices))
# cada corte e cada barba num GLB próprio (coordenadas do corpo em repouso; o jogo leva pro espaço do osso da cabeça)
pasta_cab = os.path.join(TRAB, "pecas"); os.makedirs(pasta_cab, exist_ok=True)
for o in CABELOS_OBJ:
    for x in bpy.data.objects: x.select_set(x is o)
    bpy.ops.export_scene.gltf(filepath=os.path.join(pasta_cab, o.name + ".glb"), export_format="GLB", use_selection=True, export_skins=False,
        export_animations=False, export_morph=False, export_materials="NONE", export_yup=True, export_vertex_color="ACTIVE", export_normals=True)   # a normal vai no arquivo: o volume esculpido tem costura de UV e a normal calculada no jogo vincava ali; material e textura: o jogo põe
print("CORTES", len(CABELOS_OBJ))
# roupas de corpo: com a armadura (pesos de osso); o jogo liga no esqueleto do lutador pelo nome
for nome_r, o in ROUPAS.items():
    for x in bpy.data.objects: x.select_set(x is o or x is R)
    sk = o.get("sem_pesos")
    bpy.ops.export_scene.gltf(filepath=os.path.join(pasta_cab, "roupa_" + o.name + ".glb"), export_format="GLB", use_selection=True, export_skins=not sk,
        export_animations=False, export_morph=False, export_yup=True, export_image_format="WEBP")
print("ROUPAS", list(ROUPAS))
