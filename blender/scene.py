"""Builds the COC 2 crimping-bench background in Blender and renders it.
Usage: python scene.py [preview|final]
Writes: out/bench_bg.png, out/camera.json, out/env.hdr, scene.blend
"""
import bpy, bmesh, math, json, sys, random
from mathutils import Vector, Matrix, Euler

MODE = sys.argv[-1] if sys.argv[-1] in ('preview', 'final') else 'preview'
import os
HERE = os.path.dirname(os.path.abspath(__file__)) + '/'
OUT = HERE + 'out/'  # copy bench_bg (as .jpg), camera.json and env.hdr into assets/crimp/
TEX = HERE + 'oak_wood_planks_4k/'  # unzip oak_wood_planks_4k_blend_1.zip here
EXR = HERE + 'brown_photostudio_07_4k.exr'
FONT = HERE + 'Poppins-Bold.ttf'  # any bold font; falls back to Blender's built-in one
random.seed(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

# ---------------------------------------------------------------- helpers
def mat(name, color, rough=.5, metal=0., spec=.5, trans=0., alpha=1., coat=0., ior=1.45):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['Specular IOR Level'].default_value = spec
    b.inputs['Transmission Weight'].default_value = trans
    b.inputs['IOR'].default_value = ior
    b.inputs['Coat Weight'].default_value = coat
    if alpha < 1: b.inputs['Alpha'].default_value = alpha
    return m

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c)

def link(o):
    sc.collection.objects.link(o); return o

def new_obj(name, me):
    return link(bpy.data.objects.new(name, me))

def add_mod(o, kind, **kw):
    m = o.modifiers.new(kind.lower(), kind)
    for k, v in kw.items(): setattr(m, k, v)
    return m

def smooth(o):
    for p in o.data.polygons: p.use_smooth = True

def cube(name, size, loc, m, bevel=0., seg=3, rot=(0, 0, 0)):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bm.to_mesh(me); bm.free()
    o = new_obj(name, me); o.location = loc; o.rotation_euler = rot; o.data.materials.append(m)
    if bevel: add_mod(o, 'BEVEL', width=bevel, segments=seg, limit_method='ANGLE'); smooth(o)
    return o

def cyl(name, r, h, loc, m, rot=(0, 0, 0), seg=32, bevel=0.):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=h)
    bm.to_mesh(me); bm.free()
    o = new_obj(name, me); o.location = loc; o.rotation_euler = rot; o.data.materials.append(m)
    if bevel: add_mod(o, 'BEVEL', width=bevel, segments=3, limit_method='ANGLE')
    smooth(o); return o

def torus(name, R, r, loc, m, rot=(0, 0, 0)):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    seg, ts = 96, 16
    vs = []
    for i in range(seg):
        a = i / seg * math.tau; row = []
        for j in range(ts):
            b = j / ts * math.tau
            row.append(bm.verts.new(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b))))
        vs.append(row)
    for i in range(seg):
        for j in range(ts):
            bm.faces.new((vs[i][j], vs[(i + 1) % seg][j], vs[(i + 1) % seg][(j + 1) % ts], vs[i][(j + 1) % ts]))
    bm.to_mesh(me); bm.free()
    o = new_obj(name, me); o.location = loc; o.rotation_euler = rot; o.data.materials.append(m); smooth(o)
    return o

def text(name, body, size, loc, m, rot=(math.pi / 2, 0, 0), extrude=0.0005):
    cu = bpy.data.curves.new(name, 'FONT'); cu.body = body; cu.size = size
    cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.extrude = extrude; cu.space_line = .95
    try: cu.font = bpy.data.fonts.load(FONT)
    except Exception: pass
    o = new_obj(name, cu); o.location = loc; o.rotation_euler = rot; o.data.materials.append(m)
    return o

# ---------------------------------------------------------------- materials
M = {}
M['blue'] = mat('BinBlue', srgb('#1f66dc'), rough=.32, coat=.4)
M['cable'] = mat('CableBlue', srgb('#1d63d8'), rough=.28, coat=.5)
M['label'] = mat('Label', srgb('#e9ebee'), rough=.6)
M['ink'] = mat('Ink', srgb('#3a3d42'), rough=.6)
M['clear'] = mat('ClearPlastic', srgb('#eef6fb'), rough=.08, trans=1., ior=1.46)
M['gold'] = mat('Gold', srgb('#d9b24a'), rough=.25, metal=1.)
M['steel'] = mat('Steel', srgb('#b9c0c8'), rough=.25, metal=1.)
M['dark'] = mat('DarkMetal', srgb('#2a2d33'), rough=.35, metal=.6)
M['red'] = mat('RedGrip', srgb('#d8322b'), rough=.35, coat=.3)
M['yellow'] = mat('YellowGrip', srgb('#f2b51c'), rough=.35, coat=.3)
M['blk'] = mat('BlackRubber', srgb('#1b1c1f'), rough=.6)
M['tblue'] = mat('ToolBlue', srgb('#2a6fe6'), rough=.3, coat=.4)
M['hook'] = mat('Hook', srgb('#9aa1a9'), rough=.3, metal=1.)

