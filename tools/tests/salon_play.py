"""Salon : emojis uniques, changement d'emoji, invitation, lien d'invitation, retrait au salon et en partie."""
import sys, time, os, json
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "salon"); os.makedirs(OUT, exist_ok=True)
res = {}
bust = lambda u: u + ("&" if "?" in u else "?") + "t=" + str(int(time.time() * 1000))
with sync_playwright() as pw:
    b = pw.chromium.launch()
    def page(w, h, scheme="dark", emo=None, url=None):
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if w < 800 else 1, color_scheme=scheme)
        if emo: ctx.add_init_script(f"try {{ localStorage.setItem('dc-emo', '{emo}'); }} catch {{}}")
        p = ctx.new_page()
        errs = []; p.on("pageerror", lambda e: errs.append(str(e)[:200])); p._errs = errs
        p.goto(bust(url or BASE), wait_until="load"); p.wait_for_timeout(700); return p
    shot = lambda p, n, full=True: p.screenshot(path=f"{OUT}/{n}.png", full_page=full)

    host = page(390, 844, emo='🦊')
    res['homeEmo'] = host.inner_text('#btn-emo'); shot(host, "00-accueil", False)
    host.evaluate("s => document.getElementById('f-home').dataset.step = s", 'create'); host.click('#btn-emo'); host.wait_for_timeout(200); shot(host, "01-choix-emoji", False)
    host.click('#emo-grid button:has-text("🐙")'); res['homeEmo2'] = host.inner_text('#btn-emo')
    host.evaluate("s => document.getElementById('f-home').dataset.step = s", 'create'); host.click('#btn-emo'); host.click('#emo-grid button:has-text("🦊")')
    host.evaluate("s => document.getElementById('f-home').dataset.step = s", 'create'); host.fill("#in-name", "Kevin"); host.press("#in-name", "Enter")
    host.wait_for_function("() => /[A-Z]{4}/.test(document.getElementById('lobby-code').textContent)", timeout=40000)
    code = host.evaluate("() => net.code")

    # invité qui veut le même emoji : il en reçoit un autre et un message
    guest = page(1440, 860, "light", emo='🦊'); guest.evaluate("() => applyTheme('light')")
    guest.evaluate("s => document.getElementById('f-home').dataset.step = s", 'join'); guest.fill("#in-name", "Léa"); guest.fill("#in-code", code); guest.press("#in-code", "Enter")
    host.wait_for_function("() => view.players.filter(p => p.online).length >= 2", timeout=60000)
    guest.wait_for_timeout(600)
    res['emojis'] = host.evaluate("() => view.players.map(p => p.name)")
    res['guestToast'] = guest.inner_text('#toast')
    # l'invité change d'emoji depuis sa pastille : 🦊 grisé
    guest.click('#lobby-players .chip.me'); guest.wait_for_timeout(200)
    res['foxDisabled'] = guest.evaluate("() => [...document.querySelectorAll('#emo-grid button')].find(b => b.textContent === '🦊').disabled")
    shot(guest, "02-choix-salon-pc", False)
    guest.click('#emo-grid button:has-text("🐸")'); guest.wait_for_timeout(500)
    res['afterChange'] = host.evaluate("() => view.players.map(p => p.name)")
    shot(host, "03-salon-tel"); shot(guest, "03-salon-pc", False)

    # invitation
    host.click('#btn-invite'); host.wait_for_function("() => !document.getElementById('invite').hidden && document.getElementById('invite-img').naturalWidth > 0", timeout=5000)
    res['inviteUrl'] = host.inner_text('#invite-url')
    host.wait_for_timeout(1500)
    res['upload'] = host.evaluate("async () => { try { const r = await fetch('/api/invite/' + net.code, { redirect: 'manual' }); return [r.status, r.headers.get('content-type')]; } catch (e) { return String(e); } }")
    host.wait_for_timeout(700); shot(host, "04-inviter-tel", False); host.click('#invite-close')

    # le lien d'invitation ouvre l'accueil en mode « rejoindre »
    tom = page(390, 844, emo='🐼', url=res['inviteUrl'])
    res['banner'] = tom.inner_text('#invite-banner')
    res['createVisible'] = tom.is_visible('button[data-act=create]')
    shot(tom, "05-accueil-invite", False)
    tom.evaluate("s => document.getElementById('f-home').dataset.step = s", 'join'); tom.fill("#in-name", "Tom"); tom.click('button[data-act=join]')
    host.wait_for_function("() => view.players.filter(p => p.online).length >= 3", timeout=60000)

    # l'hôte retire Tom au salon
    host.click('#lobby-players .chip:has-text("Tom") .chip-x'); host.wait_for_timeout(200)
    res['confirm'] = host.inner_text('#confirm-text'); shot(host, "06-confirmer-retrait", False)
    host.click('#confirm-ok')
    tom.wait_for_function("() => /retiré/.test(document.getElementById('home-err').textContent)", timeout=8000)
    res['tomMsg'] = tom.inner_text('#home-err'); res['tomUrl'] = tom.url
    res['afterKick'] = host.evaluate("() => view.players.map(p => p.name)")
    shot(tom, "07-retire", False)
    # Tom essaie de revenir : refusé
    tom.evaluate("() => { document.getElementById('home-err').textContent = ''; window.__mark = 1; }")
    tom.evaluate("s => document.getElementById('f-home').dataset.step = s", 'join'); tom.fill("#in-name", "Tom"); tom.fill("#in-code", code); tom.click('button[data-act=join]')
    tom.wait_for_function("() => !window.__mark && /retiré/.test(document.getElementById('home-err').textContent)", timeout=15000)
    tom.wait_for_timeout(1500)
    res['tomRejoin'] = [tom.inner_text('#home-err'), host.evaluate("() => view.players.map(p => p.name)")]

    # en pleine partie : Bataille, l'hôte retire Léa via le bouton Joueurs
    host.evaluate("() => document.querySelector('.gcard[data-game=bataille]').click()"); host.wait_for_timeout(300)
    host.evaluate("() => { document.getElementById('opt-bt-bots').value = '1'; document.getElementById('btn-start').click(); }")
    guest.wait_for_function("() => view && view.bt", timeout=20000)
    res['btNames'] = host.evaluate("() => net.game.bt.players.map(p => p.name)")
    res['playersBtn'] = host.is_visible('#btn-players')
    res['guestPlayersBtn'] = guest.is_visible('#btn-players')
    host.click('#btn-players'); host.wait_for_timeout(200); shot(host, "08-joueurs-en-partie", False)
    host.click('#players-list .pl-row:has-text("Léa") button'); host.click('#confirm-ok')
    guest.wait_for_function("() => /retiré/.test(document.getElementById('home-err').textContent)", timeout=8000)
    host.wait_for_timeout(1200); shot(host, "09-joueurs-apres", False)
    res['sheetAfter'] = host.inner_text('#players-list')
    # la partie continue : Léa est hors ligne, son tas se retourne tout seul
    host.click('#players-close')
    host.evaluate("() => act({ t: 'bt:auto' })")
    p0 = host.evaluate("() => net.game.bt.pli"); host.wait_for_timeout(6000)
    res['plis'] = [p0, host.evaluate("() => net.game.bt.pli")]
    res['btState'] = host.evaluate("() => { const r = net.game.bt, n = Date.now(); return { phase: r.phase, need: r.need, due: Object.fromEntries(Object.entries(r.dueAt).map(([k, v]) => [k, v - n])), pl: r.players.map(p => [p.name, p.auto, p.online, p.bot, p.inGame, p.stack.length]) }; }")
    host.evaluate("() => act({ t: 'restart' })"); host.wait_for_function("() => view.phase === 'lobby'")
    res['lobbyAfterGame'] = host.evaluate("() => view.players.map(p => p.name)")
    res['bad'] = [t for t in ['…', '—', 'undefined', 'NaN'] if t in (host.inner_text('body') + guest.inner_text('body') + tom.inner_text('body'))]
    res['errors'] = [host._errs, guest._errs, tom._errs]
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=0))
