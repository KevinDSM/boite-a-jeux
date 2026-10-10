# Suite des icônes (chargée par build_icons.py). Mêmes conventions : objets construits face à la
# caméra dans le plan XZ (face avant vers -Y), puis légèrement tournés pour montrer leur épaisseur.
import bpy, bmesh, math
from mathutils import Vector

UP = (math.radians(90), 0, 0)          # un objet plat posé debout, face à la caméra


def poly(name, pts, depth, m, bev=0.02, seg=3):
    """Une forme 2D (x, z) découpée et extrudée en épaisseur, arêtes arrondies."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new((x, -depth / 2, z)) for x, z in pts]
    f = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    moved = [v for v in ext['geom'] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=moved, vec=(0, depth, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = obj_from(name, me, m)
    if bev:
        md = o.modifiers.new('bev', 'BEVEL'); md.width = bev; md.segments = seg; md.limit_method = 'ANGLE'
    return o

def gradient_mat(name, c1, c2, rough=0.4, coat=0.3, axis='Z'):
    m = mat(name, c1, rough=rough, coat=coat); nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB'); mr = nt.nodes.new('ShaderNodeMapRange')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs[axis], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], ramp.inputs['Fac'])
    ramp.color_ramp.elements[0].color = (*c1, 1); ramp.color_ramp.elements[1].color = (*c2, 1)
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m

def panel(name, w, h, d, m, loc=(0, 0, 0), r=0.1, seg=8):
    """Une plaque arrondie debout (carte, tuile, feuille) dans le plan XZ."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object; o.name = name; o.scale = (w, d, h)
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(m)
    md = o.modifiers.new('bev', 'BEVEL'); md.width = r; md.segments = seg; md.limit_method = 'ANGLE'; md.angle_limit = math.radians(60)
    for p in o.data.polygons: p.use_smooth = True
    return o

def attach(child, parent):
    child.parent = parent; return child

def label(name, body, font, size, m, loc, parent=None, depth=0.012):
    t = text(name, body, font, size, m, loc, rot=UP, depth=depth)
    if parent: t.parent = parent
    return t

def playing_card(name, letter, suit, ink, card_m, x=0, y=0, z=0, ang=0, big=True):
    c = panel(name, 1.2, 1.7, 0.035, card_m, r=0.11)
    label(name + 'l', letter, FONT_BOLD, 0.44, ink, (-0.32, -0.024, 0.55), c)
    label(name + 's', suit, FONT_SYM, 0.32, ink, (-0.32, -0.024, 0.22), c)
    if big: label(name + 'S', suit, FONT_SYM, 1.15, ink, (0.08, -0.024, -0.22), c)
    c.location = (x, y, z); c.rotation_euler = (0, math.radians(ang), 0)
    return c

def pivot_all(x=0, z=0, y=0):
    """Accroche tout ce qui est dans la scène à un pivot commun, puis le tourne d'un bloc."""
    pv = bpy.data.objects.new('pivot', None); bpy.context.scene.collection.objects.link(pv)
    for o in list(bpy.context.scene.objects):
        if o.type in ('MESH', 'CURVE', 'FONT') and o.parent is None: o.parent = pv
    pv.rotation_euler = (math.radians(x), math.radians(y), math.radians(z))
    return pv

def tilt_all(objs, x=-8, z=0):
    for o in objs:
        if o.parent is None:
            o.rotation_euler.x += math.radians(x); o.rotation_euler.z += math.radians(z)

def sphere(name, r, m, loc=(0, 0, 0), seg=64):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=r, location=loc)
    o = bpy.context.active_object; o.name = name; o.data.materials.append(m)
    for p in o.data.polygons: p.use_smooth = True
    return o

def emissive(name, color, strength=2.0):
    m = mat(name, color, rough=0.5, emit=color)
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); b.inputs['Emission Strength'].default_value = strength
    return m

def tube(name, pts, r, m, closed=False):
    """Un trait en 3D (crayonné, aiguille fine) le long de points (x, y, z)."""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = 4
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for p, (x, y, z) in zip(sp.points, pts): p.co = (x, y, z, 1)
    sp.use_cyclic_u = closed; sp.use_smooth = True
    return obj_from(name, cu, m)


