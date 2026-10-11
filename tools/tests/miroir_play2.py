"""Miroir façon Prisme : chacun répond pour soi à son arrivée, puis devine les autres quand il veut."""
import sys, os, os, json, time
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8788"
MDP = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("STATS_MDP_LOCAL", "test-local")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "miroir2"); os.makedirs(OUT, exist_ok=True)
res = {}
TRUTH = {'Kevin': lambda q: (17 * q) % 101, 'Léa': lambda q: (37 * q + 20) % 101, 'Tom': lambda q: (53 * q + 40) % 101}
def guess(g, t, q):
    v = TRUTH[t](q)
    if (g, t) == ('Léa', 'Kevin'): return min(100, v + 4)
    if (g, t) == ('Kevin', 'Léa'): return max(0, v - 12)
    return 100 - v
with sync_playwright() as pw:
    b = pw.chromium.launch()
    def page(name, w, h, theme, emo):
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if w < 800 else 1)
        ctx.add_init_script(f"try {{ localStorage.setItem('dc-theme', '{theme}'); localStorage.setItem('dc-emo', '{emo}'); localStorage.setItem('dc-name', '{name}'); }} catch {{}}")
        p = ctx.new_page(); errs = []; p.on("pageerror", lambda e: errs.append(str(e)[:200])); p._errs = errs; p._name = name
        return p
    shot = lambda p, n, full=True: p.screenshot(path=f"{OUT}/{n}.png", full_page=full)

    def run(p, target_name, upto=99, skip_every=0, shots=''):
        """Répond à une série (son miroir ou un autre) : graduation ou glisser, pauses entre parties."""
        k = 0
        while True:
            p.wait_for_selector('.mr-run, .mr-break', timeout=10000)
            if p.locator('.mr-break').count():
                if p.locator('.mr-break .btn.primary', has_text='Continuer').count():
                    if shots and k < 12: shot(p, f'{shots}-pause', False)
                    p.click('.mr-break .btn.primary'); continue
                return 'fini'
            if k >= upto: p.click('.mr-quit'); return 'arrêt'
            q = int(p.inner_text('.mr-count b')) - 1
            v = TRUTH[p._name](q) if target_name == p._name else guess(p._name, target_name, q)
            if skip_every and k % skip_every == skip_every - 1:
                p.click('[data-a=skip]')
            elif k % 2 == 0:                                   # une graduation : réponse d'un coup
                tick = min([0, 25, 50, 75, 100], key=lambda t: abs(t - v))
                p.click(f'.mr-tick[data-v="{tick}"]')
            else:                                             # glisser sur la ligne, puis Suivant
                box = p.locator('.mr-rail').bounding_box()
                p.mouse.click(box['x'] + 15 + (box['width'] - 30) * v / 100, box['y'] + box['height'] / 2)
                if shots and k == 1: shot(p, f'{shots}-question', False)
                p.click('[data-a=next]')
            p.wait_for_timeout(260); k += 1

    kev = page('Kevin', 390, 844, 'dark', '🦊'); lea = page('Léa', 1280, 860, 'light', '🐸'); tom = page('Tom', 390, 844, 'dark', '🐼')
    kev.goto(BASE + "/miroir"); kev.wait_for_selector('.mr-create'); kev.click('.mr-create button[type=submit]')
    kev.wait_for_selector('.mr-bigcode'); code = kev.inner_text('.mr-share .mr-bigcode'); res['code'] = code
    shot(kev, '01-hote-seul')
    # Kevin fait son miroir tout de suite, seul
    kev.click('.mr-task .btn'); res['kev-miroir'] = run(kev, 'Kevin', shots='02-kevin')
    shot(kev, '03-kevin-miroir-fini', False)
    kev.click('.mr-break .btn'); kev.wait_for_selector('.mr-head')
    # Léa arrive plus tard : son miroir, puis elle devine Kevin
    lea.goto(f"{BASE}/miroir?c={code}"); lea.wait_for_selector('form.mr-card input[name=nom]'); lea.click('form.mr-card button[type=submit]')
    lea.wait_for_selector('.mr-task'); shot(lea, '04-lea-partie', False)
    lea.click('.mr-task .btn'); res['lea-miroir'] = run(lea, 'Léa')
    res['lea-propose'] = lea.inner_text('.mr-break .btn.primary')
    lea.click('.mr-break .btn.primary'); res['lea-devine-kevin'] = run(lea, 'Kevin', shots='05-lea-devine')
    shot(lea, '06-lea-fini', False); lea.click('.mr-break .btn')
    # Kevin revient : Léa est apparue, il la devine
    kev.wait_for_function("() => document.querySelectorAll('.mr-guess-row').length === 1", timeout=15000)
    shot(kev, '07-kevin-voit-lea')
    kev.click('.mr-guess-row .btn'); res['kev-devine-lea'] = run(kev, 'Léa'); kev.click('.mr-break .btn:has-text("Revenir")')
    # Tom arrive en dernier : son miroir avec quelques « passer », puis il devine Kevin à moitié
    tom.goto(f"{BASE}/miroir?c={code}"); tom.wait_for_selector('form.mr-card input[name=nom]'); tom.click('form.mr-card button[type=submit]')
    tom.wait_for_selector('.mr-task'); tom.click('.mr-task .btn'); res['tom-miroir'] = run(tom, 'Tom', skip_every=6)
    tom.click('.mr-break .btn.primary'); res['tom-devine'] = run(tom, 'Kevin', upto=12)
    tom.wait_for_selector('.mr-task'); shot(tom, '08-tom-partie')
    # Kevin lance le résultat
    kev.reload(); kev.wait_for_selector('.mr-cta'); shot(kev, '09-hote-avant-resultat')
    res['avancement'] = kev.inner_text('.mr-card:has(h2:has-text("Où en est chacun"))').replace('\n', ' | ')
    kev.click('.mr-cta'); res['confirm'] = kev.inner_text('#mr-c-text'); kev.click('#mr-c-ok')
    kev.wait_for_selector('.mr-results', timeout=15000); rcode = kev.inner_text('.mr-share .mr-bigcode'); res['resultat'] = rcode
    lea.goto(f"{BASE}/miroir?r={rcode}"); lea.wait_for_selector('.mr-results', timeout=12000)
    lea.evaluate("() => document.querySelectorAll('.mr-ans').forEach((d, i) => { if (i < 3) d.open = true; })"); lea.wait_for_timeout(200)
    shot(lea, '10-resultats-pc')
    kev.evaluate("() => document.querySelectorAll('.mr-ans').forEach((d, i) => { if (i < 2) d.open = true; })"); kev.wait_for_timeout(200)
    kev.locator('.mr-card:has(h2:has-text("Toutes les réponses"))').screenshot(path=f"{OUT}/11-reponses-tel.png")
    res['gagnant'] = lea.inner_text('.mr-win .mr-title')
    res['noms-dans-reponses'] = lea.evaluate("() => [...document.querySelectorAll('.mr-ans[open] .mr-pill')].slice(0, 8).map(p => p.textContent)")
    res['overflow'] = [p.evaluate("() => document.documentElement.scrollWidth > innerWidth + 1") for p in (kev, lea, tom)]
    if MDP != 'none':
        st = b.new_page(viewport={"width": 1440, "height": 900})
        st.goto(BASE + "/stats"); st.fill('#mdp', MDP); st.press('#mdp', 'Enter'); st.wait_for_selector('#miroir details', timeout=12000)
        res['stats'] = st.inner_text('#miroir summary')
    res['bad'] = [t for t in ['—', 'undefined', 'NaN', 'null', '[object'] if any(t in x.inner_text('body') for x in (kev, lea, tom))]
    res['errors'] = [kev._errs, lea._errs, tom._errs]
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=0))
