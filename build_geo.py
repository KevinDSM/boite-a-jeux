# -*- coding: utf-8 -*-
"""Prépare la liste de lieux du jeu Boussole à partir de Mapillary.

    python build_geo.py --check                  vérifie le jeton sur une vraie photo
    python build_geo.py                          construit les trois cartes
    python build_geo.py --maps france --target 200

Le jeton client est lu dans geo-config.js (window.MAPILLARY_TOKEN). Il n'est jamais affiché.

Méthode : la recherche d'images de l'API est lente et revient souvent vide, on passe donc
par les tuiles de couverture. On tire un point au hasard dans une zone terrestre pondérée,
on lit la tuile de niveau 10 qui le contient (un carré d'environ 25 à 40 km), elle liste
chaque parcours photo avec son indicateur 360° et une photo représentative. On garde
quelques parcours 360° récents, on demande la position exacte de leur photo, et on impose
un écart minimal entre deux lieux pour que la carte reste variée.
"""
import argparse
import json
import math
import random
import re
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

TILE_Z = 10
TILE_URL = "https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token={tok}"
ENTITY_URL = "https://graph.mapillary.com/{id}?fields=id,computed_geometry,is_pano,captured_at,quality_score"
MIN_CAPTURED_MS = 1451606400000      # 1er janvier 2016
PER_TILE = 4                         # parcours 360° essayés par tuile
UA = "boite-a-jeux/boussole (jeu entre amis)"

# (lon min, lat min, lon max, lat max, poids)
FRANCE = [
    (-4.5, 47.0, -0.8, 48.7, 1.2),   # Bretagne, Pays de la Loire
    (-1.2, 48.3, 3.5, 50.0, 2.5),    # Normandie, Île-de-France, Hauts-de-France
    (-0.8, 46.0, 3.5, 48.3, 2.0),    # Centre
    (-1.2, 43.4, 1.8, 46.0, 1.8),    # Nouvelle-Aquitaine
    (0.0, 42.95, 3.5, 44.9, 1.5),    # Occitanie
    (2.5, 45.0, 5.8, 48.0, 1.5),     # Auvergne, Bourgogne
    (4.0, 44.2, 6.8, 46.2, 1.8),     # Rhône, Alpes
    (4.0, 43.2, 6.9, 44.2, 1.2),     # Provence
    (4.0, 48.0, 7.4, 48.95, 1.0),    # Grand Est
    (8.6, 41.5, 9.5, 42.9, 0.3),     # Corse
]
EUROPE = [
    (-9.0, 37.0, 3.0, 43.5, 3.0),    # Péninsule ibérique
    (-2.0, 43.5, 7.5, 50.0, 3.0),    # France
    (-5.5, 50.3, 1.8, 55.5, 2.5),    # Grande-Bretagne
    (-10.0, 51.6, -6.0, 55.2, 0.8),  # Irlande
    (3.0, 50.0, 14.0, 54.5, 3.0),    # Benelux, nord de l'Allemagne
    (6.0, 46.3, 16.5, 50.0, 3.0),    # sud de l'Allemagne, Suisse, Autriche
    (7.0, 37.5, 18.5, 46.5, 2.5),    # Italie
    (13.5, 40.0, 23.0, 46.5, 1.5),   # Balkans
    (20.0, 35.0, 26.5, 41.5, 1.0),   # Grèce
    (12.0, 48.5, 24.0, 54.8, 2.5),   # Pologne, Tchéquie
    (21.0, 53.9, 28.0, 59.7, 1.0),   # Pays baltes
    (5.0, 55.3, 19.0, 62.0, 2.0),    # Scandinavie du sud
    (21.0, 60.0, 30.0, 65.0, 1.0),   # Finlande
    (16.0, 41.5, 29.5, 48.5, 1.5),   # Hongrie, Roumanie, Bulgarie
]
MONDE = [(a, b, c, d, w * 0.5) for a, b, c, d, w in EUROPE] + [
    (-90, 30, -70, 45, 3.0),         # États-Unis, est
    (-105, 30, -90, 48, 2.0),        # États-Unis, centre
    (-124, 32, -105, 48, 2.5),       # États-Unis, ouest
    (-125, 43, -60, 52, 1.5),        # Canada, sud
    (-110, 16, -87, 31, 1.5),        # Mexique
    (-92, 8, -77, 17, 0.4),          # Amérique centrale
    (-78, 1, -67, 11, 0.8),          # Colombie
    (-81, -18, -69, 1, 0.5),         # Pérou, Équateur
    (-55, -30, -35, -10, 2.0),       # Brésil
    (-73, -45, -57, -22, 1.5),       # Argentine, Chili
    (18, -34.5, 32, -22, 1.2),       # Afrique du Sud
    (29, -5, 41, 4, 0.4),            # Kenya, Ouganda
    (-10, 29, 11, 37, 0.6),          # Maroc, Algérie du nord, Tunisie
    (26, 36, 45, 42, 1.0),           # Turquie
    (34, 29, 39, 33.5, 0.3),         # Israël, Jordanie
    (30, 50, 60, 60, 1.2),           # Russie de l'ouest
    (50, 40, 85, 55, 0.4),           # Kazakhstan
    (68, 8, 90, 32, 1.2),            # Inde
    (97, 1, 106, 21, 1.0),           # Thaïlande, Malaisie
    (105, -9, 116, -5.5, 0.6),       # Java, Bali
    (119, 5, 127, 19, 0.5),          # Philippines
    (129, 31, 146, 45, 2.0),         # Japon
    (126, 34, 130, 38.5, 0.8),       # Corée du Sud
    (120, 22, 122, 25.3, 0.6),       # Taïwan
    (140, -39, 154, -17, 1.5),       # Australie, est
    (114, -35.5, 140, -30, 0.8),     # Australie, sud et ouest
    (166, -47, 179, -34, 0.8),       # Nouvelle-Zélande
]

