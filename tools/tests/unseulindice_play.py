"""Un seul indice : trois joueurs (téléphone sombre, PC clair, téléphone Lavande) et deux robots, une partie entière.
Vérifie surtout que le mot mystère n'arrive JAMAIS sur le téléphone du devineur avant la révélation : chaque message
reçu par chaque navigateur est relu. Teste aussi l'indice repris (« Changer »), l'indice rayé à la main, la bonne
réponse, la mauvaise (la carte suivante part avec) et le passe.
Usage : python tools/tests/unseulindice_play.py [BASE] (par défaut http://127.0.0.1:8767/index.html)
Mode serveur (comme sur pages.dev) : SRV=ws://127.0.0.1:8787 (wrangler dev -c server/wrangler.jsonc --port 8787)."""
import sys, os, json, time, random
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
SRV = os.environ.get("SRV", "")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "tools", "tests", "out", "unseulindice"); os.makedirs(OUT, exist_ok=True)
ASSOC = {w: a for w, a in json.load(open(os.path.join(ROOT, "unseulindice.json"), encoding="utf-8"))["mots"]}
res, errs, frames = {}, [], {}
random.seed(4)

with sync_playwright() as pw:
    b = pw.chromium.launch()

    def page(name, w, h, theme, emo):
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if w < 800 else 1, has_touch=w < 800)
        init = f"localStorage.setItem('dc-theme', '{theme}'); localStorage.setItem('dc-emo', '{emo}');"
        if SRV: init += f"localStorage.setItem('dc-server', '{SRV}');"
        ctx.add_init_script(f"try {{ {init} }} catch {{}}")
        p = ctx.new_page(); p._name = name; frames[name] = []
        p.on("pageerror", lambda e: errs.append(f"{name}: {str(e)[:200]}"))
        p.on("websocket", lambda ws: ws.on("framereceived", lambda f: frames[name].append(f if isinstance(f, str) else "")))
        return p
    shots = set()
    def shot(p, n, full=False):
        if n in shots: return
        shots.add(n); p.screenshot(path=f"{OUT}/{n}.png", full_page=full)
    usi = lambda p: p.evaluate("() => view?.usi || null")

    kev = page("Kevin", 390, 844, "dark", "🦊"); lea = page("Léa", 1280, 860, "light", "🐸"); tom = page("Tom", 390, 844, "lavande", "🐼")
    people = [kev, lea, tom]
    kev.goto(BASE + "?t=" + str(time.time())); kev.wait_for_timeout(600)
    kev.evaluate("s => document.getElementById('f-home').dataset.step = s", 'create'); kev.fill("#in-name", "Kevin"); kev.press("#in-name", "Enter")
    kev.wait_for_function("() => /[A-Z]{4}/.test(document.getElementById('lobby-code').textContent)", timeout=40000)
    code = kev.inner_text("#lobby-code").strip(); res["salon"] = code; res["mode"] = kev.evaluate("() => net.server ? 'serveur' : 'hôte'")
    for p in (lea, tom):
        p.goto(BASE + "?t=" + str(time.time())); p.wait_for_timeout(500)
        p.evaluate("s => document.getElementById('f-home').dataset.step = s", 'join')
        p.fill("#in-code", code); p.fill("#in-name", p._name); p.click("button[data-act=join]")
        p.wait_for_selector("#s-lobby:not([hidden])", timeout=20000)
    kev.click('.gcard[data-game="unseulindice"]'); kev.wait_for_timeout(400)
    kev.select_option("#opt-usi-bots", "2"); kev.wait_for_timeout(200)
    shot(kev, "00-salon", True)
    kev.click("#btn-start"); kev.wait_for_selector("#s-unseulindice:not([hidden])", timeout=20000)

    words, plan, did = {}, ["ok", "ko", "pass", "ok"], {"back": False, "strike": False, "ko": False, "pass": False, "ok": 0}
    t0 = time.time()
    while time.time() - t0 < 240:
        vs = {p._name: usi(p) for p in people}
        v0 = next(v for v in vs.values() if v)
        if v0["phase"] == "over": break
        # le mot de la carte, vu par quelqu'un qui n'est pas le devineur
        for v in vs.values():
            if v and v.get("word") and v["phase"] in ("clues", "check", "guess"): words[v["cardNo"]] = v["word"]
        acted = False
        for p in people:
            v = vs[p._name]
            if not v or not v["me"] or not v["me"]["inGame"]: continue
            n, ph, me = v["cardNo"], v["phase"], v["me"]
            if ph == "clues" and not me["guesser"] and not me["clue"]:
                shot(p, f"01-{p._name}-indice")
                pool = [a for a in ASSOC.get(v["word"], ["truc"])]
                p.fill(".usi-in", random.choice(pool[:3])); p.click(".usi-row button[type=submit]"); acted = True
                p.wait_for_timeout(700)
                u = usi(p)
                if not did["back"] and p is tom and u["phase"] == "clues" and u["me"]["clue"]:      # Tom se ravise une fois
                    p.click(".usi-mine .btn"); p.wait_for_selector(".usi-in")
                    p.fill(".usi-in", pool[-1]); p.click(".usi-row button[type=submit]"); did["back"] = True
                break
            if ph == "check" and not me["guesser"]:
                shot(p, f"02-{p._name}-verif")
                if not did["strike"] and p is lea:   # Léa raye un indice à la main, puis le rétablit
                    e = p.locator("button.usi-easel.st-ok").first
                    if e.count():
                        e.click(); p.wait_for_timeout(500); did["strike"] = usi(p)["clues"] and any(c["why"] == "main" for c in usi(p)["clues"])
                        shot(p, "03-Léa-raye"); p.locator("button.usi-easel.st-out").first.click(); p.wait_for_timeout(400)
                p.click(".usi-form .btn.primary"); acted = True; break
            if ph == "guess" and me["guesser"]:
                shot(p, f"04-{p._name}-devine")
                want = plan[min(len(plan) - 1, did["ok"] + did["ko"] + did["pass"])]
                if want == "pass" and not did["pass"]:
                    p.click(".usi-pass"); p.wait_for_selector("#confirm:not([hidden])"); p.click("#confirm-ok"); did["pass"] = True
                else:
                    w = words.get(n, "truc") if (want == "ok" or did["ko"]) else "zzzrien"
                    p.fill(".usi-in", w); p.click(".usi-row button[type=submit]")
                    if w == "zzzrien": did["ko"] = True
                    else: did["ok"] += 1
                acted = True; break
            if ph == "reveal" and v["isHost"]:
                r = v["result"]["kind"]
                for q in people: shot(q, f"05-{q._name}-revele-{r}")
                p.click(".usi-form .btn.primary"); acted = True; break
        kev.wait_for_timeout(900 if acted else 600)

    for p in people: p.wait_for_timeout(600)
    v = usi(kev); res["fin"] = v and {"phase": v["phase"], "score": v["score"], "perdues": v["lost"], "jouées": v["played"]}
    res["meneur"] = kev.inner_text(".usi-say")
    res["actions"] = did
    for q in people: shot(q, f"06-{q._name}-fin", True)
    # le mot n'arrive jamais chez le devineur : on relit tous les messages reçus
    leaks = []
    for name, fl in frames.items():
        for f in fl:
            try: m = json.loads(f)
            except Exception: continue
            u = (m.get("s") or {}).get("usi") if m.get("t") == "state" else None
            if not u or not u.get("me", {}).get("guesser") or u["phase"] not in ("clues", "check", "guess"): continue
            w = words.get(u["cardNo"])
            if u.get("word") or (w and f'"{w}"' in f): leaks.append((name, u["cardNo"], u["phase"]))
    res["messages relus"] = sum(len(x) for x in frames.values())
    res["fuites"] = leaks
    kev.click(".usi-form .btn.primary"); kev.wait_for_selector("#s-lobby:not([hidden])", timeout=10000)
    res["historique"] = kev.inner_text("#lobby-history")[:200]
    shot(kev, "07-retour-salon", True)
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=1))
print("erreurs JS :", errs or "aucune")
ok = not errs and not res["fuites"] and res["fin"] and res["fin"]["phase"] == "over" and res["messages relus"] > 0
print("OK" if ok else "ÉCHEC"); sys.exit(0 if ok else 1)
