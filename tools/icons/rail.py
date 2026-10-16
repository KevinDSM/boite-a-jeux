"""Grandes Lignes : les objets 3D, rendus dans Blender (mêmes outils que build_icons.py).
  plateau : la carte de France en relief, vue de dessus (caméra orthographique calée sur la viewBox de tools/rail/carte.json)
  wagons  : les huit wagons des cartes et la locomotive (le joker), de trois quarts, sur un bout de voie
  pieces  : les petits wagons en plastique des joueurs, vus de dessus (posés sur les lignes prises)
Lancement :  blender -b --factory-startup -P tools/icons/rail.py -- [plateau wagons pieces]   (ICON_PREVIEW=1 = aperçu)
Puis :       python tools/icons/export_rail.py
Les rendus bruts (PNG) vont dans tools/icons/rail/."""
import bpy, bmesh, os, sys, math, json
import numpy as np
from mathutils import Vector, noise
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
OUTD = os.path.join(HERE, 'rail'); os.makedirs(OUTD, exist_ok=True)
ns = {'__name__': 'outils_icones', '__file__': os.path.join(HERE, 'build_icons.py')}
exec(open(os.path.join(HERE, 'build_icons.py'), encoding='utf-8').read(), ns)
globals().update({k: v for k, v in ns.items() if not k.startswith('__')})
CARTE = json.load(open(os.path.join(ROOT, 'tools', 'rail', 'carte.json'), encoding='utf-8'))
R90 = math.radians(90)


def shoot(name, w, h):
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.filepath = os.path.join(OUTD, name + '.png')
    bpy.ops.render.render(write_still=True)
    print('rendu :', name)


def node(m, kind, **kw):
    n = m.node_tree.nodes.new(kind)
    for k, v in kw.items(): setattr(n, k, v)
    return n

def bump(m, tex='noise', scale=40.0, strength=0.2, **kw):
    """Un relief fin dans la matière (bruit, ondulations de tôle, veines du bois)."""
    nt = m.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    if tex == 'wave':
        t = node(m, 'ShaderNodeTexWave'); t.inputs['Scale'].default_value = scale
        for k, v in kw.items(): setattr(t, k, v)
    else:
        t = node(m, 'ShaderNodeTexNoise'); t.inputs['Scale'].default_value = scale; t.inputs['Detail'].default_value = 6
    bp = node(m, 'ShaderNodeBump'); bp.inputs['Strength'].default_value = strength
    nt.links.new(t.outputs[1 if tex != 'wave' else 1], bp.inputs['Height'])
    nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m


# ================================================================ le plateau
def P(lon, lat):
    return ((lon + 5.2) * math.cos(math.radians(46.4)) * 100, (51.3 - lat) * 100)

FR = [tuple(p) for p in CARTE['france']]
CO = [tuple(p) for p in CARTE['corse']]
def idx(lon, lat):
    t = P(lon, lat); return min(range(len(FR)), key=lambda i: (FR[i][0] - t[0]) ** 2 + (FR[i][1] - t[1]) ** 2)
# la mer : Manche + Atlantique (côte de France de Dunkerque à Hendaye, puis l'Espagne, l'Angleterre) ; Méditerranée
ATL = FR[:idx(-1.78, 43.37) + 1] + [P(*p) for p in [(-2.5, 43.35), (-3.8, 43.45), (-5.0, 43.55), (-7, 43.6), (-7, 49.8), (-5.7, 50.06), (-5.2, 49.96),
      (-4.2, 50.35), (-3.64, 50.22), (-3.4, 50.6), (-2.45, 50.55), (-1.3, 50.65), (-0.14, 50.82), (0.6, 50.85), (1.0, 51.0), (1.38, 51.15),
      (1.45, 51.38), (1.4, 52.5), (3.6, 52.5), (3.3, 51.36), (2.55, 51.09)]]
MED = FR[idx(3.17, 42.44):idx(7.5, 43.78) + 1] + [P(*p) for p in [(7.75, 43.8), (8.2, 43.9), (8.5, 44.3), (8.9, 44.42), (9.5, 44.1), (11, 44.0),
      (11, 40.0), (2.0, 40.0), (2.2, 41.4), (3.2, 41.9), (3.3, 42.32)]]