# ---------------------------------------------------------------- les jeux
def icon_eclair():                         # Éclair : un éclair doré, épais et brillant
    gold = mat('eclair', hexc('#ffe45c'), rough=0.25, coat=0.8, emit=hexc('#ffcc1a'))
    b = next(n for n in gold.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); b.inputs['Emission Strength'].default_value = 0.35
    pts = [(0.15, 1.5), (-0.75, -0.15), (-0.05, -0.15), (-0.35, -1.5), (0.75, 0.25), (0.05, 0.25), (0.45, 1.5)]
    o = poly('eclair', pts, 0.38, gold, bev=0.07, seg=5)
    o.rotation_euler = (0, 0, math.radians(-14))
    return [o]

def icon_sprint():                         # Sprint : un chronomètre
    ring = mat('boitier', hexc('#ff4f86'), rough=0.25, coat=0.8)
    face = mat('cadran', hexc('#fbfaf6'), rough=0.5)
    ink = mat('aiguille', hexc('#1c1d22'), rough=0.4)
    green = mat('vert', hexc('#20a86b'), rough=0.4)
    bpy.ops.mesh.primitive_torus_add(major_radius=1.1, minor_radius=0.2, major_segments=96, minor_segments=24, rotation=UP)
    t = bpy.context.active_object; t.data.materials.append(ring)
    for p in t.data.polygons: p.use_smooth = True
    d = cylinder('cadran', 1.0, 0.12, face, rot=UP)
    for i in range(12):
        a = i * math.tau / 12; l = 0.16 if i % 3 == 0 else 0.08
        tube(f'g{i}', [(0.85 * math.cos(a), -0.07, 0.85 * math.sin(a)), ((0.85 - l) * math.cos(a), -0.07, (0.85 - l) * math.sin(a))], 0.022, ink)
    tube('aiguille', [(0, -0.09, 0), (0.42, -0.09, 0.52)], 0.04, ink)
    # le temps écoulé : une part verte sous l'aiguille
    pts = [(0, 0)] + [(0.7 * math.cos(math.radians(a)), 0.7 * math.sin(math.radians(a))) for a in range(51, 91, 4)]
    w = poly('part', pts, 0.02, green, bev=0); w.location.y = -0.068
    cylinder('axe', 0.08, 0.2, ink, rot=UP)
    cylinder('couronne', 0.16, 0.34, ring, loc=(0, 0, 1.42)); cylinder('bouton', 0.24, 0.12, ring, loc=(0, 0, 1.62))
    return [t]

def icon_chromo():                         # Chromo : trois cartes de couleur en éventail
    white = mat('bord', hexc('#fbf8f2'), rough=0.35, coat=0.4)
    objs = []
    for k, (col, ang, x) in enumerate([('#2f6fe0', 18, -0.55), ('#f2c230', 0, 0.0), ('#e2332f', -18, 0.55)]):
        c = panel(f'carte{k}', 1.15, 1.65, 0.04, white, r=0.12)
        f = panel(f'face{k}', 0.95, 1.45, 0.03, mat(f'c{k}', hexc(col), rough=0.3, coat=0.5), r=0.09); f.location.y = -0.012; f.parent = c
        c.location = (x, -k * 0.07, -abs(k - 1) * 0.08); c.rotation_euler = (0, math.radians(ang), 0)
        objs.append(c)
    tilt_all(objs, -10)
    return objs

def icon_douze():                          # Douze : une grille de cartes chiffrées
    navy = mat('dos', hexc('#2b3550'), rough=0.4, coat=0.4)
    cols = {'-2': '#3d6be0', '7': '#f3c531', '12': '#e2333a'}
    ink = mat('chiffre', hexc('#fbf8f2'), rough=0.4)
    cells = [('-2', -0.62, 0.62), (None, 0.0, 0.62), ('7', 0.62, 0.62), (None, -0.62, -0.05), ('12', 0.0, -0.05), (None, 0.62, -0.05)]
    objs = []
    for k, (n, x, z) in enumerate(cells):
        m = mat(f'case{k}', hexc(cols[n]), rough=0.35, coat=0.5) if n else navy
        t = panel(f'case{k}', 0.54, 0.62, 0.14, m, loc=(x, 0, z), r=0.08)
        if n: label(f'n{k}', n, FONT_BOLD, 0.34 if len(n) < 2 else 0.27, ink, (x, -0.08, z), t)
        objs.append(t)
    pivot = bpy.data.objects.new('pivot', None); bpy.context.scene.collection.objects.link(pivot)
    for o in objs: o.parent = pivot
    pivot.rotation_euler = (math.radians(-12), 0, math.radians(8))
    return objs

