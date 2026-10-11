"""Bataille (nouveau style de table) : partie contre des robots, captures téléphone 390x844 et PC 1440x900,
à toi, carte posée, pli raflé, vraie bataille (si elle tombe), feuilles Les tas et Fil, puis rendus forcés :
bataille à 6 joueurs (cartes cachées + visibles) et écran de fin.
Usage : python tools/tests/bataille_play.py [url] [dark|light]"""
import sys, os, json, time
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
THEME = sys.argv[2] if len(sys.argv) > 2 else "dark"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "bataille"); os.makedirs(OUT, exist_ok=True)

CHECK = """() => {
  const vw = innerWidth, vh = innerHeight, r = e => e && e.getBoundingClientRect();
  const flip = r(document.querySelector('#bt-main .bt-flip')), pile = r(document.querySelector('#bt-main .btx-pile'));
  const small = [...document.querySelectorAll('#bt-main button, #bt-main label.btx-auto, #bt-main select, #bt-main [role=button]')]
    .filter(e => e.offsetParent).map(e => [e.className || e.tagName, Math.round(r(e).width), Math.round(r(e).height)]).filter(([, w, h]) => h < 44 || w < 44);
  const cut = [...document.querySelectorAll('#bt-main .tb-nm, #bt-main .tb-chip, #bt-main .mj-title, #bt-main .btn')].filter(e => e.offsetParent && e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim().slice(0, 30));
  return { debord: document.documentElement.scrollWidth > vw + 1,
    retourner_visible: flip ? flip.bottom <= vh + 1 && flip.top >= 0 : null, tas_visible: pile ? pile.bottom <= vh + 1 : null,
    petites_cibles: small, texte_coupe: cut };
}"""
FREEZE = "() => { if (!window.__render) window.__render = render; render = () => {}; }"
THAW = "() => { render = window.__render; render(); }"
# une bataille à 6 joueurs : deux en cause (visible, cachée, visible), les autres ont posé leur carte
FAKE_WAR6 = """() => { const v = view.bt, me = net.me;
  const C = (r, s) => ({ r, s }), names = ['🐼 Léa', '🦁 Hugo', 'Robot Zinc', '🐙 Inès', '🐯 Maxime-Alexandre'];
  const others = names.map((n, i) => ({ id: 'x' + i, name: n, bot: n.startsWith('Robot'), online: true, me: false, n: [12, 3, 9, 0, 7][i], out: i === 3, auto: i === 4, won: 0,
    need: i === 1, contest: i === 0 || i === 1, table: i === 0 ? [C('D', 'H'), null, C('7', 'S')] : i === 1 ? [C('D', 'C'), null] : i === 3 ? [] : [[C('5', 'D')], [], [C('9', 'H')], [], [C('3', 'S')]][i] }));
  const mine = { ...v.players.find(p => p.me), n: 21, need: false, contest: false, table: [C('8', 'C')] };
  renderBataille({ ...v, phase: 'flip', war: 1, wars: 3, pli: 47, canFlip: false, players: [mine, ...others], waiting: ['🦁 Hugo'],
    me: { ...v.me, inGame: true, out: false, n: 21, need: false }, log: ['Bataille entre 🐼 Léa et 🦁 Hugo.', 'Robot Zinc remporte la bataille et 6 cartes.', '🐙 Inès n’a plus de cartes. Éliminé.'] }); }"""
FAKE_OVER = """() => { const v = view.bt; const ps = v.players;
  renderBataille({ ...v, phase: 'over', reason: 'temps', pli: 214, wars: 11, best: 2, timeLeft: 0, canFlip: false,
    ranking: ps.map((p, i) => ({ id: p.id, name: p.name, score: [27, 15, 10, 0][i] ?? 0, out: i === 3 })).sort((a, b) => b.score - a.score),
    players: ps.map((p, i) => ({ ...p, n: [27, 15, 10, 0][i] ?? 0, out: i === 3, table: [], need: false })),
    log: ['Fin du temps. ' + ps[0].name + ' finit avec 27 cartes.', ps[2].name + ' remporte la bataille et 8 cartes.', 'Double bataille entre ' + ps[1].name + ' et ' + ps[2].name + '.'] }); }"""

