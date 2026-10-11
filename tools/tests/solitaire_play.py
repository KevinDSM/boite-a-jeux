"""Solitaire (nouveau style de table) : une course à deux (Kevin héberge, Léa rejoint), captures téléphone et PC.
Pioche, un vrai glisser-déposer à la souris, un toucher, la feuille « Course », une carte tenue en plein glisser,
l'écran de fin (course arrêtée) et une patience réussie en solo.
Usage : python tools/tests/solitaire_play.py [url] [dark|light] [tel,pc]"""
import sys, os, json, time
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
THEME = sys.argv[2] if len(sys.argv) > 2 else "dark"
SIZES = sys.argv[3].split(',') if len(sys.argv) > 3 else ['tel', 'pc']
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "solitaire"); os.makedirs(OUT, exist_ok=True)

# trouve un coup permis dans la page ; want = 'tab' (vers une colonne, pour glisser) ou None (n'importe lequel)
FIND = """want => {
  const c = [];
  so.tab.forEach((col, i) => col.forEach((x, k) => { if (x.up) soTargets({ from: 'tab', i, k }).forEach(t => c.push({ src: { from: 'tab', i, k }, t, len: col.length - k })); }));
  if (so.waste.length) soTargets({ from: 'waste' }).forEach(t => c.push({ src: { from: 'waste' }, t, len: 1 }));
  // pas le roi seul qui passe d'une colonne vide à une autre
  const ok = c.filter(m => !(m.src.from === 'tab' && m.src.k === 0 && m.t.to === 'tab' && !so.tab[m.t.i].length) && (!want || m.t.to === want));
  if (!ok.length) return null;
  const m = ok[0];
  const sel = m.src.from === 'waste' ? '#so-main [data-src=waste]' : `#so-main [data-src=tab][data-i="${m.src.i}"][data-k="${m.src.k}"]`;
  const a = document.querySelector(sel).getBoundingClientRect();
  const col = document.querySelector(`#so-main [data-drop="${m.t.to}"][data-i="${m.t.i}"]`);
  const last = col.lastElementChild.getBoundingClientRect();
  return { m, from: [a.left + a.width / 2, a.top + Math.min(10, a.height / 4)], to: [last.left + last.width / 2, last.top + last.height / 2], moves: so.moves };
}"""

def login(b, w, h, name, emo):
    ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if w < 800 else 1)
    ctx.add_init_script(f"try {{ localStorage.setItem('dc-theme', '{THEME}'); localStorage.setItem('dc-emo', '{emo}'); }} catch {{}}")
    p = ctx.new_page(); p._e = []; p.on("pageerror", lambda e: p._e.append(str(e)[:200]))
    p.goto(BASE + "?t=" + str(time.time())); p.wait_for_timeout(600)
    return ctx, p

def overflow(p):
    return p.evaluate("() => document.documentElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll('#so-main .so-board, #so-main .so-tab')].some(n => n.scrollWidth > n.clientWidth + 1)")

def small_targets(p):
    return p.evaluate("() => [...document.querySelectorAll('#s-solitaire button, #tb-sheet:not([hidden]) button')].filter(b => b.offsetParent && !b.classList.contains('so-stock')).map(b => { const r = b.getBoundingClientRect(); return [b.textContent.trim().slice(0, 24), Math.round(r.width), Math.round(r.height)]; }).filter(x => x[2] < 44 || x[1] < 44)")

