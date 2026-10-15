"""Le Mot du jour : trois mots par jour, trois joueurs.
Kevin sèche le mot 1 à coups de lettres au hasard (acceptées : pas de dictionnaire) avec l'indice, puis passe au mot 2
par le bouton de fin et le trouve en deux. Léa (PC, prénom tapé sur la page) trouve le mot 1 en deux puis le mot 3 du
premier coup par l'onglet. Tom trouve le mot 1 du premier coup. Vérifie que chaque mot reste caché tant que sa partie
n'est pas finie, les classements de chaque mot, puis le widget de l'accueil et ses onglets.
Usage : python tools/tests/motdujour_play.py [BASE]   (BASE = wrangler pages dev, par défaut http://127.0.0.1:8788)
SEULEMENT en local : il lit les mots du jour dans la base locale (.wrangler/site) et vide les parties du jour."""
import sys, os, json, unicodedata, subprocess, random
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8788"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "tools", "tests", "out", "motdujour"); os.makedirs(OUT, exist_ok=True)
norm = lambda s: unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().upper()
res, errs = {}, []

def d1(sql):
    out = subprocess.run(f'npx wrangler d1 execute boite-a-jeux-stats --local --persist-to .wrangler/site --json --command "{sql}"',
                         cwd=ROOT, shell=True, capture_output=True, text=True, encoding="utf-8").stdout
    return json.loads(out[out.index("["):])[0]["results"]

