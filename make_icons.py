# -*- coding: utf-8 -*-
"""Génère les icônes de Boîte à jeux (écran d'accueil iOS / Android) depuis un seul dessin.

    python make_icons.py

Produit icon-180.png (iOS), icon-192.png, icon-512.png et icon-maskable-512.png (Android).
La boîte de jeu est dessinée à 2048 px puis réduite, ce qui lisse les bords.
Même dessin que le SVG de l'accueil : boîte vue de trois quarts, couvercle entrouvert,
un dé et un pion qui dépassent.
"""
from PIL import Image, ImageDraw

BG = (34, 28, 23)            # fond chaud sombre, celui du hub
TOP = (96, 82, 70)           # dessus du corps
SIDE = (54, 46, 40)          # côté gauche
FRONT = (72, 62, 54)         # face avant
BAND = (232, 158, 52)        # bande tangerine (accent)
BAND2 = (245, 196, 110)      # bande claire
LID = (232, 158, 52)         # couvercle
LID_EDGE = (176, 112, 36)
LID_EDGE2 = (206, 138, 48)
LID_MARK = (250, 244, 232)
DIE = (250, 246, 238)
DIE_L = (214, 206, 194)
DIE_R = (236, 230, 220)
PIP = (40, 32, 26)
MEEPLE = (110, 200, 150)     # vert pion
SHADOW = (18, 14, 12)

S = 2048                     # résolution de travail


def P(pts, k, ox, oy):
    """Points du SVG (repère 120×100) → pixels, échelle k, décalage (ox, oy)."""
    return [(ox + x * k, oy + y * k) for x, y in pts]


def draw(box_ratio=0.80):
    """box_ratio : largeur de la boîte par rapport à l'icône (plus petit pour la maskable)."""
    img = Image.new("RGB", (S, S), BG)
    d = ImageDraw.Draw(img)
    k = S * box_ratio / 120.0
    ox = (S - 120 * k) / 2
    oy = (S - 100 * k) / 2 + k * 2

    # léger halo chaud derrière la boîte
    for i in range(60, 0, -1):
        t = i / 60
        rr = S * 0.42 * (1 + 0.25 * t)
        v = tuple(int(BG[j] + (BAND[j] - BG[j]) * 0.05 * (1 - t)) for j in range(3))
        d.ellipse([S / 2 - rr, S / 2 - rr, S / 2 + rr, S / 2 + rr], fill=v)

    # ombre au sol
    d.ellipse(P([(14, 83), (106, 97)], k, ox, oy), fill=SHADOW)

    # corps
    d.polygon(P([(18, 52), (60, 70), (60, 92), (18, 74)], k, ox, oy), fill=SIDE)
    d.polygon(P([(60, 70), (102, 52), (102, 74), (60, 92)], k, ox, oy), fill=FRONT)
    d.polygon(P([(18, 52), (60, 34), (102, 52), (60, 70)], k, ox, oy), fill=TOP)
    d.polygon(P([(18, 64), (60, 82), (60, 88), (18, 70)], k, ox, oy), fill=BAND)
    d.polygon(P([(60, 82), (102, 64), (102, 70), (60, 88)], k, ox, oy), fill=BAND2)

    # couvercle entrouvert (légèrement relevé à droite)
    d.polygon(P([(14, 44), (60, 24), (106, 40), (60, 60)], k, ox, oy), fill=LID)
    d.polygon(P([(14, 44), (60, 60), (60, 65), (14, 49)], k, ox, oy), fill=LID_EDGE)
    d.polygon(P([(60, 60), (106, 40), (106, 45), (60, 65)], k, ox, oy), fill=LID_EDGE2)
    d.polygon(P([(44, 41), (60, 34), (76, 41), (60, 48)], k, ox, oy), fill=LID_MARK)

    # dé
    d.polygon(P([(86, 18), (98, 12), (110, 18), (98, 24)], k, ox, oy), fill=DIE)
    d.polygon(P([(86, 18), (98, 24), (98, 38), (86, 32)], k, ox, oy), fill=DIE_L)
    d.polygon(P([(98, 24), (110, 18), (110, 32), (98, 38)], k, ox, oy), fill=DIE_R)
    for (cx, cy, r) in [(98, 18, 1.9), (90, 24, 1.6), (94, 30, 1.6), (102, 30, 1.6), (106, 24, 1.6)]:
        d.ellipse(P([(cx - r, cy - r), (cx + r, cy + r)], k, ox, oy), fill=PIP)

    # pion
    d.ellipse(P([(18, 16), (30, 28)], k, ox, oy), fill=MEEPLE)
    d.polygon(P([(14, 44), (16, 32), (20, 27), (28, 27), (32, 32), (34, 44)], k, ox, oy), fill=MEEPLE)
    return img


def save(img, size, name):
    img.resize((size, size), Image.LANCZOS).save(name, "PNG", optimize=True)
    print(name, f"{size}x{size}")


icon = draw()
save(icon, 180, "icon-180.png")     # iOS, écran d'accueil
save(icon, 192, "icon-192.png")     # Android
save(icon, 512, "icon-512.png")     # Android, splash
# version « maskable » : boîte plus petite, Android rogne les bords sans couper le dessin
save(draw(box_ratio=0.60), 512, "icon-maskable-512.png")
