"""Téléphone dessiné (hôte + invité + 2 robots) et Nom de code (hôte + 3 robots), avec captures."""
import sys, os, time, os, json
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "new2"); os.makedirs(OUT, exist_ok=True)
res = {}
url = lambda: BASE + ("&" if "?" in BASE else "?") + "t=" + str(int(time.time() * 1000))
with sync_playwright() as pw:
    b = pw.chromium.launch()
    def page(w, h, scheme="dark"):
        p = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if w < 800 else 1, color_scheme=scheme).new_page()
        errs = []; p.on("pageerror", lambda e: errs.append(str(e)[:200])); p._errs = errs
        if os.environ.get('SRV'): p.add_init_script(f"try {{ localStorage.setItem('dc-server', '{os.environ['SRV']}'); }} catch {{}}")
        p.goto(url(), wait_until="load"); p.wait_for_timeout(700); return p
    shot = lambda p, n, full=True: p.screenshot(path=f"{OUT}/{n}.png", full_page=full)

    # ================= Téléphone dessiné
    host = page(390, 844); host.evaluate("s => document.getElementById('f-home').dataset.step = s", 'create'); host.fill("#in-name", "Kevin"); host.press("#in-name", "Enter")
    host.wait_for_function("() => /[A-Z]{4}/.test(document.getElementById('lobby-code').textContent)", timeout=40000)
    code = host.evaluate("() => net.code")
    guest = page(1440, 860, "light"); guest.evaluate("s => document.getElementById('f-home').dataset.step = s", 'join'); guest.fill("#in-name", "Léa"); guest.fill("#in-code", code); guest.press("#in-code", "Enter")
    host.wait_for_function("() => view.players.filter(p => p.online).length >= 2", timeout=60000)
    host.evaluate("() => document.querySelector('.gcard[data-game=teldes]').click()"); host.wait_for_timeout(300)
    shot(host, "td-00-salon")
    host.evaluate("() => { document.getElementById('opt-td-bots').value = '2'; document.getElementById('opt-td-speed').value = 'rapide'; document.getElementById('btn-start').click(); }")
    for p in (host, guest): p.wait_for_function("() => view && view.td", timeout=20000)
    def draw(p, dx=0):
        box = p.locator('#td-main .toile-cv').bounding_box()
        x0, y0, w, h = box['x'], box['y'], box['width'], box['height']
        p.mouse.move(x0 + w * .2, y0 + h * .3); p.mouse.down()
        for k in range(12): p.mouse.move(x0 + w * (.2 + k * .05 + dx), y0 + h * (.3 + (k % 3) * .1))
        p.mouse.up()
        # un cercle fermé puis le seau dedans
        p.mouse.move(x0 + w * .65, y0 + h * .55); p.mouse.down()
        import math
        for k in range(26): a = k / 25 * 2 * math.pi; p.mouse.move(x0 + w * (.65 + .12 * math.cos(a)), y0 + h * (.65 + .15 * math.sin(a)))
        p.mouse.up()
        p.click('#td-main [data-tool=fill]'); p.click('#td-main .toile-sw[data-c="#fbbf24"]')
        p.mouse.click(x0 + w * .65, y0 + h * .65)
    steps = []
    t0 = time.time()
    while time.time() - t0 < 150:
        v = host.evaluate("() => view.td && { phase: view.td.phase, step: view.td.step }")
        if v['phase'] in ('reveal', 'over'): break
        for p, who in ((host, 'tel'), (guest, 'pc')):
            st = p.evaluate("() => { const t = view.td.task; return t ? { sub: t.submitted, phase: view.td.phase } : null; }")
            if not st or st['sub']: continue
            key = f"{st['phase']}-{v['step']}-{who}"
            if key in steps: continue
            steps.append(key)
            if st['phase'] in ('write', 'guess'):
                p.fill('#td-main .td-input', 'Un pingouin qui fait du ski' if st['phase'] == 'write' else 'Un chat content')
                shot(p, f"td-{key}")
                p.click('#td-main .td-row .btn.primary')
            else:
                draw(p)
                res['toolState'] = p.evaluate("() => [...document.querySelectorAll('#td-main [data-tool]')].map(b => b.dataset.tool + ':' + b.getAttribute('aria-checked'))")
                shot(p, f"td-{key}")
                p.click('#td-main .btn.primary.lg')
            p.wait_for_timeout(300)
        host.wait_for_timeout(500)
    res['tdSteps'] = steps
    host.wait_for_function("() => view.td.phase === 'reveal'", timeout=60000)
    guest.wait_for_timeout(500)
    for k in range(3):
        host.evaluate("() => act({ t: 'td:next' })"); host.wait_for_timeout(400)
    guest.evaluate("() => { const b = document.querySelector('#td-main button.td-heart'); if (b) b.click(); }"); guest.wait_for_timeout(500)
    shot(host, "td-lecture-tel"); guest.wait_for_timeout(300); shot(guest, "td-lecture-pc", False)
    res['guestImgs'] = guest.evaluate("() => document.querySelectorAll('#td-main .td-page img').length")
    for k in range(40):
        if host.evaluate("() => view.td.phase") == 'over': break
        host.evaluate("() => act({ t: 'td:next' })"); host.wait_for_timeout(150)
    host.wait_for_timeout(400); shot(host, "td-fin")
    res['tdRanking'] = host.evaluate("() => view.td.ranking")
    host.evaluate("() => act({ t: 'restart' })"); host.wait_for_function("() => view.phase === 'lobby'")
    res['tdHistory'] = host.evaluate("() => (view.history || []).map(h => h.name + ' ' + h.podium.map(x => x.name + ':' + x.score).join(','))")

    # ================= Nom de code (hôte + invité + 2 robots)
    host.evaluate("() => document.querySelector('.gcard[data-game=nomcode]').click()"); host.wait_for_timeout(300)
    host.evaluate("() => { document.getElementById('opt-nc-bots').value = '2'; document.getElementById('btn-start').click(); }")
    for p in (host, guest): p.wait_for_function("() => view && view.nc", timeout=20000)
    shot(host, "nc-00-equipes"); guest.wait_for_timeout(300); shot(guest, "nc-00-equipes-pc", False)
    host.evaluate("() => act({ t: 'nc:go' })")
    for p in (host, guest): p.wait_for_function("() => view.nc.phase !== 'setup'", timeout=10000)
    host.wait_for_timeout(500); shot(host, "nc-01-grille-tel"); guest.wait_for_timeout(300); shot(guest, "nc-01-grille-pc", False)
    res['ncRoles'] = [p.evaluate("() => ({ team: view.nc.me.team, spy: view.nc.me.spy, active: view.nc.active, keys: view.nc.board.filter(c => c.k !== null).length })") for p in (host, guest)]
    t0 = time.time(); acted = 0
    while time.time() - t0 < 120 and acted < 30:
        if host.evaluate("() => view.nc.phase") == 'over': break
        for p, who in ((host, 'tel'), (guest, 'pc')):
            v = p.evaluate("() => ({ canClue: view.nc.canClue, canGuess: view.nc.canGuess })")
            if v['canClue']:
                p.fill('#nc-clue', 'Truc'); p.click('#nc-main .nc-clue .btn.primary'); acted += 1
                if acted < 3: p.wait_for_timeout(300); shot(p, f"nc-02-indice-{who}")
            elif v['canGuess']:
                p.evaluate("() => { const c = [...document.querySelectorAll('#nc-main button.nc-card')][0]; c.click(); }"); p.wait_for_timeout(300)
                if acted < 4: shot(p, f"nc-03-pointe-{who}")
                p.evaluate("() => { const b = [...document.querySelectorAll('#nc-main .nc-row .btn')].find(x => /Retourner/.test(x.textContent)); if (b) b.click(); }"); acted += 1
            p.wait_for_timeout(300)
        host.wait_for_timeout(700)
    host.wait_for_timeout(500); shot(host, "nc-04-fin")
    res['ncPhase'] = host.evaluate("() => [view.nc.phase, view.nc.winner, view.nc.reason, view.nc.log]")
    res['errors'] = [host._errs, guest._errs]
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=0))
