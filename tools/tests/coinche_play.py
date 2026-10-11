"""Coinche : Kevin (téléphone sombre, hôte), Léa (PC clair), Tom (téléphone clair) et un robot pour compléter la table ;
Zoé (PC sombre) arrive en cours de partie et regarde. Partie en 1000 jusqu'au bout.
Vérifie que les mains des autres n'arrivent JAMAIS sur un téléphone (chaque message reçu est relu), que la carte
interdite est refusée, et passe par les enchères (annonce, passe, coinche), le jeu, le décompte et la fin.
Usage : SRV=ws://127.0.0.1:8787 python tools/tests/coinche_play.py [BASE]   (BASE par défaut http://127.0.0.1:8767/index.html)"""
import sys, os, json, time, random
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from salon_helpers import Table

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "coinche")
random.seed(3); res = {}

with sync_playwright() as pw:
    T = Table(pw, BASE, OUT)
    kev = T.page("Kevin", 390, 844, "dark", "🦊"); lea = T.page("Léa", 1440, 900, "light", "🐸"); tom = T.page("Tom", 390, 844, "light", "🐼")
    zoe = T.page("Zoé", 1440, 900, "dark", "🦉")
    people = [kev, lea, tom]
    code = T.create(kev); res["mode"] = kev.evaluate("() => net.server ? 'serveur' : 'hôte'")
    for p in people[1:]: T.join(p, code)
    kev.click('.gcard[data-game="coinche"]'); kev.wait_for_timeout(300); kev.check("#opt-co-annonces")
    T.shot(kev, "00-salon", True)
    kev.click("#btn-start"); kev.wait_for_selector("#s-coinche:not([hidden])", timeout=20000)
    zoe.goto(BASE + "?t=" + str(time.time())); zoe.wait_for_timeout(500)
    zoe.evaluate("s => document.getElementById('f-home').dataset.step = s", 'join'); zoe.fill("#in-code", code); zoe.fill("#in-name", "Zoé"); zoe.click("button[data-act=join]")
    zoe.wait_for_selector("#s-coinche:not([hidden])", timeout=20000)

    co = lambda p: p.evaluate("() => view?.co || null")
    did = {"annonce": 0, "passe": 0, "coinche": 0, "surcoinche": 0, "cartes": 0, "refus": None, "donnes": 0}
    t0 = time.time()
    while time.time() - t0 < 600:
        v0 = co(kev)
        if not v0 or v0["phase"] == "over": break
        acted = False
        for p in people:
            v = co(p)
            if not v or not v["me"]: continue
            if v["phase"] == "bid" and v["myTurn"]:
                T.shot(p, f"01-{p._name}-encheres")
                if v["canSurcoinche"]:
                    if random.random() < .3: p.click(".cox-tray .tb-btn.cox-cry"); did["surcoinche"] += 1
                    else: p.click(".cox-tray .tb-btn.glass"); did["passe"] += 1
                elif v["canCoinche"] and random.random() < .2: p.click(".cox-tray .tb-btn.cox-cry"); did["coinche"] += 1
                elif v["canBid"] and p.evaluate("() => Math.max(...['S','H','D','C'].map(s => Coinche.handValue(view.co.me.hand, s))) >= 66"):
                    p.click(".cox-tray .tb-btn.hero"); did["annonce"] += 1
                else: p.click(".cox-tray .tb-btn.glass"); did["passe"] += 1
                acted = True; break
            if v["phase"] == "play" and v["myTurn"]:
                T.shot(p, f"02-{p._name}-joue")
                if did["refus"] is None and len(v["me"]["playable"]) < len(v["me"]["hand"]):
                    n = len(v["me"]["hand"])
                    p.locator(".cox-tray .tb-slot.no .km-card").first.click(); p.wait_for_timeout(300)
                    did["refus"] = {"toast": p.inner_text("#toast"), "main intacte": len(co(p)["me"]["hand"]) == n}
                    T.shot(p, f"03-{p._name}-carte-refusee")
                p.locator(".cox-tray .tb-slot.ok .km-card").first.click(); did["cartes"] += 1
                acted = True; break
            if v["phase"] == "result" and v["isHost"]:
                for q in people + [zoe]: T.shot(q, f"04-{q._name}-decompte")
                did["donnes"] += 1
                p.wait_for_timeout(300); p.click(".tb-tray .tb-btn.hero"); acted = True; break
        if not acted:
            v = co(zoe)
            if v and v["phase"] == "play": T.shot(zoe, "05-Zoé-regarde")
            kev.wait_for_timeout(350)
        else: kev.wait_for_timeout(250)

    for p in people: p.wait_for_timeout(500)
    v = co(kev); res["fin"] = v and {"phase": v["phase"], "scores": v["scores"], "donnes": v["deal"]}
    res["actions"] = did
    for q in people + [zoe]: T.shot(q, f"06-{q._name}-fin", True)
    leaks, n = [], 0
    for name in T.frames:
        for raw, s in T.states(name, "co"):
            n += 1
            if '"hands"' in raw or raw.count('"hand":[') > 1: leaks.append((name, s["phase"]))
            if name == "Zoé" and s.get("me"): leaks.append((name, "spectatrice avec une main"))
    res["messages relus"] = n; res["fuites"] = leaks
    if v and v["phase"] == "over":
        kev.click(".tb-tray .tb-btn.hero"); kev.wait_for_selector("#s-lobby:not([hidden])", timeout=10000)
        res["historique"] = kev.inner_text("#lobby-history")[:160]
    res["erreurs JS"] = T.errs
    T.close()

print(json.dumps(res, ensure_ascii=False, indent=1))
ok = not res["erreurs JS"] and not res["fuites"] and n > 0 and res["fin"] and res["fin"]["phase"] == "over" and did["refus"] and did["refus"]["main intacte"]
print("OK" if ok else "ÉCHEC"); sys.exit(0 if ok else 1)
