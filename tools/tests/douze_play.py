"""Douze (nouveau style de table) : partie contre 3 robots, captures téléphone et PC.
Retourner deux cartes, piocher, échanger, défausser puis retourner, feuille des scores, fin de manche forcée.
Usage : python tools/tests/douze_play.py [url] [dark|light]"""
import sys, os, json, time
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
THEME = sys.argv[2] if len(sys.argv) > 2 else "dark"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "douze"); os.makedirs(OUT, exist_ok=True)

MEASURE = """() => {
  const H = innerHeight, W = innerWidth, q = s => document.querySelector(s);
  const grid = q('.dzx-grid'), tray = q('#dz-main .tb-tray'), r = e => e ? e.getBoundingClientRect() : null;
  const small = [...document.querySelectorAll('#s-douze button')].filter(b => b.offsetParent && !b.disabled).map(b => [b.className, Math.round(b.getBoundingClientRect().width), Math.round(b.getBoundingClientRect().height)]).filter(([c, w, h]) => w < 44 || h < 44);
  const cut = [...document.querySelectorAll('#s-douze *')].filter(e => e.offsetParent && e.children.length === 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow === 'hidden').map(e => e.className + ':' + e.textContent.slice(0, 30));
  return { debordX: document.documentElement.scrollWidth > W + 1, defile: document.documentElement.scrollHeight > H + 1, hauteur: document.documentElement.scrollHeight,
    grilleBas: grid ? Math.round(r(grid).bottom) : null, plateauBas: tray ? Math.round(r(tray).bottom) : null, H, petits: small.slice(0, 8), coupes: cut.slice(0, 8) };
}"""

FAKE = """() => { const v = view.dz; const ps = v.players;
  const rows = ps.map((p, i) => ({ id: p.id, name: p.name, raw: [12, 31, 18, 25][i % 4], points: [12, 62, 18, 25][i % 4], doubled: i === 1 })).sort((a, b) => a.points - b.points);
  const full = p => p.grid.map((c, i) => c ? { up: true, v: c.up ? c.v : ((i * 7 + p.id.length) % 15) - 2 } : null);
  return renderDouze({ ...v, phase: 'result', myTurn: false, taken: null,
    players: ps.map(p => ({ ...p, grid: full(p), current: false })),
    result: { closerId: ps[1].id, closerName: ps[1].name, rows, over: false },
    scores: rows.map(r => ({ id: r.id, name: r.name, score: r.points + 9, last: r.points, bot: r.id.startsWith('bot') })).sort((a, b) => a.score - b.score) }); }"""

res = {}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for name, w, h in [('tel', 390, 844), ('pc', 1440, 900)]:
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if w < 800 else 1)
        ctx.add_init_script(f"try {{ localStorage.setItem('dc-theme', '{THEME}'); localStorage.setItem('dc-emo', '🦊'); }} catch {{}}")
        p = ctx.new_page(); errs = []; p.on("pageerror", lambda e: errs.append((str(e) + " | " + str(getattr(e, "stack", "")))[:400]))
        shot = lambda tag: p.screenshot(path=f"{OUT}/{THEME}-{name}-{tag}.png")
        p.goto(BASE + "?t=" + str(time.time())); p.wait_for_timeout(600)
        p.evaluate("s => document.getElementById('f-home').dataset.step = s", 'create'); p.fill("#in-name", "Kevin"); p.press("#in-name", "Enter")
        p.wait_for_function("() => /[A-Z]{4}/.test(document.getElementById('lobby-code').textContent)", timeout=30000)
        p.evaluate("() => document.querySelector('.gcard[data-game=douze]').click()"); p.wait_for_timeout(300)
        p.evaluate("() => { document.getElementById('opt-dz-bots').value = '3'; document.getElementById('btn-start').click(); }")
        p.wait_for_function("() => view && view.dz && view.dz.phase === 'reveal'", timeout=15000); p.wait_for_timeout(900)
        shot('1-retourne'); r = {'retourne': p.evaluate(MEASURE)}
        for _ in range(2):
            p.evaluate("() => document.querySelector('.dzx-cell.ok')?.click()"); p.wait_for_timeout(450)
        p.wait_for_function("() => view.dz.phase === 'play'", timeout=15000)
        p.wait_for_function("() => view.dz.myTurn", timeout=30000); p.wait_for_timeout(700)
        shot('2-a-toi'); r['a_toi'] = p.evaluate(MEASURE)
        p.evaluate("() => document.querySelector('#dz-main .tb-btn.hero').click()"); p.wait_for_timeout(700)
        shot('3-pioche'); r['pioche'] = p.evaluate(MEASURE)
        p.evaluate("() => document.querySelectorAll('.dzx-cell.ok')[5].click()"); p.wait_for_timeout(500)
        shot('4-echange')
        p.wait_for_function("() => view.dz.myTurn || view.dz.phase !== 'play'", timeout=30000); p.wait_for_timeout(600)
        if p.evaluate("() => view.dz.phase === 'play'"):
            p.evaluate("() => document.querySelector('#dz-main .tb-btn.hero').click()"); p.wait_for_timeout(600)
            if p.evaluate("() => view.dz.taken && view.dz.taken.from === 'draw'"):
                p.evaluate("() => [...document.querySelectorAll('#dz-main .tb-btn')].find(b => /Défausser/.test(b.textContent)).click()"); p.wait_for_timeout(600)
                shot('5-retourner'); r['retourner'] = p.evaluate(MEASURE)
                p.evaluate("() => document.querySelector('.dzx-cell.ok')?.click()"); p.wait_for_timeout(500)
        if name == 'tel':
            p.click('#dz-main .tb-chips .tb-chip:last-child'); p.wait_for_timeout(700); shot('6-scores')
            r['feuille'] = p.inner_text('#tb-sheet-body')[:140]; p.click('#tb-sheet-close'); p.wait_for_timeout(600)
            if p.is_visible('#dz-main .tb-chips .tb-chip:first-child'):
                p.click('#dz-main .tb-chips .tb-chip:first-child'); p.wait_for_timeout(700); shot('7-fil'); p.click('#tb-sheet-close'); p.wait_for_timeout(500)
        p.wait_for_timeout(5000); shot('8-suite'); r['seq'] = p.evaluate("() => view.dz.seq"); r['noms'] = p.evaluate("() => view.dz.players.map(q => q.name)")
        # fin de manche : rendu forcé à partir de la vraie partie
        p.evaluate("() => { window.__render = render; render = () => {}; }")
        p.evaluate(FAKE); p.wait_for_timeout(500)
        p.screenshot(path=f"{OUT}/{THEME}-{name}-9-fin.png", full_page=True); r['fin'] = p.evaluate(MEASURE)
        r['erreurs'] = errs
        res[name] = r; ctx.close()
    b.close()
out = json.dumps(res, ensure_ascii=False, indent=1)
open(f"{OUT}/{THEME}-mesures.json", 'w', encoding='utf-8').write(out)
print(out)