res = {}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for name, w, h in [('tel', 390, 844), ('pc', 1440, 900)]:
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if w < 800 else 1)
        ctx.add_init_script(f"try {{ localStorage.setItem('dc-theme', '{THEME}'); localStorage.setItem('dc-emo', '🦊'); }} catch {{}}")
        p = ctx.new_page(); errs = []; p.on("pageerror", lambda e: errs.append(str(e)[:200]))
        p.goto(BASE + "?t=" + str(time.time())); p.wait_for_timeout(600)
        p.evaluate(f"() => applyTheme('{THEME}')")
        p.evaluate("s => document.getElementById('f-home').dataset.step = s", 'create'); p.fill("#in-name", "Kevin"); p.press("#in-name", "Enter")
        p.wait_for_function("() => /[A-Z]{4}/.test(document.getElementById('lobby-code').textContent)", timeout=30000)
        p.evaluate("() => document.querySelector('.gcard[data-game=bataille]').click()"); p.wait_for_timeout(300)
        p.evaluate("() => { document.getElementById('opt-bt-bots').value = '3'; document.getElementById('btn-start').click(); }")
        p.wait_for_function("() => view && view.bt && view.bt.canFlip", timeout=15000); p.wait_for_timeout(700)
        sh = lambda tag: p.screenshot(path=f"{OUT}/{THEME}-{name}-{tag}.png")
        sh('1-a-toi'); r = {'a_toi': p.evaluate(CHECK)}
        p.click('#bt-main .bt-flip'); p.wait_for_timeout(250); sh('2-pose')
        p.wait_for_function("() => view.bt.phase === 'show'", timeout=10000); p.wait_for_timeout(300); sh('3-rafle')
        # retourner jusqu'à tomber sur une vraie bataille (90 s au plus)
        got, t0 = None, time.time()
        while time.time() - t0 < 90 and not got:
            st = p.evaluate("() => ({ ph: view.bt.phase, war: view.bt.war, can: view.bt.canFlip, hidden: view.bt.players.some(q => q.table.includes(null)) })")
            if st['ph'] == 'over': break
            if st['ph'] == 'war':
                p.evaluate(FREEZE); p.wait_for_timeout(500); sh('4-bataille'); got = 'war'; p.evaluate(THAW)
            elif st['can']: p.evaluate("() => act({ t: 'bt:flip' })")
            p.wait_for_timeout(120)
        r['bataille'] = got
        if got:
            ok = True
            try: p.wait_for_function("() => view.bt.players.some(q => q.table.includes(null))", timeout=6000)
            except Exception: ok = False
            if ok: p.evaluate(FREEZE); p.wait_for_timeout(500); sh('5-cachee'); r['cachee'] = p.evaluate(CHECK); p.evaluate(THAW)
        # l'interrupteur « Retourner tout seul »
        p.click('#bt-main .btx-auto'); p.wait_for_timeout(500); r['auto'] = p.evaluate("() => view.bt.me.auto")
        sh('6-auto'); p.click('#bt-main .btx-auto'); p.wait_for_timeout(300)
        if name == 'tel':
            p.click('.tb-chips .tb-chip:last-child'); p.wait_for_timeout(700); sh('7-tas'); r['feuille'] = p.inner_text('#tb-sheet-body')[:160]
            p.click('#tb-sheet-close'); p.wait_for_timeout(600)
            if p.is_visible('.tb-chips .tb-chip:nth-child(2)'):
                p.click('.tb-chips .tb-chip:first-child'); p.wait_for_timeout(700); sh('8-fil'); p.click('#tb-sheet-close'); p.wait_for_timeout(500)
        # rendus forcés : bataille à 6, puis fin de partie
        p.evaluate(FREEZE); p.evaluate(FAKE_WAR6); p.wait_for_timeout(600); sh('9-six'); r['six'] = p.evaluate(CHECK)
        p.evaluate(FAKE_OVER); p.wait_for_timeout(500); p.screenshot(path=f"{OUT}/{THEME}-{name}-10-fin.png", full_page=True); r['fin'] = p.evaluate(CHECK)
        p.evaluate(THAW); p.wait_for_timeout(3000)
        r['erreurs'] = errs; res[name] = r; ctx.close()
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=1))