with sync_playwright() as pw:
    b = pw.chromium.launch()

    def page(name, w, h, theme, emo, named=True):
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if w < 800 else 1, has_touch=w < 800)
        init = f"localStorage.setItem('dc-theme', '{theme}'); localStorage.setItem('dc-emo', '{emo}');"
        if named: init += f"localStorage.setItem('dc-name', '{name}');"
        ctx.add_init_script(f"try {{ {init} }} catch {{}}")
        p = ctx.new_page(); p._bodies = []
        p.on("pageerror", lambda e: errs.append(f"{name}: {str(e)[:200]}"))
        p.on("response", lambda r: p._bodies.append(r) if "/api/motdujour/" in r.url else None)
        return p
    shot = lambda p, n, full=True: p.screenshot(path=f"{OUT}/{n}.png", full_page=full)
    rows = lambda p: p.evaluate("document.querySelectorAll('#md-board .md-row[role=img], #md-board .md-hintrow').length")
    texts = lambda p: [r.text() for r in p._bodies]

    def play_keys(p, w):
        """Tape le mot au clavier de l'écran (la première lettre est déjà posée), puis Valider."""
        k = rows(p)
        for ch in w[1:]: p.click(f'.md-key[data-k="{ch}"]')
        p.click('.md-key[data-k="Enter"]')
        p.wait_for_function("k => document.querySelectorAll('#md-board .md-row[role=img], #md-board .md-hintrow').length > k || document.querySelector('.toast.show')", arg=k)
        p.wait_for_timeout(900)

    def play_typed(p, w):
        """Tape le mot entier au clavier du PC, première lettre comprise (elle est ignorée), puis Entrée."""
        k = rows(p)
        p.keyboard.type(w.lower()); p.keyboard.press("Enter")
        p.wait_for_function("k => document.querySelectorAll('#md-board .md-row[role=img], #md-board .md-hintrow').length > k", arg=k)
        p.wait_for_timeout(900)

    # les trois mots du jour (la première visite les fige), et une base vide pour les parties du jour
    first = page("x", 390, 844, "dark", "🦊")
    first.goto(BASE + "/motdujour"); first.wait_for_selector("#md-kb .md-key"); first.context.close()
    jour = d1("SELECT jour FROM motdujour_jours ORDER BY jour DESC LIMIT 1")[0]["jour"][:10]
    W = {int((r["jour"] + "#1").split("#")[1]): r["mot"] for r in d1(f"SELECT jour, mot FROM motdujour_jours WHERE jour LIKE '{jour}%'")}
    d1(f"DELETE FROM motdujour_joueurs WHERE jour LIKE '{jour}%'")
    res["mots"] = W
    def junk(w, seed):
        r = random.Random(seed)
        return w[0] + "".join(r.choice("ZXWQKJYV") for _ in w[1:])

    # ---------------------------------------------------------------- Kevin : le mot 1 au hasard + l'indice, raté ; le mot 2 en deux
    kev = page("Kevin", 390, 844, "dark", "🦊")
    kev.goto(BASE + "/motdujour"); kev.wait_for_selector("#md-tabs .md-tab")
    res["onglets"] = [x.replace("\n", " ") for x in kev.locator(".md-tab").all_inner_texts()]
    shot(kev, "01-kevin-debut", False)
    w1 = W[1]
    for i in range(3): play_keys(kev, junk(w1, i))
    res["hasard-accepte"] = rows(kev) == 3
    kev.click("#md-hintbtn"); kev.click("#md-hintbtn"); kev.wait_for_selector(".md-hintrow"); kev.wait_for_timeout(400)
    res["indice"] = kev.inner_text(".md-hintrow").split("\n")[-1]
    for i in range(3, 5): play_keys(kev, junk(w1, i))
    kev.wait_for_selector("#md-end:not([hidden])")
    res["kevin-mot1"] = kev.inner_text("#md-title") + " / " + kev.inner_text("#md-say")
    shot(kev, "02-kevin-mot1-rate")
    early = [x for x in texts(kev) if '"solution"' not in x]
    res["mot1-cache-avant-la-fin"] = all(w1 not in x for x in early)
    def avant_indice(x):     # une réponse où Kevin n'a pas encore pris l'indice du mot 1
        try: m = (json.loads(x).get("mots") or [{}])[0].get("moi")
        except Exception: return False
        return not m or m.get("indice") is None
    res["indice-cache-avant"] = all(res["indice"] not in x for x in early if avant_indice(x))
    res["bouton-suite"] = kev.inner_text("#md-go")
    kev.click("#md-go"); kev.wait_for_timeout(500)
    res["kevin-onglet"] = kev.evaluate("[location.search, document.querySelector('.md-tab.on').dataset.n]")
    n2 = len(texts(kev))
    play_keys(kev, junk(W[2], 9)); play_keys(kev, W[2])
    kev.wait_for_selector("#md-end:not([hidden])")
    res["kevin-mot2"] = kev.inner_text("#md-title")
    res["mot2-cache-avant-la-fin"] = all(W[2] not in x for x in texts(kev)[:-1])
    res["mot3-jamais-envoye-a-kevin"] = all(W[3] not in x for x in texts(kev))
    res["onglets-kevin"] = [x.replace("\n", " ") for x in kev.locator(".md-tab").all_inner_texts()]
    shot(kev, "03-kevin-mot2-trouve")

    # ---------------------------------------------------------------- Léa : PC, thème clair, prénom tapé ; mot 1 en deux, mot 3 du premier coup
    lea = page("Léa", 1280, 860, "light", "🐸", named=False)
    lea.goto(BASE + "/motdujour"); lea.wait_for_selector("#md-name:not([hidden])")
    lea.fill("#md-name input[name=nom]", "Léa"); lea.click("#md-name button[type=submit]")
    lea.wait_for_selector("#md-boardbox:not([hidden])")
    play_typed(lea, junk(w1, 20)); play_typed(lea, w1)
    lea.wait_for_selector("#md-end:not([hidden])"); res["lea-mot1"] = lea.inner_text("#md-title")
    lea.click('.md-tab[data-n="3"]'); lea.wait_for_timeout(400)
    play_typed(lea, W[3]); lea.wait_for_selector("#md-end:not([hidden])")
    res["lea-mot3"] = lea.inner_text("#md-title") + " / " + lea.inner_text("#md-rank h2")
    shot(lea, "04-lea-pc-mot3", False)

    # ---------------------------------------------------------------- Tom : mot 1 du premier coup, thème Lavande
    tom = page("Tom", 390, 844, "lavande", "🐼")
    tom.goto(BASE + "/motdujour"); tom.wait_for_selector("#md-kb .md-key")
    play_keys(tom, w1); tom.wait_for_selector("#md-end:not([hidden])")
    tom.wait_for_timeout(500)
    res["classement-mot1"] = [x.replace("\n", " ") for x in tom.locator(".md-r").all_inner_texts()]
    res["kevin-ampoule"] = tom.locator(".md-r.rate .md-bulb").count() == 1
    tom.click('.md-tab[data-n="2"]'); tom.wait_for_timeout(400)
    res["classement-mot2"] = [x.replace("\n", " ") for x in tom.locator(".md-r").all_inner_texts()]
    res["mot2-cache-pour-tom"] = all(W[2] not in x for x in texts(tom))
    shot(tom, "05-tom-mot2", False)

    # ---------------------------------------------------------------- le widget de l'accueil
    tom.goto(BASE + "/"); tom.wait_for_selector("#ih-mdj:not([hidden])")
    res["widget-tom"] = tom.inner_text("#ih-mdj").replace("\n", " | ")
    shot(tom, "06-accueil-tel", False)
    tom.click('#ih-mdj-tabs button[data-n="1"]'); tom.wait_for_timeout(200)
    res["widget-tom-mot1"] = tom.inner_text("#ih-mdj-list").replace("\n", " | ")
    res["widget-lien"] = [tom.get_attribute("#ih-mdj-go", "href")]
    tom.click('#ih-mdj-tabs button[data-n="3"]'); tom.wait_for_timeout(200); res["widget-lien"].append(tom.get_attribute("#ih-mdj-go", "href"))
    lea.goto(BASE + "/"); lea.wait_for_selector("#ih-mdj:not([hidden])"); shot(lea, "07-accueil-pc", False)
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=1))
print("erreurs JS :", errs or "aucune")
ok = (res["hasard-accepte"] and res["mot1-cache-avant-la-fin"] and res["indice-cache-avant"] and res["mot2-cache-avant-la-fin"]
      and res["mot3-jamais-envoye-a-kevin"] and res["mot2-cache-pour-tom"] and res["kevin-ampoule"] and res["kevin-onglet"] == ["?m=2", "2"]
      and "Tom" in res["classement-mot1"][0] and len(res["classement-mot2"]) == 1 and "Kevin" in res["classement-mot2"][0]
      and res["widget-lien"] == ["motdujour", "motdujour?m=3"] and not errs)
print("OK" if ok else "ÉCHEC")
sys.exit(0 if ok else 1)
