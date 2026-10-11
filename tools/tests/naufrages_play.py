"""Naufragés en 3D : partie contre 3 robots, l'île Three.js chargée, choix du jour, soir, vote ; téléphone et PC.
Usage : python tools/tests/naufrages_play.py [BASE] [thème]   (WebGL par SwiftShader, comme un téléphone sans carte graphique)"""
import sys, os, json, time
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
THEME = sys.argv[2] if len(sys.argv) > 2 else "dark"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "naufrages"); os.makedirs(OUT, exist_ok=True)
res = {}
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for name, w, h in [('tel', 390, 844), ('pc', 1440, 900)]:
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if w < 800 else 1)
        ctx.add_init_script(f"try {{ localStorage.setItem('dc-theme', '{THEME}'); localStorage.setItem('dc-emo', '🦊'); }} catch {{}}")
        p = ctx.new_page(); errs = []
        p.on("pageerror", lambda e: errs.append(str(e)[:200])); p.on("console", lambda c: errs.append('console: ' + c.text[:160]) if c.type in ('error', 'warning') and 'GPU stall' not in c.text and 'swiftshader' not in c.text.lower() else None)
        p.goto(BASE + "?t=" + str(time.time())); p.wait_for_timeout(600)
        p.evaluate("s => document.getElementById('f-home').dataset.step = s", 'create'); p.fill("#in-name", "Kevin"); p.press("#in-name", "Enter")
        p.wait_for_function("() => /[A-Z]{4}/.test(document.getElementById('lobby-code').textContent)", timeout=30000)
        p.evaluate("() => document.querySelector('.gcard[data-game=naufrages]').click()"); p.wait_for_timeout(300)
        p.evaluate("() => { const s = document.getElementById('opt-nf-bots'); if (s) s.value = '3'; document.getElementById('btn-start').click(); }")
        p.wait_for_function("() => view && view.nf && view.nf.phase === 'day'", timeout=15000)
        p.wait_for_function("() => typeof NF3D !== 'undefined' && (NF3D.ready() || NF3D.off())", timeout=60000); p.wait_for_timeout(2500)
        r = {'3d': p.evaluate("() => NF3D.ready()"), 'canevas': p.evaluate("() => !!document.querySelector('#s-naufrages .nf3d-canvas')"), 'etiquettes': p.evaluate("() => document.querySelectorAll('.nf3d-label').length")}
        p.screenshot(path=f"{OUT}/{THEME}-{name}-1-jour.png")
        d0 = p.evaluate("() => view.nf.day")
        p.click('.nfx-act:nth-child(3)'); p.wait_for_timeout(300); p.click('.nfx-risk-opt:nth-child(3)'); p.wait_for_timeout(500)
        r['choix'] = p.evaluate("() => view.nf.me.choice"); p.screenshot(path=f"{OUT}/{THEME}-{name}-2-choix.png")
        # les robots ont choisi : la journée se résout, le soir tombe
        p.wait_for_function(f"() => view.nf.phase !== 'day' || view.nf.day !== {d0}", timeout=40000); p.wait_for_timeout(2000)
        r['phase'] = p.evaluate("() => view.nf.phase"); p.screenshot(path=f"{OUT}/{THEME}-{name}-3-soir.png")
        if name == 'tel':
            p.click('.tb-chips .tb-chip:last-child'); p.wait_for_timeout(700); p.screenshot(path=f"{OUT}/{THEME}-{name}-4-feuille.png")
            r['feuille'] = p.inner_text('#tb-sheet-body')[:80]; p.click('#tb-sheet-close'); p.wait_for_timeout(500)
        # quelques jours de plus, pour voir la météo et le radeau changer
        for k in range(3):
            if p.evaluate("() => view.nf.phase") == 'dusk' and p.evaluate("() => view.nf.isHost"): p.evaluate("() => act({ t: 'nf:next' })")
            p.wait_for_timeout(1500)
            if p.evaluate("() => view.nf.phase === 'day' && view.nf.me && view.nf.me.canAct && !view.nf.me.choice"): p.evaluate("() => act({ t: 'nf:choose', action: 'wood', risk: 0 })")
            p.wait_for_timeout(2500)
        r['jour'] = p.evaluate("() => [view.nf.day, view.nf.phase, view.nf.weather, view.nf.wood, view.nf.seats]")
        p.screenshot(path=f"{OUT}/{THEME}-{name}-5-plus-tard.png")
        r['debord'] = p.evaluate("() => document.documentElement.scrollWidth > innerWidth + 1"); r['erreurs'] = errs
        res[name] = r; ctx.close()
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=1))
