import sys, time, json
from playwright.sync_api import sync_playwright
BASE = sys.argv[1]
with sync_playwright() as pw:
    b = pw.chromium.launch(); res = {}
    def page(emo):
        ctx = b.new_context(viewport={"width": 390, "height": 844}); ctx.add_init_script(f"try {{ localStorage.setItem('dc-emo', '{emo}'); }} catch {{}}")
        p = ctx.new_page(); p._e = []; p.on("pageerror", lambda e: p._e.append(str(e)[:150])); p.goto(BASE + "?t=" + str(time.time())); p.wait_for_timeout(800); return p
    h = page('🦊'); h.evaluate("s => document.getElementById('f-home').dataset.step = s", 'create'); h.fill('#in-name', 'Kevin'); h.click('button[data-act=create]')
    h.wait_for_function("() => /[A-Z]{4}/.test(document.getElementById('lobby-code').textContent)", timeout=30000)
    code = h.evaluate("() => net.code"); res['mode_serveur'] = h.evaluate("() => !!SALON_WS")
    g = page('🐸'); g.fill('#in-code', code.lower()); g.evaluate("s => document.getElementById('f-home').dataset.step = s", 'join'); g.fill('#in-name', 'Léa'); g.press('#in-name', 'Enter')
    g.wait_for_function("() => !document.getElementById('s-lobby').hidden", timeout=30000)
    i = b.new_context(viewport={"width": 390, "height": 844}).new_page(); i.goto(f"{BASE}?c={code}&de=Kevin&t={time.time()}"); i.wait_for_timeout(800)
    i.evaluate("s => document.getElementById('f-home').dataset.step = s", 'join'); i.fill('#in-name', 'Tom'); i.click('button[data-act=join]')
    i.wait_for_function("() => !document.getElementById('s-lobby').hidden", timeout=30000)
    h.wait_for_function("() => view.players.filter(p => p.online).length >= 3", timeout=30000)
    res['joueurs'] = h.evaluate("() => view.players.map(p => p.name)"); res['erreurs'] = h._e + g._e
    print(json.dumps(res, ensure_ascii=False)); b.close()
