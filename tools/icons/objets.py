"""Objets 3D des jeux, rendus dans Blender (mêmes outils que build_icons.py), pour remplacer les dessins CSS :
  img/menteur/de-1.webp … de-6.webp (un dé par face, le 1 = Paco doré), img/menteur/gobelet.webp,
  img/navale/pa|cr|ct|sm|tp.webp (vus de dessus, proue à droite, une case = 1 unité, image au format L × 1).
Lancement :  blender -b --factory-startup -P tools/icons/objets.py -- [de gobelet navire]   (ICON_PREVIEW=1 = aperçu)
Puis :       python tools/icons/export_objets.py
Les rendus bruts (PNG 512 px de haut) vont dans tools/icons/objets/."""
import bpy, os, sys, math
HERE = os.path.dirname(os.path.abspath(__file__))
OUTD = os.path.join(HERE, 'objets'); os.makedirs(OUTD, exist_ok=True)
ns = {'__name__': 'outils_icones', '__file__': os.path.join(HERE, 'build_icons.py')}
exec(open(os.path.join(HERE, 'build_icons.py'), encoding='utf-8').read(), ns)     # reset, mat, die, cup, frame… sans lancer les icônes
globals().update({k: v for k, v in ns.items() if not k.startswith('__')})


def shoot(name, w, h):
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.filepath = os.path.join(OUTD, name + '.png')
    bpy.ops.render.render(write_still=True)
    print('objet rendu :', name)


def dice():
    for f in range(1, 7):
        reset()
        die('de', f, 1.0, gold=(f == 1), rot=(-14, 0, 12))        # la face du dessus et la droite se devinent, la face avant se lit
        frame([o for o in bpy.context.scene.objects if o.type == 'MESH'], fill=0.94)
        shoot(f'de-{f}', 512, 512)


def gobelet():
    reset()
    cup('gobelet', h=1.7, r_top=0.6, r_bot=0.84)
    frame([o for o in bpy.context.scene.objects if o.type == 'MESH'], fill=0.94)
    shoot('gobelet', 512, 538)


# ---------------------------------------------------------------- les navires, vus d'en haut
LEN = {'pa': 5, 'cr': 4, 'ct': 3, 'sm': 3, 'tp': 2}

def top_camera(L):
    """Caméra orthographique face au plan XZ (on regarde le pont), cadrée sur L cases × 1 case."""
    sc = bpy.context.scene; cam = sc.camera
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = L          # la plus grande dimension de l'image = L unités
    cam.location = (0, -10, 0); cam.rotation_euler = (math.radians(90), 0, 0)
    # lumière rasante d'en haut à gauche, comme le reste de l'appli
    for o in sc.objects:
        if o.type == 'LIGHT': o.location.y = min(o.location.y, -2.0)

def hull_outline(L, w, bow=0.9, stern=0.22, n=12):
    """Contour du pont (x, z), sens trigonométrique : poupe arrondie à gauche, proue effilée à droite."""
    a, b, half = -L / 2 + 0.08, L / 2 - 0.06, w / 2
    lin = lambda u0, u1: [u0 + (u1 - u0) * i / (n - 1) for i in range(n)]
    stern_pts = [(a + stern + stern * math.cos(t), half * math.sin(t)) for t in lin(math.pi / 2, 3 * math.pi / 2)]
    bow_low = [(b - bow + bow * u, -half * (1 - u ** 1.8)) for u in lin(0, 1)]       # flanc bas jusqu'à la pointe
    bow_up = [(x, -z) for x, z in reversed(bow_low[:-1])]                             # et le flanc haut, au retour
    return stern_pts + bow_low + bow_up

def deckbox(name, x, z, w, h, m, lift=0.0, r=0.05):
    return rounded_box(name, w, 0.18, h, min(r, w / 3, h / 3), m, loc=(x, -0.2 - lift, z))

def turret(name, x, z, m, barrel, dir=1, r=0.16):
    t = cylinder(name, r, 0.16, m, loc=(x, -0.25, z), rot=(math.radians(90), 0, 0), verts=40); bevel(t, 0.03, 3)
    for dz in (-0.045, 0.045):
        cylinder(name + f'c{dz}', 0.028, 0.36, barrel, loc=(x + dir * 0.28, -0.27, z + dz), rot=(0, math.radians(90), 0), verts=12)
    return t

