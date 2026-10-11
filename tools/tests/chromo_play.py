"""Chromo (jeu pilote du nouveau style) : partie contre 3 robots, captures téléphone et PC, à toi, poser une carte, feuilles Scores et Fil, choix de couleur."""
import sys, os, json, time
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
THEME = sys.argv[2] if len(sys.argv) > 2 else "dark"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "chromo"); os.makedirs(OUT, exist_ok=True)
res = {}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for name, w, h in [('tel', 390, 844), ('pc', 1440, 900)]:
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if w < 800 else 1)
        ctx.add_init_script(f"try {{ localStorage.setItem('dc-theme', '{THEME}'); localStorage.setItem('dc-emo', '🦊'); }} catch {{}}")
        p = ctx.new_page(); errs = []; p.on("pageerror", lambda e: errs.append(str(e)[:200]))
        p.goto(BASE + "?t=" + str(time.time())); p.wait_for_timeout(600)
        p.evaluate("s => document.getElementById('f-home').dataset.step = s", 'create'); p.fill("#in-name", "Kevin"); p.press("#in-name", "Enter")
        p.wait_for_function("() => /[A-Z]{4}/.test(document.getElementById('lobby-code').textContent)", timeout=30000)
        p.evaluate("() => document.querySelector('.gcard[data-game=chromo]').click()"); p.wait_for_timeout(300)
        p.evaluate("() => { const s = document.getElementById('opt-ch-bots'); if (s) s.value = '3'; }")
        p.evaluate("() => document.getElementById('btn-start').click()")
        p.wait_for_function("() => view && view.chromo && view.chromo.phase === 'play'", timeout=15000); p.wait_for_timeout(800)
        p.screenshot(path=f"{OUT}/{THEME}-{name}-1.png")
        p.wait_for_function("() => view.chromo.myTurn", timeout=30000); p.wait_for_timeout(700)
        p.screenshot(path=f"{OUT}/{THEME}-{name}-2-a-toi.png")
        r = {'jouables': p.evaluate("() => document.querySelectorAll('.chx-slot.ok').length"), 'main': p.evaluate("() => document.querySelectorAll('.chx-slot').length"),
             'adversaires': p.evaluate("() => document.querySelectorAll('.chx-opp').length"), 'debord': p.evaluate("() => document.documentElement.scrollWidth > innerWidth + 1")}
        # poser une carte jouable (pas un joker) si possible, sinon piocher
        played = p.evaluate("() => { const ok = [...document.querySelectorAll('.chx-slot.ok .ch-card:not(.col-w)')]; if (ok.length) { ok[0].click(); return 'pose'; } const w = document.querySelector('.chx-slot.ok .ch-card.col-w'); if (w) { w.click(); return 'joker'; } document.querySelector('.chx-acts .chx-draw')?.click(); return 'pioche'; }")
        r['action'] = played; p.wait_for_timeout(500)
        if played == 'joker':
            p.screenshot(path=f"{OUT}/{THEME}-{name}-3-couleur.png"); p.click('#ch-main .ch-swatch.col-r'); p.wait_for_timeout(500)
        p.screenshot(path=f"{OUT}/{THEME}-{name}-3-apres.png")
        if name == 'tel':
            p.click('.chx-chips .chx-chip:last-child'); p.wait_for_timeout(700); p.screenshot(path=f"{OUT}/{THEME}-{name}-4-scores.png")
            r['feuille'] = p.inner_text('#ch-sheet-body')[:120]; p.click('#ch-sheet-close'); p.wait_for_timeout(600)
            if p.is_visible('.chx-chips .chx-chip:first-child'):
                p.click('.chx-chips .chx-chip:first-child'); p.wait_for_timeout(700); p.screenshot(path=f"{OUT}/{THEME}-{name}-5-fil.png"); p.click('#ch-sheet-close')
        # laisser les robots jouer un moment : aucune erreur, la partie avance
        p.wait_for_timeout(6000); r['seq'] = p.evaluate("() => view.chromo.playSeq"); r['erreurs'] = errs
        p.screenshot(path=f"{OUT}/{THEME}-{name}-6-suite.png")
        res[name] = r; ctx.close()
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=1))
