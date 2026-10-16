"""Grandes Lignes : la carte de France (villes, lignes, destinations), écrite pour nous.
Projection simple (longitude resserrée à 46,4°), une unité = 1/100 de degré de latitude ; viewBox 0 0 1035 1010.
Sortie : tools/rail/carte.json (pour Blender et la maquette) et rail-carte.js (pour le jeu).
Lancement : python tools/rail/carte.py"""
import json, math, os, heapq, itertools

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
K, LON0, LAT0, CL = 100, -5.2, 51.3, math.cos(math.radians(46.4))
P = lambda lon, lat: (round((lon - LON0) * CL * K, 1), round((LAT0 - lat) * K, 1))

# le contour, dans le sens des aiguilles d'une montre depuis Dunkerque
FRANCE = [(2.37,51.04),(1.85,50.95),(1.6,50.73),(1.62,50.37),(1.55,50.2),(1.38,50.07),(1.08,49.93),(0.6,49.86),(0.37,49.76),(0.1,49.49),
  (0.23,49.42),(-0.08,49.3),(-0.3,49.32),(-0.75,49.35),(-1.1,49.39),(-1.26,49.67),(-1.62,49.65),(-1.94,49.72),(-1.84,49.5),(-1.8,49.37),
  (-1.6,48.84),(-1.51,48.64),(-2.0,48.65),(-2.32,48.68),(-2.75,48.52),(-3.05,48.78),(-3.45,48.82),(-3.98,48.72),(-4.6,48.6),(-4.78,48.33),
  (-4.48,48.39),(-4.55,48.25),(-4.33,48.09),(-4.73,48.04),(-4.37,47.8),(-3.92,47.87),(-3.37,47.75),(-3.12,47.48),(-2.76,47.55),(-2.51,47.29),
  (-2.2,47.27),(-2.1,47.11),(-2.25,46.95),(-1.95,46.7),(-1.78,46.5),(-1.15,46.16),(-1.2,45.85),(-1.03,45.62),(-1.06,45.57),(-1.2,45.1),
  (-1.25,44.65),(-1.3,44.2),(-1.44,43.65),(-1.56,43.48),(-1.78,43.37),(-1.4,43.25),(-0.7,42.95),(0.0,42.7),(0.7,42.85),(1.45,42.6),
  (1.73,42.5),(2.1,42.42),(2.65,42.35),(3.17,42.44),(3.05,42.6),(3.05,42.9),(3.17,43.1),(3.5,43.28),(3.7,43.4),(3.95,43.53),(4.15,43.53),
  (4.43,43.45),(4.9,43.4),(5.35,43.3),(5.54,43.21),(5.93,43.1),(6.15,43.05),(6.65,43.27),(6.75,43.42),(7.0,43.55),(7.27,43.69),(7.5,43.78),
  (7.7,44.17),(6.98,44.25),(6.85,44.5),(7.0,44.8),(6.63,45.1),(7.13,45.25),(6.8,45.83),(7.04,45.93),(6.8,46.4),(6.22,46.31),(6.1,46.2),
  (5.97,46.45),(6.1,46.6),(6.43,46.92),(6.95,47.25),(6.95,47.45),(7.2,47.45),(7.58,47.58),(7.55,47.9),(7.65,48.3),(7.8,48.6),(8.0,48.8),
  (8.23,48.97),(7.6,49.07),(7.03,49.12),(6.73,49.17),(6.37,49.47),(5.82,49.55),(5.47,49.5),(4.85,49.79),(4.87,50.15),(4.2,49.96),
  (4.15,50.27),(3.7,50.31),(3.27,50.53),(2.9,50.7),(2.55,51.09)]
CORSE = [(9.4,43.0),(9.47,42.7),(9.55,42.1),(9.4,41.7),(9.25,41.37),(8.88,41.5),(8.72,41.9),(8.6,42.25),(8.7,42.55),(9.1,42.73),(9.35,43.0)]

