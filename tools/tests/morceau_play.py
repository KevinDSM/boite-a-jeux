"""Le Morceau du jour : trois chansons par jour, trois joueurs.
Kevin (téléphone) écoute 1 seconde (vérifie que le son s'arrête bien à 1 s), passe, se trompe, tente le bon artiste
s'il y en a un autre dans la boîte, puis sèche le morceau 1 ; il passe au morceau 2 par le bouton de fin et le trouve
du premier coup. Léa (PC, prénom tapé sur la page) trouve le morceau 1 au 2e essai ; Tom du premier coup.
Vérifie que ni le titre ni l'adresse de l'extrait n'arrivent au navigateur avant la fin, les classements, le widget.
Usage : python tools/tests/morceau_play.py [BASE]   (BASE = wrangler pages dev, par défaut http://127.0.0.1:8788)
SEULEMENT en local : il lit les chansons du jour dans la base locale (.wrangler/site) et vide les parties du jour.
Le son passe par Google Chrome (channel="chrome") : le Chromium de Playwright ne lit pas l'AAC des extraits."""
import sys, os, json, subprocess, re
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8788"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "tools", "tests", "out", "morceau"); os.makedirs(OUT, exist_ok=True)
res, errs = {}, []

def d1(sql):
    out = subprocess.run(f'npx wrangler d1 execute boite-a-jeux-stats --local --persist-to .wrangler/site --json --command "{sql}"',
                         cwd=ROOT, shell=True, capture_output=True, text=True, encoding="utf-8").stdout
    return json.loads(out[out.index("["):])[0]["results"]
LISTE = [json.loads(l.strip().rstrip(",")) for l in open(os.path.join(ROOT, "functions/api/morceau/_morceaux.js"), encoding="utf-8") if l.startswith("  [")]

