"""Accueil : « Bientôt dans la boîte » et « Vos suggestions » ; la suggestion arrive dans /stats, on l'efface.
Usage : python tools/tests/suggestions_play.py [BASE] [MDP]   (BASE = wrangler pages dev, par défaut http://127.0.0.1:8788)
Sur la vraie adresse, il écrit dans la vraie base : à éviter (ou effacer la suggestion de test ensuite, ce que fait le script)."""
import sys, os, json, time
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8788"
MDP = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("STATS_MDP_LOCAL", "test-local")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "suggestions"); os.makedirs(OUT, exist_ok=True)
res, errs = {}, []
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for theme, w, h in [('dark', 390, 844), ('light', 1440, 900)]:
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if w < 800 else 1)
        ctx.add_init_script(f"try {{ localStorage.setItem('dc-theme', '{theme}'); localStorage.setItem('dc-name', 'Léa'); }} catch {{}}")
        p = ctx.new_page(); p.on("pageerror", lambda e: errs.append(str(e)[:200]))
        p.goto(BASE + "/?t=" + str(time.time())); p.wait_for_timeout(900)
        p.screenshot(path=f"{OUT}/{theme}-{w}-accueil.png", full_page=True)
        r = {'bientot': p.inner_text('.ih-soon-t')}
        p.click('#btn-sugg'); p.wait_for_timeout(700)
        r['prenom_prerempli'] = p.input_value('#sugg-nom')
        p.click('#sugg-send'); p.wait_for_timeout(300); r['vide'] = p.inner_text('#sugg-err')
        p.fill('#sugg-texte', f'Test {theme} : un jeu de dames, et des échecs aussi !\nMerci')
        p.screenshot(path=f"{OUT}/{theme}-{w}-feuille.png")
        p.click('#sugg-send'); p.wait_for_timeout(1200)
        r['envoye'] = p.is_visible('#sugg-done'); r['merci'] = p.inner_text('#sugg-done')[:40]
        p.screenshot(path=f"{OUT}/{theme}-{w}-merci.png")
        p.click('#sugg-again'); p.fill('#sugg-texte', 'Encore une'); p.click('#sugg-send'); p.wait_for_timeout(1000)
        r['trop_vite'] = p.inner_text('#sugg-err')
        res[f'{theme}-{w}'] = r; ctx.close()
    # /stats : la suggestion y est, on l'efface
    p = b.new_page(viewport={"width": 1280, "height": 900})
    p.on("dialog", lambda d: d.accept())
    p.goto(BASE + "/stats"); p.fill("#mdp", MDP); p.press("#mdp", "Enter"); p.wait_for_timeout(1500)
    p.wait_for_selector('#sugg .sugg', timeout=8000)
    res['stats_avant'] = p.evaluate("() => [...document.querySelectorAll('#sugg .sugg')].map(x => x.innerText.replace(/\\s+/g, ' ').slice(0, 70))")
    p.locator('#sugg').screenshot(path=f"{OUT}/stats.png")
    while p.locator('#sugg [data-sdel]').count():
        n = p.locator('#sugg [data-sdel]').count()
        p.locator('#sugg [data-sdel]').first.click(); p.wait_for_timeout(300)
        p.locator('#confirm button[value=oui]').click(); p.wait_for_timeout(1200)
        if p.locator('#sugg [data-sdel]').count() >= n: break
    res['stats_apres'] = p.inner_text('#sugg')
    b.close()
res['erreurs JS'] = errs
print(json.dumps(res, ensure_ascii=False, indent=1))