# les villes : clé → (nom, longitude, latitude, côté de l'étiquette)
VILLES = {
  'lil': ('Lille', 3.06, 50.63, 'e'), 'cal': ('Calais', 1.85, 50.95, 'n'), 'ami': ('Amiens', 2.3, 49.9, 'e'),
  'rou': ('Rouen', 1.1, 49.44, 's'), 'hav': ('Le Havre', 0.1, 49.49, 'n'), 'cae': ('Caen', -0.37, 49.18, 's'),
  'che': ('Cherbourg', -1.62, 49.64, 'n'), 'bre': ('Brest', -4.49, 48.39, 'n'), 'ren': ('Rennes', -1.68, 48.11, 's'),
  'nan': ('Nantes', -1.55, 47.22, 'w'), 'lma': ('Le Mans', 0.2, 48.0, 'n'), 'tou': ('Tours', 0.69, 47.39, 's'),
  'orl': ('Orléans', 1.9, 47.9, 's'), 'par': ('Paris', 2.35, 48.86, 'n'), 'rei': ('Reims', 4.03, 49.26, 'n'),
  'met': ('Metz', 6.18, 49.12, 'n'), 'nac': ('Nancy', 6.18, 48.69, 'w'), 'str': ('Strasbourg', 7.75, 48.58, 'e'),
  'mul': ('Mulhouse', 7.34, 47.75, 'e'), 'bes': ('Besançon', 6.02, 47.24, 's'), 'dij': ('Dijon', 5.04, 47.32, 'w'),
  'bou': ('Bourges', 2.4, 47.08, 'e'), 'poi': ('Poitiers', 0.34, 46.58, 'e'), 'roc': ('La Rochelle', -1.15, 46.16, 'w'),
  'lim': ('Limoges', 1.26, 45.83, 'e'), 'cle': ('Clermont', 3.08, 45.78, 'e'), 'lyo': ('Lyon', 4.83, 45.76, 'e'),
  'cha': ('Chambéry', 5.92, 45.57, 'e'), 'gre': ('Grenoble', 5.72, 45.19, 'e'), 'val': ('Valence', 4.89, 44.93, 'w'),
  'avi': ('Avignon', 4.81, 43.95, 'n'), 'mar': ('Marseille', 5.37, 43.3, 's'), 'nic': ('Nice', 7.26, 43.7, 'n'),
  'mon': ('Montpellier', 3.88, 43.61, 's'), 'per': ('Perpignan', 2.9, 42.7, 'w'), 'tls': ('Toulouse', 1.44, 43.6, 'n'),
  'pau': ('Pau', -0.37, 43.3, 's'), 'bay': ('Bayonne', -1.47, 43.49, 'w'), 'bdx': ('Bordeaux', -0.58, 44.84, 'w'),
  'aja': ('Ajaccio', 8.74, 41.92, 'w'), 'bas': ('Bastia', 9.45, 42.7, 'n'),
}

# les lignes : a, b, [options] ; d = doublée (deux voies, à partir de 4 joueurs), t = tunnel, f<n> = ferry (n locomotives),
# L<n> = longueur imposée (sinon d'après la distance), g = grise (n'importe quelle couleur)
LIGNES = """
bre ren 4 ; bre nan 5 g ; che cae 2 ; che ren 3 g ; cae ren 3 ; cae lma 3 g ; cae hav 1 ; cae rou 2 ; hav rou 1 g
rou ami 2 ; rou par 2 d ; cal lil 2 ; cal ami 2 g ; ami lil 2 ; ami par 2 ; lil par 3 d ; lil rei 3 g ; par rei 2 d
rei met 3 ; met str 2 ; met nac 1 g ; nac str 2 ; rei nac 3 ; nac dij 3 g ; str mul 2 d ; mul bes 2 ; nac mul 3 t
par dij 4 d ; par orl 2 d ; par lma 3 ; ren lma 2 ; ren nan 2 g ; nan lma 3 ; nan tou 3 g ; nan roc 2 ; lma tou 1
tou orl 2 ; tou poi 1 g ; orl bou 1 ; tou bou 2 ; orl dij 4 g ; bou dij 3 ; bou cle 3 ; bou lim 3 ; poi lim 2
poi roc 2 g ; roc bdx 3 ; poi bdx 3 d ; lim cle 2 t ; lim bdx 3 g ; lim tls 4 ; bdx bay 3 ; bdx tls 3 d ; bay pau 1
pau tls 3 g ; tls per 3 t ; tls mon 3 ; tls cle 5 t ; per mon 2 g ; mon avi 1 ; mon cle 4 t ; avi mar 1 d ; mar nic 3
avi val 2 g ; val lyo 1 d ; val gre 1 ; gre cha 1 g ; cha lyo 2 ; lyo dij 3 d ; dij bes 1 ; bes lyo 3 g ; lyo cle 2 t
gre nic 5 t ; gre mar 4 t ; cha bes 4 t ; bou lyo 4 ; mar aja 4 f2 ; nic bas 3 f2 ; aja bas 2 t ; nic aja 4 f2
"""
COULEURS = ['rouge', 'bleu', 'jaune', 'vert', 'noir', 'blanc', 'orange', 'violet']


def lignes():
    out, rid = [], 0
    for chunk in LIGNES.replace('\n', ';').split(';'):
        w = chunk.split()
        if not w: continue
        a, b, n, opts = w[0], w[1], int(w[2]), w[3:]
        assert a in VILLES and b in VILLES, (a, b)
        ferry = next((int(o[1:]) for o in opts if o.startswith('f')), 0)
        base = dict(a=a, b=b, n=n, tunnel='t' in opts, ferry=ferry, gris='g' in opts)
        out.append(dict(base, id=rid, voie=0)); rid += 1
        if 'd' in opts: out.append(dict(base, id=rid, voie=1, gris=False)); rid += 1
    return out


