"""Cartes de Mirage : œuvres du domaine public, récoltées sur les collections en accès libre du
Metropolitan Museum (New York) et du Cleveland Museum of Art, réduites pour un écran de téléphone.

Pour rester évocateur et ambigu comme dans le jeu d'origine, on vise des artistes au monde onirique ou
symbolique (Redon, Moreau, Blake, Goya, Rousseau, Doré, estampes japonaises…) et on écarte les portraits
officiels, les objets et les documents. La sélection reste imparfaite : le fichier mirage.json peut être
édité à la main, une carte retirée = une ligne supprimée (et l'image dans mirage/).

Usage : python build_mirage.py            (reprend ce qui existe, n'ajoute que le nouveau)
        python build_mirage.py --max 220  (nombre total de cartes visé)
"""
import json, os, sys, time, io, re, urllib.request, urllib.parse
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(HERE, 'mirage'); os.makedirs(DIR, exist_ok=True)
DST = os.path.join(HERE, 'mirage.json')
UA = {'User-Agent': 'Mozilla/5.0 (boite-a-jeux, jeu entre amis, images du domaine public)'}
MAX = int(sys.argv[sys.argv.index('--max') + 1]) if '--max' in sys.argv else 220
SIDE = 720                      # plus grand côté après réduction

# artiste : quota de cartes. Cherché tel quel dans les deux musées.
ARTISTS = [
    ('Odilon Redon', 22), ('Gustave Moreau', 8), ('William Blake', 14), ('Francisco de Goya', 16), ('Henri Rousseau', 6),
    ('Gustave Doré', 10), ('Grandville', 8), ('Hieronymus Bosch', 6), ('Pieter Bruegel', 6), ('Arnold Böcklin', 5),
    ('Henry Fuseli', 8), ('Katsushika Hokusai', 12), ('Utagawa Hiroshige', 12), ('Utagawa Kuniyoshi', 10),
    ('James Ensor', 5), ('Edvard Munch', 6), ('Albrecht Dürer', 10), ('Max Klinger', 6), ('Alphonse Mucha', 4),
    ('Winslow Homer', 6), ('Caspar David Friedrich', 4), ('J. M. W. Turner', 6), ('Félix Vallotton', 6),
    ('Paul Gauguin', 6), ('Vincent van Gogh', 6), ('Georges Seurat', 4), ('Henri de Toulouse-Lautrec', 4),
    ('Puvis de Chavannes', 4), ('Fernand Khnopff', 4), ('Jean-Jacques Grandville', 4), ('Kawanabe Kyōsai', 6),
    ('Rodolphe Bresdin', 6), ('Charles Meryon', 4), ('Giovanni Battista Piranesi', 5), ('Edward Burne-Jones', 4),
    ('Aubrey Beardsley', 6), ('Salvator Rosa', 4), ('Hans Baldung', 4), ('Martin Schongauer', 3),
    # deuxième passe : illustrateurs de contes, symbolistes, estampes
    ('Arthur Rackham', 8), ('Edmund Dulac', 6), ('Ivan Bilibin', 6), ('John Bauer', 4), ('Walter Crane', 6), ('Harry Clarke', 4),
    ('Elihu Vedder', 6), ('Albert Pinkham Ryder', 6), ('John Martin', 5), ('Thomas Cole', 5), ('Howard Pyle', 5), ('N. C. Wyeth', 4),
    ('Tsukioka Yoshitoshi', 12), ('Ohara Koson', 8), ('Utagawa Kunisada', 6), ('Franz von Stuck', 5), ('Carlos Schwabe', 4),
    ('Jean Delville', 4), ('Léon Spilliaert', 5), ('Félicien Rops', 4), ('Eugène Grasset', 4), ('Théophile Steinlen', 4),
    ('Henri Rivière', 5), ('Claude Monet', 5), ('Paul Signac', 4), ('Eugène Delacroix', 5), ('Théodore Géricault', 3),
    ('Winsor McCay', 4), ('Jessie Willcox Smith', 4), ('Louis Rhead', 3), ('Winslow Homer', 4), ('Katsushika Hokusai', 6),
]
BAD_WORDS = re.compile(r'portrait|self-|bust of|head of|study|studies|sketch|nude|academ|fragment|coin|medal|vase|plate \d|bowl|chair|dress|textile|manuscript page|letter|invoice|title page|cover|frontispiece|table of|label|map of|sketchbook|book of|album|design for|pattern|wallpaper|bookplate|panel|box|door|frame|monogram|alphabet|calligraph|specimen|advertis|menu|program|invitation|card for|fan', re.I)
GOOD_CLASS = re.compile(r'print|drawing|painting|woodblock|watercolor|pastel|illustrat|gouache|tempera|miniature', re.I)
def title_key(t):
    return ' '.join(re.sub(r'[^a-z0-9 ]', ' ', t.lower()).split()[:3])


