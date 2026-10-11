"""Salons sur le serveur : création, emojis, retrait, Bataille, et surtout l'hôte qui coupe puis revient."""
import sys, time, os, json
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
SRV = sys.argv[2] if len(sys.argv) > 2 else "ws://127.0.0.1:8787"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "srv"); os.makedirs(OUT, exist_ok=True)
res = {}
bust = lambda u: u + ("&" if "?" in u else "?") + "t=" + str(int(time.time() * 1000))
with sync_playwright() as pw:
    b = pw.chromium.launch()
    def page(w, h, emo, scheme="dark"):
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if w < 800 else 1, color_scheme=scheme)
        init = f"try {{ localStorage.setItem('dc-emo', '{emo}');" + (f" localStorage.setItem('dc-server', '{SRV}');" if SRV != 'none' else '') + " } catch {}"
        ctx.add_init_script(init)
        p = ctx.new_page(); errs = []; p.on("pageerror", lambda e: errs.append(str(e)[:200])); p._errs = errs
        p.goto(bust(BASE), wait_until="load"); p.wait_for_timeout(500); return p
    shot = lambda p, n, full=False: p.screenshot(path=f"{OUT}/{n}.png", full_page=full)

    host = page(390, 844, '🦊'); host.evaluate("s => document.getElementById('f-home').dataset.step = s", 'create'); host.fill("#in-name", "Kevin"); host.press("#in-name", "Enter")
    host.wait_for_function("() => view && /[A-Z]{4}/.test(document.getElementById('lobby-code').textContent)", timeout=30000)
    code = host.evaluate("() => net.code")
    res['mode'] = host.evaluate("() => ({ server: !!net.server, isHost: isHostPlayer(), game: !!net.game, net: document.getElementById('net').textContent })")
    guest = page(1440, 860, '🦊', 'light'); guest.evaluate("s => document.getElementById('f-home').dataset.step = s", 'join'); guest.fill("#in-name", "Léa"); guest.fill("#in-code", code); guest.press("#in-code", "Enter")
    host.wait_for_function("() => view.players.filter(p => p.online).length >= 2", timeout=30000)
    guest.wait_for_timeout(500)
    res['players'] = host.evaluate("() => view.players.map(p => p.name)")
    res['guestIsHost'] = guest.evaluate("() => isHostPlayer()")
    res['guestToast'] = guest.inner_text('#toast')
    shot(host, "01-salon-tel", True)

    # un troisième, retiré au salon, ne peut pas revenir
    tom = page(390, 844, '🐼'); tom.evaluate("s => document.getElementById('f-home').dataset.step = s", 'join'); tom.fill("#in-name", "Tom"); tom.fill("#in-code", code); tom.press("#in-code", "Enter")
    host.wait_for_function("() => view.players.filter(p => p.online).length >= 3", timeout=30000)
    host.click('#lobby-players .chip:has-text("Tom") .chip-x'); host.click('#confirm-ok')
    tom.wait_for_function("() => /retiré/.test(document.getElementById('home-err').textContent)", timeout=10000)
    tom.evaluate("() => { document.getElementById('home-err').textContent = ''; window.__m = 1; }")
    tom.evaluate("s => document.getElementById('f-home').dataset.step = s", 'join'); tom.fill("#in-name", "Tom"); tom.fill("#in-code", code); tom.click('button[data-act=join]')
    tom.wait_for_function("() => !window.__m && /retiré/.test(document.getElementById('home-err').textContent)", timeout=15000)
    res['kick'] = [tom.inner_text('#home-err'), host.evaluate("() => view.players.map(p => p.name)")]

    # Bataille avec un robot
    host.evaluate("() => document.querySelector('.gcard[data-game=bataille]').click()"); host.wait_for_timeout(400)
    res['guestOpts'] = guest.evaluate("() => view.pickOpts?.length || 0")
    host.evaluate("() => { document.getElementById('opt-bt-bots').value = '1'; document.getElementById('opt-bt-length').value = 'court'; document.getElementById('btn-start').click(); }")
    for p in (host, guest): p.wait_for_function("() => view && view.bt", timeout=15000)
    host.click('#bt-main .bt-seat.me'); guest.click('#bt-main .bt-flip')
    host.wait_for_timeout(1500); shot(host, "02-bataille-tel"); shot(guest, "02-bataille-pc")
    res['bt1'] = guest.evaluate("() => view.bt.pli")
    guest.evaluate("() => act({ t: 'bt:auto' })")

    # l'hôte coupe (écran verrouillé) : la partie continue chez Léa
    host.evaluate("() => { net.kicked = true; net.ws.close(); }")      # pas de reconnexion pendant la coupure
    guest.wait_for_timeout(1500)
    res['hostOffline'] = guest.evaluate("() => view.players.find(p => p.base === 'Kevin').online"); guest.wait_for_timeout(3000); res['hostOffline4s'] = [guest.evaluate("() => view.players.find(p => p.base === 'Kevin').online"), guest.evaluate("() => view.bt.players?.find(p => (p.name || '').includes('Kevin'))?.online")]
    p0 = guest.evaluate("() => view.bt.pli"); guest.wait_for_timeout(9000)
    res['pliPendantCoupure'] = [p0, guest.evaluate("() => view.bt.pli")]
    # il revient (écran déverrouillé)
    host.evaluate("() => { net.kicked = false; serverLost(0); }")
    host.wait_for_function("() => net.ws && document.getElementById('net').textContent === 'connecté'", timeout=20000)
    host.wait_for_timeout(800)
    res['hostBack'] = host.evaluate("() => ({ online: view.players[0].online, isHost: isHostPlayer(), pli: view.bt.pli })")

    # l'hôte recharge sa page (onglet tué) : il rentre avec le code et reprend sa place d'hôte
    host.reload(wait_until="load"); host.wait_for_timeout(500)
    host.evaluate("s => document.getElementById('f-home').dataset.step = s", 'join'); host.fill("#in-name", "Kevin"); host.fill("#in-code", code); host.click('button[data-act=join]')
    host.wait_for_function("() => view && view.bt", timeout=15000)
    res['hostReload'] = host.evaluate("() => ({ isHost: isHostPlayer(), names: view.players.map(p => p.name), screen: [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.id })")
    host.evaluate("() => act({ t: 'restart' })")
    guest.wait_for_function("() => view.phase === 'lobby'", timeout=10000)
    res['history'] = guest.evaluate("() => (view.history || []).map(h => h.name + ' ' + h.podium.map(x => x.name + ':' + x.score).join(','))")

    # Téléphone dessiné avec robots : les dessins passent par le serveur
    host.evaluate("() => document.querySelector('.gcard[data-game=teldes]').click()"); host.wait_for_timeout(300)
    host.evaluate("() => { const s = document.getElementById('opt-td-bots'); if (s) s.value = '2'; document.getElementById('btn-start').click(); }")
    guest.wait_for_function("() => view && view.td", timeout=15000)
    res['td'] = guest.evaluate("() => view.td.phase")
    host.wait_for_timeout(1500); shot(guest, "03-teldes-pc")
    res['errors'] = [host._errs, guest._errs, tom._errs]
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=0))
