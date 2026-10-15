"""Le Morceau du jour : la liste des chansons à faire deviner, tirée de Décennies (songs.json) et d'Éclair
(songs-eclair.json), sans doublon, seulement celles qui ont un extrait.
Demande de Kevin (15/10) : chansons FRANÇAISES (chantées en français) sorties en 2000 ou après. Les listes ne disent
pas la langue : elle est donnée ici par artiste (FRANCOPHONES). Un nouvel artiste français ajouté aux listes de chansons
doit être ajouté ici, sinon ses titres n'entrent pas dans le jeu.
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

ANNEE_MIN = 2000
FRANCOPHONES = {
    "Alizée", "Amel Bent", "Amir", "Angèle", "Aya Nakamura", "Bigflo & Oli", "Black M", "Bon Entendeur & Isabelle Pierre", "Bénabar",
    "Calogero", "Chimène Badi", "Christine and the Queens", "Christophe Maé", "Christophe Willem", "Clara Luciani", "Colonel Reyel",
    "Corneille", "Dadju", "Diam's", "Diam's & Vitaa", "Eddy de Pretto", "Fatal Bazooka", "Fréro Delavega", "GIMS", "GIMS & DYSTINCT",
    "Garou", "Grand Corps Malade & Camille Lellouche", "Grégoire", "Grégory Lemarchal", "Hatik", "Hoshi", "Ilona Mitrecey", "Indila",
    "Jean-Pascal", "Jenifer", "Jul", "Julien Doré", "Juliette Armanet", "K.Maro", "Keen'V", "Kendji Girac", "Kids United", "Kyo",
    "Lartiste", "Lomepal", "Lorie", "Louane", "Lââm", "M. Pokora", "Mentissa", "Mickey 3D", "Nekfeu", "Noir Désir", "Olivia Ruiz",
    "Orelsan", "PNL", "Passi & Calogero", "Pierre Garnier", "Pierre de Maere", "Pomme", "Raphaël", "SANTA", "Sexion d'Assaut", "Shy'm",
    "Slimane", "Sniper", "Soolking & Gazo", "Soprano", "Star Academy", "Stromae", "Superbus", "TAL", "Tayc", "Tiakola", "Tragédie",
    "Vegedream", "Vianney", "Vitaa", "Vitaa & Slimane", "Werenoi", "Yannick Noah", "Yelle", "ZAZ", "Zaho de Sagazan", "Zazie",
}

vus, out = set(), []
for f in ("songs.json", "songs-eclair.json"):
    for s in json.load(open(os.path.join(ROOT, f), encoding="utf-8")):
        if not s.get("preview") or not s.get("title") or not s.get("artist"): continue
        if (s.get("year") or 0) < ANNEE_MIN or s["artist"] not in FRANCOPHONES: continue
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
