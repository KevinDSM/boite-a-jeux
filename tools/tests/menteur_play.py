"""Menteur : quatre joueurs (téléphone et PC, thèmes sombre et clair) et un robot, jusqu'à la fin de la partie.
Vérifie que les dés des autres n'arrivent JAMAIS sur un téléphone avant la levée des gobelets : chaque message reçu
est relu. Teste l'annonce (valeur, nombre), « Menteur ! », la levée, la manche suivante, l'élimination, la fin.
Usage : SRV=ws://127.0.0.1:8787 python tools/tests/menteur_play.py [BASE]   (BASE par défaut http://127.0.0.1:8767/index.html)"""
import sys, os, json, time, random
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from salon_helpers import Table

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "menteur")
random.seed(7); res = {}

with sync_playwright() as pw:
    T = Table(pw, BASE, OUT)
    kev = T.page("Kevin", 390, 844, "dark", "🦊"); lea = T.page("Léa", 1440, 900, "light", "🐸")
    tom = T.page("Tom", 390, 844, "light", "🐼"); zoe = T.page("Zoé", 1440, 900, "dark", "🦉")
    people = [kev, lea, tom, zoe]
    code = T.create(kev); res["mode"] = kev.evaluate("() => net.server ? 'serveur' : 'hôte'")
    for p in people[1:]: T.join(p, code)
    kev.click('.gcard[data-game="menteur"]'); kev.wait_for_timeout(300); kev.select_option("#opt-mt-bots", "1")
    T.shot(kev, "00-salon", True)
    kev.click("#btn-start"); kev.wait_for_selector("#s-menteur:not([hidden])", timeout=20000)
    mt = lambda p: p.evaluate("() => view?.mt || null")
    did = {"bid": 0, "call": 0, "next": 0, "raised": 0}
    t0 = time.time()
    while time.time() - t0 < 300:
        v0 = mt(kev)
        if not v0 or v0["phase"] == "over": break
        acted = False
        for p in people:
            v = mt(p)
            if not v: continue
            if v["phase"] == "bid" and v["myTurn"]:
                T.shot(p, f"01-{p._name}-a-toi")
                if v["canCall"] and (random.random() < .45 or v["bid"]["q"] > v["total"] * .5):
                    p.click(".mtx-liar"); did["call"] += 1
                else:
                    if random.random() < .3 and not p.locator(".mtx-stepbtn").last.is_disabled():
                        p.locator(".mtx-stepbtn").last.click(); did["raised"] += 1; p.wait_for_timeout(150)
                    p.click(".mtx-tray .tb-btn.hero"); did["bid"] += 1
                acted = True; break
            if v["phase"] == "reveal" and v["isHost"]:
                for q in people: T.shot(q, f"02-{q._name}-levee")
                p.wait_for_timeout(400); p.click(".mtx-tray .tb-btn.hero, .tb-tray .tb-btn.hero"); did["next"] += 1; acted = True; break
        if not acted:
            for q in people:
                v = mt(q)
                if v and v["phase"] == "bid" and not v["myTurn"]: T.shot(q, f"03-{q._name}-attend")
        kev.wait_for_timeout(500 if acted else 400)

    for p in people: p.wait_for_timeout(500)
    v = mt(kev); res["fin"] = v and {"phase": v["phase"], "manches": v["round"], "gagnant": v["winnerName"]}
    res["actions"] = did
    for q in people: T.shot(q, f"04-{q._name}-fin", True)
    # les dés des autres : jamais avant la levée des gobelets
    leaks, n = [], 0
    for name in T.frames:
        for raw, s in T.states(name, "mt"):
            n += 1
            if s["phase"] == "bid" and (s.get("reveal") or '"hands"' in raw or raw.count('"dice"') > 1): leaks.append((name, s["round"]))
    res["messages relus"] = n; res["fuites"] = leaks
    if v and v["phase"] == "over":
        kev.click(".tb-tray .tb-btn.hero"); kev.wait_for_selector("#s-lobby:not([hidden])", timeout=10000)
        res["historique"] = kev.inner_text("#lobby-history")[:160]
    res["erreurs JS"] = T.errs
    T.close()

print(json.dumps(res, ensure_ascii=False, indent=1))
ok = not res["erreurs JS"] and not res["fuites"] and res["messages relus"] > 0 and res["fin"] and res["fin"]["phase"] == "over"
print("OK" if ok else "ÉCHEC"); sys.exit(0 if ok else 1)
