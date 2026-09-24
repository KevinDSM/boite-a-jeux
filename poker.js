/* Poker — Texas Hold'em entre amis, avec des jetons fictifs.

   Chacun reçoit deux cartes cachées ; cinq cartes communes arrivent en trois temps (flop, turn, river).
   Quatre tours d'enchères, petite et grosse blinde, tapis et pots annexes. La meilleure main de cinq
   cartes parmi sept emporte le pot. Un joueur sans jetons est éliminé ; le dernier en jeu gagne.
   Les blindes doublent toutes les N mains (réglable). Des robots peuvent compléter la table.
   Même modèle que les autres jeux : la salle vit chez l'hôte (net.game.pk), les cartes cachées ne
   sortent que vers leur joueur (et à l'abattage), actions « pk:… ».
   Chargé après app.js et kems.js : réutilise $, el, act, esc, toast, shuffle, net, view et kmCardHTML. */

'use strict';

const Poker = (() => {
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R', 'A'];     // valeur = index + 2
  const HANDS = ['Carte haute', 'Paire', 'Double paire', 'Brelan', 'Quinte', 'Couleur', 'Full', 'Carré', 'Quinte flush'];
  const BOT_NAMES = ['Robot Ace', 'Robot Bluff', 'Robot Jeton', 'Robot River', 'Robot Tapis'];
  const SHOW_MS = 9000, BOT_MS = 1400;
  const clamp = (v, lo, hi, def) => { const n = +v; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
  const val = c => RANKS.indexOf(c.r) + 2;
  const pl = (room, id) => room.players.find(p => p.id === id);
  const log = (room, t) => { room.log.push(t); if (room.log.length > 40) room.log.splice(0, room.log.length - 40); };

  // ------------------------------------------------------------ valeur d'une main
  function eval5(cs) {
    const v = cs.map(val).sort((a, b) => b - a), flush = cs.every(c => c.s === cs[0].s);
    const uniq = [...new Set(v)];
    let straight = 0;
    if (uniq.length === 5 && v[0] - v[4] === 4) straight = v[0];
    if (uniq.length === 5 && v[0] === 14 && v[1] === 5) straight = 5;             // la roue : A-2-3-4-5
    const count = {}; v.forEach(x => count[x] = (count[x] || 0) + 1);
    const groups = Object.entries(count).map(([x, n]) => [n, +x]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    const byGroup = groups.map(g => g[1]);
    if (straight && flush) return [8, straight];
    if (groups[0][0] === 4) return [7, ...byGroup];
    if (groups[0][0] === 3 && groups[1][0] === 2) return [6, ...byGroup];
    if (flush) return [5, ...v];
    if (straight) return [4, straight];
    if (groups[0][0] === 3) return [3, ...byGroup];
    if (groups[0][0] === 2 && groups[1][0] === 2) return [2, ...byGroup];
    if (groups[0][0] === 2) return [1, ...byGroup];
    return [0, ...v];
  }
  const cmp = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; };
  function best(cards) {
    let top = null, pick = null;
    const walk = (start, chosen) => {                     // toutes les combinaisons de 5 cartes
      if (chosen.length === 5) { const s = eval5(chosen); if (!top || cmp(s, top) > 0) { top = s; pick = chosen; } return; }
      for (let i = start; i <= cards.length - (5 - chosen.length); i++) walk(i + 1, chosen.concat([cards[i]]));
    };
    walk(0, []);
    return { score: top, cards: pick };
  }

  function deck() { const d = []; ['S', 'H', 'D', 'C'].forEach(s => RANKS.forEach(r => d.push({ r, s }))); return shuffle(d); }

  function create({ hostId, players, stack, blindEvery, bots }) {
    const room = {
      hostId, phase: 'hand', hand: 0, dealer: -1, sb: 10, bb: 20, stackStart: clamp(stack, 200, 20000, 1000), blindEvery: clamp(blindEvery, 0, 50, 10),
      players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, bot: false, stack: 0, hole: [], folded: false, allin: false, bet: 0, total: 0, acted: false, out: false, outAt: 0 })),
      deck: [], board: [], street: 'preflop', toAct: null, curBet: 0, minRaise: 20, result: null, log: [], seq: 0, turnAt: Date.now(), winnerId: null,
    };
    for (let i = 0; i < clamp(bots, 0, 5, 0); i++) room.players.push({ id: 'bot' + i, name: BOT_NAMES[i], online: true, bot: true, stack: 0, hole: [], folded: false, allin: false, bet: 0, total: 0, acted: false, out: false, outAt: 0 });
    room.players.forEach(p => { p.stack = room.stackStart; if (!p.online) p.out = true; });
    startHand(room);
    return room;
  }

  const seats = room => room.players.filter(p => !p.out);
  const nextSeat = (room, fromIdx, pred = p => true) => {
    const s = seats(room), n = s.length;
    for (let k = 1; k <= n; k++) { const p = s[(fromIdx + k) % n]; if (pred(p)) return s.indexOf(p); }
    return -1;
  };
  const canAct = p => !p.out && !p.folded && !p.allin;

  function pay(room, p, amount) {
    const a = Math.min(amount, p.stack);
    p.stack -= a; p.bet += a; p.total += a;
    if (p.stack === 0) p.allin = true;
    return a;
  }

  function startHand(room) {
    const alive = seats(room);
    if (alive.length <= 1) { room.phase = 'over'; room.winnerId = alive[0]?.id || null; room.seq += 1; if (alive[0]) log(room, `${alive[0].name} remporte la partie avec tous les jetons !`); return; }
    room.hand += 1;
    if (room.blindEvery && room.hand > 1 && (room.hand - 1) % room.blindEvery === 0) { room.sb *= 2; room.bb *= 2; log(room, `Les blindes montent : ${room.sb} / ${room.bb}.`); }
    room.deck = deck(); room.board = []; room.street = 'preflop'; room.result = null;
    room.players.forEach(p => { p.hole = []; p.folded = p.out; p.allin = false; p.bet = 0; p.total = 0; p.acted = false; });
    const s = seats(room), n = s.length;
    room.dealer = room.dealer < 0 ? Math.floor(Math.random() * n) : (room.dealer + 1) % n;
    // à deux, le donneur est la petite blinde et parle en premier avant le flop
    const sbI = n === 2 ? room.dealer : (room.dealer + 1) % n, bbI = (sbI + 1) % n;
    room.sbId = s[sbI].id; room.bbId = s[bbI].id; room.dealerId = s[room.dealer].id;
    pay(room, s[sbI], room.sb); pay(room, s[bbI], room.bb);
    for (let k = 0; k < 2; k++) s.forEach(p => p.hole.push(room.deck.pop()));
    room.curBet = room.bb; room.minRaise = room.bb;
    const first = nextSeat(room, bbI, canAct);
    room.toAct = first >= 0 ? s[first].id : null;
    room.phase = 'hand'; room.turnAt = Date.now(); room.seq += 1;
    log(room, `Main ${room.hand} : ${s[room.dealer].name} donne, blindes ${room.sb} / ${room.bb}.`);
    if (!room.toAct || roundDone(room)) advance(room);
  }

  function roundDone(room) {
    const live = seats(room).filter(p => !p.folded);
    if (live.length <= 1) return true;
    const actors = live.filter(p => !p.allin);
    if (!actors.length) return true;
    if (actors.length === 1 && actors[0].bet >= room.curBet && (actors[0].acted || live.every(p => p.allin || p === actors[0]))) return true;
    return actors.every(p => p.acted && p.bet === room.curBet);
  }

  function action(room, pid, m) {
    if (room.phase !== 'hand' || room.toAct !== pid) return null;
    const p = pl(room, pid), toCall = room.curBet - p.bet;
    const a = m.a;
    if (a === 'fold') { p.folded = true; log(room, `${p.name} se couche.`); }
    else if (a === 'check') { if (toCall > 0) return 'Il faut suivre ou se coucher'; log(room, `${p.name} parle.`); }
    else if (a === 'call') { if (toCall <= 0) return action(room, pid, { a: 'check' }); const paid = pay(room, p, toCall); log(room, `${p.name} suit${p.allin && paid < toCall ? ' pour ' + paid + ', tapis' : ''} (${paid}).`); }
    else if (a === 'raise' || a === 'allin') {
      const max = p.bet + p.stack;
      let to = a === 'allin' ? max : clamp(m.to, 0, max, max);
      const minTo = room.curBet + room.minRaise;
      if (to < minTo && to < max) return `Relance minimum : ${minTo}`;
      if (to <= room.curBet) return action(room, pid, { a: 'call' });
      const raise = to - room.curBet;
      pay(room, p, to - p.bet);
      if (raise >= room.minRaise) { room.minRaise = raise; seats(room).forEach(q => { if (q !== p && canAct(q)) q.acted = false; }); }
      else seats(room).forEach(q => { if (q !== p && canAct(q) && q.bet < to) q.acted = false; });   // tapis sous la relance minimum
      room.curBet = to;
      log(room, `${p.name} ${p.allin ? 'fait tapis' : 'relance'} à ${to}.`);
    } else return null;
    p.acted = true; room.turnAt = Date.now(); room.seq += 1;
    if (roundDone(room)) return advance(room);
    const s = seats(room), i = s.indexOf(p), nx = nextSeat(room, i, canAct);
    room.toAct = nx >= 0 ? s[nx].id : null;
    if (!room.toAct) advance(room);
    return null;
  }

  function advance(room) {
    const live = seats(room).filter(p => !p.folded);
    room.players.forEach(p => { p.bet = 0; p.acted = false; });
    room.curBet = 0; room.minRaise = room.bb;
    if (live.length <= 1) return showdown(room, true);
    const deal = n => { room.deck.pop(); for (let i = 0; i < n; i++) room.board.push(room.deck.pop()); };   // on brûle une carte
    if (room.street === 'preflop') { deal(3); room.street = 'flop'; }
    else if (room.street === 'flop') { deal(1); room.street = 'turn'; }
    else if (room.street === 'turn') { deal(1); room.street = 'river'; }
    else return showdown(room, false);
    room.seq += 1;
    // plus personne ne peut miser : on déroule les cartes jusqu'à l'abattage
    if (live.filter(p => !p.allin).length <= 1) return advance(room);
    const s = seats(room), nx = nextSeat(room, s.findIndex(p => p.id === room.dealerId), canAct);
    room.toAct = s[nx].id; room.turnAt = Date.now();
    return null;
  }

  function showdown(room, uncontested) {
    const contrib = room.players.filter(p => p.total > 0);
    const live = contrib.filter(p => !p.folded);
    const results = {};
    live.forEach(p => { if (!uncontested) { const b = best(p.hole.concat(room.board)); results[p.id] = { score: b.score, cards: b.cards, name: HANDS[b.score[0]] }; } });
    // pots : par paliers de mise, chacun ne gagne que ce qu'il a pu couvrir
    const levels = [...new Set(contrib.map(p => p.total))].sort((a, b) => a - b);
    let prev = 0; const pots = [];
    levels.forEach(l => {
      const amount = contrib.reduce((sum, p) => sum + Math.max(0, Math.min(p.total, l) - prev), 0);
      const elig = live.filter(p => p.total >= l), payers = contrib.filter(p => p.total > prev);
      if (amount > 0) {
        if (payers.length === 1 && elig.length === 1) elig[0].stack += amount;            // mise que personne n'a suivie : rendue
        else if (elig.length) pots.push({ amount, elig }); else if (pots.length) pots[pots.length - 1].amount += amount;
      }
      prev = l;
    });
    const s = seats(room), order = i => (i - s.findIndex(p => p.id === room.dealerId) + s.length) % s.length;
    const won = {};
    pots.forEach(pot => {
      let winners = pot.elig;
      if (!uncontested && winners.length > 1) {
        let top = null; winners.forEach(p => { if (!top || cmp(results[p.id].score, top) > 0) top = results[p.id].score; });
        winners = winners.filter(p => cmp(results[p.id].score, top) === 0);
      }
      winners.sort((a, b) => order(s.indexOf(a)) - order(s.indexOf(b)));
      const share = Math.floor(pot.amount / winners.length), rest = pot.amount - share * winners.length;
      winners.forEach((p, i) => { const g = share + (i === 0 ? rest : 0); p.stack += g; won[p.id] = (won[p.id] || 0) + g; });
    });
    const total = pots.reduce((a, p) => a + p.amount, 0);
    const names = Object.keys(won).map(id => pl(room, id).name);
    log(room, uncontested ? `${names.join(', ')} ramasse ${total} sans abattage.` : `${names.join(' et ')} gagne${names.length > 1 ? 'nt' : ''} ${total} avec ${results[Object.keys(won)[0]].name.toLowerCase()}.`);
    room.result = { uncontested, won, total, hands: uncontested ? [] : live.map(p => ({ id: p.id, name: p.name, hole: p.hole, hand: results[p.id].name, best: results[p.id].cards, won: won[p.id] || 0 })), board: room.board.slice() };
    // éliminations
    let rank = room.players.filter(p => p.out).length;
    room.players.filter(p => !p.out && p.stack <= 0).forEach(p => { p.out = true; p.outAt = ++rank + room.hand * 100; log(room, `${p.name} n’a plus de jetons : éliminé.`); });
    room.phase = 'show'; room.toAct = null; room.turnAt = Date.now(); room.seq += 1;
    return null;
  }

  function ranking(room) {
    return [...room.players].sort((a, b) => (b.stack - a.stack) || (b.outAt - a.outAt)).map(p => ({ id: p.id, name: p.name, stack: p.stack, out: p.out }));
  }

  // ------------------------------------------------------------ robots
  function botStrength(room, p) {
    const cards = p.hole.concat(room.board);
    if (room.board.length === 0) {
      const [a, b] = p.hole.map(val).sort((x, y) => y - x), pair = a === b, suited = p.hole[0].s === p.hole[1].s;
      return Math.min(1, (pair ? 0.5 + a / 28 : (a + b) / 40) + (suited ? 0.06 : 0) + (a - b <= 2 && !pair ? 0.04 : 0));
    }
    const sc = best(cards).score;
    return Math.min(1, sc[0] / 5 + (sc[1] || 0) / 60 + (sc[0] === 1 && sc[1] >= 11 ? 0.1 : 0));
  }
  function botAct(room, p) {
    const toCall = room.curBet - p.bet, pot = room.players.reduce((a, q) => a + q.total, 0);
    const s = botStrength(room, p) + (Math.random() - 0.5) * 0.25;
    const odds = toCall / Math.max(1, pot + toCall);
    if (toCall === 0) {
      if (s > 0.62 && Math.random() < 0.65) return action(room, p.id, { a: 'raise', to: room.curBet + Math.max(room.minRaise, Math.round(pot * (0.5 + Math.random() * 0.4) / room.bb) * room.bb) });
      return action(room, p.id, { a: 'check' });
    }
    if (s > 0.8 && Math.random() < 0.5) return action(room, p.id, { a: 'raise', to: room.curBet + Math.max(room.minRaise, Math.round(pot * 0.75 / room.bb) * room.bb) });
    if (s > odds + 0.18 || toCall <= room.bb && s > 0.25) return action(room, p.id, { a: 'call' });
    return action(room, p.id, { a: 'fold' });
  }

  function act(room, pid, m) {
    switch (m.t) {
      case 'pk:act': return action(room, pid, m);
      case 'pk:next': if (room.phase === 'show' && pid === room.hostId) startHand(room); return null;
      case 'pk:skip': {
        if (pid !== room.hostId || room.phase !== 'hand') return null;
        const p = pl(room, room.toAct); if (!p || p.bot) return null;
        return action(room, p.id, { a: room.curBet > p.bet ? 'fold' : 'check' });
      }
    }
    return null;
  }
  function tick(room) {
    const now = Date.now();
    if (room.phase === 'show' && now - room.turnAt > SHOW_MS) { startHand(room); return true; }
    if (room.phase !== 'hand' || !room.toAct) return false;
    const p = pl(room, room.toAct);
    if (p && !p.bot && !p.online) { action(room, p.id, { a: room.curBet > p.bet ? 'fold' : 'check' }); return true; }   // parti : il passe ou se couche
    if (p?.bot && now - room.turnAt > BOT_MS) { botAct(room, p); return true; }
    return false;
  }
  function join(room, id, name) {
    const p = pl(room, id);
    if (p) { p.online = true; p.name = name || p.name; return; }
    room.players.push({ id, name, online: true, bot: false, stack: 0, hole: [], folded: true, allin: false, bet: 0, total: 0, acted: false, out: true, outAt: 0, spectator: true });
  }
  function setOnline(room, id, on) { const p = pl(room, id); if (p) p.online = on; }

  function view(room, pid) {
    const me = pl(room, pid), show = room.phase === 'show' && room.result && !room.result.uncontested;
    const revealed = new Set(show ? room.result.hands.map(h => h.id) : []);
    const pot = room.players.reduce((a, p) => a + p.total, 0);
    const myTurn = room.phase === 'hand' && room.toAct === pid;
    return {
      phase: room.phase, hand: room.hand, sb: room.sb, bb: room.bb, isHost: pid === room.hostId, seq: room.seq, street: room.street,
      board: room.board, pot, curBet: room.curBet, toActId: room.toAct, toActName: pl(room, room.toAct)?.name || '', quiet: Date.now() - room.turnAt,
      players: room.players.filter(p => !p.spectator).map(p => ({ id: p.id, name: p.name, bot: p.bot, online: p.online, me: p.id === pid, stack: p.stack, bet: p.bet, folded: p.folded, allin: p.allin, out: p.out,
        dealer: p.id === room.dealerId, sb: p.id === room.sbId, bb: p.id === room.bbId, turn: p.id === room.toAct,
        hole: p.id === pid || revealed.has(p.id) ? p.hole : p.out || p.folded ? [] : [null, null], won: room.result?.won[p.id] || 0 })),
      me: me && !me.spectator ? { hole: me.hole, stack: me.stack, bet: me.bet, folded: me.folded, out: me.out, allin: me.allin, handName: me.hole.length && room.board.length ? HANDS[best(me.hole.concat(room.board)).score[0]] : '' } : null,
      myTurn, toCall: me ? Math.max(0, room.curBet - me.bet) : 0, minTo: room.curBet + room.minRaise, maxTo: me ? me.bet + me.stack : 0,
      result: room.phase === 'show' ? room.result : null, ranking: room.phase === 'over' ? ranking(room) : null, winnerName: room.winnerId ? pl(room, room.winnerId)?.name : null,
      log: room.log.slice(-4),
    };
  }
  return { HANDS, eval5, best, cmp, create, act, tick, join, setOnline, view, ranking };
})();

