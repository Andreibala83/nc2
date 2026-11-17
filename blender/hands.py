"""Cuts the forearm + hand out of Mixamo Y Bot and exports skinned GLBs (one per side).
Each GLB keeps only the forearm/hand/finger bones so the fingers can be posed live in Three.js."""
import bpy, sys

OUT = HERE + 'out/'  # copy bench_bg (as .jpg), camera.json and env.hdr into assets/crimp/
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=HERE + 'Y_Bot.fbx')
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in bpy.data.objects: o.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
# one mesh: surface + joint rings
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[1] if meshes[1].name == 'Alpha_Surface' else meshes[0]
bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
print('joined', body.name, len(body.data.vertices))

def export_side(side):
    keep = {b.name for b in arm.data.bones if b.name.startswith('mixamorig:%sHand' % side) or b.name == 'mixamorig:%sForeArm' % side}
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.duplicate()
    a2 = [o for o in bpy.context.selected_objects if o.type == 'ARMATURE'][0]
    m2 = [o for o in bpy.context.selected_objects if o.type == 'MESH'][0]
    a2.name = 'Hand%s_Rig' % side; m2.name = 'Hand%s' % side
    for md in m2.modifiers:
        if md.type == 'ARMATURE': md.object = a2
    # drop vertices that do not belong to the forearm/hand
    gidx = {g.index for g in m2.vertex_groups if g.name in keep}
    hand_idx = {g.index for g in m2.vertex_groups if g.name in keep and g.name != 'mixamorig:%sForeArm' % side}
    fore = m2.vertex_groups.get('mixamorig:%sForeArm' % side)
    import bmesh
    bm = bmesh.new(); bm.from_mesh(m2.data); dl = bm.verts.layers.deform.active
    # keep the hand plus only the wrist end of the forearm
    hb = a2.data.bones['mixamorig:%sHand' % side].head_local
    kill = []
    for v in bm.verts:
        w = sum(val for gi, val in v[dl].items() if gi in gidx)
        if w < .5: kill.append(v); continue
        if (v.co - hb).length > .16: kill.append(v)
    bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(m2.data); bm.free()
    # remove other vertex groups so skin only references kept bones
    for g in list(m2.vertex_groups):
        if g.name not in keep: m2.vertex_groups.remove(g)
    bpy.ops.object.select_all(action='DESELECT'); m2.select_set(True); bpy.context.view_layer.objects.active = m2
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    # trim the skeleton
    bpy.ops.object.select_all(action='DESELECT'); a2.select_set(True); bpy.context.view_layer.objects.active = a2
    bpy.ops.object.mode_set(mode='EDIT')
    eb = a2.data.edit_bones
    for b in list(eb):
        if b.name not in keep: eb.remove(b)
    eb['mixamorig:%sForeArm' % side].parent = None
    bpy.ops.object.mode_set(mode='OBJECT')
    for p in m2.data.polygons: p.use_smooth = True
    bpy.ops.object.select_all(action='DESELECT'); m2.select_set(True); bpy.context.view_layer.objects.active = m2
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=.0015); bpy.ops.object.mode_set(mode='OBJECT')
    for kind, kw in (('SMOOTH', dict(factor=.8, iterations=12)),):
        md = m2.modifiers.new(kind.lower(), kind)
        for k, v in kw.items(): setattr(md, k, v)
        bpy.ops.object.modifier_move_to_index(modifier=md.name, index=len([x for x in m2.modifiers if x.type != 'ARMATURE']) - 1)
        bpy.ops.object.modifier_apply(modifier=md.name)
    m2.modifiers.new('ws', 'WEIGHTED_NORMAL') if False else None
    bpy.ops.object.select_all(action='DESELECT'); a2.select_set(True); m2.select_set(True)
    bpy.ops.export_scene.gltf(filepath=OUT + 'hand_%s.glb' % side[0].lower(), use_selection=True, export_skins=True,
                              export_animations=False, export_morph=False, export_materials='NONE', export_yup=True)
    print('exported', side, len(m2.data.vertices), sorted(keep)[:3])

export_side('Right'); export_side('Left')
