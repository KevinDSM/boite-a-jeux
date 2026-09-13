# -*- coding: utf-8 -*-
"""Prépare la liste de lieux du jeu Boussole à partir de l'API Mapillary.

    python build_geo.py --check                  vérifie le jeton, sans rien écrire
    python build_geo.py                          construit les trois cartes
    python build_geo.py --maps france --target 200

Le jeton est lu dans geo-config.js (window.MAPILLARY_TOKEN). Il n'est jamais affiché.

Méthode : on tire des points au hasard dans des zones terrestres pondérées, on demande à
Mapillary les panoramas 360° dans un petit carré autour (0,09° de côté, sous la limite de
0,01 degré carré), on garde le meilleur, et on impose un écart minimal entre deux lieux
pour que la carte reste variée. La vraie réponse du jeu est la position calculée de
l'image, donc les zones n'ont pas besoin d'être précises.
"""
import argparse
import json
import math
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

API = "https://graph.mapillary.com/images"
HALF = 0.045                 # demi-côté du carré de recherche, en degrés
MIN_DATE = "2016-01-01T00:00:00Z"

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
    "france": {"zones": FRANCE, "target": 300, "spacing_km": 15},
    "europe": {"zones": EUROPE, "target": 400, "spacing_km": 60},
    "monde": {"zones": MONDE, "target": 500, "spacing_km": 150},
}


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


def search(token, lat, lon, tries=4):
    params = {
        "fields": "id,computed_geometry,captured_at,quality_score",
        "bbox": f"{lon - HALF:.5f},{lat - HALF:.5f},{lon + HALF:.5f},{lat + HALF:.5f}",
        "is_pano": "true",
        "start_captured_at": MIN_DATE,
        "limit": "50",
    }
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(params), headers={
        "Authorization": "OAuth " + token, "User-Agent": "boite-a-jeux/boussole (jeu entre amis)",
    })
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r).get("data", [])
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                raise SystemExit(f"Jeton refusé par Mapillary (HTTP {e.code}). Vérifie que c'est bien le « Client Token ».")
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(2 ** attempt)
                continue
            return []
        except (urllib.error.URLError, TimeoutError):
            time.sleep(2 ** attempt)
    return []


def best_image(images):
    good = []
    for im in images:
        geo = im.get("computed_geometry") or {}
        coords = geo.get("coordinates")
        if not coords:
            continue
        q = im.get("quality_score")
        q = 0.5 if q is None else float(q)
        recent = min(1.0, max(0.0, ((im.get("captured_at") or 0) / 1000 - 1451606400) / (8 * 365 * 86400)))
        good.append((q + 0.3 * recent, im["id"], coords[1], coords[0]))
    return max(good) if good else None


def build_map(token, name, cfg, target, workers=8):
    kept, tries, t0 = [], 0, time.time()
    spacing = cfg["spacing_km"]
    max_tries = target * 40
    with ThreadPoolExecutor(max_workers=workers) as pool:
        while len(kept) < target and tries < max_tries:
            batch = [random_point(cfg["zones"]) for _ in range(workers * 4)]
            tries += len(batch)
            futures = [pool.submit(search, token, la, lo) for la, lo in batch]
            for f in as_completed(futures):
                pick = best_image(f.result())
                if not pick:
                    continue
                _, iid, lat, lon = pick
                if any(km(lat, lon, k[1], k[2]) < spacing for k in kept):
                    continue
                kept.append([str(iid), round(lat, 5), round(lon, 5)])
                if len(kept) >= target:
                    break
            print(f"  {name}: {len(kept)}/{target} lieux, {tries} recherches, {time.time() - t0:.0f} s", flush=True)
    return kept


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--maps", default="france,europe,monde")
    ap.add_argument("--target", type=int, default=0, help="nombre de lieux par carte (défaut : réglage de chaque carte)")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    token = read_token()

    if args.check:
        res = search(token, 48.8566, 2.3522)
        print(f"Jeton accepté : {len(res)} panoramas trouvés au centre de Paris.")
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
