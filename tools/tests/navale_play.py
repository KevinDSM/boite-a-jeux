"""Bataille navale : un duel Kevin (téléphone sombre) contre Léa (PC clair), Tom (téléphone clair) et Zoé (PC sombre)
regardent ; puis Kevin seul contre le robot. Placement à la main (choisir un bateau, toucher sa case), au hasard,
au doigt (glisser un bateau, toucher pour tourner), tirs jusqu'à la fin.
Vérifie que la flotte adverse n'arrive JAMAIS sur un téléphone avant la fin : chaque message reçu est relu.
Usage : SRV=ws://127.0.0.1:8787 python tools/tests/navale_play.py [BASE]   (BASE par défaut http://127.0.0.1:8767/index.html)"""
import sys, os, json, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from salon_helpers import Table

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "navale")
res = {}

def cell(p, sel, r, c):
    """Le centre d'une case de la grille (r, c) à l'écran (la grille défile d'abord dans la fenêtre)."""
    p.evaluate("s => { const e = document.querySelector(s), r = e.getBoundingClientRect(); if (r.top < 60 || r.bottom > innerHeight) scrollBy(0, r.top - 70); }", sel)
    b = p.locator(sel).bounding_box()
    return b["x"] + (c + .5) * b["width"] / 10, b["y"] + (r + .5) * b["height"] / 10

def tap(p, sel, r, c):
    x, y = cell(p, sel, r, c)
    if os.environ.get("NVDBG"): print(p._name, r, c, round(y), p.evaluate("([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.className : null }", [x, y]), p.evaluate("() => [scrollY, innerHeight]"), flush=True)
    p.mouse.click(x, y); p.wait_for_timeout(120)

def play(T, people, label, max_s=240):
    """Chacun tire à son tour, ligne après ligne ; une fois sur deux on vise puis on appuie sur Feu."""
    nv = lambda p: p.evaluate("() => view?.nv || null")
    t0, shots = time.time(), 0
    while time.time() - t0 < max_s:
        acted = False
        for p in people:
            v = nv(p)
            if not v: continue
            if v["phase"] == "over": return shots
            if v["myTurn"]:
                T.shot(p, f"{label}-02-{p._name}-tire")
                grid = v["seats"][v["me"]]["shots"]; k = next(i for i, m in enumerate(grid) if not m); r, c = divmod(k, 10)
                sea = ".nvx-board.big .nvx-sea"
                tap(p, sea, r, c)
                if shots % 2: tap(p, sea, r, c)
                else: p.click(".nvx-tray .tb-btn.hero")
                shots += 1; acted = True; p.wait_for_timeout(250); break
        if not acted:
            for p in people:
                v = nv(p)
                if v and v["phase"] == "play" and not v["myTurn"]: T.shot(p, f"{label}-03-{p._name}-attend")
            people[0].wait_for_timeout(350)
    return shots

