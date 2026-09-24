"""Cartes du jeu des mèmes : modèles d'images et de GIF de la bibliothèque publique d'Imgflip.
On ne copie rien : memes.json ne garde que l'identifiant, le nom et l'adresse ; les téléphones
chargent l'image (ou la vidéo muette en boucle, pour les GIF) directement chez Imgflip.

Sources : l'API publique get_memes (100 modèles les plus utilisés), puis les pages publiques de
modèles (memetemplates, gif-templates). Chaque adresse est vérifiée avant d'être gardée.
Usage : python build_memes.py [--pages 6] [--gifpages 5]"""
import json, os, re, sys, time, html as htmllib, urllib.request, concurrent.futures as cf

HERE = os.path.dirname(os.path.abspath(__file__))
DST = os.path.join(HERE, 'memes.json')
UA = {'User-Agent': 'Mozilla/5.0 (boite-a-jeux, jeu entre amis)'}
arg = lambda k, d: int(sys.argv[sys.argv.index(k) + 1]) if k in sys.argv else d
PAGES, GIFPAGES = arg('--pages', 6), arg('--gifpages', 5)


def get(url, head=False):
    req = urllib.request.Request(url, headers=UA, method='HEAD' if head else 'GET')
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status, (b'' if head else r.read()), r.headers.get('Content-Type', '')


def scrape(path, animated):
    out = []
    for page in range(1, (GIFPAGES if animated else PAGES) + 1):
        try:
            _, html, _ = get(f'https://imgflip.com/{path}?page={page}')
        except Exception as e:
            print('  page KO', path, page, e); continue
        html = html.decode('utf-8', 'replace')
        for m in re.finditer(r'<div class="mt-box">.*?<h3 class="mt-title">\s*<a[^>]*>([^<]+)</a>.*?src="//i\.imgflip\.com/\d/([0-9a-z]+)\.jpg"', html, re.S):
            name, key = htmllib.unescape(m.group(1).strip()), m.group(2)
            out.append({'id': key, 'name': name, 'kind': 'gif' if animated else 'img',
                        'url': f'https://i.imgflip.com/{key}.{"mp4" if animated else "jpg"}',
                        'thumb': f'https://i.imgflip.com/4/{key}.jpg'})
        print(f'{path} page {page} : {len(out)}')
        time.sleep(1.0)
    return out


def main():
    cards = {}
    try:
        _, body, _ = get('https://api.imgflip.com/get_memes')
        for m in json.loads(body)['data']['memes']:
            key = m['url'].rsplit('/', 1)[1].split('.')[0]
            cards[key] = {'id': key, 'name': m['name'], 'kind': 'img', 'url': m['url'], 'thumb': f'https://i.imgflip.com/4/{key}.jpg'}
    except Exception as e:
        print('API KO', e)
    print('API :', len(cards))
    for c in scrape('memetemplates', False) + scrape('gif-templates', True):
        cards.setdefault(c['id'], c)

    def ok(c):
        try:
            st, _, ct = get(c['url'], head=True)
            return st == 200 and (ct.startswith('image/') or ct.startswith('video/'))
        except Exception:
            return False
    with cf.ThreadPoolExecutor(8) as ex:
        keep = [c for c, good in zip(cards.values(), ex.map(ok, cards.values())) if good]
    bad = re.compile(r'9/11|hitler|nazi|isis|terror|nigg|suicide|holocaust|porn|nsfw|rape|shooting|gun to|kkk|pedo|slave', re.I)
    keep = [c for c in keep if not bad.search(c['name'])]           # quelques modèles déplacés en soirée
    json.dump(keep, open(DST, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(f"\n{len(keep)} cartes gardées ({sum(c['kind'] == 'gif' for c in keep)} GIF) sur {len(cards)}")


if __name__ == '__main__':
    main()