def icon_kems():                           # Kems : un carré de rois en éventail
    card = mat('carte', hexc('#eee6d8'), rough=0.38, coat=0.35)
    ink = mat('noir', (0.015, 0.015, 0.02), rough=0.4); red = mat('rouge', hexc('#e0263a'), rough=0.35)
    objs = []
    for k, (s, m) in enumerate([('♠', ink), ('♥', red), ('♣', ink), ('♦', red)]):
        objs.append(playing_card(f'roi{k}', 'R', s, m, card, x=(k - 1.5) * 0.42, y=-k * 0.06, z=-abs(k - 1.5) * 0.12, ang=(1.5 - k) * 14))
    tilt_all(objs, -8)
    return objs

def icon_solitaire():                      # Solitaire : une colonne en escalier, as, deux, trois
    card = mat('carte', hexc('#eee6d8'), rough=0.38, coat=0.35)
    ink = mat('noir', (0.015, 0.015, 0.02), rough=0.4); red = mat('rouge', hexc('#e0263a'), rough=0.35)
    objs = []
    for k, (l, s, m) in enumerate([('A', '♠', ink), ('2', '♥', red), ('3', '♣', ink)]):
        objs.append(playing_card(f'c{k}', l, s, m, card, x=k * 0.5 - 0.5, y=-k * 0.06, z=0.35 - k * 0.42, ang=-6 + k * 6, big=(k == 2)))
    tilt_all(objs, -10)
    return objs

def icon_duel():                           # Duel des Cités : une petite cité de blocs de couleur
    cols = ['#8a5a2b', '#c9483d', '#2f9a5c', '#3a6fd0', '#f0c23c', '#8d8d93', '#8e4ec6']
    spots = [(-0.7, 0, -0.6, 0.6), (0.0, 0, -0.6, 0.6), (0.7, 0, -0.6, 0.6), (-0.35, 0, 0.02, 0.6), (0.35, 0, 0.02, 0.6), (0.0, 0, 0.64, 0.6), (0.82, 0.55, -0.6, 0.45)]
    objs = []
    for k, (x, y, z, s) in enumerate(spots):
        objs.append(rounded_box(f'bloc{k}', s, s, s, 0.06, mat(f'b{k}', hexc(cols[k]), rough=0.4, coat=0.4), loc=(x, y, z)))
    tilt_all(objs, 0, 18)
    return objs

def icon_teldes():                         # Téléphone dessiné : une feuille gribouillée et un crayon
    paper = mat('feuille', hexc('#fbf9f4'), rough=0.6); blue = mat('trait', hexc('#2f63d8'), rough=0.4)
    orange = mat('soleil', hexc('#f29a2e'), rough=0.4)
    sheet = panel('feuille', 1.7, 2.1, 0.05, paper, r=0.06)
    # un bonhomme soleil au crayon
    ring = [(0.55 * math.cos(a), -0.04, 0.3 + 0.55 * math.sin(a)) for a in [i * math.tau / 40 for i in range(41)]]
    tube('rond', ring, 0.035, orange)
    tube('sourire', [(0.3 * math.cos(a), -0.04, 0.22 + 0.3 * math.sin(a)) for a in [math.radians(200 + i * 7) for i in range(21)]], 0.03, blue)
    for ex in (-0.18, 0.18): sphere(f'oeil{ex}', 0.05, blue, loc=(ex, -0.05, 0.45))
    tube('herbe', [(-0.7, -0.04, -0.75), (-0.35, -0.04, -0.55), (0.0, -0.04, -0.78), (0.35, -0.04, -0.56), (0.7, -0.04, -0.76)], 0.03, blue)
    # le crayon, en travers
    yellow = mat('crayon', hexc('#f6c933'), rough=0.4, coat=0.4); wood = mat('bois', hexc('#e9c08a'), rough=0.6); lead = mat('mine', hexc('#2a2a2e'), rough=0.4)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.13, depth=1.7, location=(0, 0, 0)); p = bpy.context.active_object; p.data.materials.append(yellow)
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.13, radius2=0.03, depth=0.3, location=(0, 0, -1.0)); t = bpy.context.active_object; t.data.materials.append(wood); t.parent = p
    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.035, radius2=0.0, depth=0.1, location=(0, 0, -1.18)); l = bpy.context.active_object; l.data.materials.append(lead); l.parent = p
    cylinder('gomme', 0.13, 0.22, mat('gomme', hexc('#ef8aa0'), rough=0.6), loc=(0, 0, 0.96), verts=24).parent = p
    p.location = (0.75, -0.35, -0.2); p.rotation_euler = (0, math.radians(-38), 0)
    tilt_all([o for o in bpy.context.scene.objects if o.type in ('MESH', 'CURVE') and o.parent is None], -8, 6)
    return [sheet]

