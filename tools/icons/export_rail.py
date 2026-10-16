"""Versions web des objets de Grandes Lignes : tools/icons/rail/*.png (rendus Blender) -> img/rail/*.webp.
Wagons : recadrés au plus près, format 3 × 2 ; pièces des joueurs : gardées telles quelles (format 5 × 2) ;
plateau : 2070 × 2020, sans transparence."""
import os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(HERE, 'rail')
def save(im, rel, size, q=88):
    out = os.path.join(ROOT, rel); os.makedirs(os.path.dirname(out), exist_ok=True)
    im.resize(size, Image.LANCZOS).save(out, 'WEBP', quality=q, method=6)
    print(rel, size, os.path.getsize(out), 'octets')
def tight(im, ratio, pad=1.03):
    bb = im.getbbox(); im = im.crop(bb) if bb else im
    w = int(max(im.width, im.height / ratio) * pad); h = int(w * ratio)
    c = Image.new('RGBA', (w, h), (0, 0, 0, 0)); c.alpha_composite(im, ((w - im.width) // 2, (h - im.height) // 2))
    return c
for k in ['rouge', 'bleu', 'jaune', 'vert', 'noir', 'blanc', 'orange', 'violet', 'loco']:
    p = os.path.join(SRC, f'wagon-{k}.png')
    if os.path.exists(p): save(tight(Image.open(p).convert('RGBA'), 2 / 3), f'img/rail/wagon-{k}.webp', (360, 240))
for k in ['rouge', 'bleu', 'vert', 'jaune', 'noir']:
    p = os.path.join(SRC, f'piece-{k}.png')
    if os.path.exists(p): save(Image.open(p).convert('RGBA'), f'img/rail/piece-{k}.webp', (140, 56))
p = os.path.join(SRC, 'plateau.png')
if os.path.exists(p):
    im = Image.open(p).convert('RGB'); save(im, 'img/rail/plateau.webp', im.size, q=84)
