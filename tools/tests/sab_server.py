"""Sablier par le serveur : manche Dessin, traits en direct vers les autres téléphones, réactions, cartes trouvées."""
import sys, os, time, os, json
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
SRV = os.environ.get('SRV', 'ws://127.0.0.1:8787')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "srv"); os.makedirs(OUT, exist_ok=True)
res = {}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    def page(w, h, emo):
        p = b.new_context(viewport={"width": w, "height": h}).new_page()
        errs = []; p.on("pageerror", lambda e: errs.append(str(e)[:200])); p._errs = errs
        p.add_init_script(f"try {{ localStorage.setItem('dc-emo', '{emo}'); localStorage.setItem('dc-server', '{SRV}'); }} catch {{}}")
        p.goto(BASE + "?t=" + str(time.time()), wait_until="load"); p.wait_for_timeout(500)
        # compte ce que le serveur relaie (traits, réactions, effacements)
        p.evaluate("() => { window.__rx = {}; const f = sabOnMessage; window.sabOnMessage = m => { __rx[m.t] = (__rx[m.t] || 0) + 1; return f(m); }; }")
        return p
    host = page(390, 844, '🦊'); host.evaluate("s => document.getElementById('f-home').dataset.step = s", 'create'); host.fill("#in-name", "Kevin"); host.press("#in-name", "Enter")
    host.wait_for_function("() => view && /[A-Z]{4}/.test(document.getElementById('lobby-code').textContent)", timeout=30000)
    code = host.evaluate("() => net.code")
    guest = page(1280, 800, '🐸'); guest.evaluate("s => document.getElementById('f-home').dataset.step = s", 'join'); guest.fill("#in-name", "Léa"); guest.fill("#in-code", code); guest.press("#in-code", "Enter")
    host.wait_for_function("() => view.players.filter(p => p.online).length >= 2", timeout=30000)
    host.evaluate("() => document.querySelector('.gcard[data-game=sablier]').click()"); host.wait_for_timeout(300)
    host.evaluate("() => { const s = document.getElementById('opt-sab-bots'); if (s) s.value = '2'; document.getElementById('btn-start').click(); }")
    for p in (host, guest): p.wait_for_function("() => view && view.sab", timeout=15000)
    host.evaluate("() => act({ t: 'sab:settings', patch: { roundTypes: ['draw'], drawSeconds: 30 } })"); host.wait_for_timeout(300)
    host.evaluate("() => act({ t: 'sab:deal' })"); host.wait_for_function("() => view.sab.phase === 'selection'", timeout=8000)
    host.evaluate("() => act({ t: 'sab:force' })"); host.wait_for_timeout(800)
    res['phase0'] = host.evaluate("() => view.sab.phase")
    drew = None; t0 = time.time()
    while time.time() - t0 < 120 and not drew:
        for p, other, who in ((host, guest, 'Kevin'), (guest, host, 'Léa')):
            v = p.evaluate("() => ({ ph: view.sab.phase, me: view.sab.you?.isDescriber, starts: view.sab.turn?.startsAt })")
            if v['me'] and v['ph'] == 'turn-idle': p.evaluate("() => act({ t: 'sab:start' })")
            if v['me'] and v['ph'] == 'turn-live' and (not v['starts'] or v['starts'] < time.time() * 1000):
                p.wait_for_timeout(3200)
                for k in range(6):
                    p.evaluate(f"() => act({{ t: 'sab:seg', seg: {{ id: 's{k}', c: '#e5484d', w: 0.012, e: false, p: [0.1, {0.1 + k * 0.1}, 0.5, {0.15 + k * 0.1}, 0.9, {0.1 + k * 0.1}] }} }})")
                    p.wait_for_timeout(60)
                other.evaluate("() => act({ t: 'sab:react', e: '😂' })"); other.wait_for_timeout(300)
                p.screenshot(path=f"{OUT}/sab-dessin-{who}.png"); other.screenshot(path=f"{OUT}/sab-voit-{who}.png")
                for k in range(2): p.evaluate("() => act({ t: 'sab:guessed' })"); p.wait_for_timeout(300)
                drew = who; break
        host.wait_for_timeout(500)
    res['dessinateur'] = drew
    res['recu'] = {'Kevin': host.evaluate("() => __rx"), 'Léa': guest.evaluate("() => __rx")}
    res['trouvees'] = host.evaluate("() => view.sab.turn?.guessedCount ?? view.sab.lastTurn")
    res['errors'] = [host._errs, guest._errs]
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=0))
