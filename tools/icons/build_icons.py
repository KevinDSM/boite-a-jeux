"""Icônes des jeux, modélisées et rendues dans Blender (sans interface).

Chaque jeu a un petit objet en 3D, éclairé comme une icône d'iPhone, rendu sur fond transparent ;
la tuile de couleur du jeu est dessinée par le site (CSS), sous l'objet.
Usage :
  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \
      -P tools/icons/build_icons.py -- timeline bataille sablier poker
Sans nom de jeu : toutes les icônes connues. Sortie : icons/<jeu>.png (512 px).
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector, Euler

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'icons')
PREVIEW = os.environ.get('ICON_PREVIEW') == '1'      # aperçu rapide : petit rendu, peu d'échantillons
SIZE = 256 if PREVIEW else 512
FONT_BOLD = 'C:/Windows/Fonts/segoeuib.ttf'
FONT_SYM = 'C:/Windows/Fonts/seguisym.ttf'


# ---------------------------------------------------------------- scène
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 24 if PREVIEW else 128
    sc.cycles.use_denoising = True
    try: sc.cycles.device = 'GPU'
    except Exception: pass
    sc.render.resolution_x = sc.render.resolution_y = SIZE
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'      # couleurs franches, comme une icône (AgX les délave)
    sc.view_settings.exposure = -0.15
    world = bpy.data.worlds.new('w'); sc.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs[0].default_value = (0.8, 0.82, 0.88, 1); bg.inputs[1].default_value = 0.22
    # caméra : légèrement au-dessus, focale longue (peu de déformation, comme une icône)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.lens = 85
    place_camera(cam, elev=24, azim=-18, dist=7.2)
    # lumières : clé douce en haut à gauche, contre-jour, débouchage
    area('cle', (-2.6, -2.8, 4.2), 650, 3.2, (1, 0.97, 0.92))
    area('contre', (2.8, 3.2, 3.0), 520, 2.4, (0.9, 0.94, 1))
    area('bas', (2.5, -3.5, -0.4), 160, 3.0, (1, 1, 1))
    return sc

def place_camera(cam, elev, azim, dist, target=(0, 0, 0)):
    e, a = math.radians(elev), math.radians(azim)
    cam.location = Vector(target) + Vector((dist * math.cos(e) * math.sin(a), -dist * math.cos(e) * math.cos(a), dist * math.sin(e)))
    d = Vector(target) - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

def area(name, loc, power, size, color):
    l = bpy.data.lights.new(name, 'AREA'); l.energy = power; l.size = size; l.color = color
    o = bpy.data.objects.new(name, l); bpy.context.scene.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()

def mat(name, color, rough=0.4, metal=0.0, coat=0.0, trans=0.0, ior=1.45, emit=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    for k in ('Coat Weight', 'Clearcoat'):
        if k in b.inputs: b.inputs[k].default_value = coat; break
    for k in ('Transmission Weight', 'Transmission'):
        if k in b.inputs: b.inputs[k].default_value = trans; break
    b.inputs['IOR'].default_value = ior
    if emit:
        for k in ('Emission Color', 'Emission'):
            if k in b.inputs: b.inputs[k].default_value = (*emit, 1); break
        b.inputs['Emission Strength'].default_value = 1.0
    return m

def hexc(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

def obj_from(name, data, m=None, loc=(0, 0, 0), rot=(0, 0, 0)):
    o = bpy.data.objects.new(name, data); bpy.context.scene.collection.objects.link(o)
    o.location = loc; o.rotation_euler = rot
    if m: o.data.materials.append(m)
    return o

def bevel(o, w=0.03, seg=4):
    md = o.modifiers.new('bev', 'BEVEL'); md.width = w; md.segments = seg; md.limit_method = 'ANGLE'
    o.modifiers.new('ws', 'WEIGHTED_NORMAL')
    for p in o.data.polygons: p.use_smooth = True
    return o

def cylinder(name, r, h, m, loc=(0, 0, 0), rot=(0, 0, 0), verts=96):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name
    if m: o.data.materials.append(m)
    return o

def rounded_box(name, sx, sy, sz, r, m, loc=(0, 0, 0), rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name; o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    if m: o.data.materials.append(m)
    md = o.modifiers.new('bev', 'BEVEL'); md.width = r; md.segments = 8
    for p in o.data.polygons: p.use_smooth = True
    return o

def text(name, body, font, size, m, loc, rot=(0, 0, 0), depth=0.012, align='CENTER'):
    c = bpy.data.curves.new(name, 'FONT'); c.body = body; c.size = size; c.extrude = depth
    c.align_x = align; c.align_y = 'CENTER'
    try: c.font = bpy.data.fonts.load(font, check_existing=True)
    except Exception: pass
    return obj_from(name, c, m, loc, rot)

def frame(objs, margin=1.04):
    """Recadre la caméra pour que l'objet remplisse l'icône."""
    sc = bpy.context.scene; cam = sc.camera
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    center = sum(pts, Vector()) / len(pts)
    radius = max((p - center).length for p in pts)
    fov = 2 * math.atan(cam.data.sensor_width / (2 * cam.data.lens))
    dist = radius * margin / math.sin(fov / 2)
    d = (cam.location - Vector((0, 0, 0))).normalized()
    cam.location = center + d * dist
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()

def render(key):
    os.makedirs(OUT, exist_ok=True)
    sc = bpy.context.scene; sc.render.filepath = os.path.join(OUT, key + '.png')
    bpy.ops.render.render(write_still=True)
    print('icône rendue :', sc.render.filepath)


# ---------------------------------------------------------------- les objets
def grooves(m, scale=38.0, strength=0.35):
    """Des sillons dans la matière : anneaux concentriques en relief (bump)."""
    nt = m.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tc = nt.nodes.new('ShaderNodeTexCoord'); wv = nt.nodes.new('ShaderNodeTexWave'); bp = nt.nodes.new('ShaderNodeBump')
    wv.wave_type = 'RINGS'; wv.rings_direction = 'SPHERICAL'; wv.inputs['Scale'].default_value = scale
    wv.inputs['Distortion'].default_value = 0.4
    bp.inputs['Strength'].default_value = strength
    nt.links.new(tc.outputs['Object'], wv.inputs['Vector']); nt.links.new(wv.outputs['Fac'], bp.inputs['Height'])
    nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m

def icon_timeline():                       # Décennies : un vinyle incliné, étiquette orange
    black = grooves(mat('vinyle', (0.006, 0.006, 0.008), rough=0.22, coat=0.8))
    lab = mat('etiquette', hexc('#ff7a1a'), rough=0.45)
    paper = mat('papier', hexc('#fff3e4'), rough=0.6)
    tilt = (math.radians(20), math.radians(-9), 0)   # on voit une ellipse et la tranche
    disc = cylinder('disque', 1.5, 0.07, black, rot=tilt)
    bevel(disc, 0.02, 3)
    label = cylinder('etiquette', 0.55, 0.074, lab, rot=tilt)
    stripe = cylinder('rond', 0.2, 0.076, paper, rot=tilt)
    hole = cylinder('trou', 0.05, 0.08, mat('trou', (0.01, 0.01, 0.01), rough=0.6), rot=tilt)
    return [disc]

def icon_bataille():                       # Bataille : un roi de pique et un as de cœur en éventail
    card = mat('carte', hexc('#eee6d8'), rough=0.38, coat=0.35)
    ink = mat('noir', (0.015, 0.015, 0.02), rough=0.4)
    red = mat('rouge', hexc('#e0263a'), rough=0.35)
    edge = mat('tranche', hexc('#e9e1d3'), rough=0.5)
    objs = []
    up = (math.radians(90), 0, 0)                    # un texte posé debout, face à la caméra (-Y)
    for k, (ang, x, letter, suit, m) in enumerate([(13, -0.45, 'R', '♠', ink), (-11, 0.45, 'A', '♥', red)]):
        # la carte, construite à plat dans le plan XZ, face vers -Y
        bpy.ops.mesh.primitive_cube_add(size=1)
        c = bpy.context.active_object; c.name = f'carte{k}'; c.scale = (1.25, 0.035, 1.75)
        bpy.ops.object.transform_apply(scale=True)
        c.data.materials.append(card)
        md = c.modifiers.new('bev', 'BEVEL'); md.width = 0.12; md.segments = 10; md.affect = 'EDGES'
        md.limit_method = 'ANGLE'; md.angle_limit = math.radians(60)
        for pl in c.data.polygons: pl.use_smooth = True
        for dx, dz, body, font, sz in [(-0.4, 0.62, letter, FONT_BOLD, 0.36), (-0.4, 0.36, suit, FONT_SYM, 0.26),
                                       (0.0, -0.06, suit, FONT_SYM, 0.95)]:
            t = text(f'{body}{k}{dz}', body, font, sz, m, (dx, -0.024, dz), rot=up)
            t.parent = c
        c.location = (x, -k * 0.07, 0); c.rotation_euler = (0, math.radians(ang), 0)   # l'as devant le roi
        objs.append(c)
    # l'éventail un peu penché vers nous
    for o in objs: o.rotation_euler.x = math.radians(-8)
    return objs

def icon_sablier():                        # Sablier : verre, sable doré, bois
    wood = mat('bois', hexc('#8a5a2b'), rough=0.45, coat=0.4)
    glass = mat('verre', (0.95, 0.97, 1.0), rough=0.02, trans=1.0, ior=1.45)
    sand = mat('sable', hexc('#f2b740'), rough=0.85)
    top = cylinder('haut', 0.95, 0.16, wood, loc=(0, 0, 1.25)); bevel(top, 0.04)
    bot = cylinder('bas', 0.95, 0.16, wood, loc=(0, 0, -1.25)); bevel(bot, 0.04)
    for i in range(3):
        a = math.radians(90 + i * 120)
        cylinder(f'montant{i}', 0.06, 2.4, wood, loc=(0.78 * math.cos(a), 0.78 * math.sin(a), 0), verts=24)
    # le verre : deux bulbes en profil tourné (lathe)
    prof = [(0.05, 0), (0.18, 0.12), (0.55, 0.45), (0.68, 0.75), (0.62, 1.0), (0.5, 1.12)]
    me = bpy.data.meshes.new('verre'); bm = bmesh.new()
    pts = [(-x, 0, -z) for x, z in reversed(prof)][:-1] + [(x, 0, z) for x, z in prof]
    pts = [(abs(p[0]), 0, p[2]) for p in pts]
    vs = [bm.verts.new(p) for p in pts]
    for a, b in zip(vs, vs[1:]): bm.edges.new((a, b))
    bmesh.ops.spin(bm, geom=bm.verts[:] + bm.edges[:], axis=(0, 0, 1), cent=(0, 0, 0), angle=math.tau, steps=64)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.to_mesh(me); bm.free()
    g = obj_from('verre', me, glass)
    for p in g.data.polygons: p.use_smooth = True
    g.modifiers.new('epaisseur', 'SOLIDIFY').thickness = 0.02
    # le sable : un tas en bas, un reste en haut, et le filet qui coule
    bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=0.6, radius2=0.04, depth=0.5, location=(0, 0, -0.85)); bpy.context.active_object.data.materials.append(sand)
    bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=0.08, radius2=0.42, depth=0.32, location=(0, 0, 0.3)); bpy.context.active_object.data.materials.append(sand)
    cylinder('filet', 0.018, 0.8, sand, loc=(0, 0, -0.25), verts=12)
    root = [top, bot, g]
    for o in bpy.context.scene.objects:
        if o.type == 'MESH': o.rotation_euler.z += math.radians(10)
    return root

def icon_poker():                          # Poker : une pile de jetons et un jeton debout
    cols = [hexc('#1f8a4c'), hexc('#d8283b'), hexc('#1f2a44'), hexc('#1f8a4c')]
    white = mat('blanc', hexc('#f7f3ea'), rough=0.4)
    objs = []
    def chip(name, color, loc, rot=(0, 0, 0)):
        m = mat(name, color, rough=0.35, coat=0.5)
        c = cylinder(name, 0.82, 0.2, m, loc=loc, rot=rot); bevel(c, 0.03, 3)
        # six encoches blanches sur la tranche et un anneau blanc sur le dessus
        for i in range(6):
            a = i * math.tau / 6
            seg = rounded_box(f'{name}-e{i}', 0.24, 0.06, 0.205, 0.01, white,
                              loc=(0.8 * math.cos(a), 0.8 * math.sin(a), 0), rot=(0, 0, a + math.pi / 2))
            seg.parent = c
        bpy.ops.mesh.primitive_torus_add(major_radius=0.55, minor_radius=0.025, location=(0, 0, 0.1))
        ring = bpy.context.active_object; ring.data.materials.append(white); ring.scale.z = 0.25; ring.parent = c
        c.location = loc; c.rotation_euler = rot
        return c
    for i, col in enumerate(cols):
        objs.append(chip(f'jeton{i}', col, (0.0 + 0.03 * (i % 2), 0.0, -0.6 + i * 0.205), (0, 0, math.radians(i * 17))))
    objs.append(chip('debout', hexc('#d8283b'), (1.15, -0.35, -0.12), (math.radians(78), 0, math.radians(-30))))
    return objs

ICONS = {'timeline': icon_timeline, 'bataille': icon_bataille, 'sablier': icon_sablier, 'poker': icon_poker}

if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    for key in (argv or list(ICONS)):
        reset()
        objs = ICONS[key]()
        frame([o for o in bpy.context.scene.objects if o.type in ('MESH', 'FONT')])
        render(key)