def icon_mirage():                         # Mirage : des cartes illustrées, comme des tableaux de rêve
    frame = mat('cadre', hexc('#fbf8f2'), rough=0.35, coat=0.4)
    arts = [('#3b2a8f', '#f08a5d'), ('#0f6b74', '#f2d36b'), ('#8e2f6b', '#ffb36b')]
    objs = []
    for k, ((a, b), ang, x) in enumerate(zip(arts, (16, 0, -16), (-0.55, 0, 0.55))):
        c = panel(f'carte{k}', 1.1, 1.6, 0.04, frame, r=0.1)
        f = panel(f'image{k}', 0.92, 1.18, 0.03, gradient_mat(f'g{k}', hexc(a), hexc(b)), r=0.06); f.location = (0, -0.012, 0.12); f.parent = c
        sphere(f'astre{k}', 0.16, emissive(f'e{k}', hexc('#fff1c9'), 1.5), loc=(0.18, -0.03, 0.42)).parent = c
        c.location = (x, -k * 0.07, -abs(k - 1) * 0.08); c.rotation_euler = (0, math.radians(ang), 0)
        objs.append(c)
    tilt_all(objs, -10)
    return objs

def icon_memes():                          # Mème pas vrai : un visage qui pleure de rire
    yellow = mat('visage', hexc('#ffcd3c'), rough=0.35, coat=0.6)
    dark = mat('trait', hexc('#5b3a12'), rough=0.4); tear = mat('larme', hexc('#5ab7ff'), rough=0.1, coat=1.0)
    mouth = mat('bouche', hexc('#4a1d10'), rough=0.5); tongue = mat('langue', hexc('#ff6b6b'), rough=0.5)
    f = sphere('visage', 1.2, yellow)
    for s in (-1, 1):   # yeux fermés en arc, larmes
        tube(f'oeil{s}', [(s * 0.42 + 0.22 * math.cos(math.radians(a)), -1.08, 0.38 + 0.16 * math.sin(math.radians(a))) for a in range(20, 161, 10)], 0.06, dark)
        sphere(f'larme{s}', 0.17, tear, loc=(s * 0.98, -0.62, 0.15)).scale = (0.8, 0.8, 1.15)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=0.55, location=(0, -0.98, -0.34))
    mth = bpy.context.active_object; mth.scale = (1.15, 0.5, 0.62); mth.data.materials.append(mouth)
    sphere('langue', 0.26, tongue, loc=(0, -1.16, -0.55)).scale = (1.1, 0.5, 0.55)
    pivot_all(z=-12)
    return [f]