# pegboard
peg = bpy.data.materials.new('Pegboard'); peg.use_nodes = True
nt = peg.node_tree; b = nt.nodes['Principled BSDF']
tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
mp.inputs['Scale'].default_value = (1 / .16, 1 / .16, 1 / .16)  # 4 holes per 0.16 m tile = 40 mm pitch
img = nt.nodes.new('ShaderNodeTexImage'); img.image = bpy.data.images.load(HERE + 'pegboard.png')
bimg = nt.nodes.new('ShaderNodeTexImage'); bimg.image = bpy.data.images.load(HERE + 'pegboard_bump.png'); bimg.image.colorspace_settings.name = 'Non-Color'
bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .6; bump.inputs['Distance'].default_value = .003
nt.links.new(tc.outputs['UV'], mp.inputs['Vector'])
for n in (img, bimg): nt.links.new(mp.outputs['Vector'], n.inputs['Vector'])
nt.links.new(img.outputs['Color'], b.inputs['Base Color'])
nt.links.new(bimg.outputs['Color'], bump.inputs['Height'])
nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
b.inputs['Roughness'].default_value = .7

# oak bench: append Poly Haven material
with bpy.data.libraries.load(TEX + 'oak_wood_planks_4k.blend') as (src, dst):
    dst.materials = ['oak_wood_planks']
oak = dst.materials[0]
for n in oak.node_tree.nodes:
    if n.type == 'TEX_IMAGE' and n.image:
        n.image.filepath = TEX + 'textures/' + n.image.filepath.split('/')[-1]
    if n.type == 'MAPPING':
        n.inputs['Scale'].default_value = (1 / 1.5, 1 / 1.5, 1)
    if n.type == 'DISPLACEMENT':
        n.inputs['Scale'].default_value = .002
# warm the wood slightly toward the reference's honey tone
ob = oak.node_tree.nodes['Principled BSDF']
diff = [l.from_node for l in oak.node_tree.links if l.to_socket == ob.inputs['Base Color']][0]
hsv = oak.node_tree.nodes.new('ShaderNodeHueSaturation')
hsv.inputs['Value'].default_value = 1.3; hsv.inputs['Saturation'].default_value = 1.12; hsv.inputs['Hue'].default_value = .505
ob.inputs['Specular IOR Level'].default_value = .25
mix = oak.node_tree.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.inputs['Factor'].default_value = .3
mix.inputs['B'].default_value = (*srgb('#e0a265'), 1)
oak.node_tree.links.new(hsv.outputs['Color'], mix.inputs['A'])
oak.node_tree.links.new(mix.outputs['Result'], ob.inputs['Base Color'])
oak.node_tree.links.new(diff.outputs['Color'], hsv.inputs['Color'])
oak.node_tree.links.new(hsv.outputs['Color'], ob.inputs['Base Color'])

# ---------------------------------------------------------------- geometry
# bench top (z = 0 is the work surface)
bench = cube('Bench', (3.2, 1.6, .04), (0, -.36, -.02), oak, bevel=.004)
me = bench.data
me.uv_layers.new(name='UVMap')
uv = me.uv_layers.active.data
for poly in me.polygons:
    for li in poly.loop_indices:
        v = me.vertices[me.loops[li].vertex_index].co
        uv[li].uv = (v.x, v.y) if abs(poly.normal.z) > .5 else (v.x, v.z)

# pegboard wall + rail
WALL_Y = .44
wall = cube('Pegboard', (3.2, .012, 1.4), (0, WALL_Y + .006, .70), peg)
wme = wall.data; wme.uv_layers.new(name='UVMap'); wuv = wme.uv_layers.active.data
for poly in wme.polygons:
    for li in poly.loop_indices:
        v = wme.vertices[wme.loops[li].vertex_index].co
        wuv[li].uv = (v.x + .02, v.z + .70 + .02)
cube('BackRail', (3.2, .03, .045), (0, WALL_Y - .012, .0225), mat('Rail', srgb('#8f969e'), rough=.4, metal=.3), bevel=.004)

