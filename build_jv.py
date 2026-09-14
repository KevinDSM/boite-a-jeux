# -*- coding: utf-8 -*-
"""Construit songs-jv.json depuis playlists-jv.txt via l'API iTunes Search.

Format d'une ligne :  Nom du jeu | termes de recherche iTunes
Les rubriques « # ... » deviennent les familles proposées dans le salon.

La bonne réponse du jeu est le NOM DU JEU, pas le titre du morceau : beaucoup de
musiques Nintendo ou Sega n'existent sur iTunes que via des reprises orchestrales,
c'est la mélodie qui compte.
"""
import json, os, re, sys, time, urllib.parse, urllib.request

sys.stdout.reconfigure(encoding="utf-8")
SRC = sys.argv[1] if len(sys.argv) > 1 else "playlists-jv.txt"
DST = sys.argv[2] if len(sys.argv) > 2 else "songs-jv.json"

# arrangements qui déforment trop la mélodie : on les évite si on a mieux
BAD = re.compile(r"lo-?fi|8[\s-]?bit|chiptune|piano only|solo piano|guitar|metal|karaok|lullab|"
                 r"sleep|study|meditat|relax|jazz|dubstep|nightcore|speed ?up|slowed", re.I)
GOOD = re.compile(r"original (game )?(soundtrack|score)|\bost\b|video game soundtrack|opening|ending|anime|générique|generique|theme song", re.I)

def norm(t):
    t = t.lower().translate(str.maketrans("éèêëàâäçùûüôöîï", "eeeeaaacuuuooii"))
    return re.sub(r"[^a-z0-9]+", " ", t).strip()

def words(t):
    stop = {"the", "of", "a", "de", "la", "le", "les", "and", "to", "ii", "iii", "vii", "x", "2", "3"}
    return [w for w in norm(t).split() if w not in stop and len(w) > 2]

def fetch(term, limit=12):
    u = "https://itunes.apple.com/search?" + urllib.parse.urlencode(
        {"term": term, "entity": "song", "limit": limit, "country": "FR"})
    for i in range(3):
        try:
            return [r for r in json.load(urllib.request.urlopen(u, timeout=20))["results"] if r.get("previewUrl")]
        except Exception as e:
            print("   (retry", i + 1, type(e).__name__, getattr(e, "code", ""), ")")
            time.sleep(45 if getattr(e, "code", 0) == 403 else 6)
    return []

def pick(game, results, query=""):
    """Choisit le résultat le plus fidèle au jeu."""
    gw = words(game)
    best, best_score = None, -99
    for r in results:
        coll = r.get("collectionName", "") or ""
        hay = norm(coll + " " + r["trackName"] + " " + r["artistName"])
        score = 0
        hits = sum(1 for w in gw if w in hay)
        score += 3 * hits / max(1, len(gw))
        if GOOD.search(coll): score += 3
        if BAD.search(coll + " " + r["trackName"]): score -= 4
        if norm(game) in hay: score += 2
        aw = [w for w in norm(r["artistName"]).split() if len(w) > 2][:2]
        if aw and all(w in norm(query) for w in aw): score += 4   # artiste attendu : l'original plutot qu'une reprise
        if score > best_score: best, best_score = r, score
    return best

cache = {}
if os.path.exists(DST):
    for x in json.load(open(DST, encoding="utf-8")):
        if x.get("_q"): cache[x["_q"]] = x

if os.path.exists(DST + ".cache.json"):   # reprise après une coupure
    for x in json.load(open(DST + ".cache.json", encoding="utf-8")):
        if x.get("_q"): cache[x["_q"]] = x

out, seen, cat = [], set(), None
for line in open(SRC, encoding="utf-8"):
    line = line.strip()
    if not line: continue
    if line.startswith("#"): cat = line[1:].strip(); continue
    game, _, query = line.partition("|")
    game, query = game.strip(), query.strip()
    if line in cache:
        s = cache[line]
    else:
        r = pick(game, fetch(query), query)
        if not r:
            print("  KO  ", game); continue
        s = {"game": game, "artist": r["artistName"], "title": re.sub(r"\s*[\(\[].*", "", r["trackName"]).strip(),
             "preview": r["previewUrl"], "art": r["artworkUrl100"].replace("100x100", "300x300"), "_q": line}
        time.sleep(3)
        cache[line] = s
        json.dump(list(cache.values()), open(DST + ".cache.json", "w", encoding="utf-8"), ensure_ascii=False)
    if norm(s["game"]) in seen: continue
    seen.add(norm(s["game"]))
    s["cat"] = cat
    out.append(s)
    print(f'{cat[:14]:16} {s["game"][:30]:32} {s["artist"][:24]:26} {s["title"][:30]}')

json.dump(out, open(DST, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(len(out), "jeux")