def icon_limite():                         # Hors Limite : la carte noire et une carte blanche
    black = mat('noire', hexc('#202027'), rough=0.25, coat=0.9); white = mat('blanche', hexc('#f4f1ea'), rough=0.35, coat=0.4)
    wink = mat('texte-b', hexc('#f4f1ea'), rough=0.4); ink = mat('texte-n', hexc('#17171b'), rough=0.4)
    b = panel('noire', 1.2, 1.7, 0.04, black, r=0.1)
    for i, w in enumerate([0.8, 0.6, 0.8]):
        panel(f'ln{i}', w, 0.07, 0.02, wink, loc=(-0.12 + (0.8 - w) / 2 - 0.0, -0.025, 0.55 - i * 0.22), r=0.03).parent = b
    panel('trou', 0.5, 0.05, 0.02, mat('jaune', hexc('#ffd23c'), rough=0.3), loc=(0.0, -0.025, -0.05), r=0.02).parent = b
    w_ = panel('blanche', 1.2, 1.7, 0.04, white, r=0.1)
    for i, w in enumerate([0.75, 0.55]):
        panel(f'lb{i}', w, 0.07, 0.02, ink, loc=(-0.1 - (0.75 - w) / 2, -0.025, 0.5 - i * 0.22), r=0.03).parent = w_
    b.location = (-0.38, 0.05, 0.1); b.rotation_euler = (0, math.radians(10), 0)
    w_.location = (0.42, -0.06, -0.1); w_.rotation_euler = (0, math.radians(-9), 0)
    tilt_all([b, w_], -8)
    return [b, w_]

def icon_nomcode():                        # Nom de code : la grille des agents, rouges, bleus, un assassin
    cols = ['#d9473b', '#e9dfcf', '#3967d6', '#3967d6', '#d9473b', '#e9dfcf', '#1b1b20', '#d9473b', '#3967d6']
    objs = []
    for k, c in enumerate(cols):
        x, z = (k % 3 - 1) * 0.72, (1 - k // 3) * 0.72
        objs.append(panel(f't{k}', 0.62, 0.62, 0.16, mat(f'm{k}', hexc(c), rough=0.35, coat=0.5), loc=(x, 0, z), r=0.09))
    tilt_all(objs, -18, 10)
    return objs

def icon_diapason():                       # Diapason : un cadran en demi-cercle, ses bandes et l'aiguille
    bands = ['#3a6fd0', '#2fb3a0', '#f2c230', '#f08a2e', '#e2333a']
    base = mat('socle', hexc('#fbf8f2'), rough=0.4, coat=0.4)
    objs = [poly('socle', [(1.5 * math.cos(math.radians(a)), 1.5 * math.sin(math.radians(a))) for a in range(0, 181, 6)], 0.22, base, bev=0.05)]
    for i, c in enumerate(bands):
        a0, a1 = 18 + i * 29, 18 + (i + 1) * 29
        pts = [(0.35 * math.cos(math.radians(a)), 0.35 * math.sin(math.radians(a))) for a in range(a0, a1 + 1, 3)]
        pts += [(1.3 * math.cos(math.radians(a)), 1.3 * math.sin(math.radians(a))) for a in range(a1, a0 - 1, -3)]
        w = poly(f'bande{i}', pts, 0.05, mat(f'b{i}', hexc(c), rough=0.35, coat=0.5), bev=0.01); w.location.y = -0.12
    needle = mat('aiguille', hexc('#c62436'), rough=0.3, coat=0.6)
    tube('aiguille', [(0, -0.2, 0.05), (-0.62, -0.2, 1.05)], 0.06, needle)
    cylinder('pivot', 0.17, 0.32, mat('pivot', hexc('#2a2a30'), rough=0.3, coat=0.6), rot=UP)
    for o in bpy.context.scene.objects:
        if o.type in ('MESH', 'CURVE'): o.location.z -= 0.55
    tilt_all([o for o in bpy.context.scene.objects if o.type in ('MESH', 'CURVE')], -14)
    return objs

def icon_petitbac():                       # Petit Brevet : un bloc-notes, une lettre et un crayon
    paper = mat('feuille', hexc('#fbf9f4'), rough=0.6); line = mat('ligne', hexc('#9dbbe8'), rough=0.6)
    blue = mat('lettre', hexc('#2f63d8'), rough=0.35); red = mat('marge', hexc('#e5675e'), rough=0.6)
    pad = panel('bloc', 1.6, 2.1, 0.12, paper, r=0.06)
    for i in range(6): panel(f'l{i}', 1.35, 0.025, 0.01, line, loc=(0.0, -0.065, 0.45 - i * 0.24), r=0.005).parent = pad
    panel('marge', 0.025, 1.9, 0.01, red, loc=(-0.48, -0.066, 0), r=0.005).parent = pad
    for i in range(5): cylinder(f'spirale{i}', 0.06, 0.18, mat(f'sp{i}', hexc('#9aa0a8'), rough=0.2, metal=1.0), loc=(-0.55 + i * 0.28, 0, 1.06), rot=(0, math.radians(90), 0), verts=24)
    label('B', 'B', FONT_BOLD, 0.95, blue, (0.15, -0.07, 0.02), pad, depth=0.03)
    yellow = mat('crayon', hexc('#f6c933'), rough=0.4, coat=0.4); wood = mat('bois', hexc('#e9c08a'), rough=0.6)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.12, depth=1.6); p = bpy.context.active_object; p.data.materials.append(yellow)
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.12, radius2=0.025, depth=0.28, location=(0, 0, -0.94)); t = bpy.context.active_object; t.data.materials.append(wood); t.parent = p
    p.location = (0.85, -0.3, -0.3); p.rotation_euler = (0, math.radians(-32), 0)
    tilt_all([pad, p], -8, 6)
    return [pad]

