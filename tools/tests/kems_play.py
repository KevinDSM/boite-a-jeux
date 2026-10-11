"""Kems (nouveau style de table) : partie contre 3 robots, captures téléphone et PC.
Choisir une carte, échanger, armer Kems, feuilles Scores et Fil, passer, puis un Contre-Kems pour finir la donne,
et enchaîner jusqu'à la fin de la partie (en 3 points). Usage : kems_play.py [url] [dark|light]"""
import sys, os, json, time
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
THEME = sys.argv[2] if len(sys.argv) > 2 else "dark"
ONLY = sys.argv[3] if len(sys.argv) > 3 else None
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "kems"); os.makedirs(OUT, exist_ok=True)

CHECK = """() => {
  const vw = innerWidth, vh = innerHeight, r = {};
  r.debord = document.documentElement.scrollWidth > vw + 1;
  const tray = document.querySelector('#km-main .tb-tray');
  if (tray) { const b = tray.getBoundingClientRect(); r.plateau = [Math.round(b.top), Math.round(b.bottom)]; r.plateau_visible = b.top >= 0 && b.bottom <= vh + 1; }
  const btns = [...document.querySelectorAll('#km-main button')].filter(b => b.offsetParent);
  r.petits = btns.map(b => b.getBoundingClientRect()).filter(b => b.height < 44 && b.width > 0 && b.height > 0).length;
  r.petits_detail = btns.filter(b => { const q = b.getBoundingClientRect(); return q.height < 44; }).map(b => b.className + ' ' + Math.round(b.getBoundingClientRect().height)).slice(0, 6);
  r.hors_ecran = [...document.querySelectorAll('#km-main *')].filter(n => { const q = n.getBoundingClientRect(); return q.width && (q.right > vw + 1 || q.left < -1); }).map(n => n.className).slice(0, 6);
  r.coupe = [...document.querySelectorAll('#km-main .tb-nm, #km-main .tb-chip, #km-main .tb-n, #km-main .km-reveal-head b')].filter(n => n.scrollWidth > n.clientWidth + 1).map(n => n.textContent).slice(0, 6);
  return r;
}"""