def fetch(url, retries=3):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read()
        except Exception as e:
            if i == retries - 1: raise
            time.sleep(2 + 2 * i)


def jget(url):
    return json.loads(fetch(url).decode('utf-8'))


def met_search(artist):
    """Objets du Met avec image, domaine public, dont l'artiste correspond."""
    out = []
    try:
        ids = jget('https://collectionapi.metmuseum.org/public/collection/v1/search?' + urllib.parse.urlencode({'q': artist, 'hasImages': 'true', 'artistOrCulture': 'true'})).get('objectIDs') or []
    except Exception as e:
        print('  Met recherche KO', artist, e); return out
    key = artist.split()[-1].lower()
    for oid in ids[:80]:
        try:
            o = jget(f'https://collectionapi.metmuseum.org/public/collection/v1/objects/{oid}')
        except Exception:
            continue
        time.sleep(0.15)
        if not o.get('isPublicDomain') or not o.get('primaryImageSmall'): continue
        if key not in (o.get('artistDisplayName') or '').lower(): continue
        if not GOOD_CLASS.search((o.get('classification') or '') + ' ' + (o.get('objectName') or '')): continue
        t = o.get('title') or ''
        if BAD_WORDS.search(t): continue
        out.append({'id': 'met' + str(oid), 'src': 'met', 'url': o['primaryImageSmall'], 'title': t, 'artist': o.get('artistDisplayName') or artist, 'date': o.get('objectDate') or '', 'credit': 'The Metropolitan Museum of Art, domaine public'})
    return out


def cma_search(artist):
    out = []
    try:
        d = jget('https://openaccess-api.clevelandart.org/api/artworks/?' + urllib.parse.urlencode({'artists': artist.split()[-1], 'cc0': '1', 'has_image': '1', 'limit': 80}))
    except Exception as e:
        print('  CMA recherche KO', artist, e); return out
    key = artist.split()[-1].lower()
    for a in d.get('data', []):
        cre = ', '.join(c.get('description', '') for c in a.get('creators', []))
        if key not in cre.lower(): continue
        if not GOOD_CLASS.search(str(a.get('type') or '') + ' ' + str(a.get('technique') or '')): continue
        t = a.get('title') or ''
        if BAD_WORDS.search(t): continue
        web = (a.get('images') or {}).get('web') or {}
        if not web.get('url'): continue
        out.append({'id': 'cma' + str(a['id']), 'src': 'cma', 'url': web['url'], 'title': t, 'artist': cre.split(' (')[0] or artist, 'date': a.get('creation_date') or '', 'credit': 'Cleveland Museum of Art, CC0'})
    return out


def save_image(card):
    raw = fetch(card['url'])
    im = Image.open(io.BytesIO(raw)).convert('RGB')
    w, h = im.size
    if min(w, h) < 300: return None                      # trop petit pour un écran
    if max(w, h) / min(w, h) > 2.6: return None          # bandeaux et rouleaux : illisibles en carte
    im.thumbnail((SIDE, SIDE))
    name = card['id'] + '.jpg'
    im.save(os.path.join(DIR, name), 'JPEG', quality=80, optimize=True, progressive=True)
    return name


def main():
    cards = json.load(open(DST, encoding='utf-8')) if os.path.exists(DST) else []
    have = {c['id'] for c in cards}
    rejected = set(json.load(open(os.path.join(HERE, 'mirage-rejected.json'), encoding='utf-8'))) if os.path.exists(os.path.join(HERE, 'mirage-rejected.json')) else set()
    have |= rejected                                      # les cartes écartées à la revue ne reviennent pas
    per_artist = {}
    for c in cards: per_artist[c['artist']] = per_artist.get(c['artist'], 0) + 1
    for artist, quota in ARTISTS:
        if len(cards) >= MAX: break
        got = sum(n for a, n in per_artist.items() if artist.split()[-1].lower() in a.lower())
        if got >= quota: continue
        found = cma_search(artist) + met_search(artist)
        seen_titles = {title_key(c['title']) for c in cards}
        for card in found:
            if got >= quota or len(cards) >= MAX: break
            if card['id'] in have: continue
            tk = title_key(card['title'])
            if tk in seen_titles: continue                # séries : une seule planche par titre
            try:
                name = save_image(card)
            except Exception as e:
                print('  image KO', card['id'], e); continue
            if not name: continue
            seen_titles.add(tk)
            cards.append({'id': card['id'], 'file': name, 'title': card['title'], 'artist': card['artist'], 'date': card['date'], 'credit': card['credit']})
            have.add(card['id']); got += 1
            per_artist[card['artist']] = per_artist.get(card['artist'], 0) + 1
        print(f'{artist:28} {got:3}/{quota}   total {len(cards)}')
        json.dump(cards, open(DST, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    size = sum(os.path.getsize(os.path.join(DIR, c['file'])) for c in cards) / 1e6
    print(f'\n{len(cards)} cartes, {size:.1f} Mo')


if __name__ == '__main__':
    main()
