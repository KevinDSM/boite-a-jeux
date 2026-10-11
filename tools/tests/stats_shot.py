"""Page /stats : connexion, rendu PC (sombre) et téléphone (clair), infobulle, mauvais mot de passe."""
import sys, os, os, json
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8788"
MDP = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("STATS_MDP_LOCAL", "test-local")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "stats"); os.makedirs(OUT, exist_ok=True)
res = {}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for name, w, h, theme in [("pc", 1440, 900, None), ("tel", 390, 844, "light")]:
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if w < 800 else 1)
        if theme: ctx.add_init_script(f"try {{ localStorage.setItem('dc-theme', '{theme}'); }} catch {{}}")
        p = ctx.new_page(); errs = []; p.on("pageerror", lambda e: errs.append(str(e)[:200]))
        p.goto(BASE + "/stats", wait_until="load"); p.wait_for_timeout(300)
        p.fill("#mdp", "faux"); p.press("#mdp", "Enter"); p.wait_for_timeout(1200)
        res[name + "-faux"] = p.inner_text("#err")
        p.screenshot(path=f"{OUT}/{name}-0-connexion.png")
        p.fill("#mdp", MDP); p.press("#mdp", "Enter")
        p.wait_for_selector("#page:not([hidden])", timeout=10000); p.wait_for_timeout(300)
        p.click('#periode button[data-j="7"]'); p.wait_for_timeout(800)
        p.screenshot(path=f"{OUT}/{name}-1-page.png", full_page=True)
        bar = p.locator("#activity .cols div:not(.nil)").last
        if bar.count(): bar.hover(); p.wait_for_timeout(200); res[name + "-tip"] = p.inner_text("#tip")
        res[name + "-kpis"] = p.inner_text("#kpis").replace("\n", " | ")
        res[name + "-overflow"] = p.evaluate("() => document.documentElement.scrollWidth > innerWidth + 1")
        res[name + "-bad"] = [t for t in ['—', 'undefined', 'NaN', 'null', '[object'] if t in p.inner_text("body")]
        res[name + "-errors"] = errs
        ctx.close()
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=0))
