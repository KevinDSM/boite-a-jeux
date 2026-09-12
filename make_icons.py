# -*- coding: utf-8 -*-
"""Génère les icônes de Platine (écran d'accueil iOS / Android) depuis un seul dessin.

    python make_icons.py

Produit icon-180.png (iOS), icon-192.png, icon-512.png et icon-maskable-512.png (Android).
Le disque est dessiné à 2048 px puis réduit, ce qui lisse les sillons.
"""
from PIL import Image, ImageDraw

BG = (34, 28, 23)          # fond chaud sombre, celui du hub
DISC = (16, 13, 11)        # vinyle
GROOVE = (44, 38, 33)      # sillons
LABEL = (240, 160, 48)     # tangerine
HOLE = (247, 239, 226)     # crème

S = 2048                   # résolution de travail


def draw(full_bleed=True, disc_ratio=0.78):
    """full_bleed : fond carré (iOS arrondit lui-même). disc_ratio : taille du vinyle."""
    img = Image.new("RGB", (S, S), BG)
    d = ImageDraw.Draw(img)
    c = S / 2
    r = S * disc_ratio / 2

    # léger halo chaud derrière le disque
    for i in range(60, 0, -1):
        k = i / 60
        rr = r * (1 + 0.22 * k)
        v = tuple(int(BG[j] + (LABEL[j] - BG[j]) * 0.05 * (1 - k)) for j in range(3))
        d.ellipse([c - rr, c - rr, c + rr, c + rr], fill=v)

    d.ellipse([c - r, c - r, c + r, c + r], fill=DISC)

    # sillons concentriques
    step = r / 26
    rr = r * 0.97
    while rr > r * 0.34:
        d.ellipse([c - rr, c - rr, c + rr, c + rr], outline=GROOVE, width=max(2, int(S / 620)))
        rr -= step

    # reflet balayant, comme sur l'accueil
    d.pieslice([c - r, c - r, c + r, c + r], -58, -22, fill=(30, 25, 21))
    d.pieslice([c - r, c - r, c + r, c + r], 122, 158, fill=(26, 21, 18))

    # étiquette centrale
    lr = r * 0.38
    d.ellipse([c - lr, c - lr, c + lr, c + lr], fill=LABEL)
    hr = r * 0.085
    d.ellipse([c - hr, c - hr, c + hr, c + hr], fill=HOLE)
    return img


def save(img, size, name):
    img.resize((size, size), Image.LANCZOS).save(name, "PNG", optimize=True)
    print(name, f"{size}x{size}")


icon = draw()
save(icon, 180, "icon-180.png")     # iOS, écran d'accueil
save(icon, 192, "icon-192.png")     # Android
save(icon, 512, "icon-512.png")     # Android, splash
# version « maskable » : disque plus petit, Android rogne les bords sans couper le dessin
save(draw(disc_ratio=0.58), 512, "icon-maskable-512.png")