// ============================================================ écran
let pkRaise = null, pkLastHand = null;
const pkCard = (c, cls = '') => c ? `<div class="pk-card km-card ${cls}">${kmCardHTML(c)}</div>` : `<div class="pk-card back ${cls}"></div>`;

function renderPoker(v) {
  if (!v) return;
  const root = $('#pk-main'); root.innerHTML = '';
  if (v.hand !== pkLastHand) { pkLastHand = v.hand; pkRaise = null; }
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const me = v.me;

  root.appendChild(el('div', 'pk-head', `<span class="eyebrow">Main ${v.hand} · blindes ${v.sb} / ${v.bb}</span>${v.phase === 'hand' ? `<span class="pk-street">${{ preflop: 'Avant le flop', flop: 'Flop', turn: 'Turn', river: 'River' }[v.street]}</span>` : ''}`));

  // la table
  const ring = el('div', 'pk-ring');
  const list = v.players, n = list.length, meIdx = Math.max(0, list.findIndex(p => p.me));
  list.forEach((p, i) => {
    const k = (i - meIdx + n) % n, ang = Math.PI / 2 + k * 2 * Math.PI / n;
    const d = el('div', `pk-seat${p.turn ? ' turn' : ''}${p.folded ? ' folded' : ''}${p.out ? ' out' : ''}${p.me ? ' me' : ''}${p.won ? ' won' : ''}${p.online ? '' : ' off'}`,
      `<span class="pk-name">${p.bot ? '🤖 ' : ''}${esc(p.name)}</span><span class="pk-stack">${p.out ? 'éliminé' : p.stack + ' 🪙'}</span>`
      + (p.hole.length && !p.me ? `<span class="pk-hole">${p.hole.map(c => pkCard(c, 'mini')).join('')}</span>` : '')
      + (p.bet ? `<span class="pk-bet">${p.bet}</span>` : '') + (p.dealer ? '<span class="pk-btn">D</span>' : '')
      + (p.allin && !p.out ? '<span class="pk-tag">tapis</span>' : p.folded && !p.out ? '<span class="pk-tag">couché</span>' : '') + (p.won ? `<span class="pk-tag win">+${p.won}</span>` : ''));
    d.style.left = Math.min(84, Math.max(16, 50 + 40 * Math.cos(ang))).toFixed(2) + '%';
    d.style.top = (50 + 43 * Math.sin(ang)).toFixed(2) + '%';
    ring.appendChild(d);
  });
  const felt = el('div', 'pk-felt');
  const board = [...v.board]; while (board.length < 5) board.push(undefined);
  felt.innerHTML = `<div class="pk-board">${board.map(c => c ? pkCard(c) : '<div class="pk-card slot"></div>').join('')}</div><div class="pk-pot">Pot <b>${v.pot}</b></div>`;
  ring.appendChild(felt);
  root.appendChild(ring);

  // mes cartes et mes choix
  if (me && !me.out) {
    const mine = el('div', 'pk-mine' + (me.folded ? ' folded' : ''), `<div class="pk-myhole">${me.hole.map(c => pkCard(c, 'big')).join('')}</div><div class="pk-myinfo"><b>${me.stack} 🪙</b>${me.handName ? `<span>${esc(me.handName)}</span>` : ''}${me.folded ? '<span>couché</span>' : ''}</div>`);
    root.appendChild(mine);
  } else if (me?.out) root.appendChild(el('p', 'note', 'Tu n’as plus de jetons : tu regardes la fin de la partie.'));
  else root.appendChild(el('p', 'note', 'Une partie est en cours : tu regardes, tu joueras à la prochaine.'));

  if (v.phase === 'hand') {
    if (v.myTurn) {
      const bar = el('div', 'pk-actions');
      bar.appendChild(btn('ghost', 'Se coucher', () => act({ t: 'pk:act', a: 'fold' })));
      bar.appendChild(v.toCall ? btn('', `Suivre ${Math.min(v.toCall, me.stack)}`, () => act({ t: 'pk:act', a: 'call' })) : btn('', 'Parole', () => act({ t: 'pk:act', a: 'check' })));
      const canRaise = v.maxTo > v.curBet + v.toCall;
      if (canRaise) {
        const lo = Math.min(v.minTo, v.maxTo), hi = v.maxTo;
        if (pkRaise === null || pkRaise < lo || pkRaise > hi) pkRaise = lo;
        bar.appendChild(btn('primary', pkRaise >= hi ? `Tapis (${hi})` : `${v.curBet ? 'Relancer' : 'Miser'} à ${pkRaise}`, () => act({ t: 'pk:act', a: pkRaise >= hi ? 'allin' : 'raise', to: pkRaise })));
        root.appendChild(bar);
        const size = el('div', 'pk-size');
        const input = el('input'); input.type = 'range'; input.min = lo; input.max = hi; input.step = v.bb / 2 || 1; input.value = pkRaise;
        input.oninput = () => { pkRaise = +input.value; const b = bar.lastChild; b.textContent = pkRaise >= hi ? `Tapis (${hi})` : `${v.curBet ? 'Relancer' : 'Miser'} à ${pkRaise}`; };
        size.appendChild(input);
        const quick = el('div', 'pk-quick');
        [['Min', lo], ['½ pot', v.curBet + Math.round(v.pot / 2)], ['Pot', v.curBet + v.pot], ['Tapis', hi]].forEach(([l, x]) => quick.appendChild(btn('ghost small', l, () => { pkRaise = Math.max(lo, Math.min(hi, x)); renderPoker(view.pk); })));
        size.appendChild(quick);
        root.appendChild(size);
      } else root.appendChild(bar);
      root.appendChild(el('p', 'pk-hint', v.toCall ? `${v.toCall} pour suivre · pot ${v.pot}` : 'Personne n’a misé : tu peux parler ou miser.'));
    } else root.appendChild(el('p', 'pk-hint', `${esc(v.toActName)} réfléchit…`));
    if (v.isHost && !v.myTurn && v.quiet > 30000) { const cur = v.players.find(p => p.turn); if (cur && !cur.bot) root.appendChild(btn('ghost small', `${esc(cur.name)} ne joue pas ? Passer sa main`, () => act({ t: 'pk:skip' }))); }
    else if (v.isHost && !v.myTurn) setTimeout(() => { if (view?.pk?.hand === v.hand && view.pk.phase === 'hand') renderPoker(view.pk); }, Math.max(1000, 30200 - v.quiet));
  }

  if (v.phase === 'show' && v.result) {
    const r = v.result, box = el('div', 'pk-result');
    if (r.uncontested) box.innerHTML = `<p class="pk-result-big">${esc(Object.keys(r.won).map(id => v.players.find(p => p.id === id)?.name).join(', '))} ramasse ${r.total}</p><p class="fine">Tout le monde s’est couché.</p>`;
    else {
      box.innerHTML = '<p class="pk-result-big">Abattage</p>';
      r.hands.sort((a, b) => b.won - a.won).forEach(h => box.insertAdjacentHTML('beforeend', `<div class="pk-show${h.won ? ' win' : ''}"><span class="pk-show-name">${esc(h.name)}${h.won ? ` · +${h.won}` : ''}</span><span class="pk-show-cards">${h.hole.map(c => pkCard(c, 'mini')).join('')}</span><span class="pk-show-hand">${esc(h.hand)}</span></div>`));
    }
    root.appendChild(box);
    if (v.isHost) root.appendChild(btn('primary lg', 'Main suivante', () => act({ t: 'pk:next' })));
  }
  if (v.phase === 'over') {
    root.appendChild(el('div', 'pk-result', `<p class="pk-result-big">${esc(v.winnerName || '')} rafle tous les jetons</p><ol class="pk-ranking">${(v.ranking || []).map(r => `<li><span>${esc(r.name)}</span><b>${r.stack}</b></li>`).join('')}</ol>`));
    if (v.isHost) root.appendChild(btn('primary lg', 'Retour au salon', () => act({ t: 'restart' })));
  }
  const lg = el('ul', 'pk-log'); v.log.slice().reverse().forEach(t => lg.appendChild(el('li', '', esc(t)))); root.appendChild(lg);
}
