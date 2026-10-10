"""Versions web des icônes : icons/<jeu>.png (512 px, rendu Blender) -> icons/web/<jeu>.webp (192 px)."""
import os, glob
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.makedirs(os.path.join(ROOT, 'icons', 'web'), exist_ok=True)
for p in sorted(glob.glob(os.path.join(ROOT, 'icons', '*.png'))):
    k = os.path.splitext(os.path.basename(p))[0]
    im = Image.open(p).convert('RGBA')
    bb = im.getbbox()                                   # recadre au plus près, puis carré centré avec une marge
    if bb: im = im.crop(bb)
    side = int(max(im.size) * 1.06); sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    out = os.path.join(ROOT, 'icons', 'web', k + '.webp')
    sq.resize((192, 192), Image.LANCZOS).save(out, 'WEBP', quality=88, method=6)
    print(k, os.path.getsize(out), 'octets')
