"""Chromo : écran de fin de manche (rendu forcé à partir d'une vraie partie)."""
import sys, os, time
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "chromo"); os.makedirs(OUT, exist_ok=True)
FAKE = """() => { const v = view.chromo; return renderChromo({ ...v, phase: 'result', result: { winnerId: net.me, winnerName: 'Kevin', points: 23,
  hands: v.players.filter(p => p.id !== net.me).map((p, i) => ({ id: p.id, name: p.name, points: 25 - i * 7, cards: [{ id: 'a' + i, c: 'r', v: '5' }, { id: 'b' + i, c: 'w', v: '+4' }, { id: 'c' + i, c: 'b', v: 'skip' }].slice(0, 3 - i) })) },
  scores: v.players.map((p, i) => ({ id: p.id, name: p.name, score: p.id === net.me ? 23 : 0, bot: p.bot })).sort((a, b) => b.score - a.score) }); }"""
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for name, w, h in [('tel', 390, 844), ('pc', 1440, 900)]:
        p = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=2 if w < 800 else 1); errs = []; p.on("pageerror", lambda e: errs.append(str(e)[:200]))
        p.goto(BASE + "?t=" + str(time.time())); p.wait_for_timeout(600)
        p.evaluate("s => document.getElementById('f-home').dataset.step = s", 'create'); p.fill("#in-name", "Kevin"); p.press("#in-name", "Enter")
        p.wait_for_function("() => /[A-Z]{4}/.test(document.getElementById('lobby-code').textContent)", timeout=30000)
        p.evaluate("() => document.querySelector('.gcard[data-game=chromo]').click()"); p.evaluate("() => { document.getElementById('opt-ch-bots').value = '2'; document.getElementById('btn-start').click(); }")
        p.wait_for_function("() => view && view.chromo && view.chromo.phase === 'play'", timeout=15000); p.wait_for_timeout(400)
        p.evaluate("() => { window.__render = render; render = () => {}; }")      # on fige l'écran le temps de la capture
        p.evaluate(FAKE); p.wait_for_timeout(500); p.screenshot(path=f"{OUT}/fin-{name}.png", full_page=True)
        print(name, errs)
    b.close()