LEMAN = [P(*p) for p in [(6.15, 46.3), (6.5, 46.46), (6.85, 46.46), (6.92, 46.39), (6.6, 46.37), (6.3, 46.24)]]
# les reliefs : (ligne de crête en lon/lat, hauteur relative, largeur en unités de carte)
MONTS = [
  ([(7.5, 43.95), (6.9, 44.4), (6.7, 44.9), (6.75, 45.3), (6.95, 45.85), (7.3, 46.15), (8.3, 46.45), (10, 46.6)], 1.0, 42),
  ([(5.45, 44.6), (5.7, 45.15), (5.95, 45.6), (6.35, 46.05)], 0.5, 24),
  ([(-1.7, 43.1), (-0.5, 42.85), (0.6, 42.7), (1.5, 42.6), (2.5, 42.45), (3.1, 42.45)], 0.9, 30),
  ([(2.6, 44.5), (2.85, 45.1), (2.85, 45.7)], 0.48, 58), ([(3.6, 44.1), (4.2, 44.6)], 0.42, 26),
  ([(5.7, 46.2), (6.2, 46.7), (6.9, 47.3)], 0.38, 18), ([(6.9, 47.8), (7.1, 48.3), (7.3, 48.75)], 0.4, 18),
  ([(9.1, 42.8), (9.0, 42.3), (9.1, 41.6)], 0.62, 18), ([(8.1, 47.7), (8.3, 48.6)], 0.3, 15),
  ([(-4.3, 48.3), (-2.6, 48.3)], 0.12, 30), ([(-7, 43.1), (-2.5, 43.0)], 0.6, 32), ([(8.4, 44.35), (11, 44.2)], 0.5, 22),
  ([(4.6, 49.9), (6.2, 50.1), (6.5, 49.7)], 0.16, 40),
]

# les grands fleuves (lon, lat), de l'embouchure vers l'amont, avec leur largeur en unités de carte
FLEUVES = [
  ([(0.1, 49.47), (0.6, 49.42), (1.1, 49.4), (1.6, 49.1), (2.0, 48.95), (2.35, 48.85), (2.9, 48.5), (3.5, 48.45), (4.07, 48.3), (4.6, 47.8)], 3.0),
  ([(-2.2, 47.28), (-1.55, 47.2), (-0.55, 47.38), (0.69, 47.37), (1.33, 47.57), (1.9, 47.88), (2.5, 47.55), (3.16, 46.99), (3.6, 46.6), (3.95, 46.25), (4.0, 45.6), (4.2, 44.9)], 3.0),
  ([(4.65, 43.42), (4.63, 43.68), (4.81, 43.95), (4.74, 44.4), (4.87, 44.93), (4.8, 45.4), (4.83, 45.74), (5.4, 45.8), (5.8, 45.92), (6.14, 46.2)], 3.4),
  ([(4.83, 45.76), (4.83, 46.3), (4.86, 46.78), (5.2, 47.25), (5.9, 47.85)], 2.4),
  ([(-1.05, 45.6), (-0.75, 45.2), (-0.56, 44.84), (0.0, 44.45), (0.62, 44.2), (1.1, 43.95), (1.44, 43.6), (1.0, 43.2), (0.65, 42.85)], 3.0),
  ([(-0.45, 45.0), (0.2, 44.85), (0.7, 44.85), (1.5, 44.95), (2.3, 45.35)], 2.2),
  ([(6.35, 49.47), (6.18, 49.12), (6.15, 48.7), (6.5, 48.25), (6.85, 47.9)], 2.2),
  ([(2.4, 48.82), (3.0, 48.95), (3.6, 49.02), (4.36, 48.96), (4.9, 48.6), (5.2, 48.2)], 2.0),
  ([(7.58, 47.58), (7.56, 47.9), (7.66, 48.3), (7.82, 48.62), (8.05, 48.82), (8.23, 48.97), (8.4, 49.3), (8.5, 49.8)], 3.0),
]

def pip(px, py, poly):
    inside = np.zeros(px.shape, bool); n = len(poly)
    for i in range(n):
        (xi, yi), (xj, yj) = poly[i], poly[i - 1]
        c = ((yi > py) != (yj > py)) & (px < (xj - xi) * (py - yi) / ((yj - yi) or 1e-9) + xi)
        inside ^= c
    return inside

def blur(a, r, passes=3):
    for _ in range(passes):
        for ax in (0, 1):
            pad = [(0, 0), (0, 0)]; pad[ax] = (r + 1, r); n = a.shape[ax]
            c = np.cumsum(np.pad(a, pad, mode='edge'), axis=ax)
            a = (np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=ax) - np.take(c, np.arange(n), axis=ax)) / (2 * r + 1)
    return a

def seg_dist(px, py, pts):
    d = np.full(px.shape, 1e9)
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        vx, vy = bx - ax, by - ay; L2 = vx * vx + vy * vy
        t = np.clip(((px - ax) * vx + (py - ay) * vy) / L2, 0, 1)
        d = np.minimum(d, np.hypot(px - ax - t * vx, py - ay - t * vy))
    return d

def lerp_col(stops, t):
    """stops : [(t, (r, g, b))], t : tableau → couleurs (n, 3)."""
    ts = np.array([s[0] for s in stops]); cs = np.array([s[1] for s in stops])
    return np.stack([np.interp(t, ts, cs[:, k]) for k in range(3)], -1)

