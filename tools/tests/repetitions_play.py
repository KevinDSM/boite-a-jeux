"""Pas de répétitions : Undercover et Éclair ne resservent pas ce qu'on a déjà joué.
Soirée 1 : un salon, deux parties d'Undercover (3 manches chacune, avec robots) puis deux parties d'Éclair.
Soirée 2 : nouveau salon, même téléphone d'hôte : il envoie sa mémoire au lancement, rien de déjà joué ne revient.
Vérifie aussi que la mémoire (localStorage 'dc-uc-vues' et 'dc-entendus') ne contient que des clés, pas les mots.
Usage : SRV=ws://127.0.0.1:8787 python tools/tests/repetitions_play.py [BASE]"""
import sys, os, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from salon_helpers import Table

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "repetitions")
res = {}


def uc_game(p, rounds):
    """Une partie d'Undercover jouée jusqu'au bout ; renvoie les paires (mot des civils, mot undercover)."""
    p.click('.gcard[data-game="undercover"]'); p.wait_for_timeout(300)
    p.select_option("#opt-uc-bots", "3"); p.select_option("#opt-uc-rounds", str(rounds))
    p.click("#btn-start"); p.wait_for_selector("#s-undercover:not([hidden])", timeout=20000)
    got = {}                                   # manche → paire dévoilée
    for _ in range(600):
        ph0 = view_phase(p)
        if ph0 == "lobby": break
        v = p.evaluate("() => view?.uc || null")
        if ph0 == "end" or (v and v["phase"] == "over"): p.evaluate("() => act({ t: 'restart' })"); p.wait_for_timeout(300); continue
        if not v: p.wait_for_timeout(200); continue
        if v.get("pair"): got[v["round"]] = v["pair"]
        ph = v["phase"]
        if ph == "vote":
            p.evaluate("""() => { const t = (view.uc.players || []).find(q => q.id !== net.me && q.alive !== false);
                                  if (t) act({ t: 'uc:vote', target: t.id }); act({ t: 'uc:force' }); }""")
        elif ph in ("reveal", "clues", "white-guess"): p.evaluate("() => act({ t: 'uc:force' })")
        elif ph == "elim": p.evaluate("() => act({ t: 'uc:continue' })")
        elif ph == "result": p.evaluate("() => act({ t: 'uc:next' })")
        p.wait_for_timeout(250)
    p.wait_for_selector("#s-lobby:not([hidden])", timeout=10000)
    return list(got.values())


def view_phase(p): return p.evaluate("() => view?.phase || null")


def eclair_game(p, rounds):
    """Une partie d'Éclair (années 90) où l'on abandonne chaque manche ; renvoie les morceaux entendus."""
    p.click('.gcard[data-game="eclair"]'); p.wait_for_timeout(300)
    p.evaluate("""n => { document.querySelectorAll('#opt-decades input').forEach(i => { i.checked = i.value === '1990'; });
                         const r = document.getElementById('opt-rounds'); r.innerHTML += `<option>${n}</option>`; r.value = String(n); }""", rounds)
    p.click("#btn-start"); p.wait_for_function("() => view?.phase === 'e-play'", timeout=20000)
    heard = []
    for _ in range(300):
        s = p.evaluate("() => ({ phase: view.phase, cur: view.current })")
        if s["phase"] == "e-play": p.evaluate("() => act({ t: 'e-giveup' })")
        elif s["phase"] == "e-reveal":
            heard.append(f'{s["cur"]["artist"]} | {s["cur"]["title"]}'); p.evaluate("() => act({ t: 'e-next' })")
        elif s["phase"] == "end": break
        p.wait_for_timeout(200)
    p.evaluate("() => act({ t: 'restart' })"); p.wait_for_selector("#s-lobby:not([hidden])", timeout=10000)
    return heard


with sync_playwright() as pw:
    T = Table(pw, BASE, OUT)
    kev = T.page("Kevin", 390, 844, "dark", "🦊")
    sent = []
    kev.on("websocket", lambda ws: ws.on("framesent", lambda f: sent.append(f) if isinstance(f, str) and '"start"' in f else None))
    # ---------------------------------------------------------------- soirée 1
    T.create(kev)
    uc1 = uc_game(kev, 3) + uc_game(kev, 3)
    ec1 = eclair_game(kev, 10) + eclair_game(kev, 10)
    T.shot(kev, "01-salon-soiree1")
    mem = kev.evaluate("() => ({ uc: JSON.parse(localStorage.getItem('dc-uc-vues') || '[]'), songs: JSON.parse(localStorage.getItem('dc-entendus') || '[]') })")
    words = [w for p in uc1 for w in (p["civil"], p["undercover"])]
    res["soirée 1"] = {"paires": len(uc1), "paires différentes": len({json.dumps(p, sort_keys=True) for p in uc1}),
                       "morceaux": len(ec1), "morceaux différents": len(set(ec1)),
                       "mémoire du téléphone": {"paires": len(mem["uc"]), "morceaux": len(mem["songs"])},
                       "mots en clair dans la mémoire": any(w.lower() in json.dumps(mem, ensure_ascii=False).lower() for w in words)}
    # ---------------------------------------------------------------- soirée 2 : nouveau salon, même téléphone
    T.create(kev)
    uc2 = uc_game(kev, 3); ec2 = eclair_game(kev, 10)
    k = lambda p: tuple(sorted((p["civil"], p["undercover"])))
    res["soirée 2"] = {"paires déjà jouées qui reviennent": sum(1 for p in uc2 if k(p) in {k(q) for q in uc1}),
                       "morceaux déjà entendus qui reviennent": sum(1 for x in ec2 if x in ec1)}
    res["lancements avec mémoire"] = sum(1 for f in sent if '"seen":["' in f or '"heard":["' in f)
    res["erreurs JS"] = T.errs
    T.close()

print(json.dumps(res, ensure_ascii=False, indent=1))
s1, s2 = res["soirée 1"], res["soirée 2"]
ok = (not res["erreurs JS"] and s1["paires"] >= 6 and s1["paires différentes"] == s1["paires"] and s1["morceaux"] == 20
      and s1["morceaux différents"] == 20 and not s1["mots en clair dans la mémoire"]
      and s2["paires déjà jouées qui reviennent"] == 0 and s2["morceaux déjà entendus qui reviennent"] == 0)
print("OK" if ok else "ÉCHEC"); sys.exit(0 if ok else 1)