def colorier(rs):
    """Équilibre les couleurs : chaque couleur à peu près autant de wagons ; jamais deux fois la même couleur
    autour d'une ville, ni sur les deux voies d'une ligne doublée."""
    total = {c: 0 for c in COULEURS}
    near = {k: set() for k in VILLES}
    for r in sorted(rs, key=lambda r: (-r['n'], r['id'])):
        if r['gris'] or r['ferry']: r['c'] = 'gris'; continue
        twin = next((o.get('c') for o in rs if o is not r and {o['a'], o['b']} == {r['a'], r['b']}), None)
        ok = [c for c in COULEURS if c != twin and c not in near[r['a']] and c not in near[r['b']]] or [c for c in COULEURS if c != twin]
        c = min(ok, key=lambda c: (total[c], COULEURS.index(c)))
        r['c'] = c; total[c] += r['n']; near[r['a']].add(c); near[r['b']].add(c)
    return total


def court(rs, a, b):
    g = {}
    for r in rs: g.setdefault(r['a'], []).append((r['b'], r['n'])); g.setdefault(r['b'], []).append((r['a'], r['n']))
    d, q = {a: 0}, [(0, a)]
    while q:
        x, u = heapq.heappop(q)
        if u == b: return x
        for v, w in g[u]:
            if x + w < d.get(v, 99): d[v] = x + w; heapq.heappush(q, (x + w, v))


# les destinations : (a, b) ; points = plus court chemin en wagons. Les longues (≥ 15) sont tirées à part.
BILLETS = """bre str ; bre nic ; lil per ; cal mar ; che nic ; str bay ; bre mar ; lil bay ; cal tls ; che lyo ; hav gre ; str per
par nic ; par mar ; par tls ; par bay ; par aja ; lil lyo ; lil bdx ; ren lyo ; nan str ; nan mar ; bdx str ; bdx nic ; tls str
che par ; bre par ; nan dij ; rou lyo ; cae tou ; lma bes ; orl mon ; tou gre ; poi cle ; roc lyo ; lim mar ; cle nic ; dij avi
mul gre ; met lyo ; rei dij ; ami orl ; cal rei ; ren bdx ; nan bdx ; bdx mon ; pau mar ; bay per ; tls avi ; mon bas ; mar bas
val nic ; cha mar ; lyo per ; bes nic ; str dij ; hav nan ; bou tls"""


def billets(rs):
    out = []
    for i, ch in enumerate(BILLETS.replace('\n', ';').split(';')):
        a, b = ch.split()
        p = court(rs, a, b)
        out.append(dict(id=i, a=a, b=b, p=p, long=p >= 15))
    return out


def main():
    rs = lignes(); tot = colorier(rs); bs = billets(rs)
    villes = {k: dict(nom=v[0], x=P(v[1], v[2])[0], y=P(v[1], v[2])[1], et=v[3]) for k, v in VILLES.items()}
    data = dict(vb=[1035, 1010], france=[P(*p) for p in FRANCE], corse=[P(*p) for p in CORSE], villes=villes, lignes=rs, billets=bs)
    json.dump(data, open(os.path.join(HERE, 'carte.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    # pour le jeu : un fichier de données chargé par le navigateur et emballé pour le serveur (server/build.py)
    js = dict(vb=data['vb'], france=data['france'], corse=data['corse'], villes=villes,
              lignes=[[r['id'], r['a'], r['b'], r['n'], r['c'], int(r['tunnel']), r['ferry'], r['voie']] for r in rs],
              billets=[[b['id'], b['a'], b['b'], b['p'], int(b['long'])] for b in bs])
    head = ('/* Grandes Lignes : la carte de France, écrite pour la Boîte à jeux. GÉNÉRÉ par python tools/rail/carte.py, ne pas modifier.\n'
            '   villes : clé → {nom, x, y, et (côté de l’étiquette)} ; lignes : [id, a, b, cases, couleur, tunnel, locomotives du ferry, voie (0 ou 1)] ;\n'
            '   billets : [id, a, b, points, long]. Coordonnées dans la viewBox 0 0 1035 1010 (celle de img/rail/plateau.webp). */\n')
    body = "'use strict';\nconst RAIL_CARTE = " + json.dumps(js, ensure_ascii=False, separators=(',', ':')) + ';\n' + "if (typeof module !== 'undefined') module.exports = RAIL_CARTE;\n"
    open(os.path.join(ROOT, 'rail-carte.js'), 'w', encoding='utf-8', newline='\n').write(head + body)
    print(len(villes), 'villes ;', len(rs), 'voies ;', sum(r['n'] for r in rs), 'cases ;', len(bs), 'billets', sum(b['long'] for b in bs), 'longs')
    print('couleurs :', tot)
    print('billets :', sorted((b['p'], b['a'] + '-' + b['b']) for b in bs))
    # longueurs « naturelles » pour vérifier la saisie
    for r in rs:
        (x1, y1), (x2, y2) = [(villes[k]['x'], villes[k]['y']) for k in (r['a'], r['b'])]
        d = math.hypot(x2 - x1, y2 - y1) / 62
        if abs(d - r['n']) > 1.3 and r['voie'] == 0: print('  longueur à revoir ?', r['a'], r['b'], r['n'], round(d, 1))


if __name__ == '__main__':
    main()
