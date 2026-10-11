"""Échecs : 1) Kevin (téléphone sombre, blancs) contre Léa (PC clair), Zoé (téléphone clair) regarde. On joue le coup du
berger au doigt (1.e4 e5 2.Fc4 Cc6 3.Dh5 Cf6 4.Dxf7#) : vérifie les cases proposées, le refus d'un coup interdit, le mat,
et que les coups possibles n'arrivent qu'au joueur dont c'est le tour. 2) Kevin contre le robot (Débutant, pendule 5 min) :
quelques coups au doigt, « Reprendre mon coup », nulle proposée, abandon, retour au salon et podium.
Usage : SRV=ws://127.0.0.1:8787 python tools/tests/echecs_play.py [BASE]"""
import sys, os, json, time, random
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from salon_helpers import Table

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "echecs")
res = {}
ec = lambda p: p.evaluate("() => view?.ec || null")


def tap(p, sq):
    p.locator(f".ecx-sq[aria-label^='{sq}']").first.click()
    p.wait_for_timeout(120)


def move(p, a, b):
    tap(p, a)
    lit = p.evaluate("() => [...document.querySelectorAll('.ecx-sq.to, .ecx-sq.hit')].map(b => b.getAttribute('aria-label').slice(0, 2))")
    assert b in lit, f"{a}->{b} : {b} pas proposé ({lit})"
    tap(p, b)


def wait_turn(p, timeout=15000):
    p.wait_for_function("() => view?.ec?.myTurn || view?.ec?.phase === 'over'", timeout=timeout)


with sync_playwright() as pw:
    T = Table(pw, BASE, OUT)
    kev = T.page("Kevin", 390, 844, "dark", "🦊"); lea = T.page("Léa", 1440, 900, "light", "🐸"); zoe = T.page("Zoé", 390, 844, "light", "🦉")
    code = T.create(kev); T.join(lea, code); T.join(zoe, code)
    kev.click('.gcard[data-game="echecs"]'); kev.wait_for_timeout(300)
    kev.select_option("#opt-ec-color", "blanc")
    T.shot(kev, "00-salon-reglages")
    kev.click("#btn-start")
    for p in (kev, lea, zoe): p.wait_for_selector("#s-echecs:not([hidden])", timeout=20000)
    kev.wait_for_timeout(500)
    T.shot(kev, "01-Kevin-debut"); T.shot(lea, "01-Léa-debut-noirs"); T.shot(zoe, "01-Zoé-regarde")
    res["orientation Léa (noirs en bas)"] = lea.evaluate("() => document.querySelector('.ecx-board').classList.contains('flip')")
    # un coup interdit : le fou c1 est bloqué
    tap(kev, "c1"); res["fou bloqué"] = kev.inner_text("#toast")
    seq = [(kev, "e2", "e4"), (lea, "e7", "e5"), (kev, "f1", "c4"), (lea, "b8", "c6"), (kev, "d1", "h5"), (lea, "g8", "f6")]
    for p, a, b in seq:
        wait_turn(p); move(p, a, b)
        if (a, b) == ("f1", "c4"): T.shot(lea, "02-Léa-PC-milieu")
    wait_turn(kev); tap(kev, "h5"); T.shot(kev, "03-Kevin-dame-choisie"); tap(kev, "f7")
    for p in (kev, lea, zoe): p.wait_for_function("() => view?.ec?.phase === 'over'", timeout=10000)
    kev.wait_for_timeout(400)
    v = ec(kev); res["fin 1"] = {"résultat": v["result"], "coups": v["history"]}
    T.shot(kev, "04-Kevin-mat"); T.shot(lea, "04-Léa-mat"); T.shot(zoe, "04-Zoé-mat")
    leaks = 0
    for name in T.frames:
        for raw, s in T.states(name, "ec"):
            if s["moves"] and not s["myTurn"]: leaks += 1
    res["coups possibles envoyés au mauvais joueur"] = leaks
    kev.click(".tb-tray .tb-btn.hero"); kev.wait_for_selector("#s-lobby:not([hidden])", timeout=10000)

    # ---------------------------------------------------------------- 2) contre le robot, avec pendule
    kev.click('.gcard[data-game="echecs"]'); kev.wait_for_timeout(300)
    kev.select_option("#opt-ec-rival", "robot"); kev.select_option("#opt-ec-level", "1"); kev.select_option("#opt-ec-color", "blanc"); kev.select_option("#opt-ec-clock", "5")
    kev.click("#btn-start"); kev.wait_for_selector("#s-echecs:not([hidden])", timeout=20000)
    random.seed(4)
    for k in range(6):
        wait_turn(kev)
        v = ec(kev)
        m = random.choice(v["moves"]); n = lambda i: "abcdefgh"[i % 8] + str(8 - i // 8)
        tap(kev, n(m["f"])); tap(kev, n(m["t"]))
        if kev.locator(".ecx-promo").count(): kev.locator(".ecx-promo-b").first.click()
    wait_turn(kev); kev.wait_for_timeout(1200)
    T.shot(kev, "05-Kevin-robot-pendule")
    c1 = kev.inner_text(".ecx-tray .ecx-clock"); kev.wait_for_timeout(2200); c2 = kev.inner_text(".ecx-tray .ecx-clock")
    res["pendule qui tourne"] = [c1, c2]
    n0 = len(ec(kev)["history"])
    kev.locator(".tb-btn", has_text="Reprendre mon coup").click(); kev.wait_for_timeout(800)
    res["reprendre"] = [n0, len(ec(kev)["history"])]
    kev.locator(".tb-btn", has_text="Proposer nulle").click(); kev.wait_for_timeout(3000)
    res["nulle proposée au robot"] = ec(kev)["log"][-2:]
    if ec(kev)["phase"] == "play":
        kev.locator(".tb-btn.danger").click(); kev.wait_for_timeout(200); kev.locator(".tb-btn.danger").click()
        kev.wait_for_function("() => view?.ec?.phase === 'over'", timeout=8000)
    T.shot(kev, "06-Kevin-abandon")
    res["fin 2"] = ec(kev)["result"]
    kev.click(".tb-tray .tb-btn.hero"); kev.wait_for_selector("#s-lobby:not([hidden])", timeout=10000)
    res["historique"] = kev.inner_text("#lobby-history")[:200]
    res["erreurs JS"] = T.errs
    T.close()

print(json.dumps(res, ensure_ascii=False, indent=1))
f1 = res["fin 1"]
ok = (not res["erreurs JS"] and res["orientation Léa (noirs en bas)"] and f1["résultat"]["why"] == "mat" and f1["coups"][-1] == "Dxf7#"
      and res["coups possibles envoyés au mauvais joueur"] == 0 and res["reprendre"][1] < res["reprendre"][0]
      and res["pendule qui tourne"][0] != res["pendule qui tourne"][1] and res["fin 2"] and "Échecs" in res["historique"])
print("OK" if ok else "ÉCHEC"); sys.exit(0 if ok else 1)
