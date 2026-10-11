"""Dames : 1) Kevin (téléphone sombre, blancs) contre Léa (PC clair), Zoé (téléphone clair) regarde, damier 10 × 10.
Chacun joue au doigt (on touche la pièce puis chaque case d'arrêt) jusqu'à ce qu'une prise arrive, et au-delà ;
vérifie que la prise est obligatoire (un coup simple est refusé quand on peut prendre), que les coups possibles n'arrivent
qu'au joueur dont c'est le tour, et la fin (abandon de Léa). 2) Kevin contre le robot (Débutant) sur 8 × 8, partie jouée
jusqu'au bout au doigt ; retour au salon et podium.
Usage : SRV=ws://127.0.0.1:8787 python tools/tests/dames_play.py [BASE]"""
import sys, os, json, random
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from salon_helpers import Table

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "dames")
res = {"prises jouées": 0, "rafles jouées": 0}
dm = lambda p: p.evaluate("() => view?.dm || null")


def tap(p, i):
    p.locator(f".dmx-sq[data-i='{i}']").click(); p.wait_for_timeout(110)


def play_one(p, pick):
    """Joue un coup permis au doigt : la pièce, puis chaque case d'arrêt (le coup part quand il n'y a plus de doute)."""
    v = dm(p); m = pick(v["moves"]); n0 = len(v["notes"])
    tap(p, m["path"][0])
    for sq in m["path"][1:]:
        if len(dm(p)["notes"]) > n0 or not dm(p)["myTurn"]: break
        tap(p, sq)
    p.wait_for_function(f"() => (view?.dm?.notes.length || 0) > {n0} || view?.dm?.phase === 'over'", timeout=8000)
    if m["caps"]: res["prises jouées"] += 1
    if len(m["caps"]) > 1: res["rafles jouées"] += 1
    return m


with sync_playwright() as pw:
    T = Table(pw, BASE, OUT)
    kev = T.page("Kevin", 390, 844, "dark", "🦊"); lea = T.page("Léa", 1440, 900, "light", "🐸"); zoe = T.page("Zoé", 390, 844, "light", "🦉")
    code = T.create(kev); T.join(lea, code); T.join(zoe, code)
    kev.click('.gcard[data-game="dames"]'); kev.wait_for_timeout(300)
    kev.select_option("#opt-dm-color", "blanc")
    kev.click("#btn-start")
    for p in (kev, lea, zoe): p.wait_for_selector("#s-dames:not([hidden])", timeout=20000)
    kev.wait_for_timeout(400)
    T.shot(kev, "01-Kevin-debut"); T.shot(lea, "01-Léa-debut"); T.shot(zoe, "01-Zoé-regarde")
    random.seed(7)
    refused = None
    for k in range(40):
        p = kev if dm(kev)["myTurn"] else lea
        p.wait_for_function("() => view?.dm?.myTurn", timeout=8000)
        v = dm(p)
        if v["mustTake"] and refused is None:
            # un coup simple pendant qu'une prise est possible : refusé
            T.shot(p, f"02-{p._name}-prise-obligatoire")
            other = [i for i, x in enumerate(v["board"]) if x and x.lower() == v["turn"] and i not in [m["path"][0] for m in v["moves"]]]
            if other: tap(p, other[0]); refused = p.inner_text("#toast"); tap(p, other[0])
        play_one(p, lambda ms: max(ms, key=lambda m: (len(m["caps"]), random.random())))
        if res["prises jouées"] >= 3 and k >= 12: break
    T.shot(kev, "03-Kevin-milieu"); T.shot(lea, "03-Léa-PC-milieu"); T.shot(zoe, "03-Zoé-milieu")
    res["refus d'un coup simple"] = refused
    leaks = sum(1 for name in T.frames for raw, s in T.states(name, "dm") if s["moves"] and not s["myTurn"])
    res["coups possibles envoyés au mauvais joueur"] = leaks
    lea.locator(".tb-btn.danger").click(); lea.wait_for_timeout(200); lea.locator(".tb-btn.danger").click()
    kev.wait_for_function("() => view?.dm?.phase === 'over'", timeout=8000); kev.wait_for_timeout(300)
    res["fin 1"] = dm(kev)["result"]
    T.shot(kev, "04-Kevin-fin"); T.shot(lea, "04-Léa-fin")
    kev.click(".tb-tray .tb-btn.hero"); kev.wait_for_selector("#s-lobby:not([hidden])", timeout=10000)

    # ---------------------------------------------------------------- 2) contre le robot, 8 × 8, jusqu'au bout
    kev.click('.gcard[data-game="dames"]'); kev.wait_for_timeout(300)
    kev.select_option("#opt-dm-rival", "robot"); kev.select_option("#opt-dm-level", "1"); kev.select_option("#opt-dm-size", "8"); kev.select_option("#opt-dm-color", "noir")
    kev.click("#btn-start"); kev.wait_for_selector("#s-dames:not([hidden])", timeout=20000)
    for k in range(150):
        kev.wait_for_function("() => view?.dm?.myTurn || view?.dm?.phase === 'over'", timeout=15000)
        if dm(kev)["phase"] == "over": break
        if k == 3: T.shot(kev, "05-Kevin-robot-8x8")
        play_one(kev, lambda ms: max(ms, key=lambda m: (len(m["caps"]), random.random())))
    kev.wait_for_timeout(500)
    v = dm(kev); res["fin 2"] = {"résultat": v["result"], "coups": len(v["notes"]), "pièces": v["pieces"]}
    T.shot(kev, "06-Kevin-robot-fin")
    if v["phase"] == "over":
        kev.click(".tb-tray .tb-btn.hero"); kev.wait_for_selector("#s-lobby:not([hidden])", timeout=10000)
        res["historique"] = kev.inner_text("#lobby-history")[:200]
    res["erreurs JS"] = T.errs
    T.close()

print(json.dumps(res, ensure_ascii=False, indent=1))
ok = (not res["erreurs JS"] and res["coups possibles envoyés au mauvais joueur"] == 0 and res["prises jouées"] >= 3 and res["refus d'un coup simple"]
      and res["fin 1"]["why"] == "abandon" and res["fin 2"]["résultat"] and "Dames" in res.get("historique", ""))
print("OK" if ok else "ÉCHEC"); sys.exit(0 if ok else 1)
