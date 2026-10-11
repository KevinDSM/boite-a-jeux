"""Naufragés en 3D : les objets de l'île, modélisés dans Blender en low-poly à facettes, exportés en GLB.
Lancement : blender -b --factory-startup -P tools/naufrages3d/assets.py -- [dossier de sortie]
Chaque objet est un fichier : ile, palmier, buche, voile, mat, poisson, jarre, feu, flamme, rocher, caisse, naufrage (personnage).
Convention : Blender a Z en haut, l'export glTF le passe en Y en haut (ce que Three.js attend). 1 unité ≈ 1 mètre."""
import bpy, bmesh, math, os, sys, random
from mathutils import Vector

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv and len(sys.argv) > sys.argv.index('--') + 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'glb')
os.makedirs(OUT, exist_ok=True)
random.seed(7)


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def mat(name, hexa, rough=0.8, metal=0.0, emit=None, strength=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    c = tuple(int(hexa[i:i + 2], 16) / 255 for i in (1, 3, 5))
    srgb = lambda v: (v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    lin = tuple(srgb(v) for v in c)
    b.inputs['Base Color'].default_value = (*lin, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*lin, 1); b.inputs['Emission Strength'].default_value = strength
    return m

def active(): return bpy.context.active_object

def give(o, m):
    o.data.materials.clear(); o.data.materials.append(m)
    for p in o.data.polygons: p.use_smooth = False          # facettes franches : le style low-poly
    return o

def jitter(o, amount, seed=0):
    """Bouscule un peu chaque sommet : rien de parfaitement régulier, comme un objet taillé à la main."""
    rnd = random.Random(seed)
    for v in o.data.vertices:
        v.co += Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * amount

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join(); o = active(); o.name = name
    return o

def export(name):
    bpy.ops.object.select_all(action='SELECT')
    for o in bpy.context.selected_objects:
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', use_selection=True,
                              export_apply=True, export_yup=True, export_materials='EXPORT')
    print('GLB :', name)


# ---------------------------------------------------------------- l'île : un dôme de sable, une bande de sable mouillé, de l'herbe
def ile():
    clear()
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1, location=(0, 0, 0))
    s = active(); s.scale = (4.2, 3.0, 0.9)
    bpy.ops.object.transform_apply(scale=True)
    for v in s.data.vertices:
        if v.co.z < 0: v.co.z *= 0.15                        # le dessous à plat, posé sur l'eau
    jitter(s, 0.12, 1)
    give(s, mat('sable', '#f2d59b', 0.95))
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=1, depth=0.25, location=(0, 0, -0.08))
    w = active(); w.scale = (4.7, 3.45, 1); bpy.ops.object.transform_apply(scale=True); jitter(w, 0.1, 2)
    give(w, mat('sable mouillé', '#d6b47a', 0.9))
    herbe = mat('herbe', '#7cb95b', 0.9)
    for i, (x, y) in enumerate([(-1.6, 0.9), (-2.2, 0.2), (1.9, 1.0), (-0.6, 1.5)]):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.45, location=(x, y, 0.62))
        t = active(); t.scale = (1.3, 1, 0.5); jitter(t, 0.06, 10 + i); give(t, herbe)
    export('ile')