def icon_geo():                            # Boussole : une boussole, l'aiguille vers le nord
    brass = mat('laiton', hexc('#d8a64a'), rough=0.25, metal=1.0); face = mat('cadran', hexc('#f7f4ec'), rough=0.5)
    red = mat('nord', hexc('#e2333a'), rough=0.3, coat=0.6); white = mat('sud', hexc('#e9e6e0'), rough=0.3, coat=0.6)
    ink = mat('repere', hexc('#2b3550'), rough=0.4)
    bpy.ops.mesh.primitive_torus_add(major_radius=1.2, minor_radius=0.16, major_segments=96, minor_segments=20); r = bpy.context.active_object; r.data.materials.append(brass)
    for p in r.data.polygons: p.use_smooth = True
    cylinder('fond', 1.25, 0.12, brass, loc=(0, 0, -0.08)); cylinder('cadran', 1.08, 0.06, face, loc=(0, 0, 0.0))
    for i in range(4):
        a = i * math.tau / 4; tube(f'r{i}', [(0.92 * math.cos(a), 0.92 * math.sin(a), 0.05), (0.72 * math.cos(a), 0.72 * math.sin(a), 0.05)], 0.03, ink)
    n = poly('nord', [(0, 0.9), (-0.24, 0), (0.24, 0)], 0.08, red, bev=0.01); n.rotation_euler = (math.radians(90), 0, math.radians(-30)); n.location.z = 0.1
    s = poly('sud', [(0, -0.9), (0.24, 0), (-0.24, 0)], 0.08, white, bev=0.01); s.rotation_euler = (math.radians(90), 0, math.radians(-30)); s.location.z = 0.1
    cylinder('axe', 0.07, 0.12, brass, loc=(0, 0, 0.16))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.2, minor_radius=0.05, location=(0, 1.42, 0), rotation=(0, math.radians(90), 0)); a = bpy.context.active_object; a.data.materials.append(brass)
    for o in bpy.context.scene.objects:
        if o.type in ('MESH', 'CURVE'): o.rotation_euler.x += math.radians(58)
    return [r]

def icon_undercover():                     # Undercover : un dossier « top secret »
    kraft = mat('kraft', hexc('#e3c48f'), rough=0.6); kraft2 = mat('kraft2', hexc('#d5b27a'), rough=0.6)
    red = mat('tampon', hexc('#d6343a'), rough=0.5)
    back = poly('dos', [(-1.0, -0.75), (1.0, -0.75), (1.0, 0.75), (-0.1, 0.75), (-0.25, 0.95), (-0.95, 0.95), (-1.0, 0.85)], 0.05, kraft2, bev=0.03)
    front = panel('devant', 2.0, 1.45, 0.05, kraft, loc=(0, -0.08, -0.06), r=0.05)
    label('top', 'TOP', FONT_BOLD, 0.4, red, (0.0, -0.11, 0.05), front, depth=0.02)
    label('secret', 'SECRET', FONT_BOLD, 0.25, red, (0.0, -0.11, -0.3), front, depth=0.02)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.62, minor_radius=0.03, major_segments=64, location=(0, -0.11, -0.08), rotation=UP)
    st = bpy.context.active_object; st.scale = (1.0, 1.0, 0.58); st.data.materials.append(red); st.parent = front
    tilt_all([back, front], -8, 10)
    return [back, front]