# blue bin (tapered open box, solidified + bevelled)
def bin_obj(name, w, d, h, loc, taper=1.07):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(w, d, h), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts)
    top = [f for f in bm.faces if f.normal.z > .9]
    bmesh.ops.delete(bm, geom=top, context='FACES_ONLY')
    for v in bm.verts:
        if v.co.z > h * .9: v.co.x *= taper; v.co.y *= taper
    bm.to_mesh(me); bm.free()
    o = new_obj(name, me); o.location = loc; o.data.materials.append(M['blue'])
    add_mod(o, 'SOLIDIFY', thickness=.012, offset=-1)
    add_mod(o, 'BEVEL', width=.005, segments=4, limit_method='ANGLE')
    smooth(o); return o

BIN = dict(w=.36, d=.22, h=.10, x=-.04, y=.235)
bin_obj('Bin', BIN['w'], BIN['d'], BIN['h'], (BIN['x'], BIN['y'], 0))
# rim lip
lip_me = bpy.data.meshes.new('Lip'); bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(BIN['w'] * 1.07 + .012, BIN['d'] * 1.07 + .012, .012), verts=bm.verts)
bm.to_mesh(lip_me); bm.free()
lip = new_obj('Lip', lip_me); lip.location = (BIN['x'], BIN['y'], BIN['h'] - .004); lip.data.materials.append(M['blue'])
inner = cube('LipCut', (BIN['w'] * 1.07 - .03, BIN['d'] * 1.07 - .03, .05), (BIN['x'], BIN['y'], BIN['h']), M['blue'])
bo = add_mod(lip, 'BOOLEAN', object=inner, operation='DIFFERENCE'); inner.hide_render = True; inner.hide_viewport = True
add_mod(lip, 'BEVEL', width=.005, segments=4, limit_method='ANGLE'); smooth(lip)
# label on the front face (front face is tilted by the taper)
front_y = BIN['y'] - BIN['d'] / 2 * 1.035 - .002
tilt = math.atan2(BIN['d'] / 2 * .07, BIN['h'])
lab = cube('Label', (.17, .002, .068), (BIN['x'], front_y, BIN['h'] * .5), M['label'], bevel=.004, rot=(-tilt, 0, 0))
text('LabelText', 'RJ45\nConnectors', .030, (BIN['x'], front_y - .0022, BIN['h'] * .5), M['ink'], rot=(math.pi / 2 - tilt, 0, 0))

# RJ45 connectors heaped in the bin (cartoon-sized like the reference)
def rj45(name, loc, rot, s=1.):
    g = []
    w, l, h = .028 * s, .040 * s, .022 * s
    body = cube(name, (w, l, h), loc, M['clear'], bevel=.002 * s)
    body.rotation_euler = rot; g.append(body)
    for i in range(8):
        c = cube(name + '_pin%d' % i, (w * .07, l * .22, h * .1), (0, 0, 0), M['gold'])
        c.parent = body; c.location = ((i - 3.5) * w * .11, -l * .36, h * .47)
    clip = cube(name + '_clip', (w * .35, l * .7, h * .12), (0, 0, 0), M['clear'], bevel=.001 * s)
    clip.parent = body; clip.location = (0, .05 * l, -h * .62); clip.rotation_euler = (.18, 0, 0)
    return body

spots = [(-.12, .21, .030), (-.055, .25, .034), (.015, .215, .032), (.085, .245, .030), (-.09, .27, .052), (.04, .27, .056), (-.02, .21, .060), (.11, .2, .045)]
for i, (x, y, z) in enumerate(spots):
    rj45('RJ%d' % i, (BIN['x'] + x + .04, y, z + .03), (random.uniform(-.5, .5) - .3, random.uniform(-.4, .4), random.uniform(-.6, .6)), 1.55)

# cable coil on the right
for k in range(7):
    R = .215 - (k % 3) * .013 + random.uniform(-.004, .004)
    torus('Coil%d' % k, R, .014, (.74 + random.uniform(-.006, .006), .20 + random.uniform(-.006, .006), .014 + k * .0125),
          M['cable'], rot=(random.uniform(-.03, .03), random.uniform(-.03, .03), 0))

# tools hanging on the pegboard (only their lower halves are in frame)
def hook(x, z):
    cyl('Hook', .003, .05, (x, WALL_Y - .025, z), M['hook'], rot=(math.pi / 2, 0, 0), seg=12)

def grip(name, loc, size, m, rot=(0, 0, 0)):
    o = cube(name, size, loc, m, rot=rot); add_mod(o, 'SUBSURF', levels=3, render_levels=3); smooth(o); return o

# red-handled cutters
cx = .20
for s in (-1, 1):
    grip('RedGrip', (cx + s * .024, WALL_Y - .03, .215), (.028, .026, .20), M['red'], rot=(0, s * .10, 0))
