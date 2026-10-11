"""Versions web des objets 3D : tools/icons/objets/*.png (rendus Blender) -> img/menteur/*.webp et img/navale/*.webp.
Dés et gobelet : recadrés au plus près, carrés (gobelet un peu plus haut que large) ; navires : gardés tels quels,
au format L cases × 1 case (l'image s'aligne sur la grille)."""
import os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(HERE, 'objets')
NAV = {'pa': 5, 'cr': 4, 'ct': 3, 'sm': 3, 'tp': 2}
def save(im, rel, size):
    out = os.path.join(ROOT, rel); os.makedirs(os.path.dirname(out), exist_ok=True)
    im.resize(size, Image.LANCZOS).save(out, 'WEBP', quality=90, method=6)
    print(rel, size, os.path.getsize(out), 'octets')
def tight(im, ratio=1.0, pad=1.04):
    bb = im.getbbox(); im = im.crop(bb) if bb else im
    h = int(max(im.height, im.width * ratio) * pad); w = int(h / ratio)
    c = Image.new('RGBA', (w, h), (0, 0, 0, 0)); c.alpha_composite(im, ((w - im.width) // 2, (h - im.height) // 2))
    return c
for f in range(1, 7):
    p = os.path.join(SRC, f'de-{f}.png')
    if os.path.exists(p): save(tight(Image.open(p).convert('RGBA')), f'img/menteur/de-{f}.webp', (128, 128))
p = os.path.join(SRC, 'gobelet.png')
if os.path.exists(p): save(tight(Image.open(p).convert('RGBA'), 1.05), 'img/menteur/gobelet.webp', (128, 134))
for k, L in NAV.items():
    p = os.path.join(SRC, k + '.png')
    if os.path.exists(p): save(Image.open(p).convert('RGBA'), f'img/navale/{k}.webp', (96 * L, 96))
