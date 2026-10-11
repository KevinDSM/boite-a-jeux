"""Ressorts du salon : feuille qui monte, qui redescend, qu'on tire vers le bas ; pastille du contrôle segmenté ; mouvement réduit."""
import time, json
from playwright.sync_api import sync_playwright
res = {}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for rm in ['no-preference', 'reduce']:
        ctx = b.new_context(viewport={"width": 390, "height": 844}, reduced_motion=rm, has_touch=False)
        p = ctx.new_page(); errs = []; p.on("pageerror", lambda e: errs.append(str(e)[:200]))
        p.goto("http://127.0.0.1:8767/index.html?t=" + str(time.time())); p.wait_for_timeout(600)
        p.evaluate("s => document.getElementById('f-home').dataset.step = s", 'create'); p.fill("#in-name", "Kevin"); p.press("#in-name", "Enter")
        p.wait_for_function("() => /[A-Z]{4}/.test(document.getElementById('lobby-code').textContent)", timeout=30000); p.wait_for_timeout(500)
        r = {}
        p.click('#btn-help'); p.wait_for_timeout(60)
        r['ouverture_60ms'] = p.evaluate("() => document.querySelector('#help .sheet').style.transform")
        p.wait_for_timeout(900)
        r['ouverte'] = p.evaluate("() => document.querySelector('#help .sheet').style.transform")
        p.keyboard.press('Escape'); p.wait_for_timeout(60)
        r['echap_60ms'] = p.evaluate("() => [document.getElementById('help').hidden, document.getElementById('help').classList.contains('ios-closing'), getComputedStyle(document.getElementById('help')).display]")
        p.wait_for_timeout(900)
        r['echap_fin'] = p.evaluate("() => [document.getElementById('help').hidden, document.getElementById('help').classList.contains('ios-closing'), getComputedStyle(document.getElementById('help')).display]")
        # tirer la feuille vers le bas par sa poignée
        p.click('#btn-help'); p.wait_for_timeout(900)
        g = p.query_selector('#help .ih-grab').bounding_box(); x, y = g['x'] + g['width'] / 2, g['y'] + 2
        p.mouse.move(x, y); p.mouse.down()
        for i in range(1, 9): p.mouse.move(x, y + i * 35); p.wait_for_timeout(16)
        r['pendant_glisser'] = p.evaluate("() => document.querySelector('#help .sheet').style.transform")
        p.mouse.up(); p.wait_for_timeout(900)
        r['glisser_ferme'] = p.evaluate("() => document.getElementById('help').hidden")
        # petit glisser : elle revient
        p.click('#btn-help'); p.wait_for_timeout(900)
        g = p.query_selector('#help .ih-grab').bounding_box(); x, y = g['x'] + g['width'] / 2, g['y'] + 2
        p.mouse.move(x, y); p.mouse.down()
        for i in range(1, 5): p.mouse.move(x, y + i * 15); p.wait_for_timeout(60)
        p.wait_for_timeout(200); p.mouse.up(); p.wait_for_timeout(900)
        r['petit_glisser'] = p.evaluate("() => [document.getElementById('help').hidden, document.querySelector('#help .sheet').style.transform]")
        r['H'] = p.evaluate("() => document.querySelector('#help .sheet').offsetHeight")
        if not p.evaluate("() => document.getElementById('help').hidden"): p.click('#help-close'); p.wait_for_timeout(800)
        # la pastille du contrôle segmenté
        p.click('#gfilters .gfilter[data-fam]:nth-of-type(3)'); p.wait_for_timeout(80)
        mid = p.evaluate("() => document.querySelector('.gf-pill').style.transform")
        p.wait_for_timeout(900)
        r['pastille'] = p.evaluate("() => { const b = document.querySelector('#gfilters .gfilter[aria-pressed=true]'); return [document.querySelector('.gf-pill').style.transform, b.offsetLeft, document.querySelector('.gf-pill').style.width, b.offsetWidth]; }")
        r['pastille_80ms'] = mid
        r['erreurs'] = errs
        res[rm] = r; ctx.close()
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=1))
