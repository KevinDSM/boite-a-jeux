"""Après fusion : lance chacun des jeux (robots si besoin), laisse tourner, capture, relève erreurs et polices chargées."""
import sys, os, time, os, json
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
W = int(sys.argv[2]) if len(sys.argv) > 2 else 390
THEME = sys.argv[3] if len(sys.argv) > 3 else "dark"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", f"all-{W}-{THEME}"); os.makedirs(OUT, exist_ok=True)
GAMES = [('timeline', None), ('eclair', None), ('sprint', None), ('sablier', 'sab'), ('undercover', 'uc'), ('geo', None), ('chromo', 'ch'), ('kems', 'km'),
         ('mirage', 'mi'), ('douze', 'dz'), ('petitbac', None), ('loupgarou', 'lw'), ('naufrages', 'nf'), ('memes', 'mm'), ('limite', 'hl'),
         ('solitaire', None), ('poker', 'pk'), ('diapason', 'dp'), ('duel', None), ('teldes', 'td'), ('nomcode', 'nc'), ('bataille', 'bt'), ('unseulindice', 'usi'), ('menteur', 'mt'), ('navale', 'nv'), ('coinche', 'co')]
BOTS = {'sab': 3, 'uc': 4, 'ch': 2, 'km': 3, 'mi': 3, 'dz': 2, 'lw': 5, 'nf': 3, 'mm': 3, 'hl': 3, 'pk': 2, 'dp': 3, 'td': 3, 'nc': 3, 'bt': 2, 'usi': 3, 'mt': 3, 'nv': 0, 'co': 3}
ONLY = sys.argv[4].split(',') if len(sys.argv) > 4 else None
res = {}; fonts = set()
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for g, bk in GAMES:
        if ONLY and g not in ONLY: continue
        p = b.new_page(viewport={"width": W, "height": 844 if W < 800 else 860}, device_scale_factor=2 if W < 800 else 1)
        errs = []; p.on("pageerror", lambda e: errs.append(str(e)[:200]))
        if os.environ.get('SRV'): p.add_init_script(f"try {{ localStorage.setItem('dc-server', '{os.environ['SRV']}'); }} catch {{}}")
        try:
            p.goto(BASE + "?t=" + str(time.time()), wait_until="load"); p.wait_for_timeout(600)
            p.evaluate(f"() => applyTheme('{THEME}')")
            p.evaluate("s => document.getElementById('f-home').dataset.step = s", 'create'); p.fill("#in-name", "Kevin"); p.press("#in-name", "Enter")
            p.wait_for_function("() => /[A-Z]{4}/.test(document.getElementById('lobby-code').textContent)", timeout=40000)
            p.evaluate(f"() => document.querySelector('.gcard[data-game={g}]').click()"); p.wait_for_timeout(400)
            if bk: p.evaluate(f"() => {{ const s = document.getElementById('opt-{bk}-bots'); if (s) s.value = '{BOTS[bk]}'; }}")
            if g == 'duel': p.evaluate("() => { document.getElementById('opt-du-rival').value = 'robot'; }")
            if g == 'navale': p.evaluate("() => { document.getElementById('opt-nv-rival').value = 'robot'; }")
            if g == 'coinche': p.evaluate("() => { document.getElementById('opt-co-bots').checked = true; }")
            p.evaluate("() => document.getElementById('btn-start').click()")
            p.wait_for_timeout(2500)
            if g == 'sablier':
                p.evaluate("() => act({ t: 'sab:deal' })"); p.wait_for_timeout(1500)
            p.wait_for_timeout(4000)
            shown = p.evaluate("() => [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.id")
            p.screenshot(path=f"{OUT}/{g}.png", full_page=True)
            txt = p.evaluate("() => [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.innerText || ''")
            bad = [t for t in ['…', '—', '(0/', 'undefined', 'NaN', '[object'] if t in txt]
            ff = p.evaluate("() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/\"/g, ''))")
            fonts.update(ff)
            overflow = p.evaluate("() => document.documentElement.scrollWidth > innerWidth + 1")
            mode = p.evaluate("() => net.server ? 'serveur' : 'hôte'")
            res[g] = {"mode": mode, "screen": shown, "errors": errs, "bad": bad, "overflow": overflow, "fonts": sorted(set(ff))}
        except Exception as e:
            res[g] = {"exception": str(e)[:200], "errors": errs}
        p.close()
    b.close()
json.dump({"res": res, "fonts": sorted(fonts)}, open(f"{OUT}/report.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for g, r in res.items(): print(g, r.get('mode'), r.get('screen'), 'ERR' if r.get('errors') or r.get('exception') else 'ok', r.get('bad'), 'OVERFLOW' if r.get('overflow') else '', r.get('exception', ''))
print('polices chargées :', sorted(fonts))