def plateau():
    reset()
    sc = bpy.context.scene
    for o in list(sc.objects):
        if o.type == 'LIGHT': bpy.data.objects.remove(o)
    W, H = CARTE['vb']; step = 4.0 if PREVIEW else 1.6
    nx, ny = int(W / step) + 1, int(H / step) + 1
    xs, ys = np.linspace(0, W, nx), np.linspace(0, H, ny)
    gx, gy = np.meshgrid(xs, ys)                                   # (ny, nx), en unités de carte (y vers le bas)
    sea = (pip(gx, gy, ATL) | pip(gx, gy, MED) | pip(gx, gy, LEMAN)) & ~pip(gx, gy, CO)
    fr = pip(gx, gy, FR) | pip(gx, gy, CO)
    land = (~sea).astype(float); frf = fr.astype(float)
    r = max(1, int(2.4 / step))
    land_s = blur(land, r); fr_s = blur(frf, max(1, int(2.5 / step)))
    coast_far = blur(land, int(26 / step), 2)                    # pour éclaircir l'eau près des côtes
    # le relief
    rel = np.zeros_like(gx)
    for pts, h, w in MONTS:
        rel += h * np.exp(-(seg_dist(gx, gy, [P(*p) for p in pts]) / w) ** 2)
    nz = np.zeros_like(gx); grain = np.zeros_like(gx)
    for j in range(ny):
        for i in range(nx):
            v = Vector((gx[j, i] / 38, gy[j, i] / 38, 0.3))
            nz[j, i] = noise.ridged_multi_fractal(v, 0.9, 2.1, 5, 1.0, 2.0)
            grain[j, i] = noise.noise(Vector((gx[j, i] / 22, gy[j, i] / 22, 1.7))) * 0.7 + noise.noise(Vector((gx[j, i] / 7, gy[j, i] / 7, 4.1))) * 0.3
    nz = (nz - nz.min()) / (nz.max() - nz.min() + 1e-9)
    relief = np.clip(rel, 0, 1.2) * (0.35 + 0.65 * nz) + 0.022 * (grain * 0.5 + 0.5) * land_s
    relief *= land_s
    riv = np.zeros_like(gx)
    for pts, w in FLEUVES:
        riv = np.maximum(riv, np.exp(-(seg_dist(gx, gy, [P(*p) for p in pts]) / (w * 0.5)) ** 2))
    riv *= np.clip((land_s - 0.6) / 0.3, 0, 1)
    relief = relief * (1 - 0.6 * riv)
    Z = 0.0 + land_s * 0.02 + fr_s * 0.014 + relief * 0.3 - riv * 0.012       # en mètres Blender (1 = 100 unités de carte)
    # les couleurs : la France en sauge et ocre, les voisins en gris tendre, la mer bleu canard
    sea_t = np.clip(coast_far * 1.8, 0, 1)
    c_sea = lerp_col([(0, hexc('#16394b')), (0.45, hexc('#1d5266')), (1, hexc('#3d8290'))], sea_t)
    iso = sum(np.exp(-((sea_t - k) / 0.012) ** 2) for k in (0.18, 0.4, 0.66))      # courbes de profondeur
    c_sea = c_sea + (np.array(hexc('#7fb3bb')) - c_sea) * (0.22 * iso)[..., None]
    foam = np.exp(-((land_s - 0.3) / 0.07) ** 2)                                    # l'écume au ras des côtes
    c_sea = c_sea + (np.array(hexc('#d9ebe8')) - c_sea) * (0.55 * foam)[..., None]
    hgt = np.clip(relief / 0.9, 0, 1)
    c_fr = lerp_col([(0, hexc('#9aac6c')), (0.16, hexc('#a5ad72')), (0.36, hexc('#c4b483')), (0.6, hexc('#a89679')), (0.82, hexc('#8f8476')), (0.95, hexc('#e9e6df')), (1, hexc('#f7f6f2'))], hgt)
    forest = np.clip((grain - 0.05) * 2.6, 0, 1)[..., None] * np.clip(1 - hgt / 0.5, 0, 1)[..., None]
    c_fr = c_fr * (1 - 0.26 * forest) + np.array(hexc('#6a8a4c')) * 0.26 * forest
    c_fr = c_fr * (1 - 0.85 * riv[..., None]) + np.array(hexc('#3f7f93')) * 0.85 * riv[..., None]
    beach = np.clip(1 - np.abs(land_s - 0.62) / 0.16, 0, 1)[..., None] * fr_s[..., None]
    c_fr = c_fr * (1 - 0.55 * beach) + np.array(hexc('#ddd2a6')) * 0.55 * beach
    c_nb = lerp_col([(0, hexc('#6d7366')), (0.5, hexc('#7b7c70')), (0.85, hexc('#8f8d86')), (1, hexc('#cfcec9'))], hgt)
    c_land = c_nb * (1 - fr_s[..., None]) + c_fr * fr_s[..., None]
    lt = np.clip((land_s - 0.35) / 0.3, 0, 1)[..., None]
    col = c_sea * (1 - lt) + c_land * lt
    rough = 0.22 * (1 - lt[..., 0]) + 0.8 * lt[..., 0] - 0.5 * riv
    # le maillage
    verts = np.stack([gx.ravel() / 100, -gy.ravel() / 100, Z.ravel()], -1)
    me = bpy.data.meshes.new('plateau')
    ii = np.arange(nx * ny).reshape(ny, nx)
    q = np.stack([ii[:-1, :-1].ravel(), ii[1:, :-1].ravel(), ii[1:, 1:].ravel(), ii[:-1, 1:].ravel()], -1)
    me.vertices.add(len(verts)); me.vertices.foreach_set('co', verts.ravel())
    me.loops.add(q.size); me.loops.foreach_set('vertex_index', q.ravel())
    me.polygons.add(len(q)); me.polygons.foreach_set('loop_start', np.arange(0, q.size, 4));
    me.update(calc_edges=True)
    me.polygons.foreach_set('use_smooth', np.ones(len(q), bool))
    ca = me.color_attributes.new('col', 'FLOAT_COLOR', 'POINT')
    ca.data.foreach_set('color', np.concatenate([col.reshape(-1, 3), np.ones((nx * ny, 1))], -1).ravel())
    ra = me.attributes.new('rgh', 'FLOAT', 'POINT'); ra.data.foreach_set('value', rough.ravel())
    ob = bpy.data.objects.new('plateau', me); sc.collection.objects.link(ob)
    m = mat('carte', (1, 1, 1), rough=0.7)
    nt = m.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    a1 = node(m, 'ShaderNodeAttribute', attribute_name='col'); a2 = node(m, 'ShaderNodeAttribute', attribute_name='rgh')
    nt.links.new(a1.outputs['Color'], b.inputs['Base Color']); nt.links.new(a2.outputs['Fac'], b.inputs['Roughness'])
    bump(m, 'noise', scale=180.0, strength=0.06)
    me.materials.append(m)
    # la lumière : un soleil bas au nord-ouest (le relief s'ombre vers le sud-est), un ciel doux
    sun = bpy.data.objects.new('soleil', bpy.data.lights.new('soleil', 'SUN')); sc.collection.objects.link(sun)
    sun.data.energy = 5.0; sun.data.angle = math.radians(4); sun.data.color = (1, 0.96, 0.9)
    sun.rotation_euler = Vector((-0.55, 0.6, 0.62)).to_track_quat('Z', 'Y').to_euler()  # +Z vers la lumière : nord-ouest, assez bas
    bg = next(n for n in sc.world.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs[0].default_value = (0.75, 0.82, 0.92, 1); bg.inputs[1].default_value = 0.28
    cam = sc.camera; cam.data.type = 'ORTHO'; cam.data.ortho_scale = W / 100
    cam.location = (W / 200, -H / 200, 6); cam.rotation_euler = (0, 0, 0)
    sc.render.film_transparent = False
    sc.cycles.samples = 16 if PREVIEW else 96
    shoot('plateau', int(W * (0.5 if PREVIEW else 2)), int(H * (0.5 if PREVIEW else 2)))


# ================================================================ les wagons
def wood(name, c1='#6b4a2f', c2='#8a6440'):
    m = mat(name, hexc(c1), rough=0.75)
    nt = m.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    t = node(m, 'ShaderNodeTexNoise'); t.inputs['Scale'].default_value = 14; t.inputs['Detail'].default_value = 8
    rmp = node(m, 'ShaderNodeValToRGB'); rmp.color_ramp.elements[0].color = (*hexc(c1), 1); rmp.color_ramp.elements[1].color = (*hexc(c2), 1)
    nt.links.new(t.outputs[0], rmp.inputs[0]); nt.links.new(rmp.outputs[0], b.inputs['Base Color'])
    return bump(m, 'noise', 30, 0.3)

def track(L):
    rail = mat('rail', hexc('#8f949b'), rough=0.3, metal=1.0); slp = wood('traverse', '#4a3a2c', '#5e4936')
    for y in (-0.36, 0.36): rounded_box(f'rail{y}', L + 1.6, 0.06, 0.07, 0.01, rail, loc=(0, y, 0.085))
    n = int((L + 1.6) / 0.4)
    for i in range(n): rounded_box(f'trav{i}', 0.16, 1.12, 0.06, 0.012, slp, loc=(-(L + 1.6) / 2 + 0.2 + i * 0.4, 0, 0.03))

def wheel(x, y, r, m, hub):
    w = cylinder(f'roue{x}{y}', r, 0.07, m, loc=(x, y, 0.12 + r), rot=(R90, 0, 0), verts=48); bevel(w, 0.012, 2)
    cylinder(f'moyeu{x}{y}', r * 0.4, 0.09, hub, loc=(x, y, 0.12 + r), rot=(R90, 0, 0), verts=24)

def chassis(L, frame_m, steel, z=0.5, wheel_r=0.17, bogies=True):
    """Le dessous commun : longerons, bogies (ou essieux), roues, tampons et attelage."""
    rounded_box('chassis', L, 0.82, 0.1, 0.02, frame_m, loc=(0, 0, z - 0.05))
    for s in (-1, 1):
        bx = s * (L / 2 - 0.55)
        if bogies:
            rounded_box(f'bogie{s}', 0.95, 0.7, 0.1, 0.03, frame_m, loc=(bx, 0, 0.3))
            for dx in (-0.28, 0.28):
                for y in (-0.37, 0.37): wheel(bx + dx, y, wheel_r, steel, frame_m)
        else:
            for y in (-0.37, 0.37): wheel(bx, y, wheel_r + 0.03, steel, frame_m)
        for y in (-0.28, 0.28):
            cylinder(f'tampon{s}{y}', 0.045, 0.16, steel, loc=(s * (L / 2 + 0.08), y, z - 0.05), rot=(0, R90, 0), verts=24)
            t = cylinder(f'tete{s}{y}', 0.085, 0.03, steel, loc=(s * (L / 2 + 0.17), y, z - 0.05), rot=(0, R90, 0), verts=32); bevel(t, 0.01, 2)
        rounded_box(f'traverse{s}', 0.06, 0.86, 0.14, 0.015, frame_m, loc=(s * L / 2, 0, z - 0.04))

def ribs(L, h, z0, m, n, depth=0.02, w=0.9):
    for i in range(n):
        x = -L / 2 + (i + 0.5) * L / n
        for y in (-1, 1): rounded_box(f'cote{i}{y}', 0.04, depth, h, 0.008, m, loc=(x, y * (w / 2 + depth / 2 - 0.004), z0 + h / 2))

def frustum(name, r1, r2, h, m, loc):
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=r1, radius2=r2, depth=h, location=loc, rotation=(math.pi, 0, math.radians(45)))
    o = bpy.context.active_object; o.name = name; o.data.materials.append(m); bevel(o, 0.02, 2); return o

