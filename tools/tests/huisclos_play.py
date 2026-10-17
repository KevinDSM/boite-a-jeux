"""Huis clos : trois joueurs (téléphone sombre, PC clair, téléphone Lavande), le scénario Protocole Ambre joué en entier au doigt.
Vérifie : la répartition des documents (chacun ne reçoit QUE les siens, relu dans chaque message), qu'aucun code ne quitte
le serveur, les gestes (boutons, objets glissés sur la pièce et sur un autre objet, cadenas à chiffres, à lettres, à
emplacements et à doses), les codes faux qui coûtent du temps, les pièces qui s'ouvrent, un indice, la fin et le retour au salon.
Usage : SRV=ws://127.0.0.1:8787 python tools/tests/huisclos_play.py [BASE]   (par défaut http://127.0.0.1:8767/index.html)"""
import sys, os, json, time, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from salon_helpers import Table, SRV

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "huisclos")
CODES = ["2479", "1987", "CURIE", "6854"]
res = {}

with sync_playwright() as pw:
    T = Table(pw, BASE, OUT)
    kev = T.page("Kevin", 390, 844, "dark", "🦊"); lea = T.page("Léa", 1440, 900, "light", "🐸"); tom = T.page("Tom", 390, 844, "lavande", "🐼")
    people = [kev, lea, tom]
    code = T.create(kev); T.join(lea, code); T.join(tom, code)
    kev.wait_for_timeout(800)
    kev.evaluate("() => document.querySelector('.gcard[data-game=huisclos]').click()"); kev.wait_for_timeout(400)
    T.shot(kev, "00-salon", True)
    kev.click("#btn-start")
    for p in people: p.wait_for_function("() => view?.hc?.phase === 'intro'", timeout=20000)
    hc = lambda p: p.evaluate("() => view.hc")
    T.shot(kev, "01-intro-tel", True); T.shot(lea, "01-intro-pc")
    docs = {p._name: [d["id"] for d in hc(p)["docs"]] for p in people}
    res["documents-repartis"] = sorted(sum(docs.values(), [])) == sorted(["carnet", "vocal", "fiche", "plan", "recette", "remi"]) and all(len(v) == 2 for v in docs.values())
    kev.click("text=Lancer le chrono")
    for p in people: p.wait_for_function("() => view.hc.phase === 'play'", timeout=10000)

    def room(p, r):
        if p.evaluate("() => hcRoom") != r: p.click(f'.hcx-rooms [data-room="{r}"]'); p.wait_for_timeout(300)
    def spot(p, r, s):
        room(p, r); p.click(f'.hcx-scene .hcx-hit[data-spot="{s}"]'); p.wait_for_selector("#hcx-sheet", timeout=5000); p.wait_for_timeout(250)
    def close(p):
        if p.locator("#hcx-sheet").count(): p.click("#hcx-sheet [data-close]"); p.wait_for_timeout(200)
    def btn(p, text): p.click(f'#hcx-sheet button:has-text("{text}")'); p.wait_for_timeout(500)
    def keys(p, txt):
        for ch in txt: p.click(f'#hcx-sheet [data-k="{ch}"]'); p.wait_for_timeout(60)
        p.wait_for_timeout(900)
    def center(p, sel):
        b = p.locator(sel).first.bounding_box(); return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
    def drag(p, item, r, target, on_item=False):
        """Glisse un objet de l'inventaire sur un endroit de la pièce (ou sur un autre objet) à la souris."""
        close(p); room(p, r)
        x, y = center(p, f'.hcx-item[data-id="{item}"]')
        tx, ty = center(p, f'.hcx-item[data-id="{target}"]' if on_item else f'.hcx-scene .hcx-hit[data-spot="{target}"]')
        p.mouse.move(x, y); p.mouse.down(); p.mouse.move(x + 10, y - 10, steps=3); p.mouse.move(tx, ty, steps=16); p.mouse.up(); p.wait_for_timeout(700)
    flags = lambda: set(hc(kev)["flags"])
    def expect(name, flag):
        for _ in range(20):
            if flag in flags(): break
            kev.wait_for_timeout(150)
        res[name] = flag in flags()

    # ---------------------------------------------------------------- le labo
    spot(kev, "labo", "bureau"); T.shot(kev, "02-bureau"); btn(kev, "Ouvrir le tiroir"); close(kev); expect("bouton-tiroir", "tiroir")
    spot(lea, "labo", "minuteur"); btn(lea, "Le démonter"); close(lea); expect("bouton-minuteur", "pile")
    tom.wait_for_selector('.hcx-item[data-id="pile"]'); drag(tom, "pile", "labo", "lampe", True); expect("combiner-deux-objets", "lampeOk")
    kev.wait_for_selector('.hcx-item[data-id="lampeOn"]'); drag(kev, "lampeOn", "labo", "tableau"); expect("lampe-sur-tableau", "uv")
    res["feuille-ouverte-seule"] = kev.locator("#hcx-sheet").count() == 1; T.shot(kev, "03-tableau-uv"); close(kev)
    spot(lea, "labo", "armoire"); T.shot(lea, "04-cadenas-pc")
    left0 = hc(lea)["left"]; keys(lea, "1111"); lea.wait_for_timeout(500)
    res["code-faux-coute-du-temps"] = hc(lea)["wrong"] == 1 and hc(lea)["left"] < left0 - 50000
    keys(lea, "2479"); close(lea); expect("cadenas-armoire", "armoire")
    drag(tom, "grattoir", "labo", "frigo"); expect("grattoir-frigo", "frigo")
    drag(kev, "lame", "labo", "micro"); expect("lame-microscope", "micro"); T.shot(kev, "05-microscope"); close(kev)
    spot(lea, "labo", "porteB"); keys(lea, "1987"); expect("porte-reserve", "porteB")
    btn(lea, "Y aller"); res["aller-dans-la-reserve"] = lea.evaluate("() => hcRoom") == "reserve"
    spot(tom, "labo", "pc"); T.shot(tom, "06-pc-lettres"); keys(tom, "CURIE"); expect("mot-de-passe", "pc")
    btn(tom, "Imprimer un badge"); close(tom); expect("badge", "badge")
    # un indice, vu par tous
    kev.click('.tb-bar button:has-text("Indice")'); kev.wait_for_selector("#hcx-sheet .hcx-steps")
    kev.click("#hcx-sheet [data-hint]"); kev.wait_for_timeout(600); T.shot(kev, "07-indice"); close(kev)
    res["indice-partage"] = hc(lea)["hints"] == 1 and any(s["hints"] for s in hc(tom)["steps"])

    # ---------------------------------------------------------------- la réserve
    spot(kev, "reserve", "blouse"); btn(kev, "Fouiller les poches"); close(kev); expect("blouse", "cle")
    drag(lea, "cle", "labo", "bureau"); expect("petite-cle", "tiroirBas")
    drag(tom, "tournevis", "reserve", "caisse"); expect("caisse", "caisse")
    drag(kev, "fusible", "reserve", "fusibles"); expect("fusible-en-main", "fuseIn")
    kev.wait_for_selector("#hcx-sheet [data-slot]"); T.shot(kev, "08-fusibles")
    w0 = hc(kev)["wrong"]; kev.click('#hcx-sheet [data-slot="2"]'); kev.wait_for_timeout(900)
    res["court-circuit"] = hc(kev)["wrong"] == w0 + 1
    kev.click('#hcx-sheet [data-slot="4"]'); kev.wait_for_timeout(600); close(kev); expect("courant", "power")
    drag(lea, "lampeOn", "reserve", "affiche"); expect("affiche-uv", "posterUv"); T.shot(lea, "09-affiche-pc"); close(lea)
    spot(lea, "reserve", "classeur"); lea.keyboard.type("6854"); lea.wait_for_timeout(900); close(lea); expect("classeur-au-clavier", "classeur")
    T.shot(tom, "10-reserve-tel")
    drag(tom, "badge", "reserve", "porteC"); expect("porte-controle", "porteC")

    # ---------------------------------------------------------------- la salle de contrôle
    drag(kev, "seringue", "controle", "doseur"); expect("seringue", "seringue")
    kev.wait_for_selector("#hcx-sheet .hcx-doses")
    for i, n in enumerate([3, 2, 4]):
        for _ in range(n): kev.click(f'#hcx-sheet .hcx-dose[data-i="{i}"] [data-dd="1"]')
    T.shot(kev, "11-doseur"); btn(kev, "Lancer le mélange"); close(kev); expect("doses", "stab")
    T.shot(tom, "12-controle-tel")
    drag(lea, "stabilisateur", "controle", "chambre"); res["stabilisateur-refuse-sans-tube"] = "fin" not in flags()
    drag(lea, "tube", "controle", "chambre"); expect("tube", "tubeIn")
    drag(lea, "stabilisateur", "controle", "chambre")
    for p in people: p.wait_for_function("() => view.hc.phase === 'over'", timeout=10000)
    r = hc(kev)["result"]
    res["gagne"] = r["win"] and r["hints"] == 1 and r["wrong"] == 2 and r["stars"] >= 1
    kev.wait_for_timeout(600); T.shot(kev, "13-fin-tel", True); T.shot(lea, "13-fin-pc")

    # ---------------------------------------------------------------- les messages reçus : aucun code, et les documents des autres jamais
    texts = {"carnet": "jaune : 9", "vocal": "microscope : il montre tout", "fiche": "Procédure de confinement", "plan": "entre la ventilation", "recette": "deux de plus que le vert", "remi": "Restée dans ma blouse"}
    leak = []
    for p in people:
        for f, _ in T.states(p._name, "hc"):
            for c in CODES:
                m = re.search(rf'(?<![0-9A-Za-z]){c}(?![0-9A-Za-z])', f)
                if m: leak.append(f"{p._name}: {c} dans …{f[max(0, m.start() - 40):m.end() + 20]}…")
            for d, t in texts.items():
                if d not in docs[p._name] and t in f: leak.append(f"{p._name} reçoit {d}")
    res["aucune-fuite"] = not leak
    if leak: print("FUITES :", sorted(set(leak))[:10])
    res["messages-relus"] = sum(1 for _ in T.states("Kevin", "hc")) > 20 if SRV else "sans serveur"

    kev.click("text=Retour au salon")
    for p in people: p.wait_for_function("() => view?.phase === 'lobby'", timeout=10000)
    res["retour-salon"] = True
    res["erreurs-js"] = T.errs[:5] or "aucune"
    T.close()

print(json.dumps(res, ensure_ascii=False, indent=1))
bad = [k for k, v in res.items() if v is False]
print("ÉCHECS :", bad if bad else "aucun")
sys.exit(1 if bad or T.errs else 0)