MAPS = {
    "france": {"zones": FRANCE, "target": 300, "spacing_km": 12},
    "europe": {"zones": EUROPE, "target": 400, "spacing_km": 50},
    "monde": {"zones": MONDE, "target": 500, "spacing_km": 120},
}


# ------------------------------------------------------------------ jeton
def read_token():
    try:
        src = open("geo-config.js", encoding="utf-8").read()
    except FileNotFoundError:
        sys.exit("geo-config.js introuvable : lance le script depuis le dossier du projet.")
    m = re.search(r"MAPILLARY_TOKEN\s*=\s*['\"]([^'\"]*)['\"]", src)
    token = (m.group(1) if m else "").strip()
    if not token:
        sys.exit("Aucun jeton dans geo-config.js : colle ton jeton client Mapillary entre les guillemets.")
    return token


# ------------------------------------------------------------------ tuiles vectorielles (lecture minimale du format)
def _varint(b, i):
    r = s = 0
    while True:
        c = b[i]; i += 1; r |= (c & 0x7F) << s; s += 7
        if c < 0x80:
            return r, i


def _fields(b):
    i = 0
    while i < len(b):
        key, i = _varint(b, i)
        f, wt = key >> 3, key & 7
        if wt == 0:
            v, i = _varint(b, i)
        elif wt == 1:
            v = b[i:i + 8]; i += 8
        elif wt == 5:
            v = b[i:i + 4]; i += 4
        elif wt == 2:
            n, i = _varint(b, i); v = b[i:i + n]; i += n
        else:
            raise ValueError(f"type de champ inattendu {wt}")
        yield f, v


def _packed(b):
    i, out = 0, []
    while i < len(b):
        v, i = _varint(b, i); out.append(v)
    return out


def _zigzag(n):
    return (n >> 1) ^ -(n & 1)


def _value(b):
    for f, v in _fields(b):
        if f == 1: return v.decode("utf-8", "replace")
        if f == 2: return struct.unpack("<f", v)[0]
        if f == 3: return struct.unpack("<d", v)[0]
        if f in (4, 5): return v
        if f == 6: return _zigzag(v)
        if f == 7: return bool(v)
    return None


def tile_sequences(data):
    """Propriétés de chaque parcours de la couche « sequence » d'une tuile."""
    for f, layer in _fields(data):
        if f != 3:
            continue
        name, keys, vals, feats = None, [], [], []
        for lf, lv in _fields(layer):
            if lf == 1: name = lv.decode()
            elif lf == 3: keys.append(lv.decode())
            elif lf == 4: vals.append(_value(lv))
            elif lf == 2: feats.append(lv)
        if name != "sequence":
            continue
        for fb in feats:
            tags = []
            for ff, fv in _fields(fb):
                if ff == 2:
                    tags = _packed(fv)
            yield {keys[tags[k]]: vals[tags[k + 1]] for k in range(0, len(tags) - 1, 2)}


def tile_of(lat, lon, z=TILE_Z):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


# ------------------------------------------------------------------ réseau
def fetch(url, headers=None, tries=4, timeout=40):
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                raise SystemExit(f"Jeton refusé par Mapillary (HTTP {e.code}). Vérifie que c'est bien le « Client Token ».")
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(1.5 * (attempt + 1)); continue
            return None                      # 400 : photo supprimée ou inaccessible
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(1.5 * (attempt + 1))
    return None