def wagon(kind):
    reset(); L = 2.5
    frame_m = mat('chassis', hexc('#2a2c30'), rough=0.55); steel = mat('acier', hexc('#6d727a'), rough=0.35, metal=0.9)
    glass = mat('vitre', hexc('#1c2a36'), rough=0.08, coat=1.0); gold = mat('laiton', hexc('#d8a64a'), rough=0.25, metal=1.0)
    track(L)
    if kind == 'loco': loco(frame_m, steel, glass, gold); return finish(kind)
    chassis(L, frame_m, steel, bogies=kind not in ('grumes', 'charbon'))
    if kind == 'rouge':                                      # wagon couvert à planches, porte coulissante
        body = bump(mat('caisse', hexc('#c8322b'), rough=0.5, coat=0.3), 'wave', 9.0, 0.25, wave_type='BANDS', bands_direction='X')
        dark = mat('porte', hexc('#9f2520'), rough=0.5, coat=0.3)
        rounded_box('caisse', L, 0.9, 0.86, 0.03, body, loc=(0, 0, 0.93))
        ribs(L, 0.86, 0.5, dark, 8)
        for y in (-1, 1):
            rounded_box(f'porte{y}', 0.7, 0.03, 0.72, 0.01, dark, loc=(0, y * 0.46, 0.92))
            rounded_box(f'rail_porte{y}', 1.5, 0.04, 0.04, 0.01, steel, loc=(0.35, y * 0.475, 1.31))
        rounded_box('toit', L + 0.08, 1.0, 0.1, 0.05, mat('toit', hexc('#5b5e63'), rough=0.6), loc=(0, 0, 1.41))
    elif kind == 'bleu':                                     # wagon-citerne
        body = mat('citerne', hexc('#2563c9'), rough=0.22, coat=0.8); band = mat('cercle', hexc('#173f86'), rough=0.3, coat=0.6)
        cylinder('cuve', 0.44, L - 0.4, body, loc=(0, 0, 1.0), rot=(0, R90, 0), verts=96)
        for s in (-1, 1):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=1, location=(s * (L / 2 - 0.2), 0, 1.0))
            o = bpy.context.active_object; o.scale = (0.2, 0.44, 0.44); o.data.materials.append(body)
            for p in o.data.polygons: p.use_smooth = True
        for x in (-0.75, 0, 0.75): cylinder(f'cercle{x}', 0.448, 0.05, band, loc=(x, 0, 1.0), rot=(0, R90, 0), verts=96)
        d = cylinder('dome', 0.16, 0.2, body, loc=(0, 0, 1.48), verts=64); bevel(d, 0.04, 4)
        rounded_box('passerelle', L - 0.2, 1.0, 0.04, 0.01, frame_m, loc=(0, 0, 0.58))
    elif kind == 'jaune':                                    # wagon-trémie à céréales
        body = mat('tremie', hexc('#efc12c'), rough=0.45, coat=0.4); dark = mat('nervure', hexc('#c99a14'), rough=0.45, coat=0.4)
        rounded_box('caisse', L, 0.92, 0.55, 0.03, body, loc=(0, 0, 1.12))
        for x in (-0.6, 0.6): frustum(f'tremie{x}', 0.66, 0.22, 0.45, body, (x, 0, 0.66))
        ribs(L, 0.55, 0.845, dark, 10, w=0.92)
        rounded_box('bord', L + 0.04, 0.96, 0.05, 0.015, dark, loc=(0, 0, 1.41))
        cereal = bump(mat('ble', hexc('#d9b45a'), rough=0.9), 'noise', 90, 0.6)
        rounded_box('grain', L - 0.1, 0.84, 0.04, 0.02, cereal, loc=(0, 0, 1.39))
    elif kind == 'vert':                                     # wagon plat chargé de grumes
        body = mat('plat', hexc('#2f8f4e'), rough=0.45, coat=0.3)
        rounded_box('plateau', L, 0.92, 0.1, 0.02, body, loc=(0, 0, 0.56))
        for i in range(4):
            for y in (-1, 1): rounded_box(f'ranche{i}{y}', 0.07, 0.07, 0.62, 0.015, body, loc=(-0.95 + i * 0.63, y * 0.44, 0.92))
        bark = wood('ecorce', '#4b3626', '#6e5137'); ring = wood('cerne', '#c9a46e', '#e2c38f')
        for (y, z, r) in [(-0.27, 0.77, 0.15), (0, 0.77, 0.15), (0.27, 0.77, 0.15), (-0.135, 1.03, 0.145), (0.135, 1.03, 0.145), (0, 1.27, 0.13)]:
            lg = L - 0.15 - abs(y) * 0.3
            cylinder(f'grume{y}{z}', r, lg, bark, loc=(0.03 * y, y, z), rot=(0, R90, 0), verts=40)
            for s in (-1, 1): cylinder(f'bout{y}{z}{s}', r * 0.93, 0.01, ring, loc=(0.03 * y + s * lg / 2, y, z), rot=(0, R90, 0), verts=40)
    elif kind == 'noir':                                     # tombereau de charbon
        body = mat('tombereau', hexc('#2c2f35'), rough=0.6); edge = mat('arete', hexc('#4a4f58'), rough=0.45, metal=0.5)
        rounded_box('caisse', L, 0.92, 0.66, 0.03, body, loc=(0, 0, 0.83))
        ribs(L, 0.66, 0.5, edge, 9, w=0.92)
        rounded_box('bord', L + 0.04, 0.96, 0.05, 0.015, edge, loc=(0, 0, 1.17))
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=6, radius=1, location=(0, 0, 1.1))
        c = bpy.context.active_object; c.scale = (1.15, 0.42, 0.26)
        tex = bpy.data.textures.new('tas', 'CLOUDS'); tex.noise_scale = 0.09
        d = c.modifiers.new('tas', 'DISPLACE'); d.texture = tex; d.strength = 0.1; d.mid_level = 0.6
        coal = mat('charbon', hexc('#1a1b1f'), rough=0.42, coat=0.2); c.data.materials.append(coal)
    elif kind == 'blanc':                                    # wagon frigorifique
        body = mat('frigo', hexc('#f1f3f4'), rough=0.35, coat=0.6); band = mat('liseré', hexc('#7fb8d8'), rough=0.35, coat=0.5)
        rounded_box('caisse', L, 0.92, 0.84, 0.09, body, loc=(0, 0, 0.93))
        rounded_box('toit', L + 0.04, 0.96, 0.12, 0.06, body, loc=(0, 0, 1.38))
        for y in (-1, 1):
            rounded_box(f'lisere{y}', L - 0.1, 0.02, 0.05, 0.01, band, loc=(0, y * 0.465, 0.62))
            rounded_box(f'porte{y}', 0.6, 0.025, 0.66, 0.02, body, loc=(0, y * 0.465, 0.93))
            for z in (0.75, 1.1): rounded_box(f'poignee{y}{z}', 0.14, 0.04, 0.03, 0.01, steel, loc=(0.18, y * 0.48, z))
        for x in (-0.85, 0.85): rounded_box(f'trappe{x}', 0.3, 0.3, 0.05, 0.02, band, loc=(x, 0, 1.46))
    elif kind == 'orange':                                   # wagon porte-conteneur
        rounded_box('plateau', L, 0.88, 0.08, 0.02, frame_m, loc=(0, 0, 0.55))
        box = bump(mat('conteneur', hexc('#ee7a22'), rough=0.45, coat=0.3), 'wave', 22.0, 0.6, wave_type='BANDS', bands_direction='X')
        rounded_box('conteneur', L - 0.12, 0.86, 0.84, 0.015, box, loc=(0, 0, 1.01))
        corner = mat('coin', hexc('#7a3c12'), rough=0.5)
        for x in (-1, 1):
            for y in (-1, 1):
                for z in (0.62, 1.4): rounded_box(f'coin{x}{y}{z}', 0.1, 0.1, 0.08, 0.01, corner, loc=(x * (L / 2 - 0.1), y * 0.42, z))
        for s in (-1, 1):
            for y in (-0.2, 0.2): rounded_box(f'barre{s}{y}', 0.03, 0.03, 0.78, 0.01, steel, loc=(s * (L / 2 - 0.05), y, 1.01))
    elif kind == 'violet':                                   # voiture voyageurs, à baies et filet doré
        body = mat('voiture', hexc('#7a3db8'), rough=0.3, coat=0.7)
        rounded_box('caisse', L + 0.1, 0.9, 0.76, 0.06, body, loc=(0, 0, 0.9))
        bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=0.47, depth=L + 0.1, location=(0, 0, 1.24), rotation=(0, R90, 0))
        rf = bpy.context.active_object; rf.scale = (0.3, 1, 1); rf.data.materials.append(mat('toit', hexc('#4c4f57'), rough=0.5))
        for p in rf.data.polygons: p.use_smooth = True
        for y in (-1, 1):
            for i in range(6): rounded_box(f'baie{i}{y}', 0.26, 0.02, 0.26, 0.03, glass, loc=(-0.95 + i * 0.38, y * 0.452, 1.0))
            rounded_box(f'filet{y}', L, 0.016, 0.035, 0.008, gold, loc=(0, y * 0.452, 0.78))
            for s in (-1, 1): rounded_box(f'porte{y}{s}', 0.2, 0.02, 0.62, 0.02, mat('portev', hexc('#5b2a8c'), rough=0.3, coat=0.6), loc=(s * 1.18, y * 0.452, 0.88))
    finish(kind)