cube('CutterHead', (.05, .02, .07), (cx, WALL_Y - .03, .345), M['dark'], bevel=.006)
hook(cx, .45)
# yellow screwdriver (handle down)
sx = .37
grip('YellowHandle', (sx, WALL_Y - .03, .20), (.034, .034, .13), M['yellow'])
cyl('YellowBand', .0185, .022, (sx, WALL_Y - .03, .245), M['blk'], seg=32)
cyl('Shaft', .004, .2, (sx, WALL_Y - .03, .36), M['steel'], seg=16)
hook(sx, .34)
# blue punch-down style tool
bx = .52
grip('BlueTool', (bx, WALL_Y - .03, .22), (.034, .034, .20), M['tblue'])
cyl('BlueTip', .005, .12, (bx, WALL_Y - .03, .37), M['steel'], seg=16)
hook(bx, .39)
# a couple of empty hooks for life
for x, z in ((-.30, .30), (-.55, .26), (.82, .30)): hook(x, z)

# ---------------------------------------------------------------- light, world, camera
world = bpy.data.worlds.new('World'); sc.world = world; world.use_nodes = True
wn = world.node_tree; env = wn.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(EXR)
wmap = wn.nodes.new('ShaderNodeMapping'); wtc = wn.nodes.new('ShaderNodeTexCoord')
wmap.inputs['Rotation'].default_value = (0, 0, math.radians(110))
wn.links.new(wtc.outputs['Generated'], wmap.inputs['Vector']); wn.links.new(wmap.outputs['Vector'], env.inputs['Vector'])
bg = wn.nodes['Background']; bg.inputs['Strength'].default_value = 1.1
wn.links.new(env.outputs['Color'], bg.inputs['Color'])

SUN_DIR = Vector((-.38, -.42, -.82)).normalized()   # light travels from back-right-top toward the camera
sun_d = bpy.data.lights.new('Sun', 'SUN'); sun_d.energy = 3.2; sun_d.angle = math.radians(9); sun_d.color = (1, .96, .9)
sun = link(bpy.data.objects.new('Sun', sun_d))
sun.rotation_euler = (-SUN_DIR).to_track_quat('Z', 'Y').to_euler()
fill_d = bpy.data.lights.new('Fill', 'AREA'); fill_d.energy = 60; fill_d.size = 1.2; fill_d.color = (.9, .95, 1)
fill = link(bpy.data.objects.new('Fill', fill_d)); fill.location = (-.6, -.9, 1.0)
fill.rotation_euler = (Vector((0, .1, 0)) - fill.location).to_track_quat('-Z', 'Y').to_euler()

CAM_POS = Vector((.02, -.80, .56)); CAM_TGT = Vector((.02, .14, -.055)); LENS = 30.
cam_d = bpy.data.cameras.new('Cam'); cam_d.lens = LENS; cam_d.sensor_width = 36; cam_d.sensor_fit = 'HORIZONTAL'
cam_d.clip_start = .01
cam = link(bpy.data.objects.new('Cam', cam_d)); cam.location = CAM_POS
cam.rotation_euler = (CAM_TGT - CAM_POS).to_track_quat('-Z', 'Y').to_euler(); sc.camera = cam

# ---------------------------------------------------------------- render
W, H = (1920, 1080) if MODE == 'final' else (640, 360)
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
sc.cycles.samples = 96 if MODE == 'final' else 24
sc.cycles.use_denoising = True
sc.cycles.max_bounces = 8; sc.cycles.transmission_bounces = 8
sc.render.resolution_x = W; sc.render.resolution_y = H; sc.render.resolution_percentage = 100
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'; sc.view_settings.exposure = -0.35
sc.render.image_settings.file_format = 'PNG'
sc.render.filepath = OUT + ('bench_bg.png' if MODE == 'final' else 'bench_preview.png')
sc.render.film_transparent = False
bpy.ops.render.render(write_still=True)

# ---------------------------------------------------------------- camera + light for Three.js (Y-up: x, z, -y)
to3 = lambda v: [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]
vfov = math.degrees(2 * math.atan((36 / (W / H)) / 2 / LENS))
json.dump({'pos': to3(CAM_POS), 'target': to3(CAM_TGT), 'vfov': round(vfov, 4), 'aspect': W / H,
           'sunDir': to3(SUN_DIR), 'benchY': 0, 'wallZ': round(-WALL_Y, 4), 'exposure': -.35},
          open(OUT + 'camera.json', 'w'), indent=1)

if MODE == 'final':
    im = bpy.data.images.load(EXR); im.scale(512, 256)
    im.filepath_raw = OUT + 'env.hdr'; im.file_format = 'HDR'; im.save()
    bpy.ops.wm.save_as_mainfile(filepath=HERE + 'scene.blend')
print('DONE', MODE)
