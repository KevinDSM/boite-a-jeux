"""Contraste réel des textes de l'accueil : on cache le texte, on capture ce qu'il y a derrière, et on mesure
le pire cas (5e centile) contre la couleur du texte. Seuil AA : 4,5 (texte courant), 3 (≥ 24 px ou ≥ 18,66 px gras).
Modes : (rien) accueil, « etapes » rejoindre / créer, « salon », « motdujour » (widget de l'accueil puis la page du jeu ;
il faut les fonctions du site : wrangler pages dev, par exemple http://127.0.0.1:8788/index.html)."""
import sys, io, json, time
from playwright.sync_api import sync_playwright
from PIL import Image
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
def lum(c):
    def ch(v):
        v /= 255; return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2])
def ratio(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True); return (la + 0.05) / (lb + 0.05)
SEL_HOME = ['.ih-head .ih-date', '.ih-head h1', '.ih-head .ih-sub', '.ih-resume span', '.ih-pick-t b', '.ih-pick-t span', '#ih-grid .ih-app .ih-l', '.ih-foot .btn']
SALON = len(sys.argv) > 2 and sys.argv[2] == 'salon'
SEL_SALON = ['#s-lobby .code-strip .eyebrow', '#s-lobby .code-strip .fine', '#lobby-code', '#btn-invite', '#s-lobby .players-title', '#s-lobby .chip .pname', '#s-lobby .chip i', '#s-lobby .picker .section-title', '#s-lobby .gfam', '#s-lobby .gfilter', '#games .gcard .gname', '#games .gcard .gdesc', '#games .gcard .gmeta b', '#games .gcard .gmeta i', '#help .sheet p', '#help .sheet h3', '#help .eyebrow']
ETAPES = len(sys.argv) > 2 and sys.argv[2] == 'etapes'
MDJ = len(sys.argv) > 2 and sys.argv[2] == 'motdujour'
SEL_MDJ_HOME = ['.ih-mdj-top b', '.ih-mdj-top span', '.ih-mdj-list li b', '.ih-mdj-list li > span:last-child', '.ih-mdj-none', '#ih-mdj-go']
SEL_MDJ = ['#md-title', '#md-say', '.md-key', '.md-hintbtn', '.md-hint-tx', '.md-rank h2', '.md-r b', '.md-sc', '.md-sc small', '.md-wait', '.md-none', '.md-sol b', '.md-sol span', '.md-next']
SEL = SEL_SALON if SALON else (['.ih-steptitle', '.ih-codebox > span', '.ih-namel', '#f-home .btn.primary', '.ih-hint'] if ETAPES else SEL_HOME)
out = {}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for theme in ['dark', 'nuit', 'light', 'lavande']:
        p = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
        p.add_init_script(f"try {{ localStorage.setItem('dc-theme', '{theme}'); localStorage.setItem('dc-name', 'Kevin'); localStorage.setItem('dc-last', JSON.stringify({{code: 'KBJX', at: Date.now()}})); }} catch {{}}")
        p.goto(BASE + "?t=" + str(time.time())); p.wait_for_timeout(900)
        if SALON:
            p.evaluate("s => document.getElementById('f-home').dataset.step = s", 'create'); p.fill("#in-name", "Kevin"); p.press("#in-name", "Enter")
            p.wait_for_function("() => /[A-Z]{4}/.test(document.getElementById('lobby-code').textContent)", timeout=30000); p.wait_for_timeout(600)
        worst = {}
        def measure(sels):
          for sel in sels:
              for i, h in enumerate(p.query_selector_all(sel)[:12]):
                  if not h.is_visible(): continue
                  if MDJ: h.scroll_into_view_if_needed(); p.wait_for_timeout(60)
                  box = h.bounding_box()
                  tb = h.evaluate("e => { if (e.matches('input')) return null; const r = document.createRange(); r.selectNodeContents(e); const b = r.getBoundingClientRect(); return b.width ? { x: b.x - 3, y: b.y + scrollY, width: b.width + 6, height: b.height } : null; }")
                  if tb and box: tb['y'] -= p.evaluate('scrollY'); box = tb        # la zone du texte seul, pas tout le bouton
                  if not box or box['y'] > (800 if MDJ else 700) or box['y'] < 0 or box['width'] < 2 or box['x'] + box['width'] > 390: continue          # sous le dock : fondu volontaire
                  rgb = tuple(h.evaluate("e => { const c = document.createElement('canvas').getContext('2d'); c.fillStyle = getComputedStyle(e).color; c.fillRect(0, 0, 1, 1); return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3); }"))
                  size = h.evaluate("e => [parseFloat(getComputedStyle(e).fontSize), +getComputedStyle(e).fontWeight]")
                  h.evaluate("e => { e.dataset.c = e.style.color; e.style.setProperty('transition', 'none', 'important'); e.style.setProperty('color', 'transparent', 'important'); e.style.setProperty('text-shadow', 'none', 'important'); e.style.caretColor = 'transparent'; }")
                  if MDJ: h.evaluate("e => e.querySelectorAll('*').forEach(x => { x.dataset.c = x.style.color; x.style.setProperty('color', 'transparent', 'important'); })")   # le texte des enfants n'est pas du fond
                  img = Image.open(io.BytesIO(p.screenshot(clip=box))).convert('RGB')
                  h.evaluate("e => { e.style.color = e.dataset.c; e.style.removeProperty('text-shadow'); e.querySelectorAll('*').forEach(x => { if ('c' in x.dataset) x.style.color = x.dataset.c; }); }")
                  px = list(img.getdata()); px.sort(key=lambda c: ratio(c, rgb))
                  r = ratio(px[int(len(px) * 0.05)], rgb)
                  large = size[0] >= 24 or (size[0] >= 18.66 and size[1] >= 700)
                  need = 3 if large else 4.5
                  k = sel
                  if k not in worst or r < worst[k][0]: worst[k] = (round(r, 2), need, round(size[0], 1))
        if MDJ:
            p.wait_for_selector('#ih-mdj:not([hidden])'); measure(SEL_MDJ_HOME)
            p.goto(BASE.rsplit('/', 1)[0] + '/motdujour'); p.wait_for_selector('#md-kb .md-key'); p.wait_for_timeout(600); measure(SEL_MDJ)
        elif ETAPES:
            p.click('.ih-pick[data-go=join]'); p.wait_for_timeout(300); measure(SEL)
            p.click('#ih-back'); p.click('.ih-pick[data-go=create]'); p.wait_for_timeout(300); measure(SEL)
        else: measure([x for x in SEL if not x.startswith('#help')])
        if SALON:
            p.click('#btn-help'); p.wait_for_timeout(800); measure([x for x in SEL if x.startswith('#help')])
        out[theme] = {k: v for k, v in worst.items()}
        p.close()
    b.close()
fails = [(t, k, v) for t, d in out.items() for k, v in d.items() if v[0] < v[1]]
print(json.dumps(out, ensure_ascii=False))
print('ÉCHECS :', fails or 'aucun')