def icon_loupgarou():                      # Loup-Garou : un croissant de lune et un loup qui hurle devant
    moon = emissive('lune', hexc('#fff2c4'), 1.3)
    R, r, cx, cz = 1.15, 0.98, 0.5, 0.25           # le croissant : un disque mordu par un autre
    out = [math.radians(a) for a in range(0, 360, 3)]
    outer = [(R * math.cos(a), R * math.sin(a)) for a in out if (R * math.cos(a) - cx) ** 2 + (R * math.sin(a) - cz) ** 2 > r * r]
    inner = [(cx + r * math.cos(a), cz + r * math.sin(a)) for a in out if (cx + r * math.cos(a)) ** 2 + (cz + r * math.sin(a)) ** 2 < R * R]
    import cmath
    ang = lambda p, c=(0, 0): math.atan2(p[1] - c[1], p[0] - c[0])
    k0 = max(range(len(outer)), key=lambda i: (ang(outer[i]) - ang(outer[i - 1])) % math.tau)   # le point juste après le trou
    outer = outer[k0:] + outer[:k0]
    inner.sort(key=lambda p: (ang(p, (cx, cz)) - ang(outer[-1], (cx, cz))) % math.tau)
    m = poly('lune', outer + inner[::-1], 0.3, moon, bev=0.05, seg=4)
    m.location = (0.2, 0.3, 0.45)
    wolf = mat('loup', hexc('#0f1328'), rough=0.5)
    pts = [(-1.3, -1.25), (-1.3, -0.35), (-1.05, -0.05), (-0.95, 0.35), (-0.78, 0.7), (-0.62, 0.42), (-0.5, 0.3), (-0.2, 0.62),
           (-0.12, 0.32), (0.05, 0.25), (0.2, 0.05), (0.08, -0.08), (-0.25, -0.1), (-0.1, -0.35), (0.05, -1.25)]
    w = poly('loup', pts, 0.3, wolf, bev=0.04); w.location = (-0.05, -0.45, -0.1)
    for i, (x, z) in enumerate([(-1.0, 1.25), (1.45, 1.3), (1.35, -0.55), (-1.45, 0.65), (0.75, -1.0)]):
        sphere(f'etoile{i}', 0.07, emissive(f'e{i}', (1, 1, 0.95), 5.0), loc=(x, 0.2, z), seg=16)
    return [m, w]

def icon_naufrages():                      # Naufragés : un radeau à voile sur une mer en pastille
    sea = mat('mer', hexc('#2bb0d6'), rough=0.15, coat=0.8); wood = mat('bois', hexc('#b07a3e'), rough=0.6)
    sail = mat('voile', hexc('#fbf6ea'), rough=0.6); rope = mat('corde', hexc('#e3c48f'), rough=0.7)
    water = cylinder('mer', 1.45, 0.25, sea, loc=(0, 0, -0.35)); bevel(water, 0.08, 4)
    for i in range(5): cylinder(f'rondin{i}', 0.12, 1.5, wood, loc=(-0.48 + i * 0.24, 0, -0.08), rot=(math.radians(90), 0, 0), verts=24)
    cylinder('mat', 0.05, 1.6, wood, loc=(0.0, 0.0, 0.75), verts=16)
    s = poly('voile', [(0.05, 0.25), (0.85, 0.25), (0.05, 1.5)], 0.03, sail, bev=0.01); s.rotation_euler.z = math.radians(-35); s.location.z = 0.0
    for y in (-0.5, 0.5): cylinder(f'lien{y}', 0.13, 0.08, rope, loc=(0, y, -0.08), rot=(0, math.radians(90), 0), verts=24).scale = (1, 1, 7.5)
    for o in bpy.context.scene.objects:
        if o.type in ('MESH',): o.rotation_euler.x += math.radians(18)
    return [water]