def ship(k):
    reset(); L = LEN[k]
    hull = mat('coque', hexc('#8794a3'), rough=0.42, coat=0.35); deck = mat('pont', hexc('#5f6b78'), rough=0.55)
    dark = mat('sombre', hexc('#3d4652'), rough=0.5); white = mat('blanc', hexc('#e9eef3'), rough=0.45)
    gun = mat('canon', hexc('#2e353e'), rough=0.4)
    w = 0.62 if k != 'sm' else 0.44
    if k == 'sm':                                            # le sous-marin : un cigare sombre et son kiosque
        body = mat('sous-marin', hexc('#36424e'), rough=0.38, coat=0.5)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=1, location=(0, 0, 0))
        o = bpy.context.active_object; o.scale = (L / 2 - 0.12, 0.22, w / 2); o.data.materials.append(body)
        for p in o.data.polygons: p.use_smooth = True
        rounded_box('kiosque', 0.56, 0.2, 0.2, 0.08, dark, loc=(-0.1, -0.22, 0))
        cylinder('periscope', 0.03, 0.3, gun, loc=(0.05, -0.33, 0), rot=(0, math.radians(90), 0), verts=12)
        rounded_box('gouvernail', 0.18, 0.08, 0.5, 0.03, body, loc=(-L / 2 + 0.2, 0, 0))
    else:
        h = poly('coque', hull_outline(L, w), 0.26, hull, bev=0.04); h.location.y = 0.0
        if k == 'pa':                                        # porte-avions : pont d'envol, marquages, îlot
            fl = poly('envol', hull_outline(L - 0.1, w - 0.08), 0.06, deck, bev=0.01); fl.location.y = -0.16
            for i in range(9):
                rounded_box(f'trait{i}', 0.22, 0.02, 0.025, 0.005, white, loc=(-1.9 + i * 0.42, -0.2, 0))
            rounded_box('piste', 3.4, 0.02, 0.02, 0.005, white, loc=(0.1, -0.2, -0.17)).rotation_euler.y = math.radians(-5)
            deckbox('ilot', 0.55, 0.2, 0.62, 0.16, dark, lift=0.06)
            rounded_box('avion1', 0.34, 0.06, 0.08, 0.02, white, loc=(-1.2, -0.24, 0.06)); rounded_box('aile1', 0.08, 0.06, 0.3, 0.02, white, loc=(-1.18, -0.24, 0.06))
            rounded_box('avion2', 0.34, 0.06, 0.08, 0.02, white, loc=(-0.5, -0.24, -0.08)); rounded_box('aile2', 0.08, 0.06, 0.3, 0.02, white, loc=(-0.48, -0.24, -0.08))
        else:
            dk = poly('pont', hull_outline(L - 0.16, w - 0.14), 0.04, deck, bev=0.01); dk.location.y = -0.14
            if k == 'cr':                                    # croiseur : deux tourelles à l'avant, une à l'arrière, château et cheminée
                turret('t1', 1.05, 0, dark, gun); turret('t2', 0.55, 0, dark, gun); turret('t3', -1.2, 0, dark, gun, dir=-1)
                deckbox('chateau', -0.1, 0, 0.7, 0.34, white, lift=0.02); deckbox('passerelle', 0.12, 0, 0.26, 0.26, dark, lift=0.06)
                cylinder('cheminee', 0.11, 0.2, dark, loc=(-0.55, -0.3, 0), rot=(math.radians(90), 0, 0), verts=32)
            elif k == 'ct':                                  # contre-torpilleur : une tourelle devant, une derrière
                turret('t1', 0.62, 0, dark, gun, r=0.14); turret('t2', -0.82, 0, dark, gun, dir=-1, r=0.14)
                deckbox('chateau', -0.05, 0, 0.6, 0.3, white, lift=0.02)
                cylinder('cheminee', 0.09, 0.2, dark, loc=(-0.42, -0.3, 0), rot=(math.radians(90), 0, 0), verts=32)
            elif k == 'tp':                                  # torpilleur : une petite vedette, un canon, une cabine
                turret('t1', 0.32, 0, dark, gun, r=0.12)
                deckbox('cabine', -0.28, 0, 0.42, 0.28, white, lift=0.02)
    top_camera(L)
    shoot(k, 128 * L if PREVIEW else 256 * L, 128 if PREVIEW else 256)


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    todo = argv or ['de', 'gobelet', 'navire']
    if 'de' in todo: dice()
    if 'gobelet' in todo: gobelet()
    if 'navire' in todo:
        for k in LEN: ship(k)
