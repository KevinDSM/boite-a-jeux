"""Planche de contrôle : chaque icône posée sur sa tuile de couleur, comme sur le site."""
import sys, os
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
COL = {'timeline': '#df6438', 'bataille': '#bf3a3a', 'sablier': '#c58d34', 'poker': '#1e6c42'}
keys = sys.argv[1:-1] or list(COL); out = sys.argv[-1]
T = 180
def tile(color):
    t = Image.new('RGBA', (T, T), (0, 0, 0, 0)); m = Image.new('L', (T, T), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, T - 1, T - 1), radius=int(T * 0.225), fill=255)
    c = tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))
    g = Image.new('RGBA', (T, T)); d = ImageDraw.Draw(g)
    for y in range(T):
        k = y / T; f = 1.18 - 0.36 * k
        d.line([(0, y), (T, y)], fill=tuple(min(255, int(v * f)) for v in c) + (255,))
    t.paste(g, (0, 0), m); return t
sheet = Image.new('RGBA', (len(keys) * (T + 20) + 20, T + 40), (36, 30, 40, 255))
for i, k in enumerate(keys):
    t = tile(COL.get(k, '#777777'))
    ic = Image.open(os.path.join(ROOT, 'icons', k + '.png')).convert('RGBA').resize((int(T * 0.86),) * 2, Image.LANCZOS)
    t.alpha_composite(ic, ((T - ic.width) // 2, (T - ic.height) // 2))
    sheet.alpha_composite(t, (20 + i * (T + 20), 20))
sheet.save(out)