# ---------------------------------------------------------------- les à-côtés
def icon_miroir():                         # Miroir : un miroir à main, cadre argenté
    frame = mat('cadre', hexc('#f0c35a'), rough=0.28, metal=1.0)
    glass = gradient_mat('miroir', hexc('#1f5fb8'), hexc('#7fc0ff'), rough=0.05, coat=1.0)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.85, minor_radius=0.12, major_segments=96, minor_segments=20, rotation=UP)
    r = bpy.context.active_object; r.scale = (1.0, 1.0, 1.22); r.data.materials.append(frame); r.location.z = 0.45
    for p in r.data.polygons: p.use_smooth = True
    g = cylinder('glace', 0.82, 0.05, glass, loc=(0, 0, 0.45), rot=UP); g.scale = (1, 1.22, 1)
    h = cylinder('manche', 0.15, 0.85, frame, loc=(0, 0, -0.85), verts=32); bevel(h, 0.04)
    sphere('bout', 0.19, frame, loc=(0, 0, -1.3))
    shine = emissive('reflet', (1, 1, 1), 1.6)
    for dx, w in ((-0.18, 0.16), (0.12, 0.07)):          # deux reflets en biais : ça brille, c'est un miroir
        st = panel(f'reflet{dx}', w, 0.95 if w > 0.1 else 0.7, 0.01, shine, loc=(dx, -0.08, 0.5), r=w / 2.2)
        st.rotation_euler.y = math.radians(-35)
    pivot_all(z=-16)
    return [r, h]

def icon_regles():                         # Les règles : un livre fermé et son signet
    cover = mat('couverture', hexc('#c9483d'), rough=0.45, coat=0.5); pages = mat('pages', hexc('#f6f0e2'), rough=0.7)
    gold = mat('or', hexc('#e8b64c'), rough=0.3, metal=1.0)
    book = rounded_box('livre', 1.5, 0.42, 1.95, 0.05, cover, loc=(0, 0, 0))
    rounded_box('pages', 1.38, 0.34, 1.86, 0.02, pages, loc=(0.08, 0, 0))
    panel('titre', 0.9, 0.08, 0.02, gold, loc=(0.0, -0.22, 0.5), r=0.03)
    panel('titre2', 0.6, 0.06, 0.02, gold, loc=(0.0, -0.22, 0.32), r=0.03)
    panel('signet', 0.14, 0.6, 0.02, mat('signet', hexc('#f2c230'), rough=0.5), loc=(0.35, -0.12, -1.15), r=0.02)
    pivot_all(x=-6, z=-24)
    return [book]

def icon_solo():                           # Jouer seul : une tête de robot
    shell = mat('coque', hexc('#e9edf3'), rough=0.3, coat=0.6); eye = emissive('yeux', hexc('#45e0ff'), 2.5)
    dark = mat('visiere', hexc('#1d2433'), rough=0.2, coat=0.8); red = emissive('voyant', hexc('#ff5a6a'), 2.0)
    head = rounded_box('tete', 1.9, 1.5, 1.5, 0.32, shell)
    panel('visiere', 1.5, 0.75, 0.06, dark, loc=(0, -0.76, 0.05), r=0.18)
    for x in (-0.38, 0.38): sphere(f'oeil{x}', 0.15, eye, loc=(x, -0.8, 0.1), seg=32).scale = (1, 0.5, 1)
    cylinder('antenne', 0.05, 0.5, shell, loc=(0, 0, 1.0), verts=16); sphere('boule', 0.13, red, loc=(0, 0, 1.3), seg=32)
    for x in (-1.0, 1.0): cylinder(f'oreille{x}', 0.22, 0.2, shell, loc=(x, 0, 0), rot=(0, math.radians(90), 0))
    pivot_all(z=-18)
    return [head]

MORE = {
    'eclair': icon_eclair, 'sprint': icon_sprint, 'chromo': icon_chromo, 'douze': icon_douze, 'kems': icon_kems,
    'solitaire': icon_solitaire, 'duel': icon_duel, 'teldes': icon_teldes, 'mirage': icon_mirage, 'memes': icon_memes,
    'limite': icon_limite, 'nomcode': icon_nomcode, 'diapason': icon_diapason, 'petitbac': icon_petitbac, 'geo': icon_geo,
    'undercover': icon_undercover, 'loupgarou': icon_loupgarou, 'naufrages': icon_naufrages,
    'miroir': icon_miroir, 'regles': icon_regles, 'solo': icon_solo,
}