# ---------------------------------------------------------------- le palmier : un tronc courbé à anneaux, des palmes qui retombent, des noix de coco
def palmier():
    clear()
    tronc = mat('tronc', '#9a6a3c', 0.9); tronc2 = mat('tronc clair', '#b98552', 0.9)
    palme = mat('palme', '#3f9b4a', 0.85); palme2 = mat('palme claire', '#5cb85a', 0.85); coco = mat('coco', '#6b4423', 0.7)
    parts = []; x = z = 0.0
    for i in range(7):
        r = 0.2 - i * 0.012
        bpy.ops.mesh.primitive_cylinder_add(vertices=7, radius=r, depth=0.5, location=(x, 0, z + 0.25))
        c = active(); c.rotation_euler = (0, math.radians(6 + i * 2.2), 0); give(c, tronc if i % 2 else tronc2); parts.append(c)
        x += 0.5 * math.sin(math.radians(6 + i * 2.2)); z += 0.47
    top = Vector((x, 0, z))
    for k in range(7):
        a = k * math.tau / 7
        bm = bmesh.new()
        L, W = 1.7, 0.42
        pts = [(0, 0, 0), (L * 0.35, W, 0.18), (L * 0.75, W * 0.55, 0.0), (L, 0, -0.55), (L * 0.75, -W * 0.55, 0.0), (L * 0.35, -W, 0.18)]
        vs = [bm.verts.new(p) for p in pts]; bm.faces.new(vs)
        bmesh.ops.triangulate(bm, faces=bm.faces)
        me = bpy.data.meshes.new('palme'); bm.to_mesh(me); bm.free()
        o = bpy.data.objects.new('palme', me); bpy.context.collection.objects.link(o)
        o.location = top; o.rotation_euler = (0, math.radians(-18), a)
        mod = o.modifiers.new('epais', 'SOLIDIFY'); mod.thickness = 0.04
        give(o, palme if k % 2 else palme2); parts.append(o)
    for k in range(3):
        a = k * math.tau / 3 + 0.4
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.13, location=(top.x + 0.17 * math.cos(a), 0.17 * math.sin(a), top.z - 0.12))
        parts.append(give(active(), coco))
    for o in parts:
        bpy.context.view_layer.objects.active = o
        for md in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)
    export('palmier')

# ---------------------------------------------------------------- une bûche (le radeau en est fait), couchée le long de X, longueur 1
def buche():
    clear()
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.11, depth=1.0, location=(0, 0, 0), rotation=(0, math.radians(90), 0))
    b = active(); jitter(b, 0.012, 3); give(b, mat('écorce', '#8a5a31', 0.9))
    for s in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.098, depth=0.02, location=(s * 0.5, 0, 0), rotation=(0, math.radians(90), 0))
        give(active(), mat('bois coupé', '#e2b67a', 0.85))
    export('buche')

# ---------------------------------------------------------------- le mât et la voile
def voile():
    clear()
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.04, depth=1.8, location=(0, 0, 0.9))
    give(active(), mat('mât', '#7a4e2b', 0.85))
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in [(0.05, 0, 0.35), (0.85, 0.15, 0.4), (0.05, 0, 1.7)]]
    bm.faces.new(vs)
    me = bpy.data.meshes.new('toile'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('toile', me); bpy.context.collection.objects.link(o)
    md = o.modifiers.new('epais', 'SOLIDIFY'); md.thickness = 0.02
    bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='epais')
    give(o, mat('toile', '#fbf3e1', 0.9))
    export('voile')

# ---------------------------------------------------------------- un poisson
def poisson():
    clear()
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.2, location=(0, 0, 0))
    c = active(); c.scale = (1.0, 0.38, 0.55); give(c, mat('écailles', '#5aa6c9', 0.4, 0.2))
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in [(-0.17, 0, 0), (-0.36, 0, 0.13), (-0.36, 0, -0.13)]]
    bm.faces.new(vs); me = bpy.data.meshes.new('queue'); bm.to_mesh(me); bm.free()
    q = bpy.data.objects.new('queue', me); bpy.context.collection.objects.link(q)
    md = q.modifiers.new('e', 'SOLIDIFY'); md.thickness = 0.03; bpy.context.view_layer.objects.active = q; bpy.ops.object.modifier_apply(modifier='e')
    give(q, mat('nageoire', '#f0a24a', 0.5))
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.025, location=(0.12, -0.065, 0.03)); give(active(), mat('œil', '#111111', 0.3))
    export('poisson')