res = {}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for name, w, h in [('tel', 390, 844), ('pc', 1440, 900)]:
        if ONLY and name != ONLY: continue
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if w < 800 else 1)
        ctx.add_init_script(f"try {{ localStorage.setItem('dc-theme', '{THEME}'); localStorage.setItem('dc-emo', '🦊'); }} catch {{}}")
        p = ctx.new_page(); errs = []; p.on("pageerror", lambda e: errs.append(str(e)[:200]))
        shot = lambda tag, full=False: p.screenshot(path=f"{OUT}/{THEME}-{name}-{tag}.png", full_page=full)
        p.goto(BASE + "?t=" + str(time.time())); p.wait_for_timeout(600)
        p.evaluate("s => document.getElementById('f-home').dataset.step = s", 'create'); p.fill("#in-name", "Kevin"); p.press("#in-name", "Enter")
        p.wait_for_function("() => /[A-Z]{4}/.test(document.getElementById('lobby-code').textContent)", timeout=30000)
        p.evaluate("() => document.querySelector('.gcard[data-game=kems]').click()"); p.wait_for_timeout(300)
        p.evaluate("() => { const c = document.getElementById('opt-km-bots'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); const t = document.getElementById('opt-km-target'); t.value = '3'; t.dispatchEvent(new Event('change', { bubbles: true })); }")
        p.wait_for_timeout(200)
        p.evaluate("() => document.getElementById('btn-start').click()")
        try: p.wait_for_function("() => view && view.kems && view.kems.phase === 'play'", timeout=15000)
        except Exception: shot('0-echec'); print('ECHEC DU LANCEMENT', errs, p.evaluate("() => document.querySelector('.toast')?.textContent")); raise
        p.wait_for_timeout(900)
        r = {}
        shot('1-table'); r['1'] = p.evaluate(CHECK)
        r['sieges'] = p.evaluate("() => [...document.querySelectorAll('.kmx-table .tb-opp')].map(o => o.className.replace('tb-opp', '').trim() + ' : ' + o.querySelector('.tb-nm').textContent)")
        # états rares, rendus à partir de la vraie vue (écran figé le temps de la capture) : signe du partenaire, carré en main
        p.evaluate("() => { window.__render = render; render = () => {}; const v = view.kems; renderKems({ ...v, me: { ...v.me, signal: true } }); }"); p.wait_for_timeout(400)
        shot('1b-signe')
        p.evaluate("() => { const v = view.kems, r = v.me.hand[0].r; renderKems({ ...v, me: { ...v.me, signal: false, carre: true, hand: v.me.hand.map((c, i) => ({ ...c, r: 'R', s: 'SHDC'[i] })) } }); }"); p.wait_for_timeout(400)
        shot('1c-carre')
        p.evaluate("() => { render = window.__render; renderKems(view.kems); }"); p.wait_for_timeout(300)
        # une carte du milieu d'abord : toute la main s'offre
        p.evaluate("() => document.querySelector('.kmx-mid .km-card').click()"); p.wait_for_timeout(350)
        shot('2b-milieu')
        p.evaluate("() => document.querySelector('.kmx-mid .km-card').click()"); p.wait_for_timeout(300)
        # choisir une carte de la main, puis l'échanger contre une carte du milieu
        p.evaluate("() => document.querySelector('.kmx-tray .tb-slot .km-card').click()"); p.wait_for_timeout(350)
        shot('2-choix'); r['2'] = p.evaluate(CHECK)
        p.evaluate("() => document.querySelector('.kmx-mid .km-card')?.click()"); p.wait_for_timeout(500)
        # armer Kems (un seul toucher), sans confirmer
        if p.evaluate("() => view.kems.phase") == 'play':
            p.evaluate("() => document.querySelector('.km-kems')?.click()"); p.wait_for_timeout(250)
            shot('3-arme'); r['3'] = p.evaluate(CHECK); r['arme'] = p.evaluate("() => document.querySelector('.km-kems')?.textContent")
            p.wait_for_timeout(2700)
        if name == 'tel' and p.evaluate("() => view.kems.phase") == 'play':
            p.evaluate("() => document.querySelector('.tb-chips .tb-chip:last-child').click()"); p.wait_for_timeout(700)
            shot('4-scores'); r['feuille'] = p.inner_text('#tb-sheet-body')[:160]
            p.click('#tb-sheet-close'); p.wait_for_timeout(600)
            if p.evaluate("() => document.querySelectorAll('.tb-chips .tb-chip').length > 1 && view.kems.phase === 'play'"):
                p.evaluate("() => document.querySelector('.tb-chips .tb-chip:first-child').click()"); p.wait_for_timeout(700)
                shot('5-fil'); p.click('#tb-sheet-close'); p.wait_for_timeout(600)
        if p.evaluate("() => view.kems.phase") == 'play':
            p.evaluate("() => document.querySelector('.kmx-passbtn')?.click()"); p.wait_for_timeout(500)
            shot('6-passe'); r['6'] = p.evaluate(CHECK)
        # finir la donne : Contre-Kems (deux touchers) si personne n'a crié avant
        if p.evaluate("() => view.kems.phase") == 'play':
            p.evaluate("() => document.querySelector('.km-contre')?.click()"); p.wait_for_timeout(200)
            p.evaluate("() => document.querySelector('.km-contre')?.click()")
        p.wait_for_function("() => view.kems.phase !== 'play'", timeout=20000); p.wait_for_timeout(700)
        shot('7-fin-donne'); shot('7-fin-donne-page', True); r['7'] = p.evaluate(CHECK)
        r['fin'] = p.inner_text('#km-main .tb-say')[:160]
        # enchaîner jusqu'à la fin de la partie
        for _ in range(8):
            if p.evaluate("() => view.kems.phase") == 'over': break
            p.evaluate("() => [...document.querySelectorAll('#km-main .btn.primary')].pop()?.click()"); p.wait_for_timeout(900)
            if p.evaluate("() => view.kems.phase") == 'play':
                p.evaluate("() => { document.querySelector('.km-contre')?.click(); document.querySelector('.km-contre')?.click(); }")
                p.wait_for_function("() => view.kems.phase !== 'play'", timeout=20000); p.wait_for_timeout(500)
        if p.evaluate("() => view.kems.phase") == 'over':
            p.wait_for_timeout(500); shot('8-fin-partie'); shot('8-fin-partie-page', True); r['8'] = p.evaluate(CHECK)
        r['erreurs'] = errs
        res[name] = r; ctx.close()
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=1))
