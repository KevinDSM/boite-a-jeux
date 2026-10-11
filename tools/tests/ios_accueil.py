"""Accueil en deux temps : choix rejoindre / créer, étapes, Entrée, lien d'invitation, création réelle d'un salon."""
import sys, os, json, time
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "accueil"); os.makedirs(OUT, exist_ok=True)
res = {}
vis = lambda p, s: p.is_visible(s)
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for theme in ['dark', 'nuit', 'light', 'lavande']:
        for name, w, h in [('tel', 390, 844), ('pc', 1440, 900)]:
            ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if w < 800 else 1)
            ctx.add_init_script(f"try {{ localStorage.setItem('dc-theme', '{theme}'); localStorage.setItem('dc-name', 'Kevin'); }} catch {{}}")
            p = ctx.new_page(); errs = []; p.on("pageerror", lambda e: errs.append(str(e)[:200]))
            p.goto(BASE + "?t=" + str(time.time())); p.wait_for_timeout(700)
            p.screenshot(path=f"{OUT}/{theme}-{name}-choix.png")
            r = {'jeux_a_l_accueil': p.evaluate("() => document.querySelectorAll('#s-home [data-game]').length"),
                 'champs_visibles_au_choix': [s for s in ['#in-name', '#in-code', 'button[data-act=create]', 'button[data-act=join]'] if vis(p, s)]}
            p.click('.ih-pick[data-go=join]'); p.wait_for_timeout(200)
            p.screenshot(path=f"{OUT}/{theme}-{name}-rejoindre.png")
            r['etape_rejoindre'] = [s for s in ['#in-name', '#in-code', 'button[data-act=create]', 'button[data-act=join]'] if vis(p, s)]
            r['focus_rejoindre'] = p.evaluate("() => document.activeElement.id")
            if theme == 'dark':
                p.keyboard.press('Enter'); p.wait_for_timeout(300)        # code vide : ne doit PAS créer
                r['entree_code_vide'] = [p.evaluate("() => document.querySelector('.screen:not([hidden])').id"), p.inner_text('#home-err')]
                p.fill('#in-code', 'ab'); p.press('#in-code', 'Enter'); p.wait_for_timeout(400)
                r['code_court'] = p.inner_text('#home-err')
            p.click('#ih-back'); p.wait_for_timeout(150)
            p.click('.ih-pick[data-go=create]'); p.wait_for_timeout(200)
            p.screenshot(path=f"{OUT}/{theme}-{name}-creer.png")
            r['etape_creer'] = [s for s in ['#in-name', '#in-code', 'button[data-act=create]', 'button[data-act=join]'] if vis(p, s)]
            if theme == 'dark' and name == 'tel':
                p.keyboard.press('Escape'); p.wait_for_timeout(150); r['echap'] = p.evaluate("() => document.getElementById('f-home').dataset.step")
                p.click('.ih-pick[data-go=create]'); p.press('#in-name', 'Enter')
                p.wait_for_function("() => /[A-Z]{4}/.test(document.getElementById('lobby-code').textContent)", timeout=30000)
                r['cree'] = p.evaluate("() => [document.querySelector('.screen:not([hidden])').id, net.code]")
            r['debord'] = p.evaluate("() => document.documentElement.scrollWidth > innerWidth + 1")
            r['erreurs'] = errs
            res[f'{theme}-{name}'] = r; ctx.close()
    # lien d'invitation
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    p = ctx.new_page(); p.goto(BASE + "?c=ABCD&de=L%C3%A9a&t=" + str(time.time())); p.wait_for_timeout(700)
    p.screenshot(path=f"{OUT}/invitation.png")
    r = {'etape': p.evaluate("() => document.getElementById('f-home').dataset.step"), 'banniere': p.inner_text('#invite-banner'),
         'visibles': [s for s in ['#in-name', '#in-code', 'button[data-act=create]', 'button[data-act=join]', '#btn-own'] if vis(p, s)]}
    p.click('#btn-own'); p.wait_for_timeout(200)
    r['apres_propre_partie'] = [p.evaluate("() => document.getElementById('f-home').dataset.step"), [s for s in ['#in-name', '#in-code', 'button[data-act=create]', 'button[data-act=join]'] if vis(p, s)]]
    res['invitation'] = r
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=0))
