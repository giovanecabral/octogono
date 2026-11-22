# Corpo realista da Blender Studio pronto pro jogo: UV num quadro só e o relevo da escultura assado (mapa normal).
# Salva hbm_base.blend (só o corpo, nível 0, com a escultura ainda no multires) e hbm_normal.png.
import bpy, sys, os
pasta = sys.argv[sys.argv.index("--")+1]
b = bpy.data.objects["GEO-body_male_realistic"]
olhos = [o for o in bpy.data.objects if o.parent == b]
for o in list(bpy.data.objects):
    if o is not b and o not in olhos: bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections):
    if b.name not in c.objects: pass
me = b.data
nova = me.uv_layers.new(name="jogo", do_init=True); me.uv_layers.active = nova; nova.active_render = True
bpy.context.view_layer.objects.active = b; b.select_set(True)
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.uv.select_all(action="SELECT")
bpy.ops.uv.pack_islands(udim_source="CLOSEST_UDIM", rotate=True, margin=0.004, shape_method="CONCAVE")
bpy.ops.object.mode_set(mode="OBJECT")
me = b.data; nova = me.uv_layers["jogo"]; us = [d.uv for d in nova.data]; print("UV", min(u.x for u in us), max(u.x for u in us), min(u.y for u in us), max(u.y for u in us))
m = [x for x in b.modifiers if x.type=="MULTIRES"][0]; m.levels = 0; m.render_levels = m.total_levels
sc = bpy.context.scene; sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"
sc.render.use_bake_multires = True; sc.render.bake_type = "NORMALS"; sc.render.bake_margin = 16
img = bpy.data.images.new("normal", 4096, 4096, alpha=False); img.colorspace_settings.name = "Non-Color"
mat = bpy.data.materials.new("pele"); mat.use_nodes = True; t = mat.node_tree.nodes.new("ShaderNodeTexImage"); t.image = img; mat.node_tree.nodes.active = t
me.materials.clear(); me.materials.append(mat)
bpy.ops.object.bake_image()
img.filepath_raw = os.path.join(pasta, "hbm_normal.png"); img.file_format = "PNG"; img.save()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(pasta, "hbm_base.blend"))
print("PRONTO")
