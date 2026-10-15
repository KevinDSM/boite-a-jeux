"""Le Morceau du jour : la liste des chansons à faire deviner, tirée de Décennies (songs.json) et d'Éclair
(songs-eclair.json), sans doublon, seulement celles qui ont un extrait.
Écrit functions/api/morceau/_morceaux.js, lu par l'API (le navigateur ne reçoit jamais l'adresse d'un extrait).
À relancer après avoir ajouté des chansons : python tools/morceau/build_morceaux.py"""
import json, os, unicodedata, re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "functions", "api", "morceau", "_morceaux.js")

def cle(s):
    """Une clé stable et lisible : minuscules, sans accents ni ponctuation."""
    s = unicodedata.normalize("NFD", s.lower()).replace("œ", "oe").replace("æ", "ae")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s).strip()

vus, out = set(), []
for f in ("songs.json", "songs-eclair.json"):
    for s in json.load(open(os.path.join(ROOT, f), encoding="utf-8")):
        if not s.get("preview") or not s.get("title") or not s.get("artist"): continue
        k = cle(s["artist"]) + "|" + cle(s["title"])
        if k in vus: continue
        vus.add(k)
        out.append([k, s["artist"], s["title"], s.get("year") or 0, s["preview"], s.get("art") or ""])

with open(OUT, "w", encoding="utf-8", newline="\n") as w:
    w.write("// GÉNÉRÉ par tools/morceau/build_morceaux.py à partir de songs.json et songs-eclair.json : ne pas modifier à la main.\n")
    w.write("// [clé, artiste, titre, année, extrait, pochette] ; la clé = « artiste|titre » sans accents ni ponctuation.\n")
    w.write("export const MORCEAUX = [\n")
    for m in out: w.write("  " + json.dumps(m, ensure_ascii=False) + ",\n")
    w.write("];\n")
print(len(out), "morceaux ->", os.path.relpath(OUT, ROOT))
