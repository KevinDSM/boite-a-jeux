"""Assemble server/src/runtime.js : le cœur du salon (core.js), les règles (engines/) et les données.

Le serveur ne peut pas évaluer de code à la volée : tout est donc emballé dans une fonction
createRuntime(io), appelée une fois par salon. Chaque salon a ainsi ses propres variables (net, caches,
historiques), même quand plusieurs salons partagent la même machine chez Cloudflare.
Usage : python server/build.py   (lancé aussi par deploy.py)
"""
import io, json, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'server', 'src', 'runtime.js')

# ordre de chargement du navigateur : le cœur, les données des cartes, puis les règles
SOURCES = ['core.js', 'limite-cartes.js', 'diapason-cartes.js', 'duel-cartes.js', 'nomcode-mots.js'] + \
          ['engines/' + g + '.js' for g in ['sablier', 'undercover', 'geo', 'chromo', 'kems', 'mirage', 'douze', 'petitbac',
                                             'loupgarou', 'naufrages', 'memes', 'limite', 'solitaire', 'poker', 'bataille',
                                             'diapason', 'duel', 'teldes', 'nomcode']]
DATA = ['songs.json', 'songs-eclair.json', 'songs-jv.json', 'songs-anime.json', 'memes.json', 'mirage.json', 'geo-places.json']
DATA += ['decks/index.json'] + ['decks/%s.json' % d['id'] for d in json.load(io.open(os.path.join(ROOT, 'decks', 'index.json'), encoding='utf-8'))]
EXPORTS = ['net', 'ASSET_V', 'GAMES', 'Game', 'hostTick', 'handleClientMessage', 'sabOffline', 'loadSongs', 'loadSongsE', 'loadSongsJV',
           'loadSongsAnime', 'loadDecks', 'Memes', 'Mirage', 'Geo']

def src(path):
    s = io.open(os.path.join(ROOT, path), encoding='utf-8').read()
    return re.sub(r"^'use strict';\s*$", '', s, flags=re.M)

data = {p: json.load(io.open(os.path.join(ROOT, p), encoding='utf-8')) for p in DATA}
parts = [
    '// Généré par server/build.py à partir de core.js, des fichiers de cartes et de engines/. Ne pas modifier.',
    '',
    'const DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';',
    '',
    'export function createRuntime(io) {',
    '  const { broadcast, sendAll, toast, sabOnMessage } = io;',
    '  // le navigateur a localStorage et fetch ; ici, une mémoire propre au salon et les données embarquées',
    '  const mem = new Map();',
    '  const localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); } };',
    '  const fetch = async url => {',
    "    const path = String(url).split('?')[0].replace(/^\\.?\\//, '');",
    '    if (!(path in DATA)) return { ok: false, status: 404, json: async () => { throw new Error(path + " absent"); } };',
    '    return { ok: true, status: 200, json: async () => structuredClone(DATA[path]) };',
    '  };',
]
for p in SOURCES: parts += ['', '  // ---------------------------------------------------------------- ' + p, src(p)]
parts += ['', '  return { ' + ', '.join(EXPORTS) + ' };', '}', '']
os.makedirs(os.path.dirname(OUT), exist_ok=True)
io.open(OUT, 'w', encoding='utf-8', newline='\n').write('\n'.join(parts))
print('runtime.js : %d Ko (%d sources, %d fichiers de données)' % (os.path.getsize(OUT) // 1024, len(SOURCES), len(DATA)))