with sync_playwright() as pw:
    T = Table(pw, BASE, OUT)
    kev = T.page("Kevin", 390, 844, "dark", "🦊"); lea = T.page("Léa", 1440, 900, "light", "🐸")
    tom = T.page("Tom", 390, 844, "light", "🐼"); zoe = T.page("Zoé", 1440, 900, "dark", "🦉")
    people = [kev, lea, tom, zoe]
    code = T.create(kev); res["mode"] = kev.evaluate("() => net.server ? 'serveur' : 'hôte'")
    for p in people[1:]: T.join(p, code)
    kev.click('.gcard[data-game="navale"]'); kev.wait_for_timeout(300)
    T.shot(kev, "00-salon", True)
    kev.click("#btn-start"); kev.wait_for_selector("#s-navale:not([hidden])", timeout=20000)
    for p in people: p.wait_for_selector(".nvx-board.big, .nvx-duo", timeout=10000)
    T.shot(kev, "A-01-Kevin-placement"); T.shot(tom, "A-01-Tom-regarde-placement")

    # Léa place à la main : un bateau, puis sa case (lignes 0, 2, 4, 6, 8)
    sea = ".nvx-board.big .nvx-sea"
    for i, k in enumerate(["pa", "cr", "ct", "sm", "tp"]):
        lea.click(f".nvx-pick:nth-child({i + 1})"); tap(lea, sea, i * 2, 1)
    T.shot(lea, "A-01-Léa-placement")
    res["Léa placés"] = lea.evaluate("() => nvPlaced().length")
    # Kevin : au hasard, puis il glisse un bateau ailleurs et en tourne un autre d'un toucher
    kev.click(".nvx-tray .tb-btn.glass >> nth=1"); kev.wait_for_timeout(200)
    before = kev.evaluate("() => JSON.stringify(nvPlaced())")
    s = kev.evaluate("() => nvPlaced().find(x => x.k === 'tp')")
    x, y = cell(kev, sea, s["r"], s["c"])
    free = kev.evaluate("s => { for (let r = 9; r >= 0; r--) for (let c = 9; c >= 0; c--) if (nvFits('tp', r, c, s.h, 'tp') && Math.abs(r - s.r) + Math.abs(c - s.c) > 2) return [r, c]; }", s)
    x2, y2 = cell(kev, sea, free[0], free[1])
    kev.mouse.move(x, y); kev.mouse.down(); kev.mouse.move((x + x2) / 2, (y + y2) / 2, steps=4); kev.mouse.move(x2, y2, steps=4); kev.mouse.up(); kev.wait_for_timeout(200)
    res["glisser"] = kev.evaluate("() => { const s = nvPlaced().find(x => x.k === 'tp'); return [s.r, s.c]; }") == free
    s = kev.evaluate("() => nvPlaced().find(x => x.k === 'cr')")
    tap(kev, sea, s["r"], s["c"]); h2 = kev.evaluate("() => nvPlaced().find(x => x.k === 'cr')?.h ?? null")
    res["toucher pour tourner"] = "tourné" if h2 is not None and h2 != s["h"] else "pas la place : soulevé, à reposer"
    if h2 is None: tap(kev, sea, s["r"], s["c"])      # reposé là où il était
    T.shot(kev, "A-01-Kevin-flotte-placee")
    res["Kevin placés"] = kev.evaluate("() => nvPlaced().length")
    lea.click(".nvx-tray .tb-btn.hero"); kev.click(".nvx-tray .tb-btn.hero")
    kev.wait_for_function("() => view?.nv?.phase === 'play'", timeout=10000)
    res["duel tirs"] = play(T, people, "A")
    for p in people: T.shot(p, f"A-04-{p._name}-fin", True)
    v = kev.evaluate("() => view.nv"); res["duel"] = {"phase": v["phase"], "gagnant": next(s["name"] for s in v["seats"] if s["id"] == v["winner"])}

    # la flotte adverse : jamais avant la fin, chez personne
    leaks, n = [], 0
    for name in T.frames:
        for raw, s in T.states(name, "nv"):
            n += 1
            if s["phase"] == "over": continue
            for k, seat in enumerate(s["seats"]):
                if seat.get("fleet") and k != s["me"]: leaks.append((name, s["phase"]))
    res["messages relus"] = n; res["fuites"] = leaks

    # partie B : Kevin contre le robot
    kev.click(".nvx-tray .tb-btn.hero"); kev.wait_for_selector("#s-lobby:not([hidden])", timeout=10000)
    res["historique"] = kev.inner_text("#lobby-history")[:160]
    kev.click('.gcard[data-game="navale"]'); kev.wait_for_timeout(300); kev.select_option("#opt-nv-rival", "robot")
    kev.click("#btn-start"); kev.wait_for_selector(".nvx-picks", timeout=20000)
    kev.click(".nvx-tray .tb-btn.glass >> nth=1"); kev.click(".nvx-tray .tb-btn.hero")
    kev.wait_for_function("() => view?.nv?.phase === 'play'", timeout=10000)
    res["contre le robot, tirs de Kevin"] = play(T, [kev, zoe], "B")
    v = kev.evaluate("() => view.nv"); res["contre le robot"] = {"phase": v["phase"], "gagnant": next(s["name"] for s in v["seats"] if s["id"] == v["winner"])}
    T.shot(kev, "B-04-Kevin-fin", True); T.shot(zoe, "B-04-Zoé-fin", True)
    res["erreurs JS"] = T.errs
    T.close()

print(json.dumps(res, ensure_ascii=False, indent=1))
ok = not res["erreurs JS"] and not res["fuites"] and res["messages relus"] > 0 and res["duel"]["phase"] == "over" and res["contre le robot"]["phase"] == "over" and res["glisser"]
print("OK" if ok else "ÉCHEC"); sys.exit(0 if ok else 1)
