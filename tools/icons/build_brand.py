"""Les images de marque de la Boîte à jeux, à partir du logo 3D rendu dans Blender (icons/logo.png, fond transparent) :
icônes de l'appli (icon-180/192/512.png, icon-maskable-512.png), image de partage des liens (og.jpg, 1200 × 630,
sans texte ; c'est aussi le fond de l'image d'invitation des salons, dessinée par salon.js).
D'abord : ICON_SIZE=1400 blender -b --factory-startup -P tools/icons/build_icons.py -- logo
Puis :    python tools/icons/build_brand.py"""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
P = lambda *a: os.path.join(ROOT, *a)
logo = Image.open(P("icons", "logo.png")).convert("RGBA")
# le rendu garde une vraie ombre au sol (sol « attrape-ombre » de Blender) : on la fait fondre avant les bords de
# l'image, sinon elle s'arrête net en traçant un rectangle ; puis on recadre sur l'objet et son ombre proche
def fondre(im):
    a = im.getchannel("A"); obj = a.point(lambda v: 255 if v > 200 else 0).getbbox()
    if not obj: return im
    x0, y0, x1, y1 = obj; w, h = x1 - x0, y1 - y0
    m = Image.new("L", im.size, 0); ImageDraw.Draw(m).rounded_rectangle((x0 - w * .04, y0 - h * .04, x1 + w * .04, y1 + h * .06), radius=min(w, h) * .3, fill=255)
    m = m.filter(ImageFilter.GaussianBlur(min(w, h) * .05))
    from PIL import ImageChops
    im.putalpha(ImageChops.multiply(a, m)); return im
logo = fondre(logo)
logo = logo.crop(logo.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox())
VRAIE_OMBRE = True   # le logo apporte son ombre : pas d'ombre dessinée en plus
BASE, GLOW = (34, 28, 23), (240, 160, 48)          # l'espresso de l'appli (#221c17) et l'ambre de l'accent

def fond(w, h, cx=.5, cy=.5, r=.62, force=.34):
    """Le fond sombre, avec une lueur ambrée derrière le logo."""
    im = Image.new("RGB", (w, h), BASE)
    glow = Image.new("L", (w, h), 0); d = ImageDraw.Draw(glow)
    R = int(max(w, h) * r)
    for i in range(60, 0, -1):                       # dégradé radial par anneaux, puis flouté
        k = i / 60; d.ellipse((cx * w - R * k, cy * h - R * k, cx * w + R * k, cy * h + R * k), fill=int(255 * force * (1 - k) ** 1.6))
    glow = glow.filter(ImageFilter.GaussianBlur(max(w, h) / 40))
    im.paste(Image.new("RGB", (w, h), GLOW), (0, 0), glow)
    return im

def pose(im, h_logo, cx, cy):
    """Le logo à la hauteur voulue, centré en (cx, cy), avec son ombre douce posée dessous."""
    lg = logo.resize((round(logo.width * h_logo / logo.height), h_logo), Image.LANCZOS)
    x, y = round(cx - lg.width / 2), round(cy - lg.height / 2)
    if not VRAIE_OMBRE:
        sh = Image.new("L", im.size, 0); d = ImageDraw.Draw(sh)
        d.ellipse((x + lg.width * .1, y + lg.height * .9, x + lg.width * .9, y + lg.height * 1.02), fill=120)
        sh = sh.filter(ImageFilter.GaussianBlur(h_logo / 16))
        im.paste(Image.new("RGB", im.size, (8, 5, 2)), (0, 0), sh)
    im.paste(lg, (x, y), lg)
    return im

for name, size, part in (("icon-512.png", 512, .78), ("icon-192.png", 192, .78), ("icon-180.png", 180, .78), ("icon-maskable-512.png", 512, .6)):
    im = pose(fond(size, size, cy=.47), round(size * part), size / 2, size * .48)
    im.save(P(name), optimize=True); print(name, os.path.getsize(P(name)), "octets")

og = pose(fond(1200, 630, r=.55, force=.4), 530, 600, 312)
og.save(P("og.jpg"), quality=88, optimize=True, progressive=True); print("og.jpg", os.path.getsize(P("og.jpg")), "octets")
