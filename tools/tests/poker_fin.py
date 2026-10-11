"""Poker : rendus forcés à partir d'une vraie partie (table pleine à 9, tapis, couché, abattage, fin de partie), téléphone et PC.
Usage : poker_fin.py [url] [thème dark|light]"""
import sys, os, time, json
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767/index.html"
THEME = sys.argv[2] if len(sys.argv) > 2 else "dark"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "poker"); os.makedirs(OUT, exist_ok=True)
# 9 joueurs : des humains en plus des robots, des états variés
FULL = """(phase) => { const v = view.pk, me = v.players.find(p => p.me);
  const names = ['🐼\\u00a0Léa', '🦁\\u00a0Maximilien', '🐙\\u00a0Zoé', '🦉\\u00a0Jean-Baptiste', '🐸\\u00a0Inès'];
  const extra = names.map((n, i) => ({ id: 'h' + i, name: n, bot: false, online: true, me: false, stack: [1240, 0, 860, 2310, 455][i], bet: [80, 600, 0, 160, 0][i], folded: i === 2, allin: i === 1, out: i === 4,
    dealer: false, sb: false, bb: false, turn: false, hole: i === 4 || i === 2 ? [] : [null, null], won: 0 }));
  const players = [...v.players.map(p => ({ ...p, turn: false })), ...extra];
  players[2].turn = !(phase === 'me'); players[1].folded = true; players[1].hole = []; players[1].bet = 20;
  const board = [{ r: 'A', s: 'S' }, { r: 'R', s: 'H' }, { r: '10', s: 'D' }];
  const w = { ...v, players, board, street: 'flop', pot: 1840, toActId: players[2].id, toActName: players[2].name, myTurn: phase === 'me', toCall: phase === 'me' ? 160 : 0, curBet: 160, minTo: 320, maxTo: me.stack + me.bet, quiet: 4000 };
  if (phase === 'me') players.forEach(p => p.turn = p.me);
  return renderPoker(w); }"""
SHOW = """() => { const v = view.pk, me = v.players.find(p => p.me), opp = v.players.filter(p => !p.me);
  const hole = [[{ r: 'R', s: 'S' }, { r: 'R', s: 'C' }], [{ r: '7', s: 'H' }, { r: '2', s: 'D' }], [{ r: 'A', s: 'D' }, { r: 'V', s: 'C' }]];
  const board = [{ r: 'A', s: 'S' }, { r: 'R', s: 'H' }, { r: '10', s: 'D' }, { r: '4', s: 'C' }, { r: '9', s: 'H' }];
  const players = v.players.map((p, i) => ({ ...p, turn: false, bet: 0, folded: false, hole: p.me ? me.hole : hole[(i - 1) % 3], won: p.me ? 0 : i === 1 ? 640 : 0 }));
  const hands = players.map(p => ({ id: p.id, name: p.name, hole: p.hole, hand: p.won ? 'Brelan' : 'Paire', won: p.won }));
  return renderPoker({ ...v, phase: 'show', players, board, pot: 640, result: { uncontested: false, won: { [players[1].id]: 640 }, total: 640, hands, board }, myTurn: false }); }"""
OVER = """() => { const v = view.pk; const ranking = v.players.map((p, i) => ({ id: p.id, name: p.name, stack: i === 0 ? 4000 : 0, out: i !== 0 }));
  return renderPoker({ ...v, phase: 'over', ranking, winnerName: v.players[0].name, players: v.players.map((p, i) => ({ ...p, stack: i ? 0 : 4000, out: i !== 0, bet: 0, turn: false, hole: [] })), board: [] }); }"""
CHECK = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "poker_play.py"), encoding="utf-8").read().split('CHECK = """')[1].split('"""')[0]
res = {}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for name, w, h in [('tel', 390, 844), ('pc', 1440, 900)]:
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if w < 800 else 1)
        ctx.add_init_script(f"try {{ localStorage.setItem('dc-theme', '{THEME}'); localStorage.setItem('dc-emo', '🦊'); }} catch {{}}")
        p = ctx.new_page(); errs = []; p.on("pageerror", lambda e: errs.append(str(e)[:200]))
        p.goto(BASE + "?t=" + str(time.time())); p.wait_for_timeout(600)
        p.evaluate("s => document.getElementById('f-home').dataset.step = s", 'create'); p.fill("#in-name", "Kevin"); p.press("#in-name", "Enter")
        p.wait_for_function("() => /[A-Z]{4}/.test(document.getElementById('lobby-code').textContent)", timeout=30000)
        p.evaluate("() => document.querySelector('.gcard[data-game=poker]').click()"); p.evaluate("() => { document.getElementById('opt-pk-bots').value = '3'; document.getElementById('btn-start').click(); }")
        p.wait_for_function("() => view && view.pk && view.pk.phase === 'hand'", timeout=15000); p.wait_for_timeout(400)
        p.evaluate("() => { window.__render = render; render = () => {}; }")      # on fige l'écran le temps des captures
        r = {}
        for tag, js, arg in [('neuf', FULL, 'other'), ('neuf-a-toi', FULL, 'me'), ('abattage', SHOW, None), ('fin', OVER, None)]:
            p.evaluate(js, arg) if arg else p.evaluate(js); p.wait_for_timeout(400)
            p.screenshot(path=f"{OUT}/{THEME}-force-{name}-{tag}.png"); r[tag] = p.evaluate(CHECK)
        r['erreurs'] = errs; res[name] = r; ctx.close()
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=1))