def loco(frame_m, steel, glass, gold):
    """La locomotive à vapeur : chaudière noire vernie, roues rouges, cuivres, fanal allumé."""
    black = mat('noir_verni', hexc('#17181b'), rough=0.18, coat=1.0); red = mat('rouge_roue', hexc('#c22a26'), rough=0.35, coat=0.6)
    smoke = mat('boite', hexc('#26272b'), rough=0.4)
    rounded_box('chassis', 2.5, 0.8, 0.14, 0.02, red, loc=(0.05, 0, 0.56))
    for x in (-0.55, 0.1, 0.75):                              # trois essieux moteurs, grandes roues rouges à rayons suggérés
        for y in (-0.38, 0.38):
            w = cylinder(f'roue{x}{y}', 0.3, 0.07, red, loc=(x, y, 0.42), rot=(R90, 0, 0), verts=64); bevel(w, 0.015, 2)
            cylinder(f'bandage{x}{y}', 0.31, 0.05, steel, loc=(x, y * 1.02, 0.42), rot=(R90, 0, 0), verts=64)
            cylinder(f'moyeu{x}{y}', 0.08, 0.1, steel, loc=(x, y, 0.42), rot=(R90, 0, 0), verts=24)
    for y in (-0.44, 0.44):
        rounded_box(f'bielle{y}', 1.4, 0.03, 0.05, 0.012, steel, loc=(0.1, y, 0.36))
        cylinder(f'cyl{y}', 0.13, 0.42, black, loc=(1.12, y * 0.95, 0.62), rot=(0, R90, 0), verts=40)
    for y in (-0.37, 0.37): wheel(1.25, y, 0.15, steel, frame_m)
    cylinder('chaudiere', 0.4, 1.75, black, loc=(0.45, 0, 1.02), rot=(0, R90, 0), verts=96)
    for x in (-0.2, 0.45, 1.1): cylinder(f'cerclage{x}', 0.405, 0.035, gold, loc=(x, 0, 1.02), rot=(0, R90, 0), verts=96)
    cylinder('boite_fumee', 0.42, 0.32, smoke, loc=(1.42, 0, 1.02), rot=(0, R90, 0), verts=96)
    p = cylinder('porte_fumee', 0.36, 0.05, smoke, loc=(1.6, 0, 1.02), rot=(0, R90, 0), verts=64); bevel(p, 0.02, 3)
    ch = cylinder('cheminee', 0.1, 0.42, black, loc=(1.42, 0, 1.58), verts=48)
    cylinder('pavillon', 0.15, 0.08, black, loc=(1.42, 0, 1.8), verts=48)
    for x, r in ((0.7, 0.15), (0.15, 0.13)):
        d = cylinder(f'dome{x}', r, 0.24, gold, loc=(x, 0, 1.45), verts=64); bevel(d, 0.06, 5)
    cylinder('sifflet', 0.03, 0.16, gold, loc=(-0.25, 0, 1.5), verts=16)
    rounded_box('cabine', 0.8, 0.96, 0.9, 0.03, black, loc=(-0.85, 0, 1.08))
    rounded_box('toit_cabine', 1.0, 1.08, 0.07, 0.03, smoke, loc=(-0.85, 0, 1.57))
    for y in (-1, 1): rounded_box(f'vitre{y}', 0.34, 0.02, 0.3, 0.04, glass, loc=(-0.8, y * 0.482, 1.25))
    rounded_box('filet_cabine', 0.82, 0.98, 0.04, 0.01, gold, loc=(-0.85, 0, 0.7))
    rounded_box('traverse_av', 0.08, 0.95, 0.2, 0.02, red, loc=(1.68, 0, 0.56))
    # le chasse-pierres : un coin d'acier qui pointe vers l'avant, au ras des rails
    me = bpy.data.meshes.new('chasse')
    me.from_pydata([(1.66, -0.46, 0.5), (1.66, 0.46, 0.5), (1.66, -0.46, 0.13), (1.66, 0.46, 0.13), (2.06, 0, 0.13)], [],
                   [(0, 2, 3, 1), (0, 4, 2), (1, 3, 4), (0, 1, 4), (2, 4, 3)])
    me.update(); cc = obj_from('chasse', me, mat('chasse', hexc('#3a3d43'), rough=0.35, metal=0.8)); bevel(cc, 0.015, 2)
    for y in (-0.28, 0.28):
        cylinder(f'tampon{y}', 0.045, 0.16, steel, loc=(1.78, y, 0.56), rot=(0, R90, 0), verts=24)
        cylinder(f'tete{y}', 0.085, 0.03, steel, loc=(1.86, y, 0.56), rot=(0, R90, 0), verts=32)
    f = cylinder('fanal', 0.1, 0.16, gold, loc=(1.6, 0, 1.5), rot=(0, R90, 0), verts=32); bevel(f, 0.02, 2)
    cylinder('verre_fanal', 0.075, 0.02, mat('feu', (1, 0.85, 0.5), rough=0.1, emit=(1, 0.8, 0.45)), loc=(1.685, 0, 1.5), rot=(0, R90, 0), verts=32)
    # le tender, juste derrière, pour la silhouette
    rounded_box('tender', 0.9, 0.9, 0.7, 0.04, black, loc=(-1.75, 0, 0.92))
    rounded_box('charbon_t', 0.8, 0.8, 0.08, 0.04, mat('charbon', hexc('#0e0f11'), rough=0.3), loc=(-1.75, 0, 1.3))
    rounded_box('chassis_t', 0.95, 0.8, 0.12, 0.02, red, loc=(-1.75, 0, 0.53))
    for x in (-2.0, -1.5):
        for y in (-0.37, 0.37): wheel(x, y, 0.16, steel, frame_m)

