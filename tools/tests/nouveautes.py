"""Les nouveautés de l'accueil : pastille rouge à la première visite, feuille lisible, pastille éteinte ensuite.
Usage : python tools/tests/nouveautes.py [BASE]"""
import sys, os, json, time
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "nouveautes"); os.makedirs(OUT, exist_ok=True)
res = {}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for theme, w, h in [('dark', 390, 844), ('light', 390, 844), ('nuit', 1440, 900)]:
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if w < 800 else 1)
        ctx.add_init_script(f"try {{ localStorage.setItem('dc-theme', '{theme}'); }} catch {{}}")
        p = ctx.new_page(); errs = []; p.on("pageerror", lambda e: errs.append(str(e)[:200]))
        p.goto(BASE + "?t=" + str(time.time())); p.wait_for_timeout(800)
        r = {'pastille_avant': p.is_visible('#btn-news .ih-dot')}
        p.screenshot(path=f"{OUT}/{theme}-{w}-accueil.png")
        p.click('#btn-news'); p.wait_for_timeout(700)
        p.screenshot(path=f"{OUT}/{theme}-{w}-feuille.png")
        r['lignes'] = p.evaluate("() => document.querySelectorAll('#news-body li').length")
        r['jours'] = p.evaluate("() => [...document.querySelectorAll('#news-body h4')].map(x => x.textContent)")
        p.click('#news-close'); p.wait_for_timeout(600)
        r['pastille_apres'] = p.is_visible('#btn-news .ih-dot')
        p.reload(); p.wait_for_timeout(800)
        r['pastille_rechargee'] = p.is_visible('#btn-news .ih-dot')
        r['icone'] = p.evaluate("() => { const i = document.querySelector('#btn-news img'); return i.complete && i.naturalWidth > 0; }")
        r['erreurs'] = errs
        res[f'{theme}-{w}'] = r; ctx.close()
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=1))