res = {}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for name, w, h in [('tel', 390, 844), ('pc', 1440, 900)]:
        if name not in SIZES: continue
        r = {}
        hc, hp = login(b, w, h, 'Kevin', '🦊')
        hp.evaluate("s => document.getElementById('f-home').dataset.step = s", 'create'); hp.fill("#in-name", "Kevin"); hp.press("#in-name", "Enter")
        hp.wait_for_function("() => /[A-Z]{4}/.test(document.getElementById('lobby-code').textContent)", timeout=30000)
        code = hp.evaluate("() => net.code")
        gc, gp = login(b, 390, 844, 'Léa', '🐸')
        gp.evaluate("s => document.getElementById('f-home').dataset.step = s", 'join'); gp.fill('#in-code', code.lower()); gp.fill('#in-name', 'Léa'); gp.press('#in-name', 'Enter')
        gp.wait_for_function("() => !document.getElementById('s-lobby').hidden", timeout=30000)
        hp.wait_for_function("() => view.players.filter(p => p.online).length >= 2", timeout=30000)
        hp.evaluate("() => document.querySelector('.gcard[data-game=solitaire]').click()"); hp.wait_for_timeout(300)
        hp.evaluate(f"() => {{ document.getElementById('opt-so-draw').value = '{'1' if name == 'tel' else '3'}'; }}")
        hp.evaluate("() => document.getElementById('btn-start').click()")
        hp.wait_for_function("() => view && view.so && view.so.phase === 'play' && document.querySelector('#so-main .so-board')", timeout=15000)
        gp.wait_for_function("() => view && view.so && view.so.phase === 'play'", timeout=15000)
        hp.wait_for_timeout(900)
        hp.screenshot(path=f"{OUT}/{THEME}-{name}-1-donne.png")
        r['debord'] = overflow(hp); r['petites_cibles'] = small_targets(hp)
        # Léa monte quelques cartes de son côté, pour que la course bouge
        gp.evaluate("() => { act({ t: 'so:progress', found: 3, moves: 9 }); }")
        # la pioche
        hp.click('#so-main .so-stock'); hp.wait_for_timeout(450)
        r['defausse'] = hp.evaluate("() => so.waste.length")
        # un vrai glisser-déposer vers une colonne (on pioche jusqu'à en trouver un)
        mv = None
        for _ in range(40):
            mv = hp.evaluate(FIND, 'tab')
            if mv: break
            hp.click('#so-main .so-stock'); hp.wait_for_timeout(120)
        r['glisser'] = 'aucun coup trouvé'
        if mv:
            hp.mouse.move(*mv['from']); hp.mouse.down()
            hp.mouse.move(mv['from'][0] + 4, mv['from'][1] + 3, steps=2)
            hp.mouse.move(*mv['to'], steps=14); hp.wait_for_timeout(60)
            hp.screenshot(path=f"{OUT}/{THEME}-{name}-2-en-plein-glisser.png")
            held = hp.evaluate("() => ({ on: !!(soDrag && soDrag.on), over: !!(soDrag && soDrag.over), cls: document.querySelectorAll('#so-main .so-card.dragging').length })")
            hp.mouse.up(); hp.wait_for_timeout(450)
            after = hp.evaluate("() => so.moves")
            r['glisser'] = {'tenu': held, 'coup': mv['m'], 'joue': after == mv['moves'] + 1}
        # un toucher (clic simple) : la carte part toute seule à la meilleure place
        mv2 = None
        for _ in range(40):
            mv2 = hp.evaluate(FIND, None)
            if mv2: break
            hp.click('#so-main .so-stock'); hp.wait_for_timeout(120)
        r['toucher'] = 'aucun coup trouvé'
        if mv2:
            hp.mouse.click(*mv2['from']); hp.wait_for_timeout(450)
            r['toucher'] = {'coup': mv2['m'], 'joue': hp.evaluate("() => so.moves") > mv2['moves'] or hp.evaluate("() => !!soSel")}
        # un glisser lâché à côté : la pile revient, aucun coup
        mv3 = hp.evaluate(FIND, None)
        if mv3:
            m0 = hp.evaluate("() => so.moves")
            hp.mouse.move(*mv3['from']); hp.mouse.down(); hp.mouse.move(mv3['from'][0] + 30, mv3['from'][1] + 160, steps=8); hp.mouse.up(); hp.wait_for_timeout(400)
            r['lache_ailleurs_sans_coup'] = hp.evaluate("() => so.moves") == m0
        hp.wait_for_timeout(500)
        hp.screenshot(path=f"{OUT}/{THEME}-{name}-3-apres-coups.png")
        r['debord_apres'] = overflow(hp)
        # annuler
        m0 = hp.evaluate("() => so.moves"); hp.click('#so-main .sox-tray .tb-btn.glass'); hp.wait_for_timeout(400)
        r['annuler'] = hp.evaluate("() => so.moves") == m0 - 1
        if name == 'tel':
            hp.click('#so-main .tb-chips .tb-chip'); hp.wait_for_timeout(700)
            hp.screenshot(path=f"{OUT}/{THEME}-{name}-4-course.png")
            r['feuille'] = hp.inner_text('#tb-sheet-body')[:160]; r['petites_cibles_feuille'] = small_targets(hp)
            hp.click('#tb-sheet-close'); hp.wait_for_timeout(600)
        # Léa voit la même donne
        gp.wait_for_timeout(300); gp.screenshot(path=f"{OUT}/{THEME}-{name}-5-lea.png")
        r['meme_donne'] = gp.evaluate("() => so.seed") == hp.evaluate("() => so.seed")
        # la fin : l'hôte arrête la course
        hp.evaluate("() => act({ t: 'so:end' })")
        hp.wait_for_function("() => view.so.phase === 'over'", timeout=10000); hp.wait_for_timeout(800)
        hp.screenshot(path=f"{OUT}/{THEME}-{name}-6-fin.png")
        gp.wait_for_function("() => view.so.phase === 'over'", timeout=10000); gp.wait_for_timeout(500)
        gp.screenshot(path=f"{OUT}/{THEME}-{name}-6-fin-lea.png")
        r['debord_fin'] = overflow(hp); r['petites_cibles_fin'] = small_targets(hp)
        r['erreurs'] = hp._e + gp._e
        hc.close(); gc.close()

        # une patience réussie, en solo : on range toutes les cartes sur les fondations
        sc, sp = login(b, w, h, 'Kevin', '🦊')
        sp.evaluate("s => document.getElementById('f-home').dataset.step = s", 'create'); sp.fill("#in-name", "Kevin"); sp.press("#in-name", "Enter")
        sp.wait_for_function("() => /[A-Z]{4}/.test(document.getElementById('lobby-code').textContent)", timeout=30000)
        sp.evaluate("() => document.querySelector('.gcard[data-game=solitaire]').click()"); sp.wait_for_timeout(300)
        sp.evaluate("() => document.getElementById('btn-start').click()")
        sp.wait_for_function("() => view && view.so && view.so.phase === 'play' && document.querySelector('#so-main .so-board')", timeout=15000); sp.wait_for_timeout(500)
        sp.screenshot(path=f"{OUT}/{THEME}-{name}-7-solo.png")
        # presque fini : tout découvert, la fin automatique est proposée
        sp.evaluate("""() => {
          const all = []; ['S', 'H', 'D', 'C'].forEach(s => SO_RANKS.forEach(r => all.push({ r, s, up: true })));
          so.found = [0, 1, 2, 3].map(i => all.slice(i * 13, i * 13 + 9));
          so.tab = [[], [], [], [], [], [], []]; let j = 0;
          for (let rank = 12; rank >= 9; rank--) [0, 1, 2, 3].forEach(i => so.tab[j++ % 7].push(all[i * 13 + rank]));
          so.tab.forEach(col => col.sort((a, b) => soVal(b) - soVal(a)));
          so.stock = []; so.waste = []; soChanged();
        }""")
        sp.wait_for_timeout(600)
        sp.screenshot(path=f"{OUT}/{THEME}-{name}-8-finir.png")
        fin = sp.query_selector('#so-main .tb-btn.hero')
        r['solo_finir_propose'] = bool(fin)
        if fin: fin.click()
        sp.wait_for_function("() => view.so.phase === 'over'", timeout=20000); sp.wait_for_timeout(900)
        sp.screenshot(path=f"{OUT}/{THEME}-{name}-9-gagne.png")
        r['solo_gagne'] = sp.evaluate("() => view.so.players[0].done")
        r['erreurs_solo'] = sp._e
        sc.close()
        res[name] = r
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=1))