# ---------------------------------------------------------------- une jarre d'eau en terre cuite (profil tourné)
def jarre():
    clear()
    prof = [(0.0, 0.0), (0.16, 0.0), (0.22, 0.12), (0.24, 0.26), (0.2, 0.4), (0.11, 0.48), (0.1, 0.56), (0.14, 0.6), (0.0, 0.6)]
    bm = bmesh.new(); n = 10
    rings = [[bm.verts.new((r * math.cos(k * math.tau / n), r * math.sin(k * math.tau / n), z)) for k in range(n)] for r, z in prof]
    for a, b in zip(rings, rings[1:]):
        for k in range(n):
            bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    me = bpy.data.meshes.new('jarre'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('jarre', me); bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    give(o, mat('terre cuite', '#c9693c', 0.85))
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.12, depth=0.02, location=(0, 0, 0.59)); give(active(), mat('eau', '#4fb4e0', 0.15))
    export('jarre')

# ---------------------------------------------------------------- le feu de camp : des pierres en cercle, des bûches croisées ; la flamme à part (animée)
def feu():
    clear()
    pierre = mat('pierre', '#8b8f96', 0.95); bois = mat('bois brûlé', '#5a3a22', 0.9)
    for k in range(8):
        a = k * math.tau / 8
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.11, location=(0.42 * math.cos(a), 0.42 * math.sin(a), 0.05))
        p = active(); p.scale = (1.2, 1, 0.7); jitter(p, 0.02, 20 + k); give(p, pierre)
    for k in range(3):
        a = k * math.tau / 3
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.06, depth=0.62, location=(0, 0, 0.12))
        o = active(); o.rotation_euler = (math.radians(70), 0, a); give(o, bois)
    export('feu')
    clear()
    bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=0.24, radius2=0.0, depth=0.62, location=(0, 0, 0.31))
    f = active(); jitter(f, 0.03, 5); give(f, mat('flamme', '#ff8a1f', 0.6, emit=True, strength=4.0))
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.13, radius2=0.0, depth=0.4, location=(0.02, 0.01, 0.22))
    give(active(), mat('cœur', '#ffd34d', 0.6, emit=True, strength=5.0))
    export('flamme')

# ---------------------------------------------------------------- un rocher
def rocher():
    clear()
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.5, location=(0, 0, 0.18))
    r = active(); r.scale = (1.3, 1.0, 0.7); jitter(r, 0.09, 9); give(r, mat('roche', '#8d8a86', 0.95))
    export('rocher')

# ---------------------------------------------------------------- la caisse de l'épave (on y trouve un objet)
def caisse():
    clear()
    bois = mat('planche', '#a8743f', 0.9); fonce = mat('planche foncée', '#7d5530', 0.9)
    bpy.ops.mesh.primitive_cube_add(size=0.5, location=(0, 0, 0.25)); give(active(), bois)
    for z in (0.06, 0.44):
        for s in (-1, 1):
            bpy.ops.mesh.primitive_cube_add(size=1, location=(0, s * 0.255, z)); o = active(); o.scale = (0.52, 0.02, 0.06); give(o, fonce)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.256, 0.25)); o = active(); o.scale = (0.06, 0.02, 0.5); o.rotation_euler = (0, math.radians(45), 0); give(o, fonce)
    export('caisse')

# ---------------------------------------------------------------- un naufragé : un corps en pain de sucre (la couleur du joueur), une tête, un chapeau de paille
def naufrage():
    clear()
    bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=0.26, radius2=0.17, depth=0.62, location=(0, 0, 0.31))
    give(active(), mat('Corps', '#e0533d', 0.7))                # nom repris par Three.js pour la couleur du joueur
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.19, location=(0, 0, 0.8)); give(active(), mat('peau', '#f1c49b', 0.7))
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.3, depth=0.03, location=(0, 0, 0.93)); give(active(), mat('paille', '#e8c66a', 0.9))
    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.17, radius2=0.11, depth=0.14, location=(0, 0, 1.0)); give(active(), mat('paille', '#e8c66a', 0.9))
    export('naufrage')


for f in (ile, palmier, buche, voile, poisson, jarre, feu, rocher, caisse, naufrage):
    f()
