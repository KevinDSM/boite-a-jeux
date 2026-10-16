"""Dans l'ordre : trois joueurs (téléphone sombre, PC clair, téléphone Lavande) et un robot, une partie entière.
Vérifie : le glisser d'une carte (souris), qu'un déplacement se voit chez les autres, qu'il annule les validations,
le classement secret (relu dans CHAQUE message reçu : il n'arrive chez les autres qu'à la révélation), une manche
gagnée (classement exact) et des manches perdues, le classeur qui tourne (robot compris), la fin et le retour au salon.
Usage : SRV=ws://127.0.0.1:8787 python tools/tests/ordre_play.py [BASE]   (par défaut http://127.0.0.1:8767/index.html)"""
import sys, os, json, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from salon_helpers import Table, SRV

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "ordre")
res = {}

with sync_playwright() as pw:
    T = Table(pw, BASE, OUT)
    kev = T.page("Kevin", 390, 844, "dark", "🦊"); lea = T.page("Léa", 1440, 900, "light", "🐸"); tom = T.page("Tom", 390, 844, "lavande", "🐼")
    people = [kev, lea, tom]
    code = T.create(kev); T.join(lea, code); T.join(tom, code)
    kev.wait_for_timeout(800)
    kev.evaluate("() => document.querySelector('.gcard[data-game=ordre]').click()"); kev.wait_for_timeout(400)
    kev.evaluate("() => { document.getElementById('opt-od-bots').value = '1'; }")
    T.shot(kev, "00-salon", True)
    kev.click("#btn-start")
    for p in people: p.wait_for_function("() => view?.od?.phase === 'rank'", timeout=20000)
    od = lambda p: p.evaluate("() => view.od")
    me = lambda p: p.evaluate("() => net.me")
    page_of = lambda pid: next((p for p in people if me(p) == pid), None)

    def drag(p, card_id, rows):
        """Glisse une carte de « rows » rangs (vers le bas si positif) à la souris."""
        box = p.locator(f'.odx-card[data-id="{card_id}"]').bounding_box(); step = box["height"] + 8
        x, y = box["x"] + box["width"] * .6, box["y"] + box["height"] / 2
        p.mouse.move(x, y); p.mouse.down(); p.mouse.move(x, y + rows * step, steps=14); p.mouse.up(); p.wait_for_timeout(500)

    rounds, won, lost = 0, 0, 0
    while rounds < 12:
        v = od(kev)
        if v["phase"] == "over": break
        rounds += 1
        R = page_of(v["ranker"]["id"])
        if R:                                           # un humain classe : il bouge une carte puis valide
            R.wait_for_selector("#od-main .odx-card:not(.locked)")
            first = od(R)["cards"][0]["id"]
            before = R.evaluate("() => odDraft.slice()")
            drag(R, first, 2)
            res.setdefault("glisser-classeur", R.evaluate("() => odDraft.slice()") != before)
            T.shot(R, f"{rounds:02d}-classeur")
            R.click("text=Je valide mon classement")
        for p in people: p.wait_for_function("() => view.od.phase === 'guess'", timeout=20000)
        guessers = [p for p in people if p is not R]
        truth = od(R)["truth"] if R else None
        if rounds == 1 or truth is None:
            # un geste au doigt chez l'un, vu chez l'autre ; une validation, puis un geste qui l'annule
            a, b = guessers[0], guessers[1]
            g0 = od(a)["guess"]; drag(a, g0[0], 1)
            a.wait_for_timeout(600)
            res.setdefault("geste-vu-chez-les-autres", od(b)["guess"] == od(a)["guess"] and od(a)["guess"] != g0)
            b.click("text=On valide"); b.wait_for_timeout(500)
            res.setdefault("vote-compte", me(b) in od(a)["votes"])
            drag(a, od(a)["guess"][4], -2); a.wait_for_timeout(500)
            res.setdefault("geste-annule-les-votes", od(b)["votes"] == [])
            T.shot(lea if lea in guessers else a, f"{rounds:02d}-debat")
        if truth and won == 0:                         # une manche gagnée : on place tout dans l'ordre du classeur
            a = guessers[0]
            for i, c in enumerate(truth):
                a.evaluate("([c, i]) => act({ t: 'od:move', card: c, to: i })", [c, i]); a.wait_for_timeout(120)
        for p in guessers:
            if p.locator("text=On valide").count(): p.click("text=On valide"); p.wait_for_timeout(200)
        for p in people: p.wait_for_function("() => ['reveal', 'over'].includes(view.od.phase)", timeout=30000)
        kev.wait_for_timeout(5200)                      # la révélation carte après carte
        v = od(kev)
        if v["result"]["win"]: won += 1
        else: lost += 1
        T.shot(kev, f"{rounds:02d}-revelation"); T.shot(lea, f"{rounds:02d}-revelation-pc")
        if v["phase"] == "over": break
        kev.click("text=Manche suivante")
        for p in people: p.wait_for_function(f"() => view.od.round === {v['round'] + 1}", timeout=20000)

    res["manches"] = rounds; res["gagnees"] = won; res["perdues"] = lost
    v = od(kev); res["fin"] = [v["phase"], v["us"], v["them"]]
    T.shot(kev, "99-fin", True)
    # le classement secret n'est jamais arrivé chez quelqu'un d'autre que le classeur avant la révélation
    leak = []
    for p in people:
        mid = me(p)
        for raw, s in T.states(p._name, "od"):
            if s["phase"] in ("rank", "guess") and s.get("truth") and s["ranker"]["id"] != mid: leak.append((p._name, s["round"]))
    res["classement-secret-garde"] = not leak
    res["classeurs"] = sorted({h["ranker"] for h in v["history"]})
    kev.click("text=Retour au salon"); kev.wait_for_selector("#s-lobby:not([hidden])", timeout=15000)
    res["retour-salon"] = True
    res["erreurs"] = T.errs
    T.close()

print(json.dumps(res, ensure_ascii=False, indent=1))
ok = (res.get("glisser-classeur") and res.get("geste-vu-chez-les-autres") and res.get("vote-compte") and res.get("geste-annule-les-votes")
      and res["gagnees"] >= 1 and res["fin"][0] == "over" and res["classement-secret-garde"] and len(res["classeurs"]) >= 3 and not res["erreurs"])
print("OK" if ok else "ÉCHEC")
sys.exit(0 if ok else 1)