with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome", args=["--autoplay-policy=no-user-gesture-required"])

    def page(name, w, h, theme, emo, named=True):
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if w < 800 else 1, has_touch=w < 800)
        init = f"localStorage.setItem('dc-theme', '{theme}'); localStorage.setItem('dc-emo', '{emo}');"
        if named: init += f"localStorage.setItem('dc-name', '{name}');"
        ctx.add_init_script(f"try {{ {init} }} catch {{}}")
        p = ctx.new_page(); p._bodies = []
        p.on("pageerror", lambda e: errs.append(f"{name}: {str(e)[:200]}"))
        p.on("response", lambda r: p._bodies.append(r) if "/api/morceau/" in r.url and "/audio" not in r.url and "/liste" not in r.url else None)
        return p
    shot = lambda p, n, full=True: p.screenshot(path=f"{OUT}/{n}.png", full_page=full)
    texts = lambda p: [r.text() for r in p._bodies]
    nrows = lambda p: p.evaluate("document.querySelectorAll('#mo-rows .mo-row:not(.mo-vide)').length")

    def guess(p, m):
        """Tape une partie du titre, choisit la chanson dans la liste, Valider."""
        k = nrows(p)
        p.fill("#mo-q", ""); p.type("#mo-q", f"{m[2]} {m[1].split()[0]}"[:48], delay=10)
        p.wait_for_selector(f'#mo-sugg .mo-s[data-k="{m[0]}"]', timeout=5000)
        p.click(f'#mo-sugg .mo-s[data-k="{m[0]}"]'); p.click("#mo-ok")
        p.wait_for_function("k => document.querySelectorAll('#mo-rows .mo-row:not(.mo-vide)').length > k", arg=k); p.wait_for_timeout(500)
    def skip(p):
        k = nrows(p); p.click("#mo-skip")
        p.wait_for_function("k => document.querySelectorAll('#mo-rows .mo-row:not(.mo-vide)').length > k", arg=k); p.wait_for_timeout(400)

    first = page("x", 390, 844, "dark", "🦊"); first.goto(BASE + "/morceaudujour"); first.wait_for_selector("#mo-tabs .mo-tab"); first.context.close()
    jour = d1("SELECT jour FROM morceau_jours ORDER BY jour DESC LIMIT 1")[0]["jour"][:10]
    rows = {int(r["jour"].split("#")[1]): r for r in d1(f"SELECT * FROM morceau_jours WHERE jour LIKE '{jour}%'")}
    d1(f"DELETE FROM morceau_joueurs WHERE jour LIKE '{jour}%'")
    W = {n: next(m for m in LISTE if m[0] == r["cle"]) for n, r in rows.items()}
    res["morceaux"] = {n: f"{m[2]} — {m[1]}" for n, m in W.items()}
    autres = [m for m in LISTE if m[0] not in {x[0] for x in W.values()}]
    meme_artiste = next((m for m in autres if m[0].split("|")[0] == W[1][0].split("|")[0]), None)

    # ---------------------------------------------------------------- Kevin : 1 seconde d'écoute, puis il sèche le morceau 1
    kev = page("Kevin", 390, 844, "dark", "🦊")
    kev.goto(BASE + "/morceaudujour"); kev.wait_for_selector("#mo-tabs .mo-tab"); kev.wait_for_timeout(1500)
    res["onglets"] = [x.replace("\n", " ") for x in kev.locator(".mo-tab").all_inner_texts()]
    shot(kev, "01-kevin-debut", False)
    kev.click("#mo-playbtn"); kev.wait_for_timeout(600)
    res["joue"] = kev.evaluate("!document.getElementById('mo-audio').paused")
    kev.wait_for_timeout(1300)
    res["arret-a-1s"] = kev.evaluate("[document.getElementById('mo-audio').paused, Math.round(document.getElementById('mo-audio').currentTime * 10) / 10]")
    res["adresse-extrait-cachee"] = kev.evaluate("!document.getElementById('mo-audio').src.includes('apple')")
    skip(kev)
    res["apres-passer"] = kev.inner_text("#mo-now")
    guess(kev, autres[5])
    if meme_artiste: guess(kev, meme_artiste); res["bon-artiste"] = kev.locator("#mo-rows .mo-artiste").count() == 1
    shot(kev, "02-kevin-essais", False)
    while nrows(kev) < 5: skip(kev)
    kev.click("#mo-skip"); res["abandon-demande-confirmation"] = kev.inner_text("#toast"); kev.click("#mo-skip")   # le dernier « Passer » = abandonner : deux appuis
    kev.wait_for_selector("#mo-end:not([hidden])")
    res["kevin-m1"] = kev.inner_text("#mo-title") + " / " + kev.inner_text("#mo-say")
    shot(kev, "03-kevin-fin")
    early = texts(kev)[:-1]
    res["titre-cache-avant-la-fin"] = all(W[1][2] not in x and W[1][4] not in x and W[1][0] not in x for x in early)
    res["extraits-jamais-envoyes"] = all("itunes.apple.com/itunes-assets" not in x for x in texts(kev))
    kev.click("#mo-go"); kev.wait_for_timeout(600)
    res["kevin-onglet"] = kev.evaluate("[location.search, document.querySelector('.mo-tab.on').dataset.n]")
    guess(kev, W[2]); kev.wait_for_selector("#mo-end:not([hidden])")
    res["kevin-m2"] = kev.inner_text("#mo-title")
    res["morceau3-jamais-envoye"] = all(W[3][2] not in x for x in texts(kev))
    shot(kev, "04-kevin-m2")

    # ---------------------------------------------------------------- Léa : PC, thème clair, prénom tapé ; trouve au 2e essai
    lea = page("Léa", 1280, 860, "light", "🐸", named=False)
    lea.goto(BASE + "/morceaudujour"); lea.wait_for_selector("#mo-name:not([hidden])")
    lea.fill("#mo-name input[name=nom]", "Léa"); lea.click("#mo-name button[type=submit]")
    lea.wait_for_selector("#mo-player:not([hidden])")
    skip(lea); guess(lea, W[1]); lea.wait_for_selector("#mo-end:not([hidden])")
    res["lea"] = lea.inner_text("#mo-title")
    shot(lea, "05-lea-pc", False)

    # ---------------------------------------------------------------- Tom : du premier coup
    tom = page("Tom", 390, 844, "lavande", "🐼")
    tom.goto(BASE + "/morceaudujour"); tom.wait_for_selector("#mo-q")
    guess(tom, W[1]); tom.wait_for_selector("#mo-end:not([hidden])"); tom.wait_for_timeout(400)
    res["classement-m1"] = [x.replace("\n", " ") for x in tom.locator(".mo-r").all_inner_texts()]
    shot(tom, "06-tom", False)
    tom.goto(BASE + "/"); tom.wait_for_selector("#ih-mo:not([hidden])"); tom.wait_for_timeout(500)
    res["widget-tom"] = tom.inner_text("#ih-mo").replace("\n", " | ")
    tom.click('#ih-mo-tabs button[data-n="1"]'); tom.wait_for_timeout(200)
    res["widget-tom-m1"] = tom.inner_text("#ih-mo-list").replace("\n", " | ")
    shot(tom, "07-accueil-tel")
    lea.goto(BASE + "/"); lea.wait_for_selector("#ih-mo:not([hidden])"); lea.wait_for_timeout(500); shot(lea, "08-accueil-pc", False)
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=1))
print("erreurs JS :", errs or "aucune")
ok = (res["joue"] and res["arret-a-1s"][0] and 0.9 <= res["arret-a-1s"][1] <= 1.4 and res["adresse-extrait-cachee"] and res["titre-cache-avant-la-fin"]
      and res["extraits-jamais-envoyes"] and res["morceau3-jamais-envoye"] and res["kevin-onglet"] == ["?m=2", "2"]
      and "Tom" in res["classement-m1"][0] and "Léa" in res["classement-m1"][1] and "Kevin" in res["classement-m1"][2] and res.get("bon-artiste", True) and not errs)
print("OK" if ok else "ÉCHEC")
sys.exit(0 if ok else 1)
