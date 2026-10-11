"""Salon iOS : quatre thèmes, téléphone et PC, feuilles (joueurs, inviter, règles, quitter), écran de jeu."""
import sys, os, json, time
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
THEMES = (sys.argv[2].split(',') if len(sys.argv) > 2 else ['dark', 'nuit', 'light', 'lavande'])
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "ios-salon"); os.makedirs(OUT, exist_ok=True)
res = {}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for theme in THEMES:
        for name, w, h in [('tel', 390, 844), ('pc', 1440, 900)]:
            ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if w < 800 else 1)
            ctx.add_init_script(f"try {{ localStorage.setItem('dc-theme', '{theme}'); localStorage.setItem('dc-emo', '🦊'); }} catch {{}}")
            p = ctx.new_page(); errs = []; p.on("pageerror", lambda e: errs.append(str(e)[:200]))
            p.goto(BASE + "?t=" + str(time.time()), wait_until="load"); p.wait_for_timeout(500)
            p.evaluate("s => document.getElementById('f-home').dataset.step = s", 'create'); p.fill("#in-name", "Kevin"); p.press("#in-name", "Enter")
            p.wait_for_function("() => /[A-Z]{4}/.test(document.getElementById('lobby-code').textContent)", timeout=30000)
            p.wait_for_timeout(700)
            p.screenshot(path=f"{OUT}/{theme}-{name}.png")
            if theme == THEMES[0]:
                p.screenshot(path=f"{OUT}/{theme}-{name}-full.png", full_page=True)
                p.click('#s-lobby .gcard[data-game=bataille]'); p.wait_for_timeout(600)
                p.screenshot(path=f"{OUT}/{theme}-{name}-choix.png", full_page=True)
                for btn, sheet in [('#btn-invite', 'invite'), ('#btn-help', 'help')]:
                    if p.is_visible(btn):
                        p.click(btn); p.wait_for_timeout(650)
                        p.screenshot(path=f"{OUT}/{theme}-{name}-{sheet}.png")
                        p.click(f'#{sheet}-close'); p.wait_for_timeout(600)
                        res[f'{name}-{sheet}-fermee'] = p.evaluate(f"() => document.getElementById('{sheet}').hidden")
            res[f'{theme}-{name}'] = {
                'debord': p.evaluate("() => document.documentElement.scrollWidth > innerWidth + 1"),
                'cibles<44': p.evaluate("() => [...document.querySelectorAll('#s-lobby button, #s-lobby select, #s-lobby input, #topbar button')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 44 && e.getBoundingClientRect().width > 0).map(e => (e.id || e.className || e.tagName) + ':' + Math.round(e.getBoundingClientRect().height)).slice(0, 8)"),
                'erreurs': errs,
            }
            ctx.close()
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=0))