def image_position(token, image_id):
    body = fetch(ENTITY_URL.format(id=image_id), {"Authorization": "OAuth " + token}, tries=3, timeout=25)
    if not body:
        return None
    d = json.loads(body)
    coords = (d.get("computed_geometry") or {}).get("coordinates")
    if not coords or not d.get("is_pano"):
        return None
    return str(d["id"]), round(coords[1], 5), round(coords[0], 5)


def km(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(a))


def random_point(zones):
    total = sum(z[4] for z in zones)
    r = random.uniform(0, total)
    for lo1, la1, lo2, la2, w in zones:
        r -= w
        if r <= 0:
            return random.uniform(la1, la2), random.uniform(lo1, lo2)
    lo1, la1, lo2, la2, _ = zones[-1]
    return random.uniform(la1, la2), random.uniform(lo1, lo2)


# ------------------------------------------------------------------ construction
def candidates_from_tile(token, zones, seen_tiles):
    """Tire une tuile jamais lue dans les zones, renvoie quelques photos de parcours 360°."""
    for _ in range(20):
        lat, lon = random_point(zones)
        key = tile_of(lat, lon)
        if key not in seen_tiles:
            break
    else:
        return []
    seen_tiles.add(key)
    data = fetch(TILE_URL.format(z=TILE_Z, x=key[0], y=key[1], tok=token))
    if not data:
        return []
    seqs = [s for s in tile_sequences(data)
            if s.get("is_pano") and s.get("image_id") and (s.get("captured_at") or 0) >= MIN_CAPTURED_MS]
    random.shuffle(seqs)
    seqs.sort(key=lambda s: -(s.get("quality_score") or 0.5))
    return [str(s["image_id"]) for s in seqs[:PER_TILE]]


def build_map(token, name, cfg, target, workers=8):
    kept, seen_tiles, tiles, lookups, t0 = [], set(), 0, 0, time.time()
    spacing = cfg["spacing_km"]
    max_tiles = max(400, target * 12)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        while len(kept) < target and tiles < max_tiles:
            batch = list(pool.map(lambda _: candidates_from_tile(token, cfg["zones"], seen_tiles), range(workers)))
            tiles += workers
            ids = [i for group in batch for i in group]
            lookups += len(ids)
            for pos in pool.map(lambda i: image_position(token, i), ids):
                if not pos:
                    continue
                iid, lat, lon = pos
                if any(km(lat, lon, k[1], k[2]) < spacing for k in kept):
                    continue
                kept.append([iid, lat, lon])
                if len(kept) >= target:
                    break
            if tiles % (workers * 5) == 0 or len(kept) >= target:
                print(f"  {name} : {len(kept)}/{target} lieux, {tiles} tuiles, {lookups} photos vérifiées, {time.time() - t0:.0f} s", flush=True)
    return kept


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--maps", default="france,europe,monde")
    ap.add_argument("--target", type=int, default=0, help="nombre de lieux par carte (défaut : réglage de chaque carte)")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    token = read_token()

    if args.check:
        x, y = tile_of(48.8566, 2.3522)
        data = fetch(TILE_URL.format(z=TILE_Z, x=x, y=y, tok=token))
        seqs = [s for s in tile_sequences(data or b"") if s.get("is_pano") and s.get("image_id")]
        if not seqs:
            sys.exit("Tuile de Paris vide : jeton ou réseau à vérifier.")
        pos = next((p for p in (image_position(token, str(s["image_id"])) for s in seqs[:10]) if p), None)
        if not pos:
            sys.exit("Les tuiles répondent, mais les photos sont refusées : ce n'est probablement pas le « Client Token ».")
        print(f"Jeton accepté : {len(seqs)} parcours 360° autour de Paris, photo {pos[0]} lue à {pos[1]}, {pos[2]}.")
        return

    try:
        out = json.load(open("geo-places.json", encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        out = {"v": 1, "maps": {}}
    for name in [m.strip() for m in args.maps.split(",") if m.strip()]:
        cfg = MAPS[name]
        print(f"Carte {name}…", flush=True)
        out["maps"][name] = build_map(token, name, cfg, args.target or cfg["target"])
        json.dump(out, open("geo-places.json", "w", encoding="utf-8"), separators=(",", ":"))
    print("Terminé :", ", ".join(f"{k} {len(v)}" for k, v in out["maps"].items()))


if __name__ == "__main__":
    main()
