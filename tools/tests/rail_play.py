"""Grandes Lignes : trois joueurs (téléphone et PC, thèmes sombre et clair) et un robot, une partie entière, au doigt.
Vérifie que la main et les billets des autres n'arrivent JAMAIS sur un téléphone avant la fin : chaque message reçu est
relu. Teste le choix des billets, la pioche (rivière et pioche cachée), la prise de lignes (touchée sur la carte et par
« Lignes possibles »), les tunnels, les billets en cours de partie, le dernier tour, le décompte et le retour au salon.
Usage : SRV=ws://127.0.0.1:8787 python tools/tests/rail_play.py [BASE]   (BASE par défaut http://127.0.0.1:8767/index.html)"""
import sys, os, json, time, random
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from salon_helpers import Table

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "rail")
random.seed(5); res = {}

# un joueur humain, joué depuis la page : il garde ses billets, prend la plus longue ligne qu'il peut payer, sinon pioche
STEP = """() => {
  const v = view?.gl; if (!v || !v.me) return 'rien';
  const q = s => document.querySelector(s), hero = () => q('#gl-main .glx-tray .tb-btn.hero:not([disabled])');
  if (v.me.offer) {
    const b = [...document.querySelectorAll('#gl-main .glx-tickets button[data-tk]')];
    if (b.length > v.me.keepMin && b[0].getAttribute('aria-pressed') === 'true' && (v.phase === 'play' || Math.random() < .7)) { b[0].click(); return 'rend'; }
    const h = hero(); if (h) { h.click(); return 'garde'; } return 'billets?';
  }
  if (v.phase !== 'play' || !v.myTurn) return 'attend';
  if (v.tunnel && v.tunnel.by === net.me) { const h = hero(); if (h) { h.click(); return 'tunnel-paye'; } q('#gl-main .glx-tray .tb-btn.glass').click(); return 'tunnel-renonce'; }
  if (GL.sel != null) { const h = hero(); if (h) { h.click(); return 'pose'; } GL.sel = null; renderRail(v); return 'annule'; }
  const L = glClaimable(v);
  if (!v.draws && L.length && (L[0].r.n >= 3 || v.me.wagons < 10 || Object.values(v.me.hand).reduce((a, b) => a + b, 0) > 12 || Math.random() < .3)) { glPick(L[0].r.id); return 'choisit'; }
  if (!v.draws && v.me.tickets.every(t => t.ok) && v.ticketsLeft && v.me.wagons > 18 && Math.random() < .5) { q('#gl-main .glx-tk-btn:not([disabled])')?.click(); return 'demande-billets'; }
  const cards = [...document.querySelectorAll('#gl-main .glx-river [data-take]:not(.off)')];
  const pickOne = cards.find(c => c.dataset.take !== '-1' && Math.random() < .5) || cards.find(c => c.dataset.take === '-1') || cards[0];
  if (pickOne) { pickOne.click(); return 'pioche'; }
  return 'bloque';
}"""

