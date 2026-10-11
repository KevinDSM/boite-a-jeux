"""Douze : cas limites par rendu forcé (à partir d'une vraie partie) : beaucoup de joueurs, colonnes retirées,
dernier tour (« a fermé »), retourner une carte. Captures dans tools/tests/out/douze/cas-*.png.
Usage : python tools/tests/douze_cas.py [url]"""
import sys, os, json, time
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "douze"); os.makedirs(OUT, exist_ok=True)
FAKE = """n => { const v = view.dz; const me = v.players.find(p => p.me);
  const names = ['🐼\\u00a0Léa', '🦁\\u00a0Maximilien', '🐸\\u00a0Zoé', '🐙\\u00a0Jean-Baptiste', '🦄\\u00a0Inès', '🐯\\u00a0Tom', '🐨\\u00a0Anaïs'];
  const grid = k => Array.from({ length: 12 }, (_, i) => (i % 4 === k % 4 && k % 3 === 0) ? null : (i + k) % 3 ? { up: false } : { up: true, v: ((i * 5 + k * 3) % 15) - 2 });
  const others = names.slice(0, n).map((nm, k) => ({ id: 'f' + k, name: nm, bot: false, online: true, me: false, current: k === 1, grid: grid(k), sum: 7 + k, upCount: 4, total: 12, score: 10 * k, closer: k === 2, revealed: true }));
  const mine = { ...me, grid: me.grid.map((c, i) => i % 4 === 3 ? null : c) };
  return renderDouze({ ...v, phase: 'play', players: [mine, ...others], currentId: 'f1', currentName: names[1], myTurn: false, taken: { v: 11, from: 'draw' }, mustFlip: false, closerName: names[2],
    me: { ...v.me, grid: mine.grid }, log: ['Léa pose un 3 à la place d’un 9.', 'Zoé a tout retourné.'] }); }"""
res = {}
MEASURE = "() => ({ debordX: document.documentElement.scrollWidth > innerWidth + 1, hauteur: document.documentElement.scrollHeight, H: innerHeight })"
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for name, w, h, counts in [('tel', 390, 844, [5, 7]), ('pc', 1440, 900, [5, 7])]:
        p = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=2 if w < 800 else 1); errs = []; p.on("pageerror", lambda e: errs.append(str(e)[:200]))
        p.goto(BASE + "?t=" + str(time.time())); p.wait_for_timeout(600)
        p.evaluate("s => document.getElementById('f-home').dataset.step = s", 'create'); p.fill("#in-name", "Kevin"); p.press("#in-name", "Enter")
        p.wait_for_function("() => /[A-Z]{4}/.test(document.getElementById('lobby-code').textContent)", timeout=30000)
        p.evaluate("() => document.querySelector('.gcard[data-game=douze]').click()"); p.evaluate("() => { document.getElementById('opt-dz-bots').value = '1'; document.getElementById('btn-start').click(); }")
        p.wait_for_function("() => view && view.dz && view.dz.phase === 'reveal'", timeout=15000); p.wait_for_timeout(400)
        p.evaluate("() => { window.__render = render; render = () => {}; }")
        for n in counts:
            p.evaluate(FAKE, n); p.wait_for_timeout(500)
            p.screenshot(path=f"{OUT}/cas-{name}-{n}.png"); res[f'{name}-{n}'] = p.evaluate(MEASURE)
        res[name + '-erreurs'] = errs
    b.close()
print(json.dumps(res, ensure_ascii=False))