def finish(kind):
    sc = bpy.context.scene
    place_camera(sc.camera, elev=17, azim=-38, dist=9)
    sc.camera.data.lens = 70
    objs = [o for o in sc.objects if o.type in ('MESH',) and not o.name.startswith(('rail', 'trav'))]
    frame(objs, fill=0.9)
    shoot('wagon-' + kind, 320 if PREVIEW else 900, 210 if PREVIEW else 600)


# ================================================================ les pièces des joueurs
PIECES = {'rouge': '#d8372f', 'bleu': '#2c6fd9', 'vert': '#2f9d58', 'jaune': '#f2c12e', 'noir': '#2b2d33'}
def piece(k):
    reset(); sc = bpy.context.scene
    plast = mat('plastique', hexc(PIECES[k]), rough=0.28, coat=0.5)
    rounded_box('corps', 1.0, 0.38, 0.28, 0.05, plast, loc=(0, 0, 0.14))
    rounded_box('toit', 0.9, 0.22, 0.06, 0.025, plast, loc=(0, 0, 0.3))
    for x in (-0.36, 0.36):
        for y in (-0.19, 0.19): cylinder(f'roue{x}{y}', 0.07, 0.03, plast, loc=(x, y, 0.06), rot=(R90, 0, 0), verts=24)
    cam = sc.camera; cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.12
    cam.location = (0, 0, 6); cam.rotation_euler = (0, 0, 0)
    for o in sc.objects:
        if o.type == 'LIGHT': o.location.z = max(o.location.z, 3.5)
    shoot('piece-' + k, 280, 112)


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    todo = argv or ['plateau', 'wagons', 'pieces']
    if 'wagons' in todo:
        for k in ['rouge', 'bleu', 'jaune', 'vert', 'noir', 'blanc', 'orange', 'violet', 'loco']: wagon(k)
    for k in todo:
        if k.startswith('wagon-'): wagon(k[6:])
    if 'pieces' in todo:
        for k in PIECES: piece(k)
    if 'plateau' in todo: plateau()