with sync_playwright() as pw:
    T = Table(pw, BASE, OUT)
    kev = T.page("Kevin", 390, 844, "dark", "🦊"); lea = T.page("Léa", 1440, 900, "light", "🐸"); tom = T.page("Tom", 390, 844, "light", "🐼")
    people = [kev, lea, tom]
    code = T.create(kev); res["mode"] = kev.evaluate("() => net.server ? 'serveur' : 'hôte'")
    for p in people[1:]: T.join(p, code)
    kev.click('.gcard[data-game="rail"]'); kev.wait_for_timeout(300); kev.select_option("#opt-gl-bots", "1")
    T.shot(kev, "00-salon", True)
    kev.click("#btn-start"); kev.wait_for_selector("#s-rail:not([hidden])", timeout=20000)
    kev.wait_for_timeout(1200)
    for p in people: T.shot(p, f"01-{p._name}-billets")
    gl = lambda p: p.evaluate("() => view?.gl || null")
    did = {}; t0 = time.time(); shots = 0; tapped = False; listed = False
    while time.time() - t0 < 900:
        v0 = gl(kev)
        if not v0 or v0["phase"] == "over": break
        acted = False
        for p in people:
            v = gl(p)
            if not v: continue
            # une fois : toucher une ligne sur la carte, au doigt ; une fois : passer par « Lignes possibles »
            if v["phase"] == "play" and v["myTurn"] and not v["draws"] and not v["me"]["offer"] and not tapped:
                L = p.evaluate("() => glClaimable(view.gl).map(x => x.r.id)")
                if L:
                    rid = L[0]
                    box = p.locator("#gl-main .glx-map svg").bounding_box()
                    pt = p.evaluate("""id => { const r = Rail.R[id], g = glGeo(r), st = GL.view, m = g.L / 2;
                      const x = g.ax + g.ux * m, y = g.ay + g.uy * m, svg = document.querySelector('#gl-main .glx-map svg'), b = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
                      return [(x - vb.x) / vb.width, (y - vb.y) / vb.height]; }""", rid)
                    p.mouse.click(box["x"] + pt[0] * box["width"], box["y"] + pt[1] * box["height"]); p.wait_for_timeout(400)
                    res["toucher une ligne"] = p.evaluate("() => GL.sel") == rid
                    T.shot(p, f"02-{p._name}-ligne-choisie")
                    tapped = True; acted = True; break
            if v["phase"] == "play" and v["myTurn"] and not v["draws"] and tapped and not listed and p.evaluate("() => glClaimable(view.gl).length") > 1:
                p.evaluate("() => { GL.sel = null; renderRail(view.gl); }"); p.click("#gl-main .glx-tray .glx-lines-btn"); p.wait_for_timeout(500); T.shot(p, f"03-{p._name}-lignes-possibles")
                p.locator("#tb-sheet [data-gl-line]").first.click(); p.wait_for_timeout(300)
                res["lignes possibles"] = p.evaluate("() => GL.sel != null"); listed = True; acted = True; break
            r = p.evaluate(STEP)
            if r not in ("attend", "rien"):
                did[r] = did.get(r, 0) + 1; acted = True
                if r == "tunnel-paye" or r == "tunnel-renonce": T.shot(p, f"04-{p._name}-tunnel")
                if r == "demande-billets": p.wait_for_timeout(400); T.shot(p, f"05-{p._name}-billets-en-cours")
                if r == "bloque": print("bloqué :", p._name, v["draws"], v["tunnel"])
                break
        if not acted and shots < 3 and v0["phase"] == "play":
            for q in people: T.shot(q, f"06-{q._name}-attend-{shots}")
            shots += 1
        if v0["phase"] == "play" and v0.get("last") and "07" not in str(T.shots):
            for q in people: T.shot(q, f"07-{q._name}-dernier-tour")
        kev.wait_for_timeout(250 if acted else 350)

    for p in people: p.wait_for_timeout(600)
    v = gl(kev); res["fin"] = v and {"phase": v["phase"], "classement": [(r["name"], r["total"], f'{r["done"]}/{len(r["tickets"])}', r["long"]) for r in (v["final"] or [])]}
    res["actions"] = did; res["durée (s)"] = round(time.time() - t0)
    for q in people: T.shot(q, f"08-{q._name}-fin", True)
    # la main et les billets des autres : jamais avant la fin
    leaks, n = [], 0
    for name in T.frames:
        for raw, s in T.states(name, "gl"):
            n += 1
            if s["phase"] != "over":
                if s.get("final"): leaks.append((name, "final"))
                for p in s["players"]:
                    if isinstance(p.get("tickets"), list) or "hand" in p: leaks.append((name, "joueur", p["name"]))
                la = s.get("lastAct") or {}
                if la.get("got") and s.get("me") is not None and not any(p["me"] and p["id"] == la.get("by") for p in s["players"]): leaks.append((name, "carte cachée"))
                if "secret" in raw: leaks.append((name, "secret"))
    res["messages relus"] = n; res["fuites"] = leaks[:10]
    if v and v["phase"] == "over":
        kev.click("#gl-main .tb-tray .tb-btn.hero"); kev.wait_for_selector("#s-lobby:not([hidden])", timeout=10000)
        res["historique"] = kev.inner_text("#lobby-history")[:160]
    res["erreurs JS"] = T.errs
    T.close()

print(json.dumps(res, ensure_ascii=False, indent=1))
ok = not res["erreurs JS"] and not res["fuites"] and res["messages relus"] > 0 and res["fin"] and res["fin"]["phase"] == "over" and res.get("toucher une ligne")
print("OK" if ok else "ÉCHEC"); sys.exit(0 if ok else 1)
