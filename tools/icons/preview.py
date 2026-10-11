"""Planche de contrôle : chaque icône posée sur sa tuile de couleur, comme sur le site."""
import sys, os
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
COL = {'timeline': '#df6438', 'eclair': '#e3a619', 'sprint': '#2b9d6a', 'chromo': '#df453b', 'douze': '#1f9187', 'kems': '#7650cf', 'bataille': '#bf3a3a',
       'poker': '#1e6c42', 'solitaire': '#2e7a4e', 'duel': '#8a683e', 'teldes': '#4a78dd', 'mirage': '#a964d6', 'memes': '#e0a000', 'limite': '#55555f',
       'nomcode': '#b53327', 'sablier': '#c58d34', 'diapason': '#d4446c', 'petitbac': '#e0852b', 'geo': '#2b8bc5', 'undercover': '#3b4859',
       'loupgarou': '#2c3166', 'naufrages': '#1592a3', 'miroir': '#6f9bd1', 'regles': '#8a8178', 'solo': '#56657a',
       'unseulindice': '#8a3576', 'menteur': '#9a5a2c', 'navale': '#2d5f9e', 'coinche': '#1f6f86', 'motdujour': '#2b5bb8', 'nouveautes': '#c0485a',
       'echecs': '#3f6b45', 'dames': '#8a4b2a'}
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
COLS = 7; rows = (len(keys) + COLS - 1) // COLS
sheet = Image.new('RGBA', (min(len(keys), COLS) * (T + 20) + 20, rows * (T + 20) + 20), (36, 30, 40, 255))
for i, k in enumerate(keys):
    t = tile(COL.get(k, '#777777'))
    ic = Image.open(os.path.join(ROOT, 'icons', k + '.png')).convert('RGBA').resize((int(T * 0.86),) * 2, Image.LANCZOS)
    t.alpha_composite(ic, ((T - ic.width) // 2, (T - ic.height) // 2))
    sheet.alpha_composite(t, (20 + (i % COLS) * (T + 20), 20 + (i // COLS) * (T + 20)))
sheet.save(out)
