"""Récolte des questions de quizzapi.fr (API française gratuite et participative, QCM à 4 réponses)
dans quiz.json, pour que Camembert fonctionne sans réseau extérieur pendant une soirée.

L'API renvoie des tirages aléatoires : on l'interroge par catégorie et par difficulté jusqu'à ne plus
rien découvrir. Les six couleurs du plateau regroupent les catégories de l'API :
  geo   Géographie           <- geographie
  fun   Divertissement       <- tv_cinema, musique, jeux_videos
  hist  Histoire             <- histoire, actu_politique
  art   Arts & Littérature   <- art_litterature
  sci   Sciences & Nature    <- science
  sport Sports & Loisirs     <- sport
  culture_generale sert aux questions finales, au centre du plateau.

Usage : python build_quiz.py            (reprend quiz.json existant, ajoute les nouvelles)
"""
import json, os, sys, time, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
DST = os.path.join(HERE, 'quiz.json')
API = 'https://quizzapi.fr/api/v2/quiz'
MAP = {
    'geographie': 'geo', 'tv_cinema': 'fun', 'musique': 'fun', 'jeux_videos': 'fun',
    'histoire': 'hist', 'actu_politique': 'hist', 'art_litterature': 'art', 'science': 'sci',
    'sport': 'sport', 'culture_generale': 'final',
}
DIFF = {'facile': 1, 'normal': 2, 'difficile': 3}


def fetch(params):
    url = API + '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'User-Agent': 'boite-a-jeux/1.0 (jeu entre amis, hors ligne)'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r).get('quizzes', [])


def clean(s):
    return ' '.join(str(s or '').replace(' ', ' ').split())


def main():
    seen = {}
    if os.path.exists(DST):
        for q in json.load(open(DST, encoding='utf-8')):
            seen[q['id']] = q
    start = len(seen)
    for slug, cat in MAP.items():
        for diff in list(DIFF) + [None]:
            quiet = 0
            while quiet < 3:
                params = {'category': slug, 'limit': 200}
                if diff: params['difficulty'] = diff
                try:
                    got = fetch(params)
                except Exception as e:
                    print('  erreur', slug, diff, e); time.sleep(3); quiet += 1; continue
                new = 0
                for q in got:
                    if q['id'] in seen or not q.get('answer') or len(q.get('badAnswers') or []) < 3:
                        continue
                    seen[q['id']] = {
                        'id': q['id'], 'cat': cat, 'src': slug, 'd': DIFF.get(q.get('difficulty'), 2),
                        'q': clean(q['question']), 'a': clean(q['answer']), 'bad': [clean(b) for b in q['badAnswers'][:3]],
                    }
                    new += 1
                quiet = quiet + 1 if new == 0 else 0
                print(f'{slug:17} {diff or "toutes":9} +{new:4}  total {len(seen)}')
                time.sleep(0.4)
    out = sorted(seen.values(), key=lambda q: (q['cat'], q['src'], q['d'], q['q']))
    json.dump(out, open(DST, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    from collections import Counter
    print('\nnouvelles :', len(seen) - start, '| total :', len(seen))
    print('par couleur :', dict(Counter(q['cat'] for q in out)))
    print('par difficulté :', dict(Counter(q['d'] for q in out)))


if __name__ == '__main__':
    main()
