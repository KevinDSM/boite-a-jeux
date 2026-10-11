"""Poker (nouveau style de table) : partie contre des robots, captures téléphone et PC, à toi, relance, feuilles Jetons et Fil, abattage.
Usage : poker_play.py [url] [thème dark|light] [robots]"""
import sys, os, json, time
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
THEME = sys.argv[2] if len(sys.argv) > 2 else "dark"
BOTS = sys.argv[3] if len(sys.argv) > 3 else "3"
ONLY = sys.argv[4] if len(sys.argv) > 4 else ""
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "poker"); os.makedirs(OUT, exist_ok=True)

CHECK = """() => {
  const bad = [];
  const W = innerWidth;
  if (document.documentElement.scrollWidth > W + 1) bad.push('débord horizontal ' + document.documentElement.scrollWidth);
  for (const e of document.querySelectorAll('#s-poker *')) {
    const r = e.getBoundingClientRect(); if (!r.width || getComputedStyle(e).visibility === 'hidden') continue;
    if (r.right > W + 1 || r.left < -1) { if (!e.closest('.tb-fan-hand')) bad.push('hors écran ' + e.className + ' ' + Math.round(r.left) + '..' + Math.round(r.right)); }
    if (/^(BUTTON)$/.test(e.tagName) && (r.height < 44 || r.width < 44) && !e.closest('[hidden]')) bad.push('petite cible ' + (e.textContent || '').trim().slice(0, 20) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    if (e.children.length === 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow === 'hidden' && (e.textContent || '').trim()) bad.push('texte coupé ' + e.className + ' « ' + e.textContent.trim().slice(0, 30) + ' »');
  }
  const vis = s => { const n = document.querySelector(s); if (!n) return null; const r = n.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1; };
  return { bad: bad.slice(0, 12), cartes: vis('.pkx-mine'), actions: vis('.pkx-tray .tb-acts'), board: vis('.pkx-board') };
}"""
res = {}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for name, w, h in [('tel', 390, 844), ('pc', 1440, 900)]:
        if ONLY and ONLY != name: continue
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if w < 800 else 1)
        ctx.add_init_script(f"try {{ localStorage.setItem('dc-theme', '{THEME}'); localStorage.setItem('dc-emo', '🦊'); }} catch {{}}")
        p = ctx.new_page(); errs = []; p.on("pageerror", lambda e: errs.append(str(e)[:200]))
        p.goto(BASE + "?t=" + str(time.time())); p.wait_for_timeout(600)
        p.evaluate("s => document.getElementById('f-home').dataset.step = s", 'create'); p.fill("#in-name", "Kevin"); p.press("#in-name", "Enter")
        p.wait_for_function("() => /[A-Z]{4}/.test(document.getElementById('lobby-code').textContent)", timeout=30000)
        p.evaluate("() => document.querySelector('.gcard[data-game=poker]').click()"); p.wait_for_timeout(300)
        p.evaluate(f"() => {{ const s = document.getElementById('opt-pk-bots'); if (s) s.value = '{BOTS}'; }}")
        p.evaluate("() => document.getElementById('btn-start').click()")
        p.wait_for_function("() => view && view.pk && view.pk.phase === 'hand'", timeout=15000); p.wait_for_timeout(800)
        r = {'noms': p.evaluate("() => view.pk.players.map(p => p.name)")}
        p.screenshot(path=f"{OUT}/{THEME}-{name}-1.png")
        p.wait_for_function("() => view.pk.myTurn", timeout=30000); p.wait_for_timeout(700)
        p.screenshot(path=f"{OUT}/{THEME}-{name}-2-a-toi.png")
        r['a_toi'] = p.evaluate(CHECK)
        # un raccourci de relance, puis le curseur
        if p.locator('.pkx-quick button').count():
            p.locator('.pkx-quick button').nth(2).click(); p.wait_for_timeout(300)
            r['hero'] = p.inner_text('.pkx-tray .tb-btn.hero')
            p.screenshot(path=f"{OUT}/{THEME}-{name}-3-pot.png")
        if name == 'tel':
            p.click('.tb-chips .tb-chip:last-child'); p.wait_for_timeout(700); p.screenshot(path=f"{OUT}/{THEME}-{name}-4-jetons.png")
            r['feuille'] = p.inner_text('#tb-sheet-body')[:160]; p.click('#tb-sheet-close'); p.wait_for_timeout(600)
            if p.locator('.tb-chips .tb-chip').count() > 1:
                p.click('.tb-chips .tb-chip:first-child'); p.wait_for_timeout(700); p.screenshot(path=f"{OUT}/{THEME}-{name}-5-fil.png"); p.click('#tb-sheet-close'); p.wait_for_timeout(500)
        # suivre ou parler jusqu'à l'abattage
        seen_show = False
        for i in range(80):
            ph = p.evaluate("() => view.pk.phase")
            if ph == 'show':
                if p.evaluate("() => view.pk.result && !view.pk.result.uncontested"):
                    p.wait_for_timeout(600); p.screenshot(path=f"{OUT}/{THEME}-{name}-6-abattage.png"); r['abattage'] = p.evaluate(CHECK); seen_show = True; break
                p.evaluate("() => document.querySelector('.pkx-tray .tb-btn.hero')?.click()"); p.wait_for_timeout(800); continue
            if ph == 'over': break
            if p.evaluate("() => view.pk.myTurn"):
                if not r.get('ecran_suivre') and p.evaluate("() => view.pk.toCall > 0"):
                    p.wait_for_timeout(300); p.screenshot(path=f"{OUT}/{THEME}-{name}-2b-suivre.png"); r['ecran_suivre'] = p.evaluate(CHECK)
                p.evaluate("() => { const b = [...document.querySelectorAll('.pkx-tray .tb-acts .btn')]; (b.find(x => /Suivre|Parler/.test(x.textContent)) || b[1])?.click(); }")
            p.wait_for_timeout(700)
        if not seen_show:
            r['abattage'] = 'pas vu'
        r['erreurs'] = errs; res[name] = r
        if name == 'tel':
            p.wait_for_timeout(200)
        ctx.close()
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=1))
